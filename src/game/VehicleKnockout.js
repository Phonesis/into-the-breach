export const VEHICLE_BAILOUT_CHANCE = 1 / 3;
export const REAR_CHAIN_REACTION_CHANCE = 0.62;

const BAILOUT_VEHICLE_TYPES = new Set(['tank', 'tankDestroyer', 'superHeavyTank', 'armoredCar']);

export function isBailoutVehicleType(type) {
  return BAILOUT_VEHICLE_TYPES.has(type);
}

/** True when the killing shot arrived within roughly 55 degrees of the rear plate. */
export function isRearVehicleHit(unit, impactFrom) {
  if (!unit?.mesh || !impactFrom) return false;
  const dx = impactFrom.x - unit.position.x;
  const dz = impactFrom.z - unit.position.z;
  const length = Math.hypot(dx, dz);
  if (length < 0.001) return false;

  const yaw = unit.mesh.rotation?.y ?? 0;
  const rearX = -Math.sin(yaw);
  const rearZ = -Math.cos(yaw);
  return (dx / length) * rearX + (dz / length) * rearZ >= Math.cos((55 * Math.PI) / 180);
}

/** Classify a lethal armored-vehicle hit before wreck visuals are applied. */
export function classifyVehicleKnockout(unit, opts = {}, random = Math.random) {
  if (!isBailoutVehicleType(unit?.def?.type)) {
    return { rearHit: false, catastrophic: false, recoverable: false };
  }

  const rearHit = isRearVehicleHit(unit, opts.impactFrom);
  const catastrophic = rearHit && random() < REAR_CHAIN_REACTION_CHANCE;
  const recoverable = !catastrophic && random() < VEHICLE_BAILOUT_CHANCE;
  return { rearHit, catastrophic, recoverable };
}
