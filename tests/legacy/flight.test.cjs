'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {boot}=require('../wechat-minigame/src/main');
const {WindborneScenery}=require('../dist/scenery');

// Exercise the shipped native controller and frame loop. Only the drawing
// surface and WeChat host are stubbed; no flight state is set by the tests.
function flight({stored=new Map()}={}){
  const handlers=new Map(),gradient={addColorStop(){}};
  const context=new Proxy({}, {get(target,key){
    if(key in target)return target[key];
    if(key==='measureText')return text=>({width:String(text).length*8});
    if(key==='createLinearGradient'||key==='createRadialGradient')return()=>gradient;
    if(key==='createImageData')return(w,h)=>({data:new Uint8ClampedArray(w*h*4)});
    return()=>{};
  }});
  const wx={
    createCanvas:()=>({width:390,height:844,getContext:()=>context}),
    getWindowInfo:()=>({windowWidth:390,windowHeight:844,pixelRatio:1,safeArea:{top:24,left:0,right:390,bottom:820}}),
    getMenuButtonBoundingClientRect:()=>({left:290,top:28,bottom:60,width:84,height:32}),
    getStorageSync:key=>stored.get(key),setStorageSync:(key,value)=>stored.set(key,value)
  };
  for(const name of ['TouchStart','TouchMove','TouchEnd','TouchCancel','Hide','Show','WindowResize']){
    wx['on'+name]=handler=>handlers.set(name,handler);
    wx['off'+name]=()=>handlers.delete(name);
  }
  const app=boot(wx,{manual:true});
  const emit=(name,points=[])=>handlers.get(name)?.({touches:name==='TouchEnd'?[]:points,changedTouches:points});
  const touch=(name,x,y,id=1)=>emit(name,[{identifier:id,clientX:x,clientY:y}]);
  const button=id=>{const b=app.buttons().find(item=>item.id===id);assert.ok(b,'Visible native control: '+id);return {x:b.x+b.w/2,y:b.y+b.h/2};};
  const tap=id=>{const p=button(id);touch('TouchStart',p.x,p.y);touch('TouchEnd',p.x,p.y);app.tick(0);};
  const step=(count=1)=>{for(let i=0;i<count;i++)app.tick(16.667);};
  tap('mode-drift');tap('scene-0');tap('start');step(100);
  return {app,touch,emit,tap,button,step,stored,state:()=>app.getState(),destroy:()=>app.destroy()};
}

test('vertical drag climbs and dives with a bounded altitude, then cancel returns to level flight',()=>{
  const g=flight();try{
    const level=g.state();
    g.touch('TouchStart',195,450);g.touch('TouchMove',195,200);g.step(90);
    const climb=g.state();
    assert.ok(climb.pitch<-.8,'Dragging upward must establish a climb');
    assert.ok(climb.world.y<level.world.y-35,'The plane must move vertically');
    assert.ok(climb.altitude>level.altitude,'Climbing raises the altitude instrument');
    assert.ok(Math.abs(climb.world.x-level.world.x)<5,'Vertical input must not introduce horizontal steering');
    g.emit('TouchCancel');g.step(100);
    assert.ok(Math.abs(g.state().pitch)<.02,'Cancellation clears the pitch target');
    g.touch('TouchStart',195,350);g.touch('TouchMove',195,650);g.step(120);
    const dive=g.state();
    assert.ok(dive.pitch>.8,'Dragging downward must establish a dive');
    assert.ok(dive.world.y>level.world.y+35);
    assert.ok(dive.altitude>=0&&dive.altitude<=1,'Even sustained diving keeps altitude valid');
  }finally{g.destroy();}
});

test('diving travels farther and faster than climbing over the same elapsed time',()=>{
  const climb=flight(),dive=flight();try{
    const startClimb=climb.state().worldDistance,startDive=dive.state().worldDistance;
    climb.touch('TouchStart',195,450);climb.touch('TouchMove',195,200);
    dive.touch('TouchStart',195,350);dive.touch('TouchMove',195,650);
    climb.step(150);dive.step(150);
    const a=climb.state(),b=dive.state();
    assert.ok(b.flightSpeed>a.flightSpeed*1.15,'Pitch affects forward speed, not only the drawing');
    assert.ok(b.worldDistance-startDive>(a.worldDistance-startClimb)*1.15,'The scene advances with actual flight speed');
    assert.ok(b.distance>a.distance,'The saved distance follows the same flight speed');
  }finally{climb.destroy();dive.destroy();}
});

test('a second finger can spend wind energy while steering and release boost independently',()=>{
  const g=flight();try{
    g.touch('TouchStart',195,450);g.touch('TouchMove',245,400);g.step(20);
    const p=g.button('boost'),before=g.state();
    g.touch('TouchStart',p.x,p.y,2);g.step(45);
    const boosted=g.state();
    assert.equal(boosted.boosting,true);
    assert.ok(boosted.energy<before.energy,'Holding boost must spend wind energy');
    assert.ok(boosted.flightSpeed>before.flightSpeed*1.15);
    g.touch('TouchEnd',p.x,p.y,2);g.step(5);
    assert.equal(g.state().boosting,false,'Releasing only the boost finger stops boost');
    assert.ok(g.state().targetPitch<-.1,'The steering finger remains active after boost release');
    g.emit('TouchCancel');g.step(120);
    assert.ok(Math.abs(g.state().pitch)<.02);
    assert.ok(g.state().energy>=0&&g.state().energy<=1);
  }finally{g.destroy();}
});

test('backgrounding freezes scene travel and releases a held boost before resuming',()=>{
  const g=flight();try{
    const p=g.button('boost');g.touch('TouchStart',p.x,p.y,2);g.step(30);
    g.emit('Hide');const stopped=g.state();
    assert.equal(stopped.paused,true);assert.equal(stopped.boosting,false);
    g.step(120);
    assert.equal(g.state().worldDistance,stopped.worldDistance);
    assert.equal(g.state().energy,stopped.energy);
    g.emit('Show');g.app.tick(0);g.tap('resume');g.step(60);
    assert.equal(g.state().boosting,false);
    assert.ok(g.state().worldDistance>stopped.worldDistance);
  }finally{g.destroy();}
});

test('all four landscapes bring the same distant cloud banks closer as the world advances',()=>{
  const gradient={addColorStop(){}},clouds=[];
  const context=new Proxy({}, {get(target,key){
    if(key in target)return target[key];
    if(key==='createLinearGradient'||key==='createRadialGradient')return()=>gradient;
    if(key==='drawImage')return(image,x,y,width,height)=>{
      if(image.width===320&&image.height===136)clouds.push({x,y,width,height});
    };
    return()=>{};
  }});
  const scenery=new WindborneScenery((width,height)=>({width,height,getContext:()=>context}));
  for(let scene=0;scene<4;scene++){
    const options={width:390,height:844,scene,time:0,altitude:.5,quality:1};
    clouds.length=0;scenery.render(context,{...options,distance:0});const distant=clouds.slice();
    clouds.length=0;scenery.render(context,{...options,distance:50});const near=clouds.slice();
    assert.ok(distant.length>3,'The landscape contains layered cloud banks');
    assert.equal(near.length,distant.length);
    for(let i=0;i<near.length;i++){
      assert.ok(near[i].width>distant[i].width,'A world object grows as the plane approaches');
      assert.ok(near[i].height>distant[i].height);
      assert.ok(Object.values(near[i]).every(Number.isFinite),'Projection remains finite');
    }
  }
});
