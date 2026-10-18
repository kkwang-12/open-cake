'use strict';
const {parseApiRequest}=require('./api-contract');
const {requireOwner}=require('./authorization-model');
const {planAddressCommand,validateAddress,publicAddress}=require('./address-model');
const {requestFingerprint,idempotencyId}=require('./idempotency-model');
function fail(code){throw Object.assign(new Error(code),{code});}
const clone=value=>JSON.parse(JSON.stringify(value));
// Reusable command rules; the caller supplies current authorization and an atomic SDK session.
function createAddressService({runTransaction,now,newAddressId,validatePhone,verifyRegion,locationVerifier}){
  if(![runTransaction,now,newAddressId].every(value=>typeof value==='function'))fail('INVALID_CONFIGURATION');
  return {async execute(event,principal){
    requireOwner(principal,{ownerId:principal&&principal.subjectId});
    const {contract,payload}=parseApiRequest('address',event),action=contract.action;
    // Pagination uses the signed D07 cursor; do not offer an unsigned partial implementation.
    if(action==='list')fail('CONFIGURATION_REQUIRED');
    const receiptId=contract.mutation?idempotencyId({environment:principal.environment,
      actorScope:JSON.stringify([principal.appId,principal.subjectId]),command:'address.'+action,key:payload.idempotencyKey}):null;
    const {idempotencyKey,...business}=payload;
    const fingerprint=contract.mutation?requestFingerprint(business):null;
    return runTransaction(async tx=>{
      const user=await tx.readUser(principal.subjectId);
      if(user===null)fail('USER_NOT_PROVISIONED');
      requireOwner(principal,{ownerId:user&&user._id});if(user.status!=='ACTIVE')fail('USER_DISABLED');
      if(receiptId){const receipt=await tx.readReceipt(receiptId);if(receipt!==null){
        if(receipt.fingerprint!==fingerprint)fail('IDEMPOTENCY_KEY_REUSED');return clone(receipt.response);
      }}
      let address=action==='create'?null:await tx.readAddress(payload.addressId);
      if(action!=='create'){
        if(!address)fail('NOT_FOUND');validateAddress(address);requireOwner(principal,address);if(address.deletedAt!==null)fail('NOT_FOUND');
      }
      if(action==='get')return publicAddress(address);
      const token=payload.address&&payload.address.mapSelectionToken;
      if(token!==undefined&&(!locationVerifier||typeof locationVerifier.accept!=='function'||typeof locationVerifier.seal!=='function'))fail('LOCATION_REQUIRED');
      const commandPayload=token===undefined?payload:{...payload,address:Object.fromEntries(Object.entries(payload.address).filter(([key])=>key!=='mapSelectionToken'))};
      const context={now:now(),newAddressId:action==='create'?newAddressId():null,validatePhone,verifyRegion};
      if(action==='create'&&await tx.readAddress(context.newAddressId)!==null)fail('VERSION_CONFLICT');
      const plan=planAddressCommand(user,address,action==='setDefault'?'SET_DEFAULT':action.toUpperCase(),commandPayload,principal,context);
      let nextAddress=plan.nextAddress;
      if(token!==undefined){
        const target={addressId:action==='create'?null:payload.addressId,expectedVersion:action==='create'?null:payload.expectedVersion};
        nextAddress={...clone(nextAddress),location:locationVerifier.accept(token,commandPayload.address,principal,target,context.now)};
        nextAddress.locationProof=locationVerifier.seal(nextAddress,principal);validateAddress(nextAddress);
      }
      if(nextAddress)await tx.saveAddress(nextAddress,address?address.version:null);
      if(plan.userChanged)await tx.saveUser(plan.nextUser,user.version);
      const response=action==='remove'?{entityId:address._id,deleted:true,userVersion:plan.nextUser.version}:
        action==='setDefault'?{userId:user._id,version:plan.nextUser.version,defaultAddressId:plan.nextUser.defaultAddressId}:
          publicAddress(nextAddress);
      await tx.saveReceipt(receiptId,{fingerprint,response});return clone(response);
    });
  }};
}
module.exports={createAddressService};
