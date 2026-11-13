// Page 8 – Garden: the roots as 3D tubes, and the particles they dissolve into.
// Tubes: every root point becomes a ring of RING vertices around the (smoothed) root line, in the wall plane
// (z = 0), with the width from the simulation. The vertex shader then adds the movement, so the mesh only has
// to be rebuilt when the roots change shape (grow, dissolve), not every frame:
//  - sway: a slow turn around the point where the cluster started (the flowers follow it, see swayAngle)
//  - depth wave: the roots undulate towards / away from the "glass" (waveZ). Parts near the focus plane stay
//    sharp, parts further away get the depth blur of the look, so some stretches are sharp and others soft,
//    and that slowly shifts around (like the stems in generalStyle3)
//  - dissolving: once a piece's particles appear, the tube thins away there
import * as THREE from 'three';

export const RING = 6;                          // vertices around a tube
const MAX_POINTS = 12000;

// the depth wave (world units in, world units out, before the amount); same maths in JS and GLSL
export function waveZ(x, y, t) {
  return Math.sin(x * 2.0 + t * 0.7 + Math.sin(y * 1.6 - t * 0.5)) * Math.sin(y * 1.7 - t * 0.6 + 1.7) * 0.6
    + Math.sin(x * 3.1 - y * 2.3 + t * 1.1) * 0.4;
}
export const WAVE_PERIOD = 20 * Math.PI;          // all the wave's frequencies repeat after this (so time can wrap)
const WAVE_GLSL = /* glsl */ `
  float gdWave(vec2 p, float t) {
    return sin(p.x * 2.0 + t * 0.7 + sin(p.y * 1.6 - t * 0.5)) * sin(p.y * 1.7 - t * 0.6 + 1.7) * 0.6
         + sin(p.x * 3.1 - p.y * 2.3 + t * 1.1) * 0.4;
  }`;
// the sway: a small turn (radians) around the cluster's origin, with a phase per cluster
export function swayAngle(phase, t, amount) {
  return amount * (0.7 * Math.sin(t * 0.37 + phase) + 0.3 * Math.sin(t * 0.19 + phase * 2.0));
}
export const SWAY_PERIOD = 200 * Math.PI;
// the sway phase of a cluster, from where it started (world units)
export const originPhase = (ox, oy) => ((((Math.sin(ox * 12.9898 + oy * 78.233) * 43758.5453) % 1) + 1) % 1) * Math.PI * 2;

export class RootTubes extends THREE.Mesh {
  constructor() {
    const cap = MAX_POINTS * RING;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cap * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(cap * 3), 3));
    g.setAttribute('aInfo', new THREE.BufferAttribute(new Float32Array(cap * 4), 4));     // width, gone time, tone, sway phase
    g.setAttribute('aOrigin', new THREE.BufferAttribute(new Float32Array(cap * 2), 2));   // where its cluster started
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(MAX_POINTS * RING * 6), 1));
    g.setDrawRange(0, 0);
    for (const a of Object.values(g.attributes)) a.setUsage(THREE.DynamicDrawUsage);
    g.index.setUsage(THREE.DynamicDrawUsage);

    const u = {
      uTime: { value: 0 }, uWaveT: { value: 0 }, uSwayT: { value: 0 },
      uThick: { value: 1 }, uSwayAmt: { value: 0 }, uWaveAmt: { value: 0 }, uFadeLen: { value: 0.8 },
      uColA: { value: new THREE.Color('#8fae3c') }, uColB: { value: new THREE.Color('#5f8a3a') },
    };
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0, side: THREE.DoubleSide });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          attribute vec4 aInfo; attribute vec2 aOrigin;
          uniform float uTime, uWaveT, uSwayT, uThick, uSwayAmt, uWaveAmt, uFadeLen;
          varying float vTone;
          ${WAVE_GLSL}`)
        .replace('#include <begin_vertex>', `
          vTone = aInfo.z;
          float r = aInfo.x * uThick * (1.0 - smoothstep(aInfo.y, aInfo.y + uFadeLen, uTime));   // thins away when dissolving
          vec2 d = position.xy - aOrigin;
          float a = uSwayAmt * (0.7 * sin(uSwayT * 0.37 + aInfo.w) + 0.3 * sin(uSwayT * 0.19 + aInfo.w * 2.0));
          vec2 c = aOrigin + vec2(cos(a) * d.x - sin(a) * d.y, sin(a) * d.x + cos(a) * d.y);
          vec3 transformed = vec3(c, gdWave(c, uWaveT) * uWaveAmt) + normal * r;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform vec3 uColA, uColB; varying float vTone;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          diffuseColor.rgb = mix(uColA, uColB, vTone);`);
    };
    mat.customProgramCacheKey = () => 'garden-roots';
    super(g, mat);
    this.u = u;
    this.frustumCulled = false;
    this.pointCount = 0;
    this._cos = []; this._sin = [];
    for (let k = 0; k < RING; k++) { const th = (k / RING) * Math.PI * 2; this._cos.push(Math.cos(th)); this._sin.push(Math.sin(th)); }
  }

  // rebuild from the simulation. toWorld(x, y) maps simulation pixels to world units; pxUnit = world units per pixel
  rebuild(growth, toWorld, pxUnit) {
    const g = this.geometry;
    const pos = g.attributes.position.array, nor = g.attributes.normal.array, info = g.attributes.aInfo.array, org = g.attributes.aOrigin.array;
    const idx = g.index.array;
    const lines = new Map();
    let v = 0, ii = 0, points = 0;
    for (const root of growth.roots) growth.smoothLine(root, lines);
    for (const root of growth.roots) {
      const line = lines.get(root), pts = root.points, last = pts.length - 1;
      const from = Math.min(root.visibleFrom ?? 0, root.cut ?? 0);
      if (last - from < 1 || points + (last - from + 1) > MAX_POINTS) continue;
      const c = growth.centerOf(root), [ox, oy] = toWorld(c.x, c.y);
      const phase = originPhase(ox, oy);
      const tone = growth.toneOf(root);
      let prevRing = -1;
      for (let i = from; i <= last; i++) {
        const p = line[i], a = line[Math.max(i - 1, from)], b = line[Math.min(i + 1, last)];
        let tx = b.x - a.x, ty = -(b.y - a.y);                                   // tangent in world (y flipped)
        const len = Math.hypot(tx, ty) || 1; tx /= len; ty /= len;
        const nx = -ty, ny = tx;                                                   // sideways, in the wall plane
        const [wx, wy] = toWorld(p.x, p.y);
        const w = growth.widthAt(root, i) * pxUnit * 0.5;                          // radius
        const gone = pts[i].dissolveAt ?? 1e9;
        const ring = v;
        for (let k = 0; k < RING; k++, v++) {
          const cs = this._cos[k], sn = this._sin[k];
          pos[v * 3] = wx; pos[v * 3 + 1] = wy; pos[v * 3 + 2] = 0;
          nor[v * 3] = cs * nx; nor[v * 3 + 1] = cs * ny; nor[v * 3 + 2] = sn;
          info[v * 4] = w; info[v * 4 + 1] = gone; info[v * 4 + 2] = tone; info[v * 4 + 3] = phase;
          org[v * 2] = ox; org[v * 2 + 1] = oy;
        }
        if (prevRing >= 0) {
          for (let k = 0; k < RING; k++) {
            const k2 = (k + 1) % RING;
            const a0 = prevRing + k, a1 = prevRing + k2, b0 = ring + k, b1 = ring + k2;
            idx[ii++] = a0; idx[ii++] = b0; idx[ii++] = b1;
            idx[ii++] = a0; idx[ii++] = b1; idx[ii++] = a1;
          }
        }
        prevRing = ring; points++;
      }
    }
    this.pointCount = points;
    this.lines = lines;                                                          // the drawn lines (the flowers sit on them)
    g.setDrawRange(0, ii);
    for (const a of Object.values(g.attributes)) { a.addUpdateRange(0, v * a.itemSize); a.needsUpdate = true; }
    g.index.addUpdateRange(0, ii); g.index.needsUpdate = true;
  }
}

// ---- particles: a fixed buffer, everything about a particle is set once (start, velocity, birth, life, size, colour)
// and the vertex shader works out where it is at any moment. Writing a new particle costs nothing per frame.
const MAX_PARTICLES = 24000;
export class Particles extends THREE.Points {
  constructor() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3));
    g.setAttribute('aVel', new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3));
    g.setAttribute('aMeta', new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 4), 4));   // born, life, size, loosen
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
          float loose = smoothstep(0.0, aMeta.w, age);                 // sits still at first, then drifts off
          float move = (1.0 - exp(-0.6 * age)) / 0.6;                  // slows down
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
  // list of {x, y, z, vx, vy, vz, born, life, size (world diameter), loosen, color: [r, g, b]}
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
