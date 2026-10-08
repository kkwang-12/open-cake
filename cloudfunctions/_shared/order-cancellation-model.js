'use strict';
// Trusted, server-only cancellation planning; no external payment calls.
const { validateTradeSnapshot, planOrderCommand, assertExpectedVersion, TRADE_POLICY } = require('./trade-model');
const { validateResource } = require('./resource-model');
const { scopedDocumentId } = require('./idempotency-model');
const { planControlledOrderCommand } = require('./order-command-model');
function fail(code) { throw Object.assign(new Error(code), { code }); }
const counter = value => Number.isSafeInteger(value) && value >= 0;
const timestamp = value => counter(value) && value > 0 && Number.isFinite(new Date(value).getTime());
const text = value => typeof value === 'string' && value.trim() === value && value.length > 0;
const dense = value => Array.isArray(value) && Object.keys(value).length === value.length;
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function validateOrderTime(order, now) {
  validateTradeSnapshot({ ...order, id: order._id });
  if (order.tradePolicyVersion !== TRADE_POLICY.version) fail('POLICY_VERSION_UNSUPPORTED');
  if (order.schemaVersion !== 1 || !timestamp(now) || !timestamp(order.createdAt) ||
      !timestamp(order.updatedAt) || order.updatedAt < order.createdAt || now < order.updatedAt ||
      !timestamp(order.paymentDeadlineAt) || order.paymentDeadlineAt <= order.createdAt) fail('INVALID_TRADE_MODEL');
}
function validatePayments(order, payments, context) {
  if (!dense(payments) || new Set(payments.map(value => value && value._id)).size !== payments.length) fail('INVALID_PAYMENT_STATE');
  for (const payment of payments) {
    if (!payment || !text(payment._id) || payment.schemaVersion !== 1 || !counter(payment.version) ||
        payment.orderId !== order._id || payment.ownerId !== order.ownerId || payment.appId !== context.appId ||
        !text(payment.provider) || !text(payment.merchantId) || !text(payment.outTradeNo) ||
        payment.currency !== order.currency || payment.amountCents !== order.totalCents ||
        !['PENDING','PAID','CLOSED','EXCEPTION'].includes(payment.status) ||
        !['UNAPPLIED','APPLIED','QUARANTINED'].includes(payment.accountingState) ||
        !timestamp(payment.createdAt) || !timestamp(payment.updatedAt) || payment.createdAt < order.createdAt ||
        payment.updatedAt < payment.createdAt || payment.updatedAt > context.now ||
        !timestamp(payment.expiresAt) || payment.expiresAt <= payment.createdAt ||
        payment.expiresAt > order.paymentDeadlineAt) fail('INVALID_PAYMENT_STATE');
    if (payment.status === 'CLOSED' && (!timestamp(payment.closedAt) || payment.closedAt < payment.createdAt ||
        payment.closedAt > payment.updatedAt || !text(payment.lastEventId) || payment.confirmedAt !== null ||
        payment.transactionId !== null || payment.accountingState !== 'UNAPPLIED')) fail('INVALID_PAYMENT_STATE');
  }
}
function planUnpaidCancellation(order, payments, actor, context) {
  if (!context || !text(context.appId) || !text(context.reason)) fail('INVALID_CONFIGURATION');
  validateOrderTime(order, context.now); assertExpectedVersion(order, context.expectedVersion);
  // Authorize and validate the state without interpreting unresolved funds as unpaid.
  if (order.orderStatus !== 'PENDING_PAYMENT') fail('INVALID_TRANSITION');
  if (!actor || (actor.type === 'CUSTOMER' ? actor.subjectId !== order.ownerId :
      actor.type !== 'SYSTEM' || !Array.isArray(actor.capabilities) || !actor.capabilities.includes('ORDER_EXPIRY'))) fail('FORBIDDEN');
  if (context.expiry && context.now < order.paymentDeadlineAt) fail('ORDER_NOT_DUE');
  validatePayments(order, payments, context);
  const noIntent = order.paymentStatus === 'UNPAID' && payments.length === 0;
  const allClosed = order.paymentStatus === 'CLOSED' && payments.length > 0 &&
    payments.every(payment => payment.status === 'CLOSED');
  if (!noIntent && !allClosed) return freeze({ scope: 'OFFLINE_CANCELLATION_PLAN',
    disposition: 'PAYMENT_COORDINATION_REQUIRED', patch: null,
    requiredPaymentEffects: payments.map(payment => ({ paymentId: payment._id,
      action: ['PAID','CLOSED'].includes(payment.status) ? 'RECONCILE_PAYMENT' : 'QUERY_THEN_CLOSE_IF_UNPAID' })),
    requiresOrderPaymentReconciliation: true, callable: false });
  const transition = planOrderCommand({ ...order, id: order._id }, 'CANCEL_UNPAID', actor,
    { expectedVersion: context.expectedVersion });
  if (!counter(order.version + 1)) fail('VERSION_CONFLICT');
  return freeze({ scope: 'OFFLINE_CANCELLATION_PLAN', disposition: 'CANCEL_READY', callable: false,
    patch: { orderStatus: transition.nextOrderStatus, cancelledAt: context.now,
      cancellationReason: context.reason, updatedAt: context.now, version: order.version + 1 },
    requiredPaymentEffects: [] });
}
function planCancelledResources(order, expected, reservations, resources, context) {
  validateOrderTime(order, context.now);
  if (!text(context.environment) || !text(context.logId) || !dense(expected) || !expected.length ||
      !dense(reservations) || !dense(resources) || reservations.length !== expected.length ||
      resources.length !== expected.length) fail('INVALID_RESERVATION_PLAN');
  const key = (kind,id) => JSON.stringify([kind,id]);
  const byResource = new Map(), byReservation = new Map(), seen = new Set();
  for (const entry of resources) {
    if (!entry) fail('INVALID_RESOURCE');
    validateResource(entry.resourceKind,entry.resource);
    const id = key(entry.resourceKind,entry.resource._id);
    if (byResource.has(id)) fail('INVALID_RESOURCE');
    byResource.set(id,entry.resource);
  }
  for (const reservation of reservations) {
    if (!reservation) fail('INVALID_RESERVATION_PLAN');
    const id = key(reservation.resourceKind,reservation.resourceId);
    if (byReservation.has(id)) fail('INVALID_RESERVATION_PLAN');
    byReservation.set(id,reservation);
  }
  const resourceChanges = [], reservationChanges = [], retainedReservationIds = [];
  const made = ['MAKING','READY','DELIVERING','COMPLETED'].includes(order.orderStatus);
  let slots = 0, stocks = 0;
  for (const demand of expected) {
    if (!demand || !['STOCK','SLOT'].includes(demand.resourceKind) || !text(demand.resourceId) ||
        !counter(demand.requiredUnits) || demand.requiredUnits === 0) fail('INVALID_RESERVATION_PLAN');
    const id = key(demand.resourceKind,demand.resourceId);
    if (seen.has(id)) fail('INVALID_RESERVATION_PLAN'); seen.add(id);
    const reservation = byReservation.get(id), resource = byResource.get(id);
    if (!resource || resource.storeId !== order.storeId) fail('RESOURCE_SCOPE_MISMATCH');
    if (!reservation || reservation._id !== scopedDocumentId('reservation',
      [context.environment,order._id,demand.resourceKind,demand.resourceId]) ||
      reservation.orderId !== order._id || reservation.storeId !== order.storeId ||
      reservation.schemaVersion !== 1 || !counter(reservation.version) || reservation.quantity !== demand.requiredUnits ||
      !['HELD','CONFIRMED','CONSUMED','RELEASED'].includes(reservation.status) ||
      !timestamp(reservation.createdAt) || !timestamp(reservation.updatedAt) ||
      reservation.createdAt !== order.createdAt || reservation.updatedAt < reservation.createdAt ||
      reservation.updatedAt > context.now || reservation.expiresAt !== order.paymentDeadlineAt ||
      (['HELD','CONFIRMED'].includes(reservation.status) ? reservation.resolvedAt !== null || reservation.resolutionLogId !== null :
        !timestamp(reservation.resolvedAt) || reservation.resolvedAt > reservation.updatedAt ||
        reservation.resolvedAt < reservation.createdAt || !text(reservation.resolutionLogId))) fail('INVALID_RESERVATION_PLAN');
    if (demand.resourceKind === 'SLOT') {
      slots++;
      if (demand.requiredUnits !== 1 || !order.appointmentSnapshot ||
          resource._id !== order.appointmentSnapshot.slotId || resource.fulfillment !== order.fulfillment) fail('INVALID_RESERVATION_PLAN');
    } else stocks++;
    if (order.orderStatus === 'PENDING_PAYMENT' && reservation.status !== 'HELD') fail('INVALID_RESERVATION_PLAN');
    if (['PAID','ACCEPTED'].includes(order.orderStatus) && reservation.status !== 'CONFIRMED') fail('INVALID_RESERVATION_PLAN');
    if (made && demand.resourceKind === 'STOCK' && reservation.status !== 'CONSUMED') fail('INVALID_RESERVATION_PLAN');
    if (order.orderStatus === 'CANCELLED' && !['RELEASED','CONSUMED'].includes(reservation.status)) fail('INVALID_RESERVATION_PLAN');
    const occupiedColumn = { HELD:'heldUnits',CONFIRMED:'confirmedUnits',CONSUMED:'consumedUnits' }[reservation.status];
    if (occupiedColumn && resource[occupiedColumn] < reservation.quantity) fail('INVALID_RESOURCE');
    if (['CONSUMED','RELEASED'].includes(reservation.status)) { retainedReservationIds.push(reservation._id); continue; }
    if (made && demand.resourceKind === 'SLOT') {
      if (!['RELEASE_UNCONSUMED','RETAIN'].includes(context.afterMakingSlotPolicy)) fail('CONFIGURATION_REQUIRED');
      if (context.afterMakingSlotPolicy === 'RETAIN') { retainedReservationIds.push(reservation._id); continue; }
    }
    const column = reservation.status === 'HELD' ? 'heldUnits' : 'confirmedUnits';
    if (!counter(resource.version + 1) || !counter(reservation.version + 1)) fail('INVALID_RESOURCE');
    resourceChanges.push({ resourceKind:demand.resourceKind, resourceId:demand.resourceId,
      expectedVersion:resource.version, expectedStatus:resource.status, nextVersion:resource.version+1,
      heldUnits:resource.heldUnits - (column === 'heldUnits' ? reservation.quantity : 0),
      confirmedUnits:resource.confirmedUnits - (column === 'confirmedUnits' ? reservation.quantity : 0), consumedUnits:resource.consumedUnits });
    reservationChanges.push({ reservationId:reservation._id, expectedVersion:reservation.version, expectedStatus:reservation.status,
      patch:{ status:'RELEASED',version:reservation.version+1,updatedAt:context.now,
        resolvedAt:context.now,resolutionLogId:context.logId } });
  }
  if (slots !== 1 || stocks < 1) fail('INVALID_RESERVATION_PLAN');
  return freeze({ resourceChanges, reservationChanges, retainedReservationIds });
}
function planPaidCancellationCoordination(domain,event,state,principal,roles,context) {
  const plan = planControlledOrderCommand(domain,event,{ ...state.order,id:state.order._id },principal,roles,context);
  if (!['REQUEST_CANCELLATION','APPROVE_CANCELLATION','REJECT_CANCELLATION','REJECT_ORDER'].includes(plan.command)) fail('UNSUPPORTED_ORDER_COMMAND');
  const resources = plan.requiredAtomicEffects.includes('RESOLVE_CANCELLED_RESERVATIONS') ?
    planCancelledResources(state.order,state.expectedResources,state.reservations,state.resources,
      { ...context,environment:principal.environment,logId:plan.logDraft._id }) : null;
  // Approval / refund intent execution belongs to the funds-aware executor. A
  // resource proposal MUST NOT be applied without every command required effect.
  return freeze({ scope:'OFFLINE_PAID_CANCELLATION_COORDINATION',callable:false,
    commandPlan:plan,resourceResolution:resources,requiresAtomicPersistence:true,
    requiresFundsExecutor:plan.effectInput.refundCents > 0,cloudVerified:false });
}
module.exports = { validateOrderTime, validatePayments, planUnpaidCancellation, planCancelledResources, planPaidCancellationCoordination };
