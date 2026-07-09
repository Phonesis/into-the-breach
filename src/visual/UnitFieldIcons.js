import * as THREE from 'three';
import { isUnitGarrisoned } from '../game/BunkerGarrison.js';
import { sampleTerrainHeight } from '../world/Terrain.js';
import { getUnitIconMarkup } from '../ui/unitIcons.js';

const textureCache = new Map();
const ICON_SCALE = 2.4;

const SHORT_LABELS = {
  infantry: 'INF',
  paratrooper: 'ABN',
  medic: 'MED',
  engineer: 'ENG',
  machineGun: 'MG',
  sniper: 'SNP',
  mortar: 'MRT',
  antiTankGun: 'AT',
  armoredCar: 'AC',
  tank: 'TK',
  superHeavyTank: 'SH',
  artillery: 'ART',
};

const ICON_HEIGHT = {
  infantry: 2.35,
  paratrooper: 2.5,
  medic: 2.35,
  engineer: 2.35,
  machineGun: 2.45,
  sniper: 2.6,
  mortar: 2.5,
  antiTankGun: 2.7,
  armoredCar: 3.1,
  tank: 3.9,
  superHeavyTank: 4.4,
  artillery: 3.5,
};

function iconYOffset(unit) {
  let y = ICON_HEIGHT[unit.def?.type] ?? 2.5;
  if (unit.retreating) y += 2.3;
  else if (unit.coverMarker?.visible) y += 1.7;
  return y;
}

function needsWorldSpaceIcon(unit) {
  return (
    isUnitGarrisoned(unit) &&
    unit.mesh &&
    !unit.mesh.visible &&
    !!unit.mesh.parent
  );
}

function garrisonIconLift(unit) {
  // Stack multiple garrisoned icons above the roof so each is readable
  const idx = unit._garrisonSlotIndex ?? 0;
  return 6.2 + idx * 1.35;
}

function reparentFieldIcon(unit) {
  if (!unit.fieldIcon || !unit.mesh) return;
  const sprite = unit.fieldIcon;
  const worldSpace = needsWorldSpaceIcon(unit);
  const desiredParent = worldSpace ? unit.mesh.parent : unit.mesh;
  if (!desiredParent) return;
  if (sprite.parent !== desiredParent) desiredParent.add(sprite);
  sprite.userData.worldSpace = worldSpace;
}

function updateFieldIconTransform(unit) {
  if (!unit.fieldIcon) return;
  const yOff = iconYOffset(unit);
  const garrisoned = isUnitGarrisoned(unit);
  if (unit.fieldIcon.userData.worldSpace) {
    const yBase = unit._mapDef
      ? sampleTerrainHeight(unit.position.x, unit.position.z, unit._mapDef)
      : unit.position.y;
    const lift = garrisoned ? garrisonIconLift(unit) : Math.max(yOff, 4.6);
    // Slight lateral offset so stacked garrison icons don't fully overlap
    const slot = unit._garrisonSlotIndex ?? 0;
    const lat = garrisoned ? (slot - 0.5) * 0.85 : 0;
    unit.fieldIcon.position.set(unit.position.x + lat, yBase + lift, unit.position.z);
  } else {
    unit.fieldIcon.position.set(0, yOff, 0);
  }
  const scale = garrisoned ? ICON_SCALE * 1.25 : ICON_SCALE;
  unit.fieldIcon.scale.set(scale, scale, 1);
  unit.fieldIcon.visible = true;
  // Green tint while inside a building
  if (unit.fieldIcon.material) {
    unit.fieldIcon.material.color?.setHex?.(garrisoned ? 0xb8ffc8 : 0xffffff);
  }
}

function toSvgBlobUrl(type) {
  const raw = getUnitIconMarkup(type).replace(/currentColor/g, '#e8e4dc');
  const svg = raw.includes('xmlns=')
    ? raw
    : raw.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  return URL.createObjectURL(blob);
}

function drawTextBadge(canvas, type) {
  const ctx = canvas.getContext('2d');
  const label = SHORT_LABELS[type] ?? (type ?? '???').slice(0, 3).toUpperCase();

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(10, 18, 28, 0.92)';
  ctx.beginPath();
  ctx.arc(24, 24, 21, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(90, 159, 212, 0.85)';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.fillStyle = '#e8e4dc';
  ctx.font = label.length > 2 ? 'bold 11px system-ui, sans-serif' : 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 24, 24);
}

function drawBadge(canvas, img) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'rgba(10, 18, 28, 0.92)';
  ctx.beginPath();
  ctx.arc(24, 24, 21, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(90, 159, 212, 0.85)';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.drawImage(img, 8, 8, 32, 32);
}

function ensureTexture(type) {
  if (textureCache.has(type)) return textureCache.get(type).promise;

  const canvas = document.createElement('canvas');
  canvas.width = 48;
  canvas.height = 48;
  const tex = new THREE.CanvasTexture(canvas);
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;

  const promise = new Promise((resolve) => {
    const finish = () => {
      tex.needsUpdate = true;
      textureCache.get(type).ready = true;
      resolve(tex);
    };

    const url = toSvgBlobUrl(type);
    const img = new Image();
    img.onload = () => {
      drawBadge(canvas, img);
      URL.revokeObjectURL(url);
      finish();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      drawTextBadge(canvas, type);
      finish();
    };
    img.src = url;
  });

  textureCache.set(type, { tex, ready: false, promise });
  return promise;
}

export function preloadUnitFieldIcons(types) {
  const unique = [...new Set(types)];
  return Promise.all(unique.map((type) => ensureTexture(type)));
}

function attachFieldIcon(unit) {
  if (!unit.mesh || unit.dead || unit.fieldIcon) return;

  const type = unit.def?.type ?? 'infantry';
  const entry = textureCache.get(type);
  if (!entry?.ready) {
    ensureTexture(type).then(() => attachFieldIcon(unit));
    return;
  }

  const mat = new THREE.SpriteMaterial({
    map: entry.tex,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.name = 'fieldUnitIcon';
  sprite.scale.set(ICON_SCALE, ICON_SCALE, 1);
  sprite.renderOrder = 22;
  unit.mesh.add(sprite);
  unit.fieldIcon = sprite;
}

export function removeFieldIcon(unit) {
  const marker = unit.fieldIcon;
  if (!marker) return;
  if (marker.parent) marker.parent.remove(marker);
  marker.material?.dispose();
  unit.fieldIcon = null;
}

export function syncUnitFieldIcon(unit, enabled) {
  if (!unit.mesh || unit.dead || unit.team !== 'player') {
    removeFieldIcon(unit);
    return;
  }

  // Always show icons while garrisoned (mesh is hidden inside the building)
  const mustShow = enabled || isUnitGarrisoned(unit);
  if (!mustShow) {
    removeFieldIcon(unit);
    return;
  }

  attachFieldIcon(unit);
  if (!unit.fieldIcon) return;

  reparentFieldIcon(unit);
  updateFieldIconTransform(unit);
}

export function syncPlayerFieldIcons(units, enabled) {
  for (const unit of units) {
    if (unit.team !== 'player') continue;
    syncUnitFieldIcon(unit, enabled);
  }
}

export function clearUnitFieldIconCache() {
  for (const entry of textureCache.values()) entry.tex.dispose();
  textureCache.clear();
}