'use strict';
// A01 internal/offline service. An SDK transaction, trusted invocation verifier and
// complete scoped loaders are REQUIRED before use in any deployed handler.
const { parseApiRequest } = require('./api-contract');
const { CAPABILITIES, requireOwner, requireStoreCapability } = require('./authorization-model');
const { requireCurrentOrderUser } = require('./order-transaction-service');
const { validateScopedAdminRole, validateScopedAdminState } = require('./admin-access-state');
const { canonicalJSON, scopedDocumentId, requestFingerprint, idempotencyId, decideIdempotency } = require('./idempotency-model');
const fail = code => { throw Object.assign(new Error(code), { code }); };
const text = (value, max = 256) => typeof value === 'string' && value.length > 0 &&
  value === value.trim() && value.length <= max && value.isWellFormed();
const time = value => Number.isSafeInteger(value) && value > 0 && Number.isFinite(new Date(value).getTime());
const counter = value => Number.isSafeInteger(value) && value >= 0;
const list = (value, predicate, nonempty = true) => Array.isArray(value) && (!nonempty || value.length > 0) &&
  Object.keys(value).length === value.length && value.every(item => predicate(item)) && new Set(value).size === value.length;
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const copy = value => JSON.parse(canonicalJSON(value));
const roleIdFor = (environment, appId, auditId) => scopedDocumentId('admin-role', [environment, appId, auditId]);
function output(disposition, result) {
  return freeze({ scope: 'OFFLINE_ADMIN_ACCESS_RESULT', disposition, result,
    cloudVerified: false, callable: false, entryAllowed: false, operationsAllowed: false });
}
function createAdminAccessService({ environment, appId, runTransaction, now, newRequestId,
  redactReason, verifyBootstrapInvocation, loadBootstrapAuthorization }) {
  if (!text(environment) || !text(appId) || ![runTransaction, now, newRequestId, redactReason,
    verifyBootstrapInvocation, loadBootstrapAuthorization].every(fn => typeof fn === 'function')) fail('INVALID_CONFIGURATION');
  const bootstrapAuditId = scopedDocumentId('admin-bootstrap-audit', [environment, appId]);
  function timestamp() { const value = now(); if (!time(value)) fail('INVALID_CONFIGURATION'); return value; }
  function principalScope(principal) {
    requireOwner(principal, { ownerId: principal && principal.subjectId });
    if (principal.environment !== environment || principal.appId !== appId) fail('FORBIDDEN');
  }
  function validateUser(user, id) {
    if (!user) fail('USER_NOT_PROVISIONED');
    if (user._id !== id || user.environment !== environment || user.appId !== appId ||
      user.schemaVersion !== 1 || !counter(user.version) || !text(user.openId) ||
      !['ACTIVE', 'DISABLED'].includes(user.status) ||
      scopedDocumentId('user', [environment, appId, user.openId]) !== id) fail('INVALID_USER_RECORD');
    if (user.status !== 'ACTIVE') fail('USER_DISABLED');
  }
  function validateRole(role, at) {
    validateScopedAdminRole(role, { environment, appId, now: at });
  }
  function validateState(state, at) {
    validateScopedAdminState(state, { environment, appId, now: at });
  }
  function storesExist(state, ids, allowArchived = false) {
    if (ids.some(id => !state.stores.some(store => store._id === id && (allowArchived || store.status !== 'ARCHIVED')))) fail('FORBIDDEN');
  }
  function manager(principal, state, storeIds, capabilities) {
    const required = [...new Set(['ROLE_MANAGE', ...capabilities])];
    // One complete grant covers every target store AND every delegated capability.
    // Split grants cannot be combined into a stronger delegation credential.
    const candidate = state.roles.find(role => role.subjectId === principal.subjectId && role.status === 'ACTIVE' &&
      storeIds.every(id => role.storeIds.includes(id)) && required.every(cap => role.capabilities.includes(cap)));
    if (!candidate) fail('FORBIDDEN');
    requireStoreCapability(principal, [candidate], storeIds[0], required);
    return { type: 'STORE', subjectId: principal.subjectId, service: null };
  }
  function session(tx) {
    if (!tx || ['readUser', 'readAccessState', 'readReceipt', 'readAudit', 'assertAccessReads',
      'insertRole', 'revokeRole', 'insertAudit', 'insertReceipt'].some(name => typeof tx[name] !== 'function')) fail('INVALID_TRANSACTION_ADAPTER');
  }
  async function checked(effect) { if (await effect !== 1) fail('VERSION_CONFLICT'); }
  async function fence(tx, state, users, receiptId = null, auditId = null, bootstrapAuthorization = null) {
    // Adapter MUST protect complete role/store query predicates (including absent
    // bootstrap/receipt/audit rows), users, and all read versions until commit.
    if (await tx.assertAccessReads(freeze({ environment, appId, state: copy(state),
      users: users.map(user => copy(user)), receiptId, auditId,
      bootstrapAuthorization: bootstrapAuthorization === null ? null : copy(bootstrapAuthorization) })) !== true) fail('VERSION_CONFLICT');
  }
  function requestFor(actorScope, command, key, payload) {
    return { environment, actorScope: canonicalJSON([appId, actorScope]), command, key,
      requestFingerprint: requestFingerprint(payload) };
  }
  async function decisionFor(tx, request, at) {
    const id = idempotencyId(request), record = await tx.readReceipt(id);
    if (record !== null && (!record || record.environment !== environment || record.schemaVersion !== 1 ||
      record.version !== 0 || !time(record.createdAt) || record.updatedAt !== record.createdAt || record.createdAt > at ||
      record.status !== 'SUCCEEDED' || record.leaseUntil !== null || record.retentionUntil !== null)) fail('INVALID_IDEMPOTENCY_RECORD');
    return { id, record, decision: decideIdempotency(record, request) };
  }
  function auditFor(id, action, role, beforeVersion, actor, requestId, reason, at) {
    return { _id: id, environment, appId, schemaVersion: 1, version: 0, createdAt: at, updatedAt: at,
      actor, action, storeId: role.storeIds.length === 1 ? role.storeIds[0] : null, storeIds: [...role.storeIds],
      target: { collection: 'admin_roles', entityId: role._id, beforeVersion, afterVersion: role.version },
      changes: [{ field: 'status', before: beforeVersion === null ? null : 'ACTIVE', after: role.status }],
      reason, requestId, outcome: 'SUCCEEDED' };
  }
  function replayEvidence(audit, role, decision, record, action, auditId, actor, payload) {
    if (!audit || !role || decision.result.errorCode !== null || decision.result.entityId !== role._id ||
      decision.result.version !== (action === 'admin.role.revoke' ? 1 : 0) ||
      audit._id !== auditId || audit.action !== action || audit.environment !== environment || audit.appId !== appId ||
      audit.schemaVersion !== 1 || audit.version !== 0 || audit.outcome !== 'SUCCEEDED' ||
      canonicalJSON(audit.actor) !== canonicalJSON(actor) || !time(audit.createdAt) || audit.updatedAt !== audit.createdAt ||
      audit.createdAt !== record.createdAt ||
      !text(audit.requestId) || !text(audit.reason) ||
      canonicalJSON(audit.target) !== canonicalJSON({ collection: 'admin_roles', entityId: role._id,
        beforeVersion: action === 'admin.role.revoke' ? 0 : null, afterVersion: decision.result.version }) ||
      canonicalJSON(audit.storeIds) !== canonicalJSON(role.storeIds) ||
      audit.storeId !== (role.storeIds.length === 1 ? role.storeIds[0] : null) ||
      canonicalJSON(audit.changes) !== canonicalJSON([{ field: 'status', before: action === 'admin.role.revoke' ? 'ACTIVE' : null,
        after: action === 'admin.role.revoke' ? 'REVOKED' : 'ACTIVE' }])) fail('INVALID_IDEMPOTENCY_RECORD');
    if (action === 'admin.role.revoke') {
      if (payload.expectedVersion !== 0 || role.status !== 'REVOKED' || role.revocationAuditId !== auditId ||
        role.revokedAt !== audit.createdAt) fail('INVALID_IDEMPOTENCY_RECORD');
    } else if (role.grantAuditId !== auditId || role.createdAt !== audit.createdAt ||
      canonicalJSON(role.grantedBy) !== canonicalJSON(actor) || role.subjectId !== payload.subjectId ||
      canonicalJSON(role.storeIds) !== canonicalJSON(payload.storeIds) ||
      canonicalJSON(role.capabilities) !== canonicalJSON(payload.capabilities)) fail('INVALID_IDEMPOTENCY_RECORD');
  }
  async function save(tx, request, receiptId, audit, role, expectedVersion, at) {
    if (expectedVersion === null) await checked(tx.insertRole(role));
    else await checked(tx.revokeRole(role, expectedVersion));
    await checked(tx.insertAudit(audit));
    const result = { entityId: role._id, version: role.version, errorCode: null };
    await checked(tx.insertReceipt({ ...request, _id: receiptId, schemaVersion: 1, version: 0,
      createdAt: at, updatedAt: at, status: 'SUCCEEDED', result, leaseUntil: null, retentionUntil: null }));
    if (timestamp() < at) fail('INVALID_CONFIGURATION');
    return output('SUCCEEDED', result);
  }
  function grantRecord(payload, auditId, actor, source, at) {
    return { _id: roleIdFor(environment, appId, auditId), environment, appId, schemaVersion: 1, version: 0,
      createdAt: at, updatedAt: at, subjectId: payload.subjectId, storeIds: [...payload.storeIds],
      capabilities: [...payload.capabilities], status: 'ACTIVE', grantedBy: actor, grantSource: source,
      grantAuditId: auditId, revokedAt: null, revocationAuditId: null };
  }
  return Object.freeze({
    async entrySummary(principal) {
      principalScope(principal);
      return runTransaction(async tx => {
        session(tx); const at = timestamp(), user = await tx.readUser(principal.subjectId);
        validateUser(user, principal.subjectId); requireCurrentOrderUser(user, principal);
        const state = copy(await tx.readAccessState()); validateState(state, at);
        const storeIds = [...new Set(state.roles.filter(role => role.subjectId === principal.subjectId && role.status === 'ACTIVE')
          .flatMap(role => role.storeIds))].filter(id => state.stores.some(store => store._id === id && store.status !== 'ARCHIVED')).sort();
        await fence(tx, state, [user]);
        return freeze({ scope: 'OFFLINE_ADMIN_ENTRY_SUMMARY', hasMerchantRole: storeIds.length > 0,
          authorizedStoreIds: storeIds, entryAllowed: false, callable: false, cloudVerified: false });
      });
    },
    async requireCapability(principal, storeId, capabilities) {
      principalScope(principal);
      return runTransaction(async tx => {
        session(tx); const at = timestamp(), user = await tx.readUser(principal.subjectId);
        validateUser(user, principal.subjectId); requireCurrentOrderUser(user, principal);
        const state = copy(await tx.readAccessState()); validateState(state, at); storesExist(state, [storeId]);
        const actor = requireStoreCapability(principal, state.roles, storeId, capabilities);
        await fence(tx, state, [user]);
        // This is an observation, NOT a credential for a subsequent transaction.
        return output('AUTHORIZED_OBSERVATION', actor);
      });
    },
    async execute(event, principal) {
      principalScope(principal);
      const { contract, payload } = parseApiRequest('admin', event);
      if (!['role.grant', 'role.revoke'].includes(contract.action)) fail('UNSUPPORTED_ADMIN_COMMAND');
      const command = 'admin.' + contract.action;
      const request = requestFor(principal.subjectId, command, payload.idempotencyKey, payload);
      const requestId = newRequestId(), reason = redactReason(payload.reason, command);
      if (!text(requestId) || !text(reason)) fail('INVALID_CONFIGURATION');
      return runTransaction(async tx => {
        session(tx); const at = timestamp(), user = await tx.readUser(principal.subjectId);
        validateUser(user, principal.subjectId); requireCurrentOrderUser(user, principal);
        const state = copy(await tx.readAccessState()); validateState(state, at);
        const target = command === 'admin.role.revoke' ? state.roles.find(role => role._id === payload.roleId) : null;
        if (command === 'admin.role.revoke' && !target) fail('FORBIDDEN');
        const subjectId = target ? target.subjectId : payload.subjectId;
        if (subjectId === principal.subjectId) fail('FORBIDDEN');
        const storeIds = target ? target.storeIds : payload.storeIds;
        const capabilities = target ? [] : payload.capabilities;
        storesExist(state, storeIds, target !== null);
        const actor = manager(principal, state, storeIds, capabilities);
        const targetUser = await tx.readUser(subjectId);
        // Revocation must also work for a disabled member. A missing/mismatched
        // target mapping remains a corruption case; don't invent an identity.
        if (targetUser?.status === 'DISABLED' && target) validateUser({ ...targetUser, status: 'ACTIVE' }, subjectId);
        else validateUser(targetUser, subjectId);
        const { id: receiptId, record, decision } = await decisionFor(tx, request, at);
        const auditId = scopedDocumentId('admin-role-audit', [receiptId]);
        const audit = await tx.readAudit(auditId);
        if (decision.disposition === 'REPLAY') {
          const role = target || state.roles.find(value => value._id === decision.result.entityId);
          replayEvidence(audit, role, decision, record, command, auditId, actor, payload);
          await fence(tx, state, [user, targetUser], receiptId, auditId);
          return output('REPLAY', decision.result);
        }
        if (audit !== null) fail('INVALID_IDEMPOTENCY_RECORD');
        let role;
        if (target) {
          if (target.version !== payload.expectedVersion || target.status !== 'ACTIVE' || payload.expectedVersion !== 0) fail('VERSION_CONFLICT');
          role = { ...target, status: 'REVOKED', version: 1, revokedAt: at, updatedAt: at, revocationAuditId: auditId };
        } else {
          if (state.roles.some(value => value.subjectId === subjectId && value.status === 'ACTIVE' &&
            canonicalJSON([...value.storeIds].sort()) === canonicalJSON([...storeIds].sort()) &&
            canonicalJSON([...value.capabilities].sort()) === canonicalJSON([...capabilities].sort()))) fail('ROLE_ALREADY_ACTIVE');
          role = grantRecord(payload, auditId, actor, 'DELEGATED', at);
        }
        validateRole(role, at);
        await fence(tx, state, [user, targetUser], receiptId, auditId);
        return save(tx, request, receiptId, auditFor(auditId, command, role, target ? 0 : null, actor, requestId, reason, at),
          role, target ? 0 : null, at);
      });
    },
    async bootstrap(invocation) {
      if (await verifyBootstrapInvocation(invocation) !== true) fail('FORBIDDEN');
      const authorization = copy(await loadBootstrapAuthorization(invocation));
      if (!authorization || authorization.schemaVersion !== 1 || !counter(authorization.version) ||
        authorization.environment !== environment || authorization.appId !== appId ||
        !text(authorization.authorizationId) || !text(authorization.subjectId) || !list(authorization.storeIds, text) ||
        !list(authorization.capabilities, cap => CAPABILITIES.includes(cap)) || !authorization.capabilities.includes('ROLE_MANAGE') ||
        !time(authorization.validFrom) || !time(authorization.expiresAt) || authorization.validFrom >= authorization.expiresAt ||
        !text(authorization.reason, 2048)) fail('INVALID_BOOTSTRAP_AUTHORIZATION');
      const request = requestFor('SYSTEM:ADMIN_BOOTSTRAP', 'admin.bootstrap', authorization.authorizationId, authorization);
      const actor = { type: 'SYSTEM', subjectId: null, service: 'ADMIN_BOOTSTRAP' };
      const requestId = newRequestId(), reason = redactReason(authorization.reason, 'admin.bootstrap');
      if (!text(requestId) || !text(reason)) fail('INVALID_CONFIGURATION');
      return runTransaction(async tx => {
        session(tx); const at = timestamp();
        if (at < authorization.validFrom || at >= authorization.expiresAt) fail('BOOTSTRAP_AUTHORIZATION_EXPIRED');
        const targetUser = await tx.readUser(authorization.subjectId); validateUser(targetUser, authorization.subjectId);
        const state = copy(await tx.readAccessState()); validateState(state, at); storesExist(state, authorization.storeIds);
        const { id: receiptId, record, decision } = await decisionFor(tx, request, at);
        const existing = await tx.readAudit(bootstrapAuditId);
        if (decision.disposition === 'REPLAY') {
          const role = state.roles.find(value => value._id === decision.result.entityId);
          replayEvidence(existing, role, decision, record, 'admin.bootstrap', bootstrapAuditId, actor, authorization);
          await fence(tx, state, [targetUser], receiptId, bootstrapAuditId, authorization);
          return output('REPLAY', decision.result);
        }
        if (existing !== null || state.roles.some(role => role.capabilities.includes('ROLE_MANAGE'))) fail('BOOTSTRAP_ALREADY_USED');
        const role = grantRecord(authorization, bootstrapAuditId, actor, 'BOOTSTRAP', at);
        validateRole(role, at); await fence(tx, state, [targetUser], receiptId, bootstrapAuditId, authorization);
        const result = await save(tx, request, receiptId, auditFor(bootstrapAuditId, 'admin.bootstrap', role, null,
          actor, requestId, reason, at), role, null, at);
        const latest = timestamp();
        if (latest < at) fail('INVALID_CONFIGURATION');
        if (latest >= authorization.expiresAt) fail('BOOTSTRAP_AUTHORIZATION_EXPIRED');
        return result;
      });
    }
  });
}
module.exports = { createAdminAccessService };
