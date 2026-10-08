'use strict';
// Server-only profile preparation. No provider adapter, secret loading or money call.
const {canonicalJSON}=require('./idempotency-model');
function fail(code){throw Object.assign(new Error(code),{code});}
const STAGES=['development','test','production'];
const ROUTES=['CLOUDBASE_INTEGRATION_V3','WECHATPAY_DIRECT_V3'];
const OPERATIONS=['CREATE','QUERY','CLOSE','REFUND','REFUND_QUERY','PAYMENT_NOTIFICATION','REFUND_NOTIFICATION'];
const id=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value);
const app=value=>typeof value==='string'&&/^wx[a-fA-F0-9]{16}$/.test(value);
const merchant=value=>typeof value==='string'&&/^\d{1,32}$/.test(value);
const positive=value=>Number.isSafeInteger(value)&&value>0;
const time=value=>positive(value)&&Number.isFinite(new Date(value).getTime());
function exact(value,fields){
  return value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...fields].sort().join(',');
}
function snapshot(input){try{return JSON.parse(canonicalJSON(input));}catch(_){fail('INVALID_PAYMENT_CONFIGURATION');}}
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
function secretRef(ref,environment){
  if(!exact(ref,['environment','name','revision'])||ref.environment!==environment||!id(ref.name)||!id(ref.revision))fail('INVALID_PAYMENT_CONFIGURATION');
}
function notifyURL(value){
  try{
    const url=new URL(value);
    if(typeof value!=='string'||url.href!==value||url.protocol!=='https:'||url.username||url.password||url.port||
        url.search||url.hash||!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(url.hostname)||
        url.pathname==='/'||url.pathname.includes('//'))fail('INVALID_PAYMENT_CONFIGURATION');
    return url;
  }catch(_){fail('INVALID_PAYMENT_CONFIGURATION');}
}
function validateProfile(profile,stage){
  if(!exact(profile,['version','stage','environment','appId','mode','route','merchantId','notifyUrls','credentials','controlledTest'])||
      !id(profile.version)||profile.stage!==stage||!id(profile.environment)||!app(profile.appId)||
      !['DISABLED','REAL'].includes(profile.mode))fail('INVALID_PAYMENT_CONFIGURATION');
  if(profile.mode==='DISABLED'){
    if(['route','merchantId','notifyUrls','credentials','controlledTest'].some(field=>profile[field]!==null))fail('INVALID_PAYMENT_CONFIGURATION');
    return;
  }
  if(!ROUTES.includes(profile.route)||!merchant(profile.merchantId)||!exact(profile.notifyUrls,['payment','refund']))fail('INVALID_PAYMENT_CONFIGURATION');
  const payment=notifyURL(profile.notifyUrls.payment),refund=notifyURL(profile.notifyUrls.refund),credentials=profile.credentials;
  if(profile.route==='WECHATPAY_DIRECT_V3'){
    if(!exact(credentials,['merchantSerial','merchantPrivateKeyRef','apiV3KeyRef','verification'])||
        typeof credentials.merchantSerial!=='string'||!/^[a-fA-F0-9]{16,64}$/.test(credentials.merchantSerial)||
        !exact(credentials.verification,['mode','keyId','keyRef']))fail('INVALID_PAYMENT_CONFIGURATION');
    secretRef(credentials.merchantPrivateKeyRef,profile.environment);secretRef(credentials.apiV3KeyRef,profile.environment);
    const verification=credentials.verification;
    if(typeof verification.keyId!=='string'||(verification.mode==='PUBLIC_KEY'? !/^PUB_KEY_ID_\d+$/.test(verification.keyId):
        verification.mode!=='PLATFORM_CERTIFICATE'||!/^[a-fA-F0-9]{16,64}$/.test(verification.keyId)))fail('INVALID_PAYMENT_CONFIGURATION');
    secretRef(verification.keyRef,profile.environment);
  }else{
    if(!exact(credentials,['integrationId','functionName','forwardingAuthRef'])||!id(credentials.integrationId)||
        !id(credentials.functionName)||!/^([a-z0-9-]+)\.integration-callback\.tcloudbase\.com$/.test(payment.hostname)||
        payment.hostname!==refund.hostname||payment.pathname!=='/wechatpay/order'||refund.pathname!=='/wechatpay/refund')
      fail('INVALID_PAYMENT_CONFIGURATION');
    // Placeholder for a real authenticated forwarding boundary, not a claimed
    // CloudBase built-in token or a boolean in the decrypted event body.
    secretRef(credentials.forwardingAuthRef,profile.environment);
  }
  const grant=profile.controlledTest;
  if(stage==='production'){
    if(grant!==null)fail('INVALID_PAYMENT_CONFIGURATION');
  }else if(grant!==null){
    if(!exact(grant,['reference','environment','appId','merchantId','profileVersion','notBefore','expiresAt','maxTotalCents','maxTransactions'])||
        !id(grant.reference)||grant.environment!==profile.environment||grant.appId!==profile.appId||
        grant.merchantId!==profile.merchantId||grant.profileVersion!==profile.version||!time(grant.notBefore)||
        !time(grant.expiresAt)||grant.notBefore>=grant.expiresAt||!positive(grant.maxTotalCents)||!positive(grant.maxTransactions))
      fail('INVALID_PAYMENT_CONFIGURATION');
  }
}
function createPaymentConfigurationModel(manifest,runtime){
  manifest=snapshot(manifest);runtime=snapshot(runtime);
  if(!exact(manifest,['schemaVersion','profiles'])||manifest.schemaVersion!==1||!exact(manifest.profiles,STAGES)||
      !exact(runtime,['stage','environment','appId','now'])||!STAGES.includes(runtime.stage)||!app(runtime.appId)||
      !(runtime.environment===''||id(runtime.environment))||!time(runtime.now))fail('INVALID_PAYMENT_CONFIGURATION');
  const profiles=STAGES.filter(stage=>manifest.profiles[stage]!==null).map(stage=>{
    const profile=manifest.profiles[stage];validateProfile(profile,stage);return profile;
  });
  if(new Set(profiles.map(p=>p.environment)).size!==profiles.length)fail('PAYMENT_ENVIRONMENT_COLLISION');
  const real=profiles.filter(p=>p.mode==='REAL');
  if(new Set(real.map(p=>p.route)).size>1)fail('MULTIPLE_PAYMENT_ROUTES');
  for(let a=0;a<real.length;a++)for(let b=a+1;b<real.length;b++){
    if(Object.values(real[a].notifyUrls).some(url=>Object.values(real[b].notifyUrls).includes(url))||
        real[a].route==='CLOUDBASE_INTEGRATION_V3'&&real[a].credentials.integrationId===real[b].credentials.integrationId)
      fail('PAYMENT_ENVIRONMENT_COLLISION');
  }
  const profile=manifest.profiles[runtime.stage];
  if(profile!==null&&(profile.environment!==runtime.environment||profile.appId!==runtime.appId))fail('PAYMENT_BINDING_MISMATCH');
  freeze(manifest);freeze(runtime);
  function blockedReason(serverNow){
    if(runtime.environment==='')return 'CLOUD_NOT_CONFIGURED';
    if(profile===null)return 'PAYMENT_NOT_CONFIGURED';
    if(profile.mode==='DISABLED')return 'PAYMENT_DISABLED';
    if(runtime.stage!=='production'){
      const grant=profile.controlledTest;
      if(grant===null)return 'REAL_PAYMENT_AUTHORIZATION_REQUIRED';
      if(serverNow<grant.notBefore||serverNow>=grant.expiresAt)return 'REAL_PAYMENT_AUTHORIZATION_EXPIRED';
    }
    return 'SERVICE_NOT_CONNECTED';
  }
  function describe(){
    return freeze({scope:'OFFLINE_PAYMENT_CONFIGURATION',stage:runtime.stage,mode:profile?.mode||'DISABLED',
      route:profile?.route||null,configurationReady:profile?.mode==='REAL',blockedReason:blockedReason(runtime.now),
      accountVerified:false,cloudVerified:false,callable:false,paymentAllowed:false});
  }
  function plan(operation,serverNow){
    if(!OPERATIONS.includes(operation))fail('UNSUPPORTED_PAYMENT_OPERATION');
    if(!time(serverNow)||serverNow<runtime.now)fail('INVALID_PAYMENT_CONFIGURATION');
    const reason=blockedReason(serverNow);
    // A real-test grant stops new charges when it expires, never reconciliation
    // of an existing payment. The latter must load original persisted evidence.
    const reconciliation=operation!=='CREATE';
    if(reason!=='SERVICE_NOT_CONNECTED'&&!(reconciliation&&
        ['REAL_PAYMENT_AUTHORIZATION_REQUIRED','REAL_PAYMENT_AUTHORIZATION_EXPIRED'].includes(reason)))fail(reason);
    const platform=profile.route==='CLOUDBASE_INTEGRATION_V3';
    const notification=operation.endsWith('_NOTIFICATION');
    return freeze({scope:'OFFLINE_PAYMENT_OPERATION_PLAN',operation,profileVersion:profile.version,
      stage:runtime.stage,environment:profile.environment,appId:profile.appId,merchantId:profile.merchantId,route:profile.route,
      notificationVerification:platform?'PLATFORM_VERIFIED_WITH_AUTHENTICATED_FORWARDING':'SERVER_SIGNATURE_AND_DECRYPTION',
      reconciliationOnly:reconciliation,
      controlledTestLimits:profile.controlledTest===null?null:{...profile.controlledTest},
      requiredServerChecks:['CURRENT_PROFILE_AND_SECRET_BINDINGS','ACTUAL_APPID_MERCHANT_ASSOCIATION',
        'REAL_PROVIDER_AND_SDK_CAPABILITY_CHECKS',...(notification?['AUTHENTICATE_NOTIFICATION_SOURCE',
          'VALIDATE_BUSINESS_FIELDS_AND_DEDUPLICATE']:['AUTHORIZE_DOMAIN_OPERATION','LOAD_TRUSTED_MONEY_AND_ORDER_STATE']),
        ...(reconciliation?['LOAD_EXISTING_PAYMENT_AND_ORIGINAL_AUTHORIZATION','RECONCILIATION_ONLY_NO_NEW_CHARGE']:[]),
        ...(runtime.stage==='production'?['PRODUCTION_RELEASE_GATE']:
          reconciliation?['ORIGINAL_CONTROLLED_REAL_TEST_BINDINGS']:['DURABLE_CONTROLLED_REAL_TEST_BUDGET']),
        'ATOMIC_LEDGER_AND_ORDER_RECONCILIATION'],
      // Current documented JSAPI candidate constraints, not generated provider params.
      prepayConstraints:operation==='CREATE'?{merchantOrderNumberMaxLength:32,minimumLifetimeMs:60000,
        maximumLifetimeMs:15*24*60*60*1000,mustNotExtendOrderDeadline:true,requiresSeparateUniqueMerchantNumber:true}:null,
      accountVerified:false,cloudVerified:false,callable:false,paymentAllowed:false});
  }
  return Object.freeze({describe,plan});
}
module.exports={createPaymentConfigurationModel};
