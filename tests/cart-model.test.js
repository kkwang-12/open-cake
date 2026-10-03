'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { planCartCommand, validateCart } = require('../cloudfunctions/_shared/cart-model');
const { catalog, emptyCart, cartContext } = require('./fixtures/catalog');
const actor = {type:'CUSTOMER',subjectId:'offline-user'};
function code(run, expected) { assert.throws(run, error => error.code === expected); }
function add(cart, message, quantity=1, context=cartContext()) {
  return planCartCommand(cart,'ADD',actor,{expectedVersion:cart.version,selectedOptions:context.selectedOptions,
    skuId:context.skus[0]._id,quantity,cakeMessage:message},context);
}
function update(cart, line, args={}, context=cartContext()) {
  return planCartCommand(cart,'UPDATE',actor,{expectedVersion:cart.version,expectedLineVersion:line.lineVersion,
    lineId:line.lineId,selectedOptions:context.selectedOptions,skuId:line.skuId,quantity:line.quantity,...args},context);
}

test('D03 同 SKU 不同留言共存，同规范化留言合并并保留原 lineId / addedAt', () => {
  let cart = add(emptyCart(),'生日快乐').nextCart;
  cart = add(cart,'谢谢你',1,{...cartContext(),now:3000,newLineId:'offline-line-b'}).nextCart;
  assert.equal(cart.lines.length,2);
  const original = JSON.stringify(cart);
  const result = add(cart,'  生日快乐  ',2,{...cartContext(),now:4000,newLineId:'unused'});
  assert.equal(result.nextCart.lines.length,2);
  assert.equal(result.nextCart.lines[0].quantity,3);
  assert.equal(result.changedLineId,'offline-line-a');
  assert.equal(result.nextCart.lines[0].addedAt,2000);
  assert.equal(result.nextCart.lines[0].lineVersion,1);
  assert.equal(result.nextCart.version,3);
  assert.equal(JSON.stringify(cart),original);
  assert(Object.isFrozen(result.nextCart.lines[0]));
  assert.throws(()=>{result.nextCart.lines[0].cakeMessage='tamper';},TypeError);
});

test('D03 本人 / 门店范围及袋 / 行旧版本拒绝，禁止覆盖竞争写入', () => {
  const cart = add(emptyCart(),'a').nextCart;
  const context = cartContext();
  const args = {expectedVersion:cart.version,selectedOptions:context.selectedOptions,quantity:1};
  for (const badActor of [{type:'CUSTOMER',subjectId:'other'},{type:'STORE',subjectId:cart.ownerId}]) {
    code(()=>planCartCommand(cart,'ADD',badActor,args,context),'FORBIDDEN');
  }
  code(()=>add(cart,'a',1,{...context,product:{...context.product,storeId:'other'}}),'FORBIDDEN');
  code(()=>planCartCommand(cart,'ADD',actor,{...args,expectedVersion:0},context),'VERSION_CONFLICT');
  code(()=>update(cart,cart.lines[0],{expectedLineVersion:1}),'VERSION_CONFLICT');
});

test('D03 满袋可合并现行行但不能加不同留言；合并不能绕过最终数量上限', () => {
  const context = {...cartContext(),limits:{maxLines:1,maxQuantityPerLine:3}};
  const cart = add(emptyCart(),'a',2,context).nextCart;
  assert.equal(add(cart,'a',1,context).nextCart.lines[0].quantity,3);
  code(()=>add(cart,'b',1,{...context,newLineId:'b'}),'CART_LIMIT_EXCEEDED');
  code(()=>add(cart,'a',2,context),'INVALID_QUANTITY');
});

test('D03 修改数量 / 留言保留身份，原值更新不增版本；修改到已有行需显式处理', () => {
  let cart = add(emptyCart(),'a').nextCart;
  const unchanged = update(cart,cart.lines[0]);
  assert.equal(unchanged.changed,false);
  assert.equal(unchanged.nextCart.version,cart.version);
  const changed = update(cart,cart.lines[0],{quantity:2,cakeMessage:'c'},{...cartContext(),now:3000}).nextCart;
  assert.equal(changed.lines[0].lineId,cart.lines[0].lineId);
  assert.equal(changed.lines[0].cakeMessage,'c');
  assert.equal(changed.lines[0].lineVersion,1);
  cart = add(cart,'b',1,{...cartContext(),now:3000,newLineId:'offline-line-b'}).nextCart;
  code(()=>update(cart,cart.lines[0],{cakeMessage:'b'},{...cartContext(),now:4000}),'INVALID_CART_COMMAND');
});

test('D03 下架 / 缺限制仍可移除，不复活已删除行；移除也校验行版本', () => {
  const cart = add(emptyCart(),'a').nextCart;
  const result = planCartCommand(cart,'REMOVE',actor,{expectedVersion:cart.version,lineId:cart.lines[0].lineId,expectedLineVersion:0},{now:3000});
  assert.equal(result.nextCart.lines.length,0);
  code(()=>planCartCommand(result.nextCart,'REMOVE',actor,{expectedVersion:2,lineId:'offline-line-a',expectedLineVersion:0},{now:4000}),'LINE_NOT_FOUND');
  const context = cartContext(); context.product.status='OFF_SALE';
  code(()=>update(cart,cart.lines[0],{quantity:2},context),'PRODUCT_UNAVAILABLE');
  code(()=>add(cart,'b',1,{...cartContext(),limits:null}),'CONFIGURATION_REQUIRED');
});

test('D03 购物袋不保存客户端价格 / 状态 / 私有字段，面包不出现留言步骤', () => {
  const context = cartContext(catalog('BREAD'));
  const cart = {...emptyCart(),privateToken:'must-not-copy'};
  const result = planCartCommand(cart,'ADD',actor,{expectedVersion:0,selectedOptions:[],quantity:1,
    unitPriceCents:1,ownerId:'other',orderStatus:'PAID'},context);
  assert.equal(result.nextCart.lines[0].cakeMessage,null);
  for (const name of ['privateToken','unitPriceCents','orderStatus']) assert(!JSON.stringify(result.nextCart).includes(name));
  assert.equal(result.nextCart.ownerId,'offline-user');
});

test('D03 摘要篡改、重复行 / 合并身份、版本递增溢出和不合法时间拒绝且输入不变', () => {
  const cart = add(emptyCart(),'a').nextCart;
  for (const mutate of [
    value=>{value.lines[0].messageFingerprint='forged';},
    value=>{value.lines.push({...value.lines[0]});},
    value=>{value.lines.push({...value.lines[0],lineId:'different-id'});},
    value=>{value.lines[0].updatedAt=100;}
  ]) { const value=JSON.parse(JSON.stringify(cart)); mutate(value); code(()=>validateCart(value),'INVALID_CART'); }
  const full={...cart,version:Number.MAX_SAFE_INTEGER};
  const before=JSON.stringify(full);
  code(()=>add(full,'a'),'INVALID_CART');
  assert.equal(JSON.stringify(full),before);
  code(()=>add(cart,'a',1,{...cartContext(),now:1}),'INVALID_CART_COMMAND');
});

test('D03 解析后的袋行可直接形成 D02 事实白名单，留言 / 规格 / 金额 / 版本名称一致', () => {
  const {resolveSku} = require('../cloudfunctions/_shared/catalog-model');
  const {captureOrderFacts} = require('../cloudfunctions/_shared/order-facts');
  const {TRADE_POLICY} = require('../cloudfunctions/_shared/trade-model');
  const cat=catalog();
  const sku=resolveSku(cat.product,cat.skus,cat.selectedOptions);
  const cart=add(emptyCart(),'  生日快乐  ',2).nextCart;
  const line=cart.lines[0];
  const output=captureOrderFacts({quoteId:'offline-quote',tradePolicyVersion:TRADE_POLICY.version,fulfillment:'PICKUP',
    cartSelectionSnapshot:{cartId:cart._id,cartVersion:cart.version,selectedLines:[{
      lineId:line.lineId,lineVersion:line.lineVersion,quantity:line.quantity,messageFingerprint:line.messageFingerprint}]},
    storeSnapshot:{storeId:cart.storeId,name:'离线测试门店',address:'仅测试地址',phone:'仅测试电话',timeZone:'Asia/Hong_Kong',configVersion:1},
    contactSnapshot:{name:'仅测试联系人',phone:'仅测试电话'},addressSnapshot:null,
    appointmentSnapshot:{storeId:cart.storeId,slotId:'offline-slot',serviceDate:'2030-01-12',timeZone:'Asia/Hong_Kong',
      startAt:1894435200000,endAt:1894438800000,policyVersion:'offline-time-v1',minLeadTimeMinutes:60},
    deliverySnapshot:{feeCents:0},
    items:[{lineId:line.lineId,productId:line.productId,skuId:line.skuId,productVersion:cat.product.version,skuVersion:sku.version,
      categoryCode:cat.product.categoryCode,productName:cat.product.name,skuDescription:sku.description,
      selectedOptions:sku.selectedOptions,productImage:null,unitPriceCents:sku.unitPriceCents,quantity:line.quantity,cakeMessage:line.cakeMessage}]});
  assert.equal(output.totalCents,2000);
  assert.equal(output.items[0].cakeMessage,'生日快乐');
  assert.deepEqual(output.items[0].selectedOptions,sku.selectedOptions);
  assert.equal(output.cartSelectionSnapshot.selectedLines[0].messageFingerprint,line.messageFingerprint);
  assert.equal(output.addressSnapshot,null);
});
