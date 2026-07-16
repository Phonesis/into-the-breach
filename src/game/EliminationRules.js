/**
 * Army wipe is not elimination if the team can still reinforce from HQ.
 * Requires a living HQ and either units building, affordable production, or income.
 */

import { HQ_INCOME_RATE, CAPTURE_POINT_INCOME } from '../data/factions.js';
import { CAMPAIGN_BALANCE, isCampaignMode } from '../data/campaignPace.js';

export function teamHasProduction(team, game) {
  if (game.clearance) return false;
  if (team === 'enemy' && game.tutorial) return false;
  return !!game.production;
}

function getFactionForTeam(team, game) {
  return team === 'player' ? game.playerFaction : game.enemyFaction;
}

function getCheapestUnitCost(faction) {
  if (!faction?.units) return Infinity;
  let min = Infinity;
  for (const def of Object.values(faction.units)) {
    if (def?.hidden) continue;
    if (def?.cost != null && def.cost < min) min = def.cost;
  }
  return min === Infinity ? 0 : min;
}

/** Supplies per second from HQ + owned capture points (campaign uses slower rates). */
export function estimateTeamIncomePerSec(team, game) {
  if (game.tutorial) {
    return team === 'player' ? HQ_INCOME_RATE : 0;
  }
  if (game.clearance) return 0;

  const hq = game.hqs?.find((h) => h.team === team && !h.dead);
  if (!hq) return 0;

  const campaign = game.campaign ?? isCampaignMode(game.gameMode);
  let rate = campaign ? CAMPAIGN_BALANCE.hqIncomeRate : HQ_INCOME_RATE;
  const cpRate = campaign ? CAMPAIGN_BALANCE.captureIncomeRate : CAPTURE_POINT_INCOME;

  for (const cp of game.capturePoints ?? []) {
    if (cp.owner === team) rate += cpRate;
  }

  if (team === 'enemy' && game.difficulty?.enemyIncomeMult) {
    rate *= game.difficulty.enemyIncomeMult;
  }

  return rate;
}

export function teamIsEliminated(team, game, aliveCount) {
  if (aliveCount > 0) return false;

  const hq = game.hqs?.find((h) => h.team === team);
  if (!hq || hq.dead) return true;

  if (!teamHasProduction(team, game)) return true;

  const production = game.production;
  const resources =
    team === 'player' ? game.resources.player : game.resources.enemy;

  if (production.getQueue(team).length > 0) return false;
  if (
    production.canAffordAny(team, resources, {
      ignoreSelection: team === 'player' && game.autoBuildMode,
    })
  ) {
    return false;
  }

  // Training: only HQ destruction ends the practice.
  if (game.tutorial) {
    return team !== 'player' && resources <= 0;
  }

  // Clear Defenses: no HQ — wipe the attack force and the mission fails.
  if (game.clearance) return true;

  // Campaign / assault: field wipe only sticks if the team cannot reinforce from HQ.
  if (!game.tutorial && !game.clearance) {
    const income = estimateTeamIncomePerSec(team, game);
    const cheapest = getCheapestUnitCost(getFactionForTeam(team, game));
    if (income > 0) return false;
    return resources < cheapest;
  }

  return resources <= 0;
}
