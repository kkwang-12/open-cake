'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createCartService, cartId } = require('../cloudfunctions/_shared/cart-service');
const { identityFromPlatform, resolveCustomer } = require('../cloudfunctions/_shared/authorization-model');
const { catalog } = require('./fixtures/catalog');
const clone = value => JSON.parse(JSON.stringify(value));
function principal(openId) {
  const settings = { appId:'offline-app', environment:'offline-env', stage:'development' };
  const platform = { OPENID:openId, APPID:settings.appId, ENV:settings.environment };
  return resolveCustomer(platform,settings,{...identityFromPlatform(platform,settings),
    schemaVersion:1,version:0,status:'ACTIVE'});
}
// Test-only serializable session with rollback and create/version checks. It is
// deliberately outside the mini-program and is not a substitute for cloud SDK QA.
function setup() {
  const state = { carts:{}, receipts:{}, writes:0, catalogs:{}, limits:{maxLines:3,maxQuantityPerLine:6} };
  const cat = catalog(); state.catalogs[cat.product._id] = cat;
  let queue = Promise.resolve(), line = 0;
  const runTransaction = work => {
    const pending = queue.then(async () => {
      const staged = clone(state);
      const result = await work({
        readCart: async id => staged.carts[id] || null,
        readReceipt: async id => staged.receipts[id] || null,
        readCatalog: async id => staged.catalogs[id] || null,
        readLimits: async () => staged.limits,
        saveCart: async (cart,expected) => {
          const current = staged.carts[cart._id];
          if (expected === null ? !!current : !current || current.version !== expected) {
            throw Object.assign(new Error('conflict'),{code:'VERSION_CONFLICT'});
          }
          staged.carts[cart._id] = clone(cart); staged.writes++;
        },
        saveReceipt: async (id,receipt) => {
          if (staged.receipts[id]) throw new Error('receipt already exists');
          staged.receipts[id] = clone(receipt);
          if (state.failReceipt) throw new Error('offline injected persistence failure');
        }
      });
      Object.assign(state,staged); return result;
    });
    queue = pending.catch(() => {}); return pending;
  };
  const service = createCartService({runTransaction,now:()=>2000,newLineId:()=> 'offline-line-'+(++line)});
  const customer = principal('A');
  const add = (patch={}) => ({action:'add',payload:{storeId:cat.product.storeId,
    expectedVersion:0,productId:cat.product._id,skuId:cat.skus[0]._id,
    selectedOptions:cat.selectedOptions,quantity:1,idempotencyKey:'offline-add-key-0001',...patch}});
  const get = () => service.execute({action:'get',payload:{storeId:cat.product.storeId}},customer);
  return {state,cat,service,customer,add,get};
}
function mutation(action,cart,patch={}) {
  return {action,payload:{cartId:cart.cartId,expectedVersion:cart.version,
    lineId:cart.lines[0].lineId,expectedLineVersion:cart.lines[0].lineVersion,
    idempotencyKey:'offline-'+action+'-key-0001',...patch}};
}
async function rejects(work,code) { await assert.rejects(work,error=>error.code===code); }

test('B01 CRUD preserves stable IDs and versions; GET is a private-field whitelist',async()=>{
  const s = setup(); const empty = await s.get();
  assert.equal(empty.version,0); assert.equal(s.state.writes,0);
  const added = await s.service.execute(s.add(),s.customer);
  assert.equal(added.cartId,empty.cartId); assert.equal(added.version,1);
  const line = added.lines[0]; assert.equal(line.lineVersion,0);
  assert(!('ownerId' in added)); assert(!('messageFingerprint' in line));
  assert(!('unitPriceCents' in line));
  const updated = await s.service.execute(mutation('update',added,{
    skuId:line.skuId,selectedOptions:s.cat.selectedOptions,quantity:2}),s.customer);
  assert.equal(updated.lines[0].lineId,line.lineId);
  assert.equal(updated.lines[0].lineVersion,1); assert.equal(updated.version,2);
  const removed = await s.service.execute(mutation('remove',updated),s.customer);
  assert.equal(removed.version,3); assert.deepEqual(removed.lines,[]);
  assert.deepEqual(await s.get(),removed);
});

test('B01 D06 principal required; B cannot read/change A; forged owner fields rejected',async()=>{
  const s=setup(), a=await s.service.execute(s.add(),s.customer), b=principal('B');
  await rejects(()=>s.service.execute({action:'get',payload:{storeId:s.cat.product.storeId}},
    {type:'CUSTOMER',subjectId:s.customer.subjectId}), 'AUTH_REQUIRED');
  const bCart=await s.service.execute({action:'get',payload:{storeId:s.cat.product.storeId}},b);
  assert.notEqual(bCart.cartId,a.cartId); assert.deepEqual(bCart.lines,[]);
  for(const action of ['update','remove']) {
    await rejects(()=>s.service.execute(mutation(action,a,action==='update'?{
      skuId:a.lines[0].skuId,selectedOptions:s.cat.selectedOptions,quantity:2}:{}),b),'FORBIDDEN');
  }
  for(const patch of [{ownerId:b.subjectId},{unitPriceCents:1},{userId:b.subjectId}]) {
    await rejects(()=>s.service.execute(s.add(patch),s.customer),'INVALID_REQUEST');
  }
  assert.equal(s.state.writes,1);
});

test('B01 rejects illegal SKU, quantities, missing configs and line limits without partial writes',async()=>{
  const s=setup();
  for(const quantity of [0,-1,1.2,'2',Number.MAX_SAFE_INTEGER+1]) {
    await rejects(()=>s.service.execute(s.add({quantity}),s.customer),'INVALID_REQUEST');
  }
  await rejects(()=>s.service.execute(s.add({skuId:'other'}),s.customer),'SKU_SELECTION_MISMATCH');
  await rejects(()=>s.service.execute(s.add({quantity:7}),s.customer),'INVALID_QUANTITY');
  s.state.limits=null;
  await rejects(()=>s.service.execute(s.add(),s.customer),'CONFIGURATION_REQUIRED');
  assert.equal(s.state.writes,0); assert.equal(Object.keys(s.state.receipts).length,0);
  s.state.limits={maxLines:1,maxQuantityPerLine:6};
  const a=await s.service.execute(s.add({cakeMessage:'a'}),s.customer);
  await rejects(()=>s.service.execute(s.add({expectedVersion:a.version,cakeMessage:'b',
    idempotencyKey:'offline-add-key-0002'}),s.customer),'CART_LIMIT_EXCEEDED');
  assert.equal(s.state.writes,1);
});

test('B01 two concurrent writes from same version cannot overwrite each other',async()=>{
  const s=setup();
  const results=await Promise.allSettled([s.service.execute(s.add(),s.customer),
    s.service.execute(s.add({idempotencyKey:'offline-add-key-0002'}),s.customer)]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  assert.equal(results.find(result=>result.status==='rejected').reason.code,'VERSION_CONFLICT');
  assert.equal((await s.get()).lines[0].quantity,1);
  const cart=await s.get();
  await rejects(()=>s.service.execute(mutation('remove',cart,{expectedLineVersion:99}),s.customer),'VERSION_CONFLICT');
});

test('B01 receipt retry returns original result; changed payload with same key fails',async()=>{
  const s=setup(), event=s.add();
  const results=await Promise.all([s.service.execute(event,s.customer),s.service.execute(event,s.customer)]);
  assert.deepEqual(results[0],results[1]); assert.equal(s.state.writes,1);
  await rejects(()=>s.service.execute(s.add({quantity:2}),s.customer),'IDEMPOTENCY_KEY_REUSED');
  const removed=await s.service.execute(mutation('remove',results[0]),s.customer);
  assert.deepEqual(await s.service.execute(event,s.customer),results[0]);
  assert.deepEqual(await s.get(),removed); assert.equal(s.state.writes,2);
});

test('B01 cart and receipt roll back together on storage failure',async()=>{
  const s=setup(); s.state.failReceipt=true;
  await assert.rejects(()=>s.service.execute(s.add(),s.customer),/injected persistence failure/);
  assert.equal(s.state.writes,0); assert.deepEqual(s.state.carts,{});
  assert.deepEqual(s.state.receipts,{}); s.state.failReceipt=false;
  assert.equal((await s.service.execute(s.add(),s.customer)).version,1);
});

test('B01 unavailable product remains removable even without catalog/config; add holds no stock',async()=>{
  const s=setup(); s.state.inventory={available:0,reserved:0};
  const cart=await s.service.execute(s.add(),s.customer);
  assert.deepEqual(s.state.inventory,{available:0,reserved:0});
  s.state.catalogs={}; s.state.limits=null;
  await rejects(()=>s.service.execute(mutation('update',cart,{skuId:cart.lines[0].skuId,
    selectedOptions:s.cat.selectedOptions,quantity:2}),s.customer),'PRODUCT_UNAVAILABLE');
  const removed=await s.service.execute(mutation('remove',cart),s.customer);
  assert.deepEqual(removed.lines,[]); assert.deepEqual(s.state.inventory,{available:0,reserved:0});
});

test('B01 unchanged UPDATE does not advance cart/line version but still records retry receipt',async()=>{
  const s=setup(), cart=await s.service.execute(s.add(),s.customer);
  const event=mutation('update',cart,{skuId:cart.lines[0].skuId,selectedOptions:s.cat.selectedOptions,quantity:1});
  assert.deepEqual(await s.service.execute(event,s.customer),cart);
  assert.deepEqual(await s.service.execute(event,s.customer),cart);
  assert.equal(s.state.writes,1); assert.equal(Object.keys(s.state.receipts).length,2);
  assert.equal(cartId(s.customer,cart.storeId),cart.cartId);
});

test('B02 NFC/trim equivalent messages merge; different messages keep separate stable lines',async()=>{
  const s=setup();
  const first=await s.service.execute(s.add({cakeMessage:' e\u0301 '}),s.customer);
  const merged=await s.service.execute(s.add({expectedVersion:1,cakeMessage:'é',
    idempotencyKey:'offline-add-key-0002'}),s.customer);
  assert.equal(merged.lines.length,1); assert.equal(merged.lines[0].quantity,2);
  assert.equal(merged.lines[0].cakeMessage,'é');
  assert.equal(merged.lines[0].lineId,first.lines[0].lineId);
  const different=await s.service.execute(s.add({expectedVersion:2,cakeMessage:'谢谢你',
    idempotencyKey:'offline-add-key-0003'}),s.customer);
  assert.equal(different.lines.length,2);
  assert.notEqual(different.lines[0].lineId,different.lines[1].lineId);
  await rejects(()=>s.service.execute(s.add({expectedVersion:3,cakeMessage:'é',quantity:5,
    idempotencyKey:'offline-add-key-0004'}),s.customer),'INVALID_QUANTITY');
  assert.deepEqual(await s.get(),different);
});

test('B02 equal prices on distinct SKUs do not merge, and store scope cannot be forged',async()=>{
  const s=setup();
  const second=clone(s.cat.skus[0]); second._id='offline-second-sku';
  second.selectedOptions[0]={groupCode:'SIZE',optionCode:'LARGE',label:'测试大尺寸'};
  s.state.catalogs[s.cat.product._id].skus.push(second);
  const first=await s.service.execute(s.add(),s.customer);
  const result=await s.service.execute(s.add({expectedVersion:1,skuId:second._id,
    selectedOptions:second.selectedOptions.map(({groupCode,optionCode})=>({groupCode,optionCode})),
    idempotencyKey:'offline-add-key-0002'}),s.customer);
  assert.equal(result.lines.length,2); assert.equal(result.lines[0].lineId,first.lines[0].lineId);
  await rejects(()=>s.service.execute(s.add({storeId:'another-store',
    idempotencyKey:'offline-add-key-0003'}),s.customer),'FORBIDDEN');
  assert.deepEqual(await s.get(),result);
});
