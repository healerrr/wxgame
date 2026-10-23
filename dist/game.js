/* Browser host for the shared ascent simulation and Canvas view. */
(() => {
  'use strict';
  const canvas=document.getElementById('flight-canvas'),ctx=canvas.getContext('2d'),controls=document.getElementById('game-controls'),status=document.getElementById('game-status');
  let width=innerWidth,height=innerHeight,audio=null,sound=false,calm=matchMedia('(prefers-reduced-motion: reduce)').matches,autoFire=true,collection=false,collectionResume=false,hidden=false;
  let time=0,lastTime=null,lastStatus='',lastScene=-1,lastThunder=0,audioAge=0,pointer=null,firePointer=null,axes={x:0,y:0},buttonFire=false,pointerTarget=null;
  const pressed=new Set(),buttonNodes=new Map(),clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
  let storage=null;try{storage=window.localStorage;}catch(_){}
  const game=new window.WindborneAdventure({storage,onEvent:event=>{if(audio&&sound&&['kill','pickup','victory'].includes(event.type))audio.chime(event.type==='kill'?'gate':'light');}});
  const view=new window.WindborneView((w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;});
  const art=window.loadWindborneArt?.(typeof window.Image==='function'?()=>new window.Image():null,loaded=>{view.setAssets?.(loaded);if(canvas.dataset)canvas.dataset.artStatus=`${loaded.loaded}/${loaded.total}; failed=${loaded.errors.length}`;});
  view.setAssets?.(art);
  function active(){return ['playing','takeoff'].includes(game.getState().phase);}
  function clearInput(){pressed.clear();pointer=null;firePointer=null;buttonFire=false;axes={x:0,y:0};pointerTarget=null;}
  function volume(){audio?.volume(sound&&!hidden&&!collection&&game.getState().phase!=='paused'?.065:0);}
  function pause(value){game.pause(value);clearInput();game.save();volume();}
  function toggleSound(){try{if(!audio)audio=new window.WindborneSound();sound=!sound;if(sound)audio.resume()?.catch?.(()=>{});volume();}catch(_){sound=false;}}
  function action(id){
    if(id==='start'){game.start();autoFire=true;clearInput();canvas.focus({preventScroll:true});}
    else if(id==='retry'){game.retry();autoFire=true;clearInput();canvas.focus({preventScroll:true});}
    else if(id==='pause')pause(true);
    else if(id==='resume'){pause(false);canvas.focus({preventScroll:true});}
    else if(id==='collection'){collectionResume=active();if(collectionResume)pause(true);collection=true;clearInput();game.save();}
    else if(id==='closeCollection'){collection=false;if(collectionResume)pause(false);collectionResume=false;canvas.focus({preventScroll:true});}
    else if(id==='sound')toggleSound();
    else if(id==='calm')calm=!calm;
    else if(id==='autofire')autoFire=!autoFire;
    volume();render();
  }
  function syncButtons(){
    const visible=new Set();
    for(const b of view.buttons){
      visible.add(b.id);let node=buttonNodes.get(b.id);
      if(!node){node=document.createElement('button');node.id=b.id;node.className='game-button';node.type='button';node.addEventListener('click',()=>{if(b.id!=='fire')action(b.id);});
        if(b.id==='fire'){
          node.addEventListener('pointerdown',e=>{if(active()&&!collection){e.preventDefault();firePointer=e.pointerId;node.setPointerCapture(e.pointerId);}});
          for(const type of ['pointerup','pointercancel','lostpointercapture'])node.addEventListener(type,()=>{firePointer=null;});
          node.addEventListener('keydown',e=>{if(['Space','Enter'].includes(e.code)){e.preventDefault();buttonFire=true;}});
          node.addEventListener('keyup',e=>{if(['Space','Enter'].includes(e.code)){e.preventDefault();buttonFire=false;}});
          node.addEventListener('blur',()=>{buttonFire=false;});
        }
        controls.append(node);buttonNodes.set(b.id,node);
      }
      node.textContent=b.label;node.setAttribute('aria-label',b.label);node.style.left=b.x+'px';node.style.top=b.y+'px';node.style.width=b.w+'px';node.style.height=b.h+'px';
      if(b.id==='autofire')node.setAttribute('aria-pressed',String(autoFire));
      if(b.id==='sound')node.setAttribute('aria-pressed',String(sound));
    }
    for(const [id,node] of buttonNodes)if(!visible.has(id)){node.remove();buttonNodes.delete(id);}
  }
  function render(){
    const state=game.getState();
    view.render(ctx,state,{width,height,safe:{top:12,bottom:height-16},sound,calm,time,collection,autoFire});syncButtons();
    const text=collection?`月光图鉴，已收藏${state.collected.length}位`:`${state.chapterName}。高度${Math.floor(state.height/100)*100}米，生命${Math.ceil(state.hp)}，星光${Math.floor(state.ammo)}。${state.phase==='gameover'?'机翼受损，请重新起飞。':state.phase==='victory'?'已抵达九霄云外。':state.warning||''}`;
    if(text!==lastStatus){status.textContent=text;lastStatus=text;}
    if(audio&&time-audioAge>.3){audioAge=time;if(state.scene!==lastScene){lastScene=state.scene;audio.theme(state.scene);}const weather=view.weather.report();audio.weather(weather.kind,weather.intensity);if(weather.thunderCount>lastThunder&&!calm)audio.thunder();lastThunder=weather.thunderCount;}
  }
  function resize(){width=window.innerWidth;height=window.innerHeight;const ratio=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);game.resize(width,height);clearInput();render();}
  function frame(now){
    const dt=lastTime===null?0:Math.min(.05,Math.max(0,(now-lastTime)/1000));lastTime=now;
    if(!hidden){time+=dt;const keyboardX=Number(pressed.has('ArrowRight')||pressed.has('KeyD'))-Number(pressed.has('ArrowLeft')||pressed.has('KeyA')),keyboardY=Number(pressed.has('ArrowDown')||pressed.has('KeyS'))-Number(pressed.has('ArrowUp')||pressed.has('KeyW'));
      if(pointerTarget&&!pointer){const p=game.getState().player,dx=pointerTarget.x-p.x,dy=pointerTarget.y-p.y;axes={x:Math.abs(dx)<.006?0:clamp(dx*7,-1,1),y:Math.abs(dy)<.006?0:clamp(dy*7,-1,1)};}
      const keyX=['ArrowLeft','ArrowRight','KeyA','KeyD'].some(code=>pressed.has(code)),keyY=['ArrowUp','ArrowDown','KeyW','KeyS'].some(code=>pressed.has(code));
      if(!collection)game.update(dt,{x:keyX?keyboardX:axes.x,y:keyY?keyboardY:axes.y,fire:autoFire||pressed.has('Space')||buttonFire||firePointer!==null,boost:false});render();
    }
    requestAnimationFrame(frame);
  }
  canvas.addEventListener('pointerdown',e=>{if(!active()||collection||pointer)return;pointerTarget=null;pointer={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);canvas.focus({preventScroll:true});});
  canvas.addEventListener('pointermove',e=>{if(!active()||collection)return;if(pointer&&e.pointerId===pointer.id){axes={x:clamp((e.clientX-pointer.x)/(width*.20),-1,1),y:clamp((e.clientY-pointer.y)/(height*.20),-1,1)};}else if(e.pointerType==='mouse'&&!pointer){pointerTarget={x:clamp(e.clientX/width,.055,.945),y:clamp(e.clientY/height,.42,.90)};}});
  const release=e=>{if(pointer&&e.pointerId===pointer.id){pointer=null;axes={x:0,y:0};pointerTarget=null;}};
  for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,release);
  canvas.addEventListener('pointerleave',()=>{if(!pointer){axes={x:0,y:0};pointerTarget=null;}});
  document.addEventListener('keydown',e=>{
    if(e.target.closest?.('button')&&['Space','Enter'].includes(e.code))return;
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space'].includes(e.code))e.preventDefault();
    if(!e.repeat&&['KeyA','KeyD','KeyW','KeyS','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space'].includes(e.code)&&active()&&!collection)pressed.add(e.code);
    if(e.repeat)return;
    if(e.code==='KeyP'||e.code==='Escape'){if(collection)action('closeCollection');else if(active())action('pause');else if(game.getState().phase==='paused')action('resume');}
    if(e.code==='KeyJ')action(collection?'closeCollection':'collection');
    if(e.code==='KeyM')action('sound');
    if(e.code==='KeyC')action('calm');
  });
  document.addEventListener('keyup',e=>pressed.delete(e.code));
  document.addEventListener('visibilitychange',()=>{hidden=document.hidden;if(hidden){if(active())pause(true);clearInput();game.save();volume();}lastTime=null;});
  window.addEventListener('blur',()=>{clearInput();if(active())pause(true);render();});
  window.addEventListener('pagehide',()=>{game.save();clearInput();});
  window.addEventListener('resize',resize);
  window.windborne={getState:()=>({...game.getState(),collection,sound,calm,autoFire,weather:view.weather.report(),art:{loaded:art?.loaded||0,total:art?.total||5,failed:art?.errors?.length||0},viewport:{width,height}})};
  resize();requestAnimationFrame(frame);
})();
