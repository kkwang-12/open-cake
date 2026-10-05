function clear(page) {
  clearTimeout(page._sheetFrame); clearTimeout(page._sheetTimer);
  page._sheetToken = (page._sheetToken || 0) + 1;
  page._sheetDrag = null;
  page._sheetLayoutRequest = (page._sheetLayoutRequest || 0) + 1;
  return page._sheetToken;
}
function viewport() {
  try { const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync(); return info.windowHeight || 640; }
  catch (_) { return 640; }
}
function layout(page, ready) {
  const token = page._sheetToken;
  const request = page._sheetLayoutRequest = (page._sheetLayoutRequest || 0) + 1;
  if (typeof wx.createSelectorQuery !== 'function') { if (ready) ready(); return; }
  wx.createSelectorQuery().select('.sheet-header').boundingClientRect()
    .select('.sheet-content').boundingClientRect().select('.sheet-footer').boundingClientRect().exec(rects => {
      if (token !== page._sheetToken || request !== page._sheetLayoutRequest || !page.data.sheetOpen || ['closing', 'dragging'].includes(page.data.sheetPhase)) return;
      if (rects && rects.length === 3 && rects.every(rect => rect && Number.isFinite(rect.height))) {
        const fixed = rects[0].height + rects[2].height;
        const body = Math.max(1, Math.min(Math.ceil(rects[1].height), page.data.sheetMaxHeight - fixed));
        page._sheetHeight = fixed + body;
        page.setData({ sheetBodyHeight: body }, ready);
      } else if (ready) ready();
    });
}
function animateOpen(page, token) {
  page._sheetFrame = setTimeout(() => {
    if (token !== page._sheetToken || !page.data.sheetOpen) return;
    page.setData({ sheetPhase: 'opening', sheetOffset: '0px', sheetDuration: 240, sheetEasing: 'ease-out', sheetMaskOpacity: .48 });
    page._sheetTimer = setTimeout(() => {
      if (token === page._sheetToken) page.setData({ sheetPhase: 'open', sheetDuration: 0 });
    }, 240);
  }, 32);
}
function open(page) {
  if (page.data.sheetOpen && page.data.sheetPhase !== 'closing') return;
  const mounted = page.data.sheetOpen;
  const token = clear(page);
  if (!mounted) page._sheetSavedScroll = page._pageScrollTop || 0;
  const maximum = Math.floor(viewport() * .85);
  page._sheetHeight = page._sheetHeight || maximum;
  if (mounted) {
    page.setData({ sheetPhase: 'opening', sheetOffset: '0px', sheetDuration: 240, sheetEasing: 'ease-out', sheetMaskOpacity: .48, sheetMaxHeight: maximum }, () => layout(page));
    page._sheetTimer = setTimeout(() => { if (token === page._sheetToken) page.setData({ sheetPhase: 'open', sheetDuration: 0 }); }, 240);
    return;
  }
  page.setData({ sheetOpen: true, sheetPhase: 'preparing', sheetOffset: '100%', sheetDuration: 0,
    sheetMaskOpacity: 0, sheetMaxHeight: maximum, sheetBodyHeight: 1, sheetPageTop: -(page._sheetSavedScroll || 0) }, () => {
    layout(page, () => animateOpen(page, token));
  });
}
function restore(page) {
  if (typeof wx.pageScrollTo === 'function') wx.pageScrollTo({ scrollTop: page._sheetSavedScroll || 0, duration: 0 });
}
function close(page, force = false, options = {}) {
  if (!page.data.sheetOpen || page.data.sheetPhase === 'closing' || (page.data.adding && !force)) return;
  const token = clear(page);
  const duration = options.duration || 200;
  page.setData({ sheetPhase: 'closing', sheetOffset: '100%', sheetDuration: duration, sheetEasing: options.easing || 'ease-in', sheetMaskOpacity: 0 });
  page._sheetTimer = setTimeout(() => {
    if (token !== page._sheetToken) return;
    page.setData({ sheetOpen: false, sheetPhase: 'closed', sheetDuration: 0 }, () => {
      if (token === page._sheetToken && !page.data.sheetOpen) {
        restore(page);
        if (options.onClosed) options.onClosed();
      }
    });
  }, duration);
}
function dispose(page, restoreScroll = false) {
  const wasOpen = page.data.sheetOpen;
  const token = clear(page);
  page.setData({ sheetOpen: false, sheetPhase: 'closed', sheetOffset: '100%', sheetMaskOpacity: 0, sheetDuration: 0 }, () => {
    if (token === page._sheetToken && !page.data.sheetOpen && wasOpen && restoreScroll) restore(page);
  });
}
function point(event) { return event.touches && event.touches[0] || event.changedTouches && event.changedTouches[0]; }
function time(event) { return Number.isFinite(event.timeStamp) ? event.timeStamp : Date.now(); }
function dragStart(page, event) {
  const p = point(event);
  if (!p || page.data.adding || page.data.sheetPhase !== 'open' || !event.touches || event.touches.length !== 1) return;
  page._sheetDrag = { x: p.clientX, y: p.clientY, lastY: p.clientY, lastTime: time(event), velocity: 0, distance: 0 };
}
function dragMove(page, event) {
  const drag = page._sheetDrag, p = point(event);
  if (!drag || !p) return;
  if (event.touches && event.touches.length !== 1) { settle(page); return; }
  const distance = Math.max(0, p.clientY - drag.y);
  if (!drag.distance && (distance < 5 || Math.abs(p.clientX - drag.x) > distance)) return;
  const now = time(event), elapsed = now - drag.lastTime;
  if (elapsed > 0) drag.velocity = (p.clientY - drag.lastY) / elapsed;
  drag.lastY = p.clientY; drag.lastTime = now; drag.distance = distance;
  page.setData({ sheetPhase: 'dragging', sheetDuration: 0, sheetOffset: distance + 'px',
    sheetMaskOpacity: .48 * Math.max(0, 1 - distance / page._sheetHeight) });
}
function settle(page) {
  const token = clear(page);
  page.setData({ sheetPhase: 'settling', sheetDuration: 180, sheetEasing: 'ease-out', sheetOffset: '0px', sheetMaskOpacity: .48 });
  page._sheetTimer = setTimeout(() => { if (token === page._sheetToken) page.setData({ sheetPhase: 'open', sheetDuration: 0 }); }, 180);
}
function dragEnd(page, event, cancelled = false) {
  const drag = page._sheetDrag;
  if (!drag) return;
  page._sheetDrag = null;
  const fast = time(event) - drag.lastTime < 100 && drag.velocity > .6 && drag.distance > 32;
  if (!cancelled && (drag.distance > page._sheetHeight * .25 || fast)) close(page);
  else if (drag.distance) settle(page);
}
module.exports = { open, close, dispose, layout, dragStart, dragMove, dragEnd };
