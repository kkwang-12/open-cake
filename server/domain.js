'use strict';

const { randomUUID } = require('node:crypto');

class AppError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const ensure = (condition, message, status) => { if (!condition) throw new AppError(message, status); };
const clone = value => structuredClone(value);
const money = value => Number.isSafeInteger(value) && value >= 0;
const ACTIVE = ['WAIT_CONFIRM', 'WAIT_DEPOSIT', 'RESERVED', 'MAKING', 'READY', 'DELIVERING'];
const LABELS = { WAIT_CONFIRM: '待店员确认', WAIT_DEPOSIT: '待付定金', RESERVED: '预订成功', MAKING: '制作中', READY: '待交付', DELIVERING: '配送中', COMPLETED: '已完成', REJECTED: '未能接单', CANCELLED: '已取消' };

function initialState() {
  return {
    version: 1,
    settings: { name: '家家乐蛋糕店', openTime: '08:30', closeTime: '19:30', depositPercent: 30, address: '', phone: '', deliveryFeeCents: 0, afterSalesPolicy: '具体售后规则待定，取消与改期由店员逐单审核。' },
    products: [
      { id: 'strawberry', name: '草莓云朵', subtitle: '轻盈奶油 · 鲜甜草莓', description: '绵软戚风配轻盈奶油，用一颗颗草莓装点值得庆祝的日子。图片为示意，价格与口味为演示资料。', theme: 'berry', badge: '人气款', onSale: true, sizes: [{ name: '6寸', priceCents: 20000 }, { name: '8寸', priceCents: 28000 }, { name: '10寸', priceCents: 38000 }], flavors: ['香草草莓', '草莓酸奶'] },
      { id: 'chocolate', name: '可可心语', subtitle: '浓郁可可 · 柔软夹心', description: '浓郁巧克力与柔软蛋糕交织，把想说的话藏进每一口甜蜜。图片为示意，价格与口味为演示资料。', theme: 'cocoa', badge: '巧克力控', onSale: true, sizes: [{ name: '6寸', priceCents: 22000 }, { name: '8寸', priceCents: 30000 }], flavors: ['经典巧克力', '榛子巧克力'] },
      { id: 'peach', name: '蜜桃花园', subtitle: '清甜蜜桃 · 温柔奶香', description: '清甜蜜桃遇上细腻奶油，一份温柔的庆祝心意。图片为示意，价格与口味为演示资料。', theme: 'peach', badge: '清甜推荐', onSale: true, sizes: [{ name: '6寸', priceCents: 20000 }, { name: '8寸', priceCents: 29000 }], flavors: ['蜜桃香草', '蜜桃乌龙'] }
    ], orders: [], payments: [], refunds: [], events: [], notifications: [], sessions: []
  };
}

function localParts(now) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const values = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return { date: `${values.year}-${values.month}-${values.day}`, time: `${values.hour}:${values.minute}` };
}
function validTime(time) { return typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time); }
function schedule(settings, date, time, now) {
  ensure(typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date), '请选择交付日期');
  const parsed = new Date(`${date}T00:00:00Z`);
  ensure(!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date, '交付日期无效');
  ensure(validTime(time), '请选择有效的交付时间');
  ensure(time >= settings.openTime && time <= settings.closeTime, `交付时间须在 ${settings.openTime}–${settings.closeTime} 内`);
  const current = localParts(now);
  ensure(date > current.date || (date === current.date && time > current.time), '请选择未来的交付时间');
}
function text(value, name, max, required = false) {
  ensure(typeof value === 'string', `${name}格式不正确`);
  const result = value.trim();
  ensure(result.length <= max && (!required || result.length > 0), `${name}${required ? '不能为空，且' : ''}最多 ${max} 字`);
  return result;
}

class Shop {
  constructor(state = initialState(), options = {}) { this.state = state; this.now = options.now || (() => new Date()); this.save = options.save || (() => {}); }
  transact(fn) {
    const before = clone(this.state);
    try { const result = fn(); this.save(this.state); return clone(result); }
    catch (error) { this.state = before; throw error; }
  }
  stamp() { return this.now().toISOString(); }
  staff(actor) { ensure(actor && actor.role === 'staff', '仅获授权的店员可操作', 403); }
  actor(actor) { ensure(actor && actor.id, '请先登录', 401); }
  order(actor, id) {
    this.actor(actor);
    const order = this.state.orders.find(item => item.id === id);
    ensure(order && (actor.role === 'staff' || order.customerId === actor.id), '订单不存在', 404);
    return order;
  }
  event(order, type, message, actor) { order.history.push({ id: randomUUID(), type, message, at: this.stamp(), by: actor?.role || 'system' }); order.updatedAt = this.stamp(); }
  notify(order, title) { this.state.notifications.unshift({ id: randomUUID(), orderId: order.id, title, at: this.stamp(), channel: 'demo', read: false }); }
  present(order) {
    const result = clone(order);
    result.statusLabel = LABELS[result.status];
    result.paidCents = result.depositPaidCents + result.balancePaidCents;
    result.balanceDueCents = Math.max(0, result.totalCents - result.paidCents);
    result.refunds = clone(this.state.refunds.filter(item => item.orderId === order.id));
    delete result.customerId;
    return result;
  }
  settings() { return clone(this.state.settings); }
  products(actor) { return clone(this.state.products.filter(p => p.onSale || actor?.role === 'staff')); }
  list(actor) { this.actor(actor); return this.state.orders.filter(order => actor.role === 'staff' || order.customerId === actor.id).slice().reverse().map(order => this.present(order)); }
  get(actor, id) { return this.present(this.order(actor, id)); }
  createOrder(actor, data) {
    this.actor(actor); ensure(actor.role === 'customer', '请使用客户身份提交预订', 403);
    return this.transact(() => {
      const product = this.state.products.find(p => p.id === data.productId && p.onSale);
      ensure(product, '蛋糕已下架，请重新选择');
      const size = product.sizes.find(s => s.name === data.size);
      ensure(size && product.flavors.includes(data.flavor), '请选择有效的尺寸和口味');
      const contactName = text(data.contactName, '联系人', 30, true);
      const phone = text(data.phone, '手机号', 20, true);
      ensure(/^\+?\d{7,15}$/.test(phone.replace(/[ ()-]/g, '')), '请输入7–15位有效联系电话，可包含国家或地区代码');
      ensure(['pickup', 'delivery'].includes(data.fulfillment), '请选择自取或配送');
      const address = text(data.address || '', '配送地址', 200, data.fulfillment === 'delivery');
      const message = text(data.message || '', '祝福语', 60);
      const note = text(data.note || '', '备注', 200);
      schedule(this.state.settings, data.date, data.time, this.now());
      const totalCents = size.priceCents;
      const order = { id: randomUUID(), number: `JJL${localParts(this.now()).date.replaceAll('-', '')}${randomUUID().slice(0, 6).toUpperCase()}`, customerId: actor.id, product: { id: product.id, name: product.name, theme: product.theme, size: size.name, flavor: data.flavor }, contactName, phone, fulfillment: data.fulfillment, address: data.fulfillment === 'delivery' ? address : '', date: data.date, time: data.time, message, note, totalCents, depositPercent: this.state.settings.depositPercent, depositCents: Math.round(totalCents * this.state.settings.depositPercent / 100), depositPaidCents: 0, balancePaidCents: 0, balanceMethod: null, refundedCents: 0, status: 'WAIT_CONFIRM', rejectionReason: '', request: null, requestHistory: [], createdAt: this.stamp(), updatedAt: this.stamp(), history: [] };
      this.event(order, 'created', '预订已提交，等待店员确认档期和交付安排', actor);
      this.state.orders.push(order); this.notify(order, '新蛋糕预订');
      return this.present(order);
    });
  }
  noPending(order) { ensure(!order.request || order.request.status !== 'PENDING', '请先处理当前取消或改期申请'); }
  confirm(actor, id, accepted, reason = '') {
    this.staff(actor);
    return this.transact(() => {
      const order = this.order(actor, id); this.noPending(order);
      ensure(order.status === 'WAIT_CONFIRM', '订单已处理，请刷新');
      if (accepted) { schedule(this.state.settings, order.date, order.time, this.now()); order.status = 'WAIT_DEPOSIT'; this.event(order, 'confirmed', '店员已确认，可支付30%定金', actor); }
      else { order.status = 'REJECTED'; order.rejectionReason = text(reason, '拒单原因', 200, true); this.event(order, 'rejected', `未能接单：${order.rejectionReason}`, actor); }
      return this.present(order);
    });
  }
  advance(actor, id, next) {
    this.staff(actor);
    return this.transact(() => {
      const order = this.order(actor, id); this.noPending(order);
      const legal = { RESERVED: ['MAKING'], MAKING: ['READY'], READY: order.fulfillment === 'delivery' ? ['DELIVERING', 'COMPLETED'] : ['COMPLETED'], DELIVERING: ['COMPLETED'] };
      ensure(legal[order.status]?.includes(next), '当前订单不能执行此操作');
      if (next === 'COMPLETED') ensure(order.depositPaidCents + order.balancePaidCents === order.totalCents, '请先收齐尾款再完成订单');
      order.status = next; this.event(order, 'progress', LABELS[next], actor); return this.present(order);
    });
  }
  createPayment(actor, id, stage) {
    return this.transact(() => {
      const order = this.order(actor, id);
      ensure(actor.role === 'customer', '付款须由下单客户发起', 403); this.noPending(order);
      ensure(['deposit', 'balance'].includes(stage), '付款类型无效');
      ensure(stage === 'deposit' ? order.status === 'WAIT_DEPOSIT' && !order.depositPaidCents : ['READY', 'DELIVERING'].includes(order.status) && !order.balancePaidCents && order.depositPaidCents === order.depositCents, '当前订单无需支付此款项');
      const existing = this.state.payments.find(p => p.orderId === id && p.stage === stage && p.status === 'PENDING');
      if (existing) return existing;
      const payment = { id: randomUUID(), orderId: id, stage, amountCents: stage === 'deposit' ? order.depositCents : order.totalCents - order.depositCents, status: 'PENDING', mode: 'demo', createdAt: this.stamp() };
      this.state.payments.push(payment); return payment;
    });
  }
  paymentResult(paymentId, eventId, amountCents, success) {
    return this.transact(() => {
      const payment = this.state.payments.find(p => p.id === paymentId);
      ensure(payment, '付款记录不存在', 404);
      ensure(money(amountCents) && amountCents === payment.amountCents, '支付金额不匹配');
      if (this.state.events.includes(eventId)) return this.present(this.state.orders.find(o => o.id === payment.orderId));
      const order = this.state.orders.find(o => o.id === payment.orderId);
      if (payment.status === 'SUCCEEDED') return this.present(order);
      ensure(payment.status === 'PENDING', '付款记录已关闭', 409);
      if (!success) { payment.status = 'FAILED'; this.event(order, 'payment_failed', '模拟支付失败，未扣款，可重新发起'); }
      else {
        this.noPending(order);
        ensure(payment.stage === 'deposit' ? order.status === 'WAIT_DEPOSIT' && !order.depositPaidCents : ['READY', 'DELIVERING'].includes(order.status) && !order.balancePaidCents, '订单已变化，不能重复收款', 409);
        payment.status = 'SUCCEEDED'; payment.paidAt = this.stamp();
        if (payment.stage === 'deposit') { order.depositPaidCents = payment.amountCents; order.status = 'RESERVED'; }
        else { order.balancePaidCents = payment.amountCents; order.balanceMethod = 'online'; }
        this.event(order, 'payment', `模拟${payment.stage === 'deposit' ? '定金' : '尾款'}支付成功 ¥${(payment.amountCents / 100).toFixed(2)}`);
      }
      this.state.events.push(eventId); return this.present(order);
    });
  }
  simulatePayment(actor, paymentId, success = true) {
    const payment = this.state.payments.find(p => p.id === paymentId);
    ensure(payment, '付款记录不存在', 404);
    this.order(actor, payment.orderId); ensure(actor.role === 'customer', '付款须由客户操作', 403);
    return this.paymentResult(paymentId, `demo:${paymentId}:${success}`, payment.amountCents, success);
  }
  offlineBalance(actor, id, method) {
    this.staff(actor);
    return this.transact(() => {
      const order = this.order(actor, id); this.noPending(order);
      ensure(['READY', 'DELIVERING'].includes(order.status), '只能在交付时登记尾款');
      ensure(order.depositPaidCents === order.depositCents && !order.balancePaidCents, '尾款已收或定金未付，不能重复登记');
      ensure(['cash', 'store_qr'].includes(method), '请选择现金或门店收款码');
      order.balancePaidCents = order.totalCents - order.depositPaidCents; order.balanceMethod = method;
      for (const payment of this.state.payments) if (payment.orderId === id && payment.stage === 'balance' && payment.status === 'PENDING') payment.status = 'CLOSED';
      this.event(order, 'offline_payment', `店员已登记线下尾款（${method === 'cash' ? '现金' : '门店收款码'}）`, actor);
      return this.present(order);
    });
  }
  requestChange(actor, id, data) {
    return this.transact(() => {
      const order = this.order(actor, id); ensure(actor.role === 'customer', '请使用客户身份申请', 403);
      ensure(ACTIVE.includes(order.status), '当前订单不能申请取消或改期'); this.noPending(order);
      ensure(['cancel', 'reschedule'].includes(data.type), '申请类型无效');
      const reason = text(data.reason, '申请原因', 200, true);
      if (data.type === 'reschedule') schedule(this.state.settings, data.date, data.time, this.now());
      order.request = { id: randomUUID(), type: data.type, reason, date: data.type === 'reschedule' ? data.date : null, time: data.type === 'reschedule' ? data.time : null, status: 'PENDING', createdAt: this.stamp() };
      this.event(order, 'request', `客户申请${data.type === 'cancel' ? '取消' : '改期'}：${reason}`, actor); this.notify(order, '新的售后申请');
      return this.present(order);
    });
  }
  reviewChange(actor, id, data) {
    this.staff(actor);
    return this.transact(() => {
      const order = this.order(actor, id); const request = order.request;
      ensure(request?.status === 'PENDING', '没有待审核申请');
      ensure(typeof data.approved === 'boolean', '请选择同意或拒绝');
      const response = text(data.response || '', '审核说明', 200, !data.approved);
      if (data.approved && request.type === 'reschedule') {
        schedule(this.state.settings, request.date, request.time, this.now());
        order.date = request.date; order.time = request.time;
        if (order.status === 'WAIT_DEPOSIT') order.status = 'WAIT_CONFIRM';
      }
      if (data.approved && request.type === 'cancel') {
        const onlinePaid = order.depositPaidCents + (order.balanceMethod === 'online' ? order.balancePaidCents : 0);
        ensure(money(data.refundCents) && data.refundCents <= onlinePaid - order.refundedCents, '退款金额须在可退线上付款范围内');
        order.status = 'CANCELLED';
        for (const payment of this.state.payments) if (payment.orderId === id && payment.status === 'PENDING') payment.status = 'CLOSED';
        if (data.refundCents > 0) this.state.refunds.push({ id: randomUUID(), orderId: id, amountCents: data.refundCents, status: 'PENDING', createdAt: this.stamp() });
      }
      request.status = data.approved ? 'APPROVED' : 'REJECTED'; request.response = response; request.reviewedAt = this.stamp();
      order.requestHistory.push(clone(request)); order.request = null;
      this.event(order, 'review', `${data.approved ? '同意' : '拒绝'}${request.type === 'cancel' ? '取消' : '改期'}申请${response ? `：${response}` : ''}`, actor);
      return this.present(order);
    });
  }
  refundResult(actor, refundId, success = true) {
    this.staff(actor);
    return this.transact(() => {
      const refund = this.state.refunds.find(r => r.id === refundId); ensure(refund, '退款记录不存在', 404);
      const order = this.state.orders.find(o => o.id === refund.orderId);
      if (refund.status === 'SUCCEEDED') return this.present(order);
      refund.status = success ? 'SUCCEEDED' : 'FAILED';
      if (success) { order.refundedCents += refund.amountCents; refund.completedAt = this.stamp(); }
      this.event(order, 'refund', success ? `模拟退款成功 ¥${(refund.amountCents / 100).toFixed(2)}` : '模拟退款失败，可由店员重试', actor);
      return this.present(order);
    });
  }
  updateProduct(actor, id, data) {
    this.staff(actor);
    return this.transact(() => {
      const product = this.state.products.find(p => p.id === id); ensure(product, '商品不存在', 404);
      const name = text(data.name, '商品名称', 40, true); const subtitle = text(data.subtitle || '', '商品副标题', 60);
      const description = text(data.description || '', '商品描述', 500);
      ensure(typeof data.onSale === 'boolean', '上架状态无效');
      ensure(Array.isArray(data.sizes) && data.sizes.length > 0 && data.sizes.length <= 10, '请填写1–10种规格');
      const sizes = data.sizes.map(size => ({ name: text(size.name, '规格名称', 20, true), priceCents: size.priceCents }));
      ensure(sizes.every(size => money(size.priceCents) && size.priceCents >= 100 && size.priceCents <= 10000000), '蛋糕价格须为1–100000元');
      ensure(new Set(sizes.map(s => s.name)).size === sizes.length, '规格名称不能重复');
      ensure(Array.isArray(data.flavors) && data.flavors.length > 0 && data.flavors.length <= 20, '请填写1–20种口味');
      const flavors = data.flavors.map(f => text(f, '口味', 30, true)); ensure(new Set(flavors).size === flavors.length, '口味不能重复');
      Object.assign(product, { name, subtitle, description, sizes, flavors, onSale: data.onSale }); return product;
    });
  }
  updateSettings(actor, data) {
    this.staff(actor);
    return this.transact(() => {
      ensure(validTime(data.openTime) && validTime(data.closeTime) && data.openTime < data.closeTime, '营业时间无效，结束时间须晚于开始时间');
      const phone = text(data.phone || '', '联系电话', 30); ensure(!phone || /^[\d+() -]{5,30}$/.test(phone), '联系电话格式不正确');
      Object.assign(this.state.settings, { openTime: data.openTime, closeTime: data.closeTime, address: text(data.address || '', '门店地址', 200), phone, afterSalesPolicy: text(data.afterSalesPolicy || '', '售后规则', 500, true) });
      return this.state.settings;
    });
  }
  notifications(actor) { this.staff(actor); return clone(this.state.notifications); }
  readNotifications(actor) { this.staff(actor); return this.transact(() => { this.state.notifications.forEach(n => { n.read = true; }); return this.state.notifications; }); }
}

module.exports = { Shop, AppError, initialState, localParts, schedule, LABELS };
