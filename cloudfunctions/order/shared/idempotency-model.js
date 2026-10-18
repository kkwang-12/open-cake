'use strict';
const { createHash } = require('node:crypto');
// SDK-independent preparation. These guards do not acquire locks or write records.
class IdempotencyModelError extends Error {
  constructor(code) { super(code); this.name = 'IdempotencyModelError'; this.code = code; }
}
function fail(code) { throw new IdempotencyModelError(code); }
function plain(value) { return value !== null && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value)); }
function text(value) { return typeof value === 'string' && value.trim().length > 0; }
function canonicalJSON(value, ancestors = new Set()) {
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') {
    if (!value.isWellFormed()) fail('INVALID_IDEMPOTENCY_INPUT');
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('INVALID_IDEMPOTENCY_INPUT');
    return JSON.stringify(value);
  }
  if ((!Array.isArray(value) && !plain(value)) || ancestors.has(value)) fail('INVALID_IDEMPOTENCY_INPUT');
  if (Object.getOwnPropertySymbols(value).length) fail('INVALID_IDEMPOTENCY_INPUT');
  ancestors.add(value);
  let output;
  if (Array.isArray(value)) {
    const keys = Object.keys(value);
    if (keys.length !== value.length || keys.some((key, index) => key !== String(index))) fail('INVALID_IDEMPOTENCY_INPUT');
    output = '['+keys.map(key => {
      const descriptor = Object.getOwnPropertyDescriptor(value,key);
      if (!Object.prototype.hasOwnProperty.call(descriptor,'value')) fail('INVALID_IDEMPOTENCY_INPUT');
      return canonicalJSON(descriptor.value,ancestors);
    }).join(',')+']';
  } else {
    output = '{'+Object.keys(value).sort().map(key => {
      if (!key.isWellFormed()) fail('INVALID_IDEMPOTENCY_INPUT');
      const descriptor = Object.getOwnPropertyDescriptor(value,key);
      if (!Object.prototype.hasOwnProperty.call(descriptor,'value')) fail('INVALID_IDEMPOTENCY_INPUT');
      return JSON.stringify(key)+':'+canonicalJSON(descriptor.value,ancestors);
    }).join(',')+'}';
  }
  ancestors.delete(value);
  return output;
}
function scopedDocumentId(namespace, parts) {
  if (!text(namespace) || !Array.isArray(parts) || !parts.length || parts.some(part => !text(part))) fail('INVALID_IDEMPOTENCY_INPUT');
  // JSON tuple framing avoids delimiter collisions. Full digest; no trace truncation.
  return createHash('sha256').update(canonicalJSON(['document-id-v1',namespace,...parts])).digest('hex');
}
function requestFingerprint(payload) {
  return createHash('sha256').update('request-json-v1:'+canonicalJSON(payload)).digest('hex');
}
function idempotencyId(input) {
  if (!plain(input)) fail('INVALID_IDEMPOTENCY_INPUT');
  const { environment, actorScope, command, key } = input;
  return scopedDocumentId('idempotency',[environment,actorScope,command,key]);
}
function commandResult(result, status) {
  if (!plain(result) || (result.entityId !== null && !text(result.entityId)) ||
      (result.version !== null && (!Number.isSafeInteger(result.version) || result.version < 0)) ||
      (status === 'SUCCEEDED' ? result.errorCode !== null : !text(result.errorCode))) fail('INVALID_IDEMPOTENCY_RECORD');
  return Object.freeze({entityId:result.entityId,version:result.version,errorCode:result.errorCode});
}
function decideIdempotency(record, request) {
  if (!plain(request) || typeof request.requestFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(request.requestFingerprint)) fail('INVALID_IDEMPOTENCY_INPUT');
  const _id = idempotencyId(request);
  if (record === null) return Object.freeze({disposition:'CREATE',_id});
  if (!plain(record) || record._id !== _id || record.actorScope !== request.actorScope || record.command !== request.command ||
      record.key !== request.key || typeof record.requestFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(record.requestFingerprint) ||
      !['IN_PROGRESS','SUCCEEDED','FAILED'].includes(record.status)) fail('INVALID_IDEMPOTENCY_RECORD');
  if (record.requestFingerprint !== request.requestFingerprint) fail('IDEMPOTENCY_KEY_REUSED');
  if (record.status === 'IN_PROGRESS') {
    if (record.result !== null) fail('INVALID_IDEMPOTENCY_RECORD');
    // Even an expired lease needs reconciliation before takeover, particularly for money calls.
    return Object.freeze({disposition:'BUSY',_id});
  }
  return Object.freeze({disposition:'REPLAY',_id,result:commandResult(record.result,record.status)});
}
module.exports = { IdempotencyModelError, canonicalJSON, scopedDocumentId, requestFingerprint, idempotencyId, decideIdempotency };
