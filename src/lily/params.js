// All flower settings, with the same names, defaults and ranges as the Blender "Lily Generator".
// [default, min, max, step]   (step 1 = whole numbers)

export const FLOWER_PARAMS = {
  General: {
    'Flower Blooming': [0.8, 0, 1, 0.01],
    'Flower Head Scale': [1.0, 0.2, 3, 0.01],
    'Head Tilt': [0.35, -1.5, 1.5, 0.01],
  },
  Petals: {
    'Petals Per Ring': [3, 2, 8, 1],
    'Petal Length': [1.0, 0.3, 2.0, 0.01],
    'Petal Width': [0.32, 0.05, 1.0, 0.01],
    'Petal Tip Shape': [0.8, 0.3, 2.0, 0.01],
    'Petal Surface Curvature': [0.2, -1.0, 1.0, 0.01],
    'Petal Arc Bend': [0.6, -1.0, 2.0, 0.01],
    'Petal Tip Bend': [0.5, -1.0, 2.0, 0.01],
    'Petal Edge Ruffle': [0.25, 0.0, 1.0, 0.01],
    'Inner Ring Scale': [0.92, 0.5, 1.2, 0.01],
    'Petal Ring Rotation Offset': [0.0, -1.0, 1.0, 0.01],
  },
  Colour: {
    'Blossom Hue': [0.95, 0, 1, 0.005],
    'Blossom Saturation': [0.45, 0, 1, 0.01],
    'Blossom Value': [1.0, 0, 1, 0.01],
    'Spot Amount': [0, 0, 1, 0.01],
    'Spot Size': [1.0, 0.3, 3, 0.01],
  },
  'Stamen & Pistil': {
    'Stamen Count': [6, 0, 12, 1],
    'Stamen Scale': [0.7, 0, 2, 0.01],
    'Stamen Spread': [0.35, 0, 1, 0.01],
    'Pistil Scale': [0.8, 0, 2, 0.01],
  },
  Stem: {
    'Stem Length': [2.5, 0, 6, 0.01],
    'Stem Thickness': [0.035, 0.005, 0.2, 0.001],
    'Stem Bend': [0.4, -2, 2, 0.01],
  },
  Leaves: {
    'Leaf Count': [5, 0, 30, 1],
    'Leaf Start (top)': [0.3, 0, 1, 0.01],
    'Leaf End (bottom)': [0.9, 0, 1, 0.01],
    'Leaf Spiral Angle': [137.5, 0, 360, 0.5],
    'Leaf Angle': [40, 0, 150, 0.5],
    'Leaf Scale': [1.0, 0, 3, 0.01],
    'Leaf Size Gradient': [0.4, -1, 1, 0.01],
    'Leaf Length': [0.8, 0.05, 3, 0.01],
    'Leaf Width': [0.1, 0.01, 0.6, 0.005],
    'Leaf Tip Shape': [0.7, 0.2, 2, 0.01],
    'Leaf Droop': [0.35, -1, 2, 0.01],
    'Leaf Fold': [0.3, -1, 1, 0.01],
    'Leaf Twist': [0.2, -1, 1, 0.01],
    'Leaf Randomness': [0.2, 0, 1, 0.01],
    'Leaf Seed': [0, 0, 999, 1],
  },
  'Detail (low = faster)': {
    'Petal Resolution Length': [10, 3, 40, 1],
    'Petal Resolution Width': [7, 2, 20, 1],
    'Leaf Resolution Length': [6, 2, 30, 1],
    'Leaf Resolution Width': [3, 2, 12, 1],
    'Round Segments': [5, 3, 16, 1],
  },
};

// Build-up effect + animation + look (web only, mirrors the Blender "Build-up" panel where possible)
export const EFFECT_PARAMS = {
  'Build-up': {
    'Build Progress': [1, 0, 1, 0.001],
    'Wire Delay': [0.06, 0, 0.3, 0.005],
    'Solid Delay': [0.16, 0, 0.4, 0.005],
    'Fade Length': [0.06, 0.01, 0.3, 0.005],
    'Point Size': [0.008, 0, 0.05, 0.0005],
    'Point Brightness': [1.6, 0, 10, 0.1],
    'Wire Brightness': [1.2, 0, 10, 0.1],
    'Sparkle Count': [60, 0, 600, 1],
    'Sparkle Size': [0.012, 0, 0.06, 0.0005],
  },
  Animation: {
    'Build Duration (s)': [6, 1, 30, 0.1],
    'Breathing Amount': [0.08, 0, 0.4, 0.005],
    'Breath Length (s)': [5, 1, 15, 0.1],
    'Sway': [0.3, 0, 2, 0.01],
    'Idle Sparkles': [0.25, 0, 1, 0.01],
  },
  Look: {
    'Bloom Strength': [0.7, 0, 3, 0.01],
    'Bloom Radius': [0.4, 0, 1, 0.01],
    'Bloom Threshold': [0.85, 0, 2, 0.01],
    'Exposure': [1.0, 0.1, 3, 0.01],
    'Petal Glow': [0.03, 0, 1, 0.005],
  },
};

// Style 2 – Fibres / glowing halo
export const FIBRE_VERSION = 4;          // bump when the style 2 defaults change (old saved values get replaced)
export const FIBRE_PARAMS = {
  '2 · Fibres': {
    'Intro Duration (s)': [7, 1, 30, 0.1],
    'Strand Count': [40000, 0, 120000, 1000],
    'Strand Length': [0.09, 0, 0.3, 0.001],
    'Silhouette Halo': [1.5, 0, 5, 0.05],
    'Edge Fuzz': [1.0, 0, 6, 0.05],
    'Wiggle': [0.25, 0, 2, 0.01],
    'Wiggle Speed': [2, 0, 6, 0.01],
    'Shimmer': [0.4, 0, 1, 0.01],
    'Strand Opacity': [0.24, 0, 1, 0.01],
    'Tip Whiteness': [0.5, 0, 1, 0.01],
    'Dark Specks': [0, 0, 0.6, 0.01],
    'Dust Count': [15000, 0, 80000, 500],
    'Dust Distance': [0.3, 0, 1.5, 0.01],
    'Dust Speed': [0.25, 0, 2, 0.01],
    'Dust Opacity': [0.45, 0, 1, 0.01],
    'Dust Size': [1.2, 0.5, 6, 0.1],
    'Thread Count': [0, 0, 2000, 10],
    'Thread Opacity': [0.12, 0, 1, 0.01],
    'Core Brightness': [1.0, 0, 1.5, 0.01],
    'Core Opacity': [1, 0, 1, 0.01],
    'Core Glow': [0.1, 0, 2, 0.01],
    'Glow Strength': [0.55, 0, 3, 0.01],
    'Glow Radius': [0.45, 0, 1, 0.01],
    'Glow Threshold': [0.7, 0, 2, 0.01],
  },
};

// Style 2 settings that can change with the breath ("Breathing animation" panel).
// Counts, intro and threads are left out: they would rebuild everything every frame.
export const BREATH_EXCLUDE = ['Intro Duration (s)', 'Edge Fuzz', 'Dark Specks', 'Thread Count'];
export const BREATH_CURVES = {
  Smooth: (x) => x,
  'Hold in': (x) => x * x,                 // stays near the breathing-in value longer
  'Hold out': (x) => Math.sqrt(x),         // stays near the breathing-out value longer
  Snappy: (x) => { const t = Math.min(Math.max((x - 0.3) / 0.4, 0), 1); return t * t * (3 - 2 * t); },
};
// what animates by default (same look as before: dust comes in, flower glows, fibres stretch)
export const DEFAULT_BREATH_ANIMS = {
  'Dust Distance': { in: 0.12, out: 0.3, curve: 'Smooth' },
  'Dust Opacity': { in: 0.05, out: 0.45, curve: 'Smooth' },
  'Core Glow': { in: 0.16, out: 0.1, curve: 'Smooth' },
  'Strand Length': { in: 0.1, out: 0.08, curve: 'Smooth' },
};

// Style 3 – Tracking (selection boxes)
export const TRACK_PARAMS = {
  '3 · Tracking': {
    'Tracking Intro (s)': [4, 1, 20, 0.1],
    'Box Count': [12, 0, 60, 1],
    'Box Lifetime (s)': [3.5, 0.5, 15, 0.1],
    'Appear Time (s)': [0.7, 0.05, 3, 0.05],
    'Box Size': [1, 0.2, 4, 0.01],
    'Size Variation': [0.6, 0, 1, 0.01],
    'Leaf & Stem Boxes': [0.45, 0, 1, 0.01],
    'Line Width': [1.2, 0.5, 8, 0.1],
    'Box Opacity': [0.85, 0, 1, 0.01],
    'Box Colour': ['#ffffff'],
    'Follow Smoothness': [0.85, 0, 1, 0.01],
    'Jitter': [0.15, 0, 1, 0.01],
    'Tiny Markers': [24, 0, 200, 1],
    'Corner Brackets': [false],
    'Centre Dots': [false],
    'Labels': [false],
  },
  '3 · Extra effects': {
    'Connect Lines': [0, 0, 1, 0.01],
    'Invert Inside': [false],
    'Pixelate Inside': [false],
    'Pixel Size': [8, 2, 40, 1],
    'Spotlight': [0, 0, 0.95, 0.01],
    'Glitter Dust': [false],
  },
};

// Settings taken out of the panel for now. They keep their default value and still work in the code,
// so to bring one back, just remove it from this list.
// Style 7: particles tracing the outlines of the flower
export const OUTLINE_PARAMS = {
  '7 · Outline particles': {
    'Outline Lead': [0.3, 0, 0.6, 0.005],             // how far the solid flower follows behind the dots (higher = see the outline longer)
    'Outline Particles': [5000, 500, 20000, 100],     // how many dots in total
    'Outline Spread': [0.012, 0, 0.08, 0.001],        // how far they sit from the exact outline (low = tight line)
    'Outline Dot Size (px)': [2.4, 0.5, 8, 0.1],
    'Outline Brightness': [1.0, 0, 4, 0.05],
    'Outline After Build': [0.25, 0, 1, 0.01],        // how much of the outline stays once the flower is built (0 = all gone)
    'Outline Twinkle': [0.3, 0, 1, 0.01],
    'Outline Drift': [0.3, 0, 1, 0.01],               // tiny movement of the dots
    'Outline Colour': ['#e9bdd6'],                    // petals
    'Stem Outline Colour': ['#a3c98f'],               // stem + leaves
    'Stamen Outline Colour': ['#f4dce9'],
  },
};

export const HIDDEN = [
  'Petal Ring Rotation Offset', 'Spot Amount', 'Spot Size',
  'Edge Fuzz', 'Dark Specks', 'Thread Count', 'Thread Opacity', 'Core Opacity',
];

export function defaults(groups) {
  const out = {};
  for (const g of Object.values(groups)) for (const [k, v] of Object.entries(g)) out[k] = v[0];
  return out;
}
