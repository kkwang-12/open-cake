'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {identityFromPlatform}=require('../cloudfunctions/_shared/authorization-model');
const context={OPENID:'offline-handler-native',APPID:'offline-probe-app',ENV:'offline-test-env'};
const env={JJL_APP_ID:context.APPID,JJL_CLOUD_ENV:context.ENV,JJL_STAGE:'test',JJL_TEST_ENV:context.ENV,
  JJL_DEVELOPMENT_ENV:'offline-development',JJL_PROBE_RUN_ID:'offline-probe-run-0001',
  JJL_PROBE_EXPIRES_AT:String(Date.now()+600000)};
env.JJL_PROBE_USER_ID=identityFromPlatform(context,{appId:context.APPID,environment:context.ENV,stage:'test'})._id;
const invocation={environment:JSON.stringify({WX_OPENID:context.OPENID,WX_APPID:context.APPID}),
  namespace:context.ENV,request_id:'offline-platform-request'};
function harness(patch={},readFailure=null,probeFailure=null) {
  let calls=0;const logs=[];const records={};
  const sdk={init(){},getWXContext:()=>context,database:()=>{calls++;return {
    runTransaction:async work=>work({collection:name=>({doc:id=>({get:async()=>{
      if(readFailure)throw readFailure;return {data:records[name]?.[id]||null};}}),
      add:async({data})=>{records[name]||={};records[name][data._id]=structuredClone(data);return {_id:data._id};}})})};}};
  const filename=path.resolve(__dirname,'../scripts/cloud-checks/transaction-probe.js');
  const factory=vm.runInThisContext('(function(require,exports,process,console){'+fs.readFileSync(filename,'utf8')+'\n})');
  const exports={};
  factory(name=>name==='wx-server-sdk'?sdk:name==='wx-server-sdk/package.json'?{version:'4.0.2'}:
    name==='./shared/cloud-transaction-probe' && probeFailure?{...require('../cloudfunctions/_shared/cloud-transaction-probe'),
      createTransactionProbe:()=>({execute:async()=>{throw probeFailure;}})}:
    name==='./shared/runtime'?{createHandler:options=>require('../cloudfunctions/_shared/runtime').createHandler({
      ...options,logger:{info:e=>logs.push(e),warn:e=>logs.push(e),error:e=>logs.push(e)}})}:
      require(path.resolve(__dirname,'../cloudfunctions/_shared',name.slice('./shared/'.length))),exports,
    {env:{...env,...patch}},{warn:e=>logs.push(e)});
  return {main:exports.main,stats:()=>({calls,records,logs})};
}
test('D04 actual isolated entry prepares only probe resources and does not return native context',async()=>{
  const h=harness();
  const result=await h.main({action:'probe',payload:{operation:'prepare',caseId:'atomic'}},invocation);
  assert.equal(result.ok,true);assert.equal(result.data.disposition,'PREPARED');assert.equal(result.data.created,3);
  assert.equal(result.data.businessOrderCreated,false);assert.equal(result.sdkVersion,'4.0.2');
  assert.equal(JSON.stringify([result,h.stats().logs]).includes(context.OPENID),false);
});

test('test entry preserves sanitized manual-transaction diagnostics and runtime revision',async()=>{
  const {TransactionProbeError}=require('../cloudfunctions/_shared/cloud-transaction-probe');
  const diagnostic={operation:'rollback',providerCode:'UNKNOWN',messageClass:'TRANSACTION_TERMINAL',
    numericErrCode:-502001,primary:{providerCode:'DATABASE_TRANSACTION_CONFLICT'}};
  const h=harness({},null,new TransactionProbeError('PROBE_ROLLBACK_UNCONFIRMED',diagnostic));
  const result=await h.main({action:'probe',payload:{operation:'write-protection',caseId:'fence-missing'}},invocation);
  assert.deepEqual(result.error.diagnostic,diagnostic);
  assert.equal(result.probeRevision,'d04-write-guard-lifecycle-1');
});
test('D04 actual entry refuses warm SDK management identity, even with forged event context',async()=>{
  const h=harness();const result=await h.main({action:'probe',payload:{operation:'prepare',caseId:'atomic'},context:invocation},
    {...invocation,environment:'{}'});
  assert.equal(result.error.code,'AUTH_REQUIRED');assert.equal(h.stats().calls,0);
});
test('D04 actual entry refuses development/production/expired settings before writes',async()=>{
  for(const patch of [{JJL_STAGE:'development'},{JJL_STAGE:'production'},{JJL_PROBE_EXPIRES_AT:'1'}]) {
    const h=harness(patch);const result=await h.main({action:'probe',payload:{operation:'prepare',caseId:'atomic'}},invocation);
    assert.equal(result.error.code,'PROBE_NOT_AUTHORIZED');assert.equal(h.stats().calls,0);
  }
});
test('D04 actual entry validates action/payload and never accepts an arbitrary failure target',async()=>{
  const h=harness();
  assert.equal((await h.main({action:'admin',payload:{}},invocation)).error.code,'INVALID_REQUEST');
  assert.equal((await h.main({action:'probe',payload:{operation:'hold',caseId:'atomic',documentId:'real-order'}},invocation)).error.code,
    'INVALID_PROBE_REQUEST');assert.equal(h.stats().calls,0);
});

test('D04 test entry exposes bounded provider diagnostics without native identity or raw provider data',async()=>{
  const h=harness({},Object.assign(new Error('secret-provider-token'),{errCode:-502001,code:'private-account-id'}));
  const result=await h.main({action:'probe',payload:{operation:'read',caseId:'atomic'}},invocation);
  assert.equal(result.error.code,'CLOUD_DOCUMENT_OPERATION_FAILED');
  assert.deepEqual(result.error.diagnostic,{providerCode:'UNKNOWN',numericErrCode:-502001,operation:'get',attempt:1});
  const text=JSON.stringify([result,h.stats().logs]);
  for(const secret of ['secret-provider-token','private-account-id',context.OPENID])assert.equal(text.includes(secret),false);
});
