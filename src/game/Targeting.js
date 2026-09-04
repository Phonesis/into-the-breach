/** Combat targeting helpers — ranges in game meters (~10 m per unit). */

import { currentLivingPersonnel } from '../data/squadSizes.js';
import { isTankType, isVehicleUnit } from '../units/VehicleTypes.js';
import { isDefenseTarget } from './DefenseTarget.js';
import { isBaseBuildingTarget } from './BaseBuildingTarget.js';

/** Small boundary tolerance used by weapon checks to prevent range-edge flicker. */
export const WEAPON_RANGE_SLACK = 1.02;

/**
 * A hull with no crew is an abandoned objective, not a live combat target.
 * The flag is shared by surrendered tanks and vehicles restored from a
 * recoverable knockout, regardless of which side originally owned the hull.
 */
export function isCrewlessVehicleTarget(target) {
  return !!(target?.def && isVehicleUnit(target.def.type) && target._crewless);
}

/** Enemy or friendly headquarters (not a unit def, not ground fire). */
export function isHqTarget(target) {
  return !!(target && !target.dead && target.mesh?.userData?.hq === target);
}

/** Soft targets tanks engage with coax MG (main gun reserved for armor / structures). */
export const COAX_SOFT_TARGET_TYPES = new Set([
  'infantry',
  'machineGun',
  'sniper',
  'mortar',
  'medic',
  'engineer',
  'vehicleCrew',
  'truckDriver',
  'radioOperator',
  'commander',
  'paratrooper',
  'armoredCar',
  'truck',
]);

export function isCoaxSoftTarget(target) {
  return !!(target?.def && COAX_SOFT_TARGET_TYPES.has(target.def.type));
}

export function distanceBetween(a, b) {
  const ax = a.position?.x ?? a.mesh?.position.x;
  const az = a.position?.z ?? a.mesh?.position.z;
  const bx = b.position?.x ?? b.mesh?.position.x;
  const bz = b.position?.z ?? b.mesh?.position.z;
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

export function distanceToPoint(unit, point) {
  const dx = unit.position.x - point.x;
  const dz = unit.position.z - point.z;
  return Math.sqrt(dx * dx + dz * dz);
}

/** True while the sniper team's observer is still on his feet. */
export function sniperHasSpotter(unit) {
  return unit?.def?.type === 'sniper' && currentLivingPersonnel(unit) >= 2;
}

/**
 * Effective weapon range for this unit. A sniper without his spotter loses
 * observer corrections, so scoped range drops to the team's solo figure.
 */
export function getUnitWeaponRange(unit) {
  const def = unit?.def;
  if (!def) return 0;
  if (def.type === 'sniper' && !sniperHasSpotter(unit)) {
    if (Number.isFinite(def.soloRange)) return def.soloRange;
    return (def.range ?? 0) * 0.65;
  }
  return def.range ?? 0;
}

export function getUnitWeaponRangeMeters(unit) {
  const def = unit?.def;
  if (!def) return 0;
  if (def.type === 'sniper' && !sniperHasSpotter(unit)) {
    if (Number.isFinite(def.soloRangeMeters)) return def.soloRangeMeters;
    return Math.round(getUnitWeaponRange(unit) * 10);
  }
  return def.rangeMeters ?? Math.round((def.range ?? 0) * 10);
}

export function isSpotterRifleInRange(attacker, target, slack = WEAPON_RANGE_SLACK) {
  const rifle = attacker?.def?.spotterRifle;
  if (attacker?.def?.type !== 'sniper' || !rifle || !sniperHasSpotter(attacker)) {
    return false;
  }
  if (
    !target ||
    target.dead ||
    target.isGround ||
    target.isSmokeShell ||
    isCrewlessVehicleTarget(target)
  ) return false;
  return distanceBetween(attacker, target) <= rifle.range * slack;
}

export function isInRange(attacker, target, slack = WEAPON_RANGE_SLACK) {
  if (!target || target.dead || isCrewlessVehicleTarget(target)) return false;
  const distance = distanceBetween(attacker, target);
  const minRange = attacker.def?.minRange ?? 0;
  return distance <= getUnitWeaponRange(attacker) * slack && distance >= minRange / slack;
}

export function isPointInRange(unit, point, slack = WEAPON_RANGE_SLACK) {
  const distance = distanceToPoint(unit, point);
  const minRange = unit.def?.minRange ?? 0;
  return distance <= getUnitWeaponRange(unit) * slack && distance >= minRange / slack;
}

export function isInCoaxRange(attacker, target, slack = WEAPON_RANGE_SLACK) {
  const mg = attacker.def?.coaxMG;
  if (!mg || !target || target.dead || target.isGround || isCrewlessVehicleTarget(target)) return false;
  return distanceBetween(attacker, target) <= mg.range * slack;
}

export function isInsideMinimumRange(attacker, target) {
  const minRange = attacker?.def?.minRange ?? 0;
  if (minRange <= 0 || !target || target.dead || isCrewlessVehicleTarget(target)) return false;
  return distanceBetween(attacker, target) < minRange;
}

export function isInArtilleryCrewSmallArmsRange(
  attacker,
  target,
  slack = WEAPON_RANGE_SLACK
) {
  const weapon = attacker?.def?.crewSmallArms;
  if (
    attacker?.def?.type !== 'artillery' ||
    !weapon ||
    !target ||
    target.dead ||
    target.isGround ||
    isCrewlessVehicleTarget(target)
  ) {
    return false;
  }
  const structureTarget =
    isHqTarget(target) || isDefenseTarget(target) || isBaseBuildingTarget(target);
  if (!target.def && !structureTarget) return false;
  return distanceBetween(attacker, target) <= weapon.range * slack;
}

/** Standoff distance when closing on a target (game meters). */
export function getStandoffRange(attacker, target) {
  if (isTankType(attacker.def?.type) && attacker.def?.coaxMG && isCoaxSoftTarget(target)) {
    return attacker.def.coaxMG.range * 0.9;
  }
  return getUnitWeaponRange(attacker) * 0.82;
}

/**
 * Enemy armor holds the main gun envelope instead of closing to coax range,
 * which would drive the hull into infantry and AT crossfire.
 */
export function getEnemyArmorStandoffRange(attacker) {
  return getUnitWeaponRange(attacker) * 0.9;
}

export function tankCanEngageTarget(attacker, target) {
  if (!target || target.dead || target.isGround) return false;
  if (isInRange(attacker, target)) return true;
  if (!isTankType(attacker.def?.type) || !attacker.def?.coaxMG) return false;
  return isInCoaxRange(attacker, target);
}

/** True when the unit is executing a player-issued Shift+LMB fire mission. */
export function isActiveManualFireMission(unit) {
  if (!unit || unit.dead || !unit.attackOrder || unit.attackOrder.dead) return false;
  return unit.attackOrder.isGround || unit.attackOrder.isSmokeShell || !!unit._manualFireMission;
}

export function isSmokeShellTarget(target) {
  return !!(target?.isSmokeShell && target.position);
}

/** Reload and ammunition-preparation delay after a howitzer fires smoke. */
export const SMOKE_SHELL_COOLDOWN_SEC = 45;

export function isSmokeShellReady(unit) {
  return (
    unit?.def?.type === 'artillery' &&
    !unit.dead &&
    !unit.surrendered &&
    !unit._captureExit &&
    (unit.smokeShellCooldown ?? 0) <= 0 &&
    !isSmokeShellTarget(unit.attackOrder)
  );
}

/** True when a player-issued attack order is in weapon range (ground, cover, or unit). */
export function canEngageManualOrder(unit, target) {
  if (!target || target.dead) return false;
  if (isCrewlessVehicleTarget(target)) return false;
  if (target.isGround || target.isSmokeShell) return isPointInRange(unit, target.position);
  if (isInArtilleryCrewSmallArmsRange(unit, target)) return true;
  if (isHqTarget(target)) {
    if (isInRange(unit, target)) return true;
    return isTankType(unit.def?.type) && !!unit.def?.coaxMG && isInCoaxRange(unit, target);
  }
  return tankCanEngageTarget(unit, target);
}

/** Move destination when closing on a ground fire mission point. */
export function getGroundFireMoveDest(unit, point, fraction = 0.85) {
  const dx = point.x - unit.position.x;
  const dz = point.z - unit.position.z;
  const dist = Math.sqrt(dx * dx + dz * dz) || 1;
  const stopDist = getUnitWeaponRange(unit) * fraction;
  if (dist <= stopDist) return null;
  const ratio = (dist - stopDist) / dist;
  return {
    x: unit.position.x + dx * ratio,
    z: unit.position.z + dz * ratio,
  };
}

export function getStandoffPosition(attacker, target, fraction = null) {
  const tx = target.position?.x ?? target.mesh?.position.x;
  const tz = target.position?.z ?? target.mesh?.position.z;
  const dx = tx - attacker.position.x;
  const dz = tz - attacker.position.z;
  const dist = Math.sqrt(dx * dx + dz * dz) || 1;
  const desired = fraction ?? getStandoffRange(attacker, target);
  const inset = target.isScenery ? (target.hitRadius ?? 2) : isHqTarget(target) ? 5.5 : 0;
  const stopDist = Math.max(desired, 3 + inset);
  const ratio = dist > stopDist ? (dist - stopDist) / dist : 0;
  return {
    x: attacker.position.x + dx * ratio,
    z: attacker.position.z + dz * ratio,
  };
}

/** Limit auto-target scans to enemies within this multiple of attack range. */
export function filterAcquireNearAttacker(attacker, targets, rangeMult = 2.25) {
  if (!targets?.length) return targets;
  const maxSq = (getUnitWeaponRange(attacker) * rangeMult) ** 2;
  const ax = attacker.position.x;
  const az = attacker.position.z;
  const near = [];
  for (const other of targets) {
    if (
      other.dead ||
      other.team === attacker.team ||
      other.surrendered ||
      other._captureExit ||
      other._dropping ||
      isCrewlessVehicleTarget(other)
    ) continue;
    const tx = other.position?.x ?? other.mesh?.position.x ?? 0;
    const tz = other.position?.z ?? other.mesh?.position.z ?? 0;
    const dx = tx - ax;
    const dz = tz - az;
    if (dx * dx + dz * dz <= maxSq) near.push(other);
  }
  // Callers already handle explicit attack orders before auto-acquisition.
  // Returning the full opposing army when nobody is nearby only makes the
  // subsequent range/LOS pass rescan targets that cannot possibly be chosen.
  return near;
}

export function findNearestEnemyInRange(unit, targets, maxRangeMultiplier = 1) {
  let bestUnit = null;
  let bestUnitDist = Infinity;
  let bestStructure = null;
  let bestStructureDist = Infinity;
  let maxR = getUnitWeaponRange(unit) * maxRangeMultiplier;
  if (isTankType(unit.def?.type) && unit.def?.coaxMG) {
    maxR = Math.max(maxR, unit.def.coaxMG.range * maxRangeMultiplier);
  }
  for (const other of targets) {
    if (
      other.dead ||
      other.team === unit.team ||
      other.surrendered ||
      other._captureExit ||
      other._dropping ||
      isCrewlessVehicleTarget(other)
    ) continue;
    const d = distanceBetween(unit, other);
    if (d > maxR) continue;
    const isUnit = other.def !== undefined;
    if (isUnit) {
      if (d < bestUnitDist) {
        bestUnitDist = d;
        bestUnit = other;
      }
    } else if (d < bestStructureDist) {
      bestStructureDist = d;
      bestStructure = other;
    }
  }
  return bestUnit ?? bestStructure;
}

export function findNearestEnemy(unit, targets) {
  let best = null;
  let bestDist = Infinity;
  for (const other of targets) {
    if (
      other.dead ||
      other.team === unit.team ||
      other.surrendered ||
      other._captureExit ||
      other._dropping ||
      isCrewlessVehicleTarget(other)
    ) continue;
    const d = distanceBetween(unit, other);
    if (d < bestDist) {
      bestDist = d;
      best = other;
    }
  }
  return best;
}

/** Create a ground fire mission target. */
export function createGroundTarget(x, z) {
  return {
    isGround: true,
    dead: false,
    team: null,
    position: { x, z, y: 0 },
    mesh: { position: { x, z, y: 0 } },
    takeDamage() {},
  };
}

/** Create an artillery smoke-shell ground target (no HE splash). */
export function createSmokeShellTarget(x, z) {
  return {
    isSmokeShell: true,
    isGround: false,
    dead: false,
    team: null,
    position: { x, z, y: 0 },
    mesh: { position: { x, z, y: 0 } },
    takeDamage() {},
  };
}
