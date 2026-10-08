'use strict';
// Must be run against an already configured isolated WeChat test project.
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {randomBytes}=require('node:crypto');
const {runTransactionScenarios}=require('./cloud-checks/transaction-scenarios');
const {createNativeBatchTransport}=require('./cloud-checks/native-batch-transport');
const root=path.resolve(__dirname,'..');
const args=Object.fromEntries(process.argv.slice(2).map(value=>{
  const match=/^--(project|test-env|run-id)=(.+)$/.exec(value);
  if(!match)throw new Error('INVALID_RUN_ARGUMENT');return [match[1],match[2]];
}));
if(!args.project || !/^[A-Za-z0-9_-]{1,128}$/.test(args['test-env']||'') ||
  args['test-env']==='cloudbase-d8gwtxzm64150b7e0' || !/^[A-Za-z0-9_-]{16,48}$/.test(args['run-id']||''))
  throw new Error('ISOLATED_TEST_CONFIGURATION_REQUIRED');
const project=path.resolve(args.project);
if(project===root)throw new Error('ISOLATED_PROJECT_REQUIRED');
const config=JSON.parse(fs.readFileSync(path.join(project,'project.config.json'),'utf8'));
if(config.appid!=='wx154f791a17268ace')throw new Error('APP_MISMATCH');
const cli=process.env.WECHAT_DEVTOOLS_CLI || 'D:\\微信web开发者工具\\wechatide.cmd';
const quote=value=>"'"+String(value).replace(/'/g,"''")+"'";
function evaluate(source) {
  const command='& '+[cli,'-c','Codex','automation_evaluate','--project',project,'--fn-source',source].map(quote).join(' ');
  const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',
    Buffer.from(command,'utf16le').toString('base64')],{encoding:'utf8',timeout:30000,windowsHide:true});
  if(result.error || result.status!==0)throw new Error('WECHAT_EVALUATION_FAILED');
  const start=(result.stdout||'').indexOf('{');
  if(start<0)throw new Error('WECHAT_RESPONSE_MISSING');
  const envelope=JSON.parse(result.stdout.slice(start));
  if(!envelope.ok)throw new Error('WECHAT_EVALUATION_REJECTED');
  const data=envelope.result?.result?.result;
  if(!data)throw new Error('WECHAT_RESPONSE_MISSING');return data;
}
const transportRetries=[];
const invokeMany=createNativeBatchTransport({evaluate,environment:args['test-env'],
  ticketPrefix:'d04Batch_'+randomBytes(8).toString('hex'),
  pause:ms=>Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,ms),
  onRetry:row=>transportRetries.push(row)});
async function main() {
  let result,errorCode;
  const partialEvidence=[];
  try{result=await runTransactionScenarios({invokeMany,runId:args['run-id'],onEvidence:row=>partialEvidence.push(row)});}
  catch(error){errorCode=['INVALID_PROBE_RESPONSE','PROBE_RUN_NOT_FRESH','PROBE_READ_FAILED','PROBE_READ_INVALID',
    'WECHAT_EVALUATION_FAILED','WECHAT_RESPONSE_MISSING','WECHAT_EVALUATION_REJECTED','NATIVE_RUN_NOT_STARTED',
    'NATIVE_BATCH_FAILED','NATIVE_BATCH_TIMEOUT'].includes(error.message)?error.message:'PROBE_EXECUTION_FAILED';}
  const output=path.join(root,'docs','qa','d04-cloud','native-'+Date.now()+'.json');
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,JSON.stringify({scope:'REAL_WX_CLOUD_SIMULATOR',time:new Date().toISOString(),
    appId:config.appid,environment:args['test-env'],runId:args['run-id'],evidence:partialEvidence,...result,
    transportRetries,errorCode:errorCode||null,passed:!errorCode && result.passed,device:'NOT_RUN'},null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({output,passed:!errorCode && result.passed,errorCode:errorCode||null,
    assertions:result?.assertions || []}));
  if(errorCode || !result.passed)process.exitCode=1;
}
main().catch(()=>{console.error('PROBE_EXECUTION_FAILED');process.exitCode=1;});
