const api = require('../../utils/api');
const view = require('../../utils/view');
Page({
  data: { products: [], shop: {}, error: '', busy: false },
  onShow() { this.load(); },
  async load() { await api.run(this, async()=>{ await api.ready(); const [config, products] = await Promise.all([api.request('/config'), api.request('/products')]); this.setData({ shop: config.shop, products: products.map(view.product) }); }); },
  select(e) { wx.navigateTo({ url: '/legacy/pages/product/product?id=' + e.currentTarget.dataset.id }); },
  orders() { wx.navigateTo({url:'/legacy/pages/orders/orders'}); },
  account() { wx.navigateTo({url:'/legacy/pages/account/account'}); },
  browse() { wx.pageScrollTo({ selector: '#cakes', duration: 300 }); }
});
