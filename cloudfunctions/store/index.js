'use strict';
const cloud = require('wx-server-sdk');
const { createStoreCloudHandler, createCloudStoreRepository } = require('./shared/store-cloud-handler');
const { nativeContextForInvocation } = require('./shared/native-context');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const settings={appId:process.env.JJL_APP_ID,environment:process.env.JJL_CLOUD_ENV,stage:process.env.JJL_STAGE,
  enabled:process.env.JJL_STORE_READ_ENABLED==='true',storeId:process.env.JJL_STORE_ID};
const repository=settings.enabled&&settings.storeId
  ?{readSnapshot:()=>createCloudStoreRepository(cloud.database(),settings.storeId).readSnapshot()}:null;
exports.main = createStoreCloudHandler({
  getContext: invocation => nativeContextForInvocation(cloud, invocation),
  settings,repository
});
