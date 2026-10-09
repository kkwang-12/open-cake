'use strict';
// SDK-shaped in-memory provider only. This is not cloud serializability evidence.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./fixtures/order-transaction');
const { createCloudDocumentTransactionAdapter } = require('../cloudfunctions/_shared/cloud-document-transaction');
const { createOrderDocumentSession, COLLECTIONS } = require('../cloudfunctions/_shared/order-document-session');
const { createOrderTransactionService } = require('../cloudfunctions/_shared/order-transaction-service');
function harness(mode = 'PICKUP') {
  const source = setup(), q = source.makeQuote({ mode });
  const tables = { users: 'users', stores: 'stores', configs: 'store_config', carts: 'carts',
    addresses: 'addresses', stocks: 'inventory_resources', slots: 'slot_inventory', quotes: 'checkout_quotes',
    orders: 'orders', items: 'order_items', reservations: 'reservations', logs: 'order_logs', receipts: 'idempotency_records' };
  let records = {}, active, writes = 0, calls = [], dependencies = [], predicates = [];
  const controls = { failAt: 0, denyFence: false, maxReadDocuments: 50 };
  for (const [table, collection] of Object.entries(tables)) records[collection] = structuredClone(source.db[table]);
  records.products = {}; records.skus = {};
  for (const entry of source.db.catalogs) {
    records.products[entry.product._id] = structuredClone(entry.product);
    for (const sku of entry.skus) records.skus[sku._id] = structuredClone(sku);
  }
  const write = () => { if (++writes === controls.failAt) throw new Error('injected-provider-failure'); };
  const cloud = { database: () => ({ runTransaction: async work => {
    active = structuredClone(records); writes = 0; calls = [];
    const result = await work({ collection: collection => ({ doc: id => ({
      get: async () => { calls.push([collection,id]); return { data: active[collection]?.[id] || null }; },
      update: async ({ data }) => { write(); active[collection][id] = { ...active[collection][id], ...data }; return { stats: { updated: 1 } }; }
    }), add: async ({ data }) => { write(); active[collection] ||= {}; active[collection][data._id] = structuredClone(data); return { _id: data._id }; } }) });
    records = active; return result;
  } }) };
  const collections = Object.fromEntries(Object.values(COLLECTIONS).map(name => [name, []]));
  collections.inventory_resources = collections.slot_inventory = ['heldUnits','confirmedUnits','consumedUnits','updatedAt'];
  collections.checkout_quotes = ['status','consumedOrderId','updatedAt'];
  const adapter = createCloudDocumentTransactionAdapter({ cloud, environment: q.customer.environment, collections });
  const options = documents => ({ documents, principal: q.customer, maxReadDocuments: controls.maxReadDocuments,
    protectReads: async (snapshots, conditions, queries) => {
      dependencies = snapshots; predicates = queries; return !controls.denyFence;
    },
    findOrderByNumber: async number => Object.values(active.orders).find(order => order.orderNo === number) || null });
  const service = createOrderTransactionService({
    runTransaction: work => adapter.runTransaction(documents => work(createOrderDocumentSession(options(documents)))),
    now: () => source.controls.now,
    buildContext: () => ({ ...source.base.context, verifyLocation: () => true }), // Synthetic fixture only.
    newRequestId: () => 'sdk-shaped-test-trace'
  });
  return { q, source, service, controls, options, state: () => ({ records, writes, calls, dependencies, predicates }),
    execute: () => service.execute(q.event, q.customer) };
}
test('D04 document session commits actual domain records for pickup/delivery via SDK-shaped primitives', async () => {
  for (const mode of ['PICKUP','DELIVERY']) {
    const h = harness(mode), outcome = await h.execute(), { records, writes, dependencies } = h.state();
    assert.equal(writes, 9); assert.equal(outcome.cloudVerified, false);
    const order = records.orders[outcome.result.entityId];
    assert.equal(order.orderStatus, 'PENDING_PAYMENT'); assert.equal(order.paymentStatus, 'UNPAID');
    assert.equal(records.checkout_quotes[h.q.quoteId].status, 'CONSUMED');
    assert.equal(records.checkout_quotes[h.q.quoteId].version, 1);
    assert.equal(Object.keys(records.order_items).length, 1);
    assert.equal(Object.keys(records.order_logs).length, 1);
    assert.equal(Object.keys(records.reservations).length, 2);
    assert.equal(Object.keys(records.idempotency_records).length, 1);
    for (const collection of ['users','stores','store_config','carts','products','skus','checkout_quotes',
      'inventory_resources','slot_inventory','orders','idempotency_records'])
      assert.ok(dependencies.some(value => value.collection === collection), collection);
    assert.equal(dependencies.some(value => value.collection === 'addresses'), mode === 'DELIVERY');
    assert.ok(dependencies.some(value => value.collection === 'orders' && value.record === null));
    assert.deepEqual(h.state().predicates, [{ collection: 'orders', field: 'orderNo', value: order.orderNo, record: null }]);
  }
});
test('D04 every domain persistence failure rolls back quote/order/reservations/counters together', async () => {
  for (let position = 1; position <= 9; position++) {
    const h = harness(), before = JSON.stringify(h.state().records); h.controls.failAt = position;
    await assert.rejects(h.execute(), { code: 'CLOUD_DOCUMENT_OPERATION_FAILED' });
    assert.equal(JSON.stringify(h.state().records), before);
  }
});
test('D04 foreign quote is rejected before following its store/cart/address references', async () => {
  const h = harness('DELIVERY'); h.state().records.checkout_quotes[h.q.quoteId].ownerId = 'another-owner';
  await assert.rejects(h.execute(), { code: 'FORBIDDEN' });
  assert.deepEqual(h.state().calls.map(value => value[0]), ['users','idempotency_records','checkout_quotes']);
  assert.equal(h.state().writes, 0);
});
test('D04 bounded reads and denied dependency protection refuse business writes', async () => {
  const limited = harness(); limited.controls.maxReadDocuments = 3;
  await assert.rejects(limited.execute(), { code: 'ORDER_READ_BUDGET_EXCEEDED' });
  assert.equal(limited.state().writes, 0);
  const denied = harness(); denied.controls.denyFence = true;
  await assert.rejects(denied.execute(), { code: 'VERSION_CONFLICT' });
  assert.equal(denied.state().writes, 0);
});
test('D04 missing provider protection/unique lookup or forged principal cannot construct session', () => {
  const h = harness(), documents = { read() {}, insert() {}, updateVersioned() {} };
  for (const key of ['protectReads','findOrderByNumber','maxReadDocuments'])
    assert.throws(() => createOrderDocumentSession({ ...h.options(documents), [key]: undefined }),
      { code: 'INVALID_ORDER_DOCUMENT_CONFIGURATION' });
  assert.throws(() => createOrderDocumentSession({ ...h.options(documents), principal: { ...h.q.customer } }), { code: 'AUTH_REQUIRED' });
});
test('D04 changed catalog and another owner cart/address cannot become trusted creation state', async () => {
  for (const target of ['products','carts','addresses']) {
    const h = harness('DELIVERY'), records = h.state().records, record = Object.values(records[target])[0];
    if (target === 'products') record.version++;
    else record.ownerId = 'another-owner';
    await assert.rejects(h.execute()); assert.equal(h.state().writes, 0);
  }
});
test('D04 successful idempotency replay does not reconsume quote or reserve resources', async () => {
  const h = harness(), first = await h.execute(), before = JSON.stringify(h.state().records);
  const replay = await h.execute();
  assert.equal(replay.disposition, 'REPLAY'); assert.deepEqual(replay.result, first.result);
  assert.equal(h.state().writes, 0); assert.equal(JSON.stringify(h.state().records), before);
});
test('D04 replay refuses missing commit-time protection instead of returning stored success', async () => {
  const h = harness(); await h.execute();
  const before = JSON.stringify(h.state().records); h.controls.denyFence = true;
  await assert.rejects(h.execute(), { code: 'VERSION_CONFLICT' });
  assert.equal(h.state().writes, 0); assert.equal(JSON.stringify(h.state().records), before);
  assert.deepEqual(h.state().dependencies.map(value => value.collection), ['users','idempotency_records','orders']);
});
test('D04 state loader deduplicates explicit reads and never loads unrelated catalog or stocks', async () => {
  const h = harness(), records = h.state().records;
  records.products.unrelated = { _id: 'unrelated' };
  records.skus.unrelated = { _id: 'unrelated' };
  records.inventory_resources.unrelated = { _id: 'unrelated' };
  await h.execute();
  const reads = h.state().calls;
  assert.ok(!reads.some(value => value[1] === 'unrelated'));
  assert.equal(new Set(reads.map(value => JSON.stringify(value))).size, reads.length);
});
test('D04 malformed unique-order lookup response fails before business writes', async () => {
  const h = harness(), documents = { read() {}, insert() {}, updateVersioned() {} };
  const session = createOrderDocumentSession({ ...h.options(documents), findOrderByNumber: async () => ({ orderNo: 'different' }) });
  await assert.rejects(session.readOrderByNumber('V1-ABC'), { code: 'INVALID_ORDER_DOCUMENT' });
  await assert.rejects(session.readOrderByNumber('arbitrary query'), { code: 'INVALID_ORDER_DOCUMENT' });
});
