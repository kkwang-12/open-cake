'use strict';
// Server-only domain mapping over SDK document primitives. No callable handler.
// Provider hooks MUST use the same transaction and supply commit-time protection
// and unique-index-backed orderNo lookup. Hook presence is not cloud evidence.
const { requireOwner } = require('./authorization-model');
const { canonicalJSON } = require('./idempotency-model');
const COLLECTIONS = Object.freeze({ user: 'users', receipt: 'idempotency_records',
  quote: 'checkout_quotes', store: 'stores', configuration: 'store_config', cart: 'carts',
  product: 'products', sku: 'skus', address: 'addresses', stock: 'inventory_resources',
  slot: 'slot_inventory', order: 'orders', item: 'order_items',
  reservation: 'reservations', log: 'order_logs' });
class OrderDocumentSessionError extends Error {
  constructor(code) { super(code); this.name = 'OrderDocumentSessionError'; this.code = code; }
}
const fail = code => { throw new OrderDocumentSessionError(code); };
const copy = value => JSON.parse(canonicalJSON(value));
const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
function createOrderDocumentSession({ documents, principal, protectReads, findOrderByNumber, maxReadDocuments }) {
  requireOwner(principal, { ownerId: principal?.subjectId });
  if (!documents || ['read','insert','updateVersioned'].some(key => typeof documents[key] !== 'function') ||
      typeof protectReads !== 'function' || typeof findOrderByNumber !== 'function' ||
      !Number.isSafeInteger(maxReadDocuments) || maxReadDocuments < 1) fail('INVALID_ORDER_DOCUMENT_CONFIGURATION');
  const reads = new Map(), predicates = [];
  async function read(kind, documentId) {
    if (!id(documentId)) fail('INVALID_ORDER_DOCUMENT');
    const collection = COLLECTIONS[kind], key = JSON.stringify([collection, documentId]);
    if (reads.has(key)) return copy(reads.get(key).record);
    if (reads.size >= maxReadDocuments) fail('ORDER_READ_BUDGET_EXCEEDED');
    const record = await documents.read(collection, documentId);
    if (record !== null && (!record || record._id !== documentId)) fail('INVALID_ORDER_DOCUMENT');
    reads.set(key, { collection, id: documentId, record: copy(record) });
    return copy(record);
  }
  const sameStore = (record, storeId) => {
    if (!record || record.storeId !== storeId) fail('INVALID_CREATION_STATE');
    return record;
  };
  async function readCreationState(quoteId, customer) {
    if (customer !== principal) fail('AUTH_REQUIRED');
    const quote = await read('quote', quoteId);
    if (!quote) return { quote: null };
    requireOwner(principal, quote); // Reject another owner's quote before following its IDs.
    const facts = quote.facts;
    if (!facts || !Array.isArray(facts.items) || !facts.items.length ||
        !facts.cartSelectionSnapshot || !Array.isArray(facts.cartSelectionSnapshot.selectedLines) ||
        !facts.appointmentSnapshot || !Array.isArray(quote.resourceVersions)) fail('INVALID_CREATION_STATE');
    const store = await read('store', quote.storeId);
    if (!store) fail('CONFIGURATION_REQUIRED');
    const configuration = sameStore(await read('configuration', store.activeConfigId), store._id);
    const cart = await read('cart', facts.cartSelectionSnapshot.cartId);
    if (!cart) fail('NOT_FOUND');
    requireOwner(principal, cart);
    sameStore(cart, store._id);
    if (!Array.isArray(cart.lines)) fail('INVALID_CREATION_STATE');
    const catalogs = new Map(), stockIds = new Set();
    // Read current selected lines, not all SKUs or the whole catalog. Revalidation
    // rejects changed selections/versions; current SKU demand is still checked.
    for (const selected of facts.cartSelectionSnapshot.selectedLines) {
      const matches = cart.lines.filter(line => line.lineId === selected.lineId);
      if (matches.length !== 1) fail('QUOTE_CHANGED');
      const line = matches[0];
      const product = sameStore(await read('product', line.productId), store._id);
      const sku = sameStore(await read('sku', line.skuId), store._id);
      if (sku.productId !== product._id || !Array.isArray(sku.stockRequirements)) fail('INVALID_CREATION_STATE');
      if (!catalogs.has(product._id)) catalogs.set(product._id, { product, skus: [] });
      const entry = catalogs.get(product._id);
      if (!entry.skus.some(value => value._id === sku._id)) entry.skus.push(sku);
      for (const requirement of sku.stockRequirements) stockIds.add(requirement.resourceId);
    }
    for (const resource of quote.resourceVersions) {
      if (resource.resourceKind === 'STOCK') stockIds.add(resource.resourceId);
      else if (resource.resourceKind !== 'SLOT') fail('INVALID_CREATION_STATE');
    }
    const stocks = [];
    for (const stockId of stockIds) stocks.push(sameStore(await read('stock', stockId), store._id));
    const slot = sameStore(await read('slot', facts.appointmentSnapshot.slotId), store._id);
    let address = null;
    if (facts.addressSnapshot) {
      address = await read('address', facts.addressSnapshot.addressId);
      if (!address) fail('NOT_FOUND');
      requireOwner(principal, address);
    }
    return { quote, store, configuration, cart, catalogs: [...catalogs.values()], stocks, slot, address };
  }
  function insert(kind, record) { return documents.insert(COLLECTIONS[kind], record); }
  async function protect(conditions) {
    if (conditions.userId !== principal.subjectId) fail('FORBIDDEN');
    return await protectReads(copy([...reads.values()]), copy(conditions), copy(predicates)) === true;
  }
  return Object.freeze({
    readUser: subjectId => {
      if (subjectId !== principal.subjectId) fail('FORBIDDEN');
      return read('user', subjectId);
    },
    readReceipt: receiptId => read('receipt', receiptId),
    readOrder: orderId => read('order', orderId),
    readCreationState,
    readOrderByNumber: async number => {
      if (typeof number !== 'string' || !/^V1-[A-Z0-9_-]+$/.test(number)) fail('INVALID_ORDER_DOCUMENT');
      const result = await findOrderByNumber(number);
      if (result !== null && (!result || result.orderNo !== number)) fail('INVALID_ORDER_DOCUMENT');
      predicates.push({ collection: COLLECTIONS.order, field: 'orderNo', value: number, record: copy(result) });
      return result;
    },
    assertCreationReads: protect,
    assertReplayReads: protect,
    updateResource: async (change, timestamp) => {
      if (!['STOCK','SLOT'].includes(change.resourceKind)) fail('INVALID_ORDER_DOCUMENT');
      const kind = change.resourceKind === 'STOCK' ? 'stock' : 'slot';
      const current = await read(kind, change.resourceId);
      if (!current || current.status !== (change.expectedStatus || 'OPEN') ||
          change.nextVersion !== change.expectedVersion + 1) return 0;
      return documents.updateVersioned(COLLECTIONS[kind], change.resourceId, change.expectedVersion,
        { heldUnits: change.heldUnits, confirmedUnits: change.confirmedUnits,
          consumedUnits: change.consumedUnits, updatedAt: timestamp });
    },
    insertReservation: record => insert('reservation', record),
    insertOrder: record => insert('order', record),
    insertItem: record => insert('item', record),
    insertLog: record => insert('log', record),
    insertReceipt: record => insert('receipt', record),
    consumeQuote: async (consumption, conditions) => {
      const quote = await read('quote', consumption.quoteId);
      if (!quote || quote.status !== 'ACTIVE' || quote.consumedOrderId !== null ||
          quote.expiresAt <= conditions.now || quote.ownerId !== conditions.ownerId ||
          quote.storeId !== conditions.storeId || consumption.patch.version !== consumption.expectedVersion + 1) return 0;
      const { version, ...patch } = consumption.patch;
      return documents.updateVersioned(COLLECTIONS.quote, quote._id, consumption.expectedVersion, patch);
    }
  });
}
module.exports = { COLLECTIONS, OrderDocumentSessionError, createOrderDocumentSession };
