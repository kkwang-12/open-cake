'use strict';
const {randomUUID}=require('node:crypto');
const {createHandler}=require('./runtime');
const {parseApiRequest,ApiContractError}=require('./api-contract');
const {createSdkOrderService}=require('./order-sdk-session');
const {createQuoteContextBuilder}=require('./quote-cloud-context');
const SDK_LIMITS=Object.freeze({maxOperations:100,maxReadDocuments:80,maxWrites:80,maxPayloadBytes:65536,
  maxTotalPayloadBytes:1048576,maxAttempts:3,maxDurationMs:15000});
const fail=code=>{throw Object.assign(new Error(code),{code});};
function mapError(error){
  const code=error?.code;
  if(error instanceof ApiContractError)return 'INVALID_REQUEST';
  if(code==='FORBIDDEN')return 'NOT_FOUND';
  if(['USER_NOT_PROVISIONED','USER_DISABLED','INVALID_USER_RECORD'].includes(code))return 'AUTH_REQUIRED';
  if(['ORDER_SDK_BUDGET_EXCEEDED','ORDER_SDK_TIME_EXCEEDED','ORDER_READ_BUDGET_EXCEEDED','INVALID_TRANSACTION_FENCE',
    'STORE_UNAVAILABLE','INVALID_MEDIA_CONFIGURATION','INVALID_MEDIA_ASSET','MEDIA_NOT_READY','MEDIA_VERSION_UNAVAILABLE'].includes(code))return 'CONFIGURATION_REQUIRED';
  if(['SLOT_FULL_OR_CLOSED','SLOT_DEFINITION_MISMATCH','INVALID_SLOT'].includes(code))return 'APPOINTMENT_UNAVAILABLE';
  if(['RESOURCE_VERSION_CONFLICT','CLOUD_UNIQUE_CONFLICT'].includes(code))return 'VERSION_CONFLICT';
  return ['INVALID_REQUEST','AUTH_REQUIRED','APP_MISMATCH','ENV_MISMATCH','CONFIGURATION_REQUIRED','NOT_FOUND',
    'VERSION_CONFLICT','IDEMPOTENCY_KEY_REUSED','BUSY','QUOTE_CHANGED','QUOTE_EXPIRED','LOCATION_REQUIRED',
    'PRODUCT_UNAVAILABLE','RESOURCE_UNAVAILABLE','APPOINTMENT_UNAVAILABLE','FULFILLMENT_UNAVAILABLE'].includes(code)?code:'INTERNAL_ERROR';
}
function createOrderCloudHandler({cloud,settings,getContext,logger=console,now=Date.now,createService=createSdkOrderService}){
  return async function main(event={},invocation){
    const {userInfo,tcbContext,...request}=event||{};
    return createHandler({action:'create',settings,getContext,logger,mapError,async handle(_public,native){
      parseApiRequest('order',request);
      if(settings.enabled!==true||settings.stage!=='development'||!/^[-A-Za-z0-9_]{1,256}$/.test(settings.storeId||''))fail('CONFIGURATION_REQUIRED');
      const builder=createQuoteContextBuilder(settings,now);
      const service=createService({cloud,settings,limits:SDK_LIMITS,now,newRequestId:randomUUID,
        buildContext:(tx,state,principal)=>{
          if(state.store?._id!==settings.storeId||state.quote?.storeId!==settings.storeId)fail('NOT_FOUND');
          return builder(tx.readContextDocument,state,principal);
        }});
      const outcome=await service.execute(request,native);
      // CommandResult only: no SDK scope, identity, resources, or private order snapshot.
      const {entityId,version,errorCode}=outcome.result;return {entityId,version,errorCode};
    }})(request,invocation);
  };
}
module.exports={createOrderCloudHandler,SDK_LIMITS};
