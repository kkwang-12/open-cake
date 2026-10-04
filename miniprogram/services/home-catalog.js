const catalog=require('./catalog');
const {createError}=require('./errors');
const CATEGORIES=['CAKE','MINI_CAKE','BREAD'];
const SECTIONS=['recommended','seasonal','series','popular'];
function createHomeCatalogClient(client=catalog,slots={}){
  async function get(){
    const products=[],ids=new Set(),cursors=new Set();let cursor=null,source=null;
    do{
      const page=await client.list({pageSize:50,cursor});
      if(!page||!Array.isArray(page.items)||typeof page.hasMore!=='boolean'||
          !['DEVELOPMENT_EXAMPLE','PUBLIC_CATALOG'].includes(page.source)||
          (source&&source!==page.source)||
          (page.hasMore?typeof page.nextCursor!=='string'||!page.nextCursor||cursors.has(page.nextCursor):page.nextCursor!==null))
        throw createError('INVALID_RESPONSE');
      source=page.source;
      for(const item of page.items){
        if(!item||typeof item.id!=='string'||!CATEGORIES.includes(item.categoryCode)||ids.has(item.id))
          throw createError('INVALID_RESPONSE');
        ids.add(item.id);products.push(item);
      }
      cursor=page.nextCursor;if(cursor)cursors.add(cursor);
    }while(cursor);
    const byId=new Map(products.map(item=>[item.id,item])),sections={};
    for(const key of SECTIONS){
      const references=slots[key]===undefined?[]:slots[key];
      if(!Array.isArray(references)||references.some(id=>typeof id!=='string'))throw createError('INVALID_CONFIGURATION');
      sections[key]=[...new Set(references)].filter(id=>byId.has(id)).map(id=>({...byId.get(id)}));
    }
    const categories=CATEGORIES.map(code=>({code,products:products.filter(item=>item.categoryCode===code)}));
    // No merchant curation yet: show one catalog item per category, without inventing popularity or seasonality.
    const fallback=categories.filter(category=>category.products.length).map(category=>({...category.products[0]}));
    return {source,sections,categories,products:sections.recommended.length?sections.recommended:fallback,
      recommendationConfigured:sections.recommended.length>0};
  }
  return {get};
}
module.exports={...createHomeCatalogClient(),createHomeCatalogClient};
