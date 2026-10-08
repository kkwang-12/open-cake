'use strict';
// Trusted internal orchestration; never executes a provider or refund request.
const {randomBytes}=require('node:crypto');
const {scopedDocumentId,canonicalJSON}=require('./idempotency-model');
const {freeze}=require('./payment-intent-model');
const {createPaymentNotificationModel}=require('./payment-notification-model');
const {persistPaymentNotificationPlan}=require('./payment-notification-service');
const {bindingOf,validateTicket,planRequest,validateResponse,observationId,planObservation,planLateCompensation}=require('./payment-recovery-model');
function fail(code){throw Object.assign(new Error(code),{code});}
const text=v=>typeof v==='string'&&v.trim()===v&&v.length>0&&v.length<=256;
const methods=['readEvent','readPayment','readOrder','readOrderPayments','readUser','readHeldState','readBudget','readLogs',
  'readRefunds','assertRecoveryReads','insertEvent','saveEvent','savePayment','saveOrder','saveBudget',
  'updateResource','updateReservation','insertLog','insertRefund'];
const flags={scope:'OFFLINE_PAYMENT_RECOVERY_RESULT',cloudVerified:false,callable:false,paymentAllowed:false,externalRefundExecuted:false};
function createPaymentRecoveryService(options){
  const {runTransaction,now,loadConfiguration,verifyRecoveryInvocation,verifyRecoveryResponse,
    environment,appId,provider,maxRecoveryBytes,newRequestId=()=>randomBytes(16).toString('hex').toUpperCase(),
    newOutRefundNo=()=>randomBytes(16).toString('hex').toUpperCase()}=options;
  if(![runTransaction,now,loadConfiguration,verifyRecoveryInvocation,verifyRecoveryResponse,newRequestId,newOutRefundNo].every(v=>typeof v==='function')||
      ![environment,appId].every(text)||!['WECHATPAY_DIRECT_V3','CLOUDBASE_INTEGRATION_V3'].includes(provider)||
      !Number.isSafeInteger(maxRecoveryBytes)||maxRecoveryBytes<1)fail('INVALID_CONFIGURATION');
  async function authorize(invocation,operation,paymentId,purpose){
    if(!text(paymentId))fail('INVALID_REQUEST');
    let valid;try{valid=await verifyRecoveryInvocation(invocation,{operation,paymentId,purpose});}catch(_){fail('RECOVERY_AUTH_UNAVAILABLE');}
    if(valid!==true)fail('FORBIDDEN');
  }
  async function stateFor(tx,paymentId){
    if(!tx||methods.some(k=>typeof tx[k]!=='function'))fail('INVALID_TRANSACTION_ADAPTER');
    const payment=await tx.readPayment(paymentId);
    if(!payment||payment._id!==paymentId)fail('NOT_FOUND');
    const order=await tx.readOrder(payment.orderId),payments=await tx.readOrderPayments(payment.orderId),
      user=order?await tx.readUser(order.ownerId):null,held=order?await tx.readHeldState(order):null,
      logs=await tx.readLogs(payment.orderId),refunds=await tx.readRefunds(paymentId,payment.orderId),timestamp=now();
    const configuration=await loadConfiguration(tx,bindingOf(payment),timestamp),budget=await tx.readBudget(configuration,bindingOf(payment));
    return {payment,order,payments,user,held,logs,refunds,budget,configuration,timestamp};
  }
  const context=(state,requestId)=>({now:state.timestamp,environment,appId,provider,configuration:state.configuration,requestId});
  async function fence(tx,state){
    if(await tx.assertRecoveryReads(state)!==true)fail('VERSION_CONFLICT');
  }
  function beforeCommit(timestamp){const value=now();if(!Number.isSafeInteger(value)||value<timestamp)fail('INVALID_CONFIGURATION');}
  async function write(effect){if(await effect!==1)fail('VERSION_CONFLICT');}
  async function prepare(paymentId,operation,purpose,invocation,basisEventId=null){
    await authorize(invocation,operation,paymentId,purpose);const key=operation==='CLOSE'?basisEventId:newRequestId();
    if(!text(key))fail('INVALID_CONFIGURATION');
    return runTransaction(async tx=>{
      const state=await stateFor(tx,paymentId);
      state.basis=basisEventId?await tx.readEvent(basisEventId):null;
      const id=scopedDocumentId('payment-recovery-request',[environment,paymentId,operation,key]);
      state.request=await tx.readEvent(id);
      const plan=planRequest(state,operation,purpose,key,context(state,id));await fence(tx,state);
      if(plan.request)await write(tx.insertEvent(plan.request));
      if(plan.payment)await write(tx.savePayment(plan.payment,state.payment.version));
      beforeCommit(state.timestamp);
      return freeze({...flags,disposition:plan.disposition,requestId:plan.requestId,paymentId,
        // Internal transport instructions only; nothing is sent or client-callable.
        transportPlan:plan.request?{operation,binding:plan.request.binding,outTradeNo:state.payment.outTradeNo}:null});
    });
  }
  return Object.freeze({
    prepareQuery(paymentId,invocation){return prepare(paymentId,'QUERY','VERIFY',invocation);},
    prepareClose(paymentId,basisEventId,purpose,invocation){return prepare(paymentId,'CLOSE',purpose,invocation,basisEventId);},
    async acceptResponse(raw){
      let encoded;try{encoded=canonicalJSON(raw);}catch(_){fail('INVALID_RECOVERY_INPUT');}
      if(Buffer.byteLength(encoded,'utf8')>maxRecoveryBytes)fail('INVALID_RECOVERY_INPUT');
      let verified;try{verified=await verifyRecoveryResponse(raw,now());}catch(_){fail('RECOVERY_VERIFIER_UNAVAILABLE');}
      if(verified===null)fail('RECOVERY_SOURCE_REJECTED');
      const v=validateResponse(verified),trace=newRequestId();if(!text(trace))fail('INVALID_CONFIGURATION');
      return runTransaction(async tx=>{
        if(!tx||methods.some(k=>typeof tx[k]!=='function'))fail('INVALID_TRANSACTION_ADAPTER');
        const request=await tx.readEvent(v.requestId);
        if(!request)fail('INVALID_RECOVERY_REQUEST');
        const state=await stateFor(tx,request.paymentId);state.request=request;
        validateTicket(request,state.payment,context(state,trace));
        state.observation=await tx.readEvent(observationId(request));
        const plan=planObservation(v,state,context(state,trace));
        let money=null;
        if(v.operation==='QUERY'&&v.outcome==='SUCCESS'){
          const model=createPaymentNotificationModel({...options,source:'QUERY',maxNotificationBytes:maxRecoveryBytes,
            verifyAndNormalize:async()=>({providerEventId:request._id,binding:v.binding,evidence:v.evidence,verificationMethod:v.verificationMethod})});
          const token=await model.authenticate(raw,state.timestamp),auth=model.inspect(token);
          state.event=await tx.readEvent(auth.eventId);state.transaction=auth.transactionId?await tx.readEvent(auth.transactionId):null;
          const moneyState=Object.fromEntries(['event','transaction','payment','order','user','payments','held','logs','budget'].map(k=>[k,state[k]]));
          money=model.plan(token,moneyState,context(state,trace));
        }
        await fence(tx,state);
        await persistPaymentNotificationPlan(tx,plan,state,state.timestamp);
        if(money)await persistPaymentNotificationPlan(tx,money,state,state.timestamp);
        beforeCommit(state.timestamp);
        return freeze({...flags,disposition:money?.disposition||plan.disposition,paymentId:state.payment._id,
          eventId:plan.proposedEvents[0]?._id||state.observation._id,moneyEventId:money?.eventId||null,
          requiresPaymentCoordination:money?money.requiresPaymentCoordination:
            state.payment.accountingState==='QUARANTINED'||(plan.disposition==='OBSERVATION_REPLAY'?
              state.observation.disposition:plan.disposition)!=='CLOSED_OBSERVED'});
      });
    },
    async compensateLate(paymentId,invocation){
      await authorize(invocation,'COMPENSATE',paymentId,'LATE_PAYMENT');const trace=newRequestId();
      if(!text(trace))fail('INVALID_CONFIGURATION');
      return runTransaction(async tx=>{
        const state=await stateFor(tx,paymentId),p=state.payment;
        state.guard=await tx.readEvent(scopedDocumentId('payment-transaction',[p.provider,p.merchantId,p.transactionId]));
        state.compensation=await tx.readEvent(scopedDocumentId('late-payment-compensation',[environment,p._id,p.transactionId]));
        const plan=planLateCompensation(state,{...context(state,trace),outRefundNo:state.compensation?null:newOutRefundNo()});
        await fence(tx,state);
        for(const e of plan.proposedEvents)await write(tx.insertEvent(e));
        if(plan.proposedGuard)await write(tx.saveEvent(plan.proposedGuard,state.guard.version));
        if(plan.proposedPayment)await write(tx.savePayment(plan.proposedPayment,p.version));
        if(plan.proposedRefund)await write(tx.insertRefund(plan.proposedRefund));
        for(const change of plan.resourceChanges)await write(tx.updateResource(change,state.timestamp));
        for(const change of plan.reservationChanges)await write(tx.updateReservation(change));
        if(plan.proposedOrder)await write(tx.saveOrder(plan.proposedOrder,state.order.version));
        if(plan.proposedLog)await write(tx.insertLog(plan.proposedLog));
        beforeCommit(state.timestamp);
        return freeze({...flags,disposition:plan.disposition,paymentId,refundId:plan.proposedRefund?._id||state.compensation.refundId,
          requiresPaymentCoordination:true,requiresAlert:true});
      });
    }
  });
}
module.exports={createPaymentRecoveryService};
