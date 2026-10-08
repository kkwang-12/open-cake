'use strict';
// OFFLINE_TEST_ONLY: O03 actual local snapshots, A01 local grants, synthetic PAID
// facts, serialized memory and identity-only provider proof. No cloud or funds.
const { setup: orderSetup } = require('./order-transaction');
const { clone } = require('./quote');
const { CAPABILITIES } = require('../../cloudfunctions/_shared/authorization-model');
const { scopedDocumentId } = require('../../cloudfunctions/_shared/idempotency-model');
const { bindingOf } = require('../../cloudfunctions/_shared/payment-recovery-model');
const { createAdminAccessService } = require('../../cloudfunctions/_shared/admin-access-service');
const { createMerchantOrderService, createMerchantOrderReadService } = require('../../cloudfunctions/_shared/merchant-order-service');
const { createOrderDeliveryService } = require('../../cloudfunctions/_shared/order-delivery-service');
const { createOrderPickupService } = require('../../cloudfunctions/_shared/order-pickup-service');
const { createRefundService } = require('../../cloudfunctions/_shared/refund-service');
const axes = order => Object.fromEntries(['orderStatus','paymentStatus','refundStatus','paidCents','refundedCents','refundReservedCents','version'].map(key => [key, order[key]]));
async function setup({ mode = 'PICKUP', quantity = 2, paid = true } = {}) {
  const s = orderSetup(), quote = s.makeQuote({ mode, quantity }), created = await s.service.execute(quote.event, quote.customer);
  const orderId = created.result.entityId, order = s.db.orders[orderId];
  s.db.refunds = {}; s.db.refundAttempts = {}; s.db.paymentEvents = {}; s.db.audits = {}; s.db.cancellations = {};
  const primary = s.actor('offline-admin-primary'), secondary = s.actor('offline-admin-secondary');
  for (const [principal, openId] of [[primary,'offline-admin-primary'], [secondary,'offline-admin-secondary']])
    s.db.users[principal.subjectId] = { _id: principal.subjectId, environment: principal.environment, appId: principal.appId,
      openId, schemaVersion: 1, version: principal.userVersion, status: 'ACTIVE' };
  function append(command, patch) {
    const order = s.db.orders[orderId], before = axes(order);
    Object.assign(order, patch); order.version++; order.updatedAt++;
    const log = { _id: scopedDocumentId('offline-merchant-history', [orderId, String(order.version)]), schemaVersion: 1, version: 0,
      createdAt: order.updatedAt, updatedAt: order.updatedAt, orderId, command, before, after: axes(order),
      actor: { type: 'SYSTEM', subjectId: null, service: 'OFFLINE_TEST_ONLY' }, requestId: 'offline-history', eventId: null, reason: '', publicMessage: '' };
    s.db.logs[log._id] = log; return log;
  }
  if (paid) {
    append('PAYMENT_CONFIRMED', { orderStatus: 'PAID', paymentStatus: 'PAID', paidCents: order.totalCents, paidAt: order.updatedAt + 1 });
    for (const reservation of Object.values(s.db.reservations)) {
      const resource = (reservation.resourceKind === 'STOCK' ? s.db.stocks : s.db.slots)[reservation.resourceId];
      resource.heldUnits -= reservation.quantity; resource.confirmedUnits += reservation.quantity; resource.version++; resource.updatedAt = order.updatedAt;
      reservation.status = 'CONFIRMED'; reservation.version++; reservation.updatedAt = order.updatedAt;
    }
    const payment = { _id: scopedDocumentId('offline-merchant-payment', [orderId]), schemaVersion: 1, version: 1,
      createdAt: order.createdAt, updatedAt: order.updatedAt, expiresAt: order.paymentDeadlineAt,
      orderId, ownerId: order.ownerId, environment: primary.environment, appId: primary.appId, stage: 'test',
      provider: 'WECHATPAY_DIRECT_V3', merchantId: 'OFFLINE_MERCHANT', profileVersion: 'OFFLINE_ARCHIVED_PROFILE',
      outTradeNo: 'OFFLINE_PAYMENT_' + orderId.slice(0, 12), currency: order.currency, amountCents: order.totalCents,
      status: 'PAID', accountingState: 'APPLIED', confirmedAt: order.updatedAt, transactionId: 'OFFLINE_TRANSACTION_' + orderId,
      closedAt: null, lastEventId: 'OFFLINE_PAYMENT_PROOF' };
    s.db.payments[payment._id] = payment;
  }
  s.controls.now = order.updatedAt + 100;
  const context = { environment: primary.environment, appId: primary.appId, stage: 'test', allowedCloudPrefixes: [] };
  const key = { id: 'OFFLINE_MERCHANT_CURSOR', secret: Buffer.alloc(32, 37) };
  const children = (data, orders) => {
    const ids = new Set(orders.map(order => order._id));
    return { orders, items: Object.values(data.items).filter(item => ids.has(item.orderId)),
      logs: Object.values(data.logs).filter(log => ids.has(log.orderId)),
      cancellations: Object.values(data.cancellations || {}).filter(value => ids.has(value.orderId)), mediaAssets: [] };
  };
  function access(data) {
    return { environment: context.environment, appId: context.appId, complete: true, roles: Object.values(data.roles),
      stores: Object.values(data.stores).map(store => ({ _id: store._id, schemaVersion: 1, version: store.version,
        status: store.status, environment: context.environment, appId: context.appId })) };
  }
  const stateFor = (data, order) => {
    const reservations = Object.values(data.reservations).filter(value => value.orderId === order._id);
    return { environment: context.environment, appId: context.appId, complete: true, quote: data.quotes[order.quoteId], reservations,
      resources: reservations.map(value => ({ resourceKind: value.resourceKind,
        resource: (value.resourceKind === 'STOCK' ? data.stocks : data.slots)[value.resourceId] })),
      payments: Object.values(data.payments).filter(value => value.orderId === order._id),
      refunds: Object.values(data.refunds).filter(value => value.orderId === order._id), ...children(data, [order]) };
  };
  const controls = s.controls; controls.queries = []; controls.childReads = 0; controls.statePatch = null; controls.pagePatch = null;
  controls.extendTransaction = ({ staged, snapshot, changed, insert }) => {
    const stable = () => !controls.denyFence && JSON.stringify(s.db) === snapshot;
    return {
      readAccessState: async () => clone(access(staged)),
      assertAccessReads: async () => stable(), readAudit: async id => staged.audits[id] || null,
      insertRole: async value => insert('roles', value), insertAudit: async value => insert('audits', value),
      revokeRole: async (value, expectedVersion) => {
        if (staged.roles[value._id]?.version !== expectedVersion) return 0;
        staged.roles[value._id] = clone(value); return changed();
      },
      readMerchantOrderState: async order => {
        controls.childReads++; const state = clone(stateFor(staged, order)); if (controls.statePatch) controls.statePatch(state); return state;
      },
      readRefundByNumber: async number => Object.values(staged.refunds).find(refund => refund.outRefundNo === number.outRefundNo) || null,
      assertMerchantOrderReads: async () => stable(),
      insertRefund: async value => insert('refunds', value),
      readMerchantOrderPage: async query => {
        controls.queries.push(clone(query)); controls.childReads++;
        const orders = Object.values(staged.orders).filter(order => order.storeId === query.storeId && query.states.includes(order.orderStatus) &&
          (!query.seek || query.seek.some(and => and.every(term => term.operator === 'EQ' ? order[term.field] === term.value : order[term.field] < term.value))))
          .sort((a,b) => b.createdAt - a.createdAt || (a._id > b._id ? -1 : a._id < b._id ? 1 : 0)).slice(0, query.limit);
        const state = clone(children(staged, orders)); if (controls.pagePatch) controls.pagePatch(state); return state;
      },
      readMerchantOrderDetail: async query => { controls.childReads++; return clone(children(staged,
        Object.values(staged.orders).filter(order => order._id === query.orderId && order.storeId === query.storeId))); },
      assertMerchantReadSnapshot: async () => stable(),
      readRefundState: async id => {
        const refund = staged.refunds[id], order = staged.orders[refund.orderId];
        return { order, refund, payment: staged.payments[refund.paymentId], payments: Object.values(staged.payments).filter(p => p.orderId === order._id),
          refunds: Object.values(staged.refunds).filter(r => r.orderId === order._id),
          attempts: Object.values(staged.refundAttempts).filter(a => a.refundId === id), logs: Object.values(staged.logs).filter(log => log.orderId === order._id) };
      },
      readAttempt: async id => staged.refundAttempts[id] || null, readEvent: async id => staged.paymentEvents[id] || null,
      assertRefundReads: async () => stable(), insertAttempt: async value => insert('refundAttempts', value),
      insertEvent: async value => insert('paymentEvents', value),
      saveAttempt: async (value, version) => { if (staged.refundAttempts[value._id]?.version !== version) return 0; staged.refundAttempts[value._id] = clone(value); return changed(); },
      saveRefund: async (value, version) => { if (staged.refunds[value._id]?.version !== version) return 0; staged.refunds[value._id] = clone(value); return changed(); }
    };
  };
  let sequence = 0;
  const now = () => controls.nowSequence ? controls.nowSequence.shift() : controls.now;
  const newRequestId = () => 'OFFLINE_ADMIN_ORDER_TRACE_' + (++sequence);
  const invocation = Object.freeze({ offline: true });
  const adminService = createAdminAccessService({ environment: context.environment, appId: context.appId, runTransaction: s.runTransaction,
    now, newRequestId, redactReason: () => '隔离测试脱敏依据', verifyBootstrapInvocation: value => value === invocation,
    loadBootstrapAuthorization: () => ({ schemaVersion: 1, version: 0, environment: context.environment, appId: context.appId,
      authorizationId: 'OFFLINE_MERCHANT_INITIAL_APPROVAL', subjectId: primary.subjectId, storeIds: [s.storeId], capabilities: [...CAPABILITIES],
      validFrom: controls.now - 1000, expiresAt: controls.now + 1000000, reason: '隔离测试' }) });
  const rootRoleId = (await adminService.bootstrap(invocation)).result.entityId;
  const secondRoleId = (await adminService.execute({ action: 'role.grant', payload: { subjectId: secondary.subjectId, storeIds: [s.storeId],
    capabilities: [...CAPABILITIES], reason: '隔离测试第二管理员', idempotencyKey: 'OFFLINE_SECOND_MERCHANT_ROLE' } }, primary)).result.entityId;
  const configuration = (_tx, binding) => ({ plan: () => ({ ...binding, route: binding.provider }) });
  const pickupOptions = { environment: context.environment, appId: context.appId, runTransaction: s.runTransaction, now, newRequestId,
    currentKeyId: 'OFFLINE_PICKUP_VALUE', fingerprintKeyId: 'OFFLINE_PICKUP_HASH',
    keys: { OFFLINE_PICKUP_VALUE: Buffer.alloc(32, 61), OFFLINE_PICKUP_HASH: Buffer.alloc(32, 67) },
    policy: { version: 'OFFLINE_TEST_ONLY', format: 'OPAQUE_TOKEN', ttlMs: 60000, maxFailedAttempts: 3, attemptCooldownMs: 1000, slotCompletion: 'KEEP_CONFIRMED' } };
  const pickupService = createOrderPickupService(pickupOptions);
  const deliveryService = createOrderDeliveryService({ environment: context.environment, appId: context.appId, runTransaction: s.runTransaction,
    now, newRequestId, completionPolicy: { version: 'OFFLINE_TEST_ONLY', slotCompletion: 'KEEP_CONFIRMED' } });
  const options = { context, key, runTransaction: s.runTransaction, now, newRequestId, redactReason: () => '门店受权处理',
    loadPaymentConfiguration: configuration, newRefundNumber: refundId => 'R' + refundId.slice(0,31), pickupOptions,
    deliveryOptions: { completionPolicy: { version: 'OFFLINE_TEST_ONLY', slotCompletion: 'KEEP_CONFIRMED' } } };
  const merchantService = createMerchantOrderService(options);
  const readService = createMerchantOrderReadService({ context, key, now, runReadTransaction: s.runTransaction });
  const event = (command, patch = {}) => ({ action: 'order.transition', payload: { orderId, expectedVersion: s.db.orders[orderId].version,
    command, idempotencyKey: 'OFFLINE_MERCHANT_' + command, ...(command === 'REJECT_ORDER' ? { reason: '取消：私密电话13800138000' } : {}), ...patch } });
  const readEvent = (action = 'order.get', patch = {}) => ({ action, payload: action === 'orders.list' ? { storeId: s.storeId, ...patch } : { orderId, ...patch } });
  const proofs = new WeakMap();
  const refundService = createRefundService({ environment: context.environment, appId: context.appId, provider: 'WECHATPAY_DIRECT_V3',
    runTransaction: s.runTransaction, now, newRequestId, maxResultBytes: 16384, queryRetryAfterMs: 1000,
    loadConfiguration: configuration, verifyRefundInvocation: value => value === invocation, verifyRefundResult: value => proofs.get(value) || null });
  function refundResponse(attemptId) {
    const attempt = s.db.refundAttempts[attemptId], refund = s.db.refunds[attempt.refundId], payment = s.db.payments[refund.paymentId];
    const response = Object.freeze({ offline: ++sequence });
    proofs.set(response, { attemptId, providerEventId: 'OFFLINE_REFUND_EVENT_' + sequence, binding: bindingOf(payment),
      outTradeNo: payment.outTradeNo, transactionId: payment.transactionId, outRefundNo: refund.outRefundNo,
      providerRefundId: 'OFFLINE_PROVIDER_REFUND_' + refund._id, currency: 'CNY', paymentCents: payment.amountCents,
      refundCents: refund.amountCents, outcome: 'SUCCESS', occurredAt: controls.now, occurredAtPrecisionMs: 1,
      verificationMethod: 'SERVER_AUTHENTICATED_PROVIDER_RESPONSE' }); return response;
  }
  return { ...s, orderId, owner: quote.customer, primary, secondary, rootRoleId, secondRoleId, context, key, options,
    merchantService, readService, adminService, pickupService, refundService, refundResponse, invocation, event, readEvent, append, children };
}
module.exports = { setup, axes, clone };
