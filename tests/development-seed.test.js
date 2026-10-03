'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildDevelopmentSeedPlan } = require('../cloudfunctions/_shared/development-seed');
const settings={stage:'development',environment:'offline-dev',expectedDevelopmentEnvironment:'offline-dev',
  productionEnvironments:['offline-prod'],namespace:'dev-d07'};
function plan(existing=[],config=settings,now=1000000){return buildDevelopmentSeedPlan(config,existing,now);}
function code(run,expected){assert.throws(run,error=>error.code===expected);}

test('D07 开发种子仅五个草稿记录，无商品价格 / 库存 / 用户 / 管理员 / 支付数据',()=>{
  const result=plan();
  assert.equal(result.status,'OFFLINE_PLAN_NOT_APPLIED');
  assert.equal(result.operations.length,5);
  assert.deepEqual(result.operations.map(row=>row.collection),['categories','categories','categories','stores','store_config']);
  for(const row of result.operations) {
    assert.equal(row.type,'CREATE_IF_ABSENT');
    assert.match(row.document._id,/^[a-f0-9]{64}$/);
    if(row.collection==='categories') assert.equal(row.document.published,false);
    else assert.equal(row.document.status,'DRAFT');
  }
  const store=result.operations[3].document,config=result.operations[4].document;
  assert.equal(store.location,null);assert.equal(store.phone,null);assert.equal(store.activeConfigId,null);
  for(const name of ['timePolicy','cartLimits','quoteTtlMinutes','paymentHoldMinutes','slotPolicy']) assert.equal(config[name],null);
  assert.deepEqual(config.deliveryRules,[]);
  assert.equal(config.publishedAt,null);
});

test('D07 高德原始点与每天营业只在已确认参考资料中，未当 WGS84 或不完整发布日历',()=>{
  const result=plan();
  assert.deepEqual(result.referenceFacts.rawMapPoint,{longitude:117.2886,latitude:31.1498,coordinateSystem:'GCJ02',source:'AMAP'});
  assert.equal(result.referenceFacts.weeklyWindows.length,14);
  for(const value of result.referenceFacts.weeklyWindows) {
    assert.equal(value.startMinute,480);assert.equal(value.endMinute,1260);
    assert(value.weekday>=1&&value.weekday<=7);
  }
  assert.deepEqual(result.referenceFacts.fulfillment.capacityPerSlot,{PICKUP:3,DELIVERY:1});
  assert(Object.isFrozen(result.operations[4].document.fulfillmentModes));
});

test('D07 非开发 / 环境错配 / 命中生产 / 无明确名单 / 非开发命名空间全部拒绝',()=>{
  for(const patch of [{stage:'test'},{stage:'production'},{environment:'offline-prod'},
    {expectedDevelopmentEnvironment:'other'},{productionEnvironments:undefined},
    {productionEnvironments:['offline-dev']},{namespace:'real-store'},{namespace:'dev-../unsafe'}]) {
    code(()=>plan([],{...settings,...patch}),'SEED_ENVIRONMENT_REJECTED');
  }
});

test('D07 重复执行只跳过已有记录，即使其已被编辑或发布也不重置版本 / 内容',()=>{
  const first=plan();
  const existing=first.operations.map(row=>({collection:row.collection,document:JSON.parse(JSON.stringify(row.document))}));
  existing[0].document.published=true;
  existing[3].document.name='商家后来修改的名称';
  existing[3].document.status='OPEN';
  existing[3].document.version=9;
  existing[4].document.paymentHoldMinutes=30;
  const before=JSON.stringify(existing);
  const second=plan(existing,settings,2000000);
  assert(second.operations.every(row=>row.type==='SKIP_EXISTING'));
  assert.equal(JSON.stringify(existing),before);
  assert(!JSON.stringify(second.operations).includes('商家后来修改的名称'));
  assert.deepEqual(first.operations.map(row=>row.document._id),plan([],settings,2000000).operations.map(row=>row.document._id));
});

test('D07 分类已有不同 ID 时按唯一 code 跳过，不另建重复分类；环境 / 命名空间 ID 隔离',()=>{
  const category={...plan().operations[0].document,_id:'existing-category',published:true};
  const result=plan([{collection:'categories',document:category}]);
  assert.deepEqual(result.operations[0],{type:'SKIP_EXISTING',collection:'categories',_id:'existing-category'});
  const other=plan([],{...settings,namespace:'dev-other'});
  assert.notEqual(result.operations[3].document._id,other.operations[3].document._id);
  const otherEnv={...settings,environment:'other-dev',expectedDevelopmentEnvironment:'other-dev'};
  assert.notEqual(plan().operations[3].document._id,plan([],otherEnv).operations[3].document._id);
});

test('D07 冲突 / 重复唯一键 / 非 JSON / 非许可集合失败，不生成覆盖或删除计划',()=>{
  const record=plan().operations[0];
  const existing={collection:record.collection,document:record.document};
  code(()=>plan([existing,existing]),'SEED_CONFLICT');
  code(()=>plan([{collection:'categories',document:{...record.document,code:'BREAD'}}]),'SEED_CONFLICT');
  code(()=>plan([{collection:'payments',document:record.document}]),'INVALID_SEED_INPUT');
  code(()=>plan(new Array(1)),'INVALID_SEED_INPUT');
  code(()=>plan([],settings,0),'INVALID_SEED_INPUT');
  code(()=>plan([{collection:'categories',document:{...record.document,extra:undefined}}]),'INVALID_SEED_INPUT');
});

test('D07 本地 CLI 只写计划，已有输出拒绝覆盖，生产配置失败不打印敏感输入',()=>{
  const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
  const root=path.resolve(__dirname,'..'),outputRoot=path.join(root,'artifacts','development-seed');
  fs.mkdirSync(outputRoot,{recursive:true});
  const directory=fs.mkdtempSync(path.join(outputRoot,'d07-cli-'));
  const input=path.join(directory,'input.json'),output=path.join(directory,'plan.json');
  try {
    fs.writeFileSync(input,JSON.stringify({settings,now:1000000}));
    const run=()=>spawnSync(process.execPath,[path.join(root,'scripts/plan-development-seed.js'),
      '--input',input,'--output',output],{cwd:root,encoding:'utf8'});
    const first=run();assert.equal(first.status,0,first.stderr);
    const before=fs.readFileSync(output,'utf8');
    assert.equal(JSON.parse(before).status,'OFFLINE_PLAN_NOT_APPLIED');
    const second=run();assert.equal(second.status,1);assert(second.stderr.includes('OUTPUT_ALREADY_EXISTS'));
    assert.equal(fs.readFileSync(output,'utf8'),before);
    fs.writeFileSync(input,JSON.stringify({settings:{...settings,stage:'production',secret:'do-not-log'},now:1000000}));
    const rejected=run();assert.equal(rejected.status,1);
    assert(rejected.stderr.includes('SEED_ENVIRONMENT_REJECTED'));
    assert(!rejected.stderr.includes('do-not-log'));
  } finally {
    // Remove only exact files created in this unique workspace test directory.
    for(const file of [input,output]) if(fs.existsSync(file)) fs.unlinkSync(file);
    fs.rmdirSync(directory);
  }
});
