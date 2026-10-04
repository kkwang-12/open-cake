const addresses=require('./local-addresses');
const routes=require('../../constants/routes');
const empty=()=>({receiverName:'',phone:'',province:'',city:'',district:'',detail:''});
function message(error){return error.code==='INVALID_PHONE'?'请输入格式正确的 11 位中国大陆手机号。':
  error.code==='INVALID_ADDRESS'?'请完整填写收件人和地址，检查输入格式。':
  error.code==='LOCAL_ADDRESS_CONFLICT'?'地址记录已变化，请返回列表重新操作。':
  error.code==='LOCAL_ADDRESS_NOT_FOUND'?'该地址已删除，请重新选择。':
  error.code==='LOCAL_ADDRESS_WRITE_FAILED'?'保存结果未确认，请返回列表检查后再操作。':'保存失败，请重试。';}
Page({
  data:{addresses:[],revision:0,error:'',busy:false,selectMode:false,editing:false,editId:null,editVersion:null,form:empty()},
  onLoad(options){this.setData({selectMode:options&&options.select==='1'});},
  onShow(){this._visible=true;this._unloaded=false;this._epoch=(this._epoch||0)+1;this.load();},
  onHide(){this._visible=false;this._epoch=(this._epoch||0)+1;},
  onUnload(){this._unloaded=true;this.onHide();},
  load(){
    try{const result=addresses.list();this.setData({...result,error:''});return true;}
    catch(_){this.setData({addresses:[],error:'地址读取失败，请重试。'});return false;}
  },
  add(){if(this.data.busy)return;this._editRevision=this.data.revision;this.setData({editing:true,editId:null,editVersion:null,form:empty(),error:''});},
  edit(e){
    if(this.data.busy)return;const address=this.row(e);if(!address)return;
    this._editRevision=this.data.revision;
    this.setData({editing:true,editId:address.addressId,editVersion:address.version,
      form:Object.fromEntries(addresses.FIELDS.map(field=>[field,address[field]])),error:''});
  },
  row(e){return this.data.addresses.find(address=>address.addressId===e.currentTarget.dataset.id);},
  input(e){
    const field=e.currentTarget.dataset.field;if(this.data.busy||!addresses.FIELDS.includes(field)||typeof e.detail.value!=='string')return;
    this.setData({form:{...this.data.form,[field]:e.detail.value},error:''});
  },
  cancel(){if(this.data.busy)return;this.setData({editing:false,error:''});this.load();},
  save(){
    if(this.data.busy)return;this.setData({busy:true,error:''});
    try{
      const result=this.data.editId?addresses.update(this.data.editId,this.data.editVersion,this.data.form,this._editRevision):
        addresses.create(this.data.form,this._editRevision);
      this.setData({...result,editing:false,form:empty(),editId:null,editVersion:null});
    }catch(error){this.setData({error:message(error)});}
    finally{this.setData({busy:false});}
  },
  setDefault(e){
    if(this.data.busy)return;const address=this.row(e);if(!address)return;
    this.setData({busy:true,error:''});
    try{this.setData(addresses.setDefault(address.addressId,address.version,this.data.revision));}
    catch(error){if(this.load())this.setData({error:message(error)});}
    finally{this.setData({busy:false});}
  },
  async remove(e){
    if(this.data.busy)return;const address=this.row(e);if(!address)return;
    const revision=this.data.revision,ticket=this._epoch;this.setData({busy:true,error:''});
    try{
      const confirmed=await new Promise(resolve=>wx.showModal({title:'删除地址',content:address.isDefault?'删除后将清空默认地址，不会自动选其他地址。':'确认删除这条地址？',
        confirmText:'删除',cancelText:'保留',success:result=>resolve(result.confirm===true),fail:()=>resolve(false)}));
      if(!confirmed||!this._visible||ticket!==this._epoch)return;
      this.setData(addresses.remove(address.addressId,address.version,revision));
    }catch(error){if(this._visible&&ticket===this._epoch&&this.load())this.setData({error:message(error)});}
    finally{if(!this._unloaded)this.setData({busy:false});}
  },
  async choose(e){
    if(!this.data.selectMode||this.data.busy)return;const address=this.row(e);if(!address)return;
    this.setData({busy:true,error:''});
    try{
      addresses.choose(address.addressId,address.version,this.data.revision);
      const pages=getCurrentPages();
      if(pages.length>1&&pages[pages.length-2].route===routes.pages.checkout.slice(1))await wx.navigateBack({delta:1});
      else await routes.navigate('checkout');
    }catch(error){if(this._visible&&this.load())this.setData({error:message(error)});}
    finally{if(!this._unloaded)this.setData({busy:false});}
  }
});
