/** Damage multipliers vs destructible cover / scenery. */

const MULT = {
  artillery: 2.1,
  mortar: 1.75,
  superHeavyTank: 1.7,
  tank: 1.45,
  tankDestroyer: 1.6,
  antiTankGun: 1.55,
  armoredCar: 1.15,
  machineGun: 0.85,
  medic: 0.9,
  engineer: 0.9,
  sniper: 0.7,
  infantry: 0.55,
};

export function getStructureDamageMultiplier(attackerType) {
  return MULT[attackerType] ?? 0.65;
}
