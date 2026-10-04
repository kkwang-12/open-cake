const paths = ['pages/home/home', 'pages/shop/shop', 'pages/orders/orders', 'pages/account/account'];
let target = null;
let timer = null;
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
  // Highlight only the visible page; pending taps must not toggle icons before navigation.
  const active = target !== null ? target : entering !== null ? entering : index;
  bar.setData({ selected: index, active });
}
function dispatch() {
  timer = null;
  if (target === null || switching) return;
  const index = target;
  target = null;
  const page = current();
  switching = true;
  entering = index;
  wx.switchTab({
    url: '/' + paths[index],
    fail() {
      entering = null;
      if (page) { page.setData({ tabMotion: '' }); highlight(page, paths.indexOf(page.route)); }
    },
    complete() {
      switching = false;
      if (target !== null) { const latest = target; target = null; request(latest); }
    }
  });
}
function request(index) {
  if (!Number.isInteger(index) || !paths[index]) return;
  const page = current();
  if (!page) return;
  const selected = paths.indexOf(page.route);
  if (index === selected && !switching) {
    if (timer === null && target === null) return;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    target = null;
    const token = page._tabMotionToken = (page._tabMotionToken || 0) + 1;
    clearTimeout(page._tabEntryTimer);
    page.setData({ tabMotion: 'tab-entering' }, () => {
      page._tabEntryTimer = setTimeout(() => {
        if (page._tabMotionToken === token) page.setData({ tabMotion: '' });
      }, 220);
    });
    highlight(page, selected);
    return;
  }
  target = index;
  highlight(page, index);
  if (switching || timer !== null) return;
  clearTimeout(page._tabEntryTimer);
  page._tabMotionToken = (page._tabMotionToken || 0) + 1;
  page.setData({ tabMotion: 'tab-leaving' }, () => {
    if (target !== null && timer === null && !switching) timer = setTimeout(dispatch, 90);
  });
}
function show(page, index) {
  clearTimeout(page._tabEntryTimer);
  const token = page._tabMotionToken = (page._tabMotionToken || 0) + 1;
  const animate = entering === index;
  const bar = typeof page.getTabBar === 'function' && page.getTabBar();
  if (bar) syncBar(bar, index);
  if (animate) entering = null;
  // Native tabs restore their own cached scroll before we reveal the prepared content.
  page.setData({ tabMotion: animate ? 'tab-prepared' : '' }, () => {
    if (!animate) return;
    const reveal = () => {
      if (page._tabMotionToken !== token) return;
      page.setData({ tabMotion: 'tab-entering' }, () => {
        page._tabEntryTimer = setTimeout(() => {
          if (page._tabMotionToken === token) page.setData({ tabMotion: '' });
        }, 220);
      });
    };
    if (typeof wx.nextTick === 'function') wx.nextTick(reveal);
    else page._tabEntryTimer = setTimeout(reveal, 32);
  });
}
function hide(page) {
  clearTimeout(page._tabEntryTimer);
  page._tabMotionToken = (page._tabMotionToken || 0) + 1;
  page.setData({ tabMotion: 'tab-prepared' });
}
function scroll(page, event) { page._tabScrollTop = Math.max(0, Number(event.scrollTop) || 0); }
module.exports = { request, show, hide, scroll, syncBar };
