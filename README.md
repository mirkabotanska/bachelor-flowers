# Lily (web)

The procedural lily from Blender, rebuilt for the browser with Three.js.
It plays the build-up (points → wireframe → real flower), then keeps breathing:
the petals slowly open and close, with a gentle sway and a few sparkles.

## Pages

Switch with the buttons at the top (or keys **1**–**6**):

1. **Flower1**: points → wireframe → real flower, then breathing.
2. **Flower2**: fibres – short wiggling strands grow out of the flower, then it breathes. Panel *2 · Fibres*.
3. **Flower3**: selection boxes find and follow parts of the flower. Panel *3 · Tracking*.
4. **Flower4**: particles trace the outlines (stem, leaves, petals base → tip), then the flower appears. Panel *4 · Outline particles*.
5. **Roots**: roots grow from the flashlight (webcam) or the mouse, with leaves and flowers, breathing,
   and *Fake lights* for testing. Code: `src/roots/`.
6. **Water**: soil, water appears where the light is, seeds sprout. Code: `src/water/`.

## Run it

You need [Node.js](https://nodejs.org) (version 18 or newer).

```bash
npm install      # only the first time
npm run dev      # then open the link it prints (usually http://localhost:5173)
```

## The slider panel

The panels have the same names, defaults and ranges as the Blender "Lily Generator"
(General, Petals, Colour, Stamen & Pistil, Stem, Leaves, Detail), plus:

- **Build-up**: same as in Blender. Dragging *Build Progress* yourself stops the auto play.
- **Animation**: how long the build-up takes, how much and how fast the flower breathes, sway, sparkles after the build.
- **Look**: glow (bloom), exposure and a soft glow on the petals.

Buttons: **Replay build-up**, **Copy settings (JSON)** (to save a look you like), **Reset everything**.
Your settings are remembered in this browser. Press **H** to hide the panel.

## Files

- `src/lily/params.js` – all sliders with their default values (change defaults here)
- `src/lily/generator.js` – builds the flower (JavaScript version of the Geometry Nodes)
- `src/lily/materials.js` – petal material, points, wireframe and sparkles (shaders)
- `src/lily/Lily.js` – puts the flower together and updates it
- `src/lily/fibres.js` – Flower2 (fibres and threads)
- `src/lily/outline.js` – Flower4 (outline particles)
- `src/roots/` – Roots page · `src/water/` – Water page
- `src/main.js` – scene, lights, camera, glow, animation timeline and the slider panel

## How it works (short)

Every vertex gets a *growth* value (stem bottom → top, leaves outwards, petals base → tip).
One number, *Build Progress*, goes from 0 to 1, and the shaders show each vertex first as a
point, then as wireframe, then as the solid flower once the progress passes its growth value.
Because growth is calculated from the flower's shape, the build-up works with any slider settings.

Breathing regenerates the flower every frame with a slightly different *Flower Blooming* value.
That's cheap (about 900 vertices), so the sliders stay live while it moves.
