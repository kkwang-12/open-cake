'use strict';
// A04 injected offline executor. Complete scoped snapshots and atomic SDK fences are still required.
const {parseApiRequest}=require('./api-contract');
const {requireOwner,requireStoreCapability}=require('./authorization-model');
const {requireCurrentOrderUser}=require('./order-transaction-service');
const {validateScopedAdminState}=require('./admin-access-state');
const {validateCatalogState,planProductSave,planProductStatus,planInventoryTotal,productDTO,resourceDTO}=require('./merchant-catalog-model');
const {canonicalJSON,requestFingerprint,scopedDocumentId,idempotencyId,decideIdempotency}=require('./idempotency-model');
const {pageRequest,issueCursor,readCursor}=require('./pagination-model');
const fail=code=>{throw Object.assign(new Error(code),{code});};
const copy=value=>JSON.parse(canonicalJSON(value));
const text=value=>typeof value==='string'&&value.length>0&&value.length<=256&&value===value.trim()&&value.isWellFormed();
const counter=value=>Number.isSafeInteger(value)&&value>=0;
const time=value=>counter(value)&&value>0&&Number.isFinite(new Date(value).getTime());
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
const gates={cloudVerified:false,callable:false,operationsAllowed:false};
const actions=['product.save','product.status.set','inventory.setTotal','products.list','product.get','inventory.list'];
function createMerchantCatalogService({context,key,runTransaction,now,newRequestId,redactReason}){
  context=copy(context);
  if(!text(context.environment)||!text(context.appId)||!['development','test','production'].includes(context.stage)||
    !Array.isArray(context.allowedCloudPrefixes)||!key||!text(key.id)||!Buffer.isBuffer(key.secret)||key.secret.length<32||
    ![runTransaction,now,newRequestId,redactReason].every(fn=>typeof fn==='function'))fail('INVALID_CONFIGURATION');
  key={id:key.id,secret:Buffer.from(key.secret)};
  const clock=()=>{const at=now();if(!time(at))fail('INVALID_CONFIGURATION');return at;};
  const recordView=(collection,record,state)=>collection==='products'?
    productDTO(record,state.skus.filter(sku=>sku.productId===record._id)):resourceDTO(record);
  const stateEntity=(state,collection,id)=>(collection==='products'?state.products:state.resources).find(record=>record._id===id);
  async function checked(effect){if(await effect!==1)fail('VERSION_CONFLICT');}
  function paginate(payload,state,actor,principal,action,at){
    const inventory=action==='inventory.list',sortId=inventory?'CREATED_DESC':'CATALOG';
    const source=(inventory?state.resources:state.products.filter(product=>payload.status===undefined||product.status===payload.status)).map(record=>recordView(inventory?'inventory_resources':'products',record,state));
    source.sort((a,b)=>inventory?b.createdAt-a.createdAt||(a._id>b._id?-1:a._id<b._id?1:0):a.sortOrder-b.sortOrder||(a._id<b._id?-1:a._id>b._id?1:0));
    const binding={environment:context.environment,actorScope:canonicalJSON([context.appId,principal.subjectId]),action:'admin.'+action,sortId,
      query:{storeId:state.storeId,status:payload.status??null,grant:actor.grant,revision:requestFingerprint(source)}};
    const pagination=pageRequest(Object.fromEntries(['cursor','pageSize'].filter(field=>Object.hasOwn(payload,field)).map(field=>[field,payload[field]])));
    const anchor=pagination.cursor===null?null:readCursor(pagination.cursor,binding,key,at);
    const eligible=source.filter(record=>!anchor||(inventory?record.createdAt<anchor[0]||record.createdAt===anchor[0]&&record._id<anchor[1]:
      record.sortOrder>anchor[0]||record.sortOrder===anchor[0]&&record._id>anchor[1]));
    const items=eligible.slice(0,pagination.pageSize),hasMore=eligible.length>items.length,last=items.at(-1);
    return {scope:inventory?'OFFLINE_MERCHANT_INVENTORY_PAGE':'OFFLINE_MERCHANT_PRODUCT_PAGE',items,hasMore,
      nextCursor:hasMore?issueCursor([inventory?last.createdAt:last.sortOrder,last._id],binding,key,at):null,...gates};
  }
  function replay(record,decision,audit,request,collection,entity,state,actor,at,payload){
    const result=decision.result,auditId=scopedDocumentId('merchant-catalog-audit',[record._id]);
    const expectedId=payload.resourceId||payload.productId||scopedDocumentId('merchant-product',[context.environment,context.appId,state.storeId,record._id]);
    const expectedVersion=payload.expectedVersion===undefined?0:payload.expectedVersion+1;
    if(record.environment!==context.environment||record.schemaVersion!==1||record.version!==0||record.status!=='SUCCEEDED'||
      !time(record.createdAt)||record.createdAt>at||record.updatedAt!==record.createdAt||record.leaseUntil!==null||record.retentionUntil!==null||
      result.errorCode!==null||result.entityId!==expectedId||result.entityId!==entity?._id||!counter(expectedVersion)||result.version!==expectedVersion||result.version>entity.version||
      !audit||audit._id!==auditId||audit.environment!==context.environment||audit.appId!==context.appId||audit.schemaVersion!==1||audit.version!==0||
      audit.createdAt!==record.createdAt||audit.updatedAt!==audit.createdAt||audit.action!==request.command||audit.storeId!==state.storeId||
      canonicalJSON(audit.storeIds)!==canonicalJSON([state.storeId])||
      canonicalJSON(audit.actor)!==canonicalJSON({type:'STORE',subjectId:actor.subjectId,service:null})||!text(audit.reason)||!text(audit.requestId)||
      !audit.target||canonicalJSON(audit.target)!==canonicalJSON({collection,entityId:entity._id,
        beforeVersion:result.version===0?null:result.version-1,afterVersion:result.version})||
      !Array.isArray(audit.changes)||audit.changes.length!==2||
      canonicalJSON(audit.changes[0])!==canonicalJSON({field:'requestFingerprint',before:null,after:request.requestFingerprint})||
      !audit.changes[1]||Object.keys(audit.changes[1]).sort().join(',')!=='after,before,field'||audit.changes[1].field!=='entityFingerprint'||
      (expectedVersion===0?audit.changes[1].before!==null:!/^[a-f0-9]{64}$/.test(audit.changes[1].before))||!/^[a-f0-9]{64}$/.test(audit.changes[1].after)||
      entity.version===result.version&&requestFingerprint(recordView(collection,entity,state))!==audit.changes[1].after)fail('INVALID_IDEMPOTENCY_RECORD');
  }
  return Object.freeze({async execute(event,principal){
    requireOwner(principal,{ownerId:principal?.subjectId});
    if(principal.environment!==context.environment||principal.appId!==context.appId)fail('FORBIDDEN');
    const {contract,payload}=parseApiRequest('admin',event);if(!actions.includes(contract.action))fail('INVALID_REQUEST');
    const action=contract.action,inventory=action==='inventory.setTotal',collection=inventory?'inventory_resources':'products';
    const writing=contract.mutation,requestId=writing?newRequestId():null;
    if(writing&&!text(requestId))fail('INVALID_CONFIGURATION');
    return runTransaction(async tx=>{
      if(!tx||['readUser','readAccessState','readCatalogHeader','readCatalogState','assertCatalogReads','readReceipt','readAudit',
        'insertProduct','saveProduct','insertSku','saveSku','saveInventory','insertAudit','insertReceipt'].some(name=>typeof tx[name]!=='function'))fail('INVALID_TRANSACTION_ADAPTER');
      const user=copy(await tx.readUser(principal.subjectId));requireCurrentOrderUser(user,principal);
      const access=copy(await tx.readAccessState()),start=clock();validateScopedAdminState(access,{...context,now:start});
      const entityId=inventory?payload.resourceId:payload.productId;
      const header=entityId?copy(await tx.readCatalogHeader(collection,entityId)):null;
      if(entityId&&(!header||header._id!==entityId))fail('NOT_FOUND');
      const storeId=header?.storeId||payload.storeId;
      let actor;
      try{if(!access.stores.some(store=>store._id===storeId&&store.status!=='ARCHIVED')||payload.storeId!==undefined&&payload.storeId!==storeId)fail('FORBIDDEN');
        actor=requireStoreCapability(principal,access.roles,storeId,['CATALOG_WRITE']);}
      catch(error){if(entityId&&error.code==='FORBIDDEN')fail('NOT_FOUND');throw error;}
      const state=copy(await tx.readCatalogState(storeId)),at=clock();if(at<start)fail('INVALID_CONFIGURATION');validateCatalogState(state,storeId,context,at);
      const entity=entityId?stateEntity(state,collection,entityId):null;
      if(entityId&&(!entity||canonicalJSON(entity)!==canonicalJSON(header)))fail('VERSION_CONFLICT');
      const reads={environment:context.environment,appId:context.appId,user,access,state,grant:actor.grant,receiptId:null,auditId:null};
      const fence=async()=>{if(await tx.assertCatalogReads(freeze(copy(reads)))!==true)fail('VERSION_CONFLICT');};
      if(!writing){
        const output=action==='product.get'?{scope:'OFFLINE_MERCHANT_PRODUCT_DETAIL',...recordView('products',entity,state),...gates}:
          paginate(payload,state,actor,principal,action,at);
        await fence();if(clock()<at)fail('INVALID_CONFIGURATION');return freeze(output);
      }
      const request={environment:context.environment,actorScope:canonicalJSON([context.appId,principal.subjectId]),command:'admin.'+action,
        key:payload.idempotencyKey,requestFingerprint:requestFingerprint(payload)};
      const receiptId=idempotencyId(request),record=copy(await tx.readReceipt(receiptId)),decision=decideIdempotency(record,request),
        auditId=scopedDocumentId('merchant-catalog-audit',[receiptId]),audit=copy(await tx.readAudit(auditId));
      reads.receiptId=receiptId;reads.auditId=auditId;
      if(decision.disposition==='BUSY')fail('BUSY');
      if(decision.disposition==='REPLAY'){
        const current=entity||stateEntity(state,collection,decision.result.entityId);
        replay(record,decision,audit,request,collection,current,state,actor,at,payload);await fence();if(clock()<at)fail('INVALID_CONFIGURATION');
        return freeze({scope:'OFFLINE_MERCHANT_CATALOG_RESULT',disposition:'REPLAY',result:decision.result,...gates});
      }
      if(audit!==null)fail('INVALID_IDEMPOTENCY_RECORD');
      const plan=action==='product.save'?planProductSave(payload,entity,state,context,receiptId,at):inventory?planInventoryTotal(payload,entity,at):planProductStatus(payload,entity,state,context,at);
      if(!entity&&state.products.some(product=>product._id===plan.after._id)||plan.skuWrites.some(write=>!write.before&&state.skus.some(sku=>sku._id===write.after._id)))fail('VERSION_CONFLICT');
      const future={...state,products:collection==='products'?[...state.products.filter(product=>product._id!==plan.after._id),plan.after]:state.products,
        skus:action==='product.save'?[...state.skus.filter(sku=>!plan.skuWrites.some(write=>write.after._id===sku._id)),...plan.skuWrites.map(write=>write.after)]:state.skus};
      const reason=redactReason(payload.reason||'商品资料维护',request.command);if(!text(reason))fail('INVALID_CONFIGURATION');
      const nextAudit={_id:auditId,schemaVersion:1,version:0,createdAt:at,updatedAt:at,environment:context.environment,appId:context.appId,
        actor:{type:'STORE',subjectId:principal.subjectId,service:null},action:request.command,storeId,storeIds:[storeId],
        target:{collection,entityId:plan.after._id,beforeVersion:plan.before?.version??null,afterVersion:plan.after.version},reason,requestId,
        changes:[{field:'requestFingerprint',before:null,after:request.requestFingerprint},
          {field:'entityFingerprint',before:plan.before?requestFingerprint(recordView(collection,plan.before,state)):null,
            after:requestFingerprint(recordView(collection,plan.after,future))}]};
      await fence();
      if(inventory)await checked(tx.saveInventory(plan.after,plan.before.version));
      else if(plan.before)await checked(tx.saveProduct(plan.after,plan.before.version));else await checked(tx.insertProduct(plan.after));
      for(const write of plan.skuWrites)if(write.before)await checked(tx.saveSku(write.after,write.before.version));else await checked(tx.insertSku(write.after));
      await checked(tx.insertAudit(nextAudit));const result={entityId:plan.after._id,version:plan.after.version,errorCode:null};
      await checked(tx.insertReceipt({...request,_id:receiptId,schemaVersion:1,version:0,createdAt:at,updatedAt:at,status:'SUCCEEDED',result,leaseUntil:null,retentionUntil:null}));
      if(clock()<at)fail('INVALID_CONFIGURATION');
      return freeze({scope:'OFFLINE_MERCHANT_CATALOG_RESULT',disposition:'SUCCEEDED',result,...gates});
    });
  }});
}
module.exports={createMerchantCatalogService};
