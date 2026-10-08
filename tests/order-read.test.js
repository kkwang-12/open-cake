'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {setup}=require('./fixtures/order-read');
const {clone}=require('./fixtures/quote');
const {createOrderReadModel}=require('../cloudfunctions/_shared/order-read-model');
const {PAGE_POLICY}=require('../cloudfunctions/_shared/pagination-model');
const list=(payload={})=>({action:'list',payload}),get=order=>({action:'get',payload:{orderId:typeof order==='string'?order:order._id}});
const code=(fn,expected)=>assert.throws(fn,error=>error.code===expected);
const rejects=(fn,expected)=>assert.rejects(async()=>fn(),error=>error.code===expected);
const read=(s,event)=>s.model()[event.action](event,s.controls.now);
const ids=page=>page.items.map(item=>item.orderId);
const privateValues=['PRIVATE_MEDIA','PRIVATE_RAW_MESSAGE','PRIVATE_TRACE','PRIVATE_EVENT','PRIVATE_ACTOR','PRIVATE_REASON','PRIVATE_ITEM','PRIVATE_CANCEL_REASON'];
function request(s,order,status='PENDING',extra={}) {
  const value={_id:'review-'+order._id,schemaVersion:1,version:0,createdAt:order.updatedAt,updatedAt:order.updatedAt,
    orderId:order._id,ownerId:order.ownerId,status,reviewedAt:null,approvedRefundCents:null,
    reviewerId:'PRIVATE_REVIEWER',reason:'PRIVATE_REQUEST_REASON',reviewReason:'PRIVATE_REVIEW_REASON',refundId:'PRIVATE_REFUND_ID',...extra};
  s.records.cancellations.push(value);return value;
}

test('O06 all eight states classify CURRENT/PAST and exact state views without mixing refund lifecycle',async()=>{
  const s=await setup();for(const status of ['PENDING_PAYMENT','PAID','ACCEPTED','MAKING','READY','COMPLETED','CANCELLED'])s.add(status);
  const delivering=s.add('DELIVERING',{fulfillment:'DELIVERY'});
  s.append(delivering,'REFUND_SETTLED',{refundStatus:'SUCCEEDED',refundedCents:500});
  const all=read(s,list());assert.equal(all.items.length,8);
  for(const view of ['ACTIVE','CURRENT'])assert.equal(read(s,list({view})).items.length,6);
  assert.equal(read(s,list({view:'PAST'})).items.length,2);
  for(const status of ['COMPLETED','CANCELLED'])assert.deepEqual(read(s,list({view:status})).items.map(item=>item.orderStatus),[status]);
  assert.deepEqual(read(s,list({status:'MAKING'})).items.map(item=>item.orderStatus),['MAKING']);
  assert.equal(read(s,list({view:'PAST',status:'PAID'})).items.length,0);
  const refunded=read(s,get(delivering));assert.equal(refunded.group,'CURRENT');assert.equal(refunded.statusLabel,'配送中');
  assert.equal(refunded.refundSummary.label,'部分退款已完成');assert.equal(refunded.refundSummary.completedExtent,'PARTIAL');
});

test('O06 paid is awaiting acceptance, accepted is not making, and refund summaries preserve actual fulfillment',async()=>{
  const s=await setup(),paid=s.add('PAID'),accepted=s.add('ACCEPTED'),made=s.add('MAKING'),completed=s.add('COMPLETED');
  assert.equal(read(s,get(paid)).statusLabel,'待门店接单');assert.equal(read(s,get(accepted)).statusLabel,'门店已接单');
  assert.equal(read(s,get(made)).statusLabel,'制作中');
  for(const [status,refunded,reserved,label] of [['PENDING',500,400,'退款处理中'],['FAILED',500,400,'退款待核实'],
    ['SUCCEEDED',completed.totalCents,0,'全额退款已完成']]) {
    s.append(completed,'REFUND_UPDATE',{refundStatus:status,refundedCents:refunded,refundReservedCents:reserved});
    const detail=read(s,get(completed));assert.equal(detail.statusLabel,'已完成');assert.equal(detail.group,'PAST');
    assert.equal(detail.refundSummary.label,label);assert.equal(detail.refundSummary.pendingCents,reserved);
  }
});

test('O06 stable descending pagination has no duplicates/missing equal timestamps and cursor anchors visible last row',async()=>{
  const s=await setup(),time=s.controls.now-500;for(const id of ['a','d','c','b','e'])s.add('PAID',{id,createdAt:time});
  const first=read(s,list({pageSize:2}));assert.deepEqual(ids(first),['e','d']);assert.equal(first.hasMore,true);
  const body=JSON.parse(Buffer.from(first.nextCursor.split('.')[0],'base64url').toString());assert.deepEqual(body.last,[time,'d']);
  const second=read(s,list({pageSize:1,cursor:first.nextCursor})),third=read(s,list({pageSize:50,cursor:second.nextCursor}));
  assert.deepEqual([...ids(first),...ids(second),...ids(third)],['e','d','c','b','a']);assert.equal(third.nextCursor,null);
  assert.equal(third.hasMore,false);assert(!JSON.stringify(body).includes(s.principal.subjectId));
});

test('O06 cursor rejects changed owner/environment/query/tampering/expiry; ACTIVE and CURRENT normalize consistently',async()=>{
  const s=await setup();s.add('PAID');s.add('PAID');const page=read(s,list({view:'ACTIVE',pageSize:1})),cursor=page.nextCursor;
  assert.equal(read(s,list({view:'CURRENT',cursor})).items.length,1);
  for(const payload of [{view:'PAST',cursor},{view:'CURRENT',status:'PAID',cursor},{view:'CURRENT',cursor:cursor+'x'}])
    code(()=>read(s,list(payload)),'CURSOR_INVALID');
  const other=s.actor('B');const otherUser={...s.records.user,_id:other.subjectId};
  const foreign=createOrderReadModel({...clone(s.records),user:otherUser},other,s.context,s.key);
  code(()=>foreign.list(list({view:'CURRENT',cursor}),s.controls.now),'CURSOR_INVALID');
  s.controls.now+=PAGE_POLICY.cursorTtlMs;
  code(()=>read(s,list({view:'CURRENT',cursor})),'CURSOR_EXPIRED');
  code(()=>createOrderReadModel(s.records,s.principal,{...s.context,environment:'foreign'},s.key),'INVALID_CONFIGURATION');
});

test('O06 fresh snapshots allow newer orders only on refresh and explain mutable state filters without claiming snapshot isolation',async()=>{
  const s=await setup(),older=s.add('PAID',{id:'a',createdAt:s.controls.now-500}),middle=s.add('PAID',{id:'b',createdAt:s.controls.now-400});
  s.add('PAID',{id:'c',createdAt:s.controls.now-300});
  const first=read(s,list({pageSize:1}));s.add('PAID',{id:'new',createdAt:s.controls.now-100});
  const rest=read(s,list({pageSize:50,cursor:first.nextCursor}));assert.deepEqual(ids(rest),[middle._id,older._id]);
  assert.equal(ids(read(s,list()))[0],'new');
});

test('O06 unknown and another owner order share NOT_FOUND; foreign children and forged principal never leak',async()=>{
  const s=await setup(),own=s.add('PAID'),foreign=s.add('PAID',{ownerId:s.actor('B').subjectId});
  code(()=>read(s,get(foreign)),'NOT_FOUND');code(()=>read(s,get('unknown-order')),'NOT_FOUND');
  assert.deepEqual(ids(read(s,list())),[own._id]);
  code(()=>createOrderReadModel(s.records,{...s.principal},s.context,s.key),'AUTH_REQUIRED');
  const detail=read(s,get(own));assert.equal(detail.items.length,1);assert(!JSON.stringify(detail).includes(foreign._id));
});

test('O06 detail keeps historical product/price/options/message/store/address after current data changes',async()=>{
  const s=await setup(),order=s.add('PAID',{fulfillment:'DELIVERY'}),model=s.model(),detail=model.get(get(order),s.controls.now);
  s.tx.db.catalogs[0].product.name='changed current catalog';s.tx.db.catalogs[0].skus[0].unitPriceCents=1;
  s.tx.db.stores[s.tx.storeId].name='changed current store';Object.values(s.tx.db.addresses)[0].detail='changed current address';
  assert.deepEqual(read(s,get(order)),detail);assert.equal(detail.address.detail,'仅离线门牌');
  assert.equal(detail.items[0].unitPriceCents,1000);assert.equal(detail.items[0].cakeMessage,'测试留言');
  assert.equal(detail.appointment.windowNature,'ESTIMATED');assert.equal(detail.store.name,'OFFLINE_TEST_ONLY');
  s.records.items[0].productName='mutated after snapshot';assert.deepEqual(model.get(get(order),s.controls.now),detail);
});

test('O06 public list/detail project whitelists and never expose internal identity/resources/evidence/credentials or raw logs',async()=>{
  const s=await setup(),order=s.add('PAID',{fulfillment:'DELIVERY'});
  order.pickupCredential={digest:'PRIVATE_DIGEST'};order.internalNote='PRIVATE_INTERNAL';
  request(s,order);
  const page=read(s,list()),detail=read(s,get(order)),json=JSON.stringify({page,detail});
  for(const value of [...privateValues,'PRIVATE_DIGEST','PRIVATE_INTERNAL','PRIVATE_REVIEWER','PRIVATE_REQUEST_REASON',
    'PRIVATE_REVIEW_REASON','PRIVATE_REFUND_ID'])assert(!json.includes(value),value);
  for(const field of ['ownerId','quoteId','cartSelectionSnapshot','cartRemovalSnapshot','deliverySnapshot','tradePolicyVersion'])assert(!Object.hasOwn(detail,field));
  assert(!Object.hasOwn(detail.items[0],'productVersion'));assert(!Object.hasOwn(detail.address.location,'verifiedAt'));
  assert(!Object.hasOwn(page.items[0],'contact'));assert(!Object.hasOwn(page.items[0],'address'));assert(!Object.hasOwn(page.items[0],'orderNote'));
  assert.equal(detail.timeline[0].message,'订单已创建，待付款');assert(Object.isFrozen(detail.items[0].selectedOptions));
});

test('O06 historical media reads exact retired revision; missing/changed/unapproved assets preserve layout data with null image',async()=>{
  const s=await setup(),order=s.add('PAID');s.asset.status='RETIRED';
  assert.deepEqual(read(s,get(order)).items[0].productImage,s.ref);
  s.records.mediaAssets.push({...clone(s.asset),assetId:s.ref.assetId,revision:'v2',storageRef:'cloud://offline-order-read/photos/v2.png'});
  assert.deepEqual(read(s,get(order)).items[0].productImage,s.ref);
  for(const mutate of [()=>s.asset.status='DRAFT',()=>s.asset.storageRef='cloud://foreign/photos/v1.png',()=>s.records.mediaAssets=[]]) {
    mutate();const detail=read(s,get(order));assert.equal(detail.items[0].productImage,null);
    assert.equal(detail.items[0].productName,'历史蛋糕 '+order._id);assert.equal(detail.totalCents,order.totalCents);
  }
});

test('O06 customer actions are status/mode/time aware, all remain disabled until real services connect',async()=>{
  const s=await setup(),pending=s.add(),paid=s.add('PAID'),ready=s.add('READY'),delivery=s.add('DELIVERING',{fulfillment:'DELIVERY'});
  assert.deepEqual(read(s,get(pending)).availableActions.map(action=>action.action),['payment.create','order.cancelUnpaid']);
  assert.deepEqual(read(s,get(paid)).availableActions.map(action=>action.action),['order.cancellation.request']);
  assert(read(s,get(ready)).availableActions.some(action=>action.action==='order.pickupCredential.get'&&action.blockedReason==='CONFIGURATION_REQUIRED'));
  assert(read(s,get(delivery)).availableActions.some(action=>action.action==='order.delivery.confirm'));
  for(const order of [pending,paid,ready,delivery])assert(read(s,get(order)).availableActions.every(action=>action.enabled===false));
  s.controls.now=pending.paymentDeadlineAt;
  assert.deepEqual(read(s,get(pending)).availableActions.map(action=>action.action),['order.cancelUnpaid']);
  assert.equal(read(s,get(pending)).orderStatus,'PENDING_PAYMENT');
  const completed=s.add('COMPLETED'),cancelled=s.add('CANCELLED');
  assert.equal(read(s,get(completed)).availableActions.length,0);assert.equal(read(s,get(cancelled)).availableActions.length,0);
});

test('O06 unresolved payment and pending cancellation block matching actions without claiming success',async()=>{
  const s=await setup(),pending=s.add(),paid=s.add('PAID');
  s.append(pending,'PAYMENT_INTENT_CREATED',{paymentStatus:'PENDING'});
  request(s,paid);
  assert(read(s,get(pending)).availableActions.every(action=>action.blockedReason==='PAYMENT_PENDING'));
  const detail=read(s,get(paid));assert.equal(detail.cancellationSummary.status,'PENDING');assert.equal(detail.orderStatus,'PAID');
  assert.equal(detail.availableActions[0].blockedReason,'CANCELLATION_PENDING');
});

test('O06 unsupported historical policy remains readable but offers no mutation actions',async()=>{
  const s=await setup(),order=s.add('PAID');order.tradePolicyVersion='historical-unsupported';
  const detail=read(s,get(order));assert.equal(detail.statusLabel,'待门店接单');assert.deepEqual(detail.availableActions,[]);
});

test('O06 timelines follow committed version even at equal times, validate complete chain/final axes and expose fixed messages',async()=>{
  const s=await setup(),order=s.add('MAKING');
  const logs=s.records.logs.filter(log=>log.orderId===order._id);
  logs.forEach(log=>{log.createdAt=order.createdAt;log.updatedAt=order.createdAt;});s.records.logs.reverse();
  const detail=read(s,get(order));assert.deepEqual(detail.timeline.map(log=>log.version),[0,1,2,3]);
  assert.equal(detail.timeline[3].message,'商品制作中');
  s.records.logs.pop();code(()=>read(s,get(order)),'INVALID_ORDER_READ_STATE');
});

test('O06 malformed log chain/command/time/last state never returns a misleading progress timeline',async()=>{
  for(const mutate of [s=>s.records.logs[1].before.version=99,s=>s.records.logs[3].after.orderStatus='ACCEPTED',
    s=>s.records.logs[2].command='START_MAKING',s=>s.records.logs[1].createdAt=s.records.logs[0].createdAt-1,
    s=>s.records.logs[0].after.orderStatus='PAID']) {
    const s=await setup(),order=s.add('MAKING');mutate(s);code(()=>read(s,get(order)),'INVALID_ORDER_READ_STATE');
  }
});

test('O06 incomplete/out-of-order historical items, inconsistent amounts/lifecycle and duplicate pending reviews fail closed',async()=>{
  for(const [mutate,errorCode] of [[s=>s.records.items=[], 'INVALID_ORDER_READ_STATE'],
    [s=>s.records.items[0].position=1,'INVALID_ORDER_READ_STATE'],
    [s=>s.records.items[0].lineTotalCents++,'ORDER_AMOUNTS_MISMATCH'],
    [s=>s.records.orders[0].subtotalCents++,'ORDER_AMOUNTS_MISMATCH'],
    [s=>s.records.orders[0].paidAt=null,'INVALID_ORDER_READ_STATE'],
    [s=>s.records.orders[0].updatedAt=s.controls.now+1,'INVALID_ORDER_READ_STATE'],
    [s=>{request(s,s.records.orders[0]);request(s,s.records.orders[0],'PENDING',{_id:'another-review'});},'INVALID_ORDER_READ_STATE']]) {
    const s=await setup(),order=s.add('PAID');mutate(s);code(()=>read(s,get(order)),errorCode);
  }
});

test('O06 strict API inputs reject forged owner/skip/sort/invalid group and enforce default20/max50',async()=>{
  const s=await setup();for(let i=0;i<55;i++)s.add('PAID');
  assert.equal(read(s,list()).items.length,20);assert.equal(read(s,list({pageSize:50})).items.length,50);
  for(const payload of [{ownerId:'other'},{skip:20},{sort:'phone'},{view:'REFUNDED'},{pageSize:51},{status:'ACTIVE'}])
    code(()=>read(s,list(payload)),'INVALID_REQUEST');
  code(()=>read(s,{action:'get',payload:{orderId:s.records.orders[0]._id,ownerId:'other'}}),'INVALID_REQUEST');
  const empty=await setup();assert.deepEqual(ids(read(empty,list())),[]);assert.equal(read(empty,list()).nextCursor,null);
});

test('O06 read service applies whole owner AND seek/state query and reads detail with owner from trusted identity',async()=>{
  const s=await setup(),time=s.controls.now-500;for(const id of ['a','b','c'])s.add('PAID',{id,createdAt:time});
  s.add('PAID',{id:'foreign',ownerId:s.actor('B').subjectId,createdAt:time-1});
  const first=await s.service.execute(list({view:'ACTIVE',pageSize:1}),s.principal),second=await s.service.execute(list({view:'ACTIVE',pageSize:1,cursor:first.nextCursor}),s.principal);
  assert.deepEqual([...ids(first),...ids(second)],['c','b']);
  const query=s.controls.queries[1];assert.equal(query.ownerId,s.principal.subjectId);assert.equal(query.limit,2);
  assert.equal(query.requiresWholeSeekAndOwnerFilter,true);assert.equal(query.seek.length,2);
  await rejects(()=>s.service.execute(get('foreign'),s.principal),'NOT_FOUND');
  await rejects(()=>s.service.execute(get('unknown'),s.principal),'NOT_FOUND');
  assert.equal((await s.service.execute(get('a'),s.principal)).orderId,'a');assert.equal(s.controls.writes,0);
});

test('O06 every page rechecks current user and read fence prevents revocation/mid-read mixed state exposure',async()=>{
  const s=await setup();s.add('PAID');s.add('PAID');
  const page=await s.service.execute(list({pageSize:1}),s.principal);
  s.records.user.status='DISABLED';await rejects(()=>s.service.execute(list({cursor:page.nextCursor}),s.principal),'USER_DISABLED');
  s.records.user.status='ACTIVE';s.controls.beforeFence=records=>records.user.version++;
  await rejects(()=>s.service.execute(list(),s.principal),'VERSION_CONFLICT');
  const t=await setup();t.add('PAID');t.controls.denyFence=true;
  await rejects(()=>t.service.execute(get(t.records.orders[0]),t.principal),'VERSION_CONFLICT');
});

test('O06 read adapter returning foreign or excess page records fails closed',async()=>{
  const s=await setup();s.add('PAID');const foreign=s.add('PAID',{ownerId:s.actor('B').subjectId});
  s.controls.badPage={orders:[foreign],items:[],logs:[],cancellations:[],mediaAssets:[]};
  await rejects(()=>s.service.execute(list(),s.principal),'INVALID_ORDER_READ_STATE');
  const t=await setup();for(let i=0;i<4;i++)t.add('PAID');
  t.controls.badPage={orders:t.records.orders,items:t.records.items,logs:t.records.logs,cancellations:[],mediaAssets:t.records.mediaAssets};
  await rejects(()=>t.service.execute(list({pageSize:1}),t.principal),'INVALID_ORDER_READ_STATE');
});

test('O06 captured signing key and snapshot cannot be changed by callers; outputs are immutable without any writes',async()=>{
  const s=await setup();s.add('PAID');s.add('PAID');const before=JSON.stringify(s.records),model=s.model();
  const first=model.list(list({pageSize:1}),s.controls.now);s.key.secret.fill(0);
  assert.equal(model.list(list({cursor:first.nextCursor}),s.controls.now).items.length,1);
  assert.equal(JSON.stringify(s.records),before);assert(Object.isFrozen(first.items[0].refundSummary));
  code(()=>createOrderReadModel(s.records,s.principal,s.context,{id:'short',secret:Buffer.alloc(8)}),'INVALID_CONFIGURATION');
  code(()=>s.model().list(list(),0),'INVALID_CONFIGURATION');
});

test('O06 actual O03 creation and O05 cancellation records produce consistent immutable detail timelines',async()=>{
  const s=await setup(),orders=Object.values(s.tx.db.orders),order=orders.find(value=>value.fulfillment==='PICKUP');
  const records=()=>({user:s.tx.db.users[s.principal.subjectId],orders:Object.values(s.tx.db.orders),
    items:Object.values(s.tx.db.items),logs:Object.values(s.tx.db.logs),cancellations:[],mediaAssets:[]});
  const before=createOrderReadModel(records(),s.principal,s.context,s.key).get(get(order),s.controls.now);
  assert.equal(before.orderStatus,'PENDING_PAYMENT');assert.equal(before.timeline.length,1);
  await s.tx.cancellationService.cancelUnpaid({action:'cancelUnpaid',payload:{orderId:order._id,expectedVersion:0,
    reason:'offline cancel',idempotencyKey:'offline-read-cancel-key'}},s.principal);
  const after=createOrderReadModel(records(),s.principal,s.context,s.key).get(get(order),s.controls.now);
  assert.equal(after.orderStatus,'CANCELLED');assert.equal(after.timeline.length,2);assert.deepEqual(after.items,before.items);
  assert.equal(after.timeline[1].message,'未付款订单已取消');
});

test('O06 records created during a read use the refreshed server clock; clock rollback is rejected',async()=>{
  const s=await setup(),order=s.add('PAID',{createdAt:s.controls.now+10});s.controls.readDelay=20;
  assert.equal((await s.service.execute(list(),s.principal)).items[0].orderId,order._id);
  s.controls.readDelay=-1;await rejects(()=>s.service.execute(list(),s.principal),'INVALID_CONFIGURATION');
});
