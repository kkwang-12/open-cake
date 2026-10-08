'use strict';
// Scoped record validation shared by A01 and A02; not an authentication factory.
const { CAPABILITIES } = require('./authorization-model');
const { scopedDocumentId } = require('./idempotency-model');
const fail = code => { throw Object.assign(new Error(code), { code }); };
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 256 && value === value.trim() && value.isWellFormed();
const time = value => Number.isSafeInteger(value) && value > 0 && Number.isFinite(new Date(value).getTime());
const counter = value => Number.isSafeInteger(value) && value >= 0;
const list = (values, predicate, nonempty = true) => Array.isArray(values) && (!nonempty || values.length > 0) &&
  Object.keys(values).length === values.length && values.every(value => predicate(value)) && new Set(values).size === values.length;
function validateScopedAdminRole(role, { environment, appId, now }) {
  if (!text(environment) || !text(appId) || !time(now)) fail('INVALID_CONFIGURATION');
  const bootstrapAuditId = scopedDocumentId('admin-bootstrap-audit', [environment, appId]);
  if (!role || !text(role._id) || role.environment !== environment || role.appId !== appId ||
    role.schemaVersion !== 1 || !text(role.subjectId) || !list(role.storeIds, text) ||
    !list(role.capabilities, value => CAPABILITIES.includes(value)) ||
    !time(role.createdAt) || !time(role.updatedAt) || role.createdAt > role.updatedAt || role.updatedAt > now ||
    !text(role.grantAuditId) || role._id !== scopedDocumentId('admin-role', [environment, appId, role.grantAuditId]) ||
    !['BOOTSTRAP', 'DELEGATED'].includes(role.grantSource) ||
    !role.grantedBy || Object.keys(role.grantedBy).sort().join(',') !== 'service,subjectId,type' ||
    (role.grantSource === 'BOOTSTRAP' ? role.grantAuditId !== bootstrapAuditId ||
      role.grantedBy.type !== 'SYSTEM' || role.grantedBy.subjectId !== null || role.grantedBy.service !== 'ADMIN_BOOTSTRAP' :
      role.grantedBy.type !== 'STORE' || !text(role.grantedBy.subjectId) || role.grantedBy.service !== null) ||
    (role.status === 'ACTIVE' ? role.version !== 0 || role.revokedAt !== null ||
      role.revocationAuditId !== null || role.updatedAt !== role.createdAt :
      role.status !== 'REVOKED' || role.version !== 1 || role.revokedAt !== role.updatedAt ||
      !text(role.revocationAuditId))) fail('INVALID_ROLE_RECORD');
}
function validateScopedAdminState(state, context) {
  const { environment, appId, now } = context;
  if (!text(environment) || !text(appId) || !time(now)) fail('INVALID_CONFIGURATION');
  if (!state || state.environment !== environment || state.appId !== appId || state.complete !== true ||
    !Array.isArray(state.roles) || Object.keys(state.roles).length !== state.roles.length ||
    !Array.isArray(state.stores) || Object.keys(state.stores).length !== state.stores.length) fail('INVALID_ACCESS_STATE');
  state.roles.forEach(role => validateScopedAdminRole(role, context));
  if (new Set(state.roles.map(role => role._id)).size !== state.roles.length) fail('INVALID_ROLE_RECORD');
  if (state.stores.some(store => !store || !text(store._id) || store.environment !== environment ||
    store.appId !== appId || store.schemaVersion !== 1 || !counter(store.version) ||
    !['DRAFT', 'OPEN', 'CLOSED', 'ARCHIVED'].includes(store.status)) ||
    new Set(state.stores.map(store => store._id)).size !== state.stores.length) fail('INVALID_ACCESS_STATE');
  if (state.roles.some(role => role.storeIds.some(id => !state.stores.some(store => store._id === id)))) fail('INVALID_ACCESS_STATE');
}
module.exports = { validateScopedAdminRole, validateScopedAdminState };
