'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {boot}=require('../wechat-minigame/src/main');
const {createNoise}=require('../wechat-minigame/src/noise');
const {createPlatform}=require('../wechat-minigame/src/platform');
function fakeWx({width=390,height=844,stored=new Map(),brokenStorage=false}={}){
  const handlers=new Map(),canvases=[];let W=width,H=height;
  const gradient={addColorStop(){}};
  function context(){return new Proxy({}, {get(target,key){
    if(key in target)return target[key];
    if(key==='measureText')return text=>({width:Array.from(String(text)).length*8});
    if(key==='createLinearGradient'||key==='createRadialGradient')return()=>gradient;
    if(key==='createImageData')return(w,h)=>({data:new Uint8ClampedArray(w*h*4)});
    if(key==='createPattern')return()=>({});
    return()=>{};
  }});}
  const wx={
    createCanvas(){const ctx=context(),canvas={width:W,height:H,getContext:()=>ctx};canvases.push(canvas);return canvas;},
    getWindowInfo:()=>({windowWidth:W,windowHeight:H,pixelRatio:3,safeArea:{top:24,left:0,right:W,bottom:H-24}}),
    getMenuButtonBoundingClientRect:()=>({left:W-100,top:28,bottom:60,width:84,height:32}),
    getStorageSync:key=>{if(brokenStorage)throw new Error('denied');return stored.get(key);},
    setStorageSync:(key,value)=>{if(brokenStorage)throw new Error('full');stored.set(key,value);}
  };
  for(const name of ['TouchStart','TouchMove','TouchEnd','TouchCancel','Hide','Show','WindowResize']){
    wx['on'+name]=handler=>handlers.set(name,handler);wx['off'+name]=handler=>{if(handlers.get(name)===handler)handlers.delete(name);};
  }
  wx.emit=(name,event={})=>{if(handlers.has(name))handlers.get(name)(event);};
  wx.setDimensions=(w,h)=>{W=w;H=h;};
  return {wx,stored,canvases,handlers};
}
function game(options){const runtime=fakeWx(options),app=boot(runtime.wx,{manual:true});
  function touch(name,x,y,id=1){runtime.wx.emit(name,{touches:name==='TouchEnd'?[]:[{identifier:id,clientX:x,clientY:y}],changedTouches:[{identifier:id,clientX:x,clientY:y}]});}
  function tap(id){const b=app.buttons().find(button=>button.id===id);assert.ok(b,'Button must be visible: '+id);touch('TouchStart',b.x+b.w/2,b.y+b.h/2);touch('TouchEnd',b.x+b.w/2,b.y+b.h/2);app.tick(0);}
  const step=(frames=1,delta=16.667)=>{for(let i=0;i<frames;i++)app.tick(delta);};
  return {...runtime,app,tap,touch,step};
}
test('native entry boots without document, window or p5 and keeps the first Canvas on screen',()=>{
  const project=path.join(__dirname,'..','wechat-minigame');
  const runtime=fakeWx();
  vm.runInNewContext(fs.readFileSync(path.join(project,'game.js'),'utf8'),{wx:runtime.wx,require:request=>request==='./src/main'?{boot:wx=>{const app=boot(wx,{manual:true});app.destroy();}}:require(request)});
  assert.ok(runtime.canvases.length>=3);
  assert.equal(runtime.canvases[0].width,780);
  assert.equal(runtime.canvases[0].height,1688);
  const config=JSON.parse(fs.readFileSync(path.join(project,'project.config.json')));
  assert.equal(config.compileType,'game');assert.equal(config.appid,'wxedf8b0ff920cc0ee');
});
test('native touch buttons start play, drag steers, and touch cancel releases input',()=>{
  const g=game();try{
    g.tap('start');assert.equal(g.app.getState().started,true);g.step(100);
    const before=g.app.getState().world.x;
    g.touch('TouchStart',195,500);g.touch('TouchMove',280,500);g.step(45);
    assert.ok(g.app.getState().world.x>before+30);
    g.wx.emit('TouchCancel');g.step(130);
    assert.ok(Math.abs(g.app.getState().world.angle)<.02);
  }finally{g.app.destroy();}
});
test('native tap ripples unlock a resumed memory without needing browser events',()=>{
  const stored=new Map([['windborne.journey.v2',JSON.stringify({scenes:[{counts:{light:5,gate:2,ripple:0}}]})]]);
  const g=game({stored});try{
    g.tap('start');
    for(let i=0;i<3;i++){g.touch('TouchStart',180,440);g.touch('TouchEnd',180,440);g.step(36);}
    assert.equal(g.app.getState().journey.scenes[0].completed,true);
    assert.equal(g.app.getState().journey.unlocked.length,1);
    g.tap('journal');assert.equal(g.app.getState().journal,true);assert.equal(g.app.getState().paused,true);
    g.tap('closeJournal');assert.equal(g.app.getState().paused,false);
  }finally{g.app.destroy();}
});
test('backgrounding flushes native storage, stops progression and requires deliberate resume',()=>{
  const g=game();try{
    g.tap('start');g.step(30);g.wx.emit('Hide');const before=g.app.getState();
    assert.equal(before.hidden,true);assert.equal(before.paused,true);g.step(90);
    assert.equal(g.app.getState().distance,before.distance);
    const saved=JSON.parse(g.stored.get('windborne.journey.v2'));assert.equal(Math.floor(saved.totalDistance),before.distance);
    g.wx.emit('Show');g.app.tick(0);assert.equal(g.app.getState().paused,true);g.tap('resume');g.step(10);assert.ok(g.app.getState().distance>before.distance);
  }finally{g.app.destroy();}
});
test('native settings, scene selection and lifetime progress survive reopening',()=>{
  const stored=new Map();let g=game({stored});
  g.tap('mode-drift');g.tap('calm');g.tap('scene-2');g.tap('start');g.step(45);const distance=g.app.getState().distance;g.app.destroy();
  g=game({stored});try{
    const restored=g.app.getState();assert.equal(restored.mode,'drift');assert.equal(restored.calm,true);assert.equal(restored.scene,2);assert.equal(restored.auto,false);assert.equal(restored.distance,distance);
  }finally{g.app.destroy();}
});
test('native resizing preserves the active journey and recalculates safe touch areas',()=>{
  const g=game();try{
    g.tap('start');g.step(100);const before=g.app.getState();g.tap('pause');g.wx.setDimensions(320,568);g.wx.emit('WindowResize');
    const after=g.app.getState();assert.equal(after.viewport.width,320);assert.equal(after.viewport.height,568);assert.equal(after.collected,before.collected);assert.equal(after.distance,before.distance);assert.equal(after.paused,true);
    assert.ok(g.app.buttons().every(b=>b.x>=0&&b.x+b.w<=320));g.tap('resume');g.step(2);
  }finally{g.app.destroy();}
});
test('storage and audio unavailability remain playable and cleanup detaches every handler',()=>{
  const g=game({brokenStorage:true});g.tap('sound');assert.equal(g.app.getState().sound,false);g.tap('start');g.step(2);assert.equal(g.app.getState().started,true);g.app.destroy();assert.equal(g.handlers.size,0);
});
test('seeded flow noise is continuous, reproducible and bounded',()=>{
  const a=createNoise(29),b=createNoise(29),other=createNoise(31);
  assert.equal(a(.12,8.3,2.5),b(.12,8.3,2.5));assert.notEqual(a(.12,8.3,2.5),other(.12,8.3,2.5));
  for(let i=0;i<100;i++){const value=a(i*.11,i*.03,i*.02);assert.ok(value>=0&&value<=1);assert.ok(Math.abs(value-a(i*.11+.001,i*.03,i*.02))<.01);}
});

test('native touch/frame clock remains milliseconds regardless of native performance units',()=>{
  const runtime=fakeWx();runtime.wx.getPerformance=()=>({now:()=>9e15});
  const platform=createPlatform(runtime.wx);assert.ok(Math.abs(platform.now()-Date.now())<50);
});

test('native fallback audio uses packaged sounds and stops in the background',()=>{
  const runtime=fakeWx(),contexts=[];runtime.wx.createWebAudioContext=()=>({close(){}});
  runtime.wx.createInnerAudioContext=()=>{const ctx={playing:false,play(){this.playing=true;},pause(){this.playing=false;},stop(){this.playing=false;},destroy(){this.destroyed=true;}};contexts.push(ctx);return ctx;};
  const app=boot(runtime.wx,{manual:true});
  const tap=id=>{const b=app.buttons().find(v=>v.id===id),p={identifier:1,clientX:b.x+b.w/2,clientY:b.y+b.h/2};runtime.wx.emit('TouchStart',{touches:[p]});runtime.wx.emit('TouchEnd',{changedTouches:[p]});app.tick(0);};
  try{tap('sound');assert.equal(app.getState().sound,true);assert.ok(contexts[0].playing);assert.ok(fs.existsSync(path.join(__dirname,'..','wechat-minigame',contexts[0].src)));tap('start');runtime.wx.emit('Hide');assert.equal(contexts[0].playing,false);runtime.wx.emit('Show');app.tick(0);tap('resume');assert.ok(contexts[0].playing);}finally{app.destroy();}assert.ok(contexts.every(ctx=>ctx.destroyed));
});

test('native pointer steering can complete both the light route and wind rings',()=>{
  const g=game();try{
    g.tap('start');g.touch('TouchStart',195,450);
    for(let frame=0;frame<3600&&g.app.getState().journey.scenes[0].task!=='ripple';frame++){
      const s=g.app.getState(),task=s.journey.scenes[0].task;
      const target=task==='gate'?s.world.gates[0]:s.world.lights.filter(l=>l.y>0&&l.y<s.world.y+25).sort((a,b)=>b.y-a.y)[0];
      const steer=target?Math.max(-1,Math.min(1,(target.x-s.world.x)/(390*.20))):0;
      g.touch('TouchMove',195+steer*390*.24,450);g.step();
    }
    assert.equal(g.app.getState().journey.scenes[0].task,'ripple');
  }finally{g.app.destroy();}
});

test('native random flow retains a partial journey and manual scenery stays fixed',()=>{
  const stored=new Map([['windborne.journey.v2',JSON.stringify({scenes:[{counts:{light:5,gate:2,ripple:1}}]})]]),g=game({stored});
  try{g.tap('start');g.step(1590,41.667);assert.notEqual(g.app.getState().scene,0);assert.equal(g.app.getState().journey.scenes[0].steps[2].count,1);g.tap('scene-2');g.step(1590,41.667);assert.equal(g.app.getState().scene,2);assert.equal(g.app.getState().auto,false);}finally{g.app.destroy();}
});
