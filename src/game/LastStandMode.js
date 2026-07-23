import { getProducibleUnits, isLastStandMode, LAST_STAND_SUPPLIES } from '../data/gameModes.js';
import {
  isLastStandPresetDeployMode,
  LAST_STAND_PRESET_ROSTER,
} from '../data/lastStandForces.js';
import { pickLastStandTactic, getLastStandTactic } from '../data/lastStandTactics.js';
import { buildLastStandBriefing } from '../data/lastStandBriefing.js';

export { isLastStandMode, LAST_STAND_SUPPLIES };
import { resolveUnitSpawnPosition, spawnUnitAt } from './Spawner.js';
import { sampleTerrainHeight } from '../world/Terrain.js';

/** Minimum gap between placed units (game meters). */
export const LAST_STAND_MIN_SPACING = 3.8;

const ENEMY_DEPLOY_INTERVAL = 0.85;
const ENEMY_DEPLOY_BURST = 4;

/** Base mix for manual-deploy AI — composition is chosen freely, not copied. */
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
  tankDestroyer: 2,
  superHeavyTank: 1,
  artillery: 2,
};

/** Tactic-driven bias so the enemy plan shapes its own roster. */
const TACTIC_TYPE_WEIGHT_MULT = {
  armoredThrust: {
    tank: 2.4,
    superHeavyTank: 2.1,
    tankDestroyer: 1.4,
    armoredCar: 1.2,
    antiTankGun: 1.15,
    infantry: 0.85,
  },
  defensiveBelt: {
    antiTankGun: 2.2,
    machineGun: 1.8,
    mortar: 1.7,
    artillery: 1.6,
    infantry: 1.25,
    tank: 0.7,
    armoredCar: 0.65,
  },
  infantryAssault: {
    infantry: 2.2,
    machineGun: 1.7,
    medic: 1.4,
    engineer: 1.3,
    sniper: 1.2,
    tank: 0.75,
    superHeavyTank: 0.5,
  },
  flankingHook: {
    armoredCar: 2.3,
    tank: 1.8,
    tankDestroyer: 1.3,
    infantry: 1.1,
    artillery: 0.75,
  },
  reconnaissancePush: {
    armoredCar: 2.6,
    sniper: 1.5,
    infantry: 1.15,
    tank: 1.1,
    superHeavyTank: 0.45,
    artillery: 0.7,
  },
  firePreparation: {
    artillery: 2.4,
    mortar: 2.2,
    machineGun: 1.3,
    infantry: 1.05,
    tank: 0.85,
  },
  generalAdvance: {
    infantry: 1.35,
    machineGun: 1.2,
    tank: 1.2,
    antiTankGun: 1.1,
    mortar: 1.1,
  },
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
  tankDestroyer: 'armor',
  superHeavyTank: 'armor',
};

const PRESET_ECHELON_BY_ROLE = {
  line: 'front',
  support: 'support',
  arty: 'support',
  recon: 'reserve',
  armor: 'reserve',
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

export function canPlaceUnitAt(x, z, mapDef, units, def = null, scenery = null) {
  const half = (mapDef?.size ?? 120) * 0.5 - 4;
  if (Math.abs(x) > half || Math.abs(z) > half) return false;

  for (const u of units) {
    if (u.dead) continue;
    const d = Math.hypot(u.position.x - x, u.position.z - z);
    if (d < LAST_STAND_MIN_SPACING) return false;
  }
  if (def && scenery?.findClearVehiclePlacement) {
    const resolved = resolveUnitSpawnPosition(def, x, z, scenery, mapDef);
    if (!resolved || resolved.x !== x || resolved.z !== z) return false;
  }
  return true;
}

function pickDeployPosition(mapDef, units, biasBase, def = null, scenery = null) {
  const half = (mapDef.size ?? 120) * 0.5 - 6;
  const base = biasBase ?? { x: 0, z: 0 };

  for (let i = 0; i < 36; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 4 + Math.random() * Math.min(half * 0.92, 52);
    const x = Math.max(-half, Math.min(half, base.x + Math.cos(angle) * dist));
    const z = Math.max(-half, Math.min(half, base.z + Math.sin(angle) * dist));
    if (canPlaceUnitAt(x, z, mapDef, units, def, scenery)) return { x, z };
  }
  return null;
}

function findFormationPosition(mapDef, units, x, z, def = null, scenery = null) {
  if (canPlaceUnitAt(x, z, mapDef, units, def, scenery)) return { x, z };

  for (let ring = 1; ring <= 6; ring++) {
    const step = LAST_STAND_MIN_SPACING * 0.85;
    for (let a = 0; a < 12; a++) {
      const angle = (a / 12) * Math.PI * 2;
      const tx = x + Math.cos(angle) * step * ring;
      const tz = z + Math.sin(angle) * step * ring;
      if (canPlaceUnitAt(tx, tz, mapDef, units, def, scenery)) return { x: tx, z: tz };
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

  const pos = findFormationPosition(game.mapDef, game.units, x, z, def, game.scenery);
  if (!pos) return false;

  const unit = spawnUnitAt({
    def,
    faction,
    team,
    x: pos.x,
    z: pos.z,
    scene: game.scene,
    mapDef: game.mapDef,
    scenery: game.scenery,
  });
  if (!unit) return false;
  unit._mapDef = game.mapDef;
  unit.position.y = sampleTerrainHeight(unit.position.x, unit.position.z, game.mapDef);
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

function livingTeamUnits(game, team) {
  const out = [];
  for (const unit of game.units) {
    if (unit.team === team && !unit.dead) out.push(unit);
  }
  return out;
}

function enemyTypeWeightsForTactic(tacticId) {
  const bias = TACTIC_TYPE_WEIGHT_MULT[tacticId] ?? null;
  if (!bias) return { ...ENEMY_TYPE_WEIGHTS };
  const weights = { ...ENEMY_TYPE_WEIGHTS };
  for (const [type, mult] of Object.entries(bias)) {
    weights[type] = (weights[type] ?? 1) * mult;
  }
  return weights;
}

/**
 * AI picks its own unit mix (optionally biased by battle plan).
 * Only force size is matched to the player — not composition.
 */
function pickEnemyDeployType(game, { ignoreSupplies = false } = {}) {
  const faction = game.enemyFaction;
  if (!faction?.units) return null;
  const supplies = ignoreSupplies ? Infinity : game.lastStand?.supplies?.enemy ?? 0;
  const weights = enemyTypeWeightsForTactic(game.lastStand?.enemyTactic?.id);
  const types = getProducibleUnits(faction).filter(
    (type) => (faction.units[type]?.cost ?? Infinity) <= supplies
  );
  if (!types.length) {
    // Budget exhausted: still allow any producible type when matching count for free.
    return ignoreSupplies ? getProducibleUnits(faction)[0] ?? null : null;
  }

  let total = 0;
  const entries = [];
  for (const type of types) {
    const w = Math.max(0.05, weights[type] ?? 1);
    total += w;
    entries.push({ type, w });
  }
  let roll = Math.random() * total;
  for (const { type, w } of entries) {
    roll -= w;
    if (roll <= 0) return type;
  }
  return entries[entries.length - 1]?.type ?? null;
}

function assignLastStandUnitRole(unit, unitType = unit.def?.type) {
  if (!unit) return;
  const role = PRESET_ROLE_BY_TYPE[unitType] ?? 'line';
  unit.lastStandRole = role;
  unit.lastStandEchelon = PRESET_ECHELON_BY_ROLE[role] ?? 'front';
}

function placeEnemyUnit(game, unitType, { free = false } = {}) {
  const state = game.lastStand;
  const faction = game.enemyFaction;
  const def = faction?.units?.[unitType];
  if (!def) return false;
  if (!free && state.supplies.enemy < def.cost) return false;

  const pos = pickDeployPosition(
    game.mapDef,
    game.units,
    game.mapDef.enemyBase,
    def,
    game.scenery
  );
  if (!pos) return false;

  const unit = spawnUnitAt({
    def,
    faction,
    team: 'enemy',
    x: pos.x,
    z: pos.z,
    scene: game.scene,
    mapDef: game.mapDef,
    scenery: game.scenery,
  });
  if (!unit) return false;
  unit._mapDef = game.mapDef;
  unit.position.y = sampleTerrainHeight(unit.position.x, unit.position.z, game.mapDef);
  assignLastStandUnitRole(unit, unitType);
  game.units.push(unit);
  if (!free) {
    state.supplies.enemy = Math.max(0, state.supplies.enemy - def.cost);
  }
  return true;
}

/** Place one AI-chosen unit; falls back to free placement if supplies are tight. */
function placeEnemyChosenUnit(game) {
  let type = pickEnemyDeployType(game, { ignoreSupplies: false });
  if (type && placeEnemyUnit(game, type, { free: false })) return true;
  type = pickEnemyDeployType(game, { ignoreSupplies: true });
  if (!type) return false;
  return placeEnemyUnit(game, type, { free: true });
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
  if (!canPlaceUnitAt(x, z, game.mapDef, game.units, def, game.scenery)) {
    return { ok: false, reason: 'blocked' };
  }

  const unit = spawnUnitAt({
    def,
    faction,
    team: 'player',
    x,
    z,
    scene: game.scene,
    mapDef: game.mapDef,
    scenery: game.scenery,
  });
  if (!unit) return { ok: false, reason: 'blocked' };
  unit._mapDef = game.mapDef;
  unit.position.y = sampleTerrainHeight(unit.position.x, unit.position.z, game.mapDef);
  game.units.push(unit);
  if (!cheatFree) state.supplies.player -= def.cost;
  return { ok: true, unit };
}

/**
 * During manual deploy, the enemy trails the player's force size only.
 * Unit types are chosen by the AI (biased by battle plan), not copied.
 */
export function updateLastStandEnemyDeploy(game, dt) {
  const state = game.lastStand;
  if (!state || state.phase !== 'deploy' || isLastStandPresetDeployMode(state.deployMode)) return;

  state.enemyDeployTimer -= dt;
  if (state.enemyDeployTimer > 0) return;

  state.enemyDeployTimer = ENEMY_DEPLOY_INTERVAL * (0.75 + Math.random() * 0.5);

  const playerCount = livingTeamUnits(game, 'player').length;
  const enemyCount = livingTeamUnits(game, 'enemy').length;
  const deficit = playerCount - enemyCount;
  if (deficit <= 0) return;

  let placed = 0;
  const budget = Math.min(ENEMY_DEPLOY_BURST, deficit);
  while (placed < budget) {
    if (!placeEnemyChosenUnit(game)) break;
    placed++;
  }
}

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
  if (Math.random() >= defendChance) {
    unit.lastStandStance = 'attack';
    unit.defensiveHold = null;
    return;
  }
  unit.lastStandStance = 'defend';
  unit.defensiveHold = {
    x: unit.position.x,
    z: unit.position.z,
    radius: holdRadiusForType(unit.def?.type),
  };
}

/**
 * Roll enemy battle plan (and briefing for preset mode).
 * Manual deploy also gets a tactic so AI uses the same combined-arms mix.
 */
export function initLastStandPresetEngagement(game) {
  const state = game.lastStand;
  if (!state) return null;

  const tactic = pickLastStandTactic();
  state.enemyTactic = tactic;
  state.enemyTacticId = tactic.id;
  state.flankSide = Math.random() < 0.5 ? -1 : 1;

  if (isLastStandPresetDeployMode(state.deployMode)) {
    state.briefing = buildLastStandBriefing({
      mapDef: game.mapDef,
      playerFaction: game.playerFaction,
      enemyFaction: game.enemyFaction,
      tactic,
    });
    state.briefingShown = false;
    return state.briefing;
  }

  // Manual deploy: tactic drives AI only; no full field briefing overlay.
  state.briefing = null;
  state.briefingShown = true;
  return null;
}

/** Ensure a battle plan exists before combat AI runs (manual begin battle). */
export function ensureLastStandEngagementTactic(game) {
  const state = game.lastStand;
  if (!state) return null;
  if (state.enemyTactic) return state.enemyTactic;
  initLastStandPresetEngagement(game);
  return state.enemyTactic ?? null;
}

/** Combined-arms stances — varies by enemy battle plan (preset and manual). */
export function assignLastStandPresetStances(game) {
  const tactic =
    game.lastStand?.enemyTactic ??
    getLastStandTactic(game.lastStand?.enemyTacticId);
  const stanceTable = tactic?.stances ?? getLastStandTactic('armoredThrust').stances;

  for (const unit of game.units) {
    if (unit.dead) continue;

    const role = unit.lastStandRole ?? PRESET_ROLE_BY_TYPE[unit.def?.type] ?? 'line';
    unit.lastStandRole = role;
    if (!unit.lastStandEchelon) {
      unit.lastStandEchelon = PRESET_ECHELON_BY_ROLE[role] ?? 'front';
    }

    if (unit.team === 'player') {
      unit.lastStandStance = null;
      unit.defensiveHold = null;
      continue;
    }

    const defendChance = stanceTable[role] ?? stanceTable.line ?? 0.55;
    assignDefensiveHold(unit, defendChance);
  }
}

/**
 * Top up the enemy army so its size matches the player when Begin Battle is
 * pressed. Composition stays AI-chosen.
 */
export function flushEnemyDeployment(game) {
  const state = game.lastStand;
  if (!state || isLastStandPresetDeployMode(state.deployMode)) return;

  let guard = 0;
  while (guard < 250) {
    guard++;
    const playerCount = livingTeamUnits(game, 'player').length;
    const enemyCount = livingTeamUnits(game, 'enemy').length;
    if (enemyCount >= playerCount) break;
    if (!placeEnemyChosenUnit(game)) break;
  }

  // Tag any stragglers placed before roles existed.
  for (const unit of livingTeamUnits(game, 'enemy')) {
    if (!unit.lastStandRole) assignLastStandUnitRole(unit);
  }
}

/** @deprecated Manual mode now uses tactic stances; kept as alias for callers. */
export function assignLastStandEnemyStances(game) {
  ensureLastStandEngagementTactic(game);
  for (const unit of livingTeamUnits(game, 'enemy')) {
    if (!unit.lastStandRole) assignLastStandUnitRole(unit);
  }
  assignLastStandPresetStances(game);
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
