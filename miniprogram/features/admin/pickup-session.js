'use strict';
// A03 contract rehearsal only: no Page wiring, wx API, storage or network.
// Raw credentials are private volatile data; only explicit request plans contain them.
const clone=value=>JSON.parse(JSON.stringify(value));
const counter=value=>Number.isSafeInteger(value)&&value>=0;
const stamp=value=>counter(value)&&value>0&&Number.isFinite(new Date(value).getTime());
const id=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,256}$/.test(value);
const text=value=>typeof value==='string'&&value.length>0&&value.length<=256&&!/[\u0000-\u001f\u007f]/.test(value);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
function fail(code){throw Object.assign(new Error(code),{code});}
function exact(value,fields){return plain(value)&&Object.keys(value).length===fields.length&&fields.every(field=>Object.hasOwn(value,field));}
function pickupAvailability(){return freeze({connected:false,callable:false,confirmationAllowed:false,fulfillmentAllowed:false,
  successFeedbackAllowed:false,blockers:['ADMIN_CLOUD_NOT_CONNECTED','PICKUP_POLICY_NOT_PUBLISHED','REAL_DEVICE_NOT_ACCEPTED']});}
function candidate(orderId,value){
  if(!id(orderId)||typeof value!=='string')fail('INVALID_PICKUP_INPUT');
  // Current O07 HMAC candidate. Never turn public order numbers or short digits into credentials.
  const pickupCredential=value.trim();
  if(!/^[a-f0-9]{64}$/.test(pickupCredential))fail('INVALID_PICKUP_INPUT');
  return {orderId,pickupCredential};
}
function summaryFor(source,orderId,storeId){
  if(!plain(source)||['scope','cloudVerified','callable','operationsAllowed'].some(key=>Object.hasOwn(source,key))||
    source.orderId!==orderId||!id(source.orderId)||!text(source.orderNo)||!counter(source.version)||
    !['PENDING_PAYMENT','PAID','ACCEPTED','MAKING','READY','COMPLETED','CANCELLED'].includes(source.orderStatus)||
    !['UNPAID','PENDING','PAID','CLOSED','EXCEPTION'].includes(source.paymentStatus)||
    !['NONE','PENDING','FAILED','SUCCEEDED'].includes(source.refundStatus)||source.fulfillment!=='PICKUP'||source.address!==null||
    !plain(source.store)||source.store.storeId!==storeId||!text(source.store.name)||!plain(source.contact)||!text(source.contact.name)||
    source.currency!=='CNY'||!counter(source.totalCents)||source.totalCents===0||!counter(source.subtotalCents)||source.deliveryFeeCents!==0||
    source.subtotalCents!==source.totalCents||!counter(source.paidCents)||
    source.paidCents>source.totalCents||!counter(source.refundedCents)||source.refundedCents>source.paidCents||
    (source.paymentStatus==='PAID'?source.paidCents!==source.totalCents:source.paidCents!==0)||
    (['PAID','ACCEPTED','MAKING','READY','COMPLETED'].includes(source.orderStatus)&&source.paymentStatus!=='PAID')||
    (source.orderStatus==='COMPLETED'?!stamp(source.completedAt):source.completedAt!==null)||
    !plain(source.appointment)||source.appointment.fulfillment!=='PICKUP'||source.appointment.windowNature!=='PICKUP'||
    source.appointment.timeZone!=='Asia/Shanghai'||!stamp(source.appointment.startAt)||!stamp(source.appointment.endAt)||
    source.appointment.endAt-source.appointment.startAt!==1800000||
    source.appointment.serviceDate!==new Date(source.appointment.startAt+8*3600000).toISOString().slice(0,10)||
    !Array.isArray(source.items)||source.items.length===0||source.items.length>100||
    source.items.some(item=>!plain(item)||!id(item.productId)||!id(item.skuId)||!text(item.productName)||!text(item.skuDescription)||
      !counter(item.quantity)||item.quantity<1||!counter(item.unitPriceCents)||item.unitPriceCents===0||
      !counter(item.unitPriceCents*item.quantity)||item.lineTotalCents!==item.unitPriceCents*item.quantity)||
    !Array.isArray(source.availableActions)||
    (source.cancellationSummary!==null&&(!plain(source.cancellationSummary)||!['PENDING','APPROVED','REJECTED'].includes(source.cancellationSummary.status))))
    fail('INVALID_PICKUP_RESPONSE');
  let quantity=0,subtotal=0;
  for(const item of source.items){quantity+=item.quantity;subtotal+=item.lineTotalCents;
    if(!counter(quantity)||!counter(subtotal))fail('INVALID_PICKUP_RESPONSE');}
  if(subtotal!==source.subtotalCents)fail('INVALID_PICKUP_RESPONSE');
  return {orderId,orderNo:source.orderNo,version:source.version,orderStatus:source.orderStatus,paymentStatus:source.paymentStatus,
    refundStatus:source.refundStatus,totalCents:source.totalCents,paidCents:source.paidCents,refundedCents:source.refundedCents,
    completedAt:source.completedAt,store:{storeId,name:source.store.name},contactName:source.contact.name,
    appointment:{serviceDate:source.appointment.serviceDate,timeZone:'Asia/Shanghai',startAt:source.appointment.startAt,endAt:source.appointment.endAt},
    items:source.items.map(item=>({productId:item.productId,skuId:item.skuId,productName:item.productName,skuDescription:item.skuDescription,
      quantity:item.quantity,unitPriceCents:item.unitPriceCents,lineTotalCents:item.lineTotalCents})),
    quantity,cancellationPending:source.cancellationSummary?.status==='PENDING',
    pickupActionPresent:source.availableActions.some(action=>action?.action==='admin.order.transition'&&action.command==='COMPLETE_PICKUP')};
}
const facts=value=>JSON.stringify([value.orderId,value.orderNo,value.store,value.contactName,value.appointment,value.items,value.totalCents]);
function createPickupSession({storeId,subjectId,policy,keyFactory,decodeScan=null}){
  if(!id(storeId)||!id(subjectId)||typeof keyFactory!=='function'||!plain(policy)||!id(policy.version)||policy.format!=='OPAQUE_TOKEN'||
    (decodeScan!==null&&typeof decodeScan!=='function'))fail('CONFIGURATION_REQUIRED');
  let generation=0,pending=null,input=null,last=null,command=null,status='EMPTY',notice='',destroyed=false;
  const usedKeys=new Set();
  const active=()=>{if(destroyed)fail('PICKUP_SESSION_CLOSED');};
  // Local identity token, never a network field. A new instance cannot accept an old callback.
  const ticket=()=>freeze({generation:++generation});
  const view=()=>freeze({scope:'OFFLINE_PICKUP_SESSION',storeId,subjectId,status,notice,summary:last?clone(last):null,
    resultPending:command!==null,retryOriginalAvailable:!!command&&!command.result&&!pending,
    rehearsalConfirmationReady:status==='AWAITING_CONFIRMATION',...pickupAvailability()});
  const plan=(action,payload,ticket)=>freeze({scope:'OFFLINE_PICKUP_REQUEST_PLAN',ticket,
    request:{domain:'admin',event:{action,payload}},...pickupAvailability()});
  function read(){
    active();if(pending?.kind==='COMMAND')fail('PICKUP_RESULT_PENDING');
    const orderId=command?.payload.orderId||input?.orderId||last?.orderId;if(!orderId)fail('PICKUP_INPUT_REQUIRED');
    pending={kind:'READ',ticket:ticket()};status=command?'RESULT_PENDING':'LOADING';notice='正在核验订单。';
    return plan('order.get',{orderId},pending.ticket);
  }
  function clearInput(){generation++;pending=null;input=null;last=null;status='EMPTY';notice='';}
  function beginManual(orderId,value){
    active();if(command)fail('PICKUP_RESULT_PENDING');clearInput();input=candidate(orderId,value);return read();
  }
  function beginScan(raw){
    active();if(command)fail('PICKUP_RESULT_PENDING');clearInput();
    if(decodeScan===null)fail('CONFIGURATION_REQUIRED');
    try{
      if(typeof raw!=='string'||raw.length===0||raw.length>4096)fail('INVALID_PICKUP_SCAN');
      const decoded=decodeScan(raw);
      if(!exact(decoded,['orderId','pickupCredential']))fail('INVALID_PICKUP_SCAN');
      input=candidate(decoded.orderId,decoded.pickupCredential);
    }catch(_){input=null;fail('INVALID_PICKUP_SCAN');}
    return read();
  }
  function receiveDetail(ticket,source){
    active();if(!pending||pending.kind!=='READ'||pending.ticket!==ticket)return false;
    const orderId=command?.payload.orderId||input?.orderId||last?.orderId;pending=null;
    try{
      const next=summaryFor(source,orderId,storeId);
      const progress=['PENDING_PAYMENT','PAID','ACCEPTED','MAKING','READY','COMPLETED'];
      if(last&&(next.version<last.version||facts(next)!==facts(last)||next.refundedCents<last.refundedCents||
        (last.paymentStatus==='PAID'&&next.paymentStatus!=='PAID')||
        (next.orderStatus!=='CANCELLED'&&progress.indexOf(next.orderStatus)<progress.indexOf(last.orderStatus))||
        (next.version===last.version&&JSON.stringify(next)!==JSON.stringify(last))||
        (['CANCELLED','COMPLETED'].includes(last.orderStatus)&&next.orderStatus!==last.orderStatus)))fail('INVALID_PICKUP_RESPONSE');
      last=freeze(next);notice='';
      if(command){
        if(command.result&&next.orderStatus==='COMPLETED'&&next.version>=command.result.version){
          command=null;input=null;status='COMPLETION_REPORTED';notice='订单读取结果为已完成自取。';
        }else{status='RESULT_PENDING';notice='核销结果需要继续确认，请勿换码重复提交。';}
      }else if(next.orderStatus==='COMPLETED'){input=null;status='ALREADY_COMPLETED';notice='该订单已完成自取。';}
      else if(next.orderStatus==='CANCELLED'){input=null;status='CANCELLED';notice='订单已取消，不能核销。';}
      else if(next.refundStatus!=='NONE'||next.refundedCents!==0||next.cancellationPending){input=null;status='REVIEW_REQUIRED';notice='请先处理取消或退款。';}
      else if(next.orderStatus==='READY'&&next.paymentStatus==='PAID'&&next.pickupActionPresent&&input){status='AWAITING_CONFIRMATION';}
      else{status=input?'NOT_READY':'INPUT_REQUIRED';notice=input?'当前订单不可核销。':'请重新输入自提凭证。';}
    }catch(_){status=command?'RESULT_PENDING':'READ_ERROR';notice='订单资料需要重新核验。';}
    return true;
  }
  function confirm(){
    active();if(command||pending||status!=='AWAITING_CONFIRMATION'||!input||!last||!counter(last.version+1))fail('PICKUP_RECHECK_REQUIRED');
    const key=keyFactory();if(typeof key!=='string'||!/^[A-Za-z0-9_-]{16,128}$/.test(key)||usedKeys.has(key))fail('INVALID_PICKUP_KEY');
    usedKeys.add(key);command={payload:{orderId:input.orderId,expectedVersion:last.version,command:'COMPLETE_PICKUP',
      pickupCredential:input.pickupCredential,idempotencyKey:key},result:null};input=null;
    return sendOriginal();
  }
  function sendOriginal(){
    active();if(!command||command.result||pending)fail('PICKUP_RECHECK_REQUIRED');
    pending={kind:'COMMAND',ticket:ticket()};status='SUBMITTING';notice='正在确认核销结果。';
    return plan('order.transition',clone(command.payload),pending.ticket);
  }
  function receiveResult(ticket,source){
    active();if(!pending||pending.kind!=='COMMAND'||pending.ticket!==ticket)return false;
    pending=null;
    if(!exact(source,['entityId','version','errorCode'])||source.entityId!==command.payload.orderId||!counter(source.version)||
      (source.errorCode===null?source.version!==command.payload.expectedVersion+1:
        source.errorCode==='PICKUP_CREDENTIAL_INVALID'?source.version!==command.payload.expectedVersion+1:
          !['PICKUP_CREDENTIAL_LOCKED','PICKUP_CREDENTIAL_RATE_LIMITED'].includes(source.errorCode)||source.version!==command.payload.expectedVersion)){
      status='RESULT_PENDING';notice='核销结果未知，请使用原请求核验。';return true;
    }
    if(source.errorCode!==null){
      const code=source.errorCode;command=null;input=null;status='INPUT_REQUIRED';
      notice={PICKUP_CREDENTIAL_INVALID:'凭证未通过，请核对后重新输入。',PICKUP_CREDENTIAL_LOCKED:'凭证已锁定，请按门店规则处理。',
        PICKUP_CREDENTIAL_RATE_LIMITED:'尝试过于频繁，请稍后重新核验。'}[code];
    }else{command.result=freeze(clone(source));status='RESULT_PENDING';notice='已收到结果，请刷新订单确认。';}
    return true;
  }
  function failed(ticket){
    active();if(!pending||pending.ticket!==ticket)return false;
    pending=null;status=command?'RESULT_PENDING':'READ_ERROR';notice=command?'核销结果未知，请保留原请求重试。':'订单读取失败，请重试。';return true;
  }
  function invalidate(){
    active();generation++;pending=null;input=null;
    if(command){status='RESULT_PENDING';notice='返回后请继续确认原核销请求。';}
    else{last=null;status='EMPTY';notice='';}return view();
  }
  // Account/store changes and disposal must call destroy. Durable encrypted recovery is NOT implemented.
  function destroy(){generation++;pending=null;input=null;last=null;command=null;usedKeys.clear();destroyed=true;status='CLOSED';notice='';return view();}
  return Object.freeze({beginManual,beginScan,refresh:read,receiveDetail,confirm,retryOriginal:sendOriginal,
    receiveResult,failed,invalidate,destroy,current:()=>{active();return view();}});
}
module.exports={createPickupSession,pickupAvailability};
