// One-use memory draft for returning from the bag; not a saved/validated contact.
function createEditReturnState(){
  let contact=null;
  return {
    remember(store,input){contact=store?{referenceId:store.referenceId,referenceVersion:store.referenceVersion,
      input:{name:input.name,phone:input.phone}}:null;},
    take(){const result=contact;contact=null;return result;}
  };
}
module.exports={...createEditReturnState(),createEditReturnState};
