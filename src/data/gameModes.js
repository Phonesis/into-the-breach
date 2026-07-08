export const GAME_MODES = {
  campaign: {
    id: 'campaign',
    name: 'Standard',
    subtitle:
      'Destroy the enemy HQ to win — Classic (train at HQ) or Base Building (construct depots for armor & artillery).',
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
    subtitle:
      'Fixed attack force vs dug-in defenders — no HQ, no reinforcements. Wipe every defender to win.',
  },
  towerDefense: {
    id: 'towerDefense',
    name: 'Tower Defence',
    subtitle:
      'Hold the frontline against escalating waves — Emplacements (build defenses) or HQ Defense (spawn units from HQ). 12-wave victory or endless survival.',
  },
  lastStand: {
    id: 'lastStand',
    name: 'Battle Simulation',
    subtitle:
      'Manual deployment (2,000 supplies) or preset combined-arms battle groups on large maps. Pure force-on-force — no HQ or reinforcements.',
  },
};

/** Deployment budget per side in Battle Simulation mode. */
export const LAST_STAND_SUPPLIES = 2000;

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
  'medic',
  'engineer',
  'machineGun',
  'sniper',
  'mortar',
  'antiTankGun',
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

export function isTowerDefenseMode(gameMode) {
  return gameMode === 'towerDefense';
}

export function isLastStandMode(gameMode) {
  return gameMode === 'lastStand';
}

export { TD_STARTING_POINTS } from './towerDefense.js';

export { CLEARANCE_STARTING_RESOURCES } from '../game/ClearanceMode.js';