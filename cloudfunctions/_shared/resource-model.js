'use strict';
const { scopedDocumentId } = require('./idempotency-model');
// Produces a proposed all-resource hold. Applying it still requires an actual DB transaction.
class ResourceModelError extends Error {
  constructor(code) { super(code); this.name='ResourceModelError'; this.code=code; }
}
function fail(code) { throw new ResourceModelError(code); }
function plain(value) { return value !== null && typeof value === 'object' && [Object.prototype,null].includes(Object.getPrototypeOf(value)); }
function text(value) { return typeof value === 'string' && value.trim().length > 0; }
function integer(value, positive=false) { return Number.isSafeInteger(value) && value >= (positive?1:0); }
function key(kind,id) { return JSON.stringify([kind,id]); }
function validateResource(resourceKind, resource) {
  if (!['STOCK','SLOT'].includes(resourceKind) || !plain(resource) || !text(resource._id) || !text(resource.storeId) ||
      !integer(resource.version) || !['OPEN','CLOSED'].includes(resource.status)) fail('INVALID_RESOURCE');
  const total = resourceKind === 'STOCK' ? resource.totalUnits : resource.capacityTotal;
  if (!integer(total) || !integer(resource.heldUnits) || !integer(resource.confirmedUnits) || !integer(resource.consumedUnits)) fail('INVALID_RESOURCE');
  const occupied = resource.heldUnits + resource.confirmedUnits + resource.consumedUnits;
  if (!integer(occupied) || occupied > total) fail('INVALID_RESOURCE');
  return total - occupied;
}
function planResourceHolds(order, requests, resources, context) {
  if (!plain(order) || !text(order._id) || !text(order.storeId) || !integer(order.paymentDeadlineAt,true) ||
      !plain(context) || !text(context.environment) || !integer(context.now,true) || order.paymentDeadlineAt <= context.now ||
      !Array.isArray(requests) || !requests.length || !Array.isArray(resources)) fail('INVALID_RESERVATION_PLAN');
  const byKey = new Map();
  for (const entry of resources) {
    if (!plain(entry)) fail('INVALID_RESOURCE');
    validateResource(entry.resourceKind,entry.resource);
    const resourceKey=key(entry.resourceKind,entry.resource._id);
    if (byKey.has(resourceKey)) fail('INVALID_RESOURCE');
    byKey.set(resourceKey,entry.resource);
  }
  const seen = new Set(), resourceChanges = [], reservations = [];
  let slots = 0, stocks = 0;
  for (const request of requests) {
    if (!plain(request) || !['STOCK','SLOT'].includes(request.resourceKind) || !text(request.resourceId) ||
        !integer(request.quantity,true) || !integer(request.expectedVersion)) fail('INVALID_RESERVATION_PLAN');
    const resourceKey=key(request.resourceKind,request.resourceId);
    if (seen.has(resourceKey)) fail('INVALID_RESERVATION_PLAN');
    seen.add(resourceKey);
    if (request.resourceKind === 'SLOT') slots++; else stocks++;
    const resource=byKey.get(resourceKey);
    if (!resource) fail('INVALID_RESOURCE');
    if (resource.storeId !== order.storeId) fail('RESOURCE_SCOPE_MISMATCH');
    if (resource.version !== request.expectedVersion) fail('RESOURCE_VERSION_CONFLICT');
    const available=validateResource(request.resourceKind,resource);
    if (resource.status !== 'OPEN' || request.quantity > available) fail('RESOURCE_UNAVAILABLE');
    if (!integer(resource.version+1) || !integer(resource.heldUnits+request.quantity)) fail('INVALID_RESOURCE');
    resourceChanges.push(Object.freeze({resourceKind:request.resourceKind,resourceId:resource._id,
      expectedVersion:resource.version,nextVersion:resource.version+1,heldUnits:resource.heldUnits+request.quantity,
      confirmedUnits:resource.confirmedUnits,consumedUnits:resource.consumedUnits}));
    reservations.push(Object.freeze({_id:scopedDocumentId('reservation',[context.environment,order._id,request.resourceKind,resource._id]),
      schemaVersion:1,version:0,createdAt:context.now,updatedAt:context.now,orderId:order._id,storeId:order.storeId,
      resourceKind:request.resourceKind,resourceId:resource._id,quantity:request.quantity,status:'HELD',
      expiresAt:order.paymentDeadlineAt,resolvedAt:null,resolutionLogId:null}));
  }
  if (slots !== 1 || stocks < 1 || seen.size !== byKey.size) fail('INVALID_RESERVATION_PLAN');
  return Object.freeze({resourceChanges:Object.freeze(resourceChanges),reservations:Object.freeze(reservations)});
}
module.exports={ResourceModelError,validateResource,planResourceHolds};
