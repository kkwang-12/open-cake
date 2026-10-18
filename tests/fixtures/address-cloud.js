'use strict';
const {identityFromPlatform}=require('../../cloudfunctions/_shared/authorization-model');
const {createCloudAddressRepository,createAddressCloudHandler}=require('../../cloudfunctions/_shared/address-cloud-handler');
const clone=v=>JSON.parse(JSON.stringify(v));
const settings={appId:'offline-address-app',environment:'offline-address-env',stage:'development',enabled:true,
  phonePolicy:'CN_MOBILE_FORMAT_V1',cursorKey:{id:'offline-key',secret:Buffer.alloc(32,8)}};
function fixture(options={}){
  const contexts=['A','B'].map(OPENID=>({OPENID,APPID:settings.appId,ENV:settings.environment}));
  const users=Object.fromEntries(contexts.map(c=>{const identity=identityFromPlatform(c,settings);return [identity._id,{...identity,
    schemaVersion:1,version:0,status:'ACTIVE',defaultAddressId:null,createdAt:1000,updatedAt:1000}];}));
  const state={users,addresses:{},idempotency_records:{}},calls=[],logs=[];let queue=Promise.resolve(),time=2000,failAt='';
  function matches(record,condition){
    if(condition.$and)return condition.$and.every(c=>matches(record,c));
    if(condition.$or)return condition.$or.some(c=>matches(record,c));
    return Object.entries(condition).every(([field,v])=>v&&typeof v==='object'&&Object.hasOwn(v,'$lt')?record[field]<v.$lt:record[field]===v);
  }
  function collection(source,name){return {
    doc(id){return {async get(){calls.push({op:'get',name,id});return {data:clone(source[name][id]||null)};},
      async update({data}){calls.push({op:'update',name,id,data:clone(data)});if(failAt===name)throw new Error('PRIVATE_PROVIDER_FAILURE');
        if(!source[name][id])return {stats:{updated:0}};Object.assign(source[name][id],clone(data));return {stats:{updated:1}};}};},
    async add({data}){calls.push({op:'add',name,id:data._id});if(failAt===name)throw new Error('PRIVATE_PROVIDER_FAILURE');
      if(source[name][data._id])throw Object.assign(new Error('DATABASE_DUPLICATE_WRITE'),{code:'DATABASE_DUPLICATE_WRITE'});
      source[name][data._id]=clone(data);return {_id:data._id};},
    where(condition){const orders=[];let size=0;return {
      orderBy(field,direction){orders.push([field,direction]);return this;},limit(v){size=v;return this;},
      async get(){calls.push({op:'query',name,condition,orders:clone(orders),size});
        const rows=Object.values(source[name]).filter(r=>matches(r,condition));rows.sort((a,b)=>{
          for(const [field,direction] of orders){if(a[field]!==b[field])return (a[field]<b[field]?-1:1)*(direction==='desc'?-1:1);}return 0;});
        return {data:clone(rows.slice(0,size))};}};}
  };}
  const database={command:{and:$and=>({$and}),or:$or=>({$or}),lt:$lt=>({$lt})},collection:name=>collection(state,name),
    runTransaction(work,retries){if(retries!==2)throw new Error('UNBOUNDED_RETRY');const job=queue.then(async()=>{
      const staged=clone(state),response=await work({collection:name=>collection(staged,name)});Object.assign(state,staged);return response;
    });queue=job.catch(()=>{});return job;}};
  const cloud={database:()=>database};
  const now=()=>options.now?options.now():time++,repository=createCloudAddressRepository(cloud,settings,now);
  const make=(context=contexts[0],overrides={})=>createAddressCloudHandler({settings,getContext:()=>context,repository,now,
    logger:{info:v=>logs.push(v),warn:v=>logs.push(v),error:v=>logs.push(v)},...overrides});
  const call=(action,payload={},index=0)=>make(contexts[index])({action,payload});
  return {state,calls,logs,contexts,settings,call,make,setFailure:v=>{failAt=v;},setTime:v=>{time=v;}};
}
const fields=(detail='仅离线门牌')=>({receiverName:'仅离线联系人',phone:'13800000000',province:'安徽省',city:'合肥市',district:'庐江县',
  regionCodes:{province:null,city:null,district:null},detail});
module.exports={fixture,fields,clone,settings};
