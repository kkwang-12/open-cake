'use strict';
// OFFLINE_TEST_ONLY identifiers, references, callbacks and budgets; never invoked.
const clone=value=>JSON.parse(JSON.stringify(value));
const now=1791187200000,appId='wx0000000000000001';
function profile(stage='test',route='WECHATPAY_DIRECT_V3'){
  const environment='OFFLINE_PAYMENT_'+stage,ref=name=>({environment,name,revision:'OFFLINE_TEST_ONLY'});
  return {version:'OFFLINE_TEST_ONLY',stage,environment,appId,mode:'REAL',route,merchantId:'0000000000',
    notifyUrls:route==='WECHATPAY_DIRECT_V3'?{payment:'https://'+stage+'.example.invalid/payment',refund:'https://'+stage+'.example.invalid/refund'}:
      {payment:'https://offline-'+stage+'.integration-callback.tcloudbase.com/wechatpay/order',
        refund:'https://offline-'+stage+'.integration-callback.tcloudbase.com/wechatpay/refund'},
    credentials:route==='WECHATPAY_DIRECT_V3'?{merchantSerial:'A'.repeat(40),merchantPrivateKeyRef:ref('merchant-private'),
      apiV3KeyRef:ref('api-v3'),verification:{mode:'PUBLIC_KEY',keyId:'PUB_KEY_ID_0000000000',keyRef:ref('wechat-public')}}:
      {integrationId:'OFFLINE_INTEGRATION_'+stage,functionName:'OFFLINE_TEST_ONLY',forwardingAuthRef:ref('forwarding-auth')},
    controlledTest:stage==='production'?null:{reference:'OFFLINE_TEST_ONLY',environment,appId,merchantId:'0000000000',
      profileVersion:'OFFLINE_TEST_ONLY',notBefore:now-1000,expiresAt:now+60000,maxTotalCents:100,maxTransactions:1}};
}
function setup(route='WECHATPAY_DIRECT_V3',stage='test'){
  const p=profile(stage,route),manifest={schemaVersion:1,profiles:{development:null,test:null,production:null}};
  manifest.profiles[stage]=p;
  return {manifest,runtime:{stage,environment:p.environment,appId,now},profile:p,clone};
}
module.exports={setup,profile,clone,now,appId};
