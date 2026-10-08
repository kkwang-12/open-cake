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
module.exports={runTransactionScenarios};
