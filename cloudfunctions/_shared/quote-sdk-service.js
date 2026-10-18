'use strict';
const {createCloudDocumentTransactionAdapter}=require('./cloud-document-transaction');
const {identityFromPlatform,resolveCustomer,requireOwner}=require('./authorization-model');
const {parseApiRequest}=require('./api-contract');
const {cartId}=require('./cart-service');
const {planQuoteCreation,projectQuotePreview}=require('./quote-model');
const {projectStoreInformation}=require('./store-fulfillment');
const {canonicalJSON,requestFingerprint,scopedDocumentId,idempotencyId,decideIdempotency}=require('./idempotency-model');
const {createQuoteContextBuilder}=require('./quote-cloud-context');
const {requirementsForDate}=require('./daily-quota');
const collections=['users','stores','store_config','carts','products','skus','addresses','inventory_resources','slot_inventory',
  'media_assets','location_verifications','checkout_quotes','idempotency_records','delivery_evaluations'];
const bytes=value=>Buffer.byteLength(canonicalJSON(value),'utf8');
const fail=code=>{throw Object.assign(new Error(code),{code});};
const copy=value=>JSON.parse(canonicalJSON(value));
const validId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value);
// At most 100 physical SDK operations per attempt, including dependency guards.
// This is a transport ceiling, not an added merchant cart/quantity policy.
function createSdkQuoteService({cloud,settings,now=Date.now,clock=Date.now,buildContext=createQuoteContextBuilder(settings,now)}){
  const adapter=createCloudDocumentTransactionAdapter({cloud,environment:settings.environment,
    collections:Object.fromEntries(collections.map(name=>[name,[]])),maxRetries:2});
  return Object.freeze({async execute(event,native){
    const {contract,payload}=parseApiRequest('checkout',event);
    if(!['quote.create','quote.get'].includes(contract.action)||!validId(settings.storeId))fail('INVALID_REQUEST');
    const identity=identityFromPlatform(native,settings),started=clock();let attempts=0;
    return adapter.runTransaction(async raw=>{
      if(++attempts>3)fail('QUOTE_BUDGET_EXCEEDED');
      const cache=new Map();let operations=0,totalBytes=0;
      function budget(extra=0,payloadBytes=0,largest=0){
        const elapsed=clock()-started;
        if(!Number.isSafeInteger(elapsed)||elapsed<0||elapsed>=15000)fail('QUOTE_TIME_EXCEEDED');
        if(operations+extra>100||totalBytes+payloadBytes>1048576||largest>65536)fail('QUOTE_BUDGET_EXCEEDED');
      }
      async function read(name,id){
        if(!collections.includes(name)||!validId(id))fail('CONFIGURATION_REQUIRED');
        const key=JSON.stringify([name,id]);if(cache.has(key))return copy(cache.get(key));
        budget(1);operations++;
        const record=await raw.read(name,id),size=bytes(record);totalBytes+=size;budget(0,0,size);
        cache.set(key,record);return copy(record);
      }
      const user=await read('users',identity._id),principal=resolveCustomer(native,settings,user);
      let receipt=null,quote=null,request=null;
      if(contract.action==='quote.create'){
        const {idempotencyKey,...business}=payload;
        request={environment:settings.environment,actorScope:principal.subjectId,command:'checkout.quote.create',key:idempotencyKey,
          requestFingerprint:requestFingerprint(business)};
        receipt=await read('idempotency_records',idempotencyId(request));
        const decision=decideIdempotency(receipt,request);
        if(decision.disposition==='BUSY')fail('BUSY');
        const expectedQuoteId=scopedDocumentId('quote',[settings.environment,principal.subjectId,idempotencyKey]);
        quote=await read('checkout_quotes',expectedQuoteId);
        if(decision.disposition==='REPLAY'){
          if(decision.result.errorCode!==null)fail(decision.result.errorCode);
          if(!quote||decision.result.entityId!==expectedQuoteId||decision.result.version>quote.version)fail('INVALID_IDEMPOTENCY_RECORD');
        }else if(quote!==null)fail('VERSION_CONFLICT');
      }else{
        quote=await read('checkout_quotes',payload.quoteId);
        if(!quote)fail('NOT_FOUND');
      }
      if(quote){requireOwner(principal,quote);if(quote.storeId!==settings.storeId)fail('NOT_FOUND');}
      const input=quote?{cartId:quote.facts?.cartSelectionSnapshot?.cartId,slotId:quote.facts?.appointmentSnapshot?.slotId,
        lines:quote.facts?.cartSelectionSnapshot?.selectedLines,fulfillment:quote.facts?.fulfillment,addressId:quote.facts?.addressSnapshot?.addressId}:payload;
      if(input.cartId!==cartId(principal,settings.storeId))fail('NOT_FOUND');
      const store=await read('stores',settings.storeId);
      if(!store||!validId(store.activeConfigId))fail('CONFIGURATION_REQUIRED');
      const configuration=await read('store_config',store.activeConfigId);
      projectStoreInformation(store,configuration); // Refuse drafts before catalog/resource reads.
      const cart=await read('carts',input.cartId);if(!cart)fail('NOT_FOUND');
      requireOwner(principal,cart);if(cart.storeId!==store._id)fail('NOT_FOUND');
      if(!Array.isArray(cart.lines)||!Array.isArray(input.lines)||!input.lines.length||input.lines.length>60)fail('INVALID_REQUEST');
      const catalogs=new Map(),stockIds=new Set();
      const slot=await read('slot_inventory',input.slotId);if(!slot||slot.storeId!==store._id)fail('APPOINTMENT_UNAVAILABLE');
      for(const selected of input.lines){
        const matches=cart.lines.filter(row=>row.lineId===selected.lineId);if(matches.length!==1)fail('VERSION_CONFLICT');
        const line=matches[0],product=await read('products',line.productId),sku=await read('skus',line.skuId);
        if(!product||!sku||product.storeId!==store._id||sku.storeId!==store._id||sku.productId!==product._id)fail('PRODUCT_UNAVAILABLE');
        if(!Array.isArray(sku.stockRequirements))fail('CONFIGURATION_REQUIRED');
        if(!catalogs.has(product._id))catalogs.set(product._id,{product,skus:[]});
        if(!catalogs.get(product._id).skus.some(value=>value._id===sku._id))catalogs.get(product._id).skus.push(sku);
        for(const row of requirementsForDate(product,sku,settings.environment,slot.serviceDate))stockIds.add(row.resourceId);
      }
      const stocks=[];for(const id of [...stockIds].sort())stocks.push(await read('inventory_resources',id));
      const address=input.fulfillment==='DELIVERY'?await read('addresses',input.addressId):null;
      if(address)requireOwner(principal,address);
      const state={quote,receipt,store,configuration,cart,catalogs:[...catalogs.values()],slot,stocks,address};
      const context={...await buildContext(read,state,principal),now:now()};
      const inserts=[];
      if(contract.action==='quote.create'&&!receipt){
        const plan=planQuoteCreation(state,event,principal,context);quote=plan.proposedQuote;
        if(!quote||plan.disposition!=='CREATE')fail('INVALID_IDEMPOTENCY_RECORD');
        inserts.push(['checkout_quotes',quote]);
        if(plan.deliveryEvaluation){
          const evaluation=plan.deliveryEvaluation;
          inserts.push(['delivery_evaluations',{_id:quote.facts.deliverySnapshot.evaluationId,schemaVersion:1,version:0,
            ownerId:principal.subjectId,storeId:store._id,quoteId:quote._id,createdAt:context.now,updatedAt:context.now,
            evaluatedAt:evaluation.evaluatedAt,evaluationFingerprint:evaluation.evaluationFingerprint,bindings:evaluation.bindings,
            addressSnapshot:evaluation.addressSnapshot,range:evaluation.range,deliveryFacts:evaluation.deliveryFacts}]);
        }
        inserts.push(['idempotency_records',{...plan.idempotency,schemaVersion:1,version:0,createdAt:context.now,updatedAt:context.now,
          status:'SUCCEEDED',result:{entityId:quote._id,version:quote.version,errorCode:null},leaseUntil:null,retentionUntil:null}]);
      }
      const preview=projectQuotePreview(quote,state,principal,context);
      if(contract.action==='quote.create'){
        const guards=[];
        for(const [key,record]of [...cache].sort(([a],[b])=>a<b?-1:a>b?1:0)){
          if(record===null)continue;
          const [name,id]=JSON.parse(key),fence=Object.hasOwn(record,'_transactionFence')?record._transactionFence:0;
          if(!Number.isSafeInteger(fence)||fence<0||!Number.isSafeInteger(fence+1))fail('INVALID_TRANSACTION_FENCE');
          guards.push({name,id,fence});
        }
        const sizes=[...guards.map(row=>bytes({_transactionFence:row.fence+1})),...inserts.map(([,row])=>bytes(row))];
        budget(guards.length+inserts.length,sizes.reduce((a,b)=>a+b,0),Math.max(...sizes));
        for(const row of guards){operations++;await raw.protectExisting(row.name,row.id,row.fence);}
        for(const [name,record]of inserts){operations++;await raw.insertNew(name,record);}
        budget();if(now()>=quote.expiresAt)fail('QUOTE_EXPIRED');
      }
      return {...preview,scope:'CLOUD_QUOTE',checkoutAllowed:false,capacityReserved:false,stockReserved:false};
    });
  }});
}
module.exports={createSdkQuoteService};
