'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {WindborneAdventure,CHAPTERS,ANIMALS}=require('../dist/adventure');

function runtime(options={}){
  const values=new Map(),events=[];
  const storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
  const game=new WindborneAdventure({storage,onEvent:event=>events.push(event),...options});
  const frames=(count,input={})=>{for(let i=0;i<count;i++)game.update(.05,input);};
  const takeoff=()=>{game.start();for(let i=0;i<130&&game.getState().phase==='takeoff';i++)game.update(.05);assert.equal(game.getState().phase,'playing');};
  return {game,values,events,storage,frames,takeoff};
}
function hunt(state){
  const target=state.pickups.filter(p=>p.kind==='heal'&&state.hp<95&&p.y>.45).sort((a,b)=>b.y-a.y)[0]||state.enemies[0];
  return {x:target?Math.max(-1,Math.min(1,(target.x-state.player.x)*9)):0,fire:true};
}

test('ground takeoff is protected, lasts six seconds and safely enters the ascent',()=>{
  const g=runtime();const intro=g.game.getState();g.frames(30);assert.deepEqual(g.game.getState(),intro);
  g.game.start();g.frames(60,{x:1,y:-1});
  const half=g.game.getState();assert.equal(half.phase,'takeoff');assert.ok(half.player.y<.95&&half.player.y>.78);assert.ok(half.player.invulnerable>0);assert.equal(half.hostile.length,0);assert.equal(half.shotsFired,0);assert.equal(half.hp,100);
  g.frames(62);const flight=g.game.getState();assert.equal(flight.phase,'playing');assert.equal(flight.takeoffProgress,1);assert.ok(flight.height>=120);assert.ok(flight.player.invulnerable>0);
});

test('real four-direction input is bounded and pause freezes every simulation clock',()=>{
  const g=runtime();g.takeoff();g.frames(15,{x:-1,y:-1,fire:false});
  const moved=g.game.getState();assert.ok(moved.player.x<.5);assert.ok(moved.player.y<.78);
  g.game.pause(true);const paused=g.game.getState();g.frames(300,{x:1,y:1,boost:true});assert.deepEqual(g.game.getState(),paused);
  g.game.pause(false);g.frames(100,{x:1,y:1,fire:false});const edge=g.game.getState();assert.equal(edge.player.x,.945);assert.equal(edge.player.y,.90);assert.ok(edge.height>moved.height);
  const zero=g.game.getState();g.game.update(0);g.game.update(-1);g.game.update(Infinity);assert.deepEqual(g.game.getState(),zero);
});

test('star ammunition upgrades automatic fire and basic wind shots remain available when empty',()=>{
  const g=runtime();g.takeoff();g.frames(10,{fire:false});assert.equal(g.game.getState().shotsFired,0);
  g.frames(1);let state=g.game.getState();assert.equal(state.shotsFired,1);assert.equal(state.ammo,23);assert.equal(state.bullets[0].kind,'star');assert.equal(state.bullets[0].damage,2);
  let basic=false;
  for(let i=0;i<200&&!basic;i++){g.game.update(.05,{x:0,y:0,fire:true,boost:true});state=g.game.getState();basic=state.bullets.some(b=>b.kind==='wind'&&b.damage===1);}
  assert.equal(basic,true);assert.ok(state.shotsFired>10);assert.ok(state.ammo>=0&&state.ammo<=100);
  const stopped=state.shotsFired;g.frames(12,{fire:false});assert.equal(g.game.getState().shotsFired,stopped);
});

test('purple moon attacks cause real HP loss with an invulnerability window',()=>{
  const g=runtime();g.takeoff();let firstHit;
  for(let i=0;i<1200;i++){
    g.game.update(.05,{fire:false});firstHit=g.events.find(event=>event.type==='hit');if(firstHit)break;
  }
  assert.ok(firstHit);assert.equal(firstHit.kind,'moon');assert.equal(firstHit.amount,9);assert.equal(firstHit.hp,91);
  const health=g.game.getState().hp;g.frames(10,{fire:false});assert.equal(g.game.getState().hp,health);assert.ok(g.game.getState().player.invulnerable>0);
});

test('defeated animals drop 22-HP healing orbs, and kills enter the persistent collection',()=>{
  const g=runtime();g.takeoff();
  for(let i=0;i<1000&&!g.events.some(e=>e.type==='hit');i++)g.game.update(.05,{fire:false});
  assert.ok(g.game.getState().hp<100);
  let killed=false,healed=false;
  for(let i=0;i<1700&&!healed;i++){
    const before=g.game.getState(),killCount=before.kills;g.game.update(.05,hunt(before));const state=g.game.getState();
    if(state.kills>killCount){killed=true;assert.ok(state.pickups.some(p=>p.kind==='heal'&&p.value===22));}
    healed=g.events.some(event=>event.type==='pickup'&&event.kind==='heal');
  }
  assert.equal(killed,true);assert.equal(healed,true);const pickup=g.events.find(e=>e.type==='pickup'&&e.kind==='heal');assert.equal(pickup.value,22);assert.ok(pickup.hp>91);assert.ok(g.game.getState().collected.length>0);
  const stored=JSON.parse(g.values.get(WindborneAdventure.STORAGE_KEY));assert.ok(stored.collected.length>0);assert.equal('player'in stored,false);assert.equal('phase'in stored,false);
  const restored=new WindborneAdventure({storage:g.storage});const fresh=restored.getState();assert.equal(fresh.phase,'intro');assert.equal(fresh.height,0);assert.deepEqual(fresh.collected,g.game.getState().collected);assert.ok(fresh.records.bestHeight>0);
  g.game.retry();const retry=g.game.getState();assert.equal(retry.phase,'takeoff');assert.equal(retry.hp,100);assert.equal(retry.kills,0);assert.equal(retry.bullets.length,0);assert.equal(retry.hostile.length,0);assert.deepEqual(retry.collected,fresh.collected);
});

test('the first dangerous rain is preceded by its visible warning by at least 1.8 seconds',()=>{
  const g=runtime();g.game.start();let warning=null,appeared=null;
  for(let i=0;i<1900&&!appeared;i++){
    const state=g.game.getState();g.game.update(.05,{x:Math.sin(state.elapsed*1.05)>0?1:-1,fire:true});
    warning=warning||g.events.find(e=>e.type==='warning'&&e.kind==='rain');const after=g.game.getState();
    if(after.hostile.some(projectile=>projectile.kind==='rain'))appeared=after;
  }
  assert.ok(warning);assert.ok(appeared);assert.equal(appeared.chapter,1);assert.equal(appeared.weather,'rain');assert.ok(appeared.elapsed-warning.elapsed>=1.8-1e-8);
});

test('a natural complete campaign visits every chapter, unlocks all animals and ends once',()=>{
  const g=runtime();g.game.start();let peakEntities=0;
  for(let i=0;i<7200;i++){
    const s=g.game.getState();if(s.phase==='victory'||s.phase==='gameover')break;
    peakEntities=Math.max(peakEntities,s.bullets.length+s.enemies.length+s.hostile.length+s.pickups.length+s.particles.length);
    g.game.update(.05,{x:Math.sin(s.elapsed*1.05)>0?1:-1,fire:true});
  }
  const end=g.game.getState();assert.equal(end.phase,'victory');assert.equal(end.height,9000);assert.equal(end.progress,1);assert.ok(end.hp>0);assert.equal(end.collected.length,ANIMALS.length);assert.ok(end.kills>25);assert.ok(peakEntities<250);
  assert.deepEqual(g.events.filter(e=>e.type==='chapter').map(e=>e.chapter),[0,1,2,3,4]);assert.equal(end.chapterName,CHAPTERS.at(-1).name);assert.equal(end.records.wins,1);assert.equal(end.records.bestHeight,9000);assert.equal(end.hostile.length,0);assert.equal(end.enemies.length,0);
  g.frames(200);assert.deepEqual(g.game.getState(),end);assert.equal(g.events.filter(e=>e.type==='victory').length,1);
  assert.equal(JSON.parse(g.values.get(WindborneAdventure.STORAGE_KEY)).records.wins,1);
});

test('zero HP ends combat and retry starts a fresh attempt while retaining records',()=>{
  const g=runtime();g.takeoff();
  for(let i=0;i<2200&&g.game.getState().phase==='playing';i++)g.game.update(.05,{fire:false});
  const end=g.game.getState();assert.equal(end.phase,'gameover');assert.equal(end.hp,0);assert.equal(g.events.filter(e=>e.type==='gameover').length,1);assert.ok(end.records.bestHeight>1000);
  g.frames(60,{fire:true});assert.deepEqual(g.game.getState(),end);g.game.retry();const retry=g.game.getState();assert.equal(retry.hp,100);assert.equal(retry.height,0);assert.equal(retry.elapsed,0);assert.equal(retry.records.bestHeight,end.records.bestHeight);
});

test('seeded runs are reproducible and returned state cannot mutate the simulation',()=>{
  const a=runtime(),b=runtime();a.game.start();b.game.start();
  for(let i=0;i<800;i++){const input={x:Math.sin(i*.035),y:Math.cos(i*.02)*.2,fire:true};a.game.update(.05,input);b.game.update(.05,input);}
  assert.deepEqual(a.game.getState(),b.game.getState());const before=a.game.getState(),snapshot=a.game.getState();snapshot.player.x=99;snapshot.enemies.length=0;snapshot.collected.push('fake');snapshot.records.wins=99;
  const entities=a.game.entities();entities.player.y=-99;assert.deepEqual(a.game.getState(),before);
});

test('damaged or unavailable storage remains playable and ignores invented collection IDs',()=>{
  for(const raw of ['{bad','null','[]',JSON.stringify({collected:['rabbit','fake','rabbit'],records:{bestHeight:Infinity,wins:-99}})]){
    const game=new WindborneAdventure({storage:{getItem:()=>raw,setItem(){throw Error('full');}}});assert.equal(game.getState().phase,'intro');assert.ok(game.getState().collected.every(id=>ANIMALS.some(animal=>animal.id===id)));game.start();game.update(.05);assert.equal(game.getState().phase,'takeoff');assert.equal(game.save(),false);
  }
});

test('visible gust ribbons arrive after a warning and cause a separate five-HP hit',()=>{
  const g=runtime();g.game.start();let firstGust=null;
  for(let i=0;i<1000;i++){
    const state=g.game.getState(),gust=state.hostile.filter(item=>item.kind==='gust').sort((a,b)=>b.y-a.y)[0];
    if(gust&&firstGust===null)firstGust=state.elapsed;
    // Clear the opening animals first, then deliberately intercept the visible
    // wind ribbon so an unrelated moon hit cannot mask it with invulnerability.
    const target=gust||state.enemies[0];
    g.game.update(.05,{x:target?Math.max(-1,Math.min(1,(target.x-state.player.x)*9)):0,y:Math.max(-1,Math.min(1,(.62-state.player.y)*8)),fire:true});
    if(g.events.some(event=>event.type==='hit'&&event.kind==='gust'))break;
  }
  const warning=g.events.find(event=>event.type==='warning'&&event.kind==='gust'),hit=g.events.find(event=>event.type==='hit'&&event.kind==='gust');
  assert.ok(warning);assert.ok(firstGust-warning.elapsed>=1.8-1e-6,'Wind hazards must give time to react');
  assert.ok(hit,'Deliberately moving into a visible wind ribbon must have a real effect');assert.equal(hit.amount,5);
  assert.equal(g.events.find(event=>event.type==='hit').kind,'gust','The wind contact is tested outside another hit protection window');
});

test('a playable full ascent increases matching creature durability and actual attack and weather pressure',()=>{
  const g=runtime(),seenProjectiles=new Set(),seenEnemies=new Set();g.game.start();
  const early={seconds:0,moon:0,weather:0,hp:new Map()},late={seconds:0,moon:0,weather:0,hp:new Map()};
  for(let i=0;i<6500;i++){
    const state=g.game.getState();if(state.phase==='victory'||state.phase==='gameover')break;
    const band=state.height>=600&&state.height<1800?early:state.height>=7200&&state.height<8400?late:null;
    if(band)band.seconds+=.05;
    for(const projectile of state.hostile)if(!seenProjectiles.has(projectile.id)){
      seenProjectiles.add(projectile.id);if(band)band[projectile.kind==='moon'?'moon':'weather']++;
    }
    for(const enemy of state.enemies)if(!seenEnemies.has(enemy.id)){
      seenEnemies.add(enemy.id);if(band)band.hp.set(enemy.type,Math.max(band.hp.get(enemy.type)||0,enemy.maxHp));
    }
    g.game.update(.05,{x:Math.sin(state.elapsed*1.05)>0?1:-1,fire:true});
  }
  const end=g.game.getState();assert.equal(end.phase,'victory','The higher pressure remains survivable through normal controls');assert.ok(end.hp>0);
  assert.ok(early.seconds>25&&late.seconds>25,'Compare sustained flight windows rather than a single random volley');
  const matching=[...early.hp.keys()].filter(type=>late.hp.has(type));assert.ok(matching.length>=3);
  for(const type of matching)assert.ok(late.hp.get(type)>early.hp.get(type),'The same '+type+' requires more damage higher up');
  assert.ok(late.moon/late.seconds>early.moon/early.seconds*1.5,'Higher difficulty must create more actual animal projectiles per second');
  assert.ok(late.weather/late.seconds>early.weather/early.seconds*1.5,'Higher weather pressure must produce more collision hazards per second');
});

test('steering eases into motion, keeps real momentum when reversing and settles promptly on release',()=>{
  const g=runtime();g.takeoff();g.game.update(1/60,{x:1,fire:false});
  const first=g.game.getState();assert.ok(first.player.vx>0&&first.player.vx<.12,'Acceleration must be felt across frames');
  for(let i=0;i<20;i++)g.game.update(1/60,{x:1,fire:false});const cruise=g.game.getState();assert.ok(cruise.player.vx>.34);
  g.game.update(1/60,{x:-1,fire:false});const turn=g.game.getState();assert.ok(turn.player.vx>0,'Reversing should first brake the existing motion');assert.ok(turn.player.bank>0,'Bank follows actual motion, rather than flipping with the key');
  for(let i=0;i<20;i++)g.game.update(1/60,{x:-1,fire:false});assert.ok(g.game.getState().player.vx<-.34);
  for(let i=0;i<9;i++)g.game.update(1/60,{fire:false});assert.ok(Math.abs(g.game.getState().player.vx)<.012,'Release must settle within a comfortable fraction of a second');
  const diagonal=runtime();diagonal.takeoff();for(let i=0;i<40;i++)diagonal.game.update(1/60,{x:1,y:-1,fire:false});const velocity=diagonal.game.getState().player;
  assert.ok(Math.hypot(velocity.vx/.37,velocity.vy/.27)<=1.001,'Diagonal input cannot gain an unintended speed advantage');
});

test('six creatures enter on reserved lanes and follow smooth, distinct flight rhythms',()=>{
  const g=runtime(),seen=new Set(),previous=new Map();g.game.start();
  for(let i=0;i<2600;i++){
    const s=g.game.getState();if(s.phase==='gameover'||s.phase==='victory')break;
    g.game.update(.05,{x:Math.sin(s.elapsed*1.05)>0?1:-1,fire:true});
    const state=g.game.getState();
    for(const enemy of state.enemies){
      const before=previous.get(enemy.id);
      if(before)assert.ok(Math.hypot(enemy.x-before.x,enemy.y-before.y)<.05,'A creature must not teleport between route points');
      assert.ok(Math.abs(enemy.heading)<=.5+1e-10);assert.ok(enemy.facing===1||enemy.facing===-1);
      if(enemy.motion>.2){seen.add(enemy.type+':'+enemy.motionPhase);assert.ok(enemy.flapPhase>0);}
      if(!before)for(const other of state.enemies)if(other.id!==enemy.id)assert.ok(Math.abs(enemy.baseX-other.baseX)>.19,'New creatures need separate destination lanes');
      previous.set(enemy.id,{x:enemy.x,y:enemy.y});
    }
  }
  for(const type of ANIMALS.map(a=>a.id))assert.ok([...seen].some(value=>value.startsWith(type+':')),'A complete natural flight must show the '+type+' motion');
  for(const motion of ['bounce','leap','glide','dart','flutter'])assert.ok([...seen].some(value=>value.endsWith(':'+motion)),'Species rhythms must visibly differ');
  assert.ok([...seen].some(value=>value.endsWith(':swoop')||value.endsWith(':rise')));
});

test('charging creatures commit to a readable aim before firing, giving time to dodge',()=>{
  const g=runtime();g.takeoff();let locked=null;
  for(let i=0;i<500&&!locked;i++){
    g.game.update(.05,{fire:false});const state=g.game.getState(),enemy=state.enemies.find(e=>e.phase==='charge'&&e.charge>0&&e.aimX!==null);
    if(enemy)locked={id:enemy.id,type:enemy.type,x:enemy.aimX,time:state.elapsed,playerX:state.player.x};
  }
  assert.ok(locked);let shot=null,moved=false;
  for(let i=0;i<40&&!shot;i++){
    g.game.update(.05,{x:1,fire:false});const state=g.game.getState(),enemy=state.enemies.find(e=>e.id===locked.id);
    if(enemy&&enemy.phase==='charge')assert.equal(enemy.aimX,locked.x,'The telegraph cannot silently follow the player until the release frame');
    if(state.player.x-locked.playerX>.12)moved=true;
    if(state.hostile.some(p=>p.kind==='moon'&&p.source===locked.type))shot=state;
  }
  assert.ok(moved);assert.ok(shot);assert.ok(shot.elapsed-locked.time>=.8,'A charged shot needs a readable warning window');
});
