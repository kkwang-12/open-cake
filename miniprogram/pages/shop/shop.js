const routes = require('../../constants/routes');
const preview = require('../../services/catalog-preview');
Page({
  data: { category: 'all', products: [], categories: [
    { id: 'all', name: '全部', en: 'All' },
    { id: 'cake', name: '蛋糕', en: 'Cake' },
    { id: 'mini', name: '迷你蛋糕', en: 'Mini Cake' },
    { id: 'bread', name: '面包', en: 'Bread' }
  ] },
  onShow() {
    const category = getApp().globalData.pendingShopCategory;
    if (this.data.categories.some(item => item.id === category)) this.setData({ category });
    getApp().globalData.pendingShopCategory = '';
    this.load();
  },
  load() { this.setData({ products: preview.products(this.data.category) }); },
  chooseCategory(e) {
    const category = e.currentTarget.dataset.id;
    if (!this.data.categories.some(item => item.id === category)) return;
    this.setData({ category });
    this.load();
  },
  select(e) { routes.navigate('product', { id: e.detail.id }); }
});
