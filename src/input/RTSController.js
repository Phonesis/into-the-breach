import * as THREE from 'three';
import { createGroundTarget, isPointInRange } from '../game/Targeting.js';
import { wrapSceneryTarget } from '../game/SceneryTarget.js';
import { canGroundFire } from './BattleCursor.js';

export class RTSController {
  constructor({
    camera,
    domElement,
    scene,
    getUnits,
    getHqs,
    getScenery,
    getMapDef,
    getTerrainMesh,
    getPlayerTeam,
    getPendingFireSupport,
    getDeployZoneActive,
    clampDeployPoint,
    onFireSupportTarget,
    onSelectionChange,
    onHoverTarget,
    onOrder,
    onBattleCursorChange,
  }) {
    this.camera = camera;
    this.domElement = domElement;
    this.scene = scene;
    this.getUnits = getUnits;
    this.getHqs = getHqs;
    this.getScenery = getScenery ?? (() => null);
    this.getMapDef = getMapDef ?? (() => null);
    this.getTerrainMesh = getTerrainMesh ?? (() => null);
    this.getPlayerTeam = getPlayerTeam;
    this.getPendingFireSupport = getPendingFireSupport;
    this.getDeployZoneActive = getDeployZoneActive ?? (() => false);
    this.clampDeployPoint = clampDeployPoint ?? ((x, z) => ({ x, z }));
    this.onFireSupportTarget = onFireSupportTarget;
    this.onSelectionChange = onSelectionChange;
    this.onHoverTarget = onHoverTarget;
    this.onOrder = onOrder;
    this.onBattleCursorChange = onBattleCursorChange;

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.dragStart = null;
    this.enabled = false;
    this._lastOrderAt = 0;
    this.hoveredTarget = null;
    /** Alt held on last pointer event — required to target trees/hedges/cover for attack. */
    this._modifierAlt = false;
    this._modifierShift = false;
    this._lastHoverRayAt = 0;

    this._onPointerDown = this.onPointerDown.bind(this);
    this._onPointerMove = this.onPointerMove.bind(this);
    this._onPointerUp = this.onPointerUp.bind(this);
    this._onContextMenu = this.onContextMenu.bind(this);
    this._onPointerDownRmb = this.onPointerDownRmb.bind(this);
  }

  enable() {
    if (this.enabled) return;
    this.enabled = true;
    this.domElement.addEventListener('pointerdown', this._onPointerDown);
    this.domElement.addEventListener('pointermove', this._onPointerMove);
    this.domElement.addEventListener('pointerup', this._onPointerUp);
    this.domElement.addEventListener('contextmenu', this._onContextMenu);
    this.domElement.addEventListener('pointerdown', this._onPointerDownRmb);
  }

  disable() {
    this.enabled = false;
    this.domElement.removeEventListener('pointerdown', this._onPointerDown);
    this.domElement.removeEventListener('pointermove', this._onPointerMove);
    this.domElement.removeEventListener('pointerup', this._onPointerUp);
    this.domElement.removeEventListener('contextmenu', this._onContextMenu);
    this.domElement.removeEventListener('pointerdown', this._onPointerDownRmb);
  }

  /** @deprecated alias for setPointerFromEvent */
  updateMouse(e) {
    this.setPointerFromEvent(e);
  }

  setPointerFromEvent(e) {
    const rect = this.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    const shift = !!e.shiftKey;
    if (shift !== this._modifierShift) {
      this._modifierShift = shift;
      this.onBattleCursorChange?.();
    }
    this._modifierAlt = !!e.altKey;
  }

  isShiftHeld() {
    return this._modifierShift;
  }

  _unitPickMesh(unit) {
    if (!unit?.mesh) return null;
    return unit.mesh.getObjectByName?.('selectionHitbox') ?? unit.mesh;
  }

  _collectUnitPickMeshes({ teamFilter = null, enemyOnly = false } = {}) {
    const player = this.getPlayerTeam();
    const meshes = [];
    for (const u of this.getUnits()) {
      if (u.dead) continue;
      if (enemyOnly && u.team === player) continue;
      if (teamFilter && u.team !== teamFilter) continue;
      const pick = this._unitPickMesh(u);
      if (pick) meshes.push(pick);
    }
    return meshes;
  }

  _raycastHitDistance(mesh) {
    if (!mesh) return Infinity;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObject(mesh, false);
    return hits[0]?.distance ?? Infinity;
  }

  raycastGround() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const terrain = this.getTerrainMesh();
    if (terrain) {
      const hits = this.raycaster.intersectObject(terrain, false);
      return hits[0]?.point ?? null;
    }
    const hits = this.raycaster.intersectObjects(this.scene.children, true);
    for (const hit of hits) {
      if (hit.object.name === 'terrain' || hit.object.geometry?.type === 'PlaneGeometry') {
        return hit.point;
      }
    }
    return null;
  }

  raycastUnit(teamFilter = null) {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const meshes = this._collectUnitPickMeshes({ teamFilter });
    const hits = this.raycaster.intersectObjects(meshes, false);
    if (hits.length === 0) return null;

    let best = null;
    let bestDist = Infinity;
    for (const hit of hits) {
      let obj = hit.object;
      while (obj && !obj.userData?.unit) obj = obj.parent;
      const unit = obj?.userData?.unit;
      if (!unit || unit.dead) continue;
      if (teamFilter && unit.team !== teamFilter) continue;
      if (hit.distance < bestDist) {
        bestDist = hit.distance;
        best = unit;
      }
    }
    return best;
  }

  raycastEnemyUnit() {
    const player = this.getPlayerTeam();
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const meshes = this._collectUnitPickMeshes({ enemyOnly: true });
    const hits = this.raycaster.intersectObjects(meshes, false);
    if (hits.length === 0) return null;

    let best = null;
    let bestDist = Infinity;
    for (const hit of hits) {
      let obj = hit.object;
      while (obj && !obj.userData?.unit) obj = obj.parent;
      const unit = obj?.userData?.unit;
      if (!unit || unit.dead || unit.team === player) continue;
      if (hit.distance < bestDist) {
        bestDist = hit.distance;
        best = unit;
      }
    }
    return best;
  }

  raycastPlayerHQ() {
    const player = this.getPlayerTeam();
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hqs = this.getHqs().filter((h) => !h.dead && h.team === player);
    const meshes = hqs.map((h) => h.mesh);
    const hits = this.raycaster.intersectObjects(meshes, false);
    for (const hit of hits) {
      let obj = hit.object;
      while (obj && !obj.userData?.hq) obj = obj.parent;
      const hq = obj?.userData?.hq;
      if (hq && !hq.dead && hq.team === player) return hq;
    }
    return null;
  }

  raycastEnemyHQ() {
    const player = this.getPlayerTeam();
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hqs = this.getHqs().filter((h) => !h.dead && h.team !== player);
    const meshes = hqs.map((h) => h.mesh);
    const hits = this.raycaster.intersectObjects(meshes, false);
    for (const hit of hits) {
      let obj = hit.object;
      while (obj && !obj.userData?.hq) obj = obj.parent;
      const hq = obj?.userData?.hq;
      if (hq && !hq.dead) return hq;
    }
    return null;
  }

  raycastSceneryTarget() {
    const scenery = this.getScenery();
    if (!scenery) return null;
    const meshes = scenery.getMeshes();
    if (!meshes.length) return null;

    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(meshes, true);
    let bestEntry = null;
    let bestDist = Infinity;
    for (const hit of hits) {
      let obj = hit.object;
      while (obj && !obj.userData?.destructible) obj = obj.parent;
      const entry = obj?.userData?.destructible;
      if (!entry || entry.destroyed) continue;
      if (hit.distance < bestDist) {
        bestDist = hit.distance;
        bestEntry = entry;
      }
    }
    if (!bestEntry) return null;
    return wrapSceneryTarget(bestEntry, scenery);
  }

  /**
   * Enemy unit or HQ under cursor. Scenery/cover only when Alt is held
   * so trees and hedges are not picked ahead of combat targets.
   */
  raycastAttackTarget() {
    const unit = this.raycastEnemyUnit();
    const hq = this.raycastEnemyHQ();

    const combat = [];
    if (unit) combat.push({ target: unit, dist: this._raycastHitDistance(unit.mesh) });
    if (hq) combat.push({ target: hq, dist: this._raycastHitDistance(hq.mesh) });

    if (combat.length) {
      combat.sort((a, b) => a.dist - b.dist);
      return combat[0].target;
    }

    if (this._modifierAlt) {
      return this.raycastSceneryTarget();
    }

    return null;
  }

  /** @deprecated use raycastAttackTarget */
  raycastEnemyTarget() {
    const unit = this.raycastEnemyUnit();
    const hq = this.raycastEnemyHQ();
    if (unit && hq) {
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const unitHits = this.raycaster.intersectObject(this._unitPickMesh(unit), false);
      const hqHits = this.raycaster.intersectObject(hq.mesh, false);
      const ud = unitHits[0]?.distance ?? Infinity;
      const hd = hqHits[0]?.distance ?? Infinity;
      return ud <= hd ? unit : hq;
    }
    return unit ?? hq ?? null;
  }

  setHoveredTarget(target) {
    if (this.hoveredTarget === target) return;
    this.hoveredTarget = target;
    if (this.onHoverTarget) this.onHoverTarget(target);
  }

  updateHoverTarget() {
    if (!this.enabled || this.getPendingFireSupport?.()) {
      this.setHoveredTarget(null);
      return;
    }
    if (this.getSelectedPlayerUnits().length === 0) {
      this.setHoveredTarget(null);
      return;
    }
    const now = performance.now();
    if (now - this._lastHoverRayAt < 50) return;
    this._lastHoverRayAt = now;
    this.setHoveredTarget(this.raycastAttackTarget());
  }

  issueAttackOn(target) {
    if (!this.enabled || !target || target.dead) return false;
    if (this.getDeployZoneActive()) return false;

    const selected = this.getSelectedPlayerUnits();
    if (selected.length === 0) return false;

    this._lastOrderAt = Date.now();
    for (const u of selected) u.setAttackOrder(target);
    if (this.onOrder) this.onOrder('attack', selected);
    return true;
  }

  /** Shift+LMB ground bombardment (in range only; cleared on move). */
  issueGroundFireAt(point) {
    if (!this.enabled) return false;
    if (this.getDeployZoneActive()) return false;

    const selected = this.getSelectedPlayerUnits();
    if (selected.length === 0) return false;

    this._lastOrderAt = Date.now();
    const groundTarget = createGroundTarget(point.x, point.z);
    const fireUnits = [];
    for (const u of selected) {
      if (!canGroundFire(u) || !isPointInRange(u, point)) continue;
      u.setGroundAttack(groundTarget);
      fireUnits.push(u);
    }
    if (fireUnits.length === 0) return false;
    if (this.onOrder) this.onOrder('fire', fireUnits);
    return true;
  }

  getSelectedPlayerUnits() {
    return this.getUnits().filter((u) => u.team === this.getPlayerTeam() && u.selected && !u.dead);
  }

  onPointerDown(e) {
    if (!this.enabled || e.button !== 0) return;
    if (this.getPendingFireSupport?.()) return;
    this.setPointerFromEvent(e);
    this.dragStart = { x: e.clientX, y: e.clientY };
    this._dragSelecting = false;
  }

  onPointerMove(e) {
    if (!this.enabled) return;
    this.setPointerFromEvent(e);
    const pending = this.getPendingFireSupport?.();
    if (pending) {
      const ground = this.raycastGround();
      if (ground && this.onFireSupportTarget) {
        this.onFireSupportTarget('preview', ground.x, ground.z);
      }
      this.setHoveredTarget(null);
      return;
    }
    this.updateHoverTarget();
    if (!this.dragStart) return;
    const dx = e.clientX - this.dragStart.x;
    const dy = e.clientY - this.dragStart.y;
    if (Math.hypot(dx, dy) > 6) this._dragSelecting = true;
  }

  onPointerUp(e) {
    if (!this.enabled || e.button !== 0) return;
    this.setPointerFromEvent(e);

    const pending = this.getPendingFireSupport?.();
    if (pending) {
      const ground = this.raycastGround();
      if (ground && this.onFireSupportTarget) {
        this.onFireSupportTarget('place', ground.x, ground.z);
      }
      this.dragStart = null;
      this._dragSelecting = false;
      return;
    }

    const team = this.getPlayerTeam();
    const units = this.getUnits().filter((u) => u.team === team);

    if (this._dragSelecting && this.dragStart) {
      const rect = this.domElement.getBoundingClientRect();
      const x1 = ((this.dragStart.x - rect.left) / rect.width) * 2 - 1;
      const y1 = -((this.dragStart.y - rect.top) / rect.height) * 2 + 1;
      const x2 = this.pointer.x;
      const y2 = this.pointer.y;
      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2);
      const minY = Math.min(y1, y2);
      const maxY = Math.max(y1, y2);

      for (const u of units) {
        if (u.dead) continue;
        const p = u.mesh.position.clone().project(this.camera);
        const inside = p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY && p.z < 1;
        u.setSelected(inside);
      }
      this.getHqs().forEach((h) => h.setSelected(false));
      this._notifySelection(units, null);
    } else {
      const selectedBefore = units.filter((u) => u.selected && !u.dead);
      const enemyTarget = selectedBefore.length > 0 ? this.raycastAttackTarget() : null;
      if (enemyTarget) {
        this.issueAttackOn(enemyTarget);
        this._notifySelection(units);
      } else {
        const ground = this.raycastGround();
        const shiftGroundFire =
          e.shiftKey &&
          selectedBefore.length > 0 &&
          selectedBefore.some((u) => canGroundFire(u)) &&
          ground;
        if (shiftGroundFire && this.issueGroundFireAt({ x: ground.x, z: ground.z })) {
          this._notifySelection(units);
        } else {
          const playerHq = this.raycastPlayerHQ();
          const hit = playerHq ? null : this.raycastUnit(team);
          const add = e.shiftKey;
          if (!add) {
            units.forEach((u) => u.setSelected(false));
            this.getHqs().forEach((h) => h.setSelected(false));
          }
          if (playerHq) {
            playerHq.setSelected(true);
            this._notifySelection(units, playerHq);
          } else if (hit) {
            hit.setSelected(true);
            this._notifySelection(units, null);
          } else {
            this._notifySelection(units, null);
          }
        }
      }
    }

    this.dragStart = null;
    this._dragSelecting = false;
    this.updateHoverTarget();
  }

  _notifySelection(units, hq = null) {
    const sel = units.filter((u) => u.selected);
    if (this.onSelectionChange) this.onSelectionChange(sel, hq);
  }

  onPointerDownRmb(e) {
    if (!this.enabled || e.button !== 2) return;
    e.preventDefault();
    this.setPointerFromEvent(e);
    this.issueMoveOrAttack();
  }

  onContextMenu(e) {
    e.preventDefault();
    if (!this.enabled) return;
    if (Date.now() - this._lastOrderAt < 80) return;
    this.setPointerFromEvent(e);
    this.issueMoveOrAttack();
  }

  issueMoveOrAttack() {
    if (!this.enabled) return;

    const selected = this.getSelectedPlayerUnits();
    if (selected.length === 0) return;

    this._lastOrderAt = Date.now();

    if (!this.getDeployZoneActive()) {
      const attackTarget = this.raycastAttackTarget();
      if (attackTarget) {
        this.issueAttackOn(attackTarget);
        return;
      }
    }

    const ground = this.raycastGround();
    if (!ground) return;

    const clamped = this.clampDeployPoint(ground.x, ground.z);

    const mapDef = this.getMapDef();
    for (const u of selected) {
      u.clearAttackOrder();
      u.moveTo(clamped.x, clamped.z, mapDef, true);
    }
    if (this.onOrder) this.onOrder('move', selected);
  }
}