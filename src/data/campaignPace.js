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
  /** Extra separation of non-frontline capture sectors in Standard. */
  capturePointSpread: 1.3,
};

/**
 * Standard uses a broader sector layout than the same theater in special modes.
 * Keep the frontline objective fixed and push flank objectives away from it.
 */
export function spreadCampaignCapturePoints(mapDef) {
  if (!mapDef?.capturePoints?.length) return mapDef;

  const spread = CAMPAIGN_BALANCE.capturePointSpread;
  const anchorX = mapDef.frontline?.x ?? 0;
  const anchorZ = mapDef.frontline?.z ?? 0;
  const edge = Math.max(12, (mapDef.size ?? 120) * 0.5 - 10);
  const capturePoints = mapDef.capturePoints.map((cp) => {
    if (cp.frontline) return { ...cp };
    return {
      ...cp,
      x: Math.max(-edge, Math.min(edge, anchorX + (cp.x - anchorX) * spread)),
      z: Math.max(-edge, Math.min(edge, anchorZ + (cp.z - anchorZ) * spread)),
    };
  });

  return { ...mapDef, capturePoints };
}

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
