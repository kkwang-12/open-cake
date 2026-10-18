'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createStoreCloudHandler,createCloudStoreRepository}=require('../cloudfunctions/_shared/store-cloud-handler');
const {V1_FULFILLMENT_POLICY,buildSlotDefinitions}=require('../cloudfunctions/_shared/fulfillment-model');
const {createClient}=require('../miniprogram/services/cloud');
const {requestFingerprint,scopedDocumentId}=require('../cloudfunctions/_shared/idempotency-model');
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
function proofSetup(){
  const f=setup();Object.assign(f.store,{schemaVersion:1,status:'DRAFT',updatedAt:1500,
    location:{longitude:117.288694,latitude:31.149852,coordinateSystem:'GCJ02',source:'TENCENT_POI:12345678',verifiedAt:1000}});
  const fingerprint=requestFingerprint(f.store.location);
  const proof={_id:scopedDocumentId('store-location-proof',[f.settings.appId,f.settings.environment,f.store._id,String(f.store.version),fingerprint]),
    schemaVersion:1,version:0,createdAt:1500,updatedAt:1500,appId:f.settings.appId,environment:f.settings.environment,
    entityKind:'STORE',entityId:f.store._id,entityVersion:f.store.version,locationFingerprint:fingerprint,
    sourceKind:'TENCENT_POI_OWNER_CONFIRMED',sourceRef:'12345678',verifiedAt:1000,status:'ACTIVE'};
  Object.assign(f.settings,{locationProofEnabled:true,locationProofId:proof._id});let reads=0;
  f.repository.readLocationSnapshot=async id=>{assert.equal(id,proof._id);reads++;return {store:f.store,proof};};
  return {...f,proof,proofReads:()=>reads};
}
test('store.health verifies a private native store binding without publishing the draft or opening store.get',async()=>{
  const f=proofSetup();f.settings.enabled=false;
  const r=await f.main({action:'health',payload:{},userInfo:{openId:'FORGED'},tcbContext:{OPENID:'FORGED'}});
  assert.equal(r.ok,true);assert.deepEqual(r.data,{available:true,stage:'development',environment:f.settings.environment,storeLocationVerified:true});
  assert.equal(f.proofReads(),1);assert.equal(f.store.status,'DRAFT');
  assert.equal((await f.main(event)).error.code,'CONFIGURATION_REQUIRED');
  const output=JSON.stringify([r,f.entries]);
  for(const value of [f.proof._id,f.proof.locationFingerprint,'12345678','117.288694','FORGED','native-owner','PRIVATE_SENTINEL'])assert(!output.includes(value));
  f.settings.locationProofEnabled=false;f.repository.readLocationSnapshot=()=>{throw Error('UNREACHABLE');};
  assert.equal((await f.main({action:'health'})).data.storeLocationVerified,undefined);
});
test('store.health rejects missing, stale, cross-scope, altered and future location proofs',async()=>{
  const mutations=[f=>f.proof=null,f=>f.settings.locationProofId='wrong',f=>f.store.version++,f=>f.store.location.latitude+=0.001,
    f=>f.store.location.coordinateSystem='WGS84',f=>f.store.location.source='CLIENT_CLAIMED',f=>f.store.location.verifiedAt++,
    f=>f.store.updatedAt=3000,f=>f.proof.environment='other',f=>f.proof.appId='other',f=>f.proof.entityId='other',
    f=>f.proof.entityKind='ADDRESS',f=>f.proof.status='REVOKED',f=>f.proof.version++,f=>f.proof.updatedAt++,
    f=>f.proof.createdAt=f.proof.updatedAt=3000,f=>f.proof.sourceRef='other',f=>f.proof.locationFingerprint='0'.repeat(64),
    f=>f.proof.verifiedAt++,f=>f.proof.extra='PRIVATE_SENTINEL'];
  for(const change of mutations){const f=proofSetup();change(f);
    f.repository.readLocationSnapshot=async()=>({store:f.store,proof:f.proof});
    const r=await f.main({action:'health'});assert.equal(r.ok,false);assert.equal(r.error.code,'CONFIGURATION_REQUIRED');
    assert(!JSON.stringify([r,f.entries]).includes('PRIVATE_SENTINEL'));
  }
});
test('store.health validates native identity and rejects caller proof fields before any private reads',async()=>{
  for(const [patch,code]of [[{OPENID:null},'AUTH_REQUIRED'],[{APPID:'other'},'APP_MISMATCH'],[{ENV:'other'},'ENV_MISMATCH']]){
    const f=proofSetup();Object.assign(f.context,patch);assert.equal((await f.main({action:'health',userInfo:{openId:'FORGED'}})).error.code,code);assert.equal(f.proofReads(),0);
  }
  for(const extra of [{proofId:'caller-path'},{location:{latitude:1}},{role:'admin'},{payload:{storeId:'other'}}]){
    const f=proofSetup();assert.equal((await f.main({action:'health',...extra})).error.code,'INVALID_REQUEST');assert.equal(f.proofReads(),0);
  }
});
test('store location SDK lookup reads only the two configured IDs in one read-only snapshot, with bounded retry',async()=>{
  const f=proofSetup(),calls=[];let snapshots=0;
  const database={runTransaction:async(fn,retries)=>{assert.equal(retries,2);snapshots++;return fn({collection(name){return {
    where(filter){assert.deepEqual(filter,{_id:name==='stores'?f.store._id:f.proof._id});calls.push(name);return this;},
    limit(n){assert.equal(n,2);return this;},get:async()=>({data:[name==='stores'?f.store:f.proof]})
  };}});}};
  const repository=createCloudStoreRepository(database,f.store._id);
  assert.equal((await repository.readLocationSnapshot(f.proof._id)).proof,f.proof);
  assert.equal(snapshots,1);assert.deepEqual(calls,['stores','location_verifications']);
  await assert.rejects(repository.readLocationSnapshot('../caller-path'));assert.equal(snapshots,1);
});
test('store location SDK proof lookup rejects duplicate and oversized proof rows',async()=>{
  for(const oversized of [false,true]){
    const f=proofSetup();const database={runTransaction:fn=>fn({collection:name=>({where(){return this;},limit(){return this;},
      get:async()=>({data:name==='stores'?[f.store]:oversized?[{...f.proof,extra:'x'.repeat(65536)}]:[f.proof,f.proof]})})})};
    await assert.rejects(createCloudStoreRepository(database,f.store._id).readLocationSnapshot(f.proof._id));
  }
});
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

test('store transport accepts injected metadata without trusting its identity or bypassing the disabled gate',async()=>{
  const injected={...event,userInfo:{openId:'forged-owner',appId:'other'},tcbContext:{OPENID:'forged-owner',APPID:'other',ENV:'other'}};
  const f=setup(),result=await f.main(injected);
  assert.equal(result.ok,true);assert.equal(f.reads(),1);
  assert(!JSON.stringify([result,f.entries]).includes('forged-owner'));
  f.settings.enabled=false;
  assert.equal((await f.main(injected)).error.code,'CONFIGURATION_REQUIRED');assert.equal(f.reads(),1);
  for(const [patch,code] of [[{OPENID:null},'AUTH_REQUIRED'],[{APPID:'other'},'APP_MISMATCH'],[{ENV:'other'},'ENV_MISMATCH']]){
    const denied=setup();Object.assign(denied.context,patch);
    assert.equal((await denied.main(injected)).error.code,code);assert.equal(denied.reads(),0);
  }
});

test('store transport still rejects extra business fields, nested metadata and cross-store targets',async()=>{
  const metadata={userInfo:{openId:'forged-owner'},tcbContext:{OPENID:'forged-owner'}};
  const cases=[
    [{...event,...metadata,role:'admin'},'INVALID_REQUEST'],
    [{...event,...metadata,openid:'forged-owner'},'INVALID_REQUEST'],
    [{...metadata,action:'get',payload:{...event.payload,userInfo:{openId:'forged-owner'}}},'INVALID_REQUEST'],
    [{...metadata,action:'get',payload:{...event.payload,tcbContext:{OPENID:'forged-owner'}}},'INVALID_REQUEST'],
    [{...metadata,action:'get',payload:{storeId:'other-store'}},'NOT_FOUND']
  ];
  for(const [request,code]of cases){const f=setup();assert.equal((await f.main(request)).error.code,code);assert.equal(f.reads(),0);}
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
test('cloud client transports store.get and slots.list to the configured environment',async()=>{
  const calls=[],client=createClient({mode:'cloud',stage:'development',store:{enabled:true},cloudEnvironments:{development:'test-store-env'}},()=>({cloud:{init(){},
    async callFunction(request){calls.push(request);return {result:{ok:true,requestId:'test-trace',data:{apiVersion:'test'}}};}}}),{info(){},warn(){}});
  await client.call('store','get',{storeId:'test-store'});assert.equal(calls[0].config.env,'test-store-env');
  assert.equal(calls[0].data.action,'get');assert.deepEqual(calls[0].data.payload,{storeId:'test-store'});assert.match(calls[0].data.requestId,/^client-/);
  await client.call('store','slots.list',{storeId:'test-store',fulfillment:'PICKUP',serviceDate:'2026-10-19',productIds:['test-product']});
  assert.equal(calls[1].data.action,'slots.list');assert.equal(calls[1].config.env,'test-store-env');
});
test('store client is disabled by default and does not reach the platform',async()=>{
  let calls=0;const client=createClient({mode:'cloud',stage:'development',cloudEnvironments:{development:'test-store-env'}},()=>{
    calls++;throw new Error('UNREACHABLE');
  },{warn(){}});
  await assert.rejects(client.call('store','get',{storeId:'test-store'}),e=>e.code==='CLOUD_NOT_CONFIGURED');assert.equal(calls,0);
  await assert.rejects(client.call('store','slots.list',{}),e=>e.code==='CLOUD_NOT_CONFIGURED');assert.equal(calls,0);
});
test('store deploy package is self-contained and matches its shared source',()=>{
  const root=path.resolve(__dirname,'../cloudfunctions/store/shared');
  for(const name of ['runtime','native-context','store-cloud-handler','store-fulfillment','fulfillment-model','resource-model','authorization-model','trade-model','idempotency-model','api-contract']){
    assert.equal(fs.readFileSync(path.join(root,name+'.js'),'utf8').replace(/\r\n/g,'\n'),fs.readFileSync(path.resolve(root,'../../_shared',name+'.js'),'utf8').replace(/\r\n/g,'\n'));
  }
  require('../cloudfunctions/store/shared/store-cloud-handler');
});

function slotSetup(){
  const f=setup(),at=Date.parse('2026-10-19T00:15:00Z'),serviceDate='2026-10-19',queries=[];
  f.configuration.timePolicy.weeklyWindows=Array.from({length:7},(_,i)=>['PICKUP','DELIVERY'].map(fulfillment=>({weekday:i+1,fulfillment,startMinute:480,endMinute:1260}))).flat();
  const products=[{_id:'test-product-a',storeId:f.store._id,status:'ON_SALE',minLeadTimeMinutes:30,privateNote:'PRIVATE_SENTINEL'},
    {_id:'test-product-b',storeId:f.store._id,status:'ON_SALE',minLeadTimeMinutes:90}];
  const slots=['PICKUP','DELIVERY'].flatMap(fulfillment=>buildSlotDefinitions({store:f.store,environment:f.settings.environment,now:at,
    fulfillment,serviceDate,timePolicy:f.configuration.timePolicy,productLeadTimes:[0]}).map(({minLeadTimeMinutes,...definition})=>({
      ...definition,version:0,status:'OPEN',heldUnits:0,confirmedUnits:0,consumedUnits:0,privateNote:'PRIVATE_SENTINEL',_transactionFence:5})));
  let transactions=0;
  const database={runTransaction:async(fn,retries)=>{assert.equal(retries,2);transactions++;return fn({collection:name=>({
    where(filter){assert.deepEqual(Object.keys(filter),['_id']);this.filter=filter;return this;},limit(n){assert.equal(n,2);return this;},
    async get(){queries.push([name,this.filter._id]);const rows={stores:[f.store],store_config:[f.configuration],products,slot_inventory:slots}[name];
      assert(rows,'unexpected collection');return {data:structuredClone(rows.filter(row=>row&&row._id===this.filter._id))};}
  })});}};
  const repository=createCloudStoreRepository(database,f.settings.storeId);
  const main=createStoreCloudHandler({getContext:()=>f.context,settings:f.settings,repository,logger:{info(){},warn(){},error(){}},now:()=>at});
  const request={action:'slots.list',payload:{storeId:f.store._id,fulfillment:'PICKUP',serviceDate,productIds:products.map(p=>p._id)}};
  return {...f,at,products,slots,queries,main,request,transactions:()=>transactions};
}

test('store.slots.list reads a native, published, same-store snapshot and applies the longest product lead time',async()=>{
  for(const mode of ['PICKUP','DELIVERY']){
    const f=slotSetup();f.request.payload.fulfillment=mode;const before=structuredClone([f.store,f.configuration,f.products,f.slots]);
    const result=await f.main({...f.request,userInfo:{OPENID:'FORGED'},tcbContext:{APPID:'FORGED'}});
    assert.equal(result.ok,true);assert.equal(result.data.items.length,22);assert.equal(f.transactions(),1);
    assert.equal(result.data.items[0].startAt,Date.parse('2026-10-19T02:00:00Z'));
    assert.deepEqual(Object.keys(result.data).sort(),['apiVersion','fulfillment','items','serviceDate','storeId','timeZone']);
    for(const row of result.data.items){assert.deepEqual(Object.keys(row).sort(),['available','endAt','slotId','startAt','windowNature']);
      assert.equal(row.available,true);assert.equal(row.windowNature,mode==='DELIVERY'?'ESTIMATED':'PICKUP');}
    assert.equal(f.queries.length,26);assert.deepEqual([f.store,f.configuration,f.products,f.slots],before);
    assert(!JSON.stringify(result).includes('PRIVATE_SENTINEL'));assert(!JSON.stringify(result).includes('_transactionFence'));
  }
});

test('store.slots.list never advertises missing, full, closed or stale deterministic slot resources as selectable',async()=>{
  const f=slotSetup(),eligible=f.slots.filter(x=>x.fulfillment==='PICKUP'&&x.startAt>=Date.parse('2026-10-19T02:00:00Z'));
  eligible[0].heldUnits=eligible[0].capacityTotal;eligible[1].status='CLOSED';eligible[2].policyVersion='old-policy';
  eligible[3].storeId='other-store';const missing=eligible[4]._id;f.slots.splice(f.slots.findIndex(x=>x._id===missing),1);
  const result=await f.main(f.request);assert.equal(result.ok,true);
  assert.deepEqual(result.data.items.slice(0,5).map(x=>x.available),[false,false,false,false,false]);
  assert(result.data.items.slice(5).every(x=>x.available));
  const malformed=slotSetup();malformed.slots.find(x=>x.fulfillment==='PICKUP'&&x.startAt===eligible[0].startAt).heldUnits=-1;
  assert.equal((await malformed.main(malformed.request)).error.code,'CONFIGURATION_REQUIRED');
});

test('store.slots.list rejects native-scope violations, forged payloads, empty/duplicate/oversized selections and cross-store reads before DB access',async()=>{
  for(const [patch,code]of [[{OPENID:null},'AUTH_REQUIRED'],[{APPID:'other'},'APP_MISMATCH'],[{ENV:'other'},'ENV_MISMATCH']]){
    const f=slotSetup();Object.assign(f.context,patch);assert.equal((await f.main(f.request)).error.code,code);assert.equal(f.transactions(),0);
  }
  const changes=[p=>p.productIds=[],p=>p.productIds=['same','same'],p=>p.productIds=Array.from({length:61},(_,i)=>'product-'+i),
    p=>p.slotId='caller-path',p=>p.role='admin',p=>p.serviceDate='bad'];
  for(const change of changes){const f=slotSetup();change(f.request.payload);assert.equal((await f.main(f.request)).error.code,'INVALID_REQUEST');assert.equal(f.transactions(),0);}
  const f=slotSetup();f.request.payload.storeId='other-store';assert.equal((await f.main(f.request)).error.code,'NOT_FOUND');assert.equal(f.transactions(),0);
  const disabled=slotSetup();disabled.settings.enabled=false;assert.equal((await disabled.main(disabled.request)).error.code,'CONFIGURATION_REQUIRED');assert.equal(disabled.transactions(),0);
});

test('store.slots.list rejects unavailable products, missing lead times, unpublished configuration and out-of-window dates',async()=>{
  for(const change of [f=>f.products[0].status='OFF_SALE',f=>f.products[0].storeId='other',f=>f.products.splice(0,1)]){
    const f=slotSetup();change(f);assert.equal((await f.main(f.request)).error.code,'PRODUCT_UNAVAILABLE');assert(!f.queries.some(([name])=>name==='slot_inventory'));
  }
  for(const change of [f=>f.products[0].minLeadTimeMinutes=null,f=>f.configuration.publishedAt=f.at+1,f=>f.configuration.status='DRAFT']){
    const f=slotSetup();change(f);assert.equal((await f.main(f.request)).error.code,'CONFIGURATION_REQUIRED');assert(!f.queries.some(([name])=>name==='slot_inventory'));
  }
  for(const date of ['2026-10-18','2026-10-23']){const f=slotSetup();f.request.payload.serviceDate=date;
    assert.equal((await f.main(f.request)).error.code,'APPOINTMENT_UNAVAILABLE');assert(!f.queries.some(([name])=>name==='slot_inventory'));}
});

test('store.slots.list returns an empty closed-day list and the client forwards only the documented read action',async()=>{
  const f=slotSetup();f.configuration.timePolicy.dateOverrides.push({serviceDate:'2026-10-19',fulfillment:'PICKUP',closed:true,windows:[]});
  const result=await f.main(f.request);assert.equal(result.ok,true);assert.deepEqual(result.data.items,[]);assert.equal(f.queries.length,4);
  const calls=[];const client=createClient({stage:'development',mode:'cloud',store:{enabled:true},cloudEnvironments:{development:f.settings.environment}},()=>({cloud:{init(){},
    async callFunction(input){calls.push(input);return {result:{ok:true,requestId:'test-slots-trace',data:{items:[]}}};}}}));
  assert.deepEqual((await client.call('store','slots.list',f.request.payload)).data,{items:[]});
  assert.equal(calls[0].name,'store');assert.equal(calls[0].data.action,'slots.list');assert.deepEqual(calls[0].data.payload,f.request.payload);
  await assert.rejects(client.call('store','publish',{}));
});

test('store.health accepts only valid internal quote fences and keeps proof business fields strict',async()=>{
  for(const fence of [0,2,Number.MAX_SAFE_INTEGER]){
    const f=proofSetup();f.proof._transactionFence=fence;const before=structuredClone(f.proof);
    assert.equal((await f.main({action:'health'})).data.storeLocationVerified,true);assert.deepEqual(f.proof,before);
  }
  for(const fence of [-1,1.5,'2',null,Number.MAX_SAFE_INTEGER+1]){
    const f=proofSetup();f.proof._transactionFence=fence;assert.equal((await f.main({action:'health'})).error.code,'CONFIGURATION_REQUIRED');
  }
  const f=proofSetup();f.proof._transactionFence=2;f.proof.extra='PRIVATE_SENTINEL';
  assert.equal((await f.main({action:'health'})).error.code,'CONFIGURATION_REQUIRED');
});
