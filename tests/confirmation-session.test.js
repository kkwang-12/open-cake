'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createConfirmationSession}=require('../miniprogram/features/checkout/confirmation-session');
const {planQuoteCreation,projectQuotePreview}=require('../cloudfunctions/_shared/quote-model');
const {setup,clone}=require('./fixtures/quote');
function fixture(mode='PICKUP'){
  const s=setup(mode),plan=planQuoteCreation(s.state,s.event,s.principal,s.context),offline=projectQuotePreview(plan.proposedQuote,s.state,s.principal,s.context);
  // Contract-shape test response only; stripping offline markers here is NOT a
  // runtime bridge. The application has no quote adapter and cannot do this.
  const {scope,checkoutAllowed,...response}=offline;
  return {...s,response,offline,session:createConfirmationSession()};
}
const begin=s=>s.session.begin(s.event.payload,s.state.store._id,s.context.now);
test('X06 confirmation input copies and freezes; opening a new request drops old quote without mutating input',()=>{
  const s=fixture(),original=JSON.stringify(s.event),a=begin(s);
  assert.equal(s.session.current(s.context.now).status,'LOADING');assert(Object.isFrozen(a.request.lines[0]));
  assert.equal(s.session.receive(a.ticket,s.response,s.context.now),true);assert.equal(s.session.current(s.context.now).status,'READY');
  assert.equal(s.session.current(s.context.now).checkoutAllowed,false);begin(s);assert.equal(s.session.current(s.context.now).quote,null);
  assert.equal(JSON.stringify(s.event),original);
});
test('X06 switching mode invalidates inapplicable response; only latest ticket can populate confirmation',()=>{
  const s=fixture(),old=begin(s),delivery=fixture('DELIVERY');
  const current=s.session.begin(delivery.event.payload,delivery.state.store._id,s.context.now);
  assert.equal(s.session.receive(old.ticket,s.response,s.context.now),false);
  assert.equal(s.session.receive(current.ticket,delivery.response,s.context.now),true);
  const view=s.session.current(s.context.now);assert.equal(view.quote.fulfillment,'DELIVERY');assert.equal(view.quote.appointment.windowNature,'ESTIMATED');
  assert.equal(s.session.receive(current.ticket,delivery.response,s.context.now),false);
});
test('X06 failed / hidden / invalidated requests never resurrect a prior quote or payment success',()=>{
  const s=fixture(),old=begin(s);s.session.invalidate();assert.equal(s.session.receive(old.ticket,s.response,s.context.now),false);
  const current=begin(s);assert.equal(s.session.failed(current.ticket),true);assert.equal(s.session.receive(current.ticket,s.response,s.context.now),false);
  const view=s.session.current(s.context.now);assert.equal(view.quote,null);assert.equal(view.status,'ERROR');assert.equal(view.paymentSuccess,undefined);
  assert.equal(s.session.failed(old.ticket),false);
});
test('X06 exact expiry clears displayed amounts and expired incoming response is rejected',()=>{
  const s=fixture(),a=begin(s);s.session.receive(a.ticket,s.response,s.context.now);assert.equal(s.session.current(s.response.expiresAt-1).status,'READY');
  assert.equal(s.session.current(s.response.expiresAt).status,'EXPIRED');assert.equal(s.session.current(s.response.expiresAt).quote,null);
  const b=begin(s);s.session.receive(b.ticket,s.response,s.response.expiresAt);assert.equal(s.session.current(s.response.expiresAt).status,'ERROR');
});
test('X06 malformed amount, wrong branch/store/contact, consumed quote and offline planner results cannot become confirmation',()=>{
  const s=fixture();for(const patch of [{totalCents:1},{fulfillment:'DELIVERY'},{status:'CONSUMED'},{consumedOrderId:'order'},
    {contact:{name:'other',phone:'13800000000'}},{store:{storeId:'other'}},{scope:'OFFLINE_QUOTE_PREVIEW'}]){
    const a=begin(s);s.session.receive(a.ticket,{...s.response,...patch},s.context.now);assert.equal(s.session.current(s.context.now).quote,null);
  }
  const a=begin(s);s.session.receive(a.ticket,s.offline,s.context.now);assert.equal(s.session.current(s.context.now).status,'ERROR');
});
test('X06 client summary retains separate per-line cake messages, zero fees and validated sums; nested evidence is omitted',()=>{
  const s=fixture('DELIVERY'),a=begin(s),response=clone(s.response);
  response.address.location={longitude:0,latitude:0};response.items[0].lineId='private-line';response.items[0].resourceVersions=['private'];
  response.appointment.slotId='private-slot';s.session.receive(a.ticket,response,s.context.now);
  const view=s.session.current(s.context.now);assert.equal(view.quote.items[0].cakeMessage,'测试留言');assert.equal(view.quote.orderCakeMessage,undefined);
  assert.equal(view.quote.address.location,undefined);assert.equal(view.quote.items[0].lineId,undefined);assert.equal(view.quote.items[0].resourceVersions,undefined);
  assert.equal(view.quote.appointment.slotId,undefined);assert.equal(view.quote.deliveryFeeCents,0);
});
test('X06 invalid begin removes old result; missing address and pickup address are never silently reused',()=>{
  const s=fixture(),a=begin(s);s.session.receive(a.ticket,s.response,s.context.now);
  assert.throws(()=>s.session.begin({...s.event.payload,addressId:'delivery-address'},s.state.store._id,s.context.now),e=>e.code==='INVALID_CONFIRMATION');
  assert.equal(s.session.current(s.context.now).quote,null);
  assert.throws(()=>s.session.begin({...s.event.payload,fulfillment:'DELIVERY'},s.state.store._id,s.context.now),e=>e.code==='INVALID_CONFIRMATION');
  assert.throws(()=>s.session.begin({...s.event.payload,contact:{name:'  ',phone:'13800000000'}},s.state.store._id,s.context.now),e=>e.code==='INVALID_CONFIRMATION');
});
test('X06 wrong appointment length or impossible arithmetic cannot replace totals',()=>{
  const s=fixture();for(const mutate of [q=>q.appointment.endAt++,q=>q.items[0].lineTotalCents++,q=>q.items[0].unitPriceCents=Number.MAX_SAFE_INTEGER,q=>q.deliveryFeeCents=1,
    q=>{q.appointment.startAt=Date.parse('2026-10-06T13:00:00Z');q.appointment.endAt=q.appointment.startAt+1800000;},
    q=>{q.appointment.startAt=Date.parse('2026-10-06T15:45:00Z');q.appointment.endAt=q.appointment.startAt+1800000;}]){
    const a=begin(s),response=clone(s.response);mutate(response);s.session.receive(a.ticket,response,s.context.now);assert.equal(s.session.current(s.context.now).quote,null);
  }
});
