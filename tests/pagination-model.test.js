'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PAGE_POLICY, pageRequest, issueCursor, readCursor, seekConditions } = require('../cloudfunctions/_shared/pagination-model');
const key={id:'offline-key-v1',secret:Buffer.alloc(32,7)};
const ctx={environment:'offline-dev',actorScope:'OWNER:a',action:'order.list',sortId:'CREATED_DESC',query:{status:'PAID'}};
const now=1000000;
function code(run,expected){assert.throws(run,error=>error.code===expected);}

test('D07 分页技术上限默认20最大50，不接受 skip / 自报 owner / 任意排序',()=>{
  assert.deepEqual(pageRequest(),{pageSize:20,cursor:null});
  assert.equal(pageRequest({pageSize:50}).pageSize,50);
  for(const input of [{pageSize:0},{pageSize:51},{pageSize:1.5},{skip:20},{ownerId:'b'}, {sortBy:'phone'}, {cursor:'x'.repeat(4097)}]) {
    code(()=>pageRequest(input),'INVALID_PAGE_REQUEST');
  }
});

test('D07 游标绑定环境、可信主体、action、排序和规范查询；同查询键顺序兼容',()=>{
  const cursor=issueCursor([900,'order-z'],ctx,key,now);
  assert.deepEqual(readCursor(cursor,ctx,key,now+1),[900,'order-z']);
  for(const patch of [{environment:'prod'},{actorScope:'OWNER:b'},{action:'admin.orders.list'},
    {sortId:'UPDATED_DESC'},{query:{status:'CANCELLED'}}]) {
    code(()=>readCursor(cursor,{...ctx,...patch},key,now+1),'CURSOR_INVALID');
  }
  const context={...ctx,query:{storeId:'s',status:'PAID'}};
  const other=issueCursor([900,'o'],context,key,now);
  assert.deepEqual(readCursor(other,{...context,query:{status:'PAID',storeId:'s'}},key,now+1),[900,'o']);
});

test('D07 游标签名拒绝正文 / MAC 篡改、错误密钥和非规范编码',()=>{
  const cursor=issueCursor([900,'z'],ctx,key,now);
  const [body,signature]=cursor.split('.');
  const tampered=Buffer.from(JSON.stringify({last:[0,'evil']})).toString('base64url');
  for(const value of [tampered+'.'+signature,body+'.'+'A'.repeat(43),cursor+'.extra','not-token']) {
    code(()=>readCursor(value,ctx,key,now+1),'CURSOR_INVALID');
  }
  code(()=>readCursor(cursor,ctx,{...key,secret:Buffer.alloc(32,8)},now+1),'CURSOR_INVALID');
  code(()=>readCursor(cursor,ctx,{...key,id:'rotated'},now+1),'CURSOR_INVALID');
});

test('D07 游标到期边界拒绝，不能未来签发；重发不能让旧 cursor 改时效',()=>{
  const cursor=issueCursor([900,'z'],ctx,key,now);
  assert.deepEqual(readCursor(cursor,ctx,key,now+PAGE_POLICY.cursorTtlMs-1),[900,'z']);
  code(()=>readCursor(cursor,ctx,key,now+PAGE_POLICY.cursorTtlMs),'CURSOR_EXPIRED');
  code(()=>readCursor(cursor,ctx,key,now-1),'CURSOR_INVALID');
});

test('D07 游标不携带原始查询隐私；服务端必须提供强密钥与合法 anchor',()=>{
  const privateContext={...ctx,query:{search:'13800000000',detail:'private-address'}};
  const cursor=issueCursor([900,'z'],privateContext,key,now);
  const body=Buffer.from(cursor.split('.')[0],'base64url').toString('utf8');
  assert(!body.includes('13800000000')&&!body.includes('private-address'));
  code(()=>issueCursor([900,'z'],ctx,{id:'k',secret:Buffer.alloc(8)},now),'INVALID_CURSOR_CONFIGURATION');
  code(()=>issueCursor([900,'z'],{...ctx,sortId:'phone'},key,now),'INVALID_CURSOR_CONTEXT');
  for(const anchor of [[],[-1,'z'],[900,5],new Array(2)]) {
    code(()=>issueCursor(anchor,ctx,key,now),'INVALID_CURSOR_ANCHOR');
  }
});

test('D07 keyset 以 _id 打破同时间边界，降序页无重复且不遗漏同时间后续行',()=>{
  const conditions=seekConditions([900,'b'],'CREATED_DESC');
  assert.deepEqual(conditions,[
    [{field:'createdAt',operator:'LT',value:900}],
    [{field:'createdAt',operator:'EQ',value:900},{field:'_id',operator:'LT',value:'b'}]
  ]);
  const matches=row=>conditions.some(and=>and.every(test=>
    test.operator==='EQ'?row[test.field]===test.value:
    test.operator==='LT'?row[test.field]<test.value:row[test.field]>test.value));
  const candidates=[{createdAt:901,_id:'a'},{createdAt:900,_id:'c'},
    {createdAt:900,_id:'b'},{createdAt:900,_id:'a'},{createdAt:899,_id:'z'}];
  assert.deepEqual(candidates.filter(matches).map(row=>row._id),['a','z']);
  assert(Object.isFrozen(conditions[1][1]));
});

test('D07 目录升序与地址降序使用固定字段，不接受客户端自定义排序表达式',()=>{
  assert.deepEqual(seekConditions([2,'p'],'CATALOG')[1],[
    {field:'sortOrder',operator:'EQ',value:2},{field:'_id',operator:'GT',value:'p'}
  ]);
  assert.equal(seekConditions([100,'a'],'UPDATED_DESC')[0][0].field,'updatedAt');
  code(()=>seekConditions([100,'a'],'SQL'),'INVALID_CURSOR_ANCHOR');
});
