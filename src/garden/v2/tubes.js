// Page 8 – Garden, Version 2: the roots as smooth, organic 3D tubes, and the particles they dissolve into.
// Same idea as Version 1 (every root point becomes a ring of vertices; sway + depth wave in the vertex shader, so
// the mesh is only rebuilt when the roots change), but the shape is drawn the way the root video does it:
//  - flowing lines: every root is smoothed twice, together with a piece of the root it grows out of (and of the
//    root it joins, for roots that connected). So a branch leaves its parent along it, not at an angle, and a
//    connecting root merges into the other one
//  - rounded joints: where a branch starts it is as wide as its parent (a bit wider, like a web) and then narrows
//    smoothly; the same where a connecting root merges into another root
//  - the thickness swells and narrows slowly along every root; tips are soft and pointed
//  - depth: some roots lie further back. They are thinner, paler, and further from the glass, so the depth blur
//    makes them soft. Others are in front: darker, stronger, sharper
//  - a soft edge: the tube turns lighter towards its outline, and a faint halo lies around it (a slightly wider
//    copy of the tube, only its back side, fading out towards its edge)
import * as THREE from 'three';

export const RING = 8;                          // vertices around a tube
const MAX_POINTS = 12000;
const MAX_CAPS = 6000;

// the depth wave (same as Version 1)
export function waveZ(x, y, t) {
  return Math.sin(x * 2.0 + t * 0.7 + Math.sin(y * 1.6 - t * 0.5)) * Math.sin(y * 1.7 - t * 0.6 + 1.7) * 0.6
    + Math.sin(x * 3.1 - y * 2.3 + t * 1.1) * 0.4;
}
export const WAVE_PERIOD = 20 * Math.PI;
const WAVE_GLSL = /* glsl */ `
  float gdWave(vec2 p, float t) {
    return sin(p.x * 2.0 + t * 0.7 + sin(p.y * 1.6 - t * 0.5)) * sin(p.y * 1.7 - t * 0.6 + 1.7) * 0.6
         + sin(p.x * 3.1 - p.y * 2.3 + t * 1.1) * 0.4;
  }`;
export function swayAngle(phase, t, amount) {
  return amount * (0.7 * Math.sin(t * 0.37 + phase) + 0.3 * Math.sin(t * 0.19 + phase * 2.0));
}
export const SWAY_PERIOD = 200 * Math.PI;
export const originPhase = (ox, oy) => ((((Math.sin(ox * 12.9898 + oy * 78.233) * 43758.5453) % 1) + 1) % 1) * Math.PI * 2;

// shared vertex code of the tube and its halo: sway, depth wave, depth layer, thinning when dissolving
const TUBE_VERT = /* glsl */ `
  attribute vec4 aInfo; attribute vec2 aOrigin; attribute float aLayer;
  uniform float uTime, uWaveT, uSwayT, uThick, uSwayAmt, uWaveAmt, uFadeLen, uDepthAmt, uGlowW;
  ${WAVE_GLSL}
  vec3 tubePos(vec3 pos, vec3 nrm, float grow, out float r) {
    r = aInfo.x * uThick * (1.0 - smoothstep(aInfo.y, aInfo.y + uFadeLen, uTime));
    vec2 d = pos.xy - aOrigin;
    float a = uSwayAmt * (0.7 * sin(uSwayT * 0.37 + aInfo.w) + 0.3 * sin(uSwayT * 0.19 + aInfo.w * 2.0));
    vec2 c = aOrigin + vec2(cos(a) * d.x - sin(a) * d.y, sin(a) * d.x + cos(a) * d.y);
    float rr = r * grow;
    return vec3(c, gdWave(c, uWaveT) * uWaveAmt - aLayer * uDepthAmt) + nrm * rr;
  }`;

// the depth layer of a root: 0 = in front ... 1 = furthest back. Mostly the same as the root it grows from
function layerOf(root, alive) {
  if (root._layer !== undefined) return root._layer;
  const p = root.parent && alive(root.parent) ? root.parent : null;
  root._layer = p && Math.random() < 0.7 ? layerOf(p, alive)
    : Math.random() < 0.5 ? 0 : Math.min(1, 0.35 + 0.65 * Math.random() + 0.08 * root.depth);
  return root._layer;
}

const smoothstep = (x) => { const c = Math.min(Math.max(x, 0), 1); return c * c * (3 - 2 * c); };

// one box blur pass over a list of points (window i-R .. i+R, shorter at the ends), with prefix sums
function boxPass(a, R) {
  const n = a.length, sx = new Float64Array(n + 1), sy = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) { sx[i + 1] = sx[i] + a[i].x; sy[i + 1] = sy[i] + a[i].y; }
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - R), hi = Math.min(n - 1, i + R), c = hi - lo + 1;
    out[i] = { x: (sx[hi + 1] - sx[lo]) / c, y: (sy[hi + 1] - sy[lo]) / c };
  }
  return out;
}

export class RootTubes extends THREE.Group {
  constructor() {
    super();
    const cap = MAX_POINTS * RING + MAX_CAPS;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cap * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(cap * 3), 3));
    g.setAttribute('aInfo', new THREE.BufferAttribute(new Float32Array(cap * 4), 4));     // width, gone time, tone, sway phase
    g.setAttribute('aOrigin', new THREE.BufferAttribute(new Float32Array(cap * 2), 2));   // where its cluster started
    g.setAttribute('aLayer', new THREE.BufferAttribute(new Float32Array(cap), 1));        // depth layer (0 front ... 1 back)
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(MAX_POINTS * RING * 6 + MAX_CAPS * RING * 3), 1));
    g.setDrawRange(0, 0);
    for (const a of Object.values(g.attributes)) a.setUsage(THREE.DynamicDrawUsage);
    g.index.setUsage(THREE.DynamicDrawUsage);
    this.geometry = g;

    const u = {
      uTime: { value: 0 }, uWaveT: { value: 0 }, uSwayT: { value: 0 },
      uThick: { value: 1 }, uSwayAmt: { value: 0 }, uWaveAmt: { value: 0 }, uFadeLen: { value: 0.8 }, uDepthAmt: { value: 0 },
      uColA: { value: new THREE.Color('#8fae3c') }, uColB: { value: new THREE.Color('#5f8a3a') },
      uFaint: { value: new THREE.Color('#c8d0bf') }, uFadeAmt: { value: 0.5 },
      uGlowCol: { value: new THREE.Color('#cfdcb4') }, uGlow: { value: 0.4 }, uGlowW: { value: 1.2 },
    };
    this.u = u;

    // the tube itself (lit, like Version 1), lighter towards its outline, paler further back
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0, side: THREE.DoubleSide });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          ${TUBE_VERT}
          varying float vTone; varying float vLayer;`)
        .replace('#include <begin_vertex>', `
          vTone = aInfo.z; vLayer = aLayer;
          float lkR; vec3 transformed = tubePos(position, normal, 1.0, lkR);`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform vec3 uColA, uColB, uFaint, uGlowCol; uniform float uFadeAmt, uGlow;
          varying float vTone; varying float vLayer;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec3 rc = mix(uColA, uColB, vTone);
          float back = clamp(vLayer * uFadeAmt, 0.0, 1.0);
          rc = mix(rc, rc * rc * 1.6, (1.0 - back) * 0.7);          // in front: deeper, stronger green
          rc = mix(rc, uFaint, back * 0.75);                        // further back: paler, fainter
          float facing = abs(dot(normalize(vNormal), normalize(vViewPosition)));
          rc = mix(rc, uGlowCol, smoothstep(0.45, 0.0, facing) * uGlow * 0.7);   // soft, lighter edge
          diffuseColor.rgb = rc;`);
    };
    mat.customProgramCacheKey = () => 'garden-roots-v2';
    this.tube = new THREE.Mesh(g, mat);

    // the halo: the same tube, wider, only its back side (so it shows around the tube, not over it), fading out
    const halo = new THREE.ShaderMaterial({
      uniforms: u, transparent: true, depthWrite: false, side: THREE.BackSide,
      vertexShader: /* glsl */ `
        ${TUBE_VERT}
        varying float vFacing; varying float vLayer;
        void main() {
          float r; vec3 p = tubePos(position, normal, 1.0 + uGlowW, r);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vec3 n = normalize(normalMatrix * normal);
          vFacing = abs(dot(n, normalize(-mv.xyz)));
          vLayer = aLayer;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uGlowCol; uniform float uGlow, uFadeAmt;
        varying float vFacing; varying float vLayer;
        void main() {
          float a = pow(vFacing, 1.6) * uGlow * 0.4 * (1.0 - 0.6 * clamp(vLayer * uFadeAmt, 0.0, 1.0));
          if (a < 0.003) discard;
          gl_FragColor = vec4(uGlowCol, a);
        }`,
    });
    this.halo = new THREE.Mesh(g, halo);
    for (const m of [this.tube, this.halo]) { m.frustumCulled = false; this.add(m); }
    this.pointCount = 0;
    this._cos = []; this._sin = [];
    for (let k = 0; k < RING; k++) { const th = (k / RING) * Math.PI * 2; this._cos.push(Math.cos(th)); this._sin.push(Math.sin(th)); }
  }

  set layerMask(l) { this.tube.layers.set(l); this.halo.layers.set(l); }

  // the drawn line of a root (simulation pixels): smoothed together with the start of its parent and the end of
  // the root it joined, then put back exactly onto its parent / its tip / the root it joined
  #line(root, lines, look, alive) {
    const pts = root.points, n = pts.length;
    if (n < 2) return pts;
    const R = Math.max(1, Math.round(1 + look.smooth * 7));
    const K = Math.round(R * 2 * look.joint);               // context points from the parent / the joined root
    const pre = [], post = [];
    const pl = root.parent && alive(root.parent) ? lines.get(root.parent) : null;
    const ai = pl ? Math.min(root.attachIndex ?? 0, pl.length - 1) : 0;
    if (pl) for (let j = Math.max(0, ai - K); j < ai; j++) pre.push(pl[j]);
    const jn = root.joinedTo && alive(root.joinedTo.root) ? root.joinedTo : null;
    let jPt = null;
    if (jn) {
      const jl = lines.get(jn.root) ?? jn.root.points, ji = Math.min(jn.index, jl.length - 1);
      jPt = jl[ji];
      // continue along the joined root in the direction this root arrives
      const ax = pts[n - 1].x - pts[Math.max(n - 3, 0)].x, ay = pts[n - 1].y - pts[Math.max(n - 3, 0)].y;
      const nx = jl[Math.min(ji + 1, jl.length - 1)].x - jl[ji].x, ny = jl[Math.min(ji + 1, jl.length - 1)].y - jl[ji].y;
      const dir = ax * nx + ay * ny >= 0 ? 1 : -1;
      for (let k = 1; k <= K; k++) { const j = ji + dir * k; if (j < 0 || j >= jl.length) break; post.push(jl[j]); }
    }
    let a = [...pre, ...pts, ...post];
    a = boxPass(boxPass(a, R), R);
    const out = a.slice(pre.length, pre.length + n);
    // back onto the start (the parent's line, or where it was planted) and the end (the joined root, or its tip)
    const start = pl ? pl[ai] : pts[0], end = jPt ?? pts[n - 1];
    const dsx = start.x - out[0].x, dsy = start.y - out[0].y, dex = end.x - out[n - 1].x, dey = end.y - out[n - 1].y;
    const L = R * 2 + 2;
    for (let i = 0; i < n; i++) {
      const ws = 1 - smoothstep(i / L), we = 1 - smoothstep((n - 1 - i) / L);
      out[i] = { x: out[i].x + dsx * ws + dex * we, y: out[i].y + dsy * ws + dey * we };
    }
    // short twigs bow a little to one side instead of being straight (start and tip stay where they are)
    if (n >= 3 && n < 30 && !jn) {
      const side = (root._side ??= Math.random() < 0.5 ? -1 : 1);
      const len = Math.hypot(out[n - 1].x - out[0].x, out[n - 1].y - out[0].y);
      const amp = side * len * 0.14 * look.smooth * (1 - smoothstep((n - 18) / 12));
      const tx = (out[n - 1].x - out[0].x) / (len || 1), ty = (out[n - 1].y - out[0].y) / (len || 1);
      for (let i = 1; i < n - 1; i++) {
        const k = Math.sin(Math.PI * i / (n - 1)) * amp;
        out[i] = { x: out[i].x - ty * k, y: out[i].y + tx * k };
      }
    }
    return out;
  }

  // widths (px) and depth layers along a root
  #shape(root, look, alive) {
    const n = root.points.length;
    const w = new Float32Array(n), lay = new Float32Array(n);
    const off = (root._off ??= root.parent ? (root.parent._off ?? 0) + (root.attachIndex ?? 0) : 0);
    const seed = (root._seed ??= Math.random() * 100);
    // short twigs lie further back (fine, faint detail); a root comes forward as it grows longer
    const own = Math.max(layerOf(root, alive), 0.85 * (1 - smoothstep((n - 4) / 18)));
    const J = Math.round(4 + 14 * look.joint);                // points over which a joint blends
    const p = root.parent && alive(root.parent) && root.parent._w ? root.parent : null;
    const pi = p ? Math.min(root.attachIndex ?? 0, p._w.length - 1) : 0;
    const jn = root.joinedTo && alive(root.joinedTo.root) && root.joinedTo.root._w ? root.joinedTo : null;
    const ji = jn ? Math.min(jn.index, jn.root._w.length - 1) : 0;
    const v = look.thickVar;
    for (let i = 0; i < n; i++) {
      const total = off + i;
      // fuller than Version 1: branches stay thicker (x0.82 per level, not x0.72), less taper, thicker minimum
      let b = Math.max(5.0 * Math.pow(0.82, root.depth), 2.0) * (1 - 0.5 * Math.min(total / 160, 1));
      // slow, smooth swelling (two waves, different per root)
      b *= Math.max(0.25, 1 + v * (0.6 * Math.sin(total * 0.045 + seed) + 0.4 * Math.sin(total * 0.11 + seed * 1.7)));
      let l = own;
      if (p) {                                                 // grows out of its parent: as wide (a bit wider) at first
        const k = smoothstep(i / J), from = p._w[pi] * (1 + 0.35 * look.joint);
        b = from + (b - from) * k; l = p._lay[pi] + (own - p._lay[pi]) * k;
      }
      if (jn) {                                                // merges into the root it joined
        const k = smoothstep((n - 1 - i) / J), to = jn.root._w[ji] * (1 + 0.35 * look.joint);
        b = to + (b - to) * k; l = jn.root._lay[ji] + (l - jn.root._lay[ji]) * k;
      } else {                                                 // a soft tip: narrows, then a round end (see the cap)
        b *= 0.3 + 0.7 * Math.pow(Math.min((n - 1 - i) / 12, 1), 0.8);
      }
      w[i] = Math.max(b * (1 - 0.4 * l * look.depth), 0.25);   // further back: thinner
      lay[i] = l;
    }
    root._w = w; root._lay = lay;
  }

  // rebuild from the simulation. toWorld(x, y) maps simulation pixels to world units; pxUnit = world units per pixel;
  // look: { smooth, joint, thickVar, depth } (0..1 each)
  rebuild(growth, toWorld, pxUnit, look) {
    const g = this.geometry;
    const pos = g.attributes.position.array, nor = g.attributes.normal.array, info = g.attributes.aInfo.array;
    const org = g.attributes.aOrigin.array, layA = g.attributes.aLayer.array, idx = g.index.array;
    const roots = growth.roots, alive = (r) => roots.includes(r);
    const lines = new Map();
    for (const root of roots) { lines.set(root, this.#line(root, lines, look, alive)); this.#shape(root, look, alive); }
    let v = 0, ii = 0, points = 0, caps = 0;
    for (const root of roots) {
      const line = lines.get(root), pts = root.points, last = pts.length - 1;
      const from = Math.min(root.visibleFrom ?? 0, root.cut ?? 0);
      if (last - from < 1 || points + (last - from + 1) > MAX_POINTS) continue;
      const c = growth.centerOf(root), [ox, oy] = toWorld(c.x, c.y);
      const phase = originPhase(ox, oy);
      const tone = growth.toneOf(root);
      const put = (x, y, z, nx, ny, nz, w, gone, lay) => {
        pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
        nor[v * 3] = nx; nor[v * 3 + 1] = ny; nor[v * 3 + 2] = nz;
        info[v * 4] = w; info[v * 4 + 1] = gone; info[v * 4 + 2] = tone; info[v * 4 + 3] = phase;
        org[v * 2] = ox; org[v * 2 + 1] = oy; layA[v] = lay;
        return v++;
      };
      let prevRing = -1;
      for (let i = from; i <= last; i++) {
        const p = line[i], a = line[Math.max(i - 1, from)], b = line[Math.min(i + 1, last)];
        let tx = b.x - a.x, ty = -(b.y - a.y);
        const len = Math.hypot(tx, ty) || 1; tx /= len; ty /= len;
        const nx = -ty, ny = tx;
        const [wx, wy] = toWorld(p.x, p.y);
        const w = root._w[i] * pxUnit * 0.5, gone = pts[i].dissolveAt ?? 1e9, lay = root._lay[i];
        const ring = v;
        for (let k = 0; k < RING; k++) put(wx, wy, 0, this._cos[k] * nx, this._cos[k] * ny, this._sin[k], w, gone, lay);
        if (prevRing >= 0) {
          for (let k = 0; k < RING; k++) {
            const k2 = (k + 1) % RING, a0 = prevRing + k, a1 = prevRing + k2, b0 = ring + k, b1 = ring + k2;
            idx[ii++] = a0; idx[ii++] = b0; idx[ii++] = b1;
            idx[ii++] = a0; idx[ii++] = b1; idx[ii++] = a1;
          }
        } else if (!(root.parent && alive(root.parent)) && caps < MAX_CAPS) {
          // a round cap where a root starts on its own (the middle of a planted spot): a point pushed back along it
          const tip = put(wx - tx * w * 0.9, wy - ty * w * 0.9, 0, -tx, -ty, 0, 0, gone, lay);   // radius 0: sits exactly there
          for (let k = 0; k < RING; k++) { idx[ii++] = tip; idx[ii++] = ring + ((k + 1) % RING); idx[ii++] = ring + k; }
          caps++;
        }
        prevRing = ring; points++;
        if (i === last && !(root.joinedTo && alive(root.joinedTo.root)) && caps < MAX_CAPS) {
          const tip = put(wx + tx * w * 0.9, wy + ty * w * 0.9, 0, tx, ty, 0, 0, gone, lay);
          for (let k = 0; k < RING; k++) { idx[ii++] = tip; idx[ii++] = ring + k; idx[ii++] = ring + ((k + 1) % RING); }
          caps++;
        }
      }
    }
    this.pointCount = points;
    this.lines = lines;
    g.setDrawRange(0, ii);
    for (const a of Object.values(g.attributes)) { a.addUpdateRange(0, v * a.itemSize); a.needsUpdate = true; }
    g.index.addUpdateRange(0, ii); g.index.needsUpdate = true;
  }

  // how far back a point of a root lies (world units, for the flowers on it)
  depthAt(root, index) { return (root._lay?.[Math.min(index, root._lay.length - 1)] ?? 0) * this.u.uDepthAmt.value; }
}

// ---- particles (same as Version 1)
const MAX_PARTICLES = 24000;
export class Particles extends THREE.Points {
  constructor() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3));
    g.setAttribute('aVel', new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3));
    g.setAttribute('aMeta', new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 4), 4));
    g.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3));
    for (const a of Object.values(g.attributes)) a.setUsage(THREE.DynamicDrawUsage);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPx: { value: 1000 } },
      transparent: true, depthWrite: false, blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      vertexShader: /* glsl */ `
        attribute vec3 aVel; attribute vec4 aMeta; attribute vec3 aColor;
        uniform float uTime, uPx;
        varying float vA; varying vec3 vCol;
        void main() {
          float age = uTime - aMeta.x, life = aMeta.y;
          if (age < 0.0 || age > life) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; return; }
          float loose = smoothstep(0.0, aMeta.w, age);
          float move = (1.0 - exp(-0.6 * age)) / 0.6;
          vec3 p = position + aVel * move * loose;
          float k = 1.0 - age / life;
          vA = k * smoothstep(0.0, 0.35, age); vCol = aColor;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = max(aMeta.z * k * uPx / -mv.z, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying float vA; varying vec3 vCol;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.12, d) * vA;
          if (a < 0.003) discard;
          gl_FragColor = vec4(vCol * a, a);
        }`,
    });
    super(g, mat);
    this.frustumCulled = false;
    this.head = 0;
  }
  spawn(list) {
    const g = this.geometry, pos = g.attributes.position.array, vel = g.attributes.aVel.array, meta = g.attributes.aMeta.array, col = g.attributes.aColor.array;
    for (const q of list) {
      const i = this.head; this.head = (this.head + 1) % MAX_PARTICLES;
      pos[i * 3] = q.x; pos[i * 3 + 1] = q.y; pos[i * 3 + 2] = q.z;
      vel[i * 3] = q.vx; vel[i * 3 + 1] = q.vy; vel[i * 3 + 2] = q.vz;
      meta[i * 4] = q.born; meta[i * 4 + 1] = q.life; meta[i * 4 + 2] = q.size; meta[i * 4 + 3] = q.loosen ?? 0.7;
      col[i * 3] = q.color[0]; col[i * 3 + 1] = q.color[1]; col[i * 3 + 2] = q.color[2];
    }
    if (list.length) for (const a of Object.values(g.attributes)) a.needsUpdate = true;
  }
}
