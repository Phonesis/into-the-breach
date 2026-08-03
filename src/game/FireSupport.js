import * as THREE from 'three';
import {
  AIRBORNE_CLOUD_COVER_SECONDS,
  FIRE_SUPPORT_TYPES,
} from '../data/fireSupport.js';
import { PRACTICE_TARGET_HQ_DAMAGE_MULT } from '../data/gameModes.js';
import { sampleTerrainHeight } from '../world/Terrain.js';
import { getIncomingDamageMultiplier } from './CoverSystem.js';
import {
  spawnStrikeWarning,
  spawnStrafePlane,
  spawnStrikeImpact,
  prewarmStrikeImpacts,
} from '../effects/FireSupportEffects.js';
import { spawnParatrooperSquad } from '../effects/ParachuteEffects.js';
import { getParatrooperDef } from '../data/paratroopers.js';
import { sounds, mgProfileForFaction } from '../audio/SoundManager.js';
import { HQ_DEPLOY_RADIUS } from './OpeningDeployZone.js';
import {
  getRadioOperators,
  getRadioOperatorSupportRange,
  hasRadioOperator,
} from './RadioOperatorBehavior.js';
import { WEAPON_RANGE_SLACK } from './Targeting.js';

const PLAYER = 'player';
const ENEMY = 'enemy';
const VALID_TARGET_PREVIEW_COLOR = 0x4ade80;
const INVALID_TARGET_PREVIEW_COLOR = 0xef4444;
const AIRBORNE_HQ_MIN_DISTANCE = HQ_DEPLOY_RADIUS * 2;
const MIN_FIRE_SUPPORT_OBSERVATION_RANGE = 38;
const FIRE_SUPPORT_OBSERVATION_RANGE_BY_TYPE = {
  infantry: 54,
  paratrooper: 56,
  machineGun: 52,
  sniper: 68,
  mortar: 48,
  medic: 42,
  engineer: 46,
  vehicleCrew: 42,
  commander: 58,
  antiTankGun: 54,
  artillery: 50,
  armoredCar: 70,
  tank: 62,
  tankDestroyer: 64,
  superHeavyTank: 60,
};

export function getFireSupportObservationRange(unit) {
  const def = unit?.def;
  return Math.max(
    MIN_FIRE_SUPPORT_OBSERVATION_RANGE,
    Number.isFinite(def?.sightRange) ? def.sightRange : 0,
    FIRE_SUPPORT_OBSERVATION_RANGE_BY_TYPE[def?.type] ?? 0,
    Number.isFinite(def?.range) ? def.range * WEAPON_RANGE_SLACK : 0
  );
}

function makeCooldowns() {
  return Object.fromEntries(
    Object.keys(FIRE_SUPPORT_TYPES).map((id) => [id, 0])
  );
}

function creepAxisFromPlayer(game, tx, tz, ownerTeam = PLAYER) {
  const mapDef = game.mapDef;
  const hq = game.hqs.find((h) => h.team === ownerTeam);
  const fallback = ownerTeam === PLAYER ? mapDef.playerBase : mapDef.enemyBase;
  const hx = hq?.position?.x ?? fallback.x;
  const hz = hq?.position?.z ?? fallback.z;
  let dx = tx - hx;
  let dz = tz - hz;
  const len = Math.hypot(dx, dz) || 1;
  return { dx: dx / len, dz: dz / len, perpX: -dz / len, perpZ: dx / len };
}

export class FireSupportManager {
  constructor(game, ownerTeam = PLAYER) {
    this.game = game;
    this.ownerTeam = ownerTeam;
    this.pending = null;
    this.cooldowns = makeCooldowns();
    this.events = [];
    this.preview = null;
    this._previewScale = 1;
    this.targetRejectReason = null;
    this.airborneCloudCoverRemaining = AIRBORNE_CLOUD_COVER_SECONDS;
    /**
     * Clear Defenses: each side may call Airborne once only.
     * null = unlimited (standard / assault / etc.).
     */
    this.airborneUsesLeft = null;
  }

  get ownerFaction() {
    return this.ownerTeam === PLAYER ? this.game.playerFaction : this.game.enemyFaction;
  }

  get targetTeam() {
    return this.ownerTeam === PLAYER ? ENEMY : PLAYER;
  }

  get ownerHq() {
    return this.game.hqs.find((h) => h.team === this.ownerTeam);
  }

  get ownerBase() {
    return this.ownerTeam === PLAYER ? this.game.mapDef.playerBase : this.game.mapDef.enemyBase;
  }

  get targetUnits() {
    return this.targetTeam === ENEMY ? this.game._enemyAlive : this.game._playerAlive;
  }

  reset() {
    this.pending = null;
    this.cooldowns = makeCooldowns();
    this.events = [];
    this.clearPreview();
    this.targetRejectReason = null;
    this.airborneCloudCoverRemaining = AIRBORNE_CLOUD_COVER_SECONDS;
    // Clear Defenses & Battle Simulation: one airborne drop per side per match.
    this.airborneUsesLeft =
      this.game?.clearance || this.game?.lastStand ? 1 : null;
  }

  getDef(type) {
    return FIRE_SUPPORT_TYPES[type];
  }

  /** False after the single Clear Defenses airborne has been spent. */
  isAirborneAvailable() {
    if (this.airborneUsesLeft == null) return true;
    return this.airborneUsesLeft > 0;
  }

  isAirborneCloudCovered() {
    return this.airborneCloudCoverRemaining > 0;
  }

  getAirborneCloudCoverRemaining() {
    return Math.max(0, this.airborneCloudCoverRemaining);
  }

  hasCommandLink() {
    return hasRadioOperator(this.game, this.ownerTeam);
  }

  isReady(type) {
    if (!this.hasCommandLink()) return false;
    if (type === 'airborneDrop' && this.isAirborneCloudCovered()) return false;
    if (type === 'airborneDrop' && !this.isAirborneAvailable()) return false;
    return (this.cooldowns[type] ?? 0) <= 0;
  }

  getCooldownRemaining(type) {
    return Math.max(0, this.cooldowns[type] ?? 0);
  }

  arm(type) {
    if (!this.isReady(type)) return false;
    this.targetRejectReason = null;
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
    this.targetRejectReason = null;
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

  _previewStyle(type, def) {
    if (type === 'barrage') return { scale: def.radius };
    if (type === 'creepingBarrage') {
      return { scale: def.targetRadius ?? def.creepLength * 0.4 };
    }
    if (type === 'airborneDrop') {
      return { scale: def.dropRadius ?? 11 };
    }
    return { scale: def.runLength * 0.5 };
  }

  updatePreview(x, z) {
    if (!this.pending || !this.game.mapDef) return;
    const def = this.getDef(this.pending);
    const { scale } = this._previewStyle(this.pending, def);
    const rejectReason = this.getTargetRejectReason(this.pending, x, z);
    if (!rejectReason) this.targetRejectReason = null;
    const previewColor = rejectReason
      ? INVALID_TARGET_PREVIEW_COLOR
      : VALID_TARGET_PREVIEW_COLOR;
    this._previewScale = scale;
    const y = sampleTerrainHeight(x, z, this.game.mapDef) + 0.25;

    if (!this.preview) {
      const geo = new THREE.RingGeometry(0.88, 1, 40);
      geo.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({
        color: previewColor,
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
    this.preview.material.color.setHex(previewColor);
  }

  _airborneHqConflict(x, z) {
    return (
      this.game.hqs.find((h) => {
        if (h.dead || h.team !== this.targetTeam) return false;
        return Math.hypot(x - h.position.x, z - h.position.z) < AIRBORNE_HQ_MIN_DISTANCE;
      }) ?? null
    );
  }

  isAirborneTargetAllowed(x, z) {
    return !this._airborneHqConflict(x, z);
  }

  isPointObserved(x, z) {
    const observers = getRadioOperators(this.game.units, this.ownerTeam);
    const pointTarget = { position: { x, z } };
    for (const unit of observers) {
      const observationRange = getRadioOperatorSupportRange(unit);
      if (Math.hypot(unit.position.x - x, unit.position.z - z) > observationRange) continue;
      if (
        this.game.smokeScreens?.isLosObscured?.(
          unit.position.x,
          unit.position.z,
          x,
          z
        )
      ) {
        continue;
      }
      const observer = {
        position: unit.position,
        def: { type: 'infantry' },
        _garrisonBunkerId: unit._garrisonBunkerId,
      };
      if (this.game.scenery?.isLineOfFireBlocked?.(observer, pointTarget)) continue;
      return true;
    }
    return false;
  }

  getTargetRejectReason(type, x, z) {
    if (!this.isPointObserved(x, z)) {
      return 'Target must be within radio range of at least one living radio operator.';
    }
    if (type === 'airborneDrop' && !this.isAirborneTargetAllowed(x, z)) {
      return 'Airborne cannot drop this close to the opposing HQ.';
    }
    return null;
  }

  getSafeAirborneTarget(x, z) {
    const hq = this._airborneHqConflict(x, z);
    if (!hq || this.isAirborneTargetAllowed(x, z)) return { x, z };

    let dx = x - hq.position.x;
    let dz = z - hq.position.z;
    let distance = Math.hypot(dx, dz);
    if (distance < 0.001) {
      const otherHq = this.game.hqs.find((candidate) => candidate !== hq && !candidate.dead);
      dx = (otherHq?.position.x ?? this.ownerBase.x) - hq.position.x;
      dz = (otherHq?.position.z ?? this.ownerBase.z) - hq.position.z;
      distance = Math.hypot(dx, dz) || 1;
    }

    return {
      x: hq.position.x + (dx / distance) * AIRBORNE_HQ_MIN_DISTANCE,
      z: hq.position.z + (dz / distance) * AIRBORNE_HQ_MIN_DISTANCE,
    };
  }

  tryPlaceTarget(x, z) {
    const type = this.pending;
    if (!type || !this.isReady(type)) return false;

    const half = this.game.mapDef.size / 2 - 8;
    x = THREE.MathUtils.clamp(x, -half, half);
    z = THREE.MathUtils.clamp(z, -half, half);
    const rejectReason = this.getTargetRejectReason(type, x, z);
    if (rejectReason) {
      this.targetRejectReason = rejectReason;
      return false;
    }

    this.pending = null;
    this.targetRejectReason = null;
    this.clearPreview();
    this.cooldowns[type] = this.getDef(type).cooldown;
    this._consumeAirborneUse(type);
    this.scheduleStrike(type, x, z);
    sounds.play('order');
    return true;
  }

  tryAiStrike(type, x, z) {
    if (this.ownerTeam === PLAYER || !this.isReady(type)) return false;
    if (type === 'airborneDrop') {
      const target = this.getSafeAirborneTarget(x, z);
      x = target.x;
      z = target.z;
    }
    if (this.getTargetRejectReason(type, x, z)) return false;
    this.cooldowns[type] = this.getDef(type).cooldown;
    this._consumeAirborneUse(type);
    this.scheduleStrike(type, x, z);
    return true;
  }

  _consumeAirborneUse(type) {
    if (type !== 'airborneDrop' || this.airborneUsesLeft == null) return;
    this.airborneUsesLeft = Math.max(0, this.airborneUsesLeft - 1);
  }

  scheduleStrike(type, tx, tz) {
    if (!this.hasCommandLink()) return false;
    if (type === 'airborneDrop' && this.isAirborneCloudCovered()) return false;
    if (this.getTargetRejectReason(type, tx, tz)) return false;
    const def = this.getDef(type);
    const scene = this.game.scene;
    const mapDef = this.game.mapDef;

    if (type === 'strafe') {
      const hq = this.ownerHq;
      const hx = hq?.position?.x ?? this.ownerBase.x;
      const hz = hq?.position?.z ?? this.ownerBase.z;
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
          sounds.playWeapon(mgProfileForFaction(this.ownerFaction?.id), { x: tx, z: tz }, {
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
            spawnStrikeImpact(scene, mapDef, ix, iz, 'strafe', this.game._terrainMesh);
            this.applyDamage(ix, iz, def.hitRadius, def.damage, def.hqDamage * 0.15, 'strafe');
          },
        });
      }
    } else if (type === 'barrage') {
      spawnStrikeWarning(scene, mapDef, tx, tz, def.radius, true);
      sounds.playFireSupportSalvo('barrage', { x: tx, z: tz });

      const impacts = [];
      for (let i = 0; i < def.shellCount; i++) {
        const t = def.warnTime + i * def.shellInterval;
        const angle = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * def.radius;
        const ix = tx + Math.cos(angle) * r;
        const iz = tz + Math.sin(angle) * r;
        impacts.push({ x: ix, z: iz });
        this.events.push({
          at: t,
          fn: () => {
            spawnStrikeImpact(scene, mapDef, ix, iz, 'barrage', this.game._terrainMesh);
            this.applyDamage(ix, iz, def.radius * 0.35, def.damage, def.hqDamage * 0.2, 'artillery');
            sounds.playArtilleryImpact(
              { x: ix, z: iz },
              { kind: 'barrage', delaySec: 0.05 }
            );
          },
        });
      }
      prewarmStrikeImpacts(this.game.renderer, mapDef, impacts, false);
    } else if (type === 'creepingBarrage') {
      const { dx, dz, perpX, perpZ } = creepAxisFromPlayer(this.game, tx, tz, this.ownerTeam);
      const startX = tx - dx * def.creepLength;
      const startZ = tz - dz * def.creepLength;

      spawnStrikeWarning(scene, mapDef, tx, tz, def.targetRadius, true);
      spawnStrikeWarning(scene, mapDef, startX, startZ, def.laneWidth * 0.55, true);

      sounds.playFireSupportSalvo('creepingBarrage', { x: tx, z: tz });

      const impacts = [];
      for (let i = 0; i < def.shellCount; i++) {
        const t = def.warnTime + i * def.shellInterval;
        const ratio = def.shellCount <= 1 ? 1 : i / (def.shellCount - 1);
        const along = def.creepLength * ratio;
        const cx = startX + dx * along;
        const cz = startZ + dz * along;
        const laneTight = 1 - ratio * 0.72;
        const lateral = (Math.random() - 0.5) * def.laneWidth * laneTight;
        const ix = cx + perpX * lateral;
        const iz = cz + perpZ * lateral;
        impacts.push({ x: ix, z: iz });
        const atTarget = ratio >= 0.82;
        const shellDamage = atTarget ? def.targetDamage : def.damage * (0.78 + ratio * 0.28);
        const shellRadius = atTarget ? def.targetRadius : def.hitRadius;
        const hqMult = atTarget ? 0.42 : 0.16 + ratio * 0.12;

        this.events.push({
          at: t,
          fn: () => {
            spawnStrikeImpact(scene, mapDef, ix, iz, 'creeping', this.game._terrainMesh);
            this.applyDamage(ix, iz, shellRadius, shellDamage, def.hqDamage * hqMult, 'artillery');
            sounds.playArtilleryImpact(
              { x: ix, z: iz },
              {
                kind: 'creepingBarrage',
                delaySec: atTarget ? 0.09 : 0.05,
              }
            );
          },
        });
      }
      prewarmStrikeImpacts(this.game.renderer, mapDef, impacts, false);
    } else if (type === 'airborneDrop') {
      spawnStrikeWarning(scene, mapDef, tx, tz, def.dropRadius, false);

      const hq = this.ownerHq;
      const hx = hq?.position?.x ?? this.ownerBase.x;
      const hz = hq?.position?.z ?? this.ownerBase.z;
      let dx = tx - hx;
      let dz = tz - hz;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      const perpX = -dz;
      const perpZ = dx;
      const runLen = def.dropRadius * 2.8;
      const startX = tx - perpX * runLen * 0.5;
      const startZ = tz - perpZ * runLen * 0.5;
      const planeSpeed = 34;
      const flyDuration = runLen / planeSpeed + 0.8;

      this.events.push({
        at: def.warnTime * 0.35,
        fn: () => {
          spawnStrafePlane(
            scene,
            mapDef,
            startX,
            startZ,
            perpX,
            perpZ,
            flyDuration,
            def.planeAltitude ?? 38
          );
          sounds.startStrafeFlyby({
            x: startX,
            z: startZ,
            velX: perpX * planeSpeed,
            velZ: perpZ * planeSpeed,
            duration: flyDuration,
          });
        },
      });

      this.events.push({
        at: def.warnTime,
        fn: () => {
          spawnParatrooperSquad(this.game, tx, tz, {
            def: getParatrooperDef(this.ownerFaction?.id),
            faction: this.ownerFaction,
            team: this.ownerTeam,
            squadCount: def.squadCount,
            dropRadius: def.dropRadius,
            dropHeight: def.dropHeight,
            descentRate: def.descentRate,
          });
          sounds.play('spawn');
        },
      });
    }
  }

  applyDamage(x, z, radius, unitDamage, hqDamage, attackerType = 'artillery') {
    const cover = this.game.coverSystem;
    const radiusSq = radius * radius;
    const hqRadius = radius * 1.2;
    const hqRadiusSq = hqRadius * hqRadius;

    for (const u of this.targetUnits ?? []) {
      const dx = u.position.x - x;
      const dz = u.position.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 > radiusSq) continue;
      const d = Math.sqrt(d2);
      const t = 1 - d / radius;
      let dmg = unitDamage * t * t;
      dmg *= getIncomingDamageMultiplier(u, cover, {
        def: { type: attackerType },
        position: { x, z },
      });
      u.takeDamage(dmg, { explosive: true });
    }

    for (const h of this.game.hqs) {
      if (h.dead || h.team !== this.targetTeam) continue;
      const dx = h.position.x - x;
      const dz = h.position.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 > hqRadiusSq) continue;
      const d = Math.sqrt(d2);
      const t = 1 - d / hqRadius;
      let dmg = hqDamage * t;
      if (this.game.tutorial) dmg *= PRACTICE_TARGET_HQ_DAMAGE_MULT;
      h.takeDamage(dmg);
    }

    const strafe = attackerType === 'strafe';
    if (!strafe) {
      const mineHitRadius = Math.max(1.5, radius * 0.55);
      this.game.engineerSandbags?.detonateMinesAt?.(
        x,
        z,
        mineHitRadius,
        this.ownerTeam
      );
      this.game.defenses?.detonateMinesAt?.(
        x,
        z,
        mineHitRadius,
        this.ownerTeam
      );
    }
    // Forward every visible impact so a shell that lands on a roof always leaves
    // a matching mark. The old path forwarded one in four impacts at 1.1x damage;
    // 0.275x per impact preserves that structural damage budget.
    this.game.scenery?.damageAt(x, z, radius + 2, unitDamage * 0.275, {
      weaponType: attackerType,
      impact: { x, z },
      explosive: !strafe,
    });
  }

  update(dt) {
    // Manual placement and preset briefings are setup, not battle time. Starting
    // the simulation begins the five-minute weather window for both sides.
    const battleClockRunning = !this.game?.lastStand || this.game.lastStand.phase === 'battle';
    if (battleClockRunning && this.airborneCloudCoverRemaining > 0) {
      this.airborneCloudCoverRemaining = Math.max(
        0,
        this.airborneCloudCoverRemaining - dt
      );
    }

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
