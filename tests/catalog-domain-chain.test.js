'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createCatalogClient}=require('../miniprogram/services/catalog');
const {createProductDetailClient}=require('../miniprogram/services/product-detail');
const {createSpecificationClient}=require('../miniprogram/services/specification');
const {createSpecificationModel}=require('../miniprogram/utils/specification-model');
const {createLocalBagClient}=require('../miniprogram/services/local-bag');
const {createLocalFavoritesClient}=require('../miniprogram/services/local-favorites');
const config={stage:'development',mode:'shell',appId:'C08-OFFLINE-ONLY'};
const clone=value=>JSON.parse(JSON.stringify(value));
function storage(){const values=new Map();return {getStorageSync:key=>values.has(key)?clone(values.get(key)):'',setStorageSync:(key,value)=>values.set(key,clone(value))};}
for(const categoryCode of ['CAKE','MINI_CAKE','BREAD'])test('C08 '+categoryCode+' same-source list → detail → SKU → persistent local bag/favorite chain',async()=>{
  const platform=storage(),catalog=createCatalogClient(config),spec=createSpecificationClient(config);
  const card=(await catalog.list({categoryCode})).items[0],detail=await createProductDetailClient(config).get(card.id);
  assert.equal(detail.productId,card.id);assert.equal(detail.name,card.name);
  const model=createSpecificationModel(detail.configuration),sku=detail.configuration.skus[0];
  const state=model.evaluate(sku.selectedOptions);assert.equal(state.status,'MATCHED');assert.equal(state.matchedSku.unitPriceCents,card.minPriceCents);
  const input={productId:card.id,productVersion:state.productVersion,skuId:sku.skuId,skuVersion:sku.version,
    unitPriceCents:sku.unitPriceCents,selectedOptions:state.selectedOptions,quantity:2,cakeMessage:categoryCode==='CAKE'?'C08测试':''};
  await createLocalBagClient(config,platform,spec.get).add(input);
  const reopened=createLocalBagClient(config,platform,spec.get),line=reopened.list().lines[0];
  assert.equal(line.quantity,2);assert.equal(line.unitPriceCents,sku.unitPriceCents);assert.equal(line.totalLabel,String(2*sku.unitPriceCents/100));
  assert.equal(line.checkoutAllowed,false);assert.equal(reopened.list().checkoutAllowed,false);
  if(categoryCode!=='CAKE'){assert.deepEqual(state.selectedOptions,[]);assert.equal(state.messageSupport,'DISABLED');}
  const favorite=createLocalFavoritesClient(config,platform,catalog);await favorite.set(card.id,true);
  assert.equal((await createLocalFavoritesClient(config,platform,catalog).list()).items[0].card.priceLabel,card.priceLabel);
  reopened.remove(line.lineId);assert.equal(reopened.list().lines.length,0);
});
test('C08 tampered SKU/version/price/quantity/combination cannot enter local bag, cloud purchase remains unavailable',async()=>{
  const platform=storage(),spec=createSpecificationClient(config),detail=await createProductDetailClient(config).get('development-example-strawberry-cake');
  const sku=detail.configuration.skus[0],input={productId:detail.productId,productVersion:detail.configuration.version,
    skuId:sku.skuId,skuVersion:sku.version,unitPriceCents:sku.unitPriceCents,selectedOptions:sku.selectedOptions,quantity:1,cakeMessage:''};
  const bag=createLocalBagClient(config,platform,spec.get);
  for(const patch of [{skuId:'fake'},{skuVersion:99},{unitPriceCents:1},{quantity:0},{quantity:1.5},{selectedOptions:[]}])
    await assert.rejects(bag.add({...input,...patch}));
  assert.equal(bag.list().lines.length,0);
  await assert.rejects(createProductDetailClient({...config,mode:'cloud'}).get(detail.productId),error=>error.code==='CLOUD_NOT_CONFIGURED');
});
test('C08 business subpackage routes preserve every public entry and all tabs stay in main package',()=>{
  const app=require('../miniprogram/app.json'),file=path.join(__dirname,'../miniprogram/constants/routes.js'),calls=[];
  const sandbox={module:{exports:{}},wx:{navigateTo:value=>calls.push(['page',value.url]),switchTab:value=>calls.push(['tab',value.url])}};
  vm.runInNewContext(fs.readFileSync(file,'utf8'),sandbox);
  const routes=sandbox.module.exports,pack=app.subPackages.find(item=>item.root==='features');
  for(const [name,url] of Object.entries(routes.pages)){
    routes.navigate(name);
    assert.equal(calls.at(-1)[0],routes.tabs.includes(name)?'tab':'page');
    assert.equal(calls.at(-1)[1],url);
    const registered=routes.tabs.includes(name)?app.pages:pack.pages.map(page=>'features/'+page);
    assert.ok(registered.includes(url.slice(1)));
    for(const suffix of ['.js','.json','.wxml','.wxss'])assert.ok(fs.existsSync(path.join(__dirname,'../miniprogram',url+suffix)));
  }
  assert.equal(pack.independent,undefined);
  assert.deepEqual(app.pages,app.tabBar.list.map(item=>item.pagePath));
});
