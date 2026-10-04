'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createAddressService}=require('../cloudfunctions/_shared/address-service');
const {snapshotAddress}=require('../cloudfunctions/_shared/address-model');
const {identityFromPlatform,resolveCustomer}=require('../cloudfunctions/_shared/authorization-model');
const clone=value=>JSON.parse(JSON.stringify(value));
const settings={appId:'offline-app',environment:'offline-env',stage:'development'};
function user(openId){const context={OPENID:openId,APPID:settings.appId,ENV:settings.environment};
  const record={...identityFromPlatform(context,settings),schemaVersion:1,version:0,status:'ACTIVE',defaultAddressId:null,createdAt:1000,updatedAt:1000};
  return {record,principal:resolveCustomer(context,settings,record)};}
const fields=(detail='仅离线测试地址')=>({receiverName:'仅离线测试',phone:'13800000000',province:'安徽省',city:'合肥市',district:'庐江县',
  regionCodes:{province:null,city:null,district:null},detail});
function setup(){
  const a=user('A'),b=user('B'),state={users:{[a.record._id]:a.record,[b.record._id]:b.record},addresses:{},receipts:{},failUser:false,failReceipt:false};
  let sequence=0,time=2000,queue=Promise.resolve();
  const runTransaction=work=>{
    const pending=queue.then(async()=>{
      const staged=clone(state),result=await work({
        readUser:async id=>staged.users[id]||null,readAddress:async id=>staged.addresses[id]||null,readReceipt:async id=>staged.receipts[id]||null,
        saveAddress:async(address,expected)=>{const current=staged.addresses[address._id];
          if(expected===null?!!current:!current||current.version!==expected)throw {code:'VERSION_CONFLICT'};staged.addresses[address._id]=clone(address);},
        saveUser:async(record,expected)=>{if(staged.users[record._id].version!==expected)throw {code:'VERSION_CONFLICT'};
          if(state.failUser)throw new Error('injected user write failure');staged.users[record._id]=clone(record);},
        saveReceipt:async(id,receipt)=>{if(state.failReceipt)throw new Error('injected receipt write failure');staged.receipts[id]=clone(receipt);}
      });Object.assign(state,staged);return result;
    });queue=pending.catch(()=>{});return pending;
  };
  const make=validatePhone=>createAddressService({runTransaction,now:()=>time++,newAddressId:()=> 'offline-address-'+(++sequence),validatePhone});
  // Phone policy here is OFFLINE TEST ONLY, not a merchant-approved production rule.
  const service=make(phone=>/^1[3-9]\d{9}$/.test(phone));
  const execute=(action,payload,principal=a.principal)=>service.execute({action,payload},principal);
  const create=(key='offline-create-key-0001',value=fields())=>execute('create',{address:value,idempotencyKey:key});
  return {state,a,b,make,service,execute,create};
}
test('X01 server CRUD projects only private-owner fields and immutable snapshots survive edits/deletion',async()=>{
  const s=setup(),address=await s.create();assert.equal(address.location,null);assert(!('ownerId' in address));
  const snapshot=snapshotAddress(s.state.addresses[address.addressId],s.a.principal,0);
  const changed=await s.execute('update',{addressId:address.addressId,expectedVersion:0,address:fields('仅离线新地址'),idempotencyKey:'offline-update-key-0001'});
  assert.equal(changed.version,1);assert.equal(snapshot.addressSnapshot.detail,'仅离线测试地址');assert(Object.isFrozen(snapshot.addressSnapshot));
  await s.execute('remove',{addressId:address.addressId,expectedVersion:1,expectedUserVersion:0,idempotencyKey:'offline-remove-key-0001'});
  assert.equal(s.state.addresses[address.addressId].deletedAt,s.state.addresses[address.addressId].updatedAt);
  await assert.rejects(s.execute('get',{addressId:address.addressId}),e=>e.code==='NOT_FOUND');assert.equal(snapshot.addressVersion,0);
});
test('X01 server rejects forged principal and cross-owner get/update/remove/default/snapshot',async()=>{
  const s=setup(),address=await s.create();
  await assert.rejects(s.execute('get',{addressId:address.addressId},{...s.a.principal}),e=>e.code==='AUTH_REQUIRED');
  for(const action of ['get','update','remove','setDefault']){
    const payload={addressId:address.addressId};
    if(action!=='get'){payload.expectedVersion=0;payload.idempotencyKey='offline-cross-user-key';}
    if(action==='update')payload.address=fields();
    if(['remove','setDefault'].includes(action))payload.expectedUserVersion=0;
    await assert.rejects(s.execute(action,payload,s.b.principal),e=>e.code==='FORBIDDEN');
  }
  assert.throws(()=>snapshotAddress(s.state.addresses[address.addressId],s.b.principal,0),e=>e.code==='FORBIDDEN');
});
test('X01 two competing defaults serialize through the user version; default removal clears pointer without promotion',async()=>{
  const s=setup(),a=await s.create(),b=await s.create('offline-create-key-0002',fields('二'));
  const commands=[a,b].map((address,index)=>s.execute('setDefault',{addressId:address.addressId,expectedVersion:0,expectedUserVersion:0,
    idempotencyKey:'offline-default-key-000'+index}));
  const results=await Promise.allSettled(commands);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.find(r=>r.status==='rejected').reason.code,'VERSION_CONFLICT');
  assert.equal(s.state.users[s.a.record._id].defaultAddressId,a.addressId);assert.equal(s.state.users[s.b.record._id].defaultAddressId,null);
  const removed=await s.execute('remove',{addressId:a.addressId,expectedVersion:0,expectedUserVersion:1,idempotencyKey:'offline-remove-key-0001'});
  assert.equal(removed.userVersion,2);assert.equal(s.state.users[s.a.record._id].defaultAddressId,null);
  assert.equal(s.state.addresses[b.addressId].deletedAt,null);
});
test('X01 transaction failures roll back address/default/receipt atomically; retry does not duplicate create',async()=>{
  const s=setup();s.state.failReceipt=true;await assert.rejects(s.create());assert.equal(Object.keys(s.state.addresses).length,0);
  s.state.failReceipt=false;const address=await s.create();await s.execute('setDefault',{addressId:address.addressId,expectedVersion:0,expectedUserVersion:0,idempotencyKey:'offline-default-key-0001'});
  const before=JSON.stringify(s.state);s.state.failUser=true;
  await assert.rejects(s.execute('remove',{addressId:address.addressId,expectedVersion:0,expectedUserVersion:1,idempotencyKey:'offline-remove-key-0001'}));
  s.state.failUser=false;assert.equal(JSON.stringify(s.state),before);
});
test('X01 command receipt replays original response; same key changed input conflicts and deleted address is not resurrected',async()=>{
  const s=setup(),address=await s.create();assert.deepEqual(await s.create(),address);assert.equal(Object.keys(s.state.addresses).length,1);
  await assert.rejects(s.create('offline-create-key-0001',fields('不同地址')),e=>e.code==='IDEMPOTENCY_KEY_REUSED');
  await s.execute('remove',{addressId:address.addressId,expectedVersion:0,expectedUserVersion:0,idempotencyKey:'offline-remove-key-0001'});
  assert.deepEqual(await s.create(),address);assert.notEqual(s.state.addresses[address.addressId].deletedAt,null);
});
test('X01 current phone policy is required; forged owner/location and unverified map token/region codes fail closed',async()=>{
  const s=setup();await assert.rejects(s.make(undefined).execute({action:'create',payload:{address:fields(),idempotencyKey:'offline-create-key-0001'}},s.a.principal),e=>e.code==='CONFIGURATION_REQUIRED');
  for(const patch of [{phone:'123'},{ownerId:'B'},{location:{longitude:1,latitude:1}}])
    await assert.rejects(s.create('offline-create-key-0001',{...fields(),...patch}),e=>e.code==='INVALID_REQUEST');
  await assert.rejects(s.create('offline-create-key-0001',{...fields(),mapSelectionToken:'unverified-token'}),e=>e.code==='LOCATION_REQUIRED');
  await assert.rejects(s.create('offline-create-key-0001',{...fields(),regionCodes:{province:'34',city:'3401',district:'340124'}}),e=>e.code==='LOCATION_REQUIRED');
  assert.equal(Object.keys(s.state.addresses).length,0);
});
test('X01 stale address versions cannot update/select a snapshot, and unsigned list pagination is not offered',async()=>{
  const s=setup(),address=await s.create();await s.execute('update',{addressId:address.addressId,expectedVersion:0,address:fields('新地址'),idempotencyKey:'offline-update-key-0001'});
  await assert.rejects(s.execute('update',{addressId:address.addressId,expectedVersion:0,address:fields(),idempotencyKey:'offline-update-key-0002'}),e=>e.code==='VERSION_CONFLICT');
  assert.throws(()=>snapshotAddress(s.state.addresses[address.addressId],s.a.principal,0),e=>e.code==='VERSION_CONFLICT');
  await assert.rejects(s.execute('list',{}),e=>e.code==='CONFIGURATION_REQUIRED');
});
test('X01 trusted address records reject unnormalized coordinates and a default change cannot move the user timestamp backwards',async()=>{
  const s=setup(),address=await s.create(),record=s.state.addresses[address.addressId];
  record.location={longitude:117.2,latitude:31.1,coordinateSystem:'GCJ-02',source:'OFFLINE_TEST_ONLY',verifiedAt:1000};
  await assert.rejects(s.execute('get',{addressId:address.addressId}),e=>e.code==='INVALID_ADDRESS_RECORD');
  record.location.coordinateSystem='WGS84';record.location.privateToken='must-not-enter-snapshot';
  const snapshot=snapshotAddress(record,s.a.principal,0);assert.equal(snapshot.addressSnapshot.location.source,'OFFLINE_TEST_ONLY');
  assert(!('privateToken' in snapshot.addressSnapshot.location));
  record.location=null;s.state.users[s.a.record._id].updatedAt=9000;
  await assert.rejects(s.execute('setDefault',{addressId:address.addressId,expectedVersion:0,expectedUserVersion:0,idempotencyKey:'offline-default-key-0001'}),e=>e.code==='INVALID_USER_RECORD');
  assert.equal(s.state.users[s.a.record._id].defaultAddressId,null);
});
