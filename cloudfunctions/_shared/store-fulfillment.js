'use strict';
const {requireOwner}=require('./authorization-model');
const {V1_FULFILLMENT_POLICY,validateTimePolicy}=require('./fulfillment-model');
const counter=value=>Number.isSafeInteger(value)&&value>=0;
const text=value=>typeof value==='string'&&value.length>0&&value===value.normalize('NFC').trim()&&value.isWellFormed()&&
  value.length<=2048&&!/[\u0000-\u001f\u007f]/.test(value);
const plain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
function fail(code){throw Object.assign(new Error(),{code});}
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
function validateStoreConfiguration(store,configuration){
  if(!plain(store)||!text(store._id)||!counter(store.version)||!text(store.name)||store.timeZone!=='Asia/Shanghai')fail('CONFIGURATION_REQUIRED');
  if(store.status!=='OPEN')fail('STORE_UNAVAILABLE');
  if(!text(store.address)||!text(store.phone)||!text(store.activeConfigId)||!plain(configuration)||
    configuration._id!==store.activeConfigId||configuration.storeId!==store._id||configuration.status!=='PUBLISHED'||
    !counter(configuration.configVersion)||!Number.isSafeInteger(configuration.publishedAt)||configuration.publishedAt<1||
    configuration.fulfillmentPolicyVersion!==V1_FULFILLMENT_POLICY.version||!Array.isArray(configuration.fulfillmentModes)||
    !configuration.fulfillmentModes.length||configuration.fulfillmentModes.some(mode=>!['PICKUP','DELIVERY'].includes(mode))||
    new Set(configuration.fulfillmentModes).size!==configuration.fulfillmentModes.length)fail('CONFIGURATION_REQUIRED');
  validateTimePolicy(configuration.timePolicy);
}
// Internal projection of a trusted published snapshot; no store.get handler.
function projectStoreInformation(store,configuration){
  validateStoreConfiguration(store,configuration);
  return freeze({storeId:store._id,name:store.name,address:store.address,phone:store.phone,timeZone:store.timeZone,
    fulfillmentModes:[...configuration.fulfillmentModes],policyVersion:V1_FULFILLMENT_POLICY.version,
    slotMinutes:V1_FULFILLMENT_POLICY.slotMinutes,delivery:{...V1_FULFILLMENT_POLICY.delivery},
    status:'OPEN'});
}
// X02 preflight only. X03-X05 must still validate address ownership/location,
// selected appointment, catalog, stock, and bind all versions into a Quote.
function resolveFulfillmentInput(store,configuration,input,principal,context){
  requireOwner(principal,{ownerId:principal&&principal.subjectId});
  validateStoreConfiguration(store,configuration);
  const keys=['storeId','expectedStoreVersion','expectedConfigVersion','fulfillment','contact','addressId'];
  if(!plain(input)||Object.keys(input).some(key=>!keys.includes(key))||input.storeId!==store._id||
    !counter(input.expectedStoreVersion)||!counter(input.expectedConfigVersion)||!['PICKUP','DELIVERY'].includes(input.fulfillment))fail('INVALID_REQUEST');
  if(input.expectedStoreVersion!==store.version||input.expectedConfigVersion!==configuration.configVersion)fail('VERSION_CONFLICT');
  if(!configuration.fulfillmentModes.includes(input.fulfillment))fail('FULFILLMENT_UNAVAILABLE');
  if(!plain(input.contact)||Object.keys(input.contact).length!==2||typeof input.contact.name!=='string'||typeof input.contact.phone!=='string')fail('INVALID_REQUEST');
  const contact={name:input.contact.name.normalize('NFC').trim(),phone:input.contact.phone.trim()};
  if(!text(contact.name)||!text(contact.phone))fail('INVALID_REQUEST');
  if(!plain(context)||typeof context.validatePhone!=='function')fail('CONFIGURATION_REQUIRED');
  if(context.validatePhone(contact.phone)!==true)fail('INVALID_REQUEST');
  if(input.fulfillment==='PICKUP'&&input.addressId!=null)fail('INVALID_REQUEST');
  if(input.fulfillment==='DELIVERY'&&!text(input.addressId))fail('LOCATION_REQUIRED');
  return freeze({storeId:store._id,storeVersion:store.version,configVersion:configuration.configVersion,
    fulfillment:input.fulfillment,contact,addressId:input.fulfillment==='PICKUP'?null:input.addressId,
    deliveryFeeCents:0,requiresAddressValidation:input.fulfillment==='DELIVERY',requiresAppointmentValidation:true,checkoutAllowed:false});
}
module.exports={projectStoreInformation,resolveFulfillmentInput};
