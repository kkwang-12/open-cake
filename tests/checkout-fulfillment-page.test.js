'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const storeInfo=require('../miniprogram/services/store-information');
const {createFulfillmentDraftClient}=require('../miniprogram/features/checkout/fulfillment-draft');
const clone=value=>JSON.parse(JSON.stringify(value));
function setup(){
  const entries={},reference=storeInfo.confirmed(),settings={stage:'development',mode:'shell',appId:'X02-PAGE'};
  const preferences=createFulfillmentDraftClient(settings,{getStorageSync:key=>clone(entries[key]||''),setStorageSync:(key,value)=>{entries[key]=clone(value);}},()=>reference);
  let addressReads=0;const addresses={selection:()=>{addressReads++;return {address:{receiverName:'离线测试收件人',detail:'离线地址'},notice:''};}};
  return {preferences,reference,entries,addresses,get addressReads(){return addressReads;}};
}
function page(s,overrides={}){
  let instance;const navigations=[];
  const modules={'./selection':{get:async()=>({lines:[{lineId:'offline-line'}],quantity:1,subtotalLabel:'168',checkoutAllowed:false})},
    '../../services/store-information':storeInfo.createStoreInformationClient({stage:'development',mode:'shell'},()=>s.reference),
    './fulfillment-draft':s.preferences,'../addresses/local-addresses':s.addresses,'./delivery-status':require('../miniprogram/features/checkout/delivery-status'),
    '../../constants/routes':{navigate:(...args)=>navigations.push(args)},...overrides};
  vm.runInNewContext(fs.readFileSync('miniprogram/features/checkout/checkout.js','utf8'),{Page:value=>{instance=value;},require:name=>modules[name]});
  instance.data=clone(instance.data);instance.setData=patch=>Object.assign(instance.data,clone(patch));return {instance,navigations};
}
const mode=value=>({currentTarget:{dataset:{mode:value}}});
function input(instance,field,value){instance.contactInput({currentTarget:{dataset:{field}},detail:{value}});}
test('X02 pickup never reads an address; switch to delivery shares address module and switch back hides inapplicable details',async()=>{
  const s=setup(),{instance,navigations}=page(s);await instance.onShow();assert.equal(s.addressReads,0);assert.equal(instance.data.address,null);
  instance.chooseAddress();assert.equal(navigations.length,0);
  instance.switchFulfillment(mode('DELIVERY'));assert.equal(instance.data.address.detail,'离线地址');assert.equal(s.addressReads,1);
  instance.chooseAddress();assert.deepEqual(clone(navigations),[['addresses',{select:'1'}]]);
  instance.switchFulfillment(mode('PICKUP'));assert.equal(instance.data.address,null);assert.equal(s.addressReads,1);assert.equal(instance.data.checkoutAllowed,false);
});
test('X02 invalid contact remains editable; successful save is backed by real storage and survives returning',async()=>{
  const s=setup(),{instance}=page(s);await instance.onShow();input(instance,'name','测试取货人');input(instance,'phone','123');instance.saveContact();
  assert.match(instance.data.preferenceError,/手机号/);assert.equal(instance.data.contactSaved,false);assert.equal(Object.keys(s.entries).length,0);
  input(instance,'phone','13800000000');instance.saveContact();assert.equal(instance.data.contactSaved,true);assert.equal(s.preferences.get().pickupContact.name,'测试取货人');
  instance.onHide();await instance.onShow();assert.equal(instance.data.pickupContact.phone,'13800000000');
  input(instance,'phone','456');instance.onHide();await instance.onShow();assert.equal(instance.data.pickupContact.phone,'456');assert.equal(instance.data.contactSaved,false);
  const fresh=page(s).instance;await fresh.onShow();assert.equal(fresh.data.pickupContact.phone,'13800000000');assert.equal(fresh.submitOrder,undefined);
});
test('X02 stale mode writes and read failures show fixed errors without fake saved contact or stale store data',async()=>{
  const s=setup(),{instance}=page(s);await instance.onShow();s.preferences.setMode('DELIVERY',0,s.reference.referenceVersion);
  instance.switchFulfillment(mode('DELIVERY'));assert.match(instance.data.preferenceError,/已变化/);assert.equal(instance.data.fulfillment,'PICKUP');
  await instance.load();assert.equal(instance.data.fulfillment,'DELIVERY');
  const failing=page(s,{'../../services/store-information':{get:async()=>{throw {code:'INVALID_STORE_REFERENCE',message:'private'};}}}).instance;
  await failing.onShow();assert.equal(failing.data.store,null);assert.equal(failing.data.lines.length,0);assert(!failing.data.error.includes('private'));
});
test('X02 hidden late store reads and hidden save events cannot expose or persist old inputs',async()=>{
  const s=setup();let resolve;const {instance}=page(s,{'../../services/store-information':{get:()=>new Promise(done=>{resolve=done;})}});
  const pending=instance.onShow();instance.onHide();resolve(storeInfo.validate(s.reference));await pending;assert.equal(instance.data.store,null);
  instance.data.pickupContact={name:'hidden',phone:'13800000000'};instance.saveContact();assert.equal(Object.keys(s.entries).length,0);
});

test('X03 delivery remains pending for selected addresses; changed/deleted/read-failed addresses clear old range state',async()=>{
  const s=setup();s.preferences.setMode('DELIVERY',0,s.reference.referenceVersion);
  let selected={address:{addressId:'offline',version:0,detail:'庐江县',location:{longitude:117.2886,latitude:31.1498},inRange:true},status:'LOCAL_READY',notice:''};
  const {instance}=page(s,{'../addresses/local-addresses':{selection:()=>selected}});await instance.onShow();
  assert.equal(instance.data.deliveryStatus.status,'PENDING_CLOUD_VERIFICATION');assert.equal(instance.data.checkoutAllowed,false);
  instance.onHide();selected={address:null,status:'CHANGED',notice:'重新选择'};await instance.onShow();
  assert.equal(instance.data.address,null);assert.equal(instance.data.deliveryStatus.status,'ADDRESS_CHANGED');
  instance.onHide();selected={address:null,status:'EMPTY',notice:''};await instance.onShow();assert.equal(instance.data.deliveryStatus.status,'ADDRESS_REQUIRED');
  const failed=page(s,{'../addresses/local-addresses':{selection(){throw new Error('private address');}}}).instance;await failed.onShow();
  assert.equal(failed.data.deliveryStatus.status,'READ_FAILED');assert.equal(failed.data.address,null);assert(!failed.data.addressNotice.includes('private'));
  instance.switchFulfillment(mode('PICKUP'));assert.equal(instance.data.deliveryStatus,null);
});
test('X03 changed store reference prevents reading or showing a former delivery range state',async()=>{
  const s=setup();s.preferences.setMode('DELIVERY',0,s.reference.referenceVersion);const {instance}=page(s);await instance.onShow();
  assert.equal(s.addressReads,1);assert.equal(instance.data.deliveryStatus.status,'PENDING_CLOUD_VERIFICATION');
  s.reference.referenceVersion='updated-reference';instance.onHide();await instance.onShow();
  assert.equal(instance.data.configurationChanged,true);assert.equal(instance.data.address,null);assert.equal(instance.data.deliveryStatus,null);assert.equal(s.addressReads,1);
  instance.switchFulfillment(mode('DELIVERY'));assert.equal(s.addressReads,2);assert.equal(instance.data.configurationChanged,false);
});
