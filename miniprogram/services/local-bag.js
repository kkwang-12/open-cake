const config=require('../config');
const specification=require('./specification');
const {createSpecificationModel}=require('../utils/specification-model');
const {formatCents}=require('./catalog');
const {reviewDraftLine,blocked}=require('../utils/bag-review');
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
      if(line.selected!==undefined&&typeof line.selected!=='boolean')fail('LOCAL_BAG_INVALID');
    }
    if(saved.revision!==undefined&&(!Number.isSafeInteger(saved.revision)||saved.revision<0))fail('LOCAL_BAG_INVALID');
    saved=clone(saved);saved.revision=saved.revision||0;
    saved.lines.forEach(line=>{if(line.selected===undefined)line.selected=true;});
    if(saved.addReceipts!==undefined){
      if(!Array.isArray(saved.addReceipts))fail('LOCAL_BAG_INVALID');
      const keys=new Set();
      for(const receipt of saved.addReceipts){
        if(!receipt||typeof receipt.operationId!=='string'||keys.has(receipt.operationId)||
          typeof receipt.fingerprint!=='string'||!receipt.result||!receipt.result.line||
          receipt.result.line.checkoutAllowed!==false||!Number.isSafeInteger(receipt.result.addedQuantity)||
          receipt.result.addedQuantity<1)fail('LOCAL_BAG_INVALID');
        keys.add(receipt.operationId);
      }
    }
    return clone(saved);
  }
  function commit(bag){
    let quantity=0,subtotal=0;
    for(const line of bag.lines){quantity+=line.quantity;if(line.selected)subtotal+=line.quantity*line.unitPriceCents;}
    if(!Number.isSafeInteger(quantity)||!Number.isSafeInteger(subtotal))fail('INVALID_QUANTITY');
    bag.revision=(bag.revision||0)+1;
    if(!Number.isSafeInteger(bag.revision))fail('LOCAL_BAG_INVALID');
    save(bag);
  }
  function checkRevision(bag,expected){
    if(expected!==undefined&&expected!==(bag.revision||0))fail('LOCAL_BAG_CONFLICT');
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
    // Capture the intent before awaiting configuration; retries use this same
    // immutable request and key, even if the UI or configuration later changes.
    input=clone(input);
    if(!Array.isArray(input.selectedOptions)||input.selectedOptions.some(option=>!option||
      typeof option.groupCode!=='string'||typeof option.optionCode!=='string')||
      new Set(input.selectedOptions.map(option=>option.groupCode)).size!==input.selectedOptions.length)fail('INVALID_LOCAL_SELECTION');
    const operationId=input.operationId;
    if(operationId!==undefined&&(typeof operationId!=='string'||!/^[-_a-zA-Z0-9]{16,128}$/.test(operationId)))fail('INVALID_LOCAL_SELECTION');
    const fingerprint=JSON.stringify([input.productId,input.productVersion,input.skuId,input.skuVersion,
      input.unitPriceCents,input.quantity,input.cakeMessage.normalize('NFC').trim(),
      (Array.isArray(input.selectedOptions)?input.selectedOptions:[]).map(option=>[option.groupCode,option.optionCode])
        .sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0)]);
    function replay(bag){
      const receipt=operationId&&(bag.addReceipts||[]).find(item=>item.operationId===operationId);
      if(!receipt)return null;
      if(receipt.fingerprint!==fingerprint)fail('LOCAL_OPERATION_REUSED');
      return clone(receipt.result);
    }
    const previous=replay(read());if(previous)return previous;
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
    const repeated=replay(bag);if(repeated)return repeated;
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
      unitPriceCents:sku.unitPriceCents,selected:existing?existing.selected:true,requiresCloudValidation:true,checkoutAllowed:false};
    if(existing)bag.lines[bag.lines.indexOf(existing)]=line;else bag.lines.push(line);
    const result={line:clone(line),addedQuantity:input.quantity};
    if(operationId){if(!bag.addReceipts)bag.addReceipts=[];bag.addReceipts.push({operationId,fingerprint,result:clone(result)});}
    commit(bag);
    return result;
  }
  function list(){
    const bag=read();
    let quantity=0,selectedQuantity=0,subtotalCents=0;
    for(const line of bag.lines){
      quantity+=line.quantity;
      if(line.selected){selectedQuantity+=line.quantity;subtotalCents+=line.quantity*line.unitPriceCents;}
      if(![quantity,selectedQuantity,subtotalCents].every(Number.isSafeInteger))fail('LOCAL_BAG_INVALID');
    }
    return {scope:'LOCAL_DRAFT',checkoutAllowed:false,revision:bag.revision||0,
      quantity,selectedQuantity,subtotalCents,subtotalLabel:subtotalCents===0?'0':formatCents(subtotalCents),
      allSelected:bag.lines.length>0&&bag.lines.every(line=>line.selected),lines:bag.lines.map(line=>({
      ...line,priceLabel:formatCents(line.unitPriceCents),totalLabel:formatCents(line.unitPriceCents*line.quantity)
    }))};
  }
  function remove(lineId,expectedRevision){
    const bag=read();const index=bag.lines.findIndex(line=>line.lineId===lineId);
    checkRevision(bag,expectedRevision);
    if(index<0)fail('LOCAL_LINE_UNAVAILABLE');bag.lines.splice(index,1);commit(bag);return list();
  }
  function select(lineId,selected,expectedRevision){
    if(typeof selected!=='boolean')fail('INVALID_LOCAL_SELECTION');
    const bag=read();checkRevision(bag,expectedRevision);
    const lines=lineId===null?bag.lines:bag.lines.filter(line=>line.lineId===lineId);
    if(lineId!==null&&!lines.length)fail('LOCAL_LINE_UNAVAILABLE');
    if(lines.some(line=>line.selected!==selected)){lines.forEach(line=>{line.selected=selected;});commit(bag);}
    return list();
  }
  async function updateQuantity(lineId,quantity,expectedRevision){
    if(!Number.isSafeInteger(quantity)||quantity<1)fail('INVALID_QUANTITY');
    const before=read();checkRevision(before,expectedRevision);
    const line=before.lines.find(item=>item.lineId===lineId);
    if(!line)fail('LOCAL_LINE_UNAVAILABLE');
    const configuration=await readSpecification(line.productId);
    if(configuration.source!=='DEVELOPMENT_EXAMPLE'||configuration.canPurchase!==false)fail('INVALID_LOCAL_SELECTION');
    const sku=createSpecificationModel(configuration).evaluate(line.selectedOptions).matchedSku;
    if(!sku||sku.skuId!==line.skuId||configuration.version!==line.productVersion||
      sku.version!==line.skuVersion||sku.unitPriceCents!==line.unitPriceCents)fail('LOCAL_SELECTION_CHANGED');
    if(!Number.isSafeInteger(quantity*sku.unitPriceCents)||(sku.minQuantity!==null&&quantity<sku.minQuantity)||
      (sku.maxQuantity!==null&&quantity>sku.maxQuantity))fail('INVALID_QUANTITY');
    const current=read();checkRevision(current,before.revision||0);
    const currentLine=current.lines.find(item=>item.lineId===lineId);
    if(!currentLine)fail('LOCAL_LINE_UNAVAILABLE');
    if(currentLine.quantity!==quantity){currentLine.quantity=quantity;commit(current);}
    return list();
  }
  async function inspect(line){
    try{return reviewDraftLine(line,await readSpecification(line.productId));}
    catch(error){return blocked(['PRODUCT_UNAVAILABLE','NOT_FOUND'].includes(error.code)?'PRODUCT_UNAVAILABLE':'REVIEW_FAILED');}
  }
  async function review(includeAll=false){
    const snapshot=list();
    const lines=await Promise.all(snapshot.lines.map(async line=>{
      const result=await inspect(line);const {candidate,...view}=result;
      return {...line,...view,selected:(includeAll||line.selected)&&view.canSelect,
        currentPriceLabel:view.currentUnitPriceCents?formatCents(view.currentUnitPriceCents):'',
        priceLabel:view.canSelect?formatCents(view.currentUnitPriceCents):line.priceLabel,
        totalLabel:view.canSelect?formatCents(view.currentTotalCents):line.totalLabel};
    }));
    checkRevision(read(),snapshot.revision);
    let selectedQuantity=0,subtotalCents=0;
    for(const line of lines)if(line.selected){selectedQuantity+=line.quantity;subtotalCents+=line.currentTotalCents;}
    if(!Number.isSafeInteger(selectedQuantity)||!Number.isSafeInteger(subtotalCents))fail('LOCAL_BAG_INVALID');
    const eligible=lines.filter(line=>line.canSelect);
    return {...snapshot,lines,selectedQuantity,subtotalCents,subtotalLabel:subtotalCents===0?'0':formatCents(subtotalCents),
      allSelected:eligible.length>0&&eligible.every(line=>line.selected),reviewed:true};
  }
  async function selectReviewed(lineId,selected,expectedRevision){
    if(typeof selected!=='boolean')fail('INVALID_LOCAL_SELECTION');
    const view=await review();checkRevision({revision:view.revision},expectedRevision);
    const targets=lineId===null?view.lines.filter(line=>line.canSelect):view.lines.filter(line=>line.lineId===lineId);
    if(lineId!==null&&(!targets.length||!targets[0].canSelect))fail('LOCAL_LINE_UNAVAILABLE');
    const bag=read();checkRevision(bag,view.revision);let changed=false;
    for(const target of targets){const line=bag.lines.find(item=>item.lineId===target.lineId);
      if(line.selected!==selected){line.selected=selected;changed=true;}}
    if(changed)commit(bag);return review();
  }
  async function acceptChanges(lineId,reviewToken,expectedRevision){
    const snapshot=read();checkRevision(snapshot,expectedRevision);
    const line=snapshot.lines.find(item=>item.lineId===lineId);if(!line)fail('LOCAL_LINE_UNAVAILABLE');
    const inspected=await inspect(line);
    if(!inspected.canAcceptChanges||typeof reviewToken!=='string'||inspected.reviewToken!==reviewToken)fail('LOCAL_SELECTION_CHANGED');
    const current=read();checkRevision(current,snapshot.revision||0);
    const target=current.lines.find(item=>item.lineId===lineId);
    Object.assign(target,inspected.candidate);commit(current);return review();
  }
  function reviewAll(){return review(true);}
  return {add,list,remove,select,updateQuantity,review,reviewAll,selectReviewed,acceptChanges};
}
module.exports={...createLocalBagClient(config),createLocalBagClient,LocalBagError,STORAGE_KEY};
