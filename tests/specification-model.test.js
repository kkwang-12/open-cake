'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const {createSpecificationModel}=require('../miniprogram/utils/specification-model');
const {createSpecificationClient}=require('../miniprogram/services/specification');
const {buildSpecificationPreview}=require('../scripts/generate-specification-preview');
const examples=require('../miniprogram/fixtures/specification-development');
const {resolveSku}=require('../cloudfunctions/_shared/catalog-model');
const clone=value=>JSON.parse(JSON.stringify(value));
const rejects=(run,code)=>assert.throws(run,error=>error.code===code);
function configuration(){
  // OFFLINE TEST ONLY: these choices/prices/quantity/lead-time/message limits are not merchant policy.
  const groups=[
    {groupCode:'SIZE',label:'测试尺寸',required:true,options:[{optionCode:'S',label:'测试小尺寸'},{optionCode:'L',label:'测试大尺寸'}]},
    {groupCode:'FLAVOR',label:'测试口味',required:true,options:[{optionCode:'V',label:'测试香草'},{optionCode:'C',label:'测试巧克力'}]},
    {groupCode:'FILLING',label:'测试夹心',required:true,options:[{optionCode:'FRUIT',label:'测试水果'},{optionCode:'GANACHE',label:'测试甘纳许'}]},
    {groupCode:'TOPPING',label:'测试可选装饰',required:false,options:[{optionCode:'NUT',label:'测试坚果'}]}
  ];
  const variants=[
    ['s-fruit',['S','V','FRUIT'],16800,3],['s-ganache',['S','V','GANACHE'],17800,3],
    ['l-vanilla',['L','V','GANACHE'],29800,2],['l-chocolate',['L','C','GANACHE'],24800,2],
    ['l-nut',['L','C','GANACHE','NUT'],25800,2]
  ];
  return {productId:'offline-c03-product',version:1,name:'仅离线测试商品',categoryCode:'CAKE',
    optionGroups:groups,messagePolicy:{maxLength:12,normalizationVersion:'unicode-nfc-trim-codepoints-v1'},minLeadTimeMinutes:60,
    skus:variants.map(([skuId,values,unitPriceCents,maxQuantity])=>({
      skuId,version:2,description:'仅离线测试规格',selectedOptions:values.map((optionCode,index)=>({groupCode:groups[index].groupCode,optionCode,label:'not authoritative'})),
      unitPriceCents,currency:'CNY',minQuantity:1,maxQuantity
    }))};
}
function choices(values){return ['SIZE','FLAVOR','FILLING','TOPPING'].slice(0,values.length).map((groupCode,index)=>({groupCode,optionCode:values[index]}));}
test('C03 group choices/labels/prices/quantity are data driven; incomplete and nonexistent combinations never pick a SKU',()=>{
  const model=createSpecificationModel(configuration()),empty=model.evaluate();
  assert.equal(empty.status,'INCOMPLETE');assert.equal(empty.matchedSku,null);
  assert.ok(empty.groups[0].options.every(option=>option.enabled));
  assert.ok(empty.groups[1].options.every(option=>!option.enabled));
  const selected=model.evaluate(choices(['S','V','FRUIT']));
  assert.equal(selected.status,'MATCHED');assert.equal(selected.matchedSku.skuId,'s-fruit');
  assert.equal(selected.matchedSku.unitPriceCents,16800);assert.deepEqual(selected.quantityLimits,{minQuantity:1,maxQuantity:3});
  assert.equal(selected.selectedOptions[0].label,'测试小尺寸');
  assert.equal(model.evaluate(choices(['S','C','FRUIT'])).status,'INVALID_COMBINATION');
  rejects(()=>model.changeOption(empty,{groupCode:'FLAVOR',optionCode:'C'}),'INVALID_SPECIFICATION_SELECTION');
});
test('C03 size switch retains compatible flavor, clears incompatible filling and prompts without auto-choosing a replacement',()=>{
  const model=createSpecificationModel(configuration()),before=model.evaluate(choices(['S','V','FRUIT']));
  const after=model.changeOption(before,{groupCode:'SIZE',optionCode:'L'});
  assert.deepEqual(after.selectedOptions.map(option=>option.optionCode),['L','V']);
  assert.equal(after.status,'INCOMPLETE');assert.equal(after.matchedSku,null);
  assert.deepEqual(after.clearedOptions,[{groupCode:'FILLING',optionCode:'FRUIT',reason:'INCOMPATIBLE'}]);
  assert.equal(after.notice,'部分规格已不适用，请重新选择。');
  const confirmed=model.changeOption(after,{groupCode:'FILLING',optionCode:'GANACHE'});
  assert.equal(confirmed.matchedSku.skuId,'l-vanilla');assert.equal(confirmed.matchedSku.unitPriceCents,29800);
  assert.deepEqual(confirmed.quantityLimits,{minQuantity:1,maxQuantity:2});
  assert.equal(before.matchedSku.skuId,'s-fruit');
});
test('C03 upstream reset clears dependent options while compatible downstream selections survive',()=>{
  const model=createSpecificationModel(configuration()),before=model.evaluate(choices(['L','C','GANACHE','NUT']));
  const reset=model.changeOption(before,{groupCode:'SIZE',optionCode:null});
  assert.equal(reset.selectedOptions.length,0);assert.equal(reset.clearedOptions.length,3);
  const keep=model.changeOption(model.evaluate(choices(['S','V','GANACHE'])),{groupCode:'SIZE',optionCode:'L'});
  assert.equal(keep.matchedSku.skuId,'l-vanilla');assert.equal(keep.clearedOptions.length,0);
  rejects(()=>model.changeOption(model.evaluate(choices(['S'])),{groupCode:'FLAVOR',optionCode:'C'}),'INVALID_SPECIFICATION_SELECTION');
});
test('C03 optional omission resolves only the explicitly configured empty choice; optional selection is never implicit',()=>{
  const model=createSpecificationModel(configuration()),plain=model.evaluate(choices(['L','C','GANACHE']));
  assert.equal(plain.matchedSku.skuId,'l-chocolate');
  assert.equal(plain.groups[3].options[0].selected,false);
  const nut=model.changeOption(plain,{groupCode:'TOPPING',optionCode:'NUT'});
  assert.equal(nut.matchedSku.skuId,'l-nut');
  assert.equal(model.changeOption(nut,{groupCode:'TOPPING',optionCode:null}).matchedSku.skuId,'l-chocolate');
  const value=configuration();value.skus=value.skus.filter(sku=>sku.skuId!=='l-chocolate');
  assert.equal(createSpecificationModel(value).evaluate(choices(['L','C','GANACHE'])).status,'INVALID_COMBINATION');
});
test('C03 duplicate combos/IDs, missing required choices and malformed prices/quantity policies reject configuration',()=>{
  for(const mutate of [
    input=>input.skus.push(clone(input.skus[0])),
    input=>input.skus.push({...clone(input.skus[0]),skuId:'duplicate-combination'}),
    input=>input.skus[0].selectedOptions.pop(),
    input=>input.skus[0].unitPriceCents=12.5,
    input=>input.skus[0].minQuantity=null,
    input=>input.skus[0].maxQuantity=0,
    input=>input.optionGroups.push(clone(input.optionGroups[0])),
    input=>input.optionGroups[0].options.push(clone(input.optionGroups[0].options[0])),
    input=>input.categoryCode='DRINKS',
    input=>input.messagePolicy.normalizationVersion='unknown'
  ]){const input=configuration();mutate(input);rejects(()=>createSpecificationModel(input),'INVALID_SPECIFICATION_CONFIGURATION');}
});
test('readonly public configuration preserves unknown purchase limits, but never permits missing price or purchase-capable input',()=>{
  const input=configuration();input.source='PUBLIC_CATALOG';input.canPurchase=false;input.minLeadTimeMinutes=null;
  input.skus.forEach(sku=>{sku.minQuantity=null;sku.maxQuantity=null;});
  const model=createSpecificationModel(input),state=model.evaluate(choices(['S','V','FRUIT']));
  assert.equal(state.status,'MATCHED');assert.equal(state.configurationPending,true);assert.equal(state.canPurchase,false);
  assert.equal(model.configuration().minLeadTimeMinutes,null);
  rejects(()=>createSpecificationModel({...input,canPurchase:true}),'INVALID_SPECIFICATION_CONFIGURATION');
  const missingPrice=clone(input);missingPrice.skus[0].unitPriceCents=null;
  rejects(()=>createSpecificationModel(missingPrice),'INVALID_SPECIFICATION_CONFIGURATION');
});
test('C03 selection/schema/getter/non-JSON/sparse inputs fail without executing hooks or trusting supplied labels',()=>{
  const model=createSpecificationModel(configuration());
  for(const selected of [[{groupCode:'UNKNOWN',optionCode:'A'}],choices(['BAD']),
    [{groupCode:'SIZE',optionCode:'S'},{groupCode:'SIZE',optionCode:'L'}],
    [{groupCode:'SIZE',optionCode:'S',unitPriceCents:1}],[,]])
    rejects(()=>model.evaluate(selected),'INVALID_SPECIFICATION_SELECTION');
  let invoked=0;
  const input=configuration();Object.defineProperty(input,'optionGroups',{get(){invoked++;return [];},enumerable:true});
  rejects(()=>createSpecificationModel(input),'INVALID_SPECIFICATION_CONFIGURATION');assert.equal(invoked,0);
  const hook=configuration();Object.defineProperty(hook,'toJSON',{get(){invoked++;throw new Error('should not run');}});
  assert.equal(createSpecificationModel(hook).evaluate().status,'INCOMPLETE');assert.equal(invoked,0);
  const cycle=configuration();cycle.extra=cycle;
  rejects(()=>createSpecificationModel(cycle),'INVALID_SPECIFICATION_CONFIGURATION');
  assert.equal(model.evaluate([{groupCode:'SIZE',optionCode:'S',label:'spoof'}]).selectedOptions[0].label,'测试小尺寸');
});
test('C03 product revision reconciliation clears removed selections and requires explicit reconfirmation',()=>{
  const input=configuration(),old=createSpecificationModel(input).evaluate(choices(['S','V','FRUIT']));
  input.version=2;input.optionGroups[2].options=input.optionGroups[2].options.filter(option=>option.optionCode!=='FRUIT');
  input.skus=input.skus.filter(sku=>sku.skuId!=='s-fruit');
  const updated=createSpecificationModel(input);
  rejects(()=>updated.changeOption(old,{groupCode:'SIZE',optionCode:'L'}),'SPECIFICATION_VERSION_CHANGED');
  const refreshed=updated.reconcile(old);
  assert.deepEqual(refreshed.selectedOptions.map(option=>option.optionCode),['S','V']);
  assert.equal(refreshed.requiresReconfirmation,true);assert.equal(refreshed.matchedSku,null);
  rejects(()=>updated.reconcile({...old,productId:'another-product'}),'INVALID_SPECIFICATION_SELECTION');
});
test('C03 SKU revision/price/quantity changes require reconfirmation even when product version is unchanged',()=>{
  const input=configuration(),old=createSpecificationModel(input).evaluate(choices(['S','V','FRUIT']));
  input.skus[0].version=3;input.skus[0].unitPriceCents=18800;input.skus[0].maxQuantity=2;
  const updated=createSpecificationModel(input);
  rejects(()=>updated.changeOption(old,{groupCode:'SIZE',optionCode:'L'}),'SPECIFICATION_VERSION_CHANGED');
  const refreshed=updated.reconcile(old);
  assert.equal(refreshed.matchedSku.unitPriceCents,18800);assert.equal(refreshed.quantityLimits.maxQuantity,2);
  assert.equal(refreshed.requiresReconfirmation,true);assert.equal(refreshed.notice,'商品规格已更新，请重新确认。');
});
test('C03 client match agrees with authoritative D03 for every explicit offline SKU and never exposes resources',()=>{
  const input=configuration(),model=createSpecificationModel(input);
  const product={_id:input.productId,storeId:'offline-store',status:'ON_SALE',...input};
  const serverSkus=input.skus.map(sku=>({...sku,_id:sku.skuId,storeId:'offline-store',productId:input.productId,status:'ON_SALE',
    stockRequirements:[{resourceId:'offline-test-only-resource',unitsPerItem:1}]}));
  for(const sku of input.skus){
    const state=model.evaluate(sku.selectedOptions),resolved=resolveSku(product,serverSkus,sku.selectedOptions,state.matchedSku.skuId);
    assert.equal(state.matchedSku.unitPriceCents,resolved.unitPriceCents);
    assert.deepEqual(state.matchedSku.selectedOptions,resolved.selectedOptions);
    assert.equal(state.canPurchase,false);
    assert.ok(!JSON.stringify(state).includes('stockRequirements'));
  }
});
test('C03 model configuration and state are detached, deeply frozen public whitelists',()=>{
  const input=configuration();input.privateAdminNote='PRIVATE';
  input.optionGroups[0].private='PRIVATE';input.skus[0].stockRequirements=['PRIVATE'];
  const model=createSpecificationModel(input),state=model.evaluate(choices(['S','V','FRUIT']));
  input.name='changed';input.skus[0].unitPriceCents=1;
  assert.equal(model.configuration().name,'仅离线测试商品');assert.equal(state.matchedSku.unitPriceCents,16800);
  assert.ok(!JSON.stringify(model.configuration()).includes('PRIVATE'));
  assert.ok(Object.isFrozen(state.groups[0].options[0]));
  assert.throws(()=>{state.matchedSku.unitPriceCents=1;},TypeError);
});
test('C03 generated user preview retains 9 products/15 explicit variants and never guesses missing operating limits',async()=>{
  assert.deepEqual(examples,buildSpecificationPreview());
  const client=createSpecificationClient({stage:'development',mode:'shell'});
  let variantCount=0;
  for(const sample of examples.items){
    const config=await client.get(sample.productId),model=createSpecificationModel(config);
    variantCount+=config.skus.length;
    assert.equal(config.minLeadTimeMinutes,null);assert.equal(config.canPurchase,false);
    for(const sku of config.skus){
      const state=model.evaluate(sku.selectedOptions);
      assert.equal(state.status,'MATCHED');assert.equal(state.configurationPending,true);
      assert.deepEqual(state.quantityLimits,{minQuantity:null,maxQuantity:null});
    }
  }
  assert.equal(examples.items.length,9);assert.equal(variantCount,15);
  const cake=await client.get('development-example-strawberry-cake');
  assert.equal(cake.messageSupport,'PENDING_LIMIT');assert.equal(cake.messagePolicy,null);
  assert.deepEqual(cake.skus.map(sku=>sku.unitPriceCents),[16800,23800,32800]);
  const bread=await client.get('development-example-bagel-example');
  const state=createSpecificationModel(bread).evaluate();
  assert.equal(state.groups.length,0);assert.equal(state.matchedSku.unitPriceCents,1200);assert.equal(state.messageSupport,'DISABLED');
  assert.equal((await client.get('development-example-strawberry-mini')).messageSupport,'DISABLED');
});
test('C03 preview service rejects other stages/cloud mode/invalid IDs/duplicates and cannot upgrade preview to formal',async()=>{
  for(const settings of [{stage:'production',mode:'shell'},{stage:'test',mode:'shell'},{stage:'development',mode:'cloud'}])
    await assert.rejects(createSpecificationClient(settings).get(examples.items[0].productId),error=>error.code==='CLOUD_NOT_CONFIGURED');
  await assert.rejects(createSpecificationClient({stage:'unknown',mode:'shell'}).get('a'),error=>error.code==='INVALID_CONFIGURATION');
  const client=createSpecificationClient({stage:'development',mode:'shell'});
  await assert.rejects(client.get('server-product-id'),error=>error.code==='INVALID_REQUEST');
  const duplicate=clone(examples);duplicate.items.push(clone(duplicate.items[0]));
  await assert.rejects(createSpecificationClient({stage:'development',mode:'shell'},duplicate).get(duplicate.items[0].productId),error=>error.code==='INVALID_RESPONSE');
  const upgraded=clone(examples);upgraded.items[0].canPurchase=true;
  await assert.rejects(createSpecificationClient({stage:'development',mode:'shell'},upgraded).get(upgraded.items[0].productId),error=>error.code==='INVALID_RESPONSE');
});
test('C03 services/utils load using JS-only module resolution without Node built-ins',async()=>{
  const file=path.join(__dirname,'../miniprogram/services/specification.js'),load=createRequire(file);
  const context={module:{exports:{}},require:name=>{
    assert.ok(!name.endsWith('.json'));assert.ok(!name.startsWith('node:'));
    return name==='../config'?{stage:'development',mode:'shell'}:load(name);
  }};
  vm.runInNewContext(fs.readFileSync(file,'utf8'),context);
  assert.equal((await context.module.exports.get('development-example-mango-cake')).skus.length,3);
  const utility=fs.readFileSync(path.join(__dirname,'../miniprogram/utils/specification-model.js'),'utf8');
  assert.ok(!/\brequire\s*\(/.test(utility));
});
