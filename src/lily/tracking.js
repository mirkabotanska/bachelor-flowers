import * as THREE from 'three';

// Style 3 – "Tracking": selection rectangles that find parts of the flower and follow them,
// like computer-vision / blob-tracking overlays. Drawn on 2D canvases on top of the 3D view,
// so lines stay crisp and can be made thicker for a projector.
//
// Two overlay canvases:
//   this.canvas  – normal drawing (boxes, markers, lines, spotlight, pixelation)
//   this.invert  – CSS mix-blend-mode: difference, used to invert the flower inside the boxes

const ease = (x) => x * x * (3 - 2 * x);
const clamp01 = (x) => Math.min(Math.max(x, 0), 1);
const PART_SIZE = { 0: 0.22, 1: 0.1, 2: 0.16, 3: 0.08, 4: 0.06 };   // rough world size per part (petal, stem, leaf, stamen, anther)

export class Tracking {
  constructor(lily, camera, renderer, params) {
    this.lily = lily; this.camera = camera; this.renderer = renderer; this.params = params;
    this.canvas = this.#makeCanvas('tracking'); this.ctx = this.canvas.getContext('2d');
    this.invert = this.#makeCanvas('tracking-invert'); this.ictx = this.invert.getContext('2d');
    this.invert.style.mixBlendMode = 'difference';
    this.pix = document.createElement('canvas'); this.pctx = this.pix.getContext('2d');
    this.boxes = []; this.markers = [];
    this.v = new THREE.Vector3(); this.v2 = new THREE.Vector3();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  #makeCanvas(id) {
    const c = document.createElement('canvas'); c.id = id;
    Object.assign(c.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
    document.body.appendChild(c);
    return c;
  }

  resize() {
    this.dpr = this.renderer.getPixelRatio();
    for (const c of [this.canvas, this.invert]) { c.width = window.innerWidth * this.dpr; c.height = window.innerHeight * this.dpr; }
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ictx.clearRect(0, 0, this.invert.width, this.invert.height);
  }

  restart() { this.boxes = []; this.markers = []; this.time = 0; }

  // pick a vertex to follow. First choose a PART (so the petals, which have the most vertices,
  // don't win every time), then a vertex of that part, preferring tips.
  #pickTarget() {
    const g = this.lily.geometry; if (!g) return null;
    if (this.partsFor !== g || this.partsVersion !== this.lily.layout) {        // group vertex ids by part
      this.partsFor = g; this.partsVersion = this.lily.layout;
      this.byPart = { 0: [], 1: [], 2: [], 3: [], 4: [] };
      const part = g.attributes.aPart.array;
      for (let i = 0; i < part.length; i++) this.byPart[part[i]]?.push(i);
    }
    const share = this.params['Leaf & Stem Boxes'];                            // 0 = only flower, 1 = only leaves/stem
    const weights = { 0: (1 - share) * 0.6, 4: (1 - share) * 0.25, 3: (1 - share) * 0.15, 2: share * 0.75, 1: share * 0.25 };
    let total = 0;
    for (const k in weights) if (!this.byPart[k].length) weights[k] = 0; else total += weights[k];
    if (total <= 0) return Math.floor(Math.random() * g.attributes.position.count);
    let r = Math.random() * total, chosen = 0;
    for (const k in weights) { r -= weights[k]; if (r <= 0) { chosen = k; break; } }
    const list = this.byPart[chosen], u = g.attributes.aU.array;
    for (let tries = 0; tries < 12; tries++) {                                   // prefer the outer half of petals/leaves
      const i = list[Math.floor(Math.random() * list.length)];
      if ((chosen != 0 && chosen != 2) || Math.random() < 0.3 + 0.7 * u[i]) return i;
    }
    return list[Math.floor(Math.random() * list.length)];
  }

  // world position of a vertex -> screen pixels (canvas pixels), plus pixels per world unit there
  #project(i) {
    const pos = this.lily.geometry.attributes.position;
    this.v.fromBufferAttribute(pos, i).applyMatrix4(this.lily.matrixWorld);
    const dist = this.v.distanceTo(this.camera.position);
    this.v.project(this.camera);
    const w = this.canvas.width, h = this.canvas.height;
    const ppu = h / 2 / (Math.tan((this.camera.fov * Math.PI) / 360) * dist);
    return { x: (this.v.x * 0.5 + 0.5) * w, y: (-this.v.y * 0.5 + 0.5) * h, ppu, behind: this.v.z > 1 };
  }

  #spawnBox(delay = 0) {
    const p = this.params, i = this.#pickTarget(); if (i === null) return;
    const part = this.lily.geometry.attributes.aPart.array[i];
    const varr = p['Size Variation'];
    const size = PART_SIZE[part] * p['Box Size'] * (1 - varr * 0.6 + Math.random() * varr * 1.6);
    const aspect = 0.65 + Math.random() * 0.8;
    const life = p['Box Lifetime (s)'] * (0.7 + Math.random() * 0.6);
    this.boxes.push({ i, size, aspect, life, age: -delay, x: null, y: null, jx: 0, jy: 0, nextJump: Math.random(), label: (0.7 + Math.random() * 0.29).toFixed(2) });
  }

  update(dt, reveal) {
    const p = this.params;
    if (!this.lily.geometry) return;
    // keep the number of boxes; new ones come in staggered, so they don't all appear at once
    const want = Math.round(p['Box Count'] * reveal);
    this.boxes = this.boxes.filter((b) => b.age < b.life);
    while (this.boxes.length < want) this.#spawnBox(Math.random() * p['Box Lifetime (s)'] * 0.5);
    if (this.boxes.length > want) this.boxes.length = want;

    const follow = 1 - Math.pow(1 - clamp01(1 - p['Follow Smoothness'] * 0.97), dt * 60);
    for (const b of this.boxes) {
      b.age += dt;
      const s = this.#project(b.i);
      b.behind = s.behind;
      // small jumps now and then, like real tracking that is not perfectly sure
      b.nextJump -= dt;
      if (b.nextJump <= 0) {
        const j = p['Jitter'] * b.size * s.ppu * 0.5;
        b.jx = (Math.random() * 2 - 1) * j; b.jy = (Math.random() * 2 - 1) * j;
        b.nextJump = 0.3 + Math.random() * 1.2;
      }
      const tx = s.x + b.jx, ty = s.y + b.jy;
      if (b.x === null) { b.x = tx; b.y = ty; }
      b.x += (tx - b.x) * follow; b.y += (ty - b.y) * follow;
      b.w = b.size * s.ppu; b.h = b.w * b.aspect;
      const a = p['Appear Time (s)'];
      b.alpha = b.age < 0 ? 0 : ease(clamp01(b.age / a)) * (1 - ease(clamp01((b.age - (b.life - a)) / a)));
      b.scale = 0.55 + 0.45 * ease(clamp01(b.age / a));
    }

    // tiny flickering markers (the small squares and dots scattered around)
    const wantM = Math.round(p['Tiny Markers'] * reveal);
    this.markers = this.markers.filter((m) => m.age < m.life);
    while (this.markers.length < wantM) this.markers.push({ i: this.#pickTarget(), age: -Math.random() * 1.5, life: 0.6 + Math.random() * 1.6, size: 2 + Math.random() * 4, ox: (Math.random() * 2 - 1) * 30, oy: (Math.random() * 2 - 1) * 30, dot: Math.random() < 0.5 });
    if (this.markers.length > wantM) this.markers.length = wantM;
    for (const m of this.markers) {
      m.age += dt;
      const s = this.#project(m.i);
      m.x = s.x + m.ox * this.dpr; m.y = s.y + m.oy * this.dpr; m.behind = s.behind;
      m.alpha = m.age < 0 ? 0 : clamp01(m.age / 0.25) * clamp01((m.life - m.age) / 0.25);
    }
  }

  draw(sourceCanvas) {
    const p = this.params, ctx = this.ctx, W = this.canvas.width, H = this.canvas.height, d = this.dpr;
    this.clear();
    const live = this.boxes.filter((b) => b.alpha > 0.01 && !b.behind);
    const rectOf = (b) => { const w = b.w * b.scale, h = b.h * b.scale; return [b.x - w / 2, b.y - h / 2, w, h]; };

    // effect: pixelate the flower inside the boxes
    if (p['Pixelate Inside'] && sourceCanvas) {
      const px = Math.max(2, p['Pixel Size'] * d);
      for (const b of live) {
        const [x, y, w, h] = rectOf(b);
        const sw = Math.max(1, Math.round(w / px)), sh = Math.max(1, Math.round(h / px));
        this.pix.width = sw; this.pix.height = sh;
        this.pctx.drawImage(sourceCanvas, x, y, w, h, 0, 0, sw, sh);
        ctx.save(); ctx.globalAlpha = b.alpha; ctx.imageSmoothingEnabled = false;
        ctx.drawImage(this.pix, 0, 0, sw, sh, x, y, w, h); ctx.restore();
      }
    }

    // effect: dim everything outside the boxes
    if (p['Spotlight'] > 0) {
      ctx.save(); ctx.fillStyle = `rgba(0,0,0,${p['Spotlight']})`;
      ctx.beginPath(); ctx.rect(0, 0, W, H);
      for (const b of live) { const [x, y, w, h] = rectOf(b); ctx.rect(x + w, y, -w, h); }   // reversed = hole
      ctx.fill('evenodd'); ctx.restore();
    }

    // effect: invert the flower inside the boxes (on the 'difference' canvas)
    if (p['Invert Inside']) {
      for (const b of live) { const [x, y, w, h] = rectOf(b); this.ictx.fillStyle = `rgba(255,255,255,${b.alpha * 0.9})`; this.ictx.fillRect(x, y, w, h); }
    }

    const col = p['Box Colour'];
    ctx.save();
    ctx.strokeStyle = col; ctx.fillStyle = col;
    ctx.lineWidth = p['Line Width'] * d;

    // lines between boxes that are close to each other (like connections)
    if (p['Connect Lines'] > 0) {
      const maxD = 220 * d * p['Box Size'];
      ctx.lineWidth = Math.max(1, p['Line Width'] * d * 0.6);
      for (let a = 0; a < live.length; a++) for (let c = a + 1; c < live.length; c++) {
        const A = live[a], B = live[c], dd = Math.hypot(A.x - B.x, A.y - B.y);
        if (dd > maxD) continue;
        ctx.globalAlpha = p['Box Opacity'] * p['Connect Lines'] * Math.min(A.alpha, B.alpha) * (1 - dd / maxD);
        ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
      }
      ctx.lineWidth = p['Line Width'] * d;
    }

    // the boxes
    for (const b of live) {
      const [x, y, w, h] = rectOf(b);
      ctx.globalAlpha = p['Box Opacity'] * b.alpha;
      if (p['Corner Brackets']) {
        const c = Math.min(w, h) * 0.25;
        ctx.beginPath();
        for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
          ctx.moveTo(cx + sx * c, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + sy * c);
        }
        ctx.stroke();
      } else ctx.strokeRect(x, y, w, h);
      if (p['Centre Dots']) { ctx.fillRect(b.x - 1.5 * d, b.y - 1.5 * d, 3 * d, 3 * d); }
      if (p['Labels']) { ctx.font = `${9 * d}px ui-monospace, monospace`; ctx.fillText(b.label, x, y - 4 * d); }
    }

    // tiny markers
    for (const m of this.markers) {
      if (m.alpha <= 0 || m.behind) continue;
      ctx.globalAlpha = p['Box Opacity'] * m.alpha * 0.9;
      const s = m.size * d;
      if (m.dot) ctx.fillRect(m.x - s / 4, m.y - s / 4, s / 2, s / 2);
      else ctx.strokeRect(m.x - s / 2, m.y - s / 2, s, s);
    }
    ctx.restore();
  }
}
