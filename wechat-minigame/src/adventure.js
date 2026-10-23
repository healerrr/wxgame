/* Windborne ascent campaign. Pure deterministic simulation; no rendering APIs. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.WindborneAdventure = api.WindborneAdventure; root.WINDBORNE_CHAPTERS = api.CHAPTERS; root.WINDBORNE_ANIMALS = api.ANIMALS; }
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  const KEY = 'windborne.adventure.v1';
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const number = (n, fallback = 0) => Number.isFinite(Number(n)) ? Number(n) : fallback;
  const copy = value => JSON.parse(JSON.stringify(value));
  const CHAPTERS = Object.freeze([
    {height:0, name:'第一程 · 山谷起风', text:'一封未寄出的信，想看看天空的尽头。', scene:0, weather:'clear', warning:'山口将有一阵风 · 轻轻修正方向'},
    {height:1800, name:'第二程 · 穿过晚霞', text:'把暮色折进信纸，让远方染上一点温柔。', scene:1, weather:'rain', warning:'前方雨幕将至 · 留意蓝色雨滴'},
    {height:3600, name:'第三程 · 风暴来信', text:'有些风很大，但每一次坚持都在靠近晴空。', scene:0, weather:'storm', warning:'雷雨云正在靠近 · 避开雨滴，迎风而上'},
    {height:5400, name:'第四程 · 雪落森林', text:'越过青绿的树梢，雪替世界轻轻盖上被子。', scene:2, weather:'snow', warning:'雪团与横风将至 · 留出躲避空间'},
    {height:7200, name:'第五程 · 星海守望', text:'抬头吧，群星正为这架小飞机让出一条路。', scene:3, weather:'snow', warning:'高空冰雹即将落下 · 躲进星光的空隙'},
    {height:9000, name:'终章 · 信抵达的地方', text:'天空没有尽头，但你已经把勇气送到了。', scene:3, weather:'clear', warning:''}
  ].map(Object.freeze));
  const ANIMALS = Object.freeze([
    {id:'rabbit', name:'月兔', en:'MOON RABBIT', color:'#e8ddf6', description:'住在薄云里，把新月揉成小小的弧光。', hp:8, size:.046},
    {id:'deer', name:'星鹿', en:'STAR DEER', color:'#e6ddb4', description:'鹿角挑起星灯，守望每一架经过的纸飞机。', hp:10, size:.052},
    {id:'whale', name:'云鲸', en:'CLOUD WHALE', color:'#a8d9e6', description:'游过雨层的大鲸，心里藏着一整片晴天。', hp:14, size:.064},
    {id:'fox', name:'雪狐', en:'SNOW FOX', color:'#f1e9e0', description:'把足迹藏进雪花，把温暖留给勇敢的旅人。', hp:10, size:.048},
    {id:'butterfly', name:'月蝶', en:'LUNAR BUTTERFLY', color:'#d7bceb', description:'每一次振翅，都替夜空补上一小块梦。', hp:8, size:.045},
    {id:'falcon', name:'霜隼', en:'FROST FALCON', color:'#b9cee8', description:'穿过冰晶的守望者，只向不放弃的风致意。', hp:12, size:.050}
  ].map(Object.freeze));

  class WindborneAdventure {
    constructor({storage, onEvent = () => {}, seed = 29} = {}) {
      this.storage = storage || null;
      this.onEvent = typeof onEvent === 'function' ? onEvent : () => {};
      this.seed = number(seed, 29) >>> 0;
      this.randomState = this.seed || 29;
      this.width = 390; this.height = 844;
      this.collection = [];
      this.records = {bestHeight:0, wins:0};
      try {
        const raw = this.storage && this.storage.getItem(KEY), saved = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
          this.collection = [...new Set((Array.isArray(saved.collected) ? saved.collected : []).filter(id => ANIMALS.some(animal => animal.id === id)))];
          this.records.bestHeight = clamp(number(saved.records && saved.records.bestHeight), 0, 9000);
          this.records.wins = Math.floor(clamp(number(saved.records && saved.records.wins), 0, 1000000));
        }
      } catch (_) { /* Unavailable storage does not prevent a local campaign. */ }
      this.reset('intro');
    }
    random() {
      this.randomState = (Math.imul(this.randomState, 1664525) + 1013904223) >>> 0;
      return this.randomState / 4294967296;
    }
    reset(phase) {
      this.randomState = this.seed || 29;
      this.nextId = 1;
      this.fireClock = 0;
      this.enemyClock = 2.2;
      this.starClock = 1.0;
      this.saveClock = 0;
      this.eventClock = 12;
      this.enemySerial = 0;
      this.gust = {remaining:0, duration:0, direction:0};
      this.pending = [];
      this.s = {phase, previousPhase:null, hp:100, maxHp:100, height:0, progress:0, elapsed:0, scene:0, chapter:0, chapterName:CHAPTERS[0].name, chapterText:CHAPTERS[0].text, weather:'clear', warning:'', warningAge:0, ammo:24, shotsFired:0, kills:0, runKills:0, collected:this.collection.slice(), records:{...this.records}, player:{x:.5,y:.95,r:.025,invulnerable:6,vx:0,vy:0,bank:0}, bullets:[], enemies:[], hostile:[], pickups:[], particles:[], deathFX:[], wind:0, weatherIntensity:0, autoFire:true, takeoffProgress:0, damageFlash:0, combo:0, boosting:false};
    }
    emit(type, detail = {}) {
      try { this.onEvent({type, height:this.s.height, elapsed:this.s.elapsed, ...copy(detail)}); } catch (_) { /* A presentation callback cannot stop simulation. */ }
    }
    start({restart = false} = {}) {
      if (!restart && (this.s.phase === 'takeoff' || this.s.phase === 'playing' || this.s.phase === 'paused')) return this.getState();
      this.reset('takeoff');
      this.emit('chapter', {chapter:0,name:this.s.chapterName,text:this.s.chapterText});
      return this.getState();
    }
    retry() { return this.start({restart:true}); }
    resize(width, height) {
      this.width = Math.max(1, number(width, this.width));
      this.height = Math.max(1, number(height, this.height));
    }
    pause(paused = true) {
      if (paused && (this.s.phase === 'playing' || this.s.phase === 'takeoff')) { this.s.previousPhase = this.s.phase; this.s.phase = 'paused'; this.s.boosting = false; this.save(); }
      else if (!paused && this.s.phase === 'paused') { this.s.phase = this.s.previousPhase || 'playing'; this.s.previousPhase = null; }
      return this.getState();
    }
    save() {
      this.records.bestHeight = Math.max(this.records.bestHeight, this.s.height);
      this.s.records = {...this.records}; this.s.collected = this.collection.slice();
      try {
        if (!this.storage || typeof this.storage.setItem !== 'function') return false;
        this.storage.setItem(KEY, JSON.stringify({version:1,collected:this.collection,records:this.records}));
        return true;
      } catch (_) { return false; }
    }
    warning(text, kind) {
      if (this.s.warning && this.s.warningAge < 1.8) return false;
      this.s.warning = text; this.s.warningAge = 0;
      this.pending.push({kind, at:this.s.elapsed + 1.8});
      if (this.pending.length > 2) this.pending.shift();
      this.emit('warning', {text,kind});
      return true;
    }
    burst(x, y, color, count = 12) {
      for (let i = 0; i < count; i++) {
        const angle = this.random() * Math.PI * 2, speed = .025 + this.random() * .095;
        this.s.particles.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,age:0,life:.55+this.random()*.55,color,r:.003+this.random()*.003});
      }
      if (this.s.particles.length > 88) this.s.particles.splice(0, this.s.particles.length - 88);
    }
    spawnEnemy() {
      if (this.s.enemies.length >= (this.s.progress < .32 ? 2 : 3)) return;
      const animal = ANIMALS[this.enemySerial % ANIMALS.length], serial = this.enemySerial++;
      const lanes=[.25,.75,.50];
      // Choose a free destination before entering, rather than placing two
      // silhouettes at the same random point and separating them afterward.
      lanes.sort((a,b)=>{
        const gap=x=>this.s.enemies.reduce((d,e)=>Math.min(d,Math.abs(e.baseX-x)),1);
        return gap(b)-gap(a);
      });
      const baseX=lanes[serial%Math.min(lanes.length,Math.max(1,3-this.s.enemies.length))]+(this.random()-.5)*.025;
      const hp=animal.hp+Math.floor(this.s.progress*5),entryDuration=animal.id==='whale'?2.8:animal.id==='butterfly'?1.8:2.1;
      const entryX=serial%2?.96:.04;
      this.s.enemies.push({id:this.nextId++,type:animal.id,name:animal.name,x:entryX,y:-.08,entryX,entryDuration,baseX,targetY:Math.min(.37,Math.max(.24,163/this.height)+this.random()*.065),hp,maxHp:hp,size:animal.size,r:animal.size,phase:'enter',charge:0,age:0,shootAt:entryDuration+1.05+this.random()*.35,phaseOffset:serial*1.7,motion:0,motionPhase:'enter',flapPhase:serial*.7,heading:0,facing:serial%2?-1:1,vx:0,vy:0,flash:0,restUntil:0,aimX:null,aimY:null});
    }
    spawnStar() {
      if (this.s.pickups.length >= 26) return;
      // Alternating routes are wide enough to invite steering without requiring
      // a dangerous rush through a projectile to maintain basic fire.
      this.s.pickups.push({id:this.nextId++,x:.24+this.random()*.52,y:-.035,r:.016,kind:'star',age:0,vx:0,vy:.105,value:12,phase:this.random()*Math.PI*2,carry:0,float:0});
    }
    hazard(kind) {
      const s = this.s;
      if (kind === 'gust' || kind === 'snow') {
        const duration=6+s.progress*1.2;
        this.gust = {remaining:duration,duration,direction:this.random() < .5 ? -1 : 1};
        // Ordinary crosswind only moves the plane. Visible wind ribbons are
        // separate, avoidable collision objects, released after the warning.
        const count=s.progress<.55?3:4,offset=(this.random()-.5)*.06;
        for(let i=0;i<count&&s.hostile.length<64;i++)s.hostile.push({id:this.nextId++,x:.14+i*.72/(count-1)+offset,y:-.06-i*.12,r:.040,kind:'gust',vx:this.gust.direction*(.022+s.progress*.012),vy:.19+s.progress*.035,age:0,damage:5});
        if(kind==='snow'){
          const gap=Math.floor(this.random()*6);
          for(let i=0;i<6&&s.hostile.length<64;i++)if(i!==gap)s.hostile.push({id:this.nextId++,x:.10+i*.16,y:-.16-this.random()*.26,r:.019,kind:'snow',vx:this.gust.direction*.018,vy:.20+s.progress*.025,age:0,damage:7});
        }
        return;
      }
      const hail = kind === 'hail', count=(hail?7:kind==='storm'?7:6)+Math.floor(s.progress*2);
      // Each denser curtain leaves one entire lane open. Staggered rows avoid
      // turning the full width into a simultaneous wall of collision objects.
      const gap=Math.floor(this.random()*(count+1)),spacing=.84/count;
      for (let lane=0;lane<=count;lane++) {
        if(lane===gap)continue;
        if (s.hostile.length >= 64) break;
        s.hostile.push({id:this.nextId++,x:.08+lane*spacing,y:-.055-this.random()*.30,r:hail?.017:.012,kind:hail?'hail':'rain',vx:0,vy:(hail?.26:.31)+s.progress*.035,age:0,damage:hail?12:6});
      }
      if (kind === 'storm') this.hazard('gust');
    }
    collide(a, b, extra = 0) {
      const d = Math.min(this.width,this.height), dx = (a.x-b.x)*this.width/d, dy = (a.y-b.y)*this.height/d;
      return dx*dx + dy*dy < Math.pow((a.r || a.size || 0)+(b.r || b.size || 0)+extra,2);
    }
    bulletHit(bullet, enemy) {
      // Swept vertical collision prevents a fast star from skipping a small
      // animal at a 20fps frame rate.
      const d=Math.min(this.width,this.height),ax=(bullet.previousX===undefined?bullet.x:bullet.previousX)*this.width/d,ay=bullet.previousY*this.height/d,bx=bullet.x*this.width/d,by=bullet.y*this.height/d,ex=enemy.x*this.width/d,ey=enemy.y*this.height/d;
      const vx=bx-ax,vy=by-ay,t=clamp(((ex-ax)*vx+(ey-ay)*vy)/(vx*vx+vy*vy||1),0,1),dx=ax+vx*t-ex,dy=ay+vy*t-ey,r=bullet.r+enemy.size;
      return dx*dx+dy*dy<r*r;
    }
    flyEnemy(enemy,dt) {
      const charging=enemy.age>=enemy.shootAt-.9&&enemy.age<enemy.shootAt,resting=enemy.age<enemy.restUntil;
      if(enemy.age>=enemy.entryDuration)enemy.motion+=dt*(charging?.18:resting?.42:1);
      const t=enemy.motion,entry=clamp(enemy.age/enemy.entryDuration,0,1),u=1-entry;
      let tx=enemy.baseX,ty=enemy.targetY,motion='glide';
      if(entry<1){
        tx=u*u*u*enemy.entryX+3*u*u*entry*(enemy.entryX*.80+.10)+3*u*entry*entry*(enemy.baseX+(enemy.entryX<.5?-.12:.12))+entry*entry*entry*enemy.baseX;
        ty=u*u*u*(-.08)+3*u*u*entry*.07+3*u*entry*entry*(enemy.targetY-.07)+entry*entry*entry*enemy.targetY;motion='enter';
      }else if(enemy.type==='whale'){tx+=Math.sin(t*.34)*.17;ty+=Math.sin(t*.48)*.026;motion='glide';}
      else if(enemy.type==='butterfly'){tx+=Math.sin(t*.92)*.13+Math.sin(t*2.6)*.015;ty+=Math.sin(t*1.65)*.035;motion='flutter';}
      else if(enemy.type==='falcon'){tx+=Math.sin(t*.58)*.18;ty+=(1-Math.cos(t*.96))*.049;motion=Math.sin(t*.96)>0?'swoop':'rise';}
      else if(enemy.type==='deer'){tx+=Math.sin(t*.56)*.14;ty-=Math.pow(Math.sin(t*.94),2)*.038;motion='leap';}
      else if(enemy.type==='fox'){tx+=Math.tanh(Math.sin(t*.72)*2)*.15;ty+=Math.sin(t*1.06)*.021;motion='dart';}
      else{tx+=Math.sin(t*.66)*.13;ty-=Math.pow(Math.sin(t*1.38),2)*.031;motion='bounce';}
      if(entry>=1){
        const floor=Math.min(.35,Math.max(.215,153/this.height));ty=Math.max(floor,ty);
        for(const other of this.s.enemies){
          if(other===enemy||other.age<other.entryDuration)continue;
          const dx=tx-other.x,dy=(ty-other.y)*this.height/this.width,near=Math.hypot(dx,dy);
          if(near<.145){const force=(1-near/.145);tx+=(dx===0?(enemy.id<other.id?-1:1):Math.sign(dx))*force*.055;ty+=(enemy.id<other.id?-1:1)*force*.012;}
        }
      }
      if(enemy.age>26){ty-=(enemy.age-26)*.14;motion='leave';}
      const oldX=enemy.x,oldY=enemy.y,blend=1-Math.exp(-dt*12);
      enemy.x+=(clamp(tx,.07,.93)-enemy.x)*blend;enemy.y+=(ty-enemy.y)*blend;
      enemy.vx=(enemy.x-oldX)/dt;enemy.vy=(enemy.y-oldY)/dt;
      if(Math.abs(enemy.vx)>.009)enemy.facing=enemy.vx<0?-1:1;
      const angle=clamp(Math.atan2(enemy.vy*this.height,Math.max(.07*this.width,Math.abs(enemy.vx)*this.width)),-.5,.5);
      enemy.heading+=(angle-enemy.heading)*(1-Math.exp(-dt*6));
      enemy.flapPhase+=dt*(enemy.type==='butterfly'?9:enemy.type==='falcon'?4:enemy.type==='whale'?1.25:2.7)*(charging?.55:1);
      enemy.motionPhase=motion;enemy.flash=Math.max(0,enemy.flash-dt);
    }
    enemyAttack(enemy) {
      const type=enemy.type,count=(type==='butterfly'?3:type==='whale'||type==='falcon'?2:1)+(this.s.progress>=.4?1:0);
      const speed=(type==='whale'?.15:type==='falcon'?.20:.175)+this.s.progress*.04;
      const targetX=enemy.aimX===null?this.s.player.x:enemy.aimX,targetY=enemy.aimY===null?this.s.player.y:enemy.aimY;
      const aim=clamp((targetX-enemy.x)/Math.max(.20,targetY-enemy.y)*speed,-.09,.09);
      for(let i=0;i<count&&this.s.hostile.length<64;i++){
        const fan=(i-(count-1)/2)*(type==='butterfly'?.055:type==='whale'?.048:.035);
        this.s.hostile.push({id:this.nextId++,x:enemy.x+(i-(count-1)/2)*.017,y:enemy.y+enemy.size*.65,r:.014,kind:'moon',vx:clamp(aim+fan,-.12,.12),vy:speed,age:0,damage:9,source:enemy.type});
      }
      enemy.aimX=null;enemy.aimY=null;enemy.restUntil=enemy.age+.85;enemy.shootAt=enemy.age+3.25-this.s.progress*.65+this.random()*.55;
    }
    hit(amount, kind) {
      if (this.s.player.invulnerable > 0 || this.s.phase !== 'playing') return;
      this.s.hp = Math.max(0,this.s.hp-amount); this.s.player.invulnerable=.85; this.s.damageFlash=.5; this.s.combo=0;
      this.burst(this.s.player.x,this.s.player.y,'#c6dfea',7);
      this.emit('hit',{amount,kind,hp:this.s.hp});
      if (this.s.hp <= 0) {
        this.s.phase='gameover'; this.s.boosting=false; this.save();
        this.emit('gameover',{kills:this.s.kills,collection:this.collection.slice()});
      }
    }
    defeat(enemy) {
      const s = this.s, animal=ANIMALS.find(item=>item.id===enemy.type);
      s.kills++;s.runKills=s.kills;s.combo++;
      let discovered=false;
      if(!this.collection.includes(enemy.type)){this.collection.push(enemy.type);discovered=true;}
      s.collected=this.collection.slice();
      s.pickups.push({id:this.nextId++,x:enemy.x,y:enemy.y,r:.021,kind:'heal',age:0,vx:enemy.vx*.23,vy:.055,value:22,phase:this.random()*Math.PI*2,carry:1,float:0});
      if(this.random()<.62&&s.pickups.length<26)s.pickups.push({id:this.nextId++,x:clamp(enemy.x+.05,.08,.92),y:enemy.y,r:.016,kind:'star',age:0,vx:enemy.vx*.18+.025,vy:.07,value:12,phase:this.random()*Math.PI*2,carry:1,float:0});
      s.deathFX.push({type:enemy.type,x:enemy.x,y:enemy.y,color:animal.color,size:enemy.size,age:0,life:.75,heading:enemy.heading,facing:enemy.facing});if(s.deathFX.length>5)s.deathFX.shift();
      this.burst(enemy.x,enemy.y,animal.color,24);
      this.emit('kill',{animal:enemy.type,name:animal.name,newCollection:discovered,kills:s.kills});
      this.save();
    }
    update(seconds, input = {}) {
      const dt=clamp(number(seconds),0,.05),s=this.s;
      if(dt===0||(s.phase!=='playing'&&s.phase!=='takeoff'))return;
      s.elapsed+=dt;
      if(s.phase==='takeoff'){
        s.takeoffProgress=clamp(s.elapsed/6,0,1);
        const ease=1-Math.pow(1-s.takeoffProgress,3);
        s.player.y=.95-.17*ease;s.player.bank=Math.sin(s.elapsed*1.7)*.05;s.player.invulnerable=Math.max(0,6-s.elapsed);s.height=120*ease;s.progress=s.height/9000;
        if(s.takeoffProgress>=1){s.phase='playing';s.player.invulnerable=1.2;s.player.y=.78;}
        this.records.bestHeight=Math.max(this.records.bestHeight,s.height);s.records={...this.records};
        return;
      }
      let x=clamp(number(input.x),-1,1),y=clamp(number(input.y),-1,1);const length=Math.hypot(x,y);if(length>1){x/=length;y/=length;}
      s.autoFire=input.fire!==false;s.boosting=!!input.boost&&s.ammo>1;
      const maxX=.37*(s.boosting?1.15:1),targetX=x*maxX,targetY=y*.27;
      const soften=(velocity,target)=>velocity+(target-velocity)*(1-Math.exp(-dt/(target===0?.040:velocity*target<0?.075:.10)));
      s.player.vx=soften(s.player.vx,targetX);s.player.vy=soften(s.player.vy,targetY);
      s.player.bank+=(s.player.vx/maxX*.65-s.player.bank)*(1-Math.exp(-dt*10));
      s.player.invulnerable=Math.max(0,s.player.invulnerable-dt);s.damageFlash=Math.max(0,s.damageFlash-dt);
      if(this.gust.remaining>0)this.gust.remaining=Math.max(0,this.gust.remaining-dt);
      const gust=this.gust.remaining>0?Math.sin((1-this.gust.remaining/this.gust.duration)*Math.PI)*this.gust.direction*.95:0;
      s.wind+=(Math.sin(s.elapsed*.19)*.055+gust-s.wind)*Math.min(1,dt*3);
      s.player.x=clamp(s.player.x+(s.player.vx+s.wind*.09)*dt,.055,.945);
      s.player.y=clamp(s.player.y+s.player.vy*dt,.42,.90);
      if(s.boosting)s.ammo=Math.max(0,s.ammo-dt*3);
      s.height=Math.min(9000,s.height+dt*32*(1+s.progress*.10)*(s.boosting?1.25:1));s.progress=s.height/9000;
      this.records.bestHeight=Math.max(this.records.bestHeight,s.height);s.records={...this.records};
      if(s.height>=9000){
        s.phase='victory';s.chapter=5;s.chapterName=CHAPTERS[5].name;s.chapterText=CHAPTERS[5].text;s.weather='clear';s.warning='';s.boosting=false;s.hostile=[];s.bullets=[];s.enemies=[];this.records.wins++;this.save();this.emit('victory',{kills:s.kills,collected:this.collection.slice(),text:s.chapterText});return;
      }
      const chapter=Math.min(4,Math.floor(s.height/1800));
      if(chapter!==s.chapter){
        s.chapter=chapter;const next=CHAPTERS[chapter];s.chapterName=next.name;s.chapterText=next.text;s.scene=next.scene;s.weather=next.weather;
        // No old weather projectile crosses invisibly into the new chapter.
        s.hostile=[];this.pending=[];s.warning='';this.enemyClock=Math.max(this.enemyClock,3.0);
        for(const enemy of s.enemies){enemy.shootAt=Math.max(enemy.shootAt,enemy.age+2.8);enemy.aimX=null;enemy.aimY=null;enemy.restUntil=enemy.age+1.4;}
        this.warning(next.warning,chapter===4?'hail':chapter===3?'snow':chapter===2?'storm':'rain');
        this.emit('chapter',{chapter,name:next.name,text:next.text});this.save();
      }
      const weatherTarget=s.weather==='clear'?0:s.weather==='storm'?.94:s.weather==='snow'?.72:.58;
      s.weatherIntensity+=(weatherTarget-s.weatherIntensity)*(1-Math.exp(-dt*.75));
      if(s.warning){s.warningAge+=dt;if(s.warningAge>3.6)s.warning='';}
      for(let i=this.pending.length-1;i>=0;i--)if(s.elapsed+1e-9>=this.pending[i].at){const event=this.pending.splice(i,1)[0];this.hazard(event.kind);}
      this.eventClock-=dt;
      if(this.eventClock<=0&&!s.warning){
        const kind=chapter===4?'hail':chapter===3?'snow':chapter===2?'storm':chapter===1?'rain':'gust';
        const text=kind==='hail'?'冰雹将在前方落下 · 先看清空隙':kind==='rain'?'连续雨幕将至 · 找到雨滴间的空隙':kind==='storm'?'雷雨与阵风将至 · 稳住方向':kind==='snow'?'雪团与阵风将至 · 留出躲避空间':'山谷阵风将至 · 轻轻修正方向';
        this.warning(text,kind);this.eventClock=13-s.progress*3+this.random()*4;
      }
      this.fireClock-=dt;
      if(s.autoFire&&this.fireClock<=0&&s.bullets.length<24){
        const powered=s.ammo>=1;if(powered)s.ammo=Math.max(0,s.ammo-1);
        s.bullets.push({id:this.nextId++,x:s.player.x,y:s.player.y-.035,previousX:s.player.x,previousY:s.player.y-.035,originX:s.player.x,r:powered?.009:.0065,damage:powered?2:1,kind:powered?'star':'wind',vx:s.player.vx*.025,vy:-1.02});s.shotsFired++;this.fireClock=.20;
      }
      this.enemyClock-=dt;
      if(this.enemyClock<=0){this.spawnEnemy();this.enemyClock=4.8-s.progress*1.5+this.random()*1.2;}
      this.starClock-=dt;
      if(this.starClock<=0){this.spawnStar();this.starClock=2.0+this.random()*.75;}
      for(const enemy of s.enemies){
        enemy.age+=dt;this.flyEnemy(enemy,dt);
        enemy.charge=clamp(1-(enemy.shootAt-enemy.age)/.9,0,1);
        enemy.phase=enemy.age<enemy.entryDuration?'enter':enemy.age>26?'leave':enemy.charge>0?'charge':enemy.age<enemy.restUntil?'rest':'glide';
        if(enemy.phase==='leave')continue;
        if(enemy.charge>0&&enemy.aimX===null){enemy.aimX=s.player.x;enemy.aimY=s.player.y;}
        if(enemy.age>=enemy.shootAt&&s.hostile.length<64){this.enemyAttack(enemy);enemy.charge=0;enemy.phase='rest';}
      }
      s.enemies=s.enemies.filter(enemy=>enemy.age<31&&enemy.y>-.16);
      for(const bullet of s.bullets){
        bullet.previousX=bullet.x;bullet.previousY=bullet.y;
        const cone=bullet.kind==='star'?.15:.075;
        const target=s.enemies.filter(enemy=>enemy.hp>0&&enemy.y<bullet.y&&Math.abs(enemy.x-bullet.originX)<=cone&&Math.abs(enemy.x-bullet.x)<=cone).sort((a,b)=>Math.abs(a.x-bullet.x)-Math.abs(b.x-bullet.x))[0];
        const aim=target?clamp((target.x-bullet.x)*2.5,bullet.kind==='star'?-.18:-.045,bullet.kind==='star'?.18:.045):0;
        bullet.vx+=(aim-bullet.vx)*(1-Math.exp(-dt*(bullet.kind==='star'?7:4)));bullet.x+=bullet.vx*dt;bullet.y+=bullet.vy*dt;
      }
      for(const bullet of s.bullets){
        if(bullet.used)continue;
        const enemy=s.enemies.find(enemy=>enemy.hp>0&&this.bulletHit(bullet,enemy));
        if(enemy){bullet.used=true;enemy.hp=Math.max(0,enemy.hp-bullet.damage);enemy.flash=.16;this.burst(bullet.x,enemy.y,'#f5e4b2',4);if(enemy.hp<=0)this.defeat(enemy);}
      }
      s.bullets=s.bullets.filter(bullet=>!bullet.used&&bullet.y>-.08);s.enemies=s.enemies.filter(enemy=>enemy.hp>0);
      for(const projectile of s.hostile){
        projectile.age+=dt;projectile.x+=(projectile.vx+(projectile.kind==='moon'?0:s.wind*.045))*dt;projectile.y+=projectile.vy*dt;
        if(this.collide(projectile,s.player)){projectile.used=true;this.hit(projectile.damage,projectile.kind);if(s.phase==='gameover')return;}
      }
      s.hostile=s.hostile.filter(projectile=>!projectile.used&&projectile.age<12&&projectile.y<1.10&&projectile.x>-.10&&projectile.x<1.10);
      for(const pickup of s.pickups){
        pickup.age+=dt;pickup.carry=Math.max(0,1-pickup.age/.6);pickup.float=Math.sin(pickup.age*2.4+pickup.phase)*.006;
        const dx=s.player.x-pickup.x,dy=s.player.y-pickup.y,near=Math.hypot(dx,dy),reach=pickup.kind==='heal'?.14:.13;
        const magnet=near<reach?1-near/reach:0,drag=1-Math.exp(-dt*8),desiredX=magnet>0?clamp(dx*7,-.42,.42):Math.sin(pickup.age*1.6+pickup.phase)*.006;
        const desiredY=magnet>0?clamp(dy*7,-.34,.48):pickup.kind==='heal'?.12:.105;
        pickup.vx+=(desiredX-(pickup.vx||0))*drag;pickup.vy+=(desiredY-pickup.vy)*drag;pickup.x+=pickup.vx*dt;pickup.y+=pickup.vy*dt;
        if(this.collide(pickup,s.player,.009)){
          pickup.used=true;
          if(pickup.kind==='heal')s.hp=Math.min(s.maxHp,s.hp+22);else s.ammo=Math.min(100,s.ammo+12);
          this.burst(pickup.x,pickup.y,pickup.kind==='heal'?'#b9ecd0':'#ffe4a0',10);this.emit('pickup',{kind:pickup.kind,value:pickup.kind==='heal'?22:12,hp:s.hp,ammo:s.ammo});
        }
      }
      s.pickups=s.pickups.filter(pickup=>!pickup.used&&pickup.y<1.08&&pickup.age<14).slice(-28);
      for(const particle of s.particles){particle.age+=dt;particle.x+=particle.vx*dt;particle.y+=particle.vy*dt;}
      s.particles=s.particles.filter(particle=>particle.age<particle.life);
      for(const effect of s.deathFX)effect.age+=dt;s.deathFX=s.deathFX.filter(effect=>effect.age<effect.life);
      this.saveClock+=dt;if(this.saveClock>=8){this.saveClock=0;this.save();}
    }
    entities() { return copy({player:this.s.player,bullets:this.s.bullets,enemies:this.s.enemies,hostile:this.s.hostile,pickups:this.s.pickups,particles:this.s.particles,deathFX:this.s.deathFX}); }
    getState() { return copy(this.s); }
  }
  WindborneAdventure.CHAPTERS=CHAPTERS;WindborneAdventure.ANIMALS=ANIMALS;WindborneAdventure.STORAGE_KEY=KEY;
  return {WindborneAdventure,CHAPTERS,ANIMALS};
});
