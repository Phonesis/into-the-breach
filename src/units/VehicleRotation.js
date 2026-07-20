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

/** Constant angular velocity, unlike lerpAngle which turns faster across large angles. */
export function moveAngleToward(current, target, maxDelta) {
  const delta = normalizeAngle(target - current);
  if (Math.abs(delta) <= maxDelta) return normalizeAngle(target);
  return normalizeAngle(current + Math.sign(delta) * maxDelta);
}

export function hasTurretPivot(mesh) {
  return mesh?.userData?.turretPivot?.isObject3D === true;
}

export function hasIndependentMgPivot(mesh) {
  return mesh?.userData?.independentMgPivot?.isObject3D === true;
}

const HULL_SLEW_RATE = 5.5;
const FIXED_WEAPON_SLEW_RATE = 4.2;
const DEG_TO_RAD = Math.PI / 180;
const DEFAULT_INDEPENDENT_MG_TRAVERSE_DEG = 105;
const DEFAULT_TURRET_TRAVERSE_DEG = {
  armoredCar: 26,
  tank: 18,
  tankDestroyer: 6,
  superHeavyTank: 10,
};

function getTurretTraverseRate(unit) {
  const degreesPerSecond =
    unit?.def?.turretTraverseDeg ??
    DEFAULT_TURRET_TRAVERSE_DEG[unit?.def?.type] ??
    DEFAULT_TURRET_TRAVERSE_DEG.tank;
  return Math.max(1, degreesPerSecond) * DEG_TO_RAD;
}

function getTargetWorldYaw(unit, target) {
  const tx = target.position?.x ?? target.mesh?.position?.x;
  const tz = target.position?.z ?? target.mesh?.position?.z;
  if (!Number.isFinite(tx) || !Number.isFinite(tz)) return null;
  return Math.atan2(tx - unit.position.x, tz - unit.position.z);
}

function getIndependentMgAim(unit, target) {
  const pivot = unit?.mesh?.userData?.independentMgPivot;
  const worldYaw = getTargetWorldYaw(unit, target);
  if (!pivot || worldYaw == null) return null;

  let parentWorldYaw = unit.mesh.rotation.y ?? 0;
  let parent = pivot.parent;
  while (parent && parent !== unit.mesh) {
    parentWorldYaw += parent.rotation?.y ?? 0;
    parent = parent.parent;
  }

  const baseYaw = pivot.userData.mgBaseYaw ?? 0;
  const traverseArc = Math.min(
    TWO_PI,
    Math.max(1, pivot.userData.mgTraverseArcDeg ?? 360) * DEG_TO_RAD
  );
  const desiredLocalYaw = normalizeAngle(worldYaw - parentWorldYaw);
  const fromBase = normalizeAngle(desiredLocalYaw - baseYaw);
  const halfArc = traverseArc * 0.5;
  const withinArc = Math.abs(fromBase) <= halfArc + 1e-5;
  const constrainedYaw = normalizeAngle(
    baseYaw + Math.max(-halfArc, Math.min(halfArc, fromBase))
  );
  return { pivot, desiredLocalYaw, constrainedYaw, withinArc };
}

/** Traverse a pintle/roof MG without changing the cannon turret or hull yaw. */
export function faceIndependentMgTowardTarget(unit, target, dt) {
  const aim = getIndependentMgAim(unit, target);
  if (!aim) return false;
  const rate =
    Math.max(
      1,
      aim.pivot.userData.mgTraverseRateDeg ?? DEFAULT_INDEPENDENT_MG_TRAVERSE_DEG
    ) * DEG_TO_RAD;
  aim.pivot.rotation.y = moveAngleToward(
    aim.pivot.rotation.y,
    aim.constrainedYaw,
    rate * Math.max(0, dt)
  );
  return aim.withinArc;
}

export function canIndependentMgBearOnTarget(unit, target) {
  const aim = getIndependentMgAim(unit, target);
  if (!aim?.withinArc) return false;
  return (
    Math.abs(normalizeAngle(aim.desiredLocalYaw - aim.pivot.rotation.y)) <= 0.1
  );
}

export function slewHullYaw(mesh, targetYaw, dt, rate = HULL_SLEW_RATE) {
  mesh.rotation.y = lerpAngle(mesh.rotation.y, targetYaw, rate * dt);
}

export function slewTurretToward(
  mesh,
  worldYaw,
  dt,
  radiansPerSecond = DEFAULT_TURRET_TRAVERSE_DEG.tank * DEG_TO_RAD
) {
  const pivot = mesh.userData.turretPivot;
  if (!pivot) {
    slewHullYaw(mesh, worldYaw, dt, FIXED_WEAPON_SLEW_RATE);
    return;
  }
  const localYaw = normalizeAngle(worldYaw - mesh.rotation.y);
  pivot.rotation.y = moveAngleToward(
    pivot.rotation.y,
    localYaw,
    radiansPerSecond * Math.max(0, dt)
  );
}

export function faceUnitTowardTarget(unit, target, dt) {
  const worldYaw = getTargetWorldYaw(unit, target);
  if (worldYaw == null) return;

  if (hasTurretPivot(unit.mesh)) {
    slewTurretToward(unit.mesh, worldYaw, dt, getTurretTraverseRate(unit));
    return;
  }

  // A fixed-casemate vehicle cannot pivot its hull after losing a track.
  if (unit._mobilityDamaged) return;

  // Towed guns / foot teams: hull faces travel direction while repositioning.
  if (unit.moveTarget) return;

  slewHullYaw(unit.mesh, worldYaw, dt, FIXED_WEAPON_SLEW_RATE);
}

export function canWeaponBearOnTarget(unit, target, maxFixedArc = 0.3) {
  const worldYaw = getTargetWorldYaw(unit, target);
  if (worldYaw == null) return false;
  if (hasTurretPivot(unit.mesh)) {
    const desiredLocalYaw = normalizeAngle(worldYaw - unit.mesh.rotation.y);
    const currentLocalYaw = unit.mesh.userData.turretPivot.rotation.y;
    const tolerance = unit.def?.type === 'armoredCar' ? 0.1 : 0.065;
    return Math.abs(normalizeAngle(desiredLocalYaw - currentLocalYaw)) <= tolerance;
  }
  if (!unit?._mobilityDamaged) return true;
  return Math.abs(normalizeAngle(worldYaw - (unit.mesh.rotation.y ?? 0))) <= maxFixedArc;
}

export function faceUnitTowardMovement(unit, nx, nz, dt) {
  const yaw = Math.atan2(nx, nz);
  if (hasTurretPivot(unit.mesh)) {
    slewHullYaw(unit.mesh, yaw, dt);
    return;
  }
  slewHullYaw(unit.mesh, yaw, dt, 9.5);
}

/** Instant snap for cinematics / deploy facing — keeps turret aligned with hull. */
export function snapUnitYaw(unit, worldYaw) {
  if (hasTurretPivot(unit.mesh)) {
    unit.mesh.rotation.y = worldYaw;
    unit.mesh.userData.turretPivot.rotation.y = 0;
    const mgPivot = unit.mesh.userData.independentMgPivot;
    if (mgPivot) mgPivot.rotation.y = mgPivot.userData.mgBaseYaw ?? 0;
    return;
  }
  unit.mesh.rotation.y = worldYaw;
  const mgPivot = unit.mesh?.userData?.independentMgPivot;
  if (mgPivot) mgPivot.rotation.y = mgPivot.userData.mgBaseYaw ?? 0;
}
