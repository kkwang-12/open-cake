'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createLocalBagClient}=require('../miniprogram/services/local-bag');
const {createSpecificationClient}=require('../miniprogram/services/specification');
const fixture=require('../miniprogram/fixtures/specification-development');
const clone=value=>JSON.parse(JSON.stringify(value));
function page(service,modal=options=>options.success({confirm:false}),selection={},catalog={list:async()=>({items:[],hasMore:false})}){
  service={...service,reviewAll:service.reviewAll||service.review};
  let instance;const navigations=[],modals=[];
  vm.runInNewContext(fs.readFileSync('miniprogram/features/bag/bag.js','utf8'),{
    Page:value=>{instance=value;},wx:{showModal:options=>{modals.push(options);modal(options);}},
    require:name=>name.includes('local-bag')?service:name.includes('selection')?selection:name.includes('services/catalog')?catalog:{navigate:(...args)=>navigations.push(args)}
  });
  instance.data=clone(instance.data);instance.setData=patch=>Object.assign(instance.data,clone(patch));
  return {instance,navigations,modals};
}
function event(id,delta){return {currentTarget:{dataset:{id,delta}}};}
async function client(samples=fixture){
  const settings={stage:'development',mode:'shell',appId:'B03-OFFLINE'};let saved='';
  const platform={getStorageSync:()=>saved,setStorageSync:(_,value)=>{saved=clone(value);}};
  const service=createLocalBagClient(settings,platform,createSpecificationClient(settings,samples).get);
  const item=samples.items[1],sku=item.skus[0];
  await service.add({productId:item.productId,productVersion:item.version,skuId:sku.skuId,skuVersion:sku.version,
    selectedOptions:sku.selectedOptions,unitPriceCents:sku.unitPriceCents,quantity:1,cakeMessage:'B03离线验收'});
  return service;
}
test('bag quantity/remove totals include previously unchecked products without initiating checkout',async()=>{
  const service=await client(),{instance,navigations}=page(service);await instance.onShow();
  const id=instance.data.lines[0].lineId;
  await instance.changeQuantity(event(id,-1));assert.equal(instance.data.quantity,1);
  await instance.changeQuantity(event(id,1));assert.equal(instance.data.quantity,2);
  assert.equal(instance.data.subtotalLabel,'376');assert.equal(instance.data.busy,false);
  service.select(id,false,service.list().revision);
  instance.onHide();await instance.onShow();assert.equal(instance.data.lines[0].selected,true);
  assert.equal(instance.data.selectedQuantity,2);
  assert.deepEqual(clone(instance.data.lines),(await service.reviewAll()).lines);
  await instance.remove(event(id));assert.deepEqual(instance.data.lines,[]);assert.equal(instance.data.quantity,0);
  assert.deepEqual(navigations,[]);
});

test('B06 bag persists selection before routing, prevents repeated taps and does not route after hide',async()=>{
  const service=await client();let finish,calls=0;
  const selection={prepare:revision=>{calls++;assert.equal(revision,service.list().revision);return new Promise(resolve=>{finish=resolve;});}};
  const {instance,navigations}=page(service,undefined,selection);await instance.onShow();
  let pending=instance.previewSelected();await instance.previewSelected();assert.equal(calls,1);assert.equal(navigations.length,0);
  finish({});await pending;assert.deepEqual(navigations,[['checkout']]);assert.equal(instance.data.busy,false);
  pending=instance.previewSelected();instance.onHide();finish({});await pending;assert.equal(navigations.length,1);
});
test('B06 bag reports failed preview persistence without pretending navigation or successful refresh',async()=>{
  const service=await client();const {instance,navigations}=page(service,undefined,{prepare:async()=>{throw {code:'LOCAL_PREVIEW_WRITE_FAILED'};}});
  await instance.onShow();await instance.previewSelected();assert.match(instance.data.error,/无法打开/);assert.equal(navigations.length,0);
  const failing=page({...service,reviewAll:async()=>{throw new Error();}},undefined,{prepare:async()=>{throw {code:'LOCAL_BAG_CONFLICT'};}}).instance;
  failing._visible=true;failing.data.selectedQuantity=1;await failing.previewSelected();assert.match(failing.data.error,/读取或核验失败/);
});
test('B03 page prevents duplicate taps; failures retain persisted rows and show fixed messages',async()=>{
  const real=await client();let done;
  const service={...real,updateQuantity:()=>new Promise((_,reject)=>{done=reject;})};
  const {instance}=page(service);await instance.onShow();const id=instance.data.lines[0].lineId;
  const pending=instance.changeQuantity(event(id,1));assert.equal(instance.data.busy,true);
  await instance.changeQuantity(event(id,1));await instance.remove(event(id));
  assert.equal(real.list().quantity,1);
  done(Object.assign(new Error('PRIVATE'),{code:'LOCAL_BAG_WRITE_FAILED'}));await pending;
  assert.equal(instance.data.quantity,1);assert.equal(instance.data.busy,false);assert.match(instance.data.error,/保存失败/);
  assert(!instance.data.error.includes('PRIVATE'));
});
test('B03 late page quantity result stays hidden; failed reads never expose stale subtotal',async()=>{
  const real=await client();let done;
  const {instance}=page({...real,updateQuantity:()=>new Promise(resolve=>{done=resolve;})});
  await instance.onShow();const pending=instance.changeQuantity(event(instance.data.lines[0].lineId,1));
  instance.onHide();done({...real.list(),quantity:99});await pending;assert.equal(instance.data.quantity,1);
  const failed=page({review:async()=>{throw new Error('PRIVATE');}}).instance;
  failed.data.subtotalLabel='999';await failed.onShow();assert.equal(failed.data.subtotalLabel,'0');assert.deepEqual(failed.data.lines,[]);
});
test('B03 Home/Shop badge refreshes from the same bag count and clears on failure',()=>{
  let component;let quantity=4;
  vm.runInNewContext(fs.readFileSync('miniprogram/components/bag-count/bag-count.js','utf8'),{
    Component:value=>{component=value;},require:()=>({list:()=>{if(quantity===null)throw new Error();return {quantity};}})
  });
  const instance={...component.methods,data:clone(component.data),setData(patch){Object.assign(this.data,patch);}};
  component.lifetimes.attached.call(instance);assert.equal(instance.data.count,'4');
  quantity=100;component.pageLifetimes.show.call(instance);assert.equal(instance.data.count,'99+');
  quantity=0;instance.refresh();assert.equal(instance.data.count,'');quantity=null;instance.refresh();assert.equal(instance.data.count,'');
});

test('B04 conflicts refresh the current snapshot, without retrying a delta against newer data',async()=>{
  const service=await client(),{instance}=page(service);await instance.onShow();const id=instance.data.lines[0].lineId;
  service.select(id,false,service.list().revision);
  await instance.changeQuantity(event(id,1));
  assert.equal(service.list().quantity,1);assert.equal(instance.data.lines[0].selected,true);
  assert.match(instance.data.error,/已刷新/);assert.equal(instance.data.busy,false);
  await instance.changeQuantity(event(id,1));assert.equal(service.list().quantity,2);assert.equal(instance.data.error,'');
});

test('B04 failed refresh keeps a truthful read error rather than claiming the conflict was refreshed',async()=>{
  const {instance}=page({review:async()=>{throw new Error('read failed');}});
  await instance.onShow();await instance.failed({code:'LOCAL_BAG_CONFLICT'});
  assert.match(instance.data.error,/读取或核验失败/);assert(!instance.data.error.includes('已刷新'));
  assert.equal(instance.data.quantity,0);
});

test('B05 page confirmation cancel leaves snapshot unchanged; explicit accept applies current price and retains message',async()=>{
  const samples=clone(fixture),service=await client(samples);samples.items[1].skus[0].unitPriceCents=19900;
  const cancelled=page(service);await cancelled.instance.onShow();
  const line=cancelled.instance.data.lines[0];assert.equal(line.canSelect,false);assert.equal(cancelled.instance.data.subtotalLabel,'0');
  assert.equal(service.list().revision,1);
  await cancelled.instance.acceptChanges(event(line.lineId));assert.equal(service.list().lines[0].unitPriceCents,18800);
  assert.match(cancelled.modals[0].content,/199/);
  const approved=page(service,options=>options.success({confirm:true}));await approved.instance.onShow();
  await approved.instance.acceptChanges(event(line.lineId));assert.equal(service.list().lines[0].unitPriceCents,19900);
  assert.equal(approved.instance.data.subtotalLabel,'199');assert.equal(service.list().lines[0].cakeMessage,'B03离线验收');
});
test('B05 hiding during confirmation prevents a write; late review responses do not restore old rows',async()=>{
  const samples=clone(fixture),service=await client(samples);samples.items[1].skus[0].unitPriceCents=19900;
  let modal;const {instance}=page(service,options=>{modal=options;});await instance.onShow();
  const pending=instance.acceptChanges(event(instance.data.lines[0].lineId));instance.onHide();modal.success({confirm:true});await pending;
  assert.equal(service.list().lines[0].unitPriceCents,18800);
  let finish;const delayed=page({...service,reviewAll:()=>new Promise(resolve=>{finish=resolve;})}).instance;
  const loading=delayed.onShow();delayed.onHide();finish(await service.review());await loading;
  assert.deepEqual(delayed.data.lines,[]);assert.equal(delayed.data.subtotalLabel,'0');
});

test('bag thumbnails support shared products, missing/error images and do not alter reviewed money',async()=>{
  const real=await client(),snapshot=await real.reviewAll();
  const id=snapshot.lines[0].productId;
  snapshot.lines.push({...snapshot.lines[0],lineId:'different-spec',name:'很长的商品名称'.repeat(8),specLabel:'8寸 · 不同规格',cakeMessage:'独立留言'});
  snapshot.lines.push({...snapshot.lines[0],lineId:'missing-image',productId:'missing-image',specLabel:'单个'});
  const {instance}=page({reviewAll:async()=>snapshot},undefined,{},
    {list:async()=>({items:[{id,image:'/assets/real-product.jpg'},{id:'missing-image',image:''}],hasMore:false})});
  await instance.onShow();await instance.loadThumbnails(instance._epoch);
  assert.equal(instance.data.thumbnails[id],'/assets/real-product.jpg');
  assert.equal(instance.data.thumbnails['missing-image'],'');
  assert.deepEqual(instance.data.lines,snapshot.lines);assert.equal(instance.data.subtotalLabel,snapshot.subtotalLabel);
  instance.thumbnailError({currentTarget:{dataset:{id,src:'/assets/real-product.jpg'}}});
  assert.equal(instance.data.imageFailures[id],'/assets/real-product.jpg');
  let release;const pendingCatalog={list:()=>new Promise(resolve=>{release=resolve;})};
  const late=page({reviewAll:async()=>snapshot},undefined,{},pendingCatalog).instance;
  await late.onShow();late.onHide();release({items:[{id,image:'/late.jpg'}],hasMore:false});
  await Promise.resolve();assert.deepEqual(late.data.thumbnails,{});
});

test('bag measured bottom space matches wrapped summary and clears checkout when empty',async()=>{
  const service=await client(),{instance}=page(service);await instance.onShow();
  let callback;
  instance.createSelectorQuery=()=>({select:()=>({boundingClientRect:fn=>{callback=fn;return {exec:()=>{}};}})});
  // The runtime measurement includes wrapped notices and the safe-area padding.
  const source=fs.readFileSync('miniprogram/features/bag/bag.js','utf8');let measured;
  vm.runInNewContext(source,{Page:value=>{measured=value;},wx:{nextTick:fn=>fn()},require:()=>({})});
  measured.measureSummary.call(instance);callback({height:213.5});assert.equal(instance.data.summaryHeight,214);
  await instance.remove(event(instance.data.lines[0].lineId));
  assert.equal(instance.data.quantity,0);assert.equal(instance.data.selectedQuantity,0);assert.equal(instance.data.subtotalLabel,'0');
});
