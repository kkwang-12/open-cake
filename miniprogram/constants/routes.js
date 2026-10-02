const pages = {
  home: '/pages/home/home', shop: '/pages/shop/shop', orders: '/pages/orders/orders',
  account: '/pages/account/account', product: '/pages/product/product',
  specification: '/pages/specification/specification', bag: '/pages/bag/bag',
  checkout: '/pages/checkout/checkout', orderSuccess: '/pages/order-success/order-success',
  orderDetail: '/pages/order-detail/order-detail', addresses: '/pages/addresses/addresses',
  favorites: '/pages/favorites/favorites', admin: '/pages/admin/admin'
};
const tabs = ['home', 'shop', 'orders', 'account'];
function navigate(name, params = {}) {
  if (!pages[name]) throw new Error('未登记的页面');
  if (tabs.includes(name)) return wx.switchTab({ url: pages[name] });
  const query = Object.keys(params).map(key => encodeURIComponent(key) + '=' + encodeURIComponent(params[key])).join('&');
  return wx.navigateTo({ url: pages[name] + (query ? '?' + query : '') });
}
module.exports = { pages, tabs, navigate };
