import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import GUI from 'lil-gui';

import { FLOWER_PARAMS, EFFECT_PARAMS, FIBRE_PARAMS, FIBRE_VERSION, defaults } from './lily/params.js';
import { Fibres, fibreUniforms } from './lily/fibres.js';
import { Lily } from './lily/Lily.js';
import { uniforms } from './lily/materials.js';
import './style.css';

// ------------------------------------------------------------------ settings (saved in this browser)
const STORAGE_KEY = 'flowers-web-settings-v1';
const DEFAULTS = { ...defaults(FLOWER_PARAMS), ...defaults(EFFECT_PARAMS), ...defaults(FIBRE_PARAMS), 'Auto Play': true, Style: 1 };
const params = { ...DEFAULTS };
try { Object.assign(params, JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')); } catch { /* no storage */ }
if (params._fibreVersion !== FIBRE_VERSION) {           // new style 2 defaults: replace old saved style 2 values only
  Object.assign(params, defaults(FIBRE_PARAMS)); params._fibreVersion = FIBRE_VERSION;
}
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
scene.add(swayGroup);

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
  const fu = fibreUniforms;
  fu.uLen.value = params['Strand Length']; fu.uHalo.value = params['Silhouette Halo'];
  fu.uWiggle.value = params['Wiggle']; fu.uWiggleSpeed.value = params['Wiggle Speed']; fu.uShimmer.value = params['Shimmer'];
  fu.uOpacity.value = params['Strand Opacity']; fu.uTipWhite.value = params['Tip Whiteness'];
  fu.uDustDist.value = params['Dust Distance']; fu.uDustSpeed.value = params['Dust Speed'];
  fu.uDustOpacity.value = params['Dust Opacity']; fu.uDustSize.value = params['Dust Size'];
  fu.uThreadOpacity.value = params['Thread Opacity'];
  fu.uPixelRatio.value = renderer.getPixelRatio();
}
applyEffectParams();

// ------------------------------------------------------------------ timeline: build-up, then breathing
const clock = new THREE.Clock();
let buildStart = 0;                 // seconds
let breathStart = null;
let lastBloom = null;
const replay = () => { buildStart = clock.getElapsedTime(); breathStart = null; lastBloom = null; lily.rebuild(); };
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
  'Reset everything': () => { const st = params.Style; Object.assign(params, DEFAULTS); params.Style = st; params._fibreVersion = FIBRE_VERSION; save(); lily.rebuild(); applyEffectParams(); replay(); gui.controllersRecursive().forEach((c) => c.updateDisplay()); },
};

gui.add(actions, 'Replay build-up');
gui.add(params, 'Auto Play').name('Auto play (build + breathe)').onChange((v) => { save(); if (v) replay(); });
gui.add(info, 'vertices').name('Vertices').disable();

const folders = {};
function addGroup(groups, onChange, closed = []) {
  for (const [folderName, entries] of Object.entries(groups)) {
    const f = gui.addFolder(folderName);
    folders[folderName] = f;
    for (const [name, [, min, max, step]] of Object.entries(entries)) {
      const c = f.add(params, name, min, max, step).onChange(() => { onChange(name); save(); });
      if (name === 'Build Progress') c.listen();          // moves while the animation plays
    }
    if (closed.includes(folderName)) f.close();
  }
}
const flowerRebuild = (name) => {
  if (name.startsWith('Blossom') || name.startsWith('Spot')) lily.updateColour();
  else lily.rebuild();
  info.vertices = String(lily.vertexCount);
};
addGroup(FLOWER_PARAMS, flowerRebuild, ['Petals', 'Colour', 'Stamen & Pistil', 'Stem', 'Leaves', 'Detail (low = faster)']);
addGroup(EFFECT_PARAMS, (name) => {
  if (name === 'Build Progress') params['Auto Play'] = false;    // dragging it yourself stops the auto play
  if (name === 'Sparkle Count') lily.rebuild();
  applyEffectParams();
}, ['Look']);
addGroup(FIBRE_PARAMS, () => applyEffectParams());     // fibres resample themselves when counts change
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
  if (e.key === '1' || e.key === '2') setStyle(Number(e.key));  // 1 / 2 switch the style
});

// ------------------------------------------------------------------ styles (buttons at the top)
const styleButtons = [...document.querySelectorAll('#styles button')];
function setStyle(n) {
  params.Style = n; save();
  styleButtons.forEach((b) => b.classList.toggle('active', Number(b.dataset.style) === n));
  folders['Build-up'].show(n === 1);
  folders['2 · Fibres'].show(n === 2);
  if (n === 2) folders['2 · Fibres'].open();
  params['Auto Play'] = true;
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
  replay();
}
styleButtons.forEach((b) => b.addEventListener('click', () => setStyle(Number(b.dataset.style))));

// ------------------------------------------------------------------ loop
function frame() {
  const t = clock.getElapsedTime();
  uniforms.uTime.value = t;

  if (params.Style === 2) styleFibres(t);
  else styleBuildUp(t);

  // gentle sway so it never stands completely still
  const sw = params['Sway'] * 0.04;
  swayGroup.rotation.z = Math.sin(t * 0.37) * sw;
  swayGroup.rotation.x = Math.sin(t * 0.29 + 1.3) * sw * 0.6;

  controls.update();
  composer.render();
  requestAnimationFrame(frame);
}

// ---- style 1: points -> wireframe -> solid, then breathing (unchanged)
function styleBuildUp(t) {
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
  uniforms.uCoreAlpha.value = S(p, 0.35, 0.9) * params['Core Opacity'];
  uniforms.uCoreBright.value = params['Core Brightness'];
  uniforms.uPetalGlow.value = params['Core Glow'] * S(p, 0.35, 1);         // the flower glows from inside
  bloomPass.strength = params['Glow Strength']; bloomPass.radius = params['Glow Radius']; bloomPass.threshold = params['Glow Threshold'];
  swayGroup.scale.setScalar(0.75 + 0.25 * (1 - Math.pow(1 - p, 3)));      // grows a little while it appears

  const open = params['Flower Blooming'];
  let bloom = 0.15 + (open - 0.15) * ease(S(p, 0.15, 1));                  // starts closed, opens up
  let breath = 0;
  if (params['Auto Play'] && breathStart !== null) {
    const bt = t - breathStart;
    breath = Math.min(bt / 2, 1) * Math.sin((bt / params['Breath Length (s)']) * Math.PI * 2);
    bloom = open + params['Breathing Amount'] * breath;
  }
  bloom = Math.min(Math.max(bloom, 0), 1);
  if (bloom !== lastBloom) { lily.setBloom(bloom); lastBloom = bloom; }
  fibreUniforms.uBreath.value = params['Fibre Breathing'] * 0.5 * breath;  // fibres stretch when breathing in
  fibreUniforms.uTime.value = t;
  fibres.update();
}

setStyle(params.Style === 2 ? 2 : 1);
frame();

// handy for testing in the browser console, e.g. lilyApp.params['Build Progress'] = 0.5
window.lilyApp = { params, lily, fibres, replay, setStyle };
