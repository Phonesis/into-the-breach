/** Campaign-only balance — longer battles, slower snowball, more resilient forces. */

export function isCampaignMode(gameMode) {
  return gameMode === 'campaign';
}

export const CAMPAIGN_BALANCE = {
  hqMaxHp: 2000,
  unitHpMult: 1.55,
  damageMult: 0.58,
  hqIncomeRate: 2.1,
  captureIncomeRate: 4.2,
  playerStartingResources: 150,
  enemyStartingResources: 110,
  buildTimeMult: 1.65,
  /** Multiplied with difficulty.enemyArmyMult for opening forces. */
  enemyArmyMult: 1.22,
  /** Stacked on difficulty profile for campaign AI only. */
  aiProdMult: 1.55,
  aiTickMult: 1.2,
  captureChanceMult: 0.88,
  attackAggressionMult: 0.82,
};

/** Merge campaign pacing into the selected difficulty (campaign mode only). */
export function getCampaignDifficulty(base) {
  return {
    ...base,
    aiTickMult: base.aiTickMult * CAMPAIGN_BALANCE.aiTickMult,
    aiProdMult: base.aiProdMult * CAMPAIGN_BALANCE.aiProdMult,
    captureChanceMult: base.captureChanceMult * CAMPAIGN_BALANCE.captureChanceMult,
    attackAggressionMult: base.attackAggressionMult * CAMPAIGN_BALANCE.attackAggressionMult,
  };
}

export function applyCampaignUnitHp(unitOrList) {
  const list = Array.isArray(unitOrList) ? unitOrList : [unitOrList];
  for (const u of list) {
    if (!u?.def || u.dead) continue;
    u.maxHp = Math.round(u.maxHp * CAMPAIGN_BALANCE.unitHpMult);
    u.hp = u.maxHp;
  }
}