'use strict';
// User-provided temporary example. Never a formal catalog, ON_SALE seed or purchase fixture.
const reference = require('./catalog-example-reference.json');
const sizeGroup={groupCode:'SIZE',label:'尺寸',required:true,
  options:[6,8,10].map(size=>({optionCode:'INCH_'+size,label:size+'寸'}))};
function cake(key,name,prices){
  return {key,categoryCode:'CAKE',name,nameSource:'IMAGE',messageDecision:'ENABLED',
    optionGroups:[sizeGroup],variants:[6,8,10].map((size,index)=>({
      key:size+'-inch',description:size+'寸',selectedOptions:[{groupCode:'SIZE',optionCode:'INCH_'+size}],
      unitPriceCents:prices[index]*100,priceSource:'IMAGE'}))};
}
function single(key,categoryCode,name,price,nameSource='IMAGE'){
  return {key,categoryCode,name,nameSource,messageDecision:'DISABLED',optionGroups:[],
    variants:[{key:'single',description:categoryCode==='BREAD'?'开发示例单份（正式规格待确认）':'单个',
      selectedOptions:[],unitPriceCents:price*100,
      priceSource:categoryCode==='BREAD'?'USER_CONFIRMED_DEVELOPMENT_2026-10-03':'IMAGE'}]};
}
module.exports={purpose:'TEMPORARY_DEVELOPMENT_EXAMPLE',reference,products:[
  cake('strawberry-cake','草莓鲜奶蛋糕',[168,238,328]),
  cake('chocolate-cake','黑巧克力蛋糕',[188,258,348]),
  cake('mango-cake','芒果鲜奶蛋糕',[178,248,338]),
  single('strawberry-mini','MINI_CAKE','草莓小蛋糕',36),
  single('chocolate-mini','MINI_CAKE','巧克力小蛋糕',38),
  single('blueberry-mini','MINI_CAKE','蓝莓芝士小蛋糕',42),
  single('croissant-example','BREAD','牛角面包（开发示例）',12,'DESCRIPTIVE_PLACEHOLDER'),
  single('bagel-example','BREAD','贝果（开发示例）',12,'DESCRIPTIVE_PLACEHOLDER'),
  single('sourdough-example','BREAD','欧式面包（开发示例）',12,'DESCRIPTIVE_PLACEHOLDER')
]};