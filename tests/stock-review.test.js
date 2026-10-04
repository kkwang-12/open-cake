'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {reviewStockDemand}=require('../cloudfunctions/_shared/stock-review');
const {catalog}=require('./fixtures/catalog');
function resource(){return {_id:'offline-resource-CAKE',storeId:'offline-store',version:0,status:'OPEN',totalUnits:5,
  heldUnits:1,confirmedUnits:1,consumedUnits:0};}
test('B05 offline stock check aggregates shared resources and subtracts holds/confirmed/consumed, without mutation',()=>{
  const sku=catalog().skus[0],stock=resource(),before=JSON.stringify(stock);
  assert.equal(reviewStockDemand([{sku,quantity:2},{sku,quantity:2}],[stock]).stockStatus,'INSUFFICIENT');
  assert.deepEqual(reviewStockDemand([{sku,quantity:3}],[stock]),{stockStatus:'SUFFICIENT',checkoutAllowed:false});
  stock.status='CLOSED';assert.equal(reviewStockDemand([{sku,quantity:1}],[stock]).stockStatus,'INSUFFICIENT');
  stock.status='OPEN';assert.equal(JSON.stringify(stock),before);
});
test('B05 missing stock stays unknown, invalid/cross-store/duplicate snapshots reject; never authorizes checkout',()=>{
  const lines=[{sku:catalog().skus[0],quantity:1}],stock=resource();
  for(const resources of [null,[]])assert.deepEqual(reviewStockDemand(lines,resources),{stockStatus:'UNKNOWN',checkoutAllowed:false});
  for(const resources of [[{...stock,storeId:'other'}],[stock,stock],[{...stock,totalUnits:0}]])assert.throws(()=>reviewStockDemand(lines,resources));
});
