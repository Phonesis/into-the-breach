import * as THREE from 'three';
import { sampleTerrainHeight } from '../world/Terrain.js';
import { createFieldTentMesh } from '../visual/FieldTentMesh.js';
import { isVehicleUnit } from '../units/VehicleTypes.js';
import { updateSquadCasualtyVisual } from '../units/UnitMeshes.js';
import { isTdHqDefenseStyle } from '../data/towerDefense.js';
import { clampToPlayerSideOfFrontline } from './TowerDefenseMode.js';
import {
  createFieldConstructionVisual,
  updateFieldConstructionVisual,
  disposeFieldConstructionVisual,
} from '../visual/FieldConstructionVisual.js';

export const TENT_DEPLOY_TIME = 16;
export const TENT_PLACE_RANGE = 18;
export const TENT_BUILD_RANGE = 4;
export const TENT_MIN_SPACING = 10;
export const TENT_MAX_PER_TEAM = 4;
export const TENT_HEAL_RANGE = 12;
export const TENT_HEAL_PER_SEC = 4.6;
export const TENT_HP = 90;

let nextTentId = 1;

export function setMedicTentNextId(n) {
  nextTentId = Math.max(1, Math.floor(n) || 1);
}

export function peekMedicTentNextId() {
  return nextTentId;
}

/** Foot troops and gun crews — not tanks, cars, or towed vehicles. */
export function canReceiveFieldTentHeal(unit) {
  if (!unit || unit.dead || unit.hp >= unit.maxHp) return false;
  if (!unit.def?.type) return false;
  if (isVehicleUnit(unit.def.type)) return false;
  // Include engineer / mortar / paratrooper as non-vehicle personnel
  return true;
}

export class MedicFieldHospitalManager {
  constructor(game) {
    this.game = game;
    this.pending = false;
    this.sites = [];
    this.tents = [];
  }

  reset() {
    this.pending = false;
    this._clearSiteMarkers();
    this._clearTents();
    this.sites = [];
    this.tents = [];
  }

  _clearTents() {
    for (const t of this.tents) {
      if (t.mesh?.parent) t.mesh.parent.remove(t.mesh);
      this._disposeMesh(t.mesh);
      t.mesh = null;
    }
    this.tents = [];
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
    for (const site of this.sites) this._disposeSiteMarker(site);
  }

  _disposeSiteMarker(site) {
    if (!site?.marker) return;
    if (site.marker.userData?.fieldConstruction) {
      disposeFieldConstructionVisual(site.marker);
    } else {
      site.marker.parent?.remove(site.marker);
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
    this.game.infantryTrenches?.cancel?.();
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

  _medicsSelected(team) {
    return this.game.units.filter(
      (u) =>
        u.selected &&
        u.team === team &&
        !u.dead &&
        !u.surrendered &&
        !u._captureExit &&
        u.def?.type === 'medic' &&
        !u._medicTentSite
    );
  }

  _nearestMedic(x, z, team) {
    const medics = this._medicsSelected(team);
    let best = null;
    let bestD = Number.POSITIVE_INFINITY;
    for (const u of medics) {
      const d = Math.hypot(u.position.x - x, u.position.z - z);
      if (d <= bestD) {
        bestD = d;
        best = u;
      }
    }
    return best;
  }

  _teamTentCount(team) {
    let n = this.tents.filter((t) => t.team === team && !t.destroyed).length;
    n += this.sites.filter((s) => s.team === team).length;
    return n;
  }

  _spacingConflict(x, z) {
    for (const t of this.tents) {
      if (t.destroyed) continue;
      if (Math.hypot(t.x - x, t.z - z) < TENT_MIN_SPACING) {
        return 'Too close to another field hospital tent.';
      }
    }
    for (const s of this.sites) {
      if (Math.hypot(s.x - x, s.z - z) < TENT_MIN_SPACING) {
        return 'Too close to a tent already being set up.';
      }
    }
    // Keep clear of base-building hospitals
    const bb = this.game.baseBuildings;
    if (bb?.active) {
      for (const e of bb.entries) {
        if (e.destroyed || e.typeId !== 'hospital') continue;
        if (Math.hypot(e.x - x, e.z - z) < TENT_MIN_SPACING) {
          return 'Too close to an existing hospital.';
        }
      }
    }
    return null;
  }

  getPlacementRejectReason(x, z, team) {
    if (!this.canUse()) return 'Field hospitals unavailable.';
    if (this.game._isPlayerDeployZoneActive?.()) {
      return 'Wait for battle launch before deploying a field tent.';
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

    if (this._teamTentCount(team) >= TENT_MAX_PER_TEAM) {
      return `Maximum ${TENT_MAX_PER_TEAM} field hospital tents per side.`;
    }

    const spacing = this._spacingConflict(px, pz);
    if (spacing) return spacing;

    if (!this._nearestMedic(px, pz, team)) {
      return 'Select a free medic to assign this tent site.';
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
      this.game.ui?.showMedicTentHint?.(reason);
      return false;
    }

    const medic = this._nearestMedic(px, pz, team);
    if (!medic) return false;

    const y = this.game.mapDef ? sampleTerrainHeight(px, pz, this.game.mapDef) : 0;
    const site = {
      id: nextTentId++,
      x: px,
      z: pz,
      y,
      team,
      medicId: medic.id,
      progress: 0,
      marker: null,
    };
    this.sites.push(site);
    medic._medicTentSite = site.id;
    medic.clearAttackOrder?.();
    medic.moveTo(site.x, site.z, this.game.mapDef, true);
    site.moveOrderIssued = true;
    this._attachSiteMarker(site);
    this.pending = false;
    this.game.ui?.updateMedicTent?.(this.game);
    this.game._syncPlacementCapture?.();
    this.game._syncBattleCursor?.();
    return true;
  }

  _attachSiteMarker(site) {
    const visual = createFieldConstructionVisual({
      kind: 'bunker',
      team: site.team,
      label: 'Field Tent',
      verb: 'Pitching',
    });
    // Re-tint ghost toward canvas white
    const ghost = visual.getObjectByName('ghost');
    if (ghost?.material) ghost.material.color?.setHex?.(0xe8e0d0);
    visual.position.set(site.x, site.y, site.z);
    this.game.scene.add(visual);
    site.marker = visual;
    updateFieldConstructionVisual(visual, site.progress ?? 0, 0);
  }

  _completeSite(site) {
    const medic = this.game.units.find((u) => u.id === site.medicId);
    if (medic) medic._medicTentSite = null;
    this._disposeSiteMarker(site);

    const factionId =
      site.team === 'player' ? this.game.playerFaction?.id : this.game.enemyFaction?.id;
    const mesh = createFieldTentMesh(factionId);
    mesh.position.set(site.x, site.y, site.z);
    const foe = site.team === 'player' ? this.game.mapDef?.enemyBase : this.game.mapDef?.playerBase;
    if (foe) {
      mesh.rotation.y = Math.atan2(foe.x - site.x, foe.z - site.z);
    }
    this.game.scene.add(mesh);

    this.tents.push({
      id: site.id,
      team: site.team,
      x: site.x,
      z: site.z,
      y: site.y,
      hp: TENT_HP,
      maxHp: TENT_HP,
      destroyed: false,
      mesh,
      healRange: TENT_HEAL_RANGE,
      healPerSec: TENT_HEAL_PER_SEC,
    });
  }

  _cancelSite(site) {
    const medic = this.game.units.find((u) => u.id === site.medicId);
    if (medic) medic._medicTentSite = null;
    this._disposeSiteMarker(site);
  }

  cancelForUnit(medic) {
    const site = this.sites.find((s) => s.medicId === medic?.id);
    if (!site) return false;
    this._cancelSite(site);
    this.sites = this.sites.filter((s) => s.id !== site.id);
    return true;
  }

  destroyTent(tent) {
    if (!tent || tent.destroyed) return;
    tent.destroyed = true;
    if (tent.mesh?.parent) tent.mesh.parent.remove(tent.mesh);
    this._disposeMesh(tent.mesh);
    tent.mesh = null;
  }

  /** Optional: damageable by splash (simple). */
  damageAt(x, z, radius, amount) {
    if (amount <= 0) return;
    const r2 = radius * radius;
    for (const t of this.tents) {
      if (t.destroyed) continue;
      const dx = t.x - x;
      const dz = t.z - z;
      if (dx * dx + dz * dz > r2) continue;
      t.hp -= amount;
      if (t.hp <= 0) this.destroyTent(t);
    }
  }

  update(dt) {
    // Deploy in progress
    if (this.sites.length) {
      const finished = [];
      for (const site of this.sites) {
        const medic = this.game.units.find((u) => u.id === site.medicId);
        if (!medic || medic.dead || medic.surrendered || medic._captureExit) {
          this._cancelSite(site);
          finished.push(site.id);
          continue;
        }

        const dist = Math.hypot(medic.position.x - site.x, medic.position.z - site.z);
        if (dist > TENT_BUILD_RANGE) {
          if (!site.moveOrderIssued || !medic.moveTarget) {
            medic.moveTo(site.x, site.z, this.game.mapDef, true);
            site.moveOrderIssued = true;
          }
          if (site.marker) updateFieldConstructionVisual(site.marker, site.progress ?? 0, dt);
        } else {
          site.moveOrderIssued = false;
          medic.moveTarget = null;
          medic._movePath = null;
          medic.clearAttackOrder?.();
          site.progress += dt / TENT_DEPLOY_TIME;
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

    // Heal aura
    this._updateHealing(dt);

    // Pulse heal rings
    for (const t of this.tents) {
      if (t.destroyed || !t.mesh) continue;
      const ring = t.mesh.getObjectByName('healRing');
      if (ring?.material) {
        ring.material.opacity = 0.22 + Math.sin(performance.now() * 0.003 + t.id) * 0.12;
      }
    }
  }

  _updateHealing(dt) {
    if (dt <= 0) return;
    const units = this.game._aliveUnits ?? this.game.units;
    for (const tent of this.tents) {
      if (tent.destroyed) continue;
      const range = tent.healRange ?? TENT_HEAL_RANGE;
      const rangeSq = range * range;
      const rate = tent.healPerSec ?? TENT_HEAL_PER_SEC;

      for (const ally of units) {
        if (ally.dead || ally.team !== tent.team) continue;
        if (!canReceiveFieldTentHeal(ally)) continue;

        const dx = ally.position.x - tent.x;
        const dz = ally.position.z - tent.z;
        const distSq = dx * dx + dz * dz;
        if (distSq > rangeSq) continue;

        const before = ally.hp;
        const dist = Math.sqrt(distSq);
        const proximity = 1 - (dist / range) * 0.45;
        ally.hp = Math.min(ally.maxHp, ally.hp + rate * proximity * dt);
        if (ally.hp > before) updateSquadCasualtyVisual(ally);
      }
    }
  }

  getMedicDeployStatus(medic) {
    if (!medic?._medicTentSite) return null;
    const site = this.sites.find((s) => s.id === medic._medicTentSite);
    if (!site) return null;
    return {
      label: 'Pitching field hospital',
      progress: Math.min(1, site.progress),
      pct: Math.round(Math.min(1, site.progress) * 100),
    };
  }

  isUnitNearTent(unit) {
    if (!unit || unit.dead) return false;
    for (const t of this.tents) {
      if (t.destroyed || t.team !== unit.team) continue;
      const range = t.healRange ?? TENT_HEAL_RANGE;
      if (Math.hypot(unit.position.x - t.x, unit.position.z - t.z) <= range) return true;
    }
    return false;
  }
}
