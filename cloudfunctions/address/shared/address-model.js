'use strict';
const {requireOwner}=require('./authorization-model');
const FIELDS=['receiverName','phone','province','city','district','regionCodes','detail'];
const counter=value=>Number.isSafeInteger(value)&&value>=0;
const text=value=>typeof value==='string'&&value.length>0&&value.length<=2048&&value===value.normalize('NFC').trim()&&
  value.isWellFormed()&&!/[\u0000-\u001f\u007f]/.test(value);
const plain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
function fail(code){throw Object.assign(new Error(code),{code});}
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
function validateAddress(address){
  if(!plain(address)||!text(address._id)||!text(address.ownerId)||address.schemaVersion!==1||!counter(address.version)||
    !Number.isSafeInteger(address.createdAt)||address.createdAt<1||!Number.isSafeInteger(address.updatedAt)||
    address.updatedAt<address.createdAt||!(address.deletedAt===null||address.deletedAt===address.updatedAt)||
    FIELDS.filter(field=>field!=='regionCodes').some(field=>!text(address[field]))||!plain(address.regionCodes)||
    Object.keys(address.regionCodes).length!==3||['province','city','district'].some(field=>
      !(address.regionCodes[field]===null||text(address.regionCodes[field]))))fail('INVALID_ADDRESS_RECORD');
  if(address.location!==null&&(!plain(address.location)||!Number.isFinite(address.location.longitude)||
    Math.abs(address.location.longitude)>180||!Number.isFinite(address.location.latitude)||Math.abs(address.location.latitude)>90||
    address.location.coordinateSystem!=='WGS84'||!text(address.location.source)||
    !Number.isSafeInteger(address.location.verifiedAt)||address.location.verifiedAt<1||address.location.verifiedAt>address.updatedAt))fail('INVALID_ADDRESS_RECORD');
  return address;
}
function active(address,principal){
  validateAddress(address);requireOwner(principal,address);if(address.deletedAt!==null)fail('NOT_FOUND');return address;
}
function normalizeAddress(input,context){
  if(!plain(input)||Object.keys(input).length!==FIELDS.length||FIELDS.some(field=>!Object.prototype.hasOwnProperty.call(input,field)))fail('INVALID_REQUEST');
  const value=JSON.parse(JSON.stringify(input));
  for(const field of FIELDS.filter(field=>field!=='regionCodes')){
    if(typeof value[field]!=='string')fail('INVALID_REQUEST');value[field]=value[field].normalize('NFC').trim();
    if(!text(value[field]))fail('INVALID_REQUEST');
  }
  if(!plain(value.regionCodes)||Object.keys(value.regionCodes).length!==3||['province','city','district'].some(field=>
    !(value.regionCodes[field]===null||text(value.regionCodes[field]))))fail('INVALID_REQUEST');
  if(typeof context.validatePhone!=='function')fail('CONFIGURATION_REQUIRED');
  if(context.validatePhone(value.phone)!==true)fail('INVALID_REQUEST');
  if(Object.values(value.regionCodes).some(code=>code!==null)&&
    (typeof context.verifyRegion!=='function'||context.verifyRegion(value)!==true))fail('LOCATION_REQUIRED');
  return value;
}
function planAddressCommand(user,address,command,args,principal,context){
  requireOwner(principal,{ownerId:user&&user._id});
  if(!plain(user)||!counter(user.version)||user.status!=='ACTIVE'||!(user.defaultAddressId===null||text(user.defaultAddressId)))fail('INVALID_USER_RECORD');
  if(!plain(args)||!plain(context)||!Number.isSafeInteger(context.now)||context.now<1)fail('INVALID_REQUEST');
  if(user.updatedAt!==undefined&&(!Number.isSafeInteger(user.updatedAt)||user.updatedAt<1||context.now<user.updatedAt))fail('INVALID_USER_RECORD');
  if(!['CREATE','UPDATE','REMOVE','SET_DEFAULT'].includes(command))fail('INVALID_REQUEST');
  let current=null;
  if(command!=='CREATE'){
    current=active(address,principal);
    if(!counter(args.expectedVersion)||current.version!==args.expectedVersion)fail('VERSION_CONFLICT');
    if(context.now<current.updatedAt)fail('INVALID_REQUEST');
  }
  if(['REMOVE','SET_DEFAULT'].includes(command)&&(!counter(args.expectedUserVersion)||user.version!==args.expectedUserVersion))fail('VERSION_CONFLICT');
  const nextUser=JSON.parse(JSON.stringify(user));let nextAddress=null,userChanged=false;
  if(command==='CREATE'){
    if(address!==null||!text(context.newAddressId))fail('VERSION_CONFLICT');
    nextAddress={_id:context.newAddressId,ownerId:user._id,schemaVersion:1,version:0,
      ...normalizeAddress(args.address,context),location:null,createdAt:context.now,updatedAt:context.now,deletedAt:null};
  }else if(command==='UPDATE'){
    nextAddress={...JSON.parse(JSON.stringify(current)),...normalizeAddress(args.address,context),
      version:current.version+1,location:null,updatedAt:context.now};
  }else if(command==='REMOVE'){
    nextAddress={...JSON.parse(JSON.stringify(current)),version:current.version+1,updatedAt:context.now,deletedAt:context.now};
    if(nextUser.defaultAddressId===current._id){nextUser.defaultAddressId=null;userChanged=true;}
  }else if(nextUser.defaultAddressId!==current._id){nextUser.defaultAddressId=current._id;userChanged=true;}
  if(userChanged){nextUser.version++;nextUser.updatedAt=context.now;if(!counter(nextUser.version))fail('VERSION_CONFLICT');}
  if(nextAddress)validateAddress(nextAddress);
  return freeze({nextUser,nextAddress,userChanged});
}
function publicAddress(address){
  validateAddress(address);
  return freeze({addressId:address._id,version:address.version,...Object.fromEntries(FIELDS.map(field=>
    [field,JSON.parse(JSON.stringify(address[field]))])),location:address.location===null?null:
    Object.fromEntries(['longitude','latitude','coordinateSystem'].map(field=>[field,address.location[field]]))});
}
function snapshotAddress(address,principal,expectedVersion){
  active(address,principal);if(!counter(expectedVersion)||expectedVersion!==address.version)fail('VERSION_CONFLICT');
  const {version,...value}=publicAddress(address);
  return freeze({addressVersion:version,addressSnapshot:{...value,location:address.location===null?null:
    Object.fromEntries(['longitude','latitude','coordinateSystem','source','verifiedAt'].map(field=>[field,address.location[field]]))}});
}
module.exports={planAddressCommand,validateAddress,publicAddress,snapshotAddress};
