import { isVehicleUnit } from '../units/VehicleTypes.js';

/** Game meters — aura around a completed motor pool. */
export const MOTOR_POOL_AURA_RANGE = 14;

/** HP restored per second at the building doorstep. */
export const MOTOR_POOL_HEAL_PER_SEC = 5.2;

function distanceToPoint(unit, x, z) {
  const dx = unit.position.x - x;
  const dz = unit.position.z - z;
  return Math.hypot(dx, dz);
}

export function canReceiveMotorPoolHeal(unit) {
  if (!unit || unit.dead || unit.hp >= unit.maxHp) return false;
  return isVehicleUnit(unit.def?.type);
}

export function getActiveMotorPools(baseBuildings) {
  if (!baseBuildings?.active) return [];
  return baseBuildings.entries.filter(
    (e) => !e.destroyed && !e.building && e.typeId === 'motorPool'
  );
}

export function isUnitNearMotorPool(unit, motorPools) {
  if (!unit || unit.dead || !motorPools?.length || !canReceiveMotorPoolHeal(unit)) return false;

  for (const pool of motorPools) {
    const range = pool.def?.healRange ?? MOTOR_POOL_AURA_RANGE;
    if (distanceToPoint(unit, pool.x, pool.z) <= range) return true;
  }
  return false;
}

export function updateMotorPoolHealing(baseBuildings, units, dt) {
  if (dt <= 0 || !baseBuildings?.active) return;

  const motorPools = getActiveMotorPools(baseBuildings);
  if (!motorPools.length) return;

  for (const pool of motorPools) {
    const range = pool.def?.healRange ?? MOTOR_POOL_AURA_RANGE;
    const healRate = pool.def?.healPerSec ?? MOTOR_POOL_HEAL_PER_SEC;

    for (const ally of units) {
      if (ally.dead || ally.team !== pool.team) continue;
      if (!canReceiveMotorPoolHeal(ally)) continue;

      const dist = distanceToPoint(ally, pool.x, pool.z);
      if (dist > range) continue;

      const proximity = 1 - (dist / range) * 0.5;
      ally.hp = Math.min(ally.maxHp, ally.hp + healRate * proximity * dt);
    }
  }
}