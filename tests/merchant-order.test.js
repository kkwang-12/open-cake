'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { setup, clone } = require('./fixtures/merchant-order');
const { createMerchantOrderService, createMerchantOrderReadService } = require('../cloudfunctions/_shared/merchant-order-service');
const { createOrderReadModel } = require('../cloudfunctions/_shared/order-read-model');
const { PAGE_POLICY } = require('../cloudfunctions/_shared/pagination-model');
const rejects = (work, code) => assert.rejects(work, error => error.code === code);
const order = s => s.db.orders[s.orderId];
const resources = s => JSON.stringify([s.db.stocks, s.db.slots, s.db.reservations]);
const snapshot = s => JSON.stringify(s.db);
const run = (s, command, patch, principal = s.primary) => s.merchantService.execute(s.event(command, patch), principal);
async function made(options) { const s = await setup(options); await run(s, 'ACCEPT'); await run(s, 'START_MAKING'); return s; }
async function ready(options) { const s = await made(options); await run(s, 'MARK_READY'); return s; }

test('A02 pickup/delivery paid order accepts, consumes confirmed stock once and becomes ready with immutable facts', async () => {
  for (const mode of ['PICKUP','DELIVERY']) {
    const s = await setup({ mode }), before = clone(order(s)), payments = clone(s.db.payments), slots = clone(s.db.slots);
    const initial = resources(s), accepted = await run(s, 'ACCEPT');
    assert.equal(accepted.disposition, 'ACCEPTED'); assert.equal(resources(s), initial); assert.equal(s.controls.lastWrites, 3);
    const makeEvent = s.event('START_MAKING'), making = await s.merchantService.execute(makeEvent, s.primary);
    assert.equal(making.disposition, 'MAKING'); assert.equal(s.controls.lastWrites, 5);
    const stockReservation = Object.values(s.db.reservations).find(r => r.resourceKind === 'STOCK');
    assert.equal(stockReservation.status, 'CONSUMED'); assert.equal(stockReservation.resolvedAt, s.controls.now);
    assert.equal(s.db.logs[stockReservation.resolutionLogId].command, 'START_MAKING');
    const consumed = resources(s); assert.equal((await s.merchantService.execute(makeEvent, s.primary)).disposition, 'REPLAY'); assert.equal(resources(s), consumed);
    assert.equal((await run(s, 'MARK_READY')).disposition, 'READY'); assert.equal(resources(s), consumed);
    assert.deepEqual(s.db.slots, slots); assert.deepEqual(s.db.payments, payments);
    for (const field of Object.keys(before).filter(field => !['orderStatus','updatedAt','version'].includes(field))) assert.deepEqual(order(s)[field], before[field], field);
    for (const field of ['cloudVerified','callable','operationsAllowed','externalRefundExecuted']) assert.equal(making[field], false);
  }
});

test('A02 complete pickup chain uses existing O07 credential/HMAC receipt and original key replay', async () => {
  const s = await ready(), issued = await s.pickupService.get({ action: 'pickupCredential.get', payload: { orderId: s.orderId } }, s.owner);
  const event = s.event('COMPLETE_PICKUP', { pickupCredential: issued.credential.value }), before = resources(s);
  const result = await s.merchantService.execute(event, s.primary); assert.equal(result.disposition, 'COMPLETED');
  assert.equal(order(s).orderStatus, 'COMPLETED'); assert.equal(resources(s), before);
  assert.equal((await s.merchantService.execute(event, s.primary)).disposition, 'REPLAY'); assert.equal(resources(s), before);
  const dto = await s.readService.execute(s.readEvent(), s.primary); assert.equal(dto.orderStatus, 'COMPLETED');
  assert(!JSON.stringify(dto).includes(issued.credential.value));
});

test('A02 complete delivery chain reuses O08 and retains confirmed slot without a rider or new resource consumption', async () => {
  const s = await ready({ mode: 'DELIVERY' }), before = resources(s), event = s.event('START_DELIVERY');
  assert.equal((await s.merchantService.execute(event, s.primary)).disposition, 'DELIVERING');
  assert.equal((await s.merchantService.execute(event, s.primary)).disposition, 'REPLAY');
  const complete = s.event('COMPLETE_DELIVERY'); assert.equal((await s.merchantService.execute(complete, s.secondary)).disposition, 'COMPLETED');
  assert.equal((await s.merchantService.execute(complete, s.secondary)).disposition, 'REPLAY');
  assert.equal(resources(s), before); assert.equal((await s.readService.execute(s.readEvent(), s.primary)).orderStatus, 'COMPLETED');
});

test('A02 merchant rejection cancels paid order, releases every confirmed resource and creates one pending full remaining refund', async () => {
  for (const mode of ['PICKUP','DELIVERY']) {
    const s = await setup({ mode }), before = clone(order(s)), payments = clone(s.db.payments), event = s.event('REJECT_ORDER');
    const result = await s.merchantService.execute(event, s.primary), refund = s.db.refunds[result.refundIntentId];
    assert.equal(result.disposition, 'CANCELLED_REFUND_RESERVED'); assert.equal(s.controls.lastWrites, 8);
    assert.equal(order(s).orderStatus, 'CANCELLED'); assert.equal(order(s).refundStatus, 'PENDING');
    assert.equal(order(s).refundReservedCents, before.paidCents); assert.equal(order(s).refundedCents, 0);
    assert.equal(refund.amountCents, before.paidCents); assert.equal(refund.budgetState, 'RESERVED'); assert.equal(refund.status, 'PENDING');
    assert.equal(refund.providerRefundId, null); assert.equal(refund.settledAtPrecisionMs, null);
    assert.equal(s.db.logs[refund.approvalLogId].command, 'REJECT_ORDER');
    assert(Object.values(s.db.reservations).every(r => r.status === 'RELEASED'));
    assert(Object.values(s.db.stocks).every(r => r.confirmedUnits === 0 && r.consumedUnits === 0));
    assert.equal(s.db.slots[before.appointmentSnapshot.slotId].confirmedUnits, 0); assert.deepEqual(s.db.payments, payments);
    const snapshotAfter = snapshot(s); assert.equal((await s.merchantService.execute(event, s.primary)).disposition, 'REPLAY'); assert.equal(snapshot(s), snapshotAfter);
    const dto = await s.readService.execute(s.readEvent(), s.primary); assert.equal(dto.refundSummary.label, '退款处理中');
    assert(!JSON.stringify([s.db.refunds,s.db.logs,s.db.receipts,dto]).includes('13800138000'));
  }
});

test('A02 rejection intent is accepted by P06 prepare/credible result and O06 owner history without reopening cancelled order', async () => {
  const s = await setup(), event = s.event('REJECT_ORDER'), rejected = await s.merchantService.execute(event, s.primary), before = resources(s);
  const prepared = await s.refundService.prepare(rejected.refundIntentId, 'SUBMIT', 'OFFLINE_APPROVED_REFUND', s.invocation);
  assert.equal(prepared.disposition, 'TRANSPORT_REQUIRED'); assert.equal(prepared.externalRefundExecuted, false);
  await s.refundService.acceptResult(s.refundResponse(prepared.attemptId));
  assert.equal(order(s).orderStatus, 'CANCELLED'); assert.equal(order(s).refundStatus, 'SUCCEEDED');
  assert.equal(order(s).refundedCents, order(s).paidCents); assert.equal(order(s).refundReservedCents, 0); assert.equal(resources(s), before);
  const replay = await s.merchantService.execute(event, s.primary); assert.equal(replay.refundIntentId, rejected.refundIntentId);
  const records = { user: s.db.users[s.owner.subjectId], ...s.children(s.db, [order(s)]) };
  const dto = createOrderReadModel(records, s.owner, s.context, s.key).get({ action: 'get', payload: { orderId: s.orderId } }, s.controls.now);
  assert.equal(dto.refundSummary.completedExtent, 'FULL'); assert.equal(dto.orderStatus, 'CANCELLED');
});

test('A02 rejection after settled partial refund reserves only remaining amount; fully refunded order creates no further intent', async () => {
  for (const fraction of [0.25,1]) {
    const s = await setup(), amount = order(s).paidCents * fraction;
    assert(Number.isSafeInteger(amount));
    const approval = s.append('APPROVE_REFUND', { refundStatus: 'PENDING', refundReservedCents: amount });
    const payment = Object.values(s.db.payments)[0], id = 'OFFLINE_EARLIER_REFUND';
    s.db.refunds[id] = { _id: id, schemaVersion: 1, version: 0, createdAt: approval.createdAt, updatedAt: approval.createdAt,
      orderId: s.orderId, paymentId: payment._id, cancellationRequestId: null, approvalLogId: approval._id, approvedBy: approval.actor,
      reason: '隔离历史审批', currency: 'CNY', amountCents: amount, outRefundNo: 'OFFLINE_EARLIER_REFUND_NO', providerRefundId: null,
      status: 'PENDING', budgetState: 'RESERVED', settledAt: null, settledAtPrecisionMs: null, lastEventId: null, lastErrorCode: null };
    s.controls.now += 10;
    const attempt = await s.refundService.prepare(id, 'SUBMIT', 'OFFLINE_EARLIER_REFUND_REQUEST', s.invocation);
    await s.refundService.acceptResult(s.refundResponse(attempt.attemptId));
    const event = s.event('REJECT_ORDER'), result = await s.merchantService.execute(event, s.primary);
    assert.equal(result.disposition, fraction === 1 ? 'CANCELLED_REFUND_ALREADY_SETTLED' : 'CANCELLED_REFUND_RESERVED');
    assert.equal(order(s).refundedCents, amount); assert.equal(order(s).refundReservedCents, order(s).paidCents - amount);
    assert.equal(result.refundIntentId === null, fraction === 1); assert.equal(order(s).orderStatus, 'CANCELLED');
    assert.equal((await s.merchantService.execute(event, s.primary)).disposition, 'REPLAY');
  }
});

test('A02 no caller role, ownership, target status or arbitrary paid data can authorize a merchant command', async () => {
  const s = await setup(), before = snapshot(s);
  await rejects(() => run(s, 'ACCEPT', {}, s.owner), 'FORBIDDEN');
  await rejects(() => run(s, 'ACCEPT', {}, clone(s.primary)), 'AUTH_REQUIRED');
  for (const patch of [{ actor: {} }, { nextStatus: 'COMPLETED' }, { role: 'STORE' }, { ownerId: s.owner.subjectId },
    { paidCents: order(s).totalCents }, { pickupCredential: 'private-code' }]) {
    await rejects(() => run(s, 'ACCEPT', patch), 'INVALID_REQUEST');
  }
  assert.equal(snapshot(s), before);
});

test('A02 ordinary owner cannot use merchant list/detail and unauthorized detail does not fetch children', async () => {
  const s = await setup(), childReads = s.controls.childReads;
  await rejects(() => s.readService.execute(s.readEvent('orders.list'), s.owner), 'FORBIDDEN');
  await rejects(() => s.readService.execute(s.readEvent(), s.owner), 'NOT_FOUND');
  assert.equal(s.controls.childReads, childReads);
});

test('A02 A01 role revocation/disabled caller is applied to next read and next mutation, including replay', async () => {
  const s = await setup(), event = s.event('ACCEPT'); await s.merchantService.execute(event, s.secondary);
  await s.adminService.execute({ action: 'role.revoke', payload: { roleId: s.secondRoleId, expectedVersion: 0, reason: '离线撤销',
    idempotencyKey: 'OFFLINE_REVOKE_SECOND_MERCHANT' } }, s.primary);
  const before = snapshot(s);
  await rejects(() => s.readService.execute(s.readEvent(), s.secondary), 'NOT_FOUND');
  await rejects(() => s.merchantService.execute(event, s.secondary), 'FORBIDDEN');
  await rejects(() => run(s, 'START_MAKING', {}, s.secondary), 'FORBIDDEN'); assert.equal(snapshot(s), before);
  s.db.users[s.primary.subjectId].status = 'DISABLED';
  await rejects(() => s.readService.execute(s.readEvent('orders.list'), s.primary), 'USER_DISABLED');
});

test('A02 rejection needs one grant with ORDER_OPERATE and REFUND_APPROVE; independent grants cannot combine', async () => {
  const s = await setup(); s.db.roles[s.secondRoleId].capabilities = ['ORDER_OPERATE'];
  await rejects(() => run(s, 'REJECT_ORDER', {}, s.secondary), 'FORBIDDEN');
  const result = await s.readService.execute(s.readEvent(), s.secondary);
  assert.deepEqual(result.availableActions.map(a => a.command), ['ACCEPT']);
  const own = await run(s, 'ACCEPT', {}, s.secondary); assert.equal(own.disposition, 'ACCEPTED');
});

test('A02 no command skips a stage; rejection cannot be applied after acceptance or making', async () => {
  const s = await setup();
  await rejects(() => run(s, 'START_MAKING'), 'INVALID_TRANSITION');
  await rejects(() => run(s, 'MARK_READY'), 'INVALID_TRANSITION');
  await run(s, 'ACCEPT'); await rejects(() => run(s, 'REJECT_ORDER'), 'INVALID_TRANSITION');
  await run(s, 'START_MAKING'); await rejects(() => run(s, 'ACCEPT', { idempotencyKey: 'OFFLINE_ILLEGAL_LATE_ACCEPT' }), 'INVALID_TRANSITION');
  await rejects(() => run(s, 'REJECT_ORDER'), 'INVALID_TRANSITION');
});

test('A02 current versions and concurrent administrators allow exactly one valid acceptance or stock consumption', async () => {
  for (const command of ['ACCEPT','START_MAKING']) {
    const s = await setup(); if (command === 'START_MAKING') await run(s, 'ACCEPT');
    const event = s.event(command), results = await Promise.allSettled([
      s.merchantService.execute(event, s.primary), s.merchantService.execute({ ...event, payload: { ...event.payload,
        idempotencyKey: 'OFFLINE_OTHER_ADMIN_' + command } }, s.secondary)
    ]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.find(result => result.status === 'rejected').reason.code, 'VERSION_CONFLICT');
    assert.equal(Object.values(s.db.logs).filter(log => log.command === command).length, 1);
  }
});

test('A02 making and rejection competition never both consumes and releases the same stock', async () => {
  const s = await setup(), acceptEvent = s.event('ACCEPT'), rejectEvent = s.event('REJECT_ORDER');
  const results = await Promise.allSettled([s.merchantService.execute(acceptEvent, s.primary), s.merchantService.execute(rejectEvent, s.secondary)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(Object.keys(s.db.refunds).length, 0); await run(s, 'START_MAKING');
  assert(Object.values(s.db.reservations).filter(r => r.resourceKind === 'STOCK').every(r => r.status === 'CONSUMED'));
});

test('A02 lost response can be replayed from a rebuilt service after later stages without duplicate log or stock use', async () => {
  const s = await setup(), event = s.event('ACCEPT'); await s.merchantService.execute(event, s.primary);
  await run(s, 'START_MAKING'); await run(s, 'MARK_READY'); const before = snapshot(s);
  assert.equal((await createMerchantOrderService(s.options).execute(event, s.primary)).disposition, 'REPLAY');
  assert.equal(snapshot(s), before);
  await rejects(() => s.merchantService.execute({ ...event, payload: { ...event.payload, reason: 'changed' } }, s.primary), 'IDEMPOTENCY_KEY_REUSED');
});

test('A02 missing/unknown original payment, pending second intent and wrong scope never create refund or advance fulfillment', async () => {
  for (const mutate of [
    s => { s.db.payments = {}; },
    s => { Object.values(s.db.payments)[0].accountingState = 'QUARANTINED'; },
    s => { Object.values(s.db.payments)[0].environment = 'other'; },
    s => { const payment = clone(Object.values(s.db.payments)[0]); payment._id = 'OFFLINE_OTHER_PENDING'; payment.status = 'PENDING'; payment.accountingState = 'UNAPPLIED'; s.db.payments[payment._id] = payment; },
    s => { Object.values(s.db.payments)[0].transactionId = null; }
  ]) {
    const s = await setup(); mutate(s); const before = snapshot(s);
    await rejects(() => run(s, 'REJECT_ORDER'), 'REFUND_PAYMENT_UNRESOLVED'); assert.equal(snapshot(s), before);
    await rejects(() => run(s, 'ACCEPT'), 'REFUND_PAYMENT_UNRESOLVED'); assert.equal(snapshot(s), before);
  }
});

test('A02 incomplete/mismatched quote, resources, order facts or history prevent all writes', async () => {
  for (const [mutate, code] of [
    [state => { state.complete = false; }, 'INVALID_MERCHANT_ORDER_STATE'],
    [state => { state.quote.consumedOrderId = 'other'; }, 'INVALID_MERCHANT_ORDER_STATE'],
    [state => { state.reservations.pop(); }, 'INVALID_RESERVATION_PLAN'],
    [state => { state.resources[0].resource.storeId = 'other'; }, 'RESOURCE_SCOPE_MISMATCH'],
    [state => { state.items[0].lineTotalCents++; }, 'ORDER_AMOUNTS_MISMATCH'],
    [state => { state.logs.pop(); }, 'INVALID_ORDER_READ_STATE']
  ]) {
    const s = await setup(); s.controls.statePatch = mutate; const before = snapshot(s);
    await rejects(() => run(s, 'ACCEPT'), code); assert.equal(snapshot(s), before);
  }
});

test('A02 every ACCEPT/MAKE/READY/rejection write failure or zero-row result rolls back all resource/financial/history changes', async () => {
  for (const [command, writes] of [['ACCEPT',3],['START_MAKING',5],['MARK_READY',3],['REJECT_ORDER',8]])
    for (const kind of ['failAt','zeroAt']) for (let position = 1; position <= writes; position++) {
      const s = command === 'MARK_READY' ? await made() : await setup(); if (command === 'START_MAKING') await run(s, 'ACCEPT');
      s.controls[kind] = position; const before = snapshot(s);
      await assert.rejects(() => run(s, command)); assert.equal(snapshot(s), before, command + '/' + kind + '/' + position);
    }
});

test('A02 role/user/store or resource changes before commit fail the atomic read fence', async () => {
  for (const mutate of [
    s => { s.db.roles[s.rootRoleId].version++; }, s => { s.db.users[s.primary.subjectId].status = 'DISABLED'; },
    s => { s.db.stocks[s.stockId].version++; }, s => { s.db.stores[s.storeId].version++; }
  ]) {
    const s = await setup(), logCount = Object.keys(s.db.logs).length; s.controls.beforeCommit = () => mutate(s);
    await rejects(() => run(s, 'ACCEPT'), 'VERSION_CONFLICT'); assert.equal(order(s).orderStatus, 'PAID'); assert.equal(Object.keys(s.db.logs).length, logCount);
  }
});

test('A02 malformed/cross-app role and archived store reject current reads and commands', async () => {
  for (const [mutate, code] of [[s => { s.db.roles[s.rootRoleId].appId = 'other'; }, 'INVALID_ROLE_RECORD'],
    [s => { s.db.stores[s.storeId].status = 'ARCHIVED'; }, 'FORBIDDEN']]) {
    const s = await setup(); mutate(s); const before = snapshot(s);
    await rejects(() => s.readService.execute(s.readEvent('orders.list'), s.primary), code);
    await rejects(() => run(s, 'ACCEPT'), code); assert.equal(snapshot(s), before);
  }
});

test('A02 list contains all same-store customers, filters status before paging, and keeps addresses/contact/private facts out', async () => {
  const s = await setup({ mode: 'DELIVERY' }), dto = await s.readService.execute(s.readEvent('orders.list', { status: 'PAID' }), s.primary);
  assert.equal(dto.scope, 'OFFLINE_MERCHANT_ORDER_PAGE'); assert.equal(dto.items.length, 1); assert.equal(dto.items[0].orderId, s.orderId);
  const query = s.controls.queries[0]; assert.equal(query.storeId, s.storeId); assert(!Object.hasOwn(query, 'ownerId'));
  assert.deepEqual(query.states, ['PAID']); assert.equal(query.requiresWholeSeekAndStoreFilter, true);
  for (const field of ['contact','address','ownerId','grant','openId','transactionId','reservations','reason','requestId']) assert(!Object.hasOwn(dto.items[0], field));
  assert(dto.items[0].availableActions.every(action => action.enabled === false)); assert(Object.isFrozen(dto.items[0]));
});

test('A02 detail includes required contact/address and historical facts only after current store authorization', async () => {
  const s = await setup({ mode: 'DELIVERY' }), dto = await s.readService.execute(s.readEvent(), s.primary);
  assert.equal(dto.contact.phone, order(s).contactSnapshot.phone); assert.equal(dto.address.receiverName, order(s).addressSnapshot.receiverName);
  assert.equal(dto.address.phone, order(s).addressSnapshot.phone); assert.equal(dto.items[0].unitPriceCents, Object.values(s.db.items)[0].unitPriceCents);
  for (const field of ['ownerId','quoteId','addressFingerprint','evaluationId','openId','transactionId','pickupCredential','requestId','reason']) assert(!Object.hasOwn(dto, field));
  const t = await setup(), pickup = await t.readService.execute(t.readEvent(), t.primary); assert.equal(pickup.address, null);
});

test('A02 HMAC pagination is stable on equal timestamps and bound to current actor/store/status/role', async () => {
  const s = await setup(), original = clone(order(s)), originalItems = Object.values(s.db.items).filter(item => item.orderId === s.orderId);
  for (const id of ['aaa','bbb']) {
    const copied = { ...clone(original), _id: id, orderNo: 'OFFLINE-' + id };
    s.db.orders[id] = copied;
    for (const item of originalItems) s.db.items[id + item._id] = { ...clone(item), _id: id + item._id, orderId: id };
  }
  const seen = [], first = await s.readService.execute(s.readEvent('orders.list', { pageSize: 1 }), s.primary); seen.push(first.items[0].orderId);
  assert(first.nextCursor); let cursor = first.nextCursor;
  while (cursor) {
    const page = await s.readService.execute(s.readEvent('orders.list', { pageSize: 1, cursor }), s.primary);
    seen.push(...page.items.map(item => item.orderId)); cursor = page.nextCursor;
  }
  assert.equal(new Set(seen).size, 3); assert.deepEqual(seen, [s.orderId,'bbb','aaa'].sort().reverse());
  await rejects(() => s.readService.execute(s.readEvent('orders.list', { cursor: first.nextCursor }), s.secondary), 'CURSOR_INVALID');
  await rejects(() => s.readService.execute(s.readEvent('orders.list', { cursor: first.nextCursor, status: 'PAID' }), s.primary), 'CURSOR_INVALID');
  s.controls.now += PAGE_POLICY.cursorTtlMs;
  await rejects(() => s.readService.execute(s.readEvent('orders.list', { cursor: first.nextCursor }), s.primary), 'CURSOR_EXPIRED');
});

test('A02 incorrect scoped/oversized/status-filtered child page is rejected rather than silently truncating or leaking', async () => {
  for (const patch of [
    state => { state.orders[0].storeId = 'other'; },
    state => { state.orders.push(clone(state.orders[0])); state.orders.push(clone(state.orders[0])); },
    state => { state.items[0].orderId = 'other'; },
    state => { state.orders[0].orderStatus = 'ACCEPTED'; }
  ]) {
    const s = await setup(); s.controls.pagePatch = patch;
    await rejects(() => s.readService.execute(s.readEvent('orders.list', { status: 'PAID', pageSize: 1 }), s.primary), 'INVALID_ORDER_READ_STATE');
  }
});

test('A02 read snapshot revocation/change or missing current user cannot deliver merchant private detail', async () => {
  const s = await setup(); s.controls.denyFence = true;
  await rejects(() => s.readService.execute(s.readEvent(), s.primary), 'VERSION_CONFLICT');
  delete s.db.users[s.primary.subjectId];
  await rejects(() => s.readService.execute(s.readEvent(), s.primary), 'USER_NOT_PROVISIONED');
});

test('A02 bad immutable receipt/log/approval facts cannot be used to replay a mutation', async () => {
  for (const damage of [
    s => { const receipt = Object.values(s.db.receipts).find(r => r.command === 'admin.order.transition'); receipt.result.version = 99; },
    s => { const receipt = Object.values(s.db.receipts).find(r => r.command === 'admin.order.transition'); receipt.createdAt--; receipt.updatedAt--; },
    s => { Object.values(s.db.logs).find(log => log.command === 'ACCEPT').actor.subjectId = s.secondary.subjectId; }
  ]) {
    const s = await setup(), event = s.event('ACCEPT'); await s.merchantService.execute(event, s.primary); damage(s); const before = snapshot(s);
    await rejects(() => s.merchantService.execute(event, s.primary), 'INVALID_IDEMPOTENCY_RECORD'); assert.equal(snapshot(s), before);
  }
});

test('A02 missing original config or refund-number collision prevents cancellation and resource release', async () => {
  const s = await setup(), before = snapshot(s);
  const mismatched = createMerchantOrderService({ ...s.options, loadPaymentConfiguration: () => ({ plan: () => ({ environment: 'wrong' }) }) });
  await rejects(() => mismatched.execute(s.event('REJECT_ORDER'), s.primary), 'PAYMENT_CONFIGURATION_CHANGED'); assert.equal(snapshot(s), before);
  const badNumber = createMerchantOrderService({ ...s.options, newRefundNumber: () => 'bad' });
  await rejects(() => badNumber.execute(s.event('REJECT_ORDER'), s.primary), 'INVALID_REFUND_NUMBER'); assert.equal(snapshot(s), before);
  const refundId = require('../cloudfunctions/_shared/idempotency-model').scopedDocumentId('merchant-rejection-refund',
    [s.context.environment,s.context.appId,s.orderId]);
  s.db.refunds.other = { _id: 'other', orderId: 'other-order', outRefundNo: s.options.newRefundNumber(refundId) };
  await rejects(() => run(s, 'REJECT_ORDER'), 'REFUND_NUMBER_CONFLICT'); assert.equal(order(s).orderStatus, 'PAID');
});

test('A02 server clock rollback and missing pickup/delivery configuration produce no fake success', async () => {
  const s = await setup(), before = snapshot(s); s.controls.nowSequence = [s.controls.now,s.controls.now - 1];
  await rejects(() => run(s, 'ACCEPT'), 'INVALID_CONFIGURATION'); assert.equal(snapshot(s), before); s.controls.nowSequence = null;
  const closed = createMerchantOrderService({ ...s.options, deliveryOptions: null, pickupOptions: null });
  await rejects(() => closed.execute(s.event('START_DELIVERY'), s.primary), 'CONFIGURATION_REQUIRED');
  await rejects(() => closed.execute(s.event('COMPLETE_PICKUP', { pickupCredential: 'private' }), s.primary), 'CONFIGURATION_REQUIRED');
  assert.equal(snapshot(s), before);
});

test('A02 routed O08 command must retain A01 app/environment/archived-store checks inside its transaction', async () => {
  const s = await ready({ mode: 'DELIVERY' }); s.db.roles[s.rootRoleId].environment = 'other'; const before = snapshot(s);
  await rejects(() => run(s, 'START_DELIVERY'), 'INVALID_ROLE_RECORD'); assert.equal(snapshot(s), before);
});

test('A02 unauthorized mutation must stop before reading linked private or financial records', async () => {
  const s = await setup(), count = s.controls.childReads;
  await rejects(() => run(s, 'ACCEPT', {}, s.owner), 'FORBIDDEN'); assert.equal(s.controls.childReads, count);
});

test('A02 routed O07 credential completion checks strict A01 scope and archived stores in the same transaction', async () => {
  for (const [mutate, code] of [
    [s => { s.db.roles[s.rootRoleId].appId = 'other'; }, 'INVALID_ROLE_RECORD'],
    [s => { s.db.stores[s.storeId].status = 'ARCHIVED'; }, 'FORBIDDEN']
  ]) {
    const s = await ready(), issued = await s.pickupService.get({ action: 'pickupCredential.get', payload: { orderId: s.orderId } }, s.owner);
    mutate(s); const before = snapshot(s);
    await rejects(() => run(s, 'COMPLETE_PICKUP', { pickupCredential: issued.credential.value }), code); assert.equal(snapshot(s), before);
  }
});

test('A02 current role regrant invalidates a previous merchant page cursor even for the same subject/store', async () => {
  const s = await setup(), copied = { ...clone(order(s)), _id: 'extra', orderNo: 'OFFLINE-EXTRA' };
  s.db.orders.extra = copied;
  for (const item of Object.values(s.db.items).filter(item => item.orderId === s.orderId))
    s.db.items['extra-' + item._id] = { ...clone(item), _id: 'extra-' + item._id, orderId: 'extra' };
  const page = await s.readService.execute(s.readEvent('orders.list', { pageSize: 1 }), s.secondary); assert(page.nextCursor);
  await s.adminService.execute({ action: 'role.revoke', payload: { roleId: s.secondRoleId, expectedVersion: 0, reason: '隔离撤销',
    idempotencyKey: 'OFFLINE_CURSOR_ROLE_REVOKE' } }, s.primary);
  await s.adminService.execute({ action: 'role.grant', payload: { subjectId: s.secondary.subjectId, storeIds: [s.storeId],
    capabilities: ['ORDER_OPERATE'], reason: '隔离重授权', idempotencyKey: 'OFFLINE_CURSOR_ROLE_REGRANT' } }, s.primary);
  await rejects(() => s.readService.execute(s.readEvent('orders.list', { pageSize: 1, cursor: page.nextCursor }), s.secondary), 'CURSOR_INVALID');
});

test('A02 merchant list separates cancellation progress and pending/settled refund axes from fulfillment state', async () => {
  const s = await setup();
  const log = s.append('REQUEST_CANCELLATION', {});
  s.db.cancellations.pending = { _id: 'pending', schemaVersion: 1, version: 0, orderId: s.orderId, ownerId: s.owner.subjectId,
    status: 'PENDING', createdAt: log.createdAt, updatedAt: log.createdAt, reviewedAt: null, approvedRefundCents: null,
    reason: 'PRIVATE_REASON', reviewerId: null };
  const page = await s.readService.execute(s.readEvent('orders.list', { status: 'PAID' }), s.primary);
  assert.equal(page.items[0].cancellationSummary.status, 'PENDING'); assert.equal(page.items[0].orderStatus, 'PAID');
  assert(!JSON.stringify(page).includes('PRIVATE_REASON'));
  const t = await setup(); await run(t, 'REJECT_ORDER');
  const cancelled = await t.readService.execute(t.readEvent('orders.list', { status: 'CANCELLED' }), t.primary);
  assert.equal(cancelled.items[0].orderStatus, 'CANCELLED'); assert.equal(cancelled.items[0].refundSummary.status, 'PENDING');
  assert.equal(cancelled.items[0].availableActions.length, 0);
});

test('A02 malformed consumed stock trace, unknown policy or overflowing version prevents readiness/acceptance', async () => {
  const s = await made(), stock = Object.values(s.db.reservations).find(r => r.resourceKind === 'STOCK'); stock.resolutionLogId = 'unknown';
  const before = snapshot(s); await rejects(() => run(s, 'MARK_READY'), 'INVALID_FULFILLMENT_RESOURCES'); assert.equal(snapshot(s), before);
  const t = await setup(); order(t).tradePolicyVersion = 'future-policy';
  await rejects(() => run(t, 'ACCEPT'), 'POLICY_VERSION_UNSUPPORTED');
});

test('A02 existing pending cancellation needs explicit review rather than leaving an orphan after merchant rejection', async () => {
  const s = await setup(), log = s.append('REQUEST_CANCELLATION', {});
  s.db.cancellations.pending = { _id: 'pending', schemaVersion: 1, version: 0, orderId: s.orderId, ownerId: s.owner.subjectId,
    status: 'PENDING', createdAt: log.createdAt, updatedAt: log.createdAt, reviewedAt: null, approvedRefundCents: null };
  const before = snapshot(s);
  await rejects(() => run(s, 'REJECT_ORDER'), 'CANCELLATION_REVIEW_REQUIRED'); assert.equal(snapshot(s), before);
  const detail = await s.readService.execute(s.readEvent(), s.primary);
  assert.equal(detail.availableActions.find(action => action.command === 'REJECT_ORDER').blockedReason, 'CANCELLATION_REVIEW_REQUIRED');
});
