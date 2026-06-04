import * as THREE from 'three';
import { spawnExplosion } from '../effects/CombatEffects.js';
import { wrapSceneryTarget } from '../game/SceneryTarget.js';

const _scorch = new THREE.Color(0x2a2218);

const KIND_HP = {
  tree: 42,
  hedge: 70,
  rock: 110,
  bush: 35,
  bunker: 140,
};

const KIND_RADIUS = {
  tree: 2.2,
  hedge: 4,
  rock: 1.8,
  bush: 1.5,
  bunker: 3.5,
};

/** Cover zone at scenery — radii sized to match visible props (hedges/walls are elongated). */
const KIND_COVER = {
  tree: { type: 'light', radius: 3.4 },
  bush: { type: 'light', radius: 2.8 },
  hedge: { type: 'medium', radius: 6.5 },
  rock: { type: 'light', radius: 3 },
  bunker: { type: null, radius: 4.5 },
};

/** Trees, hedges, rocks, and sandbag positions that can be destroyed by fire. */
export class DestructibleScenery {
  constructor(scene) {
    this.scene = scene;
    this.objects = [];
    this.coverSystem = null;
  }

  setCoverSystem(coverSystem) {
    this.coverSystem = coverSystem;
    for (const obj of this.objects) {
      this._attachCoverZone(obj);
    }
  }

  _attachCoverZone(entry) {
    if (entry.hasCover || entry.destroyed) return;
    const spec = KIND_COVER[entry.kind];
    const type = entry.coverType ?? spec?.type;
    if (!type || !this.coverSystem) return;
    const radius = entry.coverRadius ?? spec?.radius ?? null;
    this.coverSystem.addZone(entry.x, entry.z, type, radius);
    entry.hasCover = true;
    entry.coverType = type;
    if (radius != null) entry.coverRadius = radius;
  }

  register(group, { x, z, kind = 'bush', coverType = null, coverRadius = null, hp }) {
    const spec = KIND_COVER[kind];
    const resolvedType = coverType ?? spec?.type ?? null;
    const entry = {
      group,
      x,
      z,
      kind,
      coverType: resolvedType,
      coverRadius: coverRadius ?? spec?.radius ?? null,
      hp: hp ?? KIND_HP[kind] ?? 40,
      maxHp: hp ?? KIND_HP[kind] ?? 40,
      radius: KIND_RADIUS[kind] ?? 2,
      destroyed: false,
      hasCover: false,
    };
    group.userData.destructible = entry;
    this.objects.push(entry);
    this.scene.add(group);
    this._attachCoverZone(entry);
    wrapSceneryTarget(entry, this);
    return entry;
  }

  getLiveObjects() {
    return this.objects.filter((o) => !o.destroyed);
  }

  getMeshes() {
    return this.getLiveObjects().map((o) => o.group);
  }

  /** Combat targets for ordered attacks on cover. */
  getAttackTargets() {
    const out = [];
    for (const obj of this.getLiveObjects()) {
      const t = wrapSceneryTarget(obj, this);
      if (t) out.push(t);
    }
    return out;
  }

  damageAt(x, z, radius, damage) {
    if (!damage || damage <= 0) return;
    for (const obj of this.objects) {
      if (obj.destroyed) continue;
      const d = Math.hypot(obj.x - x, obj.z - z);
      if (d > radius + obj.radius) continue;
      const falloff = 1 - d / (radius + obj.radius);
      this.damageObject(obj, damage * Math.max(0.35, falloff));
    }
  }

  damageObject(obj, damage) {
    if (!obj || obj.destroyed || damage <= 0) return;
    obj.hp = Math.max(0, obj.hp - damage);
    this._updateDamageVisual(obj);
    if (obj.hp <= 0) this.destroyObject(obj);
  }

  _updateDamageVisual(obj) {
    const ratio = obj.maxHp > 0 ? obj.hp / obj.maxHp : 0;
    if (!obj._meshRefs) {
      obj._meshRefs = [];
      obj.group.traverse((c) => {
        if (c.isMesh && c.material?.color) {
          obj._meshRefs.push({
            mesh: c,
            base: c.material.color.clone(),
          });
        }
      });
    }
    const wear = 1 - ratio;
    for (const { mesh, base } of obj._meshRefs) {
      mesh.material.color.copy(base).lerp(_scorch, wear * 0.72);
      if (mesh.material.emissive) {
        mesh.material.emissive.setHex(wear > 0.45 ? 0x442211 : 0x000000);
        mesh.material.emissiveIntensity = wear * 0.35;
      }
    }
    const s = 0.82 + ratio * 0.18;
    obj.group.scale.set(s, s * (0.88 + ratio * 0.12), s);
  }

  destroyObject(obj) {
    if (obj.destroyed) return;
    obj.destroyed = true;
    const y = obj.group.position.y + 0.5;
    spawnExplosion(this.scene, { x: obj.x, y, z: obj.z });

    if (obj.hasCover && this.coverSystem) {
      const r = (obj.coverRadius ?? obj.radius) + 1.5;
      this.coverSystem.removeZoneAt(obj.x, obj.z, r);
      obj.hasCover = false;
    }

    if (obj._attackTarget) obj._attackTarget.dead = true;

    this.scene.remove(obj.group);
    obj.group.traverse((c) => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) {
        if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
        else c.material.dispose();
      }
    });
  }

  clear() {
    for (const obj of this.objects) {
      if (!obj.destroyed && obj.group?.parent) {
        this.scene.remove(obj.group);
        obj.group.traverse((c) => {
          if (c.geometry) c.geometry.dispose();
          if (c.material) c.material.dispose();
        });
      }
    }
    this.objects = [];
  }
}