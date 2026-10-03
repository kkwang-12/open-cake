'use strict';
// OFFLINE TEST ONLY. Not a merchant-approved catalog, app preview or database seed.
const { NORMALIZATION_VERSION } = require('../../cloudfunctions/_shared/catalog-model');
function catalog(categoryCode = 'CAKE') {
  const optionGroups = categoryCode === 'CAKE' ? [
    { groupCode: 'SIZE', label: '测试尺寸', required: true, options: [{ optionCode: 'SMALL', label: '测试小尺寸' }, { optionCode: 'LARGE', label: '测试大尺寸' }] },
    { groupCode: 'FLAVOR', label: '测试口味', required: true, options: [{ optionCode: 'A', label: '测试口味 A' }, { optionCode: 'B', label: '测试口味 B' }] }
  ] : categoryCode === 'MINI_CAKE' ? [
    { groupCode: 'PACK', label: '测试组合', required: true, options: [{ optionCode: 'ONE', label: '测试组合一' }] }
  ] : [];
  const selectedOptions = optionGroups.map(group => ({ groupCode: group.groupCode, optionCode: group.options[0].optionCode, label: group.options[0].label }));
  const product = { _id: 'offline-product-'+categoryCode, storeId: 'offline-store', name: '仅离线测试 '+categoryCode,
    version: 1, categoryCode, status: 'ON_SALE', optionGroups, minLeadTimeMinutes: 60,
    messagePolicy: categoryCode === 'CAKE' ? { maxLength: 12, normalizationVersion: NORMALIZATION_VERSION } : null };
  const sku = { _id: 'offline-sku-'+categoryCode, productId: product._id, storeId: product.storeId, version: 2,
    status: 'ON_SALE', description: '仅离线测试规格', currency: 'CNY', unitPriceCents: 1000,
    minQuantity: 1, maxQuantity: 8, selectedOptions,
    stockRequirements: [{ resourceId: 'offline-resource-'+categoryCode, unitsPerItem: 1 }] };
  return { product, skus: [sku], selectedOptions: selectedOptions.map(({groupCode,optionCode}) => ({groupCode,optionCode})) };
}
function emptyCart() {
  return { _id: 'offline-cart', schemaVersion: 1, ownerId: 'offline-user', storeId: 'offline-store',
    version: 0, createdAt: 1000, updatedAt: 1000, lines: [] };
}
function cartContext(cat = catalog()) {
  return { ...cat, limits: { maxLines: 3, maxQuantityPerLine: 6 }, now: 2000, newLineId: 'offline-line-a' };
}
module.exports = { catalog, emptyCart, cartContext };
