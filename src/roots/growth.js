// Page 4 – Roots. Your friend's "Growth test 03" (03-growth/script.js), moved into this project.
// The growth code itself is unchanged. Added (marked [added]/[changed]):
//  - it lives in its own page element and only runs while page 4 is open
//  - the camera starts when you first open the page and stops when you leave it
//  - "Use mouse instead of camera": hold the mouse button on the growth view = the flashlight is on
import './roots.css';

const MARKUP = `<h1 class="lab__title">Roots – Growth test 03</h1>
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
        <input class="controls__mouse" type="checkbox" />
        Use mouse instead of camera
      </label>
      <label class="controls__field">
        Threshold
        <input class="controls__slider" type="range" min="5" max="200" value="70" />
        <output class="controls__value">70</output>
      </label>
    </section>

    <p class="status">Starting camera…</p>`;

export function createRootsPage() {
  const page = document.createElement('div');
  page.id = 'roots-page';
  page.className = 'lab';
  page.hidden = true;
  page.innerHTML = MARKUP;
  document.body.appendChild(page);

  let running = false;                                           // [added]
  let rafId = 0;                                                 // [added]
  const mouseToggle = page.querySelector('.controls__mouse');    // [added]
  const mouse = { x: 0, y: 0, down: false };                     // [added]

  const WIDTH = 320;
  const HEIGHT = 180;
  const CALIBRATION_FRAMES = 30;
  const MIN_LIGHT_PIXELS = 20;
  const LIGHT_HOLD_SECONDS = 0.2;

  const GROWTH_SCALE = 4;
  const ROOTS_PER_SPOT = 12;                 // [changed] 5 -> 12: fuller from the start
  const STEP_LENGTH = 6;
  const GROW_SPEED = 90;
  const WOBBLE = 0.22;                       // [changed] calmer, wandering lines (image 2)
  const STEER = 0.35;
  const MAX_TURN_FROM_HOME = Math.PI / 3;    // [changed] roots stay in their own direction -> no empty gaps
  const MAX_POINTS = 14000;                  // [changed] more roots and twigs

  const MIN_BURST_STEPS = 12;               // [changed] 25-75 -> 12-32: much shorter roots per press
  const MAX_BURST_STEPS = 32;

  const SPROUT_SECONDS = 3;
  const ROOTS_PER_SPROUT = 2;

  const SHRINK_DELAY_SECONDS = 1.5;         // [changed] 3 -> 1.5: start fading sooner
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
  const CLUSTER_MIN_SIZE = 0.45;        // root length compared to a normal planting (random per cluster)
  const CLUSTER_MAX_SIZE = 1.1;
  const CONNECT_REACH = 375;            // how far a connecting root may reach to find another root
  const MAX_CONNECTORS = 3;             // connecting roots from a new cluster (to different roots)
  const MAX_REACHERS = 2;               // existing roots that send a branch towards the light
  const REGROW_SECONDS = 0.9;           // while the light stays, something new grows this often
  const SPOT_REUSE = 40;                // a new cluster this close to another one adds to it
  const CHARGE_SECONDS = 0.9;           // how long a pulse of light runs through connected roots
  const CONNECT_FLASH_RADIUS = 70;

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
    return {
      points: [{ x, y, t: now }],                   // [changed] points remember when they grew
      born: now,                                    // [added]
      depth: parent ? parent.depth + 1 : 0,          // [added] branches are thinner
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
    const count = reused ? Math.round(randomBetween(1, 3)) : Math.round(randomBetween(CLUSTER_MIN_ROOTS, CLUSTER_MAX_ROOTS));
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
  }

  function plantRoots(position) {
    const spot = addSpot(position);                                    // [added]
    spreadRoots(position, ROOTS_PER_SPOT, { kind: "planted", spot });
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

  function steerToward(root, target) {
    root.angle += getAngleDifference(root.angle, getAngle(root.points.at(-1), target)) * STEER;
  }

  function limitToHome(root) {
    const turn = getAngleDifference(root.homeAngle, root.angle);
    root.angle = root.homeAngle + Math.max(-MAX_TURN_FROM_HOME, Math.min(MAX_TURN_FROM_HOME, turn));
  }

  function growRoot(root, distance, target = null) {
    if (isAtPointLimit()) return;

    root.distanceToGrow += distance;

    while (root.distanceToGrow >= STEP_LENGTH) {
      if (target) steerToward(root, target);
      const wobble = now - root.born < SPARK_SECONDS ? SPARK_WOBBLE : WOBBLE;   // [changed] jagged while it's a spark
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
        root.stepsUntilSplit = randomStepsUntilSplit();
      }
    }
  }

  function getOwnGrowSpeed(root, light) {
    if (root.burstSteps === 0) return 0;
    const speed = now - root.born < SPARK_SECONDS ? GROW_SPEED * SPARK_SPEED : GROW_SPEED;   // [added] fast spark

    if (root.kind === "side" || root.kind === "connector") return speed;   // [changed] connectors keep growing

    return light && getDistance(root.points[0], light) < LIGHT_REACH ? speed : 0;
  }

  function updateRootLight(root, isFollowing, deltaSeconds) {
    root.isLit = isFollowing || root.lightDistance < LIGHT_REACH || Boolean(root.parent?.isLit);

    if (root.isLit) {
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
    return !root.isLit && root.unlitSeconds >= SHRINK_DELAY_SECONDS;
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
    return canShrink(root) && root.points.length <= 1;
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

  function updateRoots(light, deltaSeconds) {
    const isResting = updateRest(light, deltaSeconds);
    branchCooldown = Math.max(0, branchCooldown - deltaSeconds);
    sproutCooldown = Math.max(0, sproutCooldown - deltaSeconds);

    const closest = measureLight(light);
    const isWithinSpacing = closest && closest.distance <= PLANT_SPACING;
    // [changed] the roots that grow towards the light are the closest ones from ANOTHER spot
    const activeSpot = spotNear(light);
    const other = light ? closestOtherPoint(light, activeSpot?.id) : null;
    const followedRoot = other && other.distance <= PLANT_SPACING ? other.root : isWithinSpacing ? closest.root : null;

    updateRootTree();

    for (const root of roots) {
      updateRootLight(root, root === followedRoot, deltaSeconds);
      shrinkRoot(root, deltaSeconds);
      updateTaper(root, deltaSeconds);

      // [added] connectors follow their target root (it can grow or shrink)
      if (root.targetRoot) {
        if (!roots.includes(root.targetRoot) || root.targetRoot.points.length < 2) { root.targetRoot = null; root.target = null; }
        else { const tp = root.targetRoot.points[Math.min(root.targetIndex, root.targetRoot.points.length - 1)]; root.target = { x: tp.x, y: tp.y }; }
      }
      const speed = getOwnGrowSpeed(root, light);
      if (speed > 0) growRoot(root, speed * deltaSeconds, root.target);   // [changed] connectors steer to their target
      if (root.target && getDistance(root.points.at(-1), root.target) < STEP_LENGTH * 1.8) {
        root.points.push({ x: root.target.x, y: root.target.y, t: now });   // [added] snap on: the lines really join
        root.burstSteps = 0;
        root.charge = now;                                                // a pulse of light runs through both
        if (root.targetRoot) root.targetRoot.charge = now;
        if (root.parent) root.parent.charge = now;
        flashes.push({ x: root.target.x, y: root.target.y, t: now, r: CONNECT_FLASH_RADIUS });
        root.target = null; root.targetRoot = null;
      }
    }

    roots = roots.filter((root) => !isGone(root));
    spots = spots.filter((spot) => roots.some((root) => root.spot === spot.id));   // [added]

    const isFarFromRoots = !closest || closest.distance > LIGHT_REACH;

    if (isResting && isFarFromRoots && !isNearPlantingSpot(light)) {
      plantRoots(light);
      sproutCooldown = SPROUT_SECONDS;
      return;
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

  function updateGlow(light, deltaSeconds) {
    if (light) {
      glow.x = light.x;
      glow.y = light.y;
      glow.opacity = Math.min(1, glow.opacity + deltaSeconds / GLOW_IN_SECONDS);
    } else {
      glow.opacity = Math.max(0, glow.opacity - deltaSeconds / GLOW_OUT_SECONDS);
    }
  }

  function drawGlow() {
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

  function strokePiece(points, from, to, width, color, alpha) {
    growthContext.beginPath();
    growthContext.moveTo(points[from].x, points[from].y);
    for (let i = from + 1; i <= to; i++) growthContext.lineTo(points[i].x, points[i].y);
    growthContext.strokeStyle = `rgba(${color}, ${alpha * GLOW_ALPHA})`;
    growthContext.lineWidth = width * GLOW_WIDTH;
    growthContext.stroke();
    growthContext.strokeStyle = `rgba(${color}, ${alpha})`;
    growthContext.lineWidth = width;
    growthContext.stroke();
  }

  function drawFlashes() {
    flashes = flashes.filter((f) => now - f.t < 6);
    for (const f of flashes) {
      const k = Math.exp(-(now - f.t) / FLASH_SECONDS) * 0.85 + 0.15 * Math.max(0, 1 - (now - f.t) / 6);
      const R = f.r ?? FLASH_RADIUS;
      const g = growthContext.createRadialGradient(f.x, f.y, 0, f.x, f.y, R);
      g.addColorStop(0, `rgba(235, 242, 255, ${0.55 * k})`);
      g.addColorStop(0.25, `rgba(170, 200, 255, ${0.18 * k})`);
      g.addColorStop(1, "rgba(150, 190, 255, 0)");
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

    for (const root of roots) {
      const { points, opacity, taperSteps, depth } = root;
      const lastIndex = points.length - 1;
      if (lastIndex < 1) continue;
      const taperStart = Math.max(0, Math.ceil(lastIndex - taperSteps));
      const baseWidth = LINE_WIDTH * Math.pow(0.72, depth);

      for (let i = 0; i < lastIndex; i += CHUNK) {
        const j = Math.min(i + CHUNK, lastIndex);
        const mid = (i + j) / 2;
        const taper = mid > taperStart ? (lastIndex - mid) / Math.max(taperSteps, 1) : 1;
        const age = now - points[i].t;
        const pulse = Math.exp(-(now - root.charge) / CHARGE_SECONDS);           // [added] connection pulse
        const green = smooth((age - SPARK_SECONDS * 0.5) / TO_GREEN_SECONDS) * (1 - pulse);
        const flicker = green < 0.6 ? 0.7 + 0.3 * Math.random() : 1;              // electric flicker
        const alpha = opacity * Math.min(Math.max(taper, 0), 1) * flicker * (1.25 - 0.25 * green) * (1 + 0.6 * pulse);
        const width = baseWidth * (0.45 + 0.55 * (1 - mid / Math.max(lastIndex, 1)));
        strokePiece(points, i, j, Math.max(width, 0.5), mixColor(ELECTRIC_COLOR, GREEN_COLOR, green), Math.min(alpha, 1));
      }
    }
    growthContext.globalCompositeOperation = "source-over";
  }

  function render(time) {
    if (!running) return;                                         // [added] page hidden
    const deltaSeconds = (time - lastFrameTime) / 1000;
    lastFrameTime = time;
    now += Math.min(deltaSeconds, 0.1);                          // [added]

    let scaledLight;
    if (mouseToggle.checked) {                                    // [added] mouse instead of camera
      scaledLight = mouse.down ? { x: mouse.x, y: mouse.y } : null;
      statusText.textContent = scaledLight ? `Mouse light at x ${Math.round(mouse.x)}, y ${Math.round(mouse.y)}` : 'Mouse mode: hold the mouse button down on the growth view';
    } else {
      if (video.readyState >= 2) cameraContext.drawImage(video, 0, 0, WIDTH, HEIGHT);
      const light = video.readyState >= 2 ? detectFrame(cameraContext.getImageData(0, 0, WIDTH, HEIGHT).data, deltaSeconds) : null;

      // light's found on the small canvas, roots live on the big one
      scaledLight = light && { x: light.x * GROWTH_SCALE, y: light.y * GROWTH_SCALE };
    }
    updateRoots(scaledLight, deltaSeconds);
    updateGlow(scaledLight, deltaSeconds);

    growthContext.clearRect(0, 0, growthCanvas.width, growthCanvas.height);
    drawGlow();
    drawRoots();

    rafId = requestAnimationFrame(render);                      // [changed] keep the id so the page can stop it
  }

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

  // ---- [added] show / hide with the style buttons
  return {
    show() {
      if (running) return;
      page.hidden = false; running = true;
      if (!video.srcObject) startCamera();
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
