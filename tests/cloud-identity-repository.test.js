'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createCloudIdentityRepository } = require('../cloudfunctions/_shared/cloud-identity-repository');
const { identityFromPlatform } = require('../cloudfunctions/_shared/authorization-model');
const settings = {appId:'wx154f791a17268ace',environment:'cloudbase-d8gwtxzm64150b7e0',stage:'development'};
const context = {OPENID:'offline-only-person-a',APPID:settings.appId,ENV:settings.environment};
function harness(existing = null, options = {}) {
  let stored = existing && structuredClone(existing);
  let writes = 0, reads = 0, databaseCalls = 0;
  const cloud = {getWXContext:()=>options.context || context,database:config=>{
    databaseCalls++; assert.equal(config.env, settings.environment); assert.equal(config.throwOnNotFound,false);
    return {runTransaction:async callback=>{
      const before = stored && structuredClone(stored);
      try {
        const result = await callback({collection:name=>{
          assert.equal(name,'users');
          return {doc:id=>({get:async()=>{
            reads++; assert.equal(id,identityFromPlatform(context,settings)._id);
            if(options.readError) throw new Error('sensitive-provider-error');
            return options.badResponse || {data:stored};
          }}),add:async ({data})=>{
            if(stored) throw new Error('duplicate-id');
            writes++; stored=structuredClone(data);
            return {_id:options.wrongInsertedId ? 'wrong' : data._id};
          }};
        }});
        if(options.commitError) throw new Error('sensitive-provider-error');
        return result;
      } catch(error) { stored=before; throw error; }
    }};
  }};
  return {repo:createCloudIdentityRepository(cloud,settings,()=>1000),
    stats:()=>({stored,writes,reads,databaseCalls})};
}
test('first native identity creates full default record; later reads preserve user changes',async()=>{
  const first=harness(); const result=await first.repo.ensureCustomer();
  assert.equal(result.created,true); assert.equal(result.principal.type,'CUSTOMER');
  assert.equal(result.principal.subjectId,identityFromPlatform(context,settings)._id);
  assert.equal(JSON.stringify(result).includes(context.OPENID),false);
  const saved={...first.stats().stored,displayName:'existing',version:3,defaultAddressId:'owned-address'};
  const later=harness(saved); assert.equal((await later.repo.ensureCustomer()).created,false);
  assert.equal(later.stats().writes,0); assert.deepEqual(later.stats().stored,saved);
});
test('disabled or identity-corrupted existing user is rejected without write',async()=>{
  const seed=harness(); await seed.repo.ensureCustomer();
  for(const change of [{status:'DISABLED'},{openId:'other'}, {_id:'other'}]) {
    const current=harness({...seed.stats().stored,...change});
    await assert.rejects(current.repo.ensureCustomer(),{code:change.status?'USER_DISABLED':'INVALID_USER_RECORD'});
    assert.equal(current.stats().writes,0);
  }
});
test('untrusted context is rejected before database initialization',async()=>{
  const current=harness(null,{context:{}});
  await assert.rejects(current.repo.ensureCustomer(),{code:'AUTH_REQUIRED'});
  assert.equal(current.stats().databaseCalls,0);
});
test('read transport failures are not interpreted as absent users and are sanitized',async()=>{
  const current=harness(null,{readError:true});
  await assert.rejects(current.repo.ensureCustomer(),error=>error.code==='IDENTITY_STORAGE_FAILED' && !error.message.includes('sensitive'));
  assert.equal(current.stats().writes,0);
});
test('malformed empty result or insertion receipt fails the transaction',async()=>{
  for(const options of [{badResponse:{data:[]}}, {badResponse:{}}, {wrongInsertedId:true}]) {
    const current=harness(null,options);
    await assert.rejects(current.repo.ensureCustomer(),{code:'INVALID_DATABASE_RESPONSE'});
    assert.equal(current.stats().stored,null);
  }
});
test('failed commit yields no success and preserves empty fixture state',async()=>{
  const current=harness(null,{commitError:true});
  await assert.rejects(current.repo.ensureCustomer(),{code:'IDENTITY_STORAGE_FAILED'});
  assert.equal(current.stats().stored,null);
});
