import { spawnUnitAt } from './Spawner.js';
import { sounds } from '../audio/SoundManager.js';

const PLAYER = 'player';
const ENEMY = 'enemy';
const EDGE_INSET = 7;
const RETURN_RADIUS = 10;

export function isFieldCommander(unit) {
  return unit?.def?.type === 'commander';
}

export function getFieldCommander(game, team) {
  return game?.units?.find((unit) => unit.team === team && isFieldCommander(unit)) ?? null;
}

export function isCommanderAlive(game, team) {
  const commander = getFieldCommander(game, team);
  return !!commander && !commander.dead;
}

function rearEdgeAnchor(mapDef, team) {
  const own = team === PLAYER ? mapDef.playerBase : mapDef.enemyBase;
  const foe = team === PLAYER ? mapDef.enemyBase : mapDef.playerBase;
  let dx = own.x - foe.x;
  let dz = own.z - foe.z;
  const len = Math.hypot(dx, dz) || 1;
  dx /= len;
  dz /= len;

  const half = mapDef.size / 2 - EDGE_INSET;
  let travel = Infinity;
  if (Math.abs(dx) > 0.001) {
    travel = Math.min(travel, (dx > 0 ? half - own.x : -half - own.x) / dx);
  }
  if (Math.abs(dz) > 0.001) {
    travel = Math.min(travel, (dz > 0 ? half - own.z : -half - own.z) / dz);
  }
  if (!Number.isFinite(travel) || travel < 0) travel = 0;

  return {
    x: own.x + dx * travel,
    z: own.z + dz * travel,
  };
}

function faceEnemy(unit, mapDef, team) {
  if (!unit?.mesh) return;
  const foe = team === PLAYER ? mapDef.enemyBase : mapDef.playerBase;
  unit.mesh.rotation.y = Math.atan2(foe.x - unit.position.x, foe.z - unit.position.z);
}

function spawnCommander(game, team) {
  const faction = team === PLAYER ? game.playerFaction : game.enemyFaction;
  const def = faction?.units?.commander;
  if (!def || !game.mapDef) return null;

  const requested = rearEdgeAnchor(game.mapDef, team);
  const unit = spawnUnitAt({
    def,
    faction,
    team,
    x: requested.x,
    z: requested.z,
    scene: game.scene,
    mapDef: game.mapDef,
    scenery: game.scenery,
  });
  if (!unit) return null;

  unit._fieldCommander = true;
  unit._commanderRearAnchor = { x: unit.position.x, z: unit.position.z };
  unit._commanderDeathHandled = false;
  unit.engagementStance = 'hold';
  unit.autoFire = true;
  if (team === ENEMY) {
    unit.defensiveHold = { ...unit._commanderRearAnchor, radius: RETURN_RADIUS };
  }
  faceEnemy(unit, game.mapDef, team);
  game.units.push(unit);
  return unit;
}

export function ensureFieldCommanders(game) {
  for (const team of [PLAYER, ENEMY]) {
    let commander = getFieldCommander(game, team);
    if (!commander) commander = spawnCommander(game, team);
    if (!commander) continue;
    commander._fieldCommander = true;
    commander._commanderRearAnchor ??= rearEdgeAnchor(game.mapDef, team);
    if (team === ENEMY && !commander.dead) {
      commander.engagementStance = 'hold';
      commander.defensiveHold ??= {
        ...commander._commanderRearAnchor,
        radius: RETURN_RADIUS,
      };
    }
  }
}

function announceLoss(game, commander) {
  commander._commanderDeathHandled = true;
  const isPlayer = commander.team === PLAYER;
  const generalOrders = isPlayer ? game.generalOrders : game.enemyGeneralOrders;
  generalOrders?.cancelActive?.();

  sounds.playCommanderOrder(
    'lostCommander',
    commander.faction?.id,
    { x: commander.position.x, z: commander.position.z },
    { radio: true }
  );
  game.ui?.showSaveToast?.(
    isPlayer
      ? 'Commander killed — morale has collapsed. General Orders are unavailable; radio operators still control off-map support.'
      : 'Enemy commander killed — hostile morale has collapsed, but surviving radio operators can still call off-map support.'
  );
  game.ui?.updateFireSupport?.(game.fireSupport);
  game.ui?.updateGeneralOrders?.(game.generalOrders);
}

function holdEnemyCommander(game, commander) {
  if (commander.dead) return;
  // Let the AI finish entering (or remain inside) a shelter. Re-seeding the
  // normal hold order here would clear the bunker entry order every 0.45 s.
  if (
    commander._garrisonBunkerId ||
    commander._trenchId ||
    commander._diggingTrench ||
    (commander._aiCommanderMode === 'shelter' && commander._bunkerEntryId)
  ) return;
  const anchor = commander._aiCommanderAnchor ?? commander._commanderRearAnchor;
  if (!anchor) return;
  commander.engagementStance = 'hold';
  commander.defensiveHold = { ...anchor, radius: RETURN_RADIUS };

  const distance = Math.hypot(
    commander.position.x - anchor.x,
    commander.position.z - anchor.z
  );
  if (distance <= RETURN_RADIUS) return;
  commander.clearAttackOrder?.();
  commander.moveTo?.(
    anchor.x,
    anchor.z,
    game.mapDef,
    false,
    game.scenery
  );
}

export function updateFieldCommanders(game, dt) {
  game._fieldCommanderTick = (game._fieldCommanderTick ?? 0) - dt;
  if (game._fieldCommanderTick > 0) return;
  game._fieldCommanderTick = 0.45;

  for (const team of [PLAYER, ENEMY]) {
    const commander = getFieldCommander(game, team);
    if (!commander) continue;
    if (commander.dead) {
      if (!commander._commanderDeathHandled) announceLoss(game, commander);
      continue;
    }
    if (team === ENEMY) holdEnemyCommander(game, commander);
  }
}
