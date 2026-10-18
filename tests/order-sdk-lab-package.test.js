'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const {createRequire}=require('node:module');
const {randomBytes}=require('node:crypto');
const clone=v=>structuredClone(v);
function fakeCloud(){
  let records={},transactions=0;
  const reader=data=>({collection:name=>{
    assert.equal(name,'jjl_d04_probe_records');
    return {doc:id=>({get:async()=>({data:clone(data[id]??null)}),update:async({data:patch})=>{
      if(!data[id])return {stats:{updated:0}};
      for(const [key,value]of Object.entries(patch)){const parts=key.split('.');let row=data[id];
        while(parts.length>1)row=row[parts.shift()];row[parts[0]]=clone(value);}
      return {stats:{updated:1}};
    }}),add:async({data:value})=>{
      if(data[value._id])throw Object.assign(new Error('duplicate'),{code:'DATABASE_DUPLICATE_WRITE'});
      data[value._id]=clone(value);return {_id:value._id};
    },where:filter=>({limit:limit=>({get:async()=>({data:Object.values(data).filter(row=>Object.entries(filter).every(([k,v])=>row[k]===v)).slice(0,limit).map(clone)})})})};
  }});
  return {records:()=>records,transactions:()=>transactions,database:()=>({...reader(records),runTransaction:async work=>{
    transactions++;const staged=clone(records),result=await work(reader(staged));records=staged;return result;
  }}),init(){},DYNAMIC_CURRENT_ENV:'test',getWXContext:()=>({})};
}
test('deployable SDK lab contains complete dependencies and enforces bounded isolated order/replay/rollback cases',async()=>{
  const root=path.resolve(__dirname,'..'),name='test-order-lab-'+randomBytes(5).toString('hex');
  const directory=path.join(root,'artifacts',name);
  assert.ok(directory.startsWith(path.join(root,'artifacts')+path.sep));
  try{
    const build=spawnSync(process.execPath,['scripts/prepare-order-sdk-cloud.js','--package='+name],{cwd:root,encoding:'utf8',windowsHide:true});
    assert.equal(build.status,0,build.stderr);
    const filename=path.join(directory,'functions','jjl-order-sdk-lab','index.js'),localRequire=createRequire(filename),exports={};
    const sdk=fakeCloud();
    vm.runInThisContext('(function(require,exports,process,console){'+fs.readFileSync(filename,'utf8')+'\n})',{filename})(
      name=>name==='wx-server-sdk'?sdk:localRequire(name),exports,{env:{}},{warn(){}});
    assert.equal(typeof exports.main,'function');
    assert.equal(localRequire('./package.json').dependencies['wx-server-sdk'],'4.0.2');
    const calls=JSON.parse(fs.readFileSync(path.join(directory,'native-calls.json'),'utf8'));
    assert.equal(calls.steps.length,14);
    for(const step of calls.steps){
      const app={},response={ok:true};let requests=0;
      const context=vm.createContext({getApp:()=>app,wx:{cloud:{callFunction:async input=>{
        requests++;assert.equal(input.name,'jjl-order-sdk-lab');assert.equal(input.config.env,'dinner-cook-test-d5e320u981ec341');
        assert.equal(input.data.payload.caseId,step.caseId);assert.equal(input.data.payload.operation,step.operation);
        return {result:response};
      }}}});
      const start=vm.runInContext('('+fs.readFileSync(path.join(directory,step.start),'utf8')+')',context);
      assert.equal(start().started,true);assert.equal(start().started,true);
      await Promise.resolve();await Promise.resolve();
      const poll=vm.runInContext('('+fs.readFileSync(path.join(directory,step.poll),'utf8')+')',context);
      assert.equal(poll().state,'COMPLETED');assert.equal(poll().response.ok,true);assert.equal(requests,1);
    }
    assert.equal((await exports.main({payload:{operation:'prepare',caseId:'pickup'}},{})).ok,false);
    assert.equal(sdk.transactions(),0,'management invocation must not acquire native identity');
    const {createLab,cases}=localRequire('./order-sdk-lab');
    const environment=JSON.parse(fs.readFileSync(path.join(directory,'environment.json'),'utf8'));
    assert.equal(environment.JJL_PROBE_EXPIRES_AT,'0');
    const settings={appId:environment.JJL_APP_ID,environment:environment.JJL_CLOUD_ENV,stage:'test',runId:environment.JJL_PROBE_RUN_ID};
    const native={APPID:settings.appId,ENV:settings.environment,OPENID:'synthetic-native-actor'};
    const {identityFromPlatform}=localRequire('./shared/authorization-model');
    const now=Date.parse('2026-10-18T12:30:00Z');
    Object.assign(settings,{allowedUserId:identityFromPlatform(native,settings)._id,expiresAt:now+60000});
    const lab=createLab({cloud:sdk,settings,now:()=>now});
    const call=(caseId,operation)=>lab.execute({caseId,operation},native);
    for(const caseId of Object.keys(cases)){
      assert.equal((await call(caseId,'prepare')).state,'PREPARED');
      const afterPrepare=clone(sdk.records());
      assert.equal((await call(caseId,'prepare')).state,'ALREADY_PREPARED');
      assert.deepEqual(sdk.records(),afterPrepare);
      await assert.rejects(call(caseId,'audit'),{code:'LAB_NOT_EXECUTED'});
      const first=await call(caseId,'execute');
      if(caseId.startsWith('rollback-')){
        assert.equal(first.state,'ROLLBACK_CANDIDATE');assert.equal(first.metrics.faultTriggered,true);
        assert.equal(first.metrics.writes,caseId==='rollback-first'?1:18);
      }else{
        assert.equal(first.disposition,'CREATED');assert.equal(first.businessOrderCreated,false);
        assert.equal(first.metrics.reads,caseId==='delivery'?12:11);
        assert.equal(first.metrics.writes,caseId==='delivery'?19:18);
        const beforeReplay=Object.keys(sdk.records()).length,second=await call(caseId,'execute');
        assert.equal(second.disposition,'REPLAY');assert.equal(second.orderId,first.orderId);
        assert.equal(second.metrics.writes,3);assert.equal(Object.keys(sdk.records()).length,beforeReplay);
      }
      assert.equal((await call(caseId,'audit')).state,'AUDIT_PASSED');
      await assert.rejects(call(caseId,'execute'),{code:'LAB_EXECUTION_BUDGET_EXHAUSTED'});
    }
    assert.equal(Object.keys(sdk.records()).length,53); // Fixed four-case document envelope.
    const beforeDenied=clone(sdk.records());
    await assert.rejects(lab.execute({caseId:'unbounded',operation:'prepare'},native),{code:'INVALID_LAB_REQUEST'});
    await assert.rejects(lab.execute({caseId:'pickup',operation:'prepare'},{...native,OPENID:'other'}),{code:'LAB_NOT_AUTHORIZED'});
    for(const overrides of [{expiresAt:0},{expiresAt:now+91*60000},{stage:'development'},{environment:'cloudbase-d8gwtxzm64150b7e0'}]){
      const altered={...settings,...overrides},context={...native,ENV:altered.environment};
      altered.allowedUserId=identityFromPlatform(context,altered)._id;
      await assert.rejects(createLab({cloud:sdk,settings:altered,now:()=>now}).execute({caseId:'pickup',operation:'prepare'},context),{code:'LAB_NOT_AUTHORIZED'});
    }
    assert.deepEqual(sdk.records(),beforeDenied);
    const product=Object.values(sdk.records()).find(row=>row.caseId==='pickup'&&row.logicalCollection==='products');
    product.record.version++;
    await assert.rejects(call('pickup','audit'),{code:'LAB_DEPENDENCY_AUDIT_FAILED'});
  }finally{assert.ok(directory.startsWith(path.join(root,'artifacts')+path.sep));fs.rmSync(directory,{recursive:true,force:true});}
});
