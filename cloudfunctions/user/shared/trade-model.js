'use strict';

// Pure server-side model guards. Callers must resolve identity, persisted records
// and payment evidence on the server, then apply the plan in a database transaction.
const enumOf = values => Object.freeze(Object.fromEntries(values.map(value => [value, value])));
const ORDER_STATUS = enumOf(['PENDING_PAYMENT', 'PAID', 'ACCEPTED', 'MAKING', 'READY', 'DELIVERING', 'COMPLETED', 'CANCELLED']);
const PAYMENT_STATUS = enumOf(['UNPAID', 'PENDING', 'PAID', 'CLOSED', 'EXCEPTION']);
const REFUND_STATUS = enumOf(['NONE', 'PENDING', 'SUCCEEDED', 'FAILED']);
const FULFILLMENT = enumOf(['PICKUP', 'DELIVERY']);
const TRADE_POLICY = Object.freeze({
  version: 'v1-2026-10-03',
  paymentMode: 'FULL_PAYMENT',
  paidCancellation: 'STORE_REVIEW',
  merchantRejection: 'FULL_REFUND',
  otherRefunds: 'STORE_APPROVED_AMOUNT'
});
const messages = Object.freeze({
  INVALID_TRADE_MODEL: '交易数据无效', FORBIDDEN: '无权执行此操作',
  INVALID_TRANSITION: '当前状态不能执行此操作', PAYMENT_UNRESOLVED: '付款结果尚未确认',
  PAYMENT_AMOUNT_MISMATCH: '付款金额或币种不匹配',
  REFUND_AMOUNT_INVALID: '退款金额无效', REFUND_EXCEEDS_PAID: '退款总额超过实付金额',
  REFUND_IN_PROGRESS: '已有退款待处理或待核实', INVALID_CANCELLATION_REVIEW: '取消申请无效或已处理',
  POLICY_VERSION_UNSUPPORTED: '订单政策版本需要兼容处理', VERSION_CONFLICT: '数据已更新，请刷新'
});
class TradeModelError extends Error {
  constructor(code) { super(messages[code]); this.name = 'TradeModelError'; this.code = code; }
}
function fail(code) { throw new TradeModelError(code); }
function cents(value, allowZero = true) { return Number.isSafeInteger(value) && value >= (allowZero ? 0 : 1); }
function member(value, enumeration) { return Object.values(enumeration).includes(value); }
const paidStates = ['PAID', 'ACCEPTED', 'MAKING', 'READY', 'DELIVERING', 'COMPLETED'];
const cancellablePaidStates = ['PAID', 'ACCEPTED', 'MAKING', 'READY', 'DELIVERING'];

function validateTradeSnapshot(order) {
  if (!order || typeof order !== 'object' || Array.isArray(order)) fail('INVALID_TRADE_MODEL');
  for (const field of ['id', 'ownerId', 'storeId', 'tradePolicyVersion']) {
    if (typeof order[field] !== 'string' || !order[field].trim()) fail('INVALID_TRADE_MODEL');
  }
  if (!member(order.orderStatus, ORDER_STATUS) || !member(order.paymentStatus, PAYMENT_STATUS) ||
      !member(order.refundStatus, REFUND_STATUS) || !member(order.fulfillment, FULFILLMENT) ||
      order.currency !== 'CNY' || !cents(order.version) || !cents(order.totalCents, false)) fail('INVALID_TRADE_MODEL');
  for (const field of ['paidCents', 'refundedCents', 'refundReservedCents']) {
    if (!cents(order[field])) fail('INVALID_TRADE_MODEL');
  }
  const refundCommitment = order.refundedCents + order.refundReservedCents;
  if (!cents(refundCommitment) || refundCommitment > order.paidCents || order.paidCents > order.totalCents) fail('INVALID_TRADE_MODEL');
  if (order.paymentStatus === 'PAID' ? order.paidCents !== order.totalCents : order.paidCents !== 0) fail('INVALID_TRADE_MODEL');
  if (paidStates.includes(order.orderStatus) && order.paymentStatus !== 'PAID') fail('INVALID_TRADE_MODEL');
  if (order.orderStatus === 'PENDING_PAYMENT' && order.paidCents !== 0) fail('INVALID_TRADE_MODEL');
  if (order.orderStatus === 'CANCELLED' && ['PENDING', 'EXCEPTION'].includes(order.paymentStatus)) fail('INVALID_TRADE_MODEL');
  if (order.orderStatus === 'DELIVERING' && order.fulfillment !== 'DELIVERY') fail('INVALID_TRADE_MODEL');
  if (order.refundStatus === 'NONE' && refundCommitment !== 0) fail('INVALID_TRADE_MODEL');
  if (['PENDING', 'FAILED'].includes(order.refundStatus) && order.refundReservedCents === 0) fail('INVALID_TRADE_MODEL');
  if (order.refundStatus === 'SUCCEEDED' && (order.refundReservedCents !== 0 || order.refundedCents === 0)) fail('INVALID_TRADE_MODEL');
  return order;
}

function assertExpectedVersion(order, expectedVersion) {
  if (!cents(expectedVersion) || expectedVersion !== order.version) fail('VERSION_CONFLICT');
}
function assertRefundAmount(order, amountCents, allowZero = false) {
  validateTradeSnapshot(order);
  if (!cents(amountCents, allowZero)) fail('REFUND_AMOUNT_INVALID');
  if (amountCents > order.paidCents - order.refundedCents - order.refundReservedCents) fail('REFUND_EXCEEDS_PAID');
}
function actorCan(actor, order, type, capability) {
  if (!actor || actor.type !== type) return false;
  if (type === 'CUSTOMER') return actor.subjectId === order.ownerId;
  if (type === 'STORE') return Array.isArray(actor.storeIds) && actor.storeIds.includes(order.storeId);
  return Array.isArray(actor.capabilities) && actor.capabilities.includes(capability);
}
function requireActor(actor, order, type, capability) {
  if (!actorCan(actor, order, type, capability)) fail('FORBIDDEN');
}
function requireState(order, states) { if (!states.includes(order.orderStatus)) fail('INVALID_TRANSITION'); }
function plan(order, nextOrderStatus, requiredEffects = [], refundCents = 0) {
  return Object.freeze({ nextOrderStatus, refundCents, requiredEffects: Object.freeze(requiredEffects) });
}
function requireReview(order, review) {
  if (!review || typeof review.id !== 'string' || !review.id.trim() || review.orderId !== order.id ||
      review.ownerId !== order.ownerId || review.status !== 'PENDING') fail('INVALID_CANCELLATION_REVIEW');
}
function requireRefundSettled(order) {
  if (['PENDING', 'FAILED'].includes(order.refundStatus)) fail('REFUND_IN_PROGRESS');
}

function planOrderCommand(order, command, actor, args = {}) {
  validateTradeSnapshot(order);
  if (!args || typeof args !== 'object' || Array.isArray(args)) fail('INVALID_TRADE_MODEL');
  if (typeof command !== 'string') fail('INVALID_TRANSITION');
  if (order.tradePolicyVersion !== TRADE_POLICY.version) fail('POLICY_VERSION_UNSUPPORTED');
  if (args.expectedVersion !== undefined) assertExpectedVersion(order, args.expectedVersion);
  switch (command) {
    case 'PAYMENT_CONFIRMED':
      requireActor(actor, order, 'SYSTEM', 'PAYMENT_EVIDENCE');
      requireState(order, ['PENDING_PAYMENT', 'CANCELLED']);
      if (args.amountCents !== order.totalCents || args.currency !== order.currency) fail('PAYMENT_AMOUNT_MISMATCH');
      if (order.paymentStatus === 'PAID') fail('INVALID_TRANSITION');
      if (order.orderStatus === 'CANCELLED') return plan(order, 'CANCELLED', ['RECORD_PAYMENT', 'ENSURE_FULL_REFUND'], order.totalCents);
      return plan(order, 'PAID', ['RECORD_PAYMENT', 'CONFIRM_RESERVATIONS']);
    case 'CANCEL_UNPAID':
      if (!actorCan(actor, order, 'CUSTOMER') && !actorCan(actor, order, 'SYSTEM', 'ORDER_EXPIRY')) fail('FORBIDDEN');
      requireState(order, ['PENDING_PAYMENT']);
      if (!['UNPAID', 'CLOSED'].includes(order.paymentStatus)) fail('PAYMENT_UNRESOLVED');
      return plan(order, 'CANCELLED', ['RESOLVE_CANCELLED_RESERVATIONS']);
    case 'REQUEST_CANCELLATION':
      requireActor(actor, order, 'CUSTOMER');
      requireState(order, cancellablePaidStates);
      return plan(order, order.orderStatus, ['CREATE_CANCELLATION_REVIEW']);
    case 'APPROVE_CANCELLATION':
      requireActor(actor, order, 'STORE');
      requireState(order, cancellablePaidStates);
      requireReview(order, args.review);
      requireRefundSettled(order);
      assertRefundAmount(order, args.refundCents, true);
      return plan(order, 'CANCELLED', ['APPROVE_CANCELLATION_REVIEW', 'RESOLVE_CANCELLED_RESERVATIONS',
        ...(args.refundCents > 0 ? ['CREATE_REFUND_INTENT'] : [])], args.refundCents);
    case 'REJECT_CANCELLATION':
      requireActor(actor, order, 'STORE');
      requireState(order, paidStates);
      requireReview(order, args.review);
      return plan(order, order.orderStatus, ['REJECT_CANCELLATION_REVIEW']);
    case 'REJECT_ORDER':
      requireActor(actor, order, 'STORE');
      requireState(order, ['PAID']);
      requireRefundSettled(order);
      return plan(order, 'CANCELLED', ['RECORD_MERCHANT_REJECTION', 'RESOLVE_CANCELLED_RESERVATIONS',
        ...(order.paidCents > order.refundedCents ? ['ENSURE_FULL_REFUND'] : [])], order.paidCents - order.refundedCents);
    case 'APPROVE_REFUND':
      requireActor(actor, order, 'STORE');
      requireState(order, [...paidStates, 'CANCELLED']);
      if (order.paymentStatus !== 'PAID') fail('INVALID_TRANSITION');
      requireRefundSettled(order);
      assertRefundAmount(order, args.refundCents);
      return plan(order, order.orderStatus, ['RECORD_REFUND_APPROVAL', 'CREATE_REFUND_INTENT'], args.refundCents);
    default: {
      const transitions = {
        ACCEPT: ['PAID', 'ACCEPTED'], START_MAKING: ['ACCEPTED', 'MAKING'],
        MARK_READY: ['MAKING', 'READY'], START_DELIVERY: ['READY', 'DELIVERING'],
        COMPLETE_PICKUP: ['READY', 'COMPLETED'], COMPLETE_DELIVERY: ['DELIVERING', 'COMPLETED']
      };
      if (!Object.prototype.hasOwnProperty.call(transitions, command)) fail('INVALID_TRANSITION');
      if (command === 'COMPLETE_DELIVERY') {
        if (!actorCan(actor, order, 'STORE') && !actorCan(actor, order, 'CUSTOMER')) fail('FORBIDDEN');
      } else requireActor(actor, order, 'STORE');
      requireState(order, [transitions[command][0]]);
      if (command === 'COMPLETE_PICKUP' && order.fulfillment !== 'PICKUP') fail('INVALID_TRANSITION');
      if (['START_DELIVERY', 'COMPLETE_DELIVERY'].includes(command) && order.fulfillment !== 'DELIVERY') fail('INVALID_TRANSITION');
      const effects = command === 'START_MAKING' ? ['CONSUME_STOCK_RESERVATIONS'] :
        command === 'COMPLETE_PICKUP' ? ['VERIFY_PICKUP_CREDENTIAL', 'RECORD_FULFILLMENT'] :
        command === 'COMPLETE_DELIVERY' ? ['RECORD_DELIVERY_CONFIRMATION', 'RECORD_FULFILLMENT'] : [];
      return plan(order, transitions[command][1], effects);
    }
  }
}

function assertAxisTransition(from, to, transitions, enumeration) {
  if (!member(from, enumeration) || !member(to, enumeration)) fail('INVALID_TRANSITION');
  if (from === to) return false; // Duplicate evidence still needs ledger / payload checks in the caller.
  if (!(transitions[from] || []).includes(to)) fail('INVALID_TRANSITION');
  return true;
}
function assertPaymentTransition(from, to) {
  return assertAxisTransition(from, to, {
    UNPAID: ['PENDING', 'PAID', 'CLOSED', 'EXCEPTION'], PENDING: ['PAID', 'CLOSED', 'EXCEPTION'],
    EXCEPTION: ['PENDING', 'PAID', 'CLOSED'], CLOSED: ['PAID'], PAID: []
  }, PAYMENT_STATUS);
}
function assertRefundTransition(from, to) {
  return assertAxisTransition(from, to, {
    NONE: ['PENDING'], PENDING: ['SUCCEEDED', 'FAILED'], FAILED: ['PENDING', 'SUCCEEDED'], SUCCEEDED: ['PENDING']
  }, REFUND_STATUS);
}

module.exports = { ORDER_STATUS, PAYMENT_STATUS, REFUND_STATUS, FULFILLMENT, TRADE_POLICY,
  TradeModelError, validateTradeSnapshot, assertExpectedVersion, assertRefundAmount,
  planOrderCommand, assertPaymentTransition, assertRefundTransition };
