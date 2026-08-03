import { distanceBetween } from './Targeting.js';

/** Game meters — the field commander's morale aura. */
export const COMMANDER_AURA_RANGE = 34;

/** Automatic retreat/surrender chance multiplier while command is nearby. */
export const COMMANDER_MORALE_DISCOURAGE = 0.2;

/** Automatic retreat/surrender chance multiplier after the field commander is lost. */
export const COMMANDER_LOSS_MORALE_PRESSURE = 2.25;

/**
 * A living field commander keeps nearby troops from breaking under fire.
 * Keep this separate from direct retreat orders: it only changes the random
 * panic decisions made after a unit takes damage.
 */
export function getCommanderMoraleMultiplier(unit, units = []) {
  if (!unit || unit.dead || unit.def?.type === 'commander') return 1;

  let hasLivingCommander = false;
  for (const commander of units) {
    if (
      !commander ||
      commander.dead ||
      commander.surrendered ||
      commander._captureExit ||
      commander.team !== unit.team ||
      commander.def?.type !== 'commander'
    ) {
      continue;
    }
    hasLivingCommander = true;
    if (distanceBetween(unit, commander) <= COMMANDER_AURA_RANGE) {
      return COMMANDER_MORALE_DISCOURAGE;
    }
  }

  return hasLivingCommander ? 1 : COMMANDER_LOSS_MORALE_PRESSURE;
}
