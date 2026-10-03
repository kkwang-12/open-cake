'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {createCatalogReadModel}=require('../cloudfunctions/_shared/catalog-read-model');
const {createMediaDraft,projectMediaReference}=require('../cloudfunctions/_shared/media-model');
const {catalog}=require('./fixtures/catalog');
const context={environment:'offline-c02',storeId:'offline-store',stage:'development',allowedCloudPrefixes:['cloud://offline-c02/catalog/']};
const key={id:'offline-only-key',secret:Buffer.alloc(32,7)};
const clone=value=>JSON.parse(JSON.stringify(value));
const bytes=fs.readFileSync(path.join(__dirname,'../catalog-assets/development/catalog-example.png'));
function records(){
  const asset={...createMediaDraft({assetId:'offline-real-photo-fixture',revision:'r1',
    storageRef:'cloud://offline-c02/catalog/test-only.png',sourceKind:'REAL_PHOTO',mimeType:'image/png'},
    bytes,{...context,now:1000,maxBytes:8*1024*1024}),status:'PUBLISHED'};
  const cover=projectMediaReference(asset,context,'PUBLIC_CATALOG');
  const products=[],skus=[];
  for(let i=0;i<9;i++){
    const code=['CAKE','MINI_CAKE','BREAD'][i%3],sample=catalog(code);
    const product={...sample.product,_id:'product-'+i,sortOrder:Math.floor(i/3),name:'Only offline fixture '+code,description:'only offline fixture',
      images:[clone(cover)],privateAdminNote:'DO_NOT_LEAK_PRODUCT'};
    const sku={...sample.skus[0],_id:'sku-'+i,productId:product._id,unitPriceCents:1000+i*100};
    products.push(product);skus.push(sku);
  }
  return {categories:['CAKE','MINI_CAKE','BREAD'].map((code,sortOrder)=>({
    code,nameZh:code,nameEn:code,published:true,sortOrder,private:'DO_NOT_LEAK_CATEGORY'})),products,skus,mediaAssets:[asset]};
}
const reader=(value=records(),configuration=context,secret=key)=>createCatalogReadModel(value,configuration,secret);
const query=(change={})=>({storeId:context.storeId,...change});
const rejects=(run,code)=>assert.throws(run,error=>error.code===code);
test('C02 formal projections contain only categories and public card whitelist, not private inventory/material data',()=>{
  const model=reader(),categories=model.categoriesList();
  assert.equal(categories.apiVersion,'v1-api-2026-10-03');assert.equal(categories.items.length,3);
  assert.deepEqual(Object.keys(categories.items[0]).sort(),['code','nameEn','nameZh','sortOrder']);
  const page=model.productsList(query(),1000);assert.equal(page.items.length,9);
  assert.deepEqual(Object.keys(page.items[0]).sort(),['categoryCode','cover','currency','description','minPriceCents','name','productId','version']);
  assert.deepEqual(Object.keys(page.items[0].cover).sort(),['assetId','revision','sourceKind','storageRef']);
  assert.ok(!/DO_NOT_LEAK|stockRequirements|contentHash|retainedUntil|schemaVersion/.test(JSON.stringify(page)));
});
test('C02 All excludes other stores/categories, drafts/off-sale/archive, no valid SKU and hidden categories',()=>{
  for(const mutate of [
    value=>value.products[0].storeId='another-store',
    value=>value.products[0].status='DRAFT',
    value=>value.products[0].status='OFF_SALE',
    value=>value.products[0].status='ARCHIVED',
    value=>value.products[0].categoryCode='DRINKS',
    value=>value.skus[0].status='OFF_SALE',
    value=>value.skus[0].unitPriceCents=null,
    value=>value.skus[0].maxQuantity=null,
    value=>value.skus[0].stockRequirements=[],
    value=>value.skus[0].selectedOptions=[null]
  ]){const value=records();mutate(value);assert.ok(!reader(value).productsList(query(),1000).items.some(item=>item.productId==='product-0'));}
  const value=records();value.categories[0].published=false;
  assert.equal(reader(value).productsList(query(),1000).items.length,6);
});
test('C02 price starts at lowest valid ON_SALE SKU, not cheaper drafts or incomplete configurations',()=>{
  const value=records(),p=value.products[0],original=value.skus[0];
  const alternative={...clone(original),_id:'alternative',unitPriceCents:500,
    selectedOptions:original.selectedOptions.map(option=>({...option,optionCode:option.groupCode==='SIZE'?'LARGE':option.optionCode}))};
  value.skus.push(alternative);
  assert.equal(reader(value).productsList(query(),1000).items[0].minPriceCents,500);
  alternative.status='DRAFT';
  assert.equal(reader(value).productsList(query(),1000).items[0].minPriceCents,1000);
  alternative.status='ON_SALE';alternative.minQuantity=null;
  assert.equal(reader(value).productsList(query(),1000).items[0].minPriceCents,1000);
  assert.equal(p.status,'ON_SALE');
});
test('C02 formal cover requires exact registered PUBLISHED real-photo version in configured cloud storage',()=>{
  for(const mutate of [
    value=>value.mediaAssets[0].status='DRAFT',
    value=>value.mediaAssets[0].status='RETIRED',
    value=>value.mediaAssets[0].sourceKind='DESIGN_PREVIEW',
    value=>value.products[0].images[0].revision='missing',
    value=>value.products[0].images[0].storageRef='https://external.example/private',
    value=>value.products[0].images=[],
    value=>value.products[0].images[0].extra='private'
  ]){const value=records();mutate(value);assert.ok(!reader(value).productsList(query(),1000).items.some(item=>item.productId==='product-0'));}
});
test('C02 seek pagination across ties gives every item once; page-size changes preserve the anchor',()=>{
  const model=reader();let cursor=null,all=[];
  do{
    const page=model.productsList(query({cursor,pageSize:all.length?3:2}),1000);
    all.push(...page.items.map(item=>item.productId));cursor=page.nextCursor;
    assert.equal(page.hasMore,cursor!==null);
  }while(cursor);
  assert.deepEqual(all,['product-0','product-1','product-2','product-3','product-4','product-5','product-6','product-7','product-8']);
  assert.equal(new Set(all).size,9);
});
test('C02 category/name normalization, empty list and request schema do not introduce filters or unsafe regex',()=>{
  const model=reader();
  assert.ok(model.productsList(query({categoryCode:'BREAD'}),1000).items.every(item=>item.categoryCode==='BREAD'));
  assert.equal(model.productsList(query({search:'  offline fixture CAKE  '}),1000).items.length,3);
  assert.equal(model.productsList(query({search:'.*'}),1000).items.length,0);
  const empty=model.productsList(query({search:'no such item'}),1000);assert.equal(empty.nextCursor,null);assert.equal(empty.hasMore,false);
  for(const change of [{categoryCode:'DRINKS'},{sort:'price'},{filter:'sale'},{search:'a'.repeat(65)},{search:'\uD800'},{pageSize:51}])
    assert.throws(()=>model.productsList(query(change),1000));
  rejects(()=>model.productsList(query({storeId:'another-store'}),1000),'NOT_FOUND');
});
test('C02 signed cursor binds store/environment/query/current public snapshot and rejects tampering/expiration',()=>{
  const data=records(),model=reader(data),cursor=model.productsList(query({pageSize:2}),1000).nextCursor;
  rejects(()=>model.productsList(query({cursor,search:'fixture'}),1000),'CURSOR_INVALID');
  rejects(()=>model.productsList(query({cursor,categoryCode:'CAKE'}),1000),'CURSOR_INVALID');
  rejects(()=>model.productsList(query({cursor:cursor.slice(0,-1)+'!'}),1000),'CURSOR_INVALID');
  rejects(()=>model.productsList(query({cursor}),901000),'CURSOR_EXPIRED');
  rejects(()=>reader(data,{...context,environment:'another-env'}).productsList(query({cursor}),1000),'CURSOR_INVALID');
  data.products[0].sortOrder=10;
  rejects(()=>reader(data).productsList(query({cursor}),1000),'CURSOR_INVALID');
  // Existing reader holds the original consistent snapshot; it never sees caller mutations.
  assert.equal(model.productsList(query({cursor}),1000).items[0].productId,'product-2');
});
test('C02 record/key snapshots are isolated and results frozen; duplicate IDs/material versions/configuration fail closed',()=>{
  const data=records(),secret={id:'copy-only',secret:Buffer.alloc(32,9)},model=reader(data,context,secret);
  const cursor=model.productsList(query({pageSize:2}),1000).nextCursor;secret.secret.fill(0);
  assert.equal(model.productsList(query({cursor}),1000).items.length,7);
  const result=model.productsList(query(),1000);assert.ok(Object.isFrozen(result.items[0].cover));
  assert.throws(()=>{result.items[0].name='change';},TypeError);
  for(const field of ['products','skus','mediaAssets']){const duplicate=records();duplicate[field].push(clone(duplicate[field][0]));rejects(()=>reader(duplicate),'INVALID_CATALOG_SNAPSHOT');}
  rejects(()=>reader(records(),{...context,allowedCloudPrefixes:['https://bad/']}),'INVALID_CATALOG_READ_CONFIGURATION');
  rejects(()=>reader(records(),context,{id:'short',secret:Buffer.alloc(1)}),'INVALID_CATALOG_READ_CONFIGURATION');
});
test('C02 C01 development drafts never enter formal public products or categories',()=>{
  const {buildCatalogDraftPlan}=require('../cloudfunctions/_shared/catalog-draft-model');
  const example=require('../catalog-assets/development/catalog-example');
  const plan=buildCatalogDraftPlan(example,[],{stage:'development',environment:'offline-c02',expectedDevelopmentEnvironment:'offline-c02',
    productionEnvironments:[],namespace:'dev-example'},1000);
  const data={categories:plan.categories,products:plan.operations.filter(item=>item.collection==='products').map(item=>item.document),
    skus:plan.operations.filter(item=>item.collection==='skus').map(item=>item.document),mediaAssets:[]};
  const model=reader(data,{...context,storeId:plan.storeId});
  assert.deepEqual(model.categoriesList().items,[]);
  assert.deepEqual(model.productsList({storeId:plan.storeId},1000).items,[]);
});
test('C03 product detail whitelists configured groups, policy and SKU fields without inventory/admin facts',()=>{
  const value=records(),product=value.products[0];
  product.optionGroups[0].private='DO_NOT_LEAK_GROUP';product.optionGroups[0].options[0].private='DO_NOT_LEAK_OPTION';
  product.messagePolicy.private='DO_NOT_LEAK_POLICY';
  const detail=reader(value).productGet({productId:product._id});
  assert.deepEqual(Object.keys(detail).sort(),['apiVersion','productId','version','categoryCode','name','description','cover','minPriceCents','currency','images','optionGroups','messagePolicy','minLeadTimeMinutes','skus'].sort());
  assert.deepEqual(Object.keys(detail.skus[0]).sort(),['skuId','version','description','selectedOptions','unitPriceCents','currency','minQuantity','maxQuantity'].sort());
  assert.deepEqual(Object.keys(detail.optionGroups[0]).sort(),['groupCode','label','options','required']);
  assert.deepEqual(Object.keys(detail.optionGroups[0].options[0]).sort(),['label','optionCode']);
  assert.deepEqual(Object.keys(detail.messagePolicy).sort(),['maxLength','normalizationVersion']);
  assert.ok(!/DO_NOT_LEAK|stockRequirements|resourceId|contentHash|storeId|status/.test(JSON.stringify(detail)));
});
test('C03 hidden, cross-store, incomplete and unknown details share unavailable; malformed requests reject',()=>{
  for(const mutate of [
    value=>value.products[0].storeId='another-store',value=>value.products[0].status='DRAFT',
    value=>value.products[0].status='OFF_SALE',value=>value.categories[0].published=false,
    value=>value.skus[0].status='OFF_SALE',value=>value.skus[0].maxQuantity=null,
    value=>value.products[0].minLeadTimeMinutes=null,value=>value.mediaAssets[0].sourceKind='DESIGN_PREVIEW'
  ]){const value=records();mutate(value);rejects(()=>reader(value).productGet({productId:'product-0'}),'PRODUCT_UNAVAILABLE');}
  rejects(()=>reader().productGet({productId:'unknown'}),'PRODUCT_UNAVAILABLE');
  for(const input of [null,{}, {productId:''},{productId:'../secret'},{productId:'product-0',includeDraft:true}])
    rejects(()=>reader().productGet(input),'INVALID_REQUEST');
});
test('C03 gallery keeps exact published real-photo revisions once in configured order',()=>{
  const value=records(),first=value.mediaAssets[0];
  const second={...createMediaDraft({assetId:first.assetId,revision:'r2',storageRef:'cloud://offline-c02/catalog/test-only-r2.png',sourceKind:'REAL_PHOTO',mimeType:'image/png'},bytes,{...context,now:1000,maxBytes:8*1024*1024}),status:'PUBLISHED'};
  const retired={...clone(first),revision:'retired',status:'RETIRED'};
  const design={...clone(first),revision:'design',sourceKind:'DESIGN_PREVIEW'};
  value.mediaAssets.push(second,retired,design);
  const ref=asset=>({assetId:asset.assetId,revision:asset.revision,storageRef:asset.storageRef,sourceKind:asset.sourceKind});
  value.products[0].images=[ref(second),ref(first),ref(second),ref(retired),ref(design),{...ref(first),revision:'missing'},{...ref(first),extra:'private'}];
  const detail=reader(value).productGet({productId:'product-0'});
  assert.deepEqual(detail.images.map(item=>item.revision),['r2','r1']);assert.deepEqual(detail.cover,ref(second));
});
test('C03 only complete on-sale SKUs set detail price and quantity; labels come from current configuration',()=>{
  const value=records(),original=value.skus[0];
  const alternative={...clone(original),_id:'alternative',unitPriceCents:500,minQuantity:2,maxQuantity:3,
    selectedOptions:original.selectedOptions.map(option=>({...option,label:'untrusted label',optionCode:option.groupCode==='SIZE'?'LARGE':option.optionCode}))};
  value.skus.push(alternative);
  const model=reader(value),detail=model.productGet({productId:'product-0'});
  assert.deepEqual(detail.skus.map(sku=>sku.skuId),['alternative','sku-0']);
  assert.equal(detail.minPriceCents,model.productsList(query(),1000).items[0].minPriceCents);
  assert.equal(detail.skus[0].unitPriceCents,500);assert.equal(detail.skus[0].maxQuantity,3);
  assert.equal(detail.skus[0].selectedOptions[0].label,value.products[0].optionGroups[0].options[1].label);
  alternative.status='DRAFT';assert.equal(reader(value).productGet({productId:'product-0'}).skus.length,1);
  alternative.status='ON_SALE';alternative.minQuantity=null;
  assert.equal(reader(value).productGet({productId:'product-0'}).minPriceCents,1000);
});
test('C03 frozen isolated formal detail round-trips client combinations to D03 authoritative SKU facts',()=>{
  const {createSpecificationModel}=require('../miniprogram/utils/specification-model');
  const {resolveSku}=require('../cloudfunctions/_shared/catalog-model');
  const value=records(),model=reader(value);
  for(let i=0;i<3;i++){
    const detail=model.productGet({productId:'product-'+i}),client=createSpecificationModel(detail);
    const state=client.evaluate(detail.skus[0].selectedOptions);
    const authoritative=resolveSku(value.products[i],value.skus.filter(sku=>sku.productId===detail.productId),state.selectedOptions,state.matchedSku.skuId);
    assert.equal(state.status,'MATCHED');assert.equal(state.matchedSku.unitPriceCents,authoritative.unitPriceCents);
    assert.deepEqual(state.quantityLimits,{minQuantity:authoritative.minQuantity,maxQuantity:authoritative.maxQuantity});
    assert.equal(state.canPurchase,false);assert.ok(Object.isFrozen(detail.skus[0].selectedOptions));
    assert.throws(()=>{detail.skus[0].maxQuantity=999;},TypeError);
  }
  value.products[0].optionGroups[0].label='mutated';value.skus[0].unitPriceCents=99999;
  assert.equal(model.productGet({productId:'product-0'}).skus[0].unitPriceCents,1000);
});
