'use strict';
// Confirmed V1 category quotas. The template is not an allocatable resource.
const {scopedDocumentId}=require('./idempotency-model');
const QUOTA_POLICY='category-day-quota-v1-20261014';
const DAILY_LIMITS=Object.freeze({CAKE:15,MINI_CAKE:20,BREAD:20});
const fields=['resourceId','unitsPerItem','scope','categoryCode','quotaPolicyVersion'];
const fail=code=>{throw Object.assign(new Error(code),{code});};
const id=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value);
function date(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number(value.slice(0,4))<2000)fail('INVALID_SERVICE_DATE');
  const epoch=Date.parse(value+'T00:00:00Z');
  if(!Number.isFinite(epoch)||new Date(epoch).toISOString().slice(0,10)!==value)fail('INVALID_SERVICE_DATE');
}
function scope(environment,storeId,categoryCode){
  if(!id(environment)||!id(storeId)||!Object.hasOwn(DAILY_LIMITS,categoryCode))fail('CONFIGURATION_REQUIRED');
}
function isDailyQuota(requirement){return !!requirement&&['scope','categoryCode','quotaPolicyVersion'].some(key=>Object.hasOwn(requirement,key));}
function quotaTemplate(environment,storeId,categoryCode){
  scope(environment,storeId,categoryCode);
  return {resourceId:scopedDocumentId('daily-category-pool',[environment,storeId,categoryCode]),unitsPerItem:1,
    scope:'FULFILLMENT_DAY',categoryCode,quotaPolicyVersion:QUOTA_POLICY};
}
function validateTemplate(requirement,product,environment){
  if(!requirement||Object.keys(requirement).sort().join(',')!==[...fields].sort().join(',')||requirement.scope!=='FULFILLMENT_DAY'||
    requirement.quotaPolicyVersion!==QUOTA_POLICY||requirement.categoryCode!==product.categoryCode||
    !Object.hasOwn(DAILY_LIMITS,requirement.categoryCode)||requirement.unitsPerItem!==1||!id(requirement.resourceId))fail('INVALID_CATALOG');
  if(environment!==undefined&&requirement.resourceId!==quotaTemplate(environment,product.storeId,product.categoryCode).resourceId)fail('RESOURCE_SCOPE_MISMATCH');
  return requirement;
}
function dailyResourceId(environment,storeId,categoryCode,serviceDate){
  scope(environment,storeId,categoryCode);date(serviceDate);
  return scopedDocumentId('daily-category-stock',[environment,storeId,categoryCode,serviceDate]);
}
function requirementsForDate(product,sku,environment,serviceDate){
  if(sku.storeId!==product.storeId||sku.productId!==product._id||!Array.isArray(sku.stockRequirements))fail('INVALID_CATALOG');
  return sku.stockRequirements.map(ref=>{
    if(!isDailyQuota(ref))return {...ref};
    validateTemplate(ref,product,environment);
    return {resourceId:dailyResourceId(environment,product.storeId,product.categoryCode,serviceDate),unitsPerItem:1};
  });
}
function validateDailyResource(resource,environment,storeId,categoryCode,serviceDate){
  const expectedId=dailyResourceId(environment,storeId,categoryCode,serviceDate);
  if(!resource||resource._id!==expectedId||resource.schemaVersion!==1||resource.environment!==environment||resource.storeId!==storeId||
    resource.categoryCode!==categoryCode||resource.serviceDate!==serviceDate||resource.scope!=='FULFILLMENT_DAY'||
    resource.quotaPolicyVersion!==QUOTA_POLICY||resource.poolId!==quotaTemplate(environment,storeId,categoryCode).resourceId||
    resource.unit!=='ITEM'||!Number.isSafeInteger(resource.totalUnits)||resource.totalUnits<0||resource.totalUnits>DAILY_LIMITS[categoryCode])fail('INVALID_RESOURCE');
  return resource;
}
function validateQuotaResources(product,sku,environment,serviceDate,resources){
  for(const ref of sku.stockRequirements){
    if(!isDailyQuota(ref))continue;
    validateTemplate(ref,product,environment);
    const resource=resources.find(row=>row?._id===dailyResourceId(environment,product.storeId,product.categoryCode,serviceDate));
    validateDailyResource(resource,environment,product.storeId,product.categoryCode,serviceDate);
  }
}
function newDailyResource(environment,storeId,categoryCode,serviceDate,now){
  if(!Number.isSafeInteger(now)||now<1)fail('CONFIGURATION_REQUIRED');
  return {_id:dailyResourceId(environment,storeId,categoryCode,serviceDate),schemaVersion:1,version:0,createdAt:now,updatedAt:now,
    environment,storeId,name:categoryCode+' '+serviceDate,unit:'ITEM',scope:'FULFILLMENT_DAY',categoryCode,serviceDate,
    quotaPolicyVersion:QUOTA_POLICY,poolId:quotaTemplate(environment,storeId,categoryCode).resourceId,
    status:'OPEN',totalUnits:DAILY_LIMITS[categoryCode],heldUnits:0,confirmedUnits:0,consumedUnits:0};
}
module.exports={QUOTA_POLICY,DAILY_LIMITS,isDailyQuota,quotaTemplate,validateTemplate,requirementsForDate,
  dailyResourceId,validateDailyResource,validateQuotaResources,newDailyResource};
