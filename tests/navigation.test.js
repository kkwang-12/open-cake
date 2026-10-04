'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const app = require('../miniprogram/app.json');
const { createRequire } = require('node:module');
test('四 Tab 真实路由；非 Tab 参数编码正确', () => {
  const navigations = [];
  const file=path.resolve(__dirname,'../miniprogram/constants/routes.js');
  const context={module:{exports:{}},wx:{switchTab:value=>navigations.push(['tab',value.url]),navigateTo:value=>navigations.push(['page',value.url])}};
  vm.runInNewContext(fs.readFileSync(file,'utf8'),context);
  context.module.exports.navigate('home');
  context.module.exports.navigate('shop');
  context.module.exports.navigate('product',{id:'a&b'});
  assert.deepEqual(navigations,[['tab','/pages/home/home'],['tab','/pages/shop/shop'],['page','/features/product/product?id=a%26b']]);
  assert.throws(()=>context.module.exports.navigate('unknown'));
  assert(!app.tabBar.list.some(item=>item.pagePath.includes('bag')));
});
test('主包默认不调用演示网络；可关闭的旧子包深链也不发请求', async () => {
  let network=0;
  const file=path.resolve(__dirname,'../miniprogram/legacy/utils/api.js');
  const context={module:{exports:{}},require:createRequire(file),wx:{request(){network++;}}};
  vm.runInNewContext(fs.readFileSync(file,'utf8'),context);
  await assert.rejects(context.module.exports.ready(),/未启用/);
  assert.throws(()=>context.module.exports.request('/staff/login','POST',{pin:'246810'}),/未启用/);
  assert.equal(network,0);
});
test('主包无模拟支付/口令/HTTP 调用，旧页面仅在子包登记', () => {
  assert.equal(app.pages.length,4);
  assert.equal(app.subPackages[0].pages.length,7);
  assert.equal(app.subPackages.find(pack=>pack.root==='features').pages.length,9);
  const businessPages=[...app.pages,...app.subPackages.filter(pack=>pack.root==='features').flatMap(pack=>pack.pages.map(page=>pack.root+'/'+page))];
  for (const page of businessPages) {
    const source=fs.readFileSync(path.resolve(__dirname,'../miniprogram',page+'.js'),'utf8');
    assert(!/wx\.request\(|246810|simulate|WAIT_DEPOSIT|utils\/api/.test(source),page);
  }
  assert(!app.pages.includes('pages/order/order'));
  assert(!app.pages.includes('pages/staff/staff'));
});
