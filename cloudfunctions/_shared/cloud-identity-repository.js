'use strict';
// wx-server-sdk 4.0.2 server adapter. Caller supplies SDK/config, never event identity.
const { identityFromPlatform, resolveCustomer, AuthorizationModelError } = require('./authorization-model');
class IdentityRepositoryError extends Error {
  constructor(code) { super(code); this.name = 'IdentityRepositoryError'; this.code = code; }
}
function fail(code) { throw new IdentityRepositoryError(code); }
function createCloudIdentityRepository(cloud, settings, now = Date.now) {
  if (!cloud || typeof cloud.getWXContext !== 'function' || typeof cloud.database !== 'function' ||
      typeof now !== 'function') fail('INVALID_IDENTITY_ADAPTER');
  async function ensureCustomer() {
    // Validate platform identity/config before touching the database.
    const identity = identityFromPlatform(cloud.getWXContext(), settings);
    const time = now();
    if (!Number.isSafeInteger(time) || time <= 0) fail('INVALID_SERVER_TIME');
    const db = cloud.database({ env: settings.environment, throwOnNotFound: false });
    if (!db || typeof db.runTransaction !== 'function') fail('INVALID_IDENTITY_ADAPTER');
    try {
      return await db.runTransaction(async transaction => {
        const users = transaction.collection('users');
        const response = await users.doc(identity._id).get();
        // With throwOnNotFound=false, wx-server-sdk get() returns data:null, not [].
        if (!response || !Object.prototype.hasOwnProperty.call(response, 'data') ||
            (response.data !== null && (typeof response.data !== 'object' || Array.isArray(response.data))))
          fail('INVALID_DATABASE_RESPONSE');
        let user = response.data;
        const created = user === null;
        if (created) {
          user = { ...identity, schemaVersion: 1, version: 0, createdAt: time, updatedAt: time,
            displayName: '', avatar: null, defaultAddressId: null, status: 'ACTIVE', privacyConsent: null };
          // add with an explicit _id inserts; set would upsert and could overwrite a user.
          const inserted = await users.add({ data: user });
          if (!inserted || inserted._id !== identity._id) fail('INVALID_DATABASE_RESPONSE');
        }
        return { principal: resolveCustomer(cloud.getWXContext(), settings, user), created };
      });
    } catch (error) {
      if (error instanceof IdentityRepositoryError || error instanceof AuthorizationModelError) throw error;
      // No provider message/stack/identity in API errors. SDK transaction handles retry/rollback.
      fail('IDENTITY_STORAGE_FAILED');
    }
  }
  return Object.freeze({ ensureCustomer });
}
module.exports = { createCloudIdentityRepository, IdentityRepositoryError };
