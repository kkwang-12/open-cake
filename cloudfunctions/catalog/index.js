'use strict';
const cloud=require('wx-server-sdk');
const {nativeContextForInvocation}=require('./shared/native-context');
const {createCatalogCloudHandler,createCloudCatalogRepository}=require('./shared/catalog-cloud-handler');
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});
let prefixes=[];
try { prefixes=JSON.parse(process.env.JJL_CATALOG_MEDIA_PREFIXES || '[]'); } catch (_) { prefixes=null; }
const settings={appId:process.env.JJL_APP_ID,environment:process.env.JJL_CLOUD_ENV,stage:process.env.JJL_STAGE,
  enabled:process.env.JJL_CATALOG_READ_ENABLED==='true',storeId:process.env.JJL_CATALOG_STORE_ID,
  allowedCloudPrefixes:prefixes,cursorKey:{id:'catalog-v1',secret:Buffer.from(process.env.JJL_CATALOG_CURSOR_SECRET || '','base64')}};
// Invalid deployment config must return a safe envelope instead of failing module initialization.
const repository=settings.storeId?{readSnapshot:()=>createCloudCatalogRepository(cloud.database(),settings.storeId).readSnapshot()}:null;
exports.main=createCatalogCloudHandler({settings,repository,getContext:invocation=>nativeContextForInvocation(cloud,invocation)});
