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

const ANTI_ARMOR = new Set(['tank', 'superHeavyTank', 'artillery', 'antiTankGun', 'paratrooper']);

/** Tanks ignore rifle/MG fire; dedicated anti-armor weapons hurt. */
export function getArmorDamageMultiplier(attackerType, target) {
  if (!target?.def) return 1;
  const t = target.def.type;

  if (t === 'tank' || t === 'superHeavyTank') {
    const isSuper = t === 'superHeavyTank';
    if (attackerType === 'infantry' || attackerType === 'machineGun' || attackerType === 'armoredCar') {
      return 0;
    }
    if (attackerType === 'sniper') return isSuper ? 0.08 : 0.12;
    if (attackerType === 'mortar') return isSuper ? 1.05 : 1.15;
    if (attackerType === 'antiTankGun') return isSuper ? 1.08 : 1.12;
    if (ANTI_ARMOR.has(attackerType)) return isSuper ? 1.25 : 1.4;
    return 1;
  }

  if (t === 'armoredCar') {
    if (attackerType === 'infantry' || attackerType === 'machineGun') return 0.32;
    if (attackerType === 'sniper') return 0.55;
    if (attackerType === 'mortar') return 1.05;
    if (attackerType === 'tank' || attackerType === 'superHeavyTank' || attackerType === 'artillery') {
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

/** Assembly area for the player's starting force — well behind the HQ, away from contact. */
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

      const unit = new Unit({ def, faction, team, position, scene });
      unit.defensiveHold = {
        x: anchor.holdX ?? anchor.x,
        z: anchor.holdZ ?? anchor.z,
        radius: anchor.holdRadius ?? 12,
      };
      unit.position.y = sampleTerrainHeight(position.x, position.z, mapDef);
      units.push(unit);
    }
  }

  return units;
}

export function setupClearanceCapturePoints(capturePoints, mapDef) {
  const homeDist = (cp) =>
    Math.hypot(cp.x - mapDef.playerBase.x, cp.z - mapDef.playerBase.z);

  for (const cp of capturePoints) {
    if (homeDist(cp) < 22) {
      cp.owner = 'player';
      cp.progress = 1;
    } else if (isEnemyHalfPosition(cp.x, cp.z, mapDef)) {
      cp.owner = 'enemy';
      cp.progress = 1;
    } else {
      cp.owner = null;
      cp.progress = 0;
    }
  }
}

import { teamIsEliminated } from './EliminationRules.js';

export function checkClearanceVictory(game) {
  const enemyAlive = game.units.filter((u) => u.team === 'enemy' && !u.dead).length;
  const playerAlive = game.units.filter((u) => u.team === 'player' && !u.dead).length;
  const playerHQ = game.hqs.find((h) => h.team === 'player');

  if (enemyAlive === 0) {
    return { victory: true, detail: 'All enemy defensive positions cleared!' };
  }
  if (playerHQ?.dead) {
    return { victory: false, detail: 'Your headquarters has fallen!' };
  }
  if (teamIsEliminated('player', game, playerAlive)) {
    return { victory: false, detail: 'All your units have been lost!' };
  }
  return null;
}