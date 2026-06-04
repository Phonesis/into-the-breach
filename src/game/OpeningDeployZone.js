import { sampleTerrainHeight } from '../world/Terrain.js';

/** Max distance from team HQ during opening / clearance ceasefire (world units). */
export const HQ_DEPLOY_RADIUS = 32;
/** Allow slight ring overrun on slopes before hard snap (reduces hill-edge sticking). */
const DEPLOY_ZONE_SNAP_BUFFER = 2.5;

export function isInsideHqDeployZone(x, z, hq, radius = HQ_DEPLOY_RADIUS) {
  if (!hq) return true;
  const dx = x - hq.position.x;
  const dz = z - hq.position.z;
  return dx * dx + dz * dz <= radius * radius;
}

export function clampPointToHqZone(x, z, hq, radius = HQ_DEPLOY_RADIUS) {
  if (!hq) return { x, z };
  const dx = x - hq.position.x;
  const dz = z - hq.position.z;
  const dist = Math.hypot(dx, dz);
  if (dist <= radius || dist < 0.001) return { x, z };
  const scale = radius / dist;
  return { x: hq.position.x + dx * scale, z: hq.position.z + dz * scale };
}

/**
 * Keep unit inside the staging ring during quiet sector / clearance ceasefire.
 * Does not cancel move orders — avoids units "sticking" on sloped ring edges.
 */
export function containUnitToDeployZone(unit, hq, mapDef, radius = HQ_DEPLOY_RADIUS) {
  if (!hq || unit.dead) return;

  if (unit.moveTarget) {
    const clampedTarget = clampPointToHqZone(unit.moveTarget.x, unit.moveTarget.z, hq, radius);
    unit.moveTarget.x = clampedTarget.x;
    unit.moveTarget.z = clampedTarget.z;
  }

  const snapRadius = radius + DEPLOY_ZONE_SNAP_BUFFER;
  if (!isInsideHqDeployZone(unit.position.x, unit.position.z, hq, snapRadius)) {
    const clamped = clampPointToHqZone(unit.position.x, unit.position.z, hq, radius);
    unit.position.x = clamped.x;
    unit.position.z = clamped.z;
    unit.position.y = sampleTerrainHeight(clamped.x, clamped.z, mapDef);
    unit.mesh.position.copy(unit.position);
  }
}

export function containTeamsToDeployZone(units, hqs, mapDef, teams, radius = HQ_DEPLOY_RADIUS) {
  const teamSet = teams ? new Set(teams) : null;
  for (const unit of units) {
    if (unit.dead) continue;
    if (teamSet && !teamSet.has(unit.team)) continue;
    const hq = hqs.find((h) => h.team === unit.team && !h.dead);
    containUnitToDeployZone(unit, hq, mapDef, radius);
  }
}