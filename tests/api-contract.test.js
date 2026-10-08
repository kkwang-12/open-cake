'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ACTION_CONTRACTS, getActionContract, parseApiRequest, publicError } = require('../cloudfunctions/_shared/api-contract');
const key = 'offline-key-123456';
function code(run) { assert.throws(run, error => error.code === 'INVALID_REQUEST'); }
function request(domain,action,payload={}) { return parseApiRequest(domain,{action,payload}); }

test('D07 目标契约独立于现有部署，所有变更要求幂等键与声明身份边界',()=>{
  assert.equal(Object.keys(ACTION_CONTRACTS).length,61);
  const existing = Object.values(ACTION_CONTRACTS).filter(value=>value.status!=='PLANNED');
  assert.deepEqual(existing.map(value=>value.domain+'.'+value.action).sort(),['store.health','user.me']);
  for(const contract of Object.values(ACTION_CONTRACTS)) {
    assert(contract.access && contract.output);
    if(contract.mutation) assert.deepEqual(contract.input.idempotencyKey,{type:'key',required:true});
    if(contract.sortId) assert(contract.input.cursor && contract.input.pageSize);
    assert(Object.isFrozen(contract.input));
  }
});

test('D07 请求仅接受定义 action / 字段，客户端身份、价格、状态与系统命令不能混入',()=>{
  assert.equal(request('user','me').contract.action,'me');
  for(const patch of [{ownerId:'victim'},{role:'admin'},{unitPriceCents:1},{nextStatus:'PAID'}]) {
    code(()=>request('cart','get',{storeId:'s',...patch}));
  }
  code(()=>parseApiRequest('user',{action:'me',payload:{},openid:'victim'}));
  for(const [domain,action] of [['user','constructor'],['payment','simulate'],['order','PAYMENT_CONFIRMED'],
    ['admin.order','get'],['admin','__proto__']]) code(()=>request(domain,action));
  code(()=>getActionContract(null,'me'));
  assert.equal(request('catalog','products.list',{storeId:'s',search:'  e'+String.fromCharCode(769)+'  '}).payload.search,'é');
  assert.equal(request('catalog','products.list',{storeId:'s'}).payload.search,'');
  code(()=>request('admin','store.update',{storeId:'s',expectedVersion:0,patch:{location:{verifiedAt:1}},reason:'r',idempotencyKey:key}));
});

test('D07 有副作用动作缺键 / 非法键拒绝，版本及整数分基础类型不能用字符串绕过',()=>{
  code(()=>request('user','bootstrap'));
  assert.equal(request('user','bootstrap',{idempotencyKey:key}).contract.access,'PLATFORM');
  code(()=>request('user','bootstrap',{idempotencyKey:key,status:'ACTIVE',role:'admin'}));
  code(()=>request('order','create',{quoteId:'q',expectedQuoteVersion:0}));
  code(()=>request('order','create',{quoteId:'q',expectedQuoteVersion:0,idempotencyKey:'short'}));
  code(()=>request('order','create',{quoteId:'q',expectedQuoteVersion:'0',idempotencyKey:key}));
  code(()=>request('admin','refund.approve',{orderId:'o',expectedVersion:1,refundCents:0,reason:'r',idempotencyKey:key}));
  assert.equal(request('order','create',{quoteId:'q',expectedQuoteVersion:0,idempotencyKey:key}).payload.quoteId,'q');
  assert.equal(request('admin','inventory.setTotal',{resourceId:'r',expectedVersion:0,totalUnits:3,reason:'r',idempotencyKey:key}).payload.totalUnits,3);
  code(()=>request('admin','inventory.setTotal',{resourceId:'r',expectedVersion:0,total:3,reason:'r',idempotencyKey:key}));
});

test('D07 选中行 / 规格 / 联系人地址做嵌套白名单，输入深复制并冻结',()=>{
  const payload = {storeId:'s',expectedVersion:0,productId:'p',skuId:'sku',selectedOptions:[{groupCode:'SIZE',optionCode:'S'}],
    quantity:1,cakeMessage:'生日快乐',idempotencyKey:key};
  const parsed = request('cart','add',payload);
  payload.selectedOptions[0].optionCode = 'tamper';
  assert.equal(parsed.payload.selectedOptions[0].optionCode,'S');
  assert(Object.isFrozen(parsed.payload.selectedOptions[0]));
  code(()=>request('cart','add',{...payload,selectedOptions:[{groupCode:'SIZE',optionCode:'S',label:'fake'}]}));
  const address={receiverName:'测试',phone:'13800000000',province:'安徽',city:'合肥',district:'庐江',
    regionCodes:{province:null,city:null,district:null},detail:'测试地址',mapSelectionToken:'token'};
  assert.equal(request('address','create',{address,idempotencyKey:key}).payload.address.detail,'测试地址');
  code(()=>request('address','create',{address:{...address,location:{verifiedAt:1}},idempotencyKey:key}));
});

test('D07 报价区分自取与配送地址，行版本与重复行校验，价格与容量仍由云端验证',()=>{
  const payload={cartId:'c',expectedCartVersion:0,lines:[{lineId:'l',lineVersion:0}],
    fulfillment:'PICKUP',contact:{name:'测试',phone:'13800000000'},slotId:'slot',idempotencyKey:key};
  assert.equal(request('checkout','quote.create',payload).payload.fulfillment,'PICKUP');
  code(()=>request('checkout','quote.create',{...payload,addressId:'a'}));
  code(()=>request('checkout','quote.create',{...payload,fulfillment:'DELIVERY'}));
  assert.equal(request('checkout','quote.create',{...payload,fulfillment:'DELIVERY',addressId:'a'}).payload.addressId,'a');
  code(()=>request('checkout','quote.create',{...payload,lines:[...payload.lines,...payload.lines]}));
});

test('D07 管理员取消审批与草稿编辑的条件字段明确，不存在任意状态 / 任意系统命令',()=>{
  const review={orderId:'o',expectedVersion:1,reviewId:'r',decision:'APPROVE',reason:'测试',idempotencyKey:key};
  code(()=>request('admin','cancellation.review',review));
  assert.equal(request('admin','cancellation.review',{...review,refundCents:0}).payload.refundCents,0);
  code(()=>request('admin','cancellation.review',{...review,decision:'REJECT',refundCents:0}));
  assert.equal(request('admin','cancellation.review',{...review,decision:'REJECT'}).payload.decision,'REJECT');
  code(()=>request('admin','product.save',{storeId:'s',productId:'p',draft:{},idempotencyKey:key}));
  assert(request('admin','product.save',{storeId:'s',productId:'p',expectedVersion:1,draft:{},idempotencyKey:key}));
  code(()=>request('admin','order.transition',{orderId:'o',expectedVersion:1,command:'PAYMENT_CONFIRMED',idempotencyKey:key}));
});

test('D07 非 JSON、getter、稀疏数组、超请求上限拒绝；不执行输入 getter',()=>{
  let invoked=false;
  const payload={};
  Object.defineProperty(payload,'storeId',{enumerable:true,get(){invoked=true;return 's';}});
  code(()=>request('cart','get',payload));
  assert.equal(invoked,false);
  const envelope={action:'me',payload:{}};
  Object.defineProperty(envelope,'requestId',{enumerable:true,get(){invoked=true;return 'x';}});
  code(()=>parseApiRequest('user',envelope));
  assert.equal(invoked,false);
  code(()=>request('cart','get',{storeId:undefined}));
  const cyclic={};cyclic.self=cyclic;
  code(()=>request('admin','product.save',{storeId:'s',draft:cyclic,idempotencyKey:key}));
  code(()=>request('store','slots.list',{storeId:'s',fulfillment:'PICKUP',serviceDate:'2026-10-03',productIds:new Array(1)}));
  code(()=>request('cart','add',{storeId:'s',expectedVersion:0,productId:'p',skuId:'sku',selectedOptions:[],
    quantity:1,cakeMessage:'x'.repeat(65537),idempotencyKey:key}));
});

test('D07 公开错误仅固定白名单，隐藏错误栈 / 身份 / 支付原文与未知代码',()=>{
  assert.deepEqual(publicError({code:'USER_DISABLED',message:'private-victim'}),{code:'AUTH_REQUIRED',message:'请重新验证身份'});
  assert.equal(publicError({code:'FORBIDDEN'}).code,'FORBIDDEN');
  assert.equal(publicError({code:'RESOURCE_VERSION_CONFLICT'}).code,'QUOTE_CHANGED');
  assert.equal(publicError({code:'PAYMENT_UNRESOLVED'}).code,'PAYMENT_PENDING');
  for(const error of [new Error('secret'),{code:'INVALID_CATALOG',message:'13800000000'},
    {code:'constructor'},{code:'__proto__'},null]) {
    assert.deepEqual(publicError(error),{code:'INTERNAL_ERROR',message:'服务暂时不可用'});
  }
});
