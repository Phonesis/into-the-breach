/** Campaign base-building style — C&C-like structure unlocks. */

export const CAMPAIGN_STYLES = {
  classic: {
    id: 'classic',
    name: 'Classic',
    subtitle: 'Single HQ per side — all unit types available from headquarters.',
  },
  baseBuilding: {
    id: 'baseBuilding',
    name: 'Base Building',
    subtitle:
      'Large map — train infantry at the garrison; build forward bases at captured sectors.',
  },
};

/** Base Building requires the grand theater scale. */
export const BASE_BUILDING_MIN_MAP_SIZE = 'large';

export function canUseBaseBuildingOnMap(mapSizeId = 'medium') {
  return mapSizeId === BASE_BUILDING_MIN_MAP_SIZE;
}

export function baseBuildingRequiresLargeMap(campaignStyle) {
  return campaignStyle === 'baseBuilding';
}

export const CAMPAIGN_STYLE_LIST = Object.values(CAMPAIGN_STYLES);

/** HQ does not train units in base-building mode — use Infantry Garrison and depots. */
export const HQ_BASE_UNITS = [];

/** Opening force per side in Standard campaign — one rifle squad only (spread keeps it clear of HQ). */
export const BASE_BUILDING_STARTING_ARMY = [{ type: 'infantry', count: 1, spread: 16 }];

export const BASE_BUILDING_TYPES = {
  infantryGarrison: {
    id: 'infantryGarrison',
    name: 'Infantry Garrison',
    subtitle: 'Click to train infantry squads',
    cost: 130,
    buildTime: 38,
    hp: 320,
    radius: 3.6,
    hitRadius: 4,
    unlocks: ['infantry'],
    spawns: ['infantry'],
    maxPerTeam: 1,
    placementMinFromHq: 10,
    placementMaxFromHq: 48,
    minSpacing: 9,
  },
  hospital: {
    id: 'hospital',
    name: 'Field Hospital',
    subtitle: 'Click to train medics',
    cost: 185,
    buildTime: 42,
    hp: 300,
    radius: 3.8,
    hitRadius: 4.2,
    unlocks: ['medic'],
    spawns: ['medic'],
    maxPerTeam: 2,
    placementMinFromHq: 10,
    placementMaxFromHq: 48,
    minSpacing: 9,
    healRange: 14,
    healPerSec: 5.2,
  },
  ordnanceYard: {
    id: 'ordnanceYard',
    name: 'Ordnance Yard',
    subtitle: 'Click to train MG, mortars, AT, artillery',
    cost: 220,
    buildTime: 48,
    hp: 360,
    radius: 4.2,
    hitRadius: 4.6,
    unlocks: ['machineGun', 'mortar', 'antiTankGun', 'artillery'],
    spawns: ['machineGun', 'mortar', 'antiTankGun', 'artillery'],
    maxPerTeam: 1,
    placementMinFromHq: 12,
    placementMaxFromHq: 50,
    minSpacing: 10,
  },
  motorPool: {
    id: 'motorPool',
    name: 'Motor Pool',
    subtitle: 'Click to train engineers, scouts, armor — repairs vehicles nearby',
    cost: 260,
    buildTime: 55,
    hp: 400,
    radius: 4.5,
    hitRadius: 5,
    unlocks: ['engineer', 'sniper', 'armoredCar', 'tank', 'tankDestroyer', 'superHeavyTank'],
    spawns: ['engineer', 'sniper', 'armoredCar', 'tank', 'tankDestroyer', 'superHeavyTank'],
    maxPerTeam: 1,
    placementMinFromHq: 14,
    placementMaxFromHq: 52,
    minSpacing: 11,
    healRange: 14,
    healPerSec: 5.2,
  },
  bunker: {
    id: 'bunker',
    name: 'Infantry Bunker',
    subtitle: 'Garrison troops — heavy cover, fire out',
    cost: 95,
    buildTime: 28,
    hp: 280,
    radius: 3.4,
    hitRadius: 3.8,
    unlocks: [],
    spawns: [],
    garrison: true,
    garrisonCapacity: 2,
    garrisonTypes: ['infantry', 'machineGun', 'sniper', 'medic'],
    maxPerTeam: 6,
    placementMinFromHq: 8,
    placementMaxFromHq: 55,
    minSpacing: 7,
  },
};

export const BASE_BUILDING_TYPE_LIST = [
  BASE_BUILDING_TYPES.infantryGarrison,
  BASE_BUILDING_TYPES.hospital,
  BASE_BUILDING_TYPES.ordnanceYard,
  BASE_BUILDING_TYPES.motorPool,
  BASE_BUILDING_TYPES.bunker,
];

const SPAWN_BUILDING_FOR_UNIT = {
  infantry: 'infantryGarrison',
  medic: 'hospital',
  machineGun: 'ordnanceYard',
  mortar: 'ordnanceYard',
  antiTankGun: 'ordnanceYard',
  artillery: 'ordnanceYard',
  engineer: 'motorPool',
  sniper: 'motorPool',
  armoredCar: 'motorPool',
  tank: 'motorPool',
  tankDestroyer: 'motorPool',
  superHeavyTank: 'motorPool',
};

export function getSpawnBuildingForUnit(unitType) {
  return SPAWN_BUILDING_FOR_UNIT[unitType] ?? null;
}

export function isBaseBuildingCampaign(game) {
  return (
    !!game?.campaign &&
    game.campaignStyle === 'baseBuilding' &&
    canUseBaseBuildingOnMap(game.mapDef?.mapSize)
  );
}

/** Unit types shown in the player production panel for the current selection. */
export function getPlayerProductionUnitTypes(game) {
  if (!isBaseBuildingCampaign(game)) return null;
  const entry = game.selectedBaseBuilding;
  if (entry?.team === 'player' && !entry.destroyed && (entry.def?.spawns?.length ?? 0) > 0) {
    return [...entry.def.spawns];
  }
  return [];
}
