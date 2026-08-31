import * as THREE from 'three';
import { sampleTerrainMeshHeight } from '../world/Terrain.js';

const GRAVITY = 12.8;
const activeCasings = [];
const settledCasings = [];
const assetCache = new Map();
const _origin = new THREE.Vector3();
const _side = new THREE.Vector3();
const _rear = new THREE.Vector3();
const _localSide = new THREE.Vector3();
const _localRear = new THREE.Vector3();
const _worldQuaternion = new THREE.Quaternion();
const SMALL_ARMS_CASE_LIMIT = 1800;
let casingClock = 0;

function casingDimensions(caliber, type, kind = null) {
  if (type === 'smallArms') {
    if (kind === 'machineGun') return { radius: 0.018, length: 0.09 };
    if (kind === 'sniperRifle') return { radius: 0.0165, length: 0.097 };
    if (kind === 'smg') return { radius: 0.015, length: 0.072 };
    return { radius: 0.016, length: 0.083 };
  }
  if (type === 'artillery') {
    if (caliber >= 120) return { radius: 0.12, length: 0.56 };
    return { radius: 0.105, length: 0.48 };
  }
  if (caliber >= 75) return { radius: 0.082, length: 0.38 };
  return { radius: 0.067, length: 0.31 };
}

function casingFinish(factionId, type) {
  if (type === 'smallArms') {
    if (factionId === 'germany') {
      return { body: 0x9a7837, rim: 0x665022, metalness: 0.76 };
    }
    if (factionId === 'russia') {
      return { body: 0x92733b, rim: 0x5f4a29, metalness: 0.72 };
    }
    return { body: 0xb88632, rim: 0x76541f, metalness: 0.78 };
  }
  if (factionId === 'germany') {
    return { body: 0x77735d, rim: 0x514f43, metalness: 0.72 };
  }
  if (factionId === 'russia') {
    return { body: 0x6c715d, rim: 0x454b3f, metalness: 0.68 };
  }
  return { body: 0xb88632, rim: 0x76541f, metalness: 0.78 };
}

function assetKey(caliber, type, factionId, kind = null) {
  const size =
    type === 'smallArms'
      ? `small-${kind ?? 'rifle'}`
      : type === 'artillery'
      ? caliber >= 120
        ? 'arty-heavy'
        : 'arty'
      : caliber >= 75
        ? 'at-heavy'
        : 'at';
  const finish = factionId === 'germany' || factionId === 'russia' ? factionId : 'brass';
  return `${size}:${finish}`;
}

function getCasingAssets(caliber, type, factionId, kind = null) {
  const key = assetKey(caliber, type, factionId, kind);
  const cached = assetCache.get(key);
  if (cached) return cached;

  const dimensions = casingDimensions(caliber, type, kind);
  const finish = casingFinish(factionId, type);
  const bodyGeometry = new THREE.CylinderGeometry(
    dimensions.radius * 0.86,
    dimensions.radius,
    dimensions.length,
    10
  );
  const rimGeometry = new THREE.TorusGeometry(
    dimensions.radius * 0.9,
    dimensions.radius * 0.12,
    5,
    10
  );
  rimGeometry.rotateX(Math.PI / 2);
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: finish.body,
    metalness: finish.metalness,
    roughness: 0.34,
  });
  const rimMaterial = new THREE.MeshStandardMaterial({
    color: finish.rim,
    metalness: Math.min(1, finish.metalness + 0.08),
    roughness: 0.3,
  });
  const assets = {
    ...dimensions,
    bodyGeometry,
    rimGeometry,
    bodyMaterial,
    rimMaterial,
  };
  assetCache.set(key, assets);
  return assets;
}

function makeCasingMesh(assets, type) {
  const group = new THREE.Group();
  group.name = type === 'smallArms' ? 'persistentSmallArmsCasing' : 'persistentShellCasing';
  group.userData.persistentShellCasing = true;
  if (type === 'smallArms') group.userData.persistentSmallArmsCasing = true;

  const body = new THREE.Mesh(assets.bodyGeometry, assets.bodyMaterial);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const rim = new THREE.Mesh(assets.rimGeometry, assets.rimMaterial);
  rim.position.y = assets.length * 0.5;
  rim.castShadow = true;
  group.add(rim);
  return group;
}

function trimSmallArmsCasings() {
  let smallArmsCount = 0;
  for (const mesh of settledCasings) {
    if (mesh.userData?.persistentSmallArmsCasing) smallArmsCount += 1;
  }
  if (smallArmsCount <= SMALL_ARMS_CASE_LIMIT) return;

  for (let index = 0; index < settledCasings.length && smallArmsCount > SMALL_ARMS_CASE_LIMIT;) {
    const mesh = settledCasings[index];
    if (!mesh.userData?.persistentSmallArmsCasing) {
      index += 1;
      continue;
    }
    mesh.parent?.remove(mesh);
    settledCasings.splice(index, 1);
    smallArmsCount -= 1;
  }
}

function pruneExpiredShellCasings(retentionSeconds) {
  const retention = Number(retentionSeconds);
  if (!Number.isFinite(retention)) return;
  const lifetime = Math.max(0, retention);

  for (let index = activeCasings.length - 1; index >= 0; index--) {
    const casing = activeCasings[index];
    const createdAt = casing.mesh.userData?.shellCasingCreatedAt ?? casingClock;
    if (casingClock - createdAt < lifetime) continue;
    casing.mesh.parent?.remove(casing.mesh);
    activeCasings.splice(index, 1);
  }

  for (let index = settledCasings.length - 1; index >= 0; index--) {
    const mesh = settledCasings[index];
    const createdAt = mesh.userData?.shellCasingCreatedAt ?? casingClock;
    if (casingClock - createdAt < lifetime) continue;
    mesh.parent?.remove(mesh);
    settledCasings.splice(index, 1);
  }
}

function spawnCasing(scene, unit, ejectionPoint, { type, kind = null, caliber = null } = {}) {
  if (!scene || !unit?.mesh) return null;
  const isSmallArms = type === 'smallArms';
  if (isSmallArms && !ejectionPoint?.isObject3D) return null;

  if (ejectionPoint?.isObject3D) {
    ejectionPoint.updateWorldMatrix(true, false);
    ejectionPoint.getWorldPosition(_origin);
    ejectionPoint.getWorldQuaternion(_worldQuaternion);
  } else {
    _origin.copy(unit.position);
    _origin.y += type === 'artillery' ? 1.05 : 0.82;
    unit.mesh.getWorldQuaternion(_worldQuaternion);
  }

  _localSide.copy(
    ejectionPoint?.userData?.casingEjectionAxis ??
      (isSmallArms ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 })
  );
  _localRear.copy(
    ejectionPoint?.userData?.casingEjectionRearAxis ??
      (isSmallArms ? { x: -1, y: 0, z: 0 } : { x: 0, y: 0, z: -1 })
  );
  _side.copy(_localSide).applyQuaternion(_worldQuaternion).setY(0).normalize();
  _rear.copy(_localRear).applyQuaternion(_worldQuaternion).setY(0).normalize();

  const assets = getCasingAssets(
    caliber ?? (type === 'artillery' ? 105 : type === 'antiTankGun' ? 75 : 8),
    type,
    unit.faction?.id,
    kind
  );
  const mesh = makeCasingMesh(assets, type);
  mesh.userData.shellCasingCreatedAt = casingClock;
  if (isSmallArms) {
    // Start just outside the ejection port so the case visibly clears the
    // receiver instead of appearing inside the weapon silhouette.
    mesh.position.copy(_origin).addScaledVector(_side, assets.radius * 1.25);
    mesh.position.y += assets.radius * 0.45;
  } else {
    mesh.position.copy(_origin);
  }
  mesh.rotation.set(
    Math.random() * Math.PI,
    Math.random() * Math.PI,
    Math.random() * Math.PI
  );
  scene.add(mesh);

  const sideSpeed = isSmallArms
    ? (kind === 'machineGun' ? 1.05 : 0.82) * (0.78 + Math.random() * 0.45)
    : (type === 'artillery' ? 2.6 : 2.15) * (0.78 + Math.random() * 0.55);
  const rearSpeed = isSmallArms
    ? (Math.random() - 0.2) * 0.52
    : (Math.random() - 0.18) * (type === 'artillery' ? 1.7 : 1.25);
  const velocity = new THREE.Vector3(
    _side.x * sideSpeed + _rear.x * rearSpeed + (Math.random() - 0.5) * 0.55,
    isSmallArms
      ? 2.25 + Math.random() * 0.9
      : (type === 'artillery' ? 3.7 : 3.15) + Math.random() * 1.35,
    _side.z * sideSpeed + _rear.z * rearSpeed + (Math.random() - 0.5) * 0.55
  );
  activeCasings.push({
    mesh,
    velocity,
    radius: assets.radius,
    spinX: (Math.random() - 0.5) * 13,
    spinY: (Math.random() - 0.5) * 10,
    spinZ: (Math.random() - 0.5) * 13,
    bounces: 0,
    smallArms: isSmallArms,
  });
  return mesh;
}

/**
 * Eject one cartridge case from a towed AT gun or field howitzer.
 * Casing lifetime follows the shared bodies/wrecks retention setting. Small-arms
 * cases also keep a separate emergency soft cap because they are much more frequent.
 */
export function spawnShellCasing(scene, unit) {
  if (!scene || !unit?.mesh) return null;
  const type = unit.def?.type;
  if (type !== 'antiTankGun' && type !== 'artillery') return null;
  return spawnCasing(scene, unit, unit.mesh.userData.shellEjectionPoint, {
    type,
    caliber: unit.def?.caliber,
  });
}

/** Eject one small-arms cartridge from an authored weapon receiver. */
export function spawnSmallArmsCasing(scene, unit, ejectionPoint, kind = 'rifle') {
  return spawnCasing(scene, unit, ejectionPoint, {
    type: 'smallArms',
    kind,
    caliber: 8,
  });
}

export function updateShellCasings(
  dt,
  mapDef,
  terrainMesh = null,
  retentionSeconds = Infinity
) {
  const step = Math.min(0.05, Math.max(0, dt));
  if (step > 0) casingClock += step;
  pruneExpiredShellCasings(retentionSeconds);
  if (step <= 0) return;

  for (let index = activeCasings.length - 1; index >= 0; index--) {
    const casing = activeCasings[index];
    casing.velocity.y -= GRAVITY * step;
    casing.mesh.position.addScaledVector(casing.velocity, step);
    casing.mesh.rotation.x += casing.spinX * step;
    casing.mesh.rotation.y += casing.spinY * step;
    casing.mesh.rotation.z += casing.spinZ * step;

    const groundY = sampleTerrainMeshHeight(
      terrainMesh,
      casing.mesh.position.x,
      casing.mesh.position.z,
      mapDef
    );
    const restingY = groundY + casing.radius * 1.05;
    if (casing.mesh.position.y > restingY) continue;

    casing.mesh.position.y = restingY;
    const impactSpeed = Math.abs(casing.velocity.y);
    if (casing.bounces < 2 && impactSpeed > 1.25) {
      casing.velocity.y = impactSpeed * (0.22 + Math.random() * 0.12);
      casing.velocity.x *= 0.62;
      casing.velocity.z *= 0.62;
      casing.spinX *= 0.68;
      casing.spinY *= 0.68;
      casing.spinZ *= 0.68;
      casing.bounces += 1;
      continue;
    }

    casing.mesh.rotation.set(
      Math.PI * 0.5 + (Math.random() - 0.5) * 0.18,
      Math.random() * Math.PI * 2,
      (Math.random() - 0.5) * 0.16
    );
    casing.mesh.updateMatrix();
    settledCasings.push(casing.mesh);
    if (casing.smallArms) trimSmallArmsCasings();
    activeCasings.splice(index, 1);
  }
}

export function clearShellCasings(scene = null) {
  for (const casing of activeCasings) casing.mesh.parent?.remove(casing.mesh);
  for (const mesh of settledCasings) mesh.parent?.remove(mesh);
  activeCasings.length = 0;
  settledCasings.length = 0;
  casingClock = 0;

  for (const assets of assetCache.values()) {
    assets.bodyGeometry.dispose();
    assets.rimGeometry.dispose();
    assets.bodyMaterial.dispose();
    assets.rimMaterial.dispose();
  }
  assetCache.clear();

  if (scene) {
    const strays = [];
    scene.traverse((object) => {
      if (object.userData?.persistentShellCasing) strays.push(object);
    });
    for (const object of strays) object.parent?.remove(object);
  }
}

export function pruneShellCasings(retentionSeconds) {
  pruneExpiredShellCasings(retentionSeconds);
}

export function getShellCasingCounts() {
  return { active: activeCasings.length, settled: settledCasings.length };
}
