import {
  getStandoffPosition,
  findNearestEnemy,
  isInRange,
  isSmokeShellReady,
} from './Targeting.js';
import { isTankType, isVehicleUnit, isFootSoldier } from '../units/VehicleTypes.js';
import { getLastStandTactic } from '../data/lastStandTactics.js';
import { canSeekCover, resolveSeekCoverDestination } from './CoverSeek.js';
import { canGarrisonType, getBunkerEnterRange, getGarrisonBunkerSources, isUnitGarrisoned } from './BunkerGarrison.js';
import { getCoverStatus } from './CoverSystem.js';
import { MEDIC_AURA_RANGE } from './MedicBehavior.js';
import { ENGINEER_AURA_RANGE, ENGINEER_HQ_REPAIR_RANGE } from './EngineerBehavior.js';
import {
  canSupplyReplacementCrew,
  issueMountOrder,
} from './TankRiders.js';
import { getArmorAspect } from './ArmorPenetration.js';
import { getClearanceAttackerSpawnBase } from './ClearanceMode.js';
import { getFieldCommander } from './FieldCommander.js';
import {
  COMMANDER_AURA_RANGE,
  isUnitInspiredByCommander,
} from './CommanderBehavior.js';
import { resolveRetreatHq, startRetreat } from './RetreatBehavior.js';
import {
  getRadioOperators,
  getRadioOperatorSupportRange,
  isRadioOperatorPointObserved,
} from './RadioOperatorBehavior.js';

let aiTimer = 0;
let aiProdTimer = 0;
let aiSupportTimer = 28;
let aiDefenseTimer = 24;

const AI_TICK_MIN = 3.2;
const AI_TICK_MAX = 5;
const AI_PROD_MIN = 8;
const AI_PROD_MAX = 13;

/** Prefer sending these types to flip neutral / enemy-held capture zones. */
const CAPTURE_UNIT_TYPES = new Set(['infantry', 'machineGun', 'armoredCar']);
/** Mortars (and howitzers beyond min-range) lob over buildings. */
const MORTAR_INDIRECT_TYPES = new Set(['mortar']);
/** How far a medic/engineer will travel for a care job (game meters). */
const SUPPORT_CARE_SEEK_RANGE = 78;
/** Stand roughly this fraction of the aura from the patient/job. */
const SUPPORT_CARE_STANDOFF_FRAC = 0.42;
const AI_CREWLESS_TANK_SEEK_RANGE = 64;
const AI_TANK_MANEUVER_REASSESS_MIN = 6;
const AI_TANK_MANEUVER_REASSESS_MAX = 11;
const AI_TANK_REVERSE_MIN_DISTANCE = 10;
const AI_TANK_REVERSE_MAX_DISTANCE = 17;
const AI_TANK_FLANK_MIN_REAR_OFFSET = 12;
const AI_TANK_FLANK_MAX_REAR_OFFSET = 21;
const AI_TANK_FLANK_MIN_LATERAL_OFFSET = 14;
const AI_TANK_FLANK_MAX_LATERAL_OFFSET = 22;
const AI_RADIO_RELAY_REASSESS_MIN = 8;
const AI_RADIO_RELAY_REASSESS_MAX = 14;
const AI_RADIO_RELAY_CLUSTER_RADIUS = 16;
const AI_RADIO_RELAY_MIN_SAFE_DISTANCE = 18;
const AI_RADIO_RELAY_OPEN_MIN_SAFE_DISTANCE = 24;
const AI_RADIO_RELAY_MIN_REAR_DISTANCE = 12;
const AI_RADIO_RELAY_MAX_REAR_DISTANCE = 52;
const AI_RADIO_SAFETY_REASSESS_MIN = 5;
const AI_RADIO_SAFETY_REASSESS_MAX = 9;
const AI_RADIO_CRITICAL_HP_RATIO = 0.34;
const AI_RADIO_DANGER_HP_RATIO = 0.7;
const AI_RADIO_CRITICAL_DISTANCE = 15;
const AI_RADIO_DANGER_DISTANCE = 30;
const AI_COMMANDER_SUPPORT_MIN_OFFSET = 25;
const AI_COMMANDER_SUPPORT_MAX_OFFSET = 31;
const AI_COMMANDER_CRITICAL_DISTANCE = 18;
const AI_COMMANDER_DANGER_DISTANCE = 27;
const AI_COMMANDER_SCREEN_RADIUS = 24;
const AI_COMMANDER_SHELTER_SEEK_RANGE = 58;
const AI_COMMANDER_SAFETY_HOLD_SEC = 9;
const LAST_STAND_OPERATIONAL_REASSESS_MIN = 11;
const LAST_STAND_OPERATIONAL_REASSESS_MAX = 16;
const LAST_STAND_OPENING_REASSESS_DELAY = 13;
const LAST_STAND_ATTACK_PULSE_INTERVAL = 14;
const LAST_STAND_REGROUP_MIN_DURATION = 10;
const LAST_STAND_DEFEND_MIN_DURATION = 16;
const CLEARANCE_OPERATIONAL_REASSESS_MIN = 12;
const CLEARANCE_OPERATIONAL_REASSESS_MAX = 17;
const CLEARANCE_OPENING_REASSESS_DELAY = 12;
const CLEARANCE_ATTACK_PULSE_INTERVAL = 13;
const CLEARANCE_ATTACKER_REGROUP_MIN_DURATION = 9;
const CLEARANCE_ATTACKER_HOLD_MIN_DURATION = 10;
const CLEARANCE_DEFENDER_COUNTERATTACK_DURATION = 18;
const CLEARANCE_DEFENDER_FALLBACK_MIN_DURATION = 10;

const CLEARANCE_MOBILE_DEFENDER_TYPES = new Set([
  'infantry',
  'engineer',
  'machineGun',
  'sniper',
  'armoredCar',
  'tank',
  'tankDestroyer',
  'superHeavyTank',
]);

const LAST_STAND_FORCE_WEIGHTS = {
  commander: 0.2,
  infantry: 1,
  machineGun: 1.15,
  sniper: 0.8,
  medic: 0.35,
  engineer: 0.65,
  mortar: 1.1,
  antiTankGun: 1.45,
  artillery: 1.55,
  armoredCar: 1.35,
  tank: 2.45,
  tankDestroyer: 2.65,
  superHeavyTank: 3.45,
};

function isVisibleAttackTarget(unit, target, scenery) {
  if (!target) return false;
  if (MORTAR_INDIRECT_TYPES.has(unit.def?.type)) return true;
  // Artillery: shells clear buildings outside the min-range ring; only large
  // obstacles inside that dead zone can block the shot.
  if (unit.def?.type === 'artillery') {
    if (typeof scenery?.findArtilleryShellBuildingHit === 'function') {
      const ax = unit.position.x;
      const az = unit.position.z;
      const bx = target.position?.x ?? target.mesh?.position?.x;
      const bz = target.position?.z ?? target.mesh?.position?.z;
      if (!Number.isFinite(bx) || !Number.isFinite(bz)) return false;
      const minRange = Math.max(0, unit.def?.minRange ?? 0);
      return !scenery.findArtilleryShellBuildingHit(ax, az, bx, bz, {
        fullScan: true,
        maxDistanceFromMuzzle: minRange,
      });
    }
    return true;
  }
  return !scenery?.isLineOfFireBlocked?.(unit, target);
}

function findNearestVisibleEnemy(unit, targets, scenery) {
  if (!scenery || MORTAR_INDIRECT_TYPES.has(unit.def?.type)) {
    return findNearestEnemy(unit, targets);
  }
  return findNearestEnemy(
    unit,
    targets.filter((target) => isVisibleAttackTarget(unit, target, scenery))
  );
}

function clearAiTankManeuver(unit) {
  unit._aiTankManeuver = null;
  unit._reverseMoveOrder = false;
}

function isAiTankDestinationOpen(game, x, z) {
  return !game?.scenery?.getUnitPlacementBlocker?.(x, z, 2.1);
}

function clampAiTankDestination(mapDef, x, z) {
  const half = (mapDef?.size ?? 120) / 2 - 8;
  return {
    x: clamp(x, -half, half),
    z: clamp(z, -half, half),
  };
}

function getAiTankReverseDestination(unit, mapDef, game, random = Math.random) {
  const yaw = unit.mesh?.rotation?.y ?? 0;
  const distance =
    AI_TANK_REVERSE_MIN_DISTANCE +
    random() * (AI_TANK_REVERSE_MAX_DISTANCE - AI_TANK_REVERSE_MIN_DISTANCE);
  for (const scale of [1, 0.72, 0.5]) {
    const point = clampAiTankDestination(
      mapDef,
      unit.position.x - Math.sin(yaw) * distance * scale,
      unit.position.z - Math.cos(yaw) * distance * scale
    );
    if (isAiTankDestinationOpen(game, point.x, point.z)) return point;
  }
  return null;
}

function getAiTankFlankDestination(
  unit,
  target,
  mapDef,
  game,
  side,
  random = Math.random
) {
  const targetYaw = target.mesh?.rotation?.y ?? 0;
  const forwardX = Math.sin(targetYaw);
  const forwardZ = Math.cos(targetYaw);
  const rightX = Math.cos(targetYaw);
  const rightZ = -Math.sin(targetYaw);
  const rearOffset = Math.min(
    AI_TANK_FLANK_MAX_REAR_OFFSET,
    Math.max(AI_TANK_FLANK_MIN_REAR_OFFSET, (unit.def?.range ?? 55) * 0.38)
  );
  // Give the hull a real side approach. A small lateral offset sends the
  // route straight through the opposing tank and looks like a stalled
  // frontal advance rather than a hook around its flank.
  const lateralOffset =
    AI_TANK_FLANK_MIN_LATERAL_OFFSET +
    random() * (AI_TANK_FLANK_MAX_LATERAL_OFFSET - AI_TANK_FLANK_MIN_LATERAL_OFFSET);

  for (const flankSide of [side, -side]) {
    const point = clampAiTankDestination(
      mapDef,
      target.position.x - forwardX * rearOffset + rightX * flankSide * lateralOffset,
      target.position.z - forwardZ * rearOffset + rightZ * flankSide * lateralOffset
    );
    if (isAiTankDestinationOpen(game, point.x, point.z)) return { ...point, side: flankSide };
  }
  return null;
}

function pickAiTankManeuverTarget(unit, players, scenery) {
  let best = null;
  let bestScore = Infinity;
  const seekRange = Math.max(50, (unit.def?.range ?? 55) * 1.55);
  for (const target of players) {
    if (
      target.dead ||
      target.surrendered ||
      target._captureExit ||
      (!isTankType(target.def?.type) && target.def?.type !== 'antiTankGun') ||
      !isVisibleAttackTarget(unit, target, scenery)
    ) {
      continue;
    }
    const distance = unit.distanceTo(target);
    if (distance > seekRange) continue;
    const value =
      target.def?.type === 'superHeavyTank'
        ? 18
        : target.def?.type === 'tankDestroyer'
          ? 12
          : 8;
    const score = distance - value;
    if (score < bestScore) {
      bestScore = score;
      best = target;
    }
  }
  return best;
}

function continueAiTankManeuver(unit, players, mapDef, game, now) {
  const maneuver = unit._aiTankManeuver;
  if (!maneuver) return false;
  const target = players.find((candidate) => candidate.id === maneuver.targetId);
  if (
    !target ||
    target.dead ||
    unit._mobilityDamaged ||
    unit._crewless ||
    now >= maneuver.until
  ) {
    clearAiTankManeuver(unit);
    return false;
  }

  const remaining = Math.hypot(
    unit.position.x - maneuver.x,
    unit.position.z - maneuver.z
  );
  if (remaining <= 4.5) {
    clearAiTankManeuver(unit);
    unit.moveTarget = null;
    unit._movePath = null;
    unit._finalMoveGoal = null;
    return false;
  }

  if (unit.attackOrder !== target) unit.setAttackOrder(target);
  if (
    !unit.moveTarget ||
    Math.hypot(unit.moveTarget.x - maneuver.x, unit.moveTarget.z - maneuver.z) > 2
  ) {
    unit.moveTarget = { x: maneuver.x, z: maneuver.z };
    unit._movePath = null;
    unit._finalMoveGoal = { x: maneuver.x, z: maneuver.z };
  }
  unit._userMoveOrder = false;
  unit._reverseMoveOrder = maneuver.kind === 'reverse';
  return true;
}

/**
 * Enemy tracked armor periodically disengages in reverse or works around an
 * opposing tank for a side/rear shot. The maneuver remains stable for several
 * AI ticks so target acquisition cannot pin the hull in its first firing spot.
 */
export function tryAssignAiTankManeuver(
  unit,
  players,
  allies,
  mapDef,
  game,
  difficulty,
  { allowFlank = true } = {},
  random = Math.random
) {
  if (
    !isTankType(unit?.def?.type) ||
    unit.dead ||
    unit.retreating ||
    unit.surrendered ||
    unit._captureExit ||
    unit._mobilityDamaged ||
    unit._crewless
  ) {
    clearAiTankManeuver(unit);
    return false;
  }

  const now = game?.matchTime ?? 0;
  if (continueAiTankManeuver(unit, players, mapDef, game, now)) return true;
  if (now < (unit._aiTankManeuverNextAt ?? 0)) return false;
  unit._aiTankManeuverNextAt =
    now +
    AI_TANK_MANEUVER_REASSESS_MIN +
    random() * (AI_TANK_MANEUVER_REASSESS_MAX - AI_TANK_MANEUVER_REASSESS_MIN);

  const target = pickAiTankManeuverTarget(unit, players, game?.scenery);
  if (!target) return false;

  const distance = unit.distanceTo(target);
  const hpRatio = unit.hp / Math.max(1, unit.maxHp);
  const nearbyThreats = players.filter(
    (candidate) =>
      !candidate.dead &&
      (isTankType(candidate.def?.type) || candidate.def?.type === 'antiTankGun') &&
      unit.distanceTo(candidate) <= (unit.def?.range ?? 55) * 0.9
  ).length;
  const nearbyFriendlyArmor = allies.filter(
    (candidate) =>
      candidate !== unit &&
      !candidate.dead &&
      isTankType(candidate.def?.type) &&
      unit.distanceTo(candidate) <= 42
  ).length;
  const outnumbered = nearbyThreats > nearbyFriendlyArmor + 1;
  const yaw = unit.mesh?.rotation?.y ?? 0;
  const tx = target.position.x - unit.position.x;
  const tz = target.position.z - unit.position.z;
  const targetDistance = Math.max(0.001, Math.hypot(tx, tz));
  const targetForwardDot =
    (tx * Math.sin(yaw) + tz * Math.cos(yaw)) / targetDistance;
  const pressured =
    distance <= Math.min(48, (unit.def?.range ?? 55) * 0.82);
  const reverseChance =
    hpRatio < 0.34 ? 0.78 : hpRatio < 0.58 ? 0.48 : outnumbered ? 0.34 : 0.13;

  if (pressured && targetForwardDot >= 0.32 && random() < reverseChance) {
    const destination = getAiTankReverseDestination(unit, mapDef, game, random);
    if (destination) {
      unit.setAttackOrder(target);
      unit.moveTarget = { ...destination };
      unit._movePath = null;
      unit._finalMoveGoal = { ...destination };
      unit._userMoveOrder = false;
      unit._reverseMoveOrder = true;
      unit._aiTankManeuver = {
        kind: 'reverse',
        targetId: target.id,
        x: destination.x,
        z: destination.z,
        until: now + 7 + random() * 4,
      };
      return true;
    }
  }

  const targetIsArmored = isTankType(target.def?.type);
  const targetAspect = targetIsArmored ? getArmorAspect(unit, target).aspect : 'front';
  if (!allowFlank || hpRatio < 0.3 || targetAspect !== 'front') {
    return false;
  }
  const aggression = difficulty?.attackAggressionMult ?? 1;
  const closeContact = distance <= (unit.def?.range ?? 55) * 1.05;
  const targetIsActivelyEngaging =
    target.attackOrder === unit || target.target === unit;
  const valuableTarget =
    target.def?.type === 'tankDestroyer' || target.def?.type === 'superHeavyTank';
  // A tank that has a frontal armor problem should usually try to solve it;
  // the previous 25%-base roll made a flank an occasional novelty, especially
  // on Easy and during the long gaps between reassessments.
  const flankChance = clamp(
    0.36 +
      (aggression - 1) * 0.14 +
      (closeContact ? 0.18 : 0.06) +
      (targetIsActivelyEngaging ? 0.12 : 0) +
      (valuableTarget ? 0.06 : 0) +
      (outnumbered ? 0.05 : 0),
    0.28,
    0.72
  );
  if (random() >= flankChance) return false;

  const side = ((unit.id ?? 0) & 1) === 0 ? 1 : -1;
  const destination = getAiTankFlankDestination(
    unit,
    target,
    mapDef,
    game,
    side,
    random
  );
  if (!destination) return false;

  unit.setAttackOrder(target);
  unit.moveTarget = { x: destination.x, z: destination.z };
  unit._movePath = null;
  unit._finalMoveGoal = { x: destination.x, z: destination.z };
  unit._userMoveOrder = false;
  unit._reverseMoveOrder = false;
  unit._aiTankManeuver = {
    kind: 'flank',
    targetId: target.id,
    x: destination.x,
    z: destination.z,
    side: destination.side,
    until: now + 14 + random() * 7,
  };
  return true;
}

export function resetAI(openingDelay = 0, firstProdDelay = 5) {
  aiTimer = Math.max(0, openingDelay);
  aiProdTimer = Math.max(0, firstProdDelay);
  aiSupportTimer = 28;
  aiDefenseTimer = 24;
}

export function exportAIState() {
  return { timer: aiTimer, prodTimer: aiProdTimer };
}

export function importAIState({ timer = 0, prodTimer = 5, defenseTimer = 24 } = {}) {
  aiTimer = Math.max(0, timer);
  aiProdTimer = Math.max(0, prodTimer);
  aiDefenseTimer = Math.max(0, defenseTimer);
}

function isLastStandOperationalUnit(unit) {
  return (
    unit &&
    !unit.dead &&
    !unit.surrendered &&
    !unit._captureExit &&
    !unit._crewless &&
    unit.def?.type !== 'commander'
  );
}

function getLastStandForceSummary(units) {
  let score = 0;
  let weightedHp = 0;
  let positionWeight = 0;
  let x = 0;
  let z = 0;
  let count = 0;

  for (const unit of units) {
    if (!isLastStandOperationalUnit(unit)) continue;
    const type = unit.def?.type;
    const weight = LAST_STAND_FORCE_WEIGHTS[type] ?? 1;
    const hpRatio = clamp(unit.hp / Math.max(1, unit.maxHp), 0, 1);
    const effectiveWeight = weight * (0.35 + hpRatio * 0.65);
    score += effectiveWeight;
    weightedHp += hpRatio * weight;
    positionWeight += weight;
    x += unit.position.x * weight;
    z += unit.position.z * weight;
    count++;
  }

  return {
    score,
    hpRatio: positionWeight > 0 ? weightedHp / positionWeight : 0,
    count,
    center:
      positionWeight > 0
        ? { x: x / positionWeight, z: z / positionWeight }
        : { x: 0, z: 0 },
  };
}

function getLastStandForceScoreNear(units, center, radius) {
  let score = 0;
  for (const unit of units) {
    if (!isLastStandOperationalUnit(unit)) continue;
    if (Math.hypot(unit.position.x - center.x, unit.position.z - center.z) > radius) {
      continue;
    }
    const weight = LAST_STAND_FORCE_WEIGHTS[unit.def?.type] ?? 1;
    const hpRatio = clamp(unit.hp / Math.max(1, unit.maxHp), 0, 1);
    score += weight * (0.35 + hpRatio * 0.65);
  }
  return score;
}

function getLastStandDoctrineAttackBias(tactic) {
  const ai = tactic?.ai ?? {};
  let bias = 1;
  if (ai.armorMode === 'hold') bias -= 0.1;
  if (ai.armorMode === 'flank') bias += 0.08;
  if (ai.armorMode === 'center') bias += 0.05;
  bias += clamp(((ai.infantryAdvanceMult ?? 0.65) - 0.65) * 0.12, -0.08, 0.12);
  return clamp(bias, 0.8, 1.18);
}

function getLastStandNearestForceDistance(enemies, players) {
  let nearest = Infinity;
  for (const enemy of enemies) {
    if (!isLastStandOperationalUnit(enemy)) continue;
    for (const player of players) {
      if (!isLastStandOperationalUnit(player)) continue;
      nearest = Math.min(nearest, enemy.distanceTo(player));
    }
  }
  return nearest;
}

function getLastStandIdleFrontRatio(enemies) {
  let frontCount = 0;
  let idleCount = 0;
  for (const unit of enemies) {
    if (!isLastStandOperationalUnit(unit)) continue;
    const role = unit.lastStandRole ?? roleFromUnitType(unit.def?.type);
    if (role !== 'line' && role !== 'armor' && role !== 'recon') continue;
    frontCount++;
    const hasTarget = unit.attackOrder && !unit.attackOrder.dead;
    if (!hasTarget && !unit.moveTarget && !unit._aiTankManeuver) idleCount++;
  }
  return frontCount > 0 ? idleCount / frontCount : 0;
}

function getLastStandRegroupReadiness(enemies) {
  let assigned = 0;
  let ready = 0;
  for (const unit of enemies) {
    if (!isLastStandOperationalUnit(unit) || !unit.defensiveHold) continue;
    assigned++;
    const hold = unit.defensiveHold;
    const distance = Math.hypot(unit.position.x - hold.x, unit.position.z - hold.z);
    if (distance <= Math.max(5, hold.radius * 0.55)) ready++;
  }
  return assigned > 0 ? ready / assigned : 0;
}

function clampLastStandPoint(mapDef, point) {
  const half = (mapDef?.size ?? 120) / 2 - 8;
  return {
    x: clamp(point.x, -half, half),
    z: clamp(point.z, -half, half),
  };
}

function getLastStandBattleAxis(mapDef) {
  const own = mapDef?.enemyBase ?? { x: 0, z: 0 };
  const foe = mapDef?.playerBase ?? { x: -own.x, z: -own.z };
  const dx = foe.x - own.x;
  const dz = foe.z - own.z;
  const length = Math.hypot(dx, dz) || 1;
  return {
    forwardX: dx / length,
    forwardZ: dz / length,
    perpendicularX: -dz / length,
    perpendicularZ: dx / length,
  };
}

function issueLastStandRegroup(
  enemies,
  players,
  mapDef,
  operational,
  forceRatio
) {
  const enemySummary = getLastStandForceSummary(enemies);
  const playerSummary = getLastStandForceSummary(players);
  const ownBase = mapDef?.enemyBase ?? enemySummary.center;
  let retreatX = ownBase.x - enemySummary.center.x;
  let retreatZ = ownBase.z - enemySummary.center.z;
  let retreatLength = Math.hypot(retreatX, retreatZ);
  if (retreatLength < 1) {
    retreatX = enemySummary.center.x - playerSummary.center.x;
    retreatZ = enemySummary.center.z - playerSummary.center.z;
    retreatLength = Math.hypot(retreatX, retreatZ) || 1;
  }
  retreatX /= retreatLength;
  retreatZ /= retreatLength;

  const fallbackDistance = clamp(13 + Math.max(0, 0.8 - forceRatio) * 16, 13, 24);
  const anchor = clampLastStandPoint(mapDef, {
    x: enemySummary.center.x + retreatX * fallbackDistance,
    z: enemySummary.center.z + retreatZ * fallbackDistance,
  });
  operational.anchor = anchor;

  const axis = getLastStandBattleAxis(mapDef);
  for (const unit of enemies) {
    if (!isLastStandOperationalUnit(unit)) continue;
    const role = unit.lastStandRole ?? roleFromUnitType(unit.def?.type);
    const lateralSlot = (((unit.id ?? 0) * 37) % 11) - 5;
    const lateral = lateralSlot * (role === 'armor' || role === 'recon' ? 3.2 : 2.35);
    const rearOffset =
      role === 'arty' ? -11 : role === 'support' ? -6 : role === 'armor' ? 3 : 0;
    const destination = clampLastStandPoint(mapDef, {
      x:
        anchor.x +
        axis.perpendicularX * lateral +
        axis.forwardX * rearOffset,
      z:
        anchor.z +
        axis.perpendicularZ * lateral +
        axis.forwardZ * rearOffset,
    });

    clearAiTankManeuver(unit);
    unit.clearAttackOrder();
    unit.lastStandStance = 'regroup';
    unit.defensiveHold = {
      x: destination.x,
      z: destination.z,
      radius: Math.max(7, (unit.def?.type === 'artillery' ? 12 : 9)),
    };
    unit.moveTarget = { x: destination.x, z: destination.z };
    unit._movePath = null;
    unit._userMoveOrder = false;
    unit._reverseMoveOrder = false;
  }
}

function issueLastStandDefense(enemies, mapDef, operational) {
  const summary = getLastStandForceSummary(enemies);
  operational.anchor = clampLastStandPoint(mapDef, summary.center);

  for (const unit of enemies) {
    if (!isLastStandOperationalUnit(unit)) continue;
    clearAiTankManeuver(unit);
    unit.lastStandStance = 'defend';
    unit.defensiveHold = {
      x: unit.position.x,
      z: unit.position.z,
      radius:
        unit.def?.type === 'artillery' || unit.def?.type === 'mortar'
          ? 12
          : isTankType(unit.def?.type)
            ? 16
            : 11,
    };
    if (!unit.attackOrder || unit.attackOrder.dead || !isInRange(unit, unit.attackOrder)) {
      unit.clearAttackOrder();
    }
    unit.moveTarget = null;
    unit._movePath = null;
    unit._userMoveOrder = false;
    unit._reverseMoveOrder = false;
  }
}

function issueLastStandAttackWave(
  enemies,
  players,
  mapDef,
  tactic,
  flankSide,
  scenery
) {
  const ai = tactic?.ai ?? getLastStandTactic('armoredThrust').ai;
  for (const unit of enemies) {
    if (!isLastStandOperationalUnit(unit)) continue;
    const role = unit.lastStandRole ?? roleFromUnitType(unit.def?.type);
    if (role === 'arty' || role === 'support') {
      unit.lastStandStance = 'defend';
      if (!unit.defensiveHold) {
        unit.defensiveHold = {
          x: unit.position.x,
          z: unit.position.z,
          radius: unit.def?.type === 'artillery' || unit.def?.type === 'mortar' ? 12 : 10,
        };
      }
      continue;
    }

    unit.lastStandStance = 'attack';
    unit.defensiveHold = null;
    const focus = pickPresetAttackTarget(unit, players, scenery);
    if (focus) {
      unit.setAttackOrder(focus);
      if (!isInRange(unit, focus)) {
        unit.moveTarget = getStandoffPosition(unit, focus);
      }
      continue;
    }

    if (unit.attackOrder && !unit.attackOrder.dead) continue;
    const mode =
      role === 'recon'
        ? 'center'
        : role === 'armor'
          ? ai.armorMode
          : 'center';
    const spread =
      role === 'recon'
        ? Math.max(20, (ai.armorFlankSpread ?? 14) * 1.3)
        : role === 'armor'
          ? Math.max(14, ai.armorFlankSpread ?? 14)
          : 18;
    unit.clearAttackOrder();
    unit.moveTarget = getPresetAdvancePoint(
      mapDef,
      players,
      mode,
      flankSide,
      spread
    );
    unit._movePath = null;
    unit._userMoveOrder = false;
  }
}

function setLastStandOperationalMode(
  mode,
  operational,
  enemies,
  players,
  mapDef,
  tactic,
  flankSide,
  scenery,
  now,
  forceRatio
) {
  operational.mode = mode;
  operational.since = now;
  operational.cycle = (operational.cycle ?? 0) + 1;

  if (mode === 'regroup') {
    issueLastStandRegroup(enemies, players, mapDef, operational, forceRatio);
  } else if (mode === 'defend') {
    issueLastStandDefense(enemies, mapDef, operational);
  } else {
    issueLastStandAttackWave(
      enemies,
      players,
      mapDef,
      tactic,
      flankSide,
      scenery
    );
    operational.attackPulseAt = now + LAST_STAND_ATTACK_PULSE_INTERVAL;
  }
}

function updateLastStandOperationalPlan(
  game,
  enemies,
  players,
  mapDef,
  tactic,
  flankSide,
  difficulty
) {
  const state = game?.lastStand;
  if (!state) return 'opening';
  const now = game?.matchTime ?? 0;
  let operational = state.enemyOperational;
  if (!operational || typeof operational !== 'object') {
    const initialSummary = getLastStandForceSummary(enemies);
    operational = {
      mode: 'opening',
      since: now,
      nextAt: now + LAST_STAND_OPENING_REASSESS_DELAY,
      attackPulseAt: now + LAST_STAND_OPENING_REASSESS_DELAY,
      cycle: 0,
      anchor: null,
      lastCenter: { ...initialSummary.center },
      lastStrength: initialSummary.score,
    };
    state.enemyOperational = operational;
    return operational.mode;
  }
  if (now < (operational.nextAt ?? 0)) return operational.mode ?? 'opening';

  const enemySummary = getLastStandForceSummary(enemies);
  const playerSummary = getLastStandForceSummary(players);
  if (enemySummary.count === 0 || playerSummary.count === 0) return operational.mode;

  const forceRatio = enemySummary.score / Math.max(0.1, playerSummary.score);
  const doctrineBias = getLastStandDoctrineAttackBias(tactic);
  const attackThreshold = clamp(0.88 / doctrineBias, 0.72, 1.08);
  const nearbyEnemyScore = getLastStandForceScoreNear(enemies, enemySummary.center, 34);
  const nearbyPlayerScore = getLastStandForceScoreNear(players, enemySummary.center, 34);
  const localPressure = nearbyPlayerScore / Math.max(0.35, nearbyEnemyScore);
  const nearestForceDistance = getLastStandNearestForceDistance(enemies, players);
  const underPressure = nearestForceDistance < 42 && localPressure > 1.2;
  const idleFrontRatio = getLastStandIdleFrontRatio(enemies);
  const age = Math.max(0, now - (operational.since ?? now));
  const previousCenter = operational.lastCenter ?? enemySummary.center;
  const distanceAdvanced = Math.hypot(
    enemySummary.center.x - previousCenter.x,
    enemySummary.center.z - previousCenter.z
  );
  const attackHasStalled =
    operational.mode === 'attack' &&
    age >= 10 &&
    (idleFrontRatio >= 0.32 || (distanceAdvanced < 2.5 && nearestForceDistance > 20));

  let nextMode = operational.mode ?? 'opening';
  if (nextMode === 'opening') {
    if (
      forceRatio < 0.58 ||
      (enemySummary.hpRatio < 0.43 && forceRatio < 0.82) ||
      (underPressure && forceRatio < 0.76)
    ) {
      nextMode = 'regroup';
    } else if (tactic?.id === 'defensiveBelt' && forceRatio < 1.18) {
      nextMode = 'defend';
    } else {
      nextMode = 'attack';
    }
  } else if (nextMode === 'attack') {
    if (
      forceRatio < 0.52 ||
      (enemySummary.hpRatio < 0.4 && forceRatio < 0.78) ||
      (underPressure && forceRatio < 0.72)
    ) {
      nextMode = 'regroup';
    }
  } else if (nextMode === 'regroup') {
    const readiness = getLastStandRegroupReadiness(enemies);
    if (
      forceRatio >= 1.08 &&
      enemySummary.hpRatio >= 0.58 &&
      age >= LAST_STAND_REGROUP_MIN_DURATION
    ) {
      nextMode = 'attack';
    } else if (
      age >= LAST_STAND_REGROUP_MIN_DURATION &&
      (readiness >= 0.55 || age >= 22)
    ) {
      nextMode = 'defend';
    }
  } else if (nextMode === 'defend') {
    if (forceRatio < 0.42 && underPressure && age >= 12) {
      nextMode = 'regroup';
    } else if (
      age >= LAST_STAND_DEFEND_MIN_DURATION &&
      (
        forceRatio >= attackThreshold ||
        (nearestForceDistance > 38 && forceRatio >= 0.55 && age >= 28) ||
        (underPressure && forceRatio >= 0.68 && doctrineBias >= 0.96)
      )
    ) {
      nextMode = 'attack';
    }
  }

  if (nextMode !== operational.mode) {
    setLastStandOperationalMode(
      nextMode,
      operational,
      enemies,
      players,
      mapDef,
      tactic,
      flankSide,
      game?.scenery,
      now,
      forceRatio
    );
  } else if (
    nextMode === 'attack' &&
    (attackHasStalled || now >= (operational.attackPulseAt ?? 0))
  ) {
    issueLastStandAttackWave(
      enemies,
      players,
      mapDef,
      tactic,
      flankSide,
      game?.scenery
    );
    operational.attackPulseAt = now + LAST_STAND_ATTACK_PULSE_INTERVAL;
  }

  operational.nextAt =
    now +
    (
      LAST_STAND_OPERATIONAL_REASSESS_MIN +
      Math.random() *
        (LAST_STAND_OPERATIONAL_REASSESS_MAX - LAST_STAND_OPERATIONAL_REASSESS_MIN)
    ) *
      Math.min(difficulty?.aiTickMult ?? 1, 1.2);
  operational.lastCenter = { ...enemySummary.center };
  operational.lastStrength = enemySummary.score;
  operational.forceRatio = forceRatio;
  operational.localPressure = localPressure;
  return operational.mode;
}

function updateLastStandOperationalPosition(unit, players, mode, scenery) {
  if (mode !== 'regroup' && mode !== 'defend') return false;
  const hold = unit.defensiveHold;
  if (!hold) return false;
  const focus = pickPresetAttackTarget(unit, players, scenery);
  const distanceToHold = Math.hypot(
    unit.position.x - hold.x,
    unit.position.z - hold.z
  );

  if (focus && isInRange(unit, focus)) {
    unit.setAttackOrder(focus);
  } else {
    unit.clearAttackOrder();
  }

  if (mode === 'regroup') {
    if (distanceToHold > Math.max(4, hold.radius * 0.45)) {
      unit.moveTarget = { x: hold.x, z: hold.z };
    } else {
      unit.moveTarget = null;
    }
    return true;
  }

  if (distanceToHold > hold.radius) {
    unit.moveTarget = { x: hold.x, z: hold.z };
  } else {
    unit.moveTarget = null;
  }
  return true;
}

function getClearanceBattleAxis(mapDef) {
  const attackerBase = getClearanceAttackerSpawnBase(mapDef);
  const defenderBase = mapDef?.enemyBase ?? { x: -attackerBase.x, z: -attackerBase.z };
  const dx = defenderBase.x - attackerBase.x;
  const dz = defenderBase.z - attackerBase.z;
  const length = Math.hypot(dx, dz) || 1;
  return {
    forwardX: dx / length,
    forwardZ: dz / length,
    perpendicularX: -dz / length,
    perpendicularZ: dx / length,
  };
}

function getClearanceIdleAssaultRatio(enemies) {
  let assaultCount = 0;
  let idleCount = 0;
  for (const unit of enemies) {
    if (!isLastStandOperationalUnit(unit)) continue;
    const role = unit.clearanceAttackRole ?? roleFromUnitType(unit.def?.type);
    if (role !== 'line' && role !== 'armor') continue;
    assaultCount++;
    const hasTarget = unit.attackOrder && !unit.attackOrder.dead;
    if (!hasTarget && !unit.moveTarget && !unit._aiTankManeuver) idleCount++;
  }
  return assaultCount > 0 ? idleCount / assaultCount : 0;
}

function issueClearanceAttackerRegroup(
  enemies,
  players,
  mapDef,
  operational,
  forceRatio
) {
  const enemySummary = getLastStandForceSummary(enemies);
  const playerSummary = getLastStandForceSummary(players);
  const attackerBase = getClearanceAttackerSpawnBase(mapDef);
  let retreatX = attackerBase.x - enemySummary.center.x;
  let retreatZ = attackerBase.z - enemySummary.center.z;
  let retreatLength = Math.hypot(retreatX, retreatZ);
  if (retreatLength < 1) {
    retreatX = enemySummary.center.x - playerSummary.center.x;
    retreatZ = enemySummary.center.z - playerSummary.center.z;
    retreatLength = Math.hypot(retreatX, retreatZ) || 1;
  }
  retreatX /= retreatLength;
  retreatZ /= retreatLength;

  const fallbackDistance = clamp(12 + Math.max(0, 0.75 - forceRatio) * 15, 12, 22);
  const anchor = clampLastStandPoint(mapDef, {
    x: enemySummary.center.x + retreatX * fallbackDistance,
    z: enemySummary.center.z + retreatZ * fallbackDistance,
  });
  operational.anchor = anchor;

  const axis = getClearanceBattleAxis(mapDef);
  for (const unit of enemies) {
    if (!isLastStandOperationalUnit(unit)) continue;
    const role = unit.clearanceAttackRole ?? roleFromUnitType(unit.def?.type);
    unit.clearanceAttackRole = role;
    const lateralSlot = (((unit.id ?? 0) * 29) % 11) - 5;
    const lateral = lateralSlot * (role === 'armor' ? 3.1 : 2.3);
    const depth = role === 'support' ? -7 : role === 'armor' ? 3 : 0;
    const destination = clampLastStandPoint(mapDef, {
      x:
        anchor.x +
        axis.perpendicularX * lateral +
        axis.forwardX * depth,
      z:
        anchor.z +
        axis.perpendicularZ * lateral +
        axis.forwardZ * depth,
    });

    clearAiTankManeuver(unit);
    unit.clearAttackOrder();
    unit.defensiveHold = {
      x: destination.x,
      z: destination.z,
      radius: role === 'support' ? 11 : role === 'armor' ? 14 : 9,
    };
    unit.moveTarget = { x: destination.x, z: destination.z };
    unit._movePath = null;
    unit._userMoveOrder = false;
    unit._reverseMoveOrder = false;
  }
}

function issueClearanceAttackerHold(enemies, mapDef, operational) {
  const summary = getLastStandForceSummary(enemies);
  operational.anchor = clampLastStandPoint(mapDef, summary.center);
  for (const unit of enemies) {
    if (!isLastStandOperationalUnit(unit)) continue;
    clearAiTankManeuver(unit);
    unit.defensiveHold = {
      x: unit.position.x,
      z: unit.position.z,
      radius:
        unit.def?.type === 'artillery' || unit.def?.type === 'mortar'
          ? 12
          : isTankType(unit.def?.type)
            ? 15
            : 10,
    };
    if (!unit.attackOrder || unit.attackOrder.dead || !isInRange(unit, unit.attackOrder)) {
      unit.clearAttackOrder();
    }
    unit.moveTarget = null;
    unit._movePath = null;
    unit._reverseMoveOrder = false;
  }
}

function issueClearanceAttackWave(enemies, players, mapDef, plan, game) {
  const assaultPlan = plan ?? {
    infantryAdvance: 0.55,
    armorFollow: 0.55,
    supportHold: 0.5,
    flankBias: 0,
  };
  for (const unit of enemies) {
    if (!isLastStandOperationalUnit(unit)) continue;
    const role = unit.clearanceAttackRole ?? roleFromUnitType(unit.def?.type);
    unit.clearanceAttackRole = role;
    if (role === 'support') continue;

    unit.defensiveHold = null;
    const focus = pickAttackTarget(unit, players, game?.scenery);
    if (focus) {
      unit.setAttackOrder(focus);
      if (!isInRange(unit, focus)) {
        unit.moveTarget = getStandoffPosition(unit, focus);
      }
      continue;
    }
    if (unit.attackOrder && !unit.attackOrder.dead) continue;
    unit.clearAttackOrder();
    unit.moveTarget = getClearanceAssaultAdvancePoint(
      mapDef,
      players,
      assaultPlan,
      unit
    );
    unit._movePath = null;
    unit._userMoveOrder = false;
  }
}

function updateClearanceOperationalHoldPosition(unit, players, scenery) {
  const hold = unit.defensiveHold;
  if (!hold) return false;
  const nearest = findNearestVisibleEnemy(unit, players, scenery);
  const focus = nearest && isInRange(unit, nearest) ? nearest : null;
  if (focus) {
    unit.setAttackOrder(focus);
    unit._chasingAttack = false;
  } else {
    unit.clearAttackOrder();
  }
  const distance = Math.hypot(unit.position.x - hold.x, unit.position.z - hold.z);
  if (distance > Math.max(4, hold.radius * 0.45)) {
    unit.moveTarget = { x: hold.x, z: hold.z };
  } else {
    unit.moveTarget = null;
  }
  return true;
}

function issueClearanceDefenderFallback(enemies, mapDef, operational, forceRatio) {
  const summary = getLastStandForceSummary(enemies);
  const defenderBase = mapDef?.enemyBase ?? summary.center;
  let fallbackX = defenderBase.x - summary.center.x;
  let fallbackZ = defenderBase.z - summary.center.z;
  const length = Math.hypot(fallbackX, fallbackZ) || 1;
  fallbackX /= length;
  fallbackZ /= length;
  const distance = clamp(10 + Math.max(0, 0.7 - forceRatio) * 14, 10, 19);
  const anchor = clampLastStandPoint(mapDef, {
    x: summary.center.x + fallbackX * distance,
    z: summary.center.z + fallbackZ * distance,
  });
  operational.anchor = anchor;

  const axis = getClearanceBattleAxis(mapDef);
  for (const unit of enemies) {
    if (
      !isLastStandOperationalUnit(unit) ||
      unit._trenchId ||
      unit._garrisonBunkerId
    ) {
      continue;
    }
    const role = roleFromUnitType(unit.def?.type);
    const lateralSlot = (((unit.id ?? 0) * 31) % 9) - 4;
    const lateral = lateralSlot * (role === 'armor' ? 3.2 : 2.45);
    const depth = role === 'support' ? -5 : role === 'armor' ? 2 : 0;
    const destination = clampLastStandPoint(mapDef, {
      x:
        anchor.x +
        axis.perpendicularX * lateral +
        axis.forwardX * depth,
      z:
        anchor.z +
        axis.perpendicularZ * lateral +
        axis.forwardZ * depth,
    });
    unit._clearanceProbe = null;
    clearAiTankManeuver(unit);
    unit.clearAttackOrder();
    unit.defensiveHold = {
      x: destination.x,
      z: destination.z,
      radius: role === 'armor' ? 15 : role === 'support' ? 11 : 9,
    };
    unit.moveTarget = { x: destination.x, z: destination.z };
    unit._movePath = null;
    unit._userMoveOrder = false;
    unit._reverseMoveOrder = false;
  }
}

function settleClearanceDefenderLine(enemies) {
  for (const unit of enemies) {
    if (!isLastStandOperationalUnit(unit)) continue;
    unit._clearanceProbe = null;
    clearAiTankManeuver(unit);
    if (!unit.defensiveHold) {
      unit.defensiveHold = {
        x: unit.position.x,
        z: unit.position.z,
        radius: isTankType(unit.def?.type) ? 15 : 10,
      };
    }
    unit.clearAttackOrder();
    const hold = unit.defensiveHold;
    const distance = Math.hypot(unit.position.x - hold.x, unit.position.z - hold.z);
    unit.moveTarget =
      distance > hold.radius
        ? { x: hold.x, z: hold.z }
        : null;
    unit._userMoveOrder = false;
  }
}

function issueClearanceDefenderCounterattack(enemies, players, game, operational) {
  const candidates = enemies.filter(
    (unit) =>
      isLastStandOperationalUnit(unit) &&
      !unit._trenchId &&
      !unit._garrisonBunkerId &&
      !unit._sandbagSite &&
      !unit._trenchDigSite &&
      CLEARANCE_MOBILE_DEFENDER_TYPES.has(unit.def?.type)
  );
  if (candidates.length < 2 || players.length === 0) return false;

  const target = averagePosition(players);
  candidates.sort((a, b) => {
    const aDistance = Math.hypot(a.position.x - target.x, a.position.z - target.z);
    const bDistance = Math.hypot(b.position.x - target.x, b.position.z - target.z);
    return aDistance - bDistance;
  });
  const detachmentSize = clamp(Math.round(candidates.length * 0.24), 2, 6);
  const until = (game?.matchTime ?? 0) + CLEARANCE_DEFENDER_COUNTERATTACK_DURATION;
  for (let i = 0; i < detachmentSize; i++) {
    const unit = candidates[i];
    unit._clearanceProbe = {
      targetX: target.x,
      targetZ: target.z,
      until,
      operational: true,
    };
    unit.clearAttackOrder();
    unit.moveTarget = {
      x: target.x + (Math.random() - 0.5) * 10,
      z: target.z + (Math.random() - 0.5) * 10,
    };
    unit._userMoveOrder = false;
  }
  operational.counterattackSize = detachmentSize;
  return true;
}

function setClearanceOperationalMode(
  mode,
  focus,
  operational,
  enemies,
  players,
  mapDef,
  plan,
  game,
  now,
  forceRatio
) {
  operational.mode = mode;
  operational.focus = focus;
  operational.since = now;
  operational.cycle = (operational.cycle ?? 0) + 1;

  if (focus === 'attack') {
    if (mode === 'regroup') {
      issueClearanceAttackerRegroup(
        enemies,
        players,
        mapDef,
        operational,
        forceRatio
      );
    } else if (mode === 'hold') {
      issueClearanceAttackerHold(enemies, mapDef, operational);
    } else {
      issueClearanceAttackWave(enemies, players, mapDef, plan, game);
      operational.attackPulseAt = now + CLEARANCE_ATTACK_PULSE_INTERVAL;
    }
    return;
  }

  if (mode === 'fallback') {
    issueClearanceDefenderFallback(enemies, mapDef, operational, forceRatio);
  } else if (mode === 'counterattack') {
    if (!issueClearanceDefenderCounterattack(enemies, players, game, operational)) {
      operational.mode = 'hold';
      settleClearanceDefenderLine(enemies);
    }
  } else {
    settleClearanceDefenderLine(enemies);
  }
}

function updateClearanceOperationalPlan(
  game,
  enemies,
  players,
  mapDef,
  difficulty
) {
  if (!game?.clearance) return null;
  const now = game.matchTime ?? 0;
  const focus = game.clearanceRole === 'defend' ? 'attack' : 'defend';
  let operational = game.clearanceOperational;
  if (
    !operational ||
    typeof operational !== 'object' ||
    operational.focus !== focus
  ) {
    const summary = getLastStandForceSummary(enemies);
    operational = {
      focus,
      mode: 'opening',
      since: now,
      nextAt: now + CLEARANCE_OPENING_REASSESS_DELAY,
      attackPulseAt: now + CLEARANCE_OPENING_REASSESS_DELAY,
      cycle: 0,
      anchor: null,
      lastCenter: { ...summary.center },
      lastStrength: summary.score,
    };
    game.clearanceOperational = operational;
    return operational.mode;
  }
  if (now < (operational.nextAt ?? 0)) return operational.mode;

  const enemySummary = getLastStandForceSummary(enemies);
  const playerSummary = getLastStandForceSummary(players);
  if (enemySummary.count === 0 || playerSummary.count === 0) return operational.mode;

  const forceRatio = enemySummary.score / Math.max(0.1, playerSummary.score);
  const nearbyEnemyScore = getLastStandForceScoreNear(enemies, enemySummary.center, 34);
  const nearbyPlayerScore = getLastStandForceScoreNear(players, enemySummary.center, 34);
  const localPressure = nearbyPlayerScore / Math.max(0.35, nearbyEnemyScore);
  const nearestForceDistance = getLastStandNearestForceDistance(enemies, players);
  const underPressure = nearestForceDistance < 40 && localPressure > 1.18;
  const age = Math.max(0, now - (operational.since ?? now));
  const strengthIncrease =
    enemySummary.score > Math.max(0.1, operational.lastStrength ?? enemySummary.score) * 1.12;
  let nextMode = operational.mode ?? 'opening';

  if (focus === 'attack') {
    const idleAssaultRatio = getClearanceIdleAssaultRatio(enemies);
    const previousCenter = operational.lastCenter ?? enemySummary.center;
    const movement = Math.hypot(
      enemySummary.center.x - previousCenter.x,
      enemySummary.center.z - previousCenter.z
    );
    const stalled =
      nextMode === 'attack' &&
      age >= 9 &&
      (idleAssaultRatio >= 0.3 || (movement < 2.5 && nearestForceDistance > 18));

    if (nextMode === 'opening') {
      nextMode =
        forceRatio < 0.5 || (underPressure && forceRatio < 0.7)
          ? 'regroup'
          : 'attack';
    } else if (nextMode === 'attack') {
      if (
        forceRatio < 0.46 ||
        (enemySummary.hpRatio < 0.37 && forceRatio < 0.72) ||
        (underPressure && forceRatio < 0.64)
      ) {
        nextMode = 'regroup';
      }
    } else if (nextMode === 'regroup') {
      const readiness = getLastStandRegroupReadiness(enemies);
      if (
        age >= CLEARANCE_ATTACKER_REGROUP_MIN_DURATION &&
        (readiness >= 0.55 || age >= 20)
      ) {
        nextMode = 'hold';
      }
    } else if (nextMode === 'hold') {
      if (
        strengthIncrease ||
        (
          age >= CLEARANCE_ATTACKER_HOLD_MIN_DURATION &&
          (forceRatio >= 0.45 || age >= 26)
        )
      ) {
        nextMode = 'attack';
      }
    }

    if (nextMode !== operational.mode) {
      setClearanceOperationalMode(
        nextMode,
        focus,
        operational,
        enemies,
        players,
        mapDef,
        game.clearanceAttackPlan,
        game,
        now,
        forceRatio
      );
    } else if (
      nextMode === 'attack' &&
      (stalled || strengthIncrease || now >= (operational.attackPulseAt ?? 0))
    ) {
      issueClearanceAttackWave(
        enemies,
        players,
        mapDef,
        game.clearanceAttackPlan,
        game
      );
      operational.attackPulseAt = now + CLEARANCE_ATTACK_PULSE_INTERVAL;
    }
  } else {
    const activeCounterattack = enemies.some((unit) => unit._clearanceProbe);
    if (nextMode === 'opening') {
      nextMode = 'hold';
    } else if (nextMode === 'hold') {
      if (
        underPressure &&
        (
          forceRatio < 0.62 ||
          (enemySummary.hpRatio < 0.42 && forceRatio < 0.82)
        )
      ) {
        nextMode = 'fallback';
      } else if (
        age >= 22 &&
        !activeCounterattack &&
        (
          (forceRatio >= 1.08 && nearestForceDistance < 58) ||
          (forceRatio >= 1.25 && nearestForceDistance >= 58 && age >= 34)
        )
      ) {
        nextMode = 'counterattack';
      }
    } else if (nextMode === 'fallback') {
      const readiness = getLastStandRegroupReadiness(enemies);
      if (
        age >= CLEARANCE_DEFENDER_FALLBACK_MIN_DURATION &&
        (readiness >= 0.55 || age >= 20)
      ) {
        nextMode = 'hold';
      }
    } else if (nextMode === 'counterattack') {
      if (underPressure && forceRatio < 0.72) {
        nextMode = 'fallback';
      } else if (age >= CLEARANCE_DEFENDER_COUNTERATTACK_DURATION) {
        nextMode = 'hold';
      }
    }

    if (nextMode !== operational.mode) {
      setClearanceOperationalMode(
        nextMode,
        focus,
        operational,
        enemies,
        players,
        mapDef,
        game.clearanceAttackPlan,
        game,
        now,
        forceRatio
      );
    }
  }

  operational.nextAt =
    now +
    (
      CLEARANCE_OPERATIONAL_REASSESS_MIN +
      Math.random() *
        (CLEARANCE_OPERATIONAL_REASSESS_MAX - CLEARANCE_OPERATIONAL_REASSESS_MIN)
    ) *
      Math.min(difficulty?.aiTickMult ?? 1, 1.2);
  operational.lastCenter = { ...enemySummary.center };
  operational.lastStrength = enemySummary.score;
  operational.forceRatio = forceRatio;
  operational.localPressure = localPressure;
  return operational.mode;
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
  game = null,
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

  // Off-map support (including Clear Defenses — same toolkit as the player).
  if (!enemyStagingPhase) {
    updateAIOffMapSupport(enemyFireSupport, playerUnits, dt, d, {
      clearance: !!clearance,
      game,
      enemyUnits,
    });
  }

  if (game && !enemyStagingPhase) {
    updateAIDefenses(game, enemyUnits, dt, assault);
  }

  if (aiTimer > 0) return;
  aiTimer = (AI_TICK_MIN + Math.random() * (AI_TICK_MAX - AI_TICK_MIN)) * d.aiTickMult;

  const aliveEnemies = enemyUnits;
  const alivePlayers = playerUnits;

  tryAiSmokeScreen(aliveEnemies, alivePlayers, game, d);

  if (!enemyStagingPhase) {
    updateAICommandSystems({
      game,
      enemyUnits: aliveEnemies,
      playerUnits: alivePlayers,
      clearance: !!clearance,
    });
  }

  if (alivePlayers.length === 0 && (!assault || assault.attackerTeam === 'enemy')) return;

  const lastStandOperationalMode = lastStand
    ? updateLastStandOperationalPlan(
        game,
        aliveEnemies,
        alivePlayers,
        mapDef,
        lastStandTactic,
        lastStandFlankSide,
        d
      )
    : null;
  const clearanceOperationalMode = clearance
    ? updateClearanceOperationalPlan(
        game,
        aliveEnemies,
        alivePlayers,
        mapDef,
        d
      )
    : null;
  const clearanceEnemyFocus = !clearance
    ? null
    : game?.clearanceRole === 'defend'
      ? 'attack'
      : 'defend';
  const frontline = assault?.frontlineCp;
  const aiIsAttacker = assault && assault.attackerTeam === 'enemy';
  const aiIsDefender = assault && assault.defenderTeam === 'enemy';
  const needsCapture = enemyNeedsCapture(capturePoints, assault);
  let captureChance = (assault ? 0.38 : 0.48) * d.captureChanceMult;
  if (campaign) captureChance = Math.max(captureChance, 0.52);
  const frontlinePushChance = 0.35 * d.attackAggressionMult;
  const defenderEngageChance = 0.5 * d.attackAggressionMult;
  const idleAdvanceChance = 0.45 + 0.25 * (d.attackAggressionMult - 1);
  /** One care job per patient/wreck/HQ this tick so medics/engineers spread out. */
  const careClaims = new Set();
  const crewlessTankClaims = new Set();

  for (const unit of aliveEnemies) {
    if (unit.def?.type === 'commander') continue;
    if (
      unit.retreating ||
      unit.surrendered ||
      unit._captureExit ||
      unit._sandbagSite ||
      unit._trenchDigSite ||
      unit._diggingTrench ||
      unit._medicTentSite ||
      isUnitGarrisoned(unit)
    ) continue;

    if (unit.attackOrder?.isSmokeShell) continue;

    if (tryAssignCrewlessTankRecovery(unit, game, crewlessTankClaims)) continue;

    // Radio operators have their own relay behavior. Let them hold the
    // assigned station (or a mode-specific defensive hold) instead of the
    // generic support logic pulling them toward the nearest enemy.
    if (unit.def?.type === 'radioOperator') {
      if (!unit.defensiveHold && !unit._aiRadioManeuver && !unit._aiRadioSafety) {
        unit.clearAttackOrder();
        unit.moveTarget = null;
      }
      continue;
    }

    const holdsPreparedClearanceLine =
      !!clearance && game?.clearanceRole !== 'defend';
    const clearanceOperationalHold =
      !!clearance &&
      (
        clearanceOperationalMode === 'regroup' ||
        clearanceOperationalMode === 'hold' ||
        clearanceOperationalMode === 'fallback'
      );
    const holdsPresetDefensivePosition =
      !!lastStand &&
      (
        unit.lastStandStance === 'defend' ||
        lastStandOperationalMode === 'regroup'
      );
    if (
      lastStandOperationalMode !== 'regroup' &&
      !clearanceOperationalHold &&
      tryAssignAiTankManeuver(
        unit,
        alivePlayers,
        aliveEnemies,
        mapDef,
        game,
        d,
        {
          allowFlank:
            !holdsPreparedClearanceLine && !holdsPresetDefensivePosition,
        }
      )
    ) {
      continue;
    }

    if (clearance) {
      if (
        (
          clearanceEnemyFocus === 'attack' &&
          clearanceOperationalMode === 'regroup'
        ) ||
        (
          clearanceEnemyFocus === 'defend' &&
          clearanceOperationalMode === 'fallback'
        )
      ) {
        if (
          updateClearanceOperationalHoldPosition(
            unit,
            alivePlayers,
            game?.scenery
          )
        ) {
          continue;
        }
      }
      if (tryAssignSupportCare(unit, aliveEnemies, game, mapDef, careClaims)) continue;
      if (
        clearanceEnemyFocus === 'attack' &&
        clearanceOperationalMode === 'hold' &&
        updateClearanceOperationalHoldPosition(
          unit,
          alivePlayers,
          game?.scenery
        )
      ) {
        continue;
      }
      // Enemy may be the garrison or the assault force depending on player role.
      if (game?.clearanceRole === 'defend') {
        updateClearanceAttacker(unit, alivePlayers, aliveEnemies, mapDef, d, game);
      } else {
        updateClearanceDefender(unit, alivePlayers, game);
      }
      continue;
    }

    if (lastStand) {
      if (
        lastStandOperationalMode === 'regroup' &&
        updateLastStandOperationalPosition(
          unit,
          alivePlayers,
          lastStandOperationalMode,
          game?.scenery
        )
      ) {
        continue;
      }
      if (tryAssignSupportCare(unit, aliveEnemies, game, mapDef, careClaims)) continue;
      if (tryAssignMedicFollow(unit, aliveEnemies, mapDef)) continue;
      if (
        lastStandOperationalMode === 'defend' &&
        updateLastStandOperationalPosition(
          unit,
          alivePlayers,
          lastStandOperationalMode,
          game?.scenery
        )
      ) {
        continue;
      }
      const coverMove = chooseCoverMove(unit, alivePlayers, game, assault);
      if (coverMove) {
        unit.clearAttackOrder();
        unit.moveTarget = coverMove;
        continue;
      }
      if (unit.lastStandRole) {
        updateLastStandPresetUnit(
          unit,
          alivePlayers,
          aliveEnemies,
          mapDef,
          d,
          lastStandTactic,
          lastStandFlankSide,
          game?.scenery
        );
      } else {
        updateLastStandUnit(unit, alivePlayers, mapDef, d, game?.scenery);
      }
      continue;
    }

    if (enemyStagingPhase) {
      unit.clearAttackOrder();
      unit.moveTarget = null;
      continue;
    }

    // Medics and engineers seek wounded / damaged friendlies before combat,
    // capture, or cover logic pulls them away from aura work.
    if (tryAssignSupportCare(unit, aliveEnemies, game, mapDef, careClaims)) {
      continue;
    }
    // Idle medics (non-combat) shadow their own force instead of charging the enemy.
    if (tryAssignMedicFollow(unit, aliveEnemies, mapDef)) {
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

    const coverMove = chooseCoverMove(unit, alivePlayers, game, assault);
    if (coverMove) {
      unit.clearAttackOrder();
      unit.moveTarget = coverMove;
      continue;
    }

    const focus = pickAttackTarget(unit, alivePlayers, game?.scenery);
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
          const nearest = findNearestVisibleEnemy(unit, alivePlayers, game?.scenery);
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

    const nearest = findNearestVisibleEnemy(unit, alivePlayers, game?.scenery);
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

/**
 * Infantry from either side may operate an abandoned, still-functional tank.
 * Enemy AI prioritizes nearby captures before resuming its normal battle task.
 */
export function tryAssignCrewlessTankRecovery(unit, game, claims = new Set()) {
  if (!game?.units || !canSupplyReplacementCrew(unit)) return false;
  if (unit.dead || unit.retreating || unit.surrendered || unit._captureExit) return false;

  let best = null;
  let bestScore = -Infinity;
  for (const tank of game.units) {
    if (
      !tank?._crewless ||
      tank.dead ||
      tank.surrendered ||
      !isTankType(tank.def?.type) ||
      claims.has(tank.id)
    ) {
      continue;
    }
    const alreadyClaimedByTeam = game.units.some(
      (other) =>
        other !== unit &&
        !other.dead &&
        other.team === unit.team &&
        other._pendingReplacementCrew &&
        other._pendingMountTankId === tank.id
    );
    if (alreadyClaimedByTeam) continue;
    const dist = unit.distanceTo(tank);
    if (dist > AI_CREWLESS_TANK_SEEK_RANGE) continue;
    const enemyCaptureBonus = tank.team === unit.team ? 0 : 18;
    const valueBonus =
      tank.def?.type === 'superHeavyTank'
        ? 26
        : tank.def?.type === 'tankDestroyer'
          ? 16
          : 10;
    const score = enemyCaptureBonus + valueBonus - dist * 0.55;
    if (score > bestScore) {
      bestScore = score;
      best = tank;
    }
  }
  if (!best) return false;

  const issued = issueMountOrder([unit], best, game.units, game);
  if (issued <= 0) return false;
  claims.add(best.id);
  return true;
}

/**
 * Move medics onto wounded foot troops and engineers onto damaged vehicles,
 * recoverable wrecks, or a damaged friendly HQ. Healing/repair is aura-based,
 * so without this the AI only benefits when support units happen to be nearby.
 * @returns {boolean} true if a care order was issued
 */
function tryAssignSupportCare(unit, allies, game, mapDef, careClaims) {
  const type = unit?.def?.type;
  if (type !== 'medic' && type !== 'engineer') return false;
  if (!unit || unit.dead || unit.retreating || unit.surrendered) return false;
  if (unit._sandbagSite || unit._medicTentSite || unit._trenchDigSite || unit._diggingTrench) {
    return false;
  }

  const job =
    type === 'medic'
      ? findMedicCareJob(unit, allies, careClaims)
      : findEngineerCareJob(unit, allies, game, careClaims);
  if (!job) return false;

  careClaims.add(job.claimKey);
  unit.clearAttackOrder();
  unit._chasingAttack = false;
  unit._hardAttackOrder = false;

  const dist = Math.hypot(unit.position.x - job.x, unit.position.z - job.z);
  const stayRange = job.stayRange;
  if (dist <= stayRange) {
    // Inside the heal/repair aura — hold so the passive tick can work.
    unit.moveTarget = null;
    unit._userMoveOrder = false;
    return true;
  }

  // Approach the patient/job; small jitter avoids stacking on the same point.
  const half = (mapDef?.size ?? 120) / 2 - 8;
  const jitter = 1.4;
  unit.moveTarget = {
    x: clamp(job.x + (Math.random() - 0.5) * jitter, -half, half),
    z: clamp(job.z + (Math.random() - 0.5) * jitter, -half, half),
  };
  unit._userMoveOrder = false;
  return true;
}

function isMedicHealableAlly(ally, medic) {
  if (!ally || ally.dead || ally.id === medic.id) return false;
  if (ally.team !== medic.team) return false;
  if (ally.surrendered || ally._captureExit) return false;
  if (!isFootSoldier(ally.def?.type)) return false;
  // Matches MedicBehavior: medics and engineers are not treated.
  if (ally.def?.type === 'medic' || ally.def?.type === 'engineer') return false;
  return ally.hp < ally.maxHp - 0.35;
}

function findMedicCareJob(medic, allies, careClaims) {
  let best = null;
  let bestScore = -Infinity;
  const stayRange = MEDIC_AURA_RANGE * SUPPORT_CARE_STANDOFF_FRAC;

  for (const ally of allies) {
    if (!isMedicHealableAlly(ally, medic)) continue;
    const claimKey = `unit:${ally.id}`;
    if (careClaims.has(claimKey)) continue;

    const dist = medic.distanceTo(ally);
    if (dist > SUPPORT_CARE_SEEK_RANGE) continue;

    // Prefer critical casualties and troops already in panic retreat.
    const wound = 1 - ally.hp / Math.max(1, ally.maxHp);
    let score = wound * 140 - dist * 0.55;
    if (ally.retreating) score += 28;
    if (dist <= MEDIC_AURA_RANGE) score += 18;

    // Soft-avoid patients already covered by another medic in aura.
    let covered = false;
    for (const other of allies) {
      if (other.dead || other.id === medic.id || other.def?.type !== 'medic') continue;
      if (other.distanceTo(ally) <= MEDIC_AURA_RANGE * 0.9) {
        covered = true;
        break;
      }
    }
    if (covered && dist > MEDIC_AURA_RANGE * 0.55) score -= 55;

    if (score > bestScore) {
      bestScore = score;
      best = {
        claimKey,
        x: ally.position.x,
        z: ally.position.z,
        stayRange,
      };
    }
  }
  return best;
}

function findEngineerCareJob(engineer, allies, game, careClaims) {
  let best = null;
  let bestScore = -Infinity;
  const stayRange = ENGINEER_AURA_RANGE * SUPPORT_CARE_STANDOFF_FRAC;

  for (const ally of allies) {
    if (!ally || ally.id === engineer.id || ally.team !== engineer.team) continue;
    if (ally.surrendered || ally._captureExit) continue;
    if (!isVehicleUnit(ally.def?.type)) continue;
    if (ally.hp >= ally.maxHp - 0.35 && !ally._mobilityDamaged) continue;

    const claimKey = `unit:${ally.id}`;
    if (careClaims.has(claimKey)) continue;

    const dist = engineer.distanceTo(ally);
    if (dist > SUPPORT_CARE_SEEK_RANGE) continue;

    const wound = 1 - ally.hp / Math.max(1, ally.maxHp);
    let score = wound * 110 - dist * 0.5;
    if (ally._mobilityDamaged) score += 95;
    if (isTankType(ally.def?.type)) score += 22;
    if (ally.def?.type === 'superHeavyTank') score += 12;
    if (dist <= ENGINEER_AURA_RANGE) score += 16;

    let covered = false;
    for (const other of allies) {
      if (other.dead || other.id === engineer.id || other.def?.type !== 'engineer') continue;
      if (other.distanceTo(ally) <= ENGINEER_AURA_RANGE * 0.9) {
        covered = true;
        break;
      }
    }
    if (covered && dist > ENGINEER_AURA_RANGE * 0.55) score -= 50;

    if (score > bestScore) {
      bestScore = score;
      best = {
        claimKey,
        x: ally.position.x,
        z: ally.position.z,
        stayRange,
      };
    }
  }

  // Recoverable wrecks live on the full roster (dead, so not in _enemyAlive).
  const roster = game?.units;
  if (roster?.length) {
    for (const wreck of roster) {
      if (!wreck?._recoverableWreck || wreck.team !== engineer.team) continue;
      const claimKey = `wreck:${wreck.id}`;
      if (careClaims.has(claimKey)) continue;
      const dist = engineer.distanceTo(wreck);
      if (dist > SUPPORT_CARE_SEEK_RANGE) continue;

      // High priority — hull restarts are scarce and decisive.
      let score = 210 - dist * 0.45 + (wreck._wreckRepairProgress ?? 0) * 40;
      if (isTankType(wreck.def?.type)) score += 18;
      if (dist <= ENGINEER_AURA_RANGE) score += 20;

      let covered = false;
      for (const other of allies) {
        if (other.dead || other.id === engineer.id || other.def?.type !== 'engineer') continue;
        if (other.distanceTo(wreck) <= ENGINEER_AURA_RANGE * 0.9) {
          covered = true;
          break;
        }
      }
      if (covered && dist > ENGINEER_AURA_RANGE * 0.55) score -= 45;

      if (score > bestScore) {
        bestScore = score;
        best = {
          claimKey,
          x: wreck.position.x,
          z: wreck.position.z,
          stayRange,
        };
      }
    }
  }

  const hq = game?.hqs?.find((h) => h.team === engineer.team && !h.dead && h.hp < h.maxHp - 0.5);
  if (hq) {
    const claimKey = `hq:${hq.team ?? 'enemy'}`;
    if (!careClaims.has(claimKey)) {
      const dist = Math.hypot(engineer.position.x - hq.position.x, engineer.position.z - hq.position.z);
      if (dist <= SUPPORT_CARE_SEEK_RANGE * 1.15) {
        const wound = 1 - hq.hp / Math.max(1, hq.maxHp);
        const score = wound * 150 - dist * 0.4 + 40;
        if (score > bestScore) {
          bestScore = score;
          best = {
            claimKey,
            x: hq.position.x,
            z: hq.position.z,
            stayRange: ENGINEER_HQ_REPAIR_RANGE * SUPPORT_CARE_STANDOFF_FRAC,
          };
        }
      }
    }
  }

  return best;
}

/**
 * Keep spare medics with the main body so the next casualty is already nearby.
 * They do not fight (nonCombat) so advancing on the player is wasted.
 */
function tryAssignMedicFollow(unit, allies, mapDef) {
  if (unit?.def?.type !== 'medic') return false;

  const combatAllies = allies.filter(
    (a) =>
      !a.dead &&
      a.id !== unit.id &&
      a.team === unit.team &&
      a.def?.type !== 'medic' &&
      !a.surrendered &&
      !a._captureExit
  );
  if (!combatAllies.length) return false;

  // Prefer the nearest cluster of non-medic friendlies.
  let anchor = null;
  let bestNear = -1;
  for (const candidate of combatAllies) {
    let near = 0;
    for (const other of combatAllies) {
      if (candidate.distanceTo(other) <= 22) near++;
    }
    if (near > bestNear) {
      bestNear = near;
      anchor = candidate;
    }
  }
  if (!anchor) anchor = combatAllies[0];

  // Bias slightly behind the ally relative to map center (enemy side of map is
  // usually positive Z or based on bases — keep it simple: stick close to ally).
  const dist = unit.distanceTo(anchor);
  unit.clearAttackOrder();
  unit._chasingAttack = false;
  if (dist <= MEDIC_AURA_RANGE * 0.75) {
    unit.moveTarget = null;
    unit._userMoveOrder = false;
    return true;
  }

  const half = (mapDef?.size ?? 120) / 2 - 8;
  unit.moveTarget = {
    x: clamp(anchor.position.x + (Math.random() - 0.5) * 6, -half, half),
    z: clamp(anchor.position.z + (Math.random() - 0.5) * 6, -half, half),
  };
  unit._userMoveOrder = false;
  return true;
}

function tryAiSmokeScreen(enemyUnits, playerUnits, game, difficulty) {
  if (!game?.smokeScreens || enemyUnits.length < 2 || playerUnits.length === 0) return false;
  const guns = enemyUnits.filter(isSmokeShellReady);
  if (guns.length === 0) return false;

  const threats = playerUnits.filter((unit) =>
    ['antiTankGun', 'tank', 'superHeavyTank'].includes(unit.def?.type)
  );
  if (threats.length === 0) return false;

  let best = null;
  let bestScore = -Infinity;
  const activeSmoke = game.smokeScreens.getActiveScreens?.() ?? [];

  for (const threat of threats) {
    const screeningArmor = enemyUnits.filter(
      (unit) =>
        !unit.dead &&
        (isTankType(unit.def?.type) || unit.def?.type === 'armoredCar') &&
        unit.distanceTo(threat) <= 62
    );
    const screeningInfantry = enemyUnits.filter(
      (unit) =>
        !unit.dead &&
        ['infantry', 'engineer', 'paratrooper', 'machineGun'].includes(unit.def?.type) &&
        unit.distanceTo(threat) <= 46
    );
    const protectedUnits = [...screeningArmor, ...screeningInfantry];
    if (protectedUnits.length < 2 || screeningArmor.length === 0) continue;

    const center = averagePosition(protectedUnits);
    const dx = center.x - threat.position.x;
    const dz = center.z - threat.position.z;
    const distance = Math.hypot(dx, dz) || 1;
    const offset = Math.min(17, Math.max(8, distance * 0.36));
    const x = threat.position.x + (dx / distance) * offset;
    const z = threat.position.z + (dz / distance) * offset;
    if (activeSmoke.some((screen) => Math.hypot(screen.x - x, screen.z - z) < 32)) continue;

    for (const gun of guns) {
      const missionDistance = Math.hypot(gun.position.x - x, gun.position.z - z);
      if (missionDistance > gun.def.range * 0.96) continue;
      const threatValue = threat.def?.type === 'antiTankGun' ? 120 : threat.def?.type === 'superHeavyTank' ? 85 : 65;
      const score = threatValue + screeningArmor.length * 28 + screeningInfantry.length * 8 - missionDistance * 0.06;
      if (score > bestScore) {
        bestScore = score;
        best = { gun, x, z };
      }
    }
  }

  if (!best) return false;
  const useChance = Math.min(0.84, 0.58 * (difficulty.attackAggressionMult ?? 1));
  if (Math.random() > useChance) return false;
  best.gun.setSmokeShellOrder(best.x, best.z);
  return true;
}

function updateAIDefenses(game, enemyUnits, dt, assault) {
  aiDefenseTimer -= dt;
  if (aiDefenseTimer > 0 || !enemyUnits.length) return;
  aiDefenseTimer = 34 + Math.random() * 22;

  const engineers = enemyUnits.filter(
    (unit) =>
      unit.def?.type === 'engineer' &&
      !unit._sandbagSite &&
      !unit.retreating &&
      !unit._garrisonBunkerId
  );
  if (engineers.length && game.engineerSandbags?.canUse?.()) {
    const engineer = engineers[Math.floor(Math.random() * engineers.length)];
    const mineChance = game.engineerSandbags.canBuildMine?.() && Math.random() < 0.24;
    const buildType = mineChance
      ? 'mine'
      : game.engineerSandbags.canBuildSandbags?.()
        ? (assault?.defenderTeam === 'enemy' || Math.random() < 0.65 ? 'sandbags' : 'bunker')
        : 'bunker';
    // tryAiPlace searches nearby open ground so AI does not dig under tenements.
    if (
      game.engineerSandbags.tryAiPlace(
        engineer.position.x,
        engineer.position.z,
        'enemy',
        buildType
      )
    ) {
      return;
    }
  }

  const diggers = enemyUnits.filter(
    (unit) =>
      canDigAiTrenchType(unit.def?.type) &&
      !unit._trenchDigSite &&
      !unit._trenchId &&
      !unit.retreating &&
      !unit._garrisonBunkerId
  );
  if (diggers.length && game.infantryTrenches?.canUse?.()) {
    const digger = diggers[Math.floor(Math.random() * diggers.length)];
    game.infantryTrenches.tryAiPlace(digger.position.x, digger.position.z, 'enemy');
  }
}

function canDigAiTrenchType(type) {
  return (
    type === 'commander' ||
    type === 'radioOperator' ||
    type === 'infantry' ||
    type === 'paratrooper' ||
    type === 'machineGun' ||
    type === 'sniper'
  );
}

function chooseCoverMove(unit, players, game, assault) {
  if (!game || !players.length || !canSeekCover(unit) || getCoverStatus(unit).inCover) return null;
  const ratio = unit.hp / Math.max(1, unit.maxHp);
  const defending = assault?.defenderTeam === 'enemy';
  if (ratio > 0.72 && !defending && Math.random() > 0.12) return null;

  if (canGarrisonType(unit.def?.type)) {
    const bunker = pickFriendlyBunker(unit, getGarrisonBunkerSources(game));
    if (bunker) {
      // Allow pathfinding into this shelter; other moves route around buildings.
      unit._bunkerEntryId = bunker.id;
      return { x: bunker.x, z: bunker.z };
    }
  }

  const target = averagePosition(players);
  const destination = resolveSeekCoverDestination(unit, target.x, target.z, game.coverSystem);
  if (Math.hypot(destination.x - unit.position.x, destination.z - unit.position.z) < 4) return null;
  if (Math.hypot(destination.x - target.x, destination.z - target.z) < 0.5) return null;
  unit._bunkerEntryId = null;
  return destination;
}

function pickFriendlyBunker(unit, sources) {
  let best = null;
  let bestD = Infinity;
  for (const source of sources ?? []) {
    const entries = source.entries ?? source.fieldBunkers ?? source.objects ?? [];
    for (const entry of entries) {
      if (entry.destroyed || entry.building || !entry.def?.garrison) continue;
      if (!entry.neutralGarrison && entry.team !== unit.team) continue;
      const capacity = entry.def?.garrisonCapacity ?? 2;
      if ((entry.garrison?.length ?? 0) >= capacity) continue;
      const d = Math.hypot(entry.x - unit.position.x, entry.z - unit.position.z);
      if (d < bestD && d <= 42 + getBunkerEnterRange(entry)) {
        best = entry;
        bestD = d;
      }
    }
  }
  return best;
}

const AI_COMMANDER_FRONTLINE_TYPES = new Set([
  'infantry',
  'paratrooper',
  'machineGun',
  'armoredCar',
  'tank',
  'tankDestroyer',
  'superHeavyTank',
  'antiTankGun',
]);

function isAiMoraleUnit(unit) {
  return (
    unit &&
    !unit.dead &&
    !unit.retreating &&
    !unit.surrendered &&
    !unit._captureExit &&
    !unit._crewless &&
    unit.def?.type !== 'commander'
  );
}

function getAiCommanderThreatWeight(unit) {
  const type = unit?.def?.type;
  if (type === 'superHeavyTank') return 2.25;
  if (type === 'tank' || type === 'tankDestroyer' || type === 'antiTankGun') return 1.85;
  if (type === 'artillery' || type === 'mortar') return 1.55;
  if (type === 'sniper') return 1.3;
  if (type === 'machineGun') return 1.15;
  return 1;
}

/** Estimate close/direct danger without treating the entire weapon range as an
 * automatic commander emergency. Long-range guns can still be screened or
 * blocked, while a nearby attacker must always pull the officer rearward. */
function getAiCommanderThreatProfile(point, commander, playerUnits, scenery, current = false) {
  const x = point?.x ?? commander?.position?.x ?? 0;
  const z = point?.z ?? commander?.position?.z ?? 0;
  let nearest = Infinity;
  let score = 0;
  let engaged = false;

  for (const player of playerUnits ?? []) {
    if (
      !player ||
      player.dead ||
      player.surrendered ||
      player._captureExit ||
      player._dropping ||
      player._crewless
    ) continue;

    const dx = player.position.x - x;
    const dz = player.position.z - z;
    const distance = Math.hypot(dx, dz);
    nearest = Math.min(nearest, distance);

    // On the live commander position, do not count a direct-fire unit whose
    // shot is visibly blocked. Indirect fire remains a threat regardless.
    if (
      current &&
      commander &&
      player.def?.type !== 'mortar' &&
      !isVisibleAttackTarget(player, commander, scenery)
    ) {
      continue;
    }

    const weaponRange = Math.max(20, player.def?.range ?? 0);
    const closeBand = Math.min(40, Math.max(24, weaponRange * 0.7));
    const weight = getAiCommanderThreatWeight(player);
    if (distance <= closeBand) {
      const proximity = 1 + (closeBand - distance) / closeBand;
      score += weight * proximity;
    }

    const hasCommanderOrder =
      player.attackOrder === commander || player.target === commander;
    if (hasCommanderOrder && distance <= weaponRange + 6) {
      score += weight * 4;
      engaged = true;
    }
  }

  if (current && (commander?._underFireTimer ?? 0) > 0) {
    score += 3.2;
    engaged = true;
  }

  const cover = current ? getCoverStatus(commander) : null;
  if (cover?.garrisoned) score *= 0.28;
  else if (cover?.inTrench) score *= 0.42;
  else if (cover?.inCover) score *= 0.68;

  return {
    nearest,
    score,
    engaged,
    danger: nearest <= AI_COMMANDER_CRITICAL_DISTANCE || engaged || score >= 6.5,
  };
}

function getAiCommanderRearAxis(game) {
  const playerBase = game?.mapDef?.playerBase ?? { x: 0, z: 0 };
  const enemyBase = game?.mapDef?.enemyBase ?? { x: 0, z: 0 };
  let x = enemyBase.x - playerBase.x;
  let z = enemyBase.z - playerBase.z;
  const length = Math.hypot(x, z) || 1;
  return {
    x: x / length,
    z: z / length,
    enemyBase,
  };
}

function clampAiCommanderPoint(game, x, z) {
  const half = (game?.mapDef?.size ?? 120) * 0.5 - 8;
  return {
    x: clamp(x, -half, half),
    z: clamp(z, -half, half),
  };
}

function getAiCommanderScreenCount(anchor, focus, troops) {
  const dx = focus.x - anchor.x;
  const dz = focus.z - anchor.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 1) return 0;
  const dirX = dx / distance;
  const dirZ = dz / distance;
  let count = 0;

  for (const troop of troops) {
    const tx = troop.position.x - anchor.x;
    const tz = troop.position.z - anchor.z;
    const projection = tx * dirX + tz * dirZ;
    const lateral = Math.abs(tx * dirZ - tz * dirX);
    if (projection >= 2 && projection <= distance + 9 && lateral <= 15) count++;
  }
  return count;
}

function getAiCommanderCoverMultiplier(point, coverSystem) {
  let best = 1;
  for (const zone of coverSystem?.zones ?? []) {
    const distance = Math.hypot(point.x - zone.x, point.z - zone.z);
    if (distance <= (zone.radius ?? 0)) best = Math.min(best, zone.mult ?? 1);
  }
  return best;
}

function findAiCommanderSupportAnchor(game, commander, focus, troops, playerUnits) {
  const rear = getAiCommanderRearAxis(game);
  const candidates = [];
  const addCandidate = (point) => {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return;
    const clamped = clampAiCommanderPoint(game, point.x, point.z);
    if (
      candidates.some(
        (candidate) =>
          Math.hypot(candidate.x - clamped.x, candidate.z - clamped.z) < 2.5
      )
    ) return;
    candidates.push(clamped);
  };

  // Work from the rear edge of the aura forward. This gives the commander the
  // morale benefit while keeping as much depth as the situation permits.
  for (
    let offset = AI_COMMANDER_SUPPORT_MAX_OFFSET;
    offset >= AI_COMMANDER_SUPPORT_MIN_OFFSET;
    offset -= 2
  ) {
    const raw = {
      x: focus.x + rear.x * offset,
      z: focus.z + rear.z * offset,
    };
    addCandidate(raw);
    addCandidate(resolveSeekCoverDestination(
      commander,
      raw.x,
      raw.z,
      game.coverSystem
    ));
  }

  // If the commander is already in a good supporting position, retaining it
  // avoids unnecessary zig-zagging when the front shifts by a few metres.
  addCandidate(commander.position);

  let best = null;
  let bestScore = -Infinity;
  for (const candidate of candidates) {
    const focusDistance = Math.hypot(
      candidate.x - focus.x,
      candidate.z - focus.z
    );
    if (focusDistance > COMMANDER_AURA_RANGE - 1) continue;

    const threat = getAiCommanderThreatProfile(
      candidate,
      commander,
      playerUnits,
      game.scenery
    );
    // A whole enemy line can sit at the far side of the aura while friendly
    // troops screen the officer. For a hypothetical support anchor, reject
    // close/actively directed threats rather than treating several distant
    // shooters as an automatic emergency.
    if (threat.nearest < AI_COMMANDER_DANGER_DISTANCE || threat.engaged) continue;

    const screen = getAiCommanderScreenCount(candidate, focus, troops);
    const coverMult = getAiCommanderCoverMultiplier(candidate, game.coverSystem);
    const rearDepth =
      (candidate.x - rear.enemyBase.x) * rear.x +
      (candidate.z - rear.enemyBase.z) * rear.z;
    let score =
      focusDistance * 0.95 +
      threat.nearest * 1.25 -
      threat.score * 18 +
      (1 - coverMult) * 52 +
      screen * 16 +
      rearDepth * 0.08;
    if (screen === 0) score -= 12;
    if (candidate.x === commander.position.x && candidate.z === commander.position.z) {
      score += getCoverStatus(commander).inCover ? 14 : 3;
    }

    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

function findAiCommanderShelter(commander, game) {
  if (
    !commander ||
    commander._garrisonBunkerId ||
    commander._trenchId ||
    commander._diggingTrench
  ) return null;

  const rear = getAiCommanderRearAxis(game);
  const rearAnchor = commander._commanderRearAnchor ?? rear.enemyBase;
  let best = null;
  let bestScore = Infinity;
  for (const source of getGarrisonBunkerSources(game)) {
    const entries = source.entries ?? source.fieldBunkers ?? source.objects ?? [];
    for (const entry of entries) {
      if (entry.destroyed || entry.building || !entry.def?.garrison) continue;
      if (!entry.neutralGarrison && entry.team !== commander.team) continue;
      if ((entry.garrison?.length ?? 0) >= (entry.def.garrisonCapacity ?? 2)) continue;

      const distance = Math.hypot(
        commander.position.x - entry.x,
        commander.position.z - entry.z
      );
      if (distance > AI_COMMANDER_SHELTER_SEEK_RANGE) continue;

      const distanceToRear = Math.hypot(
        entry.x - rearAnchor.x,
        entry.z - rearAnchor.z
      );
      const rearDepth =
        (entry.x - rear.enemyBase.x) * rear.x +
        (entry.z - rear.enemyBase.z) * rear.z;
      const score = distance * 0.35 + distanceToRear * 0.85 - rearDepth * 0.12;
      if (score < bestScore) {
        bestScore = score;
        best = entry;
      }
    }
  }
  return best ? { x: best.x, z: best.z, bunkerId: best.id } : null;
}

function issueAiCommanderDestination(game, commander, destination, {
  mode = 'rear',
  bunkerId = null,
} = {}) {
  if (!destination) return false;
  const next = clampAiCommanderPoint(game, destination.x, destination.z);
  const previousGoal = commander._aiCommanderGoal;
  const goalDistance = previousGoal
    ? Math.hypot(previousGoal.x - next.x, previousGoal.z - next.z)
    : Infinity;
  const atDestination = Math.hypot(
    commander.position.x - next.x,
    commander.position.z - next.z
  ) <= 6;

  commander._aiCommanderMode = mode;
  commander._aiCommanderShelterId = bunkerId;
  commander._aiCommanderGoal = { ...next };
  commander.defensiveHold = { ...next, radius: mode === 'support' ? 8 : 10 };
  if (mode === 'rear') {
    commander._aiCommanderAnchor = null;
    commander._aiCommanderAnchorUntil = 0;
  } else {
    commander._aiCommanderAnchor = { ...next };
  }

  const shelterAlreadyOrdered =
    bunkerId &&
    (commander._garrisonBunkerId === bunkerId || commander._bunkerEntryId === bunkerId);
  if (shelterAlreadyOrdered) return true;

  if (
    goalDistance < 3 &&
    (atDestination || commander.moveTarget || commander._garrisonBunkerId || commander._trenchId)
  ) return true;

  commander.clearAttackOrder?.();
  commander.moveTo?.(
    next.x,
    next.z,
    game.mapDef,
    false,
    game.scenery,
    bunkerId ? { allowBuildingId: bunkerId } : {}
  );
  return true;
}

function returnAiCommanderToRear(game, commander, { preferShelter = false } = {}) {
  const rear = commander._commanderRearAnchor;
  const inShelter = commander._garrisonBunkerId || commander._trenchId;
  const distanceToRear = rear
    ? Math.hypot(
        commander.position.x - rear.x,
        commander.position.z - rear.z
      )
    : 0;
  if (inShelter && distanceToRear <= 24) {
    commander._aiCommanderMode = 'shelter';
    commander._aiCommanderShelterId = commander._garrisonBunkerId ?? null;
    commander._aiCommanderAnchor = null;
    return true;
  }

  if (!rear) return false;

  if (preferShelter) {
    const shelter = findAiCommanderShelter(commander, game);
    if (shelter) {
      return issueAiCommanderDestination(game, commander, shelter, {
        mode: 'shelter',
        bunkerId: shelter.bunkerId,
      });
    }
  }

  const coveredRear = resolveSeekCoverDestination(
    commander,
    rear.x,
    rear.z,
    game.coverSystem
  );
  const rearDestination =
    Math.hypot(coveredRear.x - rear.x, coveredRear.z - rear.z) <= 18
      ? coveredRear
      : rear;
  return issueAiCommanderDestination(game, commander, rearDestination, { mode: 'rear' });
}

/** Keep the commander protected by default, but use the far edge of his aura
 * as a deliberate support position when several pressured frontline units
 * need him. A close threat or direct attack order always overrides the aura
 * request and sends him back to depth/cover. */
function updateAICommander(game, enemyUnits, playerUnits) {
  const commander = getFieldCommander(game, 'enemy');
  if (!commander || commander.dead) return false;

  const now = game.matchTime ?? 0;
  const troops = enemyUnits.filter(isAiMoraleUnit);
  const commanderCover = getCoverStatus(commander);
  const protectedInPlace =
    commanderCover.garrisoned || commanderCover.inTrench ||
    !!commander._garrisonBunkerId || !!commander._trenchId;
  const currentThreat = getAiCommanderThreatProfile(
    commander.position,
    commander,
    playerUnits,
    game.scenery,
    true
  );

  if (
    currentThreat.danger &&
    (!protectedInPlace || currentThreat.engaged) &&
    now >= (commander._aiCommanderSafetyUntil ?? 0)
  ) {
    commander._aiCommanderSafetyUntil = now + AI_COMMANDER_SAFETY_HOLD_SEC;
    returnAiCommanderToRear(game, commander, { preferShelter: true });
    return true;
  }

  if (now < (commander._aiCommanderSafetyUntil ?? 0)) {
    returnAiCommanderToRear(game, commander, { preferShelter: true });
    return true;
  }

  if (!troops.length || !playerUnits.length) {
    if (commander._aiCommanderAnchor && now >= (commander._aiCommanderAnchorUntil ?? 0)) {
      returnAiCommanderToRear(game, commander, { preferShelter: true });
    }
    return false;
  }

  const uncovered = troops
    .map((unit) => {
      const enemyNearby = playerUnits.some(
        (player) =>
          !player.dead &&
          !player.surrendered &&
          !player._captureExit &&
          Math.hypot(unit.position.x - player.position.x, unit.position.z - player.position.z) <=
            COMMANDER_AURA_RANGE * 0.7
      );
      const hpRatio = unit.hp / Math.max(1, unit.maxHp);
      const underFire = (unit._underFireTimer ?? 0) > 0;
      const underPressure = enemyNearby || hpRatio < 0.72 || underFire;
      return {
        unit,
        score:
          (underPressure ? 3 : 0) +
          (enemyNearby ? 2 : 0) +
          (hpRatio < 0.5 ? 2 : 0) +
          (underFire ? 1 : 0) +
          (AI_COMMANDER_FRONTLINE_TYPES.has(unit.def?.type) ? 1 : 0),
        underPressure,
      };
    })
    .filter(
      ({ unit, underPressure }) =>
        underPressure && !isUnitInspiredByCommander(unit, enemyUnits)
    )
    .sort((a, b) => b.score - a.score);

  const anchorUntil = commander._aiCommanderAnchorUntil ?? 0;
  if (!uncovered.length) {
    if (commander._aiCommanderAnchor && now >= anchorUntil) {
      returnAiCommanderToRear(game, commander, { preferShelter: true });
    }
    return false;
  }

  const frontlineUncovered = uncovered.filter(({ unit }) =>
    AI_COMMANDER_FRONTLINE_TYPES.has(unit.def?.type)
  );
  const leadPressure = uncovered[0]?.score ?? 0;
  const supportRequired = frontlineUncovered.length >= 2 || leadPressure >= 6;
  // A commander already inside a bunker/trench should not abandon excellent
  // protection for one isolated casualty. Multiple frontline elements in
  // contact, or a badly mauled unit under fire, justify leaving it.
  if (
    protectedInPlace &&
    frontlineUncovered.length < 3 &&
    leadPressure < 7
  ) {
    if (commander._aiCommanderAnchor && now >= anchorUntil) {
      returnAiCommanderToRear(game, commander, { preferShelter: true });
    }
    return false;
  }
  if (!supportRequired) {
    if (commander._aiCommanderAnchor && now >= anchorUntil) {
      returnAiCommanderToRear(game, commander, { preferShelter: true });
    }
    return false;
  }
  if (now < anchorUntil) return true;

  const focus = averagePosition(
    uncovered.slice(0, Math.min(6, uncovered.length)).map(({ unit }) => unit)
  );
  const anchor = findAiCommanderSupportAnchor(
    game,
    commander,
    focus,
    troops,
    playerUnits
  );
  if (!anchor) {
    returnAiCommanderToRear(game, commander, { preferShelter: true });
    return false;
  }

  if (
    commander._aiCommanderAnchor &&
    Math.hypot(
      commander._aiCommanderAnchor.x - anchor.x,
      commander._aiCommanderAnchor.z - anchor.z
    ) < 4
  ) {
    commander._aiCommanderAnchorUntil = now + 18;
    return true;
  }

  commander._aiCommanderAnchorUntil = now + 18;
  issueAiCommanderDestination(game, commander, anchor, { mode: 'support' });
  return true;
}

/** Make enemy command decisions using the same commander-gated order system. */
function updateAIGeneralOrders(game, enemyUnits, playerUnits, { clearance = false } = {}) {
  const manager = game?.enemyGeneralOrders;
  if (!manager) return false;
  if (!manager.hasCommandLink()) {
    manager.cancelActive?.();
    return false;
  }
  if (manager.isActive() || playerUnits.length === 0) return false;

  const enemySummary = getLastStandForceSummary(enemyUnits);
  const playerSummary = getLastStandForceSummary(playerUnits);
  if (enemySummary.count === 0 || playerSummary.count === 0) return false;

  const nearbyPlayers = playerUnits.filter(
    (unit) =>
      Math.hypot(
        unit.position.x - enemySummary.center.x,
        unit.position.z - enemySummary.center.z
      ) <= 34
  );
  const forceRatio = enemySummary.score / Math.max(0.1, playerSummary.score);
  const underPressure =
    nearbyPlayers.length > 0 &&
    (enemySummary.hpRatio < 0.84 || forceRatio < 0.98 || enemyUnits.some((unit) => (unit._underFireTimer ?? 0) > 0));
  const desperate =
    enemySummary.hpRatio < 0.42 && forceRatio < 0.78 ||
    (enemySummary.hpRatio < 0.55 && forceRatio < 0.58);

  // Clear Defenses has role-specific regroup logic and intentionally does not
  // turn the garrison into a generic retreat. Its normal AI still uses the
  // commander aura and radio support above.
  if (!clearance && desperate && manager.isReady('fullRetreat')) {
    return manager.issue('fullRetreat');
  }

  if (
    underPressure &&
    !desperate &&
    manager.isReady('holdGround')
  ) {
    return manager.issue('holdGround');
  }
  return false;
}

function isAiRadioRelayCandidate(unit) {
  return (
    unit &&
    !unit.dead &&
    !unit.surrendered &&
    !unit._captureExit &&
    !unit._dropping &&
    !unit.retreating &&
    !unit._mobilityDamaged &&
    !unit._diggingTrench &&
    !unit._trenchDigSite &&
    !unit._sandbagSite &&
    !isUnitGarrisoned(unit)
  );
}

function isAiRadioRelayTarget(unit) {
  return (
    unit &&
    !unit.dead &&
    !unit.surrendered &&
    !unit._captureExit &&
    !unit._dropping
  );
}

function getAiRadioRelayTargetValue(unit) {
  if (isTankType(unit.def?.type)) return 3;
  if (unit.def?.type === 'antiTankGun' || unit.def?.type === 'artillery') return 2.4;
  if (unit.def?.type === 'mortar' || unit.def?.type === 'machineGun') return 1.8;
  return 1;
}

function findLargestAiRadioRelayCluster(players) {
  const candidates = (players ?? []).filter(isAiRadioRelayTarget);
  let best = null;

  for (const anchor of candidates) {
    const members = candidates.filter(
      (unit) =>
        Math.hypot(
          unit.position.x - anchor.position.x,
          unit.position.z - anchor.position.z
        ) <= AI_RADIO_RELAY_CLUSTER_RADIUS
    );
    if (!members.length) continue;

    const center = averagePosition(members);
    const value = members.reduce(
      (sum, unit) => sum + getAiRadioRelayTargetValue(unit),
      0
    );
    const score = members.length * 10 + value;
    if (
      best &&
      (members.length < best.count ||
        (members.length === best.count && score <= best.score))
    ) {
      continue;
    }

    best = {
      count: members.length,
      score,
      center,
      members,
      key: members
        .map((unit) => String(unit.id ?? `${unit.position.x}:${unit.position.z}`))
        .sort()
        .join(','),
    };
  }

  return best;
}

function getAiRadioRelayObservationPoints(cluster) {
  return [
    cluster.center,
    ...cluster.members.map((unit) => ({
      x: unit.position.x,
      z: unit.position.z,
    })),
  ];
}

function isAiRadioRelayClusterObserved(game, radios, cluster) {
  const points = getAiRadioRelayObservationPoints(cluster);
  return points.some((point) =>
    radios.some((radio) =>
      isRadioOperatorPointObserved(game, radio, point.x, point.z)
    )
  );
}

function getAiRadioRearAxis(game, cluster, radio) {
  const ownBase = game.mapDef?.enemyBase;
  const playerBase = game.mapDef?.playerBase;
  let rearX = (ownBase?.x ?? radio.position.x) - (playerBase?.x ?? cluster.center.x);
  let rearZ = (ownBase?.z ?? radio.position.z) - (playerBase?.z ?? cluster.center.z);
  let length = Math.hypot(rearX, rearZ);

  if (length < 0.001) {
    rearX = radio.position.x - cluster.center.x;
    rearZ = radio.position.z - cluster.center.z;
    length = Math.hypot(rearX, rearZ);
  }
  if (length < 0.001) {
    rearX = 0;
    rearZ = -1;
    length = 1;
  }

  return {
    rearX: rearX / length,
    rearZ: rearZ / length,
  };
}

function getNearestAiDistance(point, units, exclude = null) {
  let nearest = Infinity;
  for (const unit of units ?? []) {
    if (!unit || unit === exclude || unit.dead || unit.surrendered) continue;
    nearest = Math.min(
      nearest,
      Math.hypot(unit.position.x - point.x, unit.position.z - point.z)
    );
  }
  return nearest;
}

function getAiRadioThreat(radio, playerUnits) {
  const hpRatio = radio.hp / Math.max(1, radio.maxHp);
  const nearestEnemyDistance = getNearestAiDistance(radio.position, playerUnits);
  const underFire = (radio._underFireTimer ?? 0) > 0;
  const critical =
    hpRatio <= AI_RADIO_CRITICAL_HP_RATIO ||
    nearestEnemyDistance <= AI_RADIO_CRITICAL_DISTANCE ||
    (underFire && nearestEnemyDistance <= AI_RADIO_DANGER_DISTANCE) ||
    (underFire && hpRatio <= 0.52);
  return {
    hpRatio,
    nearestEnemyDistance,
    underFire,
    critical,
    danger:
      critical ||
      underFire ||
      hpRatio <= AI_RADIO_DANGER_HP_RATIO ||
      nearestEnemyDistance <= AI_RADIO_DANGER_DISTANCE,
  };
}

function getAiRadioSafetyDestination(game, radio, playerUnits, threat) {
  const enemyCenter = playerUnits.length
    ? averagePosition(playerUnits)
    : { x: radio.position.x, z: radio.position.z };
  const { rearX, rearZ } = getAiRadioRearAxis(
    game,
    { center: enemyCenter },
    radio
  );
  const nearestEnemy = (playerUnits ?? [])
    .filter((unit) => isAiRadioRelayTarget(unit))
    .sort(
      (a, b) =>
        Math.hypot(a.position.x - radio.position.x, a.position.z - radio.position.z) -
        Math.hypot(b.position.x - radio.position.x, b.position.z - radio.position.z)
    )[0] ?? null;
  let fleeX = rearX;
  let fleeZ = rearZ;
  if (nearestEnemy) {
    const awayX = radio.position.x - nearestEnemy.position.x;
    const awayZ = radio.position.z - nearestEnemy.position.z;
    const awayLength = Math.hypot(awayX, awayZ);
    if (awayLength > 0.001) {
      fleeX = (rearX + awayX / awayLength) * 0.5;
      fleeZ = (rearZ + awayZ / awayLength) * 0.5;
      const fleeLength = Math.hypot(fleeX, fleeZ) || 1;
      fleeX /= fleeLength;
      fleeZ /= fleeLength;
    }
  }

  const safeDistance = threat.underFire ? 22 : AI_RADIO_RELAY_MIN_SAFE_DISTANCE;
  const bunker = pickFriendlyBunker(radio, getGarrisonBunkerSources(game));
  if (
    bunker &&
    getNearestAiDistance(bunker, playerUnits) >= safeDistance &&
    Math.hypot(bunker.x - radio.position.x, bunker.z - radio.position.z) <= 52
  ) {
    return {
      x: bunker.x,
      z: bunker.z,
      bunkerId: bunker.id,
      covered: true,
      coverQuality: 1,
    };
  }

  let best = null;
  for (const zone of game.coverSystem?.zones ?? []) {
    const travel = Math.hypot(zone.x - radio.position.x, zone.z - radio.position.z);
    if (travel < 3 || travel > 64) continue;
    const enemyDistance = getNearestAiDistance(zone, playerUnits);
    if (enemyDistance < safeDistance) continue;
    const rearDepth =
      (zone.x - enemyCenter.x) * rearX + (zone.z - enemyCenter.z) * rearZ;
    const awayDepth =
      (zone.x - radio.position.x) * fleeX + (zone.z - radio.position.z) * fleeZ;
    const coverQuality = Math.max(0, 1 - (zone.mult ?? 0.45));
    const score =
      travel * 0.7 +
      Math.max(0, 24 - enemyDistance) * 7 -
      Math.max(0, rearDepth) * 0.28 -
      Math.max(0, awayDepth) * 0.18 -
      coverQuality * 12 -
      (zone.type === 'trench' ? 5 : 0);
    if (!best || score < best.score) {
      best = {
        x: zone.x,
        z: zone.z,
        covered: true,
        coverQuality,
        score,
      };
    }
  }
  if (best) return best;

  // A map without a usable cover zone still gets a proper rearward fallback.
  // Try progressively deeper points so a radio operator does not stop at an
  // exposed position merely because the first retreat step is still too close.
  for (const distance of [28, 40, 52]) {
    const raw = {
      x: radio.position.x + fleeX * distance,
      z: radio.position.z + fleeZ * distance,
    };
    const destination = clampAiTankDestination(game.mapDef, raw.x, raw.z);
    if (game.scenery?.getUnitPlacementBlocker?.(destination.x, destination.z, 0.9)) {
      continue;
    }
    if (getNearestAiDistance(destination, playerUnits) < safeDistance) continue;
    return { ...destination, covered: false, coverQuality: 0 };
  }
  return null;
}

function updateAiRadioOperatorSafety(game, radios, playerUnits, clearance) {
  const blocked = new Set();
  const now = game.matchTime ?? 0;

  for (const radio of radios) {
    if (radio.retreating) {
      radio._aiRadioManeuver = null;
      radio._aiRadioSafety = { mode: 'retreat' };
      blocked.add(radio);
      continue;
    }

    const threat = getAiRadioThreat(radio, playerUnits);
    const cover = getCoverStatus(radio);
    if (threat.critical) {
      const hq = resolveRetreatHq(radio, game.hqs, {
        clearance,
        mapDef: game.mapDef,
      });
      if (hq) {
        clearAiRadioManeuver(radio);
        radio._aiRadioSafety = { mode: 'retreat' };
        startRetreat(radio, hq, {
          mapDef: game.mapDef,
          scenery: game.scenery,
          voiceDelay: 0.25,
        });
        blocked.add(radio);
        continue;
      }
    }

    if (radio._aiRadioSafety?.mode === 'retreat') {
      radio._aiRadioSafety = null;
    }

    const activeSafety = radio._aiRadioSafety;
    if (activeSafety?.mode === 'cover') {
      const remaining = Math.hypot(
        radio.position.x - activeSafety.x,
        radio.position.z - activeSafety.z
      );
      if (!cover.inCover && now < activeSafety.reassessAt) {
        enforceAiRadioRelayMove(radio, activeSafety, game);
        blocked.add(radio);
        continue;
      }
      if (cover.inCover && !threat.danger) {
        radio._aiRadioSafety = null;
      } else if (threat.danger && (remaining > 4.5 || !cover.inCover)) {
        enforceAiRadioRelayMove(radio, activeSafety, game);
        blocked.add(radio);
        continue;
      } else {
        radio._aiRadioSafety = null;
      }
    }

    if (cover.inCover) {
      // A dug-in or garrisoned operator should stay put while under pressure.
      // Once safe, relay planning may choose another covered station if the
      // current position cannot observe the target cluster.
      if (threat.danger) blocked.add(radio);
      continue;
    }

    // Exposed operators proactively seek a safe station. This also gives a
    // freshly spawned operator cover before it starts range-seeking.
    if (!threat.danger && radio._aiRadioManeuver) continue;
    const destination = getAiRadioSafetyDestination(game, radio, playerUnits, threat);
    if (!destination) {
      if (threat.danger) blocked.add(radio);
      continue;
    }
    const alreadyAtSafetyDestination =
      Math.hypot(
        radio.position.x - destination.x,
        radio.position.z - destination.z
      ) <= 4.5;
    if (alreadyAtSafetyDestination && !destination.bunkerId) {
      if (threat.danger) blocked.add(radio);
      continue;
    }

    clearAiRadioManeuver(radio);
    radio._aiRadioSafety = {
      ...destination,
      mode: 'cover',
      reassessAt:
        now +
        AI_RADIO_SAFETY_REASSESS_MIN +
        Math.random() * (AI_RADIO_SAFETY_REASSESS_MAX - AI_RADIO_SAFETY_REASSESS_MIN),
    };
    enforceAiRadioRelayMove(radio, radio._aiRadioSafety, game);
    blocked.add(radio);
  }

  return { blocked, pending: blocked.size > 0 };
}

function getAiRadioRelayDestination(game, radio, cluster, enemyUnits, playerUnits) {
  const { rearX, rearZ } = getAiRadioRearAxis(game, cluster, radio);
  const perpX = -rearZ;
  const perpZ = rearX;
  const ownBase = game.mapDef?.enemyBase;
  const distanceToOwnBase = ownBase
    ? Math.hypot(cluster.center.x - ownBase.x, cluster.center.z - ownBase.z)
    : AI_RADIO_RELAY_MAX_REAR_DISTANCE;
  const supportRange = getRadioOperatorSupportRange(radio);
  const idealRearDistance = clamp(
    supportRange * 0.68,
    AI_RADIO_RELAY_MIN_REAR_DISTANCE,
    AI_RADIO_RELAY_MAX_REAR_DISTANCE
  );
  const rearDistance = Math.min(
    idealRearDistance,
    Math.max(AI_RADIO_RELAY_MIN_REAR_DISTANCE, distanceToOwnBase * 0.68)
  );
  const lateralOffsets = [0, -10, 10, -18, 18];
  const points = getAiRadioRelayObservationPoints(cluster);
  const idealPoint = {
    x: cluster.center.x + rearX * rearDistance,
    z: cluster.center.z + rearZ * rearDistance,
  };
  const candidates = lateralOffsets.map((lateral) => ({
    x: idealPoint.x + perpX * lateral,
    z: idealPoint.z + perpZ * lateral,
    covered: false,
    lateral,
  }));

  // Prefer a covered relay station near the rearward support line. An open
  // point is still allowed when the map has no suitable cover, but it must be
  // farther from the player force than a covered point.
  for (const zone of game.coverSystem?.zones ?? []) {
    const toIdeal = Math.hypot(zone.x - idealPoint.x, zone.z - idealPoint.z);
    const toRadio = Math.hypot(zone.x - radio.position.x, zone.z - radio.position.z);
    if (toIdeal > 30 || toRadio > 72) continue;
    candidates.push({
      x: zone.x,
      z: zone.z,
      covered: true,
      coverQuality: Math.max(0, 1 - (zone.mult ?? 0.45)),
      coverType: zone.type,
      lateral: 0,
      toIdeal,
    });
  }

  const currentCover = getCoverStatus(radio);
  let best = null;

  for (const candidate of candidates) {
    const destination = clampAiTankDestination(game.mapDef, candidate.x, candidate.z);
    if (
      !candidate.covered &&
      game.scenery?.getUnitPlacementBlocker?.(destination.x, destination.z, 0.9)
    ) {
      continue;
    }

    const enemyDistance = getNearestAiDistance(destination, playerUnits);
    const minimumSafeDistance = candidate.covered
      ? AI_RADIO_RELAY_MIN_SAFE_DISTANCE
      : AI_RADIO_RELAY_OPEN_MIN_SAFE_DISTANCE;
    if (enemyDistance < minimumSafeDistance) continue;
    const allyDistance = getNearestAiDistance(destination, enemyUnits, radio);
    const observed = points.some((point) =>
      isRadioOperatorPointObserved(
        game,
        radio,
        point.x,
        point.z,
        destination
      )
    );
    const travel = Math.hypot(
      radio.position.x - destination.x,
      radio.position.z - destination.z
    );
    const toIdeal =
      candidate.toIdeal ??
      Math.hypot(destination.x - idealPoint.x, destination.z - idealPoint.z);
    const coverBonus = candidate.covered
      ? 18 + (candidate.coverQuality ?? 0) * 10
      : 0;
    const exposedFromCoverPenalty = currentCover.inCover && !candidate.covered ? 24 : 0;
    const score =
      (observed ? -10000 : 0) +
      travel * 0.35 +
      toIdeal * 0.3 +
      Math.max(0, 24 - enemyDistance) * 5 +
      Math.max(0, 3 - allyDistance) * 4 +
      Math.abs(candidate.lateral ?? 0) * 0.04 +
      exposedFromCoverPenalty -
      coverBonus;
    if (!best || score < best.score) {
      best = {
        ...destination,
        score,
        observed,
        covered: candidate.covered,
        coverType: candidate.coverType ?? null,
      };
    }
  }

  return best;
}

function clearAiRadioManeuver(unit, stop = true) {
  unit._aiRadioManeuver = null;
  if (!stop || unit.retreating) return;
  unit.moveTarget = null;
  unit._movePath = null;
  unit._finalMoveGoal = null;
  unit._autoMoveOrderX = null;
  unit._autoMoveOrderZ = null;
}

function enforceAiRadioRelayMove(unit, destination, game) {
  const goal = unit._finalMoveGoal;
  const goalDrift = goal
    ? Math.hypot(goal.x - destination.x, goal.z - destination.z)
    : Infinity;
  const bunkerChanged = (unit._bunkerEntryId ?? null) !== (destination.bunkerId ?? null);
  if (!unit.moveTarget || goalDrift > 2 || bunkerChanged) {
    unit.moveTo?.(
      destination.x,
      destination.z,
      game.mapDef,
      false,
      game.scenery,
      { allowBuildingId: destination.bunkerId ?? null }
    );
    if (!unit.moveTo) unit.moveTarget = { x: destination.x, z: destination.z };
    unit._userMoveOrder = false;
    unit._reverseMoveOrder = false;
  }
}

function isAiRadioSupportReady(support) {
  if (!support?.isReady) return true;
  return ['strafe', 'barrage', 'creepingBarrage', 'airborneDrop'].some((type) =>
    support.isReady(type)
  );
}

/**
 * Move one living enemy radio operator to a rear relay position when the
 * highest-value player cluster is outside the current radio net. The operator
 * is deliberately kept behind the cluster, away from direct contact, and the
 * proposed position is checked with the same range/LOS rule as Fire Support.
 */
export function updateAIRadioOperators({
  game,
  enemyUnits = [],
  playerUnits = [],
  support = null,
  clearance = false,
  enemyStagingPhase = false,
} = {}) {
  if (enemyStagingPhase || !game?.mapDef || !playerUnits.length) return false;

  const radioPool = game.units?.length ? game.units : enemyUnits;
  const allRadios = getRadioOperators(radioPool, 'enemy');
  if (!allRadios.length) return false;

  const safety = updateAiRadioOperatorSafety(game, allRadios, playerUnits, clearance);
  const movableRadios = allRadios.filter(
    (radio) => isAiRadioRelayCandidate(radio) && !safety.blocked.has(radio)
  );

  const cluster = findLargestAiRadioRelayCluster(playerUnits);
  const minCluster = clearance ? 2 : 3;
  if (!cluster || cluster.count < minCluster) {
    for (const radio of movableRadios) {
      if (radio._aiRadioManeuver) clearAiRadioManeuver(radio);
    }
    return safety.pending;
  }

  if (isAiRadioRelayClusterObserved(game, allRadios, cluster)) {
    for (const radio of movableRadios) {
      if (radio._aiRadioManeuver) clearAiRadioManeuver(radio);
    }
    return safety.pending;
  }

  const now = game.matchTime ?? 0;
  const active = movableRadios.find((radio) => radio._aiRadioManeuver);
  if (active) {
    const maneuver = active._aiRadioManeuver;
    const targetDrift = Math.hypot(
      maneuver.targetCenter.x - cluster.center.x,
      maneuver.targetCenter.z - cluster.center.z
    );
    if (maneuver.targetKey === cluster.key && targetDrift <= 12 && now < maneuver.reassessAt) {
      const remaining = Math.hypot(
        active.position.x - maneuver.x,
        active.position.z - maneuver.z
      );
      if (remaining > 4.5) {
        enforceAiRadioRelayMove(active, maneuver, game);
      }
      // Keep support retrying while this relay is moving or waiting for a
      // clear line of sight at its destination.
      return true;
    }
    clearAiRadioManeuver(active);
  }

  if (!isAiRadioSupportReady(support)) return safety.pending;

  let best = null;
  for (const radio of movableRadios) {
    if (now < (radio._aiRadioManeuverNextAt ?? 0)) continue;
    const destination = getAiRadioRelayDestination(
      game,
      radio,
      cluster,
      enemyUnits,
      playerUnits
    );
    if (!destination) continue;
    const travel = Math.hypot(
      radio.position.x - destination.x,
      radio.position.z - destination.z
    );
    const score = travel + (destination.observed ? -1000 : 0);
    if (!best || score < best.score) {
      best = { radio, destination, score };
    }
  }
  if (!best) return safety.pending;

  const maneuver = {
    targetKey: cluster.key,
    targetCenter: { ...cluster.center },
    x: best.destination.x,
    z: best.destination.z,
    reassessAt:
      now +
      AI_RADIO_RELAY_REASSESS_MIN +
      Math.random() * (AI_RADIO_RELAY_REASSESS_MAX - AI_RADIO_RELAY_REASSESS_MIN),
  };
  best.radio._aiRadioManeuverNextAt = maneuver.reassessAt;
  best.radio._aiRadioManeuver = maneuver;
  enforceAiRadioRelayMove(best.radio, maneuver, game);
  return true;
}

export function updateAICommandSystems({
  game,
  enemyUnits = [],
  playerUnits = [],
  clearance = false,
  enemyStagingPhase = false,
} = {}) {
  if (enemyStagingPhase) return;
  updateAICommander(game, enemyUnits, playerUnits);
  updateAIGeneralOrders(game, enemyUnits, playerUnits, { clearance });
}

export function updateAIOffMapSupport(
  support,
  players,
  dt,
  difficulty,
  options = {}
) {
  const game = options.game ?? support?.game ?? null;
  const radioCoveragePending = updateAIRadioOperators({
    game,
    enemyUnits: options.enemyUnits ?? game?._enemyAlive ?? [],
    playerUnits: players,
    support,
    clearance: !!options.clearance,
    enemyStagingPhase: !!options.enemyStagingPhase,
  });
  updateAISupport(support, players, dt, difficulty, {
    ...options,
    radioCoveragePending,
  });
}

function updateAISupport(support, players, dt, difficulty, options = {}) {
  if (!support || players.length < 2) return;
  aiSupportTimer -= dt;
  if (aiSupportTimer > 0) return;
  // Slightly snappier on Clear Defenses so AI uses the same tools as the player.
  aiSupportTimer = options.clearance
    ? 18 + Math.random() * 14
    : 24 + Math.random() * 18;

  const target = findSupportTarget(players, support);
  if (!target) {
    // The radio operator may have just started a relay move. Retry shortly
    // after movement rather than waiting for the normal support interval.
    if (options.radioCoveragePending) aiSupportTimer = 2.75;
    return;
  }

  const aggression = difficulty.attackAggressionMult ?? 1;
  const barrageChance = Math.min(0.78, 0.48 * aggression);
  const minCluster = options.clearance ? 2 : 3;

  if (
    support.isReady('strafe') &&
    target.count >= minCluster &&
    Math.random() < Math.min(0.55, 0.32 * aggression)
  ) {
    if (support.tryAiStrike('strafe', target.x, target.z)) return;
  }

  if (support.isReady('barrage') && target.count >= minCluster && Math.random() < barrageChance) {
    if (support.tryAiStrike('barrage', target.x, target.z)) return;
  }

  if (
    support.isReady('creepingBarrage') &&
    target.count >= (options.clearance ? 3 : 4) &&
    Math.random() < barrageChance * 0.55
  ) {
    if (support.tryAiStrike('creepingBarrage', target.x, target.z)) return;
  }

  // Airborne: once per side on Clear Defenses (isReady already enforces that).
  const airborneMin = options.clearance ? 3 : 4;
  const airborneChance = options.clearance ? 0.5 : 0.42;
  if (
    support.isReady('airborneDrop') &&
    players.length >= airborneMin &&
    Math.random() < airborneChance
  ) {
    support.tryAiStrike('airborneDrop', target.x, target.z);
  }
}

function findSupportTarget(players, support = null) {
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

    if (count <= bestCount) continue;
    const center = { x: sumX / count, z: sumZ / count };
    // Prefer a cluster centre, but fall back to an individual member if the
    // centre is behind a building or just outside the 72 m radio envelope.
    const candidates = [center, anchor.position, ...players
      .filter((player) => Math.hypot(player.position.x - anchor.position.x, player.position.z - anchor.position.z) <= 16)
      .map((player) => player.position)];
    const observed = candidates.find(
      (point) =>
        typeof support?.isPointObserved !== 'function' ||
        support.isPointObserved(point.x, point.z)
    );
    if (observed) {
      bestCount = count;
      best = { x: observed.x, z: observed.z, count };
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

function pickPresetAttackTarget(unit, players, scenery) {
  if (unit.def?.type === 'antiTankGun' || unit.def?.type === 'tank' || unit.def?.type === 'tankDestroyer' || unit.def?.type === 'superHeavyTank') {
    let best = null;
    let bestScore = Infinity;
    for (const foe of players) {
      if (foe.dead || foe.team === unit.team) continue;
      if (!isVisibleAttackTarget(unit, foe, scenery)) continue;
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
  return pickAttackTarget(unit, players, scenery);
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
  flankSide = 1,
  scenery = null
) {
  const d = difficulty ?? { attackAggressionMult: 1 };
  const tactic = lastStandTactic ?? getLastStandTactic('armoredThrust');
  const ai = tactic.ai ?? getLastStandTactic('armoredThrust').ai;
  const role = unit.lastStandRole ?? 'line';
  const hold = unit.defensiveHold;
  const isDefensive = unit.lastStandStance === 'defend' || (!!hold && unit.lastStandStance !== 'attack');
  const focus = pickPresetAttackTarget(unit, players, scenery);

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
        if (
          armorLead.attackOrder &&
          !armorLead.attackOrder.dead &&
          isVisibleAttackTarget(unit, armorLead.attackOrder, scenery)
        ) {
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

  updateLastStandUnit(unit, players, mapDef, difficulty, scenery);
}

function updateLastStandUnit(unit, players, mapDef, difficulty, scenery = null) {
  const d = difficulty ?? { attackAggressionMult: 1 };
  const hold = unit.defensiveHold;
  const isDefensive = unit.lastStandStance === 'defend' || (!!hold && unit.lastStandStance !== 'attack');
  const focus = pickAttackTarget(unit, players, scenery);

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

  const nearest = findNearestVisibleEnemy(unit, players, scenery);
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

/**
 * AI assault force for Clear Defenses when the player holds the line.
 * Uses the battle plan on game.clearanceAttackPlan and per-unit roles.
 */
function updateClearanceAttacker(unit, players, allies, mapDef, difficulty, game = null) {
  const d = difficulty ?? { attackAggressionMult: 1 };
  const plan = game?.clearanceAttackPlan ?? {
    infantryAdvance: 0.55,
    armorFollow: 0.55,
    supportHold: 0.5,
    flankBias: 0,
  };
  const role = unit.clearanceAttackRole ?? roleFromUnitType(unit.def?.type);
  const focus = pickAttackTarget(unit, players, game?.scenery);
  const aggression = d.attackAggressionMult ?? 1;

  // Support weapons (arty, mortar, AT): engage at range, stay slightly back.
  if (role === 'support') {
    if (focus) {
      unit.setAttackOrder(focus);
      if (!isInRange(unit, focus)) {
        // Close only enough to enter range; do not charge the trenches.
        if (Math.random() < plan.supportHold * 0.35) {
          unit.moveTarget = getStandoffPosition(unit, focus);
        }
      } else {
        unit.moveTarget = null;
      }
      return;
    }
    // Bound forward slowly toward the average enemy when idle.
    if (players.length && Math.random() < 0.28 * aggression) {
      const center = averagePosition(players);
      const half = mapDef.size / 2 - 8;
      unit.clearAttackOrder();
      unit.moveTarget = {
        x: clamp(center.x + (Math.random() - 0.5) * 18, -half, half),
        z: clamp(center.z + (Math.random() - 0.5) * 18, -half, half),
      };
    }
    return;
  }

  // Armor: spearhead or follow infantry depending on plan.
  if (role === 'armor') {
    if (focus) {
      unit.setAttackOrder(focus);
      if (!isInRange(unit, focus)) {
        unit.moveTarget = getStandoffPosition(unit, focus);
      }
      return;
    }
    if (Math.random() < plan.armorFollow * 0.4 * aggression) {
      unit.clearAttackOrder();
      unit.moveTarget = getClearanceAssaultAdvancePoint(mapDef, players, plan, unit);
    }
    return;
  }

  // Line infantry / engineers: main advance.
  if (focus) {
    unit.setAttackOrder(focus);
    if (!isInRange(unit, focus)) {
      unit.moveTarget = getStandoffPosition(unit, focus);
    }
    return;
  }

  if (unit.attackOrder && !unit.attackOrder.dead) return;

  const nearest = findNearestVisibleEnemy(unit, players, game?.scenery);
  if (nearest && unit.distanceTo(nearest) < unit.def.range * 1.6) {
    unit.setAttackOrder(nearest);
    unit.moveTarget = getStandoffPosition(unit, nearest);
    return;
  }

  if (players.length && Math.random() < plan.infantryAdvance * 0.38 * aggression) {
    unit.clearAttackOrder();
    unit.moveTarget = getClearanceAssaultAdvancePoint(mapDef, players, plan, unit);
  }
}

function roleFromUnitType(type) {
  if (type === 'tank' || type === 'tankDestroyer' || type === 'superHeavyTank' || type === 'armoredCar') {
    return 'armor';
  }
  if (
    type === 'artillery' ||
    type === 'mortar' ||
    type === 'antiTankGun' ||
    type === 'sniper' ||
    type === 'machineGun' ||
    type === 'radioOperator'
  ) {
    return 'support';
  }
  return 'line';
}

function getClearanceAssaultAdvancePoint(mapDef, players, plan, unit) {
  const center = players.length ? averagePosition(players) : { x: 0, z: 0 };
  const half = mapDef.size / 2 - 8;
  let flank = 0;
  if (plan.flankBias) {
    // Deterministic side per unit id so a hook stays coherent.
    const id = unit?.id ?? 0;
    flank = (id % 2 === 0 ? 1 : -1) * plan.flankBias * (14 + Math.random() * 10);
  }
  const pb = mapDef.playerBase;
  const eb = mapDef.enemyBase ?? { x: -pb.x, z: -pb.z };
  const ax = eb.x - pb.x;
  const az = eb.z - pb.z;
  const len = Math.hypot(ax, az) || 1;
  const lx = -az / len;
  const lz = ax / len;
  return {
    x: clamp(center.x + lx * flank + (Math.random() - 0.5) * 10, -half, half),
    z: clamp(center.z + lz * flank + (Math.random() - 0.5) * 10, -half, half),
  };
}

function updateClearanceDefender(unit, players, game = null) {
  const hold = unit.defensiveHold;
  const probe = unit._clearanceProbe;
  if (probe) {
    if (!players.length || (game?.matchTime ?? Infinity) >= probe.until) {
      unit._clearanceProbe = null;
      unit.clearAttackOrder();
      if (hold) {
        unit.moveTarget = { x: hold.x, z: hold.z };
        unit._userMoveOrder = false;
      }
      return;
    }

    const probeTarget = findNearestVisibleEnemy(unit, players, game?.scenery);
    if (probeTarget) {
      unit.setAttackOrder(probeTarget);
      if (!isInRange(unit, probeTarget)) {
        unit.moveTarget = getStandoffPosition(unit, probeTarget);
      }
    } else {
      unit.clearAttackOrder();
      unit.moveTarget = { x: probe.targetX, z: probe.targetZ };
    }
    return;
  }
  // Clear Defenses garrisons hold their prepared positions. The generic target
  // picker deliberately lets infantry/snipers notice enemies at up to 150% of
  // range, which made snipers acquire and walk toward the assembly area as soon
  // as the ceasefire ended. Only engage once a target is actually in range;
  // pursuit is reserved for the explicit probing-counterattack branch above.
  const nearest = findNearestVisibleEnemy(unit, players, game?.scenery);
  const focus = nearest && isInRange(unit, nearest) ? nearest : null;
  if (focus) {
    unit.setAttackOrder(focus);
    unit.moveTarget = null;
    unit._chasingAttack = false;
    return;
  }

  if (unit.attackOrder) {
    unit.clearAttackOrder();
    unit.moveTarget = null;
  }

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

function pickAttackTarget(unit, players, scenery = null) {
  if (unit.attackOrder && !unit.attackOrder.dead) {
    if (
      isVisibleAttackTarget(unit, unit.attackOrder, scenery) &&
      (isInRange(unit, unit.attackOrder) || unit._chasingAttack)
    ) return unit.attackOrder;
  }
  const nearest = findNearestVisibleEnemy(unit, players, scenery);
  if (!nearest) return null;
  const d = unit.distanceTo(nearest);
  if (d <= unit.def.range * 1.15) return nearest;
  if (
    d < unit.def.range * 1.5 &&
    (unit.def.type === 'infantry' ||
      unit.def.type === 'engineer' ||
      unit.def.type === 'sniper')
  )
    return nearest;
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
  if (roll < 0.53) return 'medic';
  if (roll < 0.58) return 'engineer';
  if (roll < 0.62) return 'radioOperator';
  if (roll < 0.69) return 'infantry';
  if (roll < 0.77) return 'sniper';
  if (roll < 0.84) return 'armoredCar';
  if (roll < 0.86) return 'mortar';
  if (roll < 0.9 - heavyBias * 0.35) return 'antiTankGun';
  if (roll < 0.93 - heavyBias * 0.45) return 'artillery';
  if (roll < 0.95 - heavyBias * 0.35) return 'tank';
  if (roll < 0.98) return 'tankDestroyer';
  return 'superHeavyTank';
}

function tryProduce(production, resources, spend, assault, difficulty) {
  const pick = rollEnemyUnitType(assault, difficulty);
  const tryOrder = [
    pick,
    'radioOperator',
    'infantry',
    'medic',
    'engineer',
    'machineGun',
    'mortar',
    'antiTankGun',
    'armoredCar',
    'sniper',
    'tank',
    'tankDestroyer',
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
