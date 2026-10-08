'use strict';
// Read-only UI projection of the v1 device book. The main package cannot require
// the addresses subpackage. Unknown/corrupt storage is not an empty address book.
const STORAGE_KEY = 'jiajiale.local-addresses.v1';
const FIELDS = ['receiverName', 'phone', 'province', 'city', 'district', 'detail'];
const counter = value => Number.isSafeInteger(value) && value >= 0;
function validText(value) {
  if (typeof value !== 'string' || !value || value.length > 2048 ||
      value !== value.normalize('NFC').trim()) return false;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 32 || code === 127) return false;
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}
function readLocalAddressCount(settings, platform) {
  if (!settings || settings.stage !== 'development' || settings.mode !== 'shell' ||
      typeof settings.appId !== 'string' || !settings.appId || !platform) return null;
  try {
    const book = platform.getStorageSync(STORAGE_KEY + ':' + settings.appId);
    if (book === '' || book === undefined || book === null) return 0;
    if (book.version !== 1 || book.scope !== 'LOCAL_DEVICE' || !counter(book.revision) ||
        !Array.isArray(book.addresses) ||
        !(book.defaultAddressId === null || typeof book.defaultAddressId === 'string')) return null;
    const ids = new Set();
    for (const row of book.addresses) {
      if (!row || typeof row.addressId !== 'string' || !row.addressId || ids.has(row.addressId) ||
          !counter(row.version) || row.location !== null || row.requiresCloudValidation !== true ||
          !row.regionCodes || ['province', 'city', 'district'].some(key => row.regionCodes[key] !== null) ||
          !FIELDS.every(key => validText(row[key])) || !/^1[3-9]\d{9}$/.test(row.phone)) return null;
      ids.add(row.addressId);
    }
    if (book.defaultAddressId !== null && !ids.has(book.defaultAddressId)) return null;
    if (book.selection !== null && (!book.selection ||
        typeof book.selection.addressId !== 'string' || !counter(book.selection.version))) return null;
    return book.addresses.length;
  } catch (_) { return null; }
}
module.exports = { readLocalAddressCount, STORAGE_KEY };
