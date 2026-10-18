'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {setup}=require('./fixtures/quote');
const {identityFromPlatform}=require('../cloudfunctions/_shared/authorization-model');
const {cartId}=require('../cloudfunctions/_shared/cart-service');
const {scopedDocumentId,requestFingerprint}=require('../cloudfunctions/_shared/idempotency-model');
const {createAddressLocationVerifier}=require('../cloudfunctions/_shared/address-location');
const {createSdkQuoteService}=require('../cloudfunctions/_shared/quote-sdk-service');
const {createQuoteCloudHandler}=require('../cloudfunctions/_shared/quote-cloud-handler');
const clone=v=>structuredClone(v);
function harness(mode='PICKUP',reference=false){
  const f=setup(mode),native={OPENID:'A',APPID:f.principal.appId,ENV:f.principal.environment};
  const settings={appId:native.APPID,environment:native.ENV,stage:'development',enabled:true,storeId:f.state.store._id,
    allowedCloudPrefixes:['cloud://offline-test/'],allowReferenceImages:reference,addressLocationSecret:Buffer.alloc(32,7)};
  f.state.configuration.cartLimits={maxLines:3,maxQuantityPerLine:6,maxOrderNoteLength:30};
  f.state.configuration.version=0;
  f.state.cart._id=cartId(f.principal,settings.storeId);f.event.payload.cartId=f.state.cart._id;
  const image=f.cat.product.images[0];delete image.privateMetadata;
  image.storageRef='cloud://offline-test/photo.png';if(reference)image.sourceKind='DESIGN_PREVIEW';
  const asset={_id:scopedDocumentId('media',[settings.environment,image.assetId,image.revision]),...clone(image),
    schemaVersion:1,version:0,createdAt:1000,updatedAt:1000,mimeType:'image/png',byteLength:100,contentHash:'a'.repeat(64),
    status:'PUBLISHED',catalogApproved:true,retainedUntil:null};
  const user={...identityFromPlatform(native,settings),schemaVersion:1,version:0,status:'ACTIVE'};
  Object.assign(f.state.store,{schemaVersion:1,updatedAt:2000});
  Object.assign(f.state.store.location,{source:'TENCENT_POI:12345678'});
  f.state.configuration.deliveryRules[0].area.center=clone(f.state.store.location);
  f.state.address.location.source='TENCENT_GEOCODER_V1';
  const verifier=createAddressLocationVerifier({appId:settings.appId,environment:settings.environment,
    secret:settings.addressLocationSecret,now:()=>f.context.now});
  f.state.address.locationProof=verifier.seal(f.state.address,f.principal);
  const fingerprint=requestFingerprint(f.state.store.location),proof={_id:scopedDocumentId('store-location-proof',[
    settings.appId,settings.environment,settings.storeId,String(f.state.store.version),fingerprint]),schemaVersion:1,version:0,
    createdAt:2000,updatedAt:2000,appId:settings.appId,environment:settings.environment,entityKind:'STORE',entityId:settings.storeId,
    entityVersion:f.state.store.version,locationFingerprint:fingerprint,sourceKind:'TENCENT_POI_OWNER_CONFIRMED',sourceRef:'12345678',verifiedAt:1000,status:'ACTIVE'};
  let records=Object.fromEntries(Object.entries({users:[user],stores:[f.state.store],store_config:[f.state.configuration],carts:[f.state.cart],
    products:[f.cat.product],skus:f.cat.skus,addresses:[f.state.address],inventory_resources:f.state.stocks,slot_inventory:[f.state.slot],
    media_assets:[asset],location_verifications:[proof],checkout_quotes:[],idempotency_records:[],delivery_evaluations:[]})
    .map(([name,rows])=>[name,Object.fromEntries(rows.map(row=>[row._id,clone(row)]))]));
  const controls={failAt:0,zeroAt:0,writes:0,reads:[],attempts:0,beforeWrite:null,now:f.context.now,clock:0};
  const conflict=()=>Object.assign(new Error('DATABASE_TRANSACTION_CONFLICT'),{code:'DATABASE_TRANSACTION_CONFLICT'});
  const cloud={database:()=>({runTransaction:async(work,maxRetries)=>{
    for(let attempt=0;;attempt++){
      controls.attempts++;controls.writes=0;controls.reads=[];
      const original=clone(records),staged=clone(records);
      const changed=(name,id)=>{
        controls.writes++;controls.beforeWrite?.({records,name,id,attempt});
        if(requestFingerprint(records[name]?.[id]??null)!==requestFingerprint(original[name]?.[id]??null))throw conflict();
        return controls.zeroAt!==controls.writes;
      };
      const after=()=>{if(controls.failAt===controls.writes)throw new Error('PRIVATE_PROVIDER_FAILURE');};
      const tx={collection:name=>({doc:id=>({get:async()=>{controls.reads.push([name,id]);return {data:clone(staged[name]?.[id]??null)};},
        update:async({data})=>{if(!changed(name,id))return {stats:{updated:0}};Object.assign(staged[name][id],clone(data));after();return {stats:{updated:1}};}}),
        add:async({data})=>{if(!changed(name,data._id))return {_id:'wrong'};
          if(staged[name][data._id])throw Object.assign(new Error('duplicate'),{code:'DATABASE_DUPLICATE_WRITE'});
          staged[name][data._id]=clone(data);after();return {_id:data._id};}})};
      try{const result=await work(tx);records=staged;return result;}
      catch(error){if(error.code==='DATABASE_TRANSACTION_CONFLICT'&&attempt<maxRetries)continue;throw error;}
    }
  }})};
  const service=()=>createSdkQuoteService({cloud,settings,now:()=>controls.now,clock:()=>controls.clock});
  const main=createQuoteCloudHandler({cloud,settings,getContext:invocation=>invocation,now:()=>controls.now,
    logger:{info(){},warn(){},error(){}}});
  return {f,native,settings,controls,cloud,service,main,records:()=>records,execute:()=>service().execute(f.event,native)};
}
test('quote SDK creates/replays/gets pickup and delivery snapshots atomically without reserving resources',async()=>{
  for(const mode of ['PICKUP','DELIVERY']){
    const h=harness(mode,true),before=clone(h.records()),created=await h.execute();
    assert.equal(created.scope,'CLOUD_QUOTE');assert.equal(created.checkoutAllowed,false);assert.equal(created.stockReserved,false);
    assert.equal(created.items[0].productImage.sourceKind,'DESIGN_PREVIEW');
    assert.equal(created.totalCents,2000);assert.equal(Object.keys(h.records().checkout_quotes).length,1);
    assert.equal(Object.keys(h.records().delivery_evaluations).length,mode==='DELIVERY'?1:0);
    assert.equal(Object.keys(h.records().idempotency_records).length,1);
    assert.equal(created.ownerId,undefined);assert.equal(created._transactionFence,undefined);
    for(const name of ['inventory_resources','slot_inventory','carts','products','users'])for(const [id,row]of Object.entries(h.records()[name])){
      const {_transactionFence,...business}=row;assert.equal(_transactionFence,1);assert.deepEqual(business,before[name][id]);
    }
    const first=clone(h.records()),replay=await h.execute();assert.deepEqual(replay,created);
    assert.equal(Object.keys(h.records().idempotency_records).length,1);
    for(const [name,table]of Object.entries(first))for(const [id,row]of Object.entries(table)){
      const actual=h.records()[name][id],{_transactionFence,...business}=actual;
      const {_transactionFence:old,...oldBusiness}=row;assert.deepEqual(business,oldBusiness);
      if(_transactionFence!==undefined)assert.equal(_transactionFence,(old??0)+1);
    }
    if(mode==='DELIVERY'){
      const proof=Object.values(h.records().location_verifications)[0];assert.equal(proof._transactionFence,2);
      const health=require('../cloudfunctions/_shared/store-cloud-handler').createStoreCloudHandler({
        getContext:()=>h.native,settings:{...h.settings,locationProofEnabled:true,locationProofId:proof._id},
        repository:{readLocationSnapshot:async()=>({store:h.records().stores[h.settings.storeId],proof})},
        now:()=>h.controls.now,logger:{info(){},warn(){},error(){}}});
      const beforeHealth=clone(h.records());
      assert.equal((await health({action:'health'})).data.storeLocationVerified,true);
      assert.deepEqual(h.records(),beforeHealth);
    }
    const beforeGet=clone(h.records()),result=await h.service().execute({action:'quote.get',payload:{quoteId:created.quoteId}},h.native);
    assert.deepEqual(result,created);assert.equal(h.controls.writes,0);assert.deepEqual(h.records(),beforeGet);
  }
});
test('quote every physical write failure or zero-row response rolls back all quote/trace/receipt and guard effects',async()=>{
  for(const mode of ['PICKUP','DELIVERY']){
    const sample=harness(mode);await sample.execute();const writes=sample.controls.writes;
    for(const kind of ['failAt','zeroAt'])for(let position=1;position<=writes;position++){
      const h=harness(mode),before=clone(h.records());h.controls[kind]=position;
      await assert.rejects(h.execute());assert.deepEqual(h.records(),before,mode+' '+kind+' '+position);
    }
  }
});
test('quote cloud native identity, request whitelist, closed switch and foreign owner gates',async()=>{
  const h=harness();
  const response=await h.main({...h.f.event,userInfo:{OPENID:'forged'},tcbContext:{OPENID:'forged'}},h.native);
  assert.equal(response.ok,true);assert.equal(response.data.scope,'CLOUD_QUOTE');
  const forged=await h.main({...h.f.event,payload:{...h.f.event.payload,totalCents:1}},h.native);
  assert.equal(forged.error.code,'INVALID_REQUEST');
  assert.equal((await h.main(h.f.event,{})).error.code,'AUTH_REQUIRED');
  h.settings.enabled=false;assert.equal((await h.main(h.f.event,h.native)).error.code,'CONFIGURATION_REQUIRED');
  h.settings.enabled=true;
  const id=response.data.quoteId,before=clone(h.records());h.records().checkout_quotes[id].ownerId='other';
  assert.equal((await h.main({action:'quote.get',payload:{quoteId:id}},h.native)).error.code,'NOT_FOUND');
  assert.equal(h.controls.reads.length,2,'reject foreign quote before following its references');
  h.records().checkout_quotes[id]=before.checkout_quotes[id];
});
test('reference images require development opt-in, approved matching published cloud assets; source survives snapshots',async()=>{
  for(const mutate of [h=>h.settings.allowReferenceImages=false,h=>h.settings.stage='production',h=>h.settings.stage='test',
    h=>Object.values(h.records().media_assets)[0].catalogApproved=false,h=>Object.values(h.records().media_assets)[0].status='DRAFT',
    h=>Object.values(h.records().media_assets)[0].storageRef='cloud://offline-test/substituted.png']){
    const h=harness('PICKUP',true);mutate(h);const before=clone(h.records());
    assert.equal((await h.main(h.f.event,h.native)).ok,false);assert.deepEqual(h.records(),before);
  }
});
test('quote rejects stale/missing configuration, forged location proof, expiry and same-key different request',async()=>{
  for(const mutate of [h=>Object.values(h.records().stores)[0].activeConfigId=null,
    h=>Object.values(h.records().store_config)[0].status='DRAFT',h=>Object.values(h.records().addresses)[0].detail='tampered',
    h=>Object.values(h.records().location_verifications)[0].entityVersion++]){
    const h=harness('DELIVERY');mutate(h);const before=clone(h.records());await assert.rejects(h.execute());assert.deepEqual(h.records(),before);
  }
  const h=harness();const result=await h.execute();const before=clone(h.records());
  h.f.event.payload.orderNote='different';await assert.rejects(h.execute(),{code:'IDEMPOTENCY_KEY_REUSED'});assert.deepEqual(h.records(),before);
  h.f.event.payload.orderNote='测试备注';h.controls.now=result.expiresAt;
  const expired=await h.main({action:'quote.get',payload:{quoteId:result.quoteId}},h.native);
  assert.equal(expired.error.code,'QUOTE_EXPIRED');assert.deepEqual(h.records(),before);
});
test('SDK retry reloads revoked user and changed price, and preflight refuses large payload before any write',async()=>{
  const disabled=harness(),before=clone(disabled.records());
  disabled.controls.beforeWrite=({records,attempt})=>{if(attempt===0)Object.values(records.users)[0].status='DISABLED';};
  await assert.rejects(disabled.execute(),{code:'USER_DISABLED'});
  assert.equal(disabled.controls.attempts,2);assert.deepEqual(disabled.records().checkout_quotes,{});
  assert.deepEqual(disabled.records().carts,before.carts);
  const changed=harness();changed.controls.beforeWrite=({records,attempt})=>{
    if(attempt===0){const sku=Object.values(records.skus)[0];sku.version=3;sku.unitPriceCents=1200;}
  };
  assert.equal((await changed.execute()).totalCents,2400);assert.equal(changed.controls.attempts,2);
  const large=harness();Object.values(large.records().products)[0].irrelevant='x'.repeat(65536);
  await assert.rejects(large.execute(),{code:'QUOTE_BUDGET_EXCEEDED'});assert.equal(large.controls.writes,0);
});
test('quote complete operation budget is admitted before guards and expiry after a write rolls back',async()=>{
  const h=harness(),data=h.records(),product=Object.values(data.products)[0],sku=Object.values(data.skus)[0],cart=Object.values(data.carts)[0];
  Object.values(data.store_config)[0].cartLimits.maxLines=60;Object.values(data.inventory_resources)[0].totalUnits=1000;
  const template=clone(cart.lines[0]);cart.lines=[];h.f.event.payload.lines=[];
  for(let i=0;i<31;i++){
    const p={...clone(product),_id:'budget-product-'+i},s={...clone(sku),_id:'budget-sku-'+i,productId:p._id};
    data.products[p._id]=p;data.skus[s._id]=s;
    cart.lines.push({...clone(template),lineId:'budget-line-'+i,productId:p._id,skuId:s._id,quantity:1});
    h.f.event.payload.lines.push({lineId:'budget-line-'+i,lineVersion:0});
  }
  const before=clone(data);await assert.rejects(h.execute(),{code:'QUOTE_BUDGET_EXCEEDED'});
  assert.equal(h.controls.writes,0);assert.deepEqual(h.records(),before);
  const expired=harness(),baseline=clone(expired.records());
  expired.controls.beforeWrite=()=>{expired.controls.now=expired.f.context.now+600000;};
  await assert.rejects(expired.execute(),{code:'QUOTE_EXPIRED'});assert.deepEqual(expired.records(),baseline);
});
test('checkout deployment entry loads only its self-contained SDK 4.0.2 dependency tree',()=>{
  const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
  const filename=path.resolve(__dirname,'../cloudfunctions/checkout/index.js'),localRequire=createRequire(filename),exports={};
  vm.runInThisContext('(function(require,exports,process){'+fs.readFileSync(filename,'utf8')+'\n})',{filename})(
    name=>name==='wx-server-sdk'?{init(){},DYNAMIC_CURRENT_ENV:'offline'}:localRequire(name),exports,{env:{}});
  assert.equal(typeof exports.main,'function');assert.equal(localRequire('./package.json').dependencies['wx-server-sdk'],'4.0.2');
  for(const name of fs.readdirSync(path.dirname(filename)+'/shared'))assert.equal(fs.readFileSync(path.dirname(filename)+'/shared/'+name,'utf8'),
    fs.readFileSync(path.resolve(__dirname,'../cloudfunctions/_shared',name),'utf8'),name+' candidate source drift');
});
test('real quote/order SDK compositions share one fulfillment-day quota and retain it across replay and another date',async()=>{
  const {quotaTemplate,newDailyResource}=require('../cloudfunctions/_shared/daily-quota');
  const {createSdkOrderService}=require('../cloudfunctions/_shared/order-sdk-session');
  const {createQuoteContextBuilder}=require('../cloudfunctions/_shared/quote-cloud-context');
  const {buildSlotDefinitions}=require('../cloudfunctions/_shared/fulfillment-model');
  const h=harness('PICKUP',true),data=h.records(),product=Object.values(data.products)[0],sku=Object.values(data.skus)[0],
    slot=Object.values(data.slot_inventory)[0],cart=Object.values(data.carts)[0],env=h.settings.environment;
  for(const name of ['orders','order_items','reservations','order_logs'])data[name]={};
  sku.stockRequirements=[quotaTemplate(env,h.settings.storeId,'CAKE')];cart.lines[0].quantity=1;
  Object.values(data.store_config)[0].paymentHoldMinutes=30;
  const stock=newDailyResource(env,h.settings.storeId,'CAKE',slot.serviceDate,h.controls.now);stock.heldUnits=14;
  data.inventory_resources={[stock._id]:stock};
  const quote=await h.execute();assert.equal(h.records().inventory_resources[stock._id].heldUnits,14,'quoting never reserves');
  const builder=createQuoteContextBuilder(h.settings,()=>h.controls.now);
  const service=createSdkOrderService({cloud:h.cloud,settings:h.settings,now:()=>h.controls.now,clock:()=>0,newRequestId:()=>'daily-quota-test',
    limits:{maxOperations:100,maxReadDocuments:80,maxWrites:80,maxPayloadBytes:65536,maxTotalPayloadBytes:1048576,maxAttempts:3,maxDurationMs:15000},
    buildContext:(tx,state,principal)=>builder(tx.readContextDocument,state,principal)});
  const event={action:'create',payload:{quoteId:quote.quoteId,expectedQuoteVersion:0,idempotencyKey:'daily-quota-order-key'}};
  assert.equal((await service.execute(event,h.native)).disposition,'CREATED');
  assert.equal(h.records().inventory_resources[stock._id].heldUnits,15);
  assert.equal((await service.execute(event,h.native)).disposition,'REPLAY');
  assert.equal(h.records().inventory_resources[stock._id].heldUnits,15);
  h.f.event.payload.idempotencyKey='next-quote-same-day';
  await assert.rejects(h.execute(),{code:'RESOURCE_UNAVAILABLE'});
  const store=Object.values(h.records().stores)[0],configuration=Object.values(h.records().store_config)[0],serviceDate='2026-10-07';
  const definition=buildSlotDefinitions({store,environment:env,now:h.controls.now,fulfillment:'PICKUP',serviceDate,
    timePolicy:configuration.timePolicy,productLeadTimes:[product.minLeadTimeMinutes]})[0];
  h.records().slot_inventory[definition._id]={...definition,version:0,status:'OPEN',heldUnits:0,confirmedUnits:0,consumedUnits:0};
  const tomorrow=newDailyResource(env,h.settings.storeId,'CAKE',serviceDate,h.controls.now);
  h.records().inventory_resources[tomorrow._id]=tomorrow;h.f.event.payload.slotId=definition._id;h.f.event.payload.idempotencyKey='next-day-quote-key';
  assert.equal((await h.execute()).totalCents,1000);assert.equal(h.records().inventory_resources[tomorrow._id].heldUnits,0);
  assert.equal(h.records().inventory_resources[stock._id].heldUnits,15);
});


test('native order handler consumes real pickup/delivery quotes once and rolls failed writes back',async()=>{
  const {createOrderCloudHandler}=require('../cloudfunctions/_shared/order-cloud-handler');
  for(const mode of ['PICKUP','DELIVERY']){
    const h=harness(mode,true);
    for(const name of ['orders','order_items','reservations','order_logs'])h.records()[name]={};
    Object.values(h.records().store_config)[0].paymentHoldMinutes=30;
    const quote=await h.execute(),before=clone(h.records());
    const main=createOrderCloudHandler({cloud:h.cloud,settings:h.settings,getContext:inv=>inv,
      now:()=>h.controls.now,logger:{info(){},warn(){},error(){}}});
    const event={action:'create',payload:{quoteId:quote.quoteId,expectedQuoteVersion:0,idempotencyKey:'native-order-'+mode}};
    h.controls.failAt=1;
    assert.equal((await main(event,h.native)).error.code,'INTERNAL_ERROR');assert.deepEqual(h.records(),before);
    h.controls.failAt=0;
    const first=await main(event,h.native);assert.equal(first.ok,true,JSON.stringify(first));
    assert.deepEqual(Object.keys(first.data).sort(),['entityId','errorCode','version']);
    assert.equal(Object.keys(h.records().orders).length,1);assert.equal(Object.keys(h.records().reservations).length,2);
    assert.equal(Object.keys(h.records().idempotency_records).length,2);
    assert.equal(Object.values(h.records().inventory_resources)[0].heldUnits,Object.values(before.inventory_resources)[0].heldUnits+2);
    assert.equal(Object.values(h.records().slot_inventory)[0].heldUnits,Object.values(before.slot_inventory)[0].heldUnits+1);
    const replay=await main(event,h.native);assert.deepEqual(replay.data,first.data);
    assert.equal(Object.keys(h.records().orders).length,1);
    assert.equal(Object.values(h.records().inventory_resources)[0].heldUnits,Object.values(before.inventory_resources)[0].heldUnits+2);
    const settled=clone(h.records());
    assert.equal((await main(event,{...h.native,OPENID:'other'})).error.code,'AUTH_REQUIRED');
    assert.deepEqual(h.records(),settled);
  }
});
