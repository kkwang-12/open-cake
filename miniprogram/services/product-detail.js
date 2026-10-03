const config=require('../config');
const {createError}=require('./errors');
const {createCatalogClient}=require('./catalog');
const {createSpecificationClient}=require('./specification');
const legacy=require('../fixtures/catalog-preview');
const {formatCents}=require('./catalog');
function createProductDetailClient(settings,catalog=createCatalogClient(settings),specification=createSpecificationClient(settings)){
  async function get(productId){
    if(!['development','test','production'].includes(settings.stage)||!['shell','cloud'].includes(settings.mode))throw createError('INVALID_CONFIGURATION');
    if(settings.stage!=='development'||settings.mode!=='shell')throw createError('CLOUD_NOT_CONFIGURED');
    if(typeof productId!=='string'||!/^(development-example-[a-z0-9-]+|preview-(cake|mini|bread))$/.test(productId))throw createError('PRODUCT_UNAVAILABLE');
    // Keep approved Home's old design links working, without mapping them to unrelated current SKUs.
    if(productId.startsWith('preview-')){
      const item=legacy.find(product=>product.id===productId);
      if(!item)throw createError('PRODUCT_UNAVAILABLE');
      return {productId:item.id,name:item.name,description:item.description,
        categoryLabel:{cake:'蛋糕 / CAKE',mini:'小蛋糕 / MINI CAKE',bread:'面包 / BREAD'}[item.category],
        priceLabel:item.priceLabel,priceMeaning:'设计示意价格，非当前商品售价',
        images:[{key:item.id,src:item.image}],variantLabels:[],source:'LEGACY_DESIGN_PREVIEW',
        notice:'这是首页原有设计预览，尚未关联当前商品规格。',canPurchase:false,canConfigure:false};
    }
    const page=await catalog.list({pageSize:50});
    const cards=page&&Array.isArray(page.items)?page.items.filter(item=>item.id===productId):[];
    if(cards.length!==1)throw createError('PRODUCT_UNAVAILABLE');
    const configuration=await specification.get(productId);
    const card=cards[0];
    if(page.source!=='DEVELOPMENT_EXAMPLE'||configuration.source!=='DEVELOPMENT_EXAMPLE'||
        configuration.productId!==productId||card.canPurchase!==false||configuration.canPurchase!==false||
        card.name!==configuration.name||card.categoryCode!==configuration.categoryCode||
        !Array.isArray(configuration.skus)||!configuration.skus.length)throw createError('INVALID_RESPONSE');
    const prices=configuration.skus.map(sku=>sku.unitPriceCents);
    if(prices.some(price=>!Number.isSafeInteger(price)||price<=0)||Math.min(...prices)!==card.minPriceCents)throw createError('INVALID_RESPONSE');
    const from=configuration.skus.length>1;
    return {productId,name:card.name,description:card.description.replace(/\s*·\s*开发示例$/,''),
      categoryLabel:{CAKE:'蛋糕 / CAKE',MINI_CAKE:'小蛋糕 / MINI CAKE',BREAD:'面包 / BREAD'}[card.categoryCode],
      priceLabel:formatCents(card.minPriceCents)+(from?'起':''),
      priceMeaning:from?'不同规格价格不同，请在规格页查看。':'当前单品开发示例价格。',
      images:[],variantLabels:configuration.skus.map(sku=>({skuId:sku.skuId,label:sku.description,priceLabel:formatCents(sku.unitPriceCents)})),
      source:'DEVELOPMENT_EXAMPLE',notice:'临时开发示例 · 商品照片及经营配置待补，暂未开放购买。',
      canPurchase:false,canConfigure:true,configuration};
  }
  return {get};
}
module.exports={...createProductDetailClient(config),createProductDetailClient};
