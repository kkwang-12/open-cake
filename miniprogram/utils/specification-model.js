'use strict';
// Client display/configuration model only. Every purchase must be revalidated on the server.
const CATEGORIES=['CAKE','MINI_CAKE','BREAD'];
const NORMALIZATION_VERSION='unicode-nfc-trim-codepoints-v1';
class SpecificationModelError extends Error {
  constructor(code){super(code);this.name='SpecificationModelError';this.code=code;}
}
function fail(code){throw new SpecificationModelError(code);}
function plain(value){return value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));}
function wellFormed(value){
  for(let i=0;i<value.length;i++){
    const unit=value.charCodeAt(i);
    if(unit>=0xD800&&unit<=0xDBFF){const next=value.charCodeAt(++i);if(!(next>=0xDC00&&next<=0xDFFF))return false;}
    else if(unit>=0xDC00&&unit<=0xDFFF)return false;
  }
  return true;
}
function text(value){return typeof value==='string'&&value.length>0&&value===value.trim()&&wellFormed(value);}
function integer(value,positive=false){return Number.isSafeInteger(value)&&value>=(positive?1:0);}
function capture(value,code){
  function copy(item,ancestors){
    if(item===null||typeof item==='boolean')return item;
    if(typeof item==='string'){if(!wellFormed(item))fail(code);return item;}
    if(typeof item==='number'){if(!Number.isFinite(item))fail(code);return item;}
    if((!Array.isArray(item)&&!plain(item))||ancestors.has(item)||Object.getOwnPropertySymbols(item).length)fail(code);
    const keys=Object.keys(item);
    if(Array.isArray(item)&&(keys.length!==item.length||keys.some((key,i)=>key!==String(i))))fail(code);
    const result=Array.isArray(item)?[]:{};
    ancestors.add(item);
    for(const key of keys){
      const property=Object.getOwnPropertyDescriptor(item,key);
      if(!wellFormed(key)||!Object.prototype.hasOwnProperty.call(property,'value'))fail(code);
      Object.defineProperty(result,key,{value:copy(property.value,ancestors),enumerable:true,writable:true,configurable:true});
    }
    ancestors.delete(item);
    return result;
  }
  // Do not call input.toJSON or getters, including non-enumerable hooks.
  return copy(value,new Set());
}
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
function createSpecificationModel(input){
  input=capture(input,'INVALID_SPECIFICATION_CONFIGURATION');
  if(!plain(input)||!text(input.productId)||!integer(input.version)||!text(input.name)||
      !CATEGORIES.includes(input.categoryCode)||!Array.isArray(input.optionGroups)||!Array.isArray(input.skus)||!input.skus.length)
    fail('INVALID_SPECIFICATION_CONFIGURATION');
  const preview=input.source==='DEVELOPMENT_EXAMPLE';
  if((input.source!==undefined&&!['PUBLIC_CATALOG','DEVELOPMENT_EXAMPLE'].includes(input.source))||
      (preview&&input.canPurchase!==false)||
      (input.minLeadTimeMinutes!==null&&!integer(input.minLeadTimeMinutes))||
      (!preview&&input.minLeadTimeMinutes===null))fail('INVALID_SPECIFICATION_CONFIGURATION');
  const groups=[],byGroup=new Map();
  for(const original of input.optionGroups){
    if(!plain(original)||!text(original.groupCode)||!text(original.label)||typeof original.required!=='boolean'||
        byGroup.has(original.groupCode)||!Array.isArray(original.options)||!original.options.length)fail('INVALID_SPECIFICATION_CONFIGURATION');
    const options=[],seen=new Set();
    for(const option of original.options){
      if(!plain(option)||!text(option.optionCode)||!text(option.label)||seen.has(option.optionCode))fail('INVALID_SPECIFICATION_CONFIGURATION');
      seen.add(option.optionCode);options.push({optionCode:option.optionCode,label:option.label});
    }
    const group={groupCode:original.groupCode,label:original.label,required:original.required,options};
    groups.push(group);byGroup.set(group.groupCode,group);
  }
  function selection(value,allowUnknown=false){
    if(!Array.isArray(value))fail('INVALID_SPECIFICATION_SELECTION');
    const chosen=new Map();
    for(const option of value){
      if(!plain(option)||Object.keys(option).some(key=>!['groupCode','optionCode','label'].includes(key))||
          !text(option.groupCode)||!text(option.optionCode)||chosen.has(option.groupCode))fail('INVALID_SPECIFICATION_SELECTION');
      const group=byGroup.get(option.groupCode);
      if(!allowUnknown&&(!group||!group.options.some(item=>item.optionCode===option.optionCode)))fail('INVALID_SPECIFICATION_SELECTION');
      chosen.set(option.groupCode,option.optionCode);
    }
    return chosen;
  }
  function canonical(chosen){
    return groups.filter(group=>chosen.has(group.groupCode)).map(group=>({
      groupCode:group.groupCode,optionCode:chosen.get(group.groupCode),
      label:group.options.find(option=>option.optionCode===chosen.get(group.groupCode)).label
    }));
  }
  const skus=[],skuIds=new Set(),combinations=new Set();
  for(const original of input.skus){
    if(!plain(original)||!text(original.skuId)||skuIds.has(original.skuId)||!integer(original.version)||
        !text(original.description)||original.currency!=='CNY'||
        (original.unitPriceCents!==null&&!integer(original.unitPriceCents,true))||
        (!preview&&original.unitPriceCents===null)||
        !((original.minQuantity===null&&original.maxQuantity===null&&preview)||
          (integer(original.minQuantity,true)&&integer(original.maxQuantity,true)&&original.minQuantity<=original.maxQuantity)))
      fail('INVALID_SPECIFICATION_CONFIGURATION');
    let chosen;
    try{chosen=selection(original.selectedOptions);}catch(_){fail('INVALID_SPECIFICATION_CONFIGURATION');}
    if(groups.some(group=>group.required&&!chosen.has(group.groupCode)))fail('INVALID_SPECIFICATION_CONFIGURATION');
    const selectedOptions=canonical(chosen),combination=JSON.stringify(selectedOptions.map(option=>[option.groupCode,option.optionCode]));
    if(combinations.has(combination))fail('INVALID_SPECIFICATION_CONFIGURATION');
    combinations.add(combination);skuIds.add(original.skuId);
    skus.push({skuId:original.skuId,version:original.version,description:original.description,selectedOptions,
      unitPriceCents:original.unitPriceCents,currency:'CNY',minQuantity:original.minQuantity,maxQuantity:original.maxQuantity});
  }
  let messagePolicy=null,messageSupport='DISABLED';
  if(input.messagePolicy!==null){
    if(!plain(input.messagePolicy)||!integer(input.messagePolicy.maxLength,true)||
        input.messagePolicy.normalizationVersion!==NORMALIZATION_VERSION||input.categoryCode==='BREAD')fail('INVALID_SPECIFICATION_CONFIGURATION');
    messagePolicy={maxLength:input.messagePolicy.maxLength,normalizationVersion:NORMALIZATION_VERSION};messageSupport='ENABLED';
  }else if(preview){
    if(!['DISABLED','PENDING_LIMIT','UNKNOWN'].includes(input.messageSupport)||
        (input.categoryCode==='BREAD'&&input.messageSupport!=='DISABLED'))fail('INVALID_SPECIFICATION_CONFIGURATION');
    messageSupport=input.messageSupport;
  }
  const config=freeze({productId:input.productId,version:input.version,name:input.name,categoryCode:input.categoryCode,
    optionGroups:groups,skus,messagePolicy,messageSupport,minLeadTimeMinutes:input.minLeadTimeMinutes,
    source:preview?'DEVELOPMENT_EXAMPLE':'PUBLIC_CATALOG',canPurchase:false});
  const values=skus.map(sku=>new Map(sku.selectedOptions.map(option=>[option.groupCode,option.optionCode])));
  function prefixMatches(chosen,index,skuValues){
    for(let j=0;j<index;j++){
      const group=groups[j],selected=chosen.get(group.groupCode);
      if(selected===undefined&&group.required)return false;
      // Omitting an optional group is a real combination, not permission to choose it implicitly.
      if(skuValues.get(group.groupCode)!==selected)return false;
    }
    return true;
  }
  function enabled(chosen,index,optionCode){
    return values.some(skuValues=>prefixMatches(chosen,index,skuValues)&&skuValues.get(groups[index].groupCode)===optionCode);
  }
  function evaluateChosen(chosen){
    const complete=groups.every(group=>!group.required||chosen.has(group.groupCode));
    const matches=skus.filter((sku,index)=>chosen.size===values[index].size&&
      [...chosen].every(([groupCode,optionCode])=>values[index].get(groupCode)===optionCode));
    const matchedSku=complete&&matches.length===1?matches[0]:null;
    return freeze({productId:config.productId,productVersion:config.version,selectedOptions:canonical(chosen),
      status:matchedSku?'MATCHED':complete?'INVALID_COMBINATION':'INCOMPLETE',
      matchedSku,quantityLimits:matchedSku?{minQuantity:matchedSku.minQuantity,maxQuantity:matchedSku.maxQuantity}:null,
      groups:groups.map((group,index)=>({...group,options:group.options.map(option=>({
        ...option,enabled:enabled(chosen,index,option.optionCode),selected:chosen.get(group.groupCode)===option.optionCode
      }))})),
      messagePolicy,messageSupport,source:config.source,
      configurationPending:preview&&(config.minLeadTimeMinutes===null||messageSupport==='PENDING_LIMIT'||messageSupport==='UNKNOWN'||
        !matchedSku||matchedSku.unitPriceCents===null||matchedSku.minQuantity===null||matchedSku.maxQuantity===null),
      // A configuration match is never proof of live stock, store availability or purchase authorization.
      canPurchase:false,requiresReconfirmation:false,clearedOptions:[],notice:''});
  }
  function evaluate(value=[]){return evaluateChosen(selection(capture(value,'INVALID_SPECIFICATION_SELECTION')));}
  function staleSku(previous){
    if(previous.matchedSku===null||previous.matchedSku===undefined)return false;
    if(!plain(previous.matchedSku))return true;
    const current=skus.find(sku=>sku.skuId===previous.matchedSku.skuId);
    return !current||['version','unitPriceCents','currency','minQuantity','maxQuantity'].some(field=>current[field]!==previous.matchedSku[field]);
  }
  function previousState(value,allowChangedVersion){
    value=capture(value,'INVALID_SPECIFICATION_SELECTION');
    if(!plain(value)||value.productId!==config.productId||!integer(value.productVersion))fail('INVALID_SPECIFICATION_SELECTION');
    if(!allowChangedVersion&&(value.productVersion!==config.version||staleSku(value)))fail('SPECIFICATION_VERSION_CHANGED');
    return value;
  }
  function changeOption(previous,change){
    previous=previousState(previous,false);change=capture(change,'INVALID_SPECIFICATION_SELECTION');
    if(!plain(change)||Object.keys(change).sort().join(',')!=='groupCode,optionCode'||!byGroup.has(change.groupCode)||
        (change.optionCode!==null&&!text(change.optionCode)))fail('INVALID_SPECIFICATION_SELECTION');
    const chosen=selection(previous.selectedOptions),index=groups.findIndex(group=>group.groupCode===change.groupCode);
    if(change.optionCode!==null&&!enabled(chosen,index,change.optionCode))fail('INVALID_SPECIFICATION_SELECTION');
    if(change.optionCode===null)chosen.delete(change.groupCode);else chosen.set(change.groupCode,change.optionCode);
    const clearedOptions=[];
    for(let i=index+1;i<groups.length;i++){
      const group=groups[i],old=chosen.get(group.groupCode);
      if(old!==undefined&&!enabled(chosen,i,old)){
        chosen.delete(group.groupCode);clearedOptions.push({groupCode:group.groupCode,optionCode:old,reason:'INCOMPATIBLE'});
      }
    }
    return freeze({...evaluateChosen(chosen),clearedOptions,notice:clearedOptions.length?'部分规格已不适用，请重新选择。':''});
  }
  function reconcile(previous){
    previous=previousState(previous,true);
    const old=selection(previous.selectedOptions,true),chosen=new Map(),clearedOptions=[];
    for(const [groupCode,optionCode] of old)if(!byGroup.has(groupCode))clearedOptions.push({groupCode,optionCode,reason:'CONFIGURATION_CHANGED'});
    for(let i=0;i<groups.length;i++){
      const group=groups[i],optionCode=old.get(group.groupCode);
      if(optionCode===undefined)continue;
      if(group.options.some(option=>option.optionCode===optionCode)&&enabled(chosen,i,optionCode))chosen.set(group.groupCode,optionCode);
      else clearedOptions.push({groupCode:group.groupCode,optionCode,reason:'CONFIGURATION_CHANGED'});
    }
    const changed=previous.productVersion!==config.version||clearedOptions.length>0||staleSku(previous);
    return freeze({...evaluateChosen(chosen),clearedOptions,requiresReconfirmation:changed,
      notice:clearedOptions.length?'部分规格已不适用，请重新选择。':changed?'商品规格已更新，请重新确认。':''});
  }
  return Object.freeze({configuration:()=>config,evaluate,changeOption,reconcile});
}
module.exports={SpecificationModelError,createSpecificationModel};