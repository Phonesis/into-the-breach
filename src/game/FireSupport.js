import * as THREE from 'three';
import {
  AIRBORNE_CLOUD_COVER_SECONDS,
  FIRE_SUPPORT_TYPES,
} from '../data/fireSupport.js';
import { PRACTICE_TARGET_HQ_DAMAGE_MULT } from '../data/gameModes.js';
import { sampleTerrainHeight } from '../world/Terrain.js';
import { getIncomingDamageMultiplier } from './CoverSystem.js';
import { getBlastProfile } from './BlastProfile.js';
import {
  spawnStrikeWarning,
  spawnStrafePlane,
  spawnTransportPlane,
  planeFlightEntry,
  transportDoorWorldAt,
  spawnFallingBomb,
  spawnStrikeImpact,
  prewarmStrikeImpacts,
} from '../effects/FireSupportEffects.js';
import { spawnParatrooperExit } from '../effects/ParachuteEffects.js';
import { getParatrooperDef } from '../data/paratroopers.js';
import { sounds, mgProfileForFaction } from '../audio/SoundManager.js';
import { handleFireSupportImpactMorale } from './RetreatBehavior.js';
import { HQ_DEPLOY_RADIUS } from './OpeningDeployZone.js';
import {
  getRadioOperators,
  hasRadioOperator,
  isRadioOperatorPointObserved,
  finishRadioBinocularsAfterSupportCall,
} from './RadioOperatorBehavior.js';
import { WEAPON_RANGE_SLACK } from './Targeting.js';
import { registerIncomingArtilleryStrike } from './ArtilleryThreats.js';

const PLAYER = 'player';
const ENEMY = 'enemy';
const VALID_TARGET_PREVIEW_COLOR = 0x4ade80;
const INVALID_TARGET_PREVIEW_COLOR = 0xef4444;
const PENDING_STRIKE_MARKER_COLOR = 0xfacc15;
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
  truckDriver: 42,
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
    this.pendingStrike = null;
    this.pendingStrikeMarker = null;
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
    const units =
      this.targetTeam === ENEMY ? this.game._enemyAlive : this.game._playerAlive;
    if (this.targetTeam !== PLAYER) return units;
    return [...units, ...(this.game.defenses?.getAttackTargets?.() ?? [])];
  }

  reset() {
    this.pending = null;
    this.clearPendingStrike();
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

    // Re-arming the queued asset cancels it. Selecting a different asset also
    // abandons the old waiting strike before arming the new one.
    if (this.pendingStrike) {
      const sameQueuedStrike = this.pendingStrike.type === type;
      this.cancelPendingStrike();
      if (sameQueuedStrike) return true;
    }

    if (this.pending === type) {
      this.pending = null;
      this.clearPreview();
      return true;
    }
    this.pending = type;
    return true;
  }

  cancel() {
    this.clearPendingStrike();
    this.pending = null;
    this.targetRejectReason = null;
    this.clearPreview();
  }

  hasPendingStrike() {
    return !!this.pendingStrike;
  }

  isPendingStrikeAt(x, z) {
    if (!this.pendingStrike || !Number.isFinite(x) || !Number.isFinite(z)) {
      return false;
    }
    const scale = this._previewStyle(
      this.pendingStrike.type,
      this.getDef(this.pendingStrike.type)
    ).scale;
    return Math.hypot(x - this.pendingStrike.x, z - this.pendingStrike.z) <=
      Math.max(3.5, scale * 0.95);
  }

  _clearPendingStrikeMarker() {
    const marker = this.pendingStrikeMarker;
    if (!marker) return;
    if (marker.parent) marker.parent.remove(marker);
    const geometries = new Set();
    const materials = new Set();
    marker.traverse((child) => {
      if (child.geometry) geometries.add(child.geometry);
      if (Array.isArray(child.material)) {
        child.material.forEach((material) => materials.add(material));
      } else if (child.material) {
        materials.add(child.material);
      }
    });
    geometries.forEach((geometry) => geometry.dispose?.());
    materials.forEach((material) => material.dispose?.());
    this.pendingStrikeMarker = null;
  }

  clearPendingStrike() {
    this.pendingStrike = null;
    this._clearPendingStrikeMarker();
  }

  /** Cancel the waiting strike and leave normal map input available again. */
  cancelPendingStrike() {
    const hadPendingStrike = !!this.pendingStrike;
    this.clearPendingStrike();
    this.pending = null;
    this.targetRejectReason = null;
    this.clearPreview();
    return hadPendingStrike;
  }

  queuePendingStrike(type, x, z, { covered = false, radioId = null } = {}) {
    if (!type || !this.getDef(type) || !Number.isFinite(x) || !Number.isFinite(z)) {
      return false;
    }

    this.clearPendingStrike();
    // The target is fixed once queued. Leave targeting mode immediately so a
    // later battlefield click cannot accidentally replace the pending strike.
    this.pending = null;
    this.pendingStrike = {
      type,
      x,
      z,
      covered: !!covered,
      radioId,
      relayRetryDelay: 0.5,
      relayRetries: 0,
    };
    this.targetRejectReason = null;
    this.clearPreview();

    const def = this.getDef(type);
    const { scale } = this._previewStyle(type, def);
    const marker = new THREE.Group();
    marker.name = 'pending-fire-support-marker';
    marker.userData.pendingFireSupport = true;
    marker.userData.age = 0;
    marker.userData.baseScale = scale;

    const material = new THREE.MeshBasicMaterial({
      color: PENDING_STRIKE_MARKER_COLOR,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.86, 1, 40),
      material
    );
    ring.rotation.x = -Math.PI / 2;
    ring.scale.set(scale, 1, scale);
    ring.userData.pendingStrikeRing = true;
    marker.add(ring);

    const inner = new THREE.Mesh(
      new THREE.RingGeometry(0.22, 0.34, 24),
      material
    );
    inner.rotation.x = -Math.PI / 2;
    inner.position.y = 0.04;
    marker.add(inner);

    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 2.8, 8),
      material
    );
    beacon.position.y = 1.4;
    marker.add(beacon);

    const cap = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 0.55, 8),
      material
    );
    cap.position.y = 2.95;
    marker.add(cap);

    marker.renderOrder = 14;
    marker.traverse((child) => {
      child.renderOrder = 14;
    });
    this.game.scene.add(marker);
    this.pendingStrikeMarker = marker;
    this._updatePendingStrikeMarker(0);
    return true;
  }

  _updatePendingStrikeMarker(dt) {
    const marker = this.pendingStrikeMarker;
    if (!marker || !this.pendingStrike || !this.game.mapDef) return;
    marker.userData.age = (marker.userData.age ?? 0) + Math.max(0, dt);
    const pulse = 1 + Math.sin(marker.userData.age * 5.5) * 0.08;
    const ring = marker.children.find((child) => child.userData.pendingStrikeRing);
    if (ring) {
      const scale = marker.userData.baseScale ?? 1;
      ring.scale.set(scale * pulse, 1, scale * pulse);
    }
    const material = marker.children.find((child) => child.material)?.material;
    if (material) material.opacity = 0.58 + Math.sin(marker.userData.age * 5.5) * 0.14;
    marker.position.set(
      this.pendingStrike.x,
      sampleTerrainHeight(this.pendingStrike.x, this.pendingStrike.z, this.game.mapDef) + 0.25,
      this.pendingStrike.z
    );
    marker.rotation.y += Math.max(0, dt) * 0.45;
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
    if (type === 'airBomb') {
      return { scale: def.hitRadius ?? 9.5 };
    }
    return { scale: def.runLength * 0.5 };
  }

  updatePreview(x, z) {
    if (!this.pending || !this.game.mapDef) return;
    if (this.pendingStrike) return;
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
    for (const unit of observers) {
      if (isRadioOperatorPointObserved(this.game, unit, x, z)) return true;
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

  _commitTarget(type, x, z) {
    if (!type || !this.isReady(type)) return false;
    const rejectReason = this.getTargetRejectReason(type, x, z);
    if (rejectReason) {
      this.targetRejectReason = rejectReason;
      return false;
    }

    this.pending = null;
    this.clearPendingStrike();
    this.targetRejectReason = null;
    this.clearPreview();
    this.cooldowns[type] = this.getDef(type).cooldown;
    this._consumeAirborneUse(type);
    this.scheduleStrike(type, x, z);
    // Calling support while glassing ends the scan and starts the 3 min cooldown
    finishRadioBinocularsAfterSupportCall(this.game, this.ownerTeam, x, z);
    sounds.play('order');
    return true;
  }

  tryPlaceTarget(x, z) {
    const type = this.pending;
    if (!type || !this.isReady(type)) return false;

    const half = this.game.mapDef.size / 2 - 8;
    x = THREE.MathUtils.clamp(x, -half, half);
    z = THREE.MathUtils.clamp(z, -half, half);
    // A click away from an existing marker replaces the waiting target.
    this.clearPendingStrike();
    return this._commitTarget(type, x, z);
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
    finishRadioBinocularsAfterSupportCall(this.game, this.ownerTeam, x, z);
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
      const planeSpeed = 38;
      const factionId = this.ownerFaction?.id ?? 'germany';
      // Enter from off-map so the fighter is already approaching when the run begins
      const entry = planeFlightEntry(mapDef, startX, startZ, perpX, perpZ);
      const approachTime = entry.approachDist / planeSpeed;
      const spawnAt = Math.max(0.05, def.warnTime - approachTime);
      const runStartAt = spawnAt + approachTime;
      // Guns open before the aim corridor and keep firing past it so the burst
      // feels like a continuous fly-by rather than a short snap over the mark.
      const fireLead = def.fireLead ?? 10;
      const fireTrail = def.fireTrail ?? 12;
      const fireLength = def.runLength + fireLead + fireTrail;
      const gunsOpenAt = runStartAt - fireLead / planeSpeed;
      const flyDuration =
        approachTime + (def.runLength + fireTrail) / planeSpeed + 1.2;

      spawnStrikeWarning(scene, mapDef, tx, tz, def.runLength * 0.5, false);

      // Impacts track the fighter along the extended gun run (lead → corridor → trail).
      // Light lateral scatter so the scar trail reads as a spray, not a dotted line.
      const hitCount = def.hitCount;
      const strafeImpacts = [];
      for (let i = 0; i < hitCount; i++) {
        const ratio = i / Math.max(1, hitCount - 1);
        const along = -fireLead + fireLength * ratio;
        const lateral = (Math.random() - 0.5) * 2.4;
        strafeImpacts.push({
          t: runStartAt + along / planeSpeed,
          x: startX + perpX * along + dx * lateral,
          z: startZ + perpZ * along + dz * lateral,
        });
      }
      prewarmStrikeImpacts(this.game.renderer, mapDef, strafeImpacts, false, this.game.scene);

      this.events.push({
        at: spawnAt,
        fn: () => {
          spawnStrafePlane(
            scene,
            mapDef,
            startX,
            startZ,
            perpX,
            perpZ,
            flyDuration,
            22,
            factionId,
            planeSpeed
          );
          sounds.startStrafeFlyby({
            x: entry.x,
            z: entry.z,
            velX: perpX * planeSpeed,
            velZ: perpZ * planeSpeed,
            duration: flyDuration,
            factionId,
            leadUnits: 0,
            trailUnits: 24,
          });
        },
      });

      // Staggered MG bursts across the gun run so audio covers the full fly-by.
      const fireDuration = fireLength / planeSpeed;
      for (const frac of [0, 0.34, 0.68]) {
        const at = gunsOpenAt + fireDuration * frac;
        this.events.push({
          at: Math.max(0.05, at),
          fn: () => {
            sounds.playWeapon(mgProfileForFaction(factionId), { x: tx, z: tz }, {
              rate: 0.85,
              volume: 0.9,
            });
          },
        });
      }

      for (const impact of strafeImpacts) {
        const { t, x: ix, z: iz } = impact;
        this.events.push({
          at: Math.max(0.05, t),
          fn: () => {
            spawnStrikeImpact(scene, mapDef, ix, iz, 'strafe', this.game._terrainMesh);
            this.applyDamage(ix, iz, def.hitRadius, def.damage, def.hqDamage * 0.15, 'strafe');
          },
        });
      }
      registerIncomingArtilleryStrike(this.game, {
        ownerTeam: this.ownerTeam,
        kind: type,
        center: { x: tx, z: tz },
        alertRadius:
          def.runLength * 0.5 + (def.fireLead ?? 10) + (def.fireTrail ?? 12) + 4,
        impacts: strafeImpacts.map(({ t, x: ix, z: iz }) => ({
          x: ix,
          z: iz,
          impactIn: t,
          radius: def.hitRadius,
        })),
      });
    } else if (type === 'airBomb') {
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

      const runLen = def.runLength;
      const planeSpeed = def.planeSpeed ?? 36;
      const altitude = def.planeAltitude ?? 30;
      const fallTime = def.fallTime ?? 1.28;
      const releaseRatio = def.releaseRatio ?? 0.44;
      const startX = tx - perpX * (runLen * 0.5);
      const startZ = tz - perpZ * (runLen * 0.5);
      const factionId = this.ownerFaction?.id ?? 'germany';

      // Release slightly before the aim point so the bomb carries forward onto target.
      const releaseAlong = runLen * releaseRatio;
      const releaseX = startX + perpX * releaseAlong;
      const releaseZ = startZ + perpZ * releaseAlong;

      // Enter from off-map; time bomb release for when the plane reaches the rack point
      const entry = planeFlightEntry(mapDef, startX, startZ, perpX, perpZ);
      const approachTime = entry.approachDist / planeSpeed;
      const spawnAt = Math.max(0.05, def.warnTime - approachTime);
      const releaseDist = Math.hypot(releaseX - entry.x, releaseZ - entry.z);
      const releaseAt = spawnAt + releaseDist / planeSpeed;
      const flyDuration = approachTime + runLen / planeSpeed + 1.4;

      spawnStrikeWarning(scene, mapDef, tx, tz, def.hitRadius, true);
      prewarmStrikeImpacts(this.game.renderer, mapDef, [{ x: tx, z: tz }], true, this.game.scene);
      registerIncomingArtilleryStrike(this.game, {
        ownerTeam: this.ownerTeam,
        kind: type,
        center: { x: tx, z: tz },
        alertRadius: def.hitRadius + 3,
        impacts: [{
          x: tx,
          z: tz,
          impactIn: releaseAt + fallTime,
          radius: def.hitRadius,
        }],
      });

      this.events.push({
        at: spawnAt,
        fn: () => {
          spawnStrafePlane(
            scene,
            mapDef,
            startX,
            startZ,
            perpX,
            perpZ,
            flyDuration,
            altitude,
            factionId,
            planeSpeed
          );
          sounds.startStrafeFlyby({
            x: entry.x,
            z: entry.z,
            velX: perpX * planeSpeed,
            velZ: perpZ * planeSpeed,
            duration: flyDuration,
            factionId,
            leadUnits: 0,
            trailUnits: 24,
          });
        },
      });

      this.events.push({
        at: Math.max(0.1, releaseAt),
        fn: () => {
          const releaseY = sampleTerrainHeight(releaseX, releaseZ, mapDef) + altitude - 0.8;
          const impactY = sampleTerrainHeight(tx, tz, mapDef) + 0.15;
          spawnFallingBomb(
            scene,
            { x: releaseX, y: releaseY, z: releaseZ },
            { x: tx, y: impactY, z: tz },
            fallTime,
            () => {
              spawnStrikeImpact(scene, mapDef, tx, tz, 'bomb', this.game._terrainMesh, {
                craterRadius: def.craterRadius,
              });
              this.applyDamage(
                tx,
                tz,
                def.hitRadius,
                def.damage,
                def.hqDamage,
                'airBomb'
              );
              sounds.playBombExplosion({ x: tx, z: tz });
            }
          );
        },
      });

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
        impacts.push({ x: ix, z: iz, impactIn: t });
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
      registerIncomingArtilleryStrike(this.game, {
        ownerTeam: this.ownerTeam,
        kind: type,
        center: { x: tx, z: tz },
        alertRadius: def.radius + 3,
        impacts: impacts.map(({ x, z, impactIn }) => ({
          x,
          z,
          impactIn,
          radius: def.radius * 0.35 + 2.5,
        })),
      });
      prewarmStrikeImpacts(this.game.renderer, mapDef, impacts, false, this.game.scene);
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
        impacts.push({ x: ix, z: iz, impactIn: t });
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
      registerIncomingArtilleryStrike(this.game, {
        ownerTeam: this.ownerTeam,
        kind: type,
        center: {
          x: (startX + tx) * 0.5,
          z: (startZ + tz) * 0.5,
        },
        alertRadius: def.creepLength * 0.55 + def.laneWidth + 4,
        impacts: impacts.map(({ x, z, impactIn }) => ({
          x,
          z,
          impactIn,
          radius: def.hitRadius + 2.5,
        })),
      });
      prewarmStrikeImpacts(this.game.renderer, mapDef, impacts, false, this.game.scene);
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
      // Drop run perpendicular to HQ→target so the transport crosses the DZ
      const perpX = -dz;
      const perpZ = dx;
      const runLen = def.dropRadius * 3.4;
      const startX = tx - perpX * runLen * 0.5;
      const startZ = tz - perpZ * runLen * 0.5;
      // Transports are slower / heavier than fighters
      const planeSpeed = def.planeSpeed ?? 28;
      const planeAlt = def.planeAltitude ?? 38;
      const factionId = this.ownerFaction?.id ?? 'germany';
      const entry = planeFlightEntry(mapDef, startX, startZ, perpX, perpZ, 28);
      const approachTime = entry.approachDist / planeSpeed;
      const spawnAt = Math.max(0.05, def.warnTime - approachTime);
      const flyDuration = approachTime + runLen / planeSpeed + 2.2;
      const squadCount = def.squadCount ?? 5;
      const dropRadius = def.dropRadius ?? 11;

      // Capture flight params for staggered door exits (no live plane ref needed)
      let flight = null;

      this.events.push({
        at: spawnAt,
        fn: () => {
          flight = spawnTransportPlane(
            scene,
            mapDef,
            startX,
            startZ,
            perpX,
            perpZ,
            flyDuration,
            planeAlt,
            factionId,
            planeSpeed
          );
          sounds.startStrafeFlyby({
            x: flight.entryX,
            z: flight.entryZ,
            velX: flight.nx * planeSpeed,
            velZ: flight.nz * planeSpeed,
            duration: flyDuration,
            factionId,
            kind: 'transport',
            leadUnits: 0,
            trailUnits: 32,
          });
        },
      });

      // Stagger jumps along the run so squads visibly leave the cargo door
      for (let i = 0; i < squadCount; i++) {
        const tAlong = 0.18 + (i / Math.max(1, squadCount - 1 || 1)) * 0.58;
        const jumpAt = spawnAt + approachTime + (runLen * tAlong) / planeSpeed;
        const landAngle = (i / squadCount) * Math.PI * 2 + Math.random() * 0.4;
        const landR = Math.sqrt(Math.random()) * dropRadius * 0.88;
        const landX = tx + Math.cos(landAngle) * landR;
        const landZ = tz + Math.sin(landAngle) * landR;

        this.events.push({
          at: Math.max(def.warnTime * 0.85, jumpAt),
          fn: () => {
            const age = approachTime + (runLen * tAlong) / planeSpeed;
            const doorLocal = flight?.doorLocal ?? { x: -1, y: -0.2, z: -1.1 };
            const yaw = flight?.yaw ?? Math.atan2(perpX, perpZ);
            const entryX = flight?.entryX ?? entry.x;
            const entryZ = flight?.entryZ ?? entry.z;
            const baseY = sampleTerrainHeight(entryX, entryZ, mapDef) + planeAlt;
            const exit = transportDoorWorldAt({
              entryX,
              entryZ,
              baseY,
              nx: flight?.nx ?? perpX,
              nz: flight?.nz ?? perpZ,
              speed: planeSpeed,
              age,
              doorLocal,
              yaw,
            });
            spawnParatrooperExit(this.game, {
              def: getParatrooperDef(this.ownerFaction?.id),
              faction: this.ownerFaction,
              team: this.ownerTeam,
              exit,
              landX,
              landZ,
              velX: (flight?.nx ?? perpX) * planeSpeed,
              velZ: (flight?.nz ?? perpZ) * planeSpeed,
              descentRate: def.descentRate,
            });
            if (i === 0) sounds.play('spawn');
          },
        });
      }
    }
  }

  applyDamage(x, z, radius, unitDamage, hqDamage, attackerType = 'artillery') {
    const cover = this.game.coverSystem;
    const radiusSq = radius * radius;
    const hqRadius = radius * 1.2;
    const hqRadiusSq = hqRadius * hqRadius;
    const strafe = attackerType === 'strafe';
    const airBomb = attackerType === 'airBomb';
    const bombDef = FIRE_SUPPORT_TYPES.airBomb;
    const blastProfile = !strafe
      ? getBlastProfile({
          weaponType: airBomb ? 'airBomb' : 'artillery',
          caliber: airBomb ? 250 : null,
          radius,
          launchRadius: airBomb ? bombDef.directHitRadius : null,
        })
      : null;
    const retreatUnits = this.game._aliveUnits ?? this.game.units ?? [];
    const retreatOptions = {
      generalOrders: {
        player: this.game.generalOrders,
        enemy: this.game.enemyGeneralOrders,
      },
      clearance: !!this.game.clearance,
      clearanceRole: this.game.clearanceRole,
      mapDef: this.game.mapDef,
      scenery: this.game.scenery,
    };

    for (const u of this.targetUnits ?? []) {
      const dx = u.position.x - x;
      const dz = u.position.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 > radiusSq) continue;
      const d = Math.sqrt(d2);
      const t = 1 - d / radius;
      let dmg = unitDamage * t * t;
      const incomingCoverMultiplier = getIncomingDamageMultiplier(u, cover, {
        def: { type: attackerType },
        position: { x, z },
      });
      dmg *= incomingCoverMultiplier;
      if (airBomb && u.def && d <= (bombDef.directHitRadius ?? 2.5)) {
        dmg *= bombDef.directHitDamageMult ?? 1.15;
      }
      const wasDead = u.dead;
      const explosive = !strafe;
      u.takeDamage(dmg, {
        explosive,
        blastOrigin: explosive ? { x, z } : undefined,
        impactFrom: explosive ? { x, z } : undefined,
        ...(blastProfile ?? {}),
        blastImpulseScale: blastProfile
          ? blastProfile.blastImpulseScale *
            Math.sqrt(Math.max(0.3, incomingCoverMultiplier))
          : undefined,
      });
      if (!wasDead && u.dead && u.def && u.team !== this.ownerTeam) {
        // Fire-support kills do not pass through the direct-fire combat event;
        // forward them so persistent combat achievements see barrage kills too.
        this.game._recordAchievementCombatEvent?.({
          attacker: { team: this.ownerTeam, def: { type: attackerType } },
          target: u,
          killed: true,
        });
      }
      if (dmg > 0) {
        handleFireSupportImpactMorale(
          u,
          this.game.hqs ?? [],
          retreatUnits,
          retreatOptions
        );
      }
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

    if (!strafe) {
      const mineHitRadius = Math.max(1.5, radius * (airBomb ? 0.7 : 0.55));
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
    // Air bombs are single large HE — stronger structural damage than a shelllet.
    this.game.scenery?.damageAt(x, z, radius + 2, unitDamage * (airBomb ? 0.55 : 0.275), {
      weaponType: airBomb ? 'artillery' : attackerType,
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

    this._updatePendingStrikeMarker(dt);
    if (this.pendingStrike) {
      const queued = this.pendingStrike;
      if (!this.hasCommandLink()) {
        this.cancelPendingStrike();
        this.game.ui?.updateFireSupport?.(this);
        this.game._syncBattleCursor?.();
      } else if (!this.getTargetRejectReason(queued.type, queued.x, queued.z)) {
        if (this._commitTarget(queued.type, queued.x, queued.z)) {
          this.game.ui?.updateFireSupport?.(this);
          this.game._syncBattleCursor?.();
        }
      } else if (this.ownerTeam === PLAYER && queued.radioId && queued.relayRetries < 2) {
        queued.relayRetryDelay = Math.max(0, (queued.relayRetryDelay ?? 0) - dt);
        if (
          queued.relayRetryDelay <= 0 &&
          this.game._resumePendingRadioOperatorStrike?.(queued)
        ) {
          queued.relayRetries += 1;
          queued.relayRetryDelay = 1.25;
        }
      }
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
