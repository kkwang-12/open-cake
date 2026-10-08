'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { setup, clone } = require('./fixtures/admin-access');
const { createAdminAccessService } = require('../cloudfunctions/_shared/admin-access-service');
const { CAPABILITIES, requireStoreCapability } = require('../cloudfunctions/_shared/authorization-model');
const rejects = (work, code) => assert.rejects(work, error => error.code === code);
async function ready() { const s = setup(); s.root = (await s.bootstrap()).result.entityId; return s; }
async function granted() {
  const s = await ready(); s.grantEvent = s.grant(); s.child = (await s.service.execute(s.grantEvent, s.initial)).result.entityId; return s;
}
const snapshot = s => JSON.stringify(s.db);

test('A01 controlled bootstrap writes one role, immutable scoped audit and receipt; all runtime gates remain closed', async () => {
  const s = setup(), before = clone(s.db.users), result = await s.bootstrap(), role = s.db.roles[result.result.entityId];
  assert.equal(result.disposition, 'SUCCEEDED'); assert.equal(s.controls.lastWrites, 3);
  assert.equal(role.subjectId, s.initial.subjectId); assert.deepEqual(role.capabilities, CAPABILITIES);
  assert.equal(role.grantedBy.type, 'SYSTEM'); assert.equal(role.grantSource, 'BOOTSTRAP');
  assert.deepEqual(s.db.users, before); assert.equal(Object.keys(s.db.audits).length, 1);
  assert.equal(s.db.audits[role.grantAuditId].target.entityId, role._id);
  for (const key of ['cloudVerified', 'callable', 'entryAllowed', 'operationsAllowed']) assert.equal(result[key], false);
  assert(Object.isFrozen(result.result));
});

test('A01 ordinary or cloned invocation and first visitor never become administrator', async () => {
  const s = setup(), before = snapshot(s);
  for (const invocation of [null, {}, clone(s.invocation), s.initial, { role: 'admin', pin: '246810' }])
    await rejects(() => s.service.bootstrap(invocation), 'FORBIDDEN');
  assert.equal(snapshot(s), before);
  const entry = await s.service.entrySummary(s.initial);
  assert.equal(entry.hasMerchantRole, false); assert.deepEqual(entry.authorizedStoreIds, []); assert.equal(entry.entryAllowed, false);
});

test('A01 initial arrangement is bound to app/environment, verified user, recognized stores, capability vocabulary and time window', async () => {
  for (const [patch, code] of [
    [{ environment: 'other' }, 'INVALID_BOOTSTRAP_AUTHORIZATION'], [{ appId: 'other' }, 'INVALID_BOOTSTRAP_AUTHORIZATION'],
    [{ subjectId: 'unknown' }, 'USER_NOT_PROVISIONED'], [{ storeIds: ['unknown'] }, 'FORBIDDEN'],
    [{ capabilities: ['*'] }, 'INVALID_BOOTSTRAP_AUTHORIZATION'], [{ capabilities: ['ORDER_OPERATE'] }, 'INVALID_BOOTSTRAP_AUTHORIZATION'],
    [{ storeIds: [] }, 'INVALID_BOOTSTRAP_AUTHORIZATION'], [{ capabilities: ['ROLE_MANAGE', 'ROLE_MANAGE'] }, 'INVALID_BOOTSTRAP_AUTHORIZATION'],
    [{ expiresAt: 1791240000000 }, 'BOOTSTRAP_AUTHORIZATION_EXPIRED'],
    [{ validFrom: 1791240000001 }, 'BOOTSTRAP_AUTHORIZATION_EXPIRED']
  ]) {
    const s = setup(); Object.assign(s.authorization, patch); const before = snapshot(s);
    await rejects(() => s.bootstrap(), code); assert.equal(snapshot(s), before);
  }
});

test('A01 missing, disabled or forged user mapping cannot receive initial role', async () => {
  for (const [patch, code] of [[{ status: 'DISABLED' }, 'USER_DISABLED'], [{ openId: 'other' }, 'INVALID_USER_RECORD'],
    [{ appId: 'other' }, 'INVALID_USER_RECORD'], [{ version: -1 }, 'INVALID_USER_RECORD']]) {
    const s = setup(); Object.assign(s.db.users[s.initial.subjectId], patch); const before = snapshot(s);
    await rejects(() => s.bootstrap(), code); assert.equal(snapshot(s), before);
  }
});

test('A01 bootstrap lost response replays original result and different authorization cannot initialize again', async () => {
  const s = await ready(), before = snapshot(s), result = await s.bootstrap();
  assert.equal(result.disposition, 'REPLAY'); assert.equal(result.result.entityId, s.root); assert.equal(snapshot(s), before);
  s.authorization.authorizationId = 'OFFLINE_SECOND_AUTHORIZATION';
  await rejects(() => s.bootstrap(), 'BOOTSTRAP_ALREADY_USED'); assert.equal(snapshot(s), before);
});

test('A01 concurrent bootstrap attempts serialize to one initial role and one audit', async () => {
  const s = setup(), results = await Promise.all([s.bootstrap(), s.bootstrap(), s.bootstrap()]);
  assert.deepEqual(results.map(result => result.disposition), ['SUCCEEDED', 'REPLAY', 'REPLAY']);
  assert.equal(Object.keys(s.db.roles).length, 1); assert.equal(Object.keys(s.db.audits).length, 1);
});

test('A01 grant creates immutable store/capability scope; revoke preserves evidence and denies the next sensitive check', async () => {
  const s = await granted(), role = clone(s.db.roles[s.child]);
  assert.equal((await s.service.entrySummary(s.member)).hasMerchantRole, true);
  const authorized = await s.service.requireCapability(s.member, 'offline-store-a', ['ORDER_OPERATE']);
  assert.equal(authorized.disposition, 'AUTHORIZED_OBSERVATION'); assert.equal(authorized.operationsAllowed, false);
  const event = s.revoke(s.child), result = await s.service.execute(event, s.initial), next = s.db.roles[s.child];
  assert.equal(result.result.version, 1); assert.equal(next.status, 'REVOKED');
  for (const key of Object.keys(role).filter(key => !['status', 'version', 'updatedAt', 'revokedAt', 'revocationAuditId'].includes(key)))
    assert.deepEqual(next[key], role[key]);
  await rejects(() => s.service.requireCapability(s.member, 'offline-store-a', ['ORDER_OPERATE']), 'FORBIDDEN');
  assert.equal((await s.service.entrySummary(s.member)).hasMerchantRole, false);
  assert.equal(requireStoreCapability(s.initial, Object.values(s.db.roles), 'offline-store-a', ['ROLE_MANAGE']).subjectId, s.initial.subjectId);
  const before = snapshot(s); assert.equal((await s.service.execute(event, s.initial)).disposition, 'REPLAY'); assert.equal(snapshot(s), before);
});

test('A01 no client role, owner, status, capability or operator override; forged principal is rejected', async () => {
  const s = await ready(), before = snapshot(s);
  for (const [field, value] of Object.entries({ actor: {}, role: 'SYSTEM', ownerId: s.initial.subjectId,
    status: 'ACTIVE', grantedBy: {}, expectedVersion: 0, openId: 'other' })) {
    await rejects(() => s.service.execute(s.grant({ [field]: value }), s.initial), 'INVALID_REQUEST');
  }
  await rejects(() => s.service.execute(s.grant(), clone(s.initial)), 'AUTH_REQUIRED');
  await rejects(() => s.service.execute(s.grant(), s.member), 'FORBIDDEN');
  assert.equal(snapshot(s), before);
});

test('A01 principals from a different environment/app and stale or disabled callers are refused', async () => {
  const s = await ready();
  const { resolveCustomer, identityFromPlatform } = require('../cloudfunctions/_shared/authorization-model');
  const context = { ENV: 'other-env', APPID: 'wx-other', OPENID: 'offline-initial' }, settings = {
    environment: context.ENV, appId: context.APPID, stage: 'test' };
  const principal = resolveCustomer(context, settings, { ...identityFromPlatform(context, settings), schemaVersion: 1, version: 0, status: 'ACTIVE' });
  await rejects(() => s.service.entrySummary(principal), 'FORBIDDEN');
  s.db.users[s.initial.subjectId].version++;
  await rejects(() => s.service.execute(s.grant(), s.initial), 'VERSION_CONFLICT');
  s.db.users[s.initial.subjectId].status = 'DISABLED';
  await rejects(() => s.service.entrySummary(s.initial), 'USER_DISABLED');
});

test('A01 self grant and self revoke are forbidden even to a full administrator', async () => {
  const s = await ready(), before = snapshot(s);
  await rejects(() => s.service.execute(s.grant({ subjectId: s.initial.subjectId }), s.initial), 'FORBIDDEN');
  await rejects(() => s.service.execute(s.revoke(s.root), s.initial), 'FORBIDDEN'); assert.equal(snapshot(s), before);
});

test('A01 delegation cannot exceed one current role in stores or capabilities; ROLE_MANAGE alone is not a wildcard', async () => {
  const s = await ready();
  await rejects(() => s.service.execute(s.grant({ storeIds: ['offline-store-b'] }), s.initial), 'FORBIDDEN');
  const manager = (await s.service.execute(s.grant({ capabilities: ['ROLE_MANAGE'], idempotencyKey: 'OFFLINE_MANAGER_GRANT' }), s.initial)).result.entityId;
  assert.equal(s.db.roles[manager].capabilities.length, 1);
  await rejects(() => s.service.execute(s.grant({ subjectId: s.other.subjectId }), s.member), 'FORBIDDEN');
  const result = await s.service.execute(s.grant({ subjectId: s.other.subjectId, capabilities: ['ROLE_MANAGE'],
    idempotencyKey: 'OFFLINE_MANAGER_DELEGATION' }), s.member);
  assert.equal(result.disposition, 'SUCCEEDED');
});

test('A01 split capability grants cannot be combined to delegate a stronger role', async () => {
  const s = await ready();
  await s.service.execute(s.grant({ capabilities: ['ROLE_MANAGE'] }), s.initial);
  await s.service.execute(s.grant({ capabilities: ['ORDER_OPERATE'], idempotencyKey: 'OFFLINE_SECOND_GRANT' }), s.initial);
  await rejects(() => s.service.execute(s.grant({ subjectId: s.other.subjectId }), s.member), 'FORBIDDEN');
});

test('A01 multi-store delegation and revocation require complete scope in one role', async () => {
  const s = setup(); s.authorization.storeIds.push('offline-store-b'); s.root = (await s.bootstrap()).result.entityId;
  const result = await s.service.execute(s.grant({ storeIds: ['offline-store-a', 'offline-store-b'] }), s.initial);
  const role = s.db.roles[result.result.entityId], audit = s.db.audits[role.grantAuditId];
  assert.equal(audit.storeId, null); assert.deepEqual(audit.storeIds, role.storeIds);
  const manager = await s.service.execute(s.grant({ subjectId: s.other.subjectId, capabilities: ['ROLE_MANAGE'],
    idempotencyKey: 'OFFLINE_SINGLE_STORE_MANAGER' }), s.initial);
  assert(manager.result.entityId);
  await rejects(() => s.service.execute(s.revoke(role._id), s.other), 'FORBIDDEN');
});

test('A01 same key replays after service reconstruction, changed payload fails, duplicate scope under another key does not add roles', async () => {
  const s = await granted(), before = snapshot(s), rebuilt = createAdminAccessService(s.options);
  assert.equal((await rebuilt.execute(s.grantEvent, s.initial)).disposition, 'REPLAY'); assert.equal(snapshot(s), before);
  await rejects(() => rebuilt.execute(s.grant({ reason: 'changed' }), s.initial), 'IDEMPOTENCY_KEY_REUSED');
  await rejects(() => rebuilt.execute(s.grant({ idempotencyKey: 'OFFLINE_DUPLICATE_SCOPE' }), s.initial), 'ROLE_ALREADY_ACTIVE');
  assert.equal(snapshot(s), before);
});

test('A01 replay of an old grant never reactivates a revoked role; regrant is a distinct immutable role', async () => {
  const s = await granted(); await s.service.execute(s.revoke(s.child), s.initial); const before = snapshot(s);
  assert.equal((await s.service.execute(s.grantEvent, s.initial)).disposition, 'REPLAY'); assert.equal(snapshot(s), before);
  assert.equal(s.db.roles[s.child].status, 'REVOKED');
  const replacement = await s.service.execute(s.grant({ idempotencyKey: 'OFFLINE_EXPLICIT_REGRANT' }), s.initial);
  assert.notEqual(replacement.result.entityId, s.child); assert.equal(s.db.roles[s.child].status, 'REVOKED');
});

test('A01 replay still requires current caller authority and an intact immutable audit/receipt chain', async () => {
  const s = await granted();
  const root = s.db.roles[s.root]; root.status = 'REVOKED'; root.version = 1; root.revokedAt = root.updatedAt; root.revocationAuditId = 'offline-revocation';
  await rejects(() => s.service.execute(s.grantEvent, s.initial), 'FORBIDDEN');
  for (const damage of [
    s => { delete s.db.audits[s.db.roles[s.child].grantAuditId]; },
    s => { s.db.audits[s.db.roles[s.child].grantAuditId].actor.subjectId = s.other.subjectId; },
    s => { s.db.audits[s.db.roles[s.child].grantAuditId].target.afterVersion = 99; },
    s => { const r = Object.values(s.db.receipts).find(r => r.command === 'admin.role.grant'); r.result.entityId = 'wrong'; },
    s => { const r = Object.values(s.db.receipts).find(r => r.command === 'admin.role.grant'); r.environment = 'other'; }
  ]) {
    const t = await granted(); damage(t); const before = snapshot(t);
    await rejects(() => t.service.execute(t.grantEvent, t.initial), 'INVALID_IDEMPOTENCY_RECORD'); assert.equal(snapshot(t), before);
  }
});

test('A01 disabled member can be revoked but cannot be granted or access merchant capability', async () => {
  const s = await granted(); s.db.users[s.member.subjectId].status = 'DISABLED';
  await rejects(() => s.service.entrySummary(s.member), 'USER_DISABLED');
  await rejects(() => s.service.execute(s.grant({ idempotencyKey: 'OFFLINE_DISABLED_GRANT' }), s.initial), 'USER_DISABLED');
  assert.equal((await s.service.execute(s.revoke(s.child), s.initial)).disposition, 'SUCCEEDED');
});

test('A01 unknown target, stale revoke version and archived/missing stores cannot mutate roles', async () => {
  const s = await granted(), before = snapshot(s);
  await rejects(() => s.service.execute(s.revoke('unknown', { expectedVersion: 0 }), s.initial), 'FORBIDDEN');
  await rejects(() => s.service.execute(s.revoke(s.child, { expectedVersion: 1 }), s.initial), 'VERSION_CONFLICT');
  assert.equal(snapshot(s), before);
  s.db.stores['offline-store-a'].status = 'ARCHIVED';
  await rejects(() => s.service.execute(s.grant({ subjectId: s.other.subjectId }), s.initial), 'FORBIDDEN');
  assert.equal((await s.service.entrySummary(s.initial)).hasMerchantRole, false);
});

test('A01 incomplete, foreign, duplicate or malformed scoped reads are rejected without writes', async () => {
  for (const [patch, code] of [
    [state => { state.complete = false; }, 'INVALID_ACCESS_STATE'], [state => { state.environment = 'other'; }, 'INVALID_ACCESS_STATE'],
    [state => { state.roles.push(clone(state.roles[0])); }, 'INVALID_ROLE_RECORD'],
    [state => { state.roles[0].appId = 'other'; }, 'INVALID_ROLE_RECORD'],
    [state => { state.roles[0].grantAuditId = 'other'; }, 'INVALID_ROLE_RECORD'],
    [state => { state.roles[0].capabilities = ['*']; }, 'INVALID_ROLE_RECORD'],
    [state => { state.roles[0].revokedAt = 1; }, 'INVALID_ROLE_RECORD'],
    [state => { state.roles[0].updatedAt++; }, 'INVALID_ROLE_RECORD'],
    [state => { state.stores = []; }, 'INVALID_ACCESS_STATE'],
    [state => { state.stores.push(clone(state.stores[0])); }, 'INVALID_ACCESS_STATE']
  ]) {
    const s = await ready(); s.controls.statePatch = patch; const before = snapshot(s);
    await rejects(() => s.service.entrySummary(s.initial), code); assert.equal(snapshot(s), before);
  }
});

test('A01 entry summary has no credentials, platform identity, capabilities or mutable authorization token', async () => {
  const s = await ready(), result = await s.service.entrySummary(s.initial);
  assert.equal(result.hasMerchantRole, true); assert.deepEqual(result.authorizedStoreIds, ['offline-store-a']);
  assert.equal(result.entryAllowed, false); assert(Object.isFrozen(result.authorizedStoreIds));
  for (const forbidden of ['openId', 'pin', 'grantedBy', 'roleId', 'capabilities']) assert(!JSON.stringify(result).includes(forbidden));
});

test('A01 raw request reason and platform identity never enter receipts, audit or returned result', async () => {
  const s = await ready(), reason = '私密电话13800138000，真实用户姓名';
  const result = await s.service.execute(s.grant({ reason }), s.initial), persisted = JSON.stringify([s.db.roles, s.db.audits, s.db.receipts, result]);
  assert(!persisted.includes(reason)); assert(!persisted.includes('13800138000')); assert(!persisted.includes('offline-initial'));
  assert.equal(s.db.audits[s.db.roles[result.result.entityId].grantAuditId].reason, '经核验授权');
});

test('A01 each bootstrap/grant/revoke write exception or zero-row result rolls back all staged effects', async () => {
  for (const operation of ['bootstrap', 'grant', 'revoke']) for (const kind of ['failureAt', 'zeroAt']) for (let index = 1; index <= 3; index++) {
    const s = operation === 'bootstrap' ? setup() : operation === 'grant' ? await ready() : await granted();
    s.controls[kind] = index; const before = snapshot(s);
    const execute = operation === 'bootstrap' ? () => s.bootstrap() : operation === 'grant' ? () => s.service.execute(s.grant(), s.initial) :
      () => s.service.execute(s.revoke(s.child), s.initial);
    await rejects(execute, kind === 'failureAt' ? 'OFFLINE_WRITE_FAILURE' : 'VERSION_CONFLICT'); assert.equal(snapshot(s), before);
  }
});

test('A01 complete-read fence and changes at commit prevent stale authority and bootstrap phantoms', async () => {
  const s = await ready(); s.controls.fenceFalse = true; const before = snapshot(s);
  await rejects(() => s.service.execute(s.grant(), s.initial), 'VERSION_CONFLICT'); assert.equal(snapshot(s), before);
  for (const mutate of [
    db => { const role = Object.values(db.roles)[0]; role.status = 'REVOKED'; role.version = 1; role.revokedAt = role.updatedAt; role.revocationAuditId = 'offline-race'; },
    db => { Object.values(db.users)[0].status = 'DISABLED'; },
    db => { db.stores['offline-store-a'].version++; }
  ]) {
    const t = await ready(), roleCount = Object.keys(t.db.roles).length, auditCount = Object.keys(t.db.audits).length;
    t.controls.beforeCommit = mutate;
    await rejects(() => t.service.execute(t.grant(), t.initial), 'VERSION_CONFLICT');
    assert.equal(Object.keys(t.db.roles).length, roleCount); assert.equal(Object.keys(t.db.audits).length, auditCount);
  }
  const t = setup(); t.controls.beforeCommit = db => { db.audits['offline-external-bootstrap-marker'] = { testOnly: true }; };
  await rejects(() => t.bootstrap(), 'VERSION_CONFLICT'); assert.equal(Object.keys(t.db.roles).length, 0);
});

test('A01 concurrent duplicate grants and stale revocations do not produce duplicate active scope or audit', async () => {
  const s = await ready(), results = await Promise.allSettled([
    s.service.execute(s.grant(), s.initial), s.service.execute(s.grant({ idempotencyKey: 'OFFLINE_COMPETING_GRANT' }), s.initial)
  ]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.code, 'ROLE_ALREADY_ACTIVE');
  const roleId = Object.keys(s.db.roles).find(id => id !== s.root), event = s.revoke(roleId);
  const revoked = await Promise.allSettled([s.service.execute(event, s.initial),
    s.service.execute({ ...event, payload: { ...event.payload, idempotencyKey: 'OFFLINE_COMPETING_REVOKE' } }, s.initial)]);
  assert.equal(revoked.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(revoked.find(r => r.status === 'rejected').reason.code, 'VERSION_CONFLICT');
  assert.equal(Object.keys(s.db.audits).length, 3);
});

test('A01 server clock rollback and bootstrap expiry before commit cannot authorize a partially saved role', async () => {
  const s = await ready(), before = snapshot(s); s.controls.nowSequence = [s.controls.now, s.controls.now - 1];
  await rejects(() => s.service.execute(s.grant(), s.initial), 'INVALID_CONFIGURATION'); assert.equal(snapshot(s), before);
  const t = setup(), original = snapshot(t); t.controls.nowSequence = [t.controls.now, t.controls.now, t.authorization.expiresAt];
  await rejects(() => t.bootstrap(), 'BOOTSTRAP_AUTHORIZATION_EXPIRED'); assert.equal(snapshot(t), original);
});

test('A01 no actual admin client action or cloud handler is opened by the offline service', async () => {
  const { createClient } = require('../miniprogram/services/cloud'); let calls = 0;
  const client = createClient({ mode: 'cloud', stage: 'test', cloudEnvironments: { development: null, test: 'offline-test', production: null } }, () => ({
    cloud: { init: () => { calls++; }, callFunction: () => { calls++; } }
  }), { warn: () => {} });
  for (const action of ['role.grant', 'role.revoke', 'bootstrap', 'roles.list']) {
    await rejects(() => client.call('admin', action, {}), 'INVALID_REQUEST');
  }
  assert.equal(calls, 0);
});

test('A01 split store grants cannot be combined to delegate one multi-store role', async () => {
  const s = setup(); s.authorization.storeIds.push('offline-store-b'); await s.bootstrap();
  await s.service.execute(s.grant({ capabilities: ['ROLE_MANAGE', 'ORDER_OPERATE'] }), s.initial);
  await s.service.execute(s.grant({ storeIds: ['offline-store-b'], capabilities: ['ROLE_MANAGE', 'ORDER_OPERATE'],
    idempotencyKey: 'OFFLINE_OTHER_STORE_GRANT' }), s.initial);
  const before = snapshot(s);
  await rejects(() => s.service.execute(s.grant({ subjectId: s.other.subjectId,
    storeIds: ['offline-store-a', 'offline-store-b'] }), s.member), 'FORBIDDEN');
  assert.equal(snapshot(s), before);
});

test('A01 archived store blocks operations and new grants but still permits authorized role revocation', async () => {
  const s = await granted(); s.db.stores['offline-store-a'].status = 'ARCHIVED';
  await rejects(() => s.service.requireCapability(s.member, 'offline-store-a', ['ORDER_OPERATE']), 'FORBIDDEN');
  const result = await s.service.execute(s.revoke(s.child), s.initial);
  assert.equal(result.disposition, 'SUCCEEDED'); assert.equal(s.db.roles[s.child].status, 'REVOKED');
});

test('A01 bootstrap remains one-off after root revocation; replay reports history and never restores access', async () => {
  const s = await ready();
  const successor = await s.service.execute(s.grant({ capabilities: ['ROLE_MANAGE'] }), s.initial);
  assert(successor.result.entityId);
  await s.service.execute(s.revoke(s.root), s.member); const before = snapshot(s);
  assert.equal((await s.bootstrap()).disposition, 'REPLAY'); assert.equal(snapshot(s), before);
  assert.equal((await s.service.entrySummary(s.initial)).hasMerchantRole, false);
  s.authorization.authorizationId = 'OFFLINE_ATTEMPTED_RESET';
  await rejects(() => s.bootstrap(), 'BOOTSTRAP_ALREADY_USED'); assert.equal(snapshot(s), before);
});

test('A01 replay rejects a changed role scope, receipt timestamp and revoked audit facts', async () => {
  for (const damage of [
    s => { s.db.roles[s.child].capabilities.push('CATALOG_WRITE'); },
    s => { const receipt = Object.values(s.db.receipts).find(r => r.command === 'admin.role.grant'); receipt.createdAt--; receipt.updatedAt--; }
  ]) {
    const s = await granted(); damage(s); const before = snapshot(s);
    await rejects(() => s.service.execute(s.grantEvent, s.initial), 'INVALID_IDEMPOTENCY_RECORD'); assert.equal(snapshot(s), before);
  }
  const s = await granted(), event = s.revoke(s.child); await s.service.execute(event, s.initial);
  s.db.audits[s.db.roles[s.child].revocationAuditId].changes[0].after = 'ACTIVE';
  const before = snapshot(s); await rejects(() => s.service.execute(event, s.initial), 'INVALID_IDEMPOTENCY_RECORD'); assert.equal(snapshot(s), before);
});

test('A01 bootstrap final clock rollback and invalid trusted redaction/transaction adapter fail closed', async () => {
  const s = setup(), before = snapshot(s); s.controls.nowSequence = [s.controls.now, s.controls.now, s.controls.now - 1];
  await rejects(() => s.bootstrap(), 'INVALID_CONFIGURATION'); assert.equal(snapshot(s), before);
  const t = await ready(), original = snapshot(t);
  const invalidReason = createAdminAccessService({ ...t.options, redactReason: () => '' });
  await rejects(() => invalidReason.execute(t.grant(), t.initial), 'INVALID_CONFIGURATION'); assert.equal(snapshot(t), original);
  const invalidAdapter = createAdminAccessService({ ...t.options, runTransaction: work => work({}) });
  await rejects(() => invalidAdapter.entrySummary(t.initial), 'INVALID_TRANSACTION_ADAPTER');
});

test('A01 adapter commit fence protects initial approval version and expiry as well as database reads', async () => {
  const s = setup(); s.controls.beforeCommit = () => { s.authorization.version++; };
  await rejects(() => s.bootstrap(), 'VERSION_CONFLICT'); assert.equal(Object.keys(s.db.roles).length, 0);
  assert.equal(Object.keys(s.db.audits).length, 0);
  const t = setup(); t.controls.beforeCommit = () => { t.controls.now = t.authorization.expiresAt; };
  await rejects(() => t.bootstrap(), 'BOOTSTRAP_AUTHORIZATION_EXPIRED'); assert.equal(Object.keys(t.db.roles).length, 0);
  assert.equal(Object.keys(t.db.receipts).length, 0);
});
