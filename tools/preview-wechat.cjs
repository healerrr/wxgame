'use strict';
// Local Canvas verification of the exact native modules. This page is NOT a
// WeChat runtime and is intentionally kept outside the uploadable game folder.
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const names=['main','platform','adventure','view','scenery','weather','assets','audio'];
const project=path.join(__dirname,'..','wechat-minigame');
const {WINDBORNE_ART_FILES}=require('../dist/assets');
function page(){
  const modules=names.map(name=>JSON.stringify(name)+':function(module,exports,require){\n'+fs.readFileSync(path.join(__dirname,'..','wechat-minigame','src',name+'.js'),'utf8')+'\n}').join(',\n');
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>纸飞机漫游 · 原生 Canvas 界面验证</title><style>html,body{margin:0;height:100%;background:#071423;color:#c7d9d0;font:12px sans-serif}body{display:flex;align-items:center;justify-content:center;flex-direction:column;gap:9px}canvas{display:block;touch-action:none;box-shadow:0 8px 60px #0008}p{margin:0;font-size:10px;letter-spacing:1px}#capsule{position:absolute;pointer-events:none;color:#dfe7df88;border:1px solid #dfe7df44;border-radius:20px;text-align:center;line-height:28px}</style><p>微信版原生 Canvas 界面验证 · 本页不代表微信真机测试</p><div style="position:relative"><canvas id="native"></canvas><div id="capsule">···　⊙</div></div><script>
const modules={${modules}},cache={};
function require(id){id=id.startsWith('./')?id.slice(2):id;if(cache[id])return cache[id].exports;const module={exports:{}};cache[id]=module;modules[id](module,module.exports,require);return module.exports;}
const canvas=document.querySelector('canvas'),capsule=document.querySelector('#capsule'),events=new Map();let first=true;
const info={windowWidth:390,windowHeight:844,pixelRatio:Math.min(devicePixelRatio||1,2),safeArea:{top:44,left:0,right:390,bottom:810}};
function fit(){const scale=Math.min((innerWidth-24)/390,(innerHeight-52)/844,1);canvas.style.width=390*scale+'px';canvas.style.height=844*scale+'px';capsule.style.left=290*scale+'px';capsule.style.top=49*scale+'px';capsule.style.width=84*scale+'px';capsule.style.height=28*scale+'px';capsule.style.lineHeight=28*scale+'px';}fit();window.addEventListener('resize',fit);
const wx={createCanvas(){if(first){first=false;return canvas;}return document.createElement('canvas');},createImage:()=>new Image(),getWindowInfo:()=>info,getMenuButtonBoundingClientRect:()=>({left:290,top:49,bottom:77,width:84,height:28}),getPerformance:()=>performance,getStorageSync:key=>localStorage.getItem('native-preview.'+key),setStorageSync:(key,value)=>localStorage.setItem('native-preview.'+key,value),createWebAudioContext:()=>new(window.AudioContext||window.webkitAudioContext)()};
for(const name of ['TouchStart','TouchMove','TouchEnd','TouchCancel','Hide','Show','WindowResize']){wx['on'+name]=fn=>events.set(name,fn);wx['off'+name]=fn=>{if(events.get(name)===fn)events.delete(name);};}
function send(name,e){const rect=canvas.getBoundingClientRect(),touch={identifier:e.pointerId,clientX:(e.clientX-rect.left)*390/rect.width,clientY:(e.clientY-rect.top)*844/rect.height},event={touches:name==='TouchEnd'?[]:[touch],changedTouches:[touch]};if(events.has(name))events.get(name)(event);}
canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);send('TouchStart',e);});canvas.addEventListener('pointermove',e=>{if(e.buttons)send('TouchMove',e);});canvas.addEventListener('pointerup',e=>send('TouchEnd',e));canvas.addEventListener('pointercancel',e=>send('TouchCancel',e));document.addEventListener('visibilitychange',()=>{const fn=events.get(document.hidden?'Hide':'Show');if(fn)fn();});
const app=require('main').boot(wx);setInterval(()=>{canvas.dataset.nativeState=JSON.stringify(app.getState());},250);
canvas.setAttribute('aria-label','九霄来信原生 Canvas，点击从地面起飞、二维拖动移动、自动射击，躲避危险并接取补给。');
</script></html>`;
}
function createServer(){return http.createServer((req,res)=>{
  let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);}catch(_){res.writeHead(400);res.end('Invalid URL');return;}
  const file=pathname.startsWith('/assets/art/')?pathname.slice('/assets/art/'.length):null;
  if(file&&WINDBORNE_ART_FILES.includes(file)){
    fs.readFile(path.join(project,'assets','art',file),(error,body)=>{res.writeHead(error?404:200,{'Content-Type':error?'text/plain; charset=utf-8':file.endsWith('.png')?'image/png':'image/jpeg','Cache-Control':'no-store'});res.end(error?'Not found':body);});return;
  }
  if(pathname!=='/'&&pathname!=='/index.html'){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('Not found');return;}
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(page());
});}
if(require.main===module){const port=Number(process.env.WINDBORNE_PREVIEW_PORT)||8091;createServer().listen(port,'127.0.0.1',()=>console.log('Native Canvas verification: http://127.0.0.1:'+port));}
module.exports={page,createServer};
