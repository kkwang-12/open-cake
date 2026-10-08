'use strict';
// Server-only SDK primitives. No endpoint, identity, query fencing, or business
// authorization is supplied here. These require the calling domain's adapter.
const {canonicalJSON}=require('./idempotency-model');
class CloudDocumentTransactionError extends Error {
  constructor(code,diagnostic){super(code);this.name='CloudDocumentTransactionError';this.code=code;
    if(diagnostic)this.diagnostic=Object.freeze(diagnostic);}
}
const fail=(code,diagnostic)=>{throw new CloudDocumentTransactionError(code,diagnostic);};
const plain=value=>value!==null && typeof value==='object' &&
  [Object.prototype,null].includes(Object.getPrototypeOf(value));
const text=value=>typeof value==='string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const counter=value=>Number.isSafeInteger(value) && value>=0;
const copy=value=>JSON.parse(canonicalJSON(value));
const protectedFields=new Set(['_id','_openid','schemaVersion','environment','appId','openId',
  'ownerId','subjectId','storeId','createdAt','version']);
// wx-server-sdk can wrap a native Mongo duplicate in DATABASE_REQUEST_FAILED.
// An exact E11000 duplicate-key signature (or native numeric code) is evidence;
// the generic wrapper and a message merely mentioning "duplicate" are not.
const mongoDuplicate=error=>!!error && (error.code===11000 || error.errCode===11000 ||
  [error.errMsg,error.message].some(value=>typeof value==='string' && /\bE11000 duplicate key error\b/.test(value)));
const duplicate=error=>!!error && (error.code==='DATABASE_DUPLICATE_WRITE' || error.errCode==='DATABASE_DUPLICATE_WRITE' ||
  [error.errMsg,error.message].some(value=>typeof value==='string' && /\bDATABASE_DUPLICATE_WRITE\b/.test(value)) ||
  mongoDuplicate(error));
// Only exact provider markers are retained; messages/IDs/credentials are never
// attached to public errors. The SDK requires this conflict code to retry.
const providerCodes=['DATABASE_TRANSACTION_CONFLICT','DATABASE_DUPLICATE_WRITE','DATABASE_REQUEST_FAILED'];
function providerCode(error) {
  if(mongoDuplicate(error))return 'MONGO_DUPLICATE_KEY';
  return providerCodes.find(code=>error && (error.code===code || error.errCode===code ||
    [error.errMsg,error.message].some(value=>typeof value==='string' &&
      new RegExp('\\b'+code+'\\b').test(value)))) || 'UNKNOWN';
}
const conflict=error=>providerCode(error)==='DATABASE_TRANSACTION_CONFLICT';
function diagnostic(error,operation,attempt) {
  return {providerCode:providerCode(error),numericErrCode:Number.isSafeInteger(error?.errCode)?error.errCode:null,
    operation,attempt};
}
function createCloudDocumentTransactionAdapter({cloud,environment,collections}) {
  if(!cloud || typeof cloud.database!=='function' || !text(environment) || !plain(collections) ||
    !Object.keys(collections).length)fail('INVALID_TRANSACTION_CONFIGURATION');
  const definitions=new Map();
  for(const [name,fields] of Object.entries(collections)) {
    if(!text(name) || !Array.isArray(fields) || new Set(fields).size!==fields.length ||
      fields.some(field=>!text(field) || protectedFields.has(field)))fail('INVALID_TRANSACTION_CONFIGURATION');
    definitions.set(name,new Set(fields));
  }
  return Object.freeze({async runTransaction(work) {
    if(typeof work!=='function')fail('INVALID_TRANSACTION_WORK');
    const callbackErrors=new WeakSet();
    let attempt=0;
    try {
      const db=cloud.database({env:environment,throwOnNotFound:false});
      if(!db || typeof db.runTransaction!=='function')fail('INVALID_TRANSACTION_CONFIGURATION');
      // SDK may retry this callback: every attempt gets a new read cache. The
      // callback must have no network calls or side effects outside this session.
      return await db.runTransaction(async transaction=>{
        attempt++;
        const reads=new Map();
        function reference(collection,id) {
          if(!definitions.has(collection) || !text(id))fail('INVALID_TRANSACTION_DOCUMENT');
          return transaction.collection(collection).doc(id);
        }
        function key(collection,id){return JSON.stringify([collection,id]);}
        async function provider(operation,invoke) {
          try{return await invoke();}catch(error){
            if(error instanceof CloudDocumentTransactionError)throw error;
            if(conflict(error))throw Object.assign(new Error('DATABASE_TRANSACTION_CONFLICT'),
              {code:'DATABASE_TRANSACTION_CONFLICT'});
            // Only an explicit provider duplicate marker is accepted. Generic
            // database/transport failures are not evidence of a unique conflict.
            if(duplicate(error))fail('CLOUD_UNIQUE_CONFLICT',diagnostic(error,operation,attempt));
            fail('CLOUD_DOCUMENT_OPERATION_FAILED',diagnostic(error,operation,attempt));
          }
        }
        async function read(collection,id) {
          const doc=reference(collection,id),cacheKey=key(collection,id);
          if(reads.has(cacheKey))return copy(reads.get(cacheKey));
          const response=await provider('get',()=>doc.get());
          if(!response || !Object.hasOwn(response,'data') || (response.data!==null &&
            (!plain(response.data) || response.data._id!==id)))fail('INVALID_DATABASE_RESPONSE');
          const data=copy(response.data);
          reads.set(cacheKey,data);
          return copy(data);
        }
        async function insert(collection,record) {
          if(!plain(record) || !text(record._id))fail('INVALID_TRANSACTION_DOCUMENT');
          const data=copy(record);
          if(await read(collection,data._id)!==null)fail('DOCUMENT_ALREADY_EXISTS');
          const result=await provider('add',()=>transaction.collection(collection).add({data}));
          if(!result || result._id!==data._id)fail('INVALID_DATABASE_RESPONSE');
          reads.set(key(collection,data._id),copy(data));
          return 1;
        }
        async function updateVersioned(collection,id,expectedVersion,patch) {
          const doc=reference(collection,id);
          if(!counter(expectedVersion) || !counter(expectedVersion+1) || !plain(patch) ||
            !Object.keys(patch).length || Object.keys(patch).some(field=>!definitions.get(collection).has(field)))
            fail('INVALID_TRANSACTION_UPDATE');
          const data=copy(patch),current=await read(collection,id);
          if(!current || !counter(current.version) || current.version!==expectedVersion)fail('VERSION_CONFLICT');
          // Optimistic protection to commit is an SDK obligation to verify in D04;
          // a read/version check alone is not proof of concurrency safety.
          const result=await provider('update',()=>doc.update({data:{...data,version:expectedVersion+1}}));
          if(!result || !result.stats || result.stats.updated!==1)fail('VERSION_CONFLICT');
          reads.set(key(collection,id),{...current,...data,version:expectedVersion+1});
          return 1;
        }
        try{return await work(Object.freeze({read,insert,updateVersioned}));}
        catch(error){if(error instanceof Error && !conflict(error))callbackErrors.add(error);throw error;}
      });
    }catch(error){
      if(error instanceof CloudDocumentTransactionError || (error instanceof Error && callbackErrors.has(error)))throw error;
      if(duplicate(error))fail('CLOUD_UNIQUE_CONFLICT',diagnostic(error,'transaction',attempt));
      fail('CLOUD_TRANSACTION_FAILED',diagnostic(error,'transaction',attempt));
    }
  }});
}
module.exports={CloudDocumentTransactionError,createCloudDocumentTransactionAdapter};
