import { distanceBetween } from './Targeting.js';
import { isVehicleUnit } from '../units/VehicleTypes.js';
import { clearMobilityDamage } from './ArmorPenetration.js';

/** Game meters — aura in which engineers repair vehicles and steady crews. */
export const ENGINEER_AURA_RANGE = 16;

/** HP restored per second at point-blank (scales down with distance). */
export const ENGINEER_HEAL_PER_SEC = 2.8;

/** Time for one nearby engineer at point-blank range to restart a recoverable wreck. */
export const RECOVERABLE_WRECK_REPAIR_SEC = 12;

/** Time for one nearby engineer at point-blank range to repair running gear. */
export const MOBILITY_REPAIR_SEC = 8.5;

/** Game meters — engineers within this range of a damaged HQ can repair it. */
export const ENGINEER_HQ_REPAIR_RANGE = ENGINEER_AURA_RANGE;

/** HQ structural repair rate at point-blank (scales down with distance). */
export const ENGINEER_HQ_REPAIR_PER_SEC = 5.2;

/** Multiplier applied to panic-retreat chance when a friendly engineer is in range. */
export const ENGINEER_RETREAT_DISCOURAGE = 0.34;

export function getEngineerRetreatMultiplier(unit, units) {
  if (!unit || unit.dead || !isVehicleUnit(unit.def?.type)) return 1;

  for (const engineer of units) {
    if (engineer.dead || engineer.team !== unit.team || engineer.def?.type !== 'engineer') continue;
    if (distanceBetween(unit, engineer) <= ENGINEER_AURA_RANGE) return ENGINEER_RETREAT_DISCOURAGE;
  }
  return 1;
}

function distanceToPoint(unit, x, z) {
  const dx = unit.position.x - x;
  const dz = unit.position.z - z;
  return Math.hypot(dx, dz);
}

export function isEngineerNearHq(engineer, hq) {
  if (!engineer || engineer.dead || engineer.def?.type !== 'engineer') return false;
  if (!hq || hq.dead || hq.hp >= hq.maxHp) return false;
  if (engineer.team !== hq.team) return false;
  return distanceToPoint(engineer, hq.position.x, hq.position.z) <= ENGINEER_HQ_REPAIR_RANGE;
}

export function isHqBeingRepairedByEngineers(hq, units) {
  if (!hq || hq.dead || hq.hp >= hq.maxHp) return false;
  for (const engineer of units) {
    if (isEngineerNearHq(engineer, hq)) return true;
  }
  return false;
}

export function updateEngineerHealing(units, dt, coverSystem = null) {
  if (dt <= 0) return 0;

  const engineers = units.filter((u) => !u.dead && u.def?.type === 'engineer');
  if (!engineers.length) return 0;
  let restoredVehicles = 0;

  for (const engineer of engineers) {
    for (const ally of units) {
      if (ally.team !== engineer.team || ally.id === engineer.id) continue;
      if (ally.dead) {
        if (!ally._recoverableWreck) continue;
        const dist = distanceBetween(engineer, ally);
        if (dist > ENGINEER_AURA_RANGE) continue;
        const proximity = 1 - (dist / ENGINEER_AURA_RANGE) * 0.55;
        ally._wreckRepairProgress = Math.min(
          1,
          (ally._wreckRepairProgress ?? 0) +
            (proximity * dt) / RECOVERABLE_WRECK_REPAIR_SEC
        );
        if (ally._wreckRepairProgress >= 1 && ally.restoreRecoverableVehicle?.(coverSystem)) {
          restoredVehicles += 1;
        }
        continue;
      }
      if (!isVehicleUnit(ally.def?.type)) continue;
      if (ally.hp >= ally.maxHp && !ally._mobilityDamaged) continue;

      const dist = distanceBetween(engineer, ally);
      if (dist > ENGINEER_AURA_RANGE) continue;

      const proximity = 1 - (dist / ENGINEER_AURA_RANGE) * 0.55;
      if (ally._mobilityDamaged) {
        ally._mobilityRepairProgress = Math.min(
          1,
          (ally._mobilityRepairProgress ?? 0) + (proximity * dt) / MOBILITY_REPAIR_SEC
        );
        if (ally._mobilityRepairProgress >= 1 && clearMobilityDamage(ally)) {
          restoredVehicles += 1;
        }
      }
      if (ally.hp < ally.maxHp) {
        ally.hp = Math.min(ally.maxHp, ally.hp + ENGINEER_HEAL_PER_SEC * proximity * dt);
      }
    }
  }
  return restoredVehicles;
}

export function updateEngineerHqRepair(hqs, units, dt) {
  if (dt <= 0 || !hqs?.length) return;

  const engineers = units.filter((u) => !u.dead && u.def?.type === 'engineer');
  if (!engineers.length) return;

  for (const hq of hqs) {
    if (hq.dead || hq.hp >= hq.maxHp) continue;

    let nearestDist = Infinity;
    for (const engineer of engineers) {
      if (engineer.team !== hq.team) continue;
      const dist = distanceToPoint(engineer, hq.position.x, hq.position.z);
      if (dist > ENGINEER_HQ_REPAIR_RANGE) continue;
      nearestDist = Math.min(nearestDist, dist);
    }
    if (!Number.isFinite(nearestDist)) continue;

    const proximity = 1 - (nearestDist / ENGINEER_HQ_REPAIR_RANGE) * 0.55;
    hq.repair(ENGINEER_HQ_REPAIR_PER_SEC * proximity * dt);
  }
}
