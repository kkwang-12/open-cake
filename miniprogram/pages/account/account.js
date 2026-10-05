const config = require('../../config');
const routes = require('../../constants/routes');
const user = require('../../services/user');
const store = require('../../services/store');
const storeInformation = require('../../services/store-information');
const tabTransition = require('../../utils/tab-transition');
Page({
  data: { tabMotion: '', showDevelopment: config.stage === 'development', legacyEnabled: false, busy: false, error: '', requestId: '', diagnostic: '' },
  onShow() {
    tabTransition.show(this, 3);
    this.setData({ legacyEnabled: config.stage === 'development' && config.mode === 'shell' && config.enableLegacyDemo === true });
  },
  onHide() { tabTransition.hide(this); },
  onUnload() { this.onHide(); },
  onPageScroll(event) { tabTransition.scroll(this, event); },
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
