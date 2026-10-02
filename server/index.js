'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { Shop } = require('./domain');
const { repository } = require('./repository');
const { createServer } = require('./app');

const root = path.join(__dirname, '..');
const envFile = path.join(root, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match && !Object.hasOwn(process.env, match[1])) process.env[match[1]] = match[2].trim();
  }
}
const host = process.env.HOST || '127.0.0.1'; const port = Number(process.env.PORT || 3100);
if (process.env.NODE_ENV === 'production' || process.env.PAYMENT_MODE === 'live') throw new Error('本版本是演示版。正式身份认证、微信支付、退款和消息服务接入验收前，禁止以正式模式启动。');
if (!['127.0.0.1', 'localhost', '::1'].includes(host) && (!process.env.DEMO_STAFF_PIN || process.env.DEMO_STAFF_PIN === '246810')) throw new Error('局域网演示必须设置自定义 DEMO_STAFF_PIN；禁止对外暴露默认口令。');
const storage = repository(path.resolve(root, process.env.DATA_FILE || 'data/store.json'));
const shop = new Shop(storage.state, { save: storage.save });
const server = createServer(shop, { staffPin: process.env.DEMO_STAFF_PIN });
server.listen(port, host, () => {
  console.log(`家家乐蛋糕店演示已启动：http://${host}:${port}`);
  console.log('演示模式：付款、退款和通知均为模拟；数据保存在本机 data/store.json。');
});
server.on('error', error => { console.error(`启动失败：${error.message}`); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.close(() => process.exit(0)); });
