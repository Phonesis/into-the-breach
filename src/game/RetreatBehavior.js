import * as THREE from 'three';
import { hasReachedMoveDest } from '../world/Terrain.js';
import { getMedicRetreatMultiplier } from './MedicBehavior.js';
import { getEngineerRetreatMultiplier } from './EngineerBehavior.js';
import { getRankMoralePressure, getRankRetreatMultiplier } from './EliteBehavior.js';
import { getCommanderRetreatMultiplier } from './GeneralOrders.js';
import { getCommanderMoraleMultiplier } from './CommanderBehavior.js';
import { getClearanceStagingAnchor } from './ClearanceMode.js';
import { getCoverStatus } from './CoverSystem.js';
import { applyObstaclePath } from './MovePath.js';
import { sounds } from '../audio/SoundManager.js';
import { isTankType } from '../units/VehicleTypes.js';
import { areUnitStatusMarkersVisible } from '../visual/UnitStatusVisibility.js';
import {
  layoutUnitOverheadMarkers,
  setOverheadSpriteY,
} from '../visual/UnitOverheadLayout.js';

const _retreatTex = { tex: null };

/** Arrival radius for a full-retreat rally slot around the HQ / staging zone. */
export const FULL_RETREAT_RALLY_ARRIVAL_DIST = 4.5;

/** Recent off-map / prepared-position HE leaves troops more shaken for a short time. */
export const FIRE_SUPPORT_RETREAT_PRESSURE_SEC = 4.5;
export const FIRE_SUPPORT_RETREAT_PRESSURE_MULT = 1.32;

function nowSeconds() {
  return (globalThis.performance?.now?.() ?? Date.now()) * 0.001;
}

/** Mark a living unit as recently rattled by a nearby fire-support impact. */
export function markFireSupportRetreatPressure(unit) {
  if (!unit || unit.dead || unit.surrendered) return;
  unit._fireSupportRetreatPressureUntil = Math.max(
    unit._fireSupportRetreatPressureUntil ?? 0,
    nowSeconds() + FIRE_SUPPORT_RETREAT_PRESSURE_SEC
  );
}

function hasRecentFireSupportRetreatPressure(unit) {
  return (unit?._fireSupportRetreatPressureUntil ?? 0) > nowSeconds();
}

/**
 * Fighting from a prepared position improves cohesion as well as survivability.
 * These remain multipliers rather than immunity: a badly mauled unit can still
 * break, and the existing health, rank, leader, and support modifiers continue
 * to stack normally.
 */
export function getCoverRetreatMultiplier(unit) {
  const cover = getCoverStatus(unit);
  if (!cover.inCover) return 1;
  if (cover.garrisoned) return 0.12;
  if (cover.tier === 'heavy') return 0.22;
  if (cover.inTrench || cover.tier === 'trench') return 0.3;
  return 1;
}

/**
 * Resolve the rally point for a retreating unit.
 * Clear Defenses has no player HQ — fall back to the starting/staging zone.
 * @param {object} unit
 * @param {object[]} hqs
 * @param {{ clearance?: boolean, mapDef?: object|null }} [opts]
 */
export function resolveRetreatHq(unit, hqs, opts = {}) {
  if (opts.clearance && unit?.team === 'player' && opts.mapDef) {
    return getClearanceStagingAnchor(opts.mapDef, opts.clearanceRole ?? 'attack');
  }
  return hqs?.find((h) => h.team === unit.team && !h.dead) ?? null;
}

function getRetreatTexture() {
  if (_retreatTex.tex) return _retreatTex.tex;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(180, 40, 30, 0.92)';
  ctx.beginPath();
  ctx.roundRect(8, 10, 112, 44, 8);
  ctx.fill();
  ctx.strokeStyle = '#ffcc66';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = '#ffe8a0';
  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('RETREATING', 64, 32);
  ctx.fillStyle = '#ff6622';
  ctx.beginPath();
  ctx.moveTo(64, 2);
  ctx.lineTo(52, 10);
  ctx.lineTo(76, 10);
  ctx.closePath();
  ctx.fill();
  _retreatTex.tex = new THREE.CanvasTexture(canvas);
  return _retreatTex.tex;
}

export function attachRetreatMarker(unit) {
  if (!areUnitStatusMarkersVisible() || !unit.mesh || unit.retreatMarker) return;
  const mat = new THREE.SpriteMaterial({
    map: getRetreatTexture(),
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.name = 'retreatMarker';
  sprite.scale.set(4.2, 2.1, 1);
  setOverheadSpriteY(
    sprite,
    unit.def.type === 'tank' ? 4.2 : unit.def.type === 'artillery' ? 3.8 : 2.8
  );
  sprite.renderOrder = 25;
  unit.mesh.add(sprite);
  unit.retreatMarker = sprite;
  layoutUnitOverheadMarkers(unit);
}

export function removeRetreatMarker(unit) {
  const marker = unit.retreatMarker;
  if (!marker) return;
  if (marker.parent) marker.parent.remove(marker);
  unit.retreatMarker.material?.dispose();
  unit.retreatMarker = null;
  layoutUnitOverheadMarkers(unit);
}

export function syncRetreatMarkers(units) {
  for (const unit of units ?? []) {
    if (!unit?.retreating || unit.dead || !areUnitStatusMarkersVisible()) {
      removeRetreatMarker(unit);
      continue;
    }
    attachRetreatMarker(unit);
  }
}

function queueImmobileTankSurrender(unit) {
  clearRetreat(unit);
  unit._surrenderOnRetreat = true;
  unit.clearAttackOrder();
  unit.target = null;
  unit.moveTarget = null;
  unit._movePath = null;
  unit._finalMoveGoal = null;
  unit._userMoveOrder = false;
  unit._reverseMoveOrder = false;
}

/** Resolve the current retreat waypoint, including a full-retreat rally slot. */
export function getRetreatDestination(unit, hq) {
  const destination = unit?._retreatDestination;
  if (
    destination &&
    Number.isFinite(destination.x) &&
    Number.isFinite(destination.z)
  ) {
    return destination;
  }
  return hq?.position
    ? { x: hq.position.x, z: hq.position.z }
    : null;
}

/**
 * Begin retreat toward HQ / staging. When mapDef + scenery are provided, path
 * around buildings instead of walking straight into them.
 * @param {object} unit
 * @param {object} hq
 * @param {{ mapDef?: object, scenery?: object, voiceDelay?: number, playVoice?: boolean,
 *   destination?: {x:number,z:number}, fullRetreatOrderId?: string,
 *   retargetActive?: boolean }} [options]
 */
export function startRetreat(unit, hq, options = {}) {
  if (!hq || !hq.position || hq.dead || unit.dead) return;
  const wasRetreating = !!unit.retreating;
  if (wasRetreating && !options.retargetActive) return;

  // A broken-track tank cannot reach the rally point. Queue the existing tank
  // crew-bailout surrender flow instead of leaving it permanently marked as
  // retreating with no movement possible. SurrenderBehavior resolves this on
  // the next simulation tick, when the game callback can spawn the crew.
  if (unit._mobilityDamaged && isTankType(unit.def?.type)) {
    queueImmobileTankSurrender(unit);
    return;
  }

  unit.retreating = true;
  if (options.fullRetreatOrderId) {
    unit._fullRetreatOrderId = options.fullRetreatOrderId;
    unit._fullRetreatRallyHold = true;
  } else {
    unit._fullRetreatOrderId = null;
    unit._fullRetreatRallyHold = false;
  }
  unit.clearAttackOrder();
  unit._bunkerEntryId = null;
  unit._userMoveOrder = false;
  const destination = getRetreatDestination(
    { _retreatDestination: options.destination },
    hq
  );
  unit._retreatDestination = destination;
  unit._retreatArrivalRadius = options.fullRetreatOrderId
    ? FULL_RETREAT_RALLY_ARRIVAL_DIST
    : null;
  unit._finalMoveGoal = destination;
  unit._pathRepathAttempts = 0;
  unit._autoMoveOrderX = destination.x;
  unit._autoMoveOrderZ = destination.z;
  const mapDef = options.mapDef ?? unit._mapDef ?? null;
  const scenery = options.scenery ?? null;
  if (mapDef && scenery) {
    const routed = applyObstaclePath(
      unit,
      destination.x,
      destination.z,
      mapDef,
      scenery
    );
    if (routed && unit._finalMoveGoal) {
      // Urban road snapping may move the final waypoint away from the raw
      // ring coordinate. Treat the actual routed endpoint as the slot so the
      // arrival test does not keep re-seeding a valid path.
      unit._retreatDestination = { ...unit._finalMoveGoal };
    }
    if (!routed) {
      unit._movePath = null;
      unit.moveTarget = { ...destination };
    }
  } else {
    unit._movePath = null;
    unit.moveTarget = { ...destination };
  }
  attachRetreatMarker(unit);
  // A full-retreat order already has one commander acknowledgement. Keep the
  // faction-specific unit call for organic morale breaks, but do not launch a
  // second call for every unit in a command-wide withdrawal.
  if (!wasRetreating && options.playVoice !== false) {
    const factionId =
      unit.faction?.id ?? unit.faction?.factionId ?? unit.def?.factionId ?? null;
    const recentlyCalledUnderFire =
      performance.now() - (unit._lastUnderFireVoiceAt ?? -Infinity) < 450;
    sounds.playRetreat(
      { x: unit.position.x, z: unit.position.z },
      factionId,
      {
        team: unit.team,
        radio: unit.team === 'player',
        unitType: unit.def?.type,
        // Let an immediately preceding hit reaction finish before the withdrawal call.
        delay: Math.max(options.voiceDelay ?? 0, recentlyCalledUnderFire ? 1.05 : 0),
      }
    );
  }
}

export function clearRetreat(unit, options = {}) {
  const preserveFullRetreat =
    options.preserveFullRetreat === true &&
    !!(unit._fullRetreatOrderId || unit._fullRetreatRallyHold);
  unit.retreating = false;
  unit._surrenderOnRetreat = false;
  removeRetreatMarker(unit);
  if (!preserveFullRetreat) {
    unit._fullRetreatOrderId = null;
    unit._fullRetreatRallyHold = false;
    unit._retreatDestination = null;
    unit._retreatArrivalRadius = null;
  }
}

/**
 * Random panic retreat toward friendly HQ (or clearance staging) after taking fire.
 * @param {object|null} [opts] — { generalOrders, clearance, mapDef } or a GeneralOrdersManager (legacy)
 */
export function maybeTriggerRetreat(unit, hqs, units = [], attacker = null, opts = null) {
  if (
    unit.dead ||
    unit.retreating ||
    unit.defensiveHold ||
    unit._fullRetreatRallyHold
  ) return;

  // Back-compat: fifth arg used to be generalOrders manager directly
  const options =
    opts &&
    typeof opts === 'object' &&
    ('generalOrders' in opts || 'clearance' in opts || 'mapDef' in opts || 'scenery' in opts)
      ? opts
      : { generalOrders: opts };

  const hq = resolveRetreatHq(unit, hqs, {
    clearance: options.clearance,
    clearanceRole: options.clearanceRole,
    mapDef: options.mapDef,
  });
  if (!hq) return;

  const ratio = unit.hp / unit.maxHp;
  let chance = 0.05;
  if (ratio < 0.3) chance = 0.32;
  else if (ratio < 0.5) chance = 0.2;
  else if (ratio < 0.7) chance = 0.11;

  if (unit.def.type === 'tank') chance *= 0.45;
  if (unit.def.type === 'artillery' || unit.def.type === 'antiTankGun') chance *= 0.55;
  if (unit.def.type === 'machineGun') chance *= 1.1;
  if (hasRecentFireSupportRetreatPressure(unit)) {
    chance *= FIRE_SUPPORT_RETREAT_PRESSURE_MULT;
  }

  chance *= getMedicRetreatMultiplier(unit, units);
  chance *= getEngineerRetreatMultiplier(unit, units);
  chance *= getRankRetreatMultiplier(unit);
  chance *= getRankMoralePressure(unit, units, attacker);
  chance *= getCommanderMoraleMultiplier(unit, units);
  chance *= getCommanderRetreatMultiplier(unit, options.generalOrders);
  chance *= getCoverRetreatMultiplier(unit);

  if (Math.random() < chance) {
    startRetreat(unit, hq, {
      mapDef: options.mapDef ?? unit._mapDef ?? null,
      scenery: options.scenery ?? null,
    });
  }
}

/**
 * Apply the shared morale response after an airstrike or barrage has damaged
 * a unit. The marker also affects a follow-up retreat check for a few seconds.
 */
export function handleFireSupportImpactMorale(unit, hqs, units = [], opts = {}) {
  if (!unit?.def || unit.dead || unit.surrendered) return;
  markFireSupportRetreatPressure(unit);
  maybeTriggerRetreat(unit, hqs, units, null, opts);
}

export function updateRetreatState(unit, hq, mapDef) {
  if (unit.dead) {
    clearRetreat(unit);
    return;
  }

  if (!unit.retreating) {
    removeRetreatMarker(unit);
    return;
  }

  // Mobility can fail after the withdrawal has already begun. Convert that
  // active retreat through the same queued surrender path as a fresh trigger.
  if (unit._mobilityDamaged && isTankType(unit.def?.type)) {
    queueImmobileTankSurrender(unit);
    return;
  }

  if (!hq || hq.dead) {
    clearRetreat(unit);
    unit.moveTarget = null;
    return;
  }

  const hqDest = { x: hq.position.x, z: hq.position.z };
  const retreatDest = getRetreatDestination(unit, hq) ?? hqDest;
  unit._finalMoveGoal = retreatDest;
  // Keep an existing building-aware path; only re-issue if lost.
  if (!unit.moveTarget && !unit._movePath?.length) {
    unit.moveTarget = { ...retreatDest };
  }

  const dx = unit.position.x - retreatDest.x;
  const dz = unit.position.z - retreatDest.z;
  const dist = Math.hypot(dx, dz);

  const fullRetreatSlot = !!(
    unit._fullRetreatOrderId || unit._fullRetreatRallyHold
  );
  const reachedHq = fullRetreatSlot
    ? dist < (unit._retreatArrivalRadius ?? FULL_RETREAT_RALLY_ARRIVAL_DIST) ||
      (mapDef &&
        hasReachedMoveDest(
          unit,
          retreatDest,
          mapDef,
          unit._retreatArrivalRadius ?? FULL_RETREAT_RALLY_ARRIVAL_DIST,
          5.5
        )) ||
      (!unit.moveTarget && dist < 6)
    : Math.hypot(unit.position.x - hq.position.x, unit.position.z - hq.position.z) < 18 ||
      (mapDef &&
        hasReachedMoveDest(unit, hqDest, mapDef, 3.5, 5.5)) ||
      (!unit.moveTarget && dist < 24);

  if (reachedHq) {
    clearRetreat(unit, { preserveFullRetreat: fullRetreatSlot });
    unit.moveTarget = null;
    unit._movePath = null;
    unit._finalMoveGoal = null;
    return;
  }

  if (unit.retreatMarker) {
    setOverheadSpriteY(
      unit.retreatMarker,
      (unit.def.type === 'tank' ? 4.2 : unit.def.type === 'artillery' ? 3.8 : 2.8) +
        Math.sin(Date.now() * 0.006) * 0.15
    );
    layoutUnitOverheadMarkers(unit);
  }
}
