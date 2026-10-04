const favorites=require('../../services/local-favorites');
const routes=require('../../constants/routes');
Page({
  data:{items:[],loading:false,error:'',removing:''},
  onShow(){this._visible=true;return this.load();},
  onHide(){this._visible=false;this._epoch=(this._epoch||0)+1;},
  onUnload(){this.onHide();},
  async load(){
    const ticket=this._epoch=(this._epoch||0)+1;
    this.setData({items:[],loading:true,error:'',removing:''});
    try{
      const result=await favorites.list();
      if(!this._visible||ticket!==this._epoch)return;
      this.setData({items:result.items,loading:false});
    }catch(_){if(this._visible&&ticket===this._epoch)this.setData({loading:false,error:'收藏加载失败，请重试。'});}
  },
  retry(){if(!this.data.loading)return this.load();},
  select(e){
    const item=this.data.items.find(item=>item.productId===e.detail.id);
    if(item&&item.available)routes.navigate('product',{id:item.productId});
  },
  async remove(e){
    const id=e.currentTarget.dataset.id;
    if(this.data.removing||!this.data.items.some(item=>item.productId===id))return;
    const ticket=this._epoch;this.setData({removing:id,error:''});
    try{
      const result=await favorites.set(id,false);
      if(!this._visible||ticket!==this._epoch)return;
      if(result.favorited!==false)throw new Error();
      this.setData({items:this.data.items.filter(item=>item.productId!==id)});
    }catch(_){if(this._visible&&ticket===this._epoch)this.setData({error:'取消收藏失败，请重试。'});}
    finally{if(ticket===this._epoch)this.setData({removing:''});}
  },
  goShop(){routes.navigate('shop');}
});
