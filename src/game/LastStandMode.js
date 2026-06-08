import { getProducibleUnits, isLastStandMode, LAST_STAND_SUPPLIES } from '../data/gameModes.js';

export { isLastStandMode, LAST_STAND_SUPPLIES };
import { spawnUnitAt } from './Spawner.js';
import { sampleTerrainHeight } from '../world/Terrain.js';

/** Minimum gap between placed units (game meters). */
export const LAST_STAND_MIN_SPACING = 3.8;

const ENEMY_DEPLOY_INTERVAL = 0.95;
const ENEMY_DEPLOY_BURST = 3;

const ENEMY_TYPE_WEIGHTS = {
  infantry: 5,
  medic: 1,
  engineer: 1,
  machineGun: 3,
  sniper: 2,
  mortar: 2,
  antiTankGun: 3,
  armoredCar: 2,
  tank: 3,
  superHeavyTank: 1,
  artillery: 2,
};

export function createLastStandState() {
  return {
    phase: 'deploy',
    supplies: { player: LAST_STAND_SUPPLIES, enemy: LAST_STAND_SUPPLIES },
    pendingType: null,
    enemyDeployTimer: ENEMY_DEPLOY_INTERVAL * 0.4,
  };
}

export function canPlaceUnitAt(x, z, mapDef, units) {
  const half = (mapDef?.size ?? 120) * 0.5 - 4;
  if (Math.abs(x) > half || Math.abs(z) > half) return false;

  for (const u of units) {
    if (u.dead) continue;
    const d = Math.hypot(u.position.x - x, u.position.z - z);
    if (d < LAST_STAND_MIN_SPACING) return false;
  }
  return true;
}

function pickDeployPosition(mapDef, units, biasBase) {
  const half = (mapDef.size ?? 120) * 0.5 - 6;
  const base = biasBase ?? { x: 0, z: 0 };

  for (let i = 0; i < 36; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 4 + Math.random() * Math.min(half * 0.92, 52);
    const x = Math.max(-half, Math.min(half, base.x + Math.cos(angle) * dist));
    const z = Math.max(-half, Math.min(half, base.z + Math.sin(angle) * dist));
    if (canPlaceUnitAt(x, z, mapDef, units)) return { x, z };
  }
  return null;
}

function pickWeightedUnitType(faction, supplies, weights = ENEMY_TYPE_WEIGHTS) {
  const types = getProducibleUnits(faction).filter((t) => faction.units[t]?.cost <= supplies);
  if (!types.length) return null;

  let total = 0;
  const entries = [];
  for (const type of types) {
    const w = weights[type] ?? 1;
    total += w;
    entries.push({ type, w });
  }
  let roll = Math.random() * total;
  for (const { type, w } of entries) {
    roll -= w;
    if (roll <= 0) return type;
  }
  return entries[entries.length - 1].type;
}

function placeEnemyUnit(game, unitType) {
  const state = game.lastStand;
  const faction = game.enemyFaction;
  const def = faction?.units?.[unitType];
  if (!def || state.supplies.enemy < def.cost) return false;

  const pos = pickDeployPosition(game.mapDef, game.units, game.mapDef.enemyBase);
  if (!pos) return false;

  const unit = spawnUnitAt({
    def,
    faction,
    team: 'enemy',
    x: pos.x,
    z: pos.z,
    scene: game.scene,
    mapDef: game.mapDef,
  });
  unit._mapDef = game.mapDef;
  unit.position.y = sampleTerrainHeight(pos.x, pos.z, game.mapDef);
  game.units.push(unit);
  state.supplies.enemy -= def.cost;
  return true;
}

export function tryPlacePlayerUnit(game, unitType, x, z) {
  const state = game.lastStand;
  if (!state || state.phase !== 'deploy') return { ok: false, reason: 'not_deploy' };

  const faction = game.playerFaction;
  const def = faction?.units?.[unitType];
  if (!def) return { ok: false, reason: 'invalid_type' };

  const cheatFree = game.cheatMode;
  if (!cheatFree && state.supplies.player < def.cost) return { ok: false, reason: 'no_supplies' };
  if (!canPlaceUnitAt(x, z, game.mapDef, game.units)) return { ok: false, reason: 'blocked' };

  const unit = spawnUnitAt({
    def,
    faction,
    team: 'player',
    x,
    z,
    scene: game.scene,
    mapDef: game.mapDef,
  });
  unit._mapDef = game.mapDef;
  unit.position.y = sampleTerrainHeight(x, z, game.mapDef);
  game.units.push(unit);
  if (!cheatFree) state.supplies.player -= def.cost;
  return { ok: true, unit };
}

export function updateLastStandEnemyDeploy(game, dt) {
  const state = game.lastStand;
  if (!state || state.phase !== 'deploy') return;

  state.enemyDeployTimer -= dt;
  if (state.enemyDeployTimer > 0) return;

  state.enemyDeployTimer = ENEMY_DEPLOY_INTERVAL * (0.75 + Math.random() * 0.5);

  let placed = 0;
  while (placed < ENEMY_DEPLOY_BURST && state.supplies.enemy > 0) {
    const type = pickWeightedUnitType(game.enemyFaction, state.supplies.enemy);
    if (!type) break;
    if (!placeEnemyUnit(game, type)) break;
    placed++;
  }
}

const LAST_STAND_DEFENSIVE_TYPES = new Set([
  'mortar',
  'artillery',
  'antiTankGun',
  'sniper',
  'machineGun',
]);
const LAST_STAND_AGGRESSIVE_TYPES = new Set(['tank', 'armoredCar', 'superHeavyTank']);

/** Assign per-unit attack vs hold roles when Last Stand battle begins. */
export function assignLastStandEnemyStances(game) {
  for (const unit of game.units) {
    if (unit.team !== 'enemy' || unit.dead) continue;

    const type = unit.def.type;
    let defendChance = 0.45;
    if (LAST_STAND_DEFENSIVE_TYPES.has(type)) defendChance = 0.82;
    else if (LAST_STAND_AGGRESSIVE_TYPES.has(type)) defendChance = 0.22;
    else if (type === 'infantry' || type === 'medic' || type === 'engineer') defendChance = 0.5;

    unit.lastStandStance = Math.random() < defendChance ? 'defend' : 'attack';
    if (unit.lastStandStance === 'defend') {
      const radius =
        type === 'artillery' || type === 'mortar' ? 10 : type === 'infantry' ? 14 : 12;
      unit.defensiveHold = {
        x: unit.position.x,
        z: unit.position.z,
        radius,
      };
    } else {
      unit.defensiveHold = null;
    }
  }
}

export function flushEnemyDeployment(game) {
  const state = game.lastStand;
  if (!state) return;

  const faction = game.enemyFaction;
  const types = getProducibleUnits(faction).sort(
    (a, b) => (faction.units[b]?.cost ?? 0) - (faction.units[a]?.cost ?? 0)
  );

  let guard = 0;
  while (state.supplies.enemy > 0 && guard < 200) {
    guard++;
    const affordable = types.filter((t) => (faction.units[t]?.cost ?? Infinity) <= state.supplies.enemy);
    if (!affordable.length) break;
    const type = pickWeightedUnitType(faction, state.supplies.enemy) ?? affordable[0];
    if (!placeEnemyUnit(game, type)) break;
  }

  if (game._enemyAlive.length === 0) {
    for (let i = 0; i < 6; i++) {
      if (!placeEnemyUnit(game, 'infantry')) break;
    }
  }
}

export function checkLastStandVictory(game) {
  if (!game.lastStand || game.lastStand.phase !== 'battle') return null;

  const playerAlive = game._playerAlive.length;
  const enemyAlive = game._enemyAlive.length;

  if (playerAlive === 0 && enemyAlive === 0) {
    return { victory: false, detail: 'Mutual annihilation — your forces are gone.' };
  }
  if (enemyAlive === 0) {
    return { victory: true, detail: 'Last man standing — all enemy forces destroyed!' };
  }
  if (playerAlive === 0) {
    return { victory: false, detail: 'Your army has been wiped out.' };
  }
  return null;
}

export function isLastStandDeployPhase(game) {
  return !!(game.lastStand && game.lastStand.phase === 'deploy');
}