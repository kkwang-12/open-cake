'use strict';
// Reproducible initial catalog candidate. Local files only; no SDK, deployment, upload or DB execution.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const source=require('../catalog-assets/initial-20261010/catalog');
const {createMediaDraft,projectMediaReference}=require('../cloudfunctions/_shared/media-model');
const {createCatalogReadModel}=require('../cloudfunctions/_shared/catalog-read-model');
const ENVIRONMENT='cloudbase-d8gwtxzm64150b7e0',STORE_ID='g1-catalog-store';
const CLOUD_PREFIX='cloud://'+ENVIRONMENT+'.636c-'+ENVIRONMENT+'-1501710237/catalog/g1-initial-20261010/';
function buildInitialCatalogPlan(images,now){
  if(!Array.isArray(images)||images.length!==9||!Number.isSafeInteger(now)||now<=0)throw new Error('INVALID_INITIAL_CATALOG');
  const context={environment:ENVIRONMENT,stage:'development',storeId:STORE_ID,allowReferenceImages:true,
    allowedCloudPrefixes:[CLOUD_PREFIX],now,maxBytes:8*1024*1024};
  const keys=new Set(),uploads=[],products=[],skus=[],mediaAssets=[];
  const base=_id=>({_id,schemaVersion:1,version:0,createdAt:now,updatedAt:now});
  for(const [sortOrder,product] of source.products.entries()){
    const matched=images.filter(image=>image.key===product.key);
    if(matched.length!==1||keys.has(product.key))throw new Error('INVALID_INITIAL_CATALOG');
    keys.add(product.key);
    const image=matched[0],file=product.key+'-r1.png';
    const asset={...createMediaDraft({assetId:'g1-initial-'+product.key,revision:'r1',storageRef:CLOUD_PREFIX+file,
      sourceKind:'DESIGN_PREVIEW',mimeType:'image/png'},image.bytes,context),status:'PUBLISHED',catalogApproved:true,
      provenance:{type:'AI_GENERATED_REFERENCE',approvalDate:source.adoption.date,referenceHash:source.adoption.reference.sha256}};
    const productId='g1-initial-'+product.key;
    products.push({...base(productId),storeId:STORE_ID,categoryCode:product.categoryCode,name:product.name,
      description:'AI 参考配图，商品外观以实际制作为准。',sortOrder,optionGroups:product.optionGroups,
      images:[projectMediaReference(asset,context,'PUBLIC_CATALOG')],status:'ON_SALE',
      messagePolicy:null,messageSupport:product.messageDecision==='ENABLED'?'PENDING_LIMIT':'DISABLED',
      minLeadTimeMinutes:null,operatingAdoption:source.adoption.date});
    for(const variant of product.variants)skus.push({...base(productId+'-'+variant.key),storeId:STORE_ID,productId,
      description:variant.description,selectedOptions:variant.selectedOptions,unitPriceCents:variant.unitPriceCents,
      currency:'CNY',minQuantity:null,maxQuantity:null,stockRequirements:[],status:'ON_SALE'});
    mediaAssets.push(asset);
    uploads.push({key:product.key,file,cloudPath:'catalog/g1-initial-20261010/'+file,
      storageRef:asset.storageRef,contentHash:asset.contentHash,byteLength:asset.byteLength});
  }
  const categories=[['CAKE','蛋糕','CAKE'],['MINI_CAKE','小蛋糕','MINI CAKE'],['BREAD','面包','BREAD']]
    .map(([code,nameZh,nameEn],sortOrder)=>({...base('g1-initial-category-'+code),code,nameZh,nameEn,sortOrder,published:true}));
  const records={categories,products,skus,mediaAssets};
  const reader=createCatalogReadModel(records,context,{id:'local-plan-verification-only',secret:Buffer.alloc(32,9)});
  const page=reader.productsList({storeId:STORE_ID},now);
  if(page.items.length!==9||page.hasMore||reader.categoriesList().items.length!==3||skus.length!==15)throw new Error('INITIAL_CATALOG_NOT_READABLE');
  for(const product of products)reader.productGet({productId:product._id});
  const exactPaths=uploads.map(upload=>"resource.path == '"+upload.cloudPath+"'").join(' || ');
  const owner="resource.openid != null && resource.openid != '' && (resource.openid == auth.openid || resource.openid == auth.uid)";
  const storageRule={read:"auth != null && (("+owner+") || (auth.loginType != 'ANONYMOUS' && ("+exactPaths+")))",write:false};
  return {environment:ENVIRONMENT,stage:'development',storeId:STORE_ID,allowedCloudPrefixes:[CLOUD_PREFIX],
    status:'LOCAL_CANDIDATE_NOT_APPLIED',adoption:source.adoption,createdAt:now,
    budget:{categories:3,products:9,skus:15,media_assets:9,totalDocuments:36,uploads:9},
    uploads,storageRule,documents:{categories,products,skus,media_assets:mediaAssets},
    applyPolicy:'CREATE_ONLY_NO_OVERWRITE; VERIFY_TARGET_EMPTY_AND_FILE_IDS_BEFORE_INSERT; NO_STORE_OR_TRANSACTION_WRITES'};
}
function main(){
  const root=path.resolve(__dirname,'..'),directory=path.join(root,'catalog-assets','initial-20261010');
  const manifest=JSON.parse(fs.readFileSync(path.join(directory,'images.json'),'utf8'));
  const images=manifest.images.map(image=>{
    if(image.file!==image.key+'-r1.png')throw new Error('INVALID_IMAGE_PATH');
    const bytes=fs.readFileSync(path.join(directory,image.file));
    if(crypto.createHash('sha256').update(bytes).digest('hex')!==image.sha256)throw new Error('IMAGE_HASH_MISMATCH');
    return {key:image.key,bytes};
  });
  const plan=buildInitialCatalogPlan(images,manifest.createdAt);
  const output=path.join(root,'artifacts','g1-initial-catalog-20261010.json');
  fs.writeFileSync(output,JSON.stringify(plan,null,2)+'\n');
  console.log(JSON.stringify({status:plan.status,budget:plan.budget,output}));
}
if(require.main===module)main();
module.exports={buildInitialCatalogPlan,ENVIRONMENT,STORE_ID,CLOUD_PREFIX};
