/* Fine rain, drifting snow and quiet local lightning, shared with native Canvas. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WindborneWeather = api.WindborneWeather;
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  const TAU = Math.PI * 2;
  // Fixed pools: at most 450 decorative particles across a weather crossfade.
  // Mature rain/storm draws at most 260 streaks; mature snow at most 190 flakes.
  const MAX_RAIN=260,MAX_SNOW=190,CALM_DENSITY=.66;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const seed = number => { const v = Math.sin(number * 127.1 + 23.43) * 43758.5453123; return v - Math.floor(v); };
  const color = (hex, alpha) => {
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + clamp(alpha, 0, 1) + ')';
  };
  const PALETTES = [
    {rain:'#bcdedb', snow:'#eff4e9', cloud:'#213d50', glow:'#d7eeef', mist:'#8cbbbd'},
    {rain:'#f3ddcd', snow:'#fff0d9', cloud:'#55465c', glow:'#ffe3c3', mist:'#d5afa4'},
    {rain:'#c4dfc8', snow:'#f1f2da', cloud:'#1c443f', glow:'#e8efd1', mist:'#96beb0'},
    {rain:'#d0c9ec', snow:'#efe4f6', cloud:'#302744', glow:'#e3d6ff', mist:'#a596c4'}
  ];
  const LABELS = {clear:'晴光', rain:'山间细雨', snow:'漫天轻雪', storm:'远山雷雨'};
  const CYCLES = [
    ['rain','clear','storm','clear','snow'],
    ['clear','rain','clear','snow','storm'],
    ['rain','clear','storm','rain','snow'],
    ['snow','clear','rain','storm','snow']
  ];

  class WindborneWeather {
    constructor(createCanvas) {
      this.createCanvas = createCanvas;
      this.clouds = new Map();
      this.weatherTime = 0;
      this.weatherAge = 0;
      this.scene = -1;
      this.mode = '';
      this.kind = 'clear';
      this.weights = {rain:0, snow:0, storm:0};
      this.wind = 0;
      this.width = 390;
      this.height = 844;
      this.quality = 1;
      this.calm = false;
      this.speed = 1;
      this.thunderCount = 0;
      this.bolt = null;
      this.nextBolt = Infinity;
      this.rain = Array.from({length:MAX_RAIN}, (_, i) => ({x:seed(i * 2 + 7),y:seed(i * 2 + 8),depth:.22 + seed(i + 700) * .78,phase:seed(i + 240) * TAU}));
      this.snow = Array.from({length:MAX_SNOW}, (_, i) => ({x:seed(i * 2 + 370),y:seed(i * 2 + 371),depth:.15 + seed(i + 900) * .85,phase:seed(i + 540) * TAU,angle:seed(i + 320) * TAU}));
      this.precipitation = 0;
    }
    choose(kind) {
      if (kind === this.kind) return;
      this.kind = kind;
      this.bolt = null;
      this.nextBolt = kind === 'storm' ? this.weatherTime + 3 : Infinity;
    }
    update(dt, options = {}) {
      const elapsed = clamp(Number(dt) || 0, 0, 3) / 60;
      this.weatherTime += elapsed;
      this.width = Math.max(1, Number(options.width) || this.width);
      this.height = Math.max(1, Number(options.height) || this.height);
      this.quality = clamp(options.quality === undefined ? 1 : options.quality, .3, 1);
      this.speed = clamp(Number(options.speed) || 1, .4, 3);
      this.calm = !!options.calm;
      const scene = clamp(options.scene | 0, 0, 3);
      const mode = ['auto','clear','rain','snow','storm'].includes(options.mode) ? options.mode : 'auto';
      if (scene !== this.scene || mode !== this.mode) {
        this.scene = scene; this.mode = mode; this.weatherAge = 0;
        this.choose(mode === 'auto' ? CYCLES[scene][0] : mode);
      }
      if (mode === 'auto') {
        this.weatherAge += elapsed;
        const cycle = CYCLES[scene];
        this.choose(cycle[Math.floor(this.weatherAge / 48) % cycle.length]);
      }
      const smooth = 1 - Math.exp(-elapsed * 1.65);
      for (const kind of ['rain','snow','storm']) this.weights[kind] += ((this.kind === kind ? 1 : 0) - this.weights[kind]) * smooth;
      const windTarget = clamp(Math.sin(this.weatherTime * .12 + scene) * (.085+this.weights.snow*.035) + (this.weights.storm * .18), -.25, .25);
      this.wind += (windTarget - this.wind) * smooth;
      if (this.calm) { this.bolt = null; if (this.nextBolt < this.weatherTime + 2) this.nextBolt = this.weatherTime + 2; }
      if (elapsed > 0 && !this.calm && this.kind === 'storm' && this.weights.storm > .35 && this.weatherTime >= this.nextBolt) this.lightning();
      if (this.bolt && this.weatherTime - this.bolt.time > .70) this.bolt = null;
      const movement = elapsed * 60, gentle = this.calm ? .58 : 1;
      const rainWeight = this.weights.rain + this.weights.storm;
      for (const p of this.rain) {
        const fall = (.0038 + p.depth * .0080) * (1 + this.weights.storm*.22) * (1 + (this.speed - 1) * .17) * gentle * movement;
        p.y += fall; p.x += (this.wind * .011 + .0011) * p.depth * gentle * movement;
        if (p.y > 1.06) {p.y -= 1.14;p.x = (p.x + .381966) % 1;}
        if (p.x > 1.05) p.x -= 1.1; else if (p.x < -.05) p.x += 1.1;
      }
      for (const p of this.snow) {
        p.y += (.00038 + p.depth * .00138) * gentle * movement;
        p.x += (Math.sin(this.weatherTime * .42 + p.phase) * .00045 + this.wind * .0036) * p.depth * gentle * movement;
        p.angle += .0014 * gentle * movement * (p.depth - .35);
        if (p.y > 1.04) {p.y -= 1.10;p.x = (p.x + .618034) % 1;}
        if (p.x > 1.05) p.x -= 1.1; else if (p.x < -.05) p.x += 1.1;
      }
      const density = this.quality * (this.calm ? CALM_DENSITY : 1);
      this.precipitation = Math.round(this.rain.length * density * rainWeight + this.snow.length * density * this.weights.snow);
      return this.report();
    }
    lightning() {
      this.thunderCount++;
      const serial = this.thunderCount, x = .23 + seed(serial * 13 + this.scene * 21) * .56;
      let px = x, py = .055 + seed(serial * 7) * .035;
      const points = [{x:px,y:py}], branches = [];
      for (let i = 0; i < 8; i++) {
        px += (seed(serial * 51 + i) - .5) * .05;
        py += .023 + seed(serial * 39 + i) * .009;
        points.push({x:px,y:py});
        if (i === 2 || i === 4) {
          const direction = i === 2 ? -1 : 1;
          branches.push([{x:px,y:py},{x:px + direction * .025,y:py + .014},{x:px + direction * .04,y:py + .049},{x:px + direction * .058,y:py + .061}]);
        }
      }
      this.bolt = {time:this.weatherTime,points,branches,x,y:.20};
      this.nextBolt = this.weatherTime + 8 + seed(serial + 75) * 6;
    }
    cloud(scene) {
      if (this.clouds.has(scene)) return this.clouds.get(scene);
      if (!this.createCanvas) return null;
      const canvas = this.createCanvas(420, 150); canvas.width = 420; canvas.height = 150;
      const ctx = canvas.getContext('2d'), c = PALETTES[scene];
      for (let i = 0; i < 11; i++) {
        const radius = 42 + seed(i + 56) * 16;
        ctx.save();ctx.translate(75 + i * 27, 75 + Math.sin(i * 1.1) * 9);ctx.scale(1.2,.65);
        const gradient = ctx.createRadialGradient(0,0,0,0,0,radius);
        gradient.addColorStop(0,color(c.cloud,.24));gradient.addColorStop(.55,color(c.cloud,.14));gradient.addColorStop(1,color(c.cloud,0));
        ctx.fillStyle=gradient;ctx.fillRect(-radius,-radius,radius*2,radius*2);ctx.restore();
      }
      this.clouds.set(scene,canvas);return canvas;
    }
    background(ctx, options = {}) {
      const W = options.width || this.width, H = options.height || this.height, D = Math.min(W,H), c = PALETTES[this.scene < 0 ? 0 : this.scene];
      const wet = this.weights.rain + this.weights.storm, storm = this.weights.storm, snow = this.weights.snow;
      if (wet + snow < .006) return;
      ctx.save();
      const cover = ctx.createLinearGradient(0,0,0,H*.7);
      cover.addColorStop(0,color(c.cloud,wet*.09+storm*.20+snow*.024));cover.addColorStop(.50,color(c.cloud,storm*.065));cover.addColorStop(1,color(c.cloud,0));
      ctx.fillStyle=cover;ctx.fillRect(0,0,W,H*.7);
      const cloud = this.cloud(this.scene < 0 ? 0 : this.scene);
      if (cloud && wet > .01) {
        ctx.globalAlpha=wet*.56+storm*.40;
        for(let i=0;i<(storm>.2?5:4);i++) {
          const width=W*(.66+seed(i+37)*.36), x=W*((i*.31+this.weatherTime*.0014) % 1.65-.25), y=H*(.03+i*.045);
          ctx.drawImage(cloud,x-width*.25,y,width,width*150/420);
        }
        ctx.globalAlpha=1;
      }
      const mist=ctx.createLinearGradient(0,H*.36,0,H*.86);
      mist.addColorStop(0,color(c.mist,0));mist.addColorStop(.46,color(c.mist,wet*.063+snow*.040));mist.addColorStop(1,color(c.mist,0));
      ctx.fillStyle=mist;ctx.fillRect(0,H*.36,W,H*.5);
      this.drawRain(ctx,W,H,c, true);
      this.drawWind(ctx,W,H,c);
      if (this.bolt && !this.calm) {
        const age=this.weatherTime-this.bolt.time;
        // A single long, gentle discharge. Light is confined to its cloud;
        // no full-screen white flash and no rapid strobe sequence.
        const light=Math.sin(clamp(age/.70,0,1)*Math.PI)*Math.exp(-age*.8), bx=this.bolt.x*W, by=this.bolt.y*H, radius=D*.27;
        const glow=ctx.createRadialGradient(bx,by,0,bx,by,radius);
        glow.addColorStop(0,color(c.glow,light*.19));glow.addColorStop(.35,color(c.glow,light*.065));glow.addColorStop(1,color(c.glow,0));
        ctx.fillStyle=glow;ctx.fillRect(bx-radius,by-radius,radius*2,radius*2);
        const draw=(points,alpha,width)=>{ctx.strokeStyle=color(c.glow,light*alpha);ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x*W,p.y*H):ctx.moveTo(p.x*W,p.y*H));ctx.stroke();};
        draw(this.bolt.points,.19,5);draw(this.bolt.points,.75,1.0);
        for(const branch of this.bolt.branches)draw(branch,.40,.65);
      }
      ctx.restore();
    }
    drawWind(ctx,W,H,c) {
      // Diffuse trailing filaments give the weather a crosswind direction.
      // Their low contrast and open shape differ from the game's hitable cells.
      const strength=this.weights.storm+this.weights.snow*.32;
      if(this.calm||strength<.03)return;
      const direction=this.wind<0?-1:1;
      ctx.save();ctx.lineCap='round';
      for(let i=0;i<6;i++){
        const progress=(this.weatherTime*(.085+seed(i+83)*.055)+seed(i+121))%1;
        const x=(direction>0?-.22+progress*1.44:1.22-progress*1.44)*W,y=H*(.31+seed(i+51)*.46)+Math.sin(this.weatherTime*.31+i)*H*.010;
        const span=W*(.12+seed(i+44)*.16)*direction,fade=Math.sin(progress*Math.PI),bend=H*(.008+seed(i+17)*.009);
        for(let strand=0;strand<2;strand++){
          ctx.strokeStyle=color(c.rain,strength*fade*(strand?.030:.060));ctx.lineWidth=strand?.65:1.0;
          const yy=y+strand*3;ctx.beginPath();ctx.moveTo(x-span,yy+bend);ctx.bezierCurveTo(x-span*.65,yy-bend,x-span*.27,yy+bend*.25,x,yy);ctx.stroke();
        }
      }
      ctx.restore();
    }
    drawRain(ctx,W,H,c,far) {
      const weight=this.weights.rain+this.weights.storm;
      if(weight<.006)return;
      const count=Math.floor(this.rain.length*this.quality*(this.calm?CALM_DENSITY:1)), drift=.20+this.wind*2.75+this.weights.storm*.12;
      for(let layer=0;layer<3;layer++){
        const depth=.25+layer*.32;
        ctx.strokeStyle=color(c.rain,weight*(far?.065:.110+layer*.070+this.weights.storm*.045));ctx.lineWidth=layer===2?.90:.55;ctx.lineCap='round';ctx.beginPath();
        for(let i=0;i<count;i++){
          const p=this.rain[i];if(Math.min(2,Math.floor((p.depth-.22)/.26))!==layer||(far?p.depth>.43:p.depth<=.43))continue;
          const x=p.x*W,y=p.y*H, length=(5+H*.020*p.depth)*(1+this.weights.storm*.45);
          ctx.moveTo(x,y);ctx.lineTo(x-length*drift,y-length);
        }
        ctx.stroke();
      }
    }
    foreground(ctx, options = {}) {
      const W=options.width||this.width,H=options.height||this.height,D=Math.min(W,H),c=PALETTES[this.scene<0?0:this.scene];
      if(this.weights.rain+this.weights.storm+this.weights.snow<.006)return;
      ctx.save();
      this.drawRain(ctx,W,H,c,false);
      const wet=this.weights.rain+this.weights.storm;
      if(wet>.02){
        // Tiny rings on the lower water, with staggered, slow lifetimes.
        ctx.lineWidth=.65;
        for(let i=0;i<18;i++){
          const age=(this.weatherTime*.63+seed(i+52))%1,x=W*(.10+seed(i+7)*.80),y=H*(.73+seed(i+9)*.24),radius=(2+age*8)*(.55+y/H*.5);
          ctx.strokeStyle=color(c.rain,Math.sin(age*Math.PI)*wet*.12);ctx.beginPath();ctx.ellipse(x,y,radius,radius*.25,0,0,TAU);ctx.stroke();
        }
      }
      const snow=this.weights.snow;
      if(snow>.006){
        const count=Math.floor(this.snow.length*this.quality*(this.calm?CALM_DENSITY:1));
        for(let i=0;i<count;i++){
          const p=this.snow[i],x=p.x*W+Math.sin(this.weatherTime*.26+p.phase)*D*.012*p.depth,y=p.y*H;
          const r=.55+p.depth*p.depth*2.4,alpha=snow*(.15+p.depth*.50);
          ctx.fillStyle=color(c.snow,alpha);ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();
          if(i%19===0&&p.depth>.58){
            // An occasional larger six-armed crystal catches the near light.
            const span=r*2.7;ctx.save();ctx.translate(x,y);ctx.rotate(p.angle);ctx.strokeStyle=color(c.snow,alpha*.72);ctx.lineWidth=.65;ctx.beginPath();
            for(let arm=0;arm<6;arm++){
              const a=arm*TAU/6,ex=Math.cos(a)*span,ey=Math.sin(a)*span;ctx.moveTo(0,0);ctx.lineTo(ex,ey);
              const bx=ex*.58,by=ey*.58;ctx.moveTo(bx+Math.cos(a-.8)*span*.30,by+Math.sin(a-.8)*span*.30);ctx.lineTo(bx,by);ctx.lineTo(bx+Math.cos(a+.8)*span*.30,by+Math.sin(a+.8)*span*.30);
            }
            ctx.stroke();ctx.restore();
          }
        }
      }
      ctx.restore();
    }
    report() {
      return {kind:this.kind,label:LABELS[this.kind],intensity:clamp(this.weights.rain+this.weights.snow+this.weights.storm,0,1),wind:this.wind,precipitation:this.precipitation,lightning:!!this.bolt&&!this.calm,thunderCount:this.thunderCount,weatherTime:this.weatherTime};
    }
  }
  return {WindborneWeather};
});
