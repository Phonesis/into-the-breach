import * as THREE from 'three';
import { getUnitWeaponRange, sniperHasSpotter } from '../game/Targeting.js';

const SEGMENTS = 64;
/** Lift above unit feet so flat rings clear local terrain; depthTest off handles slopes. */
const RING_Y_OFFSET = 0.35;
const WEAPON_RING_COLOR = 0x4ade80;
/** Binoculars active — gold observation ring (radio only). */
const RADIO_BINOCULAR_RING_COLOR = 0xfbbf24;
const MIN_RANGE_RING_COLOR = 0xf59e0b;

/** Keep visual module free of game-behavior imports (avoids load/runtime breakage). */
const RADIO_SUPPORT_BASE = 72;
const RADIO_SUPPORT_BINOCULAR = 112;

function radioBinocularRange(unit) {
  const base = Number.isFinite(unit?.def?.supportRange)
    ? unit.def.supportRange
    : RADIO_SUPPORT_BASE;
  return Math.max(base, RADIO_SUPPORT_BINOCULAR);
}

function isRadioBinocularsActive(unit) {
  return unit?.def?.type === 'radioOperator' && (unit?._binocularActive ?? 0) > 0;
}

export class RangeRingManager {
  constructor(scene) {
    this.scene = scene;
    /** Primary ring: weapon range for all units (including radio rifle). */
    this.rings = new Map();
    /**
     * Secondary ring: artillery min-range, or radio binocular observation
     * (only while binocs are raised).
     */
    this.minimumRings = new Map();
    this.visible = true;
  }

  setVisible(enabled) {
    this.visible = !!enabled;
    if (!this.visible) {
      this.clear();
      return;
    }
    for (const ring of this.rings.values()) ring.visible = true;
    for (const ring of this.minimumRings.values()) ring.visible = true;
  }

  /** Primary ring = combat weapon range (radio operators use rifle range). */
  _displayRange(unit) {
    const r = getUnitWeaponRange(unit);
    return Number.isFinite(r) && r > 0 ? r : 10;
  }

  _syncRing(map, unitId, range, color, name, x, y, z, opacity = 0.38) {
    const safeRange = Number.isFinite(range) && range > 0 ? range : 10;
    let ring = map.get(unitId);
    if (!ring) {
      ring = this._createRing(safeRange, color, name, opacity);
      this.scene.add(ring);
      map.set(unitId, ring);
    } else if (
      Math.abs((ring.userData.range ?? 0) - safeRange) > 0.01 ||
      ring.userData.color !== color ||
      Math.abs((ring.userData.opacity ?? 0.38) - opacity) > 0.01
    ) {
      this._removeRing(ring);
      ring = this._createRing(safeRange, color, name, opacity);
      this.scene.add(ring);
      map.set(unitId, ring);
    }
    ring.position.set(x, y, z);
    ring.visible = true;
    return ring;
  }

  updateForUnits(units) {
    try {
      this._updateForUnitsInner(units);
    } catch (err) {
      // Never let ring visuals break the battle loop (movement, combat, etc.)
      console.warn('[RangeRings]', err);
    }
  }

  _updateForUnitsInner(units) {
    if (!this.visible) {
      this.clear();
      return;
    }
    const list = units ?? [];
    const selected = list.filter((u) => u && !u.dead && u.selected);
    const activeIds = new Set();

    for (const unit of selected) {
      if (unit.id == null || !unit.position) continue;
      activeIds.add(unit.id);

      const range = this._displayRange(unit);
      const x = unit.position.x;
      const y = (unit.position.y ?? 0) + RING_Y_OFFSET;
      const z = unit.position.z;

      // Primary: weapon range (green) for every unit type
      this._syncRing(
        this.rings,
        unit.id,
        range,
        WEAPON_RING_COLOR,
        'rangeRing',
        x,
        y,
        z,
        0.38
      );

      // Secondary: artillery min-range, OR radio binocular observation only while scanning
      let secondaryRange = 0;
      let secondaryColor = MIN_RANGE_RING_COLOR;
      let secondaryName = 'minimumRangeRing';
      let secondaryOpacity = 0.38;

      if (unit.def?.type === 'radioOperator') {
        if (isRadioBinocularsActive(unit)) {
          secondaryRange = radioBinocularRange(unit);
          secondaryColor = RADIO_BINOCULAR_RING_COLOR;
          secondaryName = 'radioBinocularRangeRing';
          secondaryOpacity = 0.52;
        }
      } else if (unit.def?.type === 'sniper' && sniperHasSpotter(unit)) {
        secondaryRange = unit.def.spotterRifle?.range ?? 0;
        secondaryColor = 0x86efac;
        secondaryName = 'spotterRifleRangeRing';
        secondaryOpacity = 0.28;
      } else {
        secondaryRange = unit.def?.minRange ?? 0;
      }

      if (secondaryRange > 0) {
        this._syncRing(
          this.minimumRings,
          unit.id,
          secondaryRange,
          secondaryColor,
          secondaryName,
          x,
          y + 0.01,
          z,
          secondaryOpacity
        );
      } else {
        const old = this.minimumRings.get(unit.id);
        if (old) {
          this._removeRing(old);
          this.minimumRings.delete(unit.id);
        }
      }
    }

    for (const [id, ring] of this.rings) {
      if (!activeIds.has(id)) {
        this._removeRing(ring);
        this.rings.delete(id);
      }
    }
    for (const [id, ring] of this.minimumRings) {
      if (!activeIds.has(id)) {
        this._removeRing(ring);
        this.minimumRings.delete(id);
      }
    }
  }

  _createRing(radius, color = WEAPON_RING_COLOR, name = 'rangeRing', opacity = 0.38) {
    const r = Number.isFinite(radius) && radius > 0 ? radius : 10;
    const geo = new THREE.RingGeometry(r * 0.98, r, SEGMENTS);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name;
    mesh.renderOrder = 20;
    mesh.userData.range = r;
    mesh.userData.color = color;
    mesh.userData.opacity = opacity;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    return mesh;
  }

  _removeRing(ring) {
    if (!ring) return;
    if (ring.parent) ring.parent.remove(ring);
    else this.scene?.remove(ring);
    ring.geometry?.dispose?.();
    ring.material?.dispose?.();
  }

  clear() {
    for (const [, ring] of this.rings) {
      this._removeRing(ring);
    }
    this.rings.clear();
    for (const [, ring] of this.minimumRings) {
      this._removeRing(ring);
    }
    this.minimumRings.clear();
  }
}
