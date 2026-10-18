const selection=require('./selection');
const routes=require('../../constants/routes');
const {measure}=require('../../utils/safe-area');
const addresses=require('../addresses/local-addresses');
const storeInformation=require('../../services/store-information');
const preferences=require('./fulfillment-draft');
const editReturnState=require('./edit-return-state');
const {localDeliveryStatus}=require('./delivery-status');
const {localAppointmentStatus}=require('./appointment-status');
const {createConfirmationSession}=require('./confirmation-session');
// User-confirmed Amap GCJ-02 point from docs/FULFILLMENT-RULES.md.
// Map display only: never use this raw point as a verified delivery-range center.
const STORE_MAP_POINT={referenceId:'jiajiale-user-confirmed-v1',referenceVersion:'v1-store-2026-10-03',
  latitude:31.1498,longitude:117.2886,address:'安徽省合肥市庐江县X085沙溪派出所南侧约50米'};
function canOpenStoreLocation(store){return !!(store&&store.referenceId===STORE_MAP_POINT.referenceId&&
  store.referenceVersion===STORE_MAP_POINT.referenceVersion&&store.address===STORE_MAP_POINT.address&&
  typeof wx!=='undefined'&&typeof wx.openLocation==='function');}
Page({
  data:{lines:[],quantity:0,subtotalLabel:'0',loading:false,error:'',checkoutAllowed:false,address:null,addressNotice:'',
    cloudMode:false,cloudAddresses:[],cloudAddressLabels:[],slotDate:'',minimumDate:'',slots:[],slotLabels:[],slotIndex:-1,slotsLoading:false,
    quote:null,quoteBusy:false,quoteError:'',quoteExpired:false,
    store:null,storeMapAvailable:false,storeMapError:'',storePhoto:'',storePhotoFailed:false,fulfillment:'PICKUP',fulfillmentRevision:0,fulfillmentAllowed:false,configurationChanged:false,
    pickupContact:{name:'',phone:''},contactSaved:false,preferenceError:'',preferenceBusy:false,deliveryStatus:null,appointmentStatus:null,
    footerHeight:160,inputFocused:false,keyboardHeight:0,topInset:24,navHeight:44,capsuleWidth:104},
  onLoad(){this._returnContactInput=editReturnState.take();this.setData(measure(wx));},
  back(){if(getCurrentPages().length>1)wx.navigateBack();else routes.navigate('home');},
  onReady(){this.measureFooter();},
  onShow(){this._confirmation=this._confirmation||createConfirmationSession();this._visible=true;return this.load();},
  onHide(){this._visible=false;this._epoch=(this._epoch||0)+1;if(this._quoteTimer)clearTimeout(this._quoteTimer);this.setData({inputFocused:false,keyboardHeight:0});if(this._confirmation)this._confirmation.invalidate();},
  onUnload(){this.onHide();},
  async load(){
    if(selection.cloud)return this.loadCloud();
    const ticket=this._epoch=(this._epoch||0)+1;
    if(this._confirmation)this._confirmation.invalidate();
    this.setData({lines:[],quantity:0,subtotalLabel:'0',loading:true,error:'',address:null,addressNotice:'',store:null,storeMapAvailable:false,storeMapError:'',storePhoto:'',storePhotoFailed:false,fulfillmentAllowed:false,preferenceError:'',deliveryStatus:null,appointmentStatus:null});
    try{
      const [result,store]=await Promise.all([selection.get(),storeInformation.get()]);
      if(!this._visible||ticket!==this._epoch)return;
      const draft=preferences.get();
      const returning=this._returnContactInput;this._returnContactInput=null;
      if(returning&&!this._contactDirty&&returning.referenceId===store.referenceId&&returning.referenceVersion===store.referenceVersion){
        this._contactDirty=true;this.setData({pickupContact:returning.input});
      }
      this.applyPreferences(draft);this.setData({...result,store,loading:false,storeMapAvailable:canOpenStoreLocation(store),
        storePhoto:store.photo&&store.photo.source==='REAL_PHOTO'&&typeof store.photo.url==='string'?store.photo.url:'',
        appointmentStatus:localAppointmentStatus(store,draft.fulfillment,draft.fulfillmentAllowed,draft.configurationChanged)});
      if(draft.fulfillment==='DELIVERY'&&draft.fulfillmentAllowed&&!draft.configurationChanged)this.loadAddress();
      this.measureFooter();
    }
    catch(error){if(this._visible&&ticket===this._epoch)this.setData({loading:false,
      error:['LOCAL_BAG_CONFLICT','LOCAL_SELECTION_CHANGED'].includes(error.code)?'购物袋或商品信息已变化，请返回重新选择。':
        ['LOCAL_PREVIEW_MISSING','LOCAL_PREVIEW_INVALID'].includes(error.code)?'请先在购物袋中选择商品。':
          error.code==='INVALID_STORE_REFERENCE'||(error.code||'').startsWith('LOCAL_FULFILLMENT')?'门店或履约信息读取失败，请重试。':'商品核验失败，请重试。'});}
  },
  applyPreferences(draft){
    this.setData({fulfillment:draft.fulfillment,fulfillmentRevision:draft.revision,fulfillmentAllowed:draft.fulfillmentAllowed,
      configurationChanged:draft.configurationChanged,pickupContact:this._contactDirty?this.data.pickupContact:draft.pickupContact,
      contactSaved:draft.contactValid&&!this._contactDirty});
  },
  preferenceFailed(error){
    if(this._confirmation)this._confirmation.invalidate();
    if(['LOCAL_FULFILLMENT_CONFLICT','LOCAL_STORE_REFERENCE_CHANGED','FULFILLMENT_UNAVAILABLE','LOCAL_FULFILLMENT_WRITE_FAILED'].includes(error.code))
      this.setData({address:null,addressNotice:'',deliveryStatus:null,appointmentStatus:null,fulfillmentAllowed:false});
    this.setData({preferenceError:error.code==='INVALID_PHONE'?'请输入格式正确的 11 位中国大陆手机号。':
      error.code==='INVALID_CONTACT'?'请填写有效的取货联系人。':error.code==='FULFILLMENT_UNAVAILABLE'?'此履约方式当前不可选，请重新核验。':
      ['LOCAL_FULFILLMENT_CONFLICT','LOCAL_STORE_REFERENCE_CHANGED'].includes(error.code)?'履约资料已变化，请重新核验后操作。':
        '保存结果未确认，请重新核验后检查。',contactSaved:false});
  },
  switchFulfillment(e){
    if(this.data.cloudMode)return this.switchCloudFulfillment(e);
    if(!this._visible||this.data.loading||this.data.preferenceBusy||!this.data.store)return;
    if(this._confirmation)this._confirmation.invalidate();
    this.setData({preferenceBusy:true,preferenceError:'',storeMapError:''});
    try{
      const draft=preferences.setMode(e.currentTarget.dataset.mode,this.data.fulfillmentRevision,this.data.store.referenceVersion);
      this.applyPreferences(draft);this.setData({address:null,addressNotice:'',deliveryStatus:null,
        appointmentStatus:localAppointmentStatus(this.data.store,draft.fulfillment,draft.fulfillmentAllowed,draft.configurationChanged)});
      if(draft.fulfillment==='DELIVERY')this.loadAddress();
    }catch(error){this.preferenceFailed(error);}
    finally{this.setData({preferenceBusy:false});}
  },
  contactInput(e){
    if(!this._visible||this.data.fulfillment!=='PICKUP'||this.data.loading||this.data.preferenceBusy||this.data.quoteBusy)return;
    const field=e.currentTarget.dataset.field;if(!['name','phone'].includes(field)||typeof e.detail.value!=='string')return;
    if(this._confirmation)this._confirmation.invalidate();
    this._contactDirty=true;this.setData({pickupContact:{...this.data.pickupContact,[field]:e.detail.value},contactSaved:false,preferenceError:''});
    if(this.data.cloudMode)this.invalidateCloudQuote();
  },
  saveContact(){
    if(this.data.cloudMode){try{const contact=selection.normalizeContact(this.data.pickupContact);this.setData({pickupContact:contact,contactSaved:true,preferenceError:''});}
      catch(_){this.setData({preferenceError:'请填写联系人姓名和有效的 11 位手机号。'});}return;}
    if(!this._visible||this.data.fulfillment!=='PICKUP'||this.data.loading||this.data.preferenceBusy||!this.data.store)return;
    this.setData({preferenceBusy:true,preferenceError:''});
    try{
      const draft=preferences.saveContact(this.data.pickupContact,this.data.fulfillmentRevision,this.data.store.referenceVersion);
      this._contactDirty=false;this.applyPreferences(draft);
    }catch(error){this.preferenceFailed(error);}
    finally{this.setData({preferenceBusy:false});}
  },
  storePhotoError(e){if(this._visible&&e.currentTarget.dataset.src===this.data.storePhoto&&this.data.storePhoto)this.setData({storePhotoFailed:true});},
  measureFooter(){
    if(typeof wx==='undefined'||typeof wx.nextTick!=='function'||typeof this.createSelectorQuery!=='function')return;
    const ticket=this._epoch;
    wx.nextTick(()=>{
      if(!this._visible||ticket!==this._epoch||!this.data.lines.length||this.data.inputFocused||this.data.keyboardHeight>0)return;
      this.createSelectorQuery().select('.checkout-footer').boundingClientRect(rect=>{
        if(this._visible&&ticket===this._epoch&&this.data.lines.length&&!this.data.inputFocused&&this.data.keyboardHeight===0&&rect&&Number.isFinite(rect.height)&&rect.height>0)
          this.setData({footerHeight:Math.ceil(rect.height)});
      }).exec();
    });
  },
  inputFocus(){if(this._visible)this.setData({inputFocused:true});},
  inputBlur(){if(this._visible){this.setData({inputFocused:false});this.measureFooter();}},
  inputKeyboardChange(e){
    if(!this._visible)return;
    const height=Number(e.detail&&e.detail.height);
    if(!Number.isFinite(height)||height<0)return;
    this.setData({keyboardHeight:height,...(height===0?{inputFocused:false}:{})});
    if(height===0)this.measureFooter();
  },
  loadAddress(){
    if(this._confirmation)this._confirmation.invalidate();
    try{const selected=addresses.selection();this.setData({address:selected.address,addressNotice:selected.notice,deliveryStatus:localDeliveryStatus(selected)});}
    catch(_){this.setData({address:null,addressNotice:'地址读取失败，请重新选择。',deliveryStatus:{status:'READ_FAILED',label:'配送地址读取失败',notice:'请重新选择地址后核验配送范围。',checkoutAllowed:false,requiresCloudValidation:true}});}
  },
  chooseAddress(){if(this.data.cloudMode)return routes.navigate('addresses');if(this._visible&&!this.data.loading&&this.data.lines.length&&this.data.fulfillment==='DELIVERY'&&this.data.fulfillmentAllowed&&!this.data.configurationChanged){
    if(this._confirmation)this._confirmation.invalidate();return routes.navigate('addresses',{select:'1'});}},
  viewStoreLocation(){
    if(!this._visible||this.data.loading||this.data.preferenceBusy||this.data.fulfillment!=='PICKUP'||!canOpenStoreLocation(this.data.store))return;
    this.setData({storeMapError:''});
    const ticket=this._epoch;
    const fail=()=>{if(this._visible&&ticket===this._epoch&&this.data.fulfillment==='PICKUP')
      this.setData({storeMapError:'位置暂时无法打开，请稍后重试。'});};
    try{wx.openLocation({latitude:STORE_MAP_POINT.latitude,longitude:STORE_MAP_POINT.longitude,
      name:this.data.store.name,address:this.data.store.address,scale:16,fail});}catch(_){fail();}
  },
  invalidateCloudQuote(){
    this._quoteEpoch=(this._quoteEpoch||0)+1;if(this._quoteTimer)clearTimeout(this._quoteTimer);
    this.setData({quote:null,quoteError:'',quoteExpired:false});
  },
  async loadCloud(){
    const ticket=this._epoch=(this._epoch||0)+1;this.invalidateCloudQuote();
    this.setData({cloudMode:true,loading:true,error:'',lines:[],subtotalLabel:'0',quoteBusy:false,address:null,cloudAddresses:[],cloudAddressLabels:[],deliveryStatus:null,appointmentStatus:null});
    try{
      const [result,store]=await Promise.all([selection.get(),selection.getStore()]);
      if(!this._visible||ticket!==this._epoch)return;
      const sameOwner=this._cloudSubject===result.subjectHash;this._cloudSubject=result.subjectHash;
      const fulfillment=sameOwner&&store.fulfillmentModes.includes(this.data.fulfillment)?this.data.fulfillment:store.fulfillmentModes[0];
      const today=new Date(Date.now()+28800000).toISOString().slice(0,10);
      this.setData({...result,store,loading:false,fulfillment,fulfillmentAllowed:true,configurationChanged:false,preferenceError:'',
        pickupContact:sameOwner?this.data.pickupContact:{name:'',phone:''},contactSaved:false,storeMapAvailable:false,
        slotDate:this.data.slotDate>=today?this.data.slotDate:today,minimumDate:today});
      await Promise.all([this.loadCloudSlots(),fulfillment==='DELIVERY'?this.loadCloudAddresses():Promise.resolve()]);
      this.measureFooter();
    }catch(_){if(this._visible&&ticket===this._epoch)this.setData({loading:false,error:'所选商品或账户已变化，请返回购物袋重新核验。'});}
  },
  async loadCloudSlots(){
    const ticket=this._slotEpoch=(this._slotEpoch||0)+1,epoch=this._epoch;
    this.invalidateCloudQuote();this.setData({slots:[],slotLabels:[],slotIndex:-1,slotsLoading:true});
    try{const slots=await selection.getSlots(this.data.fulfillment,this.data.slotDate);
      if(this._visible&&epoch===this._epoch&&ticket===this._slotEpoch)this.setData({slots,slotLabels:slots.map(slot=>slot.label),slotsLoading:false});
    }catch(error){if(this._visible&&epoch===this._epoch&&ticket===this._slotEpoch)this.setData({slotsLoading:false,
      quoteError:error.code==='APPOINTMENT_UNAVAILABLE'?'这个日期暂不可预约，请选择其他日期。':'时段读取失败，请重新选择日期或重试。'});}
  },
  async loadCloudAddresses(){
    const epoch=this._epoch;
    try{const book=await selection.getAddresses();if(!this._visible||epoch!==this._epoch||this.data.fulfillment!=='DELIVERY')return;
      const address=book.addresses.find(row=>row.addressId===this._cloudAddressId)||book.addresses.find(row=>row.isDefault)||book.addresses[0]||null;
      this.setData({cloudAddresses:book.addresses,cloudAddressLabels:book.addresses.map(row=>row.receiverName+' '+row.phone+' '+row.detail),address,addressNotice:''});
    }catch(_){if(this._visible&&epoch===this._epoch)this.setData({address:null,cloudAddresses:[],cloudAddressLabels:[],addressNotice:'地址读取失败，请重试。'});}
  },
  switchCloudFulfillment(e){
    const mode=e.currentTarget.dataset.mode;
    if(this.data.quoteBusy||this.data.loading||!this.data.store?.fulfillmentModes.includes(mode)||mode===this.data.fulfillment)return;
    this.setData({fulfillment:mode,address:null,addressNotice:'',preferenceError:''});
    return Promise.all([this.loadCloudSlots(),mode==='DELIVERY'?this.loadCloudAddresses():Promise.resolve()]);
  },
  cloudAddressChanged(e){
    if(this.data.quoteBusy)return;const address=this.data.cloudAddresses[Number(e.detail.value)];if(!address)return;
    this._cloudAddressId=address.addressId;this.invalidateCloudQuote();this.setData({address});
  },
  cloudDateChanged(e){if(this.data.quoteBusy||typeof e.detail.value!=='string')return;this.setData({slotDate:e.detail.value});return this.loadCloudSlots();},
  cloudSlotChanged(e){if(this.data.quoteBusy)return;const index=Number(e.detail.value);if(!Number.isInteger(index)||!this.data.slots[index])return;
    this.invalidateCloudQuote();this.setData({slotIndex:index});},
  async verifyCloudQuote(){
    if(!this._visible||this.data.loading||this.data.quoteBusy)return;
    const slot=this.data.slots[this.data.slotIndex];if(!slot){this.setData({quoteError:'请先选择可预约时段。'});return;}
    const address=this.data.address;if(this.data.fulfillment==='DELIVERY'&&!address){this.setData({quoteError:'请先选择收货地址。'});return;}
    this.invalidateCloudQuote();const epoch=this._epoch,ticket=this._quoteEpoch;this.setData({quoteBusy:true,quoteError:''});
    try{const quote=await selection.createQuote({fulfillment:this.data.fulfillment,slot,
      contact:this.data.fulfillment==='DELIVERY'?{name:address.receiverName,phone:address.phone}:this.data.pickupContact,addressId:address?.addressId||null});
      if(!this._visible||epoch!==this._epoch||ticket!==this._quoteEpoch)return;
      this.setData({quote,lines:quote.lines||this.data.lines,quoteExpired:false});this._quoteTimer=setTimeout(()=>{if(this._visible&&epoch===this._epoch&&ticket===this._quoteEpoch)
        this.setData({quote:null,quoteExpired:true,quoteError:'报价已过期，请重新核验。'});},Math.max(0,quote.expiresAt-Date.now()));
    }catch(error){if(this._visible&&epoch===this._epoch&&ticket===this._quoteEpoch)this.setData({quote:null,quoteError:
      ['INVALID_PHONE','INVALID_CONTACT'].includes(error.code)?'请填写联系人姓名和有效的 11 位手机号。':
        error.code==='BUSY'?'上次报价结果待确认，请保持原选择后重试。':
          ['LOCATION_REQUIRED','FULFILLMENT_UNAVAILABLE'].includes(error.code)?'当前地址暂不可配送，请重新选择。':
            ['APPOINTMENT_UNAVAILABLE','RESOURCE_UNAVAILABLE'].includes(error.code)?'该商品或时段已不可预约，请重新选择。':'报价结果未确认，请重试；商品变化后请返回购物袋重新核验。'});}
    finally{if(this._visible&&epoch===this._epoch)this.setData({quoteBusy:false});}
  },
  goBag(){
    if(this._confirmation)this._confirmation.invalidate();
    if(this._contactDirty)editReturnState.remember(this.data.store,this.data.pickupContact);
    const pages=getCurrentPages();
    if(pages.length>1&&pages[pages.length-2].route===routes.pages.bag.slice(1))return wx.navigateBack({delta:1});
    return routes.navigate('bag');
  }
});
