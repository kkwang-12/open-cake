'use strict';
// Internal atomic delivery service. No SDK, rider API, auto-confirmation or handler.
const {parseApiRequest}=require('./api-contract');
const {requireOwner,resolveStoreOrderActor}=require('./authorization-model');
const {requireCurrentOrderUser}=require('./order-transaction-service');
const {validateOrderTime}=require('./order-cancellation-model');
const {planControlledOrderCommand}=require('./order-command-model');
const {validateTradeSnapshot}=require('./trade-model');
const {validateFulfillmentResources,planRetainedFulfillment}=require('./order-fulfillment-resources');
const {idempotencyId,decideIdempotency,scopedDocumentId,requestFingerprint,canonicalJSON}=require('./idempotency-model');
function fail(code){throw Object.assign(new Error(code),{code});}
const text=value=>typeof value==='string'&&value.trim()===value&&value.length>0&&value.length<=256;
const time=value=>Number.isSafeInteger(value)&&value>0&&Number.isFinite(new Date(value).getTime());
const AXES=['orderStatus','paymentStatus','refundStatus','paidCents','refundedCents','refundReservedCents','version'];
const AXIS_KEYS=[...AXES].sort().join(',');
const axes=order=>Object.fromEntries(AXES.map(field=>[field,order[field]]));
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
const output=(disposition,result)=>freeze({scope:'OFFLINE_DELIVERY_RESULT',disposition,result,
  cloudVerified:false,callable:false,fulfillmentAllowed:false});
function createOrderDeliveryService({runTransaction,now,newRequestId,environment,appId,completionPolicy=null,authorizeMerchant=null}){
  if(![runTransaction,now,newRequestId].every(fn=>typeof fn==='function')||!text(environment)||!text(appId))fail('INVALID_CONFIGURATION');
  if(authorizeMerchant!==null&&typeof authorizeMerchant!=='function')fail('INVALID_CONFIGURATION');
  completionPolicy=completionPolicy===null?null:Object.freeze({...completionPolicy});
  function validateDeliveryOrder(order,timestamp){
    validateOrderTime(order,timestamp);
    if(order.fulfillment==='DELIVERY'&&(order.pickupCredential!==null||
        (['READY','DELIVERING','COMPLETED'].includes(order.orderStatus)&&
          (!time(order.paidAt)||order.paidAt<order.createdAt||order.paidAt>order.updatedAt))||
        (order.orderStatus==='COMPLETED'? !time(order.completedAt)||order.completedAt<order.createdAt||
          order.completedAt>order.updatedAt:order.completedAt!==null)))fail('INVALID_TRADE_MODEL');
  }
  async function fence(tx,order,principal,actor,state,logId=null){
    if(await tx.assertDeliveryReads({orderId:order._id,orderVersion:order.version,userId:principal.subjectId,
      userVersion:principal.userVersion,grant:actor.grant||null,logId,
      quoteId:state?.quote?._id||null,quoteVersion:state?.quote?.version??null,
      reservationVersions:state?.reservations?.map(r=>({id:r._id,version:r.version,status:r.status}))||[],
      resourceVersions:state?.resources?.map(r=>({kind:r.resourceKind,id:r.resource._id,
        version:r.resource.version,status:r.resource.status}))||[]})!==true)fail('VERSION_CONFLICT');
  }
  function replayEvidence(order,state,result,receiptId,payload,command,principal,actor){
    const logId=scopedDocumentId('order-log',[receiptId,order._id]);
    if(!Array.isArray(state.logs))fail('INVALID_IDEMPOTENCY_RECORD');
    const matches=state.logs.filter(log=>log?._id===logId),log=matches[0];
    const from=command==='START_DELIVERY'?'READY':'DELIVERING',to=command==='START_DELIVERY'?'DELIVERING':'COMPLETED';
    if(result.errorCode!==null||result.entityId!==order._id||result.version===null||result.version>order.version||
        matches.length!==1||!log||log.orderId!==order._id||log.schemaVersion!==1||log.version!==0||
        log.command!==command||log.actor?.subjectId!==principal.subjectId||log.actor.type!==actor.type||
        !time(log.createdAt)||log.createdAt<order.createdAt||log.createdAt>order.updatedAt||log.updatedAt!==log.createdAt||
        log.before?.version!==payload.expectedVersion||log.after?.version!==result.version||
        Object.keys(log.before).sort().join(',')!==AXIS_KEYS||Object.keys(log.after).sort().join(',')!==AXIS_KEYS||
        result.version!==payload.expectedVersion+1||log.before.orderStatus!==from||log.after.orderStatus!==to||
        canonicalJSON({...log.before,orderStatus:to,version:result.version})!==canonicalJSON(log.after))fail('INVALID_IDEMPOTENCY_RECORD');
    try{validateTradeSnapshot({...order,...log.before,id:order._id});validateTradeSnapshot({...order,...log.after,id:order._id});}
    catch(_){fail('INVALID_IDEMPOTENCY_RECORD');}
    if(order.fulfillment!=='DELIVERY'||command==='COMPLETE_DELIVERY'&&
        (order.orderStatus!=='COMPLETED'||order.completedAt!==log.createdAt))fail('INVALID_IDEMPOTENCY_RECORD');
    return logId;
  }
  return Object.freeze({
    async execute(domain,event,principal){
      requireOwner(principal,{ownerId:principal&&principal.subjectId});
      if(principal.environment!==environment||principal.appId!==appId)fail('FORBIDDEN');
      const {contract,payload}=parseApiRequest(domain,event);
      const command=domain==='order'&&contract.action==='delivery.confirm'?'COMPLETE_DELIVERY':
        domain==='admin'&&contract.action==='order.transition'?payload.command:null;
      if(!['START_DELIVERY','COMPLETE_DELIVERY'].includes(command))fail('UNSUPPORTED_ORDER_COMMAND');
      if(payload.pickupCredential!==undefined)fail('INVALID_REQUEST');
      const requestId=newRequestId();if(!text(requestId))fail('INVALID_CONFIGURATION');
      return runTransaction(async tx=>{
        const methods=['readUser','readOrder','readReceipt','readDeliveryState','assertDeliveryReads','saveOrder','insertLog','insertReceipt'];
        if(!tx||methods.some(name=>typeof tx[name]!=='function'))fail('INVALID_TRANSACTION_ADAPTER');
        requireCurrentOrderUser(await tx.readUser(principal.subjectId),principal);
        const order=await tx.readOrder(payload.orderId);if(!order||order._id!==payload.orderId)fail('NOT_FOUND');
        const timestamp=now();validateDeliveryOrder(order,timestamp);
        const actor=domain==='order'?requireOwner(principal,order):null;
        const scopedRoles=domain==='admin'&&authorizeMerchant!==null?await authorizeMerchant(tx,principal,order):null;
        const state=await tx.readDeliveryState(order,principal);
        if(scopedRoles!==null)state.roles=scopedRoles;
        const authority=actor||resolveStoreOrderActor(order,command,principal,state?.roles);
        const request={environment,actorScope:JSON.stringify([appId,principal.subjectId]),
          command:domain+'.'+contract.action,key:payload.idempotencyKey,requestFingerprint:requestFingerprint(payload)};
        const receiptId=idempotencyId(request),decision=decideIdempotency(await tx.readReceipt(receiptId),request);
        if(decision.disposition==='BUSY')fail('BUSY');
        if(decision.disposition==='REPLAY'){
          const logId=replayEvidence(order,state,decision.result,receiptId,payload,command,principal,authority);
          await fence(tx,order,principal,authority,null,logId);return output('REPLAY',decision.result);
        }
        const plan=planControlledOrderCommand(domain,event,{...order,id:order._id},principal,state?.roles,
          {now:timestamp,requestId,redactReason:()=> '门店配送操作'});
        const handledEffects=['APPLY_ORDER_PATCH','RECORD_DELIVERY_CONFIRMATION','RECORD_FULFILLMENT',
          'APPEND_ORDER_LOG','SAVE_IDEMPOTENCY_RESULT'];
        if(plan.requiredAtomicEffects.some(effect=>!handledEffects.includes(effect)))fail('UNSUPPORTED_ORDER_EFFECT');
        if(command==='COMPLETE_DELIVERY')planRetainedFulfillment(order,state,{environment,now:timestamp},completionPolicy);
        else validateFulfillmentResources(order,state,{environment,now:timestamp});
        await fence(tx,order,principal,authority,state);
        const next={...order,...plan.patch};
        if(await tx.saveOrder(next,order.version)!==1)fail('VERSION_CONFLICT');
        const {requiresFinalAfter,...draft}=plan.logDraft;
        if(await tx.insertLog({...draft,schemaVersion:1,version:0,updatedAt:timestamp,after:axes(next),reason:''})!==1)fail('VERSION_CONFLICT');
        const result={entityId:order._id,version:next.version,errorCode:null};
        if(await tx.insertReceipt({...request,_id:receiptId,schemaVersion:1,version:0,createdAt:timestamp,updatedAt:timestamp,
          status:'SUCCEEDED',result,leaseUntil:null,retentionUntil:null})!==1)fail('VERSION_CONFLICT');
        const latest=now();validateDeliveryOrder(next,latest);if(latest<timestamp)fail('INVALID_CONFIGURATION');
        // RECORD_DELIVERY_CONFIRMATION / RECORD_FULFILLMENT are the final order and
        // trusted actor log, committed with receipt. No second resource consumption.
        return output(command==='START_DELIVERY'?'DELIVERING':'COMPLETED',result);
      });
    }
  });
}
module.exports={createOrderDeliveryService};
