'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {resolveCheckoutSelection}=require('../cloudfunctions/_shared/checkout-selection');
const {planCartCommand}=require('../cloudfunctions/_shared/cart-model');
const {identityFromPlatform,resolveCustomer}=require('../cloudfunctions/_shared/authorization-model');
const {catalog,emptyCart,cartContext}=require('./fixtures/catalog');
function principal(openId){
  const settings={appId:'offline-app',environment:'offline-env',stage:'development'};
  const platform={OPENID:openId,APPID:settings.appId,ENV:settings.environment};
  return resolveCustomer(platform,settings,{...identityFromPlatform(platform,settings),schemaVersion:1,version:0,status:'ACTIVE'});
}
function setup(){
  const owner=principal('A'),cat=catalog(),limits={maxLines:3,maxQuantityPerLine:6};let cart={...emptyCart(),ownerId:owner.subjectId};
  for(let i=0;i<3;i++)cart=planCartCommand(cart,'ADD',owner,{expectedVersion:cart.version,skuId:cat.skus[0]._id,
    selectedOptions:cat.selectedOptions,quantity:i+1,cakeMessage:'留言'+i},{...cartContext(cat),now:2000+i,newLineId:'line-'+i}).nextCart;
  const input={cartId:cart._id,expectedVersion:cart.version,lines:[{lineId:'line-0',expectedLineVersion:0},{lineId:'line-2',expectedLineVersion:0}]};
  return {owner,cat,limits,cart,input,run(value=input,who=owner){return resolveCheckoutSelection(cart,value,who,[cat],limits);}};
}
test('B06 server planner resolves only selected trusted lines and recalculates catalog amounts without mutating cart',()=>{
  const s=setup(),before=JSON.stringify(s.cart);s.cat.skus[0].unitPriceCents=1200;const result=s.run();
  assert.deepEqual(result.lines.map(line=>line.lineId),['line-0','line-2']);assert.equal(result.subtotalCents,4800);
  assert.equal(result.lines[1].cakeMessage,'留言2');assert.equal(result.checkoutAllowed,false);assert.equal(result.stockStatus,'UNKNOWN');
  assert.equal(JSON.stringify(s.cart),before);assert(Object.isFrozen(result.lines));
});
test('B06 server planner rejects forged principals, cross-owner, client price fields and missing/duplicate/old lines',()=>{
  const s=setup();assert.throws(()=>s.run(s.input,{...s.owner}),e=>e.code==='AUTH_REQUIRED');
  assert.throws(()=>s.run(s.input,principal('B')),e=>e.code==='FORBIDDEN');
  for(const [patch,code] of [[{subtotalCents:1},'INVALID_SELECTION'],[{lines:[]},'INVALID_SELECTION'],
    [{lines:[s.input.lines[0],s.input.lines[0]]},'INVALID_SELECTION'],[{expectedVersion:0},'VERSION_CONFLICT'],
    [{lines:[{lineId:'missing',expectedLineVersion:0}]},'LINE_NOT_FOUND'],
    [{lines:[{lineId:'line-0',expectedLineVersion:1}]},'VERSION_CONFLICT'],
    [{lines:[{...s.input.lines[0],quantity:999}]},'INVALID_SELECTION']])
    assert.throws(()=>s.run({...s.input,...patch}),e=>e.code===code);
});
test('B06 server planner rechecks sale, quantity and historical message under current configuration',()=>{
  const s=setup();s.cat.skus[0].status='OFF_SALE';assert.throws(()=>s.run(),e=>e.code==='SKU_UNAVAILABLE');
  s.cat.skus[0].status='ON_SALE';s.limits.maxQuantityPerLine=2;assert.throws(()=>s.run(),e=>e.code==='INVALID_QUANTITY');
  s.limits.maxQuantityPerLine=6;s.cat.product.messagePolicy.maxLength=1;assert.throws(()=>s.run(),e=>e.code==='INVALID_MESSAGE');
});
