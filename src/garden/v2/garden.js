// Page 8 – Garden, Version 2 (where changes are tried; Version 1 in ../v1/ stays as it was).
// Changed so far: only the look of the roots (tubes.js: smooth, flowing, rounded joints, depth layers, soft halo),
// with its own sliders ('Root look (v2)'). Everything else is the same as Version 1.
// The roots of page 5 and the lily + look of page 7, together.
//  - roots grow where the light is (camera flashlight, mouse, or fake lights), exactly like page 5 (growth.js),
//    but they are drawn as real 3D tubes in the wall plane (tubes.js): round, lit, thicker at the base, thinner
//    towards the tips and on branches. They undulate a little in depth, so the depth blur of the look makes some
//    stretches sharp and others soft, slowly shifting (like the stems in generalStyle3). Once grown, every cluster
//    sways gently around the point where it started.
//  - leaves and flowers grow on the roots: the Blender lily of page 7 (same flower, colours, see-through petals,
//    motion trails, blur and background). No build-up effect: the stem grows out of the root with its leaves,
//    then the bud appears closed and starts breathing (open / close) right away. Every flower breathes in its own
//    time (from the moment it appeared) with page 7's breathing settings.
//  - how many flowers: a light held on one spot gives it energy (1 flower after a few seconds); roots from
//    different lights that connect give both spots energy and allow more flowers, and a flower grows where they
//    join. Flowers keep their distance from each other and there is a maximum.
//  - after the light has gone the roots stay a while, then dissolve into particles that drift off and fade,
//    and the flowers and leaves on them fall apart into particles at the same moment.
// Rendering (from page 7): flowers of now (full size, with depth) + their long-exposure trail, composed over the
// roots (their own pass, with depth), then blur by depth, the frosted-glass paleness, grading and background haze.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import GUI from 'lil-gui';
import { FLOWER_PARAMS, defaults } from '../../lily/params.js';
import { generateLily, hsv, rand } from '../../lily/generator.js';
import { uniforms as sharedUniforms, createSolidMaterial } from '../../lily/materials.js';
import { createGrowth } from './growth.js';
import { createLightInput } from './lights.js';
import { RootTubes, Particles, waveZ, swayAngle, originPhase, WAVE_PERIOD, SWAY_PERIOD } from './tubes.js';
import '../garden.css';

const STORAGE_KEY = 'flowers-web-garden-v2';
const V1_STORAGE_KEY = 'flowers-web-garden-v1';   // the first time, Version 2 starts from Version 1's saved settings
const BLENDER_LILY_URL = `${import.meta.env.BASE_URL}lily/lily-breath.json`;
const ARC_CLOSED = -0.9, ARC_OPEN = 1.66, ARC_STEPS = 33;   // Petal Arc Bend: closed bud ... fully open (poses blended in between)
const LEAF_STEPS = 7, LEAF_VARIANTS = 4;                     // leaf clusters on the roots: a few shapes, folding with the breath
const PX = 80;                        // simulation pixels per world unit
const SIM_H = 720;                    // the simulation is SIM_H pixels high; its width follows the window
const FOV = 30;
const CAM_DIST = (SIM_H / PX / 2) / Math.tan((FOV * Math.PI) / 360);   // the camera sees exactly the simulation at z = 0
const LAYER_FLOWERS = 1, LAYER_ROOTS = 2;
const PLANT_DISSOLVE = 2.2;           // s: a flower / leaf falls apart into particles
const LEAF_GROW = 1.8;                // s: a leaf cluster grows out
const FLOWER_COST = 3;                // energy (seconds of light on a spot) per flower
const EDGE_MARGIN = 70;               // px: no flowers this close to the edge

// flower settings shown on this page (the rest keep their default)
const FLOWER_KEYS = {
  'Ring Count': 'Rings', 'Petals Per Ring': 'Petals per ring', 'Petal Length': 'Petal length', 'Petal Width': 'Petal width',
  'Petal Tip Shape': 'Petal tip', 'Inner Ring Scale': 'Ring size (inner rings)', 'Inner Ring Opening': 'Ring opening (inner rings)',
  'Inner Ring Height': 'Space between rings', 'Petal Ring Rotation Offset': 'Ring rotation', 'Flower Blooming': 'Blooming',
  'Petal Tip Bend': 'Tip bend', 'Petal Edge Ruffle': 'Edge ruffle', 'Head Tilt': 'Head tilt', 'Stamen Count': 'Stamens',
};

const GARDEN_DEFAULTS = {
  // garden: flowers and leaves on the roots
  'Flower Size': 0.6,
  'Max Flowers': 8,
  'Flower Spacing': 110,        // px between flowers
  'Stem Grow (s)': 3.5,         // the stem (with its leaves) grows out of the root
  'Bud Appear (s)': 0.6,        // then the closed bud appears
  'Branch Leaves': 0.6,         // how many leaf clusters grow along the roots (0 = none)
  'Leaf Size': 0.4,
  // garden: roots
  'Root Colour': '#8fae3c',
  'Root Colour 2': '#5f8a3a',
  'Root Thickness': 1.5,
  'Blur Variation': 0.8,        // how far the roots move towards / away from the glass (depth units)
  'Blur Variation Speed': 0.5,
  'Root Sway': 0.4,             // the slow turn of a cluster around where it started
  'Root Stay (s)': 5,           // after the light has gone
  'Dissolve (s)': 2.5,
  'Dissolve Spread': 1,         // how far the particles fly
  'Light Glow': 0.08,           // a soft light on the wall where the light is
  // root look (v2)
  'Root Smoothness': 0.6,       // how smooth and flowing the lines are
  'Root Joint Softness': 0.7,   // how softly branches grow out of / merge into each other (webbed joints)
  'Root Thickness Variation': 0.45, // slow swelling and narrowing along each root
  'Root Depth Variation': 0.6,  // some roots further back: thinner, paler, more blurred
  'Root Glow': 0.4,             // soft, lighter edge and halo around the roots
  'Root Glow Width': 1.2,       // halo width (x the root's thickness)
  'Root Glow Colour': '#cfdcb4',
  'Root Faint Colour': '#c3ccb9', // the colour the roots fade to further back
  'Threshold': 70,              // camera: how much brighter than the room counts as light
  // flower extras (page 7)
  'Show Stem + Leaves': true,
  'Petal Opacity': 1.0,
  'Petal Edges': 0.8,
  'Petal Light Colour': '#f7d3dd',
  'Petal Dark Colour': '#8c2a4f',
  'Petal Tone': 0.45,
  'Petal Variation': 0.85,
  'Petal Gradient': 0.9,
  'Petal Edge Variation': 0.6,
  'Stem Colour': '#619950',
  'Leaf Colour': '#558e45',
  'Petal Centre Opacity': 0.5,
  'Petal Edge Opacity': 0.95,
  'Petal Opacity Blend': 0.6,
  // blur (page 7; the garden is in different units, so the depth values are its own)
  'Blur Amount': 0.6,
  'Base Blur': 0.03,
  'Focus Distance': -0.6,       // sharp a little in front of the wall, where the roots come closest (- nearer, + further)
  'Depth Range': 1.8,
  'Only Behind Focus': false,
  'Frost (paleness)': 0.35,
  // look (page 7)
  'Background Top': '#b9c0b4',
  'Background Bottom': '#a7ada2',
  'Exposure': 1.0,
  'Contrast': 1.0,
  'Saturation': 0.8,
  'Warmth': 0.1,
  'Fade': 0.04,
  'Shadow Tint': '#3b4a63',
  'Shadow Tint Amount': 0.25,
  'Highlight Tint': '#f6d9c6',
  'Highlight Tint Amount': 0.2,
  'Glow': 0.2,
  'Bg Shadow': true,
  'Bg Shadow Colour': '#6e766a',
  'Bg Shadow Blur': 0.75,
  'Bg Shadow Opacity': 0.35,
  'Bg Shadow Offset X': 0.02,
  'Bg Shadow Offset Y': -0.03,
  'Bg Shadow Size': 1.0,
  // breathing (page 7)
  'Breath In (s)': 3,
  'Breath Out (s)': 3,
  'Open Most': 1.0,
  'Closed Most': 0.0,
  'Leaf Angle Closed': 68,
  'Leaf Angle Open': 38,
  'Leaf Fold Closed': 1.0,
  'Leaf Fold Open': 0.6,
  'Leaf Droop Breath': 0.3,
  'Breath Turn': 50,
  'Sway': 8,
  'Petal Lag': 2.0,
  'Petal Flutter': 0.12,
  // long exposure (page 7)
  'Trail Length (s)': 1.5,
  'Trail Copies': 24,
  'Trail Fade': 0.35,
  'Now Strength': 0.35,
  'Trail Softness': 0.15,
  'Afterglow': 0.88,
  'Streaks': 2.0,
};
const RESOLUTION_KEYS = ['Petal Resolution Length', 'Petal Resolution Width', 'Leaf Resolution Length', 'Leaf Resolution Width', 'Round Segments'];

const QUAD_VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const ADD_FRAG = /* glsl */ `uniform sampler2D tInput; uniform float uWeight; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tInput, vUv) * uWeight; }`;
const GLOW_FRAG = /* glsl */ `uniform sampler2D tInput, tPrev; uniform float uKeep; varying vec2 vUv;
  void main(){ vec4 c = texture2D(tInput, vUv), p = texture2D(tPrev, vUv); gl_FragColor = c + (p - c) * uKeep * (1.0 - c.a * 0.5); }`;
// the flowers of now on top of their trail, all of it on top of the roots
const COMBINE_FRAG = /* glsl */ `uniform sampler2D tTrail, tNow, tRoots; uniform float uNow; varying vec2 vUv;
  void main(){ vec4 n = texture2D(tNow, vUv) * uNow; vec4 f = n + texture2D(tTrail, vUv) * (1.0 - n.a);
    vec4 r = texture2D(tRoots, vUv); gl_FragColor = f + r * (1.0 - f.a); }`;

// the movement of one vertex at one moment (same as page 7) plus the growth: the stem grows out of the root with
// its leaves (every stem / leaf vertex knows its place along the stem, aStemT), the head scales in at the end
const MOTION_GLSL = /* glsl */ `
  attribute vec3 aPosA; attribute vec3 aPosB; attribute float aStemT;
  uniform float uMFlutter, uMFoot, uGrow, uHead, uStemLen, uStemBend; uniform vec3 uMAxis;
  vec3 lkRot(vec3 v, vec3 k, float a) { return v * cos(a) + cross(k, v) * sin(a) + k * dot(k, v) * (1.0 - cos(a)); }
  vec3 lookMove(vec3 p0, vec3 n, float part, float pu, float seed, float s, float ph, float twist, vec2 sway, out vec3 nOut) {
    vec3 p = aPosA * (2.0 * (s - 0.5) * (s - 1.0)) + aPosB * (-4.0 * s * (s - 1.0)) + p0 * (2.0 * s * (s - 0.5));
    if (part < 0.5) {
      float tip = pu * pu;
      p += n * tip * uMFlutter * (sin(ph + seed * 5.31) + 0.5 * sin(2.0 * ph + seed * 11.7));
      float a = twist * pow(pu, 1.5);
      p = lkRot(p, uMAxis, a); n = lkRot(n, uMAxis, a);
    }
    if (aStemT >= 0.0) {                                   // stem and leaves: grown up to uGrow of the stem
      float t0 = aStemT, t1 = 1.0 - (1.0 - aStemT) * uGrow;
      vec3 c0 = vec3(uStemBend * t0 * t0, -uStemLen * t0, 0.0), c1 = vec3(uStemBend * t1 * t1, -uStemLen * t1, 0.0);
      float g = part > 1.5 ? smoothstep(1.0 - t0, 1.0 - t0 + 0.3, uGrow) : 1.0;   // a leaf unfolds once the stem reaches it
      p = c1 + (p - c0) * g;
    } else {                                               // the head: sits on the stem tip, scales in
      float t1 = 1.0 - uGrow;
      p = vec3(uStemBend * t1 * t1, -uStemLen * t1, 0.0) + p * uHead;
    }
    float h = clamp((p.y - uMFoot) / -uMFoot, 0.0, 1.4); h *= h;
    vec2 ang = sway * h;
    mat3 R = mat3(1.0, 0.0, 0.0, 0.0, cos(ang.y), sin(ang.y), 0.0, -sin(ang.y), cos(ang.y))
           * mat3(cos(ang.x), sin(ang.x), 0.0, -sin(ang.x), cos(ang.x), 0.0, 0.0, 0.0, 1.0);
    nOut = R * n;
    return R * (p - vec3(0.0, uMFoot, 0.0)) + vec3(0.0, uMFoot, 0.0);
  }`;
const MOTION_VERT_COMMON = /* glsl */ `${MOTION_GLSL}
  uniform float uMS, uMPh, uMTwist; uniform vec2 uMSway;`;
const MOTION_VERT_MAIN = /* glsl */ `
  vec3 lkN; vec3 lkP = lookMove(position, objectNormal, aPart, aU, aSeed, uMS, uMPh, uMTwist, uMSway, lkN);
  objectNormal = lkN;`;
const VEL_VERT = /* glsl */ `
  attribute float aPart; attribute float aU; attribute float aSeed;
  ${MOTION_GLSL}
  uniform float uMPh, uMTwist, uMS2, uMPh2, uMTwist2; uniform vec2 uMSway, uMSway2; uniform mat4 uPrevModel;
  varying vec3 vVel;
  void main(){
    vec3 n1, n2;
    vec4 c1 = projectionMatrix * viewMatrix * modelMatrix * vec4(lookMove(position, normal, aPart, aU, aSeed, 1.0, uMPh, uMTwist, uMSway, n1), 1.0);
    vec4 c2 = projectionMatrix * viewMatrix * uPrevModel * vec4(lookMove(position, normal, aPart, aU, aSeed, uMS2, uMPh2, uMTwist2, uMSway2, n2), 1.0);
    vVel = vec3(c1.xy / c1.w - c2.xy / c2.w, 0.0) * 0.5;
    gl_Position = c1;
  }`;
const VEL_FRAG = /* glsl */ `varying vec3 vVel; void main(){ gl_FragColor = vec4(vVel.xy, 1.0, 1.0); }`;
const STREAK_FRAG = /* glsl */ `
  uniform sampler2D tInput, tVel; uniform float uLen; varying vec2 vUv;
  void main(){
    vec3 v = texture2D(tVel, vUv).rgb;
    vec2 d = v.b > 1e-3 ? v.rg / v.b * uLen * smoothstep(0.0, 0.15, v.b) : vec2(0.0);
    vec4 s = vec4(0.0); float wsum = 0.0;
    for (int i = 0; i < 16; i++) { float f = float(i) / 15.0; float w = 1.0 - 0.6 * f; s += texture2D(tInput, vUv + d * (f - 0.25)) * w; wsum += w; }
    gl_FragColor = s / wsum;
  }`;
// how blurred each pixel should be, from the nearest depth of the flowers and the roots
const COC_FRAG = /* glsl */ `
  #include <packing>
  uniform sampler2D tColor, tDepth, tDepth2, tNow, tRoots; uniform float uNear, uFar, uFocus, uRange, uBase, uBehind, uTrailSoft;
  varying vec2 vUv;
  void main(){
    float a = texture2D(tColor, vUv).a;
    float z = min(texture2D(tDepth, vUv).x, texture2D(tDepth2, vUv).x);
    float d = -perspectiveDepthToViewZ(z, uNear, uFar);
    float off = d - uFocus;
    if (uBehind > 0.5) off = max(off, 0.0);
    float coc = clamp(uBase + abs(off) / uRange, 0.0, 1.0);
    float rootA = texture2D(tRoots, vUv).a, flowerA = texture2D(tNow, vUv).a;
    // [v2] only the halo of a root here (it has no depth): no blur of its own, it borrows the blur of the root next to it
    if (z > 0.99999 && rootA > 0.0 && flowerA < 0.01) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
    float nowA = flowerA + rootA * (1.0 - flowerA);
    coc = mix(uTrailSoft, coc, nowA);
    gl_FragColor = vec4(coc * a, a, 0.0, 1.0);
  }`;
const BLUR_FRAG = /* glsl */ `
  uniform sampler2D tInput; uniform vec2 uDir; varying vec2 vUv;
  void main(){
    vec4 s = texture2D(tInput, vUv) * 0.2270270270;
    s += (texture2D(tInput, vUv + uDir * 1.3846153846) + texture2D(tInput, vUv - uDir * 1.3846153846)) * 0.3162162162;
    s += (texture2D(tInput, vUv + uDir * 3.2307692308) + texture2D(tInput, vUv - uDir * 3.2307692308)) * 0.0702702703;
    gl_FragColor = s;
  }`;
const FINAL_FRAG = /* glsl */ `
  uniform sampler2D tColor, tB1, tB2, tB3, tCoc, tCocBlur;
  uniform vec2 uRes; uniform float uAmount, uFrost, uExposure, uContrast, uSat, uWarmth, uFade;
  uniform vec3 uBgTop, uBgBottom, uShadow, uHigh; uniform float uShadowAmt, uHighAmt, uGlow;
  uniform sampler2D tBgShadow; uniform vec3 uBsCol; uniform float uBsOpacity, uBsSize, uAspect, uBsGain; uniform vec2 uBsAnchor, uBsOffset;
  uniform vec4 uLights[8]; uniform int uLightCount; uniform vec3 uLightCol;
  varying vec2 vUv;
  vec4 level(float l){
    vec4 c0 = texture2D(tColor, vUv), c1 = texture2D(tB1, vUv), c2 = texture2D(tB2, vUv), c3 = texture2D(tB3, vUv);
    if (l < 1.0) return mix(c0, c1, l);
    if (l < 2.0) return mix(c1, c2, l - 1.0);
    return mix(c2, c3, clamp(l - 2.0, 0.0, 1.0));
  }
  void main(){
    vec2 own = texture2D(tCoc, vUv).rg;
    vec2 near = texture2D(tCocBlur, vUv).rg;
    float coc = own.g > 0.5 ? own.r / max(own.g, 1e-4) : near.r / max(near.g, 1e-4);
    vec4 c = level(coc * 3.0 * uAmount);
    vec3 bg = mix(uBgBottom, uBgTop, vUv.y);
    float bsMask = 0.0;
    if (uBsOpacity > 0.0) {
      vec2 suv = uBsAnchor + (vUv - uBsAnchor - uBsOffset * vec2(1.0 / uAspect, 1.0)) / uBsSize;
      float edge = smoothstep(0.0, 0.12, suv.x) * smoothstep(0.0, 0.12, 1.0 - suv.x) * smoothstep(0.0, 0.12, suv.y) * smoothstep(0.0, 0.12, 1.0 - suv.y);
      float sh = (1.0 - exp(-texture2D(tBgShadow, suv).a * uBsGain)) * edge;
      bg = mix(bg, uBsCol, sh * uBsOpacity);
      bsMask = step(0.002, sh * uBsOpacity);
    }
    // the light on the wall (where the flashlight / mouse / fake lights are)
    for (int i = 0; i < 8; i++) {
      if (i >= uLightCount) break;
      vec2 dv = (vUv - uLights[i].xy) * vec2(uAspect, 1.0);
      bg += uLightCol * uLights[i].z * exp(-dot(dv, dv) / (uLights[i].w * uLights[i].w) * 2.0);
    }
    c.rgb = mix(c.rgb, bg * c.a, clamp(coc * uFrost, 0.0, 1.0));
    vec3 col = bg * (1.0 - c.a) + c.rgb;
    col += texture2D(tB3, vUv).rgb * uGlow * 0.6;
    col *= uExposure;
    col = (col - 0.5) * uContrast + 0.5;
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lum), col, uSat);
    col += vec3(0.06, 0.02, -0.06) * uWarmth;
    col = mix(col, uShadow, uShadowAmt * (1.0 - smoothstep(0.0, 0.6, lum)));
    col = mix(col, uHigh, uHighAmt * smoothstep(0.45, 1.0, lum));
    col = mix(vec3(uFade), vec3(1.0), col);
    col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0 * bsMask;
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
  }`;

const clamp01 = (x) => Math.min(Math.max(x, 0), 1);
const ease = (x) => { const c = clamp01(x); return c * c * (3 - 2 * c); };
const rnd = (a, b) => a + Math.random() * (b - a);

export function createGardenPage(opts = {}) {   // opts: panelTop(gui) adds the version switch, name = window name for testing
  const flowerDefaults = { ...defaults(FLOWER_PARAMS), 'Spot Amount': 0, 'Petal Resolution Length': 17, 'Petal Resolution Width': 7 };
  const params = { ...flowerDefaults, ...GARDEN_DEFAULTS };
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(V1_STORAGE_KEY) ?? '{}'); Object.assign(params, stored); } catch { /* no storage */ }
  const save = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(params)); } catch { /* ignore */ } };

  const page = document.createElement('div');
  page.id = 'garden-page';
  page.hidden = true;
  page.innerHTML = `<canvas class="garden__canvas"></canvas><canvas class="garden__preview" hidden></canvas>
    <p class="garden__hint">Hold the mouse button down = light (or switch on the camera in the panel)</p>`;
  document.body.appendChild(page);
  const canvas = page.querySelector('.garden__canvas');
  const preview = page.querySelector('.garden__preview');
  const hint = page.querySelector('.garden__hint');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;
  const lights3d = [new THREE.HemisphereLight(0xfff4ea, 0x8a7d70, 0.9)];
  const key = new THREE.DirectionalLight(0xfff2ea, 1.6); key.position.set(-3, 4, 5); lights3d.push(key);
  const back = new THREE.DirectionalLight(0xfff6ee, 1.4); back.position.set(1, 2, -5); lights3d.push(back);
  for (const l of lights3d) { l.layers.enableAll(); scene.add(l); }

  const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 60);
  camera.position.set(0, 0, CAM_DIST); camera.lookAt(0, 0, 0);

  // ---------------------------------------------------------------- the simulation (pixels) and the world (units)
  let SIM_W = SIM_H * 16 / 9;
  const growth = createGrowth(SIM_W, SIM_H);
  const lightInput = createLightInput(canvas, preview, SIM_W, SIM_H);
  const toWorld = (x, y) => [(x - SIM_W / 2) / PX, (SIM_H / 2 - y) / PX];
  const tubes = new RootTubes(); tubes.layerMask = LAYER_ROOTS; scene.add(tubes);
  const particles = new Particles(); particles.layers.set(LAYER_ROOTS); scene.add(particles);
  let waveT = 0, swayT = 0;
  const swayAmt = () => params['Root Sway'] * 0.06;

  // ---------------------------------------------------------------- the plants (lily flowers, leaf clusters)
  // shader values shared by all plants (the look), per plant: the motion, growth, dissolve (see Plant)
  const shared = {};
  for (const [k, v] of Object.entries(sharedUniforms)) shared[k] = { value: v.value?.clone ? v.value.clone() : v.value };
  Object.assign(shared, { uProgress: { value: 1 }, uSolidDelay: { value: 0 }, uFade: { value: 0.01 }, uSparkleAmount: { value: 0 }, uPetalGlow: { value: 0.04 },
    uMFlutter: { value: 0 }, uEdges: { value: 0 }, uOpCentre: { value: 0.5 }, uOpEdge: { value: 1 }, uOpBlend: { value: 0.5 },
    uPetalLight: { value: new THREE.Color() }, uPetalDark: { value: new THREE.Color() }, uTone: { value: 0.5 },
    uVarPetal: { value: 0 }, uVarGrad: { value: 0 }, uVarEdge: { value: 0 }, uStemCol: { value: new THREE.Color() }, uLeafCol: { value: new THREE.Color() } });

  function addLook(mat, petals) {
    const baseCompile = mat.onBeforeCompile;
    mat.onBeforeCompile = (shader, r) => {
      baseCompile(shader, r);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${MOTION_VERT_COMMON}`)
        .replace('#include <defaultnormal_vertex>', `${MOTION_VERT_MAIN}\n#include <defaultnormal_vertex>`)
        .replace('#include <project_vertex>', 'transformed = lkP;\n#include <project_vertex>');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform float uEdges, uOpCentre, uOpEdge, uOpBlend, uTone, uVarPetal, uVarGrad, uVarEdge, uSeedOff;
          uniform vec3 uPetalLight, uPetalDark, uStemCol, uLeafCol;`)
        .replace('#include <alphamap_fragment>', `#include <alphamap_fragment>
          ${petals ? 'if (vPart > 0.5) discard;' : 'if (vPart < 0.5) discard;'}
          if (vPart > 0.5 && vPart < 1.5) diffuseColor.rgb = uStemCol;
          if (vPart > 1.5 && vPart < 2.5) diffuseColor.rgb = uLeafCol;
          if (vPart < 0.5) {
            float r1 = fract(sin((vSeed + uSeedOff) * 12.9898 + 4.1) * 43758.5453);
            float r2 = fract(sin((vSeed + uSeedOff) * 78.233 + 1.7) * 43758.5453);
            float m = uTone + (r1 - 0.5) * 1.3 * uVarPetal;
            m += uVarGrad * (0.5 - vU) * (0.8 + 0.5 * r2);
            float rim = smoothstep(0.5, 1.0, max(abs(vV), smoothstep(0.7, 1.0, vU)));
            m += uVarEdge * rim * (r2 > 0.5 ? 0.8 : -0.8);
            vec3 pc = mix(sqrt(uPetalLight), sqrt(uPetalDark), clamp(m, 0.0, 1.0)); pc *= pc;
            diffuseColor.rgb = diffuseColor.rgb / max(uTint, vec3(1e-3)) * pc;
            float e = 1.0 - (1.0 - abs(vV)) * (1.0 - pow(vU, 6.0));
            diffuseColor.a *= mix(uOpCentre, uOpEdge, smoothstep(1.0 - uOpBlend, 1.0, e));
            float edge = smoothstep(0.62, 1.0, abs(vV)) + smoothstep(0.82, 1.0, vU);
            float vein = pow(abs(sin(vV * 7.0 * 3.14159)), 24.0) * smoothstep(0.05, 0.3, vU) * 0.5;
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * diffuseColor.rgb * 0.55, clamp((edge + vein) * uEdges, 0.0, 1.0));
          }`);
    };
    mat.customProgramCacheKey = () => (petals ? 'garden-petals' : 'garden-solid');
  }

  // the kinds of plant: 'flower' (the lily), 'leafN' (a small leaf cluster). Each kind is generated at several
  // openings (flower: Petal Arc Bend closed ... open; leaves: folded ... open) and blended between, like shape keys
  const kinds = new Map();
  function kindParams(kind) {
    const p = { ...params };
    if (!params['Show Stem + Leaves']) { p['Stem Length'] = 0; p['Leaf Count'] = 0; }
    if (kind === 'flower') return p;
    const v = Number(kind.slice(4));
    return { ...p, 'Petals Per Ring': 0, 'Ring Count': 1, 'Stamen Count': 0, 'Pistil Scale': 0, 'Flower Head Scale': 0.001, 'Head Tilt': 0,
      'Stem Length': 0, 'Stem Bend': 0, 'Leaf Count': 1 + (v % 2), 'Leaf Start (top)': 0.45, 'Leaf End (bottom)': 0.7,
      'Leaf Spiral Angle': 150 + v * 25, 'Leaf Scale': 1, 'Leaf Size Gradient': 0.2, 'Leaf Seed': 11 + v * 7, 'Leaf Randomness': 0.35 };
  }
  function targetParams(kind, o) {
    const p = kindParams(kind);
    const span = params['Open Most'] - params['Closed Most'];
    const lt = Math.abs(span) < 1e-4 ? 1 : clamp01((o - params['Closed Most']) / span);
    p['Leaf Angle'] = params['Leaf Angle Closed'] + (params['Leaf Angle Open'] - params['Leaf Angle Closed']) * lt;
    p['Leaf Fold'] = params['Leaf Fold Closed'] + (params['Leaf Fold Open'] - params['Leaf Fold Closed']) * lt;
    p['Leaf Droop'] = params['Leaf Droop'] - params['Leaf Droop Breath'] * (1 - lt);
    if (kind === 'flower') p['Petal Arc Bend'] = ARC_CLOSED + (ARC_OPEN - ARC_CLOSED) * o;
    return p;
  }
  // every stem / leaf vertex: its place along the stem (0 head ... 1 foot); the head parts: -1
  function stemT(d, p) {
    const n = d.part.length, out = new Float32Array(n), SL = p['Stem Length'], lc = p['Leaf Count'], rn = p['Leaf Randomness'], seed = p['Leaf Seed'];
    let stemSeen = 0;
    for (let i = 0; i < n; i++) {
      const part = d.part[i];
      if (part === 1) { stemSeen++; out[i] = stemSeen <= 20 || SL <= 0 ? -1 : clamp01(-d.position[i * 3 + 1] / SL); }   // the first 20 are the green base
      else if (part === 2) {
        const li = Math.round(d.seed[i]) - 100, frac = li / Math.max(lc - 1, 1);
        out[i] = clamp01(p['Leaf Start (top)'] + (p['Leaf End (bottom)'] - p['Leaf Start (top)']) * frac + rand(seed + 1, li) * rn * 0.04);
      } else out[i] = -1;
    }
    return out;
  }
  function kindData(kind) {
    let k = kinds.get(kind);
    if (k) return k;
    const p = kindParams(kind);
    const d = generateLily(p, p['Flower Blooming']);
    let minY = Infinity;
    for (let i = 1; i < d.position.length; i += 3) minY = Math.min(minY, d.position[i]);
    k = {
      kind, params: p, count: d.part.length, steps: kind === 'flower' ? ARC_STEPS : LEAF_STEPS, targets: new Map(),
      index: new THREE.BufferAttribute(d.index, 1),
      attrs: { color: new THREE.BufferAttribute(d.color, 3), aGrowth: new THREE.BufferAttribute(d.growth, 1), aU: new THREE.BufferAttribute(d.u, 1),
        aV: new THREE.BufferAttribute(d.v, 1), aPart: new THREE.BufferAttribute(d.part, 1), aSeed: new THREE.BufferAttribute(d.seed, 1),
        aStemT: new THREE.BufferAttribute(stemT(d, p), 1) },
      foot: Math.min(-0.5, minY), stemLen: p['Stem Length'], stemBend: p['Stem Bend'],
      axis: new THREE.Vector3(0, Math.cos(p['Head Tilt']), Math.sin(p['Head Tilt'])),
    };
    kinds.set(kind, k);
    return k;
  }
  function target(k, i) {
    let t = k.targets.get(i);
    if (t) return t;
    const d = generateLily(targetParams(k.kind, i / (k.steps - 1)), k.params['Flower Blooming']);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(d.position, 3)); g.setIndex(k.index); g.computeVertexNormals();
    t = { pos: d.position, nor: g.attributes.normal.array };
    k.targets.set(i, t);
    return t;
  }
  function poseInto(k, outPos, outNor, o) {
    const x = clamp01(o) * (k.steps - 1), i = Math.min(Math.floor(x), k.steps - 2), f = x - i;
    const a = target(k, i), b = target(k, i + 1);
    if (a.pos.length !== outPos.length) return;
    for (let j = 0; j < outPos.length; j++) outPos[j] = a.pos[j] + (b.pos[j] - a.pos[j]) * f;
    if (outNor) for (let j = 0; j < outNor.length; j++) outNor[j] = a.nor[j] + (b.nor[j] - a.nor[j]) * f;
  }
  // generate the flower's poses one per frame before they are needed (no hitch when the first flower breathes)
  function warm() {
    const k = kindData('flower');
    for (let i = 0; i < k.steps; i++) if (!k.targets.has(i)) { target(k, i); return; }
  }

  // breathing (page 7): open on the breath in, close on the breath out. tt = seconds since the bud appeared
  function openAt(tt) {
    const tin = params['Breath In (s)'], tout = params['Breath Out (s)'];
    const ph = (((tt % (tin + tout)) + (tin + tout)) % (tin + tout));
    return ph < tin ? 0.5 - 0.5 * Math.cos(Math.PI * ph / tin) : 0.5 + 0.5 * Math.cos(Math.PI * (ph - tin) / tout);
  }
  const opennessAt = (tt) => params['Closed Most'] + (params['Open Most'] - params['Closed Most']) * openAt(tt);
  const turnAt = (tt) => THREE.MathUtils.degToRad(params['Breath Turn']) * (openAt(tt) - 0.5);
  const _sway = new THREE.Vector2();
  function motionVals(tt, leaf) {
    const open = openAt(tt), cycle = params['Breath In (s)'] + params['Breath Out (s)'];
    const ph = (((tt / cycle) % 1 + 1) % 1) * Math.PI * 2, sw = THREE.MathUtils.degToRad(params['Sway']) * (leaf ? 0.4 : 1);
    const scale = leaf ? 0.3 : 1;
    return { ph, turn: turnAt(tt) * scale, twist: -(turnAt(tt) - turnAt(tt - 0.4)) * params['Petal Lag'] * scale,
      sway: _sway.set(sw * (open - 0.5) * 1.4, sw * 0.6 * Math.sin(ph + 1.3)) };
  }

  const plants = [];
  const _m = new THREE.Matrix4(), _v = new THREE.Vector3();
  class Plant {
    constructor(kind, root, index, dir, size) {
      this.kind = kind; this.isFlower = kind === 'flower';
      this.root = root; this.index = index; this.anchor = growth.anchorOn(root, index);
      this.born = growth.now;
      this.t0 = this.born + (this.isFlower ? params['Stem Grow (s)'] : 0);      // the breath starts here
      this.size = size; this.dir = dir;
      this.lean = this.isFlower ? rnd(0.4, 0.8) : rnd(0.35, 0.7);                 // out of the wall, towards the viewer
      this.roll = rnd(0, Math.PI * 2);
      this.seedOff = Math.random() * 100;
      this.goAt = null; this.gone = false; this.crumbled = false;
      this.u = { ...shared, uMS: { value: 1 }, uMPh: { value: 0 }, uMTwist: { value: 0 }, uMSway: { value: new THREE.Vector2() },
        uDissolve: { value: 0 }, uGrow: { value: 0 }, uHead: { value: 0 }, uStemLen: { value: 0 }, uStemBend: { value: 0 },
        uMFoot: { value: -0.5 }, uMAxis: { value: new THREE.Vector3(0, 1, 0) }, uSeedOff: { value: this.seedOff } };
      this.geometry = new THREE.BufferGeometry();
      this.solidMat = createSolidMaterial(this.u); addLook(this.solidMat, false);
      this.solidMesh = new THREE.Mesh(this.geometry, this.solidMat);
      this.meshes = [this.solidMesh];
      if (this.isFlower) {
        this.petalMat = createSolidMaterial(this.u);
        this.petalMat.alphaHash = false; this.petalMat.transparent = true; this.petalMat.depthWrite = false;
        addLook(this.petalMat, true);
        this.petalMesh = new THREE.Mesh(this.geometry, this.petalMat);
        this.meshes.push(this.petalMesh);
      }
      const u = this.u;
      this.velMat = new THREE.ShaderMaterial({ vertexShader: VEL_VERT, fragmentShader: VEL_FRAG, side: THREE.DoubleSide, uniforms: {
        uMFlutter: u.uMFlutter, uMFoot: u.uMFoot, uMAxis: u.uMAxis, uMPh: u.uMPh, uMTwist: u.uMTwist, uMSway: u.uMSway,
        uGrow: u.uGrow, uHead: u.uHead, uStemLen: u.uStemLen, uStemBend: u.uStemBend,
        uMS2: { value: 1 }, uMPh2: { value: 0 }, uMTwist2: { value: 0 }, uMSway2: { value: new THREE.Vector2() }, uPrevModel: { value: new THREE.Matrix4() } } });
      this.outer = new THREE.Group(); this.inner = new THREE.Group(); this.lily = new THREE.Group();
      this.outer.add(this.inner); this.inner.add(this.lily);
      for (const m of this.meshes) { m.frustumCulled = false; m.layers.set(LAYER_FLOWERS); this.lily.add(m); }
      this.inner.rotation.x = this.lean;
      scene.add(this.outer);
      this.attach();
    }
    attach() {                                   // (re)build from the kind's geometry (when a flower slider changes too)
      const k = kindData(this.kind); this.k = k;
      const g = this.geometry;
      for (const [n, a] of Object.entries(k.attrs)) g.setAttribute(n, a);
      g.setIndex(k.index);
      if (g.attributes.position?.count !== k.count) {
        for (const n of ['position', 'normal', 'aPosA', 'aPosB']) g.setAttribute(n, new THREE.BufferAttribute(new Float32Array(k.count * 3), 3));
      }
      this.u.uStemLen.value = k.stemLen; this.u.uStemBend.value = k.stemBend; this.u.uMFoot.value = k.foot; this.u.uMAxis.value.copy(k.axis);
      for (const m of this.meshes) m.position.set(-k.stemBend, k.stemLen, 0);     // the foot of the stem sits on the root
      if (this.petalMat) this.petalMat.opacity = params['Petal Opacity'];
      this.poseVersion = -1;
    }
    get t() { return growth.now; }
    tt(t) { return Math.max(t - this.t0, 0); }
    // where it is: on the (drawn) root, moved with the sway of its cluster and the depth wave
    place() {
      const line = tubes.lines?.get(this.root) ?? this.root.points;
      const p = line[Math.min(this.index, line.length - 1)];
      const c = growth.centerOf(this.root), [ox, oy] = toWorld(c.x, c.y), [wx, wy] = toWorld(p.x, p.y);
      const a = swayAngle(originPhase(ox, oy), swayT, swayAmt());
      const dx = wx - ox, dy = wy - oy, ca = Math.cos(a), sa = Math.sin(a);
      const x = ox + ca * dx - sa * dy, y = oy + sa * dx + ca * dy;
      this.outer.position.set(x, y, waveZ(x, y, waveT) * params['Blur Variation'] - tubes.depthAt(this.root, this.index));
      this.outer.rotation.z = this.dir + a - Math.PI / 2;
      this.outer.scale.setScalar(this.size);
    }
    // the stage of its life: growing, bud, breathing, dissolving
    update(now, dt) {
      if (this.goAt === null) {
        const a = this.anchor();
        if (a !== true) this.goAt = Math.max(now, typeof a === 'number' ? a : now);
      }
      const age = now - this.born, u = this.u;
      if (this.isFlower) {
        const grow = params['Stem Grow (s)'];
        u.uGrow.value = ease(age / grow);
        u.uHead.value = ease((age - grow) / params['Bud Appear (s)']);
      } else { u.uGrow.value = ease(age / LEAF_GROW); u.uHead.value = 0; }
      if (this.goAt !== null && now >= this.goAt) {
        if (!this.crumbled) { this.crumble(now); this.crumbled = true; }
        u.uDissolve.value = clamp01((now - this.goAt) / PLANT_DISSOLVE);
        if (now - this.goAt > PLANT_DISSOLVE) this.gone = true;
      }
      this.place();
    }
    setPoses(now, L) {
      const g = this.geometry, k = this.k;
      poseInto(k, g.attributes.position.array, g.attributes.normal.array, opennessAt(this.tt(now)));
      g.attributes.position.needsUpdate = true; g.attributes.normal.needsUpdate = true;
      poseInto(k, g.attributes.aPosA.array, null, opennessAt(this.tt(now - L))); g.attributes.aPosA.needsUpdate = true;
      poseInto(k, g.attributes.aPosB.array, null, opennessAt(this.tt(now - L / 2))); g.attributes.aPosB.needsUpdate = true;
    }
    motionAt(t, s) {                             // put it at moment t (s: 0 oldest pose ... 1 now)
      const m = motionVals(this.tt(t), !this.isFlower), u = this.u;
      u.uMS.value = s; u.uMPh.value = m.ph; u.uMTwist.value = m.twist; u.uMSway.value.copy(m.sway);
      this.lily.rotation.y = this.roll + m.turn;
    }
    prepareVelocity(t, L) {                      // the velocity shader compares now with a moment ago
      const dt2 = Math.min(L * 0.5, 0.6), m2 = motionVals(this.tt(t - dt2), !this.isFlower), vu = this.velMat.uniforms;
      vu.uMS2.value = 1 - dt2 / L; vu.uMPh2.value = m2.ph; vu.uMTwist2.value = m2.twist; vu.uMSway2.value.copy(m2.sway);
      const keep = this.lily.rotation.y;
      this.lily.rotation.y = this.roll + m2.turn; this.outer.updateMatrixWorld(true);
      vu.uPrevModel.value.copy(this.solidMesh.matrixWorld);
      this.lily.rotation.y = keep; this.outer.updateMatrixWorld(true);
    }
    crumble(now) {                               // falls apart: particles from its vertices
      const g = this.geometry, pos = g.attributes.position.array, part = this.k.attrs.aPart.array, n = this.k.count;
      this.solidMesh.updateMatrixWorld(true);
      const every = Math.max(1, Math.round(n / (this.isFlower ? 450 : 60))), list = [];
      const light = shared.uPetalLight.value, dark = shared.uPetalDark.value, leaf = shared.uLeafCol.value, stem = shared.uStemCol.value;
      const spread = params['Dissolve Spread'] * (this.isFlower ? rnd(0.5, 1.2) : rnd(0.4, 1));
      for (let i = Math.floor(Math.random() * every); i < n; i += every) {
        _v.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).applyMatrix4(this.solidMesh.matrixWorld);
        const col = part[i] === 0 ? (Math.random() < 0.6 ? light : dark) : part[i] === 2 ? leaf : part[i] === 1 ? stem : null;
        const c = col ? [col.r, col.g, col.b] : [0.75, 0.78, 0.55];
        const a = Math.random() * Math.PI * 2, sp = rnd(0.08, 0.3) * spread;
        list.push({ x: _v.x, y: _v.y, z: _v.z + 0.02, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + 0.08 * spread, vz: rnd(0, 0.1) * spread,
          born: now + Math.random() * PLANT_DISSOLVE * 0.6, life: rnd(1.4, 3) * Math.sqrt(params['Dissolve (s)'] / 2.5), size: rnd(0.02, 0.04), loosen: 0.5, color: c });
      }
      particles.spawn(list);
    }
    dispose() {
      scene.remove(this.outer);
      this.geometry.dispose(); this.solidMat.dispose(); this.petalMat?.dispose(); this.velMat.dispose();
    }
  }

  // ---- where flowers and leaves may grow
  const flowersAlive = () => plants.filter((p) => p.isFlower && !p.crumbled);
  const flowersOf = (spot) => flowersAlive().filter((p) => p.root.spot === spot.id).length;
  const pointOf = (root, index) => root.points[Math.min(index, root.points.length - 1)];
  function free(x, y, minD, kind) {
    for (const p of plants) {
      if (p.goAt !== null) continue;
      const q = pointOf(p.root, p.index);
      // flowers keep their distance from flowers, leaves from leaves; a flower and a leaf only a little
      const d = (kind === 'flower') === p.isFlower ? minD : 30;
      if (Math.hypot(q.x - x, q.y - y) < d) return false;
    }
    return x > EDGE_MARGIN && x < SIM_W - EDGE_MARGIN && y > EDGE_MARGIN && y < SIM_H - EDGE_MARGIN;
  }
  function tryFlower(root, index) {
    if (!root || !growth.alive(root) || index < 1 || index >= root.points.length - 1 || (root.cut ?? 0) > index) return false;
    if (flowersAlive().length >= params['Max Flowers']) return false;
    const p = pointOf(root, index);
    if (!free(p.x, p.y, params['Flower Spacing'], 'flower')) return false;
    const a = root.points[index - 1], b = root.points[index + 1];
    const along = -Math.atan2(b.y - a.y, b.x - a.x);                   // root direction in world
    const dir = along + (Math.random() < 0.5 ? -1 : 1) * rnd(0.7, 1.3);
    plants.push(new Plant('flower', root, index, dir, params['Flower Size'] * rnd(0.85, 1.15)));
    growth.flowerSpots.add(root.spot); growth.keepRoot(root);
    return true;
  }
  function tryLeaf(root, index) {
    if (!root || !growth.alive(root) || index < 1 || index >= root.points.length - 1 || (root.cut ?? 0) > index) return false;
    if (plants.length - flowersAlive().length >= 70) return false;
    const p = pointOf(root, index);
    if (!free(p.x, p.y, 45, 'leaf')) return false;
    const a = root.points[index - 1], b = root.points[index + 1];
    const along = -Math.atan2(b.y - a.y, b.x - a.x);
    const dir = along + (Math.random() < 0.5 ? -1 : 1) * rnd(0.3, 0.8) + (Math.random() < 0.5 ? Math.PI : 0);
    plants.push(new Plant(`leaf${Math.floor(Math.random() * LEAF_VARIANTS)}`, root, index, dir, params['Leaf Size'] * rnd(0.8, 1.2)));
    return true;
  }
  function candidateOnSpot(spot) {
    const own = growth.roots.filter((r) => r.spot === spot.id && growth.alive(r) && r.points.length >= 8);
    if (!own.length) return null;
    const r = own[Math.floor(Math.random() * own.length)];
    return { root: r, index: Math.floor((r.points.length - 1) * rnd(0.45, 0.85)) };
  }
  function handleEvents(events, lights, dt, now) {
    const dust = [];
    for (const e of events) {
      if (e.type === 'particle') {
        const [x, y] = toWorld(e.x, e.y), c = rootColour(e.tone);
        dust.push({ x, y, z: 0.02, vx: e.vx / PX, vy: -e.vy / PX, vz: rnd(0, 0.05), born: e.born, life: e.life, size: e.size * 3.2 / PX, color: [c.r, c.g, c.b] });
      } else if (e.type === 'connect') {
        // roots of two lights joined: sometimes a flower right where they meet (the rest comes from the energy below)
        if (Math.random() < 0.25) tryFlower(e.root, e.root.points.length - 2 - Math.floor(Math.random() * 4));
      } else if (e.type === 'boost') {
        if (e.level >= 2) { const c = candidateOnSpot(e.spot); if (c) tryFlower(c.root, c.index); }
      } else if (e.type === 'leaf') {
        if (Math.random() < params['Branch Leaves'] * (e.route ? 0.7 : 1)) tryLeaf(e.root, e.index);
      }
    }
    if (dust.length) particles.spawn(dust);
    // light on a spot = energy; enough energy = a flower (more allowed the more the spot's roots are connected)
    for (const spot of growth.spots) {
      for (const l of lights) if (Math.hypot(l.x - spot.x, l.y - spot.y) < 130) spot.energy += dt * (l.strength ?? 1);
      if (spot.energy >= FLOWER_COST) {
        if (flowersOf(spot) < 1 + Math.min(spot.links, 3)) { const c = candidateOnSpot(spot); if (c && tryFlower(c.root, c.index)) spot.energy -= FLOWER_COST; }
        spot.energy = Math.min(spot.energy, FLOWER_COST * 1.5);
      }
    }
  }
  const _rc = new THREE.Color();
  const rootColour = (tone) => _rc.copy(tubes.u.uColA.value).lerp(tubes.u.uColB.value, tone).lerp(new THREE.Color(1, 1, 1), 0.25);

  // ---------------------------------------------------------------- rendering (page 7's pipeline)
  const rt = (w, h, depth = false) => {
    const t = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: depth });
    if (depth) { t.depthTexture = new THREE.DepthTexture(w, h); t.depthTexture.type = THREE.UnsignedIntType; }
    return t;
  };
  let velRT, velB, velTmp, streakRT, sceneRT, rootsRT, subRT, trailRT, glowA, glowB, colorRT, cocRT, b1, b2, b3, tmp1, tmp2, tmp3, cocB, cocTmp, bsA, bsB, emptyRT;
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  const quadScene = new THREE.Scene(); quadScene.add(quad);
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const cocMat = new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: COC_FRAG,
    uniforms: { tColor: { value: null }, tDepth: { value: null }, tDepth2: { value: null }, tNow: { value: null }, tRoots: { value: null }, uNear: { value: 1 }, uFar: { value: 60 }, uFocus: { value: CAM_DIST }, uRange: { value: 1 }, uBase: { value: 0 }, uBehind: { value: 0 }, uTrailSoft: { value: 0 } } });
  const glowMat = new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: GLOW_FRAG, uniforms: { tInput: { value: null }, tPrev: { value: null }, uKeep: { value: 0 } } });
  const streakMat = new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: STREAK_FRAG, uniforms: { tInput: { value: null }, tVel: { value: null }, uLen: { value: 1 } } });
  const combineMat = new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: COMBINE_FRAG, uniforms: { tTrail: { value: null }, tNow: { value: null }, tRoots: { value: null }, uNow: { value: 1 } } });
  const addMat = new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: ADD_FRAG, uniforms: { tInput: { value: null }, uWeight: { value: 1 } },
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor, depthTest: false, depthWrite: false, transparent: true });
  const blurMat = new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: BLUR_FRAG, uniforms: { tInput: { value: null }, uDir: { value: new THREE.Vector2() } } });
  const finalMat = new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: FINAL_FRAG, uniforms: {
    tColor: { value: null }, tB1: { value: null }, tB2: { value: null }, tB3: { value: null }, tCoc: { value: null }, tCocBlur: { value: null },
    uRes: { value: new THREE.Vector2() }, uAmount: { value: 1 }, uFrost: { value: 0 }, uExposure: { value: 1 }, uContrast: { value: 1 }, uSat: { value: 1 },
    uWarmth: { value: 0 }, uFade: { value: 0 }, uBgTop: { value: new THREE.Color() }, uBgBottom: { value: new THREE.Color() },
    uShadow: { value: new THREE.Color() }, uHigh: { value: new THREE.Color() }, uShadowAmt: { value: 0 }, uHighAmt: { value: 0 },
    uGlow: { value: 0 }, tBgShadow: { value: null }, uBsCol: { value: new THREE.Color() }, uBsOpacity: { value: 0 }, uBsGain: { value: 3 }, uBsSize: { value: 1 },
    uAspect: { value: 1 }, uBsAnchor: { value: new THREE.Vector2(0.5, 0.5) }, uBsOffset: { value: new THREE.Vector2() },
    uLights: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) }, uLightCount: { value: 0 }, uLightCol: { value: new THREE.Color(1, 0.97, 0.9) } } });

  function pass(mat, target) { quad.material = mat; renderer.setRenderTarget(target); renderer.render(quadScene, quadCam); }
  function blur(src, mid, dst, radius) {
    blurMat.uniforms.tInput.value = src.texture; blurMat.uniforms.uDir.value.set(radius / mid.width, 0); pass(blurMat, mid);
    blurMat.uniforms.tInput.value = mid.texture; blurMat.uniforms.uDir.value.set(0, radius / dst.height); pass(blurMat, dst);
  }
  function renderLayer(layer, target, clear = true) {
    camera.layers.set(layer);
    renderer.setRenderTarget(target); if (clear) renderer.clear(); renderer.render(scene, camera);
  }

  let W = 1, H = 1, glowFresh = true;
  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    renderer.setSize(W, H, false);
    camera.aspect = W / H; camera.updateProjectionMatrix();
    SIM_W = SIM_H * W / H; growth.setSize(SIM_W, SIM_H); lightInput.setSize(SIM_W, SIM_H);
    const pr = renderer.getPixelRatio(), w = Math.round(W * pr), h = Math.round(H * pr);
    particles.material.uniforms.uPx.value = h / (2 * Math.tan((FOV * Math.PI) / 360));
    for (const t of [velRT, velB, velTmp, streakRT, sceneRT, rootsRT, subRT, trailRT, glowA, glowB, colorRT, cocRT, b1, b2, b3, tmp1, tmp2, tmp3, cocB, cocTmp, bsA, bsB, emptyRT]) t?.dispose();
    sceneRT = rt(w, h, true); rootsRT = rt(w, h, true); colorRT = rt(w, h); cocRT = rt(w, h);
    subRT = rt(w >> 1, h >> 1, true); trailRT = rt(w >> 1, h >> 1);
    glowA = rt(w >> 1, h >> 1); glowB = rt(w >> 1, h >> 1); glowFresh = true;
    velRT = rt(w >> 1, h >> 1, true); streakRT = rt(w >> 1, h >> 1);
    velB = rt(w >> 3, h >> 3); velTmp = rt(w >> 3, h >> 3);
    b1 = rt(w >> 1, h >> 1); tmp1 = rt(w >> 1, h >> 1);
    b2 = rt(w >> 2, h >> 2); tmp2 = rt(w >> 2, h >> 2);
    b3 = rt(w >> 3, h >> 3); tmp3 = rt(w >> 3, h >> 3);
    cocB = rt(w >> 3, h >> 3); cocTmp = rt(w >> 3, h >> 3);
    bsA = rt(Math.max(w >> 4, 8), Math.max(h >> 4, 8)); bsB = rt(Math.max(w >> 4, 8), Math.max(h >> 4, 8));
    emptyRT = rt(4, 4); renderer.setRenderTarget(emptyRT); renderer.clear();
    finalMat.uniforms.uRes.value.set(w, h);
  }

  // the flowers of now, full size, with depth (the see-through petals add their depth afterwards)
  function renderNow() {
    renderLayer(LAYER_FLOWERS, sceneRT);
    for (const p of plants) if (p.petalMat) { p.solidMesh.visible = false; p.petalMat.colorWrite = false; p.petalMat.depthWrite = true; }
    renderLayer(LAYER_FLOWERS, sceneRT, false);
    for (const p of plants) if (p.petalMat) { p.solidMesh.visible = true; p.petalMat.colorWrite = true; p.petalMat.depthWrite = false; }
  }

  function setColours() {
    const [r, g, b] = hsv(params['Blossom Hue'], params['Blossom Saturation'], params['Blossom Value']);
    shared.uTint.value.setRGB(r, g, b, THREE.LinearSRGBColorSpace);
    shared.uPetalLight.value.set(params['Petal Light Colour']); shared.uPetalDark.value.set(params['Petal Dark Colour']);
    shared.uTone.value = params['Petal Tone']; shared.uVarPetal.value = params['Petal Variation'];
    shared.uVarGrad.value = params['Petal Gradient']; shared.uVarEdge.value = params['Petal Edge Variation'];
    shared.uStemCol.value.set(params['Stem Colour']); shared.uLeafCol.value.set(params['Leaf Colour']);
    shared.uOpCentre.value = params['Petal Centre Opacity']; shared.uOpEdge.value = params['Petal Edge Opacity']; shared.uOpBlend.value = params['Petal Opacity Blend'];
    shared.uMFlutter.value = params['Petal Flutter']; shared.uEdges.value = params['Petal Edges'];
    const tu = tubes.u;
    tu.uColA.value.set(params['Root Colour']); tu.uColB.value.set(params['Root Colour 2']);
    tu.uThick.value = params['Root Thickness']; tu.uSwayAmt.value = swayAmt(); tu.uWaveAmt.value = params['Blur Variation'];
    tu.uDepthAmt.value = params['Root Depth Variation'] * 0.8; tu.uFadeAmt.value = Math.min(1, params['Root Depth Variation'] * 1.3);
    tu.uGlow.value = params['Root Glow']; tu.uGlowW.value = params['Root Glow Width'];
    tu.uGlowCol.value.set(params['Root Glow Colour']); tu.uFaint.value.set(params['Root Faint Colour']);
  }

  function render(now, dt, lights) {
    setColours();
    tubes.u.uTime.value = now; tubes.u.uWaveT.value = waveT; tubes.u.uSwayT.value = swayT;
    particles.material.uniforms.uTime.value = now;
    const L = params['Trail Length (s)'], n = Math.round(params['Trail Copies']);
    const trails = plants.length > 0 && L > 0 && n > 1;
    for (const p of plants) p.setPoses(now, trails ? L : 0);
    let trailTex = emptyRT.texture;
    if (trails) {
      const k = params['Trail Fade'] * 3;
      let sum = 0; const w = [];
      for (let i = 0; i < n; i++) { w.push(Math.pow((i + 1) / n, k)); sum += w[i]; }
      renderer.setRenderTarget(trailRT); renderer.clear();
      for (let i = 0; i < n; i++) {
        const s = i / (n - 1);
        for (const p of plants) p.motionAt(now - L * (1 - s), s);
        renderLayer(LAYER_FLOWERS, subRT);
        addMat.uniforms.tInput.value = subRT.texture; addMat.uniforms.uWeight.value = w[i] / sum;
        pass(addMat, trailRT);
      }
      trailTex = trailRT.texture;
      if (params['Streaks'] > 0) {
        for (const p of plants) { p.motionAt(now, 1); p.prepareVelocity(now, L); for (const m of p.meshes) m.material = p.velMat; }
        renderLayer(LAYER_FLOWERS, velRT);
        for (const p of plants) { p.solidMesh.material = p.solidMat; if (p.petalMesh) p.petalMesh.material = p.petalMat; }
        blur(velRT, velTmp, velB, 3.0); blur(velB, velTmp, velB, 3.0);
        streakMat.uniforms.tInput.value = trailTex; streakMat.uniforms.tVel.value = velB.texture;
        streakMat.uniforms.uLen.value = params['Streaks'];
        pass(streakMat, streakRT);
        trailTex = streakRT.texture;
      }
      if (params['Afterglow'] > 0) {
        glowMat.uniforms.tInput.value = trailTex; glowMat.uniforms.tPrev.value = glowA.texture;
        glowMat.uniforms.uKeep.value = glowFresh ? 0 : Math.pow(params['Afterglow'], Math.max(dt, 1 / 60) * 60);
        pass(glowMat, glowB); [glowA, glowB] = [glowB, glowA]; glowFresh = false;
        trailTex = glowA.texture;
      } else glowFresh = true;
    } else glowFresh = true;
    for (const p of plants) p.motionAt(now, 1);
    renderNow();
    renderLayer(LAYER_ROOTS, rootsRT);
    combineMat.uniforms.tTrail.value = trailTex; combineMat.uniforms.tNow.value = sceneRT.texture; combineMat.uniforms.tRoots.value = rootsRT.texture;
    combineMat.uniforms.uNow.value = trails ? params['Now Strength'] : 1;
    pass(combineMat, colorRT);
    // how blurred each pixel should be
    const cu = cocMat.uniforms;
    cu.tColor.value = colorRT.texture; cu.tDepth.value = sceneRT.depthTexture; cu.tDepth2.value = rootsRT.depthTexture;
    cu.tNow.value = sceneRT.texture; cu.tRoots.value = rootsRT.texture;
    cu.uTrailSoft.value = params['Trail Softness']; cu.uNear.value = camera.near; cu.uFar.value = camera.far;
    cu.uFocus.value = CAM_DIST + params['Focus Distance']; cu.uRange.value = params['Depth Range'];
    cu.uBase.value = params['Base Blur']; cu.uBehind.value = params['Only Behind Focus'] ? 1 : 0;
    pass(cocMat, cocRT);
    blur(cocRT, cocTmp, cocB, 2.0);
    blur(colorRT, tmp1, b1, 1.6); blur(b1, tmp2, b2, 1.8); blur(b2, tmp3, b3, 2.2);
    const bsOn = params['Bg Shadow'] && params['Bg Shadow Opacity'] > 0;
    if (bsOn) {
      const amt = params['Bg Shadow Blur'], r = 1 + amt * 5, passes = 1 + Math.round(amt * 6);
      blur(b3, bsB, bsA, r);
      for (let i = 0; i < passes; i++) blur(bsA, bsB, bsA, r);
    }
    const f = finalMat.uniforms;
    f.tColor.value = colorRT.texture; f.tB1.value = b1.texture; f.tB2.value = b2.texture; f.tB3.value = b3.texture;
    f.tCoc.value = cocRT.texture; f.tCocBlur.value = cocB.texture;
    f.uAmount.value = params['Blur Amount']; f.uFrost.value = params['Frost (paleness)'];
    f.uExposure.value = params['Exposure']; f.uContrast.value = params['Contrast']; f.uSat.value = params['Saturation'];
    f.uWarmth.value = params['Warmth']; f.uFade.value = params['Fade'];
    f.uBgTop.value.set(params['Background Top']); f.uBgBottom.value.set(params['Background Bottom']);
    f.uShadow.value.set(params['Shadow Tint']); f.uHigh.value.set(params['Highlight Tint']);
    f.uShadowAmt.value = params['Shadow Tint Amount']; f.uHighAmt.value = params['Highlight Tint Amount'];
    f.uGlow.value = params['Glow'];
    f.tBgShadow.value = bsA.texture; f.uBsOpacity.value = bsOn ? params['Bg Shadow Opacity'] : 0;
    f.uBsGain.value = 3 * (1 + 3 * params['Bg Shadow Blur']);
    f.uBsCol.value.set(params['Bg Shadow Colour']); f.uBsSize.value = params['Bg Shadow Size'];
    f.uBsOffset.value.set(params['Bg Shadow Offset X'], params['Bg Shadow Offset Y']); f.uAspect.value = W / H;
    const nL = Math.min(lights.length, 8);
    for (let i = 0; i < nL; i++) f.uLights.value[i].set(lights[i].x / SIM_W, 1 - lights[i].y / SIM_H, params['Light Glow'], 0.16);
    f.uLightCount.value = nL;
    pass(finalMat, null);
  }

  // ---------------------------------------------------------------- the frame
  let lastNow = 0;
  const rootLook = () => ({ smooth: params['Root Smoothness'], joint: params['Root Joint Softness'], thickVar: params['Root Thickness Variation'], depth: params['Root Depth Variation'] });
  const prof = {};                               // slowest time per phase (ms), for testing
  const mark = (name, t) => { const d = performance.now() - t; if (!(prof[name] >= d)) prof[name] = d; return performance.now(); };
  function step(dt) {
    let t = performance.now();
    const real = lightInput.update(dt).map((l) => ({ ...l, strength: l.size ? Math.min(2, 0.5 + l.size / 300) : 1 }));
    const { lights, events } = growth.update(real, dt);
    const now = growth.now;
    t = mark('sim', t);
    waveT = (waveT + dt * params['Blur Variation Speed']) % WAVE_PERIOD;
    swayT = (swayT + dt) % SWAY_PERIOD;
    growth.live.stay = params['Root Stay (s)']; growth.live.dissolve = params['Dissolve (s)']; growth.live.spread = params['Dissolve Spread'];
    tubes.u.uFadeLen.value = 0.8;
    if (growth.dirty) { tubes.rebuild(growth, toWorld, 1 / PX, rootLook()); growth.clean(); }
    t = mark('tubes', t);
    handleEvents(events, lights, dt, now);
    for (const p of plants) p.update(now, dt);
    for (let i = plants.length - 1; i >= 0; i--) if (plants[i].gone) { plants[i].dispose(); plants.splice(i, 1); }
    t = mark('plants', t);
    warm();
    t = mark('warm', t);
    hint.textContent = lightInput.state.useCamera ? lightInput.state.status : 'Hold the mouse button down = light (or switch on the camera in the panel)';
    preview.hidden = !(lightInput.state.useCamera && lightInput.state.showPreview);
    render(now, dt, lights);
    mark('render', t);
    lastNow = now;
  }

  // ---------------------------------------------------------------- panel
  const gui = new GUI({ title: '8 · Garden' });
  gui.domElement.classList.add('garden__gui');
  gui.hide();
  opts.panelTop?.(gui);
  const onLook = () => { save(); };
  const onFlower = () => { save(); kinds.clear(); for (const p of plants) p.attach(); };
  const onBreathShape = () => { save(); for (const k of kinds.values()) k.targets.clear(); };

  const fi = gui.addFolder('Light input');
  const inputCtl = { 'Use camera': false, 'Show camera view': false, Calibrate: () => lightInput.calibrate(),
    'Fake lights': () => growth.startFake(), 'Stop fake lights': () => growth.stopFake(), 'Clear garden': () => clearGarden() };
  fi.add(inputCtl, 'Use camera').onChange((v) => lightInput.setCamera(v));
  fi.add(inputCtl, 'Calibrate').name('Calibrate (light off first)');
  fi.add(params, 'Threshold', 5, 200, 1).name('Camera threshold').onChange(() => { save(); lightInput.state.threshold = params['Threshold']; });
  fi.add(inputCtl, 'Show camera view').onChange((v) => { lightInput.state.showPreview = v; });
  fi.add(inputCtl, 'Fake lights').name('Fake lights (random scenario)');
  fi.add(inputCtl, 'Stop fake lights');
  fi.add(inputCtl, 'Clear garden');
  lightInput.state.threshold = params['Threshold'];

  const fg = gui.addFolder('Garden: flowers');
  fg.add(params, 'Flower Size', 0.2, 1.2, 0.01).name('Flower size').onChange(onLook);
  fg.add(params, 'Max Flowers', 0, 20, 1).name('Flowers at most').onChange(onLook);
  fg.add(params, 'Flower Spacing', 40, 300, 1).name('Space between flowers (px)').onChange(onLook);
  fg.add(params, 'Stem Grow (s)', 0.5, 8, 0.1).name('Stem grows in (s)').onChange(onLook);
  fg.add(params, 'Bud Appear (s)', 0.1, 3, 0.1).name('Bud appears in (s)').onChange(onLook);
  fg.add(params, 'Branch Leaves', 0, 1, 0.01).name('Leaves on the roots').onChange(onLook);
  fg.add(params, 'Leaf Size', 0.1, 1, 0.01).name('Leaf size').onChange(onLook);

  const fr = gui.addFolder('Garden: roots');
  fr.addColor(params, 'Root Colour').name('Root colour').onChange(onLook);
  fr.addColor(params, 'Root Colour 2').name('Root colour 2 (variation)').onChange(onLook);
  fr.add(params, 'Root Thickness', 0.2, 3, 0.01).name('Thickness').onChange(onLook);
  fr.add(params, 'Blur Variation', 0, 2, 0.01).name('Blur variation (amount)').onChange(onLook);
  fr.add(params, 'Blur Variation Speed', 0, 3, 0.01).name('Blur variation (speed)').onChange(onLook);
  fr.add(params, 'Root Sway', 0, 1, 0.01).name('Movement (sway)').onChange(onLook);
  fr.add(params, 'Root Stay (s)', 0, 20, 0.1).name('Roots stay (s after the light)').onChange(onLook);
  fr.add(params, 'Dissolve (s)', 0.5, 6, 0.1).name('Dissolve (s)').onChange(onLook);
  fr.add(params, 'Dissolve Spread', 0, 3, 0.01).name('Dissolve spread').onChange(onLook);
  fr.add(params, 'Light Glow', 0, 0.5, 0.005).name('Light on the wall').onChange(onLook);

  const frl = gui.addFolder('Root look (v2)');
  const onShape = () => { save(); growth.touch(); };
  frl.add(params, 'Root Smoothness', 0, 1, 0.01).name('Smoothness').onChange(onShape);
  frl.add(params, 'Root Joint Softness', 0, 1, 0.01).name('Soft joints').onChange(onShape);
  frl.add(params, 'Root Thickness Variation', 0, 1, 0.01).name('Thickness variation').onChange(onShape);
  frl.add(params, 'Root Depth Variation', 0, 1, 0.01).name('Depth / fade variation').onChange(onShape);
  frl.add(params, 'Root Glow', 0, 1, 0.01).name('Soft edge + glow').onChange(onLook);
  frl.add(params, 'Root Glow Width', 0, 3, 0.01).name('Glow width').onChange(onLook);
  frl.addColor(params, 'Root Glow Colour').name('Glow colour').onChange(onLook);
  frl.addColor(params, 'Root Faint Colour').name('Colour further back').onChange(onLook);

  const ff = gui.addFolder('Flower');
  for (const [k, label] of Object.entries(FLOWER_KEYS)) {
    let range = null;
    for (const g of Object.values(FLOWER_PARAMS)) if (g[k]) range = g[k];
    if (!range) continue;
    ff.add(params, k, range[1], range[2], range[3]).name(label).onChange(onFlower);
  }
  const linHex = (rgb) => `#${new THREE.Color().setRGB(...rgb, THREE.LinearSRGBColorSpace).getHexString()}`;
  const onBlossom = () => {
    const h = params['Blossom Hue'], sat = params['Blossom Saturation'], v = params['Blossom Value'];
    params['Petal Light Colour'] = linHex(hsv(h, sat * 0.4, Math.min(1, v * 1.3)));
    params['Petal Dark Colour'] = linHex(hsv(h + 0.01, Math.min(1, sat * 1.2), v * 0.4));
    gui.controllersRecursive().forEach((c) => c.updateDisplay());
    save();
  };
  ff.add(params, 'Blossom Hue', 0, 1, 0.005).name('Colour (hue)').onChange(onBlossom);
  ff.add(params, 'Blossom Saturation', 0, 1, 0.01).name('Colour (saturation)').onChange(onBlossom);
  ff.add(params, 'Blossom Value', 0, 1, 0.01).name('Colour (brightness)').onChange(onBlossom);
  ff.add(params, 'Petal Opacity', 0.2, 1, 0.01).name('Petal opacity').onChange(() => { save(); for (const p of plants) if (p.petalMat) p.petalMat.opacity = params['Petal Opacity']; });
  ff.add(params, 'Petal Edges', 0, 1, 0.01).name('Petal edges + veins').onChange(onLook);
  ff.add(params, 'Petal Centre Opacity', 0, 1, 0.01).name('Petal middle opacity').onChange(onLook);
  ff.add(params, 'Petal Edge Opacity', 0, 1, 0.01).name('Petal edge opacity').onChange(onLook);
  ff.add(params, 'Petal Opacity Blend', 0.05, 1, 0.01).name('Middle → edge softness').onChange(onLook);
  ff.add(params, 'Show Stem + Leaves').name('Stem + leaves').onChange(onFlower);

  const flv = gui.addFolder('Leaves');
  const flowerRange = (k) => { for (const g of Object.values(FLOWER_PARAMS)) if (g[k]) return g[k].slice(1, 4); return [0, 1, 0.01]; };
  flv.add(params, 'Leaf Angle', ...flowerRange('Leaf Angle')).name('Angle (still flower)').onChange(onFlower);
  flv.add(params, 'Leaf Fold', ...flowerRange('Leaf Fold')).name('Fold (still flower)').onChange(onFlower);
  flv.add(params, 'Leaf Droop', ...flowerRange('Leaf Droop')).name('Droop').onChange(onFlower);
  flv.add(params, 'Leaf Twist', ...flowerRange('Leaf Twist')).name('Twist').onChange(onFlower);
  flv.add(params, 'Leaf Angle Closed', 0, 150, 0.5).name('Breath: angle closed (°)').onChange(onBreathShape);
  flv.add(params, 'Leaf Angle Open', 0, 150, 0.5).name('Breath: angle open (°)').onChange(onBreathShape);
  flv.add(params, 'Leaf Fold Closed', -1, 1, 0.01).name('Breath: fold closed').onChange(onBreathShape);
  flv.add(params, 'Leaf Fold Open', -1, 1, 0.01).name('Breath: fold open').onChange(onBreathShape);
  flv.add(params, 'Leaf Droop Breath', 0, 1, 0.01).name('Breath: less droop closed').onChange(onBreathShape);

  const fc = gui.addFolder('Petal + stem colours');
  fc.addColor(params, 'Petal Light Colour').name('Light petal colour').onChange(onLook);
  fc.addColor(params, 'Petal Dark Colour').name('Dark petal colour').onChange(onLook);
  fc.add(params, 'Petal Tone', 0, 1, 0.01).name('Light ↔ dark').onChange(onLook);
  fc.add(params, 'Petal Variation', 0, 1, 0.01).name('Between petals (same → mixed)').onChange(onLook);
  fc.add(params, 'Petal Gradient', 0, 1.5, 0.01).name('Gradient (dark base → light tip)').onChange(onLook);
  fc.add(params, 'Petal Edge Variation', 0, 1, 0.01).name('Edges (some dark, some light)').onChange(onLook);
  fc.addColor(params, 'Stem Colour').name('Stem colour').onChange(onLook);
  fc.addColor(params, 'Leaf Colour').name('Leaf colour').onChange(onLook);

  const fb = gui.addFolder('Blur (frosted glass)');
  fb.add(params, 'Blur Amount', 0, 1.5, 0.01).name('Blur amount').onChange(onLook);
  fb.add(params, 'Base Blur', 0, 1, 0.01).name('Blur everywhere').onChange(onLook);
  fb.add(params, 'Focus Distance', -3, 3, 0.01).name('Sharp at (- near, + far)').onChange(onLook);
  fb.add(params, 'Depth Range', 0.2, 5, 0.01).name('Depth to full blur').onChange(onLook);
  fb.add(params, 'Only Behind Focus').name('Only blur behind').onChange(onLook);
  fb.add(params, 'Frost (paleness)', 0, 1, 0.01).name('Paler when blurred').onChange(onLook);

  const fs = gui.addFolder('Background shadow');
  fs.add(params, 'Bg Shadow').name('Shadow on/off').onChange(onLook);
  fs.addColor(params, 'Bg Shadow Colour').name('Colour (lighter/darker than bg)').onChange(onLook);
  fs.add(params, 'Bg Shadow Blur', 0, 1, 0.01).name('Blur').onChange(onLook);
  fs.add(params, 'Bg Shadow Opacity', 0, 1, 0.01).name('Opacity').onChange(onLook);
  fs.add(params, 'Bg Shadow Offset X', -0.5, 0.5, 0.005).name('Offset (- left, + right)').onChange(onLook);
  fs.add(params, 'Bg Shadow Offset Y', -0.5, 0.5, 0.005).name('Offset (- down, + up)').onChange(onLook);
  fs.add(params, 'Bg Shadow Size', 0.5, 3, 0.01).name('Size').onChange(onLook);

  const fl = gui.addFolder('Colour');
  fl.addColor(params, 'Background Top').name('Background top').onChange(onLook);
  fl.addColor(params, 'Background Bottom').name('Background bottom').onChange(onLook);
  fl.add(params, 'Exposure', 0.3, 2, 0.01).onChange(onLook);
  fl.add(params, 'Contrast', 0.4, 1.6, 0.01).onChange(onLook);
  fl.add(params, 'Saturation', 0, 2, 0.01).onChange(onLook);
  fl.add(params, 'Warmth', -1, 1, 0.01).onChange(onLook);
  fl.add(params, 'Fade', 0, 0.4, 0.005).name('Fade (lift blacks)').onChange(onLook);
  fl.addColor(params, 'Shadow Tint').name('Shadow colour').onChange(onLook);
  fl.add(params, 'Shadow Tint Amount', 0, 1, 0.01).name('Shadow colour amount').onChange(onLook);
  fl.addColor(params, 'Highlight Tint').name('Highlight colour').onChange(onLook);
  fl.add(params, 'Highlight Tint Amount', 0, 1, 0.01).name('Highlight colour amount').onChange(onLook);
  fl.add(params, 'Glow', 0, 1.5, 0.01).onChange(onLook);

  const fbr = gui.addFolder('Breathing');
  fbr.add(params, 'Breath In (s)', 1, 10, 0.1).name('Breath in (opens), s').onChange(onLook);
  fbr.add(params, 'Breath Out (s)', 1, 10, 0.1).name('Breath out (closes), s').onChange(onLook);
  fbr.add(params, 'Open Most', 0, 1, 0.01).name('Most open (1 = fully)').onChange(onBreathShape);
  fbr.add(params, 'Closed Most', 0, 1, 0.01).name('Most closed (0 = bud)').onChange(onBreathShape);
  fbr.add(params, 'Breath Turn', 0, 120, 0.5).name('Turn with the breath (°)').onChange(onLook);
  fbr.add(params, 'Sway', 0, 25, 0.1).name('Sway on the stem (°)').onChange(onLook);
  fbr.add(params, 'Petal Lag', 0, 3, 0.01).name('Petal tips lag (swirl)').onChange(onLook);
  fbr.add(params, 'Petal Flutter', 0, 0.3, 0.001).name('Petals flutter').onChange(onLook);
  const fm = gui.addFolder('Long exposure (motion trails)');
  fm.add(params, 'Trail Length (s)', 0, 3, 0.01).name('Exposure time (s, 0 = off)').onChange(onLook);
  fm.add(params, 'Trail Copies', 2, 48, 1).name('Copies (smoother = slower)').onChange(onLook);
  fm.add(params, 'Trail Fade', 0, 1, 0.01).name('Trail fade (0 = even)').onChange(onLook);
  fm.add(params, 'Now Strength', 0, 1, 0.01).name('Flower of now (solid)').onChange(onLook);
  fm.add(params, 'Trail Softness', 0, 1, 0.01).name('Trail softness').onChange(onLook);
  fm.add(params, 'Streaks', 0, 3, 0.01).name('Streaks (smear along motion)').onChange(onLook);
  fm.add(params, 'Afterglow', 0, 0.97, 0.01).name('Afterglow (longer trails)').onChange(onLook);
  for (const f of [ff, flv, fc, fb, fs, fl, fbr, fm]) f.close();

  function clearGarden() { growth.clear(); for (const p of plants) p.dispose(); plants.length = 0; }
  const actions = {
    'Save image (PNG)': () => { const a = document.createElement('a'); a.download = `garden-${Date.now()}.png`; a.href = canvas.toDataURL('image/png'); a.click(); },
    'Copy settings (JSON)': async () => { try { await navigator.clipboard.writeText(JSON.stringify(params, null, 2)); } catch { console.log(JSON.stringify(params, null, 2)); } },
    'Reset settings': () => { Object.assign(params, flowerDefaults, GARDEN_DEFAULTS); save(); gui.controllersRecursive().forEach((c) => c.updateDisplay()); onFlower(); },
  };
  for (const k of Object.keys(actions)) gui.add(actions, k);

  // the Blender flower: its settings become the flower defaults (settings changed on this page and saved stay)
  fetch(BLENDER_LILY_URL).then((r) => r.json()).then((j) => {
    for (const [k, v] of Object.entries(j.settings ?? {})) {
      if (!(k in flowerDefaults) || typeof v !== 'number' || RESOLUTION_KEYS.includes(k)) continue;
      flowerDefaults[k] = v;
      if (!(k in stored)) params[k] = v;
    }
    gui.controllersRecursive().forEach((c) => c.updateDisplay());
    onFlower();
  }).catch((e) => console.warn('Garden: could not load the Blender flower settings, using the web defaults', e));

  // ---------------------------------------------------------------- loop
  let running = false, raf = 0, lastTime = 0;
  function loop(time) {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(Math.max((time - lastTime) / 1000, 0), 0.1); lastTime = time;
    step(dt);
  }
  window.addEventListener('resize', () => { if (running) resize(); });

  // compile every shader once at the start (a flower, a leaf, the roots, the particles), so the first flower
  // doesn't cause a hitch later
  let warmed = false;
  function prewarm() {
    if (warmed) return; warmed = true;
    const fake = { points: [{ x: -5000, y: -5000, t: 0 }, { x: -5000, y: -5006, t: 0 }, { x: -5000, y: -5012, t: 0 }], spot: 0, depth: 0, dissolving: undefined, parent: null };
    const temp = [new Plant('flower', fake, 1, 0, 0.5), new Plant('leaf0', fake, 1, 0, 0.4)];
    for (const p of temp) { p.setPoses(0, 1); p.motionAt(0, 1); }
    camera.layers.enableAll();
    renderer.compile(scene, camera);
    for (const p of temp) { for (const m of p.meshes) m.material = p.velMat; }
    renderer.compile(scene, camera);
    for (const p of temp) p.dispose();
  }

  const api = {
    show() {
      if (running) return;
      page.hidden = false; gui.show();
      running = true; resize(); prewarm();
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame((time) => { lastTime = time; loop(time); });
    },
    hide() {
      page.hidden = true; gui.hide();
      running = false; cancelAnimationFrame(raf);
      if (lightInput.state.useCamera) { lightInput.setCamera(false); inputCtl['Use camera'] = false; gui.controllersRecursive().forEach((c) => c.updateDisplay()); }
    },
  };
  // handy for testing in the browser console / Playwright
  window[opts.name ?? 'gardenApp'] = { params, growth, plants, lightInput, prof, startFake: (list) => growth.startFake(list), tryFlower, tryLeaf, step, get sim() { return { W: SIM_W, H: SIM_H, now: growth.now, lastNow }; } };
  return api;
}
