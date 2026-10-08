const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('WXS decimal literals retain an integer part accepted by the WeChat compiler',()=>{
  const source=fs.readFileSync('miniprogram/features/bag/swipe.wxs','utf8');
  // CSS and other strings can contain decimal shorthand; only inspect WXS code.
  const code=source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g,' ');
  assert.doesNotMatch(code,/(^|[^\w$.])\.\d/);
});
function swipe(width=300){
  const module={exports:{}},calls=[],nodes=new Map(),selections=[];let resetVersion=0;
  function addRow(id){
    const state={},styles=[],backgrounds=[],icons=[],positions=[];
    const instance={getState:()=>state,getDataset:()=>({id,deleteId:'delete-'+id,iconId:'icon-'+id,iconPositionId:'position-'+id}),setStyle:style=>styles.push(style)};
    nodes.set('#content-'+id,instance);nodes.set('#delete-'+id,{setStyle:style=>backgrounds.push(style)});
    nodes.set('#icon-'+id,{setStyle:style=>icons.push(style)});nodes.set('#position-'+id,{setStyle:style=>positions.push(style)});
    return {instance,state,styles,backgrounds,icons,positions};
  }
  const row=addRow('one');
  const owner={selectComponent:id=>{selections.push(id);assert.ok(nodes.has(id),'Selected a detached row: '+id);return nodes.get(id);},callMethod:(name,value)=>calls.push({name,value})};
  vm.runInNewContext(fs.readFileSync('miniprogram/features/bag/swipe.wxs','utf8'),{module});
  const event=(x,y=100,extra={})=>({currentTarget:{id:'content-one',dataset:{id:'one',reset:resetVersion,width,disabled:false}},touches:[{clientX:x,clientY:y}],changedTouches:[{clientX:x,clientY:y}],...extra});
  const end=(x,y=100)=>event(x,y,{touches:[]});
  return {api:module.exports,...row,owner,calls,selections,nodes,addRow,event,end,setReset:value=>{resetVersion=value;}};
}
test('Full swipe follows exact distance; 30% arms deletion, reversal cancels, recross vibrates only once',()=>{
  const {api,instance,owner,state,calls,backgrounds,icons,positions,event,end}=swipe();
  const color=()=>backgrounds.findLast(style=>'background-color' in style)['background-color'];
  api.stateChanged('0:rest','',owner,instance);api.start(event(250),owner);
  assert.equal(api.move(event(170),owner),false);assert.equal(state.offset,-80);
  assert.equal(backgrounds.at(-1).transform,'translate3d(220px,0,0)');assert.equal(positions.at(-1).transform,'translate3d(-40px,0,0)');assert.equal(color(),'#E8B4AE');
  api.move(event(160),owner);assert.equal(color(),'#D9685E');assert.equal(icons.at(-1).transform,'scale(1.15)');
  api.move(event(170),owner);assert.equal(color(),'#E8B4AE');
  api.stateChanged('0:rest','0:rest',owner,instance);assert.equal(state.offset,-80);
  api.move(event(150),owner);assert.equal(calls.filter(x=>x.name==='swipeThreshold').length,1);
  api.end(end(170),owner);assert.equal(calls.at(-1).value.remove,false);assert.equal(state.offset,0);
  api.start(event(250),owner);api.move(event(110),owner);api.end(end(110),owner);
  assert.equal(calls.at(-1).name,'swipeReleased');assert.equal(calls.at(-1).value.remove,true);
});
test('Fast release uses final position and threshold scales with row width; no half-open stop',()=>{
  for(const width of [260,343,398]){
    const {api,instance,owner,state,calls,event,end,styles,setReset}=swipe(width);
    api.stateChanged('0:rest','',owner,instance);api.start(event(450),owner);
    api.end(end(450-width*.3),owner);assert.equal(calls.at(-1).value.remove,true);
    api.stateChanged('0:deleting','',owner,instance);assert.equal(styles.at(-1).transform,'translate3d(-100%,0,0)');assert.equal(styles.at(-1).opacity,0);
    setReset(1);
    api.stateChanged('1:rest','',owner,instance);assert.equal(state.offset,0);
    api.start(event(450),owner);api.move(event(450-width*.29),owner);api.end(end(450-width*.29),owner);
    assert.equal(calls.at(-1).value.remove,false);assert.equal(state.offset,0);
    api.start(event(450),owner);api.end(end(450-width*.3+0.01),owner);
    assert.equal(calls.at(-1).value.remove,false);
  }
});
test('Consecutive swipes unlock from reset token even when removed nodes never deliver reset observers',()=>{
  const {api,owner,nodes,addRow,calls,event,end,setReset,styles}=swipe();
  addRow('two');addRow('three');
  api.start(event(250),owner);api.move(event(160),owner);api.end(end(160),owner);
  assert.equal(styles.at(-1).transform,'translate3d(-100%,0,0)');
  const forRow=(id,reset,touches)=>({...event(150),currentTarget:{id:'content-'+id,dataset:{id,reset,width:300,disabled:false}},touches});
  api.start(forRow('two',0,[{clientX:250,clientY:100}]),owner);
  assert.equal(calls.filter(call=>call.name==='swipeReleased').length,1);
  for(const prefix of ['content','delete','icon','position'])nodes.delete('#'+prefix+'-one');
  for(const [id,reset] of [['two',1],['three',2]]){
    setReset(reset);
    // The first row is detached; no stateChanged('rest') callback is sent.
    api.start(forRow(id,reset,[{clientX:250,clientY:100}]),owner);
    api.end(forRow(id,reset,[]),owner);
    assert.equal(calls.at(-1).value.id,id);assert.equal(calls.at(-1).value.remove,true);
    for(const prefix of ['content','delete','icon','position'])nodes.delete('#'+prefix+'-'+id);
  }
  assert.deepEqual(calls.filter(call=>call.name==='swipeReleased').map(call=>call.value.id),['one','two','three']);
});
test('Dragging caches descriptors and changes transform without per-move width layout or repeated icon scaling',()=>{
  const {api,owner,instance,event,selections,backgrounds,icons,positions,styles}=swipe();
  api.stateChanged('0:rest','',owner,instance);api.start(event(250),owner);api.move(event(200),owner);
  const selected=selections.length,scaled=icons.length;
  for(let x=199;x>=175;x--)api.move(event(x),owner);
  assert.equal(selections.length,selected);assert.equal(icons.length,scaled);
  assert.ok(backgrounds.every(style=>!('width' in style)));
  for(const updates of [backgrounds,positions,styles])assert.deepEqual(Object.keys(updates.at(-1)),['transform']);
  const writes=styles.length;api.move(event(175),owner);assert.equal(styles.length,writes);
});
test('Vertical/rightward/multi-touch/cancel gestures never delete; displacement cannot exceed origin',()=>{
  const {api,instance,owner,state,calls,event,end}=swipe();api.stateChanged('0:rest','',owner,instance);
  api.start(event(200),owner);assert.equal(api.move(event(199,130),owner),undefined);api.end(end(10,180),owner);assert.equal(calls.length,0);
  api.start(event(200),owner);api.move(event(250),owner);api.end(end(250),owner);assert.equal(state.offset,0);
  api.start(event(200),owner);api.move(event(50),owner);api.move(event(40,100,{touches:[{},{}]}),owner);assert.equal(calls.at(-1).value.remove,false);
  api.start(event(200),owner);api.move(event(40),owner);api.cancel({},owner);assert.equal(calls.at(-1).value.remove,false);
  api.start(event(200),owner);api.move(event(40),owner);api.start(event(40,100,{touches:[{},{}]}),owner);api.end(end(40),owner);assert.equal(calls.at(-1).value.remove,false);
  api.start(event(200),owner);api.move(event(170),owner);api.move(event(210),owner);assert.equal(state.offset,0);api.end(end(210),owner);
});
test('Removal runs 200ms exit then 200ms shift; disposal cancels delayed work',async()=>{
  const module={exports:{}},timers=new Map();let id=0,callback;
  vm.runInNewContext(fs.readFileSync('miniprogram/features/bag/removal-motion.js','utf8'),{module,setTimeout:(fn,delay)=>{timers.set(++id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id)});
  const page={_visible:true,_epoch:1,data:{lines:[{lineId:'one'}],lineNodeIds:{one:'bag-line-1'}},setData(patch,ready){Object.assign(this.data,patch);if(ready)ready();},createSelectorQuery(){const query={select(selector){assert.equal(selector,'#bag-line-1');return query;},boundingClientRect(fn){callback=fn;return query;},exec(){}};return query;}};
  const motion=module.exports,pending=motion.play(page,'one',1);callback({height:140});
  assert.equal(page.data.removingHeight,140);assert.equal(page.data.removalCollapsing,false);assert.equal(timers.get(1).delay,200);
  assert.equal(page.data.removingIndex,0);
  const exit=timers.get(1);timers.delete(1);exit.fn();assert.equal(page.data.removalCollapsing,true);assert.equal(timers.get(2).delay,200);
  const shrink=timers.get(2);timers.delete(2);shrink.fn();assert.equal(await pending,true);
  const stale=motion.play(page,'one',1);motion.dispose(page);callback({height:140});assert.equal(await stale,false);assert.equal(timers.size,0);
});
