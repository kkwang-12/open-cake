'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const file = path.join(__dirname, '../miniprogram/pages/home/home.js');
const localRequire = createRequire(file);

function home(platform) {
  let page, now = 1000;
  const app = { globalData: {} }, navigations = [];
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    Page(value) { page = value; }, getApp: () => app, Date: { now: () => now }, wx: platform,
    require(name) {
      if (name.includes('/constants/routes')) return { navigate: (...args) => navigations.push(args) };
      if (name.includes('/utils/tab-transition')) return { hide() {}, show() {}, scroll() {} };
      return localRequire(name);
    }
  });
  page.data = JSON.parse(JSON.stringify(page.data));
  page.setData = patch => Object.assign(page.data, JSON.parse(JSON.stringify(patch)));
  return { page, app, navigations, advance(ms = 400) { now += ms; } };
}
const point = (x, y) => ({ clientX: x, clientY: y });
const touch = (x, y) => ({ touches: [point(x, y)] });
const end = (x, y) => ({ changedTouches: [point(x, y)] });
const tap = index => ({ currentTarget: { dataset: { index } } });

test('Hero container shrinks the original available height by 10% and proportional images cover it across viewports',()=>{
  for(const [width,height,safeBottom] of [[320,568,0],[375,812,34],[430,932,34],[320,1000,0]]){
    const {page}=home({getWindowInfo:()=>({windowWidth:width,windowHeight:height,safeArea:{bottom:height-safeBottom}})});
    page.updateHeroLayout(242);
    const original=Math.max(276,height-65-safeBottom-8-242);
    assert.equal(page.data.heroHeight,Math.round(original*.9*10)/10);
    assert.ok(page.data.heroImageWidth>=width);
    assert.ok(page.data.heroImageWidth*1402/1122>=page.data.heroHeight);
    assert.ok(page.data.heroHeight>=248.4);
    const stable=page.data.heroHeight;page.heroChange({detail:{current:1}});
    assert.equal(page.data.heroHeight,stable);
  }
});

test('Hero slide image failures are isolated, loaded neighbours stay ready and recommendations remain intact', () => {
  const { page } = home();
  page.data.products = [{ id: 'keep-product' }];
  for (const slide of page.data.heroSlides) {
    assert.ok(fs.existsSync(path.join(__dirname, '../miniprogram', slide.image)));
    assert.equal(slide.titleLines.length, 2);
  }
  page.heroImageLoad(tap(0));
  page.heroImageError(tap(1));
  assert.equal(page.data.heroSlides[0].imageReady, true);
  assert.equal(page.data.heroSlides[0].imageFailed, false);
  assert.equal(page.data.heroSlides[1].imageReady, false);
  assert.equal(page.data.heroSlides[1].imageFailed, true);
  assert.equal(page.data.heroSlides[2].imageFailed, false);
  page.heroChange({ detail: { current: 1 } });
  assert.equal(page.data.heroCurrent, 1);
  assert.deepEqual(page.data.products, [{ id: 'keep-product' }]);
  page.heroImageError(tap(99));
  assert.equal(page.data.heroSlides.length, 3);
});

test('Hero ignores invalid indices and only the settled visible slide can navigate to its configured target', () => {
  const { page, app, navigations, advance } = home();
  page.heroChange({ detail: { current: -1 } });
  page.heroChange({ detail: { current: 3 } });
  assert.equal(page.data.heroCurrent, 0);
  page.data.heroSlides[1].target = { route: 'shop', category: 'mini', params: {} };
  page.heroChange({ detail: { current: 1 } });
  page.heroAction(tap(1));
  assert.equal(navigations.length, 0);
  advance();
  page.heroAction(tap(0));
  assert.equal(navigations.length, 0);
  page.heroAction(tap(1));
  assert.deepEqual(navigations, [['shop', {}]]);
  assert.equal(app.globalData.pendingShopCategory, 'mini');
});

test('Horizontal drags, vertical scroll gestures and cancelled touches suppress accidental button taps', () => {
  for (const [x, y] of [[90, 100], [100, 130]]) {
    const { page, navigations, advance } = home();
    page.heroTouchStart(touch(100, 100));
    page.heroTouchMove(touch(x, y));
    page.heroAction(tap(0));
    assert.equal(navigations.length, 0);
    page.heroTouchEnd(end(x, y));
    page.heroAction(tap(0));
    assert.equal(navigations.length, 0);
    assert.equal(page.data.heroCurrent, 0);
    advance();
    page.heroAction(tap(0));
    assert.equal(navigations.length, 1);
  }
  const { page, navigations, advance } = home();
  page.heroTouchStart(touch(100, 100));
  page.heroTouchCancel();
  page.heroAction(tap(0));
  assert.equal(navigations.length, 0);
  advance();
  page.heroTouchStart(touch(100, 100));
  page.heroTouchEnd(end(100, 100));
  page.heroAction(tap(0));
  assert.equal(navigations.length, 1);
});

test('Release displacement without a move event is still guarded and hiding clears an unfinished gesture', () => {
  const { page, navigations } = home();
  page.heroTouchStart(touch(100, 100));
  page.heroTouchEnd(end(180, 100));
  page.heroAction(tap(0));
  assert.equal(navigations.length, 0);
  page.heroTouchStart(touch(100, 100));
  page.onHide();
  assert.equal(page._heroTouch, null);
});
