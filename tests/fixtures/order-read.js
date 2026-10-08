'use strict';
// OFFLINE_TEST_ONLY: lifecycle examples derived from a real local O03 creation.
const {setup:transactionSetup}=require('./order-transaction');
const {clone,actor}=require('./quote');
const {scopedDocumentId}=require('../../cloudfunctions/_shared/idempotency-model');
const {createOrderReadModel}=require('../../cloudfunctions/_shared/order-read-model');
const {createOrderReadService}=require('../../cloudfunctions/_shared/order-read-service');
const AXES=['orderStatus','paymentStatus','refundStatus','paidCents','refundedCents','refundReservedCents','version'];
const axes=order=>Object.fromEntries(AXES.map(field=>[field,order[field]]));
async function setup() {
  const tx=transactionSetup(),q=tx.makeQuote({quantity:2}),created=await tx.service.execute(q.event,q.customer);
  const delivery=tx.makeQuote({mode:'DELIVERY'}),deliveryCreated=await tx.service.execute(delivery.event,delivery.customer);
  const base=clone(tx.db.orders[created.result.entityId]),deliveryBase=clone(tx.db.orders[deliveryCreated.result.entityId]);
  const principal=q.customer,context={environment:principal.environment,appId:principal.appId,stage:'test',
    allowedCloudPrefixes:['cloud://offline-order-read/']},key={id:'OFFLINE_TEST_ONLY',secret:Buffer.alloc(32,29)};
  const ref={assetId:'offline-order-image',revision:'v1',storageRef:'cloud://offline-order-read/photos/v1.png',sourceKind:'REAL_PHOTO'};
  const asset={...ref,_id:scopedDocumentId('media',[principal.environment,ref.assetId,ref.revision]),
    schemaVersion:1,version:0,createdAt:1000,updatedAt:1000,contentHash:'a'.repeat(64),byteLength:1,
    mimeType:'image/png',status:'PUBLISHED',retainedUntil:null,privateMetadata:'PRIVATE_MEDIA'};
  const records={user:clone(tx.db.users[principal.subjectId]),orders:[],items:[],logs:[],cancellations:[],mediaAssets:[asset]};
  let sequence=0;
  function add(status='PENDING_PAYMENT',options={}) {
    const source=options.fulfillment==='DELIVERY'?deliveryBase:base;
    const order=clone(source),orderId=options.id||'offline-order-'+(++sequence);
    const createdAt=options.createdAt||base.createdAt+sequence*10;
    Object.assign(order,{_id:orderId,orderNo:'V1-'+orderId,createdAt,updatedAt:createdAt,version:0});
    order.ownerId=options.ownerId||principal.subjectId;
    const logs=[],writeLog=(command,before)=>logs.push({_id:'log-'+orderId+'-'+order.version,schemaVersion:1,version:0,
      createdAt:order.updatedAt,updatedAt:order.updatedAt,orderId,command,before,after:axes(order),
      publicMessage:'PRIVATE_RAW_MESSAGE',requestId:'PRIVATE_TRACE',eventId:'PRIVATE_EVENT',
      actor:{type:'CUSTOMER',subjectId:'PRIVATE_ACTOR',service:null},reason:'PRIVATE_REASON'});
    writeLog('ORDER_CREATED',null);
    const path=status==='CANCELLED'?[['CANCEL_UNPAID','CANCELLED']]:status==='PENDING_PAYMENT'?[]:
      [['PAYMENT_CONFIRMED','PAID'],['ACCEPT','ACCEPTED'],['START_MAKING','MAKING'],['MARK_READY','READY'],
        ...(order.fulfillment==='DELIVERY'?[['START_DELIVERY','DELIVERING'],['COMPLETE_DELIVERY','COMPLETED']]:[['COMPLETE_PICKUP','COMPLETED']])];
    for(const [command,target] of path) {
      const before=axes(order);order.orderStatus=target;order.version++;order.updatedAt=createdAt+order.version;
      if(command==='PAYMENT_CONFIRMED'){order.paymentStatus='PAID';order.paidCents=order.totalCents;order.paidAt=order.updatedAt;}
      if(target==='COMPLETED')order.completedAt=order.updatedAt;
      if(target==='CANCELLED'){order.cancelledAt=order.updatedAt;order.cancellationReason='PRIVATE_CANCEL_REASON';}
      writeLog(command,before);if(target===status)break;
    }
    const sourceItems=Object.values(tx.db.items).filter(item=>item.orderId===source._id);
    const items=sourceItems.map((item,index)=>({...clone(item),_id:'item-'+orderId+'-'+index,orderId,
      createdAt,updatedAt:createdAt,productImage:clone(ref),productName:'历史蛋糕 '+orderId,privateMetadata:'PRIVATE_ITEM'}));
    records.orders.push(order);records.items.push(...items);records.logs.push(...logs);
    return order;
  }
  function append(order,command,patch) {
    const before=axes(order);Object.assign(order,patch);order.version++;order.updatedAt++;
    const log={_id:'log-'+order._id+'-'+order.version,schemaVersion:1,version:0,createdAt:order.updatedAt,updatedAt:order.updatedAt,
      orderId:order._id,command,before,after:axes(order),publicMessage:'PRIVATE_RAW_MESSAGE'};
    records.logs.push(log);return log;
  }
  const controls={now:base.createdAt+100000,beforeFence:null,denyFence:false,badPage:null,queries:[],writes:0,readDelay:0};
  const model=()=>createOrderReadModel(records,principal,context,key);
  const children=orders=>{
    const ids=new Set(orders.map(order=>order._id));
    return {orders,items:records.items.filter(item=>ids.has(item.orderId)),logs:records.logs.filter(log=>ids.has(log.orderId)),
      cancellations:records.cancellations.filter(request=>ids.has(request.orderId)),mediaAssets:records.mediaAssets};
  };
  const service=createOrderReadService({context,key,now:()=>controls.now,runReadTransaction:async work=>{
    const snapshot=JSON.stringify(records);
    return work({readUser:async id=>records.user._id===id?clone(records.user):null,
      readOrderPage:async query=>{
        controls.queries.push(query);
        controls.now+=controls.readDelay;
        if(controls.badPage)return clone(controls.badPage);
        const orders=records.orders.filter(order=>order.ownerId===query.ownerId&&query.states.includes(order.orderStatus)&&
          (!query.seek||query.seek.some(and=>and.every(term=>term.operator==='EQ'?order[term.field]===term.value:order[term.field]<term.value))))
          .sort((a,b)=>b.createdAt-a.createdAt||(a._id>b._id?-1:a._id<b._id?1:0)).slice(0,query.limit);
        return clone(children(orders));
      },readOrderDetail:async query=>clone(children(records.orders.filter(order=>order.ownerId===query.ownerId&&order._id===query.orderId))),
      assertReadSnapshot:async()=>{if(controls.beforeFence)controls.beforeFence(records);return !controls.denyFence&&JSON.stringify(records)===snapshot;}});
  }});
  return {records,principal,context,key,controls,model,service,add,append,actor,ref,asset,tx};
}
module.exports={setup};
