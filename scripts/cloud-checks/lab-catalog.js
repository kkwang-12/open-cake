'use strict';
// SYNTHETIC SDK LAB ONLY. Never use for merchant catalog data.
const { NORMALIZATION_VERSION } = require('./shared/catalog-model');
function catalog(categoryCode = 'CAKE') {
  const optionGroups = categoryCode === 'CAKE' ? [
    { groupCode: 'SIZE', label: '测试尺寸', required: true, options: [{ optionCode: 'SMALL', label: '测试小尺寸' }, { optionCode: 'LARGE', label: '测试大尺寸' }] },
    { groupCode: 'FLAVOR', label: '测试口味', required: true, options: [{ optionCode: 'A', label: '测试口味 A' }, { optionCode: 'B', label: '测试口味 B' }] }
  ] : categoryCode === 'MINI_CAKE' ? [
    { groupCode: 'PACK', label: '测试组合', required: true, options: [{ optionCode: 'ONE', label: '测试组合一' }] }
  ] : [];
  const selectedOptions = optionGroups.map(group => ({ groupCode: group.groupCode, optionCode: group.options[0].optionCode, label: group.options[0].label }));
  const product = { _id: 'synthetic-product-'+categoryCode, storeId: 'synthetic-store', name: 'SDK合成测试 '+categoryCode,
    version: 1, categoryCode, status: 'ON_SALE', optionGroups, minLeadTimeMinutes: 60,
    messagePolicy: categoryCode === 'CAKE' ? { maxLength: 12, normalizationVersion: NORMALIZATION_VERSION } : null };
  const sku = { _id: 'synthetic-sku-'+categoryCode, productId: product._id, storeId: product.storeId, version: 2,
    status: 'ON_SALE', description: 'SDK合成测试规格', currency: 'CNY', unitPriceCents: 1000,
    minQuantity: 1, maxQuantity: 8, selectedOptions,
    stockRequirements: [{ resourceId: 'synthetic-resource-'+categoryCode, unitsPerItem: 1 }] };
  return { product, skus: [sku], selectedOptions: selectedOptions.map(({groupCode,optionCode}) => ({groupCode,optionCode})) };
}
function emptyCart() {
  return { _id: 'synthetic-cart', schemaVersion: 1, ownerId: 'synthetic-user', storeId: 'synthetic-store',
    version: 0, createdAt: 1000, updatedAt: 1000, lines: [] };
}
function cartContext(cat = catalog()) {
  return { ...cat, limits: { maxLines: 3, maxQuantityPerLine: 6 }, now: 2000, newLineId: 'synthetic-line-a' };
}
module.exports = { catalog, emptyCart, cartContext };
