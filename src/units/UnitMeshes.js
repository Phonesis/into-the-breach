import * as THREE from 'three';
import {
  mat,
  buildFactionVehicle,
  buildFactionInfantry,
  buildFactionParatrooper,
  buildFactionMG,
  buildFactionMortar,
  buildFactionMedic,
  buildFactionEngineer,
  buildFactionSniper,
} from './FactionMeshes.js';
import { isTankType } from './VehicleTypes.js';
import {
  getBodyTexture,
  getGhillieTexture,
  getInfantryUniformTexture,
  createCamoMaterial,
} from './UnitTextures.js';
import { applyInfantryShadowPolicy } from './InfantryVisuals.js';
import { sampleTerrainHeight } from '../world/Terrain.js';
import { SQUAD_SIZES } from '../data/squadSizes.js';

export { mat };

const INFANTRY_TYPES = new Set([
  'infantry',
  'paratrooper',
  'machineGun',
  'mortar',
  'sniper',
  'medic',
  'engineer',
]);

const CORPSE_FALL_SEC = 0.45;
/** Chance a blast kill produces flying limbs (not every explosion death). */
const EXPLOSION_GIB_CHANCE = 0.48;
/** @type {Set<THREE.Group>} */
const activeCorpseAnchors = new Set();
/** @type {Set<THREE.Object3D>} */
const activeGibs = new Set();

export function createUnitMesh(type, teamColor, accentColor, factionId = 'germany') {
  const group = new THREE.Group();
  const bodyTex = getBodyTexture(factionId, type);
  const body = mat(teamColor, { rough: 0.72, map: bodyTex ?? undefined });
  const detail = mat(teamColor, { metal: 0.32, rough: 0.65, map: bodyTex ?? undefined });
  const dark = mat(0x1a1a1a, { metal: 0.5 });

  let built = false;

  if (
    type === 'tank' ||
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
  } else if (type === 'infantry') {
    buildFactionInfantry(group, body, dark, factionId);
    built = true;
  } else if (type === 'paratrooper') {
    buildFactionParatrooper(group, body, dark, factionId);
    built = true;
  } else if (type === 'sniper') {
    const ghillieTex = getGhillieTexture();
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
    infantry: 1.6,
    machineGun: 2,
    sniper: 1.5,
    mortar: 2.2,
    medic: 1.4,
    engineer: 1.65,
    armoredCar: group.userData.hitRadius ?? 2.6,
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
    armoredCar: 0.85,
    artillery: 0.95,
    antiTankGun: 0.85,
    machineGun: 0.55,
    mortar: 0.65,
    medic: 0.52,
    engineer: 0.52,
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

function squadLivingCount(hp, maxHp, squadSize) {
  if (hp <= 0) return 0;
  if (squadSize <= 1) return 1;
  return Math.max(1, Math.ceil((hp / Math.max(maxHp, 1)) * squadSize));
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

function placeDetachedCorpse(unit, localOffset, factionId, unitType, squadIndex, rotY = 0, animateFall = true) {
  const scene = unit.mesh?.parent;
  if (!scene || !unit.mesh) return null;

  const worldPos = new THREE.Vector3(localOffset.x, localOffset.y, localOffset.z);
  unit.mesh.localToWorld(worldPos);

  const groundY = sampleTerrainHeight(worldPos.x, worldPos.z, unit._mapDef) + 0.02;
  const startY = animateFall ? worldPos.y + 0.52 : groundY;

  const anchor = new THREE.Group();
  anchor.name = 'detachedCorpse';
  anchor.userData.unitId = unit.id;
  anchor.userData.squadIndex = squadIndex;

  const body = buildFallenSoldierBody(factionId, { ghillie: unitType === 'sniper' });
  body.rotation.y = rotY + (Math.random() - 0.5) * 1.2;
  body.rotation.z = (Math.random() - 0.5) * 0.15;
  anchor.add(body);

  addBloodPoolAt(anchor, 0, 0, 0.3 + Math.random() * 0.16, squadIndex);

  anchor.position.set(worldPos.x, startY, worldPos.z);
  anchor.rotation.y = rotY + (Math.random() - 0.5) * 0.4;

  if (animateFall) {
    anchor.rotation.x = -1.05;
    anchor.userData.fall = {
      elapsed: 0,
      dur: CORPSE_FALL_SEC,
      startY,
      endY: groundY,
      startRotX: -1.05,
      endRotX: (Math.random() - 0.5) * 0.12,
    };
    activeCorpseAnchors.add(anchor);
  } else {
    anchor.rotation.x = (Math.random() - 0.5) * 0.12;
  }

  scene.add(anchor);
  unit._detachedCorpses = unit._detachedCorpses ?? [];
  unit._detachedCorpses.push({ anchor, squadIndex });
  return anchor;
}

function spawnCasualtyAtMember(unit, member, factionId, unitType) {
  const squadIndex = member.userData.squadIndex;
  placeDetachedCorpse(
    unit,
    member.position.clone(),
    factionId,
    unitType,
    squadIndex,
    member.rotation?.y ?? 0,
    true
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
 * Spawn occasional flying limbs when infantry die to blast/HE.
 * Chancey — not every kill, and not every limb.
 */
function spawnExplosionGibs(unit, factionId, unitType) {
  const scene = unit?.mesh?.parent;
  if (!scene || !unit?.mesh) return;
  if (Math.random() > EXPLOSION_GIB_CHANCE) return;

  const origin = new THREE.Vector3(
    unit.position.x,
    sampleTerrainHeight(unit.position.x, unit.position.z, unit._mapDef) + 0.85,
    unit.position.z
  );

  const uniformTex =
    unitType === 'sniper' ? getGhillieTexture() : getInfantryUniformTexture(factionId);
  const cloth = createCamoMaterial(0xffffff, uniformTex, unitType === 'sniper' ? [1.4, 1] : [1.1, 0.75], {
    rough: 0.94,
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
    const speed = 2.5 + Math.random() * 5;
    drop.userData.gib = {
      vx: Math.cos(ang) * speed,
      vy: 3.5 + Math.random() * 5,
      vz: Math.sin(ang) * speed,
      spinX: (Math.random() - 0.5) * 12,
      spinZ: (Math.random() - 0.5) * 12,
      life: 0.9 + Math.random() * 0.6,
      elapsed: 0,
      groundY: sampleTerrainHeight(origin.x, origin.z, unit._mapDef) + 0.03,
      unitId: unit.id,
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
    const speed = 4 + Math.random() * 7;
    const up = 5 + Math.random() * 6.5;
    gib.userData.gib = {
      vx: Math.cos(ang) * speed,
      vy: up,
      vz: Math.sin(ang) * speed,
      spinX: (Math.random() - 0.5) * 14,
      spinY: (Math.random() - 0.5) * 10,
      spinZ: (Math.random() - 0.5) * 14,
      life: 1.4 + Math.random() * 0.9,
      elapsed: 0,
      groundY: sampleTerrainHeight(origin.x, origin.z, unit._mapDef) + 0.04,
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

    const ground = s.groundY ?? 0.04;
    if (gib.position.y <= ground) {
      gib.position.y = ground;
      if (Math.abs(s.vy) > 2.5) {
        // Bounce once
        s.vy = Math.abs(s.vy) * 0.28;
        s.vx *= 0.55;
        s.vz *= 0.55;
      } else {
        s.settled = true;
        s.vy = 0;
        s.vx = 0;
        s.vz = 0;
        // Flatten slightly on ground
        gib.rotation.x = (Math.random() - 0.5) * 0.4;
        gib.rotation.z = (Math.random() - 0.5) * 0.5;
      }
    }

  }

  for (const gib of done) {
    activeGibs.delete(gib);
    gib.parent?.remove(gib);
    disposeMeshObject(gib);
  }
}

/** Animate fallen bodies dropping to the ground at their death location. */
export function updateDetachedCorpseFalls(dt) {
  if (dt <= 0) return;
  updateInfantryGibs(dt);
  for (const anchor of activeCorpseAnchors) {
    const fall = anchor.userData.fall;
    if (!fall) continue;
    fall.elapsed += dt;
    const t = Math.min(1, fall.elapsed / fall.dur);
    const eased = t * t * (3 - 2 * t);
    anchor.position.y = THREE.MathUtils.lerp(fall.startY, fall.endY, eased);
    anchor.rotation.x = THREE.MathUtils.lerp(fall.startRotX, fall.endRotX, eased);
    if (t >= 1) {
      anchor.position.y = fall.endY;
      anchor.rotation.x = fall.endRotX;
      delete anchor.userData.fall;
      activeCorpseAnchors.delete(anchor);
    }
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

export function updateSquadCasualtyVisual(unit) {
  const type = unit?.def?.type;
  const squadSize = SQUAD_SIZES[type];
  if (!squadSize || !unit?.mesh || unit.dead || unit.mesh.userData?.deathVisualApplied) return;

  const living = squadLivingCount(unit.hp, unit.maxHp, squadSize);
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
      if (members[i].visible) spawnCasualtyAtMember(unit, members[i], factionId, type);
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
      return 2;
    case 'mortar':
      return 1 + Math.floor(Math.random() * 2);
    default:
      return 1;
  }
}

function addFallenHelmet(group, uniformMat, factionId) {
  let helmet;
  if (factionId === 'germany') {
    helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      uniformMat
    );
    helmet.rotation.x = Math.PI / 2;
    helmet.position.set(0.05, 0.07, 0.18);
  } else if (factionId === 'usa') {
    helmet = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), uniformMat);
    helmet.scale.set(1.05, 0.55, 1.05);
    helmet.rotation.x = Math.PI / 2;
    helmet.position.set(0.04, 0.07, 0.17);
  } else if (factionId === 'russia') {
    helmet = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), uniformMat);
    helmet.scale.set(1.08, 0.5, 1.08);
    helmet.rotation.x = Math.PI / 2;
    helmet.position.set(0.04, 0.07, 0.16);
  } else {
    helmet = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), uniformMat);
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

  const uniformTex = ghillie ? getGhillieTexture() : getInfantryUniformTexture(factionId);
  const uniformMat = createCamoMaterial(0xffffff, uniformTex, ghillie ? [1.4, 1] : [1.1, 0.75], {
    rough: 0.94,
  });
  uniformMat.color.multiplyScalar(0.72);

  const skinMat = new THREE.MeshStandardMaterial({ color: 0x8a6e58, roughness: 0.88 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.16, 0.3), uniformMat);
  torso.position.set(0, 0.08, 0);
  torso.castShadow = true;
  torso.receiveShadow = true;
  group.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), skinMat);
  head.scale.set(1, 0.85, 1);
  head.position.set(0.34, 0.07, 0.04);
  head.castShadow = true;
  group.add(head);

  if (ghillie) {
    const hood = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.2), uniformMat);
    hood.position.set(0.34, 0.09, 0.04);
    group.add(hood);
  } else {
    addFallenHelmet(group, uniformMat, factionId);
  }

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.14), uniformMat);
  legL.position.set(-0.22, 0.06, 0.08);
  legL.rotation.z = 0.35;
  group.add(legL);

  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.14), uniformMat);
  legR.position.set(-0.18, 0.06, -0.1);
  legR.rotation.z = -0.25;
  group.add(legR);

  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.1), uniformMat);
  pack.position.set(-0.08, 0.1, -0.02);
  pack.rotation.z = 0.15;
  group.add(pack);

  return group;
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
export function applyInfantryCorpseLook(mesh, unitType = mesh?.userData?.type) {
  if (!mesh || mesh.userData.corpseApplied) return;
  mesh.userData.corpseApplied = true;
  const unit = mesh.userData?.unit;
  hideUnitChrome(mesh);
  hideLivingUnitMesh(mesh);

  mesh.rotation.x = 0;
  mesh.rotation.z = 0;

  if (unit) migrateMeshCorpsesToWorld(unit);

  const factionId = mesh.userData.factionId ?? 'germany';
  const members = getSquadMembers(mesh);
  const blastKill = unit?._deathCause === 'explosion';

  if (unit && members.length) {
    for (const member of members) {
      if (member.visible) spawnCasualtyAtMember(unit, member, factionId, unitType);
    }
  } else if (unit) {
    // Blast kills scatter bodies a bit wider
    const count = corpseBodyCount(unitType);
    const spread = (unitType === 'infantry' ? 1.35 : 1.05) * (blastKill ? 1.55 : 1);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * spread * (blastKill ? 0.85 : 0.55);
      placeDetachedCorpse(
        unit,
        new THREE.Vector3(Math.cos(angle) * dist, 0, Math.sin(angle) * dist),
        factionId,
        unitType,
        -1 - i,
        angle + (Math.random() - 0.5) * 0.8,
        blastKill // animate fall more often on blast
      );
    }
  }

  // Occasional flying limbs / helmets on explosive kills
  if (unit && blastKill) {
    spawnExplosionGibs(unit, factionId, unitType);
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
export function applyUnitDeathVisual(unit) {
  const mesh = unit?.mesh;
  const type = unit?.def?.type;
  if (!mesh || !type || mesh.userData.deathVisualApplied) return;
  mesh.userData.deathVisualApplied = true;

  hideUnitChrome(mesh);
  snapCorpseToTerrain(mesh, unit._mapDef);

  if (isTankType(type)) {
    unit.wreckTimeLeft = VEHICLE_WRECK_LINGER_SEC;
    applyTankWreckLook(mesh);
    return;
  }

  if (
    type === 'infantry' ||
    type === 'paratrooper' ||
    type === 'machineGun' ||
    type === 'sniper' ||
    type === 'mortar' ||
    type === 'medic' ||
    type === 'engineer'
  ) {
    unit.corpseTimeLeft = INFANTRY_CORPSE_LINGER_SEC;
    applyInfantryCorpseLook(mesh, type);
    return;
  }

  if (type === 'armoredCar') {
    unit.corpseTimeLeft = VEHICLE_WRECK_LINGER_SEC;
    unit.wreckTimeLeft = 0;
    applyVehicleCorpseLook(mesh, { heavy: false });
    return;
  }

  if (type === 'artillery' || type === 'antiTankGun') {
    unit.corpseTimeLeft = VEHICLE_WRECK_LINGER_SEC;
    applyVehicleCorpseLook(mesh, { heavy: type === 'artillery' });
  }
}

/** True while a dead unit's wreck or corpse mesh should stay on the battlefield. */
export function unitHasCorpseLinger(unit) {
  if (!unit?.dead) return false;
  return !!unit.mesh?.userData?.deathVisualApplied && !!unit.mesh?.parent;
}

/** Scorched, knocked-out look for destroyed tanks left on the field. */
export function applyTankWreckLook(mesh) {
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
    if (WRECK_REMOVED_PARTS.has(part)) {
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

export { spawnMuzzleFlash } from '../effects/CombatEffects.js';