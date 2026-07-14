import * as THREE from 'three';
import { getInfantryMaterials } from './UnitTextures.js';
import { isInRange, isSmokeShellTarget } from '../game/Targeting.js';

const POSE_YAW = [0, 0.18, -0.14, 0.24, -0.2, 0.1, -0.26, 0.16];
const POSE_LEAN = [0, 0.04, -0.03, 0.05, -0.04, 0.02, -0.05, 0.03];

const INFANTRY_WALK_TYPES = new Set([
  'infantry',
  'paratrooper',
  'medic',
  'engineer',
  'machineGun',
  'mortar',
  'sniper',
]);

const WEAPON_POSE_TYPES = new Set(['infantry', 'paratrooper', 'sniper', 'engineer']);
const PRONE_FIRE_TYPES = new Set(['infantry', 'paratrooper', 'engineer']);
const ARMOR_TARGET_TYPES = new Set(['tank', 'superHeavyTank', 'armoredCar']);
const FOOT_MUZZLE_UNIT_TYPES = new Set([
  'infantry',
  'paratrooper',
  'sniper',
  'engineer',
  'machineGun',
  'mortar',
]);

const _muzzleTip = new THREE.Vector3();
const _mgTargetLocal = new THREE.Vector3();
const _mortarTargetLocal = new THREE.Vector3();

function tagShadow(mesh, mode) {
  mesh.userData.shadowMode = mode;
}

const _up = new THREE.Vector3(0, 1, 0);

function addSegment(parent, from, to, radius, material, radialSegments = 7) {
  const delta = new THREE.Vector3().subVectors(to, from);
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.88, radius, delta.length(), radialSegments),
    material
  );
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(_up, delta.normalize());
  parent.add(mesh);
  return mesh;
}

/** Torso + helmet + backpack cast; torso receives ground tint. Small parts skip shadows. */
export function applyInfantryShadowPolicy(group) {
  group.traverse((c) => {
    if (!c.isMesh) return;
    const mode = c.userData.shadowMode ?? 'none';
    c.castShadow = mode === 'cast';
    c.receiveShadow = mode === 'cast' || mode === 'receive';
  });
}

function addHelmet(soldier, mats, factionId, baseY, { gunner = false } = {}) {
  const y = baseY + (gunner ? -0.06 : 0);
  let helmet;
  if (factionId === 'germany') {
    helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.118, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.62),
      mats.helmet
    );
    helmet.position.y = y;
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.118, 0.14, 0.075, 12), mats.helmet);
    skirt.position.y = -0.035;
    helmet.add(skirt);
  } else if (factionId === 'usa') {
    helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.62),
      mats.helmet
    );
    helmet.scale.set(1.02, 0.86, 1.08);
    helmet.position.y = y;
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.14, 0.025, 12), mats.helmet);
    rim.position.y = -0.025;
    helmet.add(rim);
  } else if (factionId === 'russia') {
    helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.122, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.63),
      mats.helmet
    );
    helmet.scale.set(1.04, 0.86, 1.08);
    helmet.position.y = y - 0.01;
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.124, 0.132, 0.025, 12), mats.helmet);
    rim.position.y = -0.025;
    helmet.add(rim);
  } else {
    helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.112, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.52),
      mats.helmet
    );
    helmet.scale.set(1.03, 0.76, 1.03);
    helmet.position.y = y - 0.02;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.155, 0.018, 14), mats.helmet);
    brim.position.y = -0.005;
    helmet.add(brim);
  }
  helmet.userData.infantryPart = 'helmet';
  tagShadow(helmet, 'cast');
  soldier.add(helmet);
  return helmet;
}

function snapshotPart(mesh) {
  return {
    position: mesh.position.clone(),
    rotation: mesh.rotation.clone(),
  };
}

function buildWalkRest(parts, groupPosition) {
  const rest = { group: groupPosition.clone() };
  for (const [key, mesh] of Object.entries(parts)) {
    if (mesh) rest[key] = snapshotPart(mesh);
  }
  return rest;
}

function restoreWalkRest(soldier) {
  const rest = soldier.userData.walkRest;
  if (!rest) return;
  soldier.position.copy(rest.group);
  for (const child of soldier.children) {
    if (!child.isMesh || !child.userData.infantryPart) continue;
    const partRest = rest[child.userData.infantryPart];
    if (!partRest) continue;
    child.position.copy(partRest.position);
    child.rotation.copy(partRest.rotation);
  }
}

function addLegs(soldier, mats, gunner = false) {
  const spread = gunner ? 0.07 : 0.08;
  const legs = {};
  for (const side of [-1, 1]) {
    const key = side < 0 ? 'legL' : 'legR';
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.065, 0.23, 7), mats.body);
    leg.scale.z = 1.08;
    leg.position.set(side * spread, 0.145, gunner ? 0.04 : 0);
    if (gunner) leg.rotation.x = 0.35;
    leg.userData.infantryPart = key;
    tagShadow(leg, 'receive');
    soldier.add(leg);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.075, 0.14), mats.leather);
    boot.position.set(0, -0.135, 0.025);
    boot.rotation.x = -0.08;
    leg.add(boot);
    legs[key] = leg;
  }
  return legs;
}

function addBackpack(soldier, mats, factionId) {
  const packHeight = factionId === 'russia' ? 0.18 : 0.2;
  const pack = new THREE.Mesh(
    new THREE.BoxGeometry(0.17, packHeight, 0.105),
    mats.webbing
  );
  pack.position.set(0, 0.44, -0.1);
  pack.geometry.translate(0, 0, -0.015);
  tagShadow(pack, 'cast');
  soldier.add(pack);

  const flap = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.12), mats.webbing);
  flap.position.set(0, 0.54, -0.1);
  soldier.add(flap);

  if (factionId === 'germany') {
    const canister = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 8), mats.helmet);
    canister.rotation.z = Math.PI / 2;
    canister.position.set(0, 0.36, -0.155);
    soldier.add(canister);
  } else if (factionId === 'russia') {
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 8), mats.webbing);
    roll.rotation.z = Math.PI / 2;
    roll.position.set(0, 0.55, -0.12);
    soldier.add(roll);
  } else {
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.17, 8), mats.webbing);
    roll.rotation.z = Math.PI / 2;
    roll.position.set(0, 0.33, -0.145);
    soldier.add(roll);
  }
}

function addWebbing(soldier, mats) {
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.17), mats.webbing);
  belt.position.set(0, 0.3, 0.01);
  soldier.add(belt);

  const pouchL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.05), mats.webbing);
  pouchL.position.set(-0.1, 0.32, 0.1);
  soldier.add(pouchL);

  const pouchR = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.05), mats.webbing);
  pouchR.position.set(0.1, 0.32, 0.1);
  soldier.add(pouchR);

  const strapL = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.28, 0.018), mats.webbing);
  strapL.position.set(-0.075, 0.45, 0.093);
  strapL.rotation.z = -0.2;
  soldier.add(strapL);

  const strapR = strapL.clone();
  strapR.position.x = 0.075;
  strapR.rotation.z = 0.2;
  soldier.add(strapR);

  const canteen = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.09, 8), mats.webbing);
  canteen.position.set(-0.13, 0.27, -0.025);
  soldier.add(canteen);
}

function addWeaponHands(weapon, mats) {
  if (weapon.userData.handsAdded) return;
  weapon.userData.handsAdded = true;
  const rearHand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 7, 6), mats.skin);
  rearHand.scale.set(1.2, 0.9, 0.9);
  rearHand.position.set(-0.02, -0.005, 0.075);
  weapon.add(rearHand);

  const frontHand = rearHand.clone();
  frontHand.position.set(0.17, 0.005, 0.075);
  weapon.add(frontHand);

  addSegment(
    weapon,
    new THREE.Vector3(-0.17, 0.1, -0.02),
    new THREE.Vector3(-0.02, -0.005, 0.075),
    0.043,
    mats.body
  );
  addSegment(
    weapon,
    new THREE.Vector3(0.09, 0.1, -0.02),
    new THREE.Vector3(0.17, 0.005, 0.075),
    0.043,
    mats.body
  );
}

function createWeaponGroup(soldier, { crouching = false, kind = 'rifle' } = {}) {
  const torsoY = soldier.userData._torsoY ?? (crouching ? 0.34 : 0.42);
  const weapon = new THREE.Group();
  weapon.name = 'infantryWeapon';
  weapon.userData.infantryPart = 'weapon';
  weapon.userData.weaponKind = kind;
  weapon.position.set(0.05, torsoY + 0.02, 0.04);
  soldier.add(weapon);
  return weapon;
}

function addFactionRifle(soldier, mats, factionId, { crouching = false } = {}) {
  const weapon = createWeaponGroup(soldier, { crouching, kind: 'rifle' });
  const dark = mats.dark;
  const wood = mats.wood;

  if (factionId === 'germany') {
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.065, 0.07), wood);
    stock.position.set(-0.1, 0, 0.03);
    weapon.add(stock);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.43, 7), dark);
    barrel.userData.infantryPart = 'barrel';
    barrel.position.set(0.14, 0.01, 0.07);
    barrel.rotation.z = Math.PI / 2;
    weapon.add(barrel);
    const bolt = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.05), mats.metal);
    bolt.position.set(0.02, 0.04, 0.09);
    weapon.add(bolt);
  } else if (factionId === 'usa') {
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.065, 0.065), wood);
    stock.position.set(-0.12, 0, 0.07);
    weapon.add(stock);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.41, 7), dark);
    barrel.userData.infantryPart = 'barrel';
    barrel.position.set(0.12, 0, 0.07);
    barrel.rotation.z = Math.PI / 2;
    weapon.add(barrel);
    const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.045, 0.055), wood);
    handguard.position.set(0, -0.01, 0.06);
    weapon.add(handguard);
  } else if (factionId === 'russia') {
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.065, 0.065), wood);
    stock.position.set(-0.11, 0, 0.07);
    weapon.add(stock);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.45, 7), dark);
    barrel.userData.infantryPart = 'barrel';
    barrel.position.set(0.14, 0, 0.07);
    barrel.rotation.z = Math.PI / 2;
    weapon.add(barrel);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.04), dark);
    mag.position.set(-0.04, -0.06, 0.09);
    weapon.add(mag);
  } else {
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.065), wood);
    stock.position.set(-0.1, 0, 0.07);
    weapon.add(stock);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.47, 7), dark);
    barrel.userData.infantryPart = 'barrel';
    barrel.position.set(0.14, 0.01, 0.07);
    barrel.rotation.z = Math.PI / 2;
    weapon.add(barrel);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.035, 0.035), mats.metal);
    nose.position.set(0.36, 0.02, 0.09);
    weapon.add(nose);
  }

  const rifleBarrel = weapon.children.find((c) => c.userData.infantryPart === 'barrel');
  if (rifleBarrel?.geometry?.parameters?.height !== undefined) {
    rifleBarrel.userData.muzzleTipSign = -1;
  }
  addWeaponHands(weapon, mats);

  return weapon;
}

function getWeaponAimPresets(kind, crouching, gunner) {
  if (gunner) return null;
  if (kind === 'atLauncher') {
    return {
      lowered: { x: -0.42, y: 0.32, z: 0.02 },
      raised: { x: -1.18, y: 0.32, z: 0.02 },
    };
  }
  if (kind === 'sniperRifle' || crouching) {
    return {
      lowered: { x: -0.3, y: 0.14, z: 0.02 },
      raised: { x: -1.02, y: 0.18, z: 0.02 },
    };
  }
  return {
    lowered: { x: -0.35, y: 0.55, z: 0.62 },
    raised: { x: -0.18, y: -Math.PI / 2 + 0.12, z: 0.02 },
  };
}

function initWeaponAimPreset(soldier, weapon) {
  const { gunner = false, crouching = false } = soldier.userData.walkPose ?? {};
  const kind = weapon.userData.weaponKind ?? 'rifle';
  const presets = getWeaponAimPresets(kind, crouching, gunner);
  if (!presets) {
    soldier.userData.weaponAim = null;
    return;
  }
  soldier.userData.weaponAim = presets;
  weapon.rotation.set(presets.lowered.x, presets.lowered.y, presets.lowered.z);
}

function finalizeSoldierVisuals(soldier, parts, groupPosition) {
  const weapon = soldier.children.find((c) => c.userData.infantryPart === 'weapon');
  if (weapon) initWeaponAimPreset(soldier, weapon);
  soldier.userData.walkRest = buildWalkRest({ ...parts, weapon }, groupPosition);
  soldier.userData.proneRest = soldier.children
    .filter((child) => child !== weapon)
    .map((child) => ({ child, ...snapshotPart(child) }));
}

function getEngagementTarget(unit) {
  const order = unit.attackOrder;
  if (order && !order.dead && !order.isGround && !isSmokeShellTarget(order)) return order;
  const acquired = unit.target;
  if (acquired && !acquired.dead && !acquired.isGround && !isSmokeShellTarget(acquired)) {
    return acquired;
  }
  return null;
}

function isSoldierAiming(unit, soldier) {
  if (!soldier.userData.weaponAim) return false;
  if (soldier.userData.walkPose?.gunner) return false;
  if ((unit._walkBlend ?? 0) > 0.06) return false;
  if (unit.def?.nonCombat || (unit.def?.damage ?? 0) <= 0) return false;
  if ((unit._fireAimHold ?? 0) > 0) return true;

  const target = getEngagementTarget(unit);
  if (!target) return false;

  const weapon = soldier.children.find((c) => c.userData.infantryPart === 'weapon');
  const kind = weapon?.userData.weaponKind ?? 'rifle';
  if (kind === 'atLauncher') {
    return ARMOR_TARGET_TYPES.has(target.def?.type) && isInRange(unit, target);
  }

  return isInRange(unit, target);
}

function applySoldierPronePose(soldier, proneBlend) {
  const proneRest = soldier.userData.proneRest;
  if (!proneRest) return;

  const t = THREE.MathUtils.clamp(proneBlend, 0, 1);
  const angle = 1.36;
  const pivotY = 0.09;
  const pivotZ = 0;
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);

  for (const { child, position, rotation } of proneRest) {
    const dy = position.y - pivotY;
    const dz = position.z - pivotZ;
    const proneY = pivotY + dy * cos - dz * sin;
    const proneZ = pivotZ + dy * sin + dz * cos;
    child.position.x = position.x;
    child.position.y = THREE.MathUtils.lerp(position.y, proneY, t);
    child.position.z = THREE.MathUtils.lerp(position.z, proneZ, t);
    child.rotation.x = rotation.x + angle * t;
    child.rotation.y = rotation.y;
    child.rotation.z = rotation.z;
  }
}

function applySoldierWeaponPose(soldier, aimBlend, proneBlend = 0) {
  const weapon = soldier.children.find((c) => c.userData.infantryPart === 'weapon');
  const aim = soldier.userData.weaponAim;
  const rest = soldier.userData.walkRest?.weapon;
  if (!weapon || !aim || !rest) return;

  const t = THREE.MathUtils.clamp(aimBlend, 0, 1);
  const prone = THREE.MathUtils.clamp(proneBlend, 0, 1);
  const standingY = rest.position.y + THREE.MathUtils.lerp(0, 0.1, t);
  const standingZ = rest.position.z + THREE.MathUtils.lerp(0, 0.06, t);
  weapon.position.x = rest.position.x;
  weapon.position.y = THREE.MathUtils.lerp(standingY, 0.2, prone);
  weapon.position.z = THREE.MathUtils.lerp(standingZ, 0.46, prone);
  weapon.rotation.x = THREE.MathUtils.lerp(aim.lowered.x, aim.raised.x, t);
  weapon.rotation.y = THREE.MathUtils.lerp(aim.lowered.y, aim.raised.y, t);
  weapon.rotation.z = THREE.MathUtils.lerp(aim.lowered.z, aim.raised.z, t);
}

function getVisibleSquadMembers(unitMesh) {
  const members = [];
  unitMesh.traverse((child) => {
    if (child.name === 'squadMember' && child.visible) members.push(child);
  });
  members.sort((a, b) => (a.userData.squadIndex ?? 0) - (b.userData.squadIndex ?? 0));
  return members;
}

function findMuzzleMesh(soldier, weaponType) {
  if (weaponType === 'paratrooperAt') {
    return soldier.userData.atLauncher?.tube ?? null;
  }
  const weapon = soldier.children.find((c) => c.userData.infantryPart === 'weapon');
  if (!weapon) return null;
  return (
    weapon.children.find((c) => c.userData.infantryPart === 'barrel') ??
    weapon.children.find((c) => c.isMesh && (c.geometry?.parameters?.width ?? 0) > 0.3) ??
    null
  );
}

function meshMuzzleWorldPos(mesh, out) {
  mesh.updateWorldMatrix(true, false);
  const params = mesh.geometry?.parameters;
  if (!params) {
    mesh.getWorldPosition(out);
    return out;
  }
  if (params.height !== undefined && params.radiusTop !== undefined) {
    _muzzleTip.set(0, (params.height / 2) * (mesh.userData.muzzleTipSign ?? 1), 0);
  } else {
    _muzzleTip.set((params.width ?? 0.4) / 2, 0, 0);
  }
  mesh.localToWorld(_muzzleTip);
  out.copy(_muzzleTip);
  return out;
}

function pickFiringSoldier(unit, weaponType, soldiers) {
  if (weaponType === 'paratrooperAt') {
    return soldiers.find((s) => s.userData.squadIndex === 0) ?? soldiers[0];
  }

  let pool = soldiers;
  if (unit.def?.type === 'paratrooper') {
    const riflemen = soldiers.filter((s) => findMuzzleMesh(s, 'infantry'));
    if (riflemen.length) pool = riflemen;
  }

  return pool.reduce(
    (best, soldier) =>
      (soldier.userData.weaponAimBlend ?? 0) > (best.userData.weaponAimBlend ?? 0) ? soldier : best,
    pool[0]
  );
}

/** World-space rifle / AT launcher muzzle for small-arms VFX. */
export function getInfantryMuzzleWorldPosition(unit, weaponType, out = new THREE.Vector3()) {
  const root = unit?.mesh;
  if (!root) {
    out.copy(unit.position);
    out.y += 0.85;
    return out;
  }

  if (unit.def?.type === 'machineGun') {
    const muzzle = root.userData.machineGunMuzzle;
    if (muzzle) return meshMuzzleWorldPos(muzzle, out);
  }
  if (unit.def?.type === 'mortar') {
    const muzzle = root.userData.mortarMuzzle;
    if (muzzle) return meshMuzzleWorldPos(muzzle, out);
  }

  root.updateWorldMatrix(true, true);
  const soldiers = getVisibleSquadMembers(root);
  if (!soldiers.length) {
    out.copy(unit.position);
    out.y += 0.85;
    return out;
  }

  const soldier = pickFiringSoldier(unit, weaponType, soldiers);
  const muzzleMesh = findMuzzleMesh(soldier, weaponType);
  if (muzzleMesh) return meshMuzzleWorldPos(muzzleMesh, out);

  const weapon = soldier.children.find((c) => c.userData.infantryPart === 'weapon');
  if (weapon) {
    weapon.getWorldPosition(out);
    return out;
  }

  soldier.getWorldPosition(out);
  out.y += 0.5;
  return out;
}

export function usesInfantryMuzzleOrigin(unit) {
  return FOOT_MUZZLE_UNIT_TYPES.has(unit?.def?.type);
}

/** Keep the deployed crew-served weapon aligned exactly with its current target. */
export function aimDeployedMachineGun(unit, target) {
  if (unit?.def?.type !== 'machineGun' || !unit.mesh || !target) return;
  const pivot = unit.mesh.userData.machineGunPivot;
  if (!pivot) return;

  const targetPosition = target.position ?? target.mesh?.position;
  if (!targetPosition) return;

  _mgTargetLocal.set(targetPosition.x, targetPosition.y ?? 0, targetPosition.z);
  unit.mesh.worldToLocal(_mgTargetLocal);
  pivot.rotation.y = Math.atan2(_mgTargetLocal.x, _mgTargetLocal.z) - Math.PI / 2;
  pivot.visible = true;
  pivot.userData.deployed = true;
}

/** Deploy and point the mortar tube's elevated muzzle bearing toward its target. */
export function aimDeployedMortar(unit, target) {
  if (unit?.def?.type !== 'mortar' || !unit.mesh || !target) return;
  const pivot = unit.mesh.userData.mortarPivot;
  if (!pivot) return;

  const targetPosition = target.position ?? target.mesh?.position;
  if (!targetPosition) return;

  _mortarTargetLocal.set(targetPosition.x, targetPosition.y ?? 0, targetPosition.z);
  unit.mesh.worldToLocal(_mortarTargetLocal);
  // The raised end of the inclined tube points along local -Z before yaw.
  pivot.rotation.y = Math.atan2(_mortarTargetLocal.x, _mortarTargetLocal.z) + Math.PI;
  pivot.visible = true;
  pivot.userData.deployed = true;
}

/** Keep rifles raised briefly after shots and while acquired targets stay in range. */
export function markInfantryFireAim(unit, holdSec = 0.5) {
  if (!unit || !WEAPON_POSE_TYPES.has(unit.def?.type)) return;
  unit._fireAimHold = Math.max(unit._fireAimHold ?? 0, holdSec);
}

/**
 * Build a single squad soldier with improved silhouette (legs, pack, webbing, faction rifle).
 * @param {THREE.Group} parentGroup
 * @param {object} opts
 */
export function buildSquadSoldier(parentGroup, opts) {
  const {
    factionId,
    squadIndex = 0,
    x = 0,
    z = 0,
    gunner = false,
    crouching = false,
    withRifle = true,
    withPack = true,
    withWebbing = true,
    extraMeshes = null,
  } = opts;

  const mats = getInfantryMaterials(factionId);
  const soldier = new THREE.Group();
  const torsoY = gunner || crouching ? 0.34 : 0.42;
  soldier.userData._torsoY = torsoY;
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.36, 8), mats.body);
  torso.position.y = torsoY;
  torso.scale.set(1.03, 1, 0.7);
  if (gunner || crouching) torso.rotation.x = 0.32;
  torso.userData.infantryPart = 'torso';
  tagShadow(torso, 'cast');

  const jacketSkirt = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.135, 0.1, 8), mats.body);
  jacketSkirt.position.y = -0.17;
  jacketSkirt.scale.z = 0.7;
  torso.add(jacketSkirt);

  const collarL = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.075, 0.018), mats.body);
  collarL.position.set(-0.042, 0.12, 0.108);
  collarL.rotation.z = -0.45;
  torso.add(collarL);
  const collarR = collarL.clone();
  collarR.position.x = 0.042;
  collarR.rotation.z = 0.45;
  torso.add(collarR);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.057, 0.075, 8), mats.skin);
  neck.position.y = 0.21;
  torso.add(neck);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.108, 10, 9), mats.skin);
  head.scale.set(0.84, 1.06, 0.9);
  head.position.y = torsoY + 0.3;
  head.userData.infantryPart = 'head';
  tagShadow(head, 'none');

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.05, 6), mats.skin);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0, 0.105);
  head.add(nose);

  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 5), mats.skin);
    ear.scale.set(0.6, 1, 0.7);
    ear.position.set(side * 0.092, 0, 0);
    head.add(ear);
  }

  soldier.add(torso, head);
  const helmet = addHelmet(soldier, mats, factionId, torsoY + 0.34, { gunner });
  const legs = addLegs(soldier, mats, gunner || crouching);

  if (withPack && !gunner) addBackpack(soldier, mats, factionId);
  if (withWebbing) addWebbing(soldier, mats);
  if (withRifle) addFactionRifle(soldier, mats, factionId, { crouching: gunner || crouching });

  if (extraMeshes) extraMeshes(soldier, mats);

  const specialWeapon = soldier.children.find((c) => c.userData.infantryPart === 'weapon');
  if (specialWeapon) addWeaponHands(specialWeapon, mats);

  const yaw = POSE_YAW[squadIndex % POSE_YAW.length];
  const lean = POSE_LEAN[squadIndex % POSE_LEAN.length];
  soldier.rotation.y = yaw;
  soldier.position.set(x, lean * 0.04, z);
  soldier.name = 'squadMember';
  soldier.userData.squadIndex = squadIndex;
  soldier.userData.walkPose = { gunner, crouching };
  soldier.userData.weaponAimBlend = 0;
  soldier.userData.proneBlend = 0;
  finalizeSoldierVisuals(soldier, { torso, head, helmet, ...legs }, soldier.position);
  parentGroup.add(soldier);
  return soldier;
}

/** Raise rifles while engaging; lower at port-arms when idle or marching. */
export function updateInfantryWeaponPose(unit, dt) {
  if (!unit?.mesh || unit.dead || unit.surrendered || unit._captureExit || unit._dropping) return;
  if (!WEAPON_POSE_TYPES.has(unit.def?.type)) return;

  if (unit._fireAimHold > 0) {
    unit._fireAimHold = Math.max(0, unit._fireAimHold - dt);
  }

  unit.mesh.traverse((child) => {
    if (child.name !== 'squadMember' || !child.visible || !child.userData.weaponAim) return;

    const targetBlend = isSoldierAiming(unit, child) ? 1 : 0;
    const rate = targetBlend > (child.userData.weaponAimBlend ?? 0) ? 11 : 8;
    child.userData.weaponAimBlend = THREE.MathUtils.lerp(
      child.userData.weaponAimBlend ?? 0,
      targetBlend,
      Math.min(1, dt * rate)
    );

    const canGoProne =
      PRONE_FIRE_TYPES.has(unit.def?.type) &&
      !unit._mountedOnTankId &&
      !unit._trenchId &&
      !unit._diggingTrench;
    const proneTarget = canGoProne && targetBlend > 0 ? 1 : 0;
    const proneRate = proneTarget > (child.userData.proneBlend ?? 0) ? 7 : 5;
    const previousProneBlend = child.userData.proneBlend ?? 0;
    child.userData.proneBlend = THREE.MathUtils.lerp(
      previousProneBlend,
      proneTarget,
      Math.min(1, dt * proneRate)
    );
    if (child.userData.proneBlend < 0.001) child.userData.proneBlend = 0;

    if (child.userData.proneBlend > 0 || previousProneBlend > 0) {
      applySoldierPronePose(child, child.userData.proneBlend);
    }
    applySoldierWeaponPose(
      child,
      child.userData.weaponAimBlend,
      child.userData.proneBlend
    );
  });
}

function applyPartAnim(mesh, rest, { position = null, rotation = null } = {}) {
  if (!mesh || !rest) return;
  if (position) {
    mesh.position.x = rest.position.x + position.x;
    mesh.position.y = rest.position.y + position.y;
    mesh.position.z = rest.position.z + position.z;
  }
  if (rotation) {
    mesh.rotation.x = rest.rotation.x + rotation.x;
    mesh.rotation.y = rest.rotation.y + rotation.y;
    mesh.rotation.z = rest.rotation.z + rotation.z;
  }
}

function animateSoldierWalk(soldier, phase, blend) {
  const rest = soldier.userData.walkRest;
  if (!rest) return;

  const { gunner = false, crouching = false } = soldier.userData.walkPose ?? {};
  const compact = gunner || crouching;
  const amp = compact ? 0.55 : 1;
  const squadIndex = soldier.userData.squadIndex ?? 0;
  const stride = Math.sin(phase + squadIndex * 0.65);
  const bob = Math.abs(Math.sin(phase * 2 + squadIndex * 0.4));

  soldier.position.set(
    rest.group.x + Math.sin(phase * 0.5 + squadIndex) * 0.018 * blend * amp,
    rest.group.y + bob * 0.012 * blend * amp,
    rest.group.z + stride * 0.03 * blend * amp
  );

  const torso = soldier.children.find((c) => c.userData.infantryPart === 'torso');
  const head = soldier.children.find((c) => c.userData.infantryPart === 'head');
  const helmet = soldier.children.find((c) => c.userData.infantryPart === 'helmet');
  const legL = soldier.children.find((c) => c.userData.infantryPart === 'legL');
  const legR = soldier.children.find((c) => c.userData.infantryPart === 'legR');

  applyPartAnim(torso, rest.torso, {
    position: { x: 0, y: bob * 0.02 * blend * amp, z: 0 },
    rotation: { x: 0.1 * blend * amp, y: 0, z: stride * 0.04 * blend },
  });
  applyPartAnim(head, rest.head, {
    position: { x: 0, y: bob * 0.014 * blend * amp, z: 0 },
    rotation: { x: -0.03 * blend * amp, y: 0, z: 0 },
  });
  applyPartAnim(helmet, rest.helmet, {
    position: { x: 0, y: bob * 0.014 * blend * amp, z: 0 },
  });
  applyPartAnim(legL, rest.legL, {
    position: { x: 0, y: 0, z: stride * 0.05 * blend * amp },
    rotation: { x: stride * 0.55 * blend * amp, y: 0, z: 0 },
  });
  applyPartAnim(legR, rest.legR, {
    position: { x: 0, y: 0, z: -stride * 0.05 * blend * amp },
    rotation: { x: -stride * 0.55 * blend * amp, y: 0, z: 0 },
  });
}

export function resetInfantryWalkPose(unit) {
  if (!unit?.mesh) return;
  unit._walkBlend = 0;
  unit.mesh.traverse((child) => {
    if (child.name !== 'squadMember') return;
    restoreWalkRest(child);
    child.userData.proneBlend = 0;
    applySoldierPronePose(child, 0);
    applySoldierWeaponPose(child, child.userData.weaponAimBlend ?? 0, 0);
  });
}

/** Procedural march cycle for foot units while repositioning. */
export function updateInfantryWalkAnimation(unit, dt) {
  if (!unit?.mesh || unit.dead || unit.surrendered || unit._captureExit || unit._dropping) return;
  if (unit._mountedOnTankId) return;
  if (!INFANTRY_WALK_TYPES.has(unit.def?.type)) return;

  // Dug into a trench / actively digging — hold crouch pose, no march cycle
  if (unit._trenchId || unit._diggingTrench) {
    unit._walkBlend = 0;
    unit.mesh.traverse((child) => {
      if (child.name !== 'squadMember' || !child.visible) return;
      if (!child.userData.walkPose) child.userData.walkPose = {};
      child.userData.walkPose.crouching = true;
      restoreWalkRest(child);
      // Compact crouch: sink torso
      const torso = child.children.find((c) => c.userData.infantryPart === 'torso');
      const rest = child.userData.walkRest;
      if (torso && rest?.torso) {
        torso.position.y = rest.torso.position.y - 0.12;
        torso.rotation.x = rest.torso.rotation.x + 0.28;
      }
      const legL = child.children.find((c) => c.userData.infantryPart === 'legL');
      const legR = child.children.find((c) => c.userData.infantryPart === 'legR');
      if (legL && rest?.legL) {
        legL.rotation.x = rest.legL.rotation.x + 0.85;
        legL.position.y = rest.legL.position.y + 0.06;
      }
      if (legR && rest?.legR) {
        legR.rotation.x = rest.legR.rotation.x + 0.85;
        legR.position.y = rest.legR.position.y + 0.06;
      }
    });
    return;
  }

  const wantsMove = !!unit.moveTarget;
  const lastX = unit._walkLastX ?? unit.position.x;
  const lastZ = unit._walkLastZ ?? unit.position.z;
  const moved = Math.hypot(unit.position.x - lastX, unit.position.z - lastZ);
  unit._walkLastX = unit.position.x;
  unit._walkLastZ = unit.position.z;

  const active = wantsMove && moved > 0.0005;
  const mortarPivot = unit.mesh.userData.mortarPivot;
  if (mortarPivot) {
    mortarPivot.visible = !active;
    mortarPivot.userData.deployed = !active;
  }
  let blend = unit._walkBlend ?? 0;
  if (active) {
    blend = Math.min(1, blend + dt * 7);
    const cadence = Math.max(4.5, unit.def.speed * 1.35);
    unit._walkPhase = (unit._walkPhase ?? 0) + dt * cadence;
  } else {
    blend = Math.max(0, blend - dt * 5);
    if (!wantsMove) unit._walkPhase = unit._walkPhase ?? 0;
  }
  unit._walkBlend = blend;

  unit.mesh.traverse((child) => {
    if (child.name !== 'squadMember' || !child.visible) return;
    if (blend <= 0.001) {
      restoreWalkRest(child);
      return;
    }
    animateSoldierWalk(child, unit._walkPhase ?? 0, blend);
  });
}
