'use strict';
// Shared trusted-resource evidence for pickup and delivery; no live writes.
const {scopedDocumentId}=require('./idempotency-model');
const {validateResource}=require('./resource-model');
function fail(code){throw Object.assign(new Error(code),{code});}
const counter=value=>Number.isSafeInteger(value)&&value>=0;
const time=value=>counter(value)&&value>0&&Number.isFinite(new Date(value).getTime());
const text=value=>typeof value==='string'&&value.trim()===value&&value.length>0&&value.length<=256;
const dense=value=>Array.isArray(value)&&Object.keys(value).length===value.length&&value.every(r=>r&&typeof r==='object');
function validateFulfillmentResources(order,state,{environment,now}){
  const quote=state&&state.quote;
  if(!text(environment)||!time(now)||!['PICKUP','DELIVERY'].includes(order.fulfillment)||
      !quote||quote.schemaVersion!==1||!counter(quote.version)||quote._id!==order.quoteId||
      quote.status!=='CONSUMED'||quote.consumedOrderId!==order._id||quote.ownerId!==order.ownerId||
      quote.storeId!==order.storeId||quote.facts?.fulfillment!==order.fulfillment||
      !dense(quote.resourceVersions)||!dense(state.reservations)||!dense(state.resources)||
      quote.resourceVersions.length!==state.reservations.length||state.resources.length!==state.reservations.length)
    fail('INVALID_FULFILLMENT_RESOURCES');
  const seen=new Set();let slots=0,stocks=0;
  for(const expected of quote.resourceVersions){
    if(!['STOCK','SLOT'].includes(expected.resourceKind)||!text(expected.resourceId)||
        !counter(expected.requiredUnits)||expected.requiredUnits<1)fail('INVALID_FULFILLMENT_RESOURCES');
    const id=scopedDocumentId('reservation',[environment,order._id,expected.resourceKind,expected.resourceId]);
    const reservation=state.reservations.find(r=>r._id===id);
    const entry=state.resources.find(r=>r.resourceKind===expected.resourceKind&&r.resource?._id===expected.resourceId);
    if(seen.has(id)||!reservation||!entry)fail('INVALID_FULFILLMENT_RESOURCES');seen.add(id);
    const resource=entry.resource;validateResource(expected.resourceKind,resource);
    const stock=expected.resourceKind==='STOCK';if(stock)stocks++;else slots++;
    if(resource.storeId!==order.storeId||reservation.storeId!==order.storeId||reservation.orderId!==order._id||
        reservation.resourceKind!==expected.resourceKind||reservation.resourceId!==expected.resourceId||
        reservation.schemaVersion!==1||!counter(reservation.version)||!time(reservation.createdAt)||
        !time(reservation.updatedAt)||reservation.createdAt<order.createdAt||reservation.updatedAt<reservation.createdAt||
        reservation.updatedAt>now||reservation.expiresAt!==order.paymentDeadlineAt||
        reservation.quantity!==expected.requiredUnits||reservation.status!==(stock?'CONSUMED':'CONFIRMED')||
        (stock?resource.consumedUnits:resource.confirmedUnits)<reservation.quantity||
        (stock?!time(reservation.resolvedAt)||reservation.resolvedAt>reservation.updatedAt||
          reservation.resolvedAt<reservation.createdAt||!text(reservation.resolutionLogId):
          reservation.resolvedAt!==null||reservation.resolutionLogId!==null))fail('INVALID_FULFILLMENT_RESOURCES');
    if(!stock&&(reservation.quantity!==1||resource.fulfillment!==order.fulfillment||
        resource._id!==quote.facts.appointmentSnapshot?.slotId||resource._id!==order.appointmentSnapshot?.slotId))
      fail('INVALID_FULFILLMENT_RESOURCES');
  }
  if(slots!==1||stocks<1)fail('INVALID_FULFILLMENT_RESOURCES');
  return true;
}
function planRetainedFulfillment(order,state,context,policy){
  if(!policy||!text(policy.version)||policy.slotCompletion!=='KEEP_CONFIRMED')fail('CONFIGURATION_REQUIRED');
  validateFulfillmentResources(order,state,context);
  // Explicit test strategy only. Formal completion SLOT policy remains undecided.
  return Object.freeze({slotCompletion:policy.slotCompletion,resourceChanges:Object.freeze([]),reservationChanges:Object.freeze([])});
}
module.exports={validateFulfillmentResources,planRetainedFulfillment};
