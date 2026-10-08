'use strict';
// A06 scoped internal read projection. No contact/address/provider credentials in DTOs.
const {parseApiRequest}=require('./api-contract');
const {requireOwner,requireStoreCapability}=require('./authorization-model');
const {requireCurrentOrderUser}=require('./order-transaction-service');
const {validateScopedAdminState}=require('./admin-access-state');
const {validateFinanceState,paymentFor,ledgerFor,refundDTO}=require('./merchant-resolution-model');
const {bindingOf}=require('./payment-recovery-model');
const {canonicalJSON,requestFingerprint}=require('./idempotency-model');
const {pageRequest,issueCursor,readCursor}=require('./pagination-model');
const fail=code=>{throw Object.assign(new Error(code),{code});};
const copy=value=>JSON.parse(canonicalJSON(value));
const text=value=>typeof value==='string'&&value.length>0&&value.length<=256&&value===value.trim()&&value.isWellFormed();
const counter=value=>Number.isSafeInteger(value)&&value>=0;
const time=value=>counter(value)&&value>0&&Number.isFinite(new Date(value).getTime());
const dense=value=>Array.isArray(value)&&Object.keys(value).length===value.length;
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
const gates={cloudVerified:false,callable:false,operationsAllowed:false};
function createMerchantFinanceReadService({context,key,runReadTransaction,now,loadPaymentConfiguration,redactReason}){
  context=copy(context);
  if(!text(context.environment)||!text(context.appId)||!['development','test','production'].includes(context.stage)||!key||!text(key.id)||
    !Buffer.isBuffer(key.secret)||key.secret.length<32||![runReadTransaction,now,loadPaymentConfiguration,redactReason].every(fn=>typeof fn==='function'))fail('INVALID_CONFIGURATION');
  key={id:key.id,secret:Buffer.from(key.secret)};
  const clock=()=>{const at=now();if(!time(at))fail('INVALID_CONFIGURATION');return at;};
  function paginate(source,payload,actor,principal,action,storeId,at){
    source.sort((a,b)=>b.createdAt-a.createdAt||(a._id>b._id?-1:a._id<b._id?1:0));
    const binding={environment:context.environment,actorScope:canonicalJSON([context.appId,principal.subjectId]),action:'admin.'+action,sortId:'CREATED_DESC',
      query:{storeId,status:payload.status??null,grant:actor.grant,revision:requestFingerprint(source)}};
    const page=pageRequest(Object.fromEntries(['pageSize','cursor'].filter(field=>Object.hasOwn(payload,field)).map(field=>[field,payload[field]]))),
      anchor=page.cursor===null?null:readCursor(page.cursor,binding,key,at),rows=source.filter(row=>!anchor||row.createdAt<anchor[0]||row.createdAt===anchor[0]&&row._id<anchor[1]),
      items=rows.slice(0,page.pageSize),hasMore=items.length<rows.length,last=items.at(-1);
    return {scope:'OFFLINE_MERCHANT_'+{ 'audit.list':'AUDIT_PAGE','refunds.list':'REFUND_PAGE','exceptions.list':'EXCEPTION_PAGE' }[action],items,hasMore,
      nextCursor:hasMore?issueCursor([last.createdAt,last._id],binding,key,at):null,...gates};
  }
  function audits(state,storeId,at){
    if(!state||state.environment!==context.environment||state.appId!==context.appId||state.complete!==true||state.storeId!==storeId||!dense(state.audits)||
      new Set(state.audits.map(row=>row?._id)).size!==state.audits.length)fail('INVALID_AUDIT_STATE');
    return state.audits.map(row=>{
      if(!row||!text(row._id)||row.environment!==context.environment||row.appId!==context.appId||row.schemaVersion!==1||row.version!==0||
        !time(row.createdAt)||row.createdAt>at||row.updatedAt!==row.createdAt||!text(row.action)||!text(row.requestId)||
        !dense(row.storeIds)||!row.storeIds.length||row.storeIds.some(id=>!text(id))||new Set(row.storeIds).size!==row.storeIds.length||!row.storeIds.includes(storeId)||
        (row.storeId!==null&&row.storeId!==storeId)||!row.actor||Object.keys(row.actor).sort().join(',')!=='service,subjectId,type'||
        (row.actor.type==='SYSTEM'?row.actor.subjectId!==null||!text(row.actor.service):!['STORE','CUSTOMER'].includes(row.actor.type)||!text(row.actor.subjectId)||row.actor.service!==null)||
        !row.target||Object.keys(row.target).sort().join(',')!=='afterVersion,beforeVersion,collection,entityId'||!text(row.target.collection)||!text(row.target.entityId)||
        (row.target.beforeVersion!==null&&!counter(row.target.beforeVersion))||!counter(row.target.afterVersion)||
        (row.outcome!==undefined&&!['SUCCEEDED','REJECTED','FAILED'].includes(row.outcome)))fail('INVALID_AUDIT_STATE');
      const reason=redactReason(row.reason,row.action);if(!text(reason))fail('REASON_POLICY_REQUIRED');
      // Multi-store audit returns only the requested store, never its other grant scopes or raw changes.
      return {_id:row._id,createdAt:row.createdAt,action:row.action,actor:copy(row.actor),storeId,target:copy(row.target),reason,
        requestId:row.requestId,outcome:row.outcome??null};
    });
  }
  return Object.freeze({async execute(event,principal){
    requireOwner(principal,{ownerId:principal?.subjectId});if(principal.environment!==context.environment||principal.appId!==context.appId)fail('FORBIDDEN');
    const {contract,payload}=parseApiRequest('admin',event),action=contract.action;if(!['refunds.list','refund.get','audit.list','exceptions.list'].includes(action))fail('INVALID_REQUEST');
    return runReadTransaction(async tx=>{
      if(!tx||['readUser','readAccessState','readRefundHeader','readOrder','readFinanceState','readScopedAudits','assertFinanceReads'].some(name=>typeof tx[name]!=='function'))fail('INVALID_READ_ADAPTER');
      const user=copy(await tx.readUser(principal.subjectId));requireCurrentOrderUser(user,principal);
      const access=copy(await tx.readAccessState()),start=clock();validateScopedAdminState(access,{...context,now:start});
      const header=action==='refund.get'?copy(await tx.readRefundHeader(payload.refundId)):null;
      if(action==='refund.get'&&(!header||header._id!==payload.refundId))fail('NOT_FOUND');
      const order=header?copy(await tx.readOrder(header.orderId)):null;if(header&&(!order||order._id!==header.orderId))fail('NOT_FOUND');
      const storeId=order?.storeId||payload.storeId;let actor;
      try{if(!access.stores.some(store=>store._id===storeId))fail('FORBIDDEN');actor=requireStoreCapability(principal,access.roles,storeId,[action==='audit.list'?'AUDIT_READ':'REFUND_APPROVE']);}
      catch(error){if(header&&error.code==='FORBIDDEN')fail('NOT_FOUND');throw error;}
      const state=copy(await (action==='audit.list'?tx.readScopedAudits(storeId):tx.readFinanceState(storeId))),at=clock();if(at<start)fail('INVALID_CONFIGURATION');
      let source,output;
      if(action==='audit.list')source=audits(state,storeId,at);
      else{
        validateFinanceState(state,storeId,{...context,now:at});
        if(header&&(!state.refunds.some(row=>canonicalJSON(row)===canonicalJSON(header))||!state.orders.some(row=>canonicalJSON(row)===canonicalJSON(order))))fail('VERSION_CONFLICT');
        for(const parent of state.orders){
          const refunds=state.refunds.filter(row=>row.orderId===parent._id),payments=state.payments.filter(row=>row.orderId===parent._id),payment=payments.find(row=>row.status==='PAID'&&row.accountingState==='APPLIED');
          if(!refunds.length){if(parent.refundStatus!=='NONE'||parent.refundedCents!==0||parent.refundReservedCents!==0)fail('INVALID_REFUND_BUDGET');continue;}
          const local={...state,refunds,payments,logs:state.logs.filter(row=>row.orderId===parent._id)},
            configuration=await loadPaymentConfiguration(tx,bindingOf(paymentFor(parent,local,{...context,now:at})),at);
          for(const refund of refunds)ledgerFor(parent,local,refund,configuration,{...context,now:at});
        }
        const refundView=row=>refundDTO(row,state.orders.find(order=>order._id===row.orderId),state.attempts.filter(attempt=>attempt.refundId===row._id).sort((a,b)=>a.sequence-b.sequence));
        if(action==='refund.get')output={scope:'OFFLINE_MERCHANT_REFUND_DETAIL',...refundView(header),...gates};
        else if(action==='refunds.list')source=state.refunds.filter(row=>payload.status===undefined||row.status===payload.status).map(refundView);
        else source=state.jobs.filter(job=>job.status!=='DONE').map(job=>({_id:job._id,createdAt:job.createdAt,updatedAt:job.updatedAt,version:job.version,
          kind:job.kind,entityId:job.entityId,entityVersion:job.entityVersion,status:job.status,attemptCount:job.attemptCount,nextRunAt:job.nextRunAt,
          leaseExpired:job.status==='RUNNING'&&job.leaseUntil<=at,lastOutcome:job.lastOutcome,
          action:job.kind==='REFUND_QUERY'?'admin.refund.retry':null,enabled:false,requiresServerRecovery:job.kind!=='REFUND_QUERY'}));
      }
      if(!output)output=paginate(source,payload,actor,principal,action,storeId,at);
      if(await tx.assertFinanceReads(freeze(copy({environment:context.environment,appId:context.appId,user,access,grant:actor.grant,state,header,order})))!==true)fail('VERSION_CONFLICT');
      if(clock()<at)fail('INVALID_CONFIGURATION');return freeze(output);
    });
  }});
}
module.exports={createMerchantFinanceReadService};
