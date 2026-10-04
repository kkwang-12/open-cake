const config=require('../config');
const catalog=require('./catalog');
const KEY='jiajiale.local-favorites.v1';
class LocalFavoritesError extends Error{constructor(code){super(code);this.code=code;}}
function fail(code){throw new LocalFavoritesError(code);}
const clone=value=>JSON.parse(JSON.stringify(value));
function createLocalFavoritesClient(settings,platform,client=catalog){
  const api=()=>platform||wx,key=KEY+':'+settings.appId;
  const validId=id=>typeof id==='string'&&/^development-example-[a-z0-9-]+$/.test(id);
  function gate(){
    if(settings.stage!=='development'||settings.mode!=='shell')fail('LOCAL_FAVORITES_UNAVAILABLE');
    if(typeof settings.appId!=='string'||!settings.appId)fail('INVALID_CONFIGURATION');
  }
  function read(){
    gate();let saved;
    try{saved=api().getStorageSync(key);}catch(_){fail('LOCAL_FAVORITES_READ_FAILED');}
    if(saved===''||saved===undefined||saved===null)return {version:1,scope:'LOCAL_DEVICE',items:[]};
    if(!saved||saved.version!==1||saved.scope!=='LOCAL_DEVICE'||!Array.isArray(saved.items))fail('LOCAL_FAVORITES_INVALID');
    const seen=new Set();
    for(const item of saved.items){
      if(!item||!validId(item.productId)||typeof item.name!=='string'||!item.name.trim()||seen.has(item.productId))fail('LOCAL_FAVORITES_INVALID');
      seen.add(item.productId);
    }
    return {version:1,scope:'LOCAL_DEVICE',items:saved.items.map(item=>({productId:item.productId,name:item.name}))};
  }
  function save(saved){
    try{
      api().setStorageSync(key,clone(saved));
      if(JSON.stringify(api().getStorageSync(key))!==JSON.stringify(saved))fail('LOCAL_FAVORITES_WRITE_FAILED');
    }catch(_){fail('LOCAL_FAVORITES_WRITE_FAILED');}
  }
  async function products(){
    const result=[],ids=new Set(),cursors=new Set();let cursor=null;
    do{
      const page=await client.list({pageSize:50,cursor});
      if(!page||page.source!=='DEVELOPMENT_EXAMPLE'||!Array.isArray(page.items)||typeof page.hasMore!=='boolean'||
          (page.hasMore?typeof page.nextCursor!=='string'||!page.nextCursor||cursors.has(page.nextCursor):page.nextCursor!==null))fail('INVALID_RESPONSE');
      for(const item of page.items){
        if(!item||!validId(item.id)||typeof item.name!=='string'||!item.name.trim()||item.canPurchase!==false||ids.has(item.id))fail('INVALID_RESPONSE');
        ids.add(item.id);result.push(item);
      }
      cursor=page.nextCursor;if(cursor)cursors.add(cursor);
    }while(cursor);
    return result;
  }
  function contains(productId){if(!validId(productId))fail('INVALID_LOCAL_PRODUCT');return read().items.some(item=>item.productId===productId);}
  async function set(productId,favorited){
    gate();if(!validId(productId)||typeof favorited!=='boolean')fail('INVALID_LOCAL_PRODUCT');
    let product;
    if(favorited){product=(await products()).find(item=>item.id===productId);if(!product)fail('PRODUCT_UNAVAILABLE');}
    const saved=read(),existing=saved.items.find(item=>item.productId===productId);
    if(favorited&&!existing)saved.items.push({productId,name:product.name});
    if(!favorited&&existing)saved.items=saved.items.filter(item=>item.productId!==productId);
    if(!!existing!==favorited)save(saved);
    return {scope:'LOCAL_DEVICE',favorited:read().items.some(item=>item.productId===productId)};
  }
  async function list(){
    const saved=read(),current=new Map((await products()).map(item=>[item.id,item]));
    return {scope:'LOCAL_DEVICE',items:saved.items.map(item=>{
      const card=current.get(item.productId);
      return {productId:item.productId,name:card?card.name:item.name,available:!!card,canPurchase:false,card:card?clone(card):null};
    })};
  }
  return {contains,set,list};
}
module.exports={...createLocalFavoritesClient(config),createLocalFavoritesClient};
