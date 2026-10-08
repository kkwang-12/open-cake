'use strict';
// A06 local transactional orchestration. No SDK, endpoint, transport or automatic success UI.
const {parseApiRequest}=require('./api-contract');
const {requireOwner,requireStoreCapability,resolveStoreOrderActor}=require('./authorization-model');
const {validateScopedAdminState}=require('./admin-access-state');
const {requireCurrentOrderUser}=require('./order-transaction-service');
const {validateResolutionState,paymentFor,ledgerFor,planResolution,planRefundRetry,axes}=require('./merchant-resolution-model');
const {bindingOf}=require('./payment-recovery-model');
const {validateLedger}=require('./refund-model');
const {canonicalJSON,requestFingerprint,scopedDocumentId,idempotencyId,decideIdempotency}=require('./idempotency-model');
const fail=code=>{throw Object.assign(new Error(code),{code});};
const copy=value=>JSON.parse(canonicalJSON(value));
const text=value=>typeof value==='string'&&value.length>0&&value.length<=256&&value===value.trim()&&value.isWellFormed();
const counter=value=>Number.isSafeInteger(value)&&value>=0;
const time=value=>counter(value)&&value>0&&Number.isFinite(new Date(value).getTime());
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
const flags={scope:'OFFLINE_MERCHANT_RESOLUTION_RESULT',cloudVerified:false,callable:false,operationsAllowed:false,externalRefundExecuted:false};
const actions=['cancellation.review','refund.approve','refund.retry'];
function createMerchantResolutionService({context,key,runTransaction,now,newRequestId,redactReason,loadPaymentConfiguration,newRefundNumber,
  queryRetryAfterMs,afterMakingSlotPolicy=null}){
  context=copy(context);
  if(!text(context.environment)||!text(context.appId)||!['development','test','production'].includes(context.stage)||
    !key||!text(key.id)||!Buffer.isBuffer(key.secret)||key.secret.length<32||
    ![runTransaction,now,newRequestId,redactReason,loadPaymentConfiguration,newRefundNumber].every(fn=>typeof fn==='function')||
    !counter(queryRetryAfterMs)||queryRetryAfterMs<1||afterMakingSlotPolicy!==null&&!['RETAIN','RELEASE_UNCONSUMED'].includes(afterMakingSlotPolicy))fail('INVALID_CONFIGURATION');
  const clock=()=>{const at=now();if(!time(at))fail('INVALID_CONFIGURATION');return at;};
  const checked=async effect=>{if(await effect!==1)fail('VERSION_CONFLICT');};
  async function execute(domain,event,principal){
    requireOwner(principal,{ownerId:principal?.subjectId});if(principal.environment!==context.environment||principal.appId!==context.appId)fail('FORBIDDEN');
    const {contract,payload}=parseApiRequest(domain,event),action=contract.action,customer=domain==='order',retry=action==='refund.retry';
    if(customer?action!=='cancellation.request':!actions.includes(action))fail('INVALID_REQUEST');
    const requestId=newRequestId();if(!text(requestId))fail('INVALID_CONFIGURATION');
    return runTransaction(async tx=>{
      if(!tx||['readUser','readAccessState','readOrder','readRefundHeader','readResolutionState','readReceipt','readAudit','readRefundByNumber',
        'assertResolutionReads','insertCancellation','saveCancellation','insertRefund','insertAttempt','updateResource','updateReservation',
        'saveOrder','insertLog','insertAudit','insertReceipt'].some(name=>typeof tx[name]!=='function'))fail('INVALID_TRANSACTION_ADAPTER');
      const user=copy(await tx.readUser(principal.subjectId));requireCurrentOrderUser(user,principal);
      const header=retry?copy(await tx.readRefundHeader(payload.refundId)):null;
      if(retry&&(!header||header._id!==payload.refundId))fail('NOT_FOUND');
      const order=copy(await tx.readOrder(retry?header.orderId:payload.orderId));if(!order||order._id!==(retry?header.orderId:payload.orderId))fail('NOT_FOUND');
      const access=customer?null:copy(await tx.readAccessState()),start=clock();let actor;
      if(customer)requireOwner(principal,order);
      else{
        validateScopedAdminState(access,{...context,now:start});
        try{
          if(!access.stores.some(store=>store._id===order.storeId))fail('FORBIDDEN');
          actor=retry?requireStoreCapability(principal,access.roles,order.storeId,['REFUND_APPROVE']):
            resolveStoreOrderActor(order,action==='refund.approve'?'APPROVE_REFUND':payload.decision==='APPROVE'?'APPROVE_CANCELLATION':'REJECT_CANCELLATION',principal,access.roles);
        }catch(error){if(error.code==='FORBIDDEN')fail('NOT_FOUND');throw error;}
      }
      const state=copy(await tx.readResolutionState(order)),at=clock();if(at<start)fail('INVALID_CONFIGURATION');
      const timing={...context,now:at,queryRetryAfterMs,requestId,redactReason,afterMakingSlotPolicy};
      validateResolutionState(state,order,timing);
      const refund=retry?state.refunds.find(row=>row._id===header._id):null;
      if(retry&&(!refund||canonicalJSON(refund)!==canonicalJSON(header)))fail('VERSION_CONFLICT');
      const payment=paymentFor(order,state,timing),configuration=state.refunds.length||retry?await loadPaymentConfiguration(tx,bindingOf(payment),at):null;
      for(const current of state.refunds)ledgerFor(order,state,current,configuration,timing);
      if(!state.refunds.length&&(order.refundStatus!=='NONE'||order.refundedCents!==0||order.refundReservedCents!==0))fail('INVALID_REFUND_BUDGET');
      const request={environment:context.environment,actorScope:canonicalJSON([context.appId,principal.subjectId]),command:domain+'.'+action,
        key:payload.idempotencyKey,requestFingerprint:requestFingerprint(payload)},receiptId=idempotencyId(request),
        receipt=copy(await tx.readReceipt(receiptId)),decision=decideIdempotency(receipt,request),
        logId=scopedDocumentId('order-log',[receiptId,order._id]),auditId=scopedDocumentId('merchant-resolution-audit',[receiptId]),audit=copy(await tx.readAudit(auditId));
      const reads={environment:context.environment,appId:context.appId,user,access,grant:actor?.grant||null,order,state,receiptId,auditId,logId,
        refundNumber:null,paymentBinding:bindingOf(payment)};
      const fence=async()=>{if(await tx.assertResolutionReads(freeze(copy(reads)))!==true)fail('VERSION_CONFLICT');};
      if(decision.disposition==='BUSY')fail('BUSY');
      if(decision.disposition==='REPLAY'){
        const result=decision.result,effect=receipt.effect,version=payload.expectedVersion+(retry?0:1),target=retry?refund:order,
          log=state.logs.find(row=>row._id===logId),command=customer?'REQUEST_CANCELLATION':action==='refund.approve'?'APPROVE_REFUND':payload.decision==='APPROVE'?'APPROVE_CANCELLATION':'REJECT_CANCELLATION';
        if(receipt.environment!==context.environment||receipt.schemaVersion!==1||receipt.version!==0||receipt.status!=='SUCCEEDED'||
          !time(receipt.createdAt)||receipt.createdAt>at||receipt.updatedAt!==receipt.createdAt||receipt.leaseUntil!==null||receipt.retentionUntil!==null||
          result.errorCode!==null||result.entityId!==target._id||result.version!==version||target.version<version||
          !effect||Object.keys(effect).sort().join(',')!=='attemptId,disposition,operation,refundIntentId,reviewId'||
          !audit||audit._id!==auditId||audit.environment!==context.environment||audit.appId!==context.appId||audit.schemaVersion!==1||audit.version!==0||
          audit.createdAt!==receipt.createdAt||audit.updatedAt!==audit.createdAt||audit.action!==request.command||audit.outcome!=='SUCCEEDED'||
          audit.storeId!==order.storeId||canonicalJSON(audit.storeIds)!==canonicalJSON([order.storeId])||
          canonicalJSON(audit.actor)!==canonicalJSON({type:customer?'CUSTOMER':'STORE',subjectId:principal.subjectId,service:null})||
          !text(audit.reason)||!text(audit.requestId)||canonicalJSON(audit.target)!==canonicalJSON({collection:retry?'refunds':'orders',entityId:target._id,
            beforeVersion:payload.expectedVersion,afterVersion:version})||
          !Array.isArray(audit.changes)||audit.changes.length!==3||canonicalJSON(audit.changes[0])!==canonicalJSON({field:'requestFingerprint',before:null,after:request.requestFingerprint})||
          canonicalJSON(audit.changes[2])!==canonicalJSON({field:'effectFingerprint',before:null,after:requestFingerprint(effect)}))fail('INVALID_IDEMPOTENCY_RECORD');
        if(retry){
          const attempt=state.attempts.find(row=>row._id===effect.attemptId);
          if(effect.refundIntentId!==refund._id||effect.reviewId!==null||!['SUBMIT','QUERY'].includes(effect.operation)||
            !['TRANSPORT_REQUIRED','QUERY_IN_FLIGHT','ALREADY_SETTLED'].includes(effect.disposition)||
            (effect.disposition==='ALREADY_SETTLED'?effect.attemptId!==null||refund.status!=='SUCCEEDED':!attempt||attempt.refundId!==refund._id||attempt.operation!==effect.operation||
              (effect.disposition==='TRANSPORT_REQUIRED'?attempt._id!==scopedDocumentId('refund-attempt',[context.environment,refund._id,effect.operation,receiptId]):attempt.operation!=='QUERY')))
            fail('INVALID_IDEMPOTENCY_RECORD');
          if(canonicalJSON(audit.changes[1])!==canonicalJSON({field:'entityFingerprint',before:requestFingerprint({refundId:refund._id,version}),after:requestFingerprint({refundId:refund._id,version})}))fail('INVALID_IDEMPOTENCY_RECORD');
        }else{
          if(!log||log.command!==command||log.createdAt!==receipt.createdAt||canonicalJSON(log.actor)!==canonicalJSON(audit.actor)||
            log.before?.version!==payload.expectedVersion||log.after?.version!==version||
            canonicalJSON(audit.changes[1])!==canonicalJSON({field:'entityFingerprint',before:requestFingerprint(log.before),after:requestFingerprint(log.after)})||
            effect.attemptId!==null||effect.operation!==null)fail('INVALID_IDEMPOTENCY_RECORD');
          const row=state.cancellations.find(row=>row._id===effect.reviewId);
          if(customer?effect.reviewId!==scopedDocumentId('cancellation-request',[context.environment,context.appId,order._id,logId])||
            !row||row.requestLogId!==logId||effect.refundIntentId!==null:
            action==='cancellation.review'&&(!row||row._id!==payload.reviewId||row.reviewLogId!==logId||row.status!==(payload.decision==='APPROVE'?'APPROVED':'REJECTED')||
              row.approvedRefundCents!==(payload.decision==='APPROVE'?payload.refundCents:null)))fail('INVALID_IDEMPOTENCY_RECORD');
          const amount=action==='refund.approve'||action==='cancellation.review'&&payload.decision==='APPROVE'?payload.refundCents:0;
          const expectedAfter={...log.before,version,orderStatus:command==='APPROVE_CANCELLATION'?'CANCELLED':log.before.orderStatus};
          if(amount>0)Object.assign(expectedAfter,{refundStatus:'PENDING',refundReservedCents:log.before.refundReservedCents+amount});
          const expectedDisposition=customer?'CANCELLATION_REQUESTED':action==='refund.approve'?'REFUND_RESERVED':payload.decision==='REJECT'?
            'CANCELLATION_REJECTED':amount>0?'CANCELLED_REFUND_RESERVED':'CANCELLED_WITHOUT_NEW_REFUND';
          if(canonicalJSON(expectedAfter)!==canonicalJSON(log.after)||effect.disposition!==expectedDisposition||
            action==='refund.approve'&&effect.reviewId!==null)fail('INVALID_IDEMPOTENCY_RECORD');
          if(amount>0){const intent=state.refunds.find(row=>row._id===effect.refundIntentId),expected=scopedDocumentId('merchant-approved-refund',[context.environment,context.appId,order._id,logId]);
            if(!intent||intent._id!==expected||intent.amountCents!==amount||intent.approvalLogId!==logId||intent.cancellationRequestId!==(action==='cancellation.review'?payload.reviewId:null))fail('INVALID_IDEMPOTENCY_RECORD');
          }else if(effect.refundIntentId!==null)fail('INVALID_IDEMPOTENCY_RECORD');
        }
        await fence();if(clock()<at)fail('INVALID_CONFIGURATION');
        return freeze({...flags,...effect,originalDisposition:effect.disposition,result,disposition:'REPLAY',transportRequired:false});
      }
      if(audit!==null)fail('INVALID_IDEMPOTENCY_RECORD');
      let next=order,log=null,resolution={resourceChanges:[],reservationChanges:[]},review=null,reviewBefore=null,intent=null,attempt=null,effect;
      if(retry){
        if(refund.version!==payload.expectedVersion)fail('VERSION_CONFLICT');
        const plan=planRefundRetry(ledgerFor(order,state,refund,configuration,timing),receiptId,{...timing,provider:payment.provider,configuration});attempt=plan.attempt;
        effect={disposition:plan.disposition,reviewId:null,refundIntentId:refund._id,attemptId:plan.attemptId,operation:plan.operation};
      }else{
        const plan=planResolution(domain,event,order,state,principal,access?.roles||[],timing);
        ({next,log,resolution}=plan);review=plan.request;reviewBefore=plan.requestBefore;
        if(plan.plan.effectInput.refundCents>0){
          const id=scopedDocumentId('merchant-approved-refund',[context.environment,context.appId,order._id,logId]),outRefundNo=newRefundNumber(id);
          if(typeof outRefundNo!=='string'||!/^[A-Za-z0-9_|*-]{6,32}$/.test(outRefundNo))fail('INVALID_REFUND_NUMBER');
          reads.refundNumber={provider:payment.provider,merchantId:payment.merchantId,outRefundNo};
          if(await tx.readRefundByNumber(reads.refundNumber)!==null)fail('REFUND_NUMBER_CONFLICT');
          intent={_id:id,schemaVersion:1,version:0,createdAt:at,updatedAt:at,orderId:order._id,paymentId:payment._id,
            cancellationRequestId:action==='cancellation.review'?review._id:null,approvalLogId:logId,approvedBy:log.actor,
            reason:plan.plan.effectInput.reason,currency:'CNY',amountCents:plan.plan.effectInput.refundCents,outRefundNo,providerRefundId:null,
            status:'PENDING',budgetState:'RESERVED',settledAt:null,settledAtPrecisionMs:null,lastEventId:null,lastErrorCode:null};
          if(review)review.refundId=id;
          const config=configuration||await loadPaymentConfiguration(tx,bindingOf(payment),at);
          validateLedger({order:next,payment,payments:state.payments,refunds:[...state.refunds,intent],refund:intent,attempts:[],logs:[...state.logs,log]},
            {...timing,provider:payment.provider,configuration:config});
        }
        const future={...state,logs:[...state.logs,log],refunds:intent?[...state.refunds,intent]:state.refunds,
          cancellations:review?[...state.cancellations.filter(row=>row._id!==review._id),review]:state.cancellations};
        validateResolutionState(future,next,timing);
        effect={disposition:customer?'CANCELLATION_REQUESTED':action==='refund.approve'?'REFUND_RESERVED':
          payload.decision==='REJECT'?'CANCELLATION_REJECTED':intent?'CANCELLED_REFUND_RESERVED':'CANCELLED_WITHOUT_NEW_REFUND',
          reviewId:review?._id||null,refundIntentId:intent?._id||null,attemptId:null,operation:null};
      }
      const reason=redactReason(payload.reason,request.command);if(!text(reason))fail('REASON_POLICY_REQUIRED');
      const result={entityId:retry?refund._id:order._id,version:retry?refund.version:next.version,errorCode:null},
        stamp={schemaVersion:1,version:0,createdAt:at,updatedAt:at};
      const marker=retry?{refundId:refund._id,version:refund.version}:null;
      const nextAudit={...stamp,_id:auditId,environment:context.environment,appId:context.appId,
        actor:{type:customer?'CUSTOMER':'STORE',subjectId:principal.subjectId,service:null},action:request.command,storeId:order.storeId,storeIds:[order.storeId],
        target:{collection:retry?'refunds':'orders',entityId:result.entityId,beforeVersion:payload.expectedVersion,afterVersion:result.version},
        reason,requestId,outcome:'SUCCEEDED',changes:[{field:'requestFingerprint',before:null,after:request.requestFingerprint},
          {field:'entityFingerprint',before:requestFingerprint(marker||axes(order)),after:requestFingerprint(marker||axes(next))},
          {field:'effectFingerprint',before:null,after:requestFingerprint(effect)}]};
      await fence();
      for(const change of resolution.resourceChanges)await checked(tx.updateResource(change,at));
      for(const change of resolution.reservationChanges)await checked(tx.updateReservation(change));
      if(review)if(reviewBefore)await checked(tx.saveCancellation(review,reviewBefore.version));else await checked(tx.insertCancellation(review));
      if(intent)await checked(tx.insertRefund(intent,reads.refundNumber));if(attempt)await checked(tx.insertAttempt(attempt));
      if(log){await checked(tx.saveOrder(next,order.version));await checked(tx.insertLog(log));}
      await checked(tx.insertAudit(nextAudit));await checked(tx.insertReceipt({...request,...stamp,_id:receiptId,status:'SUCCEEDED',result,effect,leaseUntil:null,retentionUntil:null}));
      if(clock()<at)fail('INVALID_CONFIGURATION');return freeze({...flags,...effect,result,transportRequired:!!attempt});
    });
  }
  return Object.freeze({execute:(event,principal)=>execute('admin',event,principal),requestCancellation:(event,principal)=>execute('order',event,principal)});
}
module.exports={createMerchantResolutionService};
