/** Shared helpers for tracked armor unit types. */

export const TANK_TYPES = new Set(['tank', 'tankDestroyer', 'superHeavyTank']);

/** Infantry-scale units that medics can treat (excludes towed guns and vehicles). */
export const FOOT_SOLDIER_TYPES = new Set([
  'infantry',
  'paratrooper',
  'machineGun',
  'sniper',
  'mortar',
  'medic',
  'vehicleCrew',
]);

export function isFootSoldier(type) {
  return FOOT_SOLDIER_TYPES.has(type);
}

/** Mechanical units engineers can repair (tanks, guns, and wheeled armor). */
export const VEHICLE_UNIT_TYPES = new Set([
  'tank',
  'tankDestroyer',
  'superHeavyTank',
  'armoredCar',
  'artillery',
  'antiTankGun',
]);

export function isVehicleUnit(type) {
  return VEHICLE_UNIT_TYPES.has(type);
}

export function isTankType(type) {
  return TANK_TYPES.has(type);
}

export function isTrackedVehicle(type) {
  return TANK_TYPES.has(type) || type === 'armoredCar' || type === 'artillery';
}

/** Movement tuning — super heavies use fewer sim steps and looser ridge snapping. */
export function getMoveReachConfig(type) {
  if (type === 'superHeavyTank') {
    return { horiz: 3.5, height: 5.2, substeps: 2, pathSegment: 12 };
  }
  if (type === 'tank' || type === 'tankDestroyer') {
    return { horiz: 2.6, height: 3.4, substeps: 3, pathSegment: 8 };
  }
  if (type === 'artillery' || type === 'armoredCar' || type === 'antiTankGun') {
    return { horiz: 2.5, height: 3.2, substeps: 2, pathSegment: 9 };
  }
  return { horiz: 2.4, height: 3.2, substeps: 3, pathSegment: 7 };
}
