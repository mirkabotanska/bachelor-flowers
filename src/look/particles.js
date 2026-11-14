// Page 7 – Effect 2: the petals throw off a fine spray of speckles while they move (like ink or paint blown off
// the petal, see src/references/generalStyle4.png).
//  - spawned from the movement: every frame random petal points are tried; a point gives a speckle with a
//    chance that grows with how fast it moves, so a still flower (fully open / closed) gives almost none
//  - most speckles are left behind close to the petal (dense), a few are thrown further along the movement
//    (sparse); they drift a little, slow down and fade out softly
//  - mostly tiny dots, a few bigger drops
//  - drawn into their own image with depth, so they go through the same blur as the flower: the depth blur
//    (further back = softer), the long exposure (they are added to the trail, so they smear with it) and a
//    softness of their own when they move fast
import * as THREE from 'three';

export const PARTICLE_DEFAULTS = {
  'Particle Amount': 0.6,
  'Particle Size': 1.0,
  'Particle Size Variation': 0.6,
  'Particle Spread': 0.6,
  'Particle Life (s)': 1.8,
  'Particle Drift': 0.35,
  'Particle Colour From Petals': true,
  'Particle Colour': '#a5233c',
  'Particle Shade': 0.15,         // -1 lighter ... +1 darker than the petal they come from
  'Particle Blur': 1.0,           // how much the blur (depth + speed + long exposure) affects them
  'Particle Trails': 0.5,         // how much of them goes into the long exposure trail
  'Petal Dissolve': 0.6,          // petal edges break up into speckles while they move
  'Watercolour': 0.5,             // darker + lighter blotches in the petals, pigment pooling at the edges
};

export const MAX_PARTICLES = 60000;

const PART_VERT = /* glsl */ `
  attribute vec4 aInfo;    // age (0..1), size random, big-drop random, speed softness (0..1)
  attribute vec4 aPetal;   // petal seed, u, v (where it came from), shade random
  uniform float uSize, uSizeVar, uPx, uFocus, uRange, uBase, uBlur, uDofPx, uSpeedPx, uShade, uCustom, uBright;
  uniform float uTone, uVarPetal, uVarGrad, uVarEdge;
  uniform vec3 uPetalLight, uPetalDark, uCustomCol;
  varying vec4 vCol; varying float vHard;
  void main(){
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float z = max(-mv.z, 0.05);
    // mostly tiny, a few bigger drops
    float big = 1.0 + uSizeVar * 5.0 * pow(aInfo.z, 40.0);
    float core = uSize * uPx * mix(1.0, 0.35 + 1.3 * aInfo.y * aInfo.y * aInfo.y, uSizeVar) * big / z;
    // soft: out of focus (depth) and fast (speed), like the flower
    float defocus = clamp(uBase + abs(z - uFocus) / uRange, 0.0, 1.0);
    float blurPx = uBlur * (defocus * defocus * uDofPx + aInfo.w * uSpeedPx);
    float size = core + blurPx;
    gl_PointSize = max(size, 1.0);
    vHard = core / max(size, 1e-3);
    float age = aInfo.x;
    float a = smoothstep(0.0, 0.05, age) * pow(1.0 - age, 1.5);          // soft in, soft out
    a *= pow(vHard, 1.1);                                                  // a soft speck spreads thinner
    a *= clamp(core, 0.0, 1.0);                                            // smaller than a pixel: fainter
    // colour: the petal colour where it came from (the same mix as the petal material), a bit darker (pigment)
    float r1 = fract(sin(aPetal.x * 12.9898 + 4.1) * 43758.5453);
    float r2 = fract(sin(aPetal.x * 78.233 + 1.7) * 43758.5453);
    float m = uTone + (r1 - 0.5) * 1.3 * uVarPetal + uVarGrad * (0.5 - aPetal.y) * (0.8 + 0.5 * r2);
    float rim = smoothstep(0.5, 1.0, max(abs(aPetal.z), smoothstep(0.7, 1.0, aPetal.y)));
    m += uVarEdge * rim * (r2 > 0.5 ? 0.8 : -0.8);
    m += uShade + (aPetal.w - 0.5) * 0.5;
    vec3 pc = mix(sqrt(uPetalLight), sqrt(uPetalDark), clamp(m, 0.0, 1.0)); pc *= pc;
    vec3 cc = uCustomCol * (1.0 - clamp(uShade + (aPetal.w - 0.5) * 0.5, -1.0, 1.0) * 0.5);
    vec3 col = (uCustom > 0.5 ? cc : pc) * uBright;
    col = max(mix(vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))), col, 1.3), 0.0);   // pigment: a bit richer than the wash
    vCol = vec4(col * a, a);                                               // premultiplied
  }`;
const PART_FRAG = /* glsl */ `
  varying vec4 vCol; varying float vHard;
  void main(){
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float a = 1.0 - smoothstep(max(vHard - 0.3, 0.0), 1.0, r);           // sharp dot ... soft speck
    #ifdef DEPTH_ONLY
      if (a < 0.5 || vCol.a < 0.04) discard;
      gl_FragColor = vec4(1.0);
    #else
      if (a <= 0.0) discard;
      gl_FragColor = vCol * a;
    #endif
  }`;

// the speckles over the flower image: hidden (mostly) where a petal of now is in front of them
export const PART_COMPOSITE_FRAG = /* glsl */ `
  uniform sampler2D tBase, tPart, tPartDepth, tFlowerDepth, tNow; varying vec2 vUv;
  void main(){
    vec4 b = texture2D(tBase, vUv), p = texture2D(tPart, vUv);
    float behind = step(texture2D(tFlowerDepth, vUv).x + 1e-5, texture2D(tPartDepth, vUv).x);
    p *= 1.0 - behind * clamp(texture2D(tNow, vUv).a, 0.0, 1.0) * 0.8;   // see-through petals: still a little
    gl_FragColor = p + b * (1.0 - p.a);
  }`;

// premultiplied "over" with a strength (speckles into the long exposure trail)
export const OVER_FRAG = /* glsl */ `uniform sampler2D tInput; uniform float uWeight; varying vec2 vUv;
  void main(){ gl_FragColor = texture2D(tInput, vUv) * uWeight; }`;

// circle of confusion with the speckles: their own depth decides how blurred they are
export const COC_PART_FRAG = /* glsl */ `
  #include <packing>
  uniform sampler2D tColor, tDepth, tNow, tPart, tPartDepth;
  uniform float uNear, uFar, uFocus, uRange, uBase, uBehind, uTrailSoft, uPartBlur;
  varying vec2 vUv;
  float cocAt(float d){
    float off = d - uFocus;
    if (uBehind > 0.5) off = max(off, 0.0);
    return clamp(uBase + abs(off) / uRange, 0.0, 1.0);
  }
  void main(){
    float a = texture2D(tColor, vUv).a;
    float coc = cocAt(-perspectiveDepthToViewZ(texture2D(tDepth, vUv).x, uNear, uFar));
    coc = mix(uTrailSoft, coc, texture2D(tNow, vUv).a);
    float pd = texture2D(tPartDepth, vUv).x;
    float cp = pd < 0.99999 ? cocAt(-perspectiveDepthToViewZ(pd, uNear, uFar)) : uTrailSoft;
    coc = mix(coc, clamp(cp * uPartBlur, 0.0, 1.0), clamp(texture2D(tPart, vUv).a * 1.5, 0.0, 1.0));
    gl_FragColor = vec4(coc * a, a, 0.0, 1.0);
  }`;

export class ParticleSpray {
  constructor() {
    this.n = 0;
    this.pos = new Float32Array(MAX_PARTICLES * 3);
    this.vel = new Float32Array(MAX_PARTICLES * 3);
    this.info = new Float32Array(MAX_PARTICLES * 4);
    this.petal = new Float32Array(MAX_PARTICLES * 4);
    this.life = new Float32Array(MAX_PARTICLES);
    this.age = new Float32Array(MAX_PARTICLES);
    const g = this.geometry = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aInfo = new THREE.BufferAttribute(this.info, 4).setUsage(THREE.DynamicDrawUsage);
    this.aPetal = new THREE.BufferAttribute(this.petal, 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('aInfo', this.aInfo); g.setAttribute('aPetal', this.aPetal);
    g.setDrawRange(0, 0);
    this.uniforms = {
      uSize: { value: 1 }, uSizeVar: { value: 0.5 }, uPx: { value: 1 }, uFocus: { value: 6 }, uRange: { value: 1.5 },
      uBase: { value: 0 }, uBlur: { value: 1 }, uDofPx: { value: 6 }, uSpeedPx: { value: 3 }, uShade: { value: 0 },
      uCustom: { value: 0 }, uBright: { value: 1.25 }, uTone: { value: 0.5 }, uVarPetal: { value: 0 }, uVarGrad: { value: 0 },
      uVarEdge: { value: 0 }, uPetalLight: { value: new THREE.Color() }, uPetalDark: { value: new THREE.Color() },
      uCustomCol: { value: new THREE.Color() },
    };
    this.material = new THREE.ShaderMaterial({ vertexShader: PART_VERT, fragmentShader: PART_FRAG, uniforms: this.uniforms,
      transparent: true, depthTest: false, depthWrite: false, blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor });
    this.depthMaterial = new THREE.ShaderMaterial({ vertexShader: PART_VERT, fragmentShader: PART_FRAG, uniforms: this.uniforms,
      defines: { DEPTH_ONLY: 1 }, colorWrite: false, depthTest: true, depthWrite: true });
    this.points = new THREE.Points(g, this.material); this.points.frustumCulled = false;
    this.depthPoints = new THREE.Points(g, this.depthMaterial); this.depthPoints.frustumCulled = false;
    this.scene = new THREE.Scene(); this.scene.add(this.depthPoints, this.points);
    this.depthPoints.renderOrder = 0; this.points.renderOrder = 1;
  }

  clear() { this.n = 0; this.geometry.setDrawRange(0, 0); }

  // one new speckle at p (world), on a petal moving with velocity v (world units / s)
  emit(p, v, dt, seed, pu, pv, P) {
    if (this.n >= MAX_PARTICLES) return;
    const i = this.n++, i3 = i * 3, i4 = i * 4, spread = P['Particle Spread'];
    const speed = Math.hypot(v[0], v[1], v[2]);
    // somewhere along the path the petal travelled this frame (no clumps between frames) + a tiny jitter
    const back = Math.random() * dt, j = 0.012;
    // most are left behind (dense near the petal), a few are thrown along the movement (sparse, further)
    const r = Math.random(), carry = spread * 0.9 * r * r * r;
    const sc = spread * speed * 0.4 * Math.pow(Math.random(), 2.5);
    let dx = Math.random() * 2 - 1, dy = Math.random() * 2 - 1, dz = Math.random() * 2 - 1;
    const dl = Math.hypot(dx, dy, dz) || 1; dx /= dl; dy /= dl; dz /= dl;
    for (let k = 0; k < 3; k++) this.pos[i3 + k] = p[k] - v[k] * back + (Math.random() - 0.5) * j;
    this.vel[i3] = v[0] * carry + dx * sc; this.vel[i3 + 1] = v[1] * carry + dy * sc; this.vel[i3 + 2] = v[2] * carry + dz * sc;
    this.life[i] = P['Particle Life (s)'] * (0.35 + 1.1 * Math.random() ** 1.5);
    this.age[i] = 0;
    this.info[i4] = 0; this.info[i4 + 1] = Math.random(); this.info[i4 + 2] = Math.random(); this.info[i4 + 3] = 0;
    this.petal[i4] = seed; this.petal[i4 + 1] = pu; this.petal[i4 + 2] = pv; this.petal[i4 + 3] = Math.random();
  }

  step(dt, t, P) {
    const drag = Math.exp(-dt / 0.35), drift = P['Particle Drift'] * dt * 0.6;
    const { pos, vel, info, petal, life, age } = this;
    let n = this.n;
    for (let i = 0; i < n; i++) {
      age[i] += dt;
      if (age[i] >= life[i]) {                                   // dead: the last one takes its place
        n--;
        if (i < n) {
          pos.copyWithin(i * 3, n * 3, n * 3 + 3); vel.copyWithin(i * 3, n * 3, n * 3 + 3);
          info.copyWithin(i * 4, n * 4, n * 4 + 4); petal.copyWithin(i * 4, n * 4, n * 4 + 4);
          life[i] = life[n]; age[i] = age[n];
          i--;
        }
        continue;
      }
      const i3 = i * 3, x = pos[i3], y = pos[i3 + 1], z = pos[i3 + 2];
      // a slow, swirling breeze (smooth in space and time) + a tiny fall
      vel[i3] = vel[i3] * drag + Math.sin(y * 3.1 + t * 0.7 + z * 1.3) * drift;
      vel[i3 + 1] = vel[i3 + 1] * drag + (Math.sin(z * 2.7 - t * 0.6 + x * 1.7) * 0.7 - 0.25) * drift;
      vel[i3 + 2] = vel[i3 + 2] * drag + Math.sin(x * 2.9 + t * 0.5 - y * 1.1) * drift;
      pos[i3] = x + vel[i3] * dt; pos[i3 + 1] = y + vel[i3 + 1] * dt; pos[i3 + 2] = z + vel[i3 + 2] * dt;
      info[i * 4] = age[i] / life[i];
      info[i * 4 + 3] = Math.min(1, Math.hypot(vel[i3], vel[i3 + 1], vel[i3 + 2]) * 1.2);
    }
    this.n = n;
    this.geometry.setDrawRange(0, n);
    for (const a of [this.aPos, this.aInfo, this.aPetal]) {
      a.clearUpdateRanges(); a.addUpdateRange(0, n * a.itemSize); a.needsUpdate = true;
    }
  }
}
