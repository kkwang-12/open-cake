'use strict';
const { NORMALIZATION_VERSION, resolveSku, assertQuantity, normalizeCakeMessage, messageFingerprint } = require('./catalog-model');

const messages = Object.freeze({ INVALID_CART: '购物袋数据无效', FORBIDDEN: '无权操作购物袋',
  VERSION_CONFLICT: '购物袋已更新，请刷新', LINE_NOT_FOUND: '购物袋行不存在',
  CART_LIMIT_EXCEEDED: '购物袋行数已达上限', INVALID_CART_COMMAND: '购物袋操作无效',
  CONFIGURATION_REQUIRED: '经营配置尚未完整' });
class CartModelError extends Error {
  constructor(code) { super(messages[code]); this.name = 'CartModelError'; this.code = code; }
}
function fail(code) { throw new CartModelError(code); }
function plain(value) { return value !== null && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value)); }
function text(value) { return typeof value === 'string' && value.trim().length > 0; }
function integer(value, positive = false) { return Number.isSafeInteger(value) && value >= (positive ? 1 : 0); }
function frozenCart(cart) {
  for (const line of cart.lines) Object.freeze(line);
  Object.freeze(cart.lines);
  return Object.freeze(cart);
}
function copyLine(line) {
  return Object.fromEntries(['lineId','lineVersion','productId','skuId','quantity','cakeMessage','messageFingerprint',
    'normalizationVersion','addedAt','updatedAt'].map(key => [key, line[key]]));
}
function validateCart(cart) {
  if (!plain(cart) || !text(cart._id) || !text(cart.ownerId) || !text(cart.storeId) || cart.schemaVersion !== 1 ||
      !integer(cart.version) || !integer(cart.createdAt, true) || !integer(cart.updatedAt, true) ||
      cart.updatedAt < cart.createdAt || !Array.isArray(cart.lines)) fail('INVALID_CART');
  const ids = new Set(), mergeKeys = new Set();
  for (const line of cart.lines) {
    if (!plain(line) || !text(line.lineId) || ids.has(line.lineId) || !text(line.productId) || !text(line.skuId) ||
        !integer(line.lineVersion) || !integer(line.quantity, true) || !integer(line.addedAt, true) ||
        !integer(line.updatedAt, true) || line.addedAt < cart.createdAt || line.updatedAt < line.addedAt ||
        line.updatedAt > cart.updatedAt || line.normalizationVersion !== NORMALIZATION_VERSION ||
        (line.cakeMessage !== null && (typeof line.cakeMessage !== 'string' || !line.cakeMessage.isWellFormed() ||
          line.cakeMessage !== line.cakeMessage.normalize('NFC').trim())) ||
        line.messageFingerprint !== messageFingerprint(line.cakeMessage, line.normalizationVersion)) fail('INVALID_CART');
    const key = JSON.stringify([line.productId,line.skuId,line.normalizationVersion,line.cakeMessage]);
    if (mergeKeys.has(key)) fail('INVALID_CART');
    ids.add(line.lineId); mergeKeys.add(key);
  }
  return cart;
}
function planCartCommand(cart, command, actor, args, context) {
  validateCart(cart);
  if (!plain(actor) || actor.type !== 'CUSTOMER' || actor.subjectId !== cart.ownerId) fail('FORBIDDEN');
  if (!plain(args) || !plain(context) || !integer(context.now, true) || context.now < cart.updatedAt) fail('INVALID_CART_COMMAND');
  if (!integer(args.expectedVersion) || args.expectedVersion !== cart.version) fail('VERSION_CONFLICT');
  if (!['ADD','UPDATE','REMOVE'].includes(command)) fail('INVALID_CART_COMMAND');
  const lines = cart.lines.map(copyLine);
  let lineIndex = -1, changedLineId;
  if (command !== 'ADD') {
    lineIndex = lines.findIndex(line => line.lineId === args.lineId);
    if (lineIndex < 0) fail('LINE_NOT_FOUND');
    if (!integer(args.expectedLineVersion) || args.expectedLineVersion !== lines[lineIndex].lineVersion) fail('VERSION_CONFLICT');
  }
  if (command === 'REMOVE') {
    changedLineId = lines[lineIndex].lineId;
    lines.splice(lineIndex, 1); // Removal remains possible for unavailable products/configs.
  } else {
    const limits = context.limits;
    if (!plain(limits) || !integer(limits.maxLines, true) || !integer(limits.maxQuantityPerLine, true)) fail('CONFIGURATION_REQUIRED');
    if (!plain(context.product) || context.product.storeId !== cart.storeId) fail('FORBIDDEN');
    const sku = resolveSku(context.product, context.skus, args.selectedOptions, args.skuId);
    if (!integer(args.quantity, true)) fail('INVALID_CART_COMMAND');
    const oldLine = command === 'UPDATE' ? lines[lineIndex] : null;
    if (oldLine && (oldLine.productId !== context.product._id || oldLine.skuId !== sku._id)) fail('INVALID_CART_COMMAND');
    const value = command === 'UPDATE' && !Object.prototype.hasOwnProperty.call(args, 'cakeMessage') ? oldLine.cakeMessage : args.cakeMessage;
    const message = normalizeCakeMessage(value, context.product.messagePolicy);
    const matching = lines.findIndex(line => line.productId === sku.productId && line.skuId === sku._id &&
      line.normalizationVersion === message.normalizationVersion && line.messageFingerprint === message.messageFingerprint &&
      line.cakeMessage === message.cakeMessage);
    if (command === 'ADD') {
      if (matching >= 0) {
        lineIndex = matching;
        const quantity = lines[lineIndex].quantity + args.quantity;
        assertQuantity(quantity, sku, limits.maxQuantityPerLine);
        lines[lineIndex] = { ...lines[lineIndex], quantity, lineVersion: lines[lineIndex].lineVersion + 1, updatedAt: context.now };
        changedLineId = lines[lineIndex].lineId;
      } else {
        assertQuantity(args.quantity, sku, limits.maxQuantityPerLine);
        if (lines.length >= limits.maxLines) fail('CART_LIMIT_EXCEEDED');
        if (!text(context.newLineId) || lines.some(line => line.lineId === context.newLineId)) fail('INVALID_CART_COMMAND');
        changedLineId = context.newLineId;
        lines.push({ lineId: changedLineId, lineVersion: 0, productId: sku.productId, skuId: sku._id,
          quantity: args.quantity, ...message, addedAt: context.now, updatedAt: context.now });
      }
    } else {
      // UPDATE merging two existing lines would obscure their identities. Require explicit remove/add.
      if (matching >= 0 && matching !== lineIndex) fail('INVALID_CART_COMMAND');
      assertQuantity(args.quantity, sku, limits.maxQuantityPerLine);
      if (oldLine.quantity === args.quantity && oldLine.cakeMessage === message.cakeMessage &&
          oldLine.normalizationVersion === message.normalizationVersion) {
        return Object.freeze({ nextCart: frozenCart({ _id: cart._id, schemaVersion: 1, ownerId: cart.ownerId,
          storeId: cart.storeId, version: cart.version, createdAt: cart.createdAt, updatedAt: cart.updatedAt, lines }),
          changedLineId: oldLine.lineId, changed: false });
      }
      lines[lineIndex] = { ...oldLine, quantity: args.quantity, ...message, lineVersion: oldLine.lineVersion + 1, updatedAt: context.now };
      changedLineId = oldLine.lineId;
    }
    // When limits were lowered, ADD/UPDATE may not maintain an oversized bag; REMOVE can repair it.
    if (lines.length > limits.maxLines) fail('CART_LIMIT_EXCEEDED');
  }
  const nextCart = { _id: cart._id, schemaVersion: 1, ownerId: cart.ownerId, storeId: cart.storeId,
    version: cart.version + 1, createdAt: cart.createdAt, updatedAt: context.now, lines };
  validateCart(nextCart); // Also guards version increment overflow without mutating input.
  return Object.freeze({ nextCart: frozenCart(nextCart), changedLineId, changed: true });
}
module.exports = { CartModelError, validateCart, planCartCommand };
