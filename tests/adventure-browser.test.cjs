'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const dist=path.join(__dirname,'..','dist');
const html=fs.readFileSync(path.join(dist,'index.html'),'utf8');
const scripts=Array.from(html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g),match=>fs.readFileSync(path.join(dist,match[1]),'utf8'));

// Run the actual shipped client, shared view and simulation. The browser host
// and Canvas drawing calls are stubbed; RAF is advanced with a controlled clock.
function browser({pendingImages=false}={}){
  let now=0,raf=[];const ids=new Map(),stored=new Map(),images=[];
  const listeners=()=>({events:new Map(),addEventListener(type,fn){const set=this.events.get(type)||[];set.push(fn);this.events.set(type,set);},emit(type,values={}){const e={type,target:this,repeat:false,preventDefault(){},...values};for(const fn of this.events.get(type)||[])fn(e);return e;}});
  const document=Object.assign(listeners(),{hidden:false,activeElement:null});
  const gradient={addColorStop(){}};
  const ctx=new Proxy({}, {get(target,key){if(key in target)return target[key];if(key==='measureText')return text=>({width:Array.from(String(text)).length*7});if(key==='createLinearGradient'||key==='createRadialGradient')return()=>gradient;return()=>{};}});
  class Element{
    constructor(tag){Object.assign(this,listeners());this.tagName=tag.toUpperCase();this.style={};this.children=[];this.attributes={};}
    set id(value){this._id=value;ids.set(value,this);}get id(){return this._id;}
    getContext(){return ctx;}setPointerCapture(){}
    setAttribute(key,value){this.attributes[key]=String(value);if(key==='id')this.id=value;}
    append(child){child.parentElement=this;this.children.push(child);}
    remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(c=>c!==this);ids.delete(this.id);}
    closest(tag){return this.tagName.toLowerCase()===tag?this:this.parentElement?.closest(tag)||null;}
    focus(){if(document.activeElement!==this)document.activeElement?.emit('blur');document.activeElement=this;}
  }
  document.createElement=tag=>new Element(tag);document.getElementById=id=>ids.get(id)||null;
  for(const match of html.matchAll(/<([\w-]+)[^>]*\bid="([^"]+)"[^>]*>/g)){const node=new Element(match[1]);node.id=match[2];}
  const canvas=ids.get('flight-canvas');document.activeElement=canvas;
  const window=Object.assign(listeners(),{innerWidth:390,innerHeight:844,devicePixelRatio:1,localStorage:{getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,value)}});
  if(pendingImages)window.Image=class{constructor(){this.width=0;this.height=0;images.push(this);}set src(value){this.url=value;}get src(){return this.url;}};
  const sandbox={window,document,innerWidth:390,innerHeight:844,matchMedia:()=>({matches:false}),requestAnimationFrame:fn=>{raf.push(fn);return raf.length;}};
  const runtime=vm.createContext(sandbox);scripts.forEach(script=>vm.runInContext(script,runtime));
  return {window,document,canvas,stored,images,state:()=>window.windborne.getState(),node:id=>ids.get(id),
    click(id){const node=ids.get(id);assert.ok(node,'Visible game button '+id);node.focus();node.emit('click');},
    key(code,{up=false,repeat=false}={}){document.emit(up?'keyup':'keydown',{target:document.activeElement,code,repeat});},
    step(count=1,ms=50){for(let i=0;i<count;i++){now+=ms;const pending=raf;raf=[];pending.forEach(fn=>fn(now));}},
    hide(value=true){document.hidden=value;document.emit('visibilitychange');}
  };
}
const begin=g=>{g.click('start');g.step(125);assert.equal(g.state().phase,'playing');};

test('browser starts with an invulnerable six-second takeoff before normal flight',()=>{
  const g=browser();assert.equal(g.state().phase,'intro');g.click('start');
  const initial=g.state();g.step(60);const rising=g.state();
  assert.equal(rising.phase,'takeoff');assert.equal(rising.hp,100);
  assert.ok(rising.player.y<initial.player.y);assert.ok(rising.height>0);
  assert.equal(rising.enemies.length,0);assert.equal(rising.hostile.length,0);
  g.step(65);assert.equal(g.state().phase,'playing');
  assert.equal(g.document.activeElement,g.canvas);
});

test('delayed artwork and image-load failures never block starting or steering',()=>{
  const g=browser({pendingImages:true});assert.equal(g.images.length,5,'The real local-art loader schedules all assets');
  assert.ok(g.images.every(image=>image.src.startsWith('assets/art/')));begin(g);
  for(const image of g.images)image.onerror();
  const before=g.state();g.key('ArrowRight');g.step(8);
  assert.equal(g.state().phase,'playing');assert.ok(g.state().height>before.height);assert.ok(g.state().player.x>before.player.x);
});

test('browser opposing direction keys cancel and retain the direction still held',()=>{
  const g=browser();begin(g);
  g.key('ArrowLeft');g.key('ArrowRight');g.key('ArrowUp');g.key('ArrowDown');g.step(5);
  assert.equal(g.state().player.vx,0);assert.equal(g.state().player.vy,0);
  g.key('ArrowRight',{up:true});g.key('ArrowDown',{up:true});g.step(5);
  assert.ok(g.state().player.vx<0);assert.ok(g.state().player.vy<0);
  g.key('ArrowLeft',{up:true});g.key('ArrowUp',{up:true});g.step(6);
  assert.ok(Math.abs(g.state().player.vx)<.003);assert.ok(Math.abs(g.state().player.vy)<.003);
});

test('a stationary mouse target is reached and held without continued drift',()=>{
  const g=browser();begin(g);const target={x:.64,y:.66};
  g.canvas.emit('pointermove',{pointerType:'mouse',clientX:390*target.x,clientY:844*target.y});
  g.step(90);
  const settled=g.state().player;
  assert.ok(Math.abs(settled.x-target.x)<.025,'A single mouse move must remain a position target');
  assert.ok(Math.abs(settled.y-target.y)<.025);
  assert.ok(Math.abs(settled.vx)<.03&&Math.abs(settled.vy)<.03,'Approaching the target slows the plane');
  g.canvas.emit('pointerleave');g.step(6);
  assert.ok(Math.abs(g.state().player.vx)<.003&&Math.abs(g.state().player.vy)<.003,'Leaving the canvas releases the position target');
});

test('manual Space fire stops on pause and cannot remain held after resume',()=>{
  const g=browser();begin(g);g.click('autofire');g.canvas.focus();
  const before=g.state().shotsFired;g.step(8);assert.equal(g.state().shotsFired,before);
  g.key('Space');g.step(8);assert.ok(g.state().shotsFired>before);
  g.key('KeyP');const paused=g.state();assert.equal(paused.phase,'paused');
  g.step(12);assert.equal(g.state().elapsed,paused.elapsed);assert.equal(g.state().shotsFired,paused.shotsFired);
  g.click('resume');g.step(8);assert.equal(g.state().shotsFired,paused.shotsFired);
  assert.equal(g.state().autoFire,false);
});

test('collection restores takeoff or pause correctly and a hidden page never resumes itself',()=>{
  const g=browser();g.click('start');g.step(25);g.click('collection');
  const held=g.state();assert.equal(held.phase,'paused');assert.equal(held.collection,true);
  g.step(30);assert.equal(g.state().elapsed,held.elapsed);
  g.click('closeCollection');assert.equal(g.state().phase,'takeoff');
  g.step(110);assert.equal(g.state().phase,'playing');g.click('pause');g.click('collection');g.click('closeCollection');
  assert.equal(g.state().phase,'paused','A collection opened from pause keeps that pause');
  g.click('resume');g.hide();const hidden=g.state();g.step(20);assert.equal(g.state().elapsed,hidden.elapsed);
  g.hide(false);g.step(3);assert.equal(g.state().phase,'paused');
  assert.ok(g.stored.has('windborne.adventure.v1'));g.click('resume');g.step(3);assert.ok(g.state().height>hidden.height);
});

test('a separate touch fire button does not release an active steering pointer',()=>{
  const g=browser();begin(g);g.click('autofire');g.canvas.focus();
  g.canvas.emit('pointerdown',{pointerId:1,pointerType:'touch',clientX:195,clientY:600});
  g.canvas.emit('pointermove',{pointerId:1,pointerType:'touch',clientX:235,clientY:550});
  const fire=g.node('fire'),before=g.state();fire.emit('pointerdown',{pointerId:2,pointerType:'touch'});g.step(8);
  assert.ok(g.state().shotsFired>before.shotsFired);assert.ok(g.state().player.vx>0);assert.ok(g.state().player.vy<0);
  fire.emit('pointerup',{pointerId:2,pointerType:'touch'});const released=g.state();g.step(8);
  assert.equal(g.state().shotsFired,released.shotsFired);assert.ok(g.state().player.vx>0);
  g.canvas.emit('pointercancel',{pointerId:1,pointerType:'touch'});g.step(6);
  assert.ok(Math.abs(g.state().player.vx)<.003);assert.ok(Math.abs(g.state().player.vy)<.003);
});
