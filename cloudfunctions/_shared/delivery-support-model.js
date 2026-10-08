'use strict';
// Derived hint for an already-authorized detail projection, not a callable action.
function deliverySupportFor(facts){
  if(facts.fulfillment!=='DELIVERY')return null;
  const source=facts.storeSnapshot?.phone;
  const phone=typeof source==='string'&&source.trim().length>0?source.trim():null;
  return Object.freeze({provider:'STORE',windowNature:'ESTIMATED',
    message:'配送由门店自行完成，预约时段为预计配送时间。遇到配送问题，请联系门店。',
    contact:Object.freeze({action:'CONTACT_STORE',label:'联系门店',phone,enabled:false,
      blockedReason:phone===null?'CONFIGURATION_REQUIRED':'SERVICE_NOT_CONNECTED'})});
}
module.exports={deliverySupportFor};
