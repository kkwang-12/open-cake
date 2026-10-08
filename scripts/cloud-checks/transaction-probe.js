'use strict';
// Test-only Event function; package via prepare-transaction-cloud.js.
const cloud=require('wx-server-sdk');
const {createHandler}=require('./shared/runtime');
const {nativeContextForInvocation}=require('./shared/native-context');
const {createTransactionProbe,TransactionProbeError}=require('./shared/cloud-transaction-probe');
const {CloudDocumentTransactionError}=require('./shared/cloud-document-transaction');
const {ResourceModelError}=require('./shared/resource-model');
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});
const settings={appId:process.env.JJL_APP_ID,environment:process.env.JJL_CLOUD_ENV,stage:process.env.JJL_STAGE,
  testEnvironment:process.env.JJL_TEST_ENV,developmentEnvironment:process.env.JJL_DEVELOPMENT_ENV,
  runId:process.env.JJL_PROBE_RUN_ID,allowedUserId:process.env.JJL_PROBE_USER_ID,
  expiresAt:Number(process.env.JJL_PROBE_EXPIRES_AT)};
const probe=createTransactionProbe({cloud,settings});
exports.main=async(event,invocation)=>{
  let probeCode=null,diagnostic=null;
  const handle=createHandler({action:'probe',settings,
    getContext:platform=>nativeContextForInvocation(cloud,platform),
    handle:async(_public,context)=>probe.execute(event.payload,context),
    mapError:error=>{
      const known=error instanceof TransactionProbeError || error instanceof CloudDocumentTransactionError || error instanceof ResourceModelError;
      if(known)probeCode=error.code;
      if(error instanceof CloudDocumentTransactionError && error.diagnostic)diagnostic=error.diagnostic;
      return 'INTERNAL_ERROR';
    }});
  const result=await handle(event,invocation);
  if(!result.ok && probeCode) {
    console.warn({code:probeCode,requestId:result.requestId,stage:settings.stage});
    return {...result,error:{code:probeCode,message:'隔离验收未完成',...(diagnostic?{diagnostic}: {})}};
  }
  return result.ok?{...result,sdkVersion:require('wx-server-sdk/package.json').version}:result;
};
