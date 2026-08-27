import * as THREE from 'three';
import { spreadGroupMoveDestinations } from '../game/GroupMovement.js';
import {
  canUnitEnterVehicle,
  issueMountOrder,
  resolveMountedHost,
} from '../game/TankRiders.js';
import { getTowActionTarget, issueTowOrder } from '../game/TruckTowing.js';
import {
  getSeekCoverEnabled,
  resolveSeekCoverDestination,
} from '../game/CoverSeek.js';
import {
  canEngageManualOrder,
  createGroundTarget,
  isInRange,
} from '../game/Targeting.js';
import {
  canGarrisonType,
  getGarrisonBunkerSources,
} from '../game/BunkerGarrison.js';
import { wrapSceneryTarget } from '../game/SceneryTarget.js';
import { canManualFireOrder, canSmokeShellOrder, isSmokeShellReady } from './BattleCursor.js';
import { sampleTerrainHeight } from '../world/Terrain.js';
import { isTabletModeEnabled } from '../lib/tabletDetect.js';

const _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _groundHit = new THREE.Vector3();
/** Ground click within this radius of an enemy HQ counts as targeting the HQ. */
const HQ_ATTACK_PROXIMITY = 18;
/**
 * When a mesh pick misses (click on the pavement under a tank, low camera angle,
 * etc.), ground clicks this close still count as targeting that unit so the
 * order tracks the living unit instead of becoming a fixed ground-fire mission.
 */
const UNIT_ATTACK_PROXIMITY_PAD = 3.8;
const VEHICLE_ACTION_HOVER_GRACE_MS = 1100;

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
    getPendingFireSupportStrike,
    getPendingSmokeShell,
    getPendingDefensePlacement,
    getPendingLastStandDeploy,
    getPendingSandbagPlacement,
    getPendingTrenchPlacement,
    getPendingMedicTentPlacement,
    getPendingBaseBuildingPlacement,
    getBaseBuildingAttackTargets,
    getIsTowerDefense,
    getIsBaseBuildingMode,
    pickPlayerBaseBuilding,
    getDeployZoneActive,
    getPaused,
    getShiftHeld,
    clampDeployPoint,
    onFireSupportTarget,
    onSmokeShellTarget,
    onDefensePlacement,
    onLastStandPlacement,
    onSandbagPlacement,
    onTrenchPlacement,
    onMedicTentPlacement,
    onBaseBuildingPlacement,
    onSelectionChange,
    onHoverTarget,
    onOrder,
    onMoveOrder,
    onBattleCursorChange,
    getCoverSystem,
    getSeekCoverMode,
    getGarrisonSources,
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
    this.getPendingFireSupportStrike = getPendingFireSupportStrike ?? (() => null);
    this.getPendingSmokeShell = getPendingSmokeShell ?? (() => false);
    this.getPendingDefensePlacement = getPendingDefensePlacement ?? (() => null);
    this.getPendingLastStandDeploy = getPendingLastStandDeploy ?? (() => null);
    this.getPendingSandbagPlacement = getPendingSandbagPlacement ?? (() => null);
    this.getPendingTrenchPlacement = getPendingTrenchPlacement ?? (() => null);
    this.getPendingMedicTentPlacement = getPendingMedicTentPlacement ?? (() => null);
    this.getPendingBaseBuildingPlacement =
      getPendingBaseBuildingPlacement ?? (() => null);
    this.getBaseBuildingAttackTargets = getBaseBuildingAttackTargets ?? (() => []);
    this.getIsTowerDefense = getIsTowerDefense ?? (() => false);
    this.getIsBaseBuildingMode = getIsBaseBuildingMode ?? (() => false);
    this.pickPlayerBaseBuilding = pickPlayerBaseBuilding ?? (() => null);
    this.getDeployZoneActive = getDeployZoneActive ?? (() => false);
    this.getPaused = getPaused ?? (() => false);
    this.getShiftHeld = getShiftHeld ?? (() => this._modifierShift);
    this.clampDeployPoint = clampDeployPoint ?? ((x, z) => ({ x, z }));
    this.onFireSupportTarget = onFireSupportTarget;
    this.onSmokeShellTarget = onSmokeShellTarget;
    this.onDefensePlacement = onDefensePlacement;
    this.onLastStandPlacement = onLastStandPlacement;
    this.onSandbagPlacement = onSandbagPlacement;
    this.onTrenchPlacement = onTrenchPlacement;
    this.onMedicTentPlacement = onMedicTentPlacement;
    this.onBaseBuildingPlacement = onBaseBuildingPlacement;
    this.onSelectionChange = onSelectionChange;
    this.onHoverTarget = onHoverTarget;
    this.onOrder = onOrder;
    this.onMoveOrder = onMoveOrder;
    this.onBattleCursorChange = onBattleCursorChange;
    this.getCoverSystem = getCoverSystem ?? (() => null);
    this.getSeekCoverMode = getSeekCoverMode ?? (() => false);
    this.getGarrisonSources = getGarrisonSources ?? (() => null);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.dragStart = null;
    this.enabled = false;
    this._lastOrderAt = 0;
    this.hoveredTarget = null;
    this._modifierShift = false;
    this._lastHoverRayAt = 0;
    this._vehicleActionHovered = false;
    this._vehicleHoverClearTimer = null;
    this._tabletMode = isTabletModeEnabled();
    this._tabletTargetMode = false;
    this._tabletFireMode = false;
    this._tabletTargetConfirmKey = null;

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
    if (this._vehicleHoverClearTimer) clearTimeout(this._vehicleHoverClearTimer);
    this._vehicleHoverClearTimer = null;
    this._vehicleActionHovered = false;
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

  setTabletMode(on) {
    this._tabletMode = !!on;
    if (!this._tabletMode) {
      this._tabletTargetMode = false;
      this._tabletFireMode = false;
      this._tabletTargetConfirmKey = null;
    }
    this.onBattleCursorChange?.();
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
    const units = this.getUnits();
    for (const hit of hits) {
      let obj = hit.object;
      while (obj && !obj.userData?.unit) obj = obj.parent;
      const unit = resolveMountedHost(obj?.userData?.unit, units);
      if (!unit || unit.dead) continue;
      if (teamFilter && unit.team !== teamFilter) continue;
      if (hit.distance < bestDist) {
        bestDist = hit.distance;
        best = unit;
      }
    }
    return best;
  }

  _unitAttackProximity(unit) {
    const hitR =
      unit?.mesh?.userData?.hitRadius ??
      unit?.def?.hitRadius ??
      (unit?.def?.type === 'superHeavyTank'
        ? 3.5
        : unit?.def?.type === 'tank' || unit?.def?.type === 'tankDestroyer'
          ? 3.2
          : unit?.def?.type === 'armoredCar' || unit?.def?.type === 'truck'
            ? 2.6
            : 2.2);
    return hitR + UNIT_ATTACK_PROXIMITY_PAD;
  }

  /** Nearest living enemy within ground-proximity of (x,z). */
  _findEnemyUnitNearPoint(x, z) {
    const player = this.getPlayerTeam();
    let best = null;
    let bestScore = Infinity;
    for (const u of this.getUnits()) {
      if (u.dead || u.team === player || u.surrendered || u._captureExit || u._dropping) {
        continue;
      }
      if (u._mountedOnTankId) continue;
      const d = Math.hypot(x - u.position.x, z - u.position.z);
      const reach = this._unitAttackProximity(u);
      if (d > reach) continue;
      // Prefer the unit whose ground footprint is closest under the click.
      if (d < bestScore) {
        bestScore = d;
        best = u;
      }
    }
    return best;
  }

  _pickEnemyUnitNearCursor() {
    const ground = this._raycastGroundHit();
    if (!ground) return null;
    return this._findEnemyUnitNearPoint(ground.point.x, ground.point.z);
  }

  raycastEnemyUnit() {
    const player = this.getPlayerTeam();
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const meshes = this._collectUnitPickMeshes({ enemyOnly: true });
    const hits = this.raycaster.intersectObjects(meshes, false);

    let best = null;
    let bestDist = Infinity;
    const units = this.getUnits();
    for (const hit of hits) {
      let obj = hit.object;
      while (obj && !obj.userData?.unit) obj = obj.parent;
      const unit = resolveMountedHost(obj?.userData?.unit, units);
      if (!unit || unit.dead || unit.team === player) continue;
      if (hit.distance < bestDist) {
        bestDist = hit.distance;
        best = unit;
      }
    }
    // Mesh pick can miss when the cursor is on the pavement under a tall
    // vehicle or slightly beside a foot squad — fall back to ground proximity
    // so attack orders bind to the unit and follow it when it moves.
    return best ?? this._pickEnemyUnitNearCursor();
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

  _hqFromRaycastHit(hit) {
    let obj = hit.object;
    while (obj && !obj.userData?.hq) obj = obj.parent;
    const hq = obj?.userData?.hq;
    return hq && !hq.dead ? hq : null;
  }

  _findEnemyHQNearPoint(x, z) {
    const player = this.getPlayerTeam();
    let best = null;
    let bestDist = HQ_ATTACK_PROXIMITY;
    for (const hq of this.getHqs()) {
      if (hq.dead || hq.team === player) continue;
      const d = Math.hypot(x - hq.position.x, z - hq.position.z);
      if (d < bestDist) {
        bestDist = d;
        best = hq;
      }
    }
    return best;
  }

  _pickEnemyHQNearCursor() {
    const ground = this._raycastGroundHit();
    if (!ground) return null;
    return this._findEnemyHQNearPoint(ground.point.x, ground.point.z);
  }

  raycastEnemyHQ() {
    const player = this.getPlayerTeam();
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hqs = this.getHqs().filter((h) => !h.dead && h.team !== player);
    let best = null;
    let bestDist = Infinity;
    for (const hq of hqs) {
      if (!hq.mesh) continue;
      const hits = this.raycaster.intersectObject(hq.mesh, true);
      for (const hit of hits) {
        const found = this._hqFromRaycastHit(hit);
        if (found && hit.distance < bestDist) {
          bestDist = hit.distance;
          best = found;
        }
      }
    }
    return best ?? this._pickEnemyHQNearCursor();
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
    // Tall Berlin façades often ray-hit farther than the street pavement under the
    // cursor. Prefer solid buildings/walls with a generous bias so Shift-fire
    // actually orders an attack on the structure you clicked.
    const kind = sceneryHit?.target?.entry?.kind;
    const urbanSolid =
      kind === 'urbanHouse' ||
      kind === 'apartmentBlock' ||
      kind === 'factory' ||
      kind === 'church' ||
      kind === 'urbanWall' ||
      kind === 'farmHouse' ||
      kind === 'barn' ||
      kind === 'outbuilding';
    const sceneryBias = urbanSolid ? 14 : 0.6;

    if (sceneryHit && groundHit && sceneryHit.distance < groundHit.distance + sceneryBias) {
      return { kind: 'scenery', target: sceneryHit.target };
    }
    if (sceneryHit && !groundHit) return { kind: 'scenery', target: sceneryHit.target };
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
    const hitboxes = [];
    for (const t of targets) {
      if (t.dead || !t.mesh) continue;
      const hitbox = t.mesh.getObjectByName?.('baseBuildingHitbox');
      if (hitbox) hitboxes.push(hitbox);
    }
    if (!hitboxes.length) return null;
    const hits = this.raycaster.intersectObjects(hitboxes, false);
    if (!hits.length) return null;
    const id = hits[0].object.userData.baseBuildingEntryId;
    const target = targets.find((t) => t.entry?.id === id) ?? null;
    this._baseBuildingPickDist = target ? hits[0].distance : Infinity;
    return target;
  }

  /** Enemy unit or HQ under cursor (cover/scenery uses Shift+LMB manual fire). */
  raycastAttackTarget() {
    const unit = this.raycastEnemyUnit();
    const hq = this.raycastEnemyHQ();
    const structure = this.raycastEnemyBaseBuilding();
    const groundHit = this._raycastGroundHit();

    const combat = [];
    if (unit) {
      // Prefer true mesh hit distance; proximity-only picks use ground range so
      // they still compete fairly with HQ / base-building picks.
      let dist = this._raycastHitDistance(this._unitPickMesh(unit));
      if (!Number.isFinite(dist) || dist === Infinity) {
        dist = groundHit?.distance ?? Math.hypot(
          (unit.position?.x ?? 0) - (groundHit?.point?.x ?? 0),
          (unit.position?.z ?? 0) - (groundHit?.point?.z ?? 0)
        );
      }
      combat.push({ target: unit, dist });
    }
    if (hq) combat.push({ target: hq, dist: this._raycastHitDistance(this._hqPickMesh(hq)) });
    if (structure) {
      combat.push({ target: structure, dist: this._baseBuildingPickDist ?? Infinity });
    }

    const nearHq = this._pickEnemyHQNearCursor();
    if (nearHq && !combat.some((c) => c.target === nearHq)) {
      combat.push({ target: nearHq, dist: groundHit?.distance ?? Infinity });
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

  _cancelVehicleHoverClear() {
    if (this._vehicleHoverClearTimer) clearTimeout(this._vehicleHoverClearTimer);
    this._vehicleHoverClearTimer = null;
  }

  _scheduleVehicleHoverClear() {
    if (
      this._vehicleActionHovered ||
      this._vehicleHoverClearTimer ||
      this.getEligibleVehicleEntrants(this.hoveredTarget).length === 0
    ) {
      return;
    }
    const retainedTarget = this.hoveredTarget;
    this._vehicleHoverClearTimer = setTimeout(() => {
      this._vehicleHoverClearTimer = null;
      if (!this._vehicleActionHovered && this.hoveredTarget === retainedTarget) {
        this.setHoveredTarget(null);
      }
    }, VEHICLE_ACTION_HOVER_GRACE_MS);
  }

  setVehicleEntryActionHovered(hovered) {
    this._vehicleActionHovered = !!hovered;
    if (this._vehicleActionHovered) this._cancelVehicleHoverClear();
    else this._scheduleVehicleHoverClear();
  }

  updateHoverTarget() {
    if (
      !this.enabled ||
      this.getPaused?.() ||
      this.getPendingFireSupport?.() ||
      this.getPendingDefensePlacement?.() ||
      this.getPendingLastStandDeploy?.() ||
      this.getPendingSandbagPlacement?.() ||
      this.getPendingTrenchPlacement?.() ||
      this.getPendingMedicTentPlacement?.() ||
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
    const vehicle = this.raycastUnit();
    if (vehicle && this.getEligibleVehicleEntrants(vehicle).length > 0) {
      this._cancelVehicleHoverClear();
      this.setHoveredTarget(vehicle);
      return;
    }
    if (vehicle && getTowActionTarget(this.getSelectedPlayerUnits(), vehicle, this.getUnits())) {
      this._cancelVehicleHoverClear();
      this.setHoveredTarget(vehicle);
      return;
    }
    const attackTarget = this.raycastAttackTarget();
    if (attackTarget) {
      this._cancelVehicleHoverClear();
      this.setHoveredTarget(attackTarget);
      return;
    }
    if (this.getEligibleVehicleEntrants(this.hoveredTarget).length > 0) {
      this._scheduleVehicleHoverClear();
      return;
    }
    if (getTowActionTarget(this.getSelectedPlayerUnits(), this.hoveredTarget, this.getUnits())) {
      this._scheduleVehicleHoverClear();
      return;
    }
    this._cancelVehicleHoverClear();
    this.setHoveredTarget(null);
  }

  getEligibleVehicleEntrants(vehicle = this.hoveredTarget) {
    if (!vehicle) return [];
    return this.getSelectedPlayerUnits().filter((unit) =>
      canUnitEnterVehicle(unit, vehicle)
    );
  }

  issueVehicleEntry(vehicle, { requireAllSelected = false } = {}) {
    if (this._inputBlocked() || !vehicle) return false;
    const selected = this.getSelectedPlayerUnits();
    const entrants = selected.filter((unit) => canUnitEnterVehicle(unit, vehicle));
    if (
      entrants.length === 0 ||
      (requireAllSelected && entrants.length !== selected.length)
    ) {
      return false;
    }
    const issued = issueMountOrder(
      entrants,
      vehicle,
      this.getUnits(),
      this.getGarrisonSources?.()
    );
    if (issued <= 0) return false;
    this._vehicleActionHovered = false;
    this._cancelVehicleHoverClear();
    this.setHoveredTarget(null);
    this._lastOrderAt = Date.now();
    this.onMoveOrder?.(entrants);
    this.onOrder?.('mount', entrants);
    return true;
  }

  issueTowAttach(target, { requireAllSelected = false } = {}) {
    if (this._inputBlocked() || !target) return false;
    const selected = this.getSelectedPlayerUnits();
    const pair = getTowActionTarget(selected, target, this.getUnits());
    if (!pair) return false;
    if (requireAllSelected && selected.length > 2) return false;
    if (!issueTowOrder(pair.truck, pair.gun, this.getUnits())) return false;
    this._vehicleActionHovered = false;
    this._cancelVehicleHoverClear();
    this.setHoveredTarget(null);
    this._lastOrderAt = Date.now();
    this.onOrder?.('tow', [pair.truck, pair.gun]);
    return true;
  }

  issueAttackOn(target, { inRangeOnly = false } = {}) {
    if (this._inputBlocked() || !target || target.dead) return false;
    if (this.getDeployZoneActive()) return false;

    const selected = this.getSelectedPlayerUnits();
    if (selected.length === 0) return false;

    const fireUnits = [];
    for (const u of selected) {
      if (inRangeOnly) {
        if (!canManualFireOrder(u) || !isInRange(u, target)) continue;
      }
      // Explicit player attack orders always bind and close with the target.
      // Hold Ground stops if that target later withdraws; Pursue follows it.
      if (u.setAttackOrder(target) === false) continue;
      fireUnits.push(u);
    }
    if (fireUnits.length === 0) return false;

    this._lastOrderAt = Date.now();
    if (this.onOrder) this.onOrder('attack', fireUnits);
    return true;
  }

  /** Shift+LMB ground fire — units move into range if needed; cleared on RMB move. */
  issueGroundFireAt(point) {
    if (this._inputBlocked()) return false;
    if (this.getDeployZoneActive()) return false;

    const selected = this.getSelectedPlayerUnits().filter((u) => canManualFireOrder(u));
    if (selected.length === 0) return false;

    const firingUnits = [];
    for (const u of selected) {
      if (u.setGroundAttack(createGroundTarget(point.x, point.z)) !== false) {
        firingUnits.push(u);
      }
    }
    if (firingUnits.length === 0) return false;
    this._lastOrderAt = Date.now();
    if (this.onOrder) this.onOrder('fire', firingUnits);
    return true;
  }

  /** Alt+Shift+LMB — artillery smoke shell at open ground. */
  issueShiftSmokeShell() {
    if (this._inputBlocked()) return false;

    const selected = this.getSelectedPlayerUnits().filter((u) => isSmokeShellReady(u));
    if (selected.length === 0) return false;

    const pick = this._pickShiftFireTarget();
    if (!pick || pick.kind !== 'ground') return false;

    selected.sort(
      (a, b) =>
        Math.hypot(a.position.x - pick.point.x, a.position.z - pick.point.z) -
        Math.hypot(b.position.x - pick.point.x, b.position.z - pick.point.z)
    );
    const firingGun = selected.find(
      (unit) => unit.setSmokeShellOrder(pick.point.x, pick.point.z) !== false
    );
    if (!firingGun) return false;
    this._lastOrderAt = Date.now();
    if (this.onOrder) this.onOrder('smoke', [firingGun]);
    return true;
  }

  /** Shift+LMB — attack cover under cursor, otherwise fire at open ground. */
  issueShiftManualFire() {
    if (this._inputBlocked()) return false;

    const selected = this.getSelectedPlayerUnits().filter((u) => canManualFireOrder(u));
    if (selected.length === 0) return false;

    // Prefer a living combat target (unit / HQ / base) so Shift+fire on an
    // enemy under the reticle tracks that unit. Without this, a click on the
    // pavement at their feet becomes a fixed ground mission that keeps
    // shelling empty dirt after they move. Tablet fire mode uses this path too.
    const combatTarget = this.raycastAttackTarget();
    if (combatTarget) {
      return this.issueAttackOn(combatTarget);
    }

    const pick = this._pickShiftFireTarget();
    if (!pick) return false;

    if (pick.kind === 'scenery') {
      const firingUnits = [];
      for (const u of selected) {
        if (u.setAttackOrder(pick.target, { manualFire: true }) !== false) {
          firingUnits.push(u);
        }
      }
      if (firingUnits.length === 0) return false;
      this._lastOrderAt = Date.now();
      if (this.onOrder) this.onOrder('attack', firingUnits);
      return true;
    }

    const firingUnits = [];
    for (const u of selected) {
      if (u.setGroundAttack(createGroundTarget(pick.point.x, pick.point.z)) !== false) {
        firingUnits.push(u);
      }
    }
    if (firingUnits.length === 0) return false;
    this._lastOrderAt = Date.now();
    if (this.onOrder) this.onOrder('fire', firingUnits);
    return true;
  }

  getSelectedPlayerUnits() {
    return this.getUnits().filter((u) => u.team === this.getPlayerTeam() && u.selected && !u.dead);
  }

  _inputBlocked() {
    return !this.enabled || this.getPaused?.();
  }

  onPointerDown(e) {
    if (this._inputBlocked() || e.button !== 0) return;
    this.setPointerFromEvent(e);

    const pendingFs = this.getPendingFireSupport?.();
    const pendingDef = this.getPendingDefensePlacement?.();
    const pendingDeploy = this.getPendingLastStandDeploy?.();
    const pendingSandbags = this.getPendingSandbagPlacement?.();
    const pendingTrench = this.getPendingTrenchPlacement?.();
    const pendingMedicTent = this.getPendingMedicTentPlacement?.();
    const pendingBaseBuild = this.getPendingBaseBuildingPlacement?.();
    if (
      pendingFs ||
      pendingDef ||
      pendingDeploy ||
      pendingSandbags ||
      pendingTrench ||
      pendingMedicTent ||
      pendingBaseBuild
    ) {
      return;
    }

    this.dragStart = { x: e.clientX, y: e.clientY };
    this._dragSelecting = false;

    if (this._tabletMode && this.getSelectedPlayerUnits().length > 0) {
      this._refreshHoverTargetNow();
    }
  }

  onPointerMove(e) {
    if (this._inputBlocked()) return;
    this.setPointerFromEvent(e);
    const pendingFs = this.getPendingFireSupport?.();
    const pendingSmoke = this.getPendingSmokeShell?.();
    const pendingDef = this.getPendingDefensePlacement?.();
    const pendingDeploy = this.getPendingLastStandDeploy?.();
    const pendingSandbags = this.getPendingSandbagPlacement?.();
    const pendingTrench = this.getPendingTrenchPlacement?.();
    const pendingMedicTent = this.getPendingMedicTentPlacement?.();
    const pendingBaseBuild = this.getPendingBaseBuildingPlacement?.();
    if (
      pendingFs ||
      pendingSmoke ||
      pendingDef ||
      pendingDeploy ||
      pendingSandbags ||
      pendingTrench ||
      pendingMedicTent ||
      pendingBaseBuild
    ) {
      const ground = this.raycastGround();
      if (ground) {
        if (pendingFs && this.onFireSupportTarget) {
          this.onFireSupportTarget('preview', ground.x, ground.z);
        }
        if (pendingSmoke && this.onSmokeShellTarget) {
          this.onSmokeShellTarget('preview', ground.x, ground.z);
        }
        if (pendingDef && this.onDefensePlacement) {
          this.onDefensePlacement('preview', ground.x, ground.z);
        }
        if (pendingSandbags && this.onSandbagPlacement) {
          this.onSandbagPlacement('preview', ground.x, ground.z);
        }
        if (pendingTrench && this.onTrenchPlacement) {
          this.onTrenchPlacement('preview', ground.x, ground.z);
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
    }
  }

  _shouldIssueTabletTapOrder(team) {
    if (
      !this._tabletMode ||
      this._tabletFireMode ||
      this.getSelectedPlayerUnits().length === 0
    ) {
      return false;
    }

    // A tap on a selectable friendly object remains a selection gesture. Empty
    // battlefield taps, including enemy targets, use the existing move/attack
    // order path below.
    if (this.raycastUnit(team) || this.raycastPlayerHQ()) return false;
    if (
      this.getIsBaseBuildingMode?.() &&
      this.pickPlayerBaseBuilding?.(this.raycaster, this.pointer, this.camera)
    ) {
      return false;
    }
    // Target mode keeps its two-tap/Engage behavior for enemy taps. Clear
    // ground remains a move tap even when Target is the active tablet mode.
    if (this._tabletTargetMode && this.raycastAttackTarget()) return false;
    return true;
  }

  onPointerUp(e) {
    if (this._inputBlocked() || e.button !== 0) return;
    this.setPointerFromEvent(e);

    const pendingFs = this.getPendingFireSupport?.();
    const pendingFsStrike = this.getPendingFireSupportStrike?.();
    const pendingSmoke = this.getPendingSmokeShell?.();
    const pendingDef = this.getPendingDefensePlacement?.();
    const pendingDeploy = this.getPendingLastStandDeploy?.();
    const pendingSandbags = this.getPendingSandbagPlacement?.();
    const pendingTrench = this.getPendingTrenchPlacement?.();
    const pendingMedicTent = this.getPendingMedicTentPlacement?.();
    const pendingBaseBuild = this.getPendingBaseBuildingPlacement?.();
    if (pendingFsStrike && this.onFireSupportTarget) {
      const ground = this.raycastGround();
      if (
        ground &&
        this.onFireSupportTarget('pending-interact', ground.x, ground.z)
      ) {
        this.dragStart = null;
        this._dragSelecting = false;
        return;
      }
    }
    if (
      pendingFs ||
      pendingSmoke ||
      pendingDef ||
      pendingDeploy ||
      pendingSandbags ||
      pendingTrench ||
      pendingMedicTent ||
      pendingBaseBuild
    ) {
      const pendingRadio = pendingFs
        ? this.raycastUnit(this.getPlayerTeam())
        : null;
      if (pendingRadio?.def?.type === 'radioOperator' && this.onFireSupportTarget) {
        const handled = this.onFireSupportTarget('radio-interact', pendingRadio);
        if (handled) {
          this.dragStart = null;
          this._dragSelecting = false;
          return;
        }
      }
      const ground = this.raycastGround();
      if (ground) {
        if (pendingFs && this.onFireSupportTarget) {
          this.onFireSupportTarget('place', ground.x, ground.z);
        }
        if (pendingSmoke && this.onSmokeShellTarget) {
          this.onSmokeShellTarget('place', ground.x, ground.z);
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
        if (pendingTrench && this.onTrenchPlacement) {
          this.onTrenchPlacement('place', ground.x, ground.z);
        }
        if (pendingMedicTent && this.onMedicTentPlacement) {
          this.onMedicTentPlacement('place', ground.x, ground.z);
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

    if (!this._dragSelecting && this._shouldIssueTabletTapOrder(team)) {
      this.issueMoveOrAttack();
      this._tabletTargetConfirmKey = null;
      this.dragStart = null;
      this._dragSelecting = false;
      this.updateHoverTarget();
      return;
    }

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
        if (u._mountedOnTankId) {
          u.setSelected(false);
          continue;
        }
        const p = u.mesh.position.clone().project(this.camera);
        const inside = p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY && p.z < 1;
        u.setSelected(inside);
      }
      this.getHqs().forEach((h) => h.setSelected(false));
      this._notifySelection(units, null, null);
    } else {
      const selectedBefore = units.filter((u) => u.selected && !u.dead);
      const shiftHeld = e.shiftKey || this.isManualFireModifier();
      const altHeld = e.altKey;
      const hasArtillery = selectedBefore.some((u) => canSmokeShellOrder(u));
      const shiftSmokeShell = shiftHeld && altHeld && hasArtillery;
      const shiftManualFire =
        shiftHeld &&
        !altHeld &&
        selectedBefore.length > 0 &&
        selectedBefore.some((u) => canManualFireOrder(u));

      if (shiftSmokeShell) {
        this.issueShiftSmokeShell();
        this._tabletTargetConfirmKey = null;
        this._notifySelection(units);
      } else if (shiftManualFire) {
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
    if (this._inputBlocked() || e.button !== 2) return;
    e.preventDefault();
    this.setPointerFromEvent(e);
    this.issueMoveOrAttack();
  }

  onContextMenu(e) {
    e.preventDefault();
    if (this._inputBlocked()) return;
    if (Date.now() - this._lastOrderAt < 80) return;
    this.setPointerFromEvent(e);
    this.issueMoveOrAttack();
  }

  issueMoveOrAttack() {
    if (this._inputBlocked()) return;

    const selected = this.getSelectedPlayerUnits();
    if (selected.length === 0) return;
    const player = this.getPlayerTeam();

    this._lastOrderAt = Date.now();

    const mountTarget = this.raycastUnit();
    if (this.issueVehicleEntry(mountTarget, { requireAllSelected: true })) return;
    if (this.issueTowAttach(mountTarget, { requireAllSelected: true })) return;

    if (!this.getDeployZoneActive()) {
      const attackTarget = this.raycastAttackTarget();
      if (attackTarget) {
        this.issueAttackOn(attackTarget);
        return;
      }
    }

    const ground = this.raycastGround();
    if (!ground) return;

    this.onMoveOrder?.(selected);

    const clamped = this.clampDeployPoint(ground.x, ground.z);

    const mapDef = this.getMapDef();
    const coverSystem = this.getCoverSystem?.();
    const seekCoverDefault = !!this.getSeekCoverMode?.();
    const garrisonSources = getGarrisonBunkerSources(this.getGarrisonSources?.());
    let snapX = clamped.x;
    let snapZ = clamped.z;
    let bunkerSnap = null;
    // Only units that can actually garrison may turn a nearby ground click
    // into an enter-building order. In Berlin the generous tenement footprint
    // otherwise captured road clicks from tanks and guns, making them turn
    // straight toward the façade and bypass vehicle road snapping.
    if (selected.every((unit) => canGarrisonType(unit.def?.type))) {
      // Prefer a direct mesh hit on the building (façade / roof). Perspective
      // ground rays often land on the pavement in front of tall Berlin blocks,
      // so footprint-only ground picks miss many intentional enter clicks.
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const groundHit = this._raycastGroundHit();
      const sceneryHit = this._raycastSceneryHit();
      const meshEntry = sceneryHit?.target?.entry ?? null;
      if (
        meshEntry &&
        !meshEntry.destroyed &&
        meshEntry.def?.garrison &&
        !(meshEntry.garrisonTeam && meshEntry.garrisonTeam !== player)
      ) {
        const kind = meshEntry.kind;
        const tallSolid =
          kind === 'urbanHouse' ||
          kind === 'apartmentBlock' ||
          kind === 'factory' ||
          kind === 'church' ||
          kind === 'farmHouse' ||
          kind === 'barn' ||
          kind === 'outbuilding';
        const bias = tallSolid ? 16 : 2.5;
        if (!groundHit || sceneryHit.distance < groundHit.distance + bias) {
          bunkerSnap = meshEntry;
          snapX = meshEntry.x;
          snapZ = meshEntry.z;
        }
      }

      if (!bunkerSnap) {
        for (const src of garrisonSources) {
          // Footprint-based ground pick (see DestructibleScenery.pickBunkerAt).
          const bunker = src.pickBunkerAt?.(clamped.x, clamped.z, player, 10);
          if (bunker) {
            snapX = bunker.x;
            snapZ = bunker.z;
            bunkerSnap = bunker;
            break;
          }
        }
      }
    }

    // Already-garrisoned troops ordered onto their *current* building must leave
    // toward the click (or a clear exterior), not re-enter the same room.
    // Without this, Berlin façade snaps turned every leave attempt into a loop.
    if (bunkerSnap && selected.some((unit) => unit._garrisonBunkerId)) {
      const allAlreadyInSnap = selected.every(
        (unit) =>
          !canGarrisonType(unit.def?.type) ||
          unit._garrisonBunkerId === bunkerSnap.id
      );
      const anyInSnap = selected.some((unit) => unit._garrisonBunkerId === bunkerSnap.id);
      if (anyInSnap && allAlreadyInSnap) {
        bunkerSnap = null;
        snapX = clamped.x;
        snapZ = clamped.z;
      }
    }

    // Per-unit destinations: units already inside bunkerSnap leave to the ground
    // click; others receive the enter-building order.
    let destinations;
    if (bunkerSnap) {
      destinations = selected.map((unit) => {
        if (unit._garrisonBunkerId === bunkerSnap.id) {
          return { unit, x: clamped.x, z: clamped.z, allowBuildingId: null };
        }
        return { unit, x: snapX, z: snapZ, allowBuildingId: bunkerSnap.id };
      });
    } else {
      destinations = spreadGroupMoveDestinations(selected, snapX, snapZ).map((d) => ({
        ...d,
        allowBuildingId: null,
      }));
    }
    for (const { unit, x, z, allowBuildingId } of destinations) {
      let destX = x;
      let destZ = z;
      if (
        getSeekCoverEnabled(unit, seekCoverDefault) &&
        coverSystem &&
        !allowBuildingId
      ) {
        const coverDest = resolveSeekCoverDestination(unit, x, z, coverSystem);
        destX = coverDest.x;
        destZ = coverDest.z;
      }
      const pt = this.clampDeployPoint(destX, destZ);
      // Pass allowBuildingId into moveTo — clearAttackOrder inside moveTo would
      // otherwise wipe a pre-set _bunkerEntryId and block entry pathing.
      unit.moveTo(pt.x, pt.z, mapDef, true, this.getScenery?.() ?? null, {
        allowBuildingId: allowBuildingId ?? null,
      });
    }
    if (this.onOrder) this.onOrder('move', selected);
  }
}
