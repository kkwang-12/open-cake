'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { measureOrderWrites, validateOrderWriteLimits } = require('../cloudfunctions/_shared/order-write-budget');
const { setup } = require('./fixtures/order-transaction');
const generous = { maxWrites: 100, maxPayloadBytes: 1000000, maxTotalPayloadBytes: 10000000 };
function proposal() {
  return { timestamp: 123, plan: { proposedOrder: { _id: 'order', name: '生日蛋糕' },
    proposedItems: [{ _id: 'item', quantity: 99 }],
    quoteConsumption: { quoteId: 'quote', patch: { status: 'CONSUMED', version: 1 } } },
    holds: { resourceChanges: ['STOCK','SLOT'].map((resourceKind, i) => ({ resourceKind,
      resourceId: 'resource'+i, nextVersion: 1, heldUnits: 1, confirmedUnits: 0, consumedUnits: 0 })),
      reservations: [{ _id: 'r0' }, { _id: 'r1' }] }, log: { _id: 'log' }, receipt: { _id: 'receipt' } };
}
test('D04 business write budget includes every planned write; units do not multiply item writes', () => {
  const input = proposal(), summary = measureOrderWrites(input);
  assert.equal(summary.businessWrites, 9);
  input.plan.proposedItems.push({ _id: 'item2', quantity: 1 });
  assert.equal(measureOrderWrites(input).businessWrites, 10);
  input.holds.resourceChanges.push({ ...input.holds.resourceChanges[0], resourceId: 'stock2' });
  input.holds.reservations.push({ _id: 'r2' });
  assert.equal(measureOrderWrites(input).businessWrites, 12);
  assert.equal(summary.sdkReadAndFenceBudgetVerified, false);
  assert.deepEqual(Object.keys(summary).sort(), ['businessWrites','largestPayloadBytes','sdkReadAndFenceBudgetVerified','totalPayloadBytes'].sort());
});
test('D04 exact admission boundaries accepted and each one-byte/one-write overflow rejected', () => {
  const input = proposal(), summary = measureOrderWrites(input);
  const exact = { maxWrites: summary.businessWrites, maxPayloadBytes: summary.largestPayloadBytes,
    maxTotalPayloadBytes: summary.totalPayloadBytes };
  assert.deepEqual(measureOrderWrites(input, exact), summary);
  for (const key of Object.keys(exact)) assert.throws(() => measureOrderWrites(input,
    { ...exact, [key]: exact[key] - 1 }), { code: 'ORDER_WRITE_BUDGET_EXCEEDED' });
});
test('D04 payload sizing uses UTF8 bytes and rejects duplicate document targets', () => {
  const input = proposal(), first = measureOrderWrites(input);
  input.plan.proposedOrder.name = 'abcd';
  assert.equal(first.totalPayloadBytes - measureOrderWrites(input).totalPayloadBytes, 8);
  input.plan.proposedItems.push({ _id: 'item' });
  assert.throws(() => measureOrderWrites(input), { code: 'INVALID_ORDER_WRITE_PLAN' });
});
test('D04 server limits require complete positive integer policy and copy deployment input', () => {
  for (const value of [undefined, {}, { ...generous, maxWrites: 0 }, { ...generous, maxWrites: 1.5 },
    { ...generous, extra: true }, { ...generous, maxTotalPayloadBytes: Infinity }])
    assert.throws(() => validateOrderWriteLimits(value), { code: 'INVALID_ORDER_WRITE_LIMITS' });
  const mutable = { ...generous }, frozen = validateOrderWriteLimits(mutable);
  mutable.maxWrites = 1;
  assert.equal(frozen.maxWrites, 100); assert.equal(Object.isFrozen(frozen), true);
});
test('D04 service rejects oversized order before read-fence and first mutation; no partial hold', async () => {
  for (const limits of [{ ...generous, maxWrites: 8 }, { ...generous, maxPayloadBytes: 1 },
    { ...generous, maxTotalPayloadBytes: 1 }]) {
    const s = setup({ transactionLimits: limits }), q = s.makeQuote();
    const before = JSON.stringify(s.db);
    s.controls.failAt = 1;
    s.controls.extendTransaction = () => ({ assertCreationReads: () => { throw new Error('fence called too early'); } });
    await assert.rejects(s.service.execute(q.event, q.customer), { code: 'ORDER_WRITE_BUDGET_EXCEEDED' });
    assert.equal(JSON.stringify(s.db), before); assert.equal(s.controls.commits, 0);
  }
});
test('D04 service accepts nine-write boundary and replay needs no new write admission', async () => {
  const mutable = { ...generous, maxWrites: 9 }, s = setup({ transactionLimits: mutable }), q = s.makeQuote();
  mutable.maxWrites = 1;
  const result = await s.service.execute(q.event, q.customer);
  assert.equal(result.disposition, 'CREATED'); assert.equal(s.controls.lastWrites, 9);
  const before = JSON.stringify(s.db);
  s.controls.failAt = 1;
  assert.equal((await s.service.execute(q.event, q.customer)).disposition, 'REPLAY');
  assert.equal(JSON.stringify(s.db), before);
  assert.equal(result.cloudVerified, false); assert.equal(result.checkoutAllowed, false);
});
