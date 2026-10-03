'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createLocalBagClient}=require('../miniprogram/services/local-bag');
const {createSpecificationClient}=require('../miniprogram/services/specification');
const fixture=require('../miniprogram/fixtures/specification-development');
const settings={stage:'development',mode:'shell',appId:'OFFLINE-TEST-ONLY'};
const clone=value=>JSON.parse(JSON.stringify(value));
function storage(){const records=new Map();return {getStorageSync:key=>records.get(key)||'',setStorageSync:(key,value)=>records.set(key,clone(value))};}
function input(item=fixture.items[1],overrides={}){
  const sku=item.skus[0];
  return {productId:item.productId,productVersion:item.version,skuId:sku.skuId,skuVersion:sku.version,
    selectedOptions:sku.selectedOptions,unitPriceCents:sku.unitPriceCents,quantity:1,cakeMessage:'',...overrides};
}
const read=createSpecificationClient(settings).get;
test('Local Bag really persists and reopens, merges only identical SKU/normalized message and never permits checkout',async()=>{
  const platform=storage(),client=createLocalBagClient(settings,platform,read);
  await client.add(input(undefined,{quantity:2,cakeMessage:'  生日快乐  '}));
  const reopened=createLocalBagClient(settings,platform,read);assert.equal(reopened.list().lines[0].quantity,2);
  await reopened.add(input(undefined,{cakeMessage:'生日快乐'}));assert.equal(reopened.list().lines[0].quantity,3);
  await reopened.add(input(undefined,{cakeMessage:'另一份祝福'}));assert.equal(reopened.list().lines.length,2);
  assert.equal(reopened.list().checkoutAllowed,false);assert.ok(reopened.list().lines.every(line=>line.requiresCloudValidation&&line.checkoutAllowed===false));
  const lines=reopened.list().lines;lines[0].quantity=99;assert.equal(reopened.list().lines[0].quantity,3);
  reopened.remove(lines[0].lineId);assert.equal(reopened.list().lines.length,1);
});
test('Local Bag never acknowledges storage exception or failed readback',async()=>{
  for(const platform of [{getStorageSync:()=>'',setStorageSync:()=>{throw new Error('Quota');}},
    {getStorageSync:()=>'',setStorageSync:()=>{}}]){
    await assert.rejects(createLocalBagClient(settings,platform,read).add(input()),error=>error.code==='LOCAL_BAG_WRITE_FAILED');
  }
});
test('Local Bag rechecks current SKU/version/price, rejects tampering and prevents merge above configured quantities',async()=>{
  for(const change of [{skuVersion:99},{productVersion:99},{unitPriceCents:1},{skuId:'fake'}, {selectedOptions:[]}]){
    await assert.rejects(createLocalBagClient(settings,storage(),read).add(input(undefined,change)),error=>error.code==='LOCAL_SELECTION_CHANGED');
  }
  const item=clone(fixture.items[1]);item.skus[0].minQuantity=1;item.skus[0].maxQuantity=2;
  const client=createLocalBagClient(settings,storage(),async()=>item);
  await client.add(input(item,{quantity:2}));
  await assert.rejects(client.add(input(item)),error=>error.code==='INVALID_QUANTITY');
  assert.equal(client.list().lines[0].quantity,2);
});
test('Local Bag validates messages, category restrictions and integer quantities; no preview storage access outside development shell',async()=>{
  const client=createLocalBagClient(settings,storage(),read);
  for(const quantity of [0,-1,1.5,Number.MAX_SAFE_INTEGER])await assert.rejects(client.add(input(undefined,{quantity})));
  await assert.rejects(client.add(input(fixture.items.find(item=>item.categoryCode==='BREAD'),{cakeMessage:'not allowed'})),error=>error.code==='MESSAGE_NOT_SUPPORTED');
  await assert.rejects(client.add(input(undefined,{cakeMessage:'\uD800'})),error=>error.code==='INVALID_MESSAGE');
  const data=clone(fixture.items[1]);data.messagePolicy={maxLength:2,normalizationVersion:'unicode-nfc-trim-codepoints-v1'};
  await assert.rejects(createLocalBagClient(settings,storage(),async()=>data).add(input(data,{cakeMessage:'生日快乐'})),error=>error.code==='INVALID_MESSAGE');
  for(const config of [{...settings,stage:'production'},{...settings,stage:'test'},{...settings,mode:'cloud'}]){
    let accessed=false;const closed=createLocalBagClient(config,{getStorageSync:()=>{accessed=true;}},read);
    assert.throws(()=>closed.list(),error=>error.code==='LOCAL_BAG_UNAVAILABLE');assert.equal(accessed,false);
  }
});
