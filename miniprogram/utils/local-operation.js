// Local draft correlation only; not authentication or a payment identifier.
let sequence=0;
function createLocalOperationId(){
  sequence=(sequence+1)%Number.MAX_SAFE_INTEGER;
  return 'local_'+Date.now().toString(36)+'_'+sequence.toString(36)+'_'+
    Math.random().toString(36).slice(2)+'_'+Math.random().toString(36).slice(2);
}
module.exports={createLocalOperationId};
