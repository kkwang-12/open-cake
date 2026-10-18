'use strict';
// SYNTHETIC SDK LAB ONLY. Never import into a customer handler or catalog seed.
const {catalog,emptyCart,cartContext}=require('./lab-catalog');
const {planCartCommand}=require('./shared/cart-model');
const {identityFromPlatform,resolveCustomer}=require('./shared/authorization-model');
const {buildSlotDefinitions,V1_FULFILLMENT_POLICY,DISTANCE_ALGORITHM_VERSION}=require('./shared/fulfillment-model');
const {TRADE_POLICY}=require('./shared/trade-model');
const {SLOT_RELEASE_POLICY_VERSION}=require('./shared/slot-release-policy');
const {requestFingerprint}=require('./shared/idempotency-model');
const {planQuoteCreation}=require('./shared/quote-model');
const clone=v=>JSON.parse(JSON.stringify(v));
function fixture(native,settings,mode,now){
  const user={...identityFromPlatform(native,settings),schemaVersion:1,version:0,status:'ACTIVE'};
  const principal=resolveCustomer(native,settings,user),cat=catalog();
  const image={assetId:'synthetic-photo',storageRef:'synthetic-sdk-lab://no-real-image',sourceKind:'REAL_PHOTO',revision:'synthetic-v1'};
  cat.product.images=[image];cat.product.name='SDK隔离合成商品';
  const location={longitude:0,latitude:0,coordinateSystem:'GCJ02',source:'SYNTHETIC_SDK_LAB',verifiedAt:now};
  const store={_id:cat.product.storeId,version:1,status:'OPEN',name:'SDK隔离合成门店',address:'合成地址',phone:'0551-00000000',
    timeZone:'Asia/Shanghai',activeConfigId:'synthetic-config',location};
  const configuration={_id:store.activeConfigId,storeId:store._id,status:'PUBLISHED',configVersion:2,publishedAt:now-1000,
    paymentHoldMinutes:15,quoteTtlMinutes:10,fulfillmentModes:['PICKUP','DELIVERY'],
    fulfillmentPolicyVersion:V1_FULFILLMENT_POLICY.version,tradePolicyVersion:TRADE_POLICY.version,
    slotPolicy:{unit:'ORDER',unitsPerOrder:1,slotMinutes:30,capacityPerSlot:{PICKUP:3,DELIVERY:1},releasePolicyVersion:SLOT_RELEASE_POLICY_VERSION},
    timePolicy:{policyVersion:'SYNTHETIC_SDK_LAB',timeZone:'Asia/Shanghai',minLeadTimeMinutes:60,maxAdvanceDays:7,crossDayStrategy:'REJECT',
      weeklyWindows:Array.from({length:7},(_,i)=>['PICKUP','DELIVERY'].map(fulfillment=>({weekday:i+1,fulfillment,startMinute:480,endMinute:1260}))).flat(),dateOverrides:[]},
    deliveryRules:[{ruleId:'synthetic-radius',ruleVersion:0,priority:0,status:'ACTIVE',operator:'STORE_SELF',windowNature:'ESTIMATED',
      distanceAlgorithmVersion:DISTANCE_ALGORITHM_VERSION,area:{kind:'RADIUS',regionPaths:null,center:clone(location),radiusMeters:20000,
        vertices:null,coordinateSystem:'GCJ02',boundaryIncluded:true},feePolicy:{kind:'FLAT',baseFeeCents:0,includedMeters:null,stepMeters:null,stepFeeCents:null,rounding:null}}]};
  const cart=clone(planCartCommand({...emptyCart(),ownerId:principal.subjectId},'ADD',principal,{expectedVersion:0,skuId:cat.skus[0]._id,
    selectedOptions:cat.selectedOptions,quantity:1,cakeMessage:'合成测试'},{...cartContext(cat),now,newLineId:'synthetic-line'}).nextCart);
  const serviceDate=new Date(now+8*3600000+86400000).toISOString().slice(0,10);
  const slot={...clone(buildSlotDefinitions({store,environment:settings.environment,now,fulfillment:mode,serviceDate,
    timePolicy:configuration.timePolicy,productLeadTimes:[60]})[0]),version:0,status:'OPEN',heldUnits:0,confirmedUnits:0,consumedUnits:0};
  const stock={_id:cat.skus[0].stockRequirements[0].resourceId,storeId:store._id,version:0,status:'OPEN',totalUnits:10,heldUnits:0,confirmedUnits:0,consumedUnits:0};
  const address={_id:'synthetic-address',schemaVersion:1,version:0,ownerId:principal.subjectId,receiverName:'合成收件人',phone:'13800000000',
    province:'安徽省',city:'合肥市',district:'庐江县',regionCodes:{province:null,city:null,district:null},detail:'合成门牌',location:clone(location),createdAt:now,updatedAt:now,deletedAt:null};
  const approved=[['STORE',store],['ADDRESS',address]].map(([entityKind,entity])=>({entityKind,entityId:entity._id,entityVersion:entity.version,locationFingerprint:requestFingerprint(entity.location)}));
  const context={limits:{maxLines:3,maxQuantityPerLine:6},validatePhone:phone=>/^1[3-9]\d{9}$/.test(phone),validateOrderNote:note=>Array.from(note).length<=30,
    // Exact synthetic bindings, never an unconditional production verifier.
    verifyProductImage:(id,version,value)=>id===cat.product._id&&version===cat.product.version&&requestFingerprint(value)===requestFingerprint(image),
    verifyLocation:binding=>approved.some(record=>requestFingerprint(record)===requestFingerprint(binding))};
  const state={store,configuration,cart,catalogs:[cat],slot,stocks:[stock],address,receipt:null};
  const payload={cartId:cart._id,expectedCartVersion:cart.version,lines:[{lineId:'synthetic-line',lineVersion:0}],fulfillment:mode,
    contact:{name:'合成联系人',phone:'13800000000'},addressId:mode==='DELIVERY'?address._id:null,slotId:slot._id,orderNote:'SDK隔离测试',idempotencyKey:'synthetic-quote-key'};
  const quote=planQuoteCreation(state,{action:'quote.create',payload},principal,{...context,now}).proposedQuote;
  const records={users:[user],stores:[store],store_config:[configuration],carts:[cart],products:[cat.product],skus:cat.skus,
    inventory_resources:[stock],slot_inventory:[slot],checkout_quotes:[quote],...(mode==='DELIVERY'?{addresses:[address]}:{})};
  return {records,context,event:{action:'create',payload:{quoteId:quote._id,expectedQuoteVersion:quote.version,idempotencyKey:'synthetic-create'}}};
}
module.exports={fixture};
