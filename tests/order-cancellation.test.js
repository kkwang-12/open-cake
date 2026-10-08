'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {setup}=require('./fixtures/order-transaction');
const {planCancelledResources,planPaidCancellationCoordination}=require('../cloudfunctions/_shared/order-cancellation-model');
const {createOrderCancellationService}=require('../cloudfunctions/_shared/order-cancellation-service');
async function created(mode='PICKUP',quantity=2) {
  const s=setup(),q=s.makeQuote({mode,quantity}),result=await s.service.execute(q.event,q.customer);
  return {...s,q,order:s.db.orders[result.result.entityId]};
}
const event=(s,key='offline-cancel-key-0001')=>({action:'cancelUnpaid',payload:{orderId:s.order._id,
  expectedVersion:s.order.version,reason:'private reason',idempotencyKey:key}});
const cancel=s=>s.cancellationService.cancelUnpaid(event(s),s.q.customer);
const rejects=(fn,code)=>assert.rejects(async()=>fn(),error=>error.code===code);
function payment(s,status='PENDING',id='payment-test') {
  const now=s.controls.now;
  return {_id:id,schemaVersion:1,version:0,createdAt:s.order.createdAt,updatedAt:now,
    orderId:s.order._id,ownerId:s.order.ownerId,appId:s.q.customer.appId,provider:'OFFLINE_TEST_ONLY',
    merchantId:'offline-merchant',outTradeNo:id,currency:'CNY',amountCents:s.order.totalCents,
    status,accountingState:status==='PAID' ? 'APPLIED':'UNAPPLIED',expiresAt:s.order.paymentDeadlineAt,
    confirmedAt:status==='PAID' ? now:null,transactionId:status==='PAID' ? 'offline-transaction':null,
    closedAt:status==='CLOSED' ? now:null,lastEventId:status==='CLOSED' ? 'offline-closed-evidence':null};
}
const cancellationReceipts=s=>Object.values(s.db.receipts).filter(value=>['order.cancelUnpaid','order.expire'].includes(value.command));
function resourceState(s) {
  const reservations=Object.values(s.db.reservations).filter(value=>value.orderId===s.order._id);
  return {order:s.order,expectedResources:s.db.quotes[s.order.quoteId].resourceVersions,reservations,
    resources:reservations.map(value=>({resourceKind:value.resourceKind,
      resource:(value.resourceKind==='STOCK' ? s.db.stocks:s.db.slots)[value.resourceId]}))};
}
function paid(s,status='PAID') {
  Object.assign(s.order,{orderStatus:status,paymentStatus:'PAID',paidCents:s.order.totalCents,paidAt:s.controls.now});
  for (const reservation of Object.values(s.db.reservations)) {
    const resource=(reservation.resourceKind==='STOCK' ? s.db.stocks:s.db.slots)[reservation.resourceId];
    resource.heldUnits-=reservation.quantity;
    if (['MAKING','READY','DELIVERING'].includes(status) && reservation.resourceKind==='STOCK') {
      resource.consumedUnits+=reservation.quantity;
      Object.assign(reservation,{status:'CONSUMED',resolvedAt:s.controls.now,resolutionLogId:'offline-making-log'});
    } else {resource.confirmedUnits+=reservation.quantity;reservation.status='CONFIRMED';}
  }
}

test('O05 unpaid pickup/delivery cancellation releases only owned stock/slot, seals log and receipt atomically',async()=>{
  for (const mode of ['PICKUP','DELIVERY']) {
    const s=await created(mode),bagBefore=JSON.stringify(s.db.carts),quoteBefore=JSON.stringify(s.db.quotes);
    const result=await cancel(s),order=s.db.orders[s.order._id];
    assert.equal(result.disposition,'CANCELLED');assert.equal(result.cloudVerified,false);
    assert.equal(order.orderStatus,'CANCELLED');assert.equal(order.paymentStatus,'UNPAID');assert.equal(order.version,1);
    assert.equal(order.cancellationReason,'隔离测试脱敏原因');assert.equal(order.cancelledAt,s.controls.now);
    assert.equal(s.db.stocks[s.stockId].heldUnits,0);
    const reservations=Object.values(s.db.reservations);assert(reservations.every(value=>value.status==='RELEASED'));
    const log=Object.values(s.db.logs).find(value=>value.command==='CANCEL_UNPAID');
    assert.equal(log.before.orderStatus,'PENDING_PAYMENT');assert.equal(log.after.orderStatus,'CANCELLED');
    assert.equal(log.after.version,1);assert(reservations.every(value=>value.resolutionLogId===log._id));
    assert.equal(cancellationReceipts(s).length,1);assert.equal(s.controls.lastWrites,7);
    assert.equal(JSON.stringify(s.db.carts),bagBefore);assert.equal(JSON.stringify(s.db.quotes),quoteBefore);
    assert.equal(Object.keys(s.db.items).length,1);assert(!JSON.stringify(log).includes('private reason'));
  }
});

test('O05 same request and lost committed response replay original cancellation without repeated release',async()=>{
  const s=await created(),request=event(s),first=await cancel(s),before=JSON.stringify(s.db);
  const rebuilt=createOrderCancellationService({runTransaction:s.runTransaction,now:()=>s.controls.now,
    newRequestId:()=> 'offline-rebuilt-trace',redactReason:()=> '隔离测试脱敏原因',
    appId:s.q.customer.appId,environment:s.q.customer.environment});
  const replay=await rebuilt.cancelUnpaid(request,s.q.customer);
  assert.equal(replay.disposition,'REPLAY');assert.deepEqual(replay.result,first.result);assert.equal(JSON.stringify(s.db),before);
  await rejects(()=>s.cancellationService.cancelUnpaid({...request,payload:{...request.payload,reason:'different'}},s.q.customer),'IDEMPOTENCY_KEY_REUSED');
  await rejects(()=>s.cancellationService.cancelUnpaid({...request,payload:{...request.payload,expectedVersion:1,
    idempotencyKey:'another-cancel-key'}},s.q.customer),'INVALID_TRANSITION');
  assert.equal(JSON.stringify(s.db),before);
});

test('O05 all seven write failures and zero-row results roll back cancellation/resources/log/receipt',async()=>{
  for (const mode of ['failAt','zeroAt']) for (let i=1;i<=7;i++) {
    const s=await created(),before=JSON.stringify(s.db);s.controls[mode]=i;
    if (mode==='failAt') await assert.rejects(()=>cancel(s),/OFFLINE injected write failure/);
    else await rejects(()=>cancel(s),'VERSION_CONFLICT');
    assert.equal(JSON.stringify(s.db),before);s.controls[mode]=0;
    await cancel(s);assert.equal(s.db.stocks[s.stockId].heldUnits,0);assert.equal(cancellationReceipts(s).length,1);
  }
});

test('O05 unresolved/intended payments never cancel, release or mark idempotency as complete',async()=>{
  for (const [orderStatus,paymentStatuses] of [['UNPAID',['PENDING']],['PENDING',['PENDING']],
    ['EXCEPTION',['EXCEPTION']],['PENDING',['CLOSED']],['CLOSED',['CLOSED','PENDING']],['PENDING',['PAID']],['PENDING',[]]]) {
    const s=await created();s.order.paymentStatus=orderStatus;
    paymentStatuses.forEach((status,index)=>s.db.payments['p'+index]=payment(s,status,'p'+index));
    const before=JSON.stringify(s.db),result=await cancel(s);
    assert.equal(result.disposition,'PAYMENT_COORDINATION_REQUIRED');assert.equal(result.result,null);
    assert.equal(result.requiresOrderPaymentReconciliation,true);assert.equal(JSON.stringify(s.db),before);
    assert.equal(cancellationReceipts(s).length,0);assert.equal(s.db.stocks[s.stockId].heldUnits,2);
  }
});

test('O05 pending cancellation resumes only after trustworthy close reconciliation and current version confirmation',async()=>{
  const s=await created();s.order.paymentStatus='PENDING';s.db.payments.p=payment(s);
  assert.equal((await cancel(s)).disposition,'PAYMENT_COORDINATION_REQUIRED');
  s.db.payments.p=payment(s,'CLOSED');
  Object.assign(s.db.orders[s.order._id],{paymentStatus:'CLOSED',version:1});
  await rejects(()=>cancel(s),'VERSION_CONFLICT');
  s.order=s.db.orders[s.order._id];
  assert.equal((await cancel(s)).disposition,'CANCELLED');assert.equal(s.db.orders[s.order._id].paymentStatus,'CLOSED');
  assert.equal(s.db.stocks[s.stockId].heldUnits,0);
});

test('O05 closed summary without evidence, malformed/foreign/amount/app payment records fail closed',async()=>{
  for (const mutate of [s=>delete s.db.payments.p,s=>s.db.payments.p.closedAt=null,
    s=>s.db.payments.p.lastEventId=null,s=>s.db.payments.p.ownerId='foreign',
    s=>s.db.payments.p.amountCents++,s=>s.db.payments.p.appId='foreign',
    s=>s.db.payments.p.accountingState='QUARANTINED',s=>s.db.payments.p.closedAt=s.controls.now+1]) {
    const s=await created();s.order.paymentStatus='CLOSED';s.db.payments.p=payment(s,'CLOSED');mutate(s);
    const before=JSON.stringify(s.db);
    if (Object.keys(s.db.payments).length===0) assert.equal((await cancel(s)).disposition,'PAYMENT_COORDINATION_REQUIRED');
    else await rejects(()=>cancel(s),'INVALID_PAYMENT_STATE');
    assert.equal(JSON.stringify(s.db),before);
  }
});

test('O05 expiry requires trusted invocation and exact due boundary; duplicate job releases only once',async()=>{
  const s=await created();await rejects(()=>s.cancellationService.expire(s.order._id,{...s.expiryInvocation}),'FORBIDDEN');
  const original=JSON.stringify(s.db);
  s.controls.now=s.order.paymentDeadlineAt-1;
  assert.equal((await s.cancellationService.expire(s.order._id,s.expiryInvocation)).disposition,'SKIPPED');
  assert.equal(JSON.stringify(s.db),original);s.controls.now++;
  const result=await s.cancellationService.expire(s.order._id,s.expiryInvocation);assert.equal(result.disposition,'CANCELLED');
  const before=JSON.stringify(s.db);assert.equal((await s.cancellationService.expire(s.order._id,s.expiryInvocation)).disposition,'REPLAY');
  assert.equal(JSON.stringify(s.db),before);
  const log=Object.values(s.db.logs).find(value=>value.command==='CANCEL_UNPAID');
  assert.deepEqual(log.actor,{type:'SYSTEM',subjectId:null,service:'order-expiry'});
});

test('O05 expired unknown payments retain reservations; paid/fulfilled orders are skipped by expiry',async()=>{
  const s=await created();s.controls.now=s.order.paymentDeadlineAt;s.order.paymentStatus='EXCEPTION';s.db.payments.p=payment(s,'EXCEPTION');
  const before=JSON.stringify(s.db);assert.equal((await s.cancellationService.expire(s.order._id,s.expiryInvocation)).disposition,'PAYMENT_COORDINATION_REQUIRED');
  assert.equal(JSON.stringify(s.db),before);
  for (const status of ['PAID','MAKING','READY']) {
    const p=await created();paid(p,status);p.controls.now=p.order.paymentDeadlineAt;
    const baseline=JSON.stringify(p.db);assert.equal((await p.cancellationService.expire(p.order._id,p.expiryInvocation)).disposition,'SKIPPED');
    assert.equal(JSON.stringify(p.db),baseline);
  }
});

test('O05 simultaneous customer cancellation and expiry release one set with one final log',async()=>{
  const s=await created();s.controls.now=s.order.paymentDeadlineAt;
  const results=await Promise.all([cancel(s),s.cancellationService.expire(s.order._id,s.expiryInvocation)]);
  assert.deepEqual(results.map(value=>value.disposition),['CANCELLED','SKIPPED']);
  assert.equal(s.db.stocks[s.stockId].heldUnits,0);assert.equal(Object.values(s.db.logs).filter(value=>value.command==='CANCEL_UNPAID').length,1);
});

test('O05 shared stock/slot release preserves other orders and works after resource sale is closed',async()=>{
  const s=await created(),other=s.makeQuote({customer:s.actor('B'),quantity:3});
  const second=await s.service.execute(other.event,other.customer);s.db.stocks[s.stockId].status='CLOSED';
  await cancel(s);assert.equal(s.db.stocks[s.stockId].heldUnits,3);assert.equal(s.db.stocks[s.stockId].status,'CLOSED');
  assert.equal(s.db.orders[second.result.entityId].orderStatus,'PENDING_PAYMENT');
  assert.equal(Object.values(s.db.slots).find(value=>value.fulfillment==='PICKUP').heldUnits,1);
  assert.equal(Object.values(s.db.slots).find(value=>value.fulfillment==='DELIVERY').heldUnits,0);
});

test('O05 multiple stock units release as one transaction and any of nine write failures preserves all holds',async()=>{
  for (let failure=0;failure<=9;failure++) {
    const s=setup(),second='offline-stock-2';s.db.stocks[second]={...s.db.stocks[s.stockId],_id:second};
    s.db.catalogs[0].skus[0].stockRequirements=[{resourceId:s.stockId,unitsPerItem:2},{resourceId:second,unitsPerItem:3}];
    const q=s.makeQuote({quantity:2}),result=await s.service.execute(q.event,q.customer);
    s.q=q;s.order=s.db.orders[result.result.entityId];
    const before=JSON.stringify(s.db);s.controls.failAt=failure;
    if (failure) {
      await assert.rejects(()=>cancel(s),/OFFLINE injected write failure/);assert.equal(JSON.stringify(s.db),before);
      s.controls.failAt=0;
    }
    await cancel(s);assert.equal(s.db.stocks[s.stockId].heldUnits,0);assert.equal(s.db.stocks[second].heldUnits,0);
    assert.equal(s.controls.lastWrites,9);assert(Object.values(s.db.reservations).every(value=>value.status==='RELEASED'));
  }
});

test('O05 missing/foreign/resolved reservations, wrong slot, underflow and overflow cannot partly release',async()=>{
  for (const [mutate,code] of [
    [s=>delete s.db.reservations[Object.keys(s.db.reservations)[0]],'INVALID_RESERVATION_PLAN'],
    [s=>Object.values(s.db.reservations)[0].orderId='foreign','INVALID_RESERVATION_PLAN'],
    [s=>Object.values(s.db.reservations)[0].quantity++,'INVALID_RESERVATION_PLAN'],
    [s=>Object.values(s.db.reservations)[0].status='RELEASED','INVALID_RESERVATION_PLAN'],
    [s=>s.db.stocks[s.stockId].heldUnits=1,'INVALID_RESOURCE'],
    [s=>s.db.stocks[s.stockId].version=Number.MAX_SAFE_INTEGER,'INVALID_RESOURCE'],
    [s=>s.order.appointmentSnapshot.slotId='foreign-slot','INVALID_RESERVATION_PLAN']]) {
    const s=await created();mutate(s);const before=JSON.stringify(s.db);
    await rejects(()=>cancel(s),code);assert.equal(JSON.stringify(s.db),before);
  }
});

test('O05 forged identity/other owner/stale version/extra funds fields and user expiry actions are rejected',async()=>{
  const s=await created(),before=JSON.stringify(s.db);
  await rejects(()=>s.cancellationService.cancelUnpaid(event(s),{...s.q.customer}),'AUTH_REQUIRED');
  const other=s.makeQuote({customer:s.actor('B')});const baseline=JSON.stringify(s.db);
  await rejects(()=>s.cancellationService.cancelUnpaid(event(s),other.customer),'FORBIDDEN');
  await rejects(()=>s.cancellationService.cancelUnpaid({...event(s),payload:{...event(s).payload,expectedVersion:9}},s.q.customer),'VERSION_CONFLICT');
  await rejects(()=>s.cancellationService.cancelUnpaid({...event(s),payload:{...event(s).payload,paidCents:0}},s.q.customer),'INVALID_REQUEST');
  await rejects(()=>s.cancellationService.cancelUnpaid({action:'expire',payload:event(s).payload},s.q.customer),'INVALID_REQUEST');
  assert.equal(JSON.stringify(s.db),baseline);assert(before.includes(s.order._id));
});

test('O05 payment creation/accounting or user revocation during commit rolls back release for later reconciliation',async()=>{
  for (const mutate of [s=>{s.db.payments.p=payment(s);s.order.paymentStatus='PENDING';s.order.version++;},
    s=>{s.db.users[s.q.customer.subjectId].status='DISABLED';s.db.users[s.q.customer.subjectId].version++;}]) {
    const s=await created();s.controls.beforeCommit=()=>mutate(s);
    await rejects(()=>cancel(s),'VERSION_CONFLICT');
    assert.equal(s.db.stocks[s.stockId].heldUnits,2);assert(Object.values(s.db.reservations).every(value=>value.status==='HELD'));
    assert.equal(cancellationReceipts(s).length,0);assert.equal(Object.keys(s.db.logs).length,1);
    s.controls.beforeCommit=null;
    if (s.order.paymentStatus==='PENDING') assert.equal((await cancel(s)).disposition,'PAYMENT_COORDINATION_REQUIRED');
    else await rejects(()=>cancel(s),'USER_DISABLED');
  }
});

test('O05 read fence and unsupported historical policy fail without mutation',async()=>{
  for (const [mutate,code] of [[s=>s.controls.denyFence=true,'VERSION_CONFLICT'],
    [s=>s.order.tradePolicyVersion='unknown-policy','POLICY_VERSION_UNSUPPORTED']]) {
    const s=await created();mutate(s);const before=JSON.stringify(s.db);await rejects(()=>cancel(s),code);
    assert.equal(JSON.stringify(s.db),before);
  }
});

test('O05 payment confirmation winning commit race keeps paid order and confirmed reservations',async()=>{
  const s=await created();
  // OFFLINE_TEST_ONLY: simulate the atomic order/resource outcome of a payment worker.
  s.controls.beforeCommit=()=>{paid(s);s.order.version++;};
  await rejects(()=>cancel(s),'VERSION_CONFLICT');s.controls.beforeCommit=null;
  assert.equal(s.db.orders[s.order._id].orderStatus,'PAID');assert.equal(s.db.orders[s.order._id].cancelledAt,null);
  assert.equal(s.db.stocks[s.stockId].heldUnits,0);assert.equal(s.db.stocks[s.stockId].confirmedUnits,2);
  assert(Object.values(s.db.reservations).every(value=>value.status==='CONFIRMED'));
  assert.equal(cancellationReceipts(s).length,0);assert.equal(Object.keys(s.db.logs).length,1);
  await rejects(()=>cancel(s),'INVALID_TRANSITION');
  s.controls.now=s.order.paymentDeadlineAt;
  assert.equal((await s.cancellationService.expire(s.order._id,s.expiryInvocation)).disposition,'SKIPPED');
});

function paidPlan(s,action,extra={},domain='admin',policy=null) {
  const merchant=s.actor('merchant'),role={_id:'offline-role',schemaVersion:1,version:0,status:'ACTIVE',revokedAt:null,
    subjectId:merchant.subjectId,storeIds:[s.storeId],capabilities:['ORDER_OPERATE','REFUND_APPROVE']};
  const context={now:s.controls.now,requestId:'offline-paid-trace',redactReason:()=> '脱敏原因',afterMakingSlotPolicy:policy,
    review:{id:'review-test',version:0,orderId:s.order._id,ownerId:s.order.ownerId,status:'PENDING'}};
  return planPaidCancellationCoordination(domain,{action,payload:{orderId:s.order._id,expectedVersion:s.order.version,
    idempotencyKey:'offline-paid-cancel-key',reason:'private',...extra}},resourceState(s),domain==='order' ? s.q.customer:merchant,[role],context);
}

test('O05 paid customer request retains fulfillment/resources; merchant rejection proposes remaining full refund',async()=>{
  const s=await created();paid(s);s.order.refundStatus='SUCCEEDED';s.order.refundedCents=500;
  const before=JSON.stringify(s.db),request=paidPlan(s,'cancellation.request',{},'order');
  assert.equal(request.commandPlan.patch.orderStatus,'PAID');assert.equal(request.resourceResolution,null);
  assert(request.commandPlan.requiredAtomicEffects.includes('CREATE_CANCELLATION_REVIEW'));
  const rejection=paidPlan(s,'order.transition',{command:'REJECT_ORDER'});
  assert.equal(rejection.commandPlan.effectInput.refundCents,s.order.totalCents-500);assert.equal(rejection.requiresFundsExecutor,true);
  assert.equal(rejection.resourceResolution.resourceChanges.length,2);assert.equal(JSON.stringify(s.db),before);
});

test('O05 after-making approval never restores consumed stock; slot release requires explicit policy',async()=>{
  const s=await created();paid(s,'MAKING');const before=JSON.stringify(s.db);
  const args={reviewId:'review-test',decision:'APPROVE',refundCents:800};
  assert.throws(()=>paidPlan(s,'cancellation.review',args),error=>error.code==='CONFIGURATION_REQUIRED');
  const retained=paidPlan(s,'cancellation.review',args,'admin','RETAIN');
  assert.equal(retained.resourceResolution.resourceChanges.length,0);assert.equal(retained.requiresFundsExecutor,true);
  const released=paidPlan(s,'cancellation.review',args,'admin','RELEASE_UNCONSUMED');
  assert.equal(released.resourceResolution.resourceChanges.length,1);assert.equal(released.resourceResolution.resourceChanges[0].resourceKind,'SLOT');
  assert.equal(s.db.stocks[s.stockId].consumedUnits,2);assert.equal(JSON.stringify(s.db),before);
  s.db.stocks[s.stockId].consumedUnits=1;
  assert.throws(()=>paidPlan(s,'cancellation.review',args,'admin','RETAIN'),error=>error.code==='INVALID_RESOURCE');
});

test('O05 zero refund approval creates no refund intent; denied request leaves all resources intact',async()=>{
  const s=await created();paid(s,'ACCEPTED');const before=JSON.stringify(s.db);
  const approved=paidPlan(s,'cancellation.review',{reviewId:'review-test',decision:'APPROVE',refundCents:0});
  assert.equal(approved.requiresFundsExecutor,false);assert(!approved.commandPlan.requiredAtomicEffects.includes('CREATE_REFUND_INTENT'));
  assert.equal(approved.resourceResolution.resourceChanges.length,2);
  const denied=paidPlan(s,'cancellation.review',{reviewId:'review-test',decision:'REJECT'});
  assert.equal(denied.resourceResolution,null);assert.equal(denied.commandPlan.patch.orderStatus,'ACCEPTED');
  assert.equal(JSON.stringify(s.db),before);
});

test('O05 pure resource resolution is immutable and already released cancellation never decrements again',async()=>{
  const s=await created();await cancel(s);s.order=s.db.orders[s.order._id];
  const state=resourceState(s),before=JSON.stringify(s.db);
  const plan=planCancelledResources(s.order,state.expectedResources,state.reservations,state.resources,
    {now:s.controls.now,environment:s.q.customer.environment,logId:'test-replay-log'});
  assert.equal(plan.resourceChanges.length,0);assert.equal(plan.reservationChanges.length,0);
  assert(Object.isFrozen(plan.retainedReservationIds));assert.equal(JSON.stringify(s.db),before);
});
