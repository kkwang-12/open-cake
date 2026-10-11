'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,fields,clone}=require('./fixtures/address-cloud');
const create=(s,key='offline-address-create-key',index=0)=>s.call('create',{address:fields(),idempotencyKey:key},index);
test('native transport userInfo and tcbContext are ignored without changing platform identity or accepting extra business fields',async()=>{
 const s=fixture(),a=(await create(s)).data;
 const event={action:'get',payload:{addressId:a.addressId},userInfo:{openId:s.contexts[0].OPENID,appId:s.settings.appId},
  tcbContext:{OPENID:s.contexts[0].OPENID,APPID:s.settings.appId,ENV:s.settings.environment,role:'admin'}};
 assert.equal((await s.make()({action:'list',payload:{},tcbContext:event.tcbContext})).ok,true);
 assert.equal((await s.make()(event)).data.addressId,a.addressId);
 assert.equal((await s.make(s.contexts[1])(event)).error.code,'NOT_FOUND');
 assert.equal((await s.make({})(event)).error.code,'AUTH_REQUIRED');
 assert.equal((await s.make()({...event,ownerId:'forged'})).error.code,'INVALID_REQUEST');
 assert.equal((await s.make()({action:'list',payload:{userInfo:event.userInfo},userInfo:event.userInfo})).error.code,'INVALID_REQUEST');
 assert.equal((await s.make()({action:'list',payload:{tcbContext:event.tcbContext},tcbContext:event.tcbContext})).error.code,'INVALID_REQUEST');
 for(const privateValue of [s.contexts[0].OPENID,fields().phone])assert(!JSON.stringify(s.logs).includes('"'+privateValue+'"'));
});
test('native request diagnostics record structure and fixed codes without input values or unknown field names',async()=>{
 const s=fixture(),sensitive='PRIVATE_ADDRESS_INPUT_13800000000';
 const result=await s.make()({action:'list',payload:{[sensitive]:sensitive},[sensitive]:sensitive,requestId:sensitive});
 assert.equal(result.error.code,'INVALID_REQUEST');
 const diagnostic=s.logs.find(row=>row.code==='ADDRESS_INPUT_REJECTED');
 assert.equal(diagnostic.revision,'address-input-2');assert.equal(diagnostic.encoding,'OK');
 assert.equal(diagnostic.extraFieldHashes.length,1);assert.equal(diagnostic.payloadFieldHashes.length,1);
 assert(!JSON.stringify(s.logs).includes(sensitive));assert(!JSON.stringify(result).includes(sensitive));
 assert(!JSON.stringify(s.logs).includes(s.contexts[0].OPENID+'"'));
 assert.equal(Object.keys(s.state.addresses).length,0);
});
test('address handler rejects forged identity, unavailable configuration and malformed actions before any database operation',async()=>{
 const s=fixture();
 for(const event of [{action:'list',ownerId:'forged'},{action:'list',payload:{ownerId:'forged'}},
   {action:'create',payload:{address:{...fields(),location:{longitude:0}},idempotencyKey:'offline-address-create-key'}},{action:'missing'}]){
  assert.equal((await s.make()(event)).error.code,'INVALID_REQUEST');}
 for(const [context,expected] of [[{},'AUTH_REQUIRED'],[{...s.contexts[0],APPID:'other'},'APP_MISMATCH'],
  [{...s.contexts[0],ENV:'other'},'ENV_MISMATCH']])assert.equal((await s.make(context)({action:'list'})).error.code,expected);
 assert.equal((await s.make(undefined,{settings:{...s.settings,enabled:false}})({action:'list'})).error.code,'CONFIGURATION_REQUIRED');
 assert.equal(s.calls.length,0);
});
test('address cloud CRUD uses bounded native writes and safe receipts while every mutation advances the owner version',async()=>{
 const s=fixture(),created=await create(s);assert.equal(created.ok,true);const address=created.data;
 assert.equal(address.userVersion,1);assert.equal(address.location,null);assert(!('ownerId' in address));
 const receipt=Object.values(s.state.idempotency_records)[0];assert.equal(receipt.result.entityId,address.addressId);
 for(const sensitive of ['13800000000','仅离线联系人','仅离线门牌','response','openId'])assert(!JSON.stringify(receipt).includes(sensitive));
 const updated=await s.call('update',{addressId:address.addressId,expectedVersion:0,address:fields('更新门牌'),idempotencyKey:'offline-address-update-key'});
 assert.equal(updated.data.version,1);assert.equal(updated.data.userVersion,2);
 const selected=await s.call('setDefault',{addressId:address.addressId,expectedVersion:1,expectedUserVersion:2,idempotencyKey:'offline-address-default-key'});
 assert.equal(selected.data.version,3);assert.equal(selected.data.defaultAddressId,address.addressId);
 const removed=await s.call('remove',{addressId:address.addressId,expectedVersion:1,expectedUserVersion:3,idempotencyKey:'offline-address-remove-key'});
 assert.equal(removed.data.userVersion,4);assert.equal(Object.values(s.state.users)[0].defaultAddressId,null);
 assert.equal((await s.call('get',{addressId:address.addressId})).error.code,'NOT_FOUND');
 assert.equal((await s.call('list')).data.items.length,0);
 assert(s.calls.filter(c=>c.op==='update'&&c.name==='users').every(c=>Object.keys(c.data).sort().join(',')==='defaultAddressId,updatedAt,version'));
});
test('address replay reauthorizes and reprojects current fields without writes; changed-input or deleted target does not replay private DTO',async()=>{
 const s=fixture(),a=(await create(s)).data;
 await s.call('update',{addressId:a.addressId,expectedVersion:0,address:fields('当前门牌'),idempotencyKey:'offline-address-update-key'});
 const writes=s.calls.filter(c=>c.op==='add'||c.op==='update').length;
 const replay=await create(s);assert.equal(replay.data.detail,'当前门牌');assert.equal(replay.data.version,1);
 assert.equal(s.calls.filter(c=>c.op==='add'||c.op==='update').length,writes);
 assert.equal((await s.call('create',{address:fields('同键异参'),idempotencyKey:'offline-address-create-key'})).error.code,'IDEMPOTENCY_KEY_REUSED');
 await s.call('remove',{addressId:a.addressId,expectedVersion:1,expectedUserVersion:2,idempotencyKey:'offline-address-remove-key'});
 assert.equal((await create(s)).error.code,'NOT_FOUND');
 Object.values(s.state.users)[0].status='DISABLED';assert.equal((await create(s)).error.code,'AUTH_REQUIRED');
});
test('setting the same default with a new key stores the actual committed parent version in its safe receipt',async()=>{
 const s=fixture(),a=(await create(s)).data;
 const payload={addressId:a.addressId,expectedVersion:0,expectedUserVersion:1,idempotencyKey:'offline-address-first-default'};
 assert.equal((await s.call('setDefault',payload)).data.version,2);
 const result=await s.call('setDefault',{...payload,expectedUserVersion:2,idempotencyKey:'offline-address-same-default'});
 assert.equal(result.data.version,3);assert.equal(result.data.userVersion,3);
 const receipt=Object.values(s.state.idempotency_records).find(r=>r.key==='offline-address-same-default');
 assert.equal(receipt.result.version,3);assert.equal(receipt.result.entityId,Object.keys(s.state.users)[0]);
});
test('provider diagnostics expose fixed error categories only and keep ambiguous transaction failure internal',async()=>{
 const s=fixture(),privateMessage='PRIVATE_PROVIDER_FAILURE '+fields().phone;
 const repository={loadCustomer:async()=>({}),list:async()=>{throw Object.assign(new Error(privateMessage),{code:'DATABASE_TRANSACTION_FAIL',errCode:-502001});}};
 const result=await s.make(undefined,{repository})({action:'list'});
 assert.equal(result.error.code,'INTERNAL_ERROR');
 const diagnostic=s.logs.find(row=>row.code==='ADDRESS_PROVIDER_REJECTED');
 assert.equal(diagnostic.providerCode,'DATABASE_TRANSACTION_FAIL');assert.equal(diagnostic.sdkErrorNumber,-502001);
 assert.equal(diagnostic.conflictToken,false);assert.equal(diagnostic.terminatedToken,false);
 assert(!JSON.stringify([s.logs,result]).includes(privateMessage));assert(!JSON.stringify([s.logs,result]).includes(fields().phone));
});
test('address get/update/default/remove refuse another owner; signed pages bind both current owner and address revision',async()=>{
 const s=fixture(),a=(await create(s)).data;
 for(const action of ['get','update','remove','setDefault']){
  const payload={addressId:a.addressId};if(action!=='get'){payload.expectedVersion=0;payload.idempotencyKey='offline-address-cross-user';}
  if(action==='update')payload.address=fields();if(['remove','setDefault'].includes(action))payload.expectedUserVersion=0;
  assert.equal((await s.call(action,payload,1)).error.code,'NOT_FOUND');
 }
 await create(s,'offline-address-create-key-two');const first=await s.call('list',{pageSize:1});
 assert.equal(first.data.items.length,1);assert(first.data.hasMore);
 const next=await s.call('list',{pageSize:50,cursor:first.data.nextCursor});assert.equal(next.data.items.length,1);
 assert.notEqual(next.data.items[0].addressId,first.data.items[0].addressId);
 assert.equal((await s.call('list',{pageSize:1,cursor:first.data.nextCursor},1)).error.code,'CURSOR_INVALID');
 assert.equal((await s.call('list',{cursor:first.data.nextCursor+'x'})).error.code,'CURSOR_INVALID');
 await create(s,'offline-address-create-key-three');assert.equal((await s.call('list',{cursor:first.data.nextCursor})).error.code,'CURSOR_INVALID');
 const query=s.calls.find(c=>c.op==='query'&&c.condition.$and);assert.equal(query.condition.$and[0].ownerId,Object.keys(s.state.users)[0]);
 assert.deepEqual(query.orders,[['updatedAt','desc'],['_id','desc']]);assert.equal(query.size,51);
});
test('competing default changes and stale edits have one winner under the per-owner version guard',async()=>{
 const s=fixture(),a=(await create(s)).data,b=(await create(s,'offline-address-second-key')).data;
 const defaults=await Promise.all([a,b].map((address,i)=>s.call('setDefault',{addressId:address.addressId,expectedVersion:0,
  expectedUserVersion:2,idempotencyKey:'offline-address-default-'+i})));
 assert.equal(defaults.filter(r=>r.ok).length,1);assert.equal(defaults.find(r=>!r.ok).error.code,'VERSION_CONFLICT');
 const edits=await Promise.all([0,1].map(i=>s.call('update',{addressId:a.addressId,expectedVersion:0,address:fields('编辑'+i),
  idempotencyKey:'offline-address-edit-'+i})));
 assert.equal(edits.filter(r=>r.ok).length,1);assert.equal(edits.find(r=>!r.ok).error.code,'VERSION_CONFLICT');
});
test('address, receipt and parent-guard write failures roll back together and provider details remain private',async()=>{
 for(const name of ['addresses','idempotency_records','users']){
  const s=fixture(),before=clone(s.state);s.setFailure(name);const result=await create(s);
  assert.equal(result.error.code,'INTERNAL_ERROR');assert.deepEqual(s.state,before);
  assert(!JSON.stringify([result,s.logs]).includes('PRIVATE_PROVIDER_FAILURE'));s.setFailure('');assert.equal((await create(s)).ok,true);
 }
 const s=fixture(),a=(await create(s)).data;await s.call('setDefault',{addressId:a.addressId,expectedVersion:0,expectedUserVersion:1,idempotencyKey:'offline-address-default-key'});
 const before=clone(s.state);s.setFailure('users');assert.equal((await s.call('remove',{addressId:a.addressId,expectedVersion:0,expectedUserVersion:2,
  idempotencyKey:'offline-address-remove-key'})).ok,false);assert.deepEqual(s.state,before);
});
test('address mutations reject unverified locations and exact platform privacy fields never enter logs',async()=>{
 const s=fixture();for(const address of [{...fields(),mapSelectionToken:'unverified-token'},
  {...fields(),regionCodes:{province:'34',city:'3401',district:'340124'}},{...fields(),phone:'123'}])
  assert.equal((await s.call('create',{address,idempotencyKey:'offline-address-invalid-key'})).ok,false);
 assert.equal(Object.keys(s.state.addresses).length,0);
 for(const privateValue of [s.contexts[0].OPENID,fields().phone,fields().receiverName])assert(!JSON.stringify(s.logs).includes('"'+privateValue+'"'));
});
