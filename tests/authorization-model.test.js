'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  CAPABILITIES, identityFromPlatform, resolveCustomer, requireOwner,
  requireStoreCapability, planUserOrderCommand
} = require('../cloudfunctions/_shared/authorization-model');
const { TRADE_POLICY } = require('../cloudfunctions/_shared/trade-model');
const { planCartCommand } = require('../cloudfunctions/_shared/cart-model');
const { emptyCart, cartContext } = require('./fixtures/catalog');
const settings = { appId: 'wx-offline', environment: 'offline-dev', stage: 'development' };
const context = { APPID: settings.appId, ENV: settings.environment, OPENID: 'offline-a' };
function user(ctx = context, cfg = settings) {
  return { ...identityFromPlatform(ctx, cfg), schemaVersion: 1, version: 2, status: 'ACTIVE' };
}
function customer(ctx = context, cfg = settings) { return resolveCustomer(ctx, cfg, user(ctx, cfg)); }
function role(principal, overrides = {}) {
  return { _id: 'offline-role', schemaVersion: 1, version: 3, subjectId: principal.subjectId,
    storeIds: ['offline-store'], capabilities: [...CAPABILITIES], status: 'ACTIVE', revokedAt: null, ...overrides };
}
function order(principal, overrides = {}) {
  return { id: 'offline-order', ownerId: principal.subjectId, storeId: 'offline-store',
    tradePolicyVersion: TRADE_POLICY.version, version: 1, fulfillment: 'PICKUP',
    orderStatus: 'PAID', paymentStatus: 'PAID', refundStatus: 'NONE',
    currency: 'CNY', totalCents: 1000, paidCents: 1000, refundedCents: 0, refundReservedCents: 0, ...overrides };
}
function code(run, expected) { assert.throws(run, error => error.code === expected); }

test('D06 可信平台元组完整哈希；同人稳定，环境 / AppID / OPENID 隔离且分帧无歧义', () => {
  const value = identityFromPlatform(context, settings);
  assert.match(value._id, /^[a-f0-9]{64}$/);
  assert.deepEqual(value, identityFromPlatform({ ...context }, { ...settings }));
  const otherEnv = { ...settings, environment: 'offline-test' };
  const otherApp = { ...settings, appId: 'wx-other' };
  assert.notEqual(value._id, identityFromPlatform({ ...context, ENV: otherEnv.environment }, otherEnv)._id);
  assert.notEqual(value._id, identityFromPlatform({ ...context, APPID: otherApp.appId }, otherApp)._id);
  assert.notEqual(value._id, identityFromPlatform({ ...context, OPENID: 'offline-b' }, settings)._id);
  const first = identityFromPlatform({ APPID: 'a:b', OPENID: 'c', ENV: 'e' },
    { appId: 'a:b', environment: 'e', stage: 'test' });
  const second = identityFromPlatform({ APPID: 'a', OPENID: 'b:c', ENV: 'e' },
    { appId: 'a', environment: 'e', stage: 'test' });
  assert.notEqual(first._id, second._id);
});

test('D06 缺平台身份 / 错应用 / 错环境 / 错配置均关闭访问，报错不含隐私', () => {
  for (const [ctx, cfg, expected] of [
    [{}, settings, 'AUTH_REQUIRED'], [{ ...context, OPENID: ' ' }, settings, 'AUTH_REQUIRED'],
    [{ ...context, APPID: 'evil' }, settings, 'APP_MISMATCH'],
    [{ ...context, ENV: 'production' }, settings, 'ENV_MISMATCH'],
    [context, {}, 'INVALID_CONFIGURATION'], [context, { ...settings, stage: 'unknown' }, 'INVALID_CONFIGURATION']
  ]) {
    code(() => identityFromPlatform(ctx, cfg), expected);
  }
  assert.throws(() => resolveCustomer(context, settings, { ...user(), openId: 'private-victim' }),
    error => error.code === 'INVALID_USER_RECORD' && !error.message.includes('private-victim'));
});

test('D06 已持久化的用户必须匹配平台元组与稳定主键，缺用户不伪造登录成功', () => {
  code(() => resolveCustomer(context, settings, null), 'USER_NOT_PROVISIONED');
  for (const patch of [{ _id: 'trace-16' }, { environment: 'other' }, { appId: 'other' },
    { openId: 'other' }, { schemaVersion: 2 }, { version: -1 }, { status: 'ADMIN' }]) {
    code(() => resolveCustomer(context, settings, { ...user(), ...patch }), 'INVALID_USER_RECORD');
  }
  code(() => resolveCustomer(context, settings, { ...user(), status: 'DISABLED' }), 'USER_DISABLED');
});

test('D06 principal 白名单不含平台键或客户端权限，复制 / 自造 / SYSTEM 对象不能当凭证', () => {
  const record = { ...user(), role: 'admin', capabilities: [...CAPABILITIES], pin: '246810' };
  const principal = resolveCustomer(context, settings, record);
  assert.deepEqual(Object.keys(principal).sort(),
    ['appId', 'environment', 'subjectId', 'type', 'userVersion'].sort());
  assert(Object.isFrozen(principal));
  for (const forged of [{ ...principal }, JSON.parse(JSON.stringify(principal)),
    { type: 'SYSTEM', capabilities: ['PAYMENT_EVIDENCE'] }, null]) {
    code(() => requireOwner(forged, { ownerId: principal.subjectId }), 'AUTH_REQUIRED');
  }
  record.status = 'DISABLED';
  assert.equal(principal.type, 'CUSTOMER'); // Immutable snapshot; next request must reload user.
  code(() => resolveCustomer(context, settings, record), 'USER_DISABLED');
});

test('D06 本人地址 / 袋 / 收藏 / 报价 / 订单以 ownerId 隔离，他人 ID 不授权', () => {
  const a = customer();
  const b = customer({ ...context, OPENID: 'offline-b' });
  for (const kind of ['address', 'cart', 'favorite', 'quote', 'order']) {
    const record = { _id: kind, ownerId: a.subjectId };
    assert.equal(requireOwner(a, record).subjectId, a.subjectId);
    code(() => requireOwner(b, record), 'FORBIDDEN');
  }
  code(() => requireOwner(a, {}), 'INVALID_AUTHORIZATION_INPUT');
});

test('D06 门店角色须同时命中 subject / 门店 / 能力，返回仅该操作的最小范围', () => {
  const a = customer();
  const grant = role(a, { storeIds: ['offline-store', 'store-b'] });
  const actor = requireStoreCapability(a, [grant], 'offline-store', ['CATALOG_WRITE']);
  assert.deepEqual(actor.storeIds, ['offline-store']);
  assert.deepEqual(actor.capabilities, ['CATALOG_WRITE']);
  assert.deepEqual(actor.grant, { roleId: grant._id, roleVersion: 3, userVersion: 2 });
  assert(Object.isFrozen(actor.grant));
  code(() => requireStoreCapability(a, [grant], 'store-c', ['CATALOG_WRITE']), 'FORBIDDEN');
  code(() => requireStoreCapability(a, [role(a, { subjectId: 'other' })],
    'offline-store', ['CATALOG_WRITE']), 'FORBIDDEN');
  code(() => requireStoreCapability(a, [role(a, { capabilities: ['ORDER_OPERATE'] })],
    'offline-store', ['REFUND_APPROVE']), 'FORBIDDEN');
});

test('D06 跨门店与拆分授权不合并能力；要求同一当前授权记录满足全部权限', () => {
  const a = customer();
  const first = role(a, { _id: 'r1', capabilities: ['ORDER_OPERATE'] });
  const second = role(a, { _id: 'r2', storeIds: ['store-b'], capabilities: ['REFUND_APPROVE'] });
  code(() => requireStoreCapability(a, [first, second], 'offline-store',
    ['ORDER_OPERATE', 'REFUND_APPROVE']), 'FORBIDDEN');
  second.storeIds = ['offline-store'];
  code(() => requireStoreCapability(a, [first, second], 'offline-store',
    ['ORDER_OPERATE', 'REFUND_APPROVE']), 'FORBIDDEN');
});

test('D06 每次传入最新授权，撤销 / 缩小门店 / 移除能力后拒绝下一次敏感操作', () => {
  const a = customer();
  const grant = role(a);
  assert.equal(requireStoreCapability(a, [grant], 'offline-store', ['CONFIG_WRITE']).type, 'STORE');
  for (const patch of [
    { status: 'REVOKED', revokedAt: 1000 }, { storeIds: ['other'] }, { capabilities: ['CATALOG_WRITE'] }
  ]) {
    code(() => requireStoreCapability(a, [{ ...grant, version: 4, ...patch }],
      'offline-store', ['CONFIG_WRITE']), 'FORBIDDEN');
  }
  code(() => requireStoreCapability(a, [], 'offline-store', ['CONFIG_WRITE']), 'FORBIDDEN');
});

test('D06 非法授权 / 空或未知权限拒绝，不用 wildcard 或空列表放行', () => {
  const a = customer();
  for (const patch of [{ storeIds: [] }, { storeIds: ['offline-store', 'offline-store'] },
    { capabilities: ['*'] }, { capabilities: ['ORDER_OPERATE', 'ORDER_OPERATE'] },
    { status: 'ACTIVE', revokedAt: 1000 }, { status: 'REVOKED', revokedAt: null },
    { version: -1 }, { schemaVersion: 2 }]) {
    code(() => requireStoreCapability(a, [role(a, patch)], 'offline-store',
      ['ORDER_OPERATE']), 'INVALID_ROLE_RECORD');
  }
  code(() => requireStoreCapability(a, [role(a), role(a, { status: 'REVOKED', revokedAt: 1000 })],
    'offline-store', ['ORDER_OPERATE']), 'INVALID_ROLE_RECORD');
  for (const capabilities of [[], ['UNKNOWN'], ['ORDER_OPERATE', 'ORDER_OPERATE'], new Array(1)]) {
    code(() => requireStoreCapability(a, [role(a)], 'offline-store', capabilities), 'INVALID_AUTHORIZATION_INPUT');
  }
  code(() => requireStoreCapability(a, new Array(1), 'offline-store', ['ORDER_OPERATE']),
    'INVALID_AUTHORIZATION_INPUT');
});

test('D06 用户入口不能伪造系统付款 / 过期权限，角色或请求参数不能自提权', () => {
  const a = customer();
  for (const command of ['PAYMENT_CONFIRMED', 'ORDER_EXPIRY', 'constructor', '__proto__']) {
    code(() => planUserOrderCommand(order(a), command, a, [role(a)],
      { type: 'SYSTEM', capabilities: ['PAYMENT_EVIDENCE'], role: 'admin', amountCents: 1000, currency: 'CNY' }), 'FORBIDDEN');
  }
  code(() => planUserOrderCommand(order(a), 'ACCEPT', a, [],
    { role: 'admin', storeIds: ['offline-store'], capabilities: [...CAPABILITIES] }), 'FORBIDDEN');
});

test('D06 订单履约操作复用 D01；目录 / 配置 / 角色 / 审计能力不能操作订单', () => {
  const a = customer();
  const owned = order(a);
  assert.equal(planUserOrderCommand(owned, 'ACCEPT', a,
    [role(a, { capabilities: ['ORDER_OPERATE'] })]).nextOrderStatus, 'ACCEPTED');
  for (const capability of ['CATALOG_WRITE', 'CONFIG_WRITE', 'ROLE_MANAGE', 'AUDIT_READ']) {
    code(() => planUserOrderCommand(owned, 'ACCEPT', a,
      [role(a, { capabilities: [capability] })]), 'FORBIDDEN');
  }
  code(() => planUserOrderCommand(owned, 'START_MAKING', a, [role(a)]), 'INVALID_TRANSITION');
  code(() => planUserOrderCommand(owned, 'ACCEPT', a, [role(a)], { expectedVersion: 0 }), 'VERSION_CONFLICT');
});

test('D06 取消批准 / 商家拒单要求履约加退款能力，零退款也不绕过审批权限', () => {
  const a = customer();
  const owned = order(a);
  const review = { id: 'offline-review', orderId: owned.id, ownerId: a.subjectId, status: 'PENDING' };
  const onlyOrder = [role(a, { capabilities: ['ORDER_OPERATE'] })];
  const both = [role(a, { capabilities: ['ORDER_OPERATE', 'REFUND_APPROVE'] })];
  code(() => planUserOrderCommand(owned, 'APPROVE_CANCELLATION', a, onlyOrder,
    { review, refundCents: 0 }), 'FORBIDDEN');
  code(() => planUserOrderCommand(owned, 'REJECT_ORDER', a, onlyOrder), 'FORBIDDEN');
  assert.equal(planUserOrderCommand(owned, 'APPROVE_CANCELLATION', a, both,
    { review, refundCents: 0 }).nextOrderStatus, 'CANCELLED');
  assert.equal(planUserOrderCommand(owned, 'REJECT_ORDER', a, both).refundCents, 1000);
  assert.equal(planUserOrderCommand(owned, 'APPROVE_REFUND', a,
    [role(a, { capabilities: ['REFUND_APPROVE'] })], { refundCents: 500 }).refundCents, 500);
});

test('D06 顾客只能申请本人取消 / 确认本人配送；不能完成自提核销', () => {
  const a = customer();
  const b = customer({ ...context, OPENID: 'offline-b' });
  assert.equal(planUserOrderCommand(order(a), 'REQUEST_CANCELLATION', a, []).nextOrderStatus, 'PAID');
  code(() => planUserOrderCommand(order(a), 'REQUEST_CANCELLATION', b, []), 'FORBIDDEN');
  assert.equal(planUserOrderCommand(order(a, { orderStatus: 'DELIVERING', fulfillment: 'DELIVERY' }),
    'COMPLETE_DELIVERY', a, []).nextOrderStatus, 'COMPLETED');
  code(() => planUserOrderCommand(order(a, { orderStatus: 'READY' }), 'COMPLETE_PICKUP', a, []), 'FORBIDDEN');
});

test('D06 可信 owner actor 可接 D03；他人袋被拦截，参数伪造 owner 无效', () => {
  const a = customer();
  const b = customer({ ...context, OPENID: 'offline-b' });
  const cart = { ...emptyCart(), ownerId: a.subjectId };
  const actor = requireOwner(a, cart);
  const result = planCartCommand(cart, 'ADD', actor,
    { expectedVersion: cart.version, quantity: 1, cakeMessage: 'offline',
      skuId: cartContext().skus[0]._id, selectedOptions: cartContext().selectedOptions,
      ownerId: b.subjectId }, cartContext());
  assert.equal(result.nextCart.ownerId, a.subjectId);
  code(() => requireOwner(b, cart), 'FORBIDDEN');
});

test('D06 权限检查不修改用户 / 授权 / 订单，冻结输出不暴露原始 grant', () => {
  const a = customer();
  const grant = role(a);
  const owned = order(a);
  const before = JSON.stringify({ grant, owned });
  const actor = requireStoreCapability(a, [grant], 'offline-store', ['ORDER_OPERATE']);
  planUserOrderCommand(owned, 'ACCEPT', a, [grant]);
  assert.equal(JSON.stringify({ grant, owned }), before);
  grant.storeIds.push('other');
  assert.deepEqual(actor.storeIds, ['offline-store']);
  assert.throws(() => actor.capabilities.push('REFUND_APPROVE'), TypeError);
});

test('D06/P02 数据库规则草案覆盖字典 26 集合，普通客户端所有直接 CRUD 关闭', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const manifest = require('../cloudfunctions/database/security-rules.draft.json');
  const dictionary = fs.readFileSync(path.join(__dirname, '../docs/DATA_MODEL.md'), 'utf8');
  const collections = [...dictionary.matchAll(/^### ([a-z][a-z_]+)$/gm)]
    .map(match => match[1]).filter(name => name !== 'items');
  assert.equal(manifest.status, 'DRAFT_NOT_DEPLOYED');
  assert.equal(Object.keys(manifest.collections).length, 26);
  assert.deepEqual(Object.keys(manifest.collections).sort(), collections.sort());
  for (const rule of Object.values(manifest.collections)) {
    assert.deepEqual(rule, { read: false, write: false, create: false, update: false, delete: false });
  }
});
