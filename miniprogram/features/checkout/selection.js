const config=require('../../config');
const bag=require('../../services/local-bag');
const STORAGE_KEY='jiajiale.local-checkout-selection.v1';
const clone=value=>JSON.parse(JSON.stringify(value));
function fail(code){throw Object.assign(new Error(code),{code});}
function createSelectionClient(settings,platform,source){
  const key=STORAGE_KEY+':'+settings.appId,api=()=>platform||wx;
  function gate(){if(settings.stage!=='development'||settings.mode!=='shell')fail('LOCAL_PREVIEW_UNAVAILABLE');}
  function read(){
    gate();let value;try{value=api().getStorageSync(key);}catch(_){fail('LOCAL_PREVIEW_READ_FAILED');}
    if(!value)fail('LOCAL_PREVIEW_MISSING');
    if(value.version!==1||value.scope!=='LOCAL_DRAFT_PREVIEW'||value.checkoutAllowed!==false||
      !Number.isSafeInteger(value.bagRevision)||value.bagRevision<0||!Array.isArray(value.lines)||!value.lines.length||
      value.lines.some(line=>!line||typeof line.lineId!=='string'||typeof line.reviewToken!=='string')||
      new Set(value.lines.map(line=>line.lineId)).size!==value.lines.length)fail('LOCAL_PREVIEW_INVALID');
    return clone(value);
  }
  async function prepare(expectedRevision){
    gate();const view=await source.reviewAll();
    if(!Number.isSafeInteger(expectedRevision)||expectedRevision!==view.revision)fail('LOCAL_BAG_CONFLICT');
    const lines=view.lines.filter(line=>line.canSelect);
    if(!lines.length)fail('LOCAL_PREVIEW_EMPTY');
    const selection={version:1,scope:'LOCAL_DRAFT_PREVIEW',checkoutAllowed:false,bagRevision:view.revision,
      lines:lines.map(line=>({lineId:line.lineId,reviewToken:line.reviewToken}))};
    try{api().setStorageSync(key,clone(selection));if(JSON.stringify(api().getStorageSync(key))!==JSON.stringify(selection))throw new Error();}
    catch(_){fail('LOCAL_PREVIEW_WRITE_FAILED');}
    if(source.list().revision!==view.revision)fail('LOCAL_BAG_CONFLICT');
    return clone(selection);
  }
  async function get(){
    const selection=read(),view=await source.reviewAll();
    if(view.revision!==selection.bagRevision)fail('LOCAL_BAG_CONFLICT');
    const selected=view.lines.filter(line=>line.canSelect);
    if(selected.length!==selection.lines.length||selection.lines.some(saved=>{
      const line=selected.find(item=>item.lineId===saved.lineId);return !line||saved.reviewToken!==line.reviewToken;
    }))fail('LOCAL_SELECTION_CHANGED');
    // Amounts come only from a fresh local catalog review, never the persisted input.
    return {scope:'LOCAL_DRAFT_PREVIEW',checkoutAllowed:false,stockStatus:'UNKNOWN',bagRevision:view.revision,
      lines:selected,quantity:view.selectedQuantity,subtotalCents:view.subtotalCents,subtotalLabel:view.subtotalLabel};
  }
  return {prepare,get};
}
module.exports={...createSelectionClient(config,null,bag),createSelectionClient,STORAGE_KEY};
