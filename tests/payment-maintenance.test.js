'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createPaymentMaintenanceService}=require('../cloudfunctions/_shared/payment-maintenance-service');
const {makeJob,claimJob,finishJob,maintenanceCandidates,reconciliationReport}=require('../cloudfunctions/_shared/payment-maintenance-model');
const settings={environment:'maintenance-test',appId:'offline-app',merchantId:'offline-merchant',provider:'WECHATPAY_DIRECT_V3'};
const policy={retryDelayMs:100,leaseMs:200,maxAttempts:3,alertAfterMs:300}; // Synthetic, not an operational policy.
const clone=v=>JSON.parse(JSON.stringify(v));
const row=(patch={})=>({reference:'PRIVATE_OUT_TRADE_NO',amountCents:1200,currency:'CNY',status:'SUCCESS',
  providerId:'PRIVATE_TRANSACTION_'+(patch.reference||'default'),...patch});
const snapshot=()=>({complete:true,payments:[{...settings,_id:'p',version:0,status:'PENDING',accountingState:'UNAPPLIED',orderId:'o'}],refunds:[],orders:[{_id:'o',version:0,orderStatus:'PENDING_PAYMENT',paymentStatus:'PENDING'}]});
function setup(){
  let db={events:{},pending:snapshot(),local:{...settings,complete:true,startAt:100,endAt:900,payments:[row()],refunds:[]}},seq=0,queue=Promise.resolve();
  const controls={now:1000,failAt:0,zeroAt:0,loseResponse:false,deny:false,conflict:false},proofs=new WeakMap(),invocation=Object.freeze({offline:true});
  const runTransaction=fn=>{const p=queue.then(async()=>{
    const state=clone(db);let writes=0;
    const changed=()=>{writes++;if(controls.advanceOnWrite)controls.now+=controls.advanceOnWrite;
      if(writes===controls.failAt)throw new Error('OFFLINE_WRITE_FAILURE');return writes===controls.zeroAt?0:1;};
    const tx={readJob:async id=>state.events[id]||null,readLocalStatement:async()=>state.local,readPendingState:async()=>state.pending,
      assertMaintenanceReads:async()=>!controls.conflict,
      insertEvent:async v=>{if(state.events[v._id])return 0;state.events[v._id]=clone(v);return changed();},
      saveJob:async(v,version)=>{if(state.events[v._id]?.version!==version)return 0;state.events[v._id]=clone(v);return changed();}};
    const result=await fn(tx);db=state;if(controls.loseResponse){controls.loseResponse=false;throw Object.assign(new Error('lost'),{code:'OFFLINE_RESPONSE_LOST'});}return result;
  });queue=p.catch(()=>{});return p;};
  const service=()=>createPaymentMaintenanceService({settings,jobPolicy:policy,maxStatementBytes:16384,runTransaction,now:()=>controls.now,
    newLeaseToken:()=> 'OFFLINE_LEASE_'+(++seq),verifyInvocation:async v=>v===invocation&&!controls.deny,
    verifyOutcome:async raw=>proofs.get(raw)||null,verifyStatement:async raw=>proofs.get(raw)||null});
  const proof=value=>{const raw=Object.freeze({offlineBody:'RAW_'+(++seq)});proofs.set(raw,clone(value));return raw;};
  const statement=patch=>proof({...settings,complete:true,startAt:100,endAt:900,payments:[row()],refunds:[],...patch});
  return {get db(){return db;},controls,invocation,service,proof,statement};
}
const ensure=s=>s.service().ensure('PAYMENT_QUERY',{_id:'p',version:0},s.invocation);
const claims=s=>Object.values(s.db.events).filter(v=>v.recordType==='MAINTENANCE_JOB');
const alerts=s=>Object.values(s.db.events).filter(v=>v.recordType==='ALERT_REQUIREMENT');
const rejects=(fn,code)=>assert.rejects(fn,e=>e.code===code);
test('P07 trusted complete scan selects queries/reviews without generating payment or refund submits',()=>{
  const s=snapshot();s.payments.push({...settings,_id:'paid',version:2,status:'PAID',accountingState:'QUARANTINED',orderId:'o'});
  s.refunds=[{_id:'refund',version:1,paymentId:'paid',status:'FAILED'}];
  assert.deepEqual(maintenanceCandidates(s,settings).map(v=>v.kind),['PAYMENT_QUERY','PAYMENT_REVIEW','REFUND_QUERY']);
  s.payments=s.payments.map(v=>({...v,status:'CLOSED'}));s.orders[0].paymentStatus='CLOSED';
  assert(maintenanceCandidates(s,settings).some(v=>v.kind==='ORDER_CANCELLATION_REVIEW'));
});
test('P07 invalid/incomplete/cross-environment scan or stale entity cannot create a job',async()=>{
  const s=setup();await rejects(()=>s.service().ensure('PAYMENT_QUERY',{_id:'p',version:1},s.invocation),'MAINTENANCE_TARGET_CHANGED');
  s.db.pending.complete=false;await rejects(()=>ensure(s),'INCOMPLETE_MAINTENANCE_SNAPSHOT');
  s.db.pending.complete=true;s.db.pending.payments[0].environment='production';await rejects(()=>ensure(s),'INVALID_MAINTENANCE_INPUT');
  assert.equal(claims(s).length,0);
});
test('P07 duplicate discovery and service restart preserve a single job',async()=>{
  const s=setup(),a=await ensure(s);assert.equal((await ensure(s)).created,false);assert.equal(claims(s).length,1);
  assert.equal(a.callable,false);assert.equal(a.moneyAdjusted,false);assert.equal(a.messageSent,false);
});
test('P07 parallel workers only acquire one active lease',async()=>{
  const s=setup(),a=await ensure(s),results=await Promise.all([s.service().claim(a.jobId,s.invocation),s.service().claim(a.jobId,s.invocation)]);
  assert.equal(results.filter(v=>v.disposition==='CLAIMED').length,1);assert.equal(claims(s)[0].attemptCount,1);
  assert.equal(results.find(v=>v.ticket).domainHint.kind,'PAYMENT_QUERY');
});
test('P07 expired lease can be reclaimed and old worker cannot acknowledge new work',async()=>{
  const s=setup(),a=await ensure(s),first=await s.service().claim(a.jobId,s.invocation);s.controls.now=1200;
  const next=await s.service().claim(a.jobId,s.invocation);assert.equal(next.disposition,'CLAIMED');
  await rejects(()=>s.service().acceptOutcome(s.proof({ticket:first.ticket,outcome:'RESOLVED'})),'STALE_MAINTENANCE_LEASE');
  await s.service().acceptOutcome(s.proof({ticket:next.ticket,outcome:'RESOLVED'}));assert.equal(claims(s)[0].status,'DONE');
});
test('P07 retry delay is honored without releasing payment/refund resources',async()=>{
  const s=setup(),a=await ensure(s),job=await s.service().claim(a.jobId,s.invocation),before=clone(s.db.pending);
  await s.service().acceptOutcome(s.proof({ticket:job.ticket,outcome:'RETRY'}));
  assert.equal((await s.service().claim(a.jobId,s.invocation)).disposition,'SKIP');s.controls.now=1100;
  assert.equal((await s.service().claim(a.jobId,s.invocation)).disposition,'CLAIMED');assert.deepEqual(s.db.pending,before);
});
test('P07 exhausted retries require an operator; replay never sends duplicate alerts',async()=>{
  const s=setup(),a=await ensure(s);
  for(let n=0;n<3;n++){
    const job=await s.service().claim(a.jobId,s.invocation);await s.service().acceptOutcome(s.proof({ticket:job.ticket,outcome:'RETRY'}));s.controls.now+=100;
  }
  assert.equal(claims(s)[0].status,'REVIEW');assert.equal(alerts(s).filter(v=>v.reason==='ATTEMPTS_EXHAUSTED').length,1);
  await s.service().claim(a.jobId,s.invocation);assert(alerts(s).every(v=>v.messageSent===false));
});
test('P07 old unresolved jobs generate one long-unresolved requirement with no personal data',async()=>{
  const s=setup(),a=await ensure(s);s.controls.now=1300;const job=await s.service().claim(a.jobId,s.invocation);
  assert.equal(alerts(s)[0].reason,'LONG_UNRESOLVED');await s.service().acceptOutcome(s.proof({ticket:job.ticket,outcome:'RETRY'}));
  s.controls.now=1400;await s.service().claim(a.jobId,s.invocation);assert.equal(alerts(s).filter(v=>v.reason==='LONG_UNRESOLVED').length,1);
  assert(!JSON.stringify(alerts(s)).includes('PRIVATE'));
});
test('P07 response lost after claim has one lease and cannot dispatch another worker immediately',async()=>{
  const s=setup(),a=await ensure(s);s.controls.loseResponse=true;
  await rejects(()=>s.service().claim(a.jobId,s.invocation),'OFFLINE_RESPONSE_LOST');
  assert.equal((await s.service().claim(a.jobId,s.invocation)).disposition,'SKIP');assert.equal(claims(s)[0].attemptCount,1);
});
test('P07 response lost after resolution is recoverable by inspecting the terminal job',async()=>{
  const s=setup(),a=await ensure(s),job=await s.service().claim(a.jobId,s.invocation);s.controls.loseResponse=true;
  await rejects(()=>s.service().acceptOutcome(s.proof({ticket:job.ticket,outcome:'RESOLVED'})),'OFFLINE_RESPONSE_LOST');
  assert.equal((await s.service().claim(a.jobId,s.invocation)).status,'DONE');
});
test('P07 job/alert transaction failures or zero writes roll back together',async()=>{
  for(const control of ['failAt','zeroAt'])for(let n=1;n<=3;n++){
    const s=setup(),a=await ensure(s);s.controls.now=1300;const before=clone(s.db);s.controls[control]=n;
    await assert.rejects(()=>s.service().claim(a.jobId,s.invocation));assert.deepEqual(s.db,before);
  }
});
test('P07 scheduler authority, result identity and read-set conflicts cannot be forged',async()=>{
  const s=setup();await rejects(()=>s.service().ensure('PAYMENT_QUERY',{_id:'p',version:0},{system:true}),'FORBIDDEN');
  const a=await ensure(s);s.controls.conflict=true;await rejects(()=>s.service().claim(a.jobId,s.invocation),'VERSION_CONFLICT');
  s.controls.conflict=false;const job=await s.service().claim(a.jobId,s.invocation);
  await rejects(()=>s.service().acceptOutcome({ticket:job.ticket,outcome:'RESOLVED',verified:true}),'MAINTENANCE_SOURCE_REJECTED');
});
test('P07 matching complete statements persist one report even across replays or row order changes',async()=>{
  const s=setup(),a=await s.service().reconcile(s.statement(),s.invocation),b=await s.service().reconcile(s.statement(),s.invocation);
  assert.equal(a.matched,true);assert.equal(a.reportId,b.reportId);assert.equal(Object.keys(s.db.events).length,1);
});
test('P07 discrepancies persist hashed findings and an unsent operator requirement',async()=>{
  const s=setup(),raw=s.statement({payments:[row({amountCents:1201,phone:'PRIVATE_PHONE'})]});
  const report=await s.service().reconcile(raw,s.invocation);assert.equal(report.matched,false);assert.equal(report.findings[0].code,'AMOUNT_MISMATCH');
  assert.equal(alerts(s)[0].reason,'LEDGER_MISMATCH');await s.service().reconcile(raw,s.invocation);assert.equal(alerts(s).length,1);
  assert(!JSON.stringify(s.db.events).includes('PRIVATE'));assert.equal(report.moneyAdjusted,false);assert.equal(report.messageSent,false);
});
test('P07 missing local/provider rows and status mismatches are distinguished',()=>{
  const local={...settings,complete:true,startAt:100,endAt:900,payments:[row(),row({reference:'missing'})],refunds:[row({reference:'refund'})]};
  const statement={...settings,complete:true,startAt:100,endAt:900,payments:[row({status:'PENDING'}),row({reference:'extra'})],refunds:[]};
  const codes=reconciliationReport(local,statement,settings,1000).findings.map(v=>v.code);
  assert(codes.includes('STATUS_MISMATCH'));assert(codes.includes('LOCAL_RECORD_MISSING'));assert(codes.includes('PROVIDER_RECORD_MISSING'));
});
test('P07 incomplete ranges, unauthenticated or cross-scope statements cannot claim a matched ledger',async()=>{
  const s=setup();await rejects(()=>s.service().reconcile({verified:true},s.invocation),'STATEMENT_SOURCE_REJECTED');
  for(const patch of [{complete:false},{environment:'production'},{startAt:99},{endAt:1001},{endAt:100}])
    await rejects(()=>s.service().reconcile(s.statement(patch),s.invocation),'INCOMPLETE_RECONCILIATION_INPUT');
  assert.equal(Object.keys(s.db.events).length,0);
});

test('P07 a missing or mismatched local scope cannot claim matching ledger contents',async()=>{
  for(const field of ['environment','appId','merchantId','provider'])for(const value of [undefined,'other-scope']){
    const s=setup();s.db.local[field]=value;
    await rejects(()=>s.service().reconcile(s.statement(),s.invocation),'INCOMPLETE_RECONCILIATION_INPUT');
    assert.equal(Object.keys(s.db.events).length,0);
  }
});
test('P07 duplicate or invalid money rows are rejected without suppressing discrepancies',async()=>{
  const s=setup();await rejects(()=>s.service().reconcile(s.statement({payments:[row(),row()]}),s.invocation),'DUPLICATE_RECONCILIATION_ROW');
  for(const patch of [{amountCents:-1},{amountCents:Number.MAX_SAFE_INTEGER+1},{currency:'USD'},{status:'CLIENT_PAID'}])
    await rejects(()=>s.service().reconcile(s.statement({payments:[row(patch)]}),s.invocation),'INVALID_RECONCILIATION_ROW');
});
test('P07 mismatch report and alert each fail atomically, without touching a financial ledger',async()=>{
  for(const control of ['failAt','zeroAt'])for(let n=1;n<=2;n++){
    const s=setup(),before=clone(s.db);s.controls[control]=n;
    await assert.rejects(()=>s.service().reconcile(s.statement({payments:[row({amountCents:1})]}),s.invocation));assert.deepEqual(s.db,before);
  }
});
test('P07 policy is explicit and expired/equal-boundary leases cannot acknowledge results',()=>{
  const job=makeJob('PAYMENT_QUERY',{_id:'p',version:0},settings,1000);
  assert.throws(()=>claimJob(job,settings,{...policy,leaseMs:0},1000,'token'),e=>e.code==='INVALID_MAINTENANCE_POLICY');
  const claimed=claimJob(job,settings,policy,1000,'token').job;
  assert.throws(()=>finishJob(claimed,{jobId:job._id,version:claimed.version,leaseToken:'token'},'RESOLVED',settings,policy,1200),
    e=>e.code==='STALE_MAINTENANCE_LEASE');
});
test('P07 mismatched provider identity and duplicated successful transaction cannot appear matched',async()=>{
  const s=setup(),report=await s.service().reconcile(s.statement({payments:[row({providerId:'other-provider-id'})]}),s.invocation);
  assert.equal(report.findings[0].code,'PROVIDER_ID_MISMATCH');
  await rejects(()=>s.service().reconcile(s.statement({payments:[row(),row({reference:'other-reference',providerId:row().providerId})]}),s.invocation),
    'DUPLICATE_PROVIDER_TRANSACTION');
});
test('P07 reordered normalized rows yield the same deterministic report across local/provider order',()=>{
  const a=row({reference:'a'}),b=row({reference:'B'}),local={...settings,complete:true,startAt:100,endAt:900,payments:[a,b],refunds:[]};
  const statement={...settings,...clone(local)};
  const first=reconciliationReport(local,statement,settings,1000);local.payments.reverse();statement.payments.reverse();
  assert.equal(first._id,reconciliationReport(local,statement,settings,1200)._id);
});
test('P07 lease expiry during transaction writes rolls back acknowledgement and claim',async()=>{
  for(const operation of ['claim','finish']){
    const s=setup(),a=await ensure(s);let job;
    if(operation==='finish')job=await s.service().claim(a.jobId,s.invocation);
    const before=clone(s.db);s.controls.advanceOnWrite=200;
    await rejects(()=>operation==='claim'?s.service().claim(a.jobId,s.invocation):
      s.service().acceptOutcome(s.proof({ticket:job.ticket,outcome:'RESOLVED'})),'STALE_MAINTENANCE_LEASE');
    assert.deepEqual(s.db,before);
  }
});
test('P07 run history and terminal job are atomic and carry a safe stable request reference',async()=>{
  for(const control of ['failAt','zeroAt'])for(let n=1;n<=2;n++){
    const s=setup(),a=await ensure(s),job=await s.service().claim(a.jobId,s.invocation),before=clone(s.db);s.controls[control]=n;
    await assert.rejects(()=>s.service().acceptOutcome(s.proof({ticket:job.ticket,outcome:'RESOLVED'})));assert.deepEqual(s.db,before);
    s.controls[control]=0;await s.service().acceptOutcome(s.proof({ticket:job.ticket,outcome:'RESOLVED'}));
    const run=Object.values(s.db.events).find(v=>v.recordType==='MAINTENANCE_RUN');
    assert.equal(run.outcome,'RESOLVED');assert.equal(run.requestId,run._id);assert.equal(run.leaseToken,undefined);
  }
});
