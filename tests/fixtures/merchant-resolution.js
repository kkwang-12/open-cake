'use strict';
// OFFLINE_TEST_ONLY: actual local O03/A01/P06 services, serial memory and synthetic provider proof.
const {setup:orderSetup,clone}=require('./merchant-order');
const {createMerchantResolutionService}=require('../../cloudfunctions/_shared/merchant-resolution-service');
const {createMerchantFinanceReadService}=require('../../cloudfunctions/_shared/merchant-finance-read-service');
const {createRefundService}=require('../../cloudfunctions/_shared/refund-service');
const {bindingOf}=require('../../cloudfunctions/_shared/payment-recovery-model');
const {makeJob}=require('../../cloudfunctions/_shared/payment-maintenance-model');
async function setup(input={}){
  const s=await orderSetup(input);s.db.jobs={};s.controls.resolutionReads=0;s.controls.financeReads=0;s.controls.resolutionFences=[];
  const existing=s.controls.extendTransaction;
  s.controls.extendTransaction=parts=>{
    const {staged,snapshot,changed,insert}=parts,base=existing(parts),save=(table,row,version)=>{
      if(staged[table][row._id]?.version!==version)return 0;staged[table][row._id]=clone(row);return changed();};
    return {...base,
      readRefundHeader:async id=>clone(staged.refunds[id]||null),
      readResolutionState:async order=>{s.controls.resolutionReads++;const state=await base.readMerchantOrderState(order);
        state.attempts=Object.values(staged.refundAttempts).filter(row=>state.refunds.some(refund=>refund._id===row.refundId));
        if(s.controls.resolutionPatch)s.controls.resolutionPatch(state);return state;},
      insertCancellation:async row=>insert('cancellations',row),saveCancellation:async(row,version)=>save('cancellations',row,version),
      assertResolutionReads:async reads=>{s.controls.resolutionFences.push(clone(reads));return !s.controls.denyFence&&JSON.stringify(s.db)===snapshot;},
      readFinanceState:async storeId=>{
        s.controls.financeReads++;const orders=Object.values(staged.orders).filter(order=>order.storeId===storeId),ids=new Set(orders.map(order=>order._id)),
          refunds=Object.values(staged.refunds).filter(refund=>ids.has(refund.orderId)),payments=Object.values(staged.payments).filter(payment=>ids.has(payment.orderId)),
          entityIds=new Set([...orders,...refunds,...payments].map(row=>row._id));
        const state={environment:s.context.environment,appId:s.context.appId,storeId,complete:true,orders,refunds,payments,
          attempts:Object.values(staged.refundAttempts).filter(row=>refunds.some(refund=>refund._id===row.refundId)),
          logs:Object.values(staged.logs).filter(row=>ids.has(row.orderId)),cancellations:Object.values(staged.cancellations).filter(row=>ids.has(row.orderId)),
          jobs:Object.values(staged.jobs).filter(row=>entityIds.has(row.entityId))};
        if(s.controls.financePatch)s.controls.financePatch(state);return clone(state);
      },
      readScopedAudits:async storeId=>{s.controls.financeReads++;const state={environment:s.context.environment,appId:s.context.appId,storeId,complete:true,
        audits:Object.values(staged.audits).filter(row=>row.storeIds.includes(storeId))};if(s.controls.auditPatch)s.controls.auditPatch(state);return clone(state);},
      assertFinanceReads:async()=>!s.controls.denyFence&&JSON.stringify(s.db)===snapshot};
  };
  const options={...s.options,queryRetryAfterMs:1000,afterMakingSlotPolicy:null};
  const resolutionService=createMerchantResolutionService(options),financeService=createMerchantFinanceReadService({...options,runReadTransaction:s.runTransaction});
  const proofs=new WeakMap();let seq=0;
  const refundService=createRefundService({environment:s.context.environment,appId:s.context.appId,provider:'WECHATPAY_DIRECT_V3',
    runTransaction:s.runTransaction,now:options.now,newRequestId:options.newRequestId,maxResultBytes:16384,queryRetryAfterMs:1000,
    loadConfiguration:options.loadPaymentConfiguration,verifyRefundInvocation:value=>value===s.invocation,verifyRefundResult:value=>proofs.get(value)||null});
  const response=(attemptId,outcome='SUCCESS')=>{
    const attempt=s.db.refundAttempts[attemptId],refund=s.db.refunds[attempt.refundId],payment=s.db.payments[refund.paymentId],raw=Object.freeze({offline:++seq});
    proofs.set(raw,{attemptId,providerEventId:'OFFLINE_A06_RESULT_'+seq,binding:bindingOf(payment),outTradeNo:payment.outTradeNo,
      transactionId:payment.transactionId,outRefundNo:refund.outRefundNo,providerRefundId:outcome==='SUCCESS'?'OFFLINE_PROVIDER_'+refund._id:null,
      currency:'CNY',paymentCents:payment.amountCents,refundCents:refund.amountCents,outcome,
      occurredAt:outcome==='SUCCESS'?s.controls.now:null,occurredAtPrecisionMs:1,verificationMethod:'SERVER_AUTHENTICATED_PROVIDER_RESPONSE'});return raw;
  };
  const event=(action,patch={})=>({action,payload:action==='cancellation.request'?{orderId:s.orderId,expectedVersion:s.db.orders[s.orderId].version,
    reason:'取消：电话13800138000',idempotencyKey:'OFFLINE_A06_REQUEST_KEY',...patch}:action==='cancellation.review'?{orderId:s.orderId,
    expectedVersion:s.db.orders[s.orderId].version,reviewId:Object.values(s.db.cancellations).find(row=>row.status==='PENDING')?._id,
    decision:'APPROVE',refundCents:100,reason:'审批：电话13800138000',idempotencyKey:'OFFLINE_A06_REVIEW_KEY',...patch}:
    action==='refund.approve'?{orderId:s.orderId,expectedVersion:s.db.orders[s.orderId].version,refundCents:100,reason:'批准：电话13800138000',idempotencyKey:'OFFLINE_A06_APPROVE_KEY',...patch}:
    action==='refund.retry'?{refundId:patch.refundId||Object.keys(s.db.refunds)[0],expectedVersion:s.db.refunds[patch.refundId||Object.keys(s.db.refunds)[0]]?.version??0,
      reason:'重试：电话13800138000',idempotencyKey:'OFFLINE_A06_RETRY_KEY',...patch}:
    action==='refund.get'?{refundId:Object.keys(s.db.refunds)[0],...patch}:{storeId:s.storeId,...patch}});
  const execute=(action,patch,principal=s.primary)=>resolutionService.execute(event(action,patch),principal),
    request=(patch,principal=s.owner)=>resolutionService.requestCancellation(event('cancellation.request',patch),principal),
    read=(action,patch,principal=s.primary)=>financeService.execute(event(action,patch),principal);
  function job(kind,entity){const payment=Object.values(s.db.payments)[0],job=makeJob(kind,entity,{environment:s.context.environment,appId:s.context.appId,
    merchantId:payment.merchantId,provider:payment.provider},s.controls.now);s.db.jobs[job._id]=clone(job);return job._id;}
  return {...s,merchantEvent:s.event,options,resolutionService,financeService,refundService,response,event,execute,request,read,job};
}
module.exports={setup,clone};
