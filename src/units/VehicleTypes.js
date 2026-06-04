/** Shared helpers for tracked armor unit types. */

export const TANK_TYPES = new Set(['tank', 'superHeavyTank']);

export function isTankType(type) {
  return TANK_TYPES.has(type);
}

export function isTrackedVehicle(type) {
  return type === 'tank' || type === 'superHeavyTank' || type === 'armoredCar' || type === 'artillery';
}

/** Movement tuning — super heavies use fewer sim steps and looser ridge snapping. */
export function getMoveReachConfig(type) {
  if (type === 'superHeavyTank') {
    return { horiz: 3.5, height: 5.2, substeps: 2, pathSegment: 12 };
  }
  if (type === 'tank') {
    return { horiz: 2.6, height: 3.4, substeps: 3, pathSegment: 8 };
  }
  if (type === 'artillery' || type === 'armoredCar') {
    return { horiz: 2.5, height: 3.2, substeps: 2, pathSegment: 9 };
  }
  return { horiz: 2.4, height: 3.2, substeps: 3, pathSegment: 7 };
}