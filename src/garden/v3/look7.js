// Garden Version 3: the lily settings of page 7 "Lily look", Effect 1 (src/look/look.js).
// The garden lilies don't keep settings of their own: every time the garden is shown it reads Effect 1's
// settings the way page 7 does (page 7's defaults, then the Blender flower, then what was saved on page 7 under
// its own storage key), so a garden lily always looks and moves like page 7's lily. Change the lily on page 7.
// This file only reads page 7's saved settings, it never writes them (page 7 stays exactly as it is).
// LOOK7_DEFAULTS and the loading rules below mirror look.js (LOOK_DEFAULTS, MOTION_KEYS, the 'Motion v2' and
// 'Blender Lily' resets); if page 7's defaults ever change, change them here too.
import { FLOWER_PARAMS, defaults } from '../../lily/params.js';

export const LOOK7_STORAGE_KEY = 'flowers-web-look-v1';      // page 7, Effect 1
export const BLENDER_LILY_URL = `${import.meta.env.BASE_URL}lily/lily-breath.json`;

export const LOOK7_DEFAULTS = {
  'Show Stem + Leaves': true,
  'Petal Opacity': 1.0,
  'Petal Edges': 0.8,
  'Petal Light Colour': '#f7d3dd',
  'Petal Dark Colour': '#8c2a4f',
  'Petal Tone': 0.45,
  'Petal Variation': 0.85,
  'Petal Gradient': 0.9,
  'Petal Edge Variation': 0.6,
  'Stem Colour': '#619950',
  'Leaf Colour': '#558e45',
  'Petal Centre Opacity': 0.5,
  'Petal Edge Opacity': 0.95,
  'Petal Opacity Blend': 0.6,
  'Blur Amount': 0.75,
  'Base Blur': 0.08,
  'Focus Distance': -0.2,
  'Depth Range': 1.6,
  'Only Behind Focus': false,
  'Frost (paleness)': 0.45,
  'Background Top': '#f3eee6',
  'Background Bottom': '#e8e0d4',
  'Exposure': 1.0,
  'Contrast': 1.0,
  'Saturation': 0.8,
  'Warmth': 0.15,
  'Fade': 0.04,
  'Shadow Tint': '#3b4a63',
  'Shadow Tint Amount': 0.25,
  'Highlight Tint': '#f6d9c6',
  'Highlight Tint Amount': 0.2,
  'Glow': 0.2,
  'Bg Shadow': true,
  'Bg Shadow Colour': '#453c36',
  'Bg Shadow Blur': 0.75,
  'Bg Shadow Opacity': 0.6,
  'Bg Shadow Offset X': 0.04,
  'Bg Shadow Offset Y': -0.06,
  'Bg Shadow Size': 1.3,
  'Breathing': true,
  'Breath In (s)': 3,
  'Breath Out (s)': 3,
  'Open Most': 1.0,
  'Closed Most': 0.0,
  'Leaf Angle Closed': 68,
  'Leaf Angle Open': 38,
  'Leaf Fold Closed': 1.0,
  'Leaf Fold Open': 0.6,
  'Leaf Droop Breath': 0.3,
  'Breath Turn': 75,
  'Sway': 12,
  'Petal Lag': 2.0,
  'Petal Flutter': 0.12,
  'Trail Length (s)': 1.5,
  'Trail Copies': 24,
  'Trail Fade': 0.35,
  'Now Strength': 0.35,
  'Trail Softness': 0.15,
  'Afterglow': 0.88,
  'Streaks': 2.0,
};
const MOTION_KEYS = ['Breathing Amount', 'Breath Turn', 'Trail Length (s)', 'Trail Copies', 'Trail Fade'];

// page 7's camera (look.js resetView): the lily is seen from 6.4 in front and 0.8 above the point it looks at
export const LOOK7_CAMERA = { fov: 32, position: [0, 0.3, 6.4], target: [0, -0.5, 0] };
// the point of the lily (in its own units) page 7 looks at: its depth blur is measured from here
export const LOOK7_TARGET_Y = LOOK7_CAMERA.target[1];
// how far page 7's lily leans towards the camera (its camera looks down onto it a little), in degrees
export const LOOK7_VIEW_TILT = Math.atan2(LOOK7_CAMERA.position[1] - LOOK7_CAMERA.target[1], LOOK7_CAMERA.position[2]) * 180 / Math.PI;

// all the lily settings of Effect 1, as page 7 has them now. blender: the settings from lily-breath.json (or {})
export function loadLook7(blender = {}) {
  const flowerDefaults = { ...defaults(FLOWER_PARAMS), 'Spot Amount': 0 };
  for (const [k, v] of Object.entries(blender)) if (k in flowerDefaults && typeof v === 'number') flowerDefaults[k] = v;
  const p = { ...flowerDefaults, ...LOOK7_DEFAULTS };
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem(LOOK7_STORAGE_KEY) || '{}'); } catch { /* no storage */ }
  if (!stored['Motion v2']) for (const k of MOTION_KEYS) delete stored[k];
  if (!stored['Blender Lily']) for (const k of [...Object.keys(flowerDefaults), 'Open Most', 'Closed Most']) delete stored[k];
  Object.assign(p, stored);
  delete p['Motion v2']; delete p['Blender Lily'];
  return p;
}
export const LOOK7_KEYS = (blender = {}) => Object.keys(loadLook7(blender));
