// Page 4 – Roots. Your friend's "Growth test 03" (03-growth/script.js), moved into this project.
// The growth code itself is unchanged. Added (marked [added]/[changed]):
//  - it lives in its own page element and only runs while page 4 is open
//  - the camera starts when you first open the page and stops when you leave it
//  - "Use mouse instead of camera": hold the mouse button on the growth view = the flashlight is on
import './roots.css';
import { RootFlowers } from './flowers.js';                     // [added] flowers + leaves on the roots

const MARKUP = `<h1 class="lab__title">Roots v2 – working copy (page 4 stays as it was)</h1>
    <div class="fake">
      <button class="fake__button" type="button">Fake lights (random scenario)</button>
      <button class="fake__stop" type="button">Stop</button>
      <span class="fake__info"></span>
    </div>
    <video class="lab__video" muted playsinline hidden></video>

    <section class="lab__views">
      <figure class="view view--wide">
        <canvas class="view__canvas view__canvas--growth"></canvas>
        <figcaption class="view__caption">Growth</figcaption>
      </figure>
      <figure class="view">
        <canvas class="view__canvas view__canvas--camera"></canvas>
        <figcaption class="view__caption">Camera + detected centre</figcaption>
      </figure>
      <figure class="view">
        <canvas class="view__canvas view__canvas--mask"></canvas>
        <figcaption class="view__caption">What the code counts as light</figcaption>
      </figure>
    </section>

    <section class="controls">
      <button class="controls__button" type="button">Calibrate (C)</button>
      <label class="controls__field">
        <input class="controls__camera" type="checkbox" />
        Use camera (flashlight)
      </label>
      <label class="controls__field">
        <input class="controls__particles" type="checkbox" checked />
        Dissolve into particles
      </label>
      <label class="controls__field">
        Threshold
        <input class="controls__slider" type="range" min="5" max="200" value="70" />
        <output class="controls__value">70</output>
      </label>
    </section>

    <p class="status">Starting camera…</p>`;

export function createRootsPage(mainParams = {}) {               // [changed] gets the flower/style 2 settings
  const page = document.createElement('div');
  page.id = 'roots-page-v2';
  page.className = 'lab';
  page.hidden = true;
  page.innerHTML = MARKUP;
  document.body.appendChild(page);

  let running = false;                                           // [added]
  let rafId = 0;                                                 // [added]
  const cameraToggle = page.querySelector('.controls__camera');  // [added] off = mouse (default)
  const particleToggle = page.querySelector('.controls__particles');   // [added]
  const mouse = { x: 0, y: 0, down: false };                     // [added]

  const WIDTH = 320;
  const HEIGHT = 180;
  const CALIBRATION_FRAMES = 30;
  const MIN_LIGHT_PIXELS = 20;
  const LIGHT_HOLD_SECONDS = 0.2;

  const GROWTH_SCALE = 4;
  const ROOTS_PER_SPOT = 10;                 // [changed] 5 -> 10: fuller from the start
  const STEP_LENGTH = 6;
  const GROW_SPEED = 90;
  const WOBBLE = 0.22;                       // [changed] calmer, wandering lines (image 2)
  const STEER = 0.35;
  const MAX_TURN_FROM_HOME = Math.PI / 3;    // [changed] roots stay in their own direction -> no empty gaps
  const MAX_POINTS = 14000;                  // [changed] more roots and twigs

  const MIN_BURST_STEPS = 8;                // [changed] 25-75 -> 8-20: short roots per press
  const MAX_BURST_STEPS = 20;

  const SPROUT_SECONDS = 3;
  const ROOTS_PER_SPROUT = 2;

  const SHRINK_DELAY_SECONDS = 0.6;         // [changed] 3 -> 0.6: unlit roots start to disappear quickly

  // [added] disappearing: roots dissolve into drifting particles (or just fade, see the checkbox)
  const DISSOLVE_SECONDS = 1.0;          // [changed] 0.6 -> 1: how long a root takes to fall apart
  const LINE_FADE_SECONDS = 0.5;         // each piece of line fades out (instead of switching off)
  const PARTICLE_FADE_IN = 0.35;         // particles fade in...
  const PARTICLE_LOOSEN = 0.7;           // ...and sit still on the line before drifting off (s)
  const PARTICLE_EVERY = 1;              // one particle per this many root points
  const PARTICLE_LIFE_MIN = 0.9;         // seconds
  const PARTICLE_LIFE_MAX = 2;
  const PARTICLE_SPEED = 22;             // px/s drift
  const PARTICLE_RISE = 12;              // px/s upwards
  const PARTICLE_SIZE = 1.2;             // px
  const PARTICLE_RANDOMNESS = 0.6;       // 0 = strictly in order, 1 = very scattered timing
  const ROOT_JITTER = 0.35;              // s: roots don't all start dissolving at the same moment
  const SHRINK_SECONDS = 4;                  // [changed] 9 -> 4: shrink back faster
  const DIM_SECONDS = 5;                     // [changed] 12 -> 5: dim faster
  const DIM_FLOOR = 0.25;
  const TAPER_STEPS = 18;
  const TAPER_EASE_SPEED = 8;
  const BRIGHTEN_SECONDS = 1.5;

  const MIN_STEPS_BETWEEN_SPLITS = 8;        // [changed] branch more often (image 1)
  const MAX_STEPS_BETWEEN_SPLITS = 20;
  const MIN_SPLIT_ANGLE = 0.5;
  const MAX_SPLIT_ANGLE = 1.1;
  const BRANCH_SHRINK = 0.6;
  const MIN_BRANCH_STEPS = 3;                // [changed] allow small twigs

  const LIGHT_REACH = 120;
  const PLANT_SPACING = 250; // keep this over 2x LIGHT_REACH or two bursts can grow at once

  const REST_SECONDS = 0;                    // [changed] 0.4 -> 0: roots appear as soon as the light is there
  const REST_MOVEMENT = 30;

  const TIP_STEPS = 10;
  const ARRIVE_DISTANCE = 30;
  const BRANCH_DISTANCE = 70;
  const BRANCH_COOLDOWN_SECONDS = 0.5;

  const GLOW_RADIUS = 110;
  const GLOW_STRENGTH = 0.22;
  const GLOW_IN_SECONDS = 0.1;
  const GLOW_OUT_SECONDS = 0.6;

  // [added] look: electric discharge first, then it calms down into green roots
  const SPARK_SECONDS = 1.2;            // first moments of a new root: faster and more jagged
  const SPARK_SPEED = 2.4;              // speed multiplier during the spark
  const SPARK_WOBBLE = 0.55;            // jaggedness during the spark
  const TO_GREEN_SECONDS = 2.5;         // how long a part of a root stays 'electric' before it turns green
  const ELECTRIC_COLOR = [205, 225, 255];
  const GREEN_COLOR = [150, 235, 170];
  const LINE_WIDTH = 1.6;               // trunk width; branches get thinner
  const GLOW_WIDTH = 5;                 // soft glow around each line (x line width)
  const GLOW_ALPHA = 0.12;
  const CHUNK = 4;                      // points per drawn piece (colour/width change along a root)
  const FLASH_SECONDS = 0.9;            // bright flash where roots are planted
  const FLASH_RADIUS = 140;

  // [added] light near existing roots: a smaller cluster appears right at the light and reaches out to connect
  const CLUSTER_SPACING = 90;           // no new cluster this close to another planting spot
  const CLUSTER_MIN_ROOTS = 3;
  const CLUSTER_MAX_ROOTS = 8;
  const CLUSTER_MIN_SIZE = 0.35;        // root length compared to a normal planting (random per cluster)
  const CLUSTER_MAX_SIZE = 0.8;
  const CONNECT_REACH = 375;            // how far a connecting root may reach to find another root
  const MAX_CONNECTORS = 3;             // connecting roots from a new cluster (to different roots)
  const MAX_REACHERS = 2;               // existing roots that send a branch towards the light
  const REGROW_SECONDS = 1.4;           // while the light stays, something new grows this often
  const SPOT_REUSE = 40;                // a new cluster this close to another one adds to it
  const CHARGE_SECONDS = 0.9;           // how long a pulse of light runs through connected roots
  const CONNECT_FLASH_RADIUS = 70;

  // [added] pressing / shining on the same spot again (or more people at once) makes it grow stronger
  const BOOST_RADIUS = 80;              // a new press this close to a spot boosts that spot
  const BOOST_MAX = 5;                  // how strong a spot can get
  const BOOST_DECAY_SECONDS = 5;        // boost drops by 1 every this many seconds
  const BOOST_LONGER = [2, 4];          // extra steps for the spot's existing roots (x boost factor)
  const BOOST_INNER_BRANCHES = 2;       // new branches from inside existing roots (+1 per boost level)
  const BOOST_NEW_ROOTS = 1;            // new roots from the centre (+1 per boost level)

  // [added] moving the light: one 'main route' root grows along with it
  const MOVE_SPEED = 60;                // px/s: faster than this counts as moving (slower = standing still)
  const LEAD_GRAB = 160;                // a root tip this close to the light can become the main route
  const LEAD_LOST = 260;                // if the light gets further than this from the main route, pick a new one
  const FOLLOW_GAIN = 7;                // how eagerly it catches up (higher = sticks closer to the light)
  const MAX_FOLLOW_SPEED = 1600;        // px/s
  const LEADER_STEER = 0.55;            // how sharply it turns towards the light
  const LEADER_WOBBLE = 0.12;           // a little wiggle so it stays organic
  // [added] branching depends on how fast the light moves: slow = more and longer twigs, fast = a clean line
  const SLOW_SPEED = 150;               // px/s and slower counts as 'slow'
  const FAST_SPEED = 900;               // px/s and faster counts as 'fast'
  const TWIG_STEPS_SLOW = 14;           // side twig length when moving slowly
  const TWIG_STEPS_FAST = 5;            // ...and when moving fast
  const TWIG_GAP_SLOW = [4, 10];        // steps between twigs when slow (min, max)
  const TWIG_GAP_FAST = [22, 40];       // ...and when fast
  const TIP_FORK_EVERY_SLOW = 0.35;     // s between small forks at the light when slow (none when fast)
  const LEADER_TWIG_STEPS = 9;
  const LEADER_TWIG_MIN_GAP = 10;
  const LEADER_TWIG_MAX_GAP = 26;

  const video = page.querySelector(".lab__video");
  const growthCanvas = page.querySelector(".view__canvas--growth");
  const cameraCanvas = page.querySelector(".view__canvas--camera");
  const maskCanvas = page.querySelector(".view__canvas--mask");
  const calibrateButton = page.querySelector(".controls__button");
  const thresholdSlider = page.querySelector(".controls__slider");
  const thresholdValue = page.querySelector(".controls__value");
  const statusText = page.querySelector(".status");

  cameraCanvas.width = maskCanvas.width = WIDTH;
  cameraCanvas.height = maskCanvas.height = HEIGHT;
  growthCanvas.width = WIDTH * GROWTH_SCALE;
  growthCanvas.height = HEIGHT * GROWTH_SCALE;

  const cameraContext = cameraCanvas.getContext("2d", { willReadFrequently: true });
  const maskContext = maskCanvas.getContext("2d");
  const growthContext = growthCanvas.getContext("2d");
  const maskImage = maskContext.createImageData(WIDTH, HEIGHT);

  let reference = null;
  let calibration = null;
  let roots = [];
  let lastFrameTime = 0;
  let lastLight = null;
  let lightLostSeconds = 0;
  let rest = null;
  let branchCooldown = 0;
  let sproutCooldown = 0;
  let glow = { x: 0, y: 0, opacity: 0 };
  let now = 0;                                  // [added] seconds since the page started
  let flashes = [];                              // [added] where roots were planted
  let spots = [];                                // [added] planting spots (big plantings + clusters)
  let spotCount = 0;
  let regrowCooldown = 0;                        // [added]
  let particles = [];                            // [added] dissolving roots
  let flowers = null;                            // [added] 3D layer with flowers + leaves (made when the page opens)
  let pendingLeaves = [];
  let pendingBranchLeaves = [];                  // [v2] leaves along roots that turned green
  let veins = [];                                // [v2] thin lines between green roots                        // [added] leaves appear a moment after roots are planted
  const FLOWER_ON_CONNECT = 0.85;                // chance that flowers bloom where two roots connect
  const FLOWERS_ON_CONNECT = [2, 4];             // ...a small group of this many smaller flowers
  const FLOWERS_AT_BOOST = [1, 2];
  const FLOWER_AT_BOOST = 2;                     // a spot boosted this many times gets a flower
  const FLOWER_ROOT_EXTRA_SECONDS = 4;           // [added] roots that carry flowers wait this much longer before they dissolve
  const flowerSpots = new Set();                 // [added] spots with flowers on them
  const FLOWER_ON_HOLD = 0.2;                    // chance per regrow (holding still) of a flower at that spot
  const LEAVES_PER_SPOT = [1, 3];
  const LEAF_CHANCE = 0.65;                      // chance that a new spot gets leaves at all
  const ROSETTE_CHANCE = 0.3;                    // ...a small leaf cluster instead of single leaves off a root

  // [added v2] electric -> nature: a root starts as electricity; when the light stays on it, it turns green,
  // its line smooths out, gets a bit thicker and calmer, and leaves grow along it. Roots that are only lit
  // for a moment stay electric (and dissolve like before).
  const NATURE_DELAY = 0.3;                      // s: this long it is pure electricity (was 0.8)
  const NATURE_SECONDS = 1.5;                    // s of light after that until it is fully 'nature' (was 2.5)
  const NATURE_FROM_PARENT = 0.5;                // new branches of a green root start this far along (0 = electric again)
  const NATURE_AREA = 120;                       // px: new roots that start in an area that's already green...
  const NATURE_AREA_KEEP = 1;                    // ...start this green (1 = fully green, with leaves; 0 = off)
  const NATURE_SMOOTH = 5;                       // how much the line smooths out (points on each side)
  const NATURE_WIDTH = 0.5;                      // lines get up to 50% thicker
  const NATURE_GLOW = 0.5;                       // ...and their electric glow is halved
  const BRANCH_LEAF_AT = 0.35;                   // nature level when leaves start growing on a root (as the new look starts)
  const BRANCH_LEAF_EVERY = 9;                   // points between leaves along a root (a point is 6 px)
  const BRANCH_LEAF_MAX = 8;                     // leaves per root at most
  const BRANCH_LEAF_SCALE = [0.6, 0.95];         // they're smaller than the leaves at a spot
  const BRANCH_LEAF_SPREAD = 1.0;                // s: they don't all appear at once
  const ROUTE_LEAF_EVERY = 12;                   // [v2] a moving light's route gets a leaf every this many points...
  const ROUTE_LEAF_CHANCE = 0.6;                 // ...with this chance (also when it's still electric)
  const ROUTE_LEAF_SCALE = [0.55, 0.85];

  // [added v2] the 'nature' look (from Mirka's sketch): instead of thin electric strokes, green roots are drawn
  // as smooth shapes that swell and taper, in two tones, with a web of thin veins between them (like a leaf close up)
  const NATURE_LOOK_FROM = 0.3;                  // nature level where the new look starts to show...
  const NATURE_LOOK_TO = 0.9;                    // ...and where it has fully replaced the electric line
  const NATURE_THICKNESS = 5.5;                  // px: the thickest roots; branches get thinner (x0.72 per level)
  const NATURE_MIN_THICKNESS = 1.4;
  const NATURE_TIP_TAPER = 0.75;                 // 0.75 = after NATURE_TAPER_LENGTH a root is a quarter of its base width
  const NATURE_TAPER_LENGTH = 140;               // points (a point is 6 px), counted along parent + branch together
  const NATURE_KEEP_TONE = 0.75;                 // chance a branch has the same colour as the root it grows from
  const NATURE_SWELL = 0.22;                     // roots get slightly thicker and thinner along their length
  const NATURE_JOINT_BLEND = 8;                  // points over which a branch goes from its parent's width to its own
  const NATURE_WHITE_SHARE = [0.5, 0.3];         // chance of a white root: [main roots, branches]; the rest are green
  const NATURE_WHITE = [240, 248, 240];
  const NATURE_GREEN = [110, 232, 145];
  const NATURE_HALO = [[10, 0.05], [4, 0.12]];   // soft glow around them: [extra width px, opacity], wide first
  const VEIN_AT = 0.7;                           // nature level when veins start growing between roots
  const VEIN_EVERY = [5, 9];                     // points between veins along a root (a point is 6 px)
  const VEIN_LENGTH = [16, 80];                  // px: veins connect to roots this close...
  const VEIN_FREE_CHANCE = 0.45;                 // ...otherwise sometimes a short loose vein that just curls off
  const VEIN_WIDTH = 0.8;
  const VEIN_ALPHA = 0.55;
  const VEIN_GROW_SECONDS = 0.7;
  const VEIN_MAX = 700;
  const LEAF_ON_ROUTE_CHANCE = 0.12;             // chance of a leaf at a fork when drawing a route slowly
  const alive = (r) => roots.includes(r) && r.dissolving === undefined;
  let leader = null;                             // [added] the root that follows a moving light
  let prevLight = null, lightSpeed = 0, moveAngle = 0;
  let branchiness = 0.5;                         // [added] 1 = slow light (branch a lot), 0 = fast
  let tipForkCooldown = 0;

  // [added v2] several lights at once: every light keeps its own copy of the values above
  // (where it rests, its cooldowns, its moving route...). Before a light is handled its values are loaded,
  // afterwards they are saved again. The mouse/camera light is 'main', the fake lights get their own ids.
  const lightStates = new Map();                 // id -> that light's values
  const newLightState = () => ({ rest: null, branchCooldown: 0, sproutCooldown: 0, regrowCooldown: 0, leader: null,
    prevLight: null, lightSpeed: 0, moveAngle: 0, branchiness: 0.5, tipForkCooldown: 0 });
  function loadLight(st) {
    ({ rest, branchCooldown, sproutCooldown, regrowCooldown, leader, prevLight, lightSpeed, moveAngle, branchiness, tipForkCooldown } = st);
  }
  function saveLight(st) {
    Object.assign(st, { rest, branchCooldown, sproutCooldown, regrowCooldown, leader, prevLight, lightSpeed, moveAngle, branchiness, tipForkCooldown });
  }
  const isLeader = (root) => root === leader || [...lightStates.values()].some((st) => st.leader === root);
  const glows = new Map();                       // [added v2] one glow per light

  function getBrightness(pixels, pixelIndex) {
    const offset = pixelIndex * 4;
    return 0.299 * pixels[offset] + 0.587 * pixels[offset + 1] + 0.114 * pixels[offset + 2];
  }

  function startCalibration() {
    calibration = { sum: new Float32Array(WIDTH * HEIGHT), framesLeft: CALIBRATION_FRAMES };
    statusText.textContent = "Calibrating: keep the flashlight off…";
  }

  function addCalibrationFrame(pixels) {
    for (let i = 0; i < calibration.sum.length; i++) {
      calibration.sum[i] += getBrightness(pixels, i);
    }
    calibration.framesLeft--;

    if (calibration.framesLeft === 0) {
      reference = calibration.sum.map((total) => total / CALIBRATION_FRAMES);
      calibration = null;
    }
  }

  function findLight(pixels, threshold) {
    let litPixels = 0;
    let sumX = 0;
    let sumY = 0;

    for (let i = 0; i < reference.length; i++) {
      const isLit = getBrightness(pixels, i) - reference[i] > threshold;
      const offset = i * 4;

      maskImage.data[offset] = maskImage.data[offset + 1] = maskImage.data[offset + 2] = isLit ? 255 : 0;
      maskImage.data[offset + 3] = 255;

      if (isLit) {
        litPixels++;
        sumX += i % WIDTH;
        sumY += Math.floor(i / WIDTH);
      }
    }

    maskContext.putImageData(maskImage, 0, 0);

    return litPixels >= MIN_LIGHT_PIXELS
      ? { x: sumX / litPixels, y: sumY / litPixels, size: litPixels }
      : null;
  }

  function drawMarker({ x, y }) {
    cameraContext.strokeStyle = "#ff3b6b";
    cameraContext.lineWidth = 2;
    cameraContext.beginPath();
    cameraContext.arc(x, y, 8, 0, Math.PI * 2);
    cameraContext.stroke();
  }

  function holdLight(light, deltaSeconds) {
    if (light) {
      lastLight = light;
      lightLostSeconds = 0;
      return light;
    }

    lightLostSeconds += deltaSeconds;
    if (lightLostSeconds >= LIGHT_HOLD_SECONDS) lastLight = null;
    return lastLight;
  }

  function detectFrame(pixels, deltaSeconds) {
    if (calibration) {
      addCalibrationFrame(pixels);
      return null;
    }

    if (!reference) {
      statusText.textContent = "Flashlight off, then press Calibrate.";
      return null;
    }

    const light = holdLight(findLight(pixels, Number(thresholdSlider.value)), deltaSeconds);

    if (light) {
      drawMarker(light);
      statusText.textContent = `Light at x ${Math.round(light.x)}, y ${Math.round(light.y)} (${light.size} pixels)`;
    } else {
      statusText.textContent = "No light detected";
    }

    return light;
  }

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function getDistance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function getAngle(from, to) {
    return Math.atan2(to.y - from.y, to.x - from.x);
  }

  function randomBurstSteps() {
    return Math.round(randomBetween(MIN_BURST_STEPS, MAX_BURST_STEPS));
  }

  function randomStepsUntilSplit() {
    return Math.round(randomBetween(MIN_STEPS_BETWEEN_SPLITS, MAX_STEPS_BETWEEN_SPLITS));
  }

  function createRoot(
    { x, y },
    angle,
    {
      kind,
      burstSteps = 0,
      branchLength = randomBurstSteps(),
      opacity = 1,
      parent = null,
      attachIndex = 0,
      homeAngle = angle,
      spot = null,
    },
  ) {
    const greenHere = natureNear({ x, y }) * NATURE_AREA_KEEP;      // [v2]
    return {
      points: [{ x, y, t: now }],                   // [changed] points remember when they grew
      born: now,                                    // [added]
      depth: parent ? parent.depth + 1 : 0,          // [added] branches are thinner
      nature: Math.max(parent ? (parent.nature ?? 0) * NATURE_FROM_PARENT : 0, greenHere),   // [v2] 0 = electricity, 1 = green
      bornGreen: greenHere > 0.5,          // [v2] grows green right away (no electric spark)
      litTime: 0,
      spot: spot ? spot.id : parent ? parent.spot : 0, // [added] which planting spot it belongs to
      target: null,                                  // [added] connecting roots grow towards this point
      targetRoot: null,                              // [added] ...on this root
      targetIndex: 0,
      charge: -10,                                   // [added] last time a pulse of light ran through it
      angle,
      homeAngle,
      taperSteps: TAPER_STEPS,
      kind,
      parent,
      attachIndex,
      burstSteps,
      branchLength,
      stepsUntilSplit: randomStepsUntilSplit(),
      distanceToGrow: 0,
      opacity,
      lightDistance: Infinity,
      isLit: true,
      unlitSeconds: 0,
      shrinkSpeed: 0,
      distanceToShrink: 0,
      childLimit: 0,
      pathSteps: 0,
    };
  }

  function spreadRoots(position, count, options) {
    const slice = (Math.PI * 2) / count;

    for (let i = 0; i < count; i++) {
      const angle = (i + 0.5) * slice + randomBetween(-0.35, 0.35) * slice;   // [changed] evenly around, not symmetric
      const burstSteps = randomBurstSteps();
      roots.push(createRoot(position, angle, { ...options, burstSteps, branchLength: burstSteps }));
    }
  }

  function addSpot({ x, y }) {                                          // [added]
    const spot = { x, y, id: ++spotCount };
    spots.push(spot);
    return spot;
  }

  function spotNear(light) {                                           // [added]
    return light ? spots.find((spot) => getDistance(spot, light) < CLUSTER_SPACING) : null;
  }

  // [added] closest root point that does NOT belong to the spot at the light
  function closestOtherPoint(light, excludeSpotId, excludeRoot = null) {
    let closest = null;
    for (const root of roots) {
      if (root === excludeRoot || (excludeSpotId && root.spot === excludeSpotId)) continue;
      const point = findClosestPoint(root, light);
      if (!closest || point.distance < closest.distance) closest = point;
    }
    return closest;
  }

  // [added] the closest points on up to `count` different roots (not from the given spot), within reach
  function nearbyRoots(light, excludeSpotId, count) {
    const found = [];
    for (const root of roots) {
      if (excludeSpotId && root.spot === excludeSpotId) continue;
      const point = findClosestPoint(root, light);
      if (point.distance <= CONNECT_REACH) found.push(point);
    }
    found.sort((a, b) => a.distance - b.distance);
    const picked = [], usedSpots = new Set();
    for (const p of found) {                                    // prefer different spots, then anything
      if (picked.length >= count) break;
      if (!usedSpots.has(p.root.spot)) { picked.push(p); usedSpots.add(p.root.spot); }
    }
    for (const p of found) { if (picked.length >= count) break; if (!picked.includes(p)) picked.push(p); }
    return picked;
  }

  function aimAt(root, targetRoot, targetIndex) {
    root.targetRoot = targetRoot; root.targetIndex = targetIndex;
    const p = targetRoot.points[Math.min(targetIndex, targetRoot.points.length - 1)];
    root.target = { x: p.x, y: p.y };
  }

  // [added] a cluster at the light (random size) that grows into the roots around it:
  //  - its own roots spread out
  //  - 1-3 connecting roots grow from the light onto nearby roots
  //  - 1-2 nearby roots send a branch back towards the light
  function plantConnectingCluster(light) {
    const reused = spots.find((sp) => getDistance(sp, light) < SPOT_REUSE);
    const spot = reused ?? addSpot(light);
    const size = randomBetween(CLUSTER_MIN_SIZE, CLUSTER_MAX_SIZE);
    // holding still on the same spot adds a few roots each time, a new spot gets a full cluster
    const count = reused ? Math.round(randomBetween(1, 2)) : Math.round(randomBetween(CLUSTER_MIN_ROOTS, CLUSTER_MAX_ROOTS));
    const slice = (Math.PI * 2) / count, offset = Math.random() * slice;
    for (let i = 0; i < count; i++) {
      const angle = offset + (i + 0.5) * slice + randomBetween(-0.35, 0.35) * slice;
      const burstSteps = Math.max(3, Math.round(randomBurstSteps() * size));
      roots.push(createRoot(light, angle, { kind: "planted", burstSteps, branchLength: burstSteps, spot }));
    }
    const near = nearbyRoots(light, spot.id, MAX_CONNECTORS);
    near.forEach(({ root, index, distance }, k) => {
      if (k > 0 && Math.random() < 0.35) return;                              // variety: sometimes fewer
      if (distance < STEP_LENGTH * 2) { root.charge = now; return; }          // already touching: just light it up
      const point = root.points[index];
      const steps = Math.ceil(distance / STEP_LENGTH) + 6;
      const connector = createRoot(light, getAngle(light, point), {
        kind: "connector", burstSteps: steps, branchLength: Math.min(steps, MAX_BURST_STEPS), spot,
      });
      aimAt(connector, root, index);
      roots.push(connector);
    });
    // existing roots reach back towards the light, so both sides grow into each other
    near.slice(0, MAX_REACHERS).forEach(({ root, index, distance }) => {
      if (distance < BRANCH_DISTANCE * 0.5) return;
      const point = root.points[index];
      const steps = Math.ceil(distance / STEP_LENGTH) + 4;
      const reacher = createRoot(point, getAngle(point, light), {
        kind: "connector", burstSteps: steps, branchLength: Math.min(steps, MAX_BURST_STEPS),
        parent: root, attachIndex: index, opacity: root.opacity,
      });
      reacher.target = { x: light.x, y: light.y };
      roots.push(reacher);
    });
    if (!reused) flashes.push({ x: light.x, y: light.y, t: now });     // flash only for a new spot
    if (!reused) pendingLeaves.push({ at: now + randomBetween(0.8, 1.6), spot });            // [added] leaves
    else if (flowers && Math.random() < FLOWER_ON_HOLD && flowers.tryFlower(spot.x, spot.y, () => spotAlive(spot))) flowerSpots.add(spot.id);   // [added]
  }

  // [added] another press on an existing spot: its roots get longer, new branches sprout from inside them,
  // a few new roots come out of the centre, and the whole spot pulses with light
  function spotAlive(spot) {                                          // [added]
    return spots.includes(spot) && roots.some((r) => r.spot === spot.id && r.dissolving === undefined);
  }

  // [v2] leaves along a root that has turned green: spaced out, branching off to either side
  // [changed] planned as the root grows, so roots that are green from the start get leaves too
  function planBranchLeaves(root) {
    root.leafNext ??= Math.round(BRANCH_LEAF_EVERY * randomBetween(0.4, 0.9));
    root.leafCount ??= 0;
    while (root.leafCount < BRANCH_LEAF_MAX && root.points.length - 1 > root.leafNext + 2) {
      pendingBranchLeaves.push({ at: now + Math.random() * BRANCH_LEAF_SPREAD, root, index: root.leafNext });
      root.leafCount++;
      root.leafNext += Math.round(BRANCH_LEAF_EVERY * randomBetween(0.7, 1.3));
    }
  }

  // [v2] thin veins: from a point on a green root to the nearest point on another green root close by
  // (or a short loose curl). They grow in, and go when one of their roots starts to dissolve.
  function planVeins(root) {
    root.veinNext ??= Math.round(randomBetween(2, VEIN_EVERY[1]));
    while (root.veinNext < root.points.length - 3 && veins.length < VEIN_MAX) {
      const ai = root.veinNext;
      root.veinNext += Math.round(randomBetween(...VEIN_EVERY));
      const a = root.points[ai];
      let best = null, bestD = VEIN_LENGTH[1];
      for (const other of roots) {
        if (other === root || !(other.nature > 0.5) || other.dissolving !== undefined) continue;
        if (other.parent === root && Math.abs(other.attachIndex - ai) < 6) continue;   // not to its own branch right there
        if (root.parent === other && Math.abs(root.attachIndex - ai) < 6) continue;
        for (let j = other.cut ?? 0; j < other.points.length; j += 2) {
          const d = getDistance(a, other.points[j]);
          if (d < bestD && d > VEIN_LENGTH[0]) { bestD = d; best = { b: other, bi: j }; }
        }
      }
      const bend = [randomBetween(-0.45, 0.45), randomBetween(-0.45, 0.45)];
      if (best) veins.push({ a: root, ai, b: best.b, bi: best.bi, bend, born: now });
      else if (Math.random() < VEIN_FREE_CHANCE) {
        const next = root.points[Math.min(ai + 1, root.points.length - 1)];
        const ang = getAngle(a, next) + (Math.random() < 0.5 ? -1 : 1) * randomBetween(0.6, 1.3);
        const len = randomBetween(14, 34);
        veins.push({ a: root, ai, b: null, end: { dx: Math.cos(ang) * len, dy: Math.sin(ang) * len }, bend, born: now });
      }
    }
  }

  // [v2] leaves along the route of a moving light, a little behind its tip
  function planRouteLeaves(root) {
    root.routeLeafNext ??= Math.round(ROUTE_LEAF_EVERY * randomBetween(0.3, 1));
    while (root.points.length - 1 > root.routeLeafNext + 3) {
      if (Math.random() < ROUTE_LEAF_CHANCE) {
        pendingBranchLeaves.push({ at: now + randomBetween(0.15, 0.6), root, index: root.routeLeafNext });
        root.routeLeaf = true;
      }
      root.routeLeafNext += Math.round(ROUTE_LEAF_EVERY * randomBetween(0.6, 1.4));
    }
  }

  // [v2] how green it is around a point already (0 = nothing / electric, 1 = fully green)
  function natureNear(pos) {
    let best = 0;
    for (const root of roots) {
      if (!(root.nature > best) || root.dissolving !== undefined) continue;
      for (let i = root.cut ?? 0; i < root.points.length; i += 2) {
        if (getDistance(root.points[i], pos) < NATURE_AREA) { best = root.nature; break; }
      }
    }
    return best;
  }

  // [v2] leaves go when the piece of root they sit on dissolves (a bit before or after, see the flowers settings);
  // returns true while it's there, otherwise the time that piece goes
  function leafAnchor(root, index) {
    return () => (alive(root) && (root.cut ?? 0) <= index) || (root.points[index]?.dissolveAt ?? now);
  }
  function growBranchLeaves() {
    if (!flowers) return;
    const due = pendingBranchLeaves.filter((l) => now >= l.at);
    pendingBranchLeaves = pendingBranchLeaves.filter((l) => now < l.at);
    for (const { root, index } of due) {
      if (!alive(root) || index >= root.points.length - 1 || (root.cut ?? 0) > index) continue;
      const pt = root.points[index], next = root.points[index + 1];
      const dir = getAngle(pt, next) + (Math.random() < 0.5 ? -1 : 1) * randomBetween(0.5, 1.1);
      flowers.tryLeaves(pt.x, pt.y, leafAnchor(root, index), dir, randomBetween(...(root.routeLeaf ? ROUTE_LEAF_SCALE : BRANCH_LEAF_SCALE)), 20);
    }
  }

  // [added] put 1-2 leaf clusters on the roots of a spot
  function growLeaves() {
    if (!flowers) return;
    const due = pendingLeaves.filter((l) => now >= l.at);
    pendingLeaves = pendingLeaves.filter((l) => now < l.at);
    for (const { spot } of due) {
      if (Math.random() > LEAF_CHANCE) continue;                       // not every spot gets leaves
      const own = roots.filter((r) => r.spot === spot.id && alive(r) && r.points.length >= 6);
      const n = Math.round(randomBetween(LEAVES_PER_SPOT[0], LEAVES_PER_SPOT[1]));
      for (let k = 0; k < n && own.length; k++) {
        const r = own[Math.floor(Math.random() * own.length)];
        const index = Math.floor((r.points.length - 1) * randomBetween(0.4, 0.8));
        const pt = r.points[index], next = r.points[Math.min(index + 1, r.points.length - 1)];
        const dir = Math.random() < ROSETTE_CHANCE ? null                // leaves branch off the root, to one side
          : getAngle(pt, next) + (Math.random() < 0.5 ? -1 : 1) * randomBetween(0.4, 1.0);
        flowers.tryLeaves(pt.x, pt.y, leafAnchor(r, index), dir);
      }
    }
  }

  function boostSpot(spot, light) {
    const decayed = Math.max(0, (spot.boost ?? 0) - (now - (spot.boostedAt ?? now)) / BOOST_DECAY_SECONDS);
    spot.boost = Math.min(decayed + 1, BOOST_MAX); spot.boostedAt = now;
    const b = spot.boost, grow = 1 + 0.12 * b;
    const own = roots.filter((r) => r.spot === spot.id && r.dissolving === undefined && r.points.length > 2);
    for (const r of own) {                                              // longer
      r.burstSteps += Math.round(randomBetween(BOOST_LONGER[0], BOOST_LONGER[1]) * grow);
      r.charge = now;
    }
    const inner = Math.min(BOOST_INNER_BRANCHES + Math.round(b), 10);  // new branches from inside the roots
    for (let k = 0; k < inner && own.length && !isAtPointLimit(); k++) {
      const r = own[Math.floor(Math.random() * own.length)];
      const index = Math.floor(randomBetween(0.25, 0.9) * (r.points.length - 1));
      const a = r.points[index], next = r.points[Math.min(index + 1, r.points.length - 1)];
      const dir = getAngle(a, next) + (Math.random() < 0.5 ? -1 : 1) * randomBetween(MIN_SPLIT_ANGLE, MAX_SPLIT_ANGLE);
      const steps = Math.round(randomBetween(4, 10) * grow);
      roots.push(createRoot(a, dir, { kind: "side", burstSteps: steps, branchLength: steps, parent: r, attachIndex: index, opacity: 1 }));
    }
    const fresh = Math.min(BOOST_NEW_ROOTS + Math.round(b * 0.7), 5);        // new roots from the centre
    const slice = (Math.PI * 2) / fresh, offset = Math.random() * slice;
    for (let i = 0; i < fresh; i++) {
      const steps = Math.round(randomBurstSteps() * randomBetween(0.6, 1) * (1 + 0.15 * b));
      roots.push(createRoot(spot, offset + (i + 0.5) * slice + randomBetween(-0.4, 0.4) * slice,
        { kind: "planted", burstSteps: steps, branchLength: steps, spot }));
    }
    flashes.push({ x: spot.x, y: spot.y, t: now, r: FLASH_RADIUS * (0.6 + 0.1 * b) });
    if (flowers && b >= FLOWER_AT_BOOST) {                                // [added] flowers on a busy spot
      const n = Math.round(randomBetween(FLOWERS_AT_BOOST[0], FLOWERS_AT_BOOST[1]));
      const made = n > 1 ? flowers.tryFlowerGroup(spot.x, spot.y, () => spotAlive(spot), n) : flowers.tryFlower(spot.x, spot.y, () => spotAlive(spot));
      if (made) flowerSpots.add(spot.id);                                // [added] its roots stay longer
    }
  }

  function plantRoots(position) {
    const spot = addSpot(position);                                    // [added]
    spreadRoots(position, ROOTS_PER_SPOT, { kind: "planted", spot });
    pendingLeaves.push({ at: now + randomBetween(0.8, 1.6), spot });   // [added]
    flashes.push({ x: position.x, y: position.y, t: now });   // [added]
  }

  function sproutRoots({ root, index }) {
    spreadRoots(root.points[index], ROOTS_PER_SPROUT, {
      kind: "sprout",
      parent: root,
      attachIndex: index,
      opacity: root.opacity,
    });
  }

  function isAtPointLimit() {
    return roots.reduce((total, { points }) => total + points.length, 0) >= MAX_POINTS;
  }

  function splitBranch(root) {
    const branchLength = root.branchLength * BRANCH_SHRINK;
    if (branchLength < MIN_BRANCH_STEPS) return;

    const side = Math.random() < 0.5 ? -1 : 1;
    const angle = root.angle + side * randomBetween(MIN_SPLIT_ANGLE, MAX_SPLIT_ANGLE);

    roots.push(
      createRoot(root.points.at(-1), angle, {
        kind: "side",
        burstSteps: Math.round(branchLength),
        branchLength,
        opacity: root.opacity,
        parent: root,
        attachIndex: root.points.length - 1,
        homeAngle: root.homeAngle,
      }),
    );
  }

  function getAngleDifference(from, to) {
    const difference = to - from;
    return Math.atan2(Math.sin(difference), Math.cos(difference));
  }

  function steerToward(root, target, amount = STEER) {
    root.angle += getAngleDifference(root.angle, getAngle(root.points.at(-1), target)) * amount;
  }

  function limitToHome(root) {
    const turn = getAngleDifference(root.homeAngle, root.angle);
    root.angle = root.homeAngle + Math.max(-MAX_TURN_FROM_HOME, Math.min(MAX_TURN_FROM_HOME, turn));
  }

  function growRoot(root, distance, target = null) {
    if (isAtPointLimit()) return;

    root.distanceToGrow += distance;

    while (root.distanceToGrow >= STEP_LENGTH) {
      if (target) steerToward(root, target, isLeader(root) ? LEADER_STEER : STEER);
      const wobble = isLeader(root) ? LEADER_WOBBLE : now - root.born < SPARK_SECONDS && !root.bornGreen ? SPARK_WOBBLE : WOBBLE;   // [changed]
      root.angle += randomBetween(-wobble, wobble);

      if (target) {
        root.homeAngle = root.angle;
      } else {
        limitToHome(root);
      }

      const tip = root.points.at(-1);
      root.points.push({
        x: tip.x + Math.cos(root.angle) * STEP_LENGTH,
        y: tip.y + Math.sin(root.angle) * STEP_LENGTH,
        t: now,                                     // [added]
      });

      root.distanceToGrow -= STEP_LENGTH;
      root.burstSteps = Math.max(0, root.burstSteps - 1);

      root.stepsUntilSplit--;
      if (root.stepsUntilSplit <= 0) {
        splitBranch(root);
        const br = root.branchiness ?? branchiness;                     // [v2] each route keeps its own
        root.stepsUntilSplit = isLeader(root)                          // [changed] twigs along the route depend on speed
          ? Math.round(randomBetween(
              TWIG_GAP_FAST[0] + (TWIG_GAP_SLOW[0] - TWIG_GAP_FAST[0]) * br,
              TWIG_GAP_FAST[1] + (TWIG_GAP_SLOW[1] - TWIG_GAP_FAST[1]) * br))
          : randomStepsUntilSplit();
      }
    }
  }

  function getOwnGrowSpeed(root, lights) {                           // [v2] any light can feed a root
    if (root.burstSteps === 0) return 0;
    const speed = now - root.born < SPARK_SECONDS ? GROW_SPEED * SPARK_SPEED : GROW_SPEED;   // [added] fast spark

    if (root.kind === "side" || root.kind === "connector") return speed;   // [changed] connectors keep growing

    return lights.some((light) => getDistance(root.points[0], light) < LIGHT_REACH) ? speed : 0;
  }

  function updateRootLight(root, isFollowing, deltaSeconds) {
    root.isLit = isFollowing || root.lightDistance < LIGHT_REACH || Boolean(root.parent?.isLit);

    if (root.isLit) {
      root.litTime += deltaSeconds;                                  // [v2] light stays -> it turns into nature
      if (root.litTime > NATURE_DELAY) root.nature = Math.min(1, root.nature + deltaSeconds / NATURE_SECONDS);
      if (root.nature >= BRANCH_LEAF_AT) planBranchLeaves(root);
      root.opacity = Math.min(1, root.opacity + deltaSeconds / BRIGHTEN_SECONDS);
      root.unlitSeconds = 0;
      root.shrinkSpeed = 0;
      root.distanceToShrink = 0;
    } else {
      root.opacity = Math.max(DIM_FLOOR, root.opacity - deltaSeconds / DIM_SECONDS);
      root.unlitSeconds += deltaSeconds;
    }
  }

  // go backwards so kids are done before their parents read them
  function updateRootTree() {
    for (const root of roots) {
      root.childLimit = 0;
      root.pathSteps = root.points.length - 1;
    }

    for (let i = roots.length - 1; i >= 0; i--) {
      const { parent, attachIndex, pathSteps } = roots[i];
      if (!parent) continue;

      parent.childLimit = Math.max(parent.childLimit, attachIndex);
      parent.pathSteps = Math.max(parent.pathSteps, attachIndex + pathSteps);
    }
  }

  function canShrink(root) {
    const carries = root.keep || flowerSpots.has(root.spot);   // [added] roots with flowers stay longer
    return !root.isLit && root.unlitSeconds >= SHRINK_DELAY_SECONDS + (carries ? FLOWER_ROOT_EXTRA_SECONDS : 0);
  }

  // [added] a flower grows on this root: keep it (and the roots it branches from) a bit longer
  function keepRoot(root) {
    for (let r = root; r; r = r.parent) r.keep = true;
  }

  function shrinkRoot(root, deltaSeconds) {
    if (!canShrink(root)) return;

    if (root.shrinkSpeed === 0) {
      root.shrinkSpeed = root.parent?.shrinkSpeed || (root.pathSteps * STEP_LENGTH) / SHRINK_SECONDS;
    }

    root.distanceToShrink += root.shrinkSpeed * deltaSeconds;

    while (root.distanceToShrink >= STEP_LENGTH) {
      if (root.points.length - 1 <= root.childLimit) {
        root.distanceToShrink = 0;
        break;
      }

      root.points.pop();
      root.distanceToShrink -= STEP_LENGTH;
    }
  }

  function updateTaper(root, deltaSeconds) {
    const stepsPastLastChild = root.points.length - 1 - root.childLimit;
    const target = Math.min(TAPER_STEPS, stepsPastLastChild);
    const change = TAPER_EASE_SPEED * deltaSeconds;

    root.taperSteps += Math.max(-change, Math.min(change, target - root.taperSteps));
  }

  function isGone(root) {
    if (root.dissolving !== undefined) return now >= root.dissolveEnd;          // [changed]
    return canShrink(root) && root.points.length <= 1;
  }

  // [added] one particle at a root point, appearing at time `born`
  function spawnParticle(root, point, born) {
    const green = smooth((now - point.t - SPARK_SECONDS * 0.5) / TO_GREEN_SECONDS);
    const a = Math.random() * Math.PI * 2, sp = PARTICLE_SPEED * (0.3 + Math.random());
    particles.push({
      x: point.x, y: point.y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - PARTICLE_RISE,
      born,
      life: randomBetween(PARTICLE_LIFE_MIN, PARTICLE_LIFE_MAX),
      size: PARTICLE_SIZE * (0.5 + Math.random()),
      color: mixColor(ELECTRIC_COLOR, GREEN_COLOR, green),
      alpha: root.opacity,
    });
  }

  // [added] instead of shrinking back: dissolve. The oldest parts go first, each root starts at a slightly
  // different moment, and every point gets some random timing, so it never all happens at once.
  function dissolveRoot(root) {
    if (isLeader(root)) return;                                   // the route that follows a light stays (its tail trims itself)
    const orphaned = root.parent && (root.parent.dissolving !== undefined || !roots.includes(root.parent)   // [added] parent is going/gone
      || (root.parent.cut ?? 0) > root.attachIndex);                                                      // or its branch point is
    if (root.dissolving !== undefined || (!canShrink(root) && !orphaned)) return;
    const pts = root.points, from = root.cut ?? 0, last = pts.length - 1;
    const start = now + Math.random() * ROOT_JITTER;
    let tMin = Infinity, tMax = -Infinity;
    for (let i = from; i <= last; i++) { tMin = Math.min(tMin, pts[i].t); tMax = Math.max(tMax, pts[i].t); }
    root.dissolving = now;
    let end = start;
    for (let i = from; i <= last; i++) {
      const oldness = tMax > tMin ? (tMax - pts[i].t) / (tMax - tMin) : 0.5;   // 1 = grew first
      const at = start + (1 - oldness) * DISSOLVE_SECONDS * 0.75 + Math.random() * DISSOLVE_SECONDS * PARTICLE_RANDOMNESS;
      pts[i].dissolveAt = at;
      end = Math.max(end, at);
      if (particleToggle.checked && (i - from) % PARTICLE_EVERY === 0) spawnParticle(root, pts[i], at);
    }
    root.dissolveEnd = particleToggle.checked ? end + LINE_FADE_SECONDS : now + DISSOLVE_SECONDS * 1.5;   // [changed] let the last pieces fade
  }

  // [added] a route that follows the light: the parts the light left behind dissolve while you keep moving
  function trimTrail(root, light) {
    const pts = root.points;
    let cut = root.cut ?? 0;
    for (let i = cut; i < pts.length; i++) if (getDistance(pts[i], light) < LIGHT_REACH) pts[i].lit = now;
    while (cut < pts.length - 2 && now - (pts[cut].lit ?? pts[cut].t) > SHRINK_DELAY_SECONDS) {
      const at = now + Math.random() * DISSOLVE_SECONDS * PARTICLE_RANDOMNESS;
      pts[cut].dissolveAt = at;                                    // [added] fades out instead of vanishing
      if (particleToggle.checked) spawnParticle(root, pts[cut], at);
      cut++;
    }
    root.cut = cut;
    // [added] the drawn line starts a bit before the cut while those pieces fade out
    root.visibleFrom = root.visibleFrom ?? 0;
    while (root.visibleFrom < cut && now - (pts[root.visibleFrom].dissolveAt ?? 0) > LINE_FADE_SECONDS) root.visibleFrom++;
  }

  function updateParticles(deltaSeconds) {
    particles = particles.filter((q) => now < q.born + q.life);
    for (const q of particles) {
      if (now < q.born) continue;
      const loose = smooth((now - q.born) / PARTICLE_LOOSEN);             // [added] still at first, then drifts
      q.x += q.vx * deltaSeconds * loose; q.y += q.vy * deltaSeconds * loose;
      q.vx *= 1 - 0.6 * deltaSeconds; q.vy *= 1 - 0.6 * deltaSeconds;     // slow down
    }
  }

  function drawParticles() {
    for (const q of particles) {
      if (now < q.born) continue;
      const k = (now - q.born) / q.life;                                  // 0 -> 1
      const size = q.size * (1 - k);
      if (size <= 0.05) continue;
      const fadeIn = smooth((now - q.born) / PARTICLE_FADE_IN);           // [changed] soft fade in
      growthContext.fillStyle = `rgba(${q.color}, ${q.alpha * (1 - k) * fadeIn})`;
      growthContext.beginPath();
      growthContext.arc(q.x, q.y, size, 0, Math.PI * 2);
      growthContext.fill();
    }
  }

  function updateRest(light, deltaSeconds) {
    if (!light) {
      rest = null;
      regrowCooldown = 0;                                       // [added] a new press grows right away
      return false;
    }

    if (!rest || getDistance(rest, light) > REST_MOVEMENT) {
      rest = { x: light.x, y: light.y, seconds: 0 };
      return false;
    }

    rest.seconds += deltaSeconds;
    return rest.seconds >= REST_SECONDS;
  }

  function findClosestPoint(root, light) {
    let closest = { root, index: 0, distance: Infinity };

    root.points.forEach((point, index) => {
      if (index < (root.cut ?? 0)) return;                    // [added] that part is already gone
      const distance = getDistance(point, light);
      if (distance < closest.distance) closest = { root, index, distance };
    });

    return closest;
  }

  function followLight({ root, index, distance }, light, deltaSeconds) {
    const isNearTip = root.points.length - 1 - index <= TIP_STEPS;

    if (isNearTip && distance > ARRIVE_DISTANCE) {
      growRoot(root, GROW_SPEED * deltaSeconds, light);
    } else if (!isNearTip && distance > BRANCH_DISTANCE && branchCooldown === 0) {
      const point = root.points[index];
      roots.push(
        createRoot(point, getAngle(point, light), {
          kind: "followed",
          parent: root,
          attachIndex: index,
          opacity: root.opacity,
        }),
      );
      branchCooldown = BRANCH_COOLDOWN_SECONDS;
    }
  }

  function measureLight(light) {
    let closest = null;

    for (const root of roots) {
      const point = light && findClosestPoint(root, light);
      root.lightDistance = point ? point.distance : Infinity;

      if (point && (!closest || point.distance <= closest.distance)) closest = point;
    }

    return closest;
  }

  function isNearPlantingSpot(light) {
    return roots.some(
      (root) => root.kind === "planted" && getDistance(root.points[0], light) < PLANT_SPACING,
    );
  }

  // [added] pick the root that should grow along with a moving light:
  // a tip close to the light that points the way the light is moving; otherwise a new branch from the closest root
  function pickLeader(light) {
    let best = null;
    for (const root of roots) {
      if (root.points.length < 2) continue;
      const tip = root.points.at(-1);
      const d = getDistance(tip, light);
      if (d > LEAD_GRAB) continue;
      const along = Math.cos(getAngleDifference(root.angle, moveAngle));       // 1 = same direction
      const score = d - 60 * along;
      if (!best || score < best.score) best = { root, score };
    }
    let chosen = best?.root;
    if (!chosen) {
      const near = closestOtherPoint(light, null);
      if (near && near.distance <= CONNECT_REACH) {
        const point = near.root.points[near.index];
        chosen = createRoot(point, getAngle(point, light), { kind: "followed", parent: near.root, attachIndex: near.index, opacity: near.root.opacity });
        roots.push(chosen);
      } else {
        plantConnectingCluster(light);                                         // nothing around: start fresh here
        return null;
      }
    }
    chosen.branchLength = LEADER_TWIG_STEPS / BRANCH_SHRINK;                   // its side twigs stay short
    chosen.stepsUntilSplit = Math.round(randomBetween(LEADER_TWIG_MIN_GAP, LEADER_TWIG_MAX_GAP));
    return chosen;
  }

  // [changed v2] several lights at once. Each light: speed, resting, which roots it feeds (before), then
  // planting / boosting / following (after). All roots are grown, dimmed and dissolved once in between.
  function updateRoots(lights, deltaSeconds) {
    growLeaves();                                                      // [added]
    growBranchLeaves();                                                // [v2]
    // [v2] veins: drop the ones whose roots are going (they fade out quickly), plan new ones
    for (const v of veins) if (!v.dying && (!alive(v.a) || (v.b && !alive(v.b)))) v.dying = now;
    veins = veins.filter((v) => !(v.dying && now - v.dying > 0.4));
    for (const root of roots) if (root.nature > VEIN_AT && root.dissolving === undefined) planVeins(root);
    for (const st of lightStates.values()) if (st.leader && alive(st.leader)) planRouteLeaves(st.leader);
    for (const id of [...lightStates.keys()]) if (!lights.some((l) => l.id === id)) lightStates.delete(id);   // that light went off
    const per = [];
    const nearest = new Map();                                         // root -> distance to the closest light
    const followed = new Set();
    for (const light of lights) {
      if (!lightStates.has(light.id)) lightStates.set(light.id, newLightState());
      const st = lightStates.get(light.id);
      loadLight(st);
      // [added] how fast and where the light moves
      if (light && prevLight) {
        const v = getDistance(light, prevLight) / Math.max(deltaSeconds, 1e-3);
        lightSpeed += (v - lightSpeed) * Math.min(1, deltaSeconds * 10);
        if (getDistance(light, prevLight) > 0.5) moveAngle = getAngle(prevLight, light);
      } else lightSpeed = 0;
      const newPress = Boolean(light) && !prevLight;                      // [added] light just switched on / mouse pressed
      prevLight = light ? { x: light.x, y: light.y } : null;
      const moving = Boolean(light) && lightSpeed > MOVE_SPEED;
      if (!light) leader = null;

      const isResting = updateRest(light, deltaSeconds) && !moving;   // [changed] only really standing still
      branchCooldown = Math.max(0, branchCooldown - deltaSeconds);
      sproutCooldown = Math.max(0, sproutCooldown - deltaSeconds);

      const closest = measureLight(light);
      const isWithinSpacing = closest && closest.distance <= PLANT_SPACING;
      // [changed] the roots that grow towards the light are the closest ones from ANOTHER spot
      const activeSpot = spotNear(light);
      const other = light ? closestOtherPoint(light, activeSpot?.id) : null;
      const followedRoot = moving && leader ? leader : other && other.distance <= PLANT_SPACING ? other.root : isWithinSpacing ? closest.root : null;
      for (const root of roots) nearest.set(root, Math.min(nearest.get(root) ?? Infinity, root.lightDistance));
      if (followedRoot) followed.add(followedRoot);
      per.push({ light, st, newPress, moving, isResting, closest, other, isWithinSpacing });
      saveLight(st);
    }
    for (const root of roots) root.lightDistance = nearest.get(root) ?? Infinity;
    if (!lights.length) leader = null;

    updateRootTree();

    for (const root of roots) {
      updateRootLight(root, followed.has(root), deltaSeconds);
      dissolveRoot(root);                          // [changed] was shrinkRoot: dissolve instead of growing back
      updateTaper(root, deltaSeconds);

      // [added] connectors follow their target root (it can grow or shrink)
      if (root.targetRoot) {
        if (!roots.includes(root.targetRoot) || root.targetRoot.points.length < 2) { root.targetRoot = null; root.target = null; }
        else { const tp = root.targetRoot.points[Math.min(root.targetIndex, root.targetRoot.points.length - 1)]; root.target = { x: tp.x, y: tp.y }; }
      }
      const speed = getOwnGrowSpeed(root, lights);
      if (speed > 0) growRoot(root, speed * deltaSeconds, root.target);   // [changed] connectors steer to their target
      if (root.target && getDistance(root.points.at(-1), root.target) < STEP_LENGTH * 1.8) {
        root.points.push({ x: root.target.x, y: root.target.y, t: now });   // [added] snap on: the lines really join
        root.burstSteps = 0;
        root.charge = now;                                                // a pulse of light runs through both
        if (root.targetRoot) root.targetRoot.charge = now;
        if (root.parent) root.parent.charge = now;
        flashes.push({ x: root.target.x, y: root.target.y, t: now, r: CONNECT_FLASH_RADIUS });
        if (flowers && Math.random() < FLOWER_ON_CONNECT) {                 // [added] a flower where roots connect
          const joined = root.targetRoot;
          const n = Math.round(randomBetween(FLOWERS_ON_CONNECT[0], FLOWERS_ON_CONNECT[1]));
          if (flowers.tryFlowerGroup(root.target.x, root.target.y, () => alive(root) && (!joined || roots.includes(joined)), n)) {
            keepRoot(root); if (joined) keepRoot(joined);                 // [added] the roots under the flowers stay longer
          }
        }
        root.target = null; root.targetRoot = null;
      }
    }

    roots = roots.filter((root) => !isGone(root));
    updateParticles(deltaSeconds);                                         // [added]
    spots = spots.filter((spot) => roots.some((root) => root.spot === spot.id));   // [added]
    for (const id of flowerSpots) if (!spots.some((spot) => spot.id === id)) flowerSpots.delete(id);   // [added]

    for (const p of per) {
      loadLight(p.st);
      afterLight(p, deltaSeconds);
      saveLight(p.st);
    }
  }

  function afterLight({ light, newPress, moving, isResting, closest, other, isWithinSpacing }, deltaSeconds) {
    // [added] moving: the main route grows along with the light (and nothing else gets in the way)
    if (moving) {
      if (!leader || !roots.includes(leader) || getDistance(leader.points.at(-1), light) > LEAD_LOST) leader = pickLeader(light);
      if (leader) {
        const d = getDistance(leader.points.at(-1), light);
        const speed = Math.min(MAX_FOLLOW_SPEED, Math.max(GROW_SPEED, d * FOLLOW_GAIN));
        // [added] slow = more branching, fast = cleaner line
        const target = 1 - Math.min(Math.max((lightSpeed - SLOW_SPEED) / (FAST_SPEED - SLOW_SPEED), 0), 1);
        branchiness += (target - branchiness) * Math.min(1, deltaSeconds * 4);
        leader.branchLength = (TWIG_STEPS_FAST + (TWIG_STEPS_SLOW - TWIG_STEPS_FAST) * branchiness) / BRANCH_SHRINK;
        if (d > STEP_LENGTH) growRoot(leader, Math.min(speed * deltaSeconds, d), light);   // never past the light
        // small forks right at the light when moving slowly
        tipForkCooldown -= deltaSeconds;
        if (branchiness > 0.3 && tipForkCooldown <= 0 && leader.points.length > 3 && !isAtPointLimit()) {
          const forks = branchiness > 0.75 && Math.random() < 0.5 ? 2 : 1;
          for (let k = 0; k < forks; k++) {
            const side = Math.random() < 0.5 ? -1 : 1;
            const steps = Math.round(4 + 8 * branchiness * Math.random());
            roots.push(createRoot(leader.points.at(-1), leader.angle + side * randomBetween(0.6, 1.4), {
              kind: "side", burstSteps: steps, branchLength: steps, parent: leader,
              attachIndex: leader.points.length - 1, opacity: 1,
            }));
            if (flowers && Math.random() < LEAF_ON_ROUTE_CHANCE) {          // [added] now and then a leaf on the route
              const at = leader.points.length - 1, tip = leader.points[at], lead = leader;
              flowers.tryLeaves(tip.x, tip.y, leafAnchor(lead, at), leader.angle + side * randomBetween(0.5, 1.1));
            }
          }
          tipForkCooldown = TIP_FORK_EVERY_SLOW / Math.max(branchiness, 0.05) * randomBetween(0.7, 1.3);
        }
        leader.opacity = 1;
        leader.branchiness = branchiness;                                        // [v2]
        trimTrail(leader, light);                                                // [added]
      }
      return;
    }

    if (leader && light && roots.includes(leader)) trimTrail(leader, light);     // [added] also while standing still

    const isFarFromRoots = !closest || closest.distance > LIGHT_REACH;

    if (isResting && isFarFromRoots && !isNearPlantingSpot(light)) {
      plantRoots(light);
      sproutCooldown = SPROUT_SECONDS;
      return;
    }

    // [added] a new press on an existing spot makes that spot grow stronger
    if (newPress && !isAtPointLimit()) {
      const spot = spots.find((sp) => getDistance(sp, light) < BOOST_RADIUS);
      if (spot) { boostSpot(spot, light); regrowCooldown = REGROW_SECONDS; sproutCooldown = SPROUT_SECONDS; }
    }

    // [added] near or between existing roots: something always grows at the light, and connects
    regrowCooldown = Math.max(0, regrowCooldown - deltaSeconds);
    if (isResting && regrowCooldown === 0 && !isAtPointLimit()) {
      plantConnectingCluster(light);
      regrowCooldown = REGROW_SECONDS;
      sproutCooldown = SPROUT_SECONDS;
    }

    if (!isWithinSpacing) return;

    if (isResting && closest.distance <= BRANCH_DISTANCE && sproutCooldown === 0 && !isAtPointLimit()) {
      sproutRoots(closest);
      sproutCooldown = SPROUT_SECONDS;
    }

    followLight(other && other.distance <= PLANT_SPACING ? other : closest, light, deltaSeconds);   // [changed]
  }

  function updateGlow(lights, deltaSeconds) {                         // [changed v2] one glow per light
    for (const light of lights) {
      const g = glows.get(light.id) ?? { x: light.x, y: light.y, opacity: 0 };
      g.x = light.x; g.y = light.y; g.on = true;
      glows.set(light.id, g);
    }
    for (const [id, g] of glows) {
      if (g.on) g.opacity = Math.min(1, g.opacity + deltaSeconds / GLOW_IN_SECONDS);
      else { g.opacity = Math.max(0, g.opacity - deltaSeconds / GLOW_OUT_SECONDS); if (g.opacity === 0) glows.delete(id); }
      g.on = false;
    }
  }

  function drawGlow() {
    for (const glow of glows.values()) drawOneGlow(glow);
  }

  function drawOneGlow(glow) {
    const gradient = growthContext.createRadialGradient(glow.x, glow.y, 0, glow.x, glow.y, GLOW_RADIUS);
    gradient.addColorStop(0, `rgba(185, 245, 200, ${GLOW_STRENGTH})`);
    gradient.addColorStop(1, "rgba(185, 245, 200, 0)");

    growthContext.globalAlpha = glow.opacity;
    growthContext.fillStyle = gradient;
    growthContext.beginPath();
    growthContext.arc(glow.x, glow.y, GLOW_RADIUS, 0, Math.PI * 2);
    growthContext.fill();
  }

  // [changed] drawing: glowing lines, electric -> green over time, thinner towards tips and on branches
  const mixColor = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(", ");
  const smooth = (x) => { const c = Math.min(Math.max(x, 0), 1); return c * c * (3 - 2 * c); };

  function strokePiece(points, from, to, width, color, alpha, glowAlpha = GLOW_ALPHA) {
    growthContext.beginPath();
    growthContext.moveTo(points[from].x, points[from].y);
    for (let i = from + 1; i <= to; i++) growthContext.lineTo(points[i].x, points[i].y);
    growthContext.strokeStyle = `rgba(${color}, ${alpha * glowAlpha})`;
    growthContext.lineWidth = width * GLOW_WIDTH;
    growthContext.stroke();
    growthContext.strokeStyle = `rgba(${color}, ${alpha})`;
    growthContext.lineWidth = width;
    growthContext.stroke();
  }

  // [v2] the line as it is drawn: the more 'nature' a root is, the smoother (moving average of its points).
  // It starts where its parent's drawn line is, so branches stay attached. The tip stays at the real tip.
  function smoothLine(root, cache) {
    const pts = root.points, n = pts.length, k = (root.nature ?? 0);
    if (k < 0.01 || n < 3) { cache.set(root, pts); return pts; }
    const parentLine = root.parent && cache.get(root.parent);
    const start = parentLine?.[root.attachIndex] ?? pts[0];
    const out = new Array(n);
    out[0] = { x: pts[0].x + (start.x - pts[0].x), y: pts[0].y + (start.y - pts[0].y) };
    for (let i = 1; i < n; i++) {
      if (i === n - 1) { out[i] = pts[i]; break; }
      let sx = 0, sy = 0, c = 0;
      for (let j = Math.max(0, i - NATURE_SMOOTH); j <= Math.min(n - 1, i + NATURE_SMOOTH); j++) {
        const q = j === 0 ? out[0] : pts[j]; sx += q.x; sy += q.y; c++;
      }
      out[i] = { x: pts[i].x + (sx / c - pts[i].x) * k, y: pts[i].y + (sy / c - pts[i].y) * k };
    }
    cache.set(root, out);
    return out;
  }

  function drawFlashes() {
    flashes = flashes.filter((f) => now - f.t < 6);
    for (const f of flashes) {
      const k = Math.exp(-(now - f.t) / FLASH_SECONDS) * 0.85 + 0.15 * Math.max(0, 1 - (now - f.t) / 6);
      const R = f.r ?? FLASH_RADIUS;
      f.green ??= natureNear(f);                                     // [v2] in a green area the flash is green, not electric
      const g = growthContext.createRadialGradient(f.x, f.y, 0, f.x, f.y, R);
      g.addColorStop(0, `rgba(${mixColor([235, 242, 255], [225, 255, 225], f.green)}, ${0.55 * k * (1 - 0.3 * f.green)})`);
      g.addColorStop(0.25, `rgba(${mixColor([170, 200, 255], [150, 235, 170], f.green)}, ${0.18 * k})`);
      g.addColorStop(1, `rgba(${mixColor([150, 190, 255], [150, 235, 170], f.green)}, 0)`);
      growthContext.fillStyle = g;
      growthContext.fillRect(f.x - R, f.y - R, R * 2, R * 2);
    }
  }

  function drawRoots() {
    growthContext.lineJoin = "round";
    growthContext.lineCap = "round";
    growthContext.globalAlpha = 1;
    growthContext.globalCompositeOperation = "lighter";      // overlapping light adds up, like the references
    drawFlashes();

    const smoothed = new Map();                                             // [v2]
    for (const root of roots) smoothLine(root, smoothed);                   // [v2] every root's drawn line first
    for (const root of roots) {
      const { opacity, taperSteps, depth } = root;
      const points = root.points;
      const line = smoothed.get(root);                                      // [v2] where the line is drawn
      const nature = root.nature ?? 0;
      const look = smooth((nature - NATURE_LOOK_FROM) / (NATURE_LOOK_TO - NATURE_LOOK_FROM));   // [v2] 0 = electric line, 1 = nature shape
      const lastIndex = points.length - 1;
      const from = Math.min(root.visibleFrom ?? 0, root.cut ?? 0);   // [added] start of a route may be (fading) gone
      const dissolving = root.dissolving !== undefined;
      // [added] fade mode: the whole root fades; particle mode: pieces vanish when their particles appear
      const fade = dissolving && !particleToggle.checked ? 1 - Math.min((now - root.dissolving) / (DISSOLVE_SECONDS * 1.5), 1) : 1;
      if (lastIndex - from < 1) continue;
      const taperStart = Math.max(0, Math.ceil(lastIndex - taperSteps));
      const baseWidth = LINE_WIDTH * Math.pow(0.72, depth);

      for (let i = from; i < lastIndex; i += CHUNK) {
        const j = Math.min(i + CHUNK, lastIndex);
        // [changed] pieces fade out after their dissolve time instead of switching off
        const goneAt = Math.min(points[i].dissolveAt ?? Infinity, points[j].dissolveAt ?? Infinity);
        const pieceFade = goneAt === Infinity ? 1 : 1 - smooth((now - goneAt) / LINE_FADE_SECONDS);
        if (pieceFade <= 0) continue;
        const mid = (i + j) / 2;
        const taper = mid > taperStart ? (lastIndex - mid) / Math.max(taperSteps, 1) : 1;
        const age = now - points[i].t;
        const pulse = Math.exp(-(now - root.charge) / CHARGE_SECONDS);           // [added] connection pulse
        const fresh = root.bornGreen ? 1 : smooth((age - SPARK_SECONDS * 0.5) / TO_GREEN_SECONDS);   // [v2] green roots skip the spark
        const green = fresh * nature * (1 - pulse * (1 - nature));                // [v2] green roots stay green when a pulse runs through
        const flicker = green < 0.6 ? 0.7 + 0.3 * Math.random() : 1;              // electric flicker
        const alpha = pieceFade * fade * opacity * Math.min(Math.max(taper, 0), 1) * flicker * (1.25 - 0.25 * green) * (1 + 0.6 * pulse);
        const width = baseWidth * (0.45 + 0.55 * (1 - mid / Math.max(lastIndex, 1))) * (1 + NATURE_WIDTH * nature);
        if (look < 1) strokePiece(line, i, j, Math.max(width, 0.5), mixColor(ELECTRIC_COLOR, GREEN_COLOR, green), Math.min(alpha * (1 - look), 1),
          GLOW_ALPHA * (1 - NATURE_GLOW * nature));
        // [v2] the nature shape is drawn below in one piece; only the pieces that are dissolving are drawn here
        if (look > 0 && goneAt <= now) strokePiece(line, i, j, natureWidth(root, mid), natureColor(root), pieceFade * fade * opacity * look, 0.1);
      }
    }
    // [v2] nature look on top: veins, then the green roots, then the white ones
    growthContext.globalCompositeOperation = "source-over";
    drawVeins(smoothed);
    const natureRoots = roots.filter((r) => (r.nature ?? 0) > NATURE_LOOK_FROM);
    for (const white of [false, true]) {
      for (const root of natureRoots) if (isWhite(root) === white) drawNatureRoot(root, smoothed.get(root));
    }
    growthContext.globalCompositeOperation = "lighter";
    drawParticles();                                                        // [added]
    growthContext.globalCompositeOperation = "source-over";
  }

  // ---- [v2] nature look helpers
  const isWhite = (root) => (root.white ??= root.parent
    ? (Math.random() < NATURE_KEEP_TONE ? isWhite(root.parent) : !isWhite(root.parent))   // mostly the same as its parent
    : Math.random() < NATURE_WHITE_SHARE[0]);
  const natureColor = (root) => (isWhite(root) ? NATURE_WHITE : NATURE_GREEN);

  // width of a green root at point i. It continues from the root it grows out of (no jumps where a branch
  // starts): thinner the further from where the whole thing started, gently swelling, pointed at the end.
  const offsetOf = (root) => (root.offset ??= root.parent ? offsetOf(root.parent) + (root.attachIndex ?? 0) : 0);
  const treeSeed = (root) => (root.parent ? treeSeed(root.parent) : (root.seed ??= Math.random() * 100));
  function bodyWidth(root, i) {
    const total = offsetOf(root) + i;
    const own = Math.max(NATURE_THICKNESS * Math.pow(0.72, root.depth), NATURE_MIN_THICKNESS)
      * (1 - NATURE_TIP_TAPER * Math.min(total / NATURE_TAPER_LENGTH, 1))
      * (1 + NATURE_SWELL * Math.sin(total * 0.09 + treeSeed(root)));
    if (!root.parent || i >= NATURE_JOINT_BLEND || !roots.includes(root.parent)) return own;
    const from = bodyWidth(root.parent, Math.min(root.attachIndex ?? 0, root.parent.points.length - 1));
    return from + (own - from) * smooth(i / NATURE_JOINT_BLEND);              // grows out of its parent smoothly
  }
  function natureWidth(root, i) {
    const last = Math.max(root.points.length - 1, 1);
    const tip = Math.min(1, Math.pow(Math.max(last - i, 0) / 7, 0.6));        // rounds off into a point
    return Math.max(bodyWidth(root, i) * tip, 0.3);
  }

  // one smooth shape per root (no pieces, so no visible steps), with a soft glow around it
  function drawNatureRoot(root, line) {
    const look = smooth(((root.nature ?? 0) - NATURE_LOOK_FROM) / (NATURE_LOOK_TO - NATURE_LOOK_FROM));
    const fade = root.dissolving !== undefined && !particleToggle.checked ? 1 - Math.min((now - root.dissolving) / (DISSOLVE_SECONDS * 1.5), 1) : 1;
    const alpha = look * fade * root.opacity;
    if (alpha < 0.01) return;
    const from = Math.min(root.visibleFrom ?? 0, root.cut ?? 0);
    const last = line.length - 1;
    // runs of points that are still there (dissolving pieces are drawn as strokes in drawRoots)
    let run = [];
    const runs = [];
    for (let i = from; i <= last; i++) {
      if ((root.points[i].dissolveAt ?? Infinity) > now) run.push(i);
      else { if (run.length > 1) runs.push(run); run = []; }
    }
    if (run.length > 1) runs.push(run);
    const color = natureColor(root);
    for (const r of runs) {
      // every 2nd point (smoother), always keep the first and last
      const idx = r.filter((i, k) => k % 2 === 0 || k === r.length - 1);
      const left = [], right = [];
      for (let k = 0; k < idx.length; k++) {
        const i = idx[k];
        const p = line[i], a = line[idx[Math.max(k - 1, 0)]], b = line[idx[Math.min(k + 1, idx.length - 1)]];
        let tx = b.x - a.x, ty = b.y - a.y;
        const len = Math.hypot(tx, ty) || 1; tx /= len; ty /= len;
        const w = natureWidth(root, i) / 2;
        left.push({ x: p.x - ty * w, y: p.y + tx * w });
        right.push({ x: p.x + ty * w, y: p.y - tx * w });
      }
      const outline = [...left, ...right.reverse()];
      growthContext.beginPath();
      growthContext.moveTo(outline[0].x, outline[0].y);
      for (let k = 1; k < outline.length - 1; k++) {                       // curves through the midpoints = smooth
        const m = { x: (outline[k].x + outline[k + 1].x) / 2, y: (outline[k].y + outline[k + 1].y) / 2 };
        growthContext.quadraticCurveTo(outline[k].x, outline[k].y, m.x, m.y);
      }
      growthContext.lineTo(outline[outline.length - 1].x, outline[outline.length - 1].y);
      growthContext.closePath();
      for (const [extra, a] of NATURE_HALO) {
        growthContext.strokeStyle = `rgba(${color}, ${a * alpha})`;
        growthContext.lineWidth = extra;
        growthContext.stroke();
      }
      growthContext.fillStyle = `rgba(${color}, ${alpha})`;
      growthContext.fill();
    }
  }

  // thin wavy veins between the green roots; they grow in from one end
  function drawVeins(lines) {
    growthContext.lineWidth = VEIN_WIDTH;
    for (const v of veins) {
      const la = lines.get(v.a), lb = v.b && lines.get(v.b);
      if (!la || (v.b && !lb)) continue;
      const A = la[Math.min(v.ai, la.length - 1)];
      const B = v.b ? lb[Math.min(v.bi, lb.length - 1)] : { x: A.x + v.end.dx, y: A.y + v.end.dy };
      const look = (r) => smooth(((r.nature ?? 0) - NATURE_LOOK_FROM) / (NATURE_LOOK_TO - NATURE_LOOK_FROM)) * r.opacity;
      const dying = v.dying ? 1 - (now - v.dying) / 0.4 : 1;
      const alpha = VEIN_ALPHA * Math.min(look(v.a), v.b ? look(v.b) : 1) * Math.max(dying, 0);
      if (alpha < 0.01) continue;
      const t = smooth((now - v.born) / VEIN_GROW_SECONDS);
      const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1;
      const nx = -dy / d, ny = dx / d;
      // S-shaped curve: two control points pushed to different sides
      const P = [A, { x: A.x + dx / 3 + nx * v.bend[0] * d, y: A.y + dy / 3 + ny * v.bend[0] * d },
        { x: A.x + dx * 2 / 3 + nx * v.bend[1] * d, y: A.y + dy * 2 / 3 + ny * v.bend[1] * d }, B];
      // only the part that has grown in (de Casteljau split at t)
      const lerp = (p, q) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
      const p01 = lerp(P[0], P[1]), p12 = lerp(P[1], P[2]), p23 = lerp(P[2], P[3]);
      const p012 = lerp(p01, p12), p123 = lerp(p12, p23), end = lerp(p012, p123);
      growthContext.beginPath();
      growthContext.moveTo(A.x, A.y);
      growthContext.bezierCurveTo(p01.x, p01.y, p012.x, p012.y, end.x, end.y);
      growthContext.strokeStyle = `rgba(${NATURE_WHITE}, ${alpha})`;
      growthContext.stroke();
    }
  }

  function render(time) {
    if (!running) return;                                         // [added] page hidden
    const deltaSeconds = (time - lastFrameTime) / 1000;
    lastFrameTime = time;
    now += Math.min(deltaSeconds, 0.1);                          // [added]

    let scaledLight;
    if (!cameraToggle.checked) {                                  // [added] mouse unless the camera is switched on
      scaledLight = mouse.down ? { x: mouse.x, y: mouse.y } : null;
      statusText.textContent = scaledLight ? `Mouse light at x ${Math.round(mouse.x)}, y ${Math.round(mouse.y)}` : 'Mouse mode: hold the mouse button down on the growth view';
    } else {
      if (video.readyState >= 2) cameraContext.drawImage(video, 0, 0, WIDTH, HEIGHT);
      const light = video.readyState >= 2 ? detectFrame(cameraContext.getImageData(0, 0, WIDTH, HEIGHT).data, deltaSeconds) : null;

      // light's found on the small canvas, roots live on the big one
      scaledLight = light && { x: light.x * GROWTH_SCALE, y: light.y * GROWTH_SCALE };
    }
    // [v2] the mouse / camera light plus the fake lights
    const lights = [];
    if (scaledLight) lights.push({ id: 'main', x: scaledLight.x, y: scaledLight.y });
    lights.push(...updateFakeLights(Math.min(deltaSeconds, 0.1)));
    updateRoots(lights, deltaSeconds);
    updateGlow(lights, deltaSeconds);

    growthContext.clearRect(0, 0, growthCanvas.width, growthCanvas.height);
    drawGlow();
    drawRoots();
    if (flowers) {                                                // [added] flowers in front of the roots
      flowers.update(Math.min(deltaSeconds, 0.1), now);
      growthContext.save();
      growthContext.globalCompositeOperation = "destination-out";   // erase the roots where a flower is
      for (const o of flowers.occluders()) {
        const g = growthContext.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r);
        g.addColorStop(0, `rgba(0, 0, 0, ${o.a})`);
        g.addColorStop(0.7, `rgba(0, 0, 0, ${o.a})`);
        g.addColorStop(1, "rgba(0, 0, 0, 0)");
        growthContext.fillStyle = g;
        growthContext.fillRect(o.x - o.r, o.y - o.r, o.r * 2, o.r * 2);
      }
      growthContext.restore();
      flowers.render();
    }

    rafId = requestAnimationFrame(render);                      // [changed] keep the id so the page can stop it
  }

  // ---- [added v2] fake lights: a button that plays a random scenario with several lights at once.
  // Each light starts at a random moment, stays for a random time and either stands still, wanders around,
  // or is switched on and off a few times on the same spot (like pressing again -> the spot gets stronger).
  const FAKE = {
    COUNT: [2, 7],               // how many lights
    START_WITHIN: 4,             // s: they don't all start at once
    STAY: [2.5, 10],             // s: how long each light stays
    MOVE_CHANCE: 0.4,            // share of lights that wander around
    TAP_CHANCE: 0.2,             // share that are switched on/off a few times on one spot
    SPEED: [60, 450],            // px/s for the wandering ones (slow = many branches, fast = long clean route)
    MARGIN: 80,                  // px from the edges
  };
  let fakeLights = [];
  let fakeCount = 0;
  const fakeInfo = page.querySelector('.fake__info');

  function startFakeScenario() {
    const W = growthCanvas.width, H = growthCanvas.height, M = FAKE.MARGIN;
    const n = Math.round(randomBetween(FAKE.COUNT[0], FAKE.COUNT[1]));
    fakeLights = [];
    const kinds = { still: 0, moving: 0, tapping: 0 };
    for (let i = 0; i < n; i++) {
      const r = Math.random();
      const kind = r < FAKE.MOVE_CHANCE ? 'moving' : r < FAKE.MOVE_CHANCE + FAKE.TAP_CHANCE ? 'tapping' : 'still';
      kinds[kind]++;
      const start = now + Math.random() * FAKE.START_WITHIN;
      fakeLights.push({
        id: `fake${fakeCount++}`, kind, start, end: start + randomBetween(FAKE.STAY[0], FAKE.STAY[1]),
        x: randomBetween(M, W - M), y: randomBetween(M, H - M),
        angle: Math.random() * Math.PI * 2, speed: randomBetween(FAKE.SPEED[0], FAKE.SPEED[1]),
        turn: randomBetween(0.6, 2.2), phase: Math.random() * 10,
        tapOn: randomBetween(0.4, 0.9), tapOff: randomBetween(0.25, 0.6),
      });
    }
    fakeInfo.textContent = `${n} lights: ${kinds.still} still, ${kinds.moving} moving, ${kinds.tapping} tapping`;
  }

  // positions of the fake lights that are on right now (same format as the mouse light)
  function updateFakeLights(dt) {
    const W = growthCanvas.width, H = growthCanvas.height, M = FAKE.MARGIN;
    const on = [];
    for (const f of fakeLights) {
      if (now < f.start || now > f.end) continue;
      if (f.kind === 'moving') {                                       // wanders in smooth curves, turns at the edges
        f.angle += Math.sin(now * f.turn + f.phase) * f.turn * dt;
        f.x += Math.cos(f.angle) * f.speed * dt; f.y += Math.sin(f.angle) * f.speed * dt;
        if (f.x < M || f.x > W - M) { f.angle = Math.PI - f.angle; f.x = Math.min(Math.max(f.x, M), W - M); }
        if (f.y < M || f.y > H - M) { f.angle = -f.angle; f.y = Math.min(Math.max(f.y, M), H - M); }
      }
      if (f.kind === 'tapping') {                                      // on for a moment, off for a moment, again...
        const cycle = f.tapOn + f.tapOff;
        if ((now - f.start) % cycle > f.tapOn) continue;
      }
      on.push({ id: f.id, x: f.x, y: f.y });
    }
    if (fakeLights.length && fakeLights.every((f) => now > f.end)) { fakeLights = []; fakeInfo.textContent += ' (done)'; }
    return on;
  }

  page.querySelector('.fake__button').addEventListener('click', startFakeScenario);
  page.querySelector('.fake__stop').addEventListener('click', () => { fakeLights = []; fakeInfo.textContent = ''; });

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });

      video.srcObject = stream;
      await video.play();
    } catch (error) {
      statusText.textContent = `Could not start the camera: ${error.message} (you can still use the mouse)`;
    }
  }

  calibrateButton.addEventListener("click", startCalibration);

  window.addEventListener("keydown", (event) => {
    if (running && event.key.toLowerCase() === "c") startCalibration();   // [changed] only on this page
  });

  thresholdSlider.addEventListener("input", () => {
    thresholdValue.textContent = thresholdSlider.value;
  });


  // ---- [added] mouse as the light, in growth-canvas pixels
  const toCanvas = (e) => {
    const r = growthCanvas.getBoundingClientRect();
    mouse.x = ((e.clientX - r.left) / r.width) * growthCanvas.width;
    mouse.y = ((e.clientY - r.top) / r.height) * growthCanvas.height;
  };
  growthCanvas.addEventListener('pointerdown', (e) => { toCanvas(e); mouse.down = true; growthCanvas.setPointerCapture(e.pointerId); });
  growthCanvas.addEventListener('pointermove', toCanvas);
  growthCanvas.addEventListener('pointerup', () => { mouse.down = false; });
  growthCanvas.addEventListener('pointercancel', () => { mouse.down = false; });

  // ---- [added] the camera only runs while 'Use camera' is on
  const stopCamera = () => { if (video.srcObject) { video.srcObject.getTracks().forEach((t) => t.stop()); video.srcObject = null; } reference = null; };
  cameraToggle.addEventListener('change', () => {
    if (cameraToggle.checked) { startCamera(); statusText.textContent = 'Flashlight off, then press Calibrate.'; }
    else stopCamera();
  });

  // ---- [added] show / hide with the style buttons
  return {
    show() {
      if (running) return;
      page.hidden = false; running = true;
      if (cameraToggle.checked && !video.srcObject) startCamera();
      flowers ??= new RootFlowers(growthCanvas.parentElement, growthCanvas, mainParams);   // [added]
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame((time) => { lastFrameTime = time; render(time); });
    },
    hide() {
      page.hidden = true; running = false; cancelAnimationFrame(rafId);
      if (video.srcObject) { video.srcObject.getTracks().forEach((t) => t.stop()); video.srcObject = null; }
      reference = null;                                          // light changes when you come back: calibrate again
    },
  };
}
