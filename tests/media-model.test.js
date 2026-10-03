'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const { createHash }=require('node:crypto');
const media=require('../cloudfunctions/_shared/media-model');
const bytes=fs.readFileSync(path.join(__dirname,'../catalog-assets/development/catalog-example.png'));
const context={stage:'development',environment:'offline-media',allowedCloudPrefixes:['cloud://offline-media/catalog/'],now:1000,maxBytes:8*1024*1024};
const input={assetId:'test-only-image',revision:'r1',storageRef:'cloud://offline-media/catalog/test-only.png',sourceKind:'REAL_PHOTO',mimeType:'image/png'};
const draft=(change={},config=context)=>media.createMediaDraft({...input,...change},bytes,config);
const clone=value=>JSON.parse(JSON.stringify(value));
const rejects=(run,code)=>assert.throws(run,error=>error.code===code);
test('media metadata measures actual bytes; drafts are detached and do not publish',()=>{
  const supplied={...input},asset=media.createMediaDraft(supplied,bytes,context);
  supplied.storageRef='changed';assert.equal(asset.status,'DRAFT');assert.equal(asset.retainedUntil,null);
  assert.equal(asset.byteLength,bytes.length);
  assert.equal(asset.contentHash,createHash('sha256').update(bytes).digest('hex'));
  assert.ok(Object.isFrozen(asset));assert.equal(asset.storageRef,input.storageRef);
  rejects(()=>media.projectMediaReference(asset,context,'PUBLIC_CATALOG'),'MEDIA_NOT_READY');
});
test('media signature / declared MIME / bounded size gates reject mismatches without decoding claims',()=>{
  rejects(()=>media.measureImageBytes(bytes,'image/jpeg',bytes.length),'MEDIA_TYPE_MISMATCH');
  for(const value of [Buffer.alloc(0),bytes.subarray(0,16),Buffer.from('not a picture'),'not bytes'])
    rejects(()=>media.measureImageBytes(value,'image/png',bytes.length),'INVALID_MEDIA_BYTES');
  rejects(()=>media.measureImageBytes(bytes,'image/png',bytes.length-1),'INVALID_MEDIA_BYTES');
  // A header alone passes this initial gate. It must still stay DRAFT: no full decode/publish validator.
  const header=bytes.subarray(0,33);
  assert.equal(media.measureImageBytes(header,'image/png',100).byteLength,33);
  assert.equal(media.createMediaDraft(input,header,context).status,'DRAFT');
});
test('media rejects external URLs, traversal, URL tokens and unapproved cloud storage',()=>{
  for(const storageRef of ['https://example.com/a.png','data:image/png;base64,a','C:/private/a.png',
    '/assets/../private.png','/assets/a.png?token=secret','/assets/%2e%2e/a.png',
    'cloud://other/catalog/a.png','cloud://offline-media/catalog/../private.png',
    'cloud://offline-media/catalogue/a.png','/assets/a.png\\private'])
    rejects(()=>draft({storageRef}),'INVALID_MEDIA_REFERENCE');
  assert.equal(draft({storageRef:'/assets/test-only.png',sourceKind:'DESIGN_PREVIEW'}).status,'DRAFT');
  rejects(()=>draft({storageRef:'/assets/test-only.png'},{...context,stage:'production'}),'MEDIA_NOT_READY');
  rejects(()=>draft({}, {...context,allowedCloudPrefixes:['https://unsafe/']}),'INVALID_MEDIA_CONFIGURATION');
});
test('media public projections strip internal metadata and reject development previews',()=>{
  const published={...draft(),status:'PUBLISHED',version:1};
  const ref=media.projectMediaReference(published,context,'PUBLIC_CATALOG');
  assert.deepEqual(Object.keys(ref).sort(),['assetId','revision','sourceKind','storageRef']);
  assert.ok(!JSON.stringify(ref).includes('contentHash'));
  rejects(()=>media.projectMediaReference({...published,sourceKind:'DESIGN_PREVIEW'},context,'PUBLIC_CATALOG'),'MEDIA_NOT_READY');
  rejects(()=>media.projectMediaReference({...published,status:'RETIRED'},context,'PUBLIC_CATALOG'),'MEDIA_NOT_READY');
  rejects(()=>media.projectMediaReference(published,{...context,stage:'test'},'DEVELOPMENT_PREVIEW'),'MEDIA_NOT_READY');
});
test('media malformed asset IDs produce media errors and getter inputs are never executed',()=>{
  rejects(()=>media.validateMediaAsset({},context),'INVALID_MEDIA_ASSET');
  const asset=clone(draft());delete asset.assetId;
  rejects(()=>media.validateMediaAsset(asset,context),'INVALID_MEDIA_ASSET');
  let invoked=false;
  const supplied={...input};
  Object.defineProperty(supplied,'revision',{get(){invoked=true;return 'r1';},enumerable:true});
  rejects(()=>media.createMediaDraft(supplied,bytes,context),'INVALID_MEDIA_ASSET');
  assert.equal(invoked,false);
});
test('media duplicate registration preserves existing versions and rejects same-revision byte / storage / source changes',()=>{
  const existing={...draft(),status:'RETIRED',version:4,retainedUntil:4000};
  assert.deepEqual(media.planMediaRegistration(input,bytes,[existing],context),{type:'SKIP_EXISTING',_id:existing._id});
  const changed=Buffer.from(bytes);changed[40]^=1;
  rejects(()=>media.planMediaRegistration(input,changed,[existing],context),'MEDIA_VERSION_CONFLICT');
  for(const change of [{storageRef:'cloud://offline-media/catalog/other.png'},{sourceKind:'DESIGN_PREVIEW'}])
    rejects(()=>media.planMediaRegistration({...input,...change},bytes,[existing],context),'MEDIA_VERSION_CONFLICT');
  assert.equal(media.planMediaRegistration({...input,revision:'r2'},bytes,[existing],context).type,'CREATE_IF_ABSENT');
  rejects(()=>media.planMediaRegistration(input,bytes,[existing,existing],context),'MEDIA_VERSION_CONFLICT');
});
test('historical image resolution keeps exact retired revision without following latest version',()=>{
  const retired={...draft(),status:'RETIRED'},newer={...draft({revision:'r2',storageRef:'cloud://offline-media/catalog/r2.png'}),status:'PUBLISHED'};
  const ref=media.projectMediaReference(retired,context,'HISTORICAL_ORDER');
  assert.equal(media.resolveSnapshotMedia(ref,[retired,newer],context).revision,'r1');
  rejects(()=>media.resolveSnapshotMedia(ref,[newer],context),'MEDIA_VERSION_UNAVAILABLE');
  rejects(()=>media.resolveSnapshotMedia({...ref,storageRef:newer.storageRef},[retired,newer],context),'MEDIA_VERSION_CONFLICT');
  rejects(()=>media.resolveSnapshotMedia(ref,[retired,retired],context),'MEDIA_VERSION_UNAVAILABLE');
  rejects(()=>media.resolveSnapshotMedia({...ref,token:'secret'},[retired],context),'INVALID_MEDIA_REFERENCE');
});
test('retention requires approved expiry and complete reference scan; even zero refs only proposes recheck',()=>{
  const retired={...draft(),status:'RETIRED',retainedUntil:1000};
  const counts={scanComplete:true,activeCatalog:0,activeQuotes:0,historicalOrders:0};
  assert.equal(media.mediaRetentionDecision(retired,counts,context).decision,'RECHECK_BEFORE_DELETE');
  for(const change of [{retainedUntil:null},{retainedUntil:1001},{status:'PUBLISHED'}])
    assert.equal(media.mediaRetentionDecision({...retired,...change},counts,context).decision,'KEEP');
  for(const change of [{scanComplete:false},{activeCatalog:1},{activeQuotes:1},{historicalOrders:1}])
    assert.equal(media.mediaRetentionDecision(retired,{...counts,...change},context).decision,'KEEP');
  rejects(()=>media.mediaRetentionDecision(retired,{...counts,historicalOrders:-1},context),'INVALID_MEDIA_REFERENCE_COUNTS');
});