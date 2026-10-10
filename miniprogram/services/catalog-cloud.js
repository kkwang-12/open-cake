const {createClient}=require('./cloud');
const {createError}=require('./errors');
const {createSpecificationModel}=require('../utils/specification-model');
const CATEGORIES=['CAKE','MINI_CAKE','BREAD'];
const API_VERSION='v1-api-2026-10-03';
const id=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,256}$/.test(value);
const text=value=>typeof value==='string'&&value.length>0&&value===value.trim()&&!/[\uD800-\uDFFF]/u.test(value);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const integer=value=>Number.isSafeInteger(value)&&value>=0;
function createCloudCatalogClient(settings,transport=createClient(settings,()=>typeof wx==='undefined'?null:wx),formatCents){
  function configured(){
    const catalog=settings.catalog;
    if(!catalog||catalog.enabled!==true)throw createError('CLOUD_NOT_CONFIGURED');
    if(!id(catalog.storeId)||!Array.isArray(catalog.allowedCloudPrefixes)||
        (catalog.allowReferenceImages!==undefined&&typeof catalog.allowReferenceImages!=='boolean')||
        (catalog.allowReferenceImages===true&&settings.stage!=='development')||
        !catalog.allowedCloudPrefixes.every(prefix=>typeof prefix==='string'&&/^cloud:\/\/[A-Za-z0-9._-]+\/(?:[A-Za-z0-9_-]+\/)*$/.test(prefix)))
      throw createError('INVALID_CONFIGURATION');
    return catalog;
  }
  function media(ref){
    const catalog=configured();
    if(!plain(ref)||!text(ref.assetId)||!text(ref.revision)||
        !(ref.sourceKind==='REAL_PHOTO'||(ref.sourceKind==='DESIGN_PREVIEW'&&catalog.allowReferenceImages===true))||typeof ref.storageRef!=='string'||
        !/^cloud:\/\/[A-Za-z0-9._-]+\/[A-Za-z0-9_./-]+$/.test(ref.storageRef)||
        ref.storageRef.split('/').some(part=>part==='.'||part==='..')||
        !catalog.allowedCloudPrefixes.some(prefix=>ref.storageRef.startsWith(prefix)))throw createError('INVALID_RESPONSE');
    return {key:ref.assetId+':'+ref.revision,src:ref.storageRef};
  }
  function card(value){
    if(!plain(value)||!id(value.productId)||!integer(value.version)||!CATEGORIES.includes(value.categoryCode)||
        !text(value.name)||typeof value.description!=='string'||/[\uD800-\uDFFF]/u.test(value.description)||
        !Number.isSafeInteger(value.minPriceCents)||value.minPriceCents<=0||value.currency!=='CNY')throw createError('INVALID_RESPONSE');
    const cover=media(value.cover);
    return {id:value.productId,version:value.version,categoryCode:value.categoryCode,name:value.name,description:value.description,
      minPriceCents:value.minPriceCents,currency:'CNY',priceFrom:true,priceLabel:formatCents(value.minPriceCents)+'起',
      image:cover.src,canPurchase:false};
  }
  async function list(input={}){
    const catalog=configured();
    if(!plain(input)||Object.keys(input).some(field=>!['categoryCode','search','pageSize','cursor'].includes(field))||
        (input.categoryCode!==undefined&&!CATEGORIES.includes(input.categoryCode))||
        (input.pageSize!==undefined&&(!Number.isSafeInteger(input.pageSize)||input.pageSize<1||input.pageSize>50))||
        (input.search!==undefined&&(typeof input.search!=='string'||/[\uD800-\uDFFF]/u.test(input.search)||Array.from(input.search.normalize('NFC').trim()).length>64))||
        (input.cursor!==undefined&&input.cursor!==null&&(!text(input.cursor)||input.cursor.length>4096)))throw createError('INVALID_REQUEST');
    const response=await transport.call('catalog','products.list',{...input,storeId:catalog.storeId});
    const page=response&&response.data;
    if(!plain(page)||page.apiVersion!==API_VERSION||!Array.isArray(page.items)||page.items.length>(input.pageSize||20)||typeof page.hasMore!=='boolean'||
        (page.hasMore?(!page.items.length||!text(page.nextCursor)||page.nextCursor.length>4096||page.nextCursor===input.cursor):page.nextCursor!==null))throw createError('INVALID_RESPONSE');
    const items=page.items.map(card);
    if(new Set(items.map(item=>item.id)).size!==items.length)throw createError('INVALID_RESPONSE');
    return {source:'PUBLIC_CATALOG',items,hasMore:page.hasMore,nextCursor:page.nextCursor};
  }
  async function get(productId){
    configured();
    if(!id(productId))throw createError('INVALID_REQUEST');
    const response=await transport.call('catalog','product.get',{productId});
    const value=response&&response.data;
    if(!plain(value)||value.apiVersion!==API_VERSION||value.productId!==productId||!Array.isArray(value.images)||!value.images.length)
      throw createError('INVALID_RESPONSE');
    const summary=card(value),images=value.images.map(media);
    if(new Set(images.map(image=>image.key)).size!==images.length||images[0].src!==summary.image)throw createError('INVALID_RESPONSE');
    let configuration;
    try{configuration=createSpecificationModel({...value,source:'PUBLIC_CATALOG',canPurchase:false}).configuration();}
    catch(_){throw createError('INVALID_RESPONSE');}
    if(Math.min(...configuration.skus.map(sku=>sku.unitPriceCents))!==value.minPriceCents)throw createError('INVALID_RESPONSE');
    const from=configuration.skus.length>1;
    return {productId,name:value.name,description:value.description,
      categoryLabel:{CAKE:'蛋糕 / CAKE',MINI_CAKE:'小蛋糕 / MINI CAKE',BREAD:'面包 / BREAD'}[value.categoryCode],
      priceLabel:formatCents(value.minPriceCents)+(from?'起':''),priceMeaning:from?'不同规格价格不同，以云端报价为准。':'云端商品价格，以结算报价为准。',
      images,variantLabels:configuration.skus.map(sku=>({skuId:sku.skuId,label:sku.description,priceLabel:formatCents(sku.unitPriceCents)})),
      source:'PUBLIC_CATALOG',notice:'加购与购买服务尚未开放。',canPurchase:false,canConfigure:false};
  }
  return {list,get};
}
module.exports={createCloudCatalogClient};
