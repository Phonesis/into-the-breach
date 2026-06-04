import * as THREE from 'three';
import { COVER_TYPES, formatCoverReduction, getCoverStatus } from '../game/CoverSystem.js';

const textureCache = new Map();

const TIER_STYLE = {
  heavy: { bg: '#14304a', border: '#5a9fd4', accent: '#8ec8ff' },
  medium: { bg: '#1e2e3a', border: '#6b8cae', accent: '#b8d0e0' },
  light: { bg: '#1e3228', border: '#7aa8b8', accent: '#b8e0d0' },
};

function markerHeight(unit) {
  const base =
    unit.def?.type === 'sniper' ? 2.65 : unit.def?.type === 'machineGun' ? 2.55 : 2.45;
  return unit.retreating ? base + 1.35 : base;
}

function getCoverTexture(tier, reduction) {
  const key = `${tier}-${reduction}`;
  if (textureCache.has(key)) return textureCache.get(key);

  const style = TIER_STYLE[tier] ?? TIER_STYLE.medium;
  const meta = COVER_TYPES[tier] ?? COVER_TYPES.medium;

  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 72;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = style.bg;
  ctx.beginPath();
  ctx.roundRect(6, 8, 148, 56, 10);
  ctx.fill();
  ctx.strokeStyle = style.border;
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = style.accent;
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('IN COVER', 80, 26);

  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.font = '600 14px system-ui, sans-serif';
  ctx.fillText(`${meta.shortLabel} · −${reduction}%`, 80, 48);

  ctx.fillStyle = style.border;
  ctx.font = '18px system-ui, sans-serif';
  ctx.fillText('⛨', 22, 30);

  const tex = new THREE.CanvasTexture(canvas);
  textureCache.set(key, tex);
  return tex;
}

export function attachCoverMarker(unit, status) {
  if (!unit.mesh || !status.inCover) return;

  const tier = status.tier ?? 'medium';
  const tex = getCoverTexture(tier, status.reduction);

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
    sprite.renderOrder = 24;
    unit.mesh.add(sprite);
    unit.coverMarker = sprite;
  } else if (unit.coverMarker.material.map !== tex) {
    unit.coverMarker.material.map = tex;
    unit.coverMarker.material.needsUpdate = true;
  }

  unit.coverMarker.visible = true;
  unit.coverMarker.position.y = markerHeight(unit);
}

export function removeCoverMarker(unit) {
  if (!unit.coverMarker) return;
  unit.mesh?.remove(unit.coverMarker);
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
  if (unit.coverMarker) {
    unit.coverMarker.position.y =
      markerHeight(unit) + Math.sin(Date.now() * 0.004 + unit.id * 0.3) * 0.08;
  }
}

export function clearCoverMarkerCache() {
  for (const tex of textureCache.values()) tex.dispose();
  textureCache.clear();
}