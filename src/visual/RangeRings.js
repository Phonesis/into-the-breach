import * as THREE from 'three';

const SEGMENTS = 64;
/** Lift above unit feet so flat rings clear local terrain; depthTest off handles slopes. */
const RING_Y_OFFSET = 0.35;

export class RangeRingManager {
  constructor(scene) {
    this.scene = scene;
    this.rings = new Map();
    this.minimumRings = new Map();
  }

  updateForUnits(units) {
    const selected = units.filter((u) => !u.dead && u.selected);
    const activeIds = new Set();

    for (const unit of selected) {
      activeIds.add(unit.id);
      const range = unit.def?.range ?? 10;
      let ring = this.rings.get(unit.id);
      if (!ring) {
        ring = this._createRing(range);
        this.scene.add(ring);
        this.rings.set(unit.id, ring);
      } else if (Math.abs((ring.userData.range ?? 0) - range) > 0.01) {
        // Unit type/range changed — rebuild geometry
        this.scene.remove(ring);
        ring.geometry.dispose();
        ring.material.dispose();
        ring = this._createRing(range);
        this.scene.add(ring);
        this.rings.set(unit.id, ring);
      }
      // Always sit on unit height; material ignores depth so slopes don't bury the ring
      const y = (unit.position.y ?? 0) + RING_Y_OFFSET;
      ring.position.set(unit.position.x, y, unit.position.z);
      ring.visible = true;

      const minRange = unit.def?.minRange ?? 0;
      let minimumRing = this.minimumRings.get(unit.id);
      if (minRange > 0) {
        if (!minimumRing) {
          minimumRing = this._createRing(minRange, 0xf59e0b, 'minimumRangeRing');
          this.scene.add(minimumRing);
          this.minimumRings.set(unit.id, minimumRing);
        } else if (Math.abs((minimumRing.userData.range ?? 0) - minRange) > 0.01) {
          this._removeRing(minimumRing);
          minimumRing = this._createRing(minRange, 0xf59e0b, 'minimumRangeRing');
          this.scene.add(minimumRing);
          this.minimumRings.set(unit.id, minimumRing);
        }
        minimumRing.position.set(unit.position.x, y + 0.01, unit.position.z);
        minimumRing.visible = true;
      } else if (minimumRing) {
        this._removeRing(minimumRing);
        this.minimumRings.delete(unit.id);
      }
    }

    for (const [id, ring] of this.rings) {
      if (!activeIds.has(id)) {
        this.scene.remove(ring);
        ring.geometry.dispose();
        ring.material.dispose();
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

  _createRing(radius, color = 0x4ade80, name = 'rangeRing') {
    const geo = new THREE.RingGeometry(radius * 0.98, radius, SEGMENTS);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name;
    mesh.renderOrder = 20;
    mesh.userData.range = radius;
    // Don't cast/receive shadows that would hide it
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    return mesh;
  }

  _removeRing(ring) {
    this.scene.remove(ring);
    ring.geometry.dispose();
    ring.material.dispose();
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
