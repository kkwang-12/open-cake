'use strict';
// OFFLINE_TEST_ONLY: synthetic business policies / points, serialized memory, no actual approval or SDK.
const {setup:accessSetup}=require('./admin-access');
const {setup:quoteSetup,clone}=require('./quote');
const {buildSlotDefinitions,localServiceDate}=require('../../cloudfunctions/_shared/fulfillment-model');
const {createMerchantStoreService}=require('../../cloudfunctions/_shared/merchant-store-service');
const {draftOf}=require('../../cloudfunctions/_shared/merchant-store-model');
function completeConfig(config,storeId,at){return {...clone(config),storeId,schemaVersion:1,version:0,createdAt:at,updatedAt:Math.max(at,config.publishedAt||at),
  cartLimits:{maxLines:10,maxQuantityPerLine:10,maxOrderNoteLength:100},paymentHoldMinutes:15,
  slotPolicy:{unit:'ORDER',unitsPerOrder:1,slotMinutes:30,capacityPerSlot:{PICKUP:3,DELIVERY:1},releasePolicyVersion:'OFFLINE_TEST_ONLY'}};}
function attach(s,context){
  s.controls.storeReads=0;s.controls.storeFences=[];s.controls.locationAccepted=true;s.controls.policyAccepted=true;
  s.controls.phoneAccepted=true;s.controls.mapLocation=null;
  const existing=s.controls.extendTransaction;
  s.controls.extendTransaction=parts=>{
    const {staged,snapshot,changed,insert}=parts;
    const save=(collection,record,version)=>{
      if(staged[collection][record._id]?.version!==version)return 0;staged[collection][record._id]=clone(record);return changed();
    };
    return {...(existing?existing(parts):{}),
      readStoreHeader:async(collection,id)=>clone(staged[collection==='stores'?'stores':collection==='store_config'?'configs':'slots'][id]||null),
      readStoreState:async storeId=>{
        s.controls.storeReads++;const state={environment:context.environment,appId:context.appId,complete:true,storeId,
          store:clone(staged.stores[storeId]),configs:Object.values(staged.configs).filter(row=>row.storeId===storeId).map(clone),
          slots:Object.values(staged.slots).filter(row=>row.storeId===storeId).map(clone)};
        if(s.controls.storeStatePatch)s.controls.storeStatePatch(state);return state;
      },
      assertStoreReads:async reads=>{s.controls.storeFences.push(clone(reads));return !s.controls.fenceFalse&&!s.controls.denyFence&&JSON.stringify(s.db)===snapshot;},
      saveStore:async(record,version)=>save('stores',record,version),insertConfig:async record=>insert('configs',record),
      saveConfig:async(record,version)=>save('configs',record,version),saveSlot:async(record,version)=>save('slots',record,version),
      resolveStoreMapSelection:async binding=>binding.token==='OFFLINE_SERVER_MAP_TOKEN'?clone(s.controls.mapLocation):null,
      verifyStoreLocation:async()=>s.controls.locationAccepted,verifyOperationalPolicies:async()=>s.controls.policyAccepted,
      validateStorePhone:async phone=>s.controls.phoneAccepted&&/^0\d{2,3}-\d{7,8}$/.test(phone)};
  };
  let sequence=0;
  const storeOptions={context,key:{id:'OFFLINE_STORE_CURSOR',secret:Buffer.alloc(32,41)},runTransaction:s.runTransaction||s.options.runTransaction,
    now:()=>s.controls.nowSequence?s.controls.nowSequence.shift():s.controls.now,newRequestId:()=> 'OFFLINE_STORE_TRACE_'+(++sequence),
    redactReason:()=> '经核验配置维护'};
  return {storeOptions,storeService:createMerchantStoreService(storeOptions)};
}
async function setup(){
  const s=accessSetup();await s.bootstrap();await s.service.execute(s.grant({capabilities:['CONFIG_WRITE']}),s.initial);
  const sample=quoteSetup().state,context={...s.settings},storeId='offline-store-a',at=s.controls.now-2000,
    config=completeConfig(sample.configuration,storeId,at);
  config._id='OFFLINE_INITIAL_CONFIG';config.publishedAt=at;
  s.db.stores[storeId]={...s.db.stores[storeId],...clone(sample.store),_id:storeId,version:0,schemaVersion:1,
    createdAt:at,updatedAt:at,activeConfigId:config._id};
  s.db.configs={[config._id]:config};s.db.slots={};
  const serviceDate=new Date(Date.parse(localServiceDate(s.controls.now,'Asia/Shanghai')+'T00:00:00Z')+86400000).toISOString().slice(0,10);
  for(const mode of ['PICKUP','DELIVERY']){
    const definition=buildSlotDefinitions({store:s.db.stores[storeId],environment:context.environment,now:s.controls.now,
      fulfillment:mode,serviceDate,timePolicy:config.timePolicy,productLeadTimes:[0]})[0];
    s.db.slots[definition._id]={...clone(definition),schemaVersion:1,version:0,createdAt:at,updatedAt:at,status:'OPEN',
      heldUnits:0,confirmedUnits:mode==='PICKUP'?2:1,consumedUnits:0};
  }
  const attached=attach(s,context),slotId=Object.values(s.db.slots).find(slot=>slot.fulfillment==='PICKUP')._id;
  const event=(action,patch={})=>({action,payload:action==='store.update'?{storeId,expectedVersion:s.db.stores[storeId].version,
    patch:{name:'离线维护门店'},reason:'私密说明13800138000',idempotencyKey:'OFFLINE_STORE_UPDATE_KEY',...patch}:
    action==='config.save'?{storeId,draft:draftOf(s.db.configs[s.db.stores[storeId].activeConfigId]),idempotencyKey:'OFFLINE_CONFIG_SAVE_KEY',...patch}:
    action==='config.publish'?{storeId,configId:patch.configId,expectedVersion:s.db.configs[patch.configId]?.version??0,
      expectedStoreVersion:s.db.stores[storeId].version,idempotencyKey:'OFFLINE_CONFIG_PUBLISH_KEY',...patch}:
    action==='slot.update'?{slotId,expectedVersion:s.db.slots[slotId].version,status:'CLOSED',capacityTotal:3,
      reason:'私密说明13800138000',idempotencyKey:'OFFLINE_SLOT_UPDATE_KEY',...patch}:
    action==='slots.list'?{storeId,fulfillment:'PICKUP',serviceDate,...patch}:{storeId,...patch}});
  return {...s,...attached,context,storeId,slotId,serviceDate,event,execute:(action,patch,principal=s.member)=>attached.storeService.execute(event(action,patch),principal)};
}
module.exports={setup,attach,completeConfig,draftOf,clone};
