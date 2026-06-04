/** Tower Defence mode — wave pacing, defense build catalog, upgrades, economy. */

export const TD_STARTING_POINTS = 200;
export const TD_PREPARE_TIME = 38;
export const TD_PREPARE_TIME_BETWEEN = 30;
export const TD_WAVES_TO_WIN = 12;
/** Enemy dot past frontline toward HQ above this = sector lost. */
export const TD_BREACH_MARGIN = 2;
export const TD_KILL_REWARD = {
  infantry: 8,
  machineGun: 10,
  sniper: 12,
  mortar: 14,
  antiTankGun: 16,
  armoredCar: 16,
  tank: 22,
  superHeavyTank: 28,
  artillery: 18,
};
export const TD_WAVE_CLEAR_BONUS = 35;

/** Vehicle types that trigger anti-tank mines. */
export const MINE_VEHICLE_TYPES = new Set([
  'armoredCar',
  'tank',
  'superHeavyTank',
  'artillery',
]);

export const DEFENSE_TYPES = {
  bunker: {
    id: 'bunker',
    name: 'Bunker',
    subtitle: 'Light bunker — 7.92 mm MG',
    cost: 48,
    hp: 280,
    range: 58,
    damage: 12,
    attackSpeed: 1.1,
    weaponSound: 'mg',
    weaponType: 'machineGun',
    caliber: 7.92,
    tier: 1,
  },
  bunkerHeavy: {
    id: 'bunkerHeavy',
    name: 'Heavy Bunker',
    subtitle: 'Reinforced bunker — 75 mm gun',
    cost: 0,
    hp: 460,
    range: 64,
    damage: 28,
    attackSpeed: 0.55,
    weaponSound: 'tank_75',
    weaponType: 'tank',
    caliber: 75,
    tier: 2,
  },
  mgNest: {
    id: 'mgNest',
    name: 'MG Nest',
    subtitle: 'M1919 .30 cal nest',
    cost: 34,
    hp: 100,
    range: 68,
    damage: 10,
    attackSpeed: 1.85,
    weaponSound: 'mg',
    weaponType: 'machineGun',
    caliber: 7.62,
    tier: 1,
  },
  mgNestMk2: {
    id: 'mgNestMk2',
    name: 'Heavy MG Nest',
    subtitle: 'M2 .50 cal — longer reach',
    cost: 0,
    hp: 145,
    range: 76,
    damage: 16,
    attackSpeed: 2.1,
    weaponSound: 'mg',
    weaponType: 'machineGun',
    caliber: 12.7,
    tier: 2,
  },
  atGun: {
    id: 'atGun',
    name: 'AT Gun',
    subtitle: '57 mm anti-tank gun',
    cost: 58,
    hp: 120,
    range: 72,
    damage: 42,
    attackSpeed: 0.48,
    weaponSound: 'tank_75',
    weaponType: 'tank',
    caliber: 57,
    antiArmor: true,
    antiArmorMult: 1.35,
    softMult: 0.35,
    tier: 1,
  },
  atGun88: {
    id: 'atGun88',
    name: '88 mm AT Gun',
    subtitle: 'Flak 88 — devastating vs armor',
    cost: 0,
    hp: 165,
    range: 78,
    damage: 68,
    attackSpeed: 0.38,
    weaponSound: 'tank_75',
    weaponType: 'superHeavyTank',
    caliber: 88,
    antiArmor: true,
    antiArmorMult: 1.5,
    softMult: 0.45,
    tier: 2,
  },
  barbedWire: {
    id: 'barbedWire',
    name: 'Barbed Wire',
    subtitle: 'Slows infantry crossing the belt',
    cost: 14,
    hp: 50,
    range: 0,
    slowRadius: 5,
    slowMult: 0.45,
    tier: 1,
  },
  razorWire: {
    id: 'razorWire',
    name: 'Razor Wire',
    subtitle: 'Concertina — stronger slow, more durable',
    cost: 0,
    hp: 95,
    range: 0,
    slowRadius: 6.5,
    slowMult: 0.32,
    tier: 2,
  },
  mine: {
    id: 'mine',
    name: 'AT Mine',
    subtitle: 'Buried charge — detonates under vehicles',
    cost: 18,
    hp: 35,
    range: 0,
    triggerRadius: 2.4,
    damage: 110,
    tier: 1,
  },
  artillery: {
    id: 'artillery',
    name: 'Artillery Pit',
    subtitle: '105 mm — enables barrage strikes',
    cost: 72,
    hp: 85,
    range: 0,
    barrageTier: 1,
    tier: 1,
  },
  artilleryHeavy: {
    id: 'artilleryHeavy',
    name: 'Heavy Arty Pit',
    subtitle: '155 mm — stronger, faster barrage',
    cost: 0,
    hp: 120,
    range: 0,
    barrageTier: 2,
    tier: 2,
  },
};

/** Placeable in build panel (tier 1 only). */
export const DEFENSE_TYPE_LIST = [
  DEFENSE_TYPES.bunker,
  DEFENSE_TYPES.mgNest,
  DEFENSE_TYPES.atGun,
  DEFENSE_TYPES.barbedWire,
  DEFENSE_TYPES.mine,
  DEFENSE_TYPES.artillery,
];

/** Upgrade path: typeId -> { next, cost }. */
export const DEFENSE_UPGRADES = {
  bunker: { next: 'bunkerHeavy', cost: 62 },
  mgNest: { next: 'mgNestMk2', cost: 48 },
  atGun: { next: 'atGun88', cost: 78 },
  barbedWire: { next: 'razorWire', cost: 22 },
  artillery: { next: 'artilleryHeavy', cost: 85 },
};

export const TD_BARRAGE_BY_TIER = {
  1: { radius: 14, damage: 58, cooldown: 28 },
  2: { radius: 17, damage: 82, cooldown: 22 },
};

export function getBarrageDefForTier(tier) {
  return TD_BARRAGE_BY_TIER[tier] ?? TD_BARRAGE_BY_TIER[1];
}

export function getMaxBarrageTier(entries) {
  let max = 1;
  for (const e of entries) {
    if (e.destroyed || !e.def.barrageTier) continue;
    max = Math.max(max, e.def.barrageTier);
  }
  return max;
}

export function canUpgradeType(typeId) {
  return !!DEFENSE_UPGRADES[typeId];
}