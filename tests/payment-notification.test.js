'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {setup}=require('./fixtures/payment-notification');
const {createPaymentNotificationModel}=require('../cloudfunctions/_shared/payment-notification-model');
const p=s=>s.db.payments[s.paymentId],events=s=>Object.values(s.db.events),o=s=>s.db.orders.OFFLINE_ORDER;
const rejects=(fn,code)=>assert.rejects(fn,e=>e.code===code);

test('P03 authenticated matching evidence atomically confirms both fulfillment modes and all resources',async()=>{
  for(const mode of ['PICKUP','DELIVERY']){
    const s=await setup({mode}),original=s.clone(o(s)),raw=s.notification(),r=await s.notificationService().handle(raw);
    assert.equal(r.disposition,'APPLIED');assert.equal(r.cloudVerified,false);assert.equal(r.paymentAllowed,false);
    assert.equal(r.callable,false);assert.equal(r.durableHandlingRecorded,true);
    assert.equal(o(s).orderStatus,'PAID');assert.equal(o(s).paymentStatus,'PAID');assert.equal(o(s).paidCents,16800);
    assert.equal(o(s).version,1);assert.equal(p(s).status,'PAID');assert.equal(p(s).accountingState,'APPLIED');
    assert.equal(p(s).transactionId,'OFFLINE_TRANSACTION_1');assert.equal(p(s).confirmedAt,s.controls.now);
    for(const [key,value] of Object.entries(original))if(!['orderStatus','paymentStatus','paidCents','paidAt','version','updatedAt'].includes(key))
      assert.deepEqual(o(s)[key],value);
    for(const entry of s.db.held.resources){assert.equal(entry.resource.heldUnits,0);assert.ok(entry.resource.confirmedUnits>0);assert.equal(entry.resource.consumedUnits,0);}
    for(const reservation of s.db.held.reservations){assert.equal(reservation.status,'CONFIRMED');assert.equal(reservation.resolvedAt,null);}
    assert.equal(s.db.budget.reservedAmountCents,0);assert.equal(s.db.budget.usedAmountCents,16800);
    assert.equal(s.db.budget.usedTransactions,1);assert.equal(s.db.budget.reservedTransactions,0);
    assert.equal(events(s).length,2);assert.equal(Object.keys(s.db.logs).length,2);
    assert.equal(Object.isFrozen(r),true);assert.ok(!JSON.stringify(r).includes('outTradeNo'));
  }
});
test('P03 both candidate source methods are explicit and cannot substitute each other',async()=>{
  const s=await setup({route:'CLOUDBASE_INTEGRATION_V3'});
  assert.equal((await s.notificationService().handle(s.notification())).disposition,'APPLIED');
  const x=await setup();await x.notificationService().handle(x.notification({method:'PLATFORM_VERIFIED_WITH_AUTHENTICATED_FORWARDING'}));
  assert.equal(o(x).paidCents,0);assert.equal(events(x)[0].errorCode,'PAYMENT_CONFIGURATION_CHANGED');
});
test('P03 fake source and verified flags are rejected durably without poisoning genuine event IDs',async()=>{
  const s=await setup(),raw=s.notification(),forged={...raw,verified:true,signatureValid:true};
  const before=s.clone({order:o(s),payment:p(s),budget:s.db.budget,held:s.db.held});
  const r=await s.notificationService().handle(forged);assert.equal(r.disposition,'SOURCE_REJECTED');
  assert.equal(events(s).length,1);assert.equal(events(s)[0].verificationStatus,'REJECTED');assert.equal(events(s)[0].providerEventId,null);
  assert.deepEqual({order:o(s),payment:p(s),budget:s.db.budget,held:s.db.held},before);
  assert.equal((await s.notificationService().handle(raw)).disposition,'APPLIED');
  assert.equal((await s.notificationService().handle(forged)).disposition,'SOURCE_REJECTED');assert.equal(events(s).length,3);
});
test('P03 model proof tokens cannot be forged, JSON copied, or transferred to another boundary',async()=>{
  const options={verifyAndNormalize:async()=>null,environment:'OFFLINE_ENV',appId:'wx0000000000000001',
    provider:'WECHATPAY_DIRECT_V3',maxNotificationBytes:1000};
  const model=createPaymentNotificationModel(options),other=createPaymentNotificationModel(options),token=await model.authenticate({},1000);
  for(const forged of [{verified:true},{...token},JSON.parse(JSON.stringify(token))])assert.throws(()=>model.inspect(forged),e=>e.code==='NOTIFICATION_AUTH_REQUIRED');
  assert.throws(()=>other.inspect(token),e=>e.code==='NOTIFICATION_AUTH_REQUIRED');
});
test('P03 verifier unavailability gives fixed retryable error and writes no rejection/money',async()=>{
  const s=await setup(),before=s.clone(s.db);s.controls.verifierThrows=true;
  await rejects(()=>s.notificationService().handle(s.notification()),'NOTIFICATION_VERIFIER_UNAVAILABLE');assert.deepEqual(s.db,before);
});
test('P03 unsafe input/getters and over-limit notification fail before authentication or money writes',async()=>{
  const s=await setup();let invoked=0;const raw={};Object.defineProperty(raw,'body',{enumerable:true,get(){invoked++;return 'PRIVATE';}});
  await rejects(()=>s.notificationService().handle(raw),'INVALID_NOTIFICATION_INPUT');assert.equal(invoked,0);
  await rejects(()=>s.notificationService().handle({body:'x'.repeat(17000)}),'INVALID_NOTIFICATION_INPUT');assert.equal(events(s).length,0);
});
test('P03 mismatched merchant/app/environment/amount/currency/payer/out-number are quarantined with no order or resource credit',async()=>{
  const cases=[{patch:{merchantId:'OTHER'}},{patch:{appId:'wx0000000000000002'}},
    {bindingPatch:{environment:'OTHER'}},{patch:{amountCents:1}},{patch:{currency:'USD'}},
    {patch:{payerIdentityDigest:'a'.repeat(64)}},{patch:{outTradeNo:'OTHER_NUMBER'}}];
  for(const value of cases){
    const s=await setup(),before=s.clone({order:o(s),held:s.db.held,budget:s.db.budget,payment:p(s)});
    const r=await s.notificationService().handle(s.notification(value));assert.equal(r.disposition,'QUARANTINED');
    assert.equal(r.requiresPaymentCoordination,true);assert.equal(events(s)[0].verificationStatus,'VERIFIED');
    assert.deepEqual({order:o(s),held:s.db.held,budget:s.db.budget,payment:p(s)},before);
    assert.ok(events(s).every(e=>e.processingStatus==='QUARANTINED'));
  }
});
test('P03 missing critical fields/non-success/future and pre-intent times cannot become paid',async()=>{
  for(const patch of [{transactionId:null},{amountCents:null},{resultCode:'NOTPAY'},
    {occurredAt:null},{occurredAt:9999999999999},{occurredAt:1}]){
    const s=await setup();assert.equal((await s.notificationService().handle(s.notification({patch}))).disposition,'QUARANTINED');
    assert.equal(o(s).paidCents,0);assert.equal(p(s).status,'PENDING');assert.ok(events(s).length>0);
  }
});
test('P03 exact event replay and different event IDs for one transaction cannot double-credit',async()=>{
  const s=await setup(),raw=s.notification();await s.notificationService().handle(raw);const before=s.clone(s.db);
  assert.equal((await s.notificationService().handle(raw)).disposition,'EVENT_REPLAY');assert.deepEqual(s.db,before);
  assert.equal((await s.notificationService().handle(s.notification({eventId:'OFFLINE_EVENT_2'}))).disposition,'TRANSACTION_DUPLICATE');
  assert.equal(o(s).version,1);assert.equal(s.db.budget.usedTransactions,1);assert.equal(Object.keys(s.db.logs).length,2);
  assert.equal(events(s).length,3);assert.equal(events(s).filter(e=>e.processingStatus==='DUPLICATE').length,1);
});
test('P03 same event ID with conflicting facts appends immutable conflict once, preserving first payment',async()=>{
  const s=await setup();await s.notificationService().handle(s.notification());const original=s.clone(p(s));
  const raw=s.notification({patch:{amountCents:1}});const first=await s.notificationService().handle(raw);
  assert.equal(first.disposition,'QUARANTINED');assert.equal(events(s).filter(e=>e.recordType==='EVENT_CONFLICT').length,1);
  await s.notificationService().handle(raw);assert.equal(events(s).length,3);assert.deepEqual(p(s),original);assert.equal(o(s).version,1);
});
test('P03 wrong financial facts for one transaction cannot later be silently replaced by another event',async()=>{
  const s=await setup();await s.notificationService().handle(s.notification({patch:{amountCents:1}}));
  assert.equal(events(s).filter(e=>e.recordType==='TRANSACTION_GUARD').length,1);
  await s.notificationService().handle(s.notification({eventId:'CORRECTED_EVENT'}));
  assert.equal(o(s).paidCents,0);assert.ok(events(s).some(e=>e.errorCode==='PAYMENT_TRANSACTION_CONFLICT'));
});
test('P03 parallel same/different event IDs and response loss converge to one credit after service restart',async()=>{
  const s=await setup(),raw=s.notification(),other=s.notification({eventId:'OTHER_EVENT'});
  const results=await Promise.all([s.notificationService().handle(raw),s.notificationService().handle(raw),s.notificationService().handle(other)]);
  assert.equal(results.filter(r=>r.disposition==='APPLIED').length,1);assert.equal(o(s).version,1);
  const x=await setup(),event=x.notification();x.controls.loseResponse=true;
  await rejects(()=>x.notificationService().handle(event),'OFFLINE_RESPONSE_LOST');
  assert.equal((await x.notificationService().handle(event)).disposition,'EVENT_REPLAY');assert.equal(o(x).version,1);
});
test('P03 every normal write failure or zero-row result rolls event, transaction, money, order, budget and resources back',async()=>{
  for(const kind of ['failAt','zeroAt'])for(let i=1;i<=10;i++){
    const s=await setup(),raw=s.notification(),before=s.clone(s.db);s.controls[kind]=i;
    await assert.rejects(()=>s.notificationService().handle(raw));assert.deepEqual(s.db,before);
    s.controls[kind]=0;assert.equal((await s.notificationService().handle(raw)).disposition,'APPLIED');
  }
});
test('P03 disabled current customer and expired new-payment grant do not lose already-paid financial evidence',async()=>{
  const s=await setup(),raw=s.notification();s.db.users[s.principal.subjectId].status='DISABLED';
  s.controls.now=s.config.profile.controlledTest.expiresAt;
  assert.equal((await s.notificationService().handle(raw)).disposition,'APPLIED');assert.equal(s.db.budget.usedTransactions,1);
});
test('P03 receipt after deadline can confirm an on-time payment while HELD resources still exist',async()=>{
  const s=await setup(),raw=s.notification();s.controls.now=o(s).paymentDeadlineAt+1000;
  assert.equal((await s.notificationService().handle(raw)).disposition,'APPLIED');assert.equal(o(s).paidAt,s.config.runtime.now+1000);
});
test('P03 cancelled/late/closed payments preserve money and quarantine without reviving order or touching released resources',async()=>{
  for(const kind of ['cancelled','late','closed']){
    const s=await setup();
    if(kind==='late')s.controls.now=o(s).paymentDeadlineAt;
    const raw=s.notification();
    if(kind==='cancelled'){
      Object.assign(o(s),{orderStatus:'CANCELLED',paymentStatus:'CLOSED',version:1,updatedAt:s.controls.now,cancelledAt:s.controls.now});
      Object.assign(p(s),{status:'CLOSED',closedAt:s.controls.now,lastEventId:'OFFLINE_CLOSE',updatedAt:s.controls.now});
      s.db.held.reservations.forEach(r=>r.status='RELEASED');s.db.held.resources.forEach(r=>r.resource.heldUnits=0);
    }else if(kind==='closed')Object.assign(p(s),{status:'CLOSED',closedAt:s.controls.now,lastEventId:'OFFLINE_CLOSE',updatedAt:s.controls.now});
    const before=s.clone({order:o(s),held:s.db.held});const result=await s.notificationService().handle(raw);
    assert.equal(result.disposition,'QUARANTINED');assert.equal(result.requiresPaymentCoordination,true);
    assert.equal(p(s).status,'PAID');assert.equal(p(s).accountingState,'QUARANTINED');
    assert.deepEqual({order:o(s),held:s.db.held},before);assert.equal(s.db.budget.usedTransactions,1);
    assert.equal(events(s).length,2);assert.equal(Object.keys(s.db.logs).length,1);
  }
});
test('P03 damaged resource or order log records money separately and requires reconciliation, without partial confirmation',async()=>{
  for(const mutate of [s=>s.db.held.reservations.pop(),s=>s.db.held.resources[0].resource.heldUnits=0,
    s=>s.db.logs.OFFLINE_CREATED.after.version=99]){
    const s=await setup();mutate(s);const before=s.clone({order:o(s),held:s.db.held});
    const r=await s.notificationService().handle(s.notification());assert.equal(r.disposition,'QUARANTINED');
    assert.equal(p(s).accountingState,'QUARANTINED');assert.deepEqual({order:o(s),held:s.db.held},before);
    assert.equal(s.db.budget.usedTransactions,1);
  }
});
test('P03 damaged original budget preserves valid money but never silently resets counters or applies order',async()=>{
  const s=await setup();s.db.budget.reservedTransactions=0;const before=s.clone(s.db.budget);
  await s.notificationService().handle(s.notification());assert.equal(p(s).accountingState,'QUARANTINED');
  assert.deepEqual(s.db.budget,before);assert.equal(o(s).paidCents,0);assert.equal(events(s)[0].errorCode,'PAYMENT_BUDGET_RECONCILIATION_REQUIRED');
});
test('P03 configuration version, owner identity and stale read races cannot bypass bindings or atomicity',async()=>{
  const s=await setup();s.db.manifest.profiles.test.version='CHANGED';s.db.manifest.profiles.test.controlledTest.profileVersion='CHANGED';
  await s.notificationService().handle(s.notification());assert.equal(o(s).paidCents,0);assert.equal(events(s)[0].errorCode,'PAYMENT_CONFIGURATION_CHANGED');
  for(const mutate of [s=>{s.controls.denyFence=true;},
    s=>{s.controls.beforeCommit=db=>{db.orders.OFFLINE_ORDER.version++;};},
    s=>{s.controls.beforeCommit=db=>{db.users[s.principal.subjectId].version++;};},
    s=>{s.controls.beforeCommit=db=>{db.held.resources[0].resource.version++;};},
    s=>{s.controls.beforeCommit=db=>{db.budget.version++;};}]){
    const x=await setup();mutate(x);await rejects(()=>x.notificationService().handle(x.notification()),'VERSION_CONFLICT');
    assert.equal(o(x).paidCents,0);assert.equal(p(x).status,'PENDING');assert.equal(events(x).length,0);
  }
});
test('P03 quarantined money duplicates remain quarantined and do not repeatedly consume test budget',async()=>{
  const s=await setup();s.db.held.reservations.pop();await s.notificationService().handle(s.notification());
  const result=await s.notificationService().handle(s.notification({eventId:'DUPLICATE_QUARANTINE'}));
  assert.equal(result.disposition,'TRANSACTION_DUPLICATE');assert.equal(result.requiresPaymentCoordination,true);
  assert.equal(s.db.budget.usedTransactions,1);assert.equal(o(s).paidCents,0);assert.equal(Object.keys(s.db.logs).length,1);
});
test('P03 persisted evidence and public result contain no raw body, OpenID, signature, token, contact or key',async()=>{
  const s=await setup(),raw=s.notification(),r=await s.notificationService().handle(raw),encoded=JSON.stringify({events:s.db.events,logs:s.db.logs,result:r});
  for(const secret of [raw.body,s.db.users[s.principal.subjectId].openId,p(s).dispatchToken,'merchantPrivateKey','forwardingAuthRef'])
    assert.ok(!encoded.includes(secret));
  assert.ok(events(s).every(e=>e.evidence.payloadDigest.length===64));
});

test('P03 one external transaction cannot credit two orders; a second transaction on one paid order requires coordination',async()=>{
  const s=await setup(),second=s.additionalOrder('OFFLINE_SECOND_ORDER');
  await s.service().prepare(second,s.principal);
  const another=Object.values(s.db.payments).find(value=>value._id!==s.paymentId);
  await s.service().claimDispatch(second.payload.orderId,another._id,s.principal);
  await s.notificationService().handle(s.notification());
  const secondResult=await s.notificationService().handle(s.notification({eventId:'SECOND_ORDER_EVENT',patch:{outTradeNo:another.outTradeNo}}));
  assert.equal(secondResult.disposition,'QUARANTINED');assert.equal(s.db.orders[another.orderId].paidCents,0);
  assert.equal(s.db.payments[another._id].status,'PENDING');assert.equal(s.db.budget.usedTransactions,1);
  const result=await s.notificationService().handle(s.notification({eventId:'EXTRA_MONEY_EVENT',patch:{transactionId:'OFFLINE_EXTRA_TRANSACTION'}}));
  assert.equal(result.disposition,'QUARANTINED');assert.equal(o(s).paidCents,16800);assert.equal(o(s).version,1);
  assert.ok(events(s).some(e=>e.errorCode==='UNRESOLVED_PAYMENT_LEDGER'));
});

test('P03 transaction ledger tampering and wrong event roles are rejected rather than trusted on replay',async()=>{
  for(const mutate of [s=>{events(s).find(e=>e.recordType==='TRANSACTION_GUARD').evidence.amountCents=1;},
    s=>{events(s).find(e=>e.recordType==='TRANSACTION_GUARD').recordType='NOTIFICATION';}]){
    const s=await setup();await s.notificationService().handle(s.notification());mutate(s);
    await rejects(()=>s.notificationService().handle(s.notification({eventId:'OTHER_LEDGER_EVENT'})),'INVALID_NOTIFICATION_STATE');
    assert.equal(o(s).version,1);
  }
  const s=await setup(),raw=s.notification();await s.notificationService().handle(raw);
  events(s).find(e=>e.recordType==='NOTIFICATION').recordType='TRANSACTION_GUARD';
  await rejects(()=>s.notificationService().handle(raw),'INVALID_NOTIFICATION_STATE');
});

test('P03 second-resolution success time can overlap intent creation in the same second without invented evidence milliseconds',async()=>{
  const s=await setup(),start=s.config.runtime.now,order=o(s);
  Object.assign(order,{createdAt:start+300,updatedAt:start+300});
  Object.assign(p(s),{createdAt:start+450,updatedAt:start+500,dispatchStartedAt:start+500});
  Object.assign(s.db.logs.OFFLINE_CREATED,{createdAt:order.createdAt,updatedAt:order.createdAt});
  s.db.held.reservations.forEach(r=>Object.assign(r,{createdAt:order.createdAt,updatedAt:order.createdAt}));
  const result=await s.notificationService().handle(s.notification({patch:{occurredAt:start,occurredAtPrecisionMs:1000}}));
  assert.equal(result.disposition,'APPLIED');assert.equal(o(s).paidAt,start+500);
  assert.equal(p(s).confirmedAt,start);assert.ok(events(s).every(e=>e.evidence.occurredAt===start&&e.evidence.occurredAtPrecisionMs===1000));
});

test('P03 source precision is explicit; stale whole-second and inconsistent precision are not silently coerced',async()=>{
  const s=await setup();const result=await s.notificationService().handle(s.notification({patch:{occurredAt:s.config.runtime.now-1000,occurredAtPrecisionMs:1000}}));
  assert.equal(result.disposition,'QUARANTINED');assert.equal(o(s).paidCents,0);
  const x=await setup();await rejects(()=>x.notificationService().handle(x.notification({patch:{occurredAt:x.controls.now+1,occurredAtPrecisionMs:1000}})),
    'INVALID_NOTIFICATION_EVIDENCE');
});

test('P03 every late-money quarantine write failure/zero rolls back financial claim and budget together',async()=>{
  for(const kind of ['failAt','zeroAt'])for(let i=1;i<=4;i++){
    const s=await setup();s.controls.now=o(s).paymentDeadlineAt;const raw=s.notification(),before=s.clone(s.db);
    s.controls[kind]=i;await assert.rejects(()=>s.notificationService().handle(raw));assert.deepEqual(s.db,before);
    s.controls[kind]=0;assert.equal((await s.notificationService().handle(raw)).disposition,'QUARANTINED');
  }
});

test('P03 production notification retains offline boundary with no synthetic test-budget record',async()=>{
  const s=await setup({stage:'production'});assert.equal(s.db.budget,null);
  const r=await s.notificationService().handle(s.notification());assert.equal(r.disposition,'APPLIED');
  assert.equal(r.cloudVerified,false);assert.equal(r.callable,false);assert.equal(r.paymentAllowed,false);
});

test('P03 selected intent must exactly belong to the complete payment read',async()=>{
  for(const changed of [false,true]){
    const s=await setup({extendTransaction:(tx,db)=>{
      tx.readOrderPayments=async()=>changed?Object.values(db.payments).map(v=>({...v,version:v.version+1})):[];
    }}),before=s.clone({order:o(s),payment:p(s),budget:s.db.budget,held:s.db.held});
    const result=await s.notificationService().handle(s.notification());
    assert.equal(result.disposition,'QUARANTINED');
    assert.deepEqual({order:o(s),payment:p(s),budget:s.db.budget,held:s.db.held},before);
  }
});

test('P03 payment log and immutable O03 snapshots remain compatible with O06 historical detail',async()=>{
  const tx=require('./fixtures/order-transaction').setup(),quote=tx.makeQuote({quantity:2});
  const created=await tx.service.execute(quote.event,quote.customer),s=await setup();
  // Align the two synthetic fixture clocks/identities/resource IDs, retaining
  // full historical O03 facts and item prices (not a real platform migration).
  const full=s.clone(tx.db.orders[created.result.entityId]);
  Object.assign(full,{_id:'OFFLINE_ORDER',ownerId:s.principal.subjectId,quoteId:s.db.held.quote._id,
    createdAt:o(s).createdAt,updatedAt:o(s).updatedAt,paymentDeadlineAt:o(s).paymentDeadlineAt});
  full.appointmentSnapshot.slotId='OFFLINE_SLOT';s.db.orders.OFFLINE_ORDER=full;
  p(s).amountCents=full.totalCents;s.db.budget.reservedAmountCents=full.totalCents;
  s.db.held.quote.storeId=full.storeId;
  s.db.held.resources.forEach(entry=>entry.resource.storeId=full.storeId);
  s.db.held.reservations.forEach(r=>Object.assign(r,{storeId:full.storeId,createdAt:full.createdAt,updatedAt:full.createdAt}));
  Object.assign(s.db.logs.OFFLINE_CREATED,{createdAt:full.createdAt,updatedAt:full.createdAt});
  const items=Object.values(tx.db.items).filter(item=>item.orderId===created.result.entityId)
    .map(item=>({...s.clone(item),orderId:full._id,createdAt:full.createdAt,updatedAt:full.createdAt}));
  assert.equal((await s.notificationService().handle(s.notification())).disposition,'APPLIED',events(s).map(e=>e.errorCode).join(','));
  const {createOrderReadModel}=require('../cloudfunctions/_shared/order-read-model');
  const model=createOrderReadModel({user:s.db.users[s.principal.subjectId],orders:[o(s)],items,
    logs:Object.values(s.db.logs),cancellations:[],mediaAssets:[]},s.principal,{...s.settings,allowedCloudPrefixes:[]},
    {id:'OFFLINE_READ_KEY',secret:Buffer.alloc(32,11)});
  const detail=model.get({action:'get',payload:{orderId:full._id}},s.controls.now);
  assert.equal(detail.orderStatus,'PAID');assert.equal(detail.statusLabel,'待门店接单');
  assert.equal(detail.timeline[1].message,'付款已确认');assert.equal(detail.timeline.length,2);
  assert.equal(detail.items[0].productName,items[0].productName);assert.equal(detail.totalCents,full.totalCents);
  assert.ok(!JSON.stringify(detail).includes('OFFLINE_TRANSACTION_1'));
});
