import * as THREE from 'three';
import { sampleTerrainHeight } from '../world/Terrain.js';
import { createSandbagEmplacementGroup } from '../world/SandbagEmplacement.js';
import { distanceBetween } from './Targeting.js';

export const SANDBAG_BUILD_TIME = 11;
export const SANDBAG_PLACE_RANGE = 24;
export const SANDBAG_BUILD_RANGE = 4.5;
export const SANDBAG_MIN_SPACING = 7;
export const SANDBAG_MAX_PER_TEAM = 14;
export const SANDBAG_COVER_TYPE = 'heavy';
export const SANDBAG_HP = 120;

let nextSiteId = 1;

export class EngineerSandbagManager {
  constructor(game) {
    this.game = game;
    this.pending = false;
    this.sites = [];
    this._builtPositions = [];
  }

  reset() {
    this.pending = false;
    this._clearSiteMarkers();
    this.sites = [];
    this._builtPositions = [];
  }

  canUse() {
    const g = this.game;
    if (!g?.running || g.gameOver || g.towerDefense) return false;
    return true;
  }

  getPending() {
    return this.canUse() && this.pending ? 'sandbags' : null;
  }

  arm() {
    if (!this.canUse()) return false;
    this.game.fireSupport?.cancel();
    this.game.defenses?.cancelPending?.();
    if (this.game.lastStand?.pendingType) {
      this.game.lastStand.pendingType = null;
      this.game.ui?.updateLastStandDeploy(this.game);
    }
    this.pending = !this.pending;
    return this.pending;
  }

  cancel() {
    this.pending = false;
  }

  _clearSiteMarkers() {
    for (const site of this.sites) {
      if (site.marker?.parent) site.marker.parent.remove(site.marker);
      site.marker?.material?.dispose();
      site.marker = null;
    }
  }

  _teamBuiltCount(team) {
    let n = this._builtPositions.filter((p) => p.team === team).length;
    for (const site of this.sites) {
      if (site.team === team) n++;
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

  getPlacementRejectReason(x, z, team) {
    if (!this.canUse()) return 'Sandbag builds unavailable in this mode.';
    if (this.game._isPlayerDeployZoneActive?.()) {
      return 'Wait for battle launch before building field works.';
    }

    const map = this.game.mapDef;
    if (map) {
      const half = map.size * 0.48;
      if (Math.abs(x) > half || Math.abs(z) > half) return 'Too close to the map edge.';
    }

    if (this._teamBuiltCount(team) >= SANDBAG_MAX_PER_TEAM) {
      return `Maximum ${SANDBAG_MAX_PER_TEAM} engineer sandbag positions per side.`;
    }

    for (const pos of this._builtPositions) {
      if (Math.hypot(pos.x - x, pos.z - z) < SANDBAG_MIN_SPACING) {
        return 'Too close to an existing sandbag position.';
      }
    }
    for (const site of this.sites) {
      if (Math.hypot(site.x - x, site.z - z) < SANDBAG_MIN_SPACING) {
        return 'Too close to a build already in progress.';
      }
    }

    const engineer = this._nearestSelectedEngineer(x, z, team);
    if (!engineer) {
      return 'Select a free engineer within ~24 m of the build site.';
    }

    return null;
  }

  tryPlace(x, z, team) {
    if (!this.pending) return false;
    const reason = this.getPlacementRejectReason(x, z, team);
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
    this.pending = false;
    this.game.ui?.updateEngineerBuild?.(this.game);
    this.game._syncPlacementCapture?.();
    this.game._syncBattleCursor?.();
    return true;
  }

  _attachSiteMarker(site) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xc9a84a,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.65, 24), mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, site.y + 0.12, site.z);
    ring.renderOrder = 9;
    this.game.scene.add(ring);
    site.marker = ring;
  }

  _completeSite(site) {
    const engineer = this.game.units.find((u) => u.id === site.engineerId);
    if (engineer) engineer._sandbagSite = null;

    if (site.marker?.parent) site.marker.parent.remove(site.marker);
    site.marker?.material?.dispose();
    site.marker = null;

    const factionId =
      site.team === 'player' ? this.game.playerFaction?.id : this.game.enemyFaction?.id;

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
        coverType: SANDBAG_COVER_TYPE,
        coverRadius: 5.5,
        hp: SANDBAG_HP,
      });
    } else {
      this.game.scene.add(group);
      this.game.coverSystem?.addZone(site.x, site.z, SANDBAG_COVER_TYPE, 5.5);
    }

    this._builtPositions.push({ x: site.x, z: site.z, team: site.team });
    this.game.coverSystem?.updateUnits?.(this.game._aliveUnits ?? this.game.units);
  }

  _cancelSite(site) {
    const engineer = this.game.units.find((u) => u.id === site.engineerId);
    if (engineer) engineer._sandbagSite = null;
    if (site.marker?.parent) site.marker.parent.remove(site.marker);
    site.marker?.material?.dispose();
    site.marker = null;
  }

  update(dt) {
    if (!this.sites.length) return;

    const finished = [];
    for (const site of this.sites) {
      const engineer = this.game.units.find((u) => u.id === site.engineerId);
      if (!engineer || engineer.dead || engineer.surrendered || engineer._captureExit) {
        this._cancelSite(site);
        finished.push(site.id);
        continue;
      }

      const dist = Math.hypot(engineer.position.x - site.x, engineer.position.z - site.z);
      if (dist > SANDBAG_BUILD_RANGE) {
        engineer.moveTo(site.x, site.z, this.game.mapDef, true);
      } else {
        engineer.moveTarget = null;
        engineer._movePath = null;
        site.progress += dt / SANDBAG_BUILD_TIME;
        if (site.marker?.material) {
          site.marker.material.opacity = 0.35 + Math.min(site.progress, 1) * 0.45;
        }
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
    return {
      progress: Math.min(1, site.progress),
      pct: Math.round(Math.min(1, site.progress) * 100),
    };
  }
}