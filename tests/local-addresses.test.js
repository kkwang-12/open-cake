'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createLocalAddressClient,STORAGE_KEY}=require('../miniprogram/features/addresses/local-addresses');
const clone=value=>JSON.parse(JSON.stringify(value));
const settings={stage:'development',mode:'shell',appId:'X01-OFFLINE'};
const draft=(detail='仅离线测试门牌')=>({receiverName:'离线测试',phone:'13800000000',province:'安徽省',city:'合肥市',district:'庐江县',detail});
function setup(){
  const state={values:{},writes:0};let sequence=0;
  const platform={getStorageSync:key=>clone(state.values[key]||''),setStorageSync:(key,value)=>{state.values[key]=clone(value);state.writes++;}};
  const make=nextSettings=>createLocalAddressClient(nextSettings||settings,platform,()=> 'offline-address-'+(++sequence));
  return {state,platform,make,client:make(),key:STORAGE_KEY+':'+settings.appId};
}
test('X01 local CRUD normalizes fields, survives a new client, isolates AppIDs and leaves detached snapshots intact',()=>{
  const s=setup();let book=s.client.create({...draft(),receiverName:' 离线测试 '},0),address=book.addresses[0];
  assert.equal(address.receiverName,'离线测试');assert.equal(address.location,null);assert.equal(address.requiresCloudValidation,true);
  const snapshot=clone(address);book=s.make().update(address.addressId,0,draft('仅离线新门牌'),1);
  assert.equal(book.addresses[0].version,1);assert.equal(snapshot.detail,'仅离线测试门牌');
  assert.equal(s.make({...settings,appId:'other-app'}).list().addresses.length,0);
  assert.equal(s.client.list().defaultAddressId,null);s.client.remove(address.addressId,1,2);assert.equal(s.client.list().addresses.length,0);
});
test('X01 single default pointer rejects competing old revisions; deleting default clears it without promoting another',()=>{
  const s=setup();s.client.create(draft('一'),0);let book=s.client.create(draft('二'),1);
  const [a,b]=book.addresses;s.client.setDefault(a.addressId,0,2);
  assert.throws(()=>s.make().setDefault(b.addressId,0,2),e=>e.code==='LOCAL_ADDRESS_CONFLICT');
  book=s.client.setDefault(b.addressId,0,3);assert.equal(book.addresses.filter(row=>row.isDefault).length,1);
  book=s.client.remove(b.addressId,0,4);assert.equal(book.defaultAddressId,null);assert.equal(book.addresses[0].isDefault,false);
  assert.equal(s.client.selection().status,'EMPTY');
});
test('X01 explicit selection uses ID/version, invalidates after edit/delete and never silently falls back',()=>{
  const s=setup();s.client.create(draft('一'),0);let book=s.client.create(draft('二'),1);const [a,b]=book.addresses;
  s.client.setDefault(a.addressId,0,2);assert.equal(s.client.selection().address.addressId,a.addressId);
  s.client.choose(b.addressId,0,3);const snapshot=clone(s.client.selection().address);
  s.client.update(b.addressId,0,draft('修改二'),4);assert.equal(s.make().selection().status,'CHANGED');
  assert.equal(snapshot.detail,'二');s.client.choose(b.addressId,1,5);assert.equal(s.client.selection().address.detail,'修改二');
  s.client.remove(b.addressId,1,6);assert.equal(s.client.selection().status,'CHANGED');assert.equal(s.client.selection().address,null);
  assert.throws(()=>s.client.choose(b.addressId,1,7),e=>e.code==='LOCAL_ADDRESS_NOT_FOUND');
});
test('X01 invalid phone/incomplete input/forged coordinates and owner fields cannot be saved',()=>{
  const s=setup();
  for(const patch of [{phone:'123'},{phone:'abcdefghijk'},{phone:'12800000000'},{province:''},{receiverName:'\ud800'},
    {location:{latitude:1,longitude:2}},{ownerId:'other-user'},{detail:'a'.repeat(2049)}])
    assert.throws(()=>s.client.create({...draft(),...patch},0),e=>['INVALID_PHONE','INVALID_ADDRESS'].includes(e.code));
  assert.equal(s.state.writes,0);
  s.client.create(draft(),0);assert.throws(()=>s.client.update('offline-address-1',5,draft(),1),e=>e.code==='LOCAL_ADDRESS_CONFLICT');
});
test('X01 writes fail truthfully; uncertain committed create cannot be duplicated by retrying the old revision',()=>{
  const s=setup();let failRead=false;
  const uncertain=createLocalAddressClient(settings,{getStorageSync:key=>{if(failRead){failRead=false;throw new Error();}return s.platform.getStorageSync(key);},
    setStorageSync:(key,value)=>{s.platform.setStorageSync(key,value);failRead=true;}},()=> 'uncertain-address');
  assert.throws(()=>uncertain.create(draft(),0),e=>e.code==='LOCAL_ADDRESS_WRITE_FAILED');
  assert.equal(s.client.list().addresses.length,1);
  assert.throws(()=>uncertain.create(draft(),0),e=>e.code==='LOCAL_ADDRESS_CONFLICT');assert.equal(s.client.list().addresses.length,1);
  const broken=createLocalAddressClient(settings,{...s.platform,setStorageSync(){throw new Error();}});
  assert.throws(()=>broken.setDefault('uncertain-address',0,1),e=>e.code==='LOCAL_ADDRESS_WRITE_FAILED');
  assert.equal(s.client.list().defaultAddressId,null);
});
test('X01 corrupt reads and production access fail closed without overwriting existing address data',()=>{
  const s=setup();s.client.create(draft(),0);s.state.values[s.key].defaultAddressId='missing';const writes=s.state.writes;
  assert.throws(()=>s.client.list(),e=>e.code==='LOCAL_ADDRESS_INVALID');assert.equal(s.state.writes,writes);
  assert.throws(()=>s.make({...settings,stage:'production'}).list(),e=>e.code==='LOCAL_ADDRESS_UNAVAILABLE');
  assert.throws(()=>createLocalAddressClient(settings,{getStorageSync(){throw new Error();}}).list(),e=>e.code==='LOCAL_ADDRESS_READ_FAILED');
});
module.exports={draft,setup};
