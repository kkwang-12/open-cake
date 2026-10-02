const routes = require('../../constants/routes');
const preview = require('../../services/catalog-preview');
Page({
  data: { product: null, imageFailed: false },
  onLoad(options = {}) { this.setData({ product: preview.products().find(item => item.id === options.id) || null }); },
  imageError() { this.setData({ imageFailed: true }); },
  browse() { routes.navigate('shop'); }
});
