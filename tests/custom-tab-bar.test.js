'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const mini = path.join(__dirname, '../miniprogram');
function setup(route = 'pages/home/home') {
  let definition;
  const calls = [];
  const scrolls = [];
  const ticks = [];
  let now = 0, id = 0;
  const timers = new Map();
  const pages = [{ route, data: {}, setData(patch, callback) { Object.assign(this.data, patch); if (callback) callback(); } }];
  const context = {
    Component: value => { definition = value; },
    getCurrentPages: () => pages,
    setTimeout: (fn, delay) => { timers.set(++id, { fn, at: now + delay }); return id; },
    clearTimeout: value => timers.delete(value),
    wx: { switchTab: options => calls.push(options), pageScrollTo: options => scrolls.push(options), nextTick: callback => ticks.push(callback) },
    module: { exports: {} }
  };
  vm.runInNewContext(fs.readFileSync(path.join(mini, 'utils/tab-transition.js'), 'utf8'), context);
  const transition = context.module.exports;
  context.require = () => transition;
  vm.runInNewContext(fs.readFileSync(path.join(mini, 'custom-tab-bar/index.js'), 'utf8'), context);
  const bar = { data: JSON.parse(JSON.stringify(definition.data)), ...definition.methods };
  bar.setData = patch => Object.assign(bar.data, patch);
  pages[0].getTabBar = () => bar;
  definition.lifetimes.attached.call(bar);
  function advance(ms) {
    const end = now + ms;
    while (true) {
      const next = [...timers].filter(([, value]) => value.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at; timers.delete(next[0]); next[1].fn();
    }
    now = end;
  }
  return { bar, calls, pages, definition, transition, advance, scrolls, flushTicks: () => { while (ticks.length) ticks.shift()(); } };
}
const tap = index => ({ currentTarget: { dataset: { index } } });

test('Custom navigation has four registered routes and eight packaged SVG states', () => {
  const app = JSON.parse(fs.readFileSync(path.join(mini, 'app.json'), 'utf8'));
  const { bar } = setup();
  assert.equal(app.tabBar.custom, true);
  assert.deepEqual(bar.data.items.map(item => item.path), app.tabBar.list.map(item => item.pagePath));
  for (const item of bar.data.items) {
    for (const state of ['outline', 'filled']) {
      const svg = fs.readFileSync(path.join(mini, item[state]), 'utf8');
      assert.match(svg, /<svg[^>]+viewBox="0 0 28 28"/);
    }
    assert.notEqual(item.outline, item.filled);
  }
});

test('Navigation highlights the visible route on initial attach and returning from detail', () => {
  const { bar, pages, definition } = setup('pages/account/account');
  definition.lifetimes.attached.call(bar);
  assert.equal(bar.data.selected, 3);
  for (let index = 0; index < 4; index++) {
    pages[0].route = bar.data.items[index].path;
    definition.pageLifetimes.show.call(bar);
    assert.equal(bar.data.selected, index);
  }
  pages.push({ route: 'features/product/product' });
  bar.syncSelection();
  assert.equal(bar.data.selected, 3);
  pages.pop();
  pages[0].route = 'pages/shop/shop';
  definition.pageLifetimes.show.call(bar);
  assert.equal(bar.data.selected, 1);
});

test('Navigation dispatches immediately, rejects invalid taps and recovers selection after failure', () => {
  const { bar, calls, pages, advance } = setup();
  bar.switchTab(tap(0));bar.switchTab(tap('bad'));bar.switchTab(tap(9));
  assert.equal(calls.length, 0);
  bar.switchTab(tap(2));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/pages/orders/orders');
  assert.equal(bar.data.active, 2);
  assert.notEqual(pages[0].data.tabMotion, 'tab-leaving');
  calls[0].fail();calls[0].complete();
  assert.equal(bar.data.active, 0);
  advance(1000);assert.equal(calls.length, 1);
});

test('Tab show reconciles the visible highlight after the native page stack updates', () => {
  const { bar, pages, definition, flushTicks } = setup();
  definition.pageLifetimes.show.call(bar);
  pages[0].route = 'pages/account/account';flushTicks();
  assert.equal(bar.data.selected, 3);assert.equal(bar.data.active, 3);
});

test('One content fade preserves cached state and repeated current-tab taps do not replay it', () => {
  const { bar, calls, pages, transition, advance, scrolls } = setup();
  const page = pages[0];
  const products = [{ id: 'cake-1' }];
  page.setData({ products, category: 'mini', heroCurrent: 2 });
  transition.scroll(page, { scrollTop: 380 });
  bar.switchTab(tap(1));
  page.route = 'pages/shop/shop';transition.show(page, 1);calls[0].complete();
  assert.equal(page.data.tabMotion, 'tab-entering');
  advance(80);bar.switchTab(tap(1));
  assert.equal(calls.length, 1);
  advance(80);assert.equal(page.data.tabMotion, '');
  bar.switchTab(tap(1));assert.equal(page.data.tabMotion, '');
  assert.equal(scrolls.length, 0);assert.equal(page._tabScrollTop, 380);
  assert.equal(page.data.products, products);assert.equal(page.data.category, 'mini');
  assert.equal(page.data.heroCurrent, 2);
});

test('Rapid taps retain only the latest target and never wait for the content animation', () => {
  const { bar, calls, pages, transition, advance } = setup();
  bar.switchTab(tap(1));
  bar.switchTab(tap(2));bar.switchTab(tap(3));
  assert.equal(calls.length, 1);assert.equal(bar.data.active, 3);
  pages[0].route = 'pages/shop/shop';transition.show(pages[0], 1);
  bar.syncSelection();assert.equal(bar.data.active, 3);
  calls[0].complete();
  assert.equal(calls.length, 2);assert.equal(calls[1].url, '/pages/account/account');
  assert.equal(pages[0].data.tabMotion, 'tab-entering');
  transition.hide(pages[0]);pages[0].route = 'pages/account/account';
  transition.show(pages[0], 3);calls[1].complete();advance(160);
  assert.equal(pages[0].data.tabMotion, '');assert.equal(bar.data.active, 3);
  assert.equal(calls.length, 2);
});

test('A tap back to the departing tab wins while a native operation is in flight', () => {
  const { bar, calls, pages, transition } = setup();
  bar.switchTab(tap(1));bar.switchTab(tap(2));bar.switchTab(tap(0));
  pages[0].route = 'pages/shop/shop';transition.show(pages[0], 1);calls[0].complete();
  assert.equal(calls.length, 2);assert.equal(calls[1].url, '/pages/home/home');
});

test('Latest target survives an earlier failure and duplicate destination taps do not dispatch again', () => {
  const { bar, calls, pages, transition } = setup();
  bar.switchTab(tap(1));bar.switchTab(tap(3));
  calls[0].fail();assert.equal(bar.data.active, 3);calls[0].complete();
  assert.equal(calls.length, 2);assert.equal(calls[1].url, '/pages/account/account');
  bar.switchTab(tap(3));
  pages[0].route = 'pages/account/account';transition.show(pages[0], 3);calls[1].complete();
  assert.equal(calls.length, 2);assert.equal(bar.data.active, 3);
});

test('Hiding cancels the fade and native detail return does not replay it or reset scroll', () => {
  const { bar, calls, pages, transition, advance, scrolls } = setup();
  bar.switchTab(tap(1));pages[0].route = 'pages/shop/shop';
  transition.show(pages[0], 1);calls[0].complete();
  transition.scroll(pages[0], { scrollTop: 380 });
  transition.hide(pages[0]);pages.push({ route: 'features/product/product' });
  advance(500);assert.equal(pages[0].data.tabMotion, '');
  pages.pop();transition.show(pages[0], 1);advance(500);
  assert.equal(pages[0].data.tabMotion, '');
  assert.equal(pages[0]._tabScrollTop, 380);assert.equal(scrolls.length, 0);
});
