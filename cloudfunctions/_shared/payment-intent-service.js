'use strict';
// Offline transactional preparation ONLY. It never executes an external effect.
const {randomBytes}=require('node:crypto');
const {requireOwner}=require('./authorization-model');
const {requireCurrentOrderUser}=require('./order-transaction-service');
const {idempotencyId}=require('./idempotency-model');
const {validatePayments}=require('./order-cancellation-model');
const {preparePaymentRequest,planPaymentIntent,planPaymentDispatch,newMerchantOrderNumber,validateBudget,freeze}=require('./payment-intent-model');
function fail(code){throw Object.assign(new Error(code),{code});}
const methods=['readUser','readOrder','readPayments','readReceipt','readHeldState','readBudget',
  'readPaymentByMerchantNumber','assertPaymentReads','insertPayment','savePayment','saveBudget','insertReceipt'];
const write=async effect=>{if(await effect!==1)fail('VERSION_CONFLICT');};
function output(disposition,order,paymentId=null,extra={}){
  return freeze({scope:'OFFLINE_PAYMENT_INTENT_RESULT',disposition,paymentId,orderId:order._id,
    orderVersion:order.version,paymentDeadlineAt:order.paymentDeadlineAt,state:'PENDING_CONFIRMATION',payInvocation:null,
    ...extra,cloudVerified:false,callable:false,paymentAllowed:false});
}
function createPaymentIntentService({runTransaction,now,loadConfiguration,dispatchSafetyMs,
  newOutTradeNo=newMerchantOrderNumber,newDispatchToken=()=>randomBytes(16).toString('hex')}){
  if(![runTransaction,now,loadConfiguration,newOutTradeNo,newDispatchToken].every(v=>typeof v==='function')||
      !Number.isSafeInteger(dispatchSafetyMs)||dispatchSafetyMs<0)fail('INVALID_CONFIGURATION');
  async function transaction(principal,orderId,work){
    requireOwner(principal,{ownerId:principal&&principal.subjectId});
    return runTransaction(async tx=>{
      if(!tx||methods.some(k=>typeof tx[k]!=='function'))fail('INVALID_TRANSACTION_ADAPTER');
      requireCurrentOrderUser(await tx.readUser(principal.subjectId),principal);
      const order=await tx.readOrder(orderId);
      if(!order||order._id!==orderId)fail('NOT_FOUND');requireOwner(principal,order);
      const timestamp=now(),configuration=await loadConfiguration(tx,principal,timestamp);
      return work(tx,order,{now:timestamp,configuration,dispatchSafetyMs,newOutTradeNo});
    });
  }
  async function fence(tx,order,principal,payments,state,budget){
    // Must protect the COMPLETE query including absence, resources, user,
    // current config/grant and global merchant-number uniqueness until commit.
    if(await tx.assertPaymentReads({orderId:order._id,orderVersion:order.version,
      userId:principal.subjectId,userVersion:principal.userVersion,
      paymentVersions:payments.map(p=>({id:p._id,version:p.version,status:p.status})),
      heldState:state,budgetId:budget?._id||null,budgetVersion:budget?.version??null})!==true)fail('VERSION_CONFLICT');
  }
  function finalClock(context){const current=now();
    if(!Number.isSafeInteger(current)||current<context.now)fail('INVALID_CONFIGURATION');return current;}
  return Object.freeze({
    async prepare(event,principal){
      const {payload,request}=preparePaymentRequest(event,principal),receiptId=idempotencyId(request);
      return transaction(principal,payload.orderId,async(tx,order,context)=>{
        const payments=await tx.readPayments(order._id),receipt=await tx.readReceipt(receiptId);
        const held=await tx.readHeldState(order),budget=await tx.readBudget(context.configuration,principal);
        const plan=planPaymentIntent({order,payments,receipt,...held,budget},event,principal,context);
        await fence(tx,order,principal,payments,held,budget);
        if(plan.disposition==='PAYMENT_COORDINATION_REQUIRED')return output(plan.disposition,order,plan.paymentId);
        if(plan.disposition==='CREATE_INTENT'){
          if(await tx.readPaymentByMerchantNumber(plan.proposedPayment.merchantId,plan.proposedPayment.outTradeNo)!==null)
            fail('MERCHANT_ORDER_NUMBER_COLLISION');
          if(plan.proposedBudget)await write(tx.saveBudget(plan.proposedBudget,budget.version));
          await write(tx.insertPayment(plan.proposedPayment));
        }
        if(plan.decision.disposition!=='REPLAY')await write(tx.insertReceipt({...request,_id:receiptId,
          schemaVersion:1,version:0,createdAt:context.now,updatedAt:context.now,status:'SUCCEEDED',
          result:{entityId:plan.paymentId,version:order.version,errorCode:null},leaseUntil:null,retentionUntil:null}));
        const beforeCommit=finalClock(context);
        if(plan.disposition==='CREATE_INTENT'){
          context.configuration.plan('CREATE',beforeCommit);
          if(beforeCommit>=plan.proposedPayment.expiresAt)fail('PAYMENT_DEADLINE_EXPIRED');
        }
        return output(plan.disposition,order,plan.paymentId);
      });
    },
    claimDispatch(orderId,paymentId,principal){
      if(typeof orderId!=='string'||typeof paymentId!=='string')fail('INVALID_REQUEST');
      return transaction(principal,orderId,async(tx,order,context)=>{
        const payments=await tx.readPayments(orderId),payment=payments.find(p=>p._id===paymentId);
        if(!payment)fail('NOT_FOUND');
        validatePayments(order,payments,{now:context.now,appId:principal.appId});
        if(payments.filter(p=>p.status==='PENDING').length!==1||payments.some(p=>['PAID','EXCEPTION'].includes(p.status)))
          fail('PAYMENT_PENDING');
        const held=await tx.readHeldState(order),budget=await tx.readBudget(context.configuration,principal);
        const plan=planPaymentDispatch(order,payment,held,principal,{...context,dispatchToken:newDispatchToken()});
        await fence(tx,order,principal,payments,held,budget);
        if(plan.disposition==='QUERY_REQUIRED')return output('QUERY_REQUIRED',order,paymentId);
        // Verify this intent's original reservation, not a new budget charge.
        if(plan.binding.stage!=='production'){
          validateBudget(plan.binding,budget,context.now);
          if(payment.controlledBudgetId!==budget._id||payment.authorizationFingerprint!==budget.authorizationFingerprint||
              budget.reservedAmountCents<payment.amountCents||budget.reservedTransactions<1)fail('INVALID_CONTROLLED_PAYMENT_BUDGET');
        }
        await write(tx.savePayment(plan.proposedPayment,payment.version));
        const beforeCommit=finalClock(context);context.configuration.plan('CREATE',beforeCommit);
        if(payment.expiresAt-beforeCommit<plan.binding.prepayConstraints.minimumLifetimeMs+dispatchSafetyMs)
          fail('PAYMENT_WINDOW_TOO_SHORT');
        return output(plan.disposition,order,paymentId,{internalDispatch:{dispatchToken:plan.proposedPayment.dispatchToken,
          paymentVersion:plan.proposedPayment.version,environment:payment.environment,appId:payment.appId,
          merchantId:payment.merchantId,provider:payment.provider,profileVersion:payment.profileVersion,
          outTradeNo:payment.outTradeNo,currency:payment.currency,amountCents:payment.amountCents,expiresAt:payment.expiresAt,
          requiredServerChecks:plan.binding.requiredServerChecks}});
      });
    }
  });
}
module.exports={createPaymentIntentService};
