'use strict';
// Server-only admission policy. JSON payload bytes are not BSON/storage bytes;
// SDK read/fence operations must be budgeted separately by the future adapter.
const { canonicalJSON } = require('./idempotency-model');
class OrderWriteBudgetError extends Error {
  constructor(code) { super(code); this.name = 'OrderWriteBudgetError'; this.code = code; }
}
const fail = code => { throw new OrderWriteBudgetError(code); };
function validateOrderWriteLimits(limits) {
  if (limits === null) return null;
  const keys = ['maxWrites','maxPayloadBytes','maxTotalPayloadBytes'];
  if (!limits || Object.getPrototypeOf(limits) !== Object.prototype ||
      Object.keys(limits).length !== keys.length ||
      keys.some(key => !Number.isSafeInteger(limits[key]) || limits[key] <= 0))
    fail('INVALID_ORDER_WRITE_LIMITS');
  return Object.freeze(Object.fromEntries(keys.map(key => [key, limits[key]])));
}
function measureOrderWrites({ plan, holds, log, receipt, timestamp }, limits = null) {
  const policy = validateOrderWriteLimits(limits), entries = [];
  const add = (collection, id, data) => {
    if (typeof id !== 'string' || !id.length) fail('INVALID_ORDER_WRITE_PLAN');
    entries.push({ collection, id, payloadBytes: Buffer.byteLength(canonicalJSON(data), 'utf8') });
  };
  for (const change of holds.resourceChanges) {
    if (!['STOCK','SLOT'].includes(change.resourceKind)) fail('INVALID_ORDER_WRITE_PLAN');
    add(change.resourceKind === 'STOCK' ? 'inventory_resources' : 'slot_inventory', change.resourceId,
      { version: change.nextVersion, heldUnits: change.heldUnits, confirmedUnits: change.confirmedUnits,
        consumedUnits: change.consumedUnits, updatedAt: timestamp });
  }
  for (const record of holds.reservations) add('reservations', record._id, record);
  add('orders', plan.proposedOrder._id, plan.proposedOrder);
  for (const record of plan.proposedItems) add('order_items', record._id, record);
  add('order_logs', log._id, log);
  add('checkout_quotes', plan.quoteConsumption.quoteId, plan.quoteConsumption.patch);
  add('idempotency_records', receipt._id, receipt);
  if (new Set(entries.map(entry => JSON.stringify([entry.collection,entry.id]))).size !== entries.length)
    fail('INVALID_ORDER_WRITE_PLAN');
  const totalPayloadBytes = entries.reduce((sum, entry) => sum + entry.payloadBytes, 0);
  if (!Number.isSafeInteger(totalPayloadBytes)) fail('INVALID_ORDER_WRITE_PLAN');
  if (policy && (entries.length > policy.maxWrites || totalPayloadBytes > policy.maxTotalPayloadBytes ||
      entries.some(entry => entry.payloadBytes > policy.maxPayloadBytes))) fail('ORDER_WRITE_BUDGET_EXCEEDED');
  // Keep document IDs and content out of the returned admission summary.
  return Object.freeze({ businessWrites: entries.length, totalPayloadBytes,
    largestPayloadBytes: Math.max(...entries.map(entry => entry.payloadBytes)),
    sdkReadAndFenceBudgetVerified: false });
}
module.exports = { OrderWriteBudgetError, validateOrderWriteLimits, measureOrderWrites };
