import { distanceBetween } from './Targeting.js';
import { isFootSoldier } from '../units/VehicleTypes.js';
import { updateSquadCasualtyVisual } from '../units/UnitMeshes.js';

/** Game meters — aura in which medics heal and steady nearby infantry. */
export const MEDIC_AURA_RANGE = 14;

/** HP restored per second at point-blank (scales down with distance). */
export const MEDIC_HEAL_PER_SEC = 3.8;

/** Multiplier applied to panic-retreat chance when a friendly medic is in range. */
export const MEDIC_RETREAT_DISCOURAGE = 0.32;

export function getMedicRetreatMultiplier(unit, units) {
  if (!unit || unit.dead || !isFootSoldier(unit.def?.type)) return 1;

  for (const medic of units) {
    if (medic.dead || medic.team !== unit.team || medic.def?.type !== 'medic') continue;
    if (distanceBetween(unit, medic) <= MEDIC_AURA_RANGE) return MEDIC_RETREAT_DISCOURAGE;
  }
  return 1;
}

export function updateMedicHealing(units, dt) {
  if (dt <= 0) return;

  const medics = units.filter((u) => !u.dead && u.def?.type === 'medic');
  if (!medics.length) return;

  for (const medic of medics) {
    for (const ally of units) {
      if (ally.dead || ally.team !== medic.team || ally.id === medic.id) continue;
      if (!isFootSoldier(ally.def?.type) || ally.def?.type === 'medic' || ally.def?.type === 'engineer')
        continue;
      if (ally.hp >= ally.maxHp) continue;

      const dist = distanceBetween(medic, ally);
      if (dist > MEDIC_AURA_RANGE) continue;

      const before = ally.hp;
      const proximity = 1 - (dist / MEDIC_AURA_RANGE) * 0.55;
      ally.hp = Math.min(ally.maxHp, ally.hp + MEDIC_HEAL_PER_SEC * proximity * dt);
      if (ally.hp > before) updateSquadCasualtyVisual(ally);
    }
  }
}