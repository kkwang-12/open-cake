'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { setup } = require('./fixtures/order-transaction');
const { createOrderTransactionService } = require('../cloudfunctions/_shared/order-transaction-service');
const { planOrderCreation } = require('../cloudfunctions/_shared/order-creation-model');
const rejects = (fn, code) => assert.rejects(fn, error => error.code === code);
const execute = (s, q) => s.service.execute(q.event, q.customer);

test('O03 transaction commits head/lines/log/quote/receipt and all HELD records for both modes', async () => {
  for (const mode of ['PICKUP','DELIVERY']) {
    const s = setup(), q = s.makeQuote({ mode, quantity: 2 }), cartBefore = JSON.stringify(s.db.carts);
    const result = await execute(s,q), head = s.db.orders[result.result.entityId];
    assert.equal(result.scope, 'OFFLINE_ORDER_TRANSACTION_RESULT'); assert.equal(result.cloudVerified, false);
    assert.equal(result.checkoutAllowed, false); assert.equal(result.paymentAllowed, false);
    assert.equal(result.disposition, 'CREATED'); assert.equal(head.orderStatus, 'PENDING_PAYMENT');
    assert.equal(head.paymentStatus, 'UNPAID'); assert.equal(head.totalCents, 2000);
    assert.equal(Object.values(s.db.items).length, 1); assert.equal(Object.values(s.db.logs).length, 1);
    assert.equal(Object.values(s.db.receipts).length, 1); assert.equal(Object.values(s.db.reservations).length, 2);
    assert.equal(s.db.quotes[q.quoteId].status, 'CONSUMED');
    assert.equal(s.db.quotes[q.quoteId].consumedOrderId, head._id);
    const stock = s.db.stocks[s.stockId], slot = s.db.slots[head.appointmentSnapshot.slotId];
    assert.equal(stock.heldUnits, 2); assert.equal(stock.confirmedUnits, 0); assert.equal(stock.version, 1);
    assert.equal(slot.heldUnits, 1); assert.equal(slot.capacityTotal, mode === 'PICKUP' ? 3 : 1);
    for (const reservation of Object.values(s.db.reservations)) {
      assert.equal(reservation.status, 'HELD'); assert.equal(reservation.expiresAt, head.paymentDeadlineAt);
      assert.equal(reservation.resolvedAt, null);
    }
    const log = Object.values(s.db.logs)[0];
    assert.equal(log.before, null); assert.equal(log.after.orderStatus, 'PENDING_PAYMENT');
    assert.equal(log.after.paidCents, 0); assert.match(log.requestId, /^offline-server-trace-/);
    assert.equal(log.actor.subjectId, q.customer.subjectId); assert.equal(log.actor.service, null);
    assert.equal(JSON.stringify(s.db.carts), cartBefore); // O04 bag synchronization is separate.
    assert.equal(s.controls.lastWrites, 9);
  }
});

test('O03 concurrent final shared stock creates exactly one local order and one stock reservation', async () => {
  const s = setup(); s.db.stocks[s.stockId].totalUnits = 1;
  const a = s.makeQuote(), b = s.makeQuote({ customer: s.actor('B') });
  const results = await Promise.allSettled([execute(s,a),execute(s,b)]);
  assert.equal(results.filter(value => value.status === 'fulfilled').length, 1);
  assert.equal(results.find(value => value.status === 'rejected').reason.code, 'RESOURCE_UNAVAILABLE');
  assert.equal(Object.keys(s.db.orders).length, 1); assert.equal(s.db.stocks[s.stockId].heldUnits, 1);
  assert.equal(Object.values(s.db.reservations).filter(value => value.resourceKind === 'STOCK').length, 1);
  assert.equal(s.db.quotes[b.quoteId].status, 'ACTIVE');
});

test('O03 final pickup/delivery slot competition respects separate 3/1 capacity', async () => {
  for (const mode of ['PICKUP','DELIVERY']) {
    const s = setup(), slot = Object.values(s.db.slots).find(value => value.fulfillment === mode);
    slot.confirmedUnits = slot.capacityTotal - 1;
    const a = s.makeQuote({ mode }), b = s.makeQuote({ mode, customer: s.actor('B') });
    const results = await Promise.allSettled([execute(s,a),execute(s,b)]);
    assert.equal(results.filter(value => value.status === 'fulfilled').length, 1);
    assert.equal(results.find(value => value.status === 'rejected').reason.code, 'SLOT_FULL_OR_CLOSED');
    assert.equal(s.db.slots[slot._id].heldUnits, 1);
    assert.equal(s.db.slots[slot._id].heldUnits + s.db.slots[slot._id].confirmedUnits, slot.capacityTotal);
    assert.equal(Object.keys(s.db.orders).length, 1);
    const other = Object.values(s.db.slots).find(value => value.fulfillment !== mode);
    assert.equal(other.heldUnits, 0); assert.equal(other.version, 0);
  }
});

test('O03 full pickup slot does not block a delivery order using independent slot inventory', async () => {
  const s = setup(), pickup = Object.values(s.db.slots).find(value => value.fulfillment === 'PICKUP');
  pickup.heldUnits = 3; const before = JSON.stringify(pickup);
  const q = s.makeQuote({ mode: 'DELIVERY' }); await execute(s,q);
  assert.equal(JSON.stringify(s.db.slots[pickup._id]), before);
  assert.equal(Object.values(s.db.slots).find(value => value.fulfillment === 'DELIVERY').heldUnits, 1);
});

test('O03 every one of nine staged writes rolls back entirely when a persistence failure is injected', async () => {
  for (let failure = 1; failure <= 9; failure++) {
    const s = setup(), q = s.makeQuote(), before = JSON.stringify(s.db);
    s.controls.failAt = failure;
    await assert.rejects(() => execute(s,q), /OFFLINE injected write failure/);
    assert.equal(JSON.stringify(s.db), before, 'partial state after write ' + failure);
    s.controls.failAt = 0; const retry = await execute(s,q);
    assert.equal(Object.keys(s.db.orders).length, 1); assert.equal(s.db.stocks[s.stockId].heldUnits, 1);
    assert.equal(retry.disposition, 'CREATED');
  }
});

test('O03 zero-row resource/record/quote/receipt writes and missing read fence fail closed with rollback', async () => {
  for (let failure = 1; failure <= 9; failure++) {
    const s = setup(), q = s.makeQuote(), before = JSON.stringify(s.db);
    s.controls.zeroAt = failure; await rejects(() => execute(s,q), 'VERSION_CONFLICT');
    assert.equal(JSON.stringify(s.db), before);
  }
  const s = setup(), q = s.makeQuote(), before = JSON.stringify(s.db);
  s.controls.denyFence = true; await rejects(() => execute(s,q), 'VERSION_CONFLICT');
  assert.equal(JSON.stringify(s.db), before);
});

test('O03 current user disable/version change and revocation during transaction prevent order commit', async () => {
  for (const [patch, code] of [[{ status: 'DISABLED' },'USER_DISABLED'],[{ version: 1 },'VERSION_CONFLICT']]) {
    const s = setup(), q = s.makeQuote(); Object.assign(s.db.users[q.customer.subjectId], patch);
    const before = JSON.stringify(s.db); await rejects(() => execute(s,q), code);
    assert.equal(JSON.stringify(s.db), before);
  }
  const s = setup(), q = s.makeQuote();
  s.controls.beforeCommit = data => { data.users[q.customer.subjectId].status = 'DISABLED'; };
  await rejects(() => execute(s,q), 'VERSION_CONFLICT');
  assert.equal(s.db.users[q.customer.subjectId].status, 'DISABLED');
  assert.equal(Object.keys(s.db.orders).length, 0); assert.equal(s.db.stocks[s.stockId].heldUnits, 0);
  assert.equal(s.db.quotes[q.quoteId].status, 'ACTIVE');
});

test('O03 quote expiry during writes or changed input refuses partial success', async () => {
  const s = setup(), q = s.makeQuote(), before = JSON.stringify(s.db);
  s.controls.nowSequence = [s.controls.now,s.db.quotes[q.quoteId].expiresAt];
  await rejects(() => execute(s,q), 'QUOTE_EXPIRED'); assert.equal(JSON.stringify(s.db), before);
  const cutoff = setup(); cutoff.db.configs[cutoff.configId].paymentHoldMinutes = 1;
  const due = cutoff.makeQuote(), cutoffBefore = JSON.stringify(cutoff.db);
  cutoff.controls.nowSequence = [cutoff.controls.now,cutoff.controls.now + 60000];
  await rejects(() => execute(cutoff,due), 'APPOINTMENT_UNAVAILABLE');
  assert.equal(JSON.stringify(cutoff.db), cutoffBefore);
  for (const [mutate, code] of [
    [data => data.catalogs[0].skus[0].unitPriceCents++, 'QUOTE_CHANGED'],
    [data => data.stocks[Object.keys(data.stocks)[0]].status = 'CLOSED', 'RESOURCE_UNAVAILABLE'],
    [data => data.configs[Object.keys(data.configs)[0]].paymentHoldMinutes = null, 'CONFIGURATION_REQUIRED']
  ]) {
    const t = setup(), quote = t.makeQuote(); mutate(t.db); const baseline = JSON.stringify(t.db);
    await rejects(() => execute(t,quote), code); assert.equal(JSON.stringify(t.db), baseline);
  }
});

test('O03 multiple stock resources either all reserve required units or none commit', async () => {
  const s = setup(), secondId = 'offline-stock-2';
  s.db.stocks[secondId] = { ...s.db.stocks[s.stockId], _id: secondId };
  s.db.catalogs[0].skus[0].stockRequirements = [
    { resourceId: s.stockId, unitsPerItem: 2 }, { resourceId: secondId, unitsPerItem: 3 }
  ];
  const q = s.makeQuote({ quantity: 2 });
  s.db.stocks[secondId].heldUnits = s.db.stocks[secondId].totalUnits;
  const before = JSON.stringify(s.db); await rejects(() => execute(s,q), 'RESOURCE_UNAVAILABLE');
  assert.equal(JSON.stringify(s.db), before); assert.equal(s.db.stocks[s.stockId].heldUnits, 0);
  s.db.stocks[secondId].heldUnits = 0; await execute(s,q);
  assert.equal(s.db.stocks[s.stockId].heldUnits, 4); assert.equal(s.db.stocks[secondId].heldUnits, 6);
  assert.equal(Object.keys(s.db.reservations).length, 3); assert.equal(s.controls.lastWrites, 11);
});

test('O03 concurrent same request commits one local transaction and returns the same order on replay', async () => {
  const s = setup(), q = s.makeQuote();
  const results = await Promise.all([execute(s,q),execute(s,q)]);
  assert.deepEqual(results.map(value => value.disposition), ['CREATED','REPLAY']);
  assert.deepEqual(results[0].result, results[1].result);
  assert.equal(Object.keys(s.db.orders).length, 1); assert.equal(Object.keys(s.db.receipts).length, 1);
  assert.equal(s.db.stocks[s.stockId].heldUnits, 1);
  assert.equal(Object.keys(s.db.logs).length, 1);
});

test('O03 payment cutoff and aggregated stock units agree across head, reservations and resource counters', async () => {
  const s = setup(); s.db.configs[s.configId].paymentHoldMinutes = 100000;
  s.db.catalogs[0].skus[0].stockRequirements[0].unitsPerItem = 2;
  const q = s.makeQuote({ quantity: 2 }), result = await execute(s,q), order = s.db.orders[result.result.entityId];
  assert.equal(order.paymentDeadlineAt, order.appointmentSnapshot.startAt - 60 * 60000);
  assert.equal(s.db.stocks[s.stockId].heldUnits, 4);
  const stockHold = Object.values(s.db.reservations).find(value => value.resourceKind === 'STOCK');
  assert.equal(stockHold.quantity, 4); assert.equal(stockHold.expiresAt, order.paymentDeadlineAt);
  assert.equal(Object.values(s.db.reservations).find(value => value.resourceKind === 'SLOT').quantity, 1);
});

test('O03 duplicate same key replays without extra hold; different key cannot consume the same quote twice', async () => {
  const s = setup(), q = s.makeQuote(), first = await execute(s,q), before = JSON.stringify(s.db);
  s.controls.now = s.db.quotes[q.quoteId].expiresAt + 1;
  const replay = await execute(s,q); assert.equal(replay.disposition, 'REPLAY');
  assert.deepEqual(replay.result, first.result); assert.equal(JSON.stringify(s.db), before);
  const otherKey = { ...q, event: { ...q.event, payload: { ...q.event.payload, idempotencyKey: 'another-create-key' } } };
  // Consumption increments quote.version; version conflict precedes expiry.
  await rejects(() => execute(s,otherKey), 'QUOTE_CHANGED'); assert.equal(JSON.stringify(s.db), before);
  s.controls.now = s.base.context.now;
  await rejects(() => execute(s,otherKey), 'QUOTE_CHANGED'); assert.equal(JSON.stringify(s.db), before);
});

test('O03 local duplicate ID/number checks reject overwrite without any resource mutation', async () => {
  const s = setup(), q = s.makeQuote();
  const state = { ...s.base.state, cart: Object.values(s.db.carts)[0], stocks: Object.values(s.db.stocks),
    configuration: s.db.configs[s.configId], quote: s.db.quotes[q.quoteId], orderReceipt: null,
    slot: s.db.slots[s.db.quotes[q.quoteId].facts.appointmentSnapshot.slotId] };
  const proposal = planOrderCreation(state, q.event, q.customer, s.base.context);
  s.db.orders['other-id'] = { _id: 'other-id', orderNo: proposal.proposedOrder.orderNo, ownerId: q.customer.subjectId };
  const before = JSON.stringify(s.db); await rejects(() => execute(s,q), 'VERSION_CONFLICT');
  assert.equal(JSON.stringify(s.db), before);
});

test('O03 no transaction adapter or forged identity cannot execute; results never unlock cloud purchase', async () => {
  const s = setup(), q = s.makeQuote();
  await rejects(() => s.service.execute(q.event, { ...q.customer }), 'AUTH_REQUIRED');
  const service = createOrderTransactionService({ runTransaction: work => work({}), now: () => s.controls.now,
    buildContext: () => s.base.context, newRequestId: () => 'offline-trace' });
  await rejects(() => service.execute(q.event,q.customer), 'INVALID_TRANSACTION_ADAPTER');
  assert.equal(Object.keys(s.db.orders).length, 0);
});
