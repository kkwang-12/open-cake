'use strict';
const { scopedDocumentId } = require('./idempotency-model');
const { validateResource } = require('./resource-model');

// User-confirmed V1 policy. No DB, geocoding, coordinate conversion or resource writes.
const V1_FULFILLMENT_POLICY = Object.freeze({
  version:'v1-fulfillment-2026-10-03',timeZone:'Asia/Shanghai',openingMinute:480,closingMinute:1260,slotMinutes:30,capacityUnit:'ORDER',unitsPerOrder:1,
  capacities:Object.freeze({PICKUP:3,DELIVERY:1}),
  delivery:Object.freeze({operator:'STORE_SELF',radiusMeters:20000,boundaryIncluded:true,feeCents:0,windowNature:'ESTIMATED'})
});
const DISTANCE_ALGORITHM_VERSION='haversine-r6371000-v1';
const MINUTE=60000, DAY=86400000, OFFSET=8*60*MINUTE;
class FulfillmentModelError extends Error {
  constructor(code){super(code);this.name='FulfillmentModelError';this.code=code;}
}
function fail(code){throw new FulfillmentModelError(code);}
function plain(value){return value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));}
function text(value){return typeof value==='string'&&value.trim().length>0;}
function integer(value,positive=false){return Number.isSafeInteger(value)&&value>=(positive?1:0);}
function timestamp(value){return integer(value,true)&&Number.isFinite(new Date(value).getTime());}
function freeze(value){if(value!==null&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
function mode(value){if(typeof value!=='string'||!Object.prototype.hasOwnProperty.call(V1_FULFILLMENT_POLICY.capacities,value))fail('INVALID_FULFILLMENT');}
function localDateEpoch(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number(value.slice(0,4))<2000)fail('INVALID_SERVICE_DATE');
  const epoch=Date.parse(value+'T00:00:00Z');
  if(!Number.isFinite(epoch)||new Date(epoch).toISOString().slice(0,10)!==value)fail('INVALID_SERVICE_DATE');
  return epoch;
}
function localServiceDate(now,timeZone){
  if(timeZone!=='Asia/Shanghai')fail('TIME_ZONE_UNSUPPORTED');
  if(!timestamp(now)||!timestamp(now+OFFSET))fail('INVALID_APPOINTMENT_INPUT');
  const date=new Date(now+OFFSET).toISOString().slice(0,10);
  localDateEpoch(date);
  return date;
}
function maximumLeadTimeMinutes(minLeadTimeMinutes,productLeadTimes){
  if(!integer(minLeadTimeMinutes)||!Array.isArray(productLeadTimes)||!productLeadTimes.length)fail('CONFIGURATION_REQUIRED');
  let lead=minLeadTimeMinutes;
  for(const value of productLeadTimes){if(!integer(value))fail('CONFIGURATION_REQUIRED');lead=Math.max(lead,value);}
  if(!integer(lead*MINUTE))fail('INVALID_TIME_POLICY');
  return lead;
}
function windowRange(window){
  if(!plain(window)||!integer(window.startMinute)||!integer(window.endMinute,true)||window.startMinute>=1440||
      window.endMinute>1260||window.startMinute<480||window.startMinute>=window.endMinute||window.startMinute%30!==0||window.endMinute%30!==0)fail('INVALID_TIME_POLICY');
  return {startMinute:window.startMinute,endMinute:window.endMinute};
}
function noOverlap(windows){
  const sorted=windows.slice().sort((a,b)=>a.startMinute-b.startMinute);
  for(let i=1;i<sorted.length;i++)if(sorted[i].startMinute<sorted[i-1].endMinute)fail('INVALID_TIME_POLICY');
  return sorted;
}
function validateTimePolicy(policy){
  if(!plain(policy)||!text(policy.policyVersion)||policy.timeZone!=='Asia/Shanghai'||!integer(policy.minLeadTimeMinutes)||
      !integer(policy.maxAdvanceDays,true)||!integer(policy.maxAdvanceDays*DAY)||
      policy.crossDayStrategy!=='REJECT'||
      !Array.isArray(policy.weeklyWindows)||!Array.isArray(policy.dateOverrides))fail('CONFIGURATION_REQUIRED');
  const weekly=new Map(), overrides=new Map();
  for(const window of policy.weeklyWindows){
    if(!plain(window)||!integer(window.weekday,true)||window.weekday>7)fail('INVALID_TIME_POLICY');
    mode(window.fulfillment);
    const key=JSON.stringify([window.weekday,window.fulfillment]);
    weekly.set(key,[...(weekly.get(key)||[]),windowRange(window)]);
  }
  for(const [key,windows] of weekly)weekly.set(key,noOverlap(windows));
  for(const override of policy.dateOverrides){
    if(!plain(override)||typeof override.closed!=='boolean'||!Array.isArray(override.windows))fail('INVALID_TIME_POLICY');
    localDateEpoch(override.serviceDate);mode(override.fulfillment);
    const key=JSON.stringify([override.serviceDate,override.fulfillment]);
    if(overrides.has(key)||(override.closed?override.windows.length!==0:override.windows.length===0))fail('INVALID_TIME_POLICY');
    overrides.set(key,{closed:override.closed,windows:noOverlap(Array.from(override.windows,windowRange))});
  }
  return {weekly,overrides};
}
function buildSlotDefinitions(input){
  if(!plain(input)||!plain(input.store)||!text(input.store._id)||!text(input.environment)||!timestamp(input.now))fail('INVALID_APPOINTMENT_INPUT');
  if(input.store.status!=='OPEN')fail('STORE_UNAVAILABLE');
  if(input.store.timeZone!=='Asia/Shanghai')fail('TIME_ZONE_UNSUPPORTED');
  mode(input.fulfillment);
  const policy=input.timePolicy, schedules=validateTimePolicy(policy);
  if(policy.timeZone!==input.store.timeZone)fail('INVALID_TIME_POLICY');
  const dateEpoch=localDateEpoch(input.serviceDate), todayEpoch=localDateEpoch(localServiceDate(input.now,input.store.timeZone));
  if(dateEpoch<todayEpoch||dateEpoch-todayEpoch>policy.maxAdvanceDays*DAY)fail('APPOINTMENT_OUTSIDE_WINDOW');
  const lead=maximumLeadTimeMinutes(policy.minLeadTimeMinutes,input.productLeadTimes);
  const earliest=input.now+lead*MINUTE;
  if(!timestamp(earliest))fail('INVALID_TIME_POLICY');
  const weekday=(new Date(dateEpoch).getUTCDay()+6)%7+1;
  const override=schedules.overrides.get(JSON.stringify([input.serviceDate,input.fulfillment]));
  const windows=override?(override.closed?[]:override.windows):(schedules.weekly.get(JSON.stringify([weekday,input.fulfillment]))||[]);
  const slots=[];
  for(const window of windows){
    for(let minute=window.startMinute;minute+30<=window.endMinute;minute+=30){
      const startAt=dateEpoch-OFFSET+minute*MINUTE,endAt=startAt+30*MINUTE;
      // Positive payment window remains required; slots at the exact lead cutoff are no longer bookable.
      if(startAt<=earliest)continue;
      const _id=scopedDocumentId('slot',[input.environment,input.store._id,input.fulfillment,input.serviceDate,String(startAt),String(endAt)]);
      slots.push({_id,storeId:input.store._id,fulfillment:input.fulfillment,serviceDate:input.serviceDate,timeZone:input.store.timeZone,
        startAt,endAt,policyVersion:policy.policyVersion,capacityUnit:'ORDER',capacityTotal:V1_FULFILLMENT_POLICY.capacities[input.fulfillment],
        minLeadTimeMinutes:lead});
    }
  }
  return freeze(slots);
}
function resolveAppointment(input,slot){
  const definitions=buildSlotDefinitions(input);
  if(!plain(slot)||!text(slot._id))fail('SLOT_REQUIRED');
  const definition=definitions.find(value=>value._id===slot._id);
  if(!definition)fail('APPOINTMENT_UNAVAILABLE');
  for(const field of ['storeId','fulfillment','serviceDate','timeZone','startAt','endAt','policyVersion','capacityUnit','capacityTotal']) {
    if(slot[field]!==definition[field])fail('SLOT_DEFINITION_MISMATCH');
  }
  const available=validateResource('SLOT',slot);
  if(slot.status!=='OPEN'||available<1)fail('SLOT_FULL_OR_CLOSED');
  return freeze({appointmentSnapshot:{storeId:slot.storeId,slotId:slot._id,serviceDate:slot.serviceDate,timeZone:slot.timeZone,
    startAt:slot.startAt,endAt:slot.endAt,policyVersion:slot.policyVersion,minLeadTimeMinutes:definition.minLeadTimeMinutes},
    slotRequest:{resourceKind:'SLOT',resourceId:slot._id,quantity:1,expectedVersion:slot.version}});
}
function paymentDeadlineAt(now,paymentHoldMinutes,appointmentSnapshot){
  if(!timestamp(now)||!integer(paymentHoldMinutes,true)||!integer(paymentHoldMinutes*MINUTE)||!plain(appointmentSnapshot)||
      !timestamp(appointmentSnapshot.startAt)||!integer(appointmentSnapshot.minLeadTimeMinutes)||
      !integer(appointmentSnapshot.minLeadTimeMinutes*MINUTE))fail('CONFIGURATION_REQUIRED');
  const requested=now+paymentHoldMinutes*MINUTE;
  if(!timestamp(requested))fail('INVALID_APPOINTMENT_INPUT');
  const deadline=Math.min(requested,appointmentSnapshot.startAt-appointmentSnapshot.minLeadTimeMinutes*MINUTE);
  if(!timestamp(deadline)||deadline<=now)fail('APPOINTMENT_UNAVAILABLE');
  return deadline;
}
function validateLocation(location,now){
  if(!plain(location)||!timestamp(now)||typeof location.longitude!=='number'||!Number.isFinite(location.longitude)||
      location.longitude< -180||location.longitude>180||typeof location.latitude!=='number'||!Number.isFinite(location.latitude)||
      location.latitude< -90||location.latitude>90||!text(location.source)||!timestamp(location.verifiedAt)||location.verifiedAt>now)fail('LOCATION_REQUIRED');
  // Upstream trusted service must normalize/verify the coordinate system; never silently compare GCJ02 and WGS84.
  if(location.coordinateSystem!=='WGS84')fail('COORDINATE_SYSTEM_UNSUPPORTED');
}
function evaluateDeliveryRange(storeLocation,addressLocation,now){
  validateLocation(storeLocation,now);validateLocation(addressLocation,now);
  const radians=value=>value*Math.PI/180;
  const dLat=radians(addressLocation.latitude-storeLocation.latitude),dLon=radians(addressLocation.longitude-storeLocation.longitude);
  const a=Math.min(1,Math.max(0,Math.sin(dLat/2)**2+Math.cos(radians(storeLocation.latitude))*
    Math.cos(radians(addressLocation.latitude))*Math.sin(dLon/2)**2));
  const distanceMeters=6371000*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  // Only machine-scale numerical tolerance, not a business expansion of the 20 km boundary.
  if(distanceMeters>20000+6371000*Number.EPSILON*64)fail('DELIVERY_OUT_OF_RANGE');
  return Object.freeze({distanceMeters,radiusMeters:20000,boundaryIncluded:true,feeCents:0,
    coordinateSystem:'WGS84',distanceAlgorithmVersion:DISTANCE_ALGORITHM_VERSION,windowNature:'ESTIMATED',operator:'STORE_SELF'});
}
module.exports={V1_FULFILLMENT_POLICY,DISTANCE_ALGORITHM_VERSION,FulfillmentModelError,localServiceDate,
  maximumLeadTimeMinutes,buildSlotDefinitions,resolveAppointment,paymentDeadlineAt,evaluateDeliveryRange};
