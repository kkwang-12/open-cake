'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createStoreCloudHandler,createCloudStoreRepository}=require('../cloudfunctions/_shared/store-cloud-handler');
const {V1_FULFILLMENT_POLICY}=require('../cloudfunctions/_shared/fulfillment-model');
const {createClient}=require('../miniprogram/services/cloud');
function setup(){
  const settings={appId:'test-store-app',environment:'test-store-env',stage:'development',enabled:true,storeId:'test-store'};
  const context={OPENID:'native-owner',APPID:settings.appId,ENV:settings.environment};
  const store={_id:settings.storeId,version:1,status:'OPEN',name:'TEST_ONLY',address:'测试地址',phone:'0551-00000000',
    timeZone:'Asia/Shanghai',activeConfigId:'test-config',privateNote:'PRIVATE_SENTINEL',location:{privateValue:'PRIVATE_SENTINEL'}};
  const configuration={_id:'test-config',storeId:store._id,status:'PUBLISHED',configVersion:1,publishedAt:1000,
    fulfillmentPolicyVersion:V1_FULFILLMENT_POLICY.version,fulfillmentModes:['PICKUP','DELIVERY'],privateCounts:'PRIVATE_SENTINEL',
    timePolicy:{policyVersion:'test-only-hours',timeZone:'Asia/Shanghai',minLeadTimeMinutes:0,maxAdvanceDays:3,crossDayStrategy:'REJECT',
      weeklyWindows:[{weekday:1,fulfillment:'PICKUP',startMinute:480,endMinute:1260,privateNote:'PRIVATE_SENTINEL'}],
      dateOverrides:[{serviceDate:'2026-10-14',fulfillment:'PICKUP',closed:true,windows:[],privateNote:'PRIVATE_SENTINEL'}]}};
  const entries=[],logger={info:e=>entries.push(e),warn:e=>entries.push(e),error:e=>entries.push(e)};
  let reads=0;
  const repository={async readSnapshot(){reads++;return {store,configuration};}};
  const main=createStoreCloudHandler({getContext:()=>context,settings,repository,logger,now:()=>2000});
  return {settings,context,store,configuration,entries,repository,main,reads:()=>reads};
}
const event={action:'get',payload:{storeId:'test-store'}};
test('store.get returns only published public fields; health remains available with get disabled',async()=>{
  const f=setup(),r=await f.main(event);
  assert.equal(r.ok,true);assert.equal(r.data.apiVersion,'v1-api-2026-10-03');assert.equal(r.data.storeId,'test-store');
  assert.deepEqual(r.data.businessHours,[{weekday:1,fulfillment:'PICKUP',startMinute:480,endMinute:1260}]);
  assert.deepEqual(r.data.dateOverrides,[{serviceDate:'2026-10-14',fulfillment:'PICKUP',closed:true,windows:[]}]);
  assert.equal(r.data.delivery.feeCents,0);
  const text=JSON.stringify([r,f.entries]);for(const value of ['PRIVATE_SENTINEL','native-owner','test-config','privateCounts'])assert(!text.includes(value));
  f.settings.enabled=false;
  const health=await f.main({action:'health'});assert.equal(health.ok,true);assert.deepEqual(health.data,{available:true,stage:'development',environment:'test-store-env'});
  assert.equal((await f.main(event)).error.code,'CONFIGURATION_REQUIRED');assert.equal(f.reads(),1);
});
test('store.get rejects native scope, forged input, cross-store requests and unsupported actions before database access',async()=>{
  for(const [patch,code] of [[{OPENID:null},'AUTH_REQUIRED'],[{APPID:'other'},'APP_MISMATCH'],[{ENV:'other'},'ENV_MISMATCH']]){
    const f=setup();Object.assign(f.context,patch);assert.equal((await f.main(event)).error.code,code);assert.equal(f.reads(),0);
  }
  for(const [request,code] of [[{...event,openid:'forged'},'INVALID_REQUEST'],[{action:'get',payload:{storeId:'test-store',role:'admin'}},'INVALID_REQUEST'],
    [{action:'get',payload:{storeId:'other-store'}},'NOT_FOUND'],[{action:'get'},'INVALID_REQUEST'],[{action:'slots.list',payload:{}},'INVALID_REQUEST']]){
    const f=setup();assert.equal((await f.main(request)).error.code,code);assert.equal(f.reads(),0);
  }
});
test('store.get fails closed for absent, draft, closed, mismatched, unpublished, future and incomplete configuration',async()=>{
  const changes=[f=>{f.repository.readSnapshot=async()=>({store:null});},f=>{f.store.status='DRAFT';},f=>{f.store.status='CLOSED';},
    f=>{f.configuration.storeId='other';},f=>{f.configuration.status='DRAFT';},f=>{f.configuration.publishedAt=3000;},
    f=>{f.configuration.timePolicy.minLeadTimeMinutes=null;},f=>{f.store.phone=null;},f=>{f.configuration._id='other';}];
  for(const change of changes){const f=setup();change(f);const r=await f.main(event);assert.equal(r.ok,false);assert(['NOT_FOUND','CONFIGURATION_REQUIRED'].includes(r.error.code));}
  const f=setup();f.repository.readSnapshot=async()=>{throw new Error('PRIVATE_SENTINEL');};
  const r=await f.main(event);assert.equal(r.error.code,'INTERNAL_ERROR');assert(!JSON.stringify([r,f.entries]).includes('PRIVATE_SENTINEL'));
});
test('store SDK repository reads two exact IDs in one bounded transaction without writes',async()=>{
  const f=setup(),queries=[];let transactions=0;
  const database={async runTransaction(fn,retries){transactions++;assert.equal(retries,2);return fn({collection(name){return {
    where(filter){assert.deepEqual(filter,{_id:name==='stores'?'test-store':'test-config'});queries.push(name);return this;},
    limit(n){assert.equal(n,2);return this;},async get(){return {data:[name==='stores'?f.store:f.configuration]};}
  };}});}};
  const r=await createCloudStoreRepository(database,'test-store').readSnapshot();assert.equal(r.configuration,f.configuration);
  assert.equal(transactions,1);assert.deepEqual(queries,['stores','store_config']);
  f.store.activeConfigId=null;queries.length=0;const missing=await createCloudStoreRepository(database,'test-store').readSnapshot();
  assert.equal(missing.configuration,null);assert.deepEqual(queries,['stores']);
});
test('store SDK repository rejects duplicate, wrong-ID, oversized and malformed provider responses',async()=>{
  const rows=[[{_id:'test-store'},{_id:'test-store'}],[{_id:'other'}],[{_id:'test-store',value:'x'.repeat(65536)}],null];
  for(const data of rows){const database={runTransaction:fn=>fn({collection:()=>({where(){return this;},limit(){return this;},get:async()=>({data})})})};
    await assert.rejects(createCloudStoreRepository(database,'test-store').readSnapshot());}
});
test('cloud client transports store.get to the configured environment and preserves unsupported slots boundary',async()=>{
  const calls=[],client=createClient({mode:'cloud',stage:'development',store:{enabled:true},cloudEnvironments:{development:'test-store-env'}},()=>({cloud:{init(){},
    async callFunction(request){calls.push(request);return {result:{ok:true,requestId:'test-trace',data:{apiVersion:'test'}}};}}}),{info(){},warn(){}});
  await client.call('store','get',{storeId:'test-store'});assert.equal(calls[0].config.env,'test-store-env');
  assert.equal(calls[0].data.action,'get');assert.deepEqual(calls[0].data.payload,{storeId:'test-store'});assert.match(calls[0].data.requestId,/^client-/);
  await assert.rejects(client.call('store','slots.list',{}),e=>e.code==='INVALID_REQUEST');
});
test('store client is disabled by default and does not reach the platform',async()=>{
  let calls=0;const client=createClient({mode:'cloud',stage:'development',cloudEnvironments:{development:'test-store-env'}},()=>{
    calls++;throw new Error('UNREACHABLE');
  },{warn(){}});
  await assert.rejects(client.call('store','get',{storeId:'test-store'}),e=>e.code==='CLOUD_NOT_CONFIGURED');assert.equal(calls,0);
});
test('store deploy package is self-contained and matches its shared source',()=>{
  const root=path.resolve(__dirname,'../cloudfunctions/store/shared');
  for(const name of ['runtime','native-context','store-cloud-handler','store-fulfillment','fulfillment-model','resource-model','authorization-model','trade-model','idempotency-model','api-contract']){
    assert.equal(fs.readFileSync(path.join(root,name+'.js'),'utf8').replace(/\r\n/g,'\n'),fs.readFileSync(path.resolve(root,'../../_shared',name+'.js'),'utf8').replace(/\r\n/g,'\n'));
  }
  require('../cloudfunctions/store/shared/store-cloud-handler');
});
