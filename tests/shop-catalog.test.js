'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createCatalogClient,formatCents}=require('../miniprogram/services/catalog');
const fixture=require('../miniprogram/fixtures/shop-development');
const {buildPreview}=require('../scripts/generate-shop-preview');
const clone=value=>JSON.parse(JSON.stringify(value));
const settings={stage:'development',mode:'shell'};
test('Shop example is generated from C01 input and reads all 9 entries / categories / 12 yuan breads',async()=>{
  assert.deepEqual(fixture,buildPreview());
  const client=createCatalogClient(settings),first=await client.list(),second=await client.list({cursor:first.nextCursor});
  assert.equal(first.items.length,6);assert.equal(second.items.length,3);
  assert.equal(first.source,'DEVELOPMENT_EXAMPLE');assert.equal(first.hasMore,true);assert.equal(second.nextCursor,null);
  const all=[...first.items,...second.items];
  assert.equal(new Set(all.map(item=>item.id)).size,9);
  assert.ok(all.every(item=>item.canPurchase===false&&item.image===''));
  assert.equal(all[0].priceLabel,'168起');
  assert.ok(all.filter(item=>item.categoryCode==='BREAD').every(item=>item.priceLabel==='12'));
  for(const categoryCode of ['CAKE','MINI_CAKE','BREAD']){
    const category=await client.list({categoryCode});
    assert.equal(category.items.length,3);assert.ok(category.items.every(item=>item.categoryCode===categoryCode));
  }
});
test('Shop preview never appears in cloud, test or production, including unavailable environments',async()=>{
  for(const config of [{stage:'production',mode:'shell'},{stage:'test',mode:'shell'},
    {stage:'development',mode:'cloud'},{stage:'production',mode:'cloud'}])
    await assert.rejects(createCatalogClient(config).list(),error=>error.code==='CLOUD_NOT_CONFIGURED');
  await assert.rejects(createCatalogClient({stage:'unknown',mode:'shell'}).list(),error=>error.code==='INVALID_CONFIGURATION');
});
test('Shop local pagination binds revision/category/search and rejects foreign / malformed markers',async()=>{
  const client=createCatalogClient(settings),first=await client.list({pageSize:2});
  for(const input of [{categoryCode:'BREAD',cursor:first.nextCursor},{search:'蛋糕',cursor:first.nextCursor},
    {cursor:'server-signature'},{cursor:'development-preview.%bad'},{pageSize:0},{categoryCode:'DRINKS'},
    {search:'x'.repeat(65)},{search:'\uD800'},{filter:'price'}])
    await assert.rejects(client.list(input),error=>error.code==='INVALID_REQUEST');
  const changed=clone(fixture);changed.revision='f'.repeat(64);
  await assert.rejects(createCatalogClient(settings,changed).list({cursor:first.nextCursor}),error=>error.code==='INVALID_REQUEST');
  const empty=await client.list({search:'not a product'});
  assert.equal(empty.items.length,0);assert.equal(empty.hasMore,false);assert.equal(empty.nextCursor,null);
});
test('Shop cards omit source/private fields, detach caller mutations and format integer cents',async()=>{
  const samples=clone(fixture);samples.items[0].stockRequirements=['PRIVATE'];
  const client=createCatalogClient(settings,samples),first=await client.list();
  assert.ok(!JSON.stringify(first).includes('PRIVATE'));assert.ok(!JSON.stringify(first).includes('sha256'));
  first.items[0].name='edited';assert.notEqual((await client.list()).items[0].name,'edited');
  assert.equal(formatCents(1234),'12.34');assert.equal(formatCents(1200),'12');assert.equal(formatCents(null),'待定');
  samples.items[0].minPriceCents=null;
  assert.equal((await client.list()).items[0].priceLabel,'待定');
  samples.items[0].canPurchase=true;
  await assert.rejects(client.list(),error=>error.code==='INVALID_RESPONSE');
});
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function shop(service=createCatalogClient(settings)){
  const file=path.join(__dirname,'../miniprogram/pages/shop/shop.js');
  const app={globalData:{}},toasts=[],navigations=[];let page;
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{
    Page:value=>{page=value;},getApp:()=>app,wx:{showToast:value=>toasts.push(value)},
    require:name=>name.includes('/services/catalog')?service:
      name.includes('/constants/routes')?{navigate:(...args)=>navigations.push(args)}:null
  });
  page.data=clone(page.data);
  page.setData=value=>Object.assign(page.data,clone(value));
  return {page,app,toasts,navigations};
}
const category=id=>({currentTarget:{dataset:{id}}});
const response=(items,nextCursor=null)=>({source:'DEVELOPMENT_EXAMPLE',items:clone(items),nextCursor,hasMore:nextCursor!==null});
test('Shop starts at pending Home category, appends remaining page and opens development detail without buying',async()=>{
  const {page,app,toasts,navigations}=shop();
  app.globalData.pendingShopCategory='bread';
  await page.onShow();assert.equal(page.data.category,'bread');assert.equal(app.globalData.pendingShopCategory,'');
  assert.equal(page.data.products.length,3);assert.ok(page.data.products.every(item=>item.priceLabel==='12'));
  await page.chooseCategory(category('all'));assert.equal(page.data.products.length,6);assert.equal(page.data.hasMore,true);
  await page.loadMore();assert.equal(page.data.products.length,9);assert.equal(page.data.hasMore,false);
  page.select({detail:{id:page.data.products[0].id}});
  assert.equal(navigations.length,1);assert.equal(navigations[0][0],'product');assert.equal(navigations[0][1].id,page.data.products[0].id);assert.equal(toasts.length,0);
  page.select({detail:{id:'unknown'}});assert.equal(navigations.length,1);assert.equal(toasts.length,0);
});
test('Shop ignores stale success/failure after rapid category changes and hiding/reopening',async()=>{
  const requests=[],{page}=shop({list:input=>{const pending=deferred();requests.push({...pending,input});return pending.promise;}});
  const first=page.onShow(),second=page.chooseCategory(category('bread'));
  requests[1].resolve(response(fixture.items.slice(6)));await second;
  requests[0].reject(new Error('private old failure'));await first;
  assert.equal(page.data.category,'bread');assert.equal(page.data.products.length,3);assert.equal(page.data.error,'');
  const pending=page.chooseCategory(category('cake'));page.onHide();
  requests[2].resolve(response(fixture.items.slice(0,3)));await pending;
  assert.equal(page.data.products.length,0);
  const reopened=page.onShow();requests[3].resolve(response(fixture.items.slice(0,3)));await reopened;
  assert.equal(page.data.products.length,3);assert.equal(page.data.loading,false);
  const switched=page.chooseCategory(category('mini')),last=page.chooseCategory(category('bread'));
  requests[5].resolve(response(fixture.items.slice(6)));await last;
  requests[4].resolve(response(fixture.items.slice(3,6)));await switched;
  assert.ok(page.data.products.every(item=>item.categoryCode==='BREAD'));
});
test('Shop retains loaded products and cursor on append error, retries same page and blocks duplicate append',async()=>{
  const requests=[],{page}=shop({list:input=>{const pending=deferred();requests.push({...pending,input});return pending.promise;}});
  const first=page.onShow();requests[0].resolve(response(fixture.items.slice(0,6),'next-page'));await first;
  const append=page.loadMore();await page.loadMore();assert.equal(requests.length,2);
  requests[1].reject(new Error('secret stack'));await append;
  assert.equal(page.data.products.length,6);assert.equal(page.data.nextCursor,'next-page');
  assert.equal(page.data.error,'商品加载失败，请重试。');assert.equal(page.data.loading,false);
  const retry=page.retry();await page.retry();assert.equal(requests.length,3);
  assert.equal(requests[2].input.cursor,'next-page');
  requests[2].resolve(response(fixture.items.slice(6)));await retry;
  assert.equal(page.data.products.length,9);assert.equal(page.data.error,'');assert.equal(page.data.nextCursor,null);
});
test('Shop recovers empty/first request failures and rejects non-advancing pagination responses',async()=>{
  let count=0;
  const {page}=shop({list:async()=>{if(count++===0){const error=new Error('private');error.code='CLOUD_NOT_CONFIGURED';throw error;}
    return response([]);}});
  await page.onShow();assert.equal(page.data.error,'商品服务暂未开通，欢迎稍后再来。');
  await page.retry();assert.equal(page.data.error,'');assert.equal(page.data.products.length,0);
  const malformed=shop({list:async()=>response(fixture.items.slice(0,6),'loop')}).page;
  await malformed.onShow();await malformed.loadMore();
  assert.equal(malformed.data.products.length,6);assert.equal(malformed.data.error,'商品加载失败，请重试。');
});
test('Shop service can load with a WeChat-style JS-only module resolver',async()=>{
  const file=path.join(__dirname,'../miniprogram/services/catalog.js');
  const {createRequire}=require('node:module'),load=createRequire(file);
  const sandbox={module:{exports:{}},require:name=>{
    if(name.endsWith('.json'))throw new Error('WeChat runtime cannot require JSON modules');
    return load(name);
  }};
  vm.runInNewContext(fs.readFileSync(file,'utf8'),sandbox);
  const page=await sandbox.module.exports.createCatalogClient(settings).list();
  assert.equal(page.items.length,6);assert.equal(page.items[0].priceLabel,'168起');
});