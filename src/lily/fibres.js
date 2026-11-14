import * as THREE from 'three';
import { hsv } from './generator.js';

// Style 2 – "Fibres / halo": a glowing flower wrapped in a fine, shimmering halo.
//  - thousands of very thin strands growing out of the surface, coloured like the surface, fading out at the tip
//  - strands get longer and brighter at the silhouette (where you look along the surface), like a glow aura
//  - glittering dust that streams outwards from the surface and fades
//  - optional long threads between petals (from the first reference)
// Everything is additive, so it glows together with the bloom pass.

export const fibreUniforms = {
  uTime: { value: 0 },
  uLen: { value: 0.07 },
  uHalo: { value: 1.5 },
  uWiggle: { value: 0.25 },
  uWiggleSpeed: { value: 2 },
  uShimmer: { value: 0.4 },
  uReveal: { value: 1 },        // 0 = nothing, 1 = all grown
  uBreath: { value: 0 },        // extra length while breathing in
  uOpacity: { value: 0.35 },
  uTipWhite: { value: 0.5 },
  uDustDist: { value: 0.25 },
  uDustSpeed: { value: 0.25 },
  uDustOpacity: { value: 0.6 },
  uDustSize: { value: 1.5 },
  uStrandFraction: { value: 1 },  // share of the sampled strands that is visible (animated count)
  uDustFraction: { value: 1 },
  uPixelRatio: { value: 1 },
  uThreadOpacity: { value: 0 },
  uDissolve: { value: 0 },        // page 6: 0 -> 1 the dust breaks away and drifts off (0 = no effect)
  uDissolveDist: { value: 0.6 },  // how far the loose dust flies (flower units)
  uUp: { value: new THREE.Vector3(0, 1, 0) },   // 'up' on screen, in the flower's own space
  uRise: { value: 0.3 },          // how far the loose dust rises (flower units)
  uDissolveShare: { value: 1 },   // share of the dust that breaks away (1 = all)
};

// rim = 1 where we look along the surface (silhouette), 0 where we look straight at it
const RIM = /* glsl */ `
  float rimOf(vec3 base, vec3 n) {
    vec4 mv = modelViewMatrix * vec4(base, 1.0);
    vec3 nv = normalize(normalMatrix * n);
    return 1.0 - abs(dot(nv, normalize(-mv.xyz)));
  }`;

const STRAND_VS = /* glsl */ `
  uniform float uTime, uLen, uHalo, uWiggle, uWiggleSpeed, uShimmer, uReveal, uBreath, uOpacity, uTipWhite, uStrandFraction;
  attribute vec3 aBase; attribute vec3 aNormal; attribute vec3 aDir; attribute vec3 aColor;
  attribute vec4 aRand;          // x: length, y: phase, z: growth (when it appears), w: 0 root / 1 tip
  varying vec3 vColor; varying float vAlpha;
  ${RIM}
  void main() {
    float grow = smoothstep(aRand.z * 0.75, aRand.z * 0.75 + 0.25, uReveal);
    if (fract(aRand.y * 7.31) > uStrandFraction) grow = 0.0;              // hidden when the count is lowered
    float rim = rimOf(aBase, aNormal);
    float halo = mix(0.35, 1.0 + uHalo, rim * rim);                         // longer at the silhouette
    float t = uTime * uWiggleSpeed + aRand.y * 6.283;
    float shimmer = 1.0 - uShimmer * (0.5 + 0.5 * sin(uTime * 7.0 + aRand.y * 40.0));
    float L = uLen * aRand.x * grow * halo * shimmer * (1.0 + uBreath);
    vec3 p = aBase;
    if (aRand.w > 0.5) {
      vec3 wob = vec3(sin(aBase.y * 9.0 + t), sin(aBase.z * 8.0 + t * 1.3 + 1.7), sin(aBase.x * 7.0 + t * 0.8 + 3.1));
      p += normalize(aNormal * 0.8 + aDir * 0.35) * L + wob * uWiggle * L;
    }
    vColor = mix(aColor, vec3(1.0), aRand.w * uTipWhite);
    float a = uOpacity * min(grow * 1.5, 1.0) * mix(0.2, 1.6, rim * rim);     // mostly visible at the silhouette
    vAlpha = grow <= 0.0 ? 0.0 : a * (1.0 - aRand.w);                       // fades out towards the tip
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;
const GLOW_FS = /* glsl */ `
  varying vec3 vColor; varying float vAlpha;
  void main() { if (vAlpha < 0.002) discard; gl_FragColor = vec4(vColor * vAlpha, vAlpha); }`;

const DUST_VS = /* glsl */ `
  uniform float uTime, uReveal, uDustDist, uDustSpeed, uDustOpacity, uDustSize, uPixelRatio, uHalo, uDustFraction;
  uniform float uDissolve, uDissolveDist, uRise, uDissolveShare; uniform vec3 uUp;
  attribute vec3 aBase; attribute vec3 aNormal; attribute vec3 aDir; attribute vec3 aColor;
  attribute vec4 aRand;          // x: speed, y: phase, z: growth, w: size
  varying vec3 vColor; varying float vAlpha;
  ${RIM}
  void main() {
    float grow = smoothstep(aRand.z * 0.75 + 0.1, aRand.z * 0.75 + 0.35, uReveal);
    if (fract(aRand.y * 7.31) > uDustFraction) grow = 0.0;
    float life = fract(uTime * uDustSpeed * (0.5 + aRand.x) + aRand.y);    // 0 = just left the surface, 1 = gone
    float rim = rimOf(aBase, aNormal);
    vec3 dir = normalize(aNormal + aDir * 0.6);
    // uDustDist moves between the 'breathing in' and 'breathing out' distance (set from main.js)
    vec3 p = aBase + dir * uDustDist * life * (0.4 + aRand.x)
           + vec3(sin(uTime + aRand.y * 20.0), cos(uTime * 0.8 + aRand.y * 13.0), sin(uTime * 0.6 + aRand.y * 7.0)) * 0.01;
    vColor = mix(aColor, vec3(1.0), 0.35) * 1.6;
    vAlpha = uDustOpacity * grow * sin(3.14159 * life) * mix(0.4, 1.0 + uHalo * 0.5, rim);
    float sizeBoost = 1.0;
    if (uDissolve > 0.0) {
      // breaking apart: each grain lets go once (tips first, like the petals), drifts off and up, and fades
      float rel = (1.0 - aRand.z) * 0.45 + fract(aRand.y * 13.7) * 0.25;
      float t = clamp((uDissolve - rel) / 0.3, 0.0, 1.0);
      if (t > 0.0) {
        p = aBase + dir * uDissolveDist * t * (0.3 + aRand.x) + uUp * uRise * t * t
          + vec3(sin(uTime * 2.0 + aRand.y * 20.0), cos(uTime * 1.7 + aRand.y * 13.0), sin(uTime * 1.3 + aRand.y * 7.0)) * 0.03 * t;
        vAlpha = uDustOpacity * 1.4 * grow * smoothstep(0.0, 0.1, t) * (1.0 - t);   // grow: only parts that were built
        if (fract(aRand.y * 7.31) > uDissolveShare) vAlpha = 0.0;               // fewer grains when it falls apart
        sizeBoost = 1.3;
      } else {
        vAlpha *= 1.0 - smoothstep(0.0, 0.3, uDissolve);           // the normal dust calms down
      }
    }
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = vAlpha > 0.002 ? uDustSize * aRand.w * uPixelRatio * sizeBoost : 0.0;
  }`;
const DUST_FS = /* glsl */ `
  varying vec3 vColor; varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.1, d) * vAlpha;
    if (a < 0.002) discard;
    gl_FragColor = vec4(vColor * a, a);
  }`;

const THREAD_VS = /* glsl */ `
  uniform float uReveal, uThreadOpacity, uTime;
  attribute float aPhase;
  varying float vAlpha;
  void main() {
    vAlpha = uThreadOpacity * smoothstep(0.5, 1.0, uReveal) * (0.6 + 0.4 * sin(uTime * 0.7 + aPhase * 6.283));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const THREAD_FS = /* glsl */ `
  varying float vAlpha;
  void main() { if (vAlpha < 0.002) discard; gl_FragColor = vec4(vec3(0.95, 0.93, 1.0) * vAlpha, vAlpha); }`;

function seeded(seed) { let s = seed >>> 0 || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9 >>> 0) / 4294967296); }
const glowMat = (vs, fs, u = fibreUniforms) => new THREE.ShaderMaterial({
  uniforms: u, vertexShader: vs, fragmentShader: fs,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
});

export class Fibres extends THREE.Group {
  constructor(lily, params, u = fibreUniforms) {        // u: own uniforms (optional, page 4 flowers)
    super();
    this.lily = lily; this.params = params;
    this.strandMat = glowMat(STRAND_VS, GLOW_FS, u);
    this.dustMat = glowMat(DUST_VS, DUST_FS, u);
    this.threadMat = glowMat(THREAD_VS, THREAD_FS, u);
    this.key = ''; this.seenVersion = -1; this.colourKey = '';
  }

  // call every frame while style 2 is on: resamples / follows the flower when it changes
  // counts = how many strands / dust particles to sample (the most any breathing value needs)
  update(counts = { strands: this.params['Strand Count'], dust: this.params['Dust Count'] }) {
    this.counts = counts;
    this.atVertices = Boolean(counts.atVertices);       // page 5: dust starts exactly at the vertices
    const g = this.lily.geometry; if (!g) return;
    const p = this.params;
    const key = `${this.lily.layout}/${this.atVertices}/${counts.strands}/${counts.dust}/${p['Thread Count']}/${p['Edge Fuzz']}`;
    if (key !== this.key) { this.key = key; this.#sample(); this.seenVersion = -1; this.colourKey = ''; }
    if (this.lily.version !== this.seenVersion) { this.seenVersion = this.lily.version; this.#follow(); }
    const ck = ['Blossom Hue', 'Blossom Saturation', 'Blossom Value', 'Dark Specks'].map((k) => p[k]).join('/');
    if (ck !== this.colourKey) { this.colourKey = ck; this.#colour(); }
  }

  // random points on the surface (more on big triangles), stored as triangle + barycentric coordinates
  #sample() {
    const g = this.lily.geometry, idx = g.index.array, pos = g.attributes.position.array;
    const triCount = idx.length / 3;
    const areas = new Float32Array(triCount); let total = 0;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let t = 0; t < triCount; t++) {
      a.fromArray(pos, idx[t * 3] * 3); b.fromArray(pos, idx[t * 3 + 1] * 3); c.fromArray(pos, idx[t * 3 + 2] * 3);
      total += b.sub(a).cross(c.sub(a)).length() * 0.5; areas[t] = total;
    }
    const ns = Math.max(0, Math.round(this.counts.strands));
    const nd = Math.max(0, Math.round(this.counts.dust));
    const n = ns + nd;
    this.ns = ns; this.nd = nd;
    const rnd = seeded(1234);
    const u = g.attributes.aU.array, v = g.attributes.aV.array, part = g.attributes.aPart.array, growth = g.attributes.aGrowth.array;
    this.tri = new Uint32Array(n); this.bary = new Float32Array(n * 2); this.side = new Float32Array(n);
    this.info = new Float32Array(n * 3);
    this.grow = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const r = rnd() * total;
      let lo = 0, hi = triCount - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (areas[mid] < r) lo = mid + 1; else hi = mid; }
      let b1 = rnd(), b2 = rnd(); if (b1 + b2 > 1) { b1 = 1 - b1; b2 = 1 - b2; }
      if (this.atVertices) { b1 = 0; b2 = 0; }                           // a corner of the triangle = a vertex
      this.tri[i] = lo; this.bary[i * 2] = b1; this.bary[i * 2 + 1] = b2; this.side[i] = rnd() < 0.5 ? -1 : 1;
      const i0 = idx[lo * 3], i1 = idx[lo * 3 + 1], i2 = idx[lo * 3 + 2], b0 = 1 - b1 - b2;
      this.info.set([part[i0], u[i0] * b0 + u[i1] * b1 + u[i2] * b2, v[i0] * b0 + v[i1] * b1 + v[i2] * b2], i * 3);
      this.grow[i] = growth[i0] * b0 + growth[i1] * b1 + growth[i2] * b2;
    }

    // strands: 2 vertices each (root + tip)
    const sBase = new Float32Array(ns * 6), sDir = new Float32Array(ns * 6), sRand = new Float32Array(ns * 8);
    for (let i = 0; i < ns; i++) {
      const [pp, pu, pv] = [this.info[i * 3], this.info[i * 3 + 1], this.info[i * 3 + 2]];
      let len = 0.3 + 0.7 * rnd() * rnd();
      if (pp < 0.5) len *= 1 + this.params['Edge Fuzz'] * (Math.pow(Math.abs(pv), 4) + Math.pow(pu, 6));
      if (pp === 3 || pp === 4) len *= 0.5;
      const ph = rnd(), d = [rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1];
      for (let k = 0; k < 2; k++) { sDir.set(d, (i * 2 + k) * 3); sRand.set([len, ph, this.grow[i], k], (i * 2 + k) * 4); }
    }
    this.strands = this.#replace(this.strands, THREE.LineSegments, this.strandMat, {
      position: [sBase, 3], aBase: [sBase, 3], aNormal: [new Float32Array(ns * 6), 3],
      aDir: [sDir, 3], aColor: [new Float32Array(ns * 6), 3], aRand: [sRand, 4],
    });

    // dust: 1 vertex each
    const dBase = new Float32Array(nd * 3), dDir = new Float32Array(nd * 3), dRand = new Float32Array(nd * 4);
    for (let j = 0; j < nd; j++) {
      dDir.set([rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1], j * 3);
      dRand.set([rnd(), rnd(), this.grow[ns + j], 0.6 + rnd() * 1.4], j * 4);
    }
    this.dust = this.#replace(this.dust, THREE.Points, this.dustMat, {
      position: [dBase, 3], aBase: [dBase, 3], aNormal: [new Float32Array(nd * 3), 3],
      aDir: [dDir, 3], aColor: [new Float32Array(nd * 3), 3], aRand: [dRand, 4],
    });

    // long threads between random strand roots that are not too close and not too far apart
    const tc = Math.round(this.params['Thread Count']);
    this.pairs = [];
    const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
    for (let tries = 0; this.pairs.length < tc * 2 && tries < tc * 30 && ns > 1; tries++) {
      const i = Math.floor(rnd() * ns), j = Math.floor(rnd() * ns);
      this.#pointAt(i, tmpA); this.#pointAt(j, tmpB);
      const dd = tmpA.distanceTo(tmpB);
      if (dd > 0.25 && dd < 1.2) this.pairs.push(i, j);
    }
    const tph = new Float32Array(this.pairs.length);
    for (let k = 0; k < tph.length; k += 2) { tph[k] = tph[k + 1] = rnd(); }
    this.threads = this.#replace(this.threads, THREE.LineSegments, this.threadMat, {
      position: [new Float32Array(this.pairs.length * 3), 3], aPhase: [tph, 1],
    });
  }

  #replace(old, Type, mat, attrs) {
    if (old) { this.remove(old); old.geometry.dispose(); }
    const geo = new THREE.BufferGeometry();
    for (const [name, [arr, size]] of Object.entries(attrs)) geo.setAttribute(name, new THREE.BufferAttribute(arr, size));
    const obj = new Type(geo, mat);
    obj.frustumCulled = false; this.add(obj);
    return obj;
  }

  #pointAt(i, out) {
    const g = this.lily.geometry, idx = g.index.array, pos = g.attributes.position.array;
    const t = this.tri[i], b1 = this.bary[i * 2], b2 = this.bary[i * 2 + 1], b0 = 1 - b1 - b2;
    const i0 = idx[t * 3] * 3, i1 = idx[t * 3 + 1] * 3, i2 = idx[t * 3 + 2] * 3;
    return out.set(pos[i0] * b0 + pos[i1] * b1 + pos[i2] * b2, pos[i0 + 1] * b0 + pos[i1 + 1] * b1 + pos[i2 + 1] * b2, pos[i0 + 2] * b0 + pos[i1 + 2] * b1 + pos[i2 + 2] * b2);
  }
  #normalAt(i, out) {
    const g = this.lily.geometry, idx = g.index.array, nor = g.attributes.normal.array;
    const t = this.tri[i], b1 = this.bary[i * 2], b2 = this.bary[i * 2 + 1], b0 = 1 - b1 - b2;
    const i0 = idx[t * 3] * 3, i1 = idx[t * 3 + 1] * 3, i2 = idx[t * 3 + 2] * 3;
    return out.set(nor[i0] * b0 + nor[i1] * b1 + nor[i2] * b2, nor[i0 + 1] * b0 + nor[i1 + 1] * b1 + nor[i2 + 1] * b2, nor[i0 + 2] * b0 + nor[i1 + 2] * b1 + nor[i2 + 2] * b2)
      .normalize().multiplyScalar(this.side[i]);
  }

  // move roots with the flower (breathing, slider changes)
  #follow() {
    const pt = new THREE.Vector3(), nn = new THREE.Vector3();
    const sb = this.strands.geometry.attributes.aBase, sn = this.strands.geometry.attributes.aNormal;
    for (let i = 0; i < this.ns; i++) {
      this.#pointAt(i, pt); this.#normalAt(i, nn);
      sb.array.set([pt.x, pt.y, pt.z, pt.x, pt.y, pt.z], i * 6);
      sn.array.set([nn.x, nn.y, nn.z, nn.x, nn.y, nn.z], i * 6);
    }
    sb.needsUpdate = sn.needsUpdate = true;
    const db = this.dust.geometry.attributes.aBase, dn = this.dust.geometry.attributes.aNormal;
    for (let j = 0; j < this.nd; j++) {
      this.#pointAt(this.ns + j, pt); this.#normalAt(this.ns + j, nn);
      db.array.set([pt.x, pt.y, pt.z], j * 3); dn.array.set([nn.x, nn.y, nn.z], j * 3);
    }
    db.needsUpdate = dn.needsUpdate = true;
    const tpos = this.threads.geometry.attributes.position;
    for (let k = 0; k < this.pairs.length; k++) { this.#pointAt(this.pairs[k], pt); tpos.array.set([pt.x, pt.y, pt.z], k * 3); }
    tpos.needsUpdate = true;
  }

  // colour = the flower colour underneath (+ optional dark specks)
  #colour() {
    const p = this.params;
    const tint = hsv(p['Blossom Hue'], p['Blossom Saturation'], p['Blossom Value']);
    const rnd = seeded(99);
    const colourAt = (i) => {
      const [pp, u, v] = [this.info[i * 3], this.info[i * 3 + 1], this.info[i * 3 + 2]];
      if (pp < 0.5) {
        const th = Math.min(u / 0.35, 1), vein = Math.max(0, 1 - Math.abs(v) / 0.35) * 0.7;
        const c = tint.map((t, k) => { const base = t * ([0.55, 0.75, 0.35][k] * (1 - th) + th); return base * (1 - vein) + t * t * vein; });
        if (rnd() < p['Dark Specks'] && u > 0.1 && u < 0.75) return [0.22, 0.02, 0.06];
        return c;
      }
      if (pp === 1 || pp === 2) return [0.16, 0.42, 0.10];
      if (pp === 4) return [0.70, 0.32, 0.06];
      return [0.95, 0.85, 0.35];
    };
    const sc = this.strands.geometry.attributes.aColor;
    for (let i = 0; i < this.ns; i++) { const c = colourAt(i); sc.array.set([...c, ...c], i * 6); }
    sc.needsUpdate = true;
    const dc = this.dust.geometry.attributes.aColor;
    for (let j = 0; j < this.nd; j++) dc.array.set(colourAt(this.ns + j), j * 3);
    dc.needsUpdate = true;
  }
}
