'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..');
const functionName='jjl-d06-identity-20261008';
const functionRoot=path.join(root,'artifacts','identity-cloud-20261008','functions');
const target=path.join(functionRoot,functionName);
if(fs.existsSync(target)) throw new Error('VALIDATION_PACKAGE_EXISTS');
fs.mkdirSync(path.join(target,'shared'),{recursive:true});
const files=[['scripts/cloud-checks/identity-persistence.js','index.js'],
  ['cloudfunctions/user/package.json','package.json'],['cloudfunctions/user/package-lock.json','package-lock.json']];
for(const name of ['runtime','native-context','cloud-identity-repository','authorization-model','idempotency-model','trade-model'])
  files.push(['cloudfunctions/_shared/'+name+'.js','shared/'+name+'.js']);
for(const [source,destination] of files) fs.copyFileSync(path.join(root,source),path.join(target,destination));
console.log(JSON.stringify({functionName,functionRoot,sourceHashes:files.map(([source])=>({source,
  sha256:createHash('sha256').update(fs.readFileSync(path.join(root,source))).digest('hex')}))}));
