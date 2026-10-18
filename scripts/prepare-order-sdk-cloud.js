'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..'),args=process.argv.slice(2);
if(args.length!==1||!/^--package=[a-zA-Z0-9_-]{1,64}$/.test(args[0]))throw new Error('INVALID_PACKAGE_ARGUMENT');
const packageName=args[0].slice(10),directory=path.join(root,'artifacts',packageName);
if(packageName.length>48)throw new Error('PACKAGE_NAME_TOO_LONG_FOR_RUN');
if(fs.existsSync(directory))throw new Error('VALIDATION_PACKAGE_EXISTS');
const target=path.join(directory,'functions','jjl-order-sdk-lab'),sources=new Map();
function add(source,destination){
  if(sources.has(destination))return;
  const text=fs.readFileSync(path.join(root,source),'utf8');sources.set(destination,{source,text});
  for(const match of text.matchAll(/require\(['"](\.[^'"]+)['"]\)/g)){
    const next=path.posix.normalize(path.posix.join(path.posix.dirname(source),match[1]+'.js'));
    const dest=path.posix.normalize(path.posix.join(path.posix.dirname(destination),match[1]+'.js'));
    if(dest.startsWith('../'))throw new Error('PACKAGE_DEPENDENCY_ESCAPE');
    add(next,dest);
  }
}
// Lab modules refer to shared/ in their deployed layout, so copy their fixed
// entry points separately and resolve the shared closure from its real root.
for(const [name,dest]of [['order-sdk-lab-handler','index'],['order-sdk-lab','order-sdk-lab'],['order-sdk-fixture','order-sdk-fixture'],['lab-catalog','lab-catalog']]){
  const source='scripts/cloud-checks/'+name+'.js',text=fs.readFileSync(path.join(root,source),'utf8');
  sources.set(dest+'.js',{source,text});
  for(const match of text.matchAll(/require\(['"]\.\/shared\/([^'"]+)['"]\)/g))add('cloudfunctions/_shared/'+match[1]+'.js','shared/'+match[1]+'.js');
}
for(const file of ['package.json','package-lock.json'])sources.set(file,{source:'cloudfunctions/user/'+file,text:fs.readFileSync(path.join(root,'cloudfunctions/user',file),'utf8')});
for(const [destination,{text}]of sources){const filename=path.join(target,destination);fs.mkdirSync(path.dirname(filename),{recursive:true});fs.writeFileSync(filename,text);}
const runId='order-sdk-'+packageName.toLowerCase().replaceAll('_','-');
if(runId.length>58)throw new Error('PACKAGE_NAME_TOO_LONG_FOR_RUN');
const environment={JJL_APP_ID:'wx154f791a17268ace',JJL_CLOUD_ENV:'dinner-cook-test-d5e320u981ec341',JJL_STAGE:'test',
  JJL_PROBE_RUN_ID:runId,JJL_PROBE_USER_ID:'c073607a6443289a38a05280e34515273fc34021d6f2613a4b89423a52a84227',JJL_PROBE_EXPIRES_AT:'0'};
fs.mkdirSync(path.join(directory,'miniprogram'),{recursive:true});
fs.writeFileSync(path.join(directory,'project.config.json'),JSON.stringify({appid:environment.JJL_APP_ID,projectname:'Order SDK isolated lab',compileType:'miniprogram',miniprogramRoot:'miniprogram/',cloudfunctionRoot:'functions/',setting:{es6:true}},null,2));
fs.writeFileSync(path.join(directory,'miniprogram','app.js'),"App({onLaunch(){wx.cloud.init({env:'"+environment.JJL_CLOUD_ENV+"',traceUser:false});}});");
fs.writeFileSync(path.join(directory,'miniprogram','app.json'),JSON.stringify({pages:['pages/index/index']}));
fs.mkdirSync(path.join(directory,'miniprogram','pages','index'),{recursive:true});
fs.writeFileSync(path.join(directory,'miniprogram','pages','index','index.js'),'Page({});');
fs.writeFileSync(path.join(directory,'miniprogram','pages','index','index.wxml'),'<view>SDK 隔离验收；不包含购买入口</view>');
fs.writeFileSync(path.join(directory,'environment.json'),JSON.stringify(environment,null,2));
const plan={runId,environment:environment.JJL_CLOUD_ENV,functionName:'jjl-order-sdk-lab',collection:'jjl_d04_probe_records',
  cases:['pickup','delivery','rollback-first','rollback-last'],maxDocuments:60,executeClaims:{pickup:2,delivery:2,'rollback-first':1,'rollback-last':1},
  expiryDefault:0,maxWindowMinutes:90,cleanup:'Set JJL_PROBE_EXPIRES_AT=0; retain bounded isolated records for audit; no deletes.',
  limitations:['Synthetic image/location validators only','Logical collections mapped to run-scoped envelopes; no formal collection/index acceptance','No payment, production, development or customer handler changes'],
  sources:[...sources].map(([destination,{source,text}])=>({source,destination,sha256:createHash('sha256').update(text).digest('hex')}))};
fs.writeFileSync(path.join(directory,'plan.json'),JSON.stringify(plan,null,2));
const calls=[];
fs.mkdirSync(path.join(directory,'native-calls'));
for(const caseId of plan.cases)for(const operation of ['prepare','execute',...(!caseId.startsWith('rollback-')?['execute']:[]),'audit']){
  const step=String(calls.length+1).padStart(2,'0'),ticket='orderLab_'+createHash('sha256').update(runId+step).digest('hex').slice(0,24);
  const filename=step+'-'+caseId+'-'+operation;
  // A persistent app ticket makes retrying an evaluation safe after a CLI
  // transport timeout. It never launches the same cloud request twice.
  const start="function(){const app=getApp();if(!app||!wx.cloud)return {started:false};if(app."+ticket+")return {started:true};"+
    "app."+ticket+"={state:'RUNNING'};wx.cloud.callFunction({name:'jjl-order-sdk-lab',data:{payload:{caseId:'"+caseId+"',operation:'"+operation+"'}},"+
    "config:{env:'"+environment.JJL_CLOUD_ENV+"'}}).then(function(r){app."+ticket+"={state:'COMPLETED',response:r.result,platformRequestId:r.requestID||r.requestId||null};})"+
    ".catch(function(){app."+ticket+"={state:'TRANSPORT_FAILED'};});return {started:true};}";
  const poll="function(){const app=getApp();return app&&app."+ticket+"||{state:'MISSING'};}";
  fs.writeFileSync(path.join(directory,'native-calls',filename+'.start.js'),start);
  fs.writeFileSync(path.join(directory,'native-calls',filename+'.poll.js'),poll);
  calls.push({step,caseId,operation,start:'native-calls/'+filename+'.start.js',poll:'native-calls/'+filename+'.poll.js'});
}
fs.writeFileSync(path.join(directory,'native-calls.json'),JSON.stringify({runId,steps:calls,stopOnFailure:true,
  recovery:'Do not recompile/restart after an uncertain call; poll its existing ticket first. Stop after 2–3 CLI failures; never replay a cloud mutation blindly.'},null,2));
fs.writeFileSync(path.join(directory,'部署操作.md'),`# 隔离订单 SDK 云验收\n\n1. 微信开发者工具导入本目录，确认 test 环境 dinner-cook-test-d5e320u981ec341。右键 functions/jjl-order-sdk-lab，上传并部署：云端安装依赖。运行时选择 Nodejs20.19，函数超时设置为20秒。\n2. 按 environment.json 设置6个环境变量。JJL_PROBE_EXPIRES_AT 先保持0。准备验收时，用 PowerShell 执行以下命令，将输出毫秒值填入该变量并保存：\n\n\`[DateTimeOffset]::UtcNow.AddMinutes(60).ToUnixTimeMilliseconds()\`\n\n3. 在这个隔离工程编译，告知已部署并开窗。我执行固定4场景、审计；成功场景最多2次（第二次原键重放），回滚场景最多1次。结束后把 JJL_PROBE_EXPIRES_AT 改回0。\n\n仅复用既有 test 的 jj l_d04_probe_records 集合（实际名称见 plan.json），最多60个新隔离文档。无新集合、真实商品、实际收件人、付款或清理删除。保留合成测试订单供审计，不作为经营订单。旧 jjl-d04-probe 不需要重新部署。\n`.replace('jj l_d04','jjl_d04'));
console.log(JSON.stringify({directory,functionName:plan.functionName,files:sources.size,cloudResourcesChanged:false}));
