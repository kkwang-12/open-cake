async function(){
 const env='cloudbase-d8gwtxzm64150b7e0',run='g1-address-reverify-20261011-1791728754797',ids=['37bd77de24f50836c135d922f5643a5a0a3d208c0fbc23274d861a84d10def73','94cf42fc2836c7aad1592d69132a84d98be1f1fe18d0733e8d2acfae5c51c630'];
 const out={state:'COMPLETED',run,ids,checks:[]};
 const check=(name,value)=>{out.checks.push({name,passed:!!value});if(!value)throw Object.assign(new Error(name),{safeCheck:name});};
 async function call(action,payload){const r=await wx.cloud.callFunction({name:'address',data:{action,payload:payload||{}},config:{env}});return r.result;}
 async function success(action,payload){const r=await call(action,payload);if(!r||!r.ok)throw Object.assign(new Error('BUSINESS_FAILED'),{safeCheck:action,errorCode:r&&r.error&&r.error.code||'INVALID_RESPONSE'});return r.data;}
 const address=label=>({receiverName:'受控复验样例'+label,phone:'13800000000',province:'安徽省',city:'合肥市',district:'庐江县',detail:'仅开发复验，不配送 '+run+' '+label,regionCodes:{province:null,city:null,district:null}});
 try{
 const before=await success('list');check('cleanup only approved owner and sample ids',before.subjectHash==='133a76b53fc4f5c8'&&before.userVersion>=7&&before.userVersion<=15&&before.items.length<=2&&before.items.every(row=>ids.includes(row.addressId))&&(before.defaultAddressId===null||ids.includes(before.defaultAddressId)));
 check('cleanup keeps total new receipts within eight',before.userVersion+before.items.length<=15);
 const rows=before.items.slice().sort((a,b)=>Number(a.addressId===before.defaultAddressId)-Number(b.addressId===before.defaultAddressId));
 let revision=before.userVersion;out.removals=[];
 for(const row of rows){const result=await success('remove',{addressId:row.addressId,expectedVersion:row.version,expectedUserVersion:revision,idempotencyKey:run+'-remove'+row.addressId});out.removals.push({addressId:row.addressId,userVersion:result.userVersion});check('one parent increment per removal',result.deleted===true&&result.userVersion===revision+1);revision=result.userVersion;}
 const after=await success('list');check('no active samples and default null',after.items.length===0&&after.defaultAddressId===null&&after.userVersion===revision);out.userVersion=after.userVersion;out.defaultAddressId=after.defaultAddressId;out.count=after.items.length;
 }catch(e){out.state='FAILED';out.failedCheck=e.safeCheck||'TRANSPORT_FAILED';out.errorCode=e.errorCode||e.errCode||null;}return out;
}
