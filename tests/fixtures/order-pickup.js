'use strict';
// OFFLINE_TEST_ONLY: no live payment, credential or merchant policy.
const {setup:transactionSetup}=require('./order-transaction');
const {clone}=require('./quote');
const {scopedDocumentId}=require('../../cloudfunctions/_shared/idempotency-model');
const {createOrderPickupService}=require('../../cloudfunctions/_shared/order-pickup-service');
const AXES=['orderStatus','paymentStatus','refundStatus','paidCents','refundedCents','refundReservedCents','version'];
const axes=order=>Object.fromEntries(AXES.map(field=>[field,order[field]]));
async function setup(){
  const s=transactionSetup(),quote=s.makeQuote(),created=await s.service.execute(quote.event,quote.customer);
  const orderId=created.result.entityId,order=s.db.orders[orderId];
  for(const [command,status] of [['PAYMENT_CONFIRMED','PAID'],['ACCEPT','ACCEPTED'],['START_MAKING','MAKING'],['MARK_READY','READY']]){
    const before=axes(order);order.version++;order.updatedAt++;order.orderStatus=status;
    if(command==='PAYMENT_CONFIRMED'){order.paymentStatus='PAID';order.paidCents=order.totalCents;order.paidAt=order.updatedAt;}
    const log={_id:scopedDocumentId('offline-lifecycle',[orderId,String(order.version)]),schemaVersion:1,version:0,
      createdAt:order.updatedAt,updatedAt:order.updatedAt,orderId,command,before,after:axes(order),
      actor:{type:'SYSTEM',subjectId:null,service:'OFFLINE_TEST_ONLY'},requestId:'offline-pickup-fixture',eventId:null,reason:'',publicMessage:''};
    s.db.logs[log._id]=log;
  }
  for(const r of Object.values(s.db.reservations)){
    const resource=(r.resourceKind==='STOCK'?s.db.stocks:s.db.slots)[r.resourceId];
    resource.heldUnits-=r.quantity;resource.version++;resource.updatedAt=order.updatedAt;
    r.status=r.resourceKind==='STOCK'?'CONSUMED':'CONFIRMED';r.version++;r.updatedAt=order.updatedAt;
    if(r.resourceKind==='STOCK'){
      resource.consumedUnits+=r.quantity;r.resolvedAt=order.updatedAt;
      r.resolutionLogId=Object.values(s.db.logs).find(log=>log.command==='START_MAKING')._id;
    }else resource.confirmedUnits+=r.quantity;
  }
  const merchant=s.actor('offline-pickup-merchant');
  s.db.users[merchant.subjectId]={_id:merchant.subjectId,schemaVersion:1,environment:merchant.environment,
    appId:merchant.appId,status:'ACTIVE',version:merchant.userVersion};
  const role={_id:'offline-pickup-role',schemaVersion:1,version:0,subjectId:merchant.subjectId,
    storeIds:[s.storeId],capabilities:['ORDER_OPERATE'],status:'ACTIVE',revokedAt:null};
  s.db.roles[role._id]=role;s.controls.now=order.updatedAt+100;
  const policy={version:'OFFLINE_TEST_ONLY',format:'OPAQUE_TOKEN',ttlMs:60000,maxFailedAttempts:3,
    attemptCooldownMs:1000,slotCompletion:'KEEP_CONFIRMED'};
  let sequence=0;
  const options={environment:merchant.environment,appId:merchant.appId,runTransaction:s.runTransaction,
    now:()=>s.controls.nowSequence?s.controls.nowSequence.shift():s.controls.now,
    newRequestId:()=> 'offline-pickup-trace-'+(++sequence),policy,currentKeyId:'OFFLINE_VALUE_KEY',
    fingerprintKeyId:'OFFLINE_RECEIPT_KEY',keys:{OFFLINE_VALUE_KEY:Buffer.alloc(32,47),OFFLINE_RECEIPT_KEY:Buffer.alloc(32,53)}};
  const service=createOrderPickupService(options);
  const getEvent={action:'pickupCredential.get',payload:{orderId}};
  const completeEvent=(value,key='offline-pickup-complete')=>({action:'order.transition',payload:{orderId,
    expectedVersion:s.db.orders[orderId].version,command:'COMPLETE_PICKUP',pickupCredential:value,idempotencyKey:'OFFLINE_TEST_KEY-'+key}});
  const records=()=>({user:clone(s.db.users[s.principal.subjectId]),orders:clone(Object.values(s.db.orders)),
    items:clone(Object.values(s.db.items)),logs:clone(Object.values(s.db.logs)),cancellations:[],mediaAssets:[]});
  return {...s,orderId,merchant,roleId:role._id,policy,options,pickupService:service,getEvent,completeEvent,records};
}
module.exports={setup};
