'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {setup,clone}=require('./fixtures/merchant-resolution');
const {createMerchantResolutionService}=require('../cloudfunctions/_shared/merchant-resolution-service');
const {parseApiRequest,ACTION_CONTRACTS}=require('../cloudfunctions/_shared/api-contract');
const {scopedDocumentId,requestFingerprint}=require('../cloudfunctions/_shared/idempotency-model');
const {claimJob}=require('../cloudfunctions/_shared/payment-maintenance-model');
const state=s=>JSON.stringify(s.db),order=s=>s.db.orders[s.orderId],rejects=(fn,code)=>assert.rejects(fn,error=>error.code===code);
const writes=s=>JSON.stringify({orders:s.db.orders,items:s.db.items,resources:s.db.stocks,slots:s.db.slots,reservations:s.db.reservations,payments:s.db.payments});
async function approved(s,amount=100){return s.execute('refund.approve',{refundCents:amount});}
async function grant(s,capabilities,openId='offline-a06-limited'){
  const principal=s.actor(openId);s.db.users[principal.subjectId]={_id:principal.subjectId,environment:principal.environment,appId:principal.appId,
    openId,schemaVersion:1,version:principal.userVersion,status:'ACTIVE'};
  const result=await s.adminService.execute({action:'role.grant',payload:{subjectId:principal.subjectId,storeIds:[s.storeId],capabilities,
    reason:'隔离测试范围',idempotencyKey:'OFFLINE_A06_GRANT_'+openId}},s.primary);return {principal,roleId:result.result.entityId};
}
test('A06 persists an actual customer pending request, log, audit and receipt without cancellation or fund/resource changes',async()=>{
  const s=await setup(),before=clone(order(s)),resources=clone(s.db.reservations),result=await s.request(),request=s.db.cancellations[result.reviewId];
  assert.equal(result.disposition,'CANCELLATION_REQUESTED');assert.equal(order(s).version,before.version+1);assert.equal(order(s).orderStatus,'PAID');
  assert.equal(request.status,'PENDING');assert.equal(request.version,0);assert.equal(request.ownerId,s.owner.subjectId);assert.equal(s.controls.lastWrites,5);
  assert.deepEqual(s.db.reservations,resources);assert.equal(Object.keys(s.db.refunds).length,0);assert.ok(!JSON.stringify(request).includes('13800138000'));
  assert.equal((await s.readService.execute(s.readEvent(),s.primary)).cancellationSummary.status,'PENDING');
});
test('A06 request key replays after service reconstruction and even later review; a second pending request is refused',async()=>{
  const s=await setup(),event=s.event('cancellation.request');await s.resolutionService.requestCancellation(event,s.owner);const before=state(s);
  assert.equal((await createMerchantResolutionService(s.options).requestCancellation(event,s.owner)).disposition,'REPLAY');assert.equal(state(s),before);
  await rejects(()=>s.request({idempotencyKey:'OFFLINE_SECOND_REQUEST_KEY'}),'CANCELLATION_PENDING');
  const review=s.event('cancellation.review');review.payload.decision='REJECT';delete review.payload.refundCents;await s.resolutionService.execute(review,s.primary);
  assert.equal((await s.resolutionService.requestCancellation(event,s.owner)).disposition,'REPLAY');
});
test('A06 rejects cancellation explicitly without releasing resources or reserving money, then permits a fresh request',async()=>{
  const s=await setup();await s.request();const stock=clone(s.db.stocks),slot=clone(s.db.slots),event=s.event('cancellation.review');
  event.payload.decision='REJECT';delete event.payload.refundCents;const result=await s.resolutionService.execute(event,s.primary);
  const request=s.db.cancellations[result.reviewId];assert.equal(request.status,'REJECTED');assert.equal(request.reviewReason,'门店受权处理');
  assert.equal(request.approvedRefundCents,null);assert.equal(request.reviewerId,s.primary.subjectId);assert.equal(order(s).orderStatus,'PAID');
  assert.deepEqual(s.db.stocks,stock);assert.deepEqual(s.db.slots,slot);assert.equal(Object.keys(s.db.refunds).length,0);
  await s.request({idempotencyKey:'OFFLINE_NEW_REQUEST_KEY'});assert.equal(Object.values(s.db.cancellations).filter(row=>row.status==='PENDING').length,1);
});
test('A06 approved cancellation atomically releases confirmed resources, records review, reserves a partial refund and replays',async()=>{
  const s=await setup();await s.request();const event=s.event('cancellation.review'),result=await s.resolutionService.execute(event,s.primary),refund=s.db.refunds[result.refundIntentId];
  assert.equal(order(s).orderStatus,'CANCELLED');assert.equal(order(s).refundStatus,'PENDING');assert.equal(order(s).refundedCents,0);assert.equal(order(s).refundReservedCents,100);
  assert.equal(refund.status,'PENDING');assert.equal(refund.budgetState,'RESERVED');assert.equal(refund.cancellationRequestId,result.reviewId);
  assert.equal(s.db.cancellations[result.reviewId].refundId,refund._id);assert.equal(s.controls.lastWrites,10);
  for(const reservation of Object.values(s.db.reservations))assert.equal(reservation.status,'RELEASED');
  const before=state(s);assert.equal((await s.resolutionService.execute(event,s.primary)).disposition,'REPLAY');assert.equal(state(s),before);
  assert.equal((await s.readService.execute(s.readEvent(),s.primary)).cancellationSummary.status,'APPROVED');
});
test('A06 zero-refund approval cancels without inventing a money action; full refund reserves exact remaining balance',async()=>{
  for(const full of [false,true]){const s=await setup();await s.request();const amount=full?order(s).paidCents:0,result=await s.execute('cancellation.review',{refundCents:amount});
    assert.equal(order(s).refundReservedCents,amount);assert.equal(Object.keys(s.db.refunds).length,full?1:0);assert.equal(s.db.cancellations[result.reviewId].approvedRefundCents,amount);}
});
test('A06 after-making cancellation cannot invent slot return policy; an injected test retention policy keeps consumed stock and slot',async()=>{
  const s=await setup();await s.merchantService.execute(s.merchantEvent('ACCEPT'),s.primary);
  await s.merchantService.execute(s.merchantEvent('START_MAKING'),s.primary);
  await s.request();const before=state(s);await rejects(()=>s.execute('cancellation.review'),'CONFIGURATION_REQUIRED');assert.equal(state(s),before);
  const service=createMerchantResolutionService({...s.options,afterMakingSlotPolicy:'RETAIN'}),result=await service.execute(s.event('cancellation.review'),s.primary);
  assert.equal(result.disposition,'CANCELLED_REFUND_RESERVED');assert.equal(Object.values(s.db.reservations).find(row=>row.resourceKind==='STOCK').status,'CONSUMED');
  assert.equal(Object.values(s.db.reservations).find(row=>row.resourceKind==='SLOT').status,'CONFIRMED');
});
test('A06 refund-only approval retains fulfillment and historical items, creates exactly one authorized budget intent',async()=>{
  const s=await setup(),facts=clone(s.db.items),reservations=clone(s.db.reservations),result=await approved(s),refund=s.db.refunds[result.refundIntentId];
  assert.equal(order(s).orderStatus,'PAID');assert.equal(refund.cancellationRequestId,null);assert.equal(order(s).refundReservedCents,100);assert.equal(s.controls.lastWrites,5);
  assert.deepEqual(s.db.items,facts);assert.deepEqual(s.db.reservations,reservations);await rejects(()=>s.execute('refund.approve',{idempotencyKey:'OFFLINE_SECOND_APPROVE_KEY'}),'REFUND_IN_PROGRESS');
});
test('A06 rejects over-refund, stale order/review, cross-order review and raw decision fields',async()=>{
  const s=await setup();await rejects(()=>s.execute('refund.approve',{refundCents:order(s).paidCents+1}),'REFUND_EXCEEDS_PAID');
  await s.request();await rejects(()=>s.execute('cancellation.review',{expectedVersion:0}),'VERSION_CONFLICT');
  await rejects(()=>s.execute('cancellation.review',{reviewId:'OFFLINE_OTHER_REVIEW'}),'INVALID_CANCELLATION_REVIEW');
  const event=s.event('cancellation.review');event.payload.decision='REJECT';await rejects(()=>s.resolutionService.execute(event,s.primary),'INVALID_REQUEST');
});
test('A06 request ownership and actual principal enforced before related reads; customers cannot operate admin actions',async()=>{
  const s=await setup();await rejects(()=>s.request({},s.secondary),'FORBIDDEN');assert.equal(s.controls.resolutionReads,0);
  await rejects(()=>s.execute('refund.approve',{},s.owner),'NOT_FOUND');await assert.rejects(()=>s.execute('refund.approve',{}, {...s.primary}));
  assert.equal(s.controls.resolutionReads,0);
});
test('A06 reject requires ORDER_OPERATE; approve requires both capabilities in one current grant; refund-only uses REFUND_APPROVE',async()=>{
  const s=await setup();await s.request();const a=await grant(s,['ORDER_OPERATE']),event=s.event('cancellation.review');
  await rejects(()=>s.resolutionService.execute(event,a.principal),'NOT_FOUND');event.payload.decision='REJECT';delete event.payload.refundCents;
  await s.resolutionService.execute(event,a.principal);
  const b=await grant(s,['REFUND_APPROVE'],'offline-refund-only');await s.execute('refund.approve',{},b.principal);
  const c=await setup();await c.request();const x=await grant(c,['ORDER_OPERATE'],'offline-split-grant');
  await c.adminService.execute({action:'role.grant',payload:{subjectId:x.principal.subjectId,storeIds:[c.storeId],capabilities:['REFUND_APPROVE'],
    reason:'隔离第二条',idempotencyKey:'OFFLINE_SPLIT_REFUND_GRANT'}},c.primary);
  await rejects(()=>c.execute('cancellation.review',{},x.principal),'NOT_FOUND');
});
test('A06 serial competing reviews have one outcome and one refund; pending/reviewed record and logs cannot be forged',async()=>{
  const s=await setup();await s.request();const a=s.event('cancellation.review'),b=s.event('cancellation.review',{idempotencyKey:'OFFLINE_COMPETING_REVIEW_KEY'});
  const results=await Promise.allSettled([s.resolutionService.execute(a,s.primary),s.resolutionService.execute(b,s.secondary)]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);assert.equal(Object.keys(s.db.refunds).length,1);
  const bad=await setup();await bad.request();Object.values(bad.db.cancellations)[0].requestLogId='FORGED';await rejects(()=>bad.execute('cancellation.review'),'INVALID_CANCELLATION_REVIEW');
});
test('A06 original retry first claims an attempt and replays without repeating transport or changing refund budget',async()=>{
  const s=await setup(),approval=await approved(s),event=s.event('refund.retry'),before=writes(s),result=await s.resolutionService.execute(event,s.primary);
  assert.equal(result.operation,'SUBMIT');assert.equal(result.transportRequired,true);assert.equal(result.externalRefundExecuted,false);assert.equal(s.controls.lastWrites,3);
  assert.equal(s.db.refundAttempts[result.attemptId].outRefundNo,s.db.refunds[approval.refundIntentId].outRefundNo);assert.equal(writes(s),before);
  const snapshot=state(s),replay=await s.resolutionService.execute(event,s.primary);assert.equal(replay.disposition,'REPLAY');assert.equal(replay.transportRequired,false);assert.equal(state(s),snapshot);
});
test('A06 unknown/in-flight retry uses QUERY and query timeout never creates a second SUBMIT or new number',async()=>{
  const s=await setup();await approved(s);const first=await s.execute('refund.retry'),number=Object.values(s.db.refunds)[0].outRefundNo;
  await s.refundService.acceptResult(s.response(first.attemptId,'UNKNOWN'));const q=await s.execute('refund.retry',{idempotencyKey:'OFFLINE_A06_QUERY_KEY'});
  assert.equal(q.operation,'QUERY');assert.equal(q.transportRequired,true);
  const blocked=await s.execute('refund.retry',{idempotencyKey:'OFFLINE_A06_QUERY_DUP_KEY'});assert.equal(blocked.disposition,'QUERY_IN_FLIGHT');assert.equal(blocked.transportRequired,false);
  s.controls.now+=1000;const next=await s.execute('refund.retry',{idempotencyKey:'OFFLINE_A06_QUERY_TIMEOUT_KEY'});assert.equal(next.operation,'QUERY');
  assert.equal(Object.values(s.db.refundAttempts).filter(row=>row.operation==='SUBMIT').length,1);assert.equal(Object.values(s.db.refunds)[0].outRefundNo,number);
});
test('A06 provider-confirmed failure retains reserved amount; authorized retry uses same number and P06 settles only once',async()=>{
  const s=await setup();await approved(s);const first=await s.execute('refund.retry');await s.refundService.acceptResult(s.response(first.attemptId,'FAILED'));
  assert.equal(order(s).refundStatus,'FAILED');assert.equal(order(s).refundReservedCents,100);const number=Object.values(s.db.refunds)[0].outRefundNo;
  const second=await s.execute('refund.retry',{idempotencyKey:'OFFLINE_A06_FAILURE_RETRY_KEY'});assert.equal(second.operation,'SUBMIT');
  const response=s.response(second.attemptId);await s.refundService.acceptResult(response);const before=state(s);await s.refundService.acceptResult(response);assert.equal(state(s),before);
  assert.equal(order(s).refundedCents,100);assert.equal(order(s).refundReservedCents,0);assert.equal(Object.values(s.db.refunds)[0].outRefundNo,number);
  const settled=await s.execute('refund.retry',{idempotencyKey:'OFFLINE_A06_SETTLED_RETRY_KEY'});assert.equal(settled.disposition,'ALREADY_SETTLED');assert.equal(settled.transportRequired,false);
});
test('A06 prior approval/retry keys safely replay after settlement, while stale new request fails',async()=>{
  const s=await setup(),approval=s.event('refund.approve');await s.resolutionService.execute(approval,s.primary);const retry=s.event('refund.retry'),first=await s.resolutionService.execute(retry,s.primary);
  await s.refundService.acceptResult(s.response(first.attemptId));assert.equal((await s.resolutionService.execute(approval,s.primary)).disposition,'REPLAY');
  assert.equal((await s.resolutionService.execute(retry,s.primary)).disposition,'REPLAY');await rejects(()=>s.execute('refund.retry',{expectedVersion:0,idempotencyKey:'OFFLINE_A06_STALE_RETRY_KEY'}),'VERSION_CONFLICT');
});
test('A06 new approval after partial settlement reserves only remaining funds, preserving full ordered logs',async()=>{
  const s=await setup();await approved(s);const first=await s.execute('refund.retry');await s.refundService.acceptResult(s.response(first.attemptId));
  const amount=order(s).paidCents-100;await s.execute('refund.approve',{refundCents:amount,idempotencyKey:'OFFLINE_A06_REMAINING_APPROVAL'});
  assert.equal(order(s).refundReservedCents,amount);assert.equal(Object.keys(s.db.refunds).length,2);assert.equal((await s.read('refunds.list')).items.length,2);
});
test('A06 finance reads omit contacts/address/payment credentials/full reasons; audit uses separate AUDIT_READ capability',async()=>{
  const s=await setup();await approved(s);const a=await grant(s,['REFUND_APPROVE']),b=await grant(s,['AUDIT_READ'],'offline-audit-only');
  const list=await s.read('refunds.list',{},a.principal),detail=await s.read('refund.get',{},a.principal),logs=await s.read('audit.list',{},b.principal);
  assert.equal(list.items[0].amountCents,100);assert.equal(detail.status,'PENDING');assert.equal(detail.operationsAllowed,false);assert.ok(logs.items.length>0);
  assert.ok(!JSON.stringify([list,detail,logs]).includes('13800138000'));assert.equal(detail.outRefundNo,undefined);assert.equal(detail.transactionId,undefined);assert.equal(detail.addressSnapshot,undefined);
  await rejects(()=>s.read('audit.list',{},a.principal),'FORBIDDEN');await rejects(()=>s.read('refunds.list',{},b.principal),'FORBIDDEN');
});
test('A06 refunds and audit paginate by signed scoped cursor, tied to grant/actor/filter/content revision',async()=>{
  const s=await setup();await approved(s);await s.execute('refund.retry');const first=await s.read('audit.list',{pageSize:1});assert.equal(first.hasMore,true);
  const next=await s.read('audit.list',{pageSize:1,cursor:first.nextCursor});assert.notEqual(first.items[0]._id,next.items[0]._id);
  await rejects(()=>s.read('audit.list',{cursor:first.nextCursor},s.secondary),'CURSOR_INVALID');
  await s.execute('refund.retry',{idempotencyKey:'OFFLINE_NEW_AUDIT_KEY'});await rejects(()=>s.read('audit.list',{cursor:first.nextCursor}),'CURSOR_INVALID');
  assert.equal((await s.read('refunds.list',{status:'FAILED'})).items.length,0);
});
test('A06 P07 compensation exceptions map to current same-store entities, omit leases, and never claim recovery completion',async()=>{
  const s=await setup(),approval=await approved(s),refund=s.db.refunds[approval.refundIntentId],id=s.job('REFUND_QUERY',refund),payment=Object.values(s.db.payments)[0];
  const settings={environment:s.context.environment,appId:s.context.appId,merchantId:payment.merchantId,provider:payment.provider},policy={retryDelayMs:1000,leaseMs:1000,maxAttempts:2,alertAfterMs:1000};
  const claimed=claimJob(s.db.jobs[id],settings,policy,s.controls.now,'OFFLINE_PRIVATE_LEASE');s.db.jobs[id]=clone(claimed.job);s.controls.now+=1000;
  const result=await s.read('exceptions.list');assert.equal(result.items[0].leaseExpired,true);assert.equal(result.items[0].action,'admin.refund.retry');assert.equal(result.items[0].enabled,false);
  assert.ok(!JSON.stringify(result).includes('OFFLINE_PRIVATE_LEASE'));assert.equal(result.items[0].leaseToken,undefined);assert.equal(s.db.jobs[id].status,'RUNNING');
});
test('A06 denied shop/header reads and current revoked/disabled user block sensitive fetches and replays',async()=>{
  const s=await setup();await approved(s);const a=await grant(s,['REFUND_APPROVE']),event=s.event('refund.retry');await s.resolutionService.execute(event,a.principal);
  await s.adminService.execute({action:'role.revoke',payload:{roleId:a.roleId,expectedVersion:0,reason:'撤销',idempotencyKey:'OFFLINE_A06_REVOKE_KEY'}},s.primary);
  await rejects(()=>s.resolutionService.execute(event,a.principal),'NOT_FOUND');await rejects(()=>s.read('refund.get',{},s.owner),'NOT_FOUND');
  const count=s.controls.financeReads;await rejects(()=>s.read('refunds.list',{},s.owner),'FORBIDDEN');assert.equal(s.controls.financeReads,count);
  s.db.users[s.primary.subjectId].status='DISABLED';await assert.rejects(()=>s.read('audit.list'));
});
test('A06 rejects incomplete, foreign, missing-log, missing-payment/refund/attempt and changed budget snapshots',async()=>{
  const changes=[state=>state.complete=false,state=>state.environment='OTHER',state=>state.logs.pop(),state=>state.payments=[],
    state=>state.refunds=[],state=>state.refunds[0].amountCents++,state=>state.attempts.push({ _id:'FOREIGN',refundId:'OTHER' })];
  for(const change of changes){const s=await setup();await approved(s);s.controls.resolutionPatch=change;const before=state(s);
    await assert.rejects(()=>s.execute('refund.retry'));assert.equal(state(s),before);}
});
test('A06 rejects finance/audit scope/duplicates and hides multi-store audit scopes/raw changes',async()=>{
  const s=await setup();await approved(s);s.controls.financePatch=state=>state.complete=false;await rejects(()=>s.read('refunds.list'),'INVALID_FINANCE_STATE');
  s.controls.financePatch=null;s.controls.auditPatch=state=>state.audits.push(clone(state.audits[0]));await rejects(()=>s.read('audit.list'),'INVALID_AUDIT_STATE');
  s.controls.auditPatch=state=>{state.audits[0].storeIds.push('OTHER_STORE');state.audits[0].storeId=null;state.audits[0].changes=[{field:'phone',after:'PRIVATE_CONTACT'}];};
  const result=await s.read('audit.list');assert.ok(!JSON.stringify(result).includes('OTHER_STORE'));assert.ok(!JSON.stringify(result).includes('PRIVATE_CONTACT'));
});
test('A06 receipt reuse/corruption cannot redirect reviews/refunds/attempts, alter original result or bypass current ledger',async()=>{
  const changes=[receipt=>receipt.result.version++,receipt=>receipt.effect.refundIntentId='OTHER',receipt=>receipt.environment='OTHER',receipt=>receipt.effect.operation='QUERY'];
  for(const change of changes){const s=await setup();await approved(s);const event=s.event('refund.retry');await s.resolutionService.execute(event,s.primary);
    change(Object.values(s.db.receipts).find(row=>row.command==='admin.refund.retry'));await rejects(()=>s.resolutionService.execute(event,s.primary),'INVALID_IDEMPOTENCY_RECORD');}
  const s=await setup(),event=s.event('refund.approve');await s.resolutionService.execute(event,s.primary);const changed=clone(event);changed.payload.refundCents=101;
  await rejects(()=>s.resolutionService.execute(changed,s.primary),'IDEMPOTENCY_KEY_REUSED');
});
test('A06 every 10-write paid cancellation failure/zero row rolls back resources, review, intent, order, log, audit, receipt',async()=>{
  for(const control of ['failAt','zeroAt'])for(let position=1;position<=10;position++){
    const s=await setup();await s.request();s.controls[control]=position;const before=state(s);await assert.rejects(()=>s.execute('cancellation.review'));assert.equal(state(s),before);}
});
test('A06 every 5-write request/refund approval and 3-write retry failure position rolls back',async()=>{
  for(const action of ['cancellation.request','refund.approve','refund.retry'])for(const control of ['failAt','zeroAt'])for(let position=1;position<=(action==='refund.retry'?3:5);position++){
    const s=await setup();if(action==='refund.retry')await approved(s);s.controls[control]=position;const before=state(s);
    await assert.rejects(()=>action==='cancellation.request'?s.request():s.execute(action));assert.equal(state(s),before);}
});
test('A06 complete read fences preserve role, order, pending-review, attempt/number uniqueness, logs and negative predicates until commit',async()=>{
  const changes=[db=>Object.values(db.roles)[0].version++,db=>Object.values(db.orders)[0].version++,db=>db.refundAttempts.NEW={_id:'NEW'},
    db=>db.cancellations.NEW={_id:'NEW'},db=>db.refunds.NEW={_id:'NEW'},db=>db.audits.NEW={_id:'NEW'},db=>db.receipts.NEW={_id:'NEW'}];
  for(const [index,change] of changes.entries()){const s=await setup(),version=order(s).version;s.controls.beforeCommit=change;
    await rejects(()=>s.execute('refund.approve'),'VERSION_CONFLICT');assert.equal(order(s).version,version+(index===1?1:0));
    assert.equal(Object.keys(s.db.refunds).filter(id=>id!=='NEW').length,0);}
  const s=await setup();s.controls.denyFence=true;await rejects(()=>s.request(),'VERSION_CONFLICT');await rejects(()=>s.read('audit.list'),'VERSION_CONFLICT');
});
test('A06 clock regression, unknown redaction and duplicate platform refund number fail before any commit',async()=>{
  const s=await setup();s.controls.nowSequence=[s.controls.now,s.controls.now,s.controls.now-1];const before=state(s);
  await rejects(()=>s.execute('refund.approve'),'INVALID_CONFIGURATION');assert.equal(state(s),before);
  const a=await setup(),service=createMerchantResolutionService({...a.options,redactReason:()=>Promise.resolve('NOT_SYNC')});
  await assert.rejects(()=>service.execute(a.event('refund.approve'),a.primary));assert.equal(Object.keys(a.db.refunds).length,0);
  const b=await setup(),original=b.controls.extendTransaction;b.controls.extendTransaction=parts=>({...original(parts),readRefundByNumber:async()=>({_id:'OTHER'})});
  await rejects(()=>b.execute('refund.approve'),'REFUND_NUMBER_CONFLICT');
});
test('A06 PLANNED retry/exception contracts cannot accept client operation/funds/status and do not open callable actions',()=>{
  assert.equal(ACTION_CONTRACTS['admin.refund.retry'].status,'PLANNED');assert.equal(ACTION_CONTRACTS['admin.exceptions.list'].access,'REFUND_APPROVE');
  assert.throws(()=>parseApiRequest('admin',{action:'refund.retry',payload:{refundId:'refund',expectedVersion:0,reason:'核查',operation:'SUBMIT',idempotencyKey:'OFFLINE_CLIENT_RETRY_KEY'}}));
  assert.deepEqual(Object.values(ACTION_CONTRACTS).filter(row=>row.status!=='PLANNED').map(row=>row.domain+'.'+row.action).sort(),['store.health','user.me']);
});

test('A06 refund-only replay cannot be redirected to a fabricated review even if stored effect digest is replaced',async()=>{
  const s=await setup(),event=s.event('refund.approve');await s.resolutionService.execute(event,s.primary);
  const receipt=Object.values(s.db.receipts).find(row=>row.command==='admin.refund.approve'),audit=Object.values(s.db.audits).find(row=>row.action==='admin.refund.approve');
  receipt.effect.reviewId='OTHER_REVIEW';audit.changes[2].after=requestFingerprint(receipt.effect);
  await rejects(()=>s.resolutionService.execute(event,s.primary),'INVALID_IDEMPOTENCY_RECORD');
});
test('A06 replay verifies original transition rather than only a self-consistent changed log and digest',async()=>{
  const s=await setup(),event=s.event('refund.approve');await s.resolutionService.execute(event,s.primary);
  const log=Object.values(s.db.logs).find(row=>row.command==='APPROVE_REFUND'),audit=Object.values(s.db.audits).find(row=>row.action==='admin.refund.approve');
  log.after.orderStatus='CANCELLED';order(s).orderStatus='CANCELLED';order(s).cancelledAt=order(s).updatedAt;
  audit.changes[1].after=requestFingerprint(log.after);
  await rejects(()=>s.resolutionService.execute(event,s.primary),'INVALID_IDEMPOTENCY_RECORD');
});

test('A06 completed-fulfillment race cannot approve cancellation but explicit rejection resolves pending request',async()=>{
  const s=await setup();await s.request();s.controls.now+=2;s.append('COMPLETE_PICKUP',{orderStatus:'COMPLETED',completedAt:order(s).updatedAt+1});
  const before=state(s);await rejects(()=>s.execute('cancellation.review'),'INVALID_TRANSITION');assert.equal(state(s),before);
  const event=s.event('cancellation.review');event.payload.decision='REJECT';delete event.payload.refundCents;
  await s.resolutionService.execute(event,s.primary);assert.equal(order(s).orderStatus,'COMPLETED');assert.equal(Object.values(s.db.cancellations)[0].status,'REJECTED');
});
test('A06 rejected review key replays without reversing a later approved review',async()=>{
  const s=await setup();await s.request();const reject=s.event('cancellation.review');reject.payload.decision='REJECT';delete reject.payload.refundCents;
  await s.resolutionService.execute(reject,s.primary);await s.request({idempotencyKey:'OFFLINE_LATER_REQUEST_KEY'});
  await s.execute('cancellation.review',{idempotencyKey:'OFFLINE_LATER_APPROVAL_KEY'});
  const before=state(s);assert.equal((await s.resolutionService.execute(reject,s.primary)).disposition,'REPLAY');assert.equal(state(s),before);
});
test('A06 continued historical refund handling permits CLOSED/ARCHIVED store under current role; wrong archived payment profile blocks retry',async()=>{
  const s=await setup();s.db.stores[s.storeId].status='ARCHIVED';await approved(s);assert.equal((await s.read('refunds.list')).items.length,1);
  const service=createMerchantResolutionService({...s.options,loadPaymentConfiguration:async()=>({plan:()=>({environment:'OTHER_ENV'})})});
  const before=state(s);await rejects(()=>service.execute(s.event('refund.retry'),s.primary),'PAYMENT_CONFIGURATION_CHANGED');assert.equal(state(s),before);
});
test('A06 finance validates job scope/entity and complete attempt sequence; customer cannot view compensation entries',async()=>{
  const s=await setup(),approval=await approved(s);s.job('REFUND_QUERY',s.db.refunds[approval.refundIntentId]);
  await rejects(()=>s.read('exceptions.list',{},s.owner),'FORBIDDEN');
  s.controls.financePatch=state=>state.jobs[0].appId='OTHER_APP';await assert.rejects(()=>s.read('exceptions.list'));
  s.controls.financePatch=null;await s.execute('refund.retry');s.controls.financePatch=state=>state.attempts[0].sequence=2;
  await rejects(()=>s.read('refund.get'),'INVALID_REFUND_ATTEMPT');
});
test('A06 concurrent retry keys reserve one SUBMIT only; remaining callers can query the same refund identity',async()=>{
  const s=await setup();await approved(s);const a=s.event('refund.retry'),b=s.event('refund.retry',{idempotencyKey:'OFFLINE_PARALLEL_RETRY_KEY'});
  const results=await Promise.all([s.resolutionService.execute(a,s.primary),s.resolutionService.execute(b,s.secondary)]);
  assert.deepEqual(results.map(result=>result.operation),['SUBMIT','QUERY']);assert.equal(Object.values(s.db.refundAttempts).filter(row=>row.operation==='SUBMIT').length,1);
  assert.equal(Object.keys(s.db.refunds).length,1);assert.equal(order(s).refundReservedCents,100);
});

test('A06 unpaid closed-payment order compensation is visible and requires P04 recovery, never a refund retry',async()=>{
  const s=await setup({paid:false}),parent=order(s),at=parent.updatedAt+1;
  s.db.payments.CLOSED={_id:'CLOSED',schemaVersion:1,version:1,createdAt:parent.createdAt,updatedAt:at,expiresAt:parent.paymentDeadlineAt,
    orderId:parent._id,ownerId:parent.ownerId,environment:s.context.environment,appId:s.context.appId,provider:'WECHATPAY_DIRECT_V3',merchantId:'OFFLINE_MERCHANT',
    status:'CLOSED',accountingState:'UNAPPLIED',currency:'CNY',amountCents:parent.totalCents,outTradeNo:'OFFLINE_CLOSED_PAYMENT',
    closedAt:at,lastEventId:'OFFLINE_CLOSED_RESULT',confirmedAt:null,transactionId:null};
  s.append('PAYMENT_CLOSED',{paymentStatus:'CLOSED'});s.job('ORDER_CANCELLATION_REVIEW',order(s));
  const result=await s.read('exceptions.list');assert.equal(result.items[0].kind,'ORDER_CANCELLATION_REVIEW');assert.equal(result.items[0].action,null);
  assert.equal(result.items[0].requiresServerRecovery,true);assert.equal(order(s).orderStatus,'PENDING_PAYMENT');
});
test('A06 financial reads reject missing paid evidence and raw job outcomes; provider error DTOs expose only controlled codes',async()=>{
  const s=await setup();s.controls.financePatch=state=>state.payments=[];await rejects(()=>s.read('refunds.list'),'REFUND_PAYMENT_UNRESOLVED');
  s.controls.financePatch=null;const a=await approved(s);s.db.refunds[a.refundIntentId].lastErrorCode='PRIVATE_PHONE_13800138000';
  assert.equal((await s.read('refund.get')).lastErrorCode,null);s.job('REFUND_QUERY',s.db.refunds[a.refundIntentId]);
  s.controls.financePatch=state=>state.jobs[0].lastOutcome={contact:'PRIVATE'};await rejects(()=>s.read('exceptions.list'),'INVALID_FINANCE_STATE');
});
