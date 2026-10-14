'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,clone}=require('./fixtures/cart-cloud');
const {createCloudBagClient}=require('../miniprogram/services/cloud-bag');
const {createClient}=require('../miniprogram/services/cloud');
const {createSpecificationModel}=require('../miniprogram/utils/specification-model');
const {NORMALIZATION_VERSION}=require('../cloudfunctions/_shared/catalog-model');
function setup(){
  const s=fixture(),storage={},requests=[];let actor=0,lost='',next=0,swapAfterGet=false;
  const settings={appId:s.settings.appId,mode:'cloud',stage:'development',cloudEnvironments:{development:s.settings.environment},
    cart:{enabled:true,storeId:s.settings.storeId},catalog:{enabled:true,storeId:s.settings.storeId,allowedCloudPrefixes:[]}};
  const platform=()=>({getStorageSync:k=>clone(storage[k]||''),setStorageSync:(k,v)=>{storage[k]=clone(v);},cloud:{init(){},async callFunction(request){
    requests.push(clone(request));const result=await s.call(request.data.action,request.data.payload,actor);
    if(swapAfterGet&&request.data.action==='get'){actor=1;swapAfterGet=false;}
    if(lost===request.data.action){lost='';throw new Error('LOST_RESPONSE');}return {result};
  }}});
  const transport=createClient(settings,platform,{warn(){}});
  const readProduct=async()=>{
    const p=s.cat.product,sku=s.cat.skus[0];const configuration=createSpecificationModel({productId:p._id,version:p.version,name:p.name,categoryCode:p.categoryCode,
      optionGroups:p.optionGroups,skus:[{...sku,skuId:sku._id}],messagePolicy:p.messagePolicy,messageSupport:p.messagePolicy?'ENABLED':'DISABLED',
      minLeadTimeMinutes:p.minLeadTimeMinutes,source:'PUBLIC_CATALOG',canPurchase:false}).configuration();
    return {source:'PUBLIC_CATALOG',canPurchase:false,canConfigure:true,configuration};
  };
  const make=()=>createCloudBagClient(settings,platform,transport,readProduct,()=> 'offline-cart-client-'+(++next).toString().padStart(4,'0'));
  const client=make(),input={productId:s.cat.product._id,productVersion:1,skuId:s.cat.skus[0]._id,skuVersion:2,
    unitPriceCents:1000,selectedOptions:s.cat.selectedOptions,quantity:1,cakeMessage:'',operationId:'offline-cart-input-key'};
  return {s,settings,storage,requests,client,input,platform,transport,readProduct,
    lose:action=>{lost=action;},actor:index=>{actor=index;},swap:()=>{swapAfterGet=true;}};
}
const commands=s=>s.requests.filter(r=>r.data.action!=='get');
test('cloud bag service preserves existing page interface, shows current informational prices, and closes checkout/selection',async()=>{
  const f=setup(),empty=await f.client.reviewAll();assert.equal(empty.revision,0);assert.deepEqual(empty.lines,[]);
  const result=await f.client.add(f.input);assert.equal(result.addedQuantity,1);assert.equal(result.line.name,f.s.cat.product.name);
  const view=await f.client.reviewAll();assert.equal(view.scope,'CLOUD_SELECTION_DRAFT');assert.equal(view.quantity,1);
  assert.equal(view.selectedQuantity,0);assert.equal(view.checkoutAllowed,false);assert.equal(view.lines[0].canSelect,false);
  assert.equal(view.lines[0].canAdjust,true);assert.equal(view.lines[0].totalLabel,'10');
  for(const method of ['select','selectReviewed','acceptChanges'])assert.throws(()=>f.client[method](),e=>e.code==='CONFIGURATION_REQUIRED');
  const updated=await f.client.updateQuantity(view.lines[0].lineId,2,view.revision);assert.equal(updated.quantity,2);assert.equal(updated.revision,2);
  const removed=await f.client.remove(updated.lines[0].lineId,updated.revision);assert.deepEqual(removed.lines,[]);
  const payloads=commands(f).map(r=>r.data.payload);assert(payloads.every(p=>!('unitPriceCents'in p)&&!('ownerId'in p)));
  assert.equal(payloads[0].cartId,view.cartId);assert.equal(Object.values(f.storage).flat().length,0);
});
test('lost add response survives client reconstruction and uses the same immutable key/version instead of adding twice',async()=>{
  const f=setup();f.lose('add');await assert.rejects(f.client.add(f.input),e=>e.code==='CLOUD_CALL_FAILED');
  assert.equal((await f.client.list()).quantity,1);const saved=Object.values(f.storage).flat()[0];assert.equal(saved.payload.expectedVersion,0);
  const recovered=createCloudBagClient(f.settings,f.platform,f.transport,f.readProduct,()=> 'a-new-key-never-used');
  const replay=await recovered.add({...f.input,operationId:'new-page-operation-key'});assert.equal(replay.line.quantity,1);
  const sent=commands(f);assert.deepEqual(sent[0].data.payload,sent[1].data.payload);
  assert.equal(Object.values(f.s.state.idempotency_records).length,1);assert.equal(Object.values(f.s.state.users)[0].version,1);
  const next=await recovered.add({...f.input,operationId:'new-intent-operation-key'});assert.equal(next.line.quantity,2);
});
test('lost update/remove response recovery reuses original versions even after fresh GET changed or removed the line',async()=>{
  const f=setup();await f.client.add(f.input);let view=await f.client.list(),id=view.lines[0].lineId;
  f.lose('update');await assert.rejects(f.client.updateQuantity(id,2,view.revision),e=>e.code==='CLOUD_CALL_FAILED');
  view=await f.client.list();const replay=await f.client.updateQuantity(id,2,view.revision);assert.equal(replay.quantity,2);assert.equal(replay.revision,2);
  const updates=commands(f).filter(r=>r.data.action==='update');assert.deepEqual(updates[0].data.payload,updates[1].data.payload);
  f.lose('remove');await assert.rejects(f.client.remove(id,view.revision),e=>e.code==='CLOUD_CALL_FAILED');
  const empty=await f.client.list();assert.deepEqual(empty.lines,[]);
  assert.deepEqual((await f.client.remove(id,empty.revision)).lines,[]);
  const removes=commands(f).filter(r=>r.data.action==='remove');assert.deepEqual(removes[0].data.payload,removes[1].data.payload);
  assert.equal(Object.values(f.s.state.idempotency_records).length,3);
});
test('existing page refresh confirms committed lost responses including a removed line without new writes or fresh keys',async()=>{
  const f=setup();await f.client.add(f.input);let view=await f.client.reviewAll(),id=view.lines[0].lineId;
  f.lose('update');await assert.rejects(f.client.updateQuantity(id,2,view.revision));
  const beforeUpdate=clone(f.s.state);view=await f.client.reviewAll();assert.equal(view.quantity,2);
  assert.deepEqual(f.s.state,beforeUpdate);assert.equal(Object.values(f.storage).flat().length,0);
  const updates=commands(f).filter(r=>r.data.action==='update');assert.deepEqual(updates[0].data.payload,updates[1].data.payload);
  f.lose('remove');await assert.rejects(f.client.remove(id,view.revision));
  const beforeRemove=clone(f.s.state),empty=await f.client.reviewAll();assert.deepEqual(empty.lines,[]);
  assert.deepEqual(f.s.state,beforeRemove);assert.equal(Object.values(f.storage).flat().length,0);
  await f.client.add({...f.input,operationId:'offline-cart-new-user-intent'});assert.equal((await f.client.list()).quantity,1);
});
test('refresh does not send an unresolved mutation when its expected version has not advanced',async()=>{
  const f=setup();let failed=false;
  const transport={call:async(domain,action,payload)=>{if(action==='add'&&!failed){failed=true;throw Object.assign(new Error(),{code:'CLOUD_CALL_FAILED'});}return f.transport.call(domain,action,payload);}};
  const c=createCloudBagClient(f.settings,f.platform,transport,f.readProduct);await assert.rejects(c.add(f.input));
  assert.equal(commands(f).length,0);const empty=await c.reviewAll();assert.equal(empty.revision,0);assert.equal(commands(f).length,0);
  assert.equal(Object.values(f.storage).flat().length,1);await c.add(f.input);assert.equal((await c.list()).quantity,1);
});
test('unknown outcomes block different intents and isolate pending commands per native user, app and environment',async()=>{
  const f=setup();f.lose('add');await assert.rejects(f.client.add(f.input));
  await assert.rejects(f.client.add({...f.input,quantity:2}),e=>e.code==='BUSY');assert.equal(commands(f).length,1);
  f.actor(1);assert.deepEqual((await f.client.list()).lines,[]);await f.client.add({...f.input,operationId:'offline-cart-other-account'});
  assert.equal(Object.keys(f.s.state.carts).length,2);assert.equal(Object.values(f.storage).flat().length,1);
  const storageKey=Object.keys(f.storage)[0];assert(storageKey.includes(f.settings.appId));assert(storageKey.includes(f.settings.cloudEnvironments.development));
  f.actor(0);await f.client.add(f.input);assert.equal(Object.values(f.storage).flat().length,0);
});
test('native account change between GET and add is rejected before writing another account',async()=>{
  const f=setup();f.swap();await assert.rejects(f.client.add(f.input),e=>e.code==='NOT_FOUND');
  assert.equal(Object.keys(f.s.state.carts).length,0);assert.equal(Object.values(f.storage).flat().length,0);
});
test('current prices/versions and known ranges/message policies reject changed or invalid selections before a cloud write',async()=>{
  const f=setup();for(const patch of [{unitPriceCents:1},{skuVersion:0},{productVersion:9}])
    await assert.rejects(f.client.add({...f.input,...patch}),e=>e.code==='LOCAL_SELECTION_CHANGED');
  await assert.rejects(f.client.add({...f.input,cakeMessage:'无长度规则留言'}),e=>e.code==='INVALID_MESSAGE');
  f.s.cat.skus[0].minQuantity=2;f.s.cat.skus[0].maxQuantity=4;
  await assert.rejects(f.client.add(f.input),e=>e.code==='INVALID_QUANTITY');assert.equal(commands(f).length,0);
  f.s.cat.product.messagePolicy={maxLength:2,normalizationVersion:NORMALIZATION_VERSION};
  await assert.rejects(f.client.add({...f.input,quantity:2,cakeMessage:'三字长'}),e=>e.code==='INVALID_MESSAGE');
  const a=await f.client.add({...f.input,quantity:2,cakeMessage:'好'});assert.equal(a.line.cakeMessage,'好');
  const before=commands(f).length;await assert.rejects(f.client.updateQuantity(a.line.lineId,5,1),e=>e.code==='INVALID_QUANTITY');assert.equal(commands(f).length,before);
});
test('cloud bag config and malformed/private/wrong-subject responses fail closed, preserving unresolved command keys',async()=>{
  const f=setup();for(const patch of [{cart:{enabled:false,storeId:f.settings.cart.storeId}},{stage:'production'},{cart:{enabled:true,storeId:'another'}}]){
    const c=createCloudBagClient({...f.settings,...patch},f.platform,f.transport,f.readProduct);
    await assert.rejects(c.list(),e=>['CLOUD_NOT_CONFIGURED','INVALID_CONFIGURATION'].includes(e.code));}
  assert.equal(f.requests.length,0);
  const original=(await f.s.call('get',{storeId:f.settings.cart.storeId})).data;
  for(const mutate of [d=>{d.ownerId='private';},d=>{d.checkoutAllowed=true;},d=>{d.apiVersion='wrong';},d=>{d.subjectHash='wrong';},d=>{d.lines=new Array(101).fill({});}]){
    const data=clone(original);mutate(data);const c=createCloudBagClient(f.settings,f.platform,{call:async()=>({data})},f.readProduct);
    await assert.rejects(c.list(),e=>e.code==='INVALID_RESPONSE');}
  await f.client.add(f.input);const current=(await f.s.call('get',{storeId:f.settings.cart.storeId})).data;
  for(const mutate of [d=>{d.lines[0].display.unitPriceCents=0;},d=>{d.lines[0].messageFingerprint='private';},d=>{d.lines[0].cakeMessage='\ud800';},
    d=>{d.lines[0].display.selectedOptions[0].ownerId='private';}]){
    const data=clone(current);mutate(data);await assert.rejects(createCloudBagClient(f.settings,f.platform,{call:async()=>({data})},f.readProduct).list(),e=>e.code==='INVALID_RESPONSE');}
  const c=createCloudBagClient(f.settings,f.platform,{call:async(domain,action,payload)=>{
    const r=await f.transport.call(domain,action,payload);if(action==='update')r.data.subjectHash='abcdefabcdefabcd';return r;}},f.readProduct);
  await assert.rejects(c.updateQuantity(current.lines[0].lineId,2,current.version),e=>e.code==='INVALID_RESPONSE');
  assert.equal(Object.values(f.storage).flat().length,1);assert.equal(Object.values(f.storage).flat()[0].payload.expectedVersion,1);
});
test('terminal conflicts clear only that pending operation; local storage failures stop mutation before cloud writes',async()=>{
  const f=setup();await f.client.add(f.input);const current=await f.client.list();
  const transport={call:async(domain,action,payload)=>action==='update'?Promise.reject(Object.assign(new Error(),{code:'VERSION_CONFLICT'})):f.transport.call(domain,action,payload)};
  const c=createCloudBagClient(f.settings,f.platform,transport,f.readProduct);
  await assert.rejects(c.updateQuantity(current.lines[0].lineId,2,current.revision),e=>e.code==='LOCAL_BAG_CONFLICT');assert.equal(Object.values(f.storage).flat().length,0);
  const bad=()=>({getStorageSync:()=>'',setStorageSync:()=>{throw new Error();}});
  const d=createCloudBagClient(f.settings,bad,f.transport,f.readProduct);
  const count=commands(f).length;await assert.rejects(d.updateQuantity(current.lines[0].lineId,2,current.revision),e=>e.code==='LOCAL_BAG_WRITE_FAILED');assert.equal(commands(f).length,count);
});
