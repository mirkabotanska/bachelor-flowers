import * as THREE from 'three';
import { generateLily, hsv } from './generator.js';
import { uniforms, createSolidMaterial, createPointsMaterial, createWireMaterial, createSparkleMaterial } from './materials.js';

// One procedural lily, drawn three ways (points, wireframe, solid) from the same data, plus sparkles.
export class Lily extends THREE.Group {
  constructor(params) {
    super();
    this.params = params;
    this.solidMat = createSolidMaterial();
    this.pointsMat = createPointsMaterial();
    this.wireMat = createWireMaterial();
    this.sparkleMat = createSparkleMaterial();
    this.layout = '';                      // vertex / index counts of the current geometry
    this.rebuild();
  }

  // Full rebuild: call when a flower slider changes.
  rebuild(bloom = this.params['Flower Blooming']) {
    const data = generateLily(this.params, bloom);
    const layout = `${data.position.length}/${data.index.length}/${data.edges.length}`;
    if (layout === this.layout) {
      this.#updatePositions(data);          // same structure -> just move the vertices
    } else {
      this.layout = layout;
      this.#createGeometry(data);
    }
    this.#updateSparkles();
    this.updateColour();
  }

  // Fast update for the breathing animation (only positions change).
  setBloom(bloom) {
    const data = generateLily(this.params, bloom);
    if (`${data.position.length}/${data.index.length}/${data.edges.length}` !== this.layout) return this.rebuild(bloom);
    this.#updatePositions(data);
  }

  updateColour() {
    const p = this.params;
    const [r, g, b] = hsv(p['Blossom Hue'], p['Blossom Saturation'], p['Blossom Value']);
    uniforms.uTint.value.setRGB(r, g, b, THREE.LinearSRGBColorSpace);
    uniforms.uSpotAmount.value = p['Spot Amount'];
    uniforms.uSpotSize.value = p['Spot Size'];
  }

  get vertexCount() { return this.geometry ? this.geometry.attributes.position.count : 0; }

  #createGeometry(d) {
    for (const o of [this.mesh, this.points, this.wire]) if (o) { this.remove(o); }
    this.geometry?.dispose(); this.wireGeometry?.dispose(); this.pointsGeometry?.dispose();

    const pos = new THREE.BufferAttribute(d.position, 3);
    const growth = new THREE.BufferAttribute(d.growth, 1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', pos);
    g.setAttribute('color', new THREE.BufferAttribute(d.color, 3));
    g.setAttribute('aGrowth', growth);
    g.setAttribute('aU', new THREE.BufferAttribute(d.u, 1));
    g.setAttribute('aV', new THREE.BufferAttribute(d.v, 1));
    g.setAttribute('aPart', new THREE.BufferAttribute(d.part, 1));
    g.setAttribute('aSeed', new THREE.BufferAttribute(d.seed, 1));
    g.setIndex(new THREE.BufferAttribute(d.index, 1));
    g.computeVertexNormals();
    this.geometry = g;

    const wg = new THREE.BufferGeometry();              // same vertices, edges as index
    wg.setAttribute('position', pos); wg.setAttribute('aGrowth', growth);
    wg.setIndex(new THREE.BufferAttribute(d.edges, 1));
    this.wireGeometry = wg;

    const pg = new THREE.BufferGeometry();              // same vertices, no index
    pg.setAttribute('position', pos); pg.setAttribute('aGrowth', growth);
    this.pointsGeometry = pg;

    this.mesh = new THREE.Mesh(g, this.solidMat);
    this.wire = new THREE.LineSegments(wg, this.wireMat);
    this.points = new THREE.Points(pg, this.pointsMat);
    for (const o of [this.mesh, this.wire, this.points]) { o.frustumCulled = false; this.add(o); }
    this.wire.renderOrder = 1; this.points.renderOrder = 2;
    this.version = (this.version ?? 0) + 1;
  }

  #updatePositions(d) {
    const g = this.geometry;
    g.attributes.position.array.set(d.position); g.attributes.position.needsUpdate = true;
    g.attributes.aGrowth.array.set(d.growth); g.attributes.aGrowth.needsUpdate = true;
    g.computeVertexNormals();
    this.version = (this.version ?? 0) + 1;      // lets other effects know the flower moved
  }

  #updateSparkles() {
    const count = Math.round(this.params['Sparkle Count'] ?? 60);
    this.geometry.computeBoundingBox();
    const bb = this.geometry.boundingBox.clone().expandByScalar(0.3);
    const key = `${count}/${bb.min.toArray().map((v) => v.toFixed(2))}/${bb.max.toArray().map((v) => v.toFixed(2))}`;
    if (key === this.sparkleKey) return;
    this.sparkleKey = key;
    const pos = new Float32Array(count * 3), rnd = new Float32Array(count * 3);
    let s = 12345;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = bb.min.x + r() * (bb.max.x - bb.min.x);
      pos[i * 3 + 1] = bb.min.y + r() * (bb.max.y - bb.min.y);
      pos[i * 3 + 2] = bb.min.z + r() * (bb.max.z - bb.min.z);
      rnd[i * 3] = 0.3 + 0.7 * r(); rnd[i * 3 + 1] = r(); rnd[i * 3 + 2] = r();
    }
    if (this.sparkles) { this.remove(this.sparkles); this.sparkles.geometry.dispose(); }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sg.setAttribute('aRand', new THREE.BufferAttribute(rnd, 3));
    this.sparkles = new THREE.Points(sg, this.sparkleMat);
    this.sparkles.frustumCulled = false; this.sparkles.renderOrder = 3;
    this.add(this.sparkles);
  }
}
