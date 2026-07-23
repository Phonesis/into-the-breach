import * as THREE from 'three';
import {
  applyUnitDeathVisual,
  createUnitMesh,
  disposeUnitCorpseVisuals,
  setSelectionRing,
  updateSquadCasualtyVisual,
} from './UnitMeshes.js';
import { clearRetreat, removeRetreatMarker } from '../game/RetreatBehavior.js';
import { clearSurrender, removeSurrenderMarker } from '../game/SurrenderBehavior.js';
import { removeCoverMarker } from '../visual/CoverMarkers.js';
import { removeFieldIcon } from '../visual/UnitFieldIcons.js';
import { removeRankMarker } from '../game/EliteBehavior.js';
import { removeHealMarker } from '../visual/HealMarkers.js';
import { removeDamageSmoke } from '../visual/DamageSmoke.js';
import { removeUnitHealthBar } from '../visual/UnitHealthBars.js';
import {
  createSmokeShellTarget,
  distanceBetween,
  getStandoffPosition,
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
import { sounds, isInfantryUnitType } from '../audio/SoundManager.js';
import { removeWreckEffect } from '../effects/WreckEffects.js';
import { classifyVehicleKnockout } from '../game/VehicleKnockout.js';
import { sampleTerrainHeight } from '../world/Terrain.js';

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
    this.wreckTimeLeft = 0;
    this.corpseTimeLeft = 0;
    this.wreckFire = null;
    this._chasingAttack = false;
    this.engagementStance = 'hold';
    this._stancePursuitOrder = false;
    this._mgVolley = 0;
    this.retreating = false;
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

  setAttackOrder(target, { manualFire = false } = {}) {
    if (this.surrendered || this._captureExit) return;
    clearRetreat(this);
    this.attackOrder = target;
    this.target = target;
    this._manualFireMission = manualFire;
    this._chasingAttack = true;
    this._stancePursuitOrder = false;
    this._userMoveOrder = false;
    this._movePath = null;
    if (target && !target.dead) {
      this.moveTarget = getStandoffPosition(this, target);
    }
  }

  clearAttackOrder() {
    this.attackOrder = null;
    this.target = null;
    this._chasingAttack = false;
    this._stancePursuitOrder = false;
    this._manualFireMission = false;
    this._bunkerEntryId = null;
  }

  setEngagementStance(stance) {
    const next = stance === 'pursue' ? 'pursue' : 'hold';
    if (this.engagementStance === next) return false;
    this.engagementStance = next;
    if (next === 'hold' && this._stancePursuitOrder) {
      this.clearAttackOrder();
      if (!this._userMoveOrder) {
        this.moveTarget = null;
        this._movePath = null;
      }
    }
    return true;
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
    if (this.surrendered || this._captureExit) return;
    clearRetreat(this);
    this.attackOrder = groundTarget;
    this.target = groundTarget;
    this._chasingAttack = false;
    this._userMoveOrder = false;
    this._movePath = null;
    this.moveTarget = null;
  }

  setSmokeShellOrder(x, z) {
    if (this.surrendered || this._captureExit) return;
    if (this.def?.type !== 'artillery') return;
    clearRetreat(this);
    const target = createSmokeShellTarget(x, z);
    this.attackOrder = target;
    this.target = target;
    this._manualFireMission = true;
    this._chasingAttack = false;
    this._userMoveOrder = false;
    this._movePath = null;
    this.moveTarget = null;
  }

  /**
   * @param {number} x
   * @param {number} z
   * @param {object} [mapDef]
   * @param {boolean} [playerOrder] — player-issued moves are not cancelled by combat auto-fire
   * @param {object|null} [scenery]
   * @param {{ allowBuildingId?: string|null }} [options] — building id to enter (garrison)
   */
  moveTo(x, z, mapDef = null, playerOrder = false, scenery = null, options = {}) {
    if (this.surrendered || this._captureExit) return;
    if (this._mobilityDamaged) {
      this.moveTarget = null;
      this._movePath = null;
      this._userMoveOrder = false;
      return;
    }
    // Preserve enter-building order across clearAttackOrder (which resets entry id).
    const allowBuildingId = options.allowBuildingId ?? null;
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
    this._urbanCanalRoute = null;
    this._lastPathRepathAt = 0;
    if (playerOrder) this._pendingMountTankId = null;

    // A short click into a tank's rear arc is a tactical withdrawal: retain
    // the hull's current facing so frontal armour and the turret stay toward
    // the threat. Longer moves still turn around and use normal pathing.
    this._reverseMoveOrder =
      playerOrder && shouldUseTacticalReverse(this, x, z);

    // All ground units path around buildings unless ordered into one (garrison).
    // Use inflated plan radius so vehicles stay in street centres, not façades.
    if (mapDef && (playerOrder || scenery)) {
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
          preferUrbanRoads: isVehicleUnit(this.def.type),
          allowTrackedBuildingCrush: TANK_TYPES.has(this.def.type),
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
   * @param {boolean} [opts.explosive] — shell / blast kill (enables occasional gibs)
   */
  takeDamage(amount, opts = {}) {
    if (this.dead || this.surrendered || this._captureExit) return;
    if (amount <= 0) return;
    this.hp -= amount;
    updateSquadCasualtyVisual(this);

    // Foot troops yell when hit (not on the killing blow — death lines handle that)
    if (this.hp > 0 && isInfantryUnitType(this.def?.type)) {
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
      if (opts.cause === 'crush' || opts.crushed) {
        this._deathCause = 'crush';
      } else if (opts.explosive || opts.cause === 'explosion') {
        this._deathCause = 'explosion';
      }
      clearRetreat(this);
      clearSurrender(this);
      removeCoverMarker(this);
      removeFieldIcon(this);
      removeRankMarker(this);
      removeHealMarker(this);
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
      position.y = sampleTerrainHeight(position.x, position.z, this._mapDef);
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
    this._deathCause = null;
    this.wreckTimeLeft = 0;
    this.corpseTimeLeft = 0;
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
