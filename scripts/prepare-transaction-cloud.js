'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..');
const name='jjl-d04-probe';
const functionRoot=path.join(root,'artifacts','d04-cloud-probe','functions');
const target=path.join(functionRoot,name);
if(fs.existsSync(target))throw new Error('VALIDATION_PACKAGE_EXISTS');
const files=[['scripts/cloud-checks/transaction-probe.js','index.js'],
  ['cloudfunctions/user/package.json','package.json'],['cloudfunctions/user/package-lock.json','package-lock.json']];
for(const moduleName of ['runtime','native-context','cloud-document-transaction','cloud-transaction-probe',
  'authorization-model','idempotency-model','trade-model','resource-model'])
  files.push(['cloudfunctions/_shared/'+moduleName+'.js','shared/'+moduleName+'.js']);
fs.mkdirSync(path.join(target,'shared'),{recursive:true});
for(const [source,destination] of files)fs.copyFileSync(path.join(root,source),path.join(target,destination));
console.log(JSON.stringify({functionName:name,functionRoot,cloudResourcesChanged:false,
  sources:files.map(([source])=>({source,sha256:createHash('sha256').update(fs.readFileSync(path.join(root,source))).digest('hex')}))}));
