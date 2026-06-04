import * as THREE from 'three';
import {
  mat,
  buildFactionVehicle,
  buildFactionInfantry,
  buildFactionMG,
  buildFactionMortar,
  buildFactionSniper,
} from './FactionMeshes.js';
import { isTankType } from './VehicleTypes.js';

export { mat };

export function createUnitMesh(type, teamColor, accentColor, factionId = 'germany') {
  const group = new THREE.Group();
  const body = mat(teamColor, { rough: 0.72 });
  const detail = mat(accentColor, { metal: 0.4, rough: 0.55 });
  const dark = mat(0x1a1a1a, { metal: 0.5 });

  let built = false;

  if (type === 'tank' || type === 'superHeavyTank' || type === 'armoredCar' || type === 'artillery') {
    built = buildFactionVehicle(group, type, factionId, body, detail, dark);
  } else if (type === 'machineGun') {
    buildFactionMG(group, body, detail, dark, factionId);
    built = true;
  } else if (type === 'mortar') {
    buildFactionMortar(group, body, detail, dark, factionId);
    built = true;
  } else if (type === 'infantry') {
    buildFactionInfantry(group, body, dark, factionId);
    built = true;
  } else if (type === 'sniper') {
    buildFactionSniper(group, body, detail, dark, factionId);
    built = true;
  }

  if (!built) {
    console.warn('Unknown unit type for mesh:', type);
    group.userData.hitRadius = 2;
  }

  group.traverse((c) => {
    if (c.isMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });

  const hitRadii = {
    infantry: 1.6,
    machineGun: 2,
    sniper: 1.5,
    mortar: 2.2,
    armoredCar: group.userData.hitRadius ?? 2.6,
    tank: group.userData.hitRadius ?? 3.2,
    superHeavyTank: group.userData.hitRadius ?? 3.5,
    artillery: group.userData.hitRadius ?? 2.4,
  };
  const hitR = hitRadii[type] ?? group.userData.hitRadius ?? 2;
  const hitbox = new THREE.Mesh(
    new THREE.SphereGeometry(hitR, 10, 10),
    new THREE.MeshBasicMaterial({ visible: false, depthWrite: false })
  );
  const hitY = {
    tank: 1.1,
    superHeavyTank: 1.25,
    armoredCar: 0.85,
    artillery: 0.95,
    machineGun: 0.55,
    mortar: 0.65,
    sniper: 0.5,
    infantry: 0.55,
  };
  hitbox.position.y = hitY[type] ?? 0.55;
  hitbox.name = 'selectionHitbox';
  group.add(hitbox);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(hitR * 0.45, hitR * 0.52, 32),
    new THREE.MeshBasicMaterial({
      color: 0x4ade80,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = isTankType(type) || type === 'armoredCar' ? 0.25 : 0.1;
  ring.name = 'selectionRing';
  group.add(ring);

  const targetRing = new THREE.Mesh(
    new THREE.RingGeometry(hitR * 0.58, hitR * 0.68, 32),
    new THREE.MeshBasicMaterial({
      color: 0xff4444,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthTest: false,
    })
  );
  targetRing.rotation.x = -Math.PI / 2;
  targetRing.position.y = isTankType(type) || type === 'armoredCar' ? 0.28 : 0.12;
  targetRing.renderOrder = 10;
  targetRing.name = 'targetHighlightRing';
  group.add(targetRing);

  group.userData.type = type;
  group.userData.factionId = factionId;
  if (isTankType(type) && !group.userData.isTank) group.userData.isTank = true;
  return group;
}

export function setSelectionRing(mesh, visible) {
  const ring = mesh.getObjectByName('selectionRing');
  if (ring) {
    ring.material.opacity = visible ? 0.9 : 0;
    ring.material.color.setHex(visible ? 0x4ade80 : 0x4ade80);
  }
}

export function setTargetHighlight(mesh, visible, engaged = false) {
  const ring = mesh.getObjectByName('targetHighlightRing');
  if (ring) {
    ring.material.opacity = visible ? (engaged ? 0.75 : 0.95) : 0;
    ring.material.color.setHex(engaged ? 0xff8800 : 0xff3333);
  }
}

const WRECK_SKIP_MESHES = new Set(['selectionRing', 'targetHighlightRing', 'selectionHitbox']);
const WRECK_REMOVED_PARTS = new Set(['turret', 'barrel', 'mantlet']);

function hideUnitChrome(mesh) {
  setSelectionRing(mesh, false);
  setTargetHighlight(mesh, false);
  mesh.traverse((child) => {
    if (WRECK_SKIP_MESHES.has(child.name)) child.visible = false;
  });
}

function darkenCorpseMesh(child, factor = 0.34) {
  if (!child.isMesh || WRECK_SKIP_MESHES.has(child.name)) return;
  const src = child.material;
  if (!src) return;
  const corpseMat = src.clone();
  if (corpseMat.color) corpseMat.color.multiplyScalar(factor);
  corpseMat.emissive?.setHex?.(0x000000);
  corpseMat.emissiveIntensity = 0;
  corpseMat.metalness = 0.05;
  corpseMat.roughness = 0.98;
  child.material = corpseMat;
}

function addGroundStain(mesh, spread = 2.4) {
  const stainMat = new THREE.MeshBasicMaterial({
    color: 0x1a0806,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const stain = new THREE.Mesh(new THREE.PlaneGeometry(spread, spread * 0.85), stainMat);
  stain.rotation.x = -Math.PI / 2;
  stain.position.y = 0.04;
  stain.renderOrder = 1;
  stain.name = 'corpseStain';
  mesh.add(stain);
}

function isWeaponMesh(child) {
  const p = child.geometry?.parameters;
  if (!p || p.height == null) return false;
  return p.height < 0.12 && (p.width ?? 0) > 0.2;
}

/** Fallen squad / soldier — bodies on the ground, weapons dropped. */
export function applyInfantryCorpseLook(mesh) {
  if (!mesh || mesh.userData.corpseApplied) return;
  mesh.userData.corpseApplied = true;
  hideUnitChrome(mesh);

  const yaw = (Math.random() - 0.5) * 0.55;
  mesh.rotation.y += yaw;
  mesh.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.12;
  mesh.rotation.z = (Math.random() - 0.5) * 0.2;
  mesh.position.y = 0.1;

  for (const child of mesh.children) {
    if (!(child instanceof THREE.Group)) continue;
    child.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.35;
    child.rotation.z += (Math.random() - 0.5) * 0.45;
    child.position.y = 0.04 + Math.random() * 0.06;
    child.traverse((part) => {
      if (!part.isMesh) return;
      if (isWeaponMesh(part)) {
        part.visible = false;
        return;
      }
      darkenCorpseMesh(part, 0.38);
    });
  }

  mesh.traverse((child) => {
    if (!child.isMesh || WRECK_SKIP_MESHES.has(child.name) || child.name === 'corpseStain') return;
    if (isWeaponMesh(child)) child.visible = false;
    else darkenCorpseMesh(child, 0.36);
  });

  addGroundStain(mesh, mesh.userData.type === 'infantry' ? 2.6 : 1.8);
}

/** Knocked-out vehicles (armored car, artillery, mortar) — no live unit chrome. */
export function applyVehicleCorpseLook(mesh, { heavy = false } = {}) {
  if (!mesh || mesh.userData.corpseApplied) return;
  mesh.userData.corpseApplied = true;
  hideUnitChrome(mesh);

  mesh.rotation.x += (Math.random() - 0.5) * (heavy ? 0.18 : 0.28);
  mesh.rotation.z += (Math.random() - 0.5) * (heavy ? 0.22 : 0.32);
  mesh.position.y -= heavy ? 0.12 : 0.2;

  mesh.traverse((child) => {
    if (!child.isMesh || WRECK_SKIP_MESHES.has(child.name)) return;
    const part = child.userData.tankPart;
    if (part === 'barrel' || part === 'mantlet') {
      child.visible = false;
      return;
    }
    darkenCorpseMesh(child, heavy ? 0.28 : 0.32);
  });

  addGroundStain(mesh, heavy ? 3.2 : 2.4);
}

/** Apply corpse / wreck visuals and linger timers when a unit dies. */
export function applyUnitDeathVisual(unit) {
  const mesh = unit?.mesh;
  const type = unit?.def?.type;
  if (!mesh || !type || mesh.userData.deathVisualApplied) return;
  mesh.userData.deathVisualApplied = true;

  hideUnitChrome(mesh);

  if (isTankType(type)) {
    unit.wreckTimeLeft = 10;
    applyTankWreckLook(mesh);
    return;
  }

  if (type === 'infantry' || type === 'machineGun' || type === 'sniper' || type === 'mortar') {
    unit.corpseTimeLeft = type === 'infantry' ? 14 : 11;
    applyInfantryCorpseLook(mesh);
    return;
  }

  if (type === 'armoredCar') {
    unit.corpseTimeLeft = 9;
    unit.wreckTimeLeft = 0;
    applyVehicleCorpseLook(mesh, { heavy: false });
    return;
  }

  if (type === 'artillery') {
    unit.corpseTimeLeft = 10;
    applyVehicleCorpseLook(mesh, { heavy: true });
  }
}

export function unitHasCorpseLinger(unit) {
  if (!unit?.dead) return false;
  if (isTankType(unit.def?.type)) return unit.wreckTimeLeft > 0;
  return (unit.corpseTimeLeft ?? 0) > 0;
}

/** Scorched, knocked-out look for destroyed tanks left on the field. */
export function applyTankWreckLook(mesh) {
  if (!mesh?.userData?.isTank || mesh.userData.wreckApplied) return;
  mesh.userData.wreckApplied = true;

  const char = mat(0x1a1510, { rough: 0.95, emissive: 0x220800, emissiveIntensity: 0.35 });
  const burn = mat(0x0d0a08, { rough: 1, emissive: 0x331100, emissiveIntensity: 0.2 });
  const brokenSide = Math.random() > 0.5 ? 1 : -1;

  mesh.traverse((child) => {
    if (!child.isMesh || WRECK_SKIP_MESHES.has(child.name)) return;

    const part = child.userData.tankPart;
    if (WRECK_REMOVED_PARTS.has(part)) {
      child.visible = false;
      return;
    }

    const src = child.material;
    if (!src) return;

    const wreckMat = (part === 'hull' ? char : burn).clone();
    if (src.color) wreckMat.color.copy(src.color).multiplyScalar(0.22);
    wreckMat.metalness = 0.08;
    wreckMat.roughness = 0.98;
    child.material = wreckMat;

    if (part === 'track') {
      const side = Math.sign(child.position.x) || brokenSide;
      if (side === brokenSide) {
        child.rotation.z += side * (0.42 + Math.random() * 0.28);
        child.position.y -= 0.14 + Math.random() * 0.1;
        child.position.x += side * 0.1;
      }
    }
  });

  mesh.rotation.x += (Math.random() - 0.5) * 0.22;
  mesh.rotation.z += (Math.random() - 0.5) * 0.28;
  mesh.position.y -= 0.18;

  const scorchMat = new THREE.MeshBasicMaterial({
    color: 0x0a0806,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });
  for (const [sx, sz, rot, sx2, sz2] of [
    [0.4, 0.2, 0.2, 2.8, 3.6],
    [-0.6, -0.5, -0.4, 2.2, 2.8],
    [0.2, -1.1, 0.8, 1.6, 2.2],
  ]) {
    const mark = new THREE.Mesh(new THREE.PlaneGeometry(sx2, sz2), scorchMat);
    mark.rotation.x = -Math.PI / 2;
    mark.rotation.z = rot;
    mark.position.set(sx, 0.06, sz);
    mark.renderOrder = 2;
    mesh.add(mark);
  }

  const holeMat = new THREE.MeshBasicMaterial({ color: 0x050403, roughness: 1 });
  for (let i = 0; i < 4; i++) {
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.18 + Math.random() * 0.22, 8), holeMat);
    hole.rotation.x = -Math.PI / 2;
    hole.position.set((Math.random() - 0.5) * 2, 0.78 + Math.random() * 0.35, (Math.random() - 0.5) * 2.8);
    mesh.add(hole);
  }

  const debrisMat = mat(0x2a2218, { rough: 1 });
  for (let i = 0; i < 6; i++) {
    const chunk = new THREE.Mesh(
      new THREE.BoxGeometry(0.15 + Math.random() * 0.25, 0.08, 0.12 + Math.random() * 0.2),
      debrisMat
    );
    chunk.position.set((Math.random() - 0.5) * 2.8, 0.12, (Math.random() - 0.5) * 3.2);
    chunk.rotation.set(Math.random(), Math.random(), Math.random());
    mesh.add(chunk);
  }

  const turretMat = char.clone();
  const turretHulk = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.38, 1.05), turretMat);
  turretHulk.position.set(brokenSide * 1.55, 0.22, -0.35 + (Math.random() - 0.5) * 0.5);
  turretHulk.rotation.set(0.15, brokenSide * 0.5, (Math.random() - 0.5) * 0.6);
  mesh.add(turretHulk);

  const barrelChunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.4, 8), debrisMat);
  barrelChunk.rotation.z = Math.PI / 2;
  barrelChunk.rotation.y = brokenSide * 0.8;
  barrelChunk.position.set(brokenSide * 2.1, 0.14, 0.6);
  mesh.add(barrelChunk);
}

export { spawnMuzzleFlash } from '../effects/CombatEffects.js';