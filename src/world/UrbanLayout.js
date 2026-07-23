/** Shared Berlin street geometry used by rendering, minimap, and pathfinding. */

export function getUrbanStreetSpacing(mapDef) {
  const scale = mapDef?.sizeScale ?? 1;
  return (mapDef?.streetSpacing ?? 21) * (1 + Math.max(0, scale - 1) * 0.2);
}

export function getUrbanRoadExtent(mapDef) {
  const spacing = getUrbanStreetSpacing(mapDef);
  return Math.ceil(((mapDef?.size ?? 120) * 0.42) / spacing) * spacing;
}

export function nearestUrbanRoadCenter(value, mapDef) {
  const spacing = getUrbanStreetSpacing(mapDef);
  const extent = getUrbanRoadExtent(mapDef);
  return Math.max(-extent, Math.min(extent, Math.round(value / spacing) * spacing));
}

export function urbanRoadHalfWidth(mapDef, margin = 0) {
  return Math.max(2.4, (mapDef?.streetWidth ?? 6.4) * 0.5 + margin);
}

