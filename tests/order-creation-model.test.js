'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { planOrderCreation } = require('../cloudfunctions/_shared/order-creation-model');
const { planQuoteCreation } = require('../cloudfunctions/_shared/quote-model');
const { planControlledOrderCommand } = require('../cloudfunctions/_shared/order-command-model');
const { assertOrderAmounts } = require('../cloudfunctions/_shared/order-facts');
const { planCartCommand } = require('../cloudfunctions/_shared/cart-model');
const { catalog, cartContext } = require('./fixtures/catalog');
const { setup: quoteSetup, actor, clone } = require('./fixtures/quote');
const code = (fn, expected) => assert.throws(fn, error => error.code === expected);
function setup(mode = 'PICKUP') {
  const s = quoteSetup(mode);
  s.state.configuration.paymentHoldMinutes = 15; // OFFLINE_TEST_ONLY, not merchant policy.
  s.state.quote = clone(planQuoteCreation(s.state, s.event, s.principal, s.context).proposedQuote);
  s.state.orderReceipt = null;
  s.event = { action: 'create', payload: { quoteId: s.state.quote._id,
    expectedQuoteVersion: s.state.quote.version, idempotencyKey: 'offline-create-key-0001' } };
  return s;
}
const plan = s => planOrderCreation(s.state, s.event, s.principal, s.context);

test('O02 pickup/delivery propose valid unpaid orders with separated immutable lines and all historical facts', () => {
  for (const mode of ['PICKUP','DELIVERY']) {
    const s = setup(mode), before = JSON.stringify(s.state), result = plan(s), head = result.proposedOrder;
    assert.equal(head.orderStatus, 'PENDING_PAYMENT'); assert.equal(head.paymentStatus, 'UNPAID');
    assert.equal(head.refundStatus, 'NONE'); assert.equal(head.paidCents, 0);
    assert.equal(head.totalCents, 2000); assert.equal(head.deliveryFeeCents, 0);
    assert.equal(head.items, undefined); assert.equal(head.id, undefined);
    assert.equal(head.addressSnapshot === null, mode === 'PICKUP');
    assert.equal(head.appointmentSnapshot.slotId, s.state.slot._id);
    assert.equal(head.storeSnapshot.name, s.state.store.name);
    assert.equal(head.orderNote, '测试备注'); assert.equal(head.pickupCredential, null);
    const item = result.proposedItems[0];
    assert.equal(item.orderId, head._id); assert.equal(item.position, 0);
    assert.equal(item.unitPriceCents, 1000); assert.equal(item.quantity, 2);
    assert.equal(item.cakeMessage, '测试留言'); assert.equal(item.lineTotalCents, 2000);
    assert.equal(item.productImage.sourceKind, 'REAL_PHOTO');
    assert.equal(item.productImage.privateMetadata, undefined);
    assertOrderAmounts({ ...head, id: head._id }, result.proposedItems);
    assert.equal(result.quoteConsumption.patch.consumedOrderId, head._id);
    assert.equal(result.quoteConsumption.patch.status, 'CONSUMED');
    assert.equal(result.quoteConsumption.patch.version, s.state.quote.version + 1);
    assert.equal(JSON.stringify(s.state), before);
    assert.equal(result.callable, false); assert.equal(result.stockReserved, false);
    assert.equal(result.capacityReserved, false); assert.equal(result.paymentAllowed, false);
    assert(result.requiredAtomicEffects.includes('RESERVE_ALL_STOCK_AND_SLOT'));
  }
});

test('O02 snapshot stays fixed after current product, photo, prices, store and address edits', () => {
  const s = setup('DELIVERY'), result = plan(s), before = JSON.stringify(result);
  s.cat.product.name = 'modified'; s.cat.product.images[0].revision = 'modified';
  s.cat.skus[0].unitPriceCents = 1; s.state.store.name = 'modified';
  s.state.address.detail = 'modified'; s.state.configuration.deliveryRules[0].feePolicy.baseFeeCents = 1;
  s.state.quote.facts.items[0].productName = 'modified'; s.state.cart.lines[0].cakeMessage = 'modified';
  assert.equal(JSON.stringify(result), before);
  assert(Object.isFrozen(result.proposedOrder.addressSnapshot.location));
  assert(Object.isFrozen(result.proposedItems[0].productImage));
  assert.throws(() => { result.proposedItems[0].unitPriceCents = 1; }, TypeError);
  assert.throws(() => { result.conditions.resourceVersions[0].version++; }, TypeError);
});

test('O02 multi-line snapshots preserve selection order, shared demand, messages and exclude unselected lines', () => {
  const s = quoteSetup(), mini = catalog('MINI_CAKE'), bread = catalog('BREAD');
  s.state.configuration.paymentHoldMinutes = 15;
  for (const cat of [mini, bread]) {
    cat.product.images = clone(s.cat.product.images);
    cat.skus[0].stockRequirements = [{ resourceId: s.state.stocks[0]._id, unitsPerItem: 1 }];
    s.state.cart = clone(planCartCommand(s.state.cart, 'ADD', s.principal, {
      expectedVersion: s.state.cart.version, skuId: cat.skus[0]._id,
      selectedOptions: cat.selectedOptions, quantity: 1, cakeMessage: null
    }, { ...cartContext(cat), now: 3000, newLineId: 'line-' + cat.product.categoryCode }).nextCart);
    s.state.catalogs.push(cat);
  }
  s.event.payload.expectedCartVersion = s.state.cart.version;
  s.event.payload.lines.unshift({ lineId: 'line-MINI_CAKE', lineVersion: 0 });
  s.state.quote = clone(planQuoteCreation(s.state, s.event, s.principal, s.context).proposedQuote);
  s.state.orderReceipt = null;
  s.event = { action: 'create', payload: { quoteId: s.state.quote._id,
    expectedQuoteVersion: 0, idempotencyKey: 'offline-create-key-0001' } };
  const result = plan(s);
  assert.deepEqual(result.proposedItems.map(item => [item.position,item.categoryCode,item.cakeMessage]),
    [[0,'MINI_CAKE',null],[1,'CAKE','测试留言']]);
  assert.equal(result.proposedOrder.totalCents, 3000);
  assert.equal(result.conditions.resourceVersions[0].requiredUnits, 3);
  assert.equal(new Set(result.proposedItems.map(item => item._id)).size, 2);
  assert.equal(result.proposedItems.some(item => item.categoryCode === 'BREAD'), false);
  assert.equal(s.state.cart.lines.length, 3); // No bag deletion in O02.
});

test('O02 exact server-owned create request rejects prices, roles, slot/address and fake principal', () => {
  const s = setup();
  for (const extra of [{ totalCents: 1 }, { orderStatus: 'PAID' }, { ownerId: 'victim' },
    { role: 'SYSTEM' }, { slotId: 'fake' }, { addressId: 'fake' }, { orderNo: 'fake' }, { now: 0 }]) {
    code(() => planOrderCreation(s.state, { ...s.event, payload: { ...s.event.payload, ...extra } },
      s.principal, s.context), 'INVALID_REQUEST');
  }
  code(() => planOrderCreation(s.state, s.event, { ...s.principal }, s.context), 'AUTH_REQUIRED');
  code(() => planOrderCreation(s.state, s.event, actor('B'), s.context), 'FORBIDDEN');
  s.state.cart.ownerId = actor('B').subjectId; code(() => plan(s), 'FORBIDDEN');
});

test('O02 expired, consumed, foreign ID, stale version and malformed quote never creates an order', () => {
  for (const [mutate, expected] of [
    [s => s.context.now = s.state.quote.expiresAt, 'QUOTE_EXPIRED'],
    [s => s.state.quote.status = 'CONSUMED', 'QUOTE_CHANGED'],
    [s => s.state.quote.consumedOrderId = 'other-order', 'QUOTE_CHANGED'],
    [s => s.event.payload.expectedQuoteVersion++, 'QUOTE_CHANGED'],
    [s => s.state.quote._id = 'other', 'NOT_FOUND'],
    [s => s.state.quote.facts.totalCents = 1, 'QUOTE_CHANGED'],
    [s => s.state.quote.updatedAt = s.context.now + 1, 'QUOTE_CHANGED'],
    [s => s.state.store._id = 'other', 'QUOTE_CHANGED']
  ]) {
    const s = setup(); mutate(s); code(() => plan(s), expected);
  }
});

test('O02 reprices against current catalog and maps changed bag/SKU/store/config/address to confirmation conflict', () => {
  for (const mutate of [s => s.cat.skus[0].unitPriceCents++, s => s.cat.skus[0].status = 'OFF_SALE',
    s => s.cat.product.version++, s => s.state.store.phone = 'changed',
    s => s.state.configuration.configVersion++, s => s.state.cart.version++,
    s => s.state.cart.lines[0].lineVersion++, s => s.state.cart.lines = []]) {
    const s = setup(); mutate(s); code(() => plan(s), 'QUOTE_CHANGED');
  }
  const s = setup('DELIVERY'); s.state.address.version++; s.approved[1].entityVersion++;
  code(() => plan(s), 'QUOTE_CHANGED');
});

test('O02 requires real configured hold duration; deadline uses appointment lead boundary, not quote TTL', () => {
  for (const value of [undefined,null,0,-1,1.5,Number.MAX_SAFE_INTEGER]) {
    const s = setup(); s.state.configuration.paymentHoldMinutes = value;
    code(() => plan(s), 'CONFIGURATION_REQUIRED');
  }
  const s = setup(), head = plan(s).proposedOrder;
  assert.equal(head.paymentDeadlineAt, s.context.now + 15 * 60000);
  assert(head.paymentDeadlineAt > s.state.quote.expiresAt); // Quote consumed at create; separate payment expiry.
  s.state.configuration.paymentHoldMinutes = 100000;
  assert.equal(plan(s).proposedOrder.paymentDeadlineAt,
    s.state.slot.startAt - s.state.quote.facts.appointmentSnapshot.minLeadTimeMinutes * 60000);
});

test('O02 deterministic full order IDs/numbers isolate actors and keys; uniqueness still requires atomic index', () => {
  const s = setup(), a = plan(s), b = plan(s);
  assert.equal(a.proposedOrder._id, b.proposedOrder._id);
  assert.equal(a.proposedOrder.orderNo, b.proposedOrder.orderNo);
  assert.match(a.proposedOrder.orderNo, /^V1-[A-F0-9]{64}$/);
  s.event.payload.idempotencyKey = 'offline-create-key-0002';
  assert.notEqual(plan(s).proposedOrder.orderNo, a.proposedOrder.orderNo);
  const t = setup(); t.principal = actor('B'); t.state.cart.ownerId = t.principal.subjectId;
  t.state.quote.ownerId = t.principal.subjectId;
  assert.notEqual(plan(t).proposedOrder.orderNo, a.proposedOrder.orderNo);
  assert.equal(a.conditions.orderIdMustBeAbsent, true);
  assert.equal(a.conditions.requiresUniqueOrderNoIndex, true);
});

test('O02 receipt decisions are scoped; replay needs owned order read and does not re-create expired quote', () => {
  const s = setup(), a = plan(s);
  s.state.orderReceipt = { ...a.idempotency, status: 'SUCCEEDED', result: {
    entityId: a.proposedOrder._id, version: 0, errorCode: null } };
  s.context.now = s.state.quote.expiresAt;
  const replay = plan(s); assert.equal(replay.disposition, 'REPLAY');
  assert.equal(replay.proposedOrder, undefined); assert.equal(replay.requiresOwnedOrderRead, true);
  assert.equal(replay.callable, false);
  s.event.payload.expectedQuoteVersion++; code(() => plan(s), 'IDEMPOTENCY_KEY_REUSED');
  s.event.payload.expectedQuoteVersion--;
  s.state.orderReceipt = { ...s.state.orderReceipt, status: 'IN_PROGRESS', result: null };
  assert.equal(plan(s).disposition, 'BUSY');
  delete s.state.orderReceipt; code(() => plan(s), 'INVALID_CREATION_STATE');
});

test('O02 unavailable resources and unverified range produce no partial order, resource hold or fake success', () => {
  for (const [mode, mutate, expected] of [
    ['PICKUP', s => s.state.stocks[0].heldUnits = 8, 'RESOURCE_UNAVAILABLE'],
    ['PICKUP', s => s.state.slot.heldUnits = 3, 'SLOT_FULL_OR_CLOSED'],
    ['DELIVERY', s => s.context.verifyLocation = () => false, 'LOCATION_REQUIRED']
  ]) {
    const s = setup(mode); mutate(s); const before = JSON.stringify(s.state), applied = [];
    code(() => { applied.push(plan(s)); }, expected);
    assert.deepEqual(applied, []); assert.equal(JSON.stringify(s.state), before);
  }
  const s = setup(), result = plan(s);
  const cancel = planControlledOrderCommand('order', { action: 'cancelUnpaid', payload: {
    orderId: result.proposedOrder._id, expectedVersion: 0, idempotencyKey: 'offline-cancel-key-001', reason: 'test'
  } }, { ...result.proposedOrder, id: result.proposedOrder._id }, s.principal, [],
  { now: s.context.now, requestId: 'offline-test-trace', redactReason: () => '测试原因' });
  assert.equal(cancel.patch.orderStatus, 'CANCELLED');
  assert.equal(result.proposedOrder.orderStatus, 'PENDING_PAYMENT');
});
