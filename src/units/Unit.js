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
import { buildMovePath } from '../game/MovePath.js';
import { getMoveReachConfig } from './VehicleTypes.js';
import { sounds, isInfantryUnitType } from '../audio/SoundManager.js';

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
    this._bunkerEntryId = null;
    this.attackCooldown = 0;
    this.mgCooldown = 0;
    this.dead = false;
    this.wreckTimeLeft = 0;
    this.corpseTimeLeft = 0;
    this.wreckFire = null;
    this._chasingAttack = false;
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

    this.mesh = createUnitMesh(def.type, faction.color, faction.accent, faction.id);
    this.mesh.position.set(position.x, 0, position.z);
    this.mesh.userData.unit = this;
    scene.add(this.mesh);
    this.mesh.traverse((c) => {
      if (c.isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
      }
    });
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
    this._manualFireMission = false;
    this._bunkerEntryId = null;
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
   */
  moveTo(x, z, mapDef = null, playerOrder = false) {
    if (this.surrendered || this._captureExit) return;
    clearRetreat(this);
    this.clearAttackOrder();
    this._userMoveOrder = playerOrder;
    this._chasingAttack = false;
    if (playerOrder) this._pendingMountTankId = null;

    if (mapDef && playerOrder) {
      const { pathSegment } = getMoveReachConfig(this.def.type);
      this._movePath = buildMovePath(
        this.position.x,
        this.position.z,
        x,
        z,
        mapDef,
        pathSegment
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
        // Panic lines — frequent enough to hear emotion, not a wall of shouts
        if (Math.random() < 0.55) {
          // Prefer faction.id; fall back to nested fields if a save/restore ever strips id
          const factionId =
            this.faction?.id ?? this.faction?.factionId ?? this.def?.factionId ?? null;
          sounds.playUnderFire(
            { x: this.position.x, z: this.position.z },
            factionId,
            {
              team: this.team,
              // Friendly panic over radio; enemy yells are open-field ambient (quieter)
              radio: this.team === 'player',
            }
          );
        }
      }
    }

    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      if (opts.explosive || opts.cause === 'explosion') {
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