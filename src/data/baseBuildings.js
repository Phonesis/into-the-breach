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
      'Construct depots to unlock vehicles, artillery, and medics. Bunkers garrison infantry.',
  },
};

export const CAMPAIGN_STYLE_LIST = Object.values(CAMPAIGN_STYLES);

/** Units trainable from HQ in base-building mode. */
export const HQ_BASE_UNITS = ['infantry'];

/** Opening force per side in base-building campaign — one rifle squad only. */
export const BASE_BUILDING_STARTING_ARMY = [{ type: 'infantry', count: 1, spread: 4 }];

export const BASE_BUILDING_TYPES = {
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
    subtitle: 'Click to train engineers, scouts, armor',
    cost: 260,
    buildTime: 55,
    hp: 400,
    radius: 4.5,
    hitRadius: 5,
    unlocks: ['engineer', 'sniper', 'armoredCar', 'tank', 'superHeavyTank'],
    spawns: ['engineer', 'sniper', 'armoredCar', 'tank', 'superHeavyTank'],
    maxPerTeam: 1,
    placementMinFromHq: 14,
    placementMaxFromHq: 52,
    minSpacing: 11,
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
  BASE_BUILDING_TYPES.hospital,
  BASE_BUILDING_TYPES.ordnanceYard,
  BASE_BUILDING_TYPES.motorPool,
  BASE_BUILDING_TYPES.bunker,
];

const SPAWN_BUILDING_FOR_UNIT = {
  medic: 'hospital',
  machineGun: 'ordnanceYard',
  mortar: 'ordnanceYard',
  antiTankGun: 'ordnanceYard',
  artillery: 'ordnanceYard',
  engineer: 'motorPool',
  sniper: 'motorPool',
  armoredCar: 'motorPool',
  tank: 'motorPool',
  superHeavyTank: 'motorPool',
};

export function getSpawnBuildingForUnit(unitType) {
  return SPAWN_BUILDING_FOR_UNIT[unitType] ?? null;
}

export function isBaseBuildingCampaign(game) {
  return !!game?.campaign && game.campaignStyle === 'baseBuilding';
}

/** Unit types shown in the player production panel for the current selection. */
export function getPlayerProductionUnitTypes(game) {
  if (!isBaseBuildingCampaign(game)) return null;
  if (game.selectedHq?.team === 'player' && !game.selectedHq.dead) {
    return [...HQ_BASE_UNITS];
  }
  const entry = game.selectedBaseBuilding;
  if (entry?.team === 'player' && !entry.destroyed && (entry.def?.spawns?.length ?? 0) > 0) {
    return [...entry.def.spawns];
  }
  return [];
}