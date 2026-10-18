'use strict';
const {validateCart}=require('./cart-model');
const {requireOwner}=require('./authorization-model');
const {resolveSku,assertQuantity,normalizeCakeMessage}=require('./catalog-model');
function fail(code){throw Object.assign(new Error(code),{code});}
const counter=value=>Number.isSafeInteger(value)&&value>=0;
function exact(value,keys){return value&&typeof value==='object'&&!Array.isArray(value)&&
  Object.keys(value).length===keys.length&&keys.every(key=>Object.prototype.hasOwnProperty.call(value,key));}
// Internal offline planner. catalogs/limits must be server reads in the same
// consistent snapshot as cart; no callable cloud handler is installed here.
function resolveCheckoutSelection(cart,input,principal,catalogs,limits){
  validateCart(cart);requireOwner(principal,cart);
  if(!exact(input,['cartId','expectedVersion','lines'])||input.cartId!==cart._id||!counter(input.expectedVersion)||
    !Array.isArray(input.lines)||!input.lines.length||input.lines.some(line=>
      !exact(line,['lineId','expectedLineVersion'])||typeof line.lineId!=='string'||!counter(line.expectedLineVersion))||
    new Set(input.lines.map(line=>line.lineId)).size!==input.lines.length)fail('INVALID_SELECTION');
  if(input.expectedVersion!==cart.version)fail('VERSION_CONFLICT');
  if(!limits||!Number.isSafeInteger(limits.maxLines)||limits.maxLines<1||cart.lines.length>limits.maxLines)
    fail('CONFIGURATION_REQUIRED');
  if(!Array.isArray(catalogs)||catalogs.some(cat=>!cat||!cat.product)||
    new Set(catalogs.map(cat=>cat.product._id)).size!==catalogs.length)fail('INVALID_CATALOG');
  let subtotalCents=0;
  const lines=input.lines.map(selected=>{
    const line=cart.lines.find(item=>item.lineId===selected.lineId);if(!line)fail('LINE_NOT_FOUND');
    if(line.lineVersion!==selected.expectedLineVersion)fail('VERSION_CONFLICT');
    const cat=catalogs.find(item=>item.product._id===line.productId);
    if(!cat||cat.product.storeId!==cart.storeId)fail('PRODUCT_UNAVAILABLE');
    const storedSku=Array.isArray(cat.skus)&&cat.skus.find(item=>item._id===line.skuId);
    if(!storedSku)fail('SKU_UNAVAILABLE');
    const sku=resolveSku(cat.product,cat.skus,storedSku.selectedOptions,line.skuId);
    assertQuantity(line.quantity,sku,limits.maxQuantityPerLine);
    const message=normalizeCakeMessage(line.cakeMessage,cat.product.messagePolicy);
    const totalCents=sku.unitPriceCents*line.quantity;subtotalCents+=totalCents;
    if(!Number.isSafeInteger(totalCents)||!Number.isSafeInteger(subtotalCents))fail('RESOURCE_OVERFLOW');
    return Object.freeze({lineId:line.lineId,lineVersion:line.lineVersion,productId:line.productId,
      productVersion:cat.product.version,skuId:sku._id,skuVersion:sku.version,quantity:line.quantity,
      cakeMessage:message.cakeMessage,unitPriceCents:sku.unitPriceCents,totalCents});
  });
  return Object.freeze({cartId:cart._id,cartVersion:cart.version,storeId:cart.storeId,
    lines:Object.freeze(lines),subtotalCents,checkoutAllowed:false,stockStatus:'UNKNOWN'});
}
module.exports={resolveCheckoutSelection};
