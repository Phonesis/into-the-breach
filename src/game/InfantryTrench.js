import * as THREE from 'three';
import { sampleTerrainHeight, sampleTerrainMeshHeight } from '../world/Terrain.js';
import {
  alignTrenchGroupToTerrain,
  createTrenchGroup,
  TRENCH_PIT_DEPTH,
  TRENCH_OCCUPANT_SURFACE_OFFSET,
} from '../world/TrenchMesh.js';
import { deformTerrainForTrench } from '../world/TerrainDamage.js';
import { isUnitMounted } from './TankRiders.js';
import { isUnitGarrisoned } from './BunkerGarrison.js';
import { isTdHqDefenseStyle } from '../data/towerDefense.js';
import { clampToPlayerSideOfFrontline } from './TowerDefenseMode.js';
import {
  createFieldConstructionVisual,
  updateFieldConstructionVisual,
  disposeFieldConstructionVisual,
} from '../visual/FieldConstructionVisual.js';

export const TRENCH_DIG_TIME = 14;
export const TRENCH_PLACE_RANGE = 18;
export const TRENCH_DIG_RANGE = 3.8;
export const TRENCH_MIN_SPACING = 6.5;
export const TRENCH_MAX_PER_TEAM = 14;
export const TRENCH_COVER_RADIUS = 3.6;
/** Damage taken while dug into a trench (~70% reduction). */
export const TRENCH_COVER_MULT = 0.3;
export const TRENCH_CAPACITY = 4;
export const TRENCH_ENTER_RANGE = 3.2;

const TRENCH_COLLAPSE_DURATION = 0.9;
const TRENCH_COLLAPSE_FINAL_SCALE = 0.68;
const TRENCH_COLLAPSE_FINAL_Y_OFFSET = -0.045;
const TRENCH_ESCAPE_IMMUNITY_MS = 1600;
const TRENCH_ESCAPE_DISTANCE = 5.8;

function trenchOverrunSurvivalChance(crusherType) {
  if (crusherType === 'superHeavyTank') return 0.34;
  if (crusherType === 'tankDestroyer') return 0.48;
  return 0.58;
}

function trenchSurfaceRecovery(trench, worldX, worldZ) {
  const length = trench?.mesh?.userData?.trenchLength ?? 4.2;
  const width = trench?.mesh?.userData?.trenchWidth ?? 2.4;
  const yaw = trench?.rotationY ?? trench?.mesh?.userData?.trenchYaw ?? 0;
  const dx = worldX - (trench?.x ?? 0);
  const dz = worldZ - (trench?.z ?? 0);
  const rightX = Math.cos(yaw);
  const rightZ = -Math.sin(yaw);
  const forwardX = Math.sin(yaw);
  const forwardZ = Math.cos(yaw);
  const localX = dx * rightX + dz * rightZ;
  const localZ = dx * forwardX + dz * forwardZ;
  const halfLength = Math.max(0.8, length * 0.44);
  const halfWidth = Math.max(0.42, width * 0.3);
  const lengthFade = Math.max(0.28, length * 0.09);
  const widthFade = Math.max(0.22, width * 0.1);
  const edgeX = Math.max(Math.abs(localX) - halfLength, 0);
  const edgeZ = Math.max(Math.abs(localZ) - halfWidth, 0);
  const edgeDistance = Math.hypot(edgeX / lengthFade, edgeZ / widthFade);
  if (edgeDistance >= 1) return 0;
  const t = THREE.MathUtils.clamp(1 - edgeDistance, 0, 1);
  const smooth = t * t * (3 - 2 * t);
  return TRENCH_PIT_DEPTH * smooth;
}

const DIG_TYPES = new Set([
  'commander',
  'radioOperator',
  'infantry',
  'paratrooper',
  'machineGun',
  'sniper',
]);
/** Foot troops that can occupy a finished trench (not dig). */
const OCCUPY_TYPES = new Set([
  'commander',
  'radioOperator',
  'infantry',
  'paratrooper',
  'machineGun',
  'sniper',
  'medic',
  'engineer',
]);

let nextTrenchId = 1;

export function setTrenchNextId(n) {
  nextTrenchId = Math.max(1, Math.floor(n) || 1);
}

export function peekTrenchNextId() {
  return nextTrenchId;
}

export function canDigTrenchType(unitType) {
  return DIG_TYPES.has(unitType);
}

export function isUnitInTrench(unit) {
  return !!unit?._trenchId;
}

export function getTrenchCoverMultiplier(unit) {
  return isUnitInTrench(unit) ? TRENCH_COVER_MULT : 1;
}

export class InfantryTrenchManager {
  constructor(game) {
    this.game = game;
    this.pending = false;
    this.sites = [];
    this.trenches = [];
  }

  reset() {
    this.pending = false;
    this._clearSiteMarkers();
    this._clearTrenches();
    this.sites = [];
    this.trenches = [];
  }

  _clearTrenches() {
    for (const t of this.trenches) {
      this._releaseAllFromTrench(t);
      if (t.mesh?.parent) t.mesh.parent.remove(t.mesh);
      this._disposeMesh(t.mesh);
      t.mesh = null;
      if (this.game.coverSystem) {
        this.game.coverSystem.removeZoneAt(t.x, t.z, TRENCH_COVER_RADIUS + 1);
      }
    }
    this.trenches = [];
  }

  _disposeMesh(mesh) {
    if (!mesh) return;
    mesh.traverse((c) => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) {
        if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose?.());
        else c.material.dispose?.();
      }
    });
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

  canUse() {
    const g = this.game;
    return !!(g?.running && !g.gameOver);
  }

  getPending() {
    return this.canUse() && this.pending;
  }

  arm() {
    if (!this.canUse()) return false;
    this.game.fireSupport?.cancel();
    this.game.defenses?.cancelPending?.();
    this.game.baseBuildings?.cancelPending?.();
    this.game.engineerSandbags?.cancel?.();
    if (this.game.lastStand?.pendingType) {
      this.game.lastStand.pendingType = null;
      this.game.ui?.updateLastStandDeploy(this.game);
    }
    this.game._clearDirectionalPlacement?.('trench');
    if (this.pending) {
      this.pending = false;
      return false;
    }
    this.pending = true;
    return true;
  }

  cancel() {
    this.pending = false;
    this.game._clearDirectionalPlacement?.('trench');
  }

  _diggersSelected(team, selectedOnly = true) {
    return this.game.units.filter(
      (u) =>
        (!selectedOnly || u.selected) &&
        u.team === team &&
        !u.dead &&
        !u.surrendered &&
        !u._captureExit &&
        !u._dropping &&
        canDigTrenchType(u.def?.type) &&
        !u._trenchDigSite &&
        !u._trenchId &&
        !isUnitGarrisoned(u) &&
        !isUnitMounted(u)
    );
  }

  _nearestDigger(x, z, team, selectedOnly = true, predicate = null) {
    const diggers = this._diggersSelected(team, selectedOnly).filter(
      (unit) => !predicate || predicate(unit)
    );
    let best = null;
    let bestD = Number.POSITIVE_INFINITY;
    for (const u of diggers) {
      const d = Math.hypot(u.position.x - x, u.position.z - z);
      if (d <= bestD) {
        bestD = d;
        best = u;
      }
    }
    return best;
  }

  _teamTrenchCount(team) {
    let n = this.trenches.filter((t) => t.team === team && !t.destroyed).length;
    n += this.sites.filter((s) => s.team === team).length;
    return n;
  }

  _spacingConflict(x, z) {
    for (const t of this.trenches) {
      if (t.destroyed) continue;
      if (Math.hypot(t.x - x, t.z - z) < TRENCH_MIN_SPACING) {
        return 'Too close to another trench.';
      }
    }
    for (const s of this.sites) {
      if (Math.hypot(s.x - x, s.z - z) < TRENCH_MIN_SPACING) {
        return 'Too close to a trench already being dug.';
      }
    }
    return null;
  }

  getPlacementRejectReason(x, z, team, options = {}) {
    if (!this.canUse()) return 'Trenches unavailable.';
    if (this.game._isPlayerDeployZoneActive?.()) {
      return 'Wait for battle launch before digging trenches.';
    }

    let px = x;
    let pz = z;
    if (isTdHqDefenseStyle(this.game.towerDefense) && team === 'player') {
      const clamped = clampToPlayerSideOfFrontline(x, z, this.game);
      px = clamped.x;
      pz = clamped.z;
    }

    const map = this.game.mapDef;
    if (map) {
      const half = map.size * 0.48;
      if (Math.abs(px) > half || Math.abs(pz) > half) return 'Too close to the map edge.';
    }

    if (this.game.scenery?.isFieldWorksPlacementBlocked?.(px, pz, 1.55)) {
      return 'Cannot dig a trench inside a building.';
    }

    if (this._teamTrenchCount(team) >= TRENCH_MAX_PER_TEAM) {
      return `Maximum ${TRENCH_MAX_PER_TEAM} trenches per side.`;
    }

    const spacing = this._spacingConflict(px, pz);
    if (spacing) return spacing;

    if (
      !this._nearestDigger(
        px,
        pz,
        team,
        options.selectedOnly !== false,
        options.diggerPredicate ?? null
      )
    ) {
      return 'Select a free radio operator, infantry, airborne, MG team, or sniper to assign this dig site.';
    }

    return null;
  }

  /** Nearby open-ground candidates for AI dig sites (avoids tenement interiors). */
  _aiPlacementCandidates(x, z) {
    const candidates = [{ x, z }];
    const clear = this.game.scenery?.findClearVehiclePlacement?.(
      x,
      z,
      1.55,
      this.game.mapDef
    );
    if (clear && (Math.abs(clear.x - x) > 0.05 || Math.abs(clear.z - z) > 0.05)) {
      candidates.unshift(clear);
    }
    for (let ring = 1; ring <= 5; ring++) {
      const radius = ring * 3.1;
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
    if (!this.pending) return false;

    let px = x;
    let pz = z;
    if (isTdHqDefenseStyle(this.game.towerDefense) && team === 'player') {
      const clamped = clampToPlayerSideOfFrontline(x, z, this.game);
      px = clamped.x;
      pz = clamped.z;
    }

    const reason = this.getPlacementRejectReason(px, pz, team);
    if (reason) {
      this.game.ui?.showInfantryTrenchHint?.(reason);
      return false;
    }

    const digger = this._nearestDigger(px, pz, team);
    if (!digger) return false;

    const y = this.game.mapDef ? sampleTerrainHeight(px, pz, this.game.mapDef) : 0;
    const site = {
      id: nextTrenchId++,
      x: px,
      z: pz,
      y,
      team,
      diggerId: digger.id,
      rotationY: rotationY ?? this._facingYaw(team, px, pz),
      progress: 0,
      marker: null,
    };
    this.sites.push(site);
    digger._trenchDigSite = site.id;
    digger.clearAttackOrder?.();
    digger.moveTo(site.x, site.z, this.game.mapDef, true);
    site.moveOrderIssued = true;
    this._attachSiteMarker(site);
    this.pending = false;
    this.game.ui?.updateInfantryTrench?.(this.game);
    this.game._syncPlacementCapture?.();
    this.game._syncBattleCursor?.();
    return true;
  }

  tryAiPlace(x, z, team, rotationY = null, diggerPredicate = null) {
    for (const pos of this._aiPlacementCandidates(x, z)) {
      const reason = this.getPlacementRejectReason(pos.x, pos.z, team, {
        selectedOnly: false,
        diggerPredicate,
      });
      if (reason) continue;

      const digger = this._nearestDigger(pos.x, pos.z, team, false, diggerPredicate);
      if (!digger) continue;

      const y = this.game.mapDef
        ? sampleTerrainHeight(pos.x, pos.z, this.game.mapDef)
        : 0;
      const site = {
        id: nextTrenchId++,
        x: pos.x,
        z: pos.z,
        y,
        team,
        diggerId: digger.id,
        rotationY: rotationY ?? this._facingYaw(team, pos.x, pos.z),
        progress: 0,
        marker: null,
      };
      this.sites.push(site);
      digger._trenchDigSite = site.id;
      digger.clearAttackOrder?.();
      digger.moveTo?.(site.x, site.z, this.game.mapDef, true);
      site.moveOrderIssued = true;
      this._attachSiteMarker(site);
      return true;
    }
    return false;
  }

  /** Assign one specific unit a nearby trench without entering placement mode. */
  tryOrderUnitDigIn(unit, enemyFocus = null) {
    if (!unit || unit.dead) return false;
    const team = unit.team;
    const isOrderedUnit = (candidate) => candidate === unit;

    for (const candidate of this._aiPlacementCandidates(unit.position.x, unit.position.z)) {
      let x = candidate.x;
      let z = candidate.z;
      if (isTdHqDefenseStyle(this.game.towerDefense) && team === 'player') {
        const clamped = clampToPlayerSideOfFrontline(x, z, this.game);
        x = clamped.x;
        z = clamped.z;
      }

      const reason = this.getPlacementRejectReason(x, z, team, {
        selectedOnly: false,
        diggerPredicate: isOrderedUnit,
      });
      if (reason) continue;

      const rotationY = enemyFocus
        ? Math.atan2(enemyFocus.x - x, enemyFocus.z - z)
        : this._facingYaw(team, x, z);
      const y = this.game.mapDef ? sampleTerrainHeight(x, z, this.game.mapDef) : 0;
      const site = {
        id: nextTrenchId++,
        x,
        z,
        y,
        team,
        diggerId: unit.id,
        rotationY,
        progress: 0,
        marker: null,
        _generalOrderTeam: team,
      };
      this.sites.push(site);
      unit._trenchDigSite = site.id;
      unit.clearAttackOrder?.();
      unit.moveTo?.(site.x, site.z, this.game.mapDef, true);
      site.moveOrderIssued = true;
      this._attachSiteMarker(site);
      return true;
    }
    return false;
  }

  /** Order every currently free trench-capable unit on a team to dig in. */
  orderTeamDigIn(team, units, enemyFocus = null) {
    let assigned = 0;
    for (const unit of units ?? []) {
      if (unit?.team !== team || !canDigTrenchType(unit.def?.type)) continue;
      if (this.tryOrderUnitDigIn(unit, enemyFocus)) assigned++;
    }
    if (assigned > 0) {
      this.game.ui?.updateInfantryTrench?.(this.game);
    }
    return assigned;
  }

  /** Cancel only unfinished trenches created by the active Dig In order. */
  cancelGeneralOrderDigIn(team) {
    const cancelledIds = new Set();
    for (const site of this.sites) {
      if (site._generalOrderTeam !== team) continue;
      const digger = this.game.units.find((unit) => unit.id === site.diggerId);
      if (digger) digger._diggingTrench = false;
      this._cancelSite(site);
      cancelledIds.add(site.id);
    }
    if (!cancelledIds.size) return 0;
    this.sites = this.sites.filter((site) => !cancelledIds.has(site.id));
    this.game.ui?.updateInfantryTrench?.(this.game);
    return cancelledIds.size;
  }

  _attachSiteMarker(site) {
    const visual = createFieldConstructionVisual({
      kind: 'trench',
      team: site.team,
      label: 'Trench',
      verb: 'Digging',
    });
    visual.position.set(site.x, site.y, site.z);
    visual.rotation.y = site.rotationY ?? this._facingYaw(site.team, site.x, site.z);
    this.game.scene.add(visual);
    site.marker = visual;
    updateFieldConstructionVisual(visual, site.progress ?? 0, 0);
  }

  _completeSite(site) {
    const digger = this.game.units.find((u) => u.id === site.diggerId);
    if (digger) digger._trenchDigSite = null;

    this._disposeSiteMarker(site);

    const factionId =
      site.team === 'player' ? this.game.playerFaction?.id : this.game.enemyFaction?.id;
    const mesh = createTrenchGroup({
      factionId,
      seed: site.x * 0.19 + site.z * 0.31,
    });
    const rotationY = site.rotationY ?? this._facingYaw(site.team, site.x, site.z);
    alignTrenchGroupToTerrain(
      mesh,
      site.x,
      site.z,
      rotationY,
      this.game.mapDef,
      this.game._terrainMesh
    );
    deformTerrainForTrench(
      this.game._terrainMesh,
      site.x,
      site.z,
      rotationY,
      mesh.userData.trenchLength,
      mesh.userData.trenchWidth,
      TRENCH_PIT_DEPTH
    );
    this.game.scene.add(mesh);

    const trench = {
      id: site.id,
      team: site.team,
      x: site.x,
      z: site.z,
      y: mesh.position.y,
      destroyed: false,
      garrison: [],
      mesh,
      rotationY,
      _aiDefensiveTrench: !!site._aiDefensiveTrench,
      _aiTrenchMode: site._aiTrenchMode ?? null,
    };
    this.trenches.push(trench);
    this.game.coverSystem?.addZone(site.x, site.z, 'trench', TRENCH_COVER_RADIUS);

    // Digger drops into the finished trench
    if (digger && !digger.dead) {
      tryEnterTrench(digger, trench, this);
    }
    this.game.coverSystem?.updateUnits?.(this.game._aliveUnits ?? this.game.units);
  }

  _facingYaw(team, x, z) {
    const foe = team === 'player' ? this.game.mapDef?.enemyBase : this.game.mapDef?.playerBase;
    if (!foe) return team === 'player' ? 0 : Math.PI;
    return Math.atan2(foe.x - x, foe.z - z);
  }

  _cancelSite(site) {
    const digger = this.game.units.find((u) => u.id === site.diggerId);
    if (digger) digger._trenchDigSite = null;
    this._disposeSiteMarker(site);
  }

  cancelForUnit(digger) {
    const site = this.sites.find((s) => s.diggerId === digger?.id);
    if (!site) return false;
    digger._diggingTrench = false;
    this._cancelSite(site);
    this.sites = this.sites.filter((s) => s.id !== site.id);
    return true;
  }

  _releaseAllFromTrench(trench) {
    if (!trench?.garrison?.length) return;
    const ids = [...trench.garrison];
    for (const id of ids) {
      const unit = this.game.units.find((u) => u.id === id);
      if (unit) releaseFromTrench(unit, this);
    }
  }

  getTrenchById(id) {
    return this.trenches.find((t) => t.id === id && !t.destroyed) ?? null;
  }

  releaseUnit(unit) {
    if (!unit?._trenchId) return false;
    releaseFromTrench(unit, this);
    return true;
  }

  pickTrenchAt(x, z, team, maxDist = TRENCH_ENTER_RANGE) {
    let best = null;
    let bestD = maxDist;
    for (const t of this.trenches) {
      // An empty enemy position can be occupied and captured. A live opposing
      // garrison keeps the trench contested until it has been cleared.
      if (t.destroyed || (t.team !== team && (t.garrison?.length ?? 0) > 0)) continue;
      const d = Math.hypot(x - t.x, z - t.z);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }

  update(dt, units = null) {
    this._updateCollapsingTrenches(dt);

    // Dig sites
    if (this.sites.length) {
      const finished = [];
      for (const site of this.sites) {
        const digger = this.game.units.find((u) => u.id === site.diggerId);
        if (!digger || digger.dead || digger.surrendered || digger._captureExit) {
          this._cancelSite(site);
          finished.push(site.id);
          continue;
        }

        const dist = Math.hypot(digger.position.x - site.x, digger.position.z - site.z);
        if (dist > TRENCH_DIG_RANGE) {
          if (!site.moveOrderIssued || !digger.moveTarget) {
            digger.moveTo(site.x, site.z, this.game.mapDef, true);
            site.moveOrderIssued = true;
          }
          if (site.marker) updateFieldConstructionVisual(site.marker, site.progress ?? 0, dt);
        } else {
          site.moveOrderIssued = false;
          digger.moveTarget = null;
          digger._movePath = null;
          digger.clearAttackOrder?.();
          // Digging pose flag for animation
          digger._diggingTrench = true;
          site.progress += dt / TRENCH_DIG_TIME;
          if (site.marker) updateFieldConstructionVisual(site.marker, site.progress, dt);
          if (site.progress >= 1) {
            digger._diggingTrench = false;
            this._completeSite(site);
            finished.push(site.id);
          }
        }
      }
      if (finished.length) {
        this.sites = this.sites.filter((s) => !finished.includes(s.id));
      }
    }

    // Occupation: enter / leave
    updateTrenchOccupation(units ?? this.game._aliveUnits ?? this.game.units, this);
  }

  _updateCollapsingTrenches(dt) {
    const delta = Math.max(0, Number(dt) || 0);
    if (!delta) return;

    for (const trench of this.trenches) {
      const collapse = trench._collapseAnimation;
      const mesh = trench.mesh;
      if (!collapse || !mesh) continue;

      collapse.elapsed = Math.min(collapse.duration, collapse.elapsed + delta);
      const progress = collapse.duration > 0
        ? collapse.elapsed / collapse.duration
        : 1;
      // A tank's weight drops the earthworks quickly, then lets the loose soil
      // settle over the remaining fraction of a second instead of snapping to
      // the final flattened scar.
      const eased = 1 - Math.pow(1 - progress, 3);
      mesh.scale.y = THREE.MathUtils.lerp(
        collapse.startScaleY,
        collapse.finalScaleY,
        eased
      );
      mesh.position.y = THREE.MathUtils.lerp(
        collapse.startPositionY,
        collapse.finalPositionY,
        eased
      );
      mesh.rotation.x = THREE.MathUtils.lerp(
        collapse.startRotationX,
        collapse.finalRotationX,
        eased
      );
      mesh.rotation.z = THREE.MathUtils.lerp(
        collapse.startRotationZ,
        collapse.finalRotationZ,
        eased
      );

      if (progress >= 1) {
        trench._collapseAnimation = null;
      }
    }
  }

  _addOverrunDamageVisual(trench, options = {}) {
    const mesh = trench?.mesh;
    if (!mesh || mesh.userData.trenchOverrunDamage) return;
    mesh.userData.trenchOverrunDamage = true;

    const damage = new THREE.Group();
    damage.name = 'trenchOverrunDamage';
    const dirX = options.directionX ?? 0;
    const dirZ = options.directionZ ?? 0;
    const worldYaw = Math.hypot(dirX, dirZ) > 0.01
      ? Math.atan2(dirX, dirZ)
      : trench.rotationY ?? mesh.userData.trenchYaw ?? 0;
    const localYaw = worldYaw - (mesh.userData.trenchYaw ?? trench.rotationY ?? 0);
    const perpendicularX = Math.cos(localYaw);
    const perpendicularZ = -Math.sin(localYaw);

    const trackMaterial = new THREE.MeshBasicMaterial({
      color: 0x241810,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    for (const side of [-1, 1]) {
      const track = new THREE.Mesh(
        // Subdivide the scar so it can follow the local terrain instead of
        // becoming a single floating rectangle across a sloped trench.
        new THREE.PlaneGeometry(0.42, 4.9, 2, 12),
        trackMaterial
      );
      track.name = 'trenchTrackScar';
      track.rotation.x = -Math.PI / 2;
      track.rotation.y = localYaw;
      track.position.set(
        perpendicularX * side * 0.68,
        0.62,
        perpendicularZ * side * 0.68
      );
      track.renderOrder = 2;
      damage.add(track);
    }

    const brokenWood = new THREE.MeshStandardMaterial({
      color: 0x24170f,
      roughness: 1,
    });
    for (let i = 0; i < 5; i++) {
      const splinter = new THREE.Mesh(
        new THREE.BoxGeometry(0.5 + (i % 2) * 0.18, 0.055, 0.07),
        brokenWood
      );
      const along = (i - 2) * 0.72;
      splinter.name = 'trenchBrokenRevetment';
      splinter.position.set(
        Math.sin(localYaw) * along + perpendicularX * ((i % 2 ? 1 : -1) * 0.32),
        0.56 + (i % 3) * 0.025,
        Math.cos(localYaw) * along + perpendicularZ * ((i % 2 ? 1 : -1) * 0.32)
      );
      splinter.rotation.set(
        (i % 2 ? 1 : -1) * 0.12,
        localYaw + (i - 2) * 0.21,
        (i % 3 - 1) * 0.18
      );
      splinter.castShadow = true;
      damage.add(splinter);
    }

    if (options.bloodied) {
      const bloodMaterial = new THREE.MeshBasicMaterial({
        color: 0x4b1010,
        transparent: true,
        opacity: 0.52,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      for (let i = 0; i < 2; i++) {
        const stain = new THREE.Mesh(
          new THREE.CircleGeometry(0.28 + i * 0.09, 10),
          bloodMaterial
        );
        stain.name = 'trenchBloodStain';
        stain.rotation.x = -Math.PI / 2;
        stain.position.set(
          (i ? 0.46 : -0.32) + perpendicularX * 0.18,
          0.635 + i * 0.003,
          (i ? -0.18 : 0.38) + perpendicularZ * 0.18
        );
        stain.scale.set(1.8, 0.72, 1);
        stain.renderOrder = 3;
        damage.add(stain);
      }
    }

    mesh.add(damage);
    this._conformOverrunDamageToTerrain(trench, damage);
  }

  _conformOverrunDamageToTerrain(trench, damage) {
    const mesh = trench?.mesh;
    const mapDef = this.game.mapDef;
    if (!mesh || !damage || !mapDef) return;

    const terrainUp = new THREE.Vector3(0, 1, 0).applyQuaternion(mesh.quaternion);
    const parentScaleY = Math.max(0.001, Math.abs(mesh.scale.y || 1));
    const sample = this.game._terrainMesh
      ? (x, z) => sampleTerrainMeshHeight(this.game._terrainMesh, x, z, mapDef)
      : (x, z) => sampleTerrainHeight(x, z, mapDef);

    for (const child of damage.children) {
      if (!child.isMesh || !child.geometry?.attributes?.position) continue;

      // Bake each scar/fragment's local transform, then let every vertex find
      // the terrain beneath its own world X/Z. Track marks retain their
      // existing height above the trench centre while gaining the local slope.
      child.updateMatrix();
      child.geometry.applyMatrix4(child.matrix);
      child.position.set(0, 0, 0);
      child.rotation.set(0, 0, 0);
      child.scale.set(1, 1, 1);

      const positions = child.geometry.attributes.position;
      const worldBase = new THREE.Vector3();
      const localVertex = new THREE.Vector3();
      for (let i = 0; i < positions.count; i++) {
        localVertex.fromBufferAttribute(positions, i);
        worldBase
          .set(localVertex.x, 0, localVertex.z)
          .applyQuaternion(mesh.quaternion)
          .add(mesh.position);
        // TerrainDamage lowers the rendered ground beneath the excavation.
        // Raise that sample back to the local earthwork surface before
        // conforming the scar; otherwise the fix for slope-floating marks
        // would place them down on the old pit floor.
        const groundY =
          sample(worldBase.x, worldBase.z) +
          trenchSurfaceRecovery(trench, worldBase.x, worldBase.z);
        localVertex.y +=
          (groundY + 0.025 - worldBase.y) / (terrainUp.y * parentScaleY);
        positions.setXYZ(i, localVertex.x, localVertex.y, localVertex.z);
      }
      positions.needsUpdate = true;
      child.geometry.computeVertexNormals();
      child.geometry.computeBoundingBox();
      child.geometry.computeBoundingSphere();
    }
  }

  _scrambleFromCollapsedTrench(unit, trench, options = {}, survivorIndex = 0) {
    if (!unit || unit.dead) return;
    const dirX = options.directionX ?? 0;
    const dirZ = options.directionZ ?? 0;
    const length = Math.hypot(dirX, dirZ);
    const forwardX = length > 0.01 ? dirX / length : Math.sin(trench.rotationY ?? 0);
    const forwardZ = length > 0.01 ? dirZ / length : Math.cos(trench.rotationY ?? 0);
    const perpendicularX = -forwardZ;
    const perpendicularZ = forwardX;
    const relativeX = unit.position.x - trench.x;
    const relativeZ = unit.position.z - trench.z;
    const sideDot = relativeX * perpendicularX + relativeZ * perpendicularZ;
    const side = Math.abs(sideDot) > 0.12
      ? Math.sign(sideDot)
      : survivorIndex % 2 === 0 ? 1 : -1;
    const stagger = (survivorIndex % 3 - 1) * 0.55;
    const destinationX =
      trench.x +
      perpendicularX * side * TRENCH_ESCAPE_DISTANCE -
      forwardX * 1.2 +
      forwardX * stagger;
    const destinationZ =
      trench.z +
      perpendicularZ * side * TRENCH_ESCAPE_DISTANCE -
      forwardZ * 1.2 +
      forwardZ * stagger;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    unit._trackCrushEscapeUntil = now + TRENCH_ESCAPE_IMMUNITY_MS;
    unit.moveTo(destinationX, destinationZ, this.game.mapDef, false, this.game.scenery);
  }

  restoreDestroyedTrenchVisual(trench, options = {}) {
    if (!trench?.mesh) return;
    trench.destroyed = true;
    trench.garrison = [];
    const mesh = trench.mesh;
    const dirX = options.directionX ?? 0;
    const dirZ = options.directionZ ?? 0;
    mesh.scale.y = options.scaleY ?? TRENCH_COLLAPSE_FINAL_SCALE;
    mesh.position.y += options.positionYOffset ?? TRENCH_COLLAPSE_FINAL_Y_OFFSET;
    const directionLength = Math.hypot(dirX, dirZ);
    const normalizedX = directionLength > 0.01 ? dirX / directionLength : 0;
    const normalizedZ = directionLength > 0.01 ? dirZ / directionLength : 0;
    mesh.rotation.x += options.rotationXOffset ?? normalizedZ * 0.025;
    mesh.rotation.z += options.rotationZOffset ?? -normalizedX * 0.025;
    this._addOverrunDamageVisual(trench, {
      directionX: dirX,
      directionZ: dirZ,
      bloodied: options.bloodied !== false,
    });
    this._darkenDestroyedTrench(mesh);
  }

  _darkenDestroyedTrench(mesh) {
    if (!mesh || mesh.userData.trenchDamageDarkened) return;
    mesh.userData.trenchDamageDarkened = true;
    const darkened = new Set();
    mesh.traverse((child) => {
      if (
        !child.isMesh ||
        !child.material ||
        child.parent?.name === 'trenchOverrunDamage'
      ) {
        return;
      }
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of mats) {
        if (!material?.color || darkened.has(material)) continue;
        material.color.multiplyScalar(0.86);
        darkened.add(material);
      }
    });
  }

  getDiggerStatus(unit) {
    if (!unit?._trenchDigSite) return null;
    const site = this.sites.find((s) => s.id === unit._trenchDigSite);
    if (!site) return null;
    return {
      progress: Math.min(1, site.progress),
      label: 'Digging trench',
    };
  }

  /**
   * Tracked armour rolling over a finished trench ruins the position, inflicts
   * casualties, and gives some occupants a chance to scramble clear.
   */
  crushAt(x, z, radius = 2.4, options = {}) {
    let crushed = 0;
    for (const trench of this.trenches) {
      if (trench.destroyed) continue;
      // Friendly fieldworks are protected by tank pathing. Keep this guard as
      // a runtime backstop for stale AI paths, direct movement orders, and a
      // tank that was already overlapping a trench when a save was restored.
      if (options.crusherTeam && trench.team === options.crusherTeam) continue;
      const hitRadius = radius + Math.max(1.6, (trench.mesh?.userData?.trenchLength ?? 4.2) * 0.28);
      if (Math.hypot(trench.x - x, trench.z - z) > hitRadius) continue;
      this.destroyTrench(trench, {
        crushed: true,
        impactFrom: options.impactFrom ?? { x, z },
        directionX: options.directionX ?? 0,
        directionZ: options.directionZ ?? 0,
        crusherTeam: options.crusherTeam ?? null,
        crusherType: options.crusherType ?? 'tank',
        crusherId: options.crusherId ?? null,
      });
      crushed++;
    }
    return crushed;
  }

  /** Collapse a trench: inflict casualties, remove cover, and leave damaged earthworks. */
  destroyTrench(trench, options = {}) {
    if (!trench || trench.destroyed) return;
    trench.destroyed = true;

    const impactFrom = options.impactFrom ?? { x: trench.x, z: trench.z };
    const garrisonIds = [...(trench.garrison ?? [])];
    const survivors = [];
    let fatalities = 0;
    for (let i = 0; i < garrisonIds.length; i++) {
      const id = garrisonIds[i];
      const unit = this.game.units.find((u) => u.id === id);
      if (!unit || unit.dead) continue;
      const dirX = options.directionX ?? 0;
      const dirZ = options.directionZ ?? 0;
      if (Math.hypot(dirX, dirZ) > 0.01) {
        unit._crushTrackYaw = Math.atan2(dirX, dirZ);
      }

      const friendlyArmor = options.crusherTeam && unit.team === options.crusherTeam;
      const escapes =
        unit.hp > 1 &&
        (friendlyArmor || Math.random() < trenchOverrunSurvivalChance(options.crusherType));
      if (escapes) {
        const damageFraction = friendlyArmor
          ? 0.12 + Math.random() * 0.18
          : 0.38 + Math.random() * 0.24;
        const damage = Math.min(unit.hp - 1, Math.max(1, unit.hp * damageFraction));
        unit.takeDamage(damage, {
          cause: 'crush',
          crushed: true,
          impactFrom,
        });
        if (!unit.dead) survivors.push({ unit, index: i });
      } else {
        unit.takeDamage(unit.hp + 80, {
          cause: 'crush',
          crushed: true,
          impactFrom,
        });
        if (unit.dead) fatalities++;
      }
    }
    this._releaseAllFromTrench(trench);
    trench.garrison = [];
    for (const survivor of survivors) {
      this._scrambleFromCollapsedTrench(
        survivor.unit,
        trench,
        options,
        survivor.index
      );
    }

    if (this.game.coverSystem) {
      this.game.coverSystem.removeZoneAt(trench.x, trench.z, TRENCH_COVER_RADIUS + 1);
    }

    const mesh = trench.mesh;
    if (mesh) {
      const dirX = options.directionX ?? 0;
      const dirZ = options.directionZ ?? 0;
      const startScaleY = mesh.scale.y;
      const startPositionY = mesh.position.y;
      const startRotationX = mesh.rotation.x;
      const startRotationZ = mesh.rotation.z;
      const directionLength = Math.hypot(dirX, dirZ);
      const normalizedX = directionLength > 0.01 ? dirX / directionLength : 0;
      const normalizedZ = directionLength > 0.01 ? dirZ / directionLength : 0;
      // Keep the trench readable: the berms settle and break, but the dug line
      // remains visible under the tread scars, timber, casualties, and blood.
      trench._collapseAnimation = {
        elapsed: 0,
        duration: Math.max(
          0,
          Number(options.collapseDuration) || TRENCH_COLLAPSE_DURATION
        ),
        startScaleY,
        finalScaleY: startScaleY * TRENCH_COLLAPSE_FINAL_SCALE,
        startPositionY,
        finalPositionY: startPositionY + TRENCH_COLLAPSE_FINAL_Y_OFFSET,
        startRotationX,
        finalRotationX: startRotationX + normalizedZ * 0.025,
        startRotationZ,
        finalRotationZ: startRotationZ - normalizedX * 0.025,
      };
      trench._overrunDamage = {
        directionX: dirX,
        directionZ: dirZ,
        bloodied: fatalities > 0,
        scaleY: TRENCH_COLLAPSE_FINAL_SCALE,
        positionYOffset: TRENCH_COLLAPSE_FINAL_Y_OFFSET,
        rotationXOffset: normalizedZ * 0.025,
        rotationZOffset: -normalizedX * 0.025,
      };
      this._addOverrunDamageVisual(trench, {
        directionX: dirX,
        directionZ: dirZ,
        bloodied: fatalities > 0,
      });
      this._darkenDestroyedTrench(mesh);
    }
  }
}

export function releaseFromTrench(unit, manager) {
  if (!unit?._trenchId) return;
  const trench = manager?.getTrenchById?.(unit._trenchId);
  if (trench?.garrison) {
    trench.garrison = trench.garrison.filter((id) => id !== unit.id);
  }
  unit._trenchId = null;
  unit._trenchSlot = null;
  unit._diggingTrench = false;
  applyTrenchVisual(unit, false);
  if (trench) positionTrenchOccupants(trench, manager);
}

function positionTrenchOccupants(trench, manager) {
  if (!trench?.garrison?.length || !manager?.game?.units) return;
  const count = trench.garrison.length;
  const yaw =
    trench.rotationY ?? trench.mesh?.userData?.trenchYaw ?? trench.mesh?.rotation?.y ?? 0;
  const rightX = Math.cos(yaw);
  const rightZ = -Math.sin(yaw);
  for (let slot = 0; slot < count; slot++) {
    const unit = manager.game.units.find((candidate) => candidate.id === trench.garrison[slot]);
    if (!unit || unit.dead) continue;
    const spread = (slot - (count - 1) * 0.5) * 0.85;
    unit._trenchSlot = slot;
    unit.position.x = trench.x + rightX * spread;
    unit.position.z = trench.z + rightZ * spread;
    applyTrenchVisual(unit, true);
  }
}

export function tryEnterTrench(unit, trench, manager) {
  if (!unit || unit.dead || unit.surrendered || unit._captureExit) return false;
  if (isUnitMounted(unit) || isUnitGarrisoned(unit)) return false;
  if (!OCCUPY_TYPES.has(unit.def?.type)) return false;
  if (!trench || trench.destroyed) return false;
  if (trench.team !== unit.team && (trench.garrison?.length ?? 0) > 0) return false;
  if ((trench.garrison?.length ?? 0) >= TRENCH_CAPACITY) return false;
  if (Math.hypot(unit.position.x - trench.x, unit.position.z - trench.z) > TRENCH_ENTER_RANGE + 0.5) {
    return false;
  }

  if (unit._trenchId && unit._trenchId !== trench.id) {
    releaseFromTrench(unit, manager);
  }

  trench.garrison = trench.garrison ?? [];
  // The first unit into an abandoned opposing trench captures the fieldwork.
  // Keep the trench intact and reusable; only a live garrison blocks the
  // opposing side from entering it.
  if (trench.team !== unit.team && trench.garrison.length === 0) {
    trench.team = unit.team;
  }
  if (!trench.garrison.includes(unit.id)) trench.garrison.push(unit.id);
  unit._trenchId = trench.id;
  unit._trenchSlot = trench.garrison.indexOf(unit.id);
  unit.moveTarget = null;
  unit._movePath = null;
  unit._userMoveOrder = false;
  unit.retreating = false;
  positionTrenchOccupants(trench, manager);
  return true;
}

export function updateTrenchOccupation(units, manager) {
  if (!manager) return;

  for (const unit of units) {
    if (unit.dead) {
      if (unit._trenchId) releaseFromTrench(unit, manager);
      unit._diggingTrench = false;
      continue;
    }

    // Full Retreat owns the rally area until its command window ends. Without
    // this hold, a unit that reaches its slot beside a trench is auto-entered,
    // then the still-active retreat order pulls it out on the next frame.
    if (unit._fullRetreatRallyHold && !unit.retreating && !unit._trenchId) {
      continue;
    }

    if (unit._trenchId) {
      const trench = manager.getTrenchById(unit._trenchId);
      if (!trench || trench.destroyed) {
        releaseFromTrench(unit, manager);
        continue;
      }
      // Leave when ordered to move or retreat
      if (unit.moveTarget || unit.retreating || unit._captureExit || unit.surrendered) {
        releaseFromTrench(unit, manager);
        continue;
      }
      applyTrenchVisual(unit, true);
      continue;
    }

    if (
      unit.retreating ||
      unit.surrendered ||
      isUnitMounted(unit) ||
      isUnitGarrisoned(unit) ||
      unit._trenchDigSite ||
      unit._diggingTrench
    ) {
      continue;
    }

    // Enter when moving onto a trench (or standing next to one idle)
    let trench = null;
    if (unit.moveTarget) {
      trench = manager.pickTrenchAt(unit.moveTarget.x, unit.moveTarget.z, unit.team, 5.5);
    }
    if (!trench && !unit.moveTarget && !unit.attackOrder) {
      trench = manager.pickTrenchAt(unit.position.x, unit.position.z, unit.team, TRENCH_ENTER_RANGE);
    }
    if (!trench) continue;

    const dist = Math.hypot(unit.position.x - trench.x, unit.position.z - trench.z);
    if (dist <= TRENCH_ENTER_RANGE) {
      tryEnterTrench(unit, trench, manager);
    }
  }
}

/** Seat squad on the excavated pit floor + crouch pose flag. */
export function applyTrenchVisual(unit, inTrench) {
  if (!unit?.mesh) return;
  const targetY = inTrench ? TRENCH_OCCUPANT_SURFACE_OFFSET : 0;
  unit.mesh.userData.trenchSink = targetY;
  unit._inTrenchVisual = !!inTrench;

  // Ground contact must be based on this slot, not world zero or only the
  // trench centre. This also fixes occupants restored from older saves.
  const pose = getTrenchOccupantTerrainPose(unit);
  unit.mesh.userData._baseMeshY = pose.y;
  unit.mesh.position.y = pose.y + targetY;
  unit.mesh.rotation.x = pose.pitch;
  unit.mesh.rotation.z = pose.roll;

  unit.mesh.traverse((child) => {
    if (child.name !== 'squadMember') return;
    if (!child.userData.walkPose) child.userData.walkPose = {};
    child.userData.walkPose.crouching = !!inTrench;
    if (inTrench) {
      // Fold legs / hunker
      child.scale.y = 0.82;
      child.position.y = (child.userData.walkRest?.group?.y ?? child.position.y) * 0.55;
    } else {
      child.scale.y = 1;
      if (child.userData.walkRest?.group) {
        child.position.y = child.userData.walkRest.group.y;
      }
    }
  });
}

function getTrenchOccupantTerrainPose(unit) {
  const mapDef = unit?._mapDef;
  const x = unit?.position?.x ?? 0;
  const z = unit?.position?.z ?? 0;
  const yaw = unit?.mesh?.rotation?.y ?? 0;
  const y = mapDef
    ? sampleTerrainMeshHeight(unit?._terrainMesh, x, z, mapDef)
    : unit?.position?.y ?? 0;
  if (!mapDef) return { y, pitch: 0, roll: 0 };

  const radius = 0.82;
  const forwardX = Math.sin(yaw);
  const forwardZ = Math.cos(yaw);
  const rightX = Math.cos(yaw);
  const rightZ = -Math.sin(yaw);
  const front = sampleTerrainHeight(x + forwardX * radius, z + forwardZ * radius, mapDef);
  const back = sampleTerrainHeight(x - forwardX * radius, z - forwardZ * radius, mapDef);
  const right = sampleTerrainHeight(x + rightX * radius, z + rightZ * radius, mapDef);
  const left = sampleTerrainHeight(x - rightX * radius, z - rightZ * radius, mapDef);
  return {
    y,
    pitch: THREE.MathUtils.clamp(-Math.atan((front - back) / (radius * 2)), -0.46, 0.46),
    roll: THREE.MathUtils.clamp(Math.atan((right - left) / (radius * 2)), -0.46, 0.46),
  };
}

/** Soft blend trench sink each frame (call from combat/visual update). */
export function updateTrenchVisuals(unit, dt) {
  if (!unit?.mesh) return;
  if (unit._diggingTrench && !unit._trenchId) {
    // Slight crouch while digging
    unit.mesh.traverse((child) => {
      if (child.name !== 'squadMember') return;
      if (!child.userData.walkPose) child.userData.walkPose = {};
      child.userData.walkPose.crouching = true;
    });
  }
  const sink = unit.mesh.userData.trenchSink ?? 0;
  const pose = getTrenchOccupantTerrainPose(unit);
  const base = pose.y;
  unit.mesh.userData._baseMeshY = base;
  if (unit._trenchId || unit._diggingTrench) {
    unit.mesh.rotation.x = THREE.MathUtils.lerp(
      unit.mesh.rotation.x,
      pose.pitch,
      Math.min(1, dt * 8)
    );
    unit.mesh.rotation.z = THREE.MathUtils.lerp(
      unit.mesh.rotation.z,
      pose.roll,
      Math.min(1, dt * 8)
    );
  }
  const cur = unit.mesh.position.y - base;
  if (Math.abs(cur - sink) > 0.01) {
    unit.mesh.position.y = base + THREE.MathUtils.lerp(cur, sink, Math.min(1, dt * 8));
  }
}
