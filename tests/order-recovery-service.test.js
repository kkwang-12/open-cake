'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { setup } = require('./fixtures/order-transaction');
const { clone } = require('./fixtures/quote');
const { messageFingerprint } = require('../cloudfunctions/_shared/catalog-model');
const { planOrderCartSync } = require('../cloudfunctions/_shared/order-cart-sync-model');
const { createOrderRecoveryService } = require('../cloudfunctions/_shared/order-recovery-service');
const rejects = (fn, code) => assert.rejects(fn, error => error.code === code);
async function created() {
  const s = setup(), q = s.makeQuote({ quantity: 2 });
  const result = await s.service.execute(q.event,q.customer), order = s.db.orders[result.result.entityId];
  return { ...s, q, result, order, cartId: order.cartRemovalSnapshot.cartId };
}
function newLine(cart, name = 'new-line') {
  const line = clone(cart.lines[0]);
  line.lineId = name; line.cakeMessage = name; line.messageFingerprint = messageFingerprint(name);
  return line;
}
function sync(s) { return s.cartSyncService.synchronize(s.order._id,s.q.customer); }
const receiptList = s => Object.values(s.db.receipts).filter(record => record.command === 'order.cart.sync');

test('O04 exact selected rows are removed once; unselected/new rows and independent cart changes survive', async () => {
  const s = await created(), cart = s.db.carts[s.cartId];
  cart.lines.push(newLine(cart,'unselected'),newLine(cart,'new-after-order')); cart.version++;
  const kept = clone(cart.lines.slice(1)), beforeVersion = cart.version;
  const result = await sync(s);
  assert.equal(result.disposition, 'SYNCED'); assert.equal(result.cloudVerified, false);
  assert.deepEqual(s.db.carts[s.cartId].lines, kept); assert.equal(s.db.carts[s.cartId].version, beforeVersion + 1);
  assert.equal(receiptList(s).length, 1);
  const before = JSON.stringify(s.db), replay = await sync(s);
  assert.equal(replay.disposition, 'REPLAY'); assert.deepEqual(replay.result,result.result);
  assert.equal(JSON.stringify(s.db), before);
});

test('O04 modified quantity/message or merged additions retain the complete selected row', async () => {
  for (const mutate of [line => line.quantity = 5,
    line => { line.cakeMessage = 'edited'; line.messageFingerprint = messageFingerprint('edited'); }]) {
    const s = await created(), cart = s.db.carts[s.cartId], line = cart.lines[0];
    mutate(line); line.lineVersion++; cart.version++;
    const before = JSON.stringify(cart); await sync(s);
    assert.equal(JSON.stringify(s.db.carts[s.cartId]), before); // No subtracting ordered quantity from a new edit.
    assert.equal(receiptList(s).length, 1);
  }
});

test('O04 multi-item order removes matching row while retaining another edited row and new additions', async () => {
  const s = setup(), extra = newLine(s.base.state.cart,'second-line'); extra.quantity = 1;
  const q = s.makeQuote({ quantity:2, additionalLines:[extra] });
  const result = await s.service.execute(q.event,q.customer), order = s.db.orders[result.result.entityId];
  const cart = s.db.carts[order.cartRemovalSnapshot.cartId];
  cart.lines[1].quantity = 7; cart.lines[1].lineVersion++; cart.version++;
  cart.lines.push(newLine(cart,'new-line'));
  const expected = clone(cart.lines.slice(1));
  await s.cartSyncService.synchronize(order._id,q.customer);
  assert.deepEqual(s.db.carts[cart._id].lines,expected);
  assert.equal(Object.keys(s.db.items).length,2); assert.equal(s.db.stocks[s.stockId].heldUnits,3);
});

test('O04 concurrent bag edit at commit prevents removal/checkpoint and retry preserves the edited row', async () => {
  const s = await created();
  s.controls.beforeCommit = db => {
    const cart = db.carts[s.cartId]; cart.lines[0].quantity++; cart.lines[0].lineVersion++; cart.version++;
  };
  await rejects(()=>sync(s),'VERSION_CONFLICT');
  assert.equal(receiptList(s).length,0); assert.equal(s.db.carts[s.cartId].lines[0].quantity,3);
  s.controls.beforeCommit = null;
  await sync(s);
  assert.equal(s.db.carts[s.cartId].lines[0].quantity,3); assert.equal(receiptList(s).length,1);
  assert.equal(s.db.stocks[s.stockId].heldUnits,2);
});

test('O04 defensive content fingerprint catches same-version SKU/quantity/message/re-added line changes', async () => {
  for (const mutate of [line => line.skuId = 'other-sku', line => line.productId = 'other-product',
    line => line.quantity++, line => line.addedAt++,
    line => { line.cakeMessage = 'new content'; line.messageFingerprint = messageFingerprint('new content'); }]) {
    const s = await created(), cart = s.db.carts[s.cartId];
    mutate(cart.lines[0]); cart.lines[0].updatedAt = cart.lines[0].addedAt;
    cart.updatedAt = cart.lines[0].updatedAt; cart.version++;
    const before = JSON.stringify(cart); await sync(s);
    assert.equal(JSON.stringify(s.db.carts[s.cartId]), before);
  }
});

test('O04 deleted/re-added new IDs survive and successful checkpoint never removes later additions', async () => {
  const s = await created(), cart = s.db.carts[s.cartId], replacement = newLine(cart,'replacement-id');
  cart.lines = [replacement]; cart.version++;
  await sync(s); assert.deepEqual(s.db.carts[s.cartId].lines,[replacement]);
  const reused = clone(replacement); reused.lineId = 'offline-line';
  reused.cakeMessage = 'added-after-sync'; reused.messageFingerprint = messageFingerprint(reused.cakeMessage);
  s.db.carts[s.cartId].lines.push(reused); s.db.carts[s.cartId].version++;
  const before = JSON.stringify(s.db.carts[s.cartId]); await sync(s);
  assert.equal(JSON.stringify(s.db.carts[s.cartId]), before);
});

test('O04 each cart/checkpoint write failure or zero-row result rolls back both with safe retry', async () => {
  for (const mode of ['failAt','zeroAt']) {
    for (const index of [1,2]) {
      const s = await created(), before = JSON.stringify(s.db);
      s.controls[mode] = index;
      if (mode === 'failAt') await assert.rejects(() => sync(s), /OFFLINE injected write failure/);
      else await rejects(() => sync(s),'VERSION_CONFLICT');
      assert.equal(JSON.stringify(s.db), before); assert.equal(receiptList(s).length, 0);
      s.controls[mode] = 0; await sync(s);
      assert.equal(s.db.carts[s.cartId].lines.length, 0); assert.equal(receiptList(s).length, 1);
      assert.equal(Object.keys(s.db.orders).length, 1); assert.equal(s.db.stocks[s.stockId].heldUnits, 2);
    }
  }
});

test('O04 cart sync failure returns pending while order/holds remain committed; retry compensates same order', async () => {
  const s = await created(); s.controls.failAt = 2;
  const pending = await s.recoveryService.execute(s.q.event,s.q.customer);
  assert.equal(pending.disposition, 'REPLAY'); assert.equal(pending.cartSynchronization.status, 'PENDING');
  assert.equal(pending.cartSynchronization.errorCode, 'CART_SYNC_PENDING');
  assert(!JSON.stringify(pending).includes('injected'));
  assert.equal(pending.result.entityId,s.order._id); assert.equal(s.db.carts[s.cartId].lines.length,1);
  assert.equal(Object.keys(s.db.orders).length,1); assert.equal(s.db.stocks[s.stockId].heldUnits,2);
  s.controls.failAt = 0;
  const recovered = await s.recoveryService.execute(s.q.event,s.q.customer);
  assert.equal(recovered.cartSynchronization.status, 'SYNCED'); assert.equal(recovered.result.entityId,s.order._id);
  assert.equal(s.db.carts[s.cartId].lines.length,0); assert.equal(Object.keys(s.db.orders).length,1);
  assert.equal(s.db.stocks[s.stockId].heldUnits,2);
});

test('O04 committed creation response loss recovers through same key, without a second order/hold', async () => {
  const s = setup(), q = s.makeQuote(); let lost = true;
  const orderService = { async execute(event,principal) {
    const committed = await s.service.execute(event,principal);
    if (lost) { lost = false; throw Object.assign(new Error('test transport dropped'),{ code:'NETWORK_UNRESOLVED' }); }
    return committed;
  } };
  const recovery = createOrderRecoveryService({ orderService, cartSyncService:s.cartSyncService });
  await rejects(() => recovery.execute(q.event,q.customer),'NETWORK_UNRESOLVED');
  assert.equal(Object.keys(s.db.orders).length,1); assert.equal(Object.values(s.db.carts)[0].lines.length,1);
  const recovered = await recovery.execute(q.event,q.customer);
  assert.equal(recovered.disposition,'REPLAY'); assert.equal(recovered.cartSynchronization.status,'SYNCED');
  assert.equal(Object.keys(s.db.orders).length,1); assert.equal(s.db.stocks[s.stockId].heldUnits,1);
  assert.equal(Object.values(s.db.carts)[0].lines.length,0);
});

test('O04 synchronization response loss and reconstructed service replay the committed checkpoint', async () => {
  const s = await created(), first = await sync(s); // Simulated transport drops this already committed result.
  const { createOrderCartSyncService } = require('../cloudfunctions/_shared/order-recovery-service');
  const rebuilt = createOrderCartSyncService({ runTransaction:s.runTransaction,now:()=>s.controls.now });
  const before = JSON.stringify(s.db), replay = await rebuilt.synchronize(s.order._id,s.q.customer);
  assert.equal(replay.disposition,'REPLAY'); assert.deepEqual(replay.result,first.result);
  assert.equal(JSON.stringify(s.db),before);
});

test('O04 same-key changed payload/foreign owner/forged identity cannot recover or delete rows', async () => {
  const s = await created(), before = JSON.stringify(s.db);
  const changed = { ...s.q.event,payload:{ ...s.q.event.payload,expectedQuoteVersion:1 } };
  await rejects(() => s.recoveryService.execute(changed,s.q.customer),'IDEMPOTENCY_KEY_REUSED');
  await rejects(() => s.cartSyncService.synchronize(s.order._id,{ ...s.q.customer }),'AUTH_REQUIRED');
  const other = s.makeQuote({ customer:s.actor('B') }); const baseline = JSON.stringify(s.db);
  await rejects(() => s.cartSyncService.synchronize(s.order._id,other.customer),'FORBIDDEN');
  assert.equal(JSON.stringify(s.db),baseline); assert(before.includes(s.order._id));
});

test('O04 cart missing or all original rows absent finishes checkpoint without creating or clearing a new cart', async () => {
  const s = await created(); delete s.db.carts[s.cartId];
  const done = await sync(s); assert.equal(done.result.version,null); assert.equal(s.db.carts[s.cartId],undefined);
  const recreated = clone(s.base.state.cart); recreated._id = s.cartId; recreated.ownerId = s.q.customer.subjectId;
  s.db.carts[s.cartId] = recreated;
  const before = JSON.stringify(recreated); await sync(s);
  assert.equal(JSON.stringify(s.db.carts[s.cartId]),before);
});

test('O04 read fence / cart version regression / malformed immutable evidence reject whole synchronization', async () => {
  for (const [mutate, code] of [
    [s=>s.controls.denyFence=true,'VERSION_CONFLICT'],
    [s=>s.db.carts[s.cartId].version=0,'VERSION_CONFLICT'],
    [s=>s.db.orders[s.order._id].cartRemovalSnapshot.lines[0].contentFingerprint='bad','INVALID_CART_REMOVAL_SNAPSHOT'],
    [s=>s.db.carts[s.cartId].ownerId='foreign','FORBIDDEN']
  ]) {
    const s = await created(); mutate(s); const before = JSON.stringify(s.db);
    await rejects(() => sync(s),code); assert.equal(JSON.stringify(s.db),before);
  }
});

test('O04 concurrent same-order compensation records one checkpoint and does not modify order history', async () => {
  const s = await created(), orderBefore = JSON.stringify(s.db.orders), resourcesBefore = JSON.stringify(s.db.stocks);
  const results = await Promise.all([sync(s),sync(s)]);
  assert.deepEqual(results.map(value=>value.disposition),['SYNCED','REPLAY']);
  assert.equal(receiptList(s).length,1); assert.equal(s.db.carts[s.cartId].lines.length,0);
  assert.equal(JSON.stringify(s.db.orders),orderBefore); assert.equal(JSON.stringify(s.db.stocks),resourcesBefore);
});

test('O04 standalone removal plan is immutable, rejects unknown orders and never reads current catalog', async () => {
  const s = await created(), before = JSON.stringify(s.db.carts[s.cartId]);
  const plan = planOrderCartSync(s.order,s.db.carts[s.cartId],s.q.customer,s.controls.now);
  assert(Object.isFrozen(plan.nextCart.lines)); assert.deepEqual(plan.removedLineIds,['offline-line']);
  assert.equal(JSON.stringify(s.db.carts[s.cartId]),before);
  s.db.catalogs = []; await sync(s); assert.equal(s.db.carts[s.cartId].lines.length,0);
  await rejects(()=>s.cartSyncService.synchronize('no-order',s.q.customer),'NOT_FOUND');
});
