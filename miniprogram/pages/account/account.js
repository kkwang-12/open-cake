const config = require('../../config');
const routes = require('../../constants/routes');
const user = require('../../services/user');
const store = require('../../services/store');
Page({
  data: { showDevelopment: config.stage === 'development', legacyEnabled: false, busy: false, error: '', requestId: '', diagnostic: '' },
  onShow() {
    this.setData({ legacyEnabled: config.stage === 'development' && config.mode === 'shell' && config.enableLegacyDemo === true });
  },
  navigate(e) { routes.navigate(e.currentTarget.dataset.target); },
  information(e) {
    const messages = { service: '客服联系方式正在准备中', store: '门店地址与营业信息即将公布', about: '家家乐蛋糕店 · 为每一个值得庆祝的时刻', privacy: '购买开放前将公布隐私与服务说明' };
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
