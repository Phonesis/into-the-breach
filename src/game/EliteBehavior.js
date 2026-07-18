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

  // Veteran: restrained bronze circular field with a single service chevron.
  ctx.fillStyle = 'rgba(35, 39, 22, 0.96)';
  ctx.beginPath();
  ctx.arc(32, 32, 28, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#c49645';
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.strokeStyle = '#f0c66f';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(16, 27);
  ctx.lineTo(32, 39);
  ctx.lineTo(48, 27);
  ctx.stroke();

  ctx.fillStyle = '#f6dda1';
  ctx.font = '900 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('V', 32, 16);

  _textures.veteran = new THREE.CanvasTexture(canvas);
  return _textures.veteran;
}

function getEliteTexture() {
  if (_textures.elite) return _textures.elite;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  // Elite: a pointed crimson shield with a crown. Its silhouette, colour and
  // icon remain visibly different from the veteran roundel at game scale.
  ctx.fillStyle = 'rgba(65, 12, 15, 0.97)';
  ctx.beginPath();
  ctx.moveTo(8, 10);
  ctx.lineTo(56, 10);
  ctx.lineTo(53, 40);
  ctx.quadraticCurveTo(48, 53, 32, 60);
  ctx.quadraticCurveTo(16, 53, 11, 40);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#ffd86a';
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.fillStyle = '#ffe58c';
  ctx.beginPath();
  ctx.moveTo(15, 20);
  ctx.lineTo(19, 9);
  ctx.lineTo(28, 18);
  ctx.lineTo(32, 6);
  ctx.lineTo(36, 18);
  ctx.lineTo(45, 9);
  ctx.lineTo(49, 20);
  ctx.lineTo(46, 27);
  ctx.lineTo(18, 27);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#ffe58c';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(20, 35);
  ctx.lineTo(32, 43);
  ctx.lineTo(44, 35);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(20, 44);
  ctx.lineTo(32, 52);
  ctx.lineTo(44, 44);
  ctx.stroke();

  ctx.fillStyle = '#4a090d';
  ctx.font = '900 10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('E', 32, 22);

  _textures.elite = new THREE.CanvasTexture(canvas);
  return _textures.elite;
}

function markerHeight(unit) {
  const t = unit.def?.type;
  if (t === 'tank' || t === 'tankDestroyer' || t === 'superHeavyTank') return 3.35;
  if (t === 'artillery' || t === 'antiTankGun') return 3.1;
  if (t === 'armoredCar') return 3.2;
  return 2.55;
}

function markerScale(unit) {
  return unit.elite ? 2.05 : 1.72;
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
