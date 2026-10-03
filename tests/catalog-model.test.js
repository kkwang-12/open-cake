'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveSku, assertQuantity, normalizeCakeMessage, aggregateStockRequirements, NORMALIZATION_VERSION } = require('../cloudfunctions/_shared/catalog-model');
const { catalog } = require('./fixtures/catalog');
function code(run, expected) { assert.throws(run, error => error.code === expected); }
function resolve(cat, options = cat.selectedOptions, id) { return resolveSku(cat.product, cat.skus, options, id); }

test('D03 三分类明确 SKU 可解析；面包无蛋糕规格 / 留言，价格只取可信配置', () => {
  for (const category of ['CAKE','MINI_CAKE','BREAD']) {
    const cat = catalog(category);
    const chosen = resolve(cat, cat.selectedOptions.map(option => ({...option,label:'伪造文案',unitPriceCents:1})));
    assert.equal(chosen._id, cat.skus[0]._id);
    assert.equal(chosen.unitPriceCents, 1000);
    assert(Object.isFrozen(chosen.stockRequirements[0]));
    if (category === 'BREAD') {
      assert.deepEqual(chosen.selectedOptions, []);
      assert.equal(normalizeCakeMessage(undefined, cat.product.messagePolicy).cakeMessage, null);
      code(() => normalizeCakeMessage('蛋糕留言', cat.product.messagePolicy), 'MESSAGE_NOT_SUPPORTED');
    }
  }
});

test('D03 未配置组合、缺必选 / 重复 / 非法组选项均拒绝；不能保留切尺寸后的旧 SKU', () => {
  const cat = catalog();
  for (const selection of [[], [{groupCode:'SIZE',optionCode:'NO'}], [...cat.selectedOptions,cat.selectedOptions[0]], [{groupCode:'UNKNOWN',optionCode:'A'}]]) {
    code(() => resolve(cat, selection), 'INVALID_SELECTION');
  }
  const unsupported = cat.selectedOptions.map(option => option.groupCode === 'SIZE' ? {...option,optionCode:'LARGE'} : option);
  code(() => resolve(cat, unsupported), 'SKU_UNAVAILABLE');
  code(() => resolve(cat, cat.selectedOptions, 'old-client-sku'), 'SKU_SELECTION_MISMATCH');
});

test('D03 重复 SKU 组合 / ID、跨店 SKU、错误币种与倒置数量配置不会选第一条放行', () => {
  for (const mutate of [
    cat => { cat.skus.push({...cat.skus[0],_id:'duplicate-combination'}); },
    cat => { cat.skus.push({...cat.skus[0]}); },
    cat => { cat.skus[0].storeId = 'other-store'; },
    cat => { cat.skus[0].currency = 'USD'; },
    cat => { cat.skus[0].minQuantity = 9; }
  ]) { const cat = catalog(); mutate(cat); code(() => resolve(cat), 'INVALID_CATALOG'); }
});

test('D03 草稿、下架和缺经营值均不可买；不会为正式价格 / 数量 / 资源 / 留言填默认', () => {
  const cat = catalog(); cat.product.status = 'DRAFT'; code(() => resolve(cat), 'PRODUCT_UNAVAILABLE');
  const off = catalog(); off.skus[0].status = 'OFF_SALE'; code(() => resolve(off), 'SKU_UNAVAILABLE');
  for (const mutate of [
    value => { value.skus[0].unitPriceCents = null; },
    value => { value.skus[0].maxQuantity = null; },
    value => { value.skus[0].stockRequirements = []; },
    value => { value.product.minLeadTimeMinutes = null; },
    value => { value.product.messagePolicy.maxLength = null; }
  ]) { const value = catalog(); mutate(value); code(() => resolve(value), 'CONFIGURATION_REQUIRED'); }
});

test('D03 可选规格只接受真实 SKU，客户端顺序 / 文案不影响权威选项', () => {
  const cat = catalog();
  cat.product.optionGroups[1].required = false;
  cat.skus[0].selectedOptions = cat.skus[0].selectedOptions.slice(0,1);
  const result = resolve(cat, [cat.selectedOptions[0]]);
  assert.equal(result.selectedOptions.length, 1);
  code(() => resolve(cat), 'SKU_UNAVAILABLE');
  const original = catalog();
  assert.deepEqual(resolve(original, original.selectedOptions.slice().reverse()).selectedOptions, original.skus[0].selectedOptions);
});

test('D03 留言按 NFC / 首尾空白 / Unicode 码点规范化；null、空串、大小写与内部空白保持区别', () => {
  const policy = {maxLength:3,normalizationVersion:NORMALIZATION_VERSION};
  const decomposed = normalizeCakeMessage('  e\u0301😀  ',policy);
  assert.equal(decomposed.cakeMessage,'é😀');
  assert.equal(decomposed.messageFingerprint,normalizeCakeMessage('é😀',policy).messageFingerprint);
  assert.notEqual(normalizeCakeMessage(undefined,null).messageFingerprint,normalizeCakeMessage('',policy).messageFingerprint);
  assert.notEqual(normalizeCakeMessage('A B',policy).messageFingerprint,normalizeCakeMessage('a B',policy).messageFingerprint);
  code(() => normalizeCakeMessage('😀😀😀😀',policy),'INVALID_MESSAGE');
  code(() => normalizeCakeMessage('\ud800',policy),'INVALID_MESSAGE');
  code(() => normalizeCakeMessage(null,policy),'INVALID_MESSAGE');
  code(() => normalizeCakeMessage('x',{...policy,normalizationVersion:'unknown'}),'NORMALIZATION_UNSUPPORTED');
});

test('D03 SKU 与门店数量上限同时生效，拒绝非整数 / 负数 / 溢出并明确最低数量', () => {
  const sku = resolve(catalog());
  assertQuantity(6,sku,6);
  for (const value of [0,-1,1.1,NaN,Infinity,7,Number.MAX_SAFE_INTEGER+1]) code(() => assertQuantity(value,sku,6),'INVALID_QUANTITY');
  code(() => assertQuantity(1,{...sku,minQuantity:2},6),'INVALID_QUANTITY');
  code(() => assertQuantity(1,sku,null),'CONFIGURATION_REQUIRED');
});

test('D03 独立 / 共享资源按整袋聚合；重复需求、跨店和乘法 / 求和溢出拒绝，不占资源', () => {
  const one = resolve(catalog());
  const two = {...one,_id:'offline-other-sku',stockRequirements:[{resourceId:one.stockRequirements[0].resourceId,unitsPerItem:2}]};
  const input = [{sku:one,quantity:2},{sku:two,quantity:3}];
  const before = JSON.stringify(input);
  assert.deepEqual(aggregateStockRequirements(input),[{resourceId:'offline-resource-CAKE',requiredUnits:8}]);
  assert.equal(JSON.stringify(input),before);
  const bread = resolve(catalog('BREAD'));
  assert.equal(aggregateStockRequirements([{sku:one,quantity:1},{sku:bread,quantity:1}]).length,2);
  code(() => aggregateStockRequirements([{sku:{...one,storeId:'other'},quantity:1},{sku:bread,quantity:1}]),'INVALID_CATALOG');
  code(() => aggregateStockRequirements([{sku:{...one,stockRequirements:[one.stockRequirements[0],one.stockRequirements[0]]},quantity:1}]),'INVALID_CATALOG');
  code(() => aggregateStockRequirements([{sku:one,quantity:Number.MAX_SAFE_INTEGER},{sku:two,quantity:1}]),'RESOURCE_OVERFLOW');
  code(() => aggregateStockRequirements([{sku:two,quantity:Number.MAX_SAFE_INTEGER}]),'RESOURCE_OVERFLOW');
});

test('D03 稀疏或非 JSON 资源需求 / 选项拒绝为领域错误，无法跳过配置校验', () => {
  const cat = catalog(); cat.skus[0].stockRequirements = new Array(1);
  code(()=>resolve(cat),'INVALID_CATALOG');
  const other = catalog(); other.selectedOptions = new Array(1);
  code(()=>resolve(other),'INVALID_SELECTION');
  const bad=catalog(); bad.product.optionGroups[0].options.push({optionCode:'SMALL',label:'重复'});
  code(()=>resolve(bad),'INVALID_CATALOG');
});
