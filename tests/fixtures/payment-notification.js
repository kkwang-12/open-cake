'use strict';
// OFFLINE_TEST_ONLY source verifier uses object identity. It is NOT crypto,
// CloudBase forwarding authentication or actual platform evidence.
const {setup:paymentSetup}=require('./payment-intent');
const {requestFingerprint}=require('../../cloudfunctions/_shared/idempotency-model');
const {createPaymentConfigurationModel}=require('../../cloudfunctions/_shared/payment-configuration-model');
const {createPaymentNotificationService}=require('../../cloudfunctions/_shared/payment-notification-service');
const {payerIdentityDigest}=require('../../cloudfunctions/_shared/payment-notification-model');
const AXES=['orderStatus','paymentStatus','refundStatus','paidCents','refundedCents','refundReservedCents','version'];
async function setup(options={}){
  const s=paymentSetup({...options,extendTransaction:(tx,db,changed)=>{
    tx.readEvent=async id=>db.events[id]||null;tx.readOrderPayments=tx.readPayments;
    tx.readLogs=async id=>Object.values(db.logs).filter(v=>v.orderId===id);
    tx.assertNotificationReads=tx.assertPaymentReads;
    tx.insertEvent=async event=>{if(db.events[event._id])return 0;db.events[event._id]=s.clone(event);return changed();};
    tx.saveOrder=async(order,version)=>{if(db.orders[order._id]?.version!==version)return 0;db.orders[order._id]=s.clone(order);return changed();};
    tx.insertLog=async log=>{if(db.logs[log._id])return 0;db.logs[log._id]=s.clone(log);return changed();};
    tx.updateResource=async(change,now)=>{
      const held=Object.values(db.heldByOrder).concat(db.held),entry=held.flatMap(v=>v.resources)
        .find(r=>r.resourceKind===change.resourceKind&&r.resource._id===change.resourceId),r=entry?.resource;
      if(!r||r.version!==change.expectedVersion||r.status!==change.expectedStatus)return 0;
      Object.assign(r,{version:change.nextVersion,heldUnits:change.heldUnits,confirmedUnits:change.confirmedUnits,
        consumedUnits:change.consumedUnits,updatedAt:now});return changed();
    };
    tx.updateReservation=async change=>{
      const r=Object.values(db.heldByOrder).concat(db.held).flatMap(v=>v.reservations).find(v=>v._id===change.reservationId);
      if(!r||r.version!==change.expectedVersion||r.status!==change.expectedStatus)return 0;
      Object.assign(r,s.clone(change.patch));return changed();
    };
    if(options.extendTransaction)options.extendTransaction(tx,db,changed);
  }});
  s.db.events={};s.db.logs={};
  const order=s.db.orders.OFFLINE_ORDER;
  Object.assign(order,{paidAt:null,cancelledAt:null,completedAt:null});
  s.db.logs.OFFLINE_CREATED={_id:'OFFLINE_CREATED',schemaVersion:1,version:0,orderId:order._id,
    createdAt:order.createdAt,updatedAt:order.createdAt,command:'ORDER_CREATED',before:null,
    after:Object.fromEntries(AXES.map(k=>[k,order[k]]))};
  await s.service().prepare(s.event(),s.principal);
  const paymentId=Object.values(s.db.payments)[0]._id;
  await s.service().claimDispatch(order._id,paymentId,s.principal);
  s.controls.now+=1000;s.controls.verifierThrows=false;
  const trusted=new WeakMap();let sequence=0,trace=0;
  const provider=options.route||'WECHATPAY_DIRECT_V3';
  function notification({eventId='OFFLINE_EVENT_1',patch={},bindingPatch={},method}={}){
    const raw=Object.freeze({body:'OFFLINE_OPAQUE_NOTIFICATION_'+(++sequence)}),p=s.db.payments[paymentId];
    const envelope={providerEventId:eventId,binding:{...s.settings,merchantId:p.merchantId,provider,profileVersion:p.profileVersion,...bindingPatch},
      verificationMethod:method||(provider==='WECHATPAY_DIRECT_V3'?'SERVER_SIGNATURE_AND_DECRYPTION':'PLATFORM_VERIFIED_WITH_AUTHENTICATED_FORWARDING'),
      evidence:{appId:p.appId,merchantId:p.merchantId,outTradeNo:p.outTradeNo,transactionId:'OFFLINE_TRANSACTION_1',
        outRefundNo:null,providerRefundId:null,currency:'CNY',amountCents:p.amountCents,resultCode:'SUCCESS',
        occurredAt:s.controls.now,occurredAtPrecisionMs:1,payloadDigest:requestFingerprint(raw),
        payerIdentityDigest:payerIdentityDigest(p.appId,s.db.users[p.ownerId].openId),...patch}};
    trusted.set(raw,s.clone(envelope));return raw;
  }
  function service(){return createPaymentNotificationService({runTransaction:s.runTransaction,now:()=>s.controls.now,
    ...s.settings,provider,maxNotificationBytes:16384,newRequestId:()=> 'OFFLINE_NOTIFICATION_TRACE_'+(++trace),
    verifyAndNormalize:async raw=>{if(s.controls.verifierThrows)throw new Error('PRIVATE_VERIFIER_FAILURE');
      return trusted.has(raw)?s.clone(trusted.get(raw)):null;},
    loadConfiguration:(tx,_binding,time)=>createPaymentConfigurationModel(tx.readConfiguration(),{...s.settings,now:time})});}
  return {...s,paymentId,notification,notificationService:service,provider};
}
module.exports={setup};
