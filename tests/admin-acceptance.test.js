'use strict';
// A07 integration evidence: real local services, synthetic payment, serial memory only.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {probeLegacy,dependencyBoundary,adminBoundary}=require('../scripts/verify-admin-offline');
const {setup,clone}=require('./fixtures/merchant-resolution');
const {createPickupSession}=require('../miniprogram/features/admin/pickup-session');
const order=s=>s.db.orders[s.orderId],resources=s=>JSON.stringify([s.db.stocks,s.db.slots,s.db.reservations]);
const rejects=(work,code)=>assert.rejects(work,error=>error.code===code);
async function ready(s){for(const command of ['ACCEPT','START_MAKING','MARK_READY'])
  await s.merchantService.execute(s.merchantEvent(command),s.primary);}
async function denyRequest(s){const event=s.event('cancellation.review');event.payload.decision='REJECT';delete event.payload.refundCents;
  return s.resolutionService.execute(event,s.primary);}
test('A07 unopened business writes and disabled catalog reads are blocked by the actual client before any cloud call',async()=>{
  const result=await adminBoundary();assert.equal(result.passed,true);assert.equal(result.plannedActions,59);
  assert.equal(result.rejectedActions,59);assert.equal(result.platformCalls,0);assert.equal(result.adminFunctionPresent,false);
  assert.equal(result.catalogReadActions,3);
  assert.equal(result.pickupClosed,true);assert.equal(result.payment.paymentPlatformCalls,0);
});
test('A07 legacy staff, order and fake refund calls are denied in all eleven prohibited runtime combinations',async()=>{
  for(const stage of ['development','test','production'])for(const mode of ['shell','cloud'])for(const enabled of [false,true]){
    if(stage==='development'&&mode==='shell'&&enabled)continue;
    const result=await probeLegacy({stage,mode,enableLegacyDemo:enabled});assert.equal(result.passed,true);assert.equal(result.platformCalls,0);
  }
});
test('A07 explicit development shell demo reaches only the isolated stub, proving the closed-runtime probe tests the actual guard',async()=>{
  const result=await probeLegacy({stage:'development',mode:'shell',enableLegacyDemo:true});
  assert.equal(result.passed,false);assert.equal(result.blocked,0);assert.equal(result.platformCalls,3);
});
test('A07 current nonlegacy JS dependencies and canonical routes contain no literal legacy import or local HTTP URL',()=>{
  const result=dependencyBoundary();assert.equal(result.passed,true);assert(result.checkedFiles>50);assert.deepEqual(result.violations,[]);
});
test('A07 actual user handler ignores staff/PIN identities and cannot turn me into an admin action',async()=>{
  const context={OPENID:'OFFLINE_CUSTOMER',APPID:'OFFLINE_APP',ENV:'OFFLINE_ENV'},module={exports:{}},exports=module.exports;
  let record=null;
  const sdk={DYNAMIC_CURRENT_ENV:'OFFLINE',init(){},getWXContext:()=>context,database:()=>({
    runTransaction:async run=>run({collection:()=>({doc:()=>({get:async()=>({data:record})}),
      add:async({data})=>{record=structuredClone(data);return {_id:data._id};}})})})};
  const {createHandler}=require('../cloudfunctions/_shared/runtime');
  const base=path.resolve(__dirname,'../cloudfunctions/user');
  const factory=vm.runInThisContext('(function(require,exports,process){'+fs.readFileSync(path.join(base,'index.js'),'utf8')+'\n})');
  factory(name=>name==='wx-server-sdk'?sdk:name==='./shared/runtime'?{
    createHandler:options=>createHandler({...options,logger:{info(){},warn(){},error(){}}})
  }:require(path.resolve(base,name)), exports,
  {env:{JJL_APP_ID:context.APPID,JJL_CLOUD_ENV:context.ENV,JJL_STAGE:'test'}});
  const invocation={environment:JSON.stringify({WX_OPENID:context.OPENID,WX_APPID:context.APPID}),
    namespace:context.ENV,request_id:'offline-platform'};
  const result=await exports.main({action:'me',role:'staff',openid:'admin',payload:{pin:'246810',role:'STORE'}},invocation);
  assert.equal(result.ok,true);assert.equal(result.data.role,'customer');
  assert.equal(record.openId,context.OPENID);
  assert.equal((await exports.main({action:'role.grant',payload:{}},invocation)).error.code,'INVALID_REQUEST');
  assert.equal((await exports.main({action:'me',context:invocation}, {...invocation,environment:'{}'})).error.code,'AUTH_REQUIRED');
});
test('A07 customer request, explicit rejection, pickup confirmation and lost-response replay preserve original resources and facts',async()=>{
  const s=await setup();await ready(s);await s.request();const historical=clone(order(s).appointmentSnapshot),before=resources(s);
  await denyRequest(s);assert.equal(resources(s),before);
  const issued=await s.pickupService.get({action:'pickupCredential.get',payload:{orderId:s.orderId}},s.owner);let seq=0;
  const session=createPickupSession({storeId:s.storeId,subjectId:s.primary.subjectId,
    policy:{version:'OFFLINE_TEST_ONLY',format:'OPAQUE_TOKEN'},keyFactory:()=> 'OFFLINE_A07_PICKUP_'+(++seq)});
  // Protocol projection is test-only. Production must never strip OFFLINE gates.
  async function detail(plan){const {scope,cloudVerified,callable,operationsAllowed,...dto}=await s.readService.execute(plan.request.event,s.primary);
    assert.equal(scope,'OFFLINE_MERCHANT_ORDER_DETAIL');return dto;}
  const read=session.beginManual(s.orderId,issued.credential.value);session.receiveDetail(read.ticket,await detail(read));
  const first=session.confirm();await s.merchantService.execute(first.request.event,s.primary);session.failed(first.ticket);
  const retry=session.retryOriginal(),replayed=await s.merchantService.execute(retry.request.event,s.primary);
  assert.equal(replayed.disposition,'REPLAY');session.receiveResult(retry.ticket,replayed.result);
  const final=session.refresh();session.receiveDetail(final.ticket,await detail(final));
  assert.equal(session.current().status,'COMPLETION_REPORTED');assert.equal(session.current().successFeedbackAllowed,false);
  assert.equal(resources(s),before);assert.deepEqual(order(s).appointmentSnapshot,historical);
});
test('A07 manual delivery after cancellation rejection and later partial refund keeps fulfillment, slot, items and original delivery replay',async()=>{
  const s=await setup({mode:'DELIVERY'});await ready(s);await s.request();await denyRequest(s);
  await s.merchantService.execute(s.merchantEvent('START_DELIVERY'),s.primary);const event=s.merchantEvent('COMPLETE_DELIVERY');
  await s.merchantService.execute(event,s.secondary);const before=resources(s),items=clone(s.db.items),historical=clone(order(s).addressSnapshot);
  const approval=await s.execute('refund.approve'),attempt=await s.execute('refund.retry');
  const response=s.response(attempt.attemptId);await s.refundService.acceptResult(response);const settled=JSON.stringify(s.db);
  await s.refundService.acceptResult(response);assert.equal(JSON.stringify(s.db),settled);
  assert.equal((await s.merchantService.execute(event,s.secondary)).disposition,'REPLAY');
  assert.equal(order(s).orderStatus,'COMPLETED');assert.equal(order(s).refundedCents,100);assert.equal(order(s).refundReservedCents,0);
  assert.equal(resources(s),before);assert.deepEqual(s.db.items,items);assert.deepEqual(order(s).addressSnapshot,historical);
  const dto=await s.read('refund.get',{refundId:approval.refundIntentId});assert.equal(dto.status,'SUCCEEDED');
});
test('A07 paid cancellation approval precedes fulfillment and unknown refund queries the same number without double submission',async()=>{
  const s=await setup();await s.request();const amount=order(s).paidCents,approval=await s.execute('cancellation.review',{refundCents:amount});
  const before=resources(s);await rejects(()=>s.merchantService.execute(s.merchantEvent('ACCEPT'),s.primary),'INVALID_TRANSITION');
  const attempt=await s.execute('refund.retry'),number=s.db.refunds[approval.refundIntentId].outRefundNo;
  await s.refundService.acceptResult(s.response(attempt.attemptId,'UNKNOWN'));
  const query=await s.execute('refund.retry',{idempotencyKey:'OFFLINE_A07_UNKNOWN_QUERY'});assert.equal(query.operation,'QUERY');
  await s.refundService.acceptResult(s.response(query.attemptId));
  assert.equal(order(s).orderStatus,'CANCELLED');assert.equal(order(s).refundedCents,amount);assert.equal(resources(s),before);
  assert.equal(s.db.refunds[approval.refundIntentId].outRefundNo,number);
  assert.equal(Object.values(s.db.refundAttempts).filter(row=>row.operation==='SUBMIT').length,1);
});
test('A07 current revocation denies refund recovery and original receipt replay before related finance reads',async()=>{
  const s=await setup();await s.execute('refund.approve');const event=s.event('refund.retry');await s.resolutionService.execute(event,s.primary);
  await s.adminService.execute({action:'role.revoke',payload:{roleId:s.rootRoleId,expectedVersion:0,reason:'隔离撤销',
    idempotencyKey:'OFFLINE_A07_REVOKE'}},s.secondary);const before=JSON.stringify(s.db),reads=s.controls.financeReads;
  await rejects(()=>s.resolutionService.execute(event,s.primary),'NOT_FOUND');await rejects(()=>s.read('refunds.list'),'FORBIDDEN');
  assert.equal(s.controls.financeReads,reads);assert.equal(JSON.stringify(s.db),before);
});
