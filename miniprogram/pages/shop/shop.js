const routes = require('../../constants/routes');
const catalog = require('../../services/catalog');
const tabTransition = require('../../utils/tab-transition');
const { measure } = require('../../utils/safe-area');
Page({
  data: { tabMotion: 'tab-prepared', topInset: 24, navHeight: 44, capsuleWidth: 104, category: 'cake', categoryIndex: 0, products: [], loading: false, refreshing: false, listReady: false, error: '', hasMore: false, nextCursor: null, source: '',
    categories: [
      { id: 'cake', code: 'CAKE', name: '蛋糕' },
      { id: 'mini', code: 'MINI_CAKE', name: '小蛋糕' },
      { id: 'bread', code: 'BREAD', name: '面包' }
    ]
  },
  onLoad() { this.setData(measure()); },
  openBag() { routes.navigate('bag'); },
  onShow() {
    tabTransition.show(this, 1);
    this._visible = true;
    const category = getApp().globalData.pendingShopCategory;
    const categoryIndex = this.data.categories.findIndex(item => item.id === category);
    if (categoryIndex >= 0) {
      this._tabScrollTop = 0;
      this.setData({ category, categoryIndex });
      if (typeof wx.pageScrollTo === 'function') wx.pageScrollTo({ scrollTop: 0, duration: 0 });
    }
    getApp().globalData.pendingShopCategory = '';
    if (categoryIndex >= 0 || !this._loaded) return this.load(true);
  },
  onHide() { tabTransition.hide(this); this._visible = false; this._requestEpoch = (this._requestEpoch || 0) + 1; this.setData({ loading: false, refreshing: false }); },
  onPageScroll(event) { tabTransition.scroll(this, event); },
  onUnload() { this.onHide(); },
  async load(reset = true) {
    if (!reset && (this.data.loading || !this.data.hasMore)) return;
    if (reset) this._loaded = false;
    const ticket = this._requestEpoch = (this._requestEpoch || 0) + 1;
    const cursor = reset ? null : this.data.nextCursor;
    const category = this.data.categories.find(item => item.id === this.data.category);
    if (!category) return;
    // Keep the rendered list mounted until its replacement is ready; do not flash a loading screen.
    this.setData({ loading: true, refreshing: reset && this.data.listReady, error: '' });
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
      this._loaded = true;
      this.setData({ products, nextCursor: page.nextCursor, hasMore: page.hasMore, source: page.source, loading: false, refreshing: false, listReady: true, error: '' });
    } catch (error) {
      if (ticket !== this._requestEpoch || !this._visible) return;
      // Fixed UI text; never display an upstream stack, raw request or private error message.
      // An actual replacement failure must not leave the previous category looking like current results.
      const failure = reset ? { products: [], nextCursor: null, hasMore: false, source: '' } : {};
      this.setData(Object.assign(failure, { loading: false, refreshing: false, error: error.code === 'CLOUD_NOT_CONFIGURED' ?
        '商品服务暂未开通，欢迎稍后再来。' : error.code==='INVALID_REQUEST'?
        '商品分页已失效，请重新加载。':'商品加载失败，请重试。' }));
    }
  },
  chooseCategory(e) {
    const category = e.currentTarget.dataset.id;
    const categoryIndex = this.data.categories.findIndex(item => item.id === category);
    if (categoryIndex < 0 || category === this.data.category) return;
    this.setData({ category, categoryIndex });
    return this.load(true);
  },
  loadMore() { return this.load(false); },
  retry() { if (this.data.loading) return; return this.load(this.data.products.length === 0); },
  onReachBottom() { return this.loadMore(); },
  select(e) {
    if (this.data.refreshing) return;
    const product = this.data.products.find(item => item.id === e.detail.id);
    if (!product) return;

    routes.navigate('product', { id: product.id });
  }
});
