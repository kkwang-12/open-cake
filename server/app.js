'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, timingSafeEqual, createHash } = require('node:crypto');
const { AppError } = require('./domain');

function createServer(shop, options = {}) {
  const attempts = new Map();
  if (!shop.state.sessions) shop.state.sessions = [];
  const tokenHash = token => createHash('sha256').update(token).digest('hex');
  const pin = options.staffPin || '246810';
  const webRoot = path.join(__dirname, '..', 'web');
  const send = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
  function login(role) {
    const token = randomBytes(32).toString('hex');
    const actor = { id: role === 'staff' ? 'demo-staff' : randomBytes(16).toString('hex'), role };
    shop.transact(() => {
      shop.state.sessions = shop.state.sessions.filter(s => s.expires > Date.now());
      shop.state.sessions.push({ tokenHash: tokenHash(token), actor, expires: Date.now() + 12 * 3600000 });
      return true;
    });
    return { token, role, mode: 'demo', expiresIn: 43200 };
  }
  function authenticate(req) {
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    const session = shop.state.sessions.find(s => s.tokenHash === tokenHash(token));
    if (!session || session.expires <= Date.now()) throw new AppError('会话已失效，请重新登录', 401);
    return session.actor;
  }
  async function body(req) {
    let size = 0; const chunks = [];
    for await (const chunk of req) { size += chunk.length; if (size > 65536) throw new AppError('请求内容过大', 413); chunks.push(chunk); }
    try { const result = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error(); return result; }
    catch { throw new AppError('请求须为有效JSON对象'); }
  }
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    // 原生小程序不使用浏览器 CORS。网页演示仅允许同源，避免外站调用演示登录。
    const origin = req.headers.origin;
    if (origin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}`) return send(res, 403, { error: '不允许跨站请求' });
    try {
      const url = new URL(req.url, 'http://localhost'); const pathname = url.pathname; const method = req.method;
      if (!pathname.startsWith('/api/')) {
        if (method !== 'GET') throw new AppError('方法不支持', 405);
        const files = { '/': ['index.html', 'text/html; charset=utf-8'], '/app.js': ['app.js', 'text/javascript; charset=utf-8'], '/style.css': ['style.css', 'text/css; charset=utf-8'] };
        const file = files[pathname]; if (!file) throw new AppError('页面不存在', 404);
        res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'");
        res.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-cache' }); return res.end(fs.readFileSync(path.join(webRoot, file[0])));
      }
      if (pathname === '/api/config' && method === 'GET') return send(res, 200, { mode: 'demo', shop: shop.settings(), message: '演示环境：所有付款、退款及消息提醒均为模拟，不产生真实交易', serverTime: shop.now().toISOString() });
      if (pathname === '/api/session' && method === 'POST') return send(res, 201, login('customer'));
      if (pathname === '/api/staff/login' && method === 'POST') {
        const ip = req.socket.remoteAddress; const current = attempts.get(ip) || { count: 0, until: Date.now() + 15 * 60000 };
        if (current.until <= Date.now()) { current.count = 0; current.until = Date.now() + 15 * 60000; }
        if (current.count >= 5) throw new AppError('尝试过多，请15分钟后重试', 429);
        const data = await body(req); const input = Buffer.from(String(data.pin || '')); const expected = Buffer.from(pin);
        if (input.length !== expected.length || !timingSafeEqual(input, expected)) { current.count++; attempts.set(ip, current); throw new AppError('店员演示口令错误', 403); }
        attempts.delete(ip); return send(res, 200, login('staff'));
      }
      const actor = authenticate(req);
      if (pathname === '/api/me' && method === 'GET') return send(res, 200, { role: actor.role, mode: 'demo' });
      if (pathname === '/api/logout' && method === 'POST') { shop.transact(() => { shop.state.sessions = shop.state.sessions.filter(s => s.tokenHash !== tokenHash(req.headers.authorization.slice(7))); return true; }); return send(res, 200, { ok: true }); }
      if (pathname === '/api/products' && method === 'GET') return send(res, 200, shop.products(actor));
      if (pathname === '/api/orders' && method === 'GET') return send(res, 200, shop.list(actor));
      if (pathname === '/api/orders' && method === 'POST') return send(res, 201, shop.createOrder(actor, await body(req)));
      if (pathname === '/api/settings' && method === 'PUT') return send(res, 200, shop.updateSettings(actor, await body(req)));
      if (pathname === '/api/notifications' && method === 'GET') return send(res, 200, shop.notifications(actor));
      if (pathname === '/api/notifications/read' && method === 'POST') return send(res, 200, shop.readNotifications(actor));
      const product = pathname.match(/^\/api\/products\/([\w-]+)$/);
      if (product && method === 'PUT') return send(res, 200, shop.updateProduct(actor, product[1], await body(req)));
      const payment = pathname.match(/^\/api\/payments\/([\w-]+)\/simulate$/);
      if (payment && method === 'POST') {
        const data = await body(req); if (typeof data.success !== 'boolean') throw new AppError('请选择模拟成功或失败');
        return send(res, 200, shop.simulatePayment(actor, payment[1], data.success));
      }
      const refund = pathname.match(/^\/api\/refunds\/([\w-]+)\/simulate$/);
      if (refund && method === 'POST') {
        const data = await body(req); if (typeof data.success !== 'boolean') throw new AppError('请选择模拟退款结果');
        return send(res, 200, shop.refundResult(actor, refund[1], data.success));
      }
      const match = pathname.match(/^\/api\/orders\/([\w-]+)(?:\/([\w-]+))?$/);
      if (match) {
        const [, id, action] = match;
        if (!action && method === 'GET') return send(res, 200, shop.get(actor, id));
        if (method === 'POST') {
          const data = await body(req);
          if (action === 'confirm') { if (typeof data.accepted !== 'boolean') throw new AppError('请选择接单或拒单'); return send(res, 200, shop.confirm(actor, id, data.accepted, data.reason)); }
          if (action === 'progress') return send(res, 200, shop.advance(actor, id, data.status));
          if (action === 'payments') return send(res, 201, shop.createPayment(actor, id, data.stage));
          if (action === 'offline-balance') return send(res, 200, shop.offlineBalance(actor, id, data.method));
          if (action === 'requests') return send(res, 201, shop.requestChange(actor, id, data));
          if (action === 'review') return send(res, 200, shop.reviewChange(actor, id, data));
        }
      }
      throw new AppError('接口不存在', 404);
    } catch (error) {
      if (!(error instanceof AppError)) console.error(error);
      if (!res.headersSent) send(res, error.status || 500, { error: error instanceof AppError ? error.message : '服务暂时不可用，请稍后重试' });
      else res.end();
    }
  });
}
module.exports = { createServer };
