'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { readLocalAddressCount, STORAGE_KEY } = require('../miniprogram/pages/account/local-address-count');
const { createLocalAddressClient, STORAGE_KEY: addressKey } = require('../miniprogram/features/addresses/local-addresses');
const settings = { stage: 'development', mode: 'shell', appId: 'offline-account' };
const clone = value => JSON.parse(JSON.stringify(value));
const draft = { receiverName: '测试顾客', phone: '13800000000', province: '安徽省', city: '合肥市', district: '庐江县', detail: '测试地址 1 号' };
function storage() {
  const entries = new Map();
  let writes = 0, reads = 0;
  return {
    entries, get writes() { return writes; }, get reads() { return reads; },
    getStorageSync(key) { reads++; return entries.has(key) ? clone(entries.get(key)) : ''; },
    setStorageSync(key, value) { writes++; entries.set(key, clone(value)); }
  };
}
function fixture() {
  const platform = storage();
  let sequence = 0;
  const addresses = createLocalAddressClient(settings, platform, () => 'address-' + ++sequence);
  return { platform, addresses };
}
test('account address count follows the real device book without writes or choosing a default', () => {
  assert.equal(STORAGE_KEY, addressKey);
  const { platform, addresses } = fixture();
  assert.equal(readLocalAddressCount(settings, platform), 0);
  let book = addresses.create(draft, 0);
  book = addresses.create({ ...draft, receiverName: '第二位顾客' }, book.revision);
  book = addresses.setDefault(book.addresses[0].addressId, 0, book.revision);
  const before = clone([...platform.entries]), writes = platform.writes;
  assert.equal(readLocalAddressCount(settings, platform), 2);
  assert.equal(platform.writes, writes);
  assert.deepEqual([...platform.entries], before);
  addresses.choose(book.addresses[0].addressId, 0, book.revision);
  book = addresses.list();
  book = addresses.remove(book.addresses[0].addressId, 0, book.revision);
  assert.equal(readLocalAddressCount(settings, platform), 1);
  assert.equal(book.defaultAddressId, null);
  book = addresses.remove(book.addresses[0].addressId, 0, book.revision);
  assert.equal(readLocalAddressCount(settings, platform), 0);
  assert.equal(readLocalAddressCount({ ...settings, appId: 'other-app' }, platform), 0);
});
test('account count distinguishes unknown/corrupt storage from an empty book and respects runtime gates', () => {
  const { platform, addresses } = fixture();
  addresses.create(draft, 0);
  const key = STORAGE_KEY + ':' + settings.appId;
  const valid = clone(platform.entries.get(key));
  for (const mutate of [
    b => { b.version = 2; }, b => { b.scope = 'CLOUD'; },
    b => { b.revision = -1; }, b => { b.addresses.push(clone(b.addresses[0])); },
    b => { b.defaultAddressId = 'missing'; }, b => { b.addresses[0].phone = 'invalid'; },
    b => { b.addresses[0].detail = ' unnormalized '; },
    b => { b.addresses[0].detail = String.fromCharCode(0xd800); },
    b => { b.addresses[0].regionCodes.city = 'unverified'; },
    b => { delete b.selection; }
  ]) {
    const broken = clone(valid); mutate(broken);
    platform.entries.set(key, broken);
    assert.equal(readLocalAddressCount(settings, platform), null);
  }
  assert.equal(readLocalAddressCount(settings, { getStorageSync() { throw new Error('read failed'); } }), null);
  const reads = platform.reads;
  for (const config of [{ ...settings, mode: 'cloud' }, { ...settings, stage: 'production' }, { ...settings, stage: 'test' }]) {
    assert.equal(readLocalAddressCount(config, platform), null);
  }
  assert.equal(platform.reads, reads);
});
function pageHarness(platform) {
  const accountDirectory = path.resolve(__dirname, '../miniprogram/pages/account');
  const navigations = [], notices = [], modals = [];
  let page, selected;
  vm.runInNewContext(fs.readFileSync(path.join(accountDirectory, 'account.js'), 'utf8'), {
    Page(value) { page = value; },
    wx: { getStorageSync: key => platform.getStorageSync(key), showToast: data => notices.push(data), showModal: data => modals.push(data) },
    require(name) {
      if (name === '../../config') return settings;
      if (name.includes('/constants/routes')) return { navigate: (...args) => navigations.push(args) };
      if (name.includes('/utils/tab-transition')) return { show: (_, index) => { selected = index; }, hide() {}, scroll() {} };
      if (name.includes('/utils/safe-area')) return { measure: () => ({ topInset: 24, navHeight: 44, capsuleWidth: 104 }) };
      return require(path.resolve(accountDirectory, name));
    }
  });
  page.data = clone(page.data);
  page.setData = patch => Object.assign(page.data, clone(patch));
  return { page, navigations, notices, modals, get selected() { return selected; } };
}
test('account refreshes count after returning, preserves entry routes and never fakes login', () => {
  const { platform, addresses } = fixture();
  const harness = pageHarness(platform);
  const { page, navigations, notices, modals } = harness;
  page.onLoad(); page.onShow();
  assert.equal(harness.selected, 3);
  assert.equal(page.data.addressCount, '0');
  let book = addresses.create(draft, 0);
  page.onHide(); page.onShow();
  assert.equal(page.data.addressCount, '1');
  const tap = target => ({ currentTarget: { dataset: { target } } });
  for (const name of ['orders', 'favorites', 'addresses']) page.menuAction(tap(name));
  page.birthday();
  assert.deepEqual(navigations.map(args => args[0]), ['orders', 'favorites', 'addresses', 'shop']);
  page.menuAction(tap('store'));
  assert.match(modals[0].content, /20km/);
  page.menuAction(tap('service'));
  assert.match(modals[1].content, /准备中/);
  const before = clone(page.data), writes = platform.writes;
  page.login(); page.settings();
  assert.deepEqual(page.data, before);
  assert.equal(platform.writes, writes);
  assert.equal(notices.length, 2);
  assert.equal(navigations.length, 4);
  addresses.remove(book.addresses[0].addressId, 0, book.revision);
  page.onShow();
  assert.equal(page.data.addressCount, '0');
  platform.getStorageSync = () => { throw new Error('read failed'); };
  page.onShow();
  assert.equal(page.data.addressCount, '—');
  page.bannerError();
  assert.equal(page.data.bannerFailed, true);
});
