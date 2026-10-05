// Confirmed opening hours alone cannot prove a date or remaining capacity.
function localAppointmentStatus(store,fulfillment,allowed,configurationChanged){
  if(!store||!allowed||configurationChanged||!['PICKUP','DELIVERY'].includes(fulfillment))return null;
  return {status:'CONFIGURATION_PENDING',title:fulfillment==='DELIVERY'?'预计配送时间段':'预约自取时间段',
    notice:'预约规则与剩余名额正在准备中，暂不可选择时间段。',
    ruleLabel:store.slotMinutes+' 分钟 / 段 · '+(fulfillment==='DELIVERY'?'配送':'自取')+'每段最多 '+store.capacities[fulfillment]+' 单',
    slots:[],selectedSlotId:null,checkoutAllowed:false,requiresCloudValidation:true};
}
module.exports={localAppointmentStatus};
