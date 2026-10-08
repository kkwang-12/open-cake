'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createPickupSession,pickupAvailability}=require('../miniprogram/features/admin/pickup-session');
const {createClient}=require('../miniprogram/services/cloud');
const {parseApiRequest}=require('../cloudfunctions/_shared/api-contract');
const {setup,clone}=require('./fixtures/merchant-order');
const token='a'.repeat(64),other='b'.repeat(64);
const startAt=Date.parse('2026-10-06T02:00:00Z');
function options(patch={}){let sequence=0;return {storeId:'store',subjectId:'merchant',policy:{version:'OFFLINE_TEST_ONLY',format:'OPAQUE_TOKEN'},
  keyFactory:()=> 'OFFLINE_PICKUP_SESSION_KEY_'+(++sequence),...patch};}
function detail(patch={}){return {orderId:'order',orderNo:'NO-01',version:8,orderStatus:'READY',paymentStatus:'PAID',refundStatus:'NONE',
  fulfillment:'PICKUP',address:null,store:{storeId:'store',name:'测试门店'},contact:{name:'测试顾客',phone:'13800138000'},currency:'CNY',
  subtotalCents:1200,deliveryFeeCents:0,totalCents:1200,paidCents:1200,refundedCents:0,completedAt:null,cancellationSummary:null,
  appointment:{fulfillment:'PICKUP',windowNature:'PICKUP',serviceDate:'2026-10-06',timeZone:'Asia/Shanghai',startAt,endAt:startAt+1800000},
  items:[{productId:'product',skuId:'sku',productName:'面包',skuDescription:'单个',quantity:2,unitPriceCents:600,lineTotalCents:1200}],
  availableActions:[{action:'admin.order.transition',command:'COMPLETE_PICKUP',enabled:false,blockedReason:'CONFIGURATION_REQUIRED'}],...patch};}
function prepared(patch={}){const session=createPickupSession(options(patch)),read=session.beginManual('order',token);
  session.receiveDetail(read.ticket,detail());return session;}
const code=expected=>error=>error.code===expected;
const check=(session,status)=>assert.equal(session.current().status,status);

test('A03 manual input reads authorized detail first and requires an explicit confirmation before any mutation plan',()=>{
  const session=createPickupSession(options()),read=session.beginManual('order',' '+token+' ');
  assert.deepEqual(read.request,{domain:'admin',event:{action:'order.get',payload:{orderId:'order'}}});
  assert.throws(()=>session.confirm(),code('PICKUP_RECHECK_REQUIRED'));
  session.receiveDetail(read.ticket,detail());check(session,'AWAITING_CONFIRMATION');
  const mutation=session.confirm();assert.equal(mutation.request.event.payload.expectedVersion,8);
  assert.equal(mutation.request.event.payload.pickupCredential,token);assert.equal(mutation.request.event.payload.command,'COMPLETE_PICKUP');
  parseApiRequest('admin',mutation.request.event);assert(Object.isFrozen(mutation.request.event.payload));
  assert.throws(()=>session.confirm(),code('PICKUP_RECHECK_REQUIRED'));
});

test('A03 view never contains the credential, idempotency key, raw scan, private phone or persistence evidence',()=>{
  const session=createPickupSession(options()),read=session.beginManual('order',token),response=detail();
  response.openId='PRIVATE_OPENID';response.contact.openId='PRIVATE_CONTACT';response.pickupCredential=token;
  response.items[0].lineId='PRIVATE_LINE';response.items[0].cakeMessage='PRIVATE_MESSAGE';session.receiveDetail(read.ticket,response);
  const before=JSON.stringify(session.current());session.confirm();const after=JSON.stringify(session.current());
  for(const value of [token,'13800138000','PRIVATE_OPENID','PRIVATE_CONTACT','PRIVATE_LINE','PRIVATE_MESSAGE','OFFLINE_PICKUP_SESSION_KEY']){
    assert(!before.includes(value));assert(!after.includes(value));
  }
  assert(Object.isFrozen(session.current().summary.items[0]));assert.equal(session.current().summary.quantity,2);
});

test('A03 scan codec must be explicitly configured, locates only an order id and never auto-completes',()=>{
  assert.throws(()=>createPickupSession(options()).beginScan('opaque-scan'),code('CONFIGURATION_REQUIRED'));
  const session=createPickupSession(options({decodeScan:raw=>{assert.equal(raw,'OFFLINE_SCAN');return {orderId:'order',pickupCredential:token};}}));
  const read=session.beginScan('OFFLINE_SCAN');assert.equal(read.request.event.action,'order.get');check(session,'LOADING');
  session.receiveDetail(read.ticket,detail());check(session,'AWAITING_CONFIRMATION');
  assert(!JSON.stringify(session.current()).includes('OFFLINE_SCAN'));
});

test('A03 malformed scan, URLs, numeric tokens, decoder exceptions and extra fields cannot locate or mutate orders',()=>{
  for(const decodeScan of [()=>{throw Error(token);},()=>({orderId:'order',pickupCredential:'123456'}),
    ()=>({orderId:'order',pickupCredential:token,storeId:'store'}),()=>Promise.resolve({orderId:'order',pickupCredential:token}),()=>null]){
    const session=prepared({decodeScan});assert.throws(()=>session.beginScan('input'),code('INVALID_PICKUP_SCAN'));check(session,'EMPTY');
    assert.throws(()=>session.confirm(),code('PICKUP_RECHECK_REQUIRED'));
  }
  const session=createPickupSession(options({decodeScan:()=>({orderId:'order',pickupCredential:token})}));
  for(const raw of ['',null,'x'.repeat(4097)])assert.throws(()=>session.beginScan(raw),code('INVALID_PICKUP_SCAN'));
  for(const raw of ['123456','https://example.com','order',token.toUpperCase(),'a'.repeat(63),'a'.repeat(65),token+'\nb'])
    assert.throws(()=>session.beginManual('order',raw),code('INVALID_PICKUP_INPUT'));
});

test('A03 missing policy, unknown format and invalid account/store/session key providers fail closed',()=>{
  for(const patch of [{policy:null},{policy:{version:'x',format:'SHORT_CODE'}},{policy:{format:'OPAQUE_TOKEN'}},
    {subjectId:''},{storeId:''},{keyFactory:null},{decodeScan:1}])assert.throws(()=>createPickupSession(options(patch)),code('CONFIGURATION_REQUIRED'));
  for(const keyFactory of [()=> 'short',()=>token+'!'])assert.throws(()=>prepared({keyFactory}).confirm(),code('INVALID_PICKUP_KEY'));
});

test('A03 newer input ignores late detail and scan cancellation/invalidation drops unsubmitted credentials',()=>{
  const session=createPickupSession(options()),old=session.beginManual('old',token),current=session.beginManual('order',other);
  assert.equal(session.receiveDetail(old.ticket,detail({orderId:'old'})),false);
  assert.equal(session.receiveDetail(current.ticket,detail()),true);session.invalidate();check(session,'EMPTY');
  assert.equal(session.receiveDetail(current.ticket,detail()),false);assert.throws(()=>session.refresh(),code('PICKUP_INPUT_REQUIRED'));
});

test('A03 wrong store, delivery, malformed amounts, appointment or products cannot populate a confirmation',()=>{
  const patches=[{store:{storeId:'other',name:'他店'}},{fulfillment:'DELIVERY'},{address:{detail:'配送'}},{orderId:'other'},
    {paidCents:1},{totalCents:0},{version:-1},{completedAt:startAt},{items:[]},{items:[{...detail().items[0],quantity:0}]},
    {appointment:{...detail().appointment,endAt:startAt+1}},{appointment:{...detail().appointment,serviceDate:'2026-10-05'}},
    {cancellationSummary:{}},{availableActions:null}];
  for(const patch of patches){const session=createPickupSession(options()),read=session.beginManual('order',token);
    session.receiveDetail(read.ticket,detail(patch));check(session,'READ_ERROR');assert.equal(session.current().summary,null);
    assert.throws(()=>session.confirm(),code('PICKUP_RECHECK_REQUIRED'));
  }
});

test('A03 offline and planner markers cannot be treated as connected order or command responses',()=>{
  for(const patch of [{scope:'OFFLINE_MERCHANT_ORDER_DETAIL'},{cloudVerified:false},{callable:false},{operationsAllowed:false}]){
    const session=createPickupSession(options()),read=session.beginManual('order',token);session.receiveDetail(read.ticket,detail(patch));check(session,'READ_ERROR');
  }
  const session=prepared(),command=session.confirm();session.receiveResult(command.ticket,
    {scope:'OFFLINE_PICKUP_RESULT',entityId:'order',version:9,errorCode:null});check(session,'RESULT_PENDING');
  assert.equal(session.current().retryOriginalAvailable,true);
});

test('A03 canceled, completed, not-ready, missing capability and refund/cancellation cases do not offer confirmation',()=>{
  for(const [patch,status] of [[{orderStatus:'CANCELLED'},'CANCELLED'],[{orderStatus:'COMPLETED',completedAt:startAt},'ALREADY_COMPLETED'],
    [{orderStatus:'MAKING'},'NOT_READY'],[{availableActions:[]},'NOT_READY'],[{refundStatus:'PENDING'},'REVIEW_REQUIRED'],
    [{refundedCents:1,refundStatus:'SUCCEEDED'},'REVIEW_REQUIRED'],[{cancellationSummary:{status:'PENDING'}},'REVIEW_REQUIRED']]){
    const session=createPickupSession(options()),read=session.beginManual('order',token);session.receiveDetail(read.ticket,detail(patch));check(session,status);
    assert.throws(()=>session.confirm(),code('PICKUP_RECHECK_REQUIRED'));
  }
});

test('A03 lost mutation response retries the exact original key, version and credential; no new input while uncertain',()=>{
  let calls=0;const session=prepared({keyFactory:()=> 'OFFLINE_RECOVERY_KEY_'+(++calls)}),first=session.confirm();
  assert.equal(session.failed(first.ticket),true);check(session,'RESULT_PENDING');
  assert.throws(()=>session.beginManual('other',other),code('PICKUP_RESULT_PENDING'));
  assert.throws(()=>session.beginScan('other'),code('PICKUP_RESULT_PENDING'));
  const retry=session.retryOriginal();assert.deepEqual(retry.request,first.request);assert.equal(calls,1);
  assert.equal(session.receiveResult(first.ticket,{entityId:'order',version:9,errorCode:null}),false);
});

test('A03 hiding during submit ignores the old response and retains private original request for recovery',()=>{
  const session=prepared(),first=session.confirm();session.invalidate();check(session,'RESULT_PENDING');
  assert.equal(session.receiveResult(first.ticket,{entityId:'order',version:9,errorCode:null}),false);
  const retry=session.retryOriginal();assert.deepEqual(retry.request,first.request);
  assert(!JSON.stringify(session.current()).includes(token));
});

test('A03 reported command success still needs an authoritative follow-up read and does not open success feedback',()=>{
  const session=prepared(),command=session.confirm();session.receiveResult(command.ticket,{entityId:'order',version:9,errorCode:null});
  check(session,'RESULT_PENDING');assert.equal(session.current().successFeedbackAllowed,false);
  const old=session.refresh();session.receiveDetail(old.ticket,detail());check(session,'RESULT_PENDING');
  const read=session.refresh();session.receiveDetail(read.ticket,detail({version:9,orderStatus:'COMPLETED',completedAt:startAt}));
  check(session,'COMPLETION_REPORTED');assert.equal(session.current().resultPending,false);assert.equal(session.current().successFeedbackAllowed,false);
  assert.throws(()=>session.retryOriginal(),code('PICKUP_RECHECK_REQUIRED'));
});

test('A03 completed detail alone after a lost response cannot attribute success to this request or discard its key',()=>{
  const session=prepared(),first=session.confirm();session.failed(first.ticket);const read=session.refresh();
  session.receiveDetail(read.ticket,detail({version:9,orderStatus:'COMPLETED',completedAt:startAt}));check(session,'RESULT_PENDING');
  const retry=session.retryOriginal();assert.deepEqual(retry.request,first.request);
  session.receiveResult(retry.ticket,{entityId:'order',version:9,errorCode:null});const final=session.refresh();
  session.receiveDetail(final.ticket,detail({version:9,orderStatus:'COMPLETED',completedAt:startAt}));check(session,'COMPLETION_REPORTED');
});

test('A03 new detail version never rewrites an uncertain mutation and invalid result payloads never release its key',()=>{
  for(const response of [{entityId:'other',version:9,errorCode:null},{entityId:'order',version:8,errorCode:null},
    {entityId:'order',version:9,errorCode:'FORBIDDEN'},{entityId:'order',version:9,errorCode:null,token},null]){
    const session=prepared(),first=session.confirm();session.receiveResult(first.ticket,response);check(session,'RESULT_PENDING');
    const read=session.refresh();session.receiveDetail(read.ticket,detail({version:10}));
    assert.deepEqual(session.retryOriginal().request,first.request);
  }
});

test('A03 committed wrong-code and non-writing cooldown/lock responses clear raw input but never auto-retry or promise unlock times',()=>{
  for(const [errorCode,version] of [['PICKUP_CREDENTIAL_INVALID',9],['PICKUP_CREDENTIAL_LOCKED',8],['PICKUP_CREDENTIAL_RATE_LIMITED',8]]){
    const session=prepared(),first=session.confirm();session.receiveResult(first.ticket,{entityId:'order',version,errorCode});check(session,'INPUT_REQUIRED');
    assert.equal(session.current().resultPending,false);assert.throws(()=>session.retryOriginal(),code('PICKUP_RECHECK_REQUIRED'));
    assert.throws(()=>session.confirm(),code('PICKUP_RECHECK_REQUIRED'));
    const read=session.refresh();session.receiveDetail(read.ticket,detail({version}));check(session,'INPUT_REQUIRED');
    const input=session.beginManual('order',other);session.receiveDetail(input.ticket,detail({version}));
    assert.notEqual(session.confirm().request.event.payload.idempotencyKey,first.request.event.payload.idempotencyKey);
  }
});

test('A03 reused generated key is rejected even after a definitive wrong-code result',()=>{
  const session=prepared({keyFactory:()=> 'OFFLINE_DUPLICATE_KEY'}),first=session.confirm();
  session.receiveResult(first.ticket,{entityId:'order',version:9,errorCode:'PICKUP_CREDENTIAL_INVALID'});
  const read=session.beginManual('order',other);session.receiveDetail(read.ticket,detail({version:9}));
  assert.throws(()=>session.confirm(),code('INVALID_PICKUP_KEY'));
});

test('A03 detail regression, altered historical facts and conflicting same-version observations block confirmation',()=>{
  for(const patch of [{version:7},{version:9,store:{storeId:'store',name:'changed'}},{version:9,items:[{...detail().items[0],quantity:1}]},
    {version:9,totalCents:2400,paidCents:2400},{paymentStatus:'CLOSED',paidCents:0,orderStatus:'PENDING_PAYMENT'}]){
    const session=prepared(),read=session.refresh();session.receiveDetail(read.ticket,detail(patch));check(session,'READ_ERROR');
    assert.throws(()=>session.confirm(),code('PICKUP_RECHECK_REQUIRED'));
  }
});

test('A03 read failures and duplicate results have no command side effects or stale confirmation',()=>{
  const session=createPickupSession(options()),first=session.beginManual('order',token);session.failed(first.ticket);check(session,'READ_ERROR');
  assert.equal(session.receiveDetail(first.ticket,detail()),false);const current=session.refresh();session.receiveDetail(current.ticket,detail());
  assert.equal(session.receiveDetail(current.ticket,detail()),false);session.confirm();assert.throws(()=>session.refresh(),code('PICKUP_RESULT_PENDING'));
});

test('A03 command result version must match the exact O07 write/no-write outcome before releasing recovery',()=>{
  for(const [errorCode,version] of [[null,10],['PICKUP_CREDENTIAL_INVALID',8],['PICKUP_CREDENTIAL_INVALID',10],
    ['PICKUP_CREDENTIAL_LOCKED',9],['PICKUP_CREDENTIAL_RATE_LIMITED',9]]){
    const session=prepared(),first=session.confirm();session.receiveResult(first.ticket,{entityId:'order',version,errorCode});
    check(session,'RESULT_PENDING');assert.equal(session.current().retryOriginalAvailable,true);
    assert.deepEqual(session.retryOriginal().request,first.request);
  }
});

test('A03 initial summary validates integer item arithmetic, subtotal and zero fee before offering confirmation',()=>{
  for(const patch of [{subtotalCents:1},{deliveryFeeCents:1},{totalCents:2400,paidCents:2400},
    {items:[{...detail().items[0],unitPriceCents:-1}]},{items:[{...detail().items[0],lineTotalCents:1}]},
    {items:[{...detail().items[0],quantity:Number.MAX_SAFE_INTEGER}]}]){
    const session=createPickupSession(options()),read=session.beginManual('order',token);session.receiveDetail(read.ticket,detail(patch));
    check(session,'READ_ERROR');assert.throws(()=>session.confirm(),code('PICKUP_RECHECK_REQUIRED'));
  }
});

test('A03 a higher order version cannot regress confirmed paid funds or a finished order observation',()=>{
  const session=prepared(),read=session.refresh();session.receiveDetail(read.ticket,
    detail({version:9,paymentStatus:'CLOSED',paidCents:0,orderStatus:'PENDING_PAYMENT'}));check(session,'READ_ERROR');
  const completed=createPickupSession(options()),first=completed.beginManual('order',token);
  completed.receiveDetail(first.ticket,detail({orderStatus:'COMPLETED',completedAt:startAt}));
  const later=completed.refresh();completed.receiveDetail(later.ticket,detail({version:9}));check(completed,'READ_ERROR');
});

test('A03 disposal erases volatile recovery and old operator responses cannot enter another account/store session',()=>{
  const session=prepared(),first=session.confirm(),closed=session.destroy();assert.equal(closed.summary,null);assert.equal(closed.resultPending,false);
  for(const work of [()=>session.current(),()=>session.retryOriginal(),()=>session.receiveResult(first.ticket,{})])
    assert.throws(work,code('PICKUP_SESSION_CLOSED'));
  const next=createPickupSession(options({subjectId:'different',storeId:'different'})),read=next.beginManual('order',token);
  next.receiveDetail(read.ticket,detail());check(next,'READ_ERROR');
});

test('A03 equal local generation numbers in separate sessions cannot accept each other callbacks or cloned tickets',()=>{
  const old=createPickupSession(options()),next=createPickupSession(options({subjectId:'different'}));
  const prior=old.beginManual('order',token),current=next.beginManual('order',other);
  assert.equal(prior.ticket.generation,current.ticket.generation);
  assert.equal(next.receiveDetail(prior.ticket,detail()),false);assert.equal(next.receiveDetail(clone(current.ticket),detail()),false);
  assert.equal(next.receiveDetail(current.ticket,detail()),true);check(next,'AWAITING_CONFIRMATION');
  old.receiveDetail(prior.ticket,detail());const a=old.confirm(),b=next.confirm();
  assert.equal(next.receiveResult(a.ticket,{entityId:'order',version:9,errorCode:null}),false);
  assert.equal(next.receiveResult(b.ticket,{entityId:'order',version:9,errorCode:null}),true);
});

test('A03 maximum safe version cannot generate an overflowing command and readiness never survives a lifecycle regression',()=>{
  const session=createPickupSession(options()),read=session.beginManual('order',token);
  session.receiveDetail(read.ticket,detail({version:Number.MAX_SAFE_INTEGER}));assert.throws(()=>session.confirm(),code('PICKUP_RECHECK_REQUIRED'));
  const next=prepared(),refresh=next.refresh();next.receiveDetail(refresh.ticket,detail({version:9,orderStatus:'MAKING'}));check(next,'READ_ERROR');
});

test('A03 all public rehearsal flags stay closed and the real cloud client rejects both planned admin actions without platform calls',async()=>{
  let calls=0;const client=createClient({mode:'cloud',stage:'test',cloudEnvironments:{test:'OFFLINE_TEST'}},
    ()=>({cloud:{init(){calls++;},callFunction(){calls++;}}}),{warn(){}});
  const session=prepared(),request=session.confirm();
  for(const value of [pickupAvailability(),session.current(),request])for(const field of
    ['connected','callable','confirmationAllowed','fulfillmentAllowed','successFeedbackAllowed'])assert.equal(value[field],false);
  for(const action of ['order.get','order.transition'])await assert.rejects(()=>client.call('admin',action,{}),code('INVALID_REQUEST'));
  assert.equal(calls,0);
});

async function integration(){
  const s=await setup();for(const command of ['ACCEPT','START_MAKING','MARK_READY'])await s.merchantService.execute(s.event(command),s.primary);
  const issued=await s.pickupService.get({action:'pickupCredential.get',payload:{orderId:s.orderId}},s.owner);
  const session=createPickupSession(options({storeId:s.storeId,subjectId:s.primary.subjectId}));
  // Test-only protocol shape projection. No runtime adapter strips offline gates.
  async function read(plan){const {scope,cloudVerified,callable,operationsAllowed,...dto}=await s.readService.execute(plan.request.event,s.primary);
    assert.equal(scope,'OFFLINE_MERCHANT_ORDER_DETAIL');return dto;}
  return {...s,session,issued,read};
}

test('A03 rehearsal integrates A01/A02/O07: confirmation, lost response, same-key replay and completed detail without double resource consumption',async()=>{
  const s=await integration(),read=s.session.beginManual(s.orderId,s.issued.credential.value);
  s.session.receiveDetail(read.ticket,await s.read(read));check(s.session,'AWAITING_CONFIRMATION');
  const first=s.session.confirm(),before=JSON.stringify([s.db.stocks,s.db.slots,s.db.reservations]);
  const completed=await s.merchantService.execute(first.request.event,s.primary);assert.equal(completed.disposition,'COMPLETED');
  s.session.failed(first.ticket);const retry=s.session.retryOriginal(),replay=await s.merchantService.execute(retry.request.event,s.primary);
  assert.equal(replay.disposition,'REPLAY');s.session.receiveResult(retry.ticket,replay.result);
  const final=s.session.refresh();s.session.receiveDetail(final.ticket,await s.read(final));check(s.session,'COMPLETION_REPORTED');
  assert.equal(JSON.stringify([s.db.stocks,s.db.slots,s.db.reservations]),before);assert.equal(s.session.current().fulfillmentAllowed,false);
});

test('A03 rehearsal integrates wrong-code committed counter, refresh/version change and original failed receipt replay',async()=>{
  const s=await integration(),read=s.session.beginManual(s.orderId,other);s.session.receiveDetail(read.ticket,await s.read(read));
  const first=s.session.confirm(),rejected=await s.merchantService.execute(first.request.event,s.primary);
  assert.equal(rejected.result.errorCode,'PICKUP_CREDENTIAL_INVALID');s.session.failed(first.ticket);
  const retry=s.session.retryOriginal(),replay=await s.merchantService.execute(retry.request.event,s.primary);
  assert.equal(replay.disposition,'REPLAY');assert.equal(s.db.orders[s.orderId].pickupCredential.failedAttempts,1);
  s.session.receiveResult(retry.ticket,replay.result);check(s.session,'INPUT_REQUIRED');
  const refresh=s.session.refresh();s.session.receiveDetail(refresh.ticket,await s.read(refresh));
  s.controls.now+=1000;const newRead=s.session.beginManual(s.orderId,s.issued.credential.value);s.session.receiveDetail(newRead.ticket,await s.read(newRead));
  const correct=s.session.confirm();assert.notEqual(correct.request.event.payload.idempotencyKey,first.request.event.payload.idempotencyKey);
  assert.equal((await s.merchantService.execute(correct.request.event,s.primary)).disposition,'COMPLETED');
});

test('A03 rehearsal server rejects revocation after confirmation; client failure cannot overwrite role or report success',async()=>{
  const s=await integration(),read=s.session.beginManual(s.orderId,s.issued.credential.value);s.session.receiveDetail(read.ticket,await s.read(read));
  const first=s.session.confirm();await s.adminService.execute({action:'role.revoke',payload:{roleId:s.rootRoleId,expectedVersion:0,
    reason:'隔离撤销测试',idempotencyKey:'OFFLINE_PICKUP_REVOKE_KEY'}},s.secondary);
  const before=JSON.stringify(s.db);await assert.rejects(()=>s.merchantService.execute(first.request.event,s.primary),code('FORBIDDEN'));
  s.session.failed(first.ticket);assert.equal(JSON.stringify(s.db),before);check(s.session,'RESULT_PENDING');assert.equal(s.session.current().successFeedbackAllowed,false);
});
