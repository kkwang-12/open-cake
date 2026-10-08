'use strict';
// Isolated development-only acceptance function. No database or business writes.
const cloud = require('wx-server-sdk');
const { createHandler } = require('./shared/runtime');
const { nativeContextForInvocation } = require('./shared/native-context');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const settings = {
  appId: process.env.JJL_APP_ID,
  environment: process.env.JJL_CLOUD_ENV,
  stage: process.env.JJL_STAGE
};
const handler = options => createHandler({
  action: 'verify', getContext: invocation => nativeContextForInvocation(cloud, invocation), settings: options,
  handle: () => ({ verified: true })
});
exports.main = async (_event, invocationContext) => {
  if (settings.stage !== 'development') return { ok: false, code: 'DEVELOPMENT_ONLY' };
  const baseline = await handler(settings)({ action: 'verify' }, invocationContext);
  if (!baseline.ok) return baseline;
  const cases = [
    ['missing-config', { ...settings, environment: '' }, 'INVALID_CONFIGURATION'],
    ['app-mismatch', { ...settings, appId: 'wx0000000000000000' }, 'APP_MISMATCH'],
    ['env-mismatch', { ...settings, environment: 'isolated-invalid-environment' }, 'ENV_MISMATCH']
  ];
  const results = [];
  for (const [name, configuration, expected] of cases) {
    const result = await handler(configuration)({ action: 'verify' }, invocationContext);
    results.push({ name, expected, code: result.error && result.error.code,
      passed: result.ok === false && result.error && result.error.code === expected,
      requestId: result.requestId });
  }
  return { ok: results.every(result => result.passed), baselineRequestId: baseline.requestId, results };
};
