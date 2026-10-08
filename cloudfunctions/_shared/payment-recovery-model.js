'use strict';
// Offline plans only. Provider transport, scheduler and refunds are not supplied.
const {canonicalJSON,requestFingerprint,scopedDocumentId}=require('./idempotency-model');
const {validateOrderTime,validatePayments,planCancelledResources}=require('./order-cancellation-model');
const {validateBudget,validatePending,freeze}=require('./payment-intent-model');
const {validateStoredEvent,validateOriginalLog,semanticFingerprint,payerIdentityDigest}=require('./payment-notification-model');
const {validateTradeSnapshot,assertRefundAmount}=require('./trade-model');
function fail(code){throw Object.assign(new Error(code),{code});}
const counter=v=>Number.isSafeInteger(v)&&v>=0;
const time=v=>counter(v)&&v>0&&Number.isFinite(new Date(v).getTime());
const text=v=>typeof v==='string'&&v.trim()===v&&v.length>0&&v.length<=256;
const bindingKeys=['environment','stage','appId','merchantId','provider','profileVersion'];
const evidenceKeys=['appId','merchantId','outTradeNo','transactionId','outRefundNo','providerRefundId','currency',
  'amountCents','resultCode','occurredAt','occurredAtPrecisionMs','payloadDigest','payerIdentityDigest'];
const axes=o=>Object.fromEntries(['orderStatus','paymentStatus','refundStatus','paidCents','refundedCents','refundReservedCents','version'].map(k=>[k,o[k]]));
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
function copy(v){try{return JSON.parse(canonicalJSON(v));}catch(_){fail('INVALID_RECOVERY_EVIDENCE');}}
function bindingOf(p){return Object.fromEntries(bindingKeys.map(k=>[k,p[k]]));}
function matches(p,b){return bindingKeys.every(k=>p[k]===b[k]);}
function validateRecoveryState(state,context,operation='QUERY'){
  const {payment:p,order:o}=state;
  if(!p||!o||p.environment!==context.environment||p.appId!==context.appId||p.provider!==context.provider)fail('PAYMENT_SCOPE_MISMATCH');
  validateOrderTime(o,context.now);validatePayments(o,state.payments,{now:context.now,appId:context.appId});
  if(!state.payments.some(v=>canonicalJSON(v)===canonicalJSON(p)))fail('INVALID_PAYMENT_STATE');
  const b=context.configuration.plan(operation,context.now);
  if(!matches(p,{...b,provider:b.route}))fail('PAYMENT_CONFIGURATION_CHANGED');
  return b;
}
function ticketRecord(p,operation,id,basisEventId,purpose,now){
  return {_id:id,schemaVersion:1,version:0,createdAt:now,updatedAt:now,recordType:'RECOVERY_REQUEST',
    source:'QUERY',kind:operation==='CLOSE'?'CLOSE':'PAYMENT',operation,purpose,basisEventId,
    environment:p.environment,provider:p.provider,binding:bindingOf(p),paymentId:p._id,orderId:p.orderId,
    outTradeNo:p.outTradeNo,paymentVersion:p.version,requestState:'REQUESTED'};
}
function validateTicket(r,p,context){
  if(!r||r.recordType!=='RECOVERY_REQUEST'||r.schemaVersion!==1||r.version!==0||!text(r._id)||
      !['QUERY','CLOSE'].includes(r.operation)||!['VERIFY','CANCEL','EXPIRE'].includes(r.purpose)||
      r.source!=='QUERY'||r.kind!==(r.operation==='CLOSE'?'CLOSE':'PAYMENT')||r.requestState!=='REQUESTED'||
      !time(r.createdAt)||r.updatedAt!==r.createdAt||r.createdAt>context.now||!counter(r.paymentVersion)||
      r.paymentVersion>p.version||r.paymentId!==p._id||r.orderId!==p.orderId||r.outTradeNo!==p.outTradeNo||
      r.environment!==context.environment||r.provider!==context.provider||!exact(r.binding,bindingKeys)||!matches(p,r.binding))
    fail('INVALID_RECOVERY_REQUEST');
}
function planRequest(state,operation,purpose,key,context){
  validateRecoveryState(state,context,operation);const p=state.payment,o=state.order;
  if(!['QUERY','CLOSE'].includes(operation)||!['VERIFY','CANCEL','EXPIRE'].includes(purpose)||!text(key))fail('INVALID_RECOVERY_REQUEST');
  const id=scopedDocumentId('payment-recovery-request',[context.environment,p._id,operation,key]);
  if(state.request){validateTicket(state.request,p,context);
    if(state.request._id!==id||state.request.operation!==operation||state.request.purpose!==purpose||
        state.request.basisEventId!==(operation==='CLOSE'?state.basis?._id:null))fail('INVALID_RECOVERY_REQUEST');
    return freeze({disposition:'QUERY_REQUIRED',request:null,payment:null,requestId:id});}
  if(operation==='CLOSE'){
    validatePending(p,o);
    const basis=state.basis;
    if(p.status!=='PENDING'||o.orderStatus!=='PENDING_PAYMENT'||purpose==='VERIFY'||
        purpose==='EXPIRE'&&context.now<o.paymentDeadlineAt)fail('INVALID_TRANSITION');
    if(!basis||basis.recordType!=='RECOVERY_OBSERVATION'||basis.verificationStatus!=='VERIFIED'||basis.outcome!=='NOTPAY'||basis.disposition!=='UNPAID_OBSERVED'||
        basis.paymentId!==p._id||basis.paymentVersion!==p.version||!matches(p,basis.binding)||basis.source!=='QUERY'||
        !time(basis.createdAt)||basis.createdAt>context.now||basis.semanticFingerprint!==requestFingerprint(basis.facts))
      fail('FRESH_UNPAID_QUERY_REQUIRED');
  }
  if(!counter(p.version+1))fail('VERSION_CONFLICT');
  const payment=operation==='CLOSE'?{...p,version:p.version+1,updatedAt:context.now,closeRequestedAt:context.now}:null;
  const request=ticketRecord(payment||p,operation,id,operation==='CLOSE'?state.basis._id:null,purpose,context.now);
  return freeze({disposition:operation+'_REQUEST_REQUIRED',request,payment,requestId:id});
}
function validateResponse(value){
  const v=copy(value);
  if(!exact(v,['requestId','binding','operation','outcome','verificationMethod','evidence'])||!text(v.requestId)||
      !exact(v.binding,bindingKeys)||!bindingKeys.every(k=>text(v.binding[k]))||!['QUERY','CLOSE'].includes(v.operation)||
      !(v.operation==='QUERY'?['SUCCESS','CLOSED','NOTPAY','UNKNOWN']:['ACKNOWLEDGED','ALREADY_PAID','UNKNOWN']).includes(v.outcome)||
      !['SERVER_AUTHENTICATED_PROVIDER_RESPONSE','PLATFORM_AUTHENTICATED_PROVIDER_RESULT'].includes(v.verificationMethod)||
      !exact(v.evidence,evidenceKeys)||!['appId','merchantId','outTradeNo','currency','resultCode','transactionId'].every(k=>v.evidence[k]===null||text(v.evidence[k]))||
      !(v.evidence.amountCents===null||counter(v.evidence.amountCents))||
      !(v.evidence.occurredAt===null||time(v.evidence.occurredAt))||![1,1000].includes(v.evidence.occurredAtPrecisionMs)||
      v.evidence.outRefundNo!==null||v.evidence.providerRefundId!==null||
      !/^[a-f0-9]{64}$/.test(v.evidence.payloadDigest)||
      !(v.evidence.payerIdentityDigest===null||/^[a-f0-9]{64}$/.test(v.evidence.payerIdentityDigest)))fail('INVALID_RECOVERY_EVIDENCE');
  return freeze(v);
}
function observationId(request){return scopedDocumentId('payment-recovery-observation',[request._id]);}
function planObservation(v,state,context){
  const binding=validateRecoveryState(state,context),p=state.payment,o=state.order,r=state.request;
  validateTicket(r,p,context);
  if(v.requestId!==r._id||v.operation!==r.operation||!matches(p,v.binding)||
      v.verificationMethod!==(p.provider==='WECHATPAY_DIRECT_V3'?'SERVER_AUTHENTICATED_PROVIDER_RESPONSE':'PLATFORM_AUTHENTICATED_PROVIDER_RESULT'))
    fail('PAYMENT_SCOPE_MISMATCH');
  const e=v.evidence;
  if(e.appId!==p.appId||e.merchantId!==p.merchantId||e.outTradeNo!==p.outTradeNo)fail('PAYMENT_SCOPE_MISMATCH');
  const facts={binding:v.binding,operation:v.operation,outcome:v.outcome,evidence:Object.fromEntries(Object.entries(e).filter(([k])=>k!=='payloadDigest'))};
  const fingerprint=requestFingerprint(facts),id=observationId(r);
  if(state.observation){const previous=state.observation;
    if(previous._id!==id||previous.recordType!=='RECOVERY_OBSERVATION'||previous.paymentId!==p._id||previous.schemaVersion!==1||
        previous.version!==0||previous.source!=='QUERY'||previous.verificationStatus!=='VERIFIED'||!matches(p,previous.binding)||
        previous.outcome!==previous.facts?.outcome||previous.updatedAt!==previous.createdAt||
        previous.requestId!==r._id||!time(previous.createdAt)||previous.createdAt>context.now||previous.createdAt<r.createdAt||
        previous.semanticFingerprint!==requestFingerprint(previous.facts))fail('INVALID_RECOVERY_EVIDENCE');
    if(previous.semanticFingerprint!==fingerprint)fail('RECOVERY_RESPONSE_CONFLICT');
    return freeze({disposition:'OBSERVATION_REPLAY',proposedEvents:[],proposedPayment:null,proposedBudget:null,proposedOrder:null,proposedLog:null,
      resourceChanges:[],reservationChanges:[]});}
  const base={proposedEvents:[],proposedPayment:null,proposedBudget:null,proposedOrder:null,proposedLog:null,resourceChanges:[],reservationChanges:[]};
  let disposition='QUERY_REQUIRED';
  if(v.operation==='QUERY'&&v.outcome==='SUCCESS')disposition='RECONCILE_SUCCESS';
  else if(p.status==='PAID'||o.paymentStatus==='PAID'||r.paymentVersion!==p.version)disposition='STALE_QUERY';
  else if(v.operation==='QUERY'&&v.outcome==='NOTPAY'){
    if(e.resultCode!=='NOTPAY'||e.transactionId!==null||e.occurredAt!==null||e.amountCents!==p.amountCents||e.currency!==p.currency)
      fail('INVALID_UNPAID_EVIDENCE');
    disposition='UNPAID_OBSERVED';
  }
  else if(v.operation==='QUERY'&&v.outcome==='CLOSED'){
    if(e.resultCode!=='CLOSED'||e.transactionId!==null||e.occurredAt!==null||e.amountCents!==p.amountCents||e.currency!==p.currency)
      fail('INVALID_CLOSED_EVIDENCE');
    if(p.status==='CLOSED')disposition='CLOSED_OBSERVED';
    else if(p.status!=='PENDING'||o.orderStatus!=='PENDING_PAYMENT')disposition='PAYMENT_COORDINATION_REQUIRED';
    else {
      validatePending(p,o);
      validateOriginalLog(o,state.logs);
      let budget=null;
      if(binding.stage!=='production'){
        validateBudget(binding,state.budget,context.now);
        if(p.controlledBudgetId!==state.budget._id||p.authorizationFingerprint!==state.budget.authorizationFingerprint||
            p.budgetConsumedAt!==null||p.budgetReleasedAt!==null||state.budget.reservedAmountCents<p.amountCents||
            state.budget.reservedTransactions<1||!counter(state.budget.version+1))fail('INVALID_CONTROLLED_PAYMENT_BUDGET');
        budget={...state.budget,version:state.budget.version+1,updatedAt:context.now,
          reservedAmountCents:state.budget.reservedAmountCents-p.amountCents,reservedTransactions:state.budget.reservedTransactions-1};
      }
      const next={...p,status:'CLOSED',closedAt:context.now,lastEventId:id,version:p.version+1,updatedAt:context.now,
        budgetReleasedAt:budget?context.now:null};
      if(!counter(next.version))fail('VERSION_CONFLICT');
      base.proposedPayment=next;base.proposedBudget=budget;disposition='CLOSED_OBSERVED';
      if(state.payments.every(other=>other._id===p._id||other.status==='CLOSED')&&o.paymentStatus!=='CLOSED'){
        const order={...o,paymentStatus:'CLOSED',version:o.version+1,updatedAt:context.now};
        if(!counter(order.version))fail('VERSION_CONFLICT');validateTradeSnapshot({...order,id:o._id});base.proposedOrder=order;
        base.proposedLog={_id:scopedDocumentId('order-payment-close-log',[id,o._id]),schemaVersion:1,version:0,createdAt:context.now,updatedAt:context.now,
          orderId:o._id,command:'PAYMENT_CLOSED',actor:{type:'SYSTEM',subjectId:null,service:'payment-recovery'},
          before:axes(o),after:axes(order),eventId:id,requestId:context.requestId,reason:'',publicMessage:'付款单已关闭'};
      }
    }
  }
  base.proposedEvents=[{_id:id,schemaVersion:1,version:0,createdAt:context.now,updatedAt:context.now,
    recordType:'RECOVERY_OBSERVATION',source:'QUERY',kind:v.operation==='CLOSE'?'CLOSE':'PAYMENT',requestId:r._id,
    paymentId:p._id,paymentVersion:p.version,environment:p.environment,provider:p.provider,binding:v.binding,
    outcome:v.outcome,disposition,verificationStatus:'VERIFIED',facts,semanticFingerprint:fingerprint}];
  return freeze({...base,disposition});
}
function planLateCompensation(state,context){
  const b=validateRecoveryState(state,context,'REFUND');const p=state.payment,o=state.order,g=state.guard;
  validateStoredEvent(g,scopedDocumentId('payment-transaction',[p.provider,p.merchantId,p.transactionId]));
  if(g.recordType!=='TRANSACTION_GUARD'||g.verificationStatus!=='VERIFIED'||g.paymentId!==p._id||
      !matches(p,g.binding)||g.environment!==p.environment||g.processedAt>context.now||p.status!=='PAID'||p.transactionId!==g.evidence.transactionId||p.amountCents!==g.evidence.amountCents||
      p.currency!==g.evidence.currency||g.evidence.appId!==p.appId||g.evidence.outTradeNo!==p.outTradeNo||
      g.evidence.merchantId!==p.merchantId||g.evidence.resultCode!=='SUCCESS'||!time(p.confirmedAt)||p.confirmedAt!==g.evidence.occurredAt||
      !Array.isArray(state.refunds))fail('INVALID_COMPENSATION_STATE');
  const eventId=scopedDocumentId('late-payment-compensation',[p.environment,p._id,p.transactionId]);
  const refundId=scopedDocumentId('late-payment-refund',[p.environment,p._id,p.transactionId]);
  if(b.stage!=='production'){
    validateBudget(b,state.budget,context.now);
    if(p.controlledBudgetId!==state.budget._id||p.authorizationFingerprint!==state.budget.authorizationFingerprint||
        !time(p.budgetConsumedAt)||p.budgetConsumedAt>p.updatedAt||state.budget.usedAmountCents<p.amountCents||state.budget.usedTransactions<1)
      fail('COMPENSATION_REVIEW_REQUIRED');
  }
  if(state.compensation){
    const c=state.compensation,refund=state.refunds.find(r=>r._id===refundId);
    if(c._id!==eventId||c.recordType!=='LATE_PAYMENT_COMPENSATION'||c.paymentId!==p._id||c.refundId!==refundId||
        c.transactionId!==p.transactionId||c.amountCents!==p.amountCents||o.orderStatus!=='CANCELLED'||o.paymentStatus!=='PAID'||
        p.accountingState!=='APPLIED'||g.processingStatus!=='APPLIED'||g.reconciliationEventId!==eventId||
        !refund||state.refunds.length!==1||refund.paymentId!==p._id||refund.orderId!==o._id||refund.amountCents!==p.amountCents||
        !['PENDING','FAILED','SUCCEEDED'].includes(refund.status)||!text(refund.outRefundNo)||
        c.guardId!==g._id||c.externalRefundExecuted!==false||c.requiresAlert!==true||
        !time(c.createdAt)||c.updatedAt!==c.createdAt||c.createdAt>context.now||
        (refund.status==='SUCCEEDED'?refund.budgetState!=='SETTLED'||o.refundedCents!==p.amountCents||o.refundReservedCents!==0:
          refund.budgetState!=='RESERVED'||o.refundReservedCents!==p.amountCents||o.refundedCents!==0))fail('INVALID_COMPENSATION_STATE');
    validateOriginalLog(o,state.logs);
    return freeze({disposition:'COMPENSATION_REPLAY',proposedEvents:[],resourceChanges:[],reservationChanges:[]});
  }
  if(!['CANCELLED_ORDER_PAYMENT','LATE_OR_CLOSED_PAYMENT'].includes(g.errorCode)||g.processingStatus!=='QUARANTINED'||
      p.accountingState!=='QUARANTINED'||!['PENDING_PAYMENT','CANCELLED'].includes(o.orderStatus)||o.paidCents!==0||
      o.orderStatus==='PENDING_PAYMENT'&&!time(p.closedAt)&&p.confirmedAt<p.expiresAt&&p.confirmedAt<o.paymentDeadlineAt||
      state.payments.some(other=>other._id!==p._id&&other.status!=='CLOSED')||state.refunds.length!==0||
      (p.stage!=='production'&&!time(p.budgetConsumedAt)))fail('COMPENSATION_REVIEW_REQUIRED');
  validateOriginalLog(o,state.logs);
  const logId=scopedDocumentId('late-payment-compensation-log',[eventId]);
  const held=state.held,quote=held?.quote;
  if(!quote||quote._id!==o.quoteId||quote.status!=='CONSUMED'||quote.consumedOrderId!==o._id||quote.ownerId!==o.ownerId||
      quote.storeId!==o.storeId||quote.facts?.fulfillment!==o.fulfillment||quote.facts.appointmentSnapshot?.slotId!==o.appointmentSnapshot.slotId)
    fail('INVALID_COMPENSATION_STATE');
  const u=state.user,upper=p.confirmedAt+g.evidence.occurredAtPrecisionMs-1;
  if(!u||u._id!==p.ownerId||u.schemaVersion!==1||!counter(u.version)||!['ACTIVE','DISABLED'].includes(u.status)||
      u.environment!==p.environment||u.appId!==p.appId||!text(u.openId)||
      scopedDocumentId('user',[p.environment,p.appId,u.openId])!==u._id||g.evidence.payerIdentityDigest!==payerIdentityDigest(p.appId,u.openId)||
      ![1,1000].includes(g.evidence.occurredAtPrecisionMs)||!time(upper)||upper<p.createdAt||
      upper<(p.dispatchStartedAt||0)||p.confirmedAt>context.now)fail('INVALID_COMPENSATION_STATE');
  const resolution=planCancelledResources(o,quote.resourceVersions,held.reservations,held.resources,
    {environment:p.environment,now:context.now,logId});
  if(!/^[A-Za-z0-9_|*-]{6,32}$/.test(context.outRefundNo))fail('INVALID_REFUND_NUMBER');
  const order={...o,orderStatus:'CANCELLED',paymentStatus:'PAID',paidCents:p.amountCents,
    paidAt:Math.max(p.confirmedAt,o.createdAt,p.createdAt,p.dispatchStartedAt||0),
    cancelledAt:o.cancelledAt||context.now,cancellationReason:o.cancellationReason||'付款结果超过可履约期限',
    refundStatus:'PENDING',refundReservedCents:p.amountCents,version:o.version+1,updatedAt:context.now};
  assertRefundAmount({...order,refundStatus:'NONE',refundReservedCents:0,id:o._id},p.amountCents);
  validateTradeSnapshot({...order,id:o._id});
  if(![order.version,p.version+1,g.version+1].every(counter))fail('VERSION_CONFLICT');
  const actor={type:'SYSTEM',subjectId:null,service:'payment-recovery'},common={schemaVersion:1,version:0,createdAt:context.now,updatedAt:context.now};
  return freeze({disposition:'REFUND_INTENT_RESERVED',resourceChanges:resolution.resourceChanges,reservationChanges:resolution.reservationChanges,
    proposedOrder:order,proposedPayment:{...p,accountingState:'APPLIED',version:p.version+1,updatedAt:context.now,reconciliationEventId:eventId},
    proposedGuard:{...g,processingStatus:'APPLIED',errorCode:null,version:g.version+1,updatedAt:context.now,processedAt:context.now,reconciliationEventId:eventId},
    proposedRefund:{...common,_id:refundId,orderId:o._id,paymentId:p._id,cancellationRequestId:null,approvalLogId:logId,approvedBy:actor,
      reason:'迟到付款自动补偿',currency:p.currency,amountCents:p.amountCents,outRefundNo:context.outRefundNo,
      providerRefundId:null,status:'PENDING',budgetState:'RESERVED',settledAt:null,settledAtPrecisionMs:null,lastEventId:null,lastErrorCode:null},
    proposedEvents:[{...common,_id:eventId,recordType:'LATE_PAYMENT_COMPENSATION',source:'RECONCILIATION',kind:'REFUND',
      environment:p.environment,provider:p.provider,paymentId:p._id,refundId,transactionId:p.transactionId,
      amountCents:p.amountCents,guardId:g._id,requiresAlert:true,externalRefundExecuted:false}],
    proposedLog:{...common,_id:logId,orderId:o._id,command:'LATE_PAYMENT_REFUND_RESERVED',actor,before:axes(o),after:axes(order),
      eventId,requestId:context.requestId,reason:'',publicMessage:'付款已核实，订单取消，退款待处理'}});
}
module.exports={bindingOf,validateRecoveryState,validateTicket,planRequest,validateResponse,observationId,planObservation,planLateCompensation,copy,semanticFingerprint};
