// Page 7 – Lily look. One lily, breathing, with the "frosted glass" look on top:
//  1. the lily is rendered as usual, with its depth
//  2. blur by depth: the image is blurred in 3 steps (a small "pyramid"); every pixel picks how blurred it is
//     from its distance to the focus plane, so parts close to the "glass" stay sharp and parts further back
//     go soft and pale (this is the depth-layers idea, done per pixel)
//  3. grading on top: background, exposure, contrast, saturation, warmth, fade, split toning, glow
//  4. breathing: the flower opens (breath in) and closes (breath out), with motion blur like a long exposure:
//     every frame the flower is drawn several times along the last moment of its movement and those copies are
//     blended together (newest strongest), so moving petals leave soft trails
// Everything has a slider in the panel. Drag to turn the flower, scroll to zoom.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import GUI from 'lil-gui';
import { FLOWER_PARAMS, defaults } from '../lily/params.js';
import { Lily } from '../lily/Lily.js';
import { uniforms as sharedUniforms } from '../lily/materials.js';
import './look.css';

const STORAGE_KEY = 'flowers-web-look-v1';

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
  'Glow': 0.35,
  // breathing
  'Breathing': true,
  'Breath In (s)': 3,
  'Breath Out (s)': 3,
  'Breathing Amount': 0.25,
  'Breath Turn': 18,          // degrees the flower turns with every breath (makes the trails sweep)
  'Trail Length (s)': 1.0,
  'Trail Copies': 12,
  'Trail Fade': 0.6,
};

const QUAD_VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// adds one copy of the flower into the long exposure
const ADD_FRAG = /* glsl */ `uniform sampler2D tInput; uniform float uWeight; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tInput, vUv) * uWeight; }`;

// 1. circle of confusion: how blurred each pixel should be (0..1), from its depth
const COC_FRAG = /* glsl */ `
  #include <packing>
  uniform sampler2D tColor, tDepth; uniform float uNear, uFar, uFocus, uRange, uBase, uBehind;
  varying vec2 vUv;
  void main(){
    float a = texture2D(tColor, vUv).a;
    float d = -perspectiveDepthToViewZ(texture2D(tDepth, vUv).x, uNear, uFar);
    float off = d - uFocus;
    if (uBehind > 0.5) off = max(off, 0.0);
    float coc = clamp(uBase + abs(off) / uRange, 0.0, 1.0);
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
  const params = { ...defaults(FLOWER_PARAMS), ...LOOK_DEFAULTS };
  // softer starting point for this look: peach petals, fewer, a bit more open
  Object.assign(params, { 'Blossom Hue': 0.03, 'Blossom Saturation': 0.4, 'Blossom Value': 0.95, 'Spot Amount': 0 });
  try { Object.assign(params, JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')); } catch { /* no storage */ }
  const save = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(params)); } catch { /* ignore */ } };
  const flowerDefaults = defaults(FLOWER_PARAMS);

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
  const lilyParams = { ...params };
  const lily = new Lily(lilyParams, u);
  scene.add(lily);
  function rebuildLily() {
    Object.assign(lilyParams, params);
    if (!params['Show Stem + Leaves']) { lilyParams['Stem Length'] = 0; lilyParams['Leaf Count'] = 0; }
    lily.rebuild();
    lily.points.visible = lily.wire.visible = false;
    if (lily.sparkles) lily.sparkles.visible = false;
    lily.solidMat.transparent = false;
    lily.solidMat.opacity = params['Petal Opacity'];        // alpha hash: see-through petals, smoothed by the blur
    dirty = true;
  }

  // render targets
  const rt = (w, h, depth = false) => {
    const t = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: depth });
    if (depth) { t.depthTexture = new THREE.DepthTexture(w, h); t.depthTexture.type = THREE.UnsignedIntType; }
    return t;
  };
  let sceneRT, accumRT, cocRT, b1, b2, b3, tmp1, tmp2, tmp3, cocB, cocTmp;
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  const quadScene = new THREE.Scene(); quadScene.add(quad);
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const cocMat = new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: COC_FRAG,
    uniforms: { tColor: { value: null }, tDepth: { value: null }, uNear: { value: 0.1 }, uFar: { value: 50 }, uFocus: { value: 6 }, uRange: { value: 1.5 }, uBase: { value: 0 }, uBehind: { value: 0 } } });
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

  let W = 1, H = 1, dirty = true;
  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    renderer.setSize(W, H, false);
    camera.aspect = W / H; camera.updateProjectionMatrix();
    const pr = renderer.getPixelRatio(), w = Math.round(W * pr), h = Math.round(H * pr);
    for (const t of [sceneRT, accumRT, cocRT, b1, b2, b3, tmp1, tmp2, tmp3, cocB, cocTmp]) t?.dispose();
    sceneRT = rt(w, h, true); accumRT = rt(w, h); cocRT = rt(w, h);
    b1 = rt(w >> 1, h >> 1); tmp1 = rt(w >> 1, h >> 1);
    b2 = rt(w >> 2, h >> 2); tmp2 = rt(w >> 2, h >> 2);
    b3 = rt(w >> 3, h >> 3); tmp3 = rt(w >> 3, h >> 3);
    cocB = rt(w >> 3, h >> 3); cocTmp = rt(w >> 3, h >> 3);
    finalMat.uniforms.uRes.value.set(w, h);
    dirty = true;
  }

  function render(t = performance.now() / 1000) {
    // 1. the flower (transparent background) + depth. While it breathes: a long exposure of several copies
    let colorRT = sceneRT;
    const moving = params['Breathing'] && params['Breathing Amount'] + params['Breath Turn'] > 0;
    if (moving && params['Trail Length (s)'] > 0 && params['Trail Copies'] > 1) {
      const n = Math.round(params['Trail Copies']), k = params['Trail Fade'] * 3;
      let sum = 0; const w = [];
      for (let i = 0; i < n; i++) { w.push(Math.pow((i + 1) / n, k)); sum += w[i]; }
      renderer.setRenderTarget(accumRT); renderer.clear();
      for (let i = 0; i < n; i++) {                      // oldest first, the last one is "now" (its depth is used below)
        poseAt(t - params['Trail Length (s)'] * (1 - i / (n - 1)));
        renderer.setRenderTarget(sceneRT); renderer.clear(); renderer.render(scene, camera);
        addMat.uniforms.tInput.value = sceneRT.texture; addMat.uniforms.uWeight.value = w[i] / sum;
        quad.material = addMat; renderer.setRenderTarget(accumRT); renderer.render(quadScene, quadCam);
      }
      colorRT = accumRT;
    } else {
      if (moving) poseAt(t);
      renderer.setRenderTarget(sceneRT); renderer.clear(); renderer.render(scene, camera);
    }
    // 2. how blurred each pixel should be
    const camDist = camera.position.distanceTo(controls.target);
    cocMat.uniforms.tColor.value = colorRT.texture; cocMat.uniforms.tDepth.value = sceneRT.depthTexture;
    cocMat.uniforms.uNear.value = camera.near; cocMat.uniforms.uFar.value = camera.far;
    cocMat.uniforms.uFocus.value = camDist + params['Focus Distance'];
    cocMat.uniforms.uRange.value = params['Depth Range'];
    cocMat.uniforms.uBase.value = params['Base Blur'];
    cocMat.uniforms.uBehind.value = params['Only Behind Focus'] ? 1 : 0;
    pass(cocMat, cocRT);
    blur(cocRT, cocTmp, cocB, 2.0);
    // 3. blur pyramid
    blur(colorRT, tmp1, b1, 1.6);
    blur(b1, tmp2, b2, 1.8);
    blur(b2, tmp3, b3, 2.2);
    // 4. final image
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
  ff.add(params, 'Blossom Hue', 0, 1, 0.005).name('Colour (hue)').onChange(() => { save(); Object.assign(lilyParams, params); lily.updateColour(); dirty = true; });
  ff.add(params, 'Blossom Saturation', 0, 1, 0.01).name('Colour (saturation)').onChange(() => { save(); Object.assign(lilyParams, params); lily.updateColour(); dirty = true; });
  ff.add(params, 'Blossom Value', 0, 1, 0.01).name('Colour (brightness)').onChange(() => { save(); Object.assign(lilyParams, params); lily.updateColour(); dirty = true; });
  ff.add(params, 'Petal Opacity', 0.2, 1, 0.01).name('Petal opacity').onChange(onFlower);
  ff.add(params, 'Show Stem + Leaves').name('Stem + leaves').onChange(onFlower);

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
  fbr.add(params, 'Breathing').name('Breathe (open + close)').onChange((v) => { save(); if (!v) { lily.setBloom(params['Flower Blooming']); lily.rotation.y = 0; } dirty = true; });
  fbr.add(params, 'Breath In (s)', 1, 10, 0.1).name('Breath in (opens), s').onChange(onLook);
  fbr.add(params, 'Breath Out (s)', 1, 10, 0.1).name('Breath out (closes), s').onChange(onLook);
  fbr.add(params, 'Breathing Amount', 0, 0.5, 0.01).name('How much it opens/closes').onChange(onLook);
  fbr.add(params, 'Breath Turn', 0, 45, 0.5).name('Turn with the breath (°)').onChange(onLook);
  const fm = gui.addFolder('Motion blur (trails)');
  fm.add(params, 'Trail Length (s)', 0, 2, 0.01).name('Trail length (s, 0 = off)').onChange(onLook);
  fm.add(params, 'Trail Copies', 2, 32, 1).name('Copies (smoother = slower)').onChange(onLook);
  fm.add(params, 'Trail Fade', 0, 1, 0.01).name('Trail fade (0 = even)').onChange(onLook);

  const actions = {
    'Reset view': () => { resetView(); dirty = true; },
    'Save image (PNG)': () => {
      render();
      const a = document.createElement('a');
      a.download = `lily-look-${Date.now()}.png`; a.href = canvas.toDataURL('image/png'); a.click();
    },
    'Copy settings (JSON)': async () => { try { await navigator.clipboard.writeText(JSON.stringify(params, null, 2)); } catch { console.log(JSON.stringify(params, null, 2)); } },
    'Reset settings': () => {
      Object.assign(params, flowerDefaults, LOOK_DEFAULTS, { 'Blossom Hue': 0.03, 'Blossom Saturation': 0.4, 'Blossom Value': 0.95, 'Spot Amount': 0 });
      save(); gui.controllersRecursive().forEach((c) => c.updateDisplay()); rebuildLily();
    },
  };
  for (const k of Object.keys(actions)) gui.add(actions, k);

  // ---------------------------------------------------------------- loop (only renders when something changed)
  let running = false, raf = 0;
  // breathing: open on the breath in, close on the breath out (smooth at both ends)
  const t0 = performance.now() / 1000;
  function openAt(t) {                                // 0 = closed, 1 = open
    const tin = params['Breath In (s)'], tout = params['Breath Out (s)'];
    const ph = (((t - t0) % (tin + tout)) + (tin + tout)) % (tin + tout);
    return ph < tin ? 0.5 - 0.5 * Math.cos(Math.PI * ph / tin) : 0.5 + 0.5 * Math.cos(Math.PI * (ph - tin) / tout);
  }
  function poseAt(t) {                                 // the flower at moment t: how open, how far turned
    const open = openAt(t), amt = params['Breathing Amount'];
    lily.setBloom(Math.min(1, Math.max(0, params['Flower Blooming'] - amt / 2 + amt * open)));
    lily.rotation.y = THREE.MathUtils.degToRad(params['Breath Turn']) * (open - 0.5);
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
