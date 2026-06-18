/** Combat targeting helpers — ranges in game meters (~10 m per unit). */

import { isTankType } from '../units/VehicleTypes.js';

/** Soft targets tanks engage with coax MG (main gun reserved for armor / structures). */
export const COAX_SOFT_TARGET_TYPES = new Set([
  'infantry',
  'machineGun',
  'sniper',
  'mortar',
  'medic',
  'engineer',
  'armoredCar',
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

export function isInRange(attacker, target, slack = 1.02) {
  if (!target || target.dead) return false;
  return distanceBetween(attacker, target) <= attacker.def.range * slack;
}

export function isPointInRange(unit, point, slack = 1.02) {
  return distanceToPoint(unit, point) <= unit.def.range * slack;
}

export function isInCoaxRange(attacker, target, slack = 1.02) {
  const mg = attacker.def?.coaxMG;
  if (!mg || !target || target.dead || target.isGround) return false;
  return distanceBetween(attacker, target) <= mg.range * slack;
}

/** Standoff distance when closing on a target (game meters). */
export function getStandoffRange(attacker, target) {
  if (isTankType(attacker.def?.type) && attacker.def?.coaxMG && isCoaxSoftTarget(target)) {
    return attacker.def.coaxMG.range * 0.9;
  }
  return attacker.def.range * 0.82;
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
  return unit.attackOrder.isGround || !!unit._manualFireMission;
}

/** True when a player-issued attack order is in weapon range (ground, cover, or unit). */
export function canEngageManualOrder(unit, target) {
  if (!target || target.dead) return false;
  if (target.isGround) return isPointInRange(unit, target.position);
  return tankCanEngageTarget(unit, target);
}

/** Move destination when closing on a ground fire mission point. */
export function getGroundFireMoveDest(unit, point, fraction = 0.85) {
  const dx = point.x - unit.position.x;
  const dz = point.z - unit.position.z;
  const dist = Math.sqrt(dx * dx + dz * dz) || 1;
  const stopDist = unit.def.range * fraction;
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
  const inset = target.isScenery ? (target.hitRadius ?? 2) : 0;
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
  const maxSq = (attacker.def.range * rangeMult) ** 2;
  const ax = attacker.position.x;
  const az = attacker.position.z;
  const near = [];
  for (const other of targets) {
    if (other.dead || other.team === attacker.team || other.surrendered || other._captureExit) continue;
    const tx = other.position?.x ?? other.mesh?.position.x ?? 0;
    const tz = other.position?.z ?? other.mesh?.position.z ?? 0;
    const dx = tx - ax;
    const dz = tz - az;
    if (dx * dx + dz * dz <= maxSq) near.push(other);
  }
  return near.length > 0 ? near : targets;
}

export function findNearestEnemyInRange(unit, targets, maxRangeMultiplier = 1) {
  let bestUnit = null;
  let bestUnitDist = Infinity;
  let bestStructure = null;
  let bestStructureDist = Infinity;
  let maxR = unit.def.range * maxRangeMultiplier;
  if (isTankType(unit.def?.type) && unit.def?.coaxMG) {
    maxR = Math.max(maxR, unit.def.coaxMG.range * maxRangeMultiplier);
  }
  for (const other of targets) {
    if (other.dead || other.team === unit.team || other.surrendered || other._captureExit) continue;
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
    if (other.dead || other.team === unit.team || other.surrendered || other._captureExit) continue;
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