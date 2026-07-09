import * as THREE from 'three';

const SEGMENTS = 64;
/** Lift above unit feet so flat rings clear local terrain; depthTest off handles slopes. */
const RING_Y_OFFSET = 0.35;

export class RangeRingManager {
  constructor(scene) {
    this.scene = scene;
    this.rings = new Map();
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
    }

    for (const [id, ring] of this.rings) {
      if (!activeIds.has(id)) {
        this.scene.remove(ring);
        ring.geometry.dispose();
        ring.material.dispose();
        this.rings.delete(id);
      }
    }
  }

  _createRing(radius) {
    const geo = new THREE.RingGeometry(radius * 0.98, radius, SEGMENTS);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x4ade80,
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'rangeRing';
    mesh.renderOrder = 20;
    mesh.userData.range = radius;
    // Don't cast/receive shadows that would hide it
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    return mesh;
  }

  clear() {
    for (const [, ring] of this.rings) {
      this.scene.remove(ring);
      ring.geometry.dispose();
      ring.material.dispose();
    }
    this.rings.clear();
  }
}