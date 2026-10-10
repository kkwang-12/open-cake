'use strict';
// CLI retries repeat an idempotent browser evaluation, never a cloud request.
const retryable=new Set(['WECHAT_EVALUATION_FAILED','WECHAT_RESPONSE_MISSING','WECHAT_EVALUATION_REJECTED']);
function createNativeBatchTransport({evaluate,environment,ticketPrefix,pause=()=>{},onRetry=()=>{},maxPolls=20}) {
  if(typeof evaluate!=='function' || typeof pause!=='function' || typeof onRetry!=='function' ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(environment||'') || !/^[A-Za-z][A-Za-z0-9_]{1,80}$/.test(ticketPrefix||'') ||
    !Number.isInteger(maxPolls) || maxPolls<1 || maxPolls>20)throw new Error('INVALID_NATIVE_TRANSPORT');
  let sequence=0;
  async function reliable(source,stage) {
    for(let attempt=1;attempt<=3;attempt++) {
      try{return await evaluate(source);}catch(error){
        if(!retryable.has(error.message) || attempt===3)throw error;
        onRetry({stage,attempt,code:error.message});await pause(1000);
      }
    }
  }
  return async function invokeMany(payloads) {
    if(!Array.isArray(payloads) || !payloads.length || payloads.length>2)throw new Error('INVALID_SCENARIO_LITERAL');
    for(const p of payloads) {
      if(!p || Object.keys(p).sort().join(',')!=='caseId,command,mode,operation' ||
        !/^[a-z0-9-]{1,24}$/.test(p.caseId) || !['prepare','hold','read','unique','read-protection','write-protection'].includes(p.operation) ||
        !['PICKUP','DELIVERY'].includes(p.mode) || !Number.isInteger(p.command) || p.command<0 || p.command>7)
        throw new Error('INVALID_SCENARIO_LITERAL');
    }
    const ticket=ticketPrefix+'_'+(++sequence),literal=JSON.stringify(payloads).replace(/"/g,"'");
    const source="function(){const app=getApp();if(!app||!wx.cloud)return {started:false};"+
      "if(app."+ticket+")return {started:true};app."+ticket+"={state:'RUNNING'};const inputs="+literal+";"+
      "Promise.all(inputs.map(function(payload){return wx.cloud.callFunction({name:'jjl-d04-probe',"+
      "data:{action:'probe',payload:payload},config:{env:'"+environment+"'}}).then(function(response){"+
      "return Object.assign({},response.result,{platformRequestId:response.requestID||response.requestId||null});});}))"+
      ".then(function(rows){app."+ticket+"={state:'COMPLETED',rows:rows};})"+
      ".catch(function(){app."+ticket+"={state:'FAILED'};});return {started:true};}";
    if((await reliable(source,'START')).started!==true)throw new Error('NATIVE_RUN_NOT_STARTED');
    for(let attempt=0;attempt<maxPolls;attempt++) {
      await pause(2000);
      const state=await reliable('function(){const app=getApp();return app&&app.'+ticket+"||{state:'MISSING'};}",'POLL');
      if(state.state==='COMPLETED')return state.rows;
      if(state.state!=='RUNNING')throw new Error('NATIVE_BATCH_FAILED');
    }
    throw new Error('NATIVE_BATCH_TIMEOUT');
  };
}
module.exports={createNativeBatchTransport};
