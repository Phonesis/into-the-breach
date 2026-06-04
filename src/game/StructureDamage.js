/** Damage multipliers vs destructible cover / scenery. */

const MULT = {
  artillery: 2.1,
  mortar: 1.75,
  superHeavyTank: 1.7,
  tank: 1.45,
  armoredCar: 1.15,
  machineGun: 0.85,
  sniper: 0.7,
  infantry: 0.55,
};

export function getStructureDamageMultiplier(attackerType) {
  return MULT[attackerType] ?? 0.65;
}