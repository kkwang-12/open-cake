'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {createNativeBatchTransport}=require('../scripts/cloud-checks/native-batch-transport');
const input={operation:'hold',caseId:'stock-last',command:0,mode:'PICKUP'};
function harness({dropStart=false,dropPoll=false,cloudFailure=false,resetApp=false}={}) {
  let app={},calls=0,evals=0;const retries=[];
  const context=vm.createContext({getApp:()=>app,wx:{cloud:{callFunction:async()=>{
    calls++;if(cloudFailure)throw new Error('private-cloud-failure');
    return {result:{ok:true,data:{command:0}},requestID:'platform-request'};
  }}}});
  const evaluate=source=>{
    evals++;const start=source.includes('Promise.all');
    if(!start && dropPoll){dropPoll=false;throw new Error('WECHAT_EVALUATION_REJECTED');}
    if(!start && resetApp)app={};
    const result=vm.runInContext('('+source+')()',context);
    if(start && dropStart){dropStart=false;throw new Error('WECHAT_RESPONSE_MISSING');}
    return result;
  };
  return {invoke:createNativeBatchTransport({evaluate,environment:'isolated-test',ticketPrefix:'d04Test',
    onRetry:row=>retries.push(row)}),stats:()=>({calls,evals,retries})};
}
test('native transport recovers a dropped start reply without submitting the cloud operation twice',async()=>{
  const h=harness({dropStart:true});const rows=await h.invoke([input]);
  assert.equal(rows[0].platformRequestId,'platform-request');assert.equal(h.stats().calls,1);
  assert.equal(h.stats().retries[0].stage,'START');
});
test('native transport retries rejected polling without resubmitting a concurrent batch',async()=>{
  const h=harness({dropPoll:true});const rows=await h.invoke([input,{...input,command:1}]);
  assert.equal(rows.length,2);assert.equal(h.stats().calls,2);assert.equal(h.stats().retries[0].stage,'POLL');
});
test('native transport never retries a cloud rejection or missing browser batch',async()=>{
  for(const options of [{cloudFailure:true},{resetApp:true}]) {
    const h=harness(options);await assert.rejects(h.invoke([input]),/NATIVE_BATCH_FAILED/);
    assert.equal(h.stats().calls,1);assert.equal(h.stats().retries.length,0);
  }
});
test('native transport stops after three tool failures and never evaluates unsafe literals',async()=>{
  let calls=0;
  const invoke=createNativeBatchTransport({evaluate:()=>{calls++;throw new Error('WECHAT_EVALUATION_FAILED');},
    environment:'isolated-test',ticketPrefix:'d04Test'});
  await assert.rejects(invoke([{...input,caseId:"';private"}]),/INVALID_SCENARIO_LITERAL/);assert.equal(calls,0);
  await assert.rejects(invoke([input]),/WECHAT_EVALUATION_FAILED/);assert.equal(calls,3);
});

test('native transport sends bounded read-protection cases once after a dropped start reply',async()=>{
  const h=harness({dropStart:true});
  await h.invoke([{operation:'read-protection',caseId:'read-existing',command:0,mode:'PICKUP'}]);
  assert.equal(h.stats().calls,1);assert.equal(h.stats().retries[0].stage,'START');
});
