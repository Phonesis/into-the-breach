import * as THREE from 'three';
import { COVER_TYPES, formatCoverReduction, getCoverStatus } from '../game/CoverSystem.js';
import { isUnitGarrisoned } from '../game/BunkerGarrison.js';
import { sampleTerrainHeight } from '../world/Terrain.js';

const textureCache = new Map();

const TIER_STYLE = {
  heavy: { bg: '#14304a', border: '#5a9fd4', accent: '#8ec8ff' },
  medium: { bg: '#1e2e3a', border: '#6b8cae', accent: '#b8d0e0' },
  light: { bg: '#1e3228', border: '#7aa8b8', accent: '#b8e0d0' },
  garrison: { bg: '#1a2e1c', border: '#6bcf7a', accent: '#b8f0c0' },
};

function markerHeight(unit) {
  const base =
    unit.def?.type === 'sniper' ? 2.65 : unit.def?.type === 'machineGun' ? 2.55 : 2.45;
  return unit.retreating ? base + 1.35 : base;
}

function getCoverTexture(tier, reduction, garrisoned = false) {
  const styleKey = garrisoned ? 'garrison' : tier;
  const key = `${styleKey}-${reduction}`;
  if (textureCache.has(key)) return textureCache.get(key);

  const style = TIER_STYLE[styleKey] ?? TIER_STYLE.medium;
  const meta = garrisoned
    ? { shortLabel: 'Inside' }
    : COVER_TYPES[tier] ?? COVER_TYPES.medium;

  const canvas = document.createElement('canvas');
  canvas.width = 168;
  canvas.height = 76;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = style.bg;
  ctx.beginPath();
  ctx.roundRect(6, 8, 156, 60, 10);
  ctx.fill();
  ctx.strokeStyle = style.border;
  ctx.lineWidth = 3.5;
  ctx.stroke();

  ctx.fillStyle = style.accent;
  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(garrisoned ? 'INSIDE' : 'IN COVER', 84, 28);

  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.fillText(
    garrisoned ? `Building · −${reduction}% dmg` : `${meta.shortLabel} · −${reduction}%`,
    84,
    50
  );

  ctx.fillStyle = style.border;
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillText(garrisoned ? '⌂' : '⛨', 24, 32);

  const tex = new THREE.CanvasTexture(canvas);
  textureCache.set(key, tex);
  return tex;
}

function needsWorldSpaceMarker(unit) {
  return isUnitGarrisoned(unit) && unit.mesh && !unit.mesh.visible && !!unit.mesh.parent;
}

function reparentCoverMarker(unit) {
  if (!unit.coverMarker || !unit.mesh) return;
  const sprite = unit.coverMarker;
  const worldSpace = needsWorldSpaceMarker(unit);
  const desiredParent = worldSpace ? unit.mesh.parent : unit.mesh;
  if (!desiredParent) return;
  if (sprite.parent !== desiredParent) desiredParent.add(sprite);
  sprite.userData.worldSpace = worldSpace;
}

function updateCoverMarkerTransform(unit) {
  if (!unit.coverMarker) return;
  const bob = Math.sin(Date.now() * 0.004 + unit.id * 0.3) * 0.08;
  if (unit.coverMarker.userData.worldSpace) {
    const yBase = unit._mapDef
      ? sampleTerrainHeight(unit.position.x, unit.position.z, unit._mapDef)
      : unit.position.y;
    // High above bunker roof so INSIDE is obvious
    const lift = 5.4 + bob;
    unit.coverMarker.position.set(unit.position.x, yBase + lift, unit.position.z);
    unit.coverMarker.scale.set(4.4, 2.0, 1);
  } else {
    unit.coverMarker.position.set(0, markerHeight(unit) + bob, 0);
    unit.coverMarker.scale.set(3.6, 1.62, 1);
  }
  unit.coverMarker.visible = true;
}

export function attachCoverMarker(unit, status) {
  if (!unit.mesh || !status.inCover) return;

  const tier = status.tier ?? 'medium';
  const garrisoned = !!status.garrisoned;
  const tex = getCoverTexture(tier, status.reduction, garrisoned);

  if (!unit.coverMarker) {
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.name = 'coverMarker';
    sprite.scale.set(3.6, 1.62, 1);
    sprite.renderOrder = 26;
    unit.mesh.add(sprite);
    unit.coverMarker = sprite;
  } else if (unit.coverMarker.material.map !== tex) {
    unit.coverMarker.material.map = tex;
    unit.coverMarker.material.needsUpdate = true;
  }

  reparentCoverMarker(unit);
  updateCoverMarkerTransform(unit);
}

export function removeCoverMarker(unit) {
  if (!unit.coverMarker) return;
  if (unit.coverMarker.parent) unit.coverMarker.parent.remove(unit.coverMarker);
  unit.coverMarker.material?.dispose();
  unit.coverMarker = null;
}

export function syncCoverMarker(unit) {
  if (!unit.mesh || unit.dead) {
    removeCoverMarker(unit);
    return;
  }
  const status = getCoverStatus(unit);
  if (!status.inCover) {
    removeCoverMarker(unit);
    return;
  }
  attachCoverMarker(unit, status);
  updateCoverMarkerTransform(unit);
}

export function clearCoverMarkerCache() {
  for (const tex of textureCache.values()) tex.dispose();
  textureCache.clear();
}
