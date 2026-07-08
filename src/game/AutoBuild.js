import { UNIT_TYPE_ORDER, getProducibleUnits } from '../data/gameModes.js';
import { HQ_BASE_UNITS, isBaseBuildingCampaign } from '../data/baseBuildings.js';
import { isPlayerStagingPhase } from './OpeningDeployZone.js';

const PLAYER_TEAM = 'player';
const MAX_QUEUE = 4;

/** Target mix weights — combined-arms balance (higher = more of that type over time). */
const AUTO_BUILD_WEIGHTS = {
  infantry: 38,
  medic: 5,
  engineer: 5,
  machineGun: 11,
  sniper: 6,
  mortar: 5,
  antiTankGun: 6,
  armoredCar: 6,
  tank: 11,
  artillery: 5,
  superHeavyTank: 3,
};

export function isAutoBuildAvailable(game) {
  return !!game?.campaign && !game?.lastStand && !game?.towerDefense && !game?.tutorial;
}

/** Unit types the auto-builder may queue (all unlocked sources in base-building). */
export function getAutoBuildUnitTypes(game) {
  const faction = game?.playerFaction;
  if (!faction?.units) return [];

  if (isBaseBuildingCampaign(game)) {
    const unlocked = game.baseBuildings?.getUnlockedUnits(PLAYER_TEAM);
    if (!unlocked) return HQ_BASE_UNITS.filter((t) => faction.units[t]);
    return UNIT_TYPE_ORDER.filter((t) => unlocked.has(t) && faction.units[t]);
  }

  return getProducibleUnits(faction);
}

function countPlayerArmy(units) {
  const counts = {};
  let total = 0;
  for (const u of units) {
    if (!u || u.dead || u.team !== PLAYER_TEAM || !u.def?.type) continue;
    counts[u.def.type] = (counts[u.def.type] ?? 0) + 1;
    total++;
  }
  return { counts, total };
}

function canAutoEnqueue(game, unitType) {
  return game.production.canEnqueue(PLAYER_TEAM, unitType, game.resources.player, {
    ignoreSelection: true,
  });
}

function scoreUnitType(type, counts, total, resources, def) {
  let weight = AUTO_BUILD_WEIGHTS[type] ?? 4;
  if (total < 10 && type === 'infantry') weight *= 1.45;
  if (type === 'superHeavyTank' && (counts.tank ?? 0) < 2) return -1;
  if (type === 'artillery' && total < 14) weight *= 0.65;
  if (resources < def.cost * 1.15 && def.cost >= 180) weight *= 0.55;

  const count = counts[type] ?? 0;
  const jitter = 0.88 + Math.random() * 0.24;
  return (weight / (count + 1)) * jitter;
}

/** Pick the next unit type that best balances the army mix and fits supplies. */
export function pickAutoBuildUnit(game) {
  if (!isAutoBuildAvailable(game)) return null;

  const types = getAutoBuildUnitTypes(game);
  if (!types.length) return null;

  const { counts, total } = countPlayerArmy(game.units);
  const resources = game.resources.player;
  let best = null;
  let bestScore = -1;

  for (const type of types) {
    const def = game.playerFaction.units[type];
    if (!def || !canAutoEnqueue(game, type)) continue;

    const score = scoreUnitType(type, counts, total, resources, def);
    if (score > bestScore) {
      bestScore = score;
      best = type;
    }
  }

  return best;
}

/** Fill the production queue up to capacity when auto-build is enabled. */
export function updateAutoBuild(game) {
  if (!game?.autoBuildMode || game.cheatMode || !isAutoBuildAvailable(game)) return;
  if (!game.running || game.gameOver || game.paused) return;
  if (isPlayerStagingPhase(game)) return;

  const prod = game.production;
  let queued = 0;

  while (prod.queues.player.length < MAX_QUEUE) {
    const unitType = pickAutoBuildUnit(game);
    if (!unitType) break;

    const ok = prod.enqueue(
      PLAYER_TEAM,
      unitType,
      (cost) => game.spendResources(PLAYER_TEAM, cost),
      { ignoreSelection: true, resources: game.resources.player }
    );
    if (!ok) break;
    queued++;
  }

  if (queued > 0) {
    game.ui?.updateProduction(game);
    game.ui?.updateResources(game.resources.player, game.capturePoints, game.cheatMode);
  }
}