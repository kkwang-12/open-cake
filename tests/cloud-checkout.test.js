'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createCloudCheckoutClient}=require('../miniprogram/features/checkout/cloud-checkout');
const clone=structuredClone;
function setup(){
  const settings={appId:'wx-test',mode:'cloud',stage:'development',cloudEnvironments:{development:'test-env'},checkout:{enabled:true},cart:{storeId:'store'}};
  const storage={},calls=[],slot={slotId:'slot',available:true,startAt:Date.now()+86400000,endAt:Date.now()+88200000};
  const view={scope:'CLOUD_SELECTION_DRAFT',subjectHash:'a'.repeat(16),cartId:'cart',revision:1,lines:[{lineId:'line',lineVersion:2,productId:'product',skuId:'sku',quantity:1,canAdjust:true,currentTotalCents:1234}]};
  const book={subjectHash:view.subjectHash,addresses:[{addressId:'address',receiverName:'测试人',phone:'13800000000'}]};
  let lose=false,next=0,afterQuote=null,afterSlots=null;
  const source={reviewAll:async()=>clone(view)},platform=()=>({getStorageSync:k=>clone(storage[k]||null),setStorageSync:(k,v)=>{storage[k]=clone(v);}});
  const transport={call:async(domain,action,payload)=>{calls.push({domain,action,payload:clone(payload)});
    if(action==='get')return {data:{storeId:'store',status:'OPEN',timeZone:'Asia/Shanghai',fulfillmentModes:['PICKUP','DELIVERY']}};
    if(action==='slots.list'){afterSlots?.();return {data:{storeId:'store',fulfillment:payload.fulfillment,serviceDate:payload.serviceDate,items:[slot,{...slot,slotId:'full',available:false}]}};}
    if(lose){lose=false;throw Object.assign(new Error('LOST'),{code:'CLOUD_CALL_FAILED'});}
    const data={quoteId:'quote',scope:'CLOUD_QUOTE',checkoutAllowed:false,capacityReserved:false,stockReserved:false,totalCents:1234,
      deliveryFeeCents:0,items:[{productId:'product',skuId:'sku',quantity:1,cakeMessage:null,productName:'测试商品',skuDescription:'测试规格',
        unitPriceCents:1234,lineTotalCents:1234,productImage:{sourceKind:'DESIGN_PREVIEW'}}],
      expiresAt:Date.now()+60000,fulfillment:payload.fulfillment,appointment:{startAt:slot.startAt,endAt:slot.endAt}};
    afterQuote?.(data);return {data};}};
  const client=createCloudCheckoutClient(settings,source,platform,transport,{list:async()=>clone(book)},()=> 'quote-client-key-'+(++next));
  const input={fulfillment:'PICKUP',slot,contact:{name:'测试人',phone:'13800000000'},addressId:null};
  return {settings,view,book,calls,storage,slot,client,input,lose:()=>lose=true,afterQuote:fn=>afterQuote=fn,afterSlots:fn=>afterSlots=fn};
}

test('cloud checkout selects native bag versions without importing offline selections or trusting saved amounts',async()=>{
  const f=setup();await f.client.prepare(1);const selected=await f.client.get();assert.equal(selected.subtotalCents,1234);assert.equal(selected.checkoutAllowed,false);
  f.view.revision++;await assert.rejects(f.client.get(),e=>e.code==='LOCAL_SELECTION_CHANGED');
  f.view.revision--;f.view.subjectHash='b'.repeat(16);await assert.rejects(f.client.get(),e=>e.code==='AUTH_REQUIRED');
  const disabled=setup();disabled.settings.checkout.enabled=false;await assert.rejects(disabled.client.prepare(1),e=>e.code==='CLOUD_NOT_CONFIGURED');
});

test('cloud checkout uses real public store/slots and only the same native owners address book',async()=>{
  const f=setup();await f.client.prepare(1);assert.equal((await f.client.getStore()).storeId,'store');
  const slots=await f.client.getSlots('DELIVERY','2026-10-19');assert.equal(slots.length,1);assert.equal(slots[0].slotId,'slot');
  assert.deepEqual(f.calls.find(c=>c.action==='slots.list').payload,{storeId:'store',fulfillment:'DELIVERY',serviceDate:'2026-10-19',productIds:['product']});
  assert.equal((await f.client.getAddresses()).addresses.length,1);f.book.subjectHash='b'.repeat(16);
  await assert.rejects(f.client.getAddresses(),e=>e.code==='AUTH_REQUIRED');
  f.afterSlots(()=>f.view.revision++);await assert.rejects(f.client.getSlots('PICKUP','2026-10-19'),e=>e.code==='LOCAL_SELECTION_CHANGED');
});

test('cloud quote persists the exact intent before transport and reuses its original key after a lost response',async()=>{
  const f=setup();await f.client.prepare(1);f.lose();await assert.rejects(f.client.createQuote(f.input),e=>e.code==='CLOUD_CALL_FAILED');
  const first=f.calls.find(c=>c.action==='quote.create');assert.equal(first.payload.expectedCartVersion,1);assert.deepEqual(first.payload.lines,[{lineId:'line',lineVersion:2}]);
  assert.equal(first.payload.totalCents,undefined);await assert.rejects(f.client.createQuote({...f.input,contact:{name:'另一人',phone:'13800000000'}}),e=>e.code==='BUSY');
  const quote=await f.client.createQuote(f.input);const last=f.calls.filter(c=>c.action==='quote.create').at(-1);assert.deepEqual(last.payload,first.payload);
  assert.equal(quote.totalLabel,'12.34');assert.equal(quote.referenceImages,true);assert.equal(quote.checkoutAllowed,false);
  assert.equal(Object.entries(f.storage).find(([k])=>k.includes(':pending:'))[1],null);
});

test('cloud quote rejects changed account responses, forged amounts/line identity and stale local selection',async()=>{
  for(const mutate of [f=>f.afterQuote(()=>f.view.subjectHash='b'.repeat(16)),f=>f.afterQuote(data=>data.items[0].productId='other'),f=>f.afterQuote(data=>data.totalCents=-1)]){
    const f=setup();await f.client.prepare(1);mutate(f);await assert.rejects(f.client.createQuote(f.input));
  }
  const f=setup();await f.client.prepare(1);f.view.lines[0].lineVersion++;await assert.rejects(f.client.createQuote(f.input),e=>e.code==='LOCAL_SELECTION_CHANGED');assert.equal(f.calls.length,0);
});

test('cloud delivery binds the selected owner address contact and never calls an order/payment action',async()=>{
  const f=setup();await f.client.prepare(1);const quote=await f.client.createQuote({...f.input,fulfillment:'DELIVERY',addressId:'address'});
  assert.equal(quote.deliveryFeeLabel,'0');assert.equal(f.calls.at(-1).payload.addressId,'address');
  await assert.rejects(f.client.createQuote({...f.input,fulfillment:'DELIVERY',addressId:'other'}),e=>e.code==='LOCATION_REQUIRED');
  assert(f.calls.every(c=>c.domain==='checkout'&&c.action==='quote.create'));
});

function page(selection){
  let result;const timers=[];const modules={'./selection':selection,'./confirmation-session':{createConfirmationSession:()=>({invalidate(){}})},
    '../../constants/routes':{navigate(){}},'../../utils/safe-area':{measure:()=>({})}};
  vm.runInNewContext(fs.readFileSync('miniprogram/features/checkout/checkout.js','utf8'),{Page:x=>result=x,require:n=>modules[n]||{},
    wx:{},getCurrentPages:()=>[],Date,Promise,setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){}});
  result.data=clone(result.data);result.setData=patch=>Object.assign(result.data,clone(patch));result._visible=true;result._epoch=1;result.data.cloudMode=true;
  return {instance:result,timers};
}

test('cloud page ignores an older slot response after mode/date changes and late quote responses after hiding',async()=>{
  const resolves=[];const s={getSlots:()=>new Promise(r=>resolves.push(r))};const {instance:p}=page(s);
  p.data.fulfillment='PICKUP';p.data.slotDate='2026-10-19';const first=p.loadCloudSlots();p.data.slotDate='2026-10-20';const second=p.loadCloudSlots();
  resolves[1]([{slotId:'new',label:'10:00'}]);await second;resolves[0]([{slotId:'old',label:'08:00'}]);await first;assert.equal(p.data.slots[0].slotId,'new');
  let finish;s.createQuote=()=>new Promise(r=>finish=r);p.data.slotIndex=0;p.data.pickupContact={name:'测试',phone:'13800000000'};
  const quote=p.verifyCloudQuote();p.onHide();finish({expiresAt:Date.now()+60000});await quote;assert.equal(p.data.quote,null);
});

test('cloud page expires a displayed quote and invalidates it immediately when the chosen time changes',async()=>{
  const s={createQuote:async()=>({expiresAt:Date.now()+60000,totalLabel:'12.34'})};const {instance:p,timers}=page(s);
  p.data.slots=[{slotId:'slot'}];p.data.slotIndex=0;await p.verifyCloudQuote();assert.equal(p.data.quote.totalLabel,'12.34');
  timers[0]();assert.equal(p.data.quote,null);assert.equal(p.data.quoteExpired,true);
  p.data.quote={totalLabel:'old'};p.cloudSlotChanged({detail:{value:'0'}});assert.equal(p.data.quote,null);assert.equal(p.data.checkoutAllowed,false);
});

test('cloud page clears previous owner address options before loading a changed account',async()=>{
  const s={get:async()=>({subjectHash:'new-owner',lines:[{lineId:'new-line'}],quantity:1,subtotalLabel:'12.34'}),
    getStore:async()=>({fulfillmentModes:['PICKUP','DELIVERY']}),getSlots:async()=>[]};
  const {instance:p}=page(s);p._cloudSubject='old-owner';p.data.cloudAddresses=[{receiverName:'OLD_PRIVATE'}];p.data.cloudAddressLabels=['OLD_PRIVATE'];
  p.data.pickupContact={name:'OLD_PRIVATE',phone:'13800000000'};const loading=p.loadCloud();
  assert.deepEqual(p.data.cloudAddresses,[]);assert.deepEqual(p.data.cloudAddressLabels,[]);await loading;
  assert.equal(p.data.pickupContact.name,'');assert(!JSON.stringify(p.data).includes('OLD_PRIVATE'));
});
