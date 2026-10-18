'use strict';
const {createClient}=require('./cloud');
const {createError}=require('./errors');
const {createCloudCatalogClient}=require('./catalog-cloud');
const {createSpecificationModel}=require('../utils/specification-model');
const {createLocalOperationId}=require('../utils/local-operation');
const API_VERSION='v1-api-2026-10-03',NORMALIZATION_VERSION='unicode-nfc-trim-codepoints-v1';
const MAX_LINES=100,MAX_BYTES=2*1024*1024;
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,256}$/.test(v);
const key=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{16,128}$/.test(v);
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const integer=(v,min=0)=>Number.isSafeInteger(v)&&v>=min;
const clone=v=>JSON.parse(JSON.stringify(v));
const fields=(value,allowed)=>plain(value)&&Object.keys(value).every(field=>allowed.includes(field));
function wellFormed(v){
  if(typeof v!=='string')return false;
  for(let i=0;i<v.length;i++){const c=v.charCodeAt(i);
    if(c>=0xD800&&c<=0xDBFF){const next=v.charCodeAt(++i);if(!(next>=0xDC00&&next<=0xDFFF))return false;}
    else if(c>=0xDC00&&c<=0xDFFF)return false;
  }return true;
}
const terminal=new Set(['INVALID_REQUEST','NOT_FOUND','VERSION_CONFLICT','IDEMPOTENCY_KEY_REUSED','PRODUCT_UNAVAILABLE','CONFIGURATION_REQUIRED']);
function fail(code){const error=createError(code);error.code=code;throw error;}
const formatCents=v=>(v/100).toFixed(2).replace(/\.00$/,'');
function createCloudBagClient(settings,platform=()=>typeof wx==='undefined'?null:wx,
  transport=createClient(settings,platform),readProduct,newId=createLocalOperationId){
  const catalog=createCloudCatalogClient(settings,transport,formatCents);
  const product=readProduct||catalog.get;
  const storagePrefix='jiajiale.cart-command-drafts.v1:'+settings.appId+':'+settings.stage+':'+
    (settings.cloudEnvironments&&settings.cloudEnvironments[settings.stage]||'')+':';
  function gate(){
    if(settings.mode!=='cloud'||settings.stage!=='development'||!settings.cart||settings.cart.enabled!==true)fail('CLOUD_NOT_CONFIGURED');
    if(!id(settings.cart.storeId)||!settings.catalog||settings.catalog.enabled!==true||settings.cart.storeId!==settings.catalog.storeId)
      fail('INVALID_CONFIGURATION');
  }
  function validate(value){
    if(!fields(value,['cartId','storeId','version','lines','scope','checkoutAllowed','apiVersion','subjectHash'])||
      value.apiVersion!==API_VERSION||!id(value.cartId)||value.storeId!==settings.cart.storeId||!integer(value.version)||
      value.scope!=='CLOUD_SELECTION_DRAFT'||value.checkoutAllowed!==false||!/^[a-f0-9]{16}$/.test(value.subjectHash||'')||
      !Array.isArray(value.lines)||value.lines.length>MAX_LINES||JSON.stringify(value).length>MAX_BYTES)fail('INVALID_RESPONSE');
    const ids=new Set();let quantity=0;
    for(const line of value.lines){
      if(!fields(line,['lineId','lineVersion','productId','skuId','quantity','cakeMessage','normalizationVersion','addedAt','updatedAt','display','availability'])||
        !id(line.lineId)||ids.has(line.lineId)||!integer(line.lineVersion)||!id(line.productId)||!id(line.skuId)||!integer(line.quantity,1)||
        !integer(line.addedAt,1)||!integer(line.updatedAt,line.addedAt)||line.normalizationVersion!==NORMALIZATION_VERSION||
        !(line.cakeMessage===null||(wellFormed(line.cakeMessage)&&line.cakeMessage===line.cakeMessage.normalize('NFC').trim()))||
        !['DRAFT_ONLY','UNAVAILABLE'].includes(line.availability)||(line.availability==='UNAVAILABLE')!==(line.display===null))fail('INVALID_RESPONSE');
      ids.add(line.lineId);quantity+=line.quantity;
      if(line.display){const d=line.display;
        if(!fields(d,['name','specLabel','selectedOptions','unitPriceCents','currency','productVersion','skuVersion','minQuantity','maxQuantity'])||
          !wellFormed(d.name)||!d.name.trim()||!wellFormed(d.specLabel)||!d.specLabel.trim()||!integer(d.unitPriceCents,1)||
          d.currency!=='CNY'||!integer(d.productVersion)||!integer(d.skuVersion)||!Array.isArray(d.selectedOptions)||
          d.selectedOptions.some(o=>!fields(o,['groupCode','optionCode','label'])||!id(o.groupCode)||!id(o.optionCode)||!wellFormed(o.label))||
          new Set(d.selectedOptions.map(o=>o.groupCode)).size!==d.selectedOptions.length||
          !((d.minQuantity===null&&d.maxQuantity===null)||(integer(d.minQuantity,1)&&integer(d.maxQuantity,d.minQuantity))))fail('INVALID_RESPONSE');
      }
    }
    if(!Number.isSafeInteger(quantity))fail('INVALID_RESPONSE');return clone(value);
  }
  function view(cart){
    const preview=settings.checkout?.enabled===true,eligible=cart.lines.filter(line=>line.display);
    const previewQuantity=preview?eligible.reduce((n,line)=>n+line.quantity,0):0;
    const previewSubtotal=preview?eligible.reduce((n,line)=>n+line.display.unitPriceCents*line.quantity,0):0;
    return {scope:cart.scope,subjectHash:cart.subjectHash,cartId:cart.cartId,checkoutAllowed:false,revision:cart.version,
      quantity:cart.lines.reduce((sum,line)=>sum+line.quantity,0),selectedQuantity:0,previewQuantity,
      subtotalCents:previewSubtotal,subtotalLabel:formatCents(previewSubtotal),allSelected:false,reviewed:true,
      lines:cart.lines.map(line=>{
        const d=line.display,total=d&&Number.isSafeInteger(d.unitPriceCents*line.quantity)?d.unitPriceCents*line.quantity:null;
        return {...line,name:d?d.name:'商品暂不可用',specLabel:d?d.specLabel:'',cakeMessage:line.cakeMessage||'',
          selectedOptions:d?d.selectedOptions:[],productVersion:d?d.productVersion:null,skuVersion:d?d.skuVersion:null,
          unitPriceCents:d?d.unitPriceCents:null,currentUnitPriceCents:d?d.unitPriceCents:null,currentTotalCents:total,
          priceLabel:d?formatCents(d.unitPriceCents):'—',currentPriceLabel:d?formatCents(d.unitPriceCents):'—',totalLabel:total===null?'—':formatCents(total),
          selected:false,canSelect:false,canAdjust:!!d,canAcceptChanges:false,requiresCloudValidation:true,checkoutAllowed:false,
          stockStatus:'UNKNOWN',reviewStatus:d?'DRAFT_ONLY':'PRODUCT_UNAVAILABLE',
          reviewNotice:d?'选购草稿，库存与经营配置待核验，暂未开放购买。':'商品暂不可用，可移除或重新选购。'};
      })};
  }
  async function get(){gate();const response=await transport.call('cart','get',{storeId:settings.cart.storeId});return validate(response&&response.data);}
  function pending(storage){
    const api=platform();if(!api||typeof api.getStorageSync!=='function'||typeof api.setStorageSync!=='function')fail('LOCAL_BAG_WRITE_FAILED');
    let value;try{value=api.getStorageSync(storage);}catch(_){fail('LOCAL_BAG_READ_FAILED');}
    if(value===''||value===null||value===undefined)return [];
    if(!Array.isArray(value)||value.length>1||value.some(e=>!fields(e,['action','signature','key','payload'])||
      !['add','update','remove'].includes(e.action)||typeof e.signature!=='string'||!key(e.key)||!plain(e.payload)||
      e.payload.idempotencyKey!==e.key))fail('LOCAL_BAG_INVALID');return clone(value);
  }
  function persist(storage,entries){
    try{const api=platform();api.setStorageSync(storage,clone(entries));
      if(JSON.stringify(api.getStorageSync(storage))!==JSON.stringify(entries))throw new Error();}
    catch(_){fail('LOCAL_BAG_WRITE_FAILED');}
  }
  function finish(storage,intent){const entries=pending(storage);persist(storage,entries.filter(e=>e.key!==intent.key));}
  async function mutate(action,signature,build,operationId){
    // A fresh native GET establishes the account before choosing its pending key.
    const before=await get(),storage=storagePrefix+before.subjectHash,entries=pending(storage);
    let intent=entries.find(e=>e.action===action&&e.signature===signature);
    if(!intent){
      if(entries.length)fail('BUSY');
      const payload=await build(before),commandKey=operationId||newId();if(!key(commandKey))fail('INVALID_LOCAL_SELECTION');
      intent={action,signature,key:commandKey,payload:{...payload,idempotencyKey:commandKey}};persist(storage,[intent]);
    }
    let response;
    try{response=await transport.call('cart',action,clone(intent.payload));}
    catch(error){if(terminal.has(error.code))finish(storage,intent);
      if(error.code==='VERSION_CONFLICT')fail('LOCAL_BAG_CONFLICT');
      if(error.code==='IDEMPOTENCY_KEY_REUSED')fail('LOCAL_OPERATION_REUSED');throw error;}
    const after=validate(response&&response.data);
    if(after.subjectHash!==before.subjectHash||after.cartId!==before.cartId)fail('INVALID_RESPONSE');
    // GET after an unknown outcome may advance the revision. The stored payload
    // is still resent verbatim; the server receipt reprojects the current cart.
    finish(storage,intent);return view(after);
  }
  async function add(input){
    gate();if(!plain(input)||!id(input.productId)||!id(input.skuId)||!integer(input.productVersion)||!integer(input.skuVersion)||
      !integer(input.unitPriceCents,1)||!integer(input.quantity,1)||!Number.isSafeInteger(input.quantity*input.unitPriceCents)||
      !wellFormed(input.cakeMessage)||input.cakeMessage.length>65536||!Array.isArray(input.selectedOptions)||
      input.selectedOptions.some(o=>!plain(o)||!id(o.groupCode)||!id(o.optionCode))||
      new Set(input.selectedOptions.map(o=>o.groupCode)).size!==input.selectedOptions.length||
      (input.operationId!==undefined&&!key(input.operationId)))fail('INVALID_LOCAL_SELECTION');
    input=clone(input);input.cakeMessage=input.cakeMessage.normalize('NFC').trim();
    const options=input.selectedOptions.map(({groupCode,optionCode})=>({groupCode,optionCode})).sort((a,b)=>a.groupCode.localeCompare(b.groupCode));
    const signature=JSON.stringify([input.productId,input.productVersion,input.skuId,input.skuVersion,input.unitPriceCents,input.quantity,input.cakeMessage,options]);
    const cart=await mutate('add',signature,async before=>{
      const page=await product(input.productId),configuration=page&&page.configuration;
      if(!configuration||page.canPurchase!==false||page.canConfigure!==true||page.source!=='PUBLIC_CATALOG')fail('LOCAL_SELECTION_CHANGED');
      const state=createSpecificationModel(configuration).evaluate(options),sku=state.matchedSku;
      if(!sku||sku.skuId!==input.skuId||sku.version!==input.skuVersion||configuration.version!==input.productVersion||sku.unitPriceCents!==input.unitPriceCents)
        fail('LOCAL_SELECTION_CHANGED');
      if(state.messageSupport!=='ENABLED'&&input.cakeMessage)fail('INVALID_MESSAGE');
      if(state.messagePolicy&&Array.from(input.cakeMessage).length>state.messagePolicy.maxLength)fail('INVALID_MESSAGE');
      if((sku.minQuantity!==null&&input.quantity<sku.minQuantity)||(sku.maxQuantity!==null&&input.quantity>sku.maxQuantity))fail('INVALID_QUANTITY');
      return {storeId:settings.cart.storeId,cartId:before.cartId,expectedVersion:before.version,productId:input.productId,skuId:input.skuId,
        selectedOptions:options,quantity:input.quantity,cakeMessage:input.cakeMessage};
    },input.operationId);
    // A replay may reproject an empty/unavailable cart. Never invent the old line.
    const line=cart.lines.find(l=>l.productId===input.productId&&l.skuId===input.skuId&&l.cakeMessage===input.cakeMessage);
    if(!line)fail('LOCAL_LINE_UNAVAILABLE');return {line,addedQuantity:input.quantity};
  }
  const checkRevision=(cart,revision)=>{if(revision!==undefined&&cart.version!==revision)fail('LOCAL_BAG_CONFLICT');};
  async function updateQuantity(lineId,quantity,revision){
    gate();if(!id(lineId)||!integer(quantity,1))fail('INVALID_QUANTITY');
    return mutate('update',JSON.stringify([lineId,quantity]),async before=>{
      checkRevision(before,revision);const line=before.lines.find(l=>l.lineId===lineId);if(!line||!line.display)fail('LOCAL_LINE_UNAVAILABLE');
      const d=line.display;if(!Number.isSafeInteger(quantity*d.unitPriceCents)||(d.minQuantity!==null&&quantity<d.minQuantity)||
        (d.maxQuantity!==null&&quantity>d.maxQuantity))fail('INVALID_QUANTITY');
      return {cartId:before.cartId,expectedVersion:before.version,lineId,expectedLineVersion:line.lineVersion,
        skuId:line.skuId,selectedOptions:d.selectedOptions.map(({groupCode,optionCode})=>({groupCode,optionCode})),quantity};
    });
  }
  async function remove(lineId,revision){
    gate();if(!id(lineId))fail('LOCAL_LINE_UNAVAILABLE');
    return mutate('remove',JSON.stringify([lineId]),async before=>{
      checkRevision(before,revision);const line=before.lines.find(l=>l.lineId===lineId);if(!line)fail('LOCAL_LINE_UNAVAILABLE');
      return {cartId:before.cartId,expectedVersion:before.version,lineId,expectedLineVersion:line.lineVersion};
    });
  }
  const list=async()=>view(await get()),closed=()=>{fail('CONFIGURATION_REQUIRED');};
  async function review(){
    let cart=await get();const storage=storagePrefix+cart.subjectHash,entries=pending(storage);
    const intent=entries[0];
    // Once the cart advanced, this old expectedVersion can only replay a receipt
    // or be rejected. Confirm it on refresh even when a deleted line is gone,
    // without turning a read into a new draft write or inventing a fresh key.
    if(intent&&integer(intent.payload.expectedVersion)&&cart.version>intent.payload.expectedVersion){
      let response;
      try{response=await transport.call('cart',intent.action,clone(intent.payload));}
      catch(error){if(terminal.has(error.code)){finish(storage,intent);return view(cart);}throw error;}
      const current=validate(response&&response.data);
      if(current.subjectHash!==cart.subjectHash||current.cartId!==cart.cartId||current.version<cart.version)fail('INVALID_RESPONSE');
      finish(storage,intent);cart=current;
    }
    return view(cart);
  }
  return {add,list,remove,updateQuantity,review,reviewAll:review,select:closed,selectReviewed:closed,acceptChanges:closed};
}
module.exports={createCloudBagClient};
