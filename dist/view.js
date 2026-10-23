/* Shared, resolution-independent Canvas presentation for the ascent campaign. */
(function(root,factory){
  'use strict';
  const native=typeof module==='object'&&module.exports;
  const api=native?factory(require('./scenery').WindborneScenery,require('./weather').WindborneWeather,require('./adventure').ANIMALS):factory(root.WindborneScenery,root.WindborneWeather,root.WINDBORNE_ANIMALS);
  if(native)module.exports=api;else root.WindborneView=api.WindborneView;
})(typeof window==='object'?window:globalThis,function(Scenery,Weather,ANIMALS){
  'use strict';
  const TAU=Math.PI*2,clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
  const rgba=(hex,a)=>{const n=parseInt(hex.slice(1),16);return `rgba(${n>>16&255},${n>>8&255},${n&255},${clamp(a,0,1)})`;};
  class WindborneView{
    constructor(createCanvas,assets={}){
      this.createCanvas=createCanvas;this.scenery=new Scenery(createCanvas);this.weather=new Weather(createCanvas);this.buttons=[];this.lastElapsed=0;this.lastPhase='intro';this.width=390;this.height=844;
      this.assets={backgrounds:[],animals:null};this.spriteFrames=null;this.atmospheres=new Map();this.motions=new Map();this.backgroundMix=[1,0,0,0];this.backgroundInitialized=false;this.frameSeconds=0;this.setAssets(assets);
    }
    setAssets(assets={}){
      if(Array.isArray(assets.backgrounds))this.assets.backgrounds=assets.backgrounds;
      if(assets.animals&&assets.animals!==this.assets.animals){this.assets.animals=assets.animals;this.spriteFrames=null;}
      return this;
    }
    imageSize(image){return image?{width:Number(image.naturalWidth||image.width)||0,height:Number(image.naturalHeight||image.height)||0}:{width:0,height:0};}
    coverImage(g,image,W,H,zoom=1,panX=0,panY=0){
      const size=this.imageSize(image);if(!size.width||!size.height)return false;
      const scale=Math.max(W/size.width,H/size.height)*zoom,w=size.width*scale,h=size.height*scale;
      const x=(W-w)*.5+clamp(panX,-1,1)*(w-W)*.46,y=(H-h)*.5+clamp(panY,-1,1)*(h-H)*.46;
      g.drawImage(image,x,y,w,h);return true;
    }
    atmosphere(g,W,H,scene){
      const key=`${W}:${H}:${scene}`;if(this.atmospheres.has(key))return this.atmospheres.get(key);
      const colors=['#16384c','#6e4561','#174c49','#252444'],gradient=g.createLinearGradient(0,0,W*.7,H);
      gradient.addColorStop(0,rgba(colors[scene]||colors[0],.20));gradient.addColorStop(.40,rgba(colors[scene]||colors[0],.015));gradient.addColorStop(1,rgba(colors[scene]||colors[0],.22));
      if(this.atmospheres.size>12)this.atmospheres.clear();this.atmospheres.set(key,gradient);return gradient;
    }
    paintedSky(g,s,W,H,t,calm=false){
      const backgrounds=this.assets.backgrounds,scene=s.phase==='victory'?3:clamp(s.scene||0,0,3),image=backgrounds[scene],size=this.imageSize(image);
      if(!size.width||!size.height)return false;
      if(!this.backgroundInitialized){this.backgroundMix=[0,1,2,3].map(index=>index===scene?1:0);this.backgroundInitialized=true;}
      const ease=1-Math.exp(-this.frameSeconds*.8),local=clamp(((s.height||0)%1800)/1800,0,1),bank=s.player?.bank||0;
      this.backgroundMix=s.phase==='victory'?[0,0,0,1]:this.backgroundMix.map((value,index)=>value+((index===scene?1:0)-value)*ease);
      if(this.backgroundMix.every((value,index)=>index===scene||value<.005))this.backgroundMix=this.backgroundMix.map((_,index)=>index===scene?1:0);
      const layers=this.backgroundMix.map((value,index)=>({value,index})).filter(layer=>layer.value>.005&&this.imageSize(backgrounds[layer.index]).width);
      if(!layers.length)layers.push({value:1,index:scene});
      g.fillStyle='#243746';g.fillRect(0,0,W,H);
      let total=0;
      for(const layer of layers){total+=layer.value;g.globalAlpha=layer.value/Math.max(.001,total);this.coverImage(g,backgrounds[layer.index],W,H,1.055+local*.035,calm?0:Math.sin(t*.035)*.25-bank*.16,calm?0:.28-local*.48+Math.sin(t*.023)*.10);}
      g.globalAlpha=1;g.fillStyle=this.atmosphere(g,W,H,scene);g.fillRect(0,0,W,H);
      if(s.weather==='storm'){g.fillStyle=rgba('#26334a',.12+Number(s.weatherIntensity||0)*.08);g.fillRect(0,0,W,H);}
      const count=calm?12:28;
      g.save();g.fillStyle=scene===3?'#e6d4f6':'#f8ebc8';
      for(let i=0;i<count;i++){
        const seed=((Math.sin(i*127.13+3)*43758.5)%1+1)%1,depth=.22+(i%7)/9;
        const x=(((i*.6180339+.13)%1)*W-bank*18*depth+Math.sin(t*.18+i)*5+W)%W,y=((seed*H+t*(calm?3:9)*depth)%(H+30))-15;
        g.globalAlpha=.10+(1+Math.sin(t*.55+i*2.1))*.07;g.beginPath();g.arc(x,y,.55+depth*.8,0,TAU);g.fill();
      }
      g.restore();return true;
    }
    atlasFrames(){
      if(this.spriteFrames)return this.spriteFrames;
      const image=this.assets.animals,size=this.imageSize(image);if(!size.width||!size.height)return null;
      const cellW=size.width/2,cellH=size.height/3,frames={},ids=['rabbit','deer','whale','fox','butterfly','falcon'];
      ids.forEach((id,index)=>{
        const col=index%2,row=Math.floor(index/2);
        // The painted atlas has a whale nose and falcon wing across two guides.
        // Use the clear gap between subjects rather than clipping to grid lines.
        let left=col*cellW,top=row*cellH,right=(col+1)*cellW,bottom=(row+1)*cellH;
        if(id==='whale')right=cellW*1.065;
        if(id==='fox'){left=cellW*1.065;bottom=cellH*1.875;}
        if(id==='butterfly')right=cellW*1.012;
        if(id==='falcon')top=cellH*1.875;
        left=Math.floor(left);top=Math.floor(top);right=Math.min(size.width,Math.ceil(right));bottom=Math.min(size.height,Math.ceil(bottom));
        const regionW=right-left,regionH=bottom-top,frame={sx:left,sy:top,sw:regionW,sh:regionH};
        try{
          const canvas=this.createCanvas(regionW,regionH),ctx=canvas.getContext('2d');ctx.drawImage(image,left,top,regionW,regionH,0,0,regionW,regionH);
          const pixels=ctx.getImageData(0,0,regionW,regionH).data;let minX=regionW,minY=regionH,maxX=0,maxY=0;
          for(let y=0;y<regionH;y+=2)for(let x=0;x<regionW;x+=2)if(pixels[(y*regionW+x)*4+3]>18){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
          if(maxX>minX&&maxY>minY){const pad=Math.max(3,Math.min(cellW,cellH)*.020);frame.sx=left+Math.max(0,minX-pad);frame.sy=top+Math.max(0,minY-pad);frame.sw=Math.min(regionW,maxX+pad)-Math.max(0,minX-pad);frame.sh=Math.min(regionH,maxY+pad)-Math.max(0,minY-pad);}
        }catch(_){/* Cropping remains valid on platforms without pixel reads. */}
        frames[id]=frame;
      });
      this.spriteFrames=frames;return frames;
    }
    text(g,text,x,y,size=12,color='#edf3e8',align='left',serif=false){g.font=`${size}px ${serif?'"Songti SC", "SimSun", Georgia, serif':'"Microsoft YaHei", sans-serif'}`;g.textAlign=align;g.textBaseline='alphabetic';g.fillStyle=color;g.fillText(String(text),x,y);}
    wrap(g,text,x,y,width,size=12,color='#d4e0dc',line=23){g.font=`${size}px "Microsoft YaHei", sans-serif`;let value='',row=0;for(const c of text){if(c==='\n'||g.measureText(value+c).width>width){this.text(g,value,x,y+row*line,size,color);value='';row++;if(c==='\n')continue;}value+=c;}if(value)this.text(g,value,x,y+row*line,size,color);return row+1;}
    box(g,x,y,w,h,r,fill,stroke){g.beginPath();g.moveTo(x+r,y);g.lineTo(x+w-r,y);g.quadraticCurveTo(x+w,y,x+w,y+r);g.lineTo(x+w,y+h-r);g.quadraticCurveTo(x+w,y+h,x+w-r,y+h);g.lineTo(x+r,y+h);g.quadraticCurveTo(x,y+h,x,y+h-r);g.lineTo(x,y+r);g.quadraticCurveTo(x,y,x+r,y);g.closePath();if(fill){g.fillStyle=fill;g.fill();}if(stroke){g.strokeStyle=stroke;g.lineWidth=.8;g.stroke();}}
    button(g,id,label,x,y,w,h,primary=false){g.save();g.shadowColor=primary?'rgba(236,219,174,.13)':'rgba(5,22,38,.16)';g.shadowBlur=primary?18:7;g.shadowOffsetY=2;this.box(g,x,y,w,h,Math.min(24,h/2),primary?'rgba(245,232,197,.15)':'rgba(16,36,50,.18)',primary?'rgba(249,237,205,.61)':'rgba(230,242,231,.23)');g.shadowBlur=0;g.shadowOffsetY=0;this.text(g,label,x+w/2,y+h/2+4,primary?13:10,primary?'#fff2d7':'#e3eadd','center');g.restore();this.buttons.push({id,label,x,y,w,h});}
    star(g,x,y,r,color,alpha=1){g.save();g.translate(x,y);g.fillStyle=rgba(color,alpha);g.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,rr=i%2?r*.43:r;i?g.lineTo(Math.cos(a)*rr,Math.sin(a)*rr):g.moveTo(Math.cos(a)*rr,Math.sin(a)*rr);}g.closePath();g.fill();g.restore();}
    halo(g,x,y,r,color,alpha){const glow=g.createRadialGradient(x,y,0,x,y,r);glow.addColorStop(0,rgba(color,alpha));glow.addColorStop(1,rgba(color,0));g.fillStyle=glow;g.fillRect(x-r,y-r,r*2,r*2);}
    plane(g,x,y,size,bank=0,alpha=1){g.save();g.globalAlpha=alpha;g.translate(x,y);g.rotate(bank*.48);g.scale(1-Math.abs(bank)*.13,1);g.shadowColor='rgba(4,18,35,.4)';g.shadowBlur=12;g.shadowOffsetY=5;g.fillStyle='#fff8e8';g.beginPath();g.moveTo(0,-size);g.lineTo(-size*.77,size*.63);g.lineTo(0,size*.28);g.closePath();g.fill();g.shadowBlur=0;g.shadowOffsetY=0;g.fillStyle='#a7c6d0';g.beginPath();g.moveTo(0,-size);g.lineTo(size*.77,size*.63);g.lineTo(0,size*.28);g.closePath();g.fill();g.fillStyle='#e6ecd9';g.beginPath();g.moveTo(0,-size);g.lineTo(0,size*.78);g.lineTo(size*.16,size*.38);g.closePath();g.fill();g.strokeStyle='rgba(255,255,247,.7)';g.lineWidth=.8;g.beginPath();g.moveTo(0,-size);g.lineTo(0,size*.65);g.stroke();g.restore();}
    spriteAnimal(g,type,x,y,r,color,age,locked,motion={}){
      const frames=this.atlasFrames(),frame=frames&&frames[type];if(!frame)return false;
      const shapes={rabbit:[3.0,3.2],deer:[3.6,3.2],whale:[4.0,2.7],fox:[3.8,2.8],butterfly:[3.6,3.2],falcon:[4.0,3.0]},shape=shapes[type]||[3.3,3.0];
      const scale=Math.min(r*shape[0]/frame.sw,r*shape[1]/frame.sh),w=frame.sw*scale,h=frame.sh*scale;
      const phase=Number.isFinite(motion.phase)?motion.phase:age*(type==='butterfly'?6.4:type==='falcon'?4.4:type==='whale'?2.0:2.6),breath=Math.sin(age*2.1+(motion.id||0)),rest=motion.pose==='rest';
      const facing=Number.isFinite(motion.facing)?motion.facing:1,turn=Math.max(.32,Math.abs(facing)),flip=facing<0?-1:1,tilt=clamp(motion.tilt||0,-.42,.42),hit=clamp(motion.hitFlash||0,0,1);
      g.save();g.translate(x,y+Math.sin(phase*.48)*r*(rest?.025:.07)-hit*r*.06);g.rotate(tilt+Math.sin(phase*.50)*(rest?.01:.025));
      g.scale(flip*turn*(1+breath*.018),1-breath*.014+(1-turn)*.045);g.globalAlpha*=locked?.18:1;
      g.shadowColor=rgba(hit?'#fff6d6':color,locked?0:.32);g.shadowBlur=hit?12:7;
      const image=this.assets.animals;
      const part=(from,fraction,dx,dy,dw,dh)=>g.drawImage(image,frame.sx+frame.sw*from,frame.sy,frame.sw*fraction,frame.sh,dx,dy,dw,dh);
      if(type==='whale'){
        // The tail turns around its attachment, while the head keeps its course.
        g.save();g.translate(-w*.20,0);g.rotate(Math.sin(phase)*.18);g.scale(1,1+Math.cos(phase)*.04);part(0,.31,-w*.30,-h*.5,w*.31,h);g.restore();
        part(.30,.70,-w*.20,-h*.5,w*.70,h);
      }else if(type==='butterfly'||type==='falcon'){
        const flap=Number.isFinite(motion.flap)?motion.flap:Math.sin(phase),fold=type==='butterfly'?.44+(flap+1)*.29:.72+(flap+1)*.15;
        for(const side of [-1,1]){
          g.save();if(type==='butterfly')g.scale(fold,1);else{g.rotate(side*Math.cos(phase)*.045);g.scale(1,fold);}
          part(side<0?0:.5,.5,side<0?-w*.5:0,-h*.5,w*.5,h);g.restore();
        }
        // Keep the thorax/head crisp while the two wings fold independently.
        part(.455,.09,-w*.045,-h*.5,w*.09,h);
      }else{
        const spring=type==='fox'?.035:type==='deer'?.026:.025;
        g.scale(1+Math.sin(phase)*spring,1-Math.sin(phase)*spring);part(0,1,-w*.5,-h*.5,w,h);
      }
      if(hit>0&&!locked){g.globalCompositeOperation='screen';g.globalAlpha*=hit*.30;g.shadowBlur=0;part(0,1,-w*.5,-h*.5,w,h);}
      g.restore();return true;
    }
    animal(g,type,x,y,r,color,age=0,locked=false,motion={}){
      if(this.spriteAnimal(g,type,x,y,r,color,age,locked,motion))return;
      g.save();g.translate(x,y);g.scale(r,r);g.lineWidth=.035;g.strokeStyle=rgba(color,locked?.19:.88);g.fillStyle=rgba(color,locked?.035:.25);g.lineCap='round';g.lineJoin='round';
      if(type==='rabbit'){
        g.beginPath();g.ellipse(-.36,-.91,.18,.66,-.23,0,TAU);g.ellipse(.18,-.98,.17,.62,.22,0,TAU);g.fill();g.stroke();g.beginPath();g.ellipse(0,.03,.68,.62,0,0,TAU);g.ellipse(-.12,.57,.68,.43,0,0,TAU);g.fill();g.stroke();
      }else if(type==='deer'){
        g.beginPath();g.ellipse(-.21,.30,.84,.38,0,0,TAU);g.fill();g.stroke();g.beginPath();g.moveTo(.38,.32);g.lineTo(.52,-.55);g.quadraticCurveTo(.8,-.86,1.05,-.60);g.lineTo(.76,-.36);g.lineTo(.69,.49);g.moveTo(-.66,.47);g.lineTo(-.75,1.06);g.moveTo(-.14,.55);g.lineTo(-.03,1.02);g.moveTo(.44,-.68);g.lineTo(.22,-1.27);g.moveTo(.30,-1.03);g.lineTo(-.02,-1.20);g.moveTo(.67,-.72);g.lineTo(.84,-1.30);g.moveTo(.79,-1.09);g.lineTo(1.09,-1.25);g.stroke();
      }else if(type==='whale'){
        g.beginPath();g.moveTo(-1.3,-.1);g.bezierCurveTo(-.75,-1.1,1,-.68,1.12,-.02);g.quadraticCurveTo(1.48,-.13,1.70,-.65);g.lineTo(1.72,.54);g.quadraticCurveTo(1.45,.16,1.06,.22);g.bezierCurveTo(.48,.80,-.95,.57,-1.3,-.1);g.fill();g.stroke();g.beginPath();g.moveTo(-.1,.2);g.quadraticCurveTo(.15,.9,.50,.79);g.stroke();
      }else if(type==='fox'){
        g.beginPath();g.moveTo(-.62,.53);g.bezierCurveTo(-1.8,.60,-1.48,-.86,-.86,-.72);g.quadraticCurveTo(-1.12,.02,-.43,.19);g.quadraticCurveTo(-.16,-.05,.02,-.38);g.lineTo(-.03,-1.02);g.lineTo(.43,-.71);g.lineTo(.9,-1.04);g.lineTo(.91,-.37);g.lineTo(1.16,-.02);g.quadraticCurveTo(.66,.18,.44,.48);g.quadraticCurveTo(.09,.94,-.62,.53);g.fill();g.stroke();
      }else if(type==='butterfly'){
        for(const side of [-1,1]){g.save();g.scale(side,1);const flutter=.94+Math.sin(age*5)*.07;g.scale(flutter,1);g.beginPath();g.moveTo(0,0);g.bezierCurveTo(.65,-1.65,1.7,-.83,.82,.10);g.bezierCurveTo(1.4,.9,.27,1.24,0,0);g.fill();g.stroke();g.restore();}g.beginPath();g.moveTo(0,-.48);g.lineTo(0,.60);g.moveTo(0,-.4);g.lineTo(-.28,-.8);g.moveTo(0,-.4);g.lineTo(.28,-.8);g.stroke();
      }else{
        g.beginPath();g.moveTo(0,-.2);g.bezierCurveTo(-.45,-.6,-1.35,-.9,-1.65,-.48);g.quadraticCurveTo(-.85,-.24,-.30,.35);g.lineTo(-.26,.98);g.lineTo(0,.70);g.lineTo(.25,1);g.lineTo(.29,.29);g.quadraticCurveTo(.96,-.28,1.64,-.49);g.quadraticCurveTo(.91,-.98,.22,-.28);g.quadraticCurveTo(.16,-.77,-.16,-.47);g.closePath();g.fill();g.stroke();
      }
      if(!locked){g.fillStyle='#fff9df';g.beginPath();g.arc(type==='whale'?-.71:type==='fox'?.63:.22,type==='whale'?-.06:type==='fox'?-.22:-.06,.052,0,TAU);g.fill();this.star(g,0,-.37,.13,'#fff0b7',.85);}
      g.restore();
    }
    finale(g,W,H,t,alpha=1,ambientOnly=false){
      g.save();g.globalAlpha=alpha;const sky=g.createLinearGradient(0,0,W*.8,H);sky.addColorStop(0,'#191f43');sky.addColorStop(.38,'#755e93');sky.addColorStop(.70,'#c28fa5');sky.addColorStop(1,'#223e61');g.fillStyle=sky;g.fillRect(0,0,W,H);
      const D=Math.min(W,H);this.halo(g,W*.61,H*.37,D*.65,'#f3c5d9',.30);this.halo(g,W*.20,H*.57,D*.60,'#8fc6db',.25);
      for(let j=0;j<5;j++){g.strokeStyle=rgba(['#d2a4ef','#93dce0','#efccbe'][j%3],.08);g.lineWidth=D*(.035+j*.009);g.beginPath();g.moveTo(-W*.2,H*(.21+j*.025));g.bezierCurveTo(W*.25,H*(.48+j*.02),W*.42,-H*.05,W*1.2,H*(.28+j*.025));g.stroke();}
      for(let i=0;i<130;i++){const x=((Math.sin(i*127.1)*43758.54)%1+1)%1*W,y=((Math.sin(i*311.7)*19642.35)%1+1)%1*H*.78;this.star(g,x,y,i%17===0?3:1,'#fff1da',.25+.32*(1+Math.sin(t*.4+i))*.5);}
      if(!ambientOnly){const mx=W*.67,my=H*.31,mr=D*.12;this.halo(g,mx,my,mr*2.3,'#ffe6c5',.26);const moon=g.createRadialGradient(mx-mr*.3,my-mr*.3,0,mx,my,mr);moon.addColorStop(0,'#fff4da');moon.addColorStop(1,'#e7ccac');g.fillStyle=moon;g.beginPath();g.arc(mx,my,mr,0,TAU);g.fill();g.fillStyle='#7c719a';g.beginPath();g.arc(mx+mr*.38,my-mr*.15,mr*.93,0,TAU);g.fill();}
      for(let layer=0;layer<5;layer++){const y=H*(.69+layer*.067);g.fillStyle=rgba(layer%2?'#a9bfd3':'#dfbdcf',.10+layer*.025);g.beginPath();g.moveTo(-W*.1,H);g.lineTo(-W*.1,y);g.bezierCurveTo(W*.1,y-H*.10,W*.3,y+H*.09,W*.5,y-H*.02);g.bezierCurveTo(W*.74,y-H*.18,W*.83,y+H*.01,W*1.1,y-H*.06);g.lineTo(W*1.1,H);g.closePath();g.fill();}
      if(!ambientOnly){this.animal(g,'whale',W*(.23+Math.sin(t*.06)*.04),H*.44,D*.075,'#d3e5f2',t);this.animal(g,'butterfly',W*.78,H*.56,D*.031,'#f1d9e9',t);}
      g.strokeStyle='rgba(252,224,178,.28)';g.lineWidth=1;g.beginPath();g.moveTo(W*.5,H);g.bezierCurveTo(W*.3,H*.73,W*.7,H*.64,W*.61,H*.45);g.stroke();g.restore();
    }
    render(g,s,o={}){
      const W=Math.max(1,o.width||390),H=Math.max(1,o.height||844),D=Math.min(W,H),safe=o.safe||{},top=Math.max(16,safe.top||0),bottom=Math.min(H-12,safe.bottom||H-12),t=Number(o.time)||s.elapsed||0;
      if(W!==this.width||H!==this.height)this.motions.clear();if((s.elapsed||0)<this.lastElapsed)this.backgroundMix=[0,1,2,3].map(index=>index===(s.scene||0)?1:0);this.width=W;this.height=H;this.buttons=[];const dt=Math.max(0,Math.min(3,((s.elapsed||0)-this.lastElapsed)*60));this.frameSeconds=dt/60;this.lastElapsed=s.elapsed||0;
      this.weather.update(s.phase==='paused'||o.collection?0:dt,{width:W,height:H,scene:s.scene||0,mode:s.weather||'clear',calm:!!o.calm,quality:1,speed:1+Number(s.progress||0)*.4});
      g.save();g.globalAlpha=1;
      const artwork=this.paintedSky(g,s,W,H,t,!!o.calm);this.usingArtwork=artwork;
      if(s.phase==='victory'){
        if(!artwork)this.finale(g,W,H,t);
        else{this.animal(g,'whale',W*(.21+Math.sin(t*.07)*.025),H*.31,D*.064,'#cce3f2',t);this.animal(g,'butterfly',W*(.79+Math.cos(t*.09)*.02),H*.41,D*.026,'#efd6f0',t);}
      }
      else{
        if(!artwork)this.scenery.render(g,{width:W,height:H,scene:s.scene||0,time:s.elapsed||0,distance:(s.height||0)*.31,steering:s.player?.bank||0,pitch:0,altitude:clamp((s.height||0)/9000,.02,1),quality:1,calm:!!o.calm,started:s.phase!=='intro'});
        if(!artwork&&s.height>6500)this.finale(g,W,H,t,Math.min(.58,(s.height-6500)/4500),true);
        this.weather.background(g,{});
      }
      if(!artwork&&(s.phase==='intro'||s.phase==='takeoff')){
        const rise=s.phase==='intro'?0:s.takeoffProgress||0,ground=H*(.91+rise*.39);g.fillStyle='#173c43';g.beginPath();g.moveTo(0,H);g.lineTo(0,ground);g.bezierCurveTo(W*.22,ground-H*.06,W*.31,ground+H*.04,W*.54,ground);g.bezierCurveTo(W*.72,ground-H*.08,W*.88,ground-H*.02,W,ground-H*.06);g.lineTo(W,H);g.closePath();g.fill();
        g.strokeStyle='rgba(227,236,190,.28)';g.lineWidth=1;for(let i=0;i<20;i++){const x=(i*.618%1)*W;g.beginPath();g.moveTo(x,ground+18);g.quadraticCurveTo(x+Math.sin(t+i)*4,ground-2,x-3,ground-10-(i%4)*4);g.stroke();}
      }
      if(s.phase!=='victory')this.drawEntities(g,s,W,H,D,t);
      const p=s.player||{x:.5,y:.95};
      if(s.phase!=='victory'){
        const px=p.x*W,py=p.y*H,size=clamp(D*.035,16,31);this.halo(g,px,py,size*3,'#bde4e4',.12);
        g.strokeStyle='rgba(225,242,229,.24)';g.lineWidth=.7;for(let side=-1;side<=1;side+=2){g.beginPath();g.moveTo(px+side*size*.5,py+size*.4);g.quadraticCurveTo(px+side*size*.7-p.bank*25,py+75,px+side*size*1.2-p.bank*42,py+150);g.stroke();}
        const blink=(p.invulnerable>0&&s.phase==='playing')?.55+.45*Math.abs(Math.sin((s.elapsed||0)*15)):1;this.plane(g,px,py,size,p.bank||0,blink);
      }
      if(s.phase!=='victory')this.weather.foreground(g,{});
      if(s.damageFlash>0){const flash=g.createRadialGradient(W*.5,H*.6,D*.25,W*.5,H*.6,D);flash.addColorStop(0,'rgba(184,89,118,0)');flash.addColorStop(1,rgba('#b85976',s.damageFlash*.18));g.fillStyle=flash;g.fillRect(0,0,W,H);}
      const shade=g.createLinearGradient(0,0,0,H);shade.addColorStop(0,'rgba(8,22,39,.36)');shade.addColorStop(.24,'rgba(8,22,39,0)');shade.addColorStop(.78,'rgba(8,22,39,0)');shade.addColorStop(1,'rgba(8,22,39,.40)');g.fillStyle=shade;g.fillRect(0,0,W,H);
      if(o.collection)this.collection(g,s,W,H,top,bottom,o);
      else if(s.phase==='intro')this.intro(g,s,W,H,D,top,bottom,o);
      else if(s.phase==='paused')this.overlay(g,s,W,H,top,bottom,'让风，也歇一会儿','这封信，会等你回来。','resume','继续向九霄');
      else if(s.phase==='gameover')this.overlay(g,s,W,H,top,bottom,'风会记得你的勇敢',`这一程抵达 ${Math.floor(s.height)} 米 · 珍藏 ${s.collected.length} 位月光伙伴`,'retry','再次从地面起飞');
      else if(s.phase==='victory')this.ending(g,s,W,H,D,top,bottom,t);
      else this.hud(g,s,W,H,D,top,bottom,o);
      g.restore();this.lastPhase=s.phase;
    }
    enemyMotion(enemy,W,H){
      const age=Number(enemy.age)||0,id=enemy.id;let motion=this.motions.get(id);
      if(!motion){motion={x:enemy.x,y:enemy.y,hp:enemy.hp,facing:Number.isFinite(enemy.facing)?enemy.facing:1,hitUntil:-1,trail:[]};this.motions.set(id,motion);}
      const seconds=Math.max(.001,this.frameSeconds),dx=(enemy.x-motion.x)*W/seconds,dy=(enemy.y-motion.y)*H/seconds;
      const target=Number.isFinite(enemy.facing)&&enemy.facing!==0?Math.sign(enemy.facing):Math.abs(dx)>2?Math.sign(dx):Math.sign(motion.facing)||1;
      motion.facing+=(target-motion.facing)*Math.min(1,this.frameSeconds*7);
      if(Number.isFinite(enemy.hp)&&enemy.hp<motion.hp)motion.hitUntil=age+.16;
      const heading=Number(enemy.heading),tilt=Number.isFinite(heading)?heading:Math.atan2(dy,Math.abs(dx)+90)*.38,phase=Number.isFinite(enemy.flapPhase)?enemy.flapPhase:age*(enemy.type==='butterfly'?6.4:enemy.type==='falcon'?4.4:enemy.type==='whale'?2:2.6)+Number(id||0);
      if(this.frameSeconds>0){motion.trail.unshift({x:enemy.x*W,y:enemy.y*H});if(motion.trail.length>10)motion.trail.pop();}
      motion.x=enemy.x;motion.y=enemy.y;motion.hp=enemy.hp;
      return {id,facing:motion.facing,tilt:clamp(tilt,-.32,.32),phase,pose:enemy.motionPhase,flap:Math.sin(phase),hitFlash:Math.max(clamp((Number(enemy.flash)||0)/.16,0,1),clamp((motion.hitUntil-age)/.16,0,1)),trail:motion.trail};
    }
    creatureTrail(g,enemy,motion,x,y,r,color,t){
      const points=motion.trail;g.save();g.lineCap='round';
      for(let i=1;i<points.length;i++){const fade=1-i/points.length;g.strokeStyle=rgba(color,fade*.09);g.lineWidth=fade*r*.17+.5;g.beginPath();g.moveTo(points[i-1].x,points[i-1].y);g.lineTo(points[i].x,points[i].y);g.stroke();}
      if(enemy.type==='whale')for(let side=-1;side<=1;side+=2){const direction=motion.facing<0?-1:1;g.strokeStyle=rgba(color,.17);g.lineWidth=.7;g.beginPath();g.moveTo(x-direction*r*1.2,y+side*r*.16);g.bezierCurveTo(x-direction*r*2.2,y+Math.sin(t*1.5+side)*r*.4,x-direction*r*3.1,y+side*r*.7,x-direction*r*3.7,y+Math.sin(t+side)*r*.6);g.stroke();}
      for(let i=0;i<3;i++){const direction=motion.facing<0?-1:1,drift=((t*.6+i*.37)%1);this.star(g,x-direction*r*(1.5+drift*1.3),y+Math.sin(t+i*2)*r*.30,r*(.055+(1-drift)*.035),color,(1-drift)*.32);}
      g.restore();
    }
    chargeAura(g,enemy,x,y,r,t){
      const charge=clamp(enemy.charge||0,0,1);if(!charge)return;
      const reach=r*(1.45+charge*.20);this.halo(g,x,y,reach*1.5,'#e3a8ef',.035+charge*.12);
      g.save();g.lineWidth=.65;g.strokeStyle=rgba('#edc1f3',charge*.45);g.beginPath();g.ellipse(x,y+r*.25,reach,reach*.64,Math.sin(t*.45)*.16,0,TAU);g.stroke();
      for(let i=0;i<6;i++){
        const angle=t*.65+i*TAU/6,xx=x+Math.cos(angle)*reach,yy=y+r*.25+Math.sin(angle)*reach*.64;
        g.save();g.translate(xx,yy);g.rotate(angle+t*.20);g.strokeStyle=rgba('#f2d3fa',.2+charge*.60);g.fillStyle=rgba('#eab7f7',charge*.35);g.beginPath();g.moveTo(0,-r*.12);g.lineTo(r*.065,0);g.lineTo(0,r*.12);g.lineTo(-r*.065,0);g.closePath();g.fill();g.stroke();g.restore();
      }
      if(charge>.68){const aimX=Number.isFinite(enemy.aimX)?enemy.aimX*this.width:x,aimY=Number.isFinite(enemy.aimY)?enemy.aimY*this.height:y+100,angle=Math.atan2(aimY-y,aimX-x);g.save();g.translate(x+Math.cos(angle)*r*1.30,y+Math.sin(angle)*r*1.30);g.rotate(angle-Math.PI*.5);g.strokeStyle=rgba('#f4dafb',(charge-.68)*1.8);g.lineWidth=1.1;g.beginPath();g.moveTo(-r*.24,-r*.12);g.quadraticCurveTo(0,r*.25,r*.24,-r*.12);g.stroke();this.star(g,0,0,r*.105,'#ffe0f5',(charge-.68)*2);g.restore();}
      g.restore();
    }
    deathEchoes(g,s,W,H,D){
      for(const effect of s.deathFX||[]){
        const progress=clamp(effect.age/(effect.life||.75),0,1),fade=1-progress,x=effect.x*W,y=effect.y*H,r=effect.size*D;
        this.halo(g,x,y,r*(2+progress*2),effect.color||'#e7d9f3',fade*fade*.15);
        g.save();g.globalAlpha=fade*fade*.42;this.animal(g,effect.type,x,y-progress*r*.3,r*(1+progress*.16),effect.color||'#e7d9f3',effect.age,false,{facing:effect.facing||1,tilt:effect.heading||0,phase:effect.age*2});g.restore();
        for(let i=0;i<7;i++){const angle=i*TAU/7+progress*.35,reach=r*(.5+progress*2.9),xx=x+Math.cos(angle)*reach,yy=y+Math.sin(angle)*reach*.74;this.star(g,xx,yy,r*(.08+fade*.05),effect.color||'#e7d9f3',fade*.65);}
      }
    }
    drawEntities(g,s,W,H,D,t){
      this.deathEchoes(g,s,W,H,D);
      for(const b of s.bullets||[]){const x=b.x*W,y=b.y*H,r=b.r*D;g.strokeStyle=b.kind==='star'?'#ffe7ac':'rgba(207,240,242,.75)';g.lineWidth=b.kind==='star'?2:1.3;g.beginPath();g.moveTo(x,y+11);g.lineTo(x,y-6);g.stroke();if(b.kind==='star')this.star(g,x,y,r+1,'#fff0b8',.9);}
      const live=new Set();
      for(const e of s.enemies||[]){const animal=ANIMALS.find(a=>a.id===e.type)||ANIMALS[0],x=e.x*W,y=e.y*H,r=e.size*D,motion=this.enemyMotion(e,W,H);live.add(e.id);this.creatureTrail(g,e,motion,x,y,r,animal.color,e.age||t);this.halo(g,x,y,r*2.5,animal.color,.10+motion.hitFlash*.12);this.chargeAura(g,e,x,y,r,e.age||t);this.animal(g,e.type,x,y,r,animal.color,e.age||t,false,motion);
        if(e.hp<e.maxHp){const health=clamp(e.hp/e.maxHp,0,1),barY=y-r*1.85,fill=g.createLinearGradient(x-r,barY,x+r,barY);fill.addColorStop(0,'#d8b5ef');fill.addColorStop(1,'#fff0dc');this.box(g,x-r,barY,r*2,4,2,'rgba(11,24,43,.67)','rgba(246,232,249,.36)');if(health>0)this.box(g,x-r+.5,barY+.5,Math.max(1,(r*2-1)*health),3,1.5,fill,null);}
      }
      for(const id of this.motions.keys())if(!live.has(id))this.motions.delete(id);
      for(const b of s.hostile||[]){const x=b.x*W,y=b.y*H,r=b.r*D;
        if(b.kind==='moon'){this.halo(g,x,y,r*3,'#d88ade',.15);g.strokeStyle='#efa9ed';g.lineWidth=2;g.beginPath();g.arc(x,y,r,.25,Math.PI*1.7);g.stroke();g.fillStyle='#f1c5f2';g.beginPath();g.arc(x-r*.15,y+r*.2,r*.22,0,TAU);g.fill();}
        else if(b.kind==='gust'){this.halo(g,x,y,r*2.2,'#8edcde',.12);g.strokeStyle='rgba(167,233,235,.72)';g.lineWidth=1.6;for(let j=0;j<3;j++){const yy=y+(j-1)*r*.45;g.beginPath();g.moveTo(x-r,yy);g.bezierCurveTo(x-r*.1,yy-r*.6,x+r*.2,yy+r*.5,x+r,yy-r*.2);g.stroke();}g.strokeStyle='rgba(170,236,232,.3)';g.lineWidth=.7;g.beginPath();g.ellipse(x,y,r*1.15,r*.85,0,0,TAU);g.stroke();}
        else if(b.kind==='snow'){
          this.halo(g,x,y,r*2.2,'#a3d8f1',.16);g.save();g.translate(x,y);g.rotate(t*.28+Number(b.id||0)*.37);
          const core=g.createRadialGradient(-r*.24,-r*.30,0,0,0,r);core.addColorStop(0,'rgba(255,255,255,.98)');core.addColorStop(.58,'rgba(229,247,255,.91)');core.addColorStop(1,'rgba(145,198,224,.48)');
          g.fillStyle=core;g.strokeStyle='rgba(49,96,126,.56)';g.lineWidth=1;g.beginPath();g.arc(0,0,r*.86,0,TAU);g.fill();g.stroke();
          g.strokeStyle='rgba(225,249,255,.98)';g.lineWidth=1.1;g.lineCap='round';g.beginPath();
          for(let arm=0;arm<6;arm++){const angle=arm*TAU/6,c=Math.cos(angle),sn=Math.sin(angle),branch=r*.69;g.moveTo(c*r*.25,sn*r*.25);g.lineTo(c*r*1.12,sn*r*1.12);for(const side of [-1,1]){const fork=angle+side*Math.PI*.25;g.moveTo(c*branch,sn*branch);g.lineTo(c*branch-Math.cos(fork)*r*.22,sn*branch-Math.sin(fork)*r*.22);}}
          g.stroke();g.restore();
        }
        else if(b.kind==='hail'){g.save();g.translate(x,y);g.rotate(t+b.id);g.fillStyle='rgba(206,236,248,.44)';g.strokeStyle='#e2f2fc';g.lineWidth=1;g.beginPath();for(let j=0;j<6;j++){const a=j*TAU/6;j?g.lineTo(Math.cos(a)*r,Math.sin(a)*r):g.moveTo(Math.cos(a)*r,Math.sin(a)*r);}g.closePath();g.fill();g.stroke();g.beginPath();g.moveTo(-r,0);g.lineTo(r,0);g.moveTo(0,-r);g.lineTo(0,r);g.stroke();g.restore();}
        else{g.fillStyle='rgba(119,195,226,.56)';g.strokeStyle='#c1e5f1';g.lineWidth=.8;g.beginPath();g.moveTo(x,y-r*1.6);g.bezierCurveTo(x-r*1.2,y,x-r,y+r,x,y+r);g.bezierCurveTo(x+r,y+r,x+r*1.2,y,x,y-r*1.6);g.fill();g.stroke();}
      }
      for(const p of s.pickups||[]){const x=p.x*W,y=p.y*H,r=Math.max(5,p.r*D);this.halo(g,x,y,r*3,p.kind==='heal'?'#a9efd0':'#f7df9c',.22);
        if(p.kind==='heal'){this.box(g,x-r,y-r,r*2,r*2,r*.35,'rgba(161,231,191,.22)','#c7f2d6');g.fillStyle='#d5f8dd';g.fillRect(x-r*.18,y-r*.63,r*.36,r*1.26);g.fillRect(x-r*.63,y-r*.18,r*1.26,r*.36);}
        else this.star(g,x,y,r,'#ffe5a1',.95);
      }
      g.save();g.shadowBlur=4;
      for(const [index,p] of (s.particles||[]).entries()){const fade=clamp(1-p.age/p.life,0,1),color=p.color||'#f7e8b4';g.shadowColor=rgba(color,fade*.5);if(index%4===0)this.star(g,p.x*W,p.y*H,Math.max(1,p.r*D*1.7),color,fade*fade);else{g.fillStyle=rgba(color,fade*fade);g.beginPath();g.arc(p.x*W,p.y*H,Math.max(.5,p.r*D),0,TAU);g.fill();}}
      g.restore();
    }
    intro(g,s,W,H,D,top,bottom,o){
      const x=W>700?W*.11:28,wide=W>700,base=clamp(H*.22,top+116,H*.30),title=wide?clamp(W*.047,44,72):clamp(W*.105,34,46);
      g.save();const veil=g.createRadialGradient(x+Math.min(170,W*.34),base+title*1.2,18,x+Math.min(170,W*.34),base+title*1.2,wide?Math.min(570,W*.48):W*.93);veil.addColorStop(0,'rgba(11,34,49,.35)');veil.addColorStop(.57,'rgba(11,34,49,.21)');veil.addColorStop(1,'rgba(11,34,49,0)');g.fillStyle=veil;g.fillRect(0,Math.max(0,base-130),Math.min(W,x+(wide?650:W)),H-base+130);g.shadowColor='rgba(6,25,39,.46)';g.shadowBlur=12;g.shadowOffsetY=2;
      this.text(g,'PAPERPLANE  /  A LETTER TO THE NINTH SKY',x,base-27,wide?9:7,'#c8dfda');this.text(g,'把一封信，',x,base+title*.8,title,'#f3f3e7','left',true);this.text(g,'送到九霄。',x,base+title*2,title,'#e7ecd0','left',true);
      const desc=base+title*2+35;this.wrap(g,'从山谷的第一阵风出发，\n穿过雨雪与月光，寻找天空尽头的回信。',x,desc,Math.min(410,W-56),wide?12:11,'#e2eadd',24);
      const by=Math.min(bottom-160,desc+80);this.box(g,x,by,wide?230:205,52,26,'rgba(11,33,44,.24)',null);this.button(g,'start','从地面起飞  →',x,by,wide?230:205,52,true);this.button(g,'collection',`月光图鉴  ${s.collected.length} / 6`,x,by+65,wide?230:205,42);
      this.text(g,'自动射击 · 拖动 / 方向键移动',x,by+132,10,'#dae5d7');this.text(g,'金色星光补充弹药，绿色光包修补机翼。',x,by+153,9,'#c9dacd');
      const actionY=Math.max(top+14,(o.capsule?.bottom||0)+9);this.button(g,'sound',o.sound?'声音 · 开':'声音 · 关',W-109,actionY,85,38);this.button(g,'calm',o.calm?'柔和动效 · 开':'柔和动效 · 关',W-109,actionY+46,85,32);this.text(g,'九霄来信',24,top+39,16,'#eaf0df','left',true);
      if(s.records.bestHeight>0)this.text(g,`最远曾抵达 ${Math.floor(s.records.bestHeight)} 米`,x,Math.min(bottom-15,by+188),9,'#b7d1c5');g.restore();
    }
    hud(g,s,W,H,D,top,bottom,o){
      const header=Math.max(top+14,(o.capsule?.bottom||0)+9),small=W<600,bw=small?110:160;
      this.text(g,'机翼完整度',24,header+16,8,'#c5d9d4');this.text(g,`${Math.ceil(s.hp)} / 100`,24+bw,header+16,10,s.hp<30?'#efb5ba':'#ecf1d7','right');this.box(g,24,header+27,bw,4,2,'rgba(217,237,224,.17)',null);if(s.hp>0)this.box(g,24,header+27,bw*s.hp/100,4,2,s.hp<30?'#eaa7ae':'#dbe8bc',null);
      this.text(g,`${Math.floor(s.height).toLocaleString()} m`,W-24,header+23,small?19:25,'#eef1de','right',true);this.text(g,'/ 9,000  九霄',W-24,header+43,8,'#c4d6d0','right');
      this.box(g,24,header+56,W-48,2,1,'rgba(214,233,219,.13)',null);if(s.progress>0)this.box(g,24,header+56,(W-48)*s.progress,2,1,'#d8ddbb',null);
      this.text(g,s.chapterName,W/2,header+81,small?10:12,'#d7e1cf','center',true);
      this.button(g,'pause','暂停',W-70,bottom-58,48,38);this.button(g,'collection','图鉴',W-128,bottom-58,48,38);this.button(g,'sound',o.sound?'声音开':'声音关',W-186,bottom-58,48,38);
      this.star(g,30,bottom-42,6,'#f7e0a3');this.text(g,`${Math.floor(s.ammo)}`,46,bottom-38,14,'#f0e6bc');this.text(g,s.ammo>=1?'星光强化':'清风弹 · 无限',24,bottom-19,8,'#c4d6cd');
      if(o.autoFire===false)this.button(g,'fire','射击',W-88,bottom-143,64,64,true);this.button(g,'autofire',o.autoFire===false?'自动射击关':'自动射击开',24,bottom-107,100,34);
      if(s.phase==='takeoff'){const a=Math.min(1,(s.elapsed||0)/1.3)*Math.min(1,(6-(s.elapsed||0))/1.2);g.save();g.globalAlpha=Math.max(0,a);this.text(g,'一封未寄出的信，想看看天空的尽头。',W/2,H*.43,small?12:17,'#f2f0d7','center',true);this.text(g,'从这里，向九霄启程。',W/2,H*.43+30,10,'#d6e6d8','center');g.restore();}
      else if(s.warning){const alpha=.75+Math.sin(s.elapsed*3)*.1,w=Math.min(W-40,500);this.box(g,(W-w)/2,header+105,w,48,12,rgba('#332d4e',alpha*.62),'rgba(239,202,162,.38)');this.wrap(g,s.warning,(W-w)/2+16,header+126,w-32,small?10:12,'#f6e0bc',17);}
      else if(s.height<700)this.text(g,'避开紫色弧光 · 接住金色星光与绿色补给',W/2,header+119,small?8:10,'#d3dfcf','center');
      if(!small)this.text(g,'WASD / 方向键移动   ·   Space 射击   ·   P 暂停',W/2,bottom-25,9,'#bbd2c9','center');
    }
    overlay(g,s,W,H,top,bottom,title,subtitle,id,label){g.fillStyle='rgba(9,22,41,.73)';g.fillRect(0,0,W,H);this.text(g,title,W/2,H*.37,clamp(W*.057,22,36),'#f0efda','center',true);this.wrap(g,subtitle,W*.16,H*.37+39,W*.68,11,'#c7dad1',22);this.button(g,id,label,W/2-113,H*.52,226,50,true);this.button(g,'collection','看看月光图鉴',W/2-113,H*.52+64,226,40);}
    collection(g,s,W,H,top,bottom,o={}){
      g.fillStyle='rgba(13,26,48,.94)';g.fillRect(0,0,W,H);const y0=Math.max(top+80,(bottom-H*.12)*.18),cols=W>750?3:2,rows=Math.ceil(ANIMALS.length/cols),gap=12,margin=W>750?W*.14:22,cw=(W-margin*2-gap*(cols-1))/cols,ch=Math.min(180,(bottom-y0-60-gap*(rows-1))/rows);
      this.text(g,'月光图鉴',margin,top+43,27,'#eef0de','left',true);this.text(g,`已珍藏 ${s.collected.length} / 6 位天空的守望者`,margin,top+66,10,'#bdd2ca');this.button(g,'closeCollection','返回',W-80,Math.max(top+18,(o.capsule?.bottom||0)+9),58,38);
      ANIMALS.forEach((a,i)=>{const x=margin+(i%cols)*(cw+gap),y=y0+Math.floor(i/cols)*(ch+gap),found=s.collected.includes(a.id);this.box(g,x,y,cw,ch,10,'rgba(217,227,234,.025)',found?'rgba(215,221,200,.35)':'rgba(212,221,234,.12)');this.animal(g,a.id,x+cw*.5,y+ch*.40,Math.min(cw*.20,ch*.23),a.color,0,!found);this.text(g,found?a.name:'未曾相遇',x+cw*.5,y+ch*.76,14,found?'#ebe8d3':'#819ba4','center',true);this.text(g,found?'已经写进这封来信':'击败后，光会替你记住',x+cw*.5,y+ch*.90,7,found?'#bbd0c0':'#75929b','center');});
      this.text(g,'收藏会留在本机，下次起飞依然在。',W/2,bottom-8,9,'#a8c5ba','center');
    }
    ending(g,s,W,H,D,top,bottom,t){
      const x=W/2,y=H*.52;g.save();const veil=g.createRadialGradient(x,y+8,10,x,y+8,W<600?W*.84:Math.min(W*.49,570));veil.addColorStop(0,'rgba(15,22,48,.38)');veil.addColorStop(.66,'rgba(15,22,48,.17)');veil.addColorStop(1,'rgba(15,22,48,0)');g.fillStyle=veil;g.fillRect(0,H*.28,W,H*.53);g.shadowColor='rgba(6,15,35,.58)';g.shadowBlur=14;g.shadowOffsetY=2;
      this.plane(g,x,H*.76,clamp(D*.032,16,28),Math.sin(t*.2)*.08);this.text(g,'THE LETTER HAS FOUND ITS SKY',x,y-45,8,'#f0e6da','center');this.text(g,'你已抵达，九霄云外。',x,y,clamp(W*.054,22,42),'#fff6e5','center',true);this.text(g,'那封写着勇气的信，终于收到了星空的回信。',x,y+34,W<600?10:13,'#ece1e0','center');this.text(g,`9,000 米 · 珍藏 ${s.collected.length} 位月光伙伴`,x,y+62,10,'#f0e4d5','center');this.button(g,'collection','打开月光图鉴',x-110,bottom-114,220,44,true);this.button(g,'retry','带着星光，再出发',x-110,bottom-58,220,40);g.restore();
    }
  }
  return {WindborneView};
});
