'use strict';
// Builds a bounded development change plan, never writes to the cloud.
const fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');
const {products:adopted}=require('../catalog-assets/initial-20261010/catalog');
const {NORMALIZATION_VERSION,resolveSku}=require('../cloudfunctions/_shared/catalog-model');
const {quotaTemplate,newDailyResource,DAILY_LIMITS}=require('../cloudfunctions/_shared/daily-quota');
const {localServiceDate,buildSlotDefinitions}=require('../cloudfunctions/_shared/fulfillment-model');
const {canonicalJSON}=require('../cloudfunctions/_shared/idempotency-model');
const clone=value=>JSON.parse(canonicalJSON(value));
const hash=value=>createHash('sha256').update(canonicalJSON(value)).digest('hex');
const fail=code=>{throw Object.assign(new Error(code),{code});};
function prepareQuoteData({store,configuration,products,skus,environment,now}){
  if(environment!=='cloudbase-d8gwtxzm64150b7e0'||store?._id!=='g1-catalog-store'||store.status!=='DRAFT'||store.activeConfigId!==null||
    configuration?._id!=='g2-initial-config-20261014'||configuration.storeId!==store._id||configuration.status!=='DRAFT'||configuration.publishedAt!==null||
    !Number.isSafeInteger(now)||now<store.updatedAt||now<configuration.updatedAt||products.length!==9||skus.length!==15)fail('QUOTE_DRAFT_BASELINE_REQUIRED');
  if(configuration.timePolicy?.maxAdvanceDays!==3||configuration.quoteTtlMinutes!==5||configuration.paymentHoldMinutes!==30||
    configuration.cartLimits?.maxLines!==60||configuration.cartLimits.maxQuantityPerLine!==15||configuration.cartLimits.maxOrderNoteLength!==30)fail('CONFIRMED_CONFIGURATION_MISMATCH');
  const patches=[],nextProducts=[],nextSkus=[];
  function patch(collection,record,fields){
    if(!Number.isSafeInteger(record.version)||record.version<0||!Number.isSafeInteger(record.version+1)||now<record.updatedAt)fail('INVALID_RECORD_BASELINE');
    const next={...clone(record),...fields,updatedAt:now,version:record.version+1};
    patches.push({collection,id:record._id,expectedVersion:record.version,beforeHash:hash(record),
      set:{...fields,updatedAt:now,version:next.version},afterHash:hash(next)});return next;
  }
  for(const source of products){
    const definition=adopted.find(row=>'g1-initial-'+row.key===source._id);
    if(!definition||definition.categoryCode!==source.categoryCode||source.storeId!==store._id||source.status!=='ON_SALE')fail('ADOPTED_PRODUCT_MISMATCH');
    const product=patch('products',source,{minLeadTimeMinutes:source.categoryCode==='CAKE'?30:0,
      messagePolicy:definition.messageDecision==='ENABLED'?{maxLength:30,normalizationVersion:NORMALIZATION_VERSION}:null});
    nextProducts.push(product);
    const children=skus.filter(sku=>sku.productId===source._id);
    if(children.length!==definition.variants.length)fail('ADOPTED_SKU_MISMATCH');
    for(const sku of children){
      if(sku.storeId!==store._id||sku.status!=='ON_SALE')fail('ADOPTED_SKU_MISMATCH');
      nextSkus.push(patch('skus',sku,{minQuantity:1,maxQuantity:15,
        stockRequirements:[quotaTemplate(environment,store._id,source.categoryCode)]}));
    }
    for(const sku of nextSkus.filter(row=>row.productId===product._id))resolveSku(product,nextSkus.filter(row=>row.productId===product._id),sku.selectedOptions,sku._id);
  }
  if(nextSkus.length!==15||new Set(nextSkus.map(row=>row._id)).size!==15||patches.length!==24)fail('ADOPTED_SKU_MISMATCH');
  const today=localServiceDate(now,store.timeZone),base=Date.parse(today+'T00:00:00Z'),stocks=[],slots=[],serviceDates=[];
  for(let offset=0;offset<=3;offset++){
    const serviceDate=new Date(base+offset*86400000).toISOString().slice(0,10),definitions=[];
    // Compute the intended published schedule without mutating the DRAFT source.
    for(const fulfillment of ['PICKUP','DELIVERY'])definitions.push(...buildSlotDefinitions({store:{...store,status:'OPEN'},environment,now,serviceDate,
      fulfillment,timePolicy:configuration.timePolicy,productLeadTimes:[0]}));
    if(!definitions.length)continue;
    serviceDates.push(serviceDate);
    for(const categoryCode of Object.keys(DAILY_LIMITS))stocks.push(newDailyResource(environment,store._id,categoryCode,serviceDate,now));
    for(const definition of definitions){
      const {minLeadTimeMinutes,...identity}=definition;
      slots.push({...identity,schemaVersion:1,version:0,createdAt:now,updatedAt:now,status:'OPEN',heldUnits:0,confirmedUnits:0,consumedUnits:0});
    }
  }
  return {scope:'DEVELOPMENT_QUOTE_DATA_PLAN',environment,storeId:store._id,createdAt:now,cloudResourcesChanged:false,
    storeVersion:store.version,configurationVersion:configuration.version,configurationId:configuration._id,
    serviceDates,updates:patches,inventoryResources:stocks,slotInventory:slots,
    initialization:'Explicit add only; if ID exists, validate definition and keep its counters, version and timestamps. Never set/upsert/reset.',
    counts:{updates:patches.length,products:9,skus:15,inventoryResources:stocks.length,slotInventory:slots.length},
    publication:'Not included. Store/config remain DRAFT; publish and renew location proof only with the validated complete resource state.',
    after:{products:nextProducts,skus:nextSkus}};
}
if(require.main===module){
  const args=Object.fromEntries(process.argv.slice(2).map(arg=>{const match=/^--(input|out|now)=(.+)$/.exec(arg);if(!match)fail('INVALID_ARGUMENT');return [match[1],match[2]];}));
  if(!args.input||!args.out)fail('INPUT_AND_OUTPUT_REQUIRED');
  const read=name=>{const text=fs.readFileSync(path.join(path.resolve(args.input),name+'-before.json'),'utf8');
    const result=JSON.parse(text.slice(text.indexOf('{')));if(!result.ok||result.result.total!==result.result.data.length)fail('INCOMPLETE_CLOUD_SNAPSHOT');return result.result.data;};
  const result=prepareQuoteData({store:read('stores')[0],configuration:read('store_config')[0],products:read('products'),skus:read('skus'),
    environment:'cloudbase-d8gwtxzm64150b7e0',now:args.now===undefined?Date.now():Number(args.now)});
  const output=path.resolve(args.out);if(fs.existsSync(output))fail('PLAN_ALREADY_EXISTS');fs.mkdirSync(output,{recursive:true});
  fs.writeFileSync(path.join(output,'plan.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({output,counts:result.counts,serviceDates:result.serviceDates,cloudResourcesChanged:false}));
}
module.exports={prepareQuoteData};
