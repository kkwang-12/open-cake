'use strict';
// Offline proposal only. The caller must load consistent trusted snapshots and
// atomically persist the quote + idempotency result before returning success.
const {parseApiRequest}=require('./api-contract');
const {requireOwner}=require('./authorization-model');
const {resolveCheckoutSelection}=require('./checkout-selection');
const {resolveFulfillmentInput}=require('./store-fulfillment');
const {evaluateDeliveryInput}=require('./delivery-evaluation');
const {resolveAppointment}=require('./fulfillment-model');
const {resolveSku,aggregateStockRequirements,messageFingerprint}=require('./catalog-model');
const {validateResource}=require('./resource-model');
const {captureOrderFacts}=require('./order-facts');
const {TRADE_POLICY}=require('./trade-model');
const {scopedDocumentId,requestFingerprint,canonicalJSON,decideIdempotency}=require('./idempotency-model');
const integer=value=>Number.isSafeInteger(value)&&value>=0;
const timestamp=value=>Number.isSafeInteger(value)&&value>0&&Number.isFinite(new Date(value).getTime());
function fail(code){throw Object.assign(new Error(code),{code});}
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
function resolve(state,input,principal,context,quoteId){
  if(!state||!state.store||!state.configuration||!context||!timestamp(context.now))fail('CONFIGURATION_REQUIRED');
  const {store,configuration,cart,catalogs,slot,address,stocks}=state;
  if(configuration.publishedAt>context.now||configuration.tradePolicyVersion!==TRADE_POLICY.version||
    !Number.isSafeInteger(configuration.quoteTtlMinutes)||configuration.quoteTtlMinutes<1||
    !Number.isSafeInteger(configuration.quoteTtlMinutes*60000))fail('CONFIGURATION_REQUIRED');
  const fulfillment=resolveFulfillmentInput(store,configuration,{storeId:store._id,expectedStoreVersion:store.version,
    expectedConfigVersion:configuration.configVersion,fulfillment:input.fulfillment,contact:input.contact,addressId:input.addressId},principal,context);
  if(!cart||cart.storeId!==store._id)fail('NOT_FOUND');
  const selected=resolveCheckoutSelection(cart,{cartId:input.cartId,expectedVersion:input.expectedCartVersion,
    lines:input.lines.map(line=>({lineId:line.lineId,expectedLineVersion:line.lineVersion}))},principal,catalogs,context.limits);
  if(!slot||slot._id!==input.slotId)fail('APPOINTMENT_UNAVAILABLE');
  const demandLines=[],items=selected.lines.map(line=>{
    const cat=catalogs.find(entry=>entry.product._id===line.productId),product=cat.product;
    const sku=resolveSku(product,cat.skus,cat.skus.find(value=>value._id===line.skuId).selectedOptions,line.skuId);
    const sourceImage=Array.isArray(product.images)&&product.images[0];
    if(!sourceImage||sourceImage.sourceKind!=='REAL_PHOTO')fail('CONFIGURATION_REQUIRED');
    const image=freeze(Object.fromEntries(['assetId','storageRef','sourceKind','revision'].map(key=>[key,sourceImage[key]])));
    if(typeof context.verifyProductImage!=='function'||context.verifyProductImage(product._id,product.version,image)!==true)fail('CONFIGURATION_REQUIRED');
    demandLines.push({sku,quantity:line.quantity});
    return {lineId:line.lineId,productId:line.productId,skuId:line.skuId,productVersion:line.productVersion,skuVersion:line.skuVersion,
      categoryCode:product.categoryCode,productName:product.name,skuDescription:sku.description,selectedOptions:sku.selectedOptions,
      productImage:image,unitPriceCents:line.unitPriceCents,quantity:line.quantity,cakeMessage:line.cakeMessage};
  });
  const appointment=resolveAppointment({store,environment:principal.environment,fulfillment:input.fulfillment,now:context.now,
    serviceDate:slot.serviceDate,timePolicy:configuration.timePolicy,
    productLeadTimes:selected.lines.map(line=>catalogs.find(entry=>entry.product._id===line.productId).product.minLeadTimeMinutes)},slot);
  const demands=aggregateStockRequirements(demandLines);
  if(!Array.isArray(stocks)||stocks.some(resource=>!resource||resource.storeId!==store._id)||new Set(stocks.map(resource=>resource._id)).size!==stocks.length)fail('INVALID_RESOURCE');
  stocks.forEach(resource=>validateResource('STOCK',resource));
  const resourceVersions=demands.map(demand=>{
    const resource=stocks.find(value=>value._id===demand.resourceId);
    if(!resource||resource.status!=='OPEN'||validateResource('STOCK',resource)<demand.requiredUnits)fail('RESOURCE_UNAVAILABLE');
    return {resourceKind:'STOCK',resourceId:resource._id,version:resource.version,requiredUnits:demand.requiredUnits};
  });
  resourceVersions.push({resourceKind:'SLOT',resourceId:slot._id,version:slot.version,requiredUnits:1});
  let delivery=null,deliverySnapshot={feeCents:0};
  if(input.fulfillment==='DELIVERY'){
    delivery=evaluateDeliveryInput(store,configuration,address,{storeId:store._id,expectedStoreVersion:store.version,
      expectedConfigVersion:configuration.configVersion,addressId:input.addressId,expectedAddressVersion:address&&address.version},principal,context);
    // Proposed trace bound to this quote; not a persisted evaluation or auth token.
    deliverySnapshot={...delivery.deliveryFacts,evaluationId:scopedDocumentId('quote-delivery-evaluation',[principal.environment,quoteId,delivery.evaluationFingerprint])};
  }
  const orderNote=input.orderNote===undefined?'':input.orderNote.normalize('NFC').trim();
  if(typeof context.validateOrderNote!=='function'||context.validateOrderNote(orderNote)!==true)fail('CONFIGURATION_REQUIRED');
  const facts=captureOrderFacts({quoteId,tradePolicyVersion:TRADE_POLICY.version,fulfillment:input.fulfillment,orderNote,
    cartSelectionSnapshot:{cartId:selected.cartId,cartVersion:selected.cartVersion,selectedLines:selected.lines.map(line=>({lineId:line.lineId,
      lineVersion:line.lineVersion,quantity:line.quantity,messageFingerprint:messageFingerprint(line.cakeMessage)}))},
    storeSnapshot:{storeId:store._id,name:store.name,address:store.address,phone:store.phone,timeZone:store.timeZone,configVersion:configuration.configVersion},
    contactSnapshot:fulfillment.contact,addressSnapshot:delivery?delivery.addressSnapshot:null,
    appointmentSnapshot:appointment.appointmentSnapshot,deliverySnapshot,items});
  return {facts,resourceVersions,addressVersion:delivery?address.version:null,delivery};
}
function deadline(createdAt,configuration,appointment){
  const requested=createdAt+configuration.quoteTtlMinutes*60000;
  if(!timestamp(requested))fail('CONFIGURATION_REQUIRED');
  const expiresAt=Math.min(requested,appointment.startAt-appointment.minLeadTimeMinutes*60000);
  if(!timestamp(expiresAt)||expiresAt<=createdAt)fail('APPOINTMENT_UNAVAILABLE');return expiresAt;
}
function planQuoteCreation(state,event,principal,context){
  const parsed=parseApiRequest('checkout',event);
  if(parsed.contract.action!=='quote.create')fail('INVALID_REQUEST');
  requireOwner(principal,{ownerId:principal&&principal.subjectId});
  const input=parsed.payload,{idempotencyKey,...business}=input;
  if(input.orderNote!==undefined&&typeof input.orderNote!=='string')fail('INVALID_REQUEST');
  const request={environment:principal.environment,actorScope:principal.subjectId,command:'checkout.quote.create',key:idempotencyKey,requestFingerprint:requestFingerprint(business)};
  const decision=decideIdempotency(state&&state.receipt||null,request);
  if(decision.disposition!=='CREATE')return freeze({scope:'OFFLINE_QUOTE_PLAN',disposition:decision.disposition,decision,checkoutAllowed:false});
  const quoteId=scopedDocumentId('quote',[principal.environment,principal.subjectId,idempotencyKey]);
  const current=resolve(state,input,principal,context,quoteId);
  const quote={_id:quoteId,schemaVersion:1,version:0,createdAt:context.now,updatedAt:context.now,ownerId:principal.subjectId,storeId:state.store._id,
    facts:current.facts,resourceVersions:current.resourceVersions,addressVersion:current.addressVersion,
    expiresAt:deadline(context.now,state.configuration,current.facts.appointmentSnapshot),status:'ACTIVE',consumedOrderId:null};
  return freeze({scope:'OFFLINE_QUOTE_PLAN',disposition:'CREATE',proposedQuote:quote,deliveryEvaluation:current.delivery,
    idempotency:{...request,_id:decision._id},requiredEffects:current.delivery?['INSERT_QUOTE','SAVE_DELIVERY_EVALUATION_TRACE','SAVE_IDEMPOTENCY_RESULT']:['INSERT_QUOTE','SAVE_IDEMPOTENCY_RESULT'],
    requiresAtomicPersistence:true,capacityReserved:false,stockReserved:false,checkoutAllowed:false});
}
function revalidateQuote(quote,state,principal,context){
  requireOwner(principal,quote);
  if(!quote||quote.schemaVersion!==1||!integer(quote.version)||!timestamp(quote.createdAt)||!timestamp(quote.expiresAt)||quote.expiresAt<=quote.createdAt||
    !quote.facts||quote.facts.quoteId!==quote._id||!quote.facts.storeSnapshot||quote.storeId!==quote.facts.storeSnapshot.storeId)fail('QUOTE_CHANGED');
  try{if(canonicalJSON(captureOrderFacts(quote.facts))!==canonicalJSON(quote.facts))fail('QUOTE_CHANGED');}
  catch(_){fail('QUOTE_CHANGED');}
  if(!context||!timestamp(context.now)||quote.createdAt>context.now)fail('CONFIGURATION_REQUIRED');
  if(context.now>=quote.expiresAt)fail('QUOTE_EXPIRED');
  if(quote.status!=='ACTIVE'||quote.consumedOrderId!==null)fail('QUOTE_CHANGED');
  const facts=quote.facts;
  const input={cartId:facts.cartSelectionSnapshot.cartId,expectedCartVersion:facts.cartSelectionSnapshot.cartVersion,
    lines:facts.cartSelectionSnapshot.selectedLines.map(line=>({lineId:line.lineId,lineVersion:line.lineVersion})),
    fulfillment:facts.fulfillment,contact:facts.contactSnapshot,addressId:facts.addressSnapshot?facts.addressSnapshot.addressId:null,
    slotId:facts.appointmentSnapshot.slotId,orderNote:facts.orderNote};
  const current=resolve(state,input,principal,context,quote._id);
  if(canonicalJSON(current.facts)!==canonicalJSON(facts)||canonicalJSON(current.resourceVersions)!==canonicalJSON(quote.resourceVersions)||
    current.addressVersion!==quote.addressVersion||quote.expiresAt!==deadline(quote.createdAt,state.configuration,current.facts.appointmentSnapshot))fail('QUOTE_CHANGED');
  return freeze({scope:'OFFLINE_QUOTE_REVALIDATION',quoteId:quote._id,version:quote.version,requiresOrderTransaction:true,checkoutAllowed:false});
}
function projectQuotePreview(quote,state,principal,context){
  revalidateQuote(quote,state,principal,context);
  const facts=quote.facts,appointment=facts.appointmentSnapshot,address=facts.addressSnapshot;
  const copy=value=>JSON.parse(JSON.stringify(value));
  return freeze({scope:'OFFLINE_QUOTE_PREVIEW',quoteId:quote._id,version:quote.version,expiresAt:quote.expiresAt,status:quote.status,
    consumedOrderId:quote.consumedOrderId,fulfillment:facts.fulfillment,store:copy(facts.storeSnapshot),contact:copy(facts.contactSnapshot),
    address:address?Object.fromEntries(['receiverName','phone','province','city','district','detail'].map(key=>[key,address[key]])):null,
    appointment:{serviceDate:appointment.serviceDate,timeZone:appointment.timeZone,startAt:appointment.startAt,endAt:appointment.endAt,
      windowNature:facts.fulfillment==='DELIVERY'?'ESTIMATED':'PICKUP'},
    items:facts.items.map(item=>Object.fromEntries(['productId','skuId','productVersion','skuVersion','categoryCode','productName','skuDescription',
      'selectedOptions','productImage','unitPriceCents','quantity','cakeMessage','lineTotalCents'].map(key=>[key,copy(item[key])]))),
    orderNote:facts.orderNote,currency:facts.currency,subtotalCents:facts.subtotalCents,deliveryFeeCents:facts.deliveryFeeCents,
    totalCents:facts.totalCents,checkoutAllowed:false});
}
module.exports={planQuoteCreation,revalidateQuote,projectQuotePreview};
