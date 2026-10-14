'use strict';
const {createHandler}=require('./runtime');
const {parseApiRequest,ApiContractError}=require('./api-contract');
const {projectStoreInformation}=require('./store-fulfillment');
const API_VERSION='v1-api-2026-10-03';
const id=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,256}$/.test(value);
const plain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
class StoreCloudError extends Error {
  constructor(code){super(code);this.name='StoreCloudError';this.code=code;}
}
const fail=code=>{throw new StoreCloudError(code);};
function mapError(error){
  if(error instanceof ApiContractError)return 'INVALID_REQUEST';
  if(error instanceof StoreCloudError&&['INVALID_REQUEST','NOT_FOUND','CONFIGURATION_REQUIRED'].includes(error.code))return error.code;
  return 'INTERNAL_ERROR';
}
// One bounded read-only snapshot. This does not protect reads for order writes.
function createCloudStoreRepository(database,storeId){
  if(!database||typeof database.runTransaction!=='function'||!id(storeId))fail('CONFIGURATION_REQUIRED');
  return Object.freeze({async readSnapshot(){
    return database.runTransaction(async transaction=>{
      async function read(collection,documentId){
        const response=await transaction.collection(collection).where({_id:documentId}).limit(2).get();
        if(!response||!Array.isArray(response.data)||response.data.length>1)fail('INTERNAL_ERROR');
        if(!response.data.length)return null;
        const row=response.data[0];
        if(!plain(row)||row._id!==documentId)fail('INTERNAL_ERROR');
        if(Buffer.byteLength(JSON.stringify(row))>64*1024)fail('CONFIGURATION_REQUIRED');
        return row;
      }
      const store=await read('stores',storeId);
      if(!store)return {store:null,configuration:null};
      // Never query an arbitrary path from an unvalidated persisted reference.
      const configuration=id(store.activeConfigId)?await read('store_config',store.activeConfigId):null;
      return {store,configuration};
    },2);
  }});
}
function createStoreCloudHandler({getContext,settings,repository,logger=console,now=Date.now}){
  const health=createHandler({action:'health',getContext,settings,logger,
    handle:({stage,environment})=>({available:true,stage,environment})});
  return async function main(event={},invocation){
    // Platform metadata is transport-only; identity always comes from invocation context.
    if(plain(event)){
      const {userInfo,tcbContext,...request}=event;event=request;
    }
    if(event&&event.action==='health')return health(event,invocation);
    return createHandler({action:'get',getContext,settings,logger,mapError,async handle(){
      const {payload}=parseApiRequest('store',event);
      if(settings.enabled!==true||!id(settings.storeId)||!repository||typeof repository.readSnapshot!=='function')fail('CONFIGURATION_REQUIRED');
      if(payload.storeId!==settings.storeId)fail('NOT_FOUND');
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
module.exports={createStoreCloudHandler,createCloudStoreRepository,StoreCloudError,API_VERSION};
