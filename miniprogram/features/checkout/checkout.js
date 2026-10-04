const selection=require('./selection');
const routes=require('../../constants/routes');
const addresses=require('../addresses/local-addresses');
const storeInformation=require('../../services/store-information');
const preferences=require('./fulfillment-draft');
const {localDeliveryStatus}=require('./delivery-status');
Page({
  data:{lines:[],quantity:0,subtotalLabel:'0',loading:false,error:'',checkoutAllowed:false,address:null,addressNotice:'',
    store:null,fulfillment:'PICKUP',fulfillmentRevision:0,fulfillmentAllowed:false,configurationChanged:false,
    pickupContact:{name:'',phone:''},contactSaved:false,preferenceError:'',preferenceBusy:false,deliveryStatus:null},
  onShow(){this._visible=true;return this.load();},
  onHide(){this._visible=false;this._epoch=(this._epoch||0)+1;},
  onUnload(){this.onHide();},
  async load(){
    const ticket=this._epoch=(this._epoch||0)+1;
    this.setData({lines:[],quantity:0,subtotalLabel:'0',loading:true,error:'',address:null,addressNotice:'',store:null,fulfillmentAllowed:false,preferenceError:'',deliveryStatus:null});
    try{
      const [result,store]=await Promise.all([selection.get(),storeInformation.get()]);
      if(!this._visible||ticket!==this._epoch)return;
      const draft=preferences.get();this.applyPreferences(draft);this.setData({...result,store,loading:false});
      if(draft.fulfillment==='DELIVERY'&&draft.fulfillmentAllowed&&!draft.configurationChanged)this.loadAddress();
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
    this.setData({preferenceError:error.code==='INVALID_PHONE'?'请输入格式正确的 11 位中国大陆手机号。':
      error.code==='INVALID_CONTACT'?'请填写有效的取货联系人。':error.code==='FULFILLMENT_UNAVAILABLE'?'此履约方式当前不可选，请重新核验。':
      ['LOCAL_FULFILLMENT_CONFLICT','LOCAL_STORE_REFERENCE_CHANGED'].includes(error.code)?'履约资料已变化，请重新核验后操作。':
        '保存结果未确认，请重新核验后检查。',contactSaved:false});
  },
  switchFulfillment(e){
    if(!this._visible||this.data.loading||this.data.preferenceBusy||!this.data.store)return;
    this.setData({preferenceBusy:true,preferenceError:''});
    try{
      const draft=preferences.setMode(e.currentTarget.dataset.mode,this.data.fulfillmentRevision,this.data.store.referenceVersion);
      this.applyPreferences(draft);this.setData({address:null,addressNotice:'',deliveryStatus:null});
      if(draft.fulfillment==='DELIVERY')this.loadAddress();
    }catch(error){this.preferenceFailed(error);}
    finally{this.setData({preferenceBusy:false});}
  },
  contactInput(e){
    if(!this._visible||this.data.fulfillment!=='PICKUP'||this.data.loading||this.data.preferenceBusy)return;
    const field=e.currentTarget.dataset.field;if(!['name','phone'].includes(field)||typeof e.detail.value!=='string')return;
    this._contactDirty=true;this.setData({pickupContact:{...this.data.pickupContact,[field]:e.detail.value},contactSaved:false,preferenceError:''});
  },
  saveContact(){
    if(!this._visible||this.data.fulfillment!=='PICKUP'||this.data.loading||this.data.preferenceBusy||!this.data.store)return;
    this.setData({preferenceBusy:true,preferenceError:''});
    try{
      const draft=preferences.saveContact(this.data.pickupContact,this.data.fulfillmentRevision,this.data.store.referenceVersion);
      this._contactDirty=false;this.applyPreferences(draft);
    }catch(error){this.preferenceFailed(error);}
    finally{this.setData({preferenceBusy:false});}
  },
  loadAddress(){
    try{const selected=addresses.selection();this.setData({address:selected.address,addressNotice:selected.notice,deliveryStatus:localDeliveryStatus(selected)});}
    catch(_){this.setData({address:null,addressNotice:'地址读取失败，请重新选择。',deliveryStatus:{status:'READ_FAILED',label:'配送地址读取失败',notice:'请重新选择地址后核验配送范围。',checkoutAllowed:false,requiresCloudValidation:true}});}
  },
  chooseAddress(){if(this._visible&&!this.data.loading&&this.data.lines.length&&this.data.fulfillment==='DELIVERY'&&this.data.fulfillmentAllowed&&!this.data.configurationChanged)return routes.navigate('addresses',{select:'1'});},
  goBag(){
    const pages=getCurrentPages();
    if(pages.length>1&&pages[pages.length-2].route===routes.pages.bag.slice(1))return wx.navigateBack({delta:1});
    return routes.navigate('bag');
  }
});
