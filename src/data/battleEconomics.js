/**
 * Approximate 1944 USD replacement / construction costs for battle report economics.
 * Figures blend US War Department procurement tables, UK Treasury war estimates,
 * and post-war Wehrmacht equipment valuations — rounded for readability.
 */

export const UNIT_MATERIEL_COST_USD_1944 = {
  infantry: 4_200,
  medic: 3_800,
  engineer: 6_500,
  vehicleCrew: 1_800,
  machineGun: 11_000,
  sniper: 5_200,
  mortar: 22_000,
  antiTankGun: 48_000,
  armoredCar: 95_000,
  tank: 62_000,
  superHeavyTank: 285_000,
  artillery: 78_000,
};

/** Field emplacement write-off (materials + labour, no crew). */
export const DEFENSE_MATERIEL_COST_USD_1944 = {
  bunker: 28_000,
  bunkerHeavy: 52_000,
  mgNest: 9_500,
  mgNestMk2: 14_000,
  mortarNest: 24_000,
  mortarNestMk2: 38_000,
  atGun: 52_000,
  atGun88: 72_000,
  barbedWire: 1_800,
  razorWire: 3_200,
  mine: 85,
  tankTrap: 4_200,
  tankTrapHeavy: 7_800,
  artillery: 95_000,
  artilleryHeavy: 145_000,
};

export const HQ_MATERIEL_COST_USD_1944 = 920_000;

export const MATERIEL_COST_NOTE =
  'Estimated 1944 USD replacement cost (materiel, ammunition load, and field construction — approximate).';

export function estimateUnitLossCost(type) {
  return UNIT_MATERIEL_COST_USD_1944[type] ?? 5_000;
}

export function estimateDefenseLossCost(typeId) {
  return DEFENSE_MATERIEL_COST_USD_1944[typeId] ?? 8_000;
}

/** @param {{ type: string, count: number, unitCount?: number }[]} unitLines */
/** @param {{ type: string, count: number }[]} [defenseLines] */
export function computeTeamMaterielCost({ unitLines, defenseLines = [], hqLost = false }) {
  let total = 0;
  for (const line of unitLines) {
    const units = line.unitCount ?? line.count;
    total += estimateUnitLossCost(line.type) * units;
  }
  for (const line of defenseLines) {
    total += estimateDefenseLossCost(line.type) * line.count;
  }
  if (hqLost) total += HQ_MATERIEL_COST_USD_1944;
  return total;
}

export function formatUsd1944(amount) {
  if (!Number.isFinite(amount) || amount <= 0) return '$0';
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(2)}M`;
  if (amount >= 10_000) return `$${Math.round(amount / 1_000)}k`;
  return `$${Math.round(amount).toLocaleString('en-US')}`;
}
