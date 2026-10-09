'use strict';
// Model alternative SDK outcomes, not real SDK isolation guarantees.
const test=require('node:test');
const assert=require('node:assert/strict');
const {createTransactionProbe,COLLECTIONS,READ_CASES}=require('../cloudfunctions/_shared/cloud-transaction-probe');
const {identityFromPlatform}=require('../cloudfunctions/_shared/authorization-model');
const {runReadProtectionScenarios}=require('../scripts/cloud-checks/transaction-scenarios');
const context={OPENID:'offline-reader-native',APPID:'offline-reader-app',ENV:'offline-reader-test'};
const time=1900000000000;
const settings={appId:context.APPID,environment:context.ENV,stage:'test',testEnvironment:context.ENV,
  developmentEnvironment:'offline-development',runId:'offline-read-probe-0001',expiresAt:time+60000};
settings.allowedUserId=identityFromPlatform(context,settings)._id;
const clone=structuredClone;
const conflict=()=>Object.assign(new Error('private-sdk-data'),{code:'DATABASE_TRANSACTION_CONFLICT'});
function harness(options={}) {
  let records={},reader=null,currentTime=time;
  const stats={databaseCalls:0,starts:0,commits:0,rollbacks:0,writes:0,writerCommits:0,queryCalls:0};
  function collection(staged,touched,observations,name,isReader=false) {
    const doc=id=>({get:async()=>{
      if(isReader && options.readFailure)throw new Error('private-read-secret');
      const value=staged[name]?.[id]??null;
      observations.push({name,id,value:clone(value)});
      return {data:clone(value)};
    },update:async({data})=>{
      if(reader && options.writerFailure)throw options.writerFailure;
      if(reader && options.writerConflict)throw conflict();
      if(!staged[name]?.[id])return {stats:{updated:0}};
      staged[name][id]={...staged[name][id],...clone(data)};
      touched.push({name,id});stats.writes++;return {stats:{updated:1}};
    }});
    const add=async({data})=>{
      if(!isReader && reader && options.writerFailure)throw options.writerFailure;
      if(!isReader && reader && options.writerConflict)throw conflict();
      staged[name]||={};
      if(staged[name][data._id])throw Object.assign(new Error('private-duplicate'),{code:'DATABASE_DUPLICATE_WRITE'});
      staged[name][data._id]=clone(data);touched.push({name,id:data._id});stats.writes++;
      return {_id:data._id};
    };
    const where=condition=>({limit:count=>({get:async()=>{
      stats.queryCalls++;
      assert.equal(count,2);
      assert.deepEqual(Object.keys(condition).sort(),['caseId','ownerId','runId','scope','type']);
      if(options.queryFailure)throw options.queryFailure;
      const matches=state=>Object.values(state[name]??{}).filter(record=>
        Object.entries(condition).every(([key,value])=>record[key]===value)).map(record=>record._id).sort();
      observations.push({name,predicate:matches,value:matches(staged)});
      return {data:options.badQuery?null:matches(staged).map(id=>clone(staged[name][id]))};
    }})});
    return {doc,add,...(!options.queryUnavailable?{where}: {})};
  }
  function apply(staged,touched) {
    for(const {name,id} of touched){records[name]||={};records[name][id]=clone(staged[name][id]);}
  }
  const cloud={database:config=>{
    stats.databaseCalls++;assert.deepEqual(config,{env:context.ENV,throwOnNotFound:false});
    return {
      runTransaction:async work=>{
        const staged=clone(records),touched=[],observations=[];
        const value=await work({collection:name=>collection(staged,touched,observations,name)});
        apply(staged,touched);
        if(reader){stats.writerCommits++;if(options.expireAfterWriter)currentTime=settings.expiresAt;}
        return value;
      },
      startTransaction:async()=>{
        stats.starts++;
        if(options.startFailure)throw new Error('private-start-token');
        const staged=clone(records),touched=[],observations=[];
        reader={collection:name=>collection(staged,touched,observations,name,true),
          commit:async()=>{
            if(options.commitFailure)throw options.commitFailure;
            if(options.protectReads && observations.some(observation=>JSON.stringify(observation.value)!==
              JSON.stringify(observation.predicate?observation.predicate(records):records[observation.name]?.[observation.id]??null)))
              throw conflict();
            apply(staged,touched);stats.commits++;reader=null;
          },rollback:async()=>{
            stats.rollbacks++;
            if(options.rollbackFailure)throw new Error('private-rollback-token');
            reader=null;
          }};
        return reader;
      }
    };
  }};
  const probe=createTransactionProbe({cloud,settings:{...settings,...options.settings},now:()=>currentTime});
  return {execute:(caseId,payload={})=>probe.execute({operation:'read-protection',caseId,command:0,mode:'PICKUP',...payload},context),
    stats:()=>({...stats,records:clone(records)})};
}
const rejects=(promise,code)=>assert.rejects(promise,error=>{
  assert.equal(error.code,code);assert.equal(JSON.stringify(error).includes('private-'),false);return true;
});

test('D04 read probe detects stale commits for existing, missing and empty-query dependencies',async()=>{
  for(const caseId of READ_CASES) {
    const h=harness(),result=await h.execute(caseId);
    assert.equal(result.outcome,'STALE_COMMIT');assert.equal(result.readProtected,false);
    assert.equal(result.writerCommitted,true);assert.equal(result.readerCommitted,true);
    assert.equal(result.dependencyVersion,1);assert.equal(result.decisionExists,true);
    assert.equal(result.businessOrderCreated,false);
    assert.deepEqual(Object.keys(h.stats().records).sort(),[COLLECTIONS.resources,COLLECTIONS.records].sort());
    assert.equal(Object.values(h.stats().records).flatMap(Object.values).length,3);
  }
});

test('D04 read probe confirms rollback when commit detects a changed document or query predicate',async()=>{
  for(const caseId of READ_CASES) {
    const h=harness({protectReads:true}),result=await h.execute(caseId);
    assert.equal(result.outcome,'READER_CONFLICT');assert.equal(result.readProtected,true);
    assert.equal(result.writerCommitted,true);assert.equal(result.readerCommitted,false);
    assert.equal(result.dependencyVersion,1);assert.equal(result.decisionExists,false);
    assert.equal(h.stats().rollbacks,1);assert.equal(h.stats().commits,0);
    assert.equal(Object.values(h.stats().records).flatMap(Object.values).length,2);
  }
});

test('D04 read probe distinguishes a blocked writer with a committed reader decision',async()=>{
  for(const caseId of READ_CASES) {
    const h=harness({writerConflict:true}),result=await h.execute(caseId);
    assert.equal(result.outcome,'WRITER_CONFLICT');assert.equal(result.readProtected,true);
    assert.equal(result.writerCommitted,false);assert.equal(result.readerCommitted,true);
    assert.equal(result.dependencyVersion,caseId==='read-existing'?0:null);
    assert.equal(h.stats().commits,1);
  }
});

test('D04 unsupported or rejected query is never a successful predicate protection assertion',async()=>{
  for(const [options,outcome] of [[{queryUnavailable:true},'QUERY_UNAVAILABLE'],
    [{queryFailure:new Error('private-query-response')},'QUERY_REJECTED']]) {
    const h=harness(options),result=await h.execute('query-empty');
    assert.equal(result.outcome,outcome);assert.equal(result.readProtected,false);
    assert.equal(result.writerCommitted,false);assert.equal(result.readerCommitted,false);
    assert.equal(result.decisionExists,false);assert.equal(h.stats().rollbacks,1);
    assert.equal(JSON.stringify(result).includes('private-'),false);
    assert.equal(Object.values(h.stats().records).flatMap(Object.values).length,1);
  }
});

test('D04 read probe refuses reused runs before another mutation',async()=>{
  const h=harness();await h.execute('read-missing');const before=h.stats();
  await rejects(h.execute('read-missing'),'PROBE_RUN_NOT_FRESH');
  assert.deepEqual(h.stats().records,before.records);assert.equal(h.stats().writes,before.writes);
});

test('D04 read probe rejects arbitrary IDs, modes, cases and unauthorized configurations before database access',async()=>{
  for(const payload of [{caseId:'atomic'},{caseId:'other'},{command:1},{mode:'DELIVERY'},
    {documentId:'real-order'},{operation:'hold'}]) {
    const h=harness();await rejects(h.execute('read-existing',payload),'INVALID_PROBE_REQUEST');
    assert.equal(h.stats().databaseCalls,0);
  }
  for(const patch of [{stage:'development'},{stage:'production'},{allowedUserId:''},{expiresAt:time},
    {environment:'other-test'},{developmentEnvironment:context.ENV}]) {
    const h=harness({settings:patch});await rejects(h.execute('read-existing'),'PROBE_NOT_AUTHORIZED');
    assert.equal(h.stats().databaseCalls,0);
  }
});

test('D04 expiry after writer commit rejects reader commit and rolls back its decision',async()=>{
  const h=harness({expireAfterWriter:true});
  await rejects(h.execute('read-existing'),'PROBE_NOT_AUTHORIZED');
  assert.equal(h.stats().writerCommits,1);assert.equal(h.stats().commits,0);assert.equal(h.stats().rollbacks,1);
  assert.equal(Object.values(h.stats().records[COLLECTIONS.records]).some(row=>row.type==='READ_DECISION'),false);
});

test('D04 unknown start, read, writer or commit failures cannot manufacture protection evidence',async()=>{
  for(const [options,code] of [[{startFailure:true},'PROBE_READ_PROTECTION_FAILED'],
    [{readFailure:true},'PROBE_READ_PROTECTION_FAILED'],
    [{writerFailure:new Error('private-writer-token')},'PROBE_READ_PROTECTION_FAILED'],
    [{commitFailure:new Error('private-commit-token')},'PROBE_COMMIT_UNCONFIRMED']]) {
    const h=harness(options);await rejects(h.execute('read-existing'),code);
    assert.equal(h.stats().commits,0);
    assert.equal(Object.values(h.stats().records[COLLECTIONS.records]).some(row=>row.type==='READ_DECISION'),false);
  }
});

test('D04 malformed query and failed rollback remain experiment failures',async()=>{
  await rejects(harness({badQuery:true}).execute('query-empty'),'PROBE_READ_INVALID');
  await rejects(harness({queryUnavailable:true,rollbackFailure:true}).execute('query-empty'),'PROBE_ROLLBACK_UNCONFIRMED');
});

function transport(h,change=value=>value) {
  let sequence=0;
  return async inputs=>Promise.all(inputs.map(async input=>{
    try{return change({ok:true,requestId:'offline-request-'+(++sequence),data:await h.execute(input.caseId)});}
    catch(error){return {ok:false,requestId:'offline-request-'+(++sequence),error:{code:error.code}};}
  }));
}

test('D04 read suite retains unsafe observations and reports failed SDK protection',async()=>{
  const h=harness({queryUnavailable:true});
  const result=await runReadProtectionScenarios({invokeMany:transport(h),runId:settings.runId});
  assert.equal(result.passed,false);assert.equal(result.predicateFencing,'NOT_PROTECTED');
  assert.deepEqual(result.assertions.map(row=>row.outcome),['STALE_COMMIT','STALE_COMMIT','QUERY_UNAVAILABLE']);
  assert.equal(result.evidence.length,3);assert.equal(result.businessOrderPersistence,'NOT_RUN');
});

test('D04 successful model suite keeps business and platform budgets unverified',async()=>{
  const h=harness({protectReads:true});
  const result=await runReadProtectionScenarios({invokeMany:transport(h),runId:settings.runId});
  assert.equal(result.passed,true);assert.equal(result.predicateFencing,'SDK_PROBE_PASSED');
  assert.equal(result.businessOrderPersistence,'NOT_RUN');assert.equal(result.transactionBudget,'NOT_RUN');
});

test('D04 read suite rejects mismatched runs and fabricated protection fields',async()=>{
  for(const change of [row=>({...row,data:{...row.data,runId:'other'}}),
    row=>({...row,data:{...row.data,readProtected:true}}),
    row=>({...row,data:{...row.data,outcome:'READER_CONFLICT'}})]) {
    const h=harness();
    await assert.rejects(runReadProtectionScenarios({invokeMany:transport(h,change),runId:settings.runId}),/INVALID_PROBE_RESPONSE/);
  }
});

test('D04 read suite preserves failed request evidence and stops subsequent experiments',async()=>{
  const evidence=[],h=harness({startFailure:true});
  await assert.rejects(runReadProtectionScenarios({invokeMany:transport(h),runId:settings.runId,
    onEvidence:row=>evidence.push(row)}),/PROBE_READ_PROTECTION_FAILED/);
  assert.equal(evidence.length,1);assert.equal(evidence[0].response.error.code,'PROBE_READ_PROTECTION_FAILED');
  assert.equal(h.stats().starts,1);
});
