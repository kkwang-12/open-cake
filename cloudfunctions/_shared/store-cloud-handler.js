'use strict';
const {createHandler}=require('./runtime');
const {parseApiRequest,ApiContractError}=require('./api-contract');
const {projectStoreInformation}=require('./store-fulfillment');
const {validateLocation,buildSlotDefinitions,resolveAppointment}=require('./fulfillment-model');
const {requestFingerprint,scopedDocumentId}=require('./idempotency-model');
const API_VERSION='v1-api-2026-10-03';
const id=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,256}$/.test(value);
const plain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
class StoreCloudError extends Error {
  constructor(code){super(code);this.name='StoreCloudError';this.code=code;}
}
const fail=code=>{throw new StoreCloudError(code);};
function validateStoreLocationProof(store,proof,settings,at){
  try{
    // Quote read protection is storage metadata, outside the location proof fields.
    if(plain(proof)&&Object.hasOwn(proof,'_transactionFence')){
      if(!Number.isSafeInteger(proof._transactionFence)||proof._transactionFence<0)fail('CONFIGURATION_REQUIRED');
      const {_transactionFence,...businessProof}=proof;proof=businessProof;
    }
    const time=v=>Number.isSafeInteger(v)&&v>0&&Number.isFinite(new Date(v).getTime());
    const fields=['_id','schemaVersion','version','createdAt','updatedAt','appId','environment','entityKind','entityId','entityVersion',
      'locationFingerprint','sourceKind','sourceRef','verifiedAt','status'];
    if(!time(at)||!plain(store)||store._id!==settings.storeId||store.schemaVersion!==1||
      !Number.isSafeInteger(store.version)||store.version<0||!['DRAFT','OPEN','CLOSED'].includes(store.status)||
      !time(store.updatedAt)||store.updatedAt>at||!plain(store.location)||
      Object.keys(store.location).sort().join(',')!=='coordinateSystem,latitude,longitude,source,verifiedAt')fail('CONFIGURATION_REQUIRED');
    validateLocation(store.location,at);
    const source=/^TENCENT_POI:([0-9]{1,64})$/.exec(store.location.source);
    const fingerprint=requestFingerprint(store.location);
    const expectedId=scopedDocumentId('store-location-proof',[settings.appId,settings.environment,store._id,String(store.version),fingerprint]);
    if(!source||store.location.verifiedAt>store.updatedAt||!plain(proof)||Object.keys(proof).sort().join(',')!==fields.sort().join(',')||
      proof._id!==expectedId||proof._id!==settings.locationProofId||proof.schemaVersion!==1||proof.version!==0||proof.status!=='ACTIVE'||
      proof.appId!==settings.appId||proof.environment!==settings.environment||proof.entityKind!=='STORE'||
      proof.entityId!==store._id||proof.entityVersion!==store.version||proof.locationFingerprint!==fingerprint||
      proof.sourceKind!=='TENCENT_POI_OWNER_CONFIRMED'||proof.sourceRef!==source[1]||proof.verifiedAt!==store.location.verifiedAt||
      !time(proof.createdAt)||proof.updatedAt!==proof.createdAt||proof.createdAt<proof.verifiedAt||proof.createdAt>at)fail('CONFIGURATION_REQUIRED');
    return true;
  }catch(_){fail('CONFIGURATION_REQUIRED');}
}
function mapError(error){
  if(error instanceof ApiContractError)return 'INVALID_REQUEST';
  if(error instanceof StoreCloudError&&['INVALID_REQUEST','NOT_FOUND','CONFIGURATION_REQUIRED','PRODUCT_UNAVAILABLE',
    'APPOINTMENT_UNAVAILABLE','FULFILLMENT_UNAVAILABLE'].includes(error.code))return error.code;
  return 'INTERNAL_ERROR';
}
// One bounded read-only snapshot. This does not protect reads for order writes.
function createCloudStoreRepository(database,storeId){
  if(!database||typeof database.runTransaction!=='function'||!id(storeId))fail('CONFIGURATION_REQUIRED');
  async function read(transaction,collection,documentId){
        const response=await transaction.collection(collection).where({_id:documentId}).limit(2).get();
        if(!response||!Array.isArray(response.data)||response.data.length>1)fail('INTERNAL_ERROR');
        if(!response.data.length)return null;
        const row=response.data[0];
        if(!plain(row)||row._id!==documentId)fail('INTERNAL_ERROR');
        if(Buffer.byteLength(JSON.stringify(row))>64*1024)fail('CONFIGURATION_REQUIRED');
        return row;
  }
  return Object.freeze({async readSnapshot(){
    return database.runTransaction(async transaction=>{
      const store=await read(transaction,'stores',storeId);
      if(!store)return {store:null,configuration:null};
      // Never query an arbitrary path from an unvalidated persisted reference.
      const configuration=id(store.activeConfigId)?await read(transaction,'store_config',store.activeConfigId):null;
      return {store,configuration};
    },2);
  },async readSlotAvailability(payload,environment,at){
    if(!Array.isArray(payload.productIds)||payload.productIds.length<1||payload.productIds.length>60)fail('INVALID_REQUEST');
    return database.runTransaction(async transaction=>{
      const store=await read(transaction,'stores',storeId);
      if(!store)fail('NOT_FOUND');
      const configuration=id(store.activeConfigId)?await read(transaction,'store_config',store.activeConfigId):null;
      try{projectStoreInformation(store,configuration);}
      catch(error){fail(error.code==='STORE_UNAVAILABLE'?'NOT_FOUND':'CONFIGURATION_REQUIRED');}
      if(!Number.isSafeInteger(at)||at<1||configuration.publishedAt>at)fail('CONFIGURATION_REQUIRED');
      if(!configuration.fulfillmentModes.includes(payload.fulfillment))fail('FULFILLMENT_UNAVAILABLE');
      const productLeadTimes=[];
      for(const productId of payload.productIds){
        const product=await read(transaction,'products',productId);
        if(!product||product.storeId!==storeId||product.status!=='ON_SALE')fail('PRODUCT_UNAVAILABLE');
        productLeadTimes.push(product.minLeadTimeMinutes);
      }
      const input={store,environment,now:at,fulfillment:payload.fulfillment,serviceDate:payload.serviceDate,
        timePolicy:configuration.timePolicy,productLeadTimes};
      let definitions;
      try{definitions=buildSlotDefinitions(input);}
      catch(error){fail(error.code==='APPOINTMENT_OUTSIDE_WINDOW'?'APPOINTMENT_UNAVAILABLE':'CONFIGURATION_REQUIRED');}
      if(2+payload.productIds.length+definitions.length>100)fail('CONFIGURATION_REQUIRED');
      const items=[];
      for(const definition of definitions){
        const slot=await read(transaction,'slot_inventory',definition._id);
        let available=false;
        if(slot){
          try{resolveAppointment(input,slot);available=true;}
          catch(error){if(!['SLOT_FULL_OR_CLOSED','SLOT_DEFINITION_MISMATCH'].includes(error.code))fail('CONFIGURATION_REQUIRED');}
        }
        items.push({slotId:definition._id,startAt:definition.startAt,endAt:definition.endAt,available,
          windowNature:payload.fulfillment==='DELIVERY'?'ESTIMATED':'PICKUP'});
      }
      return {storeId,fulfillment:payload.fulfillment,serviceDate:payload.serviceDate,timeZone:store.timeZone,items};
    },2);
  },async readLocationSnapshot(proofId){
    if(!id(proofId))fail('CONFIGURATION_REQUIRED');
    return database.runTransaction(async transaction=>{
      const store=await read(transaction,'stores',storeId);
      return {store,proof:store?await read(transaction,'location_verifications',proofId):null};
    },2);
  }});
}
function createStoreCloudHandler({getContext,settings,repository,logger=console,now=Date.now}){
  const health=createHandler({action:'health',getContext,settings,logger,mapError,
    async handle({stage,environment}){
      const result={available:true,stage,environment};
      if(settings.locationProofEnabled!==true)return result;
      if(!id(settings.storeId)||!id(settings.locationProofId)||!repository||typeof repository.readLocationSnapshot!=='function')fail('CONFIGURATION_REQUIRED');
      const {store,proof}=await repository.readLocationSnapshot(settings.locationProofId);
      validateStoreLocationProof(store,proof,settings,now());
      return {...result,storeLocationVerified:true};
    }});
  return async function main(event={},invocation){
    // Platform metadata is transport-only; identity always comes from invocation context.
    if(plain(event)){
      const {userInfo,tcbContext,...request}=event;event=request;
    }
    if(event&&event.action==='health'){
      if(!plain(event)||Object.keys(event).some(key=>!['action','payload','requestId'].includes(key))||
        (event.payload!==undefined&&(!plain(event.payload)||Object.keys(event.payload).length))||
        (event.requestId!==undefined&&!id(event.requestId)))return createHandler({action:'health',getContext,settings,logger,mapError,
          handle:()=>fail('INVALID_REQUEST')})(event,invocation);
      return health(event,invocation);
    }
    const action=event&&event.action==='slots.list'?'slots.list':'get';
    return createHandler({action,getContext,settings,logger,mapError,async handle(){
      const {payload}=parseApiRequest('store',event);
      if(settings.enabled!==true||!id(settings.storeId)||!repository||typeof repository.readSnapshot!=='function')fail('CONFIGURATION_REQUIRED');
      if(payload.storeId!==settings.storeId)fail('NOT_FOUND');
      if(action==='slots.list'){
        if(!Array.isArray(payload.productIds)||payload.productIds.length<1||payload.productIds.length>60)fail('INVALID_REQUEST');
        if(typeof repository.readSlotAvailability!=='function')fail('CONFIGURATION_REQUIRED');
        return {...await repository.readSlotAvailability(payload,settings.environment,now()),apiVersion:API_VERSION};
      }
      const {store,configuration}=await repository.readSnapshot();
      if(!store||store._id!==settings.storeId)fail('NOT_FOUND');
      const evaluatedAt=now();
      if(!configuration||!Number.isSafeInteger(evaluatedAt)||evaluatedAt<1||!Number.isSafeInteger(configuration.publishedAt)||configuration.publishedAt>evaluatedAt)fail('CONFIGURATION_REQUIRED');
      let information;
      try{information=projectStoreInformation(store,configuration);}
      catch(error){if(error&&error.code==='STORE_UNAVAILABLE')fail('NOT_FOUND');fail('CONFIGURATION_REQUIRED');}
      const policy=configuration.timePolicy;
      // Project only public opening windows; omit coordinates until trusted mapping is integrated.
      return {...information,apiVersion:API_VERSION,
        businessHours:policy.weeklyWindows.map(row=>({weekday:row.weekday,fulfillment:row.fulfillment,startMinute:row.startMinute,endMinute:row.endMinute})),
        dateOverrides:policy.dateOverrides.map(row=>({serviceDate:row.serviceDate,fulfillment:row.fulfillment,closed:row.closed,
          windows:row.windows.map(window=>({startMinute:window.startMinute,endMinute:window.endMinute}))}))};
    }})(event,invocation);
  };
}
module.exports={createStoreCloudHandler,createCloudStoreRepository,validateStoreLocationProof,StoreCloudError,API_VERSION};
