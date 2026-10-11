'use strict';
const cloud=require('wx-server-sdk');
const {nativeContextForInvocation}=require('./shared/native-context');
const {createCloudAddressRepository,createAddressCloudHandler}=require('./shared/address-cloud-handler');
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});
const settings={appId:process.env.JJL_APP_ID,environment:process.env.JJL_CLOUD_ENV,stage:process.env.JJL_STAGE,
  enabled:process.env.JJL_ADDRESS_ENABLED==='true',phonePolicy:process.env.JJL_ADDRESS_PHONE_POLICY,
  cursorKey:{id:'address-v1',secret:Buffer.from(process.env.JJL_ADDRESS_CURSOR_SECRET||'','base64')}};
exports.main=createAddressCloudHandler({settings,repository:createCloudAddressRepository(cloud,settings),
  getContext:invocation=>nativeContextForInvocation(cloud,invocation)});
