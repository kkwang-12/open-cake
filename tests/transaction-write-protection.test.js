'use strict';
// Snapshot + write-conflict model: these checks validate experiment ordering,
// rollback and evidence interpretation, not the actual provider's isolation.
const test=require('node:test');
const assert=require('node:assert/strict');
const {createTransactionProbe,COLLECTIONS,GUARD_CASES}=require('../cloudfunctions/_shared/cloud-transaction-probe');
const {identityFromPlatform}=require('../cloudfunctions/_shared/authorization-model');
const {runWriteProtectionScenarios}=require('../scripts/cloud-checks/transaction-scenarios');
const context={OPENID:'offline-guard-user',APPID:'offline-guard-app',ENV:'offline-guard-test'};
const time=1900000000000;
const settings={appId:context.APPID,environment:context.ENV,stage:'test',testEnvironment:context.ENV,
  developmentEnvironment:'offline-development',runId:'offline-write-probe-0001',expiresAt:time+60000};
settings.allowedUserId=identityFromPlatform(context,settings)._id;
const conflict=()=>Object.assign(new Error('private-provider-message'),{code:'DATABASE_TRANSACTION_CONFLICT'});
function harness(options={}) {
  const records=new Map(),locks=new Map(),events=[];
  let sequence=0,currentTime=time;
  function transaction() {
    const number=++sequence,snapshot=structuredClone(records),writes=new Map();
    let ended=false;
    const read=key=>structuredClone(writes.has(key)?writes.get(key):snapshot.get(key)??null);
    function conflictAbort() {
      ended=true;
      if(!options.retainConflictLocks){unlock();writes.clear();}
      events.push({kind:'provider-abort',number});
      throw options.wrappedConflict?Object.assign(new Error('sdk wrapper DATABASE_TRANSACTION_CONFLICT private-provider-message'),
        {errCode:-501001}):conflict();
    }
    function write(key,value) {
      if(options.writeFailure && number===3)throw options.writeFailure===true?new Error('private-write-token'):options.writeFailure;
      if(!options.ignoreConflicts && ((locks.has(key) && locks.get(key)!==number) ||
        JSON.stringify(snapshot.get(key)??null)!==JSON.stringify(records.get(key)??null)))conflictAbort();
      locks.set(key,number);writes.set(key,structuredClone(value));events.push({kind:'write',number,key});
    }
    function unlock() {for(const [key,owner] of locks)if(owner===number)locks.delete(key);}
    return {
      collection:name=>({
        doc:id=>({get:async()=>({data:read(name+':'+id)}),update:async({data})=>{
          const key=name+':'+id,value=read(key);
          if(options.zeroUpdate)return {stats:{updated:0}};
          if(!value)return {stats:{updated:0}};
          write(key,{...value,...data});return {stats:{updated:1}};
        }}),
        add:async({data})=>{const key=name+':'+data._id;
          if(read(key))throw new Error('duplicate');write(key,data);return {_id:data._id};},
        ...(!options.queryUnavailable?{where:condition=>({limit:count=>({get:async()=>{
          assert.equal(count,2);
          assert.deepEqual(Object.keys(condition).sort(),['caseId','ownerId','runId','scope','type']);
          const data=[...snapshot.entries()].filter(([key,value])=>key.startsWith(name+':') &&
            Object.entries(condition).every(([field,valueExpected])=>value[field]===valueExpected)).map(([,value])=>value);
          return {data:structuredClone(data)};
        }})})}: {})
      }),
      commit:async()=>{
        if(options.commitFailure && number===3)throw new Error('private-commit-token');
        if(!options.ignoreConflicts)for(const key of writes.keys()) {
          if(JSON.stringify(snapshot.get(key)??null)!==JSON.stringify(records.get(key)??null))conflictAbort();
        }
        for(const [key,value] of writes)records.set(key,structuredClone(value));
        unlock();events.push({kind:'commit',number});
        if(options.expireAfterWriter && number===3)currentTime=settings.expiresAt;
      },
      rollback:async()=>{events.push({kind:'rollback',number});
        if(ended)throw Object.assign(new Error('transaction already aborted'),{code:'DATABASE_TRANSACTION_FAIL'});
        if(options.rollbackFailure)throw new Error('private-rollback-token');unlock();}
    };
  }
  const cloud={database:config=>{
    assert.deepEqual(config,{env:context.ENV,throwOnNotFound:false});
    events.push({kind:'database'});
    return {startTransaction:async()=>transaction(),runTransaction:async work=>{
      const tx=transaction();try{const result=await work(tx);await tx.commit();return result;}
      catch(error){await tx.rollback();throw error;}
    }};
  }};
  const probe=createTransactionProbe({cloud,settings:{...settings,...options.settings},now:()=>currentTime});
  return {execute:(caseId,payload={})=>probe.execute({operation:'write-protection',caseId,command:0,
    mode:'PICKUP',...payload},context),records,events,locks};
}
const rejects=(promise,code)=>assert.rejects(promise,error=>{
  assert.equal(error.code,code);assert.equal(JSON.stringify(error).includes('private-'),false);return true;
});

test('changing an existing document before the competing writer blocks that writer and preserves the reader',async()=>{
  const h=harness(),result=await h.execute('write-existing-early');
  assert.equal(result.outcome,'WRITER_CONFLICT');assert.equal(result.readerCommitted,true);
  assert.equal(result.writerCommitted,false);assert.equal(result.dependencyVersion,2);
  assert.equal(result.fenceVersion,2);assert.equal(result.readProtected,true);
  assert.equal(h.events.filter(row=>row.kind==='rollback' && row.number===3).length,0);
  assert.equal(result.writerState,'PROVIDER_CONFLICT_ABORTED');assert.equal(result.lockReleaseVerified,true);
  assert.equal(h.locks.size,0);
});

test('a late changing write aborts the reader after the competing writer has committed',async()=>{
  const h=harness(),result=await h.execute('write-existing-late');
  assert.equal(result.outcome,'READER_CONFLICT');assert.equal(result.writerCommitted,true);
  assert.equal(result.readerCommitted,false);assert.equal(result.decisionExists,false);
  assert.equal(h.events.filter(row=>row.kind==='rollback' && row.number===2).length,0);
  assert.equal(result.releaseMarker,true);assert.equal(result.lockReleaseVerified,true);
  assert.equal([...h.records.values()].filter(row=>row.type==='GUARD_RELEASE_CHECK').length,1);
  assert.equal([...h.records.values()].some(row=>row.type==='GUARD_DECISION'),false);
  assert.equal(h.locks.size,0);
});

test('missing documents and empty queries require both transactions to change their shared fence',async()=>{
  for(const caseId of ['fence-missing','fence-query-empty']) {
    const h=harness(),result=await h.execute(caseId);
    assert.equal(result.outcome,'READER_CONFLICT');assert.equal(result.protectionKind,'SHARED_FENCE');
    assert.equal(result.writerParticipates,true);assert.equal(result.decisionExists,false);
    assert.equal(result.fenceVersion,2);assert.equal(h.records.size,4);assert.equal(h.locks.size,0);
  }
});

test('a writer bypassing a shared fence still produces a stale commit, recorded as a required negative control',async()=>{
  for(const caseId of ['bypass-missing','bypass-query-empty']) {
    const h=harness(),result=await h.execute(caseId);
    assert.equal(result.outcome,'STALE_COMMIT');assert.equal(result.writerParticipates,false);
    assert.equal(result.writerCommitted,true);assert.equal(result.readerCommitted,true);
    assert.equal(result.readProtected,false);assert.equal(h.records.size,4);assert.equal(h.locks.size,0);
  }
});

test('guard suite refuses reused runs and arbitrary case, collection, mode or command changes',async()=>{
  const h=harness();await h.execute('fence-missing');const before=structuredClone(h.records);
  await rejects(h.execute('fence-missing'),'PROBE_RUN_NOT_FRESH');assert.deepEqual(h.records,before);
  for(const payload of [{caseId:'read-existing'},{collection:'orders'},{command:1},{mode:'DELIVERY'}]) {
    const fresh=harness();await rejects(fresh.execute('fence-missing',payload),'INVALID_PROBE_REQUEST');
    assert.equal(fresh.events.length,0);
  }
  for(const patch of [{stage:'development'},{allowedUserId:''},{expiresAt:time}]) {
    const fresh=harness({settings:patch});await rejects(fresh.execute('fence-missing'),'PROBE_NOT_AUTHORIZED');
    assert.equal(fresh.events.length,0);
  }
});

test('expiry after a writer commit rolls back the reader before another guard write',async()=>{
  const h=harness({expireAfterWriter:true});await rejects(h.execute('fence-missing'),'PROBE_NOT_AUTHORIZED');
  assert.equal(h.events.some(row=>row.kind==='commit' && row.number===3),true);
  assert.equal(h.events.some(row=>row.kind==='commit' && row.number===2),false);
  assert.equal([...h.records.values()].some(row=>row.type==='GUARD_DECISION'),false);assert.equal(h.locks.size,0);
});

test('unknown write/commit failures, zero updates, unsupported queries and failed rollback never count as protection',async()=>{
  for(const [options,caseId,code] of [
    [{writeFailure:true},'write-existing-late','PROBE_WRITE_PROTECTION_FAILED'],
    [{commitFailure:true},'write-existing-late','PROBE_WRITE_PROTECTION_FAILED'],
    [{zeroUpdate:true},'write-existing-late','PROBE_GUARD_WRITE_INVALID'],
    [{queryUnavailable:true},'fence-query-empty','PROBE_GUARD_QUERY_UNAVAILABLE'],
    [{rollbackFailure:true,writeFailure:true},'write-existing-late','PROBE_ROLLBACK_UNCONFIRMED']]) {
    const h=harness(options);await rejects(h.execute(caseId),code);
    assert.equal([...h.records.values()].some(row=>row.type==='GUARD_DECISION'),false);
  }
});

function transport(h,change=row=>row) {
  let sequence=0;
  return async inputs=>Promise.all(inputs.map(async input=>{
    try{return change({ok:true,requestId:'offline-guard-'+(++sequence),data:await h.execute(input.caseId)});}
    catch(error){return {ok:false,requestId:'offline-guard-'+(++sequence),error:{code:error.code}};}
  }));
}
test('the suite validates positive and bypass cases without claiming a complete production protocol',async()=>{
  const h=harness(),result=await runWriteProtectionScenarios({invokeMany:transport(h),runId:settings.runId});
  assert.equal(result.passed,true);assert.equal(result.assertions.length,6);assert.equal(h.records.size,22);
  assert.equal(result.predicateFencing,'COOPERATIVE_PROTOCOL_ONLY');
  assert.equal(result.businessOrderPersistence,'NOT_RUN');assert.equal(result.transactionBudget,'NOT_RUN');
  assert.deepEqual(result.assertions.map(row=>row.outcome),['WRITER_CONFLICT','READER_CONFLICT',
    'READER_CONFLICT','READER_CONFLICT','STALE_COMMIT','STALE_COMMIT']);
});
test('the suite reports an unsafe late fence instead of accepting a changing write as sufficient proof',async()=>{
  const unsafe=await harness({ignoreConflicts:true}).execute('fence-missing');
  assert.equal(unsafe.outcome,'STALE_COMMIT');assert.equal(unsafe.readProtected,false);
  const invokeMany=transport(harness(),row=>row.data.caseId==='fence-missing'?{...row,data:{...row.data,
    outcome:'STALE_COMMIT',readerCommitted:true,decisionExists:true,readProtected:false,
    readerState:'COMMITTED',releaseMarker:false,conflictDiagnostic:null}}:row);
  const result=await runWriteProtectionScenarios({invokeMany,runId:settings.runId});
  assert.equal(result.passed,false);assert.equal(result.assertions.filter(row=>!row.passed).length,1);
});
test('suite validation rejects fabricated fence participation, outcome, version or protection claims',async()=>{
  for(const patch of [{writerParticipates:false},{outcome:'READER_CONFLICT'},{fenceVersion:0},{readProtected:false},
    {lockReleaseVerified:false},{writerState:'COMMITTED'},{conflictDiagnostic:{providerCode:'UNKNOWN'}}])
    await assert.rejects(runWriteProtectionScenarios({invokeMany:transport(harness(),row=>({...row,data:{...row.data,...patch}})),
      runId:settings.runId}),/INVALID_PROBE_RESPONSE/);
});
test('suite retains failed request evidence and stops after a provider error',async()=>{
  const evidence=[];
  await assert.rejects(runWriteProtectionScenarios({invokeMany:transport(harness({zeroUpdate:true})),runId:settings.runId,
    onEvidence:row=>evidence.push(row)}),/PROBE_WRITE_PROTECTION_FAILED/);
  assert.equal(evidence.length,1);assert.equal(evidence[0].response.error.code,'PROBE_GUARD_WRITE_INVALID');
  assert.equal(GUARD_CASES.length,6);
});

test('failed writer rollback still attempts reader cleanup and only returns sanitized diagnostics',async()=>{
  const h=harness({rollbackFailure:true,writeFailure:true});
  await assert.rejects(h.execute('write-existing-early'),error=>{
    assert.equal(error.code,'PROBE_ROLLBACK_UNCONFIRMED');
    assert.equal(error.diagnostic.primary,null);
    assert.equal(JSON.stringify(error).includes('private-'),false);return true;
  });
  assert.equal(h.events.some(row=>row.kind==='rollback' && row.number===2),true);
});

test('a provider conflict wrapped in a numeric SDK error keeps its exact marker and skips a second termination',async()=>{
  const h=harness({wrappedConflict:true}),result=await h.execute('write-existing-late');
  assert.equal(result.conflictDiagnostic.providerCode,'DATABASE_TRANSACTION_CONFLICT');
  assert.equal(result.conflictDiagnostic.numericErrCode,-501001);
  assert.equal(h.events.some(row=>row.kind==='rollback' && row.number===2),false);
  assert.equal(JSON.stringify(result).includes('private-provider-message'),false);
});

test('a conflict that leaves the staged decision locked fails the fresh release check',async()=>{
  const h=harness({retainConflictLocks:true});
  await rejects(h.execute('fence-missing'),'PROBE_WRITE_PROTECTION_FAILED');
  assert.equal([...h.records.values()].some(row=>row.type==='GUARD_DECISION'),false);
  assert.equal([...h.records.values()].some(row=>row.type==='GUARD_RELEASE_CHECK'),false);
});

test('a generic transaction-fail or termination message is not promoted to a conflict',async()=>{
  for(const error of [Object.assign(new Error('transaction already aborted'),{code:'DATABASE_TRANSACTION_FAIL'}),
    Object.assign(new Error('DATABASE_TRANSACTION_CONFLICTED private-provider-message'),{errCode:-501001})]) {
    const h=harness({writeFailure:error});await rejects(h.execute('write-existing-late'),'PROBE_WRITE_PROTECTION_FAILED');
    assert.equal(h.events.some(row=>row.kind==='rollback' && row.number===2),true);
    assert.equal(h.events.some(row=>row.kind==='rollback' && row.number===3),true);
  }
});

test('a selected guard subset remains explicitly incomplete and rejects unknown or duplicate cases before calling cloud',async()=>{
  const result=await runWriteProtectionScenarios({invokeMany:transport(harness()),runId:settings.runId,
    cases:['write-existing-late']});
  assert.equal(result.passed,true);assert.equal(result.complete,false);assert.equal(result.notRun.length,5);
  let calls=0;
  for(const cases of [[],['unknown'],['fence-missing','fence-missing']])
    await assert.rejects(runWriteProtectionScenarios({invokeMany:()=>{calls++;},runId:settings.runId,cases}),/INVALID_GUARD_CASES/);
  assert.equal(calls,0);
});
