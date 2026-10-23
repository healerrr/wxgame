'use strict';
const {createPlatform}=require('./platform');
const {WindborneAdventure}=require('./adventure');
const {WindborneView}=require('./view');
const {loadWindborneArt}=require('./assets');
const {AmbientAudio}=require('./audio');
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));

function boot(wx,{manual=false}={}){
  const platform=createPlatform(wx);
  let layout=platform.resize(),audio=null,sound=false,calm=false,autoFire=true,collection=false,collectionResume=false;
  let hidden=false,destroyed=false,frameId=null,lastTime=null,time=0,touch=null,fireTouch=null;
  let input={x:0,y:0},lastScene=-1,lastThunder=0;
  const game=new WindborneAdventure({storage:platform.storage,onEvent:event=>{
    if(audio&&sound&&(event.type==='kill'||event.type==='pickup'||event.type==='victory'))audio.chime(event.type==='kill'?'gate':'light');
  }});
  const view=new WindborneView(platform.createCanvas.bind(platform));
  const art=loadWindborneArt(typeof wx.createImage==='function'?()=>wx.createImage():null,loaded=>{if(view.setAssets)view.setAssets(loaded);});
  if(view.setAssets)view.setAssets(art);
  if(game.resize)game.resize(layout.width,layout.height);
  const active=()=>['takeoff','playing'].includes(game.getState().phase);
  const hit=(x,y)=>[...(view.buttons||[])].reverse().find(button=>x>=button.x&&x<=button.x+button.w&&y>=button.y&&y<=button.y+button.h)||null;
  function clearInput(){touch=null;fireTouch=null;input={x:0,y:0};}
  function volume(){if(audio)audio.volume(sound&&!hidden&&!collection&&game.getState().phase!=='paused'?.065:0);}
  function pause(value=true){game.pause(value);clearInput();game.save();volume();}
  function toggleSound(){
    try{if(!audio)audio=new AmbientAudio(wx);sound=!sound;if(sound)audio.resume();volume();}
    catch(_){sound=false;}
  }
  function action(id){
    if(id==='start'){game.start({restart:false});collection=false;clearInput();}
    else if(id==='retry'){game.retry();collection=false;clearInput();}
    else if(id==='pause')pause(true);
    else if(id==='resume')pause(false);
    else if(id==='collection'){collectionResume=active();if(collectionResume)pause(true);collection=true;clearInput();game.save();}
    else if(id==='closeCollection'){collection=false;if(collectionResume)pause(false);collectionResume=false;}
    else if(id==='sound')toggleSound();
    else if(id==='calm')calm=!calm;
    else if(id==='autofire')autoFire=!autoFire;
    volume();
  }
  function tick(milliseconds=16.667){
    if(destroyed||hidden)return;
    const seconds=Math.min(.05,Math.max(0,Number(milliseconds)||0)/1000);
    time+=seconds;
    if(!collection)game.update(seconds,{x:input.x,y:input.y,fire:autoFire||fireTouch!==null,boost:false});
    const state=game.getState();
    view.render(layout.ctx,state,{width:layout.width,height:layout.height,safe:layout.safe,capsule:layout.capsule,sound,calm,time,collection,autoFire});
    if(audio){
      if(state.scene!==lastScene){lastScene=state.scene;audio.theme(state.scene||0);}
      const weather=view.weather&&view.weather.report?view.weather.report():null;
      if(weather){
        if(audio.weather)audio.weather(weather.kind,weather.intensity||0);
        const thunder=weather.thunderCount||0;
        if(thunder>lastThunder&&sound&&audio.thunder)audio.thunder();lastThunder=thunder;
      }
    }
  }
  function frame(){frameId=null;if(destroyed||hidden)return;const now=platform.now(),delta=lastTime===null?16.667:Math.max(0,now-lastTime);lastTime=now;tick(delta);if(!manual)frameId=platform.request(frame);}
  function schedule(){if(!manual&&!hidden&&!destroyed&&frameId===null)frameId=platform.request(frame);}
  function points(list){return Array.from(list||[]).map(item=>({id:item.identifier,x:Number(item.clientX===undefined?item.x:item.clientX),y:Number(item.clientY===undefined?item.y:item.clientY)})).filter(point=>Number.isFinite(point.x)&&Number.isFinite(point.y));}
  function onTouchStart(event){
    if(hidden||destroyed)return;
    for(const point of points(event.changedTouches||event.touches)){
      if((touch&&touch.id===point.id)||fireTouch===point.id)continue;
      const button=hit(point.x,point.y);
      if(button&&button.id==='fire'&&active()&&!collection){fireTouch=point.id;continue;}
      if(touch)continue;
      touch={...point,startX:point.x,startY:point.y,button:button?button.id:null,moved:false};
    }
  }
  function onTouchMove(event){
    if(!touch)return;const point=points(event.touches).find(item=>item.id===touch.id);if(!point)return;
    if(Math.hypot(point.x-touch.startX,point.y-touch.startY)>10)touch.moved=true;
    if(!touch.button&&active()&&!collection){input.x=clamp((point.x-touch.startX)/(layout.width*.20),-1,1);input.y=clamp((point.y-touch.startY)/(layout.height*.20),-1,1);}
  }
  function onTouchEnd(event){
    const ended=points(event.changedTouches);
    if(ended.some(point=>point.id===fireTouch))fireTouch=null;
    if(!touch)return;const point=ended.find(item=>item.id===touch.id);if(!point)return;
    const previous=touch;touch=null;input={x:0,y:0};
    if(previous.button&&!previous.moved){const button=hit(point.x,point.y);if(button&&button.id===previous.button)action(button.id);}
  }
  function onHide(){
    if(hidden||destroyed)return;game.save();if(active())pause(true);hidden=true;clearInput();
    if(frameId!==null){platform.cancel(frameId);frameId=null;}lastTime=null;if(audio)audio.suspend();
  }
  function onShow(){if(destroyed)return;hidden=false;lastTime=null;if(audio){audio.resume();volume();}tick(0);schedule();}
  function onResize(){clearInput();layout=platform.resize();if(game.resize)game.resize(layout.width,layout.height);tick(0);}
  const handlers=[['TouchStart',onTouchStart],['TouchMove',onTouchMove],['TouchEnd',onTouchEnd],['TouchCancel',clearInput],['Hide',onHide],['Show',onShow],['WindowResize',onResize]];
  for(const [name,handler] of handlers)if(wx['on'+name])wx['on'+name](handler);
  function report(){return {...game.getState(),hidden,collection,sound,calm,autoFire,viewport:{width:layout.width,height:layout.height}};}
  function destroy(){if(destroyed)return;game.save();destroyed=true;clearInput();if(frameId!==null)platform.cancel(frameId);if(audio)audio.destroy();for(const [name,handler] of handlers)if(wx['off'+name])wx['off'+name](handler);}
  tick(0);schedule();
  if(typeof GameGlobal!=='undefined')GameGlobal.windborne={getState:report};
  return {tick,destroy,getState:report,buttons:()=>Array.from(view.buttons||[],button=>({...button}))};
}
module.exports={boot};
