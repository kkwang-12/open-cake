'use strict';
// A05 internal offline executor; injected trusted transaction/proof adapters, no callable admin endpoint.
const {parseApiRequest}=require('./api-contract');
const {requireOwner,requireStoreCapability}=require('./authorization-model');
const {requireCurrentOrderUser}=require('./order-transaction-service');
const {validateScopedAdminState}=require('./admin-access-state');
const {validateStoreState,validatePublication,draftOf,planStoreUpdate,planConfigSave,planConfigPublish,planSlotUpdate,storeDTO,configDTO,slotDTO}=require('./merchant-store-model');
const {canonicalJSON,requestFingerprint,scopedDocumentId,idempotencyId,decideIdempotency}=require('./idempotency-model');
const {pageRequest,issueCursor,readCursor}=require('./pagination-model');
const fail=code=>{throw Object.assign(new Error(code),{code});};
const copy=value=>JSON.parse(canonicalJSON(value));
const text=value=>typeof value==='string'&&value.length>0&&value.length<=256&&value===value.trim()&&value.isWellFormed();
const counter=value=>Number.isSafeInteger(value)&&value>=0;
const time=value=>counter(value)&&value>0&&Number.isFinite(new Date(value).getTime());
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
const gates={cloudVerified:false,callable:false,operationsAllowed:false};
const actions=['store.update','config.save','config.publish','slot.update','store.get','config.get','configs.list','slots.list'];
const entity=(state,collection,id)=>collection==='stores'?state.store:state[collection==='store_config'?'configs':'slots'].find(record=>record._id===id);
const view=(collection,record)=>collection==='stores'?storeDTO(record):collection==='store_config'?configDTO(record):slotDTO(record);
function futureState(state,plan){return {...state,store:plan.collection==='stores'?plan.after:plan.storeWrite?.after||state.store,
  configs:plan.collection==='store_config'?[...state.configs.filter(config=>config._id!==plan.after._id),plan.after]:state.configs,
  slots:state.slots.map(slot=>plan.collection==='slot_inventory'&&slot._id===plan.after._id?plan.after:plan.slotWrites.find(write=>write.after._id===slot._id)?.after||slot)};}
function createMerchantStoreService({context,key,runTransaction,now,newRequestId,redactReason}){
  context=copy(context);
  if(!text(context.environment)||!text(context.appId)||!['development','test','production'].includes(context.stage)||!key||!text(key.id)||
    !Buffer.isBuffer(key.secret)||key.secret.length<32||![runTransaction,now,newRequestId,redactReason].every(fn=>typeof fn==='function'))fail('INVALID_CONFIGURATION');
  key={id:key.id,secret:Buffer.from(key.secret)};
  const clock=()=>{const at=now();if(!time(at))fail('INVALID_CONFIGURATION');return at;};
  const checked=async effect=>{if(await effect!==1)fail('VERSION_CONFLICT');};
  function page(payload,state,actor,principal,at){
    const source=state.configs.map(configDTO).sort((a,b)=>b.createdAt-a.createdAt||(a._id>b._id?-1:a._id<b._id?1:0));
    const binding={environment:context.environment,actorScope:canonicalJSON([context.appId,principal.subjectId]),action:'admin.configs.list',sortId:'CREATED_DESC',
      query:{storeId:state.storeId,grant:actor.grant,revision:requestFingerprint(source)}};
    const input=pageRequest(Object.fromEntries(['cursor','pageSize'].filter(field=>Object.hasOwn(payload,field)).map(field=>[field,payload[field]])));
    const anchor=input.cursor===null?null:readCursor(input.cursor,binding,key,at);
    const rows=source.filter(row=>!anchor||row.createdAt<anchor[0]||row.createdAt===anchor[0]&&row._id<anchor[1]);
    const items=rows.slice(0,input.pageSize),hasMore=items.length<rows.length,last=items.at(-1);
    return {scope:'OFFLINE_MERCHANT_CONFIG_PAGE',items,hasMore,nextCursor:hasMore?issueCursor([last.createdAt,last._id],binding,key,at):null,...gates};
  }
  function replay(record,decision,audit,request,collection,current,state,actor,at,payload){
    const result=decision.result,expectedId=payload.slotId||payload.configId||
      (request.command==='admin.config.save'?scopedDocumentId('merchant-config',[context.environment,context.appId,state.storeId,record._id]):payload.storeId),
      version=payload.expectedVersion===undefined?0:payload.expectedVersion+1;
    if(record.environment!==context.environment||record.schemaVersion!==1||record.version!==0||record.status!=='SUCCEEDED'||
      !time(record.createdAt)||record.createdAt>at||record.updatedAt!==record.createdAt||record.leaseUntil!==null||record.retentionUntil!==null||
      result.errorCode!==null||!current||result.entityId!==expectedId||current._id!==expectedId||!counter(version)||result.version!==version||current.version<version||
      !audit||audit._id!==scopedDocumentId('merchant-store-audit',[record._id])||audit.environment!==context.environment||audit.appId!==context.appId||
      audit.schemaVersion!==1||audit.version!==0||audit.createdAt!==record.createdAt||audit.updatedAt!==audit.createdAt||audit.action!==request.command||
      audit.storeId!==state.storeId||canonicalJSON(audit.storeIds)!==canonicalJSON([state.storeId])||
      canonicalJSON(audit.actor)!==canonicalJSON({type:'STORE',subjectId:actor.subjectId,service:null})||!text(audit.reason)||!text(audit.requestId)||
      canonicalJSON(audit.target)!==canonicalJSON({collection,entityId:expectedId,beforeVersion:version===0?null:version-1,afterVersion:version})||
      !Array.isArray(audit.changes)||audit.changes.length!==3||
      canonicalJSON(audit.changes[0])!==canonicalJSON({field:'requestFingerprint',before:null,after:request.requestFingerprint})||
      audit.changes.slice(1).some((change,index)=>!change||Object.keys(change).sort().join(',')!=='after,before,field'||
        change.field!==['entityFingerprint','relatedWritesFingerprint'][index]||!hash(change.after)||
        (index===0?(version===0?change.before!==null:!hash(change.before)):change.before!==null))||
      current.version===version&&requestFingerprint(view(collection,current))!==audit.changes[1].after)fail('INVALID_IDEMPOTENCY_RECORD');
  }
  return Object.freeze({async execute(event,principal){
    requireOwner(principal,{ownerId:principal?.subjectId});if(principal.environment!==context.environment||principal.appId!==context.appId)fail('FORBIDDEN');
    const {contract,payload}=parseApiRequest('admin',event),action=contract.action;if(!actions.includes(action))fail('INVALID_REQUEST');
    const collection=action.startsWith('slot')?'slot_inventory':action.startsWith('config')?'store_config':'stores',writing=contract.mutation,
      requestId=writing?newRequestId():null;if(writing&&!text(requestId))fail('INVALID_CONFIGURATION');
    return runTransaction(async tx=>{
      if(!tx||['readUser','readAccessState','readStoreHeader','readStoreState','assertStoreReads','readReceipt','readAudit',
        'saveStore','insertConfig','saveConfig','saveSlot','insertAudit','insertReceipt'].some(name=>typeof tx[name]!=='function'))fail('INVALID_TRANSACTION_ADAPTER');
      const user=copy(await tx.readUser(principal.subjectId));requireCurrentOrderUser(user,principal);
      const access=copy(await tx.readAccessState()),start=clock();validateScopedAdminState(access,{...context,now:start});
      const id=payload.slotId||payload.configId||(collection==='stores'?payload.storeId:null),
        header=id?copy(await tx.readStoreHeader(collection,id)):null;if(id&&(!header||header._id!==id))fail('NOT_FOUND');
      const storeId=header?(collection==='stores'?header._id:header.storeId):payload.storeId;
      let actor;try{
        if(!access.stores.some(store=>store._id===storeId&&store.status!=='ARCHIVED')||payload.storeId!==undefined&&payload.storeId!==storeId)fail('FORBIDDEN');
        actor=requireStoreCapability(principal,access.roles,storeId,['CONFIG_WRITE']);
      }catch(error){if(id&&error.code==='FORBIDDEN')fail('NOT_FOUND');throw error;}
      const state=copy(await tx.readStoreState(storeId)),at=clock();if(at<start)fail('INVALID_CONFIGURATION');validateStoreState(state,storeId,context,at);
      const accessStore=access.stores.find(store=>store._id===storeId);
      if(accessStore.version!==state.store.version||accessStore.status!==state.store.status)fail('VERSION_CONFLICT');
      const current=id?entity(state,collection,id):null;if(id&&(!current||canonicalJSON(current)!==canonicalJSON(header)))fail('VERSION_CONFLICT');
      const reads={environment:context.environment,appId:context.appId,user,access,state,grant:actor.grant,receiptId:null,auditId:null,proofs:[]};
      const fence=async()=>{if(await tx.assertStoreReads(freeze(copy(reads)))!==true)fail('VERSION_CONFLICT');};
      if(!writing){
        let output;if(action==='store.get')output={scope:'OFFLINE_MERCHANT_STORE_DETAIL',...storeDTO(state.store),...gates};
        else if(action==='config.get'){
          const config=current||state.configs.find(config=>config._id===state.store.activeConfigId);if(!config)fail('NOT_FOUND');
          output={scope:'OFFLINE_MERCHANT_CONFIG_DETAIL',...configDTO(config),...gates};
        }else if(action==='configs.list')output=page(payload,state,actor,principal,at);
        else{const day=new Date(payload.serviceDate+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(payload.serviceDate)||
          !Number.isFinite(day.getTime())||day.toISOString().slice(0,10)!==payload.serviceDate||Number(payload.serviceDate.slice(0,4))<2000)fail('INVALID_SERVICE_DATE');
          output={scope:'OFFLINE_MERCHANT_SLOT_LIST',items:state.slots.filter(slot=>slot.fulfillment===payload.fulfillment&&slot.serviceDate===payload.serviceDate)
            .sort((a,b)=>a.startAt-b.startAt).map(slotDTO),...gates};}
        await fence();if(clock()<at)fail('INVALID_CONFIGURATION');return freeze(output);
      }
      const request={environment:context.environment,actorScope:canonicalJSON([context.appId,principal.subjectId]),command:'admin.'+action,
        key:payload.idempotencyKey,requestFingerprint:requestFingerprint(payload)},receiptId=idempotencyId(request),
        record=copy(await tx.readReceipt(receiptId)),decision=decideIdempotency(record,request),auditId=scopedDocumentId('merchant-store-audit',[receiptId]),audit=copy(await tx.readAudit(auditId));
      reads.receiptId=receiptId;reads.auditId=auditId;if(decision.disposition==='BUSY')fail('BUSY');
      if(decision.disposition==='REPLAY'){
        replay(record,decision,audit,request,collection,current||entity(state,collection,decision.result.entityId),state,actor,at,payload);
        await fence();if(clock()<at)fail('INVALID_CONFIGURATION');return freeze({scope:'OFFLINE_MERCHANT_STORE_RESULT',disposition:'REPLAY',result:decision.result,...gates});
      }
      if(audit!==null)fail('INVALID_IDEMPOTENCY_RECORD');
      let resolvedLocation=null;
      if(action==='store.update'&&Object.hasOwn(payload.patch,'mapSelectionToken')){
        if(typeof tx.resolveStoreMapSelection!=='function')fail('LOCATION_REQUIRED');
        const binding={environment:context.environment,appId:context.appId,subjectId:principal.subjectId,storeId,storeVersion:state.store.version,
          token:payload.patch.mapSelectionToken,at};
        resolvedLocation=copy(await tx.resolveStoreMapSelection(freeze(binding)));reads.proofs.push({kind:'MAP_SELECTION',binding,location:resolvedLocation});
      }
      const plan=action==='store.update'?planStoreUpdate(payload,state,at,resolvedLocation):action==='config.save'?planConfigSave(payload,state,context,receiptId,at):
        action==='config.publish'?planConfigPublish(payload,state,context,at):planSlotUpdate(payload,state,context,at);
      if(!plan.before&&state.configs.some(config=>config._id===plan.after._id))fail('VERSION_CONFLICT');
      const future=futureState(state,plan);validateStoreState(future,storeId,context,at);
      const publication=action==='config.publish'||action==='store.update'&&plan.after.status==='OPEN';
      if(action==='store.update'&&plan.after.phone!==null&&(typeof tx.validateStorePhone!=='function'||await tx.validateStorePhone(plan.after.phone)!==true))fail('INVALID_REQUEST');
      if(publication){
        const config=action==='config.publish'?plan.after:future.configs.find(config=>config._id===future.store.activeConfigId);
        validatePublication(future.store,config,at);
        const binding={environment:context.environment,appId:context.appId,storeId,storeVersion:state.store.version,proposedStoreVersion:future.store.version,
          configId:config._id,configVersion:config.configVersion,configReadVersion:state.configs.find(row=>row._id===config._id).version,
          proposedConfigVersion:config.version,locationFingerprint:requestFingerprint(future.store.location),policyFingerprint:requestFingerprint(draftOf(config)),at};
        if(typeof tx.verifyStoreLocation!=='function'||await tx.verifyStoreLocation(freeze(copy(binding)),copy(future.store.location))!==true)fail('LOCATION_REQUIRED');
        if(typeof tx.verifyOperationalPolicies!=='function'||await tx.verifyOperationalPolicies(freeze(copy(binding)),draftOf(config))!==true)fail('CONFIGURATION_REQUIRED');
        if(typeof tx.validateStorePhone!=='function'||await tx.validateStorePhone(future.store.phone)!==true)fail('INVALID_REQUEST');
        reads.proofs.push({kind:'PUBLICATION',binding});
      }
      const reason=redactReason(payload.reason||'门店配置维护',request.command);if(!text(reason))fail('INVALID_CONFIGURATION');
      const related=[...(plan.storeWrite?[plan.storeWrite]:[]),...plan.slotWrites];
      const nextAudit={_id:auditId,schemaVersion:1,version:0,createdAt:at,updatedAt:at,environment:context.environment,appId:context.appId,
        actor:{type:'STORE',subjectId:principal.subjectId,service:null},action:request.command,storeId,storeIds:[storeId],
        target:{collection,entityId:plan.after._id,beforeVersion:plan.before?.version??null,afterVersion:plan.after.version},reason,requestId,
        changes:[{field:'requestFingerprint',before:null,after:request.requestFingerprint},
          {field:'entityFingerprint',before:plan.before?requestFingerprint(view(collection,plan.before)):null,after:requestFingerprint(view(collection,plan.after))},
          {field:'relatedWritesFingerprint',before:null,after:requestFingerprint(related.map(write=>({id:write.after._id,before:write.before,after:write.after})))}]};
      await fence();
      if(collection==='stores')await checked(tx.saveStore(plan.after,plan.before.version));
      else if(collection==='slot_inventory')await checked(tx.saveSlot(plan.after,plan.before.version));
      else if(plan.before)await checked(tx.saveConfig(plan.after,plan.before.version));else await checked(tx.insertConfig(plan.after));
      if(plan.storeWrite)await checked(tx.saveStore(plan.storeWrite.after,plan.storeWrite.before.version));
      for(const write of plan.slotWrites)await checked(tx.saveSlot(write.after,write.before.version));
      await checked(tx.insertAudit(nextAudit));const result={entityId:plan.after._id,version:plan.after.version,errorCode:null};
      await checked(tx.insertReceipt({...request,_id:receiptId,schemaVersion:1,version:0,createdAt:at,updatedAt:at,status:'SUCCEEDED',result,leaseUntil:null,retentionUntil:null}));
      if(clock()<at)fail('INVALID_CONFIGURATION');return freeze({scope:'OFFLINE_MERCHANT_STORE_RESULT',disposition:'SUCCEEDED',result,...gates});
    });
  }});
}
module.exports={createMerchantStoreService};
