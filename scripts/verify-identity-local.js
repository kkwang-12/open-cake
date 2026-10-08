'use strict';
// Local regression evidence only; never invokes the cloud or edits app data.
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..');
const output=path.join(root,'docs','qa','identity-cloud-2026-10-08','local-'+Date.now());
fs.mkdirSync(output,{recursive:true});
const results=[];
for(const [name,args] of [['tests',['--test','tests/*.test.js']],['static',['scripts/check.js']]]) {
  const result=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',timeout:120000,windowsHide:true});
  fs.writeFileSync(path.join(output,name+'.txt'),(result.stdout||'')+(result.stderr||''),{flag:'wx'});
  results.push({name,exitCode:result.status,passed:!result.error && result.status===0});
}
const sources=['cloudfunctions/_shared/runtime.js','cloudfunctions/_shared/native-context.js',
  'cloudfunctions/_shared/cloud-identity-repository.js','cloudfunctions/user/index.js','cloudfunctions/store/index.js',
  'scripts/cloud-checks/identity-persistence.js','scripts/cloud-checks/initialization-rejection.js'];
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({scope:'LOCAL_REGRESSION_ONLY',
  time:new Date().toISOString(),nodeVersion:process.version,results,
  sources:sources.map(source=>({source,sha256:createHash('sha256').update(fs.readFileSync(path.join(root,source))).digest('hex')}))},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output,results}));
if(results.some(row=>!row.passed))process.exitCode=1;
