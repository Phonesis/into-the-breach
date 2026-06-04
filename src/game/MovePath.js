import { sampleTerrainHeight, hasReachedMoveDest } from '../world/Terrain.js';
import { clearRetreat } from './RetreatBehavior.js';
import { getMoveReachConfig } from '../units/VehicleTypes.js';

const DEFAULT_SEGMENT_LEN = 7;
const RIDGE_HEIGHT_DELTA = 2.4;

/** Build terrain-aware waypoints so units climb ridges instead of stopping in valleys. */
export function buildMovePath(fromX, fromZ, toX, toZ, mapDef, segmentLen = DEFAULT_SEGMENT_LEN) {
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

export function advanceMovePath(unit, mapDef) {
  if (!unit.moveTarget || !mapDef) return;

  const cfg = getMoveReachConfig(unit.def?.type);
  const intermediate = unit._movePath && unit._movePath.length > 1;
  if (
    hasReachedMoveDest(unit, unit.moveTarget, mapDef, cfg.horiz, cfg.height, {
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
    if (unit.retreating) clearRetreat(unit);
  }
}