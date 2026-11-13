// Page 8 – Garden (Version 2): the roots simulation, same behaviour as Version 1. A trimmed copy of page 5's growth (src/roots/growth.js): the same
// planting, branching, clusters that connect, spots that get stronger when pressed again, routes that follow a
// moving light, and dissolving into particles. Everything about drawing is gone (the page draws the roots as 3D
// tubes), and so are the electric look, the flat leaves and the veins. All positions are in "canvas pixels"
// (the page maps them to the 3D world). The page reads `roots` (with `points`) and the events it emits.
export const STEP_LENGTH = 6;

export function createGrowth(width, height) {
  // live settings (the page writes into them from its sliders)
  const live = {
    stay: 5,            // s: how long roots stay after the light left them, before they dissolve
    dissolve: 2.5,      // s: how long dissolving takes
    spread: 1,          // how far the particles fly (x)
  };
  let W = width, H = height;

  const ROOTS_PER_SPOT = 7;
  const GROW_SPEED = 50;
  const WOBBLE = 0.22;
  const STEER = 0.35;
  const MAX_TURN_FROM_HOME = Math.PI / 3;
  const MAX_POINTS = 12000;
  const MIN_BURST_STEPS = 6, MAX_BURST_STEPS = 15;
  const SPROUT_SECONDS = 4.5;
  const ROOTS_PER_SPROUT = 2;
  const FLOWER_ROOT_EXTRA_SECONDS = 4;    // roots that carry flowers stay this much longer

  // dissolving (particles)
  const LINE_FADE_SECONDS = 0.8;          // a piece of root thins away over this time once its particles appear
  const PARTICLE_LIFE_MIN = 1.4, PARTICLE_LIFE_MAX = 3;
  const PARTICLE_SPEED = 14;              // px/s
  const PARTICLE_RISE = 8;
  const PARTICLE_SIZE = 1.2;              // px
  const PARTICLE_RANDOMNESS = 0.6;
  const ROOT_JITTER = 0.35;

  const MIN_STEPS_BETWEEN_SPLITS = 8, MAX_STEPS_BETWEEN_SPLITS = 20;
  const MIN_SPLIT_ANGLE = 0.5, MAX_SPLIT_ANGLE = 1.1;
  const BRANCH_SHRINK = 0.6;
  const MIN_BRANCH_STEPS = 3;

  const LIGHT_REACH = 120;
  const PLANT_SPACING = 250;
  const REST_SECONDS = 0;
  const REST_MOVEMENT = 30;
  const TIP_STEPS = 10;
  const ARRIVE_DISTANCE = 30;
  const BRANCH_DISTANCE = 70;
  const BRANCH_COOLDOWN_SECONDS = 0.8;

  // light near existing roots: a smaller cluster appears at the light and reaches out to connect
  const CLUSTER_SPACING = 90;
  const CLUSTER_MIN_ROOTS = 3, CLUSTER_MAX_ROOTS = 8;
  const CLUSTER_MIN_SIZE = 0.35, CLUSTER_MAX_SIZE = 0.8;
  const CONNECT_REACH = 375;
  const MAX_CONNECTORS = 3;
  const MAX_REACHERS = 2;
  const REGROW_SECONDS = 2.2;
  const SPOT_REUSE = 40;

  // pressing / shining on the same spot again makes it grow stronger
  const BOOST_RADIUS = 80;
  const BOOST_MAX = 5;
  const BOOST_DECAY_SECONDS = 5;
  const BOOST_LONGER = [2, 4];
  const BOOST_INNER_BRANCHES = 2;
  const BOOST_NEW_ROOTS = 1;

  // moving the light: one 'main route' root grows along with it
  const MOVE_SPEED = 60;
  const LEAD_GRAB = 160;
  const LEAD_LOST = 260;
  const FOLLOW_GAIN = 7;
  const MAX_FOLLOW_SPEED = 1600;
  const LEADER_STEER = 0.55;
  const LEADER_WOBBLE = 0.12;
  const SLOW_SPEED = 150, FAST_SPEED = 900;
  const TWIG_STEPS_SLOW = 14, TWIG_STEPS_FAST = 5;
  const TWIG_GAP_SLOW = [4, 10], TWIG_GAP_FAST = [22, 40];
  const TIP_FORK_EVERY_SLOW = 0.55;
  const LEADER_TWIG_STEPS = 9;
  const LEADER_TWIG_MIN_GAP = 10, LEADER_TWIG_MAX_GAP = 26;

  // the shape of the roots (page 5's 'nature' look): smooth lines that swell and taper
  const SMOOTH = 5;                       // moving average: points on each side
  const THICKNESS = 4.6;                  // px: the thickest roots; branches get thinner (x0.72 per level)
  const MIN_THICKNESS = 1.2;
  const TIP_TAPER = 0.75;                 // after TAPER_LENGTH a root is a quarter of its base width
  const TAPER_LENGTH = 140;               // points, counted along parent + branch together
  const SWELL = 0.22;                     // slightly thicker and thinner along the length
  const JOINT_BLEND = 8;                  // points over which a branch goes from its parent's width to its own
  const KEEP_TONE = 0.75;                 // chance a branch has the same tone as the root it grows from

  // leaves along the roots (the page makes them): every so many points, a bit after the root grew there
  const BRANCH_LEAF_EVERY = 9;
  const BRANCH_LEAF_MAX = 8;
  const BRANCH_LEAF_SPREAD = 1.0;
  const ROUTE_LEAF_EVERY = 12;
  const ROUTE_LEAF_CHANCE = 0.6;

  let roots = [];
  let spots = [];
  let spotCount = 0;
  let now = 0;
  let rest = null, branchCooldown = 0, sproutCooldown = 0, regrowCooldown = 0, leader = null;
  let prevLight = null, lightSpeed = 0, moveAngle = 0, branchiness = 0.5, tipForkCooldown = 0;
  let pendingLeaves = [];
  const flowerSpots = new Set();          // spots with flowers on them (their roots stay longer)
  const events = [];                      // what happened this frame, for the page (flowers, leaves, particles)
  let dirty = true;                       // the shape of the roots changed (the page rebuilds the tubes)

  const alive = (r) => roots.includes(r) && r.dissolving === undefined;

  // several lights at once: every light keeps its own copy of the values above
  const lightStates = new Map();
  const newLightState = () => ({ rest: null, branchCooldown: 0, sproutCooldown: 0, regrowCooldown: 0, leader: null,
    prevLight: null, lightSpeed: 0, moveAngle: 0, branchiness: 0.5, tipForkCooldown: 0 });
  function loadLight(st) {
    ({ rest, branchCooldown, sproutCooldown, regrowCooldown, leader, prevLight, lightSpeed, moveAngle, branchiness, tipForkCooldown } = st);
  }
  function saveLight(st) {
    Object.assign(st, { rest, branchCooldown, sproutCooldown, regrowCooldown, leader, prevLight, lightSpeed, moveAngle, branchiness, tipForkCooldown });
  }
  const isLeader = (root) => root === leader || [...lightStates.values()].some((st) => st.leader === root);

  const randomBetween = (min, max) => min + Math.random() * (max - min);
  const getDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const getAngle = (from, to) => Math.atan2(to.y - from.y, to.x - from.x);
  const randomBurstSteps = () => Math.round(randomBetween(MIN_BURST_STEPS, MAX_BURST_STEPS));
  const randomStepsUntilSplit = () => Math.round(randomBetween(MIN_STEPS_BETWEEN_SPLITS, MAX_STEPS_BETWEEN_SPLITS));
  const smooth = (x) => { const c = Math.min(Math.max(x, 0), 1); return c * c * (3 - 2 * c); };

  function createRoot({ x, y }, angle, { kind, burstSteps = 0, branchLength = randomBurstSteps(), parent = null, attachIndex = 0, homeAngle = angle, spot = null }) {
    dirty = true;
    return {
      points: [{ x, y, t: now }],
      born: now,
      depth: parent ? parent.depth + 1 : 0,
      spot: spot ? spot.id : parent ? parent.spot : 0,
      target: null, targetRoot: null, targetIndex: 0,
      angle, homeAngle, kind, parent, attachIndex, burstSteps, branchLength,
      stepsUntilSplit: randomStepsUntilSplit(),
      distanceToGrow: 0,
      isLit: true, unlitSeconds: 0,
      childLimit: 0, pathSteps: 0,
    };
  }

  function spreadRoots(position, count, options) {
    const slice = (Math.PI * 2) / count;
    for (let i = 0; i < count; i++) {
      const angle = (i + 0.5) * slice + randomBetween(-0.35, 0.35) * slice;
      const burstSteps = randomBurstSteps();
      roots.push(createRoot(position, angle, { ...options, burstSteps, branchLength: burstSteps }));
    }
  }

  function addSpot({ x, y }) {
    const spot = { x, y, id: ++spotCount, links: 0, energy: 0 };
    spots.push(spot);
    return spot;
  }
  const spotNear = (light) => (light ? spots.find((spot) => getDistance(spot, light) < CLUSTER_SPACING) : null);
  const spotById = (id) => spots.find((s) => s.id === id);

  function closestOtherPoint(light, excludeSpotId, excludeRoot = null) {
    let closest = null;
    for (const root of roots) {
      if (root === excludeRoot || (excludeSpotId && root.spot === excludeSpotId)) continue;
      const point = findClosestPoint(root, light);
      if (!closest || point.distance < closest.distance) closest = point;
    }
    return closest;
  }

  function nearbyRoots(light, excludeSpotId, count) {
    const found = [];
    for (const root of roots) {
      if (excludeSpotId && root.spot === excludeSpotId) continue;
      const point = findClosestPoint(root, light);
      if (point.distance <= CONNECT_REACH) found.push(point);
    }
    found.sort((a, b) => a.distance - b.distance);
    const picked = [], usedSpots = new Set();
    for (const p of found) {
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

  // a cluster at the light that grows into the roots around it
  function plantConnectingCluster(light) {
    const reused = spots.find((sp) => getDistance(sp, light) < SPOT_REUSE);
    const spot = reused ?? addSpot(light);
    const size = randomBetween(CLUSTER_MIN_SIZE, CLUSTER_MAX_SIZE);
    const count = reused ? Math.round(randomBetween(1, 2)) : Math.round(randomBetween(CLUSTER_MIN_ROOTS, CLUSTER_MAX_ROOTS));
    const slice = (Math.PI * 2) / count, offset = Math.random() * slice;
    for (let i = 0; i < count; i++) {
      const angle = offset + (i + 0.5) * slice + randomBetween(-0.35, 0.35) * slice;
      const burstSteps = Math.max(3, Math.round(randomBurstSteps() * size));
      roots.push(createRoot(light, angle, { kind: 'planted', burstSteps, branchLength: burstSteps, spot }));
    }
    const near = nearbyRoots(light, spot.id, MAX_CONNECTORS);
    near.forEach(({ root, index, distance }, k) => {
      if (k > 0 && Math.random() < 0.35) return;
      if (distance < STEP_LENGTH * 2) return;
      const point = root.points[index];
      const steps = Math.ceil(distance / STEP_LENGTH) + 6;
      const connector = createRoot(light, getAngle(light, point), { kind: 'connector', burstSteps: steps, branchLength: Math.min(steps, MAX_BURST_STEPS), spot });
      aimAt(connector, root, index);
      roots.push(connector);
    });
    near.slice(0, MAX_REACHERS).forEach(({ root, index, distance }) => {
      if (distance < BRANCH_DISTANCE * 0.5) return;
      const point = root.points[index];
      const steps = Math.ceil(distance / STEP_LENGTH) + 4;
      const reacher = createRoot(point, getAngle(point, light), { kind: 'connector', burstSteps: steps, branchLength: Math.min(steps, MAX_BURST_STEPS), parent: root, attachIndex: index });
      reacher.target = { x: light.x, y: light.y };
      roots.push(reacher);
    });
    if (reused) events.push({ type: 'hold', spot });          // holding still on a spot
    else events.push({ type: 'spot', spot });
  }

  const spotAlive = (spot) => spots.includes(spot) && roots.some((r) => r.spot === spot.id && r.dissolving === undefined);

  // leaves along a root, spaced out (planned as the root grows)
  function planBranchLeaves(root) {
    root.leafNext ??= Math.round(BRANCH_LEAF_EVERY * randomBetween(0.4, 0.9));
    root.leafCount ??= 0;
    while (root.leafCount < BRANCH_LEAF_MAX && root.points.length - 1 > root.leafNext + 2) {
      pendingLeaves.push({ at: now + Math.random() * BRANCH_LEAF_SPREAD, root, index: root.leafNext });
      root.leafCount++;
      root.leafNext += Math.round(BRANCH_LEAF_EVERY * randomBetween(0.7, 1.3));
    }
  }
  function planRouteLeaves(root) {
    root.routeLeafNext ??= Math.round(ROUTE_LEAF_EVERY * randomBetween(0.3, 1));
    while (root.points.length - 1 > root.routeLeafNext + 3) {
      if (Math.random() < ROUTE_LEAF_CHANCE) pendingLeaves.push({ at: now + randomBetween(0.15, 0.6), root, index: root.routeLeafNext, route: true });
      root.routeLeafNext += Math.round(ROUTE_LEAF_EVERY * randomBetween(0.6, 1.4));
    }
  }
  function growLeaves() {
    const due = pendingLeaves.filter((l) => now >= l.at);
    pendingLeaves = pendingLeaves.filter((l) => now < l.at);
    for (const { root, index, route } of due) {
      if (!alive(root) || index >= root.points.length - 1 || (root.cut ?? 0) > index) continue;
      events.push({ type: 'leaf', root, index, route: Boolean(route) });
    }
  }

  // the point a cluster sways around: its spot, or where its first root started
  function centerOf(root) {
    if (root.center) return root.center;
    const spot = root.parent ? null : spotById(root.spot);
    root.center = root.parent && roots.includes(root.parent) ? centerOf(root.parent)
      : spot ? { x: spot.x, y: spot.y } : { x: root.points[0].x, y: root.points[0].y };
    return root.center;
  }

  // things on a root (flowers, leaves) go when the piece of root they sit on dissolves:
  // returns true while it's there, otherwise the time that piece goes
  const anchorOn = (root, index) => () => (alive(root) && (root.cut ?? 0) <= index) || (root.points[index]?.dissolveAt ?? now);

  function boostSpot(spot) {
    const decayed = Math.max(0, (spot.boost ?? 0) - (now - (spot.boostedAt ?? now)) / BOOST_DECAY_SECONDS);
    spot.boost = Math.min(decayed + 1, BOOST_MAX); spot.boostedAt = now;
    const b = spot.boost, grow = 1 + 0.12 * b;
    const own = roots.filter((r) => r.spot === spot.id && r.dissolving === undefined && r.points.length > 2);
    for (const r of own) r.burstSteps += Math.round(randomBetween(BOOST_LONGER[0], BOOST_LONGER[1]) * grow);
    const inner = Math.min(BOOST_INNER_BRANCHES + Math.round(b), 10);
    for (let k = 0; k < inner && own.length && !isAtPointLimit(); k++) {
      const r = own[Math.floor(Math.random() * own.length)];
      const index = Math.floor(randomBetween(0.25, 0.9) * (r.points.length - 1));
      const a = r.points[index], next = r.points[Math.min(index + 1, r.points.length - 1)];
      const dir = getAngle(a, next) + (Math.random() < 0.5 ? -1 : 1) * randomBetween(MIN_SPLIT_ANGLE, MAX_SPLIT_ANGLE);
      const steps = Math.round(randomBetween(4, 10) * grow);
      roots.push(createRoot(a, dir, { kind: 'side', burstSteps: steps, branchLength: steps, parent: r, attachIndex: index }));
    }
    const fresh = Math.min(BOOST_NEW_ROOTS + Math.round(b * 0.7), 5);
    const slice = (Math.PI * 2) / fresh, offset = Math.random() * slice;
    for (let i = 0; i < fresh; i++) {
      const steps = Math.round(randomBurstSteps() * randomBetween(0.6, 1) * (1 + 0.15 * b));
      roots.push(createRoot(spot, offset + (i + 0.5) * slice + randomBetween(-0.4, 0.4) * slice, { kind: 'planted', burstSteps: steps, branchLength: steps, spot }));
    }
    events.push({ type: 'boost', spot, level: b });
  }

  function plantRoots(position) {
    const spot = addSpot(position);
    spreadRoots(position, ROOTS_PER_SPOT, { kind: 'planted', spot });
    events.push({ type: 'spot', spot });
  }

  function sproutRoots({ root, index }) {
    spreadRoots(root.points[index], ROOTS_PER_SPROUT, { kind: 'sprout', parent: root, attachIndex: index });
  }

  const isAtPointLimit = () => roots.reduce((total, { points }) => total + points.length, 0) >= MAX_POINTS;

  function splitBranch(root) {
    const branchLength = root.branchLength * BRANCH_SHRINK;
    if (branchLength < MIN_BRANCH_STEPS) return;
    const side = Math.random() < 0.5 ? -1 : 1;
    const angle = root.angle + side * randomBetween(MIN_SPLIT_ANGLE, MAX_SPLIT_ANGLE);
    roots.push(createRoot(root.points.at(-1), angle, { kind: 'side', burstSteps: Math.round(branchLength), branchLength, parent: root, attachIndex: root.points.length - 1, homeAngle: root.homeAngle }));
  }

  function getAngleDifference(from, to) { const d = to - from; return Math.atan2(Math.sin(d), Math.cos(d)); }
  function steerToward(root, target, amount = STEER) { root.angle += getAngleDifference(root.angle, getAngle(root.points.at(-1), target)) * amount; }
  function limitToHome(root) {
    const turn = getAngleDifference(root.homeAngle, root.angle);
    root.angle = root.homeAngle + Math.max(-MAX_TURN_FROM_HOME, Math.min(MAX_TURN_FROM_HOME, turn));
  }

  function growRoot(root, distance, target = null) {
    if (isAtPointLimit()) return;
    root.distanceToGrow += distance;
    while (root.distanceToGrow >= STEP_LENGTH) {
      if (target) steerToward(root, target, isLeader(root) ? LEADER_STEER : STEER);
      const wobble = isLeader(root) ? LEADER_WOBBLE : WOBBLE;
      root.angle += randomBetween(-wobble, wobble);
      if (target) root.homeAngle = root.angle; else limitToHome(root);
      const tip = root.points.at(-1);
      root.points.push({ x: tip.x + Math.cos(root.angle) * STEP_LENGTH, y: tip.y + Math.sin(root.angle) * STEP_LENGTH, t: now });
      dirty = true;
      root.distanceToGrow -= STEP_LENGTH;
      root.burstSteps = Math.max(0, root.burstSteps - 1);
      root.stepsUntilSplit--;
      if (root.stepsUntilSplit <= 0) {
        splitBranch(root);
        const br = root.branchiness ?? branchiness;
        root.stepsUntilSplit = isLeader(root)
          ? Math.round(randomBetween(TWIG_GAP_FAST[0] + (TWIG_GAP_SLOW[0] - TWIG_GAP_FAST[0]) * br, TWIG_GAP_FAST[1] + (TWIG_GAP_SLOW[1] - TWIG_GAP_FAST[1]) * br))
          : randomStepsUntilSplit();
      }
    }
  }

  function getOwnGrowSpeed(root, lights) {
    if (root.burstSteps === 0) return 0;
    if (root.kind === 'side' || root.kind === 'connector') return GROW_SPEED;
    return lights.some((light) => getDistance(root.points[0], light) < LIGHT_REACH) ? GROW_SPEED : 0;
  }

  function updateRootLight(root, isFollowing, deltaSeconds) {
    root.isLit = isFollowing || root.lightDistance < LIGHT_REACH || Boolean(root.parent?.isLit);
    if (root.isLit) { root.unlitSeconds = 0; planBranchLeaves(root); }
    else root.unlitSeconds += deltaSeconds;
  }

  function updateRootTree() {
    for (const root of roots) { root.childLimit = 0; root.pathSteps = root.points.length - 1; }
    for (let i = roots.length - 1; i >= 0; i--) {
      const { parent, attachIndex, pathSteps } = roots[i];
      if (!parent) continue;
      parent.childLimit = Math.max(parent.childLimit, attachIndex);
      parent.pathSteps = Math.max(parent.pathSteps, attachIndex + pathSteps);
    }
  }

  function canShrink(root) {
    const carries = root.keep || flowerSpots.has(root.spot);
    return !root.isLit && root.unlitSeconds >= live.stay + (carries ? FLOWER_ROOT_EXTRA_SECONDS : 0);
  }
  function keepRoot(root) { for (let r = root; r; r = r.parent) r.keep = true; }

  const isGone = (root) => (root.dissolving !== undefined ? now >= root.dissolveEnd : canShrink(root) && root.points.length <= 1);

  // one particle at a root point, appearing at time `born` (px units; the page converts them)
  function spawnParticle(root, point, born) {
    const a = Math.random() * Math.PI * 2, sp = PARTICLE_SPEED * live.spread * (0.3 + Math.random());
    events.push({ type: 'particle', x: point.x, y: point.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - PARTICLE_RISE * live.spread, tone: toneOf(root),
      born, life: randomBetween(PARTICLE_LIFE_MIN, PARTICLE_LIFE_MAX) * Math.sqrt(live.dissolve / 2.5), size: PARTICLE_SIZE * (0.5 + Math.random()) });
  }

  // dissolve: the oldest parts go first, each root at a slightly different moment, every point with random timing
  function dissolveRoot(root) {
    if (isLeader(root)) return;
    const orphaned = root.parent && (root.parent.dissolving !== undefined || !roots.includes(root.parent) || (root.parent.cut ?? 0) > root.attachIndex);
    if (root.dissolving !== undefined || (!canShrink(root) && !orphaned)) return;
    const pts = root.points, from = root.cut ?? 0, last = pts.length - 1;
    const start = now + Math.random() * ROOT_JITTER;
    let tMin = Infinity, tMax = -Infinity;
    for (let i = from; i <= last; i++) { tMin = Math.min(tMin, pts[i].t); tMax = Math.max(tMax, pts[i].t); }
    root.dissolving = now;
    dirty = true;
    let end = start;
    for (let i = from; i <= last; i++) {
      const oldness = tMax > tMin ? (tMax - pts[i].t) / (tMax - tMin) : 0.5;
      const at = start + (1 - oldness) * live.dissolve * 0.75 + Math.random() * live.dissolve * PARTICLE_RANDOMNESS;
      pts[i].dissolveAt = at;
      end = Math.max(end, at);
      spawnParticle(root, pts[i], at);
    }
    root.dissolveEnd = end + LINE_FADE_SECONDS;
  }

  // a route that follows the light: the parts the light left behind dissolve while you keep moving
  function trimTrail(root, light) {
    const pts = root.points;
    let cut = root.cut ?? 0;
    for (let i = cut; i < pts.length; i++) if (getDistance(pts[i], light) < LIGHT_REACH) pts[i].lit = now;
    while (cut < pts.length - 2 && now - (pts[cut].lit ?? pts[cut].t) > live.stay) {
      const at = now + Math.random() * live.dissolve * PARTICLE_RANDOMNESS;
      pts[cut].dissolveAt = at;
      spawnParticle(root, pts[cut], at);
      cut++; dirty = true;
    }
    root.cut = cut;
    root.visibleFrom = root.visibleFrom ?? 0;
    while (root.visibleFrom < cut && now - (pts[root.visibleFrom].dissolveAt ?? 0) > LINE_FADE_SECONDS) { root.visibleFrom++; dirty = true; }
  }

  function updateRest(light, deltaSeconds) {
    if (!light) { rest = null; regrowCooldown = 0; return false; }
    if (!rest || getDistance(rest, light) > REST_MOVEMENT) { rest = { x: light.x, y: light.y, seconds: 0 }; return false; }
    rest.seconds += deltaSeconds;
    return rest.seconds >= REST_SECONDS;
  }

  function findClosestPoint(root, light) {
    let closest = { root, index: 0, distance: Infinity };
    root.points.forEach((point, index) => {
      if (index < (root.cut ?? 0)) return;
      const distance = getDistance(point, light);
      if (distance < closest.distance) closest = { root, index, distance };
    });
    return closest;
  }

  function followLight({ root, index, distance }, light, deltaSeconds) {
    const isNearTip = root.points.length - 1 - index <= TIP_STEPS;
    if (isNearTip && distance > ARRIVE_DISTANCE) growRoot(root, GROW_SPEED * deltaSeconds, light);
    else if (!isNearTip && distance > BRANCH_DISTANCE && branchCooldown === 0) {
      const point = root.points[index];
      roots.push(createRoot(point, getAngle(point, light), { kind: 'followed', parent: root, attachIndex: index }));
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

  const isNearPlantingSpot = (light) => roots.some((root) => root.kind === 'planted' && getDistance(root.points[0], light) < PLANT_SPACING);

  function pickLeader(light) {
    let best = null;
    for (const root of roots) {
      if (root.points.length < 2) continue;
      const tip = root.points.at(-1);
      const d = getDistance(tip, light);
      if (d > LEAD_GRAB) continue;
      const along = Math.cos(getAngleDifference(root.angle, moveAngle));
      const score = d - 60 * along;
      if (!best || score < best.score) best = { root, score };
    }
    let chosen = best?.root;
    if (!chosen) {
      const near = closestOtherPoint(light, null);
      if (near && near.distance <= CONNECT_REACH) {
        const point = near.root.points[near.index];
        chosen = createRoot(point, getAngle(point, light), { kind: 'followed', parent: near.root, attachIndex: near.index });
        roots.push(chosen);
      } else { plantConnectingCluster(light); return null; }
    }
    chosen.branchLength = LEADER_TWIG_STEPS / BRANCH_SHRINK;
    chosen.stepsUntilSplit = Math.round(randomBetween(LEADER_TWIG_MIN_GAP, LEADER_TWIG_MAX_GAP));
    return chosen;
  }

  function updateRoots(lights, deltaSeconds) {
    growLeaves();
    for (const st of lightStates.values()) if (st.leader && alive(st.leader)) planRouteLeaves(st.leader);
    for (const id of [...lightStates.keys()]) if (!lights.some((l) => l.id === id)) lightStates.delete(id);
    const per = [];
    const nearest = new Map();
    const followed = new Set();
    for (const light of lights) {
      if (!lightStates.has(light.id)) lightStates.set(light.id, newLightState());
      const st = lightStates.get(light.id);
      loadLight(st);
      if (light && prevLight) {
        const v = getDistance(light, prevLight) / Math.max(deltaSeconds, 1e-3);
        lightSpeed += (v - lightSpeed) * Math.min(1, deltaSeconds * 10);
        if (getDistance(light, prevLight) > 0.5) moveAngle = getAngle(prevLight, light);
      } else lightSpeed = 0;
      const newPress = Boolean(light) && !prevLight;
      prevLight = light ? { x: light.x, y: light.y } : null;
      const moving = Boolean(light) && lightSpeed > MOVE_SPEED;
      if (!light) leader = null;
      const isResting = updateRest(light, deltaSeconds) && !moving;
      branchCooldown = Math.max(0, branchCooldown - deltaSeconds);
      sproutCooldown = Math.max(0, sproutCooldown - deltaSeconds);
      const closest = measureLight(light);
      const isWithinSpacing = closest && closest.distance <= PLANT_SPACING;
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
      dissolveRoot(root);
      if (root.targetRoot) {
        if (!roots.includes(root.targetRoot) || root.targetRoot.points.length < 2) { root.targetRoot = null; root.target = null; }
        else { const tp = root.targetRoot.points[Math.min(root.targetIndex, root.targetRoot.points.length - 1)]; root.target = { x: tp.x, y: tp.y }; }
      }
      const speed = getOwnGrowSpeed(root, lights);
      if (speed > 0) growRoot(root, speed * deltaSeconds, root.target);
      if (root.target && getDistance(root.points.at(-1), root.target) < STEP_LENGTH * 1.8) {
        root.points.push({ x: root.target.x, y: root.target.y, t: now });   // snap on: the roots really join
        root.burstSteps = 0; dirty = true;
        const joined = root.targetRoot;
        if (joined) root.joinedTo = { root: joined, index: root.targetIndex };   // [v2] only for the drawing: where it merged
        const a = spotById(root.spot), b = joined && spotById(joined.spot);
        if (a) { a.links++; a.energy += 1; }
        if (b && b !== a) { b.links++; b.energy += 1; }
        events.push({ type: 'connect', x: root.target.x, y: root.target.y, root, joined, spotA: a, spotB: b });
        root.target = null; root.targetRoot = null;
      }
    }

    const before = roots.length;
    roots = roots.filter((root) => !isGone(root));
    if (roots.length !== before) dirty = true;
    spots = spots.filter((spot) => roots.some((root) => root.spot === spot.id));
    for (const id of flowerSpots) if (!spots.some((spot) => spot.id === id)) flowerSpots.delete(id);

    for (const p of per) { loadLight(p.st); afterLight(p, deltaSeconds); saveLight(p.st); }
  }

  function afterLight({ light, newPress, moving, isResting, closest, other, isWithinSpacing }, deltaSeconds) {
    if (moving) {
      if (!leader || !roots.includes(leader) || getDistance(leader.points.at(-1), light) > LEAD_LOST) leader = pickLeader(light);
      if (leader) {
        const d = getDistance(leader.points.at(-1), light);
        const speed = Math.min(MAX_FOLLOW_SPEED, Math.max(GROW_SPEED, d * FOLLOW_GAIN));
        const target = 1 - Math.min(Math.max((lightSpeed - SLOW_SPEED) / (FAST_SPEED - SLOW_SPEED), 0), 1);
        branchiness += (target - branchiness) * Math.min(1, deltaSeconds * 4);
        leader.branchLength = (TWIG_STEPS_FAST + (TWIG_STEPS_SLOW - TWIG_STEPS_FAST) * branchiness) / BRANCH_SHRINK;
        if (d > STEP_LENGTH) growRoot(leader, Math.min(speed * deltaSeconds, d), light);
        tipForkCooldown -= deltaSeconds;
        if (branchiness > 0.3 && tipForkCooldown <= 0 && leader.points.length > 3 && !isAtPointLimit()) {
          const forks = branchiness > 0.75 && Math.random() < 0.5 ? 2 : 1;
          for (let k = 0; k < forks; k++) {
            const side = Math.random() < 0.5 ? -1 : 1;
            const steps = Math.round(4 + 8 * branchiness * Math.random());
            roots.push(createRoot(leader.points.at(-1), leader.angle + side * randomBetween(0.6, 1.4), { kind: 'side', burstSteps: steps, branchLength: steps, parent: leader, attachIndex: leader.points.length - 1 }));
          }
          tipForkCooldown = TIP_FORK_EVERY_SLOW / Math.max(branchiness, 0.05) * randomBetween(0.7, 1.3);
        }
        leader.branchiness = branchiness;
        trimTrail(leader, light);
      }
      return;
    }
    if (leader && light && roots.includes(leader)) trimTrail(leader, light);

    const isFarFromRoots = !closest || closest.distance > LIGHT_REACH;
    if (isResting && isFarFromRoots && !isNearPlantingSpot(light)) { plantRoots(light); sproutCooldown = SPROUT_SECONDS; return; }

    if (newPress && !isAtPointLimit()) {
      const spot = spots.find((sp) => getDistance(sp, light) < BOOST_RADIUS);
      if (spot) { boostSpot(spot); regrowCooldown = REGROW_SECONDS; sproutCooldown = SPROUT_SECONDS; }
    }
    regrowCooldown = Math.max(0, regrowCooldown - deltaSeconds);
    if (isResting && regrowCooldown === 0 && !isAtPointLimit()) { plantConnectingCluster(light); regrowCooldown = REGROW_SECONDS; sproutCooldown = SPROUT_SECONDS; }
    if (!isWithinSpacing) return;
    if (isResting && closest.distance <= BRANCH_DISTANCE && sproutCooldown === 0 && !isAtPointLimit()) { sproutRoots(closest); sproutCooldown = SPROUT_SECONDS; }
    followLight(other && other.distance <= PLANT_SPACING ? other : closest, light, deltaSeconds);
  }

  // ---- the drawn shape of a root
  // the line as it is drawn: smoothed (moving average), starting where its parent's line is, so branches stay attached
  function smoothLine(root, cache) {
    const pts = root.points, n = pts.length;
    if (n < 3) { cache.set(root, pts); return pts; }
    const parentLine = root.parent && cache.get(root.parent);
    const start = parentLine?.[Math.min(root.attachIndex, parentLine.length - 1)] ?? pts[0];
    const out = new Array(n);
    out[0] = { x: start.x, y: start.y };
    for (let i = 1; i < n; i++) {
      if (i === n - 1) { out[i] = pts[i]; break; }
      let sx = 0, sy = 0, c = 0;
      for (let j = Math.max(0, i - SMOOTH); j <= Math.min(n - 1, i + SMOOTH); j++) {
        const q = j === 0 ? out[0] : pts[j]; sx += q.x; sy += q.y; c++;
      }
      out[i] = { x: sx / c, y: sy / c };
    }
    cache.set(root, out);
    return out;
  }
  // width of a root at point i (px). It continues from the root it grows out of (no jumps where a branch starts):
  // thinner the further from where the whole thing started, gently swelling, pointed at the end
  const offsetOf = (root) => (root.offset ??= root.parent ? offsetOf(root.parent) + (root.attachIndex ?? 0) : 0);
  const treeSeed = (root) => (root.parent ? treeSeed(root.parent) : (root.seed ??= Math.random() * 100));
  function bodyWidth(root, i) {
    const total = offsetOf(root) + i;
    const own = Math.max(THICKNESS * Math.pow(0.72, root.depth), MIN_THICKNESS)
      * (1 - TIP_TAPER * Math.min(total / TAPER_LENGTH, 1))
      * (1 + SWELL * Math.sin(total * 0.09 + treeSeed(root)));
    if (!root.parent || i >= JOINT_BLEND || !roots.includes(root.parent)) return own;
    const from = bodyWidth(root.parent, Math.min(root.attachIndex ?? 0, root.parent.points.length - 1));
    return from + (own - from) * smooth(i / JOINT_BLEND);
  }
  function widthAt(root, i) {
    const last = Math.max(root.points.length - 1, 1);
    const tip = Math.min(1, Math.pow(Math.max(last - i, 0) / 7, 0.6));
    return Math.max(bodyWidth(root, i) * tip, 0.3);
  }
  // a tone per root (0..1): mostly the same as the root it grows from
  const toneOf = (root) => (root.tone ??= root.parent && roots.includes(root.parent) && Math.random() < KEEP_TONE ? toneOf(root.parent) : Math.random());

  // ---- fake lights: a random scenario with several lights at once (or a given list, for testing).
  // Each light starts at a random moment, stays a while and either stands still, wanders, or taps on one spot.
  const FAKE = { COUNT: [2, 7], START_WITHIN: 4, STAY: [2.5, 10], MOVE_CHANCE: 0.4, TAP_CHANCE: 0.2, SPEED: [35, 170], MARGIN: 80 };
  let fakeLights = [];
  let fakeCount = 0;
  function startFake(list = null) {
    const M = FAKE.MARGIN;
    fakeLights = [];
    const n = list ? list.length : Math.round(randomBetween(FAKE.COUNT[0], FAKE.COUNT[1]));
    for (let i = 0; i < n; i++) {
      const given = list?.[i] ?? {};
      const r = Math.random();
      const kind = given.kind ?? (r < FAKE.MOVE_CHANCE ? 'moving' : r < FAKE.MOVE_CHANCE + FAKE.TAP_CHANCE ? 'tapping' : 'still');
      const start = now + (given.start ?? Math.random() * FAKE.START_WITHIN);
      fakeLights.push({
        id: `fake${fakeCount++}`, kind, start, end: start + (given.stay ?? randomBetween(FAKE.STAY[0], FAKE.STAY[1])),
        x: given.x ?? randomBetween(M, W - M), y: given.y ?? randomBetween(M, H - M),
        angle: given.angle ?? Math.random() * Math.PI * 2, speed: given.speed ?? randomBetween(FAKE.SPEED[0], FAKE.SPEED[1]),
        turn: randomBetween(0.4, 1.2), phase: Math.random() * 10,
        tapOn: randomBetween(0.4, 0.9), tapOff: randomBetween(0.25, 0.6),
      });
    }
    return fakeLights.length;
  }
  function updateFakeLights(dt) {
    const M = FAKE.MARGIN, on = [];
    for (const f of fakeLights) {
      if (now < f.start || now > f.end) continue;
      if (f.kind === 'moving') {
        f.angle += Math.sin(now * f.turn + f.phase) * f.turn * dt;
        f.x += Math.cos(f.angle) * f.speed * dt; f.y += Math.sin(f.angle) * f.speed * dt;
        if (f.x < M || f.x > W - M) { f.angle = Math.PI - f.angle; f.x = Math.min(Math.max(f.x, M), W - M); }
        if (f.y < M || f.y > H - M) { f.angle = -f.angle; f.y = Math.min(Math.max(f.y, M), H - M); }
      }
      if (f.kind === 'tapping') { const cycle = f.tapOn + f.tapOff; if ((now - f.start) % cycle > f.tapOn) continue; }
      on.push({ id: f.id, x: f.x, y: f.y });
    }
    if (fakeLights.length && fakeLights.every((f) => now > f.end)) fakeLights = [];
    return on;
  }

  return {
    live,
    get roots() { return roots; },
    get spots() { return spots; },
    get now() { return now; },
    get fakeActive() { return fakeLights.length > 0; },
    get dirty() { return dirty; },
    clean() { dirty = false; },
    touch() { dirty = true; },                     // [v2] the look changed: rebuild the tubes
    setSize(w, h) { W = w; H = h; },
    alive, anchorOn, centerOf, widthAt, toneOf, smoothLine, isAtPointLimit,
    spotAlive, keepRoot, flowerSpots,
    startFake, stopFake() { fakeLights = []; },
    // one step: the real lights (mouse / camera, {id, x, y}) plus the fake ones. Returns the events of this step.
    update(realLights, dt) {
      now += dt;
      const lights = [...realLights, ...updateFakeLights(dt)];
      events.length = 0;
      updateRoots(lights, dt);
      return { lights, events };
    },
    clear() { roots = []; spots = []; fakeLights = []; pendingLeaves = []; lightStates.clear(); flowerSpots.clear(); dirty = true; },
  };
}
