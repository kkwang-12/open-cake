'use strict';
// Offline business reconciliation. Cryptographic/forwarding authentication is
// an injected SERVER adapter; no implementation or deployed endpoint exists.
const {canonicalJSON,requestFingerprint,scopedDocumentId}=require('./idempotency-model');
const {validateOrderTime,validatePayments,planCancelledResources}=require('./order-cancellation-model');
const {validatePending,validateBudget,freeze}=require('./payment-intent-model');
const {validateTradeSnapshot,planOrderCommand,assertPaymentTransition}=require('./trade-model');
function fail(code){throw Object.assign(new Error(code),{code});}
const text=v=>typeof v==='string'&&v.trim()===v&&v.length>0&&v.length<=256;
const counter=v=>Number.isSafeInteger(v)&&v>=0;
const time=v=>counter(v)&&v>0&&Number.isFinite(new Date(v).getTime());
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const copy=v=>{try{return JSON.parse(canonicalJSON(v));}catch(_){fail('INVALID_NOTIFICATION_STATE');}};
const AXES=['orderStatus','paymentStatus','refundStatus','paidCents','refundedCents','refundReservedCents','version'];
const axes=o=>Object.fromEntries(AXES.map(k=>[k,o[k]]));
const MONEY=['appId','merchantId','outTradeNo','transactionId','outRefundNo','providerRefundId','currency',
  'amountCents','resultCode','occurredAt','occurredAtPrecisionMs','payloadDigest','payerIdentityDigest'];
const BINDING=['environment','stage','appId','merchantId','provider','profileVersion'];
function validateEnvelope(v,source){
  if(!exact(v,['providerEventId','binding','evidence','verificationMethod'])||!text(v.providerEventId)||
      !exact(v.binding,BINDING)||!BINDING.every(k=>text(v.binding[k]))||!exact(v.evidence,MONEY)||
      !(source==='QUERY'?['SERVER_AUTHENTICATED_PROVIDER_RESPONSE','PLATFORM_AUTHENTICATED_PROVIDER_RESULT']:
        ['PLATFORM_VERIFIED_WITH_AUTHENTICATED_FORWARDING','SERVER_SIGNATURE_AND_DECRYPTION']).includes(v.verificationMethod))
    fail('INVALID_NOTIFICATION_EVIDENCE');
  const e=v.evidence;
  if(!['appId','merchantId','outTradeNo','transactionId','currency','resultCode'].every(k=>e[k]===null||text(e[k]))||
      e.outRefundNo!==null||e.providerRefundId!==null||!(e.amountCents===null||counter(e.amountCents))||
      !(e.occurredAt===null||time(e.occurredAt))||![1,1000].includes(e.occurredAtPrecisionMs)||
      e.occurredAtPrecisionMs===1000&&e.occurredAt!==null&&e.occurredAt%1000!==0||!digest(e.payloadDigest)||
      !(e.payerIdentityDigest===null||digest(e.payerIdentityDigest)))fail('INVALID_NOTIFICATION_EVIDENCE');
}
function semanticFingerprint(v){const {payloadDigest,...facts}=v.evidence;return requestFingerprint({binding:v.binding,evidence:facts});}
function payerIdentityDigest(appId,openId){return scopedDocumentId('payment-payer',[appId,openId]);}
function eventRecord(id,auth,context,recordType='NOTIFICATION'){
  const v=auth.normalized;
  return {_id:id,schemaVersion:1,version:0,createdAt:context.now,updatedAt:context.now,recordType,
    provider:v?.binding.provider||context.provider,providerEventId:['NOTIFICATION','QUERY_RESULT'].includes(recordType)?v?.providerEventId||null:null,
    source:context.source||'NOTIFICATION',kind:'PAYMENT',paymentId:null,refundId:null,receivedAt:auth.receivedAt,
    evidence:v?copy(v.evidence):Object.fromEntries(MONEY.map(k=>[k,k==='payloadDigest'?auth.rawDigest:null])),
    verificationStatus:auth.accepted?'VERIFIED':'REJECTED',processingStatus:'QUARANTINED',processedAt:context.now,
    errorCode:auth.accepted?null:'NOTIFICATION_AUTHENTICATION_REJECTED',environment:context.environment,
    binding:v?copy(v.binding):null,semanticFingerprint:auth.accepted?semanticFingerprint(v):auth.rawDigest};
}
function validateStoredEvent(record,id){
  if(!record||record._id!==id||record.schemaVersion!==1||!counter(record.version)||
      !time(record.createdAt)||!time(record.updatedAt)||record.updatedAt<record.createdAt||
      !digest(record.semanticFingerprint)||!['NOTIFICATION','QUERY_RESULT','TRANSACTION_GUARD','REJECTED_SOURCE','EVENT_CONFLICT'].includes(record.recordType)||
      !['APPLIED','DUPLICATE','QUARANTINED'].includes(record.processingStatus)||!time(record.processedAt)||
      record.processedAt<record.createdAt||record.processedAt>record.updatedAt||!time(record.receivedAt)||record.receivedAt>record.createdAt||
      !exact(record.evidence,MONEY)||
      (record.verificationStatus==='VERIFIED'? !exact(record.binding,BINDING)||
        record.semanticFingerprint!==semanticFingerprint({binding:record.binding,evidence:record.evidence}):
        record.verificationStatus!=='REJECTED'||record.binding!==null))fail('INVALID_NOTIFICATION_STATE');
}
function validateOriginalLog(order,logs){
  if(!Array.isArray(logs)||logs.length!==order.version+1)fail('INVALID_PAYMENT_LOG');
  const sorted=[...logs].sort((a,b)=>(a.after?.version??-1)-(b.after?.version??-1));let last=null;
  sorted.forEach((log,i)=>{
    if(log.orderId!==order._id||log.schemaVersion!==1||log.version!==0||!time(log.createdAt)||
        log.updatedAt!==log.createdAt||log.createdAt<order.createdAt||log.createdAt>order.updatedAt||
        !exact(log.after,AXES)||log.after.version!==i||
        (i===0?log.command!=='ORDER_CREATED'||log.before!==null||log.createdAt!==order.createdAt:
          canonicalJSON(log.before)!==canonicalJSON(last.after)||log.createdAt<last.createdAt))fail('INVALID_PAYMENT_LOG');
    validateTradeSnapshot({...order,...log.after,id:order._id});last=log;
  });
  if(canonicalJSON(last.after)!==canonicalJSON(axes(order)))fail('INVALID_PAYMENT_LOG');
}
function consumeBudget(payment,budget,binding,now){
  if(binding.stage==='production')return null;
  if(!binding.controlledTestLimits)fail('INVALID_CONTROLLED_PAYMENT_BUDGET');
  validateBudget(binding,budget,now);
  const released=time(payment.budgetReleasedAt);
  if(released&&(!time(payment.closedAt)||payment.budgetReleasedAt!==payment.closedAt||payment.closedAt>payment.updatedAt||
      payment.budgetConsumedAt!==null))fail('INVALID_CONTROLLED_PAYMENT_BUDGET');
  if(payment.controlledBudgetId!==budget._id||payment.authorizationFingerprint!==budget.authorizationFingerprint||
      (!released&&(budget.reservedAmountCents<payment.amountCents||budget.reservedTransactions<1))||!counter(budget.version+1)||
      released&&(budget.reservedAmountCents+budget.usedAmountCents+payment.amountCents>binding.controlledTestLimits.maxTotalCents||
        budget.reservedTransactions+budget.usedTransactions+1>binding.controlledTestLimits.maxTransactions))
    fail('INVALID_CONTROLLED_PAYMENT_BUDGET');
  return {...budget,version:budget.version+1,updatedAt:now,
    reservedAmountCents:budget.reservedAmountCents-(released?0:payment.amountCents),reservedTransactions:budget.reservedTransactions-(released?0:1),
    usedAmountCents:budget.usedAmountCents+payment.amountCents,usedTransactions:budget.usedTransactions+1};
}
function createPaymentNotificationModel({verifyAndNormalize,environment,appId,provider,maxNotificationBytes,source='NOTIFICATION'}){
  if(typeof verifyAndNormalize!=='function'||![environment,appId,provider].every(text)||
      !['NOTIFICATION','QUERY'].includes(source)||!['WECHATPAY_DIRECT_V3','CLOUDBASE_INTEGRATION_V3'].includes(provider)||!counter(maxNotificationBytes)||maxNotificationBytes<1)
    fail('INVALID_CONFIGURATION');
  const tokens=new WeakMap();
  async function authenticate(raw,receivedAt){
    if(!time(receivedAt))fail('INVALID_CONFIGURATION');
    let encoded;try{encoded=canonicalJSON(raw);}catch(_){fail('INVALID_NOTIFICATION_INPUT');}
    if(Buffer.byteLength(encoded,'utf8')>maxNotificationBytes)fail('INVALID_NOTIFICATION_INPUT');
    const rawDigest=requestFingerprint(raw);
    let verified;try{verified=await verifyAndNormalize(raw,receivedAt);}catch(_){fail('NOTIFICATION_VERIFIER_UNAVAILABLE');}
    const normalized=verified===null?null:copy(verified);
    if(normalized!==null)validateEnvelope(normalized,source);
    const token=Object.freeze(Object.create(null));
    tokens.set(token,freeze({accepted:normalized!==null,normalized,receivedAt,rawDigest}));return token;
  }
  function inspect(token){if(!tokens.has(token))fail('NOTIFICATION_AUTH_REQUIRED');
    const auth=tokens.get(token),v=auth.normalized;
    const eventId=scopedDocumentId(auth.accepted?(source==='QUERY'?'payment-query-result':'payment-notification'):'rejected-payment-notification',
      auth.accepted?[environment,provider,v.binding.merchantId,v.providerEventId]:[environment,provider,auth.rawDigest]);
    const transactionId=auth.accepted&&text(v.evidence.transactionId)&&text(v.evidence.merchantId)?
      scopedDocumentId('payment-transaction',[provider,v.evidence.merchantId,v.evidence.transactionId]):null;
    return freeze({...auth,eventId,transactionId});
  }
  function plan(token,rawState,context){
    context={...context,source};
    const auth=inspect(token),state=copy(rawState);
    if(!time(context.now)||context.now<auth.receivedAt||context.environment!==environment||context.provider!==provider)
      fail('INVALID_CONFIGURATION');
    const event=eventRecord(auth.eventId,auth,context,auth.accepted?(source==='QUERY'?'QUERY_RESULT':'NOTIFICATION'):'REJECTED_SOURCE');
    const base={scope:'OFFLINE_PAYMENT_NOTIFICATION_PLAN',eventId:auth.eventId,paymentId:state.payment?._id||null,
      proposedEvents:[],proposedPayment:null,proposedOrder:null,proposedBudget:null,proposedLog:null,
      resourceChanges:[],reservationChanges:[],requiresPaymentCoordination:false,cloudVerified:false,callable:false,paymentAllowed:false};
    let ownMoney=false;
    function quarantine(code,extra={}){
      const rejected={...event,errorCode:code,paymentId:state.payment?._id||null},events=[rejected];
      if(ownMoney&&auth.transactionId&&!state.transaction)events.push({...rejected,_id:auth.transactionId,
        recordType:'TRANSACTION_GUARD',providerEventId:null});
      return freeze({...base,disposition:'QUARANTINED',requiresPaymentCoordination:true,proposedEvents:events,...extra});
    }
    if(state.event){
      validateStoredEvent(state.event,auth.eventId);
      if(state.event.recordType!==event.recordType||state.event.environment!==environment||state.event.provider!==provider||
          state.event.verificationStatus!==event.verificationStatus||state.event.processedAt>context.now)fail('INVALID_NOTIFICATION_STATE');
      if(state.event.semanticFingerprint!==event.semanticFingerprint){
        const conflictId=scopedDocumentId('payment-event-conflict',[auth.eventId,event.semanticFingerprint]);
        return quarantine('PAYMENT_EVENT_ID_CONFLICT',{proposedEvents:[{...event,_id:conflictId,recordType:'EVENT_CONFLICT',errorCode:'PAYMENT_EVENT_ID_CONFLICT'}]});
      }
      return freeze({...base,disposition:auth.accepted?'EVENT_REPLAY':'SOURCE_REJECTED',
        requiresPaymentCoordination:state.event.processingStatus==='QUARANTINED'});
    }
    if(!auth.accepted)return freeze({...base,disposition:'SOURCE_REJECTED',proposedEvents:[event]});
    const v=auth.normalized,e=v.evidence,b=v.binding;
    if(b.environment!==environment||b.appId!==appId||b.provider!==provider||e.appId!==appId||e.merchantId!==b.merchantId)
      return quarantine('PAYMENT_SCOPE_MISMATCH');
    if(e.resultCode!=='SUCCESS'||!text(e.transactionId)||!text(e.outTradeNo)||!time(e.occurredAt)||e.amountCents===null||e.amountCents<1)
      return quarantine('INVALID_PAYMENT_EVIDENCE');
    ownMoney=true;
    if(e.occurredAt>context.now)return quarantine('PAYMENT_TIME_INVALID');
    const payment=state.payment,order=state.order;
    if(!payment||!order)return quarantine('PAYMENT_INTENT_NOT_FOUND');
    let binding;
    try{
      binding=context.configuration.plan('PAYMENT_NOTIFICATION',context.now);
      if(['environment','stage','appId','merchantId','profileVersion'].some(k=>b[k]!==binding[k]||payment[k]!==binding[k])||
          b.provider!==binding.route||payment.provider!==provider||v.verificationMethod!==(source==='QUERY'?
            (provider==='WECHATPAY_DIRECT_V3'?'SERVER_AUTHENTICATED_PROVIDER_RESPONSE':'PLATFORM_AUTHENTICATED_PROVIDER_RESULT'):binding.notificationVerification))
        fail('PAYMENT_CONFIGURATION_CHANGED');
      validateOrderTime(order,context.now);validatePayments(order,state.payments,{appId,now:context.now});
      if(!state.payments.some(p=>canonicalJSON(p)===canonicalJSON(payment)))fail('INVALID_PAYMENT_STATE');
      if(payment.orderId!==order._id||payment.ownerId!==order.ownerId||payment.outTradeNo!==e.outTradeNo||payment.merchantId!==e.merchantId)
        fail('PAYMENT_SCOPE_MISMATCH');
      if(e.currency!==order.currency||e.amountCents!==order.totalCents||e.amountCents!==payment.amountCents)fail('PAYMENT_AMOUNT_MISMATCH');
      const user=state.user;
      if(!user||user._id!==order.ownerId||user.schemaVersion!==1||!counter(user.version)||
          !['ACTIVE','DISABLED'].includes(user.status)||user.environment!==environment||user.appId!==appId||
          !text(user.openId)||scopedDocumentId('user',[environment,appId,user.openId])!==user._id||
          e.payerIdentityDigest!==payerIdentityDigest(appId,user.openId))fail('PAYMENT_OWNER_MISMATCH');
      // A second-resolution provider timestamp denotes an interval. Do not
      // fabricate milliseconds or reject a causal payment in the same second.
      const upper=e.occurredAt+e.occurredAtPrecisionMs-1;
      if(!time(upper)||upper<payment.createdAt||
          time(payment.dispatchStartedAt)&&upper<payment.dispatchStartedAt)fail('PAYMENT_TIME_INVALID');
    }catch(error){return quarantine(['PAYMENT_CONFIGURATION_CHANGED','PAYMENT_SCOPE_MISMATCH','PAYMENT_AMOUNT_MISMATCH',
      'PAYMENT_OWNER_MISMATCH','PAYMENT_TIME_INVALID'].includes(error.code)?error.code:'INVALID_PAYMENT_STATE');}
    if(state.transaction){
      validateStoredEvent(state.transaction,auth.transactionId);
      if(state.transaction.recordType!=='TRANSACTION_GUARD'||state.transaction.verificationStatus!=='VERIFIED'||
          !['APPLIED','QUARANTINED'].includes(state.transaction.processingStatus)||state.transaction.processedAt>context.now)
        fail('INVALID_NOTIFICATION_STATE');
      if(state.transaction.semanticFingerprint!==event.semanticFingerprint||state.transaction.paymentId!==payment._id)
        return quarantine('PAYMENT_TRANSACTION_CONFLICT');
      if(payment.transactionId!==e.transactionId||payment.status!=='PAID'||
          payment.accountingState!==(state.transaction.processingStatus==='APPLIED'?'APPLIED':'QUARANTINED'))
        return quarantine('INVALID_PAYMENT_LEDGER');
      return freeze({...base,disposition:'TRANSACTION_DUPLICATE',requiresPaymentCoordination:payment.accountingState==='QUARANTINED',
        proposedEvents:[{...event,paymentId:payment._id,processingStatus:'DUPLICATE'}]});
    }
    if(payment.status==='PAID'||state.payments.some(p=>p._id!==payment._id&&p.status==='PAID'))return quarantine('UNRESOLVED_PAYMENT_LEDGER');
    let anomaly=null,budget=null,resources=null;
    try{budget=consumeBudget(payment,state.budget,binding,context.now);}catch(_){anomaly='PAYMENT_BUDGET_RECONCILIATION_REQUIRED';}
    if(order.orderStatus!=='PENDING_PAYMENT'||e.occurredAt>=payment.expiresAt||e.occurredAt>=order.paymentDeadlineAt||payment.status==='CLOSED')
      anomaly=order.orderStatus==='CANCELLED'?'CANCELLED_ORDER_PAYMENT':'LATE_OR_CLOSED_PAYMENT';
    if(!anomaly){
      try{
        validatePending(payment,order);
        if(payment.dispatchState==='PREPARED')fail('PAYMENT_NOT_DISPATCHED');
        validateOriginalLog(order,state.logs);
        const quote=state.held.quote;
        if(!quote||quote._id!==order.quoteId||quote.status!=='CONSUMED'||quote.consumedOrderId!==order._id||
            quote.ownerId!==order.ownerId||quote.storeId!==order.storeId||quote.facts?.fulfillment!==order.fulfillment||
            quote.facts.appointmentSnapshot?.slotId!==order.appointmentSnapshot?.slotId)fail('INVALID_PAYMENT_RESOURCES');
        resources=planCancelledResources(order,quote.resourceVersions,state.held.reservations,state.held.resources,
          {environment,now:context.now,logId:'OFFLINE_PAYMENT_RESOURCE_VALIDATION'});
      }catch(error){anomaly=error.code==='PAYMENT_NOT_DISPATCHED'?error.code:'PAYMENT_RESOURCE_OR_LOG_RECONCILIATION_REQUIRED';}
    }
    if(!counter(payment.version+1))fail('VERSION_CONFLICT');
    const nextPayment={...payment,status:'PAID',transactionId:e.transactionId,confirmedAt:e.occurredAt,lastEventId:event._id,
      accountingState:anomaly?'QUARANTINED':'APPLIED',version:payment.version+1,updatedAt:context.now,
      budgetConsumedAt:budget?context.now:null};
    const processed={...event,paymentId:payment._id,processingStatus:anomaly?'QUARANTINED':'APPLIED',errorCode:anomaly};
    const guard={...processed,_id:auth.transactionId,recordType:'TRANSACTION_GUARD',providerEventId:null};
    if(anomaly)return quarantine(anomaly,{proposedPayment:nextPayment,proposedBudget:budget,proposedEvents:[processed,guard]});
    const command=planOrderCommand({...order,id:order._id},'PAYMENT_CONFIRMED',
      {type:'SYSTEM',capabilities:['PAYMENT_EVIDENCE']},{amountCents:e.amountCents,currency:e.currency,expectedVersion:order.version});
    assertPaymentTransition(order.paymentStatus,'PAID');if(!counter(order.version+1))fail('VERSION_CONFLICT');
    const nextOrder={...order,orderStatus:command.nextOrderStatus,paymentStatus:'PAID',paidCents:e.amountCents,
      paidAt:Math.max(e.occurredAt,order.createdAt,payment.createdAt,payment.dispatchStartedAt||0),
      version:order.version+1,updatedAt:context.now};
    validateTradeSnapshot({...nextOrder,id:order._id});
    const changes=resources.resourceChanges.map(c=>{
      const old=state.held.resources.find(r=>r.resourceKind===c.resourceKind&&r.resource._id===c.resourceId).resource;
      const reservation=state.held.reservations.find(r=>r.resourceKind===c.resourceKind&&r.resourceId===c.resourceId);
      return {...c,heldUnits:old.heldUnits-reservation.quantity,confirmedUnits:old.confirmedUnits+reservation.quantity,
        consumedUnits:old.consumedUnits};
    });
    const reservations=state.held.reservations.map(r=>({reservationId:r._id,expectedVersion:r.version,expectedStatus:'HELD',
      patch:{status:'CONFIRMED',version:r.version+1,updatedAt:context.now}}));
    return freeze({...base,disposition:'APPLIED',proposedPayment:nextPayment,proposedOrder:nextOrder,proposedBudget:budget,
      proposedEvents:[processed,guard],resourceChanges:changes,reservationChanges:reservations,
      proposedLog:{_id:scopedDocumentId('order-payment-log',[environment,order._id,e.transactionId]),schemaVersion:1,version:0,
        createdAt:context.now,updatedAt:context.now,orderId:order._id,command:'PAYMENT_CONFIRMED',
        actor:{type:'SYSTEM',subjectId:null,service:'payment-notification'},before:axes(order),after:axes(nextOrder),
        eventId:event._id,requestId:context.requestId,reason:'',publicMessage:'付款已确认'}});
  }
  return Object.freeze({authenticate,inspect,plan});
}
module.exports={createPaymentNotificationModel,payerIdentityDigest,validateStoredEvent,validateOriginalLog,semanticFingerprint};
