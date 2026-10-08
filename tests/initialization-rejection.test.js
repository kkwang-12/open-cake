'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createHandler } = require('../cloudfunctions/_shared/runtime');
const { nativeContextForInvocation } = require('../cloudfunctions/_shared/native-context');
const invocation = {environment: JSON.stringify({WX_OPENID:'local-test-only',WX_APPID:'wx154f791a17268ace'}),
  namespace:'cloudbase-d8gwtxzm64150b7e0', request_id:'local-platform-id'};
function load(context, stage = 'development') {
  const sandbox = { exports: {}, process: { env: { JJL_APP_ID: 'wx154f791a17268ace',
    JJL_CLOUD_ENV: 'cloudbase-d8gwtxzm64150b7e0', JJL_STAGE: stage } },
    require: name => name === 'wx-server-sdk' ? { init() {}, getWXContext: () => context } : name === './shared/native-context' ? {nativeContextForInvocation} : {
      createHandler: options => createHandler({ ...options, logger: { info() {}, warn() {}, error() {} } })
    } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../scripts/cloud-checks/initialization-rejection.js'), 'utf8'), sandbox);
  return sandbox.exports.main;
}
test('real-context baseline gates all three isolated configuration rejection cases', async () => {
  const main = load({ OPENID: 'local-test-only', APPID: 'wx154f791a17268ace', ENV: 'cloudbase-d8gwtxzm64150b7e0' });
  const result = await main({ role: 'admin', settings: { stage: 'production' } }, invocation);
  assert.equal(result.ok, true);
  assert.deepEqual(Array.from(result.results, row => row.code), ['INVALID_CONFIGURATION', 'APP_MISMATCH', 'ENV_MISMATCH']);
  assert.equal(JSON.stringify(result).includes('local-test-only'), false);
});
test('management or forged event identity cannot bypass baseline', async () => {
  const result = await load({})({ OPENID: 'forged', APPID: 'wx154f791a17268ace' });
  assert.equal(result.error.code, 'AUTH_REQUIRED');
  assert.equal(result.results, undefined);
});

test('warm SDK identity cannot authenticate a management invocation', async () => {
  const main = load({OPENID:'local-test-only',APPID:'wx154f791a17268ace',ENV:invocation.namespace});
  const result = await main({context:invocation}, {...invocation, environment:'{}'});
  assert.equal(result.error.code, 'AUTH_REQUIRED');
  assert.equal(result.results, undefined);
});
test('isolated test handler is closed outside development', async () => {
  const result = await load({}, 'production')();
  assert.equal(result.code, 'DEVELOPMENT_ONLY');
});
