// Page 9 – Spark → oxygen. An electric spark (like the old photograph) covers the wall.
// Where a light shines, current pulses out along the branches; where it arrives, water appears as
// foam (like the bubble artwork). Bubbles swell and shrink with the breath (4 s in, 6 s out) and on
// every exhale some of them let go and rise: oxygen. Lights that are close to each other connect
// through a bridge of bubbles. When the light leaves, the foam pops and rises away, the spark stays.
//
// Idea behind it (photosynthesis): light sets electrons moving, the plant splits water to keep the
// current going, and splitting water releases oxygen.
// Everything is drawn with a 2D canvas, generated in code.
import GUI from 'lil-gui';
import './spark.css';

const STORAGE_KEY = 'flowers-web-spark-v1';
const MAX_LIGHTS = 8;
const MAX_BUBBLES = 1100;

const DEFAULTS = {
  // spark
  'Spark Seed': 7,
  'Main Arms': 15,
  'Branch Length': 1.0,
  'Branchiness': 0.55,
  'Line Width': 1.0,
  'Glow': 0.8,
  'Spark Colour': '#f3eed3',
  'Background': '#26243a',
  'Idle Pulse': 0.5,
  // water + bubbles
  'Light Radius': 0.17,
  'Bubble Rate': 1.0,
  'Bubble Size': 1.0,
  'Lace (tiny bubbles)': 0.6,
  'Water Colour': '#5f9aa3',
  'Water Opacity': 0.8,
  'Wall Colour': '#eef5f3',
  'Ripples': 3,
  'Linger (s)': 4,
  'Connect Distance': 0.45,
  // breath
  'Breath In (s)': 4,
  'Breath Out (s)': 6,
  'Breath Swell': 0.06,
  'Oxygen Released': 0.12,
  // light
  'Show Light': true,
  'Use Camera': false,
  'Camera Threshold': 230,
  'Mirror Camera': true,
};

// ------------------------------------------------------------------ helpers
function rng(seed) {                                       // small seeded random (same spark for the same seed)
  let s = (seed * 9301 + 49297) % 233280 || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const ease = (t) => t * t * (3 - 2 * t);
const rand = (a, b) => a + Math.random() * (b - a);

export function createSparkPage() {
  const params = { ...DEFAULTS };
  try { Object.assign(params, JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')); } catch { /* no storage */ }
  const save = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(params)); } catch { /* ignore */ } };

  const page = document.createElement('div');
  page.id = 'spark-page';
  page.hidden = true;
  page.innerHTML = `
    <canvas class="spark__canvas"></canvas>
    <video class="spark__video" muted playsinline hidden></video>
    <p class="spark__hint">Hold the mouse button = flashlight · or "Fake lights" / "Use Camera" in the panel</p>`;
  document.body.appendChild(page);
  const canvas = page.querySelector('.spark__canvas');
  const ctx = canvas.getContext('2d');
  const video = page.querySelector('.spark__video');

  let W = 0, H = 0, S = 1, dpr = 1;
  // pre-rendered layers
  const bgLayer = document.createElement('canvas');
  const sparkLayer = document.createElement('canvas');
  const waterLayer = document.createElement('canvas');
  const wctx = waterLayer.getContext('2d');

  // ---------------------------------------------------------------- the spark (Lichtenberg-like branching)
  let segs = [];          // {x1,y1,x2,y2,w,d (path distance from the centre)}
  let grid = new Map();   // segment midpoints in cells, for "which branches are near this light"
  const CELL = 40;
  let centre = { x: 0, y: 0 }, maxD = 1;

  function buildSpark() {
    const r = rng(params['Spark Seed']);
    segs = [];
    centre = { x: W * (0.5 + (r() - 0.5) * 0.06), y: H * (0.5 + (r() - 0.5) * 0.08) };
    const arms = Math.round(params['Main Arms']);
    const step = 7 * S;
    const branchP = 0.05 + params['Branchiness'] * 0.1;
    const stack = [];
    for (let i = 0; i < arms; i++) {
      const a = (i / arms) * Math.PI * 2 + (r() - 0.5) * 0.5;
      // longer to the sides: the wall is wide
      const reach = Math.hypot(Math.cos(a) * W * 0.5, Math.sin(a) * H * 0.5) * (0.8 + r() * 0.3) * params['Branch Length'];
      stack.push({ x: centre.x, y: centre.y, a, home: a, len: reach, w: 3.2 * S, d: 0, depth: 0 });
    }
    while (stack.length && segs.length < 14000) {
      const b = stack.shift();                            // all arms first, then their branches
      let { x, y, a, len, w, d } = b;
      let bend = (r() - 0.5) * 0.04;
      let walked = 0;
      while (walked < len) {
        bend += (r() - 0.5) * 0.06; bend *= 0.85;
        a += bend + (r() - 0.5) * 0.55;                     // jagged, like a spark
        a += (b.home - a) * 0.12;                           // ...but keeps its overall direction
        const st = step * (0.6 + r() * 0.8);
        const nx = x + Math.cos(a) * st, ny = y + Math.sin(a) * st;
        if (nx < -20 || ny < -20 || nx > W + 20 || ny > H + 20) break;
        const f = walked / len;
        const ww = Math.max(0.35 * S, w * (1 - f * 0.75));
        segs.push({ x1: x, y1: y, x2: nx, y2: ny, w: ww, d });
        x = nx; y = ny; walked += st; d += st;
        // side branches
        if (r() < branchP && len - walked > step * 3 && b.depth < 6) {
          const side = r() < 0.5 ? -1 : 1;
          const na = a + side * (0.35 + r() * 0.7);
          stack.push({ x, y, a: na, home: na, len: (len - walked) * (0.35 + r() * 0.45), w: ww * 0.7, d, depth: b.depth + 1 });
        }
      }
      // fine hairs at the tip
      for (let k = 0; k < 3; k++) {
        let hx = x, hy = y, ha = a + (r() - 0.5) * 1.6;
        for (let j = 0; j < 3; j++) {
          ha += (r() - 0.5) * 0.8;
          const nx = hx + Math.cos(ha) * step * 0.7, ny = hy + Math.sin(ha) * step * 0.7;
          segs.push({ x1: hx, y1: hy, x2: nx, y2: ny, w: 0.35 * S, d: d + j * step });
          hx = nx; hy = ny;
        }
      }
    }
    maxD = segs.reduce((m, s) => Math.max(m, s.d), 1);
    grid = new Map();
    segs.forEach((s, i) => {
      const k = `${Math.floor((s.x1 + s.x2) / 2 / CELL)},${Math.floor((s.y1 + s.y2) / 2 / CELL)}`;
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(i);
    });
    drawSparkLayer();
  }

  function drawSparkLayer() {
    sparkLayer.width = W * dpr; sparkLayer.height = H * dpr;
    const c = sparkLayer.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.lineCap = 'round';
    const col = params['Spark Colour'];
    const lw = params['Line Width'];
    // soft glow under the lines
    if (params['Glow'] > 0) {
      c.save();
      c.filter = `blur(${6 * S}px)`;
      c.globalAlpha = 0.55 * params['Glow'];
      c.strokeStyle = col;
      for (const s of segs) { c.lineWidth = s.w * 2.5 * lw; c.beginPath(); c.moveTo(s.x1, s.y1); c.lineTo(s.x2, s.y2); c.stroke(); }
      c.restore();
    }
    c.strokeStyle = col;
    for (const s of segs) { c.lineWidth = s.w * lw; c.beginPath(); c.moveTo(s.x1, s.y1); c.lineTo(s.x2, s.y2); c.stroke(); }
    // bright core in the middle, like the photo
    const g = c.createRadialGradient(centre.x, centre.y, 0, centre.x, centre.y, 90 * S);
    g.addColorStop(0, 'rgba(255,252,235,0.95)'); g.addColorStop(0.25, 'rgba(255,250,225,0.45)'); g.addColorStop(1, 'rgba(255,250,225,0)');
    c.fillStyle = g; c.beginPath(); c.arc(centre.x, centre.y, 90 * S, 0, Math.PI * 2); c.fill();
  }

  function drawBackground() {
    bgLayer.width = W * dpr; bgLayer.height = H * dpr;
    const c = bgLayer.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = params['Background']; c.fillRect(0, 0, W, H);
    // paper grain + soft vignette, like the old print
    const img = c.getImageData(0, 0, bgLayer.width, bgLayer.height);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 14;
      img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
    }
    c.putImageData(img, 0, 0);
    const v = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.45)');
    c.fillStyle = v; c.fillRect(0, 0, W, H);
  }

  function nearbySegs(x, y, radius) {
    const out = [];
    const r = Math.ceil(radius / CELL);
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
      const list = grid.get(`${cx + i},${cy + j}`);
      if (!list) continue;
      for (const k of list) {
        const s = segs[k];
        const mx = (s.x1 + s.x2) / 2, my = (s.y1 + s.y2) / 2;
        if (Math.hypot(mx - x, my - y) < radius) out.push(k);
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- lights
  const mouse = { x: 0, y: 0, down: false };
  canvas.addEventListener('pointerdown', (e) => { mouse.down = true; mouse.x = e.clientX; mouse.y = e.clientY; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
  canvas.addEventListener('pointerup', () => { mouse.down = false; });
  canvas.addEventListener('pointercancel', () => { mouse.down = false; });

  let fake = [], fakeUntil = 0;
  function startFake(now) {
    const n = 1 + Math.floor(Math.random() * 4);
    fake = Array.from({ length: n }, () => ({ seed: Math.random() * 100, x: 0.15 + Math.random() * 0.7, y: 0.2 + Math.random() * 0.6, on: now + Math.random() * 3 }));
    fakeUntil = now + 30;
  }
  function fakeLights(now) {
    if (now > fakeUntil) { fake = []; return []; }
    return fake.filter((f) => now > f.on).map((f) => {
      const t = now * 0.06 + f.seed;
      return { x: (f.x + Math.sin(t * 1.3) * 0.08 + Math.sin(t * 0.7 + 2) * 0.05) * W, y: (f.y + Math.cos(t * 1.1) * 0.08) * H };
    });
  }

  let camOn = false;
  const camCanvas = document.createElement('canvas');
  const CW = 160, CH = 90;
  camCanvas.width = CW; camCanvas.height = CH;
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
  function cameraLights() {                       // bright blobs in a small camera image
    if (!camOn || video.readyState < 2) return [];
    camCtx.drawImage(video, 0, 0, CW, CH);
    const px = camCtx.getImageData(0, 0, CW, CH).data;
    const thr = params['Camera Threshold'];
    const bright = new Uint8Array(CW * CH);
    for (let i = 0; i < CW * CH; i++) bright[i] = (px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2]) / 3 > thr ? 1 : 0;
    const out = [], stack = [];
    for (let i = 0; i < CW * CH && out.length < MAX_LIGHTS; i++) {
      if (bright[i] !== 1) continue;
      let sx = 0, sy = 0, n = 0; stack.push(i); bright[i] = 2;
      while (stack.length) {
        const j = stack.pop(); const x = j % CW, y = (j / CW) | 0; sx += x; sy += y; n++;
        for (const k of [j - 1, j + 1, j - CW, j + CW]) {
          if (k < 0 || k >= CW * CH || bright[k] !== 1 || Math.abs((k % CW) - x) > 1) continue;
          bright[k] = 2; stack.push(k);
        }
      }
      if (n >= 6) { const x = sx / n / CW; out.push({ x: (params['Mirror Camera'] ? 1 - x : x) * W, y: (sy / n / CH) * H }); }
    }
    return out;
  }

  // every light keeps a little state: how far its current has spread, and its pulses
  let tracked = [];       // {x,y,energy 0..1, pulses:[radius], nextPulse}
  function trackLights(lights, dt, now) {
    const next = [];
    for (const l of lights) {
      let best = null, bd = 0.15 * H;
      for (const t of tracked) { const d = Math.hypot(t.x - l.x, t.y - l.y); if (d < bd && !next.includes(t)) { bd = d; best = t; } }
      const t = best || { energy: 0, pulses: [], nextPulse: now };
      t.x = l.x; t.y = l.y;
      next.push(t);
    }
    for (const t of next) {
      t.energy = Math.min(1, t.energy + dt / 0.8);                  // current reaches the full radius in ~0.8 s
      if (now >= t.nextPulse) { t.pulses.push(0); t.nextPulse = now + 1.3; }
      t.pulses = t.pulses.map((p) => p + dt * 420 * S).filter((p) => p < radius() * 1.7);
    }
    tracked = next;
  }
  const radius = () => params['Light Radius'] * H;

  // ---------------------------------------------------------------- bubbles (foam)
  let bubbles = [];       // {x,y,R target,r now,seed shape,state,grow,fed,pop}
  let rising = [];        // oxygen bubbles that let go

  function fitRadius(x, y, want) {
    const gap = 1.4 * S;
    let fit = want;
    for (const b of bubbles) {
      if (b.state === 'pop') continue;
      const d = Math.hypot(b.x - x, b.y - y) - b.R - gap;
      if (d < fit) { fit = d; if (fit < 1.2 * S) return 0; }
    }
    return fit;
  }
  function makeShape() {                          // slightly wobbly outline, like hand-made foam
    const n = 36, out = new Float32Array(n);
    const a = rand(0, 6.28), b = rand(0, 6.28), k1 = rand(0.02, 0.07), k2 = rand(0.01, 0.04);
    for (let i = 0; i < n; i++) { const t = (i / n) * Math.PI * 2; out[i] = 1 + Math.sin(t * 2 + a) * k1 + Math.sin(t * 3 + b) * k2; }
    return out;
  }
  function addBubble(x, y, R) {
    if (bubbles.length >= MAX_BUBBLES || x < 0 || y < 0 || x > W || y > H) return;
    bubbles.push({ x, y, R, r: 0, shape: makeShape(), state: 'grow', grow: 0, fed: 0, ripple: rand(0, 1), ox: rand(-0.25, 0.25), oy: rand(-0.25, 0.25) });
  }
  function randomSize(boost = 1) {                // many small, some medium, few big
    const s = S * params['Bubble Size'];
    const u = Math.random();
    if (u < 0.45) return rand(3, 8) * s;
    if (u < 0.8) return rand(8, 22) * s * boost;
    return rand(22, 55) * s * boost;
  }

  // spawn bubbles on the branches near a point (only where the current has already arrived)
  function spawnNear(x, y, reach, count, boost = 1) {
    const near = nearbySegs(x, y, reach);
    if (!near.length) return;
    const local = bubbles.filter((b) => b.state !== 'pop' && b.R > 5 * S && Math.hypot(b.x - x, b.y - y) < reach);
    for (let i = 0; i < count; i++) {
      if (local.length && Math.random() < 0.55) {            // pack against a bubble that is already there
        const o = local[(Math.random() * local.length) | 0];
        const want = randomSize(boost), a = rand(0, Math.PI * 2), d = o.R + want + 1.4 * S;
        const px = o.x + Math.cos(a) * d, py = o.y + Math.sin(a) * d;
        if (Math.hypot(px - x, py - y) > reach) continue;
        const R = fitRadius(px, py, want);
        if (R >= 2.5 * S) addBubble(px, py, R);
        continue;
      }
      const s = segs[near[(Math.random() * near.length) | 0]];
      const t = Math.random();
      const px = s.x1 + (s.x2 - s.x1) * t + rand(-6, 6) * S, py = s.y1 + (s.y2 - s.y1) * t + rand(-6, 6) * S;
      // more and bigger bubbles close to the light
      const closeness = 1 - Math.hypot(px - x, py - y) / reach;
      if (Math.random() > 0.25 + closeness) continue;
      const R = fitRadius(px, py, randomSize(boost * (0.6 + closeness * 0.8)));
      if (R >= 2.5 * S) addBubble(px, py, R);
    }
  }
  // tiny bubbles packed along the walls of the bigger ones (the lacy look)
  function spawnLace(count) {
    const big = bubbles.filter((b) => b.state !== 'pop' && b.R > 9 * S);
    if (!big.length) return;
    for (let i = 0; i < count; i++) {
      const b = big[(Math.random() * big.length) | 0];
      const a = rand(0, Math.PI * 2), want = rand(1.3, 4) * S;
      const d = b.R + want + 1.4 * S;
      const x = b.x + Math.cos(a) * d, y = b.y + Math.sin(a) * d;
      const R = fitRadius(x, y, want);
      if (R >= 1.1 * S) addBubble(x, y, R);
    }
  }

  // ---------------------------------------------------------------- breath (4 s in, 6 s out)
  let lastPhaseOut = false;
  function breath(now) {
    const tin = params['Breath In (s)'], tout = params['Breath Out (s)'];
    const t = now % (tin + tout);
    if (t < tin) return { v: ease(t / tin), out: false };
    return { v: 1 - ease((t - tin) / tout), out: true };
  }
  function releaseOxygen() {                      // on every exhale some bubbles let go and rise
    const share = params['Oxygen Released'];
    for (const b of bubbles) {
      if (b.state !== 'live' || b.R > 22 * S || Math.random() > share) continue;
      b.state = 'pop'; b.pop = 1;
      rising.push({ x: b.x, y: b.y, r: b.r, vy: rand(18, 45) * S, sway: rand(0, 6.28), life: rand(4, 7), age: 0 });
    }
  }

  // ---------------------------------------------------------------- update
  function update(dt, now) {
    const R = radius();
    const lights = [];
    if (mouse.down) lights.push({ x: mouse.x, y: mouse.y });
    lights.push(...fakeLights(now));
    if (params['Use Camera']) lights.push(...cameraLights());
    trackLights(lights.slice(0, MAX_LIGHTS), dt, now);

    // spawn foam around every light
    const rate = params['Bubble Rate'];
    for (const t of tracked) {
      const reach = R * t.energy;
      if (reach > 10 * S) spawnNear(t.x, t.y, reach, Math.ceil(10 * rate));
    }
    // lights close to each other connect through a bridge of bubbles
    const links = [];
    const maxLink = params['Connect Distance'] * W;
    for (let i = 0; i < tracked.length; i++) for (let j = i + 1; j < tracked.length; j++) {
      const a = tracked[i], b = tracked[j];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > maxLink || a.energy < 1 || b.energy < 1) continue;
      links.push([a, b]);
      for (let k = 0; k < Math.ceil(5 * rate); k++) {
        const t = Math.random();
        const nx = -(b.y - a.y) / d, ny = (b.x - a.x) / d, off = rand(-1, 1) * R * 0.35 * Math.sin(t * Math.PI);
        const x = a.x + (b.x - a.x) * t + nx * off, y = a.y + (b.y - a.y) * t + ny * off;
        spawnNear(x, y, R * 0.35, 1, 1 + Math.sin(t * Math.PI) * 0.6);     // biggest in the middle
      }
    }
    spawnLace(Math.ceil(14 * params['Lace (tiny bubbles)'] * rate * (tracked.length ? 1 : 0.2)));

    // fed = close to a light or on a bridge; otherwise the foam pops after 'Linger'
    const linger = params['Linger (s)'];
    const distToLink = (b, a, c) => {
      const vx = c.x - a.x, vy = c.y - a.y, l2 = vx * vx + vy * vy || 1;
      const t = clamp01(((b.x - a.x) * vx + (b.y - a.y) * vy) / l2);
      return Math.hypot(b.x - (a.x + vx * t), b.y - (a.y + vy * t));
    };
    for (const b of bubbles) {
      const near = tracked.some((t) => Math.hypot(t.x - b.x, t.y - b.y) < R * 1.35)
        || links.some(([a, c]) => distToLink(b, a, c) < R * 0.5);
      b.fed = near ? 0 : b.fed + dt;
      if (b.state === 'grow') { b.grow = Math.min(1, b.grow + dt / rand(0.6, 1.4)); if (b.grow >= 1) b.state = 'live'; }
      if (b.state !== 'pop' && b.fed > linger + b.ripple * 2.5) {
        b.state = 'pop'; b.pop = 1;
        if (Math.random() < 0.35 && b.R < 22 * S) rising.push({ x: b.x, y: b.y, r: b.r, vy: rand(18, 45) * S, sway: rand(0, 6.28), life: rand(3, 6), age: 0 });
      }
      if (b.state === 'pop') b.pop -= dt / 1.2;
    }
    bubbles = bubbles.filter((b) => !(b.state === 'pop' && b.pop <= 0));

    // breath
    const br = breath(now);
    if (br.out && !lastPhaseOut) releaseOxygen();
    lastPhaseOut = br.out;
    const swell = 1 + params['Breath Swell'] * (br.v - 0.5) * 2;
    for (const b of bubbles) {
      const g = b.state === 'pop' ? ease(clamp01(b.pop)) : ease(b.grow);
      b.r = b.R * g * swell;
    }
    for (const o of rising) { o.age += dt; o.y -= o.vy * dt; o.x += Math.sin(now * 1.3 + o.sway) * 8 * S * dt; }
    rising = rising.filter((o) => o.age < o.life && o.y > -50);
    return { br };
  }

  // ---------------------------------------------------------------- draw
  function bubblePath(c, b, scale = 1) {
    const n = b.shape.length;
    c.moveTo(b.x + b.r * scale * b.shape[0], b.y);
    for (let i = 1; i <= n; i++) {
      const a = (i / n) * Math.PI * 2, k = b.shape[i % n] * b.r * scale;
      c.lineTo(b.x + Math.cos(a) * k, b.y + Math.sin(a) * k);
    }
  }

  function draw(now, br) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.drawImage(bgLayer, 0, 0, W, H);

    // water body under everything (one layer, so overlapping bubbles don't get darker)
    wctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    wctx.clearRect(0, 0, W, H);
    wctx.fillStyle = params['Water Colour'];
    wctx.beginPath();
    for (const b of bubbles) if (b.r > 0.5) { bubblePath(wctx, b, 1 + 5 * S / Math.max(b.r, 1)); wctx.closePath(); }
    wctx.fill();
    ctx.globalAlpha = params['Water Opacity'];
    ctx.drawImage(waterLayer, 0, 0, W, H);
    ctx.globalAlpha = 1;

    // the spark, slightly brighter on the inhale
    ctx.globalAlpha = 0.82 + 0.18 * br.v;
    ctx.drawImage(sparkLayer, 0, 0, W, H);
    ctx.globalAlpha = 1;

    // current: pulses running out along the branches from every light, plus a slow idle pulse from the centre
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    const col = params['Spark Colour'];
    ctx.strokeStyle = col;
    const band = 26 * S;
    for (const t of tracked) {
      const segsNear = nearbySegs(t.x, t.y, radius() * 1.7);
      for (const p of t.pulses) {
        for (const k of segsNear) {
          const s = segs[k];
          const d = Math.hypot((s.x1 + s.x2) / 2 - t.x, (s.y1 + s.y2) / 2 - t.y);
          const g = Math.exp(-((d - p) ** 2) / (band * band)) * (1 - p / (radius() * 1.7));
          if (g < 0.03) continue;
          ctx.globalAlpha = g; ctx.lineWidth = s.w * params['Line Width'] * 2.2;
          ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
        }
      }
      // the branches near the light stay charged
      const glow = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, radius() * 0.9);
      glow.addColorStop(0, `rgba(240,248,255,${0.10 * t.energy})`); glow.addColorStop(1, 'rgba(240,248,255,0)');
      ctx.globalAlpha = 1; ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(t.x, t.y, radius() * 0.9, 0, Math.PI * 2); ctx.fill();
    }
    if (params['Idle Pulse'] > 0) {                     // very slow pulse from the centre outwards, every breath
      const tin = params['Breath In (s)'], tout = params['Breath Out (s)'];
      const ph = (now % (tin + tout)) / (tin + tout);
      const front = ph * maxD * 1.1;
      for (const s of segs) {
        const g = Math.exp(-((s.d - front) ** 2) / ((60 * S) ** 2)) * params['Idle Pulse'] * 0.6;
        if (g < 0.04) continue;
        ctx.globalAlpha = g; ctx.lineWidth = s.w * params['Line Width'] * 1.8;
        ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
      }
    }
    ctx.restore();

    // bubble walls + ripples inside the big ones
    const wall = params['Wall Colour'];
    ctx.strokeStyle = wall;
    for (const b of bubbles) {
      if (b.r < 0.8) continue;
      const a = b.state === 'pop' ? clamp01(b.pop) : 1;
      ctx.globalAlpha = 0.95 * a;
      ctx.lineWidth = Math.max(0.7, Math.min(2.2, b.r * 0.09)) * S;
      ctx.beginPath(); bubblePath(ctx, b); ctx.closePath(); ctx.stroke();
      const rings = Math.round(params['Ripples']);
      if (rings > 0 && b.r > 16 * S) {
        ctx.globalAlpha = 0.22 * a;
        ctx.lineWidth = 0.8 * S;
        for (let i = 1; i <= rings; i++) {
          const f = 1 - i / (rings + 1);
          const cx = b.x + b.ox * b.r * (1 - f), cy = b.y + b.oy * b.r * (1 - f);
          ctx.beginPath(); bubblePath(ctx, { ...b, x: cx, y: cy }, f * 0.92); ctx.closePath(); ctx.stroke();
        }
      }
    }
    // oxygen rising
    for (const o of rising) {
      const f = o.age / o.life;
      ctx.globalAlpha = (1 - f) * 0.9;
      ctx.lineWidth = 1 * S;
      ctx.beginPath(); ctx.arc(o.x, o.y, Math.max(0.5, o.r * (1 - f * 0.5)), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // where the flashlight is (for testing with the mouse)
    if (params['Show Light']) {
      for (const t of tracked) {
        const g = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, radius() * 0.6);
        g.addColorStop(0, 'rgba(255,255,245,0.16)'); g.addColorStop(1, 'rgba(255,255,245,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(t.x, t.y, radius() * 0.6, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  // ---------------------------------------------------------------- panel
  const gui = new GUI({ title: '9 · Spark → oxygen' });
  gui.domElement.classList.add('spark__gui');
  gui.hide();
  const onChange = () => save();
  const rebuild = () => { save(); buildSpark(); };
  const redrawSpark = () => { save(); drawSparkLayer(); };
  const f1 = gui.addFolder('Spark');
  f1.add(params, 'Spark Seed', 1, 999, 1).onFinishChange(rebuild);
  f1.add(params, 'Main Arms', 4, 30, 1).onFinishChange(rebuild);
  f1.add(params, 'Branch Length', 0.4, 1.6, 0.01).onFinishChange(rebuild);
  f1.add(params, 'Branchiness', 0, 1, 0.01).onFinishChange(rebuild);
  f1.add(params, 'Line Width', 0.3, 3, 0.01).onFinishChange(redrawSpark);
  f1.add(params, 'Glow', 0, 2, 0.01).onFinishChange(redrawSpark);
  f1.addColor(params, 'Spark Colour').onFinishChange(redrawSpark);
  f1.addColor(params, 'Background').onFinishChange(() => { save(); drawBackground(); });
  f1.add(params, 'Idle Pulse', 0, 1.5, 0.01).onChange(onChange);
  const f2 = gui.addFolder('Water + bubbles');
  f2.add(params, 'Light Radius', 0.05, 0.4, 0.005).onChange(onChange);
  f2.add(params, 'Bubble Rate', 0.1, 3, 0.05).onChange(onChange);
  f2.add(params, 'Bubble Size', 0.4, 2.5, 0.01).onChange(onChange);
  f2.add(params, 'Lace (tiny bubbles)', 0, 2, 0.01).onChange(onChange);
  f2.addColor(params, 'Water Colour').onChange(onChange);
  f2.add(params, 'Water Opacity', 0, 1, 0.01).onChange(onChange);
  f2.addColor(params, 'Wall Colour').onChange(onChange);
  f2.add(params, 'Ripples', 0, 6, 1).onChange(onChange);
  f2.add(params, 'Linger (s)', 0.5, 20, 0.5).onChange(onChange);
  f2.add(params, 'Connect Distance', 0, 1, 0.01).onChange(onChange);
  const f3 = gui.addFolder('Breath + oxygen');
  f3.add(params, 'Breath In (s)', 1, 10, 0.5).onChange(onChange);
  f3.add(params, 'Breath Out (s)', 1, 12, 0.5).onChange(onChange);
  f3.add(params, 'Breath Swell', 0, 0.25, 0.005).onChange(onChange);
  f3.add(params, 'Oxygen Released', 0, 0.6, 0.01).onChange(onChange);
  const f4 = gui.addFolder('Light');
  f4.add(params, 'Show Light').name('Show light spot').onChange(onChange);
  f4.add(params, 'Use Camera').onChange((v) => { setCamera(v); onChange(); });
  f4.add(params, 'Camera Threshold', 50, 255, 1).onChange(onChange);
  f4.add(params, 'Mirror Camera').onChange(onChange);
  const actions = {
    'Fake lights': () => startFake(performance.now() / 1000),
    'Stop fake lights': () => { fakeUntil = 0; },
    'Clear bubbles': () => { bubbles = []; rising = []; },
    'New spark': () => { params['Spark Seed'] = 1 + Math.floor(Math.random() * 998); gui.controllersRecursive().forEach((c) => c.updateDisplay()); rebuild(); },
    'Reset settings': () => { Object.assign(params, DEFAULTS); save(); gui.controllersRecursive().forEach((c) => c.updateDisplay()); drawBackground(); buildSpark(); },
  };
  for (const k of Object.keys(actions)) gui.add(actions, k);

  // ---------------------------------------------------------------- loop
  let running = false, raf = 0, last = 0;
  function resize() {
    W = window.innerWidth; H = window.innerHeight; S = H / 1080;
    dpr = Math.min(window.devicePixelRatio, 2);
    canvas.width = W * dpr; canvas.height = H * dpr;
    waterLayer.width = W * dpr; waterLayer.height = H * dpr;
    bubbles = []; rising = [];
    drawBackground(); buildSpark();
  }
  function loop() {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    const now = performance.now() / 1000;
    const dt = Math.min(now - last, 0.05); last = now;
    const { br } = update(dt, now);
    draw(now, br);
  }
  window.addEventListener('resize', () => { if (running) resize(); });

  return {
    show() {
      if (running) return;
      page.hidden = false; gui.show();
      running = true; resize();
      last = performance.now() / 1000;
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
