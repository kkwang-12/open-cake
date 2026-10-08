'use strict';
// Internal offline planner, NOT a handler, transaction executor or public DTO.
// All records, roles, principal and context must be loaded by trusted server code.
const { parseApiRequest } = require('./api-contract');
const { requireOwner, resolveStoreOrderActor } = require('./authorization-model');
const { planOrderCommand, validateTradeSnapshot, assertExpectedVersion } = require('./trade-model');
const { idempotencyId, requestFingerprint, scopedDocumentId } = require('./idempotency-model');

class OrderCommandError extends Error {
  constructor(code) { super(code); this.name = 'OrderCommandError'; this.code = code; }
}
function fail(code) { throw new OrderCommandError(code); }
function plain(value) {
  return value !== null && typeof value === 'object' &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value));
}
function text(value, max = 256) {
  return typeof value === 'string' && value.length > 0 && value === value.trim() &&
    value.length <= max && value.isWellFormed();
}
function counter(value) { return Number.isSafeInteger(value) && value >= 0; }
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const PUBLIC_PROGRESS = Object.freeze({
  ACCEPT: '门店已接单', START_MAKING: '商品制作中', MARK_READY: '商品已备妥',
  START_DELIVERY: '门店配送中', COMPLETE_PICKUP: '已完成自取', COMPLETE_DELIVERY: '已确认收货',
  CANCEL_UNPAID: '未付款订单已取消', REQUEST_CANCELLATION: '取消申请待门店审核',
  APPROVE_CANCELLATION: '门店已批准取消', REJECT_CANCELLATION: '门店未批准取消',
  REJECT_ORDER: '门店已拒单，退款按资金处理结果更新', APPROVE_REFUND: '门店已批准退款申请'
});
function commandFor(domain, action, payload) {
  if (domain === 'order') {
    const commands = { cancelUnpaid: 'CANCEL_UNPAID',
      'cancellation.request': 'REQUEST_CANCELLATION', 'delivery.confirm': 'COMPLETE_DELIVERY' };
    if (Object.hasOwn(commands, action)) return commands[action];
  }
  if (domain === 'admin') {
    if (action === 'order.transition') return payload.command;
    if (action === 'cancellation.review') return payload.decision === 'APPROVE' ?
      'APPROVE_CANCELLATION' : 'REJECT_CANCELLATION';
    if (action === 'refund.approve') return 'APPROVE_REFUND';
  }
  fail('UNSUPPORTED_ORDER_COMMAND');
}
function axes(order) {
  return Object.fromEntries(['orderStatus','paymentStatus','refundStatus','paidCents',
    'refundedCents','refundReservedCents','version'].map(key => [key, order[key]]));
}

function planControlledOrderCommand(domain, event, order, principal, roles, context) {
  requireOwner(principal, { ownerId: principal && principal.subjectId });
  const { contract, payload } = parseApiRequest(domain, event);
  const command = commandFor(domain, contract.action, payload);
  if (!plain(order)) fail('INVALID_TRADE_MODEL');
  const actor = domain === 'order' ? requireOwner(principal, order) :
    resolveStoreOrderActor(order, command, principal, roles);
  validateTradeSnapshot(order);
  if (order.id !== payload.orderId) fail('NOT_FOUND');
  assertExpectedVersion(order, payload.expectedVersion);
  if (!Number.isSafeInteger(order.version + 1)) fail('VERSION_CONFLICT');
  if (!plain(context) || !Number.isSafeInteger(context.now) || context.now <= 0 ||
      !Number.isFinite(new Date(context.now).getTime()) || !text(context.requestId)) fail('INVALID_CONFIGURATION');
  // No fabricated server time; full persisted-record temporal validation belongs to its loader.
  if (order.updatedAt !== undefined && (!counter(order.updatedAt) || order.updatedAt > context.now)) fail('INVALID_TRADE_MODEL');
  if (payload.pickupCredential !== undefined && command !== 'COMPLETE_PICKUP') fail('INVALID_REQUEST');
  if (command === 'COMPLETE_PICKUP' && !text(payload.pickupCredential)) fail('PICKUP_CREDENTIAL_REQUIRED');
  if (command === 'REJECT_ORDER' && !text(payload.reason, 2048)) fail('INVALID_REASON');

  const args = { expectedVersion: payload.expectedVersion };
  let reviewCondition = null;
  if (['APPROVE_CANCELLATION', 'REJECT_CANCELLATION'].includes(command)) {
    const review = context.review;
    if (!plain(review) || review.id !== payload.reviewId || !counter(review.version)) fail('INVALID_CANCELLATION_REVIEW');
    // review is a current server-loaded cancellation_requests record, not the payload.
    args.review = { id: review.id, orderId: review.orderId, ownerId: review.ownerId, status: review.status };
    reviewCondition = { id: review.id, version: review.version, status: 'PENDING' };
  }
  if (payload.refundCents !== undefined) args.refundCents = payload.refundCents;
  const transition = planOrderCommand(order, command, actor, args);
  let reason = '';
  if (payload.reason !== undefined) {
    if (typeof context.redactReason !== 'function') fail('REASON_POLICY_REQUIRED');
    reason = context.redactReason(payload.reason);
    if (!text(reason, 2048)) fail('INVALID_REASON'); // Async / unknown redaction fails closed.
  }
  const patch = { orderStatus: transition.nextOrderStatus, version: order.version + 1, updatedAt: context.now };
  if (transition.nextOrderStatus === 'CANCELLED' && order.orderStatus !== 'CANCELLED') {
    patch.cancelledAt = context.now;
    patch.cancellationReason = reason;
  }
  if (transition.nextOrderStatus === 'COMPLETED' && order.orderStatus !== 'COMPLETED') patch.completedAt = context.now;
  const action = domain + '.' + contract.action;
  const receiptId = idempotencyId({ environment: principal.environment,
    actorScope: JSON.stringify([principal.appId, principal.subjectId]), command: action, key: payload.idempotencyKey });
  // A draft deliberately has no "after" axes. Resource/refund executors must first
  // produce the final valid order, then seal before/after and atomically save the log.
  const logDraft = { _id: scopedDocumentId('order-log', [receiptId, order.id]),
    orderId: order.id, command, actor: { type: actor.type, subjectId: actor.subjectId, service: null },
    before: axes(order), requestId: context.requestId, eventId: null, reason,
    publicMessage: PUBLIC_PROGRESS[command], createdAt: context.now, requiresFinalAfter: true };
  return freeze({ scope: 'OFFLINE_ORDER_COMMAND_PLAN', callable: false, requiresAtomicPersistence: true,
    command, orderId: order.id, patch,
    conditions: { orderVersion: order.version, userVersion: principal.userVersion,
      grant: actor.type === 'STORE' ? { ...actor.grant } : null, review: reviewCondition },
    idempotency: { receiptId, fingerprint: requestFingerprint(payload), action },
    logDraft,
    effectInput: { reason, refundCents: transition.refundCents,
      reviewId: reviewCondition ? reviewCondition.id : null,
      pickupCredential: command === 'COMPLETE_PICKUP' ? payload.pickupCredential : null },
    requiredAtomicEffects: ['APPLY_ORDER_PATCH', ...transition.requiredEffects,
      'APPEND_ORDER_LOG', 'SAVE_IDEMPOTENCY_RESULT'] });
}
module.exports = { OrderCommandError, planControlledOrderCommand };
