const config=require('../config');
const fixtures=require('../fixtures/shop-development');
const {createError}=require('./errors');
const CATEGORIES=['CAKE','MINI_CAKE','BREAD'];
function wellFormed(value){
  for(let i=0;i<value.length;i++){
    const unit=value.charCodeAt(i);
    if(unit>=0xD800&&unit<=0xDBFF){const next=value.charCodeAt(++i);if(!(next>=0xDC00&&next<=0xDFFF))return false;}
    else if(unit>=0xDC00&&unit<=0xDFFF)return false;
  }
  return true;
}
function formatCents(cents){
  if(!Number.isSafeInteger(cents)||cents<=0)return '待定';
  const whole=Math.floor(cents/100),fraction=cents%100;
  return String(whole)+(fraction?'.'+String(fraction).padStart(2,'0'):'');
}
function createCatalogClient(settings,samples=fixtures){
  async function list(input={}){
    if(!['development','test','production'].includes(settings.stage)||!['shell','cloud'].includes(settings.mode))throw createError('INVALID_CONFIGURATION');
    // Cloud adapters have not been deployed. Never fall back to development products in another stage/mode.
    if(settings.stage!=='development'||settings.mode!=='shell')throw createError('CLOUD_NOT_CONFIGURED');
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(field=>!['categoryCode','search','pageSize','cursor'].includes(field))||
        (input.categoryCode!==undefined&&!CATEGORIES.includes(input.categoryCode)))throw createError('INVALID_REQUEST');
    const size=input.pageSize===undefined?6:input.pageSize;
    let search=input.search===undefined?'':input.search;
    if(!Number.isSafeInteger(size)||size<1||size>50||typeof search!=='string'||!wellFormed(search))throw createError('INVALID_REQUEST');
    if(typeof search.normalize==='function')search=search.normalize('NFC');
    search=search.trim().toLowerCase();
    if(Array.from(search).length>64)throw createError('INVALID_REQUEST');
        if(!samples||samples.purpose!=='TEMPORARY_DEVELOPMENT_EXAMPLE'||typeof samples.revision!=='string'||
        !/^[a-f0-9]{64}$/.test(samples.revision)||!Array.isArray(samples.items))throw createError('INVALID_RESPONSE');
    const ids=new Set();
    for(const item of samples.items){
      if(!item||typeof item.id!=='string'||!/^development-example-[a-z0-9-]+$/.test(item.id)||ids.has(item.id)||
          !CATEGORIES.includes(item.categoryCode)||typeof item.name!=='string'||!item.name.trim()||!wellFormed(item.name)||
          typeof item.description!=='string'||!wellFormed(item.description)||item.currency!=='CNY'||
          (item.minPriceCents!==null&&(!Number.isSafeInteger(item.minPriceCents)||item.minPriceCents<=0))||
          typeof item.priceFrom!=='boolean'||item.image!==''||item.canPurchase!==false)throw createError('INVALID_RESPONSE');
      ids.add(item.id);
    }
    const category=input.categoryCode||'ALL';
    const visible=samples.items.filter(item=>(category==='ALL'||item.categoryCode===category)&&item.name.toLowerCase().includes(search));
    const cursor=input.cursor===undefined?null:input.cursor;
    let offset=0;
    if(cursor!==null){
      try{
        if(typeof cursor!=='string'||cursor.length>4096||!cursor.startsWith('development-preview.'))throw new Error();
        const anchor=JSON.parse(decodeURIComponent(cursor.slice('development-preview.'.length)));
        if(!Array.isArray(anchor)||anchor.length!==4||anchor[0]!==samples.revision||anchor[1]!==category||anchor[2]!==search||
            !Number.isSafeInteger(anchor[3])||anchor[3]<=0||anchor[3]>visible.length)throw new Error();
        offset=anchor[3];
      }catch(_){throw createError('INVALID_REQUEST');}
    }
    const selected=visible.slice(offset,offset+size),hasMore=offset+selected.length<visible.length;
    return {source:'DEVELOPMENT_EXAMPLE',items:selected.map(item=>({id:item.id,categoryCode:item.categoryCode,name:item.name,description:item.description,
      minPriceCents:item.minPriceCents,currency:item.currency,priceFrom:item.priceFrom,image:item.image,
      priceLabel:formatCents(item.minPriceCents)+(item.priceFrom&&item.minPriceCents!==null?'起':''),
      canPurchase:false})),hasMore,
      // This unsigned local marker is ONLY for non-purchasable shell examples, never sent to a server.
      nextCursor:hasMore?'development-preview.'+encodeURIComponent(JSON.stringify([samples.revision,category,search,offset+selected.length])):null};
  }
  return {list};
}
module.exports={...createCatalogClient(config),createCatalogClient,formatCents};
