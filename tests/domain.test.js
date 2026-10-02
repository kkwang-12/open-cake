const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Shop, initialState } = require('../server/domain');
const customer = { id: 'customer-a', role: 'customer' };
const other = { id: 'customer-b', role: 'customer' };
const staff = { id: 'staff-a', role: 'staff' };
const input = extra => ({ productId:'strawberry',size:'6寸',flavor:'香草草莓',contactName:'陈女士',phone:'13800138000',fulfillment:'pickup',date:'2030-01-11',time:'14:00',message:'生日快乐',...extra });
const shop = () => new Shop(initialState(), { now: () => new Date('2030-01-10T00:00:00Z') });
function reserved(s) { const o=s.createOrder(customer,input());s.confirm(staff,o.id,true);const p=s.createPayment(customer,o.id,'deposit');s.simulatePayment(customer,p.id);return s.get(customer,o.id); }
function ready(s, extra={}) { const o=s.createOrder(customer,input(extra));s.confirm(staff,o.id,true);s.simulatePayment(customer,s.createPayment(customer,o.id,'deposit').id);s.advance(staff,o.id,'MAKING');s.advance(staff,o.id,'READY');return s.get(customer,o.id); }

test('200元蛋糕：确认后付60元定金，交付时付140元尾款，完整自取流程',()=>{
  const s=shop(),o=s.createOrder(customer,input({totalCents:1,depositCents:1}));assert.equal(o.totalCents,20000);assert.equal(o.depositCents,6000);
  assert.throws(()=>s.createPayment(customer,o.id,'deposit'),/无需支付/);
  s.confirm(staff,o.id,true);const p=s.createPayment(customer,o.id,'deposit');assert.equal(p.amountCents,6000);s.simulatePayment(customer,p.id);
  assert.throws(()=>s.createPayment(customer,o.id,'balance'),/无需支付/);
  s.advance(staff,o.id,'MAKING');s.advance(staff,o.id,'READY');assert.throws(()=>s.advance(staff,o.id,'COMPLETED'),/收齐尾款/);
  const balance=s.createPayment(customer,o.id,'balance');assert.equal(balance.amountCents,14000);s.simulatePayment(customer,balance.id);s.advance(staff,o.id,'COMPLETED');
  const completed=s.get(customer,o.id);assert.equal(completed.status,'COMPLETED');assert.equal(completed.paidCents,20000);assert.equal(completed.balanceDueCents,0);
});
test('免费配送完整流程及线下尾款',()=>{
  const s=shop(),o=ready(s,{fulfillment:'delivery',address:'测试路18号'});assert.equal(o.totalCents,20000);s.advance(staff,o.id,'DELIVERING');s.offlineBalance(staff,o.id,'store_qr');s.advance(staff,o.id,'COMPLETED');assert.equal(s.get(customer,o.id).balanceMethod,'store_qr');
});
test('支付失败可重试；相同或不同回调事件均不重复记账',()=>{
  const s=shop(),o=s.createOrder(customer,input());s.confirm(staff,o.id,true);const failed=s.createPayment(customer,o.id,'deposit');s.simulatePayment(customer,failed.id,false);assert.equal(s.get(customer,o.id).paidCents,0);
  const retry=s.createPayment(customer,o.id,'deposit');assert.notEqual(retry.id,failed.id);assert.equal(s.createPayment(customer,o.id,'deposit').id,retry.id);
  s.paymentResult(retry.id,'callback-1',6000,true);s.paymentResult(retry.id,'callback-1',6000,true);s.paymentResult(retry.id,'callback-2',6000,true);assert.equal(s.get(customer,o.id).paidCents,6000);
  assert.throws(()=>s.paymentResult(retry.id,'callback-3',1,true),/金额不匹配/);
});
test('线下先登记会关闭待付线上尾款；线上先支付阻止线下重复登记',()=>{
  const s=shop(),a=ready(s);const pending=s.createPayment(customer,a.id,'balance');s.offlineBalance(staff,a.id,'cash');assert.throws(()=>s.simulatePayment(customer,pending.id),/已关闭/);assert.throws(()=>s.offlineBalance(staff,a.id,'cash'),/不能重复/);assert.equal(s.get(customer,a.id).paidCents,20000);
  const b=ready(s);s.simulatePayment(customer,s.createPayment(customer,b.id,'balance').id);assert.throws(()=>s.offlineBalance(staff,b.id,'cash'),/不能重复/);
});
test('客户不能访问其他客户订单，不能执行任何店员管理操作',()=>{
  const s=shop(),o=s.createOrder(customer,input());assert.deepEqual(s.list(other),[]);assert.throws(()=>s.get(other,o.id),/不存在/);assert.throws(()=>s.confirm(customer,o.id,true),/店员/);assert.throws(()=>s.updateSettings(customer,{}),/店员/);assert.throws(()=>s.updateProduct(customer,'strawberry',{}),/店员/);assert.throws(()=>s.notifications(customer),/店员/);assert.throws(()=>s.createPayment(staff,o.id,'deposit'),/客户/);
});
test('禁止越过定金直接制作，拒单需说明且不可付款',()=>{
  const s=shop(),o=s.createOrder(customer,input());assert.throws(()=>s.advance(staff,o.id,'MAKING'),/不能/);assert.throws(()=>s.confirm(staff,o.id,false,''),/原因/);s.confirm(staff,o.id,false,'档期已满');assert.equal(s.get(customer,o.id).status,'REJECTED');assert.throws(()=>s.createPayment(customer,o.id,'deposit'),/无需支付/);
});
test('交付日期与营业时段以香港时区校验，拒绝过期和非法日期',()=>{
  const s=shop();for(const extra of [{date:'2029-12-31'},{date:'2030-02-30'},{time:'08:29'},{time:'19:31'},{time:'99:00'},{date:'2030-01-10',time:'08:00'}])assert.throws(()=>s.createOrder(customer,input(extra)));
  assert.equal(s.createOrder(customer,input({time:'08:30'})).time,'08:30');assert.equal(s.createOrder(customer,input({time:'19:30'})).time,'19:30');
});
test('配送地址、电话、规格和祝福语校验',()=>{
  const s=shop();for(const extra of [{fulfillment:'delivery',address:''},{phone:'123'},{size:'100寸'},{flavor:'不存在'},{message:'a'.repeat(61)}])assert.throws(()=>s.createOrder(customer,input(extra)));
  assert.equal(s.createOrder(customer,input({phone:'+852 12345678'})).phone,'+852 12345678');
});
test('取消申请不自动取消；退款经审核、可失败重试、不可重复退款',()=>{
  const s=shop(),o=reserved(s);s.requestChange(customer,o.id,{type:'cancel',reason:'计划变了'});assert.equal(s.get(customer,o.id).status,'RESERVED');assert.throws(()=>s.advance(staff,o.id,'MAKING'),/先处理/);assert.throws(()=>s.reviewChange(staff,o.id,{approved:true,refundCents:6001}),/退款金额/);
  const reviewed=s.reviewChange(staff,o.id,{approved:true,refundCents:6000,response:'同意退款'});assert.equal(reviewed.status,'CANCELLED');assert.equal(reviewed.refundedCents,0);const id=reviewed.refunds[0].id;
  s.refundResult(staff,id,false);assert.equal(s.get(customer,o.id).refundedCents,0);s.refundResult(staff,id,true);s.refundResult(staff,id,true);s.refundResult(staff,id,false);assert.equal(s.get(customer,o.id).refundedCents,6000);assert.equal(s.get(customer,o.id).refunds[0].status,'SUCCEEDED');
});
test('取消可不退款；改期只有批准后生效；拒绝申请保留原档期',()=>{
  const s=shop(),o=reserved(s);s.requestChange(customer,o.id,{type:'reschedule',reason:'调整庆祝时间',date:'2030-01-12',time:'15:00'});assert.equal(s.get(customer,o.id).date,'2030-01-11');assert.throws(()=>s.requestChange(customer,o.id,{type:'cancel',reason:'重复'}),/先处理/);s.reviewChange(staff,o.id,{approved:false,response:'新档期已满'});assert.equal(s.get(customer,o.id).date,'2030-01-11');
  s.requestChange(customer,o.id,{type:'reschedule',reason:'再次申请',date:'2030-01-13',time:'16:00'});s.reviewChange(staff,o.id,{approved:true});assert.equal(s.get(customer,o.id).date,'2030-01-13');
  s.requestChange(customer,o.id,{type:'cancel',reason:'不需要了'});s.reviewChange(staff,o.id,{approved:true,refundCents:0});assert.equal(s.get(customer,o.id).refundedCents,0);assert.equal(s.get(customer,o.id).refunds.length,0);
});
test('商品调价与下架不影响既有订单快照；营业设置即时生效',()=>{
  const s=shop(),o=s.createOrder(customer,input());const p=s.products(staff)[0];s.updateProduct(staff,p.id,{...p,onSale:false,sizes:[{name:'6寸',priceCents:25000}]});assert.equal(s.get(customer,o.id).totalCents,20000);assert.equal(s.get(customer,o.id).product.name,'草莓云朵');assert.throws(()=>s.createOrder(customer,input()),/下架/);
  s.updateProduct(staff,p.id,{...p,sizes:[{name:'6寸',priceCents:25000}]});assert.equal(s.createOrder(customer,input()).totalCents,25000);s.updateSettings(staff,{...s.settings(),openTime:'10:00',closeTime:'18:00'});assert.throws(()=>s.createOrder(customer,input({time:'09:00'})),/交付时间/);
});
test('持久化失败时事务回滚，不保留半条订单或收款',()=>{
  const s=new Shop(initialState(),{now:()=>new Date('2030-01-10T00:00:00Z'),save:()=>{throw new Error('disk full');}});assert.throws(()=>s.createOrder(customer,input()),/disk full/);assert.equal(s.state.orders.length,0);assert.equal(s.state.notifications.length,0);
});
