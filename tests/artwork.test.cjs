'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {WindborneView}=require('../dist/view');

function context(draws=[]){
  const stack=[],gradient={addColorStop(){}},state={globalAlpha:1};
  const methods={save(){stack.push({globalAlpha:state.globalAlpha});},restore(){Object.assign(state,stack.pop());},createRadialGradient:()=>gradient,createLinearGradient:()=>gradient,
    getImageData(){throw Error('Pixel reads unavailable on this host');},
    drawImage(image,...geometry){assert.ok(geometry.every(Number.isFinite));draws.push({alpha:state.globalAlpha,geometry});}};
  return new Proxy(state,{get(target,key){if(key in target)return target[key];return methods[key]||(()=>{});}});
}

test('loaded animal sprites inherit and progressively fade their death-echo opacity',()=>{
  const atlas={width:1024,height:1536},draws=[],g=context(draws);
  const view=new WindborneView((width,height)=>({width,height,getContext:()=>context()}),{animals:atlas});
  const effect={type:'whale',x:.5,y:.3,size:.06,color:'#b9dce8',age:.1,life:1,facing:1,heading:0};
  view.deathEchoes(g,{deathFX:[effect]},390,844,390);
  const early=draws.map(draw=>draw.alpha);assert.ok(early.length>=2,'The loaded atlas draws the animated creature');
  draws.length=0;view.deathEchoes(g,{deathFX:[{...effect,age:.7}]},390,844,390);
  const late=draws.map(draw=>draw.alpha);
  assert.equal(late.length,early.length);
  assert.ok(early.every(alpha=>alpha>0&&alpha<.4),'The ghost respects its translucent parent');
  assert.ok(late.every((alpha,i)=>alpha>0&&alpha<early[i]*.2),'The sprite must fade before its effect is removed');
  assert.equal(g.globalAlpha,1,'Drawing the echo restores the surrounding canvas opacity');
});
