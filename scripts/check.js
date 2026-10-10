'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { validateExpressions } = require('./wxml-expressions');
const root = path.resolve(__dirname, '..');
const miniRoot = path.join(root, 'miniprogram');
const app = JSON.parse(fs.readFileSync(path.join(miniRoot, 'app.json'), 'utf8'));
const subpackageRoots = (app.subPackages || []).map(pack => pack.root.replace(/\\/g, '/').replace(/\/$/, '') + '/');
function packageOf(file) {
  const name=path.relative(miniRoot,file).replace(/\\/g,'/');
  return subpackageRoots.find(prefix=>name.startsWith(prefix))||'main';
}
let count = 0;
function fail(message) { throw new Error(message); }
function relative(file) { return path.relative(root, file); }
function checkRequire(file) {
  if (!file.startsWith(miniRoot + path.sep) && !file.startsWith(path.join(root, 'cloudfunctions') + path.sep)) return;
  const source = fs.readFileSync(file, 'utf8');
  for (const item of source.matchAll(/require\(['"]([^'"]+)['"]\)/g)) {
    if (!item[1].startsWith('.')) continue;
    const target = path.resolve(path.dirname(file), item[1]);
    const moduleFile = [target, target + '.js', target + '.json', path.join(target, 'index.js')]
      .find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
    if (!moduleFile) fail('缺少模块：' + relative(file) + ' → ' + item[1]);
    if(file.startsWith(miniRoot+path.sep)&&packageOf(moduleFile)!=='main'&&packageOf(file)!==packageOf(moduleFile))
      fail('普通分包不能跨包 require：'+relative(file)+' → '+item[1]);
    if (file.startsWith(miniRoot + path.sep) && path.extname(moduleFile) !== '.js') {
      fail('小程序 require 必须加载 JS 模块：' + relative(file) + ' → ' + item[1]);
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
for (const value of Object.values(routes)) if (!pages.includes(value.slice(1))) fail('路由未注册：' + value);
const canonical = fs.readFileSync(path.join(root, 'cloudfunctions', '_shared', 'runtime.js'), 'utf8');
for (const name of ['user', 'store', 'catalog']) {
  if (fs.readFileSync(path.join(root, 'cloudfunctions', name, 'shared', 'runtime.js'), 'utf8') !== canonical) fail('云函数共用代码未同步，请执行 prepare-cloud');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'cloudfunctions', name, 'package.json'), 'utf8'));
  if (!/^\d+\.\d+\.\d+$/.test(manifest.dependencies['wx-server-sdk'])) fail('SDK 必须锁定稳定版本');
}
const project = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'));
const packageIgnores = (project.packOptions && project.packOptions.ignore) || [];
function excludedFromPackage(name) {
  return packageIgnores.some(rule => (rule.type === 'file' && rule.value === name) ||
    (rule.type === 'folder' && (name === rule.value || name.startsWith(rule.value.replace(/\/$/, '') + '/'))));
}
function checkPackagedImages(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) checkPackagedImages(file);
    else if (/\.(js|json|wxml|wxss)$/.test(entry.name)) {
      const source = fs.readFileSync(file, 'utf8');
      for (const match of source.matchAll(/["'(](\/assets\/[\w/.-]+\.(?:png|jpe?g|webp|svg|gif))(?=["')])/g)) {
        const asset = match[1].slice(1);
        if (!fs.existsSync(path.join(miniRoot, asset))) fail('引用的本地图片不存在：' + relative(file) + ' → ' + asset);
        if (excludedFromPackage(asset)) fail('引用的图片已被打包排除：' + relative(file) + ' → ' + asset);
      }
    }
  }
}
checkPackagedImages(miniRoot);
function mainPackageBytes(directory) {
  let bytes = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    const name = path.relative(miniRoot, file).replace(/\\/g, '/');
    if (subpackageRoots.some(prefix => name + '/' === prefix || name.startsWith(prefix))) continue;
    if (excludedFromPackage(name)) continue;
    bytes += entry.isDirectory() ? mainPackageBytes(file) : fs.statSync(file).size;
  }
  return bytes;
}
const packageBytes = mainPackageBytes(miniRoot);
const mainPackageLimit = 2 * 1024 * 1024;
if (packageBytes > mainPackageLimit) fail('主包源文件超过 2048 KiB：' + Math.ceil(packageBytes / 1024) + ' KiB；请压缩素材或调整打包排除，实际编译包仍需工具确认。');
console.log('静态检查完成：' + count + ' 个 JS/JSON/WXML 文件；' + app.pages.length + ' 主包页面 + ' + (pages.length - app.pages.length) + ' 分包页面；路由、组件、依赖、模板事件、样式导入与共用代码一致。');
console.log('主包源文件估算：' + Math.ceil(packageBytes / 1024) + ' / 2048 KiB；已按子包与文件 / 目录排除规则计算，实际以微信编译打包为准。');
for(const pack of app.subPackages||[]){
  function size(directory){return fs.readdirSync(directory,{withFileTypes:true}).reduce((sum,entry)=>{
    const file=path.join(directory,entry.name),name=path.relative(miniRoot,file).replace(/\\/g,'/');
    return sum+(excludedFromPackage(name)?0:entry.isDirectory()?size(file):fs.statSync(file).size);
  },0);}
  const packageSize=size(path.join(miniRoot,pack.root));
  if(packageSize>mainPackageLimit)fail('分包源文件超过2048KiB：'+pack.root);
  console.log('分包 '+pack.root+' 源文件估算：'+Math.ceil(packageSize/1024)+' / 2048 KiB');
}
