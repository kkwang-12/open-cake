const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { runtime } = require('./fixtures/bottom-sheet-runtime');
function setup(platform = {}) {
  const timers = new Map();
  let now = 0, id = 0;
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../miniprogram/features/product/success-motion.js'), 'utf8'), {
    module, wx: platform, setTimeout(fn, delay) { timers.set(++id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); }
  });
  const page = { _visible: true, _epoch: 1, data: { success: null, adding: true },
    setData(patch, callback) { Object.assign(this.data, patch); if (callback) callback(); } };
  function advance(ms) {
    now += ms;
    for (const [id, timer] of timers) if (timer.at <= now) { timers.delete(id); timer.fn(); }
  }
  return { motion: module.exports, page, advance, timers };
}
test('Press finishes before success; disposal resolves pending feedback and removes all timers', async () => {
  const { motion, page, advance, timers } = setup();
  let done = false;
  const press = motion.press(page).then(value => { done = value; });
  advance(179); await Promise.resolve();
  assert.equal(page.data.addPress, true); assert.equal(done, false);
  advance(1); await press; assert.equal(done, true); assert.equal(page.data.addPress, false);
  const cancelled = motion.press(page); motion.dispose(page);
  assert.equal(await cancelled, false); assert.equal(timers.size, 0);
});
test('Success close mounts card only after 280ms; hiding cancels the close callback', () => {
  const { sheet, advance } = runtime();
  const { motion, page } = setup();
  page.data.sheetOpen = true; page.data.sheetPhase = 'open'; page._successTransition = true;
  const close = () => sheet.close(page, true, { duration: 280, onClosed: () => motion.show(page, { name: 'Cake' }) });
  close(); advance(279); assert.equal(page.data.success, null);
  advance(1); assert.equal(page.data.success.name, 'Cake'); assert.equal(page.data.adding, false);
  page.data.success = null; page.data.sheetOpen = true; page.data.sheetPhase = 'open';
  close(); sheet.dispose(page); advance(300); assert.equal(page.data.success, null);
  motion.dispose(page);
});
test('Fine burst has 56 particles, small varied sizes and a complete radial launch near screen edges', () => {
  const { motion, page, advance, timers } = setup();
  const particles = motion.particles(() => .5);
  assert.equal(particles.length, 56);
  assert.equal(particles.filter(p => p.shape === 'dot').length, 48);
  assert.equal(particles.filter(p => p.shape === 'sprinkle').length, 8);
  assert.equal(particles.filter(p => p.shape === 'star').length, 0);
  assert.equal(new Set(particles.map(p => /--particle-color:([^;]+)/.exec(p.style)[1])).size, 4);
  for (const particle of particles) {
    const x = Number(/--burst-x:([-\d.]+)px/.exec(particle.style)[1]);
    const y = Number(/--burst-y:([-\d.]+)px/.exec(particle.style)[1]);
    assert.ok(Math.abs(x) <= 88 && Math.abs(y) <= 102);
    assert.equal(particle.duration, 485);
    assert.match(particle.style, /--particle-spin:/);
  }
  for (const random of [() => 0, () => .999999, Math.random]) for (const p of motion.particles(random)) {
    assert.ok(p.radius >= 0 && p.radius <= 88);
    assert.ok(p.duration >= 450 && p.duration <= 520);
    const size = Number(/width:([\d.]+)px/.exec(p.style)[1]);
    assert.ok(size >= 2 && size <= 6);
  }
  const bounds = { left: 55, right: 320, top: 598, bottom: 42 };
  const edgeParticles = motion.particles(() => .5, bounds);
  const quadrants = new Set();
  for (const p of edgeParticles) {
    const x = Number(/--burst-x:([-\d.]+)px/.exec(p.style)[1]);
    const y = Number(/--burst-y:([-\d.]+)px/.exec(p.style)[1]);
    quadrants.add((x > 0 ? 'R' : 'L') + (y > 0 ? 'D' : 'U'));
    assert.ok(x >= -bounds.left + 3 && x <= bounds.right - 3);
    assert.ok(y >= -bounds.top + 3 && y <= bounds.bottom - 3);
  }
  assert.equal(quadrants.size, 4);
  motion.show(page, { name: 'Cake' });
  advance(319); assert.equal(page.data.successParticles.length, 0);
  advance(1); assert.equal(page.data.successParticles.length, 56);
  assert.equal(page.data.successBurst, true);
  advance(559); assert.equal(page.data.successParticles.length, 56);
  advance(1); assert.equal(page.data.successParticles.length, 0);
  assert.equal(page.data.successBurst, true);
  motion.show(page, { name: 'Cake' }); motion.dispose(page);
  assert.equal(timers.size, 0); assert.equal(page.data.successParticles.length, 0);
});
test('Burst uses measured thumbnail center and ignores selector callbacks after disposal', () => {
  const callbacks = [];
  const vibrations = [];
  const platform = {
    vibrateShort: options => vibrations.push(options.type),
    getWindowInfo: () => ({ windowWidth: 375, windowHeight: 800 }),
    createSelectorQuery: () => {
      const query = { select() { return query; }, boundingClientRect(callback) { callbacks.push(callback); return query; }, exec() {} };
      return query;
    }
  };
  const { motion, page, advance, timers } = setup(platform);
  motion.show(page, { name: 'Cake' }); advance(320);
  assert.equal(vibrations.length, 0);
  callbacks[0]({ left: 30, top: 720, width: 50, height: 54 });
  assert.equal(page.data.successBurstStyle, 'left:55px;top:747px;');
  assert.equal(page.data.successParticles.length, 56);
  assert.deepEqual(vibrations, ['medium']);
  motion.dispose(page);
  motion.show(page, { name: 'Cake' }); advance(320); motion.dispose(page);
  callbacks[1]({ left: 30, top: 720, width: 50, height: 54 });
  assert.equal(page.data.successParticles.length, 0);
  assert.equal(page.data.successBurst, false); assert.equal(timers.size, 0);
  assert.deepEqual(vibrations, ['medium']);
});
