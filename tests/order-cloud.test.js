'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createOrderCloudHandler,SDK_LIMITS}=require('../cloudfunctions/_shared/order-cloud-handler');
const {createClient}=require('../miniprogram/services/cloud');
const event={action:'create',payload:{quoteId:'quote',expectedQuoteVersion:0,idempotencyKey:'order-cloud-test-key'}};
function setup(){const calls=[],logs=[],settings={appId:'wx-test',environment:'test-env',stage:'development',enabled:true,storeId:'store'};
  const native={OPENID:'native-owner',APPID:settings.appId,ENV:settings.environment};
  let error=null;
  const main=createOrderCloudHandler({cloud:{database(){throw Error('UNREACHABLE');}},settings,getContext:inv=>inv,
    logger:{info:x=>logs.push(x),warn:x=>logs.push(x),error:x=>logs.push(x)},createService:options=>{calls.push(options);return {execute:async(request,context)=>{
      calls.push({request,context});if(error)throw error;return {scope:'PRIVATE_INTERNAL',result:{entityId:'order',version:0,errorCode:null,privateNote:'PRIVATE_SENTINEL'}};}};}});
  return {main,settings,native,calls,logs,fail:code=>{error=Object.assign(new Error('PRIVATE_SENTINEL'),{code});}};
}

test('order.create uses native invocation, a fixed SDK policy and a minimal CommandResult',async()=>{
  const f=setup(),result=await f.main({...event,userInfo:{OPENID:'FORGED'},tcbContext:{OPENID:'FORGED'}},f.native);
  assert.equal(result.ok,true);assert.deepEqual(result.data,{entityId:'order',version:0,errorCode:null});
  assert.deepEqual(f.calls[0].limits,SDK_LIMITS);assert.equal(f.calls[0].settings.storeId,'store');assert.equal(typeof f.calls[0].newRequestId(),'string');
  assert.deepEqual(f.calls[1].request,event);assert.deepEqual(f.calls[1].context,f.native);assert(!JSON.stringify([result,f.logs]).includes('PRIVATE_SENTINEL'));
});

test('order.create default closure, nondevelopment scope, foreign identity and unsupported business fields stop before SDK access',async()=>{
  for(const mutate of [f=>f.settings.enabled=false,f=>delete f.settings.enabled,f=>f.settings.stage='test',f=>f.settings.stage='production',f=>f.settings.storeId='']){
    const f=setup();mutate(f);assert.equal((await f.main(event,f.native)).error.code,'CONFIGURATION_REQUIRED');assert.equal(f.calls.length,0);
  }
  for(const [patch,code]of [[{OPENID:null},'AUTH_REQUIRED'],[{APPID:'other'},'APP_MISMATCH'],[{ENV:'other'},'ENV_MISMATCH']]){
    const f=setup();Object.assign(f.native,patch);assert.equal((await f.main(event,f.native)).error.code,code);assert.equal(f.calls.length,0);
  }
  for(const request of [{...event,payload:{...event.payload,priceCents:1}},{...event,payload:{...event.payload,ownerId:'other'}},
    {...event,payload:{...event.payload,enabled:true}},{action:'cancelUnpaid',payload:{}},{action:'get',payload:{orderId:'order'}}, {...event,role:'admin'}]){
    const f=setup();assert.equal((await f.main(request,f.native)).error.code,'INVALID_REQUEST');assert.equal(f.calls.length,0);
  }
});

test('order context rejects a foreign-store quote before media/location reads and public errors hide provider details',async()=>{
  const f=setup();await f.main(event,f.native);
  assert.throws(()=>f.calls[0].buildContext({readContextDocument(){throw Error('UNREACHABLE');}},
    {store:{_id:'other'},quote:{storeId:'other'}},{}),e=>e.code==='NOT_FOUND');
  for(const [internal,expected]of [['FORBIDDEN','NOT_FOUND'],['USER_DISABLED','AUTH_REQUIRED'],['ORDER_SDK_TIME_EXCEEDED','CONFIGURATION_REQUIRED'],
    ['SLOT_FULL_OR_CLOSED','APPOINTMENT_UNAVAILABLE'],['CLOUD_UNIQUE_CONFLICT','VERSION_CONFLICT'],['PROVIDER_SECRET','INTERNAL_ERROR']]){
    const denied=setup();denied.fail(internal);const result=await denied.main(event,denied.native);assert.equal(result.error.code,expected);
    assert(!JSON.stringify([result,denied.logs]).includes('PRIVATE_SENTINEL'));
  }
});

test('order function package is self-contained, defaults closed, and the client still rejects all order calls',async()=>{
  const root=path.resolve(__dirname,'../cloudfunctions/order'),files=fs.readdirSync(path.join(root,'shared'));
  assert(files.includes('order-sdk-session.js'));assert(files.includes('quote-cloud-context.js'));
  for(const name of files){const source=fs.readFileSync(path.join(root,'shared',name),'utf8');
    assert.equal(source,fs.readFileSync(path.resolve(root,'../_shared',name),'utf8'));
    for(const match of source.matchAll(/require\(['"]\.\/([^'"]+)['"]\)/g))assert(fs.existsSync(path.join(root,'shared',match[1]+'.js')));}
  const index=fs.readFileSync(path.join(root,'index.js'),'utf8');assert(index.includes("process.env.JJL_ORDER_CREATE_ENABLED==='true'"));
  let touched=0;const client=createClient({mode:'cloud',stage:'development',checkout:{enabled:true},cloudEnvironments:{development:'test-env'}},()=>{touched++;throw Error('UNREACHABLE');},{warn(){}});
  await assert.rejects(client.call('order','create',event.payload),e=>e.code==='INVALID_REQUEST');assert.equal(touched,0);
});
