/**
 * Tank / armored car kill VFX + occasional ammo cook-off secondary blasts.
 */

import {
  spawnShellExplosion,
  spawnShellExplosionLite,
  spawnSmokePuff,
  spawnExplosion,
} from './CombatEffects.js';
import { spawnRecoverableWreckSmoke, spawnTankWreckFire } from './WreckEffects.js';
import { sounds } from '../audio/SoundManager.js';
import { isTankType } from '../units/VehicleTypes.js';
import { spawnVehicleCrewBailout } from '../game/VehicleBailout.js';

/** Types that get armored-vehicle destruction (main blast + wreck fire + cook-off chance). */
export function isArmoredCombatVehicle(type) {
  return type === 'tank' || type === 'tankDestroyer' || type === 'superHeavyTank' || type === 'armoredCar';
}

function cookOffChance(type) {
  if (type === 'superHeavyTank') return 0.42;
  if (type === 'tank' || type === 'tankDestroyer') return 0.3;
  if (type === 'armoredCar') return 0.18;
  return 0;
}

function primaryTier(type) {
  if (type === 'superHeavyTank') return 'heavy';
  if (type === 'tank' || type === 'tankDestroyer') return 'heavy';
  return 'medium';
}

/**
 * One-shot kill FX for tanks / armored cars. Idempotent per unit.
 * @param {object} game — Game instance (needs scene, _spawnExplosionCrater, _pendingCookOffs)
 * @param {object} unit
 * @param {{x:number,y?:number,z:number}|null} pos
 */
export function triggerVehicleKillFx(game, unit, pos = null) {
  if (!unit || unit._vehicleKillFxDone) return;
  const type = unit.def?.type;
  if (!isArmoredCombatVehicle(type)) return;

  unit._vehicleKillFxDone = true;
  const p = pos ?? {
    x: unit.position?.x ?? 0,
    y: unit.position?.y ?? 0,
    z: unit.position?.z ?? 0,
  };

  const scene = game.scene;
  if (!scene) return;

  const tier = primaryTier(type);
  const scale = type === 'armoredCar' ? 0.85 : type === 'superHeavyTank' ? 1.25 : 1;

  if (unit._recoverableWreck) {
    // A survivable knockout gets one contained impact, smoke, and a visible
    // bailout. It skips flames and ammunition cook-off, but retains persistent
    // engine-compartment smoke until an engineer restores the hull.
    const burst = { x: p.x, y: (p.y ?? 0) + 0.45, z: p.z };
    spawnShellExplosionLite(scene, burst, 'medium');
    spawnSmokePuff(scene, burst, 1.05 * scale);
    spawnSmokePuff(
      scene,
      { x: p.x + 0.55, y: burst.y + 0.15, z: p.z - 0.35 },
      0.78 * scale
    );
    spawnSmokePuff(
      scene,
      { x: p.x - 0.4, y: burst.y + 0.1, z: p.z + 0.45 },
      0.68 * scale
    );
    sounds.play('explosion');
    sounds.playImpact('explosion', { x: p.x, z: p.z }, 0.02);
    if (unit.mesh?.parent && !unit.wreckFire) {
      unit.wreckFire = spawnRecoverableWreckSmoke(scene, unit.position ?? p, unit.mesh);
    }
    spawnVehicleCrewBailout(game, unit);
    return;
  }

  // Primary detonation — bigger than the old smoke-only kill
  spawnShellExplosion(scene, p, tier);
  spawnSmokePuff(scene, p, 1.15 * scale);
  spawnSmokePuff(scene, { x: p.x + 0.6, y: p.y, z: p.z - 0.4 }, 0.85 * scale);
  if (type !== 'armoredCar') {
    spawnSmokePuff(scene, { x: p.x - 0.5, y: p.y, z: p.z + 0.5 }, 0.7 * scale);
  }

  if (unit.mesh?.parent && !unit.wreckFire) {
    unit.wreckFire = spawnTankWreckFire(scene, unit.position ?? p, unit.mesh);
  }

  sounds.play('explosion');
  sounds.playImpact('shell', { x: p.x, z: p.z }, 0.04);

  const craterSize = type === 'superHeavyTank' ? 'heavy' : isTankType(type) ? 'medium' : 'light';
  game._spawnExplosionCrater?.(p.x, p.z, craterSize);

  // Occasional ammo cook-off: shells cooking off after the hull is open
  if (!unit._catastrophicVehicleKill && Math.random() >= cookOffChance(type)) return;

  if (!game._pendingCookOffs) game._pendingCookOffs = [];

  const blasts =
    type === 'superHeavyTank'
      ? 3 + Math.floor(Math.random() * 3) // 3–5
      : type === 'tank' || type === 'tankDestroyer'
        ? 2 + Math.floor(Math.random() * 3) // 2–4
        : 2 + Math.floor(Math.random() * 2); // 2–3

  let delay = 0.28 + Math.random() * 0.22;
  for (let i = 0; i < blasts; i++) {
    const spread = type === 'armoredCar' ? 1.4 : 2.6;
    game._pendingCookOffs.push({
      x: p.x + (Math.random() - 0.5) * spread,
      y: (p.y ?? 0) + 0.3 + Math.random() * 0.6,
      z: p.z + (Math.random() - 0.5) * spread,
      t: delay,
      tier: Math.random() < 0.3 ? 'heavy' : 'medium',
      unit,
    });
    delay += 0.22 + Math.random() * 0.48;
  }
}

/** Advance scheduled secondary ammo explosions. Call each sim frame. */
export function updateVehicleCookOffs(game, dt) {
  const list = game._pendingCookOffs;
  if (!list?.length) return;

  const scene = game.scene;
  for (const c of list) {
    c.t -= dt;
    if (c.t > 0 || c.done) continue;
    c.done = true;

    if (scene) {
      // The primary knockout already used the full heavy effect. Secondary
      // ammunition bursts retain the flash/smoke silhouette without allocating
      // another 15–20 meshes and materials for every cooked-off shell.
      spawnShellExplosionLite(scene, c, c.tier);
      spawnSmokePuff(scene, c, 0.7 + Math.random() * 0.35);
      // Occasional flash debris for variety
      if (Math.random() < 0.4) spawnExplosion(scene, c);
    }

    sounds.playImpact('explosion', { x: c.x, z: c.z }, 0);
    if (Math.random() < 0.55) {
      sounds.play('explosion');
    }

    // Smaller secondary craters only sometimes
    if (Math.random() < 0.35) {
      game._spawnExplosionCrater?.(c.x, c.z, 'light');
    }

    // Keep wreck fire alive / re-assert if mesh still present
    const u = c.unit;
    if (u && !u.wreckFire && u.mesh?.parent && isTankType(u.def?.type)) {
      u.wreckFire = spawnTankWreckFire(scene, u.position, u.mesh);
    }
  }

  game._pendingCookOffs = list.filter((c) => !c.done);
}

export function clearVehicleCookOffs(game) {
  if (game) game._pendingCookOffs = [];
}
