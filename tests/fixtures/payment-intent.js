'use strict';
// OFFLINE_TEST_ONLY: serial memory transactions, no SDK, keys or provider calls.
const {setup:configurationSetup,clone,now}=require('./payment-configuration');
const {createPaymentConfigurationModel}=require('../../cloudfunctions/_shared/payment-configuration-model');
const {identityFromPlatform,resolveCustomer}=require('../../cloudfunctions/_shared/authorization-model');
const {scopedDocumentId,requestFingerprint}=require('../../cloudfunctions/_shared/idempotency-model');
const {TRADE_POLICY}=require('../../cloudfunctions/_shared/trade-model');
const {createPaymentIntentService}=require('../../cloudfunctions/_shared/payment-intent-service');
function fail(code){throw Object.assign(new Error(code),{code});}
function setup({stage='test',mode='PICKUP',route='WECHATPAY_DIRECT_V3',extendTransaction=null}={}){
  const config=configurationSetup(route,stage),settings={stage,appId:config.runtime.appId,environment:config.runtime.environment};
  if(stage!=='production')Object.assign(config.profile.controlledTest,{expiresAt:now+3600000,maxTotalCents:100000,maxTransactions:4});
  function actor(id='buyer'){
    const platform={APPID:settings.appId,ENV:settings.environment,OPENID:'OFFLINE_'+id};
    const user={...identityFromPlatform(platform,settings),schemaVersion:1,version:0,status:'ACTIVE'};
    return {principal:resolveCustomer(platform,settings,user),user};
  }
  const buyer=actor(),principal=buyer.principal;
  const order={_id:'OFFLINE_ORDER',schemaVersion:1,version:0,createdAt:now-1000,updatedAt:now-1000,
    ownerId:principal.subjectId,storeId:'OFFLINE_STORE',quoteId:'OFFLINE_QUOTE',orderNo:'V1-'+ 'A'.repeat(64),
    tradePolicyVersion:TRADE_POLICY.version,fulfillment:mode,currency:'CNY',totalCents:16800,
    paidCents:0,refundedCents:0,refundReservedCents:0,orderStatus:'PENDING_PAYMENT',paymentStatus:'UNPAID',refundStatus:'NONE',
    paymentDeadlineAt:now+900000,appointmentSnapshot:{slotId:'OFFLINE_SLOT'}};
  const expected=[{resourceKind:'STOCK',resourceId:'OFFLINE_STOCK',requiredUnits:2},
    {resourceKind:'SLOT',resourceId:'OFFLINE_SLOT',requiredUnits:1}];
  const reservations=expected.map(r=>({_id:scopedDocumentId('reservation',[settings.environment,order._id,r.resourceKind,r.resourceId]),
    schemaVersion:1,version:0,createdAt:order.createdAt,updatedAt:order.createdAt,orderId:order._id,storeId:order.storeId,
    resourceKind:r.resourceKind,resourceId:r.resourceId,quantity:r.requiredUnits,status:'HELD',expiresAt:order.paymentDeadlineAt,
    resolvedAt:null,resolutionLogId:null}));
  const held={quote:{_id:order.quoteId,version:1,schemaVersion:1,ownerId:order.ownerId,storeId:order.storeId,
    status:'CONSUMED',consumedOrderId:order._id,resourceVersions:expected,facts:{fulfillment:mode,appointmentSnapshot:order.appointmentSnapshot}},
    reservations,resources:expected.map(r=>({resourceKind:r.resourceKind,resource:{_id:r.resourceId,storeId:order.storeId,
      version:1,status:'OPEN',heldUnits:r.requiredUnits,confirmedUnits:0,consumedUnits:0,
      ...(r.resourceKind==='STOCK'?{totalUnits:20}:{capacityTotal:mode==='PICKUP'?3:1,fulfillment:mode})}}))};
  const grant=config.profile.controlledTest,budget=grant?{_id:scopedDocumentId('controlled-payment-budget',
    [settings.environment,settings.appId,config.profile.merchantId,grant.reference]),schemaVersion:1,version:0,
    createdAt:now-1000,updatedAt:now-1000,authorizationFingerprint:requestFingerprint(grant),
    reservedAmountCents:0,reservedTransactions:0,usedAmountCents:0,usedTransactions:0}:null;
  const db={users:{[principal.subjectId]:buyer.user},orders:{[order._id]:order},held,heldByOrder:{},payments:{},receipts:{},budget,manifest:clone(config.manifest)};
  const controls={now,failAt:0,zeroAt:0,denyFence:false,beforeCommit:null,commits:0,numberCalls:0,
    fixedNumber:null,loseResponse:false,nowSequence:null};let queue=Promise.resolve(),sequence=0;
  const runTransaction=work=>{
    const pending=queue.then(async()=>{
      const snapshot=JSON.stringify(db),staged=clone(db);let writes=0;
      const changed=()=>{writes++;if(controls.failAt===writes)fail('OFFLINE_INJECTED_FAILURE');return controls.zeroAt===writes?0:1;};
      const tx={
        readUser:async id=>staged.users[id]||null,readOrder:async id=>staged.orders[id]||null,
        readPayments:async id=>Object.values(staged.payments).filter(p=>p.orderId===id),
        readReceipt:async id=>staged.receipts[id]||null,readHeldState:async o=>staged.heldByOrder[o._id]||staged.held,
        readBudget:async()=>staged.budget,
        readPaymentByMerchantNumber:async(merchant,number)=>Object.values(staged.payments).find(p=>p.merchantId===merchant&&p.outTradeNo===number)||null,
        assertPaymentReads:async()=>!controls.denyFence&&JSON.stringify(db)===snapshot,
        insertPayment:async p=>{
          if(staged.payments[p._id]||Object.values(staged.payments).some(v=>(v.orderId===p.orderId&&v.status!=='CLOSED')||
            v.merchantId===p.merchantId&&v.outTradeNo===p.outTradeNo))fail('VERSION_CONFLICT');
          staged.payments[p._id]=clone(p);return changed();},
        savePayment:async(p,version)=>{if(staged.payments[p._id]?.version!==version)return 0;staged.payments[p._id]=clone(p);return changed();},
        saveBudget:async(b,version)=>{if(staged.budget?.version!==version)return 0;staged.budget=clone(b);return changed();},
        insertReceipt:async r=>{if(staged.receipts[r._id])return 0;staged.receipts[r._id]=clone(r);return changed();},
        readConfiguration:()=>staged.manifest
      };
      if(extendTransaction)extendTransaction(tx,staged,changed);
      const result=await work(tx);
      if(controls.beforeCommit)await controls.beforeCommit(db);
      if(JSON.stringify(db)!==snapshot)fail('VERSION_CONFLICT');
      Object.assign(db,staged);controls.commits++;
      if(controls.loseResponse){controls.loseResponse=false;fail('OFFLINE_RESPONSE_LOST');}
      return result;
    });queue=pending.catch(()=>{});return pending;
  };
  function service(){return createPaymentIntentService({runTransaction,now:()=>controls.nowSequence?controls.nowSequence.shift():controls.now,
    loadConfiguration:(tx,p,time)=>createPaymentConfigurationModel(tx.readConfiguration(),{...settings,now:time}),dispatchSafetyMs:2000,
    newOutTradeNo:()=>{controls.numberCalls++;return controls.fixedNumber||(++sequence).toString(16).padStart(32,'0');},
    newDispatchToken:()=> 'OFFLINE_DISPATCH_'+(++sequence)});}
  function event(key='offline-payment-key'){return {action:'create',payload:{orderId:order._id,expectedVersion:db.orders[order._id].version,idempotencyKey:key.padEnd(16,'_')}};}
  function additionalOrder(id){
    const next=clone(order);next._id=id;next.quoteId='QUOTE_'+id;db.orders[id]=next;
    const evidence=clone(held);evidence.quote._id=next.quoteId;evidence.quote.consumedOrderId=id;
    evidence.quote.resourceVersions.forEach((r,i)=>{
      r.resourceId+='_'+id;evidence.resources[i].resource._id=r.resourceId;
      const reservation=evidence.reservations[i];reservation.orderId=id;reservation.resourceId=r.resourceId;
      reservation._id=scopedDocumentId('reservation',[settings.environment,id,r.resourceKind,r.resourceId]);
      if(r.resourceKind==='SLOT'){
        next.appointmentSnapshot.slotId=r.resourceId;evidence.quote.facts.appointmentSnapshot.slotId=r.resourceId;
      }
    });db.heldByOrder[id]=evidence;
    return {action:'create',payload:{orderId:id,expectedVersion:0,idempotencyKey:'offline-key-'+id}};
  }
  return {db,controls,principal,actor,event,service,settings,config,runTransaction,clone,additionalOrder};
}
module.exports={setup};
