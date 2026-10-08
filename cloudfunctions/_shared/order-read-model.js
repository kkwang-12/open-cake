'use strict';
// Finite consistent server snapshot, not a cloud query or client data source.
const {parseApiRequest}=require('./api-contract');
const {requireOwner,requireStoreCapability,planUserOrderCommand}=require('./authorization-model');
const {requireCurrentOrderUser}=require('./order-transaction-service');
const {validateScopedAdminRole}=require('./admin-access-state');
const {validateTradeSnapshot,TRADE_POLICY}=require('./trade-model');
const {assertOrderAmounts,captureOrderFacts}=require('./order-facts');
const {canonicalJSON}=require('./idempotency-model');
const {pageRequest,issueCursor,readCursor,seekConditions}=require('./pagination-model');
const {resolveSnapshotMedia}=require('./media-model');
const {deliverySupportFor}=require('./delivery-support-model');
function fail(code) {throw Object.assign(new Error(code),{code});}
const counter=value=>Number.isSafeInteger(value)&&value>=0;
const timestamp=value=>counter(value)&&value>0&&Number.isFinite(new Date(value).getTime());
const text=value=>typeof value==='string'&&value.length>0&&value.trim()===value&&value.isWellFormed();
const id=value=>text(value)&&/^[A-Za-z0-9_-]{1,256}$/.test(value);
const dense=value=>Array.isArray(value)&&Object.keys(value).length===value.length;
const pick=(value,fields)=>Object.fromEntries(fields.map(field=>[field,value[field]]));
const clone=(value,code)=>{try{return JSON.parse(canonicalJSON(value));}catch(_){fail(code);}};
function freeze(value) {if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
const compareDesc=(a,b)=>b.createdAt-a.createdAt||(a._id>b._id?-1:a._id<b._id?1:0);
const AXES=['orderStatus','paymentStatus','refundStatus','paidCents','refundedCents','refundReservedCents','version'];
const CURRENT=['PENDING_PAYMENT','PAID','ACCEPTED','MAKING','READY','DELIVERING'];
const LABELS={PENDING_PAYMENT:'待付款',PAID:'待门店接单',ACCEPTED:'门店已接单',MAKING:'制作中',READY:'已备妥',
  DELIVERING:'配送中',COMPLETED:'已完成',CANCELLED:'已取消'};
const PROGRESS={ORDER_CREATED:'订单已创建，待付款',CANCEL_UNPAID:'未付款订单已取消',
  REFUND_CONFIRMED:'退款已确认',REFUND_FAILED:'退款结果待核实',
  PAYMENT_CONFIRMED:'付款已确认',PAYMENT_CLOSED:'付款单已关闭',LATE_PAYMENT_REFUND_RESERVED:'付款已核实，订单取消，退款待处理',
  REQUEST_CANCELLATION:'取消申请待门店审核',
  APPROVE_CANCELLATION:'门店已批准取消',REJECT_CANCELLATION:'门店未批准取消',
  REJECT_ORDER:'门店已拒单，退款按资金处理结果更新',APPROVE_REFUND:'门店已批准退款申请',
  ACCEPT:'门店已接单',START_MAKING:'商品制作中',MARK_READY:'商品已备妥',START_DELIVERY:'门店配送中',
  COMPLETE_PICKUP:'已完成自取',COMPLETE_DELIVERY:'已确认收货'};
const TRANSITIONS={ACCEPT:['PAID','ACCEPTED'],START_MAKING:['ACCEPTED','MAKING'],MARK_READY:['MAKING','READY'],
  START_DELIVERY:['READY','DELIVERING'],COMPLETE_PICKUP:['READY','COMPLETED'],COMPLETE_DELIVERY:['DELIVERING','COMPLETED'],
  CANCEL_UNPAID:['PENDING_PAYMENT','CANCELLED'],REJECT_ORDER:['PAID','CANCELLED']};
const PRIVATE_PICKUP_EVENTS=['PICKUP_CREDENTIAL_ISSUED','PICKUP_CREDENTIAL_REJECTED'];
function statesFor(view,status) {
  const states=['ACTIVE','CURRENT'].includes(view)?CURRENT:view==='PAST'?['COMPLETED','CANCELLED']:
    ['COMPLETED','CANCELLED'].includes(view)?[view]:[...CURRENT,'COMPLETED','CANCELLED'];
  return status===undefined?states:states.filter(value=>value===status);
}
function refundSummary(order) {
  const extent=order.refundedCents===0?null:order.refundedCents===order.paidCents?'FULL':'PARTIAL';
  const label={NONE:'无退款',PENDING:'退款处理中',FAILED:'退款待核实',
    SUCCEEDED:extent==='FULL'?'全额退款已完成':'部分退款已完成'}[order.refundStatus];
  return {status:order.refundStatus,label,refundedCents:order.refundedCents,
    pendingCents:order.refundReservedCents,completedExtent:extent};
}
function validateOrder(order,now) {
  validateTradeSnapshot({...order,id:order._id});
  if (!id(order._id)||order.schemaVersion!==1||!timestamp(now)||!timestamp(order.createdAt)||
      !timestamp(order.updatedAt)||order.updatedAt<order.createdAt||order.updatedAt>now||
      !timestamp(order.paymentDeadlineAt)||order.paymentDeadlineAt<=order.createdAt||!text(order.orderNo)) fail('INVALID_ORDER_READ_STATE');
  for(const [field,required] of [['paidAt',order.paymentStatus==='PAID'],['cancelledAt',order.orderStatus==='CANCELLED'],
    ['completedAt',order.orderStatus==='COMPLETED']]) {
    if(required ? !timestamp(order[field])||order[field]<order.createdAt||order[field]>order.updatedAt : order[field]!==null) fail('INVALID_ORDER_READ_STATE');
  }
}
function createOrderReadModel(records,principal,context,key) {
  return createScopedReadModel(records,principal,context,key,null);
}
function createMerchantOrderReadModel(records,principal,context,key,storeId,roles,now) {
  requireOwner(principal,{ownerId:principal&&principal.subjectId});
  roles=clone(roles,'INVALID_ROLE_RECORD');
  if(!dense(roles))fail('INVALID_ROLE_RECORD');
  roles.forEach(role=>validateScopedAdminRole(role,{environment:principal.environment,appId:principal.appId,now}));
  const actor=requireStoreCapability(principal,roles,storeId,['ORDER_OPERATE']);
  return createScopedReadModel(records,principal,context,key,{storeId,roles,actor});
}
function createScopedReadModel(records,principal,context,key,merchant) {
  requireOwner(principal,{ownerId:principal&&principal.subjectId});
  records=clone(records,'INVALID_ORDER_READ_STATE');context=clone(context,'INVALID_CONFIGURATION');
  if(!context||context.environment!==principal.environment||context.appId!==principal.appId||
      !['development','test','production'].includes(context.stage)||!dense(context.allowedCloudPrefixes)||
      !context.allowedCloudPrefixes.every(prefix=>typeof prefix==='string'&&/^cloud:\/\/[A-Za-z0-9._-]+\/(?:[A-Za-z0-9_-]+\/)*$/.test(prefix))||
      !key||!text(key.id)||!Buffer.isBuffer(key.secret)||key.secret.length<32) fail('INVALID_CONFIGURATION');
  key={id:key.id,secret:Buffer.from(key.secret)};
  if(!records||Object.keys(records).sort().join(',')!==['user','orders','items','logs','cancellations','mediaAssets'].sort().join(',')) fail('INVALID_ORDER_READ_STATE');
  requireCurrentOrderUser(records.user,principal);
  for(const field of ['orders','items','logs','cancellations']) {
    if(!dense(records[field])||records[field].some(value=>!value||!id(value._id))||
        new Set(records[field].map(value=>value._id)).size!==records[field].length) fail('INVALID_ORDER_READ_STATE');
  }
  if(!dense(records.mediaAssets)) fail('INVALID_ORDER_READ_STATE');
  const owned=records.orders.filter(order=>merchant?order.storeId===merchant.storeId:order.ownerId===principal.subjectId),byId=new Map(owned.map(order=>[order._id,order]));
  const bindingFor=(view,status)=>({environment:principal.environment,actorScope:JSON.stringify([principal.appId,principal.subjectId]),
    action:merchant?'admin.orders.list':'order.list',sortId:'CREATED_DESC',query:merchant?
      {storeId:merchant.storeId,status:status===undefined?null:status,grant:merchant.actor.grant}:
      {view,status:status===undefined?null:status}});
  function readEvent(event,action) {
    const parsed=parseApiRequest(merchant?'admin':'order',event);
    if(parsed.contract.action!==action)fail('INVALID_REQUEST');
    if(merchant&&action==='orders.list'&&parsed.payload.storeId!==merchant.storeId)fail('FORBIDDEN');
    return parsed;
  }
  function media(ref,now) {
    if(ref===null)return null;
    try{return resolveSnapshotMedia(ref,records.mediaAssets,{...context,now});}
    catch(error){if(error.name==='MediaModelError')return null;throw error;}
  }
  function factsFor(order,now) {
    validateOrder(order,now);
    const items=records.items.filter(item=>item.orderId===order._id).sort((a,b)=>a.position-b.position);
    if(!items.length||items.some((item,index)=>item.schemaVersion!==1||item.position!==index||!counter(item.version)||
        item.createdAt!==order.createdAt||item.updatedAt!==item.createdAt)||
        !order.cartSelectionSnapshot||!dense(order.cartSelectionSnapshot.selectedLines)||
        items.length!==order.cartSelectionSnapshot.selectedLines.length||
        items.some((item,index)=>item.lineId!==order.cartSelectionSnapshot.selectedLines[index].lineId)) fail('INVALID_ORDER_READ_STATE');
    assertOrderAmounts({...order,id:order._id},items);
    const facts=captureOrderFacts({...order,items});
    if(facts.storeSnapshot.storeId!==order.storeId||facts.currency!==order.currency||
        facts.subtotalCents!==order.subtotalCents||facts.totalCents!==order.totalCents||
        facts.deliveryFeeCents!==order.deliveryFeeCents) fail('INVALID_ORDER_READ_STATE');
    return {...facts,items:facts.items.map(item=>({...pick(item,['lineId','productId','skuId','categoryCode',
      'productName','skuDescription','selectedOptions','quantity','cakeMessage','unitPriceCents','lineTotalCents']),productImage:media(item.productImage,now)}))};
  }
  function cancellationFor(order,now) {
    const requests=records.cancellations.filter(value=>value.orderId===order._id);
    for(const request of requests) {
      if(request.ownerId!==order.ownerId||request.schemaVersion!==1||!counter(request.version)||
          !timestamp(request.createdAt)||request.createdAt<order.createdAt||!timestamp(request.updatedAt)||
          request.updatedAt<request.createdAt||request.updatedAt>now||!['PENDING','APPROVED','REJECTED'].includes(request.status)||
          (request.status==='PENDING' ? request.reviewedAt!==null||request.approvedRefundCents!==null :
            !timestamp(request.reviewedAt)||request.reviewedAt<request.createdAt||request.reviewedAt>request.updatedAt||
            (request.status==='APPROVED' ? !counter(request.approvedRefundCents)||request.approvedRefundCents>order.paidCents :
              request.approvedRefundCents!==null))) fail('INVALID_ORDER_READ_STATE');
    }
    const pending=requests.filter(value=>value.status==='PENDING');if(pending.length>1)fail('INVALID_ORDER_READ_STATE');
    const latest=pending[0]||requests.sort(compareDesc)[0];
    return latest?{requestId:latest._id,...pick(latest,['status','createdAt','reviewedAt','approvedRefundCents'])}:null;
  }
  function actionsFor(order,cancellation,now) {
    if(order.tradePolicyVersion!==TRADE_POLICY.version)return [];
    if(merchant){
      const candidates={PAID:['ACCEPT','REJECT_ORDER'],ACCEPTED:['START_MAKING'],MAKING:['MARK_READY'],
        READY:order.fulfillment==='PICKUP'?['COMPLETE_PICKUP']:['START_DELIVERY'],DELIVERING:['COMPLETE_DELIVERY']}[order.orderStatus]||[];
      return candidates.flatMap(command=>{
        try{planUserOrderCommand({...order,id:order._id},command,principal,merchant.roles,{expectedVersion:order.version});}
        catch(error){if(['FORBIDDEN','INVALID_TRANSITION','REFUND_IN_PROGRESS'].includes(error.code))return [];throw error;}
        return [{action:'admin.order.transition',command,label:{ACCEPT:'接单',REJECT_ORDER:'拒单并安排退款',
          START_MAKING:'开始制作',MARK_READY:'标记备妥',COMPLETE_PICKUP:'核销自取',START_DELIVERY:'开始配送',
          COMPLETE_DELIVERY:'确认送达'}[command],enabled:false,
          blockedReason:command==='REJECT_ORDER'&&cancellation?.status==='PENDING'?'CANCELLATION_REVIEW_REQUIRED':
            command==='COMPLETE_PICKUP'?'CONFIGURATION_REQUIRED':'SERVICE_NOT_CONNECTED'}];
      });
    }
    const actions=[];
    const add=(action,label,blockedReason='SERVICE_NOT_CONNECTED')=>actions.push({action,label,enabled:false,blockedReason});
    if(order.orderStatus==='PENDING_PAYMENT') {
      if(now<order.paymentDeadlineAt)add('payment.create','去支付',
        ['PENDING','EXCEPTION'].includes(order.paymentStatus)?'PAYMENT_PENDING':'SERVICE_NOT_CONNECTED');
      add('order.cancelUnpaid','取消订单',['PENDING','EXCEPTION'].includes(order.paymentStatus)?'PAYMENT_PENDING':'SERVICE_NOT_CONNECTED');
    } else if(CURRENT.includes(order.orderStatus)) {
      add('order.cancellation.request','申请取消',cancellation&&cancellation.status==='PENDING'?'CANCELLATION_PENDING':'SERVICE_NOT_CONNECTED');
      if(order.orderStatus==='DELIVERING'&&order.fulfillment==='DELIVERY')add('order.delivery.confirm','确认收货');
      if(order.orderStatus==='READY'&&order.fulfillment==='PICKUP')add('order.pickupCredential.get','查看自取凭证','CONFIGURATION_REQUIRED');
    }
    return actions;
  }
  function common(order,cancellation,now) {
    return {...pick(order,['orderNo','version','orderStatus','paymentStatus','refundStatus','fulfillment','currency',
      'totalCents','paidCents','refundedCents','createdAt','paymentDeadlineAt','paidAt','cancelledAt','completedAt']),
      orderId:order._id,group:CURRENT.includes(order.orderStatus)?'CURRENT':'PAST',statusLabel:LABELS[order.orderStatus],
      paymentLabel:{UNPAID:'未付款',PENDING:'付款待确认',PAID:'已付款',CLOSED:'付款已关闭',EXCEPTION:'付款待核实'}[order.paymentStatus],
      cancellationSummary:cancellation,refundSummary:refundSummary(order),availableActions:actionsFor(order,cancellation,now)};
  }
  function timelineFor(order,now) {
    const logs=records.logs.filter(value=>value.orderId===order._id).sort((a,b)=>(a.after?.version??-1)-(b.after?.version??-1));
    if(logs.length!==order.version+1)fail('INVALID_ORDER_READ_STATE');
    let previous=null;
    for(let index=0;index<logs.length;index++) {
      const log=logs[index];
      if(log.schemaVersion!==1||log.version!==0||!timestamp(log.createdAt)||log.updatedAt!==log.createdAt||
          log.createdAt<order.createdAt||log.createdAt>order.updatedAt||!text(log.command)||
          !log.after||Object.keys(log.after).sort().join(',')!==[...AXES].sort().join(',')||log.after.version!==index||
          (index===0 ? log.command!=='ORDER_CREATED'||log.before!==null||log.createdAt!==order.createdAt :
            !log.before||canonicalJSON(log.before)!==canonicalJSON(previous.after)||log.createdAt<previous.createdAt)) fail('INVALID_ORDER_READ_STATE');
      try {validateTradeSnapshot({...order,...log.after,id:order._id});}
      catch(_){fail('INVALID_ORDER_READ_STATE');}
      previous=log;
      if(index===0 && (log.after.orderStatus!=='PENDING_PAYMENT'||log.after.paymentStatus!=='UNPAID'||
          log.after.refundStatus!=='NONE'||log.after.paidCents!==0))fail('INVALID_ORDER_READ_STATE');
      const transition=TRANSITIONS[log.command];
      if(PRIVATE_PICKUP_EVENTS.includes(log.command)&&(order.fulfillment!=='PICKUP'||log.before?.orderStatus!=='READY'||
          canonicalJSON({...log.before,version:log.after.version})!==canonicalJSON(log.after)))fail('INVALID_ORDER_READ_STATE');
      if(transition&&(log.before.orderStatus!==transition[0]||log.after.orderStatus!==transition[1]))fail('INVALID_ORDER_READ_STATE');
      if(log.command==='CANCEL_UNPAID'&&(!['UNPAID','CLOSED'].includes(log.before.paymentStatus)||
          log.after.paymentStatus!==log.before.paymentStatus))fail('INVALID_ORDER_READ_STATE');
      if(log.command==='COMPLETE_PICKUP'&&order.fulfillment!=='PICKUP'||
          log.command==='COMPLETE_DELIVERY'&&order.fulfillment!=='DELIVERY')fail('INVALID_ORDER_READ_STATE');
      if(log.command==='PAYMENT_CONFIRMED'&&(!['PENDING_PAYMENT','CANCELLED'].includes(log.before?.orderStatus)||
          log.after.orderStatus!==(log.before.orderStatus==='CANCELLED'?'CANCELLED':'PAID')||log.after.paymentStatus!=='PAID'))fail('INVALID_ORDER_READ_STATE');
      if(log.command==='PAYMENT_CLOSED'&&(log.before.orderStatus!=='PENDING_PAYMENT'||log.after.orderStatus!=='PENDING_PAYMENT'||
          !['UNPAID','PENDING','EXCEPTION'].includes(log.before.paymentStatus)||log.after.paymentStatus!=='CLOSED'||
          log.after.paidCents!==0))fail('INVALID_ORDER_READ_STATE');
      if(log.command==='LATE_PAYMENT_REFUND_RESERVED'&&(!['PENDING_PAYMENT','CANCELLED'].includes(log.before.orderStatus)||
          log.before.paidCents!==0||log.after.orderStatus!=='CANCELLED'||log.after.paymentStatus!=='PAID'||
          log.after.refundStatus!=='PENDING'||log.after.refundReservedCents!==log.after.paidCents))fail('INVALID_ORDER_READ_STATE');
      if(['REFUND_CONFIRMED','REFUND_FAILED'].includes(log.command)){
        const b=log.before,a=log.after;
        if(!b||a.orderStatus!==b.orderStatus||a.paymentStatus!==b.paymentStatus||a.paidCents!==b.paidCents||
            (log.command==='REFUND_CONFIRMED'?(a.refundStatus!=='SUCCEEDED'||a.refundedCents<=b.refundedCents||
              a.refundedCents-b.refundedCents!==b.refundReservedCents-a.refundReservedCents):
              (a.refundStatus!=='FAILED'||a.refundedCents!==b.refundedCents||a.refundReservedCents!==b.refundReservedCents)))
          fail('INVALID_ORDER_READ_STATE');
      }
      if(['REQUEST_CANCELLATION','REJECT_CANCELLATION','APPROVE_REFUND'].includes(log.command)&&
          log.before?.orderStatus!==log.after.orderStatus)fail('INVALID_ORDER_READ_STATE');
      if(log.command==='APPROVE_CANCELLATION'&&(!CURRENT.slice(1).includes(log.before?.orderStatus)||
          log.after.orderStatus!=='CANCELLED'))fail('INVALID_ORDER_READ_STATE');
    }
    if(!previous||canonicalJSON(previous.after)!==canonicalJSON(pick(order,AXES)))fail('INVALID_ORDER_READ_STATE');
    return logs.filter(log=>!PRIVATE_PICKUP_EVENTS.includes(log.command)).map(log=>({createdAt:log.createdAt,version:log.after.version,...pick(log.after,['orderStatus','paymentStatus','refundStatus']),
      message:PROGRESS[log.command]||LABELS[log.after.orderStatus]}));
  }
  function list(event,now) {
    const {payload}=readEvent(event,merchant?'orders.list':'list');
    if(!timestamp(now))fail('INVALID_CONFIGURATION');
    owned.forEach(order=>validateOrder(order,now));
    const view=payload.view==='ACTIVE'?'CURRENT':payload.view||'ALL',states=statesFor(view,payload.status);
    const request=pageRequest(pick(payload,Object.keys(payload).filter(field=>['pageSize','cursor'].includes(field))));
    const binding=bindingFor(view,payload.status),anchor=request.cursor===null?null:readCursor(request.cursor,binding,key,now);
    const selected=owned.filter(order=>states.includes(order.orderStatus)&&
      (!anchor||order.createdAt<anchor[0]||order.createdAt===anchor[0]&&order._id<anchor[1])).sort(compareDesc);
    const batch=selected.slice(0,request.pageSize+1),visible=batch.slice(0,request.pageSize),hasMore=batch.length>request.pageSize;
    const items=visible.map(order=>{
      const facts=factsFor(order,now),cancellation=cancellationFor(order,now);
      let quantity=0;for(const item of facts.items){quantity+=item.quantity;if(!counter(quantity))fail('INVALID_ORDER_READ_STATE');}
      return {...common(order,cancellation,now),productNames:facts.items.map(item=>item.productName),
        coverImage:facts.items[0].productImage,quantity,appointment:appointmentFor(facts)};
    });
    const last=visible[visible.length-1];
    return freeze({scope:merchant?'OFFLINE_MERCHANT_ORDER_PAGE':'OFFLINE_ORDER_PAGE',items,hasMore,
      nextCursor:hasMore?issueCursor([last.createdAt,last._id],binding,key,now):null,cloudVerified:false,
      ...(merchant?{callable:false,operationsAllowed:false}: {})});
  }
  function get(event,now) {
    const {payload}=readEvent(event,merchant?'order.get':'get');
    const order=byId.get(payload.orderId);if(!order)fail('NOT_FOUND');
    const facts=factsFor(order,now),cancellation=cancellationFor(order,now),address=facts.addressSnapshot;
    const publicAddress=address===null?null:{...pick(address,['addressId','receiverName','phone','province','city','district','regionCodes','detail']),
      location:address.location===null?null:pick(address.location,['longitude','latitude','coordinateSystem'])};
    return freeze({scope:merchant?'OFFLINE_MERCHANT_ORDER_DETAIL':'OFFLINE_ORDER_DETAIL',...common(order,cancellation,now),
      store:pick(facts.storeSnapshot,['storeId','name','address','phone','timeZone']),contact:facts.contactSnapshot,
      address:publicAddress,appointment:appointmentFor(facts),deliverySupport:deliverySupportFor(facts),items:facts.items,orderNote:facts.orderNote,
      subtotalCents:order.subtotalCents,deliveryFeeCents:order.deliveryFeeCents,timeline:timelineFor(order,now),cloudVerified:false,
      ...(merchant?{callable:false,operationsAllowed:false}: {})});
  }
  function planListQuery(event,now) {
    const {payload}=readEvent(event,merchant?'orders.list':'list');if(!timestamp(now))fail('INVALID_REQUEST');
    const view=payload.view==='ACTIVE'?'CURRENT':payload.view||'ALL',request=pageRequest(pick(payload,
      Object.keys(payload).filter(field=>['pageSize','cursor'].includes(field))));
    const binding=bindingFor(view,payload.status),anchor=request.cursor===null?null:readCursor(request.cursor,binding,key,now);
    return freeze({...(merchant?{storeId:merchant.storeId,requiresWholeSeekAndStoreFilter:true}:
      {ownerId:principal.subjectId,requiresWholeSeekAndOwnerFilter:true}),
      states:statesFor(view,payload.status),sortId:'CREATED_DESC',
      limit:request.pageSize+1,seek:anchor?seekConditions(anchor,'CREATED_DESC'):null});
  }
  return Object.freeze({list,get,planListQuery});
}
function appointmentFor(facts) {
  return {...pick(facts.appointmentSnapshot,['serviceDate','timeZone','startAt','endAt']),
    fulfillment:facts.fulfillment,windowNature:facts.fulfillment==='DELIVERY'?'ESTIMATED':'PICKUP'};
}
module.exports={createOrderReadModel,createMerchantOrderReadModel};
