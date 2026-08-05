import { spawnUnitAt } from './Spawner.js';

const PLAYER = 'player';
const ENEMY = 'enemy';
const EDGE_INSET = 9;
const STARTING_REAR_OFFSET = 8;

/** Tactical support radius in game metres (the game map uses roughly 10 m/unit). */
export const RADIO_OPERATOR_SUPPORT_RANGE = 72;

export function isRadioOperator(unit) {
  return unit?.def?.type === 'radioOperator';
}

export function isRadioOperatorOperational(unit) {
  return (
    isRadioOperator(unit) &&
    !unit.dead &&
    !unit.surrendered &&
    !unit._captureExit &&
    !unit._dropping &&
    !unit.retreating &&
    !unit._mobilityDamaged
  );
}

export function getRadioOperators(units, team) {
  return (units ?? []).filter(
    (unit) => unit.team === team && isRadioOperatorOperational(unit)
  );
}

export function hasRadioOperator(game, team) {
  return getRadioOperators(game?.units, team).length > 0;
}

export function getRadioOperatorSupportRange(unit) {
  return Math.max(
    1,
    Number.isFinite(unit?.def?.supportRange)
      ? unit.def.supportRange
      : RADIO_OPERATOR_SUPPORT_RANGE
  );
}

/**
 * Shared radio observation rule used by fire support and AI relay planning.
 * `origin` is optional so the AI can test a proposed relay position without
 * teleporting the operator before the movement system applies the order.
 */
export function isRadioOperatorPointObserved(game, unit, x, z, origin = unit?.position) {
  if (!isRadioOperatorOperational(unit) || !origin) return false;
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;

  const observationRange = getRadioOperatorSupportRange(unit);
  if (Math.hypot(origin.x - x, origin.z - z) > observationRange) return false;
  if (
    game?.smokeScreens?.isLosObscured?.(
      origin.x,
      origin.z,
      x,
      z
    )
  ) {
    return false;
  }

  const observer = {
    position: origin,
    def: { type: 'infantry' },
    _garrisonBunkerId: unit._garrisonBunkerId,
  };
  const pointTarget = { position: { x, z } };
  return !game?.scenery?.isLineOfFireBlocked?.(observer, pointTarget);
}

function rearAssemblyAnchor(mapDef, team) {
  const own = team === PLAYER ? mapDef?.playerBase : mapDef?.enemyBase;
  const foe = team === PLAYER ? mapDef?.enemyBase : mapDef?.playerBase;
  if (!own || !foe) return null;

  let dx = own.x - foe.x;
  let dz = own.z - foe.z;
  const len = Math.hypot(dx, dz) || 1;
  dx /= len;
  dz /= len;

  const half = (mapDef.size ?? 120) * 0.5 - EDGE_INSET;
  const travel = Math.max(
    0,
    Math.min(
      ...[
        Math.abs(dx) > 0.001 ? (dx > 0 ? half - own.x : -half - own.x) / dx : Infinity,
        Math.abs(dz) > 0.001 ? (dz > 0 ? half - own.z : -half - own.z) / dz : Infinity,
      ]
    )
  );

  return {
    x: own.x + dx * Math.max(0, travel - STARTING_REAR_OFFSET),
    z: own.z + dz * Math.max(0, travel - STARTING_REAR_OFFSET),
  };
}

function faceEnemy(unit, mapDef, team) {
  if (!unit?.mesh || !mapDef) return;
  const foe = team === PLAYER ? mapDef.enemyBase : mapDef.playerBase;
  if (!foe) return;
  unit.mesh.rotation.y = Math.atan2(foe.x - unit.position.x, foe.z - unit.position.z);
}

/**
 * Ensure modes with a pre-deployed force have a working radio link. This is
 * intentionally separate from production: the operator is a normal unit once
 * the force exists, but old/custom rosters and tower defence still need the
 * same guaranteed starting capability.
 */
export function ensureStartingRadioOperators(game, teams = [PLAYER, ENEMY]) {
  if (!game?.units || !game.mapDef) return [];
  const added = [];

  for (const team of teams) {
    if (hasRadioOperator(game, team)) continue;
    const faction = team === PLAYER ? game.playerFaction : game.enemyFaction;
    const def = faction?.units?.radioOperator;
    const anchor = rearAssemblyAnchor(game.mapDef, team);
    if (!def || !anchor) continue;

    const unit = spawnUnitAt({
      def,
      faction,
      team,
      x: anchor.x,
      z: anchor.z,
      scene: game.scene,
      mapDef: game.mapDef,
      scenery: game.scenery,
    });
    if (!unit) continue;

    unit._radioOperatorStarting = true;
    unit._mapDef = game.mapDef;
    unit._terrainMesh = game._terrainMesh ?? null;
    unit.engagementStance = 'hold';
    unit.autoFire = true;
    faceEnemy(unit, game.mapDef, team);
    game.units.push(unit);
    added.push(unit);
  }

  return added;
}
