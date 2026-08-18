import {
  getStandoffPosition,
  findNearestEnemy,
  getUnitWeaponRange,
  isInRange,
  isSmokeShellReady,
} from './Targeting.js';
import { isTankType, isVehicleUnit, isFootSoldier } from '../units/VehicleTypes.js';
import { unitPathRadius } from './MovePath.js';
import { getLastStandTactic } from '../data/lastStandTactics.js';
import { CAMPAIGN_BALANCE } from '../data/campaignPace.js';
import { MINE_VEHICLE_TYPES } from '../data/towerDefense.js';
import {
  canSeekCover,
  findNearestCoverPoint,
  resolveSeekCoverDestination,
} from './CoverSeek.js';
import { canGarrisonType, getBunkerEnterRange, getGarrisonBunkerSources, isUnitGarrisoned } from './BunkerGarrison.js';
import { getCoverStatus } from './CoverSystem.js';
import { MEDIC_AURA_RANGE } from './MedicBehavior.js';
import { ENGINEER_AURA_RANGE, ENGINEER_HQ_REPAIR_RANGE } from './EngineerBehavior.js';
import { canReceiveFieldTentHeal, TENT_MIN_SPACING } from './MedicFieldHospital.js';
import {
  canHostRiders,
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
  canUseRadioBinoculars,
  activateRadioBinoculars,
  RADIO_OPERATOR_SUPPORT_RANGE,
  RADIO_BINOCULAR_SUPPORT_RANGE,
} from './RadioOperatorBehavior.js';
import {
  assessStandardBattle,
  chooseStandardProductionUnit,
  getStandardAiDoctrine,
  getStandardProductionCandidates,
} from './StandardAI.js';

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
/** Keep medical/repair specialists behind the main body between jobs. */
const SUPPORT_REAR_OFFSET = { medic: 9, engineer: 14 };
const SUPPORT_REAR_LATERAL_STEP = 2.4;
const SUPPORT_REAR_HOLD_RADIUS = 5.5;
const SUPPORT_REAR_MIN_THREAT_DISTANCE = 24;
const SUPPORT_CARE_MIN_HP_RATIO = 0.42;
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
const AI_RADIO_RELAY_SCREEN_RADIUS = 34;
const AI_RADIO_RELAY_SCREEN_FORWARD_MARGIN = 5;
const AI_RADIO_RELAY_SCREEN_LATERAL_RADIUS = 22;
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
const AI_COMMANDER_PULLBACK_DISTANCE = 34;
const AI_COMMANDER_SCREEN_TRIGGER_DISTANCE = 36;
const AI_COMMANDER_SCREEN_RECRUIT_RADIUS = 48;
const AI_COMMANDER_SCREEN_REASSESS_SEC = 5.5;
const AI_COMMANDER_SCREEN_MAX_UNITS = 3;
const AI_COMMANDER_SHELTER_SEEK_RANGE = 58;
const AI_COMMANDER_SAFETY_HOLD_SEC = 9;
const AI_INCOMING_FIRE_COVER_HOLD_SEC = 6.5;
const AI_INCOMING_FIRE_PRONE_SEC = 2.1;
const AI_INCOMING_FIRE_RETRY_SEC = 3.6;
const AI_INCOMING_FIRE_CRITICAL_HP_RATIO = 0.34;
const AI_INCOMING_FIRE_SUSTAINED_HP_RATIO = 0.56;
const AI_TRENCH_CAPACITY = 4;
const AI_TRENCH_MAX_OCCUPATION_DISTANCE = 48;
const AI_TRENCH_DEFAULT_RESERVE_RATIO = 0.32;
const AI_TRENCH_OCCUPANT_TYPES = new Set([
  'commander',
  'radioOperator',
  'infantry',
  'paratrooper',
  'machineGun',
  'sniper',
]);
const AI_FIELDWORK_MAX_ARMOR_THREAT_DISTANCE = 104;
const AI_FIELDWORK_MINE_LINE_MIN_DEPTH = 14;
const AI_FIELDWORK_MINE_LINE_MAX_DEPTH = 30;
const AI_FIELDWORK_BUNKER_SHELTER_RANGE = 30;
const AI_CAPTURE_POINT_GUARD_MAX_UNITS = 2;
const AI_CAPTURE_POINT_GUARD_RECRUIT_RADIUS = 46;
const AI_CAPTURE_POINT_GUARD_HOLD_RADIUS = 13;
const AI_CAPTURE_POINT_GUARD_ENGAGE_RADIUS = 34;
const AI_CAPTURE_POINT_FIELDWORK_RADIUS = 26;
const AI_CAPTURE_POINT_MINE_TARGET = 2;
const AI_CAPTURE_POINT_SANDBAG_TARGET = 2;
const AI_FIELDWORK_HOSPITAL_MIN_WOUNDED = 2;
const AI_FIELDWORK_HOSPITAL_WOUNDED_RATIO = 0.8;
const AI_FIELDWORK_HOSPITAL_CRITICAL_RATIO = 0.58;
const AI_FIELDWORK_HOSPITAL_REAR_OFFSET = 10;
const AI_FIELDWORK_HOSPITAL_MIN_ENEMY_DISTANCE = 24;
const LAST_STAND_OPERATIONAL_REASSESS_MIN = 11;
const LAST_STAND_OPERATIONAL_REASSESS_MAX = 16;
const LAST_STAND_OPENING_REASSESS_DELAY = 13;
const LAST_STAND_ATTACK_PULSE_INTERVAL = 14;
const LAST_STAND_REGROUP_MIN_DURATION = 10;
const LAST_STAND_DEFEND_MIN_DURATION = 16;
/** A stationary Force-on-Force player force eventually draws a response. */
const LAST_STAND_PLAYER_CAMP_MOVE_THRESHOLD = 6;
const LAST_STAND_PLAYER_CAMP_DURATION = 30;
const LAST_STAND_CAMP_ATTACK_COOLDOWN = 18;
const CLEARANCE_OPERATIONAL_REASSESS_MIN = 12;
const CLEARANCE_OPERATIONAL_REASSESS_MAX = 17;
const CLEARANCE_OPENING_REASSESS_DELAY = 12;
const CLEARANCE_ATTACK_PULSE_INTERVAL = 13;
const CLEARANCE_ATTACKER_REGROUP_MIN_DURATION = 9;
const CLEARANCE_ATTACKER_HOLD_MIN_DURATION = 10;
const CLEARANCE_DEFENDER_COUNTERATTACK_DURATION = 18;
const CLEARANCE_DEFENDER_FALLBACK_MIN_DURATION = 10;
const AI_DUPLICATE_ORDER_RADIUS = 2.75;
const AI_ORDER_SEPARATION_GAP = 0.4;
const AI_ORDER_MAX_COLUMNS = 5;

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

/** Foot troops that must occupy the prepared line instead of idling exposed. */
const CLEARANCE_DEFENDER_COVER_TYPES = new Set([
  'infantry',
  'paratrooper',
  'machineGun',
  'sniper',
  'radioOperator',
]);
const CLEARANCE_DEFENDER_COVER_MAX_DISTANCE = 34;
const CLEARANCE_DEFENDER_COVER_MAX_HOLD_DISTANCE = 30;
const CLEARANCE_DEFENDER_COVER_HOLD_RADIUS = 5.6;
const CLEARANCE_DEFENDER_TRENCH_MAX_DISTANCE = 48;

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

export function resetAI(openingDelay = 0, firstProdDelay = 5, defenseDelay = 24) {
  aiTimer = Math.max(0, openingDelay);
  aiProdTimer = Math.max(0, firstProdDelay);
  aiSupportTimer = 28;
  aiDefenseTimer = Math.max(0, defenseDelay);
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

function isStandardCampaignBattle(campaign, assault, clearance, lastStand) {
  return !!campaign && !assault && !clearance && !lastStand;
}

function getStandardAiIncomePerSecond(game, difficulty) {
  const enemyHq = game?.hqs?.find((hq) => hq.team === 'enemy' && !hq.dead);
  if (!enemyHq) return 0;
  let rate = CAMPAIGN_BALANCE.hqIncomeRate;
  for (const point of game?.capturePoints ?? []) {
    if (point.owner === 'enemy') rate += CAMPAIGN_BALANCE.captureIncomeRate;
  }
  return rate * (difficulty?.enemyIncomeMult ?? 1);
}

/**
 * Standard's strategic state is intentionally separate from the mode-specific
 * operational planners below. Production may ask for it between movement
 * ticks, while the per-unit doctrine consumes the same snapshot on the next
 * full AI pass.
 */
function getStandardAiPlan(
  game,
  enemyUnits,
  playerUnits,
  capturePoints,
  mapDef,
  difficulty,
  { force = false } = {}
) {
  const now = game?.matchTime ?? 0;
  const session = game?.lastSession ?? null;
  const existing = game?._standardAiPlan;
  if (
    !force &&
    existing?.session === session &&
    existing?.mapId === mapDef?.id &&
    now < (existing.nextAt ?? 0)
  ) {
    return existing;
  }

  const assessment = assessStandardBattle({
    enemyUnits,
    playerUnits,
    capturePoints,
    mapDef,
    enemyHq: game?.hqs?.find((hq) => hq.team === 'enemy' && !hq.dead),
    playerHq: game?.hqs?.find((hq) => hq.team === 'player' && !hq.dead),
    matchTime: now,
  });
  const doctrine = getStandardAiDoctrine(assessment, difficulty);
  const interval =
    doctrine.tier.planMin +
    Math.random() * (doctrine.tier.planMax - doctrine.tier.planMin);
  const plan = {
    ...doctrine,
    session,
    mapId: mapDef?.id ?? null,
    generatedAt: now,
    nextAt:
      now +
      interval *
        clamp((difficulty?.aiTickMult ?? 1) * 0.84, 0.72, 1.35),
  };
  if (game) game._standardAiPlan = plan;
  return plan;
}

function getStandardAiQueuedCounts(production) {
  const counts = Object.create(null);
  for (const job of production?.getQueue?.('enemy') ?? []) {
    counts[job.unitType] = (counts[job.unitType] ?? 0) + 1;
  }
  return counts;
}

function tryProduceStandard(production, resources, spend, game, plan, difficulty) {
  const faction = production?.getFaction?.('enemy');
  if (!faction?.units || !plan) return false;
  const unlocked = production?.getUnlockedUnits?.('enemy');
  const factionUnits = unlocked
    ? Object.fromEntries(
        Object.entries(faction.units).filter(([type]) => unlocked.has(type))
      )
    : faction.units;
  const candidates = getStandardProductionCandidates({
    plan,
    factionUnits,
    queuedCounts: getStandardAiQueuedCounts(production),
  });
  const unitType = chooseStandardProductionUnit({
    candidates,
    resources,
    incomePerSecond: getStandardAiIncomePerSecond(game, difficulty),
    choiceJitter: plan.tier.choiceJitter,
    canEnqueue: (type, currentResources) =>
      production.canEnqueue('enemy', type, currentResources),
  });
  if (!unitType) return false;
  return production.enqueue('enemy', unitType, spend);
}

function getStandardAiRole(type) {
  if (type === 'antiTankGun') return 'antiArmor';
  if (type === 'tankDestroyer') return 'antiArmor';
  if (type === 'mortar' || type === 'artillery') return 'fireSupport';
  if (type === 'machineGun' || type === 'sniper') return 'screen';
  if (isTankType(type) || type === 'armoredCar') return 'armor';
  return 'line';
}

function isStandardLivePlayer(unit) {
  return !!(
    unit &&
    !unit.dead &&
    !unit.surrendered &&
    !unit._captureExit &&
    !unit._dropping &&
    !unit._crewless
  );
}

function getStandardAiRoleTarget(unit, players, game, plan, strictRange = false) {
  const role = getStandardAiRole(unit.def?.type);
  const candidates = (players ?? []).filter(
    (target) => {
      if (
        !isStandardLivePlayer(target) ||
        !isVisibleAttackTarget(unit, target, game?.scenery)
      ) {
        return false;
      }
      const distance = unit.distanceTo(target);
      if ((unit.def?.minRange ?? 0) > distance) return false;
      return strictRange
        ? isInRange(unit, target)
        : distance <= getUnitWeaponRange(unit) * 1.5;
    }
  );
  if (!candidates.length) return null;

  let preferred = candidates;
  if (role === 'antiArmor') {
    const armor = candidates.filter(
      (target) =>
        isTankType(target.def?.type) ||
        target.def?.type === 'armoredCar' ||
        target.def?.type === 'antiTankGun'
    );
    if (armor.length) preferred = armor;
  } else if (role === 'armor') {
    const armor = candidates.filter(
      (target) =>
        isTankType(target.def?.type) ||
        target.def?.type === 'armoredCar' ||
        target.def?.type === 'antiTankGun'
    );
    if (armor.length) preferred = armor;
  } else if (role === 'screen') {
    const soft = candidates.filter((target) =>
      ['infantry', 'machineGun', 'sniper', 'mortar', 'medic', 'engineer', 'radioOperator'].includes(
        target.def?.type
      )
    );
    if (soft.length) preferred = soft;
  }

  let best = null;
  let bestScore = -Infinity;
  for (const target of preferred) {
    const distance = unit.distanceTo(target);
    let value = 1;
    if (target.def?.type === 'superHeavyTank') value = 12;
    else if (target.def?.type === 'tankDestroyer') value = 10;
    else if (target.def?.type === 'tank') value = 8;
    else if (target.def?.type === 'antiTankGun') value = 7;
    else if (target.def?.type === 'artillery') value = 6;
    else if (target.def?.type === 'mortar' || target.def?.type === 'machineGun') value = 4;
    else if (target.def?.type === 'radioOperator' || target.def?.type === 'commander') value = 3.5;

    if (role === 'fireSupport') {
      const cluster = preferred.filter(
        (candidate) =>
          Math.hypot(
            candidate.position.x - target.position.x,
            candidate.position.z - target.position.z
          ) <= 14
      ).length;
      value += cluster * 2.2;
    }
    if (role === 'antiArmor' && isTankType(target.def?.type)) value += 7;
    if (role === 'armor' && target.def?.type === 'antiTankGun') value += 5;
    if (target.attackOrder === unit) value += 2;
    const score = value - distance * 0.12;
    if (score > bestScore) {
      bestScore = score;
      best = target;
    }
  }
  return best;
}

function isStandardAiReserve(unit, plan) {
  if ((plan?.assessment?.enemy?.count ?? 0) < 6) return false;
  if (getStandardAiRole(unit.def?.type) === 'fireSupport') return false;
  const rawId = Number(unit.id);
  const seed = Number.isFinite(rawId)
    ? Math.abs(rawId)
    : String(unit.id ?? '')
        .split('')
        .reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const slot = (seed * 0.61803398875) % 1;
  return slot < (plan.reserveRatio ?? 0);
}

function getStandardAiRoleDestination(unit, plan, game) {
  const role = getStandardAiRole(unit.def?.type);
  const axis = plan.axis ?? {
    forwardX: 1,
    forwardZ: 0,
    perpendicularX: 0,
    perpendicularZ: 1,
  };
  const reserve = isStandardAiReserve(unit, plan);
  const anchor = reserve
    ? plan.rearAnchor ?? game?.mapDef?.enemyBase ?? { x: 0, z: 0 }
    : plan.anchor ?? game?.mapDef?.enemyBase ?? { x: 0, z: 0 };
  const operation = plan.operation;
  const restrictedArmor = (plan.armorMobility ?? 1) < 0.7;
  const id = Math.abs(Number(unit.id) || 0);
  const sideSlot = (id * 37) % 7 - 3;
  let depth = 0;
  let lateralScale = 4.5;

  if (role === 'fireSupport') {
    depth = restrictedArmor ? -8 : -12;
    lateralScale = restrictedArmor ? 5.5 : 7;
  } else if (role === 'antiArmor') {
    depth = restrictedArmor ? -4 : -6;
    lateralScale = restrictedArmor ? 6 : 8;
  } else if (role === 'armor') {
    depth = operation === 'counterattack'
      ? restrictedArmor ? 2 : 5
      : restrictedArmor ? 0 : 3;
    lateralScale = operation === 'counterattack'
      ? restrictedArmor ? 7 : 10
      : restrictedArmor ? 5 : 7;
  } else if (role === 'screen') {
    depth = operation === 'defend' || operation === 'contain' ? 1 : 0;
    lateralScale = 6;
  } else {
    depth = operation === 'defend' || operation === 'contain' ? 4 : 0;
    lateralScale = 4;
  }

  if (operation === 'regroup') depth -= role === 'fireSupport' ? 3 : 1;
  return clampAiOrderPoint(game?.mapDef, {
    x: anchor.x + axis.forwardX * depth + axis.perpendicularX * sideSlot * lateralScale,
    z: anchor.z + axis.forwardZ * depth + axis.perpendicularZ * sideSlot * lateralScale,
  });
}

function setStandardAiMove(unit, destination) {
  if (!destination) return;
  const goal = unit._finalMoveGoal ?? unit.moveTarget;
  const changed =
    !goal ||
    Math.hypot(goal.x - destination.x, goal.z - destination.z) > 2.5;
  if (changed) {
    unit.moveTarget = { x: destination.x, z: destination.z };
    unit._movePath = null;
    unit._finalMoveGoal = { x: destination.x, z: destination.z };
    unit._autoMoveOrderX = null;
    unit._autoMoveOrderZ = null;
    unit._pathRepathAttempts = 0;
    unit._lastPathRepathX = null;
    unit._lastPathRepathZ = null;
    unit._urbanCanalRoute = null;
  }
  unit._userMoveOrder = false;
  unit._reverseMoveOrder = false;
}

function holdStandardAiUnit(unit) {
  unit.moveTarget = null;
  unit._movePath = null;
  unit._finalMoveGoal = null;
  unit._autoMoveOrderX = null;
  unit._autoMoveOrderZ = null;
  unit._urbanCanalRoute = null;
  unit._userMoveOrder = false;
  unit._reverseMoveOrder = false;
  unit._chasingAttack = false;
}

function shouldPrioritizeStandardCover(unit, plan) {
  if (!unit || !plan || !canSeekCover(unit)) return false;
  const role = getStandardAiRole(unit.def?.type);
  return (
    role === 'screen' ||
    plan.operation === 'defend' ||
    plan.operation === 'contain' ||
    plan.operation === 'regroup'
  );
}

function maintainStandardAiCoverMove(unit, plan, players, game, assault) {
  if (!shouldPrioritizeStandardCover(unit, plan)) {
    unit._aiStandardCoverMove = null;
    return false;
  }

  if (getCoverStatus(unit).inCover) {
    unit._aiStandardCoverMove = null;
    if (['defend', 'contain', 'regroup'].includes(plan.operation)) {
      holdStandardAiUnit(unit);
      return true;
    }
    return false;
  }

  const existing = unit._aiStandardCoverMove;
  if (existing) {
    const distance = Math.hypot(
      unit.position.x - existing.x,
      unit.position.z - existing.z
    );
    if (distance > 3.5) {
      setStandardAiMove(unit, existing);
      return true;
    }
    unit._aiStandardCoverMove = null;
  }

  const destination = chooseCoverMove(unit, players, game, assault);
  if (!destination) return false;
  unit.clearAttackOrder();
  unit._aiStandardCoverMove = { x: destination.x, z: destination.z };
  setStandardAiMove(unit, destination);
  return true;
}

/**
 * Coordinate the Standard force around the current doctrine. Existing care,
 * radio, commander-screen, trench, and tank-maneuver controllers run before
 * this function and retain priority over these broad formation orders.
 */
function applyStandardAiUnitTactics(unit, plan, players, game) {
  if (!plan || !unit || unit.dead || unit.surrendered) return false;
  const type = unit.def?.type;
  if (
    !type ||
    type === 'commander' ||
    type === 'radioOperator' ||
    type === 'medic' ||
    type === 'engineer'
  ) {
    return false;
  }

  const role = getStandardAiRole(type);
  const reserve = isStandardAiReserve(unit, plan);
  const operation = plan.operation;
  const defensiveOperation =
    operation === 'defend' || operation === 'contain' || operation === 'regroup';
  const target = getStandardAiRoleTarget(
    unit,
    players,
    game,
    plan,
    defensiveOperation
  );

  if (defensiveOperation) {
    if (target) {
      // A defensive/containment unit may engage a target already inside its
      // weapon envelope, but should not turn that contact into a blind chase.
      unit.setAttackOrder(target, { respectStance: true });
      holdStandardAiUnit(unit);
      unit._aiStandardHold = true;
      return true;
    }

    unit.clearAttackOrder();
    const destination = getStandardAiRoleDestination(unit, plan, game);
    const holdRadius = role === 'fireSupport' ? 10 : role === 'armor' ? 13 : 9;
    const distance = Math.hypot(
      unit.position.x - destination.x,
      unit.position.z - destination.z
    );
    if (distance > holdRadius) setStandardAiMove(unit, destination);
    else holdStandardAiUnit(unit);
    unit._aiStandardHold = true;
    return true;
  }

  if (unit._aiStandardHold) unit._aiStandardHold = false;
  if (target) {
    unit.setAttackOrder(target);
    if (isInRange(unit, target)) holdStandardAiUnit(unit);
    else setStandardAiMove(unit, getStandoffPosition(unit, target));
    return true;
  }

  // Let ordinary advancing riflemen retain the established capture/cover
  // logic. Armor and fire support still receive a deliberate objective order.
  if (operation === 'advance' && role === 'line' && !reserve) return false;
  unit.clearAttackOrder();
  const destination = getStandardAiRoleDestination(unit, plan, game);
  if (
    Math.hypot(
      unit.position.x - destination.x,
      unit.position.z - destination.z
    ) > 6
  ) {
    setStandardAiMove(unit, destination);
  } else {
    holdStandardAiUnit(unit);
  }
  return operation === 'counterattack' || role !== 'line';
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

/**
 * Track whether the player's field force has settled into a camp. A move
 * order keeps the timer alive while it is still active; this prevents a slow
 * advance from being mistaken for a deliberate hold, while a player who has
 * simply stopped moving will eventually trigger an enemy attack response.
 */
function updateLastStandPlayerCampState(operational, players, playerSummary, now) {
  const center = playerSummary.center;
  const previousCenter = operational.playerLastCenter;
  const hasActiveMoveOrder = players.some(
    (unit) =>
      isLastStandOperationalUnit(unit) &&
      !!unit.moveTarget
  );
  const centerMovement = previousCenter
    ? Math.hypot(center.x - previousCenter.x, center.z - previousCenter.z)
    : Infinity;

  if (
    !Number.isFinite(operational.playerLastMovedAt) ||
    centerMovement >= LAST_STAND_PLAYER_CAMP_MOVE_THRESHOLD ||
    hasActiveMoveOrder
  ) {
    operational.playerLastMovedAt = now;
    operational.playerCampSince = null;
    operational.nextCampAttackAt = null;
  }

  operational.playerLastCenter = { ...center };
  const stationaryFor = now - (operational.playerLastMovedAt ?? now);
  const camped = stationaryFor >= LAST_STAND_PLAYER_CAMP_DURATION;
  if (camped) {
    operational.playerCampSince ??=
      operational.playerLastMovedAt + LAST_STAND_PLAYER_CAMP_DURATION;
  } else {
    operational.playerCampSince = null;
  }
  return camped;
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
    const initialPlayerSummary = getLastStandForceSummary(players);
    operational = {
      mode: 'opening',
      since: now,
      nextAt: now + LAST_STAND_OPENING_REASSESS_DELAY,
      attackPulseAt: now + LAST_STAND_OPENING_REASSESS_DELAY,
      playerLastCenter: { ...initialPlayerSummary.center },
      playerLastMovedAt: now,
      playerCampSince: null,
      nextCampAttackAt: null,
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

  const playerCamped = updateLastStandPlayerCampState(
    operational,
    players,
    playerSummary,
    now
  );
  const campAttackReady =
    playerCamped && now >= (operational.nextCampAttackAt ?? 0);

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
    } else if (campAttackReady) {
      // A defensive battle plan is allowed to hold the opening, but not to
      // leave the field permanently passive when the player camps.
      nextMode = 'attack';
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
      campAttackReady &&
      forceRatio >= 0.72 &&
      enemySummary.hpRatio >= 0.5
    ) {
      nextMode = 'attack';
    } else if (
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
      campAttackReady &&
      forceRatio >= 0.58 &&
      enemySummary.hpRatio >= 0.45
    ) {
      nextMode = 'attack';
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
    if (nextMode === 'attack' && campAttackReady) {
      operational.nextCampAttackAt = now + LAST_STAND_CAMP_ATTACK_COOLDOWN;
    }
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

function getAiOrderGoal(unit) {
  const target = unit?.moveTarget;
  if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.z)) {
    return null;
  }

  const final = unit._finalMoveGoal;
  if (!final || !Number.isFinite(final.x) || !Number.isFinite(final.z)) {
    return { x: target.x, z: target.z };
  }

  const pathHead = unit._movePath?.[0];
  const followingPath =
    pathHead && Math.hypot(target.x - pathHead.x, target.z - pathHead.z) < 0.35;
  const targetMatchesFinal = Math.hypot(target.x - final.x, target.z - final.z) < 0.35;
  return followingPath || targetMatchesFinal
    ? { x: final.x, z: final.z }
    : { x: target.x, z: target.z };
}

function canDiversifyAiOrder(unit) {
  const type = unit?.def?.type;
  return !!(
    unit &&
    unit.moveTarget &&
    !unit.dead &&
    !unit.surrendered &&
    !unit.retreating &&
    !unit._captureExit &&
    !unit._crewless &&
    !unit._aiTankManeuver &&
    !unit._aiRadioManeuver &&
    !unit._aiRadioSafety &&
    !unit._aiIncomingFireReaction &&
    !unit._aiCommanderScreen &&
    !unit._aiSupportMode &&
    !unit._aiTrenchTargetId &&
    !unit._aiTrenchOccupant &&
    !unit._clearanceDefenderCover &&
    !unit._trenchId &&
    !unit._bunkerEntryId &&
    !unit._garrisonBunkerId &&
    !isUnitGarrisoned(unit) &&
    type !== 'commander' &&
    type !== 'radioOperator' &&
    !unit.attackOrder?.isSmokeShell
  );
}

function getAiOrderGroupKey(unit) {
  if (unit.attackOrder && !unit.attackOrder.dead) return unit.attackOrder;
  return unit._tdAttacker ? 'towerDefenseAdvance' : 'sharedAdvance';
}

function compareAiOrderUnits(a, b) {
  const aId = Number(a.unit.id);
  const bId = Number(b.unit.id);
  if (Number.isFinite(aId) && Number.isFinite(bId) && aId !== bId) {
    return aId - bId;
  }
  return String(a.unit.id ?? '').localeCompare(String(b.unit.id ?? ''));
}

function clampAiOrderPoint(mapDef, point) {
  const half = Math.max(4, (mapDef?.size ?? 120) * 0.5 - 8);
  return {
    x: clamp(point.x, -half, half),
    z: clamp(point.z, -half, half),
  };
}

/**
 * Give units distinct destinations when a mode has issued one shared order.
 * This is deliberately a destination allocation pass rather than target
 * randomisation: a coordinated attack may still focus the same enemy, while
 * the individual units approach from separate lanes and cannot stack.
 */
export function diversifyAiMoveOrders(enemyUnits, game = null) {
  const groups = [];
  for (const unit of enemyUnits ?? []) {
    if (!canDiversifyAiOrder(unit)) continue;
    const goal = getAiOrderGoal(unit);
    if (!goal) continue;

    const key = getAiOrderGroupKey(unit);
    let group = groups.find(
      (candidate) =>
        candidate.key === key &&
        Math.hypot(candidate.anchor.x - goal.x, candidate.anchor.z - goal.z) <=
          AI_DUPLICATE_ORDER_RADIUS
    );
    if (!group) {
      group = { key, anchor: goal, members: [] };
      groups.push(group);
    }
    group.members.push({ unit, goal });
  }

  for (const group of groups) {
    if (group.members.length < 2) continue;
    group.members.sort(compareAiOrderUnits);

    let centerX = 0;
    let centerZ = 0;
    let positionX = 0;
    let positionZ = 0;
    let maxRadius = 0;
    for (const member of group.members) {
      centerX += member.goal.x;
      centerZ += member.goal.z;
      positionX += member.unit.position.x;
      positionZ += member.unit.position.z;
      maxRadius = Math.max(maxRadius, unitPathRadius(member.unit.def?.type));
    }
    centerX /= group.members.length;
    centerZ /= group.members.length;
    positionX /= group.members.length;
    positionZ /= group.members.length;

    let forwardX = centerX - positionX;
    let forwardZ = centerZ - positionZ;
    const travelLength = Math.hypot(forwardX, forwardZ);
    if (travelLength > 0.5) {
      forwardX /= travelLength;
      forwardZ /= travelLength;
    } else {
      const yaw = group.members[0].unit.mesh?.rotation?.y;
      const fallbackAngle = Number.isFinite(yaw)
        ? yaw
        : ((Number(group.members[0].unit.id) || 0) * 0.6180339887) % (Math.PI * 2);
      forwardX = Math.sin(fallbackAngle);
      forwardZ = Math.cos(fallbackAngle);
    }
    const sideX = -forwardZ;
    const sideZ = forwardX;
    // Keep the allocated destinations farther apart than the duplicate-order
    // test so re-running this pass is stable (important for Tower Defence's
    // per-frame AI update).
    const spacing = Math.max(3, maxRadius * 2 + AI_ORDER_SEPARATION_GAP);
    const columnCount = Math.min(AI_ORDER_MAX_COLUMNS, group.members.length);
    const rowCount = Math.ceil(group.members.length / columnCount);
    const depthSpacing = Math.max(2.3, spacing * 0.8);

    for (let index = 0; index < group.members.length; index++) {
      const { unit } = group.members[index];
      const row = Math.floor(index / columnCount);
      const column = index % columnCount;
      const lateralSlot = column - (columnCount - 1) * 0.5;
      const depthSlot = row - (rowCount - 1) * 0.5;
      const destination = clampAiOrderPoint(game?.mapDef, {
        x:
          centerX +
          sideX * lateralSlot * spacing +
          forwardX * depthSlot * depthSpacing,
        z:
          centerZ +
          sideZ * lateralSlot * spacing +
          forwardZ * depthSlot * depthSpacing,
      });

      unit.moveTarget = destination;
      unit._finalMoveGoal = { ...destination };
      unit._movePath = null;
      unit._autoMoveOrderX = null;
      unit._autoMoveOrderZ = null;
      unit._pathRepathAttempts = 0;
      unit._lastPathRepathX = null;
      unit._lastPathRepathZ = null;
      unit._urbanCanalRoute = null;
      unit._reverseMoveOrder = false;

      if (unit._tdMoveGoal) {
        unit._tdMoveGoal = {
          ...unit._tdMoveGoal,
          x: destination.x,
          z: destination.z,
        };
      }
    }
  }
}

function clearAiIncomingFireReaction(unit) {
  unit._aiIncomingFireReaction = null;
  if (!unit._garrisonBunkerId) unit._bunkerEntryId = null;
}

function isAiIncomingFireCandidate(unit) {
  const type = unit?.def?.type;
  return !!(
    unit &&
    unit.team === 'enemy' &&
    !unit.dead &&
    !unit.surrendered &&
    !unit._captureExit &&
    !unit._dropping &&
    !unit.retreating &&
    !unit._mountedOnTankId &&
    !unit._crewless &&
    !isVehicleUnit(type) &&
    type !== 'commander' &&
    type !== 'radioOperator' &&
    !isUnitGarrisoned(unit) &&
    !unit._trenchId &&
    !unit._diggingTrench &&
    !unit._trenchDigSite &&
    !unit._sandbagSite &&
    !unit._medicTentSite
  );
}

function isAiIncomingFireIdle(unit) {
  return !!(
    unit &&
    !unit._userMoveOrder &&
    !unit._manualFireMission &&
    (!unit.attackOrder || unit.attackOrder.dead) &&
    !unit.moveTarget &&
    !unit._movePath?.length
  );
}

function getAiIncomingFireCoverDestination(unit, game) {
  if (!game || !canSeekCover(unit)) return null;

  if (canGarrisonType(unit.def?.type)) {
    const bunker = pickFriendlyBunker(unit, getGarrisonBunkerSources(game));
    if (bunker) {
      return { x: bunker.x, z: bunker.z, bunkerId: bunker.id ?? null };
    }
  }

  if (!game.coverSystem) return null;
  const cover = findNearestCoverPoint(
    unit.position.x,
    unit.position.z,
    unit.position.x,
    unit.position.z,
    game.coverSystem
  );
  if (!cover) return null;
  if (Math.hypot(cover.x - unit.position.x, cover.z - unit.position.z) < 3) {
    return null;
  }
  return { x: cover.x, z: cover.z, bunkerId: null };
}

function issueAiIncomingFireCoverMove(unit, destination, game, now) {
  unit.clearAttackOrder();
  unit._bunkerEntryId = destination.bunkerId ?? null;
  unit.moveTarget = { x: destination.x, z: destination.z };
  unit._movePath = null;
  unit._finalMoveGoal = { x: destination.x, z: destination.z };
  unit._autoMoveOrderX = null;
  unit._autoMoveOrderZ = null;
  unit._pathRepathAttempts = 0;
  unit._lastPathRepathX = null;
  unit._lastPathRepathZ = null;
  unit._userMoveOrder = false;
  unit._reverseMoveOrder = false;
  unit._aiSupportMode = null;
  unit._aiIncomingFireReaction = {
    mode: 'cover',
    x: destination.x,
    z: destination.z,
    bunkerId: destination.bunkerId ?? null,
    until: now + AI_INCOMING_FIRE_COVER_HOLD_SEC,
  };
  unit._aiIncomingFireNextAt = now + AI_INCOMING_FIRE_COVER_HOLD_SEC;
  return true;
}

function canAiIncomingFireRetreat(unit, game, clearance) {
  if (unit.defensiveHold) return null;
  // Prepared Clear Defenses defenders are ordered to hold the line. They can
  // still go prone or seek cover, but must not abandon their prepared position.
  if (clearance && game?.clearanceRole !== 'defend') return null;
  return resolveRetreatHq(unit, game?.hqs, {
    clearance,
    clearanceRole: game?.clearanceRole,
    mapDef: game?.mapDef,
  });
}

/**
 * Exposed enemy foot troops react to a hit before the slower strategic AI tick.
 * A real player move/attack order remains authoritative; idle AI units take
 * cover when possible, otherwise stay low, and withdraw once badly mauled.
 * Radio operators and commanders retain their dedicated safety controllers.
 */
export function updateAiIncomingFireReactions({
  enemyUnits = [],
  game = null,
  mapDef = null,
  clearance = false,
} = {}) {
  const now = game?.matchTime ?? 0;

  for (const unit of enemyUnits) {
    if (!unit) continue;

    const reaction = unit._aiIncomingFireReaction;
    if (reaction) {
      if (unit.dead || unit.surrendered || unit.retreating || unit._userMoveOrder) {
        clearAiIncomingFireReaction(unit);
        continue;
      }

      if (reaction.mode === 'cover') {
        const covered = getCoverStatus(unit).inCover;
        if (covered || now >= reaction.until) {
          clearAiIncomingFireReaction(unit);
        } else if (!unit.moveTarget) {
          issueAiIncomingFireCoverMove(
            unit,
            { x: reaction.x, z: reaction.z, bunkerId: reaction.bunkerId },
            game,
            now
          );
        }
        if (unit._aiIncomingFireReaction) continue;
      } else if (now < reaction.until) {
        continue;
      } else {
        clearAiIncomingFireReaction(unit);
      }
    }

    if ((unit._underFireTimer ?? 0) <= 0) {
      unit._aiIncomingFireResponseCount = 0;
      unit._aiIncomingFireNextAt = 0;
      continue;
    }
    if (!isAiIncomingFireCandidate(unit)) continue;

    // Cover status is refreshed before the AI pass. Do not make a unit leave
    // protection just because a stray shell refreshed its under-fire timer.
    if (getCoverStatus(unit).inCover) continue;

    // Prone is the immediate reaction even when the unit is already engaging
    // an automatically acquired target. Movement/retreat is reserved for idle
    // units so explicit attack and movement orders are never hijacked.
    unit._underFireProneTimer = Math.max(
      unit._underFireProneTimer ?? 0,
      AI_INCOMING_FIRE_PRONE_SEC
    );
    if (!isAiIncomingFireIdle(unit)) continue;
    if (now < (unit._aiIncomingFireNextAt ?? 0)) continue;

    const responseCount = unit._aiIncomingFireResponseCount ?? 0;
    const hpRatio = unit.hp / Math.max(1, unit.maxHp);
    const retreatHq = canAiIncomingFireRetreat(unit, game, clearance);
    unit._aiIncomingFireResponseCount = responseCount + 1;

    // A critically damaged exposed soldier should stop trading shots and
    // withdraw. Less damaged units first try to reach nearby shelter.
    if (retreatHq && hpRatio <= AI_INCOMING_FIRE_CRITICAL_HP_RATIO) {
      startRetreat(unit, retreatHq, {
        mapDef: mapDef ?? game?.mapDef ?? null,
        scenery: game?.scenery ?? null,
      });
      unit._aiIncomingFireNextAt = now + AI_INCOMING_FIRE_COVER_HOLD_SEC;
      continue;
    }

    const destination = getAiIncomingFireCoverDestination(unit, game);
    if (destination) {
      issueAiIncomingFireCoverMove(unit, destination, game, now);
      continue;
    }

    // If there is no usable shelter and the unit has already tried to stay low
    // once, a second sustained exposure is enough to trigger a withdrawal.
    if (
      retreatHq &&
      responseCount >= 1 &&
      hpRatio <= AI_INCOMING_FIRE_SUSTAINED_HP_RATIO
    ) {
      startRetreat(unit, retreatHq, {
        mapDef: mapDef ?? game?.mapDef ?? null,
        scenery: game?.scenery ?? null,
      });
      unit._aiIncomingFireNextAt = now + AI_INCOMING_FIRE_COVER_HOLD_SEC;
      continue;
    }

    unit._aiIncomingFireReaction = {
      mode: 'prone',
      until: now + AI_INCOMING_FIRE_PRONE_SEC,
    };
    unit._aiIncomingFireNextAt = now + AI_INCOMING_FIRE_RETRY_SEC;
  }
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
  const standardCampaign = isStandardCampaignBattle(
    campaign,
    assault,
    clearance,
    lastStand
  );

  aiTimer -= dt;
  if (!enemyStagingPhase) {
    aiProdTimer -= dt;
  }

  if (enemyStagingPhase) {
    // The opening pause is a genuine planning phase: do not leave an older
    // attack order or move target active while the enemy is meant to wait.
    for (const unit of enemyUnits) {
      if (
        !unit ||
        unit.dead ||
        unit.retreating ||
        unit.surrendered ||
        unit._captureExit
      ) continue;
      unit.clearAttackOrder();
      unit.moveTarget = null;
    }
    return;
  }

  updateAiIncomingFireReactions({
    enemyUnits,
    game,
    mapDef,
    clearance: !!clearance,
  });

  if (!enemyStagingPhase && !clearance && aiProdTimer <= 0 && production && enemyResources !== undefined) {
    const prodDelayMult = standardCampaign
      ? clamp(d.aiProdMult ?? 1, 0.72, 2.4)
      : Math.min(d.aiProdMult ?? 1, 1.25);
    aiProdTimer =
      (AI_PROD_MIN + Math.random() * (AI_PROD_MAX - AI_PROD_MIN)) * prodDelayMult;
    const standardPlan = standardCampaign
      ? getStandardAiPlan(
          game,
          enemyUnits,
          playerUnits,
          capturePoints,
          mapDef,
          d
        )
      : null;
    if (standardCampaign) {
      tryProduceStandard(
        production,
        enemyResources,
        spendEnemy,
        game,
        standardPlan,
        d
      );
    } else {
      tryProduce(production, enemyResources, spendEnemy, assault, d);
    }
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
    updateAIDefenses(game, enemyUnits, playerUnits, dt, assault, {
      lastStand: !!lastStand,
      clearance: !!clearance,
    });
  }

  // Fresh Clear Defenses garrisons are spawned on prepared hold points, but
  // those points are not necessarily cover. Give eligible defenders a shelter
  // order before the slower strategic AI tick can leave them exposed.
  if (clearance && game?.clearanceRole !== 'defend') {
    ensureClearanceDefenderCover(game, enemyUnits);
  }

  if (aiTimer > 0) return;
  aiTimer = (AI_TICK_MIN + Math.random() * (AI_TICK_MAX - AI_TICK_MIN)) * d.aiTickMult;

  const aliveEnemies = enemyUnits;
  const alivePlayers = playerUnits;
  const standardPlan = standardCampaign
    ? getStandardAiPlan(
        game,
        aliveEnemies,
        alivePlayers,
        capturePoints,
        mapDef,
        d
      )
    : null;

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
    if (unit._aiCommanderScreen) {
      if (maintainAiCommanderScreen(unit, game, alivePlayers)) continue;
    }
    if (
      unit.retreating ||
      unit.surrendered ||
      unit._captureExit ||
      unit._sandbagSite ||
      unit._trenchDigSite ||
      unit._diggingTrench ||
      unit._medicTentSite ||
      isUnitGarrisoned(unit) ||
      unit._trenchId ||
      unit._aiTrenchTargetId ||
      unit._aiTrenchOccupant
    ) continue;

    if (unit._aiIncomingFireReaction) continue;

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

    // A small detachment stays behind at a sector the enemy has just taken.
    // This runs before the normal capture/advance logic so the next AI tick
    // cannot immediately pull every capturing squad away from the new flag.
    if (maintainAiCapturedPointGuard(unit, game, alivePlayers)) continue;

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
      // Specialist care takes priority over clearance regroup/fallback holds;
      // once the job is complete, the rear-support order keeps them out of the
      // assault while the rest of the force follows its operational doctrine.
      if (tryAssignSupportCare(unit, aliveEnemies, game, mapDef, careClaims)) continue;
      if (tryAssignSupportRearMove(unit, aliveEnemies, game, mapDef)) continue;
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
      // Battle Simulation regrouping must not strand medics or engineers away
      // from casualties; they still withdraw to the protected support line
      // after treatment while combat units obey the battle-plan hold.
      if (tryAssignSupportCare(unit, aliveEnemies, game, mapDef, careClaims)) continue;
      if (tryAssignSupportRearMove(unit, aliveEnemies, game, mapDef)) continue;
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
    // Keep medical and repair specialists with the protected rear support line
    // instead of letting generic capture/attack logic pull them into contact.
    if (tryAssignSupportRearMove(unit, aliveEnemies, game, mapDef)) {
      continue;
    }

    if (
      standardCampaign &&
      maintainStandardAiCoverMove(
        unit,
        standardPlan,
        alivePlayers,
        game,
        assault
      )
    ) {
      continue;
    }

    if (
      standardCampaign &&
      applyStandardAiUnitTactics(unit, standardPlan, alivePlayers, game)
    ) {
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
    if (nearest && unit.distanceTo(nearest) < getUnitWeaponRange(unit) * 1.35) {
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

  // Apply after every active AI planning tick so all standard, assault,
  // campaign, Clear Defenses, and Battle Simulation branches share the same
  // per-unit destination allocation.
  diversifyAiMoveOrders(aliveEnemies, game);
}

/**
 * Infantry from either side may operate an abandoned vehicle; surviving
 * bailout crews may reclaim their own repaired hull. Enemy AI prioritizes
 * nearby opportunities before resuming its normal battle task.
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
      !canHostRiders(tank.def?.type) ||
      !canSupplyReplacementCrew(unit, tank) ||
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
export function tryAssignSupportCare(unit, allies, game, mapDef, careClaims = new Set()) {
  const type = unit?.def?.type;
  if (type !== 'medic' && type !== 'engineer') return false;
  if (!unit || unit.dead || unit.retreating || unit.surrendered) return false;
  if (isUnitGarrisoned(unit)) return false;
  if (
    unit._mobilityDamaged ||
    unit.hp / Math.max(1, unit.maxHp) < SUPPORT_CARE_MIN_HP_RATIO ||
    (unit._underFireTimer ?? 0) > 0.45
  ) {
    return false;
  }
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
    holdAiSupportPosition(unit, 'care');
    return true;
  }

  // Approach from the friendly rear side of the patient rather than standing
  // directly on top of a vehicle or casualty in the firing line.
  issueAiSupportMove(
    unit,
    getAiSupportCareDestination(unit, job, game, mapDef),
    'care'
  );
  return true;
}

function issueAiSupportMove(unit, destination, mode) {
  const goal = unit._finalMoveGoal;
  const changed =
    !unit.moveTarget ||
    !goal ||
    Math.hypot(goal.x - destination.x, goal.z - destination.z) > 2.5;
  if (changed) {
    unit.moveTarget = { x: destination.x, z: destination.z };
    unit._movePath = null;
    unit._finalMoveGoal = { x: destination.x, z: destination.z };
    unit._pathRepathAttempts = 0;
    unit._lastPathRepathX = null;
    unit._lastPathRepathZ = null;
  }
  unit._userMoveOrder = false;
  unit._reverseMoveOrder = false;
  unit._aiSupportMode = mode;
}

function holdAiSupportPosition(unit, mode) {
  unit.moveTarget = null;
  unit._movePath = null;
  unit._finalMoveGoal = null;
  unit._autoMoveOrderX = null;
  unit._autoMoveOrderZ = null;
  unit._userMoveOrder = false;
  unit._reverseMoveOrder = false;
  unit._aiSupportMode = mode;
}

function getAiSupportCareDestination(unit, job, game, mapDef) {
  const rear = getAiCommanderRearAxis(game);
  const lateral = ((Math.abs(unit.id ?? 0) % 3) - 1) * 0.9;
  const standOff = job.stayRange * 0.82;
  const raw = {
    x: job.x + rear.x * standOff - rear.z * lateral,
    z: job.z + rear.z * standOff + rear.x * lateral,
  };
  const half = (mapDef?.size ?? 120) / 2 - 8;
  return {
    x: clamp(raw.x, -half, half),
    z: clamp(raw.z, -half, half),
  };
}

function getAiSupportRearDestination(unit, allies, game, mapDef) {
  const rear = getAiCommanderRearAxis(game);
  const combatAllies = (allies ?? []).filter(
    (ally) =>
      ally &&
      !ally.dead &&
      !ally.surrendered &&
      !ally._captureExit &&
      !ally._crewless &&
      ally.id !== unit.id &&
      !['commander', 'medic', 'engineer', 'radioOperator'].includes(ally.def?.type)
  );
  const hq = game?.hqs?.find((candidate) => candidate.team === unit.team && !candidate.dead);
  const anchor = combatAllies.length
    ? averagePosition(combatAllies)
    : hq?.position ?? rear.enemyBase;
  const type = unit.def?.type;
  const offset = combatAllies.length ? SUPPORT_REAR_OFFSET[type] ?? 11 : 4;
  const slot = ((Math.abs(unit.id ?? 0) % 5) - 2) * SUPPORT_REAR_LATERAL_STEP;
  const raw = {
    x: anchor.x + rear.x * offset - rear.z * slot,
    z: anchor.z + rear.z * offset + rear.x * slot,
  };
  const half = (mapDef?.size ?? 120) / 2 - 8;
  const rearPoint = {
    x: clamp(raw.x, -half, half),
    z: clamp(raw.z, -half, half),
  };
  const threats = game?._playerAlive ?? [];
  let nearestThreat = Infinity;
  for (const threat of threats) {
    if (
      !threat ||
      threat.dead ||
      threat.surrendered ||
      threat._captureExit ||
      threat._crewless
    ) continue;
    if (!threat.position) continue;
    nearestThreat = Math.min(
      nearestThreat,
      Math.hypot(rearPoint.x - threat.position.x, rearPoint.z - threat.position.z)
    );
  }
  if (nearestThreat < SUPPORT_REAR_MIN_THREAT_DISTANCE) {
    const push = SUPPORT_REAR_MIN_THREAT_DISTANCE - nearestThreat;
    rearPoint.x = clamp(rearPoint.x + rear.x * push, -half, half);
    rearPoint.z = clamp(rearPoint.z + rear.z * push, -half, half);
  }
  const covered = resolveSeekCoverDestination(
    unit,
    rearPoint.x,
    rearPoint.z,
    game?.coverSystem
  );
  if (
    covered &&
    Math.hypot(covered.x - rearPoint.x, covered.z - rearPoint.z) <= 26
  ) {
    return {
      x: clamp(covered.x, -half, half),
      z: clamp(covered.z, -half, half),
    };
  }
  return rearPoint;
}

/** Keep medical and repair specialists in a safe rear support position. */
export function tryAssignSupportRearMove(unit, allies, game, mapDef) {
  const type = unit?.def?.type;
  if (type !== 'medic' && type !== 'engineer') return false;
  if (!unit || unit.dead || unit.retreating || unit.surrendered || unit._captureExit) return false;
  if (unit._sandbagSite || unit._medicTentSite || unit._trenchDigSite || unit._diggingTrench) {
    return false;
  }

  unit.clearAttackOrder();
  unit._chasingAttack = false;

  // A garrisoned or mobility-damaged specialist cannot make a rear move; hold
  // it in place and let the normal healing aura work if a patient is nearby.
  if (isUnitGarrisoned(unit) || unit._mobilityDamaged) {
    holdAiSupportPosition(unit, 'rear');
    return true;
  }

  const destination = getAiSupportRearDestination(unit, allies, game, mapDef);
  const distance = Math.hypot(
    unit.position.x - destination.x,
    unit.position.z - destination.z
  );
  if (distance <= SUPPORT_REAR_HOLD_RADIUS) {
    holdAiSupportPosition(unit, 'rear');
    return true;
  }

  issueAiSupportMove(unit, destination, 'rear');
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
      if (missionDistance > getUnitWeaponRange(gun) * 0.96) continue;
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

function getAiTrenchPoint(unit) {
  if (unit?.defensiveHold && Number.isFinite(unit.defensiveHold.x) && Number.isFinite(unit.defensiveHold.z)) {
    return { x: unit.defensiveHold.x, z: unit.defensiveHold.z };
  }
  if (
    !unit?._userMoveOrder &&
    !unit?.attackOrder &&
    unit?.moveTarget &&
    Number.isFinite(unit.moveTarget.x) &&
    Number.isFinite(unit.moveTarget.z)
  ) {
    return { x: unit.moveTarget.x, z: unit.moveTarget.z };
  }
  return {
    x: unit?.position?.x ?? 0,
    z: unit?.position?.z ?? 0,
  };
}

function getAiTrenchAveragePoint(units, fallback = { x: 0, z: 0 }) {
  const safeFallback = {
    x: Number.isFinite(fallback?.x) ? fallback.x : 0,
    z: Number.isFinite(fallback?.z) ? fallback.z : 0,
  };
  let x = 0;
  let z = 0;
  let count = 0;
  for (const unit of units ?? []) {
    if (!unit) continue;
    const point = getAiTrenchPoint(unit);
    x += point.x;
    z += point.z;
    count++;
  }
  return count > 0 ? { x: x / count, z: z / count } : safeFallback;
}

function getAiTrenchFacing(game, context, point) {
  const playerHq = game?.hqs?.find((hq) => hq.team === 'player' && !hq.dead);
  let attacker = playerHq?.position ?? game?.mapDef?.playerBase ?? null;
  if (context?.kind === 'clearanceDefend' && game?.mapDef) {
    attacker = getClearanceAttackerSpawnBase(game.mapDef);
  }
  if (!attacker) return Math.PI;
  return Math.atan2(attacker.x - point.x, attacker.z - point.z);
}

function isAiCapturedPointGuardCandidate(unit) {
  const type = unit?.def?.type;
  return !!(
    isAiLiveEnemyUnit(unit) &&
    !unit.retreating &&
    !unit._mobilityDamaged &&
    !unit._sandbagSite &&
    !unit._trenchDigSite &&
    !unit._medicTentSite &&
    !unit._aiIncomingFireReaction &&
    !unit._aiSupportMode &&
    type !== 'commander' &&
    type !== 'radioOperator' &&
    type !== 'medic' &&
    type !== 'engineer' &&
    type !== 'artillery' &&
    type !== 'mortar'
  );
}

function clearAiCapturedPointGuards(game) {
  for (const unit of game?.units ?? []) {
    if (!unit?._aiStrategicPointGuardId) continue;
    releaseAiCapturedPointGuard(unit);
  }
}

function releaseAiCapturedPointGuard(unit) {
  if (!unit) return;
  unit._aiStrategicPointGuardId = null;
  if (unit.defensiveHold?._aiCapturedPoint) unit.defensiveHold = null;
}

/**
 * Standard / Frontline Command remembers ownership transitions and leaves a
 * bounded guard at the newest enemy capture. The state is deliberately kept
 * on the game instance so Classic and Forward Bases share the same doctrine.
 */
function getAiCapturedPointDefenseContext(game, enemyUnits, playerUnits) {
  if (!game?.campaign || game.assault || game.clearance || game.lastStand || game.towerDefense) {
    clearAiCapturedPointGuards(game);
    return null;
  }

  const capturePoints = game.capturePoints ?? [];
  if (!capturePoints.length) return null;
  const existingState = game._aiStrategicPointDefense;
  const state = existingState ?? {
    owners: Object.create(null),
    pointId: null,
  };
  game._aiStrategicPointDefense = state;

  let newestCapture = null;
  for (const point of capturePoints) {
    const previousOwner = state.owners[point.id];
    if (existingState && point.owner === 'enemy' && previousOwner !== 'enemy') {
      newestCapture = point;
    }
    state.owners[point.id] = point.owner ?? null;
  }

  let point = capturePoints.find(
    (candidate) => candidate.id === state.pointId && candidate.owner === 'enemy'
  );
  if (newestCapture) {
    point = newestCapture;
  } else if (!point) {
    const restoredGuardPoint = capturePoints.find(
      (candidate) =>
        candidate.owner === 'enemy' &&
        (enemyUnits ?? []).some(
          (unit) => unit?._aiStrategicPointGuardId === candidate.id
        )
    );
    const held = capturePoints.filter((candidate) => candidate.owner === 'enemy');
    point = restoredGuardPoint ?? held.sort((a, b) => {
      const nearestPlayer = (candidate) =>
        (playerUnits ?? []).reduce(
          (best, unit) =>
            !unit || unit.dead
              ? best
              : Math.min(best, Math.hypot(unit.position.x - candidate.x, unit.position.z - candidate.z)),
          Infinity
        );
      return nearestPlayer(a) - nearestPlayer(b);
    })[0] ?? null;
  }

  if (!point) {
    state.pointId = null;
    clearAiCapturedPointGuards(game);
    return null;
  }

  state.pointId = point.id;

  const heldPoints = capturePoints.filter((candidate) => candidate.owner === 'enemy');
  const heldPointIds = new Set(heldPoints.map((candidate) => candidate.id));
  for (const unit of enemyUnits ?? []) {
    if (
      unit?._aiStrategicPointGuardId &&
      (
        !heldPointIds.has(unit._aiStrategicPointGuardId) ||
        !isAiLiveEnemyUnit(unit) ||
        unit.retreating
      )
    ) {
      releaseAiCapturedPointGuard(unit);
    }
  }

  // Keep a small garrison at every held sector. The newest capture is handled
  // first so its capturing troops are the ones most likely to stay behind.
  heldPoints.sort((a, b) => (a.id === point.id ? -1 : b.id === point.id ? 1 : 0));
  for (const heldPoint of heldPoints) {
    const guards = (enemyUnits ?? []).filter(
      (unit) =>
        unit?._aiStrategicPointGuardId === heldPoint.id &&
        isAiLiveEnemyUnit(unit) &&
        !unit.retreating
    );
    const recruits = (enemyUnits ?? [])
      .filter(
        (unit) =>
          isAiCapturedPointGuardCandidate(unit) &&
          !unit._aiStrategicPointGuardId &&
          Math.hypot(unit.position.x - heldPoint.x, unit.position.z - heldPoint.z) <=
            AI_CAPTURE_POINT_GUARD_RECRUIT_RADIUS
      )
      .sort(
        (a, b) =>
          Math.hypot(a.position.x - heldPoint.x, a.position.z - heldPoint.z) -
          Math.hypot(b.position.x - heldPoint.x, b.position.z - heldPoint.z)
      );
    for (const recruit of recruits) {
      if (guards.length >= AI_CAPTURE_POINT_GUARD_MAX_UNITS) break;
      recruit._aiStrategicPointGuardId = heldPoint.id;
      const angle = ((Number(recruit.id) || guards.length + 1) * 2.399963) % (Math.PI * 2);
      recruit.defensiveHold = {
        x: heldPoint.x + Math.sin(angle) * 7,
        z: heldPoint.z + Math.cos(angle) * 7,
        radius: AI_CAPTURE_POINT_GUARD_HOLD_RADIUS,
        _aiCapturedPoint: true,
      };
      guards.push(recruit);
    }
  }

  const guards = (enemyUnits ?? []).filter(
    (unit) => unit?._aiStrategicPointGuardId === point.id && isAiLiveEnemyUnit(unit)
  );

  return {
    kind: 'capturedPoint',
    pointId: point.id,
    useTrenches: guards.length > 0,
    reserveRatio: 0.2,
    anchor: { x: point.x, z: point.z },
    heldUnits: guards,
    unitFilter: (unit) => unit?._aiStrategicPointGuardId === point.id,
  };
}

function maintainAiCapturedPointGuard(unit, game, playerUnits) {
  const pointId = unit?._aiStrategicPointGuardId;
  if (!pointId) return false;
  const point = game?.capturePoints?.find((candidate) => candidate.id === pointId);
  if (!game?.campaign || !point || point.owner !== 'enemy') {
    releaseAiCapturedPointGuard(unit);
    return false;
  }

  const hold = unit.defensiveHold?._aiCapturedPoint
    ? unit.defensiveHold
    : { x: point.x, z: point.z, radius: AI_CAPTURE_POINT_GUARD_HOLD_RADIUS };
  const currentTarget = unit.attackOrder;
  const targetNearPoint = !!(
    currentTarget &&
    !currentTarget.dead &&
    currentTarget.position &&
    Math.hypot(currentTarget.position.x - point.x, currentTarget.position.z - point.z) <=
      AI_CAPTURE_POINT_GUARD_ENGAGE_RADIUS
  );
  if (targetNearPoint) {
    if (!isInRange(unit, currentTarget)) unit.moveTarget = getStandoffPosition(unit, currentTarget);
    else unit.moveTarget = null;
    return true;
  }

  const threat = (playerUnits ?? [])
    .filter(
      (candidate) =>
        candidate &&
        !candidate.dead &&
        !candidate.surrendered &&
        !candidate._captureExit &&
        Math.hypot(candidate.position.x - point.x, candidate.position.z - point.z) <=
          AI_CAPTURE_POINT_GUARD_ENGAGE_RADIUS &&
        isVisibleAttackTarget(unit, candidate, game?.scenery)
    )
    .sort((a, b) => unit.distanceTo(a) - unit.distanceTo(b))[0];
  if (threat) {
    unit.setAttackOrder(threat);
    unit.moveTarget = isInRange(unit, threat) ? null : getStandoffPosition(unit, threat);
    return true;
  }

  unit.clearAttackOrder();
  const distance = Math.hypot(unit.position.x - hold.x, unit.position.z - hold.z);
  unit.moveTarget = distance > (hold.radius ?? AI_CAPTURE_POINT_GUARD_HOLD_RADIUS)
    ? { x: hold.x, z: hold.z }
    : null;
  return true;
}

function getAiDefensiveTrenchContext(
  game,
  enemyUnits,
  playerUnits,
  assault,
  { lastStand = false, clearance = false } = {}
) {
  if (!game?.infantryTrenches?.canUse?.()) return null;

  const liveEnemies = (enemyUnits ?? []).filter(
    (unit) =>
      unit &&
      unit.team === 'enemy' &&
      !unit.dead &&
      !unit.surrendered &&
      !unit._captureExit
  );
  const assaultState = assault ?? game.assault;
  const enemyHq = game.hqs?.find((hq) => hq.team === 'enemy' && !hq.dead);

  if (lastStand || game.lastStand?.phase === 'battle') {
    const mode = game.lastStand?.enemyOperational?.mode ?? 'opening';
    const tactic = game.lastStand?.enemyTactic;
    const armorMode = tactic?.ai?.armorMode;
    const mobilityDoctrine = armorMode === 'flank' || armorMode === 'followRecon';
    const held = liveEnemies.filter(
      (unit) => unit.lastStandStance === 'defend' && unit.defensiveHold
    );
    return {
      kind: 'lastStand',
      useTrenches: mode === 'defend' && !mobilityDoctrine,
      reserveRatio: mobilityDoctrine
        ? 0.62
        : tactic?.id === 'defensiveBelt'
          ? 0.24
          : AI_TRENCH_DEFAULT_RESERVE_RATIO,
      anchor: getAiTrenchAveragePoint(held, game.mapDef?.enemyBase),
      unitFilter: (unit) => unit.lastStandStance === 'defend' && !!unit.defensiveHold,
    };
  }

  if (clearance || game.clearance) {
    const enemyIsDefender = game.clearanceRole !== 'defend';
    const mode = game.clearanceOperational?.mode ?? 'opening';
    const held = liveEnemies.filter(
      (unit) => unit.defensiveHold && !unit._clearanceProbe
    );
    return {
      kind: enemyIsDefender ? 'clearanceDefend' : 'clearanceAttack',
      useTrenches: enemyIsDefender && (mode === 'hold' || mode === 'opening'),
      reserveRatio: 0.26,
      anchor: getAiTrenchAveragePoint(held, game.mapDef?.enemyBase),
      unitFilter: (unit) => !!unit.defensiveHold && !unit._clearanceProbe,
    };
  }

  if (assaultState) {
    const enemyIsDefender = assaultState.defenderTeam === 'enemy';
    const frontline = assaultState.frontlineCp;
    const lineHeld = !frontline || frontline.owner !== 'player';
    return {
      kind: enemyIsDefender ? 'assaultDefend' : 'assaultAttack',
      useTrenches: enemyIsDefender && lineHeld,
      reserveRatio: 0.34,
      anchor: frontline ?? enemyHq?.position ?? game.mapDef?.enemyBase ?? { x: 0, z: 0 },
      unitFilter: (unit) => unit.lastStandStance !== 'attack' && !unit._clearanceProbe,
    };
  }

  const capturedPointContext = getAiCapturedPointDefenseContext(
    game,
    liveEnemies,
    playerUnits
  );

  const hqThreatened = !!(
    enemyHq &&
    (playerUnits ?? []).some(
      (unit) =>
        unit &&
        !unit.dead &&
        !unit.surrendered &&
        !unit._captureExit &&
        Math.hypot(unit.position.x - enemyHq.position.x, unit.position.z - enemyHq.position.z) <= 56
    )
  );
  if (hqThreatened) {
    const defendersNearHq = liveEnemies.filter(
      (unit) =>
        Math.hypot(unit.position.x - enemyHq.position.x, unit.position.z - enemyHq.position.z) <= 58
    );
    if (defendersNearHq.length > 0) {
      return {
        kind: 'hqDefend',
        useTrenches: true,
        reserveRatio: 0.42,
        anchor: { x: enemyHq.position.x, z: enemyHq.position.z },
        unitFilter: (unit) =>
          Math.hypot(unit.position.x - enemyHq.position.x, unit.position.z - enemyHq.position.z) <= 64,
      };
    }
  }

  if (capturedPointContext) return capturedPointContext;

  const held = liveEnemies.filter(
    (unit) => unit.defensiveHold && unit.lastStandStance !== 'attack'
  );
  if (held.length >= 2) {
    return {
      kind: 'defensiveHold',
      useTrenches: true,
      reserveRatio: AI_TRENCH_DEFAULT_RESERVE_RATIO,
      anchor: getAiTrenchAveragePoint(held, game.mapDef?.enemyBase),
      unitFilter: (unit) => !!unit.defensiveHold && unit.lastStandStance !== 'attack',
    };
  }

  return null;
}

function isAiLiveEnemyUnit(unit) {
  return !!(
    unit &&
    unit.team === 'enemy' &&
    !unit.dead &&
    !unit.surrendered &&
    !unit._captureExit &&
    !unit._dropping
  );
}

function getAiArmoredThreats(playerUnits, anchor) {
  const point = anchor ?? { x: 0, z: 0 };
  return (playerUnits ?? [])
    .filter(
      (unit) =>
        unit &&
        !unit.dead &&
        !unit.surrendered &&
        !unit._captureExit &&
        !unit._crewless &&
        !unit.retreating &&
        MINE_VEHICLE_TYPES.has(unit.def?.type)
    )
    .map((unit) => {
      const currentDistance = Math.hypot(
        unit.position.x - point.x,
        unit.position.z - point.z
      );
      const moveDistance = unit.moveTarget
        ? Math.hypot(unit.moveTarget.x - point.x, unit.moveTarget.z - point.z)
        : Infinity;
      const attackPoint = unit.attackOrder?.position;
      const attackDistance = attackPoint
        ? Math.hypot(attackPoint.x - point.x, attackPoint.z - point.z)
        : Infinity;
      return {
        unit,
        currentDistance,
        approachDistance: Math.min(currentDistance, moveDistance, attackDistance),
      };
    })
    .filter(
      ({ currentDistance, approachDistance }) =>
        currentDistance <= AI_FIELDWORK_MAX_ARMOR_THREAT_DISTANCE ||
        approachDistance <= AI_FIELDWORK_MAX_ARMOR_THREAT_DISTANCE * 0.82
    )
    .sort((a, b) => a.approachDistance - b.approachDistance)
    .map(({ unit }) => unit);
}

function getAiDefensiveFieldworkContext(game, enemyUnits, playerUnits, trenchContext) {
  if (trenchContext?.useTrenches) {
    const heldUnits = (enemyUnits ?? []).filter(
      (unit) =>
        isAiLiveEnemyUnit(unit) &&
        (!trenchContext.unitFilter || trenchContext.unitFilter(unit))
    );
    return {
      ...trenchContext,
      useFieldworks: true,
      heldUnits,
      armoredThreats: getAiArmoredThreats(playerUnits, trenchContext.anchor),
    };
  }

  // Assault attackers, Clear Defenses attackers, Last Stand attack/regroup,
  // and mobile doctrines deliberately keep engineers and medics moving.
  if (trenchContext) return null;

  // In an otherwise mobile Standard battle, a tank column closing on the HQ
  // is enough to justify a short emergency mine/bunker programme.
  const enemyHq = game?.hqs?.find((hq) => hq.team === 'enemy' && !hq.dead);
  if (!enemyHq) return null;
  const anchor = { x: enemyHq.position.x, z: enemyHq.position.z };
  const armoredThreats = getAiArmoredThreats(playerUnits, anchor);
  if (!armoredThreats.length) return null;

  return {
    kind: 'hqArmorDefense',
    useFieldworks: true,
    useTrenches: false,
    anchor,
    heldUnits: (enemyUnits ?? []).filter(
      (unit) =>
        isAiLiveEnemyUnit(unit) &&
        Math.hypot(unit.position.x - anchor.x, unit.position.z - anchor.z) <= 68
    ),
    armoredThreats,
    unitFilter: (unit) =>
      Math.hypot(unit.position.x - anchor.x, unit.position.z - anchor.z) <= 84,
  };
}

function getAiFieldworkBuildPoint(game, context, buildType) {
  const anchor = context?.anchor ?? { x: 0, z: 0 };
  if (buildType !== 'mine') {
    return clampAiOrderPoint(game?.mapDef, anchor);
  }

  const threatPoint = context?.armoredThreats?.[0]?.position ??
    (context?.kind === 'capturedPoint'
      ? game?.hqs?.find((hq) => hq.team === 'player' && !hq.dead)?.position ?? game?.mapDef?.playerBase
      : null);
  if (!threatPoint) return clampAiOrderPoint(game?.mapDef, anchor);
  const dx = threatPoint.x - anchor.x;
  const dz = threatPoint.z - anchor.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 0.5) return clampAiOrderPoint(game?.mapDef, anchor);

  const depth = clamp(
    distance * 0.52,
    AI_FIELDWORK_MINE_LINE_MIN_DEPTH,
    AI_FIELDWORK_MINE_LINE_MAX_DEPTH
  );
  return clampAiOrderPoint(game?.mapDef, {
    x: anchor.x + (dx / distance) * depth,
    z: anchor.z + (dz / distance) * depth,
  });
}

function countAiFieldworksNear(game, context, buildType) {
  const manager = game?.engineerSandbags;
  const anchor = context?.anchor ?? { x: 0, z: 0 };
  const points = [
    ...(manager?._builtPositions ?? []),
    ...(manager?.sites ?? []),
  ];
  if (buildType === 'mine') points.push(...(manager?.mines ?? []));
  if (buildType === 'bunker') points.push(...(manager?.fieldBunkers ?? []));
  const matches = points.filter(
    (entry) =>
      entry?.team === 'enemy' &&
      (entry.buildType === buildType || (buildType === 'mine' && entry.damage != null) || (buildType === 'bunker' && entry.def?.garrison)) &&
      Math.hypot(entry.x - anchor.x, entry.z - anchor.z) <= AI_CAPTURE_POINT_FIELDWORK_RADIUS
  );
  return new Set(
    matches.map((entry) => `${entry.x.toFixed(2)}:${entry.z.toFixed(2)}`)
  ).size;
}

function getAiGarrisonBunkerEntries(game) {
  const entries = [];
  for (const source of getGarrisonBunkerSources(game)) {
    const sourceEntries = source.entries ?? source.fieldBunkers ?? source.objects ?? [];
    for (const entry of sourceEntries) {
      if (
        !entry ||
        entry.destroyed ||
        entry.team !== 'enemy' ||
        !entry.def?.garrison
      ) continue;
      entries.push(entry);
    }
  }
  return entries;
}

function hasAiGarrisonShelterNear(game, x, z, radius = AI_FIELDWORK_BUNKER_SHELTER_RANGE) {
  return getAiGarrisonBunkerEntries(game).some(
    (entry) =>
      Math.hypot(entry.x - x, entry.z - z) <= radius &&
      (entry.garrison?.length ?? 0) < (entry.def?.garrisonCapacity ?? 2)
  );
}

function getAiDefensiveHospitalPoint(game, context, wounded) {
  const center = wounded?.length
    ? averagePosition(wounded.slice(0, 6))
    : context?.anchor ?? { x: 0, z: 0 };
  const facing = getAiTrenchFacing(game, context, center);
  const rearX = -Math.sin(facing);
  const rearZ = -Math.cos(facing);
  const point = {
    x: center.x + rearX * AI_FIELDWORK_HOSPITAL_REAR_OFFSET,
    z: center.z + rearZ * AI_FIELDWORK_HOSPITAL_REAR_OFFSET,
  };
  const players = game?._playerAlive ?? [];
  for (let i = 0; i < 3; i++) {
    const nearest = players.reduce((best, player) => {
      if (!player || player.dead || !player.position) return best;
      return Math.min(
        best,
        Math.hypot(point.x - player.position.x, point.z - player.position.z)
      );
    }, Infinity);
    if (nearest >= AI_FIELDWORK_HOSPITAL_MIN_ENEMY_DISTANCE) break;
    point.x += rearX * 8;
    point.z += rearZ * 8;
  }
  return clampAiOrderPoint(game?.mapDef, point);
}

function isAiDefensiveEngineerCandidate(unit) {
  return !!(
    isAiLiveEnemyUnit(unit) &&
    unit.def?.type === 'engineer' &&
    !unit.retreating &&
    !unit._userMoveOrder &&
    !unit._mobilityDamaged &&
    !unit._sandbagSite &&
    !unit._medicTentSite &&
    !unit._trenchDigSite &&
    !unit._diggingTrench &&
    !unit._garrisonBunkerId &&
    !unit._trenchId &&
    !unit._aiIncomingFireReaction &&
    !unit._aiTankManeuver &&
    unit._aiSupportMode !== 'care' &&
    !unit._underFireTimer &&
    !unit.moveTarget &&
    (!unit.attackOrder || unit.attackOrder.dead)
  );
}

function isAiDefensiveMedicCandidate(unit) {
  return !!(
    isAiLiveEnemyUnit(unit) &&
    unit.def?.type === 'medic' &&
    !unit.retreating &&
    !unit._userMoveOrder &&
    !unit._mobilityDamaged &&
    !unit._medicTentSite &&
    !unit._sandbagSite &&
    !unit._trenchDigSite &&
    !unit._diggingTrench &&
    !unit._garrisonBunkerId &&
    !unit._trenchId &&
    !unit._aiIncomingFireReaction &&
    unit._aiSupportMode !== 'care' &&
    !unit._underFireTimer &&
    !unit.moveTarget &&
    (!unit.attackOrder || unit.attackOrder.dead)
  );
}

function getAiDefensiveHospitalNeed(enemyUnits, context) {
  const anchor = context?.anchor ?? { x: 0, z: 0 };
  const wounded = (enemyUnits ?? [])
    .filter(
      (unit) =>
        isAiLiveEnemyUnit(unit) &&
        canReceiveFieldTentHeal(unit) &&
        unit.def?.type !== 'medic' &&
        unit.def?.type !== 'engineer' &&
        unit.hp / Math.max(1, unit.maxHp) <= AI_FIELDWORK_HOSPITAL_WOUNDED_RATIO &&
        Math.hypot(unit.position.x - anchor.x, unit.position.z - anchor.z) <= 76
    )
    .sort(
      (a, b) =>
        a.hp / Math.max(1, a.maxHp) - b.hp / Math.max(1, b.maxHp)
    );
  const critical = wounded.some(
    (unit) => unit.hp / Math.max(1, unit.maxHp) <= AI_FIELDWORK_HOSPITAL_CRITICAL_RATIO
  );
  return wounded.length >= AI_FIELDWORK_HOSPITAL_MIN_WOUNDED || critical
    ? wounded
    : [];
}

function getAiDefensiveFieldworkPlans(game, context) {
  const manager = game?.engineerSandbags;
  if (!manager?.canUse?.() || !context?.useFieldworks) return [];

  const plans = [];
  const armoredThreat = (context.armoredThreats?.length ?? 0) > 0;
  const capturedPoint = context.kind === 'capturedPoint';
  const localMines = capturedPoint ? countAiFieldworksNear(game, context, 'mine') : 0;
  const localSandbags = capturedPoint ? countAiFieldworksNear(game, context, 'sandbags') : 0;
  if (
    (armoredThreat || capturedPoint) &&
    manager.canBuildMine?.() &&
    (!capturedPoint || localMines < AI_CAPTURE_POINT_MINE_TARGET)
  ) {
    plans.push({
      buildType: 'mine',
      point: getAiFieldworkBuildPoint(game, context, 'mine'),
    });
  }

  const shelteredFoot = (context.heldUnits ?? []).filter(
    (unit) => canGarrisonType(unit.def?.type) && !isVehicleUnit(unit.def?.type)
  );
  const bunkerPoint = getAiFieldworkBuildPoint(game, context, 'bunker');
  const bunkerGood =
    manager.canBuildBunker?.() &&
    shelteredFoot.length >= 2 &&
    !hasAiGarrisonShelterNear(game, bunkerPoint.x, bunkerPoint.z);
  if (bunkerGood) {
    plans.push({ buildType: 'bunker', point: bunkerPoint });
  }

  if (
    manager.canBuildSandbags?.() &&
    (!capturedPoint || localSandbags < AI_CAPTURE_POINT_SANDBAG_TARGET)
  ) {
    plans.push({
      buildType: 'sandbags',
      point: getAiFieldworkBuildPoint(game, context, 'sandbags'),
    });
  }

  if (capturedPoint) {
    const priority = {
      sandbags: localSandbags === 0 ? 0 : 3,
      bunker: 1,
      mine: 2,
    };
    plans.sort((a, b) => priority[a.buildType] - priority[b.buildType]);
  }

  return plans;
}

function getAiDefensiveHospitalPlan(game, playerUnits, enemyUnits, context) {
  const manager = game?.medicFieldHospitals;
  if (!manager?.canUse?.() || !context?.useFieldworks) return null;

  const wounded = getAiDefensiveHospitalNeed(enemyUnits, context);
  if (!wounded.length) return null;
  const point = getAiDefensiveHospitalPoint(game, context, wounded);
  if (
    manager.tents?.some(
      (tent) =>
        !tent.destroyed &&
        tent.team === 'enemy' &&
        Math.hypot(tent.x - point.x, tent.z - point.z) < TENT_MIN_SPACING * 1.8
    )
  ) return null;

  const nearestEnemy = (playerUnits ?? []).reduce((best, player) => {
    if (!player || player.dead || !player.position) return best;
    return Math.min(
      best,
      Math.hypot(point.x - player.position.x, point.z - player.position.z)
    );
  }, Infinity);
  if (nearestEnemy < AI_FIELDWORK_HOSPITAL_MIN_ENEMY_DISTANCE) return null;

  const medics = (enemyUnits ?? [])
    .filter(isAiDefensiveMedicCandidate)
    .sort(
      (a, b) =>
        Math.hypot(a.position.x - point.x, a.position.z - point.z) -
        Math.hypot(b.position.x - point.x, b.position.z - point.z)
    );
  if (!medics.length) return null;
  return { point, wounded, medics };
}

function clearAiConstructionMove(unit) {
  if (!unit) return;
  unit.moveTarget = null;
  unit._movePath = null;
  unit._finalMoveGoal = null;
  unit._autoMoveOrderX = null;
  unit._autoMoveOrderZ = null;
  unit._userMoveOrder = false;
}

function cancelAiDefensiveConstruction(game) {
  const units = game?.units ?? [];
  const fieldworks = game?.engineerSandbags;
  for (const site of [...(fieldworks?.sites ?? [])]) {
    if (site.team !== 'enemy' || !site._aiDefensiveFieldwork) continue;
    const engineer = units.find((unit) => unit.id === site.engineerId);
    if (engineer) {
      fieldworks.cancelForUnit?.(engineer);
      clearAiConstructionMove(engineer);
    }
  }

  const hospitals = game?.medicFieldHospitals;
  for (const site of [...(hospitals?.sites ?? [])]) {
    if (site.team !== 'enemy' || !site._aiDefensiveHospital) continue;
    const medic = units.find((unit) => unit.id === site.medicId);
    if (medic) {
      hospitals.cancelForUnit?.(medic);
      clearAiConstructionMove(medic);
    }
  }
}

function tryAiPlaceDefensiveHospital(game, playerUnits, enemyUnits, context) {
  const manager = game?.medicFieldHospitals;
  const plan = getAiDefensiveHospitalPlan(game, playerUnits, enemyUnits, context);
  if (!manager || !plan) return false;

  const before = new Set((manager.sites ?? []).map((site) => site.id));
  for (const medic of plan.medics) {
    if (
      !manager.tryAiPlace(
        plan.point.x,
        plan.point.z,
        'enemy',
        (candidate) => candidate.id === medic.id
      )
    ) continue;
    const site = (manager.sites ?? []).find((candidate) => !before.has(candidate.id));
    if (site) {
      site._aiDefensiveHospital = true;
      site._aiHospitalMode = context.kind;
    }
    return true;
  }
  return false;
}

function tryAiPlaceDefensiveFieldwork(game, enemyUnits, context) {
  const manager = game?.engineerSandbags;
  const plans = getAiDefensiveFieldworkPlans(game, context);
  if (!manager || !plans.length) return false;

  const engineers = (enemyUnits ?? [])
    .filter(isAiDefensiveEngineerCandidate)
    .sort((a, b) => {
      const aDistance = Math.hypot(a.position.x - context.anchor.x, a.position.z - context.anchor.z);
      const bDistance = Math.hypot(b.position.x - context.anchor.x, b.position.z - context.anchor.z);
      return aDistance - bDistance;
    });
  if (!engineers.length) return false;

  for (const plan of plans) {
    const rotationY = getAiTrenchFacing(game, context, plan.point);
    for (const engineer of engineers) {
      const before = new Set((manager.sites ?? []).map((site) => site.id));
      if (
        !manager.tryAiPlace(
          plan.point.x,
          plan.point.z,
          'enemy',
          plan.buildType,
          rotationY,
          (candidate) => candidate.id === engineer.id
        )
      ) continue;
      const site = (manager.sites ?? []).find((candidate) => !before.has(candidate.id));
      if (site) {
        site._aiDefensiveFieldwork = true;
        site._aiFieldworkMode = context.kind;
        site.rotationY = rotationY;
        if (site.marker) site.marker.rotation.y = rotationY;
      }
      return true;
    }
  }
  return false;
}

function isAiDefensiveTrenchBaseCandidate(
  unit,
  context,
  { includeTrench = false, includeAssigned = false } = {}
) {
  return !!(
    unit &&
    unit.team === 'enemy' &&
    !unit.dead &&
    !unit.surrendered &&
    !unit._captureExit &&
    !unit._dropping &&
    !unit.retreating &&
    !unit._mountedOnTankId &&
    !unit._crewless &&
    !unit._userMoveOrder &&
    !unit._manualFireMission &&
    !unit._trenchDigSite &&
    !unit._diggingTrench &&
    !unit._sandbagSite &&
    !unit._medicTentSite &&
    !unit._garrisonBunkerId &&
    !unit._aiIncomingFireReaction &&
    !unit._aiTankManeuver &&
    !unit._aiRadioManeuver &&
    !unit._aiRadioSafety &&
    !unit._aiSupportMode &&
    (includeAssigned || !unit._aiTrenchTargetId) &&
    (!unit.attackOrder || unit.attackOrder.dead) &&
    (includeTrench || !unit._trenchId) &&
    (!context?.unitFilter || context.unitFilter(unit))
  );
}

function isAiDefensiveTrenchDigger(unit, context) {
  return canDigAiTrenchType(unit?.def?.type) && isAiDefensiveTrenchBaseCandidate(unit, context);
}

function getAiDefensiveTrenchState(manager) {
  const trenches = (manager?.trenches ?? []).filter(
    (trench) => trench.team === 'enemy' && !trench.destroyed
  );
  const pending = (manager?.sites ?? []).filter(
    (site) => site.team === 'enemy' && site._aiDefensiveTrench
  );
  const occupied = trenches.reduce(
    (sum, trench) => sum + (trench.garrison?.length ?? 0),
    0
  );
  const freeSlots = trenches.reduce(
    (sum, trench) => sum + Math.max(0, AI_TRENCH_CAPACITY - (trench.garrison?.length ?? 0)),
    0
  );
  return {
    trenches,
    pending,
    occupied,
    freeSlots,
    capacity: (trenches.length + pending.length) * AI_TRENCH_CAPACITY,
  };
}

function getAiDefensiveTrenchDesiredCount(enemyUnits, context) {
  const potential = (enemyUnits ?? []).filter((unit) =>
    AI_TRENCH_OCCUPANT_TYPES.has(unit?.def?.type) &&
    isAiDefensiveTrenchBaseCandidate(unit, context, {
      includeTrench: true,
      includeAssigned: true,
    })
  );
  if (potential.length <= 1) return potential.length;
  const reserve = Math.min(
    potential.length - 1,
    Math.max(1, Math.ceil(potential.length * (context?.reserveRatio ?? AI_TRENCH_DEFAULT_RESERVE_RATIO)))
  );
  return Math.max(0, potential.length - reserve);
}

function clearAiDefensiveTrenchTarget(unit) {
  unit._aiTrenchTargetId = null;
  if (!unit._trenchId) unit._aiTrenchOccupant = false;
}

function releaseAiDefensiveTrenches(game, enemyUnits, manager) {
  for (const site of [...(manager?.sites ?? [])]) {
    if (site.team !== 'enemy' || !site._aiDefensiveTrench) continue;
    const digger = game.units?.find((unit) => unit.id === site.diggerId);
    if (digger) manager.cancelForUnit?.(digger);
  }

  const trenches = new Map(
    (manager?.trenches ?? [])
      .filter((trench) => trench.team === 'enemy' && !trench.destroyed)
      .map((trench) => [trench.id, trench])
  );
  for (const unit of enemyUnits ?? []) {
    const trench = unit?._trenchId ? trenches.get(unit._trenchId) : null;
    if (unit?._trenchId && (unit._aiTrenchOccupant || trench?._aiDefensiveTrench)) {
      manager.releaseUnit?.(unit);
    }
    if (unit?._aiTrenchTargetId || unit?._aiTrenchOccupant) {
      clearAiDefensiveTrenchTarget(unit);
    }
  }
}

function updateAiDefensiveTrenchOccupants(game, enemyUnits, context) {
  const manager = game?.infantryTrenches;
  if (!manager) return;
  if (!context?.useTrenches) {
    releaseAiDefensiveTrenches(game, enemyUnits, manager);
    return;
  }

  const state = getAiDefensiveTrenchState(manager);
  const trenchById = new Map(state.trenches.map((trench) => [trench.id, trench]));
  for (const unit of enemyUnits ?? []) {
    if (!unit) continue;
    if (
      (unit.dead || unit.surrendered || unit.retreating || unit._captureExit) &&
      (unit._aiTrenchTargetId || unit._aiTrenchOccupant)
    ) {
      if (unit._trenchId) manager.releaseUnit?.(unit);
      clearAiDefensiveTrenchTarget(unit);
      continue;
    }
    if (unit._userMoveOrder && (unit._aiTrenchTargetId || unit._aiTrenchOccupant)) {
      if (unit._trenchId) manager.releaseUnit?.(unit);
      clearAiDefensiveTrenchTarget(unit);
      continue;
    }
    if (unit._aiTrenchTargetId && !trenchById.has(unit._aiTrenchTargetId) && !unit._trenchId) {
      clearAiDefensiveTrenchTarget(unit);
    }
    if (unit._trenchId && trenchById.has(unit._trenchId)) {
      unit._aiTrenchOccupant = true;
      unit._aiTrenchTargetId = unit._trenchId;
    }
  }

  const desired = getAiDefensiveTrenchDesiredCount(enemyUnits, context);
  if (desired <= state.occupied || state.freeSlots <= 0) return;

  const candidates = (enemyUnits ?? [])
    .filter(
      (unit) =>
        AI_TRENCH_OCCUPANT_TYPES.has(unit?.def?.type) &&
        isAiDefensiveTrenchBaseCandidate(unit, context)
    )
    .sort((a, b) => {
      const aDistance = Math.hypot(a.position.x - context.anchor.x, a.position.z - context.anchor.z);
      const bDistance = Math.hypot(b.position.x - context.anchor.x, b.position.z - context.anchor.z);
      return aDistance - bDistance;
    });

  const planned = new Map();
  let assigned = 0;
  for (const unit of candidates) {
    if (state.occupied + assigned >= desired) break;

    let best = null;
    let bestDistance = AI_TRENCH_MAX_OCCUPATION_DISTANCE;
    for (const trench of state.trenches) {
      const used = (trench.garrison?.length ?? 0) + (planned.get(trench.id) ?? 0);
      if (used >= AI_TRENCH_CAPACITY) continue;
      const distance = Math.hypot(unit.position.x - trench.x, unit.position.z - trench.z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = trench;
      }
    }
    if (!best) continue;

    unit.clearAttackOrder();
    unit._bunkerEntryId = null;
    unit.moveTarget = { x: best.x, z: best.z };
    unit._movePath = null;
    unit._finalMoveGoal = { x: best.x, z: best.z };
    unit._autoMoveOrderX = null;
    unit._autoMoveOrderZ = null;
    unit._pathRepathAttempts = 0;
    unit._lastPathRepathX = null;
    unit._lastPathRepathZ = null;
    unit._reverseMoveOrder = false;
    unit._aiTrenchTargetId = best.id;
    unit._aiTrenchOccupant = true;
    planned.set(best.id, (planned.get(best.id) ?? 0) + 1);
    assigned++;
  }
}

function tryAiPlaceDefensiveTrench(game, enemyUnits, context) {
  const manager = game?.infantryTrenches;
  if (!manager?.canUse?.() || !context?.useTrenches) return false;

  const state = getAiDefensiveTrenchState(manager);
  const desired = getAiDefensiveTrenchDesiredCount(enemyUnits, context);
  if (desired <= 0 || state.capacity >= desired) return false;

  const diggers = (enemyUnits ?? [])
    .filter((unit) => isAiDefensiveTrenchDigger(unit, context))
    .sort((a, b) => {
      const aPoint = getAiTrenchPoint(a);
      const bPoint = getAiTrenchPoint(b);
      const aDistance = Math.hypot(aPoint.x - context.anchor.x, aPoint.z - context.anchor.z);
      const bDistance = Math.hypot(bPoint.x - context.anchor.x, bPoint.z - context.anchor.z);
      return aDistance - bDistance;
    });

  for (const digger of diggers) {
    const point = getAiTrenchPoint(digger);
    const rotationY = getAiTrenchFacing(game, context, point);
    const before = new Set((manager.sites ?? []).map((site) => site.id));
    if (
      !manager.tryAiPlace(
        point.x,
        point.z,
        'enemy',
        rotationY,
        (candidate) => candidate.id === digger.id
      )
    ) continue;

    const site = (manager.sites ?? []).find((candidate) => !before.has(candidate.id));
    if (site) {
      site._aiDefensiveTrench = true;
      site._aiTrenchMode = context.kind;
      site.rotationY = rotationY;
      if (site.marker) site.marker.rotation.y = rotationY;
      const assignedDigger = enemyUnits.find((unit) => unit.id === site.diggerId);
      if (assignedDigger) assignedDigger._aiTrenchOccupant = true;
    }
    return true;
  }
  return false;
}

function updateAIDefenses(game, enemyUnits, playerUnits, dt, assault, options = {}) {
  const trenchContext = getAiDefensiveTrenchContext(
    game,
    enemyUnits,
    playerUnits,
    assault,
    options
  );
  updateAiDefensiveTrenchOccupants(game, enemyUnits, trenchContext);
  const fieldworkContext = getAiDefensiveFieldworkContext(
    game,
    enemyUnits,
    playerUnits,
    trenchContext
  );
  if (!fieldworkContext?.useFieldworks) {
    cancelAiDefensiveConstruction(game);
  }

  const clearanceDefenderNeedsWorks =
    !!options.clearance &&
    game?.clearanceRole !== 'defend' &&
    enemyUnits.some((unit) => unit?._clearanceDefenderCoverPending);
  if (
    clearanceDefenderNeedsWorks &&
    (game._clearanceDefenderNextWorksAt ?? 0) <= (game.matchTime ?? 0)
  ) {
    // Reinforcement infantry should not wait for the ordinary 34–56 second
    // defensive reassessment if no usable cover was available at their spawn.
    aiDefenseTimer = 0;
    game._clearanceDefenderNextWorksAt = (game.matchTime ?? 0) + 6;
  }

  aiDefenseTimer -= dt;
  if (aiDefenseTimer > 0 || !enemyUnits.length) return;
  aiDefenseTimer = 34 + Math.random() * 22;

  // Defensive lines get a trench before the engineer spends this cycle on a
  // mine, sandbag, or bunker. Once the line has enough trench capacity, the
  // existing engineer fortification routine keeps doing its normal work.
  if (tryAiPlaceDefensiveTrench(game, enemyUnits, trenchContext)) {
    for (const unit of enemyUnits) {
      if (unit?._trenchDigSite) unit._clearanceDefenderCoverPending = false;
    }
    return;
  }

  if (tryAiPlaceDefensiveHospital(game, playerUnits, enemyUnits, fieldworkContext)) return;
  if (tryAiPlaceDefensiveFieldwork(game, enemyUnits, fieldworkContext)) return;

  // Known mobile/assault postures deliberately do not start new stationary
  // construction. The fallback below is retained for ordinary Standard play
  // before a clear defensive or armour-threat context has formed.
  if (fieldworkContext) return;

  const engineers = enemyUnits.filter(
    (unit) =>
      unit.def?.type === 'engineer' &&
      !unit._sandbagSite &&
      !unit._medicTentSite &&
      !unit.retreating &&
      !unit._garrisonBunkerId &&
      !unit._underFireTimer
  );
  if (engineers.length && game.engineerSandbags?.canUse?.()) {
    const engineer = engineers[Math.floor(Math.random() * engineers.length)];
    const buildType = game.engineerSandbags.canBuildSandbags?.() ? 'sandbags' : 'bunker';
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

function getClearanceDefenderHoldPoint(unit) {
  const hold = unit?.defensiveHold;
  return {
    x: Number.isFinite(hold?.x) ? hold.x : unit?.position?.x ?? 0,
    z: Number.isFinite(hold?.z) ? hold.z : unit?.position?.z ?? 0,
  };
}

function isClearanceDefenderCoverCandidate(unit) {
  return !!(
    unit &&
    unit.team === 'enemy' &&
    CLEARANCE_DEFENDER_COVER_TYPES.has(unit.def?.type) &&
    unit.defensiveHold &&
    !unit.dead &&
    !unit.surrendered &&
    !unit._captureExit &&
    !unit._dropping &&
    !unit.retreating &&
    !unit._mountedOnTankId &&
    !unit._crewless &&
    !unit._userMoveOrder &&
    !unit._manualFireMission &&
    !unit._aiIncomingFireReaction &&
    !unit._aiCommanderScreen &&
    !unit._aiSupportMode &&
    !unit._aiRadioManeuver &&
    !unit._aiRadioSafety &&
    !unit._clearanceProbe &&
    !unit._trenchId &&
    !unit._trenchDigSite &&
    !unit._diggingTrench &&
    !unit._sandbagSite &&
    !unit._medicTentSite &&
    !unit._garrisonBunkerId &&
    !unit._aiTrenchTargetId &&
    !unit._aiTrenchOccupant &&
    (!unit.attackOrder || unit.attackOrder.dead)
  );
}

function getClearanceBunkerEntries(game) {
  const entries = [];
  for (const source of getGarrisonBunkerSources(game)) {
    const sourceEntries = source?.entries ?? source?.fieldBunkers ?? source?.objects ?? [];
    for (const entry of sourceEntries) {
      if (entry && !entries.includes(entry)) entries.push(entry);
    }
  }
  return entries;
}

function getClearanceBunkerById(game, id) {
  if (id == null) return null;
  return getClearanceBunkerEntries(game).find((entry) => entry.id === id) ?? null;
}

function isClearanceBunkerAvailable(entry, unit) {
  return !!(
    entry &&
    !entry.destroyed &&
    !entry.building &&
    entry.def?.garrison &&
    ((!entry.neutralGarrison && entry.team === unit.team) ||
      entry.neutralGarrison && (!entry.garrisonTeam || entry.garrisonTeam === unit.team)) &&
    (entry.garrison?.length ?? 0) < (entry.def.garrisonCapacity ?? 2)
  );
}

function findClearanceDefenderBunker(unit, game) {
  const hold = getClearanceDefenderHoldPoint(unit);
  const holdRadius = unit.defensiveHold?.radius ?? 12;
  const maxHoldDistance = Math.max(
    CLEARANCE_DEFENDER_COVER_MAX_HOLD_DISTANCE,
    holdRadius + 18
  );
  let best = null;
  let bestScore = Infinity;

  for (const entry of getClearanceBunkerEntries(game)) {
    if (!isClearanceBunkerAvailable(entry, unit)) continue;
    const distance = Math.hypot(entry.x - unit.position.x, entry.z - unit.position.z);
    const holdDistance = Math.hypot(entry.x - hold.x, entry.z - hold.z);
    if (distance > 46 || holdDistance > maxHoldDistance) continue;
    const score = distance + holdDistance * 0.32 + (entry.garrison?.length ?? 0) * 4;
    if (score < bestScore) {
      bestScore = score;
      const enterRange = getBunkerEnterRange(entry);
      best = {
        kind: 'bunker',
        id: entry.id,
        x: entry.x,
        z: entry.z,
        enterRange,
        radius: Math.max(5.2, enterRange + 1.2),
        reached: false,
      };
    }
  }
  return best;
}

function findClearanceDefenderTrench(unit, game) {
  const trenches = game?.infantryTrenches?.trenches ?? [];
  const hold = getClearanceDefenderHoldPoint(unit);
  const holdRadius = unit.defensiveHold?.radius ?? 12;
  const maxHoldDistance = Math.max(
    CLEARANCE_DEFENDER_COVER_MAX_HOLD_DISTANCE,
    holdRadius + 18
  );
  let best = null;
  let bestScore = Infinity;

  for (const trench of trenches) {
    if (
      !trench ||
      trench.destroyed ||
      trench.team !== unit.team ||
      (trench.garrison?.length ?? 0) >= AI_TRENCH_CAPACITY
    ) continue;
    const distance = Math.hypot(trench.x - unit.position.x, trench.z - unit.position.z);
    const holdDistance = Math.hypot(trench.x - hold.x, trench.z - hold.z);
    if (distance > CLEARANCE_DEFENDER_TRENCH_MAX_DISTANCE || holdDistance > maxHoldDistance) continue;
    const score = distance + holdDistance * 0.25 - (AI_TRENCH_CAPACITY - (trench.garrison?.length ?? 0)) * 0.8;
    if (score < bestScore) {
      bestScore = score;
      best = {
        kind: 'trench',
        id: trench.id,
        x: trench.x,
        z: trench.z,
        radius: 3.4,
        reached: false,
      };
    }
  }
  return best;
}

function findClearanceDefenderCoverZone(unit, game) {
  const zones = game?.coverSystem?.zones ?? [];
  const hold = getClearanceDefenderHoldPoint(unit);
  const holdRadius = unit.defensiveHold?.radius ?? 12;
  const maxHoldDistance = Math.max(
    CLEARANCE_DEFENDER_COVER_MAX_HOLD_DISTANCE,
    holdRadius + 18
  );
  let best = null;
  let bestScore = Infinity;

  for (const zone of zones) {
    if (!zone || !Number.isFinite(zone.x) || !Number.isFinite(zone.z)) continue;
    // A garrisonable building is handled through the bunker route above. Do
    // not send a unit to the solid centre of a non-garrisonable building.
    if (game.scenery?.isFieldWorksPlacementBlocked?.(zone.x, zone.z, 1.2)) continue;
    if (zone.type === 'trench') {
      const trench = (game.infantryTrenches?.trenches ?? []).find(
        (candidate) =>
          !candidate.destroyed &&
          Math.hypot(candidate.x - zone.x, candidate.z - zone.z) < 1.2
      );
      if (!trench || (trench.garrison?.length ?? 0) >= AI_TRENCH_CAPACITY) continue;
    }

    const distance = Math.hypot(zone.x - unit.position.x, zone.z - unit.position.z);
    const holdDistance = Math.hypot(zone.x - hold.x, zone.z - hold.z);
    if (distance > CLEARANCE_DEFENDER_COVER_MAX_DISTANCE || holdDistance > maxHoldDistance) continue;

    const coverQuality = Math.max(0, 1 - (zone.mult ?? 0.45));
    const score = distance + holdDistance * 0.3 - coverQuality * 8;
    if (score < bestScore) {
      bestScore = score;
      best = {
        kind: 'cover',
        x: zone.x,
        z: zone.z,
        type: zone.type ?? 'medium',
        radius: zone.radius ?? 4,
        reached: false,
      };
    }
  }
  return best;
}

function isClearanceDefenderCoverTargetValid(target, unit, game) {
  if (!target) return false;
  if (target.kind === 'bunker') {
    return isClearanceBunkerAvailable(getClearanceBunkerById(game, target.id), unit);
  }
  if (target.kind === 'trench') {
    const trench = game?.infantryTrenches?.getTrenchById?.(target.id);
    return !!(
      trench &&
      !trench.destroyed &&
      trench.team === unit.team &&
      (trench.garrison?.length ?? 0) < AI_TRENCH_CAPACITY
    );
  }
  return !!game?.coverSystem?.zones?.some(
    (zone) =>
      zone.type === target.type &&
      Math.hypot(zone.x - target.x, zone.z - target.z) < 1.5
  );
}

function issueClearanceDefenderCoverOrder(unit, target) {
  const assignment = unit._clearanceDefenderCover === target
    ? target
    : { ...target };
  unit._clearanceDefenderCover = assignment;
  unit._clearanceDefenderCoverPending = false;

  unit.defensiveHold = {
    ...(unit.defensiveHold ?? {}),
    x: assignment.x,
    z: assignment.z,
    radius: assignment.radius ?? CLEARANCE_DEFENDER_COVER_HOLD_RADIUS,
  };

  if (assignment.kind === 'bunker') {
    unit._bunkerEntryId = assignment.id;
  } else {
    unit._bunkerEntryId = null;
  }

  const distance = Math.hypot(
    unit.position.x - assignment.x,
    unit.position.z - assignment.z
  );
  const arrivalRange =
    assignment.kind === 'bunker'
      ? (assignment.enterRange ?? 4.5) + 0.6
      : assignment.kind === 'trench'
        ? 3.4
        : Math.max(2.2, Math.min(assignment.radius ?? 4, 3.8));

  unit.clearAttackOrder();
  if (distance <= arrivalRange) {
    assignment.reached = true;
    unit.moveTarget = null;
    unit._movePath = null;
    unit._finalMoveGoal = null;
    return;
  }

  assignment.reached = false;
  unit.moveTarget = { x: assignment.x, z: assignment.z };
  unit._movePath = null;
  unit._finalMoveGoal = { x: assignment.x, z: assignment.z };
  unit._autoMoveOrderX = null;
  unit._autoMoveOrderZ = null;
  unit._pathRepathAttempts = 0;
  unit._lastPathRepathX = null;
  unit._lastPathRepathZ = null;
  unit._reverseMoveOrder = false;
  unit._userMoveOrder = false;
}

/** Keep fresh Fortified Line garrison infantry in an actual shelter/cover. */
function ensureClearanceDefenderCover(game, enemyUnits) {
  if (!game || game.clearanceRole === 'defend') return;

  for (const unit of enemyUnits ?? []) {
    if (!isClearanceDefenderCoverCandidate(unit)) continue;

    const currentAssignment = unit._clearanceDefenderCover;
    if (currentAssignment && isClearanceDefenderCoverTargetValid(currentAssignment, unit, game)) {
      issueClearanceDefenderCoverOrder(unit, currentAssignment);
      continue;
    }
    if (currentAssignment?.kind === 'bunker' && unit._bunkerEntryId === currentAssignment.id) {
      unit._bunkerEntryId = null;
    }
    unit._clearanceDefenderCover = null;

    const currentCover = game.coverSystem?.getCoverForUnit?.(unit);
    if (currentCover?.mult < 0.95) {
      issueClearanceDefenderCoverOrder(unit, {
        kind: 'cover',
        x: unit.position.x,
        z: unit.position.z,
        type: currentCover.tier ?? 'medium',
        radius: CLEARANCE_DEFENDER_COVER_HOLD_RADIUS,
        reached: true,
      });
      continue;
    }

    const target =
      findClearanceDefenderTrench(unit, game) ??
      findClearanceDefenderBunker(unit, game) ??
      findClearanceDefenderCoverZone(unit, game);
    if (target) {
      issueClearanceDefenderCoverOrder(unit, target);
    } else {
      unit._clearanceDefenderCoverPending = true;
    }
  }
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
  let nearestUnit = null;
  let score = 0;
  let engaged = false;
  let directUnit = null;

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
    if (distance < nearest) {
      nearest = distance;
      nearestUnit = player;
    }

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
      directUnit = player;
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
    nearestUnit,
    directUnit,
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

function clearAiCommanderScreen(unit) {
  const screen = unit?._aiCommanderScreen;
  if (!screen) return;
  unit._aiCommanderScreen = null;

  // A player order always remains authoritative. AI-owned screen orders are
  // safe to clear when the commander no longer needs protection.
  if (unit._userMoveOrder || unit._manualFireMission) return;
  if (
    screen.mode === 'attack' &&
    unit.attackOrder &&
    (!screen.threatId || unit.attackOrder.id === screen.threatId)
  ) {
    unit.clearAttackOrder?.();
    return;
  }

  const goal = unit._finalMoveGoal;
  if (
    screen.mode === 'move' &&
    goal &&
    screen.goal &&
    Math.hypot(goal.x - screen.goal.x, goal.z - screen.goal.z) <= 2.5
  ) {
    unit.moveTarget = null;
    unit._movePath = null;
    unit._finalMoveGoal = null;
    unit._autoMoveOrderX = null;
    unit._autoMoveOrderZ = null;
  }
}

function clearAiCommanderScreens(enemyUnits, commanderId = null) {
  for (const unit of enemyUnits ?? []) {
    const screen = unit?._aiCommanderScreen;
    if (!screen) continue;
    if (commanderId !== null && screen.commanderId !== commanderId) continue;
    clearAiCommanderScreen(unit);
  }
}

function isAiCommanderScreenCandidate(unit, commander) {
  const type = unit?.def?.type;
  return !!(
    unit &&
    commander &&
    unit !== commander &&
    unit.team === commander.team &&
    AI_COMMANDER_FRONTLINE_TYPES.has(type) &&
    !unit.dead &&
    !unit.surrendered &&
    !unit._captureExit &&
    !unit._dropping &&
    !unit.retreating &&
    !unit._crewless &&
    !unit._mobilityDamaged &&
    !unit._userMoveOrder &&
    !unit._manualFireMission &&
    !unit._aiIncomingFireReaction &&
    !unit._aiTankManeuver &&
    !unit._aiRadioManeuver &&
    !unit._aiRadioSafety &&
    !unit._aiSupportMode &&
    !unit._sandbagSite &&
    !unit._medicTentSite &&
    !unit._trenchDigSite &&
    !unit._diggingTrench &&
    !unit._trenchId &&
    !unit._aiTrenchTargetId &&
    !unit._aiTrenchOccupant &&
    !unit._garrisonBunkerId &&
    !isUnitGarrisoned(unit) &&
    !unit.attackOrder?.isSmokeShell
  );
}

function isAiCommanderScreenActive(unit, game, playerUnits) {
  const screen = unit?._aiCommanderScreen;
  if (!screen) return false;
  const now = game?.matchTime ?? 0;
  if (
    now >= (screen.reassessAt ?? 0) ||
    unit.dead ||
    unit.surrendered ||
    unit.retreating ||
    unit._userMoveOrder ||
    unit._manualFireMission ||
    unit._aiIncomingFireReaction ||
    unit._mobilityDamaged ||
    unit._garrisonBunkerId ||
    unit._trenchId
  ) return false;

  const threat = (playerUnits ?? []).find(
    (candidate) =>
      candidate &&
      candidate.id === screen.threatId &&
      !candidate.dead &&
      !candidate.surrendered &&
      !candidate._captureExit
  );
  if (!threat) return false;

  if (
    screen.mode === 'move' &&
    !unit.attackOrder &&
    Math.hypot(unit.position.x - threat.position.x, unit.position.z - threat.position.z) <=
      Math.max(12, (unit.def?.range ?? 0) * 1.15)
  ) {
    if (unit.setAttackOrder?.(threat)) screen.mode = 'attack';
  }
  return true;
}

/** Keep a commander screen order ahead of mode-specific movement logic. */
export function maintainAiCommanderScreen(unit, game, playerUnits = []) {
  if (!unit?._aiCommanderScreen) return false;
  if (isAiCommanderScreenActive(unit, game, playerUnits)) return true;
  clearAiCommanderScreen(unit);
  return false;
}

function updateAiCommanderScreens(game, commander, enemyUnits, playerUnits, threat, now) {
  if (!commander || !threat) {
    clearAiCommanderScreens(enemyUnits, commander?.id ?? null);
    return false;
  }

  const commanderCover = getCoverStatus(commander);
  const protectedInPlace =
    commanderCover.garrisoned ||
    commanderCover.inTrench ||
    !!commander._garrisonBunkerId ||
    !!commander._trenchId;
  const commanderHpRatio = commander.hp / Math.max(1, commander.maxHp);
  const screenTrigger = protectedInPlace
    ? AI_COMMANDER_CRITICAL_DISTANCE + 5
    : AI_COMMANDER_SCREEN_TRIGGER_DISTANCE;
  const shouldScreen =
    threat.engaged ||
    threat.nearest <= screenTrigger ||
    (commander._underFireTimer ?? 0) > 0 ||
    commanderHpRatio <= 0.58;
  if (!shouldScreen) {
    clearAiCommanderScreens(enemyUnits, commander.id);
    return false;
  }

  const focus = threat.directUnit ?? threat.nearestUnit;
  if (!focus?.position) {
    clearAiCommanderScreens(enemyUnits, commander.id);
    return false;
  }

  const desiredCount = Math.min(
    AI_COMMANDER_SCREEN_MAX_UNITS,
    threat.engaged || threat.nearest <= AI_COMMANDER_CRITICAL_DISTANCE || commanderHpRatio <= 0.5
      ? 3
      : 2
  );
  const active = [];
  for (const unit of enemyUnits ?? []) {
    if (unit?._aiCommanderScreen?.commanderId !== commander.id) continue;
    if (
      isAiCommanderScreenActive(unit, game, playerUnits) &&
      unit._aiCommanderScreen.threatId === focus.id
    ) {
      active.push(unit);
    } else {
      clearAiCommanderScreen(unit);
    }
  }
  if (active.length >= desiredCount) return true;

  clearAiCommanderScreens(enemyUnits, commander.id);
  const candidates = (enemyUnits ?? [])
    .filter((unit) => isAiCommanderScreenCandidate(unit, commander))
    .filter(
      (unit) =>
        Math.hypot(
          unit.position.x - commander.position.x,
          unit.position.z - commander.position.z
        ) <= AI_COMMANDER_SCREEN_RECRUIT_RADIUS
    )
    .sort((a, b) => {
      const roleScore = (unit) => {
        if (unit.def?.type === 'machineGun') return 9;
        if (unit.def?.type === 'antiTankGun') return 7;
        if (unit.def?.type === 'tank' || unit.def?.type === 'tankDestroyer') return 5;
        return 0;
      };
      const aDistance = Math.hypot(
        a.position.x - commander.position.x,
        a.position.z - commander.position.z
      );
      const bDistance = Math.hypot(
        b.position.x - commander.position.x,
        b.position.z - commander.position.z
      );
      const aAttack = a.attackOrder && !a.attackOrder.dead ? 4 : 0;
      const bAttack = b.attackOrder && !b.attackOrder.dead ? 4 : 0;
      return (
        aDistance * 0.65 - roleScore(a) - aAttack -
        (a.hp / Math.max(1, a.maxHp)) * 3
      ) - (
        bDistance * 0.65 - roleScore(b) - bAttack -
        (b.hp / Math.max(1, b.maxHp)) * 3
      );
    });
  if (!candidates.length) return false;

  const anchor = commander._aiCommanderGoal ?? commander.position;
  let dx = focus.position.x - anchor.x;
  let dz = focus.position.z - anchor.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 0.5) {
    const rear = getAiCommanderRearAxis(game);
    dx = -rear.x;
    dz = -rear.z;
  } else {
    dx /= distance;
    dz /= distance;
  }
  const sideX = -dz;
  const sideZ = dx;
  const screenDepth = clamp(distance * 0.48, 8, AI_COMMANDER_SCREEN_RADIUS - 4);
  const picked = candidates.slice(0, desiredCount);

  picked.forEach((unit, index) => {
    const lateral = (index - (picked.length - 1) * 0.5) * 4.5;
    const goal = clampAiCommanderPoint(
      game,
      anchor.x + dx * screenDepth + sideX * lateral,
      anchor.z + dz * screenDepth + sideZ * lateral
    );
    const distanceToThreat = Math.hypot(
      unit.position.x - focus.position.x,
      unit.position.z - focus.position.z
    );
    const canIntercept =
      unit.def?.type !== 'artillery' &&
      distanceToThreat <= Math.max(12, (unit.def?.range ?? 0) * 1.15);

    let mode = 'move';
    if (canIntercept && unit.setAttackOrder?.(focus)) {
      mode = 'attack';
    } else {
      unit.moveTo?.(goal.x, goal.z, game.mapDef, false, game.scenery);
    }
    unit._aiCommanderScreen = {
      commanderId: commander.id,
      threatId: focus.id,
      mode,
      goal,
      reassessAt: now + AI_COMMANDER_SCREEN_REASSESS_SEC,
    };
  });
  return true;
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
  if (!commander || commander.dead) {
    clearAiCommanderScreens(enemyUnits);
    return false;
  }

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
  const commanderHpRatio = commander.hp / Math.max(1, commander.maxHp);
  const exposedSafetyThreat =
    !protectedInPlace &&
    (
      currentThreat.danger ||
      currentThreat.engaged ||
      currentThreat.nearest <= AI_COMMANDER_PULLBACK_DISTANCE ||
      commanderHpRatio <= 0.72
    );
  const protectedEmergency =
    protectedInPlace &&
    (
      currentThreat.engaged ||
      currentThreat.nearest <= AI_COMMANDER_CRITICAL_DISTANCE ||
      commanderHpRatio <= 0.34
    );

  if (
    (exposedSafetyThreat || protectedEmergency) &&
    now >= (commander._aiCommanderSafetyUntil ?? 0)
  ) {
    commander._aiCommanderSafetyUntil = now + AI_COMMANDER_SAFETY_HOLD_SEC;
    returnAiCommanderToRear(game, commander, { preferShelter: true });
    updateAiCommanderScreens(game, commander, enemyUnits, playerUnits, currentThreat, now);
    return true;
  }

  if (now < (commander._aiCommanderSafetyUntil ?? 0)) {
    returnAiCommanderToRear(game, commander, { preferShelter: true });
    updateAiCommanderScreens(game, commander, enemyUnits, playerUnits, currentThreat, now);
    return true;
  }

  updateAiCommanderScreens(game, commander, enemyUnits, playerUnits, currentThreat, now);

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

  // Fortified Line's prepared garrison must not abandon its defensive belt,
  // but an enemy assault force is still allowed to make the same emergency
  // withdrawal as other AI forces when the player is defending.
  const enemyIsPreparedGarrison =
    clearance && game?.clearanceRole !== 'defend';
  if (!enemyIsPreparedGarrison && desperate && manager.isReady('fullRetreat')) {
    return manager.issue('fullRetreat');
  }

  if (
    underPressure &&
    !desperate &&
    enemySummary.hpRatio > 0.58 &&
    manager.isReady('digIn') &&
    manager.issue('digIn')
  ) {
    return true;
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

function isAiRadioScreenUnit(unit, radio) {
  if (
    !unit ||
    unit === radio ||
    unit.dead ||
    unit.surrendered ||
    unit.retreating ||
    unit._captureExit ||
    unit._dropping ||
    unit._crewless
  ) {
    return false;
  }
  return ![
    'commander',
    'radioOperator',
    'medic',
    'engineer',
    'mortar',
    'artillery',
  ].includes(unit.def?.type);
}

/**
 * Count combat troops close enough to protect a proposed relay station. At
 * least one should be between the operator and the observed player cluster;
 * merely having another rear-area specialist nearby is not a useful screen.
 */
function getAiRadioRelayScreen(destination, cluster, enemyUnits, radio) {
  let toTargetX = cluster.center.x - destination.x;
  let toTargetZ = cluster.center.z - destination.z;
  const toTargetLength = Math.hypot(toTargetX, toTargetZ) || 1;
  toTargetX /= toTargetLength;
  toTargetZ /= toTargetLength;

  let nearby = 0;
  let forward = 0;
  for (const ally of enemyUnits ?? []) {
    if (!isAiRadioScreenUnit(ally, radio)) continue;
    const dx = ally.position.x - destination.x;
    const dz = ally.position.z - destination.z;
    const distance = Math.hypot(dx, dz);
    if (distance > AI_RADIO_RELAY_SCREEN_RADIUS) continue;
    nearby++;
    const depth = dx * toTargetX + dz * toTargetZ;
    const lateral = Math.abs(dx * -toTargetZ + dz * toTargetX);
    if (
      depth >= AI_RADIO_RELAY_SCREEN_FORWARD_MARGIN &&
      lateral <= AI_RADIO_RELAY_SCREEN_LATERAL_RADIUS
    ) {
      forward++;
    }
  }
  return { nearby, forward };
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
    const hardCover =
      cover.garrisoned || cover.inTrench || cover.tier === 'heavy';
    // Critical-threat safety withdrawals are for exposed operators. A bunker,
    // trench, or other heavy position is already the safe destination, so do
    // not make the operator abandon it merely because an enemy is nearby.
    // Combat's normal morale check still allows a badly mauled unit to break.
    if (threat.critical && !hardCover) {
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
    const screen = getAiRadioRelayScreen(destination, cluster, enemyUnits, radio);
    // Do not trade a radio operator for a quicker opening strike. Open-ground
    // relays wait for a proper two-unit escort with somebody in front; covered
    // relays may operate with one frontline screen nearby.
    const adequatelyScreened = candidate.covered
      ? screen.forward >= 1 && screen.nearby >= 1
      : screen.forward >= 1 && screen.nearby >= 2;
    if (!adequatelyScreened) continue;
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
      Math.max(0, 2 - screen.nearby) * 8 -
      Math.min(3, screen.forward) * 3 +
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
  return ['strafe', 'airBomb', 'barrage', 'creepingBarrage', 'airborneDrop'].some((type) =>
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
  updateAISupport(support, options.supportTargets ?? players, dt, difficulty, {
    ...options,
    radioCoveragePending,
  });
}

/** Raise binoculars when a player cluster sits just past base radio range. */
function tryAiRadioBinoculars(game, players) {
  if (!game || !players?.length) return false;
  const radios = getRadioOperators(game.units, 'enemy');
  for (const radio of radios) {
    if (!canUseRadioBinoculars(radio)) continue;
    let wants = false;
    for (const p of players) {
      if (p.dead) continue;
      const d = Math.hypot(
        p.position.x - radio.position.x,
        p.position.z - radio.position.z
      );
      if (d > RADIO_OPERATOR_SUPPORT_RANGE && d <= RADIO_BINOCULAR_SUPPORT_RANGE) {
        wants = true;
        break;
      }
    }
    if (wants && activateRadioBinoculars(radio)) return true;
  }
  return false;
}

function updateAISupport(support, players, dt, difficulty, options = {}) {
  if (!support || players.length < 2) return;
  aiSupportTimer -= dt;
  if (aiSupportTimer > 0) return;
  // Slightly snappier on Clear Defenses so AI uses the same tools as the player.
  aiSupportTimer = options.clearance
    ? 18 + Math.random() * 14
    : 24 + Math.random() * 18;

  const game = options.game ?? support?.game ?? null;
  tryAiRadioBinoculars(game, players);

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

  // Single heavy bomb on a dense cluster — preferred over multi-shell barrage
  // when the pack is tight and the asset is ready.
  if (
    support.isReady('airBomb') &&
    target.count >= minCluster &&
    Math.random() < Math.min(0.48, 0.28 * aggression)
  ) {
    if (support.tryAiStrike('airBomb', target.x, target.z)) return;
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
    if (campaign) return distCp < 55 || distEnemy > getUnitWeaponRange(unit) * 1.05;
    return distCp < 42 || distEnemy > getUnitWeaponRange(unit) * 1.2;
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
      if (d > getUnitWeaponRange(unit) * 1.25) continue;
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
          unit.distanceTo(focus) < getUnitWeaponRange(unit) * 1.05 ||
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
  if (nearest && unit.distanceTo(nearest) < getUnitWeaponRange(unit) * 1.75) {
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
  if (nearest && unit.distanceTo(nearest) < getUnitWeaponRange(unit) * 1.6) {
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

  const coverAssignment = unit._clearanceDefenderCover;
  if (coverAssignment && isClearanceDefenderCoverTargetValid(coverAssignment, unit, game)) {
    issueClearanceDefenderCoverOrder(unit, coverAssignment);
    return;
  }
  if (coverAssignment?.kind === 'bunker' && unit._bunkerEntryId === coverAssignment.id) {
    unit._bunkerEntryId = null;
  }
  unit._clearanceDefenderCover = null;

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
  if (d <= getUnitWeaponRange(unit) * 1.15) return nearest;
  if (
    d < getUnitWeaponRange(unit) * 1.5 &&
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
