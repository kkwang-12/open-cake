'use strict';
// Test collection routing only. The shared order SDK service is used unchanged.
const {createHash}=require('node:crypto');
const {identityFromPlatform}=require('./shared/authorization-model');
const {canonicalJSON}=require('./shared/idempotency-model');
const {createSdkOrderService}=require('./shared/order-sdk-session');
const {fixture}=require('./order-sdk-fixture');
const COLLECTION='jjl_d04_probe_records',SCOPE='ORDER_SDK_LAB',REVISION='order-sdk-lab-1';
const cases=Object.freeze({'pickup':'PICKUP','delivery':'DELIVERY','rollback-first':'PICKUP','rollback-last':'PICKUP'});
const limits=Object.freeze({maxOperations:100,maxReadDocuments:40,maxWrites:40,maxPayloadBytes:65536,
  maxTotalPayloadBytes:1048576,maxAttempts:3,maxDurationMs:15000});
const hash=v=>createHash('sha256').update(canonicalJSON(v)).digest('hex');
const fail=code=>{throw Object.assign(new Error(code),{code});};
function createLab({cloud,settings,now=Date.now}){
  const physical=(caseId,collection,id)=>hash([SCOPE,settings.runId,caseId,collection,id]);
  function envelope(caseId,collection,record){return {_id:physical(caseId,collection,record._id),scope:SCOPE,
    runId:settings.runId,caseId,logicalCollection:collection,logicalId:record._id,record};}
  function unwrap(value,caseId,collection,id){
    if(value===null)return null;
    if(!value||value._id!==physical(caseId,collection,id)||value.scope!==SCOPE||value.runId!==settings.runId||
      value.caseId!==caseId||value.logicalCollection!==collection||value.logicalId!==id||value.record?._id!==id)fail('LAB_SCOPE_MISMATCH');
    return value.record;
  }
  function database(){return cloud.database({env:settings.environment,throwOnNotFound:false});}
  async function read(reader,caseId,collection,id){
    const response=await reader.collection(COLLECTION).doc(physical(caseId,collection,id)).get();
    return unwrap(response.data,caseId,collection,id);
  }
  function mappedCloud(caseId,metrics,faultAt){return {database:()=>({runTransaction:(work,retries)=>database().runTransaction(async tx=>{
    metrics.attempts++;let writes=0;
    const write=async invoke=>{metrics.writes++;writes++;const result=await invoke();
      if(writes===faultAt){metrics.faultTriggered=true;fail('LAB_INJECTED_ROLLBACK');}return result;};
    return work({collection:collection=>({doc:id=>({get:async()=>{metrics.reads++;return {data:await read(tx,caseId,collection,id)};},
      update:({data})=>write(()=>tx.collection(COLLECTION).doc(physical(caseId,collection,id)).update({data:
        Object.fromEntries(Object.entries(data).map(([key,value])=>['record.'+key,value]))}))}),
      add:({data})=>write(async()=>{const response=await tx.collection(COLLECTION).add({data:envelope(caseId,collection,data)});
        return {_id:response._id===physical(caseId,collection,data._id)?data._id:null};})})});
  },retries)})};}
  async function execute(input,native){
    const identity=identityFromPlatform(native,settings),at=now();
    if(settings.stage!=='test'||settings.environment!=='dinner-cook-test-d5e320u981ec341'||
      settings.appId!=='wx154f791a17268ace'||!/^order-sdk-[a-z0-9-]{1,48}$/.test(settings.runId||'')||
      identity._id!==settings.allowedUserId||!Number.isSafeInteger(settings.expiresAt)||
      settings.expiresAt<=at||settings.expiresAt>at+90*60000)fail('LAB_NOT_AUTHORIZED');
    if(!input||Object.keys(input).sort().join(',')!=='caseId,operation'||!Object.hasOwn(cases,input.caseId)||
      !['prepare','execute','audit'].includes(input.operation))fail('INVALID_LAB_REQUEST');
    const {caseId,operation}=input,mode=cases[caseId],db=database();
    const isRollback=caseId.startsWith('rollback-');
    if(operation==='prepare')return db.runTransaction(async tx=>{
      const old=await read(tx,caseId,'manifest','manifest');
      if(old)return {revision:REVISION,caseId,state:'ALREADY_PREPARED',seedCount:old.seedCount};
      const f=fixture(native,settings,mode,at),rows=Object.entries(f.records).flatMap(([collection,values])=>values.map(record=>({collection,record})));
      for(const row of rows)if(await read(tx,caseId,row.collection,row.record._id)!==null)fail('LAB_RUN_NOT_FRESH');
      for(const row of rows)await tx.collection(COLLECTION).add({data:envelope(caseId,row.collection,row.record)});
      await tx.collection(COLLECTION).add({data:envelope(caseId,'manifest',{_id:'manifest',seededAt:at,ownerId:identity._id,
        claims:0,seedCount:rows.length,seedHash:hash(f.records),event:f.event})});
      return {revision:REVISION,caseId,state:'PREPARED',seedCount:rows.length};
    },0);
    const manifest=await read(db,caseId,'manifest','manifest');
    if(!manifest||manifest.ownerId!==identity._id)fail('LAB_NOT_PREPARED');
    const f=fixture(native,settings,mode,manifest.seededAt);
    if(hash(f.records)!==manifest.seedHash||hash(f.event)!==hash(manifest.event))fail('LAB_FIXTURE_CHANGED');
    if(operation==='execute'){
      await db.runTransaction(async tx=>{
        const current=await read(tx,caseId,'manifest','manifest');
        if(current.claims>=(isRollback?1:2))fail('LAB_EXECUTION_BUDGET_EXHAUSTED');
        const response=await tx.collection(COLLECTION).doc(physical(caseId,'manifest','manifest')).update({data:{'record.claims':current.claims+1}});
        if(response.stats?.updated!==1)fail('LAB_CLAIM_FAILED');
      },0);
      const metrics={attempts:0,reads:0,writes:0},faultAt=caseId==='rollback-first'?1:caseId==='rollback-last'?18:0;
      const service=createSdkOrderService({cloud:mappedCloud(caseId,metrics,faultAt),settings,limits,now,
        newRequestId:()=>hash([settings.runId,caseId,now()]),buildContext:async()=>f.context});
      try{
        const result=await service.execute(manifest.event,native);
        if(isRollback)fail('LAB_ROLLBACK_NOT_TRIGGERED');
        return {revision:REVISION,caseId,scope:SCOPE,businessOrderCreated:false,testOrderCreated:true,
          disposition:result.disposition,orderId:result.result.entityId,metrics};
      }catch(error){
        // Fault is thrown after an actual SDK write. Provider wraps it; record
        // the bounded counters and require an exact unchanged audit separately.
        if(!isRollback||!metrics.faultTriggered)throw error;
        return {revision:REVISION,caseId,state:'ROLLBACK_CANDIDATE',metrics};
      }
    }
    const response=await db.collection(COLLECTION).where({scope:SCOPE,runId:settings.runId,caseId}).limit(25).get();
    if(!Array.isArray(response.data)||response.data.length>=25)fail('LAB_AUDIT_OVERFLOW');
    const records={};
    for(const value of response.data){const record=unwrap(value,caseId,value.logicalCollection,value.logicalId);
      if(value.logicalCollection==='manifest')continue;
      (records[value.logicalCollection]??=[]).push(record);}
    const count=name=>records[name]?.length||0;
    if(!Number.isInteger(manifest.claims)||manifest.claims<1)fail('LAB_NOT_EXECUTED');
    if(isRollback){if(hash(records)!==hash(f.records)){
      // Query order is not a serialization guarantee; compare sorted records.
      const sorted=data=>Object.fromEntries(Object.entries(data).map(([name,rows])=>[name,[...rows].sort((a,b)=>a._id.localeCompare(b._id))]));
      if(hash(sorted(records))!==hash(sorted(f.records)))fail('LAB_ROLLBACK_AUDIT_FAILED');
    }}else{
      if(count('orders')!==1||count('order_items')!==1||count('reservations')!==2||count('order_logs')!==1||count('idempotency_records')!==1||
        records.checkout_quotes?.[0]?.status!=='CONSUMED'||records.inventory_resources?.[0]?.heldUnits!==1||records.slot_inventory?.[0]?.heldUnits!==1)
        fail('LAB_ORDER_AUDIT_FAILED');
      for(const name of ['users','stores','store_config','carts','products','skus','addresses']){
        for(const initial of f.records[name]||[]){
          const current=records[name]?.find(value=>value._id===initial._id);
          if(!current)fail('LAB_DEPENDENCY_AUDIT_FAILED');
          const {_transactionFence,...business}=current;
          if(!Number.isSafeInteger(_transactionFence)||_transactionFence<1||hash(business)!==hash(initial))fail('LAB_DEPENDENCY_AUDIT_FAILED');
        }
      }
      const order=records.orders[0];
      if(order.ownerId!==identity._id||order.orderNo!=='V1-'+order._id.toUpperCase()||
        records.reservations.some(value=>value.orderId!==order._id)||records.order_items[0].orderId!==order._id||
        records.order_logs[0].orderId!==order._id||records.checkout_quotes[0].consumedOrderId!==order._id)
        fail('LAB_ORDER_AUDIT_FAILED');
    }
    return {revision:REVISION,scope:SCOPE,caseId,state:'AUDIT_PASSED',claims:manifest.claims,
      documentCount:response.data.length,counts:Object.fromEntries(Object.entries(records).map(([name,rows])=>[name,rows.length]))};
  }
  return {execute};
}
module.exports={createLab,REVISION,COLLECTION,cases};
