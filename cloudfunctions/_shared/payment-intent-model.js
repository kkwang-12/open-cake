'use strict';
// Internal offline intent preparation. No SDK, provider request or payment success.
const {randomBytes}=require('node:crypto');
const {parseApiRequest}=require('./api-contract');
const {requireOwner}=require('./authorization-model');
const {validateOrderTime,validatePayments,planCancelledResources}=require('./order-cancellation-model');
const {assertExpectedVersion}=require('./trade-model');
const {canonicalJSON,scopedDocumentId,requestFingerprint,decideIdempotency}=require('./idempotency-model');
function fail(code){throw Object.assign(new Error(code),{code});}
const counter=v=>Number.isSafeInteger(v)&&v>=0;
const text=v=>typeof v==='string'&&v.trim()===v&&v.length>0&&v.length<=256;
const time=v=>counter(v)&&v>0&&Number.isFinite(new Date(v).getTime());
const number=v=>typeof v==='string'&&/^[A-Za-z0-9_|*-]{6,32}$/.test(v);
function freeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
function copy(v){try{return JSON.parse(canonicalJSON(v));}catch(_){fail('INVALID_PAYMENT_STATE');}}
function newMerchantOrderNumber(){return randomBytes(16).toString('hex').toUpperCase();}
function preparePaymentRequest(event,principal){
  requireOwner(principal,{ownerId:principal&&principal.subjectId});
  const {contract,payload}=parseApiRequest('payment',event);
  if(contract.action!=='create')fail('INVALID_REQUEST');
  return freeze({payload,request:{environment:principal.environment,
    actorScope:JSON.stringify([principal.appId,principal.subjectId]),command:'payment.create',key:payload.idempotencyKey,
    requestFingerprint:requestFingerprint({orderId:payload.orderId,expectedVersion:payload.expectedVersion})}});
}
function paymentBinding(configuration,operation,now,principal){
  if(!configuration||typeof configuration.plan!=='function')fail('CONFIGURATION_REQUIRED');
  const binding=configuration.plan(operation,now);
  if(binding.scope!=='OFFLINE_PAYMENT_OPERATION_PLAN'||binding.environment!==principal.environment||
      binding.appId!==principal.appId||!text(binding.profileVersion))fail('PAYMENT_BINDING_MISMATCH');
  return binding;
}
function validatePending(payment,order){
  if(!number(payment.outTradeNo)||!text(payment.environment)||!text(payment.profileVersion)||
      !['development','test','production'].includes(payment.stage)||!counter(payment.creationOrderVersion)||
      !['PREPARED','REQUESTED','UNKNOWN'].includes(payment.dispatchState)||
      payment.accountingState!=='UNAPPLIED'||payment.transactionId!==null||payment.confirmedAt!==null||
      payment.closedAt!==null||payment.lastEventId!==null||
      payment.expiresAt>order.paymentDeadlineAt||
      (payment.stage==='production'?payment.controlledTestRef!==null:!text(payment.controlledTestRef))||
      (payment.dispatchState==='PREPARED'?payment.dispatchToken!==null||payment.dispatchStartedAt!==null:
        !text(payment.dispatchToken)||!time(payment.dispatchStartedAt)||payment.dispatchStartedAt<payment.createdAt||
        payment.dispatchStartedAt>payment.updatedAt))fail('INVALID_PAYMENT_STATE');
}
function originalBindingMatches(payment,binding){
  return ['environment','stage','appId','merchantId','profileVersion'].every(k=>payment[k]===binding[k])&&
    payment.provider===binding.route;
}
function validateHeld(order,state,principal,now){
  const quote=state.quote;
  if(!quote||quote._id!==order.quoteId||quote.status!=='CONSUMED'||quote.consumedOrderId!==order._id||
      quote.ownerId!==order.ownerId||quote.storeId!==order.storeId||quote.facts?.fulfillment!==order.fulfillment||
      quote.facts.appointmentSnapshot?.slotId!==order.appointmentSnapshot?.slotId)fail('INVALID_PAYMENT_STATE');
  // Reuse O05's complete HELD validation only. None of its release effects run.
  planCancelledResources(order,quote.resourceVersions,state.reservations,state.resources,
    {environment:principal.environment,now,logId:'OFFLINE_PAYMENT_VALIDATION_ONLY'});
}
function validateBudget(binding,budget,now){
  const grant=binding.controlledTestLimits;
  if(binding.stage==='production')return null;
  const id=scopedDocumentId('controlled-payment-budget',[binding.environment,binding.appId,binding.merchantId,grant.reference]);
  if(!budget||budget._id!==id||budget.schemaVersion!==1||!counter(budget.version)||
      budget.authorizationFingerprint!==requestFingerprint(grant)||
      !time(budget.createdAt)||!time(budget.updatedAt)||budget.updatedAt<budget.createdAt||budget.updatedAt>now||
      !['reservedAmountCents','reservedTransactions','usedAmountCents','usedTransactions'].every(k=>counter(budget[k])))
    fail('INVALID_CONTROLLED_PAYMENT_BUDGET');
  const amount=budget.reservedAmountCents+budget.usedAmountCents,count=budget.reservedTransactions+budget.usedTransactions;
  if(!counter(amount)||!counter(count)||amount>grant.maxTotalCents||count>grant.maxTransactions)
    fail('INVALID_CONTROLLED_PAYMENT_BUDGET');
  return budget;
}
function reserveBudget(binding,budget,amount,now){
  if(binding.stage==='production')return null;
  validateBudget(binding,budget,now);const grant=binding.controlledTestLimits;
  const total=budget.reservedAmountCents+budget.usedAmountCents+amount;
  const count=budget.reservedTransactions+budget.usedTransactions+1;
  if(!counter(total)||!counter(count)||total>grant.maxTotalCents||count>grant.maxTransactions)
    fail('CONTROLLED_PAYMENT_BUDGET_EXCEEDED');
  if(!counter(budget.version+1))fail('VERSION_CONFLICT');
  return freeze({...budget,version:budget.version+1,updatedAt:now,
    reservedAmountCents:budget.reservedAmountCents+amount,reservedTransactions:budget.reservedTransactions+1});
}
function planPaymentIntent(raw,event,principal,context){
  const {payload,request}=preparePaymentRequest(event,principal),state=copy(raw),order=state.order;
  if(!order||order._id!==payload.orderId)fail('NOT_FOUND');
  requireOwner(principal,order);validateOrderTime(order,context.now);
  if(order.orderStatus!=='PENDING_PAYMENT'||!['UNPAID','PENDING','CLOSED','EXCEPTION'].includes(order.paymentStatus))
    fail('INVALID_TRANSITION');
  validatePayments(order,state.payments,{now:context.now,appId:principal.appId});
  const decision=decideIdempotency(state.receipt,request);
  if(decision.disposition==='BUSY')fail('BUSY');
  if(decision.disposition==='REPLAY'&&decision.result.errorCode!==null)fail(decision.result.errorCode);
  if(decision.disposition!=='REPLAY')assertExpectedVersion(order,payload.expectedVersion);
  const pending=state.payments.filter(p=>p.status==='PENDING');
  if(pending.length>1)fail('INVALID_PAYMENT_STATE');
  const base={scope:'OFFLINE_PAYMENT_INTENT_PLAN',request,decision,orderId:order._id,orderVersion:order.version,
    paymentDeadlineAt:order.paymentDeadlineAt,cloudVerified:false,callable:false,paymentAllowed:false};
  const replay=decision.disposition==='REPLAY'?state.payments.find(p=>p._id===decision.result.entityId):null;
  if(decision.disposition==='REPLAY'&&(!replay||decision.result.version!==payload.expectedVersion))fail('INVALID_IDEMPOTENCY_RECORD');
  if(state.payments.some(p=>['PAID','EXCEPTION'].includes(p.status))||['CLOSED','EXCEPTION'].includes(order.paymentStatus))
    return freeze({...base,disposition:'PAYMENT_COORDINATION_REQUIRED',paymentId:replay?._id||null});
  if(replay&&replay.status!=='PENDING')return freeze({...base,disposition:'PAYMENT_COORDINATION_REQUIRED',paymentId:replay._id});
  if(pending.length){
    const payment=pending[0];validatePending(payment,order);
    if(replay&&replay._id!==payment._id)fail('INVALID_IDEMPOTENCY_RECORD');
    const binding=paymentBinding(context.configuration,'QUERY',context.now,principal);
    if(!originalBindingMatches(payment,binding))return freeze({...base,disposition:'PAYMENT_COORDINATION_REQUIRED',paymentId:payment._id});
    const reusable=payment.dispatchState==='PREPARED'&&!payment.closeRequestedAt&&context.now<payment.expiresAt;
    return freeze({...base,disposition:reusable?'REUSE_PREPARED':'QUERY_REQUIRED',paymentId:payment._id,
      binding,proposedPayment:null,proposedBudget:null});
  }
  if(decision.disposition==='REPLAY'||order.paymentStatus!=='UNPAID')fail('INVALID_PAYMENT_STATE');
  if(context.now>=order.paymentDeadlineAt)fail('PAYMENT_DEADLINE_EXPIRED');
  validateHeld(order,state,principal,context.now);
  const binding=paymentBinding(context.configuration,'CREATE',context.now,principal);
  const c=binding.prepayConstraints,safety=context.dispatchSafetyMs;
  if(!c||!counter(safety))fail('CONFIGURATION_REQUIRED');
  const expiresAt=Math.floor(Math.min(order.paymentDeadlineAt,context.now+c.maximumLifetimeMs)/1000)*1000;
  if(expiresAt-context.now<c.minimumLifetimeMs+safety)fail('PAYMENT_WINDOW_TOO_SHORT');
  const outTradeNo=context.newOutTradeNo();if(!number(outTradeNo))fail('INVALID_MERCHANT_ORDER_NUMBER');
  const payment={_id:scopedDocumentId('payment',[principal.environment,principal.subjectId,order._id,payload.idempotencyKey]),
    schemaVersion:1,version:0,createdAt:context.now,updatedAt:context.now,orderId:order._id,ownerId:order.ownerId,
    provider:binding.route,merchantId:binding.merchantId,appId:binding.appId,environment:binding.environment,
    stage:binding.stage,profileVersion:binding.profileVersion,controlledTestRef:binding.controlledTestLimits?.reference||null,
    controlledBudgetId:binding.stage==='production'?null:state.budget?._id,
    authorizationFingerprint:binding.stage==='production'?null:requestFingerprint(binding.controlledTestLimits),
    creationOrderVersion:order.version,outTradeNo,currency:order.currency,amountCents:order.totalCents,
    status:'PENDING',accountingState:'UNAPPLIED',expiresAt,transactionId:null,confirmedAt:null,closedAt:null,lastEventId:null,
    dispatchState:'PREPARED',dispatchToken:null,dispatchStartedAt:null,budgetConsumedAt:null,budgetReleasedAt:null,closeRequestedAt:null};
  return freeze({...base,disposition:'CREATE_INTENT',paymentId:payment._id,binding,proposedPayment:payment,
    proposedBudget:reserveBudget(binding,state.budget,order.totalCents,context.now)});
}
function planPaymentDispatch(order,payment,state,principal,context){
  requireOwner(principal,order);validateOrderTime(order,context.now);
  validatePayments(order,[payment],{now:context.now,appId:principal.appId});validatePending(payment,order);
  if(payment.environment!==principal.environment)fail('PAYMENT_BINDING_MISMATCH');
  if(payment.status!=='PENDING')fail('INVALID_TRANSITION');
  if(payment.dispatchState!=='PREPARED'||payment.closeRequestedAt)return freeze({disposition:'QUERY_REQUIRED',paymentId:payment._id,proposedPayment:null});
  if(order.orderStatus!=='PENDING_PAYMENT'||!['UNPAID','PENDING'].includes(order.paymentStatus))fail('INVALID_TRANSITION');
  if(context.now>=payment.expiresAt)fail('PAYMENT_DEADLINE_EXPIRED');
  validateHeld(order,state,principal,context.now);
  const binding=paymentBinding(context.configuration,'CREATE',context.now,principal);
  if(!originalBindingMatches(payment,binding)||payment.controlledTestRef!==(binding.controlledTestLimits?.reference||null))
    fail('PAYMENT_CONFIGURATION_CHANGED');
  if(!counter(context.dispatchSafetyMs)||payment.expiresAt-context.now<binding.prepayConstraints.minimumLifetimeMs+context.dispatchSafetyMs)
    fail('PAYMENT_WINDOW_TOO_SHORT');
  if(!text(context.dispatchToken)||!counter(payment.version+1))fail('INVALID_CONFIGURATION');
  return freeze({disposition:'PREPAY_REQUEST_REQUIRED',paymentId:payment._id,binding,
    proposedPayment:{...payment,version:payment.version+1,updatedAt:context.now,
      dispatchState:'REQUESTED',dispatchToken:context.dispatchToken,dispatchStartedAt:context.now}});
}
module.exports={preparePaymentRequest,planPaymentIntent,planPaymentDispatch,newMerchantOrderNumber,validatePending,validateBudget,freeze};
