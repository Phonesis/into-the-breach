import { sampleTerrainHeight, hasReachedMoveDest } from '../world/Terrain.js';
import { clearRetreat } from './RetreatBehavior.js';
import {
  getMoveReachConfig,
  isVehicleUnit,
  TANK_TYPES,
} from '../units/VehicleTypes.js';
import {
  getUrbanRoadExtent,
  getUrbanStreetSpacing,
  nearestUrbanRoadCenter,
  urbanRoadHalfWidth,
} from '../world/UrbanLayout.js';
import { buildUrbanRoadPath, isUrbanRoadPoint } from './UrbanRoadPath.js';

const DEFAULT_SEGMENT_LEN = 7;
const RIDGE_HEIGHT_DELTA = 2.4;
/** Coarser grid → smoother street-centre routes, less façade hugging. */
const PATH_CELL = 5.5;
const MAX_PATH_NODES = 900;
const MAX_PATH_EXPANSIONS = 1800;

function pathGridConfig(mapDef) {
  const mapHalf = Math.max(12, (mapDef.size ?? 120) * 0.5 - 2);
  if (mapDef.terrain !== 'urban') {
    return { half: mapHalf, cell: PATH_CELL };
  }

  // Berlin's streets form a regular lattice. Make cell centres land on every
  // street centre (rather than sampling the narrow carriageways at arbitrary
  // offsets, which can make a valid road appear completely blocked).
  const spacing = getUrbanStreetSpacing(mapDef);
  const subdivisions = Math.max(4, Math.round(spacing / 3.5));
  const cell = spacing / subdivisions;
  const roadExtent = getUrbanRoadExtent(mapDef);
  const coveredHalf = Math.max(mapHalf, roadExtent);
  const half = (Math.ceil(coveredHalf / cell) + 0.5) * cell;
  return { half, cell };
}

/** Build terrain-aware waypoints so units climb ridges instead of stopping in valleys. */
export function buildTerrainMovePath(fromX, fromZ, toX, toZ, mapDef, segmentLen = DEFAULT_SEGMENT_LEN) {
  if (!mapDef) return [{ x: toX, z: toZ }];

  const dist = Math.hypot(toX - fromX, toZ - fromZ);
  if (dist < 0.5) return [{ x: toX, z: toZ }];

  const seg = segmentLen > 0 ? segmentLen : DEFAULT_SEGMENT_LEN;
  const steps = Math.max(2, Math.ceil(dist / seg));
  const waypoints = [];
  let prevY = sampleTerrainHeight(fromX, fromZ, mapDef);
  let prevX = fromX;
  let prevZ = fromZ;

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = fromX + (toX - fromX) * t;
    const z = fromZ + (toZ - fromZ) * t;
    const y = sampleTerrainHeight(x, z, mapDef);

    if (Math.abs(y - prevY) >= RIDGE_HEIGHT_DELTA) {
      if (waypoints.length === 0 || waypoints[waypoints.length - 1].x !== prevX) {
        waypoints.push({ x: prevX, z: prevZ });
      }
      waypoints.push({ x, z });
    }

    prevY = y;
    prevX = x;
    prevZ = z;
  }

  const last = waypoints[waypoints.length - 1];
  if (!last || last.x !== toX || last.z !== toZ) {
    waypoints.push({ x: toX, z: toZ });
  }

  return waypoints.length ? waypoints : [{ x: toX, z: toZ }];
}

function worldToCell(x, z, half, cell) {
  return {
    ix: Math.floor((x + half) / cell),
    iz: Math.floor((z + half) / cell),
  };
}

function cellToWorld(ix, iz, half, cell) {
  return {
    x: -half + (ix + 0.5) * cell,
    z: -half + (iz + 0.5) * cell,
  };
}

function movementBlockedAt(
  scenery,
  x,
  z,
  radius,
  allowBuildingId = null,
  allowTrackedBuildingCrush = false
) {
  const options = { allowBuildingId, allowTrackedBuildingCrush };
  if (scenery.isMovementBlocked) {
    return scenery.isMovementBlocked(x, z, radius, options) === true;
  }
  return scenery.isVehiclePlacementBlocked?.(x, z, radius, options) === true;
}

function lineBlocked(
  ax,
  az,
  bx,
  bz,
  scenery,
  radius,
  allowBuildingId = null,
  allowTrackedBuildingCrush = false
) {
  if (!scenery?.segmentHitsBuilding) {
    // Fallback: sample along the segment.
    if (!scenery?.isMovementBlocked && !scenery?.isVehiclePlacementBlocked) return false;
    const dist = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(dist / 2.4));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      if (
        movementBlockedAt(
          scenery,
          x,
          z,
          radius,
          allowBuildingId,
          allowTrackedBuildingCrush
        )
      ) {
        return true;
      }
    }
    return false;
  }
  return scenery.segmentHitsBuilding(ax, az, bx, bz, radius, {
    allowBuildingId,
    allowTrackedBuildingCrush,
  });
}

/**
 * Grid A* around intact buildings.
 * Returns waypoints including the final destination, or null if unreachable.
 * @param {{ allowBuildingId?: string|null }} [options] — building id that may be entered (garrison)
 */
export function buildBuildingAvoidPath(
  fromX,
  fromZ,
  toX,
  toZ,
  mapDef,
  scenery,
  radius = 1.8,
  options = {}
) {
  if (!mapDef || !scenery) return null;
  const allowBuildingId = options.allowBuildingId ?? null;
  const allowTrackedBuildingCrush = options.allowTrackedBuildingCrush === true;

  // Clear straight shot — no detour needed.
  if (
    !lineBlocked(
      fromX,
      fromZ,
      toX,
      toZ,
      scenery,
      radius,
      allowBuildingId,
      allowTrackedBuildingCrush
    )
  ) {
    return null;
  }

  const { half, cell } = pathGridConfig(mapDef);
  const dims = Math.max(8, Math.ceil((half * 2) / cell));
  const start = worldToCell(fromX, fromZ, half, cell);
  let goal = worldToCell(toX, toZ, half, cell);

  const inBounds = (ix, iz) => ix >= 0 && iz >= 0 && ix < dims && iz < dims;
  const blocked = (ix, iz) => {
    if (!inBounds(ix, iz)) return true;
    const p = cellToWorld(ix, iz, half, cell);
    return movementBlockedAt(
      scenery,
      p.x,
      p.z,
      radius,
      allowBuildingId,
      allowTrackedBuildingCrush
    );
  };

  // If the goal sits inside a footprint, aim for the nearest clear cell.
  if (blocked(goal.ix, goal.iz)) {
    let best = null;
    let bestD = Infinity;
    for (let r = 1; r <= 6 && !best; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const ix = goal.ix + dx;
          const iz = goal.iz + dz;
          if (blocked(ix, iz)) continue;
          const p = cellToWorld(ix, iz, half, cell);
          const d = Math.hypot(p.x - toX, p.z - toZ);
          if (d < bestD) {
            bestD = d;
            best = { ix, iz };
          }
        }
      }
    }
    if (!best) return null;
    goal = best;
  }

  // Start may be slightly clipped; allow search from nearest free cell.
  let startNode = start;
  if (blocked(start.ix, start.iz)) {
    let best = null;
    let bestD = Infinity;
    for (let r = 1; r <= 5 && !best; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const ix = start.ix + dx;
          const iz = start.iz + dz;
          if (blocked(ix, iz)) continue;
          const p = cellToWorld(ix, iz, half, cell);
          const d = Math.hypot(p.x - fromX, p.z - fromZ);
          if (d < bestD) {
            bestD = d;
            best = { ix, iz };
          }
        }
      }
    }
    if (!best) return null;
    startNode = best;
  }

  const key = (ix, iz) => ix * 4096 + iz;
  const open = [];
  const cameFrom = new Map();
  const gScore = new Map();
  const fScore = new Map();
  const closed = new Set();

  const sk = key(startNode.ix, startNode.iz);
  gScore.set(sk, 0);
  fScore.set(
    sk,
    Math.hypot(goal.ix - startNode.ix, goal.iz - startNode.iz)
  );
  open.push({ ix: startNode.ix, iz: startNode.iz, f: fScore.get(sk) });

  const neighbors = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, 1.414],
    [1, -1, 1.414],
    [-1, 1, 1.414],
    [-1, -1, 1.414],
  ];

  let expansions = 0;
  let found = null;
  while (open.length && expansions < MAX_PATH_EXPANSIONS) {
    expansions++;
    open.sort((a, b) => a.f - b.f);
    const current = open.shift();
    const ck = key(current.ix, current.iz);
    if (closed.has(ck)) continue;
    closed.add(ck);
    if (closed.size > MAX_PATH_NODES) break;

    if (current.ix === goal.ix && current.iz === goal.iz) {
      found = current;
      break;
    }

    for (const [dx, dz, cost] of neighbors) {
      const nix = current.ix + dx;
      const niz = current.iz + dz;
      if (blocked(nix, niz)) continue;
      // Corner-cutting: both orthogonal cells must be free for diagonals.
      if (dx !== 0 && dz !== 0) {
        if (blocked(current.ix + dx, current.iz) || blocked(current.ix, current.iz + dz)) {
          continue;
        }
      }
      const nk = key(nix, niz);
      if (closed.has(nk)) continue;
      const tentative = (gScore.get(ck) ?? Infinity) + cost;
      if (tentative >= (gScore.get(nk) ?? Infinity)) continue;
      cameFrom.set(nk, { ix: current.ix, iz: current.iz });
      gScore.set(nk, tentative);
      const h = Math.hypot(goal.ix - nix, goal.iz - niz);
      const f = tentative + h;
      fScore.set(nk, f);
      open.push({ ix: nix, iz: niz, f });
    }
  }

  if (!found) return null;

  // Reconstruct cell path.
  const cells = [{ ix: found.ix, iz: found.iz }];
  let cur = found;
  let guard = 0;
  while (guard++ < MAX_PATH_NODES) {
    const prev = cameFrom.get(key(cur.ix, cur.iz));
    if (!prev) break;
    cells.push(prev);
    cur = prev;
  }
  cells.reverse();

  // Convert to world waypoints and smooth.
  const points = cells.map((c) => cellToWorld(c.ix, c.iz, half, cell));
  // Always finish at the requested destination when clear enough (or garrison enter).
  if (
    allowBuildingId ||
    !movementBlockedAt(
      scenery,
      toX,
      toZ,
      radius * 0.85,
      allowBuildingId,
      allowTrackedBuildingCrush
    )
  ) {
    points.push({ x: toX, z: toZ });
  }

  const smoothed = [{ x: fromX, z: fromZ }];
  let anchor = 0;
  for (let i = 1; i < points.length; i++) {
    const a = smoothed[smoothed.length - 1];
    const b = points[i];
    // Look ahead: keep last visible point from anchor.
    let visible = i;
    for (let j = i; j < points.length; j++) {
      if (
        lineBlocked(
          a.x,
          a.z,
          points[j].x,
          points[j].z,
          scenery,
          radius * 0.92,
          allowBuildingId,
          allowTrackedBuildingCrush
        )
      ) {
        break;
      }
      visible = j;
    }
    if (visible > anchor) {
      smoothed.push(points[visible]);
      anchor = visible;
      i = visible;
    } else {
      smoothed.push(b);
      anchor = i;
    }
  }

  // Drop the start clone if present.
  while (
    smoothed.length > 1 &&
    Math.hypot(smoothed[0].x - fromX, smoothed[0].z - fromZ) < 1.2
  ) {
    smoothed.shift();
  }
  if (!smoothed.length) return [{ x: toX, z: toZ }];
  return smoothed;
}

/**
 * Build a move path. Ground units detour around buildings when the straight
 * line is blocked; otherwise use terrain ridge waypoints.
 * Pass allowBuildingId when the unit is ordered to enter that building.
 */
export function buildMovePath(
  fromX,
  fromZ,
  toX,
  toZ,
  mapDef,
  segmentLen = DEFAULT_SEGMENT_LEN,
  options = {}
) {
  const scenery = options.scenery ?? null;
  const radius = options.radius ?? 1.8;
  const avoidBuildings = options.avoidBuildings !== false && scenery;
  const allowBuildingId = options.allowBuildingId ?? null;
  const preferUrbanRoads = options.preferUrbanRoads === true;
  const allowTrackedBuildingCrush = options.allowTrackedBuildingCrush === true;

  const refineWaypoints = (waypoints) => {
    const refined = [];
    let px = fromX;
    let pz = fromZ;
    for (const wp of waypoints) {
      const terrainSeg = buildTerrainMovePath(px, pz, wp.x, wp.z, mapDef, segmentLen);
      for (const p of terrainSeg) refined.push(p);
      px = wp.x;
      pz = wp.z;
    }
    return refined.length ? refined : waypoints;
  };

  if (preferUrbanRoads && scenery && mapDef?.terrain === 'urban') {
    const roadDestination = isUrbanRoadPoint(toX, toZ, mapDef);
    const roadPath = buildUrbanRoadPath(
      fromX,
      fromZ,
      toX,
      toZ,
      mapDef,
      (ax, az, bx, bz) =>
        lineBlocked(
          ax,
          az,
          bx,
          bz,
          scenery,
          radius * 0.78,
          allowBuildingId,
          allowTrackedBuildingCrush
        )
    );
    if (roadPath?.length) return refineWaypoints(roadPath);
    // An on-road vehicle order must never silently degrade to free-space A*:
    // that fallback is what made Berlin vehicles leave the carriageway and
    // point into façades. If the road network is genuinely disconnected, hold
    // position instead of inventing a route through a building-lined block.
    if (roadDestination) return [{ x: fromX, z: fromZ }];
  }

  if (avoidBuildings) {
    const detour = buildBuildingAvoidPath(fromX, fromZ, toX, toZ, mapDef, scenery, radius, {
      allowBuildingId,
      allowTrackedBuildingCrush,
    });
    if (detour?.length) {
      // Merge terrain ridge breaks onto the detour segments.
      return refineWaypoints(detour);
    }
  }

  return buildTerrainMovePath(fromX, fromZ, toX, toZ, mapDef, segmentLen);
}

/** Physical collision / blocking radius. */
export function unitPathRadius(unitType) {
  if (unitType === 'superHeavyTank') return 2.8;
  if (unitType === 'armoredCar') return 1.45;
  if (unitType === 'artillery' || unitType === 'antiTankGun') return 1.65;
  if (isVehicleUnit(unitType)) return 2.1;
  // Foot troops / support crews — tight enough for alleys, solid vs façades.
  return 0.95;
}

/**
 * Inflated radius used only for path planning so vehicles prefer street centres
 * instead of scraping façades (collision still uses unitPathRadius).
 */
export function unitPathPlanRadius(unitType, mapDef = null) {
  const base = unitPathRadius(unitType);
  if (mapDef?.terrain === 'urban') {
    // Dense-city routes need enough clearance to avoid scraping a façade, but
    // not the rural-size buffer that is wider than Berlin's carriageway.
    if (unitType === 'superHeavyTank') return base + 0.35;
    if (isVehicleUnit(unitType)) return base + 0.55;
  }
  if (unitType === 'superHeavyTank') return base + 2.2;
  if (isVehicleUnit(unitType)) return base + 1.75;
  return base + 0.35;
}

/**
 * Keep mechanical units on the centreline when an order already lands within
 * an urban carriageway. Perspective makes a visually central road click a
 * little imprecise; chasing that final lateral error made vehicles slew toward
 * a façade just before stopping.
 */
export function snapUrbanRoadDestination(
  x,
  z,
  unitType,
  mapDef,
  fromX = x,
  fromZ = z,
  scenery = null
) {
  if (mapDef?.terrain !== 'urban' || !isVehicleUnit(unitType)) return { x, z };
  // A demolished block is traversable ground. Preserve explicit orders onto
  // its released footprint instead of pulling the tank back to the road.
  if (
    scenery?.isDestroyedBuildingFootprint?.(
      x,
      z,
      Math.max(0.2, unitPathRadius(unitType) * 0.2)
    )
  ) {
    return { x, z };
  }

  const roadHalfWidth = urbanRoadHalfWidth(mapDef);
  const roadX = nearestUrbanRoadCenter(x, mapDef);
  const roadZ = nearestUrbanRoadCenter(z, mapDef);
  let onVerticalRoad = Math.abs(x - roadX) <= roadHalfWidth;
  let onHorizontalRoad = Math.abs(z - roadZ) <= roadHalfWidth;

  // Parks, open courtyards, cleared squares, and other genuinely empty ground
  // remain valid destinations. Use vehicle-sized clearance so a click beside a
  // façade still resolves safely to the street, while a clear interior does not.
  if (
    !onVerticalRoad &&
    !onHorizontalRoad &&
    scenery?.isVehiclePlacementBlocked?.(
      x,
      z,
      unitPathRadius(unitType) + 0.45
    ) === false
  ) {
    return { x, z };
  }

  // A perspective click can look central on a Berlin road while its ground
  // intersection lands just beyond the narrow numerical carriageway. Vehicles
  // are road-bound here: resolve those clicks to the nearest street instead of
  // letting the general pathfinder chase an off-road point into a façade.
  if (!onVerticalRoad && !onHorizontalRoad) {
    if (Math.abs(x - roadX) <= Math.abs(z - roadZ)) onVerticalRoad = true;
    else onHorizontalRoad = true;
  }

  // At an intersection, retain the coordinate along the direction of travel.
  // This keeps group spacing and prevents every vehicle collapsing onto the
  // exact same intersection point.
  if (onVerticalRoad && onHorizontalRoad) {
    const travelX = Math.abs(x - fromX);
    const travelZ = Math.abs(z - fromZ);
    if (travelX > travelZ) onVerticalRoad = false;
    else onHorizontalRoad = false;
  }

  return {
    x: onVerticalRoad ? roadX : x,
    z: onHorizontalRoad ? roadZ : z,
  };
}

/** @deprecated use unitPathRadius */
export function vehiclePathRadius(unitType) {
  return unitPathRadius(unitType);
}

/** Assign a building-aware path onto a unit that already has a moveTarget. */
export function applyObstaclePath(unit, destX, destZ, mapDef, scenery) {
  if (!unit || !mapDef || !scenery) return false;
  const snapped = snapUrbanRoadDestination(
    destX,
    destZ,
    unit.def?.type,
    mapDef,
    unit.position.x,
    unit.position.z,
    scenery
  );
  destX = snapped.x;
  destZ = snapped.z;
  unit._finalMoveGoal = { x: destX, z: destZ };
  const radius = unitPathPlanRadius(unit.def?.type, mapDef);
  const { pathSegment } = getMoveReachConfig(unit.def?.type);
  const allowBuildingId = unit._bunkerEntryId ?? null;
  const path = buildMovePath(unit.position.x, unit.position.z, destX, destZ, mapDef, pathSegment, {
    scenery,
    radius,
    avoidBuildings: true,
    allowBuildingId,
    preferUrbanRoads: isVehicleUnit(unit.def?.type),
    allowTrackedBuildingCrush: TANK_TYPES.has(unit.def?.type),
  });
  if (!path?.length) return false;
  unit._movePath = path;
  while (
    unit._movePath.length > 1 &&
    Math.hypot(unit._movePath[0].x - unit.position.x, unit._movePath[0].z - unit.position.z) < 2
  ) {
    unit._movePath.shift();
  }
  unit.moveTarget = { ...unit._movePath[0] };
  return true;
}

export function advanceMovePath(unit, mapDef) {
  if (!unit.moveTarget || !mapDef) return;

  const cfg = getMoveReachConfig(unit.def?.type);
  const intermediate = unit._movePath && unit._movePath.length > 1;
  // Mild early reach on corners only — large thresholds skipped nodes and made
  // units wander between regenerated paths.
  const horizReach = intermediate ? cfg.horiz * 1.12 : cfg.horiz;
  if (
    hasReachedMoveDest(unit, unit.moveTarget, mapDef, horizReach, cfg.height, {
      horizOnly: intermediate,
    })
  ) {
    if (unit._movePath?.length) {
      unit._movePath.shift();
      if (unit._movePath.length > 0) {
        unit.moveTarget = { ...unit._movePath[0] };
        return;
      }
    }
    unit.moveTarget = null;
    unit._movePath = null;
    unit._userMoveOrder = false;
    unit._reverseMoveOrder = false;
    unit._finalMoveGoal = null;
    unit._urbanCanalRoute = null;
    if (unit.retreating) clearRetreat(unit);
  }
}
