const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process');
const cli='D:\\微信开发者工具\\wechatide.cmd',project=process.cwd();
const quote=v=>"'"+String(v).replace(/'/g,"''")+"'";
function evaluate(source){
 const command='& '+[cli,'-c','Codex','automation_evaluate','--project',project,'--fn-source',source.replace(/\r?\n/g,' ')].map(quote).join(' ');
 const r=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')],{encoding:'utf8',timeout:35000,windowsHide:true});
 const out=r.stdout||'',start=out.indexOf('{');if(start<0)throw new Error('NO_RESPONSE');
 const envelope=JSON.parse(out.slice(start));if(!envelope.ok){const error=new Error(envelope.message);error.envelope=envelope;throw error;}
 if(!envelope.result || !envelope.result.result || !Object.prototype.hasOwnProperty.call(envelope.result.result,'result')){
  const summary={code:'AUTOMATION_ENVELOPE_UNEXPECTED',topKeys:Object.keys(envelope),resultKeys:envelope.result&&Object.keys(envelope.result),status:envelope.status||envelope.result&&envelope.result.status,taskId:envelope.taskId||envelope.result&&envelope.result.taskId,message:envelope.message||envelope.result&&envelope.result.message};
  const error=new Error(summary.message||summary.code);error.envelope=summary;throw error;
 }
 return envelope.result.result.result;
}
const source=process.argv[2]==='start'?"function(){const a=getApp();a.catalogHandoff20261011={state:'RUNNING'};wx.cloud.callFunction({name:'catalog',data:{action:'products.list',payload:{storeId:'g1-catalog-store',pageSize:50}},config:{env:'cloudbase-d8gwtxzm64150b7e0'}}).then(function(r){a.catalogHandoff20261011={state:'COMPLETED',list:r.result,requestId:r.requestID||r.requestId};}).catch(function(e){a.catalogHandoff20261011={state:'FAILED',code:e.errCode||e.code,message:e.errMsg};});return {started:true};}":"function(){return getApp().catalogHandoff20261011; }";
try {const result=evaluate(process.argv[3]?fs.readFileSync(process.argv[3],'utf8'):source);fs.writeFileSync(path.join('artifacts','catalog-'+process.argv[2]+'.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({state:result&&result.state,started:result&&result.started,ok:result&&result.list&&result.list.ok,count:result&&result.list&&result.list.data&&result.list.data.items.length,error:result&&result.list&&result.list.error,code:result&&result.code}));}
catch(e){fs.writeFileSync('artifacts/catalog-tool-error.json',JSON.stringify(e.envelope||{message:e.message},null,2));console.error(e.message);process.exitCode=1;}
