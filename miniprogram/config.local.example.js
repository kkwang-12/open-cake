module.exports = {
  mode: 'shell', // 云环境验证时改为 cloud
  stage: 'development', // development / test / production
  cloudEnvironments: { development: '', test: '', production: '' },
  enableLegacyDemo: false // 仅 development + shell 可打开旧定金演示
};
