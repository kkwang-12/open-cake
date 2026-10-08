'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {setup,attach,completeConfig,draftOf,clone}=require('./fixtures/merchant-store');
const {setup:orderSetup}=require('./fixtures/merchant-order');
const {createMerchantStoreService}=require('../cloudfunctions/_shared/merchant-store-service');
const {readAppointmentAvailability}=require('../cloudfunctions/_shared/appointment-availability');
const {scopedDocumentId}=require('../cloudfunctions/_shared/idempotency-model');
const rejects=(fn,code)=>assert.rejects(fn,error=>error.code===code);
const state=s=>JSON.stringify(s.db);
const config=s=>s.db.configs[s.db.stores[s.storeId].activeConfigId];
async function saved(s,change=()=>{}){const event=s.event('config.save',{idempotencyKey:'OFFLINE_SAVED_CONFIG_KEY_'+(s.saveCount=(s.saveCount||0)+1)});
  change(event.payload.draft);return (await s.storeService.execute(event,s.member)).result.entityId;}
async function publish(s,id){return s.execute('config.publish',{configId:id});}
function preserve(s){return JSON.stringify({orders:s.db.orders,items:s.db.items,reservations:s.db.reservations,payments:s.db.payments,logs:s.db.logs,quotes:s.db.quotes});}

test('A05 config creation is deterministic DRAFT, new sequence, immutable original, atomic audit/receipt, and replay',async()=>{
  const s=await setup(),event=s.event('config.save'),before=clone(config(s)),result=await s.storeService.execute(event,s.member),id=result.result.entityId;
  assert.equal(s.db.configs[id].status,'DRAFT');assert.equal(s.db.configs[id].version,0);assert.equal(s.db.configs[id].configVersion,before.configVersion+1);
  assert.deepEqual(config(s),before);assert.equal(s.controls.lastWrites,3);const snapshot=state(s);
  assert.equal((await createMerchantStoreService(s.storeOptions).execute(event,s.member)).disposition,'REPLAY');assert.equal(state(s),snapshot);
  const receipt=Object.values(s.db.receipts).find(row=>row.command==='admin.config.save');
  assert.equal(id,scopedDocumentId('merchant-config',[s.context.environment,s.context.appId,s.storeId,receipt._id]));
});
test('A05 draft saves preserve explicit incomplete policies without operational defaults; publication rejects missing fields',async()=>{
  const s=await setup(),event=s.event('config.save');for(const field of ['timePolicy','cartLimits','slotPolicy','quoteTtlMinutes','paymentHoldMinutes'])event.payload.draft[field]=null;
  event.payload.draft.deliveryRules=[];const id=(await s.storeService.execute(event,s.member)).result.entityId;
  assert.equal(s.db.configs[id].timePolicy,null);const before=state(s);await rejects(()=>publish(s,id),'CONFIGURATION_REQUIRED');assert.equal(state(s),before);
});
test('A05 existing draft edits use CAS; published configuration cannot be edited',async()=>{
  const s=await setup(),id=await saved(s);await s.execute('config.save',{configId:id,expectedVersion:0,draft:{...draftOf(s.db.configs[id]),quoteTtlMinutes:9},idempotencyKey:'OFFLINE_DRAFT_EDIT_KEY'});
  assert.equal(s.db.configs[id].version,1);await rejects(()=>s.execute('config.save',{configId:id,expectedVersion:0,idempotencyKey:'OFFLINE_STALE_EDIT_KEY'}),'VERSION_CONFLICT');
  await rejects(()=>s.execute('config.save',{configId:config(s)._id,expectedVersion:0,idempotencyKey:'OFFLINE_PUBLISHED_EDIT_KEY'}),'IMMUTABLE_CONFIG');
});
test('A05 publishing changes active pointer and future slot policy atomically, keeps all counters and original config',async()=>{
  const s=await setup(),original=clone(config(s)),slots=clone(s.db.slots),id=await saved(s,draft=>draft.timePolicy.policyVersion='OFFLINE_NEW_TIME_POLICY');
  const event=s.event('config.publish',{configId:id});await s.storeService.execute(event,s.member);
  assert.equal(s.db.stores[s.storeId].version,1);assert.equal(config(s)._id,id);assert.equal(config(s).status,'PUBLISHED');assert.equal(config(s).version,1);
  assert.deepEqual(s.db.configs[original._id],original);assert.equal(s.controls.lastWrites,6);
  const proof=s.controls.storeFences.at(-1).proofs[0].binding;
  assert.equal(proof.configVersion,config(s).configVersion);assert.equal(proof.configReadVersion,0);assert.equal(proof.proposedConfigVersion,1);
  for(const slot of Object.values(s.db.slots)){assert.equal(slot.policyVersion,'OFFLINE_NEW_TIME_POLICY');assert.equal(slot.version,1);
    for(const field of ['heldUnits','confirmedUnits','consumedUnits','capacityTotal'])assert.equal(slot[field],slots[slot._id][field]);}
  const before=state(s);assert.equal((await s.storeService.execute(event,s.member)).disposition,'REPLAY');assert.equal(state(s),before);
});
test('A05 explicit banned date closes future occupied slots without reset; reopening remains explicit',async()=>{
  const s=await setup(),id=await saved(s,draft=>{draft.timePolicy.policyVersion='OFFLINE_CLOSED_DATE';
    draft.timePolicy.dateOverrides=[{serviceDate:s.serviceDate,fulfillment:'PICKUP',closed:true,windows:[]}];});
  await publish(s,id);assert.equal(s.db.slots[s.slotId].status,'CLOSED');assert.equal(s.db.slots[s.slotId].confirmedUnits,2);
  const delivery=Object.values(s.db.slots).find(slot=>slot.fulfillment==='DELIVERY');assert.equal(delivery.status,'OPEN');assert.equal(delivery.confirmedUnits,1);
  await rejects(()=>s.execute('slot.update',{status:'OPEN'}),'APPOINTMENT_UNAVAILABLE');
  const second=await saved(s,draft=>{draft.timePolicy.policyVersion='OFFLINE_REOPEN_DATE';draft.timePolicy.dateOverrides=[];});
  await s.execute('config.publish',{configId:second,idempotencyKey:'OFFLINE_REOPEN_PUBLISH_KEY'});
  assert.equal(s.db.slots[s.slotId].status,'CLOSED');assert.equal(s.db.slots[s.slotId].policyVersion,'OFFLINE_REOPEN_DATE');
  await s.execute('slot.update',{status:'OPEN',idempotencyKey:'OFFLINE_REOPEN_EXPLICIT_KEY'});assert.equal(s.db.slots[s.slotId].status,'OPEN');
});
test('A05 changed time policy cannot reuse its version; older draft cannot supersede newer publication',async()=>{
  const s=await setup(),id=await saved(s,draft=>draft.timePolicy.minLeadTimeMinutes++),before=state(s);
  await rejects(()=>publish(s,id),'POLICY_VERSION_CONFLICT');assert.equal(state(s),before);
  const a=await setup(),old=await saved(a),newId=(await a.execute('config.save',{idempotencyKey:'OFFLINE_SECOND_CONFIG_KEY'})).result.entityId;
  await publish(a,newId);await rejects(()=>a.execute('config.publish',{configId:old,idempotencyKey:'OFFLINE_OLDER_PUBLISH_KEY'}),'POLICY_VERSION_CONFLICT');
});
test('A05 slot closure preserves held/confirmed/consumed and independent mode; fixed caps and occupation floor',async()=>{
  const s=await setup(),delivery=clone(Object.values(s.db.slots).find(slot=>slot.fulfillment==='DELIVERY'));
  await s.execute('slot.update');assert.equal(s.db.slots[s.slotId].confirmedUnits,2);assert.equal(s.db.slots[s.slotId].capacityTotal,3);
  assert.deepEqual(s.db.slots[delivery._id],delivery);
  await rejects(()=>s.execute('slot.update',{capacityTotal:1,idempotencyKey:'OFFLINE_CAPACITY_LOW_KEY'}),'CAPACITY_BELOW_OCCUPIED');
  await rejects(()=>s.execute('slot.update',{capacityTotal:4,idempotencyKey:'OFFLINE_CAPACITY_HIGH_KEY'}),'INVALID_CONFIG_DRAFT');
  await s.execute('slot.update',{status:'OPEN',idempotencyKey:'OFFLINE_SLOT_REOPEN_KEY'});assert.equal(s.db.slots[s.slotId].status,'OPEN');
});
test('A05 store maintenance versions fields, retains private fields, sanitizes audits and replays',async()=>{
  const s=await setup();s.db.stores[s.storeId].privateNote='KEEP_PRIVATE';const event=s.event('store.update');
  await s.storeService.execute(event,s.member);assert.equal(s.db.stores[s.storeId].name,'离线维护门店');assert.equal(s.db.stores[s.storeId].version,1);
  assert.equal(s.db.stores[s.storeId].privateNote,'KEEP_PRIVATE');assert.equal(s.controls.lastWrites,3);
  const log=Object.values(s.db.audits).find(row=>row.action==='admin.store.update');assert.equal(log.reason,'经核验配置维护');
  assert.ok(!JSON.stringify(log).includes('13800138000'));assert.ok(!JSON.stringify(log).includes('KEEP_PRIVATE'));
  const before=state(s);assert.equal((await s.storeService.execute(event,s.member)).disposition,'REPLAY');assert.equal(state(s),before);
  const view=await s.execute('store.get');assert.equal(view.privateNote,undefined);assert.equal(view.operationsAllowed,false);
});
test('A05 closing store keeps config and resources; reopening needs complete validated current policies',async()=>{
  const s=await setup(),slots=clone(s.db.slots),original=clone(config(s));await s.execute('store.update',{patch:{status:'CLOSED'}});
  assert.deepEqual(s.db.slots,slots);assert.deepEqual(config(s),original);await rejects(()=>s.execute('slot.update',{status:'OPEN'}),'APPOINTMENT_UNAVAILABLE');
  s.controls.policyAccepted=false;await rejects(()=>s.execute('store.update',{patch:{status:'OPEN'},idempotencyKey:'OFFLINE_REOPEN_STORE_KEY'}),'CONFIGURATION_REQUIRED');
  s.controls.policyAccepted=true;await s.execute('store.update',{patch:{status:'OPEN'},idempotencyKey:'OFFLINE_REOPEN_STORE_KEY'});
  assert.equal(s.db.stores[s.storeId].status,'OPEN');
});
test('A05 map token resolves only through trusted scoped adapter; raw/client/GCJ02 and stale centers are rejected',async()=>{
  const s=await setup();await rejects(()=>s.execute('store.update',{patch:{location:{latitude:31.1498,longitude:117.2886}}}),'INVALID_REQUEST');
  await rejects(()=>s.execute('store.update',{patch:{mapSelectionToken:'UNVERIFIED_TOKEN'}}),'LOCATION_REQUIRED');
  s.controls.mapLocation={...clone(s.db.stores[s.storeId].location),coordinateSystem:'GCJ02'};
  await rejects(()=>s.execute('store.update',{patch:{mapSelectionToken:'OFFLINE_SERVER_MAP_TOKEN'}}),'COORDINATE_SYSTEM_UNSUPPORTED');
  s.controls.mapLocation={...clone(s.db.stores[s.storeId].location),latitude:1};
  await rejects(()=>s.execute('store.update',{patch:{mapSelectionToken:'OFFLINE_SERVER_MAP_TOKEN'}}),'CONFIGURATION_REQUIRED');
  await s.execute('store.update',{patch:{status:'CLOSED',address:'新离线测试地址',mapSelectionToken:'OFFLINE_SERVER_MAP_TOKEN'}});
  assert.equal(s.db.stores[s.storeId].location.latitude,1);assert.equal(s.controls.storeFences.at(-1).proofs[0].binding.subjectId,s.member.subjectId);
});
test('A05 address changes invalidate old point and cannot stay OPEN until new configuration/location passes',async()=>{
  const s=await setup();await rejects(()=>s.execute('store.update',{patch:{address:'不同离线地址'}}),'CONFIGURATION_REQUIRED');
  await s.execute('store.update',{patch:{status:'CLOSED',address:'不同离线地址'}});assert.equal(s.db.stores[s.storeId].location,null);
  await rejects(()=>s.execute('store.update',{patch:{status:'OPEN'},idempotencyKey:'OFFLINE_ADDRESS_REOPEN_KEY'}),'CONFIGURATION_REQUIRED');
});
test('A05 complete shape alone cannot approve publication: location/policy/phone verification must succeed',async()=>{
  for(const [control,code] of [['locationAccepted','LOCATION_REQUIRED'],['policyAccepted','CONFIGURATION_REQUIRED'],['phoneAccepted','INVALID_REQUEST']]){
    const s=await setup(),id=await saved(s);s.controls[control]=false;const before=state(s);await rejects(()=>publish(s,id),code);assert.equal(state(s),before);
  }
});
test('A05 rejects altered V1 capacities, hours, radius/edge/fee/operator, coordinate system and policy extra fields',async()=>{
  const changes=[d=>d.slotPolicy.capacityPerSlot.PICKUP=4,d=>d.slotPolicy.capacityPerSlot.DELIVERY=2,d=>d.slotPolicy.slotMinutes=15,
    d=>d.timePolicy.weeklyWindows[0].startMinute=510,d=>d.timePolicy.timeZone='UTC',d=>d.deliveryRules[0].area.radiusMeters=20001,
    d=>d.deliveryRules[0].area.boundaryIncluded=false,d=>d.deliveryRules[0].feePolicy.baseFeeCents=1,d=>d.deliveryRules[0].operator='RIDER',
    d=>d.deliveryRules[0].windowNature='EXACT',d=>d.deliveryRules[0].area.center.coordinateSystem='GCJ02',d=>d.extraField='CLIENT'];
  for(const change of changes){const s=await setup(),event=s.event('config.save'),before=state(s);change(event.payload.draft);
    await assert.rejects(()=>s.storeService.execute(event,s.member));assert.equal(state(s),before);}
});
test('A05 rejects invalid time override overlap/date/alignment and negative/overflow policy numbers',async()=>{
  const changes=[d=>d.timePolicy.dateOverrides=[{serviceDate:'2026-02-30',fulfillment:'PICKUP',closed:true,windows:[]}],
    d=>d.timePolicy.dateOverrides=[{serviceDate:'2026-10-07',fulfillment:'PICKUP',closed:false,windows:[{startMinute:481,endMinute:540}]}],
    d=>d.timePolicy.minLeadTimeMinutes=-1,d=>d.timePolicy.maxAdvanceDays=0,d=>d.quoteTtlMinutes=Number.MAX_SAFE_INTEGER,
    d=>d.cartLimits.maxLines=0,d=>d.deliveryRules.push(clone(d.deliveryRules[0]))];
  for(const change of changes){const s=await setup(),event=s.event('config.save');change(event.payload.draft);const before=state(s);
    await assert.rejects(()=>s.storeService.execute(event,s.member));assert.equal(state(s),before);}
});
test('A05 requires current actual A01 CONFIG_WRITE; forged principal, other shop and wrong capability reveal no state',async()=>{
  const s=await setup();await assert.rejects(()=>s.storeService.execute(s.event('store.get'),{...s.member}));
  await rejects(()=>s.execute('store.get',{},s.other),'NOT_FOUND');assert.equal(s.controls.storeReads,0);
  await rejects(()=>s.execute('config.get',{configId:config(s)._id,storeId:'offline-store-b'}),'NOT_FOUND');
  const role=Object.values(s.db.roles).find(row=>row.subjectId===s.member.subjectId);
  await s.service.execute(s.revoke(role._id),s.initial);await rejects(()=>s.execute('store.get'),'NOT_FOUND');assert.equal(s.controls.storeReads,0);
});
test('A05 disabled/version-changed user and incomplete/wrong-scope state are rejected',async()=>{
  for(const change of [s=>s.db.users[s.member.subjectId].status='DISABLED',s=>s.db.users[s.member.subjectId].version++,
    s=>s.controls.storeStatePatch=state=>state.complete=false,s=>s.controls.storeStatePatch=state=>state.environment='OTHER_ENV',
    s=>s.controls.storeStatePatch=state=>state.configs.push(clone(state.configs[0])),s=>s.controls.storeStatePatch=state=>state.slots[0].confirmedUnits=4]){
    const s=await setup();change(s);await assert.rejects(()=>s.execute('store.get'));
  }
});
test('A05 header/current snapshot mismatch and access-store version mismatch fail',async()=>{
  const s=await setup();s.controls.storeStatePatch=state=>state.store.version++;await rejects(()=>s.execute('store.get'),'VERSION_CONFLICT');
  const a=await setup();a.controls.storeStatePatch=state=>state.slots[0].version++;await rejects(()=>a.execute('slot.update'),'VERSION_CONFLICT');
});
test('A05 read projections are scoped and paginated; cursors bind actor, grant, scope and content revision',async()=>{
  const s=await setup();await saved(s);const first=await s.execute('configs.list',{pageSize:1});assert.equal(first.items.length,1);assert.equal(first.hasMore,true);
  const second=await s.execute('configs.list',{pageSize:1,cursor:first.nextCursor});assert.equal(second.items.length,1);assert.notEqual(first.items[0]._id,second.items[0]._id);
  await rejects(()=>s.execute('configs.list',{pageSize:1,cursor:first.nextCursor},s.initial),'CURSOR_INVALID');
  await s.execute('config.save',{idempotencyKey:'OFFLINE_CURSOR_CONFIG_KEY'});await rejects(()=>s.execute('configs.list',{cursor:first.nextCursor}),'CURSOR_INVALID');
  const rows=await s.execute('slots.list');assert.equal(rows.items.length,1);assert.equal(rows.items[0].confirmedUnits,2);
  assert.equal((await s.execute('config.get'))._id,config(s)._id);await rejects(()=>s.execute('slots.list',{serviceDate:'2026-02-30'}),'INVALID_SERVICE_DATE');
});
test('A05 original key conflicts on changed content and replay cannot bypass current revoked authority',async()=>{
  const s=await setup(),event=s.event('slot.update');await s.storeService.execute(event,s.member);
  const bad=clone(event);bad.payload.status='OPEN';await rejects(()=>s.storeService.execute(bad,s.member),'IDEMPOTENCY_KEY_REUSED');
  const role=Object.values(s.db.roles).find(row=>row.subjectId===s.member.subjectId);await s.service.execute(s.revoke(role._id),s.initial);
  await rejects(()=>s.storeService.execute(event,s.member),'NOT_FOUND');
});
test('A05 replay rejects corrupted audit/receipt expected versions, target, scope, request and hashes',async()=>{
  const changes=[(r,a)=>r.result.version++, (r,a)=>r.environment='OTHER_ENV',(r,a)=>a.target.afterVersion++,
    (r,a)=>a.changes[0].after='0'.repeat(64),(r,a)=>a.actor.subjectId='OTHER_ACTOR',(r,a)=>a.changes[1].after='0'.repeat(64)];
  for(const change of changes){const s=await setup(),event=s.event('store.update');await s.storeService.execute(event,s.member);
    const receipt=Object.values(s.db.receipts).find(row=>row.command==='admin.store.update'),audit=Object.values(s.db.audits).find(row=>row.action==='admin.store.update');
    change(receipt,audit);await rejects(()=>s.storeService.execute(event,s.member),'INVALID_IDEMPOTENCY_RECORD');}
});
test('A05 every publication write failure / zero affected row rolls back config, pointer, slots, audit and receipt',async()=>{
  for(const control of ['failureAt','zeroAt'])for(let position=1;position<=6;position++){
    const s=await setup(),id=await saved(s,d=>d.timePolicy.policyVersion='OFFLINE_ROLLBACK_POLICY'),before=state(s);s.controls[control]=position;
    await assert.rejects(()=>publish(s,id));assert.equal(state(s),before);
  }
});
test('A05 all simple write failure positions roll back store, draft and slot transactions',async()=>{
  for(const action of ['store.update','config.save','slot.update'])for(const control of ['failureAt','zeroAt'])for(let position=1;position<=3;position++){
    const s=await setup(),before=state(s);s.controls[control]=position;await assert.rejects(()=>s.execute(action));assert.equal(state(s),before);
  }
});
test('A05 serial same-version edits produce one success and one conflict without overwriting',async()=>{
  const s=await setup(),a=s.event('store.update'),b=s.event('store.update',{patch:{name:'另一编辑'},idempotencyKey:'OFFLINE_SECOND_STORE_KEY'});
  const results=await Promise.allSettled([s.storeService.execute(a,s.member),s.storeService.execute(b,s.initial)]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);assert.equal(results.find(result=>result.status==='rejected').reason.code,'VERSION_CONFLICT');
  assert.equal(s.db.stores[s.storeId].version,1);
});
test('A05 full read fences cover roles, policy/slot predicates, negative reads and receipt/audit races at commit',async()=>{
  const changes=[db=>db.users[Object.keys(db.users)[0]].version++,db=>Object.values(db.roles)[0].version++,
    db=>Object.values(db.configs)[0].quoteTtlMinutes++,db=>Object.values(db.slots)[0].heldUnits++,
    db=>db.configs.NEW={_id:'NEW'},db=>db.receipts.NEW={_id:'NEW'},db=>db.audits.NEW={_id:'NEW'}];
  for(const change of changes){const s=await setup(),expectedVersion=s.db.stores[s.storeId].version;s.controls.beforeCommit=change;
    await rejects(()=>s.execute('store.update'),'VERSION_CONFLICT');assert.equal(s.db.stores[s.storeId].version,expectedVersion);}
  const s=await setup();s.controls.fenceFalse=true;await rejects(()=>s.execute('store.get'),'VERSION_CONFLICT');
});
test('A05 invalid or regressing clock cannot commit',async()=>{
  for(const sequence of [[0],[1791240000000,1791239999999],[1791240000000,1791240000000,1791239999999]]){
    const s=await setup(),before=state(s);s.controls.nowSequence=[...sequence];await rejects(()=>s.execute('store.update'),'INVALID_CONFIGURATION');assert.equal(state(s),before);
  }
});
test('A05 actual O03 old quote is rejected after store edit, config switch or slot closure; historical orders stay identical',async()=>{
  for(const action of ['store.update','config.publish','slot.update']){
    const s=await orderSetup(),context=s.context,at=s.controls.now-5000;
    for(const store of Object.values(s.db.stores))Object.assign(store,{schemaVersion:1,createdAt:at,updatedAt:s.controls.now-1});
    const originalConfig=s.db.configs[s.db.stores[s.storeId].activeConfigId];Object.assign(originalConfig,completeConfig(originalConfig,s.storeId,at));
    for(const slot of Object.values(s.db.slots))Object.assign(slot,{schemaVersion:1,createdAt:at,updatedAt:s.controls.now-1});
    const attached=attach(s,context),captured=s.makeQuote({quantity:1}),history=preserve(s),slotId=s.db.quotes[captured.quoteId].facts.appointmentSnapshot.slotId;
    let event;if(action==='store.update')event={action,payload:{storeId:s.storeId,expectedVersion:s.db.stores[s.storeId].version,patch:{name:'另一离线店名'},reason:'维护',idempotencyKey:'OFFLINE_INTEGRATION_STORE_KEY'}};
    else if(action==='slot.update')event={action,payload:{slotId,expectedVersion:s.db.slots[slotId].version,status:'CLOSED',capacityTotal:3,reason:'临时关闭',idempotencyKey:'OFFLINE_INTEGRATION_SLOT_KEY'}};
    else{const draft=draftOf(originalConfig);draft.quoteTtlMinutes=9;const id=(await attached.storeService.execute({action:'config.save',payload:{storeId:s.storeId,draft,idempotencyKey:'OFFLINE_INTEGRATION_CONFIG_KEY'}},s.primary)).result.entityId;
      event={action,payload:{storeId:s.storeId,configId:id,expectedVersion:0,expectedStoreVersion:s.db.stores[s.storeId].version,idempotencyKey:'OFFLINE_INTEGRATION_PUBLISH_KEY'}};}
    await attached.storeService.execute(event,s.primary);await rejects(()=>s.service.execute(captured.event,captured.customer),action==='slot.update'?'SLOT_FULL_OR_CLOSED':'QUOTE_CHANGED');assert.equal(preserve(s),history);
    if(action==='config.publish'){
      const q=s.db.quotes[captured.quoteId],cart=s.db.carts[q.facts.cartSelectionSnapshot.cartId],active=s.db.configs[s.db.stores[s.storeId].activeConfigId];
      const input={storeId:s.storeId,expectedStoreVersion:s.db.stores[s.storeId].version,expectedConfigVersion:active.configVersion,
        fulfillment:'PICKUP',serviceDate:s.db.slots[slotId].serviceDate,selection:{cartId:cart._id,expectedVersion:cart.version,
          lines:cart.lines.map(line=>({lineId:line.lineId,expectedLineVersion:line.lineVersion}))}};
      const availability=readAppointmentAvailability(s.db.stores[s.storeId],active,cart,s.db.catalogs,Object.values(s.db.slots).filter(slot=>slot.fulfillment==='PICKUP'),input,captured.customer,{...s.base.context,now:s.controls.now});
      assert.equal(availability.configVersion,active.configVersion);assert.equal(availability.slots.find(slot=>slot.slotId===slotId).status,'AVAILABLE');
    }
  }
});

test('A05 two drafts reserve distinct monotonic sequence numbers; competing publications cannot both switch pointer',async()=>{
  const s=await setup(),first=await saved(s),second=await saved(s);
  assert.equal(s.db.configs[second].configVersion,s.db.configs[first].configVersion+1);
  const a=s.event('config.publish',{configId:first}),b=s.event('config.publish',{configId:second,idempotencyKey:'OFFLINE_COMPETING_PUBLISH_KEY'});
  const results=await Promise.allSettled([s.storeService.execute(a,s.member),s.storeService.execute(b,s.initial)]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);assert.equal(results.find(result=>result.status==='rejected').reason.code,'VERSION_CONFLICT');
  assert.equal(s.db.stores[s.storeId].activeConfigId,first);assert.equal(s.db.configs[second].status,'DRAFT');
});
test('A05 past slots retain policy/counters on new publication; closed slots never automatically open',async()=>{
  const s=await setup();s.controls.now=s.db.slots[s.slotId].endAt+1;
  for(const slot of Object.values(s.db.slots))slot.status='CLOSED';
  const slots=clone(s.db.slots),id=await saved(s,d=>d.timePolicy.policyVersion='OFFLINE_PAST_POLICY');await publish(s,id);
  assert.deepEqual(s.db.slots,slots);await rejects(()=>s.execute('slot.update',{status:'OPEN'}),'APPOINTMENT_UNAVAILABLE');
});
test('A05 archive is terminal and cannot mutate historical configs or occupied resources',async()=>{
  const s=await setup(),slots=clone(s.db.slots),configs=clone(s.db.configs);
  await s.execute('store.update',{patch:{status:'ARCHIVED'}});assert.deepEqual(s.db.slots,slots);assert.deepEqual(s.db.configs,configs);
  await rejects(()=>s.execute('store.update',{patch:{status:'OPEN'},idempotencyKey:'OFFLINE_UNARCHIVE_STORE_KEY'}),'NOT_FOUND');
});
test('A05 wrong capability cannot read state; missing trusted publication verifier cannot approve operation',async()=>{
  const s=await setup();await s.service.execute(s.revoke(Object.values(s.db.roles).find(row=>row.subjectId===s.member.subjectId)._id),s.initial);
  await s.service.execute(s.grant({capabilities:['CATALOG_WRITE'],idempotencyKey:'OFFLINE_WRONG_CAPABILITY_KEY'}),s.initial);
  await rejects(()=>s.execute('store.get'),'NOT_FOUND');assert.equal(s.controls.storeReads,0);
  const a=await setup(),id=await saved(a),existing=a.controls.extendTransaction;
  a.controls.extendTransaction=parts=>{const tx=existing(parts);delete tx.verifyOperationalPolicies;return tx;};
  const before=state(a);await rejects(()=>publish(a,id),'CONFIGURATION_REQUIRED');assert.equal(state(a),before);
});
test('A05 actual merchant can still prepare a confirmed historical order after its slot is banned',async()=>{
  const s=await orderSetup(),at=s.controls.now-5000;
  for(const store of Object.values(s.db.stores))Object.assign(store,{schemaVersion:1,createdAt:at,updatedAt:s.controls.now-1});
  const active=s.db.configs[s.db.stores[s.storeId].activeConfigId];Object.assign(active,completeConfig(active,s.storeId,at));
  for(const slot of Object.values(s.db.slots))Object.assign(slot,{schemaVersion:1,createdAt:at,updatedAt:s.controls.now-1});
  const {storeService}=attach(s,s.context),slotId=s.db.orders[s.orderId].appointmentSnapshot.slotId;
  await storeService.execute({action:'slot.update',payload:{slotId,expectedVersion:s.db.slots[slotId].version,status:'CLOSED',capacityTotal:3,
    reason:'临时禁约',idempotencyKey:'OFFLINE_HISTORY_SLOT_CLOSE'}},s.primary);
  const facts=clone(s.db.orders[s.orderId].appointmentSnapshot);
  await s.merchantService.execute(s.event('ACCEPT'),s.primary);await s.merchantService.execute(s.event('START_MAKING'),s.primary);
  assert.equal(s.db.orders[s.orderId].orderStatus,'MAKING');assert.deepEqual(s.db.orders[s.orderId].appointmentSnapshot,facts);
  assert.equal(s.db.slots[slotId].status,'CLOSED');assert.equal(s.db.slots[slotId].confirmedUnits,1);
});

test('A05 drafts reject unsafe lead arithmetic or a booking horizon outside supported four-digit calendar even without slots',async()=>{
  for(const change of [d=>d.timePolicy.minLeadTimeMinutes=Number.MAX_SAFE_INTEGER,d=>d.timePolicy.maxAdvanceDays=4000000]){
    const s=await setup();s.db.slots={};const event=s.event('config.save');change(event.payload.draft);const before=state(s);
    await assert.rejects(()=>s.storeService.execute(event,s.member));assert.equal(state(s),before);
  }
});
