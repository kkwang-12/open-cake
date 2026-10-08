'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {setup}=require('./fixtures/payment-intent');
const {newMerchantOrderNumber}=require('../cloudfunctions/_shared/payment-intent-model');
const {planUnpaidCancellation}=require('../cloudfunctions/_shared/order-cancellation-model');
const rejects=(fn,code)=>assert.rejects(fn,e=>e.code===code);
const payment=s=>Object.values(s.db.payments)[0];
async function prepare(s,key){return s.service().prepare(s.event(key),s.principal);}
async function claim(s){return s.service().claimDispatch('OFFLINE_ORDER',payment(s)._id,s.principal);}

test('P02 trusted order creates one frozen offline intent; no invocation, money or order/resource changes',async()=>{
  for(const mode of ['PICKUP','DELIVERY']){
    const s=setup({mode}),original=s.clone({order:s.db.orders,held:s.db.held}),result=await prepare(s),p=payment(s);
    assert.equal(result.disposition,'CREATE_INTENT');assert.equal(result.paymentAllowed,false);
    assert.equal(result.callable,false);assert.equal(result.payInvocation,null);assert.equal(result.state,'PENDING_CONFIRMATION');
    assert.equal(p.amountCents,16800);assert.equal(p.currency,'CNY');assert.equal(p.dispatchState,'PREPARED');
    assert.equal(p.status,'PENDING');assert.equal(p.accountingState,'UNAPPLIED');assert.equal(p.transactionId,null);
    assert.deepEqual({order:s.db.orders,held:s.db.held},original);assert.equal(Object.isFrozen(result),true);
    assert.equal(s.db.budget.reservedAmountCents,16800);assert.equal(s.db.budget.reservedTransactions,1);
    for(const secret of [s.principal.subjectId,'merchantId','outTradeNo','dispatchToken'])assert.ok(!JSON.stringify(result).includes(secret));
  }
});
test('P02 independent random merchant number meets external length and never truncates internal order digest',()=>{
  const values=Array.from({length:100},()=>newMerchantOrderNumber());
  assert.equal(new Set(values).size,100);for(const v of values)assert.match(v,/^[A-F0-9]{32}$/);
});
test('P02 request whitelist rejects amount, owner, number, provider and arbitrary action injection without writes',async()=>{
  for(const field of ['totalFee','amountCents','ownerId','outTradeNo','provider','verified']){
    const s=setup(),e=s.event();e.payload[field]=1;
    await rejects(()=>s.service().prepare(e,s.principal),'INVALID_REQUEST');assert.equal(s.controls.commits,0);
  }
  const s=setup();await rejects(()=>s.service().prepare({...s.event(),action:'simulate'},s.principal),'INVALID_REQUEST');
});
test('P02 other owner, forged principal and current user revocation are rejected',async()=>{
  const s=setup(),other=s.actor('other');s.db.users[other.principal.subjectId]=other.user;
  await rejects(()=>s.service().prepare(s.event(),other.principal),'FORBIDDEN');
  await rejects(()=>s.service().prepare(s.event(),{...s.principal}),'AUTH_REQUIRED');
  s.db.users[s.principal.subjectId].status='DISABLED';await rejects(()=>prepare(s),'USER_DISABLED');
  assert.deepEqual(s.db.payments,{});
});
test('P02 cancelled and paid orders cannot create or replay usable payment parameters',async()=>{
  for(const status of ['CANCELLED','PAID']){
    const s=setup();await prepare(s);const o=s.db.orders.OFFLINE_ORDER;o.orderStatus=status;
    if(status==='PAID'){o.paymentStatus='PAID';o.paidCents=o.totalCents;}
    await rejects(()=>prepare(s),'INVALID_TRANSITION');assert.equal(s.controls.numberCalls,1);
  }
});
test('P02 expected version and reused key with different parameters reject; replay can recover after order version changes',async()=>{
  const s=setup(),e=s.event();await prepare(s);
  const changed=s.event();changed.payload.expectedVersion=1;
  await rejects(()=>s.service().prepare(changed,s.principal),'IDEMPOTENCY_KEY_REUSED');
  s.db.orders.OFFLINE_ORDER.version=1;
  assert.equal((await s.service().prepare(e,s.principal)).disposition,'REUSE_PREPARED');
  const old=s.event('other-key');old.payload.expectedVersion=0;
  await rejects(()=>s.service().prepare(old,s.principal),'VERSION_CONFLICT');
  await prepare(s,'new-version-key');assert.equal((await prepare(s,'new-version-key')).disposition,'REUSE_PREPARED');
});
test('P02 same-key and different-key parallel clicks reuse one pending intent and charge budget once',async()=>{
  const s=setup(),results=await Promise.all([prepare(s),prepare(s),prepare(s,'second-key')]);
  assert.equal(new Set(results.map(r=>r.paymentId)).size,1);assert.equal(Object.keys(s.db.payments).length,1);
  assert.equal(s.controls.numberCalls,1);assert.equal(s.db.budget.reservedTransactions,1);
  assert.equal(Object.keys(s.db.receipts).length,2);
});
test('P02 prepare response loss and service reconstruction recover same durable intent',async()=>{
  const s=setup();s.controls.loseResponse=true;
  await rejects(()=>prepare(s),'OFFLINE_RESPONSE_LOST');const id=payment(s)._id;
  const r=await prepare(s);assert.equal(r.paymentId,id);assert.equal(r.disposition,'REUSE_PREPARED');
  assert.equal(s.controls.numberCalls,1);assert.equal(s.db.budget.reservedTransactions,1);
});
test('P02 all three preparation writes throw/zero roll back intent, budget and receipt',async()=>{
  for(const kind of ['failAt','zeroAt'])for(let i=1;i<=3;i++){
    const s=setup(),before=s.clone(s.db);s.controls[kind]=i;
    await assert.rejects(()=>prepare(s));assert.deepEqual(s.db,before);
    s.controls[kind]=0;assert.equal((await prepare(s)).disposition,'CREATE_INTENT');
  }
});
test('P02 one-time durable dispatch claim; parallel claim and later retries only require query',async()=>{
  const s=setup();await prepare(s);const results=await Promise.all([claim(s),claim(s)]);
  assert.deepEqual(results.map(r=>r.disposition),['PREPAY_REQUEST_REQUIRED','QUERY_REQUIRED']);
  const r=results[0];assert.equal(r.paymentAllowed,false);assert.equal(r.internalDispatch.amountCents,16800);
  assert.equal(r.internalDispatch.outTradeNo,payment(s).outTradeNo);assert.equal(payment(s).dispatchState,'REQUESTED');
  assert.equal((await prepare(s)).disposition,'QUERY_REQUIRED');assert.equal((await prepare(s,'later-key')).disposition,'QUERY_REQUIRED');
  assert.equal(s.db.budget.reservedTransactions,1);assert.equal(s.controls.numberCalls,1);
});
test('P02 dispatch response loss, restart and unknown result never authorize a second send or new number',async()=>{
  const s=setup();await prepare(s);s.controls.loseResponse=true;
  await rejects(()=>claim(s),'OFFLINE_RESPONSE_LOST');const before=s.clone(payment(s));
  assert.equal((await claim(s)).disposition,'QUERY_REQUIRED');assert.deepEqual(payment(s),before);
  assert.equal((await prepare(s,'new-click')).disposition,'QUERY_REQUIRED');assert.equal(s.controls.numberCalls,1);
});
test('P02 dispatch write failure/zero rolls back claim, permitting safe first claim only',async()=>{
  for(const kind of ['failAt','zeroAt']){
    const s=setup();await prepare(s);const before=s.clone(s.db);s.controls[kind]=1;
    await assert.rejects(()=>claim(s));assert.deepEqual(s.db,before);
    s.controls[kind]=0;assert.equal((await claim(s)).disposition,'PREPAY_REQUEST_REQUIRED');
  }
});
test('P02 exact deadline and minimum window plus explicit dispatch margin never extend resources',async()=>{
  for(const delta of [0,61999]){
    const s=setup();s.db.orders.OFFLINE_ORDER.paymentDeadlineAt=s.controls.now+delta;
    s.db.held.reservations.forEach(r=>r.expiresAt=s.db.orders.OFFLINE_ORDER.paymentDeadlineAt);
    await rejects(()=>prepare(s),delta===0?'PAYMENT_DEADLINE_EXPIRED':'PAYMENT_WINDOW_TOO_SHORT');assert.deepEqual(s.db.payments,{});
  }
  const s=setup();s.db.orders.OFFLINE_ORDER.paymentDeadlineAt+=999;
  s.db.held.reservations.forEach(r=>r.expiresAt=s.db.orders.OFFLINE_ORDER.paymentDeadlineAt);
  await prepare(s);assert.ok(payment(s).expiresAt<=s.db.orders.OFFLINE_ORDER.paymentDeadlineAt);
  assert.equal(payment(s).expiresAt%1000,0);
});
test('P02 time consumed before dispatch commit rolls claim back and keeps original deadline',async()=>{
  const s=setup();await prepare(s);const before=s.clone(s.db);
  s.controls.nowSequence=[s.controls.now,payment(s).expiresAt-61000];
  await rejects(()=>claim(s),'PAYMENT_WINDOW_TOO_SHORT');assert.deepEqual(s.db,before);
});
test('P02 existing requested payment remains queryable past deadline and controlled authorization expiry',async()=>{
  const s=setup();await prepare(s);await claim(s);s.controls.now=s.config.profile.controlledTest.expiresAt;
  assert.equal((await prepare(s)).disposition,'QUERY_REQUIRED');assert.equal((await claim(s)).disposition,'QUERY_REQUIRED');
  assert.equal(Object.keys(s.db.payments).length,1);assert.equal(s.db.budget.reservedTransactions,1);
});
test('P02 absent cloud/config, expired real-test grant and changed original configuration never dispatch',async()=>{
  const s=setup();s.db.manifest.profiles.test=null;await rejects(()=>prepare(s),'PAYMENT_NOT_CONFIGURED');
  const x=setup();x.db.manifest.profiles.test.controlledTest.expiresAt=x.controls.now+60000;
  x.db.budget.authorizationFingerprint=require('../cloudfunctions/_shared/idempotency-model').requestFingerprint(x.db.manifest.profiles.test.controlledTest);
  await prepare(x);x.controls.now+=60000;
  await rejects(()=>claim(x),'REAL_PAYMENT_AUTHORIZATION_EXPIRED');assert.equal(payment(x).dispatchState,'PREPARED');
  const y=setup();await prepare(y);y.db.manifest.profiles.test.version='OTHER';y.db.manifest.profiles.test.controlledTest.profileVersion='OTHER';
  assert.equal((await prepare(y)).disposition,'PAYMENT_COORDINATION_REQUIRED');
  await rejects(()=>claim(y),'PAYMENT_CONFIGURATION_CHANGED');
});
test('P02 real-test budget rejects amount/count exhaustion and corrupt grant binding without writes',async()=>{
  for(const patch of [{reservedAmountCents:90000},{usedTransactions:4},{authorizationFingerprint:'0'.repeat(64)},null]){
    const s=setup();if(patch)Object.assign(s.db.budget,patch);else s.db.budget=null;
    const before=s.clone(s.db);await assert.rejects(()=>prepare(s));assert.deepEqual(s.db,before);
  }
});
test('P02 dispatch requires this intent original budget reservation and grant fingerprint',async()=>{
  for(const field of ['controlledBudgetId','authorizationFingerprint']){
    const s=setup();await prepare(s);payment(s)[field]='OTHER';const before=s.clone(s.db);
    await rejects(()=>claim(s),'INVALID_CONTROLLED_PAYMENT_BUDGET');assert.deepEqual(s.db,before);
  }
});
test('P02 invalid/colliding merchant numbers fail without orphan budget or second intent',async()=>{
  const s=setup();s.controls.fixedNumber='V1-'+ 'A'.repeat(64);
  await rejects(()=>prepare(s),'INVALID_MERCHANT_ORDER_NUMBER');assert.equal(s.db.budget.reservedTransactions,0);
  const x=setup();x.controls.fixedNumber='OFFLINE_EXISTING_NUMBER';
  x.db.payments.other={_id:'other',orderId:'OTHER_ORDER',merchantId:x.config.profile.merchantId,outTradeNo:x.controls.fixedNumber};
  await rejects(()=>prepare(x),'MERCHANT_ORDER_NUMBER_COLLISION');assert.equal(x.db.budget.reservedTransactions,0);
});
test('P02 corrupt/duplicate pending facts and missing/mismatched HELD evidence reject',async()=>{
  for(const field of ['amountCents','ownerId','appId','dispatchState','expiresAt']){
    const s=setup();await prepare(s);payment(s)[field]=field==='amountCents'?1:field==='expiresAt'?s.controls.now+9999999:'OTHER';
    await assert.rejects(()=>prepare(s));
  }
  const s=setup();await prepare(s);s.db.payments.copy={...s.clone(payment(s)),_id:'duplicate'};
  await rejects(()=>prepare(s),'INVALID_PAYMENT_STATE');
  for(const mutate of [s=>s.db.held.reservations.pop(),s=>s.db.held.quote.facts.fulfillment='DELIVERY',
    s=>s.db.held.resources[0].resource.heldUnits=0]){
    const x=setup();mutate(x);await assert.rejects(()=>prepare(x));assert.deepEqual(x.db.payments,{});
  }
});
test('P02 read-set fences protect revocation, order/cancellation, resource and configuration races',async()=>{
  for(const mutate of [s=>{s.controls.denyFence=true;},
    s=>{s.controls.beforeCommit=db=>{db.users[s.principal.subjectId].status='DISABLED';};},
    s=>{s.controls.beforeCommit=db=>{db.orders.OFFLINE_ORDER.version++;};},
    s=>{s.controls.beforeCommit=db=>{db.held.resources[0].resource.version++;};},
    s=>{s.controls.beforeCommit=db=>{db.manifest.profiles.test.version='OTHER';};}]){
    const s=setup();mutate(s);await rejects(()=>prepare(s),'VERSION_CONFLICT');assert.deepEqual(s.db.payments,{});
    assert.equal(s.db.budget.reservedTransactions,0);
  }
});
test('P02 unresolved intent prevents O05 no-payment cancellation and resource release',async()=>{
  const s=setup();await prepare(s);
  const plan=planUnpaidCancellation(s.db.orders.OFFLINE_ORDER,Object.values(s.db.payments),
    {type:'CUSTOMER',subjectId:s.principal.subjectId},{now:s.controls.now,appId:s.principal.appId,reason:'隔离取消',expectedVersion:0});
  assert.equal(plan.disposition,'PAYMENT_COORDINATION_REQUIRED');assert.equal(plan.patch,null);
  assert.equal(plan.requiredPaymentEffects[0].action,'QUERY_THEN_CLOSE_IF_UNPAID');
});
test('P02 production preparation retains release/actual-provider gates, without test-budget defaults',async()=>{
  const s=setup({stage:'production'});await prepare(s);const r=await claim(s);
  assert.equal(s.db.budget,null);assert.equal(r.paymentAllowed,false);
  assert.ok(r.internalDispatch.requiredServerChecks.includes('PRODUCTION_RELEASE_GATE'));
  assert.ok(r.internalDispatch.requiredServerChecks.includes('ACTUAL_APPID_MERCHANT_ASSOCIATION'));
});

test('P02 authorization expiry at prepare commit rolls all reservation writes back',async()=>{
  const s=setup(),before=s.clone(s.db);
  s.controls.nowSequence=[s.controls.now,s.config.profile.controlledTest.expiresAt];
  await rejects(()=>prepare(s),'REAL_PAYMENT_AUTHORIZATION_EXPIRED');assert.deepEqual(s.db,before);
});

test('P02 unknown external state remains pending even if a caller supplies client success data',async()=>{
  const s=setup();await prepare(s);await claim(s);payment(s).dispatchState='UNKNOWN';
  const result=await prepare(s);assert.equal(result.disposition,'QUERY_REQUIRED');assert.equal(result.payInvocation,null);
  const event=s.event('caller-success');event.payload.success=true;
  await rejects(()=>s.service().prepare(event,s.principal),'INVALID_REQUEST');
  assert.equal(s.db.orders.OFFLINE_ORDER.paymentStatus,'UNPAID');assert.equal(payment(s).status,'PENDING');
});

test('P02 different orders compete for one durable real-test budget transaction',async()=>{
  const s=setup(),{requestFingerprint}=require('../cloudfunctions/_shared/idempotency-model');
  s.db.manifest.profiles.test.controlledTest.maxTransactions=1;
  s.db.budget.authorizationFingerprint=requestFingerprint(s.db.manifest.profiles.test.controlledTest);
  const other=s.additionalOrder('OFFLINE_SECOND_ORDER');
  const results=await Promise.allSettled([prepare(s),s.service().prepare(other,s.principal)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.find(r=>r.status==='rejected').reason.code,'CONTROLLED_PAYMENT_BUDGET_EXCEEDED');
  assert.equal(Object.keys(s.db.payments).length,1);assert.equal(Object.keys(s.db.receipts).length,1);
  assert.equal(s.db.budget.reservedTransactions,1);assert.equal(s.db.budget.reservedAmountCents,16800);
});

test('P02 prepared intent past its deadline only requests query and never creates another intent',async()=>{
  const s=setup();await prepare(s);s.controls.now=payment(s).expiresAt;
  assert.equal((await prepare(s,'expired-click-key')).disposition,'QUERY_REQUIRED');
  await rejects(()=>claim(s),'PAYMENT_DEADLINE_EXPIRED');assert.equal(Object.keys(s.db.payments).length,1);
});

test('P02 closed/exception summaries require P04 coordination before any replacement intent',async()=>{
  for(const status of ['CLOSED','EXCEPTION']){
    const s=setup();await prepare(s);s.db.orders.OFFLINE_ORDER.paymentStatus=status;
    assert.equal((await prepare(s,'new-after-summary')).disposition,'PAYMENT_COORDINATION_REQUIRED');
    assert.equal(s.controls.numberCalls,1);assert.equal(s.db.budget.reservedTransactions,1);
    await rejects(()=>claim(s),'INVALID_TRANSITION');
  }
});

test('P02 external 15-day limit floors expiry without changing the longer original order deadline',async()=>{
  const s=setup(),deadline=s.controls.now+20*24*60*60*1000+999;
  s.db.orders.OFFLINE_ORDER.paymentDeadlineAt=deadline;s.db.held.reservations.forEach(r=>r.expiresAt=deadline);
  await prepare(s);assert.equal(payment(s).expiresAt,s.controls.now+15*24*60*60*1000);
  assert.equal(s.db.orders.OFFLINE_ORDER.paymentDeadlineAt,deadline);
});

test('P02 corrupt over-limit current budget blocks dispatch without modifying prior reservation',async()=>{
  const s=setup();await prepare(s);s.db.budget.usedTransactions=99;const before=s.clone(s.db);
  await rejects(()=>claim(s),'INVALID_CONTROLLED_PAYMENT_BUDGET');assert.deepEqual(s.db,before);
});

test('P02 dispatch validates every payment row, including malformed closed history',async()=>{
  const s=setup();await prepare(s);const active=payment(s);
  s.db.payments.old={...s.clone(active),_id:'old-closed',status:'CLOSED',outTradeNo:'OLD_CLOSED_PAYMENT',
    closedAt:s.controls.now,lastEventId:'closed-event',amountCents:1};
  const before=s.clone(s.db);await rejects(()=>claim(s),'INVALID_PAYMENT_STATE');assert.deepEqual(s.db,before);
});
