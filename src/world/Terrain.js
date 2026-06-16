import * as THREE from 'three';
import { getMoveReachConfig } from '../units/VehicleTypes.js';
import { faceUnitTowardMovement } from '../units/VehicleRotation.js';
import {
  createAOMap,
  createGroundTexture,
  createNormalMap,
  createRoughnessMap,
} from './proceduralTextures.js';

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

  addDecorations(mapDef, scene, size, seed, scenery);

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

  const decorScale = mapDef.sizeScale ?? 1;
  const baseCount = mapDef.terrain === 'desert' ? 22 : mapDef.terrain === 'bocage' ? 75 : 55;
  const count = Math.round(baseCount * decorScale * (decorScale > 1 ? 1.15 : 1));

  const centerExclusionX = 14 * decorScale;
  const centerExclusionZ = 10 * decorScale;

  for (let i = 0; i < count; i++) {
    const x = (Math.random() - 0.5) * size * 0.82;
    const z = (Math.random() - 0.5) * size * 0.82;
    if (Math.abs(x) < centerExclusionX && Math.abs(z) < centerExclusionZ) continue;

    const y = heightAt(x, z, mapDef, seed);

    if (mapDef.terrain === 'desert') {
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.55 + Math.random() * 0.9, 2),
        rockMat
      );
      const g = new THREE.Group();
      g.position.set(x, y, z);
      rock.position.y = 0.35;
      rock.rotation.set(Math.random(), Math.random(), Math.random());
      rock.scale.set(1.2, 0.7 + Math.random() * 0.5, 1);
      rock.castShadow = true;
      rock.receiveShadow = true;
      g.add(rock);
      if (scenery) scenery.register(g, { x, z, kind: 'rock' });
      else scene.add(g);
    } else {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 1.5, 8), trunkMat);
      trunk.position.y = 0.75;
      trunk.castShadow = true;
      const crown = new THREE.Mesh(
        new THREE.ConeGeometry(0.75 + Math.random() * 0.45, 2.6, 10),
        leafMat
      );
      crown.position.y = 2.45;
      crown.castShadow = true;
      g.add(trunk, crown);
      if (scenery) scenery.register(g, { x, z, kind: 'tree' });
      else scene.add(g);
    }
  }

  const bushCount = Math.round((mapDef.terrain === 'bocage' ? 40 : 28) * decorScale * (decorScale > 1 ? 1.1 : 1));
  for (let i = 0; i < bushCount; i++) {
    const x = (Math.random() - 0.5) * size * 0.78;
    const z = (Math.random() - 0.5) * size * 0.78;
    if (Math.abs(x) < 12 && Math.abs(z) < 8) continue;
    const y = heightAt(x, z, mapDef, seed);
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const bush = new THREE.Mesh(new THREE.SphereGeometry(0.55 + Math.random() * 0.35, 6, 6), bushMat);
    bush.scale.y = 0.65;
    bush.position.y = 0.35;
    bush.castShadow = true;
    g.add(bush);
    if (scenery) scenery.register(g, { x, z, kind: 'bush' });
    else scene.add(g);
  }

  if (mapDef.terrain === 'bocage') {
    const hedgeMat = new THREE.MeshStandardMaterial({
      color: 0x3a5a32,
      roughness: 0.86,
      envMapIntensity: 0.4,
    });
    for (let i = 0; i < 32; i++) {
      const hx = (Math.random() - 0.5) * size * 0.55;
      const hz = (Math.random() - 0.5) * size * 0.55;
      const hy = heightAt(hx, hz, mapDef, seed);
      const g = new THREE.Group();
      g.position.set(hx, hy, hz);
      const hedge = new THREE.Mesh(new THREE.BoxGeometry(7 + Math.random() * 4, 1.5, 1), hedgeMat);
      hedge.position.y = 0.75;
      hedge.rotation.y = Math.random() * Math.PI;
      hedge.castShadow = true;
      hedge.receiveShadow = true;
      g.add(hedge);
      if (scenery) scenery.register(g, { x: hx, z: hz, kind: 'hedge' });
      else scene.add(g);
    }
  }
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