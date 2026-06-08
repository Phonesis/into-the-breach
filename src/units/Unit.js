import * as THREE from 'three';
import { applyUnitDeathVisual, createUnitMesh, setSelectionRing } from './UnitMeshes.js';
import { clearRetreat, removeRetreatMarker } from '../game/RetreatBehavior.js';
import { removeCoverMarker } from '../visual/CoverMarkers.js';
import { removeFieldIcon } from '../visual/UnitFieldIcons.js';
import { distanceBetween, getStandoffPosition } from '../game/Targeting.js';
import { buildMovePath } from '../game/MovePath.js';
import { getMoveReachConfig } from './VehicleTypes.js';

let nextId = 1;

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
    this.fieldIcon = null;
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

  setAttackOrder(target) {
    clearRetreat(this);
    this.attackOrder = target;
    this.target = target;
    this._chasingAttack = true;
    if (target && !target.dead) {
      this.moveTarget = getStandoffPosition(this, target);
    }
  }

  clearAttackOrder() {
    this.attackOrder = null;
    this.target = null;
    this._chasingAttack = false;
  }

  setGroundAttack(groundTarget) {
    clearRetreat(this);
    this.attackOrder = groundTarget;
    this.target = groundTarget;
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
    clearRetreat(this);
    this.clearAttackOrder();
    this._userMoveOrder = playerOrder;
    this._chasingAttack = false;

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

  takeDamage(amount) {
    if (this.dead) return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      clearRetreat(this);
      removeCoverMarker(this);
      if (this.selected) this.setSelected(false);
      applyUnitDeathVisual(this);
    }
  }

  dispose(scene) {
    removeRetreatMarker(this);
    removeCoverMarker(this);
    removeFieldIcon(this);
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