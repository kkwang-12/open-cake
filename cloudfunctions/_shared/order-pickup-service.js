'use strict';
// Injected atomic executor, not a deployed cloud handler or production credential API.
const {parseApiRequest}=require('./api-contract');
const {requireOwner,resolveStoreOrderActor}=require('./authorization-model');
const {requireCurrentOrderUser}=require('./order-transaction-service');
const {validateOrderTime}=require('./order-cancellation-model');
const {planControlledOrderCommand}=require('./order-command-model');
const {idempotencyId,decideIdempotency,scopedDocumentId}=require('./idempotency-model');
const {createPickupCredentialModel}=require('./pickup-credential-model');
function fail(code){throw Object.assign(new Error(code),{code});}
const text=value=>typeof value==='string'&&value.trim()===value&&value.length>0&&value.length<=256;
const AXES=['orderStatus','paymentStatus','refundStatus','paidCents','refundedCents','refundReservedCents','version'];
const axes=order=>Object.fromEntries(AXES.map(field=>[field,order[field]]));
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
const output=(disposition,result=null,extra={})=>freeze({scope:'OFFLINE_PICKUP_RESULT',disposition,result,...extra,
  cloudVerified:false,callable:false,fulfillmentAllowed:false});
function createOrderPickupService(options){
  const {runTransaction,now,newRequestId,environment,appId,authorizeMerchant=null}=options;
  if(![runTransaction,now,newRequestId].every(value=>typeof value==='function'))fail('INVALID_CONFIGURATION');
  if(authorizeMerchant!==null&&typeof authorizeMerchant!=='function')fail('INVALID_CONFIGURATION');
  const model=createPickupCredentialModel(options);
  function principalFor(principal){
    requireOwner(principal,{ownerId:principal&&principal.subjectId});
    if(principal.environment!==environment||principal.appId!==appId)fail('FORBIDDEN');
  }
  function adapter(tx,merchant){
    const names=['readUser','readOrder','assertPickupReads','saveOrder','insertLog',
      ...(merchant?['readPickupState','readReceipt','insertReceipt']:[])];
    if(!tx||names.some(name=>typeof tx[name]!=='function'))fail('INVALID_TRANSACTION_ADAPTER');
  }
  async function fence(tx,order,principal,actor,state){
    if(await tx.assertPickupReads({orderId:order._id,orderVersion:order.version,
      userId:principal.subjectId,userVersion:principal.userVersion,grant:actor.grant||null,
      quoteId:state?.quote?._id||null,quoteVersion:state?.quote?.version??null,
      reservationVersions:state?.reservations?.map(r=>({id:r._id,version:r.version,status:r.status}))||[],
      resourceVersions:state?.resources?.map(r=>({kind:r.resourceKind,id:r.resource._id,
        version:r.resource.version,status:r.resource.status}))||[]})!==true)fail('VERSION_CONFLICT');
  }
  async function writeOrderLog(tx,order,next,command,actor,timestamp,requestId){
    if(!Number.isSafeInteger(order.version+1)||next.version!==order.version+1)fail('VERSION_CONFLICT');
    if(await tx.saveOrder(next,order.version)!==1)fail('VERSION_CONFLICT');
    if(await tx.insertLog({_id:scopedDocumentId('order-log',[environment,order._id,String(next.version),command]),
      schemaVersion:1,version:0,createdAt:timestamp,updatedAt:timestamp,orderId:order._id,command,
      actor:{type:actor.type,subjectId:actor.subjectId,service:null},before:axes(order),after:axes(next),
      requestId,eventId:null,reason:'',publicMessage:command==='COMPLETE_PICKUP'?'已完成自取':''})!==1)fail('VERSION_CONFLICT');
  }
  function beforeCommit(order,timestamp,expiresAt){
    const latest=now();validateOrderTime(order,latest);
    if(latest<timestamp)fail('INVALID_CONFIGURATION');
    if(latest>=expiresAt)fail('PICKUP_CREDENTIAL_EXPIRED');
  }
  return Object.freeze({
    async get(event,principal){
      principalFor(principal);const {contract,payload}=parseApiRequest('order',event);
      if(contract.action!=='pickupCredential.get')fail('INVALID_REQUEST');
      const requestId=newRequestId();if(!text(requestId))fail('INVALID_CONFIGURATION');
      return runTransaction(async tx=>{
        adapter(tx,false);requireCurrentOrderUser(await tx.readUser(principal.subjectId),principal);
        const order=await tx.readOrder(payload.orderId);if(!order||order._id!==payload.orderId)fail('NOT_FOUND');
        const actor=requireOwner(principal,order),timestamp=now(),plan=model.get(order,timestamp);
        await fence(tx,order,principal,actor,null);
        if(plan.changed)await writeOrderLog(tx,order,{...order,pickupCredential:plan.credential,
          updatedAt:timestamp,version:order.version+1},'PICKUP_CREDENTIAL_ISSUED',actor,timestamp,requestId);
        beforeCommit(order,timestamp,plan.credential.expiresAt);
        // runTransaction must resolve AFTER commit; no plaintext credential is stored.
        return output(plan.changed?'ISSUED':'EXISTING',null,{credential:plan.dto});
      });
    },
    async complete(event,principal){
      principalFor(principal);const {contract,payload}=parseApiRequest('admin',event);
      if(contract.action!=='order.transition'||payload.command!=='COMPLETE_PICKUP')fail('INVALID_REQUEST');
      const requestId=newRequestId();if(!text(requestId))fail('INVALID_CONFIGURATION');
      return runTransaction(async tx=>{
        adapter(tx,true);requireCurrentOrderUser(await tx.readUser(principal.subjectId),principal);
        const order=await tx.readOrder(payload.orderId);if(!order||order._id!==payload.orderId)fail('NOT_FOUND');
        const timestamp=now();validateOrderTime(order,timestamp);
        const scopedRoles=authorizeMerchant===null?null:await authorizeMerchant(tx,principal,order);
        const state=await tx.readPickupState(order,principal);
        if(scopedRoles!==null)state.roles=scopedRoles;
        const actor=resolveStoreOrderActor(order,'COMPLETE_PICKUP',principal,state?.roles);
        const request={environment,actorScope:JSON.stringify([appId,principal.subjectId]),
          command:'admin.order.transition',key:payload.idempotencyKey,requestFingerprint:model.fingerprint(payload)};
        const receiptId=idempotencyId(request),decision=decideIdempotency(await tx.readReceipt(receiptId),request);
        if(decision.disposition==='BUSY')fail('BUSY');
        if(decision.disposition==='REPLAY'){
          if(decision.result.entityId!==order._id||decision.result.version===null||decision.result.version>order.version||
              (decision.result.errorCode===null&&(order.orderStatus!=='COMPLETED'||order.fulfillment!=='PICKUP'||
                order.pickupCredential?.usedBy!==principal.subjectId||!Number.isSafeInteger(order.pickupCredential.usedAt)||
                order.pickupCredential.usedAt<=0||order.pickupCredential.usedAt>=order.pickupCredential.expiresAt||
                order.pickupCredential.usedAt!==order.completedAt))||
              (decision.result.errorCode!==null&&decision.result.errorCode!=='PICKUP_CREDENTIAL_INVALID'))fail('INVALID_IDEMPOTENCY_RECORD');
          await fence(tx,order,principal,actor,null);
          return output('REPLAY',decision.result);
        }
        // O01 performs the version/state/capability checks. Never persist its raw effectInput.
        const command=planControlledOrderCommand('admin',event,{...order,id:order._id},principal,state.roles,
          {now:timestamp,requestId,redactReason:()=> '门店确认自取'});
        const verification=model.verify(order,payload.pickupCredential,principal.subjectId,timestamp);
        if(verification.errorCode&&verification.credential===null){
          await fence(tx,order,principal,actor,null);
          return output('REJECTED',{entityId:order._id,version:order.version,errorCode:verification.errorCode});
        }
        if(!verification.errorCode)model.resources(order,state,timestamp);
        await fence(tx,order,principal,actor,verification.errorCode?null:state);
        const next={...order,...(verification.errorCode?{version:order.version+1,updatedAt:timestamp}:command.patch),
          pickupCredential:verification.credential};
        await writeOrderLog(tx,order,next,verification.errorCode?'PICKUP_CREDENTIAL_REJECTED':'COMPLETE_PICKUP',actor,timestamp,requestId);
        const result={entityId:order._id,version:next.version,errorCode:verification.errorCode};
        if(await tx.insertReceipt({...request,_id:receiptId,schemaVersion:1,version:0,createdAt:timestamp,updatedAt:timestamp,
          status:verification.errorCode?'FAILED':'SUCCEEDED',result,leaseUntil:null,retentionUntil:null})!==1)fail('VERSION_CONFLICT');
        beforeCommit(order,timestamp,verification.credential.expiresAt);
        // Return rejection AFTER committing attempt counter + failed receipt. Throwing here
        // would roll back the very rate limit that prevents guessing.
        return output(verification.errorCode?'REJECTED':'COMPLETED',result);
      });
    }
  });
}
module.exports={createOrderPickupService};
