import * as THREE from 'three';
import { distanceBetween } from './Targeting.js';
import { clearRetreat } from './RetreatBehavior.js';
import { getMedicRetreatMultiplier } from './MedicBehavior.js';
import { getRankMoralePressure, removeRankMarker } from './EliteBehavior.js';
import { removeFieldIcon } from '../visual/UnitFieldIcons.js';
import { removeHealMarker } from '../visual/HealMarkers.js';
import { removeUnitHealthBar } from '../visual/UnitHealthBars.js';
import { removeCoverMarker } from '../visual/CoverMarkers.js';

const SURRENDER_ELIGIBLE = new Set([
  'infantry',
  'paratrooper',
  'machineGun',
  'sniper',
  'mortar',
  'medic',
  'engineer',
  'vehicleCrew',
  'antiTankGun',
]);

const ISOLATION_RADIUS = 28;
const CAPTURE_RADIUS = 11;
const LIBERATE_RADIUS = 11;
const CAPTURE_EXIT_SEC = 1.85;
const CAPTURE_EXIT_SPEED = 13;
const UNDER_FIRE_DECAY = 4.5;

const _surrenderTex = { tex: null };
const _statusTex = new Map();
const LIBERATED_BANNER_SEC = 2.6;

function getSurrenderTexture() {
  if (_surrenderTex.tex) return _surrenderTex.tex;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(28, 32, 42, 0.94)';
  ctx.beginPath();
  ctx.roundRect(8, 10, 112, 44, 8);
  ctx.fill();
  ctx.strokeStyle = '#e8e4dc';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SURRENDER', 64, 32);
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(92, 14, 18, 12);
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(101, 14);
  ctx.lineTo(101, 26);
  ctx.stroke();
  _surrenderTex.tex = new THREE.CanvasTexture(canvas);
  return _surrenderTex.tex;
}

function markerHeight(unit) {
  const t = unit.def?.type;
  if (t === 'tank' || t === 'tankDestroyer' || t === 'superHeavyTank') return 4.2;
  if (t === 'artillery' || t === 'antiTankGun') return 3.5;
  return 2.85;
}

function syncSurrenderMarkerTransform(unit) {
  const marker = unit?.surrenderMarker;
  const mesh = unit?.mesh;
  if (!marker || !mesh) return;
  const worldSpace = !!unit._garrisonBunkerId && !mesh.visible && !!mesh.parent;
  const desiredParent = worldSpace ? mesh.parent : mesh;
  if (marker.parent !== desiredParent) desiredParent.add(marker);
  marker.userData.worldSpace = worldSpace;
  const bob = Math.sin(performance.now() * 0.005) * 0.12;
  if (worldSpace) {
    const slotLift = Math.min(3, unit._garrisonSlotIndex ?? 0) * 0.16;
    marker.position.set(
      unit.position.x,
      (unit.position.y ?? 0) + (unit._garrisonMarkerLift ?? 6.6) + slotLift + bob,
      unit.position.z
    );
  } else {
    marker.position.set(0, markerHeight(unit) + bob, 0);
  }
}

export function attachSurrenderMarker(unit) {
  if (!unit.mesh || unit.surrenderMarker) return;
  const mat = new THREE.SpriteMaterial({
    map: getSurrenderTexture(),
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.name = 'surrenderMarker';
  sprite.scale.set(4.4, 2.2, 1);
  sprite.renderOrder = 27;
  unit.surrenderMarker = sprite;
  syncSurrenderMarkerTransform(unit);
}

export function removeSurrenderMarker(unit) {
  const marker = unit.surrenderMarker;
  if (!marker) return;
  if (marker.parent) marker.parent.remove(marker);
  marker.material?.dispose();
  unit.surrenderMarker = null;
}

function getStatusTexture(label) {
  if (_statusTex.has(label)) return _statusTex.get(label);
  const canvas = document.createElement('canvas');
  canvas.width = 140;
  canvas.height = 52;
  const ctx = canvas.getContext('2d');
  const captured = label === 'CAPTURED';
  ctx.fillStyle = captured ? 'rgba(48, 14, 14, 0.94)' : 'rgba(12, 42, 28, 0.94)';
  ctx.beginPath();
  ctx.roundRect(6, 8, 128, 36, 8);
  ctx.fill();
  ctx.strokeStyle = captured ? '#f87171' : '#6ee7a8';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.fillStyle = captured ? '#ffe4e4' : '#e8fff0';
  ctx.font = 'bold 17px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 70, 26);
  const tex = new THREE.CanvasTexture(canvas);
  _statusTex.set(label, tex);
  return tex;
}

export function attachStatusBanner(unit, label) {
  if (!unit?.mesh) return;
  removeStatusBanner(unit);
  const mat = new THREE.SpriteMaterial({
    map: getStatusTexture(label),
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.name = 'statusBanner';
  sprite.scale.set(label === 'LIBERATED' ? 4.6 : 4.9, 2.15, 1);
  sprite.position.y = markerHeight(unit) + 0.35;
  sprite.renderOrder = 28;
  unit.mesh.add(sprite);
  unit.statusBanner = sprite;
  unit.statusBannerLabel = label;
}

export function removeStatusBanner(unit) {
  const marker = unit.statusBanner;
  if (!marker) return;
  if (marker.parent) marker.parent.remove(marker);
  marker.material?.dispose();
  unit.statusBanner = null;
  unit.statusBannerLabel = null;
}

export function isSurrenderEligible(unit) {
  return !!unit && !unit.dead && SURRENDER_ELIGIBLE.has(unit.def?.type);
}

export function canUnitSurrender(unit, options = {}) {
  if (!isSurrenderEligible(unit)) return false;
  if (unit.surrendered || unit._captureExit) return false;
  if (unit.retreating || unit.defensiveHold) return false;
  if (unit._liberationGrace > 0) return false;
  if (options.tutorial || options.towerDefense) return false;
  if (options.clearance && unit.team === 'enemy') return false;
  return true;
}

function countNearby(unit, units, radius, predicate) {
  let n = 0;
  for (const other of units) {
    if (other.dead || other.id === unit.id) continue;
    if (other._captureExit) continue;
    if (distanceBetween(unit, other) > radius) continue;
    if (predicate(other)) n++;
  }
  return n;
}

function isIsolated(unit, units) {
  const allies = countNearby(unit, units, ISOLATION_RADIUS, (o) => o.team === unit.team && !o.surrendered);
  const enemies = countNearby(unit, units, ISOLATION_RADIUS, (o) => o.team !== unit.team);
  return allies === 0 && enemies >= 1;
}

function nearestAlly(unit, units, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const other of units) {
    if (other.dead || other.surrendered || other._captureExit) continue;
    if (other.team !== unit.team) continue;
    const d = distanceBetween(unit, other);
    if (d < bestD) {
      bestD = d;
      best = other;
    }
  }
  return best;
}

function nearestCaptor(unit, units, maxDist) {
  const captorTeam = unit.team === 'player' ? 'enemy' : 'player';
  let best = null;
  let bestD = maxDist;
  for (const other of units) {
    if (other.dead || other.surrendered || other._captureExit) continue;
    if (other.team !== captorTeam) continue;
    const d = distanceBetween(unit, other);
    if (d < bestD) {
      bestD = d;
      best = other;
    }
  }
  return best;
}

export function markUnderFire(unit) {
  if (!unit || unit.dead || unit.surrendered) return;
  unit._underFireTimer = UNDER_FIRE_DECAY;
}

export function startSurrender(unit) {
  clearRetreat(unit);
  unit.clearAttackOrder();
  unit.moveTarget = null;
  unit._movePath = null;
  unit._userMoveOrder = false;
  unit.surrendered = true;
  attachSurrenderMarker(unit);
}

export function clearSurrender(unit) {
  unit.surrendered = false;
  removeSurrenderMarker(unit);
}

export function liberateUnit(unit) {
  if (!unit?.surrendered) return;
  clearSurrender(unit);
  unit._underFireTimer = 0;
  unit._liberationGrace = 3;
  attachStatusBanner(unit, 'LIBERATED');
  unit._liberatedBannerUntil = performance.now() * 0.001 + LIBERATED_BANNER_SEC;
}

export function maybeTriggerSurrender(unit, units, options = {}, attacker = null) {
  if (!canUnitSurrender(unit, options)) return false;
  if (!isIsolated(unit, units)) return false;
  if ((unit._underFireTimer ?? 0) <= 0) return false;

  const ratio = unit.hp / Math.max(unit.maxHp, 1);
  let chance = 0.05;
  if (ratio < 0.35) chance = 0.3;
  else if (ratio < 0.55) chance = 0.18;
  else if (ratio < 0.75) chance = 0.1;

  if (unit.def.type === 'machineGun') chance *= 1.12;
  if (unit.def.type === 'medic' || unit.def.type === 'engineer') chance *= 1.18;
  if (unit.def.type === 'antiTankGun') chance *= 0.82;

  chance *= getMedicRetreatMultiplier(unit, units);
  chance *= getRankMoralePressure(unit, units, attacker);

  if (Math.random() < chance) {
    startSurrender(unit);
    return true;
  }
  return false;
}

function beginCaptureExit(unit, captor) {
  clearSurrender(unit);
  const dx = unit.position.x - captor.position.x;
  const dz = unit.position.z - captor.position.z;
  const len = Math.hypot(dx, dz) || 1;
  unit._captureExit = {
    timer: CAPTURE_EXIT_SEC,
    dirX: dx / len,
    dirZ: dz / len,
    captorTeam: captor.team,
  };
  unit.clearAttackOrder();
  unit.moveTarget = null;
  unit._movePath = null;
  unit._userMoveOrder = false;
  if (unit.selected) unit.setSelected(false);
  attachStatusBanner(unit, 'CAPTURED');
}

function restoreMeshOpacity(unit) {
  if (!unit.mesh) return;
  unit.mesh.traverse((child) => {
    if (!child.material) return;
    child.material.opacity = 1;
    child.material.transparent = child.material.map ? true : child.material.transparent;
  });
}

function updateCaptureExit(unit, dt) {
  const ex = unit._captureExit;
  if (!ex) return false;

  ex.timer -= dt;
  unit.position.x += ex.dirX * CAPTURE_EXIT_SPEED * dt;
  unit.position.z += ex.dirZ * CAPTURE_EXIT_SPEED * dt;

  const opacity = Math.max(0, ex.timer / CAPTURE_EXIT_SEC);
  unit.mesh?.traverse((child) => {
    if (!child.material) return;
    child.material.transparent = true;
    child.material.opacity = opacity;
  });

  if (unit.statusBanner) {
    unit.statusBanner.position.y =
      markerHeight(unit) + 0.35 + Math.sin(performance.now() * 0.005) * 0.1;
    unit.statusBanner.material.opacity = Math.max(0.35, opacity);
  }

  return ex.timer <= 0;
}

export function finalizeCapture(game, unit) {
  if (!unit || unit._captureFinalized) return;
  unit._captureFinalized = true;

  const captorTeam = unit._captureExit?.captorTeam;
  if (captorTeam) game.battleStats?.recordCapture(captorTeam, unit);
  game.battleStats?.recordUnit(unit);
  clearSurrender(unit);
  removeStatusBanner(unit);
  removeFieldIcon(unit);
  removeRankMarker(unit);
  removeHealMarker(unit);
  removeUnitHealthBar(unit);
  removeCoverMarker(unit);
  restoreMeshOpacity(unit);

  if (unit.mesh) {
    game.scene.remove(unit.mesh);
    unit.mesh.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material.dispose();
      }
    });
    unit.mesh = null;
  }

  unit.dead = true;
  unit._captureExit = null;
  game.units = game.units.filter((u) => u.id !== unit.id);
  game._rebuildUnitCaches?.();
}

export function updateSurrenderState(game, units, dt) {
  const options = {
    clearance: game.clearance,
    tutorial: game.tutorial,
    towerDefense: game.towerDefense,
  };

  const toFinalize = [];

  for (const unit of units) {
    if (unit.dead) continue;

    if (unit._underFireTimer > 0) unit._underFireTimer -= dt;
    if (unit._liberationGrace > 0) unit._liberationGrace -= dt;

    if (unit._liberatedBannerUntil) {
      const now = performance.now() * 0.001;
      if (now >= unit._liberatedBannerUntil) {
        removeStatusBanner(unit);
        unit._liberatedBannerUntil = 0;
      } else if (unit.statusBanner) {
        unit.statusBanner.position.y =
          markerHeight(unit) + 0.35 + Math.sin(performance.now() * 0.005) * 0.1;
      }
    }

    if (unit._captureExit) {
      if (updateCaptureExit(unit, dt)) toFinalize.push(unit);
      continue;
    }

    if (!unit.surrendered) continue;

    if (nearestAlly(unit, units, LIBERATE_RADIUS)) {
      liberateUnit(unit);
      continue;
    }

    const captor = nearestCaptor(unit, units, CAPTURE_RADIUS);
    if (captor) beginCaptureExit(unit, captor);

    if (unit.surrenderMarker) {
      syncSurrenderMarkerTransform(unit);
    }
  }

  for (const unit of toFinalize) finalizeCapture(game, unit);
}

export function syncSurrenderMarkers(units) {
  for (const unit of units) {
    if (unit.dead || unit._captureExit) {
      removeSurrenderMarker(unit);
      continue;
    }
    if (!unit.surrendered) {
      removeSurrenderMarker(unit);
      continue;
    }
    attachSurrenderMarker(unit);
  }
}
