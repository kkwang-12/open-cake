const config = require('../config');
function request(path, method = 'GET', data, role = 'customer') {
  return new Promise((resolve, reject) => {
    const token = wx.getStorageSync('jjl_' + role);
    wx.request({ url: config.apiBase + path, method, data, header: { 'content-type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, timeout: 10000,
      success(res) { if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data); else { const e = new Error(res.data.error || '服务暂时不可用'); e.status = res.statusCode; reject(e); } },
      fail() { reject(new Error('连接失败，请启动演示服务，并检查小程序服务地址及开发者工具域名设置')); }
    });
  });
}
async function init() {
  const info = await request('/config');
  let authenticated = false;
  if (wx.getStorageSync('jjl_customer')) { try { await request('/me'); authenticated = true; } catch (e) { if (e.status !== 401) throw e; } }
  if (!authenticated) { const session = await request('/session', 'POST', {}); wx.setStorageSync('jjl_customer', session.token); }
  return info;
}
async function ready() { const app = getApp(); if (!app.ready) app.ready = init(); try { const info = await app.ready; app.globalData.config = info; return info; } catch (error) { app.ready = null; throw error; } }
function fail(page, error) { page.setData({ error: error.message, busy: false }); wx.showToast({ title: error.message.slice(0, 20), icon: 'none', duration: 2500 }); }
async function run(page, task) { if (page.data.busy) return; page.setData({ busy: true, error: '' }); try { await task(); } catch (e) { fail(page, e); } finally { page.setData({ busy: false }); } }
module.exports = { request, init, ready, fail, run };
