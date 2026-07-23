/** Theater scale presets — small matches legacy map dimensions. */

export const MAP_SIZE_PRESETS = {
  small: {
    id: 'small',
    name: 'Small',
    subtitle: 'Tight engagement zone — fast contact and short flanks',
    scale: 1,
  },
  medium: {
    id: 'medium',
    name: 'Medium',
    subtitle: 'Expanded theater — extra maneuver room (default)',
    scale: 1.75,
  },
  large: {
    id: 'large',
    name: 'Large',
    subtitle: 'Grand theater — long advances and sweeping flanks',
    scale: 2.5,
  },
};

export const MAP_SIZE_LIST = Object.values(MAP_SIZE_PRESETS);

export function getMapSizePreset(sizeId = 'medium') {
  return MAP_SIZE_PRESETS[sizeId] ?? MAP_SIZE_PRESETS.medium;
}

/** Allowed size ids for a map (defaults to all presets). */
export function getMapSizeOptions(mapDefOrBase) {
  const options = mapDefOrBase?.mapSizeOptions;
  if (Array.isArray(options) && options.length) {
    return options.filter((id) => MAP_SIZE_PRESETS[id]);
  }
  return MAP_SIZE_LIST.map((preset) => preset.id);
}

export function getDefaultMapSize(mapDefOrBase) {
  const preferred = mapDefOrBase?.defaultMapSize;
  const allowed = getMapSizeOptions(mapDefOrBase);
  if (preferred && allowed.includes(preferred)) return preferred;
  if (allowed.includes('medium')) return 'medium';
  return allowed[0] ?? 'medium';
}

export function resolveMapSizeId(mapDefOrBase, requestedSizeId) {
  const allowed = getMapSizeOptions(mapDefOrBase);
  if (requestedSizeId && allowed.includes(requestedSizeId)) return requestedSizeId;
  return getDefaultMapSize(mapDefOrBase);
}

function scaleXZ(point, scale) {
  if (!point) return point;
  const out = { ...point };
  if (point.x != null) out.x = point.x * scale;
  if (point.z != null) out.z = point.z * scale;
  return out;
}

/** Apply a size preset to a base theater definition. */
export function buildMapDef(baseMap, sizeId = 'medium') {
  const resolvedSizeId = resolveMapSizeId(baseMap, sizeId);
  const preset = getMapSizePreset(resolvedSizeId);
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

/** Tighter radius for staging move orders — keeps troops near HQ, not toward capture points. */
export function getStagingMoveRadius(mapDef) {
  return Math.round(14 * (mapDef?.sizeScale ?? 1));
}

export function formatMapHudLabel(mapDef) {
  if (!mapDef) return '—';
  const preset = getMapSizePreset(mapDef.mapSize ?? 'medium');
  if (preset.scale === 1) return mapDef.name;
  return `${mapDef.name} · ${preset.name}`;
}