'use strict';
const {createHandler}=require('./runtime');
const {parseApiRequest}=require('./api-contract');
const {createSdkQuoteService}=require('./quote-sdk-service');
const fail=code=>{throw Object.assign(new Error(code),{code});};
const safe=new Set(['INVALID_REQUEST','AUTH_REQUIRED','APP_MISMATCH','ENV_MISMATCH','CONFIGURATION_REQUIRED',
  'NOT_FOUND','VERSION_CONFLICT','IDEMPOTENCY_KEY_REUSED','BUSY','PRODUCT_UNAVAILABLE','QUOTE_CHANGED','QUOTE_EXPIRED',
  'LOCATION_REQUIRED','APPOINTMENT_UNAVAILABLE','RESOURCE_UNAVAILABLE','FULFILLMENT_UNAVAILABLE']);
function mapError(error){
  const code=error?.code;
  if(code==='FORBIDDEN')return 'NOT_FOUND';
  if(['USER_NOT_PROVISIONED','USER_DISABLED','INVALID_USER_RECORD'].includes(code))return 'AUTH_REQUIRED';
  if(['STORE_UNAVAILABLE','INVALID_MEDIA_CONFIGURATION','INVALID_MEDIA_ASSET','MEDIA_NOT_READY','MEDIA_VERSION_UNAVAILABLE',
    'QUOTE_BUDGET_EXCEEDED','QUOTE_TIME_EXCEEDED','INVALID_TRANSACTION_FENCE'].includes(code))return 'CONFIGURATION_REQUIRED';
  if(['SKU_UNAVAILABLE','INVALID_CATALOG'].includes(code))return 'PRODUCT_UNAVAILABLE';
  if(['SLOT_FULL_OR_CLOSED','INVALID_SLOT'].includes(code))return 'APPOINTMENT_UNAVAILABLE';
  if(['INVALID_SELECTION','SKU_SELECTION_MISMATCH','INVALID_MESSAGE','MESSAGE_NOT_SUPPORTED','CART_LIMIT_EXCEEDED'].includes(code))return 'INVALID_REQUEST';
  return safe.has(code)?code:'INTERNAL_ERROR';
}
function createQuoteCloudHandler({cloud,settings,getContext,now=Date.now,logger=console}){
  return async function main(event={},invocation){
    const {userInfo,tcbContext,...request}=event||{};
    const action=['quote.create','quote.get'].includes(request.action)?request.action:'quote.create';
    return createHandler({action,settings,getContext,logger,mapError,
      async handle(_public,context){
        if(settings.enabled!==true)fail('CONFIGURATION_REQUIRED');
        parseApiRequest('checkout',request);
        return createSdkQuoteService({cloud,settings,now}).execute(request,context);
      }})(request,invocation);
  };
}
module.exports={createQuoteCloudHandler};
