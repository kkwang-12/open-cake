'use strict';
// OFFLINE_TEST_ONLY: serialized in-memory commits, not SDK concurrency evidence.
const { createAdminAccessService } = require('../../cloudfunctions/_shared/admin-access-service');
const { identityFromPlatform, resolveCustomer, CAPABILITIES } = require('../../cloudfunctions/_shared/authorization-model');
const { canonicalJSON } = require('../../cloudfunctions/_shared/idempotency-model');
const clone = value => JSON.parse(JSON.stringify(value));
const fail = code => { throw Object.assign(new Error(code), { code }); };
function setup() {
  const settings = { environment: 'OFFLINE_ADMIN_TEST', appId: 'wx-offline-admin', stage: 'test' };
  const controls = { now: 1791240000000, commits: 0, lastWrites: 0, failureAt: null, zeroAt: null,
    beforeCommit: null, statePatch: null, fenceFalse: false, nowSequence: null };
  const db = { users: {}, roles: {}, stores: {}, audits: {}, receipts: {} };
  function account(openId) {
    const context = { ENV: settings.environment, APPID: settings.appId, OPENID: openId };
    const record = { ...identityFromPlatform(context, settings), schemaVersion: 1, version: 0, status: 'ACTIVE' };
    db.users[record._id] = record;
    return resolveCustomer(context, settings, record);
  }
  const initial = account('offline-initial'), member = account('offline-member'), other = account('offline-other');
  for (const id of ['offline-store-a', 'offline-store-b']) db.stores[id] = {
    _id: id, environment: settings.environment, appId: settings.appId, schemaVersion: 1, version: 0, status: 'OPEN'
  };
  const invocation = Object.freeze({ testOnly: true });
  const authorization = { ...settings, schemaVersion: 1, version: 0, authorizationId: 'OFFLINE_INITIAL_AUTHORIZATION', subjectId: initial.subjectId,
    storeIds: ['offline-store-a'], capabilities: [...CAPABILITIES], validFrom: controls.now - 1000,
    expiresAt: controls.now + 60000, reason: '隔离测试授权依据，不是真实经营身份' };
  delete authorization.stage;
  let queue = Promise.resolve(), sequence = 0;
  const runTransaction = work => {
    const pending = queue.then(async () => {
      const snapshot = JSON.stringify(db), staged = clone(db); let writes = 0, bootstrapRead = null;
      const changed = () => {
        writes++;
        if (writes === controls.failureAt) fail('OFFLINE_WRITE_FAILURE');
        return writes === controls.zeroAt ? 0 : 1;
      };
      const insert = (collection, record) => {
        if (staged[collection][record._id]) return 0;
        staged[collection][record._id] = clone(record); return changed();
      };
      const tx = {
        readUser: async id => clone(staged.users[id] || null),
        readAccessState: async () => {
          const state = { environment: settings.environment, appId: settings.appId, complete: true,
            roles: Object.values(staged.roles).map(clone), stores: Object.values(staged.stores).map(clone) };
          if (controls.statePatch) controls.statePatch(state);
          return state;
        },
        readReceipt: async id => clone(staged.receipts[id] || null),
        readAudit: async id => clone(staged.audits[id] || null),
        assertAccessReads: async reads => {
          if (reads.bootstrapAuthorization !== null) {
            bootstrapRead = reads.bootstrapAuthorization;
            if (canonicalJSON(authorization) !== canonicalJSON(bootstrapRead)) return false;
          }
          return !controls.fenceFalse && JSON.stringify(db) === snapshot;
        },
        insertRole: async record => insert('roles', record),
        revokeRole: async (record, expectedVersion) => {
          const old = staged.roles[record._id];
          if (!old || old.version !== expectedVersion || old.status !== 'ACTIVE') return 0;
          staged.roles[record._id] = clone(record); return changed();
        },
        insertAudit: async record => insert('audits', record),
        insertReceipt: async record => insert('receipts', record)
      };
      if (typeof controls.extendTransaction === 'function') Object.assign(tx, controls.extendTransaction({ staged, snapshot, changed, insert }));
      const result = await work(tx);
      if (controls.beforeCommit) await controls.beforeCommit(db);
      if (JSON.stringify(db) !== snapshot) fail('VERSION_CONFLICT');
      if (bootstrapRead && canonicalJSON(authorization) !== canonicalJSON(bootstrapRead)) fail('VERSION_CONFLICT');
      if (bootstrapRead && (controls.now < bootstrapRead.validFrom || controls.now >= bootstrapRead.expiresAt)) fail('BOOTSTRAP_AUTHORIZATION_EXPIRED');
      Object.assign(db, staged); controls.commits++; controls.lastWrites = writes;
      return result;
    });
    queue = pending.catch(() => {}); return pending;
  };
  const options = { ...settings, runTransaction,
    now: () => controls.nowSequence ? controls.nowSequence.shift() : controls.now,
    newRequestId: () => 'offline-admin-trace-' + (++sequence),
    redactReason: (_reason, command) => command === 'admin.bootstrap' ? '受控初始化' : command === 'admin.role.grant' ? '经核验授权' : '经核验撤销',
    verifyBootstrapInvocation: value => value === invocation,
    loadBootstrapAuthorization: () => clone(authorization) };
  delete options.stage;
  const service = createAdminAccessService(options);
  const grant = (patch = {}) => ({ action: 'role.grant', payload: { subjectId: member.subjectId,
    storeIds: ['offline-store-a'], capabilities: ['ORDER_OPERATE'], reason: '授权订单操作',
    idempotencyKey: 'OFFLINE_ADMIN_GRANT_KEY', ...patch } });
  const revoke = (roleId, patch = {}) => ({ action: 'role.revoke', payload: { roleId,
    expectedVersion: db.roles[roleId]?.version ?? 0, reason: '撤销订单操作', idempotencyKey: 'OFFLINE_ADMIN_REVOKE_KEY', ...patch } });
  const bootstrap = () => service.bootstrap(invocation);
  return { settings, controls, db, initial, member, other, invocation, authorization, options, service,
    grant, revoke, bootstrap, account, clone };
}
module.exports = { setup, clone };
