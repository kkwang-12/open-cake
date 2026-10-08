'use strict';
// Isolated OFFLINE_TEST_ONLY fixtures; no merchant configuration or live records.
const {catalog,emptyCart,cartContext}=require('./catalog');
const {planCartCommand}=require('../../cloudfunctions/_shared/cart-model');
const {identityFromPlatform,resolveCustomer}=require('../../cloudfunctions/_shared/authorization-model');
const {buildSlotDefinitions,V1_FULFILLMENT_POLICY,DISTANCE_ALGORITHM_VERSION}=require('../../cloudfunctions/_shared/fulfillment-model');
const {TRADE_POLICY}=require('../../cloudfunctions/_shared/trade-model');
const {requestFingerprint}=require('../../cloudfunctions/_shared/idempotency-model');
const clone=value=>JSON.parse(JSON.stringify(value));
function actor(id='A'){
  const settings={appId:'offline-X05',environment:'offline-X05',stage:'development'},platform={OPENID:id,APPID:settings.appId,ENV:settings.environment};
  return resolveCustomer(platform,settings,{...identityFromPlatform(platform,settings),schemaVersion:1,version:0,status:'ACTIVE'});
}
function setup(mode='PICKUP'){
  const principal=actor(),now=Date.parse('2026-10-05T00:00:00Z'),cat=catalog();
  cat.product.images=[{assetId:'offline-photo',storageRef:'offline://not-real-photo',sourceKind:'REAL_PHOTO',revision:'offline-v1',privateMetadata:'never exposed'}];
  const store={_id:cat.product.storeId,version:1,status:'OPEN',name:'OFFLINE_TEST_ONLY',address:'仅离线门店',phone:'0551-00000000',
    timeZone:'Asia/Shanghai',activeConfigId:'offline-config',location:{longitude:0,latitude:0,coordinateSystem:'WGS84',source:'OFFLINE_TEST_ONLY',verifiedAt:1000}};
  const configuration={_id:'offline-config',storeId:store._id,status:'PUBLISHED',configVersion:2,publishedAt:now-1000,
    fulfillmentPolicyVersion:V1_FULFILLMENT_POLICY.version,tradePolicyVersion:TRADE_POLICY.version,quoteTtlMinutes:10,fulfillmentModes:['PICKUP','DELIVERY'],
    timePolicy:{policyVersion:'OFFLINE_TEST_ONLY',timeZone:'Asia/Shanghai',minLeadTimeMinutes:60,maxAdvanceDays:7,crossDayStrategy:'REJECT',
      weeklyWindows:Array.from({length:7},(_,i)=>['PICKUP','DELIVERY'].map(fulfillment=>({weekday:i+1,fulfillment,startMinute:480,endMinute:1260}))).flat(),dateOverrides:[]},
    deliveryRules:[{ruleId:'offline-radius',ruleVersion:0,priority:0,status:'ACTIVE',operator:'STORE_SELF',windowNature:'ESTIMATED',
      distanceAlgorithmVersion:DISTANCE_ALGORITHM_VERSION,area:{kind:'RADIUS',regionPaths:null,center:clone(store.location),radiusMeters:20000,
        vertices:null,coordinateSystem:'WGS84',boundaryIncluded:true},feePolicy:{kind:'FLAT',baseFeeCents:0,includedMeters:null,stepMeters:null,stepFeeCents:null,rounding:null}}]};
  const cart=clone(planCartCommand({...emptyCart(),ownerId:principal.subjectId},'ADD',principal,{expectedVersion:0,skuId:cat.skus[0]._id,
    selectedOptions:cat.selectedOptions,quantity:2,cakeMessage:'测试留言'},{...cartContext(cat),now:2000,newLineId:'offline-line'}).nextCart);
  const definition=buildSlotDefinitions({store,environment:principal.environment,now,fulfillment:mode,serviceDate:'2026-10-06',timePolicy:configuration.timePolicy,productLeadTimes:[60]})[0];
  const slot={...clone(definition),version:0,status:'OPEN',heldUnits:0,confirmedUnits:0,consumedUnits:0};
  const stocks=[{_id:cat.skus[0].stockRequirements[0].resourceId,storeId:store._id,version:0,status:'OPEN',totalUnits:10,heldUnits:1,confirmedUnits:1,consumedUnits:1}];
  const address={_id:'offline-address',schemaVersion:1,version:0,ownerId:principal.subjectId,receiverName:'仅离线收件人',phone:'13800000000',
    province:'安徽省',city:'合肥市',district:'庐江县',regionCodes:{province:null,city:null,district:null},detail:'仅离线门牌',location:clone(store.location),createdAt:1000,updatedAt:2000,deletedAt:null};
  const approved=[['STORE',store],['ADDRESS',address]].map(([entityKind,entity])=>({entityKind,entityId:entity._id,entityVersion:entity.version,locationFingerprint:requestFingerprint(entity.location)}));
  const context={now,limits:{maxLines:3,maxQuantityPerLine:6},validatePhone:phone=>/^1[3-9]\d{9}$/.test(phone),
    validateOrderNote:note=>Array.from(note).length<=30,verifyProductImage:()=>true,
    verifyLocation:binding=>approved.some(record=>JSON.stringify(record)===JSON.stringify(binding))};
  const state={store,configuration,cart,catalogs:[cat],slot,stocks,address,receipt:null};
  const event={action:'quote.create',payload:{cartId:cart._id,expectedCartVersion:cart.version,lines:[{lineId:'offline-line',lineVersion:0}],
    fulfillment:mode,contact:{name:'仅离线联系人',phone:'13800000000'},addressId:mode==='DELIVERY'?address._id:null,slotId:slot._id,orderNote:'测试备注',idempotencyKey:'offline-quote-key'}};
  return {principal,state,context,event,cat,approved};
}
module.exports={setup,actor,clone};
