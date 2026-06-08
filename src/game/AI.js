import { getStandoffPosition, findNearestEnemy, isInRange } from './Targeting.js';
import { isTankType } from '../units/VehicleTypes.js';

let aiTimer = 0;
let aiProdTimer = 0;

const AI_TICK_MIN = 3.2;
const AI_TICK_MAX = 5;
const AI_PROD_MIN = 8;
const AI_PROD_MAX = 13;

/** Prefer sending these types to flip neutral / enemy-held capture zones. */
const CAPTURE_UNIT_TYPES = new Set(['infantry', 'machineGun', 'armoredCar']);

export function resetAI(openingDelay = 0, firstProdDelay = 5) {
  aiTimer = Math.max(0, openingDelay);
  aiProdTimer = Math.max(0, firstProdDelay);
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
  openingCeasefire = false,
  lastStand = false,
}) {
  const d = difficulty ?? { aiTickMult: 1, aiProdMult: 1, captureChanceMult: 1, attackAggressionMult: 1 };

  aiTimer -= dt;
  if (!openingCeasefire) {
    aiProdTimer -= dt;
  }

  if (!openingCeasefire && !clearance && aiProdTimer <= 0 && production && enemyResources !== undefined) {
    const prodDelayMult = Math.min(d.aiProdMult ?? 1, 1.25);
    aiProdTimer =
      (AI_PROD_MIN + Math.random() * (AI_PROD_MAX - AI_PROD_MIN)) * prodDelayMult;
    tryProduce(production, enemyResources, spendEnemy, assault, d);
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
    if (unit.retreating) continue;

    if (clearance) {
      updateClearanceDefender(unit, alivePlayers);
      continue;
    }

    if (lastStand) {
      updateLastStandUnit(unit, alivePlayers, mapDef, d);
      continue;
    }

    if (openingCeasefire) {
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