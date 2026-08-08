/** TEMP: set true to test airborne immediately (no cloud cover, no cooldown, unlimited uses). */
export const TEMP_AIRBORNE_TEST = true;

export const AIRBORNE_CLOUD_COVER_SECONDS = TEMP_AIRBORNE_TEST ? 0 : 5 * 60;

export const FIRE_SUPPORT_TYPES = {
  strafe: {
    id: 'strafe',
    label: 'Air Strafe',
    short: 'Strafe',
    cooldown: 72,
    warnTime: 2.2,
    /** MG impacts along the fly-by (timed to plane position over the gun run). */
    hitCount: 15,
    /** Aim-mark corridor length (warning ring / centre of the gun run). */
    runLength: 32,
    /**
     * Extra distance before the aim corridor where guns open, and past the
     * corridor where they keep firing — ties the burst to the full fly-by.
     */
    fireLead: 12,
    fireTrail: 14,
    hitRadius: 3.5,
    damage: 42,
    hqDamage: 120,
  },
  airBomb: {
    id: 'airBomb',
    label: 'Air Bomb',
    short: 'Bomb',
    cooldown: 118,
    warnTime: 2.0,
    /** Fighter altitude at release (world units). */
    planeAltitude: 30,
    runLength: 42,
    planeSpeed: 36,
    /** Fraction along the run when the bomb leaves the rack (0–1). */
    releaseRatio: 0.44,
    /** Free-fall duration from release to impact. */
    fallTime: 1.28,
    hitRadius: 9.5,
    damage: 118,
    hqDamage: 280,
    craterRadius: 5.4,
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
  creepingBarrage: {
    id: 'creepingBarrage',
    label: 'Creeping Barrage',
    short: 'Creep',
    cooldown: 148,
    warnTime: 2.4,
    shellCount: 20,
    shellInterval: 0.38,
    creepLength: 32,
    laneWidth: 7,
    hitRadius: 4.2,
    targetRadius: 11,
    damage: 58,
    targetDamage: 74,
    hqDamage: 210,
  },
  airborneDrop: {
    id: 'airborneDrop',
    label: 'Airborne Drop',
    short: 'Airborne',
    // TEMP_AIRBORNE_TEST: no recharge while testing transports / disembark
    cooldown: TEMP_AIRBORNE_TEST ? 0 : 180,
    warnTime: 3.4,
    squadCount: 5,
    dropRadius: 11,
    dropHeight: 62,
    /** Canopy descent speed (world units / s) — slower reads as silk under load */
    descentRate: 8.2,
    /** Transport cruise height above terrain */
    planeAltitude: 58,
    /** Troop transport cruise speed (world units / s) — slower than fighters */
    planeSpeed: 28,
  },
};

export const FIRE_SUPPORT_LIST = Object.values(FIRE_SUPPORT_TYPES);
