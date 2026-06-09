import * as THREE from 'three';
import { getDamageSmokeTexture } from '../effects/FireTextures.js';
import { isVehicleUnit } from '../units/VehicleTypes.js';

const DAMAGE_THRESHOLD = 0.5;

/** Local offsets on the unit mesh (rear / engine area). */
const SMOKE_LAYOUT = {
  tank: [
    { x: -1.05, y: 2.05, z: 0.1, sx: 2.4, sy: 2.8 },
    { x: -0.75, y: 2.35, z: -0.15, sx: 1.9, sy: 2.2 },
  ],
  superHeavyTank: [
    { x: -1.25, y: 2.15, z: 0.08, sx: 2.6, sy: 3 },
    { x: -0.95, y: 2.5, z: -0.12, sx: 2.1, sy: 2.5 },
  ],
  armoredCar: [{ x: -0.62, y: 1.75, z: 0.06, sx: 2, sy: 2.3 }],
  artillery: [
    { x: -0.48, y: 1.65, z: 0.04, sx: 1.9, sy: 2.2 },
    { x: -0.7, y: 1.9, z: -0.1, sx: 1.6, sy: 1.9 },
  ],
  antiTankGun: [{ x: 0.1, y: 1.45, z: 0, sx: 1.7, sy: 2 }],
};

function needsDamageSmoke(unit) {
  if (!unit || unit.dead || !unit.mesh) return false;
  if (!isVehicleUnit(unit.def?.type)) return false;
  return unit.hp <= unit.maxHp * DAMAGE_THRESHOLD;
}

function smokeStrength(unit) {
  const ratio = unit.hp / Math.max(unit.maxHp, 1);
  const t = 1 - ratio / DAMAGE_THRESHOLD;
  return Math.max(0, Math.min(1, t));
}

function layoutFor(type) {
  return SMOKE_LAYOUT[type] ?? SMOKE_LAYOUT.tank;
}

function attachDamageSmoke(unit) {
  if (unit.damageSmoke?.sprites?.length) return;

  const sprites = [];
  const mats = [];

  for (const spot of layoutFor(unit.def.type)) {
    const mat = new THREE.SpriteMaterial({
      map: getDamageSmokeTexture(),
      color: 0x0a0a0a,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(spot.x, spot.y, spot.z);
    sprite.renderOrder = 18;
    sprite.userData.baseX = spot.x;
    sprite.userData.baseY = spot.y;
    sprite.userData.baseZ = spot.z;
    sprite.userData.baseSx = spot.sx;
    sprite.userData.baseSy = spot.sy;
    sprite.userData.wobble = Math.random() * Math.PI * 2;
    unit.mesh.add(sprite);
    sprites.push(sprite);
    mats.push(mat);
  }

  unit.damageSmoke = { sprites, mats, phase: Math.random() * Math.PI * 2 };
}

export function removeDamageSmoke(unit) {
  const fx = unit.damageSmoke;
  if (!fx) return;
  for (const sprite of fx.sprites ?? []) {
    if (sprite.parent) sprite.parent.remove(sprite);
  }
  fx.mats?.forEach((m) => m.dispose());
  unit.damageSmoke = null;
}

export function syncDamageSmoke(units) {
  for (const unit of units) {
    if (!needsDamageSmoke(unit)) {
      removeDamageSmoke(unit);
      continue;
    }
    attachDamageSmoke(unit);
  }
}

export function updateDamageSmoke(units, dt) {
  for (const unit of units) {
    const fx = unit.damageSmoke;
    if (!fx || unit.dead) continue;

    const strength = smokeStrength(unit);
    fx.phase += dt * 1.6;

    let i = 0;
    for (const sprite of fx.sprites) {
      const mat = sprite.material;
      if (!mat) continue;

      mat.opacity = 0.48 + strength * 0.38 + Math.sin(fx.phase * 1.5 + sprite.userData.wobble) * 0.05;
      sprite.position.set(
        sprite.userData.baseX + Math.sin(fx.phase * 0.65 + i) * 0.08,
        sprite.userData.baseY + Math.sin(fx.phase * 0.85 + i * 1.2) * 0.1 + (fx.phase % 3) * 0.02,
        sprite.userData.baseZ
      );
      const pulse = 0.92 + strength * 0.14 + Math.sin(fx.phase * 1.1 + i) * 0.08;
      sprite.scale.set(sprite.userData.baseSx * pulse, sprite.userData.baseSy * pulse, 1);
      i++;
    }
  }
}