import * as THREE from 'three';
import { TAU, petalPoint, rotX, rotY, rotZ, add, scl, rand, DEG } from './generator.js';
import { uniforms } from './materials.js';

// Style 7: particles that trace the outlines of the flower - petal edges, stamens, stem and leaf edges.
// They appear in the build-up order (stem bottom -> top, leaves, petals base -> tip), the solid flower
// follows, and afterwards a share of the particles stays as a soft dotted outline.

export const outlineUniforms = {
  uSpread: { value: 0.012 },      // how far particles sit from the exact outline (world units)
  uSize: { value: 2.4 },          // px
  uBright: { value: 1 },
  uAfter: { value: 0.25 },        // how much of the outline stays once the flower is built
  uTwinkle: { value: 0.3 },
  uDrift: { value: 0.3 },
  uPixelRatio: { value: 1 },
};

const toThree = ([x, y, z]) => [x, z, -y];     // Blender Z-up -> Three.js Y-up (same as the mesh)

// every outline as a function t (0..1) -> point, plus its growth at t (same timing as the mesh)
function outlineCurves(p, bloom) {
  const curves = [];
  const tilt = p['Head Tilt'], hs = p['Flower Head Scale'];
  const head = (l) => scl(rotX(l, tilt), hs);
  const n = p['Petals Per Ring'];

  // petal edges (left and right side of every petal, both rings)
  const ring = (lenF, bloomF, rotExtra) => {
    for (let i = 0; i < n; i++) {
      const ang = (TAU / n) * i + rotExtra;
      for (const v of [-1, 1]) {
        curves.push({ kind: 0, at: (t) => head(rotZ(petalPoint(p, t, v, lenF, bloomF, bloom), ang)), growth: (t) => 0.40 + 0.60 * t });
      }
    }
  };
  ring(1.0, 1.0, 0.0);
  ring(p['Inner Ring Scale'], 0.9, Math.PI / n + p['Petal Ring Rotation Offset'] * Math.PI);

  // stamens + pistil (their centre lines, from the middle outwards)
  const PL = Math.max(p['Petal Length'], 0.01);
  const sl = p['Stamen Scale'] * 0.75, spread = p['Stamen Spread'] * sl, sc = p['Stamen Count'];
  for (let i = 0; i < sc; i++) {
    const ang = (TAU / Math.max(sc, 1)) * i + 0.3;
    curves.push({ kind: 2, at: (t) => head(rotZ([spread * t * t, 0, sl * t], ang)), growth: (t) => 0.40 + 0.35 * Math.min(sl * t / PL, 1) });
  }
  const pl = p['Pistil Scale'] * 0.95;
  if (pl > 0) curves.push({ kind: 2, at: (t) => head([pl * 0.12 * t * t, 0, pl * t]), growth: (t) => 0.40 + 0.35 * Math.min(pl * t / PL, 1) });

  // stem: its two side edges
  const SL = p['Stem Length'], bend = p['Stem Bend'], thick = p['Stem Thickness'];
  if (SL > 0) {
    for (const side of [-1, 1]) {
      curves.push({
        kind: 1,
        at: (t) => {
          const T = [2 * bend * t, 0, -SL]; const tl = Math.hypot(T[0], T[2]) || 1;
          return add([bend * t * t, 0, -SL * t], scl([T[2] / tl, 0, -T[0] / tl], side * thick));
        },
        growth: (t) => 0.32 * (1 - t),
      });
    }
  }

  // leaves: both edges, from the stem to the tip
  const lc = p['Leaf Count'], seed = p['Leaf Seed'], rnd = p['Leaf Randomness'];
  for (let i = 0; i < lc; i++) {
    const frac = i / Math.max(lc - 1, 1);
    let tpos = p['Leaf Start (top)'] + (p['Leaf End (bottom)'] - p['Leaf Start (top)']) * frac;
    tpos += rand(seed + 1, i) * rnd * 0.04;
    const ppos = [bend * tpos * tpos, 0, -SL * tpos];
    const up = (p['Leaf Angle'] + rand(seed + 2, i) * rnd * 20) * DEG;
    const spin = p['Leaf Spiral Angle'] * DEG * i + rand(seed + 3, i) * rnd * 0.6;
    let lsc = p['Leaf Scale'] * (1 - p['Leaf Size Gradient'] * 0.5 + p['Leaf Size Gradient'] * frac);
    lsc *= 1 + rand(seed + 4, i) * rnd * 0.3;
    const LL = p['Leaf Length'];
    for (const lv of [-1, 1]) {
      curves.push({
        kind: 1,
        at: (lu) => {
          const lw = p['Leaf Width'] * Math.sin(Math.pow(lu, p['Leaf Tip Shape']) * Math.PI);
          const ly = lv * lw, lzc = p['Leaf Fold'] * lv * lv * lw, tw = p['Leaf Twist'] * lu * 1.5;
          const local = [lu * LL + thick, ly * Math.cos(tw) - lzc * Math.sin(tw), ly * Math.sin(tw) + lzc * Math.cos(tw) - p['Leaf Droop'] * lu * lu * LL];
          return add(ppos, rotZ(rotY(scl(local, lsc), -up), spin));
        },
        growth: (lu) => 0.32 * (1 - tpos) + 0.04 + 0.12 * lu,
      });
    }
  }

  // length of every curve, so the particles are spread evenly along all outlines
  for (const c of curves) {
    let L = 0, prev = c.at(0);
    for (let s = 1; s <= 16; s++) { const q = c.at(s / 16); L += Math.hypot(q[0] - prev[0], q[1] - prev[1], q[2] - prev[2]); prev = q; }
    c.length = L;
  }
  return curves;
}

export class OutlineParticles extends THREE.Points {
  constructor(params) {
    super(new THREE.BufferGeometry(), createOutlineMaterial());
    this.params = params;
    this.frustumCulled = false;
    this.renderOrder = 4;
    this.key = '';
  }

  // call every frame: only does work when the flower, the bloom or the count changed
  sync(bloom) {
    const p = this.params;
    const sampleKey = `${p['Outline Particles']}|${this.flowerKey ?? 0}`;
    const key = `${sampleKey}|${bloom.toFixed(4)}|${p['Outline Colour']}|${p['Stem Outline Colour']}|${p['Stamen Outline Colour']}`;
    if (key === this.key) return;
    this.key = key;
    const curves = outlineCurves(p, bloom);
    if (sampleKey !== this.sampleKey) { this.sampleKey = sampleKey; this.#sample(curves); }   // new count or new flower shape
    this.#place(curves);
  }

  // the flower sliders changed: pick new spots on the outlines
  flowerChanged() { this.flowerKey = (this.flowerKey ?? 0) + 1; }

  // which outline and where along it every particle sits (kept while the flower breathes)
  #sample(curves) {
    const N = Math.round(this.params['Outline Particles']);
    const total = curves.reduce((s, c) => s + c.length, 0) || 1;
    const cum = []; let acc = 0;
    for (const c of curves) { acc += c.length / total; cum.push(acc); }
    this.assign = new Array(N);
    const jitter = new Float32Array(N * 3), rnd = new Float32Array(N * 3);
    let s = 7;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < N; i++) {
      const x = r();
      let ci = cum.findIndex((c) => x <= c); if (ci < 0) ci = curves.length - 1;
      this.assign[i] = [ci, r()];
      // random direction, more particles close to the line than far away
      const th = r() * TAU, ph = Math.acos(2 * r() - 1), d = Math.pow(r(), 1.6);
      jitter[i * 3] = Math.sin(ph) * Math.cos(th) * d; jitter[i * 3 + 1] = Math.sin(ph) * Math.sin(th) * d; jitter[i * 3 + 2] = Math.cos(ph) * d;
      rnd[i * 3] = 0.6 + 0.8 * r(); rnd[i * 3 + 1] = r(); rnd[i * 3 + 2] = r();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    g.setAttribute('aGrowth', new THREE.BufferAttribute(new Float32Array(N), 1));
    g.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    g.setAttribute('aJitter', new THREE.BufferAttribute(jitter, 3));
    g.setAttribute('aRand', new THREE.BufferAttribute(rnd, 3));
    this.geometry.dispose();
    this.geometry = g;
  }

  #place(curves) {
    const p = this.params;
    const cols = [new THREE.Color(p['Outline Colour']), new THREE.Color(p['Stem Outline Colour']), new THREE.Color(p['Stamen Outline Colour'])];
    const pos = this.geometry.attributes.position, gr = this.geometry.attributes.aGrowth, col = this.geometry.attributes.aColor;
    for (let i = 0; i < this.assign.length; i++) {
      const [ci, t] = this.assign[i];
      const c = curves[Math.min(ci, curves.length - 1)];
      if (!c) continue;
      const q = toThree(c.at(t));
      pos.array[i * 3] = q[0]; pos.array[i * 3 + 1] = q[1]; pos.array[i * 3 + 2] = q[2];
      gr.array[i] = c.growth(t);
      const cc = cols[c.kind];
      col.array[i * 3] = cc.r; col.array[i * 3 + 1] = cc.g; col.array[i * 3 + 2] = cc.b;
    }
    pos.needsUpdate = gr.needsUpdate = col.needsUpdate = true;
  }
}

function createOutlineMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { ...outlineUniforms, uProgress: uniforms.uProgress, uSolidDelay: uniforms.uSolidDelay, uFade: uniforms.uFade, uTime: uniforms.uTime },
    transparent: true, depthWrite: false,
    vertexShader: /* glsl */ `
      uniform float uProgress, uSolidDelay, uFade, uTime, uSpread, uSize, uAfter, uTwinkle, uDrift, uPixelRatio;
      attribute float aGrowth; attribute vec3 aColor, aJitter, aRand;
      varying vec3 vColor; varying float vA;
      void main() {
        // same timing as the build-up: appears where the points would, the solid flower follows after 'Solid Delay'
        float k = max(1.0 - uSolidDelay - 2.0 * uFade, 0.05);
        float s0 = aGrowth * k;
        float appear = smoothstep(s0, s0 + uFade, uProgress);
        float outS = s0 + uSolidDelay + uFade;
        float after = smoothstep(outS, outS + uFade * 2.0, uProgress);
        vA = appear * mix(1.0, uAfter, after);
        vA *= 1.0 - uTwinkle * (0.5 + 0.5 * sin(uTime * (1.5 + 2.0 * aRand.y) + aRand.z * 6.283));
        // they gather onto the outline as they appear, then drift a tiny bit
        vec3 drift = vec3(sin(uTime * 0.6 + aRand.y * 9.0), sin(uTime * 0.5 + aRand.z * 7.0), cos(uTime * 0.55 + aRand.y * 5.0)) * 0.3 * uDrift;
        vec3 p = position + (aJitter * (1.0 + 2.5 * (1.0 - appear)) + drift * uSpread) * uSpread;
        vColor = aColor;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = vA > 0.002 ? uSize * aRand.x * uPixelRatio * clamp(6.6 / -mv.z, 0.5, 2.0) : 0.0;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uBright;
      varying vec3 vColor; varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.3, d) * vA;          // small round dot with a soft edge
        if (a < 0.003) discard;
        gl_FragColor = vec4(vColor * uBright, a);
      }`,
  });
}
