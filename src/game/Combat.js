import * as THREE from 'three';
import { spawnMuzzleFlash } from '../units/UnitMeshes.js';
import {
  spawnHandGrenade,
  spawnSmokeShellImpact,
  triggerParatrooperAtRecoil,
} from '../effects/CombatEffects.js';
import {
  sampleTerrainHeight,
  hasReachedMoveDest,
  advanceUnitOnTerrain,
  updateUnitTerrainPose,
} from '../world/Terrain.js';
import {
  advanceMovePath,
  applyObstaclePath,
  buildMovePath,
  movePathHorizontalReach,
  unitPathPlanRadius,
  unitPathRadius,
} from './MovePath.js';

import {
  distanceBetween,
  distanceToPoint,
  isInRange,
  isInsideMinimumRange,
  isInArtilleryCrewSmallArmsRange,
  isInCoaxRange,
  isPointInRange,
  isCoaxSoftTarget,
  canEngageManualOrder,
  getGroundFireMoveDest,
  getStandoffPosition,
  tankCanEngageTarget,
  findNearestEnemyInRange,
  filterAcquireNearAttacker,
  isSmokeShellTarget,
  SMOKE_SHELL_COOLDOWN_SEC,
  isHqTarget,
  WEAPON_RANGE_SLACK,
} from './Targeting.js';
import { SMOKE_MISS_CHANCE } from './SmokeScreen.js';
import { getIncomingDamageMultiplier } from './CoverSystem.js';
import { getArmorDamageMultiplier } from './ClearanceMode.js';
import { maybeTriggerRetreat, clearRetreat, resolveRetreatHq } from './RetreatBehavior.js';
import { maybeTriggerSurrender, markUnderFire } from './SurrenderBehavior.js';
import { getRankDamageMultiplier, recordEnemyKill } from './EliteBehavior.js';
import { isSceneryTarget, wrapSceneryTarget } from './SceneryTarget.js';
import { isDefenseTarget } from './DefenseTarget.js';
import { isBaseBuildingTarget } from './BaseBuildingTarget.js';
import { getStructureDamageMultiplier } from './StructureDamage.js';
import { getDefenseDamageMultForAttacker } from './DefenseStructures.js';
import {
  getMoveReachConfig,
  isTankType,
  isVehicleUnit,
  shouldUseTacticalReverse,
} from '../units/VehicleTypes.js';
import { isUnitMounted } from './TankRiders.js';
import {
  canIndependentMgBearOnTarget,
  canWeaponBearOnTarget,
  faceIndependentMgTowardTarget,
  faceUnitTowardTarget,
  hasIndependentMgPivot,
} from '../units/VehicleRotation.js';
import { applyMobilityDamage, resolveArmorHit } from './ArmorPenetration.js';
import {
  getInfantryMuzzleWorldPosition,
  aimDeployedMachineGun,
  aimDeployedMortar,
  markInfantryFireAim,
  updateInfantryWalkAnimation,
  usesInfantryMuzzleOrigin,
  isUnitVisuallyProne,
} from '../units/InfantryVisuals.js';
import {
  getIndependentVehicleMgMuzzleWorldPosition,
  getVehicleCannonMuzzleWorldPosition,
  usesIndependentVehicleMgMuzzleOrigin,
  usesVehicleCannonMuzzleOrigin,
} from '../units/VehicleMeshKit.js';
import { isFootSoldier } from '../units/VehicleTypes.js';
import { isUnitGarrisoned } from './BunkerGarrison.js';


const SMALL_ARMS_TYPES = new Set([
  'infantry',
  'engineer',
  'machineGun',
  'sniper',
  'armoredCar',
  'paratrooper',
  'vehicleCrew',
]);

/**
 * In-flight mortar / artillery shells. Aim point is locked at fire time so a
 * unit that walks away is only hit if still inside the splash when the round lands.
 * @type {Array<object>}
 */
const pendingIndirectImpacts = [];
/** Bumped on every clear so in-flight shells from a prior match never detonate. */
let indirectImpactEpoch = 0;

/** Flight time (s) from range — long enough that moving targets can clear the aim point. */
export function mortarFlightTimeSec(dist) {
  const d = Number.isFinite(dist) ? dist : 40;
  return Math.min(2.85, Math.max(1.05, 0.75 + d / 38));
}

/** Howitzer time-of-flight — slightly longer than mortars at the same distance. */
export function artilleryFlightTimeSec(dist) {
  const d = Number.isFinite(dist) ? dist : 60;
  return Math.min(3.5, Math.max(1.35, 0.95 + d / 40));
}

/** @deprecated use clearPendingIndirectImpacts — kept for existing Game imports */
export function clearPendingMortarImpacts() {
  clearPendingIndirectImpacts();
}

export function clearPendingIndirectImpacts() {
  pendingIndirectImpacts.length = 0;
  indirectImpactEpoch += 1;
}

/**
 * Advance in-flight mortar / artillery shells. Call each combat tick.
 */
export function updatePendingMortarImpacts(dt) {
  updatePendingIndirectImpacts(dt);
}

export function updatePendingIndirectImpacts(dt) {
  if (!pendingIndirectImpacts.length) return;
  // Cap so a hitch cannot force every in-flight shell to land in one frame.
  const step = Math.min(Math.max(0, dt), 0.35);
  for (let i = pendingIndirectImpacts.length - 1; i >= 0; i--) {
    const shell = pendingIndirectImpacts[i];
    if (shell.epoch !== indirectImpactEpoch) {
      pendingIndirectImpacts.splice(i, 1);
      continue;
    }
    shell.timeLeft -= step;
    if (shell.timeLeft > 0) continue;
    pendingIndirectImpacts.splice(i, 1);
    resolveIndirectShellImpact(shell);
  }
}

function resolveIndirectShellImpact(shell) {
  if (shell.epoch !== indirectImpactEpoch) return;
  if (!Number.isFinite(shell.x) || !Number.isFinite(shell.z)) return;
  if (!shell.attacker?.def || shell.attacker.dead) return;
  // Scenery was torn down with the previous battle.
  if (shell.scenery && !Array.isArray(shell.scenery.objects)) return;

  const point = { x: shell.x, z: shell.z };
  const kind = shell.kind === 'artillery' ? 'artillery' : 'mortar';
  let hitScenery = false;

  // Deliberate building fire: detonate on that structure when the shell arrives.
  if (shell.sceneryEntry && shell.scenery && !shell.sceneryEntry.destroyed) {
    const structureDamage =
      shell.damage * getStructureDamageMultiplier(shell.attacker.def.type);
    shell.scenery.damageObject(shell.sceneryEntry, structureDamage, {
      weaponType: shell.attacker.def.type,
      impact: { x: point.x, z: point.z },
      impactFrom: shell.from ?? {
        x: shell.attacker.position.x,
        z: shell.attacker.position.z,
      },
      explosive: true,
    });
    hitScenery = true;
  }

  // Area HE only at the locked aim point — never re-tracks a moved unit.
  applySplashDamage(
    shell.attacker,
    point,
    shell.damage,
    shell.allTargets ?? [],
    shell.coverSystem,
    shell.scenery,
    shell.hqs ?? [],
    shell.options ?? {},
    shell.livingUnits ?? []
  );

  const map = shell.attacker?._mapDef || shell.mapDef;
  const toY = map ? sampleTerrainHeight(point.x, point.z, map) + 1 : 1;
  const to = { x: point.x, y: toY, z: point.z };

  shell.onFire?.({
    attacker: shell.attacker,
    target: null,
    def: shell.attacker?.def,
    dist: distanceToPoint(shell.attacker, point),
    coaxFire: false,
    paratrooperAtFire: false,
    killed: hitScenery && !!shell.sceneryEntry?.destroyed,
    targetIsHQ: false,
    targetIsScenery: hitScenery,
    groundImpact: !hitScenery,
    mortarImpact: kind === 'mortar',
    artilleryImpact: kind === 'artillery',
    from: shell.from ?? { x: shell.attacker.position.x, z: shell.attacker.position.z },
    to,
  });
}

function scheduleIndirectImpact(payload) {
  if (!Number.isFinite(payload?.x) || !Number.isFinite(payload?.z)) return;
  if (!Number.isFinite(payload?.timeLeft) || payload.timeLeft <= 0) return;
  pendingIndirectImpacts.push({ ...payload, epoch: indirectImpactEpoch });
}

/** @deprecated */
function scheduleMortarImpact(payload) {
  scheduleIndirectImpact({ ...payload, kind: 'mortar' });
}
const CRUSHING_VEHICLE_TYPES = new Set([
  'tank',
  'tankDestroyer',
  'superHeavyTank',
  'armoredCar',
]);
/** Only tracked armour flattens trenches and runs over prone / dug-in infantry. */
const TRACK_CRUSH_VEHICLE_TYPES = new Set(['tank', 'tankDestroyer', 'superHeavyTank']);
const ARMOR_TARGET_TYPES = new Set(['tank', 'tankDestroyer', 'superHeavyTank', 'armoredCar']);
const STATIONARY_MAIN_GUN_TYPES = new Set(['antiTankGun', 'artillery', 'mortar']);
const CREW_SERVED_GUN_TYPES = new Set(['antiTankGun', 'artillery']);
const HAND_GRENADE_THROWER_TYPES = new Set(['infantry', 'paratrooper', 'engineer']);
const HAND_GRENADE_TARGET_TYPES = new Set(['tank', 'tankDestroyer', 'superHeavyTank']);
/** High-angle weapons that ignore building LOS for acquire and discharge. */
const MORTAR_INDIRECT_TYPES = new Set(['mortar']);
const AUTHORITATIVE_SHELL_LOS_TYPES = new Set([
  'antiTankGun',
  'tank',
  'tankDestroyer',
  'superHeavyTank',
]);
export const HAND_GRENADE_RANGE = 8;
export const HAND_GRENADE_COOLDOWN_SEC = 9.5;
const HAND_GRENADE_DAMAGE = 12;

/** Foot troops low enough that a tank can grind them under the tracks. */
function isCrushableFootTarget(unit) {
  if (!unit || unit.dead || unit.surrendered || unit._captureExit) return false;
  if (!isFootSoldier(unit.def?.type) && unit.def?.type !== 'engineer') return false;
  if (isUnitMounted(unit) || isUnitGarrisoned(unit)) return false;
  if (unit._trenchId || unit._diggingTrench) return true;
  if (isUnitVisuallyProne(unit)) return true;
  // Stationary MG / sniper crews hug the dirt while firing even without full prone pose.
  if (
    (unit.def?.type === 'machineGun' || unit.def?.type === 'sniper') &&
    !unit.moveTarget &&
    (unit.target || unit.attackOrder) &&
    (unit.attackCooldown ?? 0) < 0.85
  ) {
    return true;
  }
  return false;
}

function trackCrushRadius(type) {
  if (type === 'superHeavyTank') return 2.9;
  if (type === 'tankDestroyer') return 2.35;
  return 2.2;
}

/**
 * Tracked vehicles kill prone / trench infantry they drive over and collapse
 * any finished trenches under the hull.
 */
function applyTrackCrush(vehicle, units, options, vehicleRadius) {
  if (!TRACK_CRUSH_VEHICLE_TYPES.has(vehicle.def?.type)) return;
  const radius = Math.max(vehicleRadius, trackCrushRadius(vehicle.def.type));
  const vx = vehicle.position.x;
  const vz = vehicle.position.z;
  const impactFrom = { x: vx, z: vz };

  for (const target of units) {
    if (target === vehicle || target.dead) continue;
    if (target.team === vehicle.team) continue;
    if (!isCrushableFootTarget(target)) continue;
    const dist = Math.hypot(target.position.x - vx, target.position.z - vz);
    if (dist > radius) continue;
    // Super-heavies always finish the job; medium tanks still deal lethal crush.
    const damage = target.hp + 40 + (vehicle.def.type === 'superHeavyTank' ? 40 : 0);
    // Align tread grooves on the corpse with the tank's path.
    const dirX = options._crushDirX ?? 0;
    const dirZ = options._crushDirZ ?? 0;
    if (Math.hypot(dirX, dirZ) > 0.01) {
      target._crushTrackYaw = Math.atan2(dirX, dirZ);
    } else if (vehicle.mesh?.rotation?.y != null) {
      target._crushTrackYaw = vehicle.mesh.rotation.y;
    }
    target.takeDamage(damage, {
      cause: 'crush',
      crushed: true,
      impactFrom,
    });
  }

  options.infantryTrenches?.crushAt?.(vx, vz, radius * 0.92, {
    impactFrom,
    directionX: options._crushDirX ?? 0,
    directionZ: options._crushDirZ ?? 0,
    crusherTeam: vehicle.team,
  });
}

function getDirectFireBlocker(attacker, target, scenery, options = {}) {
  if (!scenery?.getLineOfFireBlocker || !attacker || !target) return null;
  // Mortars lob over roofs — no building LOS for auto-acquire or fire.
  if (MORTAR_INDIRECT_TYPES.has(attacker.def?.type)) return null;
  // Howitzers lob over buildings beyond min-range. Only large obstacles inside
  // the dead-zone ring can block auto-acquire or force a façade intercept.
  if (attacker.def?.type === 'artillery') {
    // Inside the howitzer dead zone the crew uses personal weapons, whose
    // direct line of fire obeys the normal infantry obstruction test.
    if (target?.def && isInsideMinimumRange(attacker, target)) {
      const crewProbe = {
        position: attacker.position,
        def: { type: 'machineGun' },
        _garrisonBunkerId: attacker._garrisonBunkerId,
      };
      return scenery.getLineOfFireBlocker(crewProbe, target, options);
    }
    if (
      target.isGround ||
      isSmokeShellTarget(target) ||
      isSceneryTarget(target)
    ) {
      return null;
    }
    return getArtilleryTrajectoryBlocker(attacker, target, scenery);
  }
  return scenery.getLineOfFireBlocker(attacker, target, options);
}

/**
 * First large obstacle an artillery shell cannot clear: only buildings within
 * the gun's minimum-range radius. Farther masonry is lobbed over (high angle).
 * Point-blank façades inside that ring still absorb the round immediately.
 */
function getArtilleryTrajectoryBlocker(attacker, target, scenery) {
  if (attacker?.def?.type !== 'artillery' || !scenery) return null;
  if (!attacker || !target) return null;
  if (isSmokeShellTarget(target)) return null;

  const minRange = Math.max(0, attacker.def?.minRange ?? 0);
  const ax = attacker.position.x;
  const az = attacker.position.z;

  if (typeof scenery.findArtilleryShellBuildingHit !== 'function') {
    // Fallback: only treat very near buildings as blockers.
    if (!scenery.getLineOfFireBlocker || minRange <= 0) return null;
    const probe = {
      position: attacker.position,
      def: { type: 'machineGun' },
      _garrisonBunkerId: attacker._garrisonBunkerId,
    };
    const blocker = scenery.getLineOfFireBlocker(probe, target, { fullScan: true });
    if (!blocker) return null;
    const d = Math.hypot(blocker.x - ax, blocker.z - az);
    return d < minRange ? blocker : null;
  }

  let bx;
  let bz;

  if (isSceneryTarget(target) && target.entry) {
    // Ordered building fire: only earlier walls inside min-range intercept.
    // The ordered building itself is hit immediately if inside min-range;
    // beyond that, delayed high-arc flight lands on the façade.
    const aim =
      scenery.getBuildingSurfaceAimPoint?.(target.entry, ax, az) ?? {
        x: target.entry.x,
        z: target.entry.z,
      };
    bx = aim.x;
    bz = aim.z;
    const earlier = scenery.findArtilleryShellBuildingHit(ax, az, bx, bz, {
      fullScan: true,
      skipEntry: target.entry,
      maxDistanceFromMuzzle: minRange,
    });
    if (earlier) return earlier;
    if (!target.entry.destroyed) {
      const distToTarget = Math.hypot(bx - ax, bz - az);
      if (distToTarget < minRange) return target.entry;
    }
    return null;
  }

  bx = target.position?.x ?? target.mesh?.position?.x;
  bz = target.position?.z ?? target.mesh?.position?.z;
  if (!Number.isFinite(bx) || !Number.isFinite(bz)) return null;

  return scenery.findArtilleryShellBuildingHit(ax, az, bx, bz, {
    fullScan: true,
    maxDistanceFromMuzzle: minRange,
  });
}

function shouldAdvanceBlockedPursuit(attacker, target) {
  // Hard / chasing orders must path around masonry when the aim-line is blocked.
  // _chasingAttack alone is not enough: it is cleared while the unit stands and
  // fires, but the player order (_hardAttackOrder) must still repath if the
  // target slips behind a building.
  return (
    attacker?.attackOrder === target &&
    target?.def !== undefined &&
    (!!attacker._chasingAttack || !!attacker._hardAttackOrder)
  );
}

function shouldRetainBlockedOrder(attacker, target) {
  // Keep the ordered target selected while LOS is blocked: stance-bound Hold
  // waits for a clear shot; hard player/AI click-attacks keep the order and
  // repath. Without this, attacks were wiped the moment a building sat between
  // gun and target (common for landed paratroopers on Berlin).
  return (
    attacker?.attackOrder === target &&
    target?.def !== undefined &&
    (attacker._stanceBoundAttackOrder ||
      attacker._stancePursuitOrder ||
      attacker._chasingAttack ||
      attacker._hardAttackOrder)
  );
}

export function canThrowHandGrenadeAt(attacker, target) {
  if (!attacker || !target || attacker.dead || target.dead) return false;
  if (!HAND_GRENADE_THROWER_TYPES.has(attacker.def?.type)) return false;
  if (!HAND_GRENADE_TARGET_TYPES.has(target.def?.type)) return false;
  if (attacker.team === target.team || attacker.surrendered || attacker._captureExit) return false;
  if ((attacker.grenadeCooldown ?? 0) > 0 || isUnitMounted(attacker)) return false;
  return distanceBetween(attacker, target) <= HAND_GRENADE_RANGE;
}

function findHandGrenadeTarget(attacker, candidates, scenery = null) {
  let nearest = null;
  let nearestDistance = Infinity;
  for (const target of candidates) {
    if (!canThrowHandGrenadeAt(attacker, target)) continue;
    if (scenery?.isLineOfFireBlocked?.(attacker, target)) continue;
    const distance = distanceBetween(attacker, target);
    if (distance < nearestDistance) {
      nearest = target;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function tryThrowHandGrenade(attacker, candidates, scene, mapDef, onFire, scenery = null) {
  const target = findHandGrenadeTarget(attacker, candidates, scenery);
  if (!target) return false;

  const map = attacker._mapDef || mapDef;
  const from = new THREE.Vector3(attacker.position.x, attacker.position.y + 0.9, attacker.position.z);
  if (map) from.y = sampleTerrainHeight(from.x, from.z, map) + 0.9;
  const to = new THREE.Vector3(target.position.x, target.position.y + 0.85, target.position.z);
  if (map) to.y = sampleTerrainHeight(to.x, to.z, map) + 0.85;

  attacker.grenadeCooldown = HAND_GRENADE_COOLDOWN_SEC + Math.random() * 1.5;
  const armorFactor = target.def.type === 'superHeavyTank' ? 0.65 : 1;
  const damage = HAND_GRENADE_DAMAGE * armorFactor * getRankDamageMultiplier(attacker);
  target.takeDamage(damage, { explosive: true, impactFrom: attacker.position });
  if (target.dead) recordEnemyKill(attacker, target);

  const event = {
    attacker,
    target,
    def: { ...attacker.def, type: 'handGrenade' },
    dist: distanceBetween(attacker, target),
    killed: target.dead,
    targetIsHQ: false,
    targetIsScenery: false,
    groundImpact: false,
    handGrenade: true,
    from: { x: from.x, y: from.y, z: from.z },
    to: { x: to.x, y: to.y, z: to.z },
  };

  spawnHandGrenade(scene, from, to, () => onFire?.(event));
  return true;
}

function isParatrooperAtShot(attacker, target, fireOpts = {}) {
  if (attacker.def.type !== 'paratrooper') return false;
  if (fireOpts.paratrooperAt === true) return true;
  if (fireOpts.paratrooperAt === false) return false;
  if (target.isGround || isSmokeShellTarget(target)) return false;
  if (!target.def) return false;
  return ARMOR_TARGET_TYPES.has(target.def.type);
}

/** Skip VFX for distant AI units to keep frame time stable. */
function shouldSpawnVfx(attacker, listenerX, listenerZ) {
  const dx = attacker.position.x - listenerX;
  const dz = attacker.position.z - listenerZ;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (SMALL_ARMS_TYPES.has(attacker.def.type)) return dist < 200;
  return dist < 140;
}

export function tickUnitCooldowns(units, dt) {
  for (const unit of units) {
    if (unit.dead) continue;
    if (unit.attackCooldown > 0) unit.attackCooldown -= dt;
    if (unit.mgCooldown > 0) unit.mgCooldown -= dt;
    if (unit.grenadeCooldown > 0) unit.grenadeCooldown = Math.max(0, unit.grenadeCooldown - dt);
    if (unit.smokeShellCooldown > 0) {
      unit.smokeShellCooldown = Math.max(0, unit.smokeShellCooldown - dt);
    }
  }
}

export function updateCombat(
  units,
  hqs,
  dt,
  scene,
  mapDef,
  onFire,
  listener = null,
  coverSystem = null,
  enemyDamageMult = 0.88,
  scenery = null,
  options = {}
) {
  // Advance bombs already in the air before new shots this tick.
  updatePendingMortarImpacts(dt);

  // Retreat / panic paths need mapDef for Clear Defenses staging rally
  options = { ...options, mapDef };
  const protectPlayerHq = options.protectPlayerHq === true;
  const enemyCeasefire = options.enemyCeasefire === true;
  const openingCeasefire = options.openingCeasefire === true;
  /** Training Ground: do not auto-acquire the practice HQ (attack only on player order). */
  const tutorialPassiveNoHq = options.tutorialPassiveNoHq === true;

  const aliveUnits = units;
  if (aliveUnits.length === 0) return;
  const hqsInPlay = hqs.filter((h) => {
    if (h.dead) return false;
    if (protectPlayerHq && h.team === 'player') return false;
    return true;
  });
  const sceneryTargets = scenery?.getAttackTargets?.() ?? [];
  const defenseTargets = options.defenseTargets ?? [];
  const baseBuildingTargets = options.baseBuildingTargets ?? [];
  const targets = [...aliveUnits, ...hqsInPlay, ...sceneryTargets, ...defenseTargets, ...baseBuildingTargets];
  const playerAlive = [];
  const enemyAlive = [];
  const playerHqs = [];
  const enemyHqs = [];
  for (const u of aliveUnits) {
    if (u.team === 'player') playerAlive.push(u);
    else if (u.team === 'enemy') enemyAlive.push(u);
  }
  for (const h of hqsInPlay) {
    if (h.team === 'player') playerHqs.push(h);
    else if (h.team === 'enemy') enemyHqs.push(h);
  }
  /** Auto-acquire lists — enemies only scan opposing forces (not every unit on the map). */
  const playerAutoAcquire = [...enemyAlive];
  if (!tutorialPassiveNoHq) playerAutoAcquire.push(...enemyHqs);
  const enemyAutoAcquire = [...playerAlive, ...playerHqs, ...defenseTargets, ...baseBuildingTargets];
  const lx = listener?.x ?? 0;
  const lz = listener?.z ?? 0;

  for (const attacker of aliveUnits) {
    if (
      attacker._dropping ||
      attacker.retreating ||
      attacker.surrendered ||
      attacker._captureExit ||
      attacker._crewless
    ) continue;
    if (
      attacker.def.type === 'medic' ||
      attacker.def.nonCombat ||
      attacker.def.damage <= 0
    )
      continue;
    if (
      CREW_SERVED_GUN_TYPES.has(attacker.def.type) &&
      scenery?.getUnitPlacementBlocker?.(
        attacker.position.x,
        attacker.position.z,
        1.65
      )
    ) {
      // A gun carriage embedded in masonry cannot acquire or discharge. New
      // spawns are relocated, while this also makes old saves fail safely.
      attacker.target = null;
      if (attacker.attackOrder) attacker.clearAttackOrder();
      continue;
    }
    if (openingCeasefire && !attacker.attackOrder) continue;
    if (enemyCeasefire && attacker.team === 'enemy') continue;

    const acquire =
      attacker.team === 'player' ? playerAutoAcquire : enemyAutoAcquire;
    const localAcquire = filterAcquireNearAttacker(attacker, acquire);
    tryThrowHandGrenade(attacker, localAcquire, scene, mapDef, onFire, scenery);
    const hadAttackOrder = !!attacker.attackOrder;
    const target = resolveAttackTarget(attacker, targets, localAcquire, scenery);
    if (!target) {
      attacker.target = null;
      continue;
    }

    // Validate again immediately before aiming. This prevents a moving target
    // slipping behind a building after an AI order was assigned.
    // Artillery is special: masonry on the aim-line still allows discharge so
    // the shell can detonate on the building (until it falls) rather than
    // silently refusing to fire.
    const losBlocker = getDirectFireBlocker(attacker, target, scenery);
    if (losBlocker && attacker.def?.type !== 'artillery') {
      attacker.target = null;
      if (attacker.attackOrder === target) {
        if (!shouldRetainBlockedOrder(attacker, target)) {
          attacker.clearAttackOrder();
          if (!attacker._userMoveOrder) attacker.moveTarget = null;
        }
      }
      continue;
    }

    attacker.target = target;
    if (
      !hadAttackOrder &&
      !attacker.attackOrder &&
      attacker.engagementStance === 'pursue' &&
      target.retreating &&
      !target.surrendered &&
      !target._captureExit
    ) {
      // Pursuit begins only after the fleeing target has entered weapon range.
      // From then on normal attack movement can follow it if it escapes range.
      attacker.attackOrder = target;
      attacker._chasingAttack = true;
      attacker._stancePursuitOrder = true;
      attacker._userMoveOrder = false;
      attacker._movePath = null;
    }

    const structureTarget =
      isHqTarget(target) ||
      isSceneryTarget(target) ||
      isDefenseTarget(target) ||
      isBaseBuildingTarget(target);
    const inMainGunRange = target.isGround || isSmokeShellTarget(target)
      ? isPointInRange(attacker, target.position)
      : structureTarget
        ? isInRange(attacker, target, 1.05)
        : isInRange(attacker, target);
    // AT guns, howitzers, and mortars only aim/fire when not repositioning.
    const mainGunStationary =
      !STATIONARY_MAIN_GUN_TYPES.has(attacker.def.type) || !attacker.moveTarget;
    const mainGunCanAim = inMainGunRange && mainGunStationary;
    const crewSmallArms = attacker.def?.crewSmallArms;
    const crewSmallArmsInRange =
      mainGunStationary &&
      !inMainGunRange &&
      isInArtilleryCrewSmallArmsRange(attacker, target);
    const coaxInRange =
      !target.isGround && isTankType(attacker.def.type) && isInCoaxRange(attacker, target);
    const independentMg = coaxInRange && hasIndependentMgPivot(attacker.mesh);
    const independentMgSoftTarget =
      independentMg && isCoaxSoftTarget(target) && !!attacker.def.coaxMG;

    if ((mainGunCanAim && !independentMgSoftTarget) || (coaxInRange && !independentMg)) {
      faceUnitTowardTarget(attacker, target, dt);
      aimDeployedMachineGun(attacker, target);
      aimDeployedMortar(attacker, target);
    }
    if (independentMg) {
      faceIndependentMgTowardTarget(attacker, target, dt);
    }

    // Reaching weapon range stops an attack advance even while the turret is
    // still traversing; otherwise a slow turret can make the hull overshoot.
    if (
      !attacker._userMoveOrder &&
      (mainGunCanAim || coaxInRange || crewSmallArmsInRange)
    ) {
      if (attacker.moveTarget && attacker.attackOrder && !target.isGround) {
        const standoff = getStandoffPosition(attacker, target);
        const reach = getMoveReachConfig(attacker.def.type);
        if (hasReachedMoveDest(attacker, standoff, mapDef, reach.horiz * 0.85, reach.height * 0.85)) {
          attacker.moveTarget = null;
        }
      } else if ((target.isGround || isSmokeShellTarget(target)) && attacker.moveTarget) {
        attacker.moveTarget = null;
      }
    }

    const weaponOnBearing = canWeaponBearOnTarget(attacker, target);
    const canFireMain = mainGunCanAim && weaponOnBearing;
    if (
      canFireMain &&
      (attacker.def.type === 'infantry' ||
        attacker.def.type === 'engineer' ||
        attacker.def.type === 'vehicleCrew' ||
        attacker.def.type === 'paratrooper' ||
        attacker.def.type === 'sniper')
    ) {
      markInfantryFireAim(attacker, 0.28);
    }
    const mgOnBearing = independentMg
      ? canIndependentMgBearOnTarget(attacker, target)
      : weaponOnBearing;
    const canFireCoax = coaxInRange && mgOnBearing;
    const canFireCrewSmallArms = crewSmallArmsInRange;
    const coaxHandlesSoft =
      coaxInRange && isCoaxSoftTarget(target) && attacker.def.coaxMG;

    if (!canFireMain && !canFireCoax && !canFireCrewSmallArms) continue;

    if (canFireCrewSmallArms && crewSmallArms && attacker.mgCooldown <= 0) {
      const firedCrewWeapon = fire(
        attacker,
        target,
        targets,
        aliveUnits,
        scene,
        mapDef,
        onFire,
        lx,
        lz,
        coverSystem,
        enemyDamageMult,
        scenery,
        hqs,
        options,
        { crewSmallArms: true }
      );
      if (firedCrewWeapon !== false) {
        attacker.mgCooldown = 1 / crewSmallArms.attackSpeed;
      }
    }

    if (canFireCoax && attacker.def.coaxMG && attacker.mgCooldown <= 0) {
      const firedCoax = fire(
        attacker,
        target,
        targets,
        aliveUnits,
        scene,
        mapDef,
        onFire,
        lx,
        lz,
        coverSystem,
        enemyDamageMult,
        scenery,
        hqs,
        options,
        { coax: true }
      );
      if (firedCoax !== false) attacker.mgCooldown = 1 / attacker.def.coaxMG.attackSpeed;
    }

    const fireMainGun =
      canFireMain &&
      attacker.attackCooldown <= 0 &&
      !coaxHandlesSoft;

    if (!fireMainGun) continue;

    const firedMain = fire(
      attacker,
      target,
      targets,
      aliveUnits,
      scene,
      mapDef,
      onFire,
      lx,
      lz,
      coverSystem,
      enemyDamageMult,
      scenery,
      hqs,
      options
    );
    if (firedMain === false) continue;
    const paratrooperAt =
      attacker.def.type === 'paratrooper' && isParatrooperAtShot(attacker, target);
    attacker.attackCooldown = paratrooperAt
      ? 1 / (attacker.def.atAttackSpeed ?? attacker.def.attackSpeed)
      : attacker.def.shellReload ?? 1 / attacker.def.attackSpeed;
  }
}

function isPracticeHq(target) {
  return target && !target.def && !target.isGround && target.team === 'enemy';
}

function scalePracticeHqDamage(target, damage, options) {
  const mult = options.practiceHqDamageMult ?? 1;
  if (mult >= 1 || !isPracticeHq(target)) return damage;
  return damage * mult;
}

/** Player howitzers need Auto-fire On; enemy batteries always search. */
function mayArtilleryAutoAcquire(attacker) {
  if (attacker?.def?.type !== 'artillery') return true;
  if (attacker.team !== 'player') return true;
  return !!attacker.autoFire;
}

function resolveAttackTarget(attacker, targets, acquireTargets, scenery) {
  if (attacker.attackOrder) {
    if (
      attacker._stancePursuitOrder &&
      (attacker.engagementStance !== 'pursue' || !attacker.attackOrder.retreating)
    ) {
      attacker.clearAttackOrder();
      if (!attacker._userMoveOrder) {
        attacker.moveTarget = null;
        attacker._movePath = null;
      }
    }
  }
  if (attacker.attackOrder) {
    if (attacker.attackOrder.isGround || isSmokeShellTarget(attacker.attackOrder)) {
      return attacker.attackOrder;
    }
    if (!attacker.attackOrder.dead) {
      if (attacker.attackOrder._dropping) {
        attacker.clearAttackOrder();
        return null;
      }
      if (
        attacker.def.type === 'sniper' &&
        attacker.attackOrder.def &&
        isTankType(attacker.attackOrder.def.type)
      ) {
        attacker.clearAttackOrder();
        return null;
      }
      if (
        !isSceneryTarget(attacker.attackOrder) &&
        !isDefenseTarget(attacker.attackOrder) &&
        !isBaseBuildingTarget(attacker.attackOrder) &&
        !isHqTarget(attacker.attackOrder) &&
        (attacker.attackOrder.team === attacker.team ||
          attacker.attackOrder.surrendered ||
          attacker.attackOrder._captureExit)
      ) {
        attacker.clearAttackOrder();
        return null;
      }
      if (getDirectFireBlocker(attacker, attacker.attackOrder, scenery)) {
        // Howitzers keep the order and fire into the wall until it collapses;
        // only then can shells reach the ordered unit beyond.
        if (attacker.def?.type === 'artillery') {
          return attacker.attackOrder;
        }
        if (shouldRetainBlockedOrder(attacker, attacker.attackOrder)) {
          // Keep a direct player order selected while masonry obscures it.
          // Pursue routes around the obstruction; Hold waits for a clear shot.
          return null;
        }
        // A direct-fire order does not remain locked through solid masonry.
        // Clearing it for both teams also removes misleading target lines and
        // lets normal acquisition select an actually exposed unit next tick.
        attacker.clearAttackOrder();
        if (!attacker._userMoveOrder) attacker.moveTarget = null;
        return null;
      }
      return attacker.attackOrder;
    }
    attacker.clearAttackOrder();
  }

  // Player artillery with Auto-fire Off still lets its exposed crew defend
  // themselves inside the howitzer's dead zone.
  if (!mayArtilleryAutoAcquire(attacker)) {
    const closeCrewThreats = acquireTargets.filter(
      (target) =>
        isInsideMinimumRange(attacker, target) &&
        isInArtilleryCrewSmallArmsRange(attacker, target) &&
        !getDirectFireBlocker(attacker, target, scenery)
    );
    return findNearestEnemyInRange(attacker, closeCrewThreats);
  }

  const validAcquireTargets =
    attacker.def.type === 'sniper'
      ? acquireTargets.filter((target) => !target.def || !isTankType(target.def.type))
      : acquireTargets;
  const directArmorRangeSlack =
    isTankType(attacker.def.type) || attacker.def.type === 'antiTankGun'
      ? WEAPON_RANGE_SLACK
      : 1;
  const maxAcquireRange = Math.max(
    attacker.def.range,
    isTankType(attacker.def.type) ? attacker.def.coaxMG?.range ?? 0 : 0
  ) * directArmorRangeSlack;
  const visibleAcquireTargets = validAcquireTargets.filter(
    (target) =>
      distanceBetween(attacker, target) <= maxAcquireRange &&
      !getDirectFireBlocker(attacker, target, scenery)
  );
  return findNearestEnemyInRange(attacker, visibleAcquireTargets, directArmorRangeSlack);
}

const _muzzleFrom = new THREE.Vector3();

function resolveMuzzleFrom(attacker, map, vfxType, coax) {
  if (usesInfantryMuzzleOrigin(attacker)) {
    getInfantryMuzzleWorldPosition(attacker, vfxType, _muzzleFrom);
    return { from: _muzzleFrom, exactOrigin: true };
  }
  if (usesIndependentVehicleMgMuzzleOrigin(attacker, coax)) {
    getIndependentVehicleMgMuzzleWorldPosition(attacker, _muzzleFrom);
    return { from: _muzzleFrom, exactOrigin: true };
  }
  // Main gun flash from the cannon tip (follows turret/barrel aim)
  if (usesVehicleCannonMuzzleOrigin(attacker, coax)) {
    getVehicleCannonMuzzleWorldPosition(attacker, _muzzleFrom);
    return { from: _muzzleFrom, exactOrigin: true };
  }
  _muzzleFrom.copy(attacker.position);
  if (map) _muzzleFrom.y = sampleTerrainHeight(_muzzleFrom.x, _muzzleFrom.z, map) + (coax ? 0.95 : 1);
  return { from: _muzzleFrom, exactOrigin: false };
}

function fire(
  attacker,
  target,
  allTargets,
  livingUnits,
  scene,
  mapDef,
  onFire,
  listenerX,
  listenerZ,
  coverSystem,
  enemyDamageMult,
  scenery,
  hqs,
  options = {},
  fireOpts = {}
) {
  const crewSmallArms =
    fireOpts.crewSmallArms === true ? attacker.def.crewSmallArms : null;
  // Crew rifles share the auxiliary-small-arms hit path: no shell splash,
  // shell casing, or howitzer report.
  const coax = !!crewSmallArms || (fireOpts.coax === true && attacker.def.coaxMG);
  const mg = crewSmallArms ?? attacker.def.coaxMG;
  const eventDef = crewSmallArms
    ? { ...attacker.def, mgWeaponSound: crewSmallArms.weaponSound }
    : attacker.def;
  const isParatrooper = attacker.def.type === 'paratrooper';
  const paratrooperAt = isParatrooper && isParatrooperAtShot(attacker, target, fireOpts);
  let paratrooperUseMg = false;
  if (isParatrooper && !paratrooperAt) {
    attacker._mgVolley = (attacker._mgVolley ?? 0) + 1;
    paratrooperUseMg = attacker.def.usesMG && attacker._mgVolley % 2 !== 0;
  }

  const weaponRange = coax ? mg.range : attacker.def.range;
  let weaponDamage = coax ? mg.damage : attacker.def.damage;
  let attackerType = coax ? 'machineGun' : attacker.def.type;
  let vfxType = coax ? 'machineGun' : attacker.def.type;

  if (isParatrooper && !coax) {
    if (paratrooperAt) {
      weaponDamage = attacker.def.damage;
      attackerType = 'paratrooper';
      vfxType = 'paratrooperAt';
    } else {
      weaponDamage = paratrooperUseMg ? attacker.def.mgDamage : attacker.def.smallArmsDamage;
      attackerType = paratrooperUseMg ? 'machineGun' : 'infantry';
      vfxType = attackerType;
    }
  } else if (!coax && attacker.def.type === 'antiTankGun') {
    vfxType = 'tank';
  } else if (
    !coax &&
    (attacker.def.type === 'engineer' || attacker.def.type === 'vehicleCrew')
  ) {
    // Combat engineers and bailed crews use the standard small-arms VFX.
    vfxType = 'infantry';
  }

  const map = attacker._mapDef || mapDef;
  const isGroundShot = target.isGround || isSmokeShellTarget(target);
  const impact = isGroundShot
    ? { x: target.position.x, z: target.position.z }
    : {
        x: target.position?.x ?? target.mesh.position.x,
        z: target.position?.z ?? target.mesh.position.z,
      };

  // Last-moment interception guard: use the authoritative scenery list rather
  // than the Berlin spatial broad phase. Acquisition remains indexed for frame
  // rate, but no direct shell may apply damage or emit VFX if a stale/missed
  // bucket would let it cross intact masonry in a long-running or restored map.
  // Artillery skips this abort — its trajectory intercept detonates on the
  // first building instead of refusing the shot.
  const authoritativeShellLos =
    !coax && AUTHORITATIVE_SHELL_LOS_TYPES.has(attacker.def?.type);
  if (attacker.def?.type !== 'artillery') {
    const dischargeBlocker = getDirectFireBlocker(
      attacker,
      target,
      scenery,
      authoritativeShellLos ? { fullScan: true } : undefined
    );
    if (dischargeBlocker) {
      attacker.target = null;
      if (attacker.attackOrder === target) {
        if (!shouldRetainBlockedOrder(attacker, target)) {
          attacker.clearAttackOrder();
          if (!attacker._userMoveOrder) attacker.moveTarget = null;
        }
      }
      return false;
    }
  }

  const dist = isGroundShot
    ? distanceToPoint(attacker, impact)
    : distanceBetween(attacker, target);

  if (
    !isGroundShot &&
    !isSceneryTarget(target) &&
    !isDefenseTarget(target) &&
    !isBaseBuildingTarget(target) &&
    !isHqTarget(target) &&
    options.smokeScreens?.isLosObscured?.(attacker.position.x, attacker.position.z, impact.x, impact.z)
  ) {
    if (Math.random() < SMOKE_MISS_CHANCE) {
      const missOffset = 4 + Math.random() * 7;
      const missAngle = Math.random() * Math.PI * 2;
      const missImpact = {
        x: impact.x + Math.cos(missAngle) * missOffset,
        z: impact.z + Math.sin(missAngle) * missOffset,
      };
      const showVfx =
        attacker.team === 'player' || shouldSpawnVfx(attacker, listenerX, listenerZ);
      if (showVfx && scene) {
        const { from, exactOrigin } = resolveMuzzleFrom(attacker, map, vfxType, coax);
        const toY = map ? sampleTerrainHeight(missImpact.x, missImpact.z, map) + 0.6 : 0.6;
        const to = { x: missImpact.x, y: toY, z: missImpact.z };
        spawnMuzzleFlash(scene, from, to, vfxType, { exactOrigin });
        if (paratrooperAt) triggerParatrooperAtRecoil(attacker.mesh);
      }
      if (onFire) {
        onFire({
          attacker,
          target,
          def: eventDef,
          dist,
          coaxFire: coax,
          paratrooperAtFire: paratrooperAt,
          killed: false,
          targetIsHQ: false,
          targetIsScenery: false,
          groundImpact: false,
          smokeMiss: true,
          from: attacker.position,
          to: missImpact,
        });
      }
      return;
    }
  }

  const falloff =
    attacker.def.type === 'antiTankGun' || paratrooperAt
      ? Math.max(0.4, 1 - (dist / weaponRange) * 0.62)
      : Math.max(0.55, 1 - (dist / weaponRange) * 0.35);
  const paceMult = options.paceDamageMult ?? 1;
  const shotScatter = 0.88 + Math.random() * 0.24;
  let damage = weaponDamage * falloff * shotScatter * paceMult;
  if (!coax && attacker.def.type === 'sniper' && !target.isGround) {
    const rangeRatio = dist / Math.max(attacker.def.range, 1);
    if (rangeRatio > 0.45) damage *= 1.12 + (rangeRatio - 0.45) * 0.35;
  }
  if (attacker.team === 'enemy') damage *= enemyDamageMult;
  damage *= getRankDamageMultiplier(attacker);

  // Artillery: only large obstacles inside min-range absorb the shell
  // immediately (cannot clear the arc). Buildings farther out are lobbed over.
  const artilleryBlocker = !coax
    ? getArtilleryTrajectoryBlocker(attacker, target, scenery)
    : null;
  if (artilleryBlocker && scenery) {
    const aim =
      scenery.getBuildingSurfaceAimPoint?.(
        artilleryBlocker,
        attacker.position.x,
        attacker.position.z
      ) ?? { x: artilleryBlocker.x, z: artilleryBlocker.z };
    impact.x = aim.x;
    impact.z = aim.z;
    const interceptDist = distanceToPoint(attacker, impact);
    let structureDamage = weaponDamage * falloff * shotScatter * paceMult;
    if (attacker.team === 'enemy') structureDamage *= enemyDamageMult;
    structureDamage *= getRankDamageMultiplier(attacker);
    structureDamage *= getStructureDamageMultiplier('artillery');
    scenery.damageObject(artilleryBlocker, structureDamage, {
      weaponType: 'artillery',
      impact: { x: impact.x, z: impact.z },
      impactFrom: { x: attacker.position.x, z: attacker.position.z },
      explosive: true,
    });
    // Nearby masonry only — no unit splash past the intercept.
    scenery.damageAt(impact.x, impact.z, 6, structureDamage * 0.4, {
      weaponType: 'artillery',
      impact: { x: impact.x, z: impact.z },
      impactFrom: { x: attacker.position.x, z: attacker.position.z },
      explosive: true,
    });

    const showVfx =
      attacker.team === 'player' || shouldSpawnVfx(attacker, listenerX, listenerZ);
    if (showVfx && scene) {
      const { from, exactOrigin } = resolveMuzzleFrom(attacker, map, vfxType, coax);
      const toY = map ? sampleTerrainHeight(impact.x, impact.z, map) + 1 : 1;
      const to = { x: impact.x, y: toY, z: impact.z };
      spawnMuzzleFlash(scene, from, to, vfxType, { exactOrigin });
    }
    if (onFire) {
      onFire({
        attacker,
        target: wrapSceneryTarget(artilleryBlocker, scenery) ?? target,
        def: attacker.def,
        dist: interceptDist,
        coaxFire: false,
        paratrooperAtFire: false,
        killed: !!artilleryBlocker.destroyed,
        targetIsHQ: false,
        targetIsScenery: true,
        groundImpact: false,
        // Immediate masonry detonation (including point-blank façade).
        buildingIntercept: true,
        from: attacker.position,
        to: impact,
      });
    }
    return;
  }

  if (attacker.def.antiArmor && !target.isGround && target.def) {
    const useAntiArmorScaling = !isParatrooper || paratrooperAt;
    if (useAntiArmorScaling) {
      const vsArmor = ARMOR_TARGET_TYPES.has(target.def.type);
      damage *= vsArmor ? attacker.def.antiArmorMult ?? 1.3 : attacker.def.softMult ?? 0.35;
    }
  }

  if (!target.isGround && !isSceneryTarget(target)) {
    damage *= getIncomingDamageMultiplier(
      target,
      coverSystem,
      coax ? attackerType : attacker
    );
    damage *= getArmorDamageMultiplier(attackerType, target);
  }
  if (isSceneryTarget(target)) {
    damage *= getStructureDamageMultiplier(attackerType);
  }
  if (isDefenseTarget(target)) {
    damage *= getDefenseDamageMultForAttacker(attackerType);
  }
  if (isBaseBuildingTarget(target)) {
    damage *= getStructureDamageMultiplier(attackerType);
  }
  if (isHqTarget(target)) {
    damage *= getStructureDamageMultiplier(attackerType);
  }

  const armorHit =
    !isGroundShot && !isSceneryTarget(target) && !isDefenseTarget(target) && !isBaseBuildingTarget(target)
      ? resolveArmorHit(attacker, target, {
          distance: dist,
          weaponRange,
          coax,
          paratrooperAt,
        })
      : null;
  if (armorHit) {
    damage *= armorHit.damageMultiplier;
    if (armorHit.mobilityDamaged) {
      applyMobilityDamage(target, armorHit.mobilityDamageKind);
    }
  }

  if (isSmokeShellTarget(target)) {
    attacker.smokeShellCooldown = SMOKE_SHELL_COOLDOWN_SEC;
    options.smokeScreens?.deploy?.(impact.x, impact.z, attacker.team);
    attacker.clearAttackOrder();
    const showSmokeVfx =
      attacker.team === 'player' || shouldSpawnVfx(attacker, listenerX, listenerZ);
    if (showSmokeVfx && scene) {
      const { from, exactOrigin } = resolveMuzzleFrom(attacker, map, 'artillery', false);
      const toY = map ? sampleTerrainHeight(impact.x, impact.z, map) + 1 : 1;
      const to = { x: impact.x, y: toY, z: impact.z };
      spawnMuzzleFlash(scene, from, to, 'artillery', { exactOrigin });
      spawnSmokeShellImpact(scene, { x: impact.x, y: toY - 0.88, z: impact.z }, 1.15);
    }
    if (onFire) {
      onFire({
        attacker,
        target,
        def: attacker.def,
        dist,
        coaxFire: false,
        killed: false,
        targetIsHQ: false,
        targetIsScenery: false,
        groundImpact: true,
        smokeDeployed: true,
        from: attacker.position,
        to: impact,
      });
    }
    return;
  }

  // Mortar / artillery: high-arc shells lock the aim point at fire time.
  // Moving targets only take damage if still inside splash when the round lands.
  if (!coax && (attacker.def.type === 'mortar' || attacker.def.type === 'artillery')) {
    const kind = attacker.def.type;
    let lockX = impact.x;
    let lockZ = impact.z;
    // Ordered fire on a building aims at the facing façade so the delayed shell
    // lands on/near the structure rather than its footprint centre.
    let sceneryEntry = null;
    if (isSceneryTarget(target) && target.entry && scenery) {
      sceneryEntry = target.entry;
      const aim =
        scenery.getBuildingSurfaceAimPoint?.(
          sceneryEntry,
          attacker.position.x,
          attacker.position.z
        ) ?? null;
      if (aim && Number.isFinite(aim.x) && Number.isFinite(aim.z)) {
        lockX = aim.x;
        lockZ = aim.z;
      }
    }
    if (!Number.isFinite(lockX) || !Number.isFinite(lockZ)) return false;
    const flight =
      kind === 'artillery' ? artilleryFlightTimeSec(dist) : mortarFlightTimeSec(dist);
    const muzzle = resolveMuzzleFrom(attacker, map, vfxType, coax);
    const showVfx =
      attacker.team === 'player' || shouldSpawnVfx(attacker, listenerX, listenerZ);
    if (showVfx && scene) {
      const toY = map ? sampleTerrainHeight(lockX, lockZ, map) + 1 : 1;
      spawnMuzzleFlash(
        scene,
        muzzle.from,
        { x: lockX, y: toY, z: lockZ },
        vfxType,
        { exactOrigin: muzzle.exactOrigin }
      );
    }
    if (onFire) {
      onFire({
        attacker,
        target,
        def: attacker.def,
        dist,
        coaxFire: false,
        paratrooperAtFire: false,
        killed: false,
        targetIsHQ: false,
        targetIsScenery: !!sceneryEntry,
        groundImpact: false,
        mortarLoft: kind === 'mortar',
        artilleryLoft: kind === 'artillery',
        from: { x: attacker.position.x, z: attacker.position.z },
        to: { x: lockX, z: lockZ },
      });
    }
    // Snapshot unit list so a later battle cannot splash into a new roster.
    scheduleIndirectImpact({
      kind,
      timeLeft: flight,
      x: lockX,
      z: lockZ,
      damage,
      attacker,
      allTargets: allTargets.slice(),
      livingUnits: livingUnits.slice(),
      coverSystem,
      scenery,
      sceneryEntry,
      hqs: hqs.slice(),
      options: { ...options },
      mapDef: map,
      scene,
      listenerX,
      listenerZ,
      onFire,
      from: { x: attacker.position.x, z: attacker.position.z },
    });
    return;
  }

  if (target.isGround) {
    applySplashDamage(attacker, impact, damage, allTargets, coverSystem, scenery, hqs, options, livingUnits);
  } else if (
    isSceneryTarget(target) ||
    isDefenseTarget(target) ||
    isBaseBuildingTarget(target) ||
    isHqTarget(target)
  ) {
    const structureDamage = isHqTarget(target)
      ? scalePracticeHqDamage(target, damage, options)
      : damage;
    if (isSceneryTarget(target)) {
      target.takeDamage(structureDamage, {
        weaponType: coax ? 'machineGun' : paratrooperAt ? 'antiTankGun' : attacker.def.type,
        impact: { x: impact.x, z: impact.z },
        impactFrom: { x: attacker.position.x, z: attacker.position.z },
        explosive:
          !coax &&
          (attacker.def.type === 'artillery' ||
            attacker.def.type === 'mortar' ||
            attacker.def.type === 'antiTankGun' ||
            isTankType(attacker.def.type) ||
            paratrooperAt),
        coax,
      });
    } else {
      target.takeDamage(structureDamage);
    }
    if (target.dead && attacker.attackOrder === target) attacker.clearAttackOrder();
  } else {
    if (!target.surrendered) {
      markUnderFire(target);
      // Shells / HE can gib; coax MG and small arms do not
      const explosiveKill =
        !coax &&
        (attacker.def.type === 'artillery' ||
          attacker.def.type === 'mortar' ||
          attacker.def.type === 'antiTankGun' ||
          isTankType(attacker.def.type) ||
          paratrooperAt);
      const appliedDamage = scalePracticeHqDamage(target, damage, options);
      target.takeDamage(appliedDamage, {
        explosive: explosiveKill,
        impactFrom: attacker.position,
        armorHit,
      });
      if (appliedDamage > 0 && !target.dead && !target.surrendered) {
        if (!maybeTriggerSurrender(target, livingUnits, options, attacker) && hqs) {
          maybeTriggerRetreat(target, hqs, livingUnits, attacker, {
            generalOrders: options.generalOrders,
            clearance: options.clearance,
            mapDef,
            scenery,
          });
        }
      }
      if (target.dead && target.def) recordEnemyKill(attacker, target);
    }
    if (scenery && !coax) {
      const ix = impact.x;
      const iz = impact.z;
      const r =
        attacker.def.type === 'artillery'
          ? 8
          : attacker.def.type === 'mortar'
            ? 6
            : isTankType(attacker.def.type)
              ? attacker.def.type === 'superHeavyTank'
                ? 5.5
                : 4.5
              : attacker.def.type === 'antiTankGun' || paratrooperAt
                ? 3.5
              : attacker.def.type === 'armoredCar'
                ? 3
                : 2;
      scenery.damageAt(ix, iz, r, damage * 0.55, {
        weaponType: paratrooperAt ? 'antiTankGun' : attacker.def.type,
        impact: { x: ix, z: iz },
        impactFrom: { x: attacker.position.x, z: attacker.position.z },
        explosive:
          attacker.def.type === 'artillery' ||
          attacker.def.type === 'mortar' ||
          attacker.def.type === 'antiTankGun' ||
          isTankType(attacker.def.type) ||
          paratrooperAt,
      });
    } else if (scenery && coax) {
      scenery.damageAt(impact.x, impact.z, 2, damage * 0.4, {
        weaponType: 'machineGun',
        impact: { x: impact.x, z: impact.z },
        impactFrom: { x: attacker.position.x, z: attacker.position.z },
        coax: true,
      });
    }
  }

  const directShellCanDetonateMine =
    !coax &&
    !target.isGround &&
    (attacker.def.type === 'antiTankGun' ||
      attacker.def.type === 'armoredCar' ||
      isTankType(attacker.def.type) ||
      paratrooperAt);
  if (directShellCanDetonateMine) {
    const mineHitRadius = attacker.def.type === 'superHeavyTank' ? 2 : 1.5;
    options.engineerSandbags?.detonateMinesAt?.(
      impact.x,
      impact.z,
      mineHitRadius,
      attacker.team
    );
    options.defenses?.detonateMinesAt?.(
      impact.x,
      impact.z,
      mineHitRadius,
      attacker.team
    );
  }

  const showVfx =
    attacker.team === 'player' || shouldSpawnVfx(attacker, listenerX, listenerZ);

  if (showVfx && scene) {
    const { from, exactOrigin } = resolveMuzzleFrom(attacker, map, vfxType, coax);
    const toY =
      armorHit?.impactPosition?.y ??
      (map ? sampleTerrainHeight(impact.x, impact.z, map) + 1 : 1);
    if (armorHit?.impactPosition) {
      impact.x = armorHit.impactPosition.x;
      impact.z = armorHit.impactPosition.z;
    }
    const to = { x: impact.x, y: toY, z: impact.z };
    spawnMuzzleFlash(scene, from, to, vfxType, { exactOrigin });
    if (paratrooperAt) triggerParatrooperAtRecoil(attacker.mesh);
    if (
      attacker.def.type === 'infantry' ||
      attacker.def.type === 'engineer' ||
      attacker.def.type === 'vehicleCrew' ||
      attacker.def.type === 'paratrooper' ||
      attacker.def.type === 'sniper'
    ) {
      markInfantryFireAim(attacker, 0.55);
    }
  }

  if (onFire) {
    onFire({
      attacker,
      target,
      def: eventDef,
      dist,
      coaxFire: coax,
      paratrooperAtFire: paratrooperAt,
      killed: !target.isGround && target.dead,
      targetIsHQ: !target.isGround && !target.def && !isSceneryTarget(target),
      targetIsScenery:
        isSceneryTarget(target) || isDefenseTarget(target) || isBaseBuildingTarget(target),
      groundImpact: target.isGround,
      armorHit,
      from: attacker.position,
      to: impact,
    });
  }
}

function applySplashDamage(
  attacker,
  point,
  baseDamage,
  targets,
  coverSystem,
  scenery,
  hqs,
  options = {},
  units = []
) {
  const splash =
    attacker.def.type === 'artillery'
      ? 9
      : attacker.def.type === 'mortar'
        ? 6.5
        : isTankType(attacker.def.type)
          ? attacker.def.type === 'superHeavyTank'
            ? 5
            : 4
          : 2.5;

  if (scenery) {
    scenery.damageAt(point.x, point.z, splash + 1, baseDamage * 0.85, {
      weaponType: attacker.def.type,
      impact: { x: point.x, z: point.z },
      impactFrom: { x: attacker.position.x, z: attacker.position.z },
      explosive: true,
    });
  }
  const shellDetonator =
    attacker.def.type === 'artillery' ||
    attacker.def.type === 'mortar' ||
    attacker.def.type === 'antiTankGun' ||
    attacker.def.type === 'armoredCar' ||
    isTankType(attacker.def.type);
  if (shellDetonator) {
    const mineHitRadius = Math.max(1.5, splash * 0.45);
    options.engineerSandbags?.detonateMinesAt?.(
      point.x,
      point.z,
      mineHitRadius,
      attacker.team
    );
    options.defenses?.detonateMinesAt?.(
      point.x,
      point.z,
      mineHitRadius,
      attacker.team
    );
  }

  for (const other of targets) {
    if (other.dead || other.team === attacker.team) continue;
    const dx = (other.position?.x ?? other.mesh.position.x) - point.x;
    const dz = (other.position?.z ?? other.mesh.position.z) - point.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > splash) continue;
    const t = 1 - d / splash;
    let splashDmg = baseDamage * t * t * 0.65;
    splashDmg *= getIncomingDamageMultiplier(other, coverSystem, {
      def: attacker.def,
      // Blast shielding depends on whether the cover lies between the unit and
      // the detonation, not the distant gun that fired the shell.
      position: point,
    });
    splashDmg *= getArmorDamageMultiplier(attacker.def.type, other);
    if (!other.surrendered) {
      markUnderFire(other);
      const appliedDamage = scalePracticeHqDamage(other, splashDmg, options);
      other.takeDamage(appliedDamage, {
        explosive: true,
        // Fling bodies away from the detonation, not the distant gun.
        blastOrigin: { x: point.x, z: point.z },
        impactFrom: { x: point.x, z: point.z },
      });
      if (appliedDamage > 0 && !other.dead && !other.surrendered) {
        if (!maybeTriggerSurrender(other, units, options, attacker) && hqs) {
          maybeTriggerRetreat(other, hqs, units, attacker, {
            generalOrders: options.generalOrders,
            clearance: options.clearance,
            mapDef: options.mapDef,
            scenery: options.scenery,
          });
        }
      }
      if (other.dead && other.def) recordEnemyKill(attacker, other);
    }
  }
}

export function updateMovement(units, dt, mapDef, hqs = [], options = {}) {
  for (const unit of units) {
    unit._terrainMesh = options.terrainMesh ?? unit._terrainMesh ?? null;
    if (unit._dropping || unit.dead || unit.surrendered || unit._captureExit || unit._crewless) continue;
    if (isUnitMounted(unit)) continue;
    // Garrisoned troops stay put; leave is handled by updateBunkerGarrison
    // (eject + repath). Moving while still "inside" caused façade thrash.
    if (isUnitGarrisoned(unit)) {
      updateUnitTerrainPose(unit, mapDef, dt);
      continue;
    }
    if (unit._mobilityDamaged) {
      unit.moveTarget = null;
      unit._movePath = null;
      unit._userMoveOrder = false;
      unit._chasingAttack = false;
      updateUnitTerrainPose(unit, mapDef, dt);
      continue;
    }

    if (unit.retreating) {
      // Clear Defenses: no player HQ — rally to starting/staging zone instead
      const hq = resolveRetreatHq(unit, hqs, {
        clearance: options.clearance,
        clearanceRole: options.clearanceRole,
        mapDef,
      });
      if (!hq) {
        clearRetreat(unit);
        unit.moveTarget = null;
        unit._movePath = null;
      } else {
        unit.clearAttackOrder();
        unit._bunkerEntryId = null;
        const dest = { x: hq.position.x, z: hq.position.z };
        unit._finalMoveGoal = dest;
        // Don't stomp an active detour path every frame — repath only if lost.
        const needPath =
          !unit.moveTarget ||
          !unit._movePath?.length ||
          unit._autoMoveOrderX == null ||
          Math.hypot(dest.x - (unit._autoMoveOrderX ?? 0), dest.z - (unit._autoMoveOrderZ ?? 0)) > 2;
        if (needPath) {
          unit._autoMoveOrderX = dest.x;
          unit._autoMoveOrderZ = dest.z;
          unit._pathRepathAttempts = 0;
          if (options.scenery) {
            applyObstaclePath(unit, dest.x, dest.z, mapDef, options.scenery);
          } else {
            unit._movePath = null;
            unit.moveTarget = dest;
          }
        }
      }
    }

    if (
      (unit.attackOrder?.isGround || unit.attackOrder?.isSmokeShell) &&
      unit._userMoveOrder
    ) {
      unit.clearAttackOrder();
    } else if (
      unit._stanceBoundAttackOrder &&
      !unit._hardAttackOrder &&
      unit.engagementStance !== 'pursue' &&
      unit.attackOrder &&
      !unit.attackOrder.dead &&
      !canEngageManualOrder(unit, unit.attackOrder)
    ) {
      // Soft Hold binds only last while the target stays in weapon range.
      // Hard player click-attacks never take this path.
      unit.clearAttackOrder();
      unit.moveTarget = null;
      unit._movePath = null;
      unit._finalMoveGoal = null;
    } else if (
      !unit._userMoveOrder &&
      !unit.retreating &&
      unit.attackOrder &&
      !unit.attackOrder.dead &&
      canEngageManualOrder(unit, unit.attackOrder) &&
      !getDirectFireBlocker(unit, unit.attackOrder, options.scenery)
    ) {
      unit.moveTarget = null;
      // Keep _hardAttackOrder; only the active "currently closing" flag drops
      // so the unit stands and fires without path thrash.
      unit._chasingAttack = false;
    }

    const blockedPursuit =
      shouldAdvanceBlockedPursuit(unit, unit.attackOrder) &&
      !!getDirectFireBlocker(unit, unit.attackOrder, options.scenery);
    if (
      !unit._userMoveOrder &&
      !unit.retreating &&
      unit.attackOrder &&
      !unit.attackOrder.dead &&
      (!canEngageManualOrder(unit, unit.attackOrder) || blockedPursuit)
    ) {
      // Resume closing whenever a hard order needs range or a clear lane again.
      if (unit._hardAttackOrder) unit._chasingAttack = true;
      if (unit.attackOrder.isGround || unit.attackOrder.isSmokeShell) {
        const dest = getGroundFireMoveDest(unit, unit.attackOrder.position);
        if (dest) unit.moveTarget = dest;
      } else {
        const dist = distanceBetween(unit, unit.attackOrder);
        const rangeSlack =
          unit.attackOrder.isScenery ||
          isDefenseTarget(unit.attackOrder) ||
          isBaseBuildingTarget(unit.attackOrder) ||
          isHqTarget(unit.attackOrder)
            ? 1.05
            : 0.88;
        const chaseRange = isTankType(unit.def.type) && isCoaxSoftTarget(unit.attackOrder) && unit.def.coaxMG
          ? unit.def.coaxMG.range * rangeSlack
          : unit.def.range * rangeSlack;
        if (blockedPursuit) {
          // A straight-line standoff point may lie inside a Berlin block.
          // Route toward the target's street and stop as soon as both weapon
          // range and an unobstructed firing line are available.
          unit.moveTarget = {
            x: unit.attackOrder.position.x,
            z: unit.attackOrder.position.z,
          };
        } else if (dist > chaseRange) {
          unit.moveTarget = getStandoffPosition(unit, unit.attackOrder);
        }
      }
    }

    if (unit.moveTarget) {
      const dest = unit.moveTarget;

      const holdWhenFiring = [
        'tank',
        'superHeavyTank',
        'artillery',
        'antiTankGun',
        'machineGun',
        'mortar',
        'sniper',
      ];
      if (
        !unit._userMoveOrder &&
        !unit.retreating &&
        unit.attackOrder &&
        !unit.attackOrder.dead &&
        canEngageManualOrder(unit, unit.attackOrder) &&
        !getDirectFireBlocker(unit, unit.attackOrder, options.scenery) &&
        holdWhenFiring.includes(unit.def.type)
      ) {
        unit.moveTarget = null;
        unit._chasingAttack = false;
      } else {
        // AI / retreat / chase assign moveTarget directly. Do not repath on every
        // path-waypoint advance or tiny standoff drift — that caused units to
        // regenerate A* routes continuously and "float" after move orders.
        if (!unit._userMoveOrder) {
          const followingExistingPath =
            !!unit._movePath?.length &&
            Math.hypot(dest.x - unit._movePath[0].x, dest.z - unit._movePath[0].z) < 0.35;
          const goal = unit._finalMoveGoal;
          const goalDrift = goal
            ? Math.hypot(dest.x - goal.x, dest.z - goal.z)
            : Infinity;
          // New order: no path yet, or the requested destination moved a lot.
          const needsPath =
            !followingExistingPath &&
            (!unit._movePath?.length || goalDrift > 10);
          if (needsPath) {
            unit._autoMoveOrderX = dest.x;
            unit._autoMoveOrderZ = dest.z;
            unit._finalMoveGoal = { x: dest.x, z: dest.z };
            unit._pathRepathAttempts = 0;
            unit._lastPathRepathX = null;
            unit._lastPathRepathZ = null;
            unit._urbanCanalRoute = null;
            if (isTankType(unit.def?.type) && !unit.retreating) {
              unit._reverseMoveOrder = shouldUseTacticalReverse(unit, dest.x, dest.z);
            }
            if (options.scenery) {
              applyObstaclePath(unit, dest.x, dest.z, mapDef, options.scenery);
            } else {
              unit._movePath = null;
            }
          }
        }
        let moveDt = dt;
        if (options.getWireSlowMult && unit.team === 'enemy') {
          moveDt *= options.getWireSlowMult(unit.position.x, unit.position.z, unit);
        }
        const beforeX = unit.position.x;
        const beforeZ = unit.position.z;
        advanceUnitOnTerrain(unit, dest, mapDef, moveDt, {
          horizReach: movePathHorizontalReach(unit, mapDef),
        });
        const directionX = unit.position.x - beforeX;
        const directionZ = unit.position.z - beforeZ;
        if (options.scenery && Math.hypot(directionX, directionZ) > 0.01) {
          const pathRadius = unitPathRadius(unit.def?.type);
          const allowBuildingId = unit._bunkerEntryId ?? null;
          let blockedByBuilding = false;

          if (isVehicleUnit(unit.def?.type)) {
            const collisionOptions = {
              vehicleClass: unit.def.type === 'armoredCar' ? 'light' : 'tracked',
              directionX,
              directionZ,
            };
            const blockingBuilding = options.scenery.blockVehicleAtBuildings?.(
              unit,
              beforeX,
              beforeZ,
              pathRadius,
              collisionOptions
            );
            if (blockingBuilding) {
              blockedByBuilding = true;
              unit.position.x = beforeX;
              unit.position.z = beforeZ;
            } else if (CRUSHING_VEHICLE_TYPES.has(unit.def?.type)) {
              options.scenery.crushAt?.(
                unit.position.x,
                unit.position.z,
                pathRadius,
                collisionOptions
              );
              if (TRACK_CRUSH_VEHICLE_TYPES.has(unit.def?.type)) {
                options._crushDirX = directionX;
                options._crushDirZ = directionZ;
                applyTrackCrush(unit, units, options, pathRadius);
              }
            }
          } else {
            // Infantry / foot support: stop at masonry unless ordered inside.
            const blocker = options.scenery.getUnitPlacementBlocker?.(
              unit.position.x,
              unit.position.z,
              pathRadius,
              { allowBuildingId }
            );
            if (blocker) {
              blockedByBuilding = true;
              unit.position.x = beforeX;
              unit.position.z = beforeZ;
            }
          }

          if (blockedByBuilding) {
            // Repath around the obstacle instead of cancelling the move order.
            // Throttle repaths so tanks don't thrash/hug façades after every clip.
            const goal = unit._finalMoveGoal ?? dest;
            let attempts = unit._pathRepathAttempts ?? 0;
            const lastRepathX = unit._lastPathRepathX;
            const lastRepathZ = unit._lastPathRepathZ;
            if (
              Number.isFinite(lastRepathX) &&
              Number.isFinite(lastRepathZ) &&
              Math.hypot(beforeX - lastRepathX, beforeZ - lastRepathZ) >= 3.5
            ) {
              // This is a new obstruction farther along the route, not repeated
              // failure at the same façade. Restore the local recovery budget.
              attempts = 0;
              unit._pathRepathAttempts = 0;
            }
            const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
            const lastRepath = unit._lastPathRepathAt ?? 0;
            const canRepath = attempts < 4 && goal && now - lastRepath > 450;
            let repathed = false;
            if (canRepath) {
              unit._pathRepathAttempts = attempts + 1;
              unit._lastPathRepathAt = now;
              if (
                attempts === 0 ||
                !Number.isFinite(unit._lastPathRepathX) ||
                !Number.isFinite(unit._lastPathRepathZ)
              ) {
                unit._lastPathRepathX = beforeX;
                unit._lastPathRepathZ = beforeZ;
              }
              const { pathSegment } = getMoveReachConfig(unit.def.type);
              const path = buildMovePath(
                beforeX,
                beforeZ,
                goal.x,
                goal.z,
                mapDef,
                pathSegment,
                {
                  scenery: options.scenery,
                  // Plan with clearance so retries also avoid façade hugging.
                  radius: unitPathPlanRadius(unit.def?.type, mapDef),
                  avoidBuildings: true,
                  allowBuildingId,
                  preferUrbanRoads:
                    isVehicleUnit(unit.def?.type) || mapDef?.terrain === 'urban',
                  allowTrackedBuildingCrush: TRACK_CRUSH_VEHICLE_TYPES.has(unit.def?.type),
                }
              );
              if (path?.length) {
                unit._movePath = path;
                while (
                  unit._movePath.length > 1 &&
                  Math.hypot(
                    unit._movePath[0].x - beforeX,
                    unit._movePath[0].z - beforeZ
                  ) < 2
                ) {
                  unit._movePath.shift();
                }
                unit.moveTarget = { ...unit._movePath[0] };
                repathed = true;
              }
            }
            if (!repathed && attempts >= 4) {
              // Keep enter-building orders alive: façade thrash near dense Berlin
              // blocks used to cancel the path while _bunkerEntryId was still set,
              // so troops never got close enough to garrison.
              if (unit._bunkerEntryId && goal) {
                unit._pathRepathAttempts = 0;
                unit._lastPathRepathAt = 0;
                unit._lastPathRepathX = beforeX;
                unit._lastPathRepathZ = beforeZ;
                const { pathSegment } = getMoveReachConfig(unit.def.type);
                const retry = buildMovePath(
                  beforeX,
                  beforeZ,
                  goal.x,
                  goal.z,
                  mapDef,
                  pathSegment,
                  {
                    scenery: options.scenery,
                    radius: unitPathPlanRadius(unit.def?.type, mapDef),
                    avoidBuildings: true,
                    allowBuildingId: unit._bunkerEntryId,
                    preferUrbanRoads:
                      isVehicleUnit(unit.def?.type) || mapDef?.terrain === 'urban',
                    allowTrackedBuildingCrush: TRACK_CRUSH_VEHICLE_TYPES.has(
                      unit.def?.type
                    ),
                  }
                );
                if (retry?.length) {
                  unit._movePath = retry;
                  unit.moveTarget = { ...unit._movePath[0] };
                  unit._userMoveOrder = true;
                } else {
                  unit.moveTarget = { x: goal.x, z: goal.z };
                  unit._movePath = null;
                  unit._userMoveOrder = true;
                }
              } else {
                unit.moveTarget = null;
                unit._movePath = null;
                unit._userMoveOrder = false;
                unit._reverseMoveOrder = false;
                unit._urbanCanalRoute = null;
                unit._chasingAttack = false;
                unit._finalMoveGoal = null;
              }
            }
          }
        }
        advanceMovePath(unit, mapDef);
        if (!unit.moveTarget) unit._chasingAttack = false;
        unit._mapDef = mapDef;
      }
    }

    if (!unit.moveTarget) {
      unit._autoMoveOrderX = null;
      unit._autoMoveOrderZ = null;
      if (!unit._userMoveOrder) unit._reverseMoveOrder = false;
    }

    updateUnitTerrainPose(unit, mapDef, dt);
    updateInfantryWalkAnimation(unit, dt);
  }
}
