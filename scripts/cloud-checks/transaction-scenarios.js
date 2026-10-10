'use strict';
// Transport-neutral assertions. Only the native runner supplies cloud evidence.
async function runTransactionScenarios({invokeMany,runId,onEvidence=()=>{}}) {
  const evidence=[],assertions=[];
  function check(name,passed){assertions.push({name,passed:passed===true});}
  async function many(payloads) {
    const responses=await invokeMany(payloads);
    if(!Array.isArray(responses) || responses.length!==payloads.length)throw new Error('INVALID_PROBE_TRANSPORT');
    for(let i=0;i<responses.length;i++) {
      const response=responses[i];
      if(!response || typeof response.ok!=='boolean' || typeof response.requestId!=='string' ||
        (response.ok && (!response.data || response.data.scope!=='SDK_CAPABILITY_PROBE' ||
          response.data.businessOrderCreated!==false || response.data.runId!==runId)))throw new Error('INVALID_PROBE_RESPONSE');
      const row={input:payloads[i],response};evidence.push(row);onEvidence(row);
    }
    return responses;
  }
  const one=async payload=>(await many([payload]))[0];
  const input=(operation,caseId,command=0,mode='PICKUP')=>({operation,caseId,command,mode});
  async function prepare(caseId) {
    const result=await one(input('prepare',caseId));
    if(!result.ok || result.data.created!==3)throw new Error('PROBE_RUN_NOT_FRESH');
  }
  async function read(caseId,command=0,mode='PICKUP') {
    const result=await one(input('read',caseId,command,mode));
    if(!result.ok || !Array.isArray(result.data.documents) || result.data.documents.length!==8)throw new Error('PROBE_READ_FAILED');
    const ids=result.data.documents.map(r=>r.collection+':'+r._id);
    if(new Set(ids).size!==8 || result.data.documents.some(r=>typeof r.exists!=='boolean'))throw new Error('PROBE_READ_INVALID');
    return result.data.documents;
  }
  // Read first: detect a mismatched server run before writing any test resource.
  const initial=await read('atomic');
  if(initial.some(r=>r.exists))throw new Error('PROBE_RUN_NOT_FRESH');
  await prepare('atomic');
  const atomic=await one(input('hold','atomic')),atomicDocs=await read('atomic');
  check('atomic-seven-writes',atomic.ok && atomic.data.disposition==='HELD' && atomic.data.writes===7 &&
    atomicDocs.every(r=>r.exists) && atomicDocs.slice(0,3).map(r=>r.heldUnits).join(',')==='1,1,0');
  const repeatPrepare=await one(input('prepare','atomic')),afterRepeat=await read('atomic');
  check('prepare-preserves-occupied-resources',repeatPrepare.ok && repeatPrepare.data.created===0 &&
    JSON.stringify(atomicDocs)===JSON.stringify(afterRepeat));
  for(let i=1;i<=7;i++) {
    const caseId='fault-'+i;await prepare(caseId);
    const failed=await one(input('hold',caseId)),docs=await read(caseId);
    check(caseId+'-rollback',!failed.ok && failed.error?.code==='PROBE_INJECTED_FAILURE' &&
      docs.slice(0,3).every(r=>r.exists && r.version===0 && r.heldUnits===0) && docs.slice(3).every(r=>!r.exists));
  }
  await prepare('same-key');
  const duplicate=await many([input('hold','same-key'),input('hold','same-key')]);
  const duplicateDocs=await read('same-key');
  const replay=await one(input('hold','same-key'));
  const altered=await one(input('hold','same-key',0,'DELIVERY'));
  check('same-key-concurrent-single-hold',duplicate.every(r=>r.ok) &&
    duplicate.filter(r=>r.data.disposition==='HELD').length===1 &&
    duplicate.filter(r=>r.data.disposition==='REPLAY').length===1 &&
    duplicateDocs.every(r=>r.exists) && duplicateDocs.slice(0,3).map(r=>r.heldUnits).join(',')==='1,1,0');
  check('original-key-replay',replay.ok && replay.data.disposition==='REPLAY');
  check('same-key-changed-input-rejected',!altered.ok && altered.error?.code==='IDEMPOTENCY_KEY_REUSED');
  for(const caseId of ['stock-last','slot-last']) {
    await prepare(caseId);
    const race=await many([input('hold',caseId,0),input('hold',caseId,1)]);
    const docs=await Promise.all([read(caseId,0),read(caseId,1)]);
    check(caseId+'-race',race.filter(r=>r.ok && r.data.disposition==='HELD').length===1 &&
      race.filter(r=>!r.ok && r.error?.code==='RESOURCE_UNAVAILABLE').length===1 &&
      docs.every(rows=>rows.slice(0,3).map(r=>r.heldUnits).join(',')==='1,1,0') &&
      docs.filter(rows=>rows.slice(3).every(r=>r.exists)).length===1 &&
      docs.filter(rows=>rows.slice(3).every(r=>!r.exists)).length===1);
  }
  await prepare('mode-independent');
  const both=await many([input('hold','mode-independent',0),input('hold','mode-independent',1,'DELIVERY')]);
  const deliveryFull=await one(input('hold','mode-independent',2,'DELIVERY'));
  const pickups=await many([input('hold','mode-independent',3),input('hold','mode-independent',4)]);
  const pickupFull=await one(input('hold','mode-independent',5)),modes=await read('mode-independent');
  check('independent-pickup-delivery-capacity',both.every(r=>r.ok) && pickups.every(r=>r.ok) &&
    !deliveryFull.ok && deliveryFull.error?.code==='RESOURCE_UNAVAILABLE' &&
    !pickupFull.ok && pickupFull.error?.code==='RESOURCE_UNAVAILABLE' &&
    modes.slice(0,3).map(r=>r.heldUnits).join(',')==='4,3,1');
  const first=await one(input('unique','unique',0)),second=await one(input('unique','unique',1));
  const uniqueDocs=await Promise.all([read('unique',0),read('unique',1)]);
  check('compound-unique-conflict',first.ok && !second.ok && second.error?.code==='CLOUD_UNIQUE_CONFLICT' &&
    uniqueDocs[0][7].exists && !uniqueDocs[1][7].exists && uniqueDocs[0][7]._id!==uniqueDocs[1][7]._id);
  return {assertions,evidence,passed:assertions.every(row=>row.passed),
    businessOrderPersistence:'NOT_RUN',predicateFencing:'NOT_RUN',transactionBudget:'NOT_RUN',
    lostResponseTransport:'NOT_RUN'};
}
async function runReadProtectionScenarios({invokeMany,runId,onEvidence=()=>{}}) {
  const evidence=[],assertions=[];
  for(const caseId of ['read-existing','read-missing','query-empty']) {
    const input={operation:'read-protection',caseId,command:0,mode:'PICKUP'};
    const responses=await invokeMany([input]);
    if(!Array.isArray(responses) || responses.length!==1)throw new Error('INVALID_PROBE_TRANSPORT');
    const response=responses[0],data=response?.data;
    if(!response || typeof response.ok!=='boolean' || typeof response.requestId!=='string' ||
      (response.ok && (!data || data.scope!=='SDK_CAPABILITY_PROBE' || data.businessOrderCreated!==false ||
        data.runId!==runId || data.caseId!==caseId || data.command!==0 || data.mode!=='PICKUP' ||
        data.disposition!=='READ_PROTECTION_OBSERVED')))throw new Error('INVALID_PROBE_RESPONSE');
    const row={input,response};evidence.push(row);onEvidence(row);
    if(!response.ok)throw new Error('PROBE_READ_PROTECTION_FAILED');
    const expected={
      STALE_COMMIT:[true,true,1,true,false],READER_CONFLICT:[true,false,1,false,true],
      WRITER_CONFLICT:[false,true,caseId==='read-existing'?0:null,true,true],
      QUERY_UNAVAILABLE:[false,false,null,false,false],QUERY_REJECTED:[false,false,null,false,false]
    }[data.outcome];
    const actual=[data.writerCommitted,data.readerCommitted,data.dependencyVersion,data.decisionExists,data.readProtected];
    if(!expected || JSON.stringify(expected)!==JSON.stringify(actual) ||
      (data.outcome.startsWith('QUERY_') && caseId!=='query-empty'))throw new Error('INVALID_PROBE_RESPONSE');
    assertions.push({name:caseId+'-commit-protection',passed:data.readProtected,outcome:data.outcome});
  }
  return {assertions,evidence,passed:assertions.every(row=>row.passed),
    businessOrderPersistence:'NOT_RUN',predicateFencing:assertions[2].passed?'SDK_PROBE_PASSED':'NOT_PROTECTED',
    transactionBudget:'NOT_RUN',lostResponseTransport:'NOT_RUN'};
}
async function runWriteProtectionScenarios({invokeMany,runId,onEvidence=()=>{},cases}) {
  const evidence=[],assertions=[];
  const allCases=['write-existing-early','write-existing-late','fence-missing','fence-query-empty',
    'bypass-missing','bypass-query-empty'];
  const selected=cases || allCases;
  if(!Array.isArray(selected) || !selected.length || new Set(selected).size!==selected.length ||
    selected.some(name=>!allCases.includes(name)))throw new Error('INVALID_GUARD_CASES');
  for(const caseId of selected) {
    const input={operation:'write-protection',caseId,command:0,mode:'PICKUP'};
    const responses=await invokeMany([input]);
    if(!Array.isArray(responses) || responses.length!==1)throw new Error('INVALID_PROBE_TRANSPORT');
    const response=responses[0],data=response?.data,existing=caseId.startsWith('write-existing-');
    const bypass=caseId.startsWith('bypass-');
    if(!response || typeof response.ok!=='boolean' || typeof response.requestId!=='string' ||
      (response.ok && (!data || data.scope!=='SDK_CAPABILITY_PROBE' || data.businessOrderCreated!==false ||
        data.runId!==runId || data.caseId!==caseId || data.command!==0 || data.mode!=='PICKUP' ||
        data.disposition!=='WRITE_PROTECTION_OBSERVED' || data.fenceVersion!==2 || data.lockReleaseVerified!==true ||
        data.writerParticipates!==!bypass || data.protectionKind!==(existing?'DOCUMENT_WRITE':'SHARED_FENCE'))))
      throw new Error('INVALID_PROBE_RESPONSE');
    const row={input,response};evidence.push(row);onEvidence(row);
    if(!response.ok)throw new Error('PROBE_WRITE_PROTECTION_FAILED');
    const expected={STALE_COMMIT:[true,true,existing?2:1,true,false],READER_CONFLICT:[true,false,existing?2:1,false,true],
      WRITER_CONFLICT:[false,true,existing?2:null,true,true]}[data.outcome];
    const actual=[data.writerCommitted,data.readerCommitted,data.dependencyVersion,data.decisionExists,data.readProtected];
    if(!expected || JSON.stringify(expected)!==JSON.stringify(actual) ||
      data.readerState!==(data.outcome==='READER_CONFLICT'?'PROVIDER_CONFLICT_ABORTED':'COMMITTED') ||
      data.writerState!==(data.outcome==='WRITER_CONFLICT'?'PROVIDER_CONFLICT_ABORTED':'COMMITTED') ||
      data.releaseMarker!==(data.outcome==='READER_CONFLICT') ||
      (data.readProtected?data.conflictDiagnostic?.providerCode!=='DATABASE_TRANSACTION_CONFLICT':data.conflictDiagnostic!==null))
      throw new Error('INVALID_PROBE_RESPONSE');
    const expectedOutcome=bypass?'STALE_COMMIT':caseId==='write-existing-early'?'WRITER_CONFLICT':'READER_CONFLICT';
    assertions.push({name:caseId+'-commit-contract',passed:data.outcome===expectedOutcome,outcome:data.outcome});
  }
  return {assertions,evidence,passed:assertions.every(row=>row.passed),
    complete:selected.length===allCases.length,notRun:allCases.filter(name=>!selected.includes(name)),
    businessOrderPersistence:'NOT_RUN',predicateFencing:'COOPERATIVE_PROTOCOL_ONLY',
    transactionBudget:'NOT_RUN',lostResponseTransport:'NOT_RUN'};
}
module.exports={runTransactionScenarios,runReadProtectionScenarios,runWriteProtectionScenarios};
