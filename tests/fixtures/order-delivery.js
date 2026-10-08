'use strict';
// OFFLINE_TEST_ONLY. Paid/making/ready history is synthetic, never a public event.
const {setup:transactionSetup}=require('./order-transaction');
const {clone}=require('./quote');
const {scopedDocumentId}=require('../../cloudfunctions/_shared/idempotency-model');
const {createOrderDeliveryService}=require('../../cloudfunctions/_shared/order-delivery-service');
const AXES=['orderStatus','paymentStatus','refundStatus','paidCents','refundedCents','refundReservedCents','version'];
const axes=order=>Object.fromEntries(AXES.map(field=>[field,order[field]]));
async function setup({mode='DELIVERY',customer}={}){
  const s=transactionSetup(),q=s.makeQuote({mode,customer}),created=await s.service.execute(q.event,q.customer);
  const owner=q.customer,orderId=created.result.entityId;
  function append(command,patch){
    const order=s.db.orders[orderId],before=axes(order);Object.assign(order,patch);order.version++;order.updatedAt++;
    const log={_id:scopedDocumentId('offline-delivery-history',[orderId,String(order.version)]),schemaVersion:1,version:0,
      createdAt:order.updatedAt,updatedAt:order.updatedAt,orderId,command,before,after:axes(order),
      actor:{type:'SYSTEM',subjectId:null,service:'OFFLINE_TEST_ONLY'},requestId:'offline-delivery-fixture',eventId:null,reason:'',publicMessage:''};
    s.db.logs[log._id]=log;return log;
  }
  append('PAYMENT_CONFIRMED',{orderStatus:'PAID',paymentStatus:'PAID',paidCents:s.db.orders[orderId].totalCents,
    paidAt:s.db.orders[orderId].updatedAt+1});
  append('ACCEPT',{orderStatus:'ACCEPTED'});const making=append('START_MAKING',{orderStatus:'MAKING'});
  append('MARK_READY',{orderStatus:'READY'});
  const order=s.db.orders[orderId];
  for(const r of Object.values(s.db.reservations)){
    const resource=(r.resourceKind==='STOCK'?s.db.stocks:s.db.slots)[r.resourceId];
    resource.heldUnits-=r.quantity;resource.version++;resource.updatedAt=order.updatedAt;
    r.version++;r.updatedAt=order.updatedAt;
    if(r.resourceKind==='STOCK'){
      resource.consumedUnits+=r.quantity;r.status='CONSUMED';r.resolvedAt=making.createdAt;r.resolutionLogId=making._id;
    }else{resource.confirmedUnits+=r.quantity;r.status='CONFIRMED';}
  }
  const merchant=s.actor('offline-delivery-merchant');
  s.db.users[merchant.subjectId]={_id:merchant.subjectId,schemaVersion:1,environment:merchant.environment,
    appId:merchant.appId,status:'ACTIVE',version:merchant.userVersion};
  const roleId='offline-delivery-role';s.db.roles[roleId]={_id:roleId,schemaVersion:1,version:0,subjectId:merchant.subjectId,
    storeIds:[s.storeId],capabilities:['ORDER_OPERATE'],status:'ACTIVE',revokedAt:null};
  s.controls.now=order.updatedAt+100;let sequence=0;
  const options={environment:owner.environment,appId:owner.appId,runTransaction:s.runTransaction,
    now:()=>s.controls.nowSequence?s.controls.nowSequence.shift():s.controls.now,
    newRequestId:()=> 'offline-delivery-trace-'+(++sequence),
    completionPolicy:{version:'OFFLINE_TEST_ONLY',slotCompletion:'KEEP_CONFIRMED'}};
  const deliveryService=createOrderDeliveryService(options);
  const event=(command,key=command)=>({action:'order.transition',payload:{orderId,
    expectedVersion:s.db.orders[orderId].version,command,idempotencyKey:'OFFLINE_DELIVERY_KEY-'+key}});
  const confirm=(key='customer-confirm')=>({action:'delivery.confirm',payload:{orderId,
    expectedVersion:s.db.orders[orderId].version,idempotencyKey:'OFFLINE_DELIVERY_KEY-'+key}});
  const records=()=>({user:clone(s.db.users[owner.subjectId]),orders:clone(Object.values(s.db.orders)),
    items:clone(Object.values(s.db.items)),logs:clone(Object.values(s.db.logs)),cancellations:[],mediaAssets:[]});
  return {...s,owner,merchant,roleId,orderId,options,deliveryService,event,confirm,records,append};
}
module.exports={setup};
