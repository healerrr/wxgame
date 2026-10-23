/* Windborne — an original p5.js interactive flight sketch.
   All visuals are generated at runtime; no external image or audio assets. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const Scenery = window.WindborneScenery;
  const Weather = window.WindborneWeather;
  const DISCOVERIES = window.WINDBORNE_DISCOVERIES;
  const THEMES = [
    { name:'深蓝之境', en:'THE BLUE HOUR', poem:'慢一点，风会等你。', sky:['#194d76','#15567f','#162d55'], glow:['#64b9be','#5575b8','#aebdab'], ink:['#b5dfeb','#cce9ec','#86bfd7','#f4edca'], sun:'#e5ead3' },
    { name:'落日来信', en:'LETTERS FROM THE SUN', poem:'今天的晚霞，也为你停留。', sky:['#666e9d','#ba8a9f','#4d557b'], glow:['#f6c9a2','#efb99d','#ad9fce'], ink:['#ffe5c6','#f7d5d4','#d3bddd','#fff1ce'], sun:'#ffdec1' },
    { name:'萤火森林', en:'A FOREST OF LITTLE LIGHTS', poem:'总有微小的光，为你而亮。', sky:['#285963','#1a6467','#133944'], glow:['#93ba87','#4caaa2','#c6cd91'], ink:['#cde8be','#a7ded0','#8fcdc9','#f3e9a7'], sun:'#dfedba' },
    { name:'星河入梦', en:'WHERE THE STARS GO', poem:'今夜，让星河接住你的梦。', sky:['#3d416d','#655480','#242747'], glow:['#bd96b8','#7786bb','#d2a6bb'], ink:['#e7d5f1','#c5d0ed','#b9a5d6','#ffdfc7'], sun:'#e4cdeb' }
  ];
  let engine, ready=false, pauseFocus, journalWasPaused=false;
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const journey=new window.WindborneJourney({
    onChange:()=>{if(ready)syncJourney();},
    onUnlock:memory=>{
      state.sceneAge=0;toast(`收到了「${memory.title}」 · 已放进风的手记`);
      if(engine)engine.celebrate();
    }
  });
  const saved=journey.getSnapshot();
  const state = {
    started:false, paused:false, sound:false, auto:saved.settings.auto, scene:saved.settings.scene, sceneAge:0,
    mode:saved.settings.mode, calm:reducedMotion||saved.settings.calm,
    time:0, distance:saved.totalDistance, collected:saved.totalLights, steering:0, targetSteer:0,
    pointerActive:false, pointerStartX:0, pointerStartY:0, pointerX:0, keyboard:0,
    pitch:0, targetPitch:0, keyboardPitch:0, boosting:false, energy:1, flightSpeed:1,
    altitude:.5, flightLabel:'顺风滑翔', discoveries:0, discoveryName:'', worldDistance:0,
    weatherMode:saved.settings.weather||'auto',weatherName:'随风天气',weatherKind:'clear',weatherWind:0,
    phase:0, lastCollect:-100, fps:60, quality:1
  };
  const sceneCycle=new window.WindborneSceneCycle(THEMES.length);
  const LANDSCAPES=['山涧流水','落日麦浪','青绿田野','漫天星河'];
  let toastTimer, chapterTimer, audio, tipTimer;
  const pressedKeys=new Set();
  let pointerBoost=false,buttonBoost=false;
  const hex = (v) => [parseInt(v.slice(1,3),16),parseInt(v.slice(3,5),16),parseInt(v.slice(5,7),16)];
  const mix = (a,b,t) => a.map((v,i)=>v+(b[i]-v)*t);
  const rgb = (v,a=1) => `rgba(${v[0]|0},${v[1]|0},${v[2]|0},${a})`;
  function toast(message) {
    clearTimeout(toastTimer); $('toast').textContent=message; $('toast').classList.add('visible');
    toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3300);
  }
  function chapter() {
    clearTimeout(chapterTimer);
    const t=THEMES[state.scene]; $('chapter-en').textContent=t.en; $('chapter-title').textContent=t.name; $('chapter-poem').textContent=t.poem;
    $('chapter').classList.add('visible');$('chapter').setAttribute('aria-hidden','false');chapterTimer=setTimeout(()=>{$('chapter').classList.remove('visible');$('chapter').setAttribute('aria-hidden','true');},5600);
  }
  function setScene(index,manual=false) {
    state.scene=(index+THEMES.length)%THEMES.length; state.sceneAge=0;
    $('scene-number').textContent=String(state.scene+1).padStart(2,'0'); $('scene-name').textContent=THEMES[state.scene].name;
    document.querySelectorAll('.swatch').forEach((b,i)=>{b.classList.toggle('active',i===state.scene);b.setAttribute('aria-pressed',String(i===state.scene));});
    if(manual && state.auto) { state.auto=false; syncAuto(); }
    if(manual)sceneCycle.reset();
    journey.setSettings({scene:state.scene,auto:state.auto});
    if(engine)engine.resetRoute();
    syncJourney();
    if(state.started) chapter();
    if(audio) audio.theme(state.scene);
  }
  function syncAuto(){ $('auto').classList.toggle('active',state.auto); $('auto').setAttribute('aria-pressed',String(state.auto)); }
  function syncWeather(){
    $('weather-name').textContent=(state.weatherMode==='auto'?'随风 · ':'')+state.weatherName;
    $('weather').setAttribute('aria-label','切换天气，当前'+(state.weatherMode==='auto'?'随风变化，':'')+state.weatherName);
    $('weather').setAttribute('data-weather',state.weatherKind);
  }
  function cycleWeather(){
    const modes=['auto','rain','snow','storm','clear'];state.weatherMode=modes[(modes.indexOf(state.weatherMode)+1)%modes.length];
    journey.setSettings({weather:state.weatherMode});
    toast({auto:'让雨雪和晴光，随风慢慢抵达',rain:'听雨落进山谷，沿着微光继续飞',snow:'穿过轻雪，接住一片安静',storm:'云层深处，雷光正在写信',clear:'云散了，留一片晴空给你'}[state.weatherMode]);
    if(engine)engine.weatherChanged();syncWeather();
  }
  function clearInput(){pressedKeys.clear();pointerBoost=false;buttonBoost=false;state.keyboard=0;state.keyboardPitch=0;state.targetSteer=0;state.targetPitch=0;state.boosting=false;state.pointerActive=false;syncFlight();}
  function syncFlight(){
    $('flight-label').textContent=state.flightLabel;
    $('flight-speed').textContent=state.flightSpeed.toFixed(1);
    $('flight-altitude').textContent=state.altitude>.66?'云端 · 高空':state.altitude<.32?'掠影 · 低空':'云下 · 中空';
    $('wind-energy').value=state.energy;
    $('discovery-count').textContent=state.discoveries;
    $('discovery-name').textContent=state.discoveryName||'循着地平线，发现远方';
    $('boost').setAttribute('aria-pressed',String(state.boosting));
  }
  function pause(force) {
    if(!state.started)return;
    state.paused=typeof force==='boolean'?force:!state.paused;
    $('paused').hidden=!state.paused; $('pause').classList.toggle('is-paused',state.paused);
    $('pause').setAttribute('aria-pressed',String(state.paused)); $('pause').setAttribute('aria-label',state.paused?'继续飞行':'暂停飞行');
    clearInput();
    for(const node of document.querySelectorAll('.topbar,.bottom-bar,#world,#flight-info,#journey-panel,#flight-telemetry,#boost'))node.inert=state.paused;
    if(state.paused){pauseFocus=document.activeElement;journey.setDistance(state.distance);journey.flush();$('resume').focus();}
    else if(pauseFocus && !pauseFocus.inert){pauseFocus.focus({preventScroll:true});}
    if(audio) audio.volume(state.sound && !state.paused ? .065 : 0);
  }
  function start() {
    if(state.started) return;
    state.started=true;state.sceneAge=0;document.body.classList.add('playing');$('intro').inert=true;$('flight-info').inert=false;
    $('pause').disabled=false;if(engine)engine.resetRoute();syncJourney();chapter();
    document.querySelector('#world canvas')?.focus({preventScroll:true});
    clearTimeout(tipTimer);tipTimer=setTimeout(()=>{$('gesture-tip').classList.add('visible');tipTimer=setTimeout(()=>$('gesture-tip').classList.remove('visible'),5000);},6500);
  }
  function toggleSound() {
    try {
      if(!audio) audio=new AmbientAudio();
      audio.ctx.resume().catch(()=>toast('轻点声音按钮，再让风唱一次')); state.sound=!state.sound;
      audio.volume(state.sound && !state.paused ? .065 : 0);
      $('sound').classList.toggle('sound-on',state.sound); $('sound').setAttribute('aria-pressed',String(state.sound));
      $('sound').setAttribute('aria-label',state.sound?'关闭环境音':'开启环境音');
      toast(state.sound?'听，风有了声音':'留一片安静给自己');
    } catch {toast('当前浏览器暂不支持环境音');}
  }
  class AmbientAudio {
    constructor(){
      const AC=window.AudioContext||window.webkitAudioContext; this.ctx=new AC(); this.master=this.ctx.createGain();this.master.gain.value=0;this.master.connect(this.ctx.destination);
      const filter=this.ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=350;filter.connect(this.master);
      const noise=this.ctx.createBuffer(1,this.ctx.sampleRate*4,this.ctx.sampleRate);const data=noise.getChannelData(0);let last=0;
      for(let i=0;i<data.length;i++){last=(last+Math.random()*.035-.0175)/1.015;data[i]=last*3;}
      const source=this.ctx.createBufferSource();source.buffer=noise;source.loop=true;source.connect(filter);source.start();
      this.windBuffer=noise;
      const rain=this.ctx.createBuffer(1,this.ctx.sampleRate*2,this.ctx.sampleRate),rainData=rain.getChannelData(0);
      for(let i=0;i<rainData.length;i++)rainData[i]=(Math.random()*2-1)*.45;
      this.weatherGain=this.ctx.createGain();this.weatherGain.gain.value=0;this.weatherGain.connect(this.master);
      const rainFilter=this.ctx.createBiquadFilter();rainFilter.type='lowpass';rainFilter.frequency.value=1800;rainFilter.connect(this.weatherGain);
      const rainSource=this.ctx.createBufferSource();rainSource.buffer=rain;rainSource.loop=true;rainSource.connect(rainFilter);rainSource.start();
      this.oscs=[];const notes=[130.81,196,261.63];notes.forEach((freq,i)=>{const osc=this.ctx.createOscillator(),gain=this.ctx.createGain();osc.type='sine';osc.frequency.value=freq;gain.gain.value=.12/(i+1);osc.connect(gain);gain.connect(this.master);osc.start();this.oscs.push(osc);});
      this.theme(state.scene);
    }
    volume(v){this.master.gain.setTargetAtTime(v,this.ctx.currentTime,.8);}
    theme(scene){const roots=[130.81,146.83,174.61,110];this.oscs.forEach((o,i)=>o.frequency.setTargetAtTime(roots[scene]*[1,1.5,2][i],this.ctx.currentTime,2));}
    weather(kind,intensity){this.weatherGain.gain.setTargetAtTime((kind==='storm'?.68:kind==='rain'?.40:0)*intensity,this.ctx.currentTime,1.5);}
    thunder(){
      if(!state.sound)return;
      const t=this.ctx.currentTime,source=this.ctx.createBufferSource(),filter=this.ctx.createBiquadFilter(),gain=this.ctx.createGain();
      source.buffer=this.windBuffer;filter.type='lowpass';filter.frequency.value=145;gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(.8,t+.35);gain.gain.exponentialRampToValueAtTime(.001,t+3.3);
      source.connect(filter);filter.connect(gain);gain.connect(this.master);source.start(t);source.stop(t+3.5);source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};
    }
    chime(kind='light'){if(!state.sound)return;const t=this.ctx.currentTime,o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type='sine';o.frequency.value=kind==='ripple'?261.63:kind==='gate'?392:[523.25,587.33,659.25,783.99,880][state.collected%5];g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.36,t+.035);g.gain.exponentialRampToValueAtTime(.001,t+2.3);o.connect(g);g.connect(this.master);o.start(t);o.stop(t+2.4);o.onended=()=>{o.disconnect();g.disconnect();};}
  }

  function syncJourney(){
    const current=journey.getScene(state.scene),snapshot=journey.getSnapshot();
    $('journey-panel').hidden=!state.started||state.mode==='drift';
    $('journey-title').textContent=current.title;
    $('journey-description').textContent=current.description;
    $('journey-count').textContent=current.completed?'已珍藏':`${current.count} / ${current.target}`;
    const dots=document.createDocumentFragment();
    for(let i=0;i<(current.completed?5:current.target);i++){const dot=document.createElement('i');dot.className=`progress-dot${current.completed||i<current.count?' done':i===current.count?' active':''}`;dots.append(dot);}
    $('journey-progress').replaceChildren(dots);
    $('journey-next').textContent=current.completed?'打开右上角手记，读一封给自己的信。':current.task==='ripple'?'轻点天空或按 R · 每一次涟漪都会被记住。':'这一程的尽头，有一封风的来信。';
    $('journey-steps').replaceChildren(...current.steps.map(step=>{const node=document.createElement('i');node.className=step.done?'done':step.type===current.task?'active':'';return node;}));
    $('mode-switch').textContent=state.mode==='seek'?'寻光漫游 ⇄':'自在飞行 ⇄';
    document.querySelectorAll('.mode-option').forEach(button=>{const active=button.dataset.mode===state.mode;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
    $('collected').textContent=String(state.collected).padStart(2,'0');
    $('distance').innerHTML=`${Math.floor(state.distance)}<small>m</small>`;
    $('journal-count').hidden=snapshot.unlocked.length===0;$('journal-count').textContent=snapshot.unlocked.length;
    document.body.classList.toggle('drifting',state.mode==='drift');
  }
  function setMode(mode){
    state.mode=mode;journey.setSettings({mode});syncJourney();if(engine)engine.resetRoute();
    if(state.started)toast(mode==='drift'?'此刻没有目标，只有你和风':'沿着微光，慢慢收一封来信');
  }
  function toggleCalm(){
    state.calm=!state.calm;journey.setSettings({calm:state.calm});syncCalm();
    toast(state.calm?'风慢了下来 · 舒缓模式已开启':'回到轻盈的风里');
  }
  function syncCalm(){$('calm').setAttribute('aria-pressed',String(state.calm));$('calm').setAttribute('aria-label',state.calm?'关闭舒缓模式':'开启舒缓模式');document.body.classList.toggle('calm',state.calm);}
  function openJournal(){
    if($('journal-dialog').open)return;
    journalWasPaused=state.paused;if(state.started)pause(true);$('paused').hidden=true;
    const cards=THEMES.map((theme,index)=>{
      const progress=journey.getScene(index),memory=window.WINDBORNE_MEMORIES[index];
      const places=journey.getSnapshot().discoveries.filter(id=>id.startsWith(index+':')).map(id=>DISCOVERIES[index][Number(id.split(':')[1])]);
      const article=document.createElement('article');article.className=`memory-card ${progress.completed?'unlocked':'locked'}`;article.dataset.scene=index;
      article.innerHTML=`<div class="memory-art" aria-hidden="true"><span>0${index+1}</span><svg viewBox="0 0 200 100" fill="none"><path d="M0 82Q45 25 90 65T200 35M0 96Q60 55 115 78T200 63" stroke="currentColor" stroke-width=".7"/><circle cx="150" cy="26" r="10" stroke="currentColor" stroke-width=".7"/><path d="m83 45 28-11-10 28-7-10-11-7Zm11 7 17-18" stroke="currentColor" stroke-width=".8"/></svg></div><small>${theme.name}</small><h3>${progress.completed?memory.title:'等风捎来一封信'}</h3><p>${progress.completed?memory.poem:'拾五束微光，穿过两个风环，<br>唤起三次涟漪，慢慢遇见这片天空。'}</p><span class="memory-status">${progress.completed?'✧ 已珍藏':`${progress.steps.filter(step=>step.done).length} / 3 段旅程 · 随时继续`}</span>`;
      const discoveries=document.createElement('div');discoveries.className='memory-discoveries';discoveries.textContent=`秘境 ${places.length} / 3 · ${places.join(' · ')||'沿着地平线，等待偶遇'}`;article.append(discoveries);
      return article;
    });
    $('memory-grid').replaceChildren(...cards);
    $('journal-summary').textContent=`已珍藏 ${journey.getSnapshot().unlocked.length} / 4 封来信 · 秘境 ${journey.getSnapshot().discoveries.length} / 12`;
    $('journal-dialog').showModal();
  }
  $('journal').addEventListener('click',openJournal);
  $('close-journal').addEventListener('click',()=>$('journal-dialog').close());
  $('journal-dialog').addEventListener('close',()=>{if(state.started)pause(journalWasPaused);$('journal').focus({preventScroll:true});});
  $('calm').addEventListener('click',toggleCalm);
  $('mode-switch').addEventListener('click',()=>setMode(state.mode==='seek'?'drift':'seek'));
  document.querySelectorAll('.mode-option').forEach(button=>button.addEventListener('click',()=>setMode(button.dataset.mode)));
  $('breathe').addEventListener('click',()=>{setMode('drift');if(!state.started)start();if(!state.calm){state.calm=true;journey.setSettings({calm:true});syncCalm();}toast('跟随光点，轻轻吸气，慢慢呼气');});

  $('start').addEventListener('click',start); $('pause').addEventListener('click',()=>pause()); $('resume').addEventListener('click',()=>pause(false)); $('sound').addEventListener('click',toggleSound);
  $('weather').addEventListener('click',cycleWeather);
  const boostButton=$('boost');
  const updateBoost=()=>{state.boosting=(pointerBoost||buttonBoost||pressedKeys.has('ShiftLeft')||pressedKeys.has('ShiftRight'))&&state.energy>.08;};
  boostButton.addEventListener('pointerdown',e=>{if(!state.started||state.paused)return;e.preventDefault();boostButton.setPointerCapture(e.pointerId);pointerBoost=true;updateBoost();syncFlight();});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])boostButton.addEventListener(event,()=>{pointerBoost=false;updateBoost();syncFlight();});
  boostButton.addEventListener('keydown',e=>{if(['Space','Enter'].includes(e.code)&&!state.paused){e.preventDefault();if(!e.repeat){buttonBoost=true;updateBoost();}}});
  boostButton.addEventListener('keyup',e=>{if(['Space','Enter'].includes(e.code)){e.preventDefault();buttonBoost=false;updateBoost();}});
  boostButton.addEventListener('blur',()=>{buttonBoost=false;updateBoost();});
  $('auto').addEventListener('click',()=>{state.auto=!state.auto;state.sceneAge=0;sceneCycle.reset();syncAuto();journey.setSettings({auto:state.auto});toast(state.auto?'让风随机捎来下一片风景 · 寻光进度会保留':'停留在喜欢的这片天空');});
  document.querySelectorAll('.swatch').forEach(b=>b.addEventListener('click',()=>setScene(Number(b.dataset.scene),true)));
  $('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('当前环境暂不支持全屏');}});
  document.addEventListener('keydown',e=>{
    if($('journal-dialog').open)return;
    if(state.paused&&e.code==='Tab'){e.preventDefault();$('resume').focus();return;}
    if(e.target.closest?.('button,a')&&(e.code==='Space'||e.code==='Enter'))return;
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space'].includes(e.code))e.preventDefault();
    if(!e.repeat&&!state.paused&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyA','KeyD','KeyW','KeyS','ShiftLeft','ShiftRight'].includes(e.code)){
      pressedKeys.add(e.code);syncKeys();
    }
    if(e.repeat)return;
    if(e.code==='Space'){if(!state.started)start();else pause();}
    if(e.code==='Escape'&&state.started)pause();
    if(e.code==='KeyM')toggleSound();if(e.code==='KeyN'&&!state.paused)setScene(state.scene+1,true);
    if(e.code==='KeyJ')openJournal();if(e.code==='KeyR'&&state.started&&!state.paused&&engine)engine.ripple();
    if(e.code==='KeyT'&&!state.paused)cycleWeather();
  });
  function syncKeys(){
    state.keyboard=Number(pressedKeys.has('ArrowRight')||pressedKeys.has('KeyD'))-Number(pressedKeys.has('ArrowLeft')||pressedKeys.has('KeyA'));
    state.keyboardPitch=Number(pressedKeys.has('ArrowDown')||pressedKeys.has('KeyS'))-Number(pressedKeys.has('ArrowUp')||pressedKeys.has('KeyW'));
    state.targetSteer=state.keyboard;state.targetPitch=state.keyboardPitch;
    updateBoost();
  }
  document.addEventListener('keyup',e=>{if(pressedKeys.delete(e.code))syncKeys();});
  window.addEventListener('blur',clearInput);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();journey.flush();if(state.started&&!state.paused)pause(true);}});
  window.addEventListener('pagehide',()=>{journey.setDistance(state.distance);journey.flush();});
  if(matchMedia('(pointer:coarse)').matches)$('hint-text').textContent='手指自由拖动升降转向 · 按住乘风加速';
  $('pause').disabled=true;$('flight-info').inert=true;ready=true;syncCalm();syncAuto();setScene(state.scene);syncJourney();

  new p5(p => {
    let W,H,D,particles=[],lights=[],motes=[],rings=[],sparks=[],wake=[],gates=[],gusts=[],floating=[];
    let gateClock=0,lastRipple=-10,celebration=-100,routeSerial=0,lastTask='',lastSave=0;
    let trail,trailCtx,fieldX,fieldY,cols,rows;
    let planeX,planeY,planeAngle=0,tilt=0,mouseLastTime=-10;
    let thermals=[],landmarks=[],explorationScene=-1,skimAge=0,skimRest=-100,thermalNotice=-100;
    const particleCount=()=>Math.round(Math.min(650,Math.max(100,W*H*.00042)));
    const palettes=THEMES.map(t=>t.ink.map(hex));
    let palette=palettes[0].map(c=>c.slice());
    const createLayer=()=>{const c=document.createElement('canvas');c.width=W;c.height=H;return c;};
    const scenery=new Scenery((w,h)=>{const c=createLayer();c.width=w;c.height=h;return c;});
    const weather=new Weather((w,h)=>{const c=createLayer();c.width=w;c.height=h;return c;});
    let weatherState={kind:'clear',label:'晴空',intensity:0,wind:0,precipitation:0,lightning:false,thunderCount:0,weatherTime:0},lastThunder=0,weatherAudioTime=-100;
    function init(){
      W=p.width;H=p.height;D=Math.min(W,H);planeX=W*(W<=700?.82:.65);planeY=H*(W<=700?.43:.56);
      trail=createLayer();trailCtx=trail.getContext('2d');
      cols=Math.ceil(W/65)+2;rows=Math.ceil(H/65)+2;fieldX=new Float32Array(cols*rows);fieldY=new Float32Array(cols*rows);
      const count=particleCount();
      particles=Array.from({length:count},()=>newParticle(true));
      motes=Array.from({length:22},()=>({x:Math.random()*W,y:Math.random()*H,size:Math.random()*3+1.2,phase:Math.random()*6.28,depth:Math.random()*.5+.3}));
      resetRoute();
      wake=[];rings=[];sparks=[];updateField();
    }
    function newParticle(randomY){return{x:Math.random()*W,y:randomY?Math.random()*H:-Math.random()*60,vx:0,vy:0,group:Math.floor(Math.random()*4),size:Math.random()*.7+.3,life:Math.random()};}
    function newLight(x,y){return{x,y,r:8+Math.random()*3,phase:Math.random()*6.28,used:false,depth:.65+Math.random()*.2};}
    function routeX(){routeSerial++;return W*(.5+Math.sin(routeSerial*1.12)*.20);}
    function resetRoute(){
      routeSerial=0;gates=[];gateClock=0;lastTask='';
      resetExploration();
      lights=Array.from({length:5},(_,index)=>newLight(index===0?W*.5:routeX(),(state.started?H*.45:H*.30)-index*Math.max(135,H*.24)));
      // Leave room to settle from the title pose before the faster wind arrives.
      lights[0].phase=0;lights[0].depth=.70;if(state.started)lights[0].y=H*.28;
    }
    function addFloat(text,x,y){floating.push({text,x,y,age:0});if(floating.length>5)floating.shift();}
    function ripple(x=planeX,y=planeY-H*.1){
      if(!state.started||state.paused||state.time-lastRipple<.55)return;
      lastRipple=state.time;gusts.push({x,y,age:0});if(gusts.length>5)gusts.shift();
      rings.push({x,y,r:5,a:1,touch:true});
      if(state.mode==='seek')journey.record('ripple',state.scene);
      if(audio)audio.chime('ripple');
      $('gesture-tip').classList.remove('visible');
    }
    engine={resetRoute,ripple,weatherChanged:()=>updateWeather(0),celebrate:()=>{celebration=state.time;for(let k=0;k<28;k++){const a=k*Math.PI*2/28;sparks.push({x:planeX,y:planeY,vx:Math.cos(a)*1.5,vy:Math.sin(a)*1.5,a:1});}if(audio)audio.chime('gate');}};
    function updateField(){for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const a=(p.noise(x*.115,y*.115,state.time*.028)-.5)*Math.PI*3.8+Math.sin(y*.23+state.time*.13)*.7;const i=y*cols+x;fieldX[i]=Math.cos(a)*.8;fieldY[i]=Math.sin(a)*.7;}}
    function resetExploration(){
      const places=journey.getSnapshot().discoveries||[];
      state.discoveries=places.length;
      if(!state.discoveryName&&places.length){const [scene,variant]=places[places.length-1].split(':').map(Number);state.discoveryName=DISCOVERIES[scene][variant];}
      if(explorationScene===state.scene)return;
      explorationScene=state.scene;
      thermals=Array.from({length:3},(_,i)=>({lane:[-.32,.40,.02][i],lift:-.10,z:state.worldDistance+190+i*270,inside:false}));
      landmarks=Array.from({length:3},(_,i)=>({lane:[.28,-.38,.04][i],lift:[0,.035,-.045][i],z:state.worldDistance+320+i*310,variant:i,id:state.scene+':'+i,found:(journey.getSnapshot().discoveries||[]).includes(state.scene+':'+i)}));
    }
    function flightPoint(item){
      const z=item.z-state.worldDistance,scale=130/(Math.max(-60,z)+130);
      return {x:W*(.5+item.lane*.75*scale-state.steering*.055*scale),y:H*(.39+(.43+item.lift+(state.altitude-.5)*.07)*scale),r:Math.max(12,D*.15*scale),z,scale};
    }
    function updateFlight(dt){
      state.pitch+=(state.targetPitch-state.pitch)*Math.min(1,.05*dt);
      const targetAltitude=.5-state.pitch*.43;
      state.altitude+=(targetAltitude-state.altitude)*Math.min(1,.035*dt);
      if(!state.started){state.worldDistance+=dt*.06;state.flightSpeed=1;return;}
      const thermal=thermals.some(t=>t.inside);
      if(state.boosting&&state.energy<=.006)state.boosting=false;
      const boosted=state.boosting&&state.energy>0;
      state.energy=Math.min(1,Math.max(0,state.energy+dt*(thermal?.008:boosted?-.0035:.00125)));
      const desired=1+Math.max(0,state.pitch)*.55+Math.min(0,state.pitch)*.38+(boosted?.95:0)+(thermal?.30:0)+Math.abs(state.weatherWind)*.15;
      state.flightSpeed+=(desired-state.flightSpeed)*Math.min(1,.035*dt);
      state.worldDistance+=dt*.255*state.flightSpeed;
      state.flightLabel=thermal?'云间借风':boosted?'乘风而行':state.pitch>.3?'俯冲掠影':state.pitch<-.3?'向云攀升':'顺风滑翔';
    }
    function paintExploration(ctx,dt){
      if(!state.started)return;
      const names=DISCOVERIES;
      for(const thermal of thermals){
        let point=flightPoint(thermal);
        if(point.z< -55){thermal.z+=810;point=flightPoint(thermal);}
        const {x,y,r,scale}=point;thermal.inside=false;
        if(y<0||y>H+r*3)continue;
        ctx.save();ctx.translate(x,y);ctx.strokeStyle=rgb(palette[0],.13+Math.min(.18,scale*.2));ctx.lineWidth=1;
        for(let strand=0;strand<2;strand++){
          ctx.beginPath();for(let j=0;j<=24;j++){const t=j/24,a=t*Math.PI*2+state.time*.65+strand*Math.PI,xx=Math.cos(a)*r*(.5+t*.5),yy=(.5-t)*r*2.5; j?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy);}ctx.stroke();
        }
        const glow=ctx.createRadialGradient(0,0,0,0,0,r*2.5);glow.addColorStop(0,rgb(palette[0],.11));glow.addColorStop(1,rgb(palette[0],0));ctx.fillStyle=glow;ctx.fillRect(-r*2.5,-r*2.5,r*5,r*5);
        if(scale>.32&&state.sceneAge>6){ctx.font='10px "Microsoft YaHei", sans-serif';ctx.textAlign='center';ctx.fillStyle=rgb(palette[0],.70);ctx.fillText('云间借风',0,-r*1.8);}
        ctx.restore();
        if(state.started&&point.z<220&&point.z> -20&&Math.hypot((x-planeX)*.85,(y-planeY)*.65)<Math.max(38,r*1.7)){
          thermal.inside=true;
          if(state.time-thermalNotice>9){thermalNotice=state.time;addFloat('风能正在盈满',planeX,planeY-45);if(audio)audio.chime('gate');}
        }
      }
      for(const landmark of landmarks){
        let point=flightPoint(landmark);
        if(point.z< -55){landmark.z+=930;point=flightPoint(landmark);}
        const {x,y,r,scale}=point;if(y>H+r*3||y<0)continue;
        ctx.save();ctx.translate(x,y);ctx.globalAlpha=Math.min(.9,.22+scale);ctx.strokeStyle=rgb(palette[3],landmark.found?.36:.75);ctx.fillStyle=rgb(palette[3],.07);ctx.lineWidth=1;
        // Small, original landmarks belong to the world and grow as we approach.
        const island=ctx.createLinearGradient(0,r*.2,0,r*1.2);island.addColorStop(0,rgb(palette[1],.15));island.addColorStop(1,rgb(palette[1],0));ctx.fillStyle=island;
        ctx.beginPath();ctx.moveTo(-r*1.15,r*.65);ctx.bezierCurveTo(-r*.6,r*.23,r*.55,r*.18,r*1.15,r*.65);ctx.bezierCurveTo(r*.5,r*1.05,-r*.5,r*1.15,-r*1.15,r*.65);ctx.closePath();ctx.fill();
        if(state.scene===2&&landmark.variant===0){
          ctx.fillStyle='#254e48';ctx.beginPath();ctx.moveTo(-r*.17,r*.5);ctx.quadraticCurveTo(-r*.04,-r*.3,-r*.3,-r*.9);ctx.lineTo(r*.26,-r*.9);ctx.quadraticCurveTo(r*.04,-r*.3,r*.19,r*.5);ctx.fill();
          ctx.fillStyle='rgba(117,173,136,.5)';for(let j=0;j<5;j++){ctx.beginPath();ctx.ellipse((j-2)*r*.37,-r*.85-Math.sin(j*.8)*r*.4,r*.63,r*.49,0,0,Math.PI*2);ctx.fill();}
          ctx.fillStyle=rgb(palette[3],.8);for(let j=0;j<9;j++){ctx.beginPath();ctx.arc(Math.sin(j*2.1)*r,-r*.7+Math.cos(j*1.9)*r*.6,1.4,0,Math.PI*2);ctx.fill();}
        }else if(state.scene===3&&landmark.variant===0){
          ctx.fillStyle=rgb(palette[1],.28);ctx.beginPath();ctx.moveTo(-r*1.25,-r*.3);ctx.bezierCurveTo(-r*.8,-r*1.1,r*.9,-r*.7,r*1.2,-r*.1);ctx.bezierCurveTo(r*1.8,-r*.2,r*1.7,-r*.6,r*1.8,-r*.7);ctx.lineTo(r*1.8,r*.3);ctx.quadraticCurveTo(r*1.5,r*.05,r*1.1,0);ctx.bezierCurveTo(r*.4,r*.5,-r*.9,r*.2,-r*1.25,-r*.3);ctx.fill();ctx.stroke();
          ctx.fillStyle=rgb(palette[3],.9);ctx.beginPath();ctx.arc(-r*.65,-r*.3,1.8,0,Math.PI*2);ctx.fill();
        }else if(landmark.variant===0){
          ctx.fillStyle=rgb(palette[1],.18);
          ctx.beginPath();ctx.moveTo(-r*.26,r*.5);ctx.lineTo(-r*.18,-r*.8);ctx.lineTo(r*.18,-r*.8);ctx.lineTo(r*.26,r*.5);ctx.closePath();ctx.fill();ctx.stroke();
          ctx.beginPath();ctx.moveTo(-r*.39,-r*.8);ctx.lineTo(0,-r*1.16);ctx.lineTo(r*.39,-r*.8);ctx.stroke();
          if(state.scene===1){ctx.save();ctx.translate(0,-r*.64);ctx.rotate(state.time*.4);for(let j=0;j<4;j++){ctx.rotate(Math.PI/2);ctx.fillStyle=rgb(palette[3],.18);ctx.fillRect(r*.10,-r*.12,r*.83,r*.22);ctx.strokeRect(r*.10,-r*.12,r*.83,r*.22);}ctx.restore();}
          const halo=ctx.createRadialGradient(0,-r*.72,0,0,-r*.72,r*1.9);halo.addColorStop(0,rgb(palette[3],.28));halo.addColorStop(1,rgb(palette[3],0));ctx.fillStyle=halo;ctx.fillRect(-r*2,-r*2.7,r*4,r*4);
        }else if(state.scene===1&&landmark.variant===1){
          for(let j=0;j<11;j++){const xx=Math.sin(j*2.4)*r*1.2,yy=Math.cos(j*1.7)*r*.3;ctx.strokeStyle=rgb(palette[0],.35);ctx.beginPath();ctx.moveTo(xx,r*.6);ctx.lineTo(xx,yy);ctx.stroke();ctx.fillStyle=rgb(palette[3],.65);for(let petal=0;petal<5;petal++){const a=petal*Math.PI*2/5;ctx.beginPath();ctx.ellipse(xx+Math.cos(a)*r*.10,yy+Math.sin(a)*r*.10,r*.11,r*.07,a,0,Math.PI*2);ctx.fill();}}
        }else if(state.scene===0&&landmark.variant===1){
          for(let j=0;j<3;j++){const xx=(j-1)*r*.75,yy=Math.sin(state.time+j)*r*.12;ctx.strokeStyle=rgb(palette[0],.75);ctx.beginPath();ctx.moveTo(xx-r*.42,yy-r*.18);ctx.quadraticCurveTo(xx-r*.12,yy-r*.46,xx,yy);ctx.quadraticCurveTo(xx+r*.18,yy-r*.34,xx+r*.46,yy-r*.14);ctx.stroke();}
        }else if(landmark.variant===1){
          ctx.beginPath();ctx.ellipse(0,-r*.18,r*.68,r,0,Math.PI,Math.PI*2);ctx.lineTo(r*.68,r*.5);ctx.moveTo(-r*.68,-r*.18);ctx.lineTo(-r*.68,r*.5);ctx.stroke();
          for(let j=0;j<5;j++){const a=state.time*.16+j*1.256;ctx.beginPath();ctx.arc(Math.cos(a)*r*.8,-r*.1+Math.sin(a)*r*.7,1.3,0,Math.PI*2);ctx.fill();}
        }else{
          ctx.beginPath();ctx.moveTo(-r*1.2,r*.35);ctx.quadraticCurveTo(0,-r*.55,r*1.2,r*.35);ctx.moveTo(-r*1.1,r*.55);ctx.quadraticCurveTo(0,-r*.1,r*1.1,r*.55);ctx.moveTo(-r*.7,r*.05);ctx.lineTo(-r*.7,r*.5);ctx.moveTo(r*.7,r*.05);ctx.lineTo(r*.7,r*.5);ctx.stroke();
        }
        if(scale>.28&&state.sceneAge>6){ctx.textAlign='center';ctx.font='10px "Microsoft YaHei", sans-serif';ctx.fillStyle=rgb(palette[3],.85);ctx.fillText((landmark.found?'已收藏 · ':'')+names[state.scene][landmark.variant],0,-r*1.48);if(!landmark.found){ctx.font='8px "Microsoft YaHei", sans-serif';ctx.fillStyle=rgb(palette[0],.6);ctx.fillText('靠近，收藏这片风景',0,r*1.45);}}
        ctx.restore();
        if(state.started&&!landmark.found&&point.z<180&&point.z> -20&&Math.hypot(x-planeX,y-planeY)<Math.max(42,r*1.8)){
          landmark.found=true;journey.discover(state.scene,landmark.variant);state.discoveries=journey.getSnapshot().discoveries.length;state.discoveryName=names[state.scene][landmark.variant];
          toast('发现秘境 · '+state.discoveryName+' · 已收入风的手记');addFloat('把远方，折进手记',planeX,planeY-44);
          rings.push({x:planeX,y:planeY,r:20,a:1});if(audio)audio.chime('gate');
        }
      }
      if(state.started&&state.altitude<.30){
        skimAge+=dt/60;
        ctx.save();ctx.strokeStyle=rgb(palette[3],.22);ctx.lineWidth=1;ctx.beginPath();const span=18+(state.time*24)%80;ctx.ellipse(planeX,planeY+45,span,span*.22,0,0,Math.PI*2);ctx.stroke();ctx.restore();
        if(skimAge>1.8&&state.time-skimRest>10){skimRest=state.time;addFloat(['掠过水面，风也泛起涟漪','麦浪轻轻碰了碰机翼','萤火为你让出一条路','星河从翼尖流过'][state.scene],planeX,planeY-40);state.energy=Math.min(1,state.energy+.13);}
      }else skimAge=0;
    }
    function flightReport(){return {pitch:state.pitch,energy:state.energy,flightSpeed:state.flightSpeed,altitude:state.altitude,boosting:state.boosting,flightLabel:state.flightLabel,worldDistance:state.worldDistance,discoveries:state.discoveries,discoveryName:state.discoveryName,weather:{...weatherState,mode:state.weatherMode}};}
    function explorationReport(){return {thermals:thermals.map(item=>({...flightPoint(item),inside:item.inside})),landmarks:landmarks.map(item=>({...flightPoint(item),id:item.id,found:item.found}))};}
    function weatherOptions(){return {width:W,height:H,scene:state.scene,time:state.time,mode:state.weatherMode,calm:state.calm,quality:state.quality,started:state.started,speed:state.flightSpeed};}
    function updateWeather(dt){
      weatherState=weather.update(dt,weatherOptions());state.weatherName=weatherState.label;state.weatherKind=weatherState.kind;state.weatherWind=weatherState.wind;
      if(state.time-weatherAudioTime>.3){weatherAudioTime=state.time;audio?.weather?.(weatherState.kind,weatherState.intensity);}
      if(weatherState.thunderCount>lastThunder){lastThunder=weatherState.thunderCount;if(state.started&&!state.calm)audio?.thunder?.();}
    }
    function paintScenery(ctx){scenery.render(ctx,{width:W,height:H,scene:state.scene,time:state.time,distance:state.worldDistance,steering:state.steering,pitch:state.pitch,altitude:state.altitude,quality:state.quality,calm:state.calm,started:state.started});weather.background(ctx,weatherOptions());}
    function paintWeather(ctx){weather.foreground(ctx,weatherOptions());}
    p.setup=()=>{
      p.pixelDensity(Math.min(devicePixelRatio||1,1.5));const c=p.createCanvas(window.innerWidth,window.innerHeight);c.parent('world');c.elt.tabIndex=0;c.elt.setAttribute('role','img');c.elt.setAttribute('aria-label','纸飞机向地平线飞行。鼠标移动、方向键或 WASD 升降转向；Shift 或按住乘风加速。靠近气流借风，探索十二处秘境。轻点天空或 R 泛起涟漪；空格暂停，J 打开手记。');p.noiseSeed(29);p.frameRate(60);init();$('loading').classList.add('done');$('loading').setAttribute('aria-hidden','true');
      let pointerDown=null;
      c.elt.addEventListener('pointerdown',e=>{if(!state.started||state.paused)return;state.pointerActive=true;state.pointerStartX=e.clientX;state.pointerStartY=e.clientY;state.pointerX=e.clientX;pointerDown={x:e.clientX,y:e.clientY,time:performance.now(),moved:false};c.elt.setPointerCapture(e.pointerId);c.elt.focus({preventScroll:true});});
      c.elt.addEventListener('pointermove',e=>{
        if(!state.started||state.paused)return;
        if(pointerDown&&Math.hypot(e.clientX-pointerDown.x,e.clientY-pointerDown.y)>12)pointerDown.moved=true;
        if(e.pointerType==='mouse'){state.targetSteer=p.constrain((e.clientX-W*.5)/(W*.36),-1,1);state.targetPitch=p.constrain((e.clientY-H*.5)/(H*.32),-1,1);mouseLastTime=state.time;}
        else if(state.pointerActive){state.targetSteer=p.constrain((e.clientX-state.pointerStartX)/(W*.24),-1,1);state.targetPitch=p.constrain((e.clientY-state.pointerStartY)/(H*.24),-1,1);state.pointerX=e.clientX;mouseLastTime=state.time;}
      });
      const release=()=>{state.pointerActive=false;state.targetSteer=0;state.targetPitch=0;pointerDown=null;};
      c.elt.addEventListener('pointerup',e=>{if(pointerDown&&!pointerDown.moved&&performance.now()-pointerDown.time<650)ripple(e.clientX,e.clientY);release();});c.elt.addEventListener('pointercancel',release);c.elt.addEventListener('lostpointercapture',release);c.elt.addEventListener('pointerleave',()=>{if(!state.pointerActive){state.targetSteer=0;state.targetPitch=0;}});
    };
    function paintParticles(ctx,dt,speed){
      trailCtx.save();trailCtx.globalCompositeOperation='destination-out';trailCtx.fillStyle=`rgba(0,0,0,${Math.min(.3,.14*dt)})`;trailCtx.fillRect(0,0,W,H);trailCtx.restore();
      const active=Math.floor(particles.length*state.quality*(state.calm?.65:1));
      for(let g=0;g<4;g++){
        trailCtx.beginPath();trailCtx.strokeStyle=rgb(palette[g],g===3?.16:.09);trailCtx.lineWidth=g===3?.65:.5;
        for(let i=g;i<active;i+=4){const v=particles[i],ox=v.x,oy=v.y,fx=Math.min(cols-1,Math.max(0,Math.floor(v.x/65))),fy=Math.min(rows-1,Math.max(0,Math.floor(v.y/65))),idx=fy*cols+fx;
          let vx=fieldX[idx]*.28-state.steering*.75+state.weatherWind*.65+(v.x-W*.5)*.0017*speed,vy=fieldY[idx]*.2+speed*(.2+Math.max(0,v.y/H)*.7);
          const dx=v.x-planeX,dy=v.y-planeY,distSq=dx*dx+dy*dy,reach=Math.max(85,D*.15);
          if(distSq<reach*reach){const dd=Math.sqrt(distSq)+.1,force=(1-dd/reach)*3.7;vx+=dx/dd*force;vy+=dy/dd*force;}
          for(const gust of gusts){const gx=v.x-gust.x,gy=v.y-gust.y,dd=Math.hypot(gx,gy),reach=35+gust.age*125;if(dd<reach&&dd>1){const force=(1-dd/reach)*(1-gust.age/2.4)*4;vx+=gx/dd*force;vy+=gy/dd*force;}}
          v.vx+=(vx-v.vx)*.055*dt;v.vy+=(vy-v.vy)*.055*dt;v.x+=v.vx*dt;v.y+=v.vy*dt;
          if(v.y>H+25||v.y<-45||v.x<-40||v.x>W+40){if(v.y>H+25){v.y=-20;v.x=Math.random()*W;}else if(v.x<-40){v.x=W+15;v.y=Math.random()*H;}else if(v.x>W+40){v.x=-15;v.y=Math.random()*H;}else{v.y=H+15;v.x=Math.random()*W;}continue;}
          const len=2.1+v.life*2.0;trailCtx.moveTo(v.x,v.y);trailCtx.lineTo(v.x+(v.x-ox)*len,v.y+(v.y-oy)*len);
        }
        trailCtx.stroke();
      }
      ctx.drawImage(trail,0,0);
    }
    function paintMotes(ctx,dt,speed){
      for(const m of motes){m.y+=speed*.6*m.depth*dt;m.x+=(Math.sin(state.time*.3+m.phase)*.15-state.steering*.6)*dt;if(m.y>H+10){m.y=-10;m.x=Math.random()*W;}if(m.x<0)m.x=W;if(m.x>W)m.x=0;
        const a=.2+Math.sin(state.time*.8+m.phase)*.1;ctx.save();ctx.translate(m.x,m.y);ctx.rotate(state.time*.1+m.phase);ctx.fillStyle=rgb(palette[3],a);ctx.beginPath();
        if(state.scene===2){ctx.shadowBlur=10;ctx.shadowColor=rgb(palette[3],.8);ctx.arc(0,0,m.size*.8,0,Math.PI*2);}
        else if(state.scene===3){ctx.moveTo(0,-m.size*2);ctx.lineTo(m.size*.45,0);ctx.lineTo(0,m.size*2);ctx.lineTo(-m.size*.45,0);ctx.closePath();}
        else ctx.ellipse(0,0,m.size*2.2,m.size*.7,0,0,Math.PI*2);
        ctx.fill();ctx.restore();}
    }
    function paintLights(ctx,dt,speed){
      // A loose constellation makes the next collectible legible at a glance.
      if(state.started&&state.mode==='seek'&&journey.getScene(state.scene).task==='light'){
        const route=lights.filter(light=>!light.used&&light.y>0&&light.y<planeY).sort((a,b)=>b.y-a.y).slice(0,3);
        if(route.length){ctx.save();ctx.setLineDash([1,13]);ctx.strokeStyle=rgb(palette[3],.18);ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(planeX,planeY-30);for(const light of route)ctx.lineTo(light.x+Math.sin(state.time*.7+light.phase)*13,light.y);ctx.stroke();ctx.restore();}
      }
      for(let i=0;i<lights.length;i++){const l=lights[i];l.y+=speed*l.depth*dt;l.x-=state.steering*1.3*dt;const lx=l.x+Math.sin(state.time*.7+l.phase)*13,ly=l.y;
        if(l.y>H+65||l.x<-100||l.x>W+100){const top=Math.min(0,...lights.map(light=>light.y));lights[i]=newLight(routeX(),top-Math.max(130,H*.23));continue;}
        if(l.used)continue;
        const pulse=1+Math.sin(state.time*1.6+l.phase)*.15,r=l.r*pulse;
        const glow=ctx.createRadialGradient(lx,ly,0,lx,ly,r*5.5);glow.addColorStop(0,rgb(palette[3],.42));glow.addColorStop(.17,rgb(palette[3],.13));glow.addColorStop(1,rgb(palette[3],0));ctx.fillStyle=glow;ctx.fillRect(lx-r*6,ly-r*6,r*12,r*12);
        ctx.save();ctx.translate(lx,ly);ctx.rotate(state.time*.17+l.phase);ctx.strokeStyle=rgb(palette[3],.85);ctx.lineWidth=.9;ctx.beginPath();ctx.moveTo(0,-r);ctx.quadraticCurveTo(r*.15,-r*.15,r,0);ctx.quadraticCurveTo(r*.15,r*.15,0,r);ctx.quadraticCurveTo(-r*.15,r*.15,-r,0);ctx.quadraticCurveTo(-r*.15,-r*.15,0,-r);ctx.stroke();ctx.fillStyle=rgb(palette[3],.9);ctx.beginPath();ctx.arc(0,0,1.3,0,Math.PI*2);ctx.fill();ctx.restore();
        const separation=Math.hypot(lx-planeX,ly-planeY),magnet=Math.max(65,D*.15);
        if(state.started&&separation<magnet){const attraction=(1-separation/magnet)*.06*dt;l.x+=(planeX-lx)*attraction;l.y+=(planeY-ly)*attraction;}
        if(state.started&&separation<Math.max(34,D*.07)){
          l.used=true;state.collected=journey.addLight();state.lastCollect=state.time;
          if(state.mode==='seek'){const before=journey.getScene(state.scene).task;journey.record('light',state.scene);if(before==='light'&&journey.getScene(state.scene).task==='gate')toast('微光为你点亮了风环 · 轻轻穿过它');}
          $('collected').textContent=String(state.collected).padStart(2,'0');addFloat('拾到一束光',lx,ly-24);
          rings.push({x:lx,y:ly,r:4,a:1});for(let k=0;k<22;k++){const a=Math.random()*Math.PI*2,vel=Math.random()*2+.7;sparks.push({x:lx,y:ly,vx:Math.cos(a)*vel,vy:Math.sin(a)*vel,a:1});}
          if(audio)audio.chime();
          if(state.collected===1)toast('拾到一束光，也拾到一点好心情');
        }
      }
      for(let i=rings.length-1;i>=0;i--){const r=rings[i];r.r+=(r.touch?2.1:1.5)*dt;r.y+=speed*.5*dt;r.a-=(r.touch?.007:.012)*dt;ctx.strokeStyle=rgb(palette[3],Math.max(0,r.a)*(r.touch?.35:.5));ctx.lineWidth=.8;ctx.beginPath();ctx.arc(r.x,r.y,r.r,0,Math.PI*2);ctx.stroke();if(r.touch){ctx.strokeStyle=rgb(palette[0],Math.max(0,r.a)*.15);ctx.beginPath();ctx.arc(r.x,r.y,r.r*.68,0,Math.PI*2);ctx.stroke();}if(r.a<=0)rings.splice(i,1);}
      for(let i=sparks.length-1;i>=0;i--){const s=sparks[i];s.x+=s.vx*dt;s.y+=(s.vy+speed*.45)*dt;s.a-=.019*dt;ctx.fillStyle=rgb(palette[3],Math.max(0,s.a));ctx.beginPath();ctx.arc(s.x,s.y,1,0,Math.PI*2);ctx.fill();if(s.a<=0)sparks.splice(i,1);}
    }
    function paintGates(ctx,dt,speed){
      if(!state.started||state.mode!=='seek')return;
      const task=journey.getScene(state.scene).task;
      if(task!==lastTask){if(task==='gate')gateClock=0;if(task==='ripple'){toast('让心事泛起涟漪 · 轻点天空，或按 R');$('gesture-tip').classList.add('visible');}lastTask=task;}
      if(task==='gate'){
        gateClock-=dt/60;
        if(!gates.length&&gateClock<=0){gates.push({x:W*(.5+Math.sin(routeSerial++)*.12),y:Math.max(90,planeY-Math.max(170,H*.30)),r:Math.max(43,Math.min(70,D*.105)),used:false});gateClock=4;}
      }
      for(let i=gates.length-1;i>=0;i--){
        const gate=gates[i];gate.y+=speed*.85*dt;gate.x-=state.steering*1.2*dt;
        if(gate.y>H+gate.r||gate.used){gates.splice(i,1);continue;}
        const r=gate.r*(1+Math.sin(state.time)*.025);
        ctx.save();ctx.translate(gate.x,gate.y);ctx.strokeStyle=rgb(palette[3],.72);ctx.shadowColor=rgb(palette[3],.4);ctx.shadowBlur=12;ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(0,0,r,r*.74,0,0,Math.PI*2);ctx.stroke();ctx.shadowBlur=0;
        ctx.strokeStyle=rgb(palette[0],.25);ctx.setLineDash([2,9]);ctx.beginPath();ctx.ellipse(0,0,r+8,(r+8)*.74,0,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
        for(let j=0;j<3;j++){const a=state.time*.22+j*Math.PI*2/3;ctx.fillStyle=rgb(palette[3],.8);ctx.beginPath();ctx.arc(Math.cos(a)*r,Math.sin(a)*r*.74,2,0,Math.PI*2);ctx.fill();}
        ctx.fillStyle=rgb(palette[3],.65);ctx.font='10px "Microsoft YaHei", sans-serif';ctx.textAlign='center';ctx.fillText('从风环中穿过',0,-r*.74-17);ctx.restore();
        const dx=(planeX-gate.x)/r,dy=(planeY-gate.y)/(r*.74);
        if(dx*dx+dy*dy<.58){
          gate.used=true;journey.record('gate',state.scene);rings.push({x:gate.x,y:gate.y,r:r*.6,a:1});addFloat('风记住了你',gate.x,gate.y-r);if(audio)audio.chime('gate');
          for(let j=0;j<18;j++){const a=j*Math.PI*2/18;sparks.push({x:gate.x+Math.cos(a)*r,y:gate.y+Math.sin(a)*r*.74,vx:Math.cos(a)*.7,vy:Math.sin(a)*.7,a:1});}
        }
      }
    }
    function paintMoments(ctx,dt){
      for(let i=gusts.length-1;i>=0;i--){gusts[i].age+=dt/60;if(gusts[i].age>2.4)gusts.splice(i,1);}
      for(let i=floating.length-1;i>=0;i--){const message=floating[i];message.age+=dt/60;message.y-=.25*dt;ctx.font='10px "Microsoft YaHei", sans-serif';ctx.textAlign='center';ctx.fillStyle=rgb(palette[3],Math.max(0,1-message.age/2));ctx.fillText(message.text,message.x,message.y);if(message.age>2)floating.splice(i,1);}
      if(state.time-celebration<8){
        const age=state.time-celebration,alpha=Math.min(1,age)*Math.min(1,(8-age)/2),x=W*.5,y=H*.40,span=Math.min(W*.30,170);
        const points=[[-1,.2],[-.5,-.2],[0,.15],[.5,-.35],[1,0]];
        ctx.strokeStyle=rgb(palette[3],alpha*.4);ctx.lineWidth=.8;ctx.beginPath();points.forEach(([a,b],index)=>{if(index===0)ctx.moveTo(x+a*span,y+b*60);else ctx.lineTo(x+a*span,y+b*60);});ctx.stroke();
        for(const [a,b] of points){ctx.fillStyle=rgb(palette[3],alpha*.8);ctx.beginPath();ctx.arc(x+a*span,y+b*60,2.5,0,Math.PI*2);ctx.fill();}
      }
    }
    function paintPlane(ctx,dt,speed){
      const aim=state.started?.5:W<=700?.82:.65,home=W*aim;
      const target=home+state.steering*W*.34+state.weatherWind*Math.min(12,W*.025);
      planeX+=(target-planeX)*(.045*dt);planeY+=(H*(state.started?.59+state.pitch*.20:W<=700?.43:.55)-planeY)*.045*dt;
      planeAngle+=(state.steering*.83-planeAngle)*.055*dt;tilt+=(state.steering-tilt)*.08*dt;
      for(const v of wake){v.y+=speed*1.75*dt;v.x-=state.steering*.8*dt;v.age+=dt;}
      if(p.frameCount%2===0)wake.unshift({x:planeX,y:planeY+10,age:0});if(wake.length>(state.calm?48:74))wake.pop();
      const size=Math.max(24,Math.min(37,D*.052));
      // Two wing-tip contrails and a gossamer centre line.
      for(let side=-1;side<=1;side++){
        for(let j=1;j<wake.length;j++){const a=wake[j-1],b=wake[j],fade=(1-j/wake.length);ctx.strokeStyle=`rgba(223,240,238,${fade*fade*(side===0?.19:.27)})`;ctx.lineWidth=side===0?1:.8;ctx.beginPath();const spread=side*size*(.5+j*.006);ctx.moveTo(a.x+spread,a.y);ctx.lineTo(b.x+spread,b.y);ctx.stroke();}
      }
      const halo=ctx.createRadialGradient(planeX,planeY,0,planeX,planeY,size*3);halo.addColorStop(0,'rgba(210,236,235,.11)');halo.addColorStop(1,'rgba(210,236,235,0)');ctx.fillStyle=halo;ctx.fillRect(planeX-size*3,planeY-size*3,size*6,size*6);
      ctx.save();ctx.translate(planeX,planeY+Math.sin(state.time*1.4)*1.3);ctx.rotate(planeAngle);ctx.scale(1-Math.abs(tilt)*.22,1-state.pitch*.17);
      ctx.shadowColor='rgba(6,20,43,.3)';ctx.shadowBlur=12;ctx.shadowOffsetY=8;
      ctx.fillStyle='#f0f3e9';ctx.beginPath();ctx.moveTo(0,-size);ctx.lineTo(-size*.72,size*.65);ctx.lineTo(-size*.035,size*.28);ctx.closePath();ctx.fill();
      ctx.shadowColor='transparent';ctx.fillStyle='#b6c9d1';ctx.beginPath();ctx.moveTo(0,-size);ctx.lineTo(size*.72,size*.65);ctx.lineTo(size*.035,size*.28);ctx.closePath();ctx.fill();
      ctx.fillStyle='#e1e9e3';ctx.beginPath();ctx.moveTo(0,-size);ctx.lineTo(-size*.035,size*.28);ctx.lineTo(0,size*.73);ctx.lineTo(size*.15,size*.36);ctx.closePath();ctx.fill();
      ctx.strokeStyle='rgba(255,255,247,.7)';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(0,-size);ctx.lineTo(0,size*.65);ctx.stroke();ctx.strokeStyle='rgba(109,143,163,.6)';ctx.lineWidth=.5;ctx.beginPath();ctx.moveTo(0,-size);ctx.lineTo(size*.15,size*.36);ctx.stroke();ctx.restore();
      if(state.time-state.lastCollect<1.6){const a=1-(state.time-state.lastCollect)/1.6;ctx.strokeStyle=rgb(palette[3],a*.45);ctx.lineWidth=.7;ctx.beginPath();ctx.arc(planeX,planeY,28+(1-a)*37,0,Math.PI*2);ctx.stroke();}
    }
    p.draw=()=>{
      if(state.paused)return;
      const perfStart=performance.now();
      const elapsed=Math.min(p.deltaTime/16.667,2.5),dt=elapsed*(state.calm?.62:1);state.time+=dt/60;
      updateWeather(dt);
      if(state.keyboardPitch)state.targetPitch=state.keyboardPitch;
      updateFlight(dt);
      state.sceneAge+=elapsed/60;
      if(state.started){state.distance+=dt*.255*state.flightSpeed;if(p.frameCount%12===0){$('distance').innerHTML=`${Math.floor(state.distance)}<small>m</small>`;syncFlight();}if(state.time-lastSave>4){lastSave=state.time;journey.setDistance(state.distance);}}
      if(p.frameCount%12===0)syncWeather();
      if(state.auto&&((!state.started&&state.sceneAge>40)||(state.started&&state.sceneAge>(state.mode==='drift'?52:65))||(state.started&&state.mode==='seek'&&journey.getScene(state.scene).completed&&state.sceneAge>18)))setScene(sceneCycle.next(state.scene));
      if(!state.started)state.targetSteer=Math.sin(state.time*.25)*.3;
      if(state.keyboard)state.targetSteer=state.keyboard;
      else if(!state.pointerActive&&state.time-mouseLastTime>2.4&&state.started){state.targetSteer=0;if(!state.keyboardPitch)state.targetPitch=0;}
      state.steering+=(state.targetSteer-state.steering)*.045*dt;
      const speed=(state.started?2.25:1.35)*state.flightSpeed,ctx=p.drawingContext;
      ctx.globalAlpha=1;
      palette=palette.map((c,i)=>mix(c,palettes[state.scene][i],Math.min(1,.008*dt)));
      if(p.frameCount%7===0)updateField();
      const perfField=performance.now();
      paintScenery(ctx);paintExploration(ctx,dt);
      const perfBeforeParticles=performance.now();
      paintParticles(ctx,dt,speed);
      const perfAfterParticles=performance.now();
      paintMotes(ctx,dt,speed);paintLights(ctx,dt,speed);paintGates(ctx,dt,speed);paintPlane(ctx,dt,speed);paintWeather(ctx);paintMoments(ctx,dt);
      // Monitor only the real runtime; gently reduce density on slower devices.
      if(p.frameCount%60===0){state.fps=p.frameRate();if(state.fps<32&&state.quality>.55)state.quality=Math.max(.55,state.quality-.1);}
      if(p.frameCount%12===0)p.canvas.dataset.flight=JSON.stringify({...flightReport(),...explorationReport(),started:state.started,paused:state.paused,mode:state.mode,calm:state.calm,scene:state.scene,landscape:LANDSCAPES[state.scene],speed,particles:Math.floor(particles.length*state.quality*(state.calm?.65:1)),task:journey.getScene(state.scene),fps:Math.round(p.frameRate()),x:Math.round(planeX),y:Math.round(planeY),angle:Number(planeAngle.toFixed(2)),collected:state.collected,lights:lights.filter(l=>!l.used).map(l=>({x:Math.round(l.x+Math.sin(state.time*.7+l.phase)*13),y:Math.round(l.y)})),gates:gates.map(g=>({x:Math.round(g.x),y:Math.round(g.y)})),frame:p.frameCount,ms:{total:Math.round(performance.now()-perfStart),field:Math.round(perfField-perfStart),particles:Math.round(perfAfterParticles-perfBeforeParticles)}});
    };
    let resizeTimer;
    p.windowResized=()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{
      const previousW=W,previousH=H;p.resizeCanvas(window.innerWidth,window.innerHeight);W=p.width;H=p.height;D=Math.min(W,H);
      const sx=W/previousW,sy=H/previousH;for(const list of [particles,lights,motes,rings,sparks,wake,gates,gusts,floating])for(const item of list){item.x*=sx;item.y*=sy;}
      const count=particleCount();
      if(particles.length>count)particles.length=count;
      while(particles.length<count)particles.push(newParticle(true));
      for(const gate of gates)gate.r=Math.max(43,Math.min(70,D*.105));
      planeX*=sx;planeY*=sy;
      trail=createLayer();trailCtx=trail.getContext('2d');cols=Math.ceil(W/65)+2;rows=Math.ceil(H/65)+2;fieldX=new Float32Array(cols*rows);fieldY=new Float32Array(cols*rows);updateField();
      if(state.paused){updateWeather(0);paintScenery(p.drawingContext);paintPlane(p.drawingContext,0,0);paintWeather(p.drawingContext);}
    },120);};
    // Small, read-only runtime report for QA and future iteration.
    window.windborne={getState:()=>({...flightReport(),...explorationReport(),started:state.started,paused:state.paused,sound:state.sound,mode:state.mode,calm:state.calm,scene:THEMES[state.scene].name,landscape:LANDSCAPES[state.scene],collected:state.collected,distance:Math.floor(state.distance),journey:journey.getSnapshot(),steering:Number(state.steering.toFixed(3)),plane:{x:Math.round(planeX),y:Math.round(planeY),angle:Number(planeAngle.toFixed(3))},particles:Math.floor(particles.length*state.quality*(state.calm?.65:1)),fps:Math.round(p.frameRate()),viewport:{width:W,height:H}})};
  });
})();
