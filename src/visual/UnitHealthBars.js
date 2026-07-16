import * as THREE from 'three';
import { isUnitGarrisoned } from '../game/BunkerGarrison.js';
import { sampleTerrainHeight } from '../world/Terrain.js';

const BAR_Y = {
  infantry: 2.2,
  medic: 2.2,
  engineer: 2.2,
  vehicleCrew: 2.2,
  machineGun: 2.3,
  sniper: 2.45,
  mortar: 2.35,
  antiTankGun: 2.55,
  armoredCar: 2.95,
  tank: 3.75,
  superHeavyTank: 4.25,
  artillery: 3.35,
};

const BAR_WIDTH = {
  infantry: 2.4,
  medic: 2.4,
  engineer: 2.4,
  vehicleCrew: 2.4,
  machineGun: 2.5,
  sniper: 2.5,
  mortar: 2.6,
  antiTankGun: 2.7,
  armoredCar: 2.9,
  tank: 3.5,
  superHeavyTank: 3.9,
  artillery: 3.2,
};

function barYOffset(unit) {
  let y = BAR_Y[unit.def?.type] ?? 2.25;
  if (unit.retreating) y += 2.3;
  if (unit.coverMarker?.visible) y += 1.7;
  if (unit.fieldIcon?.visible) y += 1.1;
  if (unit.healMarker?.visible) y -= 0.55;
  return y;
}

function needsWorldSpaceBar(unit) {
  return isUnitGarrisoned(unit) && unit.mesh && !unit.mesh.visible && !!unit.mesh.parent;
}

function barWidth(unit) {
  return BAR_WIDTH[unit.def?.type] ?? 2.5;
}

function fillColor(ratio) {
  if (ratio <= 0.3) return '#f87171';
  if (ratio <= 0.6) return '#facc15';
  return '#4ade80';
}

function shouldShowBar(unit) {
  if (!unit || unit.dead || !unit.mesh) return false;
  if (unit.selected) return true;
  return unit.hp < unit.maxHp;
}

function drawHealthBar(canvas, ctx, ratio, selected, team) {
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const pad = 2;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  const fillW = Math.max(0, Math.round(innerW * ratio));

  ctx.fillStyle = 'rgba(8, 10, 14, 0.82)';
  ctx.fillRect(0, 0, w, h);

  const border = team === 'player' ? 'rgba(96, 165, 250, 0.9)' : 'rgba(248, 113, 113, 0.85)';
  ctx.strokeStyle = selected ? 'rgba(255, 236, 179, 0.95)' : border;
  ctx.lineWidth = selected ? 2 : 1.5;
  ctx.strokeRect(pad - 0.5, pad - 0.5, innerW + 1, innerH + 1);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fillRect(pad, pad, innerW, innerH);

  if (fillW > 0) {
    const grad = ctx.createLinearGradient(pad, 0, pad + fillW, 0);
    const base = fillColor(ratio);
    grad.addColorStop(0, base);
    grad.addColorStop(1, ratio <= 0.3 ? '#ef4444' : ratio <= 0.6 ? '#eab308' : '#22c55e');
    ctx.fillStyle = grad;
    ctx.fillRect(pad, pad, fillW, innerH);
  }

  if (ratio > 0 && ratio < 1) {
    const lostX = pad + fillW;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fillRect(lostX, pad, innerW - fillW, innerH);
  }
}

function attachHealthBar(unit) {
  if (!unit.mesh) return;

  const ratio = unit.hp / Math.max(unit.maxHp, 1);
  const width = barWidth(unit);

  if (!unit.healthBar) {
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 14;
    const ctx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.name = 'healthBar';
    sprite.renderOrder = 24;
    unit.mesh.add(sprite);
    unit.healthBar = {
      sprite,
      canvas,
      ctx,
      tex,
      lastKey: '',
    };
  }

  const hb = unit.healthBar;
  const key = `${ratio.toFixed(3)}|${unit.selected ? 1 : 0}|${unit.team}`;
  if (key !== hb.lastKey) {
    drawHealthBar(hb.canvas, hb.ctx, ratio, unit.selected, unit.team);
    hb.tex.needsUpdate = true;
    hb.lastKey = key;
  }

  hb.sprite.visible = true;
  const worldSpace = needsWorldSpaceBar(unit);
  const desiredParent = worldSpace ? unit.mesh.parent : unit.mesh;
  if (desiredParent && hb.sprite.parent !== desiredParent) desiredParent.add(hb.sprite);

  if (worldSpace) {
    const yBase = unit._mapDef
      ? sampleTerrainHeight(unit.position.x, unit.position.z, unit._mapDef)
      : unit.position.y;
    const slot = unit._garrisonSlotIndex ?? 0;
    const lat = (slot - 0.5) * 0.85;
    // Just under the INSIDE / field-icon stack
    hb.sprite.position.set(unit.position.x + lat, yBase + 5.5 + slot * 1.35, unit.position.z);
  } else {
    hb.sprite.position.set(0, barYOffset(unit), 0);
  }
  hb.sprite.scale.set(width, width * 0.22, 1);
}

export function removeUnitHealthBar(unit) {
  const hb = unit.healthBar;
  if (!hb) return;
  if (hb.sprite?.parent) hb.sprite.parent.remove(hb.sprite);
  hb.tex?.dispose();
  hb.sprite?.material?.dispose();
  unit.healthBar = null;
}

export function syncUnitHealthBars(units, enabled = true) {
  for (const unit of units) {
    if (!enabled || !shouldShowBar(unit)) {
      removeUnitHealthBar(unit);
      continue;
    }
    attachHealthBar(unit);
  }
}
