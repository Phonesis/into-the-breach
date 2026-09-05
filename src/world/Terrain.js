import * as THREE from 'three';
import { canUseTacticalReverse, getMoveReachConfig, isTankType, isTruckType, isVehicleUnit, isWheeledVehicle } from '../units/VehicleTypes.js';
import { faceUnitTowardMovement } from '../units/VehicleRotation.js';
import { createGroundMaterialMaps } from './proceduralTextures.js';
import { createMapRandom } from './MapRandom.js';
import {
  addUrbanDistrict,
  getUrbanCanalDefinition,
  isUrbanCanalBridge,
  nearestUrbanCanalBridgeZ,
} from './UrbanScenery.js';
import {
  createFarmBuilding,
  createFarmMaterials,
  createJungleHut,
  createStoneWall,
  disposeFarmMaterials,
} from './RuralBuildings.js';

let activeMapRandom = null;
const mapRandom = () => (activeMapRandom ? activeMapRandom() : Math.random());

export function buildTerrain(mapDef, scene, scenery = null) {
  const size = mapDef.size;
  const sizeScale = mapDef.sizeScale ?? 1;
  const segments = Math.min(256, Math.round(128 * Math.sqrt(sizeScale)));
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const colors = [];
  const seed = mapDef.id.length * 17;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, heightAt(x, z, mapDef, seed));
  }
  geo.computeVertexNormals();

  const normals = geo.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    // Albedo already contains the theater's pigment. Multiplying it by that
    // same green/brown again crushed the terrain into dark saturated patches.
    // Neutral, world-space variation now breaks up repetition independently of
    // tile size; actual surface slope subtly exposes drier, lighter ground.
    const broad = terrainTintNoise(x * 0.034, z * 0.034, seed);
    const damp = terrainTintNoise(x * 0.073 + 18, z * 0.073 - 7, seed + 41);
    const slope = THREE.MathUtils.clamp((1 - normals.getY(i)) * 2.8, 0, 1);
    const exposure = slope * (mapDef.terrain === 'hills' ? 0.19 : 0.09);
    const tint = 0.87 + broad * 0.2 - damp * 0.045 + exposure;
    const dry = broad * 0.04 + exposure * 0.24;
    colors.push(tint * (1 + dry), tint, tint * (1 - dry * 0.55));
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const surface = createGroundMaterialMaps(mapDef);

  const groundMat = new THREE.MeshStandardMaterial({
    map: surface.color,
    normalMap: surface.normal,
    roughnessMap: surface.surface,
    aoMap: surface.surface,
    aoMapIntensity: 0.7,
    normalScale: new THREE.Vector2(0.85, 0.85),
    vertexColors: true,
    roughness: 1,
    metalness: 0,
    envMapIntensity: 0.48,
  });
  groundMat.aoMap.channel = 0;

  const ground = new THREE.Mesh(geo, groundMat);
  ground.receiveShadow = true;
  ground.castShadow = false;
  ground.name = 'terrain';
  scene.add(ground);

  const previousRandom = activeMapRandom;
  activeMapRandom = createMapRandom(mapDef, 'terrain');
  try {
    addDecorations(mapDef, scene, size, seed, scenery);
  } finally {
    activeMapRandom = previousRandom;
  }

  return { ground, size };
}

function terrainTintNoise(x, z, seed) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const sample = (gx, gz) => {
    const value = Math.sin(gx * 127.1 + gz * 311.7 + seed * 7.13) * 43758.5453;
    return value - Math.floor(value);
  };
  const top = sample(ix, iz) * (1 - sx) + sample(ix + 1, iz) * sx;
  const bottom = sample(ix, iz + 1) * (1 - sx) + sample(ix + 1, iz + 1) * sx;
  return top * (1 - sz) + bottom * sz;
}

function heightAt(x, z, mapDef, seed) {
  if (mapDef.terrain === 'urban') {
    return 0;
  }
  if (mapDef.terrain === 'bocage') {
    return noise2(x, z, seed) * 2.5 + ridge(x, z, 0.08) * 1.5;
  }
  if (mapDef.terrain === 'desert') {
    return noise2(x, z, seed) * 1.8 + dune(x, z) * 3;
  }
  if (mapDef.terrain === 'steppe') {
    return noise2(x, z, seed) * 2 + ridge(x, z, 0.05) * 2;
  }
  if (mapDef.terrain === 'hills') {
    return noise2(x, z, seed) * 4 + Math.sin(x * 0.06) * Math.cos(z * 0.05) * 5;
  }
  if (mapDef.terrain === 'jungle') {
    const foldedGround = ridge(x + z * 0.28, z - x * 0.16, 0.045) * 2.6;
    return noise2(x, z, seed) * 2.3 + foldedGround;
  }
  return noise2(x, z, seed) * 2;
}

function noise2(x, z, seed) {
  return Math.sin(x * 0.15 + seed) * Math.cos(z * 0.12 + seed * 0.7) * 0.5 + Math.sin(x * 0.4 + z * 0.3) * 0.25;
}

function ridge(x, z, scale) {
  return Math.abs(Math.sin(x * scale) * Math.cos(z * scale));
}

function dune(x, z) {
  return Math.sin(x * 0.08 + z * 0.05) * 0.5 + Math.cos(x * 0.03) * 0.5;
}

function terrainDecorationPalette(terrain) {
  if (terrain === 'urban') {
    return { trunk: 0x44362b, leaf: 0x394535, leafDark: 0x273329, leafLight: 0x59604b, bush: 0x47513b, dry: 0x706548, rock: 0x77736b, earth: 0x504a42 };
  }
  if (terrain === 'desert') {
    return { trunk: 0x58432d, leaf: 0x7d7448, leafDark: 0x5c5836, leafLight: 0x9a8a55, bush: 0x82764a, dry: 0x9a8354, rock: 0x7b6d58, earth: 0x8a704b };
  }
  if (terrain === 'steppe') {
    return { trunk: 0x4b3829, leaf: 0x4d6533, leafDark: 0x344a29, leafLight: 0x71804a, bush: 0x637342, dry: 0x807344, rock: 0x69675a, earth: 0x66563b };
  }
  if (terrain === 'hills') {
    return { trunk: 0x4b362a, leaf: 0x425c32, leafDark: 0x293f27, leafLight: 0x68764a, bush: 0x526c3a, dry: 0x756a40, rock: 0x737066, earth: 0x5c513b };
  }
  if (terrain === 'jungle') {
    return { trunk: 0x463b2e, leaf: 0x3a5135, leafDark: 0x263b2b, leafLight: 0x63724c, bush: 0x465e3b, dry: 0x796a3f, rock: 0x555b50, earth: 0x4d3e2d };
  }
  return { trunk: 0x4a3e30, leaf: 0x465a36, leafDark: 0x303e2c, leafLight: 0x697749, bush: 0x536540, dry: 0x6d653a, rock: 0x69675d, earth: 0x55462f };
}

let vegetationDetailTextures = null;

/** Shared bark/leaf micro-detail; cached so richer vegetation adds no extra material batches. */
function getVegetationDetailTextures() {
  if (vegetationDetailTextures) return vegetationDetailTextures;

  const barkCanvas = document.createElement('canvas');
  barkCanvas.width = 96;
  barkCanvas.height = 192;
  const barkCtx = barkCanvas.getContext('2d');
  barkCtx.fillStyle = '#dedbd3';
  barkCtx.fillRect(0, 0, barkCanvas.width, barkCanvas.height);
  for (let i = 0; i < 34; i++) {
    const x = (i * 37) % barkCanvas.width;
    const width = 1 + (i % 4);
    barkCtx.strokeStyle = i % 3 === 0 ? '#8b877f' : '#aaa69e';
    barkCtx.lineWidth = width;
    barkCtx.beginPath();
    barkCtx.moveTo(x, -8);
    for (let y = 0; y <= barkCanvas.height + 12; y += 16) {
      barkCtx.lineTo(x + Math.sin(y * 0.09 + i * 1.7) * (2 + (i % 3)), y);
    }
    barkCtx.stroke();
  }
  for (let i = 0; i < 45; i++) {
    const x = (i * 53) % barkCanvas.width;
    const y = (i * 79) % barkCanvas.height;
    barkCtx.fillStyle = i % 2 ? 'rgba(92,88,81,0.22)' : 'rgba(255,255,255,0.18)';
    barkCtx.fillRect(x, y, 3 + (i % 6), 1 + (i % 3));
  }

  const leafCanvas = document.createElement('canvas');
  leafCanvas.width = 128;
  leafCanvas.height = 128;
  const leafCtx = leafCanvas.getContext('2d');
  leafCtx.fillStyle = '#bfc3b3';
  leafCtx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 190; i++) {
    const x = (i * 61) % 128;
    const y = (i * 43 + Math.floor(i / 7) * 19) % 128;
    const r = 1.4 + (i % 5) * 0.55;
    leafCtx.fillStyle = i % 4 === 0 ? 'rgba(65,78,52,0.32)' : 'rgba(224,228,200,0.45)';
    leafCtx.beginPath();
    leafCtx.ellipse(x, y, r * 1.55, r, (i % 9) * 0.35, 0, Math.PI * 2);
    leafCtx.fill();
    // Fine veins belong in the shared colour map, avoiding per-fragment bump
    // derivatives over the many overlapping leaf surfaces.
    leafCtx.strokeStyle = 'rgba(68,79,50,0.18)';
    leafCtx.lineWidth = 0.45;
    leafCtx.beginPath();
    leafCtx.moveTo(x - r, y);
    leafCtx.lineTo(x + r, y);
    leafCtx.stroke();
  }

  const bark = new THREE.CanvasTexture(barkCanvas);
  bark.wrapS = bark.wrapT = THREE.RepeatWrapping;
  bark.repeat.set(1.4, 3.4);
  bark.colorSpace = THREE.SRGBColorSpace;
  bark.anisotropy = 4;
  const leaf = new THREE.CanvasTexture(leafCanvas);
  leaf.wrapS = leaf.wrapT = THREE.RepeatWrapping;
  leaf.repeat.set(2.2, 2.2);
  leaf.colorSpace = THREE.SRGBColorSpace;
  leaf.anisotropy = 4;
  vegetationDetailTextures = { bark, leaf };
  return vegetationDetailTextures;
}

/** Collapse detail pieces sharing a material so richer scenery does not multiply draw calls. */
function mergeCompatibleGeometries(geometries) {
  const expanded = geometries.map((geometry) => geometry.index ? geometry.toNonIndexed() : geometry.clone());
  const merged = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv', 'color']) {
    const attrs = expanded.map((geometry) => geometry.getAttribute(name)).filter(Boolean);
    if (attrs.length !== expanded.length) continue;
    const itemSize = attrs[0].itemSize;
    const length = attrs.reduce((sum, attr) => sum + attr.array.length, 0);
    const array = new Float32Array(length);
    let offset = 0;
    for (const attr of attrs) {
      array.set(attr.array, offset);
      offset += attr.array.length;
    }
    merged.setAttribute(name, new THREE.Float32BufferAttribute(array, itemSize));
  }
  expanded.forEach((geometry) => geometry.dispose());
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function applyGeometryTint(geometry, color) {
  const count = geometry.getAttribute('position')?.count ?? 0;
  if (!count || !color) return;
  const colors = new Float32Array(count * 3);
  const shading = geometry.getAttribute('color');
  for (let i = 0; i < count; i++) {
    const offset = i * 3;
    colors[offset] = color.r * (shading ? shading.getX(i) : 1);
    colors[offset + 1] = color.g * (shading ? shading.getY(i) : 1);
    colors[offset + 2] = color.b * (shading ? shading.getZ(i) : 1);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function consolidateGroupMeshes(group, includeDescendants = false, materialAliases = null) {
  const buckets = new Map();
  let meshes;
  let rootInverse = null;
  let nestedGroups = null;
  if (includeDescendants) {
    group.updateMatrixWorld(true);
    rootInverse = new THREE.Matrix4().copy(group.matrixWorld).invert();
    meshes = [];
    nestedGroups = [];
    group.traverse((child) => {
      if (child !== group && child.isMesh) meshes.push(child);
      else if (child !== group && child.isGroup) nestedGroups.push(child);
    });
  } else {
    meshes = [...group.children];
  }

  for (const child of meshes) {
    if (!child.isMesh || Array.isArray(child.material)) continue;
    if (!includeDescendants) child.updateMatrix();
    const transform = includeDescendants
      ? new THREE.Matrix4().multiplyMatrices(rootInverse, child.matrixWorld)
      : child.matrix;
    const transformed = child.geometry.clone();
    transformed.applyMatrix4(transform);
    const material = materialAliases?.get(child.material) ?? child.material;
    if (material !== child.material) applyGeometryTint(transformed, child.material.color);
    const bucket = buckets.get(material) ?? { geometries: [], castShadow: false, receiveShadow: false };
    bucket.geometries.push(transformed);
    bucket.castShadow ||= child.castShadow;
    bucket.receiveShadow ||= child.receiveShadow;
    buckets.set(material, bucket);
    child.parent?.remove(child);
    child.geometry.dispose();
  }
  if (nestedGroups) {
    for (let i = nestedGroups.length - 1; i >= 0; i--) {
      const nested = nestedGroups[i];
      if (nested.children.length === 0) nested.parent?.remove(nested);
    }
  }
  for (const [material, bucket] of buckets) {
    const geometry = bucket.geometries.length === 1
      ? bucket.geometries[0]
      : mergeCompatibleGeometries(bucket.geometries);
    if (bucket.geometries.length > 1) bucket.geometries.forEach((g) => g.dispose());
    if (!geometry) continue;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = bucket.castShadow;
    mesh.receiveShadow = bucket.receiveShadow;
    group.add(mesh);
  }
  return group;
}

function addDecorations(mapDef, scene, size, seed, scenery) {
  if (mapDef.terrain === 'urban') {
    addUrbanDistrict(mapDef, scene, scenery, {
      random: mapRandom,
      sampleHeight: (x, z) => heightAt(x, z, mapDef, seed),
    });
    return;
  }
  const palette = terrainDecorationPalette(mapDef.terrain);
  const vegetationTextures = getVegetationDetailTextures();
  const trunkMat = new THREE.MeshStandardMaterial({
    color: palette.trunk,
    map: vegetationTextures.bark,
    bumpMap: vegetationTextures.bark,
    bumpScale: 0.055,
    roughness: 0.96,
    envMapIntensity: 0.45,
    flatShading: true,
  });
  const leafMat = new THREE.MeshStandardMaterial({
    color: palette.leaf,
    map: vegetationTextures.leaf,
    roughness: 0.94,
    envMapIntensity: 0.28,
  });
  const lightLeafMat = new THREE.MeshStandardMaterial({
    color: palette.leafLight,
    map: vegetationTextures.leaf,
    roughness: 0.92,
    envMapIntensity: 0.3,
  });
  // Leaf shades use the same texture/shader. Bake their tint into vertex colors
  // so each plant submits one foliage mesh instead of three visually identical
  // material variants (and repeats that saving in the sun-shadow pass).
  const leafTintMat = leafMat.clone();
  leafTintMat.color.set(0xffffff);
  leafTintMat.vertexColors = true;
  const rockMat = new THREE.MeshStandardMaterial({
    color: palette.rock,
    roughness: 0.93,
    metalness: 0,
    envMapIntensity: 0.32,
    flatShading: true,
  });
  const bushMat = new THREE.MeshStandardMaterial({
    color: palette.bush,
    map: vegetationTextures.leaf,
    roughness: 0.94,
    envMapIntensity: 0.28,
  });
  const darkLeafMat = new THREE.MeshStandardMaterial({
    color: palette.leafDark,
    map: vegetationTextures.leaf,
    roughness: 0.96,
    envMapIntensity: 0.24,
  });
  const dryBushMat = new THREE.MeshStandardMaterial({
    color: palette.dry,
    map: vegetationTextures.leaf,
    roughness: 0.97,
    envMapIntensity: 0.2,
  });
  const earthMat = new THREE.MeshStandardMaterial({
    color: palette.earth,
    roughness: 1,
    envMapIntensity: 0.18,
    flatShading: true,
  });

  const decorScale = mapDef.sizeScale ?? 1;
  const baseCount = mapDef.terrain === 'desert' ? 22 : mapDef.terrain === 'bocage' ? 75 : 55;
  const count = Math.round(baseCount * decorScale * (decorScale > 1 ? 1.15 : 1));

  const centerExclusionX = 14 * decorScale;
  const centerExclusionZ = 10 * decorScale;

  for (let i = 0; i < count; i++) {
    const x = (mapRandom() - 0.5) * size * 0.82;
    const z = (mapRandom() - 0.5) * size * 0.82;
    if (Math.abs(x) < centerExclusionX && Math.abs(z) < centerExclusionZ) continue;

    const y = heightAt(x, z, mapDef, seed);

    if (mapDef.terrain === 'desert') {
      const g = createRockCluster(rockMat, 0.9 + mapRandom() * 0.8);
      g.position.set(x, y, z);
      if (scenery) scenery.register(g, { x, z, kind: 'rock', source: 'map' });
      else scene.add(g);
    } else {
      const g =
        mapDef.terrain === 'jungle' && mapRandom() < 0.42
          ? createPalmTreeGroup(trunkMat, leafMat, darkLeafMat, lightLeafMat, leafTintMat)
          : createTreeGroup(
              trunkMat,
              leafMat,
              darkLeafMat,
              lightLeafMat,
              leafTintMat,
              mapDef.terrain
            );
      g.position.set(x, y, z);
      g.rotation.y = mapRandom() * Math.PI * 2;
      if (scenery) scenery.register(g, { x, z, kind: 'tree', source: 'map' });
      else scene.add(g);
    }
  }

  const bushCount = Math.round((mapDef.terrain === 'bocage' ? 40 : 28) * decorScale * (decorScale > 1 ? 1.1 : 1));
  for (let i = 0; i < bushCount; i++) {
    const x = (mapRandom() - 0.5) * size * 0.78;
    const z = (mapRandom() - 0.5) * size * 0.78;
    if (Math.abs(x) < 12 && Math.abs(z) < 8) continue;
    const y = heightAt(x, z, mapDef, seed);
    const g = createBushGroup(
      mapDef.terrain === 'desert' ? dryBushMat : bushMat,
      mapDef.terrain === 'desert' ? bushMat : lightLeafMat,
      trunkMat,
      leafTintMat,
      mapDef.terrain
    );
    g.position.set(x, y, z);
    g.rotation.y = mapRandom() * Math.PI * 2;
    if (scenery) scenery.register(g, { x, z, kind: 'bush', source: 'map' });
    else scene.add(g);
  }

  if (mapDef.terrain === 'bocage') {
    const bankMat = earthMat.clone();
    bankMat.color.set(0xffffff);
    bankMat.vertexColors = true;
    bankMat.flatShading = false;
    const hedgeMat = new THREE.MeshStandardMaterial({
      color: 0x4b5b38,
      map: vegetationTextures.leaf,
      roughness: 0.94,
      envMapIntensity: 0.28,
    });
    for (let i = 0; i < 32; i++) {
      const hx = (mapRandom() - 0.5) * size * 0.55;
      const hz = (mapRandom() - 0.5) * size * 0.55;
      const hy = heightAt(hx, hz, mapDef, seed);
      const g = createHedgeGroup(hedgeMat, bushMat, darkLeafMat, trunkMat, bankMat, leafTintMat);
      g.position.set(hx, hy, hz);
      g.rotation.y = mapRandom() * Math.PI;
      // Bend the baked hedge with the actual ground, including the berm's
      // buried foot. A single centre height leaves long banks floating uphill.
      const c = Math.cos(g.rotation.y), s = Math.sin(g.rotation.y);
      for (const mesh of g.children) {
        if (!mesh.isMesh) continue;
        const positions = mesh.geometry.attributes.position;
        for (let v = 0; v < positions.count; v++) {
          const x = positions.getX(v), z = positions.getZ(v);
          positions.setY(v, positions.getY(v) + heightAt(hx + c*x + s*z, hz - s*x + c*z, mapDef, seed) - hy);
        }
        // Keep the foliage's smooth crown normals; recomputing unindexed
        // leaf clusters here would turn every crown into a faceted solid.
        if (mesh.material === bankMat) mesh.geometry.computeVertexNormals();
        mesh.geometry.computeBoundingSphere();
      }
      if (scenery) scenery.register(g, { x: hx, z: hz, kind: 'hedge', source: 'map' });
      else scene.add(g);
    }
  }

  addGroundCover(mapDef, scene, size, seed, palette);
  addFarmClusters(mapDef, scene, size, seed, scenery);
  addTerrainClutter(mapDef, scene, size, seed, scenery);
}

function createOrganicTrunkGeometry(height, baseRadius, topRadius, leanX, leanZ) {
  const radialSegments = 10;
  const heightSegments = 6;
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let y = 0; y <= heightSegments; y++) {
    const t = y / heightSegments;
    const centerX = leanX * t * t + Math.sin(t * Math.PI * 1.7) * baseRadius * 0.08;
    const centerZ = leanZ * t * t + Math.cos(t * Math.PI * 1.35) * baseRadius * 0.065;
    const taper = THREE.MathUtils.lerp(baseRadius, topRadius, Math.pow(t, 0.82));
    for (let side = 0; side <= radialSegments; side++) {
      const angle = (side / radialSegments) * Math.PI * 2;
      const irregularity = 1 + Math.sin(angle * 3 + t * 8.2) * 0.055 + Math.sin(angle * 5 - t * 4.7) * 0.035;
      const radius = taper * irregularity;
      positions.push(
        centerX + Math.cos(angle) * radius,
        t * height,
        centerZ + Math.sin(angle) * radius
      );
      uvs.push(side / radialSegments, t * 2.6);
    }
  }
  for (let y = 0; y < heightSegments; y++) {
    for (let side = 0; side < radialSegments; side++) {
      const a = y * (radialSegments + 1) + side;
      const b = a + radialSegments + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

const foliageGeometryCache = new Map();

/** Opaque leaf sprays: broken edges and small overlapping lobes at 80 triangles,
 * the same budget as the former single rounded crown. No alpha-test/overdraw pass.
 * Variants are deterministic and never consume the map placement random stream. */
function createIrregularFoliageGeometry(radius) {
  const variant = Math.floor(radius * 137) % 4;
  let template = foliageGeometryCache.get(variant);
  if (!template) {
    const pieces = [];
    for (let lobe = 0; lobe < 3; lobe++) {
      const geometry = new THREE.IcosahedronGeometry(0.6, 0);
      const angle = lobe * Math.PI * 2 / 3 + variant * 0.7;
      const position = geometry.attributes.position;
      const normal = geometry.attributes.normal;
      const shades = [];
      for (let i = 0; i < position.count; i++) {
        const x = position.getX(i);
        const y = position.getY(i);
        const z = position.getZ(i);
        const ripple = 1 + Math.sin(x * 9 + z * 7 + variant) * 0.14;
        position.setXYZ(i,
          x * ripple + Math.cos(angle) * 0.29,
          y * 0.82 + Math.sin(angle * 2) * 0.1,
          z * 0.9 + Math.sin(angle) * 0.29);
        const normalScale = 1 / Math.hypot(x, y / 0.82, z / 0.9);
        normal.setXYZ(i, x * normalScale, y / 0.82 * normalScale, z / 0.9 * normalScale);
        const shade = 0.76 + (y / 0.64 + 1) * 0.11;
        shades.push(shade, shade, shade * 0.98);
      }
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(shades, 3));
      pieces.push(geometry);
    }

    const vertices = [];
    const uv = [];
    const shades = [];
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < 10; i++) {
      const angle = i * 2.399963 + variant * 0.69;
      const rise = -0.63 + (i / 9) * 1.34;
      const reach = Math.sqrt(1 - rise * rise);
      const direction = new THREE.Vector3(Math.cos(angle) * reach, rise * 0.74, Math.sin(angle) * reach);
      const across = new THREE.Vector3().crossVectors(direction, up).normalize().multiplyScalar(0.095);
      const base = direction.clone().multiplyScalar(0.68);
      const tip = direction.clone().multiplyScalar(1.03);
      const mid = base.clone().lerp(tip, 0.46);
      mid.y += 0.055;
      const left = mid.clone().add(across);
      const right = mid.clone().sub(across);
      // Closed two-sided leaf without a transparent material or extra draw pass.
      const points = [left, right, tip, left, tip, right];
      for (let n = 0; n < points.length; n++) {
        const point = points[n];
        vertices.push(point.x, point.y, point.z);
        uv.push(n % 3 === 1 ? 1 : 0, n % 3 === 2 ? 1 : 0);
        const shade = (n >= 3 ? 0.78 : 0.91) + (i % 3) * 0.035;
        shades.push(shade, shade, shade * 0.96);
      }
    }
    const sprays = new THREE.BufferGeometry();
    sprays.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    sprays.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    sprays.setAttribute('color', new THREE.Float32BufferAttribute(shades, 3));
    sprays.computeVertexNormals();
    pieces.push(sprays);
    template = mergeCompatibleGeometries(pieces);
    pieces.forEach((piece) => piece.dispose());
    foliageGeometryCache.set(variant, template);
  }
  return template.clone().scale(radius, radius, radius);
}

/** A curved, pointed palm leaflet; eight faces replace each twelve-face box. */
function createPalmLeafletGeometry(length, width, side) {
  const geometry = new THREE.BufferGeometry();
  const positions = [
    0, 0, 0,
    length * 0.29, -0.025, side * width * 0.13,
    length * 0.51, 0.015, side * width * 0.51,
    length * 0.11, -0.028, side * width * 0.6,
    length * 0.43, -0.16, side * width,
  ];
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0.3, 0.5, 0.5, 0, 0.6, 0.5, 1], 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3, 1, 4, 2, 2, 4, 3, 0, 2, 1, 0, 3, 2, 1, 2, 4, 2, 3, 4]);
  // Separate front/back normals so the two thin surfaces light consistently.
  const leaf = geometry.toNonIndexed();
  geometry.dispose();
  leaf.computeVertexNormals();
  return leaf;
}

function addWoodyLimb(group, material, start, end, baseRadius, tipRadius, radialSegments = 7) {
  const direction = end.clone().sub(start);
  const length = direction.length();
  if (length < 0.02) return;
  const limb = new THREE.Mesh(
    new THREE.CylinderGeometry(tipRadius, baseRadius, length, radialSegments, 2),
    material
  );
  limb.position.copy(start).add(end).multiplyScalar(0.5);
  limb.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  limb.castShadow = true;
  limb.receiveShadow = true;
  group.add(limb);
}

function createTreeGroup(trunkMat, leafMat, darkLeafMat, lightLeafMat, leafTintMat, terrain) {
  const g = new THREE.Group();
  g.name = 'vegetationTree';
  g.userData.vegetationKind = 'tree';
  const isOlive = terrain === 'hills';
  const height = isOlive ? 2.3 + mapRandom() * 1.05 : 2.8 + mapRandom() * 1.45;
  const leanX = (mapRandom() - 0.5) * (isOlive ? 0.42 : 0.2);
  const leanZ = (mapRandom() - 0.5) * (isOlive ? 0.42 : 0.2);
  const trunk = new THREE.Mesh(
    createOrganicTrunkGeometry(
      height,
      isOlive ? 0.3 : 0.27,
      isOlive ? 0.105 : 0.095,
      leanX,
      leanZ
    ),
    trunkMat
  );
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  g.add(trunk);

  const rootCount = isOlive ? 6 : 5;
  for (let i = 0; i < rootCount; i++) {
    const angle = (i / rootCount) * Math.PI * 2 + mapRandom() * 0.3;
    const rootLength = 0.48 + mapRandom() * 0.28;
    addWoodyLimb(
      g,
      trunkMat,
      new THREE.Vector3(Math.cos(angle) * 0.08, 0.15, Math.sin(angle) * 0.08),
      new THREE.Vector3(
        Math.cos(angle) * rootLength,
        0.045 + mapRandom() * 0.045,
        Math.sin(angle) * rootLength
      ),
      0.105,
      0.018,
      6
    );
  }

  const branchCount = isOlive ? 7 : 5 + Math.floor(mapRandom() * 2);
  const branchEnds = [];
  for (let i = 0; i < branchCount; i++) {
    const t = 0.48 + (i / Math.max(1, branchCount - 1)) * 0.37;
    const angle = (i / branchCount) * Math.PI * 2 + mapRandom() * 0.72;
    const length = height * ((isOlive ? 0.31 : 0.24) + mapRandom() * 0.13);
    const start = new THREE.Vector3(leanX * t * t, height * t, leanZ * t * t);
    const end = new THREE.Vector3(
      start.x + Math.cos(angle) * length,
      start.y + length * (0.2 + mapRandom() * 0.28),
      start.z + Math.sin(angle) * length
    );
    addWoodyLimb(g, trunkMat, start, end, 0.07 + (1 - t) * 0.04, 0.026, 7);
    branchEnds.push(end);

    const forkAngle = angle + (mapRandom() > 0.5 ? 1 : -1) * (0.45 + mapRandom() * 0.45);
    const forkStart = start.clone().lerp(end, 0.58);
    const forkEnd = end.clone().add(
      new THREE.Vector3(
        Math.cos(forkAngle) * length * 0.38,
        length * (0.16 + mapRandom() * 0.22),
        Math.sin(forkAngle) * length * 0.38
      )
    );
    addWoodyLimb(g, trunkMat, forkStart, forkEnd, 0.036, 0.012, 6);
    branchEnds.push(forkEnd);
  }

  const crownCount = terrain === 'steppe' ? 11 : isOlive ? 15 : 14;
  const crownCenter = new THREE.Vector3(leanX, height + (isOlive ? 0.02 : 0.24), leanZ);
  for (let i = 0; i < crownCount; i++) {
    const material = i % 6 === 0 ? lightLeafMat : i % 3 === 0 ? darkLeafMat : leafMat;
    const size = (isOlive ? 0.38 : 0.42) + mapRandom() * (isOlive ? 0.28 : 0.32);
    const crown = new THREE.Mesh(createIrregularFoliageGeometry(size), material);
    const angle = i * 2.39996 + mapRandom() * 0.42;
    const radial = Math.sqrt((i + 0.5) / crownCount) * (isOlive ? 1.22 : 0.98);
    const vertical = (mapRandom() - 0.46) * (isOlive ? 0.88 : 1.18);
    crown.position.set(
      crownCenter.x + Math.cos(angle) * radial,
      crownCenter.y + vertical,
      crownCenter.z + Math.sin(angle) * radial
    );
    crown.scale.set(
      (isOlive ? 1.34 : 1.08) + mapRandom() * 0.3,
      0.66 + mapRandom() * 0.28,
      (isOlive ? 1.28 : 1.02) + mapRandom() * 0.3
    );
    crown.rotation.set(mapRandom() * 0.35, mapRandom() * Math.PI, mapRandom() * 0.25);
    crown.castShadow = true;
    crown.receiveShadow = true;
    g.add(crown);
  }

  for (let i = 0; i < branchEnds.length; i += 2) {
    const end = branchEnds[i];
    const outer = new THREE.Mesh(
      createIrregularFoliageGeometry(0.28 + mapRandom() * 0.18),
      i % 4 === 0 ? lightLeafMat : leafMat
    );
    outer.position.copy(end).add(new THREE.Vector3(0, 0.08 + mapRandom() * 0.2, 0));
    outer.scale.set(1.25 + mapRandom() * 0.25, 0.66 + mapRandom() * 0.2, 1.1 + mapRandom() * 0.25);
    outer.rotation.set(mapRandom() * 0.3, mapRandom() * Math.PI, mapRandom() * 0.25);
    outer.castShadow = true;
    outer.receiveShadow = true;
    g.add(outer);
  }
  return consolidateGroupMeshes(
    g,
    false,
    new Map([
      [leafMat, leafTintMat],
      [darkLeafMat, leafTintMat],
      [lightLeafMat, leafTintMat],
    ])
  );
}

function createPalmTreeGroup(trunkMat, leafMat, darkLeafMat, lightLeafMat, leafTintMat) {
  const g = new THREE.Group();
  g.name = 'vegetationPalm';
  g.userData.vegetationKind = 'tree';

  const height = 4.6 + mapRandom() * 2.3;
  const leanX = (mapRandom() - 0.5) * 0.72;
  const leanZ = (mapRandom() - 0.5) * 0.72;
  const trunk = new THREE.Mesh(
    createOrganicTrunkGeometry(height, 0.25, 0.15, leanX, leanZ),
    trunkMat
  );
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  g.add(trunk);

  for (let band = 0; band < 8; band++) {
    const scar = new THREE.Mesh(
      new THREE.TorusGeometry(0.18 - band * 0.004, 0.018, 5, 12),
      trunkMat
    );
    scar.rotation.x = Math.PI / 2;
    scar.position.set(
      leanX * (0.2 + band * 0.085),
      height * (0.2 + band * 0.085),
      leanZ * (0.2 + band * 0.085)
    );
    scar.scale.set(1, 1, 0.86);
    g.add(scar);
  }

  const crown = new THREE.Group();
  crown.position.set(leanX, height, leanZ);
  g.add(crown);
  const frondCount = 13;
  for (let i = 0; i < frondCount; i++) {
    const angle = (i / frondCount) * Math.PI * 2 + mapRandom() * 0.22;
    const length = 1.65 + mapRandom() * 0.65;
    const frond = new THREE.Group();
    frond.rotation.y = -angle;
    frond.rotation.z = -0.12 - mapRandom() * 0.18;
    crown.add(frond);

    const stem = new THREE.Mesh(
      new THREE.BoxGeometry(length, 0.035, 0.045),
      i % 4 === 0 ? lightLeafMat : leafMat
    );
    stem.position.x = length * 0.5;
    stem.rotation.z = -0.12;
    stem.castShadow = true;
    frond.add(stem);

    const leafletCount = 7;
    for (let side = -1; side <= 1; side += 2) {
      for (let j = 0; j < leafletCount; j++) {
        const t = (j + 1) / (leafletCount + 1);
        const leaflet = new THREE.Mesh(
          createPalmLeafletGeometry(length * 0.4, length * 0.43 * Math.sin(t * Math.PI) + 0.07, side),
          (i + j) % 5 === 0 ? darkLeafMat : leafMat
        );
        leaflet.position.set(length * t, -0.04 - t * t * 0.32, side * 0.025);
        leaflet.rotation.y = side * (0.12 + t * 0.18);
        leaflet.rotation.z = -0.16 - t * 0.16;
        leaflet.castShadow = true;
        frond.add(leaflet);
      }
    }
  }

  const coconutMat = new THREE.MeshStandardMaterial({
    color: 0x55412c,
    roughness: 0.9,
    envMapIntensity: 0.2,
  });
  for (let i = 0; i < 4; i++) {
    const coconut = new THREE.Mesh(new THREE.SphereGeometry(0.11, 7, 6), coconutMat);
    const angle = (i / 4) * Math.PI * 2 + mapRandom() * 0.4;
    coconut.position.set(Math.cos(angle) * 0.18, -0.16 - mapRandom() * 0.12, Math.sin(angle) * 0.18);
    coconut.castShadow = true;
    crown.add(coconut);
  }
  return consolidateGroupMeshes(g, true, new Map([
    [leafMat, leafTintMat],
    [darkLeafMat, leafTintMat],
    [lightLeafMat, leafTintMat],
  ]));
}

function createBushGroup(bushMat, accentMat, twigMat, leafTintMat, terrain) {
  const g = new THREE.Group();
  g.name = 'vegetationBush';
  g.userData.vegetationKind = 'bush';
  const sparse = terrain === 'desert' || terrain === 'steppe';
  const stemCount = sparse ? 7 : 9;
  const stemEnds = [];
  for (let i = 0; i < stemCount; i++) {
    const angle = (i / stemCount) * Math.PI * 2 + mapRandom() * 0.48;
    const height = (sparse ? 0.58 : 0.72) + mapRandom() * (sparse ? 0.38 : 0.48);
    const spread = (sparse ? 0.34 : 0.28) + mapRandom() * 0.26;
    const start = new THREE.Vector3((mapRandom() - 0.5) * 0.12, 0.04, (mapRandom() - 0.5) * 0.12);
    const end = new THREE.Vector3(Math.cos(angle) * spread, height, Math.sin(angle) * spread);
    addWoodyLimb(g, twigMat, start, end, 0.032, 0.012, 5);
    stemEnds.push(end);
    if (i % 2 === 0) {
      const forkStart = start.clone().lerp(end, 0.58);
      const forkAngle = angle + (i % 4 === 0 ? 0.65 : -0.65);
      const forkEnd = end.clone().add(
        new THREE.Vector3(Math.cos(forkAngle) * 0.24, 0.12 + mapRandom() * 0.18, Math.sin(forkAngle) * 0.24)
      );
      addWoodyLimb(g, twigMat, forkStart, forkEnd, 0.018, 0.007, 5);
      stemEnds.push(forkEnd);
    }
  }
  const count = sparse ? 7 + Math.floor(mapRandom() * 3) : 11 + Math.floor(mapRandom() * 4);
  for (let i = 0; i < count; i++) {
    const bush = new THREE.Mesh(
      createIrregularFoliageGeometry(0.2 + mapRandom() * (sparse ? 0.22 : 0.27)),
      i % 5 === 0 ? accentMat : bushMat
    );
    const stemEnd = stemEnds[i % stemEnds.length];
    bush.position.copy(stemEnd).add(
      new THREE.Vector3((mapRandom() - 0.5) * 0.24, (mapRandom() - 0.5) * 0.18, (mapRandom() - 0.5) * 0.24)
    );
    bush.scale.set(
      1.05 + mapRandom() * 0.42,
      (sparse ? 0.58 : 0.7) + mapRandom() * 0.28,
      0.92 + mapRandom() * 0.36
    );
    bush.rotation.set(mapRandom() * 0.25, mapRandom() * Math.PI, mapRandom() * 0.2);
    bush.castShadow = true;
    bush.receiveShadow = true;
    g.add(bush);
  }
  const baseCluster = new THREE.Mesh(
    createIrregularFoliageGeometry(sparse ? 0.38 : 0.5),
    bushMat
  );
  baseCluster.position.y = sparse ? 0.24 : 0.32;
  baseCluster.scale.set(1.45, 0.58, 1.28);
  baseCluster.rotation.y = mapRandom() * Math.PI;
  baseCluster.castShadow = true;
  baseCluster.receiveShadow = true;
  g.add(baseCluster);
  return consolidateGroupMeshes(
    g,
    false,
    new Map([
      [bushMat, leafTintMat],
      [accentMat, leafTintMat],
    ])
  );
}

function createRockCluster(rockMat, scale = 1) {
  const g = new THREE.Group();
  const count = 2 + Math.floor(mapRandom() * 3);
  for (let i = 0; i < count; i++) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry((0.35 + mapRandom() * 0.55) * scale, 2), rockMat);
    rock.position.set((mapRandom() - 0.5) * 1.2, 0.22 + mapRandom() * 0.25, (mapRandom() - 0.5) * 1.1);
    rock.rotation.set(mapRandom(), mapRandom(), mapRandom());
    rock.scale.set(1.15 + mapRandom() * 0.5, 0.58 + mapRandom() * 0.42, 0.9 + mapRandom() * 0.35);
    rock.castShadow = true;
    rock.receiveShadow = true;
    g.add(rock);
  }
  return consolidateGroupMeshes(g);
}

function createHedgeBankGeometry(length) {
  const geo = new THREE.BoxGeometry(length * 0.96, 0.52, 1.05, 8, 2, 3);
  const pos = geo.attributes.position;
  const colors = [];
  const soil = new THREE.Color(0x62553c), moss = new THREE.Color(0x536044);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    // Keep the seeded placement stream stable, but deform coincident vertices
    // identically so the bank has no cracks along the box's face seams.
    mapRandom(); mapRandom(); mapRandom();
    const end = Math.min(1, (length * 0.48 - Math.abs(x)) / 0.85);
    const level = (y + 0.26) / 0.52;
    const wave = Math.sin(x * 2.3 + z * 3.1) * 0.035 + Math.cos(x * 4.7 - z) * 0.023;
    const crest = 0.29 + 0.09 * Math.sin(x * 1.7) + 0.05 * Math.cos(x * 3.2);
    const tint = soil.clone().lerp(moss, 0.3 + 0.3 * Math.sin(x * 2.1 + z * 5)).multiplyScalar(0.9 + wave * 2);
    colors.push(tint.r, tint.g, tint.b);
    pos.setXYZ(
      i,
      x + Math.sin(x * 3.1 + z * 2) * 0.035,
      -0.29 + level * (crest + 0.29) * (0.15 + end * 0.85) + wave * level,
      z * (1.25 - level * 0.72) * (0.45 + end * 0.55) + Math.sin(x * 1.8) * 0.075
    );
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

function createHedgeFoliageGeometry(radius) {
  // Small interlocking crowns and folded opaque leaves. Baked once into each
  // hedge's existing foliage batch; no alpha sorting or per-leaf draw calls.
  const pieces = [];
  for (let i = 0; i < 5; i++) {
    const angle = i * 2.39996;
    const crown = new THREE.IcosahedronGeometry(radius * 0.43, 0);
    crown.scale(1.1, 0.85, 1);
    const vertices = crown.attributes.position, normals = crown.attributes.normal;
    for (let v = 0; v < vertices.count; v++) {
      const x = vertices.getX(v) / 1.21, y = vertices.getY(v) / 0.7225, z = vertices.getZ(v);
      const length = Math.hypot(x, y, z);
      normals.setXYZ(v, x / length, y / length, z / length);
    }
    crown.translate(Math.cos(angle) * radius * 0.35, (i / 4 - 0.5) * radius, Math.sin(angle) * radius * 0.35);
    pieces.push(crown);
  }
  const leaves = [];
  for (let i = 0; i < 30; i++) {
    const a = i * 2.39996, y = ((i * 7 % 29) / 29 - 0.5) * radius * 1.35;
    const r = radius * (0.48 + (i % 3) * 0.06);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const dx = Math.cos(a) * radius * 0.25, dz = Math.sin(a) * radius * 0.25;
    const wx = -Math.sin(a) * radius * 0.1, wz = Math.cos(a) * radius * 0.1;
    leaves.push(x,y,z, x+dx*.45+wx,y+.07,z+dz*.45+wz, x+dx,y+.025,z+dz,
      x,y,z, x+dx,y+.025,z+dz, x+dx*.45-wx,y+.07,z+dz*.45-wz);
  }
  const leaf = new THREE.BufferGeometry();
  leaf.setAttribute('position', new THREE.Float32BufferAttribute(leaves, 3));
  leaf.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(leaves.length / 3 * 2), 2));
  leaf.computeVertexNormals(); pieces.push(leaf);
  const merged = mergeCompatibleGeometries(pieces);
  pieces.forEach(piece => piece.dispose());
  return merged;
}

function createHedgeGroup(hedgeMat, bushMat, darkLeafMat, twigMat, earthMat, leafTintMat) {
  const g = new THREE.Group();
  const len = 6 + mapRandom() * 5;
  const bank = new THREE.Mesh(createHedgeBankGeometry(len), earthMat);
  bank.position.y = 0.24;
  bank.rotation.y = (mapRandom() - 0.5) * 0.025;
  bank.rotation.z = (mapRandom() - 0.5) * 0.035;
  bank.castShadow = true;
  bank.receiveShadow = true;
  g.add(bank);

  const lumps = 9 + Math.floor(mapRandom() * 4);
  for (let i = 0; i < lumps; i++) {
    const hedge = new THREE.Mesh(
      createHedgeFoliageGeometry(0.7 + mapRandom() * 0.3),
      i % 5 === 0 ? darkLeafMat : i % 3 === 0 ? bushMat : hedgeMat
    );
    const t = lumps <= 1 ? 0 : i / (lumps - 1);
    hedge.position.set((t - 0.5) * len * 0.95, 0.93 + mapRandom() * 0.3, (mapRandom() - 0.5) * 0.58);
    hedge.scale.set(1.3 + mapRandom() * 0.45, 1.65 + mapRandom() * 0.5, 1.15 + mapRandom() * 0.35);
    hedge.rotation.set(mapRandom() * 0.28, mapRandom() * Math.PI, mapRandom() * 0.18);
    hedge.castShadow = true;
    hedge.receiveShadow = true;
    g.add(hedge);
  }

  for (let i = 0; i < Math.max(5, Math.floor(len * 0.8)); i++) {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.035, 1.05 + mapRandom() * 0.4, 5), twigMat);
    stem.position.set((mapRandom() - 0.5) * len * 0.92, 0.68, (mapRandom() - 0.5) * 0.5);
    stem.rotation.z = (mapRandom() - 0.5) * 0.45;
    stem.rotation.y = mapRandom() * Math.PI;
    stem.castShadow = true;
    g.add(stem);
  }
  return consolidateGroupMeshes(g, false, new Map([
    [hedgeMat, leafTintMat],
    [bushMat, leafTintMat],
    [darkLeafMat, leafTintMat],
  ]));
}

function createGrassClumpGeometry() {
  const vertices = [];
  const colors = [];
  const bladeCount = 7;
  for (let i = 0; i < bladeCount; i++) {
    const angle = i * 2.399963;
    const radius = i === 0 ? 0 : 0.08 + (i % 3) * 0.025;
    const cx = Math.cos(angle) * radius;
    const cz = Math.sin(angle) * radius;
    const width = 0.012 + (i % 2) * 0.007;
    const height = 0.34 + (i % 4) * 0.09;
    const dx = Math.cos(angle) * width;
    const dz = Math.sin(angle) * width;
    const bendX = Math.sin(angle + 0.5) * 0.14;
    const bendZ = Math.cos(angle + 0.5) * 0.14;
    const baseLeft = [cx - dx, 0, cz - dz];
    const baseRight = [cx + dx, 0, cz + dz];
    const midLeft = [cx + bendX * 0.2 - dx * 0.6, height * 0.62, cz + bendZ * 0.2 - dz * 0.6];
    const midRight = [cx + bendX * 0.2 + dx * 0.6, height * 0.62, cz + bendZ * 0.2 + dz * 0.6];
    const tip = [cx + bendX, height, cz + bendZ];
    for (const vertex of [baseLeft, baseRight, midRight, baseLeft, midRight, midLeft, midLeft, midRight, tip]) {
      vertices.push(...vertex);
      const light = 0.66 + (vertex[1] / height) * 0.34;
      colors.push(light, light, light * 0.94);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}


function addGroundCover(mapDef, scene, size, seed, palette) {
  const terrain = mapDef.terrain;
  const scale = mapDef.sizeScale ?? 1;
  const grassBase =
    terrain === 'desert'
      ? 120
      : terrain === 'bocage'
        ? 620
        : terrain === 'jungle'
          ? 760
          : terrain === 'steppe'
            ? 520
            : 470;
  const grassCount = Math.round(grassBase * scale * (scale > 1 ? 1.08 : 1));
  const grassGeo = createGrassClumpGeometry();
  const grassMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
    side: THREE.DoubleSide,
    envMapIntensity: 0.15,
    vertexColors: true,
  });
  const grass = new THREE.InstancedMesh(grassGeo, grassMat, grassCount);
  grass.name = 'groundCoverGrass';
  grass.castShadow = false;
  grass.receiveShadow = true;
  grass.instanceMatrix.setUsage(THREE.StaticDrawUsage);

  const greenA = new THREE.Color(terrain === 'desert' ? 0x8d7a48 : palette.bush);
  const greenB = new THREE.Color(terrain === 'steppe' ? 0x9a874c : terrain === 'desert' ? 0xb0975e : palette.leafLight);
  const dry = new THREE.Color(palette.dry);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const rotation = new THREE.Euler();
  const instanceScale = new THREE.Vector3();
  const color = new THREE.Color();
  let placed = 0;
  for (let i = 0; i < grassCount * 1.3 && placed < grassCount; i++) {
    const x = (mapRandom() - 0.5) * size * 0.94;
    const z = (mapRandom() - 0.5) * size * 0.94;
    if (isReservedMapSpace(x, z, mapDef, 4.5)) continue;
    const y = heightAt(x, z, mapDef, seed) + 0.015;
    rotation.set(0, mapRandom() * Math.PI * 2, (mapRandom() - 0.5) * 0.08);
    quaternion.setFromEuler(rotation);
    const clumpScale = terrain === 'desert' ? 0.65 + mapRandom() * 0.65 : 0.8 + mapRandom() * 1.05;
    instanceScale.set(clumpScale * (0.7 + mapRandom() * 0.55), clumpScale, clumpScale * (0.7 + mapRandom() * 0.55));
    position.set(x, y, z);
    matrix.compose(position, quaternion, instanceScale);
    grass.setMatrixAt(placed, matrix);
    color.copy(mapRandom() > (terrain === 'desert' ? 0.28 : 0.78) ? dry : greenA).lerp(greenB, mapRandom() * 0.45);
    grass.setColorAt(placed, color);
    placed++;
  }
  grass.count = placed;
  grass.instanceMatrix.needsUpdate = true;
  if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
  grass.computeBoundingSphere();
  scene.add(grass);

  const stoneCount = Math.round(
    (terrain === 'desert' ? 190 : terrain === 'jungle' ? 62 : 90) * scale
  );
  const stoneGeo = new THREE.DodecahedronGeometry(0.13, 0);
  const stoneMat = new THREE.MeshStandardMaterial({
    color: palette.rock,
    roughness: 0.96,
    flatShading: true,
    envMapIntensity: 0.2,
  });
  const stones = new THREE.InstancedMesh(stoneGeo, stoneMat, stoneCount);
  stones.name = 'groundCoverStones';
  stones.castShadow = false;
  stones.receiveShadow = true;
  stones.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  for (let i = 0; i < stoneCount; i++) {
    const x = (mapRandom() - 0.5) * size * 0.94;
    const z = (mapRandom() - 0.5) * size * 0.94;
    const y = heightAt(x, z, mapDef, seed) + 0.07;
    rotation.set(mapRandom() * Math.PI, mapRandom() * Math.PI, mapRandom() * Math.PI);
    quaternion.setFromEuler(rotation);
    const s = 0.65 + mapRandom() * (terrain === 'desert' ? 1.8 : 1.15);
    instanceScale.set(s * (0.8 + mapRandom() * 0.8), s * (0.35 + mapRandom() * 0.5), s);
    position.set(x, y, z);
    matrix.compose(position, quaternion, instanceScale);
    stones.setMatrixAt(i, matrix);
  }
  stones.instanceMatrix.needsUpdate = true;
  stones.computeBoundingSphere();
  scene.add(stones);
}

function addFarmClusters(mapDef, scene, size, seed, scenery) {
  if (mapDef.terrain === 'jungle') {
    addJungleVillageClusters(mapDef, scene, size, seed, scenery);
    return;
  }
  const scale = mapDef.sizeScale ?? 1;
  const count = scale >= 2.4 ? 5 : scale >= 1.7 ? 3 : 1;
  const pack = createFarmMaterials(mapDef);
  let placed = 0;

  for (let i = 0; i < count && placed < count; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const x = side * (size * (0.12 + mapRandom() * 0.24));
    const z = (mapRandom() - 0.5) * size * 0.62;
    if (isReservedMapSpace(x, z, mapDef, 20 * scale)) continue;
    addFarmCluster(mapDef, scene, seed, scenery, x, z, mapRandom() * Math.PI * 2, pack);
    placed++;
  }
  disposeFarmMaterials(pack);
}

function addJungleVillageClusters(mapDef, scene, size, seed, scenery) {
  const scale = mapDef.sizeScale ?? 1;
  const clusterCount = scale >= 2.4 ? 4 : scale >= 1.7 ? 3 : 2;
  const mats = {
    bamboo: new THREE.MeshStandardMaterial({ color: 0x8a784a, roughness: 0.96, envMapIntensity: 0.2 }),
    timber: new THREE.MeshStandardMaterial({ color: 0x463022, roughness: 0.94, envMapIntensity: 0.2 }),
    thatch: new THREE.MeshStandardMaterial({ color: 0x8a7441, roughness: 1, envMapIntensity: 0.14 }),
    shadow: new THREE.MeshStandardMaterial({ color: 0x1d2119, roughness: 0.92, envMapIntensity: 0.15 }),
  };

  for (let cluster = 0; cluster < clusterCount; cluster++) {
    const side = cluster % 2 === 0 ? -1 : 1;
    const cx = side * size * (0.16 + mapRandom() * 0.18);
    const cz = (mapRandom() - 0.5) * size * 0.52;
    if (isReservedMapSpace(cx, cz, mapDef, 18 * scale)) continue;
    const rot = mapRandom() * Math.PI * 2;
    const huts = [
      { x: -3.5, z: -1.4, kind: 'farmHouse', large: true },
      { x: 3.4, z: 1.2, kind: 'outbuilding', large: false },
      { x: 0.5, z: 5.2, kind: 'outbuilding', large: false },
    ];
    for (const hut of huts) {
      const x = cx + Math.cos(rot) * hut.x - Math.sin(rot) * hut.z;
      const z = cz + Math.sin(rot) * hut.x + Math.cos(rot) * hut.z;
      const y = heightAt(x, z, mapDef, seed);
      const group = createJungleHut(mats, hut.large);
      group.position.set(x, y, z);
      group.rotation.y = rot + (mapRandom() - 0.5) * 0.35;
      if (scenery) scenery.register(group, { x, z, kind: hut.kind, source: 'map' });
      else scene.add(group);
    }
  }
  Object.values(mats).forEach((material) => material.dispose());
}

function addFarmCluster(mapDef, scene, seed, scenery, cx, cz, rot, pack) {
  const pieces = [
    { kind: 'farmHouse', x: -3.2, z: -1.4, rot: 0.05 },
    { kind: 'barn', x: 4.4, z: 1.2, rot: Math.PI * 0.5 },
    { kind: 'outbuilding', x: 0.2, z: 5.7, rot: -0.25 },
  ];

  for (const p of pieces) {
    const wx = cx + Math.cos(rot) * p.x - Math.sin(rot) * p.z;
    const wz = cz + Math.sin(rot) * p.x + Math.cos(rot) * p.z;
    const wy = heightAt(wx, wz, mapDef, seed);
    const g = createFarmBuilding(p.kind, pack, mapRandom);
    g.position.set(wx, wy, wz);
    g.rotation.y = rot + p.rot;
    if (scenery) scenery.register(g, { x: wx, z: wz, kind: p.kind, source: 'map' });
    else scene.add(g);
  }

  for (let i = 0; i < 2; i++) {
    const offZ = i === 0 ? -6.1 : 6.3;
    const wx = cx + Math.cos(rot) * 0 - Math.sin(rot) * offZ;
    const wz = cz + Math.sin(rot) * 0 + Math.cos(rot) * offZ;
    const wy = heightAt(wx, wz, mapDef, seed);
    const wall = createStoneWall(pack.mats.stone, mapRandom);
    wall.position.set(wx, wy, wz);
    wall.rotation.y = rot + Math.PI * 0.5;
    if (scenery) scenery.register(wall, { x: wx, z: wz, kind: 'stoneWall', source: 'map' });
    else scene.add(wall);
  }
}

function addTerrainClutter(mapDef, scene, size, seed, scenery) {
  const scale = mapDef.sizeScale ?? 1;
  const count = Math.round((mapDef.terrain === 'desert' ? 12 : 24) * scale * (scale > 1 ? 1.1 : 1));
  const mats = {
    hay: new THREE.MeshStandardMaterial({ color: 0xb79b55, roughness: 0.94, envMapIntensity: 0.22 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x4a3122, roughness: 0.9, envMapIntensity: 0.25 }),
    darkWood: new THREE.MeshStandardMaterial({ color: 0x251a14, roughness: 0.94, envMapIntensity: 0.18 }),
    scrub: new THREE.MeshStandardMaterial({
      color: mapDef.terrain === 'desert' ? 0x8b764c : 0x596b37,
      roughness: 0.95,
      envMapIntensity: 0.22,
    }),
    metal: new THREE.MeshStandardMaterial({ color: 0x3b3f3f, roughness: 0.82, metalness: 0.35, envMapIntensity: 0.42 }),
  };

  for (let i = 0; i < count; i++) {
    const x = (mapRandom() - 0.5) * size * 0.76;
    const z = (mapRandom() - 0.5) * size * 0.76;
    if (isReservedMapSpace(x, z, mapDef, 13 * scale)) continue;
    const y = heightAt(x, z, mapDef, seed);
    const roll = mapRandom();
    let g;
    let kind;

    if (mapDef.terrain === 'jungle') {
      if (roll < 0.34) {
        g = createFieldFence(mats.wood);
        kind = 'fieldFence';
      } else {
        g = createStumpPatch(mats.darkWood, mats.scrub);
        kind = 'stump';
      }
    } else if (mapDef.terrain !== 'desert' && roll < 0.26) {
      g = createHaystack(mats.hay);
      kind = 'haystack';
    } else if (mapDef.terrain !== 'desert' && roll < 0.54) {
      g = createFieldFence(mats.wood);
      kind = 'fieldFence';
    } else if (roll < 0.75) {
      g = createAbandonedCart(mats.wood, mats.darkWood, mats.metal);
      kind = 'cart';
    } else {
      g = createStumpPatch(mats.darkWood, mats.scrub);
      kind = 'stump';
    }

    g.position.set(x, y, z);
    g.rotation.y = mapRandom() * Math.PI * 2;
    if (scenery) scenery.register(g, { x, z, kind, source: 'map' });
    else scene.add(g);
  }

  Object.values(mats).forEach((mat) => mat.dispose());
}

function createHaystack(mat) {
  const g = new THREE.Group();
  const local = mat.clone();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.12, 0.9, 10), local);
  base.position.y = 0.45;
  base.scale.set(1.15, 1, 0.85);
  base.castShadow = true;
  base.receiveShadow = true;
  g.add(base);

  const cap = new THREE.Mesh(new THREE.ConeGeometry(1.08, 0.72, 10), local);
  cap.position.y = 1.25;
  cap.scale.set(1.1, 0.85, 0.9);
  cap.castShadow = true;
  cap.receiveShadow = true;
  g.add(cap);
  return g;
}

function createFieldFence(mat) {
  const g = new THREE.Group();
  const local = mat.clone();
  const len = 5.5 + mapRandom() * 2.5;
  for (let i = 0; i < 4; i++) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.05, 0.16), local);
    post.position.set((i / 3 - 0.5) * len, 0.52, (mapRandom() - 0.5) * 0.12);
    post.rotation.z = (mapRandom() - 0.5) * 0.12;
    post.castShadow = true;
    post.receiveShadow = true;
    g.add(post);
  }
  for (const y of [0.42, 0.78]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.12, 0.12), local);
    rail.position.y = y;
    rail.rotation.z = (mapRandom() - 0.5) * 0.04;
    rail.castShadow = true;
    rail.receiveShadow = true;
    g.add(rail);
  }
  return g;
}

function createAbandonedCart(woodMat, darkWoodMat, metalMat) {
  const g = new THREE.Group();
  const wood = woodMat.clone();
  const darkWood = darkWoodMat.clone();
  const metal = metalMat.clone();

  const bed = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.36, 1.05), wood);
  bed.position.y = 0.62;
  bed.rotation.z = (mapRandom() - 0.5) * 0.12;
  bed.castShadow = true;
  bed.receiveShadow = true;
  g.add(bed);

  for (const sx of [-1, 1]) {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.055, 6, 16), metal);
    wheel.position.set(sx * 0.76, 0.36, 0.58);
    wheel.rotation.y = Math.PI * 0.5;
    wheel.castShadow = true;
    g.add(wheel);
  }

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 1.8, 6), darkWood);
  shaft.position.set(0, 0.5, -0.98);
  shaft.rotation.x = Math.PI * 0.5;
  shaft.castShadow = true;
  g.add(shaft);
  return g;
}

function createStumpPatch(woodMat, scrubMat) {
  const g = new THREE.Group();
  const wood = woodMat.clone();
  const scrub = scrubMat.clone();
  const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 0.62, 7), wood);
  stump.position.y = 0.31;
  stump.rotation.z = (mapRandom() - 0.5) * 0.18;
  stump.castShadow = true;
  stump.receiveShadow = true;
  g.add(stump);

  for (let i = 0; i < 3; i++) {
    const tuft = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28 + mapRandom() * 0.14, 1), scrub);
    const ang = (i / 3) * Math.PI * 2;
    tuft.position.set(Math.cos(ang) * 0.42, 0.22, Math.sin(ang) * 0.36);
    tuft.scale.y = 0.52;
    tuft.castShadow = true;
    tuft.receiveShadow = true;
    g.add(tuft);
  }
  return g;
}

function isReservedMapSpace(x, z, mapDef, radius) {
  const points = [mapDef.playerBase, mapDef.enemyBase, mapDef.frontline, ...(mapDef.capturePoints ?? [])].filter(Boolean);
  return points.some((p) => Math.hypot((p.x ?? 0) - x, (p.z ?? 0) - z) < radius);
}

export function sampleTerrainHeight(x, z, mapDef) {
  if (!mapDef) return 0;
  const seed = mapDef.id.length * 17;
  return heightAt(x, z, mapDef, seed);
}

/** Sample the rendered terrain triangles, including persistent crater deformation. */
export function sampleTerrainMeshHeight(terrainMesh, worldX, worldZ, mapDef = null) {
  const fallbackHeight = sampleTerrainHeight(worldX, worldZ, mapDef);
  const geo = terrainMesh?.geometry;
  const pos = geo?.attributes?.position;
  const params = geo?.parameters;
  if (
    !pos ||
    params?.width == null ||
    params?.height == null ||
    params.widthSegments == null ||
    params.heightSegments == null
  ) {
    return fallbackHeight;
  }

  const wSeg = params.widthSegments;
  const hSeg = params.heightSegments;
  if (wSeg < 1 || hSeg < 1) return fallbackHeight;
  const cols = wSeg + 1;
  const localX = worldX - (terrainMesh.position?.x ?? 0);
  const localZ = worldZ - (terrainMesh.position?.z ?? 0);
  const gridX = THREE.MathUtils.clamp(
    ((localX + params.width * 0.5) / params.width) * wSeg,
    0,
    wSeg
  );
  const gridY = THREE.MathUtils.clamp(
    ((localZ + params.height * 0.5) / params.height) * hSeg,
    0,
    hSeg
  );
  const x0 = Math.min(wSeg - 1, Math.floor(gridX));
  const y0 = Math.min(hSeg - 1, Math.floor(gridY));
  const tx = gridX - x0;
  const ty = gridY - y0;
  const i00 = y0 * cols + x0;
  const i10 = i00 + 1;
  const i01 = i00 + cols;
  const i11 = i01 + 1;
  let height;
  if (tx + ty <= 1) {
    height =
      pos.getY(i00) +
      (pos.getY(i10) - pos.getY(i00)) * tx +
      (pos.getY(i01) - pos.getY(i00)) * ty;
  } else {
    height =
      pos.getY(i11) +
      (pos.getY(i01) - pos.getY(i11)) * (1 - tx) +
      (pos.getY(i10) - pos.getY(i11)) * (1 - ty);
  }
  return height + (terrainMesh.position?.y ?? 0);
}

function sampleUnitTerrainHeight(unit, x, z, mapDef) {
  return sampleTerrainMeshHeight(unit?._terrainMesh, x, z, mapDef);
}

function terrainPoseRadius(type) {
  switch (type) {
    case 'superHeavyTank': return 2.15;
    case 'tankDestroyer':
    case 'tank': return 1.7;
    case 'armoredCar':
    case 'truck': return 1.35;
    case 'artillery': return 1.35;
    case 'antiTankGun': return 1.2;
    case 'machineGun':
    case 'mortar': return 0.72;
    default: return 0.5;
  }
}

function terrainClearance(type) {
  if (type === 'tank' || type === 'tankDestroyer' || type === 'superHeavyTank' || type === 'armoredCar' || type === 'truck') return 0.09;
  if (type === 'artillery' || type === 'antiTankGun') return 0.065;
  return 0.025;
}

/**
 * Keep a unit's ground contact plane aligned to the local hill rather than
 * leaving a level model for the terrain to cut through.
 */
export function updateUnitTerrainPose(unit, mapDef, dt) {
  const mesh = unit?.mesh;
  if (!mesh || !mapDef || unit.dead || unit._dropping || unit._mountedOnTankId) return;
  if (unit._trenchId || unit._garrisonBunkerId || unit._diggingTrench) return;

  const radius = terrainPoseRadius(unit.def?.type);
  const yaw = mesh.rotation.y;
  const forwardX = Math.sin(yaw);
  const forwardZ = Math.cos(yaw);
  const rightX = Math.cos(yaw);
  const rightZ = -Math.sin(yaw);
  const x = mesh.position.x;
  const z = mesh.position.z;

  const center = sampleUnitTerrainHeight(unit, x, z, mapDef);
  const front = sampleUnitTerrainHeight(
    unit,
    x + forwardX * radius,
    z + forwardZ * radius,
    mapDef
  );
  const back = sampleUnitTerrainHeight(
    unit,
    x - forwardX * radius,
    z - forwardZ * radius,
    mapDef
  );
  const right = sampleUnitTerrainHeight(
    unit,
    x + rightX * radius,
    z + rightZ * radius,
    mapDef
  );
  const left = sampleUnitTerrainHeight(
    unit,
    x - rightX * radius,
    z - rightZ * radius,
    mapDef
  );
  const forwardSlope = (front - back) / (radius * 2);
  const rightSlope = (right - left) / (radius * 2);

  const maxTilt = ['tank', 'tankDestroyer', 'superHeavyTank', 'armoredCar', 'truck', 'artillery', 'antiTankGun'].includes(unit.def?.type)
    ? 0.46
    : 0.32;
  const wreckPose = unit._wreckTraversalPose;
  const targetPitch = THREE.MathUtils.clamp(
    -Math.atan(forwardSlope) + (wreckPose?.pitch ?? 0),
    -maxTilt,
    maxTilt
  );
  const targetRoll = THREE.MathUtils.clamp(
    Math.atan(rightSlope) + (wreckPose?.roll ?? 0),
    -maxTilt,
    maxTilt
  );

  // Sample the footprint corners and lift over sharp convex breaks that a
  // single center-height sample cannot represent.
  let convexLift = 0;
  for (const forwardSign of [-1, 1]) {
    for (const rightSign of [-1, 1]) {
      const sx = x + forwardX * radius * forwardSign + rightX * radius * rightSign;
      const sz = z + forwardZ * radius * forwardSign + rightZ * radius * rightSign;
      const terrainDelta = sampleUnitTerrainHeight(unit, sx, sz, mapDef) - center;
      const fittedDelta =
        forwardSlope * radius * forwardSign + rightSlope * radius * rightSign;
      convexLift = Math.max(convexLift, terrainDelta - fittedDelta);
    }
  }

  const vehicleLike = ['tank', 'tankDestroyer', 'superHeavyTank', 'armoredCar', 'truck', 'artillery', 'antiTankGun'].includes(unit.def?.type);
  const targetY =
    center +
    terrainClearance(unit.def?.type) +
    Math.min(convexLift, vehicleLike ? 0.24 : 0.1) +
    (wreckPose?.lift ?? 0);
  const alpha = 1 - Math.exp(-Math.max(0, dt) * (unit.moveTarget ? 12 : 7));
  // Movement stepping snaps to center-ground every substep, so apply the full
  // footprint correction while moving; stationary settling remains smoothed.
  mesh.position.y = unit.moveTarget
    ? targetY
    : THREE.MathUtils.lerp(mesh.position.y, targetY, alpha);
  if (mesh.rotation.order !== 'YXZ') mesh.rotation.order = 'YXZ';
  mesh.rotation.x = THREE.MathUtils.lerp(mesh.rotation.x, targetPitch, alpha);
  mesh.rotation.z = THREE.MathUtils.lerp(mesh.rotation.z, targetRoll, alpha);
}

/** Horizontal distance from a unit to a move goal (x/z only). */
export function horizontalDistToPoint(unit, dest) {
  const dx = dest.x - unit.position.x;
  const dz = dest.z - unit.position.z;
  return Math.hypot(dx, dz);
}

/**
 * True when the unit has reached a ground move order on sloped terrain
 * (requires both horizontal closeness and matching ground height).
 */
export function hasReachedMoveDest(
  unit,
  dest,
  mapDef,
  horizThresh = 2.4,
  heightThresh = 3.2,
  { horizOnly = false } = {}
) {
  if (!dest || !mapDef) return false;
  const horiz = horizontalDistToPoint(unit, dest);
  if (horiz >= horizThresh) return false;
  if (horizOnly) return true;
  const destY = sampleUnitTerrainHeight(unit, dest.x, dest.z, mapDef);
  const heightGap = Math.abs(unit.position.y - destY);
  return heightGap < heightThresh;
}

function clearCanalMoveRoute(unit) {
  unit._urbanCanalRoute = null;
}

function cancelMoveAtWaterEdge(unit) {
  unit.moveTarget = null;
  unit._movePath = null;
  unit._userMoveOrder = false;
  unit._reverseMoveOrder = false;
  clearCanalMoveRoute(unit);
}

/** Route all ground units over an urban bridge and stop orders placed directly in water. */
function resolveUrbanCanalMoveTarget(unit, dest, mapDef, cfg) {
  const canal = getUrbanCanalDefinition(mapDef);
  if (!canal) {
    clearCanalMoveRoute(unit);
    return { target: dest, blockedDestination: false };
  }

  // Use the ultimate order goal for canal decisions. Intermediate path waypoints
  // zigzagging near the canal were constantly re-routing units to bridges and
  // looked like random floating after a move order.
  const goal = unit._finalMoveGoal ?? dest;
  const vehicleMargin = isVehicleUnit(unit.def?.type) ? 0.68 : 0.22;
  const bankDistance = canal.halfWidth + vehicleMargin;
  const currentDelta = unit.position.x - canal.x;
  const goalDelta = goal.x - canal.x;
  const destDelta = dest.x - canal.x;
  const currentSide = Math.sign(currentDelta) || Math.sign(goalDelta) || 1;
  const goalOnBridge = isUrbanCanalBridge(goal.z, mapDef, -0.18);
  const destOnBridge = isUrbanCanalBridge(dest.z, mapDef, -0.18);

  // Order ends in the water — hold on the near bank.
  if (Math.abs(goalDelta) < bankDistance && !goalOnBridge) {
    clearCanalMoveRoute(unit);
    return {
      target: {
        x: canal.x + currentSide * (bankDistance - cfg.horiz + 0.12),
        z: goal.z,
      },
      blockedDestination: true,
    };
  }

  const goalSide = Math.sign(goalDelta) || currentSide;
  // Already on the goal's side of the canal: follow the normal path waypoint.
  // Do not re-route just because an intermediate cell sits near the water.
  if (currentSide === goalSide && !unit._urbanCanalRoute) {
    if (Math.abs(destDelta) < bankDistance && !destOnBridge) {
      // Intermediate waypoint in water — skip ahead to goal along this bank.
      return {
        target: {
          x: canal.x + currentSide * (bankDistance + 0.4),
          z: dest.z,
        },
        blockedDestination: false,
      };
    }
    return { target: dest, blockedDestination: false };
  }

  let route = unit._urbanCanalRoute;
  const routeChanged =
    !route ||
    Math.hypot(route.destinationX - goal.x, route.destinationZ - goal.z) > 4;
  if (routeChanged) {
    route = {
      destinationX: goal.x,
      destinationZ: goal.z,
      fromSide: currentSide,
      bridgeZ: nearestUrbanCanalBridgeZ(unit.position.z, mapDef, goal.z),
      phase: 'approach',
    };
    unit._urbanCanalRoute = route;
  }

  const approachX = canal.x + route.fromSide * bankDistance;
  if (route.phase === 'approach') {
    const approachDistance = Math.hypot(
      unit.position.x - approachX,
      unit.position.z - route.bridgeZ
    );
    if (approachDistance <= cfg.horiz + 0.2) route.phase = 'cross';
    else {
      return {
        target: { x: approachX, z: route.bridgeZ },
        blockedDestination: false,
      };
    }
  }

  const crossedToFarBank =
    (unit.position.x - canal.x) * route.fromSide < -(bankDistance - 0.18);
  if (crossedToFarBank) {
    clearCanalMoveRoute(unit);
    return { target: dest, blockedDestination: false };
  }

  return {
    target: {
      x: canal.x - route.fromSide * (bankDistance + cfg.horiz + 0.85),
      z: route.bridgeZ,
    },
    blockedDestination: false,
  };
}

/** Vehicles cannot strafe — only drive along the hull axis (forward or reverse). */
function usesHullAlignedDrive(unit) {
  return isVehicleUnit(unit?.def?.type);
}

const WHEELED_ACCELERATION = 8.5;
const WHEELED_BRAKING = 12.5;
// Keep in sync with MOVING_HULL_TRAVERSE_DEG.truck. Speed is capped so the
// turning radius stays inside the remaining distance — otherwise a side
// waypoint sits at the circle's centre and the truck orbits forever.
const TRUCK_STEER_RATE = (22 * Math.PI) / 180;
const TRUCK_UTURN_MIN_DIST = 7;

function getTowingSpeedMultiplier(unit) {
  if (!unit?._towedGunId) return 1;
  if (unit._towedGunType === 'artillery') return 0.52;
  if (unit._towedGunType === 'antiTankGun') return 0.68;
  return 0.6;
}

function approachValue(current, target, maxDelta) {
  if (current < target) return Math.min(target, current + maxDelta);
  return Math.max(target, current - maxDelta);
}

function getWheeledDriveSpeed(unit, targetSpeed, dt) {
  if (!isWheeledVehicle(unit.def?.type)) return targetSpeed;

  const currentSpeed = Number.isFinite(unit._driveSpeed)
    ? Math.max(0, unit._driveSpeed)
    : 0;
  const rate = targetSpeed >= currentSpeed
    ? WHEELED_ACCELERATION
    : WHEELED_BRAKING;
  unit._driveSpeed = approachValue(
    currentSpeed,
    Math.max(0, targetSpeed),
    rate * Math.max(0, dt)
  );
  return unit._driveSpeed;
}

/**
 * Move one step toward dest, snapping Y to terrain. Returns false if already there.
 * Vehicles turn the hull toward the travel direction and only roll along that axis
 * (no sideways sliding). Infantry may still step freely.
 */
export function advanceUnitOnTerrain(unit, dest, mapDef, dt, options = {}) {
  if (!dest || !mapDef) {
    if (isWheeledVehicle(unit.def?.type)) unit._driveSpeed = 0;
    return false;
  }

  const cfg = getMoveReachConfig(unit.def?.type);
  const horizReach = options.horizReach ?? cfg.horiz;
  const canalMove = resolveUrbanCanalMoveTarget(unit, dest, mapDef, cfg);
  const movementDest = canalMove.target;
  if (hasReachedMoveDest(unit, movementDest, mapDef, horizReach, cfg.height)) {
    if (isWheeledVehicle(unit.def?.type)) unit._driveSpeed = 0;
    if (canalMove.blockedDestination) cancelMoveAtWaterEdge(unit);
    return false;
  }

  const destY = sampleUnitTerrainHeight(
    unit,
    movementDest.x,
    movementDest.z,
    mapDef
  );
  const substeps = cfg.substeps;
  const subDt = dt / substeps;
  const hullDrive = usesHullAlignedDrive(unit);
  const reversing =
    unit._reverseMoveOrder &&
    !unit.retreating &&
    canUseTacticalReverse(unit.def?.type);
  const reverseSpeedMultiplier = reversing ? 0.55 : 1;
  const truck = isTruckType(unit.def?.type);
  // How aligned the hull must be before committing full drive speed.
  // Trucks need a tighter heading before they open the throttle.
  const alignDotMin = reversing ? -0.82 : truck ? 0.9 : 0.78;

  for (let s = 0; s < substeps; s++) {
    if (hasReachedMoveDest(unit, movementDest, mapDef, horizReach, cfg.height)) {
      if (isWheeledVehicle(unit.def?.type)) unit._driveSpeed = 0;
      if (canalMove.blockedDestination) cancelMoveAtWaterEdge(unit);
      return false;
    }

    const dx = movementDest.x - unit.position.x;
    const dz = movementDest.z - unit.position.z;
    const horiz = Math.hypot(dx, dz);
    if (horiz < 0.001) {
      if (isWheeledVehicle(unit.def?.type)) unit._driveSpeed = 0;
      return false;
    }

    const nx = dx / horiz;
    const nz = dz / horiz;
    const uphill = destY - unit.position.y;

    // Desired travel yaw: reverse orders keep the nose pointed away from dest.
    const desiredNx = reversing ? -nx : nx;
    const desiredNz = reversing ? -nz : nz;

    let turnDelta = 0;
    if (hullDrive && unit.mesh && !unit._mobilityDamaged) {
      const currentYaw = unit.mesh.rotation.y ?? 0;
      const desiredYaw = Math.atan2(desiredNx, desiredNz);
      turnDelta = Math.abs(
        Math.atan2(
          Math.sin(desiredYaw - currentYaw),
          Math.cos(desiredYaw - currentYaw)
        )
      );
      faceUnitTowardMovement(unit, desiredNx, desiredNz, subDt, {
        // Trucks steer on the roll — never tank-pivot for a large heading change.
        stationaryTurn: !truck && isTankType(unit.def?.type) && turnDelta > 0.5,
      });
    } else if (!hullDrive) {
      faceUnitTowardMovement(unit, nx, nz, subDt);
    }

    const yaw = unit.mesh?.rotation?.y ?? Math.atan2(nx, nz);
    const fwdX = Math.sin(yaw);
    const fwdZ = Math.cos(yaw);
    // Projection of desired travel onto hull forward (negative = reverse).
    const forwardDot = nx * fwdX + nz * fwdZ;
    const drive = reversing
      ? Math.min(0, forwardDot)
      : Math.max(0, forwardDot);
    // Only crawl a U-turn when the waypoint is far enough that the arc can
    // finish. A nearby side click would otherwise become a permanent orbit.
    const farUTurn = truck && !reversing && horiz > TRUCK_UTURN_MIN_DIST && forwardDot < 0.2;
    const truckCommitted = reversing
      ? Math.abs(drive) > 0.12
      : drive > 0.18 || farUTurn;

    if (horiz < cfg.horiz * 0.9) {
      const groundY = sampleUnitTerrainHeight(
        unit,
        unit.position.x,
        unit.position.z,
        mapDef
      );
      unit.position.y = groundY + (destY - groundY) * Math.min(1, subDt * 5);
      if (Math.abs(unit.position.y - destY) < 0.4 && horiz < horizReach) return false;
      // Final creep: only along the hull axis so vehicles don't slide in.
      const creepDot = truck ? 0.28 : 0.55;
      if (horiz > 0.08 && (!hullDrive || Math.abs(forwardDot) > creepDot)) {
        const axisX = hullDrive ? fwdX * Math.sign(forwardDot || 1) : nx;
        const axisZ = hullDrive ? fwdZ * Math.sign(forwardDot || 1) : nz;
        const creep = Math.min(
          horiz,
          unit.def.speed * reverseSpeedMultiplier * subDt * 0.45
        );
        unit.position.x += axisX * creep;
        unit.position.z += axisZ * creep;
        unit.position.y = sampleUnitTerrainHeight(
          unit,
          unit.position.x,
          unit.position.z,
          mapDef
        );
      }
      continue;
    }

    // Turn-in-place when the hull is badly misaligned — no crab-walk.
    // Trucks may crawl a distant U-turn, but they still pause near a waypoint
    // so they steer onto it instead of circling it.
    if (hullDrive && !unit._mobilityDamaged && !(truck && truckCommitted)) {
      const aligned = reversing
        ? forwardDot <= alignDotMin
        : forwardDot >= alignDotMin;
      if (!aligned) {
        // Nudge slowly only if mostly forward/back already; otherwise pure turn.
        if (Math.abs(forwardDot) < 0.35) {
          if (isWheeledVehicle(unit.def?.type)) unit._driveSpeed = 0;
          continue;
        }
      }
    }

    let targetSpeed = unit.def.speed * reverseSpeedMultiplier * getTowingSpeedMultiplier(unit);
    if (uphill > 2) targetSpeed *= 0.58;
    else if (uphill > 0.6) targetSpeed *= 0.78;
    else if (uphill < -1.5) targetSpeed *= 1.05;

    if (hullDrive) {
      // Drive along hull forward; scale by alignment so sharp turns slow naturally.
      const alignScale = truck
        ? Math.max(0, Math.min(1, (Math.abs(drive) - 0.42) / 0.58))
        : isWheeledVehicle(unit.def?.type)
          ? Math.max(0, Math.min(1, (Math.abs(drive) - 0.2) / 0.8))
          : Math.max(0, Math.min(1, (Math.abs(drive) - 0.35) / 0.55));
      const turnSpeedScale = truck
        ? 0.26 + 0.74 * alignScale * alignScale
        : isWheeledVehicle(unit.def?.type)
          ? 0.18 + 0.82 * alignScale * alignScale
          : 0.15 + 0.85 * alignScale;
      targetSpeed *= turnSpeedScale;
      if (truck && turnDelta > 0.18) {
        const maxTurnSpeed = TRUCK_STEER_RATE * Math.max(1.25, horiz * 0.55);
        targetSpeed = Math.min(targetSpeed, maxTurnSpeed);
        if ((unit._driveSpeed ?? 0) > maxTurnSpeed) unit._driveSpeed = maxTurnSpeed;
      }
      const speed = getWheeledDriveSpeed(unit, targetSpeed, subDt) * subDt;
      const step = Math.min(speed, horiz);
      const sign = drive < 0 || reversing ? -1 : 1;
      const roll = truck
        ? truckCommitted && step > 0.001
        : Math.abs(drive) > 0.25 && step > 0.001;
      if (roll) {
        const rollSign = farUTurn ? 1 : sign;
        unit.position.x += fwdX * rollSign * step;
        unit.position.z += fwdZ * rollSign * step;
        unit.position.y = sampleUnitTerrainHeight(
          unit,
          unit.position.x,
          unit.position.z,
          mapDef
        );
      }
    } else {
      const step = Math.min(targetSpeed * subDt, horiz);
      unit.position.x += nx * step;
      unit.position.z += nz * step;
      unit.position.y = sampleUnitTerrainHeight(
        unit,
        unit.position.x,
        unit.position.z,
        mapDef
      );
    }
  }

  return true;
}
