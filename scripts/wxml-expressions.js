'use strict';
const vm = require('node:vm');

// 编译而不执行插值，捕获把 && 写成 &amp;&amp; 等表达式语法错误。
// 此检查覆盖本项目使用的表达式，不代替微信开发者工具的 WXML 编译。
function validateExpressions(template, filename) {
  let count = 0;
  for (const match of template.matchAll(/\{\{([\s\S]*?)\}\}/g)) {
    const line = template.slice(0, match.index).split('\n').length;
    try { new vm.Script(`(${match[1]})`, { filename: `${filename}:${line}` }); }
    catch (error) { throw new Error(`WXML 表达式语法错误 ${filename}:${line}：${match[0]}；${error.message}`); }
    count++;
  }
  return count;
}

module.exports = { validateExpressions };
