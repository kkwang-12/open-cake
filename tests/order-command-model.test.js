'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { planControlledOrderCommand: plan } = require('../cloudfunctions/_shared/order-command-model');
const { identityFromPlatform, resolveCustomer } = require('../cloudfunctions/_shared/authorization-model');
const { TRADE_POLICY, ORDER_STATUS } = require('../cloudfunctions/_shared/trade-model');
const settings = { appId: 'wx-offline-order', environment: 'offline-order-test', stage: 'test' };
function principal(name) {
  const ctx = { APPID: settings.appId, ENV: settings.environment, OPENID: name };
  return resolveCustomer(ctx, settings, { ...identityFromPlatform(ctx, settings), schemaVersion: 1, version: 2, status: 'ACTIVE' });
}
const buyer = principal('buyer'), merchant = principal('merchant'), stranger = principal('stranger');
const role = { _id: 'role-test', schemaVersion: 1, version: 3, subjectId: merchant.subjectId,
  storeIds: ['store-test'], capabilities: ['ORDER_OPERATE', 'REFUND_APPROVE'], status: 'ACTIVE', revokedAt: null };
const now = Date.parse('2026-10-05T04:00:00Z');
const context = { now, requestId: 'server-trace-test', redactReason: () => '已脱敏的原因' };
function order(patch = {}) {
  return { id: 'order-test', ownerId: buyer.subjectId, storeId: 'store-test', version: 1,
    tradePolicyVersion: TRADE_POLICY.version, fulfillment: 'PICKUP', orderStatus: 'PAID',
    paymentStatus: 'PAID', refundStatus: 'NONE', totalCents: 18800, paidCents: 18800,
    refundedCents: 0, refundReservedCents: 0, currency: 'CNY', updatedAt: now - 1000, ...patch };
}
function event(action, extra = {}) {
  return { action, payload: { orderId: 'order-test', expectedVersion: 1,
    idempotencyKey: 'offline-order-key-0001', ...extra } };
}
function transition(command, extra = {}) { return event('order.transition', { command, ...extra }); }
function run(command, current = order(), extra = {}, actor = merchant, grants = [role], ctx = context) {
  return plan('admin', transition(command, extra), current, actor, grants, ctx);
}
function code(fn, expected) { assert.throws(fn, error => error.code === expected); }
const transitions = [
  ['ACCEPT', 'PAID', 'ACCEPTED', ['PICKUP','DELIVERY']],
  ['START_MAKING', 'ACCEPTED', 'MAKING', ['PICKUP','DELIVERY']],
  ['MARK_READY', 'MAKING', 'READY', ['PICKUP','DELIVERY']],
  ['START_DELIVERY', 'READY', 'DELIVERING', ['DELIVERY']],
  ['COMPLETE_PICKUP', 'READY', 'COMPLETED', ['PICKUP']],
  ['COMPLETE_DELIVERY', 'DELIVERING', 'COMPLETED', ['DELIVERY']]
];

test('O01 parameterized frozen transition table: every V1 state / mode / store command', () => {
  for (const [command, before, after, modes] of transitions) {
    for (const fulfillment of ['PICKUP','DELIVERY']) {
      for (const orderStatus of Object.keys(ORDER_STATUS)) {
        if (orderStatus === 'DELIVERING' && fulfillment === 'PICKUP') continue;
        const current = order({ fulfillment, orderStatus,
          ...(orderStatus === 'PENDING_PAYMENT' ? { paymentStatus: 'UNPAID', paidCents: 0 } : {}) });
        const options = command === 'COMPLETE_PICKUP' ? { pickupCredential: 'private-credential-test' } : {};
        const beforeJSON = JSON.stringify(current);
        if (before === orderStatus && modes.includes(fulfillment)) {
          const result = run(command, current, options);
          assert.equal(result.patch.orderStatus, after);
          assert.equal(result.patch.version, 2);
          assert.equal(result.patch.completedAt, after === 'COMPLETED' ? now : undefined);
          assert.equal(result.logDraft.before.orderStatus, before);
        } else code(() => run(command, current, options), 'INVALID_TRANSITION');
        assert.equal(JSON.stringify(current), beforeJSON);
      }
    }
  }
});

test('O01 plain buyers cannot use merchant endpoint, including their own delivery completion', () => {
  for (const [command, state, , modes] of transitions) {
    const current = order({ fulfillment: modes[0], orderStatus: state });
    code(() => run(command, current, {}, buyer, []), 'FORBIDDEN');
  }
  const current = order({ fulfillment: 'DELIVERY', orderStatus: 'DELIVERING' });
  const result = plan('order', event('delivery.confirm'), current, buyer, [], context);
  assert.equal(result.patch.orderStatus, 'COMPLETED');
  assert.equal(result.logDraft.actor.type, 'CUSTOMER');
  code(() => plan('order', event('delivery.confirm'), current, stranger, [], context), 'FORBIDDEN');
});

test('O01 only server-issued identity and current matching store grant authorize commands', () => {
  code(() => run('ACCEPT', order(), {}, { ...merchant }), 'AUTH_REQUIRED');
  for (const patch of [{ storeIds: ['other'] }, { subjectId: buyer.subjectId },
    { capabilities: [] }, { status: 'REVOKED', revokedAt: now }]) {
    code(() => run('ACCEPT', order(), {}, merchant, [{ ...role, ...patch }]), 'FORBIDDEN');
  }
  const result = run('ACCEPT');
  assert.deepEqual(result.conditions.grant, { roleId: role._id, roleVersion: 3, userVersion: 2 });
  assert.equal(result.conditions.userVersion, 2);
});

test('O01 rejects arbitrary status, payment evidence, actor or refund input through API whitelist', () => {
  for (const extra of [{ nextStatus: 'COMPLETED' }, { role: 'STORE' }, { actor: merchant },
    { paidCents: 18800 }, { refundCents: 1 }]) {
    code(() => run('ACCEPT', order(), extra), 'INVALID_REQUEST');
  }
  for (const command of ['PAYMENT_CONFIRMED','WAIT_DEPOSIT','toString','__proto__']) {
    code(() => run(command), 'INVALID_REQUEST');
  }
  code(() => plan('order', { action: 'create', payload: { quoteId: 'q', expectedQuoteVersion: 0,
    idempotencyKey: 'offline-order-key-0001' } }, order(), buyer, [], context), 'UNSUPPORTED_ORDER_COMMAND');
  code(() => run('ACCEPT', order({ orderStatus: 'WAIT_DEPOSIT' })), 'INVALID_TRADE_MODEL');
});

test('O01 mandatory current version and server clock; retry metadata does not pretend to write', () => {
  code(() => run('ACCEPT', order(), { expectedVersion: 0 }), 'VERSION_CONFLICT');
  code(() => run('ACCEPT', order({ version: Number.MAX_SAFE_INTEGER }),
    { expectedVersion: Number.MAX_SAFE_INTEGER }), 'VERSION_CONFLICT');
  for (const nowValue of [0, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
    code(() => run('ACCEPT', order(), {}, merchant, [role], { ...context, now: nowValue }), 'INVALID_CONFIGURATION');
  }
  code(() => run('ACCEPT', order({ updatedAt: now + 1 })), 'INVALID_TRADE_MODEL');
  const a = run('ACCEPT'), b = run('ACCEPT');
  assert.deepEqual(a.idempotency, b.idempotency);
  const changed = run('ACCEPT', order(), { reason: 'another reason' });
  assert.equal(changed.idempotency.receiptId, a.idempotency.receiptId);
  assert.notEqual(changed.idempotency.fingerprint, a.idempotency.fingerprint);
  assert.equal(a.callable, false); assert.equal(a.requiresAtomicPersistence, true);
  assert.equal(order().version, 1);
});

test('O01 unpaid cancel requires settled payment; paid request leaves status/resources unchanged', () => {
  const unpaid = order({ orderStatus: 'PENDING_PAYMENT', paymentStatus: 'UNPAID', paidCents: 0 });
  const request = event('cancelUnpaid', { reason: 'buyer private reason' });
  const cancelled = plan('order', request, unpaid, buyer, [], context);
  assert.equal(cancelled.patch.orderStatus, 'CANCELLED');
  assert.equal(cancelled.patch.cancelledAt, now);
  assert.equal(cancelled.patch.cancellationReason, '已脱敏的原因');
  assert(cancelled.requiredAtomicEffects.includes('RESOLVE_CANCELLED_RESERVATIONS'));
  for (const paymentStatus of ['PENDING','EXCEPTION']) {
    code(() => plan('order', request, { ...unpaid, paymentStatus }, buyer, [], context), 'PAYMENT_UNRESOLVED');
  }
  const paid = plan('order', event('cancellation.request', { reason: 'private' }), order(), buyer, [], context);
  assert.equal(paid.patch.orderStatus, 'PAID');
  assert.equal(paid.effectInput.refundCents, 0);
  assert.deepEqual(paid.requiredAtomicEffects, ['APPLY_ORDER_PATCH','CREATE_CANCELLATION_REVIEW',
    'APPEND_ORDER_LOG','SAVE_IDEMPOTENCY_RESULT']);
});

test('O01 cancellation approval uses loaded pending review and combined current refund permission', () => {
  const review = { id: 'review-test', version: 4, orderId: 'order-test', ownerId: buyer.subjectId, status: 'PENDING' };
  const request = event('cancellation.review', { reviewId: review.id, decision: 'APPROVE', refundCents: 10000, reason: 'private' });
  const result = plan('admin', request, order({ orderStatus: 'MAKING' }), merchant, [role], { ...context, review });
  assert.equal(result.patch.orderStatus, 'CANCELLED');
  assert.equal(result.effectInput.refundCents, 10000);
  assert.deepEqual(result.conditions.review, { id: review.id, version: 4, status: 'PENDING' });
  assert(!result.requiredAtomicEffects.includes('RESTORE_STOCK'));
  assert(result.requiredAtomicEffects.includes('CREATE_REFUND_INTENT'));
  for (const patch of [{ id: 'other' }, { orderId: 'other' }, { ownerId: stranger.subjectId },
    { status: 'APPROVED' }, { version: -1 }]) {
    code(() => plan('admin', request, order(), merchant, [role],
      { ...context, review: { ...review, ...patch } }), 'INVALID_CANCELLATION_REVIEW');
  }
  code(() => plan('admin', request, order(), merchant,
    [{ ...role, capabilities: ['ORDER_OPERATE'] }], { ...context, review }), 'FORBIDDEN');
  const rejected = plan('admin', event('cancellation.review', { reviewId: review.id,
    decision: 'REJECT', reason: 'private' }), order(), merchant,
    [{ ...role, capabilities: ['ORDER_OPERATE'] }], { ...context, review });
  assert.equal(rejected.patch.orderStatus, 'PAID');
  assert(rejected.requiredAtomicEffects.includes('REJECT_CANCELLATION_REVIEW'));
});

test('O01 merchant rejection refunds full remaining paid amount; separate refund keeps fulfillment axis', () => {
  const result = run('REJECT_ORDER', order({ refundStatus: 'SUCCEEDED', refundedCents: 8000 }), { reason: 'private' });
  assert.equal(result.effectInput.refundCents, 10800);
  assert.equal(result.patch.orderStatus, 'CANCELLED');
  assert(result.requiredAtomicEffects.includes('ENSURE_FULL_REFUND'));
  code(() => run('REJECT_ORDER'), 'INVALID_REASON');
  const request = event('refund.approve', { refundCents: 1000, reason: 'private' });
  const refund = plan('admin', request, order({ orderStatus: 'COMPLETED' }), merchant,
    [{ ...role, capabilities: ['REFUND_APPROVE'] }], context);
  assert.equal(refund.patch.orderStatus, 'COMPLETED');
  assert.equal(refund.patch.completedAt, undefined);
  assert.equal(refund.patch.refundStatus, undefined); // Must be materialized by refund executor.
  code(() => plan('admin', request, order({ refundStatus: 'FAILED', refundReservedCents: 100 }),
    merchant, [role], context), 'REFUND_IN_PROGRESS');
});

test('O01 logs contain whitelisted actor and sanitized reason, no final money state or credential', () => {
  const current = order({ orderStatus: 'READY', privateAddress: 'private-address' });
  const result = run('COMPLETE_PICKUP', current, { pickupCredential: 'private-credential-test', reason: 'private-phone' });
  assert.equal(result.logDraft.requestId, context.requestId);
  assert.equal(result.logDraft.reason, '已脱敏的原因');
  assert.equal(result.logDraft.after, undefined);
  assert.equal(result.logDraft.requiresFinalAfter, true);
  assert(!JSON.stringify(result.logDraft).includes('private-'));
  assert(result.requiredAtomicEffects.includes('VERIFY_PICKUP_CREDENTIAL'));
  assert.equal(result.effectInput.pickupCredential, 'private-credential-test'); // Internal verifier only.
  assert.equal(result.logDraft.actor.service, null);
  assert.equal(result.logDraft.actor.grant, undefined);
  code(() => run('COMPLETE_PICKUP', current), 'PICKUP_CREDENTIAL_REQUIRED');
  code(() => run('ACCEPT', order(), { pickupCredential: 'secret' }), 'INVALID_REQUEST');
  for (const redactReason of [undefined, () => null, () => Promise.resolve('text')]) {
    code(() => run('ACCEPT', order(), { reason: 'private' }, merchant, [role],
      { ...context, redactReason }), redactReason ? 'INVALID_REASON' : 'REASON_POLICY_REQUIRED');
  }
});

test('O01 illegal jumps produce no plan/log/effects and do not mutate loaded records', () => {
  const current = order(), roles = [{ ...role }];
  const baseline = JSON.stringify({ current, roles });
  const saved = { orders: [], logs: [], resources: [] };
  const executeIfPlanned = () => {
    const proposal = run('START_MAKING', current, {}, merchant, roles);
    saved.orders.push(proposal.patch); saved.logs.push(proposal.logDraft);
    saved.resources.push(...proposal.requiredAtomicEffects);
  };
  code(executeIfPlanned, 'INVALID_TRANSITION');
  assert.deepEqual(saved, { orders: [], logs: [], resources: [] });
  assert.equal(JSON.stringify({ current, roles }), baseline);
  const proposal = run('ACCEPT', current, {}, merchant, roles);
  assert(Object.isFrozen(proposal)); assert(Object.isFrozen(proposal.patch));
  assert(Object.isFrozen(proposal.logDraft.before)); assert(Object.isFrozen(proposal.requiredAtomicEffects));
  assert.throws(() => { proposal.patch.orderStatus = 'COMPLETED'; }, TypeError);
  assert.equal(JSON.stringify({ current, roles }), baseline);
});
