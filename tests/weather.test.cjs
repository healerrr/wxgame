'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {WindborneWeather}=require('../dist/weather');
const base={width:390,height:844,scene:0,calm:false,quality:1,mode:'rain',speed:1,started:true};
const advance=(weather,frames,options=base)=>{for(let i=0;i<frames;i++)weather.update(1,options);return weather.report();};

test('manual rain, snow and storm produce precipitation and clear skies let it fade',()=>{
  const weather=new WindborneWeather();
  for(const mode of ['rain','snow','storm']){
    const report=advance(weather,240,{...base,mode});
    assert.equal(report.kind,mode);assert.ok(report.intensity>.9);
    assert.ok(report.precipitation>0,'Visible precipitation must accompany the selected weather');
    assert.ok(report.wind>=-.25&&report.wind<=.25);
  }
  const clear=advance(weather,480,{...base,mode:'clear'});
  assert.equal(clear.kind,'clear');assert.ok(clear.intensity<.01);
  assert.equal(clear.precipitation,0);
});

test('storm lightning is visible, then reduced motion immediately removes it and prevents further bolts',()=>{
  const weather=new WindborneWeather();let sawBolt=false;
  for(let frame=0;frame<420;frame++){
    weather.update(1,{...base,mode:'storm'});
    if(weather.report().lightning){sawBolt=true;break;}
  }
  assert.equal(sawBolt,true,'A storm includes a visible lightning event');
  const count=weather.report().thunderCount;
  assert.ok(count>=1);
  weather.update(1,{...base,mode:'storm',calm:true});
  assert.equal(weather.report().lightning,false,'Calm mode clears an already active bolt');
  for(let frame=0;frame<1200;frame++){
    weather.update(1,{...base,mode:'storm',calm:true});
    assert.equal(weather.report().lightning,false);
  }
  assert.equal(weather.report().thunderCount,count,'Reduced motion never schedules another bolt');
  assert.ok(weather.report().precipitation>0,'Calm storms retain quiet rain');
});

test('zero-delta redraws preserve weather time and automatic weather matches each landscape',()=>{
  const weather=new WindborneWeather();advance(weather,90,base);
  const before=weather.report();for(let i=0;i<10;i++)weather.update(0,base);
  assert.deepEqual(weather.report(),before,'A redraw cannot age a paused weather system');
  for(const [scene,kind] of ['rain','clear','rain','snow'].entries()){
    const auto=new WindborneWeather();const report=auto.update(1,{...base,mode:'auto',scene});
    assert.equal(report.kind,kind);
  }
});

test('rapid weather and viewport changes keep all rendered geometry finite',()=>{
  const gradient={addColorStop(position){assert.ok(Number.isFinite(position)&&position>=0&&position<=1);}};
  const geometry=new Set(['moveTo','lineTo','bezierCurveTo','quadraticCurveTo','arc','ellipse','fillRect','strokeRect','translate','rotate','scale','createLinearGradient','createRadialGradient']);
  let drawCalls=0;
  const ctx=new Proxy({}, {get(target,key){
    if(key in target)return target[key];
    if(key==='createLinearGradient'||key==='createRadialGradient')return(...values)=>{assert.ok(values.every(Number.isFinite));return gradient;};
    if(key==='drawImage')return(image,...values)=>{assert.ok(values.every(Number.isFinite));drawCalls++;};
    if(geometry.has(key))return(...values)=>{assert.ok(values.every(Number.isFinite),String(key)+' contains invalid geometry');drawCalls++;};
    return()=>{};
  }});
  const weather=new WindborneWeather((width,height)=>({width,height,getContext:()=>ctx}));
  for(let cycle=0;cycle<15;cycle++){
    const options={...base,width:cycle%2?1366:320,height:cycle%2?768:568,scene:cycle%4,mode:['rain','snow','storm','clear','auto'][cycle%5],calm:cycle%3===0,quality:cycle%2?.6:1};
    advance(weather,30,options);weather.background(ctx,options);weather.foreground(ctx,options);
    const report=weather.report();
    assert.ok(Number.isFinite(report.intensity));assert.ok(Number.isFinite(report.weatherTime));
    assert.ok(report.intensity>=0&&report.intensity<=1);
  }
  assert.ok(drawCalls>100,'The geometry assertions cover real weather drawing');
});
