import * as THREE from 'three';
import { sampleTerrainHeight } from '../world/Terrain.js';
import {
  BASE_BUILDING_TYPES,
  HQ_BASE_UNITS,
  getSpawnBuildingForUnit,
} from '../data/baseBuildings.js';
import {
  createBaseBuildingMesh,
  createBaseBuildingRubble,
  setBaseBuildingHpVisual,
} from '../visual/BaseBuildingMeshes.js';
import {
  createBaseBuildingConstructionVisual,
  updateBaseBuildingConstructionVisual,
  disposeBaseBuildingConstructionVisual,
} from '../visual/BaseBuildingConstruction.js';
import { wrapBaseBuildingTarget } from './BaseBuildingTarget.js';
import { getGarrisonBunkerSources, releaseFromBunker } from './BunkerGarrison.js';
import { spawnShellExplosion } from '../effects/CombatEffects.js';
import { isTeamStagingPhase } from './OpeningDeployZone.js';
import { addExplosionCrater } from '../world/TerrainDamage.js';

let nextId = 1;

export function setBaseBuildingNextId(n) {
  nextId = Math.max(1, Math.floor(n) || 1);
}

export function peekBaseBuildingNextId() {
  return nextId;
}

export class BaseBuildingManager {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.entries = [];
    this.sites = [];
    this.pendingType = null;
    this._enemyBuildTimer = 14;
    this._attackTargetsCache = null;
  }

  reset() {
    this.active = false;
    this.pendingType = null;
    this._enemyBuildTimer = 14;
    this._clearAll();
  }

  enable() {
    this.active = true;
  }

  _addCompletedEntry({ typeId, team, x, z, y, id, rotationY = null }) {
    const def = BASE_BUILDING_TYPES[typeId];
    if (!def) return null;
    const entry = {
      id: id ?? nextId++,
      typeId,
      def,
      team,
      x,
      z,
      y,
      hp: def.hp,
      maxHp: def.hp,
      destroyed: false,
      building: false,
      garrison: [],
      mesh: null,
      rubbleMesh: null,
      manager: this,
    };
    const mesh = createBaseBuildingMesh(typeId, this.getFactionId(team));
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotationY ?? this._facingYaw(team, x, z);
    this.game.scene.add(mesh);
    entry.mesh = mesh;
    this._tagEntryHitbox(entry);
    this.entries.push(entry);
    this._invalidateAttackTargetsCache();
    return entry;
  }

  _clearAll() {
    for (const site of this.sites) {
      disposeBaseBuildingConstructionVisual(site.marker);
      site.marker = null;
    }
    for (const entry of this.entries) {
      if (entry.mesh?.parent) entry.mesh.parent.remove(entry.mesh);
      this._disposeMesh(entry.mesh);
      if (entry.rubbleMesh?.parent) entry.rubbleMesh.parent.remove(entry.rubbleMesh);
      this._disposeMesh(entry.rubbleMesh);
      entry.mesh = null;
      entry.rubbleMesh = null;
    }
    this.entries = [];
    this.sites = [];
    this._attackTargetsCache = null;
  }

  _invalidateAttackTargetsCache() {
    this._attackTargetsCache = null;
  }

  _tagEntryHitbox(entry) {
    const hitbox = entry.mesh?.getObjectByName?.('baseBuildingHitbox');
    if (hitbox) hitbox.userData.baseBuildingEntryId = entry.id;
  }

  _disposeMesh(mesh) {
    if (!mesh) return;
    mesh.traverse((c) => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) {
        if (c.material.map) c.material.map.dispose();
        c.material.dispose();
      }
    });
  }

  getFactionId(team) {
    return team === 'player' ? this.game.playerFaction?.id : this.game.enemyFaction?.id;
  }

  _hqPos(team) {
    const hq = this.game.hqs?.find((h) => h.team === team && !h.dead);
    if (hq) return { x: hq.position.x, z: hq.position.z };
    const base = team === 'player' ? this.game.mapDef?.playerBase : this.game.mapDef?.enemyBase;
    return base ? { x: base.x, z: base.z } : { x: 0, z: 0 };
  }

  /** Y rotation so building front (+Z) points at the opposing HQ / base. */
  _facingYaw(team, x, z) {
    const foeTeam = team === 'player' ? 'enemy' : 'player';
    const foe = this._hqPos(foeTeam);
    const dx = foe.x - x;
    const dz = foe.z - z;
    if (Math.hypot(dx, dz) < 0.5) return team === 'player' ? 0 : Math.PI;
    return Math.atan2(dx, dz);
  }

  getPending() {
    return this.active && this.pendingType ? this.pendingType : null;
  }

  arm(typeId) {
    const def = BASE_BUILDING_TYPES[typeId];
    if (!def || !this.active) return false;
    if (isTeamStagingPhase(this.game, 'player')) return false;
    this.game.fireSupport?.cancel();
    this.game.engineerSandbags?.cancel();
    this.game.defenses?.cancelPending?.();
    this.game._clearDirectionalPlacement?.('base');
    if (this.pendingType === typeId) {
      this.pendingType = null;
      return true;
    }
    this.pendingType = typeId;
    return true;
  }

  cancelPending() {
    this.pendingType = null;
    this.game._clearDirectionalPlacement?.('base');
  }

  getEntryById(id) {
    return this.entries.find((e) => e.id === id && !e.destroyed) ?? null;
  }

  pickAt(x, z, team = null, maxDist = 5) {
    let best = null;
    let bestD = maxDist;
    for (const e of this.entries) {
      if (e.destroyed || e.building) continue;
      if (team && e.team !== team) continue;
      const d = Math.hypot(x - e.x, z - e.z);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  pickBunkerAt(x, z, team, maxDist = 6.5) {
    let best = null;
    let bestD = maxDist;
    for (const e of this.entries) {
      if (e.destroyed || e.building || e.typeId !== 'bunker') continue;
      if (team && e.team !== team && (e.garrison?.length ?? 0) > 0) continue;
      const d = Math.hypot(x - e.x, z - e.z);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  countType(team, typeId) {
    let n = this.entries.filter((e) => e.team === team && e.typeId === typeId && !e.destroyed).length;
    n += this.sites.filter((s) => s.team === team && s.typeId === typeId).length;
    return n;
  }

  _countType(team, typeId) {
    return this.countType(team, typeId);
  }

  _controlledSectors(team) {
    return (this.game.capturePoints ?? []).filter((cp) => cp.owner === team);
  }

  _placementValidAtAnchor(x, z, anchorX, anchorZ, def) {
    const dist = Math.hypot(x - anchorX, z - anchorZ);
    return dist >= def.placementMinFromHq && dist <= def.placementMaxFromHq;
  }

  _canPlaceAt(x, z, team, def) {
    const hq = this._hqPos(team);
    if (this._placementValidAtAnchor(x, z, hq.x, hq.z, def)) return true;
    for (const cp of this._controlledSectors(team)) {
      if (this._placementValidAtAnchor(x, z, cp.x, cp.z, def)) return true;
    }
    return false;
  }

  _tooCloseToBuildAnchor(x, z, team, def) {
    const hq = this._hqPos(team);
    if (Math.hypot(x - hq.x, z - hq.z) < def.placementMinFromHq) return true;
    for (const cp of this._controlledSectors(team)) {
      if (Math.hypot(x - cp.x, z - cp.z) < def.placementMinFromHq) return true;
    }
    return false;
  }

  _buildAnchors(team) {
    const hq = this._hqPos(team);
    const anchors = [{ x: hq.x, z: hq.z }];
    for (const cp of this._controlledSectors(team)) {
      anchors.push({ x: cp.x, z: cp.z });
    }
    return anchors;
  }

  getPlacementRejectReason(x, z, team, typeId = this.pendingType) {
    if (!this.active || !typeId) return 'No structure selected.';
    const def = BASE_BUILDING_TYPES[typeId];
    if (!def) return 'Unknown structure.';

    if (isTeamStagingPhase(this.game, team)) {
      return team === 'player'
        ? 'Wait for battle launch before expanding the base.'
        : 'Staging phase';
    }

    if (!this._canPlaceAt(x, z, team, def)) {
      if (this._tooCloseToBuildAnchor(x, z, team, def)) {
        return 'Too close to headquarters or a controlled sector.';
      }
      const hasSectors = this._controlledSectors(team).length > 0;
      return hasSectors
        ? 'Place within build range of HQ or a sector you control.'
        : 'Place within build range of HQ — capture sectors to build forward bases.';
    }

    if (this._countType(team, typeId) >= (def.maxPerTeam ?? 99)) {
      return `Maximum ${def.maxPerTeam} ${def.name} per base.`;
    }

    const spacing = def.minSpacing ?? 8;
    for (const e of this.entries) {
      if (e.destroyed) continue;
      if (Math.hypot(e.x - x, e.z - z) < spacing) return 'Too close to another structure.';
    }
    for (const s of this.sites) {
      if (Math.hypot(s.x - x, s.z - z) < spacing) return 'Too close to a build in progress.';
    }

    const map = this.game.mapDef;
    if (map) {
      const half = map.size * 0.46;
      if (Math.abs(x) > half || Math.abs(z) > half) return 'Outside the build zone.';
    }

    return null;
  }

  tryPlace(x, z, team, spendResources, rotationY = null) {
    const typeId = this.pendingType;
    if (!typeId) return false;
    const def = BASE_BUILDING_TYPES[typeId];
    const reason = this.getPlacementRejectReason(x, z, team, typeId);
    if (reason) {
      if (team === 'player') this.game.ui?.showBaseBuildHint?.(reason);
      return false;
    }
    if (!spendResources(def.cost)) return false;

    const y = this.game.mapDef ? sampleTerrainHeight(x, z, this.game.mapDef) : 0;
    const site = {
      id: nextId++,
      typeId,
      def,
      team,
      x,
      z,
      y,
      progress: 0,
      rotationY: rotationY ?? this._facingYaw(team, x, z),
      marker: null,
    };
    this.sites.push(site);
    this._attachSiteMarker(site);
    this.pendingType = null;
    this.game.ui?.updateBaseBuild?.(this.game);
    this.game._syncPlacementCapture?.();
    this.game._syncBattleCursor?.();
    return true;
  }

  _attachSiteMarker(site) {
    const visual = createBaseBuildingConstructionVisual({
      def: site.def,
      team: site.team,
    });
    visual.position.set(site.x, site.y, site.z);
    visual.rotation.y = site.rotationY ?? this._facingYaw(site.team, site.x, site.z);
    this.game.scene.add(visual);
    site.marker = visual;
    updateBaseBuildingConstructionVisual(visual, site.progress ?? 0, 0);
  }

  /** Engineer-erected bunker — no supply cost; counts toward bunker cap. */
  addEngineerBunker({ x, z, y, team, id, rotationY = null }) {
    if (!this.active) return null;
    const def = BASE_BUILDING_TYPES.bunker;
    const entry = {
      id: id ?? nextId++,
      typeId: 'bunker',
      def,
      team,
      x,
      z,
      y,
      hp: def.hp,
      maxHp: def.hp,
      destroyed: false,
      building: false,
      garrison: [],
      mesh: null,
      rubbleMesh: null,
      manager: this,
      engineerBuilt: true,
    };

    const mesh = createBaseBuildingMesh('bunker', this.getFactionId(team));
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotationY ?? this._facingYaw(team, x, z);
    this.game.scene.add(mesh);
    entry.mesh = mesh;
    this._tagEntryHitbox(entry);
    this.entries.push(entry);
    this._invalidateAttackTargetsCache();
    return entry;
  }

  _completeSite(site) {
    disposeBaseBuildingConstructionVisual(site.marker);
    site.marker = null;
    this._addCompletedEntry({
      typeId: site.typeId,
      team: site.team,
      x: site.x,
      z: site.z,
      y: site.y,
      id: site.id,
      rotationY: site.rotationY,
    });
  }

  destroyEntry(entry) {
    if (!entry || entry.destroyed) return;
    entry.destroyed = true;

    for (const unit of this.game.units) {
      if (unit._garrisonBunkerId === entry.id) {
        releaseFromBunker(unit, getGarrisonBunkerSources(this.game));
      }
    }

    if (entry._attackTarget) entry._attackTarget.dead = true;

    const pos = { x: entry.x, y: (entry.y ?? 0) + 1, z: entry.z };
    const yaw = entry.mesh?.rotation?.y ?? this._facingYaw(entry.team, entry.x, entry.z);

    // Heavier collapse FX than a small infantry puff
    spawnShellExplosion(this.game.scene, pos, entry.typeId === 'bunker' ? 'medium' : 'heavy');

    if (this.game.mapDef) {
      addExplosionCrater(
        this.game.scene,
        this.game.mapDef,
        entry.x,
        entry.z,
        entry.typeId === 'bunker' ? 'medium' : 'heavy',
        this.game._terrainMesh
      );
    }

    if (entry.mesh?.parent) entry.mesh.parent.remove(entry.mesh);
    this._disposeMesh(entry.mesh);
    entry.mesh = null;

    // Leave permanent rubble where the structure stood
    this._spawnRubble(entry, yaw);

    this._invalidateAttackTargetsCache();
    this.game.ui?.updateBaseBuild?.(this.game);
    this.game.ui?.updateProduction?.(this.game);
  }

  /**
   * Place a lasting rubble pile for a destroyed base structure.
   * Kept on the entry so battle teardown can dispose it.
   */
  _spawnRubble(entry, yaw = 0) {
    if (!entry || entry.rubbleMesh) return;
    const radius = entry.def?.radius ?? entry.def?.hitRadius ?? 3.6;
    const rubble = createBaseBuildingRubble(entry.typeId, radius);
    rubble.position.set(entry.x, entry.y ?? 0, entry.z);
    rubble.rotation.y = yaw + (Math.random() - 0.5) * 0.35;
    this.game.scene.add(rubble);
    entry.rubbleMesh = rubble;
  }

  /** Restore rubble for a previously destroyed building (battle load). */
  restoreDestroyedRubble(entry) {
    if (!entry?.destroyed) return;
    const yaw = this._facingYaw(entry.team, entry.x, entry.z);
    this._spawnRubble(entry, yaw);
  }

  onDamaged(entry) {
    if (!entry?.mesh) return;
    const ratio = entry.maxHp > 0 ? entry.hp / entry.maxHp : 0;
    const accent = entry.team === 'player' ? 0x5a9fd4 : 0xf87171;
    setBaseBuildingHpVisual(entry.mesh, ratio, accent);
  }

  getUnlockedUnits(team) {
    const set = new Set(HQ_BASE_UNITS);
    if (!this.active) return null;
    for (const e of this.entries) {
      if (e.destroyed || e.building) continue;
      if (e.team !== team) continue;
      for (const u of e.def.unlocks ?? []) set.add(u);
    }
    return set;
  }

  hasCompletedBuilding(team, typeId) {
    return this.entries.some(
      (e) => !e.destroyed && !e.building && e.team === team && e.typeId === typeId
    );
  }

  getSpawnPosition(team, unitType) {
    if (!this.active) return null;
    const buildingType = getSpawnBuildingForUnit(unitType);
    if (!buildingType) return null;
    const entry = this.entries.find(
      (e) =>
        !e.destroyed &&
        !e.building &&
        e.team === team &&
        e.typeId === buildingType
    );
    return entry ? { x: entry.x, z: entry.z } : null;
  }

  getAttackTargets() {
    if (this._attackTargetsCache) return this._attackTargetsCache;
    const out = [];
    for (const entry of this.entries) {
      if (entry.destroyed || entry.building) continue;
      const t = wrapBaseBuildingTarget(entry, this);
      if (t) out.push(t);
    }
    this._attackTargetsCache = out;
    return out;
  }

  getPlayerEntries() {
    if (!this.active) return [];
    return this.entries.filter((e) => e.team === 'player' && !e.destroyed && !e.building);
  }

  raycastPlayerEntry(raycaster, pointer, camera) {
    const entries = this.getPlayerEntries();
    if (!entries.length) return null;
    raycaster.setFromCamera(pointer, camera);
    const hitboxes = [];
    for (const entry of entries) {
      const hitbox = entry.mesh?.getObjectByName?.('baseBuildingHitbox');
      if (hitbox) hitboxes.push(hitbox);
    }
    if (!hitboxes.length) return null;
    const hits = raycaster.intersectObjects(hitboxes, false);
    if (!hits.length) return null;
    const id = hits[0].object.userData.baseBuildingEntryId;
    return entries.find((e) => e.id === id) ?? null;
  }

  update(dt) {
    if (!this.active) return;

    const finished = [];
    for (const site of this.sites) {
      if (isTeamStagingPhase(this.game, site.team)) {
        continue;
      }
      site.progress += dt / Math.max(site.def.buildTime, 1);
      if (site.marker) {
        updateBaseBuildingConstructionVisual(site.marker, site.progress, dt);
      }
      if (site.progress >= 1) {
        this._completeSite(site);
        finished.push(site.id);
        if (site.team === 'player') {
          this.game.ui?.updateProduction?.(this.game);
        }
      }
    }
    if (finished.length) {
      this.sites = this.sites.filter((s) => !finished.includes(s.id));
      this.game.ui?.updateBaseBuild?.(this.game);
    }

    if (!isTeamStagingPhase(this.game, 'enemy')) {
      this._enemyBuildTimer -= dt;
      if (this._enemyBuildTimer <= 0) {
        this._enemyBuildTimer = 18 + Math.random() * 14;
        this._tryEnemyBuild();
      }
    }
  }

  _tryEnemyBuild() {
    if (this.game.tutorial || this.game.clearance) return;
    const team = 'enemy';
    const res = this.game.resources?.enemy ?? 0;
    const order = ['infantryGarrison', 'ordnanceYard', 'motorPool', 'hospital', 'bunker', 'bunker'];
    for (const typeId of order) {
      const def = BASE_BUILDING_TYPES[typeId];
      if (this._countType(team, typeId) >= (def.maxPerTeam ?? 99)) continue;
      if (res < def.cost) continue;
      const pos = this._randomBuildPos(team, typeId);
      if (!pos) continue;
      if (this.getPlacementRejectReason(pos.x, pos.z, team, typeId)) continue;
      if (!this.game.spendResources(team, def.cost)) continue;
      const y = this.game.mapDef
        ? sampleTerrainHeight(pos.x, pos.z, this.game.mapDef)
        : 0;
      const site = {
        id: nextId++,
        typeId,
        def,
        team,
        x: pos.x,
        z: pos.z,
        y,
        progress: 0,
        marker: null,
      };
      this.sites.push(site);
      this._attachSiteMarker(site);
      return;
    }
  }

  _randomBuildPos(team, typeId) {
    const def = BASE_BUILDING_TYPES[typeId];
    const anchors = this._buildAnchors(team);
    for (let i = 0; i < 24; i++) {
      const anchor = anchors[Math.floor(Math.random() * anchors.length)];
      const angle = Math.random() * Math.PI * 2;
      const dist =
        def.placementMinFromHq +
        Math.random() * (def.placementMaxFromHq - def.placementMinFromHq);
      const pos = {
        x: anchor.x + Math.cos(angle) * dist,
        z: anchor.z + Math.sin(angle) * dist,
      };
      if (!this.getPlacementRejectReason(pos.x, pos.z, team, typeId)) return pos;
    }
    return null;
  }
}
