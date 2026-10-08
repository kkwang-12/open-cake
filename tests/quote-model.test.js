'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {planQuoteCreation,revalidateQuote,projectQuotePreview}=require('../cloudfunctions/_shared/quote-model');
const {setup,actor,clone}=require('./fixtures/quote');
const {catalog,cartContext}=require('./fixtures/catalog');
const {planCartCommand}=require('../cloudfunctions/_shared/cart-model');
const code=(fn,expected)=>assert.throws(fn,error=>error.code===expected);
const plan=s=>planQuoteCreation(s.state,s.event,s.principal,s.context);
test('X05 pickup recomputes integer cents, captures facts and proposes atomic persistence without reserving resources',()=>{
  const s=setup(),before=JSON.stringify(s.state),result=plan(s),quote=result.proposedQuote;
  assert.equal(quote.facts.subtotalCents,2000);assert.equal(quote.facts.totalCents,2000);assert.equal(quote.facts.deliveryFeeCents,0);
  assert.equal(quote.facts.addressSnapshot,null);assert.equal(quote.addressVersion,null);assert.equal(quote.facts.deliverySnapshot.evaluationId,null);
  assert.equal(quote.expiresAt,s.context.now+600000);assert.equal(result.capacityReserved,false);assert.equal(result.stockReserved,false);
  assert.equal(result.requiresAtomicPersistence,true);assert.equal(result.checkoutAllowed,false);assert.equal(JSON.stringify(s.state),before);
  assert(Object.isFrozen(quote.facts.items[0]));assert.equal(quote.facts.items[0].productImage.privateMetadata,undefined);
  assert.deepEqual(quote.resourceVersions.map(value=>value.requiredUnits),[2,1]);
});
test('X05 delivery binds verified own address, rule and proposed trace to this quote; fee stays zero',()=>{
  const s=setup('DELIVERY'),result=plan(s),quote=result.proposedQuote;
  assert.equal(quote.facts.totalCents,2000);assert.equal(quote.addressVersion,0);assert.equal(quote.facts.addressSnapshot.addressId,s.state.address._id);
  assert.match(quote.facts.deliverySnapshot.evaluationId,/^[a-f0-9]{64}$/);assert.equal(result.deliveryEvaluation.checkoutAllowed,false);
  assert(result.requiredEffects.includes('SAVE_DELIVERY_EVALUATION_TRACE'));
  assert.equal(revalidateQuote(quote,s.state,s.principal,s.context).checkoutAllowed,false);
  s.event.payload.idempotencyKey='another-offline-key';assert.notEqual(plan(s).proposedQuote.facts.deliverySnapshot.evaluationId,quote.facts.deliverySnapshot.evaluationId);
});
test('X05 request whitelist and owner gate reject forged prices / roles / clock / scope and foreign cart',()=>{
  const s=setup();for(const patch of [{totalCents:1},{unitPriceCents:1},{role:'SYSTEM'},{now:0},{evaluationId:'fake'},{storeId:'other'},{orderNote:null}]){
    code(()=>planQuoteCreation(s.state,{...s.event,payload:{...s.event.payload,...patch}},s.principal,s.context),'INVALID_REQUEST');
  }
  code(()=>planQuoteCreation(s.state,s.event,{...s.principal},s.context),'AUTH_REQUIRED');
  code(()=>planQuoteCreation(s.state,s.event,actor('B'),s.context),'FORBIDDEN');
  code(()=>planQuoteCreation(s.state,{action:'quote.get',payload:{quoteId:'other'}},s.principal,s.context),'INVALID_REQUEST');
});
test('X05 missing TTL / trusted phone / order note / real image / published configuration never produces a quote',()=>{
  for(const mutate of [s=>s.state.configuration.quoteTtlMinutes=null,s=>s.state.configuration.quoteTtlMinutes=0,
    s=>s.context.validatePhone=undefined,s=>s.context.validateOrderNote=undefined,s=>s.context.validateOrderNote=()=>false,
    s=>s.context.verifyProductImage=()=>Promise.resolve(true),s=>s.cat.product.images[0].sourceKind='DESIGN_PREVIEW',
    s=>s.state.configuration.status='DRAFT',s=>s.state.configuration.publishedAt=s.context.now+1]){
    const s=setup();mutate(s);code(()=>plan(s),'CONFIGURATION_REQUIRED');
  }
});
test('X05 unavailable / stale cart, SKU, stock or appointment cannot be priced',()=>{
  for(const [mutate,error] of [[s=>s.state.cart.version++,'VERSION_CONFLICT'],[s=>s.cat.skus[0].status='OFF_SALE','SKU_UNAVAILABLE'],
    [s=>s.state.stocks=[],'RESOURCE_UNAVAILABLE'],[s=>s.state.stocks[0].heldUnits=8,'RESOURCE_UNAVAILABLE'],
    [s=>s.state.slot.heldUnits=3,'SLOT_FULL_OR_CLOSED'],[s=>s.state.slot.status='CLOSED','SLOT_FULL_OR_CLOSED'],[s=>s.state.slot=null,'APPOINTMENT_UNAVAILABLE']]){
    const s=setup();mutate(s);code(()=>plan(s),error);
  }
});
test('X05 delivery requires current owner / exact location verification and cannot accept missing / changed / out-of-range point',()=>{
  for(const [mutate,error] of [[s=>s.state.address.location=null,'LOCATION_REQUIRED'],[s=>s.state.address.ownerId=actor('B').subjectId,'FORBIDDEN'],
    [s=>s.context.verifyLocation=()=>false,'LOCATION_REQUIRED'],[s=>s.state.address.deletedAt=2000,'NOT_FOUND'],
    [s=>{s.state.address.location.latitude=1;s.context.verifyLocation=()=>true;},'DELIVERY_OUT_OF_RANGE']]){
    const s=setup('DELIVERY');mutate(s);code(()=>plan(s),error);
  }
});
test('X05 TTL equality is expired; lead cutoff caps TTL; time advancing invalidates appointment before long TTL',()=>{
  const s=setup(),quote=plan(s).proposedQuote;s.context.now=quote.expiresAt-1;revalidateQuote(quote,s.state,s.principal,s.context);
  s.context.now++;code(()=>revalidateQuote(quote,s.state,s.principal,s.context),'QUOTE_EXPIRED');
  const t=setup();t.state.configuration.quoteTtlMinutes=100000;const capped=plan(t).proposedQuote;
  assert.equal(capped.expiresAt,t.state.slot.startAt-60000*60);t.context.now=capped.expiresAt;code(()=>revalidateQuote(capped,t.state,t.principal,t.context),'QUOTE_EXPIRED');
  const u=setup();u.state.configuration.quoteTtlMinutes=100000;const old=plan(u).proposedQuote;u.cat.product.minLeadTimeMinutes=1440;
  code(()=>revalidateQuote(old,u.state,u.principal,u.context),'APPOINTMENT_UNAVAILABLE');
});
test('X05 repricing creates new current amounts; old quote rejects price / catalog / config / resource changes',()=>{
  for(const mutate of [s=>s.cat.skus[0].unitPriceCents=1200,s=>s.cat.product.version++,s=>s.state.configuration.configVersion++,
    s=>s.state.stocks[0].version++,s=>s.state.slot.version++,s=>s.state.store.phone='0551-11111111']){
    const s=setup(),quote=plan(s).proposedQuote;mutate(s);code(()=>revalidateQuote(quote,s.state,s.principal,s.context),'QUOTE_CHANGED');
  }
  const s=setup(),old=plan(s).proposedQuote;s.cat.skus[0].unitPriceCents=1200;s.event.payload.idempotencyKey='new-confirmation';
  assert.equal(plan(s).proposedQuote.facts.totalCents,2400);assert.equal(old.facts.totalCents,2000);
});
test('X05 existing quote cannot be consumed twice or read by another owner; malformed or altered facts are rejected',()=>{
  const s=setup(),quote=plan(s).proposedQuote;
  code(()=>revalidateQuote(quote,s.state,actor('B'),s.context),'FORBIDDEN');
  for(const mutate of [q=>q.status='CONSUMED',q=>q.consumedOrderId='order',q=>q.facts.totalCents=1,q=>q.facts.cartSelectionSnapshot=null]){
    const q=clone(quote);mutate(q);code(()=>revalidateQuote(q,s.state,s.principal,s.context),'QUOTE_CHANGED');
  }
});
test('X05 idempotency decision replays only scoped same request, rejects changed payload and creates no duplicate proposal',()=>{
  const s=setup(),first=plan(s),receipt={...first.idempotency,status:'SUCCEEDED',result:{entityId:first.proposedQuote._id,version:0,errorCode:null}};
  s.state.receipt=receipt;const replay=plan(s);assert.equal(replay.disposition,'REPLAY');assert.equal(replay.proposedQuote,undefined);
  s.event.payload.contact.name='changed';code(()=>plan(s),'IDEMPOTENCY_KEY_REUSED');
  s.event.payload.contact.name='仅离线联系人';s.state.receipt={...receipt,status:'IN_PROGRESS',result:null};assert.equal(plan(s).disposition,'BUSY');
});
test('X05 public offline preview projects only buyer facts, no resource versions / bag evidence / evaluation / fingerprints',()=>{
  const s=setup('DELIVERY'),quote=plan(s).proposedQuote,preview=projectQuotePreview(quote,s.state,s.principal,s.context);
  assert.equal(preview.totalCents,2000);assert.equal(preview.appointment.windowNature,'ESTIMATED');assert(Object.isFrozen(preview.items[0].selectedOptions));
  for(const field of ['resourceVersions','ownerId','cartSelectionSnapshot','deliverySnapshot','deliveryEvaluation','idempotency'])assert.equal(preview[field],undefined);
  assert.equal(preview.address.location,undefined);assert.equal(preview.items[0].lineId,undefined);assert.equal(preview.checkoutAllowed,false);
});
test('X05 shared stock demand aggregates selected products; unselected rows do not enter quote or amounts',()=>{
  const s=setup(),second=catalog('MINI_CAKE');second.product.images=clone(s.cat.product.images);
  second.skus[0].stockRequirements=[{resourceId:s.state.stocks[0]._id,unitsPerItem:2}];
  s.state.cart=clone(planCartCommand(s.state.cart,'ADD',s.principal,{expectedVersion:s.state.cart.version,skuId:second.skus[0]._id,
    selectedOptions:second.selectedOptions,quantity:2,cakeMessage:null},{...cartContext(second),now:3000,newLineId:'second-line'}).nextCart);
  s.state.catalogs.push(second);s.event.payload.expectedCartVersion=s.state.cart.version;
  assert.equal(plan(s).proposedQuote.facts.items.length,1);
  s.event.payload.lines.push({lineId:'second-line',lineVersion:0});const quote=plan(s).proposedQuote;
  assert.equal(quote.resourceVersions[0].requiredUnits,6);assert.equal(quote.facts.totalCents,4000);
  s.state.stocks[0].heldUnits=4;code(()=>plan(s),'RESOURCE_UNAVAILABLE');
});
test('X05 unsafe integer cents or deadline overflow and old address version cannot reuse quotation',()=>{
  let s=setup();s.cat.skus[0].unitPriceCents=Number.MAX_SAFE_INTEGER;code(()=>plan(s),'RESOURCE_OVERFLOW');
  s=setup();s.state.configuration.quoteTtlMinutes=Number.MAX_SAFE_INTEGER;code(()=>plan(s),'CONFIGURATION_REQUIRED');
  s=setup('DELIVERY');const quote=plan(s).proposedQuote;s.state.address.version++;s.approved[1].entityVersion++;
  code(()=>revalidateQuote(quote,s.state,s.principal,s.context),'QUOTE_CHANGED');
});
