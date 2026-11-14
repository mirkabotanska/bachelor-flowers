// Page 8 – Garden, Version 3 (started as a copy of Version 1). What is different from Version 1:
//  - smoother root growth: the tip grows continuously (not in 6 px steps), the line no longer shifts when a
//    point is added, roots ease in / out and bend in calmer curves ('Growth smoothness' slider)
//  - fewer side branches ('Side branches' slider, 1 = as many as Version 1)
//  - flowers appear with their root: a flower is always put on a root that is growing right then (or on a short
//    root that grows out to carry it), just behind its tip, and its stem grows out at once
//  - all flowers (and leaf clusters) breathe on one shared rhythm: a new flower joins the current breath
//  - growth only near the light: roots, branches, flowers and leaves grow while a light is near them and slow
//    down and settle within 'Growth after the light leaves' seconds once it has gone (growth.js: vigour)
//  - the lily is page 7's lily, Effect 1: the garden reads page 7's settings (look7.js) every time it is shown
//    (flower, petal colours + see-through, breathing, long exposure, blur, background haze, colour grading), and
//    draws it with the same shader code. What depends on size is measured per lily, in its own size: the depth
//    blur (focus + depth range, so a small lily is as soft as page 7's lily seen from further away) and its haze
//    on the wall (scaled around each lily). The roots keep their own blur / haze settings ('Roots: …' folders).
//  - every lily is a bit different: its blur (some sharper, some softer: 'Flower blur' x a random amount per lily,
//    'Blur varies between flowers') and its angle (from the side, like page 7, up to a 3/4 view: 'Angles up to',
//    'Angle randomness'). Breathing, trails and blur are in the lily's own space, so they work at every angle.
//  - flowers keep a distance from the tip of their branch ('Flower distance from tip'): the branch grows on past
//    the flower (a little further if it stopped too early), so it never ends at a flower.
// The roots of page 5 and the lily + look of page 7, together.
//  - roots grow where the light is (camera flashlight, mouse, or fake lights), exactly like page 5 (growth.js),
//    but they are drawn as real 3D tubes in the wall plane (tubes.js): round, lit, thicker at the base, thinner
//    towards the tips and on branches. They undulate a little in depth, so the depth blur of the look makes some
//    stretches sharp and others soft, slowly shifting (like the stems in generalStyle3). Once grown, every cluster
//    sways gently around the point where it started.
//  - leaves and flowers grow on the roots: the Blender lily of page 7 (same flower, colours, see-through petals,
//    motion trails, blur and background). No build-up effect: the stem grows out of the root with its leaves,
//    then the bud appears and breathes (open / close) with page 7's breathing settings, in step with every other
//    flower on the wall.
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
import { createGrowth, STEP_LENGTH } from './growth.js';
import { createLightInput } from './lights.js';
import { RootTubes, Particles, waveZ, swayAngle, originPhase, WAVE_PERIOD, SWAY_PERIOD } from './tubes.js';
import { loadLook7, BLENDER_LILY_URL, LOOK7_TARGET_Y, LOOK7_VIEW_TILT } from './look7.js';
import '../garden.css';

const STORAGE_KEY = 'flowers-web-garden-v3';
const V1_STORAGE_KEY = 'flowers-web-garden-v1';   // the first time, Version 3 starts from Version 1's saved settings
const OWN_DEFAULTS = ['Stem Grow (s)', 'Bud Appear (s)'];   // ...except these, which Version 3 sets differently
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

// the garden's own settings (the lily's come from page 7, see look7.js)
const GARDEN_DEFAULTS = {
  // garden: flowers and leaves on the roots
  'Flower Size': 0.6,
  'Flower Lean (°)': Math.round(LOOK7_VIEW_TILT * 10) / 10,   // the side view: page 7 sees its lily from this angle
  'Flower Angle Max (°)': 45,   // angles up to this (towards the viewer): 45 = a 3/4 view
  'Flower Angle Random': 0.8,   // 0 = every lily halfway between, 1 = anywhere from the side view to the most
  'Flower Blur': 0.75,          // the blur on the lilies (1 = page 7's)
  'Flower Blur Variation': 0.6, // how much it differs between lilies (0 = all the same)
  'Flower Tip Distance (px)': 36,   // a flower stays at least this far from the tip of its branch
  'Max Flowers': 8,
  'Flower Spacing': 110,        // px between flowers
  'Stem Grow (s)': 1.6,         // the stem (with its leaves) grows out of the root, while the root grows on
  'Bud Appear (s)': 0.5,        // then the bud appears (in the shared breath)
  'Branch Leaves': 0.6,         // how many leaf clusters grow along the roots (0 = none)
  'Leaf Size': 0.4,
  // garden: roots
  'Root Colour': '#8fae3c',
  'Root Colour 2': '#5f8a3a',
  'Root Thickness': 1.5,
  'Side Branches': 0.65,        // 1 = as many side branches as Version 1
  'Growth Smoothness': 0.7,     // 0 = Version 1's wobble, 1 = calm, flowing curves
  'Growth Linger (s)': 1.5,     // growth goes on this long (slowing down) after the light has left
  'Blur Variation': 0.8,        // how far the roots move towards / away from the glass (depth units)
  'Blur Variation Speed': 0.5,
  'Root Sway': 0.4,             // the slow turn of a cluster around where it started
  'Root Stay (s)': 5,           // after the light has gone
  'Dissolve (s)': 2.5,
  'Dissolve Spread': 1,         // how far the particles fly
  'Light Glow': 0.08,           // a soft light on the wall where the light is
  'Threshold': 70,              // camera: how much brighter than the room counts as light
  // roots: blur (frosted glass), in the garden's units
  'Root Blur Amount': 0.6,
  'Root Base Blur': 0.03,
  'Root Focus Distance': -0.6,  // sharp a little in front of the wall, where the roots come closest (- nearer, + further)
  'Root Depth Range': 1.8,
  'Root Only Behind Focus': false,
  'Root Frost': 0.35,
  // roots: their haze on the wall
  'Root Shadow': true,
  'Root Shadow Colour': '#6e766a',
  'Root Shadow Blur': 0.75,
  'Root Shadow Opacity': 0.35,
  'Root Shadow Offset X': 0.02,
  'Root Shadow Offset Y': -0.03,
  'Root Shadow Size': 1.0,
  // the wall (page 7's colour grading is used on top of it)
  'Wall From Page 7': false,    // use page 7's background colours instead
  'Wall Top': '#b9c0b4',
  'Wall Bottom': '#a7ada2',
};
// Version 1/2 names of the settings that are now the roots' / the wall's own (taken over the first time)
const RENAMED = { 'Blur Amount': 'Root Blur Amount', 'Base Blur': 'Root Base Blur', 'Focus Distance': 'Root Focus Distance',
  'Depth Range': 'Root Depth Range', 'Only Behind Focus': 'Root Only Behind Focus', 'Frost (paleness)': 'Root Frost',
  'Bg Shadow': 'Root Shadow', 'Bg Shadow Colour': 'Root Shadow Colour', 'Bg Shadow Blur': 'Root Shadow Blur', 'Bg Shadow Opacity': 'Root Shadow Opacity',
  'Bg Shadow Offset X': 'Root Shadow Offset X', 'Bg Shadow Offset Y': 'Root Shadow Offset Y', 'Bg Shadow Size': 'Root Shadow Size',
  'Background Top': 'Wall Top', 'Background Bottom': 'Wall Bottom' };

const QUAD_VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const ADD_FRAG = /* glsl */ `uniform sampler2D tInput; uniform float uWeight; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tInput, vUv) * uWeight; }`;
const GLOW_FRAG = /* glsl */ `uniform sampler2D tInput, tPrev; uniform float uKeep; varying vec2 vUv;
  void main(){ vec4 c = texture2D(tInput, vUv), p = texture2D(tPrev, vUv); gl_FragColor = c + (p - c) * uKeep * (1.0 - c.a * 0.5); }`;
// the flowers of now on top of their trail (page 7's combine); then all of it on top of the roots
const COMBINE_FRAG = /* glsl */ `uniform sampler2D tTrail, tNow; uniform float uNow; varying vec2 vUv;
  void main(){ vec4 n = texture2D(tNow, vUv) * uNow; gl_FragColor = n + texture2D(tTrail, vUv) * (1.0 - n.a); }`;
const OVER_ROOTS_FRAG = /* glsl */ `uniform sampler2D tFlowers, tRoots; varying vec2 vUv;
  void main(){ vec4 f = texture2D(tFlowers, vUv); gl_FragColor = f + texture2D(tRoots, vUv) * (1.0 - f.a); }`;

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
// a lily's own depth blur (page 7's circle of confusion): how far each of its pixels is from its focus plane, in
// its own size (focus + depth range are page 7's, times the lily's size), so it is as soft as page 7's lily
const COCF_VERT = /* glsl */ `
  attribute float aPart; attribute float aU; attribute float aSeed;
  ${MOTION_GLSL}
  uniform float uMS, uMPh, uMTwist; uniform vec2 uMSway;
  varying float vZ;
  void main(){
    vec3 n; vec4 mv = modelViewMatrix * vec4(lookMove(position, normal, aPart, aU, aSeed, uMS, uMPh, uMTwist, uMSway, n), 1.0);
    vZ = -mv.z; gl_Position = projectionMatrix * mv;
  }`;
const COCF_FRAG = /* glsl */ `uniform float uFocusF, uRangeF, uBaseF, uBehindF, uScaleF; varying float vZ;
  void main(){ float off = vZ - uFocusF; if (uBehindF > 0.5) off = max(off, 0.0); gl_FragColor = vec4(clamp((uBaseF + abs(off) / uRangeF) * uScaleF, 0.0, 1.0), 0.0, 0.0, 1.0); }`;
const STREAK_FRAG = /* glsl */ `
  uniform sampler2D tInput, tVel; uniform float uLen; varying vec2 vUv;
  void main(){
    vec3 v = texture2D(tVel, vUv).rgb;
    vec2 d = v.b > 1e-3 ? v.rg / v.b * uLen * smoothstep(0.0, 0.15, v.b) : vec2(0.0);
    vec4 s = vec4(0.0); float wsum = 0.0;
    for (int i = 0; i < 16; i++) { float f = float(i) / 15.0; float w = 1.0 - 0.6 * f; s += texture2D(tInput, vUv + d * (f - 0.25)) * w; wsum += w; }
    gl_FragColor = s / wsum;
  }`;
// how blurred each pixel should be. The lilies (with their trails) are on top: their blur is page 7's, measured per
// lily (tCocF); the roots below have their own focus / range in the garden's units. Out: (blur level x alpha / 1.5,
// alpha, paleness x alpha): blur amount and frost are the lilies' (page 7) or the roots' own, mixed by coverage.
const COC_FRAG = /* glsl */ `
  #include <packing>
  uniform sampler2D tFlowers, tNow, tCocF, tRoots, tRootDepth;
  uniform float uNear, uFar, uTrailSoft, uAmtF, uFrostF;
  uniform float uFocusR, uRangeR, uBaseR, uBehindR, uAmtR, uFrostR;
  varying vec2 vUv;
  void main(){
    float fa = texture2D(tFlowers, vUv).a, ra = texture2D(tRoots, vUv).a;
    float wf = fa, wr = ra * (1.0 - fa);
    // the lily: as page 7 (its own blur where the flower of now is, the trail's softness elsewhere)
    float cf = mix(uTrailSoft, texture2D(tCocF, vUv).r, texture2D(tNow, vUv).a);
    // the roots
    float d = -perspectiveDepthToViewZ(texture2D(tRootDepth, vUv).x, uNear, uFar);
    float off = d - uFocusR;
    if (uBehindR > 0.5) off = max(off, 0.0);
    float cr = mix(uTrailSoft, clamp(uBaseR + abs(off) / uRangeR, 0.0, 1.0), ra);
    gl_FragColor = vec4((wf * cf * uAmtF + wr * cr * uAmtR) / 1.5, wf + wr, wf * cf * uFrostF + wr * cr * uFrostR, 1.0);
  }`;
const BLUR_FRAG = /* glsl */ `
  uniform sampler2D tInput; uniform vec2 uDir; varying vec2 vUv;
  void main(){
    vec4 s = texture2D(tInput, vUv) * 0.2270270270;
    s += (texture2D(tInput, vUv + uDir * 1.3846153846) + texture2D(tInput, vUv - uDir * 1.3846153846)) * 0.3162162162;
    s += (texture2D(tInput, vUv + uDir * 3.2307692308) + texture2D(tInput, vUv - uDir * 3.2307692308)) * 0.0702702703;
    gl_FragColor = s;
  }`;
// final (page 7's): pick the blur level per pixel, put it on the background with the hazes, then grade.
// Two hazes: the lilies' (page 7's settings, scaled around every lily: uAnchors) and the roots' own
const FINAL_FRAG = /* glsl */ `
  uniform sampler2D tColor, tB1, tB2, tB3, tCoc, tCocBlur;
  uniform vec2 uRes; uniform float uExposure, uContrast, uSat, uWarmth, uFade;
  uniform vec3 uBgTop, uBgBottom, uShadow, uHigh; uniform float uShadowAmt, uHighAmt, uGlow, uAspect;
  uniform sampler2D tBsF, tBsR; uniform vec3 uBsColF, uBsColR; uniform float uBsOpF, uBsOpR, uBsSizeF, uBsSizeR, uBsGainF, uBsGainR;
  uniform vec2 uBsOffF, uBsOffR; uniform vec4 uAnchors[16]; uniform int uAnchorCount;
  uniform vec4 uLights[8]; uniform int uLightCount; uniform vec3 uLightCol;
  varying vec2 vUv;
  vec4 level(float l){
    vec4 c0 = texture2D(tColor, vUv), c1 = texture2D(tB1, vUv), c2 = texture2D(tB2, vUv), c3 = texture2D(tB3, vUv);
    if (l < 1.0) return mix(c0, c1, l);
    if (l < 2.0) return mix(c1, c2, l - 1.0);
    return mix(c2, c3, clamp(l - 2.0, 0.0, 1.0));
  }
  float haze(sampler2D t, vec2 anchor, vec2 off, float size, float gain) {
    vec2 suv = anchor + (vUv - anchor - off * vec2(1.0 / uAspect, 1.0)) / size;
    float edge = smoothstep(0.0, 0.12, suv.x) * smoothstep(0.0, 0.12, 1.0 - suv.x) * smoothstep(0.0, 0.12, suv.y) * smoothstep(0.0, 0.12, 1.0 - suv.y);
    return (1.0 - exp(-texture2D(t, suv).a * gain)) * edge;
  }
  void main(){
    vec3 own = texture2D(tCoc, vUv).rgb;
    vec3 near = texture2D(tCocBlur, vUv).rgb;
    vec3 k = own.g > 0.5 ? own : near;
    float lv = k.r / max(k.g, 1e-4) * 1.5, frost = k.b / max(k.g, 1e-4);
    vec4 c = level(lv * 3.0);
    vec3 bg = mix(uBgBottom, uBgTop, vUv.y);
    float bsMask = 0.0;
    if (uBsOpR > 0.0) { float sh = haze(tBsR, vec2(0.5), uBsOffR, uBsSizeR, uBsGainR); bg = mix(bg, uBsColR, sh * uBsOpR); bsMask = max(bsMask, step(0.002, sh * uBsOpR)); }
    if (uBsOpF > 0.0 && uAnchorCount > 0) {
      // every lily's haze is scaled around that lily (page 7 scales it around its one lily): a smooth mix of anchors
      vec2 an = vec2(0.0); float ws = 0.0;
      for (int i = 0; i < 16; i++) {
        if (i >= uAnchorCount) break;
        vec2 dv = (vUv - uAnchors[i].xy) * vec2(uAspect, 1.0);
        float w = uAnchors[i].w / (dot(dv, dv) + uAnchors[i].z * uAnchors[i].z);
        an += uAnchors[i].xy * w; ws += w;
      }
      float sh = haze(tBsF, an / ws, uBsOffF, uBsSizeF, uBsGainF);
      bg = mix(bg, uBsColF, sh * uBsOpF); bsMask = max(bsMask, step(0.002, sh * uBsOpF));
    }
    for (int i = 0; i < 8; i++) {
      if (i >= uLightCount) break;
      vec2 dv = (vUv - uLights[i].xy) * vec2(uAspect, 1.0);
      bg += uLightCol * uLights[i].z * exp(-dot(dv, dv) / (uLights[i].w * uLights[i].w) * 2.0);
    }
    c.rgb = mix(c.rgb, bg * c.a, clamp(frost, 0.0, 1.0));
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
  // params = the garden's own settings + the lily settings of page 7 (read again every time the garden is shown;
  // only the garden's own ones are saved here)
  let blender = {};
  const params = { ...loadLook7(blender), ...GARDEN_DEFAULTS };
  try {
    const own = localStorage.getItem(STORAGE_KEY);
    const stored = JSON.parse(own ?? localStorage.getItem(V1_STORAGE_KEY) ?? '{}');
    if (own === null) for (const k of OWN_DEFAULTS) delete stored[k];
    for (const [from, to] of Object.entries(RENAMED)) if (from in stored && !(to in stored)) stored[to] = stored[from];
    for (const k of Object.keys(GARDEN_DEFAULTS)) if (k in stored) params[k] = stored[k];
  } catch { /* no storage */ }
  const save = () => {
    const own = Object.fromEntries(Object.keys(GARDEN_DEFAULTS).map((k) => [k, params[k]]));
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(own)); } catch { /* ignore */ }
  };
  // page 7's lily settings now; returns true if the shape of the flower (or of its breath) changed
  const SHAPE_KEYS = new Set([...Object.keys(defaults(FLOWER_PARAMS)), 'Show Stem + Leaves', 'Petal Opacity', 'Open Most', 'Closed Most',
    'Leaf Angle Closed', 'Leaf Angle Open', 'Leaf Fold Closed', 'Leaf Fold Open', 'Leaf Droop Breath']);
  function syncLook() {
    let shape = false;
    for (const [k, v] of Object.entries(loadLook7(blender))) {
      if (k in GARDEN_DEFAULTS || params[k] === v) continue;
      if (SHAPE_KEYS.has(k)) shape = true;
      params[k] = v;
    }
    return shape;
  }

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
  const tubes = new RootTubes(); tubes.layers.set(LAYER_ROOTS); scene.add(tubes);
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
  function boxOf(pos) {                          // the middle of the flower and how big it is (for its haze)
    const b = new THREE.Box3().setFromArray(pos), c = b.getCenter(new THREE.Vector3());
    return { centre: c, radius: b.getSize(new THREE.Vector3()).length() / 2 };
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
      foot: Math.min(-0.5, minY), stemLen: p['Stem Length'], stemBend: p['Stem Bend'], ...boxOf(d.position),
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

  // breathing (page 7): open on the breath in, close on the breath out. tt = the shared breath clock (the
  // garden's time), the same for every flower and leaf cluster, so the whole wall breathes together
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
      this.size = size; this.dir = dir;
      this.lean = this.isFlower ? null : rnd(0.35, 0.7);     // out of the wall, towards the viewer (flowers: leanDeg())
      this.angleR = Math.random(); this.blurR = rnd(-1, 1);    // this lily's own angle and blur (see leanDeg, prepareCoc)
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
      this.cocMat = new THREE.ShaderMaterial({ vertexShader: COCF_VERT, fragmentShader: COCF_FRAG, side: THREE.DoubleSide, uniforms: {
        uMFlutter: u.uMFlutter, uMFoot: u.uMFoot, uMAxis: u.uMAxis, uMS: u.uMS, uMPh: u.uMPh, uMTwist: u.uMTwist, uMSway: u.uMSway,
        uGrow: u.uGrow, uHead: u.uHead, uStemLen: u.uStemLen, uStemBend: u.uStemBend,
        uFocusF: { value: 1 }, uRangeF: { value: 1 }, uBaseF: { value: 0 }, uBehindF: { value: 0 }, uScaleF: { value: 1 } } });
      this.outer = new THREE.Group(); this.inner = new THREE.Group(); this.lily = new THREE.Group();
      this.outer.add(this.inner); this.inner.add(this.lily);
      for (const m of this.meshes) { m.frustumCulled = false; m.layers.set(LAYER_FLOWERS); this.lily.add(m); }
      this.inner.rotation.x = this.lean ?? 0;
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
      // the foot of the stem sits on the root; the flower turns around its own axis (as on page 7)
      this.lily.position.set(-k.stemBend, k.stemLen, 0);
      if (this.petalMat) this.petalMat.opacity = params['Petal Opacity'];
      this.poseVersion = -1;
    }
    get t() { return growth.now; }
    tt(t) { return t; }                          // one breath for all: a new flower joins the current breath
    // where it is: on the (drawn) root, moved with the sway of its cluster and the depth wave
    place() {
      if (this.pin) {                            // a lily put somewhere on purpose (testing): no root, no sway
        this.outer.position.set(this.pin.x, this.pin.y, 0); this.outer.rotation.z = this.dir - Math.PI / 2;
        this.outer.scale.setScalar(this.size); this.inner.rotation.x = THREE.MathUtils.degToRad(this.pin.lean ?? params['Flower Lean (°)']);
        return;
      }
      const line = tubes.lines?.get(this.root) ?? this.root.points;
      const p = line[Math.min(this.index, line.length - 1)];
      const c = growth.centerOf(this.root), [ox, oy] = toWorld(c.x, c.y), [wx, wy] = toWorld(p.x, p.y);
      const a = swayAngle(originPhase(ox, oy), swayT, swayAmt());
      const dx = wx - ox, dy = wy - oy, ca = Math.cos(a), sa = Math.sin(a);
      const x = ox + ca * dx - sa * dy, y = oy + sa * dx + ca * dy;
      this.outer.position.set(x, y, waveZ(x, y, waveT) * params['Blur Variation']);
      this.outer.rotation.z = this.dir + a - Math.PI / 2;
      this.outer.scale.setScalar(this.size);
      if (this.isFlower) this.inner.rotation.x = THREE.MathUtils.degToRad(this.leanDeg());
    }
    // the stage of its life: growing, bud, breathing, dissolving
    update(now, dt, lights = []) {
      if (this.pin) { this.u.uGrow.value = 1; this.u.uHead.value = this.isFlower ? 1 : 0; this.place(); return; }
      // grows only while a light is near (its vigour runs down over 'Growth after the light leaves' once it's gone)
      this.vigor = growth.settle(this.vigor ?? 1, growth.nearness(pointOf(this.root, this.index), lights), dt);
      this.age = (this.age ?? 0) + dt * ease(this.vigor);
      if (this.goAt === null) {
        const a = this.anchor();
        if (a !== true) this.goAt = Math.max(now, typeof a === 'number' ? a : now);
      }
      const age = this.age, u = this.u;
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
    // page 7's depth blur, in this lily's size: focus = the depth of the point page 7 looks at (+ its Focus
    // Distance), depth range x size. And where its middle is on the screen (its haze is scaled around it)
    // its angle towards the viewer: from the side view (page 7) up to 'Angles up to', randomly per lily
    leanDeg() {
      const side = params['Flower Lean (°)'], most = Math.max(side, params['Flower Angle Max (°)']);
      return side + (most - side) * (0.5 + (this.angleR - 0.5) * params['Flower Angle Random']);
    }
    prepareCoc() {
      this.outer.updateMatrixWorld(true);
      _v.set(0, LOOK7_TARGET_Y, 0).applyMatrix4(this.solidMesh.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
      const cu = this.cocMat.uniforms, s = this.size;
      cu.uFocusF.value = -_v.z + params['Focus Distance'] * s; cu.uRangeF.value = params['Depth Range'] * s;
      cu.uBaseF.value = params['Base Blur']; cu.uBehindF.value = params['Only Behind Focus'] ? 1 : 0;
      // some lilies sharper, some softer: x 0.4 ... 2.5 at full variation
      cu.uScaleF.value = this.fixedBlur ?? params['Flower Blur'] * Math.pow(2, params['Flower Blur Variation'] * 1.3 * this.blurR);
    }
    screenAnchor(out) {                          // x, y (0..1), radius (screen heights), weight
      const k = this.k;
      _v.copy(k.centre).applyMatrix4(this.solidMesh.matrixWorld).project(camera);
      const r = k.radius * this.size / (SIM_H / PX);            // in screen heights (the screen is SIM_H / PX units high)
      return out.set(_v.x * 0.5 + 0.5, _v.y * 0.5 + 0.5, r, r * r);
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
      this.geometry.dispose(); this.solidMat.dispose(); this.petalMat?.dispose(); this.velMat.dispose(); this.cocMat.dispose();
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
  // flowers stay this many points away from the tip of their branch (unless the branch's end has joined another root)
  const tipSteps = () => Math.max(1, Math.round(params['Flower Tip Distance (px)'] / STEP_LENGTH));
  function tryFlower(root, index, joined = false) {
    if (!root || !growth.alive(root) || index < 1 || index >= root.points.length - 1 || (root.cut ?? 0) > index) return false;
    if (!joined && root.burstSteps === 0 && index > root.points.length - 1 - tipSteps()) return false;   // too near the tip
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
  // flowers appear with their root: a flower always goes on a root that is growing right now, a couple of
  // points behind its tip (or, if none is growing, on a short root that grows out to carry it). It waits there
  // (pending) only until the tip has passed that point, a fraction of a second.
  const pending = [];                             // {root, index, spot, until}
  const pendingOf = (spot) => pending.filter((f) => f.spot === spot).length;
  function flowerFor(spot, light = null) {
    if (flowersAlive().length + pending.length >= params['Max Flowers']) return false;
    const growing = growth.growingOn(spot, tipSteps() + 3).filter((r) => !pending.some((f) => f.root === r));
    let root = null;
    for (const r of growing) {                    // the growing root with the most still to go, where there is room
      const tip = r.points.at(-1);
      if (!free(tip.x, tip.y, params['Flower Spacing'], 'flower')) continue;
      if (!root || r.burstSteps > root.burstSteps) root = r;
    }
    if (!root) {
      if ((spot.nextFlowerRoot ?? 0) > growth.now) return false;   // at most one flower-carrying root per spot every 1.5 s
      spot.nextFlowerRoot = growth.now + 1.5;
      root = growth.flowerRoot(spot, light);
      if (!root) return false;
      const tip = root.points[0];
      if (!free(tip.x, tip.y, params['Flower Spacing'] * 0.8, 'flower')) return false;   // (the root still grows: a nice side branch)
    }
    pending.push({ root, index: Math.max(2, root.points.length + 1), spot, until: growth.now + 2.5 });
    return true;
  }
  function updatePending(now) {
    for (let i = pending.length - 1; i >= 0; i--) {
      const f = pending[i], r = f.root, last = r.points.length - 1;
      let done = !growth.alive(r) || now > f.until;
      if (!done && (r.vigor ?? 1) < 0.2) { f.spot.energy += FLOWER_COST; done = true; }   // the light left first: no flower (energy back)
      // the branch has grown far enough past it: the flower appears (the tip is still growing on)
      else if (!done && last >= f.index + tipSteps()) { tryFlower(r, f.index, true); done = true; }
      else if (!done && r.burstSteps === 0 && r.distanceToGrow < 3) {
        // the branch stopped too early: it grows a bit further past the flower (once), or the flower moves back
        // along the branch (or doesn't come, if the branch is too short)
        if (!f.extended && (r.vigor ?? 1) > 0.5) { r.burstSteps = f.index + tipSteps() - last + 1; f.extended = true; f.until = now + 2.5; }
        else { if (last - tipSteps() >= 2) tryFlower(r, last - tipSteps(), true); done = true; }
      }
      if (done) pending.splice(i, 1);
    }
  }
  function handleEvents(events, lights, dt, now) {
    const dust = [];
    for (const e of events) {
      if (e.type === 'particle') {
        const [x, y] = toWorld(e.x, e.y), c = rootColour(e.tone);
        dust.push({ x, y, z: 0.02, vx: e.vx / PX, vy: -e.vy / PX, vz: rnd(0, 0.05), born: e.born, life: e.life, size: e.size * 3.2 / PX, color: [c.r, c.g, c.b] });
      } else if (e.type === 'connect') {
        // roots of two lights joined: sometimes a flower right where they meet (the rest comes from the energy below)
        if ((e.root.vigor ?? 1) > 0.5 && Math.random() < 0.25) tryFlower(e.root, e.root.points.length - 2 - Math.floor(Math.random() * 4), true);   // its end joined a root: not a tip
      } else if (e.type === 'boost') {
        if (e.level >= 2) flowerFor(e.spot);
      } else if (e.type === 'leaf') {
        if ((e.root.vigor ?? 1) > 0.3 && Math.random() < params['Branch Leaves'] * (e.route ? 0.7 : 1)) tryLeaf(e.root, e.index);
      }
    }
    if (dust.length) particles.spawn(dust);
    // light on a spot = energy; enough energy = a flower (more allowed the more the spot's roots are connected)
    for (const spot of growth.spots) {
      let near = null;
      for (const l of lights) if (Math.hypot(l.x - spot.x, l.y - spot.y) < 130) { spot.energy += dt * (l.strength ?? 1); near = l; }
      if (spot.energy >= FLOWER_COST) {
        // only while a light is on the spot (flowers grow near the light, not after it has gone)
        if (near && flowersOf(spot) + pendingOf(spot) < 1 + Math.min(spot.links, 3) && flowerFor(spot, near)) spot.energy -= FLOWER_COST;
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
  let flowersRT, cocFRT, hb1, hb2, hb3, bsFA, bsFB;      // the lilies alone (for their haze), their own blur
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  const quadScene = new THREE.Scene(); quadScene.add(quad);
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const cocMat = new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: COC_FRAG,
    uniforms: { tFlowers: { value: null }, tNow: { value: null }, tCocF: { value: null }, tRoots: { value: null }, tRootDepth: { value: null },
      uNear: { value: 1 }, uFar: { value: 60 }, uTrailSoft: { value: 0 }, uAmtF: { value: 1 }, uFrostF: { value: 0 },
      uFocusR: { value: CAM_DIST }, uRangeR: { value: 1 }, uBaseR: { value: 0 }, uBehindR: { value: 0 }, uAmtR: { value: 1 }, uFrostR: { value: 0 } } });
  const glowMat = new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: GLOW_FRAG, uniforms: { tInput: { value: null }, tPrev: { value: null }, uKeep: { value: 0 } } });
  const streakMat = new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: STREAK_FRAG, uniforms: { tInput: { value: null }, tVel: { value: null }, uLen: { value: 1 } } });
  const combineMat = new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: COMBINE_FRAG, uniforms: { tTrail: { value: null }, tNow: { value: null }, uNow: { value: 1 } } });
  const overRootsMat = new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: OVER_ROOTS_FRAG, uniforms: { tFlowers: { value: null }, tRoots: { value: null } } });
  const addMat = new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: ADD_FRAG, uniforms: { tInput: { value: null }, uWeight: { value: 1 } },
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor, depthTest: false, depthWrite: false, transparent: true });
  const blurMat = new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: BLUR_FRAG, uniforms: { tInput: { value: null }, uDir: { value: new THREE.Vector2() } } });
  const finalMat = new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: FINAL_FRAG, uniforms: {
    tColor: { value: null }, tB1: { value: null }, tB2: { value: null }, tB3: { value: null }, tCoc: { value: null }, tCocBlur: { value: null },
    uRes: { value: new THREE.Vector2() }, uExposure: { value: 1 }, uContrast: { value: 1 }, uSat: { value: 1 },
    uWarmth: { value: 0 }, uFade: { value: 0 }, uBgTop: { value: new THREE.Color() }, uBgBottom: { value: new THREE.Color() },
    uShadow: { value: new THREE.Color() }, uHigh: { value: new THREE.Color() }, uShadowAmt: { value: 0 }, uHighAmt: { value: 0 }, uGlow: { value: 0 }, uAspect: { value: 1 },
    tBsF: { value: null }, tBsR: { value: null }, uBsColF: { value: new THREE.Color() }, uBsColR: { value: new THREE.Color() },
    uBsOpF: { value: 0 }, uBsOpR: { value: 0 }, uBsSizeF: { value: 1 }, uBsSizeR: { value: 1 }, uBsGainF: { value: 3 }, uBsGainR: { value: 3 },
    uBsOffF: { value: new THREE.Vector2() }, uBsOffR: { value: new THREE.Vector2() },
    uAnchors: { value: Array.from({ length: 16 }, () => new THREE.Vector4()) }, uAnchorCount: { value: 0 },
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
    for (const t of [velRT, velB, velTmp, streakRT, sceneRT, rootsRT, subRT, trailRT, glowA, glowB, colorRT, cocRT, b1, b2, b3, tmp1, tmp2, tmp3, cocB, cocTmp, bsA, bsB, emptyRT,
      flowersRT, cocFRT, hb1, hb2, hb3, bsFA, bsFB]) t?.dispose();
    flowersRT = rt(w, h); cocFRT = rt(w, h, true);
    hb1 = rt(w >> 1, h >> 1); hb2 = rt(w >> 2, h >> 2); hb3 = rt(w >> 3, h >> 3);
    bsFA = rt(Math.max(w >> 4, 8), Math.max(h >> 4, 8)); bsFB = rt(Math.max(w >> 4, 8), Math.max(h >> 4, 8));
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
    // the lilies (now on top of their trail, as page 7), then over the roots
    combineMat.uniforms.tTrail.value = trailTex; combineMat.uniforms.tNow.value = sceneRT.texture;
    combineMat.uniforms.uNow.value = trails ? params['Now Strength'] : 1;
    pass(combineMat, flowersRT);
    overRootsMat.uniforms.tFlowers.value = flowersRT.texture; overRootsMat.uniforms.tRoots.value = rootsRT.texture;
    pass(overRootsMat, colorRT);
    // every lily's own depth blur (page 7's, in its size)
    renderer.setClearColor(0xffffff, 1); renderer.setRenderTarget(cocFRT); renderer.clear(); renderer.setClearColor(0x000000, 0);
    for (const p of plants) { p.prepareCoc(); for (const m of p.meshes) m.material = p.cocMat; }
    if (plants.length) renderLayer(LAYER_FLOWERS, cocFRT, false);
    for (const p of plants) { p.solidMesh.material = p.solidMat; if (p.petalMesh) p.petalMesh.material = p.petalMat; }
    // how blurred each pixel should be (lilies: page 7's, roots: their own)
    const cu = cocMat.uniforms;
    cu.tFlowers.value = flowersRT.texture; cu.tNow.value = sceneRT.texture; cu.tCocF.value = cocFRT.texture;
    cu.tRoots.value = rootsRT.texture; cu.tRootDepth.value = rootsRT.depthTexture;
    cu.uNear.value = camera.near; cu.uFar.value = camera.far; cu.uTrailSoft.value = params['Trail Softness'];
    cu.uAmtF.value = params['Blur Amount']; cu.uFrostF.value = params['Frost (paleness)'];
    cu.uFocusR.value = CAM_DIST + params['Root Focus Distance']; cu.uRangeR.value = params['Root Depth Range'];
    cu.uBaseR.value = params['Root Base Blur']; cu.uBehindR.value = params['Root Only Behind Focus'] ? 1 : 0;
    cu.uAmtR.value = params['Root Blur Amount']; cu.uFrostR.value = params['Root Frost'];
    pass(cocMat, cocRT);
    blur(cocRT, cocTmp, cocB, 2.0);
    blur(colorRT, tmp1, b1, 1.6); blur(b1, tmp2, b2, 1.8); blur(b2, tmp3, b3, 2.2);
    // hazes on the wall (page 7: the blurred flower at 1/16 size, blurred again a few times): the roots' from the
    // roots alone (their own settings), the lilies' from the lilies alone (page 7's settings)
    const bsR = params['Root Shadow'] && params['Root Shadow Opacity'] > 0;
    if (bsR) {
      blur(rootsRT, tmp1, hb1, 1.6); blur(hb1, tmp2, hb2, 1.8); blur(hb2, tmp3, hb3, 2.2);
      const amt = params['Root Shadow Blur'], r = 1 + amt * 5, passes = 1 + Math.round(amt * 6);
      blur(hb3, bsB, bsA, r);
      for (let i = 0; i < passes; i++) blur(bsA, bsB, bsA, r);
    }
    const bsF = params['Bg Shadow'] && params['Bg Shadow Opacity'] > 0 && plants.some((p) => p.isFlower);
    if (bsF) {
      blur(flowersRT, tmp1, hb1, 1.6); blur(hb1, tmp2, hb2, 1.8); blur(hb2, tmp3, hb3, 2.2);
      const amt = params['Bg Shadow Blur'], r = 1 + amt * 5, passes = 1 + Math.round(amt * 6);
      blur(hb3, bsFB, bsFA, r);
      for (let i = 0; i < passes; i++) blur(bsFA, bsFB, bsFA, r);
    }
    const f = finalMat.uniforms;
    f.tColor.value = colorRT.texture; f.tB1.value = b1.texture; f.tB2.value = b2.texture; f.tB3.value = b3.texture;
    f.tCoc.value = cocRT.texture; f.tCocBlur.value = cocB.texture;
    f.uExposure.value = params['Exposure']; f.uContrast.value = params['Contrast']; f.uSat.value = params['Saturation'];
    f.uWarmth.value = params['Warmth']; f.uFade.value = params['Fade'];
    const wall7 = params['Wall From Page 7'];
    f.uBgTop.value.set(params[wall7 ? 'Background Top' : 'Wall Top']); f.uBgBottom.value.set(params[wall7 ? 'Background Bottom' : 'Wall Bottom']);
    f.uShadow.value.set(params['Shadow Tint']); f.uHigh.value.set(params['Highlight Tint']);
    f.uShadowAmt.value = params['Shadow Tint Amount']; f.uHighAmt.value = params['Highlight Tint Amount'];
    f.uGlow.value = params['Glow']; f.uAspect.value = W / H;
    f.tBsR.value = bsA.texture; f.uBsOpR.value = bsR ? params['Root Shadow Opacity'] : 0;
    f.uBsGainR.value = 3 * (1 + 3 * params['Root Shadow Blur']); f.uBsColR.value.set(params['Root Shadow Colour']);
    f.uBsSizeR.value = params['Root Shadow Size']; f.uBsOffR.value.set(params['Root Shadow Offset X'], params['Root Shadow Offset Y']);
    f.tBsF.value = bsFA.texture; f.uBsOpF.value = bsF ? params['Bg Shadow Opacity'] : 0;
    f.uBsGainF.value = 3 * (1 + 3 * params['Bg Shadow Blur']); f.uBsColF.value.set(params['Bg Shadow Colour']);
    f.uBsSizeF.value = params['Bg Shadow Size']; f.uBsOffF.value.set(params['Bg Shadow Offset X'], params['Bg Shadow Offset Y']);
    let na = 0;
    for (const p of plants) if (p.isFlower && !p.crumbled && na < 16) p.screenAnchor(f.uAnchors.value[na++]);
    f.uAnchorCount.value = na;
    const nL = Math.min(lights.length, 8);
    for (let i = 0; i < nL; i++) f.uLights.value[i].set(lights[i].x / SIM_W, 1 - lights[i].y / SIM_H, params['Light Glow'], 0.16);
    f.uLightCount.value = nL;
    pass(finalMat, null);
  }

  // ---------------------------------------------------------------- the frame
  let lastNow = 0;
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
    growth.live.branches = params['Side Branches']; growth.live.smoothness = params['Growth Smoothness'];
    growth.live.linger = params['Growth Linger (s)'];
    tubes.u.uFadeLen.value = 0.8;
    if (growth.dirty) { tubes.rebuild(growth, toWorld, 1 / PX); growth.clean(); }
    t = mark('tubes', t);
    handleEvents(events, lights, dt, now);
    updatePending(now);
    for (const p of plants) p.update(now, dt, lights);
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
  const gui = new GUI({ title: '8 · Garden (Version 3)' });
  gui.domElement.classList.add('garden__gui');
  gui.hide();
  opts.panelTop?.(gui);
  const onLook = () => { save(); };
  const onFlower = () => { kinds.clear(); for (const p of plants) p.attach(); };   // the flower's shape changed (on page 7)

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
  fg.add(params, 'Flower Lean (°)', 0, 60, 0.5).name('Side view angle (°, page 7 = ' + GARDEN_DEFAULTS['Flower Lean (°)'] + ')').onChange(onLook);
  fg.add(params, 'Flower Angle Max (°)', 0, 80, 0.5).name('Angles up to (°, 45 = 3/4)').onChange(onLook);
  fg.add(params, 'Flower Angle Random', 0, 1, 0.01).name('Angle randomness').onChange(onLook);
  fg.add(params, 'Flower Blur', 0, 1.5, 0.01).name('Flower blur (1 = page 7)').onChange(onLook);
  fg.add(params, 'Flower Blur Variation', 0, 1, 0.01).name('Blur varies between flowers').onChange(onLook);
  fg.add(params, 'Flower Tip Distance (px)', 0, 120, 1).name('Flower distance from branch tip (px)').onChange(onLook);
  fg.add(params, 'Max Flowers', 0, 20, 1).name('Flowers at most').onChange(onLook);
  fg.add(params, 'Flower Spacing', 40, 300, 1).name('Space between flowers (px)').onChange(onLook);
  fg.add(params, 'Stem Grow (s)', 0.5, 8, 0.1).name('Stem grows in (s)').onChange(onLook);
  fg.add(params, 'Bud Appear (s)', 0.1, 3, 0.1).name('Bud appears in (s)').onChange(onLook);
  fg.add(params, 'Branch Leaves', 0, 1, 0.01).name('Leaves on the roots').onChange(onLook);
  fg.add(params, 'Leaf Size', 0.1, 1, 0.01).name('Leaf size').onChange(onLook);

  const fr = gui.addFolder('Garden: roots');
  fr.addColor(params, 'Root Colour').name('Root colour').onChange(onLook);
  fr.addColor(params, 'Root Colour 2').name('Root colour 2 (variation)').onChange(onLook);
  fr.add(params, 'Side Branches', 0, 1.5, 0.01).name('Side branches (1 = Version 1)').onChange(onLook);
  fr.add(params, 'Growth Smoothness', 0, 1, 0.01).name('Growth smoothness').onChange(onLook);
  fr.add(params, 'Growth Linger (s)', 0.2, 8, 0.1).name('Growth after the light leaves (s)').onChange(onLook);
  fr.add(params, 'Root Thickness', 0.2, 3, 0.01).name('Thickness').onChange(onLook);
  fr.add(params, 'Blur Variation', 0, 2, 0.01).name('Blur variation (amount)').onChange(onLook);
  fr.add(params, 'Blur Variation Speed', 0, 3, 0.01).name('Blur variation (speed)').onChange(onLook);
  fr.add(params, 'Root Sway', 0, 1, 0.01).name('Movement (sway)').onChange(onLook);
  fr.add(params, 'Root Stay (s)', 0, 20, 0.1).name('Roots stay (s after the light)').onChange(onLook);
  fr.add(params, 'Dissolve (s)', 0.5, 6, 0.1).name('Dissolve (s)').onChange(onLook);
  fr.add(params, 'Dissolve Spread', 0, 3, 0.01).name('Dissolve spread').onChange(onLook);
  fr.add(params, 'Light Glow', 0, 0.5, 0.005).name('Light on the wall').onChange(onLook);

  const frb = gui.addFolder('Roots: blur (frosted glass)');
  frb.add(params, 'Root Blur Amount', 0, 1.5, 0.01).name('Blur amount').onChange(onLook);
  frb.add(params, 'Root Base Blur', 0, 1, 0.01).name('Blur everywhere').onChange(onLook);
  frb.add(params, 'Root Focus Distance', -3, 3, 0.01).name('Sharp at (- near, + far)').onChange(onLook);
  frb.add(params, 'Root Depth Range', 0.2, 5, 0.01).name('Depth to full blur').onChange(onLook);
  frb.add(params, 'Root Only Behind Focus').name('Only blur behind').onChange(onLook);
  frb.add(params, 'Root Frost', 0, 1, 0.01).name('Paler when blurred').onChange(onLook);
  const frs = gui.addFolder('Roots: haze on the wall');
  frs.add(params, 'Root Shadow').name('Haze on/off').onChange(onLook);
  frs.addColor(params, 'Root Shadow Colour').name('Colour').onChange(onLook);
  frs.add(params, 'Root Shadow Blur', 0, 1, 0.01).name('Blur').onChange(onLook);
  frs.add(params, 'Root Shadow Opacity', 0, 1, 0.01).name('Opacity').onChange(onLook);
  frs.add(params, 'Root Shadow Offset X', -0.5, 0.5, 0.005).name('Offset (- left, + right)').onChange(onLook);
  frs.add(params, 'Root Shadow Offset Y', -0.5, 0.5, 0.005).name('Offset (- down, + up)').onChange(onLook);
  frs.add(params, 'Root Shadow Size', 0.5, 3, 0.01).name('Size').onChange(onLook);
  const fw = gui.addFolder('Wall');
  fw.add(params, 'Wall From Page 7').name("Page 7's background").onChange(onLook);
  fw.addColor(params, 'Wall Top').name('Wall top').onChange(onLook);
  fw.addColor(params, 'Wall Bottom').name('Wall bottom').onChange(onLook);
  // the lily itself: page 7, Effect 1 (flower, colours, breathing, long exposure, blur, its haze, colour grading)
  const fly = gui.addFolder('Lily: from page 7 · Effect 1');
  const lilyNote = { note: 'change it on page 7' };
  fly.add(lilyNote, 'note').name('Lily look').disable();
  for (const f of [frb, frs, fw]) f.close();

  function clearGarden() { growth.clear(); for (const p of plants) p.dispose(); plants.length = 0; pending.length = 0; }
  const actions = {
    'Save image (PNG)': () => { const a = document.createElement('a'); a.download = `garden-${Date.now()}.png`; a.href = canvas.toDataURL('image/png'); a.click(); },
    'Copy settings (JSON)': async () => { try { await navigator.clipboard.writeText(JSON.stringify(params, null, 2)); } catch { console.log(JSON.stringify(params, null, 2)); } },
    'Reset settings': () => { Object.assign(params, GARDEN_DEFAULTS); save(); gui.controllersRecursive().forEach((c) => c.updateDisplay()); },
  };
  for (const k of Object.keys(actions)) gui.add(actions, k);

  // the Blender flower (page 7's lily starts from it): read it, then page 7's settings again on top
  fetch(BLENDER_LILY_URL).then((r) => r.json()).then((j) => {
    blender = j.settings ?? {};
    if (syncLook()) onFlower();
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
    for (const p of temp) { for (const m of p.meshes) m.material = p.cocMat; }
    renderer.compile(scene, camera);
    for (const p of temp) p.dispose();
  }

  const api = {
    show() {
      if (running) return;
      page.hidden = false; gui.show();
      if (syncLook()) onFlower();                // page 7's lily settings, as they are now
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
  window[opts.name ?? 'gardenApp'] = { params, growth, plants, lightInput, prof, startFake: (list) => growth.startFake(list), tryFlower, tryLeaf, step, pending,
    // a fully grown lily on its own, for comparing with page 7: x, y in world units (0, 0 = the middle of the screen),
    // size, lean (°), roll (turn around its stem), seedOff (0 = the same light / dark petals as page 7). centre: put
    // the point page 7 looks at in the middle of the screen
    testFlower({ x = 0, y = 0, size = params['Flower Size'], lean, roll = 0, seedOff = 0, centre = false } = {}) {
      const fake = { points: [{ x: 0, y: 0, t: 0 }, { x: 0, y: 0, t: 0 }], spot: 0, depth: 0, parent: null };
      const p = new Plant('flower', fake, 1, Math.PI / 2, size);
      p.pin = { x, y, lean }; p.roll = roll; p.fixedBlur = 1; p.seedOff = seedOff; p.u.uSeedOff.value = seedOff;
      p.update(growth.now, 0); p.outer.updateMatrixWorld(true);
      if (centre) {
        _v.set(0, LOOK7_TARGET_Y, 0).applyMatrix4(p.solidMesh.matrixWorld);
        p.pin.x -= _v.x; p.pin.y -= _v.y; p.update(growth.now, 0);
      }
      plants.push(p);
      return p;
    },
    clearGarden: () => clearGarden(), syncLook,
    // the openness (0 closed ... 1 open) every flower has right now: with one shared breath they are all the same
    openness: () => plants.filter((p) => p.isFlower && !p.crumbled).map((p) => opennessAt(p.tt(growth.now))), get sim() { return { W: SIM_W, H: SIM_H, now: growth.now, lastNow }; } };
  return api;
}
