'use strict';
const { createHandler } = require('./runtime');
const { createCatalogReadModel } = require('./catalog-read-model');
const { pageRequest } = require('./pagination-model');
const { canonicalJSON } = require('./idempotency-model');
const ACTIONS = ['categories.list', 'products.list', 'product.get'];
const LIMITS = Object.freeze({categories:3, products:100, skus:500, mediaAssets:200});
class CatalogCloudError extends Error {
  constructor(code) { super(code); this.name='CatalogCloudError'; this.code=code; }
}
const fail = code => { throw new CatalogCloudError(code); };
const id = value => typeof value==='string' && /^[A-Za-z0-9_-]{1,256}$/.test(value);
const plain = value => value!==null && typeof value==='object' && [Object.prototype,null].includes(Object.getPrototypeOf(value));
function validateRequest(action, value, storeId) {
  let input;
  try { input=JSON.parse(canonicalJSON(value)); } catch (_) { fail('INVALID_REQUEST'); }
  if (!plain(input) || Buffer.byteLength(JSON.stringify(input))>8192) fail('INVALID_REQUEST');
  const fields=action==='categories.list'?[]:action==='product.get'?['productId']:['storeId','categoryCode','search','pageSize','cursor'];
  if (Object.keys(input).some(field=>!fields.includes(field))) fail('INVALID_REQUEST');
  if (action==='product.get' && !id(input.productId)) fail('INVALID_REQUEST');
  if (action==='products.list') {
    if (!id(input.storeId)) fail('INVALID_REQUEST');
    if (input.storeId!==storeId) fail('NOT_FOUND');
    if (input.categoryCode!==undefined && !['CAKE','MINI_CAKE','BREAD'].includes(input.categoryCode)) fail('INVALID_REQUEST');
    if (input.search!==undefined && (typeof input.search!=='string' || !input.search.isWellFormed() ||
        Array.from(input.search.normalize('NFC').trim()).length>64)) fail('INVALID_REQUEST');
    const pagination={};
    for (const field of ['pageSize','cursor']) if (Object.hasOwn(input,field)) pagination[field]=input[field];
    try { pageRequest(pagination); } catch (_) { fail('INVALID_REQUEST'); }
  }
  return input;
}
function mapError(error) {
  if (error && ['CatalogCloudError','CatalogReadError','PaginationModelError'].includes(error.name)) {
    if (['INVALID_REQUEST','PRODUCT_UNAVAILABLE','NOT_FOUND','CURSOR_INVALID','CURSOR_EXPIRED','CONFIGURATION_REQUIRED'].includes(error.code)) return error.code;
    if (error.code==='INVALID_PAGE_REQUEST') return 'INVALID_REQUEST';
    if (error.code==='INVALID_CATALOG_READ_CONFIGURATION') return 'CONFIGURATION_REQUIRED';
  }
  return 'INTERNAL_ERROR';
}
// Queries share a read-only SDK transaction snapshot. This does not claim predicate/write protection for orders.
function createCloudCatalogRepository(database, storeId) {
  if (!database || typeof database.runTransaction!=='function' || !id(storeId)) fail('CONFIGURATION_REQUIRED');
  return Object.freeze({
    async readSnapshot() {
      return database.runTransaction(async transaction => {
        let totalBytes=0;
        async function read(name, filter, limit) {
          const records=[];
          while (true) {
            const batchSize=Math.min(100,limit+1-records.length);
            const response=await transaction.collection(name).where(filter).orderBy('_id','asc').skip(records.length).limit(batchSize).get();
            if (!response || !Array.isArray(response.data) || response.data.length>batchSize) fail('INTERNAL_ERROR');
            for (const document of response.data) {
              if (!plain(document) || !id(document._id) || records.some(existing=>existing._id===document._id)) fail('INTERNAL_ERROR');
              totalBytes+=Buffer.byteLength(JSON.stringify(document));
              if (totalBytes>2*1024*1024) fail('CONFIGURATION_REQUIRED');
              records.push(document);
            }
            if (records.length>limit) fail('CONFIGURATION_REQUIRED');
            if (response.data.length<batchSize) return records;
          }
        }
        const categories=await read('categories',{published:true},LIMITS.categories);
        const products=await read('products',{storeId,status:'ON_SALE'},LIMITS.products);
        const skus=await read('skus',{storeId,status:'ON_SALE'},LIMITS.skus);
        const mediaAssets=await read('media_assets',{status:'PUBLISHED',sourceKind:'REAL_PHOTO'},LIMITS.mediaAssets);
        return {categories,products,skus,mediaAssets};
      }, 2);
    }
  });
}
function createCatalogCloudHandler({getContext, settings, repository, logger=console, now=Date.now}) {
  return async function main(event={}, invocation) {
    const action=event && ACTIONS.includes(event.action)?event.action:'__unsupported__';
    return createHandler({action,getContext,settings,logger,mapError,
      async handle() {
        if (action==='__unsupported__') fail('INVALID_REQUEST');
        if (settings.enabled!==true || !id(settings.storeId) || !repository || typeof repository.readSnapshot!=='function') fail('CONFIGURATION_REQUIRED');
        const payload=validateRequest(action,event.payload===undefined?{}:event.payload,settings.storeId);
        createCatalogReadModel({categories:[],products:[],skus:[],mediaAssets:[]},{environment:settings.environment,stage:settings.stage,
          storeId:settings.storeId,allowedCloudPrefixes:settings.allowedCloudPrefixes},settings.cursorKey);
        const records=await repository.readSnapshot();
        const model=createCatalogReadModel(records,{environment:settings.environment,stage:settings.stage,
          storeId:settings.storeId,allowedCloudPrefixes:settings.allowedCloudPrefixes},settings.cursorKey);
        if (action==='categories.list') return model.categoriesList();
        if (action==='products.list') return model.productsList(payload,now());
        return model.productGet(payload);
      }
    })(event,invocation);
  };
}
module.exports={createCatalogCloudHandler,createCloudCatalogRepository,CatalogCloudError,LIMITS};
