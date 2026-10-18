'use strict';
// Immutable policy bound to new quote/order facts; never inferred for old orders.
const SLOT_RELEASE_POLICY_VERSION = 'cancel-before-fulfillment-v1-20261018';
function isBoundSlotPolicy(order) {
  const version = order?.appointmentSnapshot?.releasePolicyVersion;
  if (version === undefined) return false;
  if (version !== SLOT_RELEASE_POLICY_VERSION) throw Object.assign(new Error('POLICY_VERSION_UNSUPPORTED'), {code:'POLICY_VERSION_UNSUPPORTED'});
  return true;
}
function validateSlotPolicyBinding(order, reservation) {
  const bound = isBoundSlotPolicy(order);
  if (reservation.releasePolicyVersion !== order?.appointmentSnapshot?.releasePolicyVersion) {
    throw Object.assign(new Error('POLICY_VERSION_UNSUPPORTED'), {code:'POLICY_VERSION_UNSUPPORTED'});
  }
  return bound;
}
module.exports = {SLOT_RELEASE_POLICY_VERSION, isBoundSlotPolicy, validateSlotPolicyBinding};
