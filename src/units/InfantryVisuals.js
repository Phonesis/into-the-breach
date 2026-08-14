import * as THREE from 'three';
import { getInfantryMaterials } from './UnitTextures.js';
import { isInRange, isSmokeShellTarget } from '../game/Targeting.js';

const POSE_YAW = [0, 0.18, -0.14, 0.24, -0.2, 0.1, -0.26, 0.16];
const POSE_LEAN = [0, 0.04, -0.03, 0.05, -0.04, 0.02, -0.05, 0.03];

const INFANTRY_WALK_TYPES = new Set([
  'radioOperator',
  'infantry',
  'paratrooper',
  'medic',
  'engineer',
  'machineGun',
  'mortar',
  'sniper',
  'vehicleCrew',
  'commander',
]);

const WEAPON_POSE_TYPES = new Set([
  'radioOperator',
  'infantry',
  'paratrooper',
  'sniper',
  'engineer',
  'vehicleCrew',
  'commander',
]);
const PRONE_FIRE_TYPES = new Set([
  'radioOperator',
  'infantry',
  'paratrooper',
  'engineer',
  'sniper',
  'vehicleCrew',
  'commander',
]);

// Foot troops use a broad range of movement speeds. Keep the slower support
// teams on a compact marching gait while allowing riflemen and airborne units
// to transition naturally into a more urgent run.
const HUMAN_WALK_SPEED = 3.7;
const HUMAN_RUN_SPEED = 5.5;

/** True while a foot squad is visually prone (stationary and firing). */
export function isUnitVisuallyProne(unit) {
  if (!unit?.mesh || unit.dead || unit._trenchId || unit._mountedOnTankId) return false;
  if (!PRONE_FIRE_TYPES.has(unit.def?.type)) return false;
  let maxBlend = 0;
  unit.mesh.traverse((child) => {
    if (child.name !== 'squadMember' || !child.visible) return;
    maxBlend = Math.max(maxBlend, child.userData.proneBlend ?? 0);
  });
  return maxBlend >= 0.45;
}
const TACTICAL_FORMATION_TYPES = new Set(['infantry', 'paratrooper', 'engineer', 'commander']);
const ARMOR_TARGET_TYPES = new Set(['tank', 'tankDestroyer', 'superHeavyTank', 'armoredCar']);
const FOOT_MUZZLE_UNIT_TYPES = new Set([
  'radioOperator',
  'infantry',
  'paratrooper',
  'sniper',
  'engineer',
  'machineGun',
  'mortar',
  'vehicleCrew',
  'commander',
]);

const _muzzleTip = new THREE.Vector3();
const _mgTargetLocal = new THREE.Vector3();
const _mortarTargetLocal = new THREE.Vector3();

const TACTICAL_FORMATIONS = {
  4: [
    {
      name: 'wedge',
      points: [
        [0, 1.15],
        [-0.85, 0.2],
        [0.9, 0.1],
        [0.05, -1.05],
      ],
    },
    {
      name: 'staggered-column',
      points: [
        [0, 1.35],
        [-0.55, 0.45],
        [0.5, -0.35],
        [-0.45, -1.25],
      ],
    },
    {
      name: 'line',
      points: [
        [-0.35, 0.08],
        [-1.3, -0.12],
        [0.6, 0.12],
        [1.5, -0.08],
      ],
    },
    {
      name: 'echelon',
      points: [
        [-0.15, 0.95],
        [-0.8, 0.35],
        [0.5, -0.25],
        [1.15, -0.9],
      ],
    },
  ],
  5: [
    {
      name: 'wedge',
      points: [
        [0, 1.2],
        [-0.85, 0.3],
        [0.9, 0.2],
        [-1.4, -0.9],
        [1.35, -1.0],
      ],
    },
    {
      name: 'staggered-column',
      points: [
        [0, 1.45],
        [-0.55, 0.7],
        [0.5, 0],
        [-0.65, -0.75],
        [0.45, -1.5],
      ],
    },
    {
      name: 'line',
      points: [
        [0, 0.08],
        [-0.8, -0.1],
        [0.8, 0.12],
        [-1.6, 0.06],
        [1.6, -0.12],
      ],
    },
    {
      name: 'echelon',
      points: [
        [0, 1.05],
        [-0.65, 0.45],
        [0.55, -0.05],
        [-1.25, -0.45],
        [1.15, -1.0],
      ],
    },
  ],
};

/**
 * Give each rifle squad its own set of compact tactical layouts. Layouts stay
 * within the unit footprint so selection, cover, casualties, and combat still
 * operate on the squad's shared gameplay position.
 */
export function configureTacticalSquadFormation(group, unitType, memberCount) {
  if (!group || !TACTICAL_FORMATION_TYPES.has(unitType)) return [];
  const presets = TACTICAL_FORMATIONS[memberCount];
  if (!presets?.length) return [];

  const spreadScale = 0.92 + Math.random() * 0.18;
  const mirror = Math.random() < 0.5 ? -1 : 1;
  const layouts = presets.map((preset) => ({
    name: preset.name,
    points: preset.points.map(([x, z], memberIndex) => ({
      x:
        x * spreadScale * mirror +
        (memberIndex === 0 ? 0 : (Math.random() - 0.5) * 0.16),
      z: z * spreadScale + (Math.random() - 0.5) * 0.14,
    })),
  }));
  const initialIndex = Math.floor(Math.random() * layouts.length);
  group.userData.tacticalFormation = {
    layouts,
    currentIndex: initialIndex,
    targetIndex: initialIndex,
    name: layouts[initialIndex].name,
  };
  return layouts[initialIndex].points;
}

function updateTacticalSquadFormation(unit, dt, moving) {
  const formation = unit.mesh.userData.tacticalFormation;
  if (!formation?.layouts?.length) return;

  if (moving && !unit._tacticalFormationWasMoving) {
    const alternatives = formation.layouts.length - 1;
    const step = 1 + Math.floor(Math.random() * Math.max(1, alternatives));
    formation.targetIndex = (formation.currentIndex + step) % formation.layouts.length;
    formation.currentIndex = formation.targetIndex;
    formation.name = formation.layouts[formation.targetIndex].name;
  }
  unit._tacticalFormationWasMoving = moving;

  const targetLayout = formation.layouts[formation.targetIndex];
  const alpha = 1 - Math.exp(-Math.max(0, dt) * 2.8);
  unit.mesh.traverse((child) => {
    if (child.name !== 'squadMember') return;
    const rest = child.userData.walkRest;
    const target = targetLayout.points[child.userData.squadIndex ?? 0];
    if (!rest?.group || !target) return;
    rest.group.x = THREE.MathUtils.lerp(rest.group.x, target.x, alpha);
    rest.group.z = THREE.MathUtils.lerp(rest.group.z, target.z, alpha);
  });
}

function tagShadow(mesh, mode) {
  mesh.userData.shadowMode = mode;
}

function mergeGeometryAttributes(geometries) {
  const expanded = geometries.map((geometry) =>
    geometry.index ? geometry.toNonIndexed() : geometry.clone()
  );
  const merged = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const attributes = expanded.map((geometry) => geometry.getAttribute(name));
    if (attributes.some((attribute) => !attribute)) continue;
    const itemSize = attributes[0].itemSize;
    const length = attributes.reduce((sum, attribute) => sum + attribute.array.length, 0);
    const array = new Float32Array(length);
    let offset = 0;
    for (const attribute of attributes) {
      array.set(attribute.array, offset);
      offset += attribute.array.length;
    }
    merged.setAttribute(name, new THREE.Float32BufferAttribute(array, itemSize));
  }
  for (const geometry of expanded) geometry.dispose();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Packs and webbing are rigid relative to a soldier. Merge pieces that share
 * a material and shadow policy so their exact geometry still follows the
 * animated soldier group with fewer WebGL submissions.
 */
function consolidateRigidSoldierEquipment(soldier) {
  const buckets = new Map();
  for (const child of soldier.children) {
    if (
      !child.isMesh ||
      Array.isArray(child.material) ||
      child.userData.infantryPart
    ) {
      continue;
    }
    const shadowMode = child.userData.shadowMode ?? 'none';
    let materialBuckets = buckets.get(child.material);
    if (!materialBuckets) {
      materialBuckets = new Map();
      buckets.set(child.material, materialBuckets);
    }
    const bucket = materialBuckets.get(shadowMode) ?? [];
    bucket.push(child);
    materialBuckets.set(shadowMode, bucket);
  }

  for (const [equipmentMaterial, materialBuckets] of buckets) {
    for (const [shadowMode, meshes] of materialBuckets) {
      if (meshes.length < 2) continue;
      const geometries = [];
      for (const mesh of meshes) {
        mesh.updateMatrix();
        const geometry = mesh.geometry.clone();
        geometry.applyMatrix4(mesh.matrix);
        geometries.push(geometry);
        soldier.remove(mesh);
      }
      const batch = new THREE.Mesh(
        mergeGeometryAttributes(geometries),
        equipmentMaterial
      );
      for (const geometry of geometries) geometry.dispose();
      batch.name = 'soldierEquipmentBatch';
      tagShadow(batch, shadowMode);
      soldier.add(batch);
    }
  }
}

/** Merge rigid detail attached to one animated body part without crossing a
 * shadow-policy boundary. The body part still moves as the same object. */
function consolidateRigidPartDetails(part) {
  if (!part?.isMesh || Array.isArray(part.material)) return;
  const partShadowMode = part.userData.shadowMode ?? 'none';
  const matchingPart = [];
  const childBuckets = new Map();

  for (const child of part.children) {
    if (!child.isMesh || Array.isArray(child.material) || child.userData.infantryPart) {
      continue;
    }
    const shadowMode = child.userData.shadowMode ?? 'none';
    if (child.material === part.material && shadowMode === partShadowMode) {
      matchingPart.push(child);
      continue;
    }
    let materialBuckets = childBuckets.get(child.material);
    if (!materialBuckets) {
      materialBuckets = new Map();
      childBuckets.set(child.material, materialBuckets);
    }
    const bucket = materialBuckets.get(shadowMode) ?? [];
    bucket.push(child);
    materialBuckets.set(shadowMode, bucket);
  }

  if (matchingPart.length) {
    const geometries = [part.geometry.clone()];
    for (const child of matchingPart) {
      child.updateMatrix();
      const geometry = child.geometry.clone();
      geometry.applyMatrix4(child.matrix);
      geometries.push(geometry);
      part.remove(child);
    }
    part.geometry = mergeGeometryAttributes(geometries);
    for (const geometry of geometries) geometry.dispose();
  }

  for (const [detailMaterial, materialBuckets] of childBuckets) {
    for (const [shadowMode, meshes] of materialBuckets) {
      if (meshes.length < 2) continue;
      const geometries = [];
      for (const mesh of meshes) {
        mesh.updateMatrix();
        const geometry = mesh.geometry.clone();
        geometry.applyMatrix4(mesh.matrix);
        geometries.push(geometry);
        part.remove(mesh);
      }
      const batch = new THREE.Mesh(mergeGeometryAttributes(geometries), detailMaterial);
      for (const geometry of geometries) geometry.dispose();
      batch.name = 'soldierPartDetailBatch';
      tagShadow(batch, shadowMode);
      part.add(batch);
    }
  }
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
  } else if (factionId === 'japan') {
    helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.58),
      mats.helmet
    );
    helmet.scale.set(1.03, 0.78, 1.06);
    helmet.position.y = y - 0.018;
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.126, 0.134, 0.022, 12), mats.helmet);
    rim.position.y = -0.016;
    helmet.add(rim);
    const neckCloth = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.13, 0.025), mats.body);
    neckCloth.position.set(0, -0.09, -0.08);
    neckCloth.rotation.x = -0.2;
    helmet.add(neckCloth);
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

function resetWalkJoints(part) {
  for (const joint of part?.userData?.walkJoints ?? []) {
    if (!joint?.object) continue;
    joint.object.position.copy(joint.position);
    joint.object.rotation.copy(joint.rotation);
  }
}

function restoreWalkRest(soldier) {
  const rest = soldier.userData.walkRest;
  if (!rest) return;
  soldier.position.copy(rest.group);
  for (const child of soldier.children) {
    if (!child.userData?.infantryPart) continue;
    const partRest = rest[child.userData.infantryPart];
    if (!partRest) continue;
    child.position.copy(partRest.position);
    child.rotation.copy(partRest.rotation);
    resetWalkJoints(child);
  }
}

function addLegs(soldier, mats, gunner = false) {
  const spread = gunner ? 0.07 : 0.08;
  const legs = {};
  for (const side of [-1, 1]) {
    const key = side < 0 ? 'legL' : 'legR';
    // The old single mesh rotated around its midpoint, which made the foot
    // slide through the ground and the knee appear to swing from the ankle.
    // Use a hip pivot with a small articulated knee so the stride reads as a
    // planted step even at this deliberately compact battlefield scale.
    const leg = new THREE.Group();
    leg.name = key;
    leg.position.set(side * spread, 0.26, gunner ? 0.04 : 0);
    if (gunner) leg.rotation.x = 0.35;
    leg.userData.infantryPart = key;

    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.062, 0.13, 7), mats.body);
    thigh.position.y = -0.065;
    thigh.scale.z = 1.08;
    tagShadow(thigh, 'receive');
    leg.add(thigh);

    const knee = new THREE.Group();
    knee.name = `${key}Knee`;
    knee.position.y = -0.13;
    knee.userData.restRotationX = knee.rotation.x;
    leg.add(knee);

    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.058, 0.13, 7), mats.body);
    shin.position.y = -0.065;
    shin.scale.z = 1.08;
    tagShadow(shin, 'receive');
    knee.add(shin);

    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.075, 0.14), mats.leather);
    boot.position.set(0, -0.14, 0.025);
    boot.rotation.x = -0.08;
    knee.add(boot);

    leg.userData.kneePivot = knee;
    leg.userData.walkJoints = [
      {
        object: knee,
        position: knee.position.clone(),
        rotation: knee.rotation.clone(),
      },
      {
        object: boot,
        position: boot.position.clone(),
        rotation: boot.rotation.clone(),
      },
    ];
    tagShadow(leg, 'receive');
    soldier.add(leg);
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
  } else if (factionId === 'japan') {
    const blanket = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.21, 8), mats.webbing);
    blanket.rotation.z = Math.PI / 2;
    blanket.position.set(0, 0.55, -0.13);
    soldier.add(blanket);
    const messTin = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.14, 0.055), mats.metal);
    messTin.position.set(0.12, 0.34, -0.135);
    soldier.add(messTin);
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
  } else if (factionId === 'japan') {
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.065), wood);
    stock.position.set(-0.12, 0, 0.07);
    weapon.add(stock);
    const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.045, 0.052), wood);
    handguard.position.set(0.05, 0, 0.07);
    weapon.add(handguard);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.019, 0.5, 7), dark);
    barrel.userData.infantryPart = 'barrel';
    barrel.position.set(0.19, 0.01, 0.07);
    barrel.rotation.z = Math.PI / 2;
    weapon.add(barrel);
    const bayonet = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.012, 0.022), mats.metal);
    bayonet.position.set(0.48, -0.005, 0.07);
    weapon.add(bayonet);
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
    resetWalkJoints(child);
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

function applyMarchingWeaponSway(soldier, phase, blend, runBlend) {
  const weapon = soldier.children.find((c) => c.userData.infantryPart === 'weapon');
  if (!weapon || blend <= 0.001) return;

  const { gunner = false, crouching = false } = soldier.userData.walkPose ?? {};
  const compact = gunner || crouching;
  const scale = (compact ? 0.45 : 1) * blend;
  const offset = (soldier.userData.squadIndex ?? 0) * 0.82;
  const sway = Math.sin(phase + offset + Math.PI * 0.35);
  const bob = 0.5 - Math.cos(phase * 2 + offset * 0.5) * 0.5;
  const carry = 0.7 + runBlend * 0.3;

  // A rifle carried at port arms follows the shoulders, but lags slightly on
  // each footfall. This is intentionally applied after aim/prone posing so a
  // moving soldier never snaps back to the firing pose for one frame.
  weapon.position.x += sway * 0.012 * scale * carry;
  weapon.position.y += (bob - 0.5) * 0.014 * scale;
  weapon.position.z += sway * 0.018 * scale * carry;
  weapon.rotation.x += sway * 0.045 * scale;
  weapon.rotation.z -= sway * 0.035 * scale;
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

  consolidateRigidPartDetails(torso);
  consolidateRigidPartDetails(head);

  soldier.add(torso, head);
  const helmet = addHelmet(soldier, mats, factionId, torsoY + 0.34, { gunner });
  const legs = addLegs(soldier, mats, gunner || crouching);

  if (withPack && !gunner) addBackpack(soldier, mats, factionId);
  if (withWebbing) addWebbing(soldier, mats);
  if (withRifle) addFactionRifle(soldier, mats, factionId, { crouching: gunner || crouching });

  if (extraMeshes) extraMeshes(soldier, mats);

  const specialWeapon = soldier.children.find((c) => c.userData.infantryPart === 'weapon');
  if (specialWeapon) addWeaponHands(specialWeapon, mats);
  consolidateRigidSoldierEquipment(soldier);

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

  if ((unit._underFireProneTimer ?? 0) > 0) {
    unit._underFireProneTimer = Math.max(0, unit._underFireProneTimer - dt);
  }

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
    const underFireProne =
      !unit.moveTarget &&
      !unit._userMoveOrder &&
      (unit._underFireProneTimer ?? 0) > 0;
    const proneTarget = canGoProne && (targetBlend > 0 || underFireProne) ? 1 : 0;
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
    applyMarchingWeaponSway(
      child,
      unit._walkPhase ?? 0,
      unit._walkBlend ?? 0,
      unit._walkRunBlend ?? 0
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

function animateSoldierWalk(soldier, phase, blend, runBlend = 0) {
  const rest = soldier.userData.walkRest;
  if (!rest) return;

  const { gunner = false, crouching = false } = soldier.userData.walkPose ?? {};
  const compact = gunner || crouching;
  const compactScale = compact ? 0.56 : 1;
  const squadIndex = soldier.userData.squadIndex ?? 0;
  const offset = squadIndex * 0.82;
  const legPhase = phase + offset;
  const leftStride = Math.sin(legPhase);
  const rightStride = Math.sin(legPhase + Math.PI);
  const leftLift = Math.pow(Math.max(0, leftStride), 1.35);
  const rightLift = Math.pow(Math.max(0, rightStride), 1.35);
  const bob = 0.5 - Math.cos(legPhase * 2) * 0.5;
  const weightShift = Math.sin(legPhase + Math.PI * 0.5);
  const hipSwing = (0.38 + runBlend * 0.2) * compactScale;
  const kneeBend = (0.24 + runBlend * 0.18) * compactScale;
  const strideBlend = blend * (0.84 + runBlend * 0.16);

  soldier.position.set(
    rest.group.x + weightShift * 0.014 * strideBlend,
    rest.group.y + bob * (compact ? 0.006 : 0.011 + runBlend * 0.004) * blend,
    rest.group.z + weightShift * 0.008 * strideBlend
  );

  const torso = soldier.children.find((c) => c.userData.infantryPart === 'torso');
  const head = soldier.children.find((c) => c.userData.infantryPart === 'head');
  const helmet = soldier.children.find((c) => c.userData.infantryPart === 'helmet');
  const legL = soldier.children.find((c) => c.userData.infantryPart === 'legL');
  const legR = soldier.children.find((c) => c.userData.infantryPart === 'legR');
  const weapon = soldier.children.find((c) => c.userData.infantryPart === 'weapon');

  applyPartAnim(torso, rest.torso, {
    position: { x: 0, y: bob * 0.012 * blend, z: 0 },
    rotation: {
      x: (-0.025 - runBlend * 0.025) * strideBlend,
      y: -weightShift * 0.018 * strideBlend,
      z: -weightShift * (0.035 + runBlend * 0.015) * strideBlend,
    },
  });
  applyPartAnim(head, rest.head, {
    position: { x: 0, y: bob * 0.007 * blend, z: 0 },
    rotation: {
      x: -bob * 0.016 * blend,
      y: weightShift * 0.012 * strideBlend,
      z: weightShift * 0.018 * strideBlend,
    },
  });
  applyPartAnim(helmet, rest.helmet, {
    position: { x: 0, y: bob * 0.007 * blend, z: 0 },
  });

  const animateLeg = (leg, legRest, stride, lift) => {
    if (!leg || !legRest) return;
    applyPartAnim(leg, legRest, {
      position: { x: 0, y: 0, z: stride * 0.012 * strideBlend },
      rotation: { x: stride * hipSwing * strideBlend, y: 0, z: 0 },
    });

    const knee = leg.userData.kneePivot;
    const kneeRest = leg.userData.walkJoints?.find((joint) => joint.object === knee);
    if (knee && kneeRest) {
      knee.position.copy(kneeRest.position);
      knee.rotation.copy(kneeRest.rotation);
      knee.rotation.x += lift * kneeBend * blend;
    }

    const boot = leg.userData.walkJoints?.find((joint) => joint.object !== knee)?.object;
    const bootRest = leg.userData.walkJoints?.find((joint) => joint.object === boot);
    if (boot && bootRest) {
      boot.position.copy(bootRest.position);
      boot.rotation.copy(bootRest.rotation);
      boot.rotation.x -= lift * 0.14 * blend;
    }
  };

  animateLeg(legL, rest.legL, leftStride, leftLift);
  animateLeg(legR, rest.legR, rightStride, rightLift);

  // Gunners have no weapon-aim state; keep their carried rifles and special
  // launchers moving with the torso as well. Riflemen are finished in
  // updateInfantryWeaponPose after movement so aiming remains authoritative.
  if (weapon && rest.weapon && !soldier.userData.weaponAim) {
    applyPartAnim(weapon, rest.weapon, {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
    });
    applyMarchingWeaponSway(soldier, phase, blend, runBlend);
  }
}

export function resetInfantryWalkPose(unit) {
  if (!unit?.mesh) return;
  unit._walkBlend = 0;
  unit._walkMotionRatio = 0;
  unit._walkRunBlend = 0;
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
    unit._walkMotionRatio = 0;
    unit._walkRunBlend = 0;
    unit.mesh.traverse((child) => {
      if (child.name !== 'squadMember' || !child.visible) return;
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
        const knee = legL.userData.kneePivot;
        if (knee) knee.rotation.x = (knee.userData.restRotationX ?? knee.rotation.x) + 0.28;
      }
      if (legR && rest?.legR) {
        legR.rotation.x = rest.legR.rotation.x + 0.85;
        legR.position.y = rest.legR.position.y + 0.06;
        const knee = legR.userData.kneePivot;
        if (knee) knee.rotation.x = (knee.userData.restRotationX ?? knee.rotation.x) + 0.28;
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
  updateTacticalSquadFormation(unit, dt, active);
  const mortarPivot = unit.mesh.userData.mortarPivot;
  if (mortarPivot) {
    mortarPivot.visible = !active;
    mortarPivot.userData.deployed = !active;
  }
  let blend = unit._walkBlend ?? 0;
  const unitSpeed = Math.max(0.1, Number(unit.def?.speed) || 0);
  const measuredSpeed = active && dt > 0 ? moved / dt : 0;
  const motionRatioTarget = active
    ? THREE.MathUtils.clamp(measuredSpeed / unitSpeed, 0, 1.2)
    : 0;
  const motionAlpha = 1 - Math.exp(-Math.max(0, dt) * 10);
  unit._walkMotionRatio = THREE.MathUtils.lerp(
    unit._walkMotionRatio ?? 0,
    motionRatioTarget,
    motionAlpha
  );
  const speedRunTarget = THREE.MathUtils.clamp(
    (unitSpeed - HUMAN_WALK_SPEED) / Math.max(0.1, HUMAN_RUN_SPEED - HUMAN_WALK_SPEED),
    0,
    1
  );
  unit._walkRunBlend = THREE.MathUtils.lerp(
    unit._walkRunBlend ?? 0,
    speedRunTarget * THREE.MathUtils.clamp(0.72 + (unit._walkMotionRatio ?? 0) * 0.28, 0, 1),
    motionAlpha
  );
  if (active) {
    blend = Math.min(1, blend + dt * 7);
    const cadence = Math.max(4.5, unitSpeed * (1.24 + (unit._walkRunBlend ?? 0) * 0.16));
    const cadenceScale = 0.72 + THREE.MathUtils.clamp(unit._walkMotionRatio ?? 0, 0, 1) * 0.28;
    unit._walkPhase = (unit._walkPhase ?? 0) + dt * cadence * cadenceScale;
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
    animateSoldierWalk(
      child,
      unit._walkPhase ?? 0,
      blend,
      unit._walkRunBlend ?? 0
    );
  });
}
