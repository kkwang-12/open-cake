'use strict';
// Offline application service, NOT a deployed cloud handler. principal must be
// resolved through D06 from platform context. runTransaction must supply an
// atomic session covering cart, catalog/config reads and command receipts.
const { parseApiRequest } = require('./api-contract');
const { requireOwner } = require('./authorization-model');
const { validateCart, planCartCommand, CartModelError } = require('./cart-model');
const { scopedDocumentId, requestFingerprint, idempotencyId } = require('./idempotency-model');

class CartServiceError extends Error {
  constructor(code) { super(code); this.name = 'CartServiceError'; this.code = code; }
}
function fail(code) { throw new CartServiceError(code); }
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}
function cartId(principal, storeId) {
  return scopedDocumentId('cart', [principal.environment, principal.appId, principal.subjectId, storeId]);
}
function publicCart(cart) {
  validateCart(cart);
  // No private owner, fingerprints, inventory resources or price snapshots.
  return freeze({ cartId: cart._id, storeId: cart.storeId, version: cart.version,
    lines: cart.lines.map(line => Object.fromEntries(
      ['lineId','lineVersion','productId','skuId','quantity','cakeMessage','addedAt','updatedAt']
        .map(key => [key,line[key]]))) });
}
function createCartService({ runTransaction, now, newLineId }) {
  if (![runTransaction, now, newLineId].every(value => typeof value === 'function')) fail('INVALID_CONFIGURATION');
  return Object.freeze({
    async execute(event, principal) {
      // requireOwner verifies the D06-issued principal, even for an empty GET.
      requireOwner(principal, { ownerId: principal && principal.subjectId });
      const { contract, payload } = parseApiRequest('cart', event);
      const action = contract.action;
      const fingerprint = contract.mutation ? requestFingerprint(payload) : null;
      const receiptId = contract.mutation ? idempotencyId({ environment: principal.environment,
        actorScope: JSON.stringify([principal.appId,principal.subjectId]),
        command: 'cart.'+action, key: payload.idempotencyKey }) : null;
      return runTransaction(async tx => {
        let cart = await tx.readCart(payload.cartId || cartId(principal,payload.storeId));
        const existed = cart !== null;
        if (!existed) {
          if (!['get','add'].includes(action)) fail('NOT_FOUND');
          const timestamp = now();
          cart = { _id: cartId(principal,payload.storeId), schemaVersion: 1,
            ownerId: principal.subjectId, storeId: payload.storeId, version: 0,
            createdAt: timestamp, updatedAt: timestamp, lines: [] };
        }
        const actor = requireOwner(principal, cart);
        validateCart(cart);
        if (['get','add'].includes(action) && (cart.storeId !== payload.storeId ||
            cart._id !== cartId(principal,payload.storeId))) fail('FORBIDDEN');
        if (action === 'get') return publicCart(cart);
        const receipt = await tx.readReceipt(receiptId);
        if (receipt !== null) {
          if (receipt.fingerprint !== fingerprint) fail('IDEMPOTENCY_KEY_REUSED');
          // Return the original command result, including its original version.
          // Clients must GET to learn about subsequent mutations.
          return freeze(JSON.parse(JSON.stringify(receipt.response)));
        }
        const context = { now: now() };
        if (action !== 'remove') {
          const line = action === 'update' ? cart.lines.find(item => item.lineId === payload.lineId) : null;
          if (action === 'update' && !line) throw new CartModelError('LINE_NOT_FOUND');
          const productId = action === 'add' ? payload.productId : line.productId;
          const catalog = await tx.readCatalog(productId);
          if (!catalog || !catalog.product || catalog.product._id !== productId) fail('PRODUCT_UNAVAILABLE');
          context.product = catalog.product;
          context.skus = catalog.skus;
          context.limits = await tx.readLimits(cart.storeId);
          if (action === 'add') context.newLineId = newLineId();
        }
        const plan = planCartCommand(cart, action.toUpperCase(), actor, payload, context);
        // A session must check the version (null means create-if-absent) and
        // commit cart+receipt together; an unconditional set is not sufficient.
        if (plan.changed) await tx.saveCart(plan.nextCart, existed ? cart.version : null);
        const response = publicCart(plan.nextCart);
        await tx.saveReceipt(receiptId, { fingerprint, response });
        return response;
      });
    }
  });
}
module.exports = { CartServiceError, createCartService, publicCart, cartId };
