/** Last Stand deployment options and preset combined-arms rosters. */

export const LAST_STAND_DEPLOY_MODES = {
  manual: {
    id: 'manual',
    name: 'Manual Deployment',
    subtitle: '2,000 supplies per side — place units anywhere (any map size).',
  },
  presetForce: {
    id: 'presetForce',
    name: 'Preset Battle Group',
    subtitle: 'Large map only — full combined-arms forces deploy in realistic formations.',
  },
};

export const LAST_STAND_DEPLOY_MODE_LIST = Object.values(LAST_STAND_DEPLOY_MODES);

/** Preset mode requires the grand theater scale. */
export const LAST_STAND_PRESET_MIN_MAP_SIZE = 'large';

/**
 * Realistic WW2 combined-arms battle group (~68 combat elements per side).
 * Echelons: front (rifle line), support (fires & AT), reserve (armor & recon).
 */
export const LAST_STAND_PRESET_ROSTER = [
  { type: 'infantry', count: 24, echelon: 'front' },
  { type: 'machineGun', count: 7, echelon: 'front' },
  { type: 'sniper', count: 3, echelon: 'front' },
  { type: 'medic', count: 3, echelon: 'support' },
  { type: 'engineer', count: 3, echelon: 'support' },
  { type: 'mortar', count: 5, echelon: 'support' },
  { type: 'antiTankGun', count: 5, echelon: 'support' },
  { type: 'artillery', count: 4, echelon: 'support' },
  { type: 'armoredCar', count: 3, echelon: 'reserve' },
  { type: 'tank', count: 8, echelon: 'reserve' },
  { type: 'superHeavyTank', count: 2, echelon: 'reserve' },
];

export function isLastStandPresetDeployMode(deployMode) {
  return deployMode === 'presetForce';
}

export function lastStandPresetRequiresLargeMap(deployMode) {
  return isLastStandPresetDeployMode(deployMode);
}

export function canUseLastStandPresetOnMap(deployMode, mapSizeId = 'medium') {
  if (!isLastStandPresetDeployMode(deployMode)) return true;
  return mapSizeId === LAST_STAND_PRESET_MIN_MAP_SIZE;
}