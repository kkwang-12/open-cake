'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {projectStoreInformation,resolveFulfillmentInput}=require('../cloudfunctions/_shared/store-fulfillment');
const {identityFromPlatform,resolveCustomer}=require('../cloudfunctions/_shared/authorization-model');
const {V1_FULFILLMENT_POLICY}=require('../cloudfunctions/_shared/fulfillment-model');
function setup(){
  const settings={appId:'offline-app',environment:'offline-env',stage:'development'},platform={OPENID:'A',APPID:settings.appId,ENV:settings.environment};
  const principal=resolveCustomer(platform,settings,{...identityFromPlatform(platform,settings),schemaVersion:1,version:0,status:'ACTIVE'});
  const store={_id:'offline-store',version:2,status:'OPEN',name:'OFFLINE TEST ONLY',address:'仅离线测试地址',phone:'0551-00000000',timeZone:'Asia/Shanghai',activeConfigId:'offline-config',privateNote:'must-not-expose'};
  const configuration={_id:'offline-config',storeId:store._id,status:'PUBLISHED',configVersion:3,publishedAt:1000,
    fulfillmentModes:['PICKUP','DELIVERY'],fulfillmentPolicyVersion:V1_FULFILLMENT_POLICY.version,
    timePolicy:{policyVersion:'offline-hours',timeZone:'Asia/Shanghai',minLeadTimeMinutes:60,maxAdvanceDays:7,crossDayStrategy:'REJECT',
      weeklyWindows:[{weekday:1,fulfillment:'PICKUP',startMinute:480,endMinute:1260}],dateOverrides:[]},privateResourceCounts:{held:99}};
  const input={storeId:store._id,expectedStoreVersion:2,expectedConfigVersion:3,fulfillment:'PICKUP',contact:{name:' 离线测试 ',phone:'13800000000'}};
  const context={validatePhone:phone=>/^1[3-9]\d{9}$/.test(phone)}; // OFFLINE TEST POLICY ONLY.
  return {store,configuration,principal,input,context,run(value=input,actor=principal,options=context){return resolveFulfillmentInput(store,configuration,value,actor,options);}};
}
test('X02 trusted published store projection is a frozen whitelist, not resource counters or publication IDs',()=>{
  const s=setup(),view=projectStoreInformation(s.store,s.configuration);assert.equal(view.name,'OFFLINE TEST ONLY');
  assert.equal(view.delivery.feeCents,0);assert(!('privateNote' in view));assert(!('privateResourceCounts' in view));assert(!('activeConfigId' in view));assert(Object.isFrozen(view.fulfillmentModes));
});
test('X02 pickup needs no address and always zero delivery fee; delivery remains pending address/range/appointment validation',()=>{
  const s=setup(),pickup=s.run();assert.equal(pickup.addressId,null);assert.equal(pickup.deliveryFeeCents,0);assert.equal(pickup.contact.name,'离线测试');
  assert.equal(pickup.requiresAddressValidation,false);assert.equal(pickup.checkoutAllowed,false);
  assert.throws(()=>s.run({...s.input,addressId:'inapplicable'}),e=>e.code==='INVALID_REQUEST');
  const delivery=s.run({...s.input,fulfillment:'DELIVERY',addressId:'offline-address'});assert.equal(delivery.requiresAddressValidation,true);assert.equal(delivery.requiresAppointmentValidation,true);assert.equal(delivery.checkoutAllowed,false);
  assert.throws(()=>s.run({...s.input,fulfillment:'DELIVERY'}),e=>e.code==='LOCATION_REQUIRED');
});
test('X02 closed/draft store, unpublished/wrong-store/incomplete config and disabled pickup cannot pass preflight',()=>{
  for(const status of ['DRAFT','CLOSED','ARCHIVED']){const s=setup();s.store.status=status;assert.throws(()=>s.run(),e=>e.code==='STORE_UNAVAILABLE');}
  for(const mutate of [s=>s.store.phone=null,s=>s.configuration.status='DRAFT',s=>s.configuration.storeId='other',s=>s.configuration.timePolicy=null,
    s=>s.configuration.fulfillmentPolicyVersion='unknown',s=>s.configuration.fulfillmentModes=['PICKUP','PICKUP']]){
    const s=setup();mutate(s);assert.throws(()=>s.run(),e=>e.code==='CONFIGURATION_REQUIRED');
  }
  const s=setup();s.configuration.fulfillmentModes=['DELIVERY'];assert.throws(()=>s.run(),e=>e.code==='FULFILLMENT_UNAVAILABLE');
});
test('X02 current store/config versions, trusted principal and server phone policy are required; fee/status spoofing is rejected',()=>{
  const s=setup();assert.throws(()=>s.run(s.input,{...s.principal}),e=>e.code==='AUTH_REQUIRED');
  for(const patch of [{expectedStoreVersion:1},{expectedConfigVersion:2}])assert.throws(()=>s.run({...s.input,...patch}),e=>e.code==='VERSION_CONFLICT');
  for(const patch of [{deliveryFeeCents:1},{status:'OPEN'},{ownerId:'fake'},{contact:{name:'测试',phone:'123'}}])assert.throws(()=>s.run({...s.input,...patch}),e=>e.code==='INVALID_REQUEST');
  assert.throws(()=>s.run(s.input,s.principal,{}),e=>e.code==='CONFIGURATION_REQUIRED');
});
