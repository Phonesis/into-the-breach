import { DIFFICULTIES, DEFAULT_DIFFICULTY } from '../data/difficulty.js';

export const GAME_SETTING_KEYS = Object.freeze({
  unitFieldIcons: 'ww2-rts-unit-field-icons',
  unitStatus: 'ww2-rts-unit-status-visible',
  frontline: 'ww2-rts-frontline-visible',
  capturePoints: 'ww2-rts-capture-points-visible',
  unitRangeRings: 'ww2-rts-unit-range-rings-visible',
  seekCover: 'ww2-rts-seek-cover-mode',
  radioOperatorAutoMove: 'ww2-rts-radio-operator-auto-move',
  pursueTargets: 'ww2-rts-pursue-targets-by-default',
  minimap: 'ww2-rts-minimap-visible',
  autoBuildClassic: 'ww2-rts-auto-build-mode-classic',
  autoBuildBaseBuilding: 'ww2-rts-auto-build-mode-base-building',
  autoBuildLegacy: 'ww2-rts-auto-build-mode',
  artilleryAutoFire: 'ww2-rts-artillery-auto-fire',
  debrisRetention: 'ww2-rts-debris-retention',
  tabletMode: 'ww2-rts-tablet-mode',
  difficulty: 'ww2-rts-difficulty',
  guideTextSize: 'ww2-rts-guide-text-size',
});

export const GUIDE_TEXT_SIZE_OPTIONS = Object.freeze(['standard', 'large', 'extra-large']);

export const DEBRIS_RETENTION_OPTIONS = Object.freeze([
  Object.freeze({ seconds: 10, label: '10 seconds' }),
  Object.freeze({ seconds: 30, label: '30 seconds' }),
  Object.freeze({ seconds: 60, label: '1 minute' }),
  Object.freeze({ seconds: 120, label: '2 minutes' }),
  Object.freeze({ seconds: 300, label: '5 minutes' }),
  Object.freeze({ seconds: Infinity, label: 'Permanent' }),
]);

const DEFAULT_DEBRIS_RETENTION_INDEX = DEBRIS_RETENTION_OPTIONS.findIndex(
  (option) => option.seconds === 120
);

function storage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readBooleanSetting(key, fallback) {
  const stored = storage()?.getItem(key);
  if (stored === null || stored === undefined) return !!fallback;
  return stored === '1';
}

export function writeBooleanSetting(key, enabled) {
  storage()?.setItem(key, enabled ? '1' : '0');
}

export function readDifficultySetting() {
  const stored = storage()?.getItem(GAME_SETTING_KEYS.difficulty);
  return Object.prototype.hasOwnProperty.call(DIFFICULTIES, stored)
    ? stored
    : DEFAULT_DIFFICULTY;
}

export function writeDifficultySetting(id) {
  const selected = Object.prototype.hasOwnProperty.call(DIFFICULTIES, id)
    ? id
    : DEFAULT_DIFFICULTY;
  storage()?.setItem(GAME_SETTING_KEYS.difficulty, selected);
  return selected;
}

export function readGuideTextSize() {
  const stored = storage()?.getItem(GAME_SETTING_KEYS.guideTextSize);
  return GUIDE_TEXT_SIZE_OPTIONS.includes(stored) ? stored : 'standard';
}

export function writeGuideTextSize(size) {
  const selected = GUIDE_TEXT_SIZE_OPTIONS.includes(size) ? size : 'standard';
  storage()?.setItem(GAME_SETTING_KEYS.guideTextSize, selected);
  return selected;
}

export function resetGameSettings() {
  const store = storage();
  if (!store) return;
  for (const key of Object.values(GAME_SETTING_KEYS)) {
    store.removeItem(key);
  }
}

export function readDebrisRetentionIndex() {
  const stored = storage()?.getItem(GAME_SETTING_KEYS.debrisRetention);
  if (stored === null || stored === undefined) {
    return DEFAULT_DEBRIS_RETENTION_INDEX;
  }
  if (stored === 'permanent') {
    return DEBRIS_RETENTION_OPTIONS.length - 1;
  }
  const seconds = Number(stored);
  const exact = DEBRIS_RETENTION_OPTIONS.findIndex((option) => option.seconds === seconds);
  return exact >= 0 ? exact : DEFAULT_DEBRIS_RETENTION_INDEX;
}

export function writeDebrisRetentionIndex(index) {
  const safeIndex = Math.max(
    0,
    Math.min(DEBRIS_RETENTION_OPTIONS.length - 1, Math.round(Number(index) || 0))
  );
  const option = DEBRIS_RETENTION_OPTIONS[safeIndex];
  storage()?.setItem(
    GAME_SETTING_KEYS.debrisRetention,
    Number.isFinite(option.seconds) ? String(option.seconds) : 'permanent'
  );
  return safeIndex;
}

export function getDebrisRetentionSeconds() {
  return DEBRIS_RETENTION_OPTIONS[readDebrisRetentionIndex()].seconds;
}
