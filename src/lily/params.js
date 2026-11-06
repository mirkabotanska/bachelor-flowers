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
    'Spot Amount': [0.8, 0, 1, 0.01],
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

export function defaults(groups) {
  const out = {};
  for (const g of Object.values(groups)) for (const [k, v] of Object.entries(g)) out[k] = v[0];
  return out;
}
