const routes = require('../../constants/routes');
const tabTransition = require('../../utils/tab-transition');
Page({
  data: { tabMotion: 'tab-prepared' },
  onShow() {
    tabTransition.show(this, 2);
  },
  onHide() { tabTransition.hide(this); },
  onUnload() { this.onHide(); },
  onPageScroll(event) { tabTransition.scroll(this, event); },
  shop() { routes.navigate('shop'); }
});
