'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createCloudDocumentTransactionAdapter}=require('../cloudfunctions/_shared/cloud-document-transaction');
function harness(options={}) {
  let records=structuredClone(options.records || {}),databaseCalls=0,writes=0;
  const cloud={database:settings=>{
    databaseCalls++;
    assert.deepEqual(settings,{env:'offline-test-env',throwOnNotFound:false});
    return {runTransaction:async work=>{
      const staged=structuredClone(records);
      const result=await work({collection:name=>({
        doc:id=>({get:async()=>{
          if(options.readFailure)throw new Error('secret-provider-openid');
          if(options.badRead)return {data:[]};
          return {data:staged[name]?.[id] || null};
        },update:async({data})=>{
          writes++;
          if(options.zeroUpdate)return {stats:{updated:0}};
          staged[name][id]={...staged[name][id],...structuredClone(data)};
          return {stats:{updated:1}};
        }}),
        add:async({data})=>{
          writes++;
          staged[name]||={};
          staged[name][data._id]=structuredClone(data);
          if(options.badInsert)return {_id:'wrong'};
          return {_id:data._id};
        }
      })});
      if(options.commitFailure)throw new Error('secret-commit-failure');
      records=staged;
      return result;
    }};
  }};
  const adapter=createCloudDocumentTransactionAdapter({cloud,environment:'offline-test-env',
    collections:{probe_resources:['heldUnits'],probe_receipts:[]}});
  return {adapter,stats:()=>({records,databaseCalls,writes})};
}
const rejects=(work,code)=>assert.rejects(work,error=>error.code===code);
test('D04 SDK primitives read actual null shape and commit insert/update across collections',async()=>{
  const h=harness();
  await h.adapter.runTransaction(async tx=>{
    assert.equal(await tx.read('probe_resources','resource'),null);
    assert.equal(await tx.insert('probe_resources',{_id:'resource',version:0,heldUnits:0}),1);
    assert.equal(await tx.updateVersioned('probe_resources','resource',0,{heldUnits:1}),1);
    assert.equal(await tx.insert('probe_receipts',{_id:'receipt',version:0}),1);
  });
  assert.equal(h.stats().records.probe_resources.resource.version,1);
  assert.equal(h.stats().records.probe_resources.resource.heldUnits,1);
  assert.equal(h.stats().records.probe_receipts.receipt._id,'receipt');
});
test('D04 adapter rejects unknown collections and identity/version patches',async()=>{
  const h=harness({records:{probe_resources:{r:{_id:'r',version:0,heldUnits:0}}}});
  for(const [collection,patch] of [['users',{heldUnits:1}],['probe_resources',{ownerId:'other'}],
    ['probe_resources',{version:1}],['probe_resources',{heldUnits:1,openId:'forged'}]]) {
    await rejects(h.adapter.runTransaction(tx=>tx.updateVersioned(collection,'r',0,patch)),
      collection==='users'?'INVALID_TRANSACTION_DOCUMENT':'INVALID_TRANSACTION_UPDATE');
  }
  assert.equal(h.stats().writes,0);
});
test('D04 caller cannot expand mutable fields after constructing the adapter',async()=>{
  const fields=['heldUnits'];let updates=0;
  const cloud={database:()=>({runTransaction:work=>work({collection:()=>({doc:()=>({
    get:async()=>({data:{_id:'r',version:0}}),update:async()=>{updates++;return {stats:{updated:1}};}
  })})})})};
  const adapter=createCloudDocumentTransactionAdapter({cloud,environment:'offline-test-env',collections:{probe_resources:fields}});
  fields.push('ownerId');
  await rejects(adapter.runTransaction(tx=>tx.updateVersioned('probe_resources','r',0,{ownerId:'other'})), 'INVALID_TRANSACTION_UPDATE');
  assert.equal(updates,0);
});
test('D04 duplicate explicit id never overwrites; stale versions never update',async()=>{
  const h=harness({records:{probe_resources:{r:{_id:'r',version:2,heldUnits:1}}}});
  await rejects(h.adapter.runTransaction(tx=>tx.insert('probe_resources',{_id:'r',version:0})), 'DOCUMENT_ALREADY_EXISTS');
  await rejects(h.adapter.runTransaction(tx=>tx.updateVersioned('probe_resources','r',1,{heldUnits:2})), 'VERSION_CONFLICT');
  assert.equal(h.stats().writes,0);
  assert.equal(h.stats().records.probe_resources.r.version,2);
});
test('D04 missing transport error or malformed response is never interpreted as absence',async()=>{
  for(const options of [{readFailure:true},{badRead:true}]) {
    const h=harness(options);
    await rejects(h.adapter.runTransaction(tx=>tx.insert('probe_resources',{_id:'r',version:0})),
      options.readFailure?'CLOUD_DOCUMENT_OPERATION_FAILED':'INVALID_DATABASE_RESPONSE');
    assert.equal(h.stats().writes,0);
  }
});
test('D04 bad insertion receipt and zero-row update fail the whole callback',async()=>{
  const h=harness({badInsert:true});
  await rejects(h.adapter.runTransaction(tx=>tx.insert('probe_receipts',{_id:'r'})), 'INVALID_DATABASE_RESPONSE');
  assert.deepEqual(h.stats().records,{});
  const z=harness({zeroUpdate:true,records:{probe_resources:{r:{_id:'r',version:0,heldUnits:0}}}});
  await rejects(z.adapter.runTransaction(tx=>tx.updateVersioned('probe_resources','r',0,{heldUnits:1})), 'VERSION_CONFLICT');
  assert.equal(z.stats().records.probe_resources.r.heldUnits,0);
});
test('D04 callback failure and commit failure never return success or preserve staged writes',async()=>{
  const h=harness(); const fault=new Error('test-controlled-fault');
  await assert.rejects(h.adapter.runTransaction(async tx=>{
    await tx.insert('probe_receipts',{_id:'r'});throw fault;
  }),error=>error===fault);
  assert.deepEqual(h.stats().records,{});
  const c=harness({commitFailure:true});
  await rejects(c.adapter.runTransaction(tx=>tx.insert('probe_receipts',{_id:'r'})), 'CLOUD_TRANSACTION_FAILED');
  assert.deepEqual(c.stats().records,{});
});
test('D04 returned reads cannot mutate the cached SDK snapshot',async()=>{
  const h=harness({records:{probe_resources:{r:{_id:'r',version:0,nested:{value:1}}}}});
  await h.adapter.runTransaction(async tx=>{
    const first=await tx.read('probe_resources','r');first.nested.value=9;
    assert.equal((await tx.read('probe_resources','r')).nested.value,1);
  });
  assert.equal(h.stats().records.probe_resources.r.nested.value,1);
});
test('D04 provider failures expose only fixed adapter codes',async()=>{
  const h=harness({readFailure:true});
  await assert.rejects(h.adapter.runTransaction(tx=>tx.read('probe_resources','r')),error=>{
    assert.equal(error.message,'CLOUD_DOCUMENT_OPERATION_FAILED');
    assert.equal(JSON.stringify(error).includes('secret-provider'),false);return true;
  });
});
test('D04 only an explicit official duplicate marker is normalized as unique conflict',async()=>{
  const cloud={database:()=>({runTransaction:work=>work({collection:()=>({
    doc:()=>({get:async()=>({data:null})}),
    add:async()=>{throw Object.assign(new Error('private-index-value'),{code:'DATABASE_DUPLICATE_WRITE'});}
  })})})};
  const adapter=createCloudDocumentTransactionAdapter({cloud,environment:'offline-test-env',collections:{probe:[]}});
  await rejects(adapter.runTransaction(tx=>tx.insert('probe',{_id:'r'})), 'CLOUD_UNIQUE_CONFLICT');
});
test('D04 a unique conflict reported at SDK commit is also classified without exposing provider text',async()=>{
  const cloud={database:()=>({runTransaction:async work=>{
    await work({collection:()=>({doc:()=>({get:async()=>({data:null})}),add:async({data})=>({_id:data._id})})});
    throw Object.assign(new Error('private-commit-unique'),{code:'DATABASE_DUPLICATE_WRITE'});
  }})};
  const adapter=createCloudDocumentTransactionAdapter({cloud,environment:'offline-test-env',collections:{probe:[]}});
  await rejects(adapter.runTransaction(tx=>tx.insert('probe',{_id:'r'})), 'CLOUD_UNIQUE_CONFLICT');
});

test('D04 operation conflict reaches SDK retry and each attempt rereads current resources',async()=>{
  let attempts=0,reads=0,updates=0;
  const cloud={database:()=>({runTransaction:async work=>{
    // Same retry discriminator as the installed SDK, without treating every
    // thrown error as retryable. The first attempt loses to another writer.
    for(let i=0;i<2;i++) {
      attempts++;
      try{return await work({collection:()=>({doc:()=>({
        get:async()=>{reads++;return {data:{_id:'r',version:i,heldUnits:i}};},
        update:async()=>{updates++;if(i===0)throw {code:'DATABASE_TRANSACTION_CONFLICT',message:'private-provider'};
          return {stats:{updated:1}};}
      })})});}catch(error){if(error.code!=='DATABASE_TRANSACTION_CONFLICT' || i===1)throw error;}
    }
  }})};
  const adapter=createCloudDocumentTransactionAdapter({cloud,environment:'offline-test-env',collections:{probe:['heldUnits']}});
  const result=await adapter.runTransaction(async tx=>{
    const resource=await tx.read('probe','r');
    if(resource.heldUnits===1)return 'RESOURCE_UNAVAILABLE';
    await tx.updateVersioned('probe','r',resource.version,{heldUnits:1});return 'HELD';
  });
  assert.equal(result,'RESOURCE_UNAVAILABLE');assert.equal(attempts,2);assert.equal(reads,2);assert.equal(updates,1);
});

test('D04 exhausted SDK conflict is sanitized rather than leaked as a callback error',async()=>{
  const cloud={database:()=>({runTransaction:work=>work({collection:()=>({doc:()=>({
    get:async()=>{throw Object.assign(new Error('private-provider'),{code:'DATABASE_TRANSACTION_CONFLICT'});}
  })})})})};
  const adapter=createCloudDocumentTransactionAdapter({cloud,environment:'offline-test-env',collections:{probe:[]}});
  await assert.rejects(adapter.runTransaction(tx=>tx.read('probe','r')),error=>{
    assert.equal(error.code,'CLOUD_TRANSACTION_FAILED');
    assert.equal(error.diagnostic.providerCode,'DATABASE_TRANSACTION_CONFLICT');
    assert.equal(JSON.stringify(error).includes('private-provider'),false);return true;
  });
});

test('D04 generic provider diagnostics contain only fixed markers and a numeric SDK code',async()=>{
  const cloud={database:()=>({runTransaction:work=>work({collection:()=>({doc:()=>({
    get:async()=>{throw {code:'secret-openid',errCode:-502001,message:'secret-session-token'};}
  })})})})};
  const adapter=createCloudDocumentTransactionAdapter({cloud,environment:'offline-test-env',collections:{probe:[]}});
  await assert.rejects(adapter.runTransaction(tx=>tx.read('probe','r')),error=>{
    assert.equal(error.code,'CLOUD_DOCUMENT_OPERATION_FAILED');
    assert.deepEqual(error.diagnostic,{providerCode:'UNKNOWN',numericErrCode:-502001,operation:'get',attempt:1});
    assert.equal(JSON.stringify(error).includes('secret'),false);return true;
  });
});

test('D04 exact native duplicate signatures survive SDK wrapping; generic failure never proves uniqueness',async()=>{
  for(const [failure,expected] of [
    [{code:11000,message:'private-index-value'},'CLOUD_UNIQUE_CONFLICT'],
    [{errCode:-502001,errMsg:'database.add:fail DATABASE_REQUEST_FAILED E11000 duplicate key error collection: secret index: uq_probe dup key: private'},'CLOUD_UNIQUE_CONFLICT'],
    [{errCode:-502001,errMsg:'DATABASE_REQUEST_FAILED duplicate request timed out'},'CLOUD_DOCUMENT_OPERATION_FAILED'],
    [{errCode:-502001,errMsg:'DATABASE_REQUEST_FAILED E11000 unrelated request'},'CLOUD_DOCUMENT_OPERATION_FAILED']]) {
    const cloud={database:()=>({runTransaction:work=>work({collection:()=>({
      doc:()=>({get:async()=>({data:null})}),add:async()=>{throw failure;}
    })})})};
    const adapter=createCloudDocumentTransactionAdapter({cloud,environment:'offline-test-env',collections:{probe:[]}});
    await assert.rejects(adapter.runTransaction(tx=>tx.insert('probe',{_id:'r'})),error=>{
      assert.equal(error.code,expected);
      if(expected==='CLOUD_UNIQUE_CONFLICT')assert.equal(error.diagnostic.providerCode,'MONGO_DUPLICATE_KEY');
      assert.equal(JSON.stringify(error).includes('private'),false);
      assert.equal(JSON.stringify(error).includes('secret'),false);return true;
    });
  }
});
