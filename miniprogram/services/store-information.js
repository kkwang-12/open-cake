const config=require('../config');
const reference=require('../fixtures/store-reference');
const clone=value=>JSON.parse(JSON.stringify(value));
function confirmed(){return clone(reference);}
function validate(value){
  if(!value||value.source!=='USER_CONFIRMED_REFERENCE'||!value.referenceId||!value.referenceVersion||
    typeof value.name!=='string'||!value.name||typeof value.address!=='string'||!value.address||
    !(value.phone===null||typeof value.phone==='string'&&value.phone.length>0)||value.timeZone!=='Asia/Shanghai'||
    !['CONFIGURATION_PENDING','CLOSED'].includes(value.status)||typeof value.openingHours!=='string'||
    !Array.isArray(value.fulfillmentModes)||!value.fulfillmentModes.length||
    value.fulfillmentModes.some(mode=>!['PICKUP','DELIVERY'].includes(mode))||new Set(value.fulfillmentModes).size!==value.fulfillmentModes.length||
    value.policyVersion!==reference.policyVersion||value.slotMinutes!==30||!value.capacities||value.capacities.PICKUP!==3||value.capacities.DELIVERY!==1||
    !value.delivery||value.delivery.operator!=='STORE_SELF'||value.delivery.radiusMeters!==20000||value.delivery.boundaryIncluded!==true||
    value.delivery.feeCents!==0||value.delivery.windowNature!=='ESTIMATED')throw Object.assign(new Error(),{code:'INVALID_STORE_REFERENCE'});
  return {...clone(value),checkoutAllowed:false,requiresCloudValidation:true};
}
function createStoreInformationClient(settings,read=confirmed){return {async get(){
  if(settings.stage!=='development'||settings.mode!=='shell')throw Object.assign(new Error(),{code:'CLOUD_NOT_CONFIGURED'});
  return validate(await read());
}};}
module.exports={...createStoreInformationClient(config),confirmed,validate,createStoreInformationClient};
