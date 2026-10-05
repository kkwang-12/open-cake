// Shared with product.wxss: card lands at 320ms, then pop and candy burst start.
const PRESS_MS = 180;
const CARD_LAND_MS = 320;
const BURST_END_MS = 560; // Maximum 520ms lifetime + 20ms stagger + cleanup margin.
function dispose(page) {
  clearTimeout(page._addPressTimer);
  clearTimeout(page._successParticleTimer);
  clearTimeout(page._successBurstTimer);
  page._successMotionToken = (page._successMotionToken || 0) + 1;
  if (page._resolveAddPress) page._resolveAddPress(false);
  page._resolveAddPress = null;
  page._successTransition = false;
  page.setData({ addPress: false, successParticles: [], successBurst: false });
}
function press(page) {
  page.setData({ addPress: true });
  return new Promise(resolve => {
    page._resolveAddPress = resolve;
    page._addPressTimer = setTimeout(() => {
      page._resolveAddPress = null;
      page.setData({ addPress: false });
      resolve(true);
    }, PRESS_MS);
  });
}
function particles(random = Math.random, bounds = { left: 92, right: 92, top: 92, bottom: 92 }) {
  const colors = ['#FFF4DE', '#FFF4DE', '#FFF4DE', '#FFF4DE', '#E8C477', '#E8C477', '#E8C477', '#E77783', '#E77783', '#8DCDB7'];
  return Array.from({ length: 56 }, (_, id) => {
    const angle = (id + random()) / 56 * Math.PI * 2;
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const gravity = 8 + random() * 6;
    const size = id % 9 === 0 ? 4 + random() * 2 : 2 + random() * 2;
    const padding = size / 2 + 3;
    const radius = id % 4 === 0 ? 64 + random() * 24 : 28 + random() * 30;
    // Shorten the whole ray near viewport edges, preserving a circular launch.
    const horizontal = Math.max(0, (dx < 0 ? bounds.left : bounds.right) - padding) / Math.max(Math.abs(dx), .001);
    const vertical = Math.max(0, (dy < 0 ? bounds.top : bounds.bottom - gravity) - padding) / Math.max(Math.abs(dy), .001);
    const travel = Math.min(radius, horizontal, vertical);
    const x = dx * travel, y = dy * travel;
    const seed = Math.min(2 + random() * 4, travel * .15);
    const duration = Math.round(450 + random() * 70);
    const delay = Math.round(random() * 20);
    const rotation = Math.round(random() * 180 - 90);
    const spin = rotation + (id % 2 ? 1 : -1) * (35 + Math.round(random() * 75));
    const shape = id % 7 === 0 ? 'sprinkle' : 'dot';
    const height = shape === 'sprinkle' ? Math.max(1.2, size * .3) : size;
    const color = colors[id % colors.length];
    const px = value => value.toFixed(2) + 'px';
    return { id, shape, radius: travel, duration, style: `--burst-x-start:${px(dx * seed)};--burst-y-start:${px(dy * seed)};--burst-x-fast:${px(x * .76)};--burst-x-slow:${px(x * .98)};--burst-x:${px(x)};--burst-y-fast:${px(y * .76 + gravity * .04)};--burst-y-slow:${px(y * .98 + gravity * .36)};--burst-y:${px(y + gravity)};--burst-duration:${duration}ms;--burst-delay:${delay}ms;--particle-color:${color};--particle-rotation:${rotation}deg;--particle-spin:${spin}deg;width:${px(size)};height:${px(height)};` };
  });
}
function show(page, success) {
  const ticket = page._epoch;
  const token = page._successMotionToken = (page._successMotionToken || 0) + 1;
  const current = () => page._visible && ticket === page._epoch && token === page._successMotionToken;
  page._successTransition = false;
  page.setData({ success, successParticles: [], successBurst: false, adding: false }, () => {
    if (!current()) return;
    page._successBurstTimer = setTimeout(() => {
      if (!current()) return;
      let info = {};
      try { info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync(); } catch (_) {}
      const width = info.windowWidth || 375, height = info.windowHeight || 640;
      const safeBottom = info.safeArea ? Math.max(0, (info.screenHeight || height) - info.safeArea.bottom) : 0;
      const start = rect => {
        if (!current()) return;
        const measured = rect && ['left', 'top', 'width', 'height'].every(key => Number.isFinite(rect[key]));
        const cx = measured ? rect.left + rect.width / 2 : 63 - width * .02;
        const cy = measured ? rect.top + rect.height / 2 : height - safeBottom - 41;
        const bounds = { left: cx, right: width - cx, top: cy, bottom: height - cy };
        page.setData({ successBurst: true, successBurstStyle: `left:${cx}px;top:${cy}px;`, successParticles: particles(Math.random, bounds) }, () => {
          if (!current()) return;
          try {
            if (typeof wx.vibrateShort === 'function') wx.vibrateShort({ type: 'medium', fail() {} });
          } catch (_) {}
          page._successParticleTimer = setTimeout(() => {
            // Keep the completed pop class until the card is removed; removing
            // it here would replay the thumbnail's entrance animation.
            if (current()) page.setData({ successParticles: [] });
          }, BURST_END_MS);
        });
      };
      if (typeof wx !== 'undefined' && typeof wx.createSelectorQuery === 'function') {
        wx.createSelectorQuery().select('.success-thumb-stage').boundingClientRect(rect => start(rect)).exec();
      } else start(null);
    }, CARD_LAND_MS);
  });
}
module.exports = { press, show, dispose, particles };
