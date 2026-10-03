const routes = require('../../constants/routes');
const catalog = require('../../services/catalog');
Page({
  data: { category: 'all', products: [], loading: false, error: '', hasMore: false, nextCursor: null, source: '',
    categories: [
      { id: 'all', code: '', name: '全部', en: 'All' },
      { id: 'cake', code: 'CAKE', name: '蛋糕', en: 'Cake' },
      { id: 'mini', code: 'MINI_CAKE', name: '小蛋糕', en: 'Mini Cake' },
      { id: 'bread', code: 'BREAD', name: '面包', en: 'Bread' }
    ]
  },
  onShow() {
    this._visible = true;
    const category = getApp().globalData.pendingShopCategory;
    if (this.data.categories.some(item => item.id === category)) this.setData({ category });
    getApp().globalData.pendingShopCategory = '';
    return this.load(true);
  },
  onHide() { this._visible = false; this._requestEpoch = (this._requestEpoch || 0) + 1; },
  onUnload() { this.onHide(); },
  async load(reset = true) {
    if (!reset && (this.data.loading || !this.data.hasMore)) return;
    const ticket = this._requestEpoch = (this._requestEpoch || 0) + 1;
    const cursor = reset ? null : this.data.nextCursor;
    const category = this.data.categories.find(item => item.id === this.data.category);
    if (!category) return;
    this.setData(reset ? { products: [], nextCursor: null, hasMore: false, source: '', loading: true, error: '' } :
      { loading: true, error: '' });
    try {
      const request = { pageSize: 6, cursor };
      if (category.code) request.categoryCode = category.code;
      const page = await catalog.list(request);
      if (ticket !== this._requestEpoch || !this._visible) return;
      if (!page || !Array.isArray(page.items) || typeof page.hasMore !== 'boolean' ||
          (page.hasMore ? typeof page.nextCursor !== 'string' || !page.nextCursor || page.nextCursor === cursor : page.nextCursor !== null)) throw new Error();
      const products = reset ? [] : this.data.products.slice();
      const ids = new Set(products.map(item => item.id));
      for (const item of page.items) if (!ids.has(item.id)) { products.push(item); ids.add(item.id); }
      this.setData({ products, nextCursor: page.nextCursor, hasMore: page.hasMore, source: page.source, loading: false, error: '' });
    } catch (error) {
      if (ticket !== this._requestEpoch || !this._visible) return;
      // Fixed UI text; never display an upstream stack, raw request or private error message.
      this.setData({ loading: false, error: error.code === 'CLOUD_NOT_CONFIGURED' ?
        '商品服务暂未开通，欢迎稍后再来。' : '商品加载失败，请重试。' });
    }
  },
  chooseCategory(e) {
    const category = e.currentTarget.dataset.id;
    if (!this.data.categories.some(item => item.id === category) || category === this.data.category) return;
    this.setData({ category });
    return this.load(true);
  },
  loadMore() { return this.load(false); },
  retry() { if (this.data.loading) return; return this.load(this.data.products.length === 0); },
  onReachBottom() { return this.loadMore(); },
  select(e) {
    const product = this.data.products.find(item => item.id === e.detail.id);
    if (!product) return;

    routes.navigate('product', { id: product.id });
  }
});
