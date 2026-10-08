'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {setup}=require('./fixtures/payment-recovery');
const {validateOriginalLog}=require('../cloudfunctions/_shared/payment-notification-model');
const {createPaymentRecoveryService}=require('../cloudfunctions/_shared/payment-recovery-service');
const p=s=>s.db.payments[s.paymentId],o=s=>s.db.orders.OFFLINE_ORDER,events=s=>Object.values(s.db.events),refunds=s=>Object.values(s.db.refunds);
const rejects=(fn,code)=>assert.rejects(fn,e=>e.code===code);
async function query(s,outcome='SUCCESS',patch={},extra={}){
  const q=await s.recoveryService().prepareQuery(s.paymentId,s.invocation);
  const raw=s.response(q.requestId,outcome,patch,extra),result=await s.recoveryService().acceptResponse(raw);
  return {q,raw,result};
}
async function close(s,purpose='CANCEL'){
  const {result}=await query(s,'NOTPAY');return s.recoveryService().prepareClose(s.paymentId,result.eventId,purpose,s.invocation);
}
async function cancel(s){return s.cancellationService().cancelUnpaid({action:'cancelUnpaid',payload:{orderId:o(s)._id,
  expectedVersion:o(s).version,idempotencyKey:'offline-cancel-key',reason:'顾客取消'}},s.principal);}
function assertHeld(s,status){for(const r of s.db.held.reservations)assert.equal(r.status,status);}

test('P04 query success recovers a missing notification atomically in both fulfillment modes',async()=>{
  for(const mode of ['PICKUP','DELIVERY']){
    const s=await setup({mode}),original=s.clone(o(s)),{result}=await query(s);
    assert.equal(result.disposition,'APPLIED');assert.equal(o(s).orderStatus,'PAID');assert.equal(o(s).paidCents,16800);
    assertHeld(s,'CONFIRMED');assert.equal(s.db.budget.usedTransactions,1);assert.equal(s.db.budget.reservedTransactions,0);
    assert.equal(events(s).find(e=>e.recordType==='QUERY_RESULT').source,'QUERY');
    assert.equal(o(s).orderNo,original.orderNo);assert.equal(result.paymentAllowed,false);assert.equal(result.externalRefundExecuted,false);
    validateOriginalLog(o(s),Object.values(s.db.logs));
  }
});
test('P04 query/notification in either order share the merchant transaction guard and credit once',async()=>{
  for(const notificationFirst of [true,false]){
    const s=await setup(),raw=s.notification();
    if(notificationFirst)await s.notificationService().handle(raw);
    const {result}=await query(s);
    if(!notificationFirst)assert.equal((await s.notificationService().handle(raw)).disposition,'TRANSACTION_DUPLICATE');
    else assert.equal(result.disposition,'TRANSACTION_DUPLICATE');
    assert.equal(o(s).version,1);assert.equal(s.db.budget.usedTransactions,1);
    assert.equal(events(s).filter(e=>e.recordType==='TRANSACTION_GUARD').length,1);
  }
});
test('P04 query repeat/parallel delivery/response loss and new service do not repeat money writes',async()=>{
  const s=await setup(),q=await s.recoveryService().prepareQuery(s.paymentId,s.invocation),raw=s.response(q.requestId);
  s.controls.loseResponse=true;await rejects(()=>s.recoveryService().acceptResponse(raw),'OFFLINE_RESPONSE_LOST');
  const before=s.clone(s.db);await s.recoveryService().acceptResponse(raw);assert.deepEqual(s.db,before);
  await Promise.all([s.recoveryService().acceptResponse(raw),s.notificationService().handle(s.notification())]);
  assert.equal(o(s).version,1);assert.equal(s.db.budget.usedTransactions,1);
});
test('P04 callers cannot mint recovery authority or provider evidence with flags or JSON copies',async()=>{
  const s=await setup(),before=s.clone(s.db);
  await rejects(()=>s.recoveryService().prepareQuery(s.paymentId,{...s.invocation,role:'SYSTEM'}),'FORBIDDEN');
  assert.deepEqual(s.db,before);
  const q=await s.recoveryService().prepareQuery(s.paymentId,s.invocation),raw=s.response(q.requestId);
  await rejects(()=>s.recoveryService().acceptResponse({...raw,verified:true}),'RECOVERY_SOURCE_REJECTED');assert.equal(p(s).status,'PENDING');
  s.controls.recoveryVerifierThrows=true;await rejects(()=>s.recoveryService().acceptResponse(raw),'RECOVERY_VERIFIER_UNAVAILABLE');
  assert.equal(events(s).filter(e=>e.recordType==='RECOVERY_OBSERVATION').length,0);
});
test('P04 source size/getter guards fail before invoking verification',async()=>{
  const s=await setup();let reads=0;const raw={};Object.defineProperty(raw,'body',{enumerable:true,get(){reads++;return 'x';}});
  await rejects(()=>s.recoveryService().acceptResponse(raw),'INVALID_RECOVERY_INPUT');assert.equal(reads,0);
  await rejects(()=>s.recoveryService().acceptResponse({body:'x'.repeat(17000)}),'INVALID_RECOVERY_INPUT');
});
test('P04 request binding/operation/provider method/merchant/number/config mismatches cannot apply money',async()=>{
  for(const mutation of ['binding','operation','method','merchant','number','configuration']){
    const s=await setup(),q=await s.recoveryService().prepareQuery(s.paymentId,s.invocation);
    const extra=mutation==='binding'?{binding:{...s.db.events[q.requestId].binding,environment:'OTHER'}}:
      mutation==='operation'?{operation:'CLOSE',outcome:'ACKNOWLEDGED'}:
      mutation==='method'?{verificationMethod:'PLATFORM_AUTHENTICATED_PROVIDER_RESULT'}:{};
    const patch=mutation==='merchant'?{merchantId:'OTHER'}:mutation==='number'?{outTradeNo:'OTHER'}:{};
    const raw=s.response(q.requestId,'SUCCESS',patch,extra);
    if(mutation==='configuration'){
      s.db.manifest.profiles.test.version='OTHER_VERSION';s.db.manifest.profiles.test.controlledTest.profileVersion='OTHER_VERSION';
    }
    await rejects(()=>s.recoveryService().acceptResponse(raw),mutation==='configuration'?'PAYMENT_CONFIGURATION_CHANGED':'PAYMENT_SCOPE_MISMATCH');
    assert.equal(o(s).paidCents,0);assertHeld(s,'HELD');
  }
});
test('P04 wrong amount/payer/currency query preserves quarantine evidence without order credit',async()=>{
  for(const patch of [{amountCents:1},{currency:'USD'},{payerIdentityDigest:'a'.repeat(64)}]){
    const s=await setup(),{result}=await query(s,'SUCCESS',patch);assert.equal(result.disposition,'QUARANTINED');
    assert.equal(o(s).paidCents,0);assertHeld(s,'HELD');assert.equal(s.db.budget.usedTransactions,0);
  }
});
test('P04 same correlated query cannot replace its immutable response with conflicting facts',async()=>{
  const s=await setup(),{q}=await query(s,'NOTPAY'),raw=s.response(q.requestId,'SUCCESS');
  await rejects(()=>s.recoveryService().acceptResponse(raw),'RECOVERY_RESPONSE_CONFLICT');assert.equal(o(s).paidCents,0);
});
test('P04 NOTPAY and unknown results preserve holds/budget and cannot authorize cancellation',async()=>{
  for(const outcome of ['NOTPAY','UNKNOWN']){
    const s=await setup(),before=s.clone({p:p(s),o:o(s),held:s.db.held,budget:s.db.budget}),{result,raw}=await query(s,outcome);
    assert.equal(result.disposition,outcome==='NOTPAY'?'UNPAID_OBSERVED':'QUERY_REQUIRED');
    assert.deepEqual({p:p(s),o:o(s),held:s.db.held,budget:s.db.budget},before);
    assert.equal((await cancel(s)).disposition,'PAYMENT_COORDINATION_REQUIRED');assertHeld(s,'HELD');
    assert.equal((await s.recoveryService().acceptResponse(raw)).requiresPaymentCoordination,true);
  }
});
test('P04 close requires fresh unpaid evidence and explicit cancellation/expiry basis',async()=>{
  const s=await setup(),unknown=await query(s,'UNKNOWN');
  await rejects(()=>s.recoveryService().prepareClose(s.paymentId,unknown.result.eventId,'CANCEL',s.invocation),'FRESH_UNPAID_QUERY_REQUIRED');
  const unpaid=await query(s,'NOTPAY');
  await rejects(()=>s.recoveryService().prepareClose(s.paymentId,unpaid.result.eventId,'EXPIRE',s.invocation),'INVALID_TRANSITION');
  await rejects(()=>s.recoveryService().prepareClose(s.paymentId,unpaid.result.eventId,'VERIFY',s.invocation),'INVALID_TRANSITION');
  const c=await s.recoveryService().prepareClose(s.paymentId,unpaid.result.eventId,'CANCEL',s.invocation);
  assert.equal(c.disposition,'CLOSE_REQUEST_REQUIRED');assert.ok(p(s).closeRequestedAt);assertHeld(s,'HELD');
});
test('P04 same close basis is dispatched at most once, including preparation response loss',async()=>{
  const s=await setup(),unpaid=await query(s,'NOTPAY');s.controls.loseResponse=true;
  await rejects(()=>s.recoveryService().prepareClose(s.paymentId,unpaid.result.eventId,'CANCEL',s.invocation),'OFFLINE_RESPONSE_LOST');
  const before=s.clone(s.db),r=await s.recoveryService().prepareClose(s.paymentId,unpaid.result.eventId,'CANCEL',s.invocation);
  assert.equal(r.disposition,'QUERY_REQUIRED');assert.equal(r.transportPlan,null);assert.deepEqual(s.db,before);
});
test('P04 close ACK/already-paid/unknown never claims closure, refund or released resources',async()=>{
  for(const outcome of ['ACKNOWLEDGED','ALREADY_PAID','UNKNOWN']){
    const s=await setup(),c=await close(s),r=await s.recoveryService().acceptResponse(s.response(c.requestId,outcome));
    assert.equal(r.disposition,'QUERY_REQUIRED');assert.equal(p(s).status,'PENDING');assertHeld(s,'HELD');
    assert.equal(s.db.budget.reservedTransactions,1);assert.equal(refunds(s).length,0);
  }
});
test('P04 authoritative closed query updates payment/summary/log/budget then O05 releases once',async()=>{
  const s=await setup(),c=await close(s);await s.recoveryService().acceptResponse(s.response(c.requestId,'ACKNOWLEDGED'));
  const {result}=await query(s,'CLOSED');assert.equal(result.disposition,'CLOSED_OBSERVED');
  assert.equal(p(s).status,'CLOSED');assert.equal(o(s).paymentStatus,'CLOSED');assert.equal(o(s).orderStatus,'PENDING_PAYMENT');
  assertHeld(s,'HELD');assert.equal(s.db.budget.reservedTransactions,0);assert.equal(s.db.budget.usedTransactions,0);
  validateOriginalLog(o(s),Object.values(s.db.logs));const version=o(s).version;assert.equal((await cancel(s)).disposition,'CANCELLED');
  assertHeld(s,'RELEASED');const before=s.clone(s.db);
  assert.equal((await s.cancellationService().cancelUnpaid({action:'cancelUnpaid',payload:{orderId:o(s)._id,
    expectedVersion:version,idempotencyKey:'offline-cancel-key',reason:'顾客取消'}},s.principal)).disposition,'REPLAY');assert.deepEqual(s.db,before);
});
test('P04 timeout expiry uses a trusted closed query and exact deadline before O05 release',async()=>{
  const s=await setup();s.controls.now=o(s).paymentDeadlineAt;const c=await close(s,'EXPIRE');
  assert.equal(c.disposition,'CLOSE_REQUEST_REQUIRED');await query(s,'CLOSED');
  const r=await s.cancellationService().expire(o(s)._id,s.invocation);assert.equal(r.disposition,'CANCELLED');assertHeld(s,'RELEASED');
});
test('P04 malformed CLOSED/NOTPAY totals/result/transaction are never closure authority',async()=>{
  for(const outcome of ['CLOSED','NOTPAY'])for(const patch of [{amountCents:1},{resultCode:'SUCCESS'},{transactionId:'TX'}]){
    const s=await setup();await rejects(()=>query(s,outcome,patch),outcome==='CLOSED'?'INVALID_CLOSED_EVIDENCE':'INVALID_UNPAID_EVIDENCE');
    assert.equal(p(s).status,'PENDING');assertHeld(s,'HELD');assert.equal(s.db.budget.reservedTransactions,1);
  }
});
test('P04 pending queries cannot downgrade a concurrent notification success or reuse stale close basis',async()=>{
  const s=await setup(),q=await s.recoveryService().prepareQuery(s.paymentId,s.invocation),raw=s.response(q.requestId,'CLOSED');
  await s.notificationService().handle(s.notification());assert.equal((await s.recoveryService().acceptResponse(raw)).disposition,'STALE_QUERY');
  assert.equal(o(s).paymentStatus,'PAID');assertHeld(s,'CONFIRMED');assert.equal(s.db.budget.usedTransactions,1);
  const x=await setup(),unpaid=await query(x,'NOTPAY');p(x).version++;
  await rejects(()=>x.recoveryService().prepareClose(x.paymentId,unpaid.result.eventId,'CANCEL',x.invocation),'FRESH_UNPAID_QUERY_REQUIRED');
});
test('P04 all 11 query-success write positions abort wholly on exception or zero-row',async()=>{
  for(const kind of ['failAt','zeroAt'])for(let i=1;i<=11;i++){
    const s=await setup(),q=await s.recoveryService().prepareQuery(s.paymentId,s.invocation),raw=s.response(q.requestId),before=s.clone(s.db);
    s.controls[kind]=i;await assert.rejects(()=>s.recoveryService().acceptResponse(raw));assert.deepEqual(s.db,before);
  }
});
test('P04 close preparation and all five authoritative-closure writes are atomic',async()=>{
  for(const kind of ['failAt','zeroAt']){
    for(let i=1;i<=2;i++){
      const s=await setup(),unpaid=await query(s,'NOTPAY'),before=s.clone(s.db);s.controls[kind]=i;
      await assert.rejects(()=>s.recoveryService().prepareClose(s.paymentId,unpaid.result.eventId,'CANCEL',s.invocation));assert.deepEqual(s.db,before);
    }
    for(let i=1;i<=5;i++){
      const s=await setup(),q=await s.recoveryService().prepareQuery(s.paymentId,s.invocation),raw=s.response(q.requestId,'CLOSED'),before=s.clone(s.db);
      s.controls[kind]=i;await assert.rejects(()=>s.recoveryService().acceptResponse(raw));assert.deepEqual(s.db,before);
    }
  }
});
test('P04 close budgets cannot be reset or released without the original trusted authorization',async()=>{
  const s=await setup(),q=await s.recoveryService().prepareQuery(s.paymentId,s.invocation),raw=s.response(q.requestId,'CLOSED');
  s.db.budget.authorizationFingerprint='a'.repeat(64);const before=s.clone(s.db);
  await rejects(()=>s.recoveryService().acceptResponse(raw),'INVALID_CONTROLLED_PAYMENT_BUDGET');assert.deepEqual(s.db,before);
});
test('P04 late query funds release held resources and reserve one full refund without executing it',async()=>{
  for(const mode of ['PICKUP','DELIVERY']){
    const s=await setup({mode});s.controls.now=o(s).paymentDeadlineAt+1000;await query(s);
    assert.equal(p(s).accountingState,'QUARANTINED');assertHeld(s,'HELD');
    const r=await s.recoveryService().compensateLate(s.paymentId,s.invocation);
    assert.equal(r.disposition,'REFUND_INTENT_RESERVED');assert.equal(r.requiresAlert,true);assert.equal(r.externalRefundExecuted,false);
    assert.equal(o(s).orderStatus,'CANCELLED');assert.equal(o(s).paymentStatus,'PAID');assert.equal(o(s).refundStatus,'PENDING');
    assert.equal(o(s).refundReservedCents,16800);assert.equal(o(s).refundedCents,0);assertHeld(s,'RELEASED');
    assert.equal(refunds(s).length,1);assert.equal(refunds(s)[0].status,'PENDING');assert.equal(refunds(s)[0].budgetState,'RESERVED');
    validateOriginalLog(o(s),Object.values(s.db.logs));
  }
});
test('P04 payment after trusted closure/cancellation keeps cancellation and refunds released-budget funds once',async()=>{
  const s=await setup();await query(s,'CLOSED');await cancel(s);const cancelledAt=o(s).cancelledAt;
  await s.notificationService().handle(s.notification());assert.equal(p(s).accountingState,'QUARANTINED');
  assert.equal(s.db.budget.usedTransactions,1);assert.equal(s.db.budget.reservedTransactions,0);
  await s.recoveryService().compensateLate(s.paymentId,s.invocation);assert.equal(o(s).cancelledAt,cancelledAt);assertHeld(s,'RELEASED');
  assert.equal(o(s).refundReservedCents,16800);validateOriginalLog(o(s),Object.values(s.db.logs));
});
test('P04 repeated/parallel/restarted compensation and lost response reserve only one refund',async()=>{
  const s=await setup();s.controls.now=o(s).paymentDeadlineAt;await query(s);
  s.controls.loseResponse=true;await rejects(()=>s.recoveryService().compensateLate(s.paymentId,s.invocation),'OFFLINE_RESPONSE_LOST');
  const before=s.clone(s.db);await Promise.all([s.recoveryService().compensateLate(s.paymentId,s.invocation),s.recoveryService().compensateLate(s.paymentId,s.invocation)]);
  assert.deepEqual(s.db,before);assert.equal(refunds(s).length,1);
  const r=await s.notificationService().handle(s.notification({eventId:'AFTER_COMPENSATION'}));assert.equal(r.disposition,'TRANSACTION_DUPLICATE');
  assert.equal(s.db.budget.usedTransactions,1);
});
test('P04 all 10 late-pending compensation writes roll back on exception/zero-row',async()=>{
  for(const kind of ['failAt','zeroAt'])for(let i=1;i<=10;i++){
    const s=await setup();s.controls.now=o(s).paymentDeadlineAt;await query(s);const before=s.clone(s.db);s.controls[kind]=i;
    await assert.rejects(()=>s.recoveryService().compensateLate(s.paymentId,s.invocation));assert.deepEqual(s.db,before);
  }
});
test('P04 funds with amount/resource/log/budget anomalies cannot auto-authorize a refund',async()=>{
  for(const issue of ['amount','resource','log','budget']){
    const s=await setup();s.controls.now=o(s).paymentDeadlineAt;
    if(issue==='budget')s.db.budget.authorizationFingerprint='b'.repeat(64);
    await query(s,'SUCCESS',issue==='amount'?{amountCents:1}:{});
    if(issue==='resource')s.db.held.reservations[0].quantity++;
    if(issue==='log')s.db.logs.OFFLINE_CREATED.after.version++;
    await assert.rejects(()=>s.recoveryService().compensateLate(s.paymentId,s.invocation));
    assert.equal(refunds(s).length,0);assert.equal(o(s).paidCents,0);assertHeld(s,'HELD');
  }
});
test('P04 cancelled compensation cannot reserve more than the original funds or another refund intent',async()=>{
  const s=await setup();s.controls.now=o(s).paymentDeadlineAt;await query(s);
  s.db.refunds.OTHER={_id:'OTHER',paymentId:s.paymentId};
  await rejects(()=>s.recoveryService().compensateLate(s.paymentId,s.invocation),'COMPENSATION_REVIEW_REQUIRED');assert.equal(o(s).paidCents,0);
});
test('P04 read fences reject order/payment/budget/role/config changes before commit',async()=>{
  for(const target of ['orders','payments','budget','users','manifest']){
    const s=await setup(),q=await s.recoveryService().prepareQuery(s.paymentId,s.invocation),raw=s.response(q.requestId);
    s.controls.beforeCommit=db=>{if(target==='manifest')db.manifest.profiles.test.version='OTHER';
      else if(target==='budget')db.budget.version++;else Object.values(db[target])[0].version++;};
    await rejects(()=>s.recoveryService().acceptResponse(raw),'VERSION_CONFLICT');assert.equal(o(s).paidCents,0);assertHeld(s,'HELD');
  }
});
test('P04 existing funds recover after user disable and new-test authorization expiry',async()=>{
  const s=await setup(),paidAt=s.controls.now;s.controls.now=s.config.profile.controlledTest.expiresAt+1;
  s.db.users[o(s).ownerId].status='DISABLED';const {result}=await query(s,'SUCCESS',{occurredAt:paidAt});
  assert.equal(result.disposition,'APPLIED');assert.equal(o(s).paidCents,16800);
});
test('P04 production omits test budgets and both provider candidates keep false execution flags',async()=>{
  for(const options of [{stage:'production'},{route:'CLOUDBASE_INTEGRATION_V3'}]){
    const s=await setup(options),{result}=await query(s);assert.equal(result.disposition,'APPLIED');assert.equal(result.cloudVerified,false);
    assert.equal(result.callable,false);if(options.stage==='production')assert.equal(s.db.budget,null);
  }
});
test('P04 recovery records/output omit raw messages/payer OPENID/credentials and no SDK executor is present',async()=>{
  const s=await setup(),{raw,result}=await query(s),serialized=JSON.stringify({events:s.db.events,result});
  assert.ok(!serialized.includes(raw.body));assert.ok(!serialized.includes(s.db.users[o(s).ownerId].openId));
  assert.ok(!serialized.includes('PRIVATE_SECRET'));assert.equal(result.paymentAllowed,false);
  assert.throws(()=>createPaymentRecoveryService({...s.optionsFor(),verifyRecoveryResponse:null}),e=>e.code==='INVALID_CONFIGURATION');
});

test('P04 closing a PREPARED intent blocks its first prepay dispatch until recovery',async()=>{
  const s=await setup();Object.assign(p(s),{dispatchState:'PREPARED',dispatchToken:null,dispatchStartedAt:null});
  await close(s);const r=await s.service().claimDispatch(o(s)._id,s.paymentId,s.principal);
  assert.equal(r.disposition,'QUERY_REQUIRED');assert.equal(p(s).dispatchState,'PREPARED');
  const prepared=await s.service().prepare(s.event('fresh-key-prepared'),s.principal);assert.equal(prepared.disposition,'QUERY_REQUIRED');
});
test('P04 released test budget exhausted by later intents preserves new late funds for review without overspending',async()=>{
  const s=await setup();await query(s,'CLOSED');await cancel(s);
  const grant=s.db.manifest.profiles.test.controlledTest;
  s.db.budget.reservedAmountCents=grant.maxTotalCents;s.db.budget.reservedTransactions=grant.maxTransactions;
  await s.notificationService().handle(s.notification());assert.equal(p(s).status,'PAID');assert.equal(p(s).accountingState,'QUARANTINED');
  assert.equal(s.db.budget.usedTransactions,0);assert.equal(s.db.budget.reservedAmountCents,grant.maxTotalCents);
  await rejects(()=>s.recoveryService().compensateLate(s.paymentId,s.invocation),'COMPENSATION_REVIEW_REQUIRED');assert.equal(refunds(s).length,0);
});
test('P04 concurrent close query and payment notification converge to funds, with compensation when closed won',async()=>{
  for(const paymentFirst of [true,false]){
    const s=await setup(),q=await s.recoveryService().prepareQuery(s.paymentId,s.invocation),closed=s.response(q.requestId,'CLOSED'),paid=s.notification();
    await Promise.all(paymentFirst?[s.notificationService().handle(paid),s.recoveryService().acceptResponse(closed)]:
      [s.recoveryService().acceptResponse(closed),s.notificationService().handle(paid)]);
    // Authentication has independent awaits: invocation order is not commit order.
    if(o(s).orderStatus==='PAID'){assertHeld(s,'CONFIRMED');assert.equal(refunds(s).length,0);}
    else {await s.recoveryService().compensateLate(s.paymentId,s.invocation);assert.equal(o(s).orderStatus,'CANCELLED');assertHeld(s,'RELEASED');assert.equal(refunds(s).length,1);}
    assert.equal(o(s).paidCents,16800);assert.equal(s.db.budget.usedTransactions,1);
  }
});
test('P04 a new verified unpaid query after uncertain close can prepare a new close, without resending old request',async()=>{
  const s=await setup(),first=await close(s);await s.recoveryService().acceptResponse(s.response(first.requestId,'UNKNOWN'));
  const second=await close(s);assert.notEqual(first.requestId,second.requestId);assert.equal(second.disposition,'CLOSE_REQUEST_REQUIRED');
  assertHeld(s,'HELD');assert.equal(s.db.budget.reservedTransactions,1);
});
test('P04 corruption of request/observation/guard/compensation/refund cannot make replay bypass validation',async()=>{
  for(const issue of ['request','observation','guard','compensation','refund']){
    const s=await setup();s.controls.now=o(s).paymentDeadlineAt;const {q,raw}=await query(s);
    if(issue==='request')s.db.events[q.requestId].outTradeNo='CORRUPT';
    if(issue==='observation')events(s).find(e=>e.recordType==='RECOVERY_OBSERVATION').semanticFingerprint='a'.repeat(64);
    if(['request','observation'].includes(issue)){await assert.rejects(()=>s.recoveryService().acceptResponse(raw));continue;}
    if(issue==='guard')events(s).find(e=>e.recordType==='TRANSACTION_GUARD').evidence.amountCents=1;
    else {await s.recoveryService().compensateLate(s.paymentId,s.invocation);
      if(issue==='compensation')events(s).find(e=>e.recordType==='LATE_PAYMENT_COMPENSATION').amountCents=1;
      else refunds(s)[0].amountCents=1;}
    await assert.rejects(()=>s.recoveryService().compensateLate(s.paymentId,s.invocation));
  }
});
test('P04 cancelled-order compensation has six writes and every failure/zero rolls back entirely',async()=>{
  for(const kind of ['failAt','zeroAt'])for(let i=1;i<=6;i++){
    const s=await setup();await query(s,'CLOSED');await cancel(s);await s.notificationService().handle(s.notification());
    const before=s.clone(s.db);s.controls[kind]=i;
    await assert.rejects(()=>s.recoveryService().compensateLate(s.paymentId,s.invocation));assert.deepEqual(s.db,before);
  }
});
test('P04 two unpaid intents require both authoritative closed results before the order can release',async()=>{
  const s=await setup(),second=s.clone(p(s));second._id='OFFLINE_SECOND_INTENT';second.outTradeNo='B'.repeat(32);
  s.db.payments[second._id]=second;s.db.budget.reservedAmountCents*=2;s.db.budget.reservedTransactions=2;
  await query(s,'CLOSED');assert.equal(o(s).paymentStatus,'UNPAID');
  assert.equal((await cancel(s)).disposition,'PAYMENT_COORDINATION_REQUIRED');assertHeld(s,'HELD');
});
test('P04 historical O03 details read closed/late-refund logs without exposing private financial identifiers',async()=>{
  for(const scenario of ['closed','late']){
    const tx=require('./fixtures/order-transaction').setup(),quote=tx.makeQuote({quantity:2});
    const created=await tx.service.execute(quote.event,quote.customer),s=await setup(),full=s.clone(tx.db.orders[created.result.entityId]);
    Object.assign(full,{_id:o(s)._id,ownerId:s.principal.subjectId,quoteId:s.db.held.quote._id,createdAt:o(s).createdAt,
      updatedAt:o(s).updatedAt,paymentDeadlineAt:o(s).paymentDeadlineAt});full.appointmentSnapshot.slotId='OFFLINE_SLOT';
    s.db.orders.OFFLINE_ORDER=full;p(s).amountCents=full.totalCents;s.db.budget.reservedAmountCents=full.totalCents;
    s.db.held.quote.storeId=full.storeId;s.db.held.resources.forEach(e=>e.resource.storeId=full.storeId);
    s.db.held.reservations.forEach(r=>Object.assign(r,{storeId:full.storeId,createdAt:full.createdAt,updatedAt:full.createdAt}));
    Object.assign(s.db.logs.OFFLINE_CREATED,{createdAt:full.createdAt,updatedAt:full.createdAt});
    const items=Object.values(tx.db.items).map(item=>({...s.clone(item),orderId:full._id,createdAt:full.createdAt,updatedAt:full.createdAt}));
    if(scenario==='closed'){await query(s,'CLOSED');await cancel(s);}
    else {s.controls.now=full.paymentDeadlineAt;await query(s);await s.recoveryService().compensateLate(s.paymentId,s.invocation);}
    const {createOrderReadModel}=require('../cloudfunctions/_shared/order-read-model');
    const model=createOrderReadModel({user:s.db.users[s.principal.subjectId],orders:[o(s)],items,logs:Object.values(s.db.logs),cancellations:[],mediaAssets:[]},
      s.principal,{...s.settings,allowedCloudPrefixes:[]},{id:'OFFLINE_READ_KEY',secret:Buffer.alloc(32,11)});
    const detail=model.get({action:'get',payload:{orderId:full._id}},s.controls.now);
    assert.equal(detail.orderStatus,'CANCELLED');assert.equal(detail.totalCents,full.totalCents);
    assert.equal(detail.timeline.length,scenario==='closed'?3:2);
    assert.ok(detail.timeline.some(e=>e.message===(scenario==='closed'?'付款单已关闭':'付款已核实，订单取消，退款待处理')));
    assert.ok(!JSON.stringify(detail).includes('OFFLINE_TRANSACTION_1'));
  }
});
