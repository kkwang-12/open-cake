// Local address data cannot prove range, even if someone inserts coordinates
// or a client-supplied "inRange" flag. No local state enables checkout.
function localDeliveryStatus(selection){
  const common={checkoutAllowed:false,requiresCloudValidation:true};
  if(selection.status==='CHANGED')return {...common,status:'ADDRESS_CHANGED',label:'请重新选择配送地址',
    notice:'所选地址已修改或删除，原配送范围结果不能继续使用。'};
  if(!selection.address)return {...common,status:'ADDRESS_REQUIRED',label:'请选择配送地址',notice:'选择地址后仍需核验位置及配送范围。'};
  return {...common,status:'PENDING_CLOUD_VERIFICATION',label:'配送范围待核验',
    notice:'地址已保存在本机；位置及 20 km 配送范围尚未核验，暂不可配送下单。'};
}
module.exports={localDeliveryStatus};
