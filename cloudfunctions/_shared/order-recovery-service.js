'use strict';
// Internal post-commit compensation. No cloud handler/client hook or worker exists.
const { requireOwner } = require('./authorization-model');
const { requireCurrentOrderUser } = require('./order-transaction-service');
const { planOrderCartSync } = require('./order-cart-sync-model');
const { idempotencyId, requestFingerprint, decideIdempotency } = require('./idempotency-model');
function fail(code) { throw Object.assign(new Error(code), { code }); }
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function text(value) { return typeof value === 'string' && value.length > 0 && value === value.trim() && value.length <= 256 && value.isWellFormed(); }
function result(disposition, commandResult) {
  return freeze({ scope: 'OFFLINE_CART_SYNC_RESULT', disposition, result: commandResult, cloudVerified: false });
}
function createOrderCartSyncService({ runTransaction, now }) {
  if (![runTransaction,now].every(value => typeof value === 'function')) fail('INVALID_CONFIGURATION');
  return Object.freeze({ async synchronize(orderId, principal) {
    requireOwner(principal, { ownerId: principal && principal.subjectId });
    if (!text(orderId)) fail('INVALID_REQUEST');
    return runTransaction(async tx => {
      const methods = ['readUser','readOrder','readCart','readReceipt','assertSyncReads','saveCart','insertReceipt'];
      if (!tx || methods.some(name => typeof tx[name] !== 'function')) fail('INVALID_TRANSACTION_ADAPTER');
      requireCurrentOrderUser(await tx.readUser(principal.subjectId), principal);
      const order = await tx.readOrder(orderId);
      if (!order || order._id !== orderId) fail('NOT_FOUND');
      requireOwner(principal, order);
      const timestampNow = now();
      // Validate the immutable order input even when a previous checkpoint exists.
      planOrderCartSync(order, null, principal, timestampNow);
      const snapshot = order.cartRemovalSnapshot;
      const request = { environment: principal.environment,
        actorScope: JSON.stringify([principal.appId,principal.subjectId]), command: 'order.cart.sync',
        key: orderId, requestFingerprint: requestFingerprint({ orderId, snapshot }) };
      const receiptId = idempotencyId(request), receipt = await tx.readReceipt(receiptId);
      const decision = decideIdempotency(receipt, request);
      if (decision.disposition === 'BUSY') fail('BUSY');
      if (decision.disposition === 'REPLAY') {
        if (decision.result.errorCode !== null) fail(decision.result.errorCode);
        if (decision.result.entityId !== snapshot.cartId) fail('INVALID_IDEMPOTENCY_RECORD');
        return result('REPLAY', decision.result); // Do not remove new rows after an earlier sync.
      }
      const cart = await tx.readCart(snapshot.cartId);
      const plan = planOrderCartSync(order, cart, principal, timestampNow);
      if (await tx.assertSyncReads({ userId: principal.subjectId, userVersion: principal.userVersion,
          orderId, orderVersion: order.version, cartId: snapshot.cartId,
          cartVersion: cart === null ? null : cart.version }) !== true) fail('VERSION_CONFLICT');
      if (plan.changed && await tx.saveCart(plan.nextCart, cart.version) !== 1) fail('VERSION_CONFLICT');
      const commandResult = freeze({ entityId: snapshot.cartId,
        version: plan.nextCart === null ? null : plan.nextCart.version, errorCode: null });
      // Successful checkpoint and conditional cart update MUST commit together.
      if (await tx.insertReceipt(freeze({ ...request, _id: receiptId,
          schemaVersion: 1, version: 0, createdAt: timestampNow, updatedAt: timestampNow,
          status: 'SUCCEEDED', result: commandResult, leaseUntil: null, retentionUntil: null })) !== 1) fail('VERSION_CONFLICT');
      return result('SYNCED', commandResult);
    });
  } });
}
function createOrderRecoveryService({ orderService, cartSyncService }) {
  if (!orderService || typeof orderService.execute !== 'function' ||
      !cartSyncService || typeof cartSyncService.synchronize !== 'function') fail('INVALID_CONFIGURATION');
  return Object.freeze({ async execute(event, principal) {
    // Unknown creation result propagates; caller retries SAME event/key. Never
    // clear cart on a timeout or invent an order ID from the client.
    const committed = await orderService.execute(event, principal);
    let synchronization;
    try {
      const synced = await cartSyncService.synchronize(committed.result.entityId, principal);
      synchronization = { status: 'SYNCED', result: synced.result };
    } catch (error) {
      if (['AUTH_REQUIRED','FORBIDDEN','USER_DISABLED','USER_NOT_PROVISIONED','INVALID_USER_RECORD'].includes(error.code)) throw error;
      // Absence of successful sync checkpoint + immutable order snapshot is the
      // durable compensation input. No permanent FAILED receipt for an unknown write.
      synchronization = { status: 'PENDING', errorCode: 'CART_SYNC_PENDING' };
    }
    return freeze({ scope: 'OFFLINE_ORDER_RECOVERY_RESULT', disposition: committed.disposition,
      result: committed.result, cartSynchronization: synchronization,
      cloudVerified: false, checkoutAllowed: false, paymentAllowed: false });
  } });
}
module.exports = { createOrderCartSyncService, createOrderRecoveryService };
