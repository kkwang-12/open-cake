'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {readAppointmentAvailability}=require('../cloudfunctions/_shared/appointment-availability');
const {buildSlotDefinitions,V1_FULFILLMENT_POLICY}=require('../cloudfunctions/_shared/fulfillment-model');
const {identityFromPlatform,resolveCustomer}=require('../cloudfunctions/_shared/authorization-model');
const {planCartCommand}=require('../cloudfunctions/_shared/cart-model');
const {catalog,emptyCart,cartContext}=require('./fixtures/catalog');
const clone=value=>JSON.parse(JSON.stringify(value));
function actor(id='A'){
  const settings={appId:'offline-X04',environment:'offline-X04',stage:'development'},platform={OPENID:id,APPID:settings.appId,ENV:settings.environment};
  return resolveCustomer(platform,settings,{...identityFromPlatform(platform,settings),schemaVersion:1,version:0,status:'ACTIVE'});
}
function setup(mode='PICKUP'){
  // OFFLINE_TEST_ONLY: lead=60 / product=90 / advance=7 are not merchant values.
  const principal=actor(),cat=catalog(),now=Date.parse('2026-10-05T00:00:00Z');cat.product.minLeadTimeMinutes=90;
  const store={_id:cat.product.storeId,version:1,status:'OPEN',name:'OFFLINE_TEST_ONLY',address:'仅离线测试门店',phone:'0551-00000000',timeZone:'Asia/Shanghai',activeConfigId:'test-config'};
  const configuration={_id:'test-config',storeId:store._id,status:'PUBLISHED',configVersion:2,publishedAt:now-1000,
    fulfillmentPolicyVersion:V1_FULFILLMENT_POLICY.version,fulfillmentModes:['PICKUP','DELIVERY'],
    timePolicy:{policyVersion:'OFFLINE_TEST_ONLY',timeZone:'Asia/Shanghai',minLeadTimeMinutes:60,maxAdvanceDays:7,crossDayStrategy:'REJECT',
      weeklyWindows:Array.from({length:7},(_,i)=>['PICKUP','DELIVERY'].map(fulfillment=>({weekday:i+1,fulfillment,startMinute:480,endMinute:1260}))).flat(),dateOverrides:[]}};
  const cart=planCartCommand({...emptyCart(),ownerId:principal.subjectId},'ADD',principal,{expectedVersion:0,skuId:cat.skus[0]._id,
    selectedOptions:cat.selectedOptions,quantity:2,cakeMessage:''},{...cartContext(cat),now:2000,newLineId:'line-X04'}).nextCart;
  const input={storeId:store._id,expectedStoreVersion:1,expectedConfigVersion:2,fulfillment:mode,serviceDate:'2026-10-06',
    selection:{cartId:cart._id,expectedVersion:cart.version,lines:[{lineId:'line-X04',expectedLineVersion:0}]}};
  const context={now,limits:{maxLines:3,maxQuantityPerLine:6}};
  function definitions(){return buildSlotDefinitions({store,environment:principal.environment,now:context.now,fulfillment:input.fulfillment,
    serviceDate:input.serviceDate,timePolicy:configuration.timePolicy,productLeadTimes:[cat.product.minLeadTimeMinutes]});}
  const slots=definitions().map(definition=>({...clone(definition),version:0,status:'OPEN',heldUnits:0,confirmedUnits:0,consumedUnits:0}));
  return {principal,cat,cart,store,configuration,input,context,slots,definitions,run(request=input,who=principal){return readAppointmentAvailability(store,configuration,cart,[cat],slots,request,who,context);}};
}
const code=(run,value)=>assert.throws(run,error=>error.code===value);
test('X04 26 slots / final 20:30 window / local date range / no reservation and immutable public output',()=>{
  const s=setup(),before=JSON.stringify(s.slots),result=s.run();assert.equal(result.slots.length,26);
  assert.equal(result.slots[25].label,'20:30–21:00');assert.equal(result.slots[0].remainingOrders,3);
  assert.deepEqual(result.dateRange,{firstDate:'2026-10-05',lastDate:'2026-10-12'});
  assert.equal(result.capacityReserved,false);assert.equal(result.checkoutAllowed,false);assert.equal(result.requiresCloudRevalidation,true);
  assert.equal(result.ownerId,undefined);assert.equal(JSON.stringify(s.slots),before);assert(Object.isFrozen(result.slots[0]));
});
test('X04 held / confirmed / consumed count independently in each mode; full and closed cannot be selected',()=>{
  const p=setup(),d=setup('DELIVERY');p.slots[0].heldUnits=1;p.slots[0].confirmedUnits=1;p.slots[0].consumedUnits=1;
  d.slots[0].heldUnits=1;p.slots[1].status='CLOSED';
  assert.equal(p.run().slots[0].status,'FULL');assert.equal(d.run().slots[0].status,'FULL');
  assert.equal(p.run().slots[0].selectable,false);assert.equal(p.run().slots[1].status,'CLOSED');
  assert.equal(p.run().slots[2].remainingOrders,3);assert.equal(d.run().slots[2].remainingOrders,1);
  assert.notEqual(p.slots[0]._id,d.slots[0]._id);assert.equal(d.run().windowNature,'ESTIMATED');assert.equal(d.run().requiresDeliveryValidation,true);
});
test('X04 missing resources never imply free capacity; obsolete definition is disabled, corrupt or mixed scope reads reject',()=>{
  let s=setup();s.slots.shift();assert.equal(s.run().slots[0].status,'UNVERIFIED');assert.equal(s.run().slots[0].remainingOrders,null);
  s=setup();s.slots[0].policyVersion='obsolete';assert.equal(s.run().slots[0].status,'STALE');assert.equal(s.run().slots[0].selectable,false);
  for(const mutate of [s=>s.slots.push(clone(s.slots[0])),s=>s.slots[0].heldUnits=4,s=>s.slots[0].fulfillment='DELIVERY',s=>s.slots[0].storeId='other',s=>s.slots[0].serviceDate='2026-10-07']){
    s=setup();mutate(s);code(()=>s.run(),'INVALID_RESOURCE');
  }
});
test('X04 cutoff / closed override / invalid calendar and max advance window use server time',()=>{
  let s=setup();s.input.serviceDate='2026-10-05';s.slots.length=0;const r=s.run();assert.equal(r.slots[0].label,'10:00–10:30');
  assert(!r.slots.some(slot=>slot.label==='09:30–10:00'));
  s=setup();s.configuration.timePolicy.dateOverrides=[{serviceDate:s.input.serviceDate,fulfillment:'PICKUP',closed:true,windows:[]}];assert.equal(s.run().slots.length,0);
  for(const [date,error] of [['2026-10-04','APPOINTMENT_OUTSIDE_WINDOW'],['2026-10-13','APPOINTMENT_OUTSIDE_WINDOW'],['2026-02-30','INVALID_SERVICE_DATE']]){s=setup();code(()=>s.run({...s.input,serviceDate:date}),error);}
  s=setup();s.input.serviceDate='2026-10-12';s.slots.length=0;assert.equal(s.run().slots.length,26);
  s=setup();s.context.now=Date.parse('2026-10-05T16:00:00Z');assert.equal(s.run().dateRange.firstDate,'2026-10-06');
});
test('X04 principal / cart / config versions and client lead, capacity or clock fields cannot bypass validation',()=>{
  const s=setup();code(()=>s.run(s.input,{...s.principal}),'AUTH_REQUIRED');code(()=>s.run(s.input,actor('B')),'FORBIDDEN');
  for(const patch of [{now:0},{productLeadTimes:[0]},{remainingOrders:3},{capacityTotal:99}])code(()=>s.run({...s.input,...patch}),'INVALID_REQUEST');
  code(()=>s.run({...s.input,expectedConfigVersion:1}),'VERSION_CONFLICT');code(()=>s.run({...s.input,selection:{...s.input.selection,expectedVersion:0}}),'VERSION_CONFLICT');
  s.configuration.fulfillmentModes=['DELIVERY'];code(()=>s.run(),'FULFILLMENT_UNAVAILABLE');
});
test('X04 unknown lead/advance, draft product/config and future publication fail closed',()=>{
  for(const [mutate,error] of [[s=>s.cat.product.minLeadTimeMinutes=null,'CONFIGURATION_REQUIRED'],[s=>s.configuration.timePolicy.maxAdvanceDays=null,'CONFIGURATION_REQUIRED'],
    [s=>s.cat.product.status='DRAFT','PRODUCT_UNAVAILABLE'],[s=>s.configuration.status='DRAFT','CONFIGURATION_REQUIRED'],[s=>s.configuration.publishedAt=s.context.now+1,'CONFIGURATION_REQUIRED'],
    [s=>s.configuration.timePolicy.maxAdvanceDays=10000000,'INVALID_TIME_POLICY']]){
    const s=setup();mutate(s);code(()=>s.run(),error);
  }
});
test('X04 fingerprint changes with current catalog / policy / resource version or capacity and preserves inputs',()=>{
  const s=setup(),initial=s.run();s.cat.product.minLeadTimeMinutes++;const lead=s.run();s.slots[0].version++;const version=s.run();s.slots[0].heldUnits++;const held=s.run();
  assert.equal(new Set([initial,lead,version,held].map(value=>value.inputFingerprint)).size,4);
  assert.equal(initial.slots[0].remainingOrders,3);assert.equal(s.run().inputFingerprint,s.run().inputFingerprint);
});
test('X04 mixed selected products take maximum lead; capacity refresh disables a previously available slot',()=>{
  const s=setup(),second=clone(s.cat);second.product._id='second-product';second.product.minLeadTimeMinutes=180;
  second.skus.forEach((sku,i)=>{sku.productId=second.product._id;sku._id='second-sku-'+i;});
  const cart=planCartCommand(s.cart,'ADD',s.principal,{expectedVersion:s.cart.version,skuId:second.skus[0]._id,
    selectedOptions:second.selectedOptions,quantity:1,cakeMessage:''},{...cartContext(second),now:3000,newLineId:'second-line'}).nextCart;
  const input={...s.input,serviceDate:'2026-10-05',selection:{cartId:cart._id,expectedVersion:cart.version,
    lines:[{lineId:'line-X04',expectedLineVersion:0},{lineId:'second-line',expectedLineVersion:0}]}};
  const read=()=>readAppointmentAvailability(s.store,s.configuration,cart,[s.cat,second],[],input,s.principal,s.context);
  assert.equal(read().slots[0].label,'11:30–12:00');
  assert.equal(s.run().slots[0].selectable,true);s.slots[0].heldUnits=3;s.slots[0].version++;
  assert.equal(s.run().slots[0].selectable,false);
});
