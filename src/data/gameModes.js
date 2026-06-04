export const GAME_MODES = {
  campaign: {
    id: 'campaign',
    name: 'Campaign',
    subtitle: 'Full battle vs AI — capture points, economy, and enemy HQ.',
  },
  tutorial: {
    id: 'tutorial',
    name: 'Training Ground',
    subtitle: 'No enemy AI. Practice selection, movement, capture, production, and attacking the dummy HQ.',
  },
  assault: {
    id: 'assault',
    name: 'Assault & Defend',
    subtitle: 'Attackers must seize the frontline; defenders hold until time runs out or repel the assault.',
    needsRole: true,
  },
  clearance: {
    id: 'clearance',
    name: 'Clear Defenses',
    subtitle: 'Enemy forces are dug in across the map — no enemy HQ. Destroy every defender to win.',
  },
};

export const GAME_MODE_LIST = Object.values(GAME_MODES);

export const ASSAULT_ROLES = {
  attack: {
    id: 'attack',
    name: 'Attack',
    subtitle: 'Break through and capture the frontline, or destroy the enemy HQ.',
  },
  defend: {
    id: 'defend',
    name: 'Defend',
    subtitle: 'Hold the frontline until the clock runs out, or eliminate the assault force.',
  },
};

export const ASSAULT_ROLE_LIST = Object.values(ASSAULT_ROLES);

/** Seconds the attacker must hold the frontline to win. */
export const ASSAULT_HOLD_TIME = 45;

/** Seconds the defender must survive to win by time. */
export const ASSAULT_DEFEND_TIME = 480;

export const TUTORIAL_STARTING_RESOURCES = 200;

/** Seconds after deploy before any unit may fire (move/orders still allowed). */
export const BATTLE_OPENING_TIME = 32;

/** Training Ground practice HQ — survives full-army volleys; damage tuned for learning. */
export const PRACTICE_TARGET_HQ_HP = 4000;
export const PRACTICE_TARGET_HQ_DAMAGE_MULT = 0.2;

export const ASSAULT_STARTING_RESOURCES = 140;
export const ASSAULT_ENEMY_RESOURCES = 120;

/** Unit keys shown in production UI (order matters). */
export const UNIT_TYPE_ORDER = [
  'infantry',
  'machineGun',
  'sniper',
  'mortar',
  'armoredCar',
  'tank',
  'superHeavyTank',
  'artillery',
];

export function getProducibleUnits(faction) {
  return UNIT_TYPE_ORDER.filter((key) => faction.units[key]);
}

export function isAssaultMode(gameMode) {
  return gameMode === 'assault';
}

export function isClearanceMode(gameMode) {
  return gameMode === 'clearance';
}

export { CLEARANCE_STARTING_RESOURCES } from '../game/ClearanceMode.js';