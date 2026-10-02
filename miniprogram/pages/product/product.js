const api = require('../../utils/api'); const view = require('../../utils/view');
Page({
  data: { product: null, sizeIndex: 0, flavorIndex: 0, priceYuan: '', error: '', busy: false },
  onLoad(options) { this.id = options.id; this.load(); },
  async load() { await api.run(this, async()=>{ await api.ready(); const items = await api.request('/products'); const product = items.find(p=>p.id===this.id); if (!product) throw new Error('商品已下架，请返回首页重新选择'); this.setData({ product: view.product(product), priceYuan: view.yuan(product.sizes[0].priceCents) }); }); },
  size(e) { const index = Number(e.currentTarget.dataset.index); this.setData({ sizeIndex: index, priceYuan: this.data.product.sizes[index].priceYuan }); },
  flavor(e) { this.setData({ flavorIndex: Number(e.currentTarget.dataset.index) }); },
  checkout() { wx.navigateTo({ url: `/pages/checkout/checkout?id=${this.id}&size=${this.data.sizeIndex}&flavor=${this.data.flavorIndex}` }); }
});
