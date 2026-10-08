'use strict';
// Isolated SDK capability experiments only. Not an order creation service.
const {createCloudDocumentTransactionAdapter}=require('./cloud-document-transaction');
const {identityFromPlatform}=require('./authorization-model');
const {scopedDocumentId,requestFingerprint}=require('./idempotency-model');
const {planResourceHolds}=require('./resource-model');
const COLLECTIONS=Object.freeze({resources:'jjl_d04_probe_resources',records:'jjl_d04_probe_records',receipts:'jjl_d04_probe_receipts'});
const CASES=Object.freeze(['atomic','same-key','stock-last','slot-last','mode-independent','unique',
  ...Array.from({length:7},(_,i)=>'fault-'+(i+1))]);
class TransactionProbeError extends Error {
  constructor(code){super(code);this.name='TransactionProbeError';this.code=code;}
}
const fail=code=>{throw new TransactionProbeError(code);};
const plain=value=>value!==null && typeof value==='object' && [Object.prototype,null].includes(Object.getPrototypeOf(value));
function createTransactionProbe({cloud,settings,now=Date.now}) {
  if(!plain(settings) || typeof now!=='function')fail('INVALID_PROBE_CONFIGURATION');
  // Detach configuration; all gates are rechecked per invocation, not just at load.
  const config=Object.freeze({...settings});
  function authorize(context,identify=false) {
    const time=now();
    if(config.stage!=='test' || !config.testEnvironment || config.environment!==config.testEnvironment ||
      !config.developmentEnvironment || config.environment===config.developmentEnvironment ||
      !/^[A-Za-z0-9_-]{16,48}$/.test(config.runId || '') ||
      (!identify && !/^[a-f0-9]{64}$/.test(config.allowedUserId || '')) ||
      !Number.isSafeInteger(time) || time<=0 || !Number.isSafeInteger(config.expiresAt) || config.expiresAt<=time)
      fail('PROBE_NOT_AUTHORIZED');
    const identity=identityFromPlatform(context,config);
    if(!identify && identity._id!==config.allowedUserId)fail('PROBE_NOT_AUTHORIZED');
    return {ownerId:identity._id,time};
  }
  function parse(payload) {
    if(!plain(payload) || Object.keys(payload).some(key=>!['operation','caseId','command','mode'].includes(key)) ||
      !['identify','prepare','hold','read','unique'].includes(payload.operation) || !CASES.includes(payload.caseId))fail('INVALID_PROBE_REQUEST');
    const command=payload.command===undefined?0:payload.command,mode=payload.mode===undefined?'PICKUP':payload.mode;
    if(!Number.isInteger(command) || command<0 || command>7 || !['PICKUP','DELIVERY'].includes(mode) ||
      (payload.operation==='prepare' && (command!==0 || mode!=='PICKUP')) ||
      (payload.operation==='identify' && (payload.caseId!=='atomic' || command!==0 || mode!=='PICKUP')) ||
      (payload.operation==='unique' && (payload.caseId!=='unique' || command>1)) ||
      (payload.operation==='hold' && payload.caseId==='unique'))fail('INVALID_PROBE_REQUEST');
    return {operation:payload.operation,caseId:payload.caseId,command,mode};
  }
  function id(caseId,kind,command='shared') {
    return scopedDocumentId('d04-sdk-probe',[config.environment,config.runId,caseId,kind,String(command)]);
  }
  function base(caseId,ownerId,time) {
    return {schemaVersion:1,version:0,scope:'SDK_CAPABILITY_PROBE',runId:config.runId,
      caseId,ownerId,createdAt:time,updatedAt:time};
  }
  function check(record,caseId,ownerId) {
    if(!record || record.scope!=='SDK_CAPABILITY_PROBE' || record.runId!==config.runId ||
      record.caseId!==caseId || record.ownerId!==ownerId || record.schemaVersion!==1)fail('PROBE_STATE_INVALID');
    return record;
  }
  function adapter() {
    return createCloudDocumentTransactionAdapter({cloud,environment:config.environment,collections:{
      [COLLECTIONS.resources]:['heldUnits','confirmedUnits','consumedUnits','updatedAt'],
      [COLLECTIONS.records]:[],[COLLECTIONS.receipts]:[]}});
  }
  return Object.freeze({async execute(payload,context) {
    const input=parse(payload),{ownerId,time}=authorize(context,input.operation==='identify');
    const {operation,caseId,command,mode}=input;
    // Read-only native owner discovery for an operator to configure the allowlist.
    // It never binds the first visitor or permits a write without that allowlist.
    if(operation==='identify')return {scope:'SDK_CAPABILITY_PROBE',businessOrderCreated:false,
      runId:config.runId,caseId,command,mode,subjectId:ownerId,disposition:'IDENTIFIED'};
    const common=base(caseId,ownerId,time),storeId=id(caseId,'store');
    const resourceIds=[id(caseId,'STOCK'),id(caseId,'PICKUP'),id(caseId,'DELIVERY')];
    const operationId=id(caseId,'operation',command),logId=id(caseId,'log',command),receiptId=id(caseId,'receipt',command);
    const reservationIds=['STOCK','SLOT'].map(kind=>scopedDocumentId('reservation',[
      config.environment,operationId,kind,kind==='STOCK'?resourceIds[0]:resourceIds[mode==='PICKUP'?1:2]]));
    const fingerprint=requestFingerprint({caseId,command,mode});
    const run=adapter();
    const result=await run.runTransaction(async tx=>{
      // Retries/queueing must not continue a write experiment past its authorization.
      authorize(context);
      if(operation==='prepare') {
        const definitions=[{type:'STOCK',totalUnits:caseId==='stock-last'?1:20},
          {type:'PICKUP',capacityTotal:caseId==='slot-last'?1:3},{type:'DELIVERY',capacityTotal:1}];
        let created=0;
        for(let i=0;i<3;i++) {
          const existing=await tx.read(COLLECTIONS.resources,resourceIds[i]);
          const definition=definitions[i];
          if(existing) {
            check(existing,caseId,ownerId);
            if(existing.type!==definition.type || existing.storeId!==storeId ||
              existing.totalUnits!==definition.totalUnits || existing.capacityTotal!==definition.capacityTotal)
              fail('PROBE_STATE_INVALID');
          }else {
            await tx.insert(COLLECTIONS.resources,{...common,_id:resourceIds[i],storeId,status:'OPEN',
              heldUnits:0,confirmedUnits:0,consumedUnits:0,...definition});created++;
          }
        }
        return {disposition:'PREPARED',created};
      }
      if(operation==='read') {
        const list=[...resourceIds.map(_id=>({collection:COLLECTIONS.resources,_id})),
          {collection:COLLECTIONS.records,_id:operationId},{collection:COLLECTIONS.records,_id:logId},
          ...reservationIds.map(_id=>({collection:COLLECTIONS.records,_id})),
          {collection:COLLECTIONS.receipts,_id:receiptId}];
        const documents=[];
        for(const item of list) {
          const record=await tx.read(item.collection,item._id);
          if(record)check(record,caseId,ownerId);
          documents.push({...item,exists:!!record,version:record?record.version:null,
            type:record?record.type:null,heldUnits:record && record.heldUnits!==undefined?record.heldUnits:null});
        }
        return {disposition:'READ',documents};
      }
      if(operation==='unique') {
        // Two explicit document IDs share the same logical unique tuple. The
        // actual unique index must reject the second; no mock success detector.
        await tx.insert(COLLECTIONS.receipts,{...common,_id:receiptId,type:'UNIQUE_PROBE',
          commandKey:'same-logical-key',requestFingerprint:fingerprint});
        return {disposition:'INSERTED_UNIQUE_PROBE'};
      }
      const receipt=await tx.read(COLLECTIONS.receipts,receiptId);
      if(receipt) {
        check(receipt,caseId,ownerId);
        if(receipt.type!=='RECEIPT' || receipt.commandKey!=='command-'+command ||
          receipt.operationId!==operationId || receipt.requestFingerprint!==fingerprint)fail('IDEMPOTENCY_KEY_REUSED');
        return {disposition:'REPLAY'};
      }
      const stock=check(await tx.read(COLLECTIONS.resources,resourceIds[0]),caseId,ownerId);
      const slot=check(await tx.read(COLLECTIONS.resources,resourceIds[mode==='PICKUP'?1:2]),caseId,ownerId);
      if(stock.type!=='STOCK' || slot.type!==mode)fail('PROBE_STATE_INVALID');
      const holds=planResourceHolds({_id:operationId,storeId,paymentDeadlineAt:config.expiresAt},[
        {resourceKind:'STOCK',resourceId:stock._id,expectedVersion:stock.version,quantity:1},
        {resourceKind:'SLOT',resourceId:slot._id,expectedVersion:slot.version,quantity:1}
      ],[{resourceKind:'STOCK',resource:stock},{resourceKind:'SLOT',resource:slot}],{environment:config.environment,now:time});
      const faultAt=caseId.startsWith('fault-')?Number(caseId.slice(6)):0;
      let writes=0;
      function afterWrite(){if(++writes===faultAt)fail('PROBE_INJECTED_FAILURE');}
      for(const change of holds.resourceChanges) {
        await tx.updateVersioned(COLLECTIONS.resources,change.resourceId,change.expectedVersion,
          {heldUnits:change.heldUnits,confirmedUnits:change.confirmedUnits,consumedUnits:change.consumedUnits,updatedAt:time});afterWrite();
      }
      for(const reservation of holds.reservations) {
        await tx.insert(COLLECTIONS.records,{...reservation,...common,type:'RESERVATION'});afterWrite();
      }
      await tx.insert(COLLECTIONS.records,{...common,_id:operationId,type:'OPERATION',mode});afterWrite();
      await tx.insert(COLLECTIONS.records,{...common,_id:logId,type:'LOG',operationId});afterWrite();
      await tx.insert(COLLECTIONS.receipts,{...common,_id:receiptId,type:'RECEIPT',operationId,
        commandKey:'command-'+command,requestFingerprint:fingerprint});afterWrite();
      return {disposition:'HELD',writes};
    });
    return {scope:'SDK_CAPABILITY_PROBE',businessOrderCreated:false,runId:config.runId,caseId,command,mode,...result};
  }});
}
module.exports={createTransactionProbe,TransactionProbeError,COLLECTIONS,CASES};
