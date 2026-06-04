import * as THREE from 'three';

const SEGMENTS = 64;

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
      let ring = this.rings.get(unit.id);
      if (!ring) {
        ring = this._createRing(unit.def.range);
        this.scene.add(ring);
        this.rings.set(unit.id, ring);
      }
      const y = unit.position.y + 0.15;
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
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'rangeRing';
    mesh.renderOrder = 1;
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