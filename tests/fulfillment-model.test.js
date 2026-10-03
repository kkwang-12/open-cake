'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {V1_FULFILLMENT_POLICY,localServiceDate,maximumLeadTimeMinutes,buildSlotDefinitions,resolveAppointment,paymentDeadlineAt,evaluateDeliveryRange}=require('../cloudfunctions/_shared/fulfillment-model');
function code(run,expected){assert.throws(run,error=>error.code===expected);}
function input(fulfillment='PICKUP'){
  // OFFLINE TEST ONLY. Repeating daily schedule / advance / lead / hold values are not merchant-confirmed.
  return {environment:'offline-test',store:{_id:'offline-store',status:'OPEN',timeZone:'Asia/Shanghai'},fulfillment,
    now:Date.parse('2026-10-02T00:00:00Z'),serviceDate:'2026-10-03',productLeadTimes:[0],
    timePolicy:{policyVersion:'offline-hours-v1',timeZone:'Asia/Shanghai',minLeadTimeMinutes:0,maxAdvanceDays:14,crossDayStrategy:'REJECT',
      weeklyWindows:Array.from({length:7},(_,day)=>['PICKUP','DELIVERY'].map(mode=>({weekday:day+1,fulfillment:mode,startMinute:480,endMinute:1260}))).flat(),dateOverrides:[]}};
}
function slotFor(value,index=0){
  const {_id,storeId,fulfillment,serviceDate,timeZone,startAt,endAt,policyVersion,capacityUnit,capacityTotal}=buildSlotDefinitions(value)[index];
  return {_id,storeId,fulfillment,serviceDate,timeZone,startAt,endAt,policyVersion,capacityUnit,capacityTotal,
    schemaVersion:1,version:0,createdAt:value.now,updatedAt:value.now,status:'OPEN',heldUnits:0,confirmedUnits:0,consumedUnits:0};
}
function point(longitude=0,latitude=0){return {longitude,latitude,coordinateSystem:'WGS84',source:'OFFLINE_TEST_ONLY',verifiedAt:1000};}
function atMeters(distance){return point(0,distance/6371000*180/Math.PI);}

test('D05 用户确认政策固定：30 分钟、独立容量 3 / 1、20km 含边界、免费商家配送且预计时段',()=>{
  assert.equal(V1_FULFILLMENT_POLICY.slotMinutes,30);
  assert.deepEqual(V1_FULFILLMENT_POLICY.capacities,{PICKUP:3,DELIVERY:1});
  assert.equal(V1_FULFILLMENT_POLICY.delivery.radiusMeters,20000);
  assert.equal(V1_FULFILLMENT_POLICY.delivery.feeCents,0);
  assert.equal(V1_FULFILLMENT_POLICY.delivery.operator,'STORE_SELF');
  assert.equal(V1_FULFILLMENT_POLICY.delivery.windowNature,'ESTIMATED');
  assert(Object.isFrozen(V1_FULFILLMENT_POLICY.delivery));
});

test('D05 08:00–21:00 一天每模式 26 段，末段 20:30–21:00；模式 ID 独立，输入未改',()=>{
  const pickup=input(),before=JSON.stringify(pickup),pickups=buildSlotDefinitions(pickup),deliveries=buildSlotDefinitions(input('DELIVERY'));
  assert.equal(pickups.length,26);assert.equal(deliveries.length,26);
  assert.equal(pickups[0].startAt,Date.parse('2026-10-03T00:00:00Z'));
  assert.equal(pickups[25].startAt,Date.parse('2026-10-03T12:30:00Z'));
  assert.equal(pickups[25].endAt,Date.parse('2026-10-03T13:00:00Z'));
  for(let index=0;index<26;index++){
    assert.equal(pickups[index].endAt-pickups[index].startAt,1800000);
    assert.equal(pickups[index].capacityTotal,3);assert.equal(deliveries[index].capacityTotal,1);
    assert.notEqual(pickups[index]._id,deliveries[index]._id);
  }
  assert.equal(JSON.stringify(pickup),before);assert(Object.isFrozen(pickups[0]));
});

test('D05 中国当地日期与真实日历、未来窗口边界校验；不按 UTC 日期截断',()=>{
  assert.equal(localServiceDate(Date.parse('2026-10-02T16:05:00Z'),'Asia/Shanghai'),'2026-10-03');
  const midnight=input();midnight.now=Date.parse('2026-10-02T16:05:00Z');midnight.serviceDate='2026-10-02';
  code(()=>buildSlotDefinitions(midnight),'APPOINTMENT_OUTSIDE_WINDOW');
  for(const date of ['2026-02-30','2026-13-01','2026-1-01','not-date']){const value=input();value.serviceDate=date;code(()=>buildSlotDefinitions(value),'INVALID_SERVICE_DATE');}
  const edge=input();edge.timePolicy.maxAdvanceDays=2;edge.serviceDate='2026-10-04';assert.equal(buildSlotDefinitions(edge).length,26);
  edge.serviceDate='2026-10-05';code(()=>buildSlotDefinitions(edge),'APPOINTMENT_OUTSIDE_WINDOW');
});

test('D05 混合商品取最大提前量；到达预约 / 提前量截止的时段不可再接受订单',()=>{
  const value=input();value.now=Date.parse('2026-10-03T00:00:00Z');value.productLeadTimes=[30,90];value.timePolicy.minLeadTimeMinutes=60;
  assert.equal(maximumLeadTimeMinutes(60,[30,90]),90);
  const slots=buildSlotDefinitions(value);assert.equal(slots[0].startAt,Date.parse('2026-10-03T02:00:00Z'));
  assert.equal(slots[0].minLeadTimeMinutes,90);
  code(()=>maximumLeadTimeMinutes(null,[0]),'CONFIGURATION_REQUIRED');
  code(()=>maximumLeadTimeMinutes(0,[]),'CONFIGURATION_REQUIRED');
});

test('D05 休业 / 缩短营业覆盖按日期和模式独立，无窗口不默认开放',()=>{
  const value=input();value.timePolicy.dateOverrides=[{serviceDate:'2026-10-03',fulfillment:'DELIVERY',closed:true,windows:[]}];
  assert.equal(buildSlotDefinitions({...value,fulfillment:'DELIVERY'}).length,0);
  assert.equal(buildSlotDefinitions(value).length,26);
  value.timePolicy.dateOverrides=[{serviceDate:'2026-10-03',fulfillment:'PICKUP',closed:false,windows:[{startMinute:600,endMinute:660}]}];
  assert.equal(buildSlotDefinitions(value).length,2);
  value.timePolicy.weeklyWindows=[];value.timePolicy.dateOverrides=[];assert.equal(buildSlotDefinitions(value).length,0);
});

test('D05 非 30 分钟网格、重叠 / 重复覆盖、超营业时间和跨午夜配置拒绝',()=>{
  for(const mutate of [
    value=>{value.timePolicy.weeklyWindows[0].startMinute=481;},
    value=>{value.timePolicy.weeklyWindows[0].endMinute=1290;},
    value=>{value.timePolicy.weeklyWindows[0].startMinute=450;},
    value=>{value.timePolicy.weeklyWindows[0].endMinute=60;},
    value=>{value.timePolicy.weeklyWindows.push({...value.timePolicy.weeklyWindows[0]});},
    value=>{value.timePolicy.dateOverrides=[{serviceDate:'2026-10-03',fulfillment:'PICKUP',closed:true,windows:[]},{serviceDate:'2026-10-03',fulfillment:'PICKUP',closed:true,windows:[]}];}
  ]){const value=input();mutate(value);code(()=>buildSlotDefinitions(value),'INVALID_TIME_POLICY');}
});

test('D05 缺提前量 / 窗口天数、闭店、错误时区 / 履约方式无法生成可买时段',()=>{
  const missing=input();missing.timePolicy.maxAdvanceDays=null;code(()=>buildSlotDefinitions(missing),'CONFIGURATION_REQUIRED');
  const closed=input();closed.store.status='CLOSED';code(()=>buildSlotDefinitions(closed),'STORE_UNAVAILABLE');
  const zone=input();zone.store.timeZone='UTC';code(()=>buildSlotDefinitions(zone),'TIME_ZONE_UNSUPPORTED');
  const mode=input();mode.fulfillment='RIDER';code(()=>buildSlotDefinitions(mode),'INVALID_FULFILLMENT');
});

test('D05 源时段必须匹配真实记录；缺记录、伪造容量 / 模式 / 时间和旧政策拒绝',()=>{
  const value=input(),slot=slotFor(value);
  code(()=>resolveAppointment(value,null),'SLOT_REQUIRED');
  for(const override of [{capacityTotal:999},{fulfillment:'DELIVERY'},{endAt:slot.endAt+1},{policyVersion:'old'}])code(()=>resolveAppointment(value,{...slot,...override}),'SLOT_DEFINITION_MISMATCH');
  code(()=>resolveAppointment(value,{...slot,_id:'client-forged'}),'APPOINTMENT_UNAVAILABLE');
});

test('D05 自取三单 / 配送一单含 HELD、CONFIRMED、CONSUMED 占用，满额拒绝且彼此独立',()=>{
  const pickup=input(),delivery=input('DELIVERY'),pickupSlot=slotFor(pickup),deliverySlot=slotFor(delivery);
  const two={...pickupSlot,heldUnits:1,confirmedUnits:1};
  assert.equal(resolveAppointment(pickup,two).slotRequest.quantity,1);
  code(()=>resolveAppointment(pickup,{...two,consumedUnits:1}),'SLOT_FULL_OR_CLOSED');
  code(()=>resolveAppointment(delivery,{...deliverySlot,heldUnits:1}),'SLOT_FULL_OR_CLOSED');
  assert.equal(resolveAppointment(pickup,pickupSlot).slotRequest.quantity,1);
  code(()=>resolveAppointment(pickup,{...pickupSlot,status:'CLOSED'}),'SLOT_FULL_OR_CLOSED');
});

test('D05 同时段变更政策不会换 ID 重新获得容量；资源计划衔接一个订单占一个名额',()=>{
  const {planResourceHolds}=require('../cloudfunctions/_shared/resource-model');
  const value=input(),slot=slotFor(value),first=buildSlotDefinitions(value)[0];
  assert.equal(buildSlotDefinitions({...value,timePolicy:{...value.timePolicy,policyVersion:'new-policy'}})[0]._id,first._id);
  const resolved=resolveAppointment(value,slot),deadline=paymentDeadlineAt(value.now,15,resolved.appointmentSnapshot);
  const stock={_id:'offline-stock',storeId:value.store._id,version:0,status:'OPEN',totalUnits:1,heldUnits:0,confirmedUnits:0,consumedUnits:0};
  const plan=planResourceHolds({_id:'offline-order',storeId:value.store._id,paymentDeadlineAt:deadline},
    [{resourceKind:'STOCK',resourceId:stock._id,quantity:1,expectedVersion:0},resolved.slotRequest],
    [{resourceKind:'STOCK',resource:stock},{resourceKind:'SLOT',resource:slot}],{environment:value.environment,now:value.now});
  assert.equal(plan.reservations[1].quantity,1);assert.equal(plan.resourceChanges[1].heldUnits,1);
});

test('D05 支付保留截止不晚于最严格提前量边界，缺经营时长不补默认',()=>{
  const now=Date.parse('2026-10-03T00:00:00Z'),appointment={startAt:now+120*60000,minLeadTimeMinutes:90};
  assert.equal(paymentDeadlineAt(now,60,appointment),now+30*60000);
  code(()=>paymentDeadlineAt(now,null,appointment),'CONFIGURATION_REQUIRED');
  code(()=>paymentDeadlineAt(now+30*60000,15,appointment),'APPOINTMENT_UNAVAILABLE');
});

test('D05 0 / 20km 内 / 精确边界免费，超过边界 1mm 拒绝，结果为预计商家配送',()=>{
  assert.equal(evaluateDeliveryRange(point(),point(),2000).distanceMeters,0);
  assert.equal(evaluateDeliveryRange(point(),atMeters(19999.999),2000).feeCents,0);
  const edge=evaluateDeliveryRange(point(),atMeters(20000),2000);
  assert(Math.abs(edge.distanceMeters-20000)<1e-8);assert.equal(edge.windowNature,'ESTIMATED');
  code(()=>evaluateDeliveryRange(point(),atMeters(20000.001),2000),'DELIVERY_OUT_OF_RANGE');
});

test('D05 无定位 / 非法坐标 / 未来核验时间 / 未转换坐标体系拒绝，不能以客户端范围证明放行',()=>{
  for(const pointValue of [null,{...point(),latitude:91},{...point(),longitude:Infinity},{...point(),verifiedAt:3000},{...point(),source:''}]) {
    code(()=>evaluateDeliveryRange(point(),pointValue,2000),'LOCATION_REQUIRED');
  }
  code(()=>evaluateDeliveryRange(point(),{...point(),coordinateSystem:'GCJ02'},2000),'COORDINATE_SYSTEM_UNSUPPORTED');
  code(()=>evaluateDeliveryRange(null,point(),2000),'LOCATION_REQUIRED');
});

test('D05 非测试原点的精确边界不因浮点相减误判，近经度换日线也可正确计算',()=>{
  for(const latitude of [30,45,80]){
    const center=point(117,latitude),edge=point(117,latitude+20000/6371000*180/Math.PI);
    assert.equal(evaluateDeliveryRange(center,edge,2000).feeCents,0);
  }
  assert(evaluateDeliveryRange(point(179.99,0),point(-179.99,0),2000).distanceMeters<3000);
});
