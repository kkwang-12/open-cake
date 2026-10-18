'use strict';
const cloud=require('wx-server-sdk');
const {nativeContextForInvocation}=require('./shared/native-context');
const {createLab,REVISION}=require('./order-sdk-lab');
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});
const settings={appId:process.env.JJL_APP_ID,environment:process.env.JJL_CLOUD_ENV,stage:process.env.JJL_STAGE,
  runId:process.env.JJL_PROBE_RUN_ID,allowedUserId:process.env.JJL_PROBE_USER_ID,expiresAt:Number(process.env.JJL_PROBE_EXPIRES_AT)};
const lab=createLab({cloud,settings});
exports.main=async(event,invocation)=>{
  try{return {ok:true,result:await lab.execute(event?.payload,nativeContextForInvocation(cloud,invocation)),revision:REVISION};}
  catch(error){console.warn({revision:REVISION,code:error.code||'LAB_INTERNAL_ERROR'});
    return {ok:false,error:{code:error.code||'LAB_INTERNAL_ERROR'},revision:REVISION};}
};
