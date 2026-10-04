'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const storeInfo=require('../miniprogram/services/store-information');
const {createFulfillmentDraftClient,STORAGE_KEY}=require('../miniprogram/features/checkout/fulfillment-draft');
const {V1_FULFILLMENT_POLICY}=require('../cloudfunctions/_shared/fulfillment-model');
const clone=value=>JSON.parse(JSON.stringify(value));
const settings={stage:'development',mode:'shell',appId:'X02-OFFLINE'};
function setup(){const values={},reference=storeInfo.confirmed();
  const platform={getStorageSync:key=>clone(values[key]||''),setStorageSync:(key,value)=>{values[key]=clone(value);}};
  const make=next=>createFulfillmentDraftClient(next||settings,platform,()=>clone(reference));
  return {values,reference,platform,make,service:make()};
}
test('X02 confirmed store reference matches frozen policy but supplies neither OPEN status nor phone/location evidence',async()=>{
  const value=await storeInfo.get();assert.equal(value.status,'CONFIGURATION_PENDING');assert.equal(value.phone,null);
  assert.equal(value.openingHours,'每天 08:00–21:00');assert.equal(value.slotMinutes,V1_FULFILLMENT_POLICY.slotMinutes);
  assert.deepEqual(value.capacities,V1_FULFILLMENT_POLICY.capacities);assert.deepEqual(value.delivery,V1_FULFILLMENT_POLICY.delivery);
  assert.equal(value.checkoutAllowed,false);assert(!('storeId' in value));assert(!('location' in value));
  value.name='changed';assert.equal((await storeInfo.get()).name,'家家乐蛋糕店');
  await assert.rejects(storeInfo.createStoreInformationClient({...settings,stage:'production'}).get(),e=>e.code==='CLOUD_NOT_CONFIGURED');
});
test('X02 pickup contact and modes persist across new clients; other AppIDs do not inherit inputs',()=>{
  const s=setup(),version=s.reference.referenceVersion;assert.equal(s.service.get().fulfillment,'PICKUP');
  let view=s.service.saveContact({name:' 离线测试取货人 ',phone:'13800000000'},0,version);assert.equal(view.revision,1);
  view=s.make().get();assert.equal(view.pickupContact.name,'离线测试取货人');assert.equal(view.contactValid,true);assert.equal(view.checkoutAllowed,false);
  view=s.service.setMode('DELIVERY',1,version);assert.equal(s.make().get().fulfillment,'DELIVERY');
  assert.throws(()=>s.service.saveContact({name:'测试',phone:'13800000000'},2,version),e=>e.code==='FULFILLMENT_UNAVAILABLE');
  view=s.service.setMode('PICKUP',2,version);assert.equal(view.pickupContact.name,'离线测试取货人');
  assert.equal(s.make({...settings,appId:'other-app'}).get().pickupContact.name,'');
});
test('X02 invalid contacts, stale versions, closed store and disabled pickup fail without saving',()=>{
  const s=setup(),version=s.reference.referenceVersion;
  for(const contact of [{name:'',phone:'13800000000'},{name:'测试',phone:'123'},{name:'\ud800',phone:'13800000000'},
    {name:'测试',phone:'13800000000',ownerId:'fake'}])assert.throws(()=>s.service.saveContact(contact,0,version),e=>['INVALID_CONTACT','INVALID_PHONE'].includes(e.code));
  assert.equal(Object.keys(s.values).length,0);s.service.setMode('DELIVERY',0,version);
  assert.throws(()=>s.service.setMode('PICKUP',0,version),e=>e.code==='LOCAL_FULFILLMENT_CONFLICT');
  s.reference.fulfillmentModes=['DELIVERY'];assert.throws(()=>s.service.setMode('PICKUP',1,version),e=>e.code==='FULFILLMENT_UNAVAILABLE');
  s.reference.status='CLOSED';assert.equal(s.service.get().fulfillmentAllowed,false);
  assert.throws(()=>s.service.setMode('DELIVERY',1,version),e=>e.code==='FULFILLMENT_UNAVAILABLE');
});
test('X02 reference changes require explicit refresh/reselection rather than silent authorization',()=>{
  const s=setup();s.service.saveContact({name:'测试',phone:'13800000000'},0,s.reference.referenceVersion);const old=s.reference.referenceVersion;
  s.reference.referenceVersion='offline-reference-v2';assert.equal(s.service.get().configurationChanged,true);
  assert.throws(()=>s.service.saveContact({name:'测试',phone:'13800000000'},1,old),e=>e.code==='LOCAL_STORE_REFERENCE_CHANGED');
  const chosen=s.service.setMode('PICKUP',1,s.reference.referenceVersion);assert.equal(chosen.configurationChanged,false);assert.equal(chosen.checkoutAllowed,false);
});
test('X02 storage failures and corrupt data fail truthfully; reads do not write and uncertain save rejects old revision retry',()=>{
  const s=setup(),version=s.reference.referenceVersion;assert.equal(s.service.get().revision,0);assert.equal(Object.keys(s.values).length,0);
  let failedRead=false;const uncertain=createFulfillmentDraftClient(settings,{getStorageSync:key=>{if(failedRead){failedRead=false;throw new Error();}return s.platform.getStorageSync(key);},
    setStorageSync:(key,value)=>{s.platform.setStorageSync(key,value);failedRead=true;}},()=>s.reference);
  assert.throws(()=>uncertain.saveContact({name:'测试',phone:'13800000000'},0,version),e=>e.code==='LOCAL_FULFILLMENT_WRITE_FAILED');
  assert.equal(s.service.get().revision,1);
  assert.throws(()=>uncertain.saveContact({name:'测试',phone:'13800000000'},0,version),e=>e.code==='LOCAL_FULFILLMENT_CONFLICT');
  s.values[STORAGE_KEY+':'+settings.appId].scope='CLOUD';assert.throws(()=>s.service.get(),e=>e.code==='LOCAL_FULFILLMENT_INVALID');
  assert.throws(()=>s.make({...settings,mode:'cloud'}).get(),e=>e.code==='LOCAL_FULFILLMENT_UNAVAILABLE');
});
