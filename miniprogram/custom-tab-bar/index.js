const transition = require('../utils/tab-transition');
const items = [
  { path: 'pages/home/home', text: '首页', icon: 'home' },
  { path: 'pages/shop/shop', text: '选购', icon: 'shop' },
  { path: 'pages/orders/orders', text: '订单', icon: 'orders' },
  { path: 'pages/account/account', text: '我的', icon: 'account' }
].map(item => Object.assign({}, item, {
  outline: '/assets/icons/tab-bar/' + item.icon + '-outline.svg',
  filled: '/assets/icons/tab-bar/' + item.icon + '-filled.svg'
}));

Component({
  data: { selected: -1, active: -1, items },
  lifetimes: {
    attached() { this.syncSelection(); }
  },
  pageLifetimes: {
    show() {
      this.syncSelection();
      // The page stack may still refer to the departing page during this lifecycle.
      if (typeof wx.nextTick === 'function') wx.nextTick(() => this.syncSelection());
    }
  },
  methods: {
    syncSelection() {
      const pages = getCurrentPages();
      const page = pages[pages.length - 1];
      const selected = page ? items.findIndex(item => item.path === page.route) : -1;
      if (selected >= 0) transition.syncBar(this, selected);
    },
    switchTab(e) {
      const index = Number(e.currentTarget.dataset.index);
      transition.request(index);
    }
  }
});
