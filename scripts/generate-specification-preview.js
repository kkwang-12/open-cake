'use strict';
// C03 preview only; never import server IDs/resources, poster references or merchant test policy into miniprogram.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const example=require('../catalog-assets/development/catalog-example');
const {buildCatalogDraftPlan}=require('../cloudfunctions/_shared/catalog-draft-model');
function buildSpecificationPreview(){
  const plan=buildCatalogDraftPlan(example,[],{stage:'development',environment:'offline-specification-preview',
    expectedDevelopmentEnvironment:'offline-specification-preview',productionEnvironments:[],namespace:'dev-ui-specification'},1);
  const items=example.products.map((source,index)=>{
    const review=plan.review[index],product=plan.operations.find(item=>item.collection==='products'&&item.document._id===review.productId).document;
    const sourceSkus=plan.operations.filter(item=>item.collection==='skus'&&item.document.productId===product._id).map(item=>item.document);
    return {productId:'development-example-'+source.key,version:0,name:source.name,categoryCode:source.categoryCode,
      optionGroups:product.optionGroups,messagePolicy:null,
      messageSupport:source.messageDecision==='ENABLED'?'PENDING_LIMIT':source.messageDecision==='DISABLED'?'DISABLED':'UNKNOWN',
      minLeadTimeMinutes:null,source:'DEVELOPMENT_EXAMPLE',canPurchase:false,
      skus:sourceSkus.map((sku,skuIndex)=>({
        skuId:'development-example-sku-'+source.key+'-'+source.variants[skuIndex].key,version:0,
        description:sku.description,selectedOptions:sku.selectedOptions,unitPriceCents:sku.unitPriceCents,currency:'CNY',
        minQuantity:null,maxQuantity:null
      }))};
  });
  return {purpose:'TEMPORARY_DEVELOPMENT_EXAMPLE',
    revision:createHash('sha256').update(JSON.stringify(items)).digest('hex'),items};
}
if(require.main===module){
  const file=path.join(__dirname,'../miniprogram/fixtures/specification-development.js');
  const content='// Generated C03 development example. Not a purchase or database catalog.\nmodule.exports = '+JSON.stringify(buildSpecificationPreview(),null,2)+';\n';
  try{
    if(process.argv.length===3&&process.argv[2]==='--check'){
      if(fs.readFileSync(file,'utf8')!==content)throw new Error('SPECIFICATION_EXAMPLE_OUT_OF_DATE');
    }else if(process.argv.length===2)fs.writeFileSync(file,content,'utf8');
    else throw new Error('INVALID_ARGUMENTS');
    console.log('Specification development example: 9 products / 15 explicit variants.');
  }catch(_){console.error('Specification example generation/check failed.');process.exitCode=1;}
}
module.exports={buildSpecificationPreview};