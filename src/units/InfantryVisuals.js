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

const WEAPON_POSE_TYPES = new Set(['infantry', 'paratrooper', 'sniper']);
const ARMOR_TARGET_TYPES = new Set(['tank', 'superHeavyTank', 'armoredCar']);
const FOOT_MUZZLE_UNIT_TYPES = new Set(['infantry', 'paratrooper', 'sniper']);

const _muzzleTip = new THREE.Vector3();

function tagShadow(mesh, mode) {
  mesh.userData.shadowMode = mode;
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
      new THREE.SphereGeometry(0.115, 10, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      mats.body
    );
    helmet.position.y = y;
  } else if (factionId === 'usa') {
    helmet = new THREE.Mesh(new THREE.SphereGeometry(0.125, 10, 10), mats.body);
    helmet.scale.set(1.06, 0.84, 1.06);
    helmet.position.y = y;
  } else if (factionId === 'russia') {
    helmet = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), mats.body);
    helmet.scale.set(1.08, 0.8, 1.08);
    helmet.position.y = y - 0.01;
  } else {
    helmet = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), mats.helmetUk);
    helmet.scale.set(1.1, 0.76, 1.1);
    helmet.position.y = y - 0.02;
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
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.22, 0.1), mats.body);
    leg.position.set(side * spread, 0.11, gunner ? 0.04 : 0);
    if (gunner) leg.rotation.x = 0.35;
    leg.userData.infantryPart = key;
    tagShadow(leg, 'receive');
    soldier.add(leg);
    legs[key] = leg;
  }
  return legs;
}

function addBackpack(soldier, mats, factionId) {
  const pack = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.2, 0.11),
    factionId === 'usa' ? mats.webbing : mats.body
  );
  pack.position.set(0, 0.44, -0.1);
  tagShadow(pack, 'cast');
  soldier.add(pack);

  const flap = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.12), mats.webbing);
  flap.position.set(0, 0.54, -0.1);
  soldier.add(flap);
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

  if (factionId === 'germany') {
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.06), dark);
    stock.position.set(-0.1, 0, 0.03);
    weapon.add(stock);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.045, 0.045), dark);
    barrel.userData.infantryPart = 'barrel';
    barrel.position.set(0.14, 0.01, 0.07);
    barrel.rotation.y = -0.08;
    weapon.add(barrel);
    const bolt = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.05), mats.metal);
    bolt.position.set(0.02, 0.04, 0.09);
    weapon.add(bolt);
  } else if (factionId === 'usa') {
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.055, 0.055), dark);
    stock.position.set(-0.12, 0, 0.07);
    weapon.add(stock);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.045, 0.045), dark);
    barrel.userData.infantryPart = 'barrel';
    barrel.position.set(0.12, 0, 0.07);
    weapon.add(barrel);
    const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.05), mats.webbing);
    handguard.position.set(0, -0.01, 0.06);
    weapon.add(handguard);
  } else if (factionId === 'russia') {
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.05, 0.055), dark);
    stock.position.set(-0.11, 0, 0.07);
    weapon.add(stock);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.045, 0.045), dark);
    barrel.userData.infantryPart = 'barrel';
    barrel.position.set(0.14, 0, 0.07);
    weapon.add(barrel);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.04), dark);
    mag.position.set(-0.04, -0.06, 0.09);
    weapon.add(mag);
  } else {
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.055), dark);
    stock.position.set(-0.1, 0, 0.07);
    weapon.add(stock);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.04, 0.04), dark);
    barrel.userData.infantryPart = 'barrel';
    barrel.position.set(0.14, 0.01, 0.07);
    barrel.rotation.y = 0.1;
    weapon.add(barrel);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.035, 0.035), mats.metal);
    nose.position.set(0.36, 0.02, 0.09);
    weapon.add(nose);
  }

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

function applySoldierWeaponPose(soldier, aimBlend) {
  const weapon = soldier.children.find((c) => c.userData.infantryPart === 'weapon');
  const aim = soldier.userData.weaponAim;
  const rest = soldier.userData.walkRest?.weapon;
  if (!weapon || !aim || !rest) return;

  const t = THREE.MathUtils.clamp(aimBlend, 0, 1);
  weapon.position.x = rest.position.x;
  weapon.position.y = rest.position.y + THREE.MathUtils.lerp(0, 0.1, t);
  weapon.position.z = rest.position.z + THREE.MathUtils.lerp(0, 0.06, t);
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
    _muzzleTip.set(0, params.height / 2, 0);
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
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.36, 0.17), mats.body);
  torso.position.y = torsoY;
  torso.scale.set(1.06, 1, 0.95);
  if (gunner || crouching) torso.rotation.x = 0.32;
  torso.userData.infantryPart = 'torso';
  tagShadow(torso, 'cast');

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 10, 10), mats.skin);
  head.position.y = torsoY + 0.3;
  head.userData.infantryPart = 'head';
  tagShadow(head, 'none');

  soldier.add(torso, head);
  const helmet = addHelmet(soldier, mats, factionId, torsoY + 0.34, { gunner });
  const legs = addLegs(soldier, mats, gunner || crouching);

  if (withPack && !gunner) addBackpack(soldier, mats, factionId);
  if (withWebbing) addWebbing(soldier, mats);
  if (withRifle) addFactionRifle(soldier, mats, factionId, { crouching: gunner || crouching });

  if (extraMeshes) extraMeshes(soldier, mats);

  const yaw = POSE_YAW[squadIndex % POSE_YAW.length];
  const lean = POSE_LEAN[squadIndex % POSE_LEAN.length];
  soldier.rotation.y = yaw;
  soldier.position.set(x, lean * 0.04, z);
  soldier.name = 'squadMember';
  soldier.userData.squadIndex = squadIndex;
  soldier.userData.walkPose = { gunner, crouching };
  soldier.userData.weaponAimBlend = 0;
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
    applySoldierWeaponPose(child, child.userData.weaponAimBlend);
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

/** Procedural march cycle for foot units while repositioning. */
export function updateInfantryWalkAnimation(unit, dt) {
  if (!unit?.mesh || unit.dead || unit.surrendered || unit._captureExit || unit._dropping) return;
  if (!INFANTRY_WALK_TYPES.has(unit.def?.type)) return;

  const wantsMove = !!unit.moveTarget;
  const lastX = unit._walkLastX ?? unit.position.x;
  const lastZ = unit._walkLastZ ?? unit.position.z;
  const moved = Math.hypot(unit.position.x - lastX, unit.position.z - lastZ);
  unit._walkLastX = unit.position.x;
  unit._walkLastZ = unit.position.z;

  const active = wantsMove && moved > 0.0005;
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