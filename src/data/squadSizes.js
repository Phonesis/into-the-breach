/** Foot squads/teams — each in-game unit represents this many soldiers on the field. */

export const SQUAD_SIZES = {
  infantry: 5,
  paratrooper: 4,
  machineGun: 2,
  medic: 2,
  engineer: 4,
  mortar: 2,
  sniper: 1,
};

/** Personnel lost when one unit of this type is destroyed or captured. */
export function personnelPerUnit(type) {
  return SQUAD_SIZES[type] ?? 1;
}