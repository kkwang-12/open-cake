const test=require('node:test'),assert=require('node:assert/strict');
const {runtime}=require('./fixtures/bottom-sheet-runtime');
function setup(content=180) {
  const scrolls=[],rects=[{height:64},{height:content},{height:110}];
  const platform={getWindowInfo:()=>({windowHeight:800}),pageScrollTo:options=>scrolls.push(options),createSelectorQuery:()=>{
    const query={select(){return query;},boundingClientRect(){return query;},exec(callback){callback(rects);}};return query;
  }};
  const result=runtime(platform);
  const page={data:{sheetOpen:false,sheetPhase:'closed',adding:false},_pageScrollTop:230,setData(patch,callback){Object.assign(this.data,patch);if(callback)callback();}};
  return {...result,page,scrolls,rects,platform};
}
const touch=(y,timeStamp=0,x=10)=>({touches:[{clientX:x,clientY:y}],changedTouches:[{clientX:x,clientY:y}],timeStamp});
test('Sheet mounts below the viewport, opens with its mask, then unmounts only after closing',()=>{
  const {sheet,page,advance,scrolls}=setup();sheet.open(page);
  assert.equal(page.data.sheetOffset,'100%');assert.equal(page.data.sheetMaskOpacity,0);
  assert.equal(page.data.sheetPageTop,-230);assert.equal(page.data.sheetBodyHeight,180);
  advance(32);assert.equal(page.data.sheetDuration,240);assert.equal(page.data.sheetMaskOpacity,.48);
  advance(240);assert.equal(page.data.sheetPhase,'open');
  sheet.close(page);assert.equal(page.data.sheetDuration,200);assert.equal(page.data.sheetEasing,'ease-in');
  advance(199);assert.equal(page.data.sheetOpen,true);advance(1);assert.equal(page.data.sheetOpen,false);
  assert.equal(scrolls[0].scrollTop,230);
});
test('Short content uses natural height; long content is capped with fixed header and footer',()=>{
  const short=setup(60);short.sheet.open(short.page);assert.equal(short.page.data.sheetBodyHeight,60);
  const long=setup(1500);long.sheet.open(long.page);
  assert.equal(long.page.data.sheetMaxHeight,680);assert.equal(long.page.data.sheetBodyHeight,506);
  assert.equal(long.page._sheetHeight,680);
});
test('Repeated open and close/reopen cancel stale timers and leave one mounted sheet',()=>{
  const {sheet,page,advance,scrolls}=setup();sheet.open(page);sheet.open(page);
  sheet.close(page);advance(80);sheet.open(page);advance(240);
  assert.equal(page.data.sheetPhase,'open');assert.equal(page.data.sheetOpen,true);assert.equal(page.data.sheetMaskOpacity,.48);
  assert.equal(scrolls.length,0);sheet.dispose(page);advance(500);assert.equal(page.data.sheetOpen,false);
});
test('Header drags follow the finger, cancel or snap back, and dismiss by distance or downward velocity',()=>{
  const {sheet,page,advance}=setup();sheet.open(page);advance(272);
  sheet.dragStart(page,touch(10));sheet.dragMove(page,touch(40,100));assert.equal(page.data.sheetOffset,'30px');
  sheet.dragEnd(page,touch(40,250));assert.equal(page.data.sheetPhase,'settling');advance(180);
  sheet.dragStart(page,touch(10,300));sheet.dragMove(page,touch(160,500));sheet.dragEnd(page,touch(160,501),true);
  assert.equal(page.data.sheetPhase,'settling');advance(180);
  sheet.dragStart(page,touch(10,800));sheet.dragMove(page,touch(160,1000));sheet.dragEnd(page,touch(160,1101));
  assert.equal(page.data.sheetPhase,'closing');advance(200);sheet.open(page);advance(272);
  sheet.dragStart(page,touch(10,1500));sheet.dragMove(page,touch(55,1540));sheet.dragEnd(page,touch(55,1541));
  assert.equal(page.data.sheetPhase,'closing');
});
test('Adding blocks dismissal and upward/horizontal gestures do not start a sheet drag',()=>{
  const {sheet,page,advance}=setup();sheet.open(page);advance(272);
  sheet.dragStart(page,touch(20));sheet.dragMove(page,touch(10,50));assert.equal(page.data.sheetPhase,'open');
  sheet.dragEnd(page,touch(10,100));page.data.adding=true;sheet.close(page);assert.equal(page.data.sheetPhase,'open');
  sheet.close(page,true);assert.equal(page.data.sheetPhase,'closing');
});
test('Delayed measurement from an interrupted open cannot override a reopened sheet',()=>{
  const {sheet,page,advance,platform}=setup();const callbacks=[];
  platform.createSelectorQuery=()=>{
    const query={select(){return query;},boundingClientRect(){return query;},exec(callback){callbacks.push(callback);}};return query;
  };
  sheet.open(page);sheet.close(page);sheet.open(page);
  callbacks[1]([{height:64},{height:300},{height:110}]);
  callbacks[0]([{height:64},{height:1200},{height:110}]);
  advance(500);assert.equal(page.data.sheetOpen,true);assert.equal(page.data.sheetBodyHeight,300);
  assert.equal(page.data.sheetPhase,'open');assert.equal(page.data.sheetMaskOpacity,.48);
});

test('Rapid content changes ignore stale height measurements within the same open sheet',()=>{
  const {sheet,page,advance,platform}=setup();sheet.open(page);advance(272);
  const callbacks=[];
  platform.createSelectorQuery=()=>{
    const query={select(){return query;},boundingClientRect(){return query;},exec(callback){callbacks.push(callback);}};return query;
  };
  sheet.layout(page);sheet.layout(page);
  callbacks[1]([{height:64},{height:80},{height:110}]);
  callbacks[0]([{height:64},{height:1200},{height:110}]);
  assert.equal(page.data.sheetBodyHeight,80);assert.equal(page._sheetHeight,254);
});

test('A second finger cancels a header drag without leaving the sheet offset or mask stuck',()=>{
  const {sheet,page,advance}=setup();sheet.open(page);advance(272);
  sheet.dragStart(page,touch(10));sheet.dragMove(page,touch(50,100));
  const event=touch(70,120);event.touches.push({clientX:30,clientY:70});sheet.dragMove(page,event);
  assert.equal(page.data.sheetPhase,'settling');advance(180);
  assert.equal(page.data.sheetOffset,'0px');assert.equal(page.data.sheetMaskOpacity,.48);
  assert.equal(page.data.sheetOpen,true);
});
