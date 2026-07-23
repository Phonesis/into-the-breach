/** Redirect move orders toward nearby cover when seek-cover mode is active. */

const SEEK_COVER_UNIT_TYPES = new Set([
  'infantry',
  'paratrooper',
  'machineGun',
  'mortar',
  'sniper',
  'medic',
  'engineer',
]);

/** Max distance from clicked point to search for cover (m). */
const SEEK_NEAR_DEST_RADIUS = 28;

/** Max distance from unit to search when nothing is near the click (m). */
const SEEK_NEAR_UNIT_RADIUS = 22;

export function canSeekCover(unit) {
  return SEEK_COVER_UNIT_TYPES.has(unit?.def?.type);
}

/**
 * Pick a cover zone center to move toward instead of the raw click point.
 * @returns {{ x: number, z: number } | null}
 */
export function findNearestCoverPoint(fromX, fromZ, destX, destZ, coverSystem) {
  const zones = coverSystem?.zones;
  if (!zones?.length) return null;

  let best = null;
  let bestScore = Infinity;

  for (const zone of zones) {
    const toDest = Math.hypot(zone.x - destX, zone.z - destZ);
    const toUnit = Math.hypot(zone.x - fromX, zone.z - fromZ);
    if (toDest > SEEK_NEAR_DEST_RADIUS && toUnit > SEEK_NEAR_UNIT_RADIUS) continue;

    const tierWeight = zone.mult ?? 1;
    const score = toDest * 0.72 + toUnit * 0.28 + tierWeight * 12;
    if (score < bestScore) {
      bestScore = score;
      best = zone;
    }
  }

  if (!best) return null;
  return { x: best.x, z: best.z };
}

export function resolveSeekCoverDestination(unit, destX, destZ, coverSystem) {
  if (!canSeekCover(unit) || !coverSystem) {
    return { x: destX, z: destZ };
  }
  const cover = findNearestCoverPoint(
    unit.position.x,
    unit.position.z,
    destX,
    destZ,
    coverSystem
  );
  if (!cover) return { x: destX, z: destZ };
  return cover;
}
