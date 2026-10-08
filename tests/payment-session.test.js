'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createPaymentSession,paymentAvailability}=require('../miniprogram/features/payment/payment-session');
const {parseApiRequest}=require('../cloudfunctions/_shared/api-contract');
const fixture=patch=>({orderId:'p05-order',version:0,orderStatus:'PENDING_PAYMENT',paymentStatus:'UNPAID',
  refundStatus:'NONE',currency:'CNY',totalCents:1200,paidCents:0,refundedCents:0,refundReservedCents:0,
  paymentDeadlineAt:2000,activePaymentState:'NONE',...patch});
const paid=patch=>fixture({version:1,orderStatus:'PAID',paymentStatus:'PAID',paidCents:1200,...patch});
function setup(){let generated=0;const session=createPaymentSession('p05-order',()=>`p05-request-key-${++generated}`);
  return {session,get generated(){return generated;}};}
function read(session,response=fixture(),now=1000){const request=session.beginRecovery();session.receiveState(request.ticket,response,now);return request;}
const throws=(fn,code)=>assert.throws(fn,error=>error.code===code);
test('P05 runtime gate stays closed, even after a contract-shaped PAID response',()=>{
  const {session}=setup();read(session,paid());assert.equal(session.current(1000).status,'PAID_REPORTED');
  assert.deepEqual(paymentAvailability().blockers,['CLOUD_PAYMENT_NOT_CONNECTED','PAYMENT_SOURCE_NOT_VERIFIED','REAL_DEVICE_PAYMENT_NOT_ACCEPTED']);
  for(const key of ['connected','callable','paymentAllowed','successPageAllowed'])assert.equal(session.current(1000)[key],false);
  throws(()=>session.beginCreate(1000),'PAYMENT_RECHECK_REQUIRED');assert.equal(session.requestPayment,undefined);
});
test('P05 requires state read first and sends only order/version/key through planned contracts',()=>{
  const {session}=setup();throws(()=>session.beginCreate(1000),'PAYMENT_RECHECK_REQUIRED');
  const query=read(session);assert.deepEqual(parseApiRequest('payment',query.request.event).payload,{orderId:'p05-order'});
  const request=session.beginCreate(1000);assert.deepEqual(parseApiRequest('payment',request.request.event).payload,
    {orderId:'p05-order',expectedVersion:0,idempotencyKey:'p05-request-key-1'});
  assert.equal(request.callable,false);assert.equal(request.paymentAllowed,false);assert(Object.isFrozen(request.request.event.payload));
  throws(()=>session.beginCreate(1000),'PAYMENT_RECHECK_REQUIRED');
});
test('P05 lost create response never causes an immediate new payment; verified retry reuses the same key',()=>{
  const s=setup();read(s.session);const first=s.session.beginCreate(1000);
  s.session.failed(first.ticket);throws(()=>s.session.beginCreate(1000),'PAYMENT_RECHECK_REQUIRED');
  assert.equal(s.session.current(1000).summary,null);read(s.session);
  assert.deepEqual(s.session.beginCreate(1000).request,first.request);assert.equal(s.generated,1);
});
test('P05 changed order version uses a new key and rejects a key generator collision',()=>{
  const s=setup();read(s.session);const first=s.session.beginCreate(1000);s.session.createFinished(first.ticket);
  read(s.session,fixture({version:1}));assert.equal(s.session.beginCreate(1000).request.event.payload.expectedVersion,1);assert.equal(s.generated,2);
  const session=createPaymentSession('p05-order',()=> 'always-identical-key');read(session);session.beginCreate(1000);
  read(session,fixture({version:1}));throws(()=>session.beginCreate(1000),'INVALID_PAYMENT_KEY');
});
test('P05 prepay completion only creates state.get, ignores payment parameters and duplicate completion',()=>{
  const {session}=setup();read(session);const first=session.beginCreate(1000);
  const query=session.createFinished(first.ticket,{success:true,paySign:'private'});
  assert.equal(query.request.event.action,'state.get');assert.equal(session.current(1000).status,'CONFIRMING');
  assert.equal(session.createFinished(first.ticket),null);assert(!JSON.stringify(session.current(1000)).includes('private'));
});
test('P05 client success/cancel/failure callbacks all require reconciliation and cannot mark paid',()=>{
  for(const callback of [{success:true},{cancel:true},{error:'raw private error'}]){
    const {session}=setup();read(session);const query=session.clientReturned(callback);
    assert.equal(query.request.event.action,'state.get');assert.equal(session.current(1000).status,'CONFIRMING');
    assert.equal(session.current(1000).summary,null);throws(()=>session.beginCreate(1000),'PAYMENT_RECHECK_REQUIRED');
  }
});
test('P05 PENDING, EXCEPTION or active unknown payment always block another charge',()=>{
  for(const patch of [{paymentStatus:'PENDING',activePaymentState:'PENDING'},
    {paymentStatus:'EXCEPTION',activePaymentState:'UNKNOWN'},{activePaymentState:'UNKNOWN'},{activePaymentState:'PENDING'}]){
    const {session}=setup();read(session,fixture(patch));assert.equal(session.current(1000).status,'CONFIRMING');
    throws(()=>session.beginCreate(1000),'PAYMENT_RECHECK_REQUIRED');
  }
});
test('P05 closed intent is not a new unpaid payment opportunity',()=>{
  for(const patch of [{paymentStatus:'CLOSED',activePaymentState:'CLOSED'},{activePaymentState:'CLOSED'}]){
    const {session}=setup();read(session,fixture(patch));assert.equal(session.current(1000).status,'CLOSED');
    throws(()=>session.beginCreate(1000),'PAYMENT_RECHECK_REQUIRED');
  }
});
test('P05 cancellation and paid/refund recovery never show ordinary purchase success or offer repayment',()=>{
  for(const response of [fixture({orderStatus:'CANCELLED'}),paid({orderStatus:'CANCELLED',refundStatus:'PENDING',refundReservedCents:1200}),
    paid({orderStatus:'COMPLETED',refundStatus:'SUCCEEDED',refundedCents:1200}),paid({refundStatus:'FAILED',refundReservedCents:1200})]){
    const {session}=setup();read(session,response);assert.equal(session.current(1000).status,'ORDER_ATTENTION');
    assert.equal(session.current(1000).successPageAllowed,false);throws(()=>session.beginCreate(1000),'PAYMENT_RECHECK_REQUIRED');
  }
});
test('P05 out-of-order queries and lifecycle invalidation ignore old callbacks while preserving retry identity',()=>{
  const {session}=setup(),old=session.beginRecovery(),latest=session.beginRecovery();
  assert.equal(session.receiveState(old.ticket,paid(),1000),false);assert.equal(session.receiveState(latest.ticket,fixture(),1000),true);
  const create=session.beginCreate(1000);session.invalidate();assert.equal(session.createFinished(create.ticket),null);
  assert.equal(session.current(1000).summary,null);read(session);assert.deepEqual(session.beginCreate(1000).request,create.request);
});
test('P05 state version rollback or conflicting same-version response cannot restore an unpaid button',()=>{
  for(const stale of [fixture(),fixture({version:1})]){
    const {session}=setup();read(session,paid());read(session,stale);
    assert.equal(session.current(1000).status,'CONFIRMING');assert.equal(session.current(1000).summary,null);
    throws(()=>session.beginCreate(1000),'PAYMENT_RECHECK_REQUIRED');
    read(session,paid());assert.equal(session.current(1000).status,'PAID_REPORTED');
  }
});
test('P05 malformed, wrong-order, offline, private-field or inconsistent amounts never authorize payment',()=>{
  for(const patch of [{orderId:'other-order'},{scope:'OFFLINE_PAYMENT_INTENT_RESULT'},{paidCents:1},
    {currency:'USD'},{totalCents:0},{version:-1},{paymentDeadlineAt:0},{outTradeNo:'private'},
    {orderStatus:'MAKING'},{refundedCents:1},{refundStatus:'SUCCEEDED'},{refundReservedCents:Number.MAX_SAFE_INTEGER},
    {paymentStatus:'PAID'},{activePaymentState:'READY'},{paymentAllowed:true}]){
    const {session}=setup();read(session,fixture(patch));assert.equal(session.current(1000).status,'CONFIRMING');
    assert.equal(session.current(1000).summary,null);throws(()=>session.beginCreate(1000),'PAYMENT_RECHECK_REQUIRED');
  }
});
test('P05 query failure and repeated failed callbacks keep a recoverable unknown result',()=>{
  const {session}=setup(),query=session.beginRecovery();assert.equal(session.failed(query.ticket),true);
  assert.equal(session.failed(query.ticket),false);assert.equal(session.current(1000).status,'CONFIRMING');
  read(session,paid());assert.equal(session.current(1000).status,'PAID_REPORTED');
});
test('P05 exact deadline blocks create but does not locally cancel or release funds/resources',()=>{
  const {session}=setup();read(session);throws(()=>session.beginCreate(2000),'PAYMENT_DEADLINE_EXPIRED');
  assert.equal(session.current(2000).status,'DEADLINE_REACHED');
  read(session,paid(),3000);assert.equal(session.current(3000).status,'PAID_REPORTED');
  assert.equal(session.cancelOrder,undefined);assert.equal(session.releaseResources,undefined);
});
test('P05 passive time refresh closes an expired button and state projection is immutable',()=>{
  const {session}=setup(),source=fixture();read(session,source);source.totalCents=1;
  const view=session.current(1500);assert.equal(view.summary.totalCents,1200);assert(Object.isFrozen(view.summary));
  assert.equal(session.current(2000).status,'DEADLINE_REACHED');
});
test('P05 invalid session/key/time inputs fail without silently generating a new identity',()=>{
  throws(()=>createPaymentSession('',()=>''),'INVALID_PAYMENT_SESSION');
  throws(()=>createPaymentSession('valid',null),'INVALID_PAYMENT_SESSION');
  const session=createPaymentSession('p05-order',()=> 'short');read(session);
  throws(()=>session.beginCreate(1000),'INVALID_PAYMENT_KEY');assert.equal(session.current(1000).status,'READY_TO_REQUEST');
  throws(()=>session.beginCreate(NaN),'INVALID_PAYMENT_SESSION');throws(()=>session.current(0),'INVALID_PAYMENT_SESSION');
});
test('P05 intent observation can change at the same order version without accepting conflicting order facts',()=>{
  const {session}=setup();read(session);session.beginCreate(1000);
  read(session,fixture({activePaymentState:'PENDING'}));assert.equal(session.current(1000).status,'CONFIRMING');
  read(session,fixture({activePaymentState:'CLOSED'}));assert.equal(session.current(1000).status,'CLOSED');
  read(session,fixture({totalCents:1201}));assert.equal(session.current(1000).status,'CONFIRMING');
});
test('P05 higher order version cannot rewrite fixed amount/deadline or roll back paid/closed funds',()=>{
  for(const [first,next] of [[fixture(),fixture({version:1,totalCents:1201})],
    [fixture(),fixture({version:1,paymentDeadlineAt:3000})],[paid(),fixture({version:2})],
    [fixture({paymentStatus:'CLOSED',activePaymentState:'CLOSED'}),fixture({version:1})]]){
    const {session}=setup();read(session,first);read(session,next);
    assert.equal(session.current(1000).status,'CONFIRMING');assert.equal(session.current(1000).summary,null);
    throws(()=>session.beginCreate(1000),'PAYMENT_RECHECK_REQUIRED');
  }
});
test('P05 reaching the deadline is latched within a session even if the client clock moves backwards',()=>{
  const {session}=setup();read(session);session.current(2000);read(session,fixture(),1000);
  assert.equal(session.current(1000).status,'DEADLINE_REACHED');throws(()=>session.beginCreate(1000),'PAYMENT_RECHECK_REQUIRED');
  read(session,paid(),1000);assert.equal(session.current(1000).status,'PAID_REPORTED');
});

test('P05 cancelled/completed orders and observed closed intents cannot regress at higher versions',()=>{
  for(const [first,next] of [[fixture({orderStatus:'CANCELLED'}),fixture({version:1})],
    [paid({orderStatus:'COMPLETED'}),paid({version:2})],
    [fixture({activePaymentState:'CLOSED'}),fixture({version:1})]]){
    const {session}=setup();read(session,first);read(session,next);
    assert.equal(session.current(1000).status,'CONFIRMING');
    assert.equal(session.current(1000).summary,null);throws(()=>session.beginCreate(1000),'PAYMENT_RECHECK_REQUIRED');
  }
});

test('P05 cumulative refunded funds cannot decrease at a higher order version',()=>{
  const {session}=setup();read(session,paid({refundStatus:'SUCCEEDED',refundedCents:600}));
  read(session,paid({version:2,refundStatus:'NONE',refundedCents:0}));
  assert.equal(session.current(1000).status,'CONFIRMING');assert.equal(session.current(1000).summary,null);
});

test('P05 closed intent remains observed across intermediate unknown reads and lifecycle invalidation',()=>{
  const {session}=setup();read(session,fixture({activePaymentState:'CLOSED'}));session.invalidate();
  read(session,fixture({version:1,activePaymentState:'UNKNOWN'}));read(session,fixture({version:2}));
  assert.equal(session.current(1000).status,'CONFIRMING');throws(()=>session.beginCreate(1000),'PAYMENT_RECHECK_REQUIRED');
  read(session,paid({version:3}));assert.equal(session.current(1000).status,'PAID_REPORTED');
});
