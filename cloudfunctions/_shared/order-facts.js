'use strict';
const { validateTradeSnapshot } = require('./trade-model');

// Offline model utilities. Inputs must already be resolved/authorized by the
// future server-side quote/order service; this module does not trust a client quote.
class OrderFactsError extends Error {
  constructor(code) { super(code); this.name = 'OrderFactsError'; this.code = code; }
}
function fail(code = 'INVALID_ORDER_FACTS') { throw new OrderFactsError(code); }
function integer(value, positive = false) { return Number.isSafeInteger(value) && value >= (positive ? 1 : 0); }
function text(value) { return typeof value === 'string' && value.trim().length > 0; }
function plain(value) {
  return value !== null && typeof value === 'object' &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value));
}
function pick(source, fields) {
  if (!plain(source)) fail();
  return Object.fromEntries(fields.filter(field => Object.prototype.hasOwnProperty.call(source, field)).map(field => [field, source[field]]));
}
function copyJSON(value, ancestors = new Set()) {
  if (value === null || ['string', 'boolean'].includes(typeof value)) return value;
  if (typeof value === 'number') { if (!Number.isFinite(value)) fail(); return value; }
  if ((!plain(value) && !Array.isArray(value)) || ancestors.has(value)) fail();
  ancestors.add(value);
  const copied = Array.isArray(value) ? value.map(item => copyJSON(item, ancestors)) :
    Object.fromEntries(Object.keys(value).map(key => [key, copyJSON(value[key], ancestors)]));
  ancestors.delete(value);
  return Object.freeze(copied);
}
function calculateOrderAmounts(items, deliveryFeeCents, fulfillment) {
  if (!Array.isArray(items) || !items.length || !integer(deliveryFeeCents) ||
      !['PICKUP', 'DELIVERY'].includes(fulfillment) || (fulfillment === 'PICKUP' && deliveryFeeCents !== 0)) fail('INVALID_ORDER_AMOUNT');
  let subtotalCents = 0;
  const lineTotalsCents = items.map(item => {
    if (!plain(item) || !integer(item.unitPriceCents, true) || !integer(item.quantity, true)) fail('INVALID_ORDER_AMOUNT');
    const lineTotal = item.unitPriceCents * item.quantity;
    if (!integer(lineTotal, true) || !integer(subtotalCents + lineTotal, true)) fail('AMOUNT_OVERFLOW');
    if (item.lineTotalCents !== undefined && item.lineTotalCents !== lineTotal) fail('ORDER_AMOUNTS_MISMATCH');
    subtotalCents += lineTotal;
    return lineTotal;
  });
  const totalCents = subtotalCents + deliveryFeeCents;
  if (!integer(totalCents, true)) fail('AMOUNT_OVERFLOW');
  return Object.freeze({ currency: 'CNY', subtotalCents, deliveryFeeCents, totalCents,
    lineTotalsCents: Object.freeze(lineTotalsCents) });
}
function assertOrderAmounts(order, items) {
  validateTradeSnapshot(order);
  const amounts = calculateOrderAmounts(items, order.deliveryFeeCents, order.fulfillment);
  if (order.subtotalCents !== amounts.subtotalCents || order.totalCents !== amounts.totalCents) fail('ORDER_AMOUNTS_MISMATCH');
  return amounts;
}

const sectionFields = {
  cartSelectionSnapshot: ['cartId', 'cartVersion', 'selectedLines'],
  storeSnapshot: ['storeId', 'name', 'address', 'phone', 'timeZone', 'configVersion'],
  contactSnapshot: ['name', 'phone'],
  addressSnapshot: ['addressId', 'receiverName', 'phone', 'province', 'city', 'district', 'regionCodes', 'detail', 'location'],
  appointmentSnapshot: ['storeId', 'slotId', 'serviceDate', 'timeZone', 'startAt', 'endAt', 'policyVersion', 'minLeadTimeMinutes'],
  deliverySnapshot: ['ruleId', 'ruleVersion', 'feeCents', 'evaluationId', 'addressFingerprint']
};
function captureOrderFacts(input) {
  if (!plain(input) || !text(input.quoteId) || !text(input.tradePolicyVersion)) fail();
  const sections = {};
  for (const [name, fields] of Object.entries(sectionFields)) {
    sections[name] = name === 'addressSnapshot' && input.fulfillment === 'PICKUP' ? null : pick(input[name], fields);
  }
  const store = sections.storeSnapshot, appointment = sections.appointmentSnapshot;
  if (!text(store.storeId) || !text(store.name) || !text(store.address) || !text(store.phone) ||
      !text(store.timeZone) || !integer(store.configVersion) || appointment.storeId !== store.storeId ||
      appointment.timeZone !== store.timeZone || !text(appointment.slotId) || !text(appointment.policyVersion) ||
      !text(appointment.serviceDate) || !integer(appointment.startAt, true) || !integer(appointment.endAt, true) ||
      appointment.startAt >= appointment.endAt || !integer(appointment.minLeadTimeMinutes)) fail();
  const contact = sections.contactSnapshot, selection = sections.cartSelectionSnapshot;
  if (!text(contact.name) || !text(contact.phone) || !text(selection.cartId) || !integer(selection.cartVersion) ||
      !Array.isArray(selection.selectedLines) || !selection.selectedLines.length) fail();
  selection.selectedLines = selection.selectedLines.map(line => pick(line, ['lineId', 'lineVersion', 'quantity', 'messageFingerprint']));
  for (const line of selection.selectedLines) {
    if (!text(line.lineId) || !integer(line.lineVersion) || !integer(line.quantity, true) || !text(line.messageFingerprint)) fail();
  }
  if (input.fulfillment === 'DELIVERY') {
    const address = sections.addressSnapshot;
    for (const key of ['addressId', 'receiverName', 'phone', 'province', 'city', 'district', 'detail']) if (!text(address[key])) fail();
    if (!plain(address.regionCodes) || !Object.prototype.hasOwnProperty.call(address, 'location')) fail();
    address.regionCodes = pick(address.regionCodes, ['province', 'city', 'district']);
    if (address.location !== null) address.location = pick(address.location, ['longitude', 'latitude', 'coordinateSystem', 'source', 'verifiedAt']);
    if (!text(sections.deliverySnapshot.ruleId) || !integer(sections.deliverySnapshot.ruleVersion) ||
        !text(sections.deliverySnapshot.evaluationId) || !text(sections.deliverySnapshot.addressFingerprint)) fail();
  } else if (input.fulfillment === 'PICKUP') {
    sections.deliverySnapshot = { ruleId: null, ruleVersion: null, feeCents: sections.deliverySnapshot.feeCents,
      evaluationId: null, addressFingerprint: null };
  }
  if (!Array.isArray(input.items) || !input.items.length) fail();
  const items = input.items.map(source => {
    const item = pick(source, ['lineId', 'productId', 'skuId', 'productVersion', 'skuVersion', 'categoryCode',
      'productName', 'skuDescription', 'selectedOptions', 'productImage', 'unitPriceCents', 'quantity', 'cakeMessage']);
    for (const key of ['lineId', 'productId', 'skuId', 'productName', 'skuDescription']) if (!text(item[key])) fail();
    if (!integer(item.productVersion) || !integer(item.skuVersion) ||
        !['CAKE', 'MINI_CAKE', 'BREAD'].includes(item.categoryCode) || !Array.isArray(item.selectedOptions) ||
        (item.cakeMessage !== null && typeof item.cakeMessage !== 'string')) fail();
    item.selectedOptions = item.selectedOptions.map(option => pick(option, ['groupCode', 'optionCode', 'label']));
    for (const option of item.selectedOptions) for (const key of ['groupCode', 'optionCode', 'label']) if (!text(option[key])) fail();
    if (item.productImage !== null) {
      item.productImage = pick(item.productImage, ['assetId', 'storageRef', 'sourceKind', 'revision']);
      if (!text(item.productImage.assetId) || !text(item.productImage.storageRef) || !text(item.productImage.revision) ||
          !['REAL_PHOTO', 'DESIGN_PREVIEW'].includes(item.productImage.sourceKind)) fail();
    }
    return item;
  });
  const selectedById = new Map(selection.selectedLines.map(line => [line.lineId, line]));
  if (selectedById.size !== selection.selectedLines.length || new Set(items.map(item => item.lineId)).size !== items.length ||
      selectedById.size !== items.length || items.some(item => selectedById.get(item.lineId)?.quantity !== item.quantity)) fail();
  const amounts = calculateOrderAmounts(items, sections.deliverySnapshot.feeCents, input.fulfillment);
  const orderNote = input.orderNote === undefined ? '' : input.orderNote;
  if (typeof orderNote !== 'string') fail();
  return copyJSON({ schemaVersion: 1, quoteId: input.quoteId, tradePolicyVersion: input.tradePolicyVersion,
    fulfillment: input.fulfillment, orderNote, ...sections,
    items: items.map((item, index) => ({ ...item, lineTotalCents: amounts.lineTotalsCents[index] })),
    currency: amounts.currency, subtotalCents: amounts.subtotalCents,
    deliveryFeeCents: amounts.deliveryFeeCents, totalCents: amounts.totalCents });
}
module.exports = { OrderFactsError, calculateOrderAmounts, assertOrderAmounts, captureOrderFacts };
