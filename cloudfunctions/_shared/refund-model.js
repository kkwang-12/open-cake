'use strict';
// Trusted internal ledger plans; never calls a payment provider.
const {canonicalJSON,requestFingerprint,scopedDocumentId}=require('./idempotency-model');
const {validateOrderTime,validatePayments}=require('./order-cancellation-model');
const {validateOriginalLog}=require('./payment-notification-model');
const {validateTradeSnapshot}=require('./trade-model');
const {bindingOf}=require('./payment-recovery-model');
const {freeze}=require('./payment-intent-model');
const counter=v=>Number.isSafeInteger(v)&&v>=0;
const time=v=>counter(v)&&v>0&&Number.isFinite(new Date(v).getTime());
const text=v=>typeof v==='string'&&v.trim()===v&&v.length>0&&v.length<=256;
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
function fail(code){throw Object.assign(new Error(code),{code});}
const axes=o=>Object.fromEntries(['orderStatus','paymentStatus','refundStatus','paidCents','refundedCents','refundReservedCents','version'].map(k=>[k,o[k]]));
function validateLedger(state,context){
  const {order:o,payment:p,refund:r,refunds,attempts,logs}=state;
  if(!o||!p||!r||!Array.isArray(refunds)||!Array.isArray(attempts))fail('INVALID_REFUND_STATE');
  validateOrderTime(o,context.now);validatePayments(o,state.payments,{now:context.now,appId:context.appId});
  validateOriginalLog(o,logs);
  if(o.paymentStatus!=='PAID'||p.status!=='PAID'||p.accountingState!=='APPLIED'||p.environment!==context.environment||
      p.provider!==context.provider||!text(p.transactionId)||!time(p.confirmedAt)||p.confirmedAt>p.updatedAt||
      !state.payments.some(v=>canonicalJSON(v)===canonicalJSON(p))||
      state.payments.filter(v=>v.status==='PAID'&&v.accountingState==='APPLIED').length!==1||
      state.payments.some(v=>v._id!==p._id&&v.status!=='CLOSED'))fail('REFUND_PAYMENT_UNRESOLVED');
  let settled=0,reserved=0,count=0;
  if(new Set(refunds.map(v=>v?._id)).size!==refunds.length||new Set(refunds.map(v=>v?.outRefundNo)).size!==refunds.length)
    fail('INVALID_REFUND_STATE');
  for(const item of refunds){
    if(!item||!text(item._id)||item.schemaVersion!==1||!counter(item.version)||item.orderId!==o._id||item.paymentId!==p._id||
        item.currency!=='CNY'||!counter(item.amountCents)||!item.amountCents||!text(item.outRefundNo)||
        !time(item.createdAt)||!time(item.updatedAt)||item.createdAt<o.createdAt||item.updatedAt<item.createdAt||item.updatedAt>context.now||
        !['PENDING','FAILED','SUCCEEDED'].includes(item.status)||
        (item.providerRefundId!==null&&!text(item.providerRefundId))||
        (item.status==='SUCCEEDED'?(item.budgetState!=='SETTLED'||!time(item.settledAt)||
          ![1,1000].includes(item.settledAtPrecisionMs)||item.settledAtPrecisionMs===1000&&item.settledAt%1000!==0||
          !time(item.settledAt+item.settledAtPrecisionMs-1)||item.settledAt+item.settledAtPrecisionMs-1<item.createdAt||
          item.settledAt>item.updatedAt||!text(item.providerRefundId)||!text(item.lastEventId)):
          (item.budgetState!=='RESERVED'||item.settledAt!==null||item.settledAtPrecisionMs!==null)))fail('INVALID_REFUND_STATE');
    const approval=logs.find(log=>log._id===item.approvalLogId);
    if(!approval||!['APPROVE_REFUND','APPROVE_CANCELLATION','REJECT_ORDER','LATE_PAYMENT_REFUND_RESERVED'].includes(approval.command)||
        canonicalJSON(approval.actor)!==canonicalJSON(item.approvedBy)||approval.after.refundReservedCents-
        approval.before.refundReservedCents!==item.amountCents||approval.createdAt>item.createdAt)fail('REFUND_APPROVAL_REQUIRED');
    if(item.status==='SUCCEEDED')settled+=item.amountCents;else{reserved+=item.amountCents;count++;}
    if(!counter(settled)||!counter(reserved))fail('INVALID_REFUND_STATE');
  }
  if(count>1||settled!==o.refundedCents||reserved!==o.refundReservedCents||settled+reserved>o.paidCents||
      !refunds.some(v=>canonicalJSON(v)===canonicalJSON(r)))fail('INVALID_REFUND_BUDGET');
  const expected=count?(refunds.find(v=>v.budgetState==='RESERVED').status==='FAILED'?'FAILED':'PENDING'):
    settled?'SUCCEEDED':'NONE';
  if(o.refundStatus!==expected)fail('INVALID_REFUND_BUDGET');
  const binding=context.configuration.plan('REFUND_QUERY',context.now);
  if(binding.environment!==p.environment||binding.appId!==p.appId||binding.merchantId!==p.merchantId||
      binding.route!==p.provider||binding.profileVersion!==p.profileVersion||binding.stage!==p.stage)
    fail('PAYMENT_CONFIGURATION_CHANGED');
  const sorted=[...attempts].sort((a,b)=>a.sequence-b.sequence);
  sorted.forEach((a,i)=>{
    if(!a||!text(a._id)||a.schemaVersion!==1||!counter(a.version)||a.refundId!==r._id||a.sequence!==i+1||
        !['SUBMIT','QUERY'].includes(a.operation)||a.outRefundNo!==r.outRefundNo||!text(a.requestId)||
        !time(a.startedAt)||a.startedAt<r.createdAt||a.createdAt!==a.startedAt||!time(a.updatedAt)||a.updatedAt<a.startedAt||
        a.updatedAt>context.now||(a.outcome==='STARTED'?(a.finishedAt!==null||a.eventId!==null):
        (!['ACCEPTED','UNKNOWN','FAILED','CONFIRMED'].includes(a.outcome)||!time(a.finishedAt)||
          a.finishedAt<a.startedAt||a.finishedAt>a.updatedAt||!text(a.eventId))))fail('INVALID_REFUND_ATTEMPT');
  });
  return sorted;
}
function planAttempt(state,operation,key,context){
  const attempts=validateLedger(state,context),r=state.refund;
  if(!['SUBMIT','QUERY'].includes(operation)||!text(key))fail('INVALID_REFUND_REQUEST');
  const id=scopedDocumentId('refund-attempt',[context.environment,r._id,operation,key]);
  const previous=attempts.find(a=>a._id===id);
  if(previous)return freeze({disposition:'ATTEMPT_REPLAY',attempt:null,attemptId:id});
  if(r.status==='SUCCEEDED')return freeze({disposition:'ALREADY_SETTLED',attempt:null,attemptId:null});
  const latest=attempts.at(-1);
  if(operation==='SUBMIT'&&latest&&!(r.status==='FAILED'&&latest.outcome==='FAILED'))
    return freeze({disposition:'QUERY_REQUIRED',attempt:null,attemptId:null});
  if(!counter(context.queryRetryAfterMs)||context.queryRetryAfterMs<1)fail('INVALID_CONFIGURATION');
  // Only a read can be retried on timeout. No timeout creates another SUBMIT
  // right or changes the original attempt/funds; late results retain sequence fences.
  if(operation==='QUERY'&&latest?.operation==='QUERY'&&latest.outcome==='STARTED'&&
      context.now-latest.startedAt<context.queryRetryAfterMs)
    return freeze({disposition:'QUERY_IN_FLIGHT',attempt:null,attemptId:latest._id});
  if(!counter(attempts.length+1))fail('VERSION_CONFLICT');
  return freeze({disposition:'TRANSPORT_REQUIRED',attemptId:id,attempt:{_id:id,schemaVersion:1,version:0,
    createdAt:context.now,updatedAt:context.now,refundId:r._id,sequence:attempts.length+1,operation,
    outRefundNo:r.outRefundNo,requestId:key,startedAt:context.now,finishedAt:null,outcome:'STARTED',eventId:null,errorCode:null}});
}
const evidenceFields=['attemptId','providerEventId','binding','outTradeNo','transactionId','outRefundNo','providerRefundId',
  'currency','paymentCents','refundCents','outcome','occurredAt','occurredAtPrecisionMs','verificationMethod'];
function validateEvidence(v,state,context){
  const p=state.payment,r=state.refund,a=state.attempt;
  if(!exact(v,evidenceFields)||!a||v.attemptId!==a._id||!text(v.providerEventId)||
      canonicalJSON(v.binding)!==canonicalJSON(bindingOf(p))||v.outTradeNo!==p.outTradeNo||v.transactionId!==p.transactionId||
      v.outRefundNo!==r.outRefundNo||v.currency!=='CNY'||v.paymentCents!==p.amountCents||v.refundCents!==r.amountCents||
      !['ACCEPTED','UNKNOWN','FAILED','SUCCESS'].includes(v.outcome)||
      !['SERVER_AUTHENTICATED_PROVIDER_RESPONSE','PLATFORM_AUTHENTICATED_PROVIDER_RESULT'].includes(v.verificationMethod)||
      (p.provider==='WECHATPAY_DIRECT_V3'?v.verificationMethod!=='SERVER_AUTHENTICATED_PROVIDER_RESPONSE':
        v.verificationMethod!=='PLATFORM_AUTHENTICATED_PROVIDER_RESULT')||
      (v.providerRefundId!==null&&!text(v.providerRefundId))||
      ![1,1000].includes(v.occurredAtPrecisionMs)||
      (v.outcome==='SUCCESS'?(!text(v.providerRefundId)||!time(v.occurredAt)||
        v.occurredAtPrecisionMs===1000&&v.occurredAt%1000!==0||!time(v.occurredAt+v.occurredAtPrecisionMs-1)||
        !state.attempts.some(item=>item.operation==='SUBMIT'&&item.startedAt<=v.occurredAt+v.occurredAtPrecisionMs-1)||v.occurredAt>context.now):
        v.occurredAt!==null)||
      (r.providerRefundId!==null&&v.providerRefundId!==null&&r.providerRefundId!==v.providerRefundId))fail('REFUND_EVIDENCE_MISMATCH');
}
function planResult(v,state,context){
  validateLedger(state,context);
  const a=state.attempt,r=state.refund,o=state.order;
  if(!a||!state.attempts.some(item=>canonicalJSON(item)===canonicalJSON(a)))fail('INVALID_REFUND_ATTEMPT');
  validateEvidence(v,state,context);
  const eventId=scopedDocumentId('refund-result',[context.environment,state.payment.merchantId,v.providerEventId]);
  const fingerprint=requestFingerprint(v);
  if(state.event){
    if(state.event._id!==eventId||state.event.recordType!=='REFUND_RESULT'||state.event.semanticFingerprint!==fingerprint||state.event.refundId!==r._id)fail('REFUND_EVENT_CONFLICT');
    return freeze({disposition:'RESULT_REPLAY',event:null,attempt:null,refund:null,order:null,log:null,guard:null});
  }
  const guardId=v.providerRefundId?scopedDocumentId('provider-refund-guard',[state.payment.merchantId,v.providerRefundId]):null;
  if(state.guard&&(state.guard._id!==guardId||state.guard.recordType!=='REFUND_GUARD'||state.guard.refundId!==r._id||state.guard.amountCents!==r.amountCents))
    fail('REFUND_PROVIDER_ID_CONFLICT');
  if(r.status==='SUCCEEDED'&&v.outcome==='SUCCESS'&&(v.providerRefundId!==r.providerRefundId||
      v.occurredAt!==r.settledAt||v.occurredAtPrecisionMs!==r.settledAtPrecisionMs))
    fail('REFUND_EVIDENCE_MISMATCH');
  const common={schemaVersion:1,version:0,createdAt:context.now,updatedAt:context.now};
  const event={...common,_id:eventId,recordType:'REFUND_RESULT',kind:'REFUND',source:a.operation==='QUERY'?'QUERY':'RECONCILIATION',
    refundId:r._id,paymentId:state.payment._id,environment:context.environment,provider:context.provider,
    providerEventId:v.providerEventId,receivedAt:context.now,processedAt:context.now,binding:bindingOf(state.payment),
    verificationStatus:'VERIFIED',processingStatus:'APPLIED',semanticFingerprint:fingerprint,outcome:v.outcome,
    evidence:JSON.parse(canonicalJSON(v))};
  // Query success may settle even if its observation lost a race with a newer query.
  // Old negative results never undo a later attempt or already settled funds.
  const latest=Math.max(...state.attempts.map(item=>item.sequence));
  const ignored=r.status==='SUCCEEDED'||(v.outcome!=='SUCCESS'&&(a.outcome!=='STARTED'||a.sequence<latest));
  let nextRefund=null,nextOrder=null,log=null;
  if(!ignored&&['SUCCESS','FAILED'].includes(v.outcome)){
    nextRefund={...r,version:r.version+1,updatedAt:context.now,lastEventId:eventId,
      status:v.outcome==='SUCCESS'?'SUCCEEDED':'FAILED',budgetState:v.outcome==='SUCCESS'?'SETTLED':'RESERVED',
      providerRefundId:v.providerRefundId||r.providerRefundId,settledAt:v.outcome==='SUCCESS'?v.occurredAt:null,
      settledAtPrecisionMs:v.outcome==='SUCCESS'?v.occurredAtPrecisionMs:null,
      lastErrorCode:v.outcome==='FAILED'?'REFUND_PROVIDER_FAILED':null};
    nextOrder={...o,version:o.version+1,updatedAt:context.now,refundStatus:nextRefund.status,
      refundedCents:o.refundedCents+(v.outcome==='SUCCESS'?r.amountCents:0),
      refundReservedCents:o.refundReservedCents-(v.outcome==='SUCCESS'?r.amountCents:0)};
    validateTradeSnapshot({...nextOrder,id:o._id});
    log={...common,_id:scopedDocumentId('refund-result-log',[eventId]),orderId:o._id,
      command:v.outcome==='SUCCESS'?'REFUND_CONFIRMED':'REFUND_FAILED',actor:{type:'SYSTEM',subjectId:null,service:'refund-recovery'},
      before:axes(o),after:axes(nextOrder),eventId,requestId:context.requestId,reason:''};
  }else if(!ignored&&v.providerRefundId!==null&&r.providerRefundId===null){
    // Acceptance establishes identity even though it proves no settled money.
    nextRefund={...r,version:r.version+1,updatedAt:context.now,providerRefundId:v.providerRefundId,lastEventId:eventId};
  }
  if(nextRefund&&(!counter(nextRefund.version)||nextOrder&&!counter(nextOrder.version)))fail('VERSION_CONFLICT');
  const attempt=a.outcome==='STARTED'?{...a,version:a.version+1,updatedAt:context.now,finishedAt:context.now,eventId,
    outcome:v.outcome==='SUCCESS'?'CONFIRMED':v.outcome,errorCode:v.outcome==='FAILED'?'REFUND_PROVIDER_FAILED':null}:null;
  return freeze({disposition:ignored?'OBSERVATION_ONLY':v.outcome==='SUCCESS'?'REFUND_SETTLED':v.outcome==='FAILED'?'REFUND_FAILED':'QUERY_REQUIRED',
    event,attempt,refund:nextRefund,order:nextOrder,log,
    guard:guardId&&!state.guard?{...common,_id:guardId,recordType:'REFUND_GUARD',refundId:r._id,amountCents:r.amountCents}:null});
}
module.exports={validateLedger,planAttempt,planResult,validateEvidence};
