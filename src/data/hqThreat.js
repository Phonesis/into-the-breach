/** Player HQ threat radii and presence siege tuning. */

/** Outer ring — show warning before contact. */
export const HQ_PRESENCE_WARN_RADIUS = 58;

/** Inner ring — enemy presence applies siege DPS to the HQ. */
export const HQ_SIEGE_RADIUS = 40;

/** Recent direct hit still counts as "under fire" for this many seconds. */
export const HQ_DAMAGE_RECENT_SEC = 2.8;

/** Per-enemy siege contribution (damage/sec at the inner ring). */
export const HQ_SIEGE_DPS_BY_TYPE = {
  infantry: 7,
  medic: 4,
  engineer: 4,
  machineGun: 10,
  sniper: 6,
  mortar: 14,
  antiTankGun: 12,
  armoredCar: 16,
  tank: 22,
  superHeavyTank: 28,
  artillery: 20,
};

/** Scale presence siege by mode (campaign still gets direct fire). */
export const HQ_SIEGE_MODE_MULT = {
  towerDefense: 1,
  clearance: 0.85,
  assault: 0.4,
  campaign: 0.35,
  tutorial: 0,
  lastStand: 0,
};