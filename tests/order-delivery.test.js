'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {setup}=require('./fixtures/order-delivery');
const {setup:pickupSetup}=require('./fixtures/order-pickup');
const {clone}=require('./fixtures/quote');
const {createOrderDeliveryService}=require('../cloudfunctions/_shared/order-delivery-service');
const {createOrderReadModel}=require('../cloudfunctions/_shared/order-read-model');
const {deliverySupportFor}=require('../cloudfunctions/_shared/delivery-support-model');
const rejects=(fn,code)=>assert.rejects(async()=>fn(),error=>error.code===code);
const order=s=>s.db.orders[s.orderId];
const resourceSnapshot=s=>JSON.stringify([s.db.stocks,s.db.slots,s.db.reservations]);
const start=s=>s.deliveryService.execute('admin',s.event('START_DELIVERY'),s.merchant);
const read=s=>createOrderReadModel(s.records(),s.owner,{environment:s.owner.environment,appId:s.owner.appId,
  stage:'test',allowedCloudPrefixes:[]},{id:'OFFLINE_TEST_ONLY',secret:Buffer.alloc(32,31)})
  .get({action:'get',payload:{orderId:s.orderId}},s.controls.now);

test('O08 merchant starts delivery and owner confirms once with immutable facts/resources/payment axes',async()=>{
  const s=await setup(),facts=clone(order(s)),resources=resourceSnapshot(s);
  const started=await start(s);assert.equal(started.disposition,'DELIVERING');assert.equal(order(s).completedAt,null);
  const completed=await s.deliveryService.execute('order',s.confirm(),s.owner);
  assert.equal(completed.disposition,'COMPLETED');assert.equal(completed.callable,false);
  assert.equal(order(s).completedAt,s.controls.now);assert.equal(resourceSnapshot(s),resources);
  const excluded=['orderStatus','version','updatedAt','completedAt'];
  for(const field of Object.keys(facts).filter(key=>!excluded.includes(key)))assert.deepEqual(order(s)[field],facts[field],field);
  const logs=Object.values(s.db.logs).filter(log=>['START_DELIVERY','COMPLETE_DELIVERY'].includes(log.command));
  assert.deepEqual(logs.map(log=>log.actor.type),['STORE','CUSTOMER']);assert.equal(s.controls.lastWrites,3);
});

test('O08 current same-store merchant may confirm delivery under frozen D01 rules',async()=>{
  const s=await setup();await start(s);
  assert.equal((await s.deliveryService.execute('admin',s.event('COMPLETE_DELIVERY'),s.merchant)).disposition,'COMPLETED');
  assert.equal(Object.values(s.db.logs).find(log=>log.command==='COMPLETE_DELIVERY').actor.subjectId,s.merchant.subjectId);
});

test('O08 customer cannot start delivery; non-owner and unrelated merchant cannot confirm',async()=>{
  const s=await setup(),before=JSON.stringify(s.db);
  await rejects(()=>s.deliveryService.execute('admin',s.event('START_DELIVERY'),s.owner),'FORBIDDEN');assert.equal(JSON.stringify(s.db),before);
  await start(s);const other=s.actor('other-delivery-user');s.makeQuote({customer:other});
  const snapshot=JSON.stringify(s.db);
  await rejects(()=>s.deliveryService.execute('order',s.confirm(),other),'FORBIDDEN');assert.equal(JSON.stringify(s.db),snapshot);
});

test('O08 ownership never bypasses current merchant role on the admin entry',async()=>{
  const s=await setup();await start(s);
  await rejects(()=>s.deliveryService.execute('admin',s.event('COMPLETE_DELIVERY'),s.owner),'FORBIDDEN');
});

test('O08 cross-store, revoked and insufficient grants reject both store commands',async()=>{
  for(const command of ['START_DELIVERY','COMPLETE_DELIVERY'])for(const patch of
    [{storeIds:['other-store']},{status:'REVOKED',revokedAt:1},{capabilities:['AUDIT_READ']}]){
    const s=await setup();if(command==='COMPLETE_DELIVERY')await start(s);Object.assign(s.db.roles[s.roleId],patch);
    const before=JSON.stringify(s.db);await rejects(()=>s.deliveryService.execute('admin',s.event(command),s.merchant),'FORBIDDEN');
    assert.equal(JSON.stringify(s.db),before);
  }
});

test('O08 invalid state/fulfillment matrix never writes or consumes resources',async()=>{
  for(const command of ['START_DELIVERY','COMPLETE_DELIVERY'])for(const status of
    ['PENDING_PAYMENT','PAID','ACCEPTED','MAKING','READY','DELIVERING','COMPLETED','CANCELLED']){
    if(status===(command==='START_DELIVERY'?'READY':'DELIVERING'))continue;
    const s=await setup();order(s).orderStatus=status;
    if(status==='PENDING_PAYMENT'){order(s).paymentStatus='UNPAID';order(s).paidCents=0;}
    if(status==='COMPLETED')order(s).completedAt=order(s).updatedAt;
    if(status==='CANCELLED')order(s).cancelledAt=order(s).updatedAt;
    const before=JSON.stringify(s.db);await rejects(()=>s.deliveryService.execute('admin',s.event(command),s.merchant),'INVALID_TRANSITION');
    assert.equal(JSON.stringify(s.db),before);
  }
  const s=await setup({mode:'PICKUP'});await rejects(()=>start(s),'INVALID_TRANSITION');
  await rejects(()=>s.deliveryService.execute('order',s.confirm(),s.owner),'INVALID_TRANSITION');
});

test('O08 no client fields/identity/PAID event can change trusted facts or execute unrelated effects',async()=>{
  const s=await setup(),event=s.event('START_DELIVERY'),before=JSON.stringify(s.db);
  for(const [field,value] of Object.entries({ownerId:'other',nextStatus:'COMPLETED',role:'STORE',amountCents:1,
    addressSnapshot:{detail:'changed'},completedAt:1,expectedVersion:-1,pickupCredential:'private-code'})){
    await rejects(()=>s.deliveryService.execute('admin',{...event,payload:{...event.payload,[field]:value}},s.merchant),'INVALID_REQUEST');
  }
  await rejects(()=>s.deliveryService.execute('admin',s.event('START_MAKING'),s.merchant),'UNSUPPORTED_ORDER_COMMAND');
  await rejects(()=>s.deliveryService.execute('admin',s.event('PAYMENT_CONFIRMED'),s.merchant),'INVALID_REQUEST');
  await rejects(()=>s.deliveryService.execute('admin',event,{...s.merchant}),'AUTH_REQUIRED');assert.equal(JSON.stringify(s.db),before);
});

test('O08 completion requires explicit resource policy, while start does not guess it',async()=>{
  const s=await setup(),service=createOrderDeliveryService({...s.options,completionPolicy:null});
  assert.equal((await service.execute('admin',s.event('START_DELIVERY'),s.merchant)).disposition,'DELIVERING');
  const before=JSON.stringify(s.db);
  await rejects(()=>service.execute('order',s.confirm(),s.owner),'CONFIGURATION_REQUIRED');assert.equal(JSON.stringify(s.db),before);
  for(const policy of [{slotCompletion:'KEEP_CONFIRMED'},{version:'test',slotCompletion:'RELEASE'}])
    await rejects(()=>createOrderDeliveryService({...s.options,completionPolicy:policy}).execute('order',s.confirm(),s.owner),'CONFIGURATION_REQUIRED');
});

test('O08 lost start and confirm responses recover persisted receipts across service restart',async()=>{
  const s=await setup(),startEvent=s.event('START_DELIVERY');await s.deliveryService.execute('admin',startEvent,s.merchant);
  const service=createOrderDeliveryService(s.options),startReplay=await service.execute('admin',startEvent,s.merchant);
  assert.equal(startReplay.disposition,'REPLAY');const confirmEvent=s.confirm(),done=await service.execute('order',confirmEvent,s.owner);
  const before=JSON.stringify(s.db),retry=await createOrderDeliveryService(s.options).execute('order',confirmEvent,s.owner);
  assert.equal(retry.disposition,'REPLAY');assert.deepEqual(retry.result,done.result);assert.equal(JSON.stringify(s.db),before);
  assert.equal((await service.execute('admin',startEvent,s.merchant)).disposition,'REPLAY');
});

test('O08 same-key different input conflicts and distinct key on completed order cannot repeat completion',async()=>{
  const s=await setup();await start(s);const event=s.confirm();await s.deliveryService.execute('order',event,s.owner);
  await rejects(()=>s.deliveryService.execute('order',{...event,payload:{...event.payload,expectedVersion:order(s).version}},s.owner),'IDEMPOTENCY_KEY_REUSED');
  await rejects(()=>s.deliveryService.execute('order',s.confirm('new-key'),s.owner),'INVALID_TRANSITION');
});

test('O08 simultaneous identical requests replay, distinct actors compete for one completion',async()=>{
  const s=await setup(),event=s.event('START_DELIVERY');
  const starts=await Promise.all([s.deliveryService.execute('admin',event,s.merchant),s.deliveryService.execute('admin',event,s.merchant)]);
  assert.deepEqual(starts.map(result=>result.disposition),['DELIVERING','REPLAY']);
  const a=s.confirm(),b=s.event('COMPLETE_DELIVERY');
  const completed=await Promise.allSettled([s.deliveryService.execute('order',a,s.owner),s.deliveryService.execute('admin',b,s.merchant)]);
  assert.equal(completed.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(completed.find(r=>r.status==='rejected').reason.code,'VERSION_CONFLICT');
  assert.equal(Object.values(s.db.logs).filter(log=>log.command==='COMPLETE_DELIVERY').length,1);
});

test('O08 stale user/order versions and cross-environment principals fail closed',async()=>{
  const s=await setup();s.db.users[s.merchant.subjectId].version++;
  await rejects(()=>start(s),'VERSION_CONFLICT');
  s.db.users[s.merchant.subjectId].version--;const event=s.event('START_DELIVERY');event.payload.expectedVersion--;
  await rejects(()=>s.deliveryService.execute('admin',event,s.merchant),'VERSION_CONFLICT');
  await rejects(()=>createOrderDeliveryService({...s.options,environment:'other-env'}).execute('admin',s.event('START_DELIVERY'),s.merchant),'FORBIDDEN');
});

test('O08 replay rechecks current owner/store authority and disabled users',async()=>{
  const s=await setup(),event=s.event('START_DELIVERY');await s.deliveryService.execute('admin',event,s.merchant);
  s.db.roles[s.roleId].status='REVOKED';s.db.roles[s.roleId].revokedAt=s.controls.now;
  await rejects(()=>s.deliveryService.execute('admin',event,s.merchant),'FORBIDDEN');
  s.db.roles[s.roleId].status='ACTIVE';s.db.roles[s.roleId].revokedAt=null;
  const confirm=s.confirm();await s.deliveryService.execute('order',confirm,s.owner);s.db.users[s.owner.subjectId].status='DISABLED';
  await rejects(()=>s.deliveryService.execute('order',confirm,s.owner),'USER_DISABLED');
});

test('O08 replay requires the committed actor/transition/version/time log evidence',async()=>{
  for(const corrupt of ['missing','actor','version','axis','time','completedAt']){
    const s=await setup();await start(s);const event=s.confirm();await s.deliveryService.execute('order',event,s.owner);
    const log=Object.values(s.db.logs).find(log=>log.command==='COMPLETE_DELIVERY');
    if(corrupt==='missing')delete s.db.logs[log._id];if(corrupt==='actor')log.actor.subjectId='other';
    if(corrupt==='version')log.after.version++;if(corrupt==='axis')log.after.paidCents=0;
    if(corrupt==='time')log.createdAt=0;if(corrupt==='completedAt')order(s).completedAt--;
    await rejects(()=>s.deliveryService.execute('order',event,s.owner),'INVALID_IDEMPOTENCY_RECORD');
  }
});

test('O08 each delivery and confirmation write exception or zero-row mutation rolls back',async()=>{
  for(const command of ['START_DELIVERY','COMPLETE_DELIVERY'])for(const fault of ['failAt','zeroAt'])for(let position=1;position<=3;position++){
    const s=await setup();if(command==='COMPLETE_DELIVERY')await start(s);
    const before=JSON.stringify(s.db);s.controls[fault]=position;
    await assert.rejects(()=>s.deliveryService.execute('admin',s.event(command),s.merchant));
    assert.equal(JSON.stringify(s.db),before,command+'/'+fault+'/'+position);
  }
});

test('O08 revoked permissions/user or changed resources racing commit cannot partially write',async()=>{
  for(const mutate of ['role','user','resource','quote','fence']){
    const s=await setup(),initial=clone(order(s));
    if(mutate==='fence')s.controls.denyFence=true;
    else s.controls.beforeCommit=db=>{
      if(mutate==='role'){db.roles[s.roleId].version++;db.roles[s.roleId].status='REVOKED';}
      if(mutate==='user')db.users[s.merchant.subjectId].status='DISABLED';
      if(mutate==='resource')db.stocks[s.stockId].version++;
      if(mutate==='quote')db.quotes[order(s).quoteId].version++;
    };
    await rejects(()=>start(s),'VERSION_CONFLICT');assert.deepEqual(order(s),initial);
    assert.equal(Object.values(s.db.logs).filter(log=>log.command==='START_DELIVERY').length,0);
  }
});

test('O08 inconsistent resource proof blocks start and finish; pickup and delivery share validation',async()=>{
  for(const command of ['START_DELIVERY','COMPLETE_DELIVERY'])for(const corrupt of ['missing','held','count','scope','mode','quote','slot-id']){
    const s=await setup();if(command==='COMPLETE_DELIVERY')await start(s);
    const stock=Object.values(s.db.reservations).find(r=>r.resourceKind==='STOCK'),slot=Object.values(s.db.slots).find(r=>r.fulfillment==='DELIVERY');
    if(corrupt==='missing')delete s.db.reservations[stock._id];if(corrupt==='held')stock.status='HELD';
    if(corrupt==='count')s.db.stocks[stock.resourceId].consumedUnits=0;if(corrupt==='scope')slot.storeId='other';
    if(corrupt==='mode')slot.fulfillment='PICKUP';if(corrupt==='quote')s.db.quotes[order(s).quoteId].facts.fulfillment='PICKUP';
    if(corrupt==='slot-id')order(s).appointmentSnapshot.slotId='different-slot';
    const before=JSON.stringify(s.db);await rejects(()=>s.deliveryService.execute('admin',s.event(command),s.merchant),'INVALID_FULFILLMENT_RESOURCES');
    assert.equal(JSON.stringify(s.db),before);
  }
});

test('O08 final server clock cannot move backwards or precede the persisted record',async()=>{
  const s=await setup(),before=JSON.stringify(s.db),time=s.controls.now;s.controls.nowSequence=[time,time-1];
  await rejects(()=>start(s),'INVALID_TRADE_MODEL');assert.equal(JSON.stringify(s.db),before);
});

test('O08 cancelled orders and stale cancellation races cannot start or finish delivery',async()=>{
  for(const command of ['START_DELIVERY','COMPLETE_DELIVERY']){
    const s=await setup();if(command==='COMPLETE_DELIVERY')await start(s);const event=s.event(command);
    // Test-only representation of the committed result of a future paid approval executor.
    s.append('APPROVE_CANCELLATION',{orderStatus:'CANCELLED',cancelledAt:order(s).updatedAt+1,cancellationReason:'OFFLINE_TEST_ONLY'});
    s.controls.now=Math.max(s.controls.now,order(s).updatedAt);
    const before=JSON.stringify(s.db);await rejects(()=>s.deliveryService.execute('admin',event,s.merchant),'VERSION_CONFLICT');
    await rejects(()=>s.deliveryService.execute('admin',s.event(command,'current-cancelled'),s.merchant),'INVALID_TRANSITION');
    assert.equal(JSON.stringify(s.db),before);
  }
});

test('O08 paid cancellation remains a coordination intent; it does not silently complete delivery',async()=>{
  const s=await setup();await start(s);const before=JSON.stringify(s.db);
  await rejects(()=>s.cancellationService.cancelUnpaid({action:'cancelUnpaid',payload:{orderId:s.orderId,
    expectedVersion:order(s).version,reason:'OFFLINE_TEST_ONLY',idempotencyKey:'OFFLINE_CANCEL_PAID_ORDER'}},s.owner),'INVALID_TRANSITION');
  assert.equal(JSON.stringify(s.db),before);
});

test('O08 cancellation committed during delivery work rejects the stale transaction, historical start replay stays read-only',async()=>{
  const s=await setup(),event=s.event('START_DELIVERY');
  await s.deliveryService.execute('admin',event,s.merchant);
  const confirm=s.confirm(),beforeResources=resourceSnapshot(s);
  s.controls.beforeCommit=()=>{
    // Only inject the competing order/log commit. Not a paid-approval/refund executor.
    s.append('APPROVE_CANCELLATION',{orderStatus:'CANCELLED',cancelledAt:order(s).updatedAt+1,cancellationReason:'OFFLINE_TEST_ONLY'});
  };
  await rejects(()=>s.deliveryService.execute('order',confirm,s.owner),'VERSION_CONFLICT');
  assert.equal(order(s).orderStatus,'CANCELLED');assert.equal(order(s).completedAt,null);
  assert.equal(resourceSnapshot(s),beforeResources);s.controls.beforeCommit=null;
  s.controls.now=Math.max(s.controls.now,order(s).updatedAt);const snapshot=JSON.stringify(s.db);
  assert.equal((await s.deliveryService.execute('admin',event,s.merchant)).disposition,'REPLAY');
  assert.equal(JSON.stringify(s.db),snapshot);
});

test('O08 refund progress remains independent of delivery completion and does not alter held refund budget',async()=>{
  const s=await setup();await start(s);
  s.append('REFUND_INTENT_CREATED',{refundStatus:'PENDING',refundReservedCents:500});
  s.controls.now=Math.max(s.controls.now,order(s).updatedAt);
  await s.deliveryService.execute('order',s.confirm(),s.owner);
  assert.equal(order(s).refundStatus,'PENDING');assert.equal(order(s).refundReservedCents,500);
  assert.equal(read(s).refundSummary.pendingCents,500);assert.equal(read(s).group,'PAST');
});

test('O08 inconsistent payment timestamp, completion timestamp or pickup credential is rejected before writing',async()=>{
  for(const patch of [{paidAt:null},{completedAt:1},{pickupCredential:{digest:'private'}}]){
    const s=await setup();Object.assign(order(s),patch);const before=JSON.stringify(s.db);
    await rejects(()=>start(s),'INVALID_TRADE_MODEL');assert.equal(JSON.stringify(s.db),before);
  }
});

test('O08 delivery detail uses history, estimated window and real snapshot contact hint without promising minutes',async()=>{
  const s=await setup();await start(s);const detail=read(s);
  assert.equal(detail.timeline.at(-1).message,'门店配送中');assert.equal(detail.appointment.windowNature,'ESTIMATED');
  assert.equal(detail.deliverySupport.provider,'STORE');assert.equal(detail.deliverySupport.contact.phone,order(s).storeSnapshot.phone);
  assert.equal(detail.deliverySupport.contact.enabled,false);assert.equal(detail.deliverySupport.contact.blockedReason,'SERVICE_NOT_CONNECTED');
  assert.ok(detail.availableActions.some(action=>action.action==='order.delivery.confirm'&&!action.enabled));
  await s.deliveryService.execute('order',s.confirm(),s.owner);const done=read(s);
  assert.equal(done.group,'PAST');assert.equal(done.timeline.at(-1).message,'已确认收货');assert.equal(done.availableActions.length,0);
  assert.equal(done.timeline.length,7);
});

test('O08 missing contact remains unavailable, no fake phone or invented failed-delivery state',()=>{
  for(const phone of [null,undefined,'','   ']){
    const hint=deliverySupportFor({fulfillment:'DELIVERY',storeSnapshot:{phone}});
    assert.equal(hint.contact.phone,null);assert.equal(hint.contact.blockedReason,'CONFIGURATION_REQUIRED');assert.equal(hint.contact.enabled,false);
  }
  assert.equal(deliverySupportFor({fulfillment:'PICKUP'}),null);
});

test('O08 transition logs and receipts exclude personal reason and have no unsealed draft effects',async()=>{
  const s=await setup(),event=s.event('START_DELIVERY');event.payload.reason='PRIVATE_RAW_PHONE_13800000000';
  await s.deliveryService.execute('admin',event,s.merchant);
  const log=Object.values(s.db.logs).find(log=>log.command==='START_DELIVERY');
  assert.equal(log.reason,'');assert.equal(log.requiresFinalAfter,undefined);assert.equal(log.before.orderStatus,'READY');
  const receipts=Object.values(s.db.receipts).filter(r=>r.command==='admin.order.transition');
  assert.ok(!JSON.stringify([log,receipts]).includes(event.payload.reason));
  assert.deepEqual(Object.keys(receipts[0].result).sort(),['entityId','errorCode','version']);
});

test('O08 both fulfillment chains integrate O03 history/O06 details without enabling production',async()=>{
  const p=await pickupSetup(),value=(await p.pickupService.get(p.getEvent,p.principal)).credential.value;
  await p.pickupService.complete(p.completeEvent(value),p.merchant);
  const detail=createOrderReadModel(p.records(),p.principal,{environment:p.principal.environment,appId:p.principal.appId,
    stage:'test',allowedCloudPrefixes:[]},{id:'OFFLINE_TEST_ONLY',secret:Buffer.alloc(32,31)})
    .get({action:'get',payload:{orderId:p.orderId}},p.controls.now);
  assert.equal(detail.deliverySupport,null);assert.equal(detail.timeline.at(-1).message,'已完成自取');assert.equal(detail.cloudVerified,false);
  const d=await setup();await start(d);await d.deliveryService.execute('order',d.confirm(),d.owner);
  assert.equal(read(d).timeline.at(-1).message,'已确认收货');assert.equal(read(d).cloudVerified,false);
});
