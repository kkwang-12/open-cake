'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {nativeContextForInvocation}=require('../cloudfunctions/_shared/native-context');
const sdk={OPENID:'offline-only',APPID:'wx154f791a17268ace',ENV:'cloudbase-d8gwtxzm64150b7e0',API_TOKEN:'private'};
const cloud={getWXContext:()=>sdk};
const valid={request_id:'platform-test-id',namespace:sdk.ENV,
  environment:JSON.stringify({WX_OPENID:sdk.OPENID,WX_APPID:sdk.APPID,TENCENTCLOUD_SECRETKEY:'private'})};
test('current platform metadata and SDK tuple must agree, returns only native identity fields',()=>{
  const result=nativeContextForInvocation(cloud,valid);
  assert.deepEqual(result,{OPENID:sdk.OPENID,APPID:sdk.APPID,ENV:sdk.ENV});
  assert.equal(Object.isFrozen(result),true);assert.equal(JSON.stringify(result).includes('private'),false);
});
test('warm process context is insufficient for management, missing or malformed metadata',()=>{
  for(const invocation of [undefined,{}, {...valid,environment:'{}'}, {...valid,environment:'bad-json'},
    {...valid,environment:'[]'}, {...valid,request_id:''}]) assert.deepEqual(nativeContextForInvocation(cloud,invocation),{});
});
test('native identity or namespace mismatch closes access',()=>{
  for(const invocation of [{...valid,namespace:'other'},
    {...valid,environment:JSON.stringify({WX_OPENID:'other',WX_APPID:sdk.APPID})},
    {...valid,environment:JSON.stringify({WX_OPENID:sdk.OPENID,WX_APPID:'other'})}])
    assert.deepEqual(nativeContextForInvocation(cloud,invocation),{});
});
