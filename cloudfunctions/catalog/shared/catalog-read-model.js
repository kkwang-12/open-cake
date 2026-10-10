'use strict';
// C02/C03 public projections over a trusted, consistent, finite snapshot. No SDK handler.
const { canonicalJSON, requestFingerprint }=require('./idempotency-model');
const { CATEGORIES, NORMALIZATION_VERSION, resolveDisplaySku }=require('./catalog-model');
const { projectMediaReference }=require('./media-model');
const { pageRequest, issueCursor, readCursor }=require('./pagination-model');
const API_VERSION='v1-api-2026-10-03';
class CatalogReadError extends Error {
  constructor(code){super(code);this.name='CatalogReadError';this.code=code;}
}
function fail(code){throw new CatalogReadError(code);}
function plain(value){return value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));}
function text(value){return typeof value==='string'&&value.length>0&&value===value.trim()&&value.isWellFormed();}
function id(value){return text(value)&&/^[A-Za-z0-9_-]{1,256}$/.test(value);}
function integer(value){return Number.isSafeInteger(value)&&value>=0;}
function snapshot(value,code){try{return JSON.parse(canonicalJSON(value));}catch(_){fail(code);}}
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
function compare(a,b){return a.sortOrder-b.sortOrder||(a._id<b._id?-1:a._id>b._id?1:0);}
function createCatalogReadModel(records,context,key){
  records=snapshot(records,'INVALID_CATALOG_SNAPSHOT');
  context=snapshot(context,'INVALID_CATALOG_READ_CONFIGURATION');
  if(!plain(context)||!text(context.environment)||!id(context.storeId)||
      !['development','test','production'].includes(context.stage)||!Array.isArray(context.allowedCloudPrefixes)||
      (context.allowReferenceImages!==undefined&&typeof context.allowReferenceImages!=='boolean')||
      (context.allowReferenceImages===true&&context.stage!=='development')||
      !plain(key)||!text(key.id)||!Buffer.isBuffer(key.secret)||key.secret.length<32)fail('INVALID_CATALOG_READ_CONFIGURATION');
  key={id:key.id,secret:Buffer.from(key.secret)}; // Caller cannot rotate/mutate this snapshot's key bytes.
  if(!plain(records)||Object.keys(records).sort().join(',')!==['categories','products','skus','mediaAssets'].sort().join(',')||
      !Object.values(records).every(Array.isArray))fail('INVALID_CATALOG_SNAPSHOT');
  for(const collection of ['products','skus']){
    const ids=new Set();
    for(const record of records[collection]){
      if(!plain(record)||!id(record._id)||ids.has(record._id))fail('INVALID_CATALOG_SNAPSHOT');
      ids.add(record._id);
    }
  }
  const media=new Map();
  for(const asset of records.mediaAssets){
    if(!plain(asset)||!text(asset.assetId)||!text(asset.revision))fail('INVALID_CATALOG_SNAPSHOT');
    const mediaKey=canonicalJSON([asset.assetId,asset.revision]);
    if(media.has(mediaKey))fail('INVALID_CATALOG_SNAPSHOT');
    media.set(mediaKey,asset);
  }
  const categoryCodes=new Set();
  const categories=records.categories.filter(category=>plain(category)&&category.published===true&&CATEGORIES.includes(category.code))
    .map(category=>{
      if(categoryCodes.has(category.code)||!text(category.nameZh)||!text(category.nameEn)||!integer(category.sortOrder))fail('INVALID_CATALOG_SNAPSHOT');
      categoryCodes.add(category.code);
      return {code:category.code,nameZh:category.nameZh,nameEn:category.nameEn,sortOrder:category.sortOrder};
    }).sort((a,b)=>a.sortOrder-b.sortOrder||(a.code<b.code?-1:a.code>b.code?1:0));
  const cards=[],details=new Map();
  for(const product of records.products){
    if(product.storeId!==context.storeId||product.status!=='ON_SALE'||!categoryCodes.has(product.categoryCode))continue;
    if(!text(product.name)||typeof product.description!=='string'||!product.description.isWellFormed()||
        !integer(product.version)||!integer(product.sortOrder)||!Array.isArray(product.images)||
        (product.minLeadTimeMinutes!==null&&!integer(product.minLeadTimeMinutes))||
        (product.messagePolicy!==null&&(!plain(product.messagePolicy)||!Number.isSafeInteger(product.messagePolicy.maxLength)||
          product.messagePolicy.maxLength<=0||product.messagePolicy.normalizationVersion!==NORMALIZATION_VERSION||product.categoryCode==='BREAD')))continue;
    const skus=records.skus.filter(sku=>sku.productId===product._id);
    const available=[];
    for(const sku of skus){
      if(sku.status!=='ON_SALE'||!Array.isArray(sku.selectedOptions)||
          !sku.selectedOptions.every(option=>plain(option)&&text(option.groupCode)&&text(option.optionCode)))continue;
      try{
        available.push(resolveDisplaySku(product,skus,sku.selectedOptions.map(option=>({groupCode:option.groupCode,optionCode:option.optionCode})),sku._id));
      }catch(error){
        // Known domain configuration failures fail closed; unexpected programming failures are not hidden.
        if(error.name!=='CatalogModelError')throw error;
      }
    }
    if(!available.length)continue;
    const images=[],imageKeys=new Set();
    for(const ref of product.images){
      if(!plain(ref)||Object.keys(ref).sort().join(',')!==['assetId','revision','storageRef','sourceKind'].sort().join(','))continue;
      const asset=media.get(canonicalJSON([ref.assetId,ref.revision]));
      if(!asset)continue;
      try{
        const candidate=projectMediaReference(asset,context,'PUBLIC_CATALOG');
        if(candidate.storageRef===ref.storageRef&&candidate.sourceKind===ref.sourceKind){
          const imageKey=canonicalJSON([candidate.assetId,candidate.revision]);
          if(!imageKeys.has(imageKey)){images.push(candidate);imageKeys.add(imageKey);}
        }
      }catch(error){if(error.name!=='MediaModelError')throw error;}
    }
    // Covers must pass the registered media policy; approved development references retain their true source kind.
    const cover=images[0]||null;
    if(!cover)continue;
    const minPriceCents=available.reduce((minimum,sku)=>Math.min(minimum,sku.unitPriceCents),Number.MAX_SAFE_INTEGER);
    cards.push({_id:product._id,sortOrder:product.sortOrder,public:{
      productId:product._id,version:product.version,categoryCode:product.categoryCode,
      name:product.name,description:product.description,cover,minPriceCents,currency:'CNY'
    }});
    const publicCard=cards[cards.length-1].public;
    const optionGroups=product.optionGroups.map(group=>({
      groupCode:group.groupCode,label:group.label,required:group.required,
      options:group.options.map(option=>({optionCode:option.optionCode,label:option.label}))
    }));
    const messagePolicy=product.messagePolicy===null?null:{
      maxLength:product.messagePolicy.maxLength,normalizationVersion:product.messagePolicy.normalizationVersion
    };
    const publicSkus=available.slice().sort((a,b)=>a._id<b._id?-1:a._id>b._id?1:0).map(sku=>({
      skuId:sku._id,version:sku.version,description:sku.description,selectedOptions:sku.selectedOptions,
      unitPriceCents:sku.unitPriceCents,currency:sku.currency,minQuantity:sku.minQuantity,maxQuantity:sku.maxQuantity
    }));
    details.set(product._id,freeze({...publicCard,images,optionGroups,messagePolicy,
      minLeadTimeMinutes:product.minLeadTimeMinutes,skus:publicSkus}));
  }
  cards.sort(compare);
  const revision=requestFingerprint({categories,cards}); // Binds public ordering/content; private metadata does not leak.
  const mediaContextPrefixes=context.allowedCloudPrefixes;
  // Validate configured prefixes even if the catalog has no media/products yet.
  if(!mediaContextPrefixes.every(prefix=>typeof prefix==='string'&&/^cloud:\/\/[A-Za-z0-9._-]+\/(?:[A-Za-z0-9_-]+\/)*$/.test(prefix)))fail('INVALID_CATALOG_READ_CONFIGURATION');
  function categoriesList(){return freeze({apiVersion:API_VERSION,items:categories.map(item=>({...item}))});}
  function productsList(input,now){
    input=snapshot(input,'INVALID_REQUEST');
    if(!plain(input)||Object.keys(input).some(field=>!['storeId','categoryCode','search','pageSize','cursor'].includes(field))||
        !id(input.storeId)||(input.categoryCode!==undefined&&!CATEGORIES.includes(input.categoryCode))||
        (input.search!==undefined&&(typeof input.search!=='string'||!input.search.isWellFormed()||
          Array.from(input.search.normalize('NFC').trim()).length>64)))fail('INVALID_REQUEST');
    if(input.storeId!==context.storeId)fail('NOT_FOUND');
    const pagination={};
    for(const field of ['pageSize','cursor'])if(Object.hasOwn(input,field))pagination[field]=input[field];
    const request=pageRequest(pagination),search=(input.search||'').normalize('NFC').trim().toLowerCase();
    const binding={environment:context.environment,actorScope:'public-catalog',action:'catalog.products.list',sortId:'CATALOG',
      query:{storeId:context.storeId,categoryCode:input.categoryCode||null,search,revision}};
    const anchor=request.cursor===null?null:readCursor(request.cursor,binding,key,now);
    const eligible=cards.filter(card=>(input.categoryCode===undefined||card.public.categoryCode===input.categoryCode)&&
      card.public.name.normalize('NFC').toLowerCase().includes(search)&&
      (anchor===null||card.sortOrder>anchor[0]||(card.sortOrder===anchor[0]&&card._id>anchor[1])));
    const batch=eligible.slice(0,request.pageSize+1),hasMore=batch.length>request.pageSize,visible=batch.slice(0,request.pageSize);
    const last=visible[visible.length-1];
    const nextCursor=hasMore?issueCursor([last.sortOrder,last._id],binding,key,now):null;
    // Validate server time even for an empty/terminal first page, which issues no cursor.
    if(!Number.isSafeInteger(now)||now<=0)fail('INVALID_CATALOG_READ_CONFIGURATION');
    return freeze({apiVersion:API_VERSION,items:visible.map(card=>card.public),nextCursor,hasMore});
  }
  function productGet(input){
    input=snapshot(input,'INVALID_REQUEST');
    if(!plain(input)||Object.keys(input).join(',')!=='productId'||!id(input.productId))fail('INVALID_REQUEST');
    const detail=details.get(input.productId);
    // Unknown, cross-store, draft and invalid display records share an unavailable response.
    if(!detail)fail('PRODUCT_UNAVAILABLE');
    return freeze({apiVersion:API_VERSION,...detail});
  }
  return Object.freeze({categoriesList,productsList,productGet});
}
module.exports={API_VERSION,CatalogReadError,createCatalogReadModel};
