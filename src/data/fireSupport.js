export const FIRE_SUPPORT_TYPES = {
  strafe: {
    id: 'strafe',
    label: 'Air Strafe',
    short: 'Strafe',
    cooldown: 72,
    warnTime: 2.2,
    hitInterval: 0.14,
    hitCount: 10,
    runLength: 32,
    hitRadius: 3.5,
    damage: 42,
    hqDamage: 120,
  },
  barrage: {
    id: 'barrage',
    label: 'Artillery Barrage',
    short: 'Barrage',
    cooldown: 95,
    warnTime: 1.4,
    shellCount: 12,
    shellInterval: 0.32,
    radius: 14,
    damage: 48,
    hqDamage: 150,
  },
};

export const FIRE_SUPPORT_LIST = Object.values(FIRE_SUPPORT_TYPES);