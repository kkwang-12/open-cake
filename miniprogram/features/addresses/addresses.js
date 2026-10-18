const addresses=require('./address-client');
const routes=require('../../constants/routes');
const empty=()=>({receiverName:'',phone:'',province:'',city:'',district:'',detail:''});
function message(error){return error.code==='INVALID_PHONE'?'请输入格式正确的 11 位中国大陆手机号。':
  ['INVALID_ADDRESS','INVALID_REQUEST'].includes(error.code)?'请完整填写收件人和地址，检查输入格式。':
  ['LOCAL_ADDRESS_CONFLICT','VERSION_CONFLICT','CURSOR_INVALID','CURSOR_EXPIRED'].includes(error.code)?'地址记录已变化，请返回列表重新操作。':
  ['LOCAL_ADDRESS_NOT_FOUND','NOT_FOUND'].includes(error.code)?'该地址已删除，请重新选择。':
  ['LOCAL_ADDRESS_WRITE_FAILED','CLOUD_CALL_FAILED','INVALID_RESPONSE','BUSY'].includes(error.code)?'保存结果未确认，请保留输入并重试；重试会核对原操作。':
  error.code==='CLOUD_NOT_CONFIGURED'?'地址云服务暂未开通，请稍后重试。':
  error.code==='AUTH_REQUIRED'?'身份验证失败，请重新进入小程序。':
  error.code==='CONFIGURATION_REQUIRED'?'地址服务或配送结算尚未开通。':'保存失败，请重试。';}
const uncertain=error=>['CLOUD_CALL_FAILED','INVALID_RESPONSE','BUSY','LOCAL_ADDRESS_WRITE_FAILED','LOCAL_ADDRESS_READ_FAILED','AUTH_REQUIRED'].includes(error.code);
Page({
  data:{addresses:[],revision:0,scope:'',error:'',busy:false,loading:false,selectMode:false,selectionAllowed:false,
    editing:false,editId:null,editVersion:null,form:empty(),locationVerificationAvailable:false,
    locating:false,locationCandidate:null,locationConfirmed:false,locationNotice:'',locationCircles:[],locationRequest:0,saveUncertain:false},
  onLoad(options){this.setData({selectMode:options&&options.select==='1',selectionAllowed:addresses.selectionAllowed!==false,
    locationVerificationAvailable:addresses.locationVerificationAvailable===true});},
  onShow(){this._visible=true;this._unloaded=false;this._epoch=(this._epoch||0)+1;this.setData({locating:false,saveUncertain:!!this._saveAttempt});
    if(this._completedSave){this._completedSave=false;this.resetLocation();this.setData({editing:false,form:empty(),editId:null,editVersion:null,saveUncertain:false});}
    else if(this._locationSelection&&!this._saveAttempt&&this._locationSelection.expiresAt<=Date.now())this.resetLocation('核验已过期，请重新核验或保存文字地址。');
    return this.load();},
  onHide(){this._visible=false;this._epoch=(this._epoch||0)+1;this._locationRequest=(this._locationRequest||0)+1;},
  onUnload(){this._unloaded=true;this.onHide();this._locationSelection=null;this._saveAttempt=null;},
  active(ticket){return this._visible&&ticket===this._epoch&&!this._unloaded;},
  async load(){
    const ticket=this._epoch,request=this._loadRequest=(this._loadRequest||0)+1;
    this.setData({loading:true});
    try{const result=await addresses.list();if(!this.active(ticket)||request!==this._loadRequest)return false;
      if(this.data.subjectHash&&result.subjectHash!==this.data.subjectHash){
        this._saveAttempt=null;this.resetLocation();this.setData({editing:false,editId:null,editVersion:null,form:empty(),saveUncertain:false});
      }
      this.setData({...result,error:'',loading:false});return true;}
    catch(error){if(this.active(ticket)&&request===this._loadRequest)this.setData({addresses:[],scope:'',loading:false,error:message(error)});return false;}
  },
  add(){if(this.data.busy||this.data.loading||this.data.locating)return;this._completedSave=false;this._saveAttempt=null;this.resetLocation();this._editRevision=this.data.revision;this.setData({editing:true,editId:null,editVersion:null,form:empty(),error:'',saveUncertain:false});},
  edit(e){
    if(this.data.busy||this.data.loading)return;const address=this.row(e);if(!address)return;
    this._completedSave=false;this._saveAttempt=null;this.resetLocation();this._editRevision=this.data.revision;
    this.setData({editing:true,editId:address.addressId,editVersion:address.version,
      form:Object.fromEntries(addresses.FIELDS.map(field=>[field,address[field]])),error:'',saveUncertain:false});
  },
  row(e){return this.data.addresses.find(address=>address.addressId===e.currentTarget.dataset.id);},
  input(e){
    const field=e.currentTarget.dataset.field;if(this.data.busy||this.data.saveUncertain||!addresses.FIELDS.includes(field)||typeof e.detail.value!=='string'||this.data.form[field]===e.detail.value)return;
    this.resetLocation(this.data.locationCandidate||this.data.locating?'地址已修改，请重新核验位置。':'');
    this.setData({form:{...this.data.form,[field]:e.detail.value},error:''});
  },
  formSignature(){return JSON.stringify([this.data.editId,this.data.editVersion,this.data.form]);},
  resetLocation(notice=''){
    this._locationSelection=null;this._locationRequest=(this._locationRequest||0)+1;
    if(!this._unloaded)this.setData({locationCandidate:null,locationConfirmed:false,locationNotice:notice,locationCircles:[],locating:false});
  },
  async resolveLocation(){
    if(!this.data.editing||!this.data.locationVerificationAvailable||this.data.busy||this.data.locating||this.data.saveUncertain)return;
    this.resetLocation();const ticket=this._epoch,request=this._locationRequest,signature=this.formSignature();
    this.setData({locating:true,locationNotice:'正在核验地址位置…',error:''});
    try{const selection=await addresses.resolveLocation({...this.data.form},this.data.editId,this.data.editVersion);
      if(!this.active(ticket)||request!==this._locationRequest||signature!==this.formSignature())return;
      const location=selection&&selection.location;
      if(!selection||selection.subjectHash!==this.data.subjectHash||!location||location.coordinateSystem!=='GCJ02'||
        !Number.isFinite(location.latitude)||Math.abs(location.latitude)>90||!Number.isFinite(location.longitude)||Math.abs(location.longitude)>180||
        !Number.isSafeInteger(selection.expiresAt)||selection.expiresAt<=Date.now()||typeof selection.mapSelectionToken!=='string')throw {code:'INVALID_RESPONSE'};
      this._locationSelection={...selection,signature};
      this.setData({locationCandidate:{...location,address:[this.data.form.province,this.data.form.city,this.data.form.district,this.data.form.detail].join('')},
        locationCircles:[{latitude:location.latitude,longitude:location.longitude,radius:10,color:'#111111',fillColor:'#11111155',strokeWidth:2}],
        locationRequest:request,locationNotice:'请确认地图圆点与收货位置一致；配送范围将在后续核验。'});
    }catch(error){if(this.active(ticket)&&request===this._locationRequest)this.resetLocation(
      ['INVALID_ADDRESS','INVALID_PHONE','INVALID_REQUEST'].includes(error.code)?'请检查收件人、手机号和完整地址后重新核验。':
      error.code==='AUTH_REQUIRED'?'身份已变化，请返回列表重新操作。':'暂时无法核验位置，请稍后重试；也可先保存文字地址。');}
    finally{if(this.active(ticket)&&request===this._locationRequest)this.setData({locating:false});}
  },
  confirmLocation(){
    if(this.data.busy||this.data.locating||this.data.saveUncertain||!this._locationSelection)return;
    if(this._locationSelection.signature!==this.formSignature()||this._locationSelection.expiresAt<=Date.now())return this.resetLocation('核验已过期或地址已修改，请重新核验。');
    this.setData({locationConfirmed:true,locationNotice:'已确认此位置。保存后仍需核验配送范围。'});
  },
  useTextAddress(){if(!this.data.busy&&!this.data.saveUncertain)this.resetLocation('将仅保存文字地址，配送位置尚未核验。');},
  locationMapError(e){
    if(!this.data.busy&&!this.data.saveUncertain&&this.data.locationCandidate&&Number(e.currentTarget.dataset.request)===this.data.locationRequest)
      this.resetLocation('地图暂时无法显示，请稍后重试；也可先保存文字地址。');
  },
  cancel(){if(this.data.busy)return;this._completedSave=false;this._saveAttempt=null;this.resetLocation();this.setData({editing:false,error:'',saveUncertain:false});return this.load();},
  async save(){
    if(this.data.busy||this.data.locating||!this.data.editing)return;
    if(this._completedSave){this._completedSave=false;this.resetLocation();this.setData({editing:false,form:empty(),editId:null,editVersion:null,saveUncertain:false});return this.load();}
    if(!this._saveAttempt&&this.data.locationCandidate&&!this.data.locationConfirmed){this.setData({locationNotice:'请先确认地图位置，或选择仅保存文字地址。'});return;}
    if(!this._saveAttempt&&this._locationSelection&&this._locationSelection.expiresAt<=Date.now())return this.resetLocation('核验已过期，请重新核验或保存文字地址。');
    const attempt=this._saveAttempt||{id:this.data.editId,version:this.data.editVersion,form:{...this.data.form},revision:this._editRevision,
      token:this.data.locationConfirmed&&this._locationSelection?this._locationSelection.mapSelectionToken:undefined,subjectHash:this.data.subjectHash};
    this._saveAttempt=attempt;const ticket=this._epoch;this.setData({busy:true,error:''});
    try{
      const result=attempt.id?await addresses.update(attempt.id,attempt.version,attempt.form,attempt.revision,attempt.token,attempt.subjectHash):
        await addresses.create(attempt.form,attempt.revision,attempt.token,attempt.subjectHash);
      this._saveAttempt=null;
      if(this.active(ticket)){this.resetLocation();this.setData({...result,editing:false,form:empty(),editId:null,editVersion:null,saveUncertain:false});}
      else if(!this._unloaded)this._completedSave=true;
    }catch(error){
      if(!uncertain(error))this._saveAttempt=null;
      if(this.active(ticket)){
        if(error.code==='LOCATION_REQUIRED')this.resetLocation('位置核验已失效，请重新核验。');
        this.setData({error:error.code==='LOCATION_REQUIRED'?'位置核验已失效，请重新核验或仅保存文字地址。':message(error),saveUncertain:uncertain(error)});
      }
    }
    finally{if(!this._unloaded)this.setData({busy:false,saveUncertain:!!this._saveAttempt});}
  },
  async setDefault(e){
    if(this.data.busy)return;const address=this.row(e);if(!address)return;
    const ticket=this._epoch;this.setData({busy:true,error:''});
    try{const result=await addresses.setDefault(address.addressId,address.version,this.data.revision);if(this.active(ticket))this.setData(result);}
    catch(error){if(this.active(ticket)&&await this.load())this.setData({error:message(error)});}
    finally{if(!this._unloaded)this.setData({busy:false});}
  },
  async remove(e){
    if(this.data.busy)return;const address=this.row(e);if(!address)return;
    const revision=this.data.revision,ticket=this._epoch;this.setData({busy:true,error:''});
    try{
      const confirmed=await new Promise(resolve=>wx.showModal({title:'删除地址',content:address.isDefault?'删除后将清空默认地址，不会自动选其他地址。':'确认删除这条地址？',
        confirmText:'删除',cancelText:'保留',success:result=>resolve(result.confirm===true),fail:()=>resolve(false)}));
      if(!confirmed||!this.active(ticket))return;
      const result=await addresses.remove(address.addressId,address.version,revision);if(this.active(ticket))this.setData(result);
    }catch(error){if(this.active(ticket)&&await this.load())this.setData({error:message(error)});}
    finally{if(!this._unloaded)this.setData({busy:false});}
  },
  async choose(e){
    if(!this.data.selectMode||this.data.busy)return;const address=this.row(e);if(!address)return;
    const ticket=this._epoch;this.setData({busy:true,error:''});
    try{
      await addresses.choose(address.addressId,address.version,this.data.revision);
      if(!this.active(ticket))return;
      const pages=getCurrentPages();
      if(pages.length>1&&pages[pages.length-2].route===routes.pages.checkout.slice(1))await wx.navigateBack({delta:1});
      else await routes.navigate('checkout');
    }catch(error){if(this._visible&&await this.load())this.setData({error:message(error)});}
    finally{if(!this._unloaded)this.setData({busy:false});}
  }
});
