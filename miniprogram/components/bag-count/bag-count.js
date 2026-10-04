const bag=require('../../services/local-bag');
Component({
  data:{count:''},
  lifetimes:{attached(){this.refresh();}},
  pageLifetimes:{show(){this.refresh();}},
  methods:{refresh(){
    try{const result=bag.list();this.setData({count:result.quantity>0?(result.quantity>99?'99+':String(result.quantity)):''});}
    catch(_){this.setData({count:''});}
  }}
});
