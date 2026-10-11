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
Page({
  data:{addresses:[],revision:0,scope:'',error:'',busy:false,loading:false,selectMode:false,selectionAllowed:false,
    editing:false,editId:null,editVersion:null,form:empty()},
  onLoad(options){this.setData({selectMode:options&&options.select==='1',selectionAllowed:addresses.selectionAllowed!==false});},
  onShow(){this._visible=true;this._unloaded=false;this._epoch=(this._epoch||0)+1;return this.load();},
  onHide(){this._visible=false;this._epoch=(this._epoch||0)+1;},
  onUnload(){this._unloaded=true;this.onHide();},
  active(ticket){return this._visible&&ticket===this._epoch&&!this._unloaded;},
  async load(){
    const ticket=this._epoch,request=this._loadRequest=(this._loadRequest||0)+1;
    this.setData({loading:true});
    try{const result=await addresses.list();if(!this.active(ticket)||request!==this._loadRequest)return false;
      this.setData({...result,error:'',loading:false});return true;}
    catch(error){if(this.active(ticket)&&request===this._loadRequest)this.setData({addresses:[],scope:'',loading:false,error:message(error)});return false;}
  },
  add(){if(this.data.busy||this.data.loading)return;this._editRevision=this.data.revision;this.setData({editing:true,editId:null,editVersion:null,form:empty(),error:''});},
  edit(e){
    if(this.data.busy||this.data.loading)return;const address=this.row(e);if(!address)return;
    this._editRevision=this.data.revision;
    this.setData({editing:true,editId:address.addressId,editVersion:address.version,
      form:Object.fromEntries(addresses.FIELDS.map(field=>[field,address[field]])),error:''});
  },
  row(e){return this.data.addresses.find(address=>address.addressId===e.currentTarget.dataset.id);},
  input(e){
    const field=e.currentTarget.dataset.field;if(this.data.busy||!addresses.FIELDS.includes(field)||typeof e.detail.value!=='string')return;
    this.setData({form:{...this.data.form,[field]:e.detail.value},error:''});
  },
  cancel(){if(this.data.busy)return;this.setData({editing:false,error:''});return this.load();},
  async save(){
    if(this.data.busy)return;const ticket=this._epoch;this.setData({busy:true,error:''});
    try{
      const result=this.data.editId?await addresses.update(this.data.editId,this.data.editVersion,this.data.form,this._editRevision):
        await addresses.create(this.data.form,this._editRevision);
      if(this.active(ticket))this.setData({...result,editing:false,form:empty(),editId:null,editVersion:null});
    }catch(error){if(this.active(ticket))this.setData({error:message(error)});}
    finally{if(!this._unloaded)this.setData({busy:false});}
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
