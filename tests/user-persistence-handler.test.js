'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {identityFromPlatform}=require('../cloudfunctions/_shared/authorization-model');
const settings={appId:'wx154f791a17268ace',environment:'cloudbase-d8gwtxzm64150b7e0',stage:'development'};
const context={OPENID:'offline-only',APPID:settings.appId,ENV:settings.environment};
const invocation={environment:JSON.stringify({WX_OPENID:context.OPENID,WX_APPID:context.APPID}),
  namespace:settings.environment,request_id:'platform-test-id'};
function harness(options={}) {
  let record=options.record || null, calls=0;
  const logs=[];
  const cloud={init(){},getWXContext:()=>options.context||context,database:()=>{
    calls++;
    return {runTransaction:async run=>run({collection:()=>({doc:()=>({get:async()=>{
      if(options.readFailure) throw new Error('private-provider-message');
      return {data:record};
    }}),add:async({data})=>{record=structuredClone(data);return {_id:data._id};}})})};
  }};
  const base=path.resolve(__dirname,'../cloudfunctions/user');
  const sandbox={exports:{},process:{env:{JJL_APP_ID:settings.appId,JJL_CLOUD_ENV:settings.environment,JJL_STAGE:settings.stage}},
    require:name=>name==='wx-server-sdk'?cloud:name==='./shared/runtime'?{
      createHandler:options=>require('../cloudfunctions/_shared/runtime').createHandler({...options,
        logger:{info:entry=>logs.push(entry),warn:entry=>logs.push(entry),error:entry=>logs.push(entry)}})
    }:require(path.resolve(base,name))};
  // Execute in the module's normal realm: domain validators intentionally reject
  // foreign Object prototypes; creating VM-realm settings would test a different boundary.
  const factory=vm.runInThisContext('(function(require,exports,process){'+fs.readFileSync(path.join(base,'index.js'),'utf8')+'\n})');
  factory(sandbox.require,sandbox.exports,sandbox.process);
  return {main:event=>sandbox.exports.main(event,options.invocation || invocation),stats:()=>({record,calls,logs})};
}
test('actual user entry persists then reads customer without accepting forged role',async()=>{
  const h=harness();
  const first=await h.main({action:'me',payload:{role:'admin',openid:'other'}});
  const second=await h.main({action:'me'});
  assert.equal(first.ok,true); assert.equal(first.data.authenticated,true);assert.equal(first.data.role,'customer');
  assert.equal(first.data.subjectHash,second.data.subjectHash);
  assert.equal(h.stats().record._id,identityFromPlatform(context,settings)._id);
  assert.equal(JSON.stringify([first,h.stats().logs]).includes(context.OPENID),false);
});
test('missing native identity closes entry before database access',async()=>{
  const h=harness({context:{}}); const result=await h.main({action:'me',openid:'forged'});
  assert.equal(result.error.code,'AUTH_REQUIRED'); assert.equal(h.stats().calls,0);
});
test('disabled database user receives auth refusal rather than login success',async()=>{
  const identity=identityFromPlatform(context,settings);
  const h=harness({record:{...identity,schemaVersion:1,version:1,status:'DISABLED'}});
  const result=await h.main({action:'me'});assert.equal(result.ok,false);assert.equal(result.error.code,'AUTH_REQUIRED');
});
test('provider read failure is closed and fully sanitized',async()=>{
  const h=harness({readFailure:true});const result=await h.main({action:'me'});
  assert.equal(result.error.code,'INTERNAL_ERROR');assert.equal(result.data,undefined);
  assert.equal(JSON.stringify([result,h.stats().logs]).includes('private-provider-message'),false);
});
test('warm SDK identity cannot authorize an invocation without current native keys',async()=>{
  const h=harness({invocation:{environment:'{}',namespace:settings.environment,request_id:'management-test'}});
  const result=await h.main({action:'me',openid:context.OPENID,role:'admin'});
  assert.equal(result.error.code,'AUTH_REQUIRED');assert.equal(h.stats().calls,0);
});
