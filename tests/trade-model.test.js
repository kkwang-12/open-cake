'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { TRADE_POLICY, validateTradeSnapshot, planOrderCommand, assertRefundAmount,
  assertPaymentTransition, assertRefundTransition, assertExpectedVersion } = require('../cloudfunctions/_shared/trade-model');
const customer = { type: 'CUSTOMER', subjectId: 'customer-a' };
const store = { type: 'STORE', storeIds: ['store-a'] };
const paymentWorker = { type: 'SYSTEM', capabilities: ['PAYMENT_EVIDENCE'] };
function snapshot(overrides = {}) {
  return { id: 'order-a', ownerId: 'customer-a', storeId: 'store-a', tradePolicyVersion: TRADE_POLICY.version,
    fulfillment: 'PICKUP', orderStatus: 'PAID', paymentStatus: 'PAID', refundStatus: 'NONE',
    currency: 'CNY', totalCents: 23800, paidCents: 23800, refundedCents: 0, refundReservedCents: 0,
    version: 1, ...overrides };
}
const review = { id: 'cancel-a', orderId: 'order-a', ownerId: 'customer-a', status: 'PENDING' };
function expectCode(run, code) { assert.throws(run, error => error.code === code); }

test('全额支付后依次接单 / 制作 / 就绪，自提与配送分别合法完成', () => {
  for (const fulfillment of ['PICKUP', 'DELIVERY']) {
    let order = snapshot({ fulfillment, orderStatus: 'PENDING_PAYMENT', paymentStatus: 'PENDING', paidCents: 0 });
    let result = planOrderCommand(order, 'PAYMENT_CONFIRMED', paymentWorker, { amountCents: 23800, currency: 'CNY' });
    assert.equal(result.nextOrderStatus, 'PAID');
    order = { ...order, orderStatus: result.nextOrderStatus, paymentStatus: 'PAID', paidCents: 23800 };
    for (const [command, expected] of [['ACCEPT', 'ACCEPTED'], ['START_MAKING', 'MAKING'], ['MARK_READY', 'READY']]) {
      result = planOrderCommand(order, command, store);
      assert.equal(result.nextOrderStatus, expected);
      order = { ...order, orderStatus: expected };
    }
    if (fulfillment === 'DELIVERY') {
      result = planOrderCommand(order, 'START_DELIVERY', store);
      assert.equal(result.nextOrderStatus, 'DELIVERING');
      order = { ...order, orderStatus: 'DELIVERING' };
    }
    result = planOrderCommand(order, fulfillment === 'PICKUP' ? 'COMPLETE_PICKUP' : 'COMPLETE_DELIVERY', store);
    assert.equal(result.nextOrderStatus, 'COMPLETED');
    assert(result.requiredEffects.includes(fulfillment === 'PICKUP' ? 'VERIFY_PICKUP_CREDENTIAL' : 'RECORD_DELIVERY_CONFIRMATION'));
  }
});

test('顾客、跨门店角色和无支付证据权限的内部任务不能越权', () => {
  expectCode(() => planOrderCommand(snapshot(), 'ACCEPT', customer), 'FORBIDDEN');
  expectCode(() => planOrderCommand(snapshot(), 'ACCEPT', { type: 'STORE', storeIds: ['store-b'] }), 'FORBIDDEN');
  expectCode(() => planOrderCommand(snapshot(), 'REQUEST_CANCELLATION', { type: 'CUSTOMER', subjectId: 'customer-b' }), 'FORBIDDEN');
  const unpaid = snapshot({ orderStatus: 'PENDING_PAYMENT', paymentStatus: 'UNPAID', paidCents: 0 });
  expectCode(() => planOrderCommand(unpaid, 'PAYMENT_CONFIRMED', customer, { amountCents: 23800, currency: 'CNY' }), 'FORBIDDEN');
  expectCode(() => planOrderCommand(unpaid, 'PAYMENT_CONFIRMED', { type: 'SYSTEM', capabilities: ['ORDER_EXPIRY'] }), 'FORBIDDEN');
});

test('本人只能确认自己的配送中订单，不能核销自提或越权确认他人收货', () => {
  const order = snapshot({ orderStatus: 'DELIVERING', fulfillment: 'DELIVERY' });
  assert.equal(planOrderCommand(order, 'COMPLETE_DELIVERY', customer).nextOrderStatus, 'COMPLETED');
  expectCode(() => planOrderCommand(order, 'COMPLETE_DELIVERY', { type: 'CUSTOMER', subjectId: 'other' }), 'FORBIDDEN');
  expectCode(() => planOrderCommand(snapshot({ orderStatus: 'READY' }), 'COMPLETE_PICKUP', customer), 'FORBIDDEN');
});

test('不能跳过制作、混用履约、复活取消或回退已完成订单', () => {
  expectCode(() => planOrderCommand(snapshot(), 'MARK_READY', store), 'INVALID_TRANSITION');
  expectCode(() => planOrderCommand(snapshot({ orderStatus: 'READY' }), 'START_DELIVERY', store), 'INVALID_TRANSITION');
  expectCode(() => planOrderCommand(snapshot({ orderStatus: 'READY', fulfillment: 'DELIVERY' }), 'COMPLETE_PICKUP', store), 'INVALID_TRANSITION');
  for (const orderStatus of ['CANCELLED', 'COMPLETED']) {
    expectCode(() => planOrderCommand(snapshot({ orderStatus }), 'ACCEPT', store), 'INVALID_TRANSITION');
    expectCode(() => planOrderCommand(snapshot({ orderStatus }), 'APPROVE_CANCELLATION', store, { review, refundCents: 100 }), 'INVALID_TRANSITION');
  }
  expectCode(() => planOrderCommand(snapshot(), 'toString', store), 'INVALID_TRANSITION');
});

test('付款后取消只创建申请；商家批准前不终止订单或发起退款', () => {
  for (const orderStatus of ['PAID', 'ACCEPTED', 'MAKING', 'READY', 'DELIVERING']) {
    const order = Object.freeze(snapshot({ orderStatus, fulfillment: 'DELIVERY' }));
    const result = planOrderCommand(order, 'REQUEST_CANCELLATION', customer);
    assert.equal(result.nextOrderStatus, orderStatus);
    assert.equal(result.refundCents, 0);
    assert.deepEqual(result.requiredEffects, ['CREATE_CANCELLATION_REVIEW']);
  }
});

test('制作后的取消仍由商家审批；金额可为零、部分或全额；拒绝不改履约', () => {
  const order = snapshot({ orderStatus: 'MAKING' });
  for (const refundCents of [0, 10000, 23800]) {
    const approved = planOrderCommand(order, 'APPROVE_CANCELLATION', store, { review, refundCents });
    assert.equal(approved.nextOrderStatus, 'CANCELLED');
    assert.equal(approved.refundCents, refundCents);
    assert.equal(approved.requiredEffects.includes('CREATE_REFUND_INTENT'), refundCents > 0);
    assert(!approved.requiredEffects.includes('RESTORE_STOCK'));
  }
  const rejected = planOrderCommand(order, 'REJECT_CANCELLATION', store, { review });
  assert.equal(rejected.nextOrderStatus, 'MAKING');
  assert.equal(rejected.refundCents, 0);
  for (const invalidReview of [null, { ...review, orderId: 'other' }, { ...review, ownerId: 'other' }, { ...review, status: 'APPROVED' }]) {
    expectCode(() => planOrderCommand(order, 'APPROVE_CANCELLATION', store, { review: invalidReview, refundCents: 100 }), 'INVALID_CANCELLATION_REVIEW');
  }
});

test('商家未接单时拒单退足全部实付，已有部分退款只补剩余金额', () => {
  assert.equal(planOrderCommand(snapshot(), 'REJECT_ORDER', store).refundCents, 23800);
  const partiallyRefunded = snapshot({ refundedCents: 8000, refundStatus: 'SUCCEEDED' });
  assert.equal(planOrderCommand(partiallyRefunded, 'REJECT_ORDER', store).refundCents, 15800);
  const fullyRefunded = snapshot({ refundedCents: 23800, refundStatus: 'SUCCEEDED' });
  assert(!planOrderCommand(fullyRefunded, 'REJECT_ORDER', store).requiredEffects.includes('ENSURE_FULL_REFUND'));
  expectCode(() => planOrderCommand(snapshot({ orderStatus: 'ACCEPTED' }), 'REJECT_ORDER', store), 'INVALID_TRANSITION');
});

test('未付取消必须确认无支付意图或关单；未知付款不得提前释放资源', () => {
  for (const paymentStatus of ['UNPAID', 'CLOSED']) {
    const order = snapshot({ orderStatus: 'PENDING_PAYMENT', paymentStatus, paidCents: 0 });
    assert.equal(planOrderCommand(order, 'CANCEL_UNPAID', customer).nextOrderStatus, 'CANCELLED');
    assert.equal(planOrderCommand(order, 'CANCEL_UNPAID', { type: 'SYSTEM', capabilities: ['ORDER_EXPIRY'] }).nextOrderStatus, 'CANCELLED');
  }
  for (const paymentStatus of ['PENDING', 'EXCEPTION']) {
    const order = snapshot({ orderStatus: 'PENDING_PAYMENT', paymentStatus, paidCents: 0 });
    expectCode(() => planOrderCommand(order, 'CANCEL_UNPAID', customer), 'PAYMENT_UNRESOLVED');
  }
});

test('取消后可信迟到付款仍保持取消，必须记实际资金并补全额退款', () => {
  const order = snapshot({ orderStatus: 'CANCELLED', paymentStatus: 'CLOSED', paidCents: 0 });
  const result = planOrderCommand(order, 'PAYMENT_CONFIRMED', paymentWorker, { amountCents: 23800, currency: 'CNY' });
  assert.equal(result.nextOrderStatus, 'CANCELLED');
  assert.equal(result.refundCents, 23800);
  assert.deepEqual(result.requiredEffects, ['RECORD_PAYMENT', 'ENSURE_FULL_REFUND']);
  assert.equal(order.paidCents, 0); // A plan is not a database write or a fake payment result.
  for (const args of [{ amountCents: 1, currency: 'CNY' }, { amountCents: 23800, currency: 'USD' }]) {
    expectCode(() => planOrderCommand(order, 'PAYMENT_CONFIRMED', paymentWorker, args), 'PAYMENT_AMOUNT_MISMATCH');
  }
});

test('退款预算包括失败和进行中意图；新退款不得重复占用或超实付', () => {
  const order = snapshot({ orderStatus: 'CANCELLED', refundStatus: 'FAILED', refundedCents: 8000, refundReservedCents: 10000 });
  assertRefundAmount(order, 5800);
  expectCode(() => assertRefundAmount(order, 5801), 'REFUND_EXCEEDS_PAID');
  expectCode(() => planOrderCommand(order, 'APPROVE_REFUND', store, { refundCents: 100 }), 'REFUND_IN_PROGRESS');
  expectCode(() => assertRefundAmount(snapshot(), -1), 'REFUND_AMOUNT_INVALID');
  expectCode(() => assertRefundAmount(snapshot(), 1.5), 'REFUND_AMOUNT_INVALID');
  const completed = snapshot({ orderStatus: 'COMPLETED' });
  const result = planOrderCommand(completed, 'APPROVE_REFUND', store, { refundCents: 10000 });
  assert.equal(result.nextOrderStatus, 'COMPLETED');
  assert.equal(result.refundCents, 10000);
});

test('资金与退款轴不由客户端成功或失败回调直接回退；退款失败不等于成功', () => {
  assert.equal(assertPaymentTransition('PENDING', 'PAID'), true);
  assert.equal(assertPaymentTransition('CLOSED', 'PAID'), true);
  assert.equal(assertPaymentTransition('PAID', 'PAID'), false);
  expectCode(() => assertPaymentTransition('PAID', 'UNPAID'), 'INVALID_TRANSITION');
  assert.equal(assertRefundTransition('PENDING', 'FAILED'), true);
  assert.equal(assertRefundTransition('FAILED', 'PENDING'), true);
  assert.equal(assertRefundTransition('FAILED', 'SUCCEEDED'), true);
  expectCode(() => assertRefundTransition('NONE', 'SUCCEEDED'), 'INVALID_TRANSITION');
  expectCode(() => assertRefundTransition('SUCCEEDED', 'FAILED'), 'INVALID_TRANSITION');
  validateTradeSnapshot(snapshot({ orderStatus: 'CANCELLED', refundStatus: 'FAILED', refundReservedCents: 23800 }));
  expectCode(() => validateTradeSnapshot(snapshot({ refundStatus: 'SUCCEEDED' })), 'INVALID_TRADE_MODEL');
});

test('金额必须为安全整数分；全额收款与预算关系不可绕过', () => {
  for (const patch of [{ totalCents: 0 }, { totalCents: Infinity }, { paidCents: 23799 }, { refundedCents: -1 },
    { orderStatus: 'WAIT_DEPOSIT' }, { paidCents: 7140 },
    { refundedCents: 23801, refundStatus: 'SUCCEEDED' }, { refundStatus: 'FAILED', refundReservedCents: 0 },
    { paymentStatus: 'UNPAID' }, { orderStatus: 'CANCELLED', paymentStatus: 'PENDING', paidCents: 0 },
    { totalCents: Number.MAX_SAFE_INTEGER, paidCents: Number.MAX_SAFE_INTEGER, refundedCents: Number.MAX_SAFE_INTEGER, refundReservedCents: 1, refundStatus: 'PENDING' }]) {
    expectCode(() => validateTradeSnapshot(snapshot(patch)), 'INVALID_TRADE_MODEL');
  }
});

test('过期版本和未知政策版本拒绝；纯模型不会写数据库或改原快照', () => {
  const order = Object.freeze(snapshot());
  assertExpectedVersion(order, 1);
  expectCode(() => planOrderCommand(order, 'ACCEPT', store, { expectedVersion: 0 }), 'VERSION_CONFLICT');
  expectCode(() => planOrderCommand(snapshot({ tradePolicyVersion: 'unknown' }), 'ACCEPT', store), 'POLICY_VERSION_UNSUPPORTED');
  const result = planOrderCommand(order, 'ACCEPT', store);
  assert.equal(order.orderStatus, 'PAID');
  assert(Object.isFrozen(result));
  assert(Object.isFrozen(result.requiredEffects));
});
