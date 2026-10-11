async function(){
 const env='cloudbase-d8gwtxzm64150b7e0',run='g1-address-reverify-20261011-1791728754797',ids=['37bd77de24f50836c135d922f5643a5a0a3d208c0fbc23274d861a84d10def73','94cf42fc2836c7aad1592d69132a84d98be1f1fe18d0733e8d2acfae5c51c630'];
 const out={state:'COMPLETED',run,ids,checks:[]};
 const check=(name,value)=>{out.checks.push({name,passed:!!value});if(!value)throw Object.assign(new Error(name),{safeCheck:name});};
 async function call(action,payload){const r=await wx.cloud.callFunction({name:'address',data:{action,payload:payload||{}},config:{env}});return r.result;}
 async function success(action,payload){const r=await call(action,payload);if(!r||!r.ok)throw Object.assign(new Error('BUSINESS_FAILED'),{safeCheck:action,errorCode:r&&r.error&&r.error.code||'INVALID_RESPONSE'});return r.data;}
 const address=label=>({receiverName:'受控复验样例'+label,phone:'13800000000',province:'安徽省',city:'合肥市',district:'庐江县',detail:'仅开发复验，不配送 '+run+' '+label,regionCodes:{province:null,city:null,district:null}});
 try{
 const before=await success('list');check('controlled empty baseline seven',before.items.length===0&&before.userVersion===7&&before.defaultAddressId===null&&before.subjectHash==='133a76b53fc4f5c8');
 const a=await success('create',{address:address('A'),idempotencyKey:run+'-createA'});check('first sample identity/version',a.addressId===ids[0]&&a.version===0&&a.userVersion===8);
 const b=await success('create',{address:address('B'),idempotencyKey:run+'-createB'});check('second sample identity/version',b.addressId===ids[1]&&b.version===0&&b.userVersion===9);
 const updated=await success('update',{addressId:ids[0],expectedVersion:0,address:address('A 已修改'),idempotencyKey:run+'-updateA'});check('one address edit and parent guard',updated.version===1&&updated.userVersion===10);out.userVersion=updated.userVersion;
 }catch(e){out.state='FAILED';out.failedCheck=e.safeCheck||'TRANSPORT_FAILED';out.errorCode=e.errorCode||e.errCode||null;}return out;
}
