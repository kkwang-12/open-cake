'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createProductDetailClient}=require('../miniprogram/services/product-detail');
const {createCatalogClient}=require('../miniprogram/services/catalog');
const {createSpecificationClient}=require('../miniprogram/services/specification');
const fixtures=require('../miniprogram/fixtures/specification-development');
const settings={stage:'development',mode:'shell'},clone=value=>JSON.parse(JSON.stringify(value));
const {createSpecificationModel}=require('../miniprogram/utils/specification-model');
const {formatCents}=require('../miniprogram/services/catalog');
const presentation=require('../miniprogram/utils/product-presentation');
test('C04 all current examples read same-source details, exact size prices and 12 yuan bread with no purchase',async()=>{
  const service=createProductDetailClient(settings);
  for(const item of fixtures.items){
    const detail=await service.get(item.productId);
    assert.equal(detail.name,item.name);assert.equal(detail.source,'DEVELOPMENT_EXAMPLE');
    assert.equal(detail.canPurchase,false);assert.equal(detail.canConfigure,true);assert.deepEqual(detail.images,[]);
    assert.deepEqual(detail.variantLabels.map(sku=>sku.priceLabel),item.skus.map(sku=>String(sku.unitPriceCents/100)));
    assert.ok(!/stockRequirements|resourceId|catalog-example.png/.test(JSON.stringify(detail)));
    if(item.categoryCode==='BREAD')assert.equal(detail.priceLabel,'12');
    if(item.categoryCode==='CAKE')assert.ok(detail.priceLabel.endsWith('起'));
  }
});
test('C04 legacy Home previews stay explicitly separated and never fabricate new SKU or configuration navigation',async()=>{
  for(const id of ['preview-cake','preview-mini','preview-bread']){
    const detail=await createProductDetailClient(settings).get(id);
    assert.equal(detail.source,'LEGACY_DESIGN_PREVIEW');assert.equal(detail.canConfigure,false);
    if(id==='preview-bread')assert.equal(detail.priceLabel,'12');
    assert.equal(detail.canPurchase,false);assert.equal(detail.variantLabels.length,0);
    assert.match(detail.priceMeaning,/非当前商品售价/);assert.ok(detail.images[0].src.startsWith('/assets/home/'));
  }
});
test('C04 detail unavailable IDs and all cloud/production gates fail with no preview fallback',async()=>{
  for(const id of ['',undefined,'../../private','development-example-missing','preview-unknown'])
    await assert.rejects(createProductDetailClient(settings).get(id),error=>error.code==='PRODUCT_UNAVAILABLE');
  for(const config of [{stage:'production',mode:'shell'},{stage:'test',mode:'shell'},{stage:'development',mode:'cloud'}])
    await assert.rejects(createProductDetailClient(config).get('preview-cake'),error=>error.code==='CLOUD_NOT_CONFIGURED');
  await assert.rejects(createProductDetailClient({stage:'wrong',mode:'shell'}).get('preview-cake'),error=>error.code==='INVALID_CONFIGURATION');
});
test('C04 inconsistent card/SKU price or source cannot produce a detail; missing card is unavailable',async()=>{
  const specification=createSpecificationClient(settings),catalog=createCatalogClient(settings),id=fixtures.items[0].productId;
  for(const mutate of [
    page=>page.items[0].minPriceCents++,page=>page.source='PUBLIC_CATALOG',page=>page.items[0].canPurchase=true,
    page=>page.items[0].name='Different product',page=>page.items[0].categoryCode='BREAD'
  ]){
    const bad={list:async input=>{const page=await catalog.list(input);mutate(page);return page;}};
    await assert.rejects(createProductDetailClient(settings,bad,specification).get(id),error=>error.code==='INVALID_RESPONSE');
  }
  await assert.rejects(createProductDetailClient(settings,{list:async()=>({items:[]})},specification).get(id),error=>error.code==='PRODUCT_UNAVAILABLE');
});
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function productPage(service=createProductDetailClient(settings),bag={add:async()=>{throw new Error('No storage');}}){
  let page;const navigations=[],toasts=[];
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../miniprogram/pages/product/product.js'),'utf8'),{
    Page:value=>{page=value;},wx:{showToast:value=>toasts.push(value)},
    require:name=>{
      if(name.includes('/services/product-detail'))return service;
      if(name.includes('/services/local-bag'))return bag;
      if(name.includes('/utils/safe-area'))return {measure:()=>({topInset:24,navHeight:44,capsuleWidth:104})};
      if(name.includes('/utils/product-presentation'))return presentation;
      if(name.includes('/services/catalog'))return {formatCents};
      if(name.includes('/utils/specification-model'))return {createSpecificationModel:input=>{
        const model=createSpecificationModel(clone(input));
        return {configuration:model.configuration,evaluate:(selection=[])=>model.evaluate(clone(selection)),
          changeOption:(previous,change)=>model.changeOption(clone(previous),clone(change)),
          reconcile:previous=>model.reconcile(clone(previous))};
      }};
      return {navigate:(...args)=>navigations.push(args)};
    }
  });
  page.data=clone(page.data);
  page.setData=value=>{for(const [key,item] of Object.entries(value)){
    const nested=/^gallery\[(\d+)\]\.failed$/.exec(key);
    if(nested)page.data.gallery[Number(nested[1])].failed=item;else page.data[key]=clone(item);
  }};
  return {page,navigations,toasts};
}
test('Detail selection opens the current-page sheet; unavailable favorite never claims saved',async()=>{
  const {page,navigations,toasts}=productPage();page.onLoad({id:fixtures.items[0].productId});await page.onShow();
  assert.equal(page.data.product.priceLabel,'168起');page.configure();
  assert.equal(page.data.sheetOpen,true);assert.equal(navigations.length,0);page.favorite();
  assert.match(toasts[0].title,/尚未接通/);assert.equal(navigations.length,0);
  page.onLoad({id:'preview-mini'});await page.onShow();page.configure();assert.equal(page.data.sheetOpen,false);
});
test('C04 unavailable versus transient errors use fixed copy and permit appropriate recovery',async()=>{
  let calls=0;const service={get:async()=>{if(calls++===0)throw new Error('PRIVATE_STACK');return createProductDetailClient(settings).get(fixtures.items[0].productId);}};
  const {page}=productPage(service);page.onLoad({id:fixtures.items[0].productId});await page.onShow();
  assert.equal(page.data.error,'商品加载失败，请重试。');assert.equal(page.data.unavailable,false);
  await page.errorAction();assert.equal(page.data.product.name,'草莓鲜奶蛋糕');
  const missing=productPage();missing.page.onLoad({id:'development-example-missing'});await missing.page.onShow();
  assert.equal(missing.page.data.unavailable,true);missing.page.errorAction();assert.equal(missing.navigations[0][0],'shop');
  const unavailable=productPage({get:async()=>{throw {code:'CLOUD_NOT_CONFIGURED',message:'PRIVATE'};}});
  unavailable.page.onLoad({id:fixtures.items[0].productId});await unavailable.page.onShow();
  assert.equal(unavailable.page.data.error,'商品服务暂未开通，欢迎稍后再来。');
});
test('C04 late detail responses after hiding and retry do not restore stale products',async()=>{
  const requests=[],{page}=productPage({get:()=>{const item=deferred();requests.push(item);return item.promise;}});
  page.onLoad({id:fixtures.items[0].productId});const first=page.onShow();page.onHide();requests[0].reject(new Error('PRIVATE'));await first;
  assert.equal(page.data.product,null);assert.equal(page.data.error,'');
  const second=page.onShow();const third=page.load();
  const detail=await createProductDetailClient(settings).get(fixtures.items[0].productId);
  requests[2].resolve(detail);await third;requests[1].reject(new Error('OLD'));await second;
  assert.equal(page.data.product.name,detail.name);assert.equal(page.data.error,'');
  page.onUnload();
});
test('C04 gallery failure is isolated by image/product and swiping stays within bounds',async()=>{
  const detail=await createProductDetailClient(settings).get('preview-cake');
  detail.images.push({key:'offline-second-photo',src:'/assets/home/chocolate.jpg'});
  const {page}=productPage({get:async()=>detail});page.onLoad({id:'preview-cake'});await page.onShow();
  page.imageError({currentTarget:{dataset:{productId:'different',key:'preview-cake'}}});assert.equal(page.data.gallery[0].failed,false);
  page.imageError({currentTarget:{dataset:{productId:'preview-cake',key:'preview-cake'}}});
  assert.equal(page.data.gallery[0].failed,true);assert.equal(page.data.gallery[1].failed,false);
  page.galleryChange({detail:{current:1}});assert.equal(page.data.galleryIndex,1);
  page.galleryChange({detail:{current:20}});assert.equal(page.data.galleryIndex,1);
});
test('Detail SKU changes update prices and quantity; closing/reopening keeps valid selections without fabricating fields',async()=>{
  const {page}=productPage();page.onLoad({id:fixtures.items[1].productId});await page.onShow();page.configure();
  page.chooseOption({currentTarget:{dataset:{group:'SIZE',option:'INCH_8'}}});
  assert.equal(page.data.totalLabel,'258');assert.equal(page.data.hasSelection,true);
  assert.ok(page.data.groups[0].options.every(option=>option.servingsLabel===''));
  page.changeQuantity({currentTarget:{dataset:{step:1}}});assert.equal(page.data.quantity,2);assert.equal(page.data.totalLabel,'516');
  page.closeSheet();page.configure();assert.equal(page.data.totalLabel,'516');
  page.chooseOption({currentTarget:{dataset:{group:'SIZE',option:'INCH_10'}}});assert.equal(page.data.totalLabel,'696');
  page.messageInput({detail:{value:'生日快乐'}});assert.equal(page.data.messageCount,4);
});
test('Detail success follows verified Bag response; storage rejection never closes sheet or shows success',async()=>{
  let input;
  const stored={add:async value=>{input=clone(value);return {line:{name:'黑巧克力蛋糕',specLabel:'8寸',checkoutAllowed:false},addedQuantity:value.quantity};}};
  const {page}=productPage(createProductDetailClient(settings),stored);
  page.onLoad({id:fixtures.items[1].productId});await page.onShow();page.configure();
  page.chooseOption({currentTarget:{dataset:{group:'SIZE',option:'INCH_8'}}});await page.addToBag();
  assert.equal(input.unitPriceCents,25800);assert.equal(input.skuVersion,0);
  assert.equal(page.data.sheetOpen,false);assert.equal(page.data.success.specLabel,'8寸');assert.equal(page.data.success.quantity,1);
  const broken=productPage().page;broken.onLoad({id:fixtures.items[1].productId});await broken.onShow();broken.configure();
  broken.chooseOption({currentTarget:{dataset:{group:'SIZE',option:'INCH_6'}}});await broken.addToBag();
  assert.equal(broken.data.sheetOpen,true);assert.equal(broken.data.success,null);assert.equal(broken.data.adding,false);
  assert.equal(broken.data.selectionNotice,'保存购物袋失败，请重试。');
});
