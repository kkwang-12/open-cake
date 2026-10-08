'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const project = path.join(root, 'artifacts', 'cloud-env-validation-20261008');
const cli = process.env.WECHAT_DEVTOOLS_CLI || 'D:\\微信web开发者工具\\wechatide.cmd';
const quote = value => "'" + String(value).replace(/'/g, "''") + "'";
function evaluate(source) {
  const command = '& ' + [cli, '-c', 'Codex', 'automation_evaluate', '--project', project,
    '--fn-source', source].map(quote).join(' ');
  const execution = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand',
    Buffer.from(command, 'utf16le').toString('base64')], { encoding: 'utf8', timeout: 30000, windowsHide: true });
  if (execution.error || execution.status !== 0) throw new Error('WECHAT_EVALUATION_FAILED');
  const output = execution.stdout || '';
  const start = output.indexOf('{');
  if (start < 0) throw new Error('WECHAT_RESPONSE_MISSING');
  const envelope = JSON.parse(output.slice(start));
  if (!envelope.ok) {
    console.error(JSON.stringify({code:envelope.code,
      message:envelope.message}));
    throw new Error('WECHAT_EVALUATION_REJECTED');
  }
  return envelope;
}
const start = `function() {
  const app = getApp();
  if (!Array.isArray(app.cloudEvidence) || app.cloudEvidence.length !== 5)
    return {started:false,code:'RECOMPILE_ISOLATED_PAGE_FIRST'};
  app.initializationReview = {state:'RUNNING'};
  wx.cloud.callFunction({name:'jjl-i03-rejection-20261008',data:{},
      config:{env:'cloudbase-d8gwtxzm64150b7e0'}}).then(function(response) {
      app.initializationReview = {state:'COMPLETED',time:new Date().toISOString(),
        scope:'REAL_WX_CLOUD_SIMULATOR',appId:'wx154f791a17268ace',
        environment:'cloudbase-d8gwtxzm64150b7e0',native:app.cloudEvidence,
        rejection:response.result,platformRequestId:response.requestID||response.requestId||null};
  }).catch(function() { app.initializationReview = {state:'FAILED',code:'NATIVE_CALL_FAILED'}; });
  return {started:true};
}`;
function extract(envelope) {
  // WeChat CLI wraps runtime return values as result.result.
  const outer = envelope.result && (envelope.result.result || envelope.result);
  return outer && (outer.result || outer);
}
const begun = extract(evaluate(start.replace(/\r?\n/g, ' ')));
if (!begun || begun.started !== true) throw new Error('ISOLATED_RUN_NOT_STARTED');
let result;
for (let attempt = 0; attempt < 18; attempt++) {
  const sleep = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(sleep, 0, 0, 3000);
  result = extract(evaluate("function() { return getApp().initializationReview || {state:'MISSING'}; }"));
  if (result && result.state !== 'RUNNING') break;
}
if (!result || result.state !== 'COMPLETED') throw new Error('NATIVE_RUN_INCOMPLETE');
const byName = Object.fromEntries(result.native.map(row => [row.name, row]));
const expected = {
  'client-user-me': row => row.ok && row.authenticated === true && row.role === 'customer',
  'client-store-health': row => row.ok && row.data.available === true && row.data.stage === 'development' && row.data.environment === result.environment,
  'forged-identity': row => row.ok && row.role === 'customer' && row.sameSubject === true,
  'invalid-action': row => row.ok === false && row.error.code === 'INVALID_REQUEST',
  'invalid-payload': row => row.ok === false && row.error.code === 'INVALID_REQUEST'
};
const assertions = Object.entries(expected).map(([name, predicate]) => ({name,passed:!!byName[name] && predicate(byName[name])}));
const expectedRejections = {'missing-config':'INVALID_CONFIGURATION','app-mismatch':'APP_MISMATCH','env-mismatch':'ENV_MISMATCH'};
assertions.push({name:'isolated-rejection-cases',passed:result.rejection.ok === true && result.rejection.results.length === 3 &&
  Object.entries(expectedRejections).every(([name,code])=>result.rejection.results.filter(row=>row.name===name && row.code===code).length===1)});
const runLabelArgument = process.argv.find(value=>value.startsWith('--run-label='));
const runLabel = runLabelArgument ? runLabelArgument.slice('--run-label='.length) : 'native-revalidation';
if (!/^[a-z0-9-]{1,60}$/.test(runLabel)) throw new Error('INVALID_RUN_LABEL');
const output = path.join(root, 'docs', 'qa', 'initialization-cloud-2026-10-08', runLabel + '.json');
fs.mkdirSync(path.dirname(output), { recursive: true });
if (fs.existsSync(output)) throw new Error('EVIDENCE_ALREADY_EXISTS');
fs.writeFileSync(output, JSON.stringify({...result, assertions,passed:assertions.every(row=>row.passed),
  device:'NOT_RUN',standaloneTestEnvironment:'NOT_PROVIDED'}, null, 2)+'\n', {flag:'wx'});
console.log(JSON.stringify({output,assertions,passed:assertions.every(row=>row.passed)}));
if (assertions.some(row=>!row.passed)) process.exitCode = 1;
