import { spawnUnitAt } from './Spawner.js';

const PLAYER = 'player';
const ENEMY = 'enemy';
const EDGE_INSET = 9;
const STARTING_REAR_OFFSET = 8;

/** Tactical support radius in game metres (the game map uses roughly 10 m/unit). */
export const RADIO_OPERATOR_SUPPORT_RANGE = 72;

/** Hard cap on living radio operators per side in every mode. */
export const MAX_RADIO_OPERATORS_PER_SIDE = 3;

/** Living (non-dead) radio operators on a team. */
export function countRadioOperators(units, team) {
  let n = 0;
  for (const unit of units ?? []) {
    if (!unit || unit.dead || unit.team !== team) continue;
    if (unit.def?.type === 'radioOperator') n += 1;
  }
  return n;
}

/**
 * Whether another radio operator may be trained/placed for this team.
 * `queued` counts radio jobs already in the production queue.
 */
export function canAddRadioOperator(units, team, { queued = 0 } = {}) {
  return countRadioOperators(units, team) + Math.max(0, queued) < MAX_RADIO_OPERATORS_PER_SIDE;
}

/** Binocular scan: extended observation for calling fire support. */
export const RADIO_BINOCULAR_SUPPORT_RANGE = 112;
/** Active scan duration (seconds). */
export const RADIO_BINOCULAR_DURATION = 45;
/** Cooldown after activating binoculars (seconds). */
export const RADIO_BINOCULAR_COOLDOWN = 180;

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

export function isRadioOperatorUsingBinoculars(unit) {
  return isRadioOperatorOperational(unit) && (unit._binocularActive ?? 0) > 0;
}

export function getRadioOperatorBinocularCooldown(unit) {
  return Math.max(0, unit?._binocularCooldown ?? 0);
}

export function canUseRadioBinoculars(unit) {
  return (
    isRadioOperatorOperational(unit) &&
    (unit._binocularActive ?? 0) <= 0 &&
    (unit._binocularCooldown ?? 0) <= 0
  );
}

/**
 * Raise binoculars: extended support observation for RADIO_BINOCULAR_DURATION.
 * The 3-minute cooldown starts only after a fire-support order is called while
 * the scan is active (see finishRadioBinocularsAfterSupportCall).
 */
export function activateRadioBinoculars(unit) {
  if (!canUseRadioBinoculars(unit)) return false;
  unit._binocularActive = RADIO_BINOCULAR_DURATION;
  unit._binocularCooldown = 0;
  return true;
}

/**
 * After a successful fire-support call: any team radio that was scanning and
 * could observe the aim point ends its scan and starts the 3-minute cooldown.
 * Returns how many operators were locked out.
 */
export function finishRadioBinocularsAfterSupportCall(game, team, x, z) {
  if (!game || !Number.isFinite(x) || !Number.isFinite(z)) return 0;
  let used = 0;
  for (const unit of getRadioOperators(game.units, team)) {
    if ((unit._binocularActive ?? 0) <= 0) continue;
    // Only operators that actually covered this target with the extended scan
    if (!isRadioOperatorPointObserved(game, unit, x, z)) continue;
    unit._binocularActive = 0;
    unit._binocularCooldown = RADIO_BINOCULAR_COOLDOWN;
    used += 1;
  }
  return used;
}

/** Tick binocular active windows and cooldowns for all radio operators. */
export function updateRadioOperatorBinoculars(units, dt) {
  if (!units?.length || !(dt > 0)) return;
  for (const unit of units) {
    if (!isRadioOperator(unit) || unit.dead) continue;
    if ((unit._binocularActive ?? 0) > 0) {
      unit._binocularActive = Math.max(0, unit._binocularActive - dt);
      // Scan window ended without a support call — no cooldown; can raise again
    }
    if ((unit._binocularCooldown ?? 0) > 0) {
      unit._binocularCooldown = Math.max(0, unit._binocularCooldown - dt);
    }
  }
}

export function getRadioOperatorSupportRange(unit) {
  const base = Math.max(
    1,
    Number.isFinite(unit?.def?.supportRange)
      ? unit.def.supportRange
      : RADIO_OPERATOR_SUPPORT_RANGE
  );
  if (isRadioOperatorUsingBinoculars(unit)) {
    return Math.max(base, RADIO_BINOCULAR_SUPPORT_RANGE);
  }
  return base;
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
  // Aiming on a roof/building is a valid fire-support call. Pass the building as
  // the ordered target so LOS does not self-block on that structure (same rule as
  // Shift-fire on scenery). Buildings *between* radio and aim still block.
  const targetBuilding = game?.scenery?.findBlockingBuildingAt?.(x, z) ?? null;
  const pointTarget = targetBuilding
    ? { position: { x, z }, entry: targetBuilding }
    : { position: { x, z } };
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
