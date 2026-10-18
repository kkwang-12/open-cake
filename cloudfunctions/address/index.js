'use strict';
const cloud=require('wx-server-sdk');
const {nativeContextForInvocation}=require('./shared/native-context');
const {createCloudAddressRepository,createAddressCloudHandler}=require('./shared/address-cloud-handler');
const {createTencentAddressGeocoder,createAddressLocationVerifier}=require('./shared/address-location');
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});
const settings={appId:process.env.JJL_APP_ID,environment:process.env.JJL_CLOUD_ENV,stage:process.env.JJL_STAGE,
  enabled:process.env.JJL_ADDRESS_ENABLED==='true',phonePolicy:process.env.JJL_ADDRESS_PHONE_POLICY,
  cursorKey:{id:'address-v1',secret:Buffer.from(process.env.JJL_ADDRESS_CURSOR_SECRET||'','base64')},
  locationEnabled:process.env.JJL_ADDRESS_LOCATION_ENABLED==='true'};
const locationVerifier=settings.locationEnabled?createAddressLocationVerifier({appId:settings.appId,environment:settings.environment,
  secret:Buffer.from(process.env.JJL_ADDRESS_LOCATION_SECRET||'','base64'),
  geocode:createTencentAddressGeocoder({key:process.env.JJL_TENCENT_MAP_KEY})}):undefined;
exports.main=createAddressCloudHandler({settings,repository:createCloudAddressRepository(cloud,settings),
  locationVerifier,getContext:invocation=>nativeContextForInvocation(cloud,invocation)});
