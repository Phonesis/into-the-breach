import { isTankType, isVehicleUnit } from '../units/VehicleTypes.js';
import { unitPathRadius } from './MovePath.js';
import { advanceUnitOnTerrain } from '../world/Terrain.js';

// Leave a small visible gap between hulls and wrecks. The path radius is the
// existing gameplay/collision footprint, so this does not change vehicle
// visuals or effects; it only prevents physical vehicle bodies from stacking.
const VEHICLE_SEPARATION_GAP = 0.35;
const COLLISION_EPSILON = 1e-6;
const TRAFFIC_YIELD_EXTRA_CLEARANCE = 0.8;
const TRAFFIC_YIELD_REACH = 0.75;
const TRAFFIC_YIELD_TURN_RATE = 0.9;
const WRECK_TRAVERSAL_HEIGHT = Object.freeze({
  superHeavyTank: 0.72,
  tankDestroyer: 0.58,
  tank: 0.56,
  artillery: 0.38,
  antiTankGun: 0.32,
  armoredCar: 0.34,
});
const VEHICLE_MASS_CLASS = Object.freeze({
  antiTankGun: 0.7,
  armoredCar: 1,
  artillery: 1.15,
  tank: 2.6,
  tankDestroyer: 3,
  superHeavyTank: 4,
});
const WRECK_DAMAGE_VULNERABILITY = Object.freeze({
  antiTankGun: 0.38,
  armoredCar: 0.42,
  artillery: 0.32,
  tank: 0.14,
  tankDestroyer: 0.12,
  superHeavyTank: 0.09,
});
const TRACKED_ARMOR_TYPES = new Set(['tank', 'tankDestroyer', 'superHeavyTank']);
const GUN_RUBBLE_TYPES = new Set(['antiTankGun', 'artillery']);

function isPhysicalVehicle(unit) {
  return !!(
    unit?.position &&
    isVehicleUnit(unit.def?.type) &&
    (!unit.dead || !!unit.mesh?.parent) &&
    !unit._mountedOnTankId
  );
}

function isCollidableVehicle(unit) {
  return !!(
    isPhysicalVehicle(unit) &&
    // Generic overlap repair ignores a flattened wreck. Movement-segment
    // collision below applies the mover-versus-wreck mass check explicitly.
    !(unit.dead && unit._wreckCrushed) &&
    // Dead vehicles remain blockers while their wreck mesh is still on the
    // battlefield. Dead units whose mesh has been removed are no longer
    // physical obstacles.
    (!unit.dead || !!unit.mesh?.parent)
  );
}

function getCollisionRadius(unit) {
  return unitPathRadius(unit.def?.type);
}

function isActivelyMovingVehicle(unit) {
  return !!(
    unit &&
    !unit.dead &&
    !unit.surrendered &&
    !unit._captureExit &&
    !unit._crewless &&
    (unit.moveTarget || unit._trafficYield)
  );
}

function canYieldToFriendlyTraffic(unit) {
  return !!(
    unit &&
    !unit.dead &&
    !unit.surrendered &&
    !unit._captureExit &&
    !unit._crewless &&
    !unit._mobilityDamaged &&
    !unit.retreating &&
    !unit.moveTarget &&
    !unit._trafficYield
  );
}

function isYieldPointClear(unit, requester, units, x, z, options) {
  const radius = getCollisionRadius(unit);
  const half = (options?.mapDef?.size ?? 120) * 0.5 - radius - 1;
  if (Math.abs(x) > half || Math.abs(z) > half) return false;
  if (
    options?.scenery?.getUnitPlacementBlocker?.(x, z, radius, {
      allowTrackedBuildingCrush: false,
    })
  ) {
    return false;
  }

  for (const other of units ?? []) {
    if (other === unit || other === requester || !isPhysicalVehicle(other)) continue;
    const separation =
      radius + getCollisionRadius(other) + VEHICLE_SEPARATION_GAP;
    if (Math.hypot(x - other.position.x, z - other.position.z) < separation) {
      return false;
    }
    if (
      firstSegmentCircleHit(
        unit.position.x,
        unit.position.z,
        x,
        z,
        other.position.x,
        other.position.z,
        separation
      ) !== null
    ) {
      return false;
    }
  }
  return true;
}

function requestFriendlyTrafficYield(
  requester,
  blocker,
  units,
  directionX,
  directionZ,
  options
) {
  if (
    requester?._trafficYield ||
    blocker?.team !== requester?.team ||
    !canYieldToFriendlyTraffic(blocker)
  ) {
    return false;
  }

  const length = Math.hypot(directionX, directionZ);
  if (length <= COLLISION_EPSILON) return false;
  const forwardX = directionX / length;
  const forwardZ = directionZ / length;
  const sideX = -forwardZ;
  const sideZ = forwardX;
  const clearance =
    getCollisionRadius(requester) +
    getCollisionRadius(blocker) +
    VEHICLE_SEPARATION_GAP +
    TRAFFIC_YIELD_EXTRA_CLEARANCE;

  // Prefer a pure lateral pull-out. The two slightly forward alternatives
  // help a blocker beside a wall find room without backing into the requester.
  const candidates = [
    { side: 1, forward: 0 },
    { side: -1, forward: 0 },
    { side: 1, forward: 0.45 },
    { side: -1, forward: 0.45 },
  ];
  for (const candidate of candidates) {
    const x =
      blocker.position.x +
      sideX * clearance * candidate.side +
      forwardX * clearance * candidate.forward;
    const z =
      blocker.position.z +
      sideZ * clearance * candidate.side +
      forwardZ * clearance * candidate.forward;
    if (!isYieldPointClear(blocker, requester, units, x, z, options)) continue;
    blocker._trafficYield = {
      requesterId: requester.id,
      originX: blocker.position.x,
      originZ: blocker.position.z,
      asideX: x,
      asideZ: z,
      phase: 'aside',
    };
    blocker._reverseMoveOrder = false;
    return true;
  }
  return false;
}

function isTrafficYieldOriginClear(unit, units, state) {
  const radius = getCollisionRadius(unit);
  for (const other of units ?? []) {
    if (other === unit || !isPhysicalVehicle(other)) continue;
    const separation =
      radius + getCollisionRadius(other) + VEHICLE_SEPARATION_GAP + 0.25;
    if (
      Math.hypot(state.originX - other.position.x, state.originZ - other.position.z) <
      separation
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Temporarily pull an idle friendly vehicle/gun out of a moving unit's lane,
 * wait for the lane to clear, then return it to its exact starting position.
 * This does not replace its combat order; a newly assigned move order cancels
 * the transient yield immediately.
 */
export function updateFriendlyTrafficYield(unit, units, mapDef, dt, options = {}) {
  const state = unit?._trafficYield;
  if (!state) return false;
  if (
    unit.dead ||
    unit.surrendered ||
    unit._captureExit ||
    unit._crewless ||
    unit._mobilityDamaged ||
    unit.retreating ||
    unit.moveTarget
  ) {
    unit._trafficYield = null;
    unit._reverseMoveOrder = false;
    return false;
  }

  if (state.phase === 'wait') {
    if (!isTrafficYieldOriginClear(unit, units, state)) return true;
    state.phase = 'return';
    // Tracked vehicles can back into the position they just vacated instead
    // of spending a long time rotating 180 degrees in the cleared lane.
    unit._reverseMoveOrder = isTankType(unit.def?.type);
  }

  const target = state.phase === 'aside'
    ? { x: state.asideX, z: state.asideZ }
    : { x: state.originX, z: state.originZ };
  const beforeX = unit.position.x;
  const beforeY = unit.position.y;
  const beforeZ = unit.position.z;
  const targetDx = target.x - beforeX;
  const targetDz = target.z - beforeZ;
  const reverseIntoOrigin = state.phase === 'return' && isTankType(unit.def?.type);
  const desiredYaw = Math.atan2(
    reverseIntoOrigin ? -targetDx : targetDx,
    reverseIntoOrigin ? -targetDz : targetDz
  );
  const yawBeforeMove = unit.mesh?.rotation?.y ?? desiredYaw;
  const turnDelta = Math.abs(
    Math.atan2(
      Math.sin(desiredYaw - yawBeforeMove),
      Math.cos(desiredYaw - yawBeforeMove)
    )
  );
  advanceUnitOnTerrain(unit, target, mapDef, dt, { horizReach: TRAFFIC_YIELD_REACH });
  // A traffic-clearing tank should pivot, then pull straight out. Allowing it
  // to start driving during a large turn creates a broad arc through the very
  // lane it is meant to clear and can send it circling around the side point.
  if (isTankType(unit.def?.type) && turnDelta > 0.28) {
    unit.position.x = beforeX;
    unit.position.y = beforeY;
    unit.position.z = beforeZ;
    if (unit.mesh) {
      const signedTurn = Math.atan2(
        Math.sin(desiredYaw - yawBeforeMove),
        Math.cos(desiredYaw - yawBeforeMove)
      );
      unit.mesh.rotation.y = yawBeforeMove + Math.max(
        -TRAFFIC_YIELD_TURN_RATE * dt,
        Math.min(TRAFFIC_YIELD_TURN_RATE * dt, signedTurn)
      );
    }
  }
  clampVehicleMoveAgainstUnits(unit, units, beforeX, beforeZ, {
    ...options,
    mapDef,
    dt,
    ignoreVehicleId: state.requesterId,
  });

  const moved = Math.hypot(unit.position.x - beforeX, unit.position.z - beforeZ) > 0.01;
  if (moved && options?.scenery) {
    const blocked = options.scenery.blockVehicleAtBuildings?.(
      unit,
      beforeX,
      beforeZ,
      getCollisionRadius(unit),
      {
        vehicleClass: unit.def?.type === 'armoredCar' ? 'light' : 'tracked',
        directionX: unit.position.x - beforeX,
        directionZ: unit.position.z - beforeZ,
      }
    );
    if (blocked) {
      unit.position.x = beforeX;
      unit.position.z = beforeZ;
      // A candidate was clear when chosen but its short segment was not. Let
      // ordinary traffic retry later instead of leaving a permanent side order.
      unit._trafficYield = null;
      unit._reverseMoveOrder = false;
      return false;
    }
  }

  if (Math.hypot(unit.position.x - target.x, unit.position.z - target.z) <= TRAFFIC_YIELD_REACH) {
    unit.position.x = target.x;
    unit.position.z = target.z;
    if (state.phase === 'aside') state.phase = 'wait';
    else {
      unit._trafficYield = null;
      unit._reverseMoveOrder = false;
    }
  }
  return true;
}

function isPushableWreck(unit) {
  return !!unit && (unit.dead || unit._crewless);
}

function canVehicleOverrunWreckClass(vehicle, wreck) {
  const moverType = vehicle?.def?.type;
  const wreckType = wreck?.def?.type;
  if (!moverType || !wreckType) return false;

  // Wheeled scout cars can clamber over collapsed light vehicles and gun
  // carriages, but not an armored fighting vehicle hull.
  if (moverType === 'armoredCar') {
    return wreckType === 'armoredCar' || wreckType === 'antiTankGun';
  }
  // Towed pieces are not wreck-crushing vehicles. At most they can cross a
  // flattened light gun carriage.
  if (moverType === 'artillery' || moverType === 'antiTankGun') {
    return wreckType === 'antiTankGun';
  }

  // Tracked armor can flatten light wheeled wrecks and gun carriages, but an
  // armored fighting vehicle hull remains an obstacle regardless of the
  // moving tank's weight. Tank wrecks may still be nudged by impact momentum.
  if (TRACKED_ARMOR_TYPES.has(moverType)) {
    return wreckType === 'armoredCar' || GUN_RUBBLE_TYPES.has(wreckType);
  }

  return false;
}

function canTrackedArmorOverrunLiveGun(vehicle, other) {
  return !!(
    TRACKED_ARMOR_TYPES.has(vehicle?.def?.type) &&
    other &&
    !other.dead &&
    other.team !== vehicle.team &&
    GUN_RUBBLE_TYPES.has(other.def?.type)
  );
}

export function canVehicleTraverseWreck(vehicle, wreck) {
  return !!(
    wreck?.dead &&
    wreck._wreckCrushed &&
    wreck.position &&
    wreck.mesh?.parent &&
    isVehicleUnit(wreck.def?.type) &&
    canVehicleOverrunWreckClass(vehicle, wreck)
  );
}

function getWreckRunOverSeverity(vehicle, wreck) {
  const moverMass = VEHICLE_MASS_CLASS[vehicle?.def?.type] ?? 0;
  const wreckMass = VEHICLE_MASS_CLASS[wreck?.def?.type] ?? 1;
  const massRatio = moverMass / Math.max(0.1, wreckMass);
  const vulnerability = WRECK_DAMAGE_VULNERABILITY[wreck?.def?.type] ?? 0.18;
  return Math.max(0.05, Math.min(0.75, vulnerability * Math.min(1.7, massRatio)));
}

function initialMomentumPushDistance(vehicle, wreck, segmentDistance, dt) {
  if (!TRACKED_ARMOR_TYPES.has(vehicle?.def?.type)) return 0;
  if (!Number.isFinite(dt) || dt <= 0 || segmentDistance <= 0) return 0;
  const actualSpeed = segmentDistance / dt;
  const speedRatio = actualSpeed / Math.max(0.1, vehicle.def?.speed ?? actualSpeed);
  if (speedRatio < 0.7) return 0;
  const moverMass = VEHICLE_MASS_CLASS[vehicle.def?.type] ?? 1;
  const wreckMass = VEHICLE_MASS_CLASS[wreck?.def?.type] ?? 1;
  const massResponse = Math.max(0.35, Math.min(1.5, moverMass / wreckMass));
  return Math.min(0.24, (speedRatio - 0.55) * 0.28 * massResponse);
}

function applyInitialWreckMomentum(
  vehicle,
  wreck,
  directionX,
  directionZ,
  segmentDistance,
  options
) {
  const impulse = initialMomentumPushDistance(
    vehicle,
    wreck,
    segmentDistance,
    options?.dt
  );
  if (impulse <= COLLISION_EPSILON) return 0;
  wreck.position.x += directionX * impulse;
  wreck.position.z += directionZ * impulse;
  if (options?.mapDef) {
    wreck.position.y = options.sampleTerrainHeight?.(
      wreck.position.x,
      wreck.position.z,
      options.mapDef
    ) ?? wreck.position.y;
  }
  return impulse;
}

function wreckPushResistance(type) {
  if (type === 'superHeavyTank') return 0.08;
  if (type === 'tankDestroyer') return 0.12;
  if (type === 'tank') return 0.14;
  if (type === 'artillery') return 0.22;
  if (type === 'antiTankGun') return 0.28;
  if (type === 'armoredCar') return 0.34;
  return 0.24;
}

function vehiclePushForce(type) {
  if (type === 'superHeavyTank') return 1.45;
  if (type === 'tankDestroyer') return 1.15;
  if (type === 'tank') return 1;
  if (type === 'artillery') return 0.8;
  if (type === 'antiTankGun') return 0.72;
  if (type === 'armoredCar') return 0.78;
  return 0.7;
}

function getWreckPushFraction(vehicle, wreck) {
  const baseFraction = Math.max(
    0.04,
    Math.min(
      0.5,
      wreckPushResistance(wreck.def?.type) * vehiclePushForce(vehicle.def?.type)
    )
  );
  if (canVehicleOverrunWreckClass(vehicle, wreck)) return baseFraction;
  // An under-mass vehicle can nudge a heavy wreck under sustained contact, but
  // cannot shove it ahead quickly enough to masquerade as driving through it.
  return Math.max(0.006, Math.min(0.025, baseFraction * 0.12));
}

function recordWreckImpact(wreck, vehicle, displacement, directionX, directionZ, options) {
  if (!wreck?.dead) return;

  wreck._wreckImpactCount = (wreck._wreckImpactCount ?? 0) + 1;
  const meaningfulImpact = displacement >= 0.18 || wreck._wreckImpactCount >= 3;
  if (!meaningfulImpact || wreck._wreckCrushed) return;
  if (!canVehicleOverrunWreckClass(vehicle, wreck)) return;

  // A vehicle that has been run over is no longer a recoverable knockout.
  wreck._wreckCrushed = true;
  wreck._recoverableWreck = false;
  wreck._wreckRepairProgress = 0;
  options?.onVehicleWreckCrushed?.(wreck, vehicle, {
    displacement,
    directionX,
    directionZ,
  });
}

function recordWreckRunOver(wreck, vehicle, directionX, directionZ, options) {
  if (!canVehicleTraverseWreck(vehicle, wreck)) return;
  const reducedToRubble =
    TRACKED_ARMOR_TYPES.has(vehicle?.def?.type) &&
    GUN_RUBBLE_TYPES.has(wreck?.def?.type);
  const severity = reducedToRubble ? 0.75 : getWreckRunOverSeverity(vehicle, wreck);
  wreck._wreckImpactCount = (wreck._wreckImpactCount ?? 0) + 1;
  wreck._wreckRunOverCount = (wreck._wreckRunOverCount ?? 0) + 1;
  wreck._wreckReducedToRubble ||= reducedToRubble;
  wreck._wreckRunOverDamage = reducedToRubble
    ? 1
    : Math.min(1, (wreck._wreckRunOverDamage ?? 0) + severity);
  options?.onVehicleWreckRunOver?.(wreck, vehicle, {
    directionX,
    directionZ,
    severity,
    totalDamage: wreck._wreckRunOverDamage,
    reducedToRubble,
  });
}

/**
 * Treat a flattened wreck as a low mound instead of deleting its physical
 * presence. This pose is consumed by Terrain.updateUnitTerrainPose(), which
 * blends it with the actual ground slope so a hull climbs nose-first, levels
 * over the wreck, then pitches down on the far side.
 */
export function updateVehicleWreckTraversalPose(unit, units, options = {}) {
  if (!unit || unit.dead || !isVehicleUnit(unit.def?.type)) return null;

  const yaw = unit.mesh?.rotation?.y ?? 0;
  const forwardX = Math.sin(yaw);
  const forwardZ = Math.cos(yaw);
  const rightX = Math.cos(yaw);
  const rightZ = -Math.sin(yaw);
  const unitRadius = getCollisionRadius(unit);
  let best = null;

  for (const wreck of units ?? []) {
    if (wreck === unit || !canVehicleTraverseWreck(unit, wreck)) continue;
    const dx = wreck.position.x - unit.position.x;
    const dz = wreck.position.z - unit.position.z;
    const centerDistance = Math.hypot(dx, dz);
    const supportRadius = Math.max(
      1.2,
      unitRadius * 0.72 + getCollisionRadius(wreck) * 0.78
    );
    if (centerDistance >= supportRadius) continue;

    const normalized = centerDistance / supportRadius;
    // Cosine support gives zero height and slope at the outer edge, avoiding a
    // pop as the first track touches or leaves the wreck.
    const support = 0.5 + 0.5 * Math.cos(normalized * Math.PI);
    const height = WRECK_TRAVERSAL_HEIGHT[wreck.def?.type] ?? 0.4;
    const lift = height * support;
    if (best && best.lift >= lift) continue;

    const forwardDistance = dx * forwardX + dz * forwardZ;
    const sideDistance = dx * rightX + dz * rightZ;
    const slopeStrength = Math.sin(normalized * Math.PI);
    best = {
      wreck,
      lift,
      // Negative rotation.x raises the nose in Three's YXZ vehicle pose.
      pitch: -Math.sign(forwardDistance || 1) * slopeStrength * 0.24,
      roll: Math.sign(sideDistance || 1) * slopeStrength * 0.11,
    };
  }

  const previousWreckId = unit._wreckTraversalWreckId ?? null;
  const nextWreckId = best?.wreck?.id ?? null;
  if (best && previousWreckId !== nextWreckId) {
    const rawMoveX = Number(options.directionX) || 0;
    const rawMoveZ = Number(options.directionZ) || 0;
    const movementDistance = Math.hypot(rawMoveX, rawMoveZ);
    const moveX = movementDistance > COLLISION_EPSILON ? rawMoveX : forwardX;
    const moveZ = movementDistance > COLLISION_EPSILON ? rawMoveZ : forwardZ;
    const length = Math.hypot(moveX, moveZ) || 1;
    applyInitialWreckMomentum(
      unit,
      best.wreck,
      moveX / length,
      moveZ / length,
      movementDistance,
      options
    );
    recordWreckRunOver(
      best.wreck,
      unit,
      moveX / length,
      moveZ / length,
      options
    );
  }
  unit._wreckTraversalWreckId = nextWreckId;
  unit._wreckTraversalPose = best
    ? { lift: best.lift, pitch: best.pitch, roll: best.roll }
    : null;
  return unit._wreckTraversalPose;
}

function stableSeparationNormal(a, b) {
  const aId = Number.isFinite(Number(a?.id)) ? Number(a.id) : 0;
  const bId = Number.isFinite(Number(b?.id)) ? Number(b.id) : 0;
  const angle = ((aId * 0.7548776662 + bId * 1.3247179572) % 1) * Math.PI * 2;
  return { x: Math.cos(angle), z: Math.sin(angle) };
}

function firstSegmentCircleHit(ax, az, bx, bz, cx, cz, radius) {
  const dx = bx - ax;
  const dz = bz - az;
  const segmentLengthSq = dx * dx + dz * dz;
  if (segmentLengthSq <= COLLISION_EPSILON) return null;

  const fx = ax - cx;
  const fz = az - cz;
  const c = fx * fx + fz * fz - radius * radius;

  if (c <= 0) {
    // Contact resolution can leave the moving hull microscopically inside the
    // separation radius. Always allow an order that increases (or holds) the
    // separation so the vehicle can escape on its next move order; only block
    // movement farther into the wreck.
    const towardOther = dx * (cx - ax) + dz * (cz - az);
    return towardOther > COLLISION_EPSILON ? 0 : null;
  }

  const bTerm = 2 * (fx * dx + fz * dz);
  const discriminant = bTerm * bTerm - 4 * segmentLengthSq * c;
  if (discriminant < 0) return null;

  const root = (-bTerm - Math.sqrt(discriminant)) / (2 * segmentLengthSq);
  return root >= 0 && root <= 1 ? root : null;
}

function pushWreckAhead(
  vehicle,
  wreck,
  fromX,
  fromZ,
  toX,
  toZ,
  hit,
  requiredDistance,
  options,
  initialImpact = false
) {
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const travelDistance = Math.hypot(dx, dz);
  if (travelDistance <= COLLISION_EPSILON) return false;

  const directionX = dx / travelDistance;
  const directionZ = dz / travelDistance;
  const contactDistance = Math.max(0, Math.min(travelDistance, travelDistance * hit));
  const remainingDistance = Math.max(0, travelDistance - contactDistance);
  const momentumPush = initialImpact
    ? initialMomentumPushDistance(vehicle, wreck, travelDistance, options?.dt)
    : 0;
  const pushDistance =
    remainingDistance * getWreckPushFraction(vehicle, wreck) + momentumPush;
  if (pushDistance <= COLLISION_EPSILON) return false;

  const desiredX = wreck.position.x + directionX * pushDistance;
  const desiredZ = wreck.position.z + directionZ * pushDistance;
  const displacement = Math.hypot(
    desiredX - wreck.position.x,
    desiredZ - wreck.position.z
  );
  if (displacement <= COLLISION_EPSILON) return false;

  wreck.position.x = desiredX;
  wreck.position.z = desiredZ;
  if (options?.mapDef) {
    wreck.position.y = options.sampleTerrainHeight?.(
      desiredX,
      desiredZ,
      options.mapDef
    ) ?? wreck.position.y;
  }
  recordWreckImpact(
    wreck,
    vehicle,
    displacement,
    directionX,
    directionZ,
    options
  );
  const vehicleTravel = contactDistance + pushDistance;
  const vehicleX = fromX + directionX * vehicleTravel;
  const vehicleZ = fromZ + directionZ * vehicleTravel;
  const remainingGap = Math.hypot(vehicleX - wreck.position.x, vehicleZ - wreck.position.z);
  return {
    pushed: true,
    vehicleTravel:
      remainingGap >= requiredDistance
        ? vehicleTravel
        : Math.max(0, vehicleTravel - (requiredDistance - remainingGap)),
  };
}

/**
 * Resolve a vehicle's just-computed movement segment against other vehicles:
 * live vehicles remain separated, while wrecks are pushed ahead and can be
 * crushed further.
 */
export function clampVehicleMoveAgainstUnits(
  unit,
  units,
  fromX,
  fromZ,
  options = {}
) {
  if (!isCollidableVehicle(unit)) return false;

  const toX = unit.position.x;
  const toZ = unit.position.z;
  if (
    !Number.isFinite(fromX) ||
    !Number.isFinite(fromZ) ||
    !Number.isFinite(toX) ||
    !Number.isFinite(toZ)
  ) {
    return false;
  }

  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const travelDistance = Math.hypot(dx, dz);
  if (travelDistance <= COLLISION_EPSILON) return false;

  let firstLiveVehicleHit = 1;
  let firstLiveVehicleCollision = null;
  let firstWreckCollision = null;
  for (const other of units ?? []) {
    if (other === unit || !isPhysicalVehicle(other)) continue;
    // A yielding blocker must be able to move laterally away from the vehicle
    // that requested the manoeuvre. Clamping that separating movement against
    // the requester stops it almost immediately at the original contact point.
    if (other.id === options.ignoreVehicleId) continue;
    if (canTrackedArmorOverrunLiveGun(unit, other)) continue;
    if (canVehicleTraverseWreck(unit, other)) continue;

    const requiredDistance =
      getCollisionRadius(unit) + getCollisionRadius(other) + VEHICLE_SEPARATION_GAP;
    const hit = firstSegmentCircleHit(
      fromX,
      fromZ,
      toX,
      toZ,
      other.position.x,
      other.position.z,
      requiredDistance
    );
    if (hit === null) continue;
    if (isPushableWreck(other)) {
      if (!firstWreckCollision || hit < firstWreckCollision.hit) {
        firstWreckCollision = { wreck: other, hit, requiredDistance };
      }
    } else if (hit < firstLiveVehicleHit) {
      firstLiveVehicleHit = hit;
      firstLiveVehicleCollision = { blocker: other, hit };
    }
  }

  if (
    firstLiveVehicleCollision &&
    firstLiveVehicleHit < 1 - COLLISION_EPSILON &&
    (!firstWreckCollision || firstLiveVehicleHit < firstWreckCollision.hit)
  ) {
    requestFriendlyTrafficYield(
      unit,
      firstLiveVehicleCollision.blocker,
      units,
      dx,
      dz,
      options
    );
  }

  let pushedWreck = false;
  let allowedTravel = travelDistance;
  if (firstWreckCollision && firstWreckCollision.hit < firstLiveVehicleHit) {
    const initialImpact = unit._wreckMomentumContactId !== firstWreckCollision.wreck.id;
    unit._wreckMomentumContactId = firstWreckCollision.wreck.id;
    if (
      initialImpact &&
      TRACKED_ARMOR_TYPES.has(unit.def?.type) &&
      TRACKED_ARMOR_TYPES.has(firstWreckCollision.wreck.def?.type)
    ) {
      options?.onVehicleWreckImpact?.(firstWreckCollision.wreck, unit, {
        directionX: dx / travelDistance,
        directionZ: dz / travelDistance,
        speedRatio: Math.min(
          1.5,
          travelDistance / Math.max(COLLISION_EPSILON, (options?.dt ?? 0) * (unit.def?.speed ?? 1))
        ),
      });
    }
    const pushResult = pushWreckAhead(
      unit,
      firstWreckCollision.wreck,
      fromX,
      fromZ,
      toX,
      toZ,
      firstWreckCollision.hit,
      firstWreckCollision.requiredDistance,
      options,
      initialImpact
    );
    if (pushResult?.pushed) {
      pushedWreck = true;
      // A heavy wreck should slow the vehicle as it moves it. Keep the hull
      // response and the wreck response in the same incremental step so the
      // wreck cannot jump ahead while the vehicle carries on at full speed.
      allowedTravel = Math.min(allowedTravel, pushResult.vehicleTravel);
    }
  } else {
    unit._wreckMomentumContactId = null;
  }

  if (firstLiveVehicleHit < 1 - COLLISION_EPSILON) {
    allowedTravel = Math.min(
      allowedTravel,
      travelDistance * Math.max(0, firstLiveVehicleHit - 0.002)
    );
  }

  const collisionResult = pushedWreck
    ? {
        blocked: allowedTravel < travelDistance - COLLISION_EPSILON,
        pushedWreck: true,
        wreck: firstWreckCollision.wreck,
      }
    : null;
  if (allowedTravel >= travelDistance - COLLISION_EPSILON) {
    return collisionResult ?? false;
  }

  // Stay just outside the other hull rather than allowing floating-point
  // contact to alternate between a one-pixel overlap and a one-pixel gap.
  const travelRatio = allowedTravel / travelDistance;
  unit.position.x = fromX + dx * travelRatio;
  unit.position.z = fromZ + dz * travelRatio;
  return collisionResult ?? true;
}

/**
 * Repair overlaps that already exist when a save, reinforcement, or old
 * spawn position puts vehicles or wrecks together. This runs before movement
 * so the regular building and terrain collision code can continue unchanged.
 */
export function resolveVehicleOverlaps(units, options = {}) {
  const vehicles = (units ?? []).filter(isCollidableVehicle);
  if (vehicles.length < 2) return;

  // A few passes resolve a short chain of three or more vehicles without
  // introducing a heavyweight all-frame physics solver.
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < vehicles.length - 1; i++) {
      const a = vehicles[i];
      for (let j = i + 1; j < vehicles.length; j++) {
        const b = vehicles[j];
        const dx = a.position.x - b.position.x;
        const dz = a.position.z - b.position.z;
        const distance = Math.hypot(dx, dz);
        const requiredDistance =
          getCollisionRadius(a) + getCollisionRadius(b) + VEHICLE_SEPARATION_GAP;
        if (distance >= requiredDistance) continue;

        const normal =
          distance > COLLISION_EPSILON
            ? { x: dx / distance, z: dz / distance }
            : stableSeparationNormal(a, b);
        const correction = requiredDistance - distance;
        const aMoving = isActivelyMovingVehicle(a);
        const bMoving = isActivelyMovingVehicle(b);

        const aWreck = isPushableWreck(a);
        const bWreck = isPushableWreck(b);
        if (aWreck && bMoving && !aMoving) {
          a.position.x += normal.x * correction;
          a.position.z += normal.z * correction;
          recordWreckImpact(a, b, correction, -normal.x, -normal.z, options);
        } else if (bWreck && aMoving && !bMoving) {
          b.position.x -= normal.x * correction;
          b.position.z -= normal.z * correction;
          recordWreckImpact(b, a, correction, normal.x, normal.z, options);
        } else if (aMoving && !bMoving) {
          a.position.x += normal.x * correction;
          a.position.z += normal.z * correction;
        } else if (bMoving && !aMoving) {
          b.position.x -= normal.x * correction;
          b.position.z -= normal.z * correction;
        } else {
          const halfCorrection = correction * 0.5;
          a.position.x += normal.x * halfCorrection;
          a.position.z += normal.z * halfCorrection;
          b.position.x -= normal.x * halfCorrection;
          b.position.z -= normal.z * halfCorrection;
        }
      }
    }
  }
}
