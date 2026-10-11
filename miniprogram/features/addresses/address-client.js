'use strict';
const config=require('../../config');
const local=require('./local-addresses');
const {createClient}=require('../../services/cloud');
const {createError}=require('../../services/errors');
const {createLocalOperationId}=require('../../utils/local-operation');
const FIELDS=local.FIELDS,API_VERSION='v1-api-2026-10-03';
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const counter=v=>Number.isSafeInteger(v)&&v>=0;
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,256}$/.test(v);
const subject=v=>typeof v==='string'&&/^[a-f0-9]{16}$/.test(v);
const clone=v=>JSON.parse(JSON.stringify(v));
// Authentication failure cannot establish which account handled the command.
const terminal=new Set(['INVALID_REQUEST','FORBIDDEN','NOT_FOUND','VERSION_CONFLICT','IDEMPOTENCY_KEY_REUSED','LOCATION_REQUIRED']);
function createAddressClient(settings,platform=()=>typeof wx==='undefined'?null:wx,
  transport=createClient(settings,platform),localClient=local,newId=createLocalOperationId){
  const storageKey='jiajiale.address-command-drafts.v1:'+settings.appId+':'+settings.stage+':'+
    (settings.cloudEnvironments&&settings.cloudEnvironments[settings.stage]||'');
  function gate(){if(settings.mode!=='cloud'||!settings.addresses||settings.addresses.enabled!==true)throw createError('CLOUD_NOT_CONFIGURED');}
  function validatedAddress(value){
    if(!plain(value)||!id(value.addressId)||!counter(value.version)||Object.keys(value).some(key=>
      !['addressId','version',...FIELDS,'regionCodes','location','apiVersion','userVersion','subjectHash'].includes(key)))throw createError('INVALID_RESPONSE');
    let draft;try{draft=local.normalizeDraft(Object.fromEntries(FIELDS.map(f=>[f,value[f]])));}catch(_){throw createError('INVALID_RESPONSE');}
    if(FIELDS.some(f=>draft[f]!==value[f])||!plain(value.regionCodes)||Object.keys(value.regionCodes).sort().join(',')!=='city,district,province'||
      Object.values(value.regionCodes).some(v=>v!==null&&!id(v)))throw createError('INVALID_RESPONSE');
    const location=value.location;
    if(location!==null&&(!plain(location)||Object.keys(location).sort().join(',')!=='coordinateSystem,latitude,longitude'||
      location.coordinateSystem!=='WGS84'||!Number.isFinite(location.longitude)||Math.abs(location.longitude)>180||
      !Number.isFinite(location.latitude)||Math.abs(location.latitude)>90))throw createError('INVALID_RESPONSE');
    return {addressId:value.addressId,version:value.version,...draft,regionCodes:clone(value.regionCodes),location:clone(location)};
  }
  async function list(){
    if(settings.mode==='shell')return localClient.list();gate();
    const addresses=[],ids=new Set(),cursors=new Set();let cursor=null,revision=null,defaultAddressId=null,subjectHash=null;
    for(let pageNumber=0;pageNumber<20;pageNumber++){
      const {data}=await transport.call('address','list',{pageSize:50,cursor});
      if(!plain(data)||data.apiVersion!==API_VERSION||!Array.isArray(data.items)||data.items.length>50||
        !subject(data.subjectHash)||(subjectHash!==null&&data.subjectHash!==subjectHash)||
        !counter(data.userVersion)||(revision!==null&&data.userVersion!==revision)||
        !(data.defaultAddressId===null||id(data.defaultAddressId))||(revision!==null&&data.defaultAddressId!==defaultAddressId)||
        typeof data.hasMore!=='boolean'||(data.hasMore?(!data.items.length||typeof data.nextCursor!=='string'||
          !data.nextCursor||data.nextCursor.length>4096||cursors.has(data.nextCursor)):data.nextCursor!==null))throw createError('INVALID_RESPONSE');
      revision=data.userVersion;defaultAddressId=data.defaultAddressId;subjectHash=data.subjectHash;
      for(const value of data.items){const row=validatedAddress(value);if(ids.has(row.addressId))throw createError('INVALID_RESPONSE');
        ids.add(row.addressId);addresses.push({...row,isDefault:row.addressId===defaultAddressId});}
      if(!data.hasMore){
        if(defaultAddressId!==null&&!ids.has(defaultAddressId))throw createError('INVALID_RESPONSE');
        return {scope:'CLOUD_OWNER',subjectHash,revision,defaultAddressId,addresses};
      }
      cursor=data.nextCursor;cursors.add(cursor);
    }
    throw createError('INVALID_RESPONSE');
  }
  function pending(key){
    const api=platform();if(!api||typeof api.getStorageSync!=='function'||typeof api.setStorageSync!=='function')throw createError('LOCAL_ADDRESS_WRITE_FAILED');
    let saved;try{saved=api.getStorageSync(key);}catch(_){throw createError('LOCAL_ADDRESS_READ_FAILED');}
    if(saved===''||saved===null||saved===undefined)return [];
    if(!Array.isArray(saved)||saved.length>20||saved.some(entry=>!plain(entry)||typeof entry.signature!=='string'||
      !/^[A-Za-z0-9_-]{16,128}$/.test(entry.key)))throw createError('LOCAL_ADDRESS_WRITE_FAILED');return saved;
  }
  function persist(key,entries){
    const api=platform();try{api.setStorageSync(key,clone(entries));
      if(JSON.stringify(api.getStorageSync(key))!==JSON.stringify(entries))throw new Error();}
    catch(_){throw createError('LOCAL_ADDRESS_WRITE_FAILED');}
  }
  function finish(storage,signature,key){const entries=pending(storage);persist(storage,entries.filter(e=>e.signature!==signature||e.key!==key));}
  async function mutate(action,payload){
    gate();const before=await list(),storage=storageKey+':'+before.subjectHash;
    const signature=JSON.stringify([action,payload]),entries=pending(storage);let intent=entries.find(e=>e.signature===signature);
    if(!intent){if(entries.length>=20)throw createError('BUSY');const key=newId();if(!/^[A-Za-z0-9_-]{16,128}$/.test(key||''))throw createError('LOCAL_ADDRESS_WRITE_FAILED');
      intent={signature,key};persist(storage,[...entries,intent]);}
    let response;
    try{response=await transport.call('address',action,{...payload,idempotencyKey:intent.key});}
    catch(error){if(terminal.has(error.code))finish(storage,signature,intent.key);throw error;}
    const data=response&&response.data;
    if(!plain(data)||data.apiVersion!==API_VERSION||!counter(data.userVersion)||data.subjectHash!==before.subjectHash)throw createError('INVALID_RESPONSE');
    if(['create','update'].includes(action))validatedAddress(data);
    if(action==='remove'&&(data.entityId!==payload.addressId||data.deleted!==true))throw createError('INVALID_RESPONSE');
    if(action==='setDefault'&&(!counter(data.version)||!(data.defaultAddressId===null||id(data.defaultAddressId))))throw createError('INVALID_RESPONSE');
    const book=await list();if(book.subjectHash!==before.subjectHash)throw createError('INVALID_RESPONSE');
    finish(storage,signature,intent.key);return book;
  }
  function fields(input){const value=local.normalizeDraft(input);return {...value,regionCodes:{province:null,city:null,district:null}};}
  return {FIELDS,selectionAllowed:settings.mode==='shell',list,
    create:(input,revision)=>settings.mode==='shell'?localClient.create(input,revision):mutate('create',{address:fields(input)}),
    update:(addressId,expectedVersion,input,revision)=>settings.mode==='shell'?localClient.update(addressId,expectedVersion,input,revision):
      mutate('update',{addressId,expectedVersion,address:fields(input)}),
    remove:(addressId,expectedVersion,expectedUserVersion)=>settings.mode==='shell'?localClient.remove(addressId,expectedVersion,expectedUserVersion):
      mutate('remove',{addressId,expectedVersion,expectedUserVersion}),
    setDefault:(addressId,expectedVersion,expectedUserVersion)=>settings.mode==='shell'?localClient.setDefault(addressId,expectedVersion,expectedUserVersion):
      mutate('setDefault',{addressId,expectedVersion,expectedUserVersion}),
    choose:(...args)=>{if(settings.mode==='shell')return localClient.choose(...args);throw createError('CONFIGURATION_REQUIRED');}
  };
}
module.exports={...createAddressClient(config),createAddressClient,FIELDS};
