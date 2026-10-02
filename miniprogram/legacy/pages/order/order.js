const api = require('../../utils/api'); const view = require('../../utils/view');
Page({
  data: { order: null, role: 'customer', error: '', busy: false, sheet: '', requestTypeIndex: 0, requestTypes: ['申请取消','申请改期'], reason: '', newDate: '', newTime: '14:00', minDate: '', approvedIndex: 0, reviewOptions: ['同意申请','拒绝申请'], response: '', refund: '0', openTime: '08:30', closeTime: '19:30' },
  onLoad(options) { this.id = options.id; this.setData({ role: options.role==='staff'?'staff':'customer' }); },
  onShow() { this.load(); },
  async load() { try { await api.ready(); const [config, order] = await Promise.all([api.request('/config'),api.request('/orders/'+this.id,'GET',undefined,this.data.role)]); this.setData({ order: view.order(order), error: '', minDate:view.dateAt(config.serverTime),newDate:view.tomorrow(config.serverTime),openTime:config.shop.openTime,closeTime:config.shop.closeTime,shopAddress:config.shop.address||'门店地址待补充' }); } catch(e) { api.fail(this,e); } },
  refresh() { this.load(); },
  async confirm() { await api.run(this,async()=>{ await api.request('/orders/'+this.id+'/confirm','POST',{accepted:true},'staff');await this.load(); }); },
  reject() { wx.showModal({title:'无法接单',editable:true,placeholderText:'请填写拒单原因',success:async r=>{if(r.confirm)await api.run(this,async()=>{await api.request('/orders/'+this.id+'/confirm','POST',{accepted:false,reason:r.content||''},'staff');await this.load();});}}); },
  async progress(e) { const status=e.currentTarget.dataset.status;await api.run(this,async()=>{await api.request('/orders/'+this.id+'/progress','POST',{status},'staff');await this.load();}); },
  async pay(e) { await api.run(this,async()=>{const payment=await api.request('/orders/'+this.id+'/payments','POST',{stage:e.currentTarget.dataset.stage});wx.showActionSheet({alertText:'模拟付款 ¥'+view.yuan(payment.amountCents)+'，不会扣款',itemList:['模拟支付成功','模拟支付失败'],success:async r=>{await api.run(this,async()=>{await api.request('/payments/'+payment.id+'/simulate','POST',{success:r.tapIndex===0});await this.load();});}});}); },
  offline() { wx.showActionSheet({itemList:['现金收款','门店收款码'],success:r=>{wx.showModal({title:'确认已收到尾款',content:'请确认实际收到 ¥'+this.data.order.dueYuan+'，登记后不可重复收款。',success:async result=>{if(result.confirm)await api.run(this,async()=>{await api.request('/orders/'+this.id+'/offline-balance','POST',{method:r.tapIndex===0?'cash':'store_qr'},'staff');await this.load();});}});}}); },
  request() { this.setData({sheet:'request',reason:'',requestTypeIndex:0}); },
  review() { this.setData({sheet:'review',response:'',refund:'0',approvedIndex:0}); },
  close() { this.setData({sheet:''}); },
  input(e) { this.setData({[e.currentTarget.dataset.field]:e.detail.value}); },
  select(e) { this.setData({[e.currentTarget.dataset.field]:Number(e.detail.value)}); },
  date(e) { this.setData({newDate:e.detail.value}); }, time(e) { this.setData({newTime:e.detail.value}); },
  async submitRequest() { await api.run(this,async()=>{const d=this.data;await api.request('/orders/'+this.id+'/requests','POST',{type:d.requestTypeIndex===0?'cancel':'reschedule',reason:d.reason,date:d.newDate,time:d.newTime});this.close();await this.load();}); },
  async submitReview() { await api.run(this,async()=>{const d=this.data;await api.request('/orders/'+this.id+'/review','POST',{approved:d.approvedIndex===0,response:d.response,refundCents:Math.round(Number(d.refund)*100)},'staff');this.close();await this.load();}); },
  async refund(e) { await api.run(this,async()=>{await api.request('/refunds/'+e.currentTarget.dataset.id+'/simulate','POST',{success:e.currentTarget.dataset.success==='true'||e.currentTarget.dataset.success===true},'staff');await this.load();}); }
});
