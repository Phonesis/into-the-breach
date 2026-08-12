// Shared vertical layout for the sprites that float above a unit.  The
// markers are created by separate systems, so their individual anchor points
// can otherwise land on the same pixels when more than one is active.
const OVERHEAD_MARKER_ORDER = [
  'fieldIcon',
  'rankMarker',
  'healthBar',
  'coverMarker',
  'healMarker',
  'inspiredMarker',
  'retreatMarker',
  'surrenderMarker',
  'statusBanner',
];

const OVERHEAD_GAP = 0.28;

/**
 * Store a marker's unstacked anchor and apply it immediately.
 *
 * Keeping the raw anchor on the sprite means repeated layout passes do not
 * accumulate the previous pass's vertical adjustment.
 */
export function setOverheadSpriteY(sprite, y) {
  if (!sprite) return;
  sprite.userData.overheadBaseY = y;
  sprite.position.y = y;
}

/**
 * Raise active unit markers just enough that their sprite bounds do not
 * overlap. Markers can be in different coordinate spaces while a unit is
 * garrisoned, so each parent is laid out independently.
 */
export function layoutUnitOverheadMarkers(unit) {
  if (!unit) return;

  const groups = new Map();
  for (const key of OVERHEAD_MARKER_ORDER) {
    const marker = unit[key];
    const sprite = key === 'healthBar' ? marker?.sprite : marker;
    if (!sprite || !sprite.parent || sprite.visible === false) continue;

    let group = groups.get(sprite.parent);
    if (!group) {
      group = [];
      groups.set(sprite.parent, group);
    }
    group.push({
      sprite,
      baseY: Number.isFinite(sprite.userData?.overheadBaseY)
        ? sprite.userData.overheadBaseY
        : sprite.position.y,
    });
  }

  for (const markers of groups.values()) {
    let occupiedTop = -Infinity;
    for (const { sprite, baseY } of markers) {
      const halfHeight = Math.abs(sprite.scale.y) * 0.5;
      const minY = occupiedTop + OVERHEAD_GAP + halfHeight;
      const y = Math.max(baseY, minY);
      sprite.position.y = y;
      occupiedTop = y + halfHeight;
    }
  }
}
