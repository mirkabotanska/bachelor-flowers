import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Lily } from '../lily/Lily.js';
import { Fibres, fibreUniforms } from '../lily/fibres.js';
import { uniforms, cloneUniforms } from '../lily/materials.js';

// Page 6 (Roots v2) – flowers and leaves growing on the roots, in the style 5 look: points -> wireframe -> flower,
// with dust streaming out of the vertices. When their root is gone they fall apart into dust, like the roots do.
// Every flower gets its own petal count, petal shape and colour (see VARIETY).
// The 3D layer sits BEHIND the 2D roots canvas (roots blended on top with 'screen'). Where a flower is, the roots
// are erased in a soft circle (see occluders()), so the flowers appear in front of the roots.
// The look of the flowers comes from your style 2 settings (and the flower sliders); these are first guesses
// for how many, how big and how fast – change them here.
export const FLOWER_SETTINGS = {
  MAX_FLOWERS: 14,
  MAX_LEAVES: 40,                 // [v2] 12 -> 40: leaves also grow along roots that stay lit
  FLOWER_SIZE: [50, 75],          // px per flower unit (a petal is about 1 unit long)
  LEAF_SIZE: [34, 52],
  SIDE_VIEW_CHANCE: 0.5,          // share of flowers seen from the side / at an angle (with stem + leaves)
  SIDE_FLOWER_SIZE: [36, 52],     // side views are a bit smaller (the stem makes them taller)
  FLOWER_DEPTH: 40,               // how far in front of the roots the flowers sit
  FLOWER_MIN_DISTANCE: 70,        // px between flower groups
  GROUP_SPREAD: [18, 48],         // px: flowers in a group sit this far from the centre
  GROUP_SCALE: [0.55, 0.85],      // flowers in a group are smaller
  LEAF_MIN_DISTANCE: 55,
  GROW_SECONDS: 3.2,              // build-up: points -> wireframe -> flower, while it opens
  WILT_SECONDS: 2.6,              // falls apart into dust when its root is gone (slower = stays longer)
  // [v2] how leaves go when their root is gone:
  //   'fall'   – they let go, fall down while turning and drifting a little, and darken (like autumn)
  //   'shrink' – they fold back into the root (the opposite of growing)
  //   'dust'   – they fall apart into dust, like the flowers
  LEAF_EXIT: 'dust',              // (tried 'fall' and 'shrink', back to dust)
  LEAF_DUST_FLY: [0.25, 1.4],     // [v2] some leaves only crumble, others spread out far
  LEAF_GO_EARLY_LATE: [-0.35, 0.3], // [v2] s: each leaf goes a bit before or after the piece of root it sits on
  LEAF_EXIT_SECONDS: 2.2,
  LEAF_FALL_PX: 180,              // how far they fall
  DUST_FLY: 0.7,                  // how far the loose dust flies (in flower sizes)
  DUST_RISE_PX: 30,               // how far it drifts upwards (px), like the root particles
  POINT_PX: 2.2,                  // size of the vertex points (px)
  POINT_BRIGHTNESS: 1.4,
  WIRE_BRIGHTNESS: 0.6,           // the wireframe is dense on small flowers, so it is dimmer than on page 1
  START_SCALE: 0.8,               // grows a little while it builds (1 = no growing)
  BREATH_SECONDS: [4.5, 6.5],     // each flower breathes at its own pace
  BREATH_AMOUNT: 0.06,
  FLOWER_DUST: 2500,              // dust per flower (lower = faster)
  LEAF_DUST: 500,
};

// how different the flowers are from each other: [min, max] per flower
export const VARIETY = {
  PETALS_PER_RING: [3, 3, 3, 4, 4, 5],   // one is picked at random (two rings, so 3 = 6 petals); repeat a number to make it more common
  PETAL_LENGTH: [0.75, 1.3],
  PETAL_WIDTH: [0.2, 0.5],
  PETAL_TIP_SHAPE: [0.5, 1.4],           // low = pointy, high = round
  PETAL_ARC_BEND: [0.3, 1.0],            // how far the petals bend back
  PETAL_TIP_BEND: [0.2, 0.9],
  PETAL_RUFFLE: [0.05, 0.45],
  INNER_RING_SCALE: [0.8, 1.05],
  STAMEN_COUNT: [4, 8],
  PANEL_COLOUR_CHANCE: 0.55,             // share of flowers in the colour from the panel (a little shifted)...
  HUE_SHIFT: 0.04,                       // ...by up to this much
  // ...the others get one of these [hue, saturation, value] (hue 0.95 = pink, 0.05 = peach, 0.82 = lilac)
  COLOURS: [
    [0.95, 0.2, 1.0],                    // pale pink
    [0.93, 0.65, 0.95],                  // deep pink
    [0.05, 0.4, 1.0],                    // peach
    [0.95, 0.06, 1.0],                   // almost white
    [0.82, 0.3, 0.95],                   // lilac
  ],
};

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const clamp01 = (x) => Math.min(Math.max(x, 0), 1);
const ease = (x) => { const c = clamp01(x); return c * c * (3 - 2 * c); };
const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);

export class RootFlowers {
  constructor(figure, growthCanvas, mainParams) {
    this.main = mainParams;
    this.W = growthCanvas.width; this.H = growthCanvas.height;
    const S = FLOWER_SETTINGS;
    this.S = S;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.W, this.H, false);
    this.renderer.toneMapping = THREE.AgXToneMapping;
    const c = this.renderer.domElement;
    c.className = 'view__canvas--flowers';
    Object.assign(c.style, { position: 'absolute', left: '0', top: '0', width: '100%', aspectRatio: `${this.W} / ${this.H}`, height: 'auto' });
    figure.insertBefore(c, growthCanvas);
    this.growthCanvas = growthCanvas;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.15;
    this.scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x101810, 0.25));
    const key = new THREE.DirectionalLight(0xfff2ea, 1.5); key.position.set(-1, 1.2, 2); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xbcd2ff, 1.4); rim.position.set(1, 1, -1); this.scene.add(rim);

    // camera that shows exactly the roots canvas at z = 0 (1 px = 1 unit), with a little perspective
    const fov = 30;
    this.camera = new THREE.PerspectiveCamera(fov, this.W / this.H, 10, 6000);
    const dist = this.H / 2 / Math.tan((fov * Math.PI) / 360);
    this.camera.position.set(this.W / 2, -this.H / 2, dist);
    this.camera.lookAt(this.W / 2, -this.H / 2, 0);

    // vertex points: pixels per unit at distance 1, and the point size that gives POINT_PX on screen
    const pr = this.renderer.getPixelRatio();
    this.pxScale = (this.H * pr) / (2 * Math.tan((fov * Math.PI) / 360));
    this.pointSize = (S.POINT_PX * pr * (dist - S.FLOWER_DEPTH)) / (2 * this.pxScale);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(this.W, this.H), 0.55, 0.45, 0.7);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.items = [];
    this.layers = 0;                                       // [v2] newer flowers are drawn on top of older ones
  }

  count(kind) { return this.items.filter((it) => it.kind === kind && !it.wilting).length; }

  #free(x, y, kind, minD) {
    return !this.items.some((it) => it.kind === kind && Math.hypot(it.x - x, it.y - y) < minD);
  }

  // anchor(): returns false once the root it grows on is gone -> the flower wilts
  // a small group of flowers around (x, y), smaller than a single one
  tryFlowerGroup(x, y, anchor, count) {
    if (!this.#free(x, y, 'flower', this.S.FLOWER_MIN_DISTANCE)) return 0;
    let made = 0;
    for (let k = count - 1; k >= 0; k--) {                  // [v2] the middle one is made last, so it's on top
      const a = (k / count) * Math.PI * 2 + rand(-0.5, 0.5), d = k === 0 && count > 2 ? 0 : rand(...this.S.GROUP_SPREAD);
      if (this.tryFlower(x + Math.cos(a) * d, y + Math.sin(a) * d, anchor, rand(...this.S.GROUP_SCALE), 26)) made++;
    }
    return made;
  }

  tryFlower(x, y, anchor, scale = 1, minDistance = this.S.FLOWER_MIN_DISTANCE) {
    if (this.count('flower') >= this.S.MAX_FLOWERS || !this.#free(x, y, 'flower', minDistance)) return false;
    const m = this.main;
    const V = VARIETY;
    const own = Math.random() < V.PANEL_COLOUR_CHANCE;
    const [hue, sat, val] = own
      ? [(m['Blossom Hue'] + rand(-V.HUE_SHIFT, V.HUE_SHIFT) + 1) % 1, clamp01(m['Blossom Saturation'] + rand(-0.12, 0.12)), m['Blossom Value']]
      : pick(V.COLOURS).map((c, k) => (k === 0 ? (c + rand(-0.015, 0.015) + 1) % 1 : clamp01(c + rand(-0.05, 0.05))));
    const p = {
      ...m,
      'Flower Blooming': rand(0.6, 0.95),
      'Petals Per Ring': pick(V.PETALS_PER_RING), 'Petal Length': rand(...V.PETAL_LENGTH), 'Petal Width': rand(...V.PETAL_WIDTH),
      'Petal Tip Shape': rand(...V.PETAL_TIP_SHAPE), 'Petal Arc Bend': rand(...V.PETAL_ARC_BEND),
      'Petal Tip Bend': rand(...V.PETAL_TIP_BEND), 'Petal Edge Ruffle': rand(...V.PETAL_RUFFLE),
      'Inner Ring Scale': rand(...V.INNER_RING_SCALE), 'Stamen Count': Math.round(rand(...V.STAMEN_COUNT)),
      'Blossom Hue': hue, 'Blossom Saturation': sat, 'Blossom Value': val,
      'Head Tilt': 0, 'Stem Length': 0, 'Leaf Count': 0, 'Thread Count': 0, 'Sparkle Count': 0,
    };
    const side = Math.random() < this.S.SIDE_VIEW_CHANCE;
    if (side) {                                            // seen from the side: with stem and leaves
      Object.assign(p, {
        'Head Tilt': rand(0.15, 0.6), 'Stem Length': rand(0.9, 1.7), 'Stem Bend': rand(-0.4, 0.4),
        'Leaf Count': Math.round(rand(2, 4)), 'Leaf Start (top)': rand(0.25, 0.4), 'Leaf End (bottom)': rand(0.75, 0.95),
        'Leaf Length': rand(0.5, 0.8), 'Leaf Seed': Math.floor(rand(0, 999)),
      });
    }
    const size = (side ? rand(...this.S.SIDE_FLOWER_SIZE) : rand(...this.S.FLOWER_SIZE)) * scale;
    const share = Math.max(scale * scale, 0.3);                            // smaller flowers need fewer streaks / dust
    this.#add('flower', x, y, anchor, p, size, Math.round(this.S.FLOWER_DUST * share), side ? 'side' : 'top');
    return true;
  }

  // dir (canvas angle, radians): leaves branch off a root in that direction and lie flat; without dir: a small rosette
  // [v2] scale: smaller leaves along the branches; minDistance: how close to other leaves it may be
  tryLeaves(x, y, anchor, dir = null, scale = 1, minDistance = this.S.LEAF_MIN_DISTANCE) {
    if (this.count('leaf') >= this.S.MAX_LEAVES || !this.#free(x, y, 'leaf', minDistance)) return false;
    const n = dir === null ? Math.round(rand(3, 5)) : Math.round(rand(1, 2));
    const p = {
      ...this.main,
      'Petals Per Ring': 0, 'Stamen Count': 0, 'Pistil Scale': 0, 'Stem Length': 0, 'Head Tilt': 0,
      'Leaf Count': n, 'Leaf Start (top)': 0, 'Leaf End (bottom)': 0,
      'Leaf Spiral Angle': dir === null ? 360 / n + rand(-15, 15) : rand(40, 80),
      'Leaf Angle': rand(10, 30), 'Leaf Scale': 1, 'Leaf Size Gradient': 0, 'Leaf Length': rand(0.6, 0.9),
      'Leaf Width': rand(0.08, 0.13), 'Leaf Droop': rand(0.1, 0.3), 'Leaf Randomness': 0.35,
      'Leaf Seed': Math.floor(rand(0, 999)), 'Thread Count': 0, 'Sparkle Count': 0,
    };
    this.#add('leaf', x, y, anchor, p, rand(...this.S.LEAF_SIZE) * scale, Math.round(this.S.LEAF_DUST * scale), 'top', dir);
    return true;
  }

  #add(kind, x, y, anchor, p, size, dust, view = 'top', dir = null) {
    const own = cloneUniforms(uniforms);                  // this flower's own copy of the material settings
    const fu = cloneUniforms(fibreUniforms);
    const lily = new Lily(p, own);
    const fibres = new Fibres(lily, p, fu);
    const tilt = new THREE.Group();
    if (view === 'side') {
      // seen from the side or at an angle: upright, stem base on the root, leaning a bit
      tilt.rotation.set(rand(0.05, 0.6), rand(-0.6, 0.6), 0);
      lily.position.y = fibres.position.y = p['Stem Length'];          // stem base sits on the root point
    } else {
      tilt.rotation.set(Math.PI / 2 + rand(-0.35, 0.35), rand(-0.3, 0.3), 0);   // faces the viewer
    }
    tilt.add(lily, fibres);
    const outer = new THREE.Group();
    outer.position.set(x, -y, kind === 'flower' ? this.S.FLOWER_DEPTH : this.S.FLOWER_DEPTH * 0.5);
    outer.rotation.z = view === 'side' ? rand(-0.35, 0.35)                // mostly upright
      : dir !== null ? -dir                                                // leaves follow the root direction
      : rand(0, Math.PI * 2);
    outer.add(tilt);
    outer.scale.setScalar(0.001);
    this.scene.add(outer);
    // [v2] layers: flowers never cut through each other. Each one is drawn completely on top of the ones before it
    // (the depth is cleared just before it), and leaves are always below the flowers.
    lily.solidMat.transparent = true;                     // so it's sorted together with its dust and points
    lily.solidMat.blending = THREE.NoBlending;            // ...but still drawn solid
    const order = (kind === 'flower' ? 100000 : 0) + ++this.layers * 10;
    const clearDepth = (renderer) => renderer.clearDepth();
    this.items.push({
      kind, x, y, anchor, p, size, dust, lily, fibres, u: own, fu, outer,
      born: this.now ?? 0, wilting: null, wiltFrom: 1, progress: 0, lastBloom: -1,
      breath: rand(...this.S.BREATH_SECONDS), phase: rand(0, Math.PI * 2),
      order, clearDepth,
    });
  }

  update(dt, now) {
    this.now = now;
    const m = this.main, S = this.S;
    for (const it of this.items) {
      const age = now - it.born;
      if (!it.wilting) {
        const a = it.anchor();                               // true = still there; false / a time = going
        if (a !== true) {
          const at = typeof a === 'number' && it.kind === 'leaf' ? a + rand(...S.LEAF_GO_EARLY_LATE) : now;
          it.wilting = Math.max(now, at); it.wiltFrom = it.progress;
        }
      }
      const leafExit = it.kind === 'leaf' && S.LEAF_EXIT !== 'dust' ? S.LEAF_EXIT : null;   // [v2]
      const exitSeconds = leafExit ? S.LEAF_EXIT_SECONDS : S.WILT_SECONDS;
      const w = it.wilting ? clamp01((now - it.wilting) / exitSeconds) : 0;   // 0 -> 1: going away
      // build-up progress: 0 = nothing, then points, wireframe, and the solid flower (1 = fully built)
      // when it falls apart the build-up just stops where it was
      const progress = it.wilting ? it.wiltFrom : ease(age / S.GROW_SECONDS);
      it.progress = progress;
      it.vis = THREE.MathUtils.smoothstep(progress, 0.25, 0.85) * (1 - THREE.MathUtils.smoothstep(w, 0.2, 0.7));
      const grown = S.START_SCALE + (1 - S.START_SCALE) * easeOut(age / S.GROW_SECONDS);
      it.outer.scale.setScalar(it.size * grown);
      let bright = 1, alpha = 1;
      if (leafExit && w > 0) {                                // [v2] leaves: fall or fold back instead of dust
        it.home ??= { x: it.outer.position.x, y: it.outer.position.y, rz: it.outer.rotation.z,
          drift: rand(-40, 40), spin: rand(-1.6, 1.6), sway: rand(0, 6) };
        const h = it.home;
        if (leafExit === 'fall') {
          const t = w * exitSeconds;
          it.outer.position.x = h.x + h.drift * w + Math.sin(t * 3 + h.sway) * 10 * w;      // sways side to side
          it.outer.position.y = h.y - S.LEAF_FALL_PX * w * w;                               // falls faster and faster
          it.outer.rotation.z = h.rz + h.spin * w;
          bright = 1 - THREE.MathUtils.smoothstep(w, 0.25, 1);                              // darkens into the black
          alpha = 1 - THREE.MathUtils.smoothstep(w, 0.7, 1);                                // ...and the last grey shine goes
        } else {                                                                           // 'shrink'
          it.outer.scale.setScalar(it.size * grown * (1 - ease(w)));
          bright = 1 - THREE.MathUtils.smoothstep(w, 0.5, 1);
        }
      }

      if (it.kind === 'flower') {                             // opens up, then breathes; closes a bit when wilting
        const open = it.p['Flower Blooming'];
        let bloom = 0.12 + (open - 0.12) * ease((age - 0.3) / S.GROW_SECONDS);
        if (age > S.GROW_SECONDS) {
          const bt = age - S.GROW_SECONDS;
          bloom += S.BREATH_AMOUNT * Math.min(bt / 2, 1) * Math.sin((bt / it.breath) * Math.PI * 2 + it.phase);
        }
        if (Math.abs(bloom - it.lastBloom) > 0.002) { it.lily.setBloom(clamp01(bloom)); it.lastBloom = bloom; }
      }
      // [v2] keep the layer order (the flower's parts can be rebuilt, so set it every frame)
      it.lily.mesh.renderOrder = it.order; it.lily.mesh.onBeforeRender = it.clearDepth;
      for (const o of [it.lily.wire, it.lily.points, it.lily.sparkles, ...it.fibres.children]) if (o) o.renderOrder = it.order + 1;

      const building = progress < 0.999 && !it.wilting;     // points + wireframe only while it builds
      it.lily.points.visible = it.lily.wire.visible = building;
      if (it.lily.sparkles) it.lily.sparkles.visible = false;

      // the flower itself: same timing as style 1 / 5 (Wire Delay, Solid Delay, Fade Length from the panel)
      const u = it.u;
      u.uProgress.value = progress;
      u.uWireDelay.value = m['Wire Delay']; u.uSolidDelay.value = m['Solid Delay']; u.uFade.value = m['Fade Length'];
      u.uPxScale.value = this.pxScale; u.uPointSize.value = this.pointSize;
      u.uPointBright.value = S.POINT_BRIGHTNESS; u.uWireBright.value = S.WIRE_BRIGHTNESS;
      u.uCoreAlpha.value = alpha; u.uCoreBright.value = bright;
      u.uPetalGlow.value = m['Petal Glow'];
      u.uTime.value = now;
      u.uDissolve.value = leafExit ? 0 : w;

      // dust only (no streaks), starting at the vertices and appearing with them
      const fu = it.fu;
      fu.uHalo.value = m['Silhouette Halo'];
      fu.uDustDist.value = m['Dust Distance']; fu.uDustSpeed.value = m['Dust Speed'];
      fu.uDustOpacity.value = m['Dust Opacity'] * bright; fu.uDustSize.value = m['Dust Size'];
      fu.uPixelRatio.value = this.renderer.getPixelRatio();
      fu.uReveal.value = progress; fu.uTime.value = now; fu.uBreath.value = 0;
      fu.uOpacity.value = 0; fu.uStrandFraction.value = 0; fu.uDustFraction.value = 1; fu.uThreadOpacity.value = 0;
      fu.uDissolve.value = leafExit ? 0 : w;
      if (w > 0 && !leafExit) {                                           // loose dust flies off and drifts up the screen
        it.dustFly ??= it.kind === 'leaf' ? rand(...S.LEAF_DUST_FLY) : S.DUST_FLY;
        fu.uDissolveDist.value = it.dustFly;
        const scale = it.outer.scale.x;
        fu.uRise.value = S.DUST_RISE_PX / scale;
        it.fibres.updateWorldMatrix(true, false);
        fu.uUp.value.set(0, 1, 0).transformDirection(it.fibres.matrixWorld.clone().invert());
      }
      it.fibres.update({ strands: 1, dust: it.dust, atVertices: true });
    }
    // remove what has fully wilted
    this.items = this.items.filter((it) => {
      const exitSeconds = it.kind === 'leaf' && S.LEAF_EXIT !== 'dust' ? S.LEAF_EXIT_SECONDS : S.WILT_SECONDS;
      if (!(it.wilting && now - it.wilting > exitSeconds)) return true;
      this.scene.remove(it.outer);
      it.outer.traverse((o) => { o.geometry?.dispose(); });
      return false;
    });
  }

  // where the flowers are on screen (canvas pixels): the roots get erased there so the flowers sit on top
  occluders() {
    const out = [], v = new THREE.Vector3();
    for (const it of this.items) {
      if (it.kind !== 'flower' || !(it.vis > 0.01)) continue;
      it.lily.getWorldPosition(v).project(this.camera);              // the flower head
      out.push({ x: ((v.x + 1) / 2) * this.W, y: ((1 - v.y) / 2) * this.H, r: it.outer.scale.x * 1.05, a: it.vis });
    }
    return out;
  }

  render() {
    this.bloom.strength = this.main['Glow Strength'];
    this.bloom.radius = this.main['Glow Radius'];
    this.bloom.threshold = this.main['Glow Threshold'];
    this.composer.render();
  }
}
