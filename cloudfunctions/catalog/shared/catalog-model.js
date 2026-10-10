'use strict';
const { createHash } = require('node:crypto');

// Pure, server-side D03 models. No database, inventory hold or published seed.
const CATEGORIES = Object.freeze(['CAKE', 'MINI_CAKE', 'BREAD']);
const NORMALIZATION_VERSION = 'unicode-nfc-trim-codepoints-v1';
const messages = Object.freeze({
  INVALID_CATALOG: '商品配置无效', PRODUCT_UNAVAILABLE: '商品暂不可购买',
  INVALID_SELECTION: '规格选择无效', SKU_UNAVAILABLE: '该规格暂不可购买',
  SKU_SELECTION_MISMATCH: '规格已变化，请重新选择', CONFIGURATION_REQUIRED: '经营配置尚未完整',
  INVALID_QUANTITY: '数量无效', MESSAGE_NOT_SUPPORTED: '此商品不支持蛋糕留言',
  INVALID_MESSAGE: '留言无效或过长', NORMALIZATION_UNSUPPORTED: '留言规则版本不支持',
  RESOURCE_OVERFLOW: '资源需求超出可处理范围'
});
class CatalogModelError extends Error {
  constructor(code) { super(messages[code]); this.name = 'CatalogModelError'; this.code = code; }
}
function fail(code) { throw new CatalogModelError(code); }
function plain(value) {
  return value !== null && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}
function text(value) { return typeof value === 'string' && value.trim().length > 0; }
function integer(value, positive = false) { return Number.isSafeInteger(value) && value >= (positive ? 1 : 0); }
function freeze(value) {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function optionKey(options) {
  return JSON.stringify(options.map(option => [option.groupCode, option.optionCode])
    .sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}
function optionGroups(product) {
  if (!Array.isArray(product.optionGroups)) fail('INVALID_CATALOG');
  const groups = new Map();
  for (const group of product.optionGroups) {
    if (!plain(group) || !text(group.groupCode) || !text(group.label) || typeof group.required !== 'boolean' ||
        !Array.isArray(group.options) || !group.options.length || groups.has(group.groupCode)) fail('INVALID_CATALOG');
    const options = new Map();
    for (const option of group.options) {
      if (!plain(option) || !text(option.optionCode) || !text(option.label) || options.has(option.optionCode)) fail('INVALID_CATALOG');
      options.set(option.optionCode, option.label);
    }
    groups.set(group.groupCode, { required: group.required, options });
  }
  return groups;
}
function selectionFor(groups, selection, code) {
  if (!Array.isArray(selection)) fail(code);
  const seen = new Set(), result = [];
  for (const option of selection) {
    if (!plain(option) || !text(option.groupCode) || !text(option.optionCode) || seen.has(option.groupCode)) fail(code);
    const group = groups.get(option.groupCode);
    if (!group || !group.options.has(option.optionCode)) fail(code);
    seen.add(option.groupCode);
    result.push({ groupCode: option.groupCode, optionCode: option.optionCode, label: group.options.get(option.optionCode) });
  }
  for (const [groupCode, group] of groups) if (group.required && !seen.has(groupCode)) fail(code);
  // Follow configured group order. Client labels and ordering are not authority.
  return [...groups.keys()].flatMap(code => result.filter(option => option.groupCode === code));
}
function stockRequirements(sku) {
  if (!Array.isArray(sku.stockRequirements) || !sku.stockRequirements.length) fail('CONFIGURATION_REQUIRED');
  const seen = new Set();
  return Array.from(sku.stockRequirements, requirement => {
    if (!plain(requirement) || !text(requirement.resourceId) || !integer(requirement.unitsPerItem, true) ||
        seen.has(requirement.resourceId)) fail('INVALID_CATALOG');
    seen.add(requirement.resourceId);
    return { resourceId: requirement.resourceId, unitsPerItem: requirement.unitsPerItem };
  });
}
function assertSaleConfiguration(product, sku) {
  if (!integer(product.minLeadTimeMinutes) || !integer(sku.unitPriceCents, true) ||
      !integer(sku.minQuantity, true) || !integer(sku.maxQuantity, true)) fail('CONFIGURATION_REQUIRED');
  if (sku.maxQuantity < sku.minQuantity || sku.currency !== 'CNY') fail('INVALID_CATALOG');
  stockRequirements(sku);
  if (product.messagePolicy !== null) {
    if (product.categoryCode === 'BREAD') fail('INVALID_CATALOG');
    if (!plain(product.messagePolicy) || !integer(product.messagePolicy.maxLength, true) ||
        !text(product.messagePolicy.normalizationVersion)) fail('CONFIGURATION_REQUIRED');
    if (product.messagePolicy.normalizationVersion !== NORMALIZATION_VERSION) fail('NORMALIZATION_UNSUPPORTED');
  }
}
function resolveSku(product, skus, selection, requestedSkuId) {
  if (!plain(product) || !text(product._id) || !text(product.storeId) || !text(product.name) ||
      !integer(product.version) || !CATEGORIES.includes(product.categoryCode)) fail('INVALID_CATALOG');
  if (product.status !== 'ON_SALE') fail('PRODUCT_UNAVAILABLE');
  const groups = optionGroups(product);
  const selectedOptions = selectionFor(groups, selection, 'INVALID_SELECTION');
  if (!Array.isArray(skus)) fail('INVALID_CATALOG');
  const ids = new Set(), keys = new Set();
  let match;
  for (const sku of skus) {
    if (!plain(sku) || !text(sku._id) || ids.has(sku._id) || sku.productId !== product._id ||
        sku.storeId !== product.storeId || !integer(sku.version) || !text(sku.description) ||
        !['DRAFT', 'ON_SALE', 'OFF_SALE', 'ARCHIVED'].includes(sku.status)) fail('INVALID_CATALOG');
    ids.add(sku._id);
    if (sku.status === 'ARCHIVED') continue;
    const options = selectionFor(groups, sku.selectedOptions, 'INVALID_CATALOG');
    const key = optionKey(options);
    if (keys.has(key)) fail('INVALID_CATALOG');
    keys.add(key);
    if (key === optionKey(selectedOptions)) match = sku;
  }
  if (!match || match.status !== 'ON_SALE') fail('SKU_UNAVAILABLE');
  if (requestedSkuId !== undefined && requestedSkuId !== match._id) fail('SKU_SELECTION_MISMATCH');
  assertSaleConfiguration(product, match);
  return freeze({ _id: match._id, productId: product._id, storeId: product.storeId, version: match.version,
    description: match.description, currency: 'CNY', unitPriceCents: match.unitPriceCents,
    minQuantity: match.minQuantity, maxQuantity: match.maxQuantity, selectedOptions,
    stockRequirements: stockRequirements(match) });
}
function assertQuantity(quantity, sku, maxQuantityPerLine) {
  if (!integer(maxQuantityPerLine, true)) fail('CONFIGURATION_REQUIRED');
  if (!plain(sku) || !integer(sku.minQuantity, true) || !integer(sku.maxQuantity, true) || sku.minQuantity > sku.maxQuantity) fail('INVALID_CATALOG');
  if (!integer(quantity, true) || quantity < sku.minQuantity || quantity > Math.min(sku.maxQuantity, maxQuantityPerLine)) fail('INVALID_QUANTITY');
}
function messageFingerprint(cakeMessage, normalizationVersion = NORMALIZATION_VERSION) {
  if (normalizationVersion !== NORMALIZATION_VERSION) fail('NORMALIZATION_UNSUPPORTED');
  if (cakeMessage !== null && typeof cakeMessage !== 'string') fail('INVALID_MESSAGE');
  return createHash('sha256').update(JSON.stringify([normalizationVersion, cakeMessage])).digest('hex');
}
function normalizeCakeMessage(value, policy) {
  let cakeMessage;
  if (policy === null) {
    if (value !== undefined && value !== null) fail('MESSAGE_NOT_SUPPORTED');
    cakeMessage = null;
  } else {
    if (!plain(policy) || !integer(policy.maxLength, true) || !text(policy.normalizationVersion)) fail('CONFIGURATION_REQUIRED');
    if (policy.normalizationVersion !== NORMALIZATION_VERSION) fail('NORMALIZATION_UNSUPPORTED');
    if (value === undefined) value = '';
    if (typeof value !== 'string' || !value.isWellFormed()) fail('INVALID_MESSAGE');
    cakeMessage = value.normalize('NFC').trim();
    if (Array.from(cakeMessage).length > policy.maxLength) fail('INVALID_MESSAGE');
  }
  return freeze({ cakeMessage, normalizationVersion: NORMALIZATION_VERSION, messageFingerprint: messageFingerprint(cakeMessage) });
}
function aggregateStockRequirements(lines) {
  if (!Array.isArray(lines) || !lines.length) fail('INVALID_CATALOG');
  let storeId;
  const demands = new Map();
  for (const line of lines) {
    if (!plain(line) || !plain(line.sku) || !text(line.sku.storeId)) fail('INVALID_CATALOG');
    if (storeId !== undefined && storeId !== line.sku.storeId) fail('INVALID_CATALOG');
    storeId = line.sku.storeId;
    if (!integer(line.quantity, true)) fail('INVALID_QUANTITY');
    for (const requirement of stockRequirements(line.sku)) {
      const demand = requirement.unitsPerItem * line.quantity;
      const requiredUnits = (demands.get(requirement.resourceId) || 0) + demand;
      if (!integer(demand, true) || !integer(requiredUnits, true)) fail('RESOURCE_OVERFLOW');
      demands.set(requirement.resourceId, requiredUnits);
    }
  }
  return freeze([...demands].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([resourceId, requiredUnits]) => ({ resourceId, requiredUnits })));
}
module.exports = { CATEGORIES, NORMALIZATION_VERSION, CatalogModelError, resolveSku, assertQuantity,
  normalizeCakeMessage, messageFingerprint, aggregateStockRequirements };
