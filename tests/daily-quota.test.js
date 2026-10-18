'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {quotaTemplate,dailyResourceId,newDailyResource,requirementsForDate,validateQuotaResources,DAILY_LIMITS}=require('../cloudfunctions/_shared/daily-quota');
const {aggregateStockRequirements,resolveSku}=require('../cloudfunctions/_shared/catalog-model');
const {planQuoteCreation}=require('../cloudfunctions/_shared/quote-model');
const {setup}=require('./fixtures/quote');
test('daily category quota binds store/environment/date independently of SKU, mode or configuration version',()=>{
  const s=setup(),product=s.cat.product,env=s.principal.environment,day=s.state.slot.serviceDate,sku=s.cat.skus[0];
  sku.stockRequirements=[quotaTemplate(env,product.storeId,'CAKE')];
  const other={...sku,_id:'different-size',version:99};
  assert.deepEqual(requirementsForDate(product,sku,env,day),requirementsForDate(product,other,env,day));
  const today=requirementsForDate(product,sku,env,day)[0].resourceId;
  assert.notEqual(today,dailyResourceId(env,product.storeId,'CAKE','2026-10-07'));
  assert.notEqual(today,dailyResourceId(env,'other-store','CAKE',day));
  assert.notEqual(today,dailyResourceId('other-environment',product.storeId,'CAKE',day));
  assert.notEqual(today,dailyResourceId(env,product.storeId,'BREAD',day));
  assert.deepEqual(DAILY_LIMITS,{CAKE:15,MINI_CAKE:20,BREAD:20});
  assert.throws(()=>aggregateStockRequirements([{sku:resolveSku(product,[sku],s.cat.selectedOptions,sku._id),quantity:1}]),{code:'CONFIGURATION_REQUIRED'});
});
test('two cake sizes aggregate into one dated quota and cannot exceed the confirmed day capacity',()=>{
  const s=setup(),sku=s.cat.skus[0],env=s.principal.environment,day=s.state.slot.serviceDate;
  sku.stockRequirements=[quotaTemplate(env,s.state.store._id,'CAKE')];
  const second=structuredClone(sku);second._id='other-size';second.selectedOptions[0].optionCode='LARGE';s.cat.skus.push(second);
  const line={...structuredClone(s.state.cart.lines[0]),lineId:'other-line',skuId:second._id,quantity:2};
  s.state.cart.lines.push(line);s.event.payload.lines.push({lineId:line.lineId,lineVersion:0});
  const stock=newDailyResource(env,s.state.store._id,'CAKE',day,s.context.now);s.state.stocks=[stock];
  const result=planQuoteCreation(s.state,s.event,s.principal,s.context);
  assert.deepEqual(result.proposedQuote.resourceVersions.filter(row=>row.resourceKind==='STOCK'),[
    {resourceKind:'STOCK',resourceId:stock._id,version:0,requiredUnits:4}]);
  stock.heldUnits=12;assert.throws(()=>planQuoteCreation(s.state,s.event,s.principal,s.context),{code:'RESOURCE_UNAVAILABLE'});
});
test('wrong category/pool/environment/date/policy/unit or enlarged total never becomes a daily quota',()=>{
  const s=setup(),env=s.principal.environment,day=s.state.slot.serviceDate,sku=s.cat.skus[0];
  sku.stockRequirements=[quotaTemplate(env,s.state.store._id,'CAKE')];
  for(const mutate of [r=>r.categoryCode='BREAD',r=>r.unitsPerItem=2,r=>r.scope='PERMANENT',r=>r.quotaPolicyVersion='unknown',r=>r.resourceId='other-pool']){
    const copy=structuredClone(sku);mutate(copy.stockRequirements[0]);assert.throws(()=>requirementsForDate(s.cat.product,copy,env,day));
  }
  for(const mutate of [r=>r.serviceDate='2026-10-07',r=>r.environment='other',r=>r.storeId='other',r=>r.categoryCode='BREAD',
    r=>r.totalUnits=16,r=>r.quotaPolicyVersion='unknown',r=>r.unit='GRAM',r=>r.poolId='other']){
    const resource=newDailyResource(env,s.state.store._id,'CAKE',day,s.context.now);mutate(resource);
    assert.throws(()=>validateQuotaResources(s.cat.product,sku,env,day,[resource]),{code:'INVALID_RESOURCE'});
  }
  assert.throws(()=>requirementsForDate(s.cat.product,sku,env,'2026-02-30'),{code:'INVALID_SERVICE_DATE'});
});
