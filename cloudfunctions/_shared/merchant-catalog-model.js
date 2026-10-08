'use strict';
// A04 server-side validation/plans only. No SDK, publication or asset deletion.
const {CATEGORIES,NORMALIZATION_VERSION,resolveSku}=require('./catalog-model');
const {validateResource}=require('./resource-model');
const {validateMediaAsset,projectMediaReference}=require('./media-model');
const {canonicalJSON,scopedDocumentId}=require('./idempotency-model');
const fail=code=>{throw Object.assign(new Error(code),{code});};
const counter=value=>Number.isSafeInteger(value)&&value>=0;
const time=value=>counter(value)&&value>0&&Number.isFinite(new Date(value).getTime());
const text=(value,empty=false)=>typeof value==='string'&&value.length<=(empty?2048:256)&&value.isWellFormed()&&value===value.trim()&&(empty||value.length>0);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const dense=value=>Array.isArray(value)&&Object.keys(value).length===value.length;
const exact=(value,keys)=>plain(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
const copy=value=>JSON.parse(canonicalJSON(value));
const statuses=['DRAFT','ON_SALE','OFF_SALE','ARCHIVED'];
const productFields=['categoryCode','name','description','images','optionGroups','messagePolicy','minLeadTimeMinutes','sortOrder'];
const skuFields=['description','selectedOptions','currency','unitPriceCents','minQuantity','maxQuantity','stockRequirements','status'];
const pick=(value,fields)=>Object.fromEntries(fields.map(field=>[field,copy(value[field])]));
function base(record,now){if(!plain(record)||!text(record._id)||!text(record.storeId)||record.schemaVersion!==1||!counter(record.version)||
  !time(record.createdAt)||!time(record.updatedAt)||record.createdAt>record.updatedAt||record.updatedAt>now)fail('INVALID_CATALOG_STATE');}
function groupsFor(product){
  if(!dense(product.optionGroups))fail('INVALID_CATALOG_DRAFT');const groups=new Map();
  for(const group of product.optionGroups){
    if(!exact(group,['groupCode','label','required','options'])||!text(group.groupCode)||!text(group.label)||typeof group.required!=='boolean'||
      groups.has(group.groupCode)||!dense(group.options)||!group.options.length)fail('INVALID_CATALOG_DRAFT');
    const options=new Map();for(const option of group.options){if(!exact(option,['optionCode','label'])||!text(option.optionCode)||!text(option.label)||options.has(option.optionCode))fail('INVALID_CATALOG_DRAFT');options.set(option.optionCode,option.label);}
    groups.set(group.groupCode,{required:group.required,options});
  }return groups;
}
function optionsFor(groups,options){
  if(!dense(options))fail('INVALID_CATALOG_DRAFT');const seen=new Map();
  for(const option of options){if(!plain(option)||Object.keys(option).some(key=>!['groupCode','optionCode','label'].includes(key))||
    seen.has(option.groupCode)||!groups.get(option.groupCode)?.options.has(option.optionCode))fail('INVALID_SELECTION');seen.set(option.groupCode,option.optionCode);}
  for(const [code,group] of groups)if(group.required&&!seen.has(code))fail('INVALID_SELECTION');
  return [...groups].flatMap(([groupCode,group])=>seen.has(groupCode)?[{groupCode,optionCode:seen.get(groupCode),label:group.options.get(seen.get(groupCode))}]:[]);
}
const combination=options=>canonicalJSON(options.map(({groupCode,optionCode})=>[groupCode,optionCode]).sort());
function validateProduct(product){
  if(!CATEGORIES.includes(product.categoryCode)||!text(product.name)||!text(product.description,true)||!counter(product.sortOrder)||
    !statuses.includes(product.status)||!dense(product.images)||
    (product.minLeadTimeMinutes!==null&&!counter(product.minLeadTimeMinutes)))fail('INVALID_CATALOG_DRAFT');
  if(product.messagePolicy!==null&&(!exact(product.messagePolicy,['maxLength','normalizationVersion'])||!counter(product.messagePolicy.maxLength)||
    product.messagePolicy.maxLength===0||product.messagePolicy.normalizationVersion!==NORMALIZATION_VERSION||product.categoryCode==='BREAD'))fail('INVALID_MESSAGE');
  const images=new Set();for(const ref of product.images){
    if(!exact(ref,['assetId','revision','storageRef','sourceKind'])||!text(ref.assetId)||!text(ref.revision)||!text(ref.storageRef)||
      !['REAL_PHOTO','DESIGN_PREVIEW'].includes(ref.sourceKind)||images.has(canonicalJSON([ref.assetId,ref.revision])))fail('INVALID_MEDIA_REFERENCE');
    images.add(canonicalJSON([ref.assetId,ref.revision]));
  }return groupsFor(product);
}
function validateSku(sku,product,groups){
  if(sku.productId!==product._id||sku.storeId!==product.storeId||!text(sku.description)||!statuses.includes(sku.status)||sku.currency!=='CNY'||
    ['unitPriceCents','minQuantity','maxQuantity'].some(field=>sku[field]!==null&&(!counter(sku[field])||sku[field]===0))||
    sku.minQuantity!==null&&sku.maxQuantity!==null&&sku.minQuantity>sku.maxQuantity||!dense(sku.stockRequirements))fail('INVALID_CATALOG_DRAFT');
  const ids=new Set();for(const requirement of sku.stockRequirements){if(!exact(requirement,['resourceId','unitsPerItem'])||!text(requirement.resourceId)||
    !counter(requirement.unitsPerItem)||requirement.unitsPerItem===0||ids.has(requirement.resourceId))fail('INVALID_CATALOG_DRAFT');ids.add(requirement.resourceId);}
  if(!dense(sku.selectedOptions)||sku.selectedOptions.some(option=>!exact(option,['groupCode','optionCode','label'])||!text(option.groupCode)||!text(option.optionCode)||!text(option.label))||
    new Set(sku.selectedOptions.map(option=>option.groupCode)).size!==sku.selectedOptions.length)fail('INVALID_SELECTION');
  if(sku.status!=='ARCHIVED'&&canonicalJSON(optionsFor(groups,sku.selectedOptions))!==canonicalJSON(sku.selectedOptions))fail('INVALID_SELECTION');
}
function validateCatalogState(state,storeId,context,now){
  if(!time(now)||!state||state.environment!==context.environment||state.appId!==context.appId||state.storeId!==storeId||state.complete!==true||
    ['products','skus','resources','mediaAssets','categories'].some(field=>!dense(state[field])))fail('INVALID_CATALOG_STATE');
  for(const collection of ['products','skus','resources']){
    const seen=new Set();for(const record of state[collection]){base(record,now);if(record.storeId!==storeId||seen.has(record._id))fail('INVALID_CATALOG_STATE');seen.add(record._id);}
  }
  const categoryCodes=new Set();for(const category of state.categories){if(!category||!CATEGORIES.includes(category.code)||categoryCodes.has(category.code)||
    typeof category.published!=='boolean'||!text(category.nameZh)||!text(category.nameEn)||!counter(category.sortOrder))fail('INVALID_CATALOG_STATE');categoryCodes.add(category.code);}
  if(categoryCodes.size!==CATEGORIES.length)fail('INVALID_CATALOG_STATE');
  for(const resource of state.resources){validateResource('STOCK',resource);if(!text(resource.name)||!text(resource.unit))fail('INVALID_RESOURCE');}
  const mediaIds=new Set();for(const asset of state.mediaAssets){validateMediaAsset(asset,context);if(asset.updatedAt>now||mediaIds.has(asset._id))fail('INVALID_MEDIA_ASSET');mediaIds.add(asset._id);}
  for(const product of state.products){const groups=validateProduct(product),keys=new Set(),skus=state.skus.filter(sku=>sku.productId===product._id);
    if(!skus.length)fail('INVALID_CATALOG_STATE');for(const sku of skus){validateSku(sku,product,groups);if(sku.status!=='ARCHIVED'){
      const key=combination(sku.selectedOptions);if(keys.has(key))fail('INVALID_SELECTION');keys.add(key);}
      if(sku.stockRequirements.some(ref=>!state.resources.some(resource=>resource._id===ref.resourceId)))fail('INVALID_RESOURCE');}}
  if(state.skus.some(sku=>!state.products.some(product=>product._id===sku.productId)))fail('INVALID_CATALOG_STATE');
}
function validateMedia(product,state,context,publishing){
  if(publishing&&!product.images.length)fail('MEDIA_NOT_READY');
  for(const ref of product.images){const asset=state.mediaAssets.find(asset=>asset.assetId===ref.assetId&&asset.revision===ref.revision);
    if(!asset||asset.storageRef!==ref.storageRef||asset.sourceKind!==ref.sourceKind)fail('MEDIA_VERSION_UNAVAILABLE');
    if(publishing)projectMediaReference(asset,context,'PUBLIC_CATALOG');}
}
function publishable(product,skus,state,context){
  if(!state.categories.some(category=>category.code===product.categoryCode&&category.published))fail('CONFIGURATION_REQUIRED');
  validateMedia(product,state,context,true);const selling=skus.filter(sku=>sku.status==='ON_SALE');if(!selling.length)fail('CONFIGURATION_REQUIRED');
  for(const sku of selling){resolveSku({...product,status:'ON_SALE'},skus,sku.selectedOptions,sku._id);
    if(sku.stockRequirements.some(ref=>!state.resources.some(resource=>resource._id===ref.resourceId&&resource.status==='OPEN')))fail('RESOURCE_UNAVAILABLE');}
}
function nextVersion(record,now){if(!counter(record.version+1)||now<record.updatedAt)fail('VERSION_CONFLICT');return {...record,version:record.version+1,updatedAt:now};}
function planProductSave(payload,previous,state,context,receiptId,now){
  const draft=payload.draft;
  if(!exact(draft,[...productFields,'skus'])||!dense(draft.skus)||!draft.skus.length)fail('INVALID_CATALOG_DRAFT');
  if(previous&&(previous.version!==payload.expectedVersion||previous.status==='ARCHIVED'))fail('VERSION_CONFLICT');
  const product=previous?{...nextVersion(previous,now),...pick(draft,productFields)}:
    {_id:scopedDocumentId('merchant-product',[context.environment,context.appId,payload.storeId,receiptId]),schemaVersion:1,version:0,
      createdAt:now,updatedAt:now,storeId:payload.storeId,status:'DRAFT',...pick(draft,productFields)};
  if(previous&&product.categoryCode!==previous.categoryCode)fail('IMMUTABLE_CATALOG_FIELD');
  const groups=validateProduct(product),old=state.skus.filter(sku=>sku.productId===product._id),seen=new Set(),keys=new Set();
  const skus=draft.skus.map((source,index)=>{
    const existing=Object.hasOwn(source||{},'skuId');
    if(!exact(source,[...skuFields,...(existing?['skuId','expectedVersion']:[])])||
      existing&&(!text(source.skuId)||!counter(source.expectedVersion)))fail('INVALID_CATALOG_DRAFT');
    const prior=existing?old.find(sku=>sku._id===source.skuId):null;
    if(existing&&(!prior||seen.has(prior._id)||prior.version!==source.expectedVersion))fail('VERSION_CONFLICT');
    if(prior)seen.add(prior._id);
    const business=pick(source,skuFields);
    if(prior?.status==='ARCHIVED'){
      if(canonicalJSON(business)!==canonicalJSON(pick(prior,skuFields)))fail('IMMUTABLE_CATALOG_FIELD');return copy(prior);
    }
    business.selectedOptions=optionsFor(groups,business.selectedOptions);
    if(prior&&combination(prior.selectedOptions)!==combination(business.selectedOptions))fail('IMMUTABLE_CATALOG_FIELD');
    const sku=prior?canonicalJSON(pick(prior,skuFields))===canonicalJSON(business)?copy(prior):{...nextVersion(prior,now),...business}:
      {_id:scopedDocumentId('merchant-sku',[context.environment,context.appId,product._id,receiptId,String(index)]),schemaVersion:1,version:0,
        createdAt:now,updatedAt:now,storeId:product.storeId,productId:product._id,...business};
    validateSku(sku,product,groups);
    if(sku.status!=='ARCHIVED'){const key=combination(sku.selectedOptions);if(keys.has(key))fail('INVALID_SELECTION');keys.add(key);}
    if(sku.stockRequirements.some(ref=>!state.resources.some(resource=>resource._id===ref.resourceId)))fail('INVALID_RESOURCE');return sku;
  });
  if(old.some(sku=>!seen.has(sku._id)))fail('SKU_REMOVAL_FORBIDDEN');
  validateMedia(product,state,context,product.status==='ON_SALE');if(product.status==='ON_SALE')publishable(product,skus,state,context);
  return {collection:'products',before:previous,after:product,skuWrites:skus.filter(sku=>!old.some(prior=>prior._id===sku._id&&prior.version===sku.version))
    .map(sku=>({before:old.find(prior=>prior._id===sku._id)||null,after:sku}))};
}
function planProductStatus(payload,product,state,context,now){
  if(product.version!==payload.expectedVersion)fail('VERSION_CONFLICT');
  if(product.status==='ARCHIVED'||payload.status==='DRAFT'||product.status===payload.status)fail('INVALID_TRANSITION');
  if(payload.status==='ON_SALE')publishable(product,state.skus.filter(sku=>sku.productId===product._id),state,context);
  return {collection:'products',before:product,after:{...nextVersion(product,now),status:payload.status},skuWrites:[]};
}
function planInventoryTotal(payload,resource,now){
  if(resource.version!==payload.expectedVersion)fail('VERSION_CONFLICT');validateResource('STOCK',resource);
  if(payload.totalUnits<resource.heldUnits+resource.confirmedUnits+resource.consumedUnits)fail('RESOURCE_UNAVAILABLE');
  return {collection:'inventory_resources',before:resource,after:{...nextVersion(resource,now),totalUnits:payload.totalUnits},skuWrites:[]};
}
function productDTO(product,skus){return {...pick(product,['_id','version','createdAt','updatedAt','storeId','status',...productFields]),
  skus:skus.map(sku=>pick(sku,['_id','version','productId','storeId',...skuFields]))};}
function resourceDTO(resource){return {...pick(resource,['_id','version','createdAt','updatedAt','storeId','name','unit','status','totalUnits','heldUnits','confirmedUnits','consumedUnits']),
  availableUnits:validateResource('STOCK',resource)};}
module.exports={validateCatalogState,planProductSave,planProductStatus,planInventoryTotal,productDTO,resourceDTO};
