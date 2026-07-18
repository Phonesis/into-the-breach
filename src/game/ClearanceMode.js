import { Unit } from '../units/Unit.js';
import { sampleTerrainHeight } from '../world/Terrain.js';

/** Defender layout scaled by difficulty.enemyArmyMult in spawn. */
export const CLEARANCE_DEFENDER_LAYOUT = [
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

/** Enemies hold fire briefly so forward defensive lines do not wipe the staging area. */
export const CLEARANCE_CEASEFIRE_TIME = 10;

export const CLEARANCE_REINFORCEMENT_INTERVAL = 180;

const PLAYER_REINFORCEMENT_PACKAGES = [
  ['infantry', 'machineGun'],
  ['infantry', 'mortar'],
  ['infantry', 'tank'],
  ['infantry', 'antiTankGun'],
];

const DEFENDER_REINFORCEMENT_PACKAGES = [
  ['infantry', 'machineGun'],
  ['infantry', 'antiTankGun'],
  ['infantry', 'armoredCar'],
  ['infantry', 'mortar'],
];

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

/** Tanks ignore rifle/MG fire; dedicated anti-armor weapons hurt. */
export function getArmorDamageMultiplier(attackerType, target) {
  if (!target?.def) return 1;
  const t = target.def.type;

  if (t === 'tank' || t === 'tankDestroyer' || t === 'superHeavyTank') {
    const isSuper = t === 'superHeavyTank';
    if (
      attackerType === 'infantry' ||
      attackerType === 'vehicleCrew' ||
      attackerType === 'machineGun' ||
      attackerType === 'armoredCar'
    ) {
      return 0;
    }
    if (attackerType === 'sniper') return 0;
    if (attackerType === 'mortar') return isSuper ? 1.05 : 1.15;
    if (attackerType === 'antiTankGun') return isSuper ? 1.08 : 1.12;
    if (ANTI_ARMOR.has(attackerType)) return isSuper ? 1.25 : 1.4;
    return 1;
  }

  if (t === 'armoredCar') {
    if (
      attackerType === 'infantry' ||
      attackerType === 'vehicleCrew' ||
      attackerType === 'machineGun'
    )
      return 0.32;
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

/** True if (x,z) lies on the enemy side of the map midpoint. */
export function isEnemyHalfPosition(x, z, mapDef) {
  const { ax, az, pb, eb } = axisFromPlayerToEnemy(mapDef);
  const midX = (pb.x + eb.x) * 0.5;
  const midZ = (pb.z + eb.z) * 0.5;
  return (x - midX) * ax + (z - midZ) * az > 0.5;
}

/** Rally / staging anchor for the attacker — no HQ in Clear Defenses. */
export function getClearanceStagingAnchor(mapDef) {
  const base = getClearancePlayerSpawnBase(mapDef);
  return {
    team: 'player',
    dead: false,
    position: { x: base.x, z: base.z },
  };
}

/** Assembly area for the player's starting force — well behind the line, away from contact. */
export function getClearancePlayerSpawnBase(mapDef) {
  const { ax, az, pb } = axisFromPlayerToEnemy(mapDef);
  const half = (mapDef.size ?? 120) * 0.5 - 6;
  const pullBack = 24;
  let x = pb.x - ax * pullBack;
  let z = pb.z - az * pullBack;
  x = Math.max(-half, Math.min(half, x));
  z = Math.max(-half, Math.min(half, z));
  return { x, z };
}

export function createClearanceReinforcementState(enabled = false) {
  if (!enabled) return null;
  return {
    enabled: true,
    interval: CLEARANCE_REINFORCEMENT_INTERVAL,
    nextAt: CLEARANCE_REINFORCEMENT_INTERVAL,
    wave: 0,
    nextProbeAt: 52,
    probe: 0,
  };
}

function spawnReinforcementPackage(game, team, types, wave) {
  const faction = team === 'player' ? game.playerFaction : game.enemyFaction;
  const base = team === 'player'
    ? getClearancePlayerSpawnBase(game.mapDef)
    : game.mapDef.enemyBase;
  const { ax, az } = axisFromPlayerToEnemy(game.mapDef);
  const facingX = team === 'player' ? ax : -ax;
  const facingZ = team === 'player' ? az : -az;
  const sideX = -az;
  const sideZ = ax;
  const spawned = [];

  for (let i = 0; i < types.length; i++) {
    const def = faction.units[types[i]];
    if (!def) continue;
    const lateral = (i - (types.length - 1) / 2) * 4.6;
    const depth = 3 + i * 1.8;
    const position = {
      x: base.x + sideX * lateral - facingX * depth,
      z: base.z + sideZ * lateral - facingZ * depth,
    };
    const unit = new Unit({ def, faction, team, position, scene: game.scene });
    unit._mapDef = game.mapDef;
    unit.position.y = sampleTerrainHeight(position.x, position.z, game.mapDef);
    unit.mesh.rotation.y = Math.atan2(facingX, facingZ);
    if (team === 'enemy') {
      unit.defensiveHold = {
        x: position.x + facingX * (6 + (wave % 2) * 3),
        z: position.z + facingZ * (6 + (wave % 2) * 3),
        radius: 15,
      };
    }
    spawned.push(unit);
  }
  return spawned;
}

/** Add one small reinforcement group to each side when the three-minute clock expires. */
export function updateClearanceReinforcements(game) {
  const state = game?.clearanceReinforcements;
  if (!state?.enabled || game.gameOver || game.matchTime < state.nextAt) return null;

  const allSpawned = [];
  let cycles = 0;
  while (game.matchTime >= state.nextAt && cycles < 3) {
    state.wave += 1;
    const packageIndex = (state.wave - 1) % PLAYER_REINFORCEMENT_PACKAGES.length;
    allSpawned.push(
      ...spawnReinforcementPackage(
        game,
        'player',
        PLAYER_REINFORCEMENT_PACKAGES[packageIndex],
        state.wave
      ),
      ...spawnReinforcementPackage(
        game,
        'enemy',
        DEFENDER_REINFORCEMENT_PACKAGES[packageIndex],
        state.wave
      )
    );
    state.nextAt += state.interval;
    cycles += 1;
  }
  if (!allSpawned.length) return null;
  game.units.push(...allSpawned);
  return { wave: state.wave, units: allSpawned };
}

/** Periodically release a small mobile detachment to test and pursue the attackers. */
export function updateClearanceCounterattacks(game) {
  const state = game?.clearanceReinforcements;
  if (!state?.enabled || game.gameOver || game.matchTime < (state.nextProbeAt ?? 52)) {
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
  const size = Math.min(
    4,
    candidates.length,
    Math.max(2, Math.round(2 + (aggression - 1) * 2 + candidates.length * 0.08))
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
}) {
  let layout = CLEARANCE_DEFENDER_LAYOUT.map((s) => ({
    ...s,
    count: Math.max(s.type === 'artillery' ? 1 : 0, Math.round(s.count * enemyArmyMult)),
  })).filter((s) => s.count > 0);

  const positions = buildDefensivePositions(mapDef, capturePoints);
  if (!positions.length) return [];

  const units = [];
  let posIdx = 0;

  for (const slot of layout) {
    const def = faction.units[slot.type];
    if (!def) continue;

    for (let i = 0; i < slot.count; i++) {
      const anchor = positions[posIdx % positions.length];
      posIdx++;
      const jitter = 2.2;
      const position = {
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

      const unit = new Unit({ def, faction, team, position, scene });
      unit.defensiveHold = {
        x: position.x,
        z: position.z,
        radius: anchor.holdRadius ?? 12,
      };
      unit.position.y = sampleTerrainHeight(position.x, position.z, mapDef);
      units.push(unit);
    }
  }

  return units;
}

export function checkClearanceVictory(game) {
  const enemyAlive = game.units.filter((u) => u.team === 'enemy' && !u.dead).length;
  const playerAlive = game.units.filter((u) => u.team === 'player' && !u.dead).length;

  if (enemyAlive === 0) {
    return { victory: true, detail: 'All enemy defensive positions cleared!' };
  }
  if (playerAlive === 0) {
    return { victory: false, detail: 'All your units have been lost!' };
  }
  return null;
}
