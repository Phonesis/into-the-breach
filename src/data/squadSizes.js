/** Foot squads/teams — each in-game unit represents this many soldiers on the field. */

export const SQUAD_SIZES = {
  radioOperator: 1,
  commander: 5,
  infantry: 5,
  paratrooper: 4,
  machineGun: 2,
  medic: 2,
  engineer: 4,
  mortar: 2,
  sniper: 2,
  vehicleCrew: 2,
  truckDriver: 1,
};

/** Personnel lost when one unit of this type is destroyed or captured. */
export function personnelPerUnit(type) {
  return SQUAD_SIZES[type] ?? 1;
}

/**
 * Match the battlefield squad visual: a non-empty squad loses a member when
 * its shared HP crosses the next personnel threshold, while single-person
 * teams remain one person until they are destroyed.
 */
export function livingPersonnelForHp(hp, maxHp, squadSize) {
  if (hp <= 0) return 0;
  if (squadSize <= 1) return 1;
  return Math.max(1, Math.ceil((hp / Math.max(maxHp, 1)) * squadSize));
}

/** Current personnel represented by a live or destroyed unit. */
export function currentLivingPersonnel(unit) {
  if (!unit || unit.dead || unit.hp <= 0) return 0;

  const squadSize = SQUAD_SIZES[unit.def?.type];
  if (!squadSize) return 1;

  // UnitMeshes stores this after applying a casualty visual. Prefer it so the
  // report stays aligned with the soldiers currently shown on the field.
  if (Number.isFinite(unit._squadLiving)) {
    return Math.min(squadSize, Math.max(1, Math.floor(unit._squadLiving)));
  }

  return livingPersonnelForHp(unit.hp, unit.maxHp, squadSize);
}

/** Personnel missing from a unit that has not yet been destroyed. */
export function currentCasualtyCount(unit) {
  return Math.max(0, personnelPerUnit(unit?.def?.type) - currentLivingPersonnel(unit));
}
