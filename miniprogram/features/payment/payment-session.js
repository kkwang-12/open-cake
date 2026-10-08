'use strict';
// P05 contract rehearsal only. No cloud adapter, storage, payment invocation or UI.
const counter=value=>Number.isSafeInteger(value)&&value>=0;
const stamp=value=>counter(value)&&value>0&&Number.isFinite(new Date(value).getTime());
const id=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,256}$/.test(value);
const paidOrders=['PAID','ACCEPTED','MAKING','READY','DELIVERING','COMPLETED'];
const clone=value=>JSON.parse(JSON.stringify(value));
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
function fail(code){throw Object.assign(new Error(code),{code});}
const fields=['orderId','version','orderStatus','paymentStatus','refundStatus','currency','totalCents','paidCents',
  'refundedCents','refundReservedCents','paymentDeadlineAt','activePaymentState'];
function normalizeState(source,orderId){
  if(!source||typeof source!=='object'||Array.isArray(source)||Object.keys(source).length!==fields.length||
      fields.some(field=>!Object.prototype.hasOwnProperty.call(source,field))||source.orderId!==orderId||
      !counter(source.version)||!stamp(source.paymentDeadlineAt)||source.currency!=='CNY'||
      !counter(source.totalCents)||source.totalCents===0||
      !['paidCents','refundedCents','refundReservedCents'].every(field=>counter(source[field]))||
      !['PENDING_PAYMENT','CANCELLED',...paidOrders].includes(source.orderStatus)||
      !['UNPAID','PENDING','PAID','CLOSED','EXCEPTION'].includes(source.paymentStatus)||
      !['NONE','PENDING','FAILED','SUCCEEDED'].includes(source.refundStatus)||
      !['NONE','PENDING','UNKNOWN','CLOSED'].includes(source.activePaymentState))fail('INVALID_PAYMENT_RESPONSE');
  const refund=source.refundedCents+source.refundReservedCents;
  if(!counter(refund)||refund>source.paidCents||source.paidCents>source.totalCents||
      (source.paymentStatus==='PAID'?source.paidCents!==source.totalCents:source.paidCents!==0)||
      (paidOrders.includes(source.orderStatus)&&source.paymentStatus!=='PAID')||
      (source.orderStatus==='PENDING_PAYMENT'&&source.paidCents!==0)||
      (source.orderStatus==='CANCELLED'&&['PENDING','EXCEPTION'].includes(source.paymentStatus))||
      (source.refundStatus==='NONE'&&refund!==0)||
      (['PENDING','FAILED'].includes(source.refundStatus)&&source.refundReservedCents===0)||
      (source.refundStatus==='SUCCEEDED'&&(source.refundedCents===0||source.refundReservedCents!==0)))fail('INVALID_PAYMENT_RESPONSE');
  return Object.fromEntries(fields.map(field=>[field,source[field]]));
}
function paymentAvailability(){return freeze({connected:false,callable:false,paymentAllowed:false,successPageAllowed:false,
  blockers:['CLOUD_PAYMENT_NOT_CONNECTED','PAYMENT_SOURCE_NOT_VERIFIED','REAL_DEVICE_PAYMENT_NOT_ACCEPTED']});}
function createPaymentSession(orderId,keyFactory){
  if(!id(orderId)||typeof keyFactory!=='function')fail('INVALID_PAYMENT_SESSION');
  let generation=0,pending=null,last=null,status='EMPTY',notice='',deadlineReached=false,closedIntentObserved=false;
  // Volatile only. Real integration must persist/account-scope requests before sending.
  const keys=new Map();
  const view=()=>freeze({scope:'OFFLINE_PAYMENT_SESSION',orderId,status,notice,
    summary:last&&!['EMPTY','CONFIRMING','PREPARING'].includes(status)?clone(last):null,...paymentAvailability()});
  const plan=(action,payload,ticket)=>freeze({scope:'OFFLINE_PAYMENT_REQUEST_PLAN',ticket,
    request:{domain:'payment',event:{action,payload}},callable:false,paymentAllowed:false});
  function beginRecovery(){
    generation++;pending={kind:'READ',ticket:generation};status='CONFIRMING';notice='付款结果正在确认，请稍后刷新。';
    return plan('state.get',{orderId},generation);
  }
  function receiveState(ticket,source,now){
    if(!pending||pending.kind!=='READ'||pending.ticket!==ticket)return false;
    if(!stamp(now))fail('INVALID_PAYMENT_SESSION');
    pending=null;
    try{
      const next=normalizeState(source,orderId);
      // Intent observations may change without an order-version increment.
      const orderFacts=value=>JSON.stringify(fields.filter(field=>field!=='activePaymentState').map(field=>value[field]));
      if(last&&(next.version<last.version||(next.version===last.version&&orderFacts(next)!==orderFacts(last))||
          next.totalCents!==last.totalCents||next.paymentDeadlineAt!==last.paymentDeadlineAt||
          (last.paymentStatus==='PAID'&&next.paymentStatus!=='PAID')||
          (last.paymentStatus==='CLOSED'&&['UNPAID','PENDING'].includes(next.paymentStatus))||
          (['CANCELLED','COMPLETED'].includes(last.orderStatus)&&next.orderStatus!==last.orderStatus)||
          (closedIntentObserved&&next.paymentStatus==='UNPAID'&&next.activePaymentState==='NONE')||
          next.refundedCents<last.refundedCents))
        fail('PAYMENT_STATE_CHANGED');
      if(now>=next.paymentDeadlineAt)deadlineReached=true;
      if(next.activePaymentState==='CLOSED'||next.paymentStatus==='CLOSED')closedIntentObserved=true;
      last=freeze(next);notice='';
      const uncertain=['PENDING','EXCEPTION'].includes(next.paymentStatus)||['PENDING','UNKNOWN'].includes(next.activePaymentState);
      if(uncertain){status='CONFIRMING';notice='付款结果尚未确认，请刷新订单状态。';}
      else if(next.orderStatus==='CANCELLED'||next.refundStatus!=='NONE'){status='ORDER_ATTENTION';notice='请查看订单及退款状态。';}
      else if(next.paymentStatus==='PAID')status='PAID_REPORTED';
      else if(next.paymentStatus==='CLOSED'||next.activePaymentState==='CLOSED'){status='CLOSED';notice='付款单已关闭，请查看订单。';}
      else if(deadlineReached){status='DEADLINE_REACHED';notice='付款时间已到，请刷新订单确认处理结果。';}
      else if(next.orderStatus==='PENDING_PAYMENT'&&next.paymentStatus==='UNPAID'&&next.activePaymentState==='NONE')status='READY_TO_REQUEST';
      else fail('INVALID_PAYMENT_RESPONSE');
    }catch(_){status='CONFIRMING';notice='付款状态需要重新核验，请刷新订单。';}
    return true;
  }
  function failed(ticket){
    if(!pending||pending.ticket!==ticket)return false;
    pending=null;status='CONFIRMING';notice='付款结果暂时无法确认，请刷新订单。';return true;
  }
  function beginCreate(now){
    if(!stamp(now))fail('INVALID_PAYMENT_SESSION');
    if(pending||status!=='READY_TO_REQUEST'||!last)fail('PAYMENT_RECHECK_REQUIRED');
    if(deadlineReached||now>=last.paymentDeadlineAt){deadlineReached=true;status='DEADLINE_REACHED';fail('PAYMENT_DEADLINE_EXPIRED');}
    let key=keys.get(last.version);
    if(!key){
      key=keyFactory();
      if(typeof key!=='string'||!/^[A-Za-z0-9_-]{16,128}$/.test(key)||[...keys.values()].includes(key))fail('INVALID_PAYMENT_KEY');
      keys.set(last.version,key);
    }
    generation++;pending={kind:'CREATE',ticket:generation};status='PREPARING';notice='正在核验付款会话。';
    return plan('create',{orderId,expectedVersion:last.version,idempotencyKey:key},generation);
  }
  // Even a successful prepay/client callback is NOT evidence of paid funds.
  function createFinished(ticket){
    if(!pending||pending.kind!=='CREATE'||pending.ticket!==ticket)return null;
    return beginRecovery();
  }
  function clientReturned(){return beginRecovery();}
  function invalidate(){generation++;pending=null;status='CONFIRMING';notice='返回后请刷新付款结果。';return view();}
  function current(now){
    if(!stamp(now))fail('INVALID_PAYMENT_SESSION');
    if(status==='READY_TO_REQUEST'&&last&&now>=last.paymentDeadlineAt){deadlineReached=true;status='DEADLINE_REACHED';notice='付款时间已到，请刷新订单确认处理结果。';}
    return view();
  }
  return {beginRecovery,receiveState,failed,beginCreate,createFinished,clientReturned,invalidate,current};
}
module.exports={createPaymentSession,paymentAvailability,normalizeState};
