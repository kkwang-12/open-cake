'use strict';
// Server-only snapshot/removal model. Never accepts a client deletion list.
const { validateCart } = require('./cart-model');
const { validateTradeSnapshot } = require('./trade-model');
const { requireOwner } = require('./authorization-model');
const { requestFingerprint } = require('./idempotency-model');
function fail(code) { throw Object.assign(new Error(code), { code }); }
const text = value => typeof value === 'string' && value.length > 0 && value === value.trim() && value.isWellFormed();
const counter = value => Number.isSafeInteger(value) && value >= 0;
const timestamp = value => counter(value) && value > 0 && Number.isFinite(new Date(value).getTime());
function exact(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value,key));
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function contentFingerprint(line) {
  return requestFingerprint(Object.fromEntries(['lineId','productId','skuId','quantity','cakeMessage',
    'messageFingerprint','normalizationVersion','addedAt'].map(key => [key,line[key]])));
}
function validateRemovalSnapshot(snapshot) {
  if (!exact(snapshot,['cartId','cartVersion','lines']) || !text(snapshot.cartId) || !counter(snapshot.cartVersion) ||
      !Array.isArray(snapshot.lines) || !snapshot.lines.length || Object.keys(snapshot.lines).length !== snapshot.lines.length ||
      snapshot.lines.some(line => !exact(line,['lineId','lineVersion','contentFingerprint']) || !text(line.lineId) ||
        !counter(line.lineVersion) || typeof line.contentFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(line.contentFingerprint)) ||
      new Set(snapshot.lines.map(line => line.lineId)).size !== snapshot.lines.length) fail('INVALID_CART_REMOVAL_SNAPSHOT');
}
function captureCartRemovalSnapshot(cart, selection) {
  validateCart(cart);
  if (!selection || selection.cartId !== cart._id || selection.cartVersion !== cart.version ||
      !Array.isArray(selection.selectedLines) || !selection.selectedLines.length) fail('INVALID_CART_REMOVAL_SNAPSHOT');
  const snapshot = { cartId: cart._id, cartVersion: cart.version, lines: selection.selectedLines.map(selected => {
    const line = cart.lines.find(value => value.lineId === selected.lineId);
    if (!line || line.lineVersion !== selected.lineVersion || line.quantity !== selected.quantity ||
        line.messageFingerprint !== selected.messageFingerprint) fail('INVALID_CART_REMOVAL_SNAPSHOT');
    return { lineId: line.lineId, lineVersion: line.lineVersion, contentFingerprint: contentFingerprint(line) };
  }) };
  validateRemovalSnapshot(snapshot); return freeze(snapshot);
}
function planOrderCartSync(order, cart, principal, now) {
  requireOwner(principal, order);
  validateTradeSnapshot({ ...order, id: order._id });
  validateRemovalSnapshot(order.cartRemovalSnapshot);
  const snapshot = order.cartRemovalSnapshot, selection = order.cartSelectionSnapshot;
  if (!selection || selection.cartId !== snapshot.cartId || selection.cartVersion !== snapshot.cartVersion ||
      !Array.isArray(selection.selectedLines) || selection.selectedLines.length !== snapshot.lines.length ||
      selection.selectedLines.some((line,index) => line.lineId !== snapshot.lines[index].lineId ||
        line.lineVersion !== snapshot.lines[index].lineVersion)) fail('INVALID_CART_REMOVAL_SNAPSHOT');
  if (!timestamp(now) || !timestamp(order.createdAt) || now < order.createdAt) fail('INVALID_CONFIGURATION');
  if (cart === null) return freeze({ nextCart: null, changed: false, removedLineIds: [], preservedLineIds: [] });
  validateCart(cart); requireOwner(principal, cart);
  if (cart._id !== snapshot.cartId || cart.storeId !== order.storeId) fail('FORBIDDEN');
  if (cart.version < snapshot.cartVersion || now < cart.updatedAt) fail('VERSION_CONFLICT');
  const selected = new Map(snapshot.lines.map(line => [line.lineId,line]));
  const removedLineIds = [], preservedLineIds = [], remaining = [];
  for (const line of cart.lines) {
    const expected = selected.get(line.lineId);
    if (expected && expected.lineVersion === line.lineVersion && expected.contentFingerprint === contentFingerprint(line)) {
      removedLineIds.push(line.lineId);
    } else {
      if (expected) preservedLineIds.push(line.lineId);
      remaining.push(JSON.parse(JSON.stringify(line)));
    }
  }
  const changed = removedLineIds.length > 0;
  const nextCart = { _id: cart._id, schemaVersion: cart.schemaVersion, ownerId: cart.ownerId, storeId: cart.storeId,
    createdAt: cart.createdAt, version: changed ? cart.version + 1 : cart.version,
    updatedAt: changed ? now : cart.updatedAt, lines: remaining };
  validateCart(nextCart); // Includes overflow guard; no per-line versions changed on removal.
  return freeze({ nextCart, changed, removedLineIds, preservedLineIds });
}
module.exports = { captureCartRemovalSnapshot, validateRemovalSnapshot, planOrderCartSync };
