const routes=require('../../constants/routes');
const detail=require('../../services/product-detail');
const bag=require('../../services/local-bag');
const {measure}=require('../../utils/safe-area');
const {createSpecificationModel}=require('../../utils/specification-model');
const {formatCents}=require('../../services/catalog');
const {STORE_FACTS,presentGroups}=require('../../utils/product-presentation');
Page({
  data:{product:null,loading:false,error:'',unavailable:false,gallery:[],galleryIndex:0,
    topInset:24,navHeight:44,capsuleWidth:104,heroHeight:460,sheetOpen:false,groups:[],quantity:1,
    cakeMessage:'',messageCount:0,messageEnabled:false,messageMaxLength:-1,messageHint:'',
    totalLabel:'—',selectionNotice:'',adding:false,success:null,benefits:STORE_FACTS},
  onLoad(options={}){
    this._productId=typeof options.id==='string'?options.id:'';
    const metrics=measure();
    let heroHeight=460;
    try{const info=wx.getWindowInfo?wx.getWindowInfo():wx.getSystemInfoSync();heroHeight=Math.round(info.windowHeight*0.59);}catch(_){}
    this.setData({...metrics,heroHeight});
    if(typeof wx.setEnableDebug==='function')wx.setEnableDebug({enableDebug:false});
  },
  onShow(){this._visible=true;return this.load();},
  onHide(){this._visible=false;this._epoch=(this._epoch||0)+1;this.setData({sheetOpen:false});},
  onUnload(){this.onHide();},
  async load(){
    const ticket=this._epoch=(this._epoch||0)+1;
    this.setData({product:null,gallery:[],galleryIndex:0,loading:true,error:'',unavailable:false,sheetOpen:false,success:null,adding:false});
    try{
      const product=await detail.get(this._productId);
      if(ticket!==this._epoch||!this._visible)return;
      if(!product||product.productId!==this._productId||!Array.isArray(product.images)||
          !Array.isArray(product.variantLabels)||product.canPurchase!==false||typeof product.canConfigure!=='boolean')throw new Error();
      this._model=product.configuration?createSpecificationModel(product.configuration):null;
      this._selection=this._model?this._model.evaluate():null;
      const gallery=product.images.map(image=>({...image,failed:false}));
      this.setData({product,gallery,loading:false,error:'',quantity:1,cakeMessage:'',messageCount:0});
      if(this._model)this.renderSelection();
    }catch(error){
      if(ticket!==this._epoch||!this._visible)return;
      const unavailable=['PRODUCT_UNAVAILABLE','NOT_FOUND','INVALID_REQUEST'].includes(error.code);
      this.setData({loading:false,unavailable,error:unavailable?'该商品不存在或暂未开放。':
        error.code==='CLOUD_NOT_CONFIGURED'?'商品服务暂未开通，欢迎稍后再来。':'商品加载失败，请重试。'});
    }
  },
  renderSelection(){
    const state=this._selection,configuration=this._model.configuration(),sku=state.matchedSku;
    const total=sku?sku.unitPriceCents*this.data.quantity:null;
    this.setData({groups:presentGroups(configuration,state),totalLabel:Number.isSafeInteger(total)?formatCents(total):'—',
      hasSelection:!!sku,messageEnabled:state.messageSupport!=='DISABLED',
      messageMaxLength:state.messagePolicy?state.messagePolicy.maxLength:-1,
      messageHint:state.messageSupport==='PENDING_LIMIT'?'留言长度规则待确认，当前仅保存在本机。':'',
      selectionNotice:state.notice||'',canDecrease:this.data.quantity>(sku&&sku.minQuantity!==null?sku.minQuantity:1),
      canIncrease:!sku||sku.maxQuantity===null||this.data.quantity<sku.maxQuantity});
  },
  retry(){if(!this.data.loading)return this.load();},
  errorAction(){if(this.data.unavailable)return this.browse();return this.retry();},
  imageError(e){
    if(!this.data.product||e.currentTarget.dataset.productId!==this.data.product.productId)return;
    const index=this.data.gallery.findIndex(image=>image.key===e.currentTarget.dataset.key);
    if(index>=0)this.setData({['gallery['+index+'].failed']:true});
  },
  galleryChange(e){
    const index=e.detail.current;
    if(Number.isSafeInteger(index)&&index>=0&&index<this.data.gallery.length)this.setData({galleryIndex:index});
  },
  configure(){
    if(!this.data.product||this.data.loading)return;
    if(!this._model){wx.showToast({title:'此商品的规格资料尚未接通',icon:'none'});return;}
    this.setData({sheetOpen:true,success:null});this.renderSelection();
  },
  closeSheet(){if(!this.data.adding)this.setData({sheetOpen:false});},
  swallow(){},
  chooseOption(e){
    if(this.data.adding||!this._model)return;
    try{
      this._selection=this._model.changeOption(this._selection,{
        groupCode:e.currentTarget.dataset.group,optionCode:e.currentTarget.dataset.option
      });
      const sku=this._selection.matchedSku;
      if(sku&&sku.minQuantity!==null&&this.data.quantity<sku.minQuantity)this.setData({quantity:sku.minQuantity});
      if(sku&&sku.maxQuantity!==null&&this.data.quantity>sku.maxQuantity)this.setData({quantity:sku.maxQuantity});
      this.renderSelection();
    }catch(_){this.setData({selectionNotice:'该规格不可选，请重新选择。'});}
  },
  changeQuantity(e){
    if(this.data.adding||!this._model)return;
    const step=Number(e.currentTarget.dataset.step);
    if(step!==1&&step!==-1)return;
    const quantity=this.data.quantity+step,sku=this._selection.matchedSku;
    if(!Number.isSafeInteger(quantity)||quantity<1||(sku&&sku.minQuantity!==null&&quantity<sku.minQuantity)||
      (sku&&sku.maxQuantity!==null&&quantity>sku.maxQuantity)||(sku&&!Number.isSafeInteger(quantity*sku.unitPriceCents)))return;
    this.setData({quantity});this.renderSelection();
  },
  messageInput(e){
    if(this.data.adding||!this.data.messageEnabled)return;
    const cakeMessage=e.detail.value;
    this.setData({cakeMessage,messageCount:Array.from(cakeMessage).length});
  },
  async addToBag(){
    if(this.data.adding||!this._selection||!this._selection.matchedSku)return;
    const sku=this._selection.matchedSku,ticket=this._epoch;
    this.setData({adding:true,selectionNotice:''});
    try{
      const result=await bag.add({productId:this.data.product.productId,productVersion:this._selection.productVersion,
        skuId:sku.skuId,skuVersion:sku.version,unitPriceCents:sku.unitPriceCents,
        selectedOptions:this._selection.selectedOptions,quantity:this.data.quantity,cakeMessage:this.data.cakeMessage});
      if(!this._visible||ticket!==this._epoch)return;
      if(!result||!result.line||result.line.checkoutAllowed!==false||result.addedQuantity!==this.data.quantity)throw new Error();
      const first=this.data.gallery.find(image=>!image.failed);
      this.setData({sheetOpen:false,success:{name:result.line.name,specLabel:result.line.specLabel,
        quantity:result.addedQuantity,thumbnail:first?first.src:''}});
    }catch(error){
      if(!this._visible||ticket!==this._epoch)return;
      this.setData({selectionNotice:error.code==='LOCAL_SELECTION_CHANGED'?'商品规格或价格已变化，请重新加载。':
        error.code==='INVALID_QUANTITY'?'数量不符合当前规格要求。':
        error.code==='INVALID_MESSAGE'?'请检查留言内容和长度。':'保存购物袋失败，请重试。'});
    }finally{if(ticket===this._epoch)this.setData({adding:false});}
  },
  successImageError(){if(this.data.success)this.setData({'success.thumbnail':''});},
  favorite(){if(this.data.product&&!this.data.loading)wx.showToast({title:'收藏功能尚未接通',icon:'none'});},
  back(){if(getCurrentPages().length>1)wx.navigateBack();else this.browse();},
  openBag(){routes.navigate('bag');},
  browse(){routes.navigate('shop');}
});
