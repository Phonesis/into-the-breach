import * as THREE from 'three';
import { sampleTerrainHeight } from '../world/Terrain.js';
import { createSandbagEmplacementGroup } from '../world/SandbagEmplacement.js';
import {
  createCampaignBunkerMesh,
  setBaseBuildingHpVisual,
} from '../visual/BaseBuildingMeshes.js';
import { BASE_BUILDING_TYPES, isBaseBuildingCampaign } from '../data/baseBuildings.js';
import { spawnExplosion } from '../effects/CombatEffects.js';
import { wrapBaseBuildingTarget } from './BaseBuildingTarget.js';
import { getGarrisonBunkerSources, releaseFromBunker } from './BunkerGarrison.js';
import { distanceBetween } from './Targeting.js';
import {
  createFieldConstructionVisual,
  updateFieldConstructionVisual,
  disposeFieldConstructionVisual,
} from '../visual/FieldConstructionVisual.js';

export const SANDBAG_BUILD_TIME = 11;
export const BUNKER_BUILD_TIME = 28;
export const SANDBAG_PLACE_RANGE = 24;
export const SANDBAG_BUILD_RANGE = 4.5;
export const SANDBAG_MIN_SPACING = 7;
export const SANDBAG_MAX_PER_TEAM = 14;
export const SANDBAG_COVER_TYPE = 'heavy';
export const SANDBAG_HP = 120;
export const BUNKER_MIN_SPACING = 9;
export const BUNKER_HP = 240;
export const BUNKER_COVER_RADIUS = 6;

export const FIELD_BUILD_TYPES = {
  sandbags: {
    id: 'sandbags',
    name: 'sandbags',
    buildTime: SANDBAG_BUILD_TIME,
    hp: SANDBAG_HP,
    coverType: SANDBAG_COVER_TYPE,
    coverRadius: 5.5,
    maxPerTeam: SANDBAG_MAX_PER_TEAM,
    minSpacing: SANDBAG_MIN_SPACING,
    markerColor: 0xc9a84a,
    markerInner: 2.2,
    markerOuter: 2.65,
  },
  bunker: {
    id: 'bunker',
    name: 'bunker',
    buildTime: BUNKER_BUILD_TIME,
    hp: BUNKER_HP,
    coverType: SANDBAG_COVER_TYPE,
    coverRadius: BUNKER_COVER_RADIUS,
    maxPerTeam: BASE_BUILDING_TYPES.bunker.maxPerTeam,
    minSpacing: BUNKER_MIN_SPACING,
    markerColor: 0x7a6a4a,
    markerInner: 3,
    markerOuter: 3.55,
  },
};

let nextSiteId = 1;

export function setEngineerSiteNextId(n) {
  nextSiteId = Math.max(1, Math.floor(n) || 1);
}

export function peekEngineerSiteNextId() {
  return nextSiteId;
}

export class EngineerSandbagManager {
  constructor(game) {
    this.game = game;
    this.pendingType = null;
    this.sites = [];
    this._builtPositions = [];
    this.fieldBunkers = [];
  }

  reset() {
    this.pendingType = null;
    this._clearSiteMarkers();
    this._clearFieldBunkers();
    this.sites = [];
    this._builtPositions = [];
    this.fieldBunkers = [];
  }

  _clearFieldBunkers() {
    for (const entry of this.fieldBunkers) {
      if (entry.mesh?.parent) entry.mesh.parent.remove(entry.mesh);
      this._disposeMesh(entry.mesh);
      entry.mesh = null;
    }
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

  _factionId(team) {
    return team === 'player' ? this.game.playerFaction?.id : this.game.enemyFaction?.id;
  }

  hasGarrisonBunkers() {
    return this.fieldBunkers.some((e) => !e.destroyed);
  }

  getEntryById(id) {
    return this.fieldBunkers.find((e) => e.id === id && !e.destroyed) ?? null;
  }

  pickBunkerAt(x, z, team, maxDist = 4.5) {
    let best = null;
    let bestD = maxDist;
    for (const e of this.fieldBunkers) {
      if (e.destroyed || e.team !== team) continue;
      const d = Math.hypot(x - e.x, z - e.z);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  getAttackTargets() {
    const out = [];
    for (const entry of this.fieldBunkers) {
      if (entry.destroyed) continue;
      const t = wrapBaseBuildingTarget(entry, this);
      if (t) out.push(t);
    }
    return out;
  }

  onDamaged(entry) {
    if (!entry?.mesh) return;
    const ratio = entry.maxHp > 0 ? entry.hp / entry.maxHp : 0;
    const accent = entry.team === 'player' ? 0x5a9fd4 : 0xf87171;
    setBaseBuildingHpVisual(entry.mesh, ratio, accent);
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
    spawnExplosion(this.game.scene, { x: entry.x, y: entry.y + 1, z: entry.z });
    if (entry.mesh?.parent) entry.mesh.parent.remove(entry.mesh);
    this._disposeMesh(entry.mesh);
    entry.mesh = null;
    this.game.coverSystem?.updateUnits?.(this.game._aliveUnits ?? this.game.units);
  }

  _addFieldBunker(site) {
    const def = BASE_BUILDING_TYPES.bunker;
    const entry = {
      id: site.id,
      typeId: 'bunker',
      def,
      team: site.team,
      x: site.x,
      z: site.z,
      y: site.y,
      hp: BUNKER_HP,
      maxHp: BUNKER_HP,
      destroyed: false,
      building: false,
      garrison: [],
      mesh: null,
      manager: this,
      engineerBuilt: true,
    };

    const mesh = createCampaignBunkerMesh(this._factionId(site.team));
    mesh.position.set(site.x, site.y, site.z);
    mesh.rotation.y = this._facingYaw(site.team, site.x, site.z);
    this.game.scene.add(mesh);
    entry.mesh = mesh;
    this.fieldBunkers.push(entry);
    return entry;
  }

  canUse() {
    const g = this.game;
    if (!g?.running || g.gameOver) return false;
    // Available in all modes (including Tower Defence HQ Defense). Emplacements
    // style has no player army, so the UI never offers the buttons.
    return true;
  }

  canBuildSandbags() {
    // Base Building uses HQ bunkers for permanent works; field sandbags stay off there
    return this.canUse() && !isBaseBuildingCampaign(this.game);
  }

  canBuildBunker() {
    return this.canUse();
  }

  getPending() {
    return this.canUse() && this.pendingType ? this.pendingType : null;
  }

  arm(buildType) {
    const preset = FIELD_BUILD_TYPES[buildType];
    if (!preset) return false;
    if (buildType === 'sandbags' && !this.canBuildSandbags()) return false;
    if (buildType === 'bunker' && !this.canBuildBunker()) return false;

    this.game.fireSupport?.cancel();
    this.game.defenses?.cancelPending?.();
    this.game.baseBuildings?.cancelPending?.();
    if (this.game.lastStand?.pendingType) {
      this.game.lastStand.pendingType = null;
      this.game.ui?.updateLastStandDeploy(this.game);
    }

    if (this.pendingType === buildType) {
      this.pendingType = null;
      return false;
    }
    this.pendingType = buildType;
    return true;
  }

  cancel() {
    this.pendingType = null;
  }

  _buildPreset(buildType = this.pendingType) {
    return FIELD_BUILD_TYPES[buildType] ?? null;
  }

  _clearSiteMarkers() {
    for (const site of this.sites) {
      this._disposeSiteMarker(site);
    }
  }

  _disposeSiteMarker(site) {
    if (!site?.marker) return;
    if (site.marker.userData?.fieldConstruction) {
      disposeFieldConstructionVisual(site.marker);
    } else {
      if (site.marker.parent) site.marker.parent.remove(site.marker);
      site.marker.geometry?.dispose();
      site.marker.material?.dispose();
    }
    site.marker = null;
  }

  _teamBuiltCount(team, buildType) {
    if (buildType === 'bunker' && isBaseBuildingCampaign(this.game)) {
      let n = this.game.baseBuildings?.countType(team, 'bunker') ?? 0;
      for (const site of this.sites) {
        if (site.team === team && site.buildType === 'bunker') n++;
      }
      return n;
    }
    let n = this._builtPositions.filter((p) => p.team === team && p.buildType === buildType).length;
    for (const site of this.sites) {
      if (site.team === team && site.buildType === buildType) n++;
    }
    return n;
  }

  _nearestSelectedEngineer(x, z, team) {
    const engineers = this.game.units.filter(
      (u) =>
        u.selected &&
        u.team === team &&
        !u.dead &&
        !u.surrendered &&
        !u._captureExit &&
        u.def?.type === 'engineer' &&
        !u._sandbagSite
    );
    let best = null;
    let bestD = SANDBAG_PLACE_RANGE;
    for (const eng of engineers) {
      const d = Math.hypot(eng.position.x - x, eng.position.z - z);
      if (d <= bestD) {
        bestD = d;
        best = eng;
      }
    }
    return best;
  }

  _facingYaw(team, x, z) {
    const foeTeam = team === 'player' ? 'enemy' : 'player';
    const hq = this.game.hqs?.find((h) => h.team === foeTeam && !h.dead);
    const base =
      foeTeam === 'player' ? this.game.mapDef?.playerBase : this.game.mapDef?.enemyBase;
    const fx = hq?.position?.x ?? base?.x ?? 0;
    const fz = hq?.position?.z ?? base?.z ?? 0;
    const dx = fx - x;
    const dz = fz - z;
    if (Math.hypot(dx, dz) < 0.5) return team === 'player' ? 0 : Math.PI;
    return Math.atan2(dx, dz);
  }

  _spacingConflict(x, z, minSpacing, buildType) {
    for (const pos of this._builtPositions) {
      if (Math.hypot(pos.x - x, pos.z - z) < minSpacing) {
        return buildType === 'bunker' ? 'Too close to another field work.' : 'Too close to an existing sandbag position.';
      }
    }
    for (const site of this.sites) {
      if (Math.hypot(site.x - x, site.z - z) < minSpacing) {
        return 'Too close to a build already in progress.';
      }
    }

    const bb = this.game.baseBuildings;
    if (bb?.active && buildType === 'bunker') {
      const spacing = BASE_BUILDING_TYPES.bunker.minSpacing ?? 7;
      for (const e of bb.entries) {
        if (e.destroyed) continue;
        if (Math.hypot(e.x - x, e.z - z) < spacing) return 'Too close to another structure.';
      }
      for (const s of bb.sites) {
        if (Math.hypot(s.x - x, s.z - z) < spacing) return 'Too close to a structure under construction.';
      }
    }

    return null;
  }

  getPlacementRejectReason(x, z, team, buildType = this.pendingType) {
    const preset = this._buildPreset(buildType);
    if (!preset) return 'No build type selected.';
    if (buildType === 'sandbags' && !this.canBuildSandbags()) {
      return 'Sandbag builds unavailable in this mode.';
    }
    if (buildType === 'bunker' && !this.canBuildBunker()) {
      return 'Bunker builds unavailable in this mode.';
    }
    if (this.game._isPlayerDeployZoneActive?.()) {
      return 'Wait for battle launch before building field works.';
    }

    const map = this.game.mapDef;
    if (map) {
      const half = map.size * 0.48;
      if (Math.abs(x) > half || Math.abs(z) > half) return 'Too close to the map edge.';
    }

    const maxLabel =
      buildType === 'bunker' && isBaseBuildingCampaign(this.game) ? 'bunkers per base' : `${preset.name} per side`;
    if (this._teamBuiltCount(team, buildType) >= preset.maxPerTeam) {
      return `Maximum ${preset.maxPerTeam} ${maxLabel}.`;
    }

    const spacingReason = this._spacingConflict(x, z, preset.minSpacing, buildType);
    if (spacingReason) return spacingReason;

    const engineer = this._nearestSelectedEngineer(x, z, team);
    if (!engineer) {
      return 'Select a free engineer within ~24 m of the build site.';
    }

    return null;
  }

  tryPlace(x, z, team) {
    const buildType = this.pendingType;
    if (!buildType) return false;
    const reason = this.getPlacementRejectReason(x, z, team, buildType);
    if (reason) {
      this.game.ui?.showEngineerBuildHint?.(reason);
      return false;
    }

    const engineer = this._nearestSelectedEngineer(x, z, team);
    if (!engineer) return false;

    const y = this.game.mapDef
      ? sampleTerrainHeight(x, z, this.game.mapDef)
      : 0;

    const site = {
      id: nextSiteId++,
      buildType,
      x,
      z,
      y,
      team,
      engineerId: engineer.id,
      progress: 0,
      marker: null,
    };
    this.sites.push(site);
    engineer._sandbagSite = site.id;
    this._attachSiteMarker(site);
    this.pendingType = null;
    this.game.ui?.updateEngineerBuild?.(this.game);
    this.game._syncPlacementCapture?.();
    this.game._syncBattleCursor?.();
    return true;
  }

  _attachSiteMarker(site) {
    const kind = site.buildType === 'bunker' ? 'bunker' : 'sandbags';
    const visual = createFieldConstructionVisual({
      kind,
      team: site.team,
      label: kind === 'bunker' ? 'Bunker' : 'Sandbags',
      verb: 'Building',
    });
    visual.position.set(site.x, site.y, site.z);
    this.game.scene.add(visual);
    site.marker = visual;
    updateFieldConstructionVisual(visual, site.progress ?? 0, 0);
  }

  _completeSite(site) {
    const engineer = this.game.units.find((u) => u.id === site.engineerId);
    if (engineer) engineer._sandbagSite = null;

    this._disposeSiteMarker(site);

    const preset = this._buildPreset(site.buildType);
    const factionId =
      site.team === 'player' ? this.game.playerFaction?.id : this.game.enemyFaction?.id;

    if (site.buildType === 'bunker' && isBaseBuildingCampaign(this.game)) {
      this.game.baseBuildings?.addEngineerBunker?.({
        id: site.id,
        x: site.x,
        z: site.z,
        y: site.y,
        team: site.team,
      });
      this.game.ui?.updateBaseBuild?.(this.game);
      this.game.coverSystem?.updateUnits?.(this.game._aliveUnits ?? this.game.units);
      return;
    }

    if (site.buildType === 'bunker') {
      this._addFieldBunker(site);
      this._builtPositions.push({
        x: site.x,
        z: site.z,
        team: site.team,
        buildType: site.buildType,
      });
      this.game.coverSystem?.updateUnits?.(this.game._aliveUnits ?? this.game.units);
      return;
    }

    const group = createSandbagEmplacementGroup({
      factionId,
      seed: site.x * 0.17 + site.z * 0.23,
    });
    group.position.set(site.x, site.y, site.z);

    if (this.game.scenery) {
      this.game.scenery.register(group, {
        x: site.x,
        z: site.z,
        kind: 'bunker',
        coverType: preset.coverType,
        coverRadius: preset.coverRadius,
        hp: preset.hp,
      });
    } else {
      this.game.scene.add(group);
      this.game.coverSystem?.addZone(site.x, site.z, preset.coverType, preset.coverRadius);
    }

    this._builtPositions.push({
      x: site.x,
      z: site.z,
      team: site.team,
      buildType: site.buildType,
    });
    this.game.coverSystem?.updateUnits?.(this.game._aliveUnits ?? this.game.units);
  }

  _cancelSite(site) {
    const engineer = this.game.units.find((u) => u.id === site.engineerId);
    if (engineer) engineer._sandbagSite = null;
    this._disposeSiteMarker(site);
  }

  update(dt) {
    if (!this.sites.length) return;

    const finished = [];
    for (const site of this.sites) {
      const preset = this._buildPreset(site.buildType);
      const buildTime = preset?.buildTime ?? SANDBAG_BUILD_TIME;
      const engineer = this.game.units.find((u) => u.id === site.engineerId);
      if (!engineer || engineer.dead || engineer.surrendered || engineer._captureExit) {
        this._cancelSite(site);
        finished.push(site.id);
        continue;
      }

      const dist = Math.hypot(engineer.position.x - site.x, engineer.position.z - site.z);
      if (dist > SANDBAG_BUILD_RANGE) {
        engineer.moveTo(site.x, site.z, this.game.mapDef, true);
        // Still pulse the marker while engineer is en route
        if (site.marker) updateFieldConstructionVisual(site.marker, site.progress ?? 0, dt);
      } else {
        engineer.moveTarget = null;
        engineer._movePath = null;
        site.progress += dt / buildTime;
        if (site.marker) updateFieldConstructionVisual(site.marker, site.progress, dt);
        if (site.progress >= 1) {
          this._completeSite(site);
          finished.push(site.id);
        }
      }
    }

    if (finished.length) {
      this.sites = this.sites.filter((s) => !finished.includes(s.id));
    }
  }

  getEngineerBuildStatus(engineer) {
    if (!engineer?._sandbagSite) return null;
    const site = this.sites.find((s) => s.id === engineer._sandbagSite);
    if (!site) return null;
    const preset = this._buildPreset(site.buildType);
    return {
      buildType: site.buildType,
      label: preset?.name ?? 'field work',
      progress: Math.min(1, site.progress),
      pct: Math.round(Math.min(1, site.progress) * 100),
    };
  }
}