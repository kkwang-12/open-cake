'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createLocalAddressClient,FIELDS}=require('../miniprogram/features/addresses/local-addresses');
const clone=value=>JSON.parse(JSON.stringify(value));
const fields={receiverName:'仅离线测试',phone:'13800000000',province:'安徽省',city:'合肥市',district:'庐江县',detail:'仅离线测试门牌'};
function service(){let saved='',sequence=0;return {...createLocalAddressClient({stage:'development',mode:'shell',appId:'X01-PAGE'},
  {getStorageSync:()=>clone(saved),setStorageSync:(_,value)=>{saved=clone(value);}},()=> 'offline-address-'+(++sequence)),FIELDS};}
function page(addresses,modal=options=>options.success({confirm:false}),selectMode=false){
  let instance;const navigations=[];
  vm.runInNewContext(fs.readFileSync('miniprogram/features/addresses/addresses.js','utf8'),{
    Page:value=>{instance=value;},getCurrentPages:()=>[{route:'features/checkout/checkout'},{route:'features/addresses/addresses'}],
    wx:{showModal:modal,navigateBack:args=>navigations.push(['back',args.delta])},
    require:name=>name==='./local-addresses'?addresses:{pages:{checkout:'/features/checkout/checkout'},navigate:name=>navigations.push(name)}
  });
  instance.data=clone(instance.data);instance.setData=patch=>Object.assign(instance.data,clone(patch));
  instance.onLoad({select:selectMode?'1':'0'});instance.onShow();return {instance,navigations};
}
const event=id=>({currentTarget:{dataset:{id}}});
function fill(instance,patch=fields){for(const [field,value] of Object.entries(patch))instance.input({currentTarget:{dataset:{field}},detail:{value}});}
test('X01 address page keeps invalid input visible, persists real edits/defaults and routes only after choosing',async()=>{
  const addresses=service(),{instance,navigations}=page(addresses,undefined,true);
  instance.add();fill(instance,{...fields,phone:'123'});instance.save();assert.match(instance.data.error,/手机号/);
  assert.equal(instance.data.editing,true);assert.equal(addresses.list().addresses.length,0);
  fill(instance,{phone:fields.phone});instance.save();assert.equal(instance.data.editing,false);
  let address=instance.data.addresses[0];instance.setDefault(event(address.addressId));assert.equal(instance.data.addresses[0].isDefault,true);
  instance.edit(event(address.addressId));fill(instance,{detail:'新门牌'});instance.save();address=instance.data.addresses[0];assert.equal(address.version,1);
  await instance.choose(event(address.addressId));assert.deepEqual(navigations,[['back',1]]);assert.equal(addresses.selection().address.detail,'新门牌');
});
test('X01 address editor retains input on stale revision; read failure is truthful and does not show old rows',()=>{
  const addresses=service();addresses.create(fields,0);const {instance}=page(addresses);
  const address=instance.data.addresses[0];instance.edit(event(address.addressId));fill(instance,{detail:'保留输入'});
  addresses.setDefault(address.addressId,0,1);instance.save();assert.match(instance.data.error,/已变化/);
  assert.equal(instance.data.form.detail,'保留输入');assert.equal(addresses.list().addresses[0].detail,fields.detail);
  instance.cancel();assert.equal(instance.data.addresses[0].isDefault,true);
  const failed=page({list(){throw new Error('private');}}).instance;assert.equal(failed.data.addresses.length,0);assert(!failed.data.error.includes('private'));
});
test('X01 native-delete callback cancels or hides without writing; stale confirmed deletion is rejected',async()=>{
  const addresses=service();addresses.create(fields,0);const cancelled=page(addresses);await cancelled.instance.remove(event('offline-address-1'));
  assert.equal(addresses.list().addresses.length,1);
  let modal;const {instance}=page(addresses,options=>{modal=options;});let pending=instance.remove(event('offline-address-1'));
  instance.onHide();modal.success({confirm:true});await pending;assert.equal(addresses.list().addresses.length,1);
  instance.onShow();pending=instance.remove(event('offline-address-1'));addresses.setDefault('offline-address-1',0,1);
  modal.success({confirm:true});await pending;assert.equal(addresses.list().addresses.length,1);assert.match(instance.data.error,/已变化/);
  const approved=page(addresses,options=>options.success({confirm:true}));await approved.instance.remove(event('offline-address-1'));
  assert.equal(addresses.list().defaultAddressId,null);assert.equal(addresses.list().addresses.length,0);
});
test('X01 failed selection does not navigate or report success; repeated deletion taps share one pending confirmation',async()=>{
  const addresses=service();addresses.create(fields,0);const p=page({...addresses,choose(){throw {code:'LOCAL_ADDRESS_WRITE_FAILED'};}},undefined,true);
  await p.instance.choose(event('offline-address-1'));assert.equal(p.navigations.length,0);assert.match(p.instance.data.error,/未确认/);
  let modal,calls=0;const {instance}=page(addresses,options=>{modal=options;calls++;});
  const pending=instance.remove(event('offline-address-1'));await instance.remove(event('offline-address-1'));assert.equal(calls,1);
  modal.success({confirm:false});await pending;assert.equal(instance.data.busy,false);
});
test('X01 Checkout uses the shared selection, reflects changed address versions and keeps order creation closed',async()=>{
  const addresses=service();addresses.create(fields,0);addresses.choose('offline-address-1',0,1);
  let instance;const navigations=[];
  vm.runInNewContext(fs.readFileSync('miniprogram/features/checkout/checkout.js','utf8'),{
    Page:value=>{instance=value;},require:name=>name==='./selection'?{get:async()=>({lines:[{lineId:'offline-line'}],quantity:1,subtotalLabel:'168',checkoutAllowed:false})}:
      name==='./confirmation-session'?require('../miniprogram/features/checkout/confirmation-session'):name==='./appointment-status'?require('../miniprogram/features/checkout/appointment-status'):name==='./delivery-status'?require('../miniprogram/features/checkout/delivery-status'):name.includes('local-addresses')?addresses:name.includes('store-information')?require('../miniprogram/services/store-information'):
        name==='./fulfillment-draft'?{get:()=>({fulfillment:'DELIVERY',revision:0,pickupContact:{name:'',phone:''},contactValid:false,fulfillmentAllowed:true,configurationChanged:false})}:{navigate:(...args)=>navigations.push(args)}
  });
  instance.data=clone(instance.data);instance.setData=patch=>Object.assign(instance.data,clone(patch));await instance.onShow();
  assert.equal(instance.data.address.detail,fields.detail);instance.chooseAddress();assert.deepEqual(clone(navigations),[['addresses',{select:'1'}]]);
  instance.onHide();addresses.update('offline-address-1',0,{...fields,detail:'变更'},2);await instance.onShow();
  assert.equal(instance.data.address,null);assert.match(instance.data.addressNotice,/重新选择/);assert.equal(instance.data.lines.length,1);
  assert.equal(instance.data.checkoutAllowed,false);assert.equal(instance.submitOrder,undefined);
});
