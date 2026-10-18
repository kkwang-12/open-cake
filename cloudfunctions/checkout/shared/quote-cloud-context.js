'use strict';
// Trusted transaction reads only; never geocode or fetch image bytes here.
const {projectMediaReference}=require('./media-model');
const {createAddressLocationVerifier}=require('./address-location');
const {validateStoreLocationProof}=require('./store-cloud-handler');
const {requestFingerprint,scopedDocumentId}=require('./idempotency-model');
const fail=code=>{throw Object.assign(new Error(code),{code});};
function createQuoteContextBuilder(settings,now=Date.now){
  return async function buildContext(read,state,principal){
    const at=now(),limits=state.configuration?.cartLimits;
    if(!limits||['maxLines','maxQuantityPerLine','maxOrderNoteLength'].some(key=>!Number.isSafeInteger(limits[key])||limits[key]<1))fail('CONFIGURATION_REQUIRED');
    const approved=new Set(),mediaContext={environment:settings.environment,stage:settings.stage,
      allowedCloudPrefixes:settings.allowedCloudPrefixes,allowReferenceImages:settings.allowReferenceImages===true};
    for(const {product}of state.catalogs){
      const image=product.images?.[0];if(!image)fail('CONFIGURATION_REQUIRED');
      const asset=await read('media_assets',scopedDocumentId('media',[settings.environment,image.assetId,image.revision]));
      const reference=projectMediaReference(asset,mediaContext,'PUBLIC_CATALOG');
      const projected=Object.fromEntries(['assetId','storageRef','sourceKind','revision'].map(key=>[key,image[key]]));
      if(requestFingerprint(reference)!==requestFingerprint(projected))fail('CONFIGURATION_REQUIRED');
      approved.add(requestFingerprint([product._id,product.version,reference]));
    }
    const locations=new Set();
    if(state.address){
      const store=state.store,proofId=scopedDocumentId('store-location-proof',[settings.appId,settings.environment,
        store._id,String(store.version),requestFingerprint(store.location)]);
      const proof=await read('location_verifications',proofId);
      // Internal guards are metadata, not part of the signed/public proof schema.
      const {_transactionFence:ignored,...businessProof}=proof||{};
      validateStoreLocationProof(store,businessProof,{...settings,locationProofId:proofId},at);
      const verifier=createAddressLocationVerifier({appId:settings.appId,environment:settings.environment,
        secret:settings.addressLocationSecret,now:()=>at});
      if(!verifier.verify(state.address,principal))fail('LOCATION_REQUIRED');
      for(const [entityKind,entity]of [['STORE',store],['ADDRESS',state.address]])locations.add(requestFingerprint({entityKind,
        entityId:entity._id,entityVersion:entity.version,locationFingerprint:requestFingerprint(entity.location)}));
    }
    return {stage:settings.stage,allowReferenceImages:settings.allowReferenceImages===true,limits,
      validatePhone:phone=>/^1[3-9]\d{9}$/.test(phone),validateOrderNote:note=>Array.from(note).length<=limits.maxOrderNoteLength,
      verifyProductImage:(id,version,image)=>approved.has(requestFingerprint([id,version,image])),
      verifyLocation:binding=>locations.has(requestFingerprint(binding))};
  };
}
module.exports={createQuoteContextBuilder};
