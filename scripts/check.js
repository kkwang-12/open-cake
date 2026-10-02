'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { validateExpressions } = require('./wxml-expressions');
const root = path.join(__dirname, '..');
let count = 0;
function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['data', 'node_modules', 'artifacts', '.git'].includes(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(file);
    else if (entry.name.endsWith('.js')) {
      const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
      if (check.status !== 0) { process.stderr.write(check.stderr); process.exitCode = 1; }
      count++;
    } else if (entry.name.endsWith('.json')) { JSON.parse(fs.readFileSync(file, 'utf8')); count++; }
    else if (entry.name.endsWith('.wxml')) { validateExpressions(fs.readFileSync(file, 'utf8'), path.relative(root, file)); count++; }
  }
}
visit(root);
const app = JSON.parse(fs.readFileSync(path.join(root, 'miniprogram', 'app.json'), 'utf8'));
for (const page of app.pages) for (const suffix of ['.js', '.json', '.wxml', '.wxss']) {
  if (!fs.existsSync(path.join(root, 'miniprogram', page + suffix))) throw new Error(`缺少页面文件：${page}${suffix}`);
}
for (const page of app.pages) {
  const template = fs.readFileSync(path.join(root, 'miniprogram', page + '.wxml'), 'utf8');
  const script = fs.readFileSync(path.join(root, 'miniprogram', page + '.js'), 'utf8');
  if (/wx:(if|elif|for)="(?!\{\{)/.test(template)) throw new Error(`模板表达式未使用双花括号：${page}`);
  if (/<br\b/.test(template)) throw new Error(`微信模板不支持 br 标签：${page}`);
  const tags = template.match(/<\/?[\w-]+(?:\s[^<>]*?)?\s*\/?>/g) || [];
  const stack = [];
  for (const tag of tags) {
    const name = tag.match(/^<\/?([\w-]+)/)[1];
    if (tag.startsWith('</')) { if (stack.pop() !== name) throw new Error(`模板标签未闭合：${page} ${name}`); }
    else if (!tag.endsWith('/>')) stack.push(name);
  }
  if (stack.length) throw new Error(`模板缺少关闭标签：${page}`);
  for (const binding of template.matchAll(/(?:bind|catch)(?:tap|input|change)="([\w]+)"/g)) {
    if (!new RegExp(`\\b${binding[1]}\\s*\\(`).test(script)) throw new Error(`模板事件没有对应方法：${page} ${binding[1]}`);
  }
}
console.log(`静态检查完成：${count} 个 JS/JSON/WXML 文件；WXML 表达式语法通过，所有微信页面文件齐全。`);
