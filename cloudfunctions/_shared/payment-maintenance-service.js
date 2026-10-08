'use strict';
const {freeze}=require('./payment-intent-model');
const {canonicalJSON,scopedDocumentId}=require('./idempotency-model');
const {makeJob,claimJob,finishJob,reconciliationReport,policy,maintenanceCandidates,validateJob}=require('./payment-maintenance-model');
function fail(code){throw Object.assign(new Error(code),{code});}
const methods=['readJob','insertEvent','saveJob','assertMaintenanceReads','readLocalStatement','readPendingState'];
function createPaymentMaintenanceService(options){
  const {runTransaction,now,verifyInvocation,verifyOutcome,verifyStatement,newLeaseToken,settings,jobPolicy,maxStatementBytes}=options;
  if(![runTransaction,now,verifyInvocation,verifyOutcome,verifyStatement,newLeaseToken].every(v=>typeof v==='function')||
      !Number.isSafeInteger(maxStatementBytes)||maxStatementBytes<1)fail('INVALID_CONFIGURATION');
  policy(jobPolicy);
  async function authorized(invocation,context){let ok;try{ok=await verifyInvocation(invocation,context);}catch(_){fail('MAINTENANCE_AUTH_UNAVAILABLE');}
    if(ok!==true)fail('FORBIDDEN');}
  function adapter(tx){if(!tx||methods.some(k=>typeof tx[k]!=='function'))fail('INVALID_TRANSACTION_ADAPTER');}
  async function fence(tx,reads){if(await tx.assertMaintenanceReads(reads)!==true)fail('VERSION_CONFLICT');}
  async function write(effect){if(await effect!==1)fail('VERSION_CONFLICT');}
  function commitClock(at,leaseUntil=null){const current=now();
    if(!Number.isSafeInteger(current)||current<at)fail('INVALID_MAINTENANCE_CLOCK');
    if(leaseUntil!==null&&current>=leaseUntil)fail('STALE_MAINTENANCE_LEASE');}
  async function alert(tx,value){if(value){const old=await tx.readJob(value._id);
    if(old&&(old.recordType!=='ALERT_REQUIREMENT'||old.reason!==value.reason))fail('INVALID_ALERT_RECORD');
    if(!old)await write(tx.insertEvent(value));}}
  const flags={scope:'OFFLINE_MAINTENANCE_RESULT',callable:false,cloudVerified:false,moneyAdjusted:false,messageSent:false};
  return Object.freeze({
    async ensure(kind,entity,invocation){
      await authorized(invocation,{action:'ENSURE',kind,entityId:entity?._id});
      return runTransaction(async tx=>{adapter(tx);const pending=await tx.readPendingState(settings);
        const candidate=maintenanceCandidates(pending,settings).find(v=>v.kind===kind&&v.entity._id===entity?._id&&v.entity.version===entity.version);
        if(!candidate)fail('MAINTENANCE_TARGET_CHANGED');
        const job=makeJob(kind,candidate.entity,settings,now()),old=await tx.readJob(job._id);
        if(old)validateJob(old,settings,now());
        await fence(tx,{old,pending});if(!old)await write(tx.insertEvent(job));commitClock(job.createdAt);
        return freeze({...flags,jobId:job._id,created:!old});});
    },
    async claim(jobId,invocation){
      await authorized(invocation,{action:'CLAIM',jobId});
      return runTransaction(async tx=>{adapter(tx);const old=await tx.readJob(jobId);if(!old)fail('NOT_FOUND');
        const p=claimJob(old,settings,jobPolicy,now(),newLeaseToken());await fence(tx,{old});
        if(p.job)await write(tx.saveJob(p.job,old.version));
        if(p.disposition==='CLAIMED'){
          const runId=scopedDocumentId('maintenance-run',[old._id,String(p.job.version)]);
          await write(tx.insertEvent({_id:runId,schemaVersion:1,version:0,createdAt:p.job.updatedAt,updatedAt:p.job.updatedAt,
            recordType:'MAINTENANCE_RUN',environment:settings.environment,jobId:old._id,jobVersion:p.job.version,
            requestId:runId,kind:old.kind,entityId:old.entityId,entityVersion:old.entityVersion,attempt:p.job.attemptCount,
            startedAt:p.job.updatedAt,leaseUntil:p.job.leaseUntil,finishedAt:null,outcome:'STARTED'}));
        }
        await alert(tx,p.alert);
        commitClock(p.job?.updatedAt||old.updatedAt,p.disposition==='CLAIMED'?p.job.leaseUntil:null);
        return freeze({...flags,disposition:p.disposition,status:p.job?.status||old.status,ticket:p.disposition==='CLAIMED'?
          {jobId:old._id,version:p.job.version,leaseToken:p.job.leaseToken}:null,
          // Domain services must re-read/re-authorize before using this hint.
          domainHint:p.disposition==='CLAIMED'?{kind:old.kind,entityId:old.entityId,entityVersion:old.entityVersion}:null});});
    },
    async acceptOutcome(raw){
      let v;try{v=await verifyOutcome(raw);}catch(_){fail('MAINTENANCE_VERIFIER_UNAVAILABLE');}
      if(!v||!v.ticket)fail('MAINTENANCE_SOURCE_REJECTED');
      return runTransaction(async tx=>{adapter(tx);const old=await tx.readJob(v.ticket.jobId);if(!old)fail('NOT_FOUND');
        const p=finishJob(old,v.ticket,v.outcome,settings,jobPolicy,now());
        const runId=scopedDocumentId('maintenance-run',[old._id,String(old.version)]),run=await tx.readJob(runId);
        if(!run||run.recordType!=='MAINTENANCE_RUN'||run.jobId!==old._id||run.jobVersion!==old.version||run.outcome!=='STARTED')
          fail('INVALID_MAINTENANCE_RUN');
        await fence(tx,{old,run});await write(tx.saveJob(p.job,old.version));
        await write(tx.saveJob({...run,version:run.version+1,updatedAt:p.job.updatedAt,finishedAt:p.job.updatedAt,outcome:v.outcome},run.version));
        await alert(tx,p.alert);
        commitClock(p.job.updatedAt,old.leaseUntil);
        return freeze({...flags,status:p.job.status});});
    },
    async reconcile(raw,invocation){
      await authorized(invocation,{action:'RECONCILE'});
      let encoded;try{encoded=canonicalJSON(raw);}catch(_){fail('INVALID_STATEMENT_INPUT');}
      if(Buffer.byteLength(encoded,'utf8')>maxStatementBytes)fail('INVALID_STATEMENT_INPUT');
      let statement;try{statement=await verifyStatement(raw,settings);}catch(_){fail('STATEMENT_VERIFIER_UNAVAILABLE');}
      if(!statement)fail('STATEMENT_SOURCE_REJECTED');
      return runTransaction(async tx=>{adapter(tx);const local=await tx.readLocalStatement(statement),report=reconciliationReport(local,statement,settings,now());
        const old=await tx.readJob(report._id);
        if(old&&(old.recordType!=='RECONCILIATION_REPORT'||old.semanticFingerprint!==report.semanticFingerprint))fail('INVALID_RECONCILIATION_REPORT');
        await fence(tx,{local,old});if(!old)await write(tx.insertEvent(report));
        if(report.requiresOperator)await alert(tx,{_id:scopedDocumentId('reconciliation-alert',[report._id]),recordType:'ALERT_REQUIREMENT',
          schemaVersion:1,version:0,createdAt:report.createdAt,updatedAt:report.updatedAt,environment:settings.environment,
          reportId:report._id,reason:'LEDGER_MISMATCH',status:'OPEN',messageSent:false,requiresOperator:true});
        commitClock(report.createdAt);
        return freeze({...flags,reportId:report._id,matched:report.matched,findings:report.findings});});
    }
  });
}
module.exports={createPaymentMaintenanceService};
