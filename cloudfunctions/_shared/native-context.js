'use strict';
// The SCF second argument is platform-owned. Never parse event/payload as context.
// wx-server-sdk 4.0.2 reads WX_* from process.env; warm instances can retain them
// after a native request. A management invocation must not inherit that identity.
function nativeContextForInvocation(cloud, invocation) {
  if (!invocation || typeof invocation.environment !== 'string' ||
      typeof invocation.namespace !== 'string' || !invocation.namespace ||
      typeof invocation.request_id !== 'string' || !invocation.request_id) return {};
  let current;
  try { current = JSON.parse(invocation.environment); } catch (_) { return {}; }
  if (!current || typeof current !== 'object' || Array.isArray(current) ||
      typeof current.WX_OPENID !== 'string' || !current.WX_OPENID ||
      typeof current.WX_APPID !== 'string' || !current.WX_APPID) return {};
  const sdk = cloud.getWXContext();
  if (!sdk || sdk.OPENID !== current.WX_OPENID || sdk.APPID !== current.WX_APPID ||
      sdk.ENV !== invocation.namespace) return {};
  return Object.freeze({ OPENID: current.WX_OPENID, APPID: current.WX_APPID, ENV: invocation.namespace });
}
module.exports = { nativeContextForInvocation };
