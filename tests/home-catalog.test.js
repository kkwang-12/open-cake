'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createHomeCatalogClient}=require('../miniprogram/services/home-catalog');
const {createCatalogClient}=require('../miniprogram/services/catalog');
const {createProductDetailClient}=require('../miniprogram/services/product-detail');
const settings={stage:'development',mode:'shell'},clone=value=>JSON.parse(JSON.stringify(value));
test('C06 Home sections and category fallback resolve current catalog IDs, names and prices through every page',async()=>{
  const catalog=createCatalogClient(settings),all=await catalog.list({pageSize:50}),ids=all.items.map(item=>item.id);
  const home=createHomeCatalogClient({list:input=>catalog.list({...input,pageSize:2})},{
    recommended:[ids[1],ids[1],'removed-id'],seasonal:[ids[2]],series:[ids[3]],popular:[ids[6]]
  });
  const result=await home.get();
  assert.equal(result.products.length,1);assert.equal(result.products[0].name,'黑巧克力蛋糕');assert.equal(result.products[0].priceLabel,'188起');
  assert.equal(result.categories.length,3);assert.ok(result.categories.every(item=>item.products.length===3));
  for(const section of Object.values(result.sections))for(const item of section)
    assert.deepEqual(item,all.items.find(card=>card.id===item.id));
  const fallback=await createHomeCatalogClient(catalog).get();
  assert.equal(fallback.recommendationConfigured,false);assert.equal(fallback.products.length,3);
  assert.deepEqual(fallback.products.map(item=>item.categoryCode),['CAKE','MINI_CAKE','BREAD']);
  assert.equal(fallback.products[2].priceLabel,'12');
  for(const item of fallback.products){
    const detail=await createProductDetailClient(settings).get(item.id);
    assert.equal(detail.name,item.name);assert.equal(detail.priceLabel,item.priceLabel);assert.equal(detail.canConfigure,true);
  }
});
test('C06 Home never falls back to legacy previews on cloud/production or empty catalog, and rejects broken pagination',async()=>{
  for(const config of [{stage:'production',mode:'shell'},{stage:'development',mode:'cloud'}])
    await assert.rejects(createHomeCatalogClient(createCatalogClient(config)).get(),error=>error.code==='CLOUD_NOT_CONFIGURED');
  const empty=await createHomeCatalogClient({list:async()=>({source:'PUBLIC_CATALOG',items:[],hasMore:false,nextCursor:null})}).get();
  assert.deepEqual(empty.products,[]);assert.ok(Object.values(empty.sections).every(items=>items.length===0));
  await assert.rejects(createHomeCatalogClient({list:async()=>({source:'PUBLIC_CATALOG',items:[],hasMore:true,nextCursor:'same'})}).get(),error=>error.code==='INVALID_RESPONSE');
});
function home(service=createHomeCatalogClient(createCatalogClient(settings))){
  let page;const app={globalData:{}},navigations=[];
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../miniprogram/pages/home/home.js'),'utf8'),{
    Page:value=>{page=value;},getApp:()=>app,
    require:name=>name.includes('/utils/tab-transition')?{show(){},hide(){},scroll(){}}:name.includes('/services/home-catalog')?service:name.includes('/utils/safe-area')?{measure:()=>({})}:{navigate:(...args)=>navigations.push(args)}
  });
  page.data=clone(page.data);page.setData=patch=>Object.assign(page.data,clone(patch));
  return {page,app,navigations};
}
test('Home cards open same-source detail and Hero/recommendation actions route to Shop',async()=>{
  const {page,app,navigations}=home();await page.onShow();
  assert.equal(page.data.products.length,3);assert.equal(page.data.source,'DEVELOPMENT_EXAMPLE');
  page.select({detail:{id:'preview-cake'}});assert.equal(navigations.length,0);
  page.select({detail:{id:page.data.products[0].id}});assert.equal(navigations[0][0],'product');
  page.browse();assert.equal(navigations[1][0],'shop');
  page.heroImageError({currentTarget:{dataset:{index:0}}});assert.equal(page.data.heroSlides[0].imageFailed,true);assert.equal(page.data.products.length,3);
  assert.deepEqual(app.globalData,{});
});
test('C06 Home hides late responses, reports fixed failure copy and can retry without old preview data',async()=>{
  let resolve,fail=false,calls=0;
  const current=createHomeCatalogClient(createCatalogClient(settings));
  const {page}=home({get:()=>{calls++;if(calls===1)return new Promise(done=>{resolve=done;});if(fail)throw new Error('PRIVATE');return current.get();}});
  const pending=page.onShow();page.onHide();resolve(await current.get());await pending;
  assert.deepEqual(page.data.products,[]);
  fail=true;await page.onShow();assert.equal(page.data.error,'商品加载失败，请重试。');assert.deepEqual(page.data.products,[]);
  fail=false;await page.retry();assert.equal(page.data.products.length,3);assert.equal(page.data.error,'');
});
