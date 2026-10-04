'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createLocalBagClient,STORAGE_KEY}=require('../miniprogram/services/local-bag');
const fixtures=require('../miniprogram/fixtures/specification-development');
const {createSpecificationClient}=require('../miniprogram/services/specification');
const clone=value=>JSON.parse(JSON.stringify(value));
const settings={stage:'development',mode:'shell',appId:'B05-OFFLINE'};
async function setup(){
  const item=clone(fixtures.items[0]);let saved='',reader=async()=>clone(item);
  const platform={getStorageSync:()=>clone(saved),setStorageSync:(_,value)=>{saved=clone(value);}};
  const client=createLocalBagClient(settings,platform,id=>reader(id));
  const sku=item.skus[0];await client.add({productId:item.productId,productVersion:item.version,skuId:sku.skuId,
    skuVersion:sku.version,unitPriceCents:sku.unitPriceCents,selectedOptions:sku.selectedOptions,quantity:2,cakeMessage:'保留这份祝福'});
  return {client,item,platform,key:STORAGE_KEY+':'+settings.appId,setReader:next=>{reader=next;}};
}
test('B05 current local review is read-only, explicitly unknown stock and never checkout authority',async()=>{
  const s=await setup(),before=JSON.stringify(s.platform.getStorageSync(s.key)),view=await s.client.review();
  assert.equal(view.lines[0].reviewStatus,'LOCAL_READY');assert.equal(view.subtotalCents,33600);
  assert.equal(view.lines[0].stockStatus,'UNKNOWN');assert.equal(view.lines[0].checkoutAllowed,false);
  assert.equal(JSON.stringify(s.platform.getStorageSync(s.key)),before);
  assert(!('candidate' in view.lines[0]));
});
test('B05 price change excludes a checked row until explicit fresh-token confirmation, preserving message/ID',async()=>{
  const s=await setup(),before=s.client.list().lines[0];s.item.skus[0].unitPriceCents=18800;s.item.skus[0].version++;
  const view=await s.client.review(),line=view.lines[0];
  assert.equal(line.reviewStatus,'PRICE_CHANGED');assert.equal(line.priceLabel,'168');assert.equal(line.currentPriceLabel,'188');
  assert.equal(view.selectedQuantity,0);assert.equal(line.canSelect,false);assert.equal(s.client.list().lines[0].unitPriceCents,16800);
  await assert.rejects(s.client.selectReviewed(line.lineId,true,view.revision),error=>error.code==='LOCAL_LINE_UNAVAILABLE');
  const updated=await s.client.acceptChanges(line.lineId,line.reviewToken,view.revision);
  assert.equal(updated.subtotalCents,37600);assert.equal(updated.lines[0].reviewStatus,'LOCAL_READY');
  assert.equal(updated.lines[0].cakeMessage,before.cakeMessage);assert.equal(updated.lines[0].lineId,before.lineId);
});
test('B05 unavailable and transient failures retain removable rows with distinct notices, not guessed sale status',async()=>{
  const s=await setup();
  for(const [code,status] of [['PRODUCT_UNAVAILABLE','PRODUCT_UNAVAILABLE'],['CLOUD_CALL_FAILED','REVIEW_FAILED'],['INVALID_RESPONSE','REVIEW_FAILED']]){
    s.setReader(async()=>{throw {code,message:'PRIVATE'};});const view=await s.client.review();
    assert.equal(view.lines[0].reviewStatus,status);assert.equal(view.subtotalCents,0);assert(!view.lines[0].reviewNotice.includes('PRIVATE'));
  }
  s.client.remove(s.client.list().lines[0].lineId,s.client.list().revision);assert.deepEqual((await s.client.review()).lines,[]);
});
test('B05 obsolete SKU, changed quantity policy and invalid historical message cannot be selected or silently rewritten',async()=>{
  for(const [mutate,status] of [
    [item=>item.skus.splice(0,1),'SKU_INVALID'],
    [item=>{item.skus[0].minQuantity=1;item.skus[0].maxQuantity=1;},'QUANTITY_INVALID'],
    [item=>{item.messagePolicy={maxLength:2,normalizationVersion:'unicode-nfc-trim-codepoints-v1'};},'MESSAGE_INVALID'],
    [item=>{item.messageSupport='DISABLED';},'MESSAGE_INVALID']
  ]){
    const s=await setup(),before=JSON.stringify(s.platform.getStorageSync(s.key));mutate(s.item);
    const view=await s.client.review();assert.equal(view.lines[0].reviewStatus,status);assert.equal(view.lines[0].canAcceptChanges,false);
    assert.equal(view.subtotalCents,0);assert.equal(JSON.stringify(s.platform.getStorageSync(s.key)),before);
  }
});
test('B05 changing display/version requires confirmation even when price stays unchanged',async()=>{
  const s=await setup();s.item.name='更新后的商品名称';s.item.version++;
  const view=await s.client.review();assert.equal(view.lines[0].reviewStatus,'CONFIG_CHANGED');
  assert.equal(view.lines[0].name,'草莓鲜奶蛋糕');
  const updated=await s.client.acceptChanges(view.lines[0].lineId,view.lines[0].reviewToken,view.revision);
  assert.equal(updated.lines[0].name,'更新后的商品名称');assert.equal(updated.lines[0].cakeMessage,'保留这份祝福');
});
test('B05 newer prices and newer bag revisions invalidate an old confirmation token',async()=>{
  const s=await setup();s.item.skus[0].unitPriceCents=18800;let view=await s.client.review();s.item.skus[0].unitPriceCents=19800;
  await assert.rejects(s.client.acceptChanges(view.lines[0].lineId,view.lines[0].reviewToken,view.revision),error=>error.code==='LOCAL_SELECTION_CHANGED');
  view=await s.client.review();s.client.select(null,false,view.revision);
  await assert.rejects(s.client.acceptChanges(view.lines[0].lineId,view.lines[0].reviewToken,view.revision),error=>error.code==='LOCAL_BAG_CONFLICT');
  assert.equal(s.client.list().lines[0].unitPriceCents,16800);
});
test('B05 full selection skips blocked rows; late reviews cannot describe a newer/deleted bag',async()=>{
  const s=await setup();const row=s.client.list().lines[0];
  const data=s.platform.getStorageSync(s.key);data.lines.push({...row,lineId:'offline-other-row',productId:'development-example-removed'});
  s.platform.setStorageSync(s.key,data);s.setReader(async id=>{if(id!==s.item.productId)throw {code:'PRODUCT_UNAVAILABLE'};return s.item;});
  const result=await s.client.selectReviewed(null,true,s.client.list().revision);assert.equal(result.selectedQuantity,2);assert.equal(result.lines[1].selected,false);
  let finish;s.setReader(()=>new Promise(resolve=>{finish=()=>resolve(s.item);}));
  // Use one row for deterministic delayed read.
  s.client.remove('offline-other-row',s.client.list().revision);const pending=s.client.review();
  s.client.remove(row.lineId,s.client.list().revision);finish();
  await assert.rejects(pending,error=>error.code==='LOCAL_BAG_CONFLICT');assert.deepEqual(s.client.list().lines,[]);
});
test('B05 missing development configuration is unavailable; malformed duplicates still fail as configuration errors',async()=>{
  const reader=createSpecificationClient(settings);
  await assert.rejects(reader.get('development-example-removed'),error=>error.code==='PRODUCT_UNAVAILABLE');
  const duplicates=clone(fixtures);duplicates.items.push(clone(duplicates.items[0]));
  await assert.rejects(createSpecificationClient(settings,duplicates).get(duplicates.items[0].productId),error=>error.code==='INVALID_RESPONSE');
});
