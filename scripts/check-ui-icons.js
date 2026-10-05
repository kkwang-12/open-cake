'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),iconRoot=path.join(root,'miniprogram/assets/icons');
const categories={navigation:'返回与方向',controls:'通用操作',commerce:'购物袋操作',product:'商品与服务',feedback:'收藏与选中',fulfillment:'配送方式',forms:'表单', 'tab-bar':'底部导航'};
const icons=[];
for(const [category,purpose] of Object.entries(categories)){
  for(const file of fs.readdirSync(path.join(iconRoot,category)).filter(file=>file.endsWith('.svg')).sort()){
    // Git may convert line endings on Windows; hash the same logical SVG text.
    const source=fs.readFileSync(path.join(iconRoot,category,file),'utf8').replace(/\r\n/g,'\n');
    const viewBox=source.match(/viewBox="([^"]+)"/);
    if(!viewBox||!source.includes('<svg')||!source.includes('</svg>'))throw new Error('Invalid SVG: '+file);
    const original=file.replace(/-(white|gray|disabled)\.svg$/,'.svg');
    const design='design-assets/cake-ui-icons-20261004/'+original;
    icons.push({category,purpose,file,path:'/assets/icons/'+category+'/'+file,viewBox:viewBox[1],
      strokeWidths:[...new Set([...source.matchAll(/stroke-width="([^"]+)"/g)].map(match=>Number(match[1])))],
      colors:[...new Set([...source.matchAll(/#[0-9a-f]{6}/gi)].map(match=>match[0]))],
      source:fs.existsSync(path.join(root,design))?design:'miniprogram/assets/icons/'+category+'/'+file,
      sha256:crypto.createHash('sha256').update(source).digest('hex')});
  }
}
const index=JSON.stringify({sourceOfTruth:'SVG files and page source code',icons},null,2)+'\n';
const indexPath=path.join(iconRoot,'index.json');
if(process.argv.includes('--write'))fs.writeFileSync(indexPath,index);
else if(fs.readFileSync(indexPath,'utf8').replace(/\r\n/g,'\n')!==index)throw new Error('Icon index is stale; run node scripts/check-ui-icons.js --write');
function inspect(folder){
  for(const entry of fs.readdirSync(folder,{withFileTypes:true})){
    const file=path.join(folder,entry.name);
    if(entry.isDirectory())inspect(file);
    else if(/\.(js|wxml|wxss|json)$/.test(entry.name)){
      const text=fs.readFileSync(file,'utf8');
      if(text.includes('/assets/icons/cake-ui/')||text.includes('/features/checkout/icons/'))throw new Error('Old icon path in '+file);
      for(const match of text.matchAll(/\/assets\/icons\/([a-z-]+\/[a-z0-9-]+\.svg)/g)){
        if(!fs.existsSync(path.join(iconRoot,match[1])))throw new Error('Missing SVG '+match[0]+' in '+file);
      }
    }
  }
}
inspect(path.join(root,'miniprogram'));
// WXML template names and JS-generated tab names are not literal file paths.
for(const name of ['pickup-bag','delivery-truck'])for(const color of ['gray','white']){
  if(!fs.existsSync(path.join(iconRoot,'fulfillment',name+'-'+color+'.svg')))throw new Error('Missing fulfillment state');
}
for(const name of ['home','shop','orders','account'])for(const state of ['outline','filled']){
  if(!fs.existsSync(path.join(iconRoot,'tab-bar',name+'-'+state+'.svg')))throw new Error('Missing tab state');
}
console.log('Verified '+icons.length+' SVG icons, index and runtime references.');
