import { Unit } from '../units/Unit.js';
import { sampleTerrainHeight } from '../world/Terrain.js';
import {
  getUrbanRoadExtent,
  getUrbanStreetSpacing,
  nearestUrbanRoadCenter,
} from '../world/UrbanLayout.js';
import { resolveUnitSpawnPosition } from './Spawner.js';
import { canAddRadioOperator } from './RadioOperatorBehavior.js';

/** Defender layout scaled by difficulty.enemyArmyMult in spawn. */
export const CLEARANCE_DEFENDER_LAYOUT = [
  { type: 'radioOperator', count: 1 },
  { type: 'infantry', count: 4 },
  { type: 'machineGun', count: 2 },
  { type: 'sniper', count: 1 },
  { type: 'mortar', count: 1 },
  { type: 'armoredCar', count: 1 },
  { type: 'antiTankGun', count: 2 },
  { type: 'tank', count: 2 },
  { type: 'artillery', count: 1 },
];

export const CLEARANCE_STARTING_RESOURCES = 160;

/** Clear Defenses begins live; safe deployment spacing replaces an opening ceasefire. */
export const CLEARANCE_CEASEFIRE_TIME = 0;

/** Give a player commanding the garrison a short planning window before contact. */
export const CLEARANCE_DEFENDER_PREP_TIME = 15;

/** Attackers must clear the fortified line within fifteen live-combat minutes. */
export const CLEARANCE_TIME_LIMIT = 15 * 60;

export const CLEARANCE_REINFORCEMENT_INTERVAL = 180;

/** Packages by size — rotate each wave. Small matches the original two-unit groups. */
const REINFORCEMENT_PACKAGES = {
  small: {
    player: [
      ['infantry', 'machineGun'],
      ['infantry', 'mortar'],
      ['infantry', 'tank'],
      ['infantry', 'antiTankGun'],
    ],
    defender: [
      ['infantry', 'machineGun'],
      ['infantry', 'antiTankGun'],
      ['infantry', 'armoredCar'],
      ['infantry', 'mortar'],
    ],
  },
  medium: {
    player: [
      ['infantry', 'machineGun', 'mortar'],
      ['infantry', 'infantry', 'antiTankGun'],
      ['infantry', 'tank', 'machineGun'],
      ['infantry', 'engineer', 'antiTankGun'],
      ['infantry', 'mortar', 'machineGun'],
    ],
    defender: [
      ['infantry', 'machineGun', 'antiTankGun'],
      ['infantry', 'armoredCar', 'mortar'],
      ['infantry', 'infantry', 'machineGun'],
      ['infantry', 'antiTankGun', 'mortar'],
      ['infantry', 'armoredCar', 'machineGun'],
    ],
  },
  large: {
    player: [
      ['infantry', 'infantry', 'machineGun', 'mortar', 'antiTankGun'],
      ['infantry', 'machineGun', 'tank', 'infantry', 'mortar'],
      ['infantry', 'infantry', 'antiTankGun', 'tank', 'engineer'],
      ['infantry', 'machineGun', 'armoredCar', 'mortar', 'infantry'],
      ['infantry', 'medic', 'machineGun', 'antiTankGun', 'tank'],
    ],
    defender: [
      ['infantry', 'infantry', 'machineGun', 'antiTankGun', 'mortar'],
      ['infantry', 'armoredCar', 'machineGun', 'infantry', 'antiTankGun'],
      ['infantry', 'infantry', 'mortar', 'tank', 'machineGun'],
      ['infantry', 'antiTankGun', 'armoredCar', 'infantry', 'mortar'],
      ['infantry', 'machineGun', 'antiTankGun', 'infantry', 'armoredCar'],
    ],
  },
};

function resolvePackageSize(sizeId) {
  if (REINFORCEMENT_PACKAGES[sizeId]) return sizeId;
  return 'small';
}

function getReinforcementPackages(sizeId) {
  return REINFORCEMENT_PACKAGES[resolvePackageSize(sizeId)];
}

const CLEARANCE_PROBE_TYPES = new Set([
  'infantry',
  'engineer',
  'machineGun',
  'sniper',
  'armoredCar',
  'tank',
  'tankDestroyer',
  'superHeavyTank',
]);

const ANTI_ARMOR = new Set(['tank', 'tankDestroyer', 'superHeavyTank', 'artillery', 'antiTankGun', 'paratrooper']);

/** Service rifles, SMGs, and MGs — including support teams that share those weapons. */
const SMALL_ARMS_VS_ARMOR = new Set([
  'infantry',
  'vehicleCrew',
  'machineGun',
  'radioOperator',
  'engineer',
  'commander',
  'medic',
]);

/** Tanks ignore rifle/MG fire; dedicated anti-armor weapons hurt. */
export function getArmorDamageMultiplier(attackerType, target) {
  if (!target?.def) return 1;
  const t = target.def.type;

  if (t === 'tank' || t === 'tankDestroyer' || t === 'superHeavyTank') {
    const isSuper = t === 'superHeavyTank';
    if (SMALL_ARMS_VS_ARMOR.has(attackerType) || attackerType === 'armoredCar') {
      return 0;
    }
    if (attackerType === 'sniper') return 0;
    // Mortars are high-angle HE — poor vs top armour and largely wasteful vs
    // dedicated AFVs. Super-heavies shrug them off hardest.
    if (attackerType === 'mortar') {
      if (isSuper) return 0.28;
      if (t === 'tankDestroyer') return 0.36;
      return 0.4;
    }
    if (attackerType === 'antiTankGun') return isSuper ? 1.08 : 1.12;
    if (ANTI_ARMOR.has(attackerType)) return isSuper ? 1.25 : 1.4;
    return 1;
  }

  if (t === 'armoredCar') {
    if (SMALL_ARMS_VS_ARMOR.has(attackerType)) return 0.32;
    if (attackerType === 'sniper') return 0;
    if (attackerType === 'mortar') return 1.05;
    if (attackerType === 'tank' || attackerType === 'tankDestroyer' || attackerType === 'superHeavyTank' || attackerType === 'artillery') {
      return attackerType === 'superHeavyTank' ? 1.35 : 1.25;
    }
    return 1;
  }

  return 1;
}

function axisFromPlayerToEnemy(mapDef) {
  const pb = mapDef.playerBase;
  const eb = mapDef.enemyBase ?? { x: -pb.x, z: -pb.z };
  const ax = eb.x - pb.x;
  const az = eb.z - pb.z;
  const len = Math.hypot(ax, az) || 1;
  return { ax: ax / len, az: az / len, pb, eb };
}

const BERLIN_AT_MIN_LANE = 28;
const BERLIN_AT_SEPARATION = 11;

/**
 * Place a Berlin AT gun just off an intersection with an unobstructed shot
 * along a street. The selected direction points broadly toward the player's
 * approach, making the gun an ambush threat instead of a carriage aimed into a
 * tenement wall.
 */
function findBerlinAtAmbushPosition({
  anchor,
  def,
  mapDef,
  scenery,
  attackerUnits,
  reservedPositions,
}) {
  if (
    mapDef?.terrain !== 'urban' ||
    !scenery?.getLineOfFireBlocker ||
    !scenery?.isVehiclePlacementBlocked
  ) {
    return null;
  }

  const spacing = getUrbanStreetSpacing(mapDef);
  const extent = getUrbanRoadExtent(mapDef);
  const half = Math.max(8, (mapDef.size ?? 120) * 0.5 - 3);
  const baseRoadX = nearestUrbanRoadCenter(anchor.x, mapDef);
  const baseRoadZ = nearestUrbanRoadCenter(anchor.z, mapDef);
  const { ax, az } = axisFromPlayerToEnemy(mapDef);
  const towardPlayerX = -ax;
  const towardPlayerZ = -az;
  const desiredLane = Math.min(Math.max(BERLIN_AT_MIN_LANE, (def.range ?? 60) * 0.78), 52);
  const safeRange = (def.range ?? 0) + 5;
  const cornerOffset = spacing * 0.3;
  const candidates = [];

  const consider = (x, z, directionX, directionZ) => {
    if (
      Math.abs(x) > half ||
      Math.abs(z) > half ||
      Math.abs(x) > extent + 0.5 ||
      Math.abs(z) > extent + 0.5 ||
      !isEnemyHalfPosition(x, z, mapDef) ||
      scenery.isVehiclePlacementBlocked(x, z, 1.65)
    ) {
      return;
    }
    for (const other of reservedPositions) {
      if (Math.hypot(x - other.x, z - other.z) < BERLIN_AT_SEPARATION) return;
    }
    for (const attacker of attackerUnits) {
      if (
        !attacker.dead &&
        safeRange > 5 &&
        Math.hypot(x - attacker.position.x, z - attacker.position.z) < safeRange
      ) {
        return;
      }
    }

    const maxToEdge =
      directionX > 0
        ? half - x
        : directionX < 0
          ? x + half
          : directionZ > 0
            ? half - z
            : z + half;
    const laneLength = Math.min(desiredLane, maxToEdge - 1);
    if (laneLength < BERLIN_AT_MIN_LANE) return;

    const gunProbe = {
      def: { type: 'antiTankGun' },
      position: { x, z },
    };
    const approachProbe = {
      position: {
        x: x + directionX * laneLength,
        z: z + directionZ * laneLength,
      },
    };
    if (scenery.getLineOfFireBlocker(gunProbe, approachProbe)) return;

    const approachAlignment =
      directionX * towardPlayerX + directionZ * towardPlayerZ;
    if (approachAlignment < -0.05) return;
    const anchorDistance = Math.hypot(x - anchor.x, z - anchor.z);
    const score =
      laneLength +
      approachAlignment * 24 -
      anchorDistance * 0.72 +
      Math.random() * 1.5;
    candidates.push({
      x,
      z,
      directionX,
      directionZ,
      yaw: Math.atan2(directionX, directionZ),
      laneLength,
      score,
    });
  };

  const considerIntersection = (roadX, roadZ) => {
    for (const offset of [-cornerOffset, cornerOffset]) {
      consider(roadX, roadZ + offset, 0, -1);
      consider(roadX, roadZ + offset, 0, 1);
      consider(roadX + offset, roadZ, -1, 0);
      consider(roadX + offset, roadZ, 1, 0);
    }
  };

  // Search nearby intersections first. Guns sit a little beyond the corner
  // rather than dead-centre in the crossroads, and can cover either direction.
  for (let gx = -2; gx <= 2; gx++) {
    const roadX = baseRoadX + gx * spacing;
    if (Math.abs(roadX) > extent + 0.5) continue;
    for (let gz = -2; gz <= 2; gz++) {
      const roadZ = baseRoadZ + gz * spacing;
      if (Math.abs(roadZ) > extent + 0.5) continue;
      considerIntersection(roadX, roadZ);
    }
  }

  // Dense rubble or a front-edge anchor can invalidate every nearby site.
  // Only then scan the full street lattice so an AT gun is never left facing
  // the nearest building merely because its original random anchor was poor.
  if (!candidates.length) {
    for (let roadX = -extent; roadX <= extent + 0.5; roadX += spacing) {
      for (let roadZ = -extent; roadZ <= extent + 0.5; roadZ += spacing) {
        considerIntersection(roadX, roadZ);
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  for (const candidate of candidates) {
    const gunProbe = {
      def: { type: 'antiTankGun' },
      position: candidate,
    };
    const approachProbe = {
      position: {
        x: candidate.x + candidate.directionX * candidate.laneLength,
        z: candidate.z + candidate.directionZ * candidate.laneLength,
      },
    };
    if (!scenery.getLineOfFireBlocker(gunProbe, approachProbe, { fullScan: true })) {
      return candidate;
    }
  }
  return null;
}

/** True if (x,z) lies on the enemy side of the map midpoint. */
export function isEnemyHalfPosition(x, z, mapDef) {
  const { ax, az, pb, eb } = axisFromPlayerToEnemy(mapDef);
  const midX = (pb.x + eb.x) * 0.5;
  const midZ = (pb.z + eb.z) * 0.5;
  return (x - midX) * ax + (z - midZ) * az > 0.5;
}

/**
 * Rally / staging anchor for the player's force — no HQ in Clear Defenses.
 * Attackers stage at the rear assembly; defenders fall back toward the belt.
 */
export function getClearanceStagingAnchor(mapDef, role = 'attack') {
  if (role === 'defend') {
    const fl = mapDef?.frontline ?? { x: 0, z: 0 };
    const { ax, az } = axisFromPlayerToEnemy(mapDef);
    // Slightly toward the defensive half so Full Retreat does not dump into the assault assembly.
    return {
      team: 'player',
      dead: false,
      position: { x: fl.x + ax * 8, z: fl.z + az * 8 },
    };
  }
  const base = getClearanceAttackerSpawnBase(mapDef);
  return {
    team: 'player',
    dead: false,
    position: { x: base.x, z: base.z },
  };
}

/** Assault force assembly — well behind the line, away from contact. */
export function getClearanceAttackerSpawnBase(mapDef) {
  const { ax, az, pb } = axisFromPlayerToEnemy(mapDef);
  const half = (mapDef.size ?? 120) * 0.5 - 6;
  const pullBack = 24;
  let x = pb.x - ax * pullBack;
  let z = pb.z - az * pullBack;
  x = Math.max(-half, Math.min(half, x));
  z = Math.max(-half, Math.min(half, z));
  return { x, z };
}

/** @deprecated use getClearanceAttackerSpawnBase */
export function getClearancePlayerSpawnBase(mapDef) {
  return getClearanceAttackerSpawnBase(mapDef);
}

/** Battle plans used when the AI commands the Clear Defenses assault force. */
export const CLEARANCE_ATTACK_PLANS = {
  infantryAssault: {
    id: 'infantryAssault',
    label: 'Infantry assault',
    infantryAdvance: 0.5,
    armorFollow: 0.7,
    supportHold: 0.55,
    flankBias: 0,
  },
  armoredThrust: {
    id: 'armoredThrust',
    label: 'Armored thrust',
    infantryAdvance: 0.48,
    armorFollow: 0.82,
    supportHold: 0.4,
    flankBias: 0,
  },
  flankingHook: {
    id: 'flankingHook',
    label: 'Flanking hook',
    infantryAdvance: 0.58,
    armorFollow: 0.62,
    supportHold: 0.45,
    flankBias: 1,
  },
  firePreparation: {
    id: 'firePreparation',
    label: 'Fire preparation',
    infantryAdvance: 0.38,
    armorFollow: 0.42,
    supportHold: 0.78,
    flankBias: 0,
  },
  combinedArms: {
    id: 'combinedArms',
    label: 'Combined arms',
    infantryAdvance: 0.55,
    armorFollow: 0.55,
    supportHold: 0.5,
    flankBias: 0.35,
  },
};

export function pickClearanceAttackPlan(rng = Math.random) {
  const ids = Object.keys(CLEARANCE_ATTACK_PLANS);
  return CLEARANCE_ATTACK_PLANS[ids[Math.floor(rng() * ids.length)]];
}

export function isClearancePlayerAttacker(game) {
  return (game?.clearanceRole ?? 'attack') !== 'defend';
}

/**
 * @param {boolean} enabled
 * @param {string} [sizeId='small'] small | medium | large
 */
export function createClearanceReinforcementState(enabled = false, sizeId = 'small') {
  if (!enabled) return null;
  const size = resolvePackageSize(sizeId);
  return {
    enabled: true,
    size,
    interval: CLEARANCE_REINFORCEMENT_INTERVAL,
    nextAt: CLEARANCE_REINFORCEMENT_INTERVAL,
    wave: 0,
    nextProbeAt: 52,
    probe: 0,
  };
}

function teamIsClearanceAttacker(game, team) {
  const playerAttacks = isClearancePlayerAttacker(game);
  return team === 'player' ? playerAttacks : !playerAttacks;
}

function spawnReinforcementPackage(game, team, types, wave) {
  const faction = team === 'player' ? game.playerFaction : game.enemyFaction;
  const spawnTypes = [...types];
  // Radio operators are ordinary reinforcement rolls: they can add a second
  // support net or replace a lost operator without making every package a
  // guaranteed signals detachment.
  if (
    faction.units.radioOperator &&
    Math.random() < 0.22 &&
    canAddRadioOperator(game.units, team)
  ) {
    spawnTypes.push('radioOperator');
  }
  const isAttacker = teamIsClearanceAttacker(game, team);
  const { ax, az } = axisFromPlayerToEnemy(game.mapDef);
  // Attackers assemble on the map player-base rear; defenders on the enemy base.
  const base = isAttacker
    ? getClearanceAttackerSpawnBase(game.mapDef)
    : game.mapDef.enemyBase;
  const facingX = isAttacker ? ax : -ax;
  const facingZ = isAttacker ? az : -az;
  const sideX = -az;
  const sideZ = ax;
  const spawned = [];

  for (let i = 0; i < spawnTypes.length; i++) {
    const def = faction.units[spawnTypes[i]];
    if (!def) continue;
    const lateral = (i - (spawnTypes.length - 1) / 2) * 4.6;
    const depth = 3 + i * 1.8;
    const requestedPosition = {
      x: base.x + sideX * lateral - facingX * depth,
      z: base.z + sideZ * lateral - facingZ * depth,
    };
    const position = resolveUnitSpawnPosition(
      def,
      requestedPosition.x,
      requestedPosition.z,
      game.scenery,
      game.mapDef,
      {
        team: game.mapDef?.terrain === 'urban' ? null : team,
        forceAssemblyRear: true,
      }
    );
    if (!position) continue;
    const unit = new Unit({ def, faction, team, position, scene: game.scene });
    unit._mapDef = game.mapDef;
    unit.position.y = sampleTerrainHeight(position.x, position.z, game.mapDef);
    unit.mesh.rotation.y = Math.atan2(facingX, facingZ);
    if (!isAttacker) {
      unit.defensiveHold = {
        x: position.x + facingX * (6 + (wave % 2) * 3),
        z: position.z + facingZ * (6 + (wave % 2) * 3),
        radius: 15,
      };
      if (team === 'enemy') unit._clearanceDefenderCoverPending = true;
    } else if (team === 'enemy') {
      // AI assault reinforcements inherit the current battle plan.
      unit.clearanceAttackRole = roleForClearanceAttackerType(spawnTypes[i]);
    }
    spawned.push(unit);
  }
  return spawned;
}

export function roleForClearanceAttackerType(type) {
  if (type === 'radioOperator') return 'support';
  if (type === 'tank' || type === 'tankDestroyer' || type === 'superHeavyTank' || type === 'armoredCar') {
    return 'armor';
  }
  if (type === 'artillery' || type === 'mortar' || type === 'antiTankGun') return 'support';
  if (type === 'sniper' || type === 'machineGun') return 'support';
  return 'line';
}

/** Add one reinforcement group to each side when the three-minute clock expires. */
export function updateClearanceReinforcements(game) {
  const state = game?.clearanceReinforcements;
  if (!state?.enabled || game.gameOver || game.matchTime < state.nextAt) return null;

  const packages = getReinforcementPackages(state.size ?? 'small');
  const playerAttacks = isClearancePlayerAttacker(game);
  const allSpawned = [];
  let cycles = 0;
  while (game.matchTime >= state.nextAt && cycles < 3) {
    state.wave += 1;
    const packageIndex = (state.wave - 1) % packages.player.length;
    // Attacker roster packages for the assaulting side; defender packages for the garrison.
    const playerPkg = playerAttacks
      ? packages.player[packageIndex]
      : packages.defender[packageIndex % packages.defender.length];
    const enemyPkg = playerAttacks
      ? packages.defender[packageIndex % packages.defender.length]
      : packages.player[packageIndex];
    allSpawned.push(
      ...spawnReinforcementPackage(game, 'player', playerPkg, state.wave),
      ...spawnReinforcementPackage(game, 'enemy', enemyPkg, state.wave)
    );
    state.nextAt += state.interval;
    cycles += 1;
  }
  if (!allSpawned.length) return null;
  game.units.push(...allSpawned);
  return { wave: state.wave, units: allSpawned, size: state.size };
}

/**
 * Periodically release a small mobile detachment from the defending AI to test
 * and pursue the assault. Only runs when the enemy is the garrison.
 */
export function updateClearanceCounterattacks(game) {
  const state = game?.clearanceReinforcements;
  if (!state?.enabled || game.gameOver || game.matchTime < (state.nextProbeAt ?? 52)) {
    return null;
  }
  // Probes belong to the defending side. When the player holds the line, skip.
  if (!isClearancePlayerAttacker(game)) {
    state.nextProbeAt = game.matchTime + 40;
    return null;
  }
  const operational = game.clearanceOperational;
  if (
    operational?.focus === 'defend' &&
    (
      operational.mode !== 'hold' ||
      (operational.forceRatio ?? 1) < 0.88
    )
  ) {
    // Do not strip a pressured or falling-back garrison for a scheduled probe.
    // The recurring defensive plan will release a detachment when conditions
    // favor a limited counterattack.
    state.nextProbeAt = game.matchTime + 24;
    return null;
  }

  const attackers = game._playerAlive ?? [];
  const candidates = (game._enemyAlive ?? []).filter(
    (unit) =>
      !unit.dead &&
      !unit.retreating &&
      !unit.surrendered &&
      !unit._clearanceProbe &&
      !unit._trenchId &&
      !unit._garrisonBunkerId &&
      !unit._sandbagSite &&
      !unit._trenchDigSite &&
      CLEARANCE_PROBE_TYPES.has(unit.def?.type)
  );
  if (!attackers.length || candidates.length < 2) {
    state.nextProbeAt = game.matchTime + 28;
    return null;
  }

  const target = attackers.reduce(
    (sum, unit) => ({ x: sum.x + unit.position.x, z: sum.z + unit.position.z }),
    { x: 0, z: 0 }
  );
  target.x /= attackers.length;
  target.z /= attackers.length;
  candidates.sort((a, b) => {
    const ad = Math.hypot(a.position.x - target.x, a.position.z - target.z);
    const bd = Math.hypot(b.position.x - target.x, b.position.z - target.z);
    return ad - bd;
  });

  const aggression = game.difficulty?.attackAggressionMult ?? 1;
  const packageSize = state.size ?? 'small';
  const probeCap = packageSize === 'large' ? 6 : packageSize === 'medium' ? 5 : 4;
  const probeFloor = packageSize === 'large' ? 3 : 2;
  const size = Math.min(
    probeCap,
    candidates.length,
    Math.max(
      probeFloor,
      Math.round(probeFloor + (aggression - 1) * 2 + candidates.length * 0.08)
    )
  );
  const duration = 34 + Math.random() * 14;
  const probing = candidates.slice(0, size);
  state.probe = (state.probe ?? 0) + 1;
  for (const unit of probing) {
    unit._clearanceProbe = {
      number: state.probe,
      until: game.matchTime + duration,
      targetX: target.x,
      targetZ: target.z,
    };
    unit.clearAttackOrder?.();
    unit.moveTarget = { x: target.x, z: target.z };
    unit._userMoveOrder = false;
  }

  const interval = (52 + Math.random() * 24) / Math.max(0.82, aggression);
  state.nextProbeAt = game.matchTime + interval;
  return { number: state.probe, units: probing };
}

/** Ring positions around a point — defensive dug-in layout. */
function ringAround(x, z, count, radius, startAngle = 0) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = startAngle + (i / count) * Math.PI * 2;
    out.push({
      x: x + Math.cos(a) * radius,
      z: z + Math.sin(a) * radius,
    });
  }
  return out;
}

function pushPosition(positions, p, mapDef) {
  if (!isEnemyHalfPosition(p.x, p.z, mapDef)) return;
  positions.push(p);
}

/** Build spawn points on the enemy side of the map (trenches, CPs, frontline). */
export function buildDefensivePositions(mapDef, capturePoints) {
  const positions = [];
  const fl = mapDef.frontline ?? { x: 0, z: 0 };
  const size = mapDef.size ?? 120;
  const { ax, az } = axisFromPlayerToEnemy(mapDef);

  for (const cp of capturePoints) {
    if (!cp.frontline && !isEnemyHalfPosition(cp.x, cp.z, mapDef)) continue;

    const ringR = cp.frontline ? 10 : 8;
    const count = cp.frontline ? 5 : 3;
    const ring = ringAround(cp.x, cp.z, count, ringR, Math.random() * Math.PI);
    for (const p of ring) {
      pushPosition(positions, { ...p, holdX: p.x, holdZ: p.z, holdRadius: ringR + 6 }, mapDef);
    }
  }

  for (const p of ringAround(fl.x + ax * 6, fl.z + az * 6, 4, 12, 0.2)) {
    pushPosition(positions, { ...p, holdX: p.x, holdZ: p.z, holdRadius: 14 }, mapDef);
  }
  for (const p of ringAround(fl.x - ax * 4, fl.z + az * 8, 3, 9, 1)) {
    pushPosition(positions, { ...p, holdX: p.x, holdZ: p.z, holdRadius: 12 }, mapDef);
  }
  for (const p of ringAround(fl.x, fl.z - az * 10, 3, 9, 2)) {
    pushPosition(positions, { ...p, holdX: p.x, holdZ: p.z, holdRadius: 12 }, mapDef);
  }

  const eb = mapDef.enemyBase ?? { x: size * 0.35, z: 0 };
  for (const p of ringAround(eb.x, eb.z, 3, 12, 0.5)) {
    pushPosition(positions, { ...p, holdX: p.x, holdZ: p.z, holdRadius: 14 }, mapDef);
  }

  for (let i = 0; i < 8; i++) {
    const t = 0.32 + Math.random() * 0.38;
    const x = mapDef.playerBase.x + ax * size * t;
    const z = mapDef.playerBase.z + az * size * t + (Math.random() - 0.5) * size * 0.4;
    pushPosition(positions, { x, z, holdX: x, holdZ: z, holdRadius: 13 }, mapDef);
  }

  return positions;
}

export function spawnClearanceDefenders({
  faction,
  team,
  scene,
  mapDef,
  capturePoints,
  enemyArmyMult = 1,
  attackerUnits = [],
  scenery = null,
}) {
  let layout = CLEARANCE_DEFENDER_LAYOUT.map((s) => ({
    ...s,
    count: Math.max(s.type === 'artillery' ? 1 : 0, Math.round(s.count * enemyArmyMult)),
  })).filter((s) => s.count > 0);

  const positions = buildDefensivePositions(mapDef, capturePoints);
  if (!positions.length) return [];

  const units = [];
  const reservedAtPositions = [];
  let posIdx = 0;

  for (const slot of layout) {
    const def = faction.units[slot.type];
    if (!def) continue;

    for (let i = 0; i < slot.count; i++) {
      const anchor = positions[posIdx % positions.length];
      posIdx++;
      const jitter = 2.2;
      let position = {
        x: anchor.x + (Math.random() - 0.5) * jitter,
        z: anchor.z + (Math.random() - 0.5) * jitter,
      };

      // Long-ranged defenders (especially artillery and AT guns) used to begin
      // with the attacker's assembly already inside their weapon radius. Push
      // only those unsafe positions deeper into the defensive zone so contact
      // begins after the player advances, not at the opening whistle.
      if (attackerUnits.length && def.range > 0) {
        const { ax, az } = axisFromPlayerToEnemy(mapDef);
        const half = (mapDef.size ?? 120) * 0.5 - 5;
        const safeRange = def.range + 5;
        for (let pass = 0; pass < 18; pass++) {
          let shortfall = 0;
          for (const attacker of attackerUnits) {
            if (attacker.dead) continue;
            const dist = Math.hypot(
              position.x - attacker.position.x,
              position.z - attacker.position.z
            );
            shortfall = Math.max(shortfall, safeRange - dist);
          }
          if (shortfall <= 0) break;
          const step = Math.min(10, shortfall + 1);
          const nextX = Math.max(-half, Math.min(half, position.x + ax * step));
          const nextZ = Math.max(-half, Math.min(half, position.z + az * step));
          if (Math.hypot(nextX - position.x, nextZ - position.z) < 0.05) break;
          position.x = nextX;
          position.z = nextZ;
        }
      }

      const berlinAtAmbush = slot.type === 'antiTankGun'
        ? findBerlinAtAmbushPosition({
            anchor: position,
            def,
            mapDef,
            scenery,
            attackerUnits,
            reservedPositions: reservedAtPositions,
          })
        : null;
      if (berlinAtAmbush) {
        position = { x: berlinAtAmbush.x, z: berlinAtAmbush.z };
      } else {
        position = resolveUnitSpawnPosition(def, position.x, position.z, scenery, mapDef, {
          // Garrison occupies the enemy-base half regardless of who is human.
          team: mapDef?.terrain === 'urban' ? null : team,
          forceAssemblyRear: def?.type === 'artillery',
        });
      }
      if (!position) continue;

      const unit = new Unit({ def, faction, team, position, scene });
      unit.defensiveHold = {
        x: position.x,
        z: position.z,
        radius: anchor.holdRadius ?? 12,
      };
      if (team === 'enemy') unit._clearanceDefenderCoverPending = true;
      unit.position.y = sampleTerrainHeight(position.x, position.z, mapDef);
      if (berlinAtAmbush) {
        unit._clearanceDeploymentYaw = berlinAtAmbush.yaw;
        unit.mesh.rotation.y = berlinAtAmbush.yaw;
        reservedAtPositions.push({ x: position.x, z: position.z });
      }
      units.push(unit);
    }
  }

  return units;
}

export function checkClearanceVictory(game) {
  const enemyAlive = game.units.filter(
    (u) =>
      u.team === 'enemy' &&
      !u.dead &&
      !u.surrendered &&
      !u._captureExit &&
      u.def?.type !== 'commander'
  ).length;
  const playerAlive = game.units.filter(
    (u) =>
      u.team === 'player' &&
      !u.dead &&
      !u.surrendered &&
      !u._captureExit &&
      u.def?.type !== 'commander'
  ).length;
  const playerAttacks = isClearancePlayerAttacker(game);

  if (enemyAlive === 0 && playerAlive === 0) {
    return {
      victory: false,
      detail: playerAttacks
        ? 'Mutual annihilation — the assault collapsed with the garrison.'
        : 'Mutual annihilation — the garrison fell with the assault force.',
    };
  }
  if (enemyAlive === 0) {
    return {
      victory: true,
      detail: playerAttacks
        ? 'All enemy defensive positions cleared!'
        : 'Assault broken — the attacking force has been destroyed!',
    };
  }
  if (playerAlive === 0) {
    return {
      victory: false,
      detail: playerAttacks
        ? 'All your units have been lost!'
        : 'Defenses overrun — your garrison has been wiped out!',
    };
  }
  if (game.clearanceTimeLimitEnabled !== false && game.matchTime >= CLEARANCE_TIME_LIMIT) {
    return {
      victory: !playerAttacks,
      detail: playerAttacks
        ? 'The 15-minute assault window expired — the fortified line held.'
        : 'The fortified line held for 15 minutes — the assault has failed.',
    };
  }
  return null;
}
