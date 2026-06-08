import { distanceBetween } from './Targeting.js';
import { isVehicleUnit } from '../units/VehicleTypes.js';

/** Game meters — aura in which engineers repair vehicles and steady crews. */
export const ENGINEER_AURA_RANGE = 16;

/** HP restored per second at point-blank (scales down with distance). */
export const ENGINEER_HEAL_PER_SEC = 2.8;

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

export function updateEngineerHealing(units, dt) {
  if (dt <= 0) return;

  const engineers = units.filter((u) => !u.dead && u.def?.type === 'engineer');
  if (!engineers.length) return;

  for (const engineer of engineers) {
    for (const ally of units) {
      if (ally.dead || ally.team !== engineer.team || ally.id === engineer.id) continue;
      if (!isVehicleUnit(ally.def?.type)) continue;
      if (ally.hp >= ally.maxHp) continue;

      const dist = distanceBetween(engineer, ally);
      if (dist > ENGINEER_AURA_RANGE) continue;

      const proximity = 1 - (dist / ENGINEER_AURA_RANGE) * 0.55;
      ally.hp = Math.min(ally.maxHp, ally.hp + ENGINEER_HEAL_PER_SEC * proximity * dt);
    }
  }
}