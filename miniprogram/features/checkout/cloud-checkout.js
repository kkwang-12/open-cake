'use strict';
const {createClient}=require('../../services/cloud');
const {createError}=require('../../services/errors');
const {createLocalOperationId}=require('../../utils/local-operation');
const {normalizeContact}=require('../shared/contact-draft');
const format=value=>(value/100).toFixed(2).replace(/\.00$/,'');
const clone=value=>JSON.parse(JSON.stringify(value));
const id=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,256}$/.test(value);
const counter=value=>Number.isSafeInteger(value)&&value>=0;
const fail=code=>{const error=createError(code);error.code=code;throw error;};
function createCloudCheckoutClient(settings,source,platform=()=>typeof wx==='undefined'?null:wx,
  transport=createClient(settings,platform),addressClient=require('../addresses/address-client'),newId=createLocalOperationId){
  const prefix='jiajiale.cloud-quote.v1:'+settings.appId+':'+settings.stage+':'+(settings.cloudEnvironments?.[settings.stage]||'');
  function gate(){if(settings.mode!=='cloud'||settings.stage!=='development'||settings.checkout?.enabled!==true)fail('CLOUD_NOT_CONFIGURED');}
  function read(key){try{return platform().getStorageSync(key)||null;}catch(_){fail('LOCAL_PREVIEW_READ_FAILED');}}
  function save(key,value){try{platform().setStorageSync(key,clone(value));
    if(JSON.stringify(platform().getStorageSync(key))!==JSON.stringify(value))throw Error();}catch(_){fail('LOCAL_PREVIEW_WRITE_FAILED');}}
  async function current(){gate();const view=await source.reviewAll();
    if(view.scope!=='CLOUD_SELECTION_DRAFT'||!id(view.cartId)||!counter(view.revision)||!/^[a-f0-9]{16}$/.test(view.subjectHash||''))fail('INVALID_RESPONSE');
    return view;}
  function refs(view){return view.lines.filter(line=>line.canAdjust).map(line=>({lineId:line.lineId,lineVersion:line.lineVersion}));}
  async function prepare(revision){const view=await current();if(view.revision!==revision)fail('LOCAL_BAG_CONFLICT');
    const lines=refs(view);if(!lines.length)fail('LOCAL_PREVIEW_EMPTY');
    const selected={cartId:view.cartId,revision:view.revision,subjectHash:view.subjectHash,lines};save(prefix+':selection',selected);return selected;}
  async function get(){const view=await current(),selected=read(prefix+':selection');
    if(!selected)fail('LOCAL_PREVIEW_MISSING');
    if(selected.subjectHash!==view.subjectHash||selected.cartId!==view.cartId)fail('AUTH_REQUIRED');
    if(selected.revision!==view.revision||JSON.stringify(selected.lines)!==JSON.stringify(refs(view)))fail('LOCAL_SELECTION_CHANGED');
    const lines=view.lines.filter(line=>line.canAdjust),subtotal=lines.reduce((n,line)=>n+line.currentTotalCents,0);
    if(lines.some(line=>!counter(line.currentTotalCents))||!Number.isSafeInteger(subtotal)||subtotal<0)fail('INVALID_RESPONSE');
    return {...selected,cloudMode:true,scope:'CLOUD_QUOTE_PREVIEW',checkoutAllowed:false,lines,
      quantity:lines.reduce((n,line)=>n+line.quantity,0),subtotalCents:subtotal,subtotalLabel:format(subtotal)};}
  async function getStore(){gate();const {data}=await transport.call('store','get',{storeId:settings.cart.storeId});
    if(data.storeId!==settings.cart.storeId||data.status!=='OPEN'||data.timeZone!=='Asia/Shanghai'||!Array.isArray(data.fulfillmentModes))fail('INVALID_RESPONSE');
    return {...data,openingHours:'以可选时段为准'};}
  async function getAddresses(){const selected=await get(),book=await addressClient.list();
    if(book.subjectHash!==selected.subjectHash)fail('AUTH_REQUIRED');return book;}
  async function getSlots(fulfillment,serviceDate){const selected=await get();const {data}=await transport.call('store','slots.list',{
    storeId:settings.cart.storeId,fulfillment,serviceDate,productIds:[...new Set(selected.lines.map(line=>line.productId))]});
    if(data.storeId!==settings.cart.storeId||data.fulfillment!==fulfillment||data.serviceDate!==serviceDate||!Array.isArray(data.items))fail('INVALID_RESPONSE');
    if(data.items.some(row=>!id(row.slotId)||!Number.isSafeInteger(row.startAt)||!Number.isSafeInteger(row.endAt)||
      row.endAt-row.startAt!==1800000||typeof row.available!=='boolean'))fail('INVALID_RESPONSE');
    const after=await current();if(after.subjectHash!==selected.subjectHash||after.revision!==selected.revision)fail('LOCAL_SELECTION_CHANGED');
    return data.items.filter(row=>row.available).map(row=>({...row,label:new Date(row.startAt+28800000).toISOString().slice(11,16)+'–'+new Date(row.endAt+28800000).toISOString().slice(11,16)}));}
  async function createQuote({fulfillment,slot,contact,addressId}){
    const selected=await get();if(!slot||!id(slot.slotId)||slot.available!==true)fail('APPOINTMENT_UNAVAILABLE');
    const normalized=normalizeContact(contact),payload={cartId:selected.cartId,expectedCartVersion:selected.revision,
      lines:selected.lines.map(line=>({lineId:line.lineId,lineVersion:line.lineVersion})),fulfillment,contact:normalized,
      addressId:fulfillment==='DELIVERY'?addressId:null,slotId:slot.slotId,orderNote:''};
    if(fulfillment==='DELIVERY'){
      const book=await getAddresses(),address=book.addresses.find(row=>row.addressId===addressId);
      if(!address||address.receiverName!==normalized.name||address.phone!==normalized.phone)fail('LOCATION_REQUIRED');
    }
    const key=prefix+':pending:'+selected.subjectHash;let pending=read(key);
    if(pending&&JSON.stringify(pending.payload)!==JSON.stringify(payload))fail('BUSY');
    if(!pending){pending={payload,idempotencyKey:newId()};save(key,pending);}
    let data;
    try{({data}=await transport.call('checkout','quote.create',{...pending.payload,idempotencyKey:pending.idempotencyKey}));}
    catch(error){if(['INVALID_REQUEST','NOT_FOUND','VERSION_CONFLICT','IDEMPOTENCY_KEY_REUSED','QUOTE_CHANGED','QUOTE_EXPIRED',
      'LOCATION_REQUIRED','APPOINTMENT_UNAVAILABLE','RESOURCE_UNAVAILABLE','PRODUCT_UNAVAILABLE','CONFIGURATION_REQUIRED'].includes(error.code))save(key,null);throw error;}
    if(!id(data.quoteId)||data.scope!=='CLOUD_QUOTE'||data.checkoutAllowed!==false||data.capacityReserved!==false||data.stockReserved!==false||
      !counter(data.totalCents)||!counter(data.deliveryFeeCents)||!Array.isArray(data.items)||data.items.length!==selected.lines.length||
      !Number.isSafeInteger(data.expiresAt)||data.expiresAt<=Date.now()||data.fulfillment!==fulfillment||
      data.appointment?.startAt!==slot.startAt||data.appointment?.endAt!==slot.endAt)fail('INVALID_RESPONSE');
    // Quote DTO items identify the product/SKU/message, not the private cart line ID.
    const remaining=selected.lines.slice(),quotedLines=[];
    for(const item of data.items){
      const index=remaining.findIndex(line=>line.productId===item.productId&&line.skuId===item.skuId&&
        line.quantity===item.quantity&&(line.cakeMessage||'')===(item.cakeMessage||''));
      if(index<0||!counter(item.unitPriceCents)||!counter(item.lineTotalCents)||item.lineTotalCents!==item.unitPriceCents*item.quantity)fail('INVALID_RESPONSE');
      const [line]=remaining.splice(index,1);quotedLines.push({...line,name:item.productName,specLabel:item.skuDescription,
        priceLabel:format(item.unitPriceCents),totalLabel:format(item.lineTotalCents)});
    }
    const subtotal=data.items.reduce((n,item)=>n+item.lineTotalCents,0);
    if(!counter(subtotal)||subtotal+data.deliveryFeeCents!==data.totalCents)fail('INVALID_RESPONSE');
    const after=await current();if(after.subjectHash!==selected.subjectHash||after.cartId!==selected.cartId)fail('AUTH_REQUIRED');
    if(after.revision!==selected.revision)fail('LOCAL_SELECTION_CHANGED');save(key,null);
    return {...data,lines:quotedLines,totalLabel:format(data.totalCents),deliveryFeeLabel:format(data.deliveryFeeCents),
      expiresLabel:new Date(data.expiresAt+28800000).toISOString().slice(11,16),referenceImages:data.items.some(item=>item.productImage?.sourceKind==='DESIGN_PREVIEW')};
  }
  return {cloud:true,prepare,get,getStore,getAddresses,getSlots,createQuote,normalizeContact};
}
module.exports={createCloudCheckoutClient};
