'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createLocalAddressClient,FIELDS}=require('../miniprogram/features/addresses/local-addresses');
const clone=value=>JSON.parse(JSON.stringify(value));
const fields={receiverName:'仅离线测试',phone:'13800000000',province:'安徽省',city:'合肥市',district:'庐江县',detail:'仅离线测试门牌'};
function service(){let saved='',sequence=0;return {...createLocalAddressClient({stage:'development',mode:'shell',appId:'X01-PAGE'},
  {getStorageSync:()=>clone(saved),setStorageSync:(_,value)=>{saved=clone(value);}},()=> 'offline-address-'+(++sequence)),FIELDS};}
async function page(addresses,modal=options=>options.success({confirm:false}),selectMode=false){
  let instance;const navigations=[];
  vm.runInNewContext(fs.readFileSync('miniprogram/features/addresses/addresses.js','utf8'),{
    Page:value=>{instance=value;},getCurrentPages:()=>[{route:'features/checkout/checkout'},{route:'features/addresses/addresses'}],
    wx:{showModal:modal,navigateBack:args=>navigations.push(['back',args.delta])},
    require:name=>name==='./address-client'?addresses:{pages:{checkout:'/features/checkout/checkout'},navigate:name=>navigations.push(name)}
  });
  instance.data=clone(instance.data);instance.setData=patch=>Object.assign(instance.data,clone(patch));
  instance.onLoad({select:selectMode?'1':'0'});await instance.onShow();return {instance,navigations};
}
const event=id=>({currentTarget:{dataset:{id}}});
function fill(instance,patch=fields){for(const [field,value] of Object.entries(patch))instance.input({currentTarget:{dataset:{field}},detail:{value}});}
test('X01 address page keeps invalid input visible, persists real edits/defaults and routes only after choosing',async()=>{
  const addresses=service(),{instance,navigations}=await page(addresses,undefined,true);
  instance.add();fill(instance,{...fields,phone:'123'});await instance.save();assert.match(instance.data.error,/手机号/);
  assert.equal(instance.data.editing,true);assert.equal(addresses.list().addresses.length,0);
  fill(instance,{phone:fields.phone});await instance.save();assert.equal(instance.data.editing,false);
  let address=instance.data.addresses[0];await instance.setDefault(event(address.addressId));assert.equal(instance.data.addresses[0].isDefault,true);
  instance.edit(event(address.addressId));fill(instance,{detail:'新门牌'});await instance.save();address=instance.data.addresses[0];assert.equal(address.version,1);
  await instance.choose(event(address.addressId));assert.deepEqual(navigations,[['back',1]]);assert.equal(addresses.selection().address.detail,'新门牌');
});
test('X01 address editor retains input on stale revision; read failure is truthful and does not show old rows',async()=>{
  const addresses=service();addresses.create(fields,0);const {instance}=await page(addresses);
  const address=instance.data.addresses[0];instance.edit(event(address.addressId));fill(instance,{detail:'保留输入'});
  addresses.setDefault(address.addressId,0,1);await instance.save();assert.match(instance.data.error,/已变化/);
  assert.equal(instance.data.form.detail,'保留输入');assert.equal(addresses.list().addresses[0].detail,fields.detail);
  await instance.cancel();assert.equal(instance.data.addresses[0].isDefault,true);
  const failed=(await page({list(){throw new Error('private');}})).instance;assert.equal(failed.data.addresses.length,0);assert(!failed.data.error.includes('private'));
});
test('X01 native-delete callback cancels or hides without writing; stale confirmed deletion is rejected',async()=>{
  const addresses=service();addresses.create(fields,0);const cancelled=await page(addresses);await cancelled.instance.remove(event('offline-address-1'));
  assert.equal(addresses.list().addresses.length,1);
  let modal;const {instance}=await page(addresses,options=>{modal=options;});let pending=instance.remove(event('offline-address-1'));
  instance.onHide();modal.success({confirm:true});await pending;assert.equal(addresses.list().addresses.length,1);
  await instance.onShow();pending=instance.remove(event('offline-address-1'));addresses.setDefault('offline-address-1',0,1);
  modal.success({confirm:true});await pending;assert.equal(addresses.list().addresses.length,1);assert.match(instance.data.error,/已变化/);
  const approved=await page(addresses,options=>options.success({confirm:true}));await approved.instance.remove(event('offline-address-1'));
  assert.equal(addresses.list().defaultAddressId,null);assert.equal(addresses.list().addresses.length,0);
});
test('X01 failed selection does not navigate or report success; repeated deletion taps share one pending confirmation',async()=>{
  const addresses=service();addresses.create(fields,0);const p=await page({...addresses,choose(){throw {code:'LOCAL_ADDRESS_WRITE_FAILED'};}},undefined,true);
  await p.instance.choose(event('offline-address-1'));assert.equal(p.navigations.length,0);assert.match(p.instance.data.error,/未确认/);
  let modal,calls=0;const {instance}=await page(addresses,options=>{modal=options;calls++;});
  const pending=instance.remove(event('offline-address-1'));await instance.remove(event('offline-address-1'));assert.equal(calls,1);
  modal.success({confirm:false});await pending;assert.equal(instance.data.busy,false);
});
test('X01 Checkout uses the shared selection, reflects changed address versions and keeps order creation closed',async()=>{
  const addresses=service();addresses.create(fields,0);addresses.choose('offline-address-1',0,1);
  let instance;const navigations=[];
  vm.runInNewContext(fs.readFileSync('miniprogram/features/checkout/checkout.js','utf8'),{
    Page:value=>{instance=value;},require:name=>name==='./selection'?{get:async()=>({lines:[{lineId:'offline-line'}],quantity:1,subtotalLabel:'168',checkoutAllowed:false})}:
      name==='./confirmation-session'?require('../miniprogram/features/checkout/confirmation-session'):name==='./appointment-status'?require('../miniprogram/features/checkout/appointment-status'):name==='./delivery-status'?require('../miniprogram/features/checkout/delivery-status'):name.includes('local-addresses')?addresses:name.includes('store-information')?require('../miniprogram/services/store-information').createStoreInformationClient({stage:'development',mode:'shell'}):
        name==='./fulfillment-draft'?{get:()=>({fulfillment:'DELIVERY',revision:0,pickupContact:{name:'',phone:''},contactValid:false,fulfillmentAllowed:true,configurationChanged:false})}:{navigate:(...args)=>navigations.push(args)}
  });
  instance.data=clone(instance.data);instance.setData=patch=>Object.assign(instance.data,clone(patch));await instance.onShow();
  assert.equal(instance.data.address.detail,fields.detail);instance.chooseAddress();assert.deepEqual(clone(navigations),[['addresses',{select:'1'}]]);
  instance.onHide();addresses.update('offline-address-1',0,{...fields,detail:'变更'},2);await instance.onShow();
  assert.equal(instance.data.address,null);assert.match(instance.data.addressNotice,/重新选择/);assert.equal(instance.data.lines.length,1);
  assert.equal(instance.data.checkoutAllowed,false);assert.equal(instance.submitOrder,undefined);
});

test('X01 delayed cloud list/save responses cannot overwrite a hidden page and repeated saves share one in-flight operation',async()=>{
 let resolveSave,calls=0;
 const cloud={FIELDS,selectionAllowed:false,list:async()=>({addresses:[],revision:0,scope:'CLOUD_OWNER'}),
  create:()=>{calls++;return new Promise(resolve=>{resolveSave=resolve;});}};
 const {instance}=await page(cloud);instance.add();fill(instance);const pending=instance.save();await instance.save();assert.equal(calls,1);
 instance.onHide();resolveSave({addresses:[{addressId:'cloud-address'}],revision:1,scope:'CLOUD_OWNER'});await pending;
 assert.equal(instance.data.editing,true);assert.equal(instance.data.addresses.length,0);assert.equal(instance.data.form.detail,fields.detail);
 let resolveList;const loading=instance.onShow();await loading;
 cloud.list=()=>new Promise(resolve=>{resolveList=resolve;});const refresh=instance.load();instance.onHide();
 resolveList({addresses:[{addressId:'stale-row'}],revision:2,scope:'CLOUD_OWNER'});await refresh;assert.equal(instance.data.addresses.length,0);
});

function locationService(){
 const writes=[],resolves=[],book={addresses:[],revision:0,scope:'CLOUD_OWNER',subjectHash:'a'.repeat(16)};
 const api={FIELDS,selectionAllowed:false,locationVerificationAvailable:true,list:async()=>clone(book),
  async resolveLocation(form,id,version){resolves.push({form:clone(form),id,version});return {mapSelectionToken:'candidate.'+'b'.repeat(43),expiresAt:Date.now()+900000,
   location:{longitude:117.288694,latitude:31.149852,coordinateSystem:'GCJ02'},subjectHash:book.subjectHash};},
  async create(form,revision,token,subjectHash){writes.push({form:clone(form),revision,token,subjectHash});return clone(book);}};
 return {api,writes,resolves,book};
}
test('location verification is opt-in and a preview never becomes a saved location before explicit confirmation',async()=>{
 const s=locationService(),{instance}=await page(s.api);instance.add();fill(instance);await instance.resolveLocation();
 assert.equal(s.resolves.length,1);assert.equal(instance.data.locationConfirmed,false);assert.equal(instance.data.locationCandidate.coordinateSystem,'GCJ02');
 assert(!JSON.stringify(instance.data).includes('candidate.'));await instance.save();assert.equal(s.writes.length,0);assert.match(instance.data.locationNotice,/确认/);
 instance.confirmLocation();await instance.save();assert.equal(s.writes[0].token,'candidate.'+'b'.repeat(43));assert.equal(s.writes[0].subjectHash,'a'.repeat(16));
 assert.equal(instance.data.selectionAllowed,false);assert.equal(instance.data.editing,false);
 const off=locationService();off.api.locationVerificationAvailable=false;const p=await page(off.api);p.instance.add();fill(p.instance);await p.instance.resolveLocation();
 assert.equal(off.resolves.length,0);await p.instance.save();assert.equal(off.writes[0].token,undefined);
});
test('editing any verified field clears the candidate; expired and unviewable maps never silently attach their tokens',async()=>{
 const s=locationService(),{instance}=await page(s.api);instance.add();fill(instance);await instance.resolveLocation();instance.confirmLocation();
 fill(instance,{phone:'13900000000'});assert.equal(instance.data.locationCandidate,null);assert.equal(instance.data.locationConfirmed,false);
 await instance.resolveLocation();instance._locationSelection.expiresAt=Date.now()-1;instance.confirmLocation();assert.equal(instance.data.locationCandidate,null);
 await instance.resolveLocation();instance.locationMapError({currentTarget:{dataset:{request:instance.data.locationRequest-1}}});assert(instance.data.locationCandidate);
 instance.locationMapError({currentTarget:{dataset:{request:instance.data.locationRequest}}});assert.equal(instance.data.locationCandidate,null);assert.match(instance.data.locationNotice,/地图/);
 await instance.save();assert.equal(s.writes[0].token,undefined);assert.equal(s.writes[0].form.phone,'13900000000');
});
test('late resolver results cannot replace modified, cancelled or hidden address forms; repeated taps issue one request',async()=>{
 for(const invalidate of [p=>fill(p,{detail:'changed'}),p=>p.cancel(),p=>p.onHide()]){
  const s=locationService();let finish,calls=0;const selection=await s.api.resolveLocation(fields,null,null);
  s.api.resolveLocation=()=>{calls++;return new Promise(resolve=>{finish=resolve;});};
  const {instance}=await page(s.api);instance.add();fill(instance);const pending=instance.resolveLocation();await instance.resolveLocation();assert.equal(calls,1);
  await invalidate(instance);finish(selection);await pending;assert.equal(instance.data.locationCandidate,null);assert.equal(instance._locationSelection,null);
 }
});
test('unknown save results freeze the original form/token, including expired-token retries, without another map request',async()=>{
 const s=locationService(),original=s.api.create;let attempt=0;const captured=[];
 s.api.create=async(...args)=>{captured.push(args);if(attempt++===0)throw {code:'CLOUD_CALL_FAILED'};return original(...args);};
 const {instance}=await page(s.api);instance.add();fill(instance);await instance.resolveLocation();instance.confirmLocation();await instance.save();
 assert.equal(instance.data.saveUncertain,true);fill(instance,{detail:'must not replace original'});assert.equal(instance.data.form.detail,fields.detail);
 await instance.resolveLocation();assert.equal(s.resolves.length,1);instance._locationSelection.expiresAt=Date.now()-1;await instance.save();
 assert.deepEqual(captured[0],captured[1]);assert.equal(instance.data.saveUncertain,false);assert.equal(instance.data.editing,false);
});
test('a successful save completed across hide/show cannot be submitted again from the old editor',async()=>{
 const s=locationService();let finish,calls=0;s.api.create=()=>{calls++;return new Promise(resolve=>{finish=resolve;});};
 const {instance}=await page(s.api);instance.add();fill(instance);const saving=instance.save();instance.onHide();await instance.onShow();finish(clone(s.book));await saving;
 await instance.save();assert.equal(calls,1);assert.equal(instance.data.editing,false);assert.equal(instance.data.saveUncertain,false);
});
test('changing the native account clears the previous editor and its private location selection',async()=>{
 const s=locationService(),{instance}=await page(s.api);instance.add();fill(instance);await instance.resolveLocation();instance.confirmLocation();
 s.book.subjectHash='c'.repeat(16);await instance.load();assert.equal(instance.data.editing,false);assert.equal(instance.data.form.receiverName,'');
 assert.equal(instance._locationSelection,null);await instance.save();assert.equal(s.writes.length,0);
});
test('a failed resolution preserves the entered address and permits an explicit text-only save',async()=>{
 const s=locationService();s.api.resolveLocation=async()=>{throw {code:'LOCATION_REQUIRED'};};
 const {instance}=await page(s.api);instance.add();fill(instance);await instance.resolveLocation();
 assert.equal(instance.data.form.detail,fields.detail);assert.equal(instance.data.locationCandidate,null);assert.match(instance.data.locationNotice,/文字地址/);
 await instance.save();assert.equal(s.writes.length,1);assert.equal(s.writes[0].token,undefined);
});
