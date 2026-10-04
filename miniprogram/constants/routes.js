const pages = {
  home: '/pages/home/home', shop: '/pages/shop/shop', orders: '/pages/orders/orders',
  account: '/pages/account/account', product: '/features/product/product',
  specification: '/features/specification/specification', bag: '/features/bag/bag',
  checkout: '/features/checkout/checkout', orderSuccess: '/features/order-success/order-success',
  orderDetail: '/features/order-detail/order-detail', addresses: '/features/addresses/addresses',
  favorites: '/features/favorites/favorites', admin: '/features/admin/admin'
};
const tabs = ['home', 'shop', 'orders', 'account'];
function navigate(name, params = {}) {
  if (!pages[name]) throw new Error('未登记的页面');
  if (tabs.includes(name)) return wx.switchTab({ url: pages[name] });
  const query = Object.keys(params).map(key => encodeURIComponent(key) + '=' + encodeURIComponent(params[key])).join('&');
  return wx.navigateTo({ url: pages[name] + (query ? '?' + query : '') });
}
module.exports = { pages, tabs, navigate };
