'use strict';
// OFFLINE ONLY: A01 real local authorization combined with serialized catalog memory.
const fs=require('node:fs'),path=require('node:path');
const {setup:accessSetup,clone}=require('./admin-access');
const {catalog}=require('./catalog');
const {createMediaDraft,projectMediaReference}=require('../../cloudfunctions/_shared/media-model');
const {createMerchantCatalogService}=require('../../cloudfunctions/_shared/merchant-catalog-service');
function attach(s,context,products,skus,resources){
  s.db.products=products;s.db.skus=skus;s.db.resources=resources;
  s.db.categories=['CAKE','MINI_CAKE','BREAD'].map((code,sortOrder)=>({code,nameZh:code,nameEn:code,sortOrder,published:true}));
  const bytes=fs.readFileSync(path.join(__dirname,'../../catalog-assets/development/catalog-example.png'));
  const asset={...createMediaDraft({assetId:'OFFLINE_CATALOG_PHOTO',revision:'v1',storageRef:context.allowedCloudPrefixes[0]+'fixture.png',sourceKind:'REAL_PHOTO',mimeType:'image/png'},
    bytes,{...context,now:s.controls.now-1000,maxBytes:8*1024*1024}),status:'PUBLISHED'};
  s.db.mediaAssets={[asset._id]:asset};const image=projectMediaReference(asset,context,'PUBLIC_CATALOG');
  s.controls.catalogStatePatch=null;s.controls.catalogReads=0;s.controls.fenceInputs=[];
  const existing=s.controls.extendTransaction;
  s.controls.extendTransaction=parts=>{
    const {staged,snapshot,changed,insert}=parts,stable=()=>!s.controls.fenceFalse&&!s.controls.denyFence&&JSON.stringify(s.db)===snapshot;
    const save=(collection,record,expected)=>{if(staged[collection][record._id]?.version!==expected)return 0;
      staged[collection][record._id]=clone(record);return changed();};
    const state=storeId=>({environment:context.environment,appId:context.appId,complete:true,storeId,
      products:Object.values(staged.products).filter(product=>product.storeId===storeId),skus:Object.values(staged.skus).filter(sku=>sku.storeId===storeId),
      resources:Object.values(staged.resources).filter(resource=>resource.storeId===storeId),categories:staged.categories,mediaAssets:Object.values(staged.mediaAssets)});
    return {...(existing?existing(parts):{}),
      readCatalogHeader:async(collection,id)=>clone((collection==='products'?staged.products:staged.resources)[id]||null),
      readCatalogState:async storeId=>{s.controls.catalogReads++;const result=clone(state(storeId));if(s.controls.catalogStatePatch)s.controls.catalogStatePatch(result);return result;},
      assertCatalogReads:async reads=>{s.controls.fenceInputs.push(clone(reads));return stable();},
      insertProduct:async record=>insert('products',record),saveProduct:async(record,version)=>save('products',record,version),
      insertSku:async record=>insert('skus',record),saveSku:async(record,version)=>save('skus',record,version),
      saveInventory:async(record,version)=>save('resources',record,version)};
  };
  let sequence=0;
  const options={context,key:{id:'OFFLINE_CATALOG_CURSOR',secret:Buffer.alloc(32,29)},runTransaction:s.runTransaction||s.options.runTransaction,
    now:()=>s.controls.nowSequence?s.controls.nowSequence.shift():s.controls.now,newRequestId:()=> 'OFFLINE_CATALOG_TRACE_'+(++sequence),
    redactReason:()=> '受权目录维护'};
  return {options,image,catalogService:createMerchantCatalogService(options)};
}
async function setup(){
  const s=accessSetup();await s.bootstrap();await s.service.execute(s.grant({capabilities:['CATALOG_WRITE']}),s.initial);
  const context={...s.settings,allowedCloudPrefixes:['cloud://OFFLINE_ADMIN_TEST/catalog/']},storeId='offline-store-a',
    sample=catalog('CAKE'),at=s.controls.now-2000;
  const resource={_id:'stock',schemaVersion:1,version:0,createdAt:at,updatedAt:at,storeId,name:'离线计量资源',unit:'OFFLINE_TEST_UNIT',
    status:'OPEN',totalUnits:20,heldUnits:2,confirmedUnits:3,consumedUnits:4};
  const product={...sample.product,_id:'product',schemaVersion:1,version:0,createdAt:at,updatedAt:at,storeId,description:'离线商品',images:[],sortOrder:0};
  const sku={...sample.skus[0],_id:'sku',schemaVersion:1,version:0,createdAt:at,updatedAt:at,storeId,productId:product._id,
    stockRequirements:[{resourceId:resource._id,unitsPerItem:1}]};
  const attached=attach(s,context,{[product._id]:product},{[sku._id]:sku},{[resource._id]:resource});product.images=[clone(attached.image)];
  const event=(action,patch={})=>({action,payload:action==='product.save'?{storeId,productId:'product',expectedVersion:s.db.products.product.version,
    draft:draft(s.db.products.product,Object.values(s.db.skus).filter(sku=>sku.productId==='product')),idempotencyKey:'OFFLINE_CATALOG_SAVE_KEY',...patch}:
    action==='product.status.set'?{productId:'product',expectedVersion:s.db.products.product.version,status:'OFF_SALE',reason:'下架：私密13800138000',idempotencyKey:'OFFLINE_CATALOG_STATUS_KEY',...patch}:
    action==='inventory.setTotal'?{resourceId:'stock',expectedVersion:s.db.resources.stock.version,totalUnits:12,reason:'补货：私密13800138000',idempotencyKey:'OFFLINE_CATALOG_TOTAL_KEY',...patch}:
    action==='product.get'?{productId:'product',...patch}:{storeId,...patch}});
  return {...s,...attached,context,storeId,event,execute:(action,patch,principal=s.initial)=>attached.catalogService.execute(event(action,patch),principal)};
}
function draft(product,skus){
  const fields=['categoryCode','name','description','images','optionGroups','messagePolicy','minLeadTimeMinutes','sortOrder'];
  return {...Object.fromEntries(fields.map(field=>[field,clone(product[field])])),skus:skus.map(sku=>({skuId:sku._id,expectedVersion:sku.version,
    ...Object.fromEntries(['description','selectedOptions','currency','unitPriceCents','minQuantity','maxQuantity','stockRequirements','status'].map(field=>[field,clone(sku[field])]))}))};
}
module.exports={setup,attach,draft,clone};
