'use strict';
const https=require('node:https');
const {createHmac,timingSafeEqual}=require('node:crypto');
const {canonicalJSON,requestFingerprint}=require('./idempotency-model');
const {normalizeAddress,validateAddress}=require('./address-model');
const {requireOwner}=require('./authorization-model');
const TTL=900000,SOURCE='TENCENT_GEOCODER_V1';
const fail=code=>{throw Object.assign(new Error(code),{code});};
const text=v=>typeof v==='string'&&v.length>0&&v.length<=2048&&v.isWellFormed()&&v===v.normalize('NFC').trim()&&!/[\u0000-\u001f\u007f]/.test(v);
const point=v=>v&&Number.isFinite(v.longitude)&&Math.abs(v.longitude)<=180&&Number.isFinite(v.latitude)&&Math.abs(v.latitude)<=90;
const fields=['receiverName','phone','province','city','district','regionCodes','detail'];
const values=address=>Object.fromEntries(fields.map(k=>[k,address[k]]));
function normalized(input){return normalizeAddress(input,{validatePhone:v=>/^1[3-9]\d{9}$/.test(v)});}
function targetValue(target){
  if(!target||Object.keys(target).sort().join(',')!=='addressId,expectedVersion'||
    !(target.addressId===null&&target.expectedVersion===null||text(target.addressId)&&Number.isSafeInteger(target.expectedVersion)&&target.expectedVersion>=0))fail('INVALID_REQUEST');
  return target;
}
// Fixed HTTPS endpoint; no caller URLs, redirects, retries, provider messages or credential logging.
function createTencentAddressGeocoder({key,get=https.get}){
  return async input=>{
    if(!text(key)||key.length>256)fail('CONFIGURATION_REQUIRED');
    const address=normalized(input),url=new URL('https://apis.map.qq.com/ws/geocoder/v1/');
    url.search=new URLSearchParams({address:address.province+address.city+address.district+address.detail,key,output:'json',policy:'0'}).toString();
    const response=await new Promise((resolve,reject)=>{
      let settled=false,deadline;const done=(error,value)=>{if(settled)return;settled=true;clearTimeout(deadline);error?reject(Object.assign(new Error('MAP_UNAVAILABLE'),{code:'LOCATION_REQUIRED'})):resolve(value);};
      let request;
      deadline=setTimeout(()=>{done(true);if(request)request.destroy();},5000);
      try{request=get(url,response=>{
        if(response.statusCode!==200){response.resume();done(true);return;}
        let bytes=0;const chunks=[];
        response.on('data',chunk=>{bytes+=chunk.length;if(bytes>65536){done(true);response.destroy();return;}chunks.push(chunk);});
        response.on('error',()=>done(true));response.on('aborted',()=>done(true));response.on('end',()=>{
          try{done(null,JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch(_){done(true);}
        });
      });request.on('error',()=>done(true));request.setTimeout(5000,()=>{done(true);request.destroy();});}
      catch(_){done(true);}
    });
    const r=response&&response.result,c=r&&r.address_components,l=r&&r.location;
    if(!response||response.status!==0||!r||!c||!l||!point({longitude:l.lng,latitude:l.lat})||
      !Number.isInteger(r.reliability)||r.reliability<7||r.reliability>10||![9,10,11].includes(r.level)||
      !Number.isFinite(r.similarity)||r.similarity<0.8||r.similarity>1||
      ['province','city','district'].some(k=>c[k]!==address[k]))fail('LOCATION_REQUIRED');
    return {longitude:l.lng,latitude:l.lat,coordinateSystem:'GCJ02'};
  };
}
function createAddressLocationVerifier({appId,environment,secret,geocode,now=Date.now}){
  function configuration(){if(!text(appId)||!text(environment)||!Buffer.isBuffer(secret)||secret.length<32)fail('CONFIGURATION_REQUIRED');}
  const clock=at=>{if(!Number.isSafeInteger(at)||at<1||!Number.isFinite(new Date(at).getTime()))fail('CONFIGURATION_REQUIRED');return at;};
  function mac(purpose,body){configuration();return createHmac('sha256',secret).update(purpose+'\n'+body).digest('base64url');}
  function signed(purpose,body,signature){
    if(typeof signature!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(signature))return false;
    const actual=Buffer.from(signature,'base64url'),expected=Buffer.from(mac(purpose,body),'base64url');
    return actual.length===expected.length&&actual.toString('base64url')===signature&&timingSafeEqual(actual,expected);
  }
  function scope(input,principal,target){
    requireOwner(principal,{ownerId:principal&&principal.subjectId});
    if(principal.appId!==appId||principal.environment!==environment)fail('LOCATION_REQUIRED');
    return requestFingerprint({appId,environment,ownerId:principal.subjectId,target:targetValue(target),address:normalized(input)});
  }
  function proofBody(address){return canonicalJSON({appId,environment,ownerId:address.ownerId,addressId:address._id,version:address.version,
    address:values(address),location:address.location});}
  return Object.freeze({async resolve(input,principal,target){
    configuration();const binding=scope(input,principal,target);if(typeof geocode!=='function')fail('CONFIGURATION_REQUIRED');
    const result=await geocode(normalized(input)),at=clock(now());
    if(!point(result)||result.coordinateSystem!=='GCJ02'||Object.keys(result).sort().join(',')!=='coordinateSystem,latitude,longitude')fail('LOCATION_REQUIRED');
    const body=Buffer.from(canonicalJSON([1,at,result.longitude,result.latitude,binding]),'utf8').toString('base64url');
    const token=body+'.'+mac('address-selection-v1',body);if(token.length>256)fail('LOCATION_REQUIRED');
    return {mapSelectionToken:token,expiresAt:at+TTL,location:{...result}};
  },accept(token,input,principal,target,at){
    configuration();clock(at);const binding=scope(input,principal,target);
    if(typeof token!=='string'||token.length>256||!/^[-\w]+\.[-\w]{43}$/.test(token))fail('LOCATION_REQUIRED');
    const [body,signature]=token.split('.');if(!signed('address-selection-v1',body,signature))fail('LOCATION_REQUIRED');
    let parsed;try{const bytes=Buffer.from(body,'base64url');if(bytes.toString('base64url')!==body)fail('LOCATION_REQUIRED');parsed=JSON.parse(bytes.toString('utf8'));}catch(_){fail('LOCATION_REQUIRED');}
    if(!Array.isArray(parsed)||parsed.length!==5||parsed[0]!==1||parsed[4]!==binding||
      !Number.isSafeInteger(parsed[1])||parsed[1]<1||parsed[1]>at||at>=parsed[1]+TTL||
      !point({longitude:parsed[2],latitude:parsed[3]}))fail('LOCATION_REQUIRED');
    return {longitude:parsed[2],latitude:parsed[3],coordinateSystem:'GCJ02',source:SOURCE,verifiedAt:parsed[1]};
  },seal(address,principal){
    configuration();validateAddress(address);requireOwner(principal,address);
    if(principal.appId!==appId||principal.environment!==environment||!address.location||address.location.source!==SOURCE)fail('LOCATION_REQUIRED');
    return 'v1.'+mac('address-record-v1',proofBody(address));
  },verify(address,principal){
    try{configuration();validateAddress(address);requireOwner(principal,address);const at=clock(now());
      return principal.appId===appId&&principal.environment===environment&&address.deletedAt===null&&address.updatedAt<=at&&
        !!address.location&&address.location.source===SOURCE&&typeof address.locationProof==='string'&&address.locationProof.startsWith('v1.')&&
        signed('address-record-v1',proofBody(address),address.locationProof.slice(3));
    }catch(_){return false;}
  }});
}
module.exports={createTencentAddressGeocoder,createAddressLocationVerifier,ADDRESS_LOCATION_TOKEN_TTL_MS:TTL};
