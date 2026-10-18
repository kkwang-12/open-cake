'use strict';
const {createHash}=require('node:crypto');
const {createHandler}=require('./runtime');
const {parseApiRequest}=require('./api-contract');
const {identityFromPlatform,resolveCustomer,requireOwner}=require('./authorization-model');
const {createAddressService}=require('./address-service');
const {validateAddress,publicAddress}=require('./address-model');
const {pageRequest,readCursor,issueCursor,seekConditions}=require('./pagination-model');
const {scopedDocumentId,requestFingerprint,canonicalJSON}=require('./idempotency-model');
const ACTIONS=['list','get','create','update','remove','setDefault','location.resolve'];
const API_VERSION='v1-api-2026-10-03';
const fail=code=>{throw Object.assign(new Error(code),{code});};
const clone=value=>JSON.parse(canonicalJSON(value));
const counter=v=>Number.isSafeInteger(v)&&v>=0;
const safeErrors=new Set(['INVALID_REQUEST','AUTH_REQUIRED','APP_MISMATCH','ENV_MISMATCH','INVALID_CONFIGURATION',
  'CONFIGURATION_REQUIRED','FORBIDDEN','NOT_FOUND','VERSION_CONFLICT','IDEMPOTENCY_KEY_REUSED','BUSY',
  'LOCATION_REQUIRED','CURSOR_INVALID','CURSOR_EXPIRED']);
const mapError=e=>e&&e.code==='FORBIDDEN'?'NOT_FOUND':['USER_NOT_PROVISIONED','USER_DISABLED','INVALID_USER_RECORD'].includes(e&&e.code)?'AUTH_REQUIRED':
  safeErrors.has(e&&e.code)?e.code:'INTERNAL_ERROR';
function data(response,id){
  if(!response||!Object.hasOwn(response,'data')||(response.data!==null&&
    (!response.data||typeof response.data!=='object'||Array.isArray(response.data)||response.data._id!==id)))fail('INTERNAL_ERROR');
  return response.data;
}
// Every address mutation also advances the existing users.version in its transaction.
// All address writers must use this per-owner guard; client writes stay denied.
function createCloudAddressRepository(cloud,settings,now=Date.now){
  const db=()=>cloud.database({env:settings.environment,throwOnNotFound:false});
  async function loadCustomer(context){
    const identity=identityFromPlatform(context,settings);
    return resolveCustomer(context,settings,data(await db().collection('users').doc(identity._id).get(),identity._id));
  }
  async function list(context,principal,input){
    const {pageSize,cursor}=pageRequest(input),time=now();
    return db().runTransaction(async tx=>{
      const user=data(await tx.collection('users').doc(principal.subjectId).get(),principal.subjectId);
      resolveCustomer(context,settings,user);
      if(!(user.defaultAddressId===null||typeof user.defaultAddressId==='string'))fail('INTERNAL_ERROR');
      const binding={environment:settings.environment,actorScope:JSON.stringify([settings.appId,principal.subjectId]),
        action:'address.list',sortId:'UPDATED_DESC',query:{ownerId:principal.subjectId,deletedAt:null,userVersion:user.version}};
      const base={ownerId:principal.subjectId,deletedAt:null};let filter=base;
      if(cursor){
        const last=readCursor(cursor,binding,settings.cursorKey,time),command=db().command;
        const branches=seekConditions(last,'UPDATED_DESC').map(branch=>Object.fromEntries(branch.map(c=>
          [c.field,c.operator==='EQ'?c.value:command.lt(c.value)])));
        filter=command.and([base,command.or(branches)]);
      }
      const response=await tx.collection('addresses').where(filter).orderBy('updatedAt','desc').orderBy('_id','desc').limit(pageSize+1).get();
      if(!response||!Array.isArray(response.data)||response.data.length>pageSize+1||
        Buffer.byteLength(canonicalJSON(response.data))>2*1024*1024)fail('INTERNAL_ERROR');
      const ids=new Set();let previous=null;
      for(const address of response.data){
        validateAddress(address);requireOwner(principal,address);
        if(address.deletedAt!==null||ids.has(address._id)||(previous&&
          (previous.updatedAt<address.updatedAt||(previous.updatedAt===address.updatedAt&&previous._id<=address._id))))fail('INTERNAL_ERROR');
        ids.add(address._id);previous=address;
      }
      const selected=response.data.slice(0,pageSize),hasMore=response.data.length>pageSize,last=selected.at(-1);
      return {apiVersion:API_VERSION,items:selected.map(publicAddress),hasMore,
        nextCursor:hasMore?issueCursor([last.updatedAt,last._id],binding,settings.cursorKey,time):null,
        userVersion:user.version,defaultAddressId:user.defaultAddressId};
    },2);
  }
  function session(context,event,principal){
    const {contract,payload}=parseApiRequest('address',event),action=contract.action;
    const actorScope=JSON.stringify([settings.appId,principal.subjectId]);
    return async function runTransaction(work){
      return db().runTransaction(async tx=>{
        let user=null,nextUser=null,receiptWritten=false;
        const read=async(name,id)=>data(await tx.collection(name).doc(id).get(),id);
        const update=async(name,id,patch)=>{
          const result=await tx.collection(name).doc(id).update({data:patch});
          if(!result||!result.stats||result.stats.updated!==1)fail('VERSION_CONFLICT');
        };
        const insert=async(name,record)=>{
          const result=await tx.collection(name).add({data:record});if(!result||result._id!==record._id)fail('INTERNAL_ERROR');
        };
        const facade={
          async readUser(id){
            if(id!==principal.subjectId)fail('FORBIDDEN');user=await read('users',id);resolveCustomer(context,settings,user);
            if(!counter(user.version+1))fail('VERSION_CONFLICT');return clone(user);
          },
          readAddress:id=>read('addresses',id),
          async readReceipt(id){
            const receipt=await read('idempotency_records',id);if(!receipt)return null;
            if(receipt.schemaVersion!==1||receipt.actorScope!==actorScope||receipt.command!=='address.'+action||
              receipt.key!==payload.idempotencyKey||receipt.status!=='SUCCEEDED'||!receipt.result||receipt.result.errorCode!==null||
              typeof receipt.requestFingerprint!=='string'||!counter(receipt.result.version)||typeof receipt.result.entityId!=='string')fail('INTERNAL_ERROR');
            const {idempotencyKey,...business}=payload;
            if(receipt.requestFingerprint!==requestFingerprint(business))return {fingerprint:receipt.requestFingerprint,response:null};
            const address=await read('addresses',action==='create'?receipt.result.entityId:payload.addressId);
            if(!address)fail('NOT_FOUND');validateAddress(address);requireOwner(principal,address);
            let response;
            if(action==='remove'){
              if(address.deletedAt===null)fail('INTERNAL_ERROR');
              response={entityId:address._id,deleted:true,userVersion:user.version};
            }else{
              if(address.deletedAt!==null)fail('NOT_FOUND');
              response=action==='setDefault'?{userId:user._id,version:user.version,defaultAddressId:user.defaultAddressId}:publicAddress(address);
            }
            return {fingerprint:receipt.requestFingerprint,response};
          },
          async saveAddress(address,expected){
            validateAddress(address);requireOwner(principal,address);
            const current=await read('addresses',address._id);
            if(expected===null){if(current)fail('VERSION_CONFLICT');await insert('addresses',address);}
            else{
              if(!current||current.version!==expected||current.deletedAt!==null)fail('VERSION_CONFLICT');
              requireOwner(principal,current);
              const patch=Object.fromEntries(['receiverName','phone','province','city','district','regionCodes','detail',
                'location','locationProof','version','updatedAt','deletedAt'].map(field=>[field,field==='locationProof'?address[field]??null:address[field]]));
              await update('addresses',address._id,patch);
            }
          },
          async saveUser(record,expected){
            if(!user||record._id!==user._id||expected!==user.version||record.version!==expected+1)fail('VERSION_CONFLICT');
            nextUser=record;
          },
          async saveReceipt(id,{fingerprint,response}){
            if(!user)fail('INTERNAL_ERROR');const time=now();
            const entityId=response.addressId||response.entityId||response.userId;
            const version=action==='setDefault'?user.version+1:action==='remove'?payload.expectedVersion+1:response.version;
            if(typeof entityId!=='string'||!counter(version))fail('INTERNAL_ERROR');
            await insert('idempotency_records',{_id:id,schemaVersion:1,version:0,createdAt:time,updatedAt:time,
              actorScope,command:'address.'+action,key:payload.idempotencyKey,requestFingerprint:fingerprint,status:'SUCCEEDED',
              result:{entityId,version,errorCode:null},leaseUntil:null,retentionUntil:null});receiptWritten=true;
          }
        };
        let result=await work(facade);
        // Replay/get never write the user. A new receipt and business writes share the guard.
        if(receiptWritten){
          const patch={version:user.version+1,updatedAt:Math.max(now(),user.updatedAt),
            defaultAddressId:nextUser?nextUser.defaultAddressId:user.defaultAddressId};
          await update('users',user._id,patch);
          if(action==='setDefault')result={...result,version:patch.version};
          result={...result,userVersion:patch.version};
        }else result={...result,userVersion:user.version};
        return result;
      },2);
    };
  }
  return {loadCustomer,list,session};
}
function createAddressCloudHandler({getContext,settings,repository,locationVerifier,logger=console,now=Date.now}){
  return async function main(event={},invocation){
    // Native CloudBase calls inject userInfo/tcbContext into the transport event. Neither is
    // business input or trusted identity; authorization uses native context only.
    if(event&&typeof event==='object'&&!Array.isArray(event)&&
      (Object.hasOwn(event,'userInfo')||Object.hasOwn(event,'tcbContext'))){
      const {userInfo,tcbContext,...request}=event;event=request;
    }
    const action=event&&ACTIONS.includes(event.action)?event.action:'__unsupported__';
    return createHandler({action,getContext,settings,logger,mapError:error=>{
      const code=mapError(error);
      if(code==='INTERNAL_ERROR'){
        const providerCodes=['DATABASE_TRANSACTION_CONFLICT','DATABASE_TRANSACTION_FAIL','DATABASE_REQUEST_FAILED',
          'DATABASE_DUPLICATE_WRITE','DATABASE_PERMISSION_DENIED'];
        const message=error&&(error.errMsg||error.message)||'';
        logger.warn({code:'ADDRESS_PROVIDER_REJECTED',revision:'address-provider-1',
          providerCode:providerCodes.includes(error&&error.code)?error.code:'OTHER',
          sdkErrorNumber:Number.isSafeInteger(error&&error.errCode)?error.errCode:null,
          conflictToken:/\bDATABASE_TRANSACTION_CONFLICT\b/.test(message),
          terminatedToken:/transaction (?:has been |was )?(?:terminated|aborted)/i.test(message)});
      }
      return code;
    },
      async handle({subjectHash},context){
        if(action==='__unsupported__')fail('INVALID_REQUEST');
        let parsed;
        try{parsed=parseApiRequest('address',event);}catch(error){
          // Diagnose native transport incompatibility without logging inputs,
          // identity, contacts, configuration, or attacker-controlled field names.
          let encoding='OK';try{canonicalJSON(event);}catch(e){
            encoding=e instanceof TypeError?'TYPE_ERROR':'INVALID_JSON';
          }
          const fields=Object.keys(event),known=['action','payload','requestId'];
          const hashes=value=>Object.keys(value).slice(0,32).map(key=>createHash('sha256').update(key).digest('hex').slice(0,16));
          logger.warn({code:'ADDRESS_INPUT_REJECTED',revision:'address-input-2',encoding,
            wellFormedAPI:typeof ''.isWellFormed==='function',
            eventPlain:[Object.prototype,null].includes(Object.getPrototypeOf(event)),
            extraFieldHashes:hashes(Object.fromEntries(fields.filter(key=>!known.includes(key)).map(key=>[key,null]))),
            payloadPlain:!!event.payload&&[Object.prototype,null].includes(Object.getPrototypeOf(event.payload)),
            payloadFieldHashes:event.payload&&typeof event.payload==='object'?hashes(event.payload):[],
            requestIdType:typeof event.requestId});
          throw error;
        }
        const {payload}=parsed;
        if(settings.enabled!==true||settings.phonePolicy!=='CN_MOBILE_FORMAT_V1'||!repository||
          !settings.cursorKey||!Buffer.isBuffer(settings.cursorKey.secret)||settings.cursorKey.secret.length<32)fail('CONFIGURATION_REQUIRED');
        const principal=await repository.loadCustomer(context);
        if(action==='location.resolve'){
          if(settings.locationEnabled!==true||!locationVerifier)fail('CONFIGURATION_REQUIRED');
          if(payload.address.mapSelectionToken!==undefined)fail('INVALID_REQUEST');
          const target={addressId:payload.addressId??null,expectedVersion:payload.expectedVersion??null};
          // Resolve an edit only after the existing address is authorized at its current version.
          if(target.addressId!==null){
            if(!counter(target.expectedVersion))fail('INVALID_REQUEST');
            const service=createAddressService({runTransaction:repository.session(context,{action:'get',payload:{addressId:target.addressId}},principal),now,
              newAddressId:()=>fail('INVALID_REQUEST')});
            const current=await service.execute({action:'get',payload:{addressId:target.addressId}},principal);
            if(current.version!==target.expectedVersion)fail('VERSION_CONFLICT');
          }else if(target.expectedVersion!==null)fail('INVALID_REQUEST');
          return {...await locationVerifier.resolve(payload.address,principal,target),apiVersion:API_VERSION,subjectHash};
        }
        if(action==='list')return {...await repository.list(context,principal,payload),subjectHash};
        const service=createAddressService({runTransaction:repository.session(context,event,principal),now,
          newAddressId:()=>scopedDocumentId('address',[settings.environment,principal.subjectId,payload.idempotencyKey]),
          validatePhone:phone=>/^1[3-9]\d{9}$/.test(phone),locationVerifier:settings.locationEnabled===true?locationVerifier:undefined});
        return {...await service.execute(event,principal),apiVersion:API_VERSION,subjectHash};
      }
    })(event,invocation);
  };
}
module.exports={createCloudAddressRepository,createAddressCloudHandler,ACTIONS,API_VERSION};
