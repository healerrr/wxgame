/* Original, depth-projected landscapes shared by the browser and native game. */
(function (root, factory) {
  'use strict';
  const exported = factory();
  if (typeof module === 'object' && module.exports) module.exports = exported;
  else root.WindborneScenery = exported.WindborneScenery;
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const random = n => { const value = Math.sin(n * 127.13 + 78.23) * 43758.5453; return value - Math.floor(value); };
  const rgba = (hex, alpha) => {
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
  };
  const COLORS = [
    {sky:['#163a56','#4c8d9b','#d0e2d8'], land:'#427580', near:'#1f4659', ridge:'#6d9aa1', mist:'#d0e5dd', water:'#aedbd2', light:'#f7edcc', cloud:'#eaf4e6'},
    {sky:['#64547f','#d29caa','#f9d6b4'], land:'#b49983', near:'#776476', ridge:'#c4a5ac', mist:'#ffe5c6', water:'#f8ddb8', light:'#fff0c4', cloud:'#fff1d7'},
    {sky:['#234d54','#659e8f','#d5e5bd'], land:'#548a6b', near:'#28584d', ridge:'#87b698', mist:'#dceac6', water:'#c0dfbd', light:'#fff0bc', cloud:'#edf2d9'},
    {sky:['#282541','#635582','#baa9cd'], land:'#5e5b88', near:'#363253', ridge:'#9085b0', mist:'#d3c4e7', water:'#d8beef', light:'#ffe6d4', cloud:'#e4d5ef'}
  ];

  class WindborneScenery {
    constructor(createCanvas) {
      this.createCanvas = createCanvas;
      this.cache = new Map();
      this.previous = null;
      this.scene = -1;
      this.changeTime = 0;
    }
    layer(width, height) {
      if (!this.createCanvas) return null;
      const canvas = this.createCanvas(width, height);
      canvas.width = width; canvas.height = height;
      return canvas;
    }
    sky(width, height, scene) {
      const key = width + ':' + height + ':' + scene;
      if (this.cache.has(key)) return this.cache.get(key);
      const canvas = this.layer(width, height);
      if (!canvas) return null;
      const g = canvas.getContext('2d'), c = COLORS[scene], d = Math.min(width, height);
      let gradient = g.createLinearGradient(0, 0, width * .25, height);
      gradient.addColorStop(0, c.sky[0]); gradient.addColorStop(.30, c.sky[1]);
      gradient.addColorStop(.55, c.sky[2]); gradient.addColorStop(1, c.land);
      g.fillStyle = gradient; g.fillRect(0, 0, width, height);
      const sx = width * .73, sy = height * .255;
      gradient = g.createRadialGradient(sx, sy, 0, sx, sy, d * .58);
      gradient.addColorStop(0, rgba(c.light, scene === 3 ? .12 : .29));
      gradient.addColorStop(.40, rgba(c.light, .07)); gradient.addColorStop(1, rgba(c.light, 0));
      g.fillStyle = gradient; g.fillRect(0, 0, width, height * .78);
      if (scene === 3) {
        // The galaxy is a broad translucent wash, with individual distant stars.
        g.save(); g.translate(width * .58, height * .22); g.rotate(-.42);
        gradient = g.createLinearGradient(0, -d * .16, 0, d * .16);
        gradient.addColorStop(0, rgba('#d8c1e4', 0)); gradient.addColorStop(.5, rgba('#d8c1e4', .11)); gradient.addColorStop(1, rgba('#d8c1e4', 0));
        g.fillStyle = gradient; g.fillRect(-width, -d * .16, width * 2, d * .32); g.restore();
        for (let i = 0; i < 180; i++) {
          g.fillStyle = rgba(i % 4 ? '#f2e4e5' : '#b7d8ed', .20 + random(i + 41) * .53);
          g.beginPath(); g.arc(random(i * 2 + 2) * width, random(i * 2 + 3) * height * .50, i % 27 === 0 ? 1.3 : .35 + random(i) * .45, 0, TAU); g.fill();
        }
      }
      g.fillStyle = rgba(c.light, scene === 1 ? .84 : .67);
      const radius = d * (scene === 1 ? .043 : scene === 3 ? .032 : .019);
      g.beginPath(); g.arc(sx, sy, radius, 0, TAU); g.fill();
      if (scene === 3) {
        g.fillStyle = '#4f5074'; g.beginPath(); g.arc(sx + radius * .46, sy - radius * .28, radius * .95, 0, TAU); g.fill();
      }
      // Atmospheric brush marks are cached, not painted for every frame.
      for (let i = 0; i < 36; i++) {
        const y = height * (.12 + random(i + 12) * .34), x = width * random(i + 92), span = width * (.07 + random(i + 32) * .21);
        g.strokeStyle = rgba(c.cloud, .016 + random(i + 3) * .02); g.lineWidth = 2 + random(i + 4) * d * .015;
        g.beginPath(); g.moveTo(x - span, y); g.bezierCurveTo(x - span * .2, y - d * .018, x + span * .6, y + d * .01, x + span, y - d * .006); g.stroke();
      }
      if (this.cache.size > 12) this.cache.clear();
      this.cache.set(key, canvas);
      return canvas;
    }
    cloud(scene) {
      const key = 'cloud:' + scene;
      if (this.cache.has(key)) return this.cache.get(key);
      const canvas = this.layer(320, 136);
      if (!canvas) return null;
      const g = canvas.getContext('2d'), color = COLORS[scene].cloud;
      for (let i = 0; i < 16; i++) {
        const x = 25 + i * 17 + random(i) * 17, y = 65 + random(i + 23) * 18 - Math.sin(i / 15 * Math.PI) * 20, r = 33 + random(i + 43) * 24;
        g.save(); g.translate(x, y); g.scale(1.15, .72);
        const gradient = g.createRadialGradient(0, 0, 0, 0, 0, r);
        gradient.addColorStop(0, rgba(color, .25)); gradient.addColorStop(.40, rgba(color, .17)); gradient.addColorStop(.75, rgba(color, .06)); gradient.addColorStop(1, rgba(color, 0));
        g.fillStyle = gradient; g.fillRect(-r, -r, r * 2, r * 2); g.restore();
      }
      // A second, thin illuminated crown gives each billow a soft sunward edge.
      for (let i = 0; i < 6; i++) {
        const x = 55 + i * 39, y = 38 + Math.sin(i * 1.3) * 8, radius = 29 + random(i + 51) * 11;
        g.save(); g.translate(x, y); g.scale(1.3, .45);
        const halo = g.createRadialGradient(0, 0, 0, 0, 0, radius);
        halo.addColorStop(0, rgba(COLORS[scene].light, .15)); halo.addColorStop(1, rgba(color, 0));
        g.fillStyle = halo; g.fillRect(-radius, -radius, radius * 2, radius * 2); g.restore();
      }
      this.cache.set(key, canvas); return canvas;
    }
    render(ctx, options) {
      const W = options.width, H = options.height, D = Math.min(W, H);
      if (!(W > 0 && H > 0)) return;
      const scene = clamp(options.scene | 0, 0, 3), time = options.time || 0, distance = options.distance || 0;
      const steering = options.steering || 0, altitude = options.altitude === undefined ? .5 : options.altitude, pitch = options.pitch || 0;
      const quality = options.quality === undefined ? 1 : options.quality;
      const c = COLORS[scene], horizon = H * (.397 + (altitude - .5) * .045 + pitch * .013);
      const center = W * (.50 - steering * .026), groundHeight = H - horizon;
      const sky = this.sky(W, H, scene);
      if (this.scene !== scene) { this.previous = this.scene < 0 ? null : this.sky(W, H, this.scene); this.scene = scene; this.changeTime = time; }
      ctx.save();
      if (sky) ctx.drawImage(sky, 0, 0);
      else { const gradient = ctx.createLinearGradient(0, 0, 0, H); gradient.addColorStop(0, c.sky[0]); gradient.addColorStop(.48, c.sky[2]); gradient.addColorStop(1, c.land); ctx.fillStyle = gradient; ctx.fillRect(0, 0, W, H); }
      const blend = clamp((time - this.changeTime) / 3.5, 0, 1);
      if (this.previous && blend < 1) { ctx.globalAlpha = 1 - blend; ctx.drawImage(this.previous, 0, 0); ctx.globalAlpha = 1; }

      // Distant ridges move slowly; the near geography below advances in depth.
      for (let layer = 0; layer < 4; layer++) {
        const base = horizon + H * (.013 + layer * .037), rise = H * (.095 + layer * .012);
        const shift = Math.sin(distance * .00075 + layer * 1.7) * W * .025 - steering * D * (.007 + layer * .006);
        ctx.fillStyle = rgba(layer > 1 ? c.land : c.ridge, .12 + layer * .10);
        ctx.beginPath(); ctx.moveTo(-W * .1, H);
        for (let i = 0; i <= 12; i++) {
          const x = W * (i / 10 - .1) + shift, h = (.20 + random(i + layer * 17 + scene * 61) * .8) * rise;
          if (!i) ctx.lineTo(x, base - h);
          else ctx.quadraticCurveTo(x - W * .052, base - h - rise * .18, x, base - h * .67);
        }
        ctx.lineTo(W * 1.2, H); ctx.closePath(); ctx.fill();
      }
      let ground = ctx.createLinearGradient(0, horizon - H * .02, 0, H);
      ground.addColorStop(0, rgba(c.land, 0)); ground.addColorStop(.13, rgba(c.land, .28)); ground.addColorStop(.38, rgba(c.land, .90)); ground.addColorStop(1, c.near);
      ctx.fillStyle = ground; ctx.fillRect(0, horizon - H * .02, W, H);
      const river = [], count = 48;
      for (let i = 0; i <= count; i++) {
        const t = i / count, worldZ = 100 / Math.max(.035, t) - 100, sample = distance + worldZ;
        const curve = Math.sin(sample * .0048) * .26 + Math.sin(sample * .010 + 1.2) * .10;
        river.push({x:center + curve * W * t, y:horizon + groundHeight * Math.pow(t, 1.25), w:W * (.002 + t * t * (scene === 1 ? .16 : .12)) * (1 + Math.sin(sample * .015) * .12)});
      }
      // One continuous path of reflected sky carries the eye into the distance.
      ground = ctx.createLinearGradient(0, horizon, 0, H);
      ground.addColorStop(0, rgba(c.water, .65)); ground.addColorStop(.4, rgba(c.water, .37)); ground.addColorStop(1, rgba(c.water, scene === 3 ? .28 : .21));
      ctx.fillStyle = ground; ctx.beginPath(); river.forEach((p, i) => i ? ctx.lineTo(p.x - p.w, p.y) : ctx.moveTo(p.x - p.w, p.y));
      for (let i = river.length - 1; i >= 0; i--) ctx.lineTo(river[i].x + river[i].w, river[i].y);
      ctx.closePath(); ctx.fill();

      // Fixed world rows come towards the camera and expand, rather than merely
      // scrolling a flat photograph. Their spacing gets larger at close range.
      const first = Math.floor(distance / 24), rows = options.calm ? 26 : 38;
      for (let i = rows; i >= 0; i--) {
        const z = (first + i + 1) * 24 - distance, t = 100 / (z + 100);
        const index = clamp(Math.round(t * count), 0, count), p = river[index];
        const y = horizon + groundHeight * Math.pow(t, 1.25), alpha = .045 + t * .16;
        ctx.strokeStyle = rgba(scene === 1 ? '#f9d399' : c.mist, alpha); ctx.lineWidth = .4 + t * .7;
        if (scene === 0 || scene === 3) {
          const span = p.w * (.2 + random(first + i) * .65), dx = Math.sin((first + i) * 1.6) * p.w * .5;
          ctx.beginPath(); ctx.moveTo(p.x + dx - span, y); ctx.quadraticCurveTo(p.x + dx, y - t * 3, p.x + dx + span, y); ctx.stroke();
        } else {
          for (let side = -1; side <= 1; side += 2) {
            ctx.beginPath(); ctx.moveTo(p.x + side * (p.w + W * t * .018), y + 2);
            ctx.bezierCurveTo(p.x + side * W * t * .3, y - H * t * .055, p.x + side * W * t * .7, y + H * t * .07, p.x + side * W * 1.2, y - H * t * .03); ctx.stroke();
          }
        }
      }

      // Low islands and valley shoulders have real world z positions. They grow
      // and slip past either wing while the distant skyline barely moves.
      const segment = Math.floor(distance / 100), objectCount = quality < .7 ? 9 : 12;
      for (let i = objectCount; i >= -1; i--) {
        const serial = segment + i, z = serial * 100 + 130 - distance;
        if (z < -24) continue;
        const scale = 130 / (z + 155), y = horizon + groundHeight * scale;
        for (let side = -1; side <= 1; side += 2) {
          const seed = serial * 7 + side * 3 + scene * 111, spread = .76 + random(seed) * .85;
          const x = center + side * W * spread * scale - steering * D * scale * .045;
          const rw = W * (.54 + random(seed + 9) * .23) * scale, rh = D * (scene === 0 ? .24 + random(seed + 8) * .32 : .16 + random(seed + 8) * .26) * scale;
          const shoulder = ctx.createLinearGradient(0, y - rh * 1.5, 0, H + rh);
          const opacity = clamp(.12 + scale * .60, .12, .78);
          shoulder.addColorStop(0, rgba(c.ridge, opacity)); shoulder.addColorStop(.24, rgba(i > 5 ? c.ridge : c.land, opacity)); shoulder.addColorStop(1, rgba(c.near, opacity));
          ctx.fillStyle = shoulder;
          ctx.beginPath(); ctx.moveTo(x - rw, y + rh * .8);
          if (scene === 0) {
            ctx.bezierCurveTo(x - rw * .85, y + rh * .08, x - rw * .66, y - rh * .1, x - rw * .48, y - rh * .69);
            ctx.quadraticCurveTo(x - rw * .33, y - rh * 1.62, x - rw * .16, y - rh * .72);
            ctx.quadraticCurveTo(x - rw * .05, y - rh * .29, x + rw * .1, y - rh * .66);
            ctx.quadraticCurveTo(x + rw * .24, y - rh * 1.02, x + rw * .45, y - rh * .1);
          } else {
            ctx.bezierCurveTo(x - rw * .8, y + rh * .14, x - rw * .62, y - rh * .36, x - rw * .22, y - rh * .8);
            ctx.bezierCurveTo(x - rw * .05, y - rh * 1.4, x + rw * .28, y - rh * .18, x + rw * .45, y - rh * .1);
          }
          ctx.bezierCurveTo(x + rw * .72, y - rh * .04, x + rw * .84, y + rh * .5, x + rw, y + rh * .8);
          // The river bank curls away under either wing. Closing a hill with
          // vertical sides would leave columns running down the whole valley.
          if (side < 0) {
            ctx.bezierCurveTo(x + rw * .8, y + rh * 2, center - W * .3, H * .88, -W * .15, H * 1.2);
            ctx.lineTo(-W * 2, H * 1.2); ctx.lineTo(-W * 2, y + rh * .8);
          } else {
            ctx.lineTo(W * 2, H * 1.2); ctx.lineTo(W * 1.15, H * 1.2);
            ctx.bezierCurveTo(center + W * .3, H * .88, x - rw * .8, y + rh * 2, x - rw, y + rh * .8);
          }
          ctx.closePath(); ctx.fill();
          // Lit shoulders soften the solid silhouettes into layers of paper.
          ctx.strokeStyle = rgba(c.mist, .045 + scale * .075); ctx.lineWidth = .6;
          ctx.beginPath(); ctx.moveTo(x - rw * .75, y + rh * .03); ctx.bezierCurveTo(x - rw * .4, y - rh * .28, x - rw * .1, y - rh * .89, x + rw * .39, y - rh * .12); ctx.stroke();
          if (scene === 2 && scale > .22 && scale < 1) {
            for (let tree = 0; tree < 5; tree++) {
              const tx = x + (tree - 2) * rw * .14, ty = y - rh * (.25 + Math.sin(tree * .65) * .15), th = rh * (.11 + random(seed + tree) * .15);
              ctx.fillStyle = rgba('#183f3d', .35 + scale * .28); ctx.beginPath(); ctx.moveTo(tx, ty - th); ctx.quadraticCurveTo(tx - th * .7, ty - th * .1, tx - th * .39, ty); ctx.lineTo(tx + th * .39, ty); ctx.quadraticCurveTo(tx + th * .7, ty - th * .1, tx, ty - th); ctx.fill();
            }
          }
        }
      }

      // Long shafts of sunset and the far mist make a luminous breathing space.
      const mist = ctx.createLinearGradient(0, horizon - H * .04, 0, horizon + H * .22);
      mist.addColorStop(0, rgba(c.mist, 0)); mist.addColorStop(.31, rgba(c.mist, .29)); mist.addColorStop(.56, rgba(c.mist, .14)); mist.addColorStop(1, rgba(c.mist, 0));
      ctx.fillStyle = mist; ctx.fillRect(0, horizon - H * .04, W, H * .27);
      if (scene === 1 || scene === 2) {
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = rgba(c.light, .023 - i * .004); ctx.beginPath(); ctx.moveTo(W * .73 + i * D * .03, H * .26); ctx.lineTo(W * (.34 + i * .2), H); ctx.lineTo(W * (.46 + i * .21), H); ctx.closePath(); ctx.fill();
        }
      }
      const cloud = this.cloud(scene), cloudRows = quality < .7 || options.calm ? 5 : 8;
      if (cloud) for (let i = cloudRows; i >= 0; i--) {
        const serial = Math.floor(distance / 130) + i, z = serial * 130 + 155 - distance, scale = 150 / (z + 185);
        const side = serial % 2 ? 1 : -1, x = center + side * W * (.34 + random(serial + 41) * .7) * scale;
        const y = horizon + groundHeight * (.05 + scale * .57) + Math.sin(time * .065 + serial) * H * .004;
        const cw = W * (.5 + random(serial + 3) * .4) * scale, ch = cw * .425;
        ctx.globalAlpha = (.42 + scale * .35) * (altitude > .65 ? 1.3 : 1);
        ctx.drawImage(cloud, x - cw / 2 - steering * D * scale * .04, y - ch * .5, cw, ch);
      }
      ctx.globalAlpha = 1;

      // A few near details provide scale without covering the route in noise.
      if (scene === 1) {
        const wheat = quality < .7 ? 18 : 34;
        ctx.strokeStyle = rgba('#f7cf8d', .34); ctx.lineWidth = .8; ctx.beginPath();
        for (let i = 0; i < wheat; i++) {
          const serial = Math.floor(distance / 11) + i, z = serial * 11 + 40 - distance, scale = 70 / (z + 105), side = i % 2 ? 1 : -1;
          const x = center + side * W * (.6 + random(serial + 7) * .4) * scale, y = horizon + groundHeight * scale * 1.5, h = D * .08 * scale;
          const sway = Math.sin(time * 1.2 + serial * .7) * h * .12;
          ctx.moveTo(x, y); ctx.quadraticCurveTo(x, y - h * .6, x + sway, y - h);
          for (let ear = 0; ear < 3; ear++) { const ey = y - h + ear * h * .1; ctx.moveTo(x + sway - h * .08, ey - h * .05); ctx.lineTo(x + sway, ey + h * .07); ctx.lineTo(x + sway + h * .08, ey - h * .05); }
        }
        ctx.stroke();
      } else if (scene === 2 || scene === 3) {
        for (let i = 0; i < 16; i++) {
          const progress = ((random(i + 56) + distance * (.0006 + random(i) * .0004)) % 1), x = random(i + 30) * W + Math.sin(time * .19 + i) * D * .025, y = horizon + progress * groundHeight;
          ctx.fillStyle = rgba(scene === 2 ? '#f0ecc0' : '#e5d8f0', (.14 + progress * .36) * (.65 + Math.sin(time * .7 + i) * .25));
          ctx.beginPath(); ctx.arc(x - steering * D * progress * .04, y, .45 + progress * 1.15, 0, TAU); ctx.fill();
        }
      }
      ctx.restore();
    }
  }
  return {WindborneScenery};
});
