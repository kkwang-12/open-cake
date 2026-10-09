'use strict';
// P08 LOCAL EVIDENCE ONLY. Never loads keys, deploys or invokes money APIs.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {failureSummary}=require('./test-diagnostics');
const root=path.resolve(__dirname,'..');
const paymentTests=['payment-configuration','payment-intent','payment-notification','payment-recovery',
  'payment-session','refund','payment-maintenance'].map(name=>'tests/'+name+'.test.js');
const legacyTests=['domain','http','repository','wxml'].map(name=>'tests/'+name+'.test.js');
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
function fail(code){throw Object.assign(new Error(code),{code});}
function testResult(output,exitCode,minimumTests=1){
  const names=['tests','pass','fail','cancelled','skipped','todo'];
  const counts={};
  for(const name of names){
    const matches=[...output.matchAll(new RegExp('^# '+name+' (\\d+)\\r?$','gm'))];
    if(matches.length!==1)return {passed:false,counts:null};
    counts[name]=Number(matches[0][1]);
    if(!Number.isSafeInteger(counts[name]))return {passed:false,counts:null};
  }
  const passed=exitCode===0&&Number.isSafeInteger(minimumTests)&&minimumTests>0&&counts.tests>=minimumTests&&counts.pass===counts.tests&&
    ['fail','cancelled','skipped','todo'].every(name=>counts[name]===0);
  return {passed,counts};
}
function sourceSnapshot(){
  const files=[];
  function scan(relative){
    const absolute=path.join(root,relative),stat=fs.lstatSync(absolute);
    if(stat.isSymbolicLink())fail('EVIDENCE_SYMLINK_UNSUPPORTED');
    if(stat.isDirectory()){
      for(const item of fs.readdirSync(absolute).sort()){
        if(['node_modules','.git','data','keys','secrets','certs','certificates'].includes(item.toLowerCase())||
            item==='config.local.js'||/\.(?:private|secret)\./i.test(item))continue;
        scan(relative+'/'+item);
      }
    }else if(/\.(?:js|json|wxml|wxss|svg|png|jpe?g|webp|gif|html|css)$/.test(relative)){
      files.push({path:relative.replace(/\\/g,'/'),sha256:digest(fs.readFileSync(absolute))});
    }
  }
  // Fixed public/code roots; .env, private config, keys and local data are excluded.
  for(const entry of ['cloudfunctions','miniprogram','server','web','tests','scripts','package.json','project.config.json'])scan(entry);
  files.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
  return {sha256:digest(JSON.stringify(files)),files};
}
async function runtimeBoundary(){
  const config=require('../miniprogram/runtime-config');
  const example=JSON.parse(fs.readFileSync(path.join(root,'cloudfunctions/payment-settings.example.json'),'utf8'));
  const {createClient}=require('../miniprogram/services/cloud');
  const {paymentAvailability}=require('../miniprogram/features/payment/payment-session');
  let calls=0;
  const client=createClient({mode:'cloud',stage:'test',cloudEnvironments:{test:'OFFLINE_GATE_PROBE'}},
    ()=>({cloud:{init(){calls++;},callFunction(){calls++;}}}),{warn(){}});
  for(const action of ['create','state.get']){
    try{await client.call('payment',action,{});fail('PAYMENT_GATE_OPEN');}
    catch(error){if(error.code!=='INVALID_REQUEST')throw error;}
  }
  const availability=paymentAvailability();
  const closed=calls===0&&config.enableLegacyDemo===false&&!fs.existsSync(path.join(root,'cloudfunctions/payment'))&&
    ['development','test','production'].every(stage=>example.profiles?.[stage]===null)&&
    ['connected','callable','paymentAllowed','successPageAllowed'].every(key=>availability[key]===false);
  return {passed:closed,paymentPlatformCalls:calls,paymentFunctionPresent:fs.existsSync(path.join(root,'cloudfunctions/payment')),
    legacyEnabled:config.enableLegacyDemo===true,sessionConnected:availability.connected,paymentAllowed:availability.paymentAllowed,
    successPageAllowed:availability.successPageAllowed};
}
function runStep(id,args){
  return new Promise(resolve=>{
    const started=Date.now(),child=spawn(process.execPath,args,{cwd:root,windowsHide:true,shell:false});
    child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
    let output='',bytes=0,errorCode=null;
    const append=value=>{bytes+=Buffer.byteLength(value,'utf8');if(bytes>8*1024*1024){errorCode='EVIDENCE_OUTPUT_LIMIT';child.kill();}
      else output+=value;};
    child.stdout.on('data',append);child.stderr.on('data',append);
    child.on('error',()=>{errorCode='EVIDENCE_PROCESS_FAILED';});
    const timer=setTimeout(()=>{errorCode='EVIDENCE_PROCESS_TIMEOUT';child.kill();},60000);
    child.on('close',exitCode=>{clearTimeout(timer);resolve({id,args,exitCode,errorCode,durationMs:Date.now()-started,output});});
  });
}
function evidenceDirectory(name){
  if(!/^[A-Za-z0-9_-]{1,80}$/.test(name))fail('INVALID_EVIDENCE_DIRECTORY');
  const qa=path.join(root,'docs','qa');
  if(fs.lstatSync(qa).isSymbolicLink()||fs.realpathSync(qa)!==qa)fail('EVIDENCE_SYMLINK_UNSUPPORTED');
  const directory=path.join(qa,name);
  // Exclusive creation preserves earlier evidence and refuses existing links/files.
  fs.mkdirSync(directory);return directory;
}
async function verify(name='p08-'+new Date().toISOString().replace(/[:.]/g,'-')){
  console.log('Scope: complete LOCAL suite + Payment stage checks. Use verify:offline for joint Payment/Admin checks; do not stack full-suite runners.');
  const before=sourceSnapshot(),directory=evidenceDirectory(name),boundary=await runtimeBoundary();
  const all=fs.readdirSync(path.join(root,'tests')).filter(file=>file.endsWith('.test.js')).sort().map(file=>'tests/'+file);
  const remaining=all.filter(file=>!paymentTests.includes(file)&&!legacyTests.includes(file));
  const definitions=[['payment',paymentTests],['legacy-baseline',legacyTests],['other-regressions',remaining]];
  const checks=[];
  for(const [id,files] of definitions){
    if(!files.length)fail('EVIDENCE_EMPTY_TEST_GROUP');
    const result=await runStep(id,['--test','--test-reporter=tap',...files]);
    const parsed=testResult(result.output,result.exitCode,id==='legacy-baseline'?19:1);
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
    checks.push({...result,output:undefined,passed:result.exitCode===0&&result.errorCode===null,
      log:id+'.txt',logSha256:digest(result.output)});
    console.log(id+': '+(checks.at(-1).passed?'PASS':'FAIL'));
    if(!checks.at(-1).passed){
      if(result.errorCode)console.error('Runner: '+result.errorCode);
      for(const line of failureSummary(result.output))console.error(line);
      console.error('Log: '+path.join(directory,id+'.txt'));
    }
  }
  const after=sourceSnapshot(),unchanged=before.sha256===after.sha256;
  const report={schemaVersion:1,scope:'OFFLINE_PAYMENT_ACCEPTANCE_EVIDENCE',generatedAt:new Date().toISOString(),
    nodeVersion:process.version,platform:process.platform,sourceSnapshot:before,sourceUnchanged:unchanged,runtimeBoundary:boundary,
    checks,totalTests:checks.slice(0,3).reduce((sum,item)=>sum+(item.counts?.tests??0),0),
    offlinePassed:unchanged&&boundary.passed&&checks.every(check=>check.passed),
    realAcceptance:{passed:false,cloudVerified:false,cryptographicSourceVerified:false,realPaymentVerified:false,
      realRefundVerified:false,realDeviceVerified:false,realConcurrencyVerified:false},
    blockers:['E01_CLOUD_AND_SDK','E03_MERCHANT_AND_SINGLE_PROVIDER','E14_CONTROLLED_REAL_FUNDS',
      'AUTHENTICATED_PROVIDER_ADAPTERS','REAL_DEVICE_AND_DURABLE_CLIENT_RECOVERY','GLOBAL_UNIQUENESS_AND_CONCURRENCY',
      'SCHEDULER_AND_OPERATOR_ALERT_DELIVERY']};
  fs.writeFileSync(path.join(directory,'summary.json'),JSON.stringify(report,null,2)+'\n','utf8');
  console.log('Evidence: docs/qa/'+path.basename(directory)+'/summary.json');
  console.log('Offline: '+(report.offlinePassed?'PASS':'FAIL')+'; real Payment acceptance: NOT ACCEPTED');
  return report;
}
if(require.main===module){
  const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--help')console.log('node scripts/verify-payment-offline.js [--name <new-directory-under-docs/qa>]');
  else if(args.length!==0&&(args.length!==2||args[0]!=='--name')){console.error('INVALID_ARGUMENTS');process.exitCode=1;}
  else verify(args[1]).then(report=>{if(!report.offlinePassed)process.exitCode=1;}).catch(error=>{
    console.error(error.code||'EVIDENCE_FAILED');process.exitCode=1;
  });
}
module.exports={testResult,runtimeBoundary,sourceSnapshot,runStep,evidenceDirectory,verify,paymentTests,legacyTests};
