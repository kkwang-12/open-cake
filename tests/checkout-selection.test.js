'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createLocalBagClient}=require('../miniprogram/services/local-bag');
const {createSelectionClient,STORAGE_KEY}=require('../miniprogram/features/checkout/selection');
const {createSpecificationClient}=require('../miniprogram/services/specification');
const fixture=require('../miniprogram/fixtures/specification-development');
const clone=value=>JSON.parse(JSON.stringify(value));
const settings={stage:'development',mode:'shell',appId:'B06-OFFLINE'};
async function setup(){
  const data={},samples=clone(fixture),platform={getStorageSync:key=>clone(data[key]||''),setStorageSync:(key,value)=>{data[key]=clone(value);}};
  const reader=createSpecificationClient(settings,samples).get;
  const make=()=>{const bag=createLocalBagClient(settings,platform,reader);return {bag,selection:createSelectionClient(settings,platform,bag)};};
  const clients=make();
  for(const [skuIndex,message] of [[0,'第一份'],[1,'第二份'],[0,'第三份']]){
    const item=samples.items[0],sku=item.skus[skuIndex];
    await clients.bag.add({productId:item.productId,productVersion:item.version,skuId:sku.skuId,skuVersion:sku.version,
      selectedOptions:sku.selectedOptions,unitPriceCents:sku.unitPriceCents,quantity:1,cakeMessage:message});
  }
  return {...clients,data,samples,platform,make};
}
test('B06 three SKU/message rows persist; preview survives a new client and includes previously unselected rows',async()=>{
  const s=await setup();assert.equal(s.bag.list().lines.length,3);
  const id=s.bag.list().lines[1].lineId;await s.bag.selectReviewed(id,false,s.bag.list().revision);
  const before=JSON.stringify(s.bag.list());const input=await s.selection.prepare(s.bag.list().revision);
  assert.equal(input.lines.length,3);assert(!('subtotalCents' in input));
  const reloaded=s.make(),view=await reloaded.selection.get();
  assert.deepEqual(view.lines.map(line=>line.cakeMessage),['第一份','第二份','第三份']);assert.equal(view.subtotalCents,57400);
  assert.equal(view.checkoutAllowed,false);assert.equal(view.stockStatus,'UNKNOWN');assert.equal(JSON.stringify(reloaded.bag.list()),before);
});
test('B06 rejects empty, stale revision, changed catalog and tampered or duplicate selected IDs',async()=>{
  const s=await setup();await assert.rejects(s.selection.prepare(0),e=>e.code==='LOCAL_BAG_CONFLICT');
  await s.selection.prepare(3);const key=STORAGE_KEY+':'+settings.appId,original=clone(s.data[key]);
  for(const mutate of [value=>value.lines[0].lineId='not-in-bag',value=>value.lines.pop(),value=>value.lines.push(value.lines[0]),
    value=>value.lines[0].reviewToken='fake']){
    s.data[key]=clone(original);mutate(s.data[key]);await assert.rejects(s.selection.get(),e=>['LOCAL_SELECTION_CHANGED','LOCAL_PREVIEW_INVALID'].includes(e.code));
  }
  s.data[key]=original;s.samples.items[0].skus[0].unitPriceCents++;
  await assert.rejects(s.selection.get(),e=>e.code==='LOCAL_SELECTION_CHANGED');
  s.samples.items[0].skus[0].unitPriceCents--;await s.bag.selectReviewed(null,false,3);
  await assert.rejects(s.selection.get(),e=>e.code==='LOCAL_BAG_CONFLICT');
  const all=await s.selection.prepare(4);assert.equal(all.lines.length,3);
  s.samples.items[0].skus=[];await assert.rejects(s.selection.prepare(4),e=>e.code==='LOCAL_PREVIEW_EMPTY');
});
test('B06 unavailable checked rows never enter preview; storage failure and production gate fail closed',async()=>{
  const s=await setup();s.samples.items[0].skus.splice(0,1);
  await s.selection.prepare(3);const view=await s.selection.get();assert.equal(view.lines.length,1);assert.equal(view.subtotalCents,23800);
  const broken=createSelectionClient(settings,{...s.platform,setStorageSync(){throw new Error();}},s.bag);
  await assert.rejects(broken.prepare(3),e=>e.code==='LOCAL_PREVIEW_WRITE_FAILED');
  await assert.rejects(createSelectionClient({...settings,stage:'production'},s.platform,s.bag).get(),e=>e.code==='LOCAL_PREVIEW_UNAVAILABLE');
});

test('all-item bag amount and preview update together after quantity/remove with mixed eligibility',async()=>{
  const s=await setup();await s.bag.selectReviewed(null,false,3);
  let view=await s.bag.reviewAll();assert.equal(view.quantity,3);assert.equal(view.selectedQuantity,3);assert.equal(view.subtotalCents,57400);
  const id=view.lines[0].lineId;await s.bag.updateQuantity(id,3,view.revision);
  view=await s.bag.reviewAll();assert.equal(view.quantity,5);assert.equal(view.subtotalCents,91000);
  await s.selection.prepare(view.revision);let preview=await s.selection.get();
  assert.equal(preview.quantity,5);assert.equal(preview.subtotalCents,91000);assert.equal(preview.lines.length,3);
  s.samples.items[0].skus[1].unitPriceCents++;
  view=await s.bag.reviewAll();assert.equal(view.quantity,5);assert.equal(view.selectedQuantity,4);assert.equal(view.subtotalCents,67200);
  assert.equal(view.lines[1].canAcceptChanges,true);
  await s.selection.prepare(view.revision);preview=await s.selection.get();assert.equal(preview.quantity,4);assert.equal(preview.subtotalCents,67200);
  s.bag.remove(id,view.revision);view=await s.bag.reviewAll();
  assert.equal(view.quantity,2);assert.equal(view.selectedQuantity,1);assert.equal(view.subtotalCents,16800);
  await s.selection.prepare(view.revision);preview=await s.selection.get();assert.equal(preview.quantity,1);assert.equal(preview.subtotalCents,16800);
});
test('B06 quantity/message changes and a mutation during review invalidate old preview',async()=>{
  const s=await setup();await s.selection.prepare(3);
  await s.bag.updateQuantity(s.bag.list().lines[0].lineId,2,3);
  await assert.rejects(s.selection.get(),e=>e.code==='LOCAL_BAG_CONFLICT');
  let release;const delayed=createSelectionClient(settings,s.platform,{...s.bag,reviewAll:()=>new Promise(resolve=>{release=resolve;})});
  const preparing=delayed.prepare(4),view=await s.bag.review();s.bag.select(null,false,4);release(view);
  await assert.rejects(preparing,e=>e.code==='LOCAL_BAG_CONFLICT');
});
function page(service){
  let instance;const navigations=[];
  vm.runInNewContext(fs.readFileSync('miniprogram/features/checkout/checkout.js','utf8'),{
    Page:value=>{instance=value;},getCurrentPages:()=>[{route:'features/bag/bag'},{route:'features/checkout/checkout'}],
    wx:{navigateBack:value=>navigations.push(value)},require:name=>name==='./edit-return-state'?require('../miniprogram/features/checkout/edit-return-state').createEditReturnState():name==='./confirmation-session'?require('../miniprogram/features/checkout/confirmation-session'):name==='./appointment-status'?require('../miniprogram/features/checkout/appointment-status'):name==='./delivery-status'?require('../miniprogram/features/checkout/delivery-status'):name==='./selection'?service:name.includes('store-information')?
      require('../miniprogram/services/store-information'):name==='./fulfillment-draft'?{get:()=>({fulfillment:'PICKUP',revision:0,pickupContact:{name:'',phone:''},contactValid:false,fulfillmentAllowed:true,configurationChanged:false})}:name.includes('local-addresses')?
      {selection:()=>({address:null,notice:''})}:{pages:{bag:'/features/bag/bag'},navigate:name=>navigations.push(name)}
  });
  instance.data=clone(instance.data);instance.setData=patch=>Object.assign(instance.data,clone(patch));return {instance,navigations};
}
test('B06 checkout revalidates on return, clears stale totals and never offers an order method',async()=>{
  const s=await setup();await s.selection.prepare(3);const {instance,navigations}=page(s.selection);await instance.onShow();
  assert.equal(instance.data.lines.length,3);assert.equal(instance.data.checkoutAllowed,false);assert.equal(instance.submitOrder,undefined);
  instance.onHide();s.bag.select(null,false,3);await instance.onShow();assert.equal(instance.data.lines.length,0);
  assert.equal(instance.data.subtotalLabel,'0');assert.match(instance.data.error,/重新选择/);instance.goBag();assert.deepEqual(clone(navigations),[{delta:1}]);
});
test('B06 hidden checkout ignores late read and read failure clears all displayed amounts',async()=>{
  let done;const p=page({get:()=>new Promise(resolve=>{done=resolve;})}).instance;
  const pending=p.onShow();p.onHide();done({lines:[{}],subtotalLabel:'999'});await pending;assert.equal(p.data.subtotalLabel,'0');
  const failed=page({get:async()=>{throw new Error('private');}}).instance;await failed.onShow();
  assert.equal(failed.data.lines.length,0);assert(!failed.data.error.includes('private'));
});
