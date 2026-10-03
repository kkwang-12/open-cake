'use strict';
// Trusted server-side metadata / references only. No decoding, upload or delete.
const { createHash } = require('node:crypto');
const { canonicalJSON, scopedDocumentId } = require('./idempotency-model');
class MediaModelError extends Error {
  constructor(code) { super(code); this.name = 'MediaModelError'; this.code = code; }
}
function fail(code) { throw new MediaModelError(code); }
function plain(value) { return value !== null && typeof value === 'object' && [Object.prototype,null].includes(Object.getPrototypeOf(value)); }
function text(value) { return typeof value === 'string' && value.length > 0 && value === value.trim() && value.isWellFormed(); }
function integer(value,positive=false) { return Number.isSafeInteger(value) && value >= (positive?1:0); }
function snapshot(value,code) {
  try { return JSON.parse(canonicalJSON(value)); } catch (_) { fail(code); }
}
function freeze(value) {
  if(value && typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}
  return value;
}
function configuration(context) {
  if(!plain(context) || !text(context.environment) || !['development','test','production'].includes(context.stage) ||
      !Array.isArray(context.allowedCloudPrefixes) || Object.keys(context.allowedCloudPrefixes).length!==context.allowedCloudPrefixes.length ||
      !context.allowedCloudPrefixes.every(prefix=>typeof prefix==='string' && /^cloud:\/\/[A-Za-z0-9._-]+\/(?:[A-Za-z0-9_-]+\/)*$/.test(prefix))) fail('INVALID_MEDIA_CONFIGURATION');
}
function referenceKind(storageRef,context) {
  if(!text(storageRef) || /[?#%\\\u0000-\u0020]/.test(storageRef)) fail('INVALID_MEDIA_REFERENCE');
  if(storageRef.split('/').some(part=>part==='.'||part==='..')) fail('INVALID_MEDIA_REFERENCE');
  if(/^\/assets\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(?:jpg|jpeg|png|webp)$/.test(storageRef)){
    if(context.stage!=='development') fail('MEDIA_NOT_READY');
    return 'LOCAL';
  }
  if(storageRef.startsWith('cloud://') && context.allowedCloudPrefixes.some(prefix=>storageRef.startsWith(prefix)) &&
      /^cloud:\/\/[A-Za-z0-9._-]+\/[A-Za-z0-9_./-]+$/.test(storageRef)) return 'CLOUD';
  fail('INVALID_MEDIA_REFERENCE');
}
function measureImageBytes(bytes,declaredMimeType,maxBytes) {
  if(!Buffer.isBuffer(bytes)||!integer(maxBytes,true)||bytes.length===0||bytes.length>maxBytes) fail('INVALID_MEDIA_BYTES');
  let mimeType;
  if(bytes.length>=33 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) &&
      bytes.readUInt32BE(8)===13 && bytes.toString('ascii',12,16)==='IHDR' &&
      bytes.readUInt32BE(16)>0 && bytes.readUInt32BE(20)>0) mimeType='image/png';
  else if(bytes.length>=4 && bytes[0]===255 && bytes[1]===216 &&
      bytes[bytes.length-2]===255 && bytes[bytes.length-1]===217) mimeType='image/jpeg';
  else if(bytes.length>=20 && bytes.toString('ascii',0,4)==='RIFF' &&
      bytes.readUInt32LE(4)+8===bytes.length && bytes.toString('ascii',8,12)==='WEBP' &&
      ['VP8 ','VP8L','VP8X'].includes(bytes.toString('ascii',12,16))) mimeType='image/webp';
  else fail('INVALID_MEDIA_BYTES');
  if(declaredMimeType!==mimeType) fail('MEDIA_TYPE_MISMATCH');
  // Signatures are an initial gate, NOT proof of a fully decoded safe image.
  return Object.freeze({mimeType,byteLength:bytes.length,contentHash:createHash('sha256').update(bytes).digest('hex')});
}
function createMediaDraft(input,bytes,context) {
  configuration(context);
  input=snapshot(input,'INVALID_MEDIA_ASSET');
  if(!plain(input)||Object.keys(input).sort().join(',')!==['assetId','revision','storageRef','sourceKind','mimeType'].sort().join(',') ||
      !text(input.assetId)||!text(input.revision)||!['REAL_PHOTO','DESIGN_PREVIEW'].includes(input.sourceKind) ||
      !integer(context.now,true)||!integer(context.maxBytes,true)) fail('INVALID_MEDIA_ASSET');
  referenceKind(input.storageRef,context);
  const measured=measureImageBytes(bytes,input.mimeType,context.maxBytes);
  return freeze({
    _id:scopedDocumentId('media',[context.environment,input.assetId,input.revision]),
    schemaVersion:1,version:0,createdAt:context.now,updatedAt:context.now,
    assetId:input.assetId,revision:input.revision,storageRef:input.storageRef,sourceKind:input.sourceKind,
    ...measured,status:'DRAFT',retainedUntil:null
  });
}
function validateMediaAsset(asset,context) {
  configuration(context);
  asset=snapshot(asset,'INVALID_MEDIA_ASSET');
  if(!plain(asset)||!text(asset.assetId)||!text(asset.revision)||asset._id!==scopedDocumentId('media',[context.environment,asset.assetId,asset.revision]) ||
      asset.schemaVersion!==1||!integer(asset.version)||!integer(asset.createdAt,true)||
      !integer(asset.updatedAt,true)||asset.updatedAt<asset.createdAt ||
      !['REAL_PHOTO','DESIGN_PREVIEW'].includes(asset.sourceKind)||!text(asset.storageRef)||
      !['image/jpeg','image/png','image/webp'].includes(asset.mimeType) ||
      !integer(asset.byteLength,true)||typeof asset.contentHash!=='string'||!/^[a-f0-9]{64}$/.test(asset.contentHash)||
      !['DRAFT','PUBLISHED','RETIRED'].includes(asset.status)||
      (asset.retainedUntil!==null&&!integer(asset.retainedUntil,true))) fail('INVALID_MEDIA_ASSET');
  referenceKind(asset.storageRef,context);
  return freeze(asset);
}
function projectMediaReference(asset,context,usage) {
  asset=validateMediaAsset(asset,context);
  if(!['DEVELOPMENT_PREVIEW','PUBLIC_CATALOG','HISTORICAL_ORDER'].includes(usage)) fail('INVALID_MEDIA_USAGE');
  const kind=referenceKind(asset.storageRef,context);
  if(usage==='DEVELOPMENT_PREVIEW'){
    if(context.stage!=='development'||asset.status==='RETIRED') fail('MEDIA_NOT_READY');
  } else {
    if(kind!=='CLOUD'||asset.status==='DRAFT') fail('MEDIA_NOT_READY');
    if(usage==='PUBLIC_CATALOG'&&(asset.status!=='PUBLISHED'||asset.sourceKind!=='REAL_PHOTO')) fail('MEDIA_NOT_READY');
  }
  return Object.freeze({assetId:asset.assetId,storageRef:asset.storageRef,sourceKind:asset.sourceKind,revision:asset.revision});
}
function resolveSnapshotMedia(ref,assets,context) {
  ref=snapshot(ref,'INVALID_MEDIA_REFERENCE');
  assets=snapshot(assets,'INVALID_MEDIA_REFERENCE');
  if(!plain(ref)||Object.keys(ref).sort().join(',')!==['assetId','storageRef','sourceKind','revision'].sort().join(',')||
      !Array.isArray(assets)||Object.keys(assets).length!==assets.length) fail('INVALID_MEDIA_REFERENCE');
  const matches=assets.filter(asset=>plain(asset)&&asset.assetId===ref.assetId&&asset.revision===ref.revision);
  if(matches.length!==1) fail('MEDIA_VERSION_UNAVAILABLE');
  const projected=projectMediaReference(matches[0],context,'HISTORICAL_ORDER');
  if(projected.storageRef!==ref.storageRef||projected.sourceKind!==ref.sourceKind) fail('MEDIA_VERSION_CONFLICT');
  return projected; // RETIRED is still readable; no redirect to newest revision.
}
function mediaRetentionDecision(asset,references,context) {
  asset=validateMediaAsset(asset,context);
  references=snapshot(references,'INVALID_MEDIA_REFERENCE_COUNTS');
  if(!plain(references)||typeof references.scanComplete!=='boolean'||
      !['activeCatalog','activeQuotes','historicalOrders'].every(key=>integer(references[key]))||
      !integer(context.now,true)) fail('INVALID_MEDIA_REFERENCE_COUNTS');
  const reasons=[];
  if(asset.status!=='RETIRED') reasons.push('NOT_RETIRED');
  if(asset.retainedUntil===null) reasons.push('RETENTION_UNAPPROVED');
  else if(context.now<asset.retainedUntil) reasons.push('RETENTION_ACTIVE');
  if(!references.scanComplete) reasons.push('REFERENCE_SCAN_INCOMPLETE');
  for(const key of ['activeCatalog','activeQuotes','historicalOrders'])if(references[key]>0)reasons.push('REFERENCED_'+key);
  return freeze({decision:reasons.length?'KEEP':'RECHECK_BEFORE_DELETE',reasons});
}
function planMediaRegistration(input,bytes,existing,context) {
  const candidate=createMediaDraft(input,bytes,context);
  existing=snapshot(existing,'INVALID_MEDIA_ASSET');
  if(!Array.isArray(existing)) fail('INVALID_MEDIA_ASSET');
  const seen=new Set();
  const records=existing.map(value=>{
    const asset=validateMediaAsset(value,context);
    const key=canonicalJSON([asset.assetId,asset.revision]);
    if(seen.has(key)) fail('MEDIA_VERSION_CONFLICT');
    seen.add(key);
    return asset;
  });
  const previous=records.find(asset=>asset.assetId===candidate.assetId&&asset.revision===candidate.revision);
  if(previous){
    const locked=['_id','assetId','revision','storageRef','sourceKind','contentHash','mimeType','byteLength'];
    if(locked.some(key=>previous[key]!==candidate[key])) fail('MEDIA_VERSION_CONFLICT');
    return freeze({type:'SKIP_EXISTING',_id:previous._id});
  }
  return freeze({type:'CREATE_IF_ABSENT',document:candidate});
}
module.exports={MediaModelError,measureImageBytes,createMediaDraft,validateMediaAsset,
  projectMediaReference,resolveSnapshotMedia,mediaRetentionDecision,planMediaRegistration};
