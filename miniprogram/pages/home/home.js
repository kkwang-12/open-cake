const routes = require('../../constants/routes');
const preview = require('../../services/catalog-preview');
const { measure } = require('../../utils/safe-area');
Page({
  data: { products: [], imageFailed: false, topInset: 24, navHeight: 44, capsuleWidth: 104, categories: [
    { id: 'cake', name: '蛋糕', en: 'Cake', image: '/assets/home/strawberry.jpg', imageFailed: false },
    { id: 'mini', name: '小蛋糕', en: 'Mini Cake', image: '/assets/home/chocolate.jpg', imageFailed: false },
    { id: 'bread', name: '面包', en: 'Bread', image: '/assets/home/bread.jpg', imageFailed: false }
  ] },
  onLoad() { this.setData(measure()); },
  onShow() {
    const products = preview.products();
    this.setData({ products });
  },
  browse() { routes.navigate('shop'); },
  openBag() { routes.navigate('bag'); },
  chooseCategory(e) {
    const category = e.currentTarget.dataset.id;
    if (!this.data.categories.some(item => item.id === category)) return;
    getApp().globalData.pendingShopCategory = category;
    routes.navigate('shop');
  },
  select(e) { routes.navigate('product', { id: e.detail.id || e.currentTarget.dataset.id }); },
  imageError() { this.setData({ imageFailed: true }); },
  categoryImageError(e) {
    const index = this.data.categories.findIndex(item => item.id === e.currentTarget.dataset.id);
    if (index >= 0) this.setData({ ['categories.' + index + '.imageFailed']: true });
  }
});
