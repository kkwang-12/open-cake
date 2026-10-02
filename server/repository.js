'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { initialState } = require('./domain');

function repository(file) {
  const absolute = path.resolve(file);
  const state = fs.existsSync(absolute) ? JSON.parse(fs.readFileSync(absolute, 'utf8')) : initialState();
  if (state.version !== 1 || !Array.isArray(state.orders) || !Array.isArray(state.payments)) throw new Error('不支持的数据文件，启动已停止；请保留原文件');
  return { state, save(value) {
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    const temporary = `${absolute}.tmp`;
    const descriptor = fs.openSync(temporary, 'w', 0o600);
    try { fs.writeFileSync(descriptor, JSON.stringify(value, null, 2), 'utf8'); fs.fsyncSync(descriptor); }
    finally { fs.closeSync(descriptor); }
    fs.renameSync(temporary, absolute);
  } };
}
module.exports = { repository };
