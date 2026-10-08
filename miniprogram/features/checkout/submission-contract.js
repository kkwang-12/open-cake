// X07 target contract preparation only. No order/payment adapter is installed.
const {validText}=require('../shared/contact-draft');
const counter=value=>Number.isSafeInteger(value)&&value>=0;
const stamp=value=>Number.isSafeInteger(value)&&value>0&&Number.isFinite(new Date(value).getTime());
const id=value=>typeof value==='string'&&value.length>0&&value.length<=256&&value===value.trim()&&validText(value);
function fail(code){throw Object.assign(new Error(code),{code});}
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
function submissionAvailability(){
  return freeze({checkoutAllowed:false,orderConnected:false,paymentConnected:false,
    blockers:['CLOUD_QUOTE_NOT_CONNECTED','ATOMIC_ORDER_NOT_CONNECTED','PAYMENT_NOT_CONNECTED'],
    order:{domain:'order',action:'create',fields:['quoteId','expectedQuoteVersion','idempotencyKey']},
    paymentAfterPersistedOrder:{domain:'payment',action:'create',fields:['orderId','expectedVersion','idempotencyKey']},
    paymentReconciliation:{domain:'payment',action:'state.get',fields:['orderId']}});
}
function buildOrderRequestPlan(confirmation,now,idempotencyKey){
  if(!stamp(now))fail('INVALID_SUBMISSION_INPUT');
  if(!confirmation||confirmation.status!=='READY'||!confirmation.quote)fail('QUOTE_REQUIRED');
  const quote=confirmation.quote;
  if(quote.scope!==undefined||!id(quote.quoteId)||!counter(quote.version)||!stamp(quote.expiresAt)||quote.status!=='ACTIVE'||quote.consumedOrderId!==null)fail('QUOTE_CHANGED');
  if(now>=quote.expiresAt)fail('QUOTE_EXPIRED');
  if(typeof idempotencyKey!=='string'||!/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey))fail('INVALID_SUBMISSION_INPUT');
  return freeze({scope:'OFFLINE_ORDER_REQUEST_PLAN',callable:false,checkoutAllowed:false,
    request:{domain:'order',event:{action:'create',payload:{quoteId:quote.quoteId,expectedQuoteVersion:quote.version,idempotencyKey}}},
    requiresServerQuoteValidation:true,requiresAtomicOrderTransaction:true,
    retryRule:'REUSE_SAME_KEY_FOR_SAME_QUOTE_VERSION',paymentAllowed:false});
}
module.exports={submissionAvailability,buildOrderRequestPlan};
