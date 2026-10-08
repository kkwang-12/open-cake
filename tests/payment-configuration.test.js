'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {setup,profile,clone}=require('./fixtures/payment-configuration');
const {createPaymentConfigurationModel}=require('../cloudfunctions/_shared/payment-configuration-model');
const model=s=>{
  const prepared=createPaymentConfigurationModel(s.manifest,s.runtime);
  return {describe:prepared.describe,plan:(operation,serverNow=s.runtime.now)=>prepared.plan(operation,serverNow)};
};
const throws=(fn,code)=>assert.throws(fn,e=>e.code===code);

test('P01 committed example leaves all stages disabled/unselected with no secrets or account claims',()=>{
  const manifest=require('../cloudfunctions/payment-settings.example.json'),s=setup();
  const result=createPaymentConfigurationModel(manifest,{...s.runtime,environment:''}).describe();
  assert.deepEqual(manifest.profiles,{development:null,test:null,production:null});
  assert.equal(result.route,null);assert.equal(result.blockedReason,'CLOUD_NOT_CONFIGURED');
  assert.equal(result.configurationReady,false);assert.equal(result.paymentAllowed,false);
});

test('P01 configured shape never claims cloud/account/payment readiness or returns credentials',()=>{
  const s=setup(),result=model(s).describe();
  assert.equal(result.configurationReady,true);assert.equal(result.accountVerified,false);assert.equal(result.cloudVerified,false);
  assert.equal(result.callable,false);assert.equal(result.blockedReason,'SERVICE_NOT_CONNECTED');
  for(const privateValue of [s.profile.environment,s.profile.appId,s.profile.merchantId,'merchant-private','example.invalid'])
    assert.ok(!JSON.stringify(result).includes(privateValue));
});

test('P01 runtime stage/environment/app binding cannot be redirected or inferred',()=>{
  for(const [field,value] of [['environment','other-env'],['appId','wx0000000000000002']]){
    const s=setup();s.runtime[field]=value;throws(()=>model(s),'PAYMENT_BINDING_MISMATCH');
  }
  const s=setup();s.runtime.stage='development';assert.equal(model(s).describe().blockedReason,'PAYMENT_NOT_CONFIGURED');
  s.runtime.stage='demo';throws(()=>model(s),'INVALID_PAYMENT_CONFIGURATION');
});

test('P01 environment IDs cannot be reused between stages including disabled profiles',()=>{
  const s=setup(),prod=profile('production');prod.environment=s.profile.environment;prod.mode='DISABLED';
  for(const field of ['route','merchantId','notifyUrls','credentials','controlledTest'])prod[field]=null;
  s.manifest.profiles.production=prod;throws(()=>model(s),'PAYMENT_ENVIRONMENT_COLLISION');
});

test('P01 one payment route per manifest; unknown, multiple, mock and legacy routes are rejected',()=>{
  for(const route of ['MOCK','DEMO','CLOUDPAY_V2',['WECHATPAY_DIRECT_V3','CLOUDBASE_INTEGRATION_V3'],null]){
    const s=setup();s.profile.route=route;throws(()=>model(s),'INVALID_PAYMENT_CONFIGURATION');
  }
  const s=setup();s.manifest.profiles.production=profile('production','CLOUDBASE_INTEGRATION_V3');
  throws(()=>model(s),'MULTIPLE_PAYMENT_ROUTES');
});

test('P01 no simulate modes or flag can activate production configuration',()=>{
  for(const mode of ['TEST','SIMULATED','MOCK','DEMO','SANDBOX']){
    const s=setup(undefined,'production');s.profile.mode=mode;throws(()=>model(s),'INVALID_PAYMENT_CONFIGURATION');
  }
  for(const field of ['simulate','paymentAllowed','verified','privateKey']){
    const s=setup();s.profile[field]=true;throws(()=>model(s),'INVALID_PAYMENT_CONFIGURATION');
  }
});

test('P01 DISABLED is explicit and cannot retain active provider/merchant fields',()=>{
  const s=setup();s.profile.mode='DISABLED';throws(()=>model(s),'INVALID_PAYMENT_CONFIGURATION');
  for(const field of ['route','merchantId','notifyUrls','credentials','controlledTest'])s.profile[field]=null;
  assert.equal(model(s).describe().blockedReason,'PAYMENT_DISABLED');throws(()=>model(s).plan('CREATE'),'PAYMENT_DISABLED');
});

test('P01 non-production REAL requires a scoped time-bound controlled payment arrangement',()=>{
  const s=setup();s.profile.controlledTest=null;
  assert.equal(model(s).describe().blockedReason,'REAL_PAYMENT_AUTHORIZATION_REQUIRED');
  throws(()=>model(s).plan('CREATE'),'REAL_PAYMENT_AUTHORIZATION_REQUIRED');
  for(const field of ['environment','appId','merchantId','profileVersion']){
    const x=setup();x.profile.controlledTest[field]='mismatch';throws(()=>model(x),'INVALID_PAYMENT_CONFIGURATION');
  }
});

test('P01 controlled budget/reference requires positive explicit limits, not default pennies or free payments',()=>{
  for(const patch of [{reference:''},{maxTotalCents:0},{maxTransactions:0},{maxTotalCents:0.1},{maxTransactions:Infinity}]){
    const s=setup();Object.assign(s.profile.controlledTest,patch);throws(()=>model(s),'INVALID_PAYMENT_CONFIGURATION');
  }
});

test('P01 controlled authorization notBefore inclusive/expiresAt exclusive, no inferred sandbox',()=>{
  const s=setup(),grant=s.profile.controlledTest;
  s.runtime.now=grant.notBefore;assert.equal(model(s).describe().blockedReason,'SERVICE_NOT_CONNECTED');
  s.runtime.now=grant.notBefore-1;throws(()=>model(s).plan('CREATE'),'REAL_PAYMENT_AUTHORIZATION_EXPIRED');
  s.runtime.now=grant.expiresAt;throws(()=>model(s).plan('CREATE'),'REAL_PAYMENT_AUTHORIZATION_EXPIRED');
});

test('P01 production uses release gate and cannot inherit a non-production test authorization',()=>{
  const s=setup(undefined,'production'),plan=model(s).plan('CREATE');
  assert.ok(plan.requiredServerChecks.includes('PRODUCTION_RELEASE_GATE'));assert.equal(plan.paymentAllowed,false);
  s.profile.controlledTest=profile().controlledTest;throws(()=>model(s),'INVALID_PAYMENT_CONFIGURATION');
});

test('P01 reused configuration requires fresh explicit server time and cannot outlive its real-test arrangement',()=>{
  const s=setup(),prepared=createPaymentConfigurationModel(s.manifest,s.runtime);
  throws(()=>prepared.plan('CREATE'),'INVALID_PAYMENT_CONFIGURATION');
  throws(()=>prepared.plan('CREATE',s.runtime.now-1),'INVALID_PAYMENT_CONFIGURATION');
  const plan=prepared.plan('CREATE',s.runtime.now);
  assert.equal(plan.controlledTestLimits.maxTotalCents,100);assert.equal(plan.controlledTestLimits.maxTransactions,1);
  throws(()=>prepared.plan('CREATE',s.profile.controlledTest.expiresAt),'REAL_PAYMENT_AUTHORIZATION_EXPIRED');
});

test('P01 expired or absent new-charge grants never stop existing-payment reconciliation plans',()=>{
  for(const missing of [false,true]){
    const s=setup(),expiry=s.profile.controlledTest.expiresAt;
    if(missing)s.profile.controlledTest=null;
    const prepared=createPaymentConfigurationModel(s.manifest,s.runtime);
    throws(()=>prepared.plan('CREATE',expiry),missing?'REAL_PAYMENT_AUTHORIZATION_REQUIRED':'REAL_PAYMENT_AUTHORIZATION_EXPIRED');
    for(const op of ['QUERY','CLOSE','REFUND','REFUND_QUERY','PAYMENT_NOTIFICATION','REFUND_NOTIFICATION']){
      const plan=prepared.plan(op,expiry);
      assert.equal(plan.reconciliationOnly,true);assert.equal(plan.paymentAllowed,false);
      assert.ok(plan.requiredServerChecks.includes('LOAD_EXISTING_PAYMENT_AND_ORIGINAL_AUTHORIZATION'));
      assert.ok(plan.requiredServerChecks.includes('RECONCILIATION_ONLY_NO_NEW_CHARGE'));
      assert.ok(plan.requiredServerChecks.includes('ORIGINAL_CONTROLLED_REAL_TEST_BINDINGS'));
      assert.ok(!plan.requiredServerChecks.includes('DURABLE_CONTROLLED_REAL_TEST_BUDGET'));
    }
  }
});

test('P01 secret references bind environment and revision; raw keys/PEM do not fit the schema',()=>{
  for(const ref of ['-----BEGIN PRIVATE KEY----- PRIVATE_TEXT',{name:'key',revision:'v1'},
    {environment:'production-env',name:'key',revision:'v1'},
    {environment:'OFFLINE_PAYMENT_test',name:'key',revision:'v1',value:'RAW_SECRET'}]){
    const s=setup();s.profile.credentials.merchantPrivateKeyRef=ref;
    throws(()=>model(s),'INVALID_PAYMENT_CONFIGURATION');
  }
  const s=setup();s.profile.credentials.apiV3Key='RAW_API_KEY';throws(()=>model(s),'INVALID_PAYMENT_CONFIGURATION');
});

test('P01 direct verification separates merchant signature key from WeChat response/notification key',()=>{
  const s=setup(),plan=model(s).plan('PAYMENT_NOTIFICATION');
  assert.equal(plan.notificationVerification,'SERVER_SIGNATURE_AND_DECRYPTION');
  s.profile.credentials.verification.keyId=s.profile.credentials.merchantSerial;
  throws(()=>model(s),'INVALID_PAYMENT_CONFIGURATION');
  s.profile.credentials.verification.mode='PLATFORM_CERTIFICATE';assert.equal(model(s).describe().configurationReady,true);
});

test('P01 platform forwarding requires its own authenticated boundary, not event verified flags',()=>{
  const s=setup('CLOUDBASE_INTEGRATION_V3');assert.equal(model(s).plan('PAYMENT_NOTIFICATION').notificationVerification,
    'PLATFORM_VERIFIED_WITH_AUTHENTICATED_FORWARDING');
  for(const field of ['verified','signatureValid','merchantPrivateKeyRef']){
    const x=setup('CLOUDBASE_INTEGRATION_V3');x.profile.credentials[field]=true;throws(()=>model(x),'INVALID_PAYMENT_CONFIGURATION');
  }
  s.profile.credentials.forwardingAuthRef=null;throws(()=>model(s),'INVALID_PAYMENT_CONFIGURATION');
});

test('P01 callbacks use explicit canonical HTTPS URLs without credentials/query/local endpoints',()=>{
  for(const url of ['http://test.example.invalid/pay','https://user:pass@test.example.invalid/pay',
    'https://localhost/pay','https://127.0.0.1/pay','https://test.example.invalid/pay?secret=1',
    'https://test.example.invalid/pay#fragment','https://test.example.invalid:8443/pay',' https://test.example.invalid/pay']){
    const s=setup();s.profile.notifyUrls.payment=url;throws(()=>model(s),'INVALID_PAYMENT_CONFIGURATION');
  }
});

test('P01 platform callback domain/path must match its candidate transport; no guessed raw webhook fallback',()=>{
  for(const url of ['https://test.example.invalid/pay','https://offline-test.integration-callback.tcloudbase.com/other']){
    const s=setup('CLOUDBASE_INTEGRATION_V3');s.profile.notifyUrls.payment=url;throws(()=>model(s),'INVALID_PAYMENT_CONFIGURATION');
  }
});

test('P01 no test/production callback or integration reuse silently crosses environments',()=>{
  for(const route of ['WECHATPAY_DIRECT_V3','CLOUDBASE_INTEGRATION_V3']){
    const s=setup(route),prod=profile('production',route);s.manifest.profiles.production=prod;
    prod.notifyUrls=clone(s.profile.notifyUrls);throws(()=>model(s),'PAYMENT_ENVIRONMENT_COLLISION');
  }
  const s=setup('CLOUDBASE_INTEGRATION_V3'),prod=profile('production','CLOUDBASE_INTEGRATION_V3');
  prod.credentials.integrationId=s.profile.credentials.integrationId;s.manifest.profiles.production=prod;
  throws(()=>model(s),'PAYMENT_ENVIRONMENT_COLLISION');
});

test('P01 complete separated profiles can share merchant only with explicit scoped real-test arrangement',()=>{
  const s=setup();s.manifest.profiles.production=profile('production');
  assert.equal(model(s).describe().configurationReady,true);assert.equal(model(s).describe().paymentAllowed,false);
});

test('P01 operation plans keep number/deadline requirements and never return keys/params or call adapters',()=>{
  const s=setup(),plan=model(s).plan('CREATE');
  assert.equal(plan.prepayConstraints.merchantOrderNumberMaxLength,32);assert.equal(plan.prepayConstraints.minimumLifetimeMs,60000);
  assert.equal(plan.prepayConstraints.mustNotExtendOrderDeadline,true);assert.equal(plan.prepayConstraints.requiresSeparateUniqueMerchantNumber,true);
  assert.equal(plan.callable,false);assert.ok(!JSON.stringify(plan).includes('merchant-private'));
  for(const op of ['QUERY','CLOSE','REFUND','REFUND_QUERY','PAYMENT_NOTIFICATION','REFUND_NOTIFICATION'])assert.equal(model(s).plan(op).paymentAllowed,false);
  for(const op of ['simulate','TRANSFER','PAYMENT_CONFIRMED'])throws(()=>model(s).plan(op),'UNSUPPORTED_PAYMENT_OPERATION');
});

test('P01 configuration snapshots immutable; getters/symbols/unknown roots cannot carry unsafe secret values',()=>{
  const s=setup(),prepared=model(s),timestamp=s.runtime.now,first=prepared.plan('CREATE');s.profile.merchantId='999';s.runtime.now+=100000;
  assert.deepEqual(prepared.plan('CREATE',timestamp),first);assert.equal(Object.isFrozen(first.requiredServerChecks),true);
  const bad=setup();let invoked=0;Object.defineProperty(bad.profile,'privateKey',{enumerable:true,get(){invoked++;return 'PRIVATE_KEY';}});
  throws(()=>model(bad),'INVALID_PAYMENT_CONFIGURATION');assert.equal(invoked,0);
  const symbols=setup();symbols.manifest[Symbol('secret')]='PRIVATE_KEY';throws(()=>model(symbols),'INVALID_PAYMENT_CONFIGURATION');
});

test('P01 fixed configuration errors contain no merchant material, raw URLs, PEM or nested input',()=>{
  const s=setup();s.profile.credentials={privateKey:'PRIVATE_PEM_SECRET'};
  try{model(s);assert.fail('must reject');}catch(error){assert.equal(error.code,'INVALID_PAYMENT_CONFIGURATION');
    assert.ok(!JSON.stringify({message:error.message,code:error.code}).includes('PRIVATE_PEM_SECRET'));}
});

test('P01 current app remains shell/unconfigured with payment routes outside client allowlist and deployment',()=>{
  const settings=require('../miniprogram/runtime-config'),{createClient}=require('../miniprogram/services/cloud');let calls=0;
  const client=createClient({...settings,mode:'cloud',stage:'test',cloudEnvironments:{test:'OFFLINE_ONLY'}},
    ()=>({cloud:{init(){calls++;},callFunction(){calls++;}}}),{warn(){}});
  assert.equal(settings.enableLegacyDemo,false);
  for(const entry of fs.readdirSync(path.resolve(__dirname,'../cloudfunctions')))
    assert.notEqual(entry,'payment');
  return Promise.all(['create','state.get','simulate'].map(action=>assert.rejects(()=>client.call('payment',action),e=>e.code==='INVALID_REQUEST')))
    .then(()=>assert.equal(calls,0));
});
