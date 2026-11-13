// JavaScript port of the Blender "Lily Generator" (Geometry Nodes).
// Same maths as the node tree, so the sliders behave the same way.
// Everything is built in Blender's coordinates (Z up) and converted to Three.js (Y up) at the end.
//
// Every vertex also gets:
//   growth  0..1  when it appears in the build-up (stem bottom -> top, leaves outwards, petals base -> tip)
//   u, v          position along / across a petal or leaf (used by the petal material)
//   part          0 petal, 1 stem, 2 leaf, 3 stamen, 4 anther
//   seed          a number per petal / leaf (so speckles differ per petal)

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
export const PART = { PETAL: 0, STEM: 1, LEAF: 2, STAMEN: 3, ANTHER: 4 };
const PART_COLOR = {               // linear RGB, same as the Blender materials
  0: [1, 1, 1],                    // petals are coloured in the shader
  1: [0.12, 0.32, 0.08],
  2: [0.09, 0.27, 0.06],
  3: [0.75, 0.78, 0.55],
  4: [0.45, 0.12, 0.03],
};

const clamp01 = (x) => Math.min(Math.max(x, 0), 1);

class MeshBuilder {
  constructor() {
    this.pos = []; this.growth = []; this.u = []; this.v = []; this.part = []; this.seed = []; this.col = [];
    this.tris = []; this.edges = new Set();
  }
  get count() { return this.pos.length / 3; }
  vert([x, y, z], growth, part, u = 0, v = 0, seed = 0) {
    this.pos.push(x, z, -y);                       // Blender Z-up -> Three.js Y-up
    this.growth.push(growth); this.u.push(u); this.v.push(v); this.part.push(part); this.seed.push(seed);
    this.col.push(...PART_COLOR[part]);
    return this.count - 1;
  }
  edge(a, b) { this.edges.add(a < b ? a * 1e6 + b : b * 1e6 + a); }
  tri(a, b, c) { this.tris.push(a, b, c); this.edge(a, b); this.edge(b, c); this.edge(c, a); }
  quad(a, b, c, d) { this.tris.push(a, b, c, a, c, d); this.edge(a, b); this.edge(b, c); this.edge(c, d); this.edge(d, a); }
  result() {
    const edges = new Uint32Array(this.edges.size * 2); let i = 0;
    for (const k of this.edges) { edges[i++] = Math.floor(k / 1e6); edges[i++] = k % 1e6; }
    return {
      position: new Float32Array(this.pos), growth: new Float32Array(this.growth),
      u: new Float32Array(this.u), v: new Float32Array(this.v), part: new Float32Array(this.part),
      seed: new Float32Array(this.seed), color: new Float32Array(this.col),
      index: new Uint32Array(this.tris), edges,
    };
  }
}

// rotations (Blender euler XYZ = rotate X, then Y, then Z)
const rotX = ([x, y, z], a) => [x, y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)];
const rotY = ([x, y, z], a) => [x * Math.cos(a) + z * Math.sin(a), y, -x * Math.sin(a) + z * Math.cos(a)];
const rotZ = ([x, y, z], a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a), z];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const len = (a) => Math.hypot(a[0], a[1], a[2]);

// small seeded random, same idea as Blender's Random Value (not the same numbers)
function rand(seed, i) {
  let t = (seed * 9973 + i * 7919 + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;          // -1 .. 1
}

// ------------------------------------------------------------------ petals (one petal shape, copied around)
function petalPoint(p, u, v, lenF, bloomF, bloom) {
  const bl = bloom * bloomF;
  const L = p['Petal Length'] * lenF, W = p['Petal Width'] * lenF;
  const s = u * L;
  let w = W * Math.sin(Math.pow(u, p['Petal Tip Shape']) * Math.PI);        // pointed tip
  w *= 0.15 + 0.85 * Math.min(u * 4, 1);                                     // narrow claw at the base
  const Y = v * w;
  const cup = p['Petal Surface Curvature'] * v * v * w;
  const ruff = p['Petal Edge Ruffle'] * W * 0.25 * Math.abs(v) * Math.abs(v) * Math.sin(u * 14 + v * 3) * Math.pow(u, 1.5);
  const tip = p['Petal Tip Bend'] * L * -0.3 * Math.pow(u, 3) * (0.3 + 0.7 * bl);
  const n = cup + ruff + tip;
  const a0 = 8 * DEG + bl * 72 * DEG;                                        // opening angle
  const total = p['Petal Arc Bend'] * 1.4 * (0.25 + 0.75 * bl);
  const k = total / L + 0.0001;
  const a = a0 + k * s;
  const r = (Math.cos(a0) - Math.cos(a)) / k;
  const z = (Math.sin(a) - Math.sin(a0)) / k;
  return [r + 0.02 - Math.cos(a) * n, Y, z + Math.sin(a) * n];
}

// the petal rings: ring 0 is the outer one, every next ring is scaled, less open, turned and lifted
// (with Ring Count 2 and the default opening/height this is exactly the old outer + inner ring)
export function petalRings(p) {
  const n = p['Petals Per Ring'], count = Math.max(1, Math.round(p['Ring Count'] ?? 2));
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({
      i,
      lenF: Math.pow(p['Inner Ring Scale'], i),
      bloomF: Math.pow(p['Inner Ring Opening'] ?? 0.9, i),
      rot: i * (Math.PI / n + p['Petal Ring Rotation Offset'] * Math.PI),
      lift: i * (p['Inner Ring Height'] ?? 0),
    });
  }
  return out;
}

function petalRing(b, p, bloom, lenF, bloomF, rotExtra, head, seedBase, lift = 0) {
  const nL = p['Petal Resolution Length'], nW = p['Petal Resolution Width'], n = p['Petals Per Ring'];
  for (let i = 0; i < n; i++) {
    const ang = (TAU / n) * i + rotExtra;
    const base = b.count;
    for (let ix = 0; ix < nL; ix++) {
      const u = ix / (nL - 1);
      for (let iy = 0; iy < nW; iy++) {
        const v = (iy / (nW - 1)) * 2 - 1;
        const local = rotZ(petalPoint(p, u, v, lenF, bloomF, bloom), ang);
        local[2] += lift;
        b.vert(head(local), 0.40 + 0.60 * u, PART.PETAL, u, v, seedBase + i);
      }
    }
    for (let ix = 0; ix < nL - 1; ix++)
      for (let iy = 0; iy < nW - 1; iy++) {
        const a = base + ix * nW + iy;
        b.quad(a, a + nW, a + nW + 1, a + 1);
      }
  }
}

// ------------------------------------------------------------------ tubes and blobs (stamens, pistil, stem)
function tube(b, part, length, bendX, radius, count, segs, xform, growthAt) {
  const base = b.count;
  for (let j = 0; j < count; j++) {
    const t = j / (count - 1);
    const c = [bendX * t * t, 0, length * t];
    const T = [2 * bendX * t, 0, length]; const tl = len(T) || 1;
    const tn = scl(T, 1 / tl);
    const B = [0, 1, 0];                                                     // the curve lies in the XZ plane
    const N = [B[1] * tn[2] - B[2] * tn[1], B[2] * tn[0] - B[0] * tn[2], B[0] * tn[1] - B[1] * tn[0]];
    for (let k = 0; k < segs; k++) {
      const th = (TAU * k) / segs;
      const local = add(c, add(scl(N, radius * Math.cos(th)), scl(B, radius * Math.sin(th))));
      b.vert(xform(local), growthAt(t, local), part);
    }
  }
  for (let j = 0; j < count - 1; j++)
    for (let k = 0; k < segs; k++) {
      const a = base + j * segs + k, a2 = base + j * segs + ((k + 1) % segs);
      b.quad(a, a + segs, a2 + segs, a2);
    }
}

function blob(b, part, center, sx, sy, sz, xform, growthAt) {      // low-poly UV sphere (6 segments, 4 rings)
  const SEG = 6, RINGS = 4;
  const pt = (x, y, z) => { const l = add(center, [x * sx, y * sy, z * sz]); return b.vert(xform(l), growthAt(l), part); };
  const top = pt(0, 0, 1);
  const rings = [];
  for (let i = 1; i < RINGS; i++) {
    const phi = (Math.PI * i) / RINGS; const ring = [];
    for (let k = 0; k < SEG; k++) { const th = (TAU * k) / SEG; ring.push(pt(Math.sin(phi) * Math.cos(th), Math.sin(phi) * Math.sin(th), Math.cos(phi))); }
    rings.push(ring);
  }
  const bot = pt(0, 0, -1);
  for (let k = 0; k < SEG; k++) {
    const k2 = (k + 1) % SEG;
    b.tri(top, rings[0][k], rings[0][k2]);
    for (let r = 0; r < rings.length - 1; r++) b.quad(rings[r][k], rings[r + 1][k], rings[r + 1][k2], rings[r][k2]);
    b.tri(bot, rings[rings.length - 1][k2], rings[rings.length - 1][k]);
  }
}

// ------------------------------------------------------------------ the whole plant
export function generateLily(p, bloom = p['Flower Blooming']) {
  const b = new MeshBuilder();
  const tilt = p['Head Tilt'], hs = p['Flower Head Scale'];
  const head = (l) => scl(rotX(l, tilt), hs);
  const PL = Math.max(p['Petal Length'], 0.01);
  const headGrowth = (l) => 0.40 + 0.35 * clamp01(len(l) / PL);            // from the centre outwards

  // petals: outer ring + inner rings (each one smaller, less open, rotated, optionally higher)
  const n = p['Petals Per Ring'];
  for (const r of petalRings(p)) petalRing(b, p, bloom, r.lenF, r.bloomF, r.rot, head, n * r.i, r.lift);

  // stamens (thin bent tubes with an anther on top), copied around the centre
  const segs = p['Round Segments'];
  const sl = p['Stamen Scale'] * 0.75, spread = p['Stamen Spread'] * sl;
  const sc = p['Stamen Count'];
  for (let i = 0; i < sc; i++) {
    const ang = (TAU / Math.max(sc, 1)) * i + 0.3;
    const xf = (l) => head(rotZ(l, ang));
    tube(b, PART.STAMEN, sl, spread, sl * 0.012, 6, segs, xf, (t, l) => headGrowth(l));
    blob(b, PART.ANTHER, [spread, 0, sl], sl * 0.09, sl * 0.03, sl * 0.03, xf, headGrowth);
  }
  // pistil
  const pl = p['Pistil Scale'] * 0.95;
  if (pl > 0) {
    tube(b, PART.STAMEN, pl, pl * 0.12, pl * 0.016, 6, segs, head, (t, l) => headGrowth(l));
    blob(b, PART.STAMEN, [pl * 0.12, 0, pl], pl * 0.035, pl * 0.035, pl * 0.025, head, headGrowth);
  }
  // green base that hides the petal claws
  blob(b, PART.STEM, [0, 0, -0.03], 0.07, 0.07, 0.09, head, headGrowth);

  // stem: grows from the bottom up
  const SL = p['Stem Length'], bend = p['Stem Bend'], thick = p['Stem Thickness'];
  if (SL > 0) tube(b, PART.STEM, -SL, bend, thick, 10, segs, (l) => l, (t) => 0.32 * (1 - t));

  // leaves along the stem
  const lc = p['Leaf Count'], seed = p['Leaf Seed'], rnd = p['Leaf Randomness'];
  const nLL = p['Leaf Resolution Length'], nLW = p['Leaf Resolution Width'];
  for (let i = 0; i < lc; i++) {
    const frac = i / Math.max(lc - 1, 1);                                   // 0 top leaf, 1 bottom leaf
    let tpos = p['Leaf Start (top)'] + (p['Leaf End (bottom)'] - p['Leaf Start (top)']) * frac;
    tpos += rand(seed + 1, i) * rnd * 0.04;
    const ppos = [bend * tpos * tpos, 0, -SL * tpos];                       // same curve as the stem
    const up = (p['Leaf Angle'] + rand(seed + 2, i) * rnd * 20) * DEG;
    const spin = p['Leaf Spiral Angle'] * DEG * i + rand(seed + 3, i) * rnd * 0.6;
    let lsc = p['Leaf Scale'] * (1 - p['Leaf Size Gradient'] * 0.5 + p['Leaf Size Gradient'] * frac);
    lsc *= 1 + rand(seed + 4, i) * rnd * 0.3;
    const LL = p['Leaf Length'];
    const base = b.count;
    for (let ix = 0; ix < nLL; ix++) {
      const lu = ix / (nLL - 1);
      for (let iy = 0; iy < nLW; iy++) {
        const lv = (iy / (nLW - 1)) * 2 - 1;
        const lw = p['Leaf Width'] * Math.sin(Math.pow(lu, p['Leaf Tip Shape']) * Math.PI);   // lance shape
        const ly = lv * lw;
        const lzc = p['Leaf Fold'] * lv * lv * lw;                                         // V-fold
        const tw = p['Leaf Twist'] * lu * 1.5;                                             // twist
        const cy = ly * Math.cos(tw) - lzc * Math.sin(tw);
        const cz = ly * Math.sin(tw) + lzc * Math.cos(tw);
        const local = [lu * LL + thick, cy, cz - p['Leaf Droop'] * lu * lu * LL];          // tip hangs down
        const world = add(ppos, rotZ(rotY(scl(local, lsc), -up), spin));
        b.vert(world, 0.32 * (1 - tpos) + 0.04 + 0.12 * lu, PART.LEAF, lu, lv, 100 + i);
      }
    }
    for (let ix = 0; ix < nLL - 1; ix++)
      for (let iy = 0; iy < nLW - 1; iy++) {
        const a = base + ix * nLW + iy;
        b.quad(a, a + nLW, a + nLW + 1, a + 1);
      }
  }
  return b.result();
}

// HSV (0..1) -> RGB, same as Blender's Combine Color (HSV)
export function hsv(h, s, v) {
  const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][((i % 6) + 6) % 6];
}

// shared with the outline particles (outline.js): same maths, so the particles sit exactly on the flower
export { TAU, DEG, petalPoint, rotX, rotY, rotZ, add, scl, len, rand, clamp01 };
