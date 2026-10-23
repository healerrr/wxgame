'use strict';
// Local presentation QA only. Every fixture is earned through the public model
// and normal movement/fire input; neither production state nor saves are edited.
// Run: node tools/preview-adventure.cjs [8094]
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {WindborneAdventure}=require('../dist/adventure');
const {WINDBORNE_ART_FILES}=require('../dist/assets');
const dist=path.join(__dirname,'..','dist');

function createFixtures(){
  const game=new WindborneAdventure({seed:29});
  game.start();
  const fixtures={};
  for(let frame=0;frame<7200;frame++){
    const state=game.getState();
    if(!fixtures.storm&&state.height>=4500)fixtures.storm=state;
    if(!fixtures.snow&&state.height>=5400&&state.hostile.some(projectile=>projectile.kind==='snow'&&projectile.y>.15))fixtures.snow=state;
    if(!fixtures.hail&&state.height>=7800)fixtures.hail=state;
    if(state.phase==='victory'){
      fixtures.ending=state;
      fixtures.collection=state;
      break;
    }
    if(state.phase==='gameover')throw new Error('The public-input QA flight did not reach its ending.');
    game.update(.05,{x:Math.sin(state.elapsed*1.05)>0?1:-1,y:0,fire:true,boost:false});
  }
  if(!fixtures.ending||!fixtures.storm||!fixtures.snow||!fixtures.hail)throw new Error('A required naturally earned QA scene is missing.');
  return fixtures;
}

function page(route,fixture){
  const state=JSON.stringify(fixture).replace(/</g,'\\u003c');
  const collection=route==='collection';
  const title={storm:'雷雨',snow:'暴雪',hail:'高空冰雹',ending:'结局',collection:'图鉴'}[route];
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>九霄来信 · ${title}演出验证</title><style>
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#111c32;color:#cfdbd8;font:10px "Microsoft YaHei",sans-serif}header{height:30px;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;padding:0 12px;gap:8px;letter-spacing:.5px;white-space:nowrap;border-bottom:1px solid #d8e1da1c}nav{display:flex;gap:10px}a{color:#e2d7b6;text-decoration:none}a[aria-current="page"]{color:#fff2ca;border-bottom:1px solid #fff2ca}canvas{display:block;width:100vw;height:calc(100vh - 30px);touch-action:none}#error{position:fixed;inset:45px 16px auto;white-space:pre-wrap;font-size:12px;color:#ffd9c5}@media(max-width:420px){header{font-size:8px;padding:0 8px;letter-spacing:0}nav{gap:8px}}
</style><script defer src="/scenery.js"></script><script defer src="/weather.js"></script><script defer src="/adventure.js"></script><script defer src="/assets.js"></script><script defer src="/view.js"></script></head><body><header><span>演出验证 · 真实玩法模拟所得</span><nav aria-label="验证场景"><a href="/storm" ${route==='storm'?'aria-current="page"':''}>雷雨</a><a href="/snow" ${route==='snow'?'aria-current="page"':''}>暴雪</a><a href="/hail" ${route==='hail'?'aria-current="page"':''}>冰雹</a><a href="/ending" ${route==='ending'?'aria-current="page"':''}>结局</a><a href="/collection" ${collection?'aria-current="page"':''}>图鉴</a></nav></header><canvas id="qa" role="img" aria-label="九霄来信真实玩法模拟所得的${title}"></canvas><pre id="error" hidden></pre><script>
addEventListener('DOMContentLoaded',()=>{
  try{
    const fixture=${state},canvas=document.getElementById('qa'),g=canvas.getContext('2d');
    const make=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
    const view=new WindborneView(make),collection=${collection};let W=0,H=0,density=1,last=performance.now(),visualTime=fixture.elapsed;
    const art=loadWindborneArt(typeof Image==='function'?()=>new Image():null,loaded=>view.setAssets(loaded),'/assets/art/');view.setAssets(art);
    function size(){W=innerWidth;H=Math.max(1,innerHeight-30);density=Math.min(devicePixelRatio||1,1.5);canvas.width=Math.round(W*density);canvas.height=Math.round(H*density);}
    size();addEventListener('resize',size);canvas.dataset.fixtureRoute=${JSON.stringify(route)};canvas.dataset.fixtureState=JSON.stringify(fixture);
    function weatherOptions(){return {width:W,height:H,scene:fixture.scene,mode:fixture.weather,calm:false,quality:1,speed:1+fixture.progress*.4};}
    // Warm the public weather simulation so a still-earned campaign fixture
    // visibly contains its chapter weather from the first accepted screenshot.
    for(let i=0;i<150;i++)view.weather.update(1,weatherOptions());
    function render(now){
      const delta=Math.min(.05,Math.max(0,(now-last)/1000));last=now;visualTime+=delta;
      if(!collection&&fixture.phase!=='victory')view.weather.update(delta*60,weatherOptions());
      g.setTransform(density,0,0,density,0,0);view.render(g,fixture,{width:W,height:H,time:visualTime,collection,autoFire:true,sound:false,calm:false,safe:{top:8,bottom:H-12}});
      canvas.dataset.weather=JSON.stringify(view.weather.report());canvas.dataset.art=JSON.stringify({loaded:art.loaded,total:art.total,errors:art.errors});requestAnimationFrame(render);
    }
    requestAnimationFrame(render);
  }catch(error){const panel=document.getElementById('error');panel.hidden=false;panel.textContent='演出验证未能加载：'+error.message;console.error(error);}
});
</script></body></html>`;
}

function createServer(fixtures=createFixtures()){
  return http.createServer((req,res)=>{
    let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);}catch(_){res.writeHead(400);res.end('Invalid URL');return;}
    const image=pathname.startsWith('/assets/art/')?pathname.slice('/assets/art/'.length):null;
    if(image&&WINDBORNE_ART_FILES.includes(image)){
      fs.readFile(path.join(dist,'assets','art',image),(error,body)=>{res.writeHead(error?404:200,{'Content-Type':error?'text/plain; charset=utf-8':image.endsWith('.png')?'image/png':'image/jpeg','Cache-Control':'no-store'});res.end(error?'Not found':body);});return;
    }
    if(/^\/(scenery|weather|adventure|view|assets)\.js$/.test(pathname)){
      fs.readFile(path.join(dist,pathname.slice(1)),(error,body)=>{
        res.writeHead(error?404:200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'});
        res.end(error?'Not found':body);
      });return;
    }
    const route=pathname==='/'?'ending':pathname.slice(1);
    if(!Object.hasOwn(fixtures,route)){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('Use /ending, /storm, /snow, /hail or /collection.');return;}
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(page(route,fixtures[route]));
  });
}
if(require.main===module){
  const port=Number(process.env.WINDBORNE_ADVENTURE_PREVIEW_PORT||process.env.PORT||process.argv[2])||8094;
  const fixtures=createFixtures();createServer(fixtures).listen(port,'127.0.0.1',()=>console.log('Adventure presentation QA: http://127.0.0.1:'+port+'/ending (public-input victory, '+fixtures.ending.kills+' animals met)'));
}
module.exports={createFixtures,page,createServer};
