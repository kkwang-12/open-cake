'use strict';
// Create-only OFFLINE development plan. No SDK, network or write executor.
const { scopedDocumentId, canonicalJSON } = require('./idempotency-model');
const SEED_REVISION = 'development-draft-v1-2026-10-03';
const COLLECTIONS = Object.freeze(['categories', 'stores', 'store_config']);
class DevelopmentSeedError extends Error {
  constructor(code) { super(code); this.name = 'DevelopmentSeedError'; this.code = code; }
}
function fail(code) { throw new DevelopmentSeedError(code); }
function plain(value) { return value !== null && typeof value === 'object' && [Object.prototype,null].includes(Object.getPrototypeOf(value)); }
function text(value) { return typeof value === 'string' && value.length > 0 && value === value.trim() && value.isWellFormed(); }
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function buildDevelopmentSeedPlan(settings, existing, now) {
  if (!plain(settings) || settings.stage !== 'development' || !text(settings.environment) ||
      settings.environment !== settings.expectedDevelopmentEnvironment ||
      !Array.isArray(settings.productionEnvironments) ||
      Object.keys(settings.productionEnvironments).length !== settings.productionEnvironments.length ||
      !settings.productionEnvironments.every(text) ||
      settings.productionEnvironments.includes(settings.environment) ||
      typeof settings.namespace !== 'string' || !/^dev-[a-z0-9][a-z0-9-]{0,47}$/.test(settings.namespace)) fail('SEED_ENVIRONMENT_REJECTED');
  if (!Number.isSafeInteger(now) || now <= 0 || !Array.isArray(existing) ||
      Object.keys(existing).length !== existing.length) fail('INVALID_SEED_INPUT');
  try { canonicalJSON(existing); } catch (_) { fail('INVALID_SEED_INPUT'); }
  const byId = new Map(), byUniqueKey = new Map();
  function uniqueKey(collection, document) {
    if (collection === 'categories') return 'category:' + document.code;
    if (collection === 'store_config') return canonicalJSON(['config',document.storeId,document.configVersion]);
    return null;
  }
  for (const entry of existing) {
    if (!plain(entry) || !COLLECTIONS.includes(entry.collection) || !plain(entry.document) ||
        !text(entry.document._id) || entry.document.schemaVersion !== 1 ||
        !Number.isSafeInteger(entry.document.version) || entry.document.version < 0 ||
        (entry.collection === 'categories' && !['CAKE','MINI_CAKE','BREAD'].includes(entry.document.code)) ||
        (entry.collection === 'store_config' && (!text(entry.document.storeId) ||
          !Number.isSafeInteger(entry.document.configVersion) || entry.document.configVersion < 0))) fail('INVALID_SEED_INPUT');
    const idKey = canonicalJSON([entry.collection,entry.document._id]);
    const logicalKey = uniqueKey(entry.collection,entry.document);
    if (byId.has(idKey) || logicalKey !== null && byUniqueKey.has(logicalKey)) fail('SEED_CONFLICT');
    byId.set(idKey, entry.document);
    if (logicalKey !== null) byUniqueKey.set(logicalKey,entry.document);
  }
  const id = (collection,key) => scopedDocumentId('development-seed',
    [settings.environment,settings.namespace,collection,key]);
  const base = _id => ({ _id,schemaVersion:1,version:0,createdAt:now,updatedAt:now });
  const storeId = id('stores','draft-store');
  const categories = [
    ['CAKE','蛋糕','Cake'], ['MINI_CAKE','小蛋糕','Mini Cake'], ['BREAD','面包','Bread']
  ].map(([code,nameZh,nameEn],index)=>({
    collection:'categories', document:{...base(id('categories',code)),code,nameZh,nameEn,sortOrder:index,published:false}
  }));
  const store = {
    collection:'stores', document:{
      ...base(storeId),name:'开发草稿门店（非正式发布）',
      address:'安徽省合肥市庐江县X085沙溪派出所南侧约50米',phone:null,
      timeZone:'Asia/Shanghai',location:null,status:'DRAFT',activeConfigId:null
    }
  };
  const config = {
    collection:'store_config', document:{
      ...base(id('store_config','draft-config-0')),storeId,configVersion:0,status:'DRAFT',
      fulfillmentModes:['PICKUP','DELIVERY'],timePolicy:null,deliveryRules:[],cartLimits:null,
      quoteTtlMinutes:null,paymentHoldMinutes:null,slotPolicy:null,
      tradePolicyVersion:'v1-2026-10-03',fulfillmentPolicyVersion:'v1-fulfillment-2026-10-03',publishedAt:null
    }
  };
  const operations = [...categories,store,config].map(candidate=>{
    const oldById = byId.get(canonicalJSON([candidate.collection,candidate.document._id]));
    const logicalKey = uniqueKey(candidate.collection,candidate.document);
    const oldByLogical = logicalKey === null ? null : byUniqueKey.get(logicalKey);
    if (oldById && logicalKey !== null && uniqueKey(candidate.collection,oldById) !== logicalKey ||
        oldById && oldByLogical && oldById._id !== oldByLogical._id) fail('SEED_CONFLICT');
    const old = oldById || oldByLogical;
    if (old) return {type:'SKIP_EXISTING',collection:candidate.collection,_id:old._id};
    return {type:'CREATE_IF_ABSENT',collection:candidate.collection,document:candidate.document};
  });
  return freeze({
    status:'OFFLINE_PLAN_NOT_APPLIED',revision:SEED_REVISION,
    environment:settings.environment,stage:settings.stage,namespace:settings.namespace,operations,
    // Reference metadata is NOT a stores.location / partially filled TimePolicy document.
    referenceFacts:{
      source:'USER_CONFIRMED_2026-10-03',
      rawMapPoint:{longitude:117.2886,latitude:31.1498,coordinateSystem:'GCJ02',source:'AMAP'},
      normalizedLocation:null,
      weeklyWindows:Array.from({length:7},(_,index)=>['PICKUP','DELIVERY'].map(fulfillment=>({
        weekday:index+1,fulfillment,startMinute:480,endMinute:1260
      }))).flat(),
      fulfillment:{slotMinutes:30,capacityPerSlot:{PICKUP:3,DELIVERY:1},unit:'ORDER',
        radiusMeters:20000,boundaryIncluded:true,feeCents:0,operator:'STORE_SELF',windowNature:'ESTIMATED'}
    }
  });
}
module.exports = { SEED_REVISION, DevelopmentSeedError, buildDevelopmentSeedPlan };
