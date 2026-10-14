'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {fixture,clone}=require('./fixtures/cart-cloud');
const {resolveSku,NORMALIZATION_VERSION}=require('../cloudfunctions/_shared/catalog-model');
function command(cart,action,patch={}){const line=cart.lines[0];return {cartId:cart.cartId,expectedVersion:cart.version,
  lineId:line.lineId,expectedLineVersion:line.lineVersion,idempotencyKey:'offline-cart-'+action+'-key',...patch};}
const writes=s=>s.calls.filter(c=>['add','update'].includes(c.op)).length;
test('cloud draft permits valid selection with unknown purchase policies; CRUD and safe receipts guard owner and cart',async()=>{
  const s=fixture(),empty=await s.call('get',{storeId:s.settings.storeId});assert(empty.ok);assert.equal(writes(s),0);
  assert.equal(empty.data.cartId,s.ids[0]);assert.equal(empty.data.checkoutAllowed,false);
  assert.throws(()=>resolveSku(s.cat.product,s.cat.skus,s.cat.selectedOptions),e=>e.code==='CONFIGURATION_REQUIRED');
  const a=await s.call('add',s.add());assert(a.ok,JSON.stringify(a.error));assert.equal(a.data.version,1);
  const line=a.data.lines[0];assert.equal(line.cakeMessage,null);assert.equal(line.normalizationVersion,NORMALIZATION_VERSION);
  assert.equal(line.availability,'DRAFT_ONLY');assert.equal(line.display.minQuantity,null);
  const u=await s.call('update',command(a.data,'update',{skuId:line.skuId,selectedOptions:s.cat.selectedOptions,quantity:2}));
  assert(u.ok,JSON.stringify(u.error));assert.equal(u.data.version,2);assert.equal(u.data.lines[0].lineVersion,1);
  const r=await s.call('remove',command(u.data,'remove'));assert(r.ok);assert.equal(r.data.version,3);assert.deepEqual(r.data.lines,[]);
  assert.equal(Object.values(s.state.users)[0].version,3);assert.equal(Object.values(s.state.users)[0].defaultAddressId,'keep-this-address');
  const receipts=Object.values(s.state.idempotency_records);assert.equal(receipts.length,3);
  for(const receipt of receipts){assert.deepEqual(Object.keys(receipt.result).sort(),['entityId','errorCode','version']);
    assert.equal(receipt.result.entityId,s.ids[0]);assert.equal(receipt.retentionUntil,null);
    for(const field of ['response','lines','cakeMessage','openId','phone','ownerId'])assert(!JSON.stringify(receipt).includes('"'+field+'"'));}
  for(const field of ['ownerId','messageFingerprint','stockRequirements','openId'])assert(!JSON.stringify(a.data).includes('"'+field+'"'));
});
test('draft identity/capability/action boundaries reject before persistence; add binds its freshly read cart to the native account',async()=>{
  const s=fixture();for(const [context,code] of [[{},'AUTH_REQUIRED'],[{...s.contexts[0],APPID:'other'},'APP_MISMATCH'],[{...s.contexts[0],ENV:'other'},'ENV_MISMATCH']])
    assert.equal((await s.make(context)({action:'get',payload:{storeId:s.settings.storeId}})).error.code,code);
  for(const patch of [{enabled:false},{selectionDraft:false},{stage:'production'}])assert.equal((await s.make(undefined,{settings:{...s.settings,...patch}})({action:'get',payload:{storeId:s.settings.storeId}})).error.code,'CONFIGURATION_REQUIRED');
  for(const event of [{action:'admin'},{action:'get',payload:{storeId:s.settings.storeId,ownerId:'forged'}},{action:'add',payload:{...s.add(),unitPriceCents:1}},
    {action:'add',payload:{...s.add(),userInfo:s.contexts[0]}},{action:'add',payload:{...s.add(),cartId:undefined}}])assert.equal((await s.make()(event)).error.code,'INVALID_REQUEST');
  assert.equal(s.calls.length,0);
  const forged=await s.make()({action:'get',payload:{storeId:s.settings.storeId},userInfo:{OPENID:'B'},tcbContext:{OPENID:'B'}});
  assert.equal(forged.data.cartId,s.ids[0]);
  assert.equal((await s.call('add',s.add(),1)).error.code,'NOT_FOUND');assert.equal(writes(s),0);
  const a=(await s.call('add',s.add())).data;
  for(const action of ['update','remove'])assert.equal((await s.call(action,command(a,action,action==='update'?{skuId:a.lines[0].skuId,selectedOptions:s.cat.selectedOptions,quantity:2}:{}),1)).error.code,'NOT_FOUND');
  assert.deepEqual((await s.call('get',{storeId:s.settings.storeId},1)).data.lines,[]);
  s.state.carts[s.ids[0]].ownerId=Object.keys(s.state.users)[1];assert.equal((await s.call('get',{storeId:s.settings.storeId})).error.code,'NOT_FOUND');
});
test('known ranges/options/statuses/messages remain enforced without inventing unknown values',async()=>{
  const s=fixture();for(const patch of [{quantity:0},{quantity:1.5},{quantity:Number.MAX_SAFE_INTEGER},{selectedOptions:[]},{skuId:'other-sku'}]){
    const result=await s.call('add',s.add(patch));assert.equal(result.ok,false);}
  assert.equal((await s.call('add',s.add({cakeMessage:'待确认留言'}))).error.code,'CONFIGURATION_REQUIRED');
  s.cat.skus[0].minQuantity=2;s.cat.skus[0].maxQuantity=4;
  assert.equal((await s.call('add',s.add())).error.code,'INVALID_REQUEST');assert.equal(writes(s),0);
  s.cat.product.messagePolicy={maxLength:3,normalizationVersion:NORMALIZATION_VERSION};
  assert.equal((await s.call('add',s.add({quantity:2,cakeMessage:'超过三个字'}))).error.code,'INVALID_REQUEST');
  const a=await s.call('add',s.add({quantity:2}));assert(a.ok,JSON.stringify(a.error));assert.equal(a.data.lines[0].cakeMessage,'');
  const merged=await s.call('add',s.add({expectedVersion:1,quantity:3,idempotencyKey:'offline-cart-merge-key'}));assert.equal(merged.error.code,'INVALID_REQUEST');
  s.cat.product.status='OFF_SALE';const unavailable=await s.call('get',{storeId:s.settings.storeId});assert(unavailable.ok);
  assert.equal(unavailable.data.lines[0].display,null);assert.equal(unavailable.data.lines[0].availability,'UNAVAILABLE');
  assert((await s.call('remove',command(unavailable.data,'remove'))).ok);
});
test('receipt replay reauthorizes and projects current cart without writes or private snapshots, including empty current cart',async()=>{
  const s=fixture(),a=(await s.call('add',s.add())).data;
  const u=(await s.call('update',command(a,'update',{skuId:a.lines[0].skuId,selectedOptions:s.cat.selectedOptions,quantity:2}))).data;
  const count=writes(s),replay=await s.call('add',s.add());assert.equal(replay.data.version,2);assert.equal(replay.data.lines[0].quantity,2);assert.equal(writes(s),count);
  assert.equal((await s.call('add',s.add({quantity:3}))).error.code,'IDEMPOTENCY_KEY_REUSED');
  await s.call('remove',command(u,'remove'));assert.deepEqual((await s.call('add',s.add())).data.lines,[]);
  Object.values(s.state.users)[0].status='DISABLED';assert.equal((await s.call('add',s.add())).error.code,'AUTH_REQUIRED');
});
test('each persistence failure rolls back cart, receipt and owner writes; ambiguous provider error remains internal',async()=>{
  for(const name of ['carts','idempotency_records','users']){
    const s=fixture(),before=clone(s.state);s.setFailure(name);const r=await s.call('add',s.add());
    assert.equal(r.error.code,'INTERNAL_ERROR');assert.deepEqual(s.state,before);assert(!JSON.stringify([r,s.logs]).includes('PRIVATE_PROVIDER_FAILURE'));
  }
  const s=fixture();s.beforeTransaction(state=>{Object.values(state.users)[0].status='DISABLED';});
  assert.equal((await s.call('add',s.add())).error.code,'AUTH_REQUIRED');assert.equal(writes(s),0);
});
test('competing versions have one fixture winner; same-value new commands guard cart and owner, and old versions cannot write',async()=>{
  const s=fixture(),a=(await s.call('add',s.add())).data;
  const update=q=>command(a,'update',{skuId:a.lines[0].skuId,selectedOptions:s.cat.selectedOptions,quantity:q,idempotencyKey:'offline-cart-race-'+q});
  const race=await Promise.all([s.call('update',update(2)),s.call('update',update(3))]);assert.equal(race.filter(r=>r.ok).length,1);
  assert.equal(race.find(r=>!r.ok).error.code,'VERSION_CONFLICT');assert.equal(Object.values(s.state.idempotency_records).length,2);
  const current=race.find(r=>r.ok).data,unchanged=await s.call('update',command(current,'update',{
    skuId:current.lines[0].skuId,selectedOptions:s.cat.selectedOptions,quantity:current.lines[0].quantity,idempotencyKey:'offline-cart-same-key'}));
  assert(unchanged.ok);assert.equal(unchanged.data.version,3);assert.equal(Object.values(s.state.users)[0].version,3);
  assert.equal((await s.call('remove',command(a,'remove'))).error.code,'VERSION_CONFLICT');
});
test('transport line bound rejects corrupt oversized persisted bags and receipt references',async()=>{
  const s=fixture(),a=(await s.call('add',s.add())).data;
  const line=s.state.carts[s.ids[0]].lines[0];s.state.carts[s.ids[0]].lines=Array.from({length:101},(_,i)=>({...line,lineId:'offline-line-'+i,skuId:'offline-sku-'+i}));
  assert.equal((await s.call('get',{storeId:s.settings.storeId})).error.code,'INTERNAL_ERROR');
  s.state.carts[s.ids[0]].lines=[line];Object.values(s.state.idempotency_records)[0].result.entityId='another-cart';
  assert.equal((await s.call('add',s.add())).error.code,'INTERNAL_ERROR');assert.equal(a.version,1);
});
test('self-contained cart entry uses invocation identity and explicit draft switches; forged event identity cannot create records',async()=>{
  const s=fixture(),sdk={...s.cloud,DYNAMIC_CURRENT_ENV:'dynamic',init(){},getWXContext:()=>s.contexts[0]};
  const exports={},env={JJL_APP_ID:s.settings.appId,JJL_CLOUD_ENV:s.settings.environment,JJL_STAGE:'development',
    JJL_CART_ENABLED:'true',JJL_CART_SELECTION_DRAFT:'true',JJL_CART_STORE_ID:s.settings.storeId};
  new Function('exports','require','process',fs.readFileSync('cloudfunctions/cart/index.js','utf8'))(exports,
    name=>name==='wx-server-sdk'?sdk:require('../cloudfunctions/cart/'+name),{env});
  const invocation={environment:JSON.stringify({WX_OPENID:'A',WX_APPID:s.settings.appId}),namespace:s.settings.environment,request_id:'native-cart-test'};
  assert((await exports.main({action:'get',payload:{storeId:s.settings.storeId}},invocation)).ok);
  assert.equal((await exports.main({action:'add',payload:s.add(),userInfo:s.contexts[0]})).error.code,'AUTH_REQUIRED');assert.equal(writes(s),0);
});
