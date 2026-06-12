import * as THREE from 'three';
import { distanceBetween } from './Targeting.js';

export const VETERAN_KILLS_REQUIRED = 1;
export const ELITE_KILLS_REQUIRED = 3;

export const VETERAN_DAMAGE_MULT = 1.09;
export const VETERAN_RETREAT_RESISTANCE = 0.62;
export const VETERAN_ATTACK_MORALE_MULT = 1.22;
export const VETERAN_PROXIMITY_MORALE_MULT = 1.06;

export const ELITE_DAMAGE_MULT = 1.18;
export const ELITE_RETREAT_RESISTANCE = 0.38;
export const ELITE_ATTACK_MORALE_MULT = 1.45;
export const ELITE_PROXIMITY_MORALE_MULT = 1.12;

export const RANK_PROXIMITY_RADIUS = 32;

const _textures = { veteran: null, elite: null };

function getVeteranTexture() {
  if (_textures.veteran) return _textures.veteran;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = 'rgba(28, 22, 8, 0.94)';
  ctx.beginPath();
  ctx.arc(32, 32, 28, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#d4a830';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = '#ffd966';
  ctx.beginPath();
  ctx.moveTo(32, 10);
  ctx.lineTo(36.5, 24);
  ctx.lineTo(51, 24);
  ctx.lineTo(39.5, 33);
  ctx.lineTo(44, 48);
  ctx.lineTo(32, 39);
  ctx.lineTo(20, 48);
  ctx.lineTo(24.5, 33);
  ctx.lineTo(13, 24);
  ctx.lineTo(27.5, 24);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#3d2e08';
  ctx.font = 'bold 9px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('VET', 32, 54);

  _textures.veteran = new THREE.CanvasTexture(canvas);
  return _textures.veteran;
}

function getEliteTexture() {
  if (_textures.elite) return _textures.elite;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = 'rgba(18, 14, 6, 0.96)';
  ctx.beginPath();
  ctx.arc(32, 32, 28, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#f5d060';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 220, 120, 0.55)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(32, 32, 22, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#ffe566';
  ctx.beginPath();
  ctx.moveTo(32, 8);
  ctx.lineTo(37, 23);
  ctx.lineTo(53, 23);
  ctx.lineTo(40.5, 32);
  ctx.lineTo(45.5, 48);
  ctx.lineTo(32, 38);
  ctx.lineTo(18.5, 48);
  ctx.lineTo(23.5, 32);
  ctx.lineTo(11, 23);
  ctx.lineTo(27, 23);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#2a1e06';
  ctx.font = 'bold 8px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ELITE', 32, 54);

  _textures.elite = new THREE.CanvasTexture(canvas);
  return _textures.elite;
}

function markerHeight(unit) {
  const t = unit.def?.type;
  if (t === 'tank' || t === 'superHeavyTank') return 3.35;
  if (t === 'artillery' || t === 'antiTankGun') return 3.1;
  if (t === 'armoredCar') return 3.2;
  return 2.55;
}

function markerScale(unit) {
  return unit.elite ? 1.85 : 1.75;
}

export function isVeteran(unit) {
  return !!unit?.veteran;
}

export function isElite(unit) {
  return !!unit?.elite;
}

export function getRankDamageMultiplier(attacker) {
  if (isElite(attacker)) return ELITE_DAMAGE_MULT;
  if (isVeteran(attacker)) return VETERAN_DAMAGE_MULT;
  return 1;
}

export function getRankRetreatMultiplier(unit) {
  if (isElite(unit)) return ELITE_RETREAT_RESISTANCE;
  if (isVeteran(unit)) return VETERAN_RETREAT_RESISTANCE;
  return 1;
}

function countNearbyEnemyRanks(unit, units, radius = RANK_PROXIMITY_RADIUS) {
  let veterans = 0;
  let elites = 0;
  for (const other of units) {
    if (other.dead || other.team === unit.team) continue;
    if (distanceBetween(unit, other) > radius) continue;
    if (other.elite) elites++;
    else if (other.veteran) veterans++;
  }
  return { veterans, elites };
}

export function getRankMoralePressure(unit, units, attacker = null) {
  let mult = 1;
  if (isElite(attacker)) mult *= ELITE_ATTACK_MORALE_MULT;
  else if (isVeteran(attacker)) mult *= VETERAN_ATTACK_MORALE_MULT;

  const { veterans, elites } = countNearbyEnemyRanks(unit, units);
  if (veterans > 0) {
    mult *= 1 + (VETERAN_PROXIMITY_MORALE_MULT - 1) * Math.min(veterans, 3);
  }
  if (elites > 0) {
    mult *= 1 + (ELITE_PROXIMITY_MORALE_MULT - 1) * Math.min(elites, 3);
  }
  return mult;
}

function rankTexture(unit) {
  return unit.elite ? getEliteTexture() : getVeteranTexture();
}

function attachRankMarker(unit) {
  if (!unit.mesh || !unit.veteran) return;

  if (unit.rankMarker) {
    unit.rankMarker.material.map = rankTexture(unit);
    unit.rankMarker.material.needsUpdate = true;
    unit.rankMarker.scale.set(markerScale(unit), markerScale(unit), 1);
    return;
  }

  const mat = new THREE.SpriteMaterial({
    map: rankTexture(unit),
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.name = 'rankMarker';
  const scale = markerScale(unit);
  sprite.scale.set(scale, scale, 1);
  sprite.position.set(1.65, markerHeight(unit), 0);
  sprite.renderOrder = 24;
  unit.mesh.add(sprite);
  unit.rankMarker = sprite;
}

export function removeRankMarker(unit) {
  const marker = unit.rankMarker;
  if (!marker) return;
  if (marker.parent) marker.parent.remove(marker);
  marker.material?.dispose();
  unit.rankMarker = null;
}

export function grantVeteranStatus(unit) {
  if (!unit || unit.dead || unit.veteran) return;
  unit.veteran = true;
  attachRankMarker(unit);
}

export function grantEliteStatus(unit) {
  if (!unit || unit.dead || unit.elite) return;
  unit.veteran = true;
  unit.elite = true;
  attachRankMarker(unit);
}

export function recordEnemyKill(attacker, target) {
  if (!attacker || attacker.dead || !target?.def) return;
  if (target.team === attacker.team || target.surrendered) return;

  attacker.killCount = (attacker.killCount ?? 0) + 1;
  if (!attacker.veteran && attacker.killCount >= VETERAN_KILLS_REQUIRED) {
    grantVeteranStatus(attacker);
  }
  if (!attacker.elite && attacker.killCount >= ELITE_KILLS_REQUIRED) {
    grantEliteStatus(attacker);
  }
}

export function syncRankMarkers(units) {
  for (const unit of units) {
    if (unit.dead || unit._captureExit) {
      removeRankMarker(unit);
      continue;
    }
    if (!unit.veteran) {
      removeRankMarker(unit);
      continue;
    }
    attachRankMarker(unit);
    if (unit.rankMarker) {
      unit.rankMarker.position.y = markerHeight(unit);
      unit.rankMarker.position.x = 1.65;
      unit.rankMarker.scale.set(markerScale(unit), markerScale(unit), 1);
    }
  }
}

export function updateRankMarkers(units) {
  const pulse = Math.sin(performance.now() * 0.004) * 0.08;
  for (const unit of units) {
    if (!unit.veteran || !unit.rankMarker) continue;
    unit.rankMarker.position.y = markerHeight(unit) + pulse;
  }
}
