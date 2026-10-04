'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createLocalBagClient,STORAGE_KEY}=require('../miniprogram/services/local-bag');
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

test('B03 older draft rows read without storage migration; selection and counts persist across reopening',async()=>{
  const platform=storage(),client=createLocalBagClient(settings,platform,read);
  await client.add(input(undefined,{quantity:2}));await client.add(input(fixture.items[2]));
  const key=STORAGE_KEY+':'+settings.appId, old=platform.getStorageSync(key);
  delete old.revision;old.lines.forEach(line=>delete line.selected);platform.setStorageSync(key,old);
  const raw=JSON.stringify(platform.getStorageSync(key));const initial=client.list();
  assert.equal(JSON.stringify(platform.getStorageSync(key)),raw);assert.equal(initial.revision,0);
  assert.equal(initial.quantity,3);assert.equal(initial.selectedQuantity,3);assert.equal(initial.allSelected,true);
  const changed=client.select(initial.lines[0].lineId,false,initial.revision);
  assert.equal(changed.quantity,3);assert.equal(changed.selectedQuantity,1);
  assert.equal(changed.subtotalCents,changed.lines[1].unitPriceCents);
  assert.deepEqual(createLocalBagClient(settings,platform,read).list(),changed);
  const none=client.select(null,false,changed.revision);
  assert.equal(none.subtotalCents,0);assert.equal(none.selectedQuantity,0);assert.equal(none.checkoutAllowed,false);
  assert.equal(client.select(null,false,none.revision).revision,none.revision);
  assert.equal(client.select(null,true,none.revision).allSelected,true);
});

test('B03 quantity updates recheck SKU/price/limits and preserve selection/message/identity',async()=>{
  const platform=storage(),item=clone(fixture.items[1]);item.skus[0].minQuantity=1;item.skus[0].maxQuantity=3;
  const client=createLocalBagClient(settings,platform,async()=>item);
  const added=await client.add(input(item,{cakeMessage:'生日快乐'}));
  const initial=client.select(added.line.lineId,false,client.list().revision);
  const updated=await client.updateQuantity(added.line.lineId,3,initial.revision);
  assert.equal(updated.lines[0].lineId,added.line.lineId);assert.equal(updated.lines[0].cakeMessage,'生日快乐');
  assert.equal(updated.lines[0].selected,false);assert.equal(updated.quantity,3);assert.equal(updated.subtotalCents,0);
  for(const quantity of [0,4,1.2,'2'])await assert.rejects(client.updateQuantity(added.line.lineId,quantity,updated.revision));
  item.skus[0].unitPriceCents++;
  await assert.rejects(client.updateQuantity(added.line.lineId,2,updated.revision),error=>error.code==='LOCAL_SELECTION_CHANGED');
  assert.deepEqual(client.list(),updated);
});

test('B03 asynchronous quantity change cannot restore a deleted row or overwrite a newer selection',async()=>{
  const platform=storage();let release,waiting=false;
  const client=createLocalBagClient(settings,platform,id=>waiting?new Promise(resolve=>{release=()=>resolve(read(id));}):read(id));
  const added=await client.add(input());waiting=true;const initial=client.list();
  const pending=client.updateQuantity(added.line.lineId,2,initial.revision);
  const selected=client.select(added.line.lineId,false,initial.revision);release();
  await assert.rejects(pending,error=>error.code==='LOCAL_BAG_CONFLICT');assert.deepEqual(client.list(),selected);
  assert.throws(()=>client.remove(added.line.lineId,initial.revision),error=>error.code==='LOCAL_BAG_CONFLICT');
  const pendingDelete=client.updateQuantity(added.line.lineId,2,selected.revision);
  client.remove(added.line.lineId,selected.revision);release();
  await assert.rejects(pendingDelete,error=>error.code==='LOCAL_BAG_CONFLICT');assert.deepEqual(client.list().lines,[]);
});

test('B03 selection/quantity failures do not return a success and summaries reject overflow',async()=>{
  const platform=storage(),client=createLocalBagClient(settings,platform,read);
  const added=await client.add(input());const initial=client.list();
  const originalSet=platform.setStorageSync;platform.setStorageSync=()=>{throw new Error('quota');};
  assert.throws(()=>client.select(null,false,initial.revision),error=>error.code==='LOCAL_BAG_WRITE_FAILED');
  await assert.rejects(client.updateQuantity(added.line.lineId,2,initial.revision),error=>error.code==='LOCAL_BAG_WRITE_FAILED');
  assert.deepEqual(client.list(),initial);platform.setStorageSync=originalSet;
  const key=STORAGE_KEY+':'+settings.appId, data=platform.getStorageSync(key);
  data.lines[0].unitPriceCents=Number.MAX_SAFE_INTEGER;
  data.lines.push({...data.lines[0],lineId:'another-line'});platform.setStorageSync(key,data);
  assert.throws(()=>client.list(),error=>error.code==='LOCAL_BAG_INVALID');
});

test('B04 uncertain readback retries with persisted receipt once, even after client recreation',async()=>{
  const platform=storage();let failNext=false;
  const originalGet=platform.getStorageSync,originalSet=platform.setStorageSync;
  platform.getStorageSync=key=>{if(failNext){failNext=false;throw new Error('offline readback failure');}return originalGet(key);};
  platform.setStorageSync=(key,value)=>{originalSet(key,value);failNext=true;};
  const client=createLocalBagClient(settings,platform,read),intent=input(undefined,{operationId:'local_retry_operation_001'});
  await assert.rejects(client.add(intent),error=>error.code==='LOCAL_BAG_WRITE_FAILED');
  assert.equal(client.list().quantity,1);
  const reopened=createLocalBagClient(settings,platform,async()=>{throw new Error('catalog now unavailable');});
  const replay=await reopened.add(intent);
  assert.equal(replay.addedQuantity,1);assert.equal(reopened.list().quantity,1);
  assert.equal(reopened.list().revision,1);
  await assert.rejects(reopened.add({...intent,quantity:2}),error=>error.code==='LOCAL_OPERATION_REUSED');
  assert.equal(reopened.list().quantity,1);
});

test('B04 concurrent duplicate add shares one result; distinct keys remain deliberate additions',async()=>{
  const platform=storage(),client=createLocalBagClient(settings,platform,read);
  const intent=input(undefined,{operationId:'local_concurrent_operation_001'});
  const results=await Promise.all([client.add(intent),client.add(intent)]);
  assert.deepEqual(results[0],results[1]);assert.equal(client.list().quantity,1);assert.equal(client.list().revision,1);
  await client.add({...intent,operationId:'local_concurrent_operation_002'});
  assert.equal(client.list().quantity,2);assert.equal(client.list().revision,2);
  const id=client.list().lines[0].lineId;client.remove(id,2);
  await client.add(intent);assert.equal(client.list().quantity,0);assert.equal(client.list().revision,3);
});

test('B04 read-only refresh never repeats a failed absolute quantity write or restores deleted lines',async()=>{
  const platform=storage(),client=createLocalBagClient(settings,platform,read);
  const result=await client.add(input());const revision=client.list().revision;
  let failNext=false;const originalGet=platform.getStorageSync,originalSet=platform.setStorageSync;
  platform.getStorageSync=key=>{if(failNext){failNext=false;throw new Error('readback');}return originalGet(key);};
  platform.setStorageSync=(key,value)=>{originalSet(key,value);failNext=true;};
  await assert.rejects(client.updateQuantity(result.line.lineId,2,revision),error=>error.code==='LOCAL_BAG_WRITE_FAILED');
  assert.equal(client.list().quantity,2);assert.equal(client.list().quantity,2);
  await assert.rejects(client.updateQuantity(result.line.lineId,2,revision),error=>error.code==='LOCAL_BAG_CONFLICT');
  assert.throws(()=>client.remove(result.line.lineId,client.list().revision),error=>error.code==='LOCAL_BAG_WRITE_FAILED');
  assert.deepEqual(client.list().lines,[]);
});
