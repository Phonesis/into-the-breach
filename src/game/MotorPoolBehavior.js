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

export function updateMotorPoolHealing(baseBuildings, units, dt, motorPoolsIn = null) {
  if (dt <= 0 || !baseBuildings?.active) return;

  const motorPools = motorPoolsIn ?? getActiveMotorPools(baseBuildings);
  if (!motorPools.length) return;

  for (const pool of motorPools) {
    const range = pool.def?.healRange ?? MOTOR_POOL_AURA_RANGE;
    const rangeSq = range * range;
    const healRate = pool.def?.healPerSec ?? MOTOR_POOL_HEAL_PER_SEC;
    const team = pool.team;
    const px = pool.x;
    const pz = pool.z;

    for (const ally of units) {
      if (ally.dead || ally.team !== team) continue;
      if (!canReceiveMotorPoolHeal(ally)) continue;

      const dx = ally.position.x - px;
      const dz = ally.position.z - pz;
      const distSq = dx * dx + dz * dz;
      if (distSq > rangeSq) continue;

      const dist = Math.sqrt(distSq);
      const proximity = 1 - (dist / range) * 0.5;
      ally.hp = Math.min(ally.maxHp, ally.hp + healRate * proximity * dt);
    }
  }
}