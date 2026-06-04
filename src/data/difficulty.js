/** @typedef {typeof DIFFICULTIES.easy} DifficultyProfile */

export const DIFFICULTIES = {
  easy: {
    id: 'easy',
    name: 'Easy',
    subtitle: 'Softer AI, weaker attacks, slower enemy reinforcements.',
    enemyDamageMult: 0.62,
    enemyResourceMult: 0.7,
    enemyIncomeMult: 0.65,
    enemyArmyMult: 0.82,
    aiTickMult: 1.55,
    aiProdMult: 1.5,
    captureChanceMult: 0.55,
    attackAggressionMult: 0.65,
  },
  medium: {
    id: 'medium',
    name: 'Medium',
    subtitle: 'Balanced opponent — previous default challenge.',
    enemyDamageMult: 0.88,
    enemyResourceMult: 1,
    enemyIncomeMult: 1,
    enemyArmyMult: 1,
    aiTickMult: 1,
    aiProdMult: 1,
    captureChanceMult: 1,
    attackAggressionMult: 1,
  },
  hard: {
    id: 'hard',
    name: 'Hard',
    subtitle: 'Aggressive AI, stronger firepower, faster production.',
    enemyDamageMult: 1.08,
    enemyResourceMult: 1.3,
    enemyIncomeMult: 1.25,
    enemyArmyMult: 1.12,
    aiTickMult: 0.72,
    aiProdMult: 0.75,
    captureChanceMult: 1.35,
    attackAggressionMult: 1.3,
  },
};

export const DIFFICULTY_LIST = Object.values(DIFFICULTIES);
export const DEFAULT_DIFFICULTY = 'easy';

export function getDifficulty(id) {
  return DIFFICULTIES[id] ?? DIFFICULTIES[DEFAULT_DIFFICULTY];
}