// Client confirmation lifecycle for the future quote adapter. No network,
// storage, order creation, payment, or acceptance of offline quote previews.
const clone=value=>JSON.parse(JSON.stringify(value));
const {validText}=require('../shared/contact-draft');
const counter=value=>Number.isSafeInteger(value)&&value>=0;
const stamp=value=>Number.isSafeInteger(value)&&value>0&&Number.isFinite(new Date(value).getTime());
const text=value=>typeof value==='string'&&value.length>0&&validText(value);
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
function fail(){throw Object.assign(new Error('INVALID_CONFIRMATION'),{code:'INVALID_CONFIRMATION'});}
function normalizedContact(value){
  if(!value||!text(value.name)||!text(value.phone))fail();
  const contact={name:value.name.normalize('NFC').trim(),phone:value.phone.trim()};
  if(!contact.name||!contact.phone)fail();return contact;
}
function requestFacts(input,storeId){
  if(!input||!text(storeId)||!text(input.cartId)||!counter(input.expectedCartVersion)||!Array.isArray(input.lines)||!input.lines.length||
    input.lines.some(line=>!line||!text(line.lineId)||!counter(line.lineVersion))||new Set(input.lines.map(line=>line.lineId)).size!==input.lines.length||
    !['PICKUP','DELIVERY'].includes(input.fulfillment)||!text(input.slotId)||
    (input.fulfillment==='DELIVERY'?!text(input.addressId):input.addressId!=null)||
    (input.orderNote!==undefined&&typeof input.orderNote!=='string'))fail();
  return {storeId,cartId:input.cartId,expectedCartVersion:input.expectedCartVersion,
    lines:input.lines.map(line=>({lineId:line.lineId,lineVersion:line.lineVersion})),fulfillment:input.fulfillment,
    contact:normalizedContact(input.contact),addressId:input.fulfillment==='PICKUP'?null:input.addressId,slotId:input.slotId,
    orderNote:(input.orderNote||'').normalize('NFC').trim()};
}
function verifiedDTO(source,request,now){
  // Quote contract has no scope/internal evidence fields. OFFLINE_* is rejected.
  const fields=['quoteId','version','expiresAt','status','consumedOrderId','fulfillment','store','contact','address','appointment','items',
    'orderNote','currency','subtotalCents','deliveryFeeCents','totalCents'];
  if(!source||Object.keys(source).length!==fields.length||fields.some(key=>!Object.prototype.hasOwnProperty.call(source,key))||!text(source.quoteId)||
    !counter(source.version)||!stamp(source.expiresAt)||source.expiresAt<=now||source.status!=='ACTIVE'||source.consumedOrderId!==null||
    source.fulfillment!==request.fulfillment||!source.store||source.store.storeId!==request.storeId||
    JSON.stringify(normalizedContact(source.contact))!==JSON.stringify(request.contact)||source.orderNote!==request.orderNote||
    source.currency!=='CNY'||source.deliveryFeeCents!==0||!Number.isSafeInteger(source.totalCents)||source.totalCents<1||
    !Array.isArray(source.items)||!source.items.length)fail();
  const appointment=source.appointment;
  if(!appointment||appointment.timeZone!=='Asia/Shanghai'||!stamp(appointment.startAt)||!stamp(appointment.endAt)||
    appointment.startAt<=now||source.expiresAt>appointment.startAt||appointment.endAt-appointment.startAt!==1800000||typeof appointment.serviceDate!=='string'||
    new Date(appointment.startAt+8*3600000).toISOString().slice(0,10)!==appointment.serviceDate||
    (source.fulfillment==='PICKUP'?source.address!==null:!source.address||!text(source.address.detail)))fail();
  const localStart=new Date(appointment.startAt+8*3600000),localEnd=new Date(appointment.endAt+8*3600000);
  const startMinute=localStart.getUTCHours()*60+localStart.getUTCMinutes(),endMinute=localEnd.getUTCHours()*60+localEnd.getUTCMinutes();
  if(startMinute<480||endMinute>1260||startMinute%30!==0||localStart.getUTCSeconds()!==0||localStart.getUTCMilliseconds()!==0||
    localEnd.toISOString().slice(0,10)!==appointment.serviceDate)fail();
  let subtotal=0;
  for(const item of source.items){
    if(!item||!text(item.productName)||!text(item.skuDescription)||!Number.isSafeInteger(item.quantity)||item.quantity<1||
      !Number.isSafeInteger(item.unitPriceCents)||item.unitPriceCents<1||
      !Number.isSafeInteger(item.unitPriceCents*item.quantity)||item.lineTotalCents!==item.unitPriceCents*item.quantity||
      (item.cakeMessage!==null&&typeof item.cakeMessage!=='string'))fail();
    subtotal+=item.lineTotalCents;if(!Number.isSafeInteger(subtotal))fail();
  }
  if(source.subtotalCents!==subtotal||source.totalCents!==subtotal+source.deliveryFeeCents)fail();
  const pick=(value,keys)=>Object.fromEntries(keys.filter(key=>Object.prototype.hasOwnProperty.call(value,key)).map(key=>[key,clone(value[key])]));
  return {...pick(source,['quoteId','version','expiresAt','status','consumedOrderId','fulfillment','orderNote','currency','subtotalCents','deliveryFeeCents','totalCents']),
    store:pick(source.store,['storeId','name','address','phone','timeZone','configVersion']),contact:normalizedContact(source.contact),
    address:source.address?pick(source.address,['receiverName','phone','province','city','district','detail']):null,
    appointment:{...pick(appointment,['serviceDate','timeZone','startAt','endAt']),windowNature:source.fulfillment==='DELIVERY'?'ESTIMATED':'PICKUP'},
    items:source.items.map(item=>({...pick(item,['productId','skuId','productVersion','skuVersion','categoryCode','productName','skuDescription','unitPriceCents','quantity','cakeMessage','lineTotalCents']),
      selectedOptions:Array.isArray(item.selectedOptions)?item.selectedOptions.map(option=>pick(option,['groupCode','optionCode','label'])):[],
      productImage:item.productImage?pick(item.productImage,['assetId','storageRef','sourceKind','revision']):null}))};
}
function createConfirmationSession(){
  let generation=0,request=null,state={status:'EMPTY',quote:null,notice:'',checkoutAllowed:false};
  const view=()=>freeze(clone(state));
  function invalidate(){generation++;request=null;state={status:'EMPTY',quote:null,notice:'',checkoutAllowed:false};return view();}
  function begin(input,storeId,now){
    invalidate();if(!stamp(now))fail();request=freeze(requestFacts(input,storeId));
    state={status:'LOADING',quote:null,notice:'',checkoutAllowed:false};return freeze({ticket:generation,request:clone(request)});
  }
  function receive(ticket,response,now){
    if(ticket!==generation||!request||state.status!=='LOADING')return false;
    if(!stamp(now))fail();
    try{const quote=verifiedDTO(response,request,now);state={status:'READY',quote,notice:'',checkoutAllowed:false};}
    catch(_){state={status:'ERROR',quote:null,notice:'报价结果已变化，请重新核验。',checkoutAllowed:false};}
    return true;
  }
  function failed(ticket){
    if(ticket!==generation||!request||state.status!=='LOADING')return false;
    state={status:'ERROR',quote:null,notice:'报价读取失败，请重试。',checkoutAllowed:false};return true;
  }
  function current(now){
    if(!stamp(now))fail();
    if(state.quote&&now>=state.quote.expiresAt){generation++;request=null;state={status:'EXPIRED',quote:null,notice:'报价已过期，请重新核验。',checkoutAllowed:false};}
    return view();
  }
  return {begin,receive,failed,invalidate,current};
}
module.exports={createConfirmationSession};
