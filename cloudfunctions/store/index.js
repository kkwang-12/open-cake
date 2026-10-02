'use strict';
const cloud = require('wx-server-sdk');
const { createHandler } = require('./shared/runtime');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
exports.main = createHandler({
  action: 'health',
  getContext: () => cloud.getWXContext(),
  settings: { appId: process.env.JJL_APP_ID, environment: process.env.JJL_CLOUD_ENV, stage: process.env.JJL_STAGE },
  handle: ({ stage, environment }) => ({ available: true, stage, environment })
});
