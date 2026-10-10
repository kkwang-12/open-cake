'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..', 'miniprogram');
const localPath = path.join(root, 'config.local.js');
const project = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'project.config.json'), 'utf8'));
if (typeof project.appid !== 'string' || !/^wx[0-9a-f]{16}$/.test(project.appid)) throw new Error('项目 AppID 格式无效');
const defaultConfig = {
  mode: 'shell', stage: 'development', appId: project.appid,
  cloudEnvironments: { development: '', test: '', production: '' }, enableLegacyDemo: false,
  catalog: { enabled:false, storeId:'', allowedCloudPrefixes:[] }
};
const local = fs.existsSync(localPath) ? require(localPath) : {};
const allowed = Object.keys(defaultConfig);
if (Object.keys(local).some(key => !allowed.includes(key))) throw new Error('本地配置含不支持字段；凭证不得写入小程序配置');
if (local.appId !== undefined && local.appId !== project.appid) throw new Error('本地 AppID 与 project.config.json 不一致');
const config = { ...defaultConfig, ...local, cloudEnvironments: { ...defaultConfig.cloudEnvironments, ...(local.cloudEnvironments || {}) } };
if (!config.catalog || typeof config.catalog!=='object' || Array.isArray(config.catalog) ||
    Object.keys(config.catalog).some(key=>!['enabled','storeId','allowedCloudPrefixes'].includes(key)) || typeof config.catalog.enabled!=='boolean' ||
    typeof config.catalog.storeId!=='string' || !Array.isArray(config.catalog.allowedCloudPrefixes) ||
    !config.catalog.allowedCloudPrefixes.every(prefix=>typeof prefix==='string' && /^cloud:\/\/[A-Za-z0-9._-]+\/(?:[A-Za-z0-9_-]+\/)*$/.test(prefix)) ||
    (config.catalog.enabled && !/^[A-Za-z0-9_-]{1,256}$/.test(config.catalog.storeId))) throw new Error('无效的目录读取配置');
if (!['shell', 'cloud'].includes(config.mode) || !['development', 'test', 'production'].includes(config.stage)) throw new Error('无效的 mode / stage');
if (typeof config.enableLegacyDemo !== 'boolean') throw new Error('enableLegacyDemo 必须为布尔值');
if (Object.keys(config.cloudEnvironments).some(key => !['development','test','production'].includes(key))) throw new Error('无效的云环境配置');
if (Object.values(config.cloudEnvironments).some(value => typeof value !== 'string' || value !== value.trim())) throw new Error('环境 ID 格式无效');
if (config.mode === 'cloud' && !config.cloudEnvironments[config.stage]) throw new Error('当前环境 ID 未填写');
const configured = Object.values(config.cloudEnvironments).filter(Boolean);
if (new Set(configured).size !== configured.length) throw new Error('禁止不同阶段复用同一云环境');
if (config.enableLegacyDemo && (config.stage !== 'development' || config.mode !== 'shell')) throw new Error('演示只能在 development + shell 下使用');
fs.writeFileSync(path.join(root, 'runtime-config.js'), '// 由 scripts/configure-local.js 生成；只含公开配置。\nmodule.exports = ' + JSON.stringify(config, null, 2) + ';\n', 'utf8');
console.log('Configured ' + config.stage + '/' + config.mode + '; no credentials or environment IDs logged.');
