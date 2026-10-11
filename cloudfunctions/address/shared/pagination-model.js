'use strict';
// Server-only opaque cursors. Scope/query/sort and key are trusted server inputs.
const { createHmac, timingSafeEqual } = require('node:crypto');
const { canonicalJSON, requestFingerprint } = require('./idempotency-model');
const PAGE_POLICY = Object.freeze({ defaultSize: 20, maxSize: 50, cursorTtlMs: 900000 });
const SORTS = Object.freeze({
  CATALOG: Object.freeze([{ field: 'sortOrder', direction: 'ASC', type: 'N' }, { field: '_id', direction: 'ASC', type: 'ID' }].map(Object.freeze)),
  CREATED_DESC: Object.freeze([{ field: 'createdAt', direction: 'DESC', type: 'N' }, { field: '_id', direction: 'DESC', type: 'ID' }].map(Object.freeze)),
  UPDATED_DESC: Object.freeze([{ field: 'updatedAt', direction: 'DESC', type: 'N' }, { field: '_id', direction: 'DESC', type: 'ID' }].map(Object.freeze))
});
class PaginationModelError extends Error {
  constructor(code) { super(code); this.name = 'PaginationModelError'; this.code = code; }
}
function fail(code) { throw new PaginationModelError(code); }
function plain(value) {
  return value !== null && typeof value === 'object' &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value));
}
function text(value) { return typeof value === 'string' && value.trim() === value && value.length > 0 && value.isWellFormed(); }
function validSort(sortId) { return Object.prototype.hasOwnProperty.call(SORTS, sortId); }
function pageRequest(input = {}) {
  if (!plain(input) || Object.keys(input).some(key => !['pageSize', 'cursor'].includes(key))) fail('INVALID_PAGE_REQUEST');
  try { input = JSON.parse(canonicalJSON(input)); } catch (_) { fail('INVALID_PAGE_REQUEST'); }
  const pageSize = input.pageSize === undefined ? PAGE_POLICY.defaultSize : input.pageSize;
  const cursor = input.cursor === undefined ? null : input.cursor;
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > PAGE_POLICY.maxSize ||
      (cursor !== null && (!text(cursor) || cursor.length > 4096))) fail('INVALID_PAGE_REQUEST');
  return Object.freeze({ pageSize, cursor });
}
function binding(context) {
  if (!plain(context) || !text(context.environment) || !text(context.actorScope) ||
      !text(context.action) || !validSort(context.sortId) || !plain(context.query)) fail('INVALID_CURSOR_CONTEXT');
  // Full fingerprints do not place address / phone / search input into the token.
  try {
    return requestFingerprint({
      environment: context.environment, actorScope: context.actorScope,
      action: context.action, sortId: context.sortId, query: context.query
    });
  } catch (_) { fail('INVALID_CURSOR_CONTEXT'); }
}
function keyConfig(key) {
  if (!plain(key) || !text(key.id) || !Buffer.isBuffer(key.secret) || key.secret.length < 32) fail('INVALID_CURSOR_CONFIGURATION');
}
function timestamp(now) { if (!Number.isSafeInteger(now) || now <= 0) fail('INVALID_CURSOR_CONTEXT'); }
function anchor(last, sortId, code) {
  if (!validSort(sortId) || !Array.isArray(last) || last.length !== SORTS[sortId].length ||
      Object.keys(last).length !== last.length ||
      !last.every((value, index) => SORTS[sortId][index].type === 'ID'
        ? text(value) && value.length <= 256 : Number.isSafeInteger(value) && value >= 0)) fail(code);
}
function issueCursor(last, context, key, now) {
  keyConfig(key); timestamp(now);
  const scope = binding(context);
  anchor(last, context.sortId, 'INVALID_CURSOR_ANCHOR');
  const expiresAt = now + PAGE_POLICY.cursorTtlMs;
  if (!Number.isSafeInteger(expiresAt)) fail('INVALID_CURSOR_CONTEXT');
  const body = Buffer.from(canonicalJSON({
    version: 1, keyId: key.id, binding: scope, sortId: context.sortId,
    last, issuedAt: now, expiresAt
  }), 'utf8').toString('base64url');
  const signature = createHmac('sha256', key.secret).update(body).digest('base64url');
  const cursor = body + '.' + signature;
  if (cursor.length > 4096) fail('INVALID_CURSOR_ANCHOR');
  return cursor;
}
function readCursor(cursor, context, key, now) {
  keyConfig(key); timestamp(now);
  const scope = binding(context);
  if (typeof cursor !== 'string' || cursor.length > 4096 ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(cursor)) fail('CURSOR_INVALID');
  const [body, signature] = cursor.split('.');
  const bytes = Buffer.from(signature, 'base64url');
  const expected = createHmac('sha256', key.secret).update(body).digest();
  if (bytes.length !== expected.length || bytes.toString('base64url') !== signature ||
      !timingSafeEqual(bytes, expected)) fail('CURSOR_INVALID');
  let value;
  try {
    const raw = Buffer.from(body, 'base64url');
    if (raw.toString('base64url') !== body) fail('CURSOR_INVALID');
    value = JSON.parse(raw.toString('utf8'));
  } catch (_) { fail('CURSOR_INVALID'); }
  if (!plain(value) || Object.keys(value).sort().join(',') !==
      ['version','keyId','binding','sortId','last','issuedAt','expiresAt'].sort().join(',') ||
      value.version !== 1 || value.keyId !== key.id || value.binding !== scope ||
      value.sortId !== context.sortId || !Number.isSafeInteger(value.issuedAt) || value.issuedAt <= 0 ||
      value.issuedAt > now || value.expiresAt !== value.issuedAt + PAGE_POLICY.cursorTtlMs) fail('CURSOR_INVALID');
  anchor(value.last, context.sortId, 'CURSOR_INVALID');
  if (now >= value.expiresAt) fail('CURSOR_EXPIRED');
  return Object.freeze([...value.last]);
}
function seekConditions(last, sortId) {
  anchor(last, sortId, 'INVALID_CURSOR_ANCHOR');
  // Lexicographic seek: (a < A) OR (a == A AND id < ID) for DESC.
  // Adapter must AND this disjunction with trusted owner/store/published filters.
  return Object.freeze(SORTS[sortId].map((sort, index) => Object.freeze(
    SORTS[sortId].slice(0, index + 1).map((field, position) => Object.freeze({
      field: field.field, operator: position < index ? 'EQ' : sort.direction === 'ASC' ? 'GT' : 'LT',
      value: last[position]
    }))
  )));
}
module.exports = { PAGE_POLICY, SORTS, PaginationModelError, pageRequest, issueCursor, readCursor, seekConditions };
