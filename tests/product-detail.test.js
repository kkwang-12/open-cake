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
function productPage(service=createProductDetailClient(settings),bag={add:async()=>{throw new Error('No storage');}},confirm=()=>false,favorites={contains:()=>false,set:async()=>{throw new Error('No storage');}}){
  let page;const navigations=[],toasts=[],modals=[];
  const platform={showToast:value=>toasts.push(value),showModal:value=>{modals.push(value);value.success({confirm:confirm()});}};
  const sheetRuntime=require('./fixtures/bottom-sheet-runtime').runtime(platform);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../miniprogram/features/product/product.js'),'utf8'),{
    Page:value=>{page=value;},wx:platform,
    require:name=>{
      if(name.includes('/utils/bottom-sheet'))return sheetRuntime.sheet;
      if(name.includes('/services/product-detail'))return service;
      if(name.includes('/services/local-bag'))return bag;
      if(name.includes('/services/local-favorites'))return favorites;
      if(name.includes('/utils/safe-area'))return {measure:()=>({topInset:24,navHeight:44,capsuleWidth:104})};
      if(name.includes('/utils/product-presentation'))return presentation;
      if(name.includes('/utils/local-operation'))return require('../miniprogram/utils/local-operation');
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
  page.setData=(value,callback)=>{for(const [key,item] of Object.entries(value)){
    const nested=/^gallery\[(\d+)\]\.failed$/.exec(key);
    if(nested)page.data.gallery[Number(nested[1])].failed=item;else page.data[key]=clone(item);
  }if(callback)callback();};
  return {page,navigations,toasts,modals,advance:sheetRuntime.advance};
}
test('Detail selection opens the current-page sheet; a failed favorite write never claims saved',async()=>{
  const {page,navigations,toasts}=productPage();page.onLoad({id:fixtures.items[0].productId});await page.onShow();
  assert.equal(page.data.product.priceLabel,'168起');page.configure();
  assert.equal(page.data.sheetOpen,true);assert.equal(navigations.length,0);await page.favorite();
  assert.match(toasts[0].title,/保存失败/);assert.equal(page.data.favorited,false);assert.equal(navigations.length,0);
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
  const {page,advance}=productPage(createProductDetailClient(settings),stored);
  page.onLoad({id:fixtures.items[1].productId});await page.onShow();page.configure();
  page.chooseOption({currentTarget:{dataset:{group:'SIZE',option:'INCH_8'}}});await page.addToBag();
  assert.equal(input.unitPriceCents,25800);assert.equal(input.skuVersion,0);
  assert.equal(page.data.sheetOpen,true);assert.equal(page.data.sheetPhase,'closing');advance(200);
  assert.equal(page.data.sheetOpen,false);assert.equal(page.data.success.specLabel,'8寸');assert.equal(page.data.success.quantity,1);
  const broken=productPage().page;broken.onLoad({id:fixtures.items[1].productId});await broken.onShow();broken.configure();
  broken.chooseOption({currentTarget:{dataset:{group:'SIZE',option:'INCH_6'}}});await broken.addToBag();
  assert.equal(broken.data.sheetOpen,true);assert.equal(broken.data.success,null);assert.equal(broken.data.adding,false);
  assert.equal(broken.data.selectionNotice,'保存购物袋失败，请重试。');
});

test('B04 detail retains the operation key after uncertain failure; success then new add gets a fresh key',async()=>{
  const inputs=[];let fail=true;
  const service={add:async value=>{inputs.push(clone(value));if(fail){fail=false;throw {code:'LOCAL_BAG_WRITE_FAILED'};}
    return {line:{name:'黑巧克力蛋糕',specLabel:'6寸',checkoutAllowed:false},addedQuantity:value.quantity};}};
  const {page}=productPage(createProductDetailClient(settings),service);
  page.onLoad({id:fixtures.items[1].productId});await page.onShow();page.configure();
  page.chooseOption({currentTarget:{dataset:{group:'SIZE',option:'INCH_6'}}});
  await page.addToBag();assert.equal(page.data.success,null);
  page.onHide();await page.onShow();page.configure();await page.addToBag();
  assert.equal(inputs[0].operationId,inputs[1].operationId);assert.equal(page.data.success.quantity,1);
  page.configure();await page.addToBag();assert.notEqual(inputs[1].operationId,inputs[2].operationId);
  assert(inputs.every(value=>/^[-_a-zA-Z0-9]{16,128}$/.test(value.operationId)));
});

test('B04 changing quantity after a failed add starts a distinct intent, without automatic mutation retry',async()=>{
  const inputs=[];const {page}=productPage(createProductDetailClient(settings),{
    add:async value=>{inputs.push(clone(value));throw {code:'LOCAL_BAG_WRITE_FAILED'};}});
  page.onLoad({id:fixtures.items[1].productId});await page.onShow();page.configure();
  page.chooseOption({currentTarget:{dataset:{group:'SIZE',option:'INCH_6'}}});await page.addToBag();
  assert.equal(inputs.length,1);page.changeQuantity({currentTarget:{dataset:{step:1}}});await page.addToBag();
  assert.equal(inputs.length,2);assert.notEqual(inputs[0].operationId,inputs[1].operationId);assert.equal(inputs[1].quantity,2);
});

test('B04 hiding/loading while add is in flight cannot submit again; hidden completion keeps replay key',async()=>{
  const inputs=[];let finish;
  const {page}=productPage(createProductDetailClient(settings),{add:value=>{
    inputs.push(clone(value));return new Promise(resolve=>{finish=()=>resolve({line:{name:'黑巧克力蛋糕',specLabel:'6寸',checkoutAllowed:false},addedQuantity:value.quantity});});}});
  page.onLoad({id:fixtures.items[1].productId});await page.onShow();page.configure();
  page.chooseOption({currentTarget:{dataset:{group:'SIZE',option:'INCH_6'}}});
  const pending=page.addToBag();page.onHide();await page.onShow();page.configure();await page.addToBag();
  assert.equal(inputs.length,1);page.onHide();finish();await pending;assert.equal(page.data.success,null);
  await page.onShow();page.configure();const retry=page.addToBag();assert.equal(inputs.length,2);
  assert.equal(inputs[0].operationId,inputs[1].operationId);finish();await retry;assert.equal(page.data.success.quantity,1);
});

test('C05 returning to detail and retry after a failed refresh retain valid SKU, quantity and message',async()=>{
  let fail=false;
  const service={get:async id=>{if(fail)throw new Error('offline');return createProductDetailClient(settings).get(id);}};
  const {page,modals}=productPage(service);page.onLoad({id:fixtures.items[1].productId});await page.onShow();page.configure();
  page.chooseOption({currentTarget:{dataset:{group:'SIZE',option:'INCH_8'}}});
  page.changeQuantity({currentTarget:{dataset:{step:1}}});page.messageInput({detail:{value:'生日快乐🎂'}});
  page.onHide();await page.onShow();page.configure();
  assert.equal(page.data.totalLabel,'516');assert.equal(page.data.quantity,2);
  assert.equal(page.data.cakeMessage,'生日快乐🎂');assert.equal(page.data.messageCount,5);
  assert.equal(page.data.groups[0].options.find(option=>option.optionCode==='INCH_8').selected,true);
  assert.equal(page._needsReconfirmation,false);assert.equal(modals.length,0);
  fail=true;page.onHide();await page.onShow();assert.equal(page.data.product,null);
  fail=false;await page.retry();page.configure();
  assert.equal(page.data.totalLabel,'516');assert.equal(page.data.cakeMessage,'生日快乐🎂');
  page.onLoad({id:fixtures.items[0].productId});await page.onShow();
  assert.equal(page.data.hasSelection,false);assert.equal(page.data.quantity,1);assert.equal(page.data.cakeMessage,'');
});

test('C05 refresh removes obsolete choices while retaining message and requires selecting a current SKU',async()=>{
  let current=clone(await createProductDetailClient(settings).get(fixtures.items[1].productId));
  let writes=0;const {page}=productPage({get:async()=>clone(current)},{add:async()=>{writes++;}});
  page.onLoad({id:current.productId});await page.onShow();page.configure();
  page.chooseOption({currentTarget:{dataset:{group:'SIZE',option:'INCH_8'}}});page.messageInput({detail:{value:'生日快乐'}});
  current.configuration.version++;
  current.configuration.optionGroups[0].options=current.configuration.optionGroups[0].options.filter(option=>option.optionCode!=='INCH_8');
  current.configuration.skus=current.configuration.skus.filter(sku=>!sku.selectedOptions.some(option=>option.optionCode==='INCH_8'));
  page.onHide();await page.onShow();page.configure();
  assert.equal(page.data.hasSelection,false);assert.equal(page.data.cakeMessage,'生日快乐');
  assert.match(page.data.selectionNotice,/重新选择/);
  await page.addToBag();assert.equal(writes,0);
});

test('C05 changed price and quantity limit use latest values and require confirmation before any Bag write',async()=>{
  let current=clone(await createProductDetailClient(settings).get(fixtures.items[1].productId)),accept=false;
  const writes=[];
  const {page,modals}=productPage({get:async()=>clone(current)},{add:async input=>{
    writes.push(clone(input));return {line:{name:current.name,specLabel:'8寸',checkoutAllowed:false},addedQuantity:input.quantity};
  }},()=>accept);
  page.onLoad({id:current.productId});await page.onShow();page.configure();
  page.chooseOption({currentTarget:{dataset:{group:'SIZE',option:'INCH_8'}}});page.changeQuantity({currentTarget:{dataset:{step:1}}});
  const sku=current.configuration.skus.find(item=>item.selectedOptions.some(option=>option.optionCode==='INCH_8'));
  sku.unitPriceCents=26000;sku.version++;sku.minQuantity=1;sku.maxQuantity=1;
  page.onHide();await page.onShow();page.configure();
  assert.equal(page.data.quantity,1);assert.equal(page.data.totalLabel,'260');
  assert.match(page.data.selectionNotice,/数量限制/);
  await page.addToBag();assert.equal(writes.length,0);assert.equal(page.data.sheetOpen,true);assert.equal(page.data.adding,false);
  page.onHide();await page.onShow();page.configure();
  assert.equal(page._needsReconfirmation,true);
  accept=true;await page.addToBag();
  assert.equal(writes.length,1);assert.equal(writes[0].unitPriceCents,26000);assert.equal(writes[0].quantity,1);
  assert.equal(writes[0].skuVersion,sku.version);assert.equal(page.data.success.quantity,1);
  assert.equal(modals.length,2);assert.match(modals[1].content,/260/);
});

test('C05 changed message limits preserve text for editing, block oversized Unicode messages and enforce quantity bounds',async()=>{
  let current=clone(await createProductDetailClient(settings).get(fixtures.items[1].productId)),writes=0;
  const {page}=productPage({get:async()=>clone(current)},{add:async input=>{
    writes++;return {line:{name:current.name,specLabel:'8寸',checkoutAllowed:false},addedQuantity:input.quantity};
  }},()=>true);
  page.onLoad({id:current.productId});await page.onShow();page.configure();
  page.chooseOption({currentTarget:{dataset:{group:'SIZE',option:'INCH_8'}}});page.messageInput({detail:{value:'生日🎂'}});
  current.configuration.messagePolicy={maxLength:2,normalizationVersion:'unicode-nfc-trim-codepoints-v1'};
  const sku=current.configuration.skus.find(item=>item.selectedOptions.some(option=>option.optionCode==='INCH_8'));
  sku.minQuantity=2;sku.maxQuantity=3;
  page.onHide();await page.onShow();page.configure();
  assert.equal(page.data.quantity,2);assert.equal(page.data.cakeMessage,'生日🎂');
  await page.addToBag();assert.equal(writes,0);assert.match(page.data.selectionNotice,/超过/);
  page.changeQuantity({currentTarget:{dataset:{step:-1}}});assert.equal(page.data.quantity,2);
  page.changeQuantity({currentTarget:{dataset:{step:1}}});page.changeQuantity({currentTarget:{dataset:{step:1}}});
  assert.equal(page.data.quantity,3);
  page.messageInput({detail:{value:'喜🎂'}});await page.addToBag();assert.equal(writes,1);
});

test('C05 newly disabled message is cleared with notice; hiding during reconfirmation cannot add to Bag',async()=>{
  let current=clone(await createProductDetailClient(settings).get(fixtures.items[1].productId)),writes=0;
  let page;
  const harness=productPage({get:async()=>clone(current)},{add:async()=>{writes++;}},()=>{page.onHide();return true;});
  page=harness.page;page.onLoad({id:current.productId});await page.onShow();page.configure();
  page.chooseOption({currentTarget:{dataset:{group:'SIZE',option:'INCH_8'}}});page.messageInput({detail:{value:'生日快乐'}});
  current.configuration.messageSupport='DISABLED';
  page.onHide();await page.onShow();page.configure();
  assert.equal(page.data.cakeMessage,'');assert.equal(page.data.messageEnabled,false);assert.match(page.data.selectionNotice,/原留言已清除/);
  await page.addToBag();assert.equal(writes,0);assert.equal(page.data.success,null);
  await page.onShow();assert.equal(page.data.adding,false);assert.equal(page._needsReconfirmation,true);
});

test('C07 detail favorite state changes only after actual service success, restores on returning and ignores hidden responses',async()=>{
  let saved=false;const service={contains:()=>saved,set:async(id,value)=>{saved=value;return {scope:'LOCAL_DEVICE',favorited:saved};}};
  const {page,toasts}=productPage(createProductDetailClient(settings),undefined,undefined,service);
  page.onLoad({id:fixtures.items[0].productId});await page.onShow();await page.favorite();
  assert.equal(page.data.favorited,true);assert.match(toasts[0].title,/本机/);
  page.onHide();await page.onShow();assert.equal(page.data.favorited,true);await page.favorite();assert.equal(page.data.favorited,false);
  let resolve;const hidden=productPage(createProductDetailClient(settings),undefined,undefined,{contains:()=>false,set:()=>new Promise(done=>{resolve=done;})});
  hidden.page.onLoad({id:fixtures.items[0].productId});await hidden.page.onShow();
  const pending=hidden.page.favorite();hidden.page.onHide();resolve({scope:'LOCAL_DEVICE',favorited:true});await pending;
  assert.equal(hidden.page.data.favorited,false);assert.equal(hidden.toasts.length,0);
});

test('Favorite feedback follows confirmed state, ignores duplicate pending taps, and replaces animations without queuing',async()=>{
  const requests=[];
  const client={contains:()=>false,set:(id,value)=>{const pending=deferred();requests.push({...pending,value});return pending.promise;}};
  const {page}=productPage(createProductDetailClient(settings),undefined,undefined,client);
  page.onLoad({id:fixtures.items[0].productId});await page.onShow();
  const first=page.favorite();await page.favorite();
  assert.equal(requests.length,1);assert.equal(page.data.favorited,false);assert.equal(page.data.heartAnimation,'');
  requests[0].resolve({scope:'LOCAL_DEVICE',favorited:true});await first;
  assert.equal(page.data.favorited,true);assert.equal(page.data.heartAnimation,'heart-pop-a');
  const cancel=page.favorite();requests[1].resolve({scope:'LOCAL_DEVICE',favorited:false});await cancel;
  assert.equal(page.data.favorited,false);assert.equal(page.data.heartAnimation,'');
  const again=page.favorite();requests[2].resolve({scope:'LOCAL_DEVICE',favorited:true});await again;
  assert.equal(page.data.favorited,true);assert.equal(page.data.heartAnimation,'heart-pop-b');
  const failed=page.favorite();requests[3].reject(new Error('Storage unavailable'));await failed;
  assert.equal(page.data.favorited,true);assert.equal(page.data.heartAnimation,'');assert.equal(page.data.favoriteBusy,false);
  page.onHide();assert.equal(page.data.heartAnimation,'');
});
