'use strict';
// Offline server-side guards. context/settings/user/roles MUST come from trusted
// platform/config/database loaders. These functions do not authenticate network input.
const { scopedDocumentId } = require('./idempotency-model');
const { planOrderCommand } = require('./trade-model');

const CAPABILITIES = Object.freeze([
  'ORDER_OPERATE', 'REFUND_APPROVE', 'CATALOG_WRITE', 'CONFIG_WRITE', 'ROLE_MANAGE', 'AUDIT_READ'
]);
const messages = Object.freeze({
  INVALID_CONFIGURATION: '服务配置异常', AUTH_REQUIRED: '身份验证失败',
  APP_MISMATCH: '小程序身份不匹配', ENV_MISMATCH: '服务环境不匹配',
  USER_NOT_PROVISIONED: '账户尚未初始化', INVALID_USER_RECORD: '账户数据无效',
  USER_DISABLED: '账户不可用', INVALID_ROLE_RECORD: '授权数据无效',
  INVALID_AUTHORIZATION_INPUT: '权限校验输入无效', FORBIDDEN: '无权执行此操作'
});
class AuthorizationModelError extends Error {
  constructor(code) { super(messages[code]); this.name = 'AuthorizationModelError'; this.code = code; }
}
function fail(code) { throw new AuthorizationModelError(code); }
function plain(value) {
  return value !== null && typeof value === 'object' &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value));
}
function text(value) {
  return typeof value === 'string' && value.length > 0 && value === value.trim() && value.isWellFormed();
}
function counter(value) { return Number.isSafeInteger(value) && value >= 0; }
function uniqueList(value, predicate, nonempty = false) {
  return Array.isArray(value) && (!nonempty || value.length > 0) &&
    value.every(predicate) && new Set(value).size === value.length &&
    Object.keys(value).length === value.length;
}
const principals = new WeakSet();
function requirePrincipal(principal) {
  if (!plain(principal) || !principals.has(principal)) fail('AUTH_REQUIRED');
}
function identityFromPlatform(context, settings) {
  if (!plain(settings) || !text(settings.appId) || !text(settings.environment) ||
      !['development', 'test', 'production'].includes(settings.stage)) fail('INVALID_CONFIGURATION');
  if (!plain(context) || !text(context.OPENID) || !text(context.APPID)) fail('AUTH_REQUIRED');
  if (context.APPID !== settings.appId) fail('APP_MISMATCH');
  if (context.ENV !== settings.environment) fail('ENV_MISMATCH');
  return Object.freeze({
    _id: scopedDocumentId('user', [settings.environment, context.APPID, context.OPENID]),
    environment: settings.environment, appId: context.APPID, openId: context.OPENID
  });
}
function resolveCustomer(context, settings, user) {
  const identity = identityFromPlatform(context, settings);
  if (user === null) fail('USER_NOT_PROVISIONED');
  if (!plain(user) || user._id !== identity._id || user.environment !== identity.environment ||
      user.appId !== identity.appId || user.openId !== identity.openId ||
      user.schemaVersion !== 1 || !counter(user.version) ||
      !['ACTIVE', 'DISABLED'].includes(user.status)) fail('INVALID_USER_RECORD');
  if (user.status !== 'ACTIVE') fail('USER_DISABLED');
  // No OpenID, client role, PIN or capability list in the principal.
  const principal = Object.freeze({
    type: 'CUSTOMER', subjectId: user._id, environment: identity.environment,
    appId: identity.appId, userVersion: user.version
  });
  principals.add(principal);
  return principal;
}
function requireOwner(principal, record) {
  requirePrincipal(principal);
  if (!plain(record) || !text(record.ownerId)) fail('INVALID_AUTHORIZATION_INPUT');
  if (record.ownerId !== principal.subjectId) fail('FORBIDDEN');
  return Object.freeze({ type: 'CUSTOMER', subjectId: principal.subjectId });
}
function validateRole(role) {
  if (!plain(role) || !text(role._id) || role.schemaVersion !== 1 || !counter(role.version) ||
      !text(role.subjectId) || !uniqueList(role.storeIds, text, true) ||
      !uniqueList(role.capabilities, value => CAPABILITIES.includes(value)) ||
      !['ACTIVE', 'REVOKED'].includes(role.status) ||
      (role.status === 'ACTIVE' ? role.revokedAt !== null :
        !Number.isSafeInteger(role.revokedAt) || role.revokedAt <= 0)) fail('INVALID_ROLE_RECORD');
}
function requireStoreCapability(principal, roles, storeId, requiredCapabilities) {
  requirePrincipal(principal);
  if (!text(storeId) || !Array.isArray(roles) ||
      !uniqueList(requiredCapabilities, value => CAPABILITIES.includes(value), true) ||
      Object.keys(roles).length !== roles.length) fail('INVALID_AUTHORIZATION_INPUT');
  roles.forEach(validateRole);
  if (new Set(roles.map(role => role._id)).size !== roles.length) fail('INVALID_ROLE_RECORD');
  const role = roles.find(value => value.subjectId === principal.subjectId &&
    value.status === 'ACTIVE' && value.storeIds.includes(storeId) &&
    requiredCapabilities.every(capability => value.capabilities.includes(capability)));
  if (!role) fail('FORBIDDEN');
  // Narrow to exactly this store and these capabilities; never return all grant scope.
  return Object.freeze({
    type: 'STORE', subjectId: principal.subjectId,
    storeIds: Object.freeze([storeId]), capabilities: Object.freeze([...requiredCapabilities]),
    grant: Object.freeze({ roleId: role._id, roleVersion: role.version, userVersion: principal.userVersion })
  });
}
const CUSTOMER_COMMANDS = Object.freeze(['CANCEL_UNPAID', 'REQUEST_CANCELLATION', 'COMPLETE_DELIVERY']);
const STORE_COMMANDS = Object.freeze({
  ACCEPT: ['ORDER_OPERATE'], START_MAKING: ['ORDER_OPERATE'], MARK_READY: ['ORDER_OPERATE'],
  START_DELIVERY: ['ORDER_OPERATE'], COMPLETE_PICKUP: ['ORDER_OPERATE'],
  COMPLETE_DELIVERY: ['ORDER_OPERATE'], REJECT_CANCELLATION: ['ORDER_OPERATE'],
  APPROVE_CANCELLATION: ['ORDER_OPERATE', 'REFUND_APPROVE'],
  REJECT_ORDER: ['ORDER_OPERATE', 'REFUND_APPROVE'], APPROVE_REFUND: ['REFUND_APPROVE']
});
function planUserOrderCommand(order, command, principal, roles, args = {}) {
  requirePrincipal(principal);
  if (!plain(order) || !text(order.ownerId) || !text(order.storeId) ||
      typeof command !== 'string') fail('INVALID_AUTHORIZATION_INPUT');
  let actor;
  if (CUSTOMER_COMMANDS.includes(command) && order.ownerId === principal.subjectId) {
    actor = requireOwner(principal, order);
  } else if (Object.prototype.hasOwnProperty.call(STORE_COMMANDS, command)) {
    actor = requireStoreCapability(principal, roles, order.storeId, STORE_COMMANDS[command]);
  } else fail('FORBIDDEN'); // PAYMENT_CONFIRMED / system expiry are not user entry points.
  return planOrderCommand(order, command, actor, args);
}
module.exports = {
  CAPABILITIES, AuthorizationModelError, identityFromPlatform, resolveCustomer,
  requireOwner, requireStoreCapability, planUserOrderCommand
};
