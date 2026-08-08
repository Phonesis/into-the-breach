import * as THREE from 'three';
import { sampleTerrainHeight } from '../world/Terrain.js';
import { isUrbanCanalWater } from '../world/UrbanScenery.js';
import { addExplosionCrater, prewarmExplosionCraterTextures } from '../world/TerrainDamage.js';
import {
  prewarmArtilleryExplosionAssets,
  spawnArtilleryExplosion,
  spawnShellExplosion,
  spawnShellExplosionLite,
  spawnWaterImpact,
} from './CombatEffects.js';
import { createStrafeAircraftMesh } from './StrafeAircraftMesh.js';

const active = [];
const MAX_ACTIVE_WARNINGS = 2;
let artilleryAssetsWarmScheduled = false;
let artilleryAssetsWarmed = false;

function scheduleArtilleryAssetWarm(renderer) {
  if (artilleryAssetsWarmed || artilleryAssetsWarmScheduled) return;
  artilleryAssetsWarmScheduled = true;
  const run = () => {
    prewarmArtilleryExplosionAssets(renderer);
    artilleryAssetsWarmed = true;
    artilleryAssetsWarmScheduled = false;
  };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(run, { timeout: 140 });
  } else {
    requestAnimationFrame(run);
  }
}

/** Prepare lazy procedural assets across the warning window, before shells land. */
export function prewarmStrikeImpacts(renderer, mapDef, impacts, heavy = false) {
  scheduleArtilleryAssetWarm(renderer);
  prewarmExplosionCraterTextures(renderer, mapDef, impacts, heavy);
}

export function clearFireSupportEffects() {
  while (active.length) {
    const fx = active.pop();
    if (fx.group?.parent) fx.group.parent.remove(fx.group);
    fx.geometries?.forEach((g) => g.dispose());
    fx.materials?.forEach((m) => m.dispose());
  }
}

function isPlaneOffMap(fx) {
  const half = fx.mapHalf ?? 80;
  // Past the playable edge by a wing-span margin so it doesn't pop at the rim
  const margin = fx.offMapMargin ?? 18;
  const limit = half + margin;
  const { x, z } = fx.group.position;
  return Math.abs(x) > limit || Math.abs(z) > limit;
}

export function updateFireSupportEffects(dt, scene) {
  for (let i = active.length - 1; i >= 0; i--) {
    const fx = active[i];

    if (fx.type === 'plane') {
      fx.age = (fx.age ?? 0) + dt;
      fx.group.position.x += fx.velX * dt;
      fx.group.position.z += fx.velZ * dt;
      fx.group.position.y = fx.baseY + Math.sin(fx.age * 8) * 0.3;
      // Slight banking pulse + prop spin for a living fly-by
      const bank = Math.sin(fx.age * 1.6) * 0.08;
      fx.group.rotation.z = bank;
      if (fx.prop) fx.prop.rotation.z += dt * 48;

      // Stay visible until past the map edge (or a long safety timeout)
      const offMap = isPlaneOffMap(fx);
      const timedOut = fx.age >= (fx.maxAge ?? 45);
      if (offMap || timedOut) {
        if (fx.group?.parent) scene.remove(fx.group);
        fx.geometries?.forEach((g) => g.dispose());
        fx.materials?.forEach((m) => m.dispose());
        active.splice(i, 1);
      }
      continue;
    }

    fx.life -= dt;

    if (fx.type === 'bomb') {
      const t = 1 - Math.max(0, fx.life) / fx.maxLife;
      const fall = t * t;
      const x = fx.from.x + (fx.to.x - fx.from.x) * t;
      const z = fx.from.z + (fx.to.z - fx.from.z) * t;
      const y = fx.from.y + (fx.to.y - fx.from.y) * fall;
      fx.group.position.set(x, y, z);
      // Nose-down as it accelerates
      fx.group.rotation.x = 0.25 + fall * 1.05;
      fx.group.rotation.z = Math.sin(t * 9) * 0.04;
      if (fx.life <= 0 && !fx.impacted) {
        fx.impacted = true;
        try {
          fx.onImpact?.();
        } catch {
          /* impact handlers must not break the effect loop */
        }
      }
    } else if (fx.type === 'warning') {
      fx.mesh.scale.setScalar(1 + Math.sin(fx.life * 12) * 0.08);
      fx.material.opacity = 0.35 + Math.sin(fx.life * 10) * 0.2;
    } else if (fx.type === 'scorch') {
      fx.material.opacity = Math.max(0, (fx.life / fx.maxLife) * 0.65);
    }

    if (fx.life <= 0) {
      if (fx.group?.parent) scene.remove(fx.group);
      if (fx.mesh?.parent) scene.remove(fx.mesh);
      fx.geometries?.forEach((g) => g.dispose());
      fx.materials?.forEach((m) => m.dispose());
      active.splice(i, 1);
    }
  }
}

export function spawnStrikeWarning(scene, mapDef, x, z, radius, isBarrage) {
  const warningCount = active.filter((fx) => fx.type === 'warning').length;
  if (warningCount >= MAX_ACTIVE_WARNINGS) return;

  const y = sampleTerrainHeight(x, z, mapDef) + 0.2;
  const geo = new THREE.RingGeometry(radius * 0.85, radius, 32);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color: isBarrage ? 0xff4422 : 0xffaa44,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  scene.add(mesh);

  active.push({
    type: 'warning',
    mesh,
    material: mat,
    geometries: [geo],
    materials: [mat],
    life: isBarrage ? 1.2 : 2,
    maxLife: 2,
  });
}

/** Distance along a unit ray to exit an axis-aligned square [-L, L]². */
function raySquareExitT(px, pz, dx, dz, L) {
  let tExit = Infinity;
  if (dx > 1e-8) tExit = Math.min(tExit, (L - px) / dx);
  else if (dx < -1e-8) tExit = Math.min(tExit, (-L - px) / dx);
  if (dz > 1e-8) tExit = Math.min(tExit, (L - pz) / dz);
  else if (dz < -1e-8) tExit = Math.min(tExit, (-L - pz) / dz);
  if (!Number.isFinite(tExit) || tExit < 0) {
    // Already outside or parallel — push a short step outward
    return 0;
  }
  return tExit;
}

/**
 * Off-map entry point so the fighter flies in from the edge, through `throughX/Z`,
 * along (dirX, dirZ), then out the far side.
 * @returns {{ x: number, z: number, nx: number, nz: number, mapHalf: number, margin: number, approachDist: number }}
 */
export function planeFlightEntry(mapDef, throughX, throughZ, dirX, dirZ, margin = 22) {
  const mapHalf = (mapDef?.size ?? 120) * 0.5;
  const len = Math.hypot(dirX, dirZ) || 1;
  const nx = dirX / len;
  const nz = dirZ / len;
  // Back up from the through-point until past the near map edge, then add margin
  const tBack = raySquareExitT(throughX, throughZ, -nx, -nz, mapHalf) + margin;
  return {
    x: throughX - nx * tBack,
    z: throughZ - nz * tBack,
    nx,
    nz,
    mapHalf,
    margin,
    approachDist: tBack,
  };
}

/**
 * Low-poly faction fighter for strafe / bomb / airborne fly-bys.
 * Spawns off the near map edge and stays visible until past the far edge.
 * `x,z` is a through-point on the run (plane is placed off-map along -dir).
 * @param {string} [factionId]
 * @param {number} [speed]
 * @param {number} [_life] — ignored; kept for call-site compatibility
 * @returns {{ entryX: number, entryZ: number, approachDist: number, approachTime: number, speed: number }}
 */
export function spawnStrafePlane(
  scene,
  mapDef,
  x,
  z,
  dirX,
  dirZ,
  _life = 2.5,
  altitude = 22,
  factionId = 'germany',
  speed = 38
) {
  const entry = planeFlightEntry(mapDef, x, z, dirX, dirZ, 22);
  const y = sampleTerrainHeight(entry.x, entry.z, mapDef) + altitude;
  const { group, prop, geometries, materials } = createStrafeAircraftMesh(factionId);
  group.position.set(entry.x, y, entry.z);
  // Nose (+Z local) points along flight direction
  group.rotation.y = Math.atan2(entry.nx, entry.nz);
  scene.add(group);

  // Full diagonal cross + margins
  const clearDist = entry.approachDist + entry.mapHalf * 2.4 + entry.margin + 30;
  const maxAge = Math.max(14, clearDist / Math.max(1, speed) + 2);

  active.push({
    type: 'plane',
    group,
    prop,
    velX: entry.nx * speed,
    velZ: entry.nz * speed,
    baseY: y,
    age: 0,
    maxAge,
    mapHalf: entry.mapHalf,
    offMapMargin: entry.margin,
    geometries,
    materials,
  });

  return {
    entryX: entry.x,
    entryZ: entry.z,
    approachDist: entry.approachDist,
    approachTime: entry.approachDist / Math.max(1, speed),
    speed,
  };
}

/**
 * Visible free-falling GP bomb from release altitude to the strike point.
 * @param {{x:number,y:number,z:number}} from
 * @param {{x:number,y:number,z:number}} to
 * @param {() => void} [onImpact]
 */
export function spawnFallingBomb(scene, from, to, duration = 1.25, onImpact = null) {
  const group = new THREE.Group();
  group.name = 'airBomb';
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x3a4234,
    metalness: 0.42,
    roughness: 0.55,
  });
  const finMat = new THREE.MeshStandardMaterial({
    color: 0x2a2e28,
    metalness: 0.35,
    roughness: 0.6,
  });
  const noseMat = new THREE.MeshStandardMaterial({
    color: 0x8a3a1a,
    metalness: 0.3,
    roughness: 0.5,
  });

  const bodyGeo = new THREE.CylinderGeometry(0.14, 0.18, 1.15, 8);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.rotation.x = Math.PI / 2;
  group.add(body);

  const noseGeo = new THREE.ConeGeometry(0.14, 0.32, 8);
  const nose = new THREE.Mesh(noseGeo, noseMat);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = 0.72;
  group.add(nose);

  const finGeo = new THREE.BoxGeometry(0.55, 0.04, 0.28);
  for (let i = 0; i < 4; i++) {
    const fin = new THREE.Mesh(finGeo, finMat);
    fin.position.z = -0.48;
    fin.rotation.z = (i * Math.PI) / 2;
    group.add(fin);
  }

  group.position.set(from.x, from.y, from.z);
  group.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
  scene.add(group);

  active.push({
    type: 'bomb',
    group,
    from: { x: from.x, y: from.y, z: from.z },
    to: { x: to.x, y: to.y, z: to.z },
    life: duration,
    maxLife: duration,
    onImpact,
    impacted: false,
    geometries: [bodyGeo, noseGeo, finGeo],
    materials: [bodyMat, finMat, noseMat],
  });
}

/**
 * @param {'strafe'|'barrage'|'creeping'|'bomb'} kind
 * @param {{ craterRadius?: number, heavy?: boolean, minGap?: number }} [opts]
 */
export function spawnStrikeImpact(
  scene,
  mapDef,
  x,
  z,
  kind = 'barrage',
  terrainMesh = null,
  opts = {}
) {
  if (isUrbanCanalWater(x, z, mapDef)) {
    const waterScale =
      kind === 'strafe' ? 0.48 : kind === 'bomb' ? 2.4 : 1.35;
    spawnWaterImpact(scene, { x, y: 0.09, z }, waterScale);
    return;
  }
  const y = sampleTerrainHeight(x, z, mapDef);
  const pos = { x, y: y + 0.5, z };

  if (kind === 'strafe') {
    spawnShellExplosionLite(scene, pos, 'medium');
    // Cannon/MG gun-run pockmarks — smaller and shallower than shell craters,
    // but still leave a permanent scar trail along the pass.
    addExplosionCrater(scene, mapDef, x, z, 'light', terrainMesh, {
      heavy: false,
      radius: opts.craterRadius ?? 1.35,
      minGap: opts.minGap ?? 42,
    });
    return;
  }

  if (kind === 'bomb') {
    spawnShellExplosion(scene, pos, 'heavy');
    spawnArtilleryExplosion(scene, pos, 'barrage', 250);
    addExplosionCrater(scene, mapDef, x, z, 'heavy', terrainMesh, {
      heavy: true,
      radius: opts.craterRadius ?? 5.4,
      minGap: 40,
    });
    return;
  }

  spawnArtilleryExplosion(scene, pos, kind);
  addExplosionCrater(scene, mapDef, x, z, 'medium', terrainMesh, {
    heavy: false,
    radius: 3.1,
    minGap: 90,
  });
}
