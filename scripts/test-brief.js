'use strict';
// Run all tests in the explicitly selected files; preserve raw TAP on disk.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { testResult } = require('./verify-payment-offline');
const { groups, validateGroups, selectTests } = require('./test-groups');
const { failureSummary } = require('./test-diagnostics');
const root = path.resolve(__dirname, '..');
function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === '--help') {
    console.log('node scripts/test-brief.js [--group orders,payments,...] [tests/name.test.js ...]\n--list: show curated local groups. No arguments: complete local suite. Groups include related regression files and are deduplicated. Local evidence only.');
    return;
  }
  try {
    const available = fs.readdirSync(path.join(root, 'tests')).filter(name => name.endsWith('.test.js')).sort().map(name => 'tests/' + name);
    if (args.length === 1 && args[0] === '--list') {
      validateGroups(available);
      for (const [name, group] of Object.entries(groups)) console.log(name + ' · ' + new Set([...group.primary, ...group.related]).size + ' files · ' + group.description);
      console.log('Groups are curated scopes; shared contracts/transaction changes still require one complete regression.');
      return;
    }
    const selection = selectTests(args, available), selected = selection.files;
    const directory = path.join(root, 'docs', 'qa', 'local-checks');
    fs.mkdirSync(directory, { recursive: true });
    const log = path.join(directory, 'tests-' + Date.now() + '-' + process.pid + '.tap');
    const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...selected], {
      cwd: root, encoding: 'utf8', windowsHide: true, shell: false, timeout: 120000, maxBuffer: 16 * 1024 * 1024
    });
    const output = (result.stdout || '') + (result.stderr || '');
    fs.writeFileSync(log, output, 'utf8');
    const parsed = testResult(output, result.status);
    const passed = !result.error && parsed.passed;
    console.log((passed ? 'PASS' : 'FAIL') + ' · ' + (selection.complete ? 'complete local suite' : 'selected local tests') + ' · ' + selected.length + ' files' + (selection.groups.length ? ' · groups=' + selection.groups.join(',') : ''));
    console.log('Scope: LOCAL ONLY; cloud/device/funds acceptance not verified.');
    if (parsed.counts) console.log(Object.entries(parsed.counts).map(([name, count]) => name + '=' + count).join(' '));
    if (!passed) {
      if (result.error) console.error('Runner: ' + result.error.code);
      for (const line of failureSummary(output)) console.error(line);
      if (!parsed.counts) console.error('No valid complete TAP summary; inspect the raw log.');
    }
    console.log('Log: ' + log);
    process.exitCode = passed ? 0 : 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
if (require.main === module) main();
