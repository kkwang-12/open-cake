'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {submissionAvailability,buildOrderRequestPlan}=require('../miniprogram/features/checkout/submission-contract');
const {parseApiRequest}=require('../cloudfunctions/_shared/api-contract');
const {planQuoteCreation,projectQuotePreview,revalidateQuote}=require('../cloudfunctions/_shared/quote-model');
const {setup,clone}=require('./fixtures/quote');
const key='offline-order-request-key';
function confirmation(){return {status:'READY',checkoutAllowed:false,quote:{quoteId:'offline-quote',version:0,expiresAt:2000,status:'ACTIVE',consumedOrderId:null}};}
const code=(fn,value)=>assert.throws(fn,error=>error.code===value);
test('X07 exact order request uses quote ID/version and stable key; client amount/contact/slot are never forwarded',()=>{
  const source=confirmation();source.quote.totalCents=1;source.quote.contact={name:'do not forward'};const before=JSON.stringify(source);
  const plan=buildOrderRequestPlan(source,1000,key),parsed=parseApiRequest(plan.request.domain,plan.request.event);
  assert.deepEqual(parsed.payload,{quoteId:'offline-quote',expectedQuoteVersion:0,idempotencyKey:key});
  assert.equal(JSON.stringify(source),before);assert(Object.isFrozen(plan.request.event.payload));
  assert.equal(plan.callable,false);assert.equal(plan.checkoutAllowed,false);assert.equal(plan.paymentAllowed,false);
});
test('X07 missing/error/expired/consumed/offline confirmations cannot produce a submission request',()=>{
  for(const status of ['EMPTY','LOADING','ERROR','EXPIRED'])code(()=>buildOrderRequestPlan({...confirmation(),status},1000,key),'QUOTE_REQUIRED');
  code(()=>buildOrderRequestPlan(confirmation(),2000,key),'QUOTE_EXPIRED');
  for(const patch of [{status:'CONSUMED'},{consumedOrderId:'order'},{scope:'OFFLINE_QUOTE_PREVIEW'},{version:-1}]){
    const source=confirmation();Object.assign(source.quote,patch);code(()=>buildOrderRequestPlan(source,1000,key),'QUOTE_CHANGED');
  }
  code(()=>buildOrderRequestPlan(confirmation(),1000,'short'),'INVALID_SUBMISSION_INPUT');
});
test('X07 retry preserves the same key for the same confirmed quote; changed versions require server revalidation',()=>{
  const source=confirmation(),a=buildOrderRequestPlan(source,1000,key),b=buildOrderRequestPlan(source,1500,key);
  assert.deepEqual(a.request,b.request);assert.equal(a.retryRule,'REUSE_SAME_KEY_FOR_SAME_QUOTE_VERSION');
  source.quote.version++;assert.equal(buildOrderRequestPlan(source,1500,key).request.event.payload.expectedQuoteVersion,1);
  assert.equal(b.requiresAtomicOrderTransaction,true);assert.equal(b.requiresServerQuoteValidation,true);
});
test('X07 unconnected runtime remains closed; payment handoff is only after persisted order and state.get reconciles uncertain outcomes',()=>{
  const state=submissionAvailability();assert.equal(state.checkoutAllowed,false);assert.equal(state.orderConnected,false);assert.equal(state.paymentConnected,false);
  assert.deepEqual(state.paymentAfterPersistedOrder.fields,['orderId','expectedVersion','idempotencyKey']);
  assert.equal(parseApiRequest('payment',{action:'create',payload:{orderId:'offline-order',expectedVersion:0,idempotencyKey:key}}).contract.status,'PLANNED');
  assert.equal(parseApiRequest('payment',{action:'state.get',payload:{orderId:'offline-order'}}).contract.mutation,false);
});
test('X07 stage evidence has offline pickup/delivery quote paths; amount/address/lead/config changes block old quote',()=>{
  for(const mode of ['PICKUP','DELIVERY']){
    const s=setup(mode),record=planQuoteCreation(s.state,s.event,s.principal,s.context).proposedQuote;
    const summary=projectQuotePreview(record,s.state,s.principal,s.context);assert.equal(summary.totalCents,2000);assert.equal(summary.checkoutAllowed,false);
    revalidateQuote(record,s.state,s.principal,s.context);s.state.configuration.configVersion++;
    code(()=>revalidateQuote(record,s.state,s.principal,s.context),'QUOTE_CHANGED');
  }
  const s=setup('DELIVERY'),record=planQuoteCreation(s.state,s.event,s.principal,s.context).proposedQuote;
  s.state.address.location=null;code(()=>revalidateQuote(record,s.state,s.principal,s.context),'LOCATION_REQUIRED');
  const t=setup(),old=planQuoteCreation(t.state,t.event,t.principal,t.context).proposedQuote;
  t.cat.product.minLeadTimeMinutes=1440;code(()=>revalidateQuote(old,t.state,t.principal,t.context),'APPOINTMENT_UNAVAILABLE');
});
test('X07 server request whitelist still rejects client amounts or payment fields in order.create',()=>{
  const request=buildOrderRequestPlan(confirmation(),1000,key).request.event;
  for(const patch of [{totalCents:1},{paymentSuccess:true},{ownerId:'someone'},{slotId:'slot'},{deliveryFeeCents:0}]){
    const copy=clone(request);Object.assign(copy.payload,patch);code(()=>parseApiRequest('order',copy),'INVALID_REQUEST');
  }
});
