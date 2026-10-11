async function(){
 const env='cloudbase-d8gwtxzm64150b7e0',out={state:'COMPLETED',environment:env};
 try{
  const response=await wx.cloud.callFunction({name:'address',data:{action:'list',payload:{}},config:{env}}),r=response.result;
  out.address={envelopeValid:!!r&&typeof r.ok==='boolean',ok:r&&r.ok===true,
   error:r&&r.error&&r.error.code||null,apiVersion:r&&r.data&&r.data.apiVersion||null,
   itemCount:r&&r.data&&Array.isArray(r.data.items)?r.data.items.length:null,
   userVersion:r&&r.data&&r.data.userVersion,defaultAddressId:r&&r.data&&r.data.defaultAddressId,
   subjectHash:r&&r.data&&r.data.subjectHash};
 }catch(e){out.address={ok:false,transportCode:e.errCode||e.code||'CLOUD_CALL_FAILED'};}
 const db=wx.cloud.database({env});out.clientReads=[];
 for(const collection of ['users','addresses','idempotency_records']){
  try{const r=await db.collection(collection).limit(1).get();out.clientReads.push({collection,rejected:false,count:r.data&&r.data.length});}
  catch(e){out.clientReads.push({collection,rejected:true,code:e.errCode||e.code||'PERMISSION_DENIED'});}
 }
 return out;
}
