'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { TRADE_POLICY } = require('../cloudfunctions/_shared/trade-model');
const { calculateOrderAmounts, assertOrderAmounts, captureOrderFacts } = require('../cloudfunctions/_shared/order-facts');
function facts(fulfillment = 'DELIVERY') {
  return { quoteId: 'test-quote', tradePolicyVersion: TRADE_POLICY.version, fulfillment,
    cartSelectionSnapshot: { cartId: 'test-cart', cartVersion: 2,
      selectedLines: [{ lineId: 'line-a', lineVersion: 1, quantity: 2, messageFingerprint: 'test-message-digest' }] },
    items: [{ lineId: 'line-a', productId: 'test-product', skuId: 'test-sku', productVersion: 1, skuVersion: 2,
      categoryCode: 'CAKE', productName: '测试蛋糕', skuDescription: '测试规格', unitPriceCents: 23800, quantity: 2,
      selectedOptions: [{ groupCode: 'SIZE', optionCode: 'TEST', label: '测试尺寸' }], cakeMessage: '测试留言',
      productImage: { assetId: 'test-asset', storageRef: 'test-fixture/cake.png', sourceKind: 'DESIGN_PREVIEW', revision: 'test-v1' } }],
    storeSnapshot: { storeId: 'test-store', name: '测试门店', address: '仅离线测试', phone: '测试电话', timeZone: 'Asia/Hong_Kong', configVersion: 3 },
    contactSnapshot: { name: '测试联系人', phone: '测试电话' },
    addressSnapshot: { addressId: 'test-address', receiverName: '测试收件人', phone: '测试电话', province: '测试省', city: '测试市', district: '测试区',
      regionCodes: { province: null, city: null, district: null }, detail: '仅离线测试', location: null },
    appointmentSnapshot: { storeId: 'test-store', slotId: 'test-slot', serviceDate: '2030-01-12', timeZone: 'Asia/Hong_Kong',
      startAt: Date.parse('2030-01-12T06:00:00Z'), endAt: Date.parse('2030-01-12T07:00:00Z'), policyVersion: 'test-time-v1', minLeadTimeMinutes: 60 },
    deliverySnapshot: { ruleId: 'test-delivery', ruleVersion: 1, feeCents: fulfillment === 'PICKUP' ? 0 : 1200,
      evaluationId: 'test-evaluation', addressFingerprint: 'test-address-digest' }, orderNote: '测试订单备注' };
}
function expectCode(run, code) { assert.throws(run, error => error.code === code); }

test('整数分计算多行小计与运费；自提只能为零运费', () => {
  const items = [{ unitPriceCents: 23800, quantity: 2 }, { unitPriceCents: 6800, quantity: 1 }];
  assert.deepEqual(calculateOrderAmounts(items, 1200, 'DELIVERY'), {
    currency: 'CNY', subtotalCents: 54400, deliveryFeeCents: 1200, totalCents: 55600, lineTotalsCents: [47600, 6800] });
  assert.equal(calculateOrderAmounts(items, 0, 'PICKUP').totalCents, 54400);
  expectCode(() => calculateOrderAmounts(items, 1, 'PICKUP'), 'INVALID_ORDER_AMOUNT');
  for (const invalid of [[], [{ unitPriceCents: 1.5, quantity: 1 }], [{ unitPriceCents: 100, quantity: 0 }], [{ unitPriceCents: 100, quantity: 1.5 }]]) {
    expectCode(() => calculateOrderAmounts(invalid, 0, 'PICKUP'), 'INVALID_ORDER_AMOUNT');
  }
});

test('乘法、跨行求和和运费相加溢出均拒绝，不生成失真金额', () => {
  const max = Number.MAX_SAFE_INTEGER;
  expectCode(() => calculateOrderAmounts([{ unitPriceCents: max, quantity: 2 }], 0, 'PICKUP'), 'AMOUNT_OVERFLOW');
  expectCode(() => calculateOrderAmounts([{ unitPriceCents: max, quantity: 1 }, { unitPriceCents: 1, quantity: 1 }], 0, 'PICKUP'), 'AMOUNT_OVERFLOW');
  expectCode(() => calculateOrderAmounts([{ unitPriceCents: max, quantity: 1 }], 1, 'DELIVERY'), 'AMOUNT_OVERFLOW');
  expectCode(() => calculateOrderAmounts([{ unitPriceCents: 100, quantity: 2, lineTotalCents: 1 }], 0, 'PICKUP'), 'ORDER_AMOUNTS_MISMATCH');
});

test('订单小计 / 总额必须与不可变订单行相等，同时维持 D01 退款预算', () => {
  const order = { id: 'order-a', ownerId: 'user-a', storeId: 'store-a', tradePolicyVersion: TRADE_POLICY.version,
    fulfillment: 'DELIVERY', orderStatus: 'PAID', paymentStatus: 'PAID', refundStatus: 'PENDING',
    currency: 'CNY', subtotalCents: 47600, deliveryFeeCents: 1200, totalCents: 48800,
    paidCents: 48800, refundedCents: 10000, refundReservedCents: 20000, version: 1 };
  const items = [{ unitPriceCents: 23800, quantity: 2 }];
  assert.equal(assertOrderAmounts(order, items).totalCents, 48800);
  expectCode(() => assertOrderAmounts({ ...order, subtotalCents: 1 }, items), 'ORDER_AMOUNTS_MISMATCH');
  expectCode(() => assertOrderAmounts({ ...order, refundReservedCents: 40000 }, items), 'INVALID_TRADE_MODEL');
});

test('商品、图片、地址、门店、预约、费用规则与逐行留言完全脱离源对象', () => {
  const input = facts();
  const captured = captureOrderFacts(input);
  const originalJSON = JSON.stringify(captured);
  input.items[0].productName = '新商品名'; input.items[0].unitPriceCents = 1;
  input.items[0].cakeMessage = '新留言'; input.items[0].selectedOptions[0].label = '新规格';
  input.items[0].productImage.storageRef = 'new-asset'; input.addressSnapshot.detail = '新地址';
  input.storeSnapshot.address = '新门店地址'; input.appointmentSnapshot.startAt = 1;
  input.deliverySnapshot.feeCents = 1; input.cartSelectionSnapshot.selectedLines[0].quantity = 1;
  assert.equal(JSON.stringify(captured), originalJSON);
  assert(Object.isFrozen(captured.items[0].productImage));
  assert(Object.isFrozen(captured.cartSelectionSnapshot.selectedLines));
  assert.throws(() => { captured.items[0].productName = '非法修改'; }, TypeError);
  assert.equal(captured.items[0].lineTotalCents, 47600);
  assert.equal(captured.totalCents, 48800);
});

test('快照按字段白名单保存；自提不保存配送地址或范围评估，备注与留言分别保留', () => {
  const input = facts('PICKUP');
  input.accessToken = 'must-not-copy'; input.storeSnapshot.privateCredential = 'must-not-copy';
  input.items[0].internalCostCents = 1; input.contactSnapshot.identityKey = 'must-not-copy';
  const captured = captureOrderFacts(input);
  assert.equal(captured.addressSnapshot, null);
  assert.equal(captured.deliverySnapshot.evaluationId, null);
  assert.equal(captured.deliveryFeeCents, 0);
  assert(!JSON.stringify(captured).includes('must-not-copy'));
  assert(!('internalCostCents' in captured.items[0]));
  assert.equal(captured.orderNote, '测试订单备注');
  assert.equal(captured.items[0].cakeMessage, '测试留言');
});

test('跨门店时段、错行数量、重复行、缺地址与无效 JSON 输入不能成为订单事实', () => {
  for (const mutate of [
    input => { input.appointmentSnapshot.storeId = 'other-store'; },
    input => { input.appointmentSnapshot.endAt = input.appointmentSnapshot.startAt; },
    input => { input.cartSelectionSnapshot.selectedLines[0].quantity = 1; },
    input => { input.items.push(input.items[0]); },
    input => { input.addressSnapshot = null; },
    input => { input.addressSnapshot.regionCodes.province = undefined; },
    input => { input.items[0].selectedOptions[0].label = new Date(); }
  ]) {
    const input = facts(); mutate(input);
    expectCode(() => captureOrderFacts(input), 'INVALID_ORDER_FACTS');
  }
});
