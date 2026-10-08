'use strict';
// Internal transactional orchestration. No SDK, endpoint or money transport.
const {canonicalJSON,scopedDocumentId}=require('./idempotency-model');
const {freeze}=require('./payment-intent-model');
const {bindingOf}=require('./payment-recovery-model');
const {planAttempt,planResult}=require('./refund-model');
function fail(code){throw Object.assign(new Error(code),{code});}
const text=v=>typeof v==='string'&&v.trim()===v&&v.length>0&&v.length<=256;
const methods=['readRefundState','readAttempt','readEvent','assertRefundReads','insertAttempt','saveAttempt','insertEvent','saveRefund','saveOrder','insertLog'];
function createRefundService(options){
  const {runTransaction,now,loadConfiguration,verifyRefundInvocation,verifyRefundResult,newRequestId,environment,appId,provider,maxResultBytes,queryRetryAfterMs}=options;
  if(![runTransaction,now,loadConfiguration,verifyRefundInvocation,verifyRefundResult,newRequestId].every(v=>typeof v==='function')||
      ![environment,appId].every(text)||!['WECHATPAY_DIRECT_V3','CLOUDBASE_INTEGRATION_V3'].includes(provider)||
      !Number.isSafeInteger(maxResultBytes)||maxResultBytes<1||
      !Number.isSafeInteger(queryRetryAfterMs)||queryRetryAfterMs<1)fail('INVALID_CONFIGURATION');
  async function stateFor(tx,refundId){
    if(!tx||methods.some(key=>typeof tx[key]!=='function'))fail('INVALID_TRANSACTION_ADAPTER');
    const state=await tx.readRefundState(refundId);if(!state?.refund||state.refund._id!==refundId)fail('NOT_FOUND');
    const timestamp=now(),configuration=await loadConfiguration(tx,bindingOf(state.payment),timestamp);
    return {state,context:{now:timestamp,configuration,environment,appId,provider,queryRetryAfterMs,requestId:newRequestId()}};
  }
  async function fence(tx,state){if(await tx.assertRefundReads(state)!==true)fail('VERSION_CONFLICT');}
  async function write(effect){if(await effect!==1)fail('VERSION_CONFLICT');}
  function finish(context){const at=now();if(!Number.isSafeInteger(at)||at<context.now||!text(context.requestId))fail('INVALID_CONFIGURATION');}
  const flags={scope:'OFFLINE_REFUND_RESULT',cloudVerified:false,callable:false,externalRefundExecuted:false};
  return Object.freeze({
    async prepare(refundId,operation,key,invocation){
      if(!text(refundId)||!text(key)||!['SUBMIT','QUERY'].includes(operation))fail('INVALID_REQUEST');
      let accepted;try{accepted=await verifyRefundInvocation(invocation,{refundId,operation,key});}catch(_){fail('REFUND_AUTH_UNAVAILABLE');}
      if(accepted!==true)fail('FORBIDDEN');
      return runTransaction(async tx=>{
        const {state,context}=await stateFor(tx,refundId),plan=planAttempt(state,operation,key,context);await fence(tx,state);
        if(plan.attempt)await write(tx.insertAttempt(plan.attempt));finish(context);
        return freeze({...flags,disposition:plan.disposition,attemptId:plan.attemptId,
          transportPlan:plan.attempt?{operation,binding:bindingOf(state.payment),outTradeNo:state.payment.outTradeNo,
            transactionId:state.payment.transactionId,outRefundNo:state.refund.outRefundNo,currency:'CNY',
            paymentCents:state.payment.amountCents,refundCents:state.refund.amountCents}:null});
      });
    },
    async acceptResult(raw){
      let encoded;try{encoded=canonicalJSON(raw);}catch(_){fail('INVALID_REFUND_INPUT');}
      if(Buffer.byteLength(encoded,'utf8')>maxResultBytes)fail('INVALID_REFUND_INPUT');
      let verified;try{verified=await verifyRefundResult(raw,now());}catch(_){fail('REFUND_VERIFIER_UNAVAILABLE');}
      if(!verified||!text(verified.attemptId))fail('REFUND_SOURCE_REJECTED');
      return runTransaction(async tx=>{
        if(!tx||methods.some(key=>typeof tx[key]!=='function'))fail('INVALID_TRANSACTION_ADAPTER');
        const attempt=await tx.readAttempt(verified.attemptId);if(!attempt)fail('INVALID_REFUND_ATTEMPT');
        const {state,context}=await stateFor(tx,attempt.refundId);state.attempt=attempt;
        if(!text(verified.providerEventId))fail('REFUND_EVIDENCE_MISMATCH');
        const eventId=scopedDocumentId('refund-result',[environment,state.payment.merchantId,verified.providerEventId]);
        state.event=await tx.readEvent(eventId);
        state.guard=verified.providerRefundId?await tx.readEvent(scopedDocumentId('provider-refund-guard',[state.payment.merchantId,verified.providerRefundId])):null;
        const plan=planResult(verified,state,context);await fence(tx,state);
        if(plan.event)await write(tx.insertEvent(plan.event));if(plan.guard)await write(tx.insertEvent(plan.guard));
        if(plan.attempt)await write(tx.saveAttempt(plan.attempt,attempt.version));
        if(plan.refund)await write(tx.saveRefund(plan.refund,state.refund.version));
        if(plan.order)await write(tx.saveOrder(plan.order,state.order.version));
        if(plan.log)await write(tx.insertLog(plan.log));finish(context);
        return freeze({...flags,disposition:plan.disposition,eventId,refundId:state.refund._id});
      });
    }
  });
}
module.exports={createRefundService};
