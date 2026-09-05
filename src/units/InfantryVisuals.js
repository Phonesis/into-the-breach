import * as THREE from 'three';
import { getInfantryMaterials } from './UnitTextures.js';
import {
  isInRange,
  isSmokeShellTarget,
  isSpotterRifleInRange,
} from '../game/Targeting.js';

const POSE_YAW = [0, 0.18, -0.14, 0.24, -0.2, 0.1, -0.26, 0.16];
const POSE_LEAN = [0, 0.04, -0.03, 0.05, -0.04, 0.02, -0.05, 0.03];
// Golden-angle spacing so a 5-man squad is not clustered on one footfall.
const WALK_PHASE_STEP = 2.399963;
const WALK_CADENCE = [0.91, 1.09, 0.86, 1.15, 0.97, 1.04, 0.88, 1.12];
const WALK_STRIDE = [1.04, 0.9, 1.12, 0.86, 0.98, 1.08, 0.93, 1.16];
const WALK_BOUNCE = [0.92, 1.18, 0.8, 1.08, 1.24, 0.86, 1.02, 1.14];
const WALK_TWIST = [1.06, 0.84, 1.22, 0.92, 1.14, 0.78, 1.08, 0.96];
const TORSO_EQUIPMENT_SKIP = new Set(['sniperConcealment', 'spotterBinoculars']);

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
  'truckDriver',
  'commander',
]);

const PRONE_FIRE_TYPES = new Set([
  'radioOperator',
  'infantry',
  'medic',
  'paratrooper',
  'engineer',
  'sniper',
  'vehicleCrew',
  'truckDriver',
  'commander',
]);
// All current handheld-weapon roles use the same aim and prone-fire pose.
// Crew-served MG/mortar teams keep their separate deployed-weapon animation.
const WEAPON_POSE_TYPES = PRONE_FIRE_TYPES;

// Foot troops use a broad range of movement speeds. Keep the slower support
// teams on a compact marching gait while allowing riflemen and airborne units
// to transition naturally into a more urgent run.
const HUMAN_WALK_SPEED = 3.7;
const HUMAN_RUN_SPEED = 5.5;
const PRONE_FIRE_GRACE_SEC = 0.18;

/** True while a foot squad is visually prone (stationary and firing). */
export function isUnitVisuallyProne(unit) {
  if (!unit?.mesh || unit.dead || unit._trenchId || unit._mountedOnTankId) return false;
  if (!usesInfantryProneFirePose(unit.def?.type)) return false;
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
  'medic',
  'sniper',
  'engineer',
  'machineGun',
  'mortar',
  'vehicleCrew',
  'truckDriver',
  'commander',
]);

/** Shared role contract for handheld infantry weapons and prone firing. */
export function usesInfantryWeaponPose(type) {
  return WEAPON_POSE_TYPES.has(type);
}

export function usesInfantryProneFirePose(type) {
  return PRONE_FIRE_TYPES.has(type);
}

const _muzzleTip = new THREE.Vector3();
const _mgTargetLocal = new THREE.Vector3();
const _mortarTargetLocal = new THREE.Vector3();
const _weaponArmShoulderWorld = new THREE.Vector3();
const _weaponArmStart = new THREE.Vector3();
const _weaponArmDelta = new THREE.Vector3();
const _weaponArmOrigin = new THREE.Vector3();
const _weaponArmShoulderOffsets = [
  new THREE.Vector3(0.105, 0.1, 0.08),
  new THREE.Vector3(-0.105, 0.1, 0.08),
];
// In the prone pose the visible cylinders read better as bent forearms: the
// trigger elbow sits outside the right shoulder while the support arm reaches
// across from the left. This avoids one oversized straight arm through the
// chest without adding more animated meshes per soldier.
const _weaponArmProneOffsets = [
  new THREE.Vector3(0.19, 0.02, -0.016),
  new THREE.Vector3(-0.12, 0.2, 0.02),
];

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

function createWalkStyle(squadIndex = 0) {
  const i = Math.max(0, squadIndex | 0);
  const slot = i % 8;
  return {
    phaseOffset: (i * WALK_PHASE_STEP + 0.37) % (Math.PI * 2),
    cadence: WALK_CADENCE[slot],
    stride: WALK_STRIDE[slot],
    bounce: WALK_BOUNCE[slot],
    twist: WALK_TWIST[slot],
    hunch: (slot % 5) * 0.018,
    sway: 0.82 + (slot % 4) * 0.09,
    asymmetry: ((slot % 5) - 2) * 0.05,
    glancePhase: (i * 1.973 + 0.6) % (Math.PI * 2),
    glanceAmp: 0.05 + (slot % 4) * 0.018,
    weaponLag: 0.22 + (slot % 5) * 0.07,
  };
}

function getWalkStyle(soldier) {
  return (soldier.userData.walkStyle ??= createWalkStyle(soldier.userData.squadIndex ?? 0));
}

function soldierGaitPhase(soldier, phase) {
  const style = getWalkStyle(soldier);
  return phase * style.cadence + style.phaseOffset;
}

/** Packs, webbing and radios are rigid to the chest, so torso motion carries them. */
function attachTorsoEquipment(soldier, torso) {
  if (!soldier || !torso) return;
  soldier.updateWorldMatrix(true, true);
  const moving = [];
  for (const child of soldier.children) {
    if (child === torso || child.userData?.infantryPart) continue;
    if (TORSO_EQUIPMENT_SKIP.has(child.name)) continue;
    moving.push(child);
  }
  for (const child of moving) torso.attach(child);
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
    // Handheld weapons are posed after movement in updateInfantryWeaponPose.
    // Restoring them here snaps barrels back to port-arms, so combat muzzle
    // flashes (which sample between walk restore and the pose pass) leave the
    // chest instead of the prone barrel.
    if (child.userData.infantryPart === 'weapon' && soldier.userData.weaponAim) continue;
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

function handPositionsForKind(kind) {
  if (kind === 'smg') {
    return [new THREE.Vector3(-0.02, -0.008, 0.07), new THREE.Vector3(0.1, 0.002, 0.07)];
  }
  if (kind === 'lmg') {
    return [new THREE.Vector3(-0.04, -0.012, 0.08), new THREE.Vector3(0.2, 0.008, 0.072)];
  }
  return [new THREE.Vector3(-0.02, -0.005, 0.075), new THREE.Vector3(0.17, 0.005, 0.075)];
}

function tagBarrel(mesh, sign = -1) {
  mesh.userData.infantryPart = 'barrel';
  mesh.userData.muzzleTipSign = sign;
  if (mesh.userData.muzzleMarker) {
    mesh.userData.muzzleMarker.position.set(
      0,
      ((mesh.geometry?.parameters?.height ?? 0.4) / 2) * sign,
      0
    );
    return mesh;
  }
  const height = mesh.geometry?.parameters?.height ?? 0.4;
  const tip = new THREE.Object3D();
  tip.name = 'muzzleMarker';
  tip.position.set(0, (height / 2) * sign, 0);
  mesh.add(tip);
  mesh.userData.muzzleMarker = tip;
  return mesh;
}

function addWeaponHands(weapon, mats) {
  if (weapon.userData.handsAdded) return;
  weapon.userData.handsAdded = true;
  weapon.userData.weaponHandPositions = handPositionsForKind(
    weapon.userData.weaponKind ?? 'rifle'
  );
  const rearHand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 7, 6), mats.skin);
  rearHand.scale.set(1.2, 0.9, 0.9);
  rearHand.position.copy(weapon.userData.weaponHandPositions[0]);
  weapon.add(rearHand);

  const frontHand = rearHand.clone();
  frontHand.position.copy(weapon.userData.weaponHandPositions[1]);
  weapon.add(frontHand);

  const rearArm = addSegment(
    weapon,
    new THREE.Vector3(-0.17, 0.1, -0.02),
    weapon.userData.weaponHandPositions[0],
    0.043,
    mats.body
  );
  const frontArm = addSegment(
    weapon,
    new THREE.Vector3(0.09, 0.1, -0.02),
    weapon.userData.weaponHandPositions[1],
    0.043,
    mats.body
  );
  rearArm.name = 'weaponArmRear';
  frontArm.name = 'weaponArmFront';
  rearArm.userData.segmentLength = rearArm.geometry.parameters.height;
  frontArm.userData.segmentLength = frontArm.geometry.parameters.height;
  weapon.userData.weaponArms = [rearArm, frontArm];
}

/** Attach the invisible receiver port used as the origin for an ejected case. */
function addCasingEjectionPoint(weapon, kind = 'rifle') {
  const point = new THREE.Object3D();
  point.name = 'smallArmsCasingEjectionPoint';
  point.position.set(
    kind === 'lmg' ? 0.055 : 0.035,
    kind === 'sniperRifle' ? 0.058 : 0.048,
    kind === 'lmg' ? 0.145 : 0.135
  );
  // Handheld weapons point along local +X. The ejection port is on their
  // visible side (+Z), with the bolt/breech behind it (-X).
  point.userData.casingEjectionAxis = new THREE.Vector3(0, 0, 1);
  point.userData.casingEjectionRearAxis = new THREE.Vector3(-1, 0, 0);
  weapon.add(point);
  weapon.userData.casingEjectionPoint = point;
}

function createWeaponGroup(soldier, { crouching = false, kind = 'rifle' } = {}) {
  const torsoY = soldier.userData._torsoY ?? (crouching ? 0.34 : 0.42);
  const weapon = new THREE.Group();
  weapon.name = 'infantryWeapon';
  weapon.userData.infantryPart = 'weapon';
  weapon.userData.weaponKind = kind;
  weapon.position.set(0.05, torsoY + 0.02, 0.04);
  soldier.add(weapon);
  addCasingEjectionPoint(weapon, kind);
  return weapon;
}

function addSniperScope(weapon, mats, factionId) {
  const dark = mats.dark;
  const metal = mats.metal;
  const scope = new THREE.Group();
  scope.name = 'sniperScope';

  if (factionId === 'usa') {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.28, 8), dark);
    tube.rotation.z = Math.PI / 2;
    tube.position.set(0.1, 0.055, 0.055);
    const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.022, 0.05, 8), metal);
    eye.rotation.z = Math.PI / 2;
    eye.position.set(-0.02, 0.055, 0.055);
    const obj = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.045, 8), metal);
    obj.rotation.z = Math.PI / 2;
    obj.position.set(0.24, 0.055, 0.055);
    scope.add(tube, eye, obj);
  } else if (factionId === 'russia') {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.16, 8), dark);
    tube.rotation.z = Math.PI / 2;
    tube.position.set(0.02, 0.055, 0.055);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.03, 8), metal);
    ring.rotation.z = Math.PI / 2;
    ring.position.set(-0.05, 0.055, 0.055);
    scope.add(tube, ring);
  } else if (factionId === 'uk') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.045, 0.04), dark);
    body.position.set(0.06, 0.058, 0.05);
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.03, 8), metal);
    drum.position.set(0.04, 0.082, 0.05);
    scope.add(body, drum);
  } else if (factionId === 'japan') {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.017, 0.18, 8), dark);
    tube.rotation.z = Math.PI / 2;
    tube.position.set(0.08, 0.05, 0.09);
    scope.add(tube);
  } else {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.02, 0.26, 8), dark);
    tube.rotation.z = Math.PI / 2;
    tube.position.set(0.12, 0.055, 0.05);
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.04, 8), metal);
    bell.rotation.z = Math.PI / 2;
    bell.position.set(0.25, 0.055, 0.05);
    scope.add(tube, bell);
  }

  weapon.add(scope);
}

function addFactionRifle(soldier, mats, factionId, { crouching = false, sniper = false } = {}) {
  const weapon = createWeaponGroup(soldier, {
    crouching,
    kind: sniper ? 'sniperRifle' : 'rifle',
  });
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
    if (!sniper) {
      const bayonet = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.012, 0.022), mats.metal);
      bayonet.position.set(0.48, -0.005, 0.07);
      weapon.add(bayonet);
    }
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
  if (rifleBarrel) tagBarrel(rifleBarrel, -1);
  if (sniper) addSniperScope(weapon, mats, factionId);
  addWeaponHands(weapon, mats);

  return weapon;
}

export function addFactionSniperRifle(soldier, mats, factionId, { crouching = true } = {}) {
  return addFactionRifle(soldier, mats, factionId, { crouching, sniper: true });
}

function addBipod(weapon, mats, x, y = -0.02, z = 0.07) {
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.16, 5), mats.metal);
    leg.position.set(x, y - 0.05, z + side * 0.04);
    leg.rotation.x = side * 0.55;
    leg.rotation.z = 0.18;
    weapon.add(leg);
  }
}

function addFactionSmg(soldier, mats, factionId, { crouching = false } = {}) {
  const weapon = createWeaponGroup(soldier, { crouching, kind: 'smg' });
  const dark = mats.dark;
  const wood = mats.wood;
  const metal = mats.metal;

  if (factionId === 'germany') {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.055), dark);
    receiver.position.set(0.02, 0.01, 0.07);
    weapon.add(receiver);
    const stockArm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.018, 0.04), metal);
    stockArm.position.set(-0.14, 0.005, 0.07);
    weapon.add(stockArm);
    const stockPlate = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.07, 0.05), metal);
    stockPlate.position.set(-0.22, -0.01, 0.07);
    weapon.add(stockPlate);
    const barrel = tagBarrel(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.28, 7), dark));
    barrel.position.set(0.2, 0.012, 0.07);
    barrel.rotation.z = Math.PI / 2;
    weapon.add(barrel);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.055), dark);
    mag.position.set(0.02, -0.1, 0.07);
    weapon.add(mag);
  } else if (factionId === 'usa') {
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.055, 0.055), wood);
    stock.position.set(-0.12, -0.005, 0.07);
    weapon.add(stock);
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.055, 0.06), dark);
    receiver.position.set(0.04, 0.01, 0.07);
    weapon.add(receiver);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.09, 0.04), wood);
    grip.position.set(-0.02, -0.05, 0.07);
    grip.rotation.z = 0.25;
    weapon.add(grip);
    const barrel = tagBarrel(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.26, 7), dark));
    barrel.position.set(0.2, 0.014, 0.07);
    barrel.rotation.z = Math.PI / 2;
    weapon.add(barrel);
    const compensator = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.028, 0.028), metal);
    compensator.position.set(0.34, 0.014, 0.07);
    weapon.add(compensator);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.18, 0.048), dark);
    mag.position.set(0.05, -0.085, 0.07);
    weapon.add(mag);
  } else if (factionId === 'russia') {
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.055), wood);
    stock.position.set(-0.12, 0, 0.07);
    weapon.add(stock);
    const jacket = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.22, 8), dark);
    jacket.position.set(0.12, 0.012, 0.07);
    jacket.rotation.z = Math.PI / 2;
    weapon.add(jacket);
    const barrel = tagBarrel(new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.016, 0.2, 7), dark));
    barrel.position.set(0.28, 0.012, 0.07);
    barrel.rotation.z = Math.PI / 2;
    weapon.add(barrel);
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 10), dark);
    drum.rotation.x = Math.PI / 2;
    drum.position.set(0.02, -0.03, 0.1);
    weapon.add(drum);
  } else if (factionId === 'japan') {
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.055, 0.05), wood);
    stock.position.set(-0.12, 0, 0.07);
    weapon.add(stock);
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.045, 0.05), dark);
    receiver.position.set(0.04, 0.008, 0.07);
    weapon.add(receiver);
    const barrel = tagBarrel(new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.016, 0.24, 7), dark));
    barrel.position.set(0.2, 0.01, 0.07);
    barrel.rotation.z = Math.PI / 2;
    weapon.add(barrel);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.045), dark);
    mag.position.set(0.03, -0.06, 0.07);
    mag.rotation.z = 0.35;
    weapon.add(mag);
  } else {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.024, 0.22, 7), metal);
    tube.position.set(0.04, 0.01, 0.07);
    tube.rotation.z = Math.PI / 2;
    weapon.add(tube);
    const stockWire = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.014, 0.04), metal);
    stockWire.position.set(-0.12, 0.005, 0.07);
    weapon.add(stockWire);
    const stockButt = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.045), metal);
    stockButt.position.set(-0.2, -0.01, 0.07);
    weapon.add(stockButt);
    const barrel = tagBarrel(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, 0.18, 7), dark));
    barrel.position.set(0.2, 0.01, 0.07);
    barrel.rotation.z = Math.PI / 2;
    weapon.add(barrel);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.042, 0.048), dark);
    mag.position.set(0.02, 0.0, 0.155);
    weapon.add(mag);
  }

  addWeaponHands(weapon, mats);
  return weapon;
}

function addFactionLmg(soldier, mats, factionId, { crouching = false } = {}) {
  const weapon = createWeaponGroup(soldier, { crouching, kind: 'lmg' });
  const dark = mats.dark;
  const wood = mats.wood;
  const metal = mats.metal;

  if (factionId === 'germany') {
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.055, 0.06), wood);
    stock.position.set(-0.12, 0, 0.07);
    weapon.add(stock);
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.055, 0.06), dark);
    receiver.position.set(0.04, 0.012, 0.07);
    weapon.add(receiver);
    const jacket = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.32, 8), dark);
    jacket.position.set(0.22, 0.016, 0.07);
    jacket.rotation.z = Math.PI / 2;
    weapon.add(jacket);
    const barrel = tagBarrel(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.22, 7), dark));
    barrel.position.set(0.44, 0.016, 0.07);
    barrel.rotation.z = Math.PI / 2;
    weapon.add(barrel);
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.05, 10), dark);
    drum.rotation.x = Math.PI / 2;
    drum.position.set(0.0, 0.02, 0.12);
    weapon.add(drum);
    addBipod(weapon, mats, 0.34, -0.01, 0.07);
  } else if (factionId === 'usa') {
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.06), wood);
    stock.position.set(-0.14, 0, 0.07);
    weapon.add(stock);
    const forend = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.055), wood);
    forend.position.set(0.08, -0.005, 0.07);
    weapon.add(forend);
    const barrel = tagBarrel(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.42, 7), dark));
    barrel.position.set(0.28, 0.016, 0.07);
    barrel.rotation.z = Math.PI / 2;
    weapon.add(barrel);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.17, 0.05), dark);
    mag.position.set(0.02, -0.085, 0.07);
    weapon.add(mag);
    const gasTube = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.012, 0.22, 6), metal);
    gasTube.position.set(0.2, 0.04, 0.07);
    gasTube.rotation.z = Math.PI / 2;
    weapon.add(gasTube);
    addBipod(weapon, mats, 0.32, -0.012, 0.07);
  } else if (factionId === 'russia') {
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.055, 0.055), wood);
    stock.position.set(-0.13, 0, 0.07);
    weapon.add(stock);
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.055), dark);
    receiver.position.set(0.04, 0.01, 0.07);
    weapon.add(receiver);
    const barrel = tagBarrel(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.4, 7), dark));
    barrel.position.set(0.26, 0.016, 0.07);
    barrel.rotation.z = Math.PI / 2;
    weapon.add(barrel);
    const pan = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.045, 12), dark);
    pan.position.set(0.02, 0.065, 0.07);
    weapon.add(pan);
    const panRim = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.012, 6, 14), metal);
    panRim.rotation.x = Math.PI / 2;
    panRim.position.set(0.02, 0.088, 0.07);
    weapon.add(panRim);
    addBipod(weapon, mats, 0.3, -0.012, 0.07);
  } else if (factionId === 'japan') {
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.055, 0.055), wood);
    stock.position.set(-0.12, 0, 0.07);
    weapon.add(stock);
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.055, 0.055), dark);
    receiver.position.set(0.04, 0.01, 0.07);
    weapon.add(receiver);
    const jacket = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.28, 8), dark);
    jacket.position.set(0.22, 0.014, 0.07);
    jacket.rotation.z = Math.PI / 2;
    weapon.add(jacket);
    const barrel = tagBarrel(new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.016, 0.22, 7), dark));
    barrel.position.set(0.42, 0.014, 0.07);
    barrel.rotation.z = Math.PI / 2;
    weapon.add(barrel);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.048), dark);
    mag.position.set(0.02, 0.1, 0.07);
    mag.rotation.z = -0.12;
    weapon.add(mag);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.06, 0.02), metal);
    handle.position.set(0.08, 0.055, 0.07);
    weapon.add(handle);
    addBipod(weapon, mats, 0.32, -0.012, 0.07);
  } else {
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.058, 0.06), wood);
    stock.position.set(-0.12, 0, 0.07);
    weapon.add(stock);
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.06), dark);
    receiver.position.set(0.04, 0.012, 0.07);
    weapon.add(receiver);
    const barrel = tagBarrel(new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.022, 0.4, 7), dark));
    barrel.position.set(0.28, 0.02, 0.07);
    barrel.rotation.z = Math.PI / 2;
    weapon.add(barrel);
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.03, 0.06, 7), metal);
    cone.position.set(0.5, 0.02, 0.07);
    cone.rotation.z = Math.PI / 2;
    weapon.add(cone);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.22, 0.055), dark);
    mag.position.set(0.02, 0.13, 0.07);
    mag.rotation.z = 0.18;
    weapon.add(mag);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.07, 0.02), metal);
    handle.position.set(0.1, 0.06, 0.07);
    weapon.add(handle);
    addBipod(weapon, mats, 0.34, -0.01, 0.07);
  }

  addWeaponHands(weapon, mats);
  return weapon;
}

const INFANTRY_SQUAD_LOADOUT = ['smg', 'lmg', 'rifle', 'smg', 'rifle'];
const ENGINEER_SQUAD_LOADOUT = ['smg', 'rifle', 'smg', 'rifle'];
const PARATROOPER_SQUAD_LOADOUT = ['atLauncher', 'lmg', 'smg', 'rifle'];
const COMMANDER_SQUAD_LOADOUT = ['rifle', 'smg', 'rifle', 'smg', 'rifle'];

/** Handheld small-arm kind for a visible squad member. */
export function squadWeaponKindForMember(unitType, squadIndex = 0) {
  if (unitType === 'infantry') return INFANTRY_SQUAD_LOADOUT[squadIndex] ?? 'rifle';
  if (unitType === 'engineer') return ENGINEER_SQUAD_LOADOUT[squadIndex] ?? 'rifle';
  if (unitType === 'paratrooper') return PARATROOPER_SQUAD_LOADOUT[squadIndex] ?? 'rifle';
  if (unitType === 'commander') return COMMANDER_SQUAD_LOADOUT[squadIndex] ?? 'rifle';
  if (unitType === 'vehicleCrew') return squadIndex === 0 ? 'smg' : 'rifle';
  return 'rifle';
}

export function addFactionSmallArm(soldier, mats, factionId, opts = {}) {
  const kind = opts.kind ?? 'rifle';
  if (kind === 'smg') return addFactionSmg(soldier, mats, factionId, opts);
  if (kind === 'lmg') return addFactionLmg(soldier, mats, factionId, opts);
  return addFactionRifle(soldier, mats, factionId, opts);
}

export function vfxTypeForWeaponKind(kind) {
  if (kind === 'lmg') return 'machineGun';
  if (kind === 'atLauncher') return 'paratrooperAt';
  return 'infantry';
}

function getWeaponAimPresets(kind, crouching, gunner) {
  if (gunner) return null;
  if (kind === 'atLauncher') {
    return {
      lowered: { x: -0.42, y: 0.32, z: 0.02 },
      raised: { x: -0.12, y: -Math.PI / 2 + 0.08, z: 0.02 },
      prone: {
        position: { x: 0.23, y: 0.21, z: 0.42 },
        lowered: { x: -0.2, y: -Math.PI / 2 + 0.04, z: 0.03 },
        raised: { x: -0.08, y: -Math.PI / 2 + 0.08, z: 0.02 },
      },
    };
  }
  if (kind === 'smg') {
    return {
      lowered: { x: -0.28, y: 0.42, z: 0.5 },
      raised: { x: -0.12, y: -Math.PI / 2 + 0.14, z: 0.02 },
      prone: {
        position: { x: 0.18, y: 0.23, z: 0.44 },
        lowered: { x: -0.1, y: -Math.PI / 2 + 0.08, z: 0.04 },
        raised: { x: -0.04, y: -Math.PI / 2 + 0.12, z: 0.02 },
      },
    };
  }
  if (kind === 'lmg') {
    return {
      lowered: { x: -0.32, y: 0.48, z: 0.52 },
      raised: { x: -0.16, y: -Math.PI / 2 + 0.1, z: 0.02 },
      prone: {
        position: { x: 0.22, y: 0.22, z: 0.5 },
        lowered: { x: -0.1, y: -Math.PI / 2 + 0.05, z: 0.04 },
        raised: { x: -0.03, y: -Math.PI / 2 + 0.1, z: 0.02 },
      },
    };
  }
  if (kind === 'sniperRifle' || crouching) {
    return {
      lowered: { x: -0.3, y: 0.14, z: 0.02 },
      // Compact troops still shoulder the rifle toward the enemy. The old
      // crouched preset left the barrel pointing across the soldier's side.
      raised: { x: -0.1, y: -Math.PI / 2 + 0.1, z: 0.02 },
      prone: {
        position: { x: 0.2, y: 0.245, z: 0.46 },
        lowered: { x: -0.12, y: -Math.PI / 2 + 0.06, z: 0.04 },
        raised: { x: -0.04, y: -Math.PI / 2 + 0.1, z: 0.02 },
      },
    };
  }
  return {
    lowered: { x: -0.35, y: 0.55, z: 0.62 },
    raised: { x: -0.18, y: -Math.PI / 2 + 0.12, z: 0.02 },
    prone: {
      // Keep the butt at the firing shoulder and the barrel just above the
      // ground in front of the helmet. These are soldier-local coordinates,
      // so they remain correct while the whole unit turns toward its target.
      position: { x: 0.2, y: 0.245, z: 0.46 },
      lowered: { x: -0.12, y: -Math.PI / 2 + 0.06, z: 0.04 },
      raised: { x: -0.04, y: -Math.PI / 2 + 0.12, z: 0.02 },
    },
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

/**
 * A ground point is an aiming target only while it remains the unit's explicit
 * fire mission. This keeps rifles trained on open terrain without confusing a
 * normal movement destination with something the squad should shoot at.
 */
function getInfantryFireTarget(unit) {
  const order = unit.attackOrder;
  if (order && !order.dead && !isSmokeShellTarget(order)) return order;
  return getEngagementTarget(unit);
}

function isSoldierAiming(unit, soldier) {
  if (!soldier.userData.weaponAim) return false;
  if (soldier.userData.walkPose?.gunner) return false;
  if ((unit._walkBlend ?? 0) > 0.06) return false;
  if (unit.def?.nonCombat || (unit.def?.damage ?? 0) <= 0) return false;
  if ((unit._fireAimHold ?? 0) > 0) return true;

  const target = getInfantryFireTarget(unit);
  if (!target) return false;

  // Shift+LMB ground fire is a live engagement, not an empty target slot.
  // Every rifle-bearing member should hold the sight picture until that
  // explicit order is cancelled, even when there is no scenery object there.
  if (target.isGround) {
    return unit.attackOrder === target && isInRange(unit, target);
  }

  const weapon = soldier.children.find((c) => c.userData.infantryPart === 'weapon');
  const kind = weapon?.userData.weaponKind ?? 'rifle';
  if (kind === 'atLauncher') {
    return ARMOR_TARGET_TYPES.has(target.def?.type) && isInRange(unit, target);
  }
  if (unit.def?.type === 'sniper' && soldier.userData.sniperRole === 'spotter') {
    return isSpotterRifleInRange(unit, target);
  }

  return isInRange(unit, target);
}

function applySoldierPronePose(soldier, proneBlend, phase = 0, firePulse = 0) {
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
    const part = child.userData.infantryPart;
    // The body rolls onto its front, but the head stays raised and pitched
    // toward the unit's forward direction (the unit yaw already tracks its
    // target). This keeps the face above the rifle instead of looking into
    // the ground.
    const pronePitch = part === 'head' || part === 'helmet' ? -0.18 : angle;
    child.rotation.x = rotation.x + pronePitch * t;
    child.rotation.y =
      part === 'head' || part === 'helmet'
        ? THREE.MathUtils.lerp(rotation.y, rotation.y - soldier.rotation.y, t)
        : rotation.y;
    child.rotation.z = rotation.z;

    const breathing = Math.sin(phase * 2.1) * 0.0045 * t;
    if (part === 'torso' || part === 'head' || part === 'helmet') {
      const headRaise = part === 'head' || part === 'helmet' ? 0.018 * t : 0;
      child.position.y += breathing + headRaise + firePulse * 0.004;
      child.position.z += breathing * 0.6;
    }
  }
}

function updateWeaponArmSegment(mesh, from, to) {
  if (!mesh) return;
  _weaponArmDelta.subVectors(to, from);
  const length = _weaponArmDelta.length();
  if (length <= 0.0001) {
    mesh.visible = false;
    return;
  }
  mesh.visible = true;
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(_up, _weaponArmDelta.normalize());
  const baseLength = mesh.userData.segmentLength ?? length;
  mesh.scale.set(1, length / Math.max(0.0001, baseLength), 1);
}

/** Keep the low-poly arms connected to the actual shoulder and firing grip. */
function updateWeaponArmPose(soldier, weapon, proneBlend = 0) {
  const arms = weapon.userData.weaponArms;
  const handPositions = weapon.userData.weaponHandPositions;
  const torso = soldier.children.find((child) => child.userData.infantryPart === 'torso');
  if (!arms?.length || !handPositions?.length || !torso) return;

  soldier.updateWorldMatrix(true, true);
  weapon.updateWorldMatrix(true, true);
  const prone = THREE.MathUtils.clamp(proneBlend, 0, 1);
  for (let i = 0; i < arms.length; i++) {
    _weaponArmOrigin.lerpVectors(
      _weaponArmShoulderOffsets[i],
      _weaponArmProneOffsets[i],
      prone
    );
    torso.localToWorld(_weaponArmShoulderWorld.copy(_weaponArmOrigin));
    weapon.worldToLocal(_weaponArmStart.copy(_weaponArmShoulderWorld));
    updateWeaponArmSegment(arms[i], _weaponArmStart, handPositions[i]);
  }
}

function applySoldierWeaponPose(soldier, aimBlend, proneBlend = 0, firePulse = 0) {
  const weapon = soldier.children.find((c) => c.userData.infantryPart === 'weapon');
  const aim = soldier.userData.weaponAim;
  const rest = soldier.userData.walkRest?.weapon;
  if (!weapon || !aim || !rest) return;

  const t = THREE.MathUtils.clamp(aimBlend, 0, 1);
  const prone = THREE.MathUtils.clamp(proneBlend, 0, 1);
  const standingY = rest.position.y + THREE.MathUtils.lerp(0, 0.1, t);
  const standingZ = rest.position.z + THREE.MathUtils.lerp(0, 0.06, t);
  const pronePose = aim.prone ?? {
    position: { x: rest.position.x, y: 0.21, z: 0.44 },
    lowered: aim.raised,
    raised: aim.raised,
  };
  const proneRotation = {
    x: THREE.MathUtils.lerp(pronePose.lowered.x, pronePose.raised.x, t),
    y: THREE.MathUtils.lerp(pronePose.lowered.y, pronePose.raised.y, t),
    z: THREE.MathUtils.lerp(pronePose.lowered.z, pronePose.raised.z, t),
  };
  weapon.position.x = THREE.MathUtils.lerp(rest.position.x, pronePose.position.x, prone);
  weapon.position.y = THREE.MathUtils.lerp(standingY, pronePose.position.y, prone);
  weapon.position.z = THREE.MathUtils.lerp(standingZ, pronePose.position.z, prone);
  weapon.rotation.x = THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(aim.lowered.x, aim.raised.x, t),
    proneRotation.x,
    prone
  );
  weapon.rotation.y = THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(aim.lowered.y, aim.raised.y, t),
    proneRotation.y,
    prone
  );
  weapon.rotation.z = THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(aim.lowered.z, aim.raised.z, t),
    proneRotation.z,
    prone
  );

  // A short, weapon-local recoil kick gives the prone pose a readable firing
  // beat without moving the soldier's gameplay position or muzzle origin.
  const recoil = THREE.MathUtils.clamp(firePulse, 0, 1) * (0.018 + prone * 0.01);
  weapon.position.z -= recoil;
  weapon.rotation.x -= recoil * (0.7 + prone * 0.35);
  updateWeaponArmPose(soldier, weapon, prone);
}

function applyMarchingWeaponSway(soldier, phase, blend, runBlend) {
  const weapon = soldier.children.find((c) => c.userData.infantryPart === 'weapon');
  if (!weapon || blend <= 0.001) return;

  const { gunner = false, crouching = false } = soldier.userData.walkPose ?? {};
  const compact = gunner || crouching;
  const style = getWalkStyle(soldier);
  const gaitPhase = soldierGaitPhase(soldier, phase);
  const scale = (compact ? 0.45 : 1) * blend * style.sway;
  const sway = Math.sin(gaitPhase + Math.PI * 0.35 + style.weaponLag);
  const counter = Math.sin(gaitPhase + Math.PI * 1.05);
  const bob = 0.5 - Math.cos(gaitPhase * 2) * 0.5;
  const carry = 0.75 + runBlend * 0.45;

  // Port-arms follow the twisting shoulders and lag a little on each footfall.
  // Applied after aim/prone posing so a moving soldier never snaps back to fire.
  weapon.position.x += sway * 0.028 * scale * carry;
  weapon.position.y += (bob - 0.5) * (0.02 + runBlend * 0.012) * scale;
  weapon.position.z += counter * 0.03 * scale * carry;
  weapon.rotation.x += sway * (0.1 + runBlend * 0.06) * scale;
  weapon.rotation.y += counter * 0.05 * scale;
  weapon.rotation.z -= sway * (0.08 + runBlend * 0.04) * scale;
  if (soldier.userData.weaponAim) {
    updateWeaponArmPose(soldier, weapon, soldier.userData.proneBlend ?? 0);
  }
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
  let barrel = null;
  weapon.traverse((child) => {
    if (barrel || child === weapon) return;
    if (child.userData.infantryPart === 'barrel') barrel = child;
  });
  return (
    barrel ??
    weapon.children.find((c) => c.isMesh && (c.geometry?.parameters?.width ?? 0) > 0.3) ??
    null
  );
}

/** Re-apply the visible aim/prone weapon pose before sampling a muzzle. */
function syncSoldierWeaponMuzzlePose(unit, soldier) {
  if (!soldier?.userData.weaponAim) return;
  applySoldierWeaponPose(
    soldier,
    soldier.userData.weaponAimBlend ?? 0,
    soldier.userData.proneBlend ?? 0,
    unit?._fireAimPulse ?? 0
  );
}

function meshMuzzleWorldPos(mesh, out) {
  mesh.updateWorldMatrix(true, false);
  const marker = mesh.userData.muzzleMarker;
  if (marker) {
    marker.updateWorldMatrix(true, false);
    marker.getWorldPosition(out);
    return out;
  }
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
  if (weaponType === 'spotterRifle') {
    return (
      soldiers.find((s) => s.userData.sniperRole === 'spotter') ??
      soldiers.find((s) => s.userData.squadIndex === 1) ??
      soldiers[soldiers.length - 1]
    );
  }
  if (unit.def?.type === 'sniper') {
    return (
      soldiers.find((s) => s.userData.sniperRole === 'sniper') ??
      soldiers.find((s) => s.userData.squadIndex === 0) ??
      soldiers[0]
    );
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

  const soldiers = getVisibleSquadMembers(root);
  if (!soldiers.length) {
    out.copy(unit.position);
    out.y += 0.85;
    return out;
  }

  const soldier = pickFiringSoldier(unit, weaponType, soldiers);
  syncSoldierWeaponMuzzlePose(unit, soldier);
  root.updateWorldMatrix(true, true);
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

/** World-space receiver port for a single handheld small-arms discharge. */
export function getInfantryCasingEjectionPoint(unit, weaponType = 'infantry') {
  const root = unit?.mesh;
  if (!root) return null;
  if (unit.def?.type === 'machineGun') {
    return root.userData.machineGunCasingEjectionPoint ?? null;
  }

  const soldiers = getVisibleSquadMembers(root);
  if (!soldiers.length) return null;
  const soldier = pickFiringSoldier(unit, weaponType, soldiers);
  const weapon = soldier?.children.find((c) => c.userData.infantryPart === 'weapon');
  const point = weapon?.userData.casingEjectionPoint;
  if (!point?.isObject3D) return null;
  syncSoldierWeaponMuzzlePose(unit, soldier);
  root.updateWorldMatrix(true, true);
  return point;
}

export function usesInfantryMuzzleOrigin(unit) {
  return FOOT_MUZZLE_UNIT_TYPES.has(unit?.def?.type);
}

/** Multi-soldier handheld volleys: every living rifle/SMG/LMG flashes together. */
export function usesSquadVolleyMuzzles(unit, weaponType) {
  if (weaponType === 'paratrooperAt' || weaponType === 'spotterRifle') return false;
  const type = unit?.def?.type;
  if (type === 'sniper' || type === 'machineGun' || type === 'mortar') return false;
  return usesInfantryMuzzleOrigin(unit);
}

const _squadMuzzlePool = Array.from({ length: 8 }, () => new THREE.Vector3());

/**
 * World-space muzzle origins for every visible squad member still holding a
 * handheld weapon. AT launchers are skipped unless the shot is a para AT round.
 */
export function collectInfantrySquadMuzzleShots(unit, weaponType = 'infantry') {
  const shots = [];
  const root = unit?.mesh;
  if (!root) return shots;
  const soldiers = getVisibleSquadMembers(root);
  for (const soldier of soldiers) {
    const weapon = soldier.children.find((c) => c.userData.infantryPart === 'weapon');
    const kind = weapon?.userData.weaponKind ?? soldier.userData.weaponKind ?? 'rifle';
    if (kind === 'atLauncher' && weaponType !== 'paratrooperAt') continue;
    if (weaponType === 'paratrooperAt' && kind !== 'atLauncher') continue;
    syncSoldierWeaponMuzzlePose(unit, soldier);
  }
  root.updateWorldMatrix(true, true);
  for (const soldier of soldiers) {
    const weapon = soldier.children.find((c) => c.userData.infantryPart === 'weapon');
    const kind = weapon?.userData.weaponKind ?? soldier.userData.weaponKind ?? 'rifle';
    if (kind === 'atLauncher' && weaponType !== 'paratrooperAt') continue;
    if (weaponType === 'paratrooperAt' && kind !== 'atLauncher') continue;
    const muzzleMesh = findMuzzleMesh(soldier, kind === 'atLauncher' ? 'paratrooperAt' : 'infantry');
    if (!muzzleMesh) continue;
    const position = _squadMuzzlePool[shots.length] ?? new THREE.Vector3();
    meshMuzzleWorldPos(muzzleMesh, position);
    shots.push({
      position,
      kind,
      vfxType: vfxTypeForWeaponKind(kind),
    });
  }
  return shots;
}

/** Weapon kinds still carried by living (visible) squad members. */
export function collectVisibleSquadWeaponKinds(unit) {
  const kinds = [];
  const root = unit?.mesh;
  if (!root) return kinds;
  root.traverse((child) => {
    if (child.name !== 'squadMember' || !child.visible) return;
    const weapon = child.children.find((c) => c.userData.infantryPart === 'weapon');
    const kind = weapon?.userData.weaponKind ?? child.userData.weaponKind;
    if (kind && kind !== 'atLauncher') kinds.push(kind);
  });
  return kinds;
}

function handheldKindForSoldier(soldier) {
  const weapon = soldier.children.find((c) => c.userData.infantryPart === 'weapon');
  const kind = weapon?.userData.weaponKind ?? soldier.userData.weaponKind ?? null;
  if (!kind || kind === 'atLauncher') return null;
  return kind;
}

function squadFireInterval(kind, factionId) {
  if (kind === 'smg') {
    return factionId === 'russia' ? 0.24 + Math.random() * 0.28 : 0.34 + Math.random() * 0.36;
  }
  if (kind === 'lmg') {
    if (factionId === 'germany') return 0.18 + Math.random() * 0.22;
    if (factionId === 'usa') return 0.3 + Math.random() * 0.28;
    return 0.38 + Math.random() * 0.32;
  }
  if (factionId === 'usa') return 0.36 + Math.random() * 0.32;
  return 0.72 + Math.random() * 0.52;
}

function squadFireInitialDelay(kind, squadIndex) {
  const spread = 0.06 + squadIndex * 0.09 + Math.random() * 0.34;
  if (kind === 'lmg') return spread * 0.55;
  if (kind === 'smg') return spread * 0.7;
  return spread;
}

/**
 * Advance each living squad member's personal fire clock. Returns soldiers
 * who discharged this frame so VFX/SFX can spawn after the pose pass.
 */
export function tickInfantrySquadFireCadence(unit, dt) {
  const fired = [];
  if (!unit?.mesh || unit.dead || unit.surrendered || unit._captureExit || unit._dropping) {
    return fired;
  }
  if (!usesSquadVolleyMuzzles(unit, unit.def?.type)) return fired;

  const frameDt = Math.max(0, dt);
  const factionId = unit.faction?.id ?? 'germany';
  unit.mesh.traverse((soldier) => {
    if (soldier.name !== 'squadMember' || !soldier.visible) return;
    const kind = handheldKindForSoldier(soldier);
    if (!kind || !soldier.userData.weaponAim) {
      soldier.userData.fireWait = null;
      return;
    }
    const aiming =
      isSoldierAiming(unit, soldier) && (soldier.userData.weaponAimBlend ?? 0) > 0.42;
    if (!aiming) {
      soldier.userData.fireWait = null;
      return;
    }
    if (soldier.userData.fireWait == null) {
      soldier.userData.fireWait = squadFireInitialDelay(kind, soldier.userData.squadIndex ?? 0);
    }
    soldier.userData.fireWait -= frameDt;
    if (soldier.userData.fireWait > 0) return;
    soldier.userData.fireWait = squadFireInterval(kind, factionId);
    soldier.userData.firePulse = 1;
    fired.push({ soldier, kind });
  });
  return fired;
}

export function collectSoldierMuzzleShot(unit, soldier) {
  const kind = handheldKindForSoldier(soldier);
  if (!kind) return null;
  syncSoldierWeaponMuzzlePose(unit, soldier);
  soldier.updateWorldMatrix(true, true);
  const weapon = soldier.children.find((c) => c.userData.infantryPart === 'weapon');
  const muzzleMesh = findMuzzleMesh(soldier, 'infantry');
  if (!muzzleMesh) return null;
  const position = new THREE.Vector3();
  meshMuzzleWorldPos(muzzleMesh, position);
  return {
    position,
    kind,
    casingEjectionPoint: weapon?.userData.casingEjectionPoint ?? null,
    vfxType: vfxTypeForWeaponKind(kind),
    squadIndex: soldier.userData.squadIndex ?? 0,
  };
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

/** Keep rifles raised after shots and bridge a transient target reacquire gap. */
export function markInfantryFireAim(
  unit,
  holdSec = 0.5,
  proneHoldSec = holdSec + PRONE_FIRE_GRACE_SEC,
  target = null
) {
  if (!unit || !usesInfantryWeaponPose(unit.def?.type)) return;
  unit._fireAimHold = Math.max(unit._fireAimHold ?? 0, holdSec);
  unit._infantryProneFireHold = Math.max(
    unit._infantryProneFireHold ?? 0,
    proneHoldSec
  );
  unit._infantryProneFireTarget = target ?? unit.target ?? unit.attackOrder ?? null;
  unit._fireAimPulse = Math.max(unit._fireAimPulse ?? 0, 1);
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
    unitType = null,
    weaponKind = null,
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
  if (withRifle) {
    const kind = weaponKind ?? squadWeaponKindForMember(unitType, squadIndex);
    if (kind && kind !== 'atLauncher') {
      addFactionSmallArm(soldier, mats, factionId, {
        crouching: gunner || crouching,
        kind,
      });
      soldier.userData.weaponKind = kind;
    }
  }

  if (extraMeshes) extraMeshes(soldier, mats);

  const specialWeapon = soldier.children.find((c) => c.userData.infantryPart === 'weapon');
  if (specialWeapon) addWeaponHands(specialWeapon, mats);
  consolidateRigidSoldierEquipment(soldier);
  attachTorsoEquipment(soldier, torso);

  const yaw = POSE_YAW[squadIndex % POSE_YAW.length];
  const lean = POSE_LEAN[squadIndex % POSE_LEAN.length];
  soldier.rotation.y = yaw;
  soldier.position.set(x, lean * 0.04, z);
  soldier.name = 'squadMember';
  soldier.userData.squadIndex = squadIndex;
  soldier.userData.walkPose = { gunner, crouching };
  soldier.userData.walkStyle = createWalkStyle(squadIndex);
  soldier.userData.weaponAimBlend = 0;
  soldier.userData.proneBlend = 0;
  finalizeSoldierVisuals(soldier, { torso, head, helmet, ...legs }, soldier.position);
  parentGroup.add(soldier);
  return soldier;
}

/** Raise rifles while engaging; lower at port-arms when idle or marching. */
export function updateInfantryWeaponPose(unit, dt) {
  if (!unit?.mesh || unit.dead || unit.surrendered || unit._captureExit || unit._dropping) return;
  if (!usesInfantryWeaponPose(unit.def?.type)) return;

  const frameDt = Math.max(0, dt);
  unit._infantryPoseTime = (unit._infantryPoseTime ?? 0) + frameDt;
  unit._fireAimPulse = Math.max(0, (unit._fireAimPulse ?? 0) - frameDt * 8.5);

  if ((unit._underFireProneTimer ?? 0) > 0) {
    unit._underFireProneTimer = Math.max(0, unit._underFireProneTimer - dt);
  }

  if ((unit._fireAimHold ?? 0) > 0) {
    unit._fireAimHold = Math.max(0, unit._fireAimHold - frameDt);
  }

  if ((unit._infantryProneFireHold ?? 0) > 0) {
    unit._infantryProneFireHold = Math.max(
      0,
      unit._infantryProneFireHold - frameDt
    );
  }

  const movingFromPosition =
    !!unit.moveTarget ||
    !!unit._userMoveOrder ||
    (unit._walkBlend ?? 0) > 0.06;
  if (movingFromPosition) {
    // A move order is the explicit end of a firing position. Do not let the
    // last shot's grace period pull the squad back down while it marches.
    unit._infantryProneFireHold = 0;
    unit._infantryProneFireTarget = null;
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
      usesInfantryProneFirePose(unit.def?.type) &&
      !unit._mountedOnTankId &&
      !unit._trenchId &&
      !unit._diggingTrench;
    const stationary = !movingFromPosition;
    const underFireProne =
      stationary &&
      (unit._underFireProneTimer ?? 0) > 0;
    const rememberedFireTarget = unit._infantryProneFireTarget;
    const rememberedTargetStillActive =
      !!rememberedFireTarget &&
      !rememberedFireTarget.dead &&
      !isSmokeShellTarget(rememberedFireTarget) &&
      (!rememberedFireTarget.isGround || unit.attackOrder === rememberedFireTarget);
    const firingGrace =
      stationary &&
      (unit._infantryProneFireHold ?? 0) > 0 &&
      (rememberedTargetStillActive || !!getInfantryFireTarget(unit));
    const proneTarget =
      canGoProne &&
      stationary &&
      (targetBlend > 0 || firingGrace || underFireProne)
        ? 1
        : 0;
    const proneRate = proneTarget > (child.userData.proneBlend ?? 0) ? 7 : 5;
    const previousProneBlend = child.userData.proneBlend ?? 0;
    child.userData.proneBlend = THREE.MathUtils.lerp(
      previousProneBlend,
      proneTarget,
      Math.min(1, dt * proneRate)
    );
    if (child.userData.proneBlend < 0.001) child.userData.proneBlend = 0;

    const firePulse = usesSquadVolleyMuzzles(unit, unit.def?.type)
      ? child.userData.firePulse ?? 0
      : unit._fireAimPulse ?? 0;
    child.userData.firePulse = Math.max(0, (child.userData.firePulse ?? 0) - frameDt * 8.5);

    if (child.userData.proneBlend > 0 || previousProneBlend > 0) {
      applySoldierPronePose(
        child,
        child.userData.proneBlend,
        unit._infantryPoseTime + (child.userData.squadIndex ?? 0) * 0.63,
        firePulse
      );
    }
    applySoldierWeaponPose(
      child,
      child.userData.weaponAimBlend,
      child.userData.proneBlend,
      firePulse
    );
    applyMarchingWeaponSway(
      child,
      unit._walkPhase ?? 0,
      unit._walkBlend ?? 0,
      unit._walkRunBlend ?? 0
    );
    if (unit._mountedOnTankId) applyTankRiderSitPose(child);
  });

  updateSniperSpotterOptics(unit);
}

function updateSniperSpotterOptics(unit) {
  if (unit.def?.type !== 'sniper' || !unit.mesh) return;
  unit.mesh.traverse((child) => {
    if (child.name !== 'squadMember' || !child.visible) return;
    if (child.userData.sniperRole !== 'spotter') return;
    const optics = child.userData.spotterOptics;
    if (!optics?.binoculars || !optics.rest || !optics.raised) return;

    const target = getEngagementTarget(unit);
    const spotting =
      !!target &&
      isInRange(unit, target) &&
      !isSpotterRifleInRange(unit, target) &&
      (unit._walkBlend ?? 0) < 0.08;
    const next = spotting ? 1 : 0;
    optics.blend = THREE.MathUtils.lerp(optics.blend ?? 0, next, 0.18);
    const t = optics.blend;
    optics.binoculars.position.lerpVectors(optics.rest.position, optics.raised.position, t);
    optics.binoculars.rotation.x = THREE.MathUtils.lerp(
      optics.rest.rotation.x,
      optics.raised.rotation.x,
      t
    );
    optics.binoculars.rotation.y = THREE.MathUtils.lerp(
      optics.rest.rotation.y,
      optics.raised.rotation.y,
      t
    );
    optics.binoculars.rotation.z = THREE.MathUtils.lerp(
      optics.rest.rotation.z,
      optics.raised.rotation.z,
      t
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
  const style = getWalkStyle(soldier);
  const gaitPhase = soldierGaitPhase(soldier, phase);
  const leftStride = Math.sin(gaitPhase);
  const rightStride = Math.sin(gaitPhase + Math.PI) * (1 + style.asymmetry);
  const leftLift = Math.pow(Math.max(0, leftStride), 1.28);
  const rightLift = Math.pow(Math.max(0, rightStride), 1.28);
  const bob = 0.5 - Math.cos(gaitPhase * 2) * 0.5;
  const weightShift = Math.sin(gaitPhase + Math.PI * 0.5);
  const hipLead = Math.sin(gaitPhase);
  const strideAmt = style.stride * compactScale;
  const twistAmt = style.twist * compactScale;
  const hipSwing = (0.48 + runBlend * 0.22) * strideAmt;
  const kneeBend = (0.34 + runBlend * 0.22) * compactScale;
  const strideBlend = blend * (0.86 + runBlend * 0.18);
  const bounceAmt = (compact ? 0.012 : 0.026 + runBlend * 0.016) * style.bounce;
  const lunge = Math.max(leftLift, rightLift) * 0.016 * strideBlend;

  soldier.position.set(
    rest.group.x + weightShift * 0.024 * strideBlend * style.sway,
    rest.group.y + bob * bounceAmt * blend,
    rest.group.z + lunge
  );

  const torso = soldier.children.find((c) => c.userData.infantryPart === 'torso');
  const head = soldier.children.find((c) => c.userData.infantryPart === 'head');
  const helmet = soldier.children.find((c) => c.userData.infantryPart === 'helmet');
  const legL = soldier.children.find((c) => c.userData.infantryPart === 'legL');
  const legR = soldier.children.find((c) => c.userData.infantryPart === 'legR');
  const weapon = soldier.children.find((c) => c.userData.infantryPart === 'weapon');

  const torsoPitch =
    (-0.1 - style.hunch - runBlend * 0.09) * strideBlend +
    (bob - 0.5) * 0.07 * blend * style.bounce;
  const torsoYaw = -hipLead * 0.18 * strideBlend * twistAmt;
  const torsoRoll = -weightShift * (0.1 + runBlend * 0.04) * strideBlend * style.sway;

  applyPartAnim(torso, rest.torso, {
    position: {
      x: weightShift * 0.01 * strideBlend,
      y: bob * 0.018 * blend * style.bounce,
      z: (bob - 0.5) * 0.012 * blend,
    },
    rotation: { x: torsoPitch, y: torsoYaw, z: torsoRoll },
  });

  const glance = Math.sin(gaitPhase * 0.23 + style.glancePhase) * style.glanceAmp * blend;
  const headPitch = torsoPitch * 0.58 + (bob - 0.5) * 0.08 * blend;
  const headYaw = -torsoYaw * 0.42 + glance;
  const headRoll = -torsoRoll * 0.35;
  applyPartAnim(head, rest.head, {
    position: { x: 0, y: bob * 0.012 * blend, z: torsoPitch * 0.04 },
    rotation: { x: headPitch, y: headYaw, z: headRoll },
  });
  applyPartAnim(helmet, rest.helmet, {
    position: { x: 0, y: bob * 0.012 * blend, z: torsoPitch * 0.045 },
    rotation: { x: headPitch * 1.05, y: headYaw, z: headRoll },
  });

  const animateLeg = (leg, legRest, stride, lift) => {
    if (!leg || !legRest) return;
    applyPartAnim(leg, legRest, {
      position: { x: 0, y: lift * 0.01 * blend, z: stride * 0.02 * strideBlend },
      rotation: {
        x: stride * hipSwing * strideBlend,
        y: 0,
        z: -weightShift * 0.03 * strideBlend,
      },
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
      boot.rotation.x -= lift * 0.22 * blend;
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
  unit._infantryPoseTime = 0;
  unit._fireAimPulse = 0;
  unit._infantryProneFireHold = 0;
  unit._infantryProneFireTarget = null;
  unit.mesh.traverse((child) => {
    if (child.name !== 'squadMember') return;
    restoreWalkRest(child);
    child.userData.proneBlend = 0;
    applySoldierPronePose(child, 0);
    applySoldierWeaponPose(child, child.userData.weaponAimBlend ?? 0, 0, 0);
  });
}

const RIDER_GROUND_KIT_KEEP = new Set([
  'squadMember',
  'selectionHitbox',
  'selectionRing',
  'fieldUnitIcon',
  'healthBar',
  'inspiredMarker',
  'healMarker',
  'coverMarker',
]);

/** Tight clusters that fit on a rear-deck / fender rider slot. */
const RIDER_SEAT_LAYOUTS = {
  1: [{ x: 0, z: 0 }],
  2: [
    { x: -0.18, z: 0.05 },
    { x: 0.18, z: -0.04 },
  ],
  3: [
    { x: -0.2, z: 0.08 },
    { x: 0.2, z: 0.06 },
    { x: 0.02, z: -0.16 },
  ],
  4: [
    { x: -0.2, z: 0.12 },
    { x: 0.2, z: 0.1 },
    { x: -0.18, z: -0.14 },
    { x: 0.18, z: -0.16 },
  ],
  5: [
    { x: 0.06, z: 0.2 },
    { x: -0.08, z: 0.06 },
    { x: 0.08, z: -0.08 },
    { x: -0.06, z: -0.2 },
    { x: 0.02, z: -0.34 },
  ],
};

function setRiderGroundKitVisible(mesh, visible) {
  if (!mesh) return;
  for (const child of mesh.children) {
    if (RIDER_GROUND_KIT_KEEP.has(child.name) || child.isSprite) continue;
    child.visible = visible;
  }
}

function applyTankRiderSitPose(soldier) {
  const rest = soldier.userData.walkRest;
  if (!rest) return;
  const torso = soldier.children.find((child) => child.userData.infantryPart === 'torso');
  if (torso && rest.torso) {
    torso.position.y = rest.torso.position.y - 0.13;
    torso.rotation.x = rest.torso.rotation.x + 0.38;
  }
  for (const partName of ['legL', 'legR']) {
    const leg = soldier.children.find((child) => child.userData.infantryPart === partName);
    const legRest = rest[partName];
    if (!leg || !legRest) continue;
    leg.rotation.x = legRest.rotation.x + 0.98;
    leg.position.y = legRest.position.y + 0.07;
    const knee = leg.userData.kneePivot;
    if (knee) knee.rotation.x = (knee.userData.restRotationX ?? 0) + 0.48;
  }
}

const _riderSeatBox = new THREE.Box3();
const _riderDeckPoint = new THREE.Vector3();

function snapSeatedSoldierToDeck(soldier) {
  soldier.updateWorldMatrix(true, true);
  _riderSeatBox.makeEmpty();
  soldier.traverse((child) => {
    if (!child.isMesh) return;
    const part = child.userData.infantryPart;
    if (part === 'weapon' || part === 'barrel' || part === 'head' || part === 'helmet') return;
    _riderSeatBox.expandByObject(child);
  });
  if (_riderSeatBox.isEmpty()) return;
  if (soldier.parent) {
    soldier.parent.localToWorld(_riderDeckPoint.set(soldier.position.x, 0, soldier.position.z));
  } else {
    _riderDeckPoint.set(0, 0, 0);
  }
  // Drop the seated body until the lowest hull-contact mesh meets the deck.
  soldier.position.y -= _riderSeatBox.min.y - _riderDeckPoint.y - 0.008;
}

function collectSquadMembers(mesh) {
  const members = [];
  mesh.traverse((child) => {
    if (child.name === 'squadMember') members.push(child);
  });
  members.sort((a, b) => (a.userData.squadIndex ?? 0) - (b.userData.squadIndex ?? 0));
  return members;
}

/**
 * Pack a mounted squad onto its deck slot and sit them on the hull.
 * Ground kits (tripods, mortars, crates) are hidden so they do not hover
 * beside the vehicle. Call with mounted=false to restore the field layout.
 */
export function applyMountedRiderVisuals(unit, mounted) {
  if (!unit?.mesh) return;
  setRiderGroundKitVisible(unit.mesh, !mounted);

  const members = collectSquadMembers(unit.mesh);
  if (!mounted) {
    for (const soldier of members) {
      const saved = soldier.userData._preMountRest;
      if (saved) {
        if (soldier.userData.walkRest?.group && saved.group) {
          soldier.userData.walkRest.group.copy(saved.group);
        }
        delete soldier.userData._preMountRest;
      }
      restoreWalkRest(soldier);
    }
    return;
  }

  const seated = members.filter((soldier) => soldier.visible);
  const layout =
    RIDER_SEAT_LAYOUTS[Math.min(5, Math.max(1, seated.length))] ?? RIDER_SEAT_LAYOUTS[1];
  seated.forEach((soldier, index) => {
    if (!soldier.userData._preMountRest) {
      const group = soldier.userData.walkRest?.group ?? soldier.position;
      soldier.userData._preMountRest = {
        group: group.clone(),
      };
    }
    const seat = layout[index] ?? layout[layout.length - 1];
    soldier.position.set(seat.x, 0, seat.z);
    applyTankRiderSitPose(soldier);
    snapSeatedSoldierToDeck(soldier);
    if (soldier.userData.walkRest?.group) {
      soldier.userData.walkRest.group.copy(soldier.position);
    }
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
