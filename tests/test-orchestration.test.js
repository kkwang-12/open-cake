'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {spawnSync} = require('node:child_process');
const {groups, validateGroups, selectTests} = require('../scripts/test-groups');
const {acceptanceGroups} = require('../scripts/verify-offline');
const {failureSummary} = require('../scripts/test-diagnostics');
const root = path.resolve(__dirname, '..');
const available = fs.readdirSync(path.join(root, 'tests')).filter(name => name.endsWith('.test.js')).map(name => 'tests/' + name).sort();

test('curated scopes cover every existing test; additions and missing files cannot silently escape group selection', () => {
  assert.doesNotThrow(() => validateGroups(available));
  assert.throws(() => validateGroups([...available, 'tests/new-feature.test.js']), /Assign new tests/);
  assert.throws(() => validateGroups(available.filter(file => file !== 'tests/order-cancellation.test.js')), /Missing grouped test/);
  // Full regression always includes new tests, even before their group is assigned.
  assert(selectTests([], [...available, 'tests/new-feature.test.js']).files.includes('tests/new-feature.test.js'));
});

test('combined groups deduplicate files and retain cross-domain cancellation/refund/authorization checks', () => {
  const selection = selectTests(['--group', 'orders,payments', '--group', 'payments', 'tests/refund.test.js'], available);
  assert.equal(new Set(selection.files).size, selection.files.length);
  assert.deepEqual(selection.groups, ['orders', 'payments']);
  for (const name of ['order-cancellation', 'refund', 'authorization-model', 'merchant-resolution', 'admin-acceptance']) {
    assert(selection.files.includes('tests/' + name + '.test.js'));
  }
  assert.equal(selection.complete, false);
  assert.equal(selection.files.includes('tests/http.test.js'), false);
});

test('full-suite designation follows actual coverage; invalid names, options and external paths fail closed', () => {
  assert.equal(selectTests(['--group', Object.keys(groups).join(',')], available).complete, true);
  assert.equal(selectTests(available, available).complete, true);
  assert.deepEqual(selectTests(['tests\\refund.test.js', 'tests/refund.test.js'], available).files, ['tests/refund.test.js']);
  for (const args of [['--group'], ['--group', 'orders,'], ['--group', 'constructor'], ['--group', 'missing'], ['--unknown'], ['tests/*.test.js'], ['../tests/refund.test.js']]) {
    assert.throws(() => selectTests(args, available));
  }
});

test('joint acceptance executes each file once, includes future tests, and preserves stage minimums', () => {
  const expanded = [...available, 'tests/new-feature.test.js'];
  const partitions = acceptanceGroups(expanded), all = partitions.flatMap(([, files]) => files);
  assert.deepEqual([...all].sort(), [...expanded].sort());
  assert.equal(new Set(all).size, all.length);
  assert.equal(partitions.find(([name]) => name === 'admin')[2], 203);
  assert.equal(partitions.find(([name]) => name === 'legacy-baseline')[2], 19);
  assert.throws(() => acceptanceGroups(available.filter(file => file !== 'tests/http.test.js')), /Invalid/);
});

test('CLI rejects malformed selection with a nonzero exit; listing cannot be mistaken for a passing test run', () => {
  const run = args => spawnSync(process.execPath, ['scripts/test-brief.js', ...args], {cwd: root, encoding: 'utf8', timeout: 10000, windowsHide: true});
  const invalid = run(['--group', 'orders,missing']);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Unknown test group/);
  assert.doesNotMatch(invalid.stdout, /PASS|Log:/);
  const listing = run(['--list']);
  assert.equal(listing.status, 0);
  assert.match(listing.stdout, /legacy/);
  assert.doesNotMatch(listing.stdout, /PASS|Log:/);
});

test('failure summary extracts location, assertion and stack from actual nested Node TAP', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dinner-test-diagnostics-'));
  const fixture = path.join(directory, 'failure.cjs');
  t.after(() => {fs.unlinkSync(fixture); fs.rmdirSync(directory);});
  fs.writeFileSync(fixture, "const test=require('node:test'),assert=require('node:assert/strict');\ntest('passing fixture',()=>assert.equal(1,1));\ntest('parent fixture',async t=>{await t.test('nested mismatch',()=>assert.equal(1,2));});\n");
  // The nested probe is an independent test runner, not a child of this harness.
  const environment = {...process.env};
  delete environment.NODE_TEST_CONTEXT;
  const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', fixture], {env: environment, encoding: 'utf8', timeout: 10000, windowsHide: true});
  assert.equal(run.status, 1);
  const summary = failureSummary(run.stdout + run.stderr).join('\n');
  assert.match(summary, /nested mismatch/);
  assert.match(summary, /location:.*failure\.cjs/);
  assert.match(summary, /ERR_ASSERTION/);
  assert.match(summary, /Expected values/);
  assert.match(summary, /stack:/);
  assert.match(summary, /failure\.cjs:3/);
  assert.doesNotMatch(summary, /passing fixture/);
  assert.doesNotMatch(summary, /(?:expected|actual):/);
});

test('large diffs and many failed cases cannot flood the summary or replace diagnostic fields', () => {
  const failures = Array.from({length: 8}, (_, index) => [
    'not ok ' + (index + 1) + ' - case ' + index,
    '  ---', '  location: tests/example.test.js:10:1', '  error: |-',
    '    mismatch ' + 'x'.repeat(10000), ...Array(100).fill('    extra detail'),
    '  expected:', '    location: DO_NOT_DISPLAY', ...Array(100).fill('    SECRET_DIFF'),
    '  actual:', '    code: DO_NOT_DISPLAY', '  code: ERR_ASSERTION',
    '  stack: |-', '    TestContext at tests/example.test.js:11:3', '  ...'
  ].join('\n')).join('\n');
  const lines = failureSummary(failures), summary = lines.join('\n');
  assert(lines.length <= 36);
  assert(lines.every(line => line.length <= 220));
  assert.match(summary, /tests\/example.test.js:11:3/);
  assert.doesNotMatch(summary, /SECRET_DIFF|DO_NOT_DISPLAY|case 3/);
});

test('syntax and interrupted process failures retain bounded diagnostics without requiring TAP', () => {
  const summary = failureSummary('TAP version 13\nSyntaxError: missing bracket\n    at tests/broken.test.js:4:2\n').join('\n');
  assert.match(summary, /SyntaxError: missing bracket/);
  assert.match(summary, /tests\/broken.test.js:4:2/);
  assert.equal(failureSummary('').length, 1);
  assert(failureSummary('x'.repeat(100000)).join('\n').length <= 220);
});
