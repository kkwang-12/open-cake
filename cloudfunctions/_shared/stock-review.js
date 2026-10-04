'use strict';
// Read-only offline check over a trusted stock snapshot. Never reserves stock
// or authorizes checkout; the order transaction must revalidate everything.
const {aggregateStockRequirements}=require('./catalog-model');
const {validateResource,ResourceModelError}=require('./resource-model');
function reviewStockDemand(lines,resources){
  const demands=aggregateStockRequirements(lines),storeId=lines[0].sku.storeId;
  if(resources===null)return Object.freeze({stockStatus:'UNKNOWN',checkoutAllowed:false});
  if(!Array.isArray(resources))throw new ResourceModelError('INVALID_RESOURCE');
  const byId=new Map();
  for(const resource of resources){
    validateResource('STOCK',resource);
    if(resource.storeId!==storeId)throw new ResourceModelError('RESOURCE_SCOPE_MISMATCH');
    if(byId.has(resource._id))throw new ResourceModelError('INVALID_RESOURCE');
    byId.set(resource._id,resource);
  }
  let missing=false;
  for(const demand of demands){
    const resource=byId.get(demand.resourceId);
    if(!resource){missing=true;continue;}
    if(resource.status!=='OPEN'||validateResource('STOCK',resource)<demand.requiredUnits)
      return Object.freeze({stockStatus:'INSUFFICIENT',checkoutAllowed:false});
  }
  return Object.freeze({stockStatus:missing?'UNKNOWN':'SUFFICIENT',checkoutAllowed:false});
}
module.exports={reviewStockDemand};
