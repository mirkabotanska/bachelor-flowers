// Page 8 – Water. Top view of soil with seeds. Where a light shines, water appears and creeps
// through the soil in streaks; seeds that get wet glow, root and sprout.
// Everything is generated in code: the soil, the water and the seeds (no images).
//
// How it works:
//  1. a small "wetness" texture (simulation) – every frame the lights add water to it, it spreads,
//     creeps along a slow flow field and dries out again
//  2. the display shader reads the wetness and draws soil, wet soil, water, streams and shine
//  3. the seeds are drawn on a 2D canvas on top; every few frames we read the wetness under each seed
import * as THREE from 'three';
import GUI from 'lil-gui';
import './water.css';
import dirtUrl from './dirt-bg-3000.jpg';   // smaller copy of dirt-bg.jpg (the 19 MB original is too heavy)

const STORAGE_KEY = 'flowers-web-water-v1';
const MAX_LIGHTS = 8;
const MAX_SEEDS = 16;
const SIM_WIDTH = 512;

const DEFAULTS = {
  // water
  'Brush Size': 0.07,
  'Water Amount': 1.6,
  'Drying Speed': 0.035,
  'Spread': 0.25,
  'Creep': 0.6,
  'Ragged Edges': 0.55,
  'Streams': 0.9,
  'Stream Thickness': 0.5,
  'Water Colour': '#a9c9e2',
  'Edge Colour': '#3d6a80',
  'Water Opacity': 0.75,
  'Shine': 0.6,
  'Distortion': 0.5,
  'Wet Darkening': 0.5,
  // soil
  'Soil Brightness': 1.0,
  'Background': 'Photo',          // 'Photo' (dirt-bg.jpg) or 'Generated'
  'Soil Scale': 1.0,
  // seeds
  'Seed Count': 8,
  'Seed Size': 1.0,
  'Water Needed': 0.25,
  'Grow Speed': 0.12,
  'Stay Grown (s)': 10,
  'Seed Glow': 0.8,
  // light
  'Show Light': true,
  'Use Camera': false,
  'Camera Threshold': 230,
  'Mirror Camera': true,
};

// ------------------------------------------------------------------ GLSL
const NOISE = /* glsl */ `
  vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec2 mod289(vec2 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec3 permute(vec3 x){return mod289(((x*34.0)+1.0)*x);}
  float snoise(vec2 v){
    const vec4 C=vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
    vec2 i=floor(v+dot(v,C.yy)); vec2 x0=v-i+dot(i,C.xx);
    vec2 i1=(x0.x>x0.y)?vec2(1.0,0.0):vec2(0.0,1.0);
    vec4 x12=x0.xyxy+C.xxzz; x12.xy-=i1; i=mod289(i);
    vec3 p=permute(permute(i.y+vec3(0.0,i1.y,1.0))+i.x+vec3(0.0,i1.x,1.0));
    vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0); m=m*m; m=m*m;
    vec3 x=2.0*fract(p*C.www)-1.0; vec3 h=abs(x)-0.5; vec3 ox=floor(x+0.5); vec3 a0=x-ox;
    m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);
    vec3 g; g.x=a0.x*x0.x+h.x*x0.y; g.yz=a0.yz*x12.xz+h.yz*x12.yw;
    return 130.0*dot(m,g);
  }
  float fbm(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<5;i++){ s+=a*snoise(p); p=p*2.03+17.1; a*=0.5; } return 0.5+0.5*s; }
  float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
`;

const QUAD_VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }`;

// 1. simulation: wetness in R
const SIM_FRAG = /* glsl */ `
  uniform sampler2D uPrev; uniform vec2 uTexel; uniform float uDt, uTime, uAspect;
  uniform float uDry, uSpread, uCreep, uAmount;
  uniform vec4 uLights[${MAX_LIGHTS}]; uniform int uCount;
  varying vec2 vUv;
  ${NOISE}
  void main(){
    vec2 p=vec2(vUv.x*uAspect,vUv.y);
    // slow flow field (curl of noise): the water creeps along it in streaks
    float e=0.01; vec2 q=p*2.2+vec2(0.0,uTime*0.015);
    float n1=snoise(q+vec2(0.0,e)), n2=snoise(q-vec2(0.0,e)), n3=snoise(q+vec2(e,0.0)), n4=snoise(q-vec2(e,0.0));
    vec2 curl=vec2(n1-n2,-(n3-n4))/(2.0*e);
    vec2 flowUv=vUv-curl*vec2(1.0/uAspect,1.0)*uCreep*uDt*0.004;
    float w=texture2D(uPrev,flowUv).r;
    // spread to the neighbours
    float avg=(texture2D(uPrev,vUv+vec2(uTexel.x,0.0)).r+texture2D(uPrev,vUv-vec2(uTexel.x,0.0)).r
              +texture2D(uPrev,vUv+vec2(0.0,uTexel.y)).r+texture2D(uPrev,vUv-vec2(0.0,uTexel.y)).r)*0.25;
    w+=(avg-w)*clamp(uSpread*uDt*12.0,0.0,1.0);
    // dry out (low spots in the ground stay wet longer)
    float ground=fbm(p*3.0);
    w-=uDry*uDt*(0.5+ground);
    // the lights add water, in a ragged shape
    for(int i=0;i<${MAX_LIGHTS};i++){
      if(i>=uCount) break;
      vec4 L=uLights[i];
      vec2 d=(vUv-L.xy)*vec2(uAspect,1.0);
      float b=exp(-dot(d,d)/(L.w*L.w));
      float rag=0.5+fbm(p*7.0+float(i)*3.1+uTime*0.05);
      w+=b*rag*uAmount*uDt*L.z;
    }
    gl_FragColor=vec4(clamp(w,0.0,1.6),0.0,0.0,1.0);
  }`;

// 2. probe: reads the wetness under every seed into one pixel each
const PROBE_FRAG = /* glsl */ `
  uniform sampler2D uWet; uniform vec2 uSeeds[${MAX_SEEDS}]; uniform float uR;
  varying vec2 vUv;
  void main(){
    int i=int(floor(vUv.x*${MAX_SEEDS}.0));
    vec2 s=vec2(0.0);
    for(int k=0;k<${MAX_SEEDS};k++){ if(k==i) s=uSeeds[k]; }
    float w=texture2D(uWet,s).r*0.4
      +(texture2D(uWet,s+vec2(uR,0.0)).r+texture2D(uWet,s-vec2(uR,0.0)).r
       +texture2D(uWet,s+vec2(0.0,uR)).r+texture2D(uWet,s-vec2(0.0,uR)).r)*0.15;
    gl_FragColor=vec4(clamp(w,0.0,1.0),0.0,0.0,1.0);
  }`;

// 3. display: soil + water
const VIEW_FRAG = /* glsl */ `
  uniform sampler2D uWet; uniform vec2 uTexel; uniform float uTime, uAspect;
  uniform float uRagged, uStreams, uStreamThin, uOpacity, uShine, uDistort, uWetDark, uSoilBright, uSoilScale;
  uniform sampler2D uDirt; uniform float uUsePhoto, uImgAspect;
  uniform vec3 uWaterCol, uEdgeCol;
  uniform vec4 uLights[${MAX_LIGHTS}]; uniform int uCount; uniform float uShowLight;
  varying vec2 vUv;
  ${NOISE}
  vec3 soil(vec2 p, out float h){
    h=fbm(p*4.0)*0.5+fbm(p*15.0)*0.3+snoise(p*45.0)*0.1+0.1;
    vec3 c=mix(vec3(0.085,0.055,0.04),vec3(0.23,0.155,0.105),h);
    // crumbs and little stones
    float crumb=smoothstep(0.55,0.8,snoise(p*85.0))*hash(floor(p*85.0));
    c=mix(c,vec3(0.42,0.31,0.22),crumb*0.7);
    // thin fibres / bits of straw
    float f1=pow(1.0-abs(snoise(p*vec2(28.0,9.0)+3.0)),16.0);
    float f2=pow(1.0-abs(snoise(p*vec2(8.0,30.0)-7.0)),18.0);
    c=mix(c,vec3(0.5,0.38,0.26),(f1+f2)*0.45*smoothstep(0.4,0.7,fbm(p*6.0)));
    // tiny bright specks
    float speck=step(0.985,hash(floor(p*260.0)));
    c+=speck*0.12;
    return c;
  }
  float waterAt(vec2 uv){ return texture2D(uWet,uv).r; }
  void main(){
    vec2 p=vec2(vUv.x*uAspect,vUv.y)*uSoilScale;
    float W=waterAt(vUv);
    // gradient of the wetness = slope of the water surface
    float wx=waterAt(vUv+vec2(uTexel.x,0.0))-waterAt(vUv-vec2(uTexel.x,0.0));
    float wy=waterAt(vUv+vec2(0.0,uTexel.y))-waterAt(vUv-vec2(0.0,uTexel.y));
    // organic shapes: warped noise for the edges, ridged noise for thin streams
    vec2 wp=p+0.35*vec2(fbm(p*1.8),fbm(p*1.8+5.2));
    float edgeN=fbm(wp*3.0)-0.5;
    float core=smoothstep(0.42,0.5,W+edgeN*uRagged);
    float inner=smoothstep(0.52,0.62,W+edgeN*uRagged);
    float thin=mix(30.0,6.0,uStreamThin);
    float r1=pow(1.0-abs(snoise(wp*2.3)),thin);
    float r2=pow(1.0-abs(snoise(wp*4.6+11.0)),thin*1.3);
    float streams=smoothstep(0.5,0.75,max(r1,r2*0.85)*smoothstep(0.008,0.22,W)*uStreams*1.4);
    float water=max(core,streams);
    float wet=smoothstep(0.0,0.35,W);
    // refraction: the soil under the water is shifted a little
    vec2 n2=vec2(wx,wy)*40.0+vec2(snoise(wp*9.0+uTime*0.3),snoise(wp*9.0-uTime*0.25))*0.25;
    vec2 shift=n2*0.01*uDistort*water;
    vec3 c;
    if(uUsePhoto>0.5){
      // photo: fills the screen (like background-size: cover), Soil Scale zooms in/out
      vec2 cuv=vUv-0.5;
      if(uAspect>uImgAspect) cuv.y*=uImgAspect/uAspect; else cuv.x*=uAspect/uImgAspect;
      cuv=cuv/uSoilScale+0.5+shift*vec2(1.0/uAspect,1.0)/uSoilScale;
      c=texture2D(uDirt,cuv).rgb*uSoilBright;
    } else {
      float h; c=soil(p+shift,h)*uSoilBright;
      // simple light on the soil bumps
      float shade=0.85+0.6*(dFdx(h)*-1.0+dFdy(h))*40.0;
      c*=clamp(shade,0.6,1.3);
    }
    // wet soil: darker and a bit richer
    c=mix(c,c*vec3(0.55,0.5,0.48),wet*uWetDark);
    // water body
    float depth=smoothstep(0.5,1.1,W);
    vec3 wc=mix(c,uWaterCol,uOpacity*(0.55+0.45*depth));
    // fine light cracks inside the water (like in the sketch)
    float cracks=pow(1.0-abs(snoise(wp*10.0+vec2(uTime*0.12,uTime*0.05))),22.0);
    wc+=cracks*0.25*uShine;
    // dark edge line and dark thin streams
    float edge=clamp(core-inner,0.0,1.0);
    wc=mix(wc,uEdgeCol,edge*0.75);
    vec3 streamCol=mix(uEdgeCol,uWaterCol,0.25);
    c=mix(c,wc,core);
    c=mix(c,streamCol,streams*(1.0-core)*0.9);
    // shine: light from the top left reflected on the water slope + moving glints
    vec3 N=normalize(vec3(-wx*25.0,-wy*25.0,1.0));
    float spec=pow(max(dot(reflect(normalize(vec3(0.4,-0.5,-1.0)),N),vec3(0.0,0.0,1.0)),0.0),30.0);
    float glint=smoothstep(0.62,0.9,snoise(wp*7.0+vec2(uTime*0.18,uTime*0.07)));
    c+=(spec*0.6+glint*0.35)*uShine*water;
    // where the flashlight is (only for testing with the mouse)
    if(uShowLight>0.5){
      for(int i=0;i<${MAX_LIGHTS};i++){
        if(i>=uCount) break;
        vec2 d=(vUv-uLights[i].xy)*vec2(uAspect,1.0);
        c+=vec3(1.0,0.97,0.9)*exp(-dot(d,d)/(uLights[i].w*uLights[i].w*2.5))*0.18*uLights[i].z;
      }
    }
    gl_FragColor=vec4(c,1.0);
  }`;

// ------------------------------------------------------------------ page
export function createWaterPage() {
  const params = { ...DEFAULTS };
  try { Object.assign(params, JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')); } catch { /* no storage */ }
  const save = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(params)); } catch { /* ignore */ } };

  const page = document.createElement('div');
  page.id = 'water-page';
  page.hidden = true;
  page.innerHTML = `
    <canvas class="water__gl"></canvas>
    <canvas class="water__seeds"></canvas>
    <video class="water__video" muted playsinline hidden></video>
    <canvas class="water__cam" hidden></canvas>
    <p class="water__hint">Hold the mouse button = flashlight · B switches the background · or "Fake lights" / "Use Camera" in the panel</p>`;
  document.body.appendChild(page);
  const glCanvas = page.querySelector('.water__gl');
  const seedCanvas = page.querySelector('.water__seeds');
  const ctx = seedCanvas.getContext('2d');
  const video = page.querySelector('.water__video');
  const camCanvas = page.querySelector('.water__cam');

  // ---------------------------------------------------------------- three.js
  const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.autoClear = true;
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.PlaneGeometry(2, 2);
  const lightsU = Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4());
  const seedsU = Array.from({ length: MAX_SEEDS }, () => new THREE.Vector2(-1, -1));

  const simMat = new THREE.ShaderMaterial({
    vertexShader: QUAD_VERT, fragmentShader: SIM_FRAG,
    uniforms: {
      uPrev: { value: null }, uTexel: { value: new THREE.Vector2() }, uDt: { value: 0 }, uTime: { value: 0 }, uAspect: { value: 1 },
      uDry: { value: 0 }, uSpread: { value: 0 }, uCreep: { value: 0 }, uAmount: { value: 0 },
      uLights: { value: lightsU }, uCount: { value: 0 },
    },
  });
  const probeMat = new THREE.ShaderMaterial({
    vertexShader: QUAD_VERT, fragmentShader: PROBE_FRAG,
    uniforms: { uWet: { value: null }, uSeeds: { value: seedsU }, uR: { value: 0.01 } },
  });
  // the dirt photo (kept as-is: no colour conversion, so it looks like the jpg)
  const dirtTex = new THREE.TextureLoader().load(dirtUrl, (t) => { viewMat.uniforms.uImgAspect.value = t.image.width / t.image.height; });
  dirtTex.colorSpace = THREE.NoColorSpace;
  dirtTex.wrapS = dirtTex.wrapT = THREE.MirroredRepeatWrapping;
  dirtTex.anisotropy = 4;
  const viewMat = new THREE.ShaderMaterial({
    vertexShader: QUAD_VERT, fragmentShader: VIEW_FRAG,
    uniforms: {
      uWet: { value: null }, uTexel: { value: new THREE.Vector2() }, uTime: { value: 0 }, uAspect: { value: 1 },
      uRagged: { value: 0 }, uStreams: { value: 0 }, uStreamThin: { value: 0 }, uOpacity: { value: 0 }, uShine: { value: 0 },
      uDistort: { value: 0 }, uWetDark: { value: 0 }, uSoilBright: { value: 1 }, uSoilScale: { value: 1 },
      uDirt: { value: null }, uUsePhoto: { value: 1 }, uImgAspect: { value: 6024 / 3366 },
      uWaterCol: { value: new THREE.Color() }, uEdgeCol: { value: new THREE.Color() },
      uLights: { value: lightsU }, uCount: { value: 0 }, uShowLight: { value: 1 },
    },
  });
  const scene = (mat) => { const s = new THREE.Scene(); s.add(new THREE.Mesh(quad, mat)); return s; };
  const simScene = scene(simMat), probeScene = scene(probeMat), viewScene = scene(viewMat);

  let simA = null, simB = null;
  const probeRT = new THREE.WebGLRenderTarget(MAX_SEEDS, 1, { type: THREE.UnsignedByteType, depthBuffer: false });
  const probeBuf = new Uint8Array(MAX_SEEDS * 4);

  function makeSim(w, h) {
    simA?.dispose(); simB?.dispose();
    const opts = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping };
    simA = new THREE.WebGLRenderTarget(w, h, opts);
    simB = new THREE.WebGLRenderTarget(w, h, opts);
    for (const rt of [simA, simB]) { renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 1); renderer.clear(); }
    renderer.setRenderTarget(null);
    simMat.uniforms.uTexel.value.set(1 / w, 1 / h);
    viewMat.uniforms.uTexel.value.set(1 / w, 1 / h);
  }

  let W = 0, H = 0;
  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    renderer.setSize(W, H, false);
    const dpr = Math.min(window.devicePixelRatio, 2);
    seedCanvas.width = Math.round(W * dpr); seedCanvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const aspect = W / H;
    simMat.uniforms.uAspect.value = viewMat.uniforms.uAspect.value = aspect;
    makeSim(SIM_WIDTH, Math.max(16, Math.round(SIM_WIDTH / aspect)));
    if (!seeds.length) newSeeds();
  }

  // ---------------------------------------------------------------- lights (mouse, fake, camera)
  const mouse = { x: 0.5, y: 0.5, down: false };
  glCanvas.addEventListener('pointerdown', (e) => { mouse.down = true; setMouse(e); glCanvas.setPointerCapture(e.pointerId); });
  glCanvas.addEventListener('pointermove', setMouse);
  glCanvas.addEventListener('pointerup', () => { mouse.down = false; });
  glCanvas.addEventListener('pointercancel', () => { mouse.down = false; });
  function setMouse(e) { mouse.x = e.clientX / W; mouse.y = 1 - e.clientY / H; }

  let fake = [];          // wandering test lights
  let fakeUntil = 0;
  function startFake(now) {
    const n = 1 + Math.floor(Math.random() * 4);
    fake = Array.from({ length: n }, () => ({ seed: Math.random() * 100, x: 0.15 + Math.random() * 0.7, y: 0.15 + Math.random() * 0.7, on: Math.random() * 2 }));
    fakeUntil = now + 25;
  }
  function fakeLights(now) {
    if (now > fakeUntil) { fake = []; return []; }
    return fake.filter((f) => now > f.on).map((f) => {
      const t = now * 0.08 + f.seed;
      return { x: f.x + Math.sin(t * 1.3) * 0.12 + Math.sin(t * 0.7 + 2) * 0.08, y: f.y + Math.cos(t * 1.1) * 0.1 + Math.sin(t * 0.5) * 0.06 };
    });
  }

  let camOn = false;
  const camCtx = camCanvas.getContext('2d', { willReadFrequently: true });
  async function setCamera(on) {
    if (on && !camOn) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 360 } });
        video.srcObject = stream; await video.play(); camOn = true;
      } catch (err) { console.warn('camera', err); params['Use Camera'] = false; gui.controllersRecursive().forEach((c) => c.updateDisplay()); }
    } else if (!on && camOn) {
      video.srcObject?.getTracks().forEach((t) => t.stop()); video.srcObject = null; camOn = false;
    }
  }
  // bright blobs in a small camera image -> light positions (0..1)
  const CW = 160, CH = 90;
  camCanvas.width = CW; camCanvas.height = CH;
  function cameraLights() {
    if (!camOn || video.readyState < 2) return [];
    camCtx.drawImage(video, 0, 0, CW, CH);
    const px = camCtx.getImageData(0, 0, CW, CH).data;
    const thr = params['Camera Threshold'];
    const bright = new Uint8Array(CW * CH);
    for (let i = 0; i < CW * CH; i++) bright[i] = (px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2]) / 3 > thr ? 1 : 0;
    const out = [];
    const stack = [];
    for (let i = 0; i < CW * CH && out.length < MAX_LIGHTS; i++) {
      if (bright[i] !== 1) continue;
      let sx = 0, sy = 0, n = 0; stack.push(i); bright[i] = 2;
      while (stack.length) {
        const j = stack.pop(); const x = j % CW, y = (j / CW) | 0; sx += x; sy += y; n++;
        for (const k of [j - 1, j + 1, j - CW, j + CW]) {
          if (k < 0 || k >= CW * CH || bright[k] !== 1) continue;
          if (Math.abs((k % CW) - x) > 1) continue;
          bright[k] = 2; stack.push(k);
        }
      }
      if (n >= 6) {
        const x = sx / n / CW;
        out.push({ x: params['Mirror Camera'] ? 1 - x : x, y: 1 - sy / n / CH });
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- seeds
  let seeds = [];
  function placeSeed(others) {
    for (let tries = 0; tries < 60; tries++) {
      const x = 0.08 + Math.random() * 0.84, y = 0.1 + Math.random() * 0.8;
      if (others.every((o) => Math.hypot((o.x - x) * (W / H), o.y - y) > 0.16)) return { x, y };
    }
    return { x: 0.08 + Math.random() * 0.84, y: 0.1 + Math.random() * 0.8 };
  }
  function makeSeed(others) {
    const { x, y } = placeSeed(others);
    return {
      x, y,
      rot: (Math.random() - 0.5) * 1.2,           // seed tilt
      curl: Math.random() < 0.5 ? -1 : 1,          // which way the root curls
      size: 0.85 + Math.random() * 0.3,
      wet: 0, water: 0, grow: 0, glow: 0, hold: 0, fade: 0, born: 0,
    };
  }
  function newSeeds() {
    seeds = [];
    for (let i = 0; i < params['Seed Count']; i++) { const s = makeSeed(seeds); s.born = 1; seeds.push(s); }
  }

  function updateSeeds(dt) {
    while (seeds.length < params['Seed Count']) seeds.push(makeSeed(seeds));
    if (seeds.length > params['Seed Count']) seeds.length = params['Seed Count'];
    for (let i = 0; i < seeds.length; i++) {
      const s = seeds[i];
      s.born = Math.min(1, s.born + dt / 1.5);                         // new seeds fade in
      const wet = s.wet;
      s.water = Math.min(1, s.water + wet * dt * 0.5 - dt * 0.01);    // soaks up water, loses a little
      s.water = Math.max(0, s.water);
      s.glow += ((wet > 0.05 ? Math.min(1, wet * 1.5) : 0) - s.glow) * Math.min(1, dt * 2);
      if (s.water > params['Water Needed'] && s.grow < 1) s.grow = Math.min(1, s.grow + dt * params['Grow Speed'] * (0.4 + wet));
      if (s.grow >= 1) {
        s.hold += dt;
        if (s.hold > params['Stay Grown (s)']) s.fade += dt / 3;      // after a while: fades, a new seed appears
        if (s.fade >= 1) { const others = seeds.filter((o) => o !== s); seeds[i] = makeSeed(others); }
      }
    }
  }

  const ease = (t) => t * t * (3 - 2 * t);
  const clamp01 = (t) => Math.max(0, Math.min(1, t));

  function drawSeed(s) {
    const scale = (H / 900) * params['Seed Size'] * s.size;
    const alpha = s.born * (1 - s.fade);
    if (alpha <= 0) return;
    const cx = s.x * W, cy = (1 - s.y) * H;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);

    // glow while it is being watered / growing
    const g = Math.max(s.glow, s.grow > 0 && s.grow < 1 ? 0.5 : 0) * params['Seed Glow'];
    if (g > 0.01) {
      const r = 80 * scale;
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      grad.addColorStop(0, `rgba(255,245,215,${0.45 * g})`);
      grad.addColorStop(0.4, `rgba(255,235,190,${0.18 * g})`);
      grad.addColorStop(1, 'rgba(255,235,190,0)');
      ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.rotate(s.rot);

    // root: a short white tip that grows longer and curls
    const rootLen = (10 + 70 * ease(clamp01(s.grow / 0.7))) * scale;
    const steps = 22;
    let x = 4 * scale * s.curl * 0.3, y = 12 * scale, ang = Math.PI / 2 + 0.3 * s.curl;
    ctx.lineCap = 'round';
    for (let k = 0; k < steps; k++) {
      const f = k / steps;
      const nx = x + Math.cos(ang) * rootLen / steps, ny = y + Math.sin(ang) * rootLen / steps;
      ctx.strokeStyle = `rgba(240,236,222,${0.95 - f * 0.25})`;
      ctx.lineWidth = Math.max(0.6, (7 * (1 - f) + 1) * scale);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
      x = nx; y = ny; ang += s.curl * (0.05 + 0.1 * f) * (0.4 + s.grow);
    }
    // little root hairs once it is longer
    if (s.grow > 0.3) {
      ctx.strokeStyle = `rgba(240,236,222,${0.35 * clamp01((s.grow - 0.3) * 3)})`;
      ctx.lineWidth = 0.7 * scale;
      for (let k = 0; k < 6; k++) {
        const t = 0.35 + k * 0.1;
        const hx = 4 * scale * s.curl * 0.3 + Math.cos(Math.PI / 2 + 0.3 * s.curl) * rootLen * t;
        const hy = 12 * scale + Math.sin(Math.PI / 2 + 0.3 * s.curl) * rootLen * t;
        const side = k % 2 ? 1 : -1;
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + side * 7 * scale, hy + 3 * scale); ctx.stroke();
      }
    }

    // seed body
    const r = 17 * scale;
    const body = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.1);
    body.addColorStop(0, '#f2cf8e'); body.addColorStop(0.55, '#d9a258'); body.addColorStop(1, '#9c6a2f');
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(120,80,35,0.25)';
    for (let k = 0; k < 14; k++) {                               // speckled skin
      const a = k * 2.4, d = (k % 5) / 5 * r * 0.75;
      ctx.beginPath(); ctx.arc(Math.cos(a) * d, Math.sin(a) * d, 1.1 * scale, 0, Math.PI * 2); ctx.fill();
    }
    // the skin splits
    if (s.grow > 0.4) {
      ctx.strokeStyle = `rgba(250,240,215,${clamp01((s.grow - 0.4) * 4)})`;
      ctx.lineWidth = 1.4 * scale;
      ctx.beginPath(); ctx.moveTo(-r * 0.2, -r * 0.85); ctx.quadraticCurveTo(r * 0.15, -r * 0.3, -r * 0.05, r * 0.2); ctx.stroke();
    }

    // shoot with two small leaves
    const sh = clamp01((s.grow - 0.45) / 0.55);
    if (sh > 0) {
      const len = 55 * scale * ease(sh);
      ctx.strokeStyle = '#a8c97a'; ctx.lineWidth = 3.2 * scale;
      const tipX = 6 * scale * -s.curl, tipY = -r * 0.6 - len;
      ctx.beginPath(); ctx.moveTo(0, -r * 0.6); ctx.quadraticCurveTo(-8 * scale * s.curl, -r * 0.6 - len * 0.5, tipX, tipY); ctx.stroke();
      const open = ease(clamp01((sh - 0.4) / 0.6));
      const leafLen = 22 * scale * (0.4 + 0.6 * open);
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(tipX, tipY);
        ctx.rotate(side * (0.25 + 1.0 * open) - Math.PI / 2);
        const lg = ctx.createLinearGradient(0, 0, leafLen, 0);
        lg.addColorStop(0, '#7fae55'); lg.addColorStop(1, '#b9dc8a');
        ctx.fillStyle = lg;
        ctx.beginPath(); ctx.ellipse(leafLen * 0.5, 0, leafLen * 0.5, leafLen * 0.24, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(70,110,45,0.5)'; ctx.lineWidth = 0.8 * scale;
        ctx.beginPath(); ctx.moveTo(1, 0); ctx.lineTo(leafLen * 0.9, 0); ctx.stroke();
        ctx.restore();
      }
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- panel
  const gui = new GUI({ title: '8 · Water' });
  gui.domElement.classList.add('water__gui');
  gui.hide();
  const onChange = () => save();
  const fw = gui.addFolder('Water');
  fw.add(params, 'Brush Size', 0.01, 0.25, 0.005).onChange(onChange);
  fw.add(params, 'Water Amount', 0, 5, 0.05).onChange(onChange);
  fw.add(params, 'Drying Speed', 0, 0.3, 0.005).onChange(onChange);
  fw.add(params, 'Spread', 0, 1, 0.01).onChange(onChange);
  fw.add(params, 'Creep', 0, 3, 0.05).name('Creep (flow)').onChange(onChange);
  fw.add(params, 'Ragged Edges', 0, 1.5, 0.01).onChange(onChange);
  fw.add(params, 'Streams', 0, 1.5, 0.01).onChange(onChange);
  fw.add(params, 'Stream Thickness', 0, 1, 0.01).onChange(onChange);
  fw.addColor(params, 'Water Colour').onChange(onChange);
  fw.addColor(params, 'Edge Colour').onChange(onChange);
  fw.add(params, 'Water Opacity', 0, 1, 0.01).onChange(onChange);
  fw.add(params, 'Shine', 0, 2, 0.01).onChange(onChange);
  fw.add(params, 'Distortion', 0, 2, 0.01).onChange(onChange);
  fw.add(params, 'Wet Darkening', 0, 1, 0.01).onChange(onChange);
  const fs = gui.addFolder('Soil');
  const bgCtrl = fs.add(params, 'Background', { 'Photo (dirt-bg.jpg)': 'Photo', 'Generated': 'Generated' }).onChange(onChange);
  fs.add(params, 'Soil Brightness', 0.3, 3, 0.01).onChange(onChange);
  fs.add(params, 'Soil Scale', 0.3, 3, 0.01).onChange(onChange);
  const fseed = gui.addFolder('Seeds');
  fseed.add(params, 'Seed Count', 0, MAX_SEEDS, 1).onChange(onChange);
  fseed.add(params, 'Seed Size', 0.4, 2.5, 0.01).onChange(onChange);
  fseed.add(params, 'Water Needed', 0.02, 1, 0.01).onChange(onChange);
  fseed.add(params, 'Grow Speed', 0.02, 1, 0.01).onChange(onChange);
  fseed.add(params, 'Stay Grown (s)', 1, 60, 1).onChange(onChange);
  fseed.add(params, 'Seed Glow', 0, 2, 0.01).onChange(onChange);
  const fl = gui.addFolder('Light');
  fl.add(params, 'Show Light').name('Show light spot').onChange(onChange);
  fl.add(params, 'Use Camera').onChange((v) => { setCamera(v); onChange(); });
  fl.add(params, 'Camera Threshold', 50, 255, 1).onChange(onChange);
  fl.add(params, 'Mirror Camera').onChange(onChange);
  const actions = {
    'Fake lights': () => startFake(clock.getElapsedTime()),
    'Stop fake lights': () => { fakeUntil = 0; },
    'Clear water': () => makeSim(simA.width, simA.height),
    'New seeds': () => newSeeds(),
    'Reset settings': () => { Object.assign(params, DEFAULTS); save(); gui.controllersRecursive().forEach((c) => c.updateDisplay()); },
  };
  for (const k of Object.keys(actions)) gui.add(actions, k);

  // ---------------------------------------------------------------- loop
  const clock = new THREE.Clock();
  let running = false, raf = 0, last = 0, frameNo = 0;
  const waterCol = new THREE.Color(), edgeCol = new THREE.Color();

  function loop() {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    const now = clock.getElapsedTime();
    const dt = Math.min(now - last, 0.05); last = now;

    // all lights this frame
    const lights = [];
    if (mouse.down) lights.push({ x: mouse.x, y: mouse.y });
    lights.push(...fakeLights(now));
    if (params['Use Camera']) lights.push(...cameraLights());
    const count = Math.min(lights.length, MAX_LIGHTS);
    for (let i = 0; i < MAX_LIGHTS; i++) {
      const l = lights[i];
      if (i < count) lightsU[i].set(l.x, l.y, 1, params['Brush Size']); else lightsU[i].set(-1, -1, 0, 0.01);
    }

    // 1. simulation (two small steps per frame = smoother)
    const su = simMat.uniforms;
    su.uDry.value = params['Drying Speed']; su.uSpread.value = params['Spread']; su.uCreep.value = params['Creep'];
    su.uAmount.value = params['Water Amount']; su.uCount.value = count; su.uTime.value = now;
    for (let k = 0; k < 2; k++) {
      su.uDt.value = dt / 2; su.uPrev.value = simA.texture;
      renderer.setRenderTarget(simB); renderer.render(simScene, cam);
      [simA, simB] = [simB, simA];
    }

    // 2. wetness under the seeds (every 4th frame)
    if (frameNo++ % 4 === 0 && seeds.length) {
      for (let i = 0; i < MAX_SEEDS; i++) { const s = seeds[i]; s ? seedsU[i].set(s.x, s.y) : seedsU[i].set(-1, -1); }
      probeMat.uniforms.uWet.value = simA.texture; probeMat.uniforms.uR.value = 0.012;
      renderer.setRenderTarget(probeRT); renderer.render(probeScene, cam);
      renderer.readRenderTargetPixels(probeRT, 0, 0, MAX_SEEDS, 1, probeBuf);
      seeds.forEach((s, i) => { s.wet = probeBuf[i * 4] / 255; });
    }
    renderer.setRenderTarget(null);

    // 3. soil + water
    const vu = viewMat.uniforms;
    vu.uWet.value = simA.texture; vu.uTime.value = now; vu.uCount.value = count;
    vu.uRagged.value = params['Ragged Edges']; vu.uStreams.value = params['Streams']; vu.uStreamThin.value = params['Stream Thickness'];
    vu.uOpacity.value = params['Water Opacity']; vu.uShine.value = params['Shine']; vu.uDistort.value = params['Distortion'];
    vu.uWetDark.value = params['Wet Darkening']; vu.uSoilBright.value = params['Soil Brightness']; vu.uSoilScale.value = params['Soil Scale'];
    vu.uDirt.value = dirtTex; vu.uUsePhoto.value = params['Background'] === 'Photo' ? 1 : 0;
    vu.uWaterCol.value.copy(waterCol.set(params['Water Colour'])); vu.uEdgeCol.value.copy(edgeCol.set(params['Edge Colour']));
    vu.uShowLight.value = params['Show Light'] ? 1 : 0;
    renderer.render(viewScene, cam);

    // 4. seeds on top
    updateSeeds(dt);
    ctx.clearRect(0, 0, W, H);
    for (const s of seeds) drawSeed(s);
  }

  window.addEventListener('resize', () => { if (running) resize(); });
  // B switches the background (photo / generated) to compare quickly
  window.addEventListener('keydown', (e) => {
    if (!running || e.key !== 'b') return;
    params['Background'] = params['Background'] === 'Photo' ? 'Generated' : 'Photo';
    bgCtrl.updateDisplay(); save();
  });

  return {
    show() {
      if (running) return;
      page.hidden = false; gui.show();
      running = true; resize();
      last = clock.getElapsedTime();
      if (params['Use Camera']) setCamera(true);
      loop();
    },
    hide() {
      page.hidden = true; gui.hide();
      running = false; cancelAnimationFrame(raf);
      setCamera(false);
    },
  };
}
