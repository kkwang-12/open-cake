'use strict';
// Server-only opaque-token implementation. E10 has no published production policy.
const {createHmac,timingSafeEqual}=require('node:crypto');
const {canonicalJSON}=require('./idempotency-model');
const {validateOrderTime}=require('./order-cancellation-model');
const {planRetainedFulfillment}=require('./order-fulfillment-resources');
function fail(code){throw Object.assign(new Error(code),{code});}
const counter=value=>Number.isSafeInteger(value)&&value>=0;
const time=value=>counter(value)&&value>0&&Number.isFinite(new Date(value).getTime());
const text=value=>typeof value==='string'&&value.trim()===value&&value.length>0&&value.length<=256;
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
function equal(a,b){return typeof a==='string'&&typeof b==='string'&&a.length===b.length&&
  timingSafeEqual(Buffer.from(a),Buffer.from(b));}
const FIELDS=['digest','expiresAt','usedAt','usedBy','issuedAt','keyId','policyVersion','format','failedAttempts','nextAttemptAt'];
function createPickupCredentialModel({environment,appId,policy,currentKeyId,fingerprintKeyId,keys}){
  if(!text(environment)||!text(appId)||!policy||!text(policy.version)||policy.format!=='OPAQUE_TOKEN'||
      !counter(policy.ttlMs)||policy.ttlMs<1||!counter(policy.maxFailedAttempts)||policy.maxFailedAttempts<1||
      !counter(policy.attemptCooldownMs)||policy.attemptCooldownMs<1||policy.slotCompletion!=='KEEP_CONFIRMED'||
      !text(currentKeyId)||!text(fingerprintKeyId)||!keys||!Buffer.isBuffer(keys[currentKeyId])||
      !Buffer.isBuffer(keys[fingerprintKeyId]))fail('CONFIGURATION_REQUIRED');
  policy=Object.freeze({...policy});
  const keyRing=new Map(Object.entries(keys).map(([id,secret])=>{
    if(!text(id)||!Buffer.isBuffer(secret)||secret.length<32)fail('INVALID_CONFIGURATION');
    return [id,Buffer.from(secret)];
  }));
  const mac=(keyId,domain,data)=>{
    const secret=keyRing.get(keyId);if(!secret)fail('CONFIGURATION_REQUIRED');
    return createHmac('sha256',secret).update(canonicalJSON([domain,environment,appId,data])).digest('hex');
  };
  const binding=(order,credential)=>[order._id,order.ownerId,order.storeId,credential.policyVersion,
    credential.format,credential.keyId,credential.issuedAt,credential.expiresAt];
  const valueFor=(order,c)=>mac(c.keyId,'pickup-value-v1',binding(order,c));
  const digestFor=(order,c,value)=>mac(c.keyId,'pickup-digest-v1',[binding(order,c),value]);
  function ready(order,now){
    validateOrderTime(order,now);
    if(order.fulfillment!=='PICKUP'||order.orderStatus!=='READY'||order.paymentStatus!=='PAID')fail('INVALID_TRANSITION');
  }
  function validate(order,c,now){
    if(!c||Object.keys(c).sort().join(',')!==[...FIELDS].sort().join(',')||
        !/^[a-f0-9]{64}$/.test(c.digest)||!time(c.issuedAt)||c.issuedAt<order.createdAt||c.issuedAt>order.updatedAt||
        !time(c.expiresAt)||c.expiresAt<=c.issuedAt||!counter(c.failedAttempts)||
        !time(c.nextAttemptAt)||c.nextAttemptAt<c.issuedAt||!text(c.keyId)||!text(c.policyVersion)||
        c.format!=='OPAQUE_TOKEN'||!time(now)||
        (c.usedAt===null?c.usedBy!==null:!time(c.usedAt)||c.usedAt<c.issuedAt||c.usedAt>=c.expiresAt||
          c.usedAt>order.updatedAt||!text(c.usedBy)))fail('INVALID_PICKUP_CREDENTIAL');
    if(c.policyVersion!==policy.version)fail('CONFIGURATION_REQUIRED');
    if(c.expiresAt-c.issuedAt!==policy.ttlMs||c.failedAttempts>policy.maxFailedAttempts||
        !equal(c.digest,digestFor(order,c,valueFor(order,c))))fail('INVALID_PICKUP_CREDENTIAL');
  }
  function get(order,now){
    ready(order,now);
    let c=order.pickupCredential;
    if(c!==null){validate(order,c,now);if(c.usedAt!==null)fail('PICKUP_CREDENTIAL_USED');}
    let changed=false;
    if(c===null||now>=c.expiresAt){
      const expiresAt=now+policy.ttlMs;if(!time(expiresAt))fail('INVALID_CONFIGURATION');
      c={issuedAt:now,expiresAt,keyId:currentKeyId,policyVersion:policy.version,format:policy.format,
        failedAttempts:0,nextAttemptAt:now,usedAt:null,usedBy:null};
      c.digest=digestFor(order,c,valueFor(order,c));changed=true;
    }
    if(c.failedAttempts>=policy.maxFailedAttempts)fail('PICKUP_CREDENTIAL_LOCKED');
    return freeze({credential:{...c},changed,
      dto:{orderId:order._id,expiresAt:c.expiresAt,format:c.format,value:valueFor(order,c)}});
  }
  function verify(order,value,subjectId,now){
    ready(order,now);if(!text(subjectId)||!text(value))fail('INVALID_REQUEST');
    const c=order.pickupCredential;if(c===null)fail('PICKUP_CREDENTIAL_REQUIRED');validate(order,c,now);
    if(c.usedAt!==null)fail('PICKUP_CREDENTIAL_USED');
    if(now>=c.expiresAt)fail('PICKUP_CREDENTIAL_EXPIRED');
    if(c.failedAttempts>=policy.maxFailedAttempts)return freeze({errorCode:'PICKUP_CREDENTIAL_LOCKED',credential:null});
    if(now<c.nextAttemptAt)return freeze({errorCode:'PICKUP_CREDENTIAL_RATE_LIMITED',credential:null});
    if(!equal(c.digest,digestFor(order,c,value))){
      const nextAttemptAt=now+policy.attemptCooldownMs;if(!time(nextAttemptAt))fail('INVALID_CONFIGURATION');
      return freeze({errorCode:'PICKUP_CREDENTIAL_INVALID',credential:{...c,failedAttempts:c.failedAttempts+1,nextAttemptAt}});
    }
    return freeze({errorCode:null,credential:{...c,usedAt:now,usedBy:subjectId}});
  }
  function resources(order,state,now){
    return planRetainedFulfillment(order,state,{environment,now},policy);
  }
  return Object.freeze({get,verify,resources,
    // Keep this key stable throughout receipt retention, including value-key rotation.
    fingerprint:payload=>mac(fingerprintKeyId,'pickup-request-v1',payload)});
}
module.exports={createPickupCredentialModel};
