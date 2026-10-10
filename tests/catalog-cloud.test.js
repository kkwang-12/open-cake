'use strict';
// Offline contract/runtime fixtures only; these records are never database seeds or approved products.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createCatalogCloudHandler,createCloudCatalogRepository}=require('../cloudfunctions/_shared/catalog-cloud-handler');
const {createMediaDraft,projectMediaReference}=require('../cloudfunctions/_shared/media-model');
const {createCatalogClient}=require('../miniprogram/services/catalog');
const {createClient}=require('../miniprogram/services/cloud');
const {createProductDetailClient}=require('../miniprogram/services/product-detail');
const {createHomeCatalogClient}=require('../miniprogram/services/home-catalog');
const {catalog}=require('./fixtures/catalog');
const clone=value=>JSON.parse(JSON.stringify(value));
const native={OPENID:'offline-person',APPID:'wx-test',ENV:'offline-catalog'};
const settings={appId:'wx-test',environment:native.ENV,stage:'development',enabled:true,storeId:'offline-store',
  allowedCloudPrefixes:['cloud://offline-catalog/catalog/'],cursorKey:{id:'test-key',secret:Buffer.alloc(32,8)}};
const clientSettings={stage:'development',mode:'cloud',cloudEnvironments:{development:native.ENV},catalog:{
  enabled:true,storeId:settings.storeId,allowedCloudPrefixes:settings.allowedCloudPrefixes}};
function records(){
  const bytes=fs.readFileSync(path.join(__dirname,'../catalog-assets/development/catalog-example.png'));
  const asset={...createMediaDraft({assetId:'offline-photo',revision:'r1',storageRef:'cloud://offline-catalog/catalog/test.png',sourceKind:'REAL_PHOTO',mimeType:'image/png'},
    bytes,{...settings,now:1000,maxBytes:8*1024*1024}),status:'PUBLISHED'};
  const ref=projectMediaReference(asset,settings,'PUBLIC_CATALOG'),products=[],skus=[];
  for(const [sortOrder,code] of ['CAKE','MINI_CAKE','BREAD'].entries()){
    const sample=catalog(code);
    products.push({...sample.product,sortOrder,description:'Offline fixture only',images:[ref],privateNote:'PRIVATE_PRODUCT'});
    skus.push({...sample.skus[0],supplierCost:'PRIVATE_SKU'});
  }
  return {categories:['CAKE','MINI_CAKE','BREAD'].map((code,sortOrder)=>({_id:'category-'+code,code,published:true,sortOrder,nameZh:code,nameEn:code})),
    products,skus,mediaAssets:[asset]};
}
function harness(overrides={}){
  let reads=0;const logs=[];
  const handler=createCatalogCloudHandler({settings,getContext:()=>native,now:()=>2000,
    repository:{async readSnapshot(){reads++;return records();}},logger:{info:v=>logs.push(v),warn:v=>logs.push(v),error:v=>logs.push(v)},...overrides});
  return {handler,reads:()=>reads,logs};
}
test('catalog native identity, stage, environment, capabilities and actions reject before database reads',async()=>{
  for(const [change,code] of [
    [{getContext:()=>({})},'AUTH_REQUIRED'],[{getContext:()=>({...native,APPID:'other'})},'APP_MISMATCH'],
    [{getContext:()=>({...native,ENV:'other'})},'ENV_MISMATCH'],[{settings:{...settings,stage:'invalid'}},'INVALID_CONFIGURATION'],
    [{settings:{...settings,enabled:false}},'CONFIGURATION_REQUIRED'],[{settings:{...settings,cursorKey:{id:'x',secret:Buffer.alloc(1)}}},'CONFIGURATION_REQUIRED']
  ]){
    const value=harness(change),response=await value.handler({action:'products.list',payload:{storeId:settings.storeId},openid:native.OPENID});
    assert.equal(response.error.code,code);assert.equal(value.reads(),0);
  }
  const value=harness();
  for(const action of ['create','admin.products.update','payment.simulate','__unsupported__']){
    assert.equal((await value.handler({action,payload:{}})).error.code,'INVALID_REQUEST');
  }
  assert.equal(value.reads(),0);
});
test('catalog input rejects cross-store, forged identity/price fields and malformed paging before querying',async()=>{
  const value=harness();
  for(const payload of [{storeId:settings.storeId,ownerId:'other'},{storeId:settings.storeId,price:1},{storeId:settings.storeId,pageSize:51},
    {storeId:settings.storeId,search:'\ud800'},{storeId:settings.storeId,cursor:''},{storeId:settings.storeId,search:'a'.repeat(65)}]){
    assert.equal((await value.handler({action:'products.list',payload})).error.code,'INVALID_REQUEST');
  }
  assert.equal((await value.handler({action:'products.list',payload:{storeId:'other'}})).error.code,'NOT_FOUND');
  assert.equal((await value.handler({action:'categories.list',payload:{storeId:'other'}})).error.code,'INVALID_REQUEST');
  assert.equal((await value.handler({action:'product.get',payload:{productId:'x',role:'ADMIN'}})).error.code,'INVALID_REQUEST');
  assert.equal(value.reads(),0);
});
test('catalog uses existing public projections and signed pagination without inventory, native identities or private metadata',async()=>{
  const value=harness(),query={storeId:settings.storeId,pageSize:2};
  const first=await value.handler({action:'products.list',payload:query}),last=await value.handler({action:'products.list',payload:{...query,cursor:first.data.nextCursor}});
  assert.equal(first.ok,true);assert.equal(first.data.items.length,2);assert.equal(last.data.items.length,1);assert.equal(last.data.nextCursor,null);
  assert.equal(new Set([...first.data.items,...last.data.items].map(item=>item.productId)).size,3);
  const categories=await value.handler({action:'categories.list'}),detail=await value.handler({action:'product.get',payload:{productId:'offline-product-CAKE'}});
  assert.equal(categories.data.items.length,3);assert.equal(detail.data.skus.length,1);
  const serialized=JSON.stringify([first,last,detail,value.logs]);
  for(const privateValue of ['PRIVATE_PRODUCT','PRIVATE_SKU','stockRequirements',native.OPENID,'cursorKey'])assert(!serialized.includes(privateValue));
  assert.equal((await value.handler({action:'products.list',payload:{...query,cursor:first.data.nextCursor+'x'}})).error.code,'CURSOR_INVALID');
});
test('catalog stale cursor rejects changed public data, missing/off-sale product is unavailable, provider errors remain redacted',async()=>{
  let data=records();const value=harness({repository:{readSnapshot:async()=>data}}),query={storeId:settings.storeId,pageSize:1};
  const first=await value.handler({action:'products.list',payload:query});
  data=clone(data);data.products[0].name='Changed offline title';
  assert.equal((await value.handler({action:'products.list',payload:{...query,cursor:first.data.nextCursor}})).error.code,'CURSOR_INVALID');
  data.products[0].status='OFF_SALE';
  assert.equal((await value.handler({action:'product.get',payload:{productId:data.products[0]._id}})).error.code,'PRODUCT_UNAVAILABLE');
  const failed=harness({repository:{readSnapshot:async()=>{throw new Error('SECRET_ACCESS_TOKEN');}}});
  const response=await failed.handler({action:'categories.list'});
  assert.equal(response.error.code,'INTERNAL_ERROR');assert(!JSON.stringify([response,failed.logs]).includes('SECRET_ACCESS_TOKEN'));
});
function database(data,change={}){
  const queries=[];let transactions=0;
  return {queries,count:()=>transactions,runTransaction:async(callback,retries)=>{
    transactions++;assert.equal(retries,2);
    const source=clone(data);
    const transaction={collection(name){
      let filter,offset,size,order;
      const query={where(value){filter=value;return this;},orderBy(field,direction){order=[field,direction];return this;},
        skip(value){offset=value;return this;},limit(value){size=value;return this;},async get(){
          queries.push({name,filter,offset,size,order});
          let rows=(source[name]||[]).filter(row=>Object.entries(filter).every(([field,value])=>row[field]===value)).sort((a,b)=>a._id.localeCompare(b._id));
          if(change.get) return change.get({name,rows,offset,size});
          return {data:rows.slice(offset,offset+size)};
        }};return query;
    }};
    return callback(transaction);
  }};
}
function databaseRecords(){const data=records();return {...data,media_assets:data.mediaAssets};}
test('catalog SDK repository reads one transaction snapshot, filters store/public state and detects truncation instead of showing partial catalog',async()=>{
  const db=database(databaseRecords()),repo=createCloudCatalogRepository(db,settings.storeId);
  assert.equal((await repo.readSnapshot()).products.length,3);assert.equal(db.count(),1);
  assert.deepEqual(db.queries.map(query=>query.name),['categories','products','skus','media_assets']);
  assert.ok(db.queries.every(query=>query.size<=100&&query.order.join(',')==='_id,asc'));
  assert.equal(db.queries[1].filter.storeId,settings.storeId);assert.equal(db.queries[2].filter.storeId,settings.storeId);
  const overflow=databaseRecords();overflow.products=Array.from({length:101},(_,index)=>({...overflow.products[0],_id:'p-'+String(index).padStart(3,'0')}));
  const over=database(overflow);
  await assert.rejects(createCloudCatalogRepository(over,settings.storeId).readSnapshot(),error=>error.code==='CONFIGURATION_REQUIRED');
  assert.equal(over.queries.filter(query=>query.name==='products').length,2);
});
test('catalog SDK repository refuses duplicated/malformed responses and payloads beyond resource budget',async()=>{
  for(const response of [{data:null},{data:[{_id:'duplicate'},{_id:'duplicate'}]}]){
    await assert.rejects(createCloudCatalogRepository(database(databaseRecords(),{get:()=>response}),settings.storeId).readSnapshot(),error=>error.code==='INTERNAL_ERROR');
  }
  const data=databaseRecords();data.products[0].privateNote='x'.repeat(2*1024*1024);
  await assert.rejects(createCloudCatalogRepository(database(data),settings.storeId).readSnapshot(),error=>error.code==='CONFIGURATION_REQUIRED');
});
function connected(overrides={}){
  const value=harness(overrides),calls=[],transport=createClient(clientSettings,()=>({cloud:{init(){},async callFunction(request){
    calls.push(request);return {result:await value.handler(request.data)};
  }}}),{warn(){}});
  return {value,calls,client:createCatalogClient(clientSettings,undefined,transport)};
}
test('cloud catalog feeds Home, Shop and product detail through native transport while keeping add/purchase unavailable',async()=>{
  const value=connected(),page=await value.client.list({pageSize:2}),home=await createHomeCatalogClient(value.client).get();
  assert.equal(page.source,'PUBLIC_CATALOG');assert.equal(home.source,'PUBLIC_CATALOG');assert.equal(home.products.length,3);
  assert.ok(page.items.every(item=>item.image.startsWith('cloud://')&&item.canPurchase===false));
  const detail=await createProductDetailClient(clientSettings,value.client).get(page.items[0].id);
  assert.equal(detail.source,'PUBLIC_CATALOG');assert.equal(detail.canConfigure,false);assert.equal(detail.canPurchase,false);assert.equal(detail.variantLabels.length,1);
  assert.equal(detail.images[0].src,page.items[0].image);assert.equal(detail.configuration,undefined);
  assert.ok(value.calls.every(call=>call.name==='catalog'&&call.config.env===native.ENV));
  assert.equal(value.calls[0].data.payload.storeId,settings.storeId);
});
test('cloud catalog closed capability, unavailable cloud and empty real catalog never fall back to development samples',async()=>{
  let calls=0;const transport={async call(){calls++;throw new Error('network failure');}};
  await assert.rejects(createCatalogClient({...clientSettings,catalog:{...clientSettings.catalog,enabled:false}},undefined,transport).list(),error=>error.code==='CLOUD_NOT_CONFIGURED');
  assert.equal(calls,0);
  await assert.rejects(createCatalogClient(clientSettings,undefined,transport).list());assert.equal(calls,1);
  const empty=connected({repository:{readSnapshot:async()=>({categories:[],products:[],skus:[],mediaAssets:[]})}});
  assert.deepEqual((await empty.client.list()).items,[]);
  assert.equal((await createHomeCatalogClient(empty.client).get()).products.length,0);
  await assert.rejects(empty.client.get('offline-product-CAKE'),error=>error.code==='PRODUCT_UNAVAILABLE');
});
test('cloud catalog refuses private media/invalid prices/duplicate cards and forged details instead of projecting them',async()=>{
  const response=await harness().handler({action:'products.list',payload:{storeId:settings.storeId}});
  for(const mutate of [page=>{page.items[0].cover.storageRef='cloud://other/private/image.png';},page=>{page.items[0].minPriceCents=-1;},
    page=>{page.items.push(page.items[0]);},page=>{page.apiVersion='unknown';}]){
    const page=clone(response.data);mutate(page);
    await assert.rejects(createCatalogClient(clientSettings,undefined,{call:async()=>({data:page})}).list(),error=>error.code==='INVALID_RESPONSE');
  }
  const result=await harness().handler({action:'product.get',payload:{productId:'offline-product-CAKE'}});
  const detail=clone(result.data);detail.skus[0].unitPriceCents=1;
  await assert.rejects(createCatalogClient(clientSettings,undefined,{call:async()=>({data:detail})}).get(detail.productId),error=>error.code==='INVALID_RESPONSE');
});
test('client only accepts the three catalog reads, rejects admin/order/payment writes and checks capability before wx calls',async()=>{
  let calls=0;
  const client=createClient(clientSettings,()=>({cloud:{init(){calls++;},callFunction(){calls++;}}}),{warn(){}});
  for(const [domain,action] of [['catalog','create'],['catalog','admin.products.update'],['order','create'],['payment','simulate'],['admin','products.list']]){
    await assert.rejects(client.call(domain,action),error=>error.code==='INVALID_REQUEST');
  }
  const closed=createClient({...clientSettings,catalog:undefined},()=>({cloud:{init(){calls++;}}}),{warn(){}});
  await assert.rejects(closed.call('catalog','products.list'),error=>error.code==='CLOUD_NOT_CONFIGURED');assert.equal(calls,0);
});
test('self-contained catalog entry reads configuration server-side and never accepts event native identity',async()=>{
  const db=database(databaseRecords()),sdk={DYNAMIC_CURRENT_ENV:'dynamic',init(){},database:()=>db,getWXContext:()=>native};
  const sandbox={exports:{},Buffer,process:{env:{JJL_APP_ID:settings.appId,JJL_CLOUD_ENV:settings.environment,JJL_STAGE:'development',
    JJL_CATALOG_READ_ENABLED:'true',JJL_CATALOG_STORE_ID:settings.storeId,JJL_CATALOG_MEDIA_PREFIXES:JSON.stringify(settings.allowedCloudPrefixes),
    JJL_CATALOG_CURSOR_SECRET:settings.cursorKey.secret.toString('base64')}},require:name=>name==='wx-server-sdk'?sdk:require('../cloudfunctions/catalog/'+name)};
  // Node modules share a realm; execute the actual entry with injected SDK/env in that same realm.
  new Function('exports','require','process','Buffer',fs.readFileSync(path.join(__dirname,'../cloudfunctions/catalog/index.js'),'utf8'))(
    sandbox.exports,sandbox.require,sandbox.process,Buffer);
  const invocation={environment:JSON.stringify({WX_OPENID:native.OPENID,WX_APPID:native.APPID}),namespace:native.ENV,request_id:'test-invocation'};
  const response=await sandbox.exports.main({action:'product.get',payload:{productId:'offline-product-CAKE'},OPENID:'forged'},invocation);
  assert.equal(response.ok,true,JSON.stringify(response.error));assert.equal(response.data.productId,'offline-product-CAKE');
  const forged=await sandbox.exports.main({action:'categories.list',OPENID:native.OPENID,APPID:native.APPID,ENV:native.ENV});
  assert.equal(forged.error.code,'AUTH_REQUIRED');assert.equal(db.count(),1);
});
