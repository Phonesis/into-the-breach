import { isVehicleUnit } from '../units/VehicleTypes.js';
import { unitPathRadius } from './MovePath.js';

// Leave a small visible gap between hulls and wrecks. The path radius is the
// existing gameplay/collision footprint, so this does not change vehicle
// visuals or effects; it only prevents physical vehicle bodies from stacking.
const VEHICLE_SEPARATION_GAP = 0.35;
const COLLISION_EPSILON = 1e-6;

function isCollidableVehicle(unit) {
  return !!(
    unit &&
    unit.position &&
    isVehicleUnit(unit.def?.type) &&
    // A wreck that has been flattened by sustained contact remains visible and
    // provides cover, but its low profile can now be driven over.
    !(unit.dead && unit._wreckCrushed) &&
    // Dead vehicles remain blockers while their wreck mesh is still on the
    // battlefield. Dead units whose mesh has been removed are no longer
    // physical obstacles.
    (!unit.dead || !!unit.mesh?.parent) &&
    !unit._mountedOnTankId
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
    unit.moveTarget
  );
}

function isPushableWreck(unit) {
  return !!unit && (unit.dead || unit._crewless);
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
  return Math.max(
    0.04,
    Math.min(
      0.5,
      wreckPushResistance(wreck.def?.type) * vehiclePushForce(vehicle.def?.type)
    )
  );
}

function recordWreckImpact(wreck, vehicle, displacement, directionX, directionZ, options) {
  if (!wreck?.dead) return;

  wreck._wreckImpactCount = (wreck._wreckImpactCount ?? 0) + 1;
  const meaningfulImpact = displacement >= 0.18 || wreck._wreckImpactCount >= 3;
  if (!meaningfulImpact || wreck._wreckCrushed) return;

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
    // If the unit is touching the other hull and moving away, it is already
    // valid. If it is inside or moving back toward the hull, stop immediately.
    const towardOther = dx * (cx - ax) + dz * (cz - az);
    return c < 0 || towardOther > COLLISION_EPSILON ? 0 : null;
  }

  const bTerm = 2 * (fx * dx + fz * dz);
  const discriminant = bTerm * bTerm - 4 * segmentLengthSq * c;
  if (discriminant < 0) return null;

  const root = (-bTerm - Math.sqrt(discriminant)) / (2 * segmentLengthSq);
  return root >= 0 && root <= 1 ? root : null;
}

function pushWreckAhead(vehicle, wreck, fromX, fromZ, toX, toZ, hit, requiredDistance, options) {
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const travelDistance = Math.hypot(dx, dz);
  if (travelDistance <= COLLISION_EPSILON) return false;

  const directionX = dx / travelDistance;
  const directionZ = dz / travelDistance;
  const contactDistance = Math.max(0, Math.min(travelDistance, travelDistance * hit));
  const remainingDistance = Math.max(0, travelDistance - contactDistance);
  const pushDistance = remainingDistance * getWreckPushFraction(vehicle, wreck);
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
  let firstWreckCollision = null;
  for (const other of units ?? []) {
    if (other === unit || !isCollidableVehicle(other)) continue;

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
    } else {
      firstLiveVehicleHit = Math.min(firstLiveVehicleHit, hit);
    }
  }

  let pushedWreck = false;
  let allowedTravel = travelDistance;
  if (firstWreckCollision && firstWreckCollision.hit < firstLiveVehicleHit) {
    const pushResult = pushWreckAhead(
      unit,
      firstWreckCollision.wreck,
      fromX,
      fromZ,
      toX,
      toZ,
      firstWreckCollision.hit,
      firstWreckCollision.requiredDistance,
      options
    );
    if (pushResult?.pushed) {
      pushedWreck = true;
      // A heavy wreck should slow the vehicle as it moves it. Keep the hull
      // response and the wreck response in the same incremental step so the
      // wreck cannot jump ahead while the vehicle carries on at full speed.
      allowedTravel = Math.min(allowedTravel, pushResult.vehicleTravel);
    }
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
