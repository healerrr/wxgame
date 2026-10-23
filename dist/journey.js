/* A small, independent journey journal. No DOM or network dependencies. */
(() => {
  'use strict';

  const STORAGE_KEY = 'windborne.journey.v2';
  const SCENE_NAMES = ['深蓝之境', '落日来信', '萤火森林', '星河入梦'];
  const TASKS = [
    {type:'light', target:5, title:'拾起五束微光', description:'轻轻转向，靠近暖色微光。'},
    {type:'gate', target:2, title:'穿过两道风环', description:'让纸飞机从发光的风环中心穿过。'},
    {type:'ripple', target:3, title:'唤醒三圈涟漪', description:'轻点天空，或按 R，让风泛起涟漪。'}
  ];
  const MEMORIES = [
    {title:'把心事交给风', poem:'慢一点，风会等你。', subtitle:'深蓝之境 · 第一封风的来信'},
    {title:'晚霞写给你', poem:'今天的晚霞，也为你停留。', subtitle:'落日来信 · 被收藏的黄昏'},
    {title:'一盏小小的光', poem:'总有微小的光，为你而亮。', subtitle:'萤火森林 · 口袋里的星火'},
    {title:'把梦放进星河', poem:'今夜，让星河接住你的梦。', subtitle:'星河入梦 · 安静抵达的远方'}
  ];
  const DISCOVERIES = [
    ['云间灯塔','白鹭回湾','听风古桥'],
    ['暮色风车','金色花海','云上海港'],
    ['萤火古树','青岚石门','林间浮岛'],
    ['月光鲸影','星河之门','逐梦天文台']
  ];
  const DEFAULT_SETTINGS = {mode:'seek', calm:false, scene:0, auto:true, weather:'auto'};
  const finite = (value, fallback=0) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : fallback;
  const sceneIndex = (value) => Number.isInteger(value) && value >= 0 && value < SCENE_NAMES.length ? value : 0;

  function settingsFrom(value, fallback=DEFAULT_SETTINGS) {
    const source = value && typeof value === 'object' ? value : {};
    return {
      mode:source.mode === 'seek' || source.mode === 'drift' ? source.mode : fallback.mode,
      calm:typeof source.calm === 'boolean' ? source.calm : fallback.calm,
      scene:Number.isInteger(source.scene) && source.scene >= 0 && source.scene < SCENE_NAMES.length ? source.scene : fallback.scene,
      auto:typeof source.auto === 'boolean' ? source.auto : fallback.auto,
      weather:['auto','clear','rain','snow','storm'].includes(source.weather) ? source.weather : fallback.weather
    };
  }

  class WindborneJourney {
    constructor({onChange, onUnlock, storage}={}) {
      this.onChange = typeof onChange === 'function' ? onChange : () => {};
      this.onUnlock = typeof onUnlock === 'function' ? onUnlock : () => {};
      this._timer = null;
      this._storage = null;
      let saved = {};
      try {
        this._storage = storage || (typeof window !== 'undefined' ? window.localStorage : null);
        const raw = this._storage && this._storage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) saved = parsed;
      } catch (_) {
        // Private browsing, disabled storage and broken JSON all remain playable.
      }
      this._progress = SCENE_NAMES.map((_, scene) => {
        const entry = Array.isArray(saved.scenes) ? saved.scenes[scene] : null;
        const counts = entry && entry.counts && typeof entry.counts === 'object' ? entry.counts : {};
        const progress = {};
        let previousDone = true;
        for (const task of TASKS) {
          progress[task.type] = previousDone ? Math.min(task.target, Math.floor(finite(counts[task.type]))) : 0;
          previousDone = progress[task.type] === task.target;
        }
        return progress;
      });
      const collectedProgress = this._progress.reduce((sum, progress) => sum + progress.light, 0);
      this._totalLights = Math.max(collectedProgress, Math.floor(finite(saved.totalLights)));
      this._totalDistance = finite(saved.totalDistance);
      this._settings = settingsFrom(saved.settings);
      this._discoveries = new Set(Array.isArray(saved.discoveries) ? saved.discoveries.filter(id => typeof id === 'string' && /^[0-3]:[0-2]$/.test(id)) : []);
    }

    getScene(scene) {
      const index = sceneIndex(scene);
      const progress = this._progress[index];
      const steps = TASKS.map(task => ({type:task.type, count:progress[task.type], target:task.target, done:progress[task.type] >= task.target}));
      const current = TASKS.find(task => progress[task.type] < task.target);
      const memory = MEMORIES[index];
      return {
        scene:index,
        name:SCENE_NAMES[index],
        task:current ? current.type : 'complete',
        count:current ? progress[current.type] : TASKS.length,
        target:current ? current.target : TASKS.length,
        title:current ? current.title : memory.title,
        description:current ? current.description : memory.poem,
        completed:!current,
        completedSteps:steps.filter(step => step.done).length,
        steps,
        memory:{...memory}
      };
    }

    getSnapshot() {
      const scenes = SCENE_NAMES.map((_, scene) => this.getScene(scene));
      return {
        scenes,
        unlocked:scenes.filter(scene => scene.completed).map(scene => scene.scene),
        totalLights:this._totalLights,
        totalDistance:this._totalDistance,
        discoveries:[...this._discoveries],
        settings:{...this._settings}
      };
    }

    record(type, scene) {
      if (!Number.isInteger(scene) || scene < 0 || scene >= SCENE_NAMES.length) return false;
      const current = this.getScene(scene);
      if (type !== current.task || current.completed) {
        this.onChange(this.getSnapshot());
        return false;
      }
      this._progress[scene][type] = Math.min(current.target, current.count + 1);
      this._scheduleSave();
      const updated = this.getScene(scene);
      this.onChange(this.getSnapshot());
      if (updated.completed) this.onUnlock({scene, title:MEMORIES[scene].title, poem:MEMORIES[scene].poem});
      return true;
    }

    addLight() {
      this._totalLights += 1;
      this._scheduleSave();
      this.onChange(this.getSnapshot());
      return this._totalLights;
    }

    discover(scene, variant) {
      if (!Number.isInteger(scene) || scene < 0 || scene >= DISCOVERIES.length || !Number.isInteger(variant) || variant < 0 || variant >= DISCOVERIES[scene].length) return false;
      const id = `${scene}:${variant}`;
      if (this._discoveries.has(id)) return false;
      this._discoveries.add(id);
      this._scheduleSave();
      this.onChange(this.getSnapshot());
      return true;
    }

    setDistance(distance) {
      const next = finite(distance, this._totalDistance);
      if (next <= this._totalDistance) return;
      this._totalDistance = next;
      this._scheduleSave();
      this.onChange(this.getSnapshot());
    }

    setSettings(patch) {
      this._settings = settingsFrom(patch, this._settings);
      this._scheduleSave();
      this.onChange(this.getSnapshot());
    }

    _scheduleSave() {
      // A trailing write batches a sequence of collection and UI events.
      if (this._timer !== null) clearTimeout(this._timer);
      this._timer = setTimeout(() => this.flush(), 400);
    }

    flush() {
      if (this._timer !== null) clearTimeout(this._timer);
      this._timer = null;
      try {
        if (!this._storage) return false;
        this._storage.setItem(STORAGE_KEY, JSON.stringify({
          version:2,
          scenes:this._progress.map(counts => ({counts:{...counts}})),
          totalLights:this._totalLights,
          totalDistance:this._totalDistance,
          discoveries:[...this._discoveries],
          settings:{...this._settings}
        }));
        return true;
      } catch (_) {
        return false;
      }
    }
  }

  // Shuffle the other skies into a bag: all four appear before a new round,
  // and even the boundary between rounds cannot repeat the current sky.
  class WindborneSceneCycle {
    constructor(count=4){this.count=count;this.bag=[];}
    reset(){this.bag=[];}
    next(current){
      if(!this.bag.length){
        this.bag=Array.from({length:this.count},(_,index)=>index).filter(index=>index!==current);
        for(let i=this.bag.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[this.bag[i],this.bag[j]]=[this.bag[j],this.bag[i]];}
      }
      return this.bag.length?this.bag.pop():current;
    }
  }
  const api={WindborneSceneCycle,WINDBORNE_MEMORIES:MEMORIES.map(memory=>Object.freeze({...memory})),WINDBORNE_DISCOVERIES:Object.freeze(DISCOVERIES.map(names=>Object.freeze([...names]))),WindborneJourney};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else Object.assign(window,api);
})();
