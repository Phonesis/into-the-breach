import { getStandoffPosition, findNearestEnemy, isInRange } from './Targeting.js';
import { isTankType, isVehicleUnit } from '../units/VehicleTypes.js';
import { getLastStandTactic } from '../data/lastStandTactics.js';

let aiTimer = 0;
let aiProdTimer = 0;
let aiSupportTimer = 28;

const AI_TICK_MIN = 3.2;
const AI_TICK_MAX = 5;
const AI_PROD_MIN = 8;
const AI_PROD_MAX = 13;

/** Prefer sending these types to flip neutral / enemy-held capture zones. */
const CAPTURE_UNIT_TYPES = new Set(['infantry', 'machineGun', 'armoredCar']);

export function resetAI(openingDelay = 0, firstProdDelay = 5) {
  aiTimer = Math.max(0, openingDelay);
  aiProdTimer = Math.max(0, firstProdDelay);
  aiSupportTimer = 28;
}

export function exportAIState() {
  return { timer: aiTimer, prodTimer: aiProdTimer };
}

export function importAIState({ timer = 0, prodTimer = 5 } = {}) {
  aiTimer = Math.max(0, timer);
  aiProdTimer = Math.max(0, prodTimer);
}

export function updateAI({
  enemyUnits,
  playerUnits,
  mapDef,
  dt,
  capturePoints,
  production,
  enemyResources,
  spendEnemy,
  assault,
  clearance,
  campaign,
  difficulty,
  enemyStagingPhase = false,
  lastStand = false,
  lastStandTactic = null,
  lastStandFlankSide = 1,
  enemyFireSupport = null,
}) {
  const d = difficulty ?? { aiTickMult: 1, aiProdMult: 1, captureChanceMult: 1, attackAggressionMult: 1 };

  aiTimer -= dt;
  if (!enemyStagingPhase) {
    aiProdTimer -= dt;
  }

  if (!enemyStagingPhase && !clearance && aiProdTimer <= 0 && production && enemyResources !== undefined) {
    const prodDelayMult = Math.min(d.aiProdMult ?? 1, 1.25);
    aiProdTimer =
      (AI_PROD_MIN + Math.random() * (AI_PROD_MAX - AI_PROD_MIN)) * prodDelayMult;
    tryProduce(production, enemyResources, spendEnemy, assault, d);
  }

  if (!clearance && !lastStand && !enemyStagingPhase) {
    updateAISupport(enemyFireSupport, playerUnits, dt, d);
  }

  if (aiTimer > 0) return;
  aiTimer = (AI_TICK_MIN + Math.random() * (AI_TICK_MAX - AI_TICK_MIN)) * d.aiTickMult;

  const aliveEnemies = enemyUnits;
  const alivePlayers = playerUnits;

  if (alivePlayers.length === 0 && (!assault || assault.attackerTeam === 'enemy')) return;

  const frontline = assault?.frontlineCp;
  const aiIsAttacker = assault && assault.attackerTeam === 'enemy';
  const aiIsDefender = assault && assault.defenderTeam === 'enemy';
  const needsCapture = enemyNeedsCapture(capturePoints, assault);
  let captureChance = (assault ? 0.38 : 0.48) * d.captureChanceMult;
  if (campaign) captureChance = Math.max(captureChance, 0.52);
  const frontlinePushChance = 0.35 * d.attackAggressionMult;
  const defenderEngageChance = 0.5 * d.attackAggressionMult;
  const idleAdvanceChance = 0.45 + 0.25 * (d.attackAggressionMult - 1);

  for (const unit of aliveEnemies) {
    if (unit.retreating || unit.surrendered || unit._captureExit) continue;

    if (clearance) {
      updateClearanceDefender(unit, alivePlayers);
      continue;
    }

    if (lastStand) {
      if (unit.lastStandRole) {
        updateLastStandPresetUnit(
          unit,
          alivePlayers,
          aliveEnemies,
          mapDef,
          d,
          lastStandTactic,
          lastStandFlankSide
        );
      } else {
        updateLastStandUnit(unit, alivePlayers, mapDef, d);
      }
      continue;
    }

    if (enemyStagingPhase) {
      unit.clearAttackOrder();
      unit.moveTarget = null;
      continue;
    }

    if (needsCapture && shouldPrioritizeCapture(unit, capturePoints, alivePlayers, assault, campaign)) {
      const captureTarget = pickCaptureTargetForUnit(unit, capturePoints, aliveEnemies, assault);
      if (captureTarget) {
        unit.clearAttackOrder();
        unit.moveTarget = { x: captureTarget.x, z: captureTarget.z };
        continue;
      }
    }

    const focus = pickAttackTarget(unit, alivePlayers);
    if (focus) {
      unit.setAttackOrder(focus);
      if (!isInRange(unit, focus)) {
        unit.moveTarget = getStandoffPosition(unit, focus);
      }
      continue;
    }

    if (unit.attackOrder && !unit.attackOrder.dead) continue;

    if (assault && frontline) {
      if (aiIsAttacker) {
        if (frontline.owner !== 'enemy') {
          unit.clearAttackOrder();
          unit.moveTarget = { x: frontline.x, z: frontline.z };
          continue;
        }
        const nearLine = Math.hypot(unit.position.x - frontline.x, unit.position.z - frontline.z);
        if (nearLine > 18 && Math.random() < frontlinePushChance) {
          unit.moveTarget = { x: frontline.x + (Math.random() - 0.5) * 8, z: frontline.z + (Math.random() - 0.5) * 8 };
          continue;
        }
      } else if (aiIsDefender) {
        const distLine = Math.hypot(unit.position.x - frontline.x, unit.position.z - frontline.z);
        if (distLine > 22 || frontline.owner !== 'enemy') {
          unit.clearAttackOrder();
          unit.moveTarget = { x: frontline.x - 6, z: frontline.z + (Math.random() - 0.5) * 10 };
          continue;
        }
        if (distLine < 28 && alivePlayers.length > 0 && Math.random() < defenderEngageChance) {
          const nearest = findNearestEnemy(unit, alivePlayers);
          if (nearest) {
            unit.setAttackOrder(nearest);
            continue;
          }
        }
      }
    }

    if (needsCapture) {
      const captureTarget = pickCaptureTargetForUnit(unit, capturePoints, aliveEnemies, assault);
      if (captureTarget) {
        const distCp = Math.hypot(unit.position.x - captureTarget.x, unit.position.z - captureTarget.z);
        const committedCapture =
          CAPTURE_UNIT_TYPES.has(unit.def.type) ||
          distCp < 22 ||
          (isTankType(unit.def.type) && distCp < 36 && Math.random() < (unit.def.type === 'superHeavyTank' ? 0.5 : 0.6));

        if (committedCapture || Math.random() < captureChance) {
          unit.clearAttackOrder();
          unit.moveTarget = { x: captureTarget.x, z: captureTarget.z };
          continue;
        }
      }
    }

    if (unit.moveTarget && Math.random() > idleAdvanceChance) continue;

    const nearest = findNearestEnemy(unit, alivePlayers);
    if (nearest && unit.distanceTo(nearest) < unit.def.range * 1.35) {
      unit.setAttackOrder(nearest);
      continue;
    }

    if (alivePlayers.length === 0) continue;

    if (needsCapture && CAPTURE_UNIT_TYPES.has(unit.def.type) && Math.random() < 0.65) {
      const cap = pickCaptureTargetForUnit(unit, capturePoints, aliveEnemies, assault);
      if (cap) {
        unit.clearAttackOrder();
        unit.moveTarget = { x: cap.x, z: cap.z };
        continue;
      }
    }

    const center = averagePosition(alivePlayers);
    unit.clearAttackOrder();
    unit.moveTarget = {
      x: center.x + (Math.random() - 0.5) * 10,
      z: center.z + (Math.random() - 0.5) * 10,
    };
    const half = mapDef.size / 2 - 8;
    unit.moveTarget.x = clamp(unit.moveTarget.x, -half, half);
    unit.moveTarget.z = clamp(unit.moveTarget.z, -half, half);
  }
}

function updateAISupport(support, players, dt, difficulty) {
  if (!support || players.length < 2) return;
  aiSupportTimer -= dt;
  if (aiSupportTimer > 0) return;
  aiSupportTimer = 24 + Math.random() * 18;

  const target = findSupportTarget(players);
  if (!target) return;

  const barrageChance = Math.min(0.78, 0.48 * (difficulty.attackAggressionMult ?? 1));
  if (support.isReady('barrage') && target.count >= 3 && Math.random() < barrageChance) {
    support.tryAiStrike('barrage', target.x, target.z);
    return;
  }

  if (support.isReady('creepingBarrage') && target.count >= 4 && Math.random() < barrageChance * 0.55) {
    support.tryAiStrike('creepingBarrage', target.x, target.z);
    return;
  }

  if (support.isReady('airborneDrop') && players.length >= 4 && Math.random() < 0.42) {
    support.tryAiStrike('airborneDrop', target.x, target.z);
  }
}

function findSupportTarget(players) {
  let best = null;
  let bestCount = 0;
  for (const anchor of players) {
    let count = 0;
    let sumX = 0;
    let sumZ = 0;
    for (const player of players) {
      if (Math.hypot(player.position.x - anchor.position.x, player.position.z - anchor.position.z) > 16) continue;
      count++;
      sumX += player.position.x;
      sumZ += player.position.z;
    }
    if (count > bestCount) {
      bestCount = count;
      best = { x: sumX / count, z: sumZ / count, count };
    }
  }
  return best;
}

function shouldPrioritizeCapture(unit, points, players, assault, campaign) {
  if (!points?.length || assault) return false;
  const cap = pickCaptureTargetForUnit(unit, points, [], assault);
  if (!cap) return false;

  if (CAPTURE_UNIT_TYPES.has(unit.def.type)) {
    const distCp = Math.hypot(unit.position.x - cap.x, unit.position.z - cap.z);
    const nearestPlayer = findNearestEnemy(unit, players);
    if (!nearestPlayer) return true;
    const distEnemy = unit.distanceTo(nearestPlayer);
    if (campaign) return distCp < 55 || distEnemy > unit.def.range * 1.05;
    return distCp < 42 || distEnemy > unit.def.range * 1.2;
  }

  if (isTankType(unit.def.type)) {
    const distCp = Math.hypot(unit.position.x - cap.x, unit.position.z - cap.z);
    return distCp < 28;
  }

  return false;
}

function enemyNeedsCapture(points, assault) {
  if (!points?.length) return false;
  if (assault?.frontlineCp && assault.attackerTeam === 'enemy' && assault.frontlineCp.owner !== 'enemy') {
    return true;
  }
  return points.some((p) => !p.isFrontline && p.owner !== 'enemy');
}

function pickPresetAttackTarget(unit, players) {
  if (unit.def?.type === 'antiTankGun' || unit.def?.type === 'tank' || unit.def?.type === 'superHeavyTank') {
    let best = null;
    let bestScore = Infinity;
    for (const foe of players) {
      if (foe.dead || foe.team === unit.team) continue;
      const d = unit.distanceTo(foe);
      if (d > unit.def.range * 1.25) continue;
      const vehicle = isVehicleUnit(foe.def?.type);
      const tank = isTankType(foe.def?.type);
      const score = d - (tank ? 100 : vehicle ? 55 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = foe;
      }
    }
    if (best) return best;
  }
  return pickAttackTarget(unit, players);
}

function countAlliesInRole(allies, role, nearUnit, radius) {
  let n = 0;
  for (const a of allies) {
    if (a.dead || a.id === nearUnit.id || a.lastStandRole !== role) continue;
    if (nearUnit.distanceTo(a) <= radius) n++;
  }
  return n;
}

function getPresetAdvancePoint(mapDef, players, mode, flankSide, spread) {
  const cluster = averagePosition(players);
  const half = mapDef.size / 2 - 8;

  if (mode === 'flank' && mapDef?.playerBase && mapDef?.enemyBase) {
    const own = mapDef.enemyBase;
    const foe = mapDef.playerBase;
    const axisX = foe.x - own.x;
    const axisZ = foe.z - own.z;
    const len = Math.hypot(axisX, axisZ) || 1;
    const perpX = -axisZ / len;
    const perpZ = axisX / len;
    const midX = (own.x + foe.x) * 0.5;
    const midZ = (own.z + foe.z) * 0.5;
    const flankDist = (mapDef.size ?? 120) * 0.2;
    return {
      x: clamp(midX + perpX * flankSide * flankDist + (Math.random() - 0.5) * spread, -half, half),
      z: clamp(midZ + perpZ * flankSide * flankDist + (Math.random() - 0.5) * spread, -half, half),
    };
  }

  return {
    x: clamp(cluster.x + (Math.random() - 0.5) * spread, -half, half),
    z: clamp(cluster.z + (Math.random() - 0.5) * spread, -half, half),
  };
}

function findLeadRecon(allies) {
  let best = null;
  let bestDist = -1;
  for (const a of allies) {
    if (a.dead || a.lastStandRole !== 'recon') continue;
    if (!a.moveTarget && !a.attackOrder) continue;
    const dist = Math.hypot(a.position.x, a.position.z);
    if (dist > bestDist) {
      bestDist = dist;
      best = a;
    }
  }
  return best;
}

/** Preset Last Stand — combined arms behavior varies by enemy battle plan. */
function updateLastStandPresetUnit(
  unit,
  players,
  allies,
  mapDef,
  difficulty,
  lastStandTactic,
  flankSide = 1
) {
  const d = difficulty ?? { attackAggressionMult: 1 };
  const tactic = lastStandTactic ?? getLastStandTactic('armoredThrust');
  const ai = tactic.ai ?? getLastStandTactic('armoredThrust').ai;
  const role = unit.lastStandRole ?? 'line';
  const hold = unit.defensiveHold;
  const isDefensive = unit.lastStandStance === 'defend' || (!!hold && unit.lastStandStance !== 'attack');
  const focus = pickPresetAttackTarget(unit, players);

  if (role === 'armor' || role === 'recon') {
    if (focus) {
      unit.setAttackOrder(focus);
      if (!isInRange(unit, focus)) {
        unit.moveTarget = getStandoffPosition(unit, focus);
      }
      return;
    }

    if (ai.armorMode === 'hold' && role === 'armor' && isDefensive) {
      if (hold) {
        const dist = Math.hypot(unit.position.x - hold.x, unit.position.z - hold.z);
        if (dist > hold.radius) {
          unit.clearAttackOrder();
          unit.moveTarget = { x: hold.x, z: hold.z };
        } else {
          unit.clearAttackOrder();
          unit.moveTarget = null;
        }
      }
      return;
    }

    if (role === 'armor' && ai.armorMode === 'followRecon') {
      const leadRecon = findLeadRecon(allies);
      if (leadRecon?.moveTarget) {
        unit.clearAttackOrder();
        unit.moveTarget = {
          x: leadRecon.moveTarget.x + (Math.random() - 0.5) * 10,
          z: leadRecon.moveTarget.z + (Math.random() - 0.5) * 10,
        };
        const half = mapDef.size / 2 - 8;
        unit.moveTarget.x = clamp(unit.moveTarget.x, -half, half);
        unit.moveTarget.z = clamp(unit.moveTarget.z, -half, half);
        return;
      }
    }

    unit.clearAttackOrder();
    const spread =
      role === 'recon'
        ? ai.armorFlankSpread * 1.35
        : ai.armorFlankSpread * (ai.armorMode === 'flank' ? 1.1 : 1);
    unit.moveTarget = getPresetAdvancePoint(
      mapDef,
      players,
      role === 'recon' ? 'center' : ai.armorMode,
      flankSide,
      spread
    );
    return;
  }

  if (role === 'line') {
    if (!isDefensive && players.length > 0) {
      if (focus) {
        unit.setAttackOrder(focus);
        if (!isInRange(unit, focus)) {
          unit.moveTarget = getStandoffPosition(unit, focus);
        }
        return;
      }
      const advanceChance = (ai.infantryAdvanceMult ?? 0.55) * 0.32 * d.attackAggressionMult;
      if (Math.random() < advanceChance) {
        unit.clearAttackOrder();
        unit.moveTarget = getPresetAdvancePoint(mapDef, players, 'center', flankSide, 14);
        return;
      }
    }

    if (isDefensive && countAlliesInRole(allies, 'armor', unit, 42) > 0) {
      const armorLead = allies.find(
        (a) =>
          !a.dead &&
          a.lastStandRole === 'armor' &&
          a.lastStandStance === 'attack' &&
          unit.distanceTo(a) < 42
      );
      const followChance = 0.28 * (ai.lineFollowArmorMult ?? 1) * d.attackAggressionMult;
      if (
        armorLead &&
        (armorLead.attackOrder || armorLead.moveTarget) &&
        Math.random() < followChance
      ) {
        unit.lastStandStance = 'attack';
        unit.defensiveHold = null;
        if (armorLead.attackOrder && !armorLead.attackOrder.dead) {
          unit.setAttackOrder(armorLead.attackOrder);
          unit.moveTarget = getStandoffPosition(unit, armorLead.attackOrder);
        } else if (armorLead.moveTarget) {
          unit.moveTarget = {
            x: armorLead.moveTarget.x + (Math.random() - 0.5) * 8,
            z: armorLead.moveTarget.z + (Math.random() - 0.5) * 8,
          };
        }
        return;
      }
    }
  }

  if (role === 'arty' || role === 'support') {
    if (focus) {
      unit.setAttackOrder(focus);
      if (!isInRange(unit, focus)) {
        const distToHold = hold ? Math.hypot(unit.position.x - hold.x, unit.position.z - hold.z) : Infinity;
        if (hold && distToHold < hold.radius * 1.8) {
          unit.moveTarget = getStandoffPosition(unit, focus);
        }
      }
      return;
    }
    if (hold) {
      const dist = Math.hypot(unit.position.x - hold.x, unit.position.z - hold.z);
      if (dist > hold.radius) {
        unit.clearAttackOrder();
        unit.moveTarget = { x: hold.x, z: hold.z };
      } else {
        unit.clearAttackOrder();
        unit.moveTarget = null;
      }
    }
    return;
  }

  updateLastStandUnit(unit, players, mapDef, difficulty);
}

function updateLastStandUnit(unit, players, mapDef, difficulty) {
  const d = difficulty ?? { attackAggressionMult: 1 };
  const hold = unit.defensiveHold;
  const isDefensive = unit.lastStandStance === 'defend' || (!!hold && unit.lastStandStance !== 'attack');
  const focus = pickAttackTarget(unit, players);

  if (isDefensive) {
    const engageChance = 0.55 * d.attackAggressionMult;

    if (focus) {
      unit.setAttackOrder(focus);
      if (!isInRange(unit, focus)) {
        const distToHold = hold ? Math.hypot(unit.position.x - hold.x, unit.position.z - hold.z) : Infinity;
        const chaseRadius = hold ? hold.radius * 2.4 : 22;
        if (
          unit.distanceTo(focus) < unit.def.range * 1.05 ||
          (hold && distToHold < chaseRadius && Math.random() < engageChance)
        ) {
          unit.moveTarget = getStandoffPosition(unit, focus);
        } else if (hold && distToHold > hold.radius) {
          unit.clearAttackOrder();
          unit.moveTarget = {
            x: hold.x + (Math.random() - 0.5) * 4,
            z: hold.z + (Math.random() - 0.5) * 4,
          };
        }
      }
      return;
    }

    if (hold) {
      const dist = Math.hypot(unit.position.x - hold.x, unit.position.z - hold.z);
      if (dist > hold.radius) {
        unit.clearAttackOrder();
        unit.moveTarget = {
          x: hold.x + (Math.random() - 0.5) * 3,
          z: hold.z + (Math.random() - 0.5) * 3,
        };
      } else {
        unit.clearAttackOrder();
        unit.moveTarget = null;
      }
      return;
    }
  }

  if (focus) {
    unit.setAttackOrder(focus);
    if (!isInRange(unit, focus)) {
      unit.moveTarget = getStandoffPosition(unit, focus);
    }
    return;
  }

  if (unit.attackOrder && !unit.attackOrder.dead) return;

  const nearest = findNearestEnemy(unit, players);
  if (nearest && unit.distanceTo(nearest) < unit.def.range * 1.75) {
    unit.setAttackOrder(nearest);
    unit.moveTarget = getStandoffPosition(unit, nearest);
    return;
  }

  if (players.length === 0) return;

  const advanceChance = 0.42 + 0.28 * (d.attackAggressionMult - 1);
  if (Math.random() < advanceChance) {
    const center = averagePosition(players);
    unit.clearAttackOrder();
    unit.moveTarget = {
      x: center.x + (Math.random() - 0.5) * 14,
      z: center.z + (Math.random() - 0.5) * 14,
    };
    const half = mapDef.size / 2 - 8;
    unit.moveTarget.x = clamp(unit.moveTarget.x, -half, half);
    unit.moveTarget.z = clamp(unit.moveTarget.z, -half, half);
  }
}

function updateClearanceDefender(unit, players) {
  const hold = unit.defensiveHold;
  const focus = pickAttackTarget(unit, players);
  if (focus) {
    unit.setAttackOrder(focus);
    if (!isInRange(unit, focus)) {
      unit.moveTarget = getStandoffPosition(unit, focus);
    }
    return;
  }

  if (unit.attackOrder && !unit.attackOrder.dead) return;

  if (hold) {
    const dx = unit.position.x - hold.x;
    const dz = unit.position.z - hold.z;
    const dist = Math.hypot(dx, dz);
    if (dist > hold.radius) {
      unit.clearAttackOrder();
      unit.moveTarget = {
        x: hold.x + (Math.random() - 0.5) * 4,
        z: hold.z + (Math.random() - 0.5) * 4,
      };
      return;
    }
  }

  unit.clearAttackOrder();
  unit.moveTarget = null;
}

function pickAttackTarget(unit, players) {
  if (unit.attackOrder && !unit.attackOrder.dead) {
    if (isInRange(unit, unit.attackOrder) || unit._chasingAttack) return unit.attackOrder;
  }
  const nearest = findNearestEnemy(unit, players);
  if (!nearest) return null;
  const d = unit.distanceTo(nearest);
  if (d <= unit.def.range * 1.15) return nearest;
  if (d < unit.def.range * 1.5 && (unit.def.type === 'infantry' || unit.def.type === 'sniper')) return nearest;
  return null;
}

function rollEnemyUnitType(assault, difficulty) {
  const d = difficulty ?? { attackAggressionMult: 1 };
  const heavyBias = Math.min(0.18, 0.08 * d.attackAggressionMult);
  const roll = Math.random();
  if (assault && assault.attackerTeam === 'enemy') {
    if (roll < 0.44) return 'infantry';
    if (roll < 0.64) return 'infantry';
    if (roll < 0.74) return 'armoredCar';
    if (roll < 0.84) return 'sniper';
    if (roll < 0.88) return 'mortar';
    if (roll < 0.94) return 'antiTankGun';
    if (roll < 0.98) return 'tank';
    return 'superHeavyTank';
  }
  if (roll < 0.48 - heavyBias) return 'infantry';
  if (roll < 0.54) return 'medic';
  if (roll < 0.6) return 'engineer';
  if (roll < 0.68) return 'infantry';
  if (roll < 0.76) return 'sniper';
  if (roll < 0.84) return 'armoredCar';
  if (roll < 0.86) return 'mortar';
  if (roll < 0.9 - heavyBias * 0.35) return 'antiTankGun';
  if (roll < 0.93 - heavyBias * 0.45) return 'artillery';
  if (roll < 0.96 - heavyBias * 0.35) return 'tank';
  return 'superHeavyTank';
}

function tryProduce(production, resources, spend, assault, difficulty) {
  const pick = rollEnemyUnitType(assault, difficulty);
  const tryOrder = [
    pick,
    'infantry',
    'medic',
    'engineer',
    'machineGun',
    'mortar',
    'antiTankGun',
    'armoredCar',
    'sniper',
    'tank',
    'artillery',
    'superHeavyTank',
  ];
  const seen = new Set();
  for (const type of tryOrder) {
    if (seen.has(type)) continue;
    seen.add(type);
    if (production.canEnqueue('enemy', type, resources)) {
      return production.enqueue('enemy', type, spend);
    }
  }
  return false;
}

/** Nearest neutral or player-held point for this unit (campaign capture pushes). */
function pickCaptureTargetForUnit(unit, points, allies, assault) {
  if (!points?.length) return null;

  if (assault?.frontlineCp && assault.attackerTeam === 'enemy' && assault.frontlineCp.owner !== 'enemy') {
    return assault.frontlineCp;
  }

  const neutral = points.filter((p) => !p.isFrontline && !p.owner);
  const contest = points.filter((p) => !p.isFrontline && p.owner !== 'enemy');
  const pool = neutral.length ? neutral : contest;
  if (!pool.length) return assault?.frontlineCp ?? null;

  let best = null;
  let bestScore = Infinity;
  for (const p of pool) {
    const dist = Math.hypot(unit.position.x - p.x, unit.position.z - p.z);
    const alliesNear = allies.filter(
      (u) => Math.hypot(u.position.x - p.x, u.position.z - p.z) < 16
    ).length;
    const score = dist + alliesNear * 12 + (p.owner === 'player' ? 8 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

function averagePosition(units) {
  let x = 0;
  let z = 0;
  for (const u of units) {
    x += u.position.x;
    z += u.position.z;
  }
  return { x: x / units.length, z: z / units.length };
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}