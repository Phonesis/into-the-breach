import * as THREE from 'three';
import { setTargetHighlight } from '../units/UnitMeshes.js';
import { getSceneryTargetLabel, isSceneryTarget } from '../game/SceneryTarget.js';
import { getBaseBuildingTargetLabel, isBaseBuildingTarget } from '../game/BaseBuildingTarget.js';

const MAX_LINES = 48;

function targetLabel(target) {
  if (!target) return '';
  if (target.isGround) return 'ground';
  if (isSceneryTarget(target)) return getSceneryTargetLabel(target);
  if (isBaseBuildingTarget(target)) return getBaseBuildingTargetLabel(target);
  if (target.def) return target.name ?? target.def.name;
  return target.name ?? target.label ?? 'Enemy HQ';
}

function targetPosition(target) {
  const p = target.position ?? target.mesh?.position;
  return { x: p.x, y: (p.y ?? 0) + 1.2, z: p.z };
}

export class TargetIndicators {
  constructor(scene) {
    this.scene = scene;
    this.hoverTarget = null;
    this.engagedTargets = new Set();
    this._hqHoverRing = null;
    this._sceneryHoverRing = null;
    this._linePool = [];
    this._lineMat = new THREE.LineBasicMaterial({
      color: 0xff6644,
      transparent: true,
      opacity: 0.85,
      depthTest: false,
    });
    this._engagedLineMat = new THREE.LineBasicMaterial({
      color: 0xffaa44,
      transparent: true,
      opacity: 0.7,
      depthTest: false,
    });
    for (let i = 0; i < MAX_LINES; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(geo, this._lineMat);
      line.visible = false;
      line.frustumCulled = false;
      line.renderOrder = 9;
      scene.add(line);
      this._linePool.push(line);
    }
  }

  clear() {
    this.setHoverTarget(null);
    this.engagedTargets.clear();
    for (const line of this._linePool) line.visible = false;
    if (this._hqHoverRing) {
      this.scene.remove(this._hqHoverRing);
      this._hqHoverRing.geometry.dispose();
      this._hqHoverRing.material.dispose();
      this._hqHoverRing = null;
    }
    if (this._sceneryHoverRing) {
      this.scene.remove(this._sceneryHoverRing);
      this._sceneryHoverRing.geometry.dispose();
      this._sceneryHoverRing.material.dispose();
      this._sceneryHoverRing = null;
    }
    for (const u of this._lastUnits ?? []) {
      if (u.mesh) setTargetHighlight(u.mesh, false);
    }
    this._lastUnits = [];
  }

  setHoverTarget(target) {
    if (this.hoverTarget === target) return;
    this._clearHoverVisual(this.hoverTarget);
    this.hoverTarget = target;
    this._applyHoverVisual(target, false);
  }

  _clearHoverVisual(target) {
    if (!target) return;
    if (isSceneryTarget(target)) {
      if (target.entry && !target.entry.destroyed && target.mesh && target.entry.baseScale) {
        target.mesh.scale.copy(target.entry.baseScale);
      }
      if (this._sceneryHoverRing) this._sceneryHoverRing.visible = false;
      return;
    }
    if (target.dead) return;
    if (target.mesh && target.def) {
      if (!this.engagedTargets.has(target)) setTargetHighlight(target.mesh, false);
    } else if (target.mesh && this._hqHoverRing && target === this.hoverTarget) {
      this._hqHoverRing.visible = false;
    }
  }

  _applyHoverVisual(target, engaged) {
    if (!target || target.dead) return;
    if (isSceneryTarget(target) && target.mesh) {
      if (target.entry?.baseScale) target.mesh.scale.copy(target.entry.baseScale);
      if (!this._sceneryHoverRing) {
        const geo = new THREE.RingGeometry(0.84, 1, 40);
        const mat = new THREE.MeshBasicMaterial({
          color: 0xff5533,
          transparent: true,
          opacity: 0.86,
          side: THREE.DoubleSide,
          depthTest: false,
        });
        this._sceneryHoverRing = new THREE.Mesh(geo, mat);
        this._sceneryHoverRing.rotation.x = -Math.PI / 2;
        this._sceneryHoverRing.renderOrder = 10;
        this.scene.add(this._sceneryHoverRing);
      }
      const radius = Math.max(1.5, target.entry?.radius ?? target.hitRadius ?? 2.5);
      this._sceneryHoverRing.position.set(
        target.position.x,
        (target.position.y ?? target.mesh.position.y ?? 0) + 0.12,
        target.position.z
      );
      this._sceneryHoverRing.scale.setScalar(radius);
      this._sceneryHoverRing.visible = true;
      return;
    }
    if (target.mesh && target.def) {
      setTargetHighlight(target.mesh, true, engaged);
      return;
    }
    if (target.mesh) {
      if (!this._hqHoverRing) {
        const geo = new THREE.RingGeometry(5.5, 6.2, 40);
        const mat = new THREE.MeshBasicMaterial({
          color: 0xff3333,
          transparent: true,
          opacity: 0.9,
          side: THREE.DoubleSide,
          depthTest: false,
        });
        this._hqHoverRing = new THREE.Mesh(geo, mat);
        this._hqHoverRing.rotation.x = -Math.PI / 2;
        this._hqHoverRing.renderOrder = 10;
        this.scene.add(this._hqHoverRing);
      }
      const p = target.position;
      const y = (p.y ?? 0) + 0.35;
      this._hqHoverRing.position.set(p.x, y, p.z);
      this._hqHoverRing.material.color.setHex(engaged ? 0xff8800 : 0xff3333);
      this._hqHoverRing.visible = true;
    }
  }

  update(selectedUnits, allPlayerUnits) {
    const engaged = new Set();
    const lines = [];

    for (const u of selectedUnits) {
      const order = u.attackOrder;
      if (!order || order.dead || order.isGround) continue;
      engaged.add(order);
      const from = u.position;
      const to = targetPosition(order);
      lines.push({
        from: { x: from.x, y: from.y + 0.8, z: from.z },
        to,
        engaged: true,
      });
    }

    for (const prev of this.engagedTargets) {
      if (!engaged.has(prev) && prev.mesh?.def) setTargetHighlight(prev.mesh, false);
    }

    this.engagedTargets = engaged;

    for (const t of engaged) {
      if (t.mesh && t.def) setTargetHighlight(t.mesh, true, true);
    }

    if (this.hoverTarget && !this.hoverTarget.dead && !engaged.has(this.hoverTarget)) {
      this._applyHoverVisual(this.hoverTarget, false);
    } else if (this._hqHoverRing && (!this.hoverTarget || engaged.has(this.hoverTarget))) {
      if (!this.hoverTarget || engaged.has(this.hoverTarget)) {
        /* hq ring handled in setHoverTarget */
      }
    }

    let li = 0;
    for (const seg of lines) {
      if (li >= this._linePool.length) break;
      const line = this._linePool[li++];
      const pos = line.geometry.attributes.position.array;
      pos[0] = seg.from.x;
      pos[1] = seg.from.y;
      pos[2] = seg.from.z;
      pos[3] = seg.to.x;
      pos[4] = seg.to.y;
      pos[5] = seg.to.z;
      line.geometry.attributes.position.needsUpdate = true;
      line.material = seg.engaged ? this._engagedLineMat : this._lineMat;
      line.visible = true;
    }
    for (; li < this._linePool.length; li++) this._linePool[li].visible = false;

    this._lastUnits = allPlayerUnits;
  }

  static getTargetLabel(target) {
    return targetLabel(target);
  }
}
