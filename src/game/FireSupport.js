import * as THREE from 'three';
import { FIRE_SUPPORT_TYPES } from '../data/fireSupport.js';
import { PRACTICE_TARGET_HQ_DAMAGE_MULT } from '../data/gameModes.js';
import { sampleTerrainHeight } from '../world/Terrain.js';
import { getIncomingDamageMultiplier } from './CoverSystem.js';
import {
  spawnStrikeWarning,
  spawnStrafePlane,
  spawnStrikeImpact,
} from '../effects/FireSupportEffects.js';
import { sounds, mgProfileForFaction, resolveWeaponProfile } from '../audio/SoundManager.js';

const PLAYER = 'player';

export class FireSupportManager {
  constructor(game) {
    this.game = game;
    this.pending = null;
    this.cooldowns = { strafe: 0, barrage: 0 };
    this.events = [];
    this.preview = null;
    this._previewScale = 1;
  }

  reset() {
    this.pending = null;
    this.cooldowns = { strafe: 0, barrage: 0 };
    this.events = [];
    this.clearPreview();
  }

  getDef(type) {
    return FIRE_SUPPORT_TYPES[type];
  }

  isReady(type) {
    return (this.cooldowns[type] ?? 0) <= 0;
  }

  getCooldownRemaining(type) {
    return Math.max(0, this.cooldowns[type] ?? 0);
  }

  arm(type) {
    if (!this.isReady(type)) return false;
    if (this.pending === type) {
      this.pending = null;
      this.clearPreview();
      return true;
    }
    this.pending = type;
    return true;
  }

  cancel() {
    this.pending = null;
    this.clearPreview();
  }

  clearPreview() {
    if (this.preview?.parent) {
      this.game.scene.remove(this.preview);
      this.preview.geometry?.dispose();
      this.preview.material?.dispose();
    }
    this.preview = null;
  }

  updatePreview(x, z) {
    if (!this.pending || !this.game.mapDef) return;
    const def = this.getDef(this.pending);
    this._previewScale =
      this.pending === 'barrage' ? def.radius : def.runLength * 0.5;
    const y = sampleTerrainHeight(x, z, this.game.mapDef) + 0.25;

    if (!this.preview) {
      const geo = new THREE.RingGeometry(0.88, 1, 40);
      geo.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({
        color: this.pending === 'barrage' ? 0xff5533 : 0xffcc55,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      this.preview = new THREE.Mesh(geo, mat);
      this.game.scene.add(this.preview);
    }

    this.preview.position.set(x, y, z);
    this.preview.scale.set(this._previewScale, 1, this._previewScale);
    this.preview.material.color.setHex(this.pending === 'barrage' ? 0xff5533 : 0xffcc55);
  }

  tryPlaceTarget(x, z) {
    const type = this.pending;
    if (!type || !this.isReady(type)) return false;

    const half = this.game.mapDef.size / 2 - 8;
    x = THREE.MathUtils.clamp(x, -half, half);
    z = THREE.MathUtils.clamp(z, -half, half);

    this.pending = null;
    this.clearPreview();
    this.cooldowns[type] = this.getDef(type).cooldown;
    this.scheduleStrike(type, x, z);
    sounds.play('order');
    return true;
  }

  scheduleStrike(type, tx, tz) {
    const def = this.getDef(type);
    const scene = this.game.scene;
    const mapDef = this.game.mapDef;

    if (type === 'strafe') {
      const hq = this.game.hqs.find((h) => h.team === PLAYER);
      const hx = hq?.position?.x ?? mapDef.playerBase.x;
      const hz = hq?.position?.z ?? mapDef.playerBase.z;
      let dx = tx - hx;
      let dz = tz - hz;
      const len = Math.sqrt(dx * dx + dz * dz) || 1;
      dx /= len;
      dz /= len;
      const perpX = -dz;
      const perpZ = dx;

      const startX = tx - perpX * (def.runLength * 0.5);
      const startZ = tz - perpZ * (def.runLength * 0.5);

      spawnStrikeWarning(scene, mapDef, tx, tz, def.runLength * 0.5, false);
      this.events.push({
        at: def.warnTime,
        fn: () => {
          const planeSpeed = 38;
          const flyDuration = def.runLength / planeSpeed + 0.55;
          spawnStrafePlane(scene, mapDef, startX, startZ, perpX, perpZ, flyDuration);
          sounds.startStrafeFlyby({
            x: startX,
            z: startZ,
            velX: perpX * planeSpeed,
            velZ: perpZ * planeSpeed,
            duration: flyDuration,
          });
          sounds.playWeapon(mgProfileForFaction(this.game.playerFaction?.id), { x: tx, z: tz }, {
            rate: 0.85,
            volume: 0.9,
          });
        },
      });

      for (let i = 0; i < def.hitCount; i++) {
        const t = def.warnTime + 0.35 + i * def.hitInterval;
        const ratio = i / Math.max(1, def.hitCount - 1);
        const ix = startX + perpX * def.runLength * ratio;
        const iz = startZ + perpZ * def.runLength * ratio;
        this.events.push({
          at: t,
          fn: () => {
            spawnStrikeImpact(scene, mapDef, ix, iz, false, this.game._terrainMesh);
            this.applyDamage(ix, iz, def.hitRadius, def.damage, def.hqDamage * 0.15);
            sounds.playImpact('bullet', { x: ix, z: iz }, 0.02);
          },
        });
      }
    } else if (type === 'barrage') {
      spawnStrikeWarning(scene, mapDef, tx, tz, def.radius, true);
      const artyProfile = resolveWeaponProfile(
        this.game.playerFaction?.units?.artillery ?? { type: 'artillery' },
        this.game.playerFaction?.id
      );
      sounds.playWeapon(artyProfile, { x: tx, z: tz }, { rate: 0.7, volume: 0.8 });

      for (let i = 0; i < def.shellCount; i++) {
        const t = def.warnTime + i * def.shellInterval;
        const angle = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * def.radius;
        const ix = tx + Math.cos(angle) * r;
        const iz = tz + Math.sin(angle) * r;
        this.events.push({
          at: t,
          fn: () => {
            spawnStrikeImpact(scene, mapDef, ix, iz, true, this.game._terrainMesh);
            this.applyDamage(ix, iz, def.radius * 0.35, def.damage, def.hqDamage * 0.2);
            sounds.playImpact('shell', { x: ix, z: iz }, 0.05);
          },
        });
      }
    }
  }

  applyDamage(x, z, radius, unitDamage, hqDamage) {
    const cover = this.game.coverSystem;

    for (const u of this.game.units) {
      if (u.dead || u.team === PLAYER) continue;
      const d = Math.hypot(u.position.x - x, u.position.z - z);
      if (d > radius) continue;
      const t = 1 - d / radius;
      let dmg = unitDamage * t * t;
      dmg *= getIncomingDamageMultiplier(u, cover);
      u.takeDamage(dmg);
    }

    for (const h of this.game.hqs) {
      if (h.dead || h.team === PLAYER) continue;
      const d = Math.hypot(h.position.x - x, h.position.z - z);
      if (d > radius * 1.2) continue;
      const t = 1 - d / (radius * 1.2);
      let dmg = hqDamage * t;
      if (this.game.tutorial) dmg *= PRACTICE_TARGET_HQ_DAMAGE_MULT;
      h.takeDamage(dmg);
    }

    this.game.scenery?.damageAt(x, z, radius + 2, unitDamage * 1.1);
  }

  update(dt) {
    for (const key of Object.keys(this.cooldowns)) {
      if (this.cooldowns[key] > 0) this.cooldowns[key] = Math.max(0, this.cooldowns[key] - dt);
    }

    for (let i = this.events.length - 1; i >= 0; i--) {
      const ev = this.events[i];
      ev.at -= dt;
      if (ev.at <= 0) {
        ev.fn();
        this.events.splice(i, 1);
      }
    }
  }
}