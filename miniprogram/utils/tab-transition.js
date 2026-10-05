const paths = ['pages/home/home', 'pages/shop/shop', 'pages/orders/orders', 'pages/account/account'];
let target = null;
let switching = false;
let entering = null;
function current() {
  const pages = getCurrentPages();
  return pages[pages.length - 1];
}
function highlight(page, index) {
  const bar = page && typeof page.getTabBar === 'function' && page.getTabBar();
  if (bar && bar.data.active !== index) bar.setData({ active: index });
}
function syncBar(bar, index) {
  const active = target !== null ? target : entering !== null ? entering : index;
  bar.setData({ selected: index, active });
}
function dispatch() {
  if (target === null || switching) return;
  const index = target;
  target = null;
  const page = current();
  if (!page || paths[index] === page.route) {
    if (page) highlight(page, index);
    return;
  }
  switching = true;
  entering = index;
  // Dispatch immediately. Only the native operation is serialized; animations
  // never block navigation and intermediate taps are replaced by the latest.
  wx.switchTab({
    url: '/' + paths[index],
    fail() {
      if (entering === index) entering = null;
      if (target === null) {
        const visible = current();
        if (visible) highlight(visible, paths.indexOf(visible.route));
      }
    },
    complete() {
      switching = false;
      if (target !== null) dispatch();
    }
  });
}
function request(index) {
  if (!Number.isInteger(index) || !paths[index]) return;
  const page = current();
  if (!page) return;
  highlight(page, index);
  if (!switching && paths[index] === page.route) return;
  target = index;
  dispatch();
}
function show(page, index) {
  clearTimeout(page._tabEntryTimer);
  const token = page._tabMotionToken = (page._tabMotionToken || 0) + 1;
  const animate = entering === index;
  const bar = typeof page.getTabBar === 'function' && page.getTabBar();
  if (bar) syncBar(bar, index);
  if (animate) entering = null;
  // One opacity-only animation; do not remount content or reset native scroll.
  page.setData({ tabMotion: animate ? 'tab-entering' : '' }, () => {
    if (!animate || page._tabMotionToken !== token) return;
    page._tabEntryTimer = setTimeout(() => {
      if (page._tabMotionToken === token) page.setData({ tabMotion: '' });
    }, 160);
  });
}
function hide(page) {
  clearTimeout(page._tabEntryTimer);
  page._tabMotionToken = (page._tabMotionToken || 0) + 1;
  // Keep cached content visible beneath native detail push/pop transitions.
  page.setData({ tabMotion: '' });
}
function scroll(page, event) { page._tabScrollTop = Math.max(0, Number(event.scrollTop) || 0); }
module.exports = { request, show, hide, scroll, syncBar };
