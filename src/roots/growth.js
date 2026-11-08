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
  const ROOTS_PER_SPOT = 5;
  const STEP_LENGTH = 6;
  const GROW_SPEED = 90;
  const WOBBLE = 0.35;
  const STEER = 0.35;
  const MAX_TURN_FROM_HOME = Math.PI / 2;
  const MAX_POINTS = 6000;

  const MIN_BURST_STEPS = 25;
  const MAX_BURST_STEPS = 70;

  const SPROUT_SECONDS = 3;
  const ROOTS_PER_SPROUT = 2;

  const SHRINK_DELAY_SECONDS = 3;
  const SHRINK_SECONDS = 9;
  const DIM_SECONDS = 12;
  const DIM_FLOOR = 0.25;
  const TAPER_STEPS = 18;
  const TAPER_EASE_SPEED = 8;
  const BRIGHTEN_SECONDS = 1.5;

  const MIN_STEPS_BETWEEN_SPLITS = 12;
  const MAX_STEPS_BETWEEN_SPLITS = 30;
  const MIN_SPLIT_ANGLE = 0.5;
  const MAX_SPLIT_ANGLE = 1.1;
  const BRANCH_SHRINK = 0.6;
  const MIN_BRANCH_STEPS = 8;

  const LIGHT_REACH = 120;
  const PLANT_SPACING = 250; // keep this over 2x LIGHT_REACH or two bursts can grow at once

  const REST_SECONDS = 0.4;
  const REST_MOVEMENT = 30;

  const TIP_STEPS = 10;
  const ARRIVE_DISTANCE = 30;
  const BRANCH_DISTANCE = 70;
  const BRANCH_COOLDOWN_SECONDS = 0.5;

  const GLOW_RADIUS = 110;
  const GLOW_STRENGTH = 0.22;
  const GLOW_IN_SECONDS = 0.1;
  const GLOW_OUT_SECONDS = 0.6;

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
    },
  ) {
    return {
      points: [{ x, y }],
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
      const angle = i * slice + randomBetween(0, slice);
      const burstSteps = randomBurstSteps();
      roots.push(createRoot(position, angle, { ...options, burstSteps, branchLength: burstSteps }));
    }
  }

  function plantRoots(position) {
    spreadRoots(position, ROOTS_PER_SPOT, { kind: "planted" });
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
      root.angle += randomBetween(-WOBBLE, WOBBLE);

      if (target) {
        root.homeAngle = root.angle;
      } else {
        limitToHome(root);
      }

      const tip = root.points.at(-1);
      root.points.push({
        x: tip.x + Math.cos(root.angle) * STEP_LENGTH,
        y: tip.y + Math.sin(root.angle) * STEP_LENGTH,
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

    if (root.kind === "side") return GROW_SPEED;

    return light && getDistance(root.points[0], light) < LIGHT_REACH ? GROW_SPEED : 0;
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
    const followedRoot = isWithinSpacing ? closest.root : null;

    updateRootTree();

    for (const root of roots) {
      updateRootLight(root, root === followedRoot, deltaSeconds);
      shrinkRoot(root, deltaSeconds);
      updateTaper(root, deltaSeconds);

      const speed = getOwnGrowSpeed(root, light);
      if (speed > 0) growRoot(root, speed * deltaSeconds);
    }

    roots = roots.filter((root) => !isGone(root));

    const isFarFromRoots = !closest || closest.distance > LIGHT_REACH;

    if (isResting && isFarFromRoots && !isNearPlantingSpot(light)) {
      plantRoots(light);
      sproutCooldown = SPROUT_SECONDS;
      return;
    }

    if (!isWithinSpacing) return;

    if (isResting && closest.distance <= BRANCH_DISTANCE && sproutCooldown === 0 && !isAtPointLimit()) {
      sproutRoots(closest);
      sproutCooldown = SPROUT_SECONDS;
    }

    followLight(closest, light, deltaSeconds);
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

  function strokePoints(points, opacity) {
    growthContext.globalAlpha = opacity;
    growthContext.beginPath();
    points.forEach(({ x, y }) => growthContext.lineTo(x, y));
    growthContext.stroke();
  }

  function drawRoots() {
    growthContext.strokeStyle = "#b9f5c8";
    growthContext.lineWidth = 2;
    growthContext.lineJoin = "round";

    for (const { points, opacity, taperSteps } of roots) {
      const lastIndex = points.length - 1;
      const taperStart = Math.max(0, Math.ceil(lastIndex - taperSteps));

      strokePoints(points.slice(0, taperStart + 1), opacity);

      for (let i = taperStart; i < lastIndex; i++) {
        strokePoints([points[i], points[i + 1]], (opacity * (lastIndex - i)) / taperSteps);
      }
    }
  }

  function render(time) {
    if (!running) return;                                         // [added] page hidden
    const deltaSeconds = (time - lastFrameTime) / 1000;
    lastFrameTime = time;

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
