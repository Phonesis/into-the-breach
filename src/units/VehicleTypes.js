/** Shared helpers for tracked armor unit types. */

export const TANK_TYPES = new Set(['tank', 'tankDestroyer', 'superHeavyTank']);

export const TACTICAL_REVERSE_MAX_DISTANCE = 20;
// About 11 degrees either side of straight back. Rear-quarter clicks should
// produce a turn, not a diagonal reverse that exposes the tank's flank.
const TACTICAL_REVERSE_REAR_DOT = -0.98;

/** Tanks and trucks reverse a short rear-arc move instead of turning around. */
export function canUseTacticalReverse(type) {
  return TANK_TYPES.has(type) || type === 'truck';
}

/** Whether a tank or truck should back into a nearby destination instead of turning around. */
export function shouldUseTacticalReverse(unit, x, z) {
  if (!unit?.mesh || !canUseTacticalReverse(unit.def?.type)) return false;
  const dx = x - unit.position.x;
  const dz = z - unit.position.z;
  const distance = Math.hypot(dx, dz);
  if (distance <= 0.001 || distance > TACTICAL_REVERSE_MAX_DISTANCE) return false;
  const hullYaw = unit.mesh.rotation.y ?? 0;
  const forwardDot =
    (dx * Math.sin(hullYaw) + dz * Math.cos(hullYaw)) / distance;
  return forwardDot <= TACTICAL_REVERSE_REAR_DOT;
}

/** Infantry-scale units that medics can treat (excludes towed guns and vehicles). */
export const FOOT_SOLDIER_TYPES = new Set([
  'radioOperator',
  'infantry',
  'paratrooper',
  'machineGun',
  'sniper',
  'mortar',
  'medic',
  'vehicleCrew',
  'truckDriver',
  'commander',
]);

export function isFootSoldier(type) {
  return FOOT_SOLDIER_TYPES.has(type);
}

/** Mechanical units engineers can repair (tanks, guns, trucks, and wheeled armor). */
export const VEHICLE_UNIT_TYPES = new Set([
  'tank',
  'tankDestroyer',
  'superHeavyTank',
  'armoredCar',
  'truck',
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

export function isWheeledVehicle(type) {
  return type === 'armoredCar' || type === 'truck';
}

export function isTruckType(type) {
  return type === 'truck';
}

/** Movement tuning — super heavies use fewer sim steps and looser ridge snapping. */
export function getMoveReachConfig(type) {
  if (type === 'superHeavyTank') {
    return { horiz: 3.5, height: 5.2, substeps: 2, pathSegment: 12 };
  }
  if (type === 'tank' || type === 'tankDestroyer') {
    return { horiz: 2.6, height: 3.4, substeps: 3, pathSegment: 8 };
  }
  if (type === 'truck') {
    return { horiz: 2.5, height: 3.2, substeps: 3, pathSegment: 9 };
  }
  if (type === 'artillery' || type === 'armoredCar' || type === 'antiTankGun') {
    return { horiz: 2.5, height: 3.2, substeps: 2, pathSegment: 9 };
  }
  return { horiz: 2.4, height: 3.2, substeps: 3, pathSegment: 7 };
}
