async function(){
 const env='cloudbase-d8gwtxzm64150b7e0',run='g1-address-reverify-20261011-1791728754797',ids=['37bd77de24f50836c135d922f5643a5a0a3d208c0fbc23274d861a84d10def73','94cf42fc2836c7aad1592d69132a84d98be1f1fe18d0733e8d2acfae5c51c630'];
 const out={state:'COMPLETED',run,ids,checks:[]};
 const check=(name,value)=>{out.checks.push({name,passed:!!value});if(!value)throw Object.assign(new Error(name),{safeCheck:name});};
 async function call(action,payload){const r=await wx.cloud.callFunction({name:'address',data:{action,payload:payload||{}},config:{env}});return r.result;}
 async function success(action,payload){const r=await call(action,payload);if(!r||!r.ok)throw Object.assign(new Error('BUSINESS_FAILED'),{safeCheck:action,errorCode:r&&r.error&&r.error.code||'INVALID_RESPONSE'});return r.data;}
 const address=label=>({receiverName:'受控复验样例'+label,phone:'13800000000',province:'安徽省',city:'合肥市',district:'庐江县',detail:'仅开发复验，不配送 '+run+' '+label,regionCodes:{province:null,city:null,district:null}});
 try{
 const before=await success('list');check('race baseline ten',before.userVersion===10&&before.items.length===2&&before.items.some(x=>x.addressId===ids[0])&&before.items.some(x=>x.addressId===ids[1]));
 const keys=[run+'-defaultA',run+'-defaultB'];
 const responses=await Promise.all(ids.map((addressId,i)=>call('setDefault',{addressId,expectedVersion:i===0?1:0,expectedUserVersion:10,idempotencyKey:keys[i]})));
 out.responses=responses.map((r,i)=>({key:keys[i],ok:r.ok,error:r.error&&r.error.code,requestId:r.requestId,userVersion:r.data&&r.data.userVersion,defaultAddressId:r.data&&r.data.defaultAddressId}));
 const after=await success('list');out.userVersion=after.userVersion;out.defaultAddressId=after.defaultAddressId;
 check('only one parent version increment',after.userVersion===11);
 check('one winner one explicit version conflict',responses.filter(r=>r.ok).length===1&&responses.filter(r=>!r.ok&&r.error.code==='VERSION_CONFLICT').length===1);
 }catch(e){out.state='FAILED';out.failedCheck=e.safeCheck||'TRANSPORT_FAILED';out.errorCode=e.errorCode||e.errCode||null;}return out;
}
