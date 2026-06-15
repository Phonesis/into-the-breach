import * as THREE from 'three';
import { spreadGroupMoveDestinations } from '../game/GroupMovement.js';
import { createGroundTarget, isInRange } from '../game/Targeting.js';
import { wrapSceneryTarget } from '../game/SceneryTarget.js';
import { canManualFireOrder } from './BattleCursor.js';
import { sampleTerrainHeight } from '../world/Terrain.js';
import { isTabletLikeDevice } from '../lib/tabletDetect.js';

const _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _groundHit = new THREE.Vector3();

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
    getPendingDefensePlacement,
    getPendingLastStandDeploy,
    getPendingSandbagPlacement,
    getPendingBaseBuildingPlacement,
    getBaseBuildingAttackTargets,
    getIsTowerDefense,
    getIsBaseBuildingMode,
    pickPlayerBaseBuilding,
    getDeployZoneActive,
    getShiftHeld,
    clampDeployPoint,
    onFireSupportTarget,
    onDefensePlacement,
    onLastStandPlacement,
    onSandbagPlacement,
    onBaseBuildingPlacement,
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
    this.getPendingDefensePlacement = getPendingDefensePlacement ?? (() => null);
    this.getPendingLastStandDeploy = getPendingLastStandDeploy ?? (() => null);
    this.getPendingSandbagPlacement = getPendingSandbagPlacement ?? (() => null);
    this.getPendingBaseBuildingPlacement =
      getPendingBaseBuildingPlacement ?? (() => null);
    this.getBaseBuildingAttackTargets = getBaseBuildingAttackTargets ?? (() => []);
    this.getIsTowerDefense = getIsTowerDefense ?? (() => false);
    this.getIsBaseBuildingMode = getIsBaseBuildingMode ?? (() => false);
    this.pickPlayerBaseBuilding = pickPlayerBaseBuilding ?? (() => null);
    this.getDeployZoneActive = getDeployZoneActive ?? (() => false);
    this.getShiftHeld = getShiftHeld ?? (() => this._modifierShift);
    this.clampDeployPoint = clampDeployPoint ?? ((x, z) => ({ x, z }));
    this.onFireSupportTarget = onFireSupportTarget;
    this.onDefensePlacement = onDefensePlacement;
    this.onLastStandPlacement = onLastStandPlacement;
    this.onSandbagPlacement = onSandbagPlacement;
    this.onBaseBuildingPlacement = onBaseBuildingPlacement;
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
    this._modifierShift = false;
    this._lastHoverRayAt = 0;
    this._tabletMode = isTabletLikeDevice();
    this._tabletTargetMode = false;
    this._tabletFireMode = false;
    this._tabletTargetConfirmKey = null;
    this._longPressTimer = null;
    this._longPressFired = false;
    this._longPressMs = 480;

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
  }

  isShiftHeld() {
    return this._modifierShift || this.getShiftHeld();
  }

  isManualFireModifier() {
    return this.isShiftHeld() || (this._tabletMode && this._tabletFireMode);
  }

  isTabletTargetMode() {
    return this._tabletMode && this._tabletTargetMode;
  }

  setTabletTargetMode(on) {
    this._tabletTargetMode = !!on;
    if (!this._tabletTargetMode) this._tabletTargetConfirmKey = null;
  }

  setTabletFireMode(on) {
    this._tabletFireMode = !!on;
    this.onBattleCursorChange?.();
  }

  clearTabletTargetConfirm() {
    this._tabletTargetConfirmKey = null;
  }

  isTabletFireMode() {
    return this._tabletMode && this._tabletFireMode;
  }

  _targetKey(target) {
    if (!target) return '';
    if (target.isGround) {
      const p = target.position ?? {};
      return `g:${Math.round(p.x)}:${Math.round(p.z)}`;
    }
    if (target.isScenery) return `s:${target.entry?.id ?? target.id ?? ''}`;
    return `${target.team ?? ''}:${target.id ?? target.name ?? target.label ?? ''}`;
  }

  _refreshHoverTargetNow() {
    this._lastHoverRayAt = 0;
    this.updateHoverTarget();
  }

  _unitPickMesh(unit) {
    if (!unit?.mesh) return null;
    return unit.mesh.getObjectByName?.('selectionHitbox') ?? unit.mesh;
  }

  _hqPickMesh(hq) {
    if (!hq?.mesh) return null;
    return hq.mesh.getObjectByName?.('hqPickBox') ?? hq.mesh;
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
    return this._raycastGroundHit()?.point ?? null;
  }

  _snapGroundPoint(point) {
    const mapDef = this.getMapDef?.();
    if (!mapDef || !point) return point;
    point.y = sampleTerrainHeight(point.x, point.z, mapDef);
    return point;
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
    const meshes = hqs.map((h) => this._hqPickMesh(h)).filter(Boolean);
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
    const meshes = hqs.map((h) => this._hqPickMesh(h)).filter(Boolean);
    const hits = this.raycaster.intersectObjects(meshes, false);
    for (const hit of hits) {
      let obj = hit.object;
      while (obj && !obj.userData?.hq) obj = obj.parent;
      const hq = obj?.userData?.hq;
      if (hq && !hq.dead) return hq;
    }
    return null;
  }

  _raycastGroundHit() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const terrain = this.getTerrainMesh();
    if (terrain) {
      const hits = this.raycaster.intersectObject(terrain, true);
      if (hits[0]) {
        return { point: this._snapGroundPoint(hits[0].point), distance: hits[0].distance };
      }
    }
    const hits = this.raycaster.intersectObjects(this.scene.children, true);
    for (const hit of hits) {
      if (hit.object.name === 'terrain' || hit.object.geometry?.type === 'PlaneGeometry') {
        return { point: this._snapGroundPoint(hit.point), distance: hit.distance };
      }
    }
    if (this.raycaster.ray.intersectPlane(_groundPlane, _groundHit)) {
      const origin = this.raycaster.ray.origin;
      const dist = origin.distanceTo(_groundHit);
      return { point: this._snapGroundPoint(_groundHit), distance: dist };
    }
    return null;
  }

  _raycastSceneryHit() {
    const scenery = this.getScenery();
    if (!scenery) return null;
    const meshes = scenery.getMeshes();
    if (!meshes.length) return null;

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
    return { target: wrapSceneryTarget(bestEntry, scenery), distance: bestDist };
  }

  /**
   * Pick cover vs open ground for Shift+LMB — scenery only when it is closer than the terrain hit.
   */
  _pickShiftFireTarget() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const groundHit = this._raycastGroundHit();
    const sceneryHit = this._raycastSceneryHit();
    const sceneryBias = 0.6;

    if (sceneryHit && groundHit && sceneryHit.distance < groundHit.distance - sceneryBias) {
      return { kind: 'scenery', target: sceneryHit.target };
    }
    if (groundHit) return { kind: 'ground', point: groundHit.point };
    if (sceneryHit) return { kind: 'scenery', target: sceneryHit.target };
    return null;
  }

  raycastSceneryTarget() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this._raycastSceneryHit()?.target ?? null;
  }

  raycastEnemyBaseBuilding() {
    const targets = this.getBaseBuildingAttackTargets?.() ?? [];
    if (!targets.length) return null;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const meshes = targets.map((t) => t.mesh).filter(Boolean);
    if (!meshes.length) return null;
    const hits = this.raycaster.intersectObjects(meshes, true);
    let best = null;
    let bestDist = Infinity;
    for (const hit of hits) {
      for (const t of targets) {
        if (t.dead || !t.mesh) continue;
        let obj = hit.object;
        while (obj) {
          if (obj === t.mesh) {
            if (hit.distance < bestDist) {
              bestDist = hit.distance;
              best = t;
            }
            break;
          }
          obj = obj.parent;
        }
      }
    }
    return best;
  }

  /** Enemy unit or HQ under cursor (cover/scenery uses Shift+LMB manual fire). */
  raycastAttackTarget() {
    const unit = this.raycastEnemyUnit();
    const hq = this.raycastEnemyHQ();
    const structure = this.raycastEnemyBaseBuilding();

    const combat = [];
    if (unit) combat.push({ target: unit, dist: this._raycastHitDistance(this._unitPickMesh(unit)) });
    if (hq) combat.push({ target: hq, dist: this._raycastHitDistance(this._hqPickMesh(hq)) });
    if (structure) {
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hits = this.raycaster.intersectObject(structure.mesh, true);
      combat.push({ target: structure, dist: hits[0]?.distance ?? Infinity });
    }

    if (combat.length) {
      combat.sort((a, b) => a.dist - b.dist);
      return combat[0].target;
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
      const hqHits = this.raycaster.intersectObject(this._hqPickMesh(hq), false);
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
    if (
      !this.enabled ||
      this.getPendingFireSupport?.() ||
      this.getPendingDefensePlacement?.() ||
      this.getPendingLastStandDeploy?.() ||
      this.getPendingSandbagPlacement?.() ||
      this.getPendingBaseBuildingPlacement?.()
    ) {
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
    if (this.isManualFireModifier()) {
      const pick = this._pickShiftFireTarget();
      if (pick?.kind === 'scenery') {
        this.setHoveredTarget(pick.target);
        return;
      }
    }
    this.setHoveredTarget(this.raycastAttackTarget());
  }

  issueAttackOn(target, { inRangeOnly = false } = {}) {
    if (!this.enabled || !target || target.dead) return false;
    if (this.getDeployZoneActive()) return false;

    const selected = this.getSelectedPlayerUnits();
    if (selected.length === 0) return false;

    const fireUnits = [];
    for (const u of selected) {
      if (inRangeOnly) {
        if (!canManualFireOrder(u) || !isInRange(u, target)) continue;
      }
      u.setAttackOrder(target);
      fireUnits.push(u);
    }
    if (fireUnits.length === 0) return false;

    this._lastOrderAt = Date.now();
    if (this.onOrder) this.onOrder('attack', fireUnits);
    return true;
  }

  /** Shift+LMB ground fire — units move into range if needed; cleared on RMB move. */
  issueGroundFireAt(point) {
    if (!this.enabled) return false;

    const selected = this.getSelectedPlayerUnits().filter((u) => canManualFireOrder(u));
    if (selected.length === 0) return false;

    this._lastOrderAt = Date.now();
    for (const u of selected) {
      u.setGroundAttack(createGroundTarget(point.x, point.z));
    }
    if (this.onOrder) this.onOrder('fire', selected);
    return true;
  }

  /** Shift+LMB — attack cover under cursor, otherwise fire at open ground. */
  issueShiftManualFire() {
    if (!this.enabled) return false;

    const selected = this.getSelectedPlayerUnits().filter((u) => canManualFireOrder(u));
    if (selected.length === 0) return false;

    const pick = this._pickShiftFireTarget();
    if (!pick) return false;

    this._lastOrderAt = Date.now();
    if (pick.kind === 'scenery') {
      for (const u of selected) {
        u.setAttackOrder(pick.target);
      }
      if (this.onOrder) this.onOrder('attack', selected);
      return true;
    }

    for (const u of selected) {
      u.setGroundAttack(createGroundTarget(pick.point.x, pick.point.z));
    }
    if (this.onOrder) this.onOrder('fire', selected);
    return true;
  }

  getSelectedPlayerUnits() {
    return this.getUnits().filter((u) => u.team === this.getPlayerTeam() && u.selected && !u.dead);
  }

  onPointerDown(e) {
    if (!this.enabled || e.button !== 0) return;
    this.setPointerFromEvent(e);

    const pendingFs = this.getPendingFireSupport?.();
    const pendingDef = this.getPendingDefensePlacement?.();
    const pendingDeploy = this.getPendingLastStandDeploy?.();
    const pendingSandbags = this.getPendingSandbagPlacement?.();
    const pendingBaseBuild = this.getPendingBaseBuildingPlacement?.();
    if (pendingFs || pendingDef || pendingDeploy || pendingSandbags || pendingBaseBuild) {
      return;
    }

    this.dragStart = { x: e.clientX, y: e.clientY };
    this._dragSelecting = false;
    this._longPressFired = false;
    this._clearLongPressTimer();

    if (
      this._tabletMode &&
      this.getSelectedPlayerUnits().length > 0 &&
      !this.getPendingFireSupport?.() &&
      !this.getPendingDefensePlacement?.() &&
      !this.getPendingLastStandDeploy?.() &&
      !this.getPendingSandbagPlacement?.() &&
      !this.getPendingBaseBuildingPlacement?.() &&
      !this._tabletFireMode
    ) {
      this._longPressTimer = setTimeout(() => {
        this._longPressTimer = null;
        this._longPressFired = true;
        this.issueMoveOrAttack();
      }, this._longPressMs);
    }

    if (this._tabletMode && this.getSelectedPlayerUnits().length > 0) {
      this._refreshHoverTargetNow();
    }
  }

  onPointerMove(e) {
    if (!this.enabled) return;
    this.setPointerFromEvent(e);
    const pendingFs = this.getPendingFireSupport?.();
    const pendingDef = this.getPendingDefensePlacement?.();
    const pendingDeploy = this.getPendingLastStandDeploy?.();
    const pendingSandbags = this.getPendingSandbagPlacement?.();
    const pendingBaseBuild = this.getPendingBaseBuildingPlacement?.();
    if (pendingFs || pendingDef || pendingDeploy || pendingSandbags || pendingBaseBuild) {
      const ground = this.raycastGround();
      if (ground) {
        if (pendingFs && this.onFireSupportTarget) {
          this.onFireSupportTarget('preview', ground.x, ground.z);
        }
        if (pendingDef && this.onDefensePlacement) {
          this.onDefensePlacement('preview', ground.x, ground.z);
        }
        if (pendingBaseBuild && this.onBaseBuildingPlacement) {
          this.onBaseBuildingPlacement('preview', ground.x, ground.z);
        }
      }
      this.setHoveredTarget(null);
      return;
    }
    this.updateHoverTarget();
    if (!this.dragStart) return;
    const dx = e.clientX - this.dragStart.x;
    const dy = e.clientY - this.dragStart.y;
    if (Math.hypot(dx, dy) > 6) {
      this._dragSelecting = true;
      this._clearLongPressTimer();
    }
  }

  _clearLongPressTimer() {
    if (this._longPressTimer) {
      clearTimeout(this._longPressTimer);
      this._longPressTimer = null;
    }
  }

  onPointerUp(e) {
    if (!this.enabled || e.button !== 0) return;
    this.setPointerFromEvent(e);
    this._clearLongPressTimer();

    if (this._longPressFired) {
      this._longPressFired = false;
      this.dragStart = null;
      this._dragSelecting = false;
      return;
    }

    const pendingFs = this.getPendingFireSupport?.();
    const pendingDef = this.getPendingDefensePlacement?.();
    const pendingDeploy = this.getPendingLastStandDeploy?.();
    const pendingSandbags = this.getPendingSandbagPlacement?.();
    const pendingBaseBuild = this.getPendingBaseBuildingPlacement?.();
    if (pendingFs || pendingDef || pendingDeploy || pendingSandbags || pendingBaseBuild) {
      const ground = this.raycastGround();
      if (ground) {
        if (pendingFs && this.onFireSupportTarget) {
          this.onFireSupportTarget('place', ground.x, ground.z);
        }
        if (pendingDef && this.onDefensePlacement) {
          this.onDefensePlacement('place', ground.x, ground.z);
        }
        if (pendingDeploy && this.onLastStandPlacement) {
          this.onLastStandPlacement('place', ground.x, ground.z);
        }
        if (pendingSandbags && this.onSandbagPlacement) {
          this.onSandbagPlacement('place', ground.x, ground.z);
        }
        if (pendingBaseBuild && this.onBaseBuildingPlacement) {
          this.onBaseBuildingPlacement('place', ground.x, ground.z);
        }
      }
      this.dragStart = null;
      this._dragSelecting = false;
      return;
    }

    if (
      !this._dragSelecting &&
      this.getIsTowerDefense?.() &&
      this.onDefensePlacement
    ) {
      const ground = this.raycastGround();
      if (ground) {
        this.onDefensePlacement('pick', ground.x, ground.z);
      }
      this.dragStart = null;
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
      this._notifySelection(units, null, null);
    } else {
      const selectedBefore = units.filter((u) => u.selected && !u.dead);
      const shiftHeld = e.shiftKey || this.isManualFireModifier();
      const shiftManualFire =
        shiftHeld &&
        selectedBefore.length > 0 &&
        selectedBefore.some((u) => canManualFireOrder(u));

      if (shiftManualFire) {
        this.issueShiftManualFire();
        this._tabletTargetConfirmKey = null;
        this._notifySelection(units);
      } else {
        const enemyTarget = selectedBefore.length > 0 ? this.raycastAttackTarget() : null;
        const useTabletTargetPick =
          this._tabletMode && this._tabletTargetMode && selectedBefore.length > 0;

        if (enemyTarget && useTabletTargetPick) {
          const key = this._targetKey(enemyTarget);
          if (this._tabletTargetConfirmKey === key) {
            this.issueAttackOn(enemyTarget);
            this._tabletTargetConfirmKey = null;
          } else {
            this.setHoveredTarget(enemyTarget);
            this._tabletTargetConfirmKey = key;
          }
          this._notifySelection(units);
        } else if (enemyTarget) {
          this.issueAttackOn(enemyTarget);
          this._tabletTargetConfirmKey = null;
          this._notifySelection(units);
        } else {
          this._tabletTargetConfirmKey = null;
          const playerHq = this.raycastPlayerHQ();
          const playerBuilding =
            !playerHq && this.getIsBaseBuildingMode?.()
              ? this.pickPlayerBaseBuilding?.(this.raycaster, this.pointer, this.camera)
              : null;
          const hit = playerHq || playerBuilding ? null : this.raycastUnit(team);
          const add = e.shiftKey;
          if (!add) {
            units.forEach((u) => u.setSelected(false));
            this.getHqs().forEach((h) => h.setSelected(false));
          }
          if (playerHq) {
            playerHq.setSelected(true);
            this._notifySelection(units, playerHq, null);
          } else if (playerBuilding) {
            this.getHqs().forEach((h) => h.setSelected(false));
            this._notifySelection(units, null, playerBuilding);
          } else if (hit) {
            hit.setSelected(true);
            this._notifySelection(units, null, null);
          } else {
            this._notifySelection(units, null, null);
          }
        }
      }
    }

    this.dragStart = null;
    this._dragSelecting = false;
    this.updateHoverTarget();
  }

  _notifySelection(units, hq = null, baseBuilding = null) {
    const sel = units.filter((u) => u.selected);
    if (this.onSelectionChange) this.onSelectionChange(sel, hq, baseBuilding);
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
    const destinations = spreadGroupMoveDestinations(selected, clamped.x, clamped.z);
    for (const { unit, x, z } of destinations) {
      unit.clearAttackOrder();
      const pt = this.clampDeployPoint(x, z);
      unit.moveTo(pt.x, pt.z, mapDef, true);
    }
    if (this.onOrder) this.onOrder('move', selected);
  }
}