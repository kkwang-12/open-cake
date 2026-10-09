'use strict';
// Joint local stage evidence: each test file runs once, no cloud or funds APIs.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {testResult, sourceSnapshot, runStep, evidenceDirectory, paymentTests, legacyTests} = require('./verify-payment-offline');
const {adminBoundary, adminTests} = require('./verify-admin-offline');
const {failureSummary} = require('./test-diagnostics');
const root = path.resolve(__dirname, '..');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

function acceptanceGroups(available) {
  const definitions = [['payment', paymentTests, 1], ['admin', adminTests, 203], ['legacy-baseline', legacyTests, 19]];
  const assigned = new Set();
  for (const [, files] of definitions) {
    for (const file of files) {
      if (!available.includes(file) || assigned.has(file)) throw new Error('Invalid or overlapping acceptance test: ' + file);
      assigned.add(file);
    }
  }
  const remaining = available.filter(file => !assigned.has(file));
  if (remaining.length) definitions.push(['other-regressions', remaining, 1]);
  return definitions;
}

async function verify(name = 'offline-' + new Date().toISOString().replace(/[:.]/g, '-')) {
  const before = sourceSnapshot(), directory = evidenceDirectory(name);
  const summary = path.join(directory, 'summary.json');
  fs.writeFileSync(summary, JSON.stringify({schemaVersion: 1, scope: 'OFFLINE_COMBINED_ACCEPTANCE_EVIDENCE',
    status: 'RUNNING', offlinePassed: false, realAcceptance: {passed: false}}) + '\n');
  // Admin boundary already includes the payment boundary; run it only once here.
  const boundary = await adminBoundary();
  const available = fs.readdirSync(path.join(root, 'tests')).filter(file => file.endsWith('.test.js')).sort().map(file => 'tests/' + file);
  const definitions = acceptanceGroups(available), checks = [];
  for (const [id, files, minimum] of definitions) {
    const result = await runStep(id, ['--test', '--test-reporter=tap', ...files]);
    const parsed = testResult(result.output, result.exitCode, minimum);
    fs.writeFileSync(path.join(directory, id + '.tap'), result.output, 'utf8');
    checks.push({...result, output: undefined, ...parsed, passed: parsed.passed && result.errorCode === null,
      log: id + '.tap', logSha256: digest(result.output)});
    console.log(id + ': ' + (checks.at(-1).passed ? 'PASS' : 'FAIL') + ' (' + (parsed.counts?.tests ?? 'unknown') + ')');
    if (!checks.at(-1).passed) {
      if (result.errorCode) console.error('Runner: ' + result.errorCode);
      for (const line of failureSummary(result.output)) console.error(line);
      console.error('Log: ' + path.join(directory, id + '.tap'));
    }
  }
  const totalTests = checks.reduce((sum, item) => sum + (item.counts?.tests ?? 0), 0);
  for (const [id, file] of [['static', 'scripts/check.js'], ['icons', 'scripts/check-ui-icons.js']]) {
    const result = await runStep(id, [file]);
    fs.writeFileSync(path.join(directory, id + '.txt'), result.output, 'utf8');
    checks.push({...result, output: undefined, passed: result.exitCode === 0 && result.errorCode === null,
      log: id + '.txt', logSha256: digest(result.output)});
    console.log(id + ': ' + (checks.at(-1).passed ? 'PASS' : 'FAIL'));
    if (!checks.at(-1).passed) {
      if (result.errorCode) console.error('Runner: ' + result.errorCode);
      for (const line of failureSummary(result.output)) console.error(line);
      console.error('Log: ' + path.join(directory, id + '.txt'));
    }
  }
  const sourceUnchanged = before.sha256 === sourceSnapshot().sha256;
  const report = {schemaVersion: 1, scope: 'OFFLINE_COMBINED_ACCEPTANCE_EVIDENCE', status: 'COMPLETE',
    generatedAt: new Date().toISOString(), nodeVersion: process.version, platform: process.platform,
    sourceSnapshot: before, sourceUnchanged, runtimeBoundary: boundary, checks, totalTests,
    offlinePassed: sourceUnchanged && boundary.passed && checks.every(check => check.passed),
    realAcceptance: {passed: false, cloudVerified: false, realDeviceVerified: false, realConcurrencyVerified: false,
      administratorVerified: false, cryptographicSourceVerified: false, realPaymentVerified: false,
      realRefundVerified: false, realFundsVerified: false, customerPagesConnected: false, merchantPagesConnected: false},
    limitations: ['LOCAL_STAGE_BOUNDARIES_ONLY', 'REAL_CLOUD_DEVICE_AND_FUNDS_ACCEPTANCE_REQUIRED']};
  fs.writeFileSync(summary, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log('Evidence: docs/qa/' + path.basename(directory) + '/summary.json');
  console.log('Offline: ' + (report.offlinePassed ? 'PASS' : 'FAIL') + '; real cloud/device/funds acceptance: NOT ACCEPTED');
  return report;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') console.log('node scripts/verify-offline.js [--name <new-directory-under-docs/qa>]\nCombined Payment/Admin offline acceptance; includes the complete local suite exactly once. Do not also run npm test or both stage runners on the same source state.');
  else if (args.length !== 0 && (args.length !== 2 || args[0] !== '--name')) {
    console.error('INVALID_ARGUMENTS'); process.exitCode = 1;
  } else verify(args[1]).then(report => {if (!report.offlinePassed) process.exitCode = 1;}).catch(error => {
    console.error(error.code || error.message || 'EVIDENCE_FAILED'); process.exitCode = 1;
  });
}
module.exports = {acceptanceGroups, verify};
