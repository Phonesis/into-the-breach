/** Theaters based on historical WW2 campaigns. */

export const MAPS = {
  normandy: {
    id: 'normandy',
    name: 'Normandy',
    subtitle: 'Operation Overlord — Cotentin Peninsula, June 1944',
    terrain: 'bocage',
    groundColor: 0x4a6b3a,
    groundColor2: 0x3d5a32,
    fogColor: 0x8a9aaa,
    fogDensity: 0.0058,
    skyColor: 0x6b7d8f,
    size: 120,
    playerBase: { x: -42, z: 0 },
    enemyBase: { x: 42, z: 0 },
    frontline: { x: 0, z: 0, name: 'Hedgerow Front' },
    capturePoints: [
      { id: 'cp-center', name: 'Saint-Lô Crossroads', x: 0, z: 0, frontline: true },
      { id: 'cp-north', name: 'Carentan Road', x: -8, z: 28 },
      { id: 'cp-south', name: 'Vire Bridge', x: 12, z: -22 },
    ],
    features: ['Hedgerows', 'Farm tracks', 'Overcast skies'],
    axis: ['germany'],
    allies: ['usa', 'uk'],
    randomizeOpponent: true,
  },
  northAfrica: {
    id: 'northAfrica',
    name: 'North Africa',
    subtitle: 'Second Battle of El Alamein — Western Desert, Oct 1942',
    terrain: 'desert',
    groundColor: 0xc4a574,
    groundColor2: 0xa88b5c,
    fogColor: 0xd4c4a0,
    fogDensity: 0.0042,
    skyColor: 0x87a8c8,
    size: 130,
    playerBase: { x: -45, z: -15 },
    enemyBase: { x: 45, z: 15 },
    frontline: { x: 0, z: 0, name: 'Ruweisat Ridge' },
    capturePoints: [
      { id: 'cp-oasis', name: 'Ruweisat Ridge', x: 0, z: 0, frontline: true },
      { id: 'cp-west', name: 'Tel el Eisa', x: -22, z: 18 },
      { id: 'cp-east', name: 'Kidney Ridge', x: 25, z: -12 },
    ],
    features: ['Open desert', 'Escarpments', 'Heat haze'],
    axis: ['germany'],
    allies: ['uk', 'usa'],
  },
  easternFront: {
    id: 'easternFront',
    name: 'Eastern Front',
    subtitle: 'Battle of Kursk — Steppe south of Orel, July 1943',
    terrain: 'steppe',
    groundColor: 0x6b7a4a,
    groundColor2: 0x5a6840,
    fogColor: 0x9aa88a,
    fogDensity: 0.0048,
    skyColor: 0x7a8a9a,
    size: 140,
    playerBase: { x: -48, z: 20 },
    enemyBase: { x: 48, z: -20 },
    frontline: { x: 0, z: 0, name: 'Prokhorovka Line' },
    capturePoints: [
      { id: 'cp-prok', name: 'Prokhorovka', x: 0, z: 0, frontline: true },
      { id: 'cp-north', name: 'Orel Salient', x: -15, z: -30 },
      { id: 'cp-south', name: 'Belgorod Road', x: 18, z: 28 },
    ],
    features: ['Rolling steppe', 'Treelines', 'Summer dust'],
    axis: ['germany'],
    allies: ['russia'],
  },
  italy: {
    id: 'italy',
    name: 'Italy',
    subtitle: 'Battle of Monte Cassino — Liri Valley, Jan 1944',
    terrain: 'hills',
    groundColor: 0x5a6b48,
    groundColor2: 0x4a5a3a,
    fogColor: 0x7a8a7a,
    fogDensity: 0.0062,
    skyColor: 0x5a6a7a,
    size: 125,
    playerBase: { x: -40, z: -25 },
    enemyBase: { x: 40, z: 25 },
    frontline: { x: 0, z: 0, name: 'Cassino Front' },
    capturePoints: [
      { id: 'cp-monastery', name: 'Monte Cassino', x: 0, z: 0, frontline: true },
      { id: 'cp-anzio', name: 'Anzio Beachhead', x: -25, z: 10 },
      { id: 'cp-liri', name: 'Liri Valley', x: 20, z: -18 },
    ],
    features: ['Hill country', 'Olive groves', 'Mountain mist'],
    axis: ['germany'],
    allies: ['usa', 'uk'],
    randomizeOpponent: true,
  },
  farEast: {
    id: 'farEast',
    name: 'Far East',
    subtitle: 'Guadalcanal — Solomon Islands, 1942–1943',
    terrain: 'jungle',
    groundColor: 0x3f5935,
    groundColor2: 0x594c32,
    fogColor: 0x708477,
    fogDensity: 0.0072,
    skyColor: 0x668597,
    size: 132,
    playerBase: { x: -46, z: -12 },
    enemyBase: { x: 46, z: 12 },
    frontline: { x: 0, z: 0, name: 'Matanikau Line' },
    capturePoints: [
      { id: 'cp-center', name: 'Matanikau Crossing', x: 0, z: 0, frontline: true },
      { id: 'cp-north', name: 'Mount Austen Track', x: -14, z: 29 },
      { id: 'cp-south', name: 'Lunga Coastal Road', x: 18, z: -27 },
    ],
    features: [
      'Dense tropical jungle',
      'Palm-lined muddy tracks',
      'Kunai grass and village clearings',
      'Humid dawn mist',
    ],
    axis: ['japan'],
    allies: ['usa', 'uk'],
    // Germany was not at Guadalcanal; treat the Far East as the Soviet-Japanese
    // war in Manchuria / the Soviet Far East when the player is German.
    matchups: {
      germany: ['russia'],
    },
  },
  berlin: {
    id: 'berlin',
    name: 'Berlin',
    subtitle: 'Battle of Berlin — outer districts, April 1945',
    terrain: 'urban',
    groundColor: 0x5b5a54,
    groundColor2: 0x454641,
    fogColor: 0x777b7b,
    fogDensity: 0.0068,
    skyColor: 0x5f6b72,
    size: 128,
    // Dense urban geometry is expensive — keep the theater at medium only.
    defaultMapSize: 'medium',
    mapSizeOptions: ['medium'],
    streetSpacing: 21,
    streetWidth: 6.4,
    canalOffsetCells: 1.5,
    canalWidth: 5.4,
    playerBase: { x: -44, z: 0 },
    enemyBase: { x: 44, z: 0 },
    frontline: { x: 0, z: 0, name: 'Frankfurter Allee' },
    capturePoints: [
      { id: 'cp-center', name: 'Alexanderplatz Approach', x: 0, z: 0, frontline: true },
      { id: 'cp-north', name: 'Moabit Rail Yards', x: -13, z: -31 },
      { id: 'cp-south', name: 'Tempelhof District', x: 15, z: 30 },
    ],
    features: [
      'Dense streets',
      'Central church square',
      'Canal bridges & bombed parkland',
    ],
    axis: ['germany'],
    allies: ['russia', 'usa', 'uk'],
    randomizeOpponent: true,
  },
};

export const MAP_LIST = Object.values(MAPS);

const AXIS_FACTIONS = new Set(['germany', 'japan']);
const ALLIED_FACTIONS = new Set(['usa', 'uk', 'russia']);

function withoutPlayer(ids, playerId) {
  return (ids ?? []).filter((id) => id && id !== playerId);
}

function isHistoricalCombatant(playerId, theater) {
  return !!(
    theater.axis?.includes(playerId) ||
    theater.allies?.includes(playerId) ||
    theater.matchups?.[playerId]
  );
}

/**
 * Historical enemy faction ids for a player in a theater.
 * When `randomizeOpponent` is set, battle picks randomly from this list.
 * Factions that were not present still get the opposing coalition for that map.
 */
export function getTheaterEnemyIds(playerId, mapId) {
  const theater = MAPS[mapId];
  if (!theater || !playerId) return [];
  const override = theater.matchups?.[playerId];
  if (override?.length) return withoutPlayer(override, playerId);
  if (theater.axis?.includes(playerId)) return withoutPlayer(theater.allies, playerId);
  if (theater.allies?.includes(playerId)) return withoutPlayer(theater.axis, playerId);
  if (AXIS_FACTIONS.has(playerId)) return withoutPlayer(theater.allies, playerId);
  if (ALLIED_FACTIONS.has(playerId)) return withoutPlayer(theater.axis, playerId);
  return [];
}

function pickFrom(ids, rng) {
  if (!ids.length) return null;
  const roll = typeof rng === 'function' ? rng() : Math.random();
  const index = Math.min(ids.length - 1, Math.max(0, Math.floor(roll * ids.length)));
  return ids[index];
}

/** Resolves the single AI faction id for a player + theater. */
export function resolveEnemyFactionId(playerId, mapId, fallbackId = 'germany', rng = Math.random) {
  const theater = MAPS[mapId];
  const ids = getTheaterEnemyIds(playerId, mapId);
  if (!theater) return fallbackId;
  // When the player was not in this campaign, prefer their usual rival if that
  // rival actually fought here (Japan in Europe faces the US, not whoever is listed first).
  if (!isHistoricalCombatant(playerId, theater) && fallbackId && ids.includes(fallbackId)) {
    return fallbackId;
  }
  if (theater.randomizeOpponent && ids.length > 1) {
    return pickFrom(ids, rng) ?? fallbackId;
  }
  return ids[0] ?? fallbackId;
}

export {
  buildMapDef,
  getMapSizePreset,
  getMapSizeOptions,
  getDefaultMapSize,
  resolveMapSizeId,
  MAP_SIZE_LIST,
  MAP_SIZE_PRESETS,
} from './mapSizes.js';
