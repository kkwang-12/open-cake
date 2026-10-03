'use strict';
// C01 local draft planning. No cloud executor, publish, price guessing or image import.
const { canonicalJSON, scopedDocumentId } = require('./idempotency-model');
const { buildDevelopmentSeedPlan } = require('./development-seed');
const { CATEGORIES } = require('./catalog-model');
class CatalogDraftError extends Error {
  constructor(code) { super(code); this.name='CatalogDraftError'; this.code=code; }
}
function fail(code) { throw new CatalogDraftError(code); }
function plain(value) { return value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value)); }
function text(value) { return typeof value==='string'&&value.length>0&&value===value.trim()&&value.isWellFormed(); }
function code(value) { return typeof value==='string'&&/^[A-Z][A-Z0-9_]*$/.test(value); }
function key(value) { return typeof value==='string'&&/^[a-z0-9][a-z0-9-]*$/.test(value); }
function exact(value,keys) { return plain(value)&&Object.keys(value).sort().join(',')===keys.slice().sort().join(','); }
function snapshot(value) { try { return JSON.parse(canonicalJSON(value)); } catch (_) { fail('INVALID_CATALOG_DRAFT'); } }
function freeze(value) { if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value; }
function unique(values) { return new Set(values).size===values.length; }
function buildCatalogDraftPlan(input,existing,settings,now) {
  input=snapshot(input); existing=snapshot(existing); settings=snapshot(settings);
  // Reuse D07's explicit development environment/namespace gate. No seed is applied.
  const seed=buildDevelopmentSeedPlan(settings,[],now);
  const storeId=seed.operations.find(item=>item.collection==='stores').document._id;
  if(!exact(input,['purpose','reference','products'])||input.purpose!=='TEMPORARY_DEVELOPMENT_EXAMPLE'||
      !exact(input.reference,['file','sha256'])||
      !/^catalog-assets\/development\/[A-Za-z0-9_-]+\.png$/.test(input.reference.file)||
      !/^[a-f0-9]{64}$/.test(input.reference.sha256)||
      !Array.isArray(input.products)||!input.products.length||
      !Array.isArray(existing)) fail('INVALID_CATALOG_DRAFT');
  const old=new Map();
  for(const entry of existing){
    if(!exact(entry,['collection','document'])||!['products','skus'].includes(entry.collection)||
        !plain(entry.document)||!text(entry.document._id)||entry.document.storeId!==storeId||
        entry.document.schemaVersion!==1||!Number.isSafeInteger(entry.document.version)||entry.document.version<0||
        !Number.isSafeInteger(entry.document.createdAt)||entry.document.createdAt<=0||
        !Number.isSafeInteger(entry.document.updatedAt)||entry.document.updatedAt<entry.document.createdAt||
        !['DRAFT','ON_SALE','OFF_SALE','ARCHIVED'].includes(entry.document.status)||
        (entry.collection==='skus'&&(!text(entry.document.productId)||!Array.isArray(entry.document.selectedOptions)))) fail('INVALID_CATALOG_DRAFT');
    const recordKey=canonicalJSON([entry.collection,entry.document._id]);
    if(old.has(recordKey)) fail('CATALOG_DRAFT_CONFLICT');
    old.set(recordKey,entry.document);
  }
  const id=(collection,parts)=>scopedDocumentId('development-catalog',[settings.environment,settings.namespace,storeId,collection,...parts]);
  const base=_id=>({_id,schemaVersion:1,version:0,createdAt:now,updatedAt:now});
  const candidates=[],review=[];
  const productKeys=new Set();
  for(const [sortOrder,source] of input.products.entries()){
    if(!exact(source,['key','categoryCode','name','nameSource','messageDecision','optionGroups','variants'])||
        !key(source.key)||productKeys.has(source.key)||!CATEGORIES.includes(source.categoryCode)||!text(source.name)||
        !['IMAGE','DESCRIPTIVE_PLACEHOLDER'].includes(source.nameSource)||
        !['ENABLED','DISABLED','UNKNOWN'].includes(source.messageDecision)||
        (source.categoryCode==='BREAD'&&source.messageDecision!=='DISABLED')||
        !Array.isArray(source.optionGroups)||!Array.isArray(source.variants)||!source.variants.length) fail('INVALID_CATALOG_DRAFT');
    productKeys.add(source.key);
    const groups=new Map();
    for(const group of source.optionGroups){
      if(!exact(group,['groupCode','label','required','options'])||!code(group.groupCode)||!text(group.label)||
          typeof group.required!=='boolean'||groups.has(group.groupCode)||!Array.isArray(group.options)||!group.options.length) fail('INVALID_CATALOG_DRAFT');
      const options=new Map();
      for(const option of group.options){
        if(!exact(option,['optionCode','label'])||!code(option.optionCode)||!text(option.label)||options.has(option.optionCode)) fail('INVALID_CATALOG_DRAFT');
        options.set(option.optionCode,option.label);
      }
      groups.set(group.groupCode,{required:group.required,options});
    }
    const productId=id('products',[source.key]);
    const product={...base(productId),storeId,categoryCode:source.categoryCode,name:source.name,
      description:'临时开发示例，非正式经营目录',images:[],optionGroups:source.optionGroups,
      messagePolicy:null,minLeadTimeMinutes:null,status:'DRAFT',sortOrder};
    const previousProduct=old.get(canonicalJSON(['products',productId]));
    if(previousProduct&&previousProduct.categoryCode!==product.categoryCode) fail('CATALOG_DRAFT_CONFLICT');
    candidates.push({collection:'products',document:product});
    const variantKeys=[],selectionKeys=[],skuReviews=[];
    for(const variant of source.variants){
      if(!exact(variant,['key','description','selectedOptions','unitPriceCents','priceSource'])||
          !key(variant.key)||!text(variant.description)||!Array.isArray(variant.selectedOptions)||
          (variant.unitPriceCents!==null&&(!Number.isSafeInteger(variant.unitPriceCents)||variant.unitPriceCents<=0))||
          !['IMAGE','USER_CONFIRMED_DEVELOPMENT_2026-10-03','UNKNOWN'].includes(variant.priceSource)||
          ((variant.unitPriceCents===null)!==(variant.priceSource==='UNKNOWN'))) fail('INVALID_CATALOG_DRAFT');
      const selected=new Map();
      for(const option of variant.selectedOptions){
        if(!exact(option,['groupCode','optionCode'])||selected.has(option.groupCode)||
            !groups.has(option.groupCode)||!groups.get(option.groupCode).options.has(option.optionCode)) fail('INVALID_CATALOG_DRAFT');
        selected.set(option.groupCode,option.optionCode);
      }
      for(const [groupCode,group] of groups)if(group.required&&!selected.has(groupCode))fail('INVALID_CATALOG_DRAFT');
      const selectedOptions=[...groups].flatMap(([groupCode,group])=>selected.has(groupCode)?
        [{groupCode,optionCode:selected.get(groupCode),label:group.options.get(selected.get(groupCode))}]:[]);
      variantKeys.push(variant.key);
      selectionKeys.push(canonicalJSON(selectedOptions.map(option=>[option.groupCode,option.optionCode])));
      const skuId=id('skus',[source.key,variant.key]);
      const previousSku=old.get(canonicalJSON(['skus',skuId]));
      if(previousSku&&(!previousProduct||previousSku.productId!==productId||
          canonicalJSON(previousSku.selectedOptions)!==canonicalJSON(selectedOptions))) fail('CATALOG_DRAFT_CONFLICT');
      candidates.push({collection:'skus',document:{...base(skuId),storeId,productId,
        description:variant.description,selectedOptions,currency:'CNY',unitPriceCents:variant.unitPriceCents,
        minQuantity:null,maxQuantity:null,stockRequirements:[],status:'DRAFT'}});
      skuReviews.push({skuId,priceSource:variant.priceSource,pricePending:variant.unitPriceCents===null});
    }
    if(!unique(variantKeys)||!unique(selectionKeys)) fail('CATALOG_DRAFT_CONFLICT');
    review.push({productId,sourceKey:source.key,nameSource:source.nameSource,messageDecision:source.messageDecision,
      blockers:['FORMAL_CATALOG_APPROVAL','INDIVIDUAL_REAL_PHOTO','MIN_LEAD_TIME','QUANTITY_LIMITS','STOCK_UNITS',
        ...(source.nameSource==='DESCRIPTIVE_PLACEHOLDER'?['FORMAL_NAME']:[]),
        ...(source.messageDecision==='ENABLED'?['MESSAGE_MAX_LENGTH']:source.messageDecision==='UNKNOWN'?['MESSAGE_DECISION']:[]),
        ...(skuReviews.some(item=>item.pricePending)?['PRICE']:[])],skus:skuReviews});
  }
  const operations=candidates.map(candidate=>{
    const previous=old.get(canonicalJSON([candidate.collection,candidate.document._id]));
    if(previous)return {type:'SKIP_EXISTING',collection:candidate.collection,_id:previous._id};
    // Never add variants to an already existing parent, including edited/published parents.
    if(candidate.collection==='skus'&&old.has(canonicalJSON(['products',candidate.document.productId])))
      return {type:'SKIP_EXISTING_PARENT',collection:'skus',_id:candidate.document._id,productId:candidate.document.productId};
    return {type:'CREATE_IF_ABSENT',...candidate};
  });
  return freeze({status:'OFFLINE_PLAN_NOT_APPLIED',purpose:input.purpose,
    environment:settings.environment,namespace:settings.namespace,storeId,
    // Poster reference stays outside product.images/media_assets and outside the mini program.
    reference:input.reference,categories:seed.operations.filter(item=>item.collection==='categories').map(item=>item.document),
    operations,review});
}
module.exports={CatalogDraftError,buildCatalogDraftPlan};