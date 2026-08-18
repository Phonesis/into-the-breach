import * as THREE from 'three';
import {
  mat,
  buildFactionVehicle,
  buildFactionInfantry,
  buildFactionCommander,
  buildFactionVehicleCrew,
  buildFactionParatrooper,
  buildFactionMG,
  buildFactionMortar,
  buildFactionMedic,
  buildFactionEngineer,
  buildFactionSniper,
  buildFactionRadioOperator,
} from './FactionMeshes.js';
import { isTankType } from './VehicleTypes.js';
import {
  getBodyTexture,
  getFactionGhillieTexture,
  getGhillieTexture,
  getInfantryUniformTexture,
  getInfantryMaterials,
  getVehicleSurfaceBumpMap,
  getVehicleSurfaceRoughnessMap,
  createCamoMaterial,
} from './UnitTextures.js';
import { applyInfantryShadowPolicy } from './InfantryVisuals.js';
import { sampleTerrainHeight } from '../world/Terrain.js';
import { SQUAD_SIZES, livingPersonnelForHp } from '../data/squadSizes.js';
import { getBlastCaliberScale, getBlastProfile } from '../game/BlastProfile.js';

export { mat };

const INFANTRY_TYPES = new Set([
  'radioOperator',
  'infantry',
  'paratrooper',
  'machineGun',
  'mortar',
  'sniper',
  'medic',
  'engineer',
  'vehicleCrew',
  'commander',
]);

const CORPSE_FALL_SEC = 0.45;
/** Small-arms death flop — kept as the lower bound; most styles last longer. */
const BULLET_DEATH_MIN_SEC = 0.34;
/** Chance a blast kill produces flying limbs (not every explosion death). */
const EXPLOSION_GIB_CHANCE = 0.22;
/** Gravity for ballistic corpse throws (world units / s²). */
const CORPSE_THROW_GRAVITY = 16.5;
/** Extra upward lift for bodies caught in the inner band of heavy HE. */
const HEAVY_BLAST_VERTICAL_LIFT = Object.freeze({
  artillery: 1.38,
  airBomb: 1.32,
});
/** @type {Set<THREE.Group>} */
const activeCorpseAnchors = new Set();
/** @type {Set<THREE.Object3D>} */
const activeGibs = new Set();

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Resolve a saved/live unit blast profile into the visual fields used by
 * individual casualty bodies. A shell can be lethal over a wide footprint,
 * but only the inner band has enough impulse to lift a soldier.
 */
function resolveBlastProfile(unit, blastOptions = {}) {
  if (
    unit?._deathCause !== 'explosion' &&
    !blastOptions?.blastWeaponType &&
    !blastOptions?.blastRadius &&
    !blastOptions?.blastOrigin
  ) {
    return null;
  }
  const profile = getBlastProfile({
    weaponType:
      blastOptions.blastWeaponType ?? unit?._deathBlastWeaponType ?? 'artillery',
    caliber: blastOptions.blastCaliber ?? unit?._deathBlastCaliber,
    radius: blastOptions.blastRadius ?? unit?._deathBlastRadius,
    launchRadius:
      blastOptions.blastLaunchRadius ?? unit?._deathBlastLaunchRadius,
    knockdownRadius:
      blastOptions.blastKnockdownRadius ?? unit?._deathBlastKnockdownRadius,
    impulseScale:
      blastOptions.blastImpulseScale ?? unit?._deathBlastImpulseScale,
  });
  return {
    ...profile,
    blastOrigin: blastOptions.blastOrigin ?? unit?._deathBlastOrigin ?? null,
  };
}

/**
 * Classify a dead infantryman by distance from the detonation. The response is
 * deliberately conservative: near-direct casualties are thrown, nearby edge
 * casualties collapse in place, and the outer lethal fringe stays grounded.
 */
export function getBlastCasualtyResponse(worldPos, blastOptions = {}) {
  const origin = blastOptions.blastOrigin;
  const radius = Number.isFinite(blastOptions.blastRadius) ? blastOptions.blastRadius : 0;
  if (
    !worldPos ||
    !origin ||
    !Number.isFinite(origin.x) ||
    !Number.isFinite(origin.z) ||
    radius <= 0
  ) {
    return { kind: 'grounded', strength: 0, distance: Infinity };
  }

  const distance = Math.hypot(worldPos.x - origin.x, worldPos.z - origin.z);
  const launchRadius = clamp(
    Number.isFinite(blastOptions.blastLaunchRadius)
      ? blastOptions.blastLaunchRadius
      : radius * 0.46,
    0.25,
    radius
  );
  const knockdownRadius = clamp(
    Number.isFinite(blastOptions.blastKnockdownRadius)
      ? blastOptions.blastKnockdownRadius
      : radius * 0.82,
    launchRadius,
    radius
  );
  const impulseScale = clamp(
    Number.isFinite(blastOptions.blastImpulseScale)
      ? blastOptions.blastImpulseScale
      : 1,
    0.25,
    1.5
  );

  // Good cover can turn a close lethal hit into a knockdown rather than a
  // launch. Damage has already been reduced by CoverSystem; this only scales
  // the physical casualty response.
  if (distance <= launchRadius && impulseScale >= 0.56) {
    return {
      kind: 'throw',
      strength: clamp(1 - distance / launchRadius, 0.08, 1),
      distance,
      launchRadius,
      knockdownRadius,
      impulseScale,
    };
  }
  if (distance <= knockdownRadius) {
    return {
      kind: 'knockdown',
      strength: clamp(
        1 - Math.max(0, distance - launchRadius) / Math.max(0.01, knockdownRadius - launchRadius),
        0.08,
        1
      ),
      distance,
      launchRadius,
      knockdownRadius,
      impulseScale,
    };
  }
  return {
    kind: 'grounded',
    strength: 0,
    distance,
    launchRadius,
    knockdownRadius,
    impulseScale,
  };
}

export function createUnitMesh(type, teamColor, accentColor, factionId = 'germany') {
  const group = new THREE.Group();
  const bodyTex = getBodyTexture(factionId, type);
  const body = mat(teamColor, { rough: 0.72, map: bodyTex ?? undefined });
  const detail = mat(teamColor, { metal: 0.32, rough: 0.65, map: bodyTex ?? undefined });
  const dark = mat(0x1a1a1a, { metal: 0.5 });

  if (bodyTex && !INFANTRY_TYPES.has(type)) {
    const steelBump = getVehicleSurfaceBumpMap();
    const steelRoughness = getVehicleSurfaceRoughnessMap();
    body.bumpMap = steelBump;
    body.bumpScale = 0.026;
    body.roughnessMap = steelRoughness;
    body.roughness = 0.76;
    detail.bumpMap = steelBump;
    detail.bumpScale = 0.019;
    detail.roughnessMap = steelRoughness;
    detail.roughness = 0.68;
  }

  let built = false;

  if (
    type === 'tank' ||
    type === 'tankDestroyer' ||
    type === 'superHeavyTank' ||
    type === 'armoredCar' ||
    type === 'artillery' ||
    type === 'antiTankGun'
  ) {
    built = buildFactionVehicle(group, type, factionId, body, detail, dark);
  } else if (type === 'machineGun') {
    buildFactionMG(group, body, detail, dark, factionId);
    built = true;
  } else if (type === 'mortar') {
    buildFactionMortar(group, body, detail, dark, factionId);
    built = true;
  } else if (type === 'medic') {
    buildFactionMedic(group, body, dark, factionId);
    built = true;
  } else if (type === 'engineer') {
    buildFactionEngineer(group, body, dark, factionId);
    built = true;
  } else if (type === 'radioOperator') {
    buildFactionRadioOperator(group, body, dark, factionId);
    built = true;
  } else if (type === 'infantry') {
    buildFactionInfantry(group, body, dark, factionId);
    built = true;
  } else if (type === 'commander') {
    buildFactionCommander(group, body, dark, factionId);
    built = true;
  } else if (type === 'vehicleCrew') {
    buildFactionVehicleCrew(group, body, dark, factionId);
    built = true;
  } else if (type === 'paratrooper') {
    buildFactionParatrooper(group, body, dark, factionId);
    built = true;
  } else if (type === 'sniper') {
    const ghillieTex = getFactionGhillieTexture(factionId) ?? getGhillieTexture();
    const ghillie = ghillieTex
      ? mat(0xffffff, { rough: 0.95, metal: 0.05, map: ghillieTex })
      : null;
    buildFactionSniper(group, body, detail, dark, factionId, ghillie);
    built = true;
  }

  if (!built) {
    console.warn('Unknown unit type for mesh:', type);
    group.userData.hitRadius = 2;
  }

  if (INFANTRY_TYPES.has(type)) {
    applyInfantryShadowPolicy(group);
  } else {
    group.traverse((c) => {
      if (c.isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
      }
    });
  }

  const hitRadii = {
    infantry: 2.35,
    vehicleCrew: 1.55,
    paratrooper: 2.25,
    machineGun: 2,
    sniper: 1.85,
    mortar: 2.2,
    medic: 1.4,
    engineer: 2.25,
    radioOperator: 1.35,
    commander: 2.55,
    armoredCar: group.userData.hitRadius ?? 2.6,
    tankDestroyer: group.userData.hitRadius ?? 3.0,
    tank: group.userData.hitRadius ?? 3.2,
    superHeavyTank: group.userData.hitRadius ?? 3.5,
    artillery: group.userData.hitRadius ?? 2.4,
    antiTankGun: group.userData.hitRadius ?? 2.1,
  };
  const hitR = hitRadii[type] ?? group.userData.hitRadius ?? 2;
  const hitbox = new THREE.Mesh(
    new THREE.SphereGeometry(hitR, 10, 10),
    new THREE.MeshBasicMaterial({ visible: false, depthWrite: false })
  );
  const hitY = {
    tank: 1.1,
    superHeavyTank: 1.25,
    tankDestroyer: 1.08,
    armoredCar: 0.85,
    artillery: 0.95,
    antiTankGun: 0.85,
    commander: 0.85,
    machineGun: 0.55,
    mortar: 0.65,
    medic: 0.52,
    engineer: 0.52,
    radioOperator: 0.52,
    sniper: 0.5,
    infantry: 0.55,
    vehicleCrew: 0.52,
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
  ring.position.y =
    isTankType(type) || type === 'armoredCar' || type === 'antiTankGun' ? 0.25 : 0.1;
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
  // Cover rings use the same ground-level visual language as selection rings,
  // but are maintained by CoverSystem. Mirror the selection state here so a
  // deselected unit cannot leave its blue cover ring behind until the next
  // cover-system tick.
  const coverRing = mesh.getObjectByName('coverRing');
  if (coverRing) {
    coverRing.visible = !!visible && coverRing.userData?.coverActive === true;
  }
}

export function setTargetHighlight(mesh, visible, engaged = false, action = false) {
  const ring = mesh.getObjectByName('targetHighlightRing');
  if (ring) {
    ring.material.opacity = visible ? (engaged ? 0.75 : 0.95) : 0;
    ring.material.color.setHex(action ? 0x62e58b : engaged ? 0xff8800 : 0xff3333);
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

function toScorchedMaterial(src, preset = {}) {
  if (!src?.clone) return null;

  const {
    colorScale = 0.36,
    emissive = 0x000000,
    emissiveIntensity = 0,
    metalness = 0.05,
    roughness = 0.98,
  } = preset;

  const wreckMat = src.clone();
  if (wreckMat.map) {
    wreckMat.color.setHex(0xffffff);
    wreckMat.color.multiplyScalar(colorScale);
  } else if (wreckMat.color) {
    wreckMat.color.multiplyScalar(colorScale);
  }
  if (wreckMat.emissive) {
    wreckMat.emissive.setHex(emissive);
    wreckMat.emissiveIntensity = emissiveIntensity;
  }
  wreckMat.metalness = metalness;
  wreckMat.roughness = roughness;
  return wreckMat;
}

function applyScorchedMaterial(child, preset) {
  if (!child.isMesh || WRECK_SKIP_MESHES.has(child.name)) return;
  const src = child.material;
  if (!src) return;

  if (Array.isArray(src)) {
    child.material = src.map((m) => toScorchedMaterial(m, preset) ?? m);
    return;
  }

  const wreckMat = toScorchedMaterial(src, preset);
  if (wreckMat) child.material = wreckMat;
}

function darkenCorpseMesh(child, factor = 0.34) {
  applyScorchedMaterial(child, {
    colorScale: factor,
    emissive: 0x000000,
    emissiveIntensity: 0,
    metalness: 0.05,
    roughness: 0.98,
  });
}

function createBloodPoolMesh(radius, { color = 0x5c1212, opacity = 0.46, lobes = 5 } = {}) {
  const shape = new THREE.Shape();
  const phase = Math.random() * Math.PI * 2;
  const segs = 28;
  for (let i = 0; i <= segs; i++) {
    const t = (i / segs) * Math.PI * 2;
    const wobble =
      0.68 +
      Math.sin(t * lobes + phase) * 0.2 +
      Math.sin(t * 2.3 + phase * 1.7) * 0.08 +
      Math.cos(t * 4.1) * 0.06;
    const r = radius * Math.max(0.42, wobble);
    const x = Math.cos(t) * r;
    const y = Math.sin(t) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();

  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    side: THREE.DoubleSide,
  });
  const pool = new THREE.Mesh(new THREE.ShapeGeometry(shape, 1), mat);
  pool.rotation.x = -Math.PI / 2;
  return pool;
}

function disposeMeshObject(obj) {
  if (!obj) return;
  obj.traverse?.((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
      else child.material.dispose();
    }
  });
}

function addBloodPoolAt(parent, x, z, radius, squadIndex = null) {
  const pool = createBloodPoolMesh(radius, { color: 0x541515, opacity: 0.46, lobes: 5 });
  pool.position.set(x, 0.05, z);
  pool.renderOrder = 1;
  pool.name = 'bloodPool';
  if (squadIndex != null) pool.userData.squadIndex = squadIndex;
  parent.add(pool);

  const inner = createBloodPoolMesh(radius * 0.36, { color: 0x7e2020, opacity: 0.33, lobes: 4 });
  inner.position.set(
    x + (Math.random() - 0.5) * radius * 0.22,
    0.06,
    z + (Math.random() - 0.5) * radius * 0.22
  );
  inner.renderOrder = 2;
  inner.name = 'bloodPool';
  if (squadIndex != null) inner.userData.squadIndex = squadIndex;
  parent.add(inner);
}

function incomingFireDir(unit, worldPos, blastOptions = {}) {
  const from =
    unit?._deathImpactFrom ??
    unit?._lastImpactFrom ??
    blastOptions?.impactFrom ??
    null;
  if (from && Number.isFinite(from.x) && Number.isFinite(from.z)) {
    const dx = worldPos.x - from.x;
    const dz = worldPos.z - from.z;
    const len = Math.hypot(dx, dz);
    if (len > 0.25) return { x: dx / len, z: dz / len };
  }
  const yaw = unit?.mesh?.rotation?.y ?? 0;
  return { x: Math.sin(yaw), z: Math.cos(yaw) };
}

function easeFall(t, kind) {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  if (kind === 'in') return x * x;
  if (kind === 'out') return 1 - (1 - x) * (1 - x);
  return x * x * (3 - 2 * x);
}

/**
 * Varied small-arms death motions. The fallen mesh is built prone along +X;
 * rotZ stands that body up (head high) so a lerp to 0 reads as a real fall.
 */
function pickBulletDeathMotion(unit, worldPos, groundY, rotY, blastOptions = {}) {
  const away = incomingFireDir(unit, worldPos, blastOptions);
  const right = { x: -away.z, z: away.x };
  const roll = Math.random();
  const jitter = () => (Math.random() - 0.5);

  const startY = worldPos.y + 0.58 + Math.random() * 0.16;
  const base = {
    startX: worldPos.x,
    startY,
    startZ: worldPos.z,
    startRotY: rotY + jitter() * 0.18,
    endX: worldPos.x,
    endY: groundY,
    endZ: worldPos.z,
    endRotX: jitter() * 0.16,
    endRotY: rotY + jitter() * 0.55,
    endRotZ: jitter() * 0.1,
    pose: 'prone',
    ease: 'smooth',
    mid: null,
    easeA: 'out',
    easeB: 'in',
  };

  if (roll < 0.22) {
    // Sudden crumple — legs go and the body folds almost in place.
    return {
      ...base,
      style: 'crumple',
      dur: BULLET_DEATH_MIN_SEC + Math.random() * 0.12,
      startY: worldPos.y + 0.38 + Math.random() * 0.1,
      startRotX: jitter() * 0.2,
      startRotZ: 0.72 + Math.random() * 0.22,
      endX: worldPos.x + away.x * 0.18 + jitter() * 0.12,
      endZ: worldPos.z + away.z * 0.18 + jitter() * 0.12,
      endRotZ: jitter() * 0.08,
      ease: 'in',
    };
  }

  if (roll < 0.42) {
    // Chest hit: stagger away from the shooter, then drop.
    const back = 0.55 + Math.random() * 0.55;
    return {
      ...base,
      style: 'stumbleBack',
      dur: 0.58 + Math.random() * 0.22,
      startRotX: jitter() * 0.15,
      startRotZ: 1.18 + Math.random() * 0.22,
      mid: {
        at: 0.42,
        x: worldPos.x + away.x * back * 0.55,
        y: startY - 0.12,
        z: worldPos.z + away.z * back * 0.55,
        rotX: jitter() * 0.2,
        rotY: rotY + jitter() * 0.25,
        rotZ: 1.42 + Math.random() * 0.18,
      },
      endX: worldPos.x + away.x * back,
      endZ: worldPos.z + away.z * back,
      endY: groundY + 0.035,
      endRotZ: Math.PI + jitter() * 0.12,
      pose: 'back',
      easeA: 'out',
      easeB: 'in',
    };
  }

  if (roll < 0.6) {
    // Pitch forward onto the face — common when advancing into fire.
    const ahead = 0.42 + Math.random() * 0.38;
    return {
      ...base,
      style: 'pitchForward',
      dur: 0.42 + Math.random() * 0.16,
      startRotX: jitter() * 0.12,
      startRotZ: 1.05 + Math.random() * 0.2,
      endX: worldPos.x - away.x * ahead + jitter() * 0.1,
      endZ: worldPos.z - away.z * ahead + jitter() * 0.1,
      endRotZ: jitter() * 0.08,
      ease: 'in',
    };
  }

  if (roll < 0.73) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const slide = 0.28 + Math.random() * 0.32;
    return {
      ...base,
      style: 'sideCollapse',
      dur: 0.4 + Math.random() * 0.16,
      startRotX: side * (0.18 + Math.random() * 0.16),
      startRotZ: 0.95 + Math.random() * 0.2,
      endX: worldPos.x + right.x * side * slide,
      endZ: worldPos.z + right.z * side * slide,
      endRotX: side * (0.85 + Math.random() * 0.22),
      endRotZ: jitter() * 0.12,
      pose: side < 0 ? 'sideL' : 'sideR',
      ease: 'in',
    };
  }

  if (roll < 0.85) {
    const spin = (Math.random() < 0.5 ? -1 : 1) * (1.1 + Math.random() * 1.4);
    return {
      ...base,
      style: 'spinFall',
      dur: 0.5 + Math.random() * 0.18,
      startRotX: jitter() * 0.25,
      startRotZ: 1.08 + Math.random() * 0.2,
      endX: worldPos.x + away.x * 0.28 + right.x * jitter() * 0.35,
      endZ: worldPos.z + away.z * 0.28 + right.z * jitter() * 0.35,
      endRotY: rotY + spin,
      endRotZ: jitter() * 0.14,
      pose: Math.random() < 0.4 ? 'sideR' : 'prone',
      ease: 'smooth',
    };
  }

  if (roll < 0.93) {
    // Knees buckle, a beat of sitting, then topple.
    const ontoBack = Math.random() < 0.45;
    return {
      ...base,
      style: 'sitThenFall',
      dur: 0.72 + Math.random() * 0.2,
      startRotX: jitter() * 0.12,
      startRotZ: 1.22 + Math.random() * 0.14,
      mid: {
        at: 0.38,
        x: worldPos.x + away.x * 0.12,
        y: groundY + 0.28,
        z: worldPos.z + away.z * 0.12,
        rotX: jitter() * 0.15,
        rotY: rotY + jitter() * 0.2,
        rotZ: 0.85 + Math.random() * 0.12,
      },
      endX: worldPos.x + away.x * 0.34,
      endZ: worldPos.z + away.z * 0.34,
      endY: groundY + (ontoBack ? 0.035 : 0),
      endRotZ: ontoBack ? Math.PI + jitter() * 0.1 : jitter() * 0.1,
      pose: ontoBack ? 'back' : 'prone',
      easeA: 'out',
      easeB: 'in',
    };
  }

  // Drop onto the back from a near-standing lean.
  return {
    ...base,
    style: 'fallBack',
    dur: 0.5 + Math.random() * 0.18,
    startRotX: jitter() * 0.12,
    startRotZ: 1.38 + Math.random() * 0.16,
    endX: worldPos.x + away.x * (0.4 + Math.random() * 0.28),
    endZ: worldPos.z + away.z * (0.4 + Math.random() * 0.28),
    endY: groundY + 0.035,
    endRotZ: Math.PI + jitter() * 0.1,
    pose: 'back',
    ease: 'smooth',
  };
}

function sampleFallPose(fall, t) {
  const clampT = THREE.MathUtils.clamp(t, 0, 1);
  const start = {
    x: fall.startX,
    y: fall.startY,
    z: fall.startZ,
    rotX: fall.startRotX ?? 0,
    rotY: fall.startRotY ?? 0,
    rotZ: fall.startRotZ ?? 0,
  };
  const end = {
    x: fall.endX ?? fall.startX,
    y: fall.endY,
    z: fall.endZ ?? fall.startZ,
    rotX: fall.endRotX ?? 0,
    rotY: fall.endRotY ?? fall.startRotY ?? 0,
    rotZ: fall.endRotZ ?? 0,
  };
  let a = start;
  let b = end;
  let u = clampT;
  if (fall.mid && Number.isFinite(fall.mid.at) && fall.mid.at > 0.04 && fall.mid.at < 0.96) {
    if (clampT < fall.mid.at) {
      b = fall.mid;
      u = easeFall(clampT / fall.mid.at, fall.easeA ?? 'out');
    } else {
      a = fall.mid;
      u = easeFall((clampT - fall.mid.at) / (1 - fall.mid.at), fall.easeB ?? 'in');
    }
  } else {
    u = easeFall(clampT, fall.ease ?? 'smooth');
  }
  return {
    x: THREE.MathUtils.lerp(a.x, b.x, u),
    y: THREE.MathUtils.lerp(a.y, b.y, u),
    z: THREE.MathUtils.lerp(a.z, b.z, u),
    rotX: THREE.MathUtils.lerp(a.rotX ?? 0, b.rotX ?? 0, u),
    rotY: THREE.MathUtils.lerp(a.rotY ?? 0, b.rotY ?? 0, u),
    rotZ: THREE.MathUtils.lerp(a.rotZ ?? 0, b.rotZ ?? 0, u),
  };
}

function applyFallPose(anchor, pose) {
  anchor.position.set(pose.x, pose.y, pose.z);
  anchor.rotation.set(pose.rotX, pose.rotY, pose.rotZ);
}

function addGroundStain(mesh, spread = 2.4) {
  const group = new THREE.Group();
  group.name = 'corpseStain';
  group.renderOrder = 1;

  addBloodPoolAt(group, 0, 0, spread * 0.3);
  addBloodPoolAt(
    group,
    (Math.random() - 0.5) * spread * 0.28,
    (Math.random() - 0.5) * spread * 0.24,
    spread * 0.13
  );

  mesh.add(group);
}

function getSquadMembers(mesh) {
  const members = [];
  mesh.traverse((child) => {
    if (child.name === 'squadMember' && child.userData?.squadIndex != null) {
      members.push(child);
    }
  });
  members.sort((a, b) => a.userData.squadIndex - b.userData.squadIndex);
  return members;
}

function removeDetachedCorpse(unit, squadIndex) {
  const entries = unit._detachedCorpses?.filter((e) => e.squadIndex === squadIndex) ?? [];
  for (const { anchor } of entries) {
    anchor.parent?.remove(anchor);
    activeCorpseAnchors.delete(anchor);
    disposeMeshObject(anchor);
  }
  unit._detachedCorpses = unit._detachedCorpses?.filter((e) => e.squadIndex !== squadIndex) ?? [];
}

function placeDetachedCorpse(
  unit,
  localOffset,
  factionId,
  unitType,
  squadIndex,
  rotY = 0,
  animateFall = true,
  blastOptions = {}
) {
  const scene = unit.mesh?.parent;
  if (!scene || !unit.mesh) return null;
  const crushed = unit._deathCause === 'crush' || blastOptions.crushed === true;
  const blastProfile = !crushed ? resolveBlastProfile(unit, blastOptions) : null;

  const worldPos = new THREE.Vector3(localOffset.x, localOffset.y, localOffset.z);
  unit.mesh.localToWorld(worldPos);
  const blastResponse = blastProfile
    ? getBlastCasualtyResponse(worldPos, blastProfile)
    : { kind: 'grounded', strength: 0 };
  const blastThrow = animateFall && !crushed && blastResponse.kind === 'throw';
  const blastKnockdown =
    animateFall && !crushed && blastResponse.kind === 'knockdown';

  // Crushed bodies already lie flat under tracks — no pop-up fall animation.
  // Blast throws re-sample ground on landing (body may travel horizontally).
  const groundY = sampleTerrainHeight(worldPos.x, worldPos.z, unit._mapDef) + (crushed ? 0.008 : 0.02);
  const startY = blastThrow
    ? worldPos.y + 0.28 + Math.random() * 0.12
    : blastKnockdown
      ? worldPos.y + 0.26
    : animateFall && !crushed
      ? worldPos.y + 0.52
      : groundY;

  const anchor = new THREE.Group();
  anchor.name = 'detachedCorpse';
  anchor.userData.unitId = unit.id;
  anchor.userData.squadIndex = squadIndex;
  if (crushed) anchor.userData.crushed = true;

  // Align track grooves roughly with the tank's travel direction when available.
  const trackYaw =
    unit._crushTrackYaw ??
    unit.mesh.rotation?.y ??
    rotY ??
    0;

  let body;
  let bloodPool = null;
  if (crushed) {
    body = buildCrushedSoldierBody(factionId, {
      ghillie: unitType === 'sniper',
      trackYaw: trackYaw + (Math.random() - 0.5) * 0.2,
    });
    // Slight overall yaw scatter so squadmates don't stamp identically.
    body.rotation.y = (Math.random() - 0.5) * 0.55;
    addCrushedGroundMess(anchor, squadIndex);
  } else {
    body = buildFallenSoldierBody(factionId, { ghillie: unitType === 'sniper' });
    body.rotation.y = rotY + (Math.random() - 0.5) * 1.2;
    body.rotation.z = (Math.random() - 0.5) * 0.15;
    bloodPool = new THREE.Group();
    bloodPool.name = 'bloodPool';
    addBloodPoolAt(bloodPool, 0, 0, 0.3 + Math.random() * 0.16, squadIndex);
    // Hide pool until the body hits dirt so it does not float mid-air.
    if (animateFall && !crushed) bloodPool.visible = false;
    anchor.add(bloodPool);
  }
  anchor.add(body);

  anchor.position.set(worldPos.x, startY, worldPos.z);
  anchor.rotation.y = crushed
    ? trackYaw + (Math.random() - 0.5) * 0.35
    : rotY + (Math.random() - 0.5) * 0.4;

  if (blastThrow) {
    // Fling away from the blast origin (shell impact / HE epicentre), with a
    // modest impulse. The close-range threshold above prevents edge deaths
    // from becoming airborne ragdolls.
    let dx = 0;
    let dz = 0;
    const origin = blastProfile?.blastOrigin;
    if (origin && Number.isFinite(origin.x) && Number.isFinite(origin.z)) {
      dx = worldPos.x - origin.x;
      dz = worldPos.z - origin.z;
    }
    let len = Math.hypot(dx, dz);
    if (len < 0.15) {
      const ang = Math.random() * Math.PI * 2;
      dx = Math.cos(ang);
      dz = Math.sin(ang);
      len = 1;
    } else {
      dx /= len;
      dz /= len;
    }
    // Lateral scatter so squadmates don't all fly the same arc.
    const perpX = -dz;
    const perpZ = dx;
    const proximity = blastResponse.strength ?? 0.5;
    const caliber = getBlastCaliberScale(blastProfile?.blastCaliber);
    const impulse = clamp(
      (blastProfile?.blastImpulseScale ?? 1) * (0.72 + proximity * 0.42),
      0.45,
      1.55
    );
    const side = (Math.random() - 0.5) * 0.36;
    const outSpeed = (1.05 + proximity * 1.9) * caliber * impulse;
    const heavyLift = HEAVY_BLAST_VERTICAL_LIFT[blastProfile?.blastWeaponType] ?? 1;
    // Heavy shells and bombs produce a taller ballistic arc without widening
    // the launch band or increasing lateral travel. The closest casualties
    // receive the full lift; bodies near the inner-band edge get less of it.
    const verticalLift = 1 + (heavyLift - 1) * (0.55 + proximity * 0.45);
    const upSpeed =
      (2.25 + proximity * 2.35) * caliber * impulse * verticalLift;

    anchor.rotation.x = (Math.random() - 0.5) * 0.55;
    anchor.rotation.z = (Math.random() - 0.5) * 0.65;
    anchor.userData.blastFlight = {
      vx: dx * outSpeed + perpX * side * outSpeed * 0.45,
      vy: upSpeed,
      vz: dz * outSpeed + perpZ * side * outSpeed * 0.45,
      spinX: (Math.random() - 0.5) * 3.6,
      spinY: (Math.random() - 0.5) * 2.8,
      spinZ: (Math.random() - 0.5) * 3.6,
      groundY,
      mapDef: unit._mapDef,
      settled: false,
      bounceLeft: 0,
      bloodPool,
    };
    activeCorpseAnchors.add(anchor);
  } else if (blastKnockdown) {
    // A casualty on the outer blast band is knocked down rather than launched.
    anchor.rotation.x = -0.78;
    anchor.userData.fall = {
      elapsed: 0,
      dur: 0.28 + Math.random() * 0.1,
      startX: worldPos.x,
      startY,
      startZ: worldPos.z,
      startRotX: -0.78,
      startRotY: rotY,
      startRotZ: 0,
      endX: worldPos.x,
      endY: groundY,
      endZ: worldPos.z,
      endRotX: (Math.random() - 0.5) * 0.12,
      endRotY: rotY,
      endRotZ: 0,
      ease: 'in',
      bloodPool,
    };
    activeCorpseAnchors.add(anchor);
  } else if (animateFall && !crushed) {
    const motion = pickBulletDeathMotion(unit, worldPos, groundY, rotY, blastOptions);
    applyFallPose(anchor, {
      x: motion.startX,
      y: motion.startY,
      z: motion.startZ,
      rotX: motion.startRotX ?? 0,
      rotY: motion.startRotY ?? rotY,
      rotZ: motion.startRotZ ?? 0,
    });
    anchor.userData.fall = {
      ...motion,
      elapsed: 0,
      bloodPool,
    };
    activeCorpseAnchors.add(anchor);
  } else {
    // Crushed remains sit flush; only a hair of roll so they aren't laser-flat.
    anchor.rotation.x = crushed ? (Math.random() - 0.5) * 0.04 : (Math.random() - 0.5) * 0.12;
    if (crushed) anchor.rotation.z = (Math.random() - 0.5) * 0.05;
  }

  scene.add(anchor);
  unit._detachedCorpses = unit._detachedCorpses ?? [];
  unit._detachedCorpses.push({ anchor, squadIndex });
  return anchor;
}

function spawnCasualtyAtMember(
  unit,
  member,
  factionId,
  unitType,
  blastOptions = {},
  animateFall = true
) {
  const squadIndex = member.userData.squadIndex;
  placeDetachedCorpse(
    unit,
    member.position.clone(),
    factionId,
    unitType,
    squadIndex,
    member.rotation?.y ?? 0,
    animateFall,
    blastOptions
  );
  member.visible = false;
}

function restoreSquadMember(unit, member) {
  const squadIndex = member.userData.squadIndex;
  member.visible = true;
  removeDetachedCorpse(unit, squadIndex);

  const mesh = unit.mesh;
  if (!mesh) return;
  const toRemove = [];
  for (const child of mesh.children) {
    if (child.userData?.squadIndex === squadIndex && (child.name === 'fallenBody' || child.name === 'bloodPool')) {
      toRemove.push(child);
    }
  }
  for (const obj of toRemove) {
    mesh.remove(obj);
    disposeMeshObject(obj);
  }
}

function migrateMeshCorpsesToWorld(unit) {
  const mesh = unit.mesh;
  const scene = mesh?.parent;
  if (!mesh || !scene) return;

  const toMigrate = [];
  for (const child of mesh.children) {
    if (child.name === 'fallenBody' || child.name === 'bloodPool' || child.name === 'corpseStain') {
      toMigrate.push(child);
    }
  }

  for (const child of toMigrate) {
    const worldPos = new THREE.Vector3();
    const worldQuat = new THREE.Quaternion();
    child.updateWorldMatrix(true, false);
    child.getWorldPosition(worldPos);
    child.getWorldQuaternion(worldQuat);

    mesh.remove(child);
    child.position.copy(worldPos);
    child.quaternion.copy(worldQuat);
    child.userData.corpseUnitId = unit.id;
    scene.add(child);
  }
}

/**
 * Match corpse cloth to the living infantry material when a faction has no
 * dedicated uniform texture. This keeps procedural-only factions from falling
 * back to the white tint used for textured uniforms.
 */
function createCorpseClothMaterial(factionId, { ghillie = false, roughness = 0.94 } = {}) {
  const uniformTex = ghillie
    ? getFactionGhillieTexture(factionId) ?? getGhillieTexture()
    : getInfantryUniformTexture(factionId);
  if (uniformTex) {
    return createCamoMaterial(
      0xffffff,
      uniformTex,
      ghillie ? [1.4, 1] : [1.1, 0.75],
      { rough: roughness }
    );
  }

  const fallback = getInfantryMaterials(factionId).body.clone();
  fallback.roughness = roughness;
  fallback.metalness = 0;
  return fallback;
}

/**
 * Spawn occasional flying limbs when infantry die to blast/HE.
 * Chancey — not every kill, and not every limb.
 */
function spawnExplosionGibs(unit, factionId, unitType, blastOptions = {}) {
  const scene = unit?.mesh?.parent;
  if (!scene || !unit?.mesh) return;
  if (Math.random() > EXPLOSION_GIB_CHANCE) return;

  const blastResponse = getBlastCasualtyResponse(unit.position, blastOptions);
  if (blastResponse.kind !== 'throw') return;
  const caliberScale = getBlastCaliberScale(blastOptions.blastCaliber);
  const impulseScale = clamp(
    (blastOptions.blastImpulseScale ?? 1) *
      (0.7 + (blastResponse.strength ?? 0.5) * 0.35),
    0.45,
    1.5
  );

  const origin = new THREE.Vector3(
    unit.position.x,
    sampleTerrainHeight(unit.position.x, unit.position.z, unit._mapDef) + 0.85,
    unit.position.z
  );

  const cloth = createCorpseClothMaterial(factionId, {
    ghillie: unitType === 'sniper',
    roughness: 0.94,
  });
  cloth.color.multiplyScalar(0.7);
  const skin = new THREE.MeshStandardMaterial({ color: 0x8a6e58, roughness: 0.88 });
  const blood = new THREE.MeshBasicMaterial({
    color: 0x6a1212,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });

  // How many limb pieces to fling (1–3)
  const limbKinds = ['arm', 'arm', 'leg', 'leg', 'helmet'];
  // Shuffle
  for (let i = limbKinds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [limbKinds[i], limbKinds[j]] = [limbKinds[j], limbKinds[i]];
  }
  const count = 1 + Math.floor(Math.random() * 3);
  const chosen = limbKinds.slice(0, count);

  // Extra blood mist burst
  for (let i = 0; i < 5 + Math.floor(Math.random() * 4); i++) {
    const drop = new THREE.Mesh(
      new THREE.SphereGeometry(0.04 + Math.random() * 0.05, 5, 5),
      blood.clone()
    );
    drop.name = 'gibPiece';
    drop.position.copy(origin);
    drop.position.x += (Math.random() - 0.5) * 0.3;
    drop.position.z += (Math.random() - 0.5) * 0.3;
    const ang = Math.random() * Math.PI * 2;
    const speed = (1.1 + Math.random() * 1.8) * caliberScale * impulseScale;
    drop.userData.gib = {
      vx: Math.cos(ang) * speed,
      vy: (1.7 + Math.random() * 2) * caliberScale * impulseScale,
      vz: Math.sin(ang) * speed,
      spinX: (Math.random() - 0.5) * 3.2,
      spinZ: (Math.random() - 0.5) * 3.2,
      life: 0.9 + Math.random() * 0.6,
      elapsed: 0,
      groundY: sampleTerrainHeight(origin.x, origin.z, unit._mapDef) + 0.03,
      mapDef: unit._mapDef,
      unitId: unit.id,
      settled: false,
    };
    scene.add(drop);
    activeGibs.add(drop);
    unit._detachedCorpses = unit._detachedCorpses ?? [];
    unit._detachedCorpses.push({ anchor: drop, squadIndex: -100 - i });
  }

  for (const kind of chosen) {
    let mesh;
    if (kind === 'arm') {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.32, 0.1), cloth);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 6), skin);
      hand.position.y = -0.18;
      mesh.add(hand);
    } else if (kind === 'leg') {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.38, 0.12), cloth);
      const boot = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.08, 0.18),
        new THREE.MeshStandardMaterial({ color: 0x2a2418, roughness: 0.95 })
      );
      boot.position.set(0, -0.2, 0.02);
      mesh.add(boot);
    } else {
      // Helmet / head-ish
      mesh = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), cloth);
      mesh.scale.set(1.05, 0.55, 1.05);
    }

    const gib = new THREE.Group();
    gib.name = 'gibPiece';
    gib.add(mesh);
    // Stump blood
    const stump = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), blood);
    stump.position.y = kind === 'helmet' ? 0 : 0.16;
    gib.add(stump);

    gib.position.copy(origin);
    gib.position.x += (Math.random() - 0.5) * 0.4;
    gib.position.z += (Math.random() - 0.5) * 0.4;

    const ang = Math.random() * Math.PI * 2;
    const speed = (1.5 + Math.random() * 2.2) * caliberScale * impulseScale;
    const up = (2.2 + Math.random() * 2.5) * caliberScale * impulseScale;
    gib.userData.gib = {
      vx: Math.cos(ang) * speed,
      vy: up,
      vz: Math.sin(ang) * speed,
      spinX: (Math.random() - 0.5) * 4,
      spinY: (Math.random() - 0.5) * 3.2,
      spinZ: (Math.random() - 0.5) * 4,
      life: 1.4 + Math.random() * 0.9,
      elapsed: 0,
      groundY: sampleTerrainHeight(origin.x, origin.z, unit._mapDef) + 0.04,
      mapDef: unit._mapDef,
      unitId: unit.id,
      settled: false,
    };

    scene.add(gib);
    activeGibs.add(gib);
    unit._detachedCorpses = unit._detachedCorpses ?? [];
    unit._detachedCorpses.push({ anchor: gib, squadIndex: -200 - Math.random() * 50 });
  }

  // Extra blood pools at origin
  const stain = new THREE.Group();
  stain.name = 'bloodPool';
  stain.userData.corpseUnitId = unit.id;
  addBloodPoolAt(stain, 0, 0, 0.6 + Math.random() * 0.27);
  addBloodPoolAt(stain, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, 0.31);
  stain.position.set(origin.x, sampleTerrainHeight(origin.x, origin.z, unit._mapDef) + 0.03, origin.z);
  scene.add(stain);
  unit._detachedCorpses.push({ anchor: stain, squadIndex: -50 });
}

/** Animate flying gib pieces (limbs) after blast kills. */
export function updateInfantryGibs(dt) {
  if (dt <= 0 || activeGibs.size === 0) return;
  const g = 18;
  const done = [];
  for (const gib of activeGibs) {
    const s = gib.userData.gib;
    if (!s) {
      done.push(gib);
      continue;
    }
    if (s.settled) {
      // Leave settled explosive debris on the battlefield until its owner is disposed.
      activeGibs.delete(gib);
      continue;
    }

    s.elapsed += dt;
    s.vy -= g * dt;
    gib.position.x += s.vx * dt;
    gib.position.y += s.vy * dt;
    gib.position.z += s.vz * dt;
    gib.rotation.x += (s.spinX ?? 0) * dt;
    gib.rotation.y += (s.spinY ?? 0) * dt;
    gib.rotation.z += (s.spinZ ?? 0) * dt;

    // Air drag
    s.vx *= 1 - 0.8 * dt;
    s.vz *= 1 - 0.8 * dt;

    const ground = sampleTerrainHeight(gib.position.x, gib.position.z, s.mapDef) + 0.04;
    s.groundY = ground;
    if (gib.position.y <= ground) {
      gib.position.y = ground;
      s.settled = true;
      s.vy = 0;
      s.vx = 0;
      s.vz = 0;
      // Settle once without the repeated rubbery bounce from the old effect.
      gib.rotation.x = (Math.random() - 0.5) * 0.3;
      gib.rotation.z = (Math.random() - 0.5) * 0.36;
    }

  }

  for (const gib of done) {
    activeGibs.delete(gib);
    gib.parent?.remove(gib);
    disposeMeshObject(gib);
  }
}

/** Animate fallen bodies dropping / being thrown after death. */
export function updateDetachedCorpseFalls(dt) {
  if (dt <= 0) return;
  updateInfantryGibs(dt);
  const finished = [];
  for (const anchor of activeCorpseAnchors) {
    const flight = anchor.userData.blastFlight;
    if (flight && !flight.settled) {
      flight.vy -= CORPSE_THROW_GRAVITY * dt;
      anchor.position.x += flight.vx * dt;
      anchor.position.y += flight.vy * dt;
      anchor.position.z += flight.vz * dt;
      anchor.rotation.x += (flight.spinX ?? 0) * dt;
      anchor.rotation.y += (flight.spinY ?? 0) * dt;
      anchor.rotation.z += (flight.spinZ ?? 0) * dt;
      // Air drag — heavy body slows faster than gib limbs.
      flight.vx *= 1 - 1.15 * dt;
      flight.vz *= 1 - 1.15 * dt;

      // Re-sample terrain under the travelling corpse.
      const ground =
        sampleTerrainHeight(anchor.position.x, anchor.position.z, flight.mapDef) + 0.02;
      flight.groundY = ground;

      if (anchor.position.y <= ground) {
        anchor.position.y = ground;
        if (flight.bounceLeft > 0 && Math.abs(flight.vy) > 3.2) {
          flight.bounceLeft -= 1;
          flight.vy = Math.abs(flight.vy) * 0.22;
          flight.vx *= 0.5;
          flight.vz *= 0.5;
          flight.spinX *= 0.45;
          flight.spinY *= 0.45;
          flight.spinZ *= 0.45;
        } else {
          flight.settled = true;
          flight.vx = 0;
          flight.vy = 0;
          flight.vz = 0;
          // Settle as a prone corpse on the dirt.
          anchor.rotation.x = (Math.random() - 0.5) * 0.14;
          anchor.rotation.z = (Math.random() - 0.5) * 0.18;
          if (flight.bloodPool) {
            flight.bloodPool.visible = true;
            flight.bloodPool.position.y = 0;
          }
          delete anchor.userData.blastFlight;
          finished.push(anchor);
        }
      }
      continue;
    }

    const fall = anchor.userData.fall;
    if (!fall) {
      finished.push(anchor);
      continue;
    }
    fall.elapsed += dt;
    const t = Math.min(1, fall.elapsed / Math.max(fall.dur ?? CORPSE_FALL_SEC, 0.12));
    applyFallPose(anchor, sampleFallPose(fall, t));
    if (fall.bloodPool && t >= 0.82) {
      fall.bloodPool.visible = true;
      fall.bloodPool.position.y = 0;
    }
    if (t >= 1) {
      applyFallPose(anchor, sampleFallPose(fall, 1));
      if (fall.bloodPool) {
        fall.bloodPool.visible = true;
        fall.bloodPool.position.y = 0;
      }
      delete anchor.userData.fall;
      finished.push(anchor);
    }
  }
  for (const anchor of finished) {
    activeCorpseAnchors.delete(anchor);
  }
}

export function clearDetachedCorpseFalls() {
  activeCorpseAnchors.clear();
  for (const gib of activeGibs) {
    gib.parent?.remove(gib);
    disposeMeshObject(gib);
  }
  activeGibs.clear();
}

export function updateSquadCasualtyVisual(unit, blastOptions = {}) {
  const type = unit?.def?.type;
  const squadSize = SQUAD_SIZES[type];
  if (!squadSize || !unit?.mesh || unit.dead || unit.mesh.userData?.deathVisualApplied) return;

  const living = livingPersonnelForHp(unit.hp, unit.maxHp, squadSize);
  const prevLiving = unit._squadLiving ?? squadSize;
  if (prevLiving === living) return;

  const members = getSquadMembers(unit.mesh);
  if (!members.length) {
    unit._squadLiving = living;
    return;
  }

  const factionId = unit.mesh.userData.factionId ?? unit.faction?.id ?? 'germany';

  if (living < prevLiving) {
    for (let i = living; i < members.length; i++) {
      if (members[i].visible) {
        spawnCasualtyAtMember(unit, members[i], factionId, type, blastOptions);
      }
    }
  } else if (living > prevLiving) {
    for (let i = prevLiving; i < living && i < members.length; i++) {
      restoreSquadMember(unit, members[i]);
    }
  }

  unit._squadLiving = living;
}

function snapCorpseToTerrain(mesh, mapDef) {
  if (!mesh || !mapDef) return;
  mesh.position.y = sampleTerrainHeight(mesh.position.x, mesh.position.z, mapDef);
}

/** How long fallen infantry bodies stay on the battlefield (seconds). */
export const INFANTRY_CORPSE_LINGER_SEC = 90;

function corpseBodyCount(unitType) {
  switch (unitType) {
    case 'infantry':
    case 'paratrooper':
      return 2 + Math.floor(Math.random() * 2);
    case 'machineGun':
    case 'sniper':
      return 2;
    case 'mortar':
      return 1 + Math.floor(Math.random() * 2);
    default:
      return 1;
  }
}

function addFallenHelmet(group, helmetMat, factionId) {
  let helmet;
  if (factionId === 'germany') {
    helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      helmetMat
    );
    helmet.rotation.x = Math.PI / 2;
    helmet.position.set(0.05, 0.07, 0.18);
  } else if (factionId === 'usa') {
    helmet = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), helmetMat);
    helmet.scale.set(1.05, 0.55, 1.05);
    helmet.rotation.x = Math.PI / 2;
    helmet.position.set(0.04, 0.07, 0.17);
  } else if (factionId === 'russia') {
    helmet = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), helmetMat);
    helmet.scale.set(1.08, 0.5, 1.08);
    helmet.rotation.x = Math.PI / 2;
    helmet.position.set(0.04, 0.07, 0.16);
  } else if (factionId === 'japan') {
    helmet = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), helmetMat);
    helmet.scale.set(1.05, 0.46, 1.08);
    helmet.rotation.x = Math.PI / 2;
    helmet.position.set(0.04, 0.07, 0.16);
  } else {
    helmet = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), helmetMat);
    helmet.scale.set(1.1, 0.48, 1.1);
    helmet.rotation.x = Math.PI / 2;
    helmet.position.set(0.04, 0.07, 0.16);
  }
  group.add(helmet);
}

/** Single prone soldier with faction uniform camo. */
function buildFallenSoldierBody(factionId, { ghillie = false } = {}) {
  const group = new THREE.Group();
  group.name = 'fallenBody';

  const uniformMat = createCorpseClothMaterial(factionId, {
    ghillie,
    roughness: 0.94,
  });
  uniformMat.color.multiplyScalar(0.72);

  const skinMat = new THREE.MeshStandardMaterial({ color: 0x8a6e58, roughness: 0.88 });
  const gearMats = getInfantryMaterials(factionId);

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.52, 8), uniformMat);
  torso.rotation.z = Math.PI / 2;
  torso.scale.z = 0.72;
  torso.position.set(0, 0.08, 0);
  torso.castShadow = true;
  torso.receiveShadow = true;
  group.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), skinMat);
  head.scale.set(1.05, 0.85, 0.9);
  head.position.set(0.34, 0.07, 0.04);
  head.castShadow = true;
  group.add(head);

  if (ghillie) {
    const hood = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.2), uniformMat);
    hood.position.set(0.34, 0.09, 0.04);
    group.add(hood);
  } else {
    addFallenHelmet(group, gearMats.helmet.clone(), factionId);
  }

  const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.3, 7), uniformMat);
  legL.position.set(-0.32, 0.07, 0.09);
  legL.rotation.z = Math.PI / 2 + 0.35;
  group.add(legL);

  const legR = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.3, 7), uniformMat);
  legR.position.set(-0.29, 0.07, -0.09);
  legR.rotation.z = Math.PI / 2 - 0.25;
  group.add(legR);

  const bootL = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, 0.08, 0.1),
    gearMats.leather.clone()
  );
  bootL.position.set(-0.51, 0.065, 0.15);
  bootL.rotation.y = -0.25;
  group.add(bootL);
  const bootR = bootL.clone();
  bootR.position.set(-0.48, 0.065, -0.17);
  bootR.rotation.y = 0.2;
  group.add(bootR);

  const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.05, 0.31, 7), uniformMat);
  armL.rotation.z = Math.PI / 2 + 0.25;
  armL.position.set(0.02, 0.07, 0.19);
  group.add(armL);
  const handL = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), skinMat);
  handL.position.set(-0.14, 0.065, 0.23);
  group.add(handL);

  const armR = armL.clone();
  armR.rotation.z = Math.PI / 2 - 0.35;
  armR.position.set(0.08, 0.07, -0.18);
  group.add(armR);
  const handR = handL.clone();
  handR.position.set(0.24, 0.065, -0.23);
  group.add(handR);

  const pack = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.14, 0.11),
    gearMats.webbing.clone()
  );
  pack.position.set(-0.08, 0.1, -0.02);
  pack.rotation.z = 0.15;
  group.add(pack);

  return group;
}

/**
 * Track-crushed remains: still readable as a soldier, but mass has been pressed
 * into the dirt with splayed limbs, mud soak, and tread grooves — not a paper
 * cutout of the standing mesh.
 */
function buildCrushedSoldierBody(factionId, { ghillie = false, trackYaw = 0 } = {}) {
  const group = new THREE.Group();
  group.name = 'fallenBody';
  group.userData.crushed = true;

  const uniformMat = createCorpseClothMaterial(factionId, {
    ghillie,
    roughness: 0.97,
  });
  // Mud + blood soak: darken camo without pure black.
  uniformMat.color.multiplyScalar(0.42);
  uniformMat.color.offsetHSL(0.02, 0.05, -0.04);
  if (uniformMat.emissive) {
    uniformMat.emissive.setHex(0x140404);
    uniformMat.emissiveIntensity = 0.08;
  }

  const skinMat = new THREE.MeshStandardMaterial({
    color: 0x5c4034,
    roughness: 0.95,
    metalness: 0.02,
  });
  skinMat.color.multiplyScalar(0.72);
  const bloodMat = new THREE.MeshStandardMaterial({
    color: 0x4a1010,
    roughness: 0.88,
    metalness: 0.04,
    transparent: true,
    opacity: 0.92,
  });
  const mudMat = new THREE.MeshStandardMaterial({
    color: 0x3a3228,
    roughness: 1,
    metalness: 0,
  });
  const gearMats = getInfantryMaterials(factionId);
  const leather = gearMats.leather.clone();
  leather.color.multiplyScalar(0.45);
  leather.roughness = 0.98;

  // Main mass: flattened torso pancake with slight bulk (not zero-thickness).
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), uniformMat);
  torso.scale.set(1.55, 0.22, 0.95);
  torso.position.set(0.02, 0.035, 0.01);
  torso.rotation.y = (Math.random() - 0.5) * 0.25;
  torso.castShadow = true;
  torso.receiveShadow = true;
  group.add(torso);

  // Secondary body lobe — irregular silhouette of pressed kit/torso.
  const torsoLobe = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), uniformMat);
  torsoLobe.scale.set(1.1, 0.18, 1.35);
  torsoLobe.position.set(-0.12, 0.028, -0.06 + (Math.random() - 0.5) * 0.08);
  torsoLobe.rotation.y = 0.4 + Math.random() * 0.3;
  torsoLobe.receiveShadow = true;
  group.add(torsoLobe);

  // Wet blood soak on the main mass.
  const soak = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), bloodMat);
  soak.scale.set(1.4, 0.12, 0.9);
  soak.position.set(0.06, 0.042, 0.02);
  group.add(soak);

  // Head — crushed flatter, slightly detached offset.
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), skinMat);
  head.scale.set(1.35, 0.28, 1.15);
  head.position.set(0.38 + (Math.random() - 0.5) * 0.06, 0.03, 0.05 + (Math.random() - 0.5) * 0.08);
  head.rotation.z = (Math.random() - 0.5) * 0.5;
  head.castShadow = true;
  group.add(head);

  // Helmet knocked aside and partly buried.
  if (!ghillie) {
    const helm = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 8, 6),
      gearMats.helmet.clone()
    );
    helm.material.color.multiplyScalar(0.55);
    helm.scale.set(1.05, 0.32, 1.05);
    helm.position.set(
      0.42 + (Math.random() - 0.5) * 0.12,
      0.025,
      -0.14 + (Math.random() - 0.5) * 0.1
    );
    helm.rotation.set(0.4, Math.random() * Math.PI, 0.3);
    group.add(helm);
  } else {
    const hood = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.2), uniformMat);
    hood.position.set(0.36, 0.028, 0.04);
    group.add(hood);
  }

  // Splayed legs — pressed thin, flung outward under the track path.
  const legSpecs = [
    { x: -0.34, z: 0.2, yaw: 0.55, stretch: 1.05 },
    { x: -0.3, z: -0.22, yaw: -0.7, stretch: 0.95 },
  ];
  for (const spec of legSpecs) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.22, 3, 6), uniformMat);
    leg.scale.set(1.15, 0.22, 1.5 * spec.stretch);
    leg.position.set(spec.x, 0.025, spec.z);
    leg.rotation.z = Math.PI / 2;
    leg.rotation.y = spec.yaw;
    leg.receiveShadow = true;
    group.add(leg);

    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.1), leather);
    boot.position.set(spec.x - 0.22, 0.02, spec.z + Math.sin(spec.yaw) * 0.08);
    boot.rotation.y = spec.yaw * 0.6;
    group.add(boot);
  }

  // Arms — one forward, one crushed under torso.
  const armOut = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.18, 3, 6), uniformMat);
  armOut.scale.set(1.1, 0.2, 1.35);
  armOut.position.set(0.08, 0.022, 0.28);
  armOut.rotation.set(0.1, 0.2, Math.PI / 2 + 0.4);
  group.add(armOut);
  const handOut = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 5), skinMat);
  handOut.scale.set(1.2, 0.35, 1.1);
  handOut.position.set(-0.06, 0.02, 0.38);
  group.add(handOut);

  const armIn = new THREE.Mesh(new THREE.CapsuleGeometry(0.038, 0.14, 3, 5), uniformMat);
  armIn.scale.set(1.05, 0.18, 1.1);
  armIn.position.set(0.04, 0.02, -0.16);
  armIn.rotation.set(-0.15, -0.5, Math.PI / 2 - 0.25);
  group.add(armIn);

  // Flattened pack / gear pancake.
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.16), leather);
  pack.position.set(-0.1, 0.03, -0.02);
  pack.rotation.y = 0.2;
  group.add(pack);

  // Mud pressed out from under the body.
  for (const [mx, mz, s] of [
    [0.15, 0.18, 0.7],
    [-0.2, -0.12, 0.55],
    [0.05, -0.22, 0.45],
  ]) {
    const mud = new THREE.Mesh(new THREE.SphereGeometry(0.12 * s, 6, 5), mudMat);
    mud.scale.set(1.6, 0.14, 1.2);
    mud.position.set(mx, 0.012, mz);
    group.add(mud);
  }

  // Track grooves — elongated ruts across the remains (tank path direction).
  const grooveMat = new THREE.MeshBasicMaterial({
    color: 0x1a120e,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
  });
  const grooveCount = 2 + (Math.random() < 0.45 ? 1 : 0);
  for (let i = 0; i < grooveCount; i++) {
    const groove = new THREE.Mesh(
      new THREE.PlaneGeometry(1.15 + Math.random() * 0.25, 0.07 + Math.random() * 0.03),
      grooveMat
    );
    groove.rotation.x = -Math.PI / 2;
    groove.rotation.z = trackYaw + (i - (grooveCount - 1) * 0.5) * 0.04 + (Math.random() - 0.5) * 0.08;
    groove.position.set(
      (Math.random() - 0.5) * 0.12,
      0.018 + i * 0.002,
      (i - (grooveCount - 1) * 0.5) * 0.11
    );
    groove.renderOrder = 3;
    groove.name = 'bloodPool';
    group.add(groove);

    // Cleat nicks along the groove for tread texture.
    for (let c = 0; c < 5; c++) {
      const cleat = new THREE.Mesh(
        new THREE.PlaneGeometry(0.05, 0.09),
        grooveMat
      );
      cleat.rotation.x = -Math.PI / 2;
      cleat.rotation.z = groove.rotation.z + Math.PI * 0.5;
      cleat.position.set(
        -0.4 + c * 0.2 + (Math.random() - 0.5) * 0.04,
        0.019 + i * 0.002,
        groove.position.z
      );
      cleat.renderOrder = 4;
      cleat.name = 'bloodPool';
      group.add(cleat);
    }
  }

  return group;
}

function addCrushedGroundMess(parent, squadIndex = null) {
  // Broad dark mud/blood stain under the remains.
  const mud = createBloodPoolMesh(0.72 + Math.random() * 0.2, {
    color: 0x2c1810,
    opacity: 0.55,
    lobes: 6,
  });
  mud.position.set(0, 0.006, 0);
  mud.scale.set(1.35, 1, 0.85);
  mud.renderOrder = 1;
  mud.name = 'bloodPool';
  if (squadIndex != null) mud.userData.squadIndex = squadIndex;
  parent.add(mud);

  const blood = createBloodPoolMesh(0.48 + Math.random() * 0.18, {
    color: 0x4a0e0e,
    opacity: 0.5,
    lobes: 5,
  });
  blood.position.set((Math.random() - 0.5) * 0.12, 0.008, (Math.random() - 0.5) * 0.1);
  blood.renderOrder = 2;
  blood.name = 'bloodPool';
  if (squadIndex != null) blood.userData.squadIndex = squadIndex;
  parent.add(blood);

  // Elongated smear in the drive direction.
  const smear = createBloodPoolMesh(0.55, {
    color: 0x1f0a0a,
    opacity: 0.42,
    lobes: 3,
  });
  smear.position.set((Math.random() - 0.5) * 0.08, 0.007, (Math.random() - 0.5) * 0.06);
  smear.scale.set(2.1, 1, 0.42);
  smear.rotation.z = (Math.random() - 0.5) * 0.35;
  smear.renderOrder = 2;
  smear.name = 'bloodPool';
  if (squadIndex != null) smear.userData.squadIndex = squadIndex;
  parent.add(smear);
}

function hideLivingUnitMesh(mesh) {
  for (const child of mesh.children) {
    if (child.name === 'corpseStain' || child.name === 'fallenBody' || child.name === 'bloodPool') {
      continue;
    }
    child.visible = false;
  }
  mesh.traverse((child) => {
    if (child.name === 'squadMember') child.visible = false;
  });
}

/** Fallen squad / soldier — prone bodies on the ground with faction camo. */
function getDeathBlastOptions(unit) {
  if (unit?._deathCause !== 'explosion') return {};
  return (
    resolveBlastProfile(unit, {
      blastOrigin: unit._deathBlastOrigin,
    }) ?? {}
  );
}

export function applyInfantryCorpseLook(
  mesh,
  unitType = mesh?.userData?.type,
  { staticRestore = false } = {}
) {
  if (!mesh || mesh.userData.corpseApplied) return;
  mesh.userData.corpseApplied = true;
  const unit = mesh.userData?.unit;
  const members = getSquadMembers(mesh);
  // Capture the living members before hiding the live squad mesh. A full
  // squad death must leave one thrown body per soldier, while members already
  // detached by earlier splash damage remain in their existing corpse state.
  const visibleMembers = members.filter((member) => member.visible);
  hideUnitChrome(mesh);
  hideLivingUnitMesh(mesh);

  mesh.rotation.x = 0;
  mesh.rotation.z = 0;

  if (unit) migrateMeshCorpsesToWorld(unit);

  const factionId = mesh.userData.factionId ?? 'germany';
  const blastKill = unit?._deathCause === 'explosion';
  const crushKill = unit?._deathCause === 'crush';
  const blastOptions = blastKill ? getDeathBlastOptions(unit) : {};

  if (unit && visibleMembers.length) {
    for (const member of visibleMembers) {
      spawnCasualtyAtMember(
        unit,
        member,
        factionId,
        unitType,
        blastOptions,
        !staticRestore
      );
    }
  } else if (unit) {
    // Blast kills scatter bodies a bit wider; crush deaths pile under the tracks.
    const count = corpseBodyCount(unitType);
    const spread =
      (unitType === 'infantry' ? 1.35 : 1.05) *
      (blastKill ? 1.55 : crushKill ? 0.72 : 1);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * spread * (blastKill ? 0.85 : crushKill ? 0.4 : 0.55);
      placeDetachedCorpse(
        unit,
        new THREE.Vector3(Math.cos(angle) * dist, 0, Math.sin(angle) * dist),
        factionId,
        unitType,
        -1 - i,
        angle + (Math.random() - 0.5) * (crushKill ? 1.4 : 0.8),
        !staticRestore && blastKill && !crushKill,
        blastOptions
      );
    }
  }

  // Occasional flying limbs / helmets only for a near-direct explosive kill.
  const centerBlastResponse =
    unit && blastKill
      ? getBlastCasualtyResponse(unit.position, blastOptions)
      : { kind: 'grounded' };
  if (
    unit &&
    blastKill &&
    !crushKill &&
    !staticRestore &&
    centerBlastResponse.kind === 'throw'
  ) {
    spawnExplosionGibs(unit, factionId, unitType, blastOptions);
  }

  if (crushKill && !mesh.children.some((c) => c.name === 'corpseStain')) {
    // Darker, wider mud/blood scar under the whole squad stamp.
    const stain = new THREE.Group();
    stain.name = 'corpseStain';
    stain.renderOrder = 1;
    addCrushedGroundMess(stain, null);
    mesh.add(stain);
  }

  if (unitType === 'machineGun' && unit?.mesh?.parent) {
    const gun = new THREE.Mesh(
      new THREE.BoxGeometry(0.65, 0.07, 0.07),
      new THREE.MeshStandardMaterial({ color: 0x2a2a28, roughness: 0.7, metalness: 0.35 })
    );
    gun.name = 'fallenBody';
    const local = new THREE.Vector3(0.35, 0.05, -0.25);
    const worldPos = local.clone();
    unit.mesh.localToWorld(worldPos);
    gun.position.copy(worldPos);
    gun.rotation.y = unit.mesh.rotation.y + Math.random() * 0.6;
    unit.mesh.parent.add(gun);
  }

  if (!mesh.children.some((c) => c.name === 'corpseStain')) {
    addGroundStain(mesh, unitType === 'infantry' ? 2.8 : 2.1);
  }
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

/** How long destroyed vehicles stay on the battlefield (seconds). */
export const VEHICLE_WRECK_LINGER_SEC = 120;

/** Remove corpse geometry detached from a unit mesh at death. */
export function disposeUnitCorpseVisuals(unit, scene) {
  if (!unit) return;
  for (const entry of unit._detachedCorpses ?? []) {
    entry.anchor?.parent?.remove(entry.anchor);
    activeCorpseAnchors.delete(entry.anchor);
    activeGibs.delete(entry.anchor);
    disposeMeshObject(entry.anchor);
  }
  unit._detachedCorpses = [];

  if (!scene) return;
  const detached = [];
  scene.traverse((child) => {
    if (child.userData?.corpseUnitId === unit.id || child.userData?.gib?.unitId === unit.id) {
      detached.push(child);
    }
  });
  for (const child of detached) {
    child.parent?.remove(child);
    activeGibs.delete(child);
    disposeMeshObject(child);
  }
}

/** Apply corpse / wreck visuals and linger timers when a unit dies. */
export function applyUnitDeathVisual(unit, { staticRestore = false } = {}) {
  const mesh = unit?.mesh;
  const type = unit?.def?.type;
  if (!mesh || !type || mesh.userData.deathVisualApplied) return;
  mesh.userData.deathVisualApplied = true;

  hideUnitChrome(mesh);
  snapCorpseToTerrain(mesh, unit._mapDef);

  if (isTankType(type)) {
    unit.wreckTimeLeft = VEHICLE_WRECK_LINGER_SEC;
    applyTankWreckLook(mesh, { preserveTurret: !!unit._recoverableWreck });
    return;
  }

  if (
    type === 'radioOperator' ||
    type === 'infantry' ||
    type === 'paratrooper' ||
    type === 'machineGun' ||
    type === 'sniper' ||
    type === 'mortar' ||
    type === 'medic' ||
    type === 'engineer' ||
    type === 'vehicleCrew' ||
    type === 'commander'
  ) {
    unit.corpseTimeLeft = INFANTRY_CORPSE_LINGER_SEC;
    applyInfantryCorpseLook(mesh, type, { staticRestore });
    return;
  }

  if (type === 'armoredCar') {
    unit.corpseTimeLeft = VEHICLE_WRECK_LINGER_SEC;
    unit.wreckTimeLeft = 0;
    applyVehicleCorpseLook(mesh, { heavy: false });
    return;
  }

  if (type === 'artillery' || type === 'antiTankGun') {
    // The operating detachment is part of the gun unit: when it is knocked out,
    // the live crew disappears from the carriage and leaves faction-correct
    // casualties. Small arms kill the exposed crew, not the weapon itself, so
    // retain the complete, normally painted field piece as battlefield cover.
    for (const member of getSquadMembers(mesh)) {
      if (member.userData.isTowedGunCrew && member.visible) {
        spawnCasualtyAtMember(
          unit,
          member,
          mesh.userData.factionId ?? 'germany',
          type,
          getDeathBlastOptions(unit),
          !staticRestore
        );
      }
    }
    unit.corpseTimeLeft = VEHICLE_WRECK_LINGER_SEC;
    if (unit._deathCause !== 'explosion' && unit._deathCause !== 'crush') {
      mesh.userData.crewKilled = true;
      return;
    }
    applyVehicleCorpseLook(mesh, { heavy: type === 'artillery' });
  }
}

/** True while a dead unit's wreck or corpse mesh should stay on the battlefield. */
export function unitHasCorpseLinger(unit) {
  if (!unit?.dead) return false;
  return !!unit.mesh?.userData?.deathVisualApplied && !!unit.mesh?.parent;
}

/** Scorched, knocked-out look for destroyed tanks left on the field. */
export function applyTankWreckLook(mesh, { preserveTurret = false } = {}) {
  if (!mesh?.userData?.isTank || mesh.userData.wreckApplied) return;
  mesh.userData.wreckApplied = true;

  const hullPreset = {
    colorScale: 0.34,
    emissive: 0x220800,
    emissiveIntensity: 0.28,
    metalness: 0.08,
    roughness: 0.98,
  };
  const burnPreset = {
    colorScale: 0.26,
    emissive: 0x331100,
    emissiveIntensity: 0.16,
    metalness: 0.08,
    roughness: 0.98,
  };
  const brokenSide = Math.random() > 0.5 ? 1 : -1;

  mesh.traverse((child) => {
    if (!child.isMesh || WRECK_SKIP_MESHES.has(child.name)) return;

    const part = child.userData.tankPart;
    if (!preserveTurret && WRECK_REMOVED_PARTS.has(part)) {
      child.visible = false;
      return;
    }

    const preset = part === 'hull' || part === 'turret' ? hullPreset : burnPreset;
    applyScorchedMaterial(child, preset);

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

  const holeMat = new THREE.MeshBasicMaterial({ color: 0x050403 });
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

  if (preserveTurret) return;

  const factionId = mesh.userData.factionId ?? 'germany';
  const unitType = mesh.userData.type ?? 'tank';
  const bodyTex = getBodyTexture(factionId, unitType);
  const turretMat = bodyTex
    ? mat(0xffffff, {
        rough: 0.95,
        map: bodyTex,
        emissive: 0x220800,
        emissiveIntensity: 0.28,
      })
    : mat(0x1a1510, { rough: 0.95, emissive: 0x220800, emissiveIntensity: 0.28 });
  if (bodyTex) turretMat.color.multiplyScalar(0.34);
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

/** Apply the persistent flattened look left by a vehicle running over a wreck. */
export function applyVehicleWreckCrushVisual(unit) {
  const mesh = unit?.mesh;
  if (!mesh) return;
  const wreckType = unit?.def?.type;
  const reducedToRubble = !!unit?._wreckReducedToRubble;
  const runOvers = Math.max(0, unit?._wreckRunOverCount ?? 0);
  const damage = THREE.MathUtils.clamp(
    unit?._wreckRunOverDamage ?? Math.min(1, runOvers * 0.14),
    0,
    1
  );
  const currentDamage = mesh.userData.wreckRunOverVisualDamage ?? -1;
  if (
    damage <= currentDamage + 0.0001 &&
    (!reducedToRubble || mesh.userData.wreckRubbleApplied)
  ) {
    return;
  }

  const lightWreck = ['armoredCar', 'antiTankGun', 'artillery'].includes(wreckType);
  const maxHullCompression = {
    armoredCar: 0.23,
    antiTankGun: 0.2,
    artillery: 0.17,
    tank: 0.1,
    tankDestroyer: 0.09,
    superHeavyTank: 0.07,
  }[wreckType] ?? 0.12;
  // Armored hulls retain their volume. Most visible change comes from broken
  // running gear, displaced fittings and thin upper plates—not a squashed box.
  const targetVerticalScale = reducedToRubble
    ? 0.32
    : 0.93 - damage * maxHullCompression;
  const currentVerticalScale = mesh.userData.wreckCrushScale ?? 1;
  const targetFootprintScale = reducedToRubble
    ? 1.08
    : 1 + damage * (lightWreck ? 0.04 : 0.015);
  const currentFootprintScale = mesh.userData.wreckCrushFootprintScale ?? 1;

  mesh.userData.wreckCrushApplied = true;
  mesh.userData.wreckRubbleApplied ||= reducedToRubble;
  mesh.userData.wreckRunOverVisualDamage = damage;
  mesh.userData.wreckCrushScale = targetVerticalScale;
  mesh.userData.wreckCrushFootprintScale = targetFootprintScale;
  mesh.scale.y *= targetVerticalScale / currentVerticalScale;
  mesh.scale.x *= targetFootprintScale / currentFootprintScale;
  mesh.scale.z *= targetFootprintScale / currentFootprintScale;

  const targetTrackSpread = reducedToRubble
    ? 1.3
    : 1 + damage * (lightWreck ? 0.18 : 0.12);
  const currentTrackSpread = mesh.userData.wreckTrackSpread ?? 1;
  const trackSpreadRatio = targetTrackSpread / currentTrackSpread;
  const targetTrackBend = reducedToRubble
    ? 0.55
    : damage * (lightWreck ? 0.34 : 0.22);
  const currentTrackBend = mesh.userData.wreckTrackBend ?? 0;
  const addedTrackBend = targetTrackBend - currentTrackBend;
  mesh.userData.wreckTrackSpread = targetTrackSpread;
  mesh.userData.wreckTrackBend = targetTrackBend;
  mesh.traverse((child) => {
    const part = child.userData?.tankPart;
    if (
      part === 'barrel' ||
      part === 'mantlet' ||
      (reducedToRubble && (part === 'turret' || part === 'muzzle'))
    ) {
      child.visible = false;
    }
    if (part === 'track') {
      child.position.x *= trackSpreadRatio;
      const side = Math.sign(child.position.x) || 1;
      child.rotation.z += side * addedTrackBend;
    }
  });

  const targetDebrisCount = reducedToRubble
    ? 16
    : 2 + Math.round(damage * (lightWreck ? 10 : 7));
  let debrisCount = mesh.children.filter(
    (child) => child.name === 'wreckRunOverDebris'
  ).length;
  while (debrisCount < targetDebrisCount) {
    const i = debrisCount++;
    const angle = (Number(unit.id) * 1.713 + i * 2.399) % (Math.PI * 2);
    const radius = 1.05 + (i % 4) * 0.34;
    const chunk = new THREE.Mesh(
      new THREE.BoxGeometry(0.24 + (i % 3) * 0.08, 0.1, 0.2 + (i % 2) * 0.1),
      new THREE.MeshStandardMaterial({
        color: i % 3 === 0 ? 0x79371f : 0x292725,
        roughness: 0.92,
        metalness: 0.28,
      })
    );
    chunk.name = 'wreckRunOverDebris';
    chunk.position.set(
      Math.cos(angle) * radius,
      0.12 + (i % 2) * 0.04,
      Math.sin(angle) * radius
    );
    chunk.rotation.set(angle * 0.37, angle, angle * 0.61);
    mesh.add(chunk);
  }

  // Thin fittings and access plates can buckle or shear; thick hull armor does
  // not uniformly collapse. Light wrecks expose more plate damage.
  const targetPlateCount = reducedToRubble
    ? 7
    : damage > 0
      ? Math.max(1, Math.ceil(damage * (lightWreck ? 5 : 3)))
      : 0;
  let plateCount = mesh.children.filter(
    (child) => child.name === 'wreckRunOverDamagePlate'
  ).length;
  while (plateCount < targetPlateCount) {
    const i = plateCount++;
    const side = i % 2 === 0 ? 1 : -1;
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(0.42 + (i % 3) * 0.1, 0.06, 0.3 + (i % 2) * 0.1),
      new THREE.MeshStandardMaterial({
        color: i % 2 === 0 ? 0x8a3b21 : 0x3a302a,
        roughness: 0.88,
        metalness: 0.36,
      })
    );
    plate.name = 'wreckRunOverDamagePlate';
    plate.position.set(side * (0.35 + (i % 3) * 0.38), 0.72, (i - 1) * 0.38);
    plate.rotation.set(side * 0.13, i * 1.17, side * (0.18 + i * 0.035));
    mesh.add(plate);
  }

  const sign = Number(unit.id) % 2 === 0 ? 1 : -1;
  const targetTilt = sign * (0.045 + damage * (lightWreck ? 0.055 : 0.025));
  const currentTilt = mesh.userData.wreckCrushTilt ?? 0;
  mesh.rotation.z += targetTilt - currentTilt;
  mesh.userData.wreckCrushTilt = targetTilt;
}

export { spawnMuzzleFlash } from '../effects/CombatEffects.js';
