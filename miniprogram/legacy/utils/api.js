const config = require('../config');
const runtime = require('../../config');
let initialized = null;
function assertDemo() {
  if (runtime.stage !== 'development' || runtime.mode !== 'shell' || runtime.enableLegacyDemo !== true) {
    throw new Error('旧预订演示未启用，请返回首页');
  }
}
function request(path, method = 'GET', data, role = 'customer') {
  assertDemo();
  return new Promise((resolve, reject) => {
    const token = wx.getStorageSync('jjl_' + role);
    wx.request({
      url: config.apiBase + path, method, data,
      header: { 'content-type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      timeout: 10000,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data);
        else {
          const error = new Error(res.data.error || '演示服务暂时不可用');
          error.status = res.statusCode;
          reject(error);
        }
      },
      fail() { reject(new Error('无法连接本机演示服务，请启动 server/index.js')); }
    });
  });
}
async function init() {
  const info = await request('/config');
  let authenticated = false;
  if (wx.getStorageSync('jjl_customer')) {
    try { await request('/me'); authenticated = true; }
    catch (error) { if (error.status !== 401) throw error; }
  }
  if (!authenticated) {
    const session = await request('/session', 'POST', {});
    wx.setStorageSync('jjl_customer', session.token);
  }
  return info;
}
async function ready() {
  assertDemo();
  if (!initialized) initialized = init();
  try { return await initialized; }
  catch (error) { initialized = null; throw error; }
}
function fail(page, error) {
  page.setData({ error: error.message, busy: false });
  wx.showToast({ title: error.message.slice(0, 20), icon: 'none', duration: 2500 });
}
async function run(page, task) {
  if (page.data.busy) return;
  page.setData({ busy: true, error: '' });
  try { await task(); }
  catch (error) { fail(page, error); }
  finally { page.setData({ busy: false }); }
}
module.exports = { request, init, ready, fail, run };
