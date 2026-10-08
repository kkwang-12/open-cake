'use strict';
// OFFLINE_TEST_ONLY: serialized memory, identity-based verifier, no platform call.
const {createRefundService}=require('../../cloudfunctions/_shared/refund-service');
const {bindingOf}=require('../../cloudfunctions/_shared/payment-recovery-model');
const clone=v=>JSON.parse(JSON.stringify(v));
const axes=o=>Object.fromEntries(['orderStatus','paymentStatus','refundStatus','paidCents','refundedCents','refundReservedCents','version'].map(k=>[k,o[k]]));
function setup(options={}){
  const amount=options.amount??2500,total=10000,actor={type:'MERCHANT',subjectId:'offline-merchant'};
  const order={_id:'refund-order',schemaVersion:1,version:2,createdAt:1000,updatedAt:3000,
    ownerId:'buyer',storeId:'store',tradePolicyVersion:'v1-2026-10-03',orderStatus:'PAID',paymentStatus:'PAID',
    refundStatus:'PENDING',fulfillment:options.mode||'PICKUP',currency:'CNY',totalCents:total,paidCents:total,
    refundedCents:0,refundReservedCents:amount,paymentDeadlineAt:10000};
  const payment={_id:'paid-intent',schemaVersion:1,version:1,createdAt:1500,updatedAt:2000,expiresAt:9000,
    orderId:order._id,ownerId:order.ownerId,environment:'refund-test',appId:'offline-app',stage:'test',merchantId:'offline-merchant',
    provider:options.provider||'WECHATPAY_DIRECT_V3',profileVersion:'original-profile',outTradeNo:'OFFLINE_PAYMENT',currency:'CNY',
    amountCents:total,status:'PAID',accountingState:'APPLIED',transactionId:'OFFLINE_TRANSACTION',confirmedAt:2000};
  const refund={_id:'refund-intent',schemaVersion:1,version:0,createdAt:3000,updatedAt:3000,
    orderId:order._id,paymentId:payment._id,cancellationRequestId:null,approvalLogId:'approve-log',approvedBy:actor,
    reason:'隔离测试审批',currency:'CNY',amountCents:amount,outRefundNo:'OFFLINE_REFUND',providerRefundId:null,
    status:'PENDING',budgetState:'RESERVED',settledAt:null,settledAtPrecisionMs:null,lastEventId:null,lastErrorCode:null};
  const unpaid={...order,version:0,orderStatus:'PENDING_PAYMENT',paymentStatus:'UNPAID',refundStatus:'NONE',paidCents:0,refundReservedCents:0};
  const paid={...order,version:1,refundStatus:'NONE',refundReservedCents:0};
  const log=(id,command,at,before,after)=>({_id:id,schemaVersion:1,version:0,orderId:order._id,createdAt:at,updatedAt:at,command,actor,
    before:before?axes(before):null,after:axes(after)});
  let db={order,payment,refunds:{[refund._id]:refund},attempts:{},events:{},logs:{
    created:log('created','ORDER_CREATED',1000,null,unpaid),paid:log('paid','PAYMENT_CONFIRMED',2000,unpaid,paid),
    'approve-log':log('approve-log','APPROVE_REFUND',3000,paid,order)}};
  if(options.initialState)db=clone(options.initialState);
  const controls={now:options.now||5000,denyAuth:false,failAt:0,zeroAt:0,loseResponse:false,conflict:false};
  const invocation=Object.freeze({offline:true}),proofs=new WeakMap();let seq=0,queue=Promise.resolve();
  const runTransaction=fn=>{
    const pending=queue.then(async()=>{
      const candidate=clone(db);let writes=0;
      const changed=()=>{writes++;if(writes===controls.failAt)throw new Error('OFFLINE_WRITE_FAILURE');return writes===controls.zeroAt?0:1;};
      const insert=(table,v)=>{if(candidate[table][v._id])return 0;candidate[table][v._id]=clone(v);return changed();};
      const save=(table,v,version)=>{if(candidate[table][v._id]?.version!==version)return 0;candidate[table][v._id]=clone(v);return changed();};
      const tx={readRefundState:async id=>({order:candidate.order,payment:candidate.payment,payments:[candidate.payment],
        refund:candidate.refunds[id],refunds:Object.values(candidate.refunds),attempts:Object.values(candidate.attempts).filter(a=>a.refundId===id),logs:Object.values(candidate.logs)}),
        readAttempt:async id=>candidate.attempts[id]||null,readEvent:async id=>candidate.events[id]||null,
        assertRefundReads:async()=>!controls.conflict,insertAttempt:async v=>insert('attempts',v),
        saveAttempt:async(v,version)=>save('attempts',v,version),insertEvent:async v=>insert('events',v),
        saveRefund:async(v,version)=>save('refunds',v,version),insertLog:async v=>insert('logs',v),
        saveOrder:async(v,version)=>{if(candidate.order.version!==version)return 0;candidate.order=clone(v);return changed();}};
      const result=await fn(tx);db=candidate;if(controls.loseResponse){controls.loseResponse=false;throw Object.assign(new Error('lost'),{code:'OFFLINE_RESPONSE_LOST'});}return result;
    });queue=pending.catch(()=>{});return pending;
  };
  const service=()=>createRefundService({environment:db.payment.environment,appId:db.payment.appId,provider:db.payment.provider,runTransaction,
    now:()=>controls.now,newRequestId:()=> 'OFFLINE_TRACE_'+(++seq),maxResultBytes:16384,queryRetryAfterMs:1000,
    loadConfiguration:async()=>({plan:()=>({...bindingOf(db.payment),route:db.payment.provider})}),
    verifyRefundInvocation:async(v,context)=>v===invocation&&!controls.denyAuth&&!!db.refunds[context.refundId],
    verifyRefundResult:async raw=>{if(controls.verifierThrows)throw new Error('PRIVATE_SECRET');return proofs.get(raw)||null;}});
  const response=(attemptId,outcome='SUCCESS',patch={})=>{
    const raw=Object.freeze({body:'OFFLINE_RESULT_'+(++seq)}),p=db.payment,r=db.refunds[db.attempts[attemptId].refundId];
    proofs.set(raw,{attemptId,providerEventId:'OFFLINE_EVENT_'+seq,binding:bindingOf(p),outTradeNo:p.outTradeNo,
      transactionId:p.transactionId,outRefundNo:r.outRefundNo,providerRefundId:['SUCCESS','ACCEPTED'].includes(outcome)?'OFFLINE_PROVIDER_'+r._id:null,
      currency:'CNY',paymentCents:p.amountCents,refundCents:r.amountCents,outcome,occurredAt:outcome==='SUCCESS'?controls.now:null,occurredAtPrecisionMs:1,
      verificationMethod:p.provider==='WECHATPAY_DIRECT_V3'?'SERVER_AUTHENTICATED_PROVIDER_RESPONSE':'PLATFORM_AUTHENTICATED_PROVIDER_RESULT',...patch});return raw;
  };
  return {get db(){return db;},controls,invocation,service,response,clone};
}
module.exports={setup,clone,axes};
