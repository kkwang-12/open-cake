'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {setup,axes}=require('./fixtures/refund');
const {validateOriginalLog}=require('../cloudfunctions/_shared/payment-notification-model');
const {validateLedger}=require('../cloudfunctions/_shared/refund-model');
const {bindingOf}=require('../cloudfunctions/_shared/payment-recovery-model');
const r=s=>s.db.refunds['refund-intent'];
const rejects=(fn,code)=>assert.rejects(fn,e=>e.code===code);
const prepare=(s,operation='SUBMIT',key='offline-request-1')=>s.service().prepare(r(s)._id,operation,key,s.invocation);
test('P06 partial/full success settles only reserved amount, preserving order/payment/fulfillment facts',async()=>{
  for(const amount of [2500,10000])for(const mode of ['PICKUP','DELIVERY']){
    const s=setup({amount,mode}),before=s.clone(s.db),a=await prepare(s),result=await s.service().acceptResult(s.response(a.attemptId));
    assert.equal(result.disposition,'REFUND_SETTLED');assert.equal(result.externalRefundExecuted,false);
    assert.equal(r(s).status,'SUCCEEDED');assert.equal(r(s).budgetState,'SETTLED');assert.equal(s.db.order.refundedCents,amount);
    assert.equal(s.db.order.refundReservedCents,0);assert.equal(s.db.order.refundStatus,'SUCCEEDED');
    assert.equal(s.db.order.orderStatus,'PAID');assert.deepEqual(s.db.payment,before.payment);
    assert.equal(s.db.order.fulfillment,mode);validateOriginalLog(s.db.order,Object.values(s.db.logs));
  }
});
test('P06 same request/parallel submit/new key only claims one sending attempt',async()=>{
  const s=setup(),first=await prepare(s);
  assert.equal((await prepare(s)).disposition,'ATTEMPT_REPLAY');
  assert.equal((await prepare(s,'SUBMIT','other-key')).disposition,'QUERY_REQUIRED');
  await Promise.all([prepare(s),prepare(s,'SUBMIT','parallel-key')]);assert.equal(Object.keys(s.db.attempts).length,1);
  assert.equal(first.transportPlan.outRefundNo,r(s).outRefundNo);assert.equal(first.callable,false);
});
test('P06 accepted/unknown results are not refunded; unresolved requests require query',async()=>{
  for(const outcome of ['ACCEPTED','UNKNOWN']){
    const s=setup(),a=await prepare(s),result=await s.service().acceptResult(s.response(a.attemptId,outcome));
    assert.equal(result.disposition,'QUERY_REQUIRED');assert.equal(s.db.order.refundedCents,0);
    assert.equal(r(s).status,'PENDING');assert.equal(r(s).budgetState,'RESERVED');
    assert.equal((await prepare(s,'SUBMIT','retry')).disposition,'QUERY_REQUIRED');
    const query=await prepare(s,'QUERY','query');assert.equal(query.transportPlan.outRefundNo,'OFFLINE_REFUND');
    assert.equal((await prepare(s,'QUERY','query-again')).disposition,'QUERY_IN_FLIGHT');
  }
});
test('P06 query can settle an earlier success whose actual time precedes the query',async()=>{
  const s=setup(),a=await prepare(s);await s.service().acceptResult(s.response(a.attemptId,'UNKNOWN'));
  s.controls.now=6000;const q=await prepare(s,'QUERY','query');
  await s.service().acceptResult(s.response(q.attemptId,'SUCCESS',{occurredAt:5500}));
  assert.equal(r(s).settledAt,5500);assert.equal(s.db.order.refundedCents,2500);
});

test('P06 a lost query can be queried again at the configured timeout without resubmitting funds',async()=>{
  const s=setup(),a=await prepare(s),first=await prepare(s,'QUERY','lost-query');
  const before=s.clone(s.db);s.controls.now+=999;
  assert.equal((await prepare(s,'QUERY','early')).disposition,'QUERY_IN_FLIGHT');assert.deepEqual(s.db,before);
  s.controls.now++;
  const next=await prepare(s,'QUERY','recovery');assert.equal(next.disposition,'TRANSPORT_REQUIRED');
  assert.equal(next.transportPlan.outRefundNo,first.transportPlan.outRefundNo);
  assert.equal((await prepare(s,'SUBMIT','forbidden-retry')).disposition,'QUERY_REQUIRED');
  const oldFailure=s.response(first.attemptId,'FAILED');
  assert.equal((await s.service().acceptResult(oldFailure)).disposition,'OBSERVATION_ONLY');
  await s.service().acceptResult(s.response(a.attemptId));assert.equal(s.db.order.refundedCents,2500);
});

test('P06 timeout query recovery grants one read attempt to competing workers',async()=>{
  const s=setup();await prepare(s);await prepare(s,'QUERY','lost-query');s.controls.now+=1000;
  const results=await Promise.all([prepare(s,'QUERY','worker-one'),prepare(s,'QUERY','worker-two')]);
  assert.equal(results.filter(v=>v.disposition==='TRANSPORT_REQUIRED').length,1);
  assert.equal(results.filter(v=>v.disposition==='QUERY_IN_FLIGHT').length,1);
  assert.equal(Object.values(s.db.attempts).filter(v=>v.operation==='SUBMIT').length,1);
  assert.equal(s.db.order.refundReservedCents,2500);assert.equal(s.db.order.refundedCents,0);
});

test('P06 accepted provider refund identity cannot change during later query results',async()=>{
  const s=setup(),a=await prepare(s);await s.service().acceptResult(s.response(a.attemptId,'ACCEPTED'));
  assert.equal(r(s).providerRefundId,'OFFLINE_PROVIDER_refund-intent');assert.equal(s.db.order.refundedCents,0);
  const q=await prepare(s,'QUERY','query'),before=s.clone(s.db);
  await rejects(()=>s.service().acceptResult(s.response(q.attemptId,'SUCCESS',{providerRefundId:'different-provider-id'})),
    'REFUND_EVIDENCE_MISMATCH');assert.deepEqual(s.db,before);
});

test('P06 acceptance event, identity guard, attempt and refund identity roll back together',async()=>{
  for(const control of ['failAt','zeroAt'])for(let n=1;n<=4;n++){
    const s=setup(),a=await prepare(s),raw=s.response(a.attemptId,'ACCEPTED'),before=s.clone(s.db);
    s.controls[control]=n;await assert.rejects(()=>s.service().acceptResult(raw));assert.deepEqual(s.db,before);
    s.controls[control]=0;await s.service().acceptResult(raw);
    assert.equal(r(s).providerRefundId,'OFFLINE_PROVIDER_refund-intent');assert.equal(s.db.order.refundedCents,0);
    assert.equal(s.db.order.refundReservedCents,2500);assert.equal(s.db.order.version,before.order.version);
  }
});

test('P06 second-resolution success overlaps submit without inventing milliseconds',async()=>{
  const s=setup();s.controls.now=5500;const a=await prepare(s);s.controls.now=6000;
  await s.service().acceptResult(s.response(a.attemptId,'SUCCESS',{occurredAt:5000,occurredAtPrecisionMs:1000}));
  assert.equal(r(s).settledAt,5000);assert.equal(r(s).settledAtPrecisionMs,1000);
  assert.equal(s.db.order.refundedCents,2500);assert.equal((await prepare(s,'SUBMIT','done')).disposition,'ALREADY_SETTLED');
});

test('P06 stale or unaligned second-resolution success is rejected without changing funds',async()=>{
  for(const occurredAt of [4000,5001]){
    const s=setup();s.controls.now=5500;const a=await prepare(s);s.controls.now=6000;const before=s.clone(s.db);
    await rejects(()=>s.service().acceptResult(s.response(a.attemptId,'SUCCESS',{occurredAt,occurredAtPrecisionMs:1000})),
      'REFUND_EVIDENCE_MISMATCH');assert.deepEqual(s.db,before);
  }
});
test('P06 failure keeps the same reserved budget and authorized retry keeps the original refund number',async()=>{
  const s=setup(),a=await prepare(s);await s.service().acceptResult(s.response(a.attemptId,'FAILED'));
  assert.equal(r(s).status,'FAILED');assert.equal(s.db.order.refundReservedCents,2500);assert.equal(s.db.order.refundStatus,'FAILED');
  const retry=await prepare(s,'SUBMIT','retry');assert.equal(retry.transportPlan.outRefundNo,'OFFLINE_REFUND');
  assert.equal(Object.keys(s.db.refunds).length,1);await s.service().acceptResult(s.response(retry.attemptId));
  assert.equal(s.db.order.refundedCents,2500);assert.equal(s.db.order.refundReservedCents,0);
});
test('P06 repeat/response loss/service restart do not refund or write logs twice',async()=>{
  const s=setup(),a=await prepare(s),raw=s.response(a.attemptId);s.controls.loseResponse=true;
  await rejects(()=>s.service().acceptResult(raw),'OFFLINE_RESPONSE_LOST');const before=s.clone(s.db);
  assert.equal((await s.service().acceptResult(raw)).disposition,'RESULT_REPLAY');assert.deepEqual(s.db,before);
  await Promise.all([s.service().acceptResult(raw),s.service().acceptResult(raw)]);assert.deepEqual(s.db,before);
});
test('P06 lost submission response recovers the attempt without minting another send right',async()=>{
  const s=setup();s.controls.loseResponse=true;await rejects(()=>prepare(s),'OFFLINE_RESPONSE_LOST');
  assert.equal((await prepare(s)).disposition,'ATTEMPT_REPLAY');assert.equal((await prepare(s,'SUBMIT','new')).disposition,'QUERY_REQUIRED');
});
test('P06 failure arriving after success does not undo settled funds',async()=>{
  const s=setup(),a=await prepare(s),failed=s.response(a.attemptId,'FAILED');await s.service().acceptResult(s.response(a.attemptId));
  assert.equal((await s.service().acceptResult(failed)).disposition,'OBSERVATION_ONLY');
  assert.equal(r(s).status,'SUCCEEDED');assert.equal(s.db.order.refundedCents,2500);assert.equal(s.db.order.version,3);
});
test('P06 stale negative observation cannot override a newer attempt',async()=>{
  const s=setup(),a=await prepare(s),old=s.response(a.attemptId,'FAILED'),q=await prepare(s,'QUERY','q');
  assert.equal((await s.service().acceptResult(old)).disposition,'OBSERVATION_ONLY');assert.equal(r(s).status,'PENDING');
  await s.service().acceptResult(s.response(q.attemptId));assert.equal(r(s).status,'SUCCEEDED');
});
test('P06 each success write exception/zero result rolls the entire transaction back',async()=>{
  // event, global provider ID guard, attempt, refund, order, log.
  for(const control of ['failAt','zeroAt'])for(let n=1;n<=6;n++){
    const s=setup(),a=await prepare(s),raw=s.response(a.attemptId),before=s.clone(s.db);s.controls[control]=n;
    await assert.rejects(()=>s.service().acceptResult(raw));assert.deepEqual(s.db,before);
    s.controls[control]=0;await s.service().acceptResult(raw);assert.equal(s.db.order.refundedCents,2500);
  }
});
test('P06 submit write failure/zero and read conflict never return a sending plan',async()=>{
  for(const control of ['failAt','zeroAt']){const s=setup(),before=s.clone(s.db);s.controls[control]=1;
    await assert.rejects(()=>prepare(s));assert.deepEqual(s.db,before);}
  const s=setup();s.controls.conflict=true;await rejects(()=>prepare(s),'VERSION_CONFLICT');assert.equal(Object.keys(s.db.attempts).length,0);
});
test('P06 authentication cannot be faked by flags, JSON copies or ordinary customers',async()=>{
  const s=setup();await rejects(()=>s.service().prepare(r(s)._id,'SUBMIT','k',{verified:true,role:'ADMIN'}),'FORBIDDEN');
  const a=await prepare(s),raw=s.response(a.attemptId);await rejects(()=>s.service().acceptResult(s.clone(raw)),'REFUND_SOURCE_REJECTED');
  s.controls.verifierThrows=true;await rejects(()=>s.service().acceptResult(raw),'REFUND_VERIFIER_UNAVAILABLE');
  s.controls.verifierThrows=false;s.controls.denyAuth=true;await rejects(()=>prepare(s,'QUERY','q'),'FORBIDDEN');
});
test('P06 wrong number/amount/currency/original transaction/time/provider binding leaves funds unchanged',async()=>{
  for(const patch of [{outRefundNo:'other'},{transactionId:'other'},{refundCents:1},{paymentCents:1},{currency:'USD'},
    {occurredAt:1},{occurredAt:9999},{binding:{environment:'other'}},{verificationMethod:'CLIENT_VERIFIED'}]){
    const s=setup(),a=await prepare(s),before=s.clone(s.db);await rejects(()=>s.service().acceptResult(s.response(a.attemptId,'SUCCESS',patch)),'REFUND_EVIDENCE_MISMATCH');
    assert.deepEqual(s.db,before);
  }
});
test('P06 unresolved paid ledger, mismatched budget and missing approval refuse dispatch',async()=>{
  for(const change of [s=>{s.db.payment.accountingState='QUARANTINED';},s=>{r(s).amountCents=2501;},
    s=>{r(s).approvalLogId='missing';},s=>{r(s).budgetState='RELEASED';},s=>{r(s).amountCents=0;}]){
    const s=setup();change(s);await assert.rejects(()=>prepare(s));assert.equal(Object.keys(s.db.attempts).length,0);
  }
});
test('P06 multiple partial refunds accumulate within the original payment without releasing failed budget',async()=>{
  const s=setup(),a=await prepare(s);await s.service().acceptResult(s.response(a.attemptId));
  const old=s.clone(s.db.order);s.controls.now=6000;
  s.db.order={...old,version:old.version+1,updatedAt:6000,refundStatus:'PENDING',refundReservedCents:3000};
  const actor={type:'MERCHANT',subjectId:'offline-merchant'};
  s.db.logs.second={_id:'second',schemaVersion:1,version:0,orderId:old._id,createdAt:6000,updatedAt:6000,command:'APPROVE_REFUND',
    actor,before:axes(old),after:axes(s.db.order)};
  s.db.refunds.second={...r(s),_id:'second',version:0,createdAt:6000,updatedAt:6000,amountCents:3000,outRefundNo:'OFFLINE_SECOND',
    approvalLogId:'second',approvedBy:actor,status:'PENDING',budgetState:'RESERVED',providerRefundId:null,settledAt:null,settledAtPrecisionMs:null,lastEventId:null};
  const state={order:s.db.order,payment:s.db.payment,payments:[s.db.payment],refund:s.db.refunds.second,
    refunds:Object.values(s.db.refunds),attempts:[],logs:Object.values(s.db.logs)};
  validateLedger(state,{now:6000,environment:s.db.payment.environment,appId:s.db.payment.appId,provider:s.db.payment.provider,
    configuration:{plan:()=>({...bindingOf(s.db.payment),route:s.db.payment.provider})}});
  const second=await s.service().prepare('second','SUBMIT','second-key',s.invocation);
  await s.service().acceptResult(s.response(second.attemptId));assert.equal(s.db.order.refundedCents,5500);
  assert.equal(s.db.order.refundReservedCents,0);validateOriginalLog(s.db.order,Object.values(s.db.logs));
  s.db.refunds.second.amountCents=8000;assert.throws(()=>validateLedger(state,{now:6000,appId:s.db.payment.appId}));
});
test('P06 provider ID and event conflicts refuse inconsistent evidence without changing refunds',async()=>{
  const s=setup(),a=await prepare(s),raw=s.response(a.attemptId,'SUCCESS',{providerEventId:'same-event'});
  await s.service().acceptResult(raw);const before=s.clone(s.db);
  await rejects(()=>s.service().acceptResult(s.response(a.attemptId,'FAILED',{providerEventId:'same-event'})),'REFUND_EVENT_CONFLICT');
  await rejects(()=>s.service().acceptResult(s.response(a.attemptId,'SUCCESS',{occurredAt:4999})),'REFUND_EVIDENCE_MISMATCH');
  assert.deepEqual(s.db,before);
});
test('P06 failed-result writes also roll back together without freeing any refund budget',async()=>{
  for(const control of ['failAt','zeroAt'])for(let n=1;n<=5;n++){
    const s=setup(),a=await prepare(s),raw=s.response(a.attemptId,'FAILED'),before=s.clone(s.db);s.controls[control]=n;
    await assert.rejects(()=>s.service().acceptResult(raw));assert.deepEqual(s.db,before);
  }
});
test('P06 both provider authentication candidates stay offline and settle the same way',async()=>{
  for(const provider of ['WECHATPAY_DIRECT_V3','CLOUDBASE_INTEGRATION_V3']){
    const s=setup({provider}),a=await prepare(s);await s.service().acceptResult(s.response(a.attemptId));
    assert.equal(s.db.order.refundedCents,2500);assert.equal((await prepare(s,'SUBMIT','done')).disposition,'ALREADY_SETTLED');
  }
});
test('P06 P04 late compensation intent settles while preserving cancelled order and released resources',async()=>{
  const {setup:recoverySetup}=require('./fixtures/payment-recovery');
  const {createOrderReadModel}=require('../cloudfunctions/_shared/order-read-model');
  for(const mode of ['PICKUP','DELIVERY']){
    const original=await recoverySetup({mode});
    const tx=require('./fixtures/order-transaction').setup(),quote=tx.makeQuote({quantity:2,mode});
    const created=await tx.service.execute(quote.event,quote.customer),old=original.db.orders.OFFLINE_ORDER;
    const full=original.clone(tx.db.orders[created.result.entityId]);
    Object.assign(full,{_id:old._id,ownerId:original.principal.subjectId,quoteId:original.db.held.quote._id,
      createdAt:old.createdAt,updatedAt:old.updatedAt,paymentDeadlineAt:old.paymentDeadlineAt});
    full.appointmentSnapshot.slotId='OFFLINE_SLOT';original.db.orders.OFFLINE_ORDER=full;
    original.db.payments[original.paymentId].amountCents=full.totalCents;original.db.budget.reservedAmountCents=full.totalCents;
    original.db.held.quote.storeId=full.storeId;original.db.held.resources.forEach(e=>e.resource.storeId=full.storeId);
    original.db.held.reservations.forEach(item=>Object.assign(item,{storeId:full.storeId,createdAt:full.createdAt,updatedAt:full.createdAt}));
    const items=Object.values(tx.db.items).map(item=>({...original.clone(item),orderId:full._id,createdAt:full.createdAt,updatedAt:full.createdAt}));
    original.controls.now=full.paymentDeadlineAt+1000;
    const q=await original.recoveryService().prepareQuery(original.paymentId,original.invocation);
    await original.recoveryService().acceptResponse(original.response(q.requestId));
    await original.recoveryService().compensateLate(original.paymentId,original.invocation);
    const s=setup({now:original.controls.now,initialState:{order:original.db.orders.OFFLINE_ORDER,
      payment:original.db.payments[original.paymentId],refunds:original.db.refunds,attempts:{},events:{},logs:original.db.logs}});
    const id=Object.keys(s.db.refunds)[0],a=await s.service().prepare(id,'SUBMIT','late-refund',s.invocation);
    await s.service().acceptResult(s.response(a.attemptId));assert.equal(s.db.order.orderStatus,'CANCELLED');
    assert.equal(s.db.order.refundedCents,full.totalCents);assert.equal(s.db.order.refundReservedCents,0);
    assert(original.db.held.reservations.every(v=>v.status==='RELEASED'));
    validateOriginalLog(s.db.order,Object.values(s.db.logs));
    const detail=createOrderReadModel({user:original.db.users[original.principal.subjectId],orders:[s.db.order],
      items,logs:Object.values(s.db.logs),cancellations:[],mediaAssets:[]},
      original.principal,{...original.settings,allowedCloudPrefixes:[]},{id:'OFFLINE_READ_KEY',secret:Buffer.alloc(32,1)})
      .get({action:'get',payload:{orderId:s.db.order._id}},original.controls.now);
    assert.equal(detail.orderStatus,'CANCELLED');assert.equal(detail.refundSummary.completedExtent,'FULL');
    assert.equal(detail.timeline.at(-1).message,'退款已确认');
  }
});
