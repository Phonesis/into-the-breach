import * as THREE from 'three';
import { getMoveReachConfig, isTankType } from '../units/VehicleTypes.js';
import { faceUnitTowardMovement } from '../units/VehicleRotation.js';
import {
  createAOMap,
  createGroundTexture,
  createNormalMap,
  createRoughnessMap,
} from './proceduralTextures.js';
import { createMapRandom } from './MapRandom.js';

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
  const cBase = new THREE.Color(mapDef.groundColor);
  const cVar = new THREE.Color(mapDef.groundColor2 ?? mapDef.groundColor);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    let h = heightAt(x, z, mapDef, seed);
    pos.setY(i, h);

    const slope = Math.min(1, Math.abs(h) / 6);
    const tint = 0.82 + noise2(x, z, seed + 3) * 0.18 - slope * 0.08;
    const c = cBase.clone().lerp(cVar, (h + 3) / 12);
    c.multiplyScalar(tint);
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const colorTex = createGroundTexture(mapDef);
  const normalTex = createNormalMap(mapDef);
  const roughTex = createRoughnessMap(mapDef);
  const aoTex = createAOMap(mapDef);

  const groundMat = new THREE.MeshStandardMaterial({
    map: colorTex,
    normalMap: normalTex,
    roughnessMap: roughTex,
    aoMap: aoTex,
    aoMapIntensity: 0.92,
    normalScale: new THREE.Vector2(0.92, 0.92),
    vertexColors: true,
    roughness: 0.9,
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

function heightAt(x, z, mapDef, seed) {
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
  if (terrain === 'desert') {
    return { trunk: 0x58432d, leaf: 0x7d7448, leafDark: 0x5c5836, leafLight: 0x9a8a55, bush: 0x82764a, dry: 0x9a8354, rock: 0x7b6d58, earth: 0x8a704b };
  }
  if (terrain === 'steppe') {
    return { trunk: 0x4b3829, leaf: 0x4d6533, leafDark: 0x344a29, leafLight: 0x71804a, bush: 0x637342, dry: 0x807344, rock: 0x69675a, earth: 0x66563b };
  }
  if (terrain === 'hills') {
    return { trunk: 0x4b362a, leaf: 0x425c32, leafDark: 0x293f27, leafLight: 0x68764a, bush: 0x526c3a, dry: 0x756a40, rock: 0x737066, earth: 0x5c513b };
  }
  return { trunk: 0x4a3425, leaf: 0x315b2a, leafDark: 0x1f4120, leafLight: 0x52723a, bush: 0x3f6b32, dry: 0x6d653a, rock: 0x69675d, earth: 0x55462f };
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
  leafCtx.fillStyle = '#f2f2ed';
  leafCtx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 190; i++) {
    const x = (i * 61) % 128;
    const y = (i * 43 + Math.floor(i / 7) * 19) % 128;
    const r = 1.4 + (i % 5) * 0.55;
    leafCtx.fillStyle = i % 4 === 0 ? 'rgba(105,112,91,0.24)' : 'rgba(151,158,132,0.2)';
    leafCtx.beginPath();
    leafCtx.ellipse(x, y, r * 1.55, r, (i % 9) * 0.35, 0, Math.PI * 2);
    leafCtx.fill();
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
  for (const name of ['position', 'normal', 'uv']) {
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

function consolidateGroupMeshes(group) {
  const buckets = new Map();
  for (const child of [...group.children]) {
    if (!child.isMesh || Array.isArray(child.material)) continue;
    child.updateMatrix();
    const transformed = child.geometry.clone();
    transformed.applyMatrix4(child.matrix);
    const bucket = buckets.get(child.material) ?? { geometries: [], castShadow: false, receiveShadow: false };
    bucket.geometries.push(transformed);
    bucket.castShadow ||= child.castShadow;
    bucket.receiveShadow ||= child.receiveShadow;
    buckets.set(child.material, bucket);
    group.remove(child);
    child.geometry.dispose();
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
    bumpMap: vegetationTextures.leaf,
    bumpScale: 0.045,
    roughness: 0.94,
    envMapIntensity: 0.28,
  });
  const lightLeafMat = new THREE.MeshStandardMaterial({
    color: palette.leafLight,
    map: vegetationTextures.leaf,
    bumpMap: vegetationTextures.leaf,
    bumpScale: 0.04,
    roughness: 0.92,
    envMapIntensity: 0.3,
  });
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
    bumpMap: vegetationTextures.leaf,
    bumpScale: 0.04,
    roughness: 0.94,
    envMapIntensity: 0.28,
  });
  const darkLeafMat = new THREE.MeshStandardMaterial({
    color: palette.leafDark,
    map: vegetationTextures.leaf,
    bumpMap: vegetationTextures.leaf,
    bumpScale: 0.045,
    roughness: 0.96,
    envMapIntensity: 0.24,
  });
  const dryBushMat = new THREE.MeshStandardMaterial({
    color: palette.dry,
    map: vegetationTextures.leaf,
    bumpMap: vegetationTextures.leaf,
    bumpScale: 0.035,
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
      const g = createTreeGroup(trunkMat, leafMat, darkLeafMat, lightLeafMat, mapDef.terrain);
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
      mapDef.terrain
    );
    g.position.set(x, y, z);
    g.rotation.y = mapRandom() * Math.PI * 2;
    if (scenery) scenery.register(g, { x, z, kind: 'bush', source: 'map' });
    else scene.add(g);
  }

  if (mapDef.terrain === 'bocage') {
    const hedgeMat = new THREE.MeshStandardMaterial({
      color: 0x3a5a32,
      roughness: 0.86,
      envMapIntensity: 0.4,
    });
    for (let i = 0; i < 32; i++) {
      const hx = (mapRandom() - 0.5) * size * 0.55;
      const hz = (mapRandom() - 0.5) * size * 0.55;
      const hy = heightAt(hx, hz, mapDef, seed);
      const g = createHedgeGroup(hedgeMat, bushMat, darkLeafMat, trunkMat, earthMat);
      g.position.set(hx, hy, hz);
      g.rotation.y = mapRandom() * Math.PI;
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

function createIrregularFoliageGeometry(radius, detail = 1) {
  const geometry = new THREE.IcosahedronGeometry(radius, detail);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const variation = 1 + Math.sin(x * 7.1 + y * 5.3) * 0.055 + Math.cos(z * 8.7 - y * 3.9) * 0.045;
    position.setXYZ(i, x * variation, y * variation, z * variation);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
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

function createTreeGroup(trunkMat, leafMat, darkLeafMat, lightLeafMat, terrain) {
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
    const crown = new THREE.Mesh(createIrregularFoliageGeometry(size, 1), material);
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
      createIrregularFoliageGeometry(0.28 + mapRandom() * 0.18, 1),
      i % 4 === 0 ? lightLeafMat : leafMat
    );
    outer.position.copy(end).add(new THREE.Vector3(0, 0.08 + mapRandom() * 0.2, 0));
    outer.scale.set(1.25 + mapRandom() * 0.25, 0.66 + mapRandom() * 0.2, 1.1 + mapRandom() * 0.25);
    outer.rotation.set(mapRandom() * 0.3, mapRandom() * Math.PI, mapRandom() * 0.25);
    outer.castShadow = true;
    outer.receiveShadow = true;
    g.add(outer);
  }
  return consolidateGroupMeshes(g);
}

function createBushGroup(bushMat, accentMat, twigMat, terrain) {
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
      createIrregularFoliageGeometry(0.2 + mapRandom() * (sparse ? 0.22 : 0.27), 1),
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
    createIrregularFoliageGeometry(sparse ? 0.38 : 0.5, 1),
    bushMat
  );
  baseCluster.position.y = sparse ? 0.24 : 0.32;
  baseCluster.scale.set(1.45, 0.58, 1.28);
  baseCluster.rotation.y = mapRandom() * Math.PI;
  baseCluster.castShadow = true;
  baseCluster.receiveShadow = true;
  g.add(baseCluster);
  return consolidateGroupMeshes(g);
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
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const edgeFade = Math.max(0.2, 1 - Math.abs(x) / Math.max(0.1, length * 0.5));
    const top = y > 0.2;
    pos.setXYZ(
      i,
      x + (mapRandom() - 0.5) * 0.16,
      y + (top ? mapRandom() * 0.16 * edgeFade : (mapRandom() - 0.5) * 0.035),
      z + (mapRandom() - 0.5) * 0.18 * edgeFade
    );
  }
  geo.computeVertexNormals();
  return geo;
}

function createHedgeGroup(hedgeMat, bushMat, darkLeafMat, twigMat, earthMat) {
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
      new THREE.IcosahedronGeometry(0.5 + mapRandom() * 0.24, 1),
      i % 5 === 0 ? darkLeafMat : i % 3 === 0 ? bushMat : hedgeMat
    );
    const t = lumps <= 1 ? 0 : i / (lumps - 1);
    hedge.position.set((t - 0.5) * len, 0.72 + mapRandom() * 0.22, (mapRandom() - 0.5) * 0.58);
    hedge.scale.set(1.15 + mapRandom() * 0.45, 0.72 + mapRandom() * 0.3, 0.75 + mapRandom() * 0.28);
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
  return consolidateGroupMeshes(g);
}

function createGrassClumpGeometry() {
  const vertices = [];
  const bladeCount = 7;
  for (let i = 0; i < bladeCount; i++) {
    const ang = (i / bladeCount) * Math.PI * 2;
    const radius = i === 0 ? 0 : 0.08 + (i % 3) * 0.025;
    const cx = Math.cos(ang) * radius;
    const cz = Math.sin(ang) * radius;
    const width = 0.045 + (i % 2) * 0.018;
    const height = 0.34 + (i % 4) * 0.09;
    const dx = Math.cos(ang) * width;
    const dz = Math.sin(ang) * width;
    const bendX = Math.sin(ang) * 0.07;
    const bendZ = Math.cos(ang) * 0.07;
    vertices.push(
      cx - dx, 0, cz - dz,
      cx + dx, 0, cz + dz,
      cx + bendX, height, cz + bendZ
    );
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geo.computeVertexNormals();
  return geo;
}

function addGroundCover(mapDef, scene, size, seed, palette) {
  const terrain = mapDef.terrain;
  const scale = mapDef.sizeScale ?? 1;
  const grassBase = terrain === 'desert' ? 120 : terrain === 'bocage' ? 620 : terrain === 'steppe' ? 520 : 470;
  const grassCount = Math.round(grassBase * scale * (scale > 1 ? 1.08 : 1));
  const grassGeo = createGrassClumpGeometry();
  const grassMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
    side: THREE.DoubleSide,
    envMapIntensity: 0.15,
    vertexColors: false,
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

  const stoneCount = Math.round((terrain === 'desert' ? 190 : 90) * scale);
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
  const scale = mapDef.sizeScale ?? 1;
  const count = scale >= 2.4 ? 5 : scale >= 1.7 ? 3 : 1;
  const mats = createFarmMaterials(mapDef);
  let placed = 0;

  for (let i = 0; i < count && placed < count; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const x = side * (size * (0.12 + mapRandom() * 0.24));
    const z = (mapRandom() - 0.5) * size * 0.62;
    if (isReservedMapSpace(x, z, mapDef, 20 * scale)) continue;
    addFarmCluster(mapDef, scene, seed, scenery, x, z, mapRandom() * Math.PI * 2, mats);
    placed++;
  }
  Object.values(mats).forEach((mat) => mat.dispose());
}

function createFarmMaterials(mapDef) {
  const desert = mapDef.terrain === 'desert';
  return {
    wall: new THREE.MeshStandardMaterial({ color: desert ? 0xb59666 : 0x9b8a72, roughness: 0.82, envMapIntensity: 0.35 }),
    barn: new THREE.MeshStandardMaterial({ color: desert ? 0x8f7551 : 0x7a2f25, roughness: 0.86, envMapIntensity: 0.3 }),
    roof: new THREE.MeshStandardMaterial({ color: desert ? 0x6d5943 : 0x34383a, roughness: 0.78, metalness: 0.05, envMapIntensity: 0.38 }),
    timber: new THREE.MeshStandardMaterial({ color: 0x3b2a20, roughness: 0.9, envMapIntensity: 0.25 }),
    window: new THREE.MeshStandardMaterial({ color: 0x1b2325, roughness: 0.5, metalness: 0.05, envMapIntensity: 0.6 }),
    stone: new THREE.MeshStandardMaterial({ color: 0x77705f, roughness: 0.9, envMapIntensity: 0.28 }),
  };
}

function addFarmCluster(mapDef, scene, seed, scenery, cx, cz, rot, mats) {
  const pieces = [
    { kind: 'farmHouse', x: -3.2, z: -1.4, rot: 0.05 },
    { kind: 'barn', x: 4.4, z: 1.2, rot: Math.PI * 0.5 },
    { kind: 'outbuilding', x: 0.2, z: 5.7, rot: -0.25 },
  ];

  for (const p of pieces) {
    const wx = cx + Math.cos(rot) * p.x - Math.sin(rot) * p.z;
    const wz = cz + Math.sin(rot) * p.x + Math.cos(rot) * p.z;
    const wy = heightAt(wx, wz, mapDef, seed);
    const g = createFarmBuilding(p.kind, mats);
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
    const wall = createStoneWall(mats.stone);
    wall.position.set(wx, wy, wz);
    wall.rotation.y = rot + Math.PI * 0.5;
    if (scenery) scenery.register(wall, { x: wx, z: wz, kind: 'stoneWall', source: 'map' });
    else scene.add(wall);
  }
}

function createFarmBuilding(kind, mats) {
  const g = new THREE.Group();
  const isBarn = kind === 'barn';
  const isOutbuilding = kind === 'outbuilding';
  const w = isBarn ? 5.2 : isOutbuilding ? 3.1 : 4.2;
  const d = isBarn ? 3.6 : isOutbuilding ? 2.6 : 3.4;
  const h = isBarn ? 2.7 : isOutbuilding ? 1.85 : 2.35;
  const local = {
    wall: mats.wall.clone(),
    barn: mats.barn.clone(),
    roof: mats.roof.clone(),
    timber: mats.timber.clone(),
    window: mats.window.clone(),
    stone: mats.stone.clone(),
  };

  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), isBarn ? local.barn : local.wall);
  body.name = 'buildingWall';
  body.position.y = h * 0.5;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.58, 1.05, 4), local.roof);
  roof.name = 'buildingRoof';
  roof.position.y = h + 0.48;
  roof.rotation.y = Math.PI * 0.25;
  roof.scale.set(w > d ? 1.2 : 1, 0.78, d > w ? 1.15 : 0.9);
  roof.castShadow = true;
  roof.receiveShadow = true;
  g.add(roof);

  const door = new THREE.Mesh(new THREE.BoxGeometry(w * 0.2, h * 0.48, 0.08), local.timber);
  door.name = 'buildingDoor';
  door.position.set(-w * 0.2, h * 0.24, d * 0.51);
  door.castShadow = true;
  g.add(door);

  if (!isOutbuilding) {
    for (const sx of [-0.32, 0.32]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.36, 0.07), local.window);
      win.name = 'buildingWindow';
      win.position.set(w * sx, h * 0.62, d * 0.515);
      g.add(win);
    }
  }

  if (kind === 'farmHouse') {
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.88, 0.36), local.stone);
    chimney.name = 'buildingChimney';
    chimney.position.set(w * 0.24, h + 0.75, -d * 0.12);
    chimney.castShadow = true;
    g.add(chimney);
  }

  return g;
}

function createStoneWall(mat) {
  const g = new THREE.Group();
  const localMat = mat.clone();
  for (let i = 0; i < 6; i++) {
    const block = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.55 + mapRandom() * 0.18, 0.55), localMat);
    block.position.set((i - 2.5) * 0.92, 0.28, (mapRandom() - 0.5) * 0.14);
    block.rotation.y = (mapRandom() - 0.5) * 0.08;
    block.castShadow = true;
    block.receiveShadow = true;
    g.add(block);
  }
  return g;
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

    if (mapDef.terrain !== 'desert' && roll < 0.26) {
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

function terrainPoseRadius(type) {
  switch (type) {
    case 'superHeavyTank': return 2.15;
    case 'tank': return 1.7;
    case 'armoredCar': return 1.35;
    case 'artillery': return 1.35;
    case 'antiTankGun': return 1.2;
    case 'machineGun':
    case 'mortar': return 0.72;
    default: return 0.5;
  }
}

function terrainClearance(type) {
  if (type === 'tank' || type === 'tankDestroyer' || type === 'superHeavyTank' || type === 'armoredCar') return 0.09;
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

  const center = sampleTerrainHeight(x, z, mapDef);
  const front = sampleTerrainHeight(x + forwardX * radius, z + forwardZ * radius, mapDef);
  const back = sampleTerrainHeight(x - forwardX * radius, z - forwardZ * radius, mapDef);
  const right = sampleTerrainHeight(x + rightX * radius, z + rightZ * radius, mapDef);
  const left = sampleTerrainHeight(x - rightX * radius, z - rightZ * radius, mapDef);
  const forwardSlope = (front - back) / (radius * 2);
  const rightSlope = (right - left) / (radius * 2);

  const maxTilt = ['tank', 'tankDestroyer', 'superHeavyTank', 'armoredCar', 'artillery', 'antiTankGun'].includes(unit.def?.type)
    ? 0.46
    : 0.32;
  const targetPitch = THREE.MathUtils.clamp(-Math.atan(forwardSlope), -maxTilt, maxTilt);
  const targetRoll = THREE.MathUtils.clamp(Math.atan(rightSlope), -maxTilt, maxTilt);

  // Sample the footprint corners and lift over sharp convex breaks that a
  // single center-height sample cannot represent.
  let convexLift = 0;
  for (const forwardSign of [-1, 1]) {
    for (const rightSign of [-1, 1]) {
      const sx = x + forwardX * radius * forwardSign + rightX * radius * rightSign;
      const sz = z + forwardZ * radius * forwardSign + rightZ * radius * rightSign;
      const terrainDelta = sampleTerrainHeight(sx, sz, mapDef) - center;
      const fittedDelta =
        forwardSlope * radius * forwardSign + rightSlope * radius * rightSign;
      convexLift = Math.max(convexLift, terrainDelta - fittedDelta);
    }
  }

  const vehicleLike = ['tank', 'tankDestroyer', 'superHeavyTank', 'armoredCar', 'artillery', 'antiTankGun'].includes(unit.def?.type);
  const targetY =
    center + terrainClearance(unit.def?.type) + Math.min(convexLift, vehicleLike ? 0.24 : 0.1);
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
  const destY = sampleTerrainHeight(dest.x, dest.z, mapDef);
  const heightGap = Math.abs(unit.position.y - destY);
  return heightGap < heightThresh;
}

/**
 * Move one step toward dest, snapping Y to terrain. Returns false if already there.
 * Uses a minimum step so units do not stall below steep goals.
 */
export function advanceUnitOnTerrain(unit, dest, mapDef, dt) {
  if (!dest || !mapDef) return false;

  const cfg = getMoveReachConfig(unit.def?.type);
  if (hasReachedMoveDest(unit, dest, mapDef, cfg.horiz, cfg.height)) return false;

  const destY = sampleTerrainHeight(dest.x, dest.z, mapDef);
  const substeps = cfg.substeps;
  const subDt = dt / substeps;
  const reversing =
    unit._reverseMoveOrder &&
    !unit.retreating &&
    isTankType(unit.def?.type);
  const reverseSpeedMultiplier = reversing ? 0.55 : 1;

  for (let s = 0; s < substeps; s++) {
    if (hasReachedMoveDest(unit, dest, mapDef, cfg.horiz, cfg.height)) return false;

    const dx = dest.x - unit.position.x;
    const dz = dest.z - unit.position.z;
    const horiz = Math.hypot(dx, dz);
    const uphill = destY - unit.position.y;

    if (horiz < cfg.horiz * 0.9) {
      const groundY = sampleTerrainHeight(unit.position.x, unit.position.z, mapDef);
      unit.position.y = groundY + (destY - groundY) * Math.min(1, subDt * 5);
      if (Math.abs(unit.position.y - destY) < 0.4 && horiz < cfg.horiz) return false;
      if (horiz > 0.08) {
        const creep = Math.min(
          horiz,
          unit.def.speed * reverseSpeedMultiplier * subDt * 0.45
        );
        unit.position.x += (dx / horiz) * creep;
        unit.position.z += (dz / horiz) * creep;
        unit.position.y = sampleTerrainHeight(unit.position.x, unit.position.z, mapDef);
        if (!reversing) faceUnitTowardMovement(unit, dx / horiz, dz / horiz, subDt);
      }
      continue;
    }

    let speed = unit.def.speed * reverseSpeedMultiplier * subDt;
    if (uphill > 2) speed *= 1.5;
    else if (uphill > 0.6) speed *= 1.25;
    else if (uphill < -1.5) speed *= 0.92;

    const nx = dx / horiz;
    const nz = dz / horiz;
    const step = Math.min(speed, horiz);

    unit.position.x += nx * step;
    unit.position.z += nz * step;
    unit.position.y = sampleTerrainHeight(unit.position.x, unit.position.z, mapDef);
    if (!reversing) faceUnitTowardMovement(unit, nx, nz, subDt);
  }

  return true;
}
