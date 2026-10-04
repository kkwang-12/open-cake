'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {localDeliveryStatus}=require('../miniprogram/features/checkout/delivery-status');
test('X03 local status distinguishes no address, changed address and pending verification without any local success branch',()=>{
  const empty=localDeliveryStatus({address:null,status:'EMPTY'}),changed=localDeliveryStatus({address:null,status:'CHANGED'});
  assert.equal(empty.status,'ADDRESS_REQUIRED');assert.equal(changed.status,'ADDRESS_CHANGED');
  for(const address of [{location:null},{location:{longitude:117.2886,latitude:31.1498},inRange:true,verifiedAt:1,canDeliver:true}]){
    const result=localDeliveryStatus({address,status:'LOCAL_READY'});assert.equal(result.status,'PENDING_CLOUD_VERIFICATION');
    assert.equal(result.checkoutAllowed,false);assert.equal(result.requiresCloudValidation,true);assert.match(result.label,/待核验/);
  }
});
