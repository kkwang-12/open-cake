const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
function runtime(platform = {}) {
  let now = 0, id = 0;
  const timers = new Map(), exports = { exports: {} };
  const clock = {
    setTimeout(fn, delay) { timers.set(++id, { fn, at: now + delay }); return id; },
    clearTimeout(value) { timers.delete(value); }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../miniprogram/utils/bottom-sheet.js'), 'utf8'), { module: exports, wx: platform, ...clock });
  function advance(ms) {
    const end = now + ms;
    while (true) {
      const next = [...timers].filter(([, value]) => value.at <= end).sort((a,b) => a[1].at-b[1].at)[0];
      if (!next) break;
      now=next[1].at;timers.delete(next[0]);next[1].fn();
    }
    now=end;
  }
  return { sheet: exports.exports, advance };
}
module.exports = { runtime };
