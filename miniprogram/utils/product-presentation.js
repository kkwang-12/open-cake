const {formatCents}=require('../services/catalog');
// User-confirmed store facts. These describe fulfilment, not unverified ingredients or stock.
const STORE_FACTS=[
  {icon:'/assets/icons/product/leaf.svg',title:'门店自取',description:'30 分钟预约'},
  {icon:'/assets/icons/product/cake-slice.svg',title:'门店配送',description:'20 km 范围'},
  {icon:'/assets/icons/product/gift.svg',title:'每日营业',description:'08:00–21:00'}
];
function presentGroups(configuration,state){
  return state.groups.map(group=>({
    ...group,isSize:group.groupCode==='SIZE',options:group.options.map(option=>{
      const candidates=configuration.skus.filter(sku=>sku.selectedOptions.some(pair=>pair.groupCode===group.groupCode&&pair.optionCode===option.optionCode)&&
        state.selectedOptions.filter(pair=>configuration.optionGroups.findIndex(item=>item.groupCode===pair.groupCode)<
          configuration.optionGroups.findIndex(item=>item.groupCode===group.groupCode)).every(pair=>
            sku.selectedOptions.some(value=>value.groupCode===pair.groupCode&&value.optionCode===pair.optionCode)));
      const prices=candidates.map(sku=>sku.unitPriceCents).filter(Number.isSafeInteger);
      return {...option,priceLabel:prices.length?formatCents(Math.min(...prices)):'',servingsLabel:''};
    })
  }));
}
module.exports={STORE_FACTS,presentGroups};
