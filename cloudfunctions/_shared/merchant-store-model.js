'use strict';
// A05 plans over a complete, trusted, environment-scoped snapshot. No SDK or seed publication.
const {V1_FULFILLMENT_POLICY:V1,validateTimePolicy,validateLocation,buildSlotDefinitions,DISTANCE_ALGORITHM_VERSION}=require('./fulfillment-model');
const {projectStoreInformation}=require('./store-fulfillment');
const {validateResource}=require('./resource-model');
const {canonicalJSON,scopedDocumentId}=require('./idempotency-model');
const fail=code=>{throw Object.assign(new Error(code),{code});};
const copy=value=>JSON.parse(canonicalJSON(value));
const counter=value=>Number.isSafeInteger(value)&&value>=0;
const positive=value=>counter(value)&&value>0;
const time=value=>positive(value)&&Number.isFinite(new Date(value).getTime());
const text=value=>typeof value==='string'&&value.length>0&&value.length<=2048&&value===value.normalize('NFC').trim()&&value.isWellFormed()&&!/[\u0000-\u001f\u007f]/.test(value);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const dense=value=>Array.isArray(value)&&Object.keys(value).length===value.length;
const exact=(value,fields)=>plain(value)&&Object.keys(value).sort().join(',')===[...fields].sort().join(',');
const fields=['fulfillmentModes','timePolicy','deliveryRules','cartLimits','quoteTtlMinutes','paymentHoldMinutes','slotPolicy','tradePolicyVersion','fulfillmentPolicyVersion'];
const baseFields=['_id','schemaVersion','version','createdAt','updatedAt'];
const storeFields=['name','address','phone','timeZone','location','status','activeConfigId'];
const slotFields=['storeId','fulfillment','serviceDate','timeZone','startAt','endAt','policyVersion','capacityUnit','capacityTotal','status','heldUnits','confirmedUnits','consumedUnits'];
const pick=(record,names)=>Object.fromEntries(names.map(field=>[field,copy(record[field])]));
function base(record,at){if(!plain(record)||!text(record._id)||record._id.length>256||record.schemaVersion!==1||!counter(record.version)||
  !time(record.createdAt)||!time(record.updatedAt)||record.createdAt>record.updatedAt||record.updatedAt>at)fail('INVALID_STORE_STATE');}
function location(value,at){if(!exact(value,['longitude','latitude','coordinateSystem','source','verifiedAt']))fail('LOCATION_REQUIRED');validateLocation(value,at);}
function validateDraft(draft,at,complete=false){
  if(!exact(draft,fields)||!dense(draft.fulfillmentModes)||draft.fulfillmentModes.length!==2||
    !['PICKUP','DELIVERY'].every(mode=>draft.fulfillmentModes.includes(mode))||
    draft.tradePolicyVersion!=='v1-2026-10-03'||draft.fulfillmentPolicyVersion!==V1.version)fail('INVALID_CONFIG_DRAFT');
  for(const name of ['quoteTtlMinutes','paymentHoldMinutes'])if(draft[name]!==null&&(!positive(draft[name])||!counter(draft[name]*60000)||
    !time(at+draft[name]*60000)))fail('INVALID_CONFIG_DRAFT');
  if(draft.cartLimits!==null&&(!exact(draft.cartLimits,['maxLines','maxQuantityPerLine','maxOrderNoteLength'])||
    Object.values(draft.cartLimits).some(value=>!positive(value))))fail('INVALID_CONFIG_DRAFT');
  if(draft.slotPolicy!==null&&(!exact(draft.slotPolicy,['unit','unitsPerOrder','capacityPerSlot','slotMinutes','releasePolicyVersion'])||
    draft.slotPolicy.unit!=='ORDER'||draft.slotPolicy.unitsPerOrder!==1||draft.slotPolicy.slotMinutes!==30||
    !exact(draft.slotPolicy.capacityPerSlot,['PICKUP','DELIVERY'])||draft.slotPolicy.capacityPerSlot.PICKUP!==3||
    draft.slotPolicy.capacityPerSlot.DELIVERY!==1||!text(draft.slotPolicy.releasePolicyVersion)))fail('INVALID_CONFIG_DRAFT');
  if(draft.timePolicy!==null){
    const policy=draft.timePolicy;
    if(!exact(policy,['policyVersion','timeZone','minLeadTimeMinutes','maxAdvanceDays','crossDayStrategy','weeklyWindows','dateOverrides'])||
      !dense(policy.weeklyWindows)||!dense(policy.dateOverrides)||policy.weeklyWindows.some(window=>!exact(window,['weekday','fulfillment','startMinute','endMinute']))||
      policy.dateOverrides.some(override=>!exact(override,['serviceDate','fulfillment','closed','windows'])||!dense(override.windows)||
        override.windows.some(window=>!exact(window,['startMinute','endMinute']))))fail('INVALID_CONFIG_DRAFT');
    validateTimePolicy(policy);
    const horizon=at+28800000+policy.maxAdvanceDays*86400000;
    if(!counter(policy.minLeadTimeMinutes*60000)||!time(at+policy.minLeadTimeMinutes*60000)||!time(horizon)||
      !/^\d{4}-\d{2}-\d{2}T/.test(new Date(horizon).toISOString()))fail('INVALID_CONFIG_DRAFT');
    // User-confirmed normal hours remain daily 08:00-21:00 for both modes. Explicit date overrides allow temporary closures.
    if(policy.weeklyWindows.length!==14||policy.weeklyWindows.some(window=>window.startMinute!==480||window.endMinute!==1260))fail('INVALID_CONFIG_DRAFT');
  }
  if(!dense(draft.deliveryRules)||draft.deliveryRules.length>1)fail('INVALID_CONFIG_DRAFT');
  for(const rule of draft.deliveryRules){
    if(!exact(rule,['ruleId','ruleVersion','priority','status','operator','windowNature','distanceAlgorithmVersion','area','feePolicy'])||
      !text(rule.ruleId)||!counter(rule.ruleVersion)||rule.priority!==0||rule.status!=='ACTIVE'||rule.operator!=='STORE_SELF'||
      rule.windowNature!=='ESTIMATED'||rule.distanceAlgorithmVersion!==DISTANCE_ALGORITHM_VERSION||
      !exact(rule.area,['kind','regionPaths','center','radiusMeters','vertices','coordinateSystem','boundaryIncluded'])||
      rule.area.kind!=='RADIUS'||rule.area.regionPaths!==null||rule.area.radiusMeters!==20000||rule.area.vertices!==null||
      rule.area.coordinateSystem!=='WGS84'||rule.area.boundaryIncluded!==true||
      !exact(rule.feePolicy,['kind','baseFeeCents','includedMeters','stepMeters','stepFeeCents','rounding'])||rule.feePolicy.kind!=='FLAT'||rule.feePolicy.baseFeeCents!==0||
      ['includedMeters','stepMeters','stepFeeCents','rounding'].some(field=>rule.feePolicy[field]!==null))fail('INVALID_CONFIG_DRAFT');
    location(rule.area.center,at);
  }
  if(complete&&(draft.timePolicy===null||draft.cartLimits===null||draft.slotPolicy===null||draft.quoteTtlMinutes===null||
    draft.paymentHoldMinutes===null||draft.deliveryRules.length!==1))fail('CONFIGURATION_REQUIRED');
}
function draftOf(config){return pick(config,fields);}
function validateStoreState(state,storeId,context,at){
  if(!time(at)||!state||state.complete!==true||state.environment!==context.environment||state.appId!==context.appId||state.storeId!==storeId||
    !dense(state.configs)||!dense(state.slots))fail('INVALID_STORE_STATE');
  const store=state.store;base(store,at);
  if(store._id!==storeId||!text(store.name)||store.timeZone!=='Asia/Shanghai'||!['DRAFT','OPEN','CLOSED','ARCHIVED'].includes(store.status)||
    ['address','phone','activeConfigId'].some(field=>store[field]!==null&&!text(store[field])))fail('INVALID_STORE_STATE');
  if(store.location!==null)location(store.location,at);
  const sequences=new Set(),ids=new Set(),policies=new Map();
  for(const config of state.configs){
    base(config,at);if(config.storeId!==storeId||!counter(config.configVersion)||sequences.has(config.configVersion)||ids.has(config._id)||
      !['DRAFT','PUBLISHED','RETIRED'].includes(config.status)||
      (config.status==='DRAFT'?config.publishedAt!==null:!time(config.publishedAt)||config.publishedAt>config.updatedAt))fail('INVALID_STORE_STATE');
    ids.add(config._id);sequences.add(config.configVersion);validateDraft(draftOf(config),at,config.status!=='DRAFT');
    if(config.status!=='DRAFT'){
      const policy=config.timePolicy,old=policies.get(policy.policyVersion);
      if(old&&canonicalJSON(old)!==canonicalJSON(policy))fail('POLICY_VERSION_CONFLICT');policies.set(policy.policyVersion,policy);
    }
  }
  if(store.activeConfigId!==null&&!state.configs.some(config=>config._id===store.activeConfigId&&config.status==='PUBLISHED'))fail('INVALID_STORE_STATE');
  if(store.status==='OPEN')validatePublication(store,state.configs.find(config=>config._id===store.activeConfigId),at);
  const slotIds=new Set();
  for(const slot of state.slots){
    base(slot,at);validateResource('SLOT',slot);
    if(slot.storeId!==storeId||slotIds.has(slot._id)||!['PICKUP','DELIVERY'].includes(slot.fulfillment)||slot.timeZone!=='Asia/Shanghai'||
      !time(slot.startAt)||!time(slot.endAt)||slot.endAt-slot.startAt!==1800000||slot.capacityUnit!=='ORDER'||
      slot.capacityTotal!==V1.capacities[slot.fulfillment]||!policies.has(slot.policyVersion))fail('INVALID_STORE_STATE');
    const policy=policies.get(slot.policyVersion);
    // Check original deterministic identity/window without applying today's lead/advance cutoff.
    const definition=buildSlotDefinitions({store:{...store,status:'OPEN'},environment:context.environment,now:slot.startAt-1,
      fulfillment:slot.fulfillment,serviceDate:slot.serviceDate,timePolicy:{...policy,minLeadTimeMinutes:0},productLeadTimes:[0]}).find(row=>row._id===slot._id);
    if(!definition||['startAt','endAt','serviceDate'].some(field=>definition[field]!==slot[field]))fail('INVALID_STORE_STATE');slotIds.add(slot._id);
  }
}
function validatePublication(store,config,at){
  if(!config)fail('CONFIGURATION_REQUIRED');validateDraft(draftOf(config),at,true);
  if(!text(store.address)||!text(store.phone)||store.location===null)fail('CONFIGURATION_REQUIRED');location(store.location,at);
  if(canonicalJSON(config.deliveryRules[0].area.center)!==canonicalJSON(store.location))fail('CONFIGURATION_REQUIRED');
  projectStoreInformation({...store,status:'OPEN',activeConfigId:config._id},{...config,status:'PUBLISHED',publishedAt:config.publishedAt||at});
}
function versioned(record,patch,at){if(!counter(record.version+1))fail('VERSION_CONFLICT');return {...copy(record),...copy(patch),version:record.version+1,updatedAt:at};}
function expected(record,version){if(!record||record.version!==version)fail('VERSION_CONFLICT');}
function planStoreUpdate(payload,state,at,resolvedLocation){
  const before=state.store;expected(before,payload.expectedVersion);if(before.status==='ARCHIVED')fail('INVALID_TRANSITION');
  const patch=copy(payload.patch);delete patch.mapSelectionToken;
  if(patch.timeZone!==undefined&&patch.timeZone!=='Asia/Shanghai')fail('INVALID_CONFIG_DRAFT');
  if(patch.status==='DRAFT'&&before.status!=='DRAFT')fail('INVALID_TRANSITION');
  if(patch.address!==undefined&&patch.address!==before.address)patch.location=null;
  if(Object.hasOwn(payload.patch,'mapSelectionToken')){location(resolvedLocation,at);patch.location=copy(resolvedLocation);}
  const after=versioned(before,patch,at);
  if(after.status==='OPEN')validatePublication(after,state.configs.find(config=>config._id===after.activeConfigId),at);
  return {collection:'stores',before,after,storeWrite:null,slotWrites:[]};
}
function planConfigSave(payload,state,context,receiptId,at){
  const before=payload.configId?state.configs.find(config=>config._id===payload.configId):null;
  if(before){expected(before,payload.expectedVersion);if(before.status!=='DRAFT')fail('IMMUTABLE_CONFIG');}
  validateDraft(payload.draft,at);
  const sequence=before?.configVersion??Math.max(-1,...state.configs.map(config=>config.configVersion))+1;
  if(!counter(sequence))fail('VERSION_CONFLICT');
  const after=before?versioned(before,payload.draft,at):{_id:scopedDocumentId('merchant-config',[context.environment,context.appId,state.storeId,receiptId]),
    schemaVersion:1,version:0,createdAt:at,updatedAt:at,storeId:state.storeId,configVersion:sequence,status:'DRAFT',publishedAt:null,...copy(payload.draft)};
  return {collection:'store_config',before,after,storeWrite:null,slotWrites:[]};
}
function currentDefinition(state,config,slot,context,at){
  try{return buildSlotDefinitions({store:{...state.store,status:'OPEN'},environment:context.environment,now:at,fulfillment:slot.fulfillment,
    serviceDate:slot.serviceDate,timePolicy:config.timePolicy,productLeadTimes:[0]}).find(row=>row._id===slot._id)||null;}
  catch(error){if(['APPOINTMENT_OUTSIDE_WINDOW'].includes(error.code))return null;throw error;}
}
function planConfigPublish(payload,state,context,at){
  const before=state.configs.find(config=>config._id===payload.configId);expected(before,payload.expectedVersion);expected(state.store,payload.expectedStoreVersion);
  if(before.status!=='DRAFT')fail('IMMUTABLE_CONFIG');validatePublication(state.store,before,at);
  if(state.configs.some(config=>config.status!=='DRAFT'&&config.configVersion>=before.configVersion))fail('POLICY_VERSION_CONFLICT');
  if(state.configs.some(config=>config.status!=='DRAFT'&&config.timePolicy.policyVersion===before.timePolicy.policyVersion&&
    canonicalJSON(config.timePolicy)!==canonicalJSON(before.timePolicy)))fail('POLICY_VERSION_CONFLICT');
  const after=versioned(before,{status:'PUBLISHED',publishedAt:at},at),storeAfter=versioned(state.store,{activeConfigId:after._id},at),slotWrites=[];
  for(const slot of state.slots.filter(slot=>slot.startAt>at)){
    const definition=currentDefinition(state,after,slot,context,at),patch=definition?{policyVersion:definition.policyVersion}:{status:'CLOSED'};
    if(Object.keys(patch).some(field=>slot[field]!==patch[field]))slotWrites.push({before:slot,after:versioned(slot,patch,at)});
  }
  return {collection:'store_config',before,after,storeWrite:{before:state.store,after:storeAfter},slotWrites};
}
function planSlotUpdate(payload,state,context,at){
  const before=state.slots.find(slot=>slot._id===payload.slotId);expected(before,payload.expectedVersion);
  const occupied=before.heldUnits+before.confirmedUnits+before.consumedUnits;
  if(payload.capacityTotal<occupied)fail('CAPACITY_BELOW_OCCUPIED');
  if(payload.capacityTotal!==V1.capacities[before.fulfillment])fail('INVALID_CONFIG_DRAFT');
  const active=state.configs.find(config=>config._id===state.store.activeConfigId);
  if(payload.status==='OPEN'&&(state.store.status!=='OPEN'||!active||!currentDefinition(state,active,before,context,at)||
    active.timePolicy.policyVersion!==before.policyVersion))fail('APPOINTMENT_UNAVAILABLE');
  return {collection:'slot_inventory',before,after:versioned(before,{status:payload.status,capacityTotal:payload.capacityTotal},at),storeWrite:null,slotWrites:[]};
}
const storeDTO=record=>pick(record,[...baseFields,...storeFields]);
const configDTO=record=>pick(record,[...baseFields,'storeId','configVersion','status','publishedAt',...fields]);
const slotDTO=record=>pick(record,[...baseFields,...slotFields]);
module.exports={validateStoreState,validatePublication,draftOf,planStoreUpdate,planConfigSave,planConfigPublish,planSlotUpdate,storeDTO,configDTO,slotDTO};
