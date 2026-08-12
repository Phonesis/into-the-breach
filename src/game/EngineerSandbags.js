import * as THREE from 'three';
import { sampleTerrainHeight } from '../world/Terrain.js';
import { createSandbagEmplacementGroup } from '../world/SandbagEmplacement.js';
import {
  createCampaignBunkerMesh,
  setBaseBuildingHpVisual,
} from '../visual/BaseBuildingMeshes.js';
import { createDefenseMesh } from '../visual/DefenseMeshes.js';
import { BASE_BUILDING_TYPES, isBaseBuildingCampaign } from '../data/baseBuildings.js';
import {
  DEFENSE_TYPES,
  MINE_VEHICLE_TYPES,
  getMineDamageForUnit,
} from '../data/towerDefense.js';
import { spawnExplosion, spawnShellExplosion } from '../effects/CombatEffects.js';
import { addExplosionCrater } from '../world/TerrainDamage.js';
import { sounds } from '../audio/SoundManager.js';
import { applyMobilityDamage } from './ArmorPenetration.js';
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
export const MINE_BUILD_TIME = 8;
export const MINE_MAX_PER_TEAM = 16;

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
  mine: {
    id: 'mine',
    name: 'AT mine',
    buildTime: MINE_BUILD_TIME,
    hp: DEFENSE_TYPES.mine.hp,
    maxPerTeam: MINE_MAX_PER_TEAM,
    minSpacing: 3.2,
    markerColor: 0x4a4338,
    markerInner: 1.7,
    markerOuter: 2.15,
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
    this.mines = [];
  }

  reset() {
    this.pendingType = null;
    this._clearSiteMarkers();
    this._clearFieldBunkers();
    this._clearMines();
    this.sites = [];
    this._builtPositions = [];
    this.fieldBunkers = [];
    this.mines = [];
  }

  _clearFieldBunkers() {
    for (const entry of this.fieldBunkers) {
      if (entry.mesh?.parent) entry.mesh.parent.remove(entry.mesh);
      this._disposeMesh(entry.mesh);
      entry.mesh = null;
    }
  }

  _clearMines() {
    for (const entry of this.mines) {
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

  /** Seed a completed mine directly for authored scenarios and QA ranges. */
  addPrelaidMine({ x, z, team = 'enemy', rotationY = 0, id = null } = {}) {
    if (!Number.isFinite(x) || !Number.isFinite(z) || !this.game?.mapDef) return null;

    const def = DEFENSE_TYPES.mine;
    const y = sampleTerrainHeight(x, z, this.game.mapDef);
    const mesh = createDefenseMesh('mine', 0xc9a227, this._factionId(team));
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotationY;
    this.game.scene.add(mesh);

    const entry = {
      id: id ?? `prelaid-mine-${this.mines.length + 1}`,
      team,
      x,
      z,
      y,
      damage: def.damage,
      damageByVehicleType: def.damageByVehicleType,
      triggerRadius: def.triggerRadius,
      blastRadius: def.blastRadius,
      mesh,
      prelaid: true,
    };
    this.mines.push(entry);
    this._builtPositions.push({
      id: entry.id,
      x,
      z,
      team,
      buildType: 'mine',
      rotationY,
      prelaid: true,
    });
    return entry;
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
      if (e.destroyed || (e.team !== team && (e.garrison?.length ?? 0) > 0)) continue;
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
      _aiDefensiveFieldwork: !!site._aiDefensiveFieldwork,
      _aiFieldworkMode: site._aiFieldworkMode ?? null,
    };

    const mesh = createCampaignBunkerMesh(this._factionId(site.team));
    mesh.position.set(site.x, site.y, site.z);
    mesh.rotation.y = site.rotationY ?? this._facingYaw(site.team, site.x, site.z);
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

  canBuildMine() {
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
    if (buildType === 'mine' && !this.canBuildMine()) return false;

    this.game.fireSupport?.cancel();
    this.game.defenses?.cancelPending?.();
    this.game.baseBuildings?.cancelPending?.();
    if (this.game.lastStand?.pendingType) {
      this.game.lastStand.pendingType = null;
      this.game.ui?.updateLastStandDeploy(this.game);
    }

    this.game._clearDirectionalPlacement?.('engineer');
    if (this.pendingType === buildType) {
      this.pendingType = null;
      return false;
    }
    this.pendingType = buildType;
    return true;
  }

  cancel() {
    this.pendingType = null;
    this.game._clearDirectionalPlacement?.('engineer');
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

  _nearestSelectedEngineer(x, z, team, selectedOnly = true, predicate = null) {
    const engineers = this.game.units.filter(
      (u) =>
        (!selectedOnly || u.selected) &&
        u.team === team &&
        !u.dead &&
        !u.surrendered &&
        !u._captureExit &&
        u.def?.type === 'engineer' &&
        !u._sandbagSite &&
        (!predicate || predicate(u))
    );
    let best = null;
    let bestD = Number.POSITIVE_INFINITY;
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

  getPlacementRejectReason(x, z, team, buildType = this.pendingType, options = {}) {
    const preset = this._buildPreset(buildType);
    if (!preset) return 'No build type selected.';
    if (buildType === 'sandbags' && !this.canBuildSandbags()) {
      return 'Sandbag builds unavailable in this mode.';
    }
    if (buildType === 'bunker' && !this.canBuildBunker()) {
      return 'Bunker builds unavailable in this mode.';
    }
    if (buildType === 'mine' && !this.canBuildMine()) {
      return 'Mine laying unavailable in this mode.';
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
      buildType === 'bunker' && isBaseBuildingCampaign(this.game)
        ? 'bunkers per base'
        : buildType === 'mine'
          ? 'AT mines per side'
          : `${preset.name} per side`;
    if (this._teamBuiltCount(team, buildType) >= preset.maxPerTeam) {
      return `Maximum ${preset.maxPerTeam} ${maxLabel}.`;
    }

    const spacingReason = this._spacingConflict(x, z, preset.minSpacing, buildType);
    if (spacingReason) return spacingReason;

    if (this.game.scenery?.isFieldWorksPlacementBlocked?.(x, z, 1.7)) {
      return 'Cannot build inside a building.';
    }

    const engineer = this._nearestSelectedEngineer(x, z, team, options.selectedOnly !== false);
    if (!engineer) {
      return 'Select a free engineer to assign this build site.';
    }

    return null;
  }

  /** Nearby open-ground candidates for AI field works (avoids tenement interiors). */
  _aiPlacementCandidates(x, z) {
    const candidates = [{ x, z }];
    const clear = this.game.scenery?.findClearVehiclePlacement?.(
      x,
      z,
      1.7,
      this.game.mapDef
    );
    if (clear && (Math.abs(clear.x - x) > 0.05 || Math.abs(clear.z - z) > 0.05)) {
      candidates.unshift(clear);
    }
    for (let ring = 1; ring <= 5; ring++) {
      const radius = ring * 3.4;
      const steps = 6 + ring * 2;
      for (let i = 0; i < steps; i++) {
        const angle = (i / steps) * Math.PI * 2;
        candidates.push({
          x: x + Math.cos(angle) * radius,
          z: z + Math.sin(angle) * radius,
        });
      }
    }
    return candidates;
  }

  tryPlace(x, z, team, rotationY = null) {
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
      rotationY: rotationY ?? this._facingYaw(team, x, z),
      progress: 0,
      marker: null,
    };
    this.sites.push(site);
    engineer._sandbagSite = site.id;
    engineer.clearAttackOrder?.();
    engineer.moveTo(site.x, site.z, this.game.mapDef, true);
    site.moveOrderIssued = true;
    this._attachSiteMarker(site);
    this.pendingType = null;
    this.game.ui?.updateEngineerBuild?.(this.game);
    this.game._syncPlacementCapture?.();
    this.game._syncBattleCursor?.();
    return true;
  }

  tryAiPlace(x, z, team, buildType, rotationY = null, engineerPredicate = null) {
    for (const pos of this._aiPlacementCandidates(x, z)) {
      const reason = this.getPlacementRejectReason(pos.x, pos.z, team, buildType, {
        selectedOnly: false,
      });
      if (reason) continue;

      const engineer = this._nearestSelectedEngineer(
        pos.x,
        pos.z,
        team,
        false,
        engineerPredicate
      );
      if (!engineer) continue;

      const y = this.game.mapDef
        ? sampleTerrainHeight(pos.x, pos.z, this.game.mapDef)
        : 0;
      const site = {
        id: nextSiteId++,
        buildType,
        x: pos.x,
        z: pos.z,
        y,
        team,
        engineerId: engineer.id,
        rotationY: rotationY ?? this._facingYaw(team, pos.x, pos.z),
        progress: 0,
        marker: null,
      };
      this.sites.push(site);
      engineer._sandbagSite = site.id;
      engineer.clearAttackOrder?.();
      engineer.moveTo?.(site.x, site.z, this.game.mapDef, true);
      site.moveOrderIssued = true;
      this._attachSiteMarker(site);
      return true;
    }
    return false;
  }

  _attachSiteMarker(site) {
    const kind =
      site.buildType === 'bunker'
        ? 'bunker'
        : site.buildType === 'mine'
          ? 'mine'
          : 'sandbags';
    const visual = createFieldConstructionVisual({
      kind,
      team: site.team,
      label: kind === 'bunker' ? 'Bunker' : kind === 'mine' ? 'AT Mine' : 'Sandbags',
      verb: kind === 'mine' ? 'Laying' : 'Building',
    });
    visual.position.set(site.x, site.y, site.z);
    visual.rotation.y = site.rotationY ?? this._facingYaw(site.team, site.x, site.z);
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

    if (site.buildType === 'mine') {
      const def = DEFENSE_TYPES.mine;
      const mesh = createDefenseMesh('mine', 0xc9a227, factionId);
      mesh.position.set(site.x, site.y, site.z);
      mesh.rotation.y = site.rotationY ?? 0;
      this.game.scene.add(mesh);
      this.mines.push({
        id: site.id,
        team: site.team,
        x: site.x,
        z: site.z,
        y: site.y,
        damage: def.damage,
        damageByVehicleType: def.damageByVehicleType,
        triggerRadius: def.triggerRadius,
        blastRadius: def.blastRadius,
        mesh,
        _aiDefensiveFieldwork: !!site._aiDefensiveFieldwork,
        _aiFieldworkMode: site._aiFieldworkMode ?? null,
      });
      this._builtPositions.push({
        id: site.id,
        x: site.x,
        z: site.z,
        team: site.team,
        buildType: site.buildType,
        rotationY: site.rotationY,
        _aiDefensiveFieldwork: !!site._aiDefensiveFieldwork,
        _aiFieldworkMode: site._aiFieldworkMode ?? null,
      });
      return;
    }

    if (site.buildType === 'bunker' && isBaseBuildingCampaign(this.game)) {
      this.game.baseBuildings?.addEngineerBunker?.({
        id: site.id,
        x: site.x,
        z: site.z,
        y: site.y,
        team: site.team,
        rotationY: site.rotationY,
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
        rotationY: site.rotationY,
        _aiDefensiveFieldwork: !!site._aiDefensiveFieldwork,
        _aiFieldworkMode: site._aiFieldworkMode ?? null,
      });
      this.game.coverSystem?.updateUnits?.(this.game._aliveUnits ?? this.game.units);
      return;
    }

    const group = createSandbagEmplacementGroup({
      factionId,
      seed: site.x * 0.17 + site.z * 0.23,
    });
    group.position.set(site.x, site.y, site.z);
    group.rotation.y = site.rotationY ?? this._facingYaw(site.team, site.x, site.z);

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
      rotationY: site.rotationY,
      _aiDefensiveFieldwork: !!site._aiDefensiveFieldwork,
      _aiFieldworkMode: site._aiFieldworkMode ?? null,
    });
    this.game.coverSystem?.updateUnits?.(this.game._aliveUnits ?? this.game.units);
  }

  _cancelSite(site) {
    const engineer = this.game.units.find((u) => u.id === site.engineerId);
    if (engineer) engineer._sandbagSite = null;
    this._disposeSiteMarker(site);
  }

  cancelForUnit(engineer) {
    const site = this.sites.find((s) => s.engineerId === engineer?.id);
    if (!site) return false;
    this._cancelSite(site);
    this.sites = this.sites.filter((s) => s.id !== site.id);
    return true;
  }

  update(dt) {
    this._updateMines();
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
        if (!site.moveOrderIssued || !engineer.moveTarget) {
          engineer.moveTo(site.x, site.z, this.game.mapDef, true);
          site.moveOrderIssued = true;
        }
        // Still pulse the marker while engineer is en route
        if (site.marker) updateFieldConstructionVisual(site.marker, site.progress ?? 0, dt);
      } else {
        site.moveOrderIssued = false;
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

  _updateMines() {
    if (!this.mines.length) return;
    for (const mine of this.mines) {
      const enemies =
        mine.team === 'player'
          ? (this.game._enemyAlive ?? [])
          : (this.game._playerAlive ?? []);
      for (const unit of enemies) {
        if (unit.dead || !MINE_VEHICLE_TYPES.has(unit.def?.type)) continue;
        const distance = Math.hypot(unit.position.x - mine.x, unit.position.z - mine.z);
        if (distance > mine.triggerRadius) continue;
        this._detonateMine(mine);
        break;
      }
    }
  }

  detonateMinesAt(x, z, radius, attackerTeam) {
    const hits = this.mines.filter((mine) => {
      if (mine.team === attackerTeam) return false;
      return Math.hypot(mine.x - x, mine.z - z) <= Math.max(1.2, radius);
    });
    for (const mine of hits) this._detonateMine(mine);
    return hits.length;
  }

  _detonateMine(mine) {
    if (!mine || !this.mines.includes(mine)) return false;
    const y = this.game.mapDef
      ? sampleTerrainHeight(mine.x, mine.z, this.game.mapDef)
      : mine.y;
    spawnShellExplosion(
      this.game.scene,
      { x: mine.x, y: y + 0.5, z: mine.z },
      'medium',
      75
    );
    addExplosionCrater(
      this.game.scene,
      this.game.mapDef,
      mine.x,
      mine.z,
      'medium',
      this.game._terrainMesh
    );
    sounds.playMineExplosion({ x: mine.x, z: mine.z });

    const blastRadius = mine.blastRadius ?? mine.triggerRadius * 2.2;
    for (const unit of this.game._aliveUnits ?? this.game.units) {
      if (unit.dead || !MINE_VEHICLE_TYPES.has(unit.def?.type)) continue;
      const distance = Math.hypot(unit.position.x - mine.x, unit.position.z - mine.z);
      if (distance > blastRadius) continue;
      const falloff = Math.max(0.35, 1 - distance / blastRadius);
      unit.takeDamage(getMineDamageForUnit(mine, unit.def?.type) * falloff);
      if (!unit.dead) applyMobilityDamage(unit);
    }

    if (mine.mesh?.parent) mine.mesh.parent.remove(mine.mesh);
    this._disposeMesh(mine.mesh);
    mine.mesh = null;
    this.mines = this.mines.filter((entry) => entry !== mine);
    this._builtPositions = this._builtPositions.filter(
      (position) => position.buildType !== 'mine' || position.id !== mine.id
    );
    return true;
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
