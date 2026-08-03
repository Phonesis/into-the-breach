/** Battle Simulation deployment options and preset combined-arms rosters. */

export const LAST_STAND_DEPLOY_MODES = {
  manual: {
    id: 'manual',
    name: 'Manual Deployment',
    subtitle: '2,000 supplies — place units anywhere; enemy matches your unit count (any map size).',
  },
  presetForce: {
    id: 'presetForce',
    name: 'Preset Battle Group',
    subtitle:
      'Auto-deploy combined-arms forces (any map). Choose Small / Medium / Large — Large unavailable on Berlin.',
  },
};

export const LAST_STAND_DEPLOY_MODE_LIST = Object.values(LAST_STAND_DEPLOY_MODES);

/** @deprecated Preset no longer requires a large map. */
export const LAST_STAND_PRESET_MIN_MAP_SIZE = 'large';

export const LAST_STAND_PRESET_SIZES = {
  small: {
    id: 'small',
    name: 'Small',
    subtitle: '~24 combat units per side — skirmish battle group with signals support.',
  },
  medium: {
    id: 'medium',
    name: 'Medium',
    subtitle: '~38 combat units per side — balanced engagement with signals support (default).',
  },
  large: {
    id: 'large',
    name: 'Large',
    subtitle: '~68 combat units per side — full field force with signals support (not on Berlin).',
  },
};

export const LAST_STAND_PRESET_SIZE_LIST = Object.values(LAST_STAND_PRESET_SIZES);
export const DEFAULT_LAST_STAND_PRESET_SIZE = 'medium';

/**
 * Large open-field battle group (~67 combat elements per side).
 * Echelons: front (rifle line), support (fires & AT), reserve (armor & recon).
 */
export const LAST_STAND_PRESET_ROSTER_LARGE = [
  { type: 'infantry', count: 24, echelon: 'front' },
  { type: 'machineGun', count: 7, echelon: 'front' },
  { type: 'sniper', count: 3, echelon: 'front' },
  { type: 'radioOperator', count: 1, echelon: 'support' },
  { type: 'medic', count: 3, echelon: 'support' },
  { type: 'engineer', count: 3, echelon: 'support' },
  { type: 'mortar', count: 5, echelon: 'support' },
  { type: 'antiTankGun', count: 5, echelon: 'support' },
  { type: 'artillery', count: 4, echelon: 'support' },
  { type: 'armoredCar', count: 3, echelon: 'reserve' },
  { type: 'tank', count: 8, echelon: 'reserve' },
  { type: 'superHeavyTank', count: 2, echelon: 'reserve' },
];

/** Medium battle group (~37) — also the Berlin cap. */
export const LAST_STAND_PRESET_ROSTER_MEDIUM = [
  { type: 'infantry', count: 12, echelon: 'front' },
  { type: 'machineGun', count: 4, echelon: 'front' },
  { type: 'sniper', count: 2, echelon: 'front' },
  { type: 'radioOperator', count: 1, echelon: 'support' },
  { type: 'medic', count: 2, echelon: 'support' },
  { type: 'engineer', count: 2, echelon: 'support' },
  { type: 'mortar', count: 3, echelon: 'support' },
  { type: 'antiTankGun', count: 3, echelon: 'support' },
  { type: 'artillery', count: 2, echelon: 'support' },
  { type: 'armoredCar', count: 2, echelon: 'reserve' },
  { type: 'tank', count: 4, echelon: 'reserve' },
  { type: 'superHeavyTank', count: 1, echelon: 'reserve' },
];

/** Small skirmish group (~23). */
export const LAST_STAND_PRESET_ROSTER_SMALL = [
  { type: 'infantry', count: 8, echelon: 'front' },
  { type: 'machineGun', count: 2, echelon: 'front' },
  { type: 'sniper', count: 1, echelon: 'front' },
  { type: 'radioOperator', count: 1, echelon: 'support' },
  { type: 'medic', count: 1, echelon: 'support' },
  { type: 'engineer', count: 1, echelon: 'support' },
  { type: 'mortar', count: 2, echelon: 'support' },
  { type: 'antiTankGun', count: 2, echelon: 'support' },
  { type: 'artillery', count: 1, echelon: 'support' },
  { type: 'armoredCar', count: 1, echelon: 'reserve' },
  { type: 'tank', count: 3, echelon: 'reserve' },
  { type: 'superHeavyTank', count: 1, echelon: 'reserve' },
];

/** @deprecated Prefer LAST_STAND_PRESET_ROSTER_LARGE */
export const LAST_STAND_PRESET_ROSTER = LAST_STAND_PRESET_ROSTER_LARGE;
/** @deprecated Prefer LAST_STAND_PRESET_ROSTER_MEDIUM */
export const LAST_STAND_PRESET_ROSTER_URBAN = LAST_STAND_PRESET_ROSTER_MEDIUM;

const ROSTER_BY_SIZE = {
  small: LAST_STAND_PRESET_ROSTER_SMALL,
  medium: LAST_STAND_PRESET_ROSTER_MEDIUM,
  large: LAST_STAND_PRESET_ROSTER_LARGE,
};

/** True when large preset forces are too heavy for the map (Berlin / dense urban). */
export function isLastStandPresetLargeBlocked(mapDefOrId) {
  if (!mapDefOrId) return false;
  if (typeof mapDefOrId === 'string') {
    return mapDefOrId === 'berlin';
  }
  if (mapDefOrId.id === 'berlin') return true;
  return mapDefOrId.terrain === 'urban';
}

/** @deprecated use isLastStandPresetLargeBlocked */
export function usesUrbanLastStandPreset(mapDef) {
  return isLastStandPresetLargeBlocked(mapDef);
}

export function canUseLastStandPresetSize(sizeId, mapDefOrId) {
  if (!ROSTER_BY_SIZE[sizeId]) return false;
  if (sizeId === 'large' && isLastStandPresetLargeBlocked(mapDefOrId)) return false;
  return true;
}

export function resolveLastStandPresetSize(sizeId, mapDefOrId = null) {
  let size = ROSTER_BY_SIZE[sizeId] ? sizeId : DEFAULT_LAST_STAND_PRESET_SIZE;
  if (size === 'large' && isLastStandPresetLargeBlocked(mapDefOrId)) {
    size = 'medium';
  }
  return size;
}

export function getLastStandPresetRoster(mapDef = null, sizeId = DEFAULT_LAST_STAND_PRESET_SIZE) {
  const size = resolveLastStandPresetSize(sizeId, mapDef);
  return ROSTER_BY_SIZE[size];
}

export function countLastStandPresetUnits(mapDef = null, sizeId = DEFAULT_LAST_STAND_PRESET_SIZE) {
  return getLastStandPresetRoster(mapDef, sizeId).reduce((sum, slot) => sum + slot.count, 0);
}

export function isLastStandPresetDeployMode(deployMode) {
  return deployMode === 'presetForce';
}

/** @deprecated Preset works on any map size now. */
export function lastStandPresetRequiresLargeMap(_deployMode) {
  return false;
}

/** @deprecated Preset works on any map size now. */
export function canUseLastStandPresetOnMap(_deployMode, _mapSizeId = 'medium') {
  return true;
}
