/**
 * Situation-aware planning for Frontline Command (Standard) AI.
 *
 * This module deliberately contains no Three.js or game mutation. It turns the
 * current force and battlefield state into a doctrine and a ranked production
 * list; AI.js remains responsible for issuing movement/attack orders.
 */

const STANDARD_AI_UNIT_TYPES = [
  'radioOperator',
  'infantry',
  'medic',
  'engineer',
  'machineGun',
  'sniper',
  'mortar',
  'antiTankGun',
  'armoredCar',
  'tank',
  'tankDestroyer',
  'superHeavyTank',
  'artillery',
];

const ARMOR_TYPES = new Set([
  'armoredCar',
  'tank',
  'tankDestroyer',
  'superHeavyTank',
]);

const HEAVY_ARMOR_TYPES = new Set(['tank', 'tankDestroyer', 'superHeavyTank']);

const ANTI_ARMOR_TYPES = new Set([
  'antiTankGun',
  'tank',
  'tankDestroyer',
  'superHeavyTank',
]);

const FORCE_WEIGHTS = {
  commander: 0.2,
  radioOperator: 0.7,
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

const BASE_PRODUCTION_PRIORITY = {
  radioOperator: 0.15,
  infantry: 1.55,
  medic: 0.1,
  engineer: 0.1,
  machineGun: 0.45,
  sniper: 0.05,
  mortar: 0.3,
  antiTankGun: 0.45,
  armoredCar: 0.25,
  tank: 0.45,
  tankDestroyer: 0.2,
  superHeavyTank: -0.1,
  artillery: 0.15,
};

/** Higher tiers react earlier, preserve fewer reserves, and make fewer random
 * substitutions when a counter-unit is called for. */
const DIFFICULTY_PROFILES = {
  easy: {
    id: 'easy',
    adaptation: 0.55,
    anticipation: 0.35,
    cohesion: 0.58,
    reserveRatio: 0.38,
    planMin: 15,
    planMax: 22,
    choiceJitter: 0.7,
  },
  medium: {
    id: 'medium',
    adaptation: 0.9,
    anticipation: 0.78,
    cohesion: 0.82,
    reserveRatio: 0.29,
    planMin: 10,
    planMax: 16,
    choiceJitter: 0.38,
  },
  hard: {
    id: 'hard',
    adaptation: 1.18,
    anticipation: 1.2,
    cohesion: 1.08,
    reserveRatio: 0.22,
    planMin: 7,
    planMax: 12,
    choiceJitter: 0.16,
  },
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isLiveUnit(unit) {
  return !!(
    unit &&
    !unit.dead &&
    !unit.surrendered &&
    !unit._captureExit &&
    !unit._dropping &&
    !unit._crewless
  );
}

function unitType(unit) {
  return unit?.def?.type ?? null;
}

function unitWeight(type) {
  return FORCE_WEIGHTS[type] ?? 1;
}

function isHeavyArmor(type) {
  return HEAVY_ARMOR_TYPES.has(type);
}

function getTierProfile(difficulty = {}) {
  return DIFFICULTY_PROFILES[difficulty.id] ?? DIFFICULTY_PROFILES.medium;
}

function getCluster(units, radius = 16) {
  let best = { count: 0, center: { x: 0, z: 0 } };
  for (const anchor of units) {
    let count = 0;
    let x = 0;
    let z = 0;
    for (const unit of units) {
      if (Math.hypot(unit.position.x - anchor.position.x, unit.position.z - anchor.position.z) > radius) {
        continue;
      }
      count++;
      x += unit.position.x;
      z += unit.position.z;
    }
    if (count > best.count) {
      best = {
        count,
        center: { x: x / count, z: z / count },
      };
    }
  }
  return best;
}

function getForceScoreNear(units, point, radius) {
  let score = 0;
  for (const unit of units) {
    if (Math.hypot(unit.position.x - point.x, unit.position.z - point.z) > radius) continue;
    const hpRatio = clamp(unit.hp / Math.max(1, unit.maxHp), 0, 1);
    score += unitWeight(unitType(unit)) * (0.35 + hpRatio * 0.65);
  }
  return score;
}

function summarizeSide(units = []) {
  const live = units.filter(isLiveUnit);
  const counts = Object.create(null);
  let score = 0;
  let weightedHp = 0;
  let weightTotal = 0;
  let x = 0;
  let z = 0;
  let armorPressure = 0;
  let heavyArmorPressure = 0;
  let antiArmorPressure = 0;
  let infantryPressure = 0;
  let supportPressure = 0;
  let wounded = 0;
  let damagedVehicles = 0;
  let underFire = 0;

  for (const unit of live) {
    const type = unitType(unit);
    counts[type] = (counts[type] ?? 0) + 1;
    const weight = unitWeight(type);
    const hpRatio = clamp(unit.hp / Math.max(1, unit.maxHp), 0, 1);
    score += weight * (0.35 + hpRatio * 0.65);
    weightedHp += hpRatio * weight;
    weightTotal += weight;
    x += unit.position.x * weight;
    z += unit.position.z * weight;

    if (ARMOR_TYPES.has(type)) {
      armorPressure +=
        type === 'superHeavyTank'
          ? 2.8
          : type === 'tankDestroyer'
            ? 2.35
            : type === 'tank'
              ? 2
              : 1.1;
    }
    if (isHeavyArmor(type)) heavyArmorPressure += type === 'superHeavyTank' ? 2.8 : 2.2;
    if (ANTI_ARMOR_TYPES.has(type)) {
      antiArmorPressure +=
        type === 'antiTankGun'
          ? 1.65
          : type === 'tankDestroyer'
            ? 2.3
            : type === 'superHeavyTank'
              ? 2.5
              : 1.55;
    }
    if (type === 'infantry' || type === 'machineGun' || type === 'engineer') {
      infantryPressure += type === 'machineGun' ? 1.2 : 1;
    }
    if (type === 'machineGun' || type === 'mortar' || type === 'artillery' || type === 'sniper') {
      supportPressure += type === 'artillery' ? 1.6 : type === 'mortar' ? 1.25 : 1;
    }
    if (hpRatio < 0.78) wounded++;
    if (ARMOR_TYPES.has(type) && (hpRatio < 0.86 || unit._mobilityDamaged)) damagedVehicles++;
    if ((unit._underFireTimer ?? 0) > 0) underFire++;
  }

  return {
    units: live,
    counts,
    count: live.length,
    score,
    hpRatio: weightTotal > 0 ? weightedHp / weightTotal : 0,
    center: weightTotal > 0 ? { x: x / weightTotal, z: z / weightTotal } : { x: 0, z: 0 },
    armorPressure,
    heavyArmorPressure,
    antiArmorPressure,
    infantryPressure,
    supportPressure,
    wounded,
    damagedVehicles,
    underFire,
    cluster: getCluster(live),
  };
}

function getClosestDistance(units, point) {
  return units.reduce(
    (best, unit) => Math.min(best, Math.hypot(unit.position.x - point.x, unit.position.z - point.z)),
    Infinity
  );
}

function chooseObjective(capturePoints, enemyCenter, enemyBase, playerUnits) {
  const candidates = (capturePoints ?? []).filter((point) => point.owner !== 'enemy');
  if (!candidates.length) return null;

  return [...candidates].sort((a, b) => {
    const score = (point) => {
      const distance = Math.hypot(point.x - enemyCenter.x, point.z - enemyCenter.z);
      const playerPresence = playerUnits.filter(
        (unit) => Math.hypot(unit.position.x - point.x, unit.position.z - point.z) <= 18
      ).length;
      const heldByPlayer = point.owner === 'player' ? -13 : 0;
      return distance * 0.42 - playerPresence * 8 + heldByPlayer;
    };
    return score(a) - score(b);
  })[0];
}

function chooseDefensiveObjective(capturePoints, enemyBase, playerUnits) {
  const held = (capturePoints ?? []).filter((point) => point.owner === 'enemy');
  if (!held.length) return null;

  return [...held].sort((a, b) => {
    const score = (point) => {
      const nearestPlayer = getClosestDistance(playerUnits, point);
      const distanceFromHq = Math.hypot(point.x - enemyBase.x, point.z - enemyBase.z);
      // Protect the held sector most exposed to the player's advance. Slightly
      // favor forward sectors when two positions are under similar pressure.
      return nearestPlayer - distanceFromHq * 0.12;
    };
    return score(a) - score(b);
  })[0];
}

function getBattleAxis(mapDef) {
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

function clampPoint(mapDef, point) {
  const half = Math.max(4, (mapDef?.size ?? 120) * 0.5 - 8);
  return {
    x: clamp(point.x, -half, half),
    z: clamp(point.z, -half, half),
  };
}

function pointToward(from, to, distance, mapDef) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz) || 1;
  return clampPoint(mapDef, {
    x: from.x + (dx / length) * distance,
    z: from.z + (dz / length) * distance,
  });
}

export function assessStandardBattle({
  enemyUnits = [],
  playerUnits = [],
  capturePoints = [],
  mapDef = null,
  enemyHq = null,
  playerHq = null,
  matchTime = 0,
} = {}) {
  const enemy = summarizeSide(enemyUnits);
  const player = summarizeSide(playerUnits);
  const enemyBase = enemyHq?.position ?? mapDef?.enemyBase ?? enemy.center;
  const playerBase = playerHq?.position ?? mapDef?.playerBase ?? player.center;
  const localEnemyScore = getForceScoreNear(enemy.units, enemyBase, 62);
  const localPlayerScore = getForceScoreNear(player.units, enemyBase, 56);
  const localPressure = localPlayerScore / Math.max(0.45, localEnemyScore);
  const objective = chooseObjective(capturePoints, enemy.center, enemyBase, player.units);
  const defensiveObjective = chooseDefensiveObjective(
    capturePoints,
    enemyBase,
    player.units
  );
  const enemyHeldCount = capturePoints.filter((point) => point.owner === 'enemy').length;
  const playerHeldCount = capturePoints.filter((point) => point.owner === 'player').length;
  const terrain = mapDef?.terrain ?? 'unknown';
  const armorMobility =
    terrain === 'urban'
      ? 0.42
      : terrain === 'jungle' || terrain === 'bocage'
        ? 0.62
        : terrain === 'hills'
          ? 0.78
          : 1;

  return {
    enemy,
    player,
    forceRatio: enemy.score / Math.max(0.35, player.score),
    localPressure,
    hqThreatDistance: getClosestDistance(player.units, enemyBase),
    enemyBase,
    playerBase,
    enemyHeldCount,
    playerHeldCount,
    neutralCount: capturePoints.filter((point) => !point.owner).length,
    needsCapture: !!objective,
    objective,
    defensiveObjective,
    terrain,
    armorMobility,
    axis: getBattleAxis(mapDef),
    mapDef,
    matchTime,
  };
}

export function getStandardAiDoctrine(assessment, difficulty = {}) {
  const tier = getTierProfile(difficulty);
  const {
    enemy,
    player,
    forceRatio,
    localPressure,
    hqThreatDistance,
    enemyBase,
    objective,
    defensiveObjective,
    playerHeldCount,
    armorMobility,
    axis,
    mapDef,
  } = assessment;

  const playerArmorAdvantage = player.armorPressure - enemy.antiArmorPressure * 0.62;
  const underSeverePressure =
    hqThreatDistance < 42 ||
    localPressure > 1.55 ||
    (enemy.underFire >= 3 && localPressure > 1.05);
  const needsRegroup =
    forceRatio < 0.62 ||
    (enemy.hpRatio < 0.46 && localPressure > 0.78) ||
    (enemy.hpRatio < 0.58 && forceRatio < 0.82 && enemy.underFire >= 2);

  let operation = 'advance';
  if (underSeverePressure) operation = 'defend';
  else if (needsRegroup) operation = 'regroup';
  else if (
    (forceRatio >= 1.05 && (player.hpRatio < 0.8 || player.cluster.count >= 4 || playerHeldCount > 0)) ||
    (tier.anticipation > 0.9 && forceRatio >= 0.9 && playerArmorAdvantage < -1.2)
  ) {
    operation = 'counterattack';
  } else if (playerArmorAdvantage > 2.4 && player.armorPressure >= 3) {
    operation = 'contain';
  }

  const ownBase = enemyBase;
  const rearAnchor = pointToward(enemy.center, ownBase, clamp(12 + (1 - forceRatio) * 12, 12, 24), mapDef);
  const hqNeedsImmediateDefense = hqThreatDistance < 42 || localPressure > 1.55;
  const defensivePoint =
    operation === 'contain' || !hqNeedsImmediateDefense
      ? defensiveObjective ?? ownBase
      : ownBase;
  const attackPoint =
    operation === 'counterattack'
      ? player.cluster.count > 0
        ? player.cluster.center
        : objective ?? player.center
      : objective ?? player.center;
  const anchor =
    operation === 'defend' || operation === 'contain'
      ? defensivePoint
      : operation === 'regroup'
        ? rearAnchor
        : attackPoint;

  return {
    operation,
    tier,
    anchor: clampPoint(mapDef, anchor),
    attackPoint: clampPoint(mapDef, attackPoint),
    rearAnchor,
    objective,
    axis,
    armorMobility,
    reserveRatio:
      operation === 'regroup'
        ? Math.max(0.46, tier.reserveRatio + 0.12)
        : operation === 'defend' || operation === 'contain'
          ? Math.max(0.34, tier.reserveRatio + 0.07)
          : tier.reserveRatio,
    forceRatio,
    localPressure,
    hqThreatDistance,
    playerArmorAdvantage,
    mapDef,
    assessment,
  };
}

function getProductionTargets(plan) {
  const { enemy, player } = plan.assessment;
  const operation = plan.operation;
  const closedTerrain = ['urban', 'bocage', 'jungle'].includes(plan.assessment.terrain);
  const trackedArmorCount =
    (enemy.counts.tank ?? 0) +
    (enemy.counts.tankDestroyer ?? 0) +
    (enemy.counts.superHeavyTank ?? 0);
  const needsFirstTrackedArmor = trackedArmorCount === 0;
  // Standard starts with only a rifle squad and a radio operator. Keep that
  // opening credible, but make the first tracked vehicle a deliberate
  // combined-arms milestone rather than letting cheap infantry consume every
  // early production roll.
  const earlyInfantryTarget = needsFirstTrackedArmor
    ? 1 + (player.infantryPressure >= 3 ? 1 : 0)
    : 3;
  const targets = {
    radioOperator: Math.min(3, player.cluster.count >= 3 || player.supportPressure >= 2 ? 2 : 1),
    infantry: clamp(
      earlyInfantryTarget +
        Math.ceil(player.infantryPressure * 0.18) +
        (operation === 'advance' || operation === 'counterattack' ? 0 : 1),
      2,
      8
    ),
    medic: enemy.wounded >= 2 || enemy.hpRatio < 0.72 ? 1 : 0,
    engineer:
      enemy.damagedVehicles > 0 ||
      operation === 'defend' ||
      operation === 'contain' ||
      plan.assessment.needsCapture
        ? 1
        : 0,
    machineGun: clamp(
      Math.ceil((player.infantryPressure + (operation === 'defend' ? 2 : 0)) / 5),
      1,
      3
    ),
    sniper: player.supportPressure >= 2 || player.count >= 9 ? 1 : 0,
    mortar:
      player.cluster.count >= 3 ||
      player.infantryPressure >= 4 ||
      closedTerrain ||
      operation === 'defend'
        ? 1
        : 0,
    antiTankGun:
      player.armorPressure > 0
        ? clamp(Math.ceil(player.armorPressure / 3), 1, 3)
        : operation === 'contain'
          ? 1
          : 0,
    armoredCar:
      plan.assessment.needsCapture && (plan.armorMobility >= 0.6 || plan.tier.id !== 'easy') ? 1 : 0,
    tank:
      needsFirstTrackedArmor && plan.armorMobility >= 0.5
        ? 1
        : operation === 'advance' || operation === 'counterattack'
          ? 1
          : player.supportPressure >= 2 && plan.armorMobility >= 0.6
            ? 1
            : 0,
    tankDestroyer:
      player.heavyArmorPressure > 0 ||
      (player.armorPressure >= 3 && plan.tier.anticipation > 0.7)
        ? 1
        : 0,
    superHeavyTank:
      plan.tier.id === 'hard' && plan.assessment.matchTime >= 180 && plan.forceRatio >= 0.92 ? 1 : 0,
    artillery:
      player.cluster.count >= 4 ||
      player.supportPressure >= 2.5 ||
      operation === 'counterattack'
        ? 1
        : 0,
  };
  return targets;
}

function addScore(scores, type, amount, adaptation) {
  if (scores[type] === undefined) return;
  scores[type] += amount * adaptation;
}

export function getStandardProductionCandidates({
  plan,
  factionUnits = {},
  queuedCounts = {},
} = {}) {
  if (!plan?.assessment) return [];
  const { enemy, player } = plan.assessment;
  const targets = getProductionTargets(plan);
  const trackedArmorCount =
    (enemy.counts.tank ?? 0) +
    (enemy.counts.tankDestroyer ?? 0) +
    (enemy.counts.superHeavyTank ?? 0);
  const needsFirstTrackedArmor = trackedArmorCount === 0;
  const closedTerrain = ['urban', 'bocage', 'jungle'].includes(plan.assessment.terrain);
  const trackedArmorUrgency = needsFirstTrackedArmor
    ? clamp(
        Math.max(0, plan.assessment.matchTime - 32) /
          (plan.tier.id === 'hard' ? 18 : plan.tier.id === 'medium' ? 28 : 42),
        0,
        1
      )
    : 0;
  const adaptation = plan.tier.adaptation;
  const scores = Object.fromEntries(
    STANDARD_AI_UNIT_TYPES.map((type) => [type, BASE_PRODUCTION_PRIORITY[type] ?? 0])
  );

  for (const type of STANDARD_AI_UNIT_TYPES) {
    if (!factionUnits[type]) {
      scores[type] = -Infinity;
      continue;
    }
    const deficit = (targets[type] ?? 0) - (enemy.counts[type] ?? 0) - (queuedCounts[type] ?? 0);
    scores[type] += deficit * (2.75 + plan.tier.cohesion * 0.45);
    if (deficit <= 0) scores[type] -= 1.1;
  }

  if (player.armorPressure > 0) {
    addScore(scores, 'antiTankGun', 2.1 + player.armorPressure * 0.55, adaptation);
    addScore(scores, 'tankDestroyer', 1.7 + player.heavyArmorPressure * 0.55, adaptation);
    addScore(scores, 'tank', 0.42, adaptation);
  }
  if (player.heavyArmorPressure > 0) {
    addScore(scores, 'antiTankGun', 1.5, plan.tier.anticipation);
    addScore(scores, 'tankDestroyer', 2.1, plan.tier.anticipation);
  }
  if (player.infantryPressure >= 3) {
    addScore(scores, 'machineGun', 1.65, adaptation);
    addScore(scores, 'mortar', 1.25, adaptation);
    addScore(scores, 'artillery', player.cluster.count >= 4 ? 1.2 : 0.45, adaptation);
  }
  if (player.supportPressure >= 2) {
    addScore(scores, 'sniper', 0.65, adaptation);
    addScore(scores, 'tank', 0.65, adaptation);
    addScore(scores, 'artillery', 0.85, adaptation);
  }
  if (needsFirstTrackedArmor && plan.armorMobility >= 0.5) {
    addScore(
      scores,
      'tank',
      1.7 + trackedArmorUrgency * 2.4,
      plan.tier.anticipation
    );
    // A wheeled scout is a useful fallback on a tight map, but it should not
    // displace the first proper tank on open or mixed terrain.
    if (closedTerrain) {
      addScore(
        scores,
        'armoredCar',
        plan.armorMobility < 0.6 ? 0.9 + trackedArmorUrgency : 0.12,
        plan.tier.adaptation
      );
    }
  }
  if (plan.assessment.needsCapture) {
    addScore(scores, 'infantry', 1.1, adaptation);
    addScore(scores, 'armoredCar', 1.25, adaptation);
  }
  if (plan.operation === 'counterattack') {
    addScore(scores, 'tank', 2.1, plan.tier.cohesion);
    addScore(scores, 'tankDestroyer', 0.9, plan.tier.cohesion);
    addScore(scores, 'infantry', 0.9, plan.tier.cohesion);
  } else if (plan.operation === 'defend' || plan.operation === 'contain') {
    addScore(scores, 'antiTankGun', 1.35, adaptation);
    addScore(scores, 'machineGun', 1.1, adaptation);
    addScore(scores, 'mortar', 0.95, adaptation);
  } else if (plan.operation === 'regroup') {
    addScore(scores, 'infantry', 0.85, adaptation);
    addScore(scores, 'medic', 1.25, adaptation);
    addScore(scores, 'engineer', 0.8, adaptation);
  } else {
    addScore(scores, 'tank', 0.9, plan.armorMobility);
    addScore(scores, 'armoredCar', 0.45, plan.armorMobility);
  }

  if (plan.armorMobility < 0.6) {
    addScore(scores, 'infantry', 0.65, adaptation);
    addScore(scores, 'machineGun', 0.6, adaptation);
    addScore(scores, 'mortar', 0.8, adaptation);
    addScore(scores, 'tank', -0.65, adaptation);
    addScore(scores, 'armoredCar', -0.5, adaptation);
  } else if (plan.armorMobility >= 0.9) {
    addScore(scores, 'tank', 0.7, adaptation);
    addScore(scores, 'tankDestroyer', 0.45, adaptation);
  }

  if (enemy.wounded >= 2 || enemy.hpRatio < 0.72) addScore(scores, 'medic', 2.4, adaptation);
  if (enemy.damagedVehicles > 0) addScore(scores, 'engineer', 2.8, adaptation);
  if ((enemy.counts.radioOperator ?? 0) < (targets.radioOperator ?? 0)) {
    addScore(scores, 'radioOperator', 2.2, plan.tier.cohesion);
  }
  if (plan.assessment.neutralCount > 0 && (enemy.counts.armoredCar ?? 0) === 0) {
    addScore(scores, 'armoredCar', 0.8, plan.tier.anticipation);
  }

  return Object.entries(scores)
    .filter(([type, score]) => Number.isFinite(score) && factionUnits[type])
    .map(([type, score]) => ({
      type,
      score,
      target: targets[type] ?? 0,
      current: enemy.counts[type] ?? 0,
      queued: queuedCounts[type] ?? 0,
      cost: factionUnits[type].cost ?? Infinity,
    }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Return the next unit type, or null when the commander should save supplies
 * for a near-term counter-unit. `canEnqueue` includes mode/base unlock rules.
 */
export function chooseStandardProductionUnit({
  candidates = [],
  resources = 0,
  incomePerSecond = 0,
  canEnqueue = () => false,
  random = Math.random,
  choiceJitter = 0.35,
} = {}) {
  if (!candidates.length) return null;
  const affordable = candidates.filter((candidate) =>
    canEnqueue(candidate.type, resources)
  );
  const priority = candidates[0];
  const isCounterUnit = new Set([
    'antiTankGun',
    'tankDestroyer',
    'tank',
    'superHeavyTank',
  ]).has(priority.type);
  const shortage = priority.cost - resources;
  const reserveWindow = Math.max(0, incomePerSecond) * (priority.type === 'superHeavyTank' ? 10 : 7);
  if (
    isCounterUnit &&
    priority.score >= 4.4 &&
    shortage > 0 &&
    shortage <= reserveWindow
  ) {
    return null;
  }
  if (!affordable.length) return null;

  const topScore = affordable[0].score;
  const jitter = clamp(choiceJitter, 0, 1);
  const nearTies = affordable.filter(
    (candidate) => candidate.score >= topScore - (0.22 + jitter * 0.75)
  );
  const poolSize = jitter >= 0.55 ? 3 : jitter >= 0.25 ? 2 : 1;
  const choicePool = nearTies.slice(0, poolSize);
  const choice = choicePool[Math.floor(random() * choicePool.length)];
  return choice?.type ?? affordable[0].type;
}

export { STANDARD_AI_UNIT_TYPES };
