'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {prepareQuoteData}=require('../scripts/prepare-quote-data');
const {products:adopted}=require('../catalog-assets/initial-20261010/catalog');
const {dailyResourceId,quotaTemplate,newDailyResource}=require('../cloudfunctions/_shared/daily-quota');
function setup(){
  const store={_id:'g1-catalog-store',status:'DRAFT',version:1,activeConfigId:null,timeZone:'Asia/Shanghai',updatedAt:1000};
  const configuration={_id:'g2-initial-config-20261014',storeId:store._id,status:'DRAFT',publishedAt:null,version:2,updatedAt:1000,
    quoteTtlMinutes:5,paymentHoldMinutes:30,cartLimits:{maxLines:60,maxQuantityPerLine:15,maxOrderNoteLength:30},
    timePolicy:{timeZone:'Asia/Shanghai',policyVersion:'confirmed-hours',minLeadTimeMinutes:0,maxAdvanceDays:3,crossDayStrategy:'REJECT',dateOverrides:[],
      weeklyWindows:Array.from({length:7},(_,i)=>['PICKUP','DELIVERY'].map(fulfillment=>({weekday:i+1,fulfillment,startMinute:480,endMinute:1260}))).flat()}};
  const products=[],skus=[];
  for(const definition of adopted){
    const product={...structuredClone(definition),_id:'g1-initial-'+definition.key,storeId:store._id,status:'ON_SALE',schemaVersion:1,
      version:0,createdAt:1000,updatedAt:1000,messagePolicy:null,minLeadTimeMinutes:null,_transactionFence:4};
    products.push(product);
    for(const variant of definition.variants)skus.push({...structuredClone(variant),_id:product._id+'-'+variant.key,productId:product._id,
      storeId:store._id,status:'ON_SALE',schemaVersion:1,version:0,createdAt:1000,updatedAt:1000,currency:'CNY',minQuantity:null,maxQuantity:null,stockRequirements:[]});
  }
  return {store,configuration,products,skus,environment:'cloudbase-d8gwtxzm64150b7e0',now:Date.parse('2026-10-18T13:00:00Z')};
}
test('confirmed real catalog plan only patches 9 products/15 SKUs and seeds three future days at closing time',()=>{
  const input=setup(),before=structuredClone(input),plan=prepareQuoteData(input);
  assert.deepEqual(input,before);assert.deepEqual(plan.counts,{updates:24,products:9,skus:15,inventoryResources:9,slotInventory:156});
  assert.deepEqual(plan.serviceDates,['2026-10-19','2026-10-20','2026-10-21']);assert.equal(plan.cloudResourcesChanged,false);
  for(const product of plan.after.products){
    assert.equal(product._transactionFence,4);assert.equal(product.minLeadTimeMinutes,product.categoryCode==='CAKE'?30:0);
    assert.equal(product.messagePolicy?.maxLength??null,product.messageDecision==='ENABLED'?30:null);
  }
  for(const sku of plan.after.skus){
    const original=before.skus.find(row=>row._id===sku._id),product=plan.after.products.find(row=>row._id===sku.productId);
    assert.equal(sku.unitPriceCents,original.unitPriceCents);assert.deepEqual(sku.selectedOptions,original.selectedOptions);
    assert.equal(sku.minQuantity,1);assert.equal(sku.maxQuantity,15);
    assert.deepEqual(sku.stockRequirements,[quotaTemplate(input.environment,input.store._id,product.categoryCode)]);
  }
  for(const patch of plan.updates){assert.equal(patch.expectedVersion,0);assert.equal(patch.set.version,1);
    assert.equal(Object.hasOwn(patch.set,'unitPriceCents'),false);assert.equal(Object.hasOwn(patch.set,'_transactionFence'),false);}
  assert.equal(new Set(plan.inventoryResources.map(row=>row._id)).size,9);
  assert.equal(new Set(plan.slotInventory.map(row=>row._id)).size,156);
  const next=prepareQuoteData({...input,now:input.now+60000});
  assert.deepEqual(next.inventoryResources.map(row=>row._id),plan.inventoryResources.map(row=>row._id));
  assert.deepEqual(next.slotInventory.map(row=>row._id),plan.slotInventory.map(row=>row._id));
});
test('plan uses Shanghai calendar rollover, includes remaining today slots, and refuses changed scope/configuration',()=>{
  const input=setup();input.now=Date.parse('2026-10-18T00:00:00Z');
  const plan=prepareQuoteData(input);assert.deepEqual(plan.serviceDates,['2026-10-18','2026-10-19','2026-10-20','2026-10-21']);
  assert.equal(plan.inventoryResources.length,12);assert.equal(plan.slotInventory.filter(row=>row.serviceDate==='2026-10-18').length,50);
  for(const mutate of [s=>s.environment='production',s=>s.store.status='OPEN',s=>s.configuration.status='PUBLISHED',
    s=>s.configuration.cartLimits.maxQuantityPerLine=16,s=>s.products.pop(),s=>s.skus.pop(),s=>s.products[0].categoryCode='UNKNOWN']){
    const copy=structuredClone(input);mutate(copy);assert.throws(()=>prepareQuoteData(copy));
  }
});
test('merchant catalog validators accept dated resource references and cannot raise category capacity beyond the confirmed ceiling',async()=>{
  const {setup}=require('./fixtures/merchant-catalog');
  const {validateCatalogState,planInventoryTotal}=require('../cloudfunctions/_shared/merchant-catalog-model');
  const s=await setup(),product=s.db.products.product,sku=s.db.skus.sku,date='2026-10-19';
  sku.stockRequirements=[quotaTemplate(s.context.environment,s.storeId,'CAKE')];
  const resource=newDailyResource(s.context.environment,s.storeId,'CAKE',date,s.controls.now-1000);
  const state={environment:s.context.environment,appId:s.context.appId,storeId:s.storeId,complete:true,
    products:[product],skus:[sku],resources:[resource],mediaAssets:Object.values(s.db.mediaAssets),categories:s.db.categories};
  validateCatalogState(state,s.storeId,s.context,s.controls.now);
  const result=planInventoryTotal({expectedVersion:0,totalUnits:12},resource,s.controls.now);
  assert.equal(result.after.totalUnits,12);assert.equal(result.after.serviceDate,date);
  assert.throws(()=>planInventoryTotal({expectedVersion:0,totalUnits:16},resource,s.controls.now),{code:'INVALID_RESOURCE'});
  resource.heldUnits=12;assert.throws(()=>planInventoryTotal({expectedVersion:0,totalUnits:11},resource,s.controls.now),{code:'RESOURCE_UNAVAILABLE'});
  assert.equal(resource._id,dailyResourceId(s.context.environment,s.storeId,'CAKE',date));
});
