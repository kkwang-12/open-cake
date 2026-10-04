'use strict';
// Internal offline calculation. Snapshots and verification adapters must come
// from trusted server loaders, never from request fields or client coordinates.
const {requireOwner}=require('./authorization-model');
const {snapshotAddress}=require('./address-model');
const {projectStoreInformation}=require('./store-fulfillment');
const {validateLocation,evaluateDeliveryRange,DISTANCE_ALGORITHM_VERSION,V1_FULFILLMENT_POLICY}=require('./fulfillment-model');
const {requestFingerprint,canonicalJSON}=require('./idempotency-model');
const counter=value=>Number.isSafeInteger(value)&&value>=0;
const text=value=>typeof value==='string'&&value.length>0&&value.length<=2048&&value===value.normalize('NFC').trim()&&value.isWellFormed()&&!/[\u0000-\u001f\u007f]/.test(value);
const plain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
function fail(code){throw Object.assign(new Error(code),{code});}
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
function locationFacts(location,now){
  validateLocation(location,now);if(!text(location.source))fail('LOCATION_REQUIRED');
  return freeze(Object.fromEntries(['longitude','latitude','coordinateSystem','source','verifiedAt'].map(field=>[field,location[field]])));
}
function activeRule(configuration,storeLocation,now){
  const rules=configuration.deliveryRules;
  if(!Array.isArray(rules)||!rules.length||rules.some(rule=>!plain(rule)||!text(rule.ruleId)||!counter(rule.ruleVersion)||!counter(rule.priority)||
    !['DRAFT','ACTIVE','RETIRED'].includes(rule.status))||new Set(rules.map(rule=>rule.ruleId)).size!==rules.length)fail('CONFIGURATION_REQUIRED');
  // V1 has one radius/flat rule; ambiguous active definitions are not picked arbitrarily.
  const active=rules.filter(rule=>rule.status==='ACTIVE');if(active.length!==1)fail('CONFIGURATION_REQUIRED');
  const rule=active[0],area=rule.area,fee=rule.feePolicy;
  if(rule.operator!=='STORE_SELF'||rule.windowNature!=='ESTIMATED'||rule.distanceAlgorithmVersion!==DISTANCE_ALGORITHM_VERSION||
    !plain(area)||area.kind!=='RADIUS'||area.radiusMeters!==20000||area.boundaryIncluded!==true||area.coordinateSystem!=='WGS84'||
    area.regionPaths!==null||area.vertices!==null||!plain(fee)||fee.kind!=='FLAT'||fee.baseFeeCents!==0||
    ['includedMeters','stepMeters','stepFeeCents','rounding'].some(field=>fee[field]!==null))fail('CONFIGURATION_REQUIRED');
  const center=locationFacts(area.center,now);
  if(canonicalJSON(center)!==canonicalJSON(storeLocation))fail('CONFIGURATION_REQUIRED');
  return freeze({ruleId:rule.ruleId,ruleVersion:rule.ruleVersion,priority:rule.priority,status:'ACTIVE',
    operator:rule.operator,windowNature:rule.windowNature,distanceAlgorithmVersion:rule.distanceAlgorithmVersion,
    area:{kind:'RADIUS',regionPaths:null,center,radiusMeters:20000,vertices:null,coordinateSystem:'WGS84',boundaryIncluded:true},
    feePolicy:{kind:'FLAT',baseFeeCents:0,includedMeters:null,stepMeters:null,stepFeeCents:null,rounding:null}});
}
function verified(location,entityKind,entityId,entityVersion,context){
  const binding=freeze({entityKind,entityId,entityVersion,locationFingerprint:requestFingerprint(location)});
  // source/verifiedAt alone are not a proof. The future adapter must check its
  // controlled verification record against this entity version and exact point.
  let accepted;try{accepted=context.verifyLocation(binding,location);}catch(_){fail('CONFIGURATION_REQUIRED');}
  if(accepted!==true)fail('LOCATION_REQUIRED');
  return binding;
}
function evaluateDeliveryInput(store,configuration,address,input,principal,context){
  requireOwner(principal,{ownerId:principal&&principal.subjectId});
  const fields=['storeId','expectedStoreVersion','expectedConfigVersion','addressId','expectedAddressVersion'];
  if(!plain(input)||Object.keys(input).length!==fields.length||fields.some(field=>!Object.prototype.hasOwnProperty.call(input,field))||
    !text(input.storeId)||!text(input.addressId)||!counter(input.expectedStoreVersion)||!counter(input.expectedConfigVersion)||!counter(input.expectedAddressVersion))fail('INVALID_REQUEST');
  const information=projectStoreInformation(store,configuration);
  if(input.storeId!==store._id)fail('NOT_FOUND');
  if(input.expectedStoreVersion!==store.version||input.expectedConfigVersion!==configuration.configVersion)fail('VERSION_CONFLICT');
  if(!information.fulfillmentModes.includes('DELIVERY'))fail('FULFILLMENT_UNAVAILABLE');
  if(!address||address._id!==input.addressId)fail('NOT_FOUND');
  const captured=snapshotAddress(address,principal,input.expectedAddressVersion);
  if(!plain(context)||!Number.isSafeInteger(context.now)||context.now<1||!Number.isFinite(new Date(context.now).getTime())||
    typeof context.verifyLocation!=='function')fail('CONFIGURATION_REQUIRED');
  if(configuration.publishedAt>context.now||address.updatedAt>context.now)fail('CONFIGURATION_REQUIRED');
  const center=locationFacts(store.location,context.now),destination=locationFacts(captured.addressSnapshot.location,context.now);
  const rule=activeRule(configuration,center,context.now);
  const storeBinding=verified(center,'STORE',store._id,store.version,context);
  const addressBinding=verified(destination,'ADDRESS',address._id,address.version,context);
  const range=evaluateDeliveryRange(center,destination,context.now);
  const addressFingerprint=requestFingerprint({addressVersion:captured.addressVersion,addressSnapshot:captured.addressSnapshot});
  const bindings=freeze({environment:principal.environment,ownerId:principal.subjectId,storeId:store._id,storeVersion:store.version,
    configId:configuration._id,configVersion:configuration.configVersion,policyVersion:V1_FULFILLMENT_POLICY.version,
    addressId:address._id,addressVersion:address.version,addressFingerprint,storeBinding,addressBinding,
    ruleId:rule.ruleId,ruleVersion:rule.ruleVersion,ruleFingerprint:requestFingerprint(rule)});
  return freeze({scope:'OFFLINE_DELIVERY_EVALUATION',evaluatedAt:context.now,evaluationFingerprint:requestFingerprint(bindings),bindings,
    addressSnapshot:captured.addressSnapshot,range,
    deliveryFacts:{ruleId:rule.ruleId,ruleVersion:rule.ruleVersion,feeCents:0,addressFingerprint},
    requiresEvaluationPersistence:true,requiresAppointmentValidation:true,checkoutAllowed:false});
}
module.exports={evaluateDeliveryInput};
