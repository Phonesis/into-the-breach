import * as THREE from 'three';
import { sampleTerrainHeight } from '../world/Terrain.js';
import {
  BASE_BUILDING_TYPES,
  HQ_BASE_UNITS,
  getSpawnBuildingForUnit,
} from '../data/baseBuildings.js';
import {
  createBaseBuildingMesh,
  setBaseBuildingHpVisual,
} from '../visual/BaseBuildingMeshes.js';
import {
  createBaseBuildingConstructionVisual,
  updateBaseBuildingConstructionVisual,
  disposeBaseBuildingConstructionVisual,
} from '../visual/BaseBuildingConstruction.js';
import { wrapBaseBuildingTarget } from './BaseBuildingTarget.js';
import { releaseFromBunker } from './BunkerGarrison.js';
import { spawnExplosion } from '../effects/CombatEffects.js';

let nextId = 1;

export class BaseBuildingManager {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.entries = [];
    this.sites = [];
    this.pendingType = null;
    this._enemyBuildTimer = 14;
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

  _clearAll() {
    for (const site of this.sites) {
      disposeBaseBuildingConstructionVisual(site.marker);
      site.marker = null;
    }
    for (const entry of this.entries) {
      if (entry.mesh?.parent) entry.mesh.parent.remove(entry.mesh);
      this._disposeMesh(entry.mesh);
    }
    this.entries = [];
    this.sites = [];
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
    this.game.fireSupport?.cancel();
    this.game.engineerSandbags?.cancel();
    this.game.defenses?.cancelPending?.();
    if (this.pendingType === typeId) {
      this.pendingType = null;
      return true;
    }
    this.pendingType = typeId;
    return true;
  }

  cancelPending() {
    this.pendingType = null;
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

  pickBunkerAt(x, z, team, maxDist = 4.5) {
    const e = this.pickAt(x, z, team, maxDist);
    return e?.typeId === 'bunker' ? e : null;
  }

  countType(team, typeId) {
    let n = this.entries.filter((e) => e.team === team && e.typeId === typeId && !e.destroyed).length;
    n += this.sites.filter((s) => s.team === team && s.typeId === typeId).length;
    return n;
  }

  _countType(team, typeId) {
    return this.countType(team, typeId);
  }

  getPlacementRejectReason(x, z, team, typeId = this.pendingType) {
    if (!this.active || !typeId) return 'No structure selected.';
    const def = BASE_BUILDING_TYPES[typeId];
    if (!def) return 'Unknown structure.';

    if (this.game._isPlayerDeployZoneActive?.() && team === 'player') {
      return 'Wait for battle launch before expanding the base.';
    }

    const hq = this._hqPos(team);
    const distHq = Math.hypot(x - hq.x, z - hq.z);
    if (distHq < def.placementMinFromHq) return 'Too close to headquarters.';
    if (distHq > def.placementMaxFromHq) return 'Too far from headquarters.';

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

  tryPlace(x, z, team, spendResources) {
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
    visual.rotation.y = this._facingYaw(site.team, site.x, site.z);
    this.game.scene.add(visual);
    site.marker = visual;
    updateBaseBuildingConstructionVisual(visual, site.progress ?? 0, 0);
  }

  /** Engineer-erected bunker — no supply cost; counts toward bunker cap. */
  addEngineerBunker({ x, z, y, team, id }) {
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
      manager: this,
      engineerBuilt: true,
    };

    const mesh = createBaseBuildingMesh('bunker', this.getFactionId(team));
    mesh.position.set(x, y, z);
    mesh.rotation.y = this._facingYaw(team, x, z);
    this.game.scene.add(mesh);
    entry.mesh = mesh;
    this.entries.push(entry);
    return entry;
  }

  _completeSite(site) {
    disposeBaseBuildingConstructionVisual(site.marker);
    site.marker = null;

    const entry = {
      id: site.id,
      typeId: site.typeId,
      def: site.def,
      team: site.team,
      x: site.x,
      z: site.z,
      y: site.y,
      hp: site.def.hp,
      maxHp: site.def.hp,
      destroyed: false,
      building: false,
      garrison: [],
      mesh: null,
      manager: this,
    };

    const mesh = createBaseBuildingMesh(site.typeId, this.getFactionId(site.team));
    mesh.position.set(site.x, site.y, site.z);
    mesh.rotation.y = this._facingYaw(site.team, site.x, site.z);
    this.game.scene.add(mesh);
    entry.mesh = mesh;
    this.entries.push(entry);
  }

  destroyEntry(entry) {
    if (!entry || entry.destroyed) return;
    entry.destroyed = true;

    for (const unit of this.game.units) {
      if (unit._garrisonBunkerId === entry.id) releaseFromBunker(unit, this);
    }

    if (entry._attackTarget) entry._attackTarget.dead = true;
    spawnExplosion(this.game.scene, { x: entry.x, y: entry.y + 1, z: entry.z });
    if (entry.mesh?.parent) entry.mesh.parent.remove(entry.mesh);
    this._disposeMesh(entry.mesh);
    entry.mesh = null;
    this.game.ui?.updateBaseBuild?.(this.game);
    this.game.ui?.updateProduction?.(this.game);
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
    if (buildingType) {
      const entry = this.entries.find(
        (e) =>
          !e.destroyed &&
          !e.building &&
          e.team === team &&
          e.typeId === buildingType
      );
      if (entry) return { x: entry.x, z: entry.z };
    }
    return this._hqPos(team);
  }

  getAttackTargets() {
    const out = [];
    for (const entry of this.entries) {
      if (entry.destroyed || entry.building) continue;
      const t = wrapBaseBuildingTarget(entry, this);
      if (t) out.push(t);
    }
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
    const meshes = entries.map((e) => e.mesh).filter(Boolean);
    if (!meshes.length) return null;
    const hits = raycaster.intersectObjects(meshes, true);
    let best = null;
    let bestDist = Infinity;
    for (const hit of hits) {
      for (const entry of entries) {
        if (!entry.mesh) continue;
        let obj = hit.object;
        while (obj) {
          if (obj === entry.mesh) {
            if (hit.distance < bestDist) {
              bestDist = hit.distance;
              best = entry;
            }
            break;
          }
          obj = obj.parent;
        }
      }
    }
    return best;
  }

  update(dt) {
    if (!this.active) return;

    const finished = [];
    for (const site of this.sites) {
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

    this._enemyBuildTimer -= dt;
    if (this._enemyBuildTimer <= 0) {
      this._enemyBuildTimer = 18 + Math.random() * 14;
      this._tryEnemyBuild();
    }
  }

  _tryEnemyBuild() {
    if (this.game.tutorial || this.game.clearance) return;
    const team = 'enemy';
    const res = this.game.resources?.enemy ?? 0;
    const order = ['ordnanceYard', 'motorPool', 'hospital', 'bunker', 'bunker'];
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
    const hq = this._hqPos(team);
    const def = BASE_BUILDING_TYPES[typeId];
    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist =
        def.placementMinFromHq +
        Math.random() * (def.placementMaxFromHq - def.placementMinFromHq);
      return {
        x: hq.x + Math.cos(angle) * dist,
        z: hq.z + Math.sin(angle) * dist,
      };
    }
    return null;
  }
}