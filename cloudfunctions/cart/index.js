'use strict';
const cloud=require('wx-server-sdk');
const {nativeContextForInvocation}=require('./shared/native-context');
const {createCloudCartRepository,createCartCloudHandler}=require('./shared/cart-cloud-handler');
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});
const settings={appId:process.env.JJL_APP_ID,environment:process.env.JJL_CLOUD_ENV,stage:process.env.JJL_STAGE,
  enabled:process.env.JJL_CART_ENABLED==='true',selectionDraft:process.env.JJL_CART_SELECTION_DRAFT==='true',
  storeId:process.env.JJL_CART_STORE_ID};
exports.main=createCartCloudHandler({settings,repository:createCloudCartRepository(cloud,settings),
  getContext:invocation=>nativeContextForInvocation(cloud,invocation)});
