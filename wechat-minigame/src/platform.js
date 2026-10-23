'use strict';
function compatibleContext(canvas){
  const ctx=canvas.getContext('2d');
  if(!ctx)throw new Error('当前设备无法创建 2D Canvas');
  if(!ctx.ellipse)ctx.ellipse=function(x,y,rx,ry,rotation,start,end,ccw){this.save();this.translate(x,y);this.rotate(rotation);this.scale(rx,ry);this.arc(0,0,1,start,end,ccw);this.restore();};
  if(!ctx.setLineDash)ctx.setLineDash=()=>{};
  return ctx;
}
function createPlatform(wx){
  const screen=wx.createCanvas();
  // Use a single millisecond clock across devices and devtools. Native
  // performance/animation timestamps must not leak unit differences into taps.
  const now=()=>Date.now();
  function dimensions(){
    const info=typeof wx.getWindowInfo==='function'?wx.getWindowInfo():wx.getSystemInfoSync();
    const width=info.windowWidth||info.screenWidth||390,height=info.windowHeight||info.screenHeight||844;
    const safe=info.safeArea||{top:info.statusBarHeight||20,bottom:height-12,left:0,right:width};
    let capsule=null;
    try{if(wx.getMenuButtonBoundingClientRect)capsule=wx.getMenuButtonBoundingClientRect();}catch(_){}
    return {width,height,pixelRatio:Math.max(1,Math.min(2,info.pixelRatio||1)),safe:{top:Math.max(0,safe.top||0),bottom:Math.min(height,safe.bottom||height),left:safe.left||0,right:safe.right||width},capsule};
  }
  function resize(){
    const size=dimensions();screen.width=Math.round(size.width*size.pixelRatio);screen.height=Math.round(size.height*size.pixelRatio);
    const ctx=compatibleContext(screen);ctx.scale(size.pixelRatio,size.pixelRatio);return {...size,ctx};
  }
  function createCanvas(width,height){const c=wx.createCanvas();c.width=width;c.height=height;compatibleContext(c);return c;}
  const storage={getItem:key=>{const value=wx.getStorageSync(key);return typeof value==='string'?value:value?JSON.stringify(value):null;},setItem:(key,value)=>wx.setStorageSync(key,value)};
  const request=typeof requestAnimationFrame==='function'?requestAnimationFrame.bind(null):callback=>setTimeout(()=>callback(now()),16);
  const cancel=typeof cancelAnimationFrame==='function'?cancelAnimationFrame.bind(null):clearTimeout;
  return {wx,screen,now,resize,createCanvas,storage,request,cancel};
}
module.exports={createPlatform,compatibleContext};
