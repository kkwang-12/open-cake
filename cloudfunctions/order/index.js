'use strict';
const cloud=require('wx-server-sdk');
const {nativeContextForInvocation}=require('./shared/native-context');
const {createOrderCloudHandler}=require('./shared/order-cloud-handler');
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});
let prefixes;
try{prefixes=JSON.parse(process.env.JJL_ORDER_MEDIA_PREFIXES||'[]');}catch(_){prefixes=null;}
const settings={appId:process.env.JJL_APP_ID,environment:process.env.JJL_CLOUD_ENV,stage:process.env.JJL_STAGE,
  enabled:process.env.JJL_ORDER_CREATE_ENABLED==='true',storeId:process.env.JJL_ORDER_STORE_ID,
  allowedCloudPrefixes:prefixes,allowReferenceImages:process.env.JJL_ORDER_REFERENCE_IMAGES_ENABLED==='true',
  addressLocationSecret:Buffer.from(process.env.JJL_ADDRESS_LOCATION_SECRET||'','base64')};
exports.main=createOrderCloudHandler({cloud,settings,getContext:invocation=>nativeContextForInvocation(cloud,invocation)});
