'use strict';
// Generate only the sanitized C02 Shop development view; original poster and server models stay outside miniprogram.
const fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');
const example=require('../catalog-assets/development/catalog-example');
const {buildCatalogDraftPlan}=require('../cloudfunctions/_shared/catalog-draft-model');
function buildPreview(){
  buildCatalogDraftPlan(example,[],{stage:'development',environment:'offline-ui-example',
    expectedDevelopmentEnvironment:'offline-ui-example',productionEnvironments:[],namespace:'dev-ui-example'},1);
  const items=example.products.map(product=>{
    const prices=product.variants.map(sku=>sku.unitPriceCents).filter(price=>price!==null);
    return {id:'development-example-'+product.key,categoryCode:product.categoryCode,name:product.name,
      description:product.categoryCode==='CAKE'?'6寸 / 8寸 / 10寸 · 开发示例':
        product.categoryCode==='MINI_CAKE'?'单个 · 开发示例':'开发示例单份 · 正式名称与规格待补',
      minPriceCents:prices.length?Math.min(...prices):null,currency:'CNY',
      priceFrom:product.variants.length>1,image:'',canPurchase:false};
  });
  return {purpose:'TEMPORARY_DEVELOPMENT_EXAMPLE',
    revision:createHash('sha256').update(JSON.stringify(items)).digest('hex'),items};
}
if(require.main===module){
  const file=path.join(__dirname,'../miniprogram/fixtures/shop-development.js');
  const content='// Generated temporary development example. No SKU authority or purchase support.\nmodule.exports = '+JSON.stringify(buildPreview(),null,2)+';\n';
  try{
    if(process.argv.length===3&&process.argv[2]==='--check'){
      if(fs.readFileSync(file,'utf8')!==content)throw new Error('SHOP_EXAMPLE_OUT_OF_DATE');
    }else if(process.argv.length===2)fs.writeFileSync(file,content,'utf8');
    else throw new Error('INVALID_ARGUMENTS');
    console.log('Shop development example: 9 products; source projection checked.');
  }catch(_){console.error('Shop example generation/check failed.');process.exitCode=1;}
}
module.exports={buildPreview};
