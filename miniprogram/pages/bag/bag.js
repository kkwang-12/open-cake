const bag=require('../../services/local-bag');
const routes=require('../../constants/routes');
Page({
  data:{lines:[],error:'',loading:false},
  onShow(){return this.load();},
  load(){
    this.setData({loading:true,error:''});
    try{const result=bag.list();this.setData({lines:result.lines,loading:false});}
    catch(_){this.setData({lines:[],loading:false,error:'购物袋读取失败，请重试。'});}
  },
  remove(e){try{bag.remove(e.currentTarget.dataset.id);this.load();}catch(_){this.setData({error:'移除失败，请重试。'});}},
  goShop(){routes.navigate('shop');},
  openProduct(e){routes.navigate('product',{id:e.currentTarget.dataset.id});}
});
