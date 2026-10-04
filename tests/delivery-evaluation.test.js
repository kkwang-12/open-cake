'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {evaluateDeliveryInput}=require('../cloudfunctions/_shared/delivery-evaluation');
const {identityFromPlatform,resolveCustomer}=require('../cloudfunctions/_shared/authorization-model');
const {V1_FULFILLMENT_POLICY,DISTANCE_ALGORITHM_VERSION}=require('../cloudfunctions/_shared/fulfillment-model');
const {requestFingerprint}=require('../cloudfunctions/_shared/idempotency-model');
const clone=value=>JSON.parse(JSON.stringify(value));
function actor(openId='A'){
  const settings={appId:'offline-X03',environment:'offline-X03',stage:'development'},platform={OPENID:openId,APPID:settings.appId,ENV:settings.environment};
  return resolveCustomer(platform,settings,{...identityFromPlatform(platform,settings),schemaVersion:1,version:0,status:'ACTIVE'});
}
function setup(meters=0){
  // Isolated synthetic origin, not the merchant's unconverted GCJ-02 point.
  const point=latitude=>({longitude:0,latitude,coordinateSystem:'WGS84',source:'OFFLINE_VERIFIED_TEST_ONLY',verifiedAt:2000});
  const principal=actor(),store={_id:'offline-store',version:2,status:'OPEN',name:'OFFLINE TEST ONLY',phone:'0551-00000000',
    address:'仅离线测试门店',timeZone:'Asia/Shanghai',activeConfigId:'offline-config',location:point(0)};
  const address={_id:'offline-address',ownerId:principal.subjectId,schemaVersion:1,version:3,receiverName:'仅离线测试',phone:'13800000000',
    province:'安徽省',city:'合肥市',district:'庐江县',regionCodes:{province:null,city:null,district:null},detail:'仅离线门牌',
    location:point(meters/6371000*180/Math.PI),createdAt:1000,updatedAt:3000,deletedAt:null,privateNote:'must-not-expose'};
  const rule={ruleId:'offline-radius-rule',ruleVersion:4,priority:0,status:'ACTIVE',operator:'STORE_SELF',windowNature:'ESTIMATED',
    distanceAlgorithmVersion:DISTANCE_ALGORITHM_VERSION,area:{kind:'RADIUS',regionPaths:null,center:clone(store.location),radiusMeters:20000,
      vertices:null,coordinateSystem:'WGS84',boundaryIncluded:true},feePolicy:{kind:'FLAT',baseFeeCents:0,includedMeters:null,stepMeters:null,stepFeeCents:null,rounding:null}};
  const configuration={_id:'offline-config',storeId:store._id,status:'PUBLISHED',configVersion:5,publishedAt:1000,
    fulfillmentModes:['PICKUP','DELIVERY'],fulfillmentPolicyVersion:V1_FULFILLMENT_POLICY.version,deliveryRules:[rule],
    timePolicy:{policyVersion:'OFFLINE_TEST_ONLY',timeZone:'Asia/Shanghai',minLeadTimeMinutes:60,maxAdvanceDays:7,crossDayStrategy:'REJECT',
      weeklyWindows:[{weekday:1,fulfillment:'DELIVERY',startMinute:480,endMinute:1260}],dateOverrides:[]}};
  const input={storeId:store._id,expectedStoreVersion:store.version,expectedConfigVersion:configuration.configVersion,addressId:address._id,expectedAddressVersion:address.version};
  let approved=[];const calls=[];
  function approve(){approved=[['STORE',store],['ADDRESS',address]].map(([kind,entity])=>({entityKind:kind,entityId:entity._id,
    entityVersion:entity.version,locationFingerprint:requestFingerprint(entity.location)}));}
  approve();
  const context={now:4000,verifyLocation:(binding,location)=>{calls.push(binding);assert(Object.isFrozen(binding));assert(Object.isFrozen(location));
    return approved.some(record=>JSON.stringify(record)===JSON.stringify(binding));}};
  return {store,address,configuration,rule,input,principal,context,calls,approve,run(value=input,actorValue=principal,options=context){return evaluateDeliveryInput(store,configuration,address,value,actorValue,options);}};
}
const code=(fn,value)=>assert.throws(fn,error=>error.code===value);
test('X03 verified own address inside/on 20km boundary has zero fee; 1mm outside is rejected',()=>{
  for(const meters of [0,15000,19999.999,20000]){
    const s=setup(meters),result=s.run();assert(Math.abs(result.range.distanceMeters-meters)<1e-8);assert.equal(result.deliveryFacts.feeCents,0);
    assert.equal(result.range.operator,'STORE_SELF');assert.equal(result.range.windowNature,'ESTIMATED');assert.equal(result.checkoutAllowed,false);
    assert.equal(result.requiresEvaluationPersistence,true);assert.equal(result.requiresAppointmentValidation,true);assert.equal(s.calls.length,2);
    assert.equal(result.deliveryFacts.evaluationId,undefined);
  }
  code(()=>setup(20000.001).run(),'DELIVERY_OUT_OF_RANGE');
});
test('X03 entity/version/exact-point verification is required; source labels, client regions and coordinates cannot prove delivery',()=>{
  let s=setup();code(()=>s.run(s.input,s.principal,{now:4000}),'CONFIGURATION_REQUIRED');
  code(()=>s.run(s.input,s.principal,{now:4000,verifyLocation:()=>false}),'LOCATION_REQUIRED');
  code(()=>s.run(s.input,s.principal,{now:4000,verifyLocation:()=>Promise.resolve(true)}),'LOCATION_REQUIRED');
  code(()=>s.run(s.input,s.principal,{now:4000,verifyLocation:()=>{throw new Error('private provider failure');}}),'CONFIGURATION_REQUIRED');
  for(const patch of [{location:s.address.location},{inRange:true},{feeCents:0},{province:'安徽省'},{ruleVersion:4},{ownerId:s.principal.subjectId}])code(()=>s.run({...s.input,...patch}),'INVALID_REQUEST');
  s=setup();s.address.location.latitude=0.01;code(()=>s.run(),'LOCATION_REQUIRED');
  s=setup();s.address.location.source='CLIENT_CLAIMED_VERIFIED';code(()=>s.run(),'LOCATION_REQUIRED');
  s=setup();s.address.location.verifiedAt++;code(()=>s.run(),'LOCATION_REQUIRED');
  s=setup();s.address.version++;s.input.expectedAddressVersion++;code(()=>s.run(),'LOCATION_REQUIRED');
});
test('X03 missing/unsupported/future locations and text-only edits cannot reuse old range evidence',()=>{
  let s=setup();s.address.location=null;code(()=>s.run(),'LOCATION_REQUIRED');
  s=setup();s.store.location=null;code(()=>s.run(),'LOCATION_REQUIRED');
  s=setup();s.store.location.coordinateSystem='GCJ02';code(()=>s.run(),'COORDINATE_SYSTEM_UNSUPPORTED');
  s=setup();s.store.location.verifiedAt=5000;code(()=>s.run(),'LOCATION_REQUIRED');
  s=setup();s.address.location.verifiedAt=3500;code(()=>s.run(),'INVALID_ADDRESS_RECORD');
  s=setup();s.address.detail='新门牌，即使文字仍写庐江县';s.address.version++;s.address.location=null;s.input.expectedAddressVersion++;
  code(()=>s.run(),'LOCATION_REQUIRED');
});
test('X03 forged principal, foreign/deleted address, mismatched IDs and stale versions are rejected',()=>{
  const s=setup();code(()=>s.run(s.input,{...s.principal}),'AUTH_REQUIRED');code(()=>s.run(s.input,actor('B')),'FORBIDDEN');
  code(()=>s.run({...s.input,addressId:'another'}),'NOT_FOUND');code(()=>s.run({...s.input,storeId:'another'}),'NOT_FOUND');
  for(const patch of [{expectedAddressVersion:2},{expectedStoreVersion:1},{expectedConfigVersion:4}])code(()=>s.run({...s.input,...patch}),'VERSION_CONFLICT');
  s.address.deletedAt=s.address.updatedAt;code(()=>s.run(),'NOT_FOUND');
});
test('X03 only unambiguous published enabled V1 radius/free rules with the verified store center can be evaluated',()=>{
  for(const mutate of [s=>s.configuration.status='DRAFT',s=>s.configuration.storeId='another',s=>s.configuration.publishedAt=5000,
    s=>s.configuration.deliveryRules=[],s=>s.rule.status='RETIRED',s=>s.rule.area.radiusMeters=21000,s=>s.rule.area.boundaryIncluded=false,
    s=>s.rule.area.center.latitude=0.01,s=>s.rule.area.coordinateSystem='GCJ02',s=>s.rule.area.regionPaths=[],s=>s.rule.feePolicy.baseFeeCents=1,
    s=>s.rule.feePolicy.stepMeters=1000,s=>s.rule.operator='RIDER',s=>s.rule.distanceAlgorithmVersion='other',
    s=>s.configuration.deliveryRules.push({...clone(s.rule),ruleId:'ambiguous',priority:1})]){
    const s=setup();mutate(s);code(()=>s.run(),'CONFIGURATION_REQUIRED');
  }
  let s=setup();s.store.status='CLOSED';code(()=>s.run(),'STORE_UNAVAILABLE');
  s=setup();s.configuration.fulfillmentModes=['PICKUP'];code(()=>s.run(),'FULFILLMENT_UNAVAILABLE');
});
test('X03 bindings change with address/rule/config/store versions and location; immutable snapshots do not leak extra fields',()=>{
  const s=setup(),before=JSON.stringify({store:s.store,configuration:s.configuration,address:s.address}),original=s.run();
  assert.equal(JSON.stringify({store:s.store,configuration:s.configuration,address:s.address}),before);
  assert(Object.isFrozen(original.addressSnapshot.location));assert.equal(original.addressSnapshot.privateNote,undefined);
  assert.equal(original.addressSnapshot.ownerId,undefined);assert.match(original.deliveryFacts.addressFingerprint,/^[a-f0-9]{64}$/);
  const variants=[];
  s.address.detail='修改后的离线门牌';variants.push(s.run());
  s.address.version++;s.input.expectedAddressVersion++;s.approve();variants.push(s.run());
  s.rule.ruleVersion++;variants.push(s.run());
  s.configuration.configVersion++;s.input.expectedConfigVersion++;variants.push(s.run());
  s.store.version++;s.input.expectedStoreVersion++;s.approve();variants.push(s.run());
  s.address.location.latitude=0.01;s.approve();variants.push(s.run());
  assert.equal(new Set([original,...variants].map(value=>value.evaluationFingerprint)).size,variants.length+1);
  assert.equal(original.addressSnapshot.detail,'仅离线门牌');assert.equal(original.addressSnapshot.location.latitude,0);
  assert.equal(s.run().evaluationFingerprint,s.run().evaluationFingerprint);
});
