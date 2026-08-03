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
      'Attack dug-in defenses or hold them yourself — timed reinforcements for both sides (Small / Medium / Large) and no HQ economy.',
    needsRole: true,
  },
  /** @deprecated Legacy alias; starts as Clear Defenses with Small reinforcements. */
  clearanceReinforced: {
    id: 'clearanceReinforced',
    name: 'Clear Defenses',
    subtitle: 'Legacy alias for Clear Defenses.',
    hidden: true,
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
      'Manual deployment (enemy matches your unit count) or preset battle groups on large maps. Pure force-on-force — no HQ or reinforcements.',
  },
};

/** Deployment budget per side in Battle Simulation mode. */
export const LAST_STAND_SUPPLIES = 2000;

/** Maximum living units deployed per side in Standard mode. */
export const STANDARD_UNIT_LIMIT = 30;

export const GAME_MODE_LIST = Object.values(GAME_MODES).filter((mode) => !mode.hidden);

/** Clear Defenses always uses timed reinforcements; this sets how large each wave is. */
export const CLEARANCE_REINFORCEMENT_SIZES = {
  small: {
    id: 'small',
    name: 'Small',
    subtitle: 'Two-unit packages every 3 minutes — current baseline (infantry + one support).',
  },
  medium: {
    id: 'medium',
    name: 'Medium',
    subtitle: 'Three- to four-unit packages every 3 minutes — extra rifles and support weapons.',
  },
  large: {
    id: 'large',
    name: 'Large',
    subtitle: 'Five- to six-unit packages every 3 minutes — platoon-scale arrivals for both sides.',
  },
};

export const CLEARANCE_REINFORCEMENT_SIZE_LIST = Object.values(CLEARANCE_REINFORCEMENT_SIZES);

/** @deprecated Prefer CLEARANCE_REINFORCEMENT_SIZES — kept for any external imports. */
export const CLEARANCE_STYLES = CLEARANCE_REINFORCEMENT_SIZES;
/** @deprecated Prefer CLEARANCE_REINFORCEMENT_SIZE_LIST */
export const CLEARANCE_STYLE_LIST = CLEARANCE_REINFORCEMENT_SIZE_LIST;

export const DEFAULT_CLEARANCE_REINFORCEMENT_SIZE = 'small';

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

/** Clear Defenses mission choice — player is either the assault force or the garrison. */
export const CLEARANCE_ROLES = {
  attack: {
    id: 'attack',
    name: 'Attack',
    subtitle:
      'Assault prepared defenses with a fixed force. Timed rear reinforcements; wipe every defender to win.',
  },
  defend: {
    id: 'defend',
    name: 'Defend',
    subtitle:
      'Hold dug-in positions against an AI assault. Timed reinforcements; destroy the attacking force to win.',
  },
};

export const CLEARANCE_ROLE_LIST = Object.values(CLEARANCE_ROLES);
export const DEFAULT_CLEARANCE_ROLE = 'attack';

export function resolveClearanceRole(options = {}) {
  const raw = options.clearanceRole ?? options.assaultRole;
  if (raw === 'defend' || raw === 'attack') return raw;
  return DEFAULT_CLEARANCE_ROLE;
}

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
  'radioOperator',
  'infantry',
  'medic',
  'engineer',
  'machineGun',
  'sniper',
  'mortar',
  'antiTankGun',
  'armoredCar',
  'tank',
  'tankDestroyer',
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
  return gameMode === 'clearance' || gameMode === 'clearanceReinforced';
}

/** Clear Defenses always runs with timed reinforcements (legacy classic removed). */
export function isReinforcedClearanceMode(gameMode, options = {}) {
  if (isClearanceMode(gameMode)) return true;
  // Explicit opt-in from older saves / options.
  return options.clearanceStyle === 'reinforced' || options.clearanceReinforced === true;
}

export function resolveClearanceReinforcementSize(options = {}) {
  const raw =
    options.clearanceReinforcementSize ??
    options.clearanceStyle ??
    DEFAULT_CLEARANCE_REINFORCEMENT_SIZE;
  // Map legacy style ids: classic/reinforced → small
  if (raw === 'classic' || raw === 'reinforced') return DEFAULT_CLEARANCE_REINFORCEMENT_SIZE;
  if (CLEARANCE_REINFORCEMENT_SIZES[raw]) return raw;
  return DEFAULT_CLEARANCE_REINFORCEMENT_SIZE;
}

export function isTowerDefenseMode(gameMode) {
  return gameMode === 'towerDefense';
}

export function isLastStandMode(gameMode) {
  return gameMode === 'lastStand';
}

export { TD_STARTING_POINTS } from './towerDefense.js';

export { CLEARANCE_STARTING_RESOURCES } from '../game/ClearanceMode.js';
