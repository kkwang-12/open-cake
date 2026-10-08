'use strict';
// Internal unpaid cancellation/expiry executor. No SDK, scheduler or Payment adapter.
const { parseApiRequest } = require('./api-contract');
const { requireOwner } = require('./authorization-model');
const { requireCurrentOrderUser } = require('./order-transaction-service');
const { validateOrderTime, planUnpaidCancellation, planCancelledResources } = require('./order-cancellation-model');
const { idempotencyId, requestFingerprint, scopedDocumentId, decideIdempotency } = require('./idempotency-model');
function fail(code) { throw Object.assign(new Error(code), { code }); }
const text = value => typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= 2048 && value.isWellFormed();
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value;
}
const axes = order => Object.fromEntries(['orderStatus','paymentStatus','refundStatus','paidCents',
  'refundedCents','refundReservedCents','version'].map(key => [key,order[key]]));
function output(disposition,result=null,extra={}) {
  return freeze({ scope:'OFFLINE_ORDER_CANCELLATION_RESULT',disposition,result,...extra,
    cloudVerified:false,checkoutAllowed:false,paymentAllowed:false });
}
function createOrderCancellationService({ runTransaction,now,newRequestId,redactReason,
  environment,appId,verifyExpiryInvocation }) {
  if (![runTransaction,now,newRequestId,redactReason].every(value=>typeof value==='function') ||
      !text(environment) || !text(appId)) fail('INVALID_CONFIGURATION');
  async function execute(payload,principal,expiry) {
    const requestId = newRequestId(); if (!text(requestId)) fail('INVALID_CONFIGURATION');
    return runTransaction(async tx => {
      const methods=['readUser','readOrder','readReceipt','readCancellationState','assertCancellationReads',
        'updateResource','updateReservation','saveOrder','insertLog','insertReceipt'];
      if (!tx || methods.some(name=>typeof tx[name]!=='function')) fail('INVALID_TRANSACTION_ADAPTER');
      if (!expiry) requireCurrentOrderUser(await tx.readUser(principal.subjectId),principal);
      const order = await tx.readOrder(payload.orderId);
      if (!order || order._id !== payload.orderId) fail('NOT_FOUND');
      if (!expiry) requireOwner(principal,order);
      const timestampNow = now();
      validateOrderTime(order,timestampNow);
      const request = { environment,actorScope:JSON.stringify(expiry ? [appId,'SYSTEM','order-expiry'] :
        [appId,principal.subjectId]),command:expiry ? 'order.expire' : 'order.cancelUnpaid',
        key:expiry ? order._id : payload.idempotencyKey,
        requestFingerprint:requestFingerprint(expiry ? { orderId:order._id,paymentDeadlineAt:order.paymentDeadlineAt } : payload) };
      const receiptId=idempotencyId(request),decision=decideIdempotency(await tx.readReceipt(receiptId),request);
      if (decision.disposition==='BUSY') fail('BUSY');
      if (decision.disposition==='REPLAY') {
        if (decision.result.errorCode !== null) fail(decision.result.errorCode);
        if (decision.result.entityId !== order._id) fail('INVALID_IDEMPOTENCY_RECORD');
        return output('REPLAY',decision.result);
      }
      if (expiry && (order.orderStatus !== 'PENDING_PAYMENT' || timestampNow < order.paymentDeadlineAt)) return output('SKIPPED');
      const reason = expiry ? '付款期限已到' : redactReason(payload.reason);
      if (!text(reason)) fail('INVALID_REASON');
      const actor = expiry ? { type:'SYSTEM',capabilities:['ORDER_EXPIRY'] } : requireOwner(principal,order);
      const state = await tx.readCancellationState(order);
      if (!state || !state.quote || state.quote._id !== order.quoteId || state.quote.status !== 'CONSUMED' ||
          state.quote.consumedOrderId !== order._id || state.quote.ownerId !== order.ownerId ||
          state.quote.storeId !== order.storeId) fail('INVALID_CANCELLATION_STATE');
      const plan=planUnpaidCancellation(order,state.payments,actor,{ now:timestampNow,appId,
        expectedVersion:expiry ? order.version : payload.expectedVersion,expiry,reason });
      if (plan.disposition==='PAYMENT_COORDINATION_REQUIRED') return output('PAYMENT_COORDINATION_REQUIRED',null,
        { requiredPaymentEffects:plan.requiredPaymentEffects,requiresOrderPaymentReconciliation:true });
      const logId=scopedDocumentId('order-log',[receiptId,order._id]);
      const resolution=planCancelledResources(order,state.quote.resourceVersions,state.reservations,state.resources,
        { now:timestampNow,environment,logId });
      if (await tx.assertCancellationReads({ orderId:order._id,orderVersion:order.version,
          userId:expiry ? null : principal.subjectId,userVersion:expiry ? null : principal.userVersion,
          quoteId:order.quoteId,quoteVersion:state.quote.version,
          paymentVersions:state.payments.map(payment=>({id:payment._id,version:payment.version,status:payment.status})),
          reservationVersions:state.reservations.map(reservation=>({id:reservation._id,version:reservation.version,status:reservation.status})),
          resourceVersions:resolution.resourceChanges.map(change=>({kind:change.resourceKind,id:change.resourceId,
            version:change.expectedVersion,status:change.expectedStatus})) }) !== true) fail('VERSION_CONFLICT');
      for (const change of resolution.resourceChanges) if (await tx.updateResource(change,timestampNow) !== 1) fail('VERSION_CONFLICT');
      for (const change of resolution.reservationChanges) if (await tx.updateReservation(change) !== 1) fail('VERSION_CONFLICT');
      const nextOrder={ ...order,...plan.patch };
      if (await tx.saveOrder(nextOrder,order.version) !== 1) fail('VERSION_CONFLICT');
      const common={schemaVersion:1,version:0,createdAt:timestampNow,updatedAt:timestampNow};
      if (await tx.insertLog({ ...common,_id:logId,orderId:order._id,command:'CANCEL_UNPAID',
          actor:expiry ? {type:'SYSTEM',subjectId:null,service:'order-expiry'} :
            {type:'CUSTOMER',subjectId:principal.subjectId,service:null},
          before:axes(order),after:axes(nextOrder),requestId,eventId:null,reason,
          publicMessage:expiry ? '付款期限已到，订单已取消' : '未付款订单已取消' }) !== 1) fail('VERSION_CONFLICT');
      const result={entityId:order._id,version:nextOrder.version,errorCode:null};
      if (await tx.insertReceipt({ ...request,...common,_id:receiptId,status:'SUCCEEDED',
          result,leaseUntil:null,retentionUntil:null }) !== 1) fail('VERSION_CONFLICT');
      return output('CANCELLED',result);
    });
  }
  return Object.freeze({
    cancelUnpaid(event,principal) {
      requireOwner(principal,{ownerId:principal && principal.subjectId});
      if (principal.environment !== environment || principal.appId !== appId) fail('FORBIDDEN');
      const {contract,payload}=parseApiRequest('order',event);
      if (contract.action !== 'cancelUnpaid') fail('UNSUPPORTED_ORDER_COMMAND');
      return execute(payload,principal,false);
    },
    async expire(orderId,invocation) {
      // Invocation verifier must be server-configured and validate the real trigger.
      // Client roles/capabilities never mint SYSTEM authority. No deployed trigger exists.
      if (typeof verifyExpiryInvocation !== 'function' || await verifyExpiryInvocation(invocation) !== true) fail('FORBIDDEN');
      if (!text(orderId)) fail('INVALID_REQUEST');
      return execute({orderId},null,true);
    }
  });
}
module.exports={createOrderCancellationService};
