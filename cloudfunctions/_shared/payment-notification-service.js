'use strict';
// No real verifier, SDK, HTTP ACK, scheduler or money call is supplied here.
const {createPaymentNotificationModel}=require('./payment-notification-model');
const {freeze}=require('./payment-intent-model');
function fail(code){throw Object.assign(new Error(code),{code});}
const text=v=>typeof v==='string'&&v.trim()===v&&v.length>0&&v.length<=256;
const methods=['readEvent','readPaymentByMerchantNumber','readOrder','readOrderPayments','readUser','readHeldState',
  'readBudget','readLogs','assertNotificationReads','insertEvent','savePayment','saveOrder','saveBudget',
  'updateResource','updateReservation','insertLog'];
async function write(effect){if(await effect!==1)fail('VERSION_CONFLICT');}
async function persistPaymentNotificationPlan(tx,plan,state,timestamp){
  for(const proposed of plan.proposedEvents){
    const previous=await tx.readEvent(proposed._id);
    if(previous){
      if(proposed.recordType!=='EVENT_CONFLICT'||previous.semanticFingerprint!==proposed.semanticFingerprint||
          previous.errorCode!==proposed.errorCode||previous.recordType!=='EVENT_CONFLICT')fail('VERSION_CONFLICT');
    }else await write(tx.insertEvent(proposed));
  }
  if(plan.proposedBudget)await write(tx.saveBudget(plan.proposedBudget,state.budget.version));
  if(plan.proposedPayment)await write(tx.savePayment(plan.proposedPayment,state.payment.version));
  for(const change of plan.resourceChanges)await write(tx.updateResource(change,timestamp));
  for(const change of plan.reservationChanges)await write(tx.updateReservation(change));
  if(plan.proposedOrder)await write(tx.saveOrder(plan.proposedOrder,state.order.version));
  if(plan.proposedLog)await write(tx.insertLog(plan.proposedLog));
}
function createPaymentNotificationService(options){
  const {runTransaction,now,loadConfiguration,newRequestId,environment,provider}=options;
  if(![runTransaction,now,loadConfiguration,newRequestId].every(v=>typeof v==='function'))fail('INVALID_CONFIGURATION');
  const model=createPaymentNotificationModel(options);
  return Object.freeze({
    async handle(raw){
      // Authentication always runs again, including exact event replay.
      // The server-injected adapter must verify ORIGINAL bytes / forwarding
      // source before returning normalized fields. Input flags never bypass it.
      const token=await model.authenticate(raw,now()),auth=model.inspect(token),requestId=newRequestId();
      if(!text(requestId))fail('INVALID_CONFIGURATION');
      return runTransaction(async tx=>{
        if(!tx||methods.some(k=>typeof tx[k]!=='function'))fail('INVALID_TRANSACTION_ADAPTER');
        const event=await tx.readEvent(auth.eventId),transaction=auth.transactionId?await tx.readEvent(auth.transactionId):null;
        const normalized=auth.normalized,e=normalized?.evidence;
        const payment=auth.accepted&&e?.merchantId===normalized.binding.merchantId&&e?.appId===options.appId?
          await tx.readPaymentByMerchantNumber(e.merchantId,e.outTradeNo):null;
        const order=payment?await tx.readOrder(payment.orderId):null;
        const user=order?await tx.readUser(order.ownerId):null;
        const payments=order?await tx.readOrderPayments(order._id):[];
        const held=order?await tx.readHeldState(order):null,logs=order?await tx.readLogs(order._id):[];
        const timestamp=now();
        const configuration=payment?await loadConfiguration(tx,normalized.binding,timestamp):null;
        const budget=payment?await tx.readBudget(configuration,normalized.binding):null;
        const state={event,transaction,payment,order,user,payments,held,logs,budget};
        const plan=model.plan(token,state,{now:timestamp,environment,provider,configuration,requestId});
        // Protect complete reads AND event / global transaction absence until
        // commit; implementations without phantom protection need fixed guards.
        if(await tx.assertNotificationReads({eventId:auth.eventId,transactionId:auth.transactionId,
          eventVersion:event?.version??null,transactionVersion:transaction?.version??null,
          paymentId:payment?._id||null,paymentVersion:payment?.version??null,orderId:order?._id||null,
          orderVersion:order?.version??null,userId:user?._id||null,userVersion:user?.version??null,
          paymentVersions:payments.map(p=>({id:p._id,version:p.version,status:p.status})),
          held,logs,budgetId:budget?._id||null,budgetVersion:budget?.version??null})!==true)fail('VERSION_CONFLICT');
        // Conflicts append a separate immutable record; replay never overwrites
        // the first real event. Same conflict repeated is also idempotent.
        await persistPaymentNotificationPlan(tx,plan,state,timestamp);
        const beforeCommit=now();
        if(!Number.isSafeInteger(beforeCommit)||beforeCommit<timestamp)fail('INVALID_CONFIGURATION');
        return freeze({scope:'OFFLINE_PAYMENT_NOTIFICATION_RESULT',disposition:plan.disposition,eventId:plan.eventId,
          paymentId:plan.paymentId,requiresPaymentCoordination:plan.requiresPaymentCoordination,
          durableHandlingRecorded:true,sourceAccepted:auth.accepted,
          cloudVerified:false,callable:false,paymentAllowed:false});
      });
    }
  });
}
module.exports={createPaymentNotificationService,persistPaymentNotificationPlan};
