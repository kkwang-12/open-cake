'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {testResult,runtimeBoundary}=require('../scripts/verify-payment-offline');
const tap=patch=>Object.entries({tests:3,pass:3,fail:0,cancelled:0,skipped:0,todo:0,...patch})
  .map(([name,count])=>'# '+name+' '+count).join('\n');
test('P08 test evidence cannot pass on a nonzero process exit despite a green TAP summary',()=>{
  assert.equal(testResult(tap(),0).passed,true);assert.equal(testResult(tap(),1).passed,false);
  assert.equal(testResult(tap(),null).passed,false);
});
test('P08 skipped, pending, cancelled and zero-count evidence cannot replace executed acceptance',()=>{
  for(const patch of [{tests:0,pass:0},{tests:3,pass:2,skipped:1},{todo:1},{cancelled:1},{fail:1}])
    assert.equal(testResult(tap(patch),0).passed,false);
});
test('P08 missing, contradictory or duplicate TAP summaries cannot create passing evidence',()=>{
  for(const output of ['',tap().replace('# fail 0',''),tap()+'\n# pass 3',tap({pass:4}),tap({tests:9007199254740992})])
    assert.equal(testResult(output,0).passed,false);
});
test('P08 deleting legacy coverage below the original 19 cases cannot silently pass acceptance',()=>{
  assert.equal(testResult(tap({tests:18,pass:18}),0,19).passed,false);
  assert.equal(testResult(tap({tests:19,pass:19}),0,19).passed,true);
  assert.equal(testResult(tap(),0,0).passed,false);
});
test('P08 current client rejects payment before touching cloud, even with an environment configured',async()=>{
  const result=await runtimeBoundary();assert.equal(result.passed,true);assert.equal(result.paymentPlatformCalls,0);
  assert.equal(result.paymentAllowed,false);assert.equal(result.successPageAllowed,false);
});
