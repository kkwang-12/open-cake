const bag=require('../../services/local-bag');
const catalog=require('../../services/catalog');
const routes=require('../../constants/routes');
const selection=require('../checkout/selection');
const {measure}=require('../../utils/safe-area');
const removalMotion=require('./removal-motion');
Page({
  data:{topInset:24,navHeight:44,capsuleWidth:104,lines:[],lineNodeIds:{},swipeWidth:0,swipingId:'',swipeReset:0,removingId:'',removingIndex:-1,removingHeight:0,removalCollapsing:false,thumbnails:{},imageFailures:{},summaryHeight:240,excludedQuantity:0,error:'',loading:false,busy:false,revision:0,quantity:0,selectedQuantity:0,subtotalLabel:'0'},
  onLoad(){this.setData(measure(wx));},
  onShow(){this._visible=true;this._unloaded=false;return this.load();},
  onHide(){this._visible=false;this._epoch=(this._epoch||0)+1;this.closeSwipes();removalMotion.dispose(this);},
  onUnload(){this._unloaded=true;this.onHide();},
  onResize(){this.closeSwipes();this.measureSwipeWidth();},
  apply(result){
    const lineNodeIds={};this._lineNodeSequence=this._lineNodeSequence||0;
    for(const line of result.lines)lineNodeIds[line.lineId]=this.data.lineNodeIds[line.lineId]||'bag-line-'+(++this._lineNodeSequence);
    this._swipeInProgress=false;this._swipingId='';removalMotion.dispose(this,false);
    this.setData({...result,lineNodeIds,swipingId:'',swipeReset:this.data.swipeReset+1,removingId:'',removingIndex:-1,removingHeight:0,removalCollapsing:false,excludedQuantity:result.quantity-result.selectedQuantity,loading:false,error:''},()=>{this.measureSummary();this.measureSwipeWidth();});
  },
  closeSwipes(){if((this.data.busy||this.data.removingId)&&this._visible)return;this._swipeInProgress=false;this._swipingId='';this.setData({swipingId:'',swipeReset:this.data.swipeReset+1});},
  swipeStarted({id}){
    if(!this._visible||this.data.busy||this.data.loading||!this.data.lines.some(line=>line.lineId===id))return;
    this._swipeInProgress=true;
    this._swipeHapticGiven=false;
    this._swipingId=id;
  },
  swipeThreshold({id}){
    if(!this._visible||this.data.busy||this.data.loading||this._swipingId!==id||this._swipeHapticGiven)return;
    this._swipeHapticGiven=true;
    try{if(typeof wx.vibrateShort==='function')wx.vibrateShort({type:'light',fail(){}});}catch(_){}
  },
  swipeReleased({id,remove}){
    this._swipeInProgress=false;this._swipingId='';this._swipeTapUntil=Date.now()+250;
    if(!this._visible||this.data.busy||this.data.loading||!this.data.lines.some(line=>line.lineId===id)){this.closeSwipes();return;}
    if(remove)return this.remove({currentTarget:{dataset:{id}}});
  },
  consumeSwipeTap(){
    if(Date.now()<(this._swipeTapUntil||0))return true;
    if(this._swipeInProgress||this.data.busy)return true;
    return false;
  },
  lineTap(){if(!this._swipeInProgress)this.closeSwipes();},
  measureSwipeWidth(){
    if(typeof wx.nextTick!=='function'||typeof this.createSelectorQuery!=='function')return;
    const ticket=this._epoch;
    wx.nextTick(()=>{if(!this._visible||ticket!==this._epoch||!this.data.lines.length)return;
      this.createSelectorQuery().select('.bag-line-content').boundingClientRect(rect=>{
        if(this._visible&&ticket===this._epoch&&!this._swipeInProgress&&rect&&rect.width>0)this.setData({swipeWidth:rect.width});
      }).exec();
    });
  },
  measureSummary(){
    if(typeof wx.nextTick!=='function'||typeof this.createSelectorQuery!=='function')return;
    wx.nextTick(()=>{if(!this._visible)return;this.createSelectorQuery().select('.bag-summary').boundingClientRect(rect=>{
      if(this._visible&&rect&&rect.height>0)this.setData({summaryHeight:Math.ceil(rect.height)});
    }).exec();});
  },
  async load(){
    this.closeSwipes();removalMotion.dispose(this);
    const ticket=this._epoch=(this._epoch||0)+1;
    this.setData({loading:true,error:'',selectedQuantity:0,subtotalLabel:'0',allSelected:false});
    try{const result=await bag.reviewAll();if(!this._visible||ticket!==this._epoch)return false;this.apply(result);this.loadThumbnails(ticket);return true;}
    catch(_){if(!this._visible||ticket!==this._epoch)return false;
      this.setData({lines:[],quantity:0,selectedQuantity:0,subtotalLabel:'0',allSelected:false,loading:false,error:'购物袋读取或核验失败，请重试。'});return false;}
  },
  async loadThumbnails(ticket){
    const ids=new Set(this.data.lines.map(line=>line.productId));
    if(!ids.size||typeof catalog.list!=='function')return;
    const thumbnails={},seen=new Set();let cursor=null;
    try{
      do{
        const result=await catalog.list({pageSize:50,cursor});
        if(!this._visible||ticket!==this._epoch)return;
        if(!result||!Array.isArray(result.items))return;
        for(const item of result.items)if(ids.has(item.id))thumbnails[item.id]=typeof item.image==='string'?item.image:'';
        if(!result.hasMore||Object.keys(thumbnails).length===ids.size)break;
        if(typeof result.nextCursor!=='string'||!result.nextCursor||seen.has(result.nextCursor))return;
        cursor=result.nextCursor;seen.add(cursor);
      }while(true);
      if(this._visible&&ticket===this._epoch)this.setData({thumbnails});
    }catch(_){/* Thumbnail failure must not affect cart selection, totals or review. */}
  },
  thumbnailError(e){
    const {id,src}=e.currentTarget.dataset;
    if(typeof id!=='string'||typeof src!=='string')return;
    this.setData({imageFailures:{...this.data.imageFailures,[id]:src}});
  },
  async failed(error){
    const refreshed=await this.load();if(!refreshed)return;
    this.setData({error:error.code==='LOCAL_BAG_CONFLICT'?'购物袋已变化，已刷新，请重新操作。':
      error.code==='INVALID_QUANTITY'?'数量超出可调整范围。':error.code==='LOCAL_SELECTION_CHANGED'?'商品规格或价格已变化，请重新查看商品。':'保存失败，请重试。'});
  },
  async mutate(work){
    if(this.data.busy||this.data.loading)return;
    const ticket=this._epoch;this.setData({busy:true,error:''});
    try{await work();const result=await bag.reviewAll();
      if(this._visible&&ticket===this._epoch)this.apply(result);}
    catch(error){if(this._visible&&ticket===this._epoch)await this.failed(error);}
    finally{if(!this._unloaded)this.setData({busy:false});}
  },
  removeTapped(e){if(this.consumeSwipeTap())return;return this.remove(e);},
  async remove(e){
    if(this.data.busy||this.data.loading||!this._visible)return;
    const id=e.currentTarget.dataset.id;
    if(!this.data.lines.some(line=>line.lineId===id))return;
    const ticket=this._epoch,revision=this.data.revision;
    this.setData({busy:true,error:'',swipingId:''});
    try{
      if(!await removalMotion.play(this,id,ticket)||!this._visible||ticket!==this._epoch)return;
      await bag.remove(id,revision);
      const result=await bag.reviewAll();
      if(this._visible&&ticket===this._epoch)this.apply(result);
    }catch(error){
      if(this._visible&&ticket===this._epoch){removalMotion.dispose(this);this.closeSwipes();await this.failed(error);}
    }finally{if(!this._unloaded)this.setData({busy:false,swipeReset:this.data.swipeReset+1});}
  },
  changeQuantity(e){
    if(this.consumeSwipeTap())return;
    const line=this.data.lines.find(item=>item.lineId===e.currentTarget.dataset.id);
    const delta=Number(e.currentTarget.dataset.delta);if(!line||!line.canAdjust||![1,-1].includes(delta)||line.quantity+delta<1)return;
    return this.mutate(()=>bag.updateQuantity(line.lineId,line.quantity+delta,this.data.revision));
  },
  acceptChanges(e){
    if(this.consumeSwipeTap())return;
    const line=this.data.lines.find(item=>item.lineId===e.currentTarget.dataset.id);
    if(!line||!line.canAcceptChanges)return;
    return this.mutate(async()=>{
      const ticket=this._epoch;
      const confirmed=await new Promise(resolve=>wx.showModal({title:'确认商品更新',
        content:line.currentName+' '+line.currentSpecLabel+'，当前单价 ¥'+line.currentPriceLabel+'，数量 '+line.quantity+'。保留原留言，是否更新本机购物袋？',
        confirmText:'确认更新',cancelText:'再检查',success:result=>resolve(result.confirm===true),fail:()=>resolve(false)}));
      if(!this._visible||ticket!==this._epoch)return;
      if(!confirmed)return;
      return bag.acceptChanges(line.lineId,line.reviewToken,this.data.revision);
    });
  },
  async previewSelected(){
    this.closeSwipes();
    if(this.data.busy||this.data.loading||!this.data.selectedQuantity)return;
    const ticket=this._epoch;this.setData({busy:true,error:''});
    try{
      await selection.prepare(this.data.revision);
      if(this._visible&&ticket===this._epoch)await routes.navigate('checkout');
    }catch(error){if(this._visible&&ticket===this._epoch){
      const refreshed=await this.load();
      if(refreshed)this.setData({error:error.code==='LOCAL_BAG_CONFLICT'||error.code==='LOCAL_SELECTION_CHANGED'?
        '所选商品已变化，请重新选择。':'无法打开所选商品，请重试。'});
    }}finally{if(!this._unloaded)this.setData({busy:false});}
  },
  goShop(){routes.navigate('shop');},
  openProduct(e){if(!this.consumeSwipeTap())routes.navigate('product',{id:e.currentTarget.dataset.id});}
});
