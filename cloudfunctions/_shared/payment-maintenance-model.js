'use strict';
// Offline scheduling and ledger comparison. Never charges, refunds or sends alerts.
const {scopedDocumentId,requestFingerprint}=require('./idempotency-model');
const {freeze}=require('./payment-intent-model');
const count=v=>Number.isSafeInteger(v)&&v>=0;
const time=v=>count(v)&&v>0&&Number.isFinite(new Date(v).getTime());
const text=v=>typeof v==='string'&&v.trim()===v&&v.length>0&&v.length<=256;
const compare=(a,b)=>a<b?-1:a>b?1:0;
function fail(code){throw Object.assign(new Error(code),{code});}
const kinds=['PAYMENT_QUERY','REFUND_QUERY','PAYMENT_REVIEW','ORDER_CANCELLATION_REVIEW'];
function policy(v){
  if(!v||!['retryDelayMs','leaseMs','maxAttempts','alertAfterMs'].every(k=>count(v[k])&&v[k]>0))fail('INVALID_MAINTENANCE_POLICY');
  return v;
}
function scope(v){if(!v||!['environment','appId','merchantId','provider'].every(k=>text(v[k])))fail('INVALID_MAINTENANCE_SCOPE');return v;}
function makeJob(kind,entity,settings,now){
  scope(settings);if(!kinds.includes(kind)||!entity||!text(entity._id)||!count(entity.version)||!time(now))fail('INVALID_MAINTENANCE_INPUT');
  const id=scopedDocumentId('payment-maintenance-job',[settings.environment,settings.appId,settings.merchantId,settings.provider,kind,entity._id,String(entity.version)]);
  return freeze({_id:id,schemaVersion:1,version:0,createdAt:now,updatedAt:now,recordType:'MAINTENANCE_JOB',
    ...Object.fromEntries(['environment','appId','merchantId','provider'].map(k=>[k,settings[k]])),kind,entityId:entity._id,
    entityVersion:entity.version,status:'PENDING',attemptCount:0,nextRunAt:now,leaseToken:null,leaseUntil:null,lastOutcome:null});
}
function maintenanceCandidates(snapshot,settings){
  scope(settings);
  if(!snapshot||snapshot.complete!==true||!['payments','refunds','orders'].every(k=>Array.isArray(snapshot[k])))
    fail('INCOMPLETE_MAINTENANCE_SNAPSHOT');
  const candidates=[],payments=new Map();
  for(const p of snapshot.payments){
    if(!p||!text(p._id)||!count(p.version)||!['environment','appId','merchantId','provider'].every(k=>p[k]===settings[k])||
        !['PENDING','EXCEPTION','PAID','CLOSED'].includes(p.status)||!['UNAPPLIED','APPLIED','QUARANTINED'].includes(p.accountingState)||
        !text(p.orderId)||payments.has(p._id))fail('INVALID_MAINTENANCE_INPUT');
    payments.set(p._id,p);
    if(['PENDING','EXCEPTION'].includes(p.status))candidates.push({kind:'PAYMENT_QUERY',entity:{_id:p._id,version:p.version}});
    else if(p.status==='PAID'&&p.accountingState!=='APPLIED')candidates.push({kind:'PAYMENT_REVIEW',entity:{_id:p._id,version:p.version}});
  }
  const seen=new Set();
  for(const r of snapshot.refunds){
    if(!r||!text(r._id)||!count(r.version)||!payments.has(r.paymentId)||seen.has(r._id)||
        !['PENDING','FAILED','SUCCEEDED'].includes(r.status))fail('INVALID_MAINTENANCE_INPUT');
    seen.add(r._id);if(r.status!=='SUCCEEDED')candidates.push({kind:'REFUND_QUERY',entity:{_id:r._id,version:r.version}});
  }
  const orders=new Set();
  for(const o of snapshot.orders){
    if(!o||!text(o._id)||!count(o.version)||orders.has(o._id))fail('INVALID_MAINTENANCE_INPUT');orders.add(o._id);
    const own=[...payments.values()].filter(p=>p.orderId===o._id);
    if(o.orderStatus==='PENDING_PAYMENT'&&o.paymentStatus==='CLOSED'&&own.length&&own.every(p=>p.status==='CLOSED'))
      candidates.push({kind:'ORDER_CANCELLATION_REVIEW',entity:{_id:o._id,version:o.version}});
  }
  return freeze(candidates);
}
function alertFor(job,reason,now){
  return freeze({_id:scopedDocumentId('payment-maintenance-alert',[job._id,reason]),schemaVersion:1,version:0,
    createdAt:now,updatedAt:now,recordType:'ALERT_REQUIREMENT',environment:job.environment,jobId:job._id,reason,
    status:'OPEN',messageSent:false,requiresOperator:true});
}
function validateJob(job,settings,now){
  scope(settings);
  if(!job||job.recordType!=='MAINTENANCE_JOB'||job.schemaVersion!==1||!count(job.version)||!count(job.attemptCount)||
      !time(job.createdAt)||!time(job.updatedAt)||job.updatedAt<job.createdAt||job.updatedAt>now||!time(job.nextRunAt)||
      !kinds.includes(job.kind)||!text(job.entityId)||!count(job.entityVersion)||
      !['PENDING','RUNNING','DONE','REVIEW'].includes(job.status)||!time(now)||
      !['environment','appId','merchantId','provider'].every(k=>job[k]===settings[k])||
      job._id!==makeJob(job.kind,{_id:job.entityId,version:job.entityVersion},settings,job.createdAt)._id||
      (job.status==='RUNNING'?(!text(job.leaseToken)||!time(job.leaseUntil)):(job.leaseToken!==null||job.leaseUntil!==null)))
    fail('INVALID_MAINTENANCE_JOB');
}
function claimJob(job,settings,p,now,token){
  validateJob(job,settings,now);policy(p);if(!text(token))fail('INVALID_MAINTENANCE_INPUT');
  if(['DONE','REVIEW'].includes(job.status)||job.nextRunAt>now||job.status==='RUNNING'&&job.leaseUntil>now)
    return freeze({job:null,alert:null,disposition:'SKIP'});
  if(!count(job.version+1))fail('INVALID_MAINTENANCE_INPUT');
  if(job.attemptCount>=p.maxAttempts)return freeze({disposition:'REVIEW_REQUIRED',
    job:{...job,version:job.version+1,updatedAt:now,status:'REVIEW',leaseToken:null,leaseUntil:null},alert:alertFor(job,'ATTEMPTS_EXHAUSTED',now)});
  if(!time(now+p.leaseMs)||!count(job.version+1)||!count(job.attemptCount+1))fail('INVALID_MAINTENANCE_INPUT');
  return freeze({disposition:'CLAIMED',alert:now-job.createdAt>=p.alertAfterMs?alertFor(job,'LONG_UNRESOLVED',now):null,
    job:{...job,version:job.version+1,updatedAt:now,status:'RUNNING',attemptCount:job.attemptCount+1,leaseToken:token,leaseUntil:now+p.leaseMs}});
}
function finishJob(job,ticket,outcome,settings,p,now){
  validateJob(job,settings,now);policy(p);
  if(!ticket||ticket.jobId!==job._id||ticket.version!==job.version||ticket.leaseToken!==job.leaseToken||
      job.status!=='RUNNING'||now>=job.leaseUntil)fail('STALE_MAINTENANCE_LEASE');
  if(!['RESOLVED','RETRY','REVIEW'].includes(outcome))fail('INVALID_MAINTENANCE_RESULT');
  const needsReview=outcome==='REVIEW'||outcome==='RETRY'&&job.attemptCount>=p.maxAttempts;
  if(!time(now+p.retryDelayMs)||!count(job.version+1))fail('INVALID_MAINTENANCE_INPUT');
  return freeze({job:{...job,version:job.version+1,updatedAt:now,status:needsReview?'REVIEW':outcome==='RESOLVED'?'DONE':'PENDING',
    nextRunAt:now+p.retryDelayMs,leaseToken:null,leaseUntil:null,lastOutcome:outcome},
    alert:needsReview?alertFor(job,outcome==='REVIEW'?'DOMAIN_REVIEW_REQUIRED':'ATTEMPTS_EXHAUSTED',now):null});
}
function reconciliationReport(local,statement,settings,now){
  scope(settings);
  if(!time(now)||!local||!statement||statement.complete!==true||local.complete!==true||
      !time(statement.startAt)||!time(statement.endAt)||statement.startAt>=statement.endAt||statement.endAt>now||
      local.startAt!==statement.startAt||local.endAt!==statement.endAt||
      !['environment','appId','merchantId','provider'].every(k=>statement[k]===settings[k]&&local[k]===settings[k])||
      !['payments','refunds'].every(k=>Array.isArray(local[k])&&Array.isArray(statement[k])))fail('INCOMPLETE_RECONCILIATION_INPUT');
  const findings=[];const finding=(kind,code,reference)=>findings.push({kind,code,reference});
  for(const kind of ['payments','refunds']){
    const check=rows=>{
      if(rows.some(r=>!r||!text(r.reference)||!count(r.amountCents)||r.amountCents===0||r.currency!=='CNY'||
          !['SUCCESS','PENDING','FAILED','CLOSED'].includes(r.status)||
          (r.status==='SUCCESS'?!text(r.providerId):r.providerId!==null&&!text(r.providerId))))fail('INVALID_RECONCILIATION_ROW');
      if(new Set(rows.map(r=>r.reference)).size!==rows.length)fail('DUPLICATE_RECONCILIATION_ROW');
      const successful=rows.filter(r=>r.status==='SUCCESS');
      if(new Set(successful.map(r=>r.providerId)).size!==successful.length)fail('DUPLICATE_PROVIDER_TRANSACTION');
    };
    check(local[kind]);check(statement[kind]);
    const external=new Map(statement[kind].map(r=>[r.reference,r]));
    for(const row of local[kind]){
      const other=external.get(row.reference);external.delete(row.reference);
      if(!other)finding(kind,'PROVIDER_RECORD_MISSING',row.reference);
      else if(other.amountCents!==row.amountCents)finding(kind,'AMOUNT_MISMATCH',row.reference);
      else if(other.status!==row.status)finding(kind,'STATUS_MISMATCH',row.reference);
      else if(other.providerId!==row.providerId)finding(kind,'PROVIDER_ID_MISMATCH',row.reference);
    }
    for(const row of external.values())finding(kind,'LOCAL_RECORD_MISSING',row.reference);
  }
  findings.sort((a,b)=>compare(a.kind+'|'+a.reference+'|'+a.code,b.kind+'|'+b.reference+'|'+b.code));
  const publicFindings=findings.map(v=>({...v,reference:scopedDocumentId('reconciliation-reference',[v.kind,v.reference])}));
  // Only known normalized fields enter the fingerprint; private raw columns do not.
  const normalized=rows=>rows.map(r=>({reference:r.reference,amountCents:r.amountCents,currency:r.currency,status:r.status,providerId:r.providerId}))
    .sort((a,b)=>compare(a.reference,b.reference));
  const digest=requestFingerprint({settings:Object.fromEntries(['environment','appId','merchantId','provider'].map(k=>[k,settings[k]])),
    startAt:statement.startAt,endAt:statement.endAt,local:{payments:normalized(local.payments),refunds:normalized(local.refunds)},
    provider:{payments:normalized(statement.payments),refunds:normalized(statement.refunds)}});
  return freeze({_id:scopedDocumentId('reconciliation-report',[settings.environment,digest]),recordType:'RECONCILIATION_REPORT',
    schemaVersion:1,version:0,createdAt:now,updatedAt:now,environment:settings.environment,startAt:statement.startAt,endAt:statement.endAt,
    semanticFingerprint:digest,matched:findings.length===0,findings:publicFindings,requiresOperator:findings.length>0,
    scope:'OFFLINE_RECONCILIATION_REPORT',cloudVerified:false,callable:false,moneyAdjusted:false,messageSent:false});
}
module.exports={makeJob,claimJob,finishJob,validateJob,reconciliationReport,policy,maintenanceCandidates};
