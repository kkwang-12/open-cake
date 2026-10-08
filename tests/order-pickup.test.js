'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {setup}=require('./fixtures/order-pickup');
const {clone}=require('./fixtures/quote');
const {createPickupCredentialModel}=require('../cloudfunctions/_shared/pickup-credential-model');
const {createOrderPickupService}=require('../cloudfunctions/_shared/order-pickup-service');
const {createOrderReadModel}=require('../cloudfunctions/_shared/order-read-model');
const {requestFingerprint}=require('../cloudfunctions/_shared/idempotency-model');
const rejects=(fn,code)=>assert.rejects(async()=>fn(),error=>error.code===code);
const credential=async s=>(await s.pickupService.get(s.getEvent,s.principal)).credential.value;
const order=s=>s.db.orders[s.orderId];
const frozenResources=s=>JSON.stringify([s.db.stocks,s.db.slots,s.db.reservations]);

test('O07 requires explicit E10 policy and strong server keys; no production defaults',async()=>{
  const s=await setup();
  for(const field of ['ttlMs','maxFailedAttempts','attemptCooldownMs','format','slotCompletion','version']){
    const policy={...s.policy};delete policy[field];
    assert.throws(()=>createPickupCredentialModel({...s.options,policy}),e=>e.code==='CONFIGURATION_REQUIRED');
  }
  for(const patch of [{format:'QR'},{ttlMs:0},{maxFailedAttempts:0},{attemptCooldownMs:0},{slotCompletion:'RELEASE'}])
    assert.throws(()=>createPickupCredentialModel({...s.options,policy:{...s.policy,...patch}}),e=>e.code==='CONFIGURATION_REQUIRED');
  assert.throws(()=>createPickupCredentialModel({...s.options,keys:{OFFLINE_VALUE_KEY:Buffer.alloc(1),OFFLINE_RECEIPT_KEY:Buffer.alloc(32)}}),
    e=>e.code==='INVALID_CONFIGURATION');
});

test('O07 only owned READY paid pickup orders issue credentials',async()=>{
  const s=await setup(),before=JSON.stringify(s.db);
  await rejects(()=>s.pickupService.get(s.getEvent,s.actor('other')),'USER_NOT_PROVISIONED');
  s.makeQuote({customer:s.actor('other')});const snapshot=JSON.stringify(s.db);
  await rejects(()=>s.pickupService.get(s.getEvent,s.actor('other')),'FORBIDDEN');assert.equal(JSON.stringify(s.db),snapshot);
  assert.notEqual(before,snapshot);
  for(const status of ['PENDING_PAYMENT','PAID','ACCEPTED','MAKING','CANCELLED','COMPLETED']){
    const x=await setup();order(x).orderStatus=status;
    if(status==='PENDING_PAYMENT'){order(x).paymentStatus='UNPAID';order(x).paidCents=0;order(x).paidAt=null;}
    await rejects(()=>x.pickupService.get(x.getEvent,x.principal),'INVALID_TRANSITION');
  }
  const x=await setup();order(x).fulfillment='DELIVERY';
  await rejects(()=>x.pickupService.get(x.getEvent,x.principal),'INVALID_TRANSITION');
});

test('O07 repeated owner reads and concurrent reads reuse one committed credential',async()=>{
  const s=await setup(),version=order(s).version;
  const reads=await Promise.all([s.pickupService.get(s.getEvent,s.principal),s.pickupService.get(s.getEvent,s.principal)]);
  assert.deepEqual(reads.map(x=>x.disposition),['ISSUED','EXISTING']);
  assert.deepEqual(reads[0].credential,reads[1].credential);assert.equal(order(s).version,version+1);
  assert.deepEqual(Object.keys(reads[0].credential).sort(),['expiresAt','format','orderId','value']);
  assert.match(reads[0].credential.value,/^[a-f0-9]{64}$/);assert.equal(reads[0].callable,false);
});

test('O07 value binds secret/environment/app/order/owner/store and cannot be public order number',async()=>{
  const s=await setup(),value=await credential(s),stored=clone(order(s));
  assert.notEqual(value,stored.orderNo);assert.notEqual(value,stored.pickupCredential.digest);
  for(const field of ['_id','ownerId','storeId']){
    const changed={...stored,[field]:stored[field]+'-changed'};
    assert.throws(()=>createPickupCredentialModel(s.options).get(changed,s.controls.now),e=>e.code==='INVALID_PICKUP_CREDENTIAL');
  }
  for(const field of ['environment','appId'])assert.throws(()=>
    createPickupCredentialModel({...s.options,[field]:s.options[field]+'-changed'}).get(stored,s.controls.now),e=>e.code==='INVALID_PICKUP_CREDENTIAL');
});

test('O07 completion atomically marks credential used/order complete/log/receipt without resource restoration',async()=>{
  const s=await setup(),value=await credential(s),before=frozenResources(s),version=order(s).version;
  const result=await s.pickupService.complete(s.completeEvent(value),s.merchant);
  assert.equal(result.disposition,'COMPLETED');assert.equal(result.result.errorCode,null);
  assert.equal(order(s).orderStatus,'COMPLETED');assert.equal(order(s).version,version+1);
  assert.equal(order(s).pickupCredential.usedAt,s.controls.now);assert.equal(order(s).pickupCredential.usedBy,s.merchant.subjectId);
  assert.equal(order(s).completedAt,s.controls.now);assert.equal(frozenResources(s),before);
  assert.equal(Object.values(s.db.logs).filter(log=>log.command==='COMPLETE_PICKUP').length,1);
  assert.equal(s.controls.lastWrites,3);
});

test('O07 same-key replay and response-loss restart complete only once, even after expiry',async()=>{
  const s=await setup(),value=await credential(s),event=s.completeEvent(value),first=await s.pickupService.complete(event,s.merchant);
  const before=JSON.stringify(s.db);s.controls.now+=s.policy.ttlMs;
  const retry=await createOrderPickupService(s.options).complete(event,s.merchant);
  assert.equal(retry.disposition,'REPLAY');assert.deepEqual(retry.result,first.result);assert.equal(JSON.stringify(s.db),before);
  await rejects(()=>s.pickupService.complete(s.completeEvent(value,'different-key'),s.merchant),'INVALID_TRANSITION');
  await rejects(()=>s.pickupService.get(s.getEvent,s.principal),'INVALID_TRANSITION');
});

test('O07 concurrent same-key verification produces one completion and one replay',async()=>{
  const s=await setup(),event=s.completeEvent(await credential(s));
  const results=await Promise.all([s.pickupService.complete(event,s.merchant),s.pickupService.complete(event,s.merchant)]);
  assert.deepEqual(results.map(x=>x.disposition),['COMPLETED','REPLAY']);
  assert.equal(Object.values(s.db.logs).filter(log=>log.command==='COMPLETE_PICKUP').length,1);
});

test('O07 competing distinct keys cannot complete twice, and lost issuance response recovers the same value',async()=>{
  const s=await setup();await s.pickupService.get(s.getEvent,s.principal); // committed response discarded
  const recovered=await createOrderPickupService(s.options).get(s.getEvent,s.principal),value=recovered.credential.value;
  assert.equal(recovered.disposition,'EXISTING');const a=s.completeEvent(value,'first-key'),b=s.completeEvent(value,'second-key');
  const results=await Promise.allSettled([s.pickupService.complete(a,s.merchant),s.pickupService.complete(b,s.merchant)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.find(r=>r.status==='rejected').reason.code,'VERSION_CONFLICT');
  assert.equal(Object.values(s.db.logs).filter(log=>log.command==='COMPLETE_PICKUP').length,1);
});

test('O07 same-key different credential cannot replay previous success',async()=>{
  const s=await setup(),event=s.completeEvent(await credential(s));await s.pickupService.complete(event,s.merchant);
  await rejects(()=>s.pickupService.complete({...event,payload:{...event.payload,pickupCredential:'wrong'}},s.merchant),'IDEMPOTENCY_KEY_REUSED');
});

test('O07 inconsistent completed receipt and order evidence cannot produce a success replay',async()=>{
  const s=await setup(),event=s.completeEvent(await credential(s));await s.pickupService.complete(event,s.merchant);
  order(s).pickupCredential.usedBy='another-merchant';
  await rejects(()=>s.pickupService.complete(event,s.merchant),'INVALID_IDEMPOTENCY_RECORD');
  order(s).pickupCredential.usedBy=s.merchant.subjectId;order(s).pickupCredential.usedAt=null;order(s).completedAt=null;
  await rejects(()=>s.pickupService.complete(event,s.merchant),'INVALID_IDEMPOTENCY_RECORD');
});

test('O07 customers and cross-store/revoked/insufficient roles cannot verify or guess',async()=>{
  const s=await setup(),event=s.completeEvent(await credential(s)),before=JSON.stringify(s.db);
  await rejects(()=>s.pickupService.complete(event,s.principal),'FORBIDDEN');assert.equal(JSON.stringify(s.db),before);
  for(const patch of [{storeIds:['another-store']},{status:'REVOKED',revokedAt:s.controls.now},{capabilities:['AUDIT_READ']}]){
    const x=await setup(),request=x.completeEvent(await credential(x));Object.assign(x.db.roles[x.roleId],patch);
    const snapshot=JSON.stringify(x.db);await rejects(()=>x.pickupService.complete(request,x.merchant),'FORBIDDEN');
    assert.equal(JSON.stringify(x.db),snapshot);
  }
});

test('O07 replay still requires current user and role authority',async()=>{
  const s=await setup(),event=s.completeEvent(await credential(s));await s.pickupService.complete(event,s.merchant);
  s.db.roles[s.roleId].status='REVOKED';s.db.roles[s.roleId].revokedAt=s.controls.now;
  await rejects(()=>s.pickupService.complete(event,s.merchant),'FORBIDDEN');
  s.db.roles[s.roleId].status='ACTIVE';s.db.roles[s.roleId].revokedAt=null;s.db.users[s.merchant.subjectId].status='DISABLED';
  await rejects(()=>s.pickupService.complete(event,s.merchant),'USER_DISABLED');
});

test('O07 stale version and malformed/missing input do not count as code attempts',async()=>{
  const s=await setup(),value=await credential(s),event=s.completeEvent(value),before=JSON.stringify(s.db);
  await rejects(()=>s.pickupService.complete({...event,payload:{...event.payload,expectedVersion:0}},s.merchant),'VERSION_CONFLICT');
  const missing=clone(event);delete missing.payload.pickupCredential;
  await rejects(()=>s.pickupService.complete(missing,s.merchant),'PICKUP_CREDENTIAL_REQUIRED');
  await rejects(()=>s.pickupService.complete({...event,payload:{...event.payload,nextStatus:'COMPLETED'}},s.merchant),'INVALID_REQUEST');
  assert.equal(JSON.stringify(s.db),before);
});

test('O07 wrong attempt persists before rejection; same-key failure replay never increments again',async()=>{
  const s=await setup();await credential(s);const event=s.completeEvent('WRONG_PRIVATE_TOKEN');
  const failed=await s.pickupService.complete(event,s.merchant),before=JSON.stringify(s.db);
  assert.equal(failed.disposition,'REJECTED');assert.equal(failed.result.errorCode,'PICKUP_CREDENTIAL_INVALID');
  assert.equal(order(s).pickupCredential.failedAttempts,1);assert.equal(order(s).orderStatus,'READY');
  assert.equal(Object.values(s.db.receipts).filter(r=>r.status==='FAILED').length,1);
  const repeat=await s.pickupService.complete(event,s.merchant);assert.equal(repeat.disposition,'REPLAY');
  assert.deepEqual(repeat.result,failed.result);assert.equal(JSON.stringify(s.db),before);
});

test('O07 persisted cooldown and cumulative limit survive restart and new idempotency keys',async()=>{
  const s=await setup(),value=await credential(s);
  await s.pickupService.complete(s.completeEvent('wrong','attempt-1'),s.merchant);
  const before=JSON.stringify(s.db),restarted=createOrderPickupService(s.options);
  const cooldown=await restarted.complete(s.completeEvent(value,'cooldown-key'),s.merchant);
  assert.equal(cooldown.result.errorCode,'PICKUP_CREDENTIAL_RATE_LIMITED');assert.equal(JSON.stringify(s.db),before);
  for(let i=2;i<=3;i++){
    s.controls.now+=s.policy.attemptCooldownMs;
    await restarted.complete(s.completeEvent('wrong','attempt-'+i),s.merchant);
  }
  s.controls.now+=s.policy.attemptCooldownMs;
  const locked=await restarted.complete(s.completeEvent(value,'correct-after-lock'),s.merchant);
  assert.equal(locked.result.errorCode,'PICKUP_CREDENTIAL_LOCKED');assert.equal(order(s).pickupCredential.failedAttempts,3);
  await rejects(()=>s.pickupService.get(s.getEvent,s.principal),'PICKUP_CREDENTIAL_LOCKED');
});

test('O07 owner read does not reset failures, while correct verification after cooldown succeeds',async()=>{
  const s=await setup(),value=await credential(s);await s.pickupService.complete(s.completeEvent('wrong','failed-key'),s.merchant);
  assert.equal(await credential(s),value);assert.equal(order(s).pickupCredential.failedAttempts,1);
  s.controls.now+=s.policy.attemptCooldownMs;
  assert.equal((await s.pickupService.complete(s.completeEvent(value,'correct-key'),s.merchant)).disposition,'COMPLETED');
});

test('O07 expiry is inclusive, owner renews atomically, and old values never verify new issuance',async()=>{
  const s=await setup(),old=await credential(s);s.controls.now=order(s).pickupCredential.expiresAt;
  const before=JSON.stringify(s.db);await rejects(()=>s.pickupService.complete(s.completeEvent(old),s.merchant),'PICKUP_CREDENTIAL_EXPIRED');
  assert.equal(JSON.stringify(s.db),before);const fresh=await credential(s);assert.notEqual(fresh,old);
  assert.equal((await s.pickupService.complete(s.completeEvent(old,'old-value'),s.merchant)).result.errorCode,'PICKUP_CREDENTIAL_INVALID');
});

test('O07 issuance and verification reaching expiry before commit roll back',async()=>{
  const s=await setup(),before=JSON.stringify(s.db),timestamp=s.controls.now;
  s.controls.nowSequence=[timestamp,timestamp+s.policy.ttlMs];
  await rejects(()=>s.pickupService.get(s.getEvent,s.principal),'PICKUP_CREDENTIAL_EXPIRED');assert.equal(JSON.stringify(s.db),before);
  s.controls.nowSequence=null;const value=await credential(s),snapshot=JSON.stringify(s.db);
  s.controls.nowSequence=[timestamp,timestamp+s.policy.ttlMs];
  await rejects(()=>s.pickupService.complete(s.completeEvent(value),s.merchant),'PICKUP_CREDENTIAL_EXPIRED');
  assert.equal(JSON.stringify(s.db),snapshot);
});

test('O07 every issuance/completion/failure write exception or zero-row write rolls back',async()=>{
  for(const mode of ['issue','complete','wrong'])for(const fault of ['failAt','zeroAt'])for(let n=1;n<=(mode==='issue'?2:3);n++){
    const s=await setup(),value=mode==='issue'?null:await credential(s),before=JSON.stringify(s.db);
    s.controls[fault]=n;
    await assert.rejects(()=>mode==='issue'?s.pickupService.get(s.getEvent,s.principal):
      s.pickupService.complete(s.completeEvent(mode==='wrong'?'wrong':value),s.merchant));
    assert.equal(JSON.stringify(s.db),before,mode+'/'+fault+'/'+n);
  }
});

test('O07 role/user revocation racing commit and read-fence rejection cannot partly complete',async()=>{
  for(const revoked of ['role','user','fence']){
    const s=await setup(),value=await credential(s),initialOrder=clone(order(s));
    if(revoked==='fence')s.controls.denyFence=true;
    else s.controls.beforeCommit=db=>{if(revoked==='role'){db.roles[s.roleId].version++;db.roles[s.roleId].status='REVOKED';}
      else {db.users[s.merchant.subjectId].version++;db.users[s.merchant.subjectId].status='DISABLED';}};
    await rejects(()=>s.pickupService.complete(s.completeEvent(value),s.merchant),'VERSION_CONFLICT');
    assert.deepEqual(order(s),initialOrder);assert.equal(Object.values(s.db.logs).filter(l=>l.command==='COMPLETE_PICKUP').length,0);
  }
});

test('O07 issuance revocation and resource mutations racing commit roll back all dependent writes',async()=>{
  const s=await setup(),before=clone(order(s));
  s.controls.beforeCommit=db=>{db.users[s.principal.subjectId].version++;};
  await rejects(()=>s.pickupService.get(s.getEvent,s.principal),'VERSION_CONFLICT');assert.deepEqual(order(s),before);
  const x=await setup(),value=await credential(x),initial=clone(order(x));
  x.controls.beforeCommit=db=>{db.stocks[x.stockId].version++;};
  await rejects(()=>x.pickupService.complete(x.completeEvent(value),x.merchant),'VERSION_CONFLICT');
  assert.deepEqual(order(x),initial);
});

test('O07 changing merchant operators does not bypass shared per-credential cooldown',async()=>{
  const s=await setup(),value=await credential(s),other=s.actor('offline-other-merchant');
  s.db.users[other.subjectId]={...s.db.users[s.merchant.subjectId],_id:other.subjectId};
  s.db.roles.other={...clone(s.db.roles[s.roleId]),_id:'other',subjectId:other.subjectId};
  await s.pickupService.complete(s.completeEvent('wrong','merchant-one'),s.merchant);
  const result=await s.pickupService.complete(s.completeEvent(value,'merchant-two'),other);
  assert.equal(result.result.errorCode,'PICKUP_CREDENTIAL_RATE_LIMITED');assert.equal(order(s).pickupCredential.failedAttempts,1);
});

test('O07 malformed or missing fulfillment resource evidence blocks completion without used credential',async()=>{
  for(const corrupt of ['missing','held','scope','count','quote','slot']){
    const s=await setup(),value=await credential(s),r=Object.values(s.db.reservations).find(r=>r.resourceKind==='STOCK');
    if(corrupt==='missing')delete s.db.reservations[r._id];
    if(corrupt==='held')r.status='HELD';if(corrupt==='scope')r.storeId='other-store';
    if(corrupt==='count')s.db.stocks[r.resourceId].consumedUnits=0;
    if(corrupt==='quote')s.db.quotes[order(s).quoteId].consumedOrderId='other-order';
    if(corrupt==='slot')Object.values(s.db.reservations).find(x=>x.resourceKind==='SLOT').quantity=2;
    const before=JSON.stringify(s.db);await rejects(()=>s.pickupService.complete(s.completeEvent(value),s.merchant),'INVALID_FULFILLMENT_RESOURCES');
    assert.equal(JSON.stringify(s.db),before);
  }
});

test('O07 stored credential tampering/missing key/policy mismatch fails closed',async()=>{
  for(const field of ['digest','format','expiresAt','policyVersion','usedBy']){
    const s=await setup();await credential(s);const c=order(s).pickupCredential;
    c[field]=field==='expiresAt'?c.expiresAt+1:field==='digest'?'a'.repeat(64):'tampered';
    await assert.rejects(()=>s.pickupService.get(s.getEvent,s.principal));
  }
  const s=await setup();await credential(s);
  const rotated=createOrderPickupService({...s.options,currentKeyId:'NEW_KEY',
    keys:{OFFLINE_RECEIPT_KEY:s.options.keys.OFFLINE_RECEIPT_KEY,NEW_KEY:Buffer.alloc(32,61)}});
  await rejects(()=>rotated.get(s.getEvent,s.principal),'CONFIGURATION_REQUIRED');
});

test('O07 value-key rotation retains existing tokens and stable HMAC receipt replay',async()=>{
  const s=await setup(),value=await credential(s),event=s.completeEvent(value);
  const rotated=createOrderPickupService({...s.options,currentKeyId:'NEW_KEY',keys:{...s.options.keys,NEW_KEY:Buffer.alloc(32,61)}});
  assert.equal((await rotated.get(s.getEvent,s.principal)).credential.value,value);
  await s.pickupService.complete(event,s.merchant);
  assert.equal((await rotated.complete(event,s.merchant)).disposition,'REPLAY');
});

test('O07 credential values/secrets never enter orders/logs/receipts; fingerprints are keyed',async()=>{
  const s=await setup(),value=await credential(s),event=s.completeEvent(value);
  event.payload.reason='PRIVATE_REASON '+value;
  await s.pickupService.complete(event,s.merchant);
  const all=JSON.stringify(s.db);assert.ok(!all.includes(value));assert.ok(!all.includes('PRIVATE_REASON'));
  const receipt=Object.values(s.db.receipts).find(x=>x.command==='admin.order.transition');
  assert.notEqual(receipt.requestFingerprint,requestFingerprint(event.payload));
  assert.deepEqual(Object.keys(receipt.result).sort(),['entityId','errorCode','version']);
  assert.ok(!JSON.stringify(Object.values(s.db.logs)).includes(order(s).pickupCredential.digest));
});

test('O07 full private event chain remains readable without exposing issuance or guessing attempts',async()=>{
  const s=await setup(),value=await credential(s);await s.pickupService.complete(s.completeEvent('PRIVATE_WRONG','wrong-key'),s.merchant);
  s.controls.now+=s.policy.attemptCooldownMs;await s.pickupService.complete(s.completeEvent(value,'right-key'),s.merchant);
  const context={environment:s.principal.environment,appId:s.principal.appId,stage:'test',allowedCloudPrefixes:[]};
  const read=createOrderReadModel(s.records(),s.principal,context,{id:'OFFLINE_TEST_ONLY',secret:Buffer.alloc(32,23)});
  const dto=read.get({action:'get',payload:{orderId:s.orderId}},s.controls.now);
  assert.equal(dto.timeline.at(-1).message,'已完成自取');assert.equal(dto.timeline.length,6);
  assert.ok(!JSON.stringify(dto).includes('PICKUP_CREDENTIAL'));assert.ok(!JSON.stringify(dto).includes(value));
  const records=s.records(),hidden=records.logs.find(x=>x.command==='PICKUP_CREDENTIAL_ISSUED');hidden.after.paidCents=0;
  assert.throws(()=>createOrderReadModel(records,s.principal,context,{id:'OFFLINE_TEST_ONLY',secret:Buffer.alloc(32,23)})
    .get({action:'get',payload:{orderId:s.orderId}},s.controls.now),e=>e.code==='INVALID_ORDER_READ_STATE');
});
