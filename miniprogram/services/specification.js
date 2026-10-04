const config=require('../config');
const fixtures=require('../fixtures/specification-development');
const {createError}=require('./errors');
const {createSpecificationModel}=require('../utils/specification-model');
function createSpecificationClient(settings,samples=fixtures){
  async function get(productId){
    if(!['development','test','production'].includes(settings.stage)||!['shell','cloud'].includes(settings.mode))throw createError('INVALID_CONFIGURATION');
    if(settings.stage!=='development'||settings.mode!=='shell')throw createError('CLOUD_NOT_CONFIGURED');
    if(typeof productId!=='string'||!/^development-example-[a-z0-9-]+$/.test(productId))throw createError('INVALID_REQUEST');
    if(!samples||samples.purpose!=='TEMPORARY_DEVELOPMENT_EXAMPLE'||!Array.isArray(samples.items))throw createError('INVALID_RESPONSE');
    const matches=samples.items.filter(item=>item&&item.productId===productId);
    if(matches.length===0)throw createError('PRODUCT_UNAVAILABLE');
    if(matches.length!==1)throw createError('INVALID_RESPONSE');
    try{
      const model=createSpecificationModel(matches[0]),configuration=model.configuration();
      if(configuration.source!=='DEVELOPMENT_EXAMPLE')throw createError('INVALID_RESPONSE');
      return configuration; // Frozen whitelist, with canPurchase=false and explicit unknown configuration.
    }catch(_){throw createError('INVALID_RESPONSE');}
  }
  return {get};
}
module.exports={...createSpecificationClient(config),createSpecificationClient};
