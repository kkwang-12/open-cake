'use strict';
// OFFLINE_TEST_ONLY object-identity authentication and serial memory adapter.
const {setup:notificationSetup}=require('./payment-notification');
const {createPaymentRecoveryService}=require('../../cloudfunctions/_shared/payment-recovery-service');
const {createPaymentConfigurationModel}=require('../../cloudfunctions/_shared/payment-configuration-model');
const {requestFingerprint}=require('../../cloudfunctions/_shared/idempotency-model');
const {payerIdentityDigest}=require('../../cloudfunctions/_shared/payment-notification-model');
const {createOrderCancellationService}=require('../../cloudfunctions/_shared/order-cancellation-service');
async function setup(options={}){
  const s=await notificationSetup({...options,extendTransaction:(tx,db,changed)=>{
    tx.readPayment=async id=>db.payments[id]||null;tx.readRefunds=async(id,orderId)=>Object.values(db.refunds).filter(r=>r.paymentId===id||r.orderId===orderId);
    tx.assertRecoveryReads=tx.assertPaymentReads;
    tx.saveEvent=async(e,version)=>{if(db.events[e._id]?.version!==version)return 0;db.events[e._id]=s.clone(e);return changed();};
    tx.insertRefund=async r=>{if(db.refunds[r._id]||Object.values(db.refunds).some(v=>v.outRefundNo===r.outRefundNo))return 0;
      db.refunds[r._id]=s.clone(r);return changed();};
    tx.readCancellationState=async o=>({...db.held,payments:await tx.readPayments(o._id)});
    tx.assertCancellationReads=tx.assertPaymentReads;
  }});
  s.db.refunds={};let seq=0;const proofs=new WeakMap(),invocation=Object.freeze({offline:true});
  const optionsFor=()=>({...s.settings,provider:s.provider,runTransaction:s.runTransaction,now:()=>s.controls.now,
    maxRecoveryBytes:16384,newRequestId:()=> 'OFFLINE_RECOVERY_'+(++seq),newOutRefundNo:()=> 'OFFLINE_REFUND_'+(++seq),
    loadConfiguration:(tx,_binding,time)=>createPaymentConfigurationModel(tx.readConfiguration(),{...s.settings,now:time}),
    verifyRecoveryInvocation:async v=>v===invocation&&!s.controls.denyInvocation,
    verifyRecoveryResponse:async raw=>{if(s.controls.recoveryVerifierThrows)throw new Error('PRIVATE_SECRET');return proofs.get(raw)||null;}});
  function response(requestId,outcome='SUCCESS',patch={},extra={}){
    const raw=Object.freeze({body:'OFFLINE_RECOVERY_RESPONSE_'+(++seq)}),p=s.db.payments[s.paymentId],request=s.db.events[requestId];
    proofs.set(raw,{requestId,binding:request.binding,operation:request.operation,outcome,
      verificationMethod:s.provider==='WECHATPAY_DIRECT_V3'?'SERVER_AUTHENTICATED_PROVIDER_RESPONSE':'PLATFORM_AUTHENTICATED_PROVIDER_RESULT',
      evidence:{appId:p.appId,merchantId:p.merchantId,outTradeNo:p.outTradeNo,currency:'CNY',amountCents:p.amountCents,
        transactionId:outcome==='SUCCESS'?'OFFLINE_TRANSACTION_1':null,outRefundNo:null,providerRefundId:null,
        resultCode:outcome,occurredAt:outcome==='SUCCESS'?s.controls.now:null,occurredAtPrecisionMs:1,
        payloadDigest:requestFingerprint(raw),payerIdentityDigest:outcome==='SUCCESS'?payerIdentityDigest(p.appId,s.db.users[p.ownerId].openId):null,...patch},...extra});
    return raw;
  }
  const service=()=>createPaymentRecoveryService(optionsFor());
  const cancellationService=()=>createOrderCancellationService({...s.settings,runTransaction:s.runTransaction,now:()=>s.controls.now,
    newRequestId:()=> 'OFFLINE_CANCEL_'+(++seq),redactReason:v=>v,verifyExpiryInvocation:async v=>v===invocation});
  return {...s,invocation,recoveryService:service,response,cancellationService,optionsFor};
}
module.exports={setup};
