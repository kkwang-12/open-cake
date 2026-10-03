const config=require('../config');
const specification=require('./specification');
const {createSpecificationModel}=require('../utils/specification-model');
const {formatCents}=require('./catalog');
const STORAGE_KEY='jiajiale.local-draft-bag.v1';
class LocalBagError extends Error { constructor(code){super(code);this.code=code;this.name='LocalBagError';} }
function fail(code){throw new LocalBagError(code);}
function clone(value){return JSON.parse(JSON.stringify(value));}
function createLocalBagClient(settings,platform,readSpecification=specification.get){
  const api=()=>platform||wx;
  const key=STORAGE_KEY+':'+settings.appId;
  function gate(){if(settings.stage!=='development'||settings.mode!=='shell')fail('LOCAL_BAG_UNAVAILABLE');}
  function read(){
    gate();let saved;
    try{saved=api().getStorageSync(key);}catch(_){fail('LOCAL_BAG_READ_FAILED');}
    if(saved===''||saved===undefined||saved===null)return {version:1,scope:'LOCAL_DRAFT',lines:[]};
    if(!saved||saved.version!==1||saved.scope!=='LOCAL_DRAFT'||!Array.isArray(saved.lines))fail('LOCAL_BAG_INVALID');
    const ids=new Set();
    for(const line of saved.lines){
      if(!line||typeof line.lineId!=='string'||ids.has(line.lineId)||typeof line.productId!=='string'||
        typeof line.skuId!=='string'||typeof line.name!=='string'||typeof line.specLabel!=='string'||
        typeof line.cakeMessage!=='string'||!Number.isSafeInteger(line.quantity)||line.quantity<1||
        !Number.isSafeInteger(line.unitPriceCents)||line.unitPriceCents<1||
        !Number.isSafeInteger(line.quantity*line.unitPriceCents)||line.checkoutAllowed!==false)fail('LOCAL_BAG_INVALID');
      ids.add(line.lineId);
    }
    return clone(saved);
  }
  function save(bag){
    try{
      api().setStorageSync(key,clone(bag));
      if(JSON.stringify(api().getStorageSync(key))!==JSON.stringify(bag))fail('LOCAL_BAG_WRITE_FAILED');
    }catch(_){fail('LOCAL_BAG_WRITE_FAILED');}
  }
  async function add(input){
    gate();
    if(!input||!Number.isSafeInteger(input.quantity)||input.quantity<1||typeof input.cakeMessage!=='string'||
      input.cakeMessage.length>65536)fail('INVALID_LOCAL_SELECTION');
    const configuration=await readSpecification(input.productId);
    if(configuration.source!=='DEVELOPMENT_EXAMPLE'||configuration.canPurchase!==false)fail('INVALID_LOCAL_SELECTION');
    const state=createSpecificationModel(configuration).evaluate(input.selectedOptions);
    const sku=state.matchedSku;
    if(!sku||input.skuId!==sku.skuId||input.productVersion!==configuration.version||input.skuVersion!==sku.version||
        input.unitPriceCents!==sku.unitPriceCents)fail('LOCAL_SELECTION_CHANGED');
    const message=input.cakeMessage.normalize('NFC').trim();
    if(state.messageSupport==='DISABLED'&&message)fail('MESSAGE_NOT_SUPPORTED');
    if(state.messagePolicy&&Array.from(message).length>state.messagePolicy.maxLength)fail('INVALID_MESSAGE');
    for(let i=0;i<message.length;i++){
      const unit=message.charCodeAt(i);
      if(unit>=0xD800&&unit<=0xDBFF){const next=message.charCodeAt(++i);if(!(next>=0xDC00&&next<=0xDFFF))fail('INVALID_MESSAGE');}
      else if(unit>=0xDC00&&unit<=0xDFFF)fail('INVALID_MESSAGE');
    }
    const bag=read();
    const identity=JSON.stringify([configuration.productId,sku.skuId,message]);
    const lineId=encodeURIComponent(identity);
    const existing=bag.lines.find(line=>line.lineId===lineId);
    if(existing&&(existing.productVersion!==configuration.version||existing.skuVersion!==sku.version||
        existing.unitPriceCents!==sku.unitPriceCents))fail('LOCAL_SELECTION_CHANGED');
    const quantity=input.quantity+(existing?existing.quantity:0);
    if(!Number.isSafeInteger(quantity)||!Number.isSafeInteger(quantity*sku.unitPriceCents)||
      (sku.minQuantity!==null&&quantity<sku.minQuantity)||(sku.maxQuantity!==null&&quantity>sku.maxQuantity))fail('INVALID_QUANTITY');
    const line={lineId,productId:configuration.productId,productVersion:configuration.version,skuId:sku.skuId,skuVersion:sku.version,
      name:configuration.name,specLabel:sku.description,selectedOptions:state.selectedOptions,cakeMessage:message,quantity,
      unitPriceCents:sku.unitPriceCents,requiresCloudValidation:true,checkoutAllowed:false};
    if(existing)bag.lines[bag.lines.indexOf(existing)]=line;else bag.lines.push(line);
    save(bag);
    return {line:clone(line),addedQuantity:input.quantity};
  }
  function list(){
    const bag=read();
    return {scope:'LOCAL_DRAFT',checkoutAllowed:false,lines:bag.lines.map(line=>({
      ...line,priceLabel:formatCents(line.unitPriceCents),totalLabel:formatCents(line.unitPriceCents*line.quantity)
    }))};
  }
  function remove(lineId){
    const bag=read();const index=bag.lines.findIndex(line=>line.lineId===lineId);
    if(index<0)fail('LOCAL_LINE_UNAVAILABLE');bag.lines.splice(index,1);save(bag);return list();
  }
  return {add,list,remove};
}
module.exports={...createLocalBagClient(config),createLocalBagClient,LocalBagError,STORAGE_KEY};
