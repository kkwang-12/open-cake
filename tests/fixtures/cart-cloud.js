'use strict';
// Serial rollback fixture only: no claim about the live SDK conflict semantics.
const {identityFromPlatform,resolveCustomer}=require('../../cloudfunctions/_shared/authorization-model');
const {cartId}=require('../../cloudfunctions/_shared/cart-service');
const {createCartCloudHandler,createCloudCartRepository}=require('../../cloudfunctions/_shared/cart-cloud-handler');
const {catalog}=require('./catalog');
const clone=v=>JSON.parse(JSON.stringify(v));
const settings={appId:'offline-cart-app',environment:'offline-cart-env',stage:'development',enabled:true,selectionDraft:true,storeId:'offline-store'};
function fixture(){
  const contexts=['A','B'].map(OPENID=>({OPENID,APPID:settings.appId,ENV:settings.environment}));
  const users=Object.fromEntries(contexts.map(c=>{const identity=identityFromPlatform(c,settings);return [identity._id,{...identity,
    schemaVersion:1,version:0,status:'ACTIVE',defaultAddressId:'keep-this-address',createdAt:1000,updatedAt:1000}];}));
  const cat=catalog();cat.product.minLeadTimeMinutes=null;cat.product.messagePolicy=null;
  cat.skus[0].minQuantity=null;cat.skus[0].maxQuantity=null;cat.skus[0].stockRequirements=[];
  const state={users,carts:{},products:{[cat.product._id]:cat.product},skus:{[cat.skus[0]._id]:cat.skus[0]},idempotency_records:{}};
  const productId=cat.product._id,skuId=cat.skus[0]._id;
  Object.defineProperty(cat,'product',{get:()=>state.products[productId]});Object.defineProperty(cat,'skus',{get:()=>[state.skus[skuId]]});
  const calls=[],logs=[];let queue=Promise.resolve(),time=2000,failAt='',beforeTransaction=null;
  function collection(source,name){return {
    doc(id){return {async get(){calls.push({op:'get',name,id});return {data:clone(source[name][id]||null)};},
      async update({data}){calls.push({op:'update',name,id,data:clone(data)});if(failAt===name)throw new Error('PRIVATE_PROVIDER_FAILURE');
        if(!source[name][id])return {stats:{updated:0}};Object.assign(source[name][id],clone(data));return {stats:{updated:1}};}};},
    async add({data}){calls.push({op:'add',name,id:data._id});if(failAt===name)throw new Error('PRIVATE_PROVIDER_FAILURE');
      if(source[name][data._id])throw Object.assign(new Error('DATABASE_DUPLICATE_WRITE'),{code:'DATABASE_DUPLICATE_WRITE'});
      source[name][data._id]=clone(data);return {_id:data._id};}
  };}
  const database={collection:name=>collection(state,name),runTransaction(work,retries){
    if(retries!==2)throw new Error('UNBOUNDED_RETRY');const job=queue.then(async()=>{
      if(beforeTransaction)beforeTransaction(state);const staged=clone(state),response=await work({collection:name=>collection(staged,name)});
      Object.assign(state,staged);return response;});queue=job.catch(()=>{});return job;
  }};
  const now=()=>time++,cloud={database:()=>database},repository=createCloudCartRepository(cloud,settings,now);
  const make=(context=contexts[0],overrides={})=>createCartCloudHandler({settings,getContext:()=>context,repository,now,
    logger:{info:v=>logs.push(v),warn:v=>logs.push(v),error:v=>logs.push(v)},...overrides});
  const call=(action,payload={},index=0)=>make(contexts[index])({action,payload});
  const ids=contexts.map(c=>cartId(resolveCustomer(c,settings,users[identityFromPlatform(c,settings)._id]),settings.storeId));
  const add=(patch={},index=0)=>({storeId:settings.storeId,cartId:ids[index],expectedVersion:0,productId:cat.product._id,skuId:cat.skus[0]._id,
    selectedOptions:cat.selectedOptions,quantity:1,cakeMessage:'',idempotencyKey:'offline-cart-add-key',...patch});
  return {state,calls,logs,contexts,settings,cat,ids,call,make,add,cloud,now,setFailure:v=>{failAt=v;},beforeTransaction:v=>{beforeTransaction=v;}};
}
module.exports={fixture,settings,clone};
