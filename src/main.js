import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import GUI from 'lil-gui';

import { FLOWER_PARAMS, EFFECT_PARAMS, FIBRE_PARAMS, FIBRE_VERSION, BREATH_EXCLUDE, BREATH_CURVES, DEFAULT_BREATH_ANIMS, HIDDEN, TRACK_PARAMS, defaults, OUTLINE_PARAMS } from './lily/params.js';
import { Tracking } from './lily/tracking.js';
import { createRootsPage } from './roots/growth.js';
import { createRootsPage as createRootsPageV2 } from './roots-v2/growth.js';   // working copy of page 4
import { createWaterPage } from './water/water.js';                         // page 8: soil, water, seeds
import { Fibres, fibreUniforms } from './lily/fibres.js';
import { OutlineParticles, outlineUniforms } from './lily/outline.js';
import { Lily } from './lily/Lily.js';
import { uniforms } from './lily/materials.js';
import './style.css';

// ------------------------------------------------------------------ settings (saved in this browser)
const STORAGE_KEY = 'flowers-web-settings-v1';
const clone = (o) => JSON.parse(JSON.stringify(o));
const DEFAULTS = { ...defaults(FLOWER_PARAMS), ...defaults(EFFECT_PARAMS), ...defaults(FIBRE_PARAMS), ...defaults(TRACK_PARAMS), ...defaults(OUTLINE_PARAMS), 'Auto Play': true, Style: 1, 'Breath Reverse': false };
const params = { ...DEFAULTS, _breathAnims: clone(DEFAULT_BREATH_ANIMS) };
try { Object.assign(params, JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')); } catch { /* no storage */ }
if (params._fibreVersion !== FIBRE_VERSION) {           // new style 2 defaults: replace old saved style 2 values only
  Object.assign(params, defaults(FIBRE_PARAMS)); params._fibreVersion = FIBRE_VERSION;
}
if (!params._breathAnims || params['Dust Distance (breathing in)'] !== undefined) {   // settings saved before the breathing panel existed
  const a = params._breathAnims = { ...clone(DEFAULT_BREATH_ANIMS), ...(params._breathAnims || {}) };
  if (params['Dust Distance (breathing in)'] !== undefined) a['Dust Distance'].in = params['Dust Distance (breathing in)'];
  if (params['Dust Distance (breathing out)'] !== undefined) a['Dust Distance'].out = params['Dust Distance'] = params['Dust Distance (breathing out)'];
  if (params['Particles Out On Inhale'] !== undefined) params['Breath Reverse'] = params['Particles Out On Inhale'];
  for (const old of ['Dust Distance (breathing in)', 'Dust Distance (breathing out)', 'Dust Opacity In Flower', 'Particles Out On Inhale', 'Core Glow Pulse', 'Fibre Breathing']) delete params[old];
}
for (const n of HIDDEN) { params[n] = DEFAULTS[n]; delete params._breathAnims?.[n]; }   // hidden settings stay at their default
const save = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(params)); } catch { /* ignore */ } };

// ------------------------------------------------------------------ renderer, scene, camera
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.AgXToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050706);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.15;

const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.05, 100);
camera.position.set(0, -0.2, 6.6);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, -0.75, 0);
controls.enableDamping = true;
controls.update();

// lights: soft key from the front, cool rim light from behind (makes the petals glow at the edges)
scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x101810, 0.2));
const key = new THREE.DirectionalLight(0xfff2ea, 1.5); key.position.set(-3, 4, 5); scene.add(key);
const rim = new THREE.DirectionalLight(0xbcd2ff, 1.8); rim.position.set(2, 3, -5); scene.add(rim);
const fill = new THREE.DirectionalLight(0xffe0ea, 0.6); fill.position.set(4, -1, 3); scene.add(fill);

// ------------------------------------------------------------------ the flower
const lily = new Lily(params);
const swayGroup = new THREE.Group();
swayGroup.add(lily);
const fibres = new Fibres(lily, params);          // style 2
swayGroup.add(fibres);
const outline = new OutlineParticles(params);      // style 7
swayGroup.add(outline);
scene.add(swayGroup);
const tracking = new Tracking(lily, camera, renderer, params);   // style 3 (2D overlay)
const rootsPage = createRootsPage(params);                           // page 4 (its own page, camera + roots)
const rootsPageV2 = createRootsPageV2(params);                       // page 6: a copy of page 4 to try changes on
const waterPage = createWaterPage();                                 // page 8: its own page

// ------------------------------------------------------------------ glow
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.7, 0.4, 0.85);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h; camera.updateProjectionMatrix();
  renderer.setSize(w, h); composer.setSize(w, h);
  uniforms.uPxScale.value = (h * renderer.getPixelRatio()) / (2 * Math.tan((camera.fov * Math.PI) / 360));
  outlineUniforms.uPixelRatio.value = renderer.getPixelRatio();
}
window.addEventListener('resize', resize);
resize();

// ------------------------------------------------------------------ apply settings to uniforms / passes
function applyEffectParams() {
  uniforms.uWireDelay.value = params['Wire Delay'];
  uniforms.uSolidDelay.value = params['Solid Delay'];
  uniforms.uFade.value = params['Fade Length'];
  uniforms.uPointSize.value = params['Point Size'];
  uniforms.uPointBright.value = params['Point Brightness'];
  uniforms.uWireBright.value = params['Wire Brightness'];
  uniforms.uSparkleSize.value = params['Sparkle Size'];
  uniforms.uPetalGlow.value = params['Petal Glow'];
  bloomPass.strength = params['Bloom Strength'];
  bloomPass.radius = params['Bloom Radius'];
  bloomPass.threshold = params['Bloom Threshold'];
  renderer.toneMappingExposure = params['Exposure'];
  applyFibreParams(params);
  const ou = outlineUniforms;                         // style 7
  ou.uSpread.value = params['Outline Spread']; ou.uSize.value = params['Outline Dot Size (px)'];
  ou.uBright.value = params['Outline Brightness']; ou.uAfter.value = params['Outline After Build'];
  ou.uTwinkle.value = params['Outline Twinkle']; ou.uDrift.value = params['Outline Drift'];
}
// style 2 values (called every frame with the breathing values mixed in)
function applyFibreParams(v) {
  const fu = fibreUniforms;
  fu.uLen.value = v['Strand Length']; fu.uHalo.value = v['Silhouette Halo'];
  fu.uWiggle.value = v['Wiggle']; fu.uWiggleSpeed.value = v['Wiggle Speed']; fu.uShimmer.value = v['Shimmer'];
  fu.uOpacity.value = v['Strand Opacity']; fu.uTipWhite.value = v['Tip Whiteness'];
  fu.uDustDist.value = v['Dust Distance']; fu.uDustSpeed.value = v['Dust Speed'];
  fu.uDustOpacity.value = v['Dust Opacity']; fu.uDustSize.value = v['Dust Size'];
  fu.uThreadOpacity.value = v['Thread Opacity'];
  fu.uPixelRatio.value = renderer.getPixelRatio();
}
applyEffectParams();

// ------------------------------------------------------------------ timeline: build-up, then breathing
const clock = new THREE.Clock();
let buildStart = 0;                 // seconds
let breathStart = null;
let lastBloom = null;
const replay = () => { buildStart = clock.getElapsedTime(); breathStart = null; lastBloom = null; lily.rebuild(); tracking.restart(); };
const ease = (x) => x * x * (3 - 2 * x);

// ------------------------------------------------------------------ slider panel
const gui = new GUI({ title: 'Lily settings' });
const info = { vertices: '' };
const actions = {
  'Replay build-up': () => { params['Auto Play'] = true; replay(); gui.controllersRecursive().forEach((c) => c.updateDisplay()); },
  'Copy settings (JSON)': async () => {
    const json = JSON.stringify(params, null, 2);
    try { await navigator.clipboard.writeText(json); alertSmall('Settings copied'); } catch { console.log(json); alertSmall('Settings printed in the console'); }
  },
  'Reset everything': () => {
    const st = params.Style; Object.assign(params, DEFAULTS); params.Style = st; params._fibreVersion = FIBRE_VERSION;
    params._breathAnims = clone(DEFAULT_BREATH_ANIMS); save();
    lily.rebuild(); applyEffectParams(); buildBreathUI(); replay(); gui.controllersRecursive().forEach((c) => c.updateDisplay());
  },
};

gui.add(actions, 'Replay build-up');
gui.add(params, 'Auto Play').name('Auto play (build + breathe)').onChange((v) => { save(); if (v) replay(); });
gui.add(info, 'vertices').name('Vertices').disable();

const folders = {}, controllers = {};
function addGroup(groups, onChange, closed = []) {
  for (const [folderName, entries] of Object.entries(groups)) {
    const f = gui.addFolder(folderName);
    folders[folderName] = f;
    for (const [name, [def, min, max, step]] of Object.entries(entries)) {
      if (HIDDEN.includes(name)) continue;
      const c = (typeof def === 'string' && def.startsWith('#') ? f.addColor(params, name) : f.add(params, name, min, max, step))
        .onChange(() => { onChange(name); save(); });
      controllers[name] = c;
      if (name === 'Build Progress') c.listen();          // moves while the animation plays
    }
    if (closed.includes(folderName)) f.close();
  }
}
const flowerRebuild = (name) => {
  if (name.startsWith('Blossom') || name.startsWith('Spot')) lily.updateColour();
  else { lily.rebuild(); outline.flowerChanged(); }
  info.vertices = String(lily.vertexCount);
};
addGroup(FLOWER_PARAMS, flowerRebuild, ['Petals', 'Colour', 'Stamen & Pistil', 'Stem', 'Leaves', 'Detail (low = faster)']);
addGroup(EFFECT_PARAMS, (name) => {
  if (name === 'Build Progress') params['Auto Play'] = false;    // dragging it yourself stops the auto play
  if (name === 'Sparkle Count') lily.rebuild();
  applyEffectParams();
}, ['Look']);
addGroup(FIBRE_PARAMS, () => applyEffectParams());     // fibres resample themselves when counts change

// ---- Breathing animation (style 2): any style 2 setting can get a 'breathing in' and 'breathing out' value
const FIBRE_RANGES = FIBRE_PARAMS['2 · Fibres'];
const animatable = Object.keys(FIBRE_RANGES).filter((n) => !BREATH_EXCLUDE.includes(n) && !HIDDEN.includes(n));
const breathFolder = gui.addFolder('Breathing animation');
folders['Breathing animation'] = breathFolder;
breathFolder.add(params, 'Breath Reverse').name('Reverse (in ↔ out)').onChange(save);
const picker = { setting: '' };
let pickCtrl, addBtn, animFolders = [];
function buildBreathUI() {
  animFolders.forEach((f) => f.destroy()); animFolders = [];
  pickCtrl?.destroy(); addBtn?.destroy();
  const free = animatable.filter((n) => !params._breathAnims[n]);
  if (!free.includes(picker.setting)) picker.setting = free[0] ?? '';
  pickCtrl = breathFolder.add(picker, 'setting', free).name('Setting');
  addBtn = breathFolder.add({ add: () => {
    const n = picker.setting; if (!n || params._breathAnims[n]) return;
    params._breathAnims[n] = { in: params[n], out: params[n], curve: 'Smooth' }; save(); buildBreathUI();
  } }, 'add').name('+ Animate with breath');
  for (const [name, a] of Object.entries(params._breathAnims)) {
    if (!FIBRE_RANGES[name]) continue;
    const [, min, max, step] = FIBRE_RANGES[name];
    const f = breathFolder.addFolder(`↕ ${name}`);
    f.add(a, 'in', min, max, step).name('Breathing in').onChange(save);
    f.add(a, 'out', min, max, step).name('Breathing out').onChange(save);
    f.add(a, 'curve', Object.keys(BREATH_CURVES)).name('Curve').onChange(save);
    f.add({ remove: () => { delete params._breathAnims[name]; save(); buildBreathUI(); } }, 'remove').name('Stop animating');
    animFolders.push(f);
  }
  for (const n of animatable) {                       // animated sliders are locked and marked
    const c = controllers[n]; if (!c) continue;
    const on = !!params._breathAnims[n];
    c.name(on ? `${n} ↕` : n); on ? c.disable() : c.enable();
  }
}
buildBreathUI();
addGroup(TRACK_PARAMS, () => {}, ['3 · Extra effects']);
addGroup(OUTLINE_PARAMS, () => applyEffectParams());
gui.add(actions, 'Copy settings (JSON)');
gui.add(actions, 'Reset everything');
info.vertices = String(lily.vertexCount);

function alertSmall(text) {
  const el = document.getElementById('toast');
  el.textContent = text; el.classList.add('show');
  clearTimeout(alertSmall.t); alertSmall.t = setTimeout(() => el.classList.remove('show'), 1600);
}
window.addEventListener('keydown', (e) => {
  if (e.key === 'h') gui.show(gui._hidden);                     // H hides the panel
  if (['1', '2', '3', '4', '5', '6', '7', '8'].includes(e.key)) setStyle(Number(e.key)); // 1–8 switch the style
});

// ------------------------------------------------------------------ styles (buttons at the top)
const styleButtons = [...document.querySelectorAll('#styles button')];
function setStyle(n) {
  params.Style = n; save();
  styleButtons.forEach((b) => b.classList.toggle('active', Number(b.dataset.style) === n));
  folders['Build-up'].show(n === 1 || n === 5 || n === 7);
  folders['7 · Outline particles'].show(n === 7);
  if (n === 7) folders['7 · Outline particles'].open();
  folders['2 · Fibres'].show(n === 2 || n === 5);
  folders['Breathing animation'].show(n === 2);
  folders['3 · Tracking'].show(n === 3); folders['3 · Extra effects'].show(n === 3);
  if (n === 3) folders['3 · Tracking'].open();
  if (n !== 3) tracking.clear();
  // pages 4 and 6 are separate pages: hide the 3D view and the panel, start the roots
  const isRoots = n === 4 || n === 6 || n === 8;   // (8 = water page)
  renderer.domElement.style.display = isRoots ? 'none' : '';
  document.getElementById('hint').style.display = isRoots ? 'none' : '';
  isRoots ? gui.hide() : gui.show();
  n === 4 ? rootsPage.show() : rootsPage.hide();
  n === 6 ? rootsPageV2.show() : rootsPageV2.hide();
  n === 8 ? waterPage.show() : waterPage.hide();
  if (isRoots) return;
  if (n === 2 || n === 5) folders['2 · Fibres'].open();
  params['Auto Play'] = true;
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
  replay();
}
styleButtons.forEach((b) => b.addEventListener('click', () => setStyle(Number(b.dataset.style))));

// ------------------------------------------------------------------ loop
function frame() {
  const t = clock.getElapsedTime();
  uniforms.uTime.value = t;

  const dt = Math.min(t - (frame.last ?? t), 0.1); frame.last = t;
  if (params.Style === 4 || params.Style === 6 || params.Style === 8) { requestAnimationFrame(frame); return; }     // roots page runs its own loop
  outline.visible = params.Style === 7;
  if (params.Style === 7) styleOutline(t);
  else if (params.Style === 5) styleBuildDust(t);
  else if (params.Style === 3) styleTracking(t, dt);
  else if (params.Style === 2) styleFibres(t);
  else styleBuildUp(t);

  // gentle sway so it never stands completely still
  const sw = params['Sway'] * 0.04;
  swayGroup.rotation.z = Math.sin(t * 0.37) * sw;
  swayGroup.rotation.x = Math.sin(t * 0.29 + 1.3) * sw * 0.6;

  controls.update();
  composer.render();
  if (params.Style === 3) tracking.draw(renderer.domElement);   // boxes on top, right after the 3D frame
  requestAnimationFrame(frame);
}

// ---- style 1: points -> wireframe -> solid, then breathing (unchanged)
function styleBuildUp(t) {
  uniforms.uSolidDelay.value = params['Solid Delay'];      // (style 7 uses its own value)
  lily.points.visible = lily.wire.visible = lily.sparkles.visible = true;
  fibres.visible = false;
  swayGroup.scale.setScalar(1);
  uniforms.uCoreAlpha.value = 1; uniforms.uCoreBright.value = 1;
  uniforms.uPetalGlow.value = params['Petal Glow'];
  bloomPass.strength = params['Bloom Strength']; bloomPass.radius = params['Bloom Radius']; bloomPass.threshold = params['Bloom Threshold'];

  let progress = params['Build Progress'];
  if (params['Auto Play']) {
    const p = Math.min((t - buildStart) / params['Build Duration (s)'], 1);
    progress = ease(p);
    params['Build Progress'] = progress;
    if (p >= 1 && breathStart === null) breathStart = t;
  }
  uniforms.uProgress.value = progress;

  // breathing: the petals slowly open and close once the flower is built
  if (params['Auto Play'] && breathStart !== null && params['Breathing Amount'] > 0) {
    const bt = t - breathStart;
    const fadeIn = Math.min(bt / 2, 1);                                    // starts gently, no jump
    const bloom = params['Flower Blooming'] + params['Breathing Amount'] * fadeIn * Math.sin((bt / params['Breath Length (s)']) * Math.PI * 2);
    lily.setBloom(Math.min(Math.max(bloom, 0), 1));
  }

  // sparkles: busiest in the middle of the build, a few stay while it breathes
  const idle = params['Idle Sparkles'] * THREE.MathUtils.smoothstep(progress, 0.9, 1);
  uniforms.uSparkleAmount.value = Math.max(Math.sin(Math.PI * progress), idle);
}

// ---- style 2: fibres grow out while the flower scales up and opens, then it breathes
function styleFibres(t) {
  lily.points.visible = lily.wire.visible = lily.sparkles.visible = false;
  fibres.visible = true;
  uniforms.uProgress.value = 1;                     // the flower itself is fully there, only dimmed
  uniforms.uSparkleAmount.value = 0;

  let p = params['Build Progress'];
  if (params['Auto Play']) {
    p = Math.min((t - buildStart) / params['Intro Duration (s)'], 1);
    params['Build Progress'] = p;
    if (p >= 1 && breathStart === null) breathStart = t;
  }
  const S = THREE.MathUtils.smoothstep;
  fibreUniforms.uReveal.value = ease(p);
  swayGroup.scale.setScalar(0.75 + 0.25 * (1 - Math.pow(1 - p, 3)));      // grows a little while it appears

  const open = params['Flower Blooming'];
  let bloom = 0.15 + (open - 0.15) * ease(S(p, 0.15, 1));                  // starts closed, opens up
  let spread = 1;                                   // 1 = breathing out, 0 = breathing in
  if (params['Auto Play'] && breathStart !== null) {
    const bt = t - breathStart;
    const fade = Math.min(bt / 2, 1);                                      // starts gently, no jump
    const wave = Math.sin((bt / params['Breath Length (s)']) * Math.PI * 2);  // > 0 breathing in (petals open)
    bloom = open + params['Breathing Amount'] * fade * wave;
    spread = 1 - fade * (0.5 + 0.5 * (params['Breath Reverse'] ? -wave : wave));
  }
  bloom = Math.min(Math.max(bloom, 0), 1);
  if (bloom !== lastBloom) { lily.setBloom(bloom); lastBloom = bloom; }

  // mix in the breathing values ('Breathing animation' panel)
  const v = { ...params };
  for (const [name, a] of Object.entries(params._breathAnims)) {
    const curve = BREATH_CURVES[a.curve] ?? BREATH_CURVES.Smooth;
    v[name] = THREE.MathUtils.lerp(a.in, a.out, curve(spread));
  }
  applyFibreParams(v);
  uniforms.uCoreAlpha.value = S(p, 0.35, 0.9) * v['Core Opacity'];
  uniforms.uCoreBright.value = v['Core Brightness'];
  uniforms.uPetalGlow.value = v['Core Glow'] * S(p, 0.35, 1);             // the flower glows from inside
  bloomPass.strength = v['Glow Strength']; bloomPass.radius = v['Glow Radius']; bloomPass.threshold = v['Glow Threshold'];

  // animated counts: sample the most that is needed once, then show a share of it
  const most = (n) => { const a = params._breathAnims[n]; return Math.max(1, Math.round(a ? Math.max(a.in, a.out) : params[n])); };
  const counts = { strands: most('Strand Count'), dust: most('Dust Count') };
  fibreUniforms.uStrandFraction.value = v['Strand Count'] / counts.strands;
  fibreUniforms.uDustFraction.value = v['Dust Count'] / counts.dust;
  fibreUniforms.uBreath.value = 0;
  fibreUniforms.uTime.value = t;
  fibres.update(counts);
}

// ---- style 3: the flower appears and breathes, selection boxes find and follow its parts
function styleTracking(t, dt) {
  lily.points.visible = lily.wire.visible = lily.sparkles.visible = false;
  uniforms.uProgress.value = 1;
  uniforms.uSparkleAmount.value = 0;
  swayGroup.scale.setScalar(1);

  let p = params['Build Progress'];
  if (params['Auto Play']) {
    p = Math.min((t - buildStart) / params['Tracking Intro (s)'], 1);
    params['Build Progress'] = p;
    if (p >= 1 && breathStart === null) breathStart = t;
  }
  const S = THREE.MathUtils.smoothstep;
  uniforms.uCoreAlpha.value = S(p, 0, 0.6);                               // the flower fades in
  uniforms.uCoreBright.value = 1;
  uniforms.uPetalGlow.value = params['Petal Glow'];                        // same look as style 1 ('Look' panel)
  bloomPass.strength = params['Bloom Strength']; bloomPass.radius = params['Bloom Radius']; bloomPass.threshold = params['Bloom Threshold'];

  const open = params['Flower Blooming'];
  let bloom = open - 0.25 * (1 - ease(p));                                 // opens a little while it appears
  if (params['Auto Play'] && breathStart !== null) {
    const bt = t - breathStart;
    bloom = open + params['Breathing Amount'] * Math.min(bt / 2, 1) * Math.sin((bt / params['Breath Length (s)']) * Math.PI * 2);
  }
  bloom = Math.min(Math.max(bloom, 0), 1);
  if (bloom !== lastBloom) { lily.setBloom(bloom); lastBloom = bloom; }

  // optional: the glittering dust from style 2 (without the streaks)
  fibres.visible = params['Glitter Dust'];
  if (fibres.visible) {
    applyFibreParams(params);
    fibreUniforms.uOpacity.value = 0; fibreUniforms.uReveal.value = ease(p);
    fibreUniforms.uStrandFraction.value = 0; fibreUniforms.uDustFraction.value = 1;
    fibreUniforms.uTime.value = t;
    fibres.update({ strands: 1, dust: params['Dust Count'] });
  }

  tracking.update(dt, S(p, 0.1, 0.7));                                    // boxes start while the flower appears
}

// ---- style 5: the build-up from style 1, with dust from style 2 streaming out of the vertices
function styleBuildDust(t) {
  styleBuildUp(t);                                   // points -> wireframe -> flower, breathing (unchanged)
  fibres.visible = true;

  // breathing in/out (same rhythm as the petals), for the 'Breathing animation' values of the dust
  let spread = 1;
  if (params['Auto Play'] && breathStart !== null) {
    const bt = t - breathStart;
    const wave = Math.sin((bt / params['Breath Length (s)']) * Math.PI * 2);
    spread = 1 - Math.min(bt / 2, 1) * (0.5 + 0.5 * (params['Breath Reverse'] ? -wave : wave));
  }
  const v = { ...params };
  for (const [name, a] of Object.entries(params._breathAnims)) {
    const curve = BREATH_CURVES[a.curve] ?? BREATH_CURVES.Smooth;
    v[name] = THREE.MathUtils.lerp(a.in, a.out, curve(spread));
  }
  applyFibreParams(v);
  fibreUniforms.uOpacity.value = 0;                  // no streaks, only dust
  fibreUniforms.uStrandFraction.value = 0;
  fibreUniforms.uDustFraction.value = 1;
  fibreUniforms.uReveal.value = uniforms.uProgress.value;   // dust appears as the vertices appear
  fibreUniforms.uBreath.value = 0;
  fibreUniforms.uTime.value = t;
  fibres.update({ strands: 1, dust: Math.round(v['Dust Count']), atVertices: true });
}

// ---- style 7: particles trace the outlines (stem first, then leaves, petals base -> tip), then the flower appears
function styleOutline(t) {
  styleBuildUp(t);                                   // same timeline and breathing as style 1
  uniforms.uSolidDelay.value = params['Outline Lead'];
  lily.points.visible = lily.wire.visible = lily.sparkles.visible = false;
  fibres.visible = false;
  let bloom = params['Flower Blooming'];             // the outline follows the petals while they breathe
  if (params['Auto Play'] && breathStart !== null && params['Breathing Amount'] > 0) {
    const bt = t - breathStart;
    bloom += params['Breathing Amount'] * Math.min(bt / 2, 1) * Math.sin((bt / params['Breath Length (s)']) * Math.PI * 2);
  }
  outline.sync(Math.min(Math.max(bloom, 0), 1));
}

setStyle([1, 2, 3, 4, 5, 6, 7, 8].includes(params.Style) ? params.Style : 1);
frame();

// handy for testing in the browser console, e.g. lilyApp.params['Build Progress'] = 0.5
window.lilyApp = { params, lily, fibres, fibreUniforms, outline, tracking, replay, setStyle, buildBreathUI };
