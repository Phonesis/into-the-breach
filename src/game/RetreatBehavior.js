import * as THREE from 'three';
import { hasReachedMoveDest } from '../world/Terrain.js';
import { getMedicRetreatMultiplier } from './MedicBehavior.js';
import { getEngineerRetreatMultiplier } from './EngineerBehavior.js';
import { getRankMoralePressure, getRankRetreatMultiplier } from './EliteBehavior.js';
import { getCommanderRetreatMultiplier } from './GeneralOrders.js';
import { getClearanceStagingAnchor } from './ClearanceMode.js';

const _retreatTex = { tex: null };

/**
 * Resolve the rally point for a retreating unit.
 * Clear Defenses has no player HQ — fall back to the starting/staging zone.
 * @param {object} unit
 * @param {object[]} hqs
 * @param {{ clearance?: boolean, mapDef?: object|null }} [opts]
 */
export function resolveRetreatHq(unit, hqs, opts = {}) {
  if (opts.clearance && unit?.team === 'player' && opts.mapDef) {
    return getClearanceStagingAnchor(opts.mapDef);
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
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('RETREAT', 64, 32);
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
  if (!unit.mesh || unit.retreatMarker) return;
  const mat = new THREE.SpriteMaterial({
    map: getRetreatTexture(),
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.name = 'retreatMarker';
  sprite.scale.set(4.2, 2.1, 1);
  sprite.position.y = unit.def.type === 'tank' ? 4.2 : unit.def.type === 'artillery' ? 3.8 : 2.8;
  sprite.renderOrder = 25;
  unit.mesh.add(sprite);
  unit.retreatMarker = sprite;
}

export function removeRetreatMarker(unit) {
  const marker = unit.retreatMarker;
  if (!marker) return;
  if (marker.parent) marker.parent.remove(marker);
  unit.retreatMarker.material?.dispose();
  unit.retreatMarker = null;
}

export function startRetreat(unit, hq) {
  if (!hq || hq.dead || unit.dead || unit.retreating) return;
  unit.retreating = true;
  unit.clearAttackOrder();
  unit.moveTarget = { x: hq.position.x, z: hq.position.z };
  attachRetreatMarker(unit);
}

export function clearRetreat(unit) {
  unit.retreating = false;
  removeRetreatMarker(unit);
}

/**
 * Random panic retreat toward friendly HQ (or clearance staging) after taking fire.
 * @param {object|null} [opts] — { generalOrders, clearance, mapDef } or a GeneralOrdersManager (legacy)
 */
export function maybeTriggerRetreat(unit, hqs, units = [], attacker = null, opts = null) {
  if (unit.dead || unit.retreating || unit.defensiveHold) return;

  // Back-compat: fifth arg used to be generalOrders manager directly
  const options =
    opts && typeof opts === 'object' && ('generalOrders' in opts || 'clearance' in opts || 'mapDef' in opts)
      ? opts
      : { generalOrders: opts };

  const hq = resolveRetreatHq(unit, hqs, {
    clearance: options.clearance,
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

  chance *= getMedicRetreatMultiplier(unit, units);
  chance *= getEngineerRetreatMultiplier(unit, units);
  chance *= getRankRetreatMultiplier(unit);
  chance *= getRankMoralePressure(unit, units, attacker);
  chance *= getCommanderRetreatMultiplier(unit, options.generalOrders);

  if (Math.random() < chance) {
    startRetreat(unit, hq);
  }
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

  if (!hq || hq.dead) {
    clearRetreat(unit);
    unit.moveTarget = null;
    return;
  }

  const hqDest = { x: hq.position.x, z: hq.position.z };
  unit.moveTarget = hqDest;

  const dx = unit.position.x - hq.position.x;
  const dz = unit.position.z - hq.position.z;
  const dist = Math.hypot(dx, dz);

  const reachedHq =
    dist < 18 ||
    (mapDef &&
      hasReachedMoveDest(unit, hqDest, mapDef, 3.5, 5.5)) ||
    (!unit.moveTarget && dist < 24);

  if (reachedHq) {
    clearRetreat(unit);
    unit.moveTarget = null;
    unit._movePath = null;
    return;
  }

  if (unit.retreatMarker) {
    unit.retreatMarker.position.y =
      (unit.def.type === 'tank' ? 4.2 : unit.def.type === 'artillery' ? 3.8 : 2.8) +
      Math.sin(Date.now() * 0.006) * 0.15;
  }
}