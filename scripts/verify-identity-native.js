'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const project=path.join(root,'artifacts','cloud-env-validation-20261008');
const cli=process.env.WECHAT_DEVTOOLS_CLI || 'D:\\微信web开发者工具\\wechatide.cmd';
const quote=value=>"'"+String(value).replace(/'/g,"''")+"'";
function evaluate(source) {
  const command='& '+[cli,'-c','Codex','automation_evaluate','--project',project,'--fn-source',source.replace(/\r?\n/g,' ')].map(quote).join(' ');
  const execution=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',
    Buffer.from(command,'utf16le').toString('base64')],{encoding:'utf8',timeout:30000,windowsHide:true});
  if(execution.error || execution.status!==0) throw new Error('WECHAT_EVALUATION_FAILED');
  const output=execution.stdout||''; const start=output.indexOf('{');
  if(start<0) throw new Error('WECHAT_RESPONSE_MISSING');
  const envelope=JSON.parse(output.slice(start));
  if(!envelope.ok) { console.error(JSON.stringify({code:envelope.code,message:envelope.message})); throw new Error('WECHAT_EVALUATION_REJECTED'); }
  return envelope.result && envelope.result.result && envelope.result.result.result;
}
const source=`function() {
  const app=getApp();
  app.identityReview={state:'RUNNING'};
  const env='cloudbase-d8gwtxzm64150b7e0';
  wx.cloud.callFunction({name:'jjl-d06-identity-20261008',data:{action:'verify',payload:{role:'admin',openid:'synthetic-user'}},config:{env:env}})
    .then(function(response) {
      const db=wx.cloud.database({env:env});
      return Promise.all(['users','admin_roles','audit_logs'].map(function(name) {
        return db.collection(name).limit(1).get().then(function() {
          return {collection:name,denied:false};
        }).catch(function(error) {
          const code=error.errCode || error.code || null;
          return {collection:name,denied:code===-502003 || code==='PERMISSION_DENIED',code:code};
        });
      })).then(function(reads) {
        app.identityReview={state:'COMPLETED',time:new Date().toISOString(),scope:'REAL_WX_CLOUD_SIMULATOR',
          appId:'wx154f791a17268ace',environment:env,functionResult:response.result,
          platformRequestId:response.requestID||response.requestId||null,clientReads:reads};
      });
    }).catch(function(){app.identityReview={state:'FAILED',code:'SDK_CALL_FAILED'};});
  return {started:true};
}`;
if(evaluate(source).started!==true) throw new Error('ISOLATED_RUN_NOT_STARTED');
let result;
for(let attempt=0;attempt<20;attempt++) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,3000);
  result=evaluate("function() { return getApp().identityReview || {state:'MISSING'}; }");
  if(result && result.state!=='RUNNING') break;
}
if(!result || result.state!=='COMPLETED') throw new Error('NATIVE_RUN_INCOMPLETE');
const assertions=[];
const expected=['stable-native-owner','repeat-read-does-not-create','persisted-native-tuple','default-record-shape','single-user-for-native-tuple'];
const data=result.functionResult.data;
for(const name of expected) assertions.push({name,passed:result.functionResult.ok===true && !!data &&
  Array.isArray(data.assertions) && data.assertions.filter(row=>row.name===name && row.passed===true).length===1});
for(const name of ['users','admin_roles','audit_logs']) assertions.push({name:'client-read-denied:'+name,
  passed:result.clientReads.filter(row=>row.collection===name && row.denied===true).length===1});
const output=path.join(root,'docs','qa','identity-cloud-2026-10-08','native-'+Date.now()+'.json');
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,JSON.stringify({...result,assertions,passed:assertions.every(row=>row.passed),
  device:'NOT_RUN',indexConflict:'NOT_RUN',concurrency:'NOT_RUN'},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output,firstCreated:data && data.firstCreated,assertions,passed:assertions.every(row=>row.passed)}));
if(assertions.some(row=>!row.passed)) process.exitCode=1;
