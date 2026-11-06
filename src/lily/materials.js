import * as THREE from 'three';

// Uniforms shared by every material, so one value drives the whole build-up.
export const uniforms = {
  uProgress: { value: 1 },
  uWireDelay: { value: 0.06 },
  uSolidDelay: { value: 0.16 },
  uFade: { value: 0.06 },
  uTime: { value: 0 },
  uPxScale: { value: 1000 },            // pixels per world unit at distance 1 (set on resize)
  uPointSize: { value: 0.008 },
  uPointBright: { value: 1.6 },
  uWireBright: { value: 1.2 },
  uPointColor: { value: new THREE.Color(1.0, 0.62, 0.8) },
  uWireColor: { value: new THREE.Color(0.85, 0.92, 1.0) },
  uSparkleColor: { value: new THREE.Color(1.0, 0.95, 0.9) },
  uSparkleSize: { value: 0.012 },
  uSparkleAmount: { value: 0 },
  uTint: { value: new THREE.Color(1, 0.6, 0.7) },
  uSpotAmount: { value: 0 },
  uSpotSize: { value: 1 },
  uPetalGlow: { value: 0.06 },
  uCoreAlpha: { value: 1 },            // used by style 2 (1 = no change, style 1 never touches these)
  uCoreBright: { value: 1 },
};

// When does each version of a vertex appear?  x = points, y = wireframe, z = solid
// Same timing as the Blender build-up effect.
const STAGES = /* glsl */ `
uniform float uProgress, uWireDelay, uSolidDelay, uFade;
vec3 buildStages(float g) {
  float k = max(1.0 - uSolidDelay - 2.0 * uFade, 0.05);
  float s0 = g * k;
  float outS = s0 + uSolidDelay + uFade;
  float fadeOut = smoothstep(outS, outS + uFade, uProgress);           // points + wire leave after the solid
  float aP = smoothstep(s0, s0 + uFade, uProgress) * (1.0 - fadeOut);
  float aW = smoothstep(s0 + uWireDelay, s0 + uWireDelay + uFade, uProgress) * (1.0 - fadeOut);
  float aS = smoothstep(s0 + uSolidDelay, s0 + uSolidDelay + uFade, uProgress);
  return vec3(aP, aW, aS);
}`;

// ------------------------------------------------------------------ the real flower
export function createSolidMaterial() {
  const mat = new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.5, metalness: 0,
    sheen: 0.35, sheenRoughness: 0.5, sheenColor: new THREE.Color(1, 0.85, 0.9),
    side: THREE.DoubleSide, alphaHash: true,           // dithered fade-in, like Blender's "Dithered"
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        ${STAGES}
        attribute float aGrowth; attribute float aU; attribute float aV; attribute float aPart; attribute float aSeed;
        varying float vU; varying float vV; varying float vPart; varying float vSeed; varying float vSolid;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vU = aU; vV = aV; vPart = aPart; vSeed = aSeed; vSolid = buildStages(aGrowth).z;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uTint; uniform float uSpotAmount, uSpotSize, uPetalGlow, uCoreAlpha, uCoreBright;
        varying float vU; varying float vV; varying float vPart; varying float vSeed; varying float vSolid;
        float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        float noise3(vec3 p) {
          vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (vPart < 0.5) {                                                   // petal colour, like the Blender material
          vec3 col = uTint * mix(vec3(0.55, 0.75, 0.35), vec3(1.0), clamp(vU / 0.35, 0.0, 1.0));   // green throat
          float vein = clamp(1.0 - abs(vV) / 0.35, 0.0, 1.0) * 0.7;          // deeper colour on the midrib
          col = mix(col, uTint * uTint, vein);
          float n = noise3(vec3(vU * 26.0, vV * 9.0, vSeed * 7.13) / uSpotSize);
          float spot = step(0.72, n) * step(0.12, vU) * step(vU, 0.6) * uSpotAmount;   // speckles
          col = mix(col, vec3(0.25, 0.02, 0.06), spot);
          diffuseColor.rgb = col;
        }
        diffuseColor.a *= vSolid * uCoreAlpha;
        diffuseColor.rgb *= uCoreBright;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        if (vPart < 0.5) totalEmissiveRadiance += diffuseColor.rgb * uPetalGlow;`);
  };
  return mat;
}

// ------------------------------------------------------------------ glowing points (one per vertex)
export function createPointsMaterial() {
  return new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      ${STAGES}
      uniform float uPxScale, uPointSize;
      attribute float aGrowth;
      varying float vA;
      void main() {
        vA = buildStages(aGrowth).x;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = vA > 0.001 ? max(2.0 * uPointSize * vA * uPxScale / -mv.z, 1.0) : 0.0;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uPointColor; uniform float uPointBright;
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.15, d) * vA;
        if (a < 0.003) discard;
        gl_FragColor = vec4(uPointColor * uPointBright * a, a);
      }`,
  });
}

// ------------------------------------------------------------------ wireframe (the mesh edges)
export function createWireMaterial() {
  return new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      ${STAGES}
      attribute float aGrowth;
      varying float vA;
      void main() {
        vA = buildStages(aGrowth).y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uWireColor; uniform float uWireBright;
      varying float vA;
      void main() {
        if (vA < 0.003) discard;
        gl_FragColor = vec4(uWireColor * uWireBright * vA, vA);
      }`,
  });
}

// ------------------------------------------------------------------ sparkles floating around the plant
export function createSparkleMaterial() {
  return new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      uniform float uTime, uPxScale, uSparkleSize, uSparkleAmount;
      attribute vec3 aRand;          // x: size, y: phase, z: drift
      varying float vA;
      void main() {
        float tw = 0.5 + 0.5 * sin(uTime * 3.0 + aRand.y * 6.283);
        vA = tw * uSparkleAmount;
        vec3 p = position + vec3(sin(uTime * 0.4 + aRand.y * 6.283), sin(uTime * 0.3 + aRand.z * 6.283), cos(uTime * 0.35 + aRand.y * 4.0)) * 0.04;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = vA > 0.001 ? max(2.0 * uSparkleSize * aRand.x * vA * uPxScale / -mv.z, 1.0) : 0.0;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSparkleColor;
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vA;
        if (a < 0.003) discard;
        gl_FragColor = vec4(uSparkleColor * 4.0 * a, a);
      }`,
  });
}
