'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'dist', 'journey.js'), 'utf8');
const KEY = 'windborne.journey.v2';

function load(storage) {
  const window = {localStorage:storage};
  vm.runInNewContext(source, {window, setTimeout, clearTimeout});
  return window;
}

function memoryStorage(initial) {
  const values = new Map(initial ? [[KEY, initial]] : []);
  return {
    writes:0,
    getItem(key) { return values.get(key) || null; },
    setItem(key, value) { this.writes++; values.set(key, value); }
  };
}

test('only the active task advances and an unlocked memory fires once', () => {
  const storage = memoryStorage();
  const unlocks = [];
  let changes = 0;
  const {WindborneJourney} = load(storage);
  const journey = new WindborneJourney({onChange:() => changes++, onUnlock:value => unlocks.push(value)});
  assert.equal(journey.record('gate', 0), false);
  for (let i = 0; i < 5; i++) { journey.addLight(); journey.record('light', 0); }
  assert.equal(journey.getScene(0).task, 'gate');
  assert.equal(journey.record('light', 0), false);
  for (let i = 0; i < 2; i++) journey.record('gate', 0);
  assert.equal(journey.getScene(0).task, 'ripple');
  for (let i = 0; i < 3; i++) journey.record('ripple', 0);
  assert.equal(journey.getScene(0).completed, true);
  assert.equal(journey.record('ripple', 0), false);
  assert.equal(unlocks.length, 1);
  assert.equal(unlocks[0].scene, 0);
  assert.equal(journey.getSnapshot().totalLights, 5);
  assert.equal(changes, 18);
  journey.flush();
  const restored = new WindborneJourney({onUnlock:value => unlocks.push(value)});
  assert.equal(restored.getScene(0).completed, true);
  restored.record('ripple', 0);
  assert.equal(unlocks.length, 1);
});

test('scene progress is independent and survives a return visit', () => {
  const {WindborneJourney} = load(memoryStorage());
  const journey = new WindborneJourney();
  journey.record('light', 0);
  journey.record('light', 0);
  journey.setSettings({scene:1, mode:'drift'});
  journey.record('light', 1);
  assert.equal(journey.getScene(0).count, 2);
  assert.equal(journey.getScene(1).count, 1);
  assert.equal(journey.getScene(2).count, 0);
  assert.equal(journey.getSnapshot().settings.mode, 'drift');
  journey.setSettings({scene:0, calm:true});
  assert.equal(journey.getSnapshot().settings.mode, 'drift');
  assert.equal(journey.getSnapshot().settings.calm, true);
  journey.record('light', 0);
  assert.equal(journey.getScene(0).count, 3);
  journey.flush();
});

test('lifetime totals persist and distance cannot move backwards', () => {
  const storage = memoryStorage();
  const {WindborneJourney} = load(storage);
  const journey = new WindborneJourney();
  journey.addLight();
  journey.addLight();
  journey.setDistance(120.5);
  journey.setDistance(20);
  journey.setDistance(Infinity);
  assert.equal(storage.writes, 0);
  assert.equal(journey.flush(), true);
  assert.equal(storage.writes, 1);
  const restored = new WindborneJourney();
  assert.equal(restored.getSnapshot().totalLights, 2);
  assert.equal(restored.getSnapshot().totalDistance, 120.5);
  restored.setDistance(145.25);
  restored.flush();
  assert.equal(new WindborneJourney().getSnapshot().totalDistance, 145.25);
});

test('damaged storage and invalid values fall back to playable defaults', () => {
  for (const raw of ['{broken', 'null', '[]', '"text"']) {
    const {WindborneJourney} = load(memoryStorage(raw));
    const journey = new WindborneJourney();
    assert.equal(journey.getScene(0).task, 'light');
    assert.equal(journey.getSnapshot().totalDistance, 0);
    journey.record('light', 0);
    assert.equal(journey.getScene(0).count, 1);
    journey.flush();
  }
  const raw = JSON.stringify({scenes:[{counts:{light:3, gate:2, ripple:3}}], totalLights:-20, totalDistance:'bad', settings:{mode:'unknown', scene:99, calm:'yes'}});
  const {WindborneJourney} = load(memoryStorage(raw));
  const journey = new WindborneJourney();
  assert.equal(journey.getScene(0).steps[1].count, 0);
  assert.equal(journey.getSnapshot().totalLights, 3);
  assert.equal(journey.getSnapshot().settings.scene, 0);
  assert.equal(journey.getSnapshot().settings.calm, false);
});

test('unavailable or full storage preserves the current in-memory journey', () => {
  const storage = {getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); }};
  const {WindborneJourney} = load(storage);
  const journey = new WindborneJourney();
  journey.record('light', 3);
  journey.addLight();
  assert.equal(journey.flush(), false);
  assert.equal(journey.getScene(3).count, 1);
  assert.equal(journey.getSnapshot().totalLights, 1);
});

test('returned snapshots cannot mutate the saved journal', () => {
  const {WindborneJourney} = load(memoryStorage());
  const journey = new WindborneJourney();
  const snapshot = journey.getSnapshot();
  snapshot.settings.mode = 'drift';
  snapshot.scenes[0].steps[0].count = 99;
  snapshot.scenes[0].memory.title = 'changed';
  assert.equal(journey.getSnapshot().settings.mode, 'seek');
  assert.equal(journey.getScene(0).count, 0);
  assert.notEqual(journey.getScene(0).memory.title, 'changed');
});

test('random sky rounds visit all four skies without consecutive repeats',()=>{
  const {WindborneSceneCycle}=load(memoryStorage());
  const cycle=new WindborneSceneCycle(4);let current=0;
  for(let round=0;round<30;round++){
    const visited=new Set([current]);
    for(let step=0;step<3;step++){
      const next=cycle.next(current);assert.notEqual(next,current);assert.ok(next>=0&&next<4);visited.add(next);current=next;
    }
    assert.equal(visited.size,4);
  }
  cycle.reset();assert.notEqual(cycle.next(current),current);
});

test('optional discoveries persist once per landmark without advancing the letter journey', () => {
  const storage = memoryStorage();
  const unlocks = [];
  let changes = 0;
  const {WindborneJourney, WINDBORNE_DISCOVERIES} = load(storage);
  const journey = new WindborneJourney({onChange:() => changes++, onUnlock:memory => unlocks.push(memory)});
  journey.record('light', 0);
  const before = JSON.stringify(journey.getSnapshot().scenes);
  assert.equal(journey.discover(0, 0), true);
  assert.equal(journey.discover(3, 2), true);
  assert.equal(journey.discover(0, 0), false);
  assert.equal(JSON.stringify(journey.getSnapshot().scenes), before);
  assert.equal(journey.getSnapshot().totalLights, 0);
  assert.equal(journey.getSnapshot().totalDistance, 0);
  assert.equal(unlocks.length, 0);
  assert.equal(changes, 3);
  assert.equal(WINDBORNE_DISCOVERIES[0][0], '云间灯塔');
  assert.equal(WINDBORNE_DISCOVERIES[3][2], '逐梦天文台');
  assert.equal(journey.flush(), true);
  const restored = new WindborneJourney();
  assert.deepEqual(Array.from(restored.getSnapshot().discoveries), ['0:0', '3:2']);
  assert.equal(restored.getScene(0).count, 1);
  assert.equal(restored.discover(3, 2), false);
  const snapshot = restored.getSnapshot();snapshot.discoveries.push('1:1');
  assert.equal(restored.getSnapshot().discoveries.length, 2);
});

test('discovery storage rejects malformed ids, removes duplicates and loads older saves', () => {
  for (const bad of [null, {}, '0:0', 1]) {
    const {WindborneJourney} = load(memoryStorage(JSON.stringify({discoveries:bad,scenes:[{counts:{light:3}}]})));
    const journey = new WindborneJourney();
    assert.equal(journey.getSnapshot().discoveries.length, 0);
    assert.equal(journey.getScene(0).count, 3);
  }
  const {WindborneJourney} = load(memoryStorage(JSON.stringify({discoveries:['0:0','0:0','3:2','4:0','1:3','00:0','1:1x',null,{},0]})));
  const journey = new WindborneJourney();
  assert.deepEqual(Array.from(journey.getSnapshot().discoveries), ['0:0','3:2']);
  for (const [scene,variant] of [[-1,0],[4,0],[0,-1],[0,3],[.5,0],[0,1.1],['0',0],[0,'0'],[NaN,0],[0,Infinity]]) assert.equal(journey.discover(scene,variant), false);
  for (let scene=0;scene<4;scene++) for (let variant=0;variant<3;variant++) journey.discover(scene,variant);
  assert.equal(journey.getSnapshot().discoveries.length, 12);
  assert.equal(journey.getSnapshot().unlocked.length, 0);
  journey.flush();
  const restored = new WindborneJourney();
  assert.equal(restored.getSnapshot().discoveries.length, 12);
});
