'use strict';
// OFFLINE_TEST_ONLY: serializable in-memory transactions. No SDK or live writes.
const { setup: quoteSetup, actor, clone } = require('./quote');
const { planQuoteCreation } = require('../../cloudfunctions/_shared/quote-model');
const { buildSlotDefinitions } = require('../../cloudfunctions/_shared/fulfillment-model');
const { createOrderTransactionService } = require('../../cloudfunctions/_shared/order-transaction-service');
const { createOrderCartSyncService, createOrderRecoveryService } = require('../../cloudfunctions/_shared/order-recovery-service');
const { createOrderCancellationService } = require('../../cloudfunctions/_shared/order-cancellation-service');
function fail(code) { throw Object.assign(new Error(code), { code }); }
function setup(serviceOptions = {}) {
  const base = quoteSetup(), p = base.principal, store = clone(base.state.store);
  const config = clone(base.state.configuration);
  config.paymentHoldMinutes = 15; // Explicit synthetic policy, not merchant configuration.
  const db = { users: {}, stores: { [store._id]: store }, configs: { [config._id]: config },
    carts: {}, catalogs: clone(base.state.catalogs), addresses: {}, stocks: {}, slots: {},
    quotes: {}, orders: {}, items: {}, reservations: {}, logs: {}, receipts: {}, payments: {}, roles: {} };
  const stock = clone(base.state.stocks[0]);
  Object.assign(stock, { totalUnits: 20, heldUnits: 0, confirmedUnits: 0, consumedUnits: 0 });
  db.stocks[stock._id] = stock;
  for (const fulfillment of ['PICKUP','DELIVERY']) {
    const definition = buildSlotDefinitions({ store, environment: p.environment, now: base.context.now,
      fulfillment, serviceDate: '2026-10-06', timePolicy: config.timePolicy, productLeadTimes: [60] })[0];
    db.slots[definition._id] = { ...clone(definition), version: 0, status: 'OPEN',
      heldUnits: 0, confirmedUnits: 0, consumedUnits: 0 };
  }
  const controls = { now: base.context.now, failAt: 0, zeroAt: 0, denyFence: false,
    beforeCommit: null, commits: 0, lastWrites: 0, nowSequence: null, verifyLocation: () => true };
  let quoteSequence = 0, requestSequence = 0, queue = Promise.resolve();
  function provision(customer) {
    db.users[customer.subjectId] = { _id: customer.subjectId, schemaVersion: 1,
      environment: customer.environment, appId: customer.appId, status: 'ACTIVE', version: customer.userVersion };
  }
  provision(p);
  const contextFor = () => ({ ...base.context, now: controls.now, verifyLocation: controls.verifyLocation });
  function creationState(data, quoteId) {
    const quote = data.quotes[quoteId];
    if (!quote) return { quote: null };
    const facts = quote.facts, currentStore = data.stores[quote.storeId];
    return { quote, store: currentStore, configuration: data.configs[currentStore.activeConfigId],
      cart: data.carts[facts.cartSelectionSnapshot.cartId], catalogs: data.catalogs,
      slot: data.slots[facts.appointmentSnapshot.slotId], stocks: Object.values(data.stocks),
      address: facts.addressSnapshot ? data.addresses[facts.addressSnapshot.addressId] : null };
  }
  function makeQuote({ customer = p, mode = 'PICKUP', quantity = 1, key, additionalLines = [] } = {}) {
    provision(customer);
    const cart = clone(base.state.cart);
    cart._id = 'offline-cart-' + customer.subjectId; cart.ownerId = customer.subjectId;
    cart.lines[0].quantity = quantity; cart.lines.push(...clone(additionalLines)); db.carts[cart._id] = cart;
    const address = clone(base.state.address);
    address._id = 'offline-address-' + customer.subjectId; address.ownerId = customer.subjectId;
    db.addresses[address._id] = address;
    const slot = Object.values(db.slots).find(value => value.fulfillment === mode);
    const input = { cartId: cart._id, expectedCartVersion: cart.version,
      lines: cart.lines.map(line => ({ lineId: line.lineId, lineVersion: line.lineVersion })),
      fulfillment: mode, contact: clone(base.event.payload.contact),
      addressId: mode === 'DELIVERY' ? address._id : null, slotId: slot._id,
      orderNote: '隔离事务测试', idempotencyKey: 'offline-quote-key-' + (++quoteSequence) };
    const state = { store: db.stores[store._id], configuration: db.configs[config._id], cart,
      catalogs: db.catalogs, slot, stocks: Object.values(db.stocks), address, receipt: null };
    const quote = planQuoteCreation(state, { action: 'quote.create', payload: input }, customer, contextFor()).proposedQuote;
    db.quotes[quote._id] = clone(quote);
    return { customer, quoteId: quote._id, event: { action: 'create', payload: { quoteId: quote._id,
      expectedQuoteVersion: quote.version, idempotencyKey: key || 'offline-create-key-' + quoteSequence } } };
  }
  const runTransaction = work => {
    const pending = queue.then(async () => {
      const snapshot = JSON.stringify(db), staged = clone(db);
      let writes = 0;
      const changed = () => {
        writes++; controls.lastWrites = writes;
        if (controls.failAt === writes) throw new Error('OFFLINE injected write failure ' + writes);
        return controls.zeroAt === writes ? 0 : 1;
      };
      function insert(table, record) {
        if (staged[table][record._id]) fail('VERSION_CONFLICT');
        staged[table][record._id] = clone(record); return changed();
      }
      const session = {
        readUser: async id => staged.users[id] || null,
        readReceipt: async id => staged.receipts[id] || null,
        readCreationState: async id => creationState(staged, id),
        readOrder: async id => staged.orders[id] || null,
        readCart: async id => staged.carts[id] || null,
        readCancellationState: async order => {
          const reservations=Object.values(staged.reservations).filter(value=>value.orderId===order._id);
          return { quote:staged.quotes[order.quoteId] || null,
            payments:Object.values(staged.payments).filter(value=>value.orderId===order._id),reservations,
            resources:reservations.map(value=>({resourceKind:value.resourceKind,
              resource:(value.resourceKind==='STOCK' ? staged.stocks : staged.slots)[value.resourceId]})) };
        },
        readPickupState: async (order,principal) => {
          const reservations=Object.values(staged.reservations).filter(value=>value.orderId===order._id);
          return {roles:Object.values(staged.roles).filter(role=>role.subjectId===principal.subjectId),
            quote:staged.quotes[order.quoteId]||null,reservations,
            resources:reservations.map(r=>({resourceKind:r.resourceKind,
              resource:(r.resourceKind==='STOCK'?staged.stocks:staged.slots)[r.resourceId]}))};
        },
        readDeliveryState: async (order,principal) => {
          const reservations=Object.values(staged.reservations).filter(value=>value.orderId===order._id);
          return {roles:Object.values(staged.roles).filter(role=>role.subjectId===principal.subjectId),
            quote:staged.quotes[order.quoteId]||null,reservations,
            resources:reservations.map(r=>({resourceKind:r.resourceKind,
              resource:(r.resourceKind==='STOCK'?staged.stocks:staged.slots)[r.resourceId]})),
            logs:Object.values(staged.logs).filter(log=>log.orderId===order._id)};
        },
        assertDeliveryReads: async conditions => !controls.denyFence&&JSON.stringify(db)===snapshot&&
          staged.orders[conditions.orderId].version===conditions.orderVersion&&
          staged.users[conditions.userId].version===conditions.userVersion&&
          (!conditions.grant||staged.roles[conditions.grant.roleId]?.version===conditions.grant.roleVersion)&&
          (!conditions.logId||!!staged.logs[conditions.logId]),
        assertPickupReads: async conditions => !controls.denyFence&&JSON.stringify(db)===snapshot&&
          staged.orders[conditions.orderId].version===conditions.orderVersion&&
          staged.users[conditions.userId].version===conditions.userVersion&&
          (!conditions.grant||staged.roles[conditions.grant.roleId]?.version===conditions.grant.roleVersion),
        assertCancellationReads: async conditions => !controls.denyFence && JSON.stringify(db)===snapshot &&
          staged.orders[conditions.orderId].version===conditions.orderVersion &&
          (conditions.userId === null || staged.users[conditions.userId].version===conditions.userVersion),
        readOrderByNumber: async number => Object.values(staged.orders).find(value => value.orderNo === number) || null,
        assertCreationReads: async conditions => !controls.denyFence &&
          staged.users[conditions.userId].version === conditions.userVersion && JSON.stringify(db) === snapshot,
        assertReplayReads: async conditions => !controls.denyFence &&
          staged.users[conditions.userId].version === conditions.userVersion && JSON.stringify(db) === snapshot,
        assertSyncReads: async conditions => !controls.denyFence && JSON.stringify(db) === snapshot &&
          staged.users[conditions.userId].version === conditions.userVersion &&
          staged.orders[conditions.orderId].version === conditions.orderVersion &&
          (staged.carts[conditions.cartId] ? staged.carts[conditions.cartId].version : null) === conditions.cartVersion,
        saveCart: async (cart, expectedVersion) => {
          const current = staged.carts[cart._id];
          if (!current || current.version !== expectedVersion || current.ownerId !== cart.ownerId) return 0;
          staged.carts[cart._id] = clone(cart); return changed();
        },
        updateResource: async (change, timestamp) => {
          const table = change.resourceKind === 'STOCK' ? 'stocks' : 'slots', current = staged[table][change.resourceId];
          if (!current || current.version !== change.expectedVersion || current.status !== (change.expectedStatus || 'OPEN')) return 0;
          Object.assign(current, { version: change.nextVersion, heldUnits: change.heldUnits,
            confirmedUnits: change.confirmedUnits, consumedUnits: change.consumedUnits, updatedAt: timestamp });
          return changed();
        },
        insertReservation: async record => insert('reservations', record),
        updateReservation: async change => {
          const current=staged.reservations[change.reservationId];
          if (!current || current.version!==change.expectedVersion || current.status!==change.expectedStatus) return 0;
          Object.assign(current,clone(change.patch)); return changed();
        },
        saveOrder: async (order,expectedVersion) => {
          if (!staged.orders[order._id] || staged.orders[order._id].version!==expectedVersion) return 0;
          staged.orders[order._id]=clone(order); return changed();
        },
        insertOrder: async record => {
          if (Object.values(staged.orders).some(value => value.orderNo === record.orderNo)) fail('VERSION_CONFLICT');
          return insert('orders', record);
        },
        insertItem: async record => insert('items', record),
        insertLog: async record => insert('logs', record),
        consumeQuote: async (consumption, conditions) => {
          const quote = staged.quotes[consumption.quoteId];
          if (!quote || quote.version !== consumption.expectedVersion || quote.status !== 'ACTIVE' ||
              quote.consumedOrderId !== null || quote.expiresAt <= conditions.now ||
              quote.ownerId !== conditions.ownerId || quote.storeId !== conditions.storeId) return 0;
          Object.assign(quote, consumption.patch); return changed();
        },
        insertReceipt: async record => insert('receipts', record)
      };
      if (controls.extendTransaction) Object.assign(session, controls.extendTransaction({ staged, snapshot, changed, insert }));
      const result = await work(session);
      if (controls.beforeCommit) await controls.beforeCommit(db);
      if (JSON.stringify(db) !== snapshot) fail('VERSION_CONFLICT'); // Read dependencies / revocation fence.
      Object.assign(db, staged); controls.commits++; controls.lastWrites = writes;
      return result;
    });
    queue = pending.catch(() => {}); return pending;
  };
  const service = createOrderTransactionService({ runTransaction,
    ...serviceOptions,
    now: () => controls.nowSequence ? controls.nowSequence.shift() : controls.now,
    buildContext: async () => contextFor(), newRequestId: () => 'offline-server-trace-' + (++requestSequence) });
  const cartSyncService = createOrderCartSyncService({ runTransaction, now: () => controls.now });
  const recoveryService = createOrderRecoveryService({ orderService: service, cartSyncService });
  const expiryInvocation=Object.freeze({ testOnly:true });
  const cancellationService=createOrderCancellationService({runTransaction,now:()=>controls.now,
    newRequestId:()=> 'offline-cancel-trace-' + (++requestSequence),redactReason:()=> '隔离测试脱敏原因',
    environment:p.environment,appId:p.appId,verifyExpiryInvocation:invocation=>invocation===expiryInvocation});
  return { db, controls, service, cartSyncService, recoveryService, cancellationService, expiryInvocation,
    makeQuote, actor, principal: p, runTransaction, base,
    stockId: stock._id, storeId: store._id, configId: config._id };
}
module.exports = { setup };
