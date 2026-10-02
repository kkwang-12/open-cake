const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateExpressions } = require('../scripts/wxml-expressions');

test('WXML 回归：微信报错的 HTML 实体运算符必须被检查发现', () => {
  assert.throws(() => validateExpressions('<view wx:if="{{role === \'staff\' &amp;&amp; item.status !== \'SUCCEEDED\'}}"/>', 'order.wxml'), /WXML 表达式语法错误/);
  assert.throws(() => validateExpressions('<view wx:if="{{!orders.length &amp;&amp; !busy}}"/>', 'orders.wxml'), /WXML 表达式语法错误/);
});

test('WXML 回归：原生逻辑运算符有效，普通文本实体不当作表达式', () => {
  assert.equal(validateExpressions('<view wx:if="{{role === \'staff\' && item.status !== \'SUCCEEDED\'}}">A &amp; B</view><view wx:if="{{!orders.length && !busy}}"/>', 'valid.wxml'), 2);
});
