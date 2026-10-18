'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,fields,clone}=require('./fixtures/address-cloud');
const {createAddressClient}=require('../miniprogram/features/addresses/address-client');
const {createError}=require('../miniprogram/services/errors');
const {createClient}=require('../miniprogram/services/cloud');
function setup(){
 const s=fixture(),settings={appId:s.settings.appId,stage:'development',mode:'cloud',
  cloudEnvironments:{development:s.settings.environment},addresses:{enabled:true}};
 const storage=new Map(),calls=[];let sequence=0,loseNext=false,actor=0;
 const platform=()=>({getStorageSync:key=>clone(storage.get(key)||''),setStorageSync:(key,value)=>storage.set(key,clone(value))});
 const transport={async call(domain,action,payload){assert.equal(domain,'address');calls.push({action,payload:clone(payload)});
  const r=await s.call(action,payload,actor);if(!r.ok)throw createError(r.error.code);
  if(action==='create'&&loseNext){loseNext=false;throw createError('CLOUD_CALL_FAILED');}return {data:r.data};}};
 const make=()=>createAddressClient(settings,platform,transport,undefined,()=> 'offline-client-key-'+(++sequence));
 const draft=()=>{const {regionCodes,...value}=fields();return value;};
 return {s,settings,storage,calls,platform,transport,make,draft,lose:()=>{loseNext=true;},switchActor:index=>{actor=index;}};
}
test('cloud address client persists and reuses the original command key after a lost response and client restart',async()=>{
 const c=setup();c.lose();await assert.rejects(c.make().create(c.draft(),0),e=>e.code==='CLOUD_CALL_FAILED');
 assert.equal(Object.keys(c.s.state.addresses).length,1);
 const recovered=await c.make().create(c.draft(),0);assert.equal(recovered.addresses.length,1);assert.equal(recovered.scope,'CLOUD_OWNER');
 const creates=c.calls.filter(x=>x.action==='create');assert.equal(creates[0].payload.idempotencyKey,creates[1].payload.idempotencyKey);
 assert.equal(Object.values(c.s.state.users)[0].version,1);assert([...c.storage.values()].every(v=>v.length===0));
});
test('cloud address CRUD refreshes authoritative versions/defaults and does not use old local address books',async()=>{
 const c=setup(),client=c.make(),created=await client.create(c.draft(),0),address=created.addresses[0];
 assert.equal(address.isDefault,false);assert.equal(address.location,null);
 const updated=await client.update(address.addressId,0,{...c.draft(),detail:'修改地址'},created.revision);
 assert.equal(updated.revision,2);assert.equal(updated.addresses[0].version,1);
 const selected=await client.setDefault(address.addressId,1,updated.revision);assert.equal(selected.addresses[0].isDefault,true);
 const removed=await client.remove(address.addressId,1,selected.revision);assert.equal(removed.defaultAddressId,null);assert.equal(removed.addresses.length,0);
 assert.equal(client.selectionAllowed,false);assert.throws(()=>client.choose(address.addressId,1,3),e=>e.code==='CONFIGURATION_REQUIRED');
 assert(![...c.storage.keys()].some(key=>key.startsWith('jiajiale.local-addresses')));
});

test('cloud address DTO keeps GCJ02, rejects old WGS84 and cannot turn server coordinates into checkout permission',async()=>{
 const c=setup(),client=c.make(),created=await client.create(c.draft(),0);
 const record=c.s.state.addresses[created.addresses[0].addressId];
 record.location={longitude:117.2886,latitude:31.1498,coordinateSystem:'GCJ02',source:'OFFLINE_TEST_ONLY',verifiedAt:record.updatedAt};
 const result=await client.list();assert.deepEqual(result.addresses[0].location,{longitude:117.2886,latitude:31.1498,coordinateSystem:'GCJ02'});
 assert.equal(client.selectionAllowed,false);
 const transport={async call(domain,action,payload){const response=clone(await c.transport.call(domain,action,payload));
   if(action==='list')for(const row of response.data.items)row.location.coordinateSystem='WGS84';return response;}};
 const forged=createAddressClient(c.settings,c.platform,transport);
 await assert.rejects(forged.list(),e=>e.code==='INVALID_RESPONSE');
});
test('account switches isolate unfinished command keys and returning to the original account recovers its lost response',async()=>{
 const c=setup();c.lose();await assert.rejects(c.make().create(c.draft(),0),e=>e.code==='CLOUD_CALL_FAILED');
 c.switchActor(1);const other=await c.make().create(c.draft(),0);assert.equal(other.addresses.length,1);
 c.switchActor(0);const original=await c.make().create(c.draft(),0);assert.equal(original.addresses.length,1);
 const keys=c.calls.filter(x=>x.action==='create').map(x=>x.payload.idempotencyKey);
 assert.equal(keys[0],keys[2]);assert.notEqual(keys[0],keys[1]);
 assert.equal(Object.keys(c.s.state.addresses).length,2);assert.equal(Object.keys(c.s.state.idempotency_records).length,2);
 assert.equal(c.storage.size,2);assert([...c.storage.values()].every(v=>v.length===0));
});
test('disabled address action and failed command-draft persistence never call the cloud or silently save locally',async()=>{
 let calls=0;const settings={mode:'cloud',stage:'development',appId:'offline-app',cloudEnvironments:{development:'offline-env'},addresses:{enabled:false}};
 const api=()=>({cloud:{init(){calls++;},callFunction(){calls++;}}});
 const raw=createClient(settings,api,{warn(){}});for(const action of ['list','get','create','update','remove','setDefault'])
  await assert.rejects(raw.call('address',action),e=>e.code==='CLOUD_NOT_CONFIGURED');assert.equal(calls,0);
 const c=setup(),client=createAddressClient(c.settings,()=>({getStorageSync:()=>'',setStorageSync:()=>{throw new Error('FULL');}}),c.transport);
 await assert.rejects(client.create(c.draft(),0),e=>e.code==='LOCAL_ADDRESS_WRITE_FAILED');assert(c.calls.every(c=>c.action==='list'));
});
test('address location verification stays hidden and makes no requests until its independent client switch is enabled',async()=>{
 const c=setup(),client=c.make();assert.equal(client.locationVerificationAvailable,false);
 await assert.rejects(client.resolveLocation(c.draft()),e=>e.code==='CLOUD_NOT_CONFIGURED');assert.equal(c.calls.length,0);
});
test('cloud address pages reject duplicate rows, cursor loops and private fields rather than show incomplete addresses',async()=>{
 const c=setup(),book=await c.make().create(c.draft(),0),address=book.addresses[0];const {isDefault,...row}=address;
 for(const modify of [d=>d.items.push(clone(row)),d=>d.items[0].ownerId='private-owner',d=>{d.hasMore=true;d.nextCursor='repeated-cursor';}]){
  const data={apiVersion:'v1-api-2026-10-03',subjectHash:book.subjectHash,items:[clone(row)],hasMore:false,nextCursor:null,userVersion:1,defaultAddressId:null};modify(data);
  const client=createAddressClient(c.settings,c.platform,{call:async()=>({data})});await assert.rejects(client.list(),e=>e.code==='INVALID_RESPONSE');
 }
});
