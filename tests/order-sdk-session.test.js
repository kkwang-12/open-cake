'use strict';
// SDK-shaped execution/rollback checks. Actual cloud acceptance is separate.
const test=require('node:test');
const assert=require('node:assert/strict');
const {setup}=require('./fixtures/order-transaction');
const {createSdkOrderService,orderDocumentIdFromNumber}=require('../cloudfunctions/_shared/order-sdk-session');
const {messageFingerprint}=require('../cloudfunctions/_shared/catalog-model');
const {scopedDocumentId}=require('../cloudfunctions/_shared/idempotency-model');
const policy={maxOperations:100,maxReadDocuments:80,maxWrites:80,maxPayloadBytes:65536,
  maxTotalPayloadBytes:1048576,maxAttempts:3,maxDurationMs:15000};
function harness(mode='PICKUP',limits={},lineCount=1){
  const source=setup(),additionalLines=[];
  if(lineCount>1){
    source.base.context.limits.maxLines=60;
    // Synthetic capacity only, to test the 60-line transport budget independently.
    for(const stock of Object.values(source.db.stocks))stock.totalUnits=100;
    for(let i=1;i<lineCount;i++){
      const line=structuredClone(source.base.state.cart.lines[0]);
      Object.assign(line,{lineId:'budget-line-'+i,quantity:1,cakeMessage:'测试'+i});
      line.messageFingerprint=messageFingerprint(line.cakeMessage,line.normalizationVersion);
      additionalLines.push(line);
    }
  }
  const quote=source.makeQuote({mode,additionalLines});
  const tableNames={users:'users',stores:'stores',configs:'store_config',carts:'carts',addresses:'addresses',
    stocks:'inventory_resources',slots:'slot_inventory',quotes:'checkout_quotes',orders:'orders',
    items:'order_items',reservations:'reservations',logs:'order_logs',receipts:'idempotency_records'};
  let records={};
  for(const [table,name]of Object.entries(tableNames))records[name]=structuredClone(source.db[table]);
  records.products={};records.skus={};
  for(const row of source.db.catalogs){records.products[row.product._id]=structuredClone(row.product);
    for(const sku of row.skus)records.skus[sku._id]=structuredClone(sku);}
  records.users[quote.customer.subjectId].openId='A';
  const settings={appId:quote.customer.appId,environment:quote.customer.environment,stage:'development'};
  const native={APPID:settings.appId,ENV:settings.environment,OPENID:'A'};
  const controls={failAt:0,zeroAt:0,beforeWrite:null,contextRead:null,clock:1000,attempts:0,
    writes:0,reads:0,calls:[],maxRetries:null};
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const conflict=()=>Object.assign(new Error('DATABASE_TRANSACTION_CONFLICT'),{code:'DATABASE_TRANSACTION_CONFLICT'});
  const cloud={database:()=>({runTransaction:async(work,maxRetries)=>{
    controls.maxRetries=maxRetries;
    for(let attempt=0;;attempt++){
      controls.attempts++;controls.writes=0;controls.reads=0;controls.calls=[];
      const baseline=structuredClone(records),staged=structuredClone(records);
      const before=(collection,id,payload)=>{
        controls.writes++;controls.beforeWrite?.({records,collection,id,payload,attempt});
        if(controls.writes===controls.failAt)throw new Error('injected-write-failure');
        if(!same(records[collection]?.[id]??null,baseline[collection]?.[id]??null))throw conflict();
        return controls.writes!==controls.zeroAt;
      };
      const tx={collection:collection=>({doc:id=>({
        get:async()=>{controls.reads++;controls.calls.push([collection,id]);return {data:structuredClone(staged[collection]?.[id]??null)};},
        update:async({data})=>{
          if(!before(collection,id,data))return {stats:{updated:0}};
          staged[collection][id]={...staged[collection][id],...structuredClone(data)};
          return {stats:{updated:1}};
        }
      }),add:async({data})=>{
        if(!before(collection,data._id,data))return {_id:'wrong'};
        if(staged[collection]?.[data._id])throw Object.assign(new Error('duplicate'),{code:'DATABASE_DUPLICATE_WRITE'});
        staged[collection]||={};staged[collection][data._id]=structuredClone(data);return {_id:data._id};
      },where(){throw new Error('No transaction queries allowed');}})};
      try{const result=await work(tx);records=staged;return result;}
      catch(error){if(error.code==='DATABASE_TRANSACTION_CONFLICT'&&attempt<maxRetries)continue;throw error;}
    }
  }})};
  const create=(extra={})=>createSdkOrderService({cloud,settings,limits:{...policy,...limits},
    clock:()=>controls.clock,now:()=>source.controls.now,newRequestId:()=>'sdk-provider-test',
    buildContext:async tx=>{
      if(controls.contextRead)await tx.readContextDocument(...controls.contextRead);
      return {...source.base.context,verifyLocation:()=>true}; // Isolated fixture only.
    },...extra});
  const service=create();
  return {source,quote,settings,native,controls,create,records:()=>records,
    execute:()=>service.execute(quote.event,native)};
}

test('SDK pickup/delivery writes all order records and protects dependencies without changing business versions',async()=>{
  for(const mode of ['PICKUP','DELIVERY']){
    const h=harness(mode),before=structuredClone(h.records()),result=await h.execute(),data=h.records();
    assert.equal(result.disposition,'CREATED');assert.equal(Object.keys(data.orders).length,1);
    assert.equal(Object.keys(data.reservations).length,2);assert.equal(Object.keys(data.idempotency_records).length,1);
    for(const collection of ['users','stores','store_config','carts','products','skus']){
      for(const [id,row]of Object.entries(data[collection])){
        assert.deepEqual(row,{...before[collection][id],_transactionFence:1});
      }
    }
    assert.equal(data.checkout_quotes[h.quote.quoteId].status,'CONSUMED');
    assert.equal(data.checkout_quotes[h.quote.quoteId]._transactionFence,1);
    assert.equal(h.controls.writes,mode==='PICKUP'?18:19);
    assert.equal(h.controls.reads,mode==='PICKUP'?11:12);
    assert.equal(h.controls.maxRetries,2);
    assert.equal(h.controls.calls.some(([name,id])=>name==='orders'&&id===result.result.entityId),true);
  }
});

test('SDK same-key replay changes only internal protection counters',async()=>{
  const h=harness(),first=await h.execute(),before=structuredClone(h.records()),result=await h.execute();
  assert.equal(result.disposition,'REPLAY');assert.deepEqual(result.result,first.result);
  assert.equal(h.controls.writes,3);
  for(const [collection,rows]of Object.entries(h.records()))for(const [id,row]of Object.entries(rows)){
    const old=before[collection][id];
    if(['users','orders','idempotency_records'].includes(collection))
      assert.deepEqual(row,{...old,_transactionFence:(old._transactionFence??0)+1});
    else assert.deepEqual(row,old);
  }
});

test('SDK every protection/business write failure or zero-row update rolls back the entire order',async()=>{
  for(const kind of ['failAt','zeroAt'])for(let position=1;position<=18;position++){
    const h=harness(),before=structuredClone(h.records());h.controls[kind]=position;
    await assert.rejects(h.execute());assert.deepEqual(h.records(),before,kind+' '+position);
  }
});

test('SDK rejects operation/write/payload budgets before the first fence write',async()=>{
  for(const limits of [{maxOperations:28,maxReadDocuments:28,maxWrites:28},
    {maxWrites:17},{maxReadDocuments:3},{maxPayloadBytes:1},{maxTotalPayloadBytes:20000,maxPayloadBytes:20000}]){
    const h=harness('PICKUP',limits),before=structuredClone(h.records());
    if(limits.maxTotalPayloadBytes)h.records().carts[Object.keys(h.records().carts)[0]].largeInternalField='x'.repeat(21000);
    await assert.rejects(h.execute(),{code:limits.maxReadDocuments===3?'ORDER_READ_BUDGET_EXCEEDED':'ORDER_SDK_BUDGET_EXCEEDED'});
    assert.equal(h.controls.writes,0);
    if(!limits.maxTotalPayloadBytes)assert.deepEqual(h.records(),before);
  }
});

test('SDK reauthorizes a disabled user on transaction retry and discards the first attempt',async()=>{
  const h=harness();let changed=false;
  h.controls.beforeWrite=({records,collection,id})=>{if(!changed&&collection==='users'){
    changed=true;records.users[id].status='DISABLED';records.users[id].version++;
  }};
  await assert.rejects(h.execute(),{code:'USER_DISABLED'});
  assert.equal(h.controls.attempts,2);assert.equal(Object.keys(h.records().orders).length,0);
  assert.equal(Object.hasOwn(h.records().stores['offline-store'],'_transactionFence'),false);
});

test('SDK a catalog edit during protection retries with fresh data and refuses the stale quote',async()=>{
  const h=harness();let changed=false;
  h.controls.beforeWrite=({records,collection,id})=>{if(!changed&&collection==='products'){
    changed=true;records.products[id].version++;
  }};
  await assert.rejects(h.execute(),{code:'QUOTE_CHANGED'});
  assert.equal(h.controls.attempts,2);assert.equal(Object.keys(h.records().orders).length,0);
});

test('SDK includes transaction-loaded image/location proof documents in protection',async()=>{
  const h=harness();h.records().location_verifications={proof:{_id:'proof',version:1}};
  h.controls.contextRead=['location_verifications','proof'];await h.execute();
  assert.deepEqual(h.records().location_verifications.proof,{_id:'proof',version:1,_transactionFence:1});
});

test('SDK invalid/overflowing protection counters and elapsed deadline refuse all writes',async()=>{
  for(const fence of [null,-1,'0',Number.MAX_SAFE_INTEGER]){
    const h=harness();h.records().users[h.quote.customer.subjectId]._transactionFence=fence;
    await assert.rejects(h.execute(),{code:'INVALID_TRANSACTION_FENCE'});assert.equal(h.controls.writes,0);
  }
  const h=harness();let calls=0;
  await assert.rejects(h.create({clock:()=>++calls===1?1000:20000}).execute(h.quote.event,h.native),
    {code:'ORDER_SDK_TIME_EXCEEDED'});assert.equal(h.controls.writes,0);
});

test('SDK strict order-number reversal and replay reject malformed/corrupt mappings',async()=>{
  assert.equal(orderDocumentIdFromNumber('V1-'+'AB'.repeat(32)),'ab'.repeat(32));
  for(const number of ['V1-ABC','V1-'+'ab'.repeat(32),'V1-'+'G'.repeat(64),'V1-'+'A'.repeat(65)])
    assert.throws(()=>orderDocumentIdFromNumber(number),{code:'INVALID_ORDER_DOCUMENT'});
  const h=harness(),first=await h.execute();h.records().orders[first.result.entityId].orderNo='V1-WRONG';
  await assert.rejects(h.execute(),{code:'INVALID_IDEMPOTENCY_RECORD'});assert.equal(h.controls.writes,0);
});

test('SDK foreign quote rejects before loading private reference chains; limits cannot be unlimited',async()=>{
  const h=harness();h.records().checkout_quotes[h.quote.quoteId].ownerId='another-owner';
  await assert.rejects(h.execute(),{code:'FORBIDDEN'});assert.equal(h.controls.writes,0);
  assert.deepEqual(h.controls.calls.map(([name])=>name),['users','idempotency_records','checkout_quotes']);
  for(const limits of [null,{...policy,maxOperations:101},{...policy,maxAttempts:4},{...policy,maxWrites:0}])
    assert.throws(()=>h.create({limits}),{code:'INVALID_ORDER_SDK_LIMITS'});
});

test('SDK explicit child insertion rejects an existing reservation and rolls back all protection/business writes',async()=>{
  const h=harness(),p=h.quote.customer;
  const orderId=scopedDocumentId('order',[p.environment,p.subjectId,'ORDER_CREATE',h.quote.event.payload.idempotencyKey]);
  const stockId=Object.keys(h.records().inventory_resources)[0];
  const id=scopedDocumentId('reservation',[p.environment,orderId,'STOCK',stockId]);
  h.records().reservations[id]={_id:id,marker:'preserve-existing'};
  const before=structuredClone(h.records());
  await assert.rejects(h.execute(),{code:'CLOUD_UNIQUE_CONFLICT'});assert.deepEqual(h.records(),before);
  assert.equal(h.controls.calls.some(([name])=>name==='reservations'),false);
});

test('SDK 60-line synthetic order counts child adds once and remains below 100 operations',async()=>{
  const h=harness('PICKUP',{},60),result=await h.execute();
  assert.equal(result.disposition,'CREATED');assert.equal(Object.keys(h.records().order_items).length,60);
  assert.equal(h.controls.reads,11);assert.equal(h.controls.writes,77);
  assert.equal(h.controls.reads+h.controls.writes,88);
});


test('SDK fixed store rejects both creation and replay before any protection or business writes',async()=>{
  const h=harness(),initial=structuredClone(h.records());
  const wrong=h.create({settings:{...h.settings,storeId:'other-store'}});
  await assert.rejects(wrong.execute(h.quote.event,h.native),{code:'NOT_FOUND'});
  assert.equal(h.controls.writes,0);assert.deepEqual(h.records(),initial);
  await h.execute();const created=structuredClone(h.records());
  await assert.rejects(wrong.execute(h.quote.event,h.native),{code:'NOT_FOUND'});
  assert.equal(h.controls.writes,0);assert.deepEqual(h.records(),created);
});
