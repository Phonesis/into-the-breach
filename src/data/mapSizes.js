/** Theater scale presets — small matches legacy map dimensions. */

export const MAP_SIZE_PRESETS = {
  small: {
    id: 'small',
    name: 'Small',
    subtitle: 'Standard battlefield (current size)',
    scale: 1,
  },
  medium: {
    id: 'medium',
    name: 'Medium',
    subtitle: '1.75× wider — expanded maneuver room',
    scale: 1.75,
  },
  large: {
    id: 'large',
    name: 'Large',
    subtitle: '2.5× wider — grand theater',
    scale: 2.5,
  },
};

export const MAP_SIZE_LIST = Object.values(MAP_SIZE_PRESETS);

export function getMapSizePreset(sizeId = 'small') {
  return MAP_SIZE_PRESETS[sizeId] ?? MAP_SIZE_PRESETS.small;
}

function scaleXZ(point, scale) {
  if (!point) return point;
  const out = { ...point };
  if (point.x != null) out.x = point.x * scale;
  if (point.z != null) out.z = point.z * scale;
  return out;
}

/** Apply a size preset to a base theater definition. */
export function buildMapDef(baseMap, sizeId = 'small') {
  const preset = getMapSizePreset(sizeId);
  const scale = preset.scale;

  const built = {
    ...baseMap,
    mapSize: preset.id,
    sizeScale: scale,
    baseSize: baseMap.size,
    size: Math.round(baseMap.size * scale),
    playerBase: scaleXZ(baseMap.playerBase, scale),
    enemyBase: scaleXZ(baseMap.enemyBase, scale),
    capturePoints: (baseMap.capturePoints ?? []).map((cp) => ({
      ...cp,
      x: cp.x * scale,
      z: cp.z * scale,
    })),
  };

  if (baseMap.frontline) {
    built.frontline = { ...baseMap.frontline, ...scaleXZ(baseMap.frontline, scale) };
  }

  return built;
}

export function getDeployRadius(mapDef) {
  return Math.round(32 * (mapDef?.sizeScale ?? 1));
}

export function formatMapHudLabel(mapDef) {
  if (!mapDef) return '—';
  const preset = getMapSizePreset(mapDef.mapSize ?? 'small');
  if (preset.scale === 1) return mapDef.name;
  return `${mapDef.name} · ${preset.name}`;
}