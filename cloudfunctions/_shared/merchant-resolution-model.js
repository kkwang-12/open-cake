'use strict';
// A06 trusted financial/review snapshot guards and plans; no provider transport.
const {validateOrderTime,validatePayments,planCancelledResources}=require('./order-cancellation-model');
const {validateOriginalLog}=require('./payment-notification-model');
const {validateLedger,planAttempt}=require('./refund-model');
const {validateJob}=require('./payment-maintenance-model');
const {planControlledOrderCommand}=require('./order-command-model');
const {canonicalJSON,scopedDocumentId}=require('./idempotency-model');
const fail=code=>{throw Object.assign(new Error(code),{code});};
const copy=value=>JSON.parse(canonicalJSON(value));
const counter=value=>Number.isSafeInteger(value)&&value>=0;
const time=value=>counter(value)&&value>0&&Number.isFinite(new Date(value).getTime());
const text=value=>typeof value==='string'&&value.length>0&&value.length<=2048&&value===value.normalize('NFC').trim()&&value.isWellFormed()&&!/[\u0000-\u001f\u007f]/.test(value);
const dense=value=>Array.isArray(value)&&Object.keys(value).length===value.length;
const unique=rows=>dense(rows)&&rows.every(row=>row&&text(row._id))&&new Set(rows.map(row=>row._id)).size===rows.length;
const axes=order=>Object.fromEntries(['orderStatus','paymentStatus','refundStatus','paidCents','refundedCents','refundReservedCents','version'].map(field=>[field,order[field]]));
function validateReviews(order,rows,logs,context){
  if(!unique(rows)||rows.filter(row=>row.status==='PENDING').length>1)fail('INVALID_CANCELLATION_REVIEW');
  for(const row of rows){
    const original=logs.find(log=>log._id===row.requestLogId),review=logs.find(log=>log._id===row.reviewLogId);
    if(row.schemaVersion!==1||row.orderId!==order._id||row.ownerId!==order.ownerId||!counter(row.version)||!time(row.createdAt)||
      !time(row.updatedAt)||row.createdAt<order.createdAt||row.updatedAt<row.createdAt||row.updatedAt>context.now||!text(row.reason)||
      row._id!==scopedDocumentId('cancellation-request',[context.environment,context.appId,order._id,row.requestLogId])||
      !original||original.command!=='REQUEST_CANCELLATION'||original.createdAt!==row.createdAt||original.actor?.type!=='CUSTOMER'||
      original.actor.subjectId!==order.ownerId||original.actor.service!==null||
      (row.status==='PENDING'?row.version!==0||row.reviewerId!==null||row.reviewedAt!==null||row.reviewReason!==null||
        row.approvedRefundCents!==null||row.refundId!==null||row.reviewLogId!==null||row.updatedAt!==row.createdAt:
        !['APPROVED','REJECTED'].includes(row.status)||row.version!==1||!text(row.reviewerId)||!text(row.reviewReason)||row.reviewedAt!==row.updatedAt||
        !review||review.command!==(row.status==='APPROVED'?'APPROVE_CANCELLATION':'REJECT_CANCELLATION')||review.createdAt!==row.reviewedAt||
        review.actor?.type!=='STORE'||review.actor.subjectId!==row.reviewerId||review.actor.service!==null||
        (row.status==='REJECTED'?row.approvedRefundCents!==null||row.refundId!==null:!counter(row.approvedRefundCents)||
          row.approvedRefundCents>order.paidCents||(row.approvedRefundCents===0?row.refundId!==null:!text(row.refundId)))))fail('INVALID_CANCELLATION_REVIEW');
  }
}
function validateResolutionState(state,order,context){
  if(!state||state.complete!==true||state.environment!==context.environment||state.appId!==context.appId||
    ['payments','refunds','attempts','logs','cancellations'].some(field=>!unique(state[field])))fail('INVALID_RESOLUTION_STATE');
  validateOrderTime(order,context.now);validateOriginalLog(order,state.logs);validatePayments(order,state.payments,context);
  if(state.payments.some(payment=>payment.environment!==context.environment||!['WECHATPAY_DIRECT_V3','CLOUDBASE_INTEGRATION_V3'].includes(payment.provider))||
    state.refunds.some(refund=>refund.orderId!==order._id)||state.attempts.some(attempt=>!state.refunds.some(refund=>refund._id===attempt.refundId)))fail('INVALID_RESOLUTION_STATE');
  validateReviews(order,state.cancellations,state.logs,context);
  for(const row of state.cancellations.filter(row=>row.refundId!==null)){
    const refund=state.refunds.find(refund=>refund._id===row.refundId);
    if(!refund||refund.cancellationRequestId!==row._id||refund.approvalLogId!==row.reviewLogId||refund.amountCents!==row.approvedRefundCents)fail('INVALID_CANCELLATION_REVIEW');
  }
}
function paymentFor(order,state,context){
  validatePayments(order,state.payments,context);
  const paid=state.payments.filter(payment=>payment.status==='PAID'&&payment.accountingState==='APPLIED'),payment=paid[0];
  if(paid.length!==1||!payment||order.paymentStatus!=='PAID'||state.payments.some(other=>other._id!==payment._id&&other.status!=='CLOSED')||
    payment.environment!==context.environment||!['WECHATPAY_DIRECT_V3','CLOUDBASE_INTEGRATION_V3'].includes(payment.provider)||
    !time(payment.confirmedAt)||payment.confirmedAt>payment.updatedAt||!text(payment.transactionId))fail('REFUND_PAYMENT_UNRESOLVED');
  return payment;
}
function ledgerFor(order,state,refund,configuration,context){
  const payment=paymentFor(order,state,context),ledger={order,payment,payments:state.payments,refunds:state.refunds,refund,
    attempts:state.attempts.filter(attempt=>attempt.refundId===refund._id),logs:state.logs};
  validateLedger(ledger,{...context,provider:payment.provider,configuration});return ledger;
}
function planResolution(domain,event,order,state,principal,roles,context){
  const review=event.payload.reviewId?state.cancellations.find(row=>row._id===event.payload.reviewId):null;
  const plan=planControlledOrderCommand(domain,event,{...order,id:order._id},principal,roles,{...context,review:review?{...review,id:review._id}:null});
  const supported=['APPLY_ORDER_PATCH','CREATE_CANCELLATION_REVIEW','APPROVE_CANCELLATION_REVIEW','REJECT_CANCELLATION_REVIEW',
    'RESOLVE_CANCELLED_RESERVATIONS','CREATE_REFUND_INTENT','RECORD_REFUND_APPROVAL','APPEND_ORDER_LOG','SAVE_IDEMPOTENCY_RESULT'];
  if(plan.requiredAtomicEffects.some(effect=>!supported.includes(effect)))fail('UNSUPPORTED_ORDER_EFFECT');
  if(plan.command==='REQUEST_CANCELLATION'&&state.cancellations.some(row=>row.status==='PENDING'))fail('CANCELLATION_PENDING');
  const common={schemaVersion:1,version:0,createdAt:context.now,updatedAt:context.now},next={...order,...plan.patch};
  if(plan.effectInput.refundCents>0){next.refundStatus='PENDING';next.refundReservedCents+=plan.effectInput.refundCents;}
  const {requiresFinalAfter,...draft}=plan.logDraft,log={...common,...draft,after:axes(next)};
  let request=null;
  if(plan.command==='REQUEST_CANCELLATION')request={...common,_id:scopedDocumentId('cancellation-request',[context.environment,context.appId,order._id,log._id]),
    orderId:order._id,ownerId:order.ownerId,status:'PENDING',reason:plan.effectInput.reason,requestLogId:log._id,reviewLogId:null,
    reviewerId:null,reviewedAt:null,reviewReason:null,approvedRefundCents:null,refundId:null};
  else if(review)request={...copy(review),version:review.version+1,updatedAt:context.now,status:plan.command==='APPROVE_CANCELLATION'?'APPROVED':'REJECTED',
    reviewerId:principal.subjectId,reviewedAt:context.now,reviewReason:plan.effectInput.reason,reviewLogId:log._id,
    approvedRefundCents:plan.command==='APPROVE_CANCELLATION'?plan.effectInput.refundCents:null,refundId:null};
  let resolution={resourceChanges:[],reservationChanges:[]};
  if(plan.command==='APPROVE_CANCELLATION'){
    const quote=state.quote;
    if(!quote||quote._id!==order.quoteId||quote.status!=='CONSUMED'||quote.consumedOrderId!==order._id||quote.ownerId!==order.ownerId||
      quote.storeId!==order.storeId||quote.facts?.appointmentSnapshot?.slotId!==order.appointmentSnapshot?.slotId)fail('INVALID_RESOLUTION_STATE');
    resolution=planCancelledResources(order,quote.resourceVersions,state.reservations,state.resources,{...context,logId:log._id});
  }
  validateOrderTime(next,context.now);
  return {plan,next,log,request,requestBefore:review,resolution};
}
function planRefundRetry(ledger,receiptId,context){
  const attempts=validateLedger(ledger,context),latest=attempts.at(-1),operation=!latest||ledger.refund.status==='FAILED'&&latest.outcome==='FAILED'?'SUBMIT':'QUERY';
  const plan=planAttempt(ledger,operation,receiptId,context);
  return {...plan,operation};
}
function validateFinanceState(state,storeId,context){
  if(!state||state.complete!==true||state.environment!==context.environment||state.appId!==context.appId||state.storeId!==storeId||
    ['orders','payments','refunds','attempts','logs','cancellations','jobs'].some(field=>!unique(state[field])))fail('INVALID_FINANCE_STATE');
  for(const order of state.orders){if(order.storeId!==storeId)fail('INVALID_FINANCE_STATE');
    validateResolutionState({...state,payments:state.payments.filter(row=>row.orderId===order._id),refunds:state.refunds.filter(row=>row.orderId===order._id),
      logs:state.logs.filter(row=>row.orderId===order._id),cancellations:state.cancellations.filter(row=>row.orderId===order._id),
      attempts:state.attempts.filter(row=>state.refunds.some(refund=>refund._id===row.refundId&&refund.orderId===order._id))},order,context);
    if(order.paymentStatus==='PAID')paymentFor(order,{payments:state.payments.filter(row=>row.orderId===order._id)},context);}
  if(['payments','refunds','logs','cancellations'].some(field=>state[field].some(row=>!state.orders.some(order=>order._id===row.orderId)))||
    state.attempts.some(row=>!state.refunds.some(refund=>refund._id===row.refundId)))fail('INVALID_FINANCE_STATE');
  for(const job of state.jobs){
    const record=job.kind==='REFUND_QUERY'?state.refunds.find(row=>row._id===job.entityId):job.kind==='ORDER_CANCELLATION_REVIEW'?
      state.orders.find(row=>row._id===job.entityId):state.payments.find(row=>row._id===job.entityId);
    const payment=record&&(record.paymentId?state.payments.find(row=>row._id===record.paymentId):record.orderId?record:
      state.payments.find(row=>row.orderId===record._id&&row.merchantId===job.merchantId&&row.provider===job.provider));
    if(!record||!payment||record.version<job.entityVersion)fail('INVALID_FINANCE_STATE');
    validateJob(job,{environment:context.environment,appId:context.appId,merchantId:payment.merchantId,provider:payment.provider},context.now);
    if(job.lastOutcome!==null&&!['RESOLVED','RETRY','REVIEW'].includes(job.lastOutcome))fail('INVALID_FINANCE_STATE');
  }
}
const refundDTO=(refund,order,attempts)=>({_id:refund._id,version:refund.version,createdAt:refund.createdAt,updatedAt:refund.updatedAt,
  orderId:order._id,orderNo:order.orderNo,currency:refund.currency,amountCents:refund.amountCents,status:refund.status,budgetState:refund.budgetState,
  settledAt:refund.settledAt,lastErrorCode:refund.lastErrorCode==='REFUND_PROVIDER_FAILED'?refund.lastErrorCode:null,attempts:attempts.map(attempt=>({_id:attempt._id,sequence:attempt.sequence,
    operation:attempt.operation,startedAt:attempt.startedAt,finishedAt:attempt.finishedAt,outcome:attempt.outcome,errorCode:attempt.errorCode==='REFUND_PROVIDER_FAILED'?attempt.errorCode:null})),
  paidCents:order.paidCents,refundedCents:order.refundedCents,refundReservedCents:order.refundReservedCents});
module.exports={validateResolutionState,validateFinanceState,paymentFor,ledgerFor,planResolution,planRefundRetry,refundDTO,axes};
