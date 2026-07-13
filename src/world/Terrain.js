import * as THREE from 'three';
import { getMoveReachConfig } from '../units/VehicleTypes.js';
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
  const normalTex = createNormalMap();
  const roughTex = createRoughnessMap(mapDef);
  const aoTex = createAOMap(mapDef);

  const groundMat = new THREE.MeshStandardMaterial({
    map: colorTex,
    normalMap: normalTex,
    roughnessMap: roughTex,
    aoMap: aoTex,
    aoMapIntensity: 0.85,
    normalScale: new THREE.Vector2(0.75, 0.75),
    vertexColors: true,
    roughness: 0.82,
    metalness: 0.04,
    envMapIntensity: 0.65,
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

function addDecorations(mapDef, scene, size, seed, scenery) {
  const trunkMat = new THREE.MeshStandardMaterial({
    color: 0x4a3528,
    roughness: 0.92,
    envMapIntensity: 0.45,
  });
  const leafMat = new THREE.MeshStandardMaterial({
    color: 0x2d5a28,
    roughness: 0.78,
    emissive: 0x1a3018,
    emissiveIntensity: 0.12,
    envMapIntensity: 0.35,
  });
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x6a6558,
    roughness: 0.75,
    metalness: 0.12,
    envMapIntensity: 0.5,
  });
  const bushMat = new THREE.MeshStandardMaterial({
    color: 0x3d6b32,
    roughness: 0.88,
    envMapIntensity: 0.4,
  });
  const darkLeafMat = new THREE.MeshStandardMaterial({
    color: mapDef.terrain === 'steppe' ? 0x485f2f : 0x23441f,
    roughness: 0.84,
    envMapIntensity: 0.34,
  });
  const dryBushMat = new THREE.MeshStandardMaterial({
    color: mapDef.terrain === 'desert' ? 0x8a744f : 0x5b6738,
    roughness: 0.92,
    envMapIntensity: 0.32,
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
      const g = createTreeGroup(trunkMat, leafMat, darkLeafMat, mapDef.terrain);
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
    const g = createBushGroup(mapDef.terrain === 'desert' ? dryBushMat : bushMat, dryBushMat);
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
      const g = createHedgeGroup(hedgeMat, bushMat);
      g.position.set(hx, hy, hz);
      g.rotation.y = mapRandom() * Math.PI;
      if (scenery) scenery.register(g, { x: hx, z: hz, kind: 'hedge', source: 'map' });
      else scene.add(g);
    }
  }

  addFarmClusters(mapDef, scene, size, seed, scenery);
  addTerrainClutter(mapDef, scene, size, seed, scenery);
}

function createTreeGroup(trunkMat, leafMat, darkLeafMat, terrain) {
  const g = new THREE.Group();
  const height = terrain === 'hills' ? 2.6 + mapRandom() * 1.3 : 2.1 + mapRandom() * 1.1;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.24, height, 9), trunkMat);
  trunk.position.y = height * 0.5;
  trunk.rotation.z = (mapRandom() - 0.5) * 0.12;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  g.add(trunk);

  const crownCount = terrain === 'steppe' ? 3 : 4;
  for (let i = 0; i < crownCount; i++) {
    const crown = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.68 + mapRandom() * 0.35, 2),
      i % 2 ? darkLeafMat : leafMat
    );
    const side = i - (crownCount - 1) * 0.5;
    crown.position.set(side * 0.24 + (mapRandom() - 0.5) * 0.25, height + 0.45 + i * 0.18, (mapRandom() - 0.5) * 0.32);
    crown.scale.set(1.05 + mapRandom() * 0.25, 0.78 + mapRandom() * 0.2, 0.95 + mapRandom() * 0.35);
    crown.rotation.set(mapRandom() * 0.35, mapRandom() * Math.PI, mapRandom() * 0.25);
    crown.castShadow = true;
    crown.receiveShadow = true;
    g.add(crown);
  }

  if (mapRandom() > 0.45) {
    const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.07, 1.05, 6), trunkMat);
    branch.position.set(0.35, height * 0.72, 0);
    branch.rotation.z = Math.PI * 0.42;
    branch.rotation.y = mapRandom() * Math.PI;
    branch.castShadow = true;
    g.add(branch);
  }
  return g;
}

function createBushGroup(bushMat, accentMat) {
  const g = new THREE.Group();
  const count = 3 + Math.floor(mapRandom() * 3);
  for (let i = 0; i < count; i++) {
    const bush = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.42 + mapRandom() * 0.28, 1),
      i === count - 1 && mapRandom() > 0.5 ? accentMat : bushMat
    );
    const ang = (i / count) * Math.PI * 2 + mapRandom() * 0.5;
    const r = mapRandom() * 0.42;
    bush.position.set(Math.cos(ang) * r, 0.28 + mapRandom() * 0.18, Math.sin(ang) * r);
    bush.scale.set(1.1 + mapRandom() * 0.45, 0.55 + mapRandom() * 0.25, 0.9 + mapRandom() * 0.35);
    bush.rotation.set(mapRandom() * 0.25, mapRandom() * Math.PI, mapRandom() * 0.2);
    bush.castShadow = true;
    bush.receiveShadow = true;
    g.add(bush);
  }
  return g;
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
  return g;
}

function createHedgeGroup(hedgeMat, bushMat) {
  const g = new THREE.Group();
  const len = 6 + mapRandom() * 5;
  const lumps = 5 + Math.floor(mapRandom() * 4);
  for (let i = 0; i < lumps; i++) {
    const hedge = new THREE.Mesh(new THREE.IcosahedronGeometry(0.76 + mapRandom() * 0.25, 1), i % 3 === 0 ? bushMat : hedgeMat);
    const t = lumps <= 1 ? 0 : i / (lumps - 1);
    hedge.position.set((t - 0.5) * len, 0.65 + mapRandom() * 0.18, (mapRandom() - 0.5) * 0.42);
    hedge.scale.set(1.35 + mapRandom() * 0.35, 0.75 + mapRandom() * 0.22, 0.72 + mapRandom() * 0.22);
    hedge.rotation.set(mapRandom() * 0.28, mapRandom() * Math.PI, mapRandom() * 0.18);
    hedge.castShadow = true;
    hedge.receiveShadow = true;
    g.add(hedge);
  }
  return g;
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
  body.position.y = h * 0.5;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.58, 1.05, 4), local.roof);
  roof.position.y = h + 0.48;
  roof.rotation.y = Math.PI * 0.25;
  roof.scale.set(w > d ? 1.2 : 1, 0.78, d > w ? 1.15 : 0.9);
  roof.castShadow = true;
  roof.receiveShadow = true;
  g.add(roof);

  const door = new THREE.Mesh(new THREE.BoxGeometry(w * 0.2, h * 0.48, 0.08), local.timber);
  door.position.set(-w * 0.2, h * 0.24, d * 0.51);
  door.castShadow = true;
  g.add(door);

  if (!isOutbuilding) {
    for (const sx of [-0.32, 0.32]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.36, 0.07), local.window);
      win.position.set(w * sx, h * 0.62, d * 0.515);
      g.add(win);
    }
  }

  if (kind === 'farmHouse') {
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.88, 0.36), local.stone);
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
        const creep = Math.min(horiz, unit.def.speed * subDt * 0.45);
        unit.position.x += (dx / horiz) * creep;
        unit.position.z += (dz / horiz) * creep;
        unit.position.y = sampleTerrainHeight(unit.position.x, unit.position.z, mapDef);
        faceUnitTowardMovement(unit, dx / horiz, dz / horiz, subDt);
      }
      continue;
    }

    let speed = unit.def.speed * subDt;
    if (uphill > 2) speed *= 1.5;
    else if (uphill > 0.6) speed *= 1.25;
    else if (uphill < -1.5) speed *= 0.92;

    const nx = dx / horiz;
    const nz = dz / horiz;
    const step = Math.min(speed, horiz);

    unit.position.x += nx * step;
    unit.position.z += nz * step;
    unit.position.y = sampleTerrainHeight(unit.position.x, unit.position.z, mapDef);
    faceUnitTowardMovement(unit, nx, nz, subDt);
  }

  return true;
}
