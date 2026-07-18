import { getProducibleUnits, isLastStandMode, LAST_STAND_SUPPLIES } from '../data/gameModes.js';
import {
  isLastStandPresetDeployMode,
  LAST_STAND_PRESET_ROSTER,
} from '../data/lastStandForces.js';
import { pickLastStandTactic, getLastStandTactic } from '../data/lastStandTactics.js';
import { buildLastStandBriefing } from '../data/lastStandBriefing.js';

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

const PRESET_ECHELON_DEPTH = {
  front: 0.34,
  support: 0.2,
  reserve: 0.1,
};

const PRESET_ROLE_BY_TYPE = {
  infantry: 'line',
  machineGun: 'line',
  sniper: 'support',
  medic: 'support',
  engineer: 'support',
  mortar: 'arty',
  antiTankGun: 'support',
  artillery: 'arty',
  armoredCar: 'recon',
  tank: 'armor',
  superHeavyTank: 'armor',
};

export function createLastStandState(deployMode = 'manual') {
  const preset = isLastStandPresetDeployMode(deployMode);
  return {
    phase: 'deploy',
    deployMode,
    supplies: preset
      ? { player: 0, enemy: 0 }
      : { player: LAST_STAND_SUPPLIES, enemy: LAST_STAND_SUPPLIES },
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

function findFormationPosition(mapDef, units, x, z) {
  if (canPlaceUnitAt(x, z, mapDef, units)) return { x, z };

  for (let ring = 1; ring <= 6; ring++) {
    const step = LAST_STAND_MIN_SPACING * 0.85;
    for (let a = 0; a < 12; a++) {
      const angle = (a / 12) * Math.PI * 2;
      const tx = x + Math.cos(angle) * step * ring;
      const tz = z + Math.sin(angle) * step * ring;
      if (canPlaceUnitAt(tx, tz, mapDef, units)) return { x: tx, z: tz };
    }
  }
  return null;
}

function getFormationBasis(mapDef, team) {
  const ownBase = team === 'player' ? mapDef.playerBase : mapDef.enemyBase;
  const foeBase = team === 'player' ? mapDef.enemyBase : mapDef.playerBase;
  const axisX = foeBase.x - ownBase.x;
  const axisZ = foeBase.z - ownBase.z;
  const len = Math.hypot(axisX, axisZ) || 1;
  return {
    base: ownBase,
    axisX: axisX / len,
    axisZ: axisZ / len,
    perpX: -axisZ / len,
    perpZ: axisX / len,
    deployDepth: (mapDef.size ?? 120) * 0.38,
    lineWidth: (mapDef.size ?? 120) * 0.42,
  };
}

function spawnPresetUnit(game, { faction, team, unitType, echelon, index, count, basis }) {
  const def = faction?.units?.[unitType];
  if (!def) return false;

  const depthFrac = PRESET_ECHELON_DEPTH[echelon] ?? 0.2;
  const along = basis.deployDepth * depthFrac;
  const lateralSpan = basis.lineWidth * (echelon === 'reserve' ? 0.55 : echelon === 'support' ? 0.72 : 0.88);
  const t = count <= 1 ? 0 : index / (count - 1) - 0.5;
  const jitter = (Math.random() - 0.5) * 2.2;

  const x =
    basis.base.x +
    basis.axisX * along +
    basis.perpX * (t * lateralSpan + jitter);
  const z =
    basis.base.z +
    basis.axisZ * along +
    basis.perpZ * (t * lateralSpan + jitter);

  const pos = findFormationPosition(game.mapDef, game.units, x, z);
  if (!pos) return false;

  const unit = spawnUnitAt({
    def,
    faction,
    team,
    x: pos.x,
    z: pos.z,
    scene: game.scene,
    mapDef: game.mapDef,
  });
  unit._mapDef = game.mapDef;
  unit.position.y = sampleTerrainHeight(pos.x, pos.z, game.mapDef);
  unit.lastStandRole = PRESET_ROLE_BY_TYPE[unitType] ?? 'line';
  unit.lastStandEchelon = echelon;
  game.units.push(unit);
  return true;
}

/** Deploy mirrored preset battle groups for both sides (large-map preset mode). */
export function deployLastStandPresetForces(game) {
  const state = game.lastStand;
  if (!state || !isLastStandPresetDeployMode(state.deployMode)) return;

  for (const team of ['player', 'enemy']) {
    const faction = team === 'player' ? game.playerFaction : game.enemyFaction;
    const basis = getFormationBasis(game.mapDef, team);

    for (const slot of LAST_STAND_PRESET_ROSTER) {
      const def = faction?.units?.[slot.type];
      if (!def) continue;
      for (let i = 0; i < slot.count; i++) {
        spawnPresetUnit(game, {
          faction,
          team,
          unitType: slot.type,
          echelon: slot.echelon,
          index: i,
          count: slot.count,
          basis,
        });
      }
    }
  }
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
  if (isLastStandPresetDeployMode(state.deployMode)) return { ok: false, reason: 'preset_mode' };

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
  if (!state || state.phase !== 'deploy' || isLastStandPresetDeployMode(state.deployMode)) return;

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
const LAST_STAND_AGGRESSIVE_TYPES = new Set(['tank', 'tankDestroyer', 'armoredCar', 'superHeavyTank']);

function holdRadiusForType(type) {
  if (type === 'artillery' || type === 'mortar') return 12;
  if (type === 'antiTankGun') return 10;
  if (type === 'infantry') return 14;
  if (type === 'machineGun' || type === 'sniper') return 11;
  if (type === 'tank' || type === 'tankDestroyer' || type === 'superHeavyTank') return 16;
  if (type === 'armoredCar') return 18;
  return 12;
}

function assignDefensiveHold(unit, defendChance) {
  const type = unit.def.type;
  if (Math.random() >= defendChance) {
    unit.lastStandStance = 'attack';
    unit.defensiveHold = null;
    return;
  }
  unit.lastStandStance = 'defend';
  unit.defensiveHold = {
    x: unit.position.x,
    z: unit.position.z,
    radius: holdRadiusForType(type),
  };
}

/** Assign per-unit attack vs hold roles when Last Stand battle begins (manual deploy). */
export function assignLastStandEnemyStances(game) {
  for (const unit of game.units) {
    if (unit.team !== 'enemy' || unit.dead) continue;

    const type = unit.def.type;
    let defendChance = 0.45;
    if (LAST_STAND_DEFENSIVE_TYPES.has(type)) defendChance = 0.82;
    else if (LAST_STAND_AGGRESSIVE_TYPES.has(type)) defendChance = 0.22;
    else if (type === 'infantry' || type === 'medic' || type === 'engineer') defendChance = 0.5;

    assignDefensiveHold(unit, defendChance);
  }
}

/** Roll enemy battle plan and briefing for preset Last Stand (once per engagement). */
export function initLastStandPresetEngagement(game) {
  const state = game.lastStand;
  if (!state || !isLastStandPresetDeployMode(state.deployMode)) return null;

  const tactic = pickLastStandTactic();
  state.enemyTactic = tactic;
  state.flankSide = Math.random() < 0.5 ? -1 : 1;
  state.briefing = buildLastStandBriefing({
    mapDef: game.mapDef,
    playerFaction: game.playerFaction,
    enemyFaction: game.enemyFaction,
    tactic,
  });
  state.briefingShown = false;
  return state.briefing;
}

/** Combined-arms stances for preset battle groups — varies by enemy battle plan. */
export function assignLastStandPresetStances(game) {
  const tactic =
    game.lastStand?.enemyTactic ??
    getLastStandTactic(game.lastStand?.enemyTacticId);
  const stanceTable = tactic?.stances ?? getLastStandTactic('armoredThrust').stances;

  for (const unit of game.units) {
    if (unit.dead) continue;

    const role = unit.lastStandRole ?? PRESET_ROLE_BY_TYPE[unit.def?.type] ?? 'line';
    unit.lastStandRole = role;

    if (unit.team === 'player') {
      unit.lastStandStance = null;
      unit.defensiveHold = null;
      continue;
    }

    const defendChance = stanceTable[role] ?? stanceTable.line ?? 0.55;
    assignDefensiveHold(unit, defendChance);
  }
}

export function flushEnemyDeployment(game) {
  const state = game.lastStand;
  if (!state || isLastStandPresetDeployMode(state.deployMode)) return;

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

function livingTeamCount(units, team) {
  let n = 0;
  for (const u of units) {
    if (u.team === team && !u.dead) n++;
  }
  return n;
}

export function checkLastStandVictory(game) {
  if (!game.lastStand || game.lastStand.phase !== 'battle') return null;

  const playerAlive = livingTeamCount(game.units, 'player');
  const enemyAlive = livingTeamCount(game.units, 'enemy');

  if (playerAlive === 0 && enemyAlive === 0) {
    return { victory: false, detail: 'Mutual annihilation — your forces are gone.' };
  }
  if (enemyAlive === 0) {
    return { victory: true, detail: 'Last man standing — all enemy forces destroyed!' };
  }
  if (playerAlive === 0) {
    return { victory: false, detail: 'Your forces have been wiped out.' };
  }
  return null;
}

export function isLastStandDeployPhase(game) {
  return !!(game.lastStand && game.lastStand.phase === 'deploy');
}

export function isLastStandPresetForce(game) {
  return isLastStandPresetDeployMode(game?.lastStand?.deployMode);
}
