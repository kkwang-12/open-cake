'use strict';
// Internal offline proposal only. No database writes, resource holds, cloud
// handler, payment session or client success result is implemented here.
const { parseApiRequest } = require('./api-contract');
const { requireOwner } = require('./authorization-model');
const { revalidateQuote } = require('./quote-model');
const { captureOrderFacts, assertOrderAmounts } = require('./order-facts');
const { paymentDeadlineAt } = require('./fulfillment-model');
const { captureCartRemovalSnapshot } = require('./order-cart-sync-model');
const { scopedDocumentId, requestFingerprint, decideIdempotency } = require('./idempotency-model');

class OrderCreationError extends Error {
  constructor(code) { super(code); this.name = 'OrderCreationError'; this.code = code; }
}
function fail(code) { throw new OrderCreationError(code); }
function plain(value) {
  return value !== null && typeof value === 'object' &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value));
}
function timestamp(value) {
  return Number.isSafeInteger(value) && value > 0 && Number.isFinite(new Date(value).getTime());
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const CHANGED_INPUT = new Set(['VERSION_CONFLICT','LINE_NOT_FOUND','PRODUCT_UNAVAILABLE',
  'SKU_UNAVAILABLE','SKU_SELECTION_MISMATCH','INVALID_SELECTION','INVALID_QUANTITY',
  'INVALID_MESSAGE','MESSAGE_NOT_SUPPORTED']);
const copy = value => JSON.parse(JSON.stringify(value));

function prepareOrderCreationRequest(event, principal) {
  requireOwner(principal, { ownerId: principal && principal.subjectId });
  const { contract, payload } = parseApiRequest('order', event);
  if (contract.action !== 'create') fail('INVALID_REQUEST');
  const request = { environment: principal.environment,
    actorScope: JSON.stringify([principal.appId, principal.subjectId]), command: 'order.create',
    key: payload.idempotencyKey,
    requestFingerprint: requestFingerprint({ quoteId: payload.quoteId, expectedQuoteVersion: payload.expectedQuoteVersion }) };
  return freeze({ payload, request });
}
function planOrderCreation(state, event, principal, context) {
  const { payload, request } = prepareOrderCreationRequest(event, principal);
  if (!plain(state) || !Object.hasOwn(state, 'orderReceipt')) fail('INVALID_CREATION_STATE');
  const decision = decideIdempotency(state.orderReceipt, request);
  if (decision.disposition !== 'CREATE') {
    // A terminal receipt can be considered without re-pricing an expired quote.
    // The adapter must still load/authorize any returned entity before exposure.
    return freeze({ scope: 'OFFLINE_ORDER_CREATION_PLAN', disposition: decision.disposition,
      decision, requiresOwnedOrderRead: decision.disposition === 'REPLAY', callable: false,
      checkoutAllowed: false, paymentAllowed: false });
  }
  const quote = state.quote;
  if (!plain(quote) || quote._id !== payload.quoteId) fail('NOT_FOUND');
  requireOwner(principal, quote);
  if (quote.version !== payload.expectedQuoteVersion || !Number.isSafeInteger(quote.version + 1)) fail('QUOTE_CHANGED');
  if (!plain(context) || !timestamp(context.now)) fail('CONFIGURATION_REQUIRED');
  if (!timestamp(quote.updatedAt) || quote.updatedAt < quote.createdAt || quote.updatedAt > context.now) fail('QUOTE_CHANGED');
  if (!state.store || state.store._id !== quote.storeId) fail('QUOTE_CHANGED');
  try {
    revalidateQuote(quote, state, principal, context);
  } catch (error) {
    if (CHANGED_INPUT.has(error.code)) fail('QUOTE_CHANGED');
    throw error; // Preserve ownership, expiry, configuration and unavailable-resource errors.
  }
  const facts = captureOrderFacts(quote.facts);
  // Deterministic full digest, never truncated or used as authorization/credential.
  // The executor must enforce create-if-absent and an actual unique orderNo index.
  const orderId = scopedDocumentId('order', [principal.environment, principal.subjectId, 'ORDER_CREATE', payload.idempotencyKey]);
  const orderNo = 'V1-' + orderId.toUpperCase();
  const { schemaVersion, items, ...headFacts } = facts;
  const proposedOrder = {
    _id: orderId, schemaVersion, version: 0, createdAt: context.now, updatedAt: context.now,
    ownerId: principal.subjectId, storeId: quote.storeId, orderNo, ...headFacts,
    cartRemovalSnapshot: captureCartRemovalSnapshot(state.cart, facts.cartSelectionSnapshot),
    orderStatus: 'PENDING_PAYMENT', paymentStatus: 'UNPAID', refundStatus: 'NONE',
    paidCents: 0, refundedCents: 0, refundReservedCents: 0,
    paymentDeadlineAt: paymentDeadlineAt(context.now, state.configuration.paymentHoldMinutes, facts.appointmentSnapshot),
    paidAt: null, cancelledAt: null, completedAt: null, cancellationReason: null, pickupCredential: null
  };
  const proposedItems = items.map((item, position) => ({
    _id: scopedDocumentId('order-item', [principal.environment, orderId, item.lineId]),
    schemaVersion: 1, version: 0, createdAt: context.now, updatedAt: context.now,
    orderId, position, ...copy(item)
  }));
  assertOrderAmounts({ ...proposedOrder, id: proposedOrder._id }, proposedItems);
  return freeze({ scope: 'OFFLINE_ORDER_CREATION_PLAN', disposition: 'CREATE', callable: false,
    checkoutAllowed: false, paymentAllowed: false, requiresAtomicPersistence: true,
    capacityReserved: false, stockReserved: false, proposedOrder, proposedItems,
    quoteConsumption: { quoteId: quote._id, expectedVersion: quote.version,
      patch: { status: 'CONSUMED', consumedOrderId: orderId, version: quote.version + 1, updatedAt: context.now } },
    conditions: { quoteStatus: 'ACTIVE', consumedOrderId: null, quoteExpiresAt: quote.expiresAt,
      userVersion: principal.userVersion, storeVersion: state.store.version,
      configurationId: state.configuration._id, configVersion: state.configuration.configVersion,
      addressVersion: quote.addressVersion, cartSelectionSnapshot: copy(facts.cartSelectionSnapshot),
      resourceVersions: copy(quote.resourceVersions), orderIdMustBeAbsent: true,
      orderNoMustBeAbsent: true, requiresUniqueOrderNoIndex: true },
    idempotency: { ...request, _id: decision._id },
    requiredAtomicEffects: ['REVALIDATE_CURRENT_QUOTE', 'RESERVE_ALL_STOCK_AND_SLOT',
      'INSERT_ORDER_CREATE_IF_ABSENT', 'INSERT_ORDER_ITEMS', 'APPEND_CREATION_LOG',
      'CONSUME_QUOTE_IF_ACTIVE', 'SAVE_IDEMPOTENCY_RESULT'],
    bagSynchronization: 'REQUIRES_O04_VERSION_MATCHED_REMOVAL'
  });
}
module.exports = { OrderCreationError, prepareOrderCreationRequest, planOrderCreation };
