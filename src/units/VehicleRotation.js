const TWO_PI = Math.PI * 2;

export function normalizeAngle(angle) {
  let a = angle % TWO_PI;
  if (a > Math.PI) a -= TWO_PI;
  if (a < -Math.PI) a += TWO_PI;
  return a;
}

export function lerpAngle(current, target, alpha) {
  const delta = normalizeAngle(target - current);
  return normalizeAngle(current + delta * Math.min(1, alpha));
}

export function hasTurretPivot(mesh) {
  return mesh?.userData?.turretPivot?.isObject3D === true;
}

const HULL_SLEW_RATE = 5.5;
const TURRET_SLEW_RATE = 4.2;

export function slewHullYaw(mesh, targetYaw, dt, rate = HULL_SLEW_RATE) {
  mesh.rotation.y = lerpAngle(mesh.rotation.y, targetYaw, rate * dt);
}

export function slewTurretToward(mesh, worldYaw, dt, rate = TURRET_SLEW_RATE) {
  const pivot = mesh.userData.turretPivot;
  if (!pivot) {
    slewHullYaw(mesh, worldYaw, dt, rate);
    return;
  }
  const localYaw = normalizeAngle(worldYaw - mesh.rotation.y);
  pivot.rotation.y = lerpAngle(pivot.rotation.y, localYaw, rate * dt);
}

export function faceUnitTowardTarget(unit, target, dt) {
  const tx = target.position?.x ?? target.mesh.position.x;
  const tz = target.position?.z ?? target.mesh.position.z;
  const dx = tx - unit.position.x;
  const dz = tz - unit.position.z;
  const worldYaw = Math.atan2(dx, dz);

  if (hasTurretPivot(unit.mesh)) {
    slewTurretToward(unit.mesh, worldYaw, dt);
    return;
  }

  // Towed guns / foot teams: hull faces travel direction while repositioning.
  if (unit.moveTarget) return;

  slewHullYaw(unit.mesh, worldYaw, dt, TURRET_SLEW_RATE);
}

export function faceUnitTowardMovement(unit, nx, nz, dt) {
  const yaw = Math.atan2(nx, nz);
  if (hasTurretPivot(unit.mesh)) {
    slewHullYaw(unit.mesh, yaw, dt);
    return;
  }
  unit.mesh.rotation.y = yaw;
}

/** Instant snap for cinematics / deploy facing — keeps turret aligned with hull. */
export function snapUnitYaw(unit, worldYaw) {
  if (hasTurretPivot(unit.mesh)) {
    unit.mesh.rotation.y = worldYaw;
    unit.mesh.userData.turretPivot.rotation.y = 0;
    return;
  }
  unit.mesh.rotation.y = worldYaw;
}