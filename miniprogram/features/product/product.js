const routes=require('../../constants/routes');
const detail=require('../../services/product-detail');
const bag=require('../../services/local-bag');
const favorites=require('../../services/local-favorites');
const {measure}=require('../../utils/safe-area');
const {createSpecificationModel}=require('../../utils/specification-model');
const {formatCents}=require('../../services/catalog');
const {STORE_FACTS,presentGroups}=require('../../utils/product-presentation');
const {createLocalOperationId}=require('../../utils/local-operation');
const sheet=require('../../utils/bottom-sheet');
const successMotion=require('./success-motion');
Page({
  data:{product:null,loading:false,error:'',unavailable:false,gallery:[],galleryIndex:0,
    topInset:24,navHeight:44,capsuleWidth:104,heroHeight:460,sheetOpen:false,sheetPhase:'closed',sheetOffset:'100%',sheetDuration:0,sheetMaskOpacity:0,sheetBodyHeight:1,sheetMaxHeight:544,sheetPageTop:0,sheetEasing:'ease-out',groups:[],quantity:1,
    cakeMessage:'',messageCount:0,messageEnabled:false,messageMaxLength:-1,messageHint:'',
    totalLabel:'—',selectionNotice:'',adding:false,addPress:false,success:null,successParticles:[],successBurst:false,successBurstStyle:'',favorited:false,favoriteBusy:false,heartAnimation:'',benefits:STORE_FACTS},
  onLoad(options={}){
    this._productId=typeof options.id==='string'?options.id:'';
    this._model=null;this._selection=null;this._needsReconfirmation=false;this._restoreNotice='';
    this._pendingAdd=null;this._addInFlight=false;
    this.setData({quantity:1,cakeMessage:'',messageCount:0});
    const metrics=measure();
    let heroHeight=460;
    try{const info=wx.getWindowInfo?wx.getWindowInfo():wx.getSystemInfoSync();heroHeight=Math.round(info.windowHeight*0.59);}catch(_){}
    this.setData({...metrics,heroHeight});
    if(typeof wx.setEnableDebug==='function')wx.setEnableDebug({enableDebug:false});
  },
  onShow(){this._visible=true;return this.load();},
  onHide(){this._visible=false;this._epoch=(this._epoch||0)+1;successMotion.dispose(this);this.setData({heartAnimation:''});sheet.dispose(this);},
  onPageScroll(e){if(!this.data.sheetOpen)this._pageScrollTop=e.scrollTop;},
  onUnload(){this.onHide();},
  async load(){
    successMotion.dispose(this);
    sheet.dispose(this,true);
    const ticket=this._epoch=(this._epoch||0)+1;
    this.setData({product:null,gallery:[],galleryIndex:0,loading:true,error:'',unavailable:false,sheetOpen:false,success:null,heartAnimation:'',adding:!!this._addInFlight});
    try{
      const product=await detail.get(this._productId);
      if(ticket!==this._epoch||!this._visible)return;
      if(!product||product.productId!==this._productId||!Array.isArray(product.images)||
          !Array.isArray(product.variantLabels)||product.canPurchase!==false||typeof product.canConfigure!=='boolean')throw new Error();
      const previous=this._selection&&this._selection.productId===product.productId?this._selection:null;
      this._model=product.configuration?createSpecificationModel(product.configuration):null;
      this._selection=this._model?(previous?this._model.reconcile(previous):this._model.evaluate()):null;
      let quantity=previous?this.data.quantity:1,cakeMessage=previous?this.data.cakeMessage:'';
      const state=this._selection,sku=state&&state.matchedSku,notices=[];
      if(state&&state.notice)notices.push(state.notice);
      if(state&&state.requiresReconfirmation)this._needsReconfirmation=true;
      if(previous&&state&&(previous.messageSupport!==state.messageSupport||
          JSON.stringify(previous.messagePolicy)!==JSON.stringify(state.messagePolicy))){
        this._needsReconfirmation=true;notices.push('留言规则已更新，请检查留言。');
      }
      if(state&&state.messageSupport==='DISABLED'&&cakeMessage){
        cakeMessage='';this._needsReconfirmation=true;notices.push('该商品已不支持留言，原留言已清除。');
      }
      if(sku){
        const lower=sku.minQuantity===null?1:sku.minQuantity;
        const upper=Math.min(sku.maxQuantity===null?Number.MAX_SAFE_INTEGER:sku.maxQuantity,
          sku.unitPriceCents>0?Math.floor(Number.MAX_SAFE_INTEGER/sku.unitPriceCents):Number.MAX_SAFE_INTEGER);
        const adjusted=Math.max(lower,Math.min(quantity,upper));
        if(adjusted!==quantity){quantity=adjusted;this._needsReconfirmation=true;notices.push('数量限制已更新，请确认购买数量。');}
      }
      if(state&&state.messagePolicy&&Array.from(cakeMessage).length>state.messagePolicy.maxLength)
        notices.push('留言超过当前长度限制，请修改后再加入。');
      this._restoreNotice=notices.join(' ');
      const gallery=product.images.map(image=>({...image,failed:false}));
      let favorited=false;
      try{if(product.source==='DEVELOPMENT_EXAMPLE')favorited=favorites.contains(product.productId);}catch(_){}
      this.setData({product,gallery,loading:false,error:'',quantity,cakeMessage,messageCount:Array.from(cakeMessage).length,favorited,favoriteBusy:false});
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
      selectionNotice:this._restoreNotice||state.notice||(this._needsReconfirmation?'商品规格已更新，请重新确认。':''),canDecrease:this.data.quantity>(sku&&sku.minQuantity!==null?sku.minQuantity:1),
      canIncrease:!sku||sku.maxQuantity===null||this.data.quantity<sku.maxQuantity},()=>{
        if(this.data.sheetOpen && !['dragging','preparing','closing'].includes(this.data.sheetPhase)) sheet.layout(this);
      });
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
    if(!this.data.product||this.data.loading||this.data.adding||this._successTransition)return;
    if(this.data.sheetOpen&&this.data.sheetPhase!=='closing')return;
    if(!this._model){wx.showToast({title:'此商品的规格资料尚未接通',icon:'none'});return;}
    successMotion.dispose(this);this.setData({success:null});this.renderSelection();sheet.open(this);
  },
  closeSheet(){sheet.close(this);},
  sheetDragStart(e){sheet.dragStart(this,e);},
  sheetDragMove(e){sheet.dragMove(this,e);},
  sheetDragEnd(e){sheet.dragEnd(this,e);},
  sheetDragCancel(e){sheet.dragEnd(this,e,true);},
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
      this._restoreNotice='';
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
    this._restoreNotice='';this.setData({quantity});this.renderSelection();
  },
  messageInput(e){
    if(this.data.adding||!this.data.messageEnabled)return;
    const cakeMessage=e.detail.value;
    if(typeof cakeMessage!=='string')return;
    this._restoreNotice='';
    this.setData({cakeMessage,messageCount:Array.from(cakeMessage).length});
    this.renderSelection();
  },
  async addToBag(){
    if(this._addInFlight||this.data.adding||!this._selection||!this._selection.matchedSku)return;
    const sku=this._selection.matchedSku,ticket=this._epoch;
    if(this._selection.messagePolicy&&Array.from(this.data.cakeMessage).length>this._selection.messagePolicy.maxLength){
      this.setData({selectionNotice:'留言超过当前长度限制，请修改后再加入。'});return;
    }
    this._addInFlight=true;this.setData({adding:true,selectionNotice:''});
    const feedback=successMotion.press(this);
    try{
      if(this._needsReconfirmation){
        const confirmed=await new Promise(resolve=>wx.showModal({
          title:'确认更新后的商品配置',
          content:(this._restoreNotice||'商品规格或价格已更新。')+' 当前规格：'+sku.description+'，数量：'+this.data.quantity+'，总价：¥'+this.data.totalLabel+'。是否确认？',
          confirmText:'确认加入',cancelText:'再检查',
          success:result=>resolve(result.confirm===true),fail:()=>resolve(false)
        }));
        if(!this._visible||ticket!==this._epoch)return;
        if(!confirmed){successMotion.dispose(this);this.renderSelection();return;}
        this._needsReconfirmation=false;this._restoreNotice='';
      }
      const input={productId:this.data.product.productId,productVersion:this._selection.productVersion,
        skuId:sku.skuId,skuVersion:sku.version,unitPriceCents:sku.unitPriceCents,
        selectedOptions:this._selection.selectedOptions,quantity:this.data.quantity,cakeMessage:this.data.cakeMessage};
      const signature=JSON.stringify(input);
      if(!this._pendingAdd||this._pendingAdd.signature!==signature)
        this._pendingAdd={signature,input:{...input,operationId:createLocalOperationId()}};
      const intent=this._pendingAdd;
      const result=await bag.add(intent.input);
      if(!this._visible||ticket!==this._epoch)return;
      if(!result||!result.line||result.line.checkoutAllowed!==false||result.addedQuantity!==this.data.quantity)throw new Error();
      if(!await feedback||!this._visible||ticket!==this._epoch)return;
      const first=this.data.gallery.find(image=>!image.failed);
      const success={name:result.line.name,specLabel:result.line.specLabel,
        quantity:result.addedQuantity,thumbnail:first?first.src:''};
      this._successTransition=true;
      const showSuccess=()=>{
        if(this._visible&&ticket===this._epoch)successMotion.show(this,success);
      };
      if(this.data.sheetOpen)sheet.close(this,true,{
        duration:280,easing:'cubic-bezier(0.22, 1, 0.36, 1)',onClosed:showSuccess
      });
      else showSuccess();
      if(this._pendingAdd===intent)this._pendingAdd=null;
    }catch(error){
      if(!this._visible||ticket!==this._epoch)return;
      successMotion.dispose(this);
      this.setData({selectionNotice:error.code==='LOCAL_SELECTION_CHANGED'?'商品规格或价格已变化，请重新加载。':
        error.code==='INVALID_QUANTITY'?'数量不符合当前规格要求。':
        error.code==='INVALID_MESSAGE'?'请检查留言内容和长度。':
        error.code==='LOCAL_OPERATION_REUSED'?'本次加购信息已变化，请重新选择。':'保存购物袋失败，请重试。'});
    }finally{this._addInFlight=false;if(this._visible&&!this._successTransition)this.setData({adding:false});}
  },
  successImageError(){if(this.data.success)this.setData({'success.thumbnail':''});},
  async favorite(){
    const product=this.data.product;
    if(!product||this.data.loading||this.data.favoriteBusy)return;
    if(product.source!=='DEVELOPMENT_EXAMPLE'){wx.showToast({title:'此预览商品尚未接通收藏',icon:'none'});return;}
    const ticket=this._epoch;this.setData({favoriteBusy:true});
    try{
      const result=await favorites.set(product.productId,!this.data.favorited);
      if(!this._visible||ticket!==this._epoch)return;
      if(!result||result.scope!=='LOCAL_DEVICE'||typeof result.favorited!=='boolean')throw new Error();
      let heartAnimation='';
      if(result.favorited&&!this.data.favorited){
        this._heartPulse=(this._heartPulse||0)+1;
        heartAnimation=this._heartPulse%2?'heart-pop-a':'heart-pop-b';
      }
      this.setData({favorited:result.favorited,heartAnimation});
      wx.showToast({title:result.favorited?'已保存到本机收藏':'已取消本机收藏',icon:'none'});
    }catch(_){if(this._visible&&ticket===this._epoch){
      this.setData({heartAnimation:''});
      wx.showToast({title:'收藏保存失败，请重试',icon:'none'});
    }}
    finally{if(ticket===this._epoch)this.setData({favoriteBusy:false});}
  },
  back(){if(getCurrentPages().length>1)wx.navigateBack();else this.browse();},
  openBag(){routes.navigate('bag');},
  browse(){routes.navigate('shop');}
});
