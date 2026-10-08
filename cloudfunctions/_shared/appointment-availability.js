'use strict';
// Trusted server snapshots only. Reading availability never reserves capacity.
const {projectStoreInformation}=require('./store-fulfillment');
const {resolveCheckoutSelection}=require('./checkout-selection');
const {buildSlotDefinitions,localServiceDate}=require('./fulfillment-model');
const {validateResource}=require('./resource-model');
const {requestFingerprint}=require('./idempotency-model');
const counter=value=>Number.isSafeInteger(value)&&value>=0;
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
function fail(code){throw Object.assign(new Error(code),{code});}
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
function dateAfter(date,days){
  const time=Date.parse(date+'T00:00:00Z')+days*86400000;
  if(!Number.isFinite(new Date(time).getTime()))fail('INVALID_TIME_POLICY');
  const result=new Date(time).toISOString().slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(result))fail('INVALID_TIME_POLICY');
  return result;
}
function timeLabel(time){return new Date(time+8*3600000).toISOString().slice(11,16);}
function readAppointmentAvailability(store,configuration,cart,catalogs,slots,input,principal,context){
  const keys=['storeId','expectedStoreVersion','expectedConfigVersion','fulfillment','serviceDate','selection'];
  if(!exact(input,keys)||typeof input.storeId!=='string'||!counter(input.expectedStoreVersion)||!counter(input.expectedConfigVersion)||
    !['PICKUP','DELIVERY'].includes(input.fulfillment))fail('INVALID_REQUEST');
  const information=projectStoreInformation(store,configuration);
  if(input.storeId!==store._id||!cart||cart.storeId!==store._id)fail('NOT_FOUND');
  if(input.expectedStoreVersion!==store.version||input.expectedConfigVersion!==configuration.configVersion)fail('VERSION_CONFLICT');
  if(!information.fulfillmentModes.includes(input.fulfillment))fail('FULFILLMENT_UNAVAILABLE');
  if(!context||!Number.isSafeInteger(context.now)||context.now<1||configuration.publishedAt>context.now)fail('CONFIGURATION_REQUIRED');
  const selected=resolveCheckoutSelection(cart,input.selection,principal,catalogs,context.limits);
  const productLeadTimes=selected.lines.map(line=>catalogs.find(entry=>entry.product._id===line.productId).product.minLeadTimeMinutes);
  const definitions=buildSlotDefinitions({store,environment:principal.environment,now:context.now,fulfillment:input.fulfillment,
    serviceDate:input.serviceDate,timePolicy:configuration.timePolicy,productLeadTimes});
  if(!Array.isArray(slots)||slots.some(slot=>!slot||slot.storeId!==store._id||slot.fulfillment!==input.fulfillment||slot.serviceDate!==input.serviceDate)||
    new Set(slots.map(slot=>slot._id)).size!==slots.length)fail('INVALID_RESOURCE');
  slots.forEach(slot=>validateResource('SLOT',slot));
  const rows=definitions.map(definition=>{
    const slot=slots.find(value=>value._id===definition._id);
    let status='UNVERIFIED',remainingOrders=null,slotVersion=null;
    if(slot){
      const fields=['storeId','fulfillment','serviceDate','timeZone','startAt','endAt','policyVersion','capacityUnit','capacityTotal'];
      if(fields.some(field=>slot[field]!==definition[field]))status='STALE';
      else{remainingOrders=validateResource('SLOT',slot);slotVersion=slot.version;status=slot.status==='CLOSED'?'CLOSED':remainingOrders===0?'FULL':'AVAILABLE';}
    }
    return {slotId:definition._id,slotVersion,startAt:definition.startAt,endAt:definition.endAt,
      label:timeLabel(definition.startAt)+'–'+timeLabel(definition.endAt),capacityTotal:definition.capacityTotal,
      remainingOrders,status,selectable:status==='AVAILABLE'};
  });
  const today=localServiceDate(context.now,store.timeZone);
  const bindings={environment:principal.environment,ownerId:principal.subjectId,storeId:store._id,storeVersion:store.version,
    configId:configuration._id,configVersion:configuration.configVersion,timePolicyFingerprint:requestFingerprint(configuration.timePolicy),
    fulfillment:input.fulfillment,serviceDate:input.serviceDate,selection:selected,productLeadTimes,
    availabilityFingerprint:requestFingerprint(rows),evaluatedAt:context.now};
  return freeze({scope:'OFFLINE_APPOINTMENT_AVAILABILITY',storeId:store._id,storeVersion:store.version,configVersion:configuration.configVersion,
    cartId:selected.cartId,cartVersion:selected.cartVersion,fulfillment:input.fulfillment,timeZone:store.timeZone,serviceDate:input.serviceDate,
    dateRange:{firstDate:today,lastDate:dateAfter(today,configuration.timePolicy.maxAdvanceDays)},evaluatedAt:context.now,
    inputFingerprint:requestFingerprint(bindings),slots:rows,windowNature:input.fulfillment==='DELIVERY'?'ESTIMATED':'PICKUP',
    capacityReserved:false,requiresCloudRevalidation:true,requiresDeliveryValidation:input.fulfillment==='DELIVERY',checkoutAllowed:false});
}
module.exports={readAppointmentAvailability};
