'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHandler } = require('../cloudfunctions/_shared/runtime');
const { createClient } = require('../miniprogram/services/cloud');
const { measure } = require('../miniprogram/utils/safe-area');
const settings = { appId: 'wx-test', environment: 'dev-test', stage: 'development' };
const logs = () => {
  const entries = [];
  return { entries, info(value) { entries.push(value); }, warn(value) { entries.push(value); }, error(value) { entries.push(value); } };
};
function handler(context, logger = logs(), options = {}) {
  return createHandler({ action: 'me', settings, getContext: () => context, logger, handle: identity => ({ ...identity, role: 'customer' }), ...options });
}
test('云身份：请求伪造 OPENID/role 无效，仅可信上下文决定身份', async () => {
  const logger = logs();
  const action = handler({ OPENID: 'real-user', APPID: 'wx-test', ENV: 'dev-test' }, logger);
  const forged = await action({ action: 'me', openid: 'victim', role: 'admin', payload: { openid: 'victim', role: 'admin', phone: '13812345678' } });
  const normal = await action({ action: 'me' });
  assert.equal(forged.ok, true);
  assert.equal(forged.data.role, 'customer');
  assert.equal(forged.data.subjectHash, normal.data.subjectHash);
  assert.notEqual(forged.requestId, normal.requestId);
  assert(!JSON.stringify(logger.entries).includes('13812345678'));
  assert(!JSON.stringify(forged).includes('real-user'));
});
test('云身份：无身份、应用或环境不符、配置缺失均关闭访问', async () => {
  for (const [context, code] of [
    [{}, 'AUTH_REQUIRED'],
    [{OPENID:'u',APPID:'other',ENV:'dev-test'},'APP_MISMATCH'],
    [{OPENID:'u',APPID:'wx-test',ENV:'prod-test'},'ENV_MISMATCH']
  ]) {
    const result = await handler(context)({ action:'me' });
    assert.equal(result.ok,false);
    assert.equal(result.error.code,code);
  }
  const missing = await handler({}, logs(), { settings: {} })({action:'me'});
  assert.equal(missing.error.code,'INVALID_CONFIGURATION');
});
test('云函数：未知动作 / 非对象 payload 拒绝，异常日志不泄露敏感内容', async () => {
  const logger = logs();
  const context = { OPENID:'u',APPID:'wx-test',ENV:'dev-test' };
  for (const input of [{action:'admin'}, {action:'me',payload:null}, {action:'me',payload:[]}]) {
    assert.equal((await handler(context)(input)).error.code,'INVALID_REQUEST');
  }
  const failing = handler(context, logger, { handle: () => { throw new Error('private-key 13812345678'); } });
  const result = await failing({action:'me'});
  assert.equal(result.error.code,'INTERNAL_ERROR');
  assert(!JSON.stringify([result,logger.entries]).includes('private-key'));
});
test('云客户端：未配置 / shell / 开发复用生产环境不发请求', async () => {
  let calls = 0;
  const platform = () => ({ cloud: { init() { calls++; }, async callFunction() { calls++; } } });
  for (const config of [
    {mode:'shell',stage:'development',cloudEnvironments:{}},
    {mode:'cloud',stage:'development',cloudEnvironments:{}},
    {mode:'cloud',stage:'development',cloudEnvironments:{development:'prod',production:'prod'}},
    {mode:'cloud',stage:'unknown',cloudEnvironments:{}}
  ]) {
    const client = createClient(config,platform,logs());
    await assert.rejects(client.call('user','me'), error => ['CLOUD_NOT_CONFIGURED','INVALID_CONFIGURATION'].includes(error.code));
  }
  assert.equal(calls,0);
});
test('云客户端：显式选环境、初始化一次、不透传上游错误或隐私日志', async () => {
  const requests = [];
  const logger = logs();
  const client = createClient({mode:'cloud',stage:'development',cloudEnvironments:{development:'dev',production:'prod'}}, () => ({
    cloud: {
      init(value) { requests.push(value); },
      async callFunction(value) { requests.push(value); return {result:{ok:true,requestId:'server-1',data:{authenticated:true}}}; }
    }
  }),logger);
  assert.equal((await client.call('user','me')).data.authenticated,true);
  await client.call('store','health');
  assert.equal(requests.length,3);
  assert.equal(requests[0].env,'dev');
  assert.equal(requests[1].config.env,'dev');
  await assert.rejects(client.call('payment','simulate'), e => e.code==='INVALID_REQUEST');
  const bad = createClient({mode:'cloud',stage:'development',cloudEnvironments:{development:'dev'}},()=>({cloud:{init(){}, async callFunction(){throw new Error('secret 13812345678');}}}),logger);
  await assert.rejects(bad.call('user','me',{phone:'13812345678'}), e => e.code==='CLOUD_CALL_FAILED' && !e.message.includes('secret'));
  assert(!JSON.stringify(logger.entries).includes('13812345678'));
});
test('云客户端：无效响应和服务端错误保留脱敏关联 ID', async () => {
  for (const [result, code] of [[{},'INVALID_RESPONSE'],[{ok:false,requestId:'trace-1',error:{code:'AUTH_REQUIRED',message:'sensitive'}},'AUTH_REQUIRED']]) {
    const client=createClient({mode:'cloud',stage:'test',cloudEnvironments:{test:'test-env'}},()=>({cloud:{init(){},async callFunction(){return {result};}}}),logs());
    await assert.rejects(client.call('user','me'),e=>e.code===code && !e.message.includes('sensitive'));
  }
});
test('安全区：有效胶囊、无胶囊、API 错误均有可用尺寸', () => {
  const value=measure({getWindowInfo:()=>({statusBarHeight:47,windowWidth:390}),getMenuButtonBoundingClientRect:()=>({top:51,height:32,left:280})});
  assert.equal(value.topInset,47);
  assert.equal(value.navHeight,44);
  assert.equal(value.capsuleWidth,122);
  const fallback=measure({getWindowInfo(){throw new Error('unsupported');}});
  assert.equal(fallback.navHeight,44);
});
