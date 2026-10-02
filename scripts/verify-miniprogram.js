'use strict';
// Local compilation and screenshot evidence; this does not verify taps or page-stack transitions.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const config = require('../miniprogram/runtime-config');
const app = require('../miniprogram/app.json');
const cli = process.env.WECHAT_DEVTOOLS_CLI || 'D:\\微信web开发者工具\\wechatide.cmd';
const output = path.join(root, 'artifacts', 'phase-1-qa');
const reportPath = path.join(output, 'report.json');
if (process.platform !== 'win32') throw new Error('This runner requires Windows WeChat DevTools CLI.');
if (!fs.existsSync(cli)) throw new Error('Set WECHAT_DEVTOOLS_CLI to the installed wechatide.cmd path.');
if (config.mode !== 'shell' || config.stage !== 'development' || config.enableLegacyDemo) {
  throw new Error('Run this preview verification only in development/shell with legacy disabled.');
}
const selected = process.argv.find(arg => arg.startsWith('--pages='));
const names = selected ? selected.slice(8).split(',') : app.pages.map(page => page.split('/')[1]);
const pages = names.map(name => {
  const page = app.pages.find(value => value.split('/')[1] === name);
  if (!page) throw new Error('Unknown main page: ' + name);
  return page;
});
fs.mkdirSync(output, { recursive: true });
const quote = value => "'" + String(value).replace(/'/g, "''") + "'";
function call(tool, args) {
  const command = '& ' + [cli, '-c', 'Codex', tool, '--project', root, ...args].map(quote).join(' ');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand',
    Buffer.from(command, 'utf16le').toString('base64')], { encoding: 'utf8', timeout: 30000, windowsHide: true });
  if (result.error) throw result.error;
  const stdout = result.stdout || '';
  const start = stdout.indexOf('{');
  if (start < 0) throw new Error(tool + ' returned no JSON result: ' + stdout.slice(0, 300));
  const envelope = JSON.parse(stdout.slice(start));
  if (result.status !== 0 || !envelope.ok || !envelope.result || envelope.result.success !== true) {
    throw new Error(tool + ' failed: ' + JSON.stringify(envelope).slice(0, 600));
  }
  return envelope.result;
}
const report = {
  generatedAt: new Date().toISOString(),
  environment: 'development/shell',
  method: 'Official simulator_open_page + simulator_screenshot; direct compilation per page',
  pages: [],
  limitations: [
    'Direct page opening does not verify tap, switchTab, category selection or back navigation.',
    'DevTools 2.02.2608080 automation metadata returned rawPath null / response timeout.',
    'Screenshots require visual review; compiler success alone does not prove layout correctness.',
    'No real-device, cloud-identity, deployment, purchase or payment verification.'
  ]
};
if (selected && fs.existsSync(reportPath)) {
  const previous = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  if (previous.environment === report.environment && previous.method === report.method) report.pages = previous.pages;
}
try {
  for (const page of pages) {
    const name = page.split('/')[1];
    const args = ['--page', page];
    if (name === 'product') args.push('--query', 'id=preview-cake');
    const opened = call('simulator_open_page', args);
    const screenshot = name + '.png';
    const capture = call('simulator_screenshot', ['--path', path.join(output, screenshot), '--optimize', 'false', '--wait', '1']);
    if (!fs.existsSync(capture.path)) throw new Error('Screenshot output missing for ' + page);
    const record = { page, compileAndOpen: opened.success, screenshot,
      imageWidth: capture.imageWidth, imageHeight: capture.imageHeight, recordedAt: new Date().toISOString() };
    report.pages = report.pages.filter(value => value.page !== page);
    report.pages.push(record);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
    console.log('Compiled and captured: ' + page);
  }
  console.log('Verified ' + pages.length + ' page compilations and captures; interaction acceptance remains pending.');
} catch (error) {
  report.failure = error.message;
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.error(error.message);
  process.exitCode = 1;
}
