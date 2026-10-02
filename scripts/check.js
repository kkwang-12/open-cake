'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { validateExpressions } = require('./wxml-expressions');
const root = path.resolve(__dirname, '..');
const miniRoot = path.join(root, 'miniprogram');
let count = 0;
function fail(message) { throw new Error(message); }
function relative(file) { return path.relative(root, file); }
function checkRequire(file) {
  if (!file.startsWith(miniRoot + path.sep) && !file.startsWith(path.join(root, 'cloudfunctions') + path.sep)) return;
  const source = fs.readFileSync(file, 'utf8');
  for (const item of source.matchAll(/require\(['"]([^'"]+)['"]\)/g)) {
    if (!item[1].startsWith('.')) continue;
    const target = path.resolve(path.dirname(file), item[1]);
    if (![target, target + '.js', target + '.json', path.join(target, 'index.js')].some(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile())) {
      fail('缺少模块：' + relative(file) + ' → ' + item[1]);
    }
    if (file.startsWith(path.join(miniRoot, 'pages') + path.sep) && target.startsWith(path.join(miniRoot, 'legacy') + path.sep)) fail('主页面不能导入遗留演示');
  }
}
function checkTemplate(file) {
  const template = fs.readFileSync(file, 'utf8');
  const scriptFile = file.slice(0, -5) + '.js';
  const script = fs.readFileSync(scriptFile, 'utf8');
  validateExpressions(template, relative(file));
  if (/wx:(if|elif|for)="(?!\{\{)/.test(template)) fail('模板表达式缺少双花括号：' + relative(file));
  if (/<br\b/.test(template)) fail('WXML 不支持 br：' + relative(file));
  const markup = template.replace(/\{\{[\s\S]*?\}\}/g, 'expression');
  const stack = [];
  for (const tag of markup.match(/<\/?[\w-]+(?:\s[^<>]*?)?\s*\/?>/g) || []) {
    const name = tag.match(/^<\/?([\w-]+)/)[1];
    if (tag.startsWith('</')) { if (stack.pop() !== name) fail('标签未闭合：' + relative(file) + ' ' + name); }
    else if (!tag.endsWith('/>')) stack.push(name);
  }
  if (stack.length) fail('模板缺少关闭标签：' + relative(file));
  const handlers = script.includes("require('../../utils/page-shell')") ? script + fs.readFileSync(path.join(miniRoot, 'utils', 'page-shell.js'), 'utf8') : script;
  for (const binding of template.matchAll(/(?:bind|catch):?[a-zA-Z-]+="([\w]+)"/g)) {
    if (!new RegExp('\\b' + binding[1] + '\\s*\\(').test(handlers)) fail('事件没有实现：' + relative(file) + ' ' + binding[1]);
  }
  for (const asset of template.matchAll(/src="(\/assets\/[^"]+)"/g)) {
    if (!fs.existsSync(path.join(miniRoot, asset[1]))) fail('本地素材缺失：' + asset[1]);
  }
}
function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['data', 'node_modules', 'artifacts', '.git'].includes(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(file);
    else if (/\.js$/.test(entry.name)) {
      const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
      if (check.status !== 0) fail(check.stderr);
      checkRequire(file);
      count++;
    } else if (entry.name.endsWith('.json')) { JSON.parse(fs.readFileSync(file, 'utf8')); count++; }
    else if (entry.name.endsWith('.wxml')) { checkTemplate(file); count++; }
    else if (entry.name.endsWith('.wxss')) {
      const styles = fs.readFileSync(file, 'utf8');
      for (const item of styles.matchAll(/@import\s+['"]([^'"]+)['"]/g)) {
        const target = item[1].startsWith('/') ? path.join(miniRoot, item[1]) : path.resolve(path.dirname(file), item[1]);
        if (!fs.existsSync(target)) fail('WXSS import 缺失：' + relative(file) + ' ' + item[1]);
      }
    }
  }
}
visit(root);
const app = JSON.parse(fs.readFileSync(path.join(miniRoot, 'app.json'), 'utf8'));
const pages = [...app.pages, ...(app.subPackages || []).flatMap(pack => pack.pages.map(page => pack.root + '/' + page))];
if (new Set(pages).size !== pages.length) fail('页面注册重复');
for (const page of pages) for (const suffix of ['.js', '.json', '.wxml', '.wxss']) {
  if (!fs.existsSync(path.join(miniRoot, page + suffix))) fail('缺少页面文件：' + page + suffix);
}
const expectedTabs = ['pages/home/home', 'pages/shop/shop', 'pages/orders/orders', 'pages/account/account'];
if (JSON.stringify(app.tabBar.list.map(item => item.pagePath)) !== JSON.stringify(expectedTabs)) fail('四 Tab 配置与规划不符');
for (const component of Object.values(app.usingComponents || {})) for (const suffix of ['.js', '.json', '.wxml', '.wxss']) {
  if (!fs.existsSync(path.join(miniRoot, component + suffix))) fail('缺少组件文件：' + component + suffix);
}
const { pages: routes } = require('../miniprogram/constants/routes');
for (const value of Object.values(routes)) if (!app.pages.includes(value.slice(1))) fail('路由未注册：' + value);
const canonical = fs.readFileSync(path.join(root, 'cloudfunctions', '_shared', 'runtime.js'), 'utf8');
for (const name of ['user', 'store']) {
  if (fs.readFileSync(path.join(root, 'cloudfunctions', name, 'shared', 'runtime.js'), 'utf8') !== canonical) fail('云函数共用代码未同步，请执行 prepare-cloud');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'cloudfunctions', name, 'package.json'), 'utf8'));
  if (!/^\d+\.\d+\.\d+$/.test(manifest.dependencies['wx-server-sdk'])) fail('SDK 必须锁定稳定版本');
}
console.log('静态检查完成：' + count + ' 个 JS/JSON/WXML 文件；' + app.pages.length + ' 主页面 + ' + (pages.length - app.pages.length) + ' 演示子包页面；路由、组件、依赖、模板事件、样式导入与共用代码一致。');
