import * as THREE from 'three';
import { getInfantryMaterials } from './UnitTextures.js';

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

function addFactionRifle(soldier, mats, factionId, { crouching = false } = {}) {
  const y = crouching ? 0.36 : 0.44;
  const z = 0.11;
  const dark = mats.dark;

  if (factionId === 'germany') {
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.06), dark);
    stock.position.set(-0.02, y, z - 0.02);
    soldier.add(stock);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.045, 0.045), dark);
    barrel.position.set(0.2, y + 0.01, z);
    barrel.rotation.y = -0.08;
    soldier.add(barrel);
    const bolt = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.05), mats.metal);
    bolt.position.set(0.08, y + 0.04, z + 0.02);
    soldier.add(bolt);
  } else if (factionId === 'usa') {
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.055, 0.055), dark);
    stock.position.set(-0.04, y, z);
    soldier.add(stock);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.045, 0.045), dark);
    barrel.position.set(0.18, y, z);
    soldier.add(barrel);
    const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.05), mats.webbing);
    handguard.position.set(0.06, y - 0.01, z);
    soldier.add(handguard);
  } else if (factionId === 'russia') {
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.05, 0.055), dark);
    stock.position.set(-0.03, y, z);
    soldier.add(stock);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.045, 0.045), dark);
    barrel.position.set(0.2, y, z);
    soldier.add(barrel);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.04), dark);
    mag.position.set(0.02, y - 0.06, z + 0.02);
    soldier.add(mag);
  } else {
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.055), dark);
    stock.position.set(-0.02, y, z);
    soldier.add(stock);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.04, 0.04), dark);
    barrel.position.set(0.2, y + 0.01, z);
    barrel.rotation.y = 0.1;
    soldier.add(barrel);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.035, 0.035), mats.metal);
    nose.position.set(0.42, y + 0.02, z + 0.02);
    soldier.add(nose);
  }
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
  soldier.userData.walkRest = buildWalkRest({ torso, head, helmet, ...legs }, soldier.position);
  parentGroup.add(soldier);
  return soldier;
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