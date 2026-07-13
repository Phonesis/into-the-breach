import * as THREE from 'three';
import { sampleTerrainHeight } from '../world/Terrain.js';
import { createTrenchGroup } from '../world/TrenchMesh.js';
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
/** Damage taken while dug into a trench (~58% reduction). */
export const TRENCH_COVER_MULT = 0.42;
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
    if (this.pending) {
      this.pending = false;
      return false;
    }
    this.pending = true;
    return true;
  }

  cancel() {
    this.pending = false;
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
    let bestD = TRENCH_PLACE_RANGE;
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

    if (this._teamTrenchCount(team) >= TRENCH_MAX_PER_TEAM) {
      return `Maximum ${TRENCH_MAX_PER_TEAM} trenches per side.`;
    }

    const spacing = this._spacingConflict(px, pz);
    if (spacing) return spacing;

    if (!this._nearestDigger(px, pz, team, options.selectedOnly !== false)) {
      return 'Select free infantry / MG / sniper within ~18 m of the dig site.';
    }

    return null;
  }

  tryPlace(x, z, team) {
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
      progress: 0,
      marker: null,
    };
    this.sites.push(site);
    digger._trenchDigSite = site.id;
    digger.clearAttackOrder?.();
    this._attachSiteMarker(site);
    this.pending = false;
    this.game.ui?.updateInfantryTrench?.(this.game);
    this.game._syncPlacementCapture?.();
    this.game._syncBattleCursor?.();
    return true;
  }

  tryAiPlace(x, z, team) {
    const reason = this.getPlacementRejectReason(x, z, team, { selectedOnly: false });
    if (reason) return false;

    const digger = this._nearestDigger(x, z, team, false);
    if (!digger) return false;

    const y = this.game.mapDef ? sampleTerrainHeight(x, z, this.game.mapDef) : 0;
    const site = {
      id: nextTrenchId++,
      x,
      z,
      y,
      team,
      diggerId: digger.id,
      progress: 0,
      marker: null,
    };
    this.sites.push(site);
    digger._trenchDigSite = site.id;
    digger.clearAttackOrder?.();
    this._attachSiteMarker(site);
    return true;
  }

  _attachSiteMarker(site) {
    const visual = createFieldConstructionVisual({
      kind: 'trench',
      team: site.team,
      label: 'Trench',
      verb: 'Digging',
    });
    visual.position.set(site.x, site.y, site.z);
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
    mesh.position.set(site.x, site.y, site.z);
    // Face toward enemy for berm orientation
    const foe = site.team === 'player' ? this.game.mapDef?.enemyBase : this.game.mapDef?.playerBase;
    if (foe) {
      mesh.rotation.y = Math.atan2(foe.x - site.x, foe.z - site.z);
    }
    this.game.scene.add(mesh);

    const trench = {
      id: site.id,
      team: site.team,
      x: site.x,
      z: site.z,
      y: site.y,
      destroyed: false,
      garrison: [],
      mesh,
    };
    this.trenches.push(trench);
    this.game.coverSystem?.addZone(site.x, site.z, 'trench', TRENCH_COVER_RADIUS);

    // Digger drops into the finished trench
    if (digger && !digger.dead) {
      tryEnterTrench(digger, trench, this);
    }
    this.game.coverSystem?.updateUnits?.(this.game._aliveUnits ?? this.game.units);
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
          digger.moveTo(site.x, site.z, this.game.mapDef, true);
          if (site.marker) updateFieldConstructionVisual(site.marker, site.progress ?? 0, dt);
        } else {
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

  // Slot along the trench
  const slot = unit._trenchSlot ?? 0;
  const spread = (slot - (trench.garrison.length - 1) * 0.5) * 0.85;
  unit.position.x = trench.x + Math.cos(trench.mesh?.rotation?.y ?? 0) * spread * 0.15;
  unit.position.z = trench.z + spread * 0.35;

  applyTrenchVisual(unit, true);
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

  // Immediate sink so it reads instantly
  if (unit.mesh.userData._baseMeshY == null) {
    unit.mesh.userData._baseMeshY = 0;
  }
  unit.mesh.position.y = unit.mesh.userData._baseMeshY + targetY;

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
  const base = unit.mesh.userData._baseMeshY ?? 0;
  const cur = unit.mesh.position.y - base;
  if (Math.abs(cur - sink) > 0.01) {
    unit.mesh.position.y = base + THREE.MathUtils.lerp(cur, sink, Math.min(1, dt * 8));
  }
}
