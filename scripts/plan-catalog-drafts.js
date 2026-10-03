'use strict';
// Local C01 plan for the workspace user example. No upload, DB, SDK or executor.
const fs=require('node:fs'),path=require('node:path');
const example=require('../catalog-assets/development/catalog-example');
const { measureImageBytes }=require('../cloudfunctions/_shared/media-model');
const { buildCatalogDraftPlan }=require('../cloudfunctions/_shared/catalog-draft-model');
function within(root,target) {
  const relative=path.relative(root,target);
  return relative!==''&&relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);
}
function main(){
  try{
    const args=process.argv.slice(2),options={};
    if(args.length%2)throw new Error('INVALID_ARGUMENTS');
    for(let index=0;index<args.length;index+=2){
      if(!['--settings','--existing','--output'].includes(args[index])||options[args[index]]!==undefined||!args[index+1])throw new Error('INVALID_ARGUMENTS');
      options[args[index]]=args[index+1];
    }
    if(!options['--settings']||!options['--output'])throw new Error('INVALID_ARGUMENTS');
    const root=fs.realpathSync(path.resolve(__dirname,'..'));
    const outputRoot=path.join(root,'artifacts','catalog-drafts');
    const output=path.resolve(options['--output']);
    const actualOutputRoot=fs.realpathSync(outputRoot),actualParent=fs.realpathSync(path.dirname(output));
    if(!within(outputRoot,output)||actualOutputRoot!==outputRoot||!within(root,actualOutputRoot)||
        (actualParent!==actualOutputRoot&&!within(actualOutputRoot,actualParent)))throw new Error('OUTPUT_OUTSIDE_WORKSPACE');
    const source=fs.realpathSync(path.join(root,example.reference.file));
    if(!within(path.join(root,'catalog-assets','development'),source))throw new Error('REFERENCE_OUTSIDE_WORKSPACE');
    // Check stat before reading; the 8 MiB ceiling is a local tool limit, not a sales policy.
    if(fs.statSync(source).size>8*1024*1024)throw new Error('REFERENCE_TOO_LARGE');
    const measured=measureImageBytes(fs.readFileSync(source),'image/png',8*1024*1024);
    if(measured.contentHash!==example.reference.sha256)throw new Error('REFERENCE_HASH_MISMATCH');
    const config=JSON.parse(fs.readFileSync(path.resolve(options['--settings']),'utf8'));
    const existing=options['--existing']?JSON.parse(fs.readFileSync(path.resolve(options['--existing']),'utf8')):[];
    const plan=buildCatalogDraftPlan(example,existing,config.settings,config.now);
    const report={...plan,referenceVerification:{...measured,level:'SIGNATURE_ONLY_NOT_PUBLISHABLE'}};
    fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{encoding:'utf8',flag:'wx'});
    console.log(JSON.stringify({status:report.status,products:report.review.length,
      skus:report.review.reduce((sum,item)=>sum+item.skus.length,0),output:path.relative(root,output)}));
  }catch(error){
    const allowed=['INVALID_CATALOG_DRAFT','CATALOG_DRAFT_CONFLICT','SEED_ENVIRONMENT_REJECTED','INVALID_SEED_INPUT',
      'INVALID_MEDIA_BYTES','MEDIA_TYPE_MISMATCH'];
    const code=error&&allowed.includes(error.code)?error.code:error&&error.code==='EEXIST'?'OUTPUT_ALREADY_EXISTS':'CATALOG_DRAFT_PLAN_FAILED';
    console.error(JSON.stringify({code}));process.exitCode=1;
  }
}
if(require.main===module)main();
module.exports={within};