const config = require('../../config');
const routes = require('../../constants/routes');
const user = require('../../services/user');
const store = require('../../services/store');
const storeInformation = require('../../services/store-information');
const tabTransition = require('../../utils/tab-transition');
const { measure } = require('../../utils/safe-area');
const { readLocalAddressCount } = require('./local-address-count');
Page({
  data: {
    tabMotion: '', greetingMotion: '', topInset: 24, navHeight: 44, capsuleWidth: 104, addressCount: '—', bannerFailed: false,
    menus: [
      { target: 'orders', label: '我的订单', icon: '/assets/icons/navigation/account-orders.svg' },
      { target: 'favorites', label: '我的收藏', icon: '/assets/icons/feedback/heart-outline.svg' },
      { target: 'addresses', label: '收货地址', icon: '/assets/icons/navigation/account-location.svg' },
      { target: 'service', label: '客服与帮助', icon: '/assets/icons/navigation/account-service.svg' },
      { target: 'store', label: '门店信息', icon: '/assets/icons/navigation/account-store.svg' },
      { target: 'about', label: '关于 LUNE', icon: '/assets/icons/navigation/account-info.svg' }
    ],
    showDevelopment: config.stage === 'development', legacyEnabled: false, busy: false, error: '', requestId: '', diagnostic: ''
  },
  onLoad() { this.setData(measure()); },
  onResize() { this.setData(measure()); },
  onShow() {
    tabTransition.show(this, 3);
    this._greetingEntry = (this._greetingEntry || 0) + 1;
    this.setData({ greetingMotion: this._greetingEntry % 2 ? 'greeting-in-a' : 'greeting-in-b' });
    this.refreshAddressCount();
    this.setData({ legacyEnabled: config.stage === 'development' && config.mode === 'shell' && config.enableLegacyDemo === true });
  },
  onHide() { tabTransition.hide(this); this.setData({ greetingMotion: '' }); },
  onUnload() { this.onHide(); },
  onPageScroll(event) { tabTransition.scroll(this, event); },
  refreshAddressCount() {
    const count = readLocalAddressCount(config, typeof wx === 'undefined' ? null : wx);
    this.setData({ addressCount: count === null ? '—' : String(count) });
  },
  login() { wx.showToast({ title: '登录功能正在准备中', icon: 'none' }); },
  settings() { wx.showToast({ title: '设置功能正在准备中', icon: 'none' }); },
  birthday() { routes.navigate('shop'); },
  bannerError() { this.setData({ bannerFailed: true }); },
  menuAction(e) {
    const target = e.currentTarget.dataset.target;
    if (['orders', 'favorites', 'addresses'].includes(target)) this.navigate(e);
    else if (['service', 'store', 'about'].includes(target)) this.information(e);
  },
  navigate(e) { const target=e.currentTarget.dataset.target;if(['orders','favorites','addresses'].includes(target))routes.navigate(target); },
  information(e) {
    const reference=storeInformation.confirmed();
    const messages = { service: '客服联系方式正在准备中', store: reference.address+'。'+reference.openingHours+'。支持到店自取与门店自行配送，配送半径20km（含边界），配送费0元。'+(reference.phone?'门店电话：'+reference.phone:'门店电话正在准备中。'), about: reference.name+' · 为每一个值得庆祝的时刻', privacy: '购买开放前将公布隐私与服务说明' };
    wx.showModal({ title: '家家乐蛋糕店', content: messages[e.currentTarget.dataset.target] || messages.about, showCancel: false });
  },
  async checkCloud() {
    if (this.data.busy) return;
    this.setData({ busy: true, error: '', requestId: '', diagnostic: '' });
    try {
      const identity = await user.current();
      const health = await store.health();
      this.setData({ diagnostic: '身份校验通过 · 门店服务连通', requestId: identity.requestId + ' / ' + health.requestId });
    } catch (error) {
      this.setData({ error: error.message, requestId: error.requestId });
    } finally { this.setData({ busy: false }); }
  },
  legacy() {
    if (config.stage !== 'development' || config.mode !== 'shell' || !config.enableLegacyDemo) return;
    wx.navigateTo({ url: '/legacy/pages/shop/shop' });
  }
});
