'use strict';
// A07 local evidence only: stubbed platform probes, no SDK, network or deployment.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const {testResult,sourceSnapshot,runStep,evidenceDirectory,runtimeBoundary}=require('./verify-payment-offline');
const {failureSummary}=require('./test-diagnostics');
const {ACTION_CONTRACTS}=require('../cloudfunctions/_shared/api-contract');
const {createClient}=require('../miniprogram/services/cloud');
const {pickupAvailability}=require('../miniprogram/features/admin/pickup-session');
const root=path.resolve(__dirname,'..'),digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const adminTests=['admin-access','merchant-order','pickup-session','merchant-catalog','merchant-store','merchant-resolution','admin-acceptance']
  .map(name=>'tests/'+name+'.test.js');
const legacyTests=['domain','http','repository','wxml'].map(name=>'tests/'+name+'.test.js');
async function probeLegacy(settings){
  // Execute the actual legacy guard in an isolated module. wx is always a stub.
  let platformCalls=0;const module={exports:{}};
  const platform=new Proxy({}, {get(){return ()=>{platformCalls++;throw new Error('OFFLINE_PLATFORM_PROBE');};}});
  const requireStub=name=>{
    if(name==='../config')return {apiBase:'http://127.0.0.1:3100/api'};
    if(name==='../../config')return settings;
    throw new Error('UNEXPECTED_LEGACY_DEPENDENCY');
  };
  vm.runInNewContext(fs.readFileSync(path.join(root,'miniprogram/legacy/utils/api.js'),'utf8'),
    {module,require:requireStub,wx:platform},{timeout:1000});
  let blocked=0;
  for(const [route,method,role] of [['/staff/login','POST','staff'],['/orders','POST','customer'],['/refunds/probe/simulate','POST','staff']]){
    try{await module.exports.request(route,method,{},role);}
    catch(error){if(error.message==='旧预订演示未启用，请返回首页')blocked++;}
  }
  return {stage:settings.stage,mode:settings.mode,enabled:settings.enableLegacyDemo===true,blocked,platformCalls,
    passed:blocked===3&&platformCalls===0};
}
function dependencyBoundary(){
  const files=sourceSnapshot().files.filter(item=>item.path.startsWith('miniprogram/')&&item.path.endsWith('.js')&&
    !item.path.startsWith('miniprogram/legacy/'));
  const violations=[];
  for(const {path:file} of files){
    const source=fs.readFileSync(path.join(root,file),'utf8');
    for(const match of source.matchAll(/require\(['"]([^'"]+)['"]\)/g)){
      if(!match[1].startsWith('.'))continue;
      const target=path.relative(root,path.resolve(root,path.dirname(file),match[1])).replace(/\\/g,'/');
      if(target.startsWith('miniprogram/legacy/'))violations.push({file,kind:'LEGACY_REQUIRE'});
    }
    if(/https?:\/\/(?:localhost|127\.0\.0\.1)(?=[:/\s'"`]|$)/i.test(source))violations.push({file,kind:'LOCALHOST_URL'});
  }
  const routes=require('../miniprogram/constants/routes').pages;
  if(Object.values(routes).some(route=>route.startsWith('/legacy/')))violations.push({file:'miniprogram/constants/routes.js',kind:'FORMAL_LEGACY_ROUTE'});
  return {passed:violations.length===0,checkedFiles:files.length,violations,
    scope:'LITERAL_RELATIVE_REQUIRES_AND_LOCALHOST_URLS_ONLY'};
}
async function adminBoundary(){
  let platformCalls=0;const rejected=[],unexpected=[];
  const client=createClient({mode:'cloud',stage:'test',cloudEnvironments:{test:'OFFLINE_ADMIN_PROBE'}},
    ()=>({cloud:{init(){platformCalls++;},callFunction(){platformCalls++;}}}),{warn(){}});
  const planned=Object.entries(ACTION_CONTRACTS).filter(([,item])=>item.status==='PLANNED');
  const catalogReads=new Set(['catalog.categories.list','catalog.products.list','catalog.product.get']);
  for(const [name,item] of planned){
    try{await client.call(item.domain,item.action,{});unexpected.push(name);}
    catch(error){
      const expected=catalogReads.has(name)?'CLOUD_NOT_CONFIGURED':'INVALID_REQUEST';
      (error.code===expected?rejected:unexpected).push(name);
    }
  }
  const settings=require('../miniprogram/runtime-config'),legacy=[];
  for(const stage of ['development','test','production'])for(const mode of ['shell','cloud'])for(const enabled of [false,true]){
    if(stage==='development'&&mode==='shell'&&enabled)continue;
    legacy.push(await probeLegacy({stage,mode,enableLegacyDemo:enabled}));
  }
  const dependencies=dependencyBoundary(),pickup=pickupAvailability(),payment=await runtimeBoundary();
  const functionPresent=fs.existsSync(path.join(root,'cloudfunctions/admin'));
  const pickupClosed=['connected','callable','confirmationAllowed','fulfillmentAllowed','successFeedbackAllowed'].every(key=>pickup[key]===false);
  return {passed:planned.length>0&&unexpected.length===0&&platformCalls===0&&!functionPresent&&settings.enableLegacyDemo===false&&
      legacy.every(probe=>probe.passed)&&dependencies.passed&&pickupClosed&&payment.passed,
    plannedActions:planned.length,rejectedActions:rejected.length,catalogReadActions:planned.filter(([name])=>catalogReads.has(name)).length,
    unexpected,platformCalls,adminFunctionPresent:functionPresent,
    legacyEnabled:settings.enableLegacyDemo===true,legacy,dependencies,pickupClosed,payment};
}
async function verify(name='a07-'+new Date().toISOString().replace(/[:.]/g,'-')){
  console.log('Scope: complete LOCAL suite + Admin stage checks. Use verify:offline for joint Payment/Admin checks; do not stack full-suite runners.');
  const before=sourceSnapshot(),directory=evidenceDirectory(name),boundary=await adminBoundary();
  // An interrupted run leaves an explicit incomplete report, never a green one.
  fs.writeFileSync(path.join(directory,'summary.json'),JSON.stringify({schemaVersion:1,scope:'OFFLINE_ADMIN_ACCEPTANCE_EVIDENCE',
    status:'RUNNING',offlinePassed:false,realAcceptance:{passed:false}})+'\n','utf8');
  const all=fs.readdirSync(path.join(root,'tests')).filter(file=>file.endsWith('.test.js')).sort().map(file=>'tests/'+file);
  const definitions=[['admin',adminTests,203],['legacy-baseline',legacyTests,19],
    ['other-regressions',all.filter(file=>!adminTests.includes(file)&&!legacyTests.includes(file)),1]];
  const checks=[];
  for(const [id,files,minimum] of definitions){
    if(!files.length)throw Object.assign(new Error('EVIDENCE_EMPTY_TEST_GROUP'),{code:'EVIDENCE_EMPTY_TEST_GROUP'});
    const result=await runStep(id,['--test','--test-reporter=tap',...files]),parsed=testResult(result.output,result.exitCode,minimum);
    fs.writeFileSync(path.join(directory,id+'.tap'),result.output,'utf8');
    checks.push({...result,output:undefined,...parsed,passed:parsed.passed&&result.errorCode===null,
      log:id+'.tap',logSha256:digest(result.output)});
    console.log(id+': '+(checks.at(-1).passed?'PASS':'FAIL')+' ('+(parsed.counts?.tests??'unknown')+')');
    if(!checks.at(-1).passed){
      if(result.errorCode)console.error('Runner: '+result.errorCode);
      for(const line of failureSummary(result.output))console.error(line);
      console.error('Log: '+path.join(directory,id+'.tap'));
    }
  }
  for(const [id,file] of [['static','scripts/check.js'],['icons','scripts/check-ui-icons.js']]){
    const result=await runStep(id,[file]);fs.writeFileSync(path.join(directory,id+'.txt'),result.output,'utf8');
    checks.push({...result,output:undefined,passed:result.exitCode===0&&result.errorCode===null,log:id+'.txt',logSha256:digest(result.output)});
    console.log(id+': '+(checks.at(-1).passed?'PASS':'FAIL'));
    if(!checks.at(-1).passed){
      if(result.errorCode)console.error('Runner: '+result.errorCode);
      for(const line of failureSummary(result.output))console.error(line);
      console.error('Log: '+path.join(directory,id+'.txt'));
    }
  }
  const after=sourceSnapshot(),sourceUnchanged=before.sha256===after.sha256;
  const report={schemaVersion:1,scope:'OFFLINE_ADMIN_ACCEPTANCE_EVIDENCE',generatedAt:new Date().toISOString(),
    nodeVersion:process.version,platform:process.platform,sourceSnapshot:before,sourceUnchanged,runtimeBoundary:boundary,checks,
    totalTests:checks.slice(0,3).reduce((sum,item)=>sum+(item.counts?.tests??0),0),
    offlinePassed:sourceUnchanged&&boundary.passed&&checks.every(check=>check.passed),
    realAcceptance:{passed:false,cloudVerified:false,administratorVerified:false,realDeviceVerified:false,
      realConcurrencyVerified:false,customerPagesConnected:false,merchantPagesConnected:false,realFundsVerified:false,legacyRetired:false},
    blockers:['E01_REAL_CLOUD_SDK_INDEXES_AND_QUERY_FENCES','E12_CONTROLLED_ADMIN_AUTHENTICATION',
      'D06_P08_REAL_ACCEPTANCE','APPROVED_CATALOG_INVENTORY_MAP_AND_OPERATING_POLICIES',
      'MERCHANT_AND_CUSTOMER_PAGE_WIRING','DURABLE_PICKUP_AND_PAYMENT_RECOVERY',
      'REAL_FUNDS_CONCURRENCY_AND_OPERATOR_ALERTS','LEGACY_PACKAGE_RELEASE_EXCLUSION']};
  fs.writeFileSync(path.join(directory,'summary.json'),JSON.stringify(report,null,2)+'\n','utf8');
  console.log('Evidence: docs/qa/'+path.basename(directory)+'/summary.json');
  console.log('Offline: '+(report.offlinePassed?'PASS':'FAIL')+'; real Admin acceptance: NOT ACCEPTED');return report;
}
if(require.main===module){
  const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--help')console.log('node scripts/verify-admin-offline.js [--name <new-directory-under-docs/qa>]');
  else if(args.length!==0&&(args.length!==2||args[0]!=='--name')){console.error('INVALID_ARGUMENTS');process.exitCode=1;}
  else verify(args[1]).then(report=>{if(!report.offlinePassed)process.exitCode=1;}).catch(error=>{
    console.error(error.code||'EVIDENCE_FAILED');process.exitCode=1;
  });
}
module.exports={probeLegacy,dependencyBoundary,adminBoundary,verify,adminTests};
