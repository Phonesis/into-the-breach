import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createMapRandom } from '../../src/world/MapRandom.js';

function load(file, key) {
  const src = fs.readFileSync(file, 'utf8');
  const next = createMapRandom({ id: key, size: 180 }, 'foliage-audit');
  let draws = 0;
  const random = () => { draws++; return next(); };
  const area = src.slice(src.indexOf('function terrainDecorationPalette'), src.indexOf('function addFarmClusters'));
  const helpers = new Function('THREE', 'mapRandom', `${area}\nreturn {createTreeGroup, createBushGroup, createPalmTreeGroup, createHedgeGroup, createGrassClumpGeometry, terrainDecorationPalette}`)(THREE, random);
  return { ...helpers, draws: () => draws };
}
function metrics(group) {
  let triangles = 0, meshes = 0;
  group.traverse(child => {
    if (!child.isMesh) return;
    meshes++;
    triangles += (child.geometry.index?.count ?? child.geometry.attributes.position.count) / 3;
    for (const attribute of Object.values(child.geometry.attributes)) {
      for (const value of attribute.array) assert.ok(Number.isFinite(value), 'finite geometry attributes');
    }
    assert.ok(!child.material.transparent, 'opaque foliage');
  });
  return { triangles, meshes };
}
const beforePath = '.tmp-graphics-perf-baseline/src/world/Terrain.js';
const afterPath = 'src/world/Terrain.js';
const output = [];
for (const terrain of ['bocage', 'desert', 'steppe', 'hills', 'jungle']) {
  for (const kind of ['tree', 'bush', ...(terrain === 'jungle' ? ['palm'] : []), ...(terrain === 'bocage' ? ['hedge'] : [])]) {
    const samples = [];
    for (const [label, path] of [['before', beforePath], ['after', afterPath]]) {
      const helpers = load(path, `${terrain}-${kind}`);
      const palette = helpers.terrainDecorationPalette(terrain);
      const mats = Object.fromEntries(Object.entries(palette).map(([key, color]) => [key, new THREE.MeshStandardMaterial({ color })]));
      const tint = new THREE.MeshStandardMaterial({ vertexColors: true });
      let group;
      if (kind === 'tree') group = helpers.createTreeGroup(mats.trunk, mats.leaf, mats.leafDark, mats.leafLight, tint, terrain);
      if (kind === 'palm') group = helpers.createPalmTreeGroup(mats.trunk, mats.leaf, mats.leafDark, mats.leafLight, tint);
      if (kind === 'bush') group = helpers.createBushGroup(mats.bush, mats.leafLight, mats.trunk, tint, terrain);
      if (kind === 'hedge') group = helpers.createHedgeGroup(mats.bush, mats.leaf, mats.leafDark, mats.trunk, mats.earth, tint);
      samples.push({ label, ...metrics(group), randomDraws: helpers.draws() });
    }
    assert.equal(samples[0].randomDraws, samples[1].randomDraws, `${terrain} ${kind} retains seeded placement stream`);
    assert.ok(samples[1].triangles <= samples[0].triangles * (kind === 'hedge' ? 2 : 1), `${terrain} ${kind} preserves triangle budget`);
    assert.ok(samples[1].meshes <= samples[0].meshes, `${terrain} ${kind} no extra batches`);
    output.push({ terrain, kind, samples });
  }
}
for (const path of [beforePath, afterPath]) {
  const helpers = load(path, 'grass');
  const geo = helpers.createGrassClumpGeometry();
  output.push({ path, kind: 'grass', triangles: geo.attributes.position.count / 3 });
}
console.log(JSON.stringify(output, null, 2));
