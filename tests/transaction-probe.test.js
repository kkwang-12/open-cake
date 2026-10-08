'use strict';
// Serializable memory only. None of these tests prove actual SDK concurrency.
const test=require('node:test');
const assert=require('node:assert/strict');
const {createTransactionProbe,COLLECTIONS,CASES}=require('../cloudfunctions/_shared/cloud-transaction-probe');
const {identityFromPlatform}=require('../cloudfunctions/_shared/authorization-model');
const {runTransactionScenarios}=require('../scripts/cloud-checks/transaction-scenarios');
const context={OPENID:'offline-probe-native',APPID:'offline-probe-app',ENV:'offline-test-env'};
const base={appId:context.APPID,environment:context.ENV,stage:'test',testEnvironment:context.ENV,
  developmentEnvironment:'offline-development-env',runId:'offline-probe-run-0001',expiresAt:2000000000000};
base.allowedUserId=identityFromPlatform(context,base)._id;
const time=1900000000000;
function setup(patch={}) {
  let data={},calls=0,queue=Promise.resolve();
  const cloud={database:()=>{
    calls++;
    return {runTransaction:work=>{
      const pending=queue.then(async()=>{
        const staged=structuredClone(data);
        const result=await work({collection:name=>({doc:id=>({get:async()=>({data:staged[name]?.[id] || null}),
          update:async({data:change})=>{
            if(!staged[name]?.[id])return {stats:{updated:0}};
            staged[name][id]={...staged[name][id],...structuredClone(change)};return {stats:{updated:1}};
          }}),add:async({data:record})=>{
          staged[name]||={};
          if(staged[name][record._id])throw new Error('duplicate-primary');
          if(name===COLLECTIONS.receipts && Object.values(staged[name]).some(r=>
            r.runId===record.runId && r.caseId===record.caseId && r.commandKey===record.commandKey))
              throw Object.assign(new Error('private-duplicate-logical'),{code:'DATABASE_DUPLICATE_WRITE'});
          staged[name][record._id]=structuredClone(record);return {_id:record._id};
        }})});
        data=staged;return result;
      });
      queue=pending.catch(()=>{});return pending;
    }};
  }};
  const settings={...base,...patch};
  const probe=createTransactionProbe({cloud,settings,now:()=>time});
  return {probe,settings,execute:payload=>probe.execute(payload,context),stats:()=>({data,calls})};
}
const rejects=(work,code)=>assert.rejects(work,error=>error.code===code);
const prepare=(s,caseId)=>s.execute({operation:'prepare',caseId});
const hold=(s,caseId,command=0,mode='PICKUP')=>s.execute({operation:'hold',caseId,command,mode});
const read=(s,caseId,command=0,mode='PICKUP')=>s.execute({operation:'read',caseId,command,mode});
test('D04 probe refuses development/production, same env, expired or missing owner before database access',async()=>{
  for(const patch of [{stage:'development'},{stage:'production'},{testEnvironment:'other'},
    {developmentEnvironment:base.environment},{allowedUserId:''},{expiresAt:time},{runId:'short'}]) {
    const s=setup(patch);
    await rejects(prepare(s,'atomic'),'PROBE_NOT_AUTHORIZED');assert.equal(s.stats().calls,0);
  }
});
test('D04 native owner allowlist rejects other platform identity and event overrides',async()=>{
  const s=setup();
  await rejects(s.probe.execute({operation:'prepare',caseId:'atomic'},{...context,OPENID:'other'}),'PROBE_NOT_AUTHORIZED');
  await rejects(s.execute({operation:'prepare',caseId:'atomic',ownerId:base.allowedUserId}),'INVALID_PROBE_REQUEST');
  assert.equal(s.stats().calls,0);
});
test('D04 payload cannot choose arbitrary case/document/fault/counter or unsafe command',async()=>{
  const s=setup();
  for(const payload of [{operation:'remove',caseId:'atomic'},{operation:'prepare',caseId:'real-order'},
    {operation:'hold',caseId:'atomic',command:8},{operation:'hold',caseId:'atomic',failAt:1},
    {operation:'hold',caseId:'atomic',heldUnits:99},{operation:'hold',caseId:'unique'},
    {operation:'unique',caseId:'atomic'}])await rejects(s.execute(payload),'INVALID_PROBE_REQUEST');
  assert.equal(s.stats().calls,0);
});
test('D04 prepared resource identities remain stable; rerun never resets occupied counters',async()=>{
  const s=setup();assert.equal((await prepare(s,'atomic')).created,3);
  await hold(s,'atomic');const before=JSON.stringify(s.stats().data);
  assert.equal((await prepare(s,'atomic')).created,0);assert.equal(JSON.stringify(s.stats().data),before);
});
test('D04 atomic hold uses seven writes across three collections and exact readback records',async()=>{
  const s=setup();await prepare(s,'atomic');const result=await hold(s,'atomic');
  assert.equal(result.disposition,'HELD');assert.equal(result.writes,7);assert.equal(result.businessOrderCreated,false);
  const state=await read(s,'atomic');assert.equal(state.documents.length,8);
  assert.equal(state.documents.filter(r=>r.exists).length,8);
  assert.deepEqual(state.documents.slice(0,3).map(r=>r.heldUnits),[1,1,0]);
  assert.equal(JSON.stringify(result).includes(context.OPENID),false);
});
test('D04 same key replay is zero-write and different mode on same key rejects',async()=>{
  const s=setup();await prepare(s,'same-key');await hold(s,'same-key');const before=JSON.stringify(s.stats().data);
  assert.equal((await hold(s,'same-key')).disposition,'REPLAY');assert.equal(JSON.stringify(s.stats().data),before);
  await rejects(hold(s,'same-key',0,'DELIVERY'),'IDEMPOTENCY_KEY_REUSED');
  assert.equal(JSON.stringify(s.stats().data),before);
});
test('D04 each of seven injected write faults leaves original resources and no effects',async()=>{
  for(let i=1;i<=7;i++) {
    const s=setup(),caseId='fault-'+i;await prepare(s,caseId);const before=JSON.stringify(s.stats().data);
    await rejects(hold(s,caseId),'PROBE_INJECTED_FAILURE');assert.equal(JSON.stringify(s.stats().data),before);
    const state=await read(s,caseId);
    assert.equal(state.documents.slice(3).some(r=>r.exists),false);
    assert.deepEqual(state.documents.slice(0,3).map(r=>r.heldUnits),[0,0,0]);
  }
});
test('D04 fixed last-stock and last-slot candidates constrain competing commands in serial fixture',async()=>{
  for(const caseId of ['stock-last','slot-last']) {
    const s=setup();await prepare(s,caseId);
    const settled=await Promise.allSettled([hold(s,caseId,0),hold(s,caseId,1)]);
    assert.equal(settled.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(settled.find(r=>r.status==='rejected').reason.code,'RESOURCE_UNAVAILABLE');
    assert.deepEqual((await read(s,caseId)).documents.slice(0,3).map(r=>r.heldUnits),[1,1,0]);
  }
});
test('D04 pickup and delivery capacities occupy independent slot records',async()=>{
  const s=setup();await prepare(s,'mode-independent');
  await hold(s,'mode-independent',0,'PICKUP');await hold(s,'mode-independent',1,'DELIVERY');
  await rejects(hold(s,'mode-independent',2,'DELIVERY'),'RESOURCE_UNAVAILABLE');
  await hold(s,'mode-independent',3,'PICKUP');await hold(s,'mode-independent',4,'PICKUP');
  await rejects(hold(s,'mode-independent',5,'PICKUP'),'RESOURCE_UNAVAILABLE');
  assert.deepEqual((await read(s,'mode-independent')).documents.slice(0,3).map(r=>r.heldUnits),[4,3,1]);
});
test('D04 unique experiment uses distinct ids and same compound tuple; provider failure never fakes pass',async()=>{
  const s=setup();
  await s.execute({operation:'unique',caseId:'unique',command:0});
  await rejects(s.execute({operation:'unique',caseId:'unique',command:1}),'CLOUD_UNIQUE_CONFLICT');
  assert.equal(Object.keys(s.stats().data[COLLECTIONS.receipts]).length,1);
  assert.equal(CASES.length,13);
});
test('D04 owner discovery is read-only and never auto-authorizes the first visitor',async()=>{
  const s=setup({allowedUserId:''});
  const result=await s.execute({operation:'identify',caseId:'atomic'});
  assert.equal(result.subjectId,base.allowedUserId);assert.equal(s.stats().calls,0);
  await rejects(prepare(s,'atomic'),'PROBE_NOT_AUTHORIZED');assert.equal(s.stats().calls,0);
});
function transport(s,maskDuplicate=false) {
  let sequence=0;
  return async inputs=>Promise.all(inputs.map(async input=>{
    const requestId='offline-request-'+(++sequence);
    try{return {ok:true,requestId,data:await s.execute(input)};}
    catch(error){return {ok:false,requestId,error:{code:maskDuplicate && error.code==='CLOUD_UNIQUE_CONFLICT'?
      'CLOUD_DOCUMENT_OPERATION_FAILED':error.code}};}
  }));
}
test('D04 complete scenario DSL exercises actual service with only serial fixture evidence',async()=>{
  const s=setup();const result=await runTransactionScenarios({invokeMany:transport(s),runId:base.runId});
  assert.equal(result.passed,true);assert.equal(result.assertions.length,16);
  assert.equal(result.businessOrderPersistence,'NOT_RUN');assert.equal(result.predicateFencing,'NOT_RUN');
});
test('D04 generic database failure cannot be counted as proof of unique constraint',async()=>{
  const s=setup();const result=await runTransactionScenarios({invokeMany:transport(s,true),runId:base.runId});
  assert.equal(result.passed,false);assert.equal(result.assertions.find(row=>row.name==='compound-unique-conflict').passed,false);
});
test('D04 scenario preflight rejects mismatched run or reused run without modifying resources',async()=>{
  const s=setup();await assert.rejects(runTransactionScenarios({invokeMany:transport(s),runId:'another-probe-run-0001'}),
    /INVALID_PROBE_RESPONSE/);assert.deepEqual(s.stats().data,{});
  await prepare(s,'atomic');const before=JSON.stringify(s.stats().data);
  await assert.rejects(runTransactionScenarios({invokeMany:transport(s),runId:base.runId}),/PROBE_RUN_NOT_FRESH/);
  assert.equal(JSON.stringify(s.stats().data),before);
});
