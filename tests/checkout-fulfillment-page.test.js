'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const storeInfo=require('../miniprogram/services/store-information');
const {createFulfillmentDraftClient}=require('../miniprogram/features/checkout/fulfillment-draft');
const clone=value=>JSON.parse(JSON.stringify(value));
function setup(){
  const entries={},reference=storeInfo.confirmed(),settings={stage:'development',mode:'shell',appId:'X02-PAGE'};
  const preferences=createFulfillmentDraftClient(settings,{getStorageSync:key=>clone(entries[key]||''),setStorageSync:(key,value)=>{entries[key]=clone(value);}},()=>reference);
  let addressReads=0;const addresses={selection:()=>{addressReads++;return {address:{receiverName:'离线测试收件人',detail:'离线地址'},notice:''};}};
  return {preferences,reference,entries,addresses,editReturnState:require('../miniprogram/features/checkout/edit-return-state').createEditReturnState(),get addressReads(){return addressReads;}};
}
function page(s,overrides={},platform={}){
  let instance;const navigations=[];
  const modules={'./selection':{get:async()=>({lines:[{lineId:'offline-line'}],quantity:1,subtotalLabel:'168',checkoutAllowed:false})},
    '../../services/store-information':storeInfo.createStoreInformationClient({stage:'development',mode:'shell'},()=>s.reference),
    './fulfillment-draft':s.preferences,'./edit-return-state':s.editReturnState,'../addresses/local-addresses':s.addresses,'./delivery-status':require('../miniprogram/features/checkout/delivery-status'),
    './appointment-status':require('../miniprogram/features/checkout/appointment-status'),
    './confirmation-session':require('../miniprogram/features/checkout/confirmation-session'),
    '../../utils/safe-area':require('../miniprogram/utils/safe-area'),
    '../../constants/routes':{pages:{bag:'/features/bag/bag'},navigate:(...args)=>navigations.push(args)},...overrides};
  vm.runInNewContext(fs.readFileSync('miniprogram/features/checkout/checkout.js','utf8'),{Page:value=>{instance=value;},require:name=>modules[name],wx:platform,getCurrentPages:()=>platform.currentPages||[]});
  instance.data=clone(instance.data);instance.setData=patch=>Object.assign(instance.data,clone(patch));return {instance,navigations};
}
const mode=value=>({currentTarget:{dataset:{mode:value}}});
test('Editing goods pops to the existing bag; a new checkout restores unsaved input and reads fresh amounts',async()=>{
  const s=setup();let backCalls=0;
  const platform={currentPages:[{route:'features/bag/bag'},{}],navigateBack:()=>backCalls++};
  const first=page(s,{},platform).instance;first.onLoad();await first.onShow();
  input(first,'name','待保存联系人');input(first,'phone','138');first.switchFulfillment(mode('DELIVERY'));
  first.goBag();assert.equal(backCalls,1);first.onUnload();
  const second=page(s,{'./selection':{get:async()=>({lines:[{lineId:'updated-line'}],quantity:2,subtotalLabel:'72',checkoutAllowed:false})}}).instance;
  second.onLoad();const loading=second.onShow();assert.equal(second.data.subtotalLabel,'0');assert.equal(second.data.lines.length,0);await loading;
  assert.equal(second.data.subtotalLabel,'72');assert.equal(second.data.lines[0].lineId,'updated-line');
  assert.equal(second.data.fulfillment,'DELIVERY');assert.equal(second.data.pickupContact.name,'待保存联系人');
  assert.equal(second.data.pickupContact.phone,'138');assert.equal(second.data.contactSaved,false);
  assert.equal(s.preferences.get().pickupContact.name,'');assert.equal(second.data.checkoutAllowed,false);
  assert.equal(s.editReturnState.take(),null);
});
test('Return input does not restore against a changed store reference',async()=>{
  const s=setup();s.editReturnState.remember(s.reference,{name:'旧联系人',phone:'138'});
  s.reference.referenceVersion='updated-reference';
  const {instance}=page(s);instance.onLoad();await instance.onShow();
  assert.equal(instance.data.pickupContact.name,'');assert.equal(instance.data.contactSaved,false);
});
test('Checkout reuses detail safe-area geometry and returns without resetting the previous page',()=>{
  for(const width of [320,375,430]){
    let backCalls=0;
    const platform={currentPages:[{},{}],navigateBack(){backCalls++;},
      getWindowInfo:()=>({windowWidth:width,statusBarHeight:47}),
      getMenuButtonBoundingClientRect:()=>({top:51,height:32,left:width-96})};
    const {instance,navigations}=page(setup(),{},platform);instance.onLoad();
    assert.equal(instance.data.topInset,47);assert.equal(instance.data.navHeight,44);assert.equal(instance.data.capsuleWidth,108);
    instance.back();assert.equal(backCalls,1);assert.equal(navigations.length,0);
    platform.currentPages=[];instance.back();assert.deepEqual(clone(navigations),[['home']]);
  }
});
test('Repeated rapid fulfillment changes leave the visible form and persisted mode consistent',async()=>{
  const s=setup(),{instance}=page(s);await instance.onShow();
  input(instance,'name','测试联系人');
  for(const selected of ['DELIVERY','PICKUP','DELIVERY','PICKUP','DELIVERY'])instance.switchFulfillment(mode(selected));
  assert.equal(instance.data.fulfillment,'DELIVERY');assert.equal(s.preferences.get().fulfillment,'DELIVERY');
  assert.equal(instance.data.preferenceBusy,false);assert.ok(instance.data.address);
  instance.switchFulfillment(mode('PICKUP'));assert.equal(instance.data.pickupContact.name,'测试联系人');
  assert.equal(instance.data.address,null);assert.equal(instance.data.checkoutAllowed,false);
});
test('Store photo uses only a real-photo reference; failures leave checkout and map intact',async()=>{
  const s=setup(),{instance}=page(s,{}, {openLocation(){}});
  await instance.onShow();assert.equal(instance.data.storePhoto,'');
  assert.equal(instance.orderNoteInput,undefined);assert.equal(instance.data.checkoutAllowed,false);
  s.reference.photo={source:'DESIGN_PREVIEW',url:'/generated-store.jpg'};
  await instance.load();assert.equal(instance.data.storePhoto,'');
  s.reference.photo={source:'REAL_PHOTO',url:'/real-store.jpg'};
  await instance.load();assert.equal(instance.data.storePhoto,'/real-store.jpg');
  instance.storePhotoError({currentTarget:{dataset:{src:'/old-store.jpg'}}});assert.equal(instance.data.storePhotoFailed,false);
  instance.storePhotoError({currentTarget:{dataset:{src:'/real-store.jpg'}}});assert.equal(instance.data.storePhotoFailed,true);
  assert.equal(instance.data.storeMapAvailable,true);assert.equal(instance.data.subtotalLabel,'168');
  assert.equal(instance.data.checkoutAllowed,false);
  instance.onHide();instance.data.storePhotoFailed=false;instance.storePhotoError({currentTarget:{dataset:{src:'/real-store.jpg'}}});assert.equal(instance.data.storePhotoFailed,false);
});
test('Checkout footer measures wrapped content including safe area and ignores stale or hidden measurements',async()=>{
  const s=setup(),{instance}=page(s,{}, {nextTick:fn=>fn()});await instance.onShow();
  let callback;
  instance.createSelectorQuery=()=>({select:selector=>{assert.equal(selector,'.checkout-footer');return {
    boundingClientRect:fn=>{callback=fn;return {exec(){}};}
  };}});
  instance.measureFooter();callback({height:173.5});assert.equal(instance.data.footerHeight,174);
  instance.measureFooter();instance.inputFocus();callback({height:30});assert.equal(instance.data.footerHeight,174);
  instance.inputBlur();callback({height:201.2});assert.equal(instance.data.footerHeight,202);
  instance.measureFooter();instance.onHide();callback({height:1});assert.equal(instance.data.footerHeight,202);
});
test('Keyboard editing preserves contact and restores footer even when keyboard closes without blur',async()=>{
  const s=setup(),{instance}=page(s,{}, {nextTick:fn=>fn()});await instance.onShow();
  instance.inputFocus();assert.equal(instance.data.inputFocused,true);
  instance.inputKeyboardChange({detail:{height:300}});assert.equal(instance.data.keyboardHeight,300);
  input(instance,'name','姓名');input(instance,'phone','13800000000');

  instance.inputBlur();assert.equal(instance.data.keyboardHeight,300);
  instance.inputFocus();instance.inputKeyboardChange({detail:{height:0}});
  assert.equal(instance.data.inputFocused,false);assert.equal(instance.data.keyboardHeight,0);
  assert.equal(instance.data.pickupContact.name,'姓名');assert.equal(instance.data.pickupContact.phone,'13800000000');
assert.equal(instance.data.checkoutAllowed,false);
  instance.onHide();instance.inputFocus();instance.inputKeyboardChange({detail:{height:320}});
  assert.equal(instance.data.inputFocused,false);assert.equal(instance.data.keyboardHeight,0);
});
test('Switching modes with a long address keeps current amounts and unavailable appointment restrictions',async()=>{
  const s=setup(),longAddress={receiverName:'测试收件人',phone:'13800000000',province:'安徽省',city:'合肥市',district:'庐江县',detail:'很长的街道及门牌信息'.repeat(20)};
  const {instance}=page(s,{'../addresses/local-addresses':{selection:()=>({address:longAddress,notice:''})}});
  await instance.onShow();instance.switchFulfillment(mode('DELIVERY'));
  assert.equal(instance.data.address.detail,longAddress.detail);assert.equal(instance.data.subtotalLabel,'168');
  assert.equal(instance.data.appointmentStatus.slots.length,0);assert.equal(instance.data.checkoutAllowed,false);
  instance.switchFulfillment(mode('PICKUP'));assert.equal(instance.data.address,null);
  assert.equal(instance.data.subtotalLabel,'168');assert.equal(instance.submitOrder,undefined);
});
test('Pickup map opens the confirmed GCJ-02 store point, reports failures and leaves checkout restricted',async()=>{
  const s=setup(),calls=[];
  const {instance}=page(s,{}, {openLocation:options=>calls.push(options)});
  await instance.onShow();assert.equal(instance.data.storeMapAvailable,true);
  instance.viewStoreLocation();assert.equal(calls.length,1);
  assert.equal(calls[0].latitude,31.1498);assert.equal(calls[0].longitude,117.2886);
  assert.equal(calls[0].address,s.reference.address);assert.equal(calls[0].name,s.reference.name);
  calls[0].fail({errMsg:'private raw error'});assert.equal(instance.data.storeMapError,'位置暂时无法打开，请稍后重试。');
  assert.equal(instance.data.checkoutAllowed,false);
  instance.switchFulfillment(mode('DELIVERY'));instance.viewStoreLocation();assert.equal(calls.length,1);
  assert.equal(instance.data.storeMapError,'');assert.equal(s.addressReads,1);
  instance.switchFulfillment(mode('PICKUP'));instance.onHide();calls[0].fail();assert.equal(instance.data.storeMapError,'');
});
test('Map entrance is unavailable without API or when confirmed store identity/address changes',async()=>{
  const s=setup();let calls=0;
  const missing=page(s).instance;await missing.onShow();assert.equal(missing.data.storeMapAvailable,false);
  const {instance}=page(s,{}, {openLocation:()=>calls++});
  s.reference.address='更新后的门店地址';await instance.onShow();
  assert.equal(instance.data.storeMapAvailable,false);instance.viewStoreLocation();assert.equal(calls,0);
  instance.data.store=null;instance.viewStoreLocation();assert.equal(calls,0);
});
test('X04 pending appointment uses confirmed 3/1 policy, exposes no fictional slots and clears on config/read failure',async()=>{
  const s=setup(),{instance}=page(s);await instance.onShow();
  assert.equal(instance.data.appointmentStatus.status,'CONFIGURATION_PENDING');assert.match(instance.data.appointmentStatus.ruleLabel,/3 单/);
  assert.equal(instance.data.appointmentStatus.slots.length,0);assert.equal(instance.data.appointmentStatus.selectedSlotId,null);
  instance.switchFulfillment(mode('DELIVERY'));assert.match(instance.data.appointmentStatus.title,/预计配送/);assert.match(instance.data.appointmentStatus.ruleLabel,/1 单/);
  s.reference.referenceVersion='updated';instance.onHide();await instance.onShow();assert.equal(instance.data.appointmentStatus,null);
  instance.switchFulfillment(mode('PICKUP'));assert.equal(instance.data.appointmentStatus.checkoutAllowed,false);
  const failed=page(s,{'./selection':{get:async()=>{throw new Error('private');}}}).instance;await failed.onShow();assert.equal(failed.data.appointmentStatus,null);
});
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
test('X06 unsaved pickup input survives switching and return; persisted contact remains unchanged until explicit save',async()=>{
  const s=setup(),{instance}=page(s);await instance.onShow();input(instance,'name','未保存联系人');input(instance,'phone','123');
  instance.switchFulfillment(mode('DELIVERY'));assert.equal(instance.data.pickupContact.name,'未保存联系人');
  instance.switchFulfillment(mode('PICKUP'));assert.equal(instance.data.pickupContact.phone,'123');assert.equal(instance.data.contactSaved,false);
  instance.onHide();await instance.onShow();assert.equal(instance.data.pickupContact.name,'未保存联系人');assert.equal(s.preferences.get().pickupContact.name,'');
});
test('X06 stale or uncertain mode write removes old derived branch state while preserving editable input',async()=>{
  const s=setup(),{instance}=page(s);await instance.onShow();instance.switchFulfillment(mode('DELIVERY'));
  s.preferences.setMode('PICKUP',s.preferences.get().revision,s.reference.referenceVersion);
  instance.switchFulfillment(mode('PICKUP'));assert.equal(instance.data.address,null);assert.equal(instance.data.deliveryStatus,null);
  assert.equal(instance.data.appointmentStatus,null);assert.equal(instance.data.fulfillmentAllowed,false);assert.equal(instance.data.checkoutAllowed,false);
  await instance.load();assert.equal(instance.data.fulfillment,'PICKUP');
});
test('X06 out-of-order visible reloads apply only current goods/store while keeping unsaved contact',async()=>{
  const s=setup(),pending=[];const {instance}=page(s,{'./selection':{get:()=>new Promise(resolve=>pending.push(resolve))}});
  const old=instance.onShow(),newest=instance.load();
  pending[1]({lines:[{lineId:'new'}],quantity:1,subtotalLabel:'238',checkoutAllowed:false});await newest;
  pending[0]({lines:[{lineId:'old'}],quantity:1,subtotalLabel:'999',checkoutAllowed:false});await old;
  assert.equal(instance.data.lines[0].lineId,'new');assert.equal(instance.data.subtotalLabel,'238');
});
test('X06 contact edit, branch change, address refresh and hide invalidate confirmation tickets',async()=>{
  const s=setup(),{instance}=page(s);await instance.onShow();let invalidations=0;instance._confirmation={invalidate:()=>invalidations++};
  input(instance,'name','输入修改');instance.switchFulfillment(mode('DELIVERY'));instance.loadAddress();instance.onHide();
  assert(invalidations>=5);assert.equal(instance.submitOrder,undefined);
});
