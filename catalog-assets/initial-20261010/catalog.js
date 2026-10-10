'use strict';
// The user adopted the existing names/specifications/prices on 2026-10-10.
// Keep the original development example unchanged as the historical source.
const original=require('../development/catalog-example');
module.exports={
  adoption:{date:'2026-10-10',source:'catalog-assets/development/catalog-example.js',
    reference:original.reference,imageDecision:'USER_APPROVED_AI_REFERENCE',purchasePoliciesApproved:false},
  products:original.products.map(product=>({...product,
    key:product.key.replace(/-example$/,''),name:product.name.replace(/（开发示例）$/,''),
    variants:product.variants.map(variant=>({...variant,
      description:product.categoryCode==='BREAD'?'单份':variant.description}))
  }))
};
