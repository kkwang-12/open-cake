'use strict';
const {createHandler}=require('./runtime');
const {parseApiRequest}=require('./api-contract');
const {identityFromPlatform,resolveCustomer,requireOwner}=require('./authorization-model');
const {createCartService,publicCart,cartId}=require('./cart-service');
const {validateCart,DRAFT_MAX_LINES}=require('./cart-model');
const {resolveDisplaySku}=require('./catalog-model');
const {canonicalJSON,scopedDocumentId}=require('./idempotency-model');
const ACTIONS=['get','add','update','remove'],API_VERSION='v1-api-2026-10-03';
const fail=code=>{throw Object.assign(new Error(code),{code});};
const clone=v=>JSON.parse(canonicalJSON(v));
const counter=v=>Number.isSafeInteger(v)&&v>=0;
const MAX_BYTES=2*1024*1024;
const safeErrors=new Set(['INVALID_REQUEST','AUTH_REQUIRED','APP_MISMATCH','ENV_MISMATCH','INVALID_CONFIGURATION',
  'CONFIGURATION_REQUIRED','NOT_FOUND','VERSION_CONFLICT','IDEMPOTENCY_KEY_REUSED','BUSY','PRODUCT_UNAVAILABLE']);
function mapError(error){
  if(error&&error.code==='FORBIDDEN')return 'NOT_FOUND';
  if(['USER_NOT_PROVISIONED','USER_DISABLED','INVALID_USER_RECORD'].includes(error&&error.code))return 'AUTH_REQUIRED';
  if(['SKU_UNAVAILABLE','INVALID_CATALOG'].includes(error&&error.code))return 'PRODUCT_UNAVAILABLE';
  if(['INVALID_SELECTION','SKU_SELECTION_MISMATCH','INVALID_CART_COMMAND','INVALID_MESSAGE','MESSAGE_NOT_SUPPORTED','CART_LIMIT_EXCEEDED','LINE_NOT_FOUND'].includes(error&&error.code))return 'INVALID_REQUEST';
  return safeErrors.has(error&&error.code)?error.code:'INTERNAL_ERROR';
}
function row(response,id){
  if(!response||!Object.hasOwn(response,'data')||(response.data!==null&&
    (!response.data||typeof response.data!=='object'||Array.isArray(response.data)||response.data._id!==id)))fail('INTERNAL_ERROR');
  return response.data;
}
function receiptShape(receipt){
  const allowed=['_id','schemaVersion','version','createdAt','updatedAt','actorScope','command','key','requestFingerprint','status','result','leaseUntil','retentionUntil'];
  return Object.keys(receipt).every(k=>allowed.includes(k))&&counter(receipt.version)&&counter(receipt.createdAt)&&counter(receipt.updatedAt)&&
    receipt.updatedAt>=receipt.createdAt&&receipt.leaseUntil===null&&receipt.retentionUntil===null&&
    receipt.result&&Object.keys(receipt.result).sort().join(',')==='entityId,errorCode,version'&&/^[a-f0-9]{64}$/.test(receipt.requestFingerprint||'');
}
function bounded(cart){validateCart(cart);if(cart.lines.length>DRAFT_MAX_LINES||Buffer.byteLength(canonicalJSON(cart))>MAX_BYTES)fail('INTERNAL_ERROR');}
// Native SDK transactions physically guard both the existing user and current cart.
// Catalog reads only validate a draft selection; they do not reserve or promise stock.
function createCloudCartRepository(cloud,settings,now=Date.now){
  const db=()=>cloud.database({env:settings.environment,throwOnNotFound:false});
  async function loadCustomer(context){
    const identity=identityFromPlatform(context,settings);
    return resolveCustomer(context,settings,row(await db().collection('users').doc(identity._id).get(),identity._id));
  }
  function session(context,event,principal){
    const {payload,contract}=parseApiRequest('cart',event),actorScope=JSON.stringify([settings.appId,principal.subjectId]);
    const expectedId=cartId(principal,settings.storeId);
    if((payload.storeId!==undefined&&payload.storeId!==settings.storeId)||
      (payload.cartId!==undefined&&payload.cartId!==expectedId))fail('NOT_FOUND');
    return work=>db().runTransaction(async tx=>{
      const read=async(name,id)=>row(await tx.collection(name).doc(id).get(),id);
      const user=await read('users',principal.subjectId);resolveCustomer(context,settings,user);
      let currentCart=null,cartWritten=false,receiptWritten=false;
      const insert=async(name,value)=>{const r=await tx.collection(name).add({data:value});if(!r||r._id!==value._id)fail('INTERNAL_ERROR');};
      const update=async(name,id,patch)=>{const r=await tx.collection(name).doc(id).update({data:patch});if(!r||!r.stats||r.stats.updated!==1)fail('VERSION_CONFLICT');};
      const result=await work({
        async readCart(id){
          if(id!==expectedId)fail('NOT_FOUND');currentCart=await read('carts',id);
          if(currentCart){bounded(currentCart);requireOwner(principal,currentCart);if(currentCart.storeId!==settings.storeId)fail('NOT_FOUND');}
          return currentCart&&clone(currentCart);
        },
        async readCatalog(productId){
          const product=await read('products',productId),sku=await read('skus',payload.skuId);
          if(!product||product.storeId!==settings.storeId||!sku||sku.productId!==productId||sku.storeId!==settings.storeId)fail('PRODUCT_UNAVAILABLE');
          return {product,skus:[sku]};
        },
        async readReceipt(id){
          const receipt=await read('idempotency_records',id);if(!receipt)return null;
          if(!receiptShape(receipt)||receipt.schemaVersion!==1||receipt.actorScope!==actorScope||receipt.command!=='cart.'+contract.action||
            receipt.key!==payload.idempotencyKey||receipt.status!=='SUCCEEDED'||typeof receipt.requestFingerprint!=='string'||
            !receipt.result||receipt.result.entityId!==expectedId||!counter(receipt.result.version)||receipt.result.errorCode!==null||
            !currentCart||receipt.result.version>currentCart.version)fail('INTERNAL_ERROR');
          return {fingerprint:receipt.requestFingerprint,response:publicCart(currentCart)};
        },
        async saveCart(cart,expected){
          bounded(cart);requireOwner(principal,cart);if(cart._id!==expectedId||cart.storeId!==settings.storeId)fail('NOT_FOUND');
          const previous=await read('carts',expectedId);
          if(expected===null){if(previous)fail('VERSION_CONFLICT');await insert('carts',cart);}
          else{
            if(!previous||previous.version!==expected)fail('VERSION_CONFLICT');requireOwner(principal,previous);
            await update('carts',expectedId,{version:cart.version,updatedAt:cart.updatedAt,lines:cart.lines});
          }
          cartWritten=true;
        },
        async saveReceipt(id,{fingerprint,response}){
          if(!cartWritten||response.cartId!==expectedId||!counter(response.version))fail('INTERNAL_ERROR');
          const time=now();await insert('idempotency_records',{_id:id,schemaVersion:1,version:0,createdAt:time,updatedAt:time,
            actorScope,command:'cart.'+contract.action,key:payload.idempotencyKey,requestFingerprint:fingerprint,status:'SUCCEEDED',
            result:{entityId:expectedId,version:response.version,errorCode:null},leaseUntil:null,retentionUntil:null});receiptWritten=true;
        }
      });
      if(receiptWritten){
        if(!counter(user.version+1))fail('VERSION_CONFLICT');
        await update('users',user._id,{version:user.version+1,updatedAt:Math.max(now(),user.updatedAt)});
      }
      return result;
    },2);
  }
  async function decorate(cart){
    const result={...cart,checkoutAllowed:false,scope:'CLOUD_SELECTION_DRAFT',lines:[]};
    if(cart.lines.length>DRAFT_MAX_LINES)fail('INTERNAL_ERROR');
    const cache=new Map();
    const load=(name,id)=>{const key=name+':'+id;if(!cache.has(key))cache.set(key,db().collection(name).doc(id).get().then(r=>row(r,id)));return cache.get(key);};
    async function project(line){
      let display=null;
      const [product,sku]=await Promise.all([load('products',line.productId),load('skus',line.skuId)]);
      try{
        if(!product||product.storeId!==settings.storeId||!sku||sku.productId!==line.productId||sku.storeId!==settings.storeId)fail('PRODUCT_UNAVAILABLE');
        const resolved=resolveDisplaySku(product,[sku],sku.selectedOptions,line.skuId);
        display={name:product.name,specLabel:resolved.description,selectedOptions:resolved.selectedOptions,
          unitPriceCents:resolved.unitPriceCents,currency:'CNY',productVersion:product.version,skuVersion:sku.version,
          minQuantity:resolved.minQuantity,maxQuantity:resolved.maxQuantity};
      }catch(error){if(!['PRODUCT_UNAVAILABLE','SKU_UNAVAILABLE','INVALID_CATALOG'].includes(error.code))throw error;}
      return {...line,display,availability:display?'DRAFT_ONLY':'UNAVAILABLE'};
    }
    // Bound concurrency and share repeated catalog reads across draft lines.
    for(let offset=0;offset<cart.lines.length;offset+=10)result.lines.push(...await Promise.all(cart.lines.slice(offset,offset+10).map(project)));
    if(Buffer.byteLength(canonicalJSON(result))>MAX_BYTES)fail('INTERNAL_ERROR');return result;
  }
  return {loadCustomer,session,decorate};
}
function createCartCloudHandler({getContext,settings,repository,logger=console,now=Date.now}){
  return async function main(event={},invocation){
    if(event&&typeof event==='object'&&!Array.isArray(event)){
      const {userInfo,tcbContext,...request}=event;event=request;
    }
    const action=event&&ACTIONS.includes(event.action)?event.action:'__unsupported__';
    return createHandler({action,getContext,settings,logger,mapError,
      async handle({subjectHash},context){
        if(action==='__unsupported__')fail('INVALID_REQUEST');
        const {payload}=parseApiRequest('cart',event);
        if(settings.enabled!==true||settings.selectionDraft!==true||settings.stage!=='development'||
          !/^[A-Za-z0-9_-]{1,256}$/.test(settings.storeId||'')||!repository)fail('CONFIGURATION_REQUIRED');
        if(action==='add'&&payload.cartId===undefined)fail('INVALID_REQUEST');
        const principal=await repository.loadCustomer(context);
        const service=createCartService({runTransaction:repository.session(context,event,principal),now,selectionDraft:true,
          newLineId:()=>scopedDocumentId('cart-line',[settings.environment,principal.subjectId,settings.storeId,payload.idempotencyKey])});
        const cart=await service.execute(event,principal);
        return {...await repository.decorate(cart),apiVersion:API_VERSION,subjectHash};
      }
    })(event,invocation);
  };
}
module.exports={createCloudCartRepository,createCartCloudHandler,ACTIONS,API_VERSION};
