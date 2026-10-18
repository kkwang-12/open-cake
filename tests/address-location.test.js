'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {createTencentAddressGeocoder,createAddressLocationVerifier}=require('../cloudfunctions/_shared/address-location');
const {fixture,fields,clone}=require('./fixtures/address-cloud');
const {resolveCustomer}=require('../cloudfunctions/_shared/authorization-model');
const {publicAddress}=require('../cloudfunctions/_shared/address-model');
function setup(){
  const s=fixture();let clock=2000,mapCalls=0;
  const settings={...s.settings,locationEnabled:true};
  const verifier=createAddressLocationVerifier({appId:settings.appId,environment:settings.environment,secret:Buffer.alloc(32,19),now:()=>clock,
    geocode:async()=>{mapCalls++;return {longitude:117.288694,latitude:31.149852,coordinateSystem:'GCJ02'};}});
  const call=(action,payload={},index=0)=>s.make(s.contexts[index],{settings,locationVerifier:verifier})({action,payload});
  const resolve=(address=fields(),target={})=>call('location.resolve',{address,...target});
  const principal=index=>resolveCustomer(s.contexts[index],settings,Object.values(s.state.users)[index]);
  return {...s,settings,verifier,call,resolve,principal,setClock:v=>{clock=v;},mapCalls:()=>mapCalls};
}
test('address location resolves without writes, then saves the native-owner bound point/proof with the existing atomic command',async()=>{
  const s=setup(),before=clone(s.state),r=await s.resolve();assert.equal(r.ok,true);assert.deepEqual(s.state,before);assert.equal(s.mapCalls(),1);
  const selected=r.data;assert(selected.mapSelectionToken.length<=256);assert.equal(selected.expiresAt,902000);
  const result=await s.call('create',{address:{...fields(),mapSelectionToken:selected.mapSelectionToken},idempotencyKey:'offline-located-create-key'});
  assert.equal(result.ok,true);assert.equal(result.data.location.coordinateSystem,'GCJ02');assert.equal(result.data.userVersion,1);
  const record=Object.values(s.state.addresses)[0];assert.match(record.locationProof,/^v1\.[\w-]{43}$/);assert(s.verifier.verify(record,s.principal(0)));
  const output=JSON.stringify([result,s.logs,Object.values(s.state.idempotency_records)]);
  for(const hidden of [selected.mapSelectionToken,record.locationProof,'TENCENT_GEOCODER_V1'])assert(!output.includes(hidden));
  assert(!Object.hasOwn(publicAddress(record),'locationProof'));assert.equal(s.mapCalls(),1);
});
test('address selection tokens reject tampering, different owners/fields/targets and expiry without new writes',async()=>{
  const s=setup(),selected=(await s.resolve()).data.mapSelectionToken;
  for(const [address,index]of [[{...fields('different'),mapSelectionToken:selected},0],[{...fields(),phone:'13900000000',mapSelectionToken:selected},0],
    [{...fields(),mapSelectionToken:selected},1],[{...fields(),mapSelectionToken:selected+'x'},0]]){
    const r=await s.call('create',{address,idempotencyKey:'offline-rejected-token-key'},index);assert.equal(r.error.code,'LOCATION_REQUIRED');
  }
  assert.equal(Object.keys(s.state.addresses).length,0);assert.equal(Object.keys(s.state.idempotency_records).length,0);
  assert.throws(()=>s.verifier.accept(selected,fields(),s.principal(0),{addressId:null,expectedVersion:null},902000),e=>e.code==='LOCATION_REQUIRED');
  assert.throws(()=>s.verifier.accept(selected,fields(),s.principal(0),{addressId:null,expectedVersion:null},1999),e=>e.code==='LOCATION_REQUIRED');
  assert.throws(()=>s.verifier.accept(selected,fields(),s.principal(0),{addressId:'different',expectedVersion:0},2001),e=>e.code==='LOCATION_REQUIRED');
});
test('located address update binds current version; an ordinary edit clears the old location and proof',async()=>{
  const s=setup(),a=(await s.call('create',{address:fields(),idempotencyKey:'offline-unlocated-create'})).data;
  const r=await s.resolve(fields('new'),{addressId:a.addressId,expectedVersion:0});assert.equal(r.ok,true);
  assert.equal((await s.resolve(fields(),{addressId:a.addressId,expectedVersion:1})).error.code,'VERSION_CONFLICT');
  const calls=s.mapCalls();assert.equal((await s.call('location.resolve',{address:fields(),addressId:a.addressId,expectedVersion:0},1)).error.code,'NOT_FOUND');assert.equal(s.mapCalls(),calls);
  const updated=await s.call('update',{addressId:a.addressId,expectedVersion:0,address:{...fields('new'),mapSelectionToken:r.data.mapSelectionToken},idempotencyKey:'offline-located-update'});
  assert.equal(updated.ok,true);s.setClock(3000);assert(s.verifier.verify(s.state.addresses[a.addressId],s.principal(0)));
  const edited=await s.call('update',{addressId:a.addressId,expectedVersion:1,address:fields('manual edit'),idempotencyKey:'offline-clear-location'});
  assert.equal(edited.data.location,null);assert.equal(s.state.addresses[a.addressId].locationProof,null);
});
test('located command receipt replays after token expiry without re-geocoding; failures roll back point, proof, receipt and owner guard',async()=>{
  const s=setup(),token=(await s.resolve()).data.mapSelectionToken;
  const payload={address:{...fields(),mapSelectionToken:token},idempotencyKey:'offline-located-replay-key'};
  s.setFailure('users');assert.equal((await s.call('create',payload)).error.code,'INTERNAL_ERROR');assert.equal(Object.keys(s.state.addresses).length,0);
  assert.equal(Object.keys(s.state.idempotency_records).length,0);s.setFailure('');assert.equal((await s.call('create',payload)).ok,true);
  const writes=s.calls.filter(c=>['add','update'].includes(c.op)).length;s.setClock(999999);s.setTime(999999);
  assert.equal((await s.call('create',payload)).ok,true);assert.equal(s.calls.filter(c=>['add','update'].includes(c.op)).length,writes);assert.equal(s.mapCalls(),1);
  assert.equal((await s.call('create',{...payload,idempotencyKey:'offline-expired-new-key'})).error.code,'LOCATION_REQUIRED');
});
test('saved address proof rejects altered coordinates, content, version, owner, scope and deletion; snapshots do not expose it',async()=>{
  const s=setup(),token=(await s.resolve()).data.mapSelectionToken;
  await s.call('create',{address:{...fields(),mapSelectionToken:token},idempotencyKey:'offline-proof-binding-key'});
  const record=Object.values(s.state.addresses)[0];
  for(const change of [a=>a.version++,a=>a.detail='changed',a=>a.ownerId=Object.keys(s.state.users)[1],a=>a.location.longitude+=0.001,
    a=>a.location.source='CALLER',a=>a.location.coordinateSystem='WGS84',a=>a.location.verifiedAt--,a=>a.deletedAt=a.updatedAt,a=>a.locationProof='v1.'+'a'.repeat(43)]){
    const altered=clone(record);change(altered);assert.equal(s.verifier.verify(altered,s.principal(0)),false);
  }
  assert.equal(s.verifier.verify(record,s.principal(1)),false);
  const other=createAddressLocationVerifier({appId:s.settings.appId,environment:'other',secret:Buffer.alloc(32,19),now:()=>3000});
  assert.equal(other.verify(record,s.principal(0)),false);
});
test('resolver refuses disabled configuration and invalid/forged input before calling Tencent',async()=>{
  const s=setup();for(const payload of [{address:fields(),expectedVersion:0},{address:{...fields(),mapSelectionToken:'forged'}},
    {address:{...fields(),location:{latitude:1}}},{address:fields(),ownerId:'caller'}])assert.equal((await s.call('location.resolve',payload)).error.code,'INVALID_REQUEST');
  assert.equal((await s.make(s.contexts[0])({action:'location.resolve',payload:{address:fields()}})).error.code,'CONFIGURATION_REQUIRED');assert.equal(s.mapCalls(),0);
});
const providerResult=()=>({status:0,result:{location:{lng:117.288694,lat:31.149852},address_components:{province:'安徽省',city:'合肥市',district:'庐江县'},reliability:8,level:11,similarity:0.95}});
function http(value,options={}){return (url,callback)=>{if(options.inspect)options.inspect(url);const request=new EventEmitter();request.setTimeout=()=>{};request.destroy=()=>{};
  queueMicrotask(()=>{const response=new EventEmitter();response.statusCode=options.status||200;response.resume=()=>{};response.destroy=()=>{};callback(response);
    response.emit('data',Buffer.from(options.raw===undefined?JSON.stringify(value):options.raw));response.emit('end');});return request;};}
test('Tencent adapter sends only address to a fixed HTTPS host and rejects vague, cross-region and malformed provider results',async()=>{
  let requestUrl;const geocode=createTencentAddressGeocoder({key:'PRIVATE_TEST_KEY',get:http(providerResult(),{inspect:url=>{requestUrl=url;}})});
  assert.deepEqual(await geocode(fields()),{longitude:117.288694,latitude:31.149852,coordinateSystem:'GCJ02'});
  assert.equal(requestUrl.origin,'https://apis.map.qq.com');assert.equal(requestUrl.pathname,'/ws/geocoder/v1/');assert(!requestUrl.href.includes('13800000000'));
  for(const change of [r=>r.status=120,r=>r.result.location.lng=181,r=>r.result.level=3,r=>r.result.reliability=6,
    r=>r.result.similarity=0.5,r=>r.result.address_components.city='其他市',r=>delete r.result.location,r=>r.result=null]){
    const r=providerResult();change(r);await assert.rejects(createTencentAddressGeocoder({key:'TEST',get:http(r)})(fields()),e=>e.code==='LOCATION_REQUIRED');
  }
  for(const options of [{status:302},{raw:'not-json'},{raw:'x'.repeat(65537)}])await assert.rejects(createTencentAddressGeocoder({key:'TEST',get:http(null,options)})(fields()),e=>e.code==='LOCATION_REQUIRED');
  await assert.rejects(createTencentAddressGeocoder({key:'',get:()=>assert.fail('must not call')})(fields()),e=>e.code==='CONFIGURATION_REQUIRED');
});
const {createAddressClient}=require('../miniprogram/features/addresses/address-client');
const {createError}=require('../miniprogram/services/errors');
function clientSetup(){
  const s=fixture({now:Date.now}),serverSettings={...s.settings,locationEnabled:true};
  let mapResponse=0;
  const verifier=createAddressLocationVerifier({appId:s.settings.appId,environment:s.settings.environment,secret:Buffer.alloc(32,19),
    geocode:async()=>({longitude:117.288694,latitude:31.149852+(mapResponse++)*0.000001,coordinateSystem:'GCJ02'})});
  let actor=0,lost=false,sequence=0,alter=null;const calls=[],storage=new Map();
  const transport={async call(domain,action,payload){assert.equal(domain,'address');calls.push({action,payload:clone(payload)});
    const r=await s.make(s.contexts[actor],{settings:serverSettings,locationVerifier:verifier})({action,payload});
    if(!r.ok)throw createError(r.error.code);if(action==='location.resolve'&&alter)alter(r);
    if(action==='create'&&lost){lost=false;throw createError('CLOUD_CALL_FAILED');}return {data:r.data};}};
  const settings={mode:'cloud',appId:s.settings.appId,stage:'development',cloudEnvironments:{development:s.settings.environment},addresses:{enabled:true,locationEnabled:true}};
  const client=createAddressClient(settings,()=>({getStorageSync:key=>clone(storage.get(key)||''),setStorageSync:(key,value)=>storage.set(key,clone(value))}),transport,undefined,()=> 'offline-map-client-'+(++sequence));
  const {regionCodes,...input}=fields();return {s,client,input,calls,storage,lose:()=>{lost=true;},switchActor:i=>{actor=i;},alter:f=>{alter=f;}};
}
test('address client passes only the selected token and preserves its exact original key/payload after a lost response',async()=>{
  const c=clientSetup(),selection=await c.client.resolveLocation(c.input);assert.equal(Object.keys(c.s.state.addresses).length,0);
  c.lose();await assert.rejects(c.client.create(c.input,0,selection.mapSelectionToken),e=>e.code==='CLOUD_CALL_FAILED');
  const recovered=await c.client.create(c.input,0,selection.mapSelectionToken);assert.equal(recovered.addresses.length,1);assert.equal(recovered.addresses[0].location.coordinateSystem,'GCJ02');
  const commands=c.calls.filter(row=>row.action==='create');assert.deepEqual(commands[0].payload,commands[1].payload);
  assert.equal(Object.keys(c.s.state.idempotency_records).length,1);assert([...c.storage.values()].every(v=>v.length===0));assert.equal(c.client.selectionAllowed,false);
});
test('address client refuses changed-account, legacy coordinates, private proof fields and expired selections',async()=>{
  for(const change of [r=>r.data.location.coordinateSystem='WGS84',r=>r.data.locationProof='private',r=>r.data.expiresAt=1,
    r=>r.data.mapSelectionToken='unsigned']){
    const c=clientSetup();c.alter(change);await assert.rejects(c.client.resolveLocation(c.input),e=>e.code==='INVALID_RESPONSE');assert.equal(Object.keys(c.s.state.addresses).length,0);
  }
  const c=clientSetup();c.alter(()=>c.switchActor(1));await assert.rejects(c.client.resolveLocation(c.input),e=>e.code==='INVALID_RESPONSE');assert.equal(Object.keys(c.s.state.addresses).length,0);
});
test('refreshing or dropping a token after lost output recovers the original key and token rather than creating another address',async()=>{
  for(const refresh of [true,false]){
    const c=clientSetup(),first=await c.client.resolveLocation(c.input);c.lose();
    await assert.rejects(c.client.create(c.input,0,first.mapSelectionToken),e=>e.code==='CLOUD_CALL_FAILED');
    const second=refresh?await c.client.resolveLocation(c.input):null;if(second)assert.notEqual(first.mapSelectionToken,second.mapSelectionToken);
    const book=await c.client.create(c.input,0,second?second.mapSelectionToken:undefined);
    const commands=c.calls.filter(row=>row.action==='create');assert.deepEqual(commands[0].payload,commands[1].payload);
    assert.equal(book.addresses.length,1);assert.equal(Object.keys(c.s.state.idempotency_records).length,1);assert.equal(Object.values(c.s.state.users)[0].version,1);
  }
});
test('a caller expected subject mismatch prevents address writes before a new intent is persisted',async()=>{
  const c=clientSetup();await assert.rejects(c.client.create(c.input,0,undefined,'f'.repeat(16)),e=>e.code==='AUTH_REQUIRED');
  assert.equal(Object.keys(c.s.state.addresses).length,0);assert.equal(c.calls.filter(row=>row.action==='create').length,0);assert.equal(c.storage.size,0);
});
