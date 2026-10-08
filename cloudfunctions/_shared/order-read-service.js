'use strict';
// Read-only internal orchestration; injected snapshot adapter, no SDK/handler.
const {parseApiRequest}=require('./api-contract');
const {requireOwner}=require('./authorization-model');
const {requireCurrentOrderUser}=require('./order-transaction-service');
const {createOrderReadModel}=require('./order-read-model');
function fail(code){throw Object.assign(new Error(code),{code});}
function createOrderReadService({runReadTransaction,now,context,key}) {
  if(typeof runReadTransaction!=='function'||typeof now!=='function')fail('INVALID_CONFIGURATION');
  const clock=()=>{
    const value=now();
    if(!Number.isSafeInteger(value)||value<=0||!Number.isFinite(new Date(value).getTime()))fail('INVALID_CONFIGURATION');
    return value;
  };
  // Model creation inside each request validates scoped settings and copies key bytes.
  return Object.freeze({async execute(event,principal){
    requireOwner(principal,{ownerId:principal&&principal.subjectId});
    const {contract,payload}=parseApiRequest('order',event);
    if(!['list','get'].includes(contract.action))fail('INVALID_REQUEST');
    return runReadTransaction(async tx=>{
      if(!tx||['readUser','readOrderPage','readOrderDetail','assertReadSnapshot'].some(name=>typeof tx[name]!=='function'))fail('INVALID_READ_ADAPTER');
      const user=await tx.readUser(principal.subjectId);requireCurrentOrderUser(user,principal);
      const timestampNow=clock(),empty={user,orders:[],items:[],logs:[],cancellations:[],mediaAssets:[]};
      const planner=createOrderReadModel(empty,principal,context,key);
      const query=contract.action==='list'?planner.planListQuery(event,timestampNow):null;
      const state=contract.action==='list'?await tx.readOrderPage(query):
        await tx.readOrderDetail({ownerId:principal.subjectId,orderId:payload.orderId});
      if(!state||!Array.isArray(state.orders)||state.orders.some(order=>!order||order.ownerId!==principal.subjectId)) {
        fail(contract.action==='get'?'NOT_FOUND':'INVALID_ORDER_READ_STATE');
      }
      if(contract.action==='get'&&(state.orders.length!==1||state.orders[0]._id!==payload.orderId))fail('NOT_FOUND');
      if(query&&(state.orders.length>query.limit||state.orders.some(order=>!query.states.includes(order.orderStatus))))fail('INVALID_ORDER_READ_STATE');
      const model=createOrderReadModel({...state,user},principal,context,key);
      // Query planning precedes database reads. Re-read the server clock so a
      // legitimate record committed during that interval is not labelled future.
      const readNow=clock();if(readNow<timestampNow)fail('INVALID_CONFIGURATION');
      const result=contract.action==='list'?model.list(event,readNow):model.get(event,readNow);
      if(await tx.assertReadSnapshot({userId:principal.subjectId,userVersion:principal.userVersion,
          orderIds:state.orders.map(order=>order._id)})!==true)fail('VERSION_CONFLICT');
      return result;
    });
  }});
}
module.exports={createOrderReadService};
