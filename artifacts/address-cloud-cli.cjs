'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const [tag,tool,...args]=process.argv.slice(2),allowed=new Set(['cloud_fn_deploy','cloud_fn_inc_deploy','cloud_fn_info','cloud_db_write_struct','cloud_db_read_struct','cloud_db_read_doc','polling_task_result']);
if(!allowed.has(tool)||!/^[-a-z0-9]+$/.test(tag||''))throw new Error('INVALID_REVIEWED_TOOL');
const appid='wx154f791a17268ace',env='cloudbase-d8gwtxzm64150b7e0';
const quote=v=>"'"+String(v).replace(/'/g,"''")+"'";
const command='& '+['D:\\微信开发者工具\\wechatide.cmd','-c','Codex',tool,...(tool==='polling_task_result'?[]:['--appid',appid,'--env',env]),...args].map(quote).join(' ');
const response=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')],{encoding:'utf8',timeout:65000,windowsHide:true});
const output=response.stdout||'',start=output.indexOf('{');let envelope;
try{envelope=JSON.parse(output.slice(start));}catch(_){console.error(JSON.stringify({tag,tool,error:response.error&&response.error.code||'INVALID_CLI_RESPONSE'}));process.exit(1);}
// Function info may contain environment secrets: redact all variable values before persistence/output.
function redact(value){if(Array.isArray(value))return value.map(redact);if(!value||typeof value!=='object')return value;
 const result={};for(const [key,item] of Object.entries(value)){
  if(/^value$/i.test(key)&&typeof value.Key==='string'){result[key]='[REDACTED]';continue;}
  if(/secret|token|password|base64code|codeinfo/i.test(key)){result[key]='[REDACTED]';continue;}
  result[key]=redact(item);
 }return result;
}
const safe=redact(envelope),directory=path.join(process.cwd(),'docs','qa','address-cloud-20261011');fs.mkdirSync(directory,{recursive:true});
fs.writeFileSync(path.join(directory,tag+'.json'),JSON.stringify(safe,null,2)+'\n');
console.log(JSON.stringify({tag,tool,ok:safe.ok,result:safe.result,error:safe.errorType,message:safe.message}));
if(safe.ok!==true||safe.result&&safe.result.success===false)process.exitCode=1;
