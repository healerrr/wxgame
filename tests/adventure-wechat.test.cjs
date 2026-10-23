'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {boot}=require('../wechat-minigame/src/main');

function createGame({width=390,height=844,stored=new Map(),brokenStorage=false}={}){
  let W=width,H=height;const handlers=new Map(),canvases=[],gradient={addColorStop(){}};
  const context=()=>new Proxy({}, {get(target,key){
    if(key in target)return target[key];
    if(key==='measureText')return value=>({width:Array.from(String(value)).length*7});
    if(key==='createLinearGradient'||key==='createRadialGradient')return()=>gradient;
    if(key==='createImageData')return(w,h)=>({data:new Uint8ClampedArray(w*h*4)});
    if(key==='createPattern')return()=>({});
    return()=>{};
  }});
  const wx={
    createCanvas(){const ctx=context(),canvas={width:W,height:H,getContext:()=>ctx};canvases.push(canvas);return canvas;},
    getWindowInfo:()=>({windowWidth:W,windowHeight:H,pixelRatio:3,safeArea:{top:24,left:0,right:W,bottom:H-24}}),
    getMenuButtonBoundingClientRect:()=>({left:W-100,top:28,bottom:60,width:84,height:32}),
    getStorageSync:key=>{if(brokenStorage)throw new Error('storage unavailable');return stored.get(key);},
    setStorageSync:(key,value)=>{if(brokenStorage)throw new Error('storage full');stored.set(key,value);}
  };
  for(const name of ['TouchStart','TouchMove','TouchEnd','TouchCancel','Hide','Show','WindowResize']){
    wx['on'+name]=fn=>handlers.set(name,fn);wx['off'+name]=fn=>{if(handlers.get(name)===fn)handlers.delete(name);};
  }
  const emit=(name,event={})=>handlers.get(name)?.(event);
  const app=boot(wx,{manual:true});
  function touch(name,x,y,id=1){const point={identifier:id,clientX:x,clientY:y};emit(name,{touches:name==='TouchEnd'?[]:[point],changedTouches:[point]});}
  function tap(id){const button=app.buttons().find(item=>item.id===id);assert.ok(button,'Expected a visible native control: '+id);touch('TouchStart',button.x+button.w/2,button.y+button.h/2);touch('TouchEnd',button.x+button.w/2,button.y+button.h/2);app.tick(0);}
  function step(frames=1,delta=50){for(let i=0;i<frames;i++)app.tick(delta);}
  return {app,wx,emit,touch,tap,step,stored,handlers,canvases,resize(w,h){W=w;H=h;emit('WindowResize');}};
}

test('native adventure boots, takes off and fires without browser globals',()=>{
  const g=createGame();try{
    assert.equal(g.app.getState().phase,'intro');assert.equal(g.canvases[0].width,780);assert.equal(g.canvases[0].height,1688);
    g.tap('start');assert.equal(g.app.getState().phase,'takeoff');assert.equal(g.app.getState().hp,100);
    g.step(125);assert.equal(g.app.getState().phase,'playing');g.step(8);
    assert.ok(g.app.getState().height>120);assert.ok(g.app.getState().shotsFired>0);
  }finally{g.app.destroy();}
  assert.equal(g.handlers.size,0);
});

test('native two-dimensional drag and second-finger fire remain independent',()=>{
  const g=createGame();try{
    g.tap('start');g.step(125);g.tap('autofire');assert.equal(g.app.getState().autoFire,false);
    const before=g.app.getState();g.touch('TouchStart',180,510);g.touch('TouchMove',230,450);g.step(4);
    const moved=g.app.getState();assert.ok(moved.player.x>before.player.x);assert.ok(moved.player.y<before.player.y);assert.equal(moved.shotsFired,before.shotsFired);
    const fire=g.app.buttons().find(button=>button.id==='fire');assert.ok(fire);
    g.touch('TouchStart',fire.x+fire.w/2,fire.y+fire.h/2,2);g.step(7);assert.ok(g.app.getState().shotsFired>moved.shotsFired);
    g.touch('TouchEnd',fire.x+fire.w/2,fire.y+fire.h/2,2);const released=g.app.getState();g.step(4);
    assert.equal(g.app.getState().shotsFired,released.shotsFired);assert.ok(g.app.getState().player.x>released.player.x);
    assert.ok(g.app.getState().player.vx>0&&g.app.getState().player.vy<0,'Releasing the fire finger keeps both steering axes active');
    g.touch('TouchStart',fire.x+fire.w/2,fire.y+fire.h/2,2);g.step(3);
    const cancelling=g.app.getState();assert.ok(cancelling.shotsFired>released.shotsFired);
    g.emit('TouchCancel');g.step();const coasting=g.app.getState();
    assert.ok(coasting.player.vx>0&&coasting.player.vx<cancelling.player.vx,'Cancellation brakes the previous horizontal momentum');
    assert.ok(coasting.player.vy<0&&coasting.player.vy>cancelling.player.vy,'Cancellation brakes the previous vertical momentum');
    g.step(5);const settled=g.app.getState();
    assert.ok(Math.abs(settled.player.vx)<.003&&Math.abs(settled.player.vy)<.003,'Both released axes settle within 300 ms');
    assert.ok(Math.abs(settled.player.bank)<Math.abs(cancelling.player.bank)*.3,'The visual bank settles with the actual motion');
    assert.ok(Math.abs(settled.player.x-cancelling.player.x)<.025&&Math.abs(settled.player.y-cancelling.player.y)<.020,'A released pointer cannot continue steering across the screen');
    assert.equal(settled.shotsFired,cancelling.shotsFired,'Cancellation releases the second firing finger as well');
  }finally{g.app.destroy();}
});

test('backgrounding saves only records and collection, freezes play and waits for resume',()=>{
  const g=createGame();try{
    g.tap('start');g.step(130);g.emit('Hide');const hidden=g.app.getState();
    assert.equal(hidden.hidden,true);assert.equal(hidden.phase,'paused');g.step(50);assert.equal(g.app.getState().height,hidden.height);
    const saved=JSON.parse(g.stored.get('windborne.adventure.v1'));assert.ok(saved.records.bestHeight>=hidden.height);assert.ok(Array.isArray(saved.collected));assert.equal('hp' in saved,false);
    g.emit('Show');assert.equal(g.app.getState().hidden,false);assert.equal(g.app.getState().phase,'paused');g.step(5);assert.equal(g.app.getState().height,hidden.height);
    g.tap('resume');g.step(3);assert.ok(g.app.getState().height>hidden.height);
  }finally{g.app.destroy();}
});

test('collection returns to its original phase and resizing preserves a live run',()=>{
  const g=createGame({width:320,height:568});try{
    g.tap('collection');assert.equal(g.app.getState().collection,true);g.tap('closeCollection');assert.equal(g.app.getState().phase,'intro');
    g.tap('start');g.step(125);const before=g.app.getState();g.tap('collection');assert.equal(g.app.getState().phase,'paused');g.step(10);assert.equal(g.app.getState().height,before.height);
    g.tap('closeCollection');assert.equal(g.app.getState().phase,'playing');g.tap('pause');g.resize(390,844);const resized=g.app.getState();
    assert.equal(resized.height,before.height);assert.equal(resized.hp,before.hp);assert.equal(resized.phase,'paused');assert.equal(resized.viewport.width,390);assert.equal(resized.viewport.height,844);
    assert.ok(g.app.buttons().every(button=>button.x>=0&&button.y>=0&&button.x+button.w<=390&&button.y+button.h<=844));
    g.tap('resume');g.step();assert.ok(g.app.getState().height>before.height);
  }finally{g.app.destroy();}
});

test('unavailable native audio and storage do not prevent starting a campaign',()=>{
  const g=createGame({brokenStorage:true});try{g.tap('sound');assert.equal(g.app.getState().sound,false);g.tap('start');g.step(4);assert.equal(g.app.getState().phase,'takeoff');}finally{g.app.destroy();}
});
