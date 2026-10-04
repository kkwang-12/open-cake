const {createSpecificationModel}=require('./specification-model');
const notices={PRODUCT_UNAVAILABLE:'商品已下架或不存在，可移除。',SKU_INVALID:'原规格已失效，请重新选择。',
  QUANTITY_INVALID:'数量不符合当前规则，请重新选择。',MESSAGE_INVALID:'原留言不符合当前规则，请重新选择。',
  REVIEW_FAILED:'暂无法核验此商品，请重试。'};
function blocked(status){return {reviewStatus:status,reviewNotice:notices[status],canSelect:false,canAdjust:false,
  canAcceptChanges:false,checkoutAllowed:false,stockStatus:'UNKNOWN'};}
function reviewDraftLine(line,configuration){
  if(!configuration||configuration.productId!==line.productId||configuration.source!=='DEVELOPMENT_EXAMPLE'||
    configuration.canPurchase!==false)throw new Error('Invalid review configuration');
  const model=createSpecificationModel(configuration);
  let state;
  try{state=model.evaluate(line.selectedOptions);}catch(_){return blocked('SKU_INVALID');}
  const sku=state.matchedSku;
  if(!sku||sku.skuId!==line.skuId||!Number.isSafeInteger(sku.unitPriceCents)||sku.unitPriceCents<1)return blocked('SKU_INVALID');
  if((sku.minQuantity!==null&&line.quantity<sku.minQuantity)||(sku.maxQuantity!==null&&line.quantity>sku.maxQuantity)||
    !Number.isSafeInteger(sku.unitPriceCents*line.quantity))return blocked('QUANTITY_INVALID');
  if((state.messageSupport==='DISABLED'&&line.cakeMessage)||
    (state.messagePolicy&&Array.from(line.cakeMessage).length>state.messagePolicy.maxLength))return blocked('MESSAGE_INVALID');
  const candidate={productVersion:configuration.version,skuVersion:sku.version,name:configuration.name,
    specLabel:sku.description,unitPriceCents:sku.unitPriceCents,selectedOptions:state.selectedOptions};
  const priceChanged=sku.unitPriceCents!==line.unitPriceCents;
  const changed=priceChanged||candidate.productVersion!==line.productVersion||candidate.skuVersion!==line.skuVersion||
    candidate.name!==line.name||candidate.specLabel!==line.specLabel||
    JSON.stringify(candidate.selectedOptions)!==JSON.stringify(line.selectedOptions);
  return {reviewStatus:priceChanged?'PRICE_CHANGED':changed?'CONFIG_CHANGED':'LOCAL_READY',
    reviewNotice:priceChanged?'价格已变化，确认更新后才能参与结算。':changed?'商品信息已更新，请确认。':'',
    canSelect:!changed,canAdjust:!changed,canAcceptChanges:changed,checkoutAllowed:false,stockStatus:'UNKNOWN',
    currentUnitPriceCents:sku.unitPriceCents,currentTotalCents:sku.unitPriceCents*line.quantity,
    currentName:configuration.name,currentSpecLabel:sku.description,
    reviewToken:JSON.stringify([line.lineId,line.quantity,line.cakeMessage,candidate]),candidate};
}
module.exports={reviewDraftLine,blocked};
