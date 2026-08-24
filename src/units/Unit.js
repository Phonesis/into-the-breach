import * as THREE from 'three';
import {
  applyUnitDeathVisual,
  createUnitMesh,
  disposeUnitCorpseVisuals,
  setSelectionRing,
  updateSquadCasualtyVisual,
} from './UnitMeshes.js';
import { clearRetreat, removeRetreatMarker } from '../game/RetreatBehavior.js';
import {
  clearSurrender,
  markUnderFire,
  removeSurrenderMarker,
} from '../game/SurrenderBehavior.js';
import { removeCoverMarker } from '../visual/CoverMarkers.js';
import { removeFieldIcon } from '../visual/UnitFieldIcons.js';
import { removeRankMarker } from '../game/EliteBehavior.js';
import { removeHealMarker } from '../visual/HealMarkers.js';
import { removeMoraleMarker } from '../visual/MoraleMarkers.js';
import { removeDamageSmoke } from '../visual/DamageSmoke.js';
import { removeUnitHealthBar } from '../visual/UnitHealthBars.js';
import {
  createSmokeShellTarget,
  canEngageManualOrder,
  distanceBetween,
  getStandoffPosition,
  isCrewlessVehicleTarget,
} from '../game/Targeting.js';
import {
  buildMovePath,
  snapUrbanRoadDestination,
  unitPathPlanRadius,
} from '../game/MovePath.js';
import {
  getMoveReachConfig,
  isVehicleUnit,
  shouldUseTacticalReverse,
  TANK_TYPES,
} from './VehicleTypes.js';
import { sounds, isInfantryUnitType, isVehicleCrewVoiceType } from '../audio/SoundManager.js';
import { removeWreckEffect } from '../effects/WreckEffects.js';
import { classifyVehicleKnockout } from '../game/VehicleKnockout.js';
import { sampleTerrainMeshHeight } from '../world/Terrain.js';

let nextId = 1;

export function setUnitNextId(n) {
  nextId = Math.max(1, Math.floor(n) || 1);
}

export function peekUnitNextId() {
  return nextId;
}

export class Unit {
  constructor({ def, faction, team, position, scene }) {
    this.id = nextId++;
    this.def = def;
    this.faction = faction;
    this.team = team;
    this.hp = def.hp;
    this.maxHp = def.hp;
    this.selected = false;
    this.target = null;
    this.attackOrder = null;
    this.moveTarget = null;
    this._movePath = null;
    this._userMoveOrder = false;
    this._reverseMoveOrder = false;
    this._autoMoveOrderX = null;
    this._autoMoveOrderZ = null;
    this._bunkerEntryId = null;
    this.attackCooldown = 0;
    this.mgCooldown = 0;
    this.grenadeCooldown = 0;
    this.smokeShellCooldown = 0;
    this.dead = false;
    this._blastProfile = null;
    this._deathBlastOrigin = null;
    this._deathBlastRadius = null;
    this._deathBlastCaliber = null;
    this._deathBlastLaunchRadius = null;
    this._deathBlastKnockdownRadius = null;
    this._deathBlastImpulseScale = null;
    this._deathBlastWeaponType = null;
    this.wreckTimeLeft = 0;
    this.corpseTimeLeft = 0;
    this.wreckFire = null;
    this._wreckImpactCount = 0;
    this._wreckRunOverCount = 0;
    this._wreckRunOverDamage = 0;
    this._wreckReducedToRubble = false;
    this._wreckCrushed = false;
    this._wreckCrushFxDone = false;
    this._chasingAttack = false;
    /** Player/AI click-attack that must not be discarded by Hold stance or brief LOS breaks. */
    this._hardAttackOrder = false;
    this.engagementStance = 'hold';
    /**
     * An ordered target has reached weapon range at least once. Hold Ground
     * may close to an initially distant target, but this flag prevents that
     * same order from turning into a chase after the target withdraws.
     */
    this._attackOrderReachedRange = false;
    /**
     * Player artillery only: Game settings apply the saved default when a unit
     * enters the battle. Ordered fire missions still work when this is false;
     * enemy artillery ignores this and always auto-fires.
     */
    this.autoFire = false;
    /** null follows the global Seek Cover setting; booleans are unit overrides. */
    this.seekCoverOverride = null;
    this._stancePursuitOrder = false;
    this._stanceBoundAttackOrder = false;
    this._mgVolley = 0;
    this.retreating = false;
    this._retreatDestination = null;
    this._retreatArrivalRadius = null;
    this._fullRetreatOrderId = null;
    this._fullRetreatRallyHold = false;
    this.retreatMarker = null;
    this.surrendered = false;
    this.surrenderMarker = null;
    this._underFireTimer = 0;
    this._liberationGrace = 0;
    this._captureExit = null;
    this.fieldIcon = null;
    this.killCount = 0;
    this.veteran = false;
    this.elite = false;
    this.rankMarker = null;
    this.healMarker = null;
    this.healMarkerKind = null;
    this.damageSmoke = null;
    this.defensiveHold = null;
    this._mobilityDamaged = false;
    this._mobilityDamageKind = null;
    this._mobilityRepairProgress = 0;
    this._surrenderOnRetreat = false;
    // Wheeled vehicles build and shed speed instead of reaching full speed
    // instantly. This is transient movement state, not saved battle state.
    this._driveSpeed = 0;
    this._trackCrushEscapeUntil = 0;
    // Set on a spawned bailout team so it can reclaim only its original hull.
    this._bailoutSourceVehicleId = null;
    // Friendly-traffic manoeuvre state. Battle saves retain it so a unit saved
    // while pulled aside still knows to return to its original position.
    this._trafficYield = null;

    this.mesh = createUnitMesh(def.type, faction.color, faction.accent, faction.id);
    this.mesh.position.set(position.x, 0, position.z);
    this.mesh.userData.unit = this;
    scene.add(this.mesh);
    // createUnitMesh owns shadow policy. In particular, infantry intentionally
    // cast only a few silhouette shadows; forcing every limb, weapon and hidden
    // helper into the 4096px sun-shadow pass becomes prohibitive in large fights.
  }

  get position() {
    return this.mesh.position;
  }

  get type() {
    return this.def.type;
  }

  get name() {
    return this.def.name;
  }

  setSelected(on) {
    this.selected = on;
    setSelectionRing(this.mesh, on);
  }

  setAttackOrder(target, { manualFire = false, respectStance = false } = {}) {
    if (this.surrendered || this._captureExit) return false;
    if (isCrewlessVehicleTarget(target)) return false;
    if (
      this.def?.type === 'artillery' &&
      target?.def === undefined &&
      (this.def.minRange ?? 0) > 0 &&
      distanceBetween(this, target) < this.def.minRange
    ) {
      return false;
    }
    // respectStance is only for rare callers that want Hold Ground to refuse
    // out-of-range unit orders. Player click-attacks never pass it — they must
    // always bind and close with the chosen target.
    const stanceBoundTarget = respectStance && target?.def !== undefined;
    if (
      stanceBoundTarget &&
      this.engagementStance !== 'pursue' &&
      !canEngageManualOrder(this, target)
    ) {
      return false;
    }
    clearRetreat(this);
    this.attackOrder = target;
    this.target = target;
    this._manualFireMission = manualFire;
    this._stanceBoundAttackOrder = stanceBoundTarget;
    // Explicit orders survive brief LOS blocks until the target dies or the
    // player cancels. Hold/Pursue decide whether an order keeps advancing.
    this._hardAttackOrder = !stanceBoundTarget;
    this._attackOrderReachedRange =
      !!target &&
      !target.isGround &&
      !target.isSmokeShell &&
      canEngageManualOrder(this, target);
    // Close with any selected target that starts out of range. Hold stops
    // advancing once the target has been reached and subsequently withdraws.
    this._chasingAttack = !stanceBoundTarget || this.engagementStance === 'pursue';
    this._stancePursuitOrder = false;
    this._userMoveOrder = false;
    this._movePath = null;
    this._finalMoveGoal = null;
    if (target && !target.dead && this._chasingAttack) {
      this.moveTarget = getStandoffPosition(this, target);
    } else {
      this.moveTarget = null;
    }
    return true;
  }

  clearAttackOrder() {
    this.attackOrder = null;
    this.target = null;
    this._chasingAttack = false;
    this._hardAttackOrder = false;
    this._stancePursuitOrder = false;
    this._stanceBoundAttackOrder = false;
    this._attackOrderReachedRange = false;
    this._manualFireMission = false;
    this._bunkerEntryId = null;
  }

  setAutoFire(on) {
    if (this.def?.type !== 'artillery') return false;
    const next = !!on;
    const changed = this.autoFire !== next;
    this.autoFire = next;
    return changed;
  }

  setSeekCoverOverride(value) {
    const next = value === true || value === false ? value : null;
    const changed = this.seekCoverOverride !== next;
    this.seekCoverOverride = next;
    return changed;
  }

  setEngagementStance(stance) {
    const next = stance === 'pursue' ? 'pursue' : 'hold';
    const changed = this.engagementStance !== next;
    this.engagementStance = next;
    if (next === 'hold') {
      // An explicit order still closes to an initially distant target, but a
      // held unit must stop when a target it has engaged withdraws.
      if (this._hardAttackOrder && this.attackOrder && !this.attackOrder.dead) {
        const inRange = canEngageManualOrder(this, this.attackOrder);
        if (inRange) this._attackOrderReachedRange = true;
        if (
          !this._attackOrderReachedRange &&
          !this.attackOrder.isGround &&
          !this.attackOrder.isSmokeShell
        ) {
          this._chasingAttack = true;
          this.moveTarget = getStandoffPosition(this, this.attackOrder);
        } else {
          this._chasingAttack = false;
          this.moveTarget = null;
          this._movePath = null;
          this._finalMoveGoal = null;
        }
        return changed;
      }
      const orderedUnit = this.attackOrder?.def !== undefined;
      const pursuingUnit =
        orderedUnit || (this.target?.def !== undefined && this._chasingAttack);
      if (orderedUnit && !canEngageManualOrder(this, this.attackOrder)) {
        this.clearAttackOrder();
      } else if (orderedUnit) {
        // Soft auto-bind: hold position, drop if the target later leaves range.
        this._stancePursuitOrder = false;
        this._stanceBoundAttackOrder = true;
      }
      if (pursuingUnit || this._stancePursuitOrder) {
        this.moveTarget = null;
        this._movePath = null;
        this._finalMoveGoal = null;
        this._chasingAttack = false;
      }
    } else if (this._hardAttackOrder && this.attackOrder && !this.attackOrder.dead) {
      this._chasingAttack = true;
      if (
        !canEngageManualOrder(this, this.attackOrder) &&
        !this.attackOrder.isGround &&
        !this.attackOrder.isSmokeShell
      ) {
        this.moveTarget = getStandoffPosition(this, this.attackOrder);
      }
    } else if (this._stanceBoundAttackOrder && this.attackOrder?.def !== undefined) {
      // A held in-range order becomes a live pursuit order. It remains still
      // while the target is in range and resumes movement if the target pulls away.
      this._chasingAttack = true;
    }
    return changed;
  }

  cancelManualFireMission() {
    if (
      !this.attackOrder?.isGround &&
      !this.attackOrder?.isSmokeShell &&
      !this._manualFireMission
    )
      return false;
    this.clearAttackOrder();
    this.moveTarget = null;
    this._movePath = null;
    this._userMoveOrder = false;
    return true;
  }

  /** @deprecated use cancelManualFireMission */
  cancelGroundFire() {
    return this.cancelManualFireMission();
  }

  setGroundAttack(groundTarget) {
    if (this.surrendered || this._captureExit) return false;
    if (
      (this.def?.minRange ?? 0) > 0 &&
      distanceBetween(this, groundTarget) < this.def.minRange
    ) {
      return false;
    }
    clearRetreat(this);
    this.attackOrder = groundTarget;
    this.target = groundTarget;
    this._stanceBoundAttackOrder = false;
    this._hardAttackOrder = false;
    this._attackOrderReachedRange = false;
    this._chasingAttack = false;
    this._userMoveOrder = false;
    this._movePath = null;
    this.moveTarget = null;
    return true;
  }

  setSmokeShellOrder(x, z) {
    if (this.surrendered || this._captureExit) return false;
    if (this.def?.type !== 'artillery') return false;
    const target = createSmokeShellTarget(x, z);
    if (
      (this.def.minRange ?? 0) > 0 &&
      distanceBetween(this, target) < this.def.minRange
    ) {
      return false;
    }
    clearRetreat(this);
    this.attackOrder = target;
    this.target = target;
    this._stanceBoundAttackOrder = false;
    this._hardAttackOrder = false;
    this._attackOrderReachedRange = false;
    this._manualFireMission = true;
    this._chasingAttack = false;
    this._userMoveOrder = false;
    this._movePath = null;
    this.moveTarget = null;
    return true;
  }

  /**
   * @param {number} x
   * @param {number} z
   * @param {object} [mapDef]
   * @param {boolean} [playerOrder] — player-issued moves are not cancelled by combat auto-fire
   * @param {object|null} [scenery]
   * @param {{ allowBuildingId?: string|null, trenchManager?: object|null }} [options]
   *   — building id to enter (garrison) and live trench state for vehicle routing
   */
  moveTo(x, z, mapDef = null, playerOrder = false, scenery = null, options = {}) {
    if (this.surrendered || this._captureExit) return;
    if (this._mobilityDamaged) {
      this.moveTarget = null;
      this._movePath = null;
      this._userMoveOrder = false;
      return;
    }
    // A real order always takes priority over a temporary request to clear a
    // friendly unit's lane.
    this._trafficYield = null;
    // Preserve enter-building order across clearAttackOrder (which resets entry id).
    const allowBuildingId = options.allowBuildingId ?? null;
    const trenchManager = options.trenchManager ?? this._infantryTrenches ?? null;
    if (playerOrder && !allowBuildingId) {
      const snapped = snapUrbanRoadDestination(
        x,
        z,
        this.def.type,
        mapDef,
        this.position.x,
        this.position.z,
        scenery
      );
      x = snapped.x;
      z = snapped.z;
    }
    clearRetreat(this);
    this.clearAttackOrder();
    this._bunkerEntryId = allowBuildingId;
    this._userMoveOrder = playerOrder;
    this._chasingAttack = false;
    this._autoMoveOrderX = null;
    this._autoMoveOrderZ = null;
    this._finalMoveGoal = { x, z };
    this._pathRepathAttempts = 0;
    this._lastPathRepathX = null;
    this._lastPathRepathZ = null;
    this._urbanCanalRoute = null;
    this._lastPathRepathAt = 0;
    if (playerOrder) this._pendingMountTankId = null;

    // A short click into a tank's rear arc is a tactical withdrawal: retain
    // the hull's current facing so frontal armour and the turret stay toward
    // the threat. Longer moves still turn around and use normal pathing.
    this._reverseMoveOrder =
      playerOrder && shouldUseTacticalReverse(this, x, z);

    // All ground units path around buildings unless ordered into one (garrison).
    // Use inflated plan radius so vehicles stay in the carriageway, not façades.
    if (mapDef && (playerOrder || scenery || trenchManager)) {
      const { pathSegment } = getMoveReachConfig(this.def.type);
      const radius = unitPathPlanRadius(this.def.type, mapDef);
      this._movePath = buildMovePath(
        this.position.x,
        this.position.z,
        x,
        z,
        mapDef,
        pathSegment,
        {
          scenery,
          radius,
          avoidBuildings: !!scenery,
          allowBuildingId,
          preferUrbanRoads:
            isVehicleUnit(this.def.type) || mapDef?.terrain === 'urban',
          allowTrackedBuildingCrush: TANK_TYPES.has(this.def.type),
          trenchManager,
          unitTeam: this.team,
          unitType: this.def.type,
        }
      );
      while (
        this._movePath.length > 1 &&
        Math.hypot(this._movePath[0].x - this.position.x, this._movePath[0].z - this.position.z) < 2
      ) {
        this._movePath.shift();
      }
      this.moveTarget = { ...this._movePath[0] };
    } else {
      this._movePath = null;
      this.moveTarget = { x, z };
    }
  }

  distanceTo(other) {
    if (!other) return Infinity;
    if (other.def !== undefined) {
      const dx = this.position.x - other.position.x;
      const dz = this.position.z - other.position.z;
      return Math.sqrt(dx * dx + dz * dz);
    }
    return distanceBetween(this, other);
  }

  /**
   * @param {number} amount
   * @param {object} [opts]
   * @param {boolean} [opts.explosive] — shell / blast damage
   * @param {{x:number,z:number}} [opts.blastOrigin] — detonation point for corpse throws
   */
  takeDamage(amount, opts = {}) {
    if (this.dead || this.surrendered || this._captureExit) return;
    if (amount <= 0) return;
    // Keep every damage source — direct fire, splash, mines, emplacements, and
    // off-map support — visible to morale and AI incoming-fire reactions.
    markUnderFire(this);
    this.hp -= amount;
    const crushingHit = opts.cause === 'crush' || opts.crushed;
    const explosiveHit = !crushingHit && (opts.explosive || opts.cause === 'explosion');
    const blastPoint = opts.blastOrigin ?? opts.impact ?? opts.impactFrom ?? null;
    const blastOrigin =
      blastPoint && Number.isFinite(blastPoint.x) && Number.isFinite(blastPoint.z)
        ? { x: blastPoint.x, z: blastPoint.z }
        : null;
    const blastProfile = explosiveHit
      ? {
          blastOrigin,
          blastRadius: opts.blastRadius ?? null,
          blastCaliber: opts.blastCaliber ?? null,
          blastLaunchRadius: opts.blastLaunchRadius ?? null,
          blastKnockdownRadius: opts.blastKnockdownRadius ?? null,
          blastImpulseScale: opts.blastImpulseScale ?? null,
          blastWeaponType: opts.blastWeaponType ?? null,
        }
      : null;

    // Keep the most recent HE profile on living squads so a save/load or a
    // second casualty update can recreate the same physical response.
    this._blastProfile = blastProfile;
    if (opts.impactFrom && Number.isFinite(opts.impactFrom.x) && Number.isFinite(opts.impactFrom.z)) {
      this._lastImpactFrom = { x: opts.impactFrom.x, z: opts.impactFrom.z };
    }

    // A lethal hit is rendered in one pass below, after its cause is known.
    // Nonlethal explosive damage still removes individual squad members here,
    // so those casualties need the same launch as a whole-squad blast death.
    if (this.hp > 0) {
      updateSquadCasualtyVisual(
        this,
        crushingHit
          ? { crushed: true }
          : blastProfile ?? { impactFrom: this._lastImpactFrom ?? opts.impactFrom }
      );
    }

    // Foot troops and AFV crews yell when hit (not on the killing blow).
    if (
      this.hp > 0 &&
      (isInfantryUnitType(this.def?.type) || isVehicleCrewVoiceType(this.def?.type))
    ) {
      const now = performance.now();
      // Per-unit cooldown so one squad doesn't spam every bullet
      if (now - (this._lastUnderFireVoiceAt ?? 0) > 2400) {
        this._lastUnderFireVoiceAt = now;
        if (Math.random() < 0.55) {
          const factionId =
            this.faction?.id ?? this.faction?.factionId ?? this.def?.factionId ?? null;
          sounds.playUnderFire(
            { x: this.position.x, z: this.position.z },
            factionId,
            {
              team: this.team,
              radio: this.team === 'player',
              unitType: this.def?.type,
            }
          );
        }
      }
    }

    if (this.hp <= 0) {
      this.hp = 0;
      const knockout = classifyVehicleKnockout(this, opts);
      this._rearHitKill = knockout.rearHit;
      this._catastrophicVehicleKill = knockout.catastrophic;
      this._recoverableWreck = knockout.recoverable && !this._crewBailedOut;
      this._preWreckYaw = this.mesh.rotation?.y ?? 0;
      this.dead = true;
      if (crushingHit) {
        this._deathCause = 'crush';
        this._deathBlastOrigin = null;
        this._deathBlastRadius = null;
        this._deathBlastCaliber = null;
        this._deathBlastLaunchRadius = null;
        this._deathBlastKnockdownRadius = null;
        this._deathBlastImpulseScale = null;
        this._deathBlastWeaponType = null;
      } else if (explosiveHit) {
        this._deathCause = 'explosion';
        // Preserve the detonation profile for per-member distance classification.
        this._deathBlastOrigin = blastOrigin;
        this._deathBlastRadius = opts.blastRadius ?? null;
        this._deathBlastCaliber = opts.blastCaliber ?? null;
        this._deathBlastLaunchRadius = opts.blastLaunchRadius ?? null;
        this._deathBlastKnockdownRadius = opts.blastKnockdownRadius ?? null;
        this._deathBlastImpulseScale = opts.blastImpulseScale ?? null;
        this._deathBlastWeaponType = opts.blastWeaponType ?? null;
      } else {
        this._deathCause = 'bullet';
        this._deathImpactFrom = this._lastImpactFrom ?? opts.impactFrom ?? null;
        this._deathBlastOrigin = null;
        this._deathBlastRadius = null;
        this._deathBlastCaliber = null;
        this._deathBlastLaunchRadius = null;
        this._deathBlastKnockdownRadius = null;
        this._deathBlastImpulseScale = null;
        this._deathBlastWeaponType = null;
      }
      clearRetreat(this);
      clearSurrender(this);
      removeCoverMarker(this);
      removeFieldIcon(this);
      removeRankMarker(this);
      removeHealMarker(this);
      removeMoraleMarker(this);
      removeDamageSmoke(this);
      removeUnitHealthBar(this);
      if (this.selected) this.setSelected(false);
      applyUnitDeathVisual(this);
    }
  }

  /** Restore a recoverable knocked-out vehicle with a fresh live mesh. */
  restoreRecoverableVehicle(coverSystem = null) {
    if (!this.dead || !this._recoverableWreck || !this.mesh?.parent) return false;

    const oldMesh = this.mesh;
    const parent = oldMesh.parent;
    const position = oldMesh.position.clone();
    if (this._mapDef) {
      position.y = sampleTerrainMeshHeight(
        this._terrainMesh,
        position.x,
        position.z,
        this._mapDef
      );
    }
    const yaw = this._preWreckYaw ?? oldMesh.rotation.y ?? 0;
    if (this.wreckFire) {
      removeWreckEffect(this.wreckFire);
      this.wreckFire = null;
    }

    const replacement = createUnitMesh(
      this.def.type,
      this.faction.color,
      this.faction.accent,
      this.faction.id
    );
    replacement.position.copy(position);
    replacement.rotation.y = yaw;
    replacement.userData.unit = this;
    parent.add(replacement);
    parent.remove(oldMesh);
    oldMesh.traverse((child) => {
      child.geometry?.dispose?.();
      if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose?.());
      else child.material?.dispose?.();
    });

    this.mesh = replacement;
    this.dead = false;
    // The engineer has restarted the hull, but a bailed-out vehicle has no crew.
    // It remains immobile and unable to fire until an infantry/airborne squad
    // supplies two replacement crewmen.
    this._crewless = true;
    this._replacementCrewUnitId = null;
    this.hp = Math.max(1, this.maxHp * 0.28);
    this.target = null;
    this.attackOrder = null;
    this.moveTarget = null;
    this._movePath = null;
    this._recoverableWreck = false;
    this._catastrophicVehicleKill = false;
    this._rearHitKill = false;
    this._vehicleKillFxDone = false;
    this._wreckRepairProgress = 0;
    this._mobilityDamaged = false;
    this._mobilityDamageKind = null;
    this._mobilityRepairProgress = 0;
    this._surrenderOnRetreat = false;
    this._deathCause = null;
    this._blastProfile = null;
    this._deathBlastOrigin = null;
    this._deathBlastRadius = null;
    this._deathBlastCaliber = null;
    this._deathBlastLaunchRadius = null;
    this._deathBlastKnockdownRadius = null;
    this._deathBlastImpulseScale = null;
    this._deathBlastWeaponType = null;
    this.wreckTimeLeft = 0;
    this.corpseTimeLeft = 0;
    this._wreckImpactCount = 0;
    this._wreckRunOverCount = 0;
    this._wreckRunOverDamage = 0;
    this._wreckReducedToRubble = false;
    this._trackCrushEscapeUntil = 0;
    this._wreckCrushed = false;
    this._wreckCrushFxDone = false;
    this._driveSpeed = 0;
    coverSystem?.removeSourceZone?.(`vehicle-wreck:${this.id}`);
    this._wreckCoverRegistered = false;
    return true;
  }

  dispose(scene) {
    disposeUnitCorpseVisuals(this, scene);
    removeRetreatMarker(this);
    removeSurrenderMarker(this);
    removeCoverMarker(this);
    removeFieldIcon(this);
    removeRankMarker(this);
    removeHealMarker(this);
    removeMoraleMarker(this);
    removeDamageSmoke(this);
    removeUnitHealthBar(this);
    scene.remove(this.mesh);
    this.mesh.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material.dispose();
      }
    });
  }
}
