'use strict';
// Internal application service with an injected ATOMIC transaction session.
// No cloud SDK adapter/handler is installed. The only current executor is test-only.
const { prepareOrderCreationRequest, planOrderCreation } = require('./order-creation-model');
const { requireOwner } = require('./authorization-model');
const { planResourceHolds } = require('./resource-model');
const { idempotencyId, decideIdempotency, scopedDocumentId } = require('./idempotency-model');

class OrderTransactionError extends Error {
  constructor(code) { super(code); this.name = 'OrderTransactionError'; this.code = code; }
}
function fail(code) { throw new OrderTransactionError(code); }
function text(value) { return typeof value === 'string' && value.length > 0 && value === value.trim() && value.length <= 256 && value.isWellFormed(); }
function timestamp(value) { return Number.isSafeInteger(value) && value > 0 && Number.isFinite(new Date(value).getTime()); }
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const TX_METHODS = ['readUser','readReceipt','readCreationState','readOrder','readOrderByNumber',
  'assertCreationReads','updateResource','insertReservation','insertOrder','insertItem',
  'insertLog','consumeQuote','insertReceipt'];
async function write(effect) {
  if (await effect !== 1) fail('VERSION_CONFLICT'); // No silently successful zero-row mutation.
}
function axes(order) {
  return Object.fromEntries(['orderStatus','paymentStatus','refundStatus','paidCents',
    'refundedCents','refundReservedCents','version'].map(key => [key,order[key]]));
}
function outcome(disposition, result) {
  return freeze({ scope: 'OFFLINE_ORDER_TRANSACTION_RESULT', disposition, result,
    cloudVerified: false, checkoutAllowed: false, paymentAllowed: false });
}
function requireCurrentOrderUser(user, principal) {
  if (!user) fail('USER_NOT_PROVISIONED');
  requireOwner(principal, { ownerId: user._id });
  if (user.appId !== principal.appId || user.environment !== principal.environment || user.schemaVersion !== 1) fail('INVALID_USER_RECORD');
  if (user.status !== 'ACTIVE') fail('USER_DISABLED');
  if (user.version !== principal.userVersion) fail('VERSION_CONFLICT');
}

function createOrderTransactionService({ runTransaction, now, buildContext, newRequestId }) {
  if (![runTransaction,now,buildContext,newRequestId].every(value => typeof value === 'function')) fail('INVALID_CONFIGURATION');
  return Object.freeze({
    async execute(event, principal) {
      const { payload, request } = prepareOrderCreationRequest(event, principal);
      const receiptId = idempotencyId(request), requestId = newRequestId();
      if (!text(requestId)) fail('INVALID_CONFIGURATION');
      // runTransaction must resolve only AFTER commit, roll back all rejected work,
      // and protect every read dependency against concurrent updates/revocation.
      return runTransaction(async tx => {
        if (!tx || TX_METHODS.some(name => typeof tx[name] !== 'function')) fail('INVALID_TRANSACTION_ADAPTER');
        const user = await tx.readUser(principal.subjectId);
        requireCurrentOrderUser(user, principal);
        const receipt = await tx.readReceipt(receiptId);
        const decision = decideIdempotency(receipt, request);
        if (decision.disposition === 'BUSY') fail('BUSY');
        if (decision.disposition === 'REPLAY') {
          if (decision.result.errorCode !== null) fail(decision.result.errorCode);
          const existing = await tx.readOrder(decision.result.entityId);
          if (!existing) fail('NOT_FOUND');
          requireOwner(principal, existing);
          const expectedId = scopedDocumentId('order', [principal.environment,principal.subjectId,'ORDER_CREATE',payload.idempotencyKey]);
          if (existing._id !== expectedId || existing.quoteId !== payload.quoteId) fail('INVALID_IDEMPOTENCY_RECORD');
          return outcome('REPLAY', decision.result);
        }
        const state = await tx.readCreationState(payload.quoteId, principal);
        if (!state || typeof state !== 'object' || Array.isArray(state)) fail('INVALID_CREATION_STATE');
        const timestampNow = now();
        const context = { ...await buildContext(tx, state, principal), now: timestampNow };
        const plan = planOrderCreation({ ...state, orderReceipt: receipt }, event, principal, context);
        const order = plan.proposedOrder;
        const requests = plan.conditions.resourceVersions.map(resource => ({
          resourceKind: resource.resourceKind, resourceId: resource.resourceId,
          expectedVersion: resource.version, quantity: resource.requiredUnits
        }));
        const resources = requests.map(resource => ({ resourceKind: resource.resourceKind,
          resource: resource.resourceKind === 'SLOT' ? state.slot :
            state.stocks.find(value => value._id === resource.resourceId) }));
        const holds = planResourceHolds(order, requests, resources,
          { environment: principal.environment, now: timestampNow });
        if (await tx.readOrder(order._id) !== null || await tx.readOrderByNumber(order.orderNo) !== null) fail('VERSION_CONFLICT');
        // This is an adapter obligation, not proof of SDK serializability. It must
        // fence user/catalog/config/cart/address/quote/resource reads until commit.
        if (await tx.assertCreationReads({ ...plan.conditions, userId: principal.subjectId }) !== true) fail('VERSION_CONFLICT');
        for (const change of holds.resourceChanges) await write(tx.updateResource(change, timestampNow));
        for (const reservation of holds.reservations) await write(tx.insertReservation(reservation));
        await write(tx.insertOrder(order)); // Must enforce BOTH _id and unique orderNo.
        for (const item of plan.proposedItems) await write(tx.insertItem(item));
        const log = freeze({
          _id: scopedDocumentId('order-log', [principal.environment,order._id,'0','ORDER_CREATED']),
          schemaVersion: 1, version: 0, createdAt: timestampNow, updatedAt: timestampNow,
          orderId: order._id, command: 'ORDER_CREATED',
          actor: { type: 'CUSTOMER', subjectId: principal.subjectId, service: null },
          before: null, after: axes(order), requestId, eventId: null, reason: '', publicMessage: '订单已创建，待付款'
        });
        await write(tx.insertLog(log));
        await write(tx.consumeQuote(plan.quoteConsumption, { now: timestampNow,
          ownerId: principal.subjectId, storeId: order.storeId }));
        const result = freeze({ entityId: order._id, version: order.version, errorCode: null });
        await write(tx.insertReceipt(freeze({ ...plan.idempotency,
          schemaVersion: 1, version: 0, createdAt: timestampNow, updatedAt: timestampNow,
          status: 'SUCCEEDED', result, leaseUntil: null, retentionUntil: null })));
        const beforeCommit = now();
        if (!timestamp(beforeCommit) || beforeCommit < timestampNow) fail('INVALID_CONFIGURATION');
        if (beforeCommit >= plan.conditions.quoteExpiresAt) fail('QUOTE_EXPIRED');
        if (beforeCommit >= order.paymentDeadlineAt) fail('APPOINTMENT_UNAVAILABLE');
        return outcome('CREATED', result);
      });
    }
  });
}
module.exports = { OrderTransactionError, requireCurrentOrderUser, createOrderTransactionService };
