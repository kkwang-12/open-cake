'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {canonicalJSON,scopedDocumentId,requestFingerprint,idempotencyId,decideIdempotency}=require('../cloudfunctions/_shared/idempotency-model');
function code(run,expected){assert.throws(run,error=>error.code===expected);}
function request(overrides={}) {return {environment:'offline-test',actorScope:'user-a',command:'ORDER_CREATE',key:'key-a',requestFingerprint:requestFingerprint({quoteId:'offline-quote'}),...overrides};}
function record(status='SUCCEEDED') {
  const req=request();
  return {_id:idempotencyId(req),actorScope:req.actorScope,command:req.command,key:req.key,requestFingerprint:req.requestFingerprint,
    status,result:status==='IN_PROGRESS'?null:{entityId:'offline-order',version:0,errorCode:status==='SUCCEEDED'?null:'REJECTED'},leaseUntil:1};
}

test('D04 JSON 键顺序不改请求摘要，数组顺序与 null / 空串区别保留',()=>{
  assert.equal(requestFingerprint({b:2,a:{d:4,c:3}}),requestFingerprint({a:{c:3,d:4},b:2}));
  assert.notEqual(requestFingerprint([1,2]),requestFingerprint([2,1]));
  assert.notEqual(requestFingerprint(null),requestFingerprint(''));
  assert.equal(canonicalJSON({a:1,b:[false,null]}),'{"a":1,"b":[false,null]}');
});

test('D04 非 JSON、稀疏 / 附加属性数组、循环、符号与 getter 不生成请求指纹',()=>{
  const cyclic={};cyclic.self=cyclic;
  const getter={};Object.defineProperty(getter,'secret',{enumerable:true,get(){throw new Error('must not run');}});
  const array=[1];array.extra=2;
  for(const input of [undefined,NaN,Infinity,1n,new Date(),new Array(1),array,cyclic,{bad:undefined},{[Symbol('x')]:1},getter,'\ud800']) {
    code(()=>requestFingerprint(input),'INVALID_IDEMPOTENCY_INPUT');
  }
});

test('D04 确定性 ID 绑定环境 / 身份 / 命令 / 键；JSON 分帧避免分隔符碰撞',()=>{
  const one=idempotencyId(request());
  assert.match(one,/^[a-f0-9]{64}$/);
  assert.equal(one,idempotencyId(request()));
  for(const overrides of [{environment:'production'},{actorScope:'user-b'},{command:'PAYMENT_CREATE'},{key:'key-b'}]) assert.notEqual(one,idempotencyId(request(overrides)));
  assert.notEqual(scopedDocumentId('n',['a:b','c']),scopedDocumentId('n',['a','b:c']));
});

test('D04 首次 CREATE、成功 / 失败终态重放、处理中 BUSY；过期租约也不盲目重新调用资金',()=>{
  assert.equal(decideIdempotency(null,request()).disposition,'CREATE');
  const succeeded=record();succeeded.result.privateToken='must-not-copy';
  const replay=decideIdempotency(succeeded,request());
  assert.deepEqual(replay.result,{entityId:'offline-order',version:0,errorCode:null});
  assert(Object.isFrozen(replay.result));
  assert.equal(decideIdempotency(record('FAILED'),request()).result.errorCode,'REJECTED');
  assert.equal(decideIdempotency(record('IN_PROGRESS'),request()).disposition,'BUSY');
});

test('D04 同键异参拒绝，错误范围记录 / 缺终态结果拒绝，输入不被修改',()=>{
  const stored=record();const original=JSON.stringify(stored);
  code(()=>decideIdempotency(stored,request({requestFingerprint:requestFingerprint({quoteId:'other'})})),'IDEMPOTENCY_KEY_REUSED');
  code(()=>decideIdempotency({...stored,actorScope:'other'},request()),'INVALID_IDEMPOTENCY_RECORD');
  code(()=>decideIdempotency({...stored,result:null},request()),'INVALID_IDEMPOTENCY_RECORD');
  assert.equal(JSON.stringify(stored),original);
});

test('D04 缺身份范围与非字符串指纹返回领域错误，不调用输入对象转换方法',()=>{
  for(const value of [null,undefined,1,{}]) code(()=>idempotencyId(value),'INVALID_IDEMPOTENCY_INPUT');
  code(()=>decideIdempotency(null,request({requestFingerprint:Symbol('x')})),'INVALID_IDEMPOTENCY_INPUT');
  code(()=>decideIdempotency({...record(),requestFingerprint:{toString(){throw new Error('must not run');}}},request()),'INVALID_IDEMPOTENCY_RECORD');
});
