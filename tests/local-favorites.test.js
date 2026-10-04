'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createLocalFavoritesClient}=require('../miniprogram/services/local-favorites');
const {createCatalogClient}=require('../miniprogram/services/catalog');
const config={stage:'development',mode:'shell',appId:'offline-app'};
const clone=value=>JSON.parse(JSON.stringify(value));
function storage(){const entries=new Map();let writes=0;return {entries,get writes(){return writes;},getStorageSync:key=>entries.has(key)?clone(entries.get(key)):'',setStorageSync:(key,value)=>{writes++;entries.set(key,clone(value));}};}
const id='development-example-strawberry-cake';
test('C07 local favorites persist across new clients, are idempotent, app-scoped and use latest catalog prices',async()=>{
  const platform=storage(),catalog=createCatalogClient(config),service=createLocalFavoritesClient(config,platform,catalog);
  assert.equal(service.contains(id),false);await service.set(id,true);await service.set(id,true);
  assert.equal(platform.writes,1);assert.equal((await service.list()).items.length,1);
  const reopened=createLocalFavoritesClient(config,platform,catalog);assert.equal(reopened.contains(id),true);
  assert.equal((await reopened.list()).items[0].card.priceLabel,'168起');
  assert.equal(createLocalFavoritesClient({...config,appId:'other-app'},platform,catalog).contains(id),false);
  await reopened.set(id,false);await reopened.set(id,false);assert.equal(platform.writes,2);assert.equal(reopened.contains(id),false);
  assert.equal((await reopened.list()).scope,'LOCAL_DEVICE');
});
test('C07 removed catalog products remain visible as unavailable and removable without a catalog read',async()=>{
  const platform=storage(),service=createLocalFavoritesClient(config,platform,createCatalogClient(config));await service.set(id,true);
  const offline=createLocalFavoritesClient(config,platform,{list:async()=>({source:'DEVELOPMENT_EXAMPLE',items:[],hasMore:false,nextCursor:null})});
  const item=(await offline.list()).items[0];assert.equal(item.available,false);assert.equal(item.canPurchase,false);assert.equal(item.card,null);assert.equal(item.name,'草莓鲜奶蛋糕');
  await assert.rejects(offline.set(id,true),error=>error.code==='PRODUCT_UNAVAILABLE');
  const unavailable=createLocalFavoritesClient(config,platform,{list:()=>{throw new Error('offline');}});
  await unavailable.set(id,false);assert.equal(unavailable.contains(id),false);
});
test('C07 storage errors/readback mismatch/corruption and cloud modes never acknowledge a fake favorite',async()=>{
  const catalog=createCatalogClient(config);
  for(const platform of [
    {getStorageSync:()=>'',setStorageSync:()=>{throw new Error('quota');}},
    {getStorageSync:()=>'',setStorageSync:()=>{}}
  ])await assert.rejects(createLocalFavoritesClient(config,platform,catalog).set(id,true),error=>error.code==='LOCAL_FAVORITES_WRITE_FAILED');
  const broken={getStorageSync:()=>({version:1,scope:'LOCAL_DEVICE',items:[{productId:id,name:'one'},{productId:id,name:'two'}]})};
  assert.throws(()=>createLocalFavoritesClient(config,broken,catalog).contains(id),error=>error.code==='LOCAL_FAVORITES_INVALID');
  for(const settings of [{...config,mode:'cloud'},{...config,stage:'production'},{...config,stage:'test'}]){
    const client=createLocalFavoritesClient(settings,{getStorageSync:()=>{throw new Error('MUST NOT READ');}},catalog);
    await assert.rejects(client.list(),error=>error.code==='LOCAL_FAVORITES_UNAVAILABLE');
  }
  await assert.rejects(createLocalFavoritesClient(config,storage(),catalog).set('preview-cake',true),error=>error.code==='INVALID_LOCAL_PRODUCT');
});
function pageHarness(file,service){
  let page;const navigations=[],modals=[];
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../miniprogram/'+(file.startsWith('favorites/')?'features/':'pages/')+file),'utf8'),{
    Page:value=>{page=value;},wx:{showModal:value=>modals.push(value)},
    require:name=>name.includes('/services/local-favorites')?service:name.includes('/constants/routes')?{navigate:(...args)=>navigations.push(args)}:
      name.includes('store-information')?require('../miniprogram/services/store-information'):name.includes('/config')?config:{}
  });
  page.data=clone(page.data);page.setData=patch=>Object.assign(page.data,clone(patch));
  return {page,navigations,modals};
}
test('C07 Favorites opens only available products, retains failed removal and ignores responses after hiding',async()=>{
  let fail=false,resolve;
  const items=[{productId:id,available:true},{productId:'development-example-removed',available:false}];
  const {page,navigations}=pageHarness('favorites/favorites.js',{list:async()=>({items:clone(items)}),set:async()=>{if(fail)throw new Error('PRIVATE');return {favorited:false};}});
  await page.onShow();page.select({detail:{id}});page.select({detail:{id:'development-example-removed'}});assert.equal(navigations.length,1);
  fail=true;await page.remove({currentTarget:{dataset:{id}}});assert.equal(page.data.items.length,2);assert.match(page.data.error,/失败/);
  fail=false;await page.remove({currentTarget:{dataset:{id}}});assert.equal(page.data.items.length,1);
  const hidden=pageHarness('favorites/favorites.js',{list:()=>new Promise(done=>{resolve=done;})}).page;
  const load=hidden.onShow();hidden.onHide();resolve({items});await load;assert.equal(hidden.data.items.length,0);
});
test('C07 Account permits registered public entries and shows confirmed store facts plus truthful pending contact',()=>{
  const {page,navigations,modals}=pageHarness('account/account.js');
  for(const target of ['orders','favorites','addresses','unknown'])page.navigate({currentTarget:{dataset:{target}}});
  assert.deepEqual(navigations.map(item=>item[0]),['orders','favorites','addresses']);
  page.information({currentTarget:{dataset:{target:'store'}}});assert.match(modals[0].content,/X085/);assert.match(modals[0].content,/08:00–21:00/);assert.match(modals[0].content,/20km/);
  page.information({currentTarget:{dataset:{target:'service'}}});assert.match(modals[1].content,/准备中/);
});
