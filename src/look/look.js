// Page 7 – Lily look. One lily, breathing, with the "frosted glass" look on top.
// The flower is the Blender lily: the web generator with the settings from public/lily/lily-breath.json
// (loaded when the page starts; saved slider changes still win).
//  1. the lily is rendered as usual, with its depth
//  2. blur by depth: the image is blurred in 3 steps (a small "pyramid"); every pixel picks how blurred it is
//     from its distance to the focus plane, so parts close to the "glass" stay sharp and parts further back
//     go soft and pale (this is the depth-layers idea, done per pixel)
//  3. grading on top: background, exposure, contrast, saturation, warmth, fade, split toning, glow
//  4. breathing: the flower opens (breath in) and closes (breath out) by animating Petal Arc Bend from -0.9
//     (closed bud) to 1.66 (fully open), like the shape keys of the Blender export. The flower is generated at
//     33 arc values (each one once, when first needed) and neighbouring ones are blended every frame, which is
//     cheap. It also turns, sways on its stem, and every petal moves a bit on its own (tips lag behind when it
//     turns, and flutter). Everything follows the rhythm of the breath, so every breath is the same smooth loop.
//  see-through petals: a see-through middle and a more solid edge, smoothly blended (real transparency, no dots)
//  petal colours (like the style images: some petals pale, some deep, dark throats, light or dark rims): every
//     petal mixes a light and a dark colour; how much of each depends on the petal (random), a gradient from the
//     base to the tip and its edges (some petals darker, some lighter). Overlapping see-through petals add depth.
//  5. long exposure: every frame the flower is drawn many times (at half size, cheap) along the last moment of its
//     movement. The flower is only generated 3 times per frame (oldest, middle, now); the copies in between are
//     smoothly interpolated in the shader, so many copies cost little. The copies make a soft, see-through trail;
//     the flower of "now" is laid on top (like a flash at the end of a long exposure) so it still reads as a
//     flower. An afterglow (feedback of the previous frames) makes the trails even longer and smoother.
// Everything has a slider in the panel. Drag to turn the flower, scroll to zoom.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import GUI from 'lil-gui';
import { FLOWER_PARAMS, defaults } from '../lily/params.js';
import { Lily } from '../lily/Lily.js';
import { generateLily, hsv } from '../lily/generator.js';
import { uniforms as sharedUniforms, createSolidMaterial } from '../lily/materials.js';
import './look.css';

const STORAGE_KEY = 'flowers-web-look-v1';
const BLENDER_LILY_URL = `${import.meta.env.BASE_URL}lily/lily-breath.json`;   // the flower settings from Blender
const ARC_CLOSED = -0.9, ARC_OPEN = 1.66;     // Petal Arc Bend of the closed bud ... the fully open flower
const ARC_STEPS = 33;                          // flowers generated along that range (blended in between)

// flower settings shown on this page (the rest keep their default)
const FLOWER_KEYS = {
  'Ring Count': 'Rings',
  'Petals Per Ring': 'Petals per ring',
  'Petal Length': 'Petal length',
  'Petal Width': 'Petal width',
  'Petal Tip Shape': 'Petal tip',
  'Inner Ring Scale': 'Ring size (inner rings)',
  'Inner Ring Opening': 'Ring opening (inner rings)',
  'Inner Ring Height': 'Space between rings',
  'Petal Ring Rotation Offset': 'Ring rotation',
  'Flower Blooming': 'Blooming',
  'Petal Arc Bend': 'Petal bend',
  'Petal Tip Bend': 'Tip bend',
  'Petal Edge Ruffle': 'Edge ruffle',
  'Head Tilt': 'Head tilt',
  'Stamen Count': 'Stamens',
};

const LOOK_DEFAULTS = {
  // flower extras
  'Show Stem + Leaves': true,
  'Petal Opacity': 1.0,
  'Petal Edges': 0.8,         // deeper colour on the petal edges + faint veins
  // petal colours: every petal mixes these two (light <-> dark)
  'Petal Light Colour': '#f7d3dd',
  'Petal Dark Colour': '#8c2a4f',
  'Petal Tone': 0.45,         // 0 = all light ... 1 = all dark (the middle of the mix)
  'Petal Variation': 0.85,    // between petals: 0 = all the same ... 1 = very mixed
  'Petal Gradient': 0.9,      // within a petal: darker at the base, lighter at the tip
  'Petal Edge Variation': 0.6, // some petals with darker edges, some with lighter edges
  'Stem Colour': '#619950',
  'Leaf Colour': '#558e45',
  'Petal Centre Opacity': 0.5, // see-through middle of the petals ...
  'Petal Edge Opacity': 0.95,  // ... more solid towards the edges
  'Petal Opacity Blend': 0.6,  // how wide / soft the change from middle to edge is
  // blur
  'Blur Amount': 0.75,
  'Base Blur': 0.08,
  'Focus Distance': -0.2,
  'Depth Range': 1.6,
  'Only Behind Focus': false,
  'Frost (paleness)': 0.45,
  // look
  'Background Top': '#f3eee6',
  'Background Bottom': '#e8e0d4',
  'Exposure': 1.0,
  'Contrast': 1.0,
  'Saturation': 0.8,
  'Warmth': 0.15,
  'Fade': 0.04,
  'Shadow Tint': '#3b4a63',
  'Shadow Tint Amount': 0.25,
  'Highlight Tint': '#f6d9c6',
  'Highlight Tint Amount': 0.2,
  'Glow': 0.2,
  // breathing
  'Breathing': true,
  'Breath In (s)': 3,
  'Breath Out (s)': 3,
  'Open Most': 1.0,           // how open it gets on the breath in (1 = fully open, arc bend 1.66)
  'Closed Most': 0.0,         // how closed it gets on the breath out (0 = closed bud, arc bend -0.9)
  'Breath Turn': 75,          // degrees the flower turns with every breath (makes the trails sweep)
  'Sway': 12,                 // degrees the stem bends sideways with the breath
  'Petal Lag': 2.0,           // petal tips lag behind when the flower turns (swirl)
  'Petal Flutter': 0.12,      // every petal lifts and falls on its own rhythm
  // long exposure
  'Trail Length (s)': 1.5,
  'Trail Copies': 24,
  'Trail Fade': 0.35,
  'Now Strength': 0.35,       // how solid the flower of "now" is on top of its trail
  'Trail Softness': 0.15,     // how blurred the trail is (outside the flower of now)
  'Afterglow': 0.88,          // feedback of earlier frames: longer, smoother trails
  'Streaks': 2.0,             // smear the trail along the motion (flowing streaks)
  'Motion v2': true,          // marks settings saved with this version of the motion (older ones are reset)
  'Blender Lily': true,       // marks settings saved with the Blender flower (older flower settings are reset)
};
// motion settings that changed meaning with the long exposure (reset if saved by an older version)
const MOTION_KEYS = ['Breathing Amount', 'Breath Turn', 'Trail Length (s)', 'Trail Copies', 'Trail Fade'];

const QUAD_VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// adds one copy of the flower into the long exposure
const ADD_FRAG = /* glsl */ `uniform sampler2D tInput; uniform float uWeight; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tInput, vUv) * uWeight; }`;

// afterglow: this frame's trail mixed with what was there before (all premultiplied colour + alpha)
const GLOW_FRAG = /* glsl */ `uniform sampler2D tInput, tPrev; uniform float uKeep; varying vec2 vUv;
  void main(){ vec4 c = texture2D(tInput, vUv), p = texture2D(tPrev, vUv); gl_FragColor = c + (p - c) * uKeep * (1.0 - c.a * 0.5); }`;

// the flower of now on top of its trail
const COMBINE_FRAG = /* glsl */ `uniform sampler2D tTrail, tNow; uniform float uNow; varying vec2 vUv;
  void main(){ vec4 n = texture2D(tNow, vUv) * uNow; gl_FragColor = n + texture2D(tTrail, vUv) * (1.0 - n.a); }`;

// the movement of one vertex at one moment (page 7 only): smooth motion between the 3 generated poses,
// petal flutter + lag (swirl), and the stem bending from its foot. Used by the petal material and the motion vectors.
const MOTION_GLSL = /* glsl */ `
  attribute vec3 aPosA; attribute vec3 aPosB;          // the flower a trail length ago, and half of it ago
  uniform float uMFlutter, uMFoot; uniform vec3 uMAxis;   // uMAxis: the direction the flower head looks (from its centre)
  vec3 lkRot(vec3 v, vec3 k, float a) { return v * cos(a) + cross(k, v) * sin(a) + k * dot(k, v) * (1.0 - cos(a)); }
  // ph: where in the breath we are (0..2pi)
  vec3 lookMove(vec3 p0, vec3 n, float part, float pu, float seed, float s, float ph, float twist, vec2 sway, out vec3 nOut) {
    // s: 0 = oldest pose, 1 = now: curve through the 3 poses
    vec3 p = aPosA * (2.0 * (s - 0.5) * (s - 1.0)) + aPosB * (-4.0 * s * (s - 1.0)) + p0 * (2.0 * s * (s - 0.5));
    if (part < 0.5) {
      float tip = pu * pu;
      // every petal lifts and falls on its own (but always to the rhythm of the breath, so every breath is the same)
      p += n * tip * uMFlutter * (sin(ph + seed * 5.31) + 0.5 * sin(2.0 * ph + seed * 11.7));
      // tips lag behind when the flower turns: the petals swirl around the head
      float a = twist * pow(pu, 1.5);
      p = lkRot(p, uMAxis, a); n = lkRot(n, uMAxis, a);
    }
    // the stem bends from its foot: the higher, the more it leans
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

// motion vectors: where every pixel of the flower of now moves on the screen (now vs a moment ago)
const VEL_VERT = /* glsl */ `
  attribute float aPart; attribute float aU; attribute float aSeed;
  ${MOTION_GLSL}
  uniform float uMPh, uMTwist, uMS2, uMPh2, uMTwist2; uniform vec2 uMSway, uMSway2; uniform mat4 uPrevModel;
  varying vec3 vVel;
  void main(){
    vec3 n1, n2;
    vec4 c1 = projectionMatrix * viewMatrix * modelMatrix * vec4(lookMove(position, normal, aPart, aU, aSeed, 1.0, uMPh, uMTwist, uMSway, n1), 1.0);
    vec4 c2 = projectionMatrix * viewMatrix * uPrevModel * vec4(lookMove(position, normal, aPart, aU, aSeed, uMS2, uMPh2, uMTwist2, uMSway2, n2), 1.0);
    vVel = vec3(c1.xy / c1.w - c2.xy / c2.w, 0.0) * 0.5;      // in uv units
    gl_Position = c1;
  }`;
const VEL_FRAG = /* glsl */ `varying vec3 vVel; void main(){ gl_FragColor = vec4(vVel.xy, 1.0, 1.0); }`;

// streaks: smear the trail along the motion of the nearby flower (like a long exposure)
const STREAK_FRAG = /* glsl */ `
  uniform sampler2D tInput, tVel; uniform float uLen; varying vec2 vUv;
  void main(){
    vec3 v = texture2D(tVel, vUv).rgb;                    // (motion * coverage, coverage), spread around the flower
    vec2 d = v.b > 1e-3 ? v.rg / v.b * uLen * smoothstep(0.0, 0.15, v.b) : vec2(0.0);
    vec4 s = vec4(0.0); float wsum = 0.0;
    for (int i = 0; i < 16; i++) {
      float f = float(i) / 15.0;
      float w = 1.0 - 0.6 * f;                            // the newer end a bit stronger
      s += texture2D(tInput, vUv + d * (f - 0.25)) * w; wsum += w;
    }
    gl_FragColor = s / wsum;
  }`;

// 1. circle of confusion: how blurred each pixel should be (0..1), from its depth
const COC_FRAG = /* glsl */ `
  #include <packing>
  uniform sampler2D tColor, tDepth, tNow; uniform float uNear, uFar, uFocus, uRange, uBase, uBehind, uTrailSoft;
  varying vec2 vUv;
  void main(){
    float a = texture2D(tColor, vUv).a;
    float d = -perspectiveDepthToViewZ(texture2D(tDepth, vUv).x, uNear, uFar);
    float off = d - uFocus;
    if (uBehind > 0.5) off = max(off, 0.0);
    float coc = clamp(uBase + abs(off) / uRange, 0.0, 1.0);
    coc = mix(uTrailSoft, coc, texture2D(tNow, vUv).a);  // where only the trail is: its own softness
    gl_FragColor = vec4(coc * a, a, 0.0, 1.0);        // weighted by alpha, so the background can borrow it
  }`;

// separable gaussian blur (9 taps)
const BLUR_FRAG = /* glsl */ `
  uniform sampler2D tInput; uniform vec2 uDir;
  varying vec2 vUv;
  void main(){
    vec4 s = texture2D(tInput, vUv) * 0.2270270270;
    s += (texture2D(tInput, vUv + uDir * 1.3846153846) + texture2D(tInput, vUv - uDir * 1.3846153846)) * 0.3162162162;
    s += (texture2D(tInput, vUv + uDir * 3.2307692308) + texture2D(tInput, vUv - uDir * 3.2307692308)) * 0.0702702703;
    gl_FragColor = s;
  }`;

// final: pick the blur level per pixel, put it on the background, then grade
const FINAL_FRAG = /* glsl */ `
  uniform sampler2D tColor, tB1, tB2, tB3, tCoc, tCocBlur;
  uniform vec2 uRes; uniform float uAmount, uFrost, uExposure, uContrast, uSat, uWarmth, uFade;
  uniform vec3 uBgTop, uBgBottom, uShadow, uHigh; uniform float uShadowAmt, uHighAmt, uGlow;
  varying vec2 vUv;
  vec4 level(float l){                                     // 0 = sharp ... 3 = most blurred
    vec4 c0 = texture2D(tColor, vUv), c1 = texture2D(tB1, vUv), c2 = texture2D(tB2, vUv), c3 = texture2D(tB3, vUv);
    if (l < 1.0) return mix(c0, c1, l);
    if (l < 2.0) return mix(c1, c2, l - 1.0);
    return mix(c2, c3, clamp(l - 2.0, 0.0, 1.0));
  }
  void main(){
    vec2 own = texture2D(tCoc, vUv).rg;                    // (coc * alpha, alpha) of this pixel
    vec2 near = texture2D(tCocBlur, vUv).rg;               // the same, averaged around it
    // on the flower: its own blur. Around it: the blur of the nearby flower parts (sharp parts get no halo)
    float coc = own.g > 0.5 ? own.r / max(own.g, 1e-4) : near.r / max(near.g, 1e-4);
    vec4 c = level(coc * 3.0 * uAmount);                   // premultiplied colour + alpha
    vec3 bg = mix(uBgBottom, uBgTop, vUv.y);
    // frosted glass: the further back, the paler (closer to the background colour)
    c.rgb = mix(c.rgb, bg * c.a, clamp(coc * uFrost, 0.0, 1.0));
    vec3 col = bg * (1.0 - c.a) + c.rgb;
    // soft glow (halation) from the most blurred level
    col += texture2D(tB3, vUv).rgb * uGlow * 0.6;
    // grading
    col *= uExposure;
    col = (col - 0.5) * uContrast + 0.5;
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lum), col, uSat);
    col += vec3(0.06, 0.02, -0.06) * uWarmth;
    col = mix(col, uShadow, uShadowAmt * (1.0 - smoothstep(0.0, 0.6, lum)));
    col = mix(col, uHigh, uHighAmt * smoothstep(0.45, 1.0, lum));
    col = mix(vec3(uFade), vec3(1.0), col);                // lifted blacks, like old prints
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
  }`;

export function createLookPage() {
  // flower defaults: the web generator's, replaced by the Blender flower as soon as its settings are loaded
  const flowerDefaults = { ...defaults(FLOWER_PARAMS), 'Spot Amount': 0 };
  const params = { ...flowerDefaults, ...LOOK_DEFAULTS };
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (!stored['Motion v2']) for (const k of MOTION_KEYS) delete stored[k];   // saved before the long exposure
    if (!stored['Blender Lily']) {                                              // saved before the Blender flower
      for (const k of [...Object.keys(flowerDefaults), 'Open Most', 'Closed Most']) delete stored[k];
    }
    Object.assign(params, stored, { 'Motion v2': true, 'Blender Lily': true });
  } catch { /* no storage */ }
  const save = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(params)); } catch { /* ignore */ } };

  const page = document.createElement('div');
  page.id = 'look-page';
  page.hidden = true;
  page.innerHTML = `<canvas class="look__canvas"></canvas><p class="look__hint">Drag to turn the flower · scroll to zoom</p>`;
  document.body.appendChild(page);
  const canvas = page.querySelector('.look__canvas');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;                     // we clear ourselves (needed to add up the trail copies)

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;
  scene.add(new THREE.HemisphereLight(0xfff4ea, 0x8a7d70, 0.9));
  const key = new THREE.DirectionalLight(0xfff2ea, 1.6); key.position.set(-3, 4, 5); scene.add(key);
  const back = new THREE.DirectionalLight(0xfff6ee, 1.4); back.position.set(1, 2, -5); scene.add(back);   // light from behind the glass

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  const controls = new OrbitControls(camera, canvas);
  function resetView() { camera.position.set(0, 0.3, 6.4); controls.target.set(0, -0.5, 0); controls.update(); }
  resetView();
  controls.addEventListener('change', () => { dirty = true; });

  // the lily, with its own copy of the shader values (so it never affects the other pages)
  const u = {};
  for (const [k, v] of Object.entries(sharedUniforms)) u[k] = { value: v.value?.clone ? v.value.clone() : v.value };
  Object.assign(u, { uProgress: { value: 1 }, uSolidDelay: { value: 0 }, uFade: { value: 0.01 }, uSparkleAmount: { value: 0 }, uPetalGlow: { value: 0.04 } });
  // motion values, changed for every copy of the long exposure
  Object.assign(u, { uMS: { value: 1 }, uMPh: { value: 0 }, uMTwist: { value: 0 }, uMFlutter: { value: 0 }, uMFoot: { value: -2.5 },
    uMSway: { value: new THREE.Vector2() }, uMAxis: { value: new THREE.Vector3(0, 1, 0) }, uEdges: { value: 0 },
    uOpCentre: { value: 0.5 }, uOpEdge: { value: 1 }, uOpBlend: { value: 0.5 },
    uPetalLight: { value: new THREE.Color() }, uPetalDark: { value: new THREE.Color() }, uTone: { value: 0.5 },
    uVarPetal: { value: 0 }, uVarGrad: { value: 0 }, uVarEdge: { value: 0 },
    uStemCol: { value: new THREE.Color() }, uLeafCol: { value: new THREE.Color() } });
  const lilyParams = { ...params };
  const lily = new Lily(lilyParams, u);
  scene.add(lily);
  // add the motion to this page's materials (the shared material code stays untouched). The lily's own material
  // draws everything except the petals (solid); a second material draws only the petals, really see-through.
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
          uniform float uEdges, uOpCentre, uOpEdge, uOpBlend, uTone, uVarPetal, uVarGrad, uVarEdge;
          uniform vec3 uPetalLight, uPetalDark, uStemCol, uLeafCol;`)
        .replace('#include <alphamap_fragment>', `#include <alphamap_fragment>
          ${petals ? 'if (vPart > 0.5) discard;' : 'if (vPart < 0.5) discard;'}
          if (vPart > 0.5 && vPart < 1.5) diffuseColor.rgb = uStemCol;          // stem (and the green base of the head)
          if (vPart > 1.5 && vPart < 2.5) diffuseColor.rgb = uLeafCol;          // leaves
          if (vPart < 0.5) {
            // petal colour: a mix of the light and dark colour (0 = light, 1 = dark), decided by
            float r1 = fract(sin(vSeed * 12.9898 + 4.1) * 43758.5453);         // two random numbers per petal
            float r2 = fract(sin(vSeed * 78.233 + 1.7) * 43758.5453);
            float m = uTone + (r1 - 0.5) * 1.3 * uVarPetal;                      // the petal (some lighter, some darker)
            m += uVarGrad * (0.5 - vU) * (0.8 + 0.5 * r2);                       // gradient: dark base, light tip
            float rim = smoothstep(0.5, 1.0, max(abs(vV), smoothstep(0.7, 1.0, vU)));
            m += uVarEdge * rim * (r2 > 0.5 ? 0.8 : -0.8);                       // edges: darker on some, lighter on others
            // mixed as the eye sees it (not in linear light, where the middle looks almost as light as the light colour)
            vec3 pc = mix(sqrt(uPetalLight), sqrt(uPetalDark), clamp(m, 0.0, 1.0)); pc *= pc;
            // keep the shading of the shared petal material (green throat, midrib), but in these colours
            diffuseColor.rgb = diffuseColor.rgb / max(uTint, vec3(1e-3)) * pc;
            // 0 on the middle of the petal, 1 on its edges and tip
            float e = 1.0 - (1.0 - abs(vV)) * (1.0 - pow(vU, 6.0));
            // see-through middle, more solid edge: one smooth change (no line)
            diffuseColor.a *= mix(uOpCentre, uOpEdge, smoothstep(1.0 - uOpBlend, 1.0, e));
            // deeper colour on the edges + tip and faint veins (like the style images); moving edges draw the streaks
            float edge = smoothstep(0.62, 1.0, abs(vV)) + smoothstep(0.82, 1.0, vU);
            float vein = pow(abs(sin(vV * 7.0 * 3.14159)), 24.0) * smoothstep(0.05, 0.3, vU) * 0.5;
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * diffuseColor.rgb * 0.55, clamp((edge + vein) * uEdges, 0.0, 1.0));
          }`);
    };
    mat.customProgramCacheKey = () => (petals ? 'look-petals' : 'look-solid');
  }
  addLook(lily.solidMat, false);
  const petalMat = createSolidMaterial(u);
  petalMat.alphaHash = false; petalMat.transparent = true; petalMat.depthWrite = false;   // smooth see-through
  addLook(petalMat, true);
  const petalMesh = new THREE.Mesh(lily.geometry, petalMat);
  petalMesh.frustumCulled = false;
  lily.add(petalMesh);
  // motion vectors of the flower of now (shares the motion values with the petal material)
  const velMat = new THREE.ShaderMaterial({ vertexShader: VEL_VERT, fragmentShader: VEL_FRAG, side: THREE.DoubleSide, uniforms: {
    uMFlutter: u.uMFlutter, uMFoot: u.uMFoot, uMAxis: u.uMAxis, uMPh: u.uMPh, uMTwist: u.uMTwist, uMSway: u.uMSway,
    uMS2: { value: 1 }, uMPh2: { value: 0 }, uMTwist2: { value: 0 }, uMSway2: { value: new THREE.Vector2() }, uPrevModel: { value: new THREE.Matrix4() } } });

  // the flower at any opening: generated at ARC_STEPS values of Petal Arc Bend (each one once, when first
  // needed, until a flower slider changes) and blended between the two nearest, like shape keys
  let arcCache = new Map();
  function arcTarget(i) {
    let a = arcCache.get(i);
    if (!a) {
      const arc = ARC_CLOSED + (ARC_OPEN - ARC_CLOSED) * (i / (ARC_STEPS - 1));
      a = generateLily({ ...lilyParams, 'Petal Arc Bend': arc }, lilyParams['Flower Blooming']).position;
      arcCache.set(i, a);
    }
    return a;
  }
  function poseInto(out, o) {                          // o: 0 = closed bud ... 1 = fully open
    const x = Math.min(1, Math.max(0, o)) * (ARC_STEPS - 1), i = Math.min(Math.floor(x), ARC_STEPS - 2), f = x - i;
    const a = arcTarget(i), b = arcTarget(i + 1);
    if (a.length !== out.length || b.length !== out.length) return;
    for (let k = 0; k < out.length; k++) out[k] = a[k] + (b[k] - a[k]) * f;
  }
  // the 3 poses of the flower (oldest, middle, now) for the long exposure; now = the normal positions
  let poseGeo = null;
  function poseAttrs() {
    const g = lily.geometry, n = g.attributes.position.array.length;
    if (poseGeo !== g || g.attributes.aPosA?.array.length !== n) {
      poseGeo = g; petalMesh.geometry = g;
      g.setAttribute('aPosA', new THREE.BufferAttribute(new Float32Array(n), 3));
      g.setAttribute('aPosB', new THREE.BufferAttribute(new Float32Array(n), 3));
    }
    return g;
  }
  function setPoses(oA, oB, oNow) {
    const g = poseAttrs();
    poseInto(g.attributes.position.array, oNow); g.attributes.position.needsUpdate = true;
    g.computeVertexNormals();
    poseInto(g.attributes.aPosA.array, oA); g.attributes.aPosA.needsUpdate = true;
    poseInto(g.attributes.aPosB.array, oB); g.attributes.aPosB.needsUpdate = true;
  }
  function rebuildLily() {
    Object.assign(lilyParams, params);
    if (!params['Show Stem + Leaves']) { lilyParams['Stem Length'] = 0; lilyParams['Leaf Count'] = 0; }
    lily.rebuild();                                          // still flower: exactly as the sliders say
    arcCache = new Map();
    const g = poseAttrs();
    for (const k of ['aPosA', 'aPosB']) { g.attributes[k].array.set(g.attributes.position.array); g.attributes[k].needsUpdate = true; }
    lily.geometry.computeBoundingBox(); u.uMFoot.value = Math.min(-0.5, lily.geometry.boundingBox.min.y);
    lily.points.visible = lily.wire.visible = false;
    if (lily.sparkles) lily.sparkles.visible = false;
    lily.solidMat.transparent = false;
    lily.solidMat.opacity = 1;                               // stem, leaves, stamens: solid
    petalMat.opacity = params['Petal Opacity'];              // petals: overall opacity (times the middle / edge opacity)
    u.uMAxis.value.set(0, Math.cos(lilyParams['Head Tilt']), Math.sin(lilyParams['Head Tilt']));   // where the head looks
    dirty = true;
  }

  // render targets
  const rt = (w, h, depth = false) => {
    const t = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: depth });
    if (depth) { t.depthTexture = new THREE.DepthTexture(w, h); t.depthTexture.type = THREE.UnsignedIntType; }
    return t;
  };
  let velRT, velB, velTmp, streakRT, sceneRT, subRT, trailRT, glowA, glowB, colorRT, cocRT, b1, b2, b3, tmp1, tmp2, tmp3, cocB, cocTmp;
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  const quadScene = new THREE.Scene(); quadScene.add(quad);
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const cocMat = new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: COC_FRAG,
    uniforms: { tColor: { value: null }, tDepth: { value: null }, tNow: { value: null }, uNear: { value: 0.1 }, uFar: { value: 50 }, uFocus: { value: 6 }, uRange: { value: 1.5 }, uBase: { value: 0 }, uBehind: { value: 0 }, uTrailSoft: { value: 0 } } });
  const glowMat = new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: GLOW_FRAG, uniforms: { tInput: { value: null }, tPrev: { value: null }, uKeep: { value: 0 } } });
  const streakMat = new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: STREAK_FRAG, uniforms: { tInput: { value: null }, tVel: { value: null }, uLen: { value: 1 } } });
  const combineMat = new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: COMBINE_FRAG, uniforms: { tTrail: { value: null }, tNow: { value: null }, uNow: { value: 1 } } });
  const addMat = new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: ADD_FRAG, uniforms: { tInput: { value: null }, uWeight: { value: 1 } },
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor, depthTest: false, depthWrite: false, transparent: true });
  const blurMat = new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: BLUR_FRAG, uniforms: { tInput: { value: null }, uDir: { value: new THREE.Vector2() } } });
  const finalMat = new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: FINAL_FRAG, uniforms: {
    tColor: { value: null }, tB1: { value: null }, tB2: { value: null }, tB3: { value: null }, tCoc: { value: null }, tCocBlur: { value: null },
    uRes: { value: new THREE.Vector2() }, uAmount: { value: 1 }, uFrost: { value: 0 }, uExposure: { value: 1 }, uContrast: { value: 1 }, uSat: { value: 1 },
    uWarmth: { value: 0 }, uFade: { value: 0 }, uBgTop: { value: new THREE.Color() }, uBgBottom: { value: new THREE.Color() },
    uShadow: { value: new THREE.Color() }, uHigh: { value: new THREE.Color() }, uShadowAmt: { value: 0 }, uHighAmt: { value: 0 },
    uGlow: { value: 0 } } });

  function pass(mat, target) { quad.material = mat; renderer.setRenderTarget(target); renderer.render(quadScene, quadCam); }
  function blur(src, mid, dst, radius) {
    blurMat.uniforms.tInput.value = src.texture; blurMat.uniforms.uDir.value.set(radius / mid.width, 0); pass(blurMat, mid);
    blurMat.uniforms.tInput.value = mid.texture; blurMat.uniforms.uDir.value.set(0, radius / dst.height); pass(blurMat, dst);
  }

  let W = 1, H = 1, dirty = true, glowFresh = true, lastT = 0;
  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    renderer.setSize(W, H, false);
    camera.aspect = W / H; camera.updateProjectionMatrix();
    const pr = renderer.getPixelRatio(), w = Math.round(W * pr), h = Math.round(H * pr);
    for (const t of [velRT, velB, velTmp, streakRT, sceneRT, subRT, trailRT, glowA, glowB, colorRT, cocRT, b1, b2, b3, tmp1, tmp2, tmp3, cocB, cocTmp]) t?.dispose();
    sceneRT = rt(w, h, true); colorRT = rt(w, h); cocRT = rt(w, h);
    subRT = rt(w >> 1, h >> 1, true); trailRT = rt(w >> 1, h >> 1);           // the trail copies: half size is plenty
    glowA = rt(w >> 1, h >> 1); glowB = rt(w >> 1, h >> 1); glowFresh = true;
    velRT = rt(w >> 1, h >> 1, true); streakRT = rt(w >> 1, h >> 1);
    velB = rt(w >> 3, h >> 3); velTmp = rt(w >> 3, h >> 3);
    b1 = rt(w >> 1, h >> 1); tmp1 = rt(w >> 1, h >> 1);
    b2 = rt(w >> 2, h >> 2); tmp2 = rt(w >> 2, h >> 2);
    b3 = rt(w >> 3, h >> 3); tmp3 = rt(w >> 3, h >> 3);
    cocB = rt(w >> 3, h >> 3); cocTmp = rt(w >> 3, h >> 3);
    finalMat.uniforms.uRes.value.set(w, h);
    dirty = true;
  }

  // the flower of now, full size, with depth. The see-through petals don't write depth while they are drawn
  // (so petals behind them still show), so their depth is added afterwards for the depth blur
  function renderNow() {
    renderer.setRenderTarget(sceneRT); renderer.clear(); renderer.render(scene, camera);
    lily.mesh.visible = false; petalMat.colorWrite = false; petalMat.depthWrite = true;
    renderer.render(scene, camera);
    lily.mesh.visible = true; petalMat.colorWrite = true; petalMat.depthWrite = false;
  }

  function setColours() {
    u.uPetalLight.value.set(params['Petal Light Colour']); u.uPetalDark.value.set(params['Petal Dark Colour']);
    u.uTone.value = params['Petal Tone']; u.uVarPetal.value = params['Petal Variation'];
    u.uVarGrad.value = params['Petal Gradient']; u.uVarEdge.value = params['Petal Edge Variation'];
    u.uStemCol.value.set(params['Stem Colour']); u.uLeafCol.value.set(params['Leaf Colour']);
  }

  function render(t = performance.now() / 1000) {
    setColours();
    // 1. the flower (transparent background) + depth. While it breathes: a long exposure of many copies
    let colorTex = sceneRT.texture;
    const moving = params['Breathing'];
    const L = params['Trail Length (s)'], n = Math.round(params['Trail Copies']);
    const dt = Math.min(Math.max(t - lastT, 0), 0.1); lastT = t;
    if (moving && L > 0 && n > 1) {
      setPoses(opennessAt(t - L), opennessAt(t - L / 2), opennessAt(t));
      const k = params['Trail Fade'] * 3;
      let sum = 0; const w = [];
      for (let i = 0; i < n; i++) { w.push(Math.pow((i + 1) / n, k)); sum += w[i]; }
      renderer.setRenderTarget(trailRT); renderer.clear();
      for (let i = 0; i < n; i++) {                      // oldest first
        const s = i / (n - 1);
        motionAt(t - L * (1 - s), s);
        renderer.setRenderTarget(subRT); renderer.clear(); renderer.render(scene, camera);
        addMat.uniforms.tInput.value = subRT.texture; addMat.uniforms.uWeight.value = w[i] / sum;
        pass(addMat, trailRT);
      }
      let trailTex = trailRT.texture;
      // streaks: motion vectors of the flower (now vs a moment ago), spread around it, then the trail is smeared along them
      if (params['Streaks'] > 0) {
        const dt2 = Math.min(L * 0.5, 0.6), m2 = motionVals(t - dt2);
        const vu = velMat.uniforms;
        vu.uMS2.value = 1 - dt2 / L; vu.uMPh2.value = m2.ph; vu.uMTwist2.value = m2.twist; vu.uMSway2.value.copy(m2.sway);
        vu.uPrevModel.value.makeRotationY(m2.turn);
        motionAt(t, 1);
        scene.overrideMaterial = velMat;
        renderer.setRenderTarget(velRT); renderer.clear(); renderer.render(scene, camera);
        scene.overrideMaterial = null;
        blur(velRT, velTmp, velB, 3.0); blur(velB, velTmp, velB, 3.0);
        streakMat.uniforms.tInput.value = trailTex; streakMat.uniforms.tVel.value = velB.texture;
        streakMat.uniforms.uLen.value = params['Streaks'];
        pass(streakMat, streakRT);
        trailTex = streakRT.texture;
      }
      // afterglow: keep some of the earlier frames (the same amount per second, whatever the frame rate)
      if (params['Afterglow'] > 0) {
        glowMat.uniforms.tInput.value = trailTex; glowMat.uniforms.tPrev.value = glowA.texture;
        glowMat.uniforms.uKeep.value = glowFresh ? 0 : Math.pow(params['Afterglow'], Math.max(dt, 1 / 60) * 60);
        pass(glowMat, glowB); [glowA, glowB] = [glowB, glowA]; glowFresh = false;
        trailTex = glowA.texture;
      } else glowFresh = true;
      // the flower of now, full size, on top
      motionAt(t, 1);
      renderNow();
      combineMat.uniforms.tTrail.value = trailTex; combineMat.uniforms.tNow.value = sceneRT.texture;
      combineMat.uniforms.uNow.value = params['Now Strength'];
      pass(combineMat, colorRT);
      colorTex = colorRT.texture;
    } else {
      if (moving) setPoses(opennessAt(t), opennessAt(t), opennessAt(t));
      motionAt(moving ? t : t0, 1);
      renderNow();
      glowFresh = true;
    }
    // 2. how blurred each pixel should be
    const camDist = camera.position.distanceTo(controls.target);
    cocMat.uniforms.tColor.value = colorTex; cocMat.uniforms.tDepth.value = sceneRT.depthTexture; cocMat.uniforms.tNow.value = sceneRT.texture;
    cocMat.uniforms.uTrailSoft.value = params['Trail Softness'];
    cocMat.uniforms.uNear.value = camera.near; cocMat.uniforms.uFar.value = camera.far;
    cocMat.uniforms.uFocus.value = camDist + params['Focus Distance'];
    cocMat.uniforms.uRange.value = params['Depth Range'];
    cocMat.uniforms.uBase.value = params['Base Blur'];
    cocMat.uniforms.uBehind.value = params['Only Behind Focus'] ? 1 : 0;
    pass(cocMat, cocRT);
    blur(cocRT, cocTmp, cocB, 2.0);
    // 3. blur pyramid
    blur({ texture: colorTex }, tmp1, b1, 1.6);
    blur(b1, tmp2, b2, 1.8);
    blur(b2, tmp3, b3, 2.2);
    // 4. final image
    const f = finalMat.uniforms;
    f.tColor.value = colorTex; f.tB1.value = b1.texture; f.tB2.value = b2.texture; f.tB3.value = b3.texture;
    f.tCoc.value = cocRT.texture; f.tCocBlur.value = cocB.texture;
    f.uAmount.value = params['Blur Amount']; f.uFrost.value = params['Frost (paleness)'];
    f.uExposure.value = params['Exposure']; f.uContrast.value = params['Contrast']; f.uSat.value = params['Saturation'];
    f.uWarmth.value = params['Warmth']; f.uFade.value = params['Fade'];
    f.uBgTop.value.set(params['Background Top']); f.uBgBottom.value.set(params['Background Bottom']);
    f.uShadow.value.set(params['Shadow Tint']); f.uHigh.value.set(params['Highlight Tint']);
    f.uShadowAmt.value = params['Shadow Tint Amount']; f.uHighAmt.value = params['Highlight Tint Amount'];
    f.uGlow.value = params['Glow'];
    pass(finalMat, null);
  }

  // ---------------------------------------------------------------- panel
  const gui = new GUI({ title: '7 · Lily look' });
  gui.domElement.classList.add('look__gui');
  gui.hide();
  const onFlower = () => { save(); rebuildLily(); };
  const onLook = () => { save(); dirty = true; };
  const ff = gui.addFolder('Flower');
  for (const [k, label] of Object.entries(FLOWER_KEYS)) {
    let range = null;
    for (const g of Object.values(FLOWER_PARAMS)) if (g[k]) range = g[k];
    if (!range) continue;
    const [, min, max, step] = range;
    ff.add(params, k, min, max, step).name(label).onChange(onFlower);
  }
  // the colour sliders set both petal colours at once (a lighter and a darker version of that colour)
  const linHex = (rgb) => `#${new THREE.Color().setRGB(...rgb, THREE.LinearSRGBColorSpace).getHexString()}`;
  const onBlossom = () => {
    const h = params['Blossom Hue'], sat = params['Blossom Saturation'], v = params['Blossom Value'];
    params['Petal Light Colour'] = linHex(hsv(h, sat * 0.4, Math.min(1, v * 1.3)));
    params['Petal Dark Colour'] = linHex(hsv(h + 0.01, Math.min(1, sat * 1.2), v * 0.4));
    gui.controllersRecursive().forEach((c) => c.updateDisplay());
    save(); Object.assign(lilyParams, params); lily.updateColour(); dirty = true;
  };
  ff.add(params, 'Blossom Hue', 0, 1, 0.005).name('Colour (hue)').onChange(onBlossom);
  ff.add(params, 'Blossom Saturation', 0, 1, 0.01).name('Colour (saturation)').onChange(onBlossom);
  ff.add(params, 'Blossom Value', 0, 1, 0.01).name('Colour (brightness)').onChange(onBlossom);
  ff.add(params, 'Petal Opacity', 0.2, 1, 0.01).name('Petal opacity').onChange(onFlower);
  ff.add(params, 'Petal Edges', 0, 1, 0.01).name('Petal edges + veins').onChange(onLook);
  ff.add(params, 'Petal Centre Opacity', 0, 1, 0.01).name('Petal middle opacity').onChange(onLook);
  ff.add(params, 'Petal Edge Opacity', 0, 1, 0.01).name('Petal edge opacity').onChange(onLook);
  ff.add(params, 'Petal Opacity Blend', 0.05, 1, 0.01).name('Middle → edge softness').onChange(onLook);
  ff.add(params, 'Show Stem + Leaves').name('Stem + leaves').onChange(onFlower);

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
  fbr.add(params, 'Breathing').name('Breathe (open + close)').onChange((v) => { save(); if (!v) rebuildLily(); dirty = true; });
  fbr.add(params, 'Breath In (s)', 1, 10, 0.1).name('Breath in (opens), s').onChange(onLook);
  fbr.add(params, 'Breath Out (s)', 1, 10, 0.1).name('Breath out (closes), s').onChange(onLook);
  fbr.add(params, 'Open Most', 0, 1, 0.01).name('Most open (1 = fully)').onChange(onLook);
  fbr.add(params, 'Closed Most', 0, 1, 0.01).name('Most closed (0 = bud)').onChange(onLook);
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

  const actions = {
    'Reset view': () => { resetView(); dirty = true; },
    'Save image (PNG)': () => {
      render();
      const a = document.createElement('a');
      a.download = `lily-look-${Date.now()}.png`; a.href = canvas.toDataURL('image/png'); a.click();
    },
    'Copy settings (JSON)': async () => { try { await navigator.clipboard.writeText(JSON.stringify(params, null, 2)); } catch { console.log(JSON.stringify(params, null, 2)); } },
    'Reset settings': () => {
      Object.assign(params, flowerDefaults, LOOK_DEFAULTS);
      save(); gui.controllersRecursive().forEach((c) => c.updateDisplay()); rebuildLily();
    },
  };
  for (const k of Object.keys(actions)) gui.add(actions, k);

  // the Blender flower: its settings become the flower defaults (settings changed on this page and saved stay)
  fetch(BLENDER_LILY_URL).then((r) => r.json()).then((j) => {
    for (const [k, v] of Object.entries(j.settings ?? {})) {
      if (!(k in flowerDefaults) || typeof v !== 'number') continue;
      flowerDefaults[k] = v;
      if (!(k in stored)) params[k] = v;
    }
    gui.controllersRecursive().forEach((c) => c.updateDisplay());
    rebuildLily();
  }).catch((e) => console.warn('Lily look: could not load the Blender flower settings, using the web defaults', e));

  // ---------------------------------------------------------------- loop (only renders when something changed)
  let running = false, raf = 0;
  // breathing: open on the breath in, close on the breath out (smooth at both ends)
  const t0 = performance.now() / 1000;
  function openAt(t) {                                // 0 = closed, 1 = open
    const tin = params['Breath In (s)'], tout = params['Breath Out (s)'];
    const ph = (((t - t0) % (tin + tout)) + (tin + tout)) % (tin + tout);
    return ph < tin ? 0.5 - 0.5 * Math.cos(Math.PI * ph / tin) : 0.5 + 0.5 * Math.cos(Math.PI * (ph - tin) / tout);
  }
  // how open the flower is at moment t: 0 = closed bud (arc bend -0.9) ... 1 = fully open (arc bend 1.66).
  // No clamping anywhere, so the flower never sits still at the open or closed end
  const opennessAt = (t) => params['Closed Most'] + (params['Open Most'] - params['Closed Most']) * openAt(t);
  const turnAt = (t) => THREE.MathUtils.degToRad(params['Breath Turn']) * (openAt(t) - 0.5);
  const _sway = new THREE.Vector2();
  // the rest of the movement at moment t: turn, petal swirl, sway, flutter. All of it repeats exactly with every
  // breath (same rhythm, whole multiples of it), so the loop has no jumps
  function motionVals(t) {
    const open = openAt(t), cycle = params['Breath In (s)'] + params['Breath Out (s)'];
    const ph = ((((t - t0) / cycle) % 1 + 1) % 1) * Math.PI * 2, sway = THREE.MathUtils.degToRad(params['Sway']);
    return {
      ph,
      turn: turnAt(t),
      twist: -(turnAt(t) - turnAt(t - 0.4)) * params['Petal Lag'],     // tips follow the turn a bit later
      sway: _sway.set(sway * (open - 0.5) * 1.4, sway * 0.6 * Math.sin(ph + 1.3)),
    };
  }
  function motionAt(t, s) {                            // put the flower at moment t (s: 0 oldest pose .. 1 now)
    const m = motionVals(t);
    u.uMS.value = s; u.uMPh.value = m.ph; u.uMTwist.value = m.twist; u.uMSway.value.copy(m.sway);
    u.uOpCentre.value = params['Petal Centre Opacity']; u.uOpEdge.value = params['Petal Edge Opacity']; u.uOpBlend.value = params['Petal Opacity Blend'];
    u.uMFlutter.value = params['Petal Flutter'];
    u.uEdges.value = params['Petal Edges'];
    lily.rotation.y = m.turn;
  }
  function loop() {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    controls.update();
    if (params['Breathing']) dirty = true;             // breathing: draw every frame
    if (dirty) { dirty = false; render(); }
  }
  window.addEventListener('resize', () => { if (running) resize(); });

  return {
    show() {
      if (running) return;
      page.hidden = false; gui.show();
      running = true; resize(); rebuildLily();
      loop();
    },
    hide() {
      page.hidden = true; gui.hide();
      running = false; cancelAnimationFrame(raf);
    },
  };
}
