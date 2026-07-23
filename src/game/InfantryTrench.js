import * as THREE from 'three';
import { sampleTerrainHeight } from '../world/Terrain.js';
import { alignTrenchGroupToTerrain, createTrenchGroup } from '../world/TrenchMesh.js';
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

const DIG_TYPES = new Set(['infantry', 'machineGun', 'sniper']);
/** Foot troops that can occupy a finished trench (not dig). */
const OCCUPY_TYPES = new Set(['infantry', 'machineGun', 'sniper', 'medic', 'engineer']);

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

  _nearestDigger(x, z, team, selectedOnly = true) {
    const diggers = this._diggersSelected(team, selectedOnly);
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

    if (!this._nearestDigger(px, pz, team, options.selectedOnly !== false)) {
      return 'Select free infantry, an MG team, or a sniper to assign this dig site.';
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

  tryAiPlace(x, z, team) {
    for (const pos of this._aiPlacementCandidates(x, z)) {
      const reason = this.getPlacementRejectReason(pos.x, pos.z, team, {
        selectedOnly: false,
      });
      if (reason) continue;

      const digger = this._nearestDigger(pos.x, pos.z, team, false);
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
        rotationY: this._facingYaw(team, pos.x, pos.z),
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
    alignTrenchGroupToTerrain(mesh, site.x, site.z, rotationY, this.game.mapDef);
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

  pickTrenchAt(x, z, team, maxDist = TRENCH_ENTER_RANGE) {
    let best = null;
    let bestD = maxDist;
    for (const t of this.trenches) {
      if (t.destroyed || (t.team !== team && (t.garrison?.length ?? 0) > 0)) continue;
      const d = Math.hypot(x - t.x, z - t.z);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }

  update(dt) {
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
    updateTrenchOccupation(this.game._aliveUnits ?? this.game.units, this);
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
   * Tracked armour rolling over a finished trench collapses it and kills anyone
   * still dug in. Returns how many trenches were crushed.
   */
  crushAt(x, z, radius = 2.4, options = {}) {
    let crushed = 0;
    for (const trench of this.trenches) {
      if (trench.destroyed) continue;
      const hitRadius = radius + Math.max(1.6, (trench.mesh?.userData?.trenchLength ?? 4.2) * 0.28);
      if (Math.hypot(trench.x - x, trench.z - z) > hitRadius) continue;
      this.destroyTrench(trench, {
        crushed: true,
        impactFrom: options.impactFrom ?? { x, z },
        directionX: options.directionX ?? 0,
        directionZ: options.directionZ ?? 0,
      });
      crushed++;
    }
    return crushed;
  }

  /** Collapse a trench: kill enemy garrison, remove cover, leave flattened dirt. */
  destroyTrench(trench, options = {}) {
    if (!trench || trench.destroyed) return;
    trench.destroyed = true;

    const impactFrom = options.impactFrom ?? { x: trench.x, z: trench.z };
    const garrisonIds = [...(trench.garrison ?? [])];
    for (const id of garrisonIds) {
      const unit = this.game.units.find((u) => u.id === id);
      if (!unit || unit.dead) continue;
      // Friendly troops scramble out of a collapsing trench rather than dying to
      // their own armour. Enemy dig-ins under the tracks are finished.
      if (options.crusherTeam && unit.team === options.crusherTeam) continue;
      const dirX = options.directionX ?? 0;
      const dirZ = options.directionZ ?? 0;
      if (Math.hypot(dirX, dirZ) > 0.01) {
        unit._crushTrackYaw = Math.atan2(dirX, dirZ);
      }
      unit.takeDamage(unit.hp + 80, {
        cause: 'crush',
        crushed: true,
        impactFrom,
      });
    }
    this._releaseAllFromTrench(trench);

    if (this.game.coverSystem) {
      this.game.coverSystem.removeZoneAt(trench.x, trench.z, TRENCH_COVER_RADIUS + 1);
    }

    const mesh = trench.mesh;
    if (mesh) {
      // Squashed revetment left as a low mud scar rather than vanishing.
      mesh.scale.y *= 0.18;
      mesh.position.y -= 0.12;
      const dirX = options.directionX ?? 0;
      const dirZ = options.directionZ ?? 0;
      if (Math.hypot(dirX, dirZ) > 0.01) {
        mesh.rotation.x += dirZ * 0.04;
        mesh.rotation.z -= dirX * 0.04;
      }
      mesh.traverse((child) => {
        if (!child.isMesh || !child.material) return;
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of mats) {
          if (material?.color) material.color.multiplyScalar(0.72);
        }
      });
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
  const yaw = trench.rotationY ?? trench.mesh?.rotation?.y ?? 0;
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

/** Lower squad into the pit + crouch pose flag. */
export function applyTrenchVisual(unit, inTrench) {
  if (!unit?.mesh) return;
  const targetY = inTrench ? -0.42 : 0;
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
  const y = mapDef ? sampleTerrainHeight(x, z, mapDef) : unit?.position?.y ?? 0;
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
