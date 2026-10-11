'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {buildInitialCatalogPlan,ENVIRONMENT,STORE_ID}=require('../scripts/plan-initial-catalog');
const adopted=require('../catalog-assets/initial-20261010/catalog');
const {createCatalogReadModel}=require('../cloudfunctions/_shared/catalog-read-model');
const {resolveSku}=require('../cloudfunctions/_shared/catalog-model');
const bytes=fs.readFileSync(path.join(__dirname,'../catalog-assets/development/catalog-example.png'));
// Original bytes are used only as an offline byte-validation fixture, never as final independent product images.
const images=()=>adopted.products.map(p=>({key:p.key,bytes}));
test('initial adopted catalog candidate has exact development/create-only budget, readable prices and closed purchase policies',()=>{
  const plan=buildInitialCatalogPlan(images(),1000),d=plan.documents;
  assert.equal(plan.environment,ENVIRONMENT);assert.equal(plan.storeId,STORE_ID);
  assert.deepEqual(plan.budget,{categories:3,products:9,skus:15,media_assets:9,totalDocuments:36,uploads:9});
  assert.equal(new Set(Object.values(d).flat().map(x=>x._id)).size,36);
  assert.deepEqual([...new Set(d.products.map(p=>p.categoryCode))],['CAKE','MINI_CAKE','BREAD']);
  assert.deepEqual(d.skus.filter(s=>s.productId==='g1-initial-strawberry-cake').map(s=>s.unitPriceCents),[16800,23800,32800]);
  assert.equal(d.products.find(p=>p._id==='g1-initial-croissant').name,'牛角面包');
  const context={environment:ENVIRONMENT,storeId:STORE_ID,stage:'development',allowReferenceImages:true,allowedCloudPrefixes:plan.allowedCloudPrefixes};
  const reader=createCatalogReadModel({categories:d.categories,products:d.products,skus:d.skus,mediaAssets:d.media_assets},context,{id:'offline',secret:Buffer.alloc(32)});
  assert.equal(reader.productsList({storeId:STORE_ID},1000).items.length,9);
  for(const product of d.products){
    const skus=d.skus.filter(s=>s.productId===product._id);
    assert.equal(reader.productGet({productId:product._id}).cover.sourceKind,'DESIGN_PREVIEW');
    assert.throws(()=>resolveSku(product,skus,skus[0].selectedOptions,skus[0]._id),e=>e.code==='CONFIGURATION_REQUIRED');
  }
  assert.ok(d.media_assets.every(a=>a.catalogApproved&&a.sourceKind==='DESIGN_PREVIEW'));
  assert.equal(d.products[0].messageSupport,'PENDING_LIMIT');
  assert.equal(require('../catalog-assets/development/catalog-example').purpose,'TEMPORARY_DEVELOPMENT_EXAMPLE');
});
test('initial candidate rejects missing, duplicate, unrelated or invalid image bytes instead of partial import',()=>{
  for(const change of [v=>v.pop(),v=>v[1]=v[0],v=>v[0].key='unknown',v=>v[0].bytes=Buffer.from('not an image')]){
    const value=images();change(value);assert.throws(()=>buildInitialCatalogPlan(value,1000));
  }
});
test('candidate storage policy permits only exact reference files to non-anonymous readers, preserves private owner reads and denies client writes',()=>{
  const plan=buildInitialCatalogPlan(images(),1000),rule=plan.storageRule;
  const read=new Function('auth','resource','return '+rule.read);
  assert.equal(rule.write,false);
  for(const upload of plan.uploads){
    const resource={path:upload.cloudPath,openid:null};
    assert.equal(read({openid:'native-user',loginType:'WECHAT'},resource),true);
    assert.equal(read({uid:'anonymous',loginType:'ANONYMOUS'},resource),false);
    assert.equal(read(null,resource),false);
    assert.equal(read({openid:'native-user',loginType:'WECHAT'},{...resource,path:resource.path+'.other'}),false);
  }
  assert.equal(read({openid:'owner',loginType:'WECHAT'},{path:'private/old.png',openid:'owner'}),true);
  assert.equal(read({openid:'stranger',loginType:'WECHAT'},{path:'private/old.png',openid:'owner'}),false);
});


test('adopted nine-product catalog reaches client list and details with unknown buying limits still closed',async()=>{
  const {createCatalogCloudHandler}=require('../cloudfunctions/_shared/catalog-cloud-handler');
  const {createCatalogClient}=require('../miniprogram/services/catalog');
  const {createHomeCatalogClient}=require('../miniprogram/services/home-catalog');
  const plan=buildInitialCatalogPlan(images(),1000),d=plan.documents;
  const settings={appId:'offline-adopted-app',environment:ENVIRONMENT,stage:'development',enabled:true,
    storeId:STORE_ID,allowReferenceImages:true,allowedCloudPrefixes:plan.allowedCloudPrefixes,
    cursorKey:{id:'offline-adopted',secret:Buffer.alloc(32,7)}};
  const handler=createCatalogCloudHandler({settings,now:()=>2000,
    getContext:()=>({APPID:settings.appId,ENV:ENVIRONMENT,OPENID:'offline-adopted-user'}),
    repository:{readSnapshot:async()=>({categories:d.categories,products:d.products,skus:d.skus,mediaAssets:d.media_assets})},
    logger:{info(){},warn(){},error(){}}});
  const transport={call:async(domain,action,payload)=>{assert.equal(domain,'catalog');return handler({action,payload});}};
  const clientSettings={mode:'cloud',stage:'development',cloudEnvironments:{development:ENVIRONMENT},catalog:{
    enabled:true,storeId:STORE_ID,allowReferenceImages:true,allowedCloudPrefixes:plan.allowedCloudPrefixes}};
  const client=createCatalogClient(clientSettings,undefined,transport),cards=[];
  let cursor=null;
  do{const page=await client.list({pageSize:4,cursor});cards.push(...page.items);cursor=page.nextCursor;}while(cursor);
  assert.equal(cards.length,9);assert.equal(new Set(cards.map(c=>c.id)).size,9);
  assert.deepEqual(cards.map(c=>c.id),d.products.map(p=>p._id));
  for(const card of cards){
    const detail=await client.get(card.id),variants=d.skus.filter(s=>s.productId===card.id);
    assert.equal(card.canPurchase,false);assert.equal(detail.canPurchase,false);assert.equal(detail.canConfigure,false);
    assert.equal(detail.images[0].src,card.image);assert.ok(detail.description.includes('AI 参考'));
    assert.deepEqual(detail.variantLabels.map(v=>v.skuId).sort(),variants.map(v=>v._id).sort());
  }
  const home=await createHomeCatalogClient(client).get();
  assert.equal(home.source,'PUBLIC_CATALOG');assert.deepEqual(home.products.map(p=>p.categoryCode),['CAKE','MINI_CAKE','BREAD']);
  await assert.rejects(createCatalogClient({...clientSettings,catalog:{...clientSettings.catalog,allowedCloudPrefixes:[]}},undefined,transport).list(),e=>e.code==='INVALID_RESPONSE');
});
