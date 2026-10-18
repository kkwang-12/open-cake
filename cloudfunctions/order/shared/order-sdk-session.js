'use strict';
// Concrete wx-server-sdk provider. No callable handler or client-controlled policy.
const {createCloudDocumentTransactionAdapter}=require('./cloud-document-transaction');
const {createOrderDocumentSession,COLLECTIONS}=require('./order-document-session');
const {createOrderTransactionService}=require('./order-transaction-service');
const {identityFromPlatform,resolveCustomer,requireOwner}=require('./authorization-model');
const {canonicalJSON}=require('./idempotency-model');
const copy=v=>JSON.parse(canonicalJSON(v));
const counter=v=>Number.isSafeInteger(v)&&v>=0;
const fail=code=>{throw Object.assign(new Error(code),{code});};
const byteSize=value=>Buffer.byteLength(canonicalJSON(value),'utf8');
const key=(collection,id)=>JSON.stringify([collection,id]);
const contextCollections=['media_assets','location_verifications'];
const limitFields=['maxOperations','maxReadDocuments','maxWrites','maxPayloadBytes',
  'maxTotalPayloadBytes','maxAttempts','maxDurationMs'];
function validateLimits(limits){
  if(!limits||Object.keys(limits).sort().join(',')!==[...limitFields].sort().join(',')||
    limitFields.some(k=>!Number.isSafeInteger(limits[k])||limits[k]<1)||limits.maxOperations>100||
    limits.maxReadDocuments>limits.maxOperations||limits.maxWrites>limits.maxOperations||
    limits.maxAttempts>3||limits.maxDurationMs>25000||limits.maxPayloadBytes>limits.maxTotalPayloadBytes||
    !Number.isSafeInteger(limits.maxTotalPayloadBytes*limits.maxAttempts))
    fail('INVALID_ORDER_SDK_LIMITS');
  return Object.freeze({...limits});
}
function orderDocumentIdFromNumber(number){
  if(typeof number!=='string'||!/^V1-[0-9A-F]{64}$/.test(number))fail('INVALID_ORDER_DOCUMENT');
  return number.slice(3).toLowerCase();
}
function createSdkOrderService({cloud,settings,limits,buildContext,now=Date.now,
  clock=Date.now,newRequestId}){
  const policy=validateLimits(limits);
  if(![buildContext,now,clock,newRequestId].every(v=>typeof v==='function'))fail('INVALID_ORDER_SDK_CONFIGURATION');
  const scope=Object.freeze({...settings});
  // Validate the fixed environment before any database call.
  identityFromPlatform({APPID:scope.appId,ENV:scope.environment,OPENID:'configuration-check'},scope);
  const collections=Object.fromEntries([...Object.values(COLLECTIONS),...contextCollections].map(name=>[name,[]]));
  collections.inventory_resources=collections.slot_inventory=['heldUnits','confirmedUnits','consumedUnits','updatedAt'];
  collections.checkout_quotes=['status','consumedOrderId','updatedAt'];
  const adapter=createCloudDocumentTransactionAdapter({cloud,environment:scope.environment,collections,
    maxRetries:policy.maxAttempts-1});
  return Object.freeze({async execute(event,nativeContext){
    const identity=identityFromPlatform(nativeContext,scope),started=clock();
    let attempt=0,totalOperations=0,totalBytes=0;
    return adapter.runTransaction(async raw=>{
      if(++attempt>policy.maxAttempts)fail('ORDER_SDK_BUDGET_EXCEEDED');
      const cache=new Map(),requiredCreates=new Set();
      let reads=0,writes=0,payloadBytes=0,admitted=false;
      function checkTime(){
        const at=clock();
        if(!counter(started)||!counter(at)||at<started||at-started>=policy.maxDurationMs)
          fail('ORDER_SDK_TIME_EXCEEDED');
      }
      function checkBudget(nextReads,nextWrites,nextBytes,largest=0){
        checkTime();
        if(nextReads>policy.maxReadDocuments||nextWrites>policy.maxWrites||
          nextReads+nextWrites>policy.maxOperations||nextBytes>policy.maxTotalPayloadBytes||
          largest>policy.maxPayloadBytes||totalOperations>policy.maxOperations*policy.maxAttempts||
          totalBytes>policy.maxTotalPayloadBytes*policy.maxAttempts)fail('ORDER_SDK_BUDGET_EXCEEDED');
      }
      async function read(collection,id){
        const cacheKey=key(collection,id);
        if(cache.has(cacheKey))return copy(cache.get(cacheKey));
        checkBudget(reads+1,writes,payloadBytes);
        reads++;totalOperations++;
        const record=await raw.read(collection,id),bytes=byteSize(record);
        // Formal handlers bind a single store, including original-key order replays.
        if(scope.storeId&&record&&['checkout_quotes','orders'].includes(collection)&&record.storeId!==scope.storeId)fail('NOT_FOUND');
        payloadBytes+=bytes;totalBytes+=bytes;
        checkBudget(reads,writes,payloadBytes,bytes);
        cache.set(cacheKey,copy(record));return copy(record);
      }
      async function write(collection,id,payload,invoke){
        if(!admitted)fail('ORDER_SDK_WRITE_NOT_ADMITTED');
        const bytes=byteSize(payload);
        checkBudget(reads,writes+1,payloadBytes+bytes,bytes);
        writes++;totalOperations++;payloadBytes+=bytes;totalBytes+=bytes;
        const result=await invoke();
        if(result!==1)fail('VERSION_CONFLICT');
        return result;
      }
      const documents={read,
        async insert(collection,record){
          if(Object.hasOwn(record,'_transactionFence'))fail('INVALID_TRANSACTION_FENCE');
          const result=await write(collection,record._id,record,()=>raw.insertNew(collection,record));
          cache.set(key(collection,record._id),copy(record));requiredCreates.delete(key(collection,record._id));
          return result;
        },
        async updateVersioned(collection,id,version,patch){
          if(!cache.get(key(collection,id)))fail('INVALID_ORDER_DOCUMENT');
          const result=await write(collection,id,{...patch,version:version+1},()=>raw.updateVersioned(collection,id,version,patch));
          cache.set(key(collection,id),{...cache.get(key(collection,id)),...copy(patch),version:version+1});
          return result;
        }
      };
      const user=await read('users',identity._id);
      const principal=resolveCustomer(nativeContext,scope,user);
      async function findOrderByNumber(number){
        const id=orderDocumentIdFromNumber(number),record=await read('orders',id);
        if(record!==null){
          if(record._id!==id||record.orderNo!==number)fail('INVALID_ORDER_DOCUMENT');
          requireOwner(principal,record);
        }
        return record;
      }
      async function protectReads(snapshots,conditions,predicates){
        if(admitted||conditions.userId!==principal.subjectId||conditions.userVersion!==user.version)
          fail('INVALID_ORDER_SDK_PROTECTION');
        // Include context proof/media reads as well as the domain session's reads.
        for(const entry of snapshots){
          if(canonicalJSON(cache.get(key(entry.collection,entry.id)))!==canonicalJSON(entry.record))
            fail('INVALID_ORDER_SDK_PROTECTION');
        }
        const creation=conditions.orderIdMustBeAbsent===true;
        if(creation){
          if(!/^[a-f0-9]{64}$/.test(conditions.orderId||'')||
            typeof conditions.receiptId!=='string'||conditions.orderNoMustBeAbsent!==true||
            conditions.requiresUniqueOrderNoIndex!==true||predicates.length!==1)
            fail('INVALID_ORDER_SDK_PROTECTION');
          const predicate=predicates[0];
          if(predicate.collection!=='orders'||predicate.field!=='orderNo'||
            predicate.value!=='V1-'+conditions.orderId.toUpperCase()||predicate.record!==null)
            fail('INVALID_ORDER_SDK_PROTECTION');
        }else if(predicates.length)fail('INVALID_ORDER_SDK_PROTECTION');
        const protection=[];
        for(const [cacheKey,record] of [...cache].sort(([a],[b])=>a<b?-1:a>b?1:0)){
          const [collection,id]=JSON.parse(cacheKey);
          if(record===null){
            if(!creation||!((collection==='orders'&&id===conditions.orderId)||
              (collection==='idempotency_records'&&id===conditions.receiptId)))fail('INVALID_ORDER_SDK_PROTECTION');
            requiredCreates.add(cacheKey);continue;
          }
          const fence=Object.hasOwn(record,'_transactionFence')?record._transactionFence:0;
          if(!counter(fence)||!counter(fence+1))fail('INVALID_TRANSACTION_FENCE');
          protection.push({collection,id,record,fence,bytes:byteSize({_transactionFence:fence+1})});
        }
        if(creation&&(!requiredCreates.has(key('orders',conditions.orderId))||
          !requiredCreates.has(key('idempotency_records',conditions.receiptId))))fail('INVALID_ORDER_SDK_PROTECTION');
        const business=creation?conditions.businessWriteBudget:{businessWrites:0,totalPayloadBytes:0,largestPayloadBytes:0};
        if(!business||['businessWrites','totalPayloadBytes','largestPayloadBytes'].some(k=>!counter(business[k])))
          fail('INVALID_ORDER_SDK_PROTECTION');
        const fenceBytes=protection.reduce((sum,row)=>sum+row.bytes,0);
        // All creation inserts use explicit add, so there are no hidden pre-get operations.
        checkBudget(reads,writes+protection.length+business.businessWrites,
          payloadBytes+fenceBytes+business.totalPayloadBytes,
          Math.max(business.largestPayloadBytes,...protection.map(row=>row.bytes)));
        admitted=true;
        for(const row of protection){
          await write(row.collection,row.id,{_transactionFence:row.fence+1},
            ()=>raw.protectExisting(row.collection,row.id,row.fence));
          cache.set(key(row.collection,row.id),{...row.record,_transactionFence:row.fence+1});
        }
        return true;
      }
      const domain=createOrderDocumentSession({documents,principal,protectReads,findOrderByNumber,
        maxReadDocuments:policy.maxReadDocuments});
      const tx=Object.freeze({...domain,readContextDocument:(collection,id)=>{
        if(!contextCollections.includes(collection))fail('INVALID_ORDER_DOCUMENT');
        return read(collection,id);
      }});
      const service=createOrderTransactionService({runTransaction:work=>work(tx),now,
        buildContext,newRequestId,transactionLimits:{maxWrites:policy.maxWrites,
          maxPayloadBytes:policy.maxPayloadBytes,maxTotalPayloadBytes:policy.maxTotalPayloadBytes}});
      const result=await service.execute(event,principal);
      if(requiredCreates.size)fail('INVALID_ORDER_SDK_PROTECTION');
      checkBudget(reads,writes,payloadBytes);
      // Resolve to the caller only after the outer SDK transaction has committed.
      return result;
    });
  }});
}
module.exports={createSdkOrderService,orderDocumentIdFromNumber};
