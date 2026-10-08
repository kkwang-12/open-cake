'use strict';
const cloud = require('wx-server-sdk');
const { createHandler } = require('./shared/runtime');
const { createCloudIdentityRepository } = require('./shared/cloud-identity-repository');
const { nativeContextForInvocation } = require('./shared/native-context');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const settings = {appId:process.env.JJL_APP_ID,environment:process.env.JJL_CLOUD_ENV,stage:process.env.JJL_STAGE};
const verify = createHandler({action:'verify',getContext:invocation=>nativeContextForInvocation(cloud,invocation),settings,
  handle:async(_,context)=>{
    if(settings.stage!=='development') return {passed:false,code:'DEVELOPMENT_ONLY'};
    const repository = createCloudIdentityRepository({getWXContext:()=>context,
      database:options=>cloud.database(options)}, settings);
    const first=await repository.ensureCustomer();
    const second=await repository.ensureCustomer();
    const db=cloud.database({env:settings.environment,throwOnNotFound:false});
    const loaded=await db.collection('users').doc(first.principal.subjectId).get();
    const user=loaded.data;
    const count=await db.collection('users').where({environment:settings.environment,
      appId:settings.appId,openId:context.OPENID}).count();
    const assertions=[
      {name:'stable-native-owner',passed:first.principal.subjectId===second.principal.subjectId},
      {name:'repeat-read-does-not-create',passed:second.created===false},
      {name:'persisted-native-tuple',passed:!!user && user.openId===context.OPENID &&
        user.appId===context.APPID && user.environment===context.ENV && user._id===first.principal.subjectId},
      {name:'default-record-shape',passed:!!user && user.schemaVersion===1 &&
        Number.isSafeInteger(user.version) && user.status==='ACTIVE' &&
        Object.hasOwn(user,'privacyConsent') && Object.hasOwn(user,'defaultAddressId')},
      {name:'single-user-for-native-tuple',passed:count.total===1}
    ];
    return {passed:assertions.every(row=>row.passed),firstCreated:first.created,assertions,
      sdkVersion:require('wx-server-sdk/package.json').version};
  }
});
exports.main = async (event, invocationContext) => {
  const result = await verify(event, invocationContext);
  let current = {};
  let parsed = false;
  try {
    if (invocationContext && typeof invocationContext.environment === 'string') {
      current = JSON.parse(invocationContext.environment);
      parsed = true;
    }
  } catch (_) { parsed = false; }
  const sdk = cloud.getWXContext();
  const source = ['wx_client','scf','cloud_function','server'].includes(sdk.SOURCE) ? sdk.SOURCE : 'OTHER_OR_MISSING';
  return {...result, invocationFlags:{parsedEnvironment:parsed,
    hasRequestId:!!(invocationContext && invocationContext.request_id),
    sdkHasNativeOpenId:typeof sdk.OPENID==='string' && sdk.OPENID.length>0,
    sdkHasNativeAppId:typeof sdk.APPID==='string' && sdk.APPID.length>0,
    hasNativeOpenId:typeof current.WX_OPENID==='string' && current.WX_OPENID.length>0,
    sameNativeOpenId:!!current.WX_OPENID && current.WX_OPENID===sdk.OPENID,
    hasNativeAppId:typeof current.WX_APPID==='string' && current.WX_APPID.length>0,
    sameNativeAppId:!!current.WX_APPID && current.WX_APPID===sdk.APPID,
    source}};
};
