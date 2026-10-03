'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const { spawnSync }=require('node:child_process');
const example=require('../catalog-assets/development/catalog-example');
const { buildCatalogDraftPlan }=require('../cloudfunctions/_shared/catalog-draft-model');
const { resolveSku }=require('../cloudfunctions/_shared/catalog-model');
const settings={stage:'development',environment:'offline-c01',expectedDevelopmentEnvironment:'offline-c01',
  productionEnvironments:['production'],namespace:'dev-d07'};
const clone=value=>JSON.parse(JSON.stringify(value));
const build=(input=example,existing=[],config=settings,now=1000)=>buildCatalogDraftPlan(input,existing,config,now);
const rejects=(run,code)=>assert.throws(run,error=>error.code===code);
test('C01 user example creates 3 categories / 9 draft products / 15 explicit SKUs with exact prices',()=>{
  const plan=build(),products=plan.operations.filter(item=>item.collection==='products').map(item=>item.document);
  const skus=plan.operations.filter(item=>item.collection==='skus').map(item=>item.document);
  assert.deepEqual(plan.categories.map(item=>item.code),['CAKE','MINI_CAKE','BREAD']);
  assert.equal(products.length,9);assert.equal(skus.length,15);
  assert.deepEqual(skus.map(item=>item.unitPriceCents),[16800,23800,32800,18800,25800,34800,17800,24800,33800,3600,3800,4200,1200,1200,1200]);
  assert.ok(products.every(item=>item.status==='DRAFT'&&item.images.length===0&&item.minLeadTimeMinutes===null));
  assert.ok(skus.every(item=>item.status==='DRAFT'&&item.minQuantity===null&&item.maxQuantity===null&&item.stockRequirements.length===0));
  assert.ok(plan.review.slice(0,3).every(item=>item.messageDecision==='ENABLED'&&item.blockers.includes('MESSAGE_MAX_LENGTH')));
  assert.ok(plan.review.slice(3).every(item=>item.messageDecision==='DISABLED'));
  assert.ok(plan.review.slice(6).every(item=>item.blockers.includes('FORMAL_NAME')));
  assert.ok(!JSON.stringify(products).includes('catalog-example.png'));
  rejects(()=>resolveSku(products[0],skus.filter(item=>item.productId===products[0]._id),[{groupCode:'SIZE',optionCode:'INCH_6'}]),'PRODUCT_UNAVAILABLE');
});
test('C01 environment / namespace gate rejects test, production and mismatched environments',()=>{
  for(const change of [{stage:'production'},{stage:'test'},{environment:'production',expectedDevelopmentEnvironment:'production'},
    {expectedDevelopmentEnvironment:'other'},{namespace:'production'}])rejects(()=>build(example,[],{...settings,...change}),'SEED_ENVIRONMENT_REJECTED');
  assert.notEqual(build().operations[0].document._id,build(example,[],{...settings,environment:'other-dev',expectedDevelopmentEnvironment:'other-dev'}).operations[0].document._id);
});
test('C01 duplicate key / selection, unknown category and invalid option combinations fail closed',()=>{
  for(const change of [
    x=>x.products.push(clone(x.products[0])),
    x=>x.products[0].variants.push({...clone(x.products[0].variants[0]),key:'duplicate'}),
    x=>x.products[0].variants[0].selectedOptions[0].optionCode='NOT_CONFIGURED',
    x=>x.products[0].variants[0].selectedOptions=[],
    x=>x.products[0].optionGroups.push(clone(x.products[0].optionGroups[0])),
    x=>x.products[0].categoryCode='DRINKS',
    x=>x.products[6].messageDecision='ENABLED',
    x=>x.products[0].variants[0].selectedOptions[0].label='client label'
  ]){const input=clone(example);change(input);assert.throws(()=>build(input),error=>['INVALID_CATALOG_DRAFT','CATALOG_DRAFT_CONFLICT'].includes(error.code));}
});
test('C01 prices are positive safe integer cents or explicit unknown, never inferred',()=>{
  for(const price of [0,-1,12.5,Number.MAX_SAFE_INTEGER+1,'1200']){
    const input=clone(example);input.products[0].variants[0].unitPriceCents=price;
    rejects(()=>build(input),'INVALID_CATALOG_DRAFT');
  }
  const input=clone(example);Object.assign(input.products[0].variants[0],{unitPriceCents:null,priceSource:'UNKNOWN'});
  const plan=build(input);assert.ok(plan.review[0].blockers.includes('PRICE'));
  assert.equal(plan.operations.find(item=>item.collection==='skus').document.unitPriceCents,null);
});
test('C01 reference / product inputs reject extra fields, unsafe paths, sparse arrays and getters',()=>{
  for(const change of [
    x=>x.products[0].status='ON_SALE',x=>x.reference.file='../private.key',
    x=>x.reference.sha256='not-a-hash',x=>x.products[0].images=['secret'],
    x=>delete x.products[0],x=>Object.defineProperty(x.products[0],'name',{get(){throw new Error('should not execute');},enumerable:true})
  ]){const input=clone(example);change(input);rejects(()=>build(input),'INVALID_CATALOG_DRAFT');}
});
test('C01 output is deeply frozen and detached from caller data',()=>{
  const input=clone(example),plan=build(input);
  input.products[0].name='modified';input.products[0].optionGroups[0].options[0].label='wrong';
  assert.equal(plan.operations[0].document.name,'草莓鲜奶蛋糕');
  assert.equal(plan.operations[0].document.optionGroups[0].options[0].label,'6寸');
  assert.ok(Object.isFrozen(plan.review[0].skus[0]));
  assert.throws(()=>{plan.operations[0].document.status='ON_SALE';},TypeError);
});
test('C01 repeat import skips existing data, preserves edited parents and never fills new SKUs under them',()=>{
  const first=build(),existing=first.operations.map(({collection,document})=>({collection,document:clone(document)}));
  existing[0].document.name='merchant edited';existing[0].document.status='ON_SALE';
  const before=JSON.stringify(existing),repeat=build(example,existing,settings,2000);
  assert.ok(repeat.operations.every(item=>item.type==='SKIP_EXISTING'));assert.equal(JSON.stringify(existing),before);
  const parentOnly=build(example,[existing[0]]);
  assert.equal(parentOnly.operations[0].type,'SKIP_EXISTING');
  assert.ok(parentOnly.operations.slice(1,4).every(item=>item.type==='SKIP_EXISTING_PARENT'));
});
test('C01 cross-store, orphan and changed selection collisions do not create partial parent plans',()=>{
  const first=build(),parent=clone(first.operations[0]),sku=clone(first.operations[1]);
  const entry=x=>({collection:x.collection,document:x.document});
  rejects(()=>build(example,[entry(sku)]),'CATALOG_DRAFT_CONFLICT');
  sku.document.selectedOptions[0].optionCode='INCH_8';
  rejects(()=>build(example,[entry(parent),entry(sku)]),'CATALOG_DRAFT_CONFLICT');
  parent.document.storeId='other';
  rejects(()=>build(example,[entry(parent)]),'INVALID_CATALOG_DRAFT');
});
test('C01 poster bytes match source digest and stay outside mini program images',()=>{
  const { measureImageBytes }=require('../cloudfunctions/_shared/media-model');
  const bytes=fs.readFileSync(path.join(__dirname,'..',example.reference.file));
  assert.equal(measureImageBytes(bytes,'image/png',8*1024*1024).contentHash,example.reference.sha256);
  assert.ok(bytes.length>2*1024*1024);
});
test('C01 CLI writes exclusive local plan, rejects overwrite / outside output / production without leaking input',()=>{
  const root=path.join(__dirname,'..'),outputRoot=path.join(root,'artifacts','catalog-drafts');
  fs.mkdirSync(outputRoot,{recursive:true});
  const directory=fs.mkdtempSync(path.join(outputRoot,'test-'));
  const configFile=path.join(directory,'settings.json'),output=path.join(directory,'plan.json');
  const run=target=>spawnSync(process.execPath,[path.join(root,'scripts','plan-catalog-drafts.js'),
    '--settings',configFile,'--output',target],{cwd:root,encoding:'utf8'});
  try{
    fs.writeFileSync(configFile,JSON.stringify({settings,now:1000}));
    const success=run(output);assert.equal(success.status,0,success.stderr);
    assert.equal(JSON.parse(fs.readFileSync(output,'utf8')).review.length,9);
    const bytes=fs.readFileSync(output);
    const repeat=run(output);assert.equal(repeat.status,1);assert.equal(JSON.parse(repeat.stderr).code,'OUTPUT_ALREADY_EXISTS');
    assert.deepEqual(fs.readFileSync(output),bytes);
    assert.equal(run(path.join(directory,'..','..','escape.json')).status,1);
    fs.writeFileSync(configFile,JSON.stringify({settings:{...settings,stage:'production',secret:'SHOULD_NOT_LEAK'},now:1000}));
    const production=run(path.join(directory,'rejected.json'));
    assert.equal(production.status,1);assert.ok(!production.stderr.includes('SHOULD_NOT_LEAK'));
    assert.ok(!fs.existsSync(path.join(directory,'rejected.json')));
  }finally{
    for(const file of [configFile,output])if(fs.existsSync(file))fs.unlinkSync(file);
    fs.rmdirSync(directory);
  }
});