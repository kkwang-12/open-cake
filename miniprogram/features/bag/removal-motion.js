function dispose(page, reset = true) {
  clearTimeout(page._removeTimer);
  if (page._resolveRemoval) page._resolveRemoval(false);
  page._resolveRemoval = null;
  if (reset) page.setData({ removingId: '', removingIndex: -1, removingHeight: 0, removalCollapsing: false });
}
function play(page, id, ticket) {
  if (typeof page.createSelectorQuery !== 'function') return Promise.resolve(true);
  return new Promise(resolve => {
    page._resolveRemoval = resolve;
    const current = () => page._visible && ticket === page._epoch && page._resolveRemoval === resolve;
    const done = value => { if (page._resolveRemoval === resolve) page._resolveRemoval = null; resolve(value); };
    page.createSelectorQuery().select('#' + page.data.lineNodeIds[id]).boundingClientRect(rect => {
      if (!current()) { done(false); return; }
      if (!rect || !Number.isFinite(rect.height) || rect.height <= 0) { done(true); return; }
      page.setData({ removingId: id, removingIndex: page.data.lines.findIndex(line => line.lineId === id), removingHeight: rect.height, removalCollapsing: false }, () => {
        if (!current()) { done(false); return; }
        page._removeTimer = setTimeout(() => {
          if (!current()) { done(false); return; }
          page.setData({ removalCollapsing: true }, () => {
            if (!current()) { done(false); return; }
            page._removeTimer = setTimeout(() => done(current()), 200);
          });
        }, 200);
      });
    }).exec();
  });
}
module.exports = { play, dispose };
