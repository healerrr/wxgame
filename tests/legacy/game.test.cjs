'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', 'dist');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const source = ['journey.js', 'scenery.js', 'weather.js', 'game.js'].map(file => fs.readFileSync(path.join(root, file), 'utf8'));

// This harness executes the actual engine and its frame loop. It stubs browser
// rendering only; it never launches or drives a browser UI.
function boot({width=640, height=480, reducedMotion=false, saved=null}={}) {
  let now = 0, nextTimer = 0, instance;
  const timers = new Map(), elements = [], ids = new Map(), stored = new Map();
  if (saved) stored.set('windborne.journey.v2', JSON.stringify(saved));
  const listeners = () => ({
    events:new Map(),
    addEventListener(type, callback) {
      const callbacks = this.events.get(type) || [];
      callbacks.push(callback); this.events.set(type, callbacks);
    },
    emit(type, values={}) {
      const event = {type, target:this, repeat:false, defaultPrevented:false, preventDefault() { this.defaultPrevented = true; }, ...values};
      for (const callback of this.events.get(type) || []) callback(event);
      return event;
    }
  });
  const document = Object.assign(listeners(), {hidden:false, activeElement:null});
  class Element {
    constructor(tag='div') {
      Object.assign(this, listeners());
      this.tagName = tag.toUpperCase(); this.attributes = {}; this.dataset = {}; this.children = [];
      this.inert = false; this.hidden = false; this.disabled = false; this.open = false;
      this.classList = {
        values:new Set(),
        add(...classes) { classes.forEach(name => this.values.add(name)); },
        remove(...classes) { classes.forEach(name => this.values.delete(name)); },
        contains(name) { return this.values.has(name); },
        toggle(name, force) { const active = force === undefined ? !this.values.has(name) : force; active ? this.values.add(name) : this.values.delete(name); return active; }
      };
      elements.push(this);
    }
    set className(value) { this.classList.values = new Set(value.split(/\s+/).filter(Boolean)); }
    get className() { return [...this.classList.values].join(' '); }
    setAttribute(key, value) { this.attributes[key] = String(value); if (key === 'id') { this.id = value; ids.set(value, this); } if (key === 'class') this.className = value; if (key.startsWith('data-')) this.dataset[key.slice(5)] = value; }
    append(...children) { children.forEach(child => { child.parentElement = this; this.children.push(child); }); }
    replaceChildren(...children) { this.children = []; this.append(...children); }
    closest(selector) { if (selector.split(',').includes(this.tagName.toLowerCase())) return this; return this.parentElement ? this.parentElement.closest(selector) : null; }
    focus() { for (let node=this; node; node=node.parentElement) if (node.inert || node.hidden) return; if (!this.disabled) document.activeElement = this; }
    getContext() { return context; }
    setPointerCapture() {}
    showModal() { this.open = true; document.activeElement = ids.get('close-journal'); }
    close() { this.open = false; this.emit('close'); }
  }
  const gradient = {addColorStop() {}};
  const context = new Proxy({}, {get(target, property) {
    if (property in target) return target[property];
    if (property === 'createImageData') return (w,h) => ({data:new Uint8ClampedArray(w*h*4)});
    if (property === 'createLinearGradient' || property === 'createRadialGradient') return () => gradient;
    if (property === 'createPattern') return () => ({});
    return () => {};
  }});
  const stack = [];
  const voidTags = new Set(['meta', 'link', 'br', 'input', 'img', 'hr']);
  for (const match of html.matchAll(/<\/?([a-z][\w-]*)([^>]*?)>/gi)) {
    const [token, tag, attributes] = match;
    if (token.startsWith('</')) { while (stack.length && stack.pop().tagName !== tag.toUpperCase()) {} continue; }
    const node = new Element(tag);
    for (const attr of attributes.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) {
      node.setAttribute(attr[1], attr[2] || '');
      if (attr[1] === 'hidden') node.hidden = true;
    }
    if (stack.length) stack.at(-1).append(node);
    if (!voidTags.has(tag) && !token.endsWith('/>')) stack.push(node);
    if (tag === 'body') document.body = node;
  }
  document.activeElement = document.body;
  document.getElementById = id => ids.get(id) || null;
  document.createElement = tag => new Element(tag);
  document.createDocumentFragment = () => new Element('fragment');
  document.querySelector = selector => selector === '#world canvas' ? ids.get('world').children.find(node => node.tagName === 'CANVAS') : document.querySelectorAll(selector)[0] || null;
  document.querySelectorAll = selector => elements.filter(node => selector.split(',').some(part => part.startsWith('.') ? node.classList.contains(part.slice(1)) : part.startsWith('#') ? node.id === part.slice(1) : false));
  const window = Object.assign(listeners(), {
    document, innerWidth:width, innerHeight:height,
    localStorage:{getItem:key => stored.get(key) || null, setItem:(key,value) => stored.set(key,value)}
  });
  const advance = milliseconds => {
    now += milliseconds;
    for (;;) {
      const due = [...timers].find(([,timer]) => timer.at <= now);
      if (!due) break;
      timers.delete(due[0]); due[1].callback();
    }
  };
  function P5(build) {
    instance = {
      frameCount:0, deltaTime:16.667, drawingContext:context,
      pixelDensity() {}, noiseSeed() {}, noise() { return .5; },
      frameRate() { return 60; }, constrain:(value,min,max) => Math.min(max,Math.max(min,value)),
      createCanvas(w,h) { this.width=w; this.height=h; this.canvas=new Element('canvas'); return {elt:this.canvas, parent:id => ids.get(id).append(this.canvas)}; },
      resizeCanvas(w,h) { this.width=w; this.height=h; }
    };
    build(instance); instance.setup();
  }
  const sandbox = {
    window, document, p5:P5, devicePixelRatio:1,
    matchMedia:query => ({matches:query.includes('reduced-motion') && reducedMotion}),
    performance:{now:() => now},
    setTimeout:(callback,delay) => { const id=++nextTimer; timers.set(id,{callback,at:now+delay}); return id; },
    clearTimeout:id => timers.delete(id)
  };
  const runtime = vm.createContext(sandbox);
  source.forEach(script => vm.runInContext(script, runtime));
  return {
    window, document, stored, advance,
    element:id => ids.get(id), state:() => window.windborne.getState(),
    click(id) { const node=ids.get(id); node.focus(); node.emit('click'); },
    key(code, {up=false,repeat=false}={}) { return document.emit(up?'keyup':'keydown',{target:document.activeElement,code,repeat}); },
    steer(value) { instance.canvas.emit('pointermove',{pointerType:'mouse',clientX:window.innerWidth*(.5+Math.max(-1,Math.min(1,value))*.36),clientY:window.innerHeight*.5}); },
    flight:() => instance.canvas.dataset.flight ? JSON.parse(instance.canvas.dataset.flight) : null,
    step(frames=1, milliseconds=16.667) { instance.deltaTime=milliseconds; for (let i=0;i<frames;i++) { advance(milliseconds); instance.frameCount++; instance.draw(); } },
    resize(w,h) { window.innerWidth=w; window.innerHeight=h; instance.windowResized(); advance(121); },
    hide() { document.hidden=true; document.emit('visibilitychange'); }
  };
}

test('game boots and starts with canvas focus; repeated Space never toggles pause', () => {
  const game = boot();
  assert.equal(game.state().started, false);
  game.click('start');
  assert.equal(game.document.activeElement.tagName, 'CANVAS');
  assert.equal(game.element('intro').inert, true);
  game.key('Space', {repeat:true});
  assert.equal(game.state().paused, false);
  game.key('Space');
  assert.equal(game.state().paused, true);
  assert.equal(game.document.activeElement.id, 'resume');
  game.key('Space', {repeat:true});
  assert.equal(game.state().paused, true);
  game.click('resume');
  assert.equal(game.state().paused, false);
  assert.equal(game.document.activeElement.tagName, 'CANVAS');
});

test('releasing one of two direction keys retains the other direction', () => {
  const game = boot(); game.click('start');
  game.key('ArrowLeft'); game.key('ArrowRight'); game.step(30);
  assert.equal(game.state().steering, 0);
  game.key('ArrowRight', {up:true}); game.step(30);
  assert.ok(game.state().steering < -.7);
  game.key('ArrowLeft', {up:true}); game.step(120);
  assert.ok(Math.abs(game.state().steering) < .01);
});

test('opposing vertical keys cancel and releasing one retains the held climb direction', () => {
  const game=boot();game.click('start');game.step(100);
  const level=game.state().plane.y;
  game.key('ArrowUp');game.key('ArrowDown');game.step(30);
  assert.ok(Math.abs(game.state().pitch)<.01,'Simultaneous up/down inputs cancel');
  game.key('ArrowDown',{up:true});game.step(90);
  assert.ok(game.state().pitch<-.7,'The held climb key remains effective');
  assert.ok(game.state().plane.y<level-25,'Keyboard pitch moves the actual plane');
  game.key('ArrowUp',{up:true});game.step(120);
  assert.ok(Math.abs(game.state().pitch)<.02,'Releasing all pitch keys levels the plane');
});

test('Shift consumes wind energy and pause releases boost without spending energy while paused', () => {
  const game=boot();game.click('start');game.step(100);
  const before=game.state();game.key('ShiftLeft');game.step(40);
  const boosted=game.state();
  assert.equal(boosted.boosting,true);
  assert.ok(boosted.energy<before.energy);
  assert.ok(boosted.flightSpeed>before.flightSpeed*1.15);
  game.key('Space');const paused=game.state();
  assert.equal(paused.paused,true);assert.equal(paused.boosting,false);
  game.step(90);
  assert.equal(game.state().energy,paused.energy);
  assert.equal(game.state().worldDistance,paused.worldDistance);
  game.click('resume');game.step(90);
  assert.equal(game.state().boosting,false,'Resume cannot retain a stale Shift press');
});

test('background visibility pauses, clears held input and freezes distance', () => {
  const game = boot(); game.click('start');
  game.key('ArrowRight'); game.step(30); game.hide();
  const distance = game.state().distance;
  assert.equal(game.state().paused, true);
  assert.equal(Math.floor(JSON.parse(game.stored.get('windborne.journey.v2')).totalDistance), distance);
  game.step(120);
  assert.equal(game.state().distance, distance);
  game.click('resume'); game.step(120);
  assert.ok(Math.abs(game.state().steering) < .01);
});

test('a delayed start still places the first reachable light ahead of the plane', () => {
  const game = boot(); game.step(600); game.click('start'); game.step(240);
  assert.ok(game.state().collected >= 1);
  assert.ok(game.state().journey.scenes[0].steps[0].count >= 1);
});

test('the light route can advance through all five collectibles with ordinary pointer steering', () => {
  const game = boot(); game.click('start');
  for (let frame=0;frame<2400&&game.state().journey.scenes[0].task==='light';frame++) {
    const flight=game.flight(), state=game.state();
    const next=flight?.lights.filter(light => light.y > 0 && light.y < state.plane.y + 25).sort((a,b) => b.y-a.y)[0];
    if (next) game.steer((next.x-state.plane.x)/(state.viewport.width*.2));
    else game.steer(0);
    game.step();
  }
  assert.equal(game.state().journey.scenes[0].task, 'gate');
  assert.equal(game.state().journey.scenes[0].steps[0].count, 5);
});

test('resizing a paused flight preserves route progress, distance and relative plane position', () => {
  const game = boot(); game.click('start'); game.step(240); game.click('pause');
  const before = game.state();
  game.resize(960,720);
  const after = game.state();
  assert.equal(after.collected, before.collected);
  assert.equal(after.distance, before.distance);
  assert.equal(after.journey.scenes[0].steps[0].count, before.journey.scenes[0].steps[0].count);
  assert.ok(Math.abs(after.plane.x-before.plane.x*1.5) <= 1);
  assert.ok(Math.abs(after.plane.y-before.plane.y*1.5) <= 1);
  assert.equal(after.paused, true);
});

test('pagehide flushes lifetime distance and the preference for reduced motion is honored', () => {
  const game = boot({reducedMotion:true}); game.click('start'); game.step(90);
  assert.equal(game.state().calm, true);
  game.window.emit('pagehide');
  const saved = JSON.parse(game.stored.get('windborne.journey.v2'));
  assert.equal(Math.floor(saved.totalDistance), game.state().distance);
  assert.equal(saved.settings.scene, 0);
});

test('opening and closing the journal resumes an active flight and keeps a paused flight paused', () => {
  const game = boot(); game.click('start'); game.click('journal');
  assert.equal(game.state().paused, true);
  assert.equal(game.element('journal-dialog').open, true);
  game.click('close-journal');
  assert.equal(game.state().paused, false);
  game.click('pause'); game.key('KeyJ'); game.click('close-journal');
  assert.equal(game.state().paused, true);
  assert.equal(game.document.activeElement.id, 'resume');
});

test('a resumed gate task can finish, then three deliberate ripples unlock exactly that scene', () => {
  const game = boot({saved:{scenes:[{counts:{light:5,gate:1,ripple:0}}]}});
  assert.equal(game.state().journey.scenes[0].task, 'gate');
  game.click('start');
  game.key('KeyR');
  assert.equal(game.state().journey.scenes[0].steps[2].count, 0);
  for (let frame=0;frame<500&&game.state().journey.scenes[0].task==='gate';frame++) {
    const flight=game.flight();
    if (flight?.gates.length) game.steer((flight.gates[0].x-game.state().plane.x)/(game.state().viewport.width*.2));
    game.step();
  }
  assert.equal(game.state().journey.scenes[0].task, 'ripple');
  game.key('KeyR', {repeat:true});
  assert.equal(game.state().journey.scenes[0].count, 0);
  for (let i=0;i<3;i++) { game.key('KeyR'); game.step(40); }
  assert.equal(game.state().journey.scenes[0].completed, true);
  assert.equal(game.state().journey.unlocked.length, 1);
  assert.equal(game.state().journey.unlocked[0], 0);
  assert.equal(game.state().journey.scenes[1].completed, false);
  game.click('journal');
  assert.equal(game.element('memory-grid').children[0].classList.contains('unlocked'), true);
  assert.equal(game.element('memory-grid').children[1].classList.contains('locked'), true);
});

test('random scenery changes retain unfinished goals, and manual selection stays put', () => {
  const game=boot({width:320,height:480,saved:{scenes:[{counts:{light:5,gate:2,ripple:1}}]}});
  game.click('start');game.step(1590,41.667);
  assert.notEqual(game.state().journey.settings.scene,0);
  assert.equal(game.state().journey.scenes[0].steps[2].count,1);
  game.key('KeyN');const chosen=game.state().journey.settings.scene;
  assert.equal(game.state().journey.settings.auto,false);
  game.step(1590,41.667);
  assert.equal(game.state().journey.settings.scene,chosen);
});
