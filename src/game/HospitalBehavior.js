import { isFootSoldier } from '../units/VehicleTypes.js';
import { updateSquadCasualtyVisual } from '../units/UnitMeshes.js';

/** Game meters — aura around a completed field hospital. */
export const HOSPITAL_AURA_RANGE = 14;

/** HP restored per second at the building doorstep. */
export const HOSPITAL_HEAL_PER_SEC = 5.2;

function distanceToPoint(unit, x, z) {
  const dx = unit.position.x - x;
  const dz = unit.position.z - z;
  return Math.hypot(dx, dz);
}

export function canReceiveHospitalHeal(unit) {
  if (!unit || unit.dead || unit.hp >= unit.maxHp) return false;
  if (!isFootSoldier(unit.def?.type)) return false;
  if (unit.def?.type === 'medic' || unit.def?.type === 'engineer') return false;
  return true;
}

export function getActiveHospitals(baseBuildings) {
  if (!baseBuildings?.active) return [];
  return baseBuildings.entries.filter(
    (e) => !e.destroyed && !e.building && e.typeId === 'hospital'
  );
}

export function isUnitNearHospital(unit, hospitals) {
  if (!unit || unit.dead || !hospitals?.length || !canReceiveHospitalHeal(unit)) return false;

  for (const hospital of hospitals) {
    const range = hospital.def?.healRange ?? HOSPITAL_AURA_RANGE;
    if (distanceToPoint(unit, hospital.x, hospital.z) <= range) return true;
  }
  return false;
}

export function updateHospitalHealing(baseBuildings, units, dt) {
  if (dt <= 0 || !baseBuildings?.active) return;

  const hospitals = getActiveHospitals(baseBuildings);
  if (!hospitals.length) return;

  for (const hospital of hospitals) {
    const range = hospital.def?.healRange ?? HOSPITAL_AURA_RANGE;
    const healRate = hospital.def?.healPerSec ?? HOSPITAL_HEAL_PER_SEC;

    for (const ally of units) {
      if (ally.dead || ally.team !== hospital.team) continue;
      if (!canReceiveHospitalHeal(ally)) continue;

      const dist = distanceToPoint(ally, hospital.x, hospital.z);
      if (dist > range) continue;

      const before = ally.hp;
      const proximity = 1 - (dist / range) * 0.5;
      ally.hp = Math.min(ally.maxHp, ally.hp + healRate * proximity * dt);
      if (ally.hp > before) updateSquadCasualtyVisual(ally);
    }
  }
}