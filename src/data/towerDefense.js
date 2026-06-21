/** Tower Defence mode — wave pacing, defense build catalog, upgrades, economy. */

export const TD_STARTING_POINTS = 200;
export const TD_PREPARE_TIME = 38;
export const TD_PREPARE_TIME_BETWEEN = 30;
export const TD_WAVES_TO_WIN = 12;

/** Tower Defence wave rules — standard clears 12 waves; endless escalates until defeat. */
export const TD_WAVE_MODES = {
  standard: {
    id: 'standard',
    name: '12 Waves',
    subtitle: 'Repel 12 assault waves to win.',
  },
  endless: {
    id: 'endless',
    name: 'Endless',
    subtitle: 'Escalating waves — survive as long as you can.',
  },
};

export const TD_WAVE_MODE_LIST = Object.values(TD_WAVE_MODES);

/** Tower Defence play style — emplacement building vs HQ army defense. */
export const TD_STYLE_MODES = {
  emplacements: {
    id: 'emplacements',
    name: 'Emplacements',
    subtitle: 'Spend defense points on bunkers, wire, and guns behind the frontline.',
  },
  hqDefense: {
    id: 'hqDefense',
    name: 'HQ Defense',
    subtitle: 'Spawn any unit from HQ — hold the line. Lose only if HQ is destroyed.',
  },
};

export const TD_STYLE_MODE_LIST = Object.values(TD_STYLE_MODES);

export function isTdHqDefenseStyle(td) {
  return td?.style === 'hqDefense';
}

export function isTdEmplacementStyle(td) {
  return !td?.style || td.style === 'emplacements';
}

/** Starting supplies for HQ Defense (production from HQ). */
export const TD_HQ_DEFENSE_STARTING_SUPPLIES = 180;

/** How far the frontline retreats toward HQ when the enemy breaches. */
export const TD_FRONTLINE_RETREAT_STEP = 16;

/** Minimum distance from HQ the frontline can retreat to. */
export const TD_MIN_FRONTLINE_FROM_HQ = 14;

/** Seconds between automatic frontline retreats after a breach. */
export const TD_FRONTLINE_SHIFT_COOLDOWN = 12;

/** Player units may not move past the frontline beyond this margin (m). */
export const TD_PLAYER_FRONTLINE_MARGIN = 2;

/** Enemy dot past frontline toward HQ above this = sector lost (emplacements) or retreat (HQ Defense). */
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
    maxAmmo: 180,
    ammoPerShot: 1,
    resupplyCost: 10,
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
    maxAmmo: 90,
    ammoPerShot: 1,
    resupplyCost: 14,
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
    maxAmmo: 240,
    ammoPerShot: 1,
    resupplyCost: 8,
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
    maxAmmo: 200,
    ammoPerShot: 1,
    resupplyCost: 12,
  },
  mortarNest: {
    id: 'mortarNest',
    name: 'Mortar Pit',
    subtitle: '81 mm mortar — high-angle HE vs infantry',
    cost: 46,
    hp: 95,
    range: 84,
    damage: 26,
    attackSpeed: 0.4,
    weaponSound: 'mortar',
    weaponType: 'mortar',
    caliber: 81,
    softMult: 1.15,
    tier: 1,
    maxAmmo: 48,
    ammoPerShot: 1,
    resupplyCost: 12,
  },
  mortarNestMk2: {
    id: 'mortarNestMk2',
    name: 'Heavy Mortar Pit',
    subtitle: '120 mm mortar — longer range, heavier shells',
    cost: 0,
    hp: 130,
    range: 94,
    damage: 40,
    attackSpeed: 0.32,
    weaponSound: 'mortar',
    weaponType: 'mortar',
    caliber: 120,
    softMult: 1.2,
    tier: 2,
    maxAmmo: 36,
    ammoPerShot: 1,
    resupplyCost: 16,
  },
  atGun: {
    id: 'atGun',
    name: 'AT Gun',
    subtitle: '57 mm anti-tank gun',
    cost: 58,
    hp: 110,
    range: 61,
    damage: 36,
    attackSpeed: 0.4,
    weaponSound: 'tank_75',
    weaponType: 'tank',
    caliber: 57,
    antiArmor: true,
    antiArmorMult: 1.18,
    softMult: 0.3,
    tier: 1,
    maxAmmo: 32,
    ammoPerShot: 1,
    resupplyCost: 14,
  },
  atGun88: {
    id: 'atGun88',
    name: '88 mm AT Gun',
    subtitle: 'Flak 88 — devastating vs armor',
    cost: 0,
    hp: 150,
    range: 66,
    damage: 56,
    attackSpeed: 0.34,
    weaponSound: 'tank_75',
    weaponType: 'superHeavyTank',
    caliber: 88,
    antiArmor: true,
    antiArmorMult: 1.28,
    softMult: 0.38,
    tier: 2,
    maxAmmo: 24,
    ammoPerShot: 1,
    resupplyCost: 18,
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
  tankTrap: {
    id: 'tankTrap',
    name: 'Tank Traps',
    subtitle: 'Czech hedgehog — slows and wrecks vehicle tracks',
    cost: 22,
    hp: 110,
    range: 0,
    trapRadius: 4.2,
    slowMult: 0.38,
    trapDamagePerSec: 12,
    tier: 1,
  },
  tankTrapHeavy: {
    id: 'tankTrapHeavy',
    name: 'Heavy Tank Traps',
    subtitle: 'Concrete dragon\'s teeth — tougher barrier',
    cost: 0,
    hp: 175,
    range: 0,
    trapRadius: 5.2,
    slowMult: 0.25,
    trapDamagePerSec: 18,
    tier: 2,
  },
  artillery: {
    id: 'artillery',
    name: 'Artillery Pit',
    subtitle: '105 mm — barrage (max 3 pits; each shortens CD)',
    cost: 72,
    hp: 85,
    range: 0,
    barrageTier: 1,
    tier: 1,
    maxAmmo: 24,
    barrageAmmoCost: 6,
    resupplyCost: 20,
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
    maxAmmo: 18,
    barrageAmmoCost: 8,
    resupplyCost: 26,
  },
};

/** Placeable in build panel (tier 1 only). */
export const DEFENSE_TYPE_LIST = [
  DEFENSE_TYPES.bunker,
  DEFENSE_TYPES.mgNest,
  DEFENSE_TYPES.mortarNest,
  DEFENSE_TYPES.atGun,
  DEFENSE_TYPES.barbedWire,
  DEFENSE_TYPES.mine,
  DEFENSE_TYPES.tankTrap,
  DEFENSE_TYPES.artillery,
];

/** Upgrade path: typeId -> { next, cost }. */
export const DEFENSE_UPGRADES = {
  bunker: { next: 'bunkerHeavy', cost: 62 },
  mgNest: { next: 'mgNestMk2', cost: 48 },
  mortarNest: { next: 'mortarNestMk2', cost: 52 },
  atGun: { next: 'atGun88', cost: 78 },
  barbedWire: { next: 'razorWire', cost: 22 },
  tankTrap: { next: 'tankTrapHeavy', cost: 28 },
  artillery: { next: 'artilleryHeavy', cost: 85 },
};

export const TD_MAX_ARTILLERY_PITS = 3;
/** Seconds shaved off barrage cooldown for each artillery pit beyond the first. */
export const TD_BARRAGE_COOLDOWN_REDUCTION_PER_PIT = 6;
export const TD_MIN_BARRAGE_COOLDOWN = 10;

export const ARTILLERY_PIT_TYPE_IDS = new Set(['artillery', 'artilleryHeavy']);

export const TD_BARRAGE_BY_TIER = {
  1: { radius: 14, damage: 58, cooldown: 28 },
  2: { radius: 17, damage: 82, cooldown: 22 },
};

export function getBarrageDefForTier(tier) {
  return TD_BARRAGE_BY_TIER[tier] ?? TD_BARRAGE_BY_TIER[1];
}

export function getArtilleryPitCount(entries) {
  let count = 0;
  for (const e of entries) {
    if (e.destroyed || !ARTILLERY_PIT_TYPE_IDS.has(e.typeId)) continue;
    count += 1;
  }
  return count;
}

export function getMaxBarrageTier(entries) {
  let max = 1;
  for (const e of entries) {
    if (e.destroyed || !e.def.barrageTier) continue;
    max = Math.max(max, e.def.barrageTier);
  }
  return max;
}

/** Barrage recharge time — base tier cooldown minus 6s per extra pit (min 10s). */
export function getBarrageCooldownForEntries(entries) {
  const pitCount = getArtilleryPitCount(entries);
  if (pitCount <= 0) return TD_BARRAGE_BY_TIER[1].cooldown;
  const tier = getMaxBarrageTier(entries);
  const base = getBarrageDefForTier(tier).cooldown;
  const reduction = (pitCount - 1) * TD_BARRAGE_COOLDOWN_REDUCTION_PER_PIT;
  return Math.max(TD_MIN_BARRAGE_COOLDOWN, base - reduction);
}

export function canUpgradeType(typeId) {
  return !!DEFENSE_UPGRADES[typeId];
}

/** Gun pits and artillery stores that must be resupplied with defense points. */
export function defenseNeedsAmmo(def) {
  return (def?.maxAmmo ?? 0) > 0;
}

export function getAmmoRatio(entry) {
  if (!entry?.maxAmmo) return 1;
  return Math.max(0, Math.min(1, (entry.ammo ?? 0) / entry.maxAmmo));
}

export function getResupplyCost(entry) {
  return entry?.def?.resupplyCost ?? 10;
}

/** Highest-tier artillery pit with enough shells for a barrage. */
export function pickBarrageAmmoPit(entries) {
  let best = null;
  let bestTier = -1;
  for (const e of entries) {
    if (e.destroyed || !e.def?.barrageTier) continue;
    const cost = e.def.barrageAmmoCost ?? 6;
    if ((e.ammo ?? 0) < cost) continue;
    const tier = e.def.barrageTier ?? 1;
    if (tier > bestTier) {
      bestTier = tier;
      best = e;
    }
  }
  return best;
}