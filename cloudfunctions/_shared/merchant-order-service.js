'use strict';
// A02 internal/offline orchestration. No SDK handler, transport or client entry.
const { parseApiRequest } = require('./api-contract');
const { requireOwner, requireStoreCapability, resolveStoreOrderActor } = require('./authorization-model');
const { validateScopedAdminState } = require('./admin-access-state');
const { requireCurrentOrderUser } = require('./order-transaction-service');
const { createMerchantOrderReadModel } = require('./order-read-model');
const { createOrderDeliveryService } = require('./order-delivery-service');
const { createOrderPickupService } = require('./order-pickup-service');
const { planControlledOrderCommand } = require('./order-command-model');
const { validateOrderTime, validatePayments, planCancelledResources } = require('./order-cancellation-model');
const { validateFulfillmentResources } = require('./order-fulfillment-resources');
const { validateResource } = require('./resource-model');
const { validateLedger } = require('./refund-model');
const { bindingOf } = require('./payment-recovery-model');
const { canonicalJSON, scopedDocumentId, requestFingerprint, idempotencyId, decideIdempotency } = require('./idempotency-model');
const fail = code => { throw Object.assign(new Error(code), { code }); };
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 256 && value === value.trim() && value.isWellFormed();
const time = value => Number.isSafeInteger(value) && value > 0 && Number.isFinite(new Date(value).getTime());
const counter = value => Number.isSafeInteger(value) && value >= 0;
const dense = values => Array.isArray(values) && Object.keys(values).length === values.length;
const copy = value => JSON.parse(canonicalJSON(value));
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
const AXES = ['orderStatus','paymentStatus','refundStatus','paidCents','refundedCents','refundReservedCents','version'];
const axes = order => Object.fromEntries(AXES.map(field => [field, order[field]]));
const resultFor = (disposition, result, refundIntentId = null) => freeze({ scope: 'OFFLINE_MERCHANT_ORDER_RESULT',
  disposition, result, refundIntentId, cloudVerified: false, callable: false, operationsAllowed: false, externalRefundExecuted: false });
function settingsFor(context, key, now) {
  context = copy(context);
  if (!text(context.environment) || !text(context.appId) || typeof now !== 'function' || !key ||
    !text(key.id) || !Buffer.isBuffer(key.secret) || key.secret.length < 32) fail('INVALID_CONFIGURATION');
  return { context, key: { id: key.id, secret: Buffer.from(key.secret) }, clock() {
    const at = now(); if (!time(at)) fail('INVALID_CONFIGURATION'); return at;
  } };
}
function principalFor(principal, context) {
  requireOwner(principal, { ownerId: principal && principal.subjectId });
  if (principal.environment !== context.environment || principal.appId !== context.appId) fail('FORBIDDEN');
}
function accessFor(access, principal, context, at, storeId) {
  validateScopedAdminState(access, { ...context, now: at });
  if (!access.stores.some(store => store._id === storeId && store.status !== 'ARCHIVED')) fail('FORBIDDEN');
  return requireStoreCapability(principal, access.roles, storeId, ['ORDER_OPERATE']);
}
function validateChildren(state) {
  if (!state || !dense(state.orders) || !dense(state.items) || !dense(state.logs) || !dense(state.cancellations) || !dense(state.mediaAssets))
    fail('INVALID_ORDER_READ_STATE');
  const ids = new Set(state.orders.map(order => order?._id));
  if (['items','logs','cancellations'].some(field => state[field].some(value => !value || !ids.has(value.orderId)))) fail('INVALID_ORDER_READ_STATE');
}
function createMerchantOrderReadService({ runReadTransaction, now, context, key }) {
  if (typeof runReadTransaction !== 'function') fail('INVALID_CONFIGURATION');
  const settings = settingsFor(context, key, now); context = settings.context; key = settings.key;
  return Object.freeze({ async execute(event, principal) {
    principalFor(principal, context);
    const { contract, payload } = parseApiRequest('admin', event);
    if (!['orders.list','order.get'].includes(contract.action)) fail('INVALID_REQUEST');
    return runReadTransaction(async tx => {
      if (!tx || ['readUser','readAccessState','readOrder','readMerchantOrderPage','readMerchantOrderDetail',
        'assertMerchantReadSnapshot'].some(name => typeof tx[name] !== 'function')) fail('INVALID_READ_ADAPTER');
      const user = copy(await tx.readUser(principal.subjectId)); requireCurrentOrderUser(user, principal);
      const access = copy(await tx.readAccessState()), start = settings.clock();
      const header = contract.action === 'order.get' ? await tx.readOrder(payload.orderId) : null;
      if (contract.action === 'order.get' && (!header || header._id !== payload.orderId)) fail('NOT_FOUND');
      const storeId = header ? header.storeId : payload.storeId;
      let actor;
      try { actor = accessFor(access, principal, context, start, storeId); }
      catch (error) { if (contract.action === 'order.get' && error.code === 'FORBIDDEN') fail('NOT_FOUND'); throw error; }
      const empty = { user, orders: [], items: [], logs: [], cancellations: [], mediaAssets: [] };
      const planner = createMerchantOrderReadModel(empty, principal, context, key, storeId, access.roles, start);
      const query = contract.action === 'orders.list' ? planner.planListQuery(event, start) : null;
      const state = copy(query ? await tx.readMerchantOrderPage(query) : await tx.readMerchantOrderDetail({ storeId, orderId: payload.orderId }));
      validateChildren(state);
      if (state.orders.some(order => !order || order.storeId !== storeId)) fail('INVALID_ORDER_READ_STATE');
      if (!query && (state.orders.length !== 1 || state.orders[0]._id !== header._id ||
        canonicalJSON(state.orders[0]) !== canonicalJSON(header))) fail('VERSION_CONFLICT');
      if (query && (state.orders.length > query.limit || state.orders.some(order => !query.states.includes(order.orderStatus) ||
        query.seek && !query.seek.some(and => and.every(term => term.operator === 'EQ' ? order[term.field] === term.value : order[term.field] < term.value)))))
        fail('INVALID_ORDER_READ_STATE');
      const at = settings.clock(); if (at < start) fail('INVALID_CONFIGURATION');
      const model = createMerchantOrderReadModel({ ...state, user }, principal, context, key, storeId, access.roles, at);
      const output = query ? model.list(event, at) : model.get(event, at);
      if (await tx.assertMerchantReadSnapshot({ user: copy(user), access, state, grant: actor.grant, query,
        storeId, orderId: header?._id || null }) !== true) fail('VERSION_CONFLICT');
      return output;
    });
  } });
}
function createMerchantOrderService(options) {
  const { runTransaction, now, newRequestId, redactReason, loadPaymentConfiguration, newRefundNumber,
    deliveryOptions = null, pickupOptions = null } = options;
  if (![runTransaction, newRequestId, redactReason, loadPaymentConfiguration, newRefundNumber].every(fn => typeof fn === 'function')) fail('INVALID_CONFIGURATION');
  const { context, key, clock } = settingsFor(options.context, options.key, now);
  async function authorizeMerchant(tx, principal, order) {
    if (typeof tx.readAccessState !== 'function' || typeof tx.assertAccessReads !== 'function') fail('INVALID_TRANSACTION_ADAPTER');
    const access = copy(await tx.readAccessState());
    accessFor(access, principal, context, clock(), order.storeId);
    const user = copy(await tx.readUser(principal.subjectId)); requireCurrentOrderUser(user, principal);
    if (await tx.assertAccessReads({ environment: context.environment, appId: context.appId, state: access,
      users: [user], receiptId: null, auditId: null, bootstrapAuthorization: null }) !== true) fail('VERSION_CONFLICT');
    return access.roles;
  }
  const trusted = { environment: context.environment, appId: context.appId, runTransaction, now, newRequestId, authorizeMerchant };
  const deliveryService = deliveryOptions === null ? null : createOrderDeliveryService({ ...deliveryOptions, ...trusted });
  const pickupService = pickupOptions === null ? null : createOrderPickupService({ ...pickupOptions, ...trusted });
  const ownCommands = ['ACCEPT','START_MAKING','MARK_READY','REJECT_ORDER'];
  const methods = ['readUser','readOrder','readReceipt','readAccessState','readMerchantOrderState','readRefundByNumber',
    'assertMerchantOrderReads','updateResource','updateReservation','insertRefund','saveOrder','insertLog','insertReceipt'];
  async function write(effect) { if (await effect !== 1) fail('VERSION_CONFLICT'); }
  function stateFor(order, state) {
    if (!state || state.complete !== true || state.environment !== context.environment || state.appId !== context.appId ||
      !dense(state.payments) || !dense(state.refunds) || !dense(state.reservations) || !dense(state.resources)) fail('INVALID_MERCHANT_ORDER_STATE');
    const quote = state.quote;
    if (!quote || quote._id !== order.quoteId || quote.schemaVersion !== 1 || !counter(quote.version) ||
      quote.status !== 'CONSUMED' || quote.consumedOrderId !== order._id || quote.ownerId !== order.ownerId || quote.storeId !== order.storeId ||
      quote.facts?.fulfillment !== order.fulfillment || quote.facts?.appointmentSnapshot?.slotId !== order.appointmentSnapshot?.slotId)
      fail('INVALID_MERCHANT_ORDER_STATE');
  }
  function projection(order, state, user, principal, roles, at) {
    const records = { user, orders: [order], items: state.items, logs: state.logs, cancellations: state.cancellations, mediaAssets: state.mediaAssets };
    validateChildren(records);
    return createMerchantOrderReadModel(records, principal, context, key, order.storeId, roles, at)
      .get({ action: 'order.get', payload: { orderId: order._id } }, at);
  }
  async function fundsFor(tx, order, state, at) {
    validatePayments(order, state.payments, { appId: context.appId, now: at });
    if (state.payments.some(payment => payment.environment !== context.environment ||
      !['WECHATPAY_DIRECT_V3','CLOUDBASE_INTEGRATION_V3'].includes(payment.provider))) fail('REFUND_PAYMENT_UNRESOLVED');
    const paid = state.payments.filter(payment => payment.status === 'PAID' && payment.accountingState === 'APPLIED');
    const payment = paid[0];
    if (paid.length !== 1 || !payment || state.payments.some(other => other._id !== payment._id && other.status !== 'CLOSED') ||
      order.paymentStatus !== 'PAID' || !text(payment.transactionId) || !time(payment.confirmedAt) ||
      payment.confirmedAt > payment.updatedAt) fail('REFUND_PAYMENT_UNRESOLVED');
    let configuration = null;
    if (state.refunds.length) {
      configuration = await loadPaymentConfiguration(tx, bindingOf(payment), at);
      validateLedger({ order, payment, payments: state.payments, refunds: state.refunds, refund: state.refunds[0],
        attempts: [], logs: state.logs }, { ...context, provider: payment.provider, now: at, configuration });
    } else if (order.refundStatus !== 'NONE' || order.refundedCents !== 0 || order.refundReservedCents !== 0) fail('INVALID_REFUND_BUDGET');
    return { payment, configuration };
  }
  async function fence(tx, principal, user, access, order, state, receiptId, logId, number = null) {
    if (await tx.assertMerchantOrderReads({ user: copy(user), access: copy(access), order: copy(order), state: copy(state),
      userId: principal.subjectId, userVersion: principal.userVersion, receiptId, logId, refundNumber: number }) !== true) fail('VERSION_CONFLICT');
  }
  function replay(order, state, receipt, decision, payload, principal, command, logId) {
    const log = state.logs.find(value => value._id === logId), expectedFrom = { ACCEPT:'PAID', START_MAKING:'ACCEPTED', MARK_READY:'MAKING', REJECT_ORDER:'PAID' }[command];
    const expectedTo = { ACCEPT:'ACCEPTED', START_MAKING:'MAKING', MARK_READY:'READY', REJECT_ORDER:'CANCELLED' }[command];
    if (!receipt || receipt.schemaVersion !== 1 || receipt.version !== 0 || receipt.status !== 'SUCCEEDED' ||
      !time(receipt.createdAt) || receipt.updatedAt !== receipt.createdAt || receipt.leaseUntil !== null || receipt.retentionUntil !== null ||
      decision.result.errorCode !== null || decision.result.entityId !== order._id || decision.result.version !== payload.expectedVersion + 1 ||
      decision.result.version > order.version || !log || log.command !== command || log.actor?.type !== 'STORE' ||
      log.actor?.subjectId !== principal.subjectId || log.actor.service !== null || log.createdAt !== receipt.createdAt ||
      log.before?.version !== payload.expectedVersion || log.after?.version !== decision.result.version ||
      log.before.orderStatus !== expectedFrom || log.after.orderStatus !== expectedTo) fail('INVALID_IDEMPOTENCY_RECORD');
    const expected = { ...log.before, version: decision.result.version, orderStatus: expectedTo };
    const amount = command === 'REJECT_ORDER' ? log.before.paidCents - log.before.refundedCents : 0;
    if (amount > 0) Object.assign(expected, { refundStatus: 'PENDING', refundReservedCents: amount });
    if (canonicalJSON(expected) !== canonicalJSON(log.after)) fail('INVALID_IDEMPOTENCY_RECORD');
    const refunds = state.refunds.filter(refund => refund.approvalLogId === logId);
    if (amount > 0 ? refunds.length !== 1 || refunds[0].amountCents !== amount : refunds.length !== 0) fail('INVALID_IDEMPOTENCY_RECORD');
    return refunds[0]?._id || null;
  }
  return Object.freeze({ async execute(event, principal) {
    principalFor(principal, context);
    const { contract, payload } = parseApiRequest('admin', event);
    if (contract.action !== 'order.transition') fail('UNSUPPORTED_ORDER_COMMAND');
    // Keep O07's HMAC receipt fingerprint and O08's own atomic authority checks.
    if (['START_DELIVERY','COMPLETE_DELIVERY'].includes(payload.command)) {
      if (!deliveryService || typeof deliveryService.execute !== 'function') fail('CONFIGURATION_REQUIRED');
      return deliveryService.execute('admin', event, principal);
    }
    if (payload.command === 'COMPLETE_PICKUP') {
      if (!pickupService || typeof pickupService.complete !== 'function') fail('CONFIGURATION_REQUIRED');
      return pickupService.complete(event, principal);
    }
    if (!ownCommands.includes(payload.command)) fail('UNSUPPORTED_ORDER_COMMAND');
    const requestId = newRequestId(); if (!text(requestId)) fail('INVALID_CONFIGURATION');
    return runTransaction(async tx => {
      if (!tx || methods.some(name => typeof tx[name] !== 'function')) fail('INVALID_TRANSACTION_ADAPTER');
      const user = copy(await tx.readUser(principal.subjectId)); requireCurrentOrderUser(user, principal);
      const access = copy(await tx.readAccessState()), order = copy(await tx.readOrder(payload.orderId));
      if (!order || order._id !== payload.orderId) fail('NOT_FOUND');
      const authorityAt = clock();
      accessFor(access, principal, context, authorityAt, order.storeId);
      resolveStoreOrderActor(order, payload.command, principal, access.roles);
      const state = copy(await tx.readMerchantOrderState(order)), at = clock();
      if (at < authorityAt) fail('INVALID_CONFIGURATION');
      validateOrderTime(order, at); accessFor(access, principal, context, at, order.storeId);
      stateFor(order, state); const projected = projection(order, state, user, principal, access.roles, at);
      const funds = await fundsFor(tx, order, state, at);
      const request = { environment: context.environment, actorScope: JSON.stringify([context.appId, principal.subjectId]),
        command: 'admin.order.transition', key: payload.idempotencyKey, requestFingerprint: requestFingerprint(payload) };
      const receiptId = idempotencyId(request), receipt = await tx.readReceipt(receiptId), decision = decideIdempotency(receipt, request);
      if (decision.disposition === 'BUSY') fail('BUSY');
      const logId = scopedDocumentId('order-log', [receiptId, order._id]);
      if (decision.disposition === 'REPLAY') {
        const refundIntentId = replay(order, state, receipt, decision, payload, principal, payload.command, logId);
        await fence(tx, principal, user, access, order, state, receiptId, logId);
        return resultFor('REPLAY', decision.result, refundIntentId);
      }
      // The explicit cancellation-review executor belongs to A06. Do not leave a
      // customer's pending request orphaned by silently treating it as reviewed.
      if (payload.command === 'REJECT_ORDER' && projected.cancellationSummary?.status === 'PENDING') fail('CANCELLATION_REVIEW_REQUIRED');
      const plan = planControlledOrderCommand('admin', event, { ...order, id: order._id }, principal, access.roles,
        { now: at, requestId, redactReason });
      const supported = ['APPLY_ORDER_PATCH','CONSUME_STOCK_RESERVATIONS','RECORD_MERCHANT_REJECTION',
        'RESOLVE_CANCELLED_RESERVATIONS','ENSURE_FULL_REFUND','APPEND_ORDER_LOG','SAVE_IDEMPOTENCY_RESULT'];
      if (plan.requiredAtomicEffects.some(effect => !supported.includes(effect))) fail('UNSUPPORTED_ORDER_EFFECT');
      let resourceChanges = [], reservationChanges = [];
      if (order.orderStatus === 'MAKING') {
        validateFulfillmentResources(order, state, { ...context, now: at });
        for (const reservation of state.reservations.filter(value => value.resourceKind === 'STOCK')) {
          const consumed = state.logs.find(log => log._id === reservation.resolutionLogId);
          if (!consumed || consumed.command !== 'START_MAKING' || consumed.createdAt !== reservation.resolvedAt) fail('INVALID_FULFILLMENT_RESOURCES');
        }
      } else {
        const resolution = planCancelledResources(order, state.quote.resourceVersions, state.reservations, state.resources,
          { ...context, now: at, logId });
        if (payload.command === 'REJECT_ORDER') ({ resourceChanges, reservationChanges } = resolution);
        if (payload.command === 'START_MAKING') {
          for (const reservation of state.reservations.filter(value => value.resourceKind === 'STOCK')) {
            const resource = state.resources.find(entry => entry.resourceKind === 'STOCK' && entry.resource._id === reservation.resourceId).resource;
            const change = { resourceKind: 'STOCK', resourceId: resource._id, expectedVersion: resource.version, expectedStatus: resource.status,
              nextVersion: resource.version + 1, heldUnits: resource.heldUnits,
              confirmedUnits: resource.confirmedUnits - reservation.quantity, consumedUnits: resource.consumedUnits + reservation.quantity };
            if (!counter(change.nextVersion) || !counter(reservation.version + 1)) fail('VERSION_CONFLICT');
            validateResource('STOCK', { ...resource, version: change.nextVersion, ...change });
            resourceChanges.push(change);
            reservationChanges.push({ reservationId: reservation._id, expectedVersion: reservation.version, expectedStatus: 'CONFIRMED',
              patch: { status: 'CONSUMED', version: reservation.version + 1, updatedAt: at, resolvedAt: at, resolutionLogId: logId } });
          }
        }
      }
      const next = { ...order, ...plan.patch }, common = { schemaVersion: 1, version: 0, createdAt: at, updatedAt: at };
      let refund = null, number = null;
      if (payload.command === 'REJECT_ORDER' && plan.effectInput.refundCents > 0) {
        next.refundStatus = 'PENDING'; next.refundReservedCents = plan.effectInput.refundCents;
        const refundId = scopedDocumentId('merchant-rejection-refund', [context.environment, context.appId, order._id]);
        const outRefundNo = newRefundNumber(refundId);
        if (typeof outRefundNo !== 'string' || !/^[A-Za-z0-9_|*-]{6,32}$/.test(outRefundNo)) fail('INVALID_REFUND_NUMBER');
        number = { provider: funds.payment.provider, merchantId: funds.payment.merchantId, outRefundNo };
        if (await tx.readRefundByNumber(number) !== null) fail('REFUND_NUMBER_CONFLICT');
        refund = { ...common, _id: refundId, orderId: order._id, paymentId: funds.payment._id, cancellationRequestId: null,
          approvalLogId: logId, approvedBy: plan.logDraft.actor, reason: plan.effectInput.reason, currency: order.currency,
          amountCents: plan.effectInput.refundCents, outRefundNo, providerRefundId: null, status: 'PENDING', budgetState: 'RESERVED',
          settledAt: null, settledAtPrecisionMs: null, lastEventId: null, lastErrorCode: null };
      }
      validateOrderTime(next, at);
      const { requiresFinalAfter, ...draft } = plan.logDraft;
      const log = { ...common, ...draft, after: axes(next) };
      if (refund) {
        const configuration = funds.configuration || await loadPaymentConfiguration(tx, bindingOf(funds.payment), at);
        validateLedger({ order: next, payment: funds.payment, payments: state.payments, refunds: [...state.refunds, refund], refund,
          attempts: [], logs: [...state.logs, log] }, { ...context, provider: funds.payment.provider, now: at, configuration });
      }
      await fence(tx, principal, user, access, order, state, receiptId, logId, number);
      for (const change of resourceChanges) await write(tx.updateResource(change, at));
      for (const change of reservationChanges) await write(tx.updateReservation(change));
      if (refund) await write(tx.insertRefund(refund, number));
      await write(tx.saveOrder(next, order.version)); await write(tx.insertLog(log));
      const result = { entityId: order._id, version: next.version, errorCode: null };
      await write(tx.insertReceipt({ ...request, ...common, _id: receiptId, status: 'SUCCEEDED', result, leaseUntil: null, retentionUntil: null }));
      if (clock() < at) fail('INVALID_CONFIGURATION');
      return resultFor(payload.command === 'REJECT_ORDER' ?
        (refund ? 'CANCELLED_REFUND_RESERVED' : 'CANCELLED_REFUND_ALREADY_SETTLED') : next.orderStatus, result, refund?._id || null);
    });
  } });
}
module.exports = { createMerchantOrderReadService, createMerchantOrderService };
