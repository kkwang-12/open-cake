'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validateResource,planResourceHolds}=require('../cloudfunctions/_shared/resource-model');
function code(run,expected){assert.throws(run,error=>error.code===expected);}
function input(){return {
  order:{_id:'offline-order',storeId:'offline-store',paymentDeadlineAt:5000},context:{environment:'offline-test',now:2000},
  requests:[{resourceKind:'STOCK',resourceId:'offline-stock',quantity:1,expectedVersion:0},{resourceKind:'SLOT',resourceId:'offline-slot',quantity:1,expectedVersion:0}],
  resources:[{resourceKind:'STOCK',resource:{_id:'offline-stock',storeId:'offline-store',version:0,status:'OPEN',totalUnits:1,heldUnits:0,confirmedUnits:0,consumedUnits:0}},
    {resourceKind:'SLOT',resource:{_id:'offline-slot',storeId:'offline-store',version:0,status:'OPEN',capacityTotal:1,heldUnits:0,confirmedUnits:0,consumedUnits:0}}]
};}
function plan(value){return planResourceHolds(value.order,value.requests,value.resources,value.context);}

test('D04 整单库存 / 时段预留计划具有版本条件、确定性预留 ID、统一付款截止且不改输入',()=>{
  const value=input(),before=JSON.stringify(value),result=plan(value);
  assert.equal(result.resourceChanges.length,2);
  assert.equal(result.resourceChanges[0].heldUnits,1);
  assert.equal(result.resourceChanges[0].expectedVersion,0);
  assert.equal(result.resourceChanges[0].nextVersion,1);
  assert.equal(result.reservations[0].expiresAt,5000);
  assert.equal(result.reservations[0].status,'HELD');
  assert.equal(result.reservations[0]._id,plan(value).reservations[0]._id);
  assert.notEqual(result.reservations[0]._id,result.reservations[1]._id);
  assert.equal(JSON.stringify(value),before);
  assert(Object.isFrozen(result.resourceChanges[0]));
});

test('D04 最后一个库存或名额已占用时整单计划拒绝，无局部修改',()=>{
  for(const index of [0,1]){
    const value=input();value.resources[index].resource.heldUnits=1;const before=JSON.stringify(value);
    code(()=>plan(value),'RESOURCE_UNAVAILABLE');assert.equal(JSON.stringify(value),before);
  }
});

test('D04 旧版本 / 跨店 / 关闭资源不生成预留，全部查询必须匹配',()=>{
  const stale=input();stale.resources[0].resource.version=1;code(()=>plan(stale),'RESOURCE_VERSION_CONFLICT');
  const other=input();other.resources[1].resource.storeId='other';code(()=>plan(other),'RESOURCE_SCOPE_MISMATCH');
  const closed=input();closed.resources[0].resource.status='CLOSED';code(()=>plan(closed),'RESOURCE_UNAVAILABLE');
  const missing=input();missing.resources.pop();code(()=>plan(missing),'INVALID_RESOURCE');
});

test('D04 重复需求、未聚合 SKU 资源、无唯一时段与过期截止拒绝',()=>{
  const duplicate=input();duplicate.requests.push({...duplicate.requests[0]});code(()=>plan(duplicate),'INVALID_RESERVATION_PLAN');
  const noSlot=input();noSlot.requests.pop();noSlot.resources.pop();code(()=>plan(noSlot),'INVALID_RESERVATION_PLAN');
  const expired=input();expired.order.paymentDeadlineAt=2000;code(()=>plan(expired),'INVALID_RESERVATION_PLAN');
});

test('D04 占用不超总量，制作已消耗仍占资源；计数求和 / 版本溢出拒绝',()=>{
  const resource=input().resources[0].resource;
  assert.equal(validateResource('STOCK',{...resource,consumedUnits:1}),0);
  code(()=>validateResource('STOCK',{...resource,heldUnits:1,confirmedUnits:1}),'INVALID_RESOURCE');
  code(()=>validateResource('STOCK',{...resource,totalUnits:Number.MAX_SAFE_INTEGER,heldUnits:Number.MAX_SAFE_INTEGER,confirmedUnits:1}),'INVALID_RESOURCE');
  const value=input();value.resources[0].resource.version=Number.MAX_SAFE_INTEGER;value.requests[0].expectedVersion=Number.MAX_SAFE_INTEGER;
  code(()=>plan(value),'INVALID_RESOURCE');
});

test('D04 共享需求聚合结果可接预留计划；两个旧快照都可计划，必须在真实提交时裁决',()=>{
  const {aggregateStockRequirements}=require('../cloudfunctions/_shared/catalog-model');
  const value=input();value.resources[0].resource.totalUnits=8;
  const demands=aggregateStockRequirements([{sku:{storeId:'offline-store',stockRequirements:[{resourceId:'offline-stock',unitsPerItem:1}]},quantity:2},
    {sku:{storeId:'offline-store',stockRequirements:[{resourceId:'offline-stock',unitsPerItem:2}]},quantity:3}]);
  value.requests[0].quantity=demands[0].requiredUnits;
  assert.equal(plan(value).resourceChanges[0].heldUnits,8);
  // Explicitly demonstrates that pure planning alone is not a concurrency lock.
  assert.equal(plan(value).resourceChanges[0].heldUnits,8);
  value.resources[0].resource.version=1;
  code(()=>plan(value),'RESOURCE_VERSION_CONFLICT');
});
