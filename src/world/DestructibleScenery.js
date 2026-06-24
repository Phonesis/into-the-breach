import * as THREE from 'three';
import { spawnExplosion } from '../effects/CombatEffects.js';
import { addExplosionCrater } from './TerrainDamage.js';
import { wrapSceneryTarget } from '../game/SceneryTarget.js';

const _scorch = new THREE.Color(0x2a2218);
let nextSceneryId = 1;

const KIND_HP = {
  tree: 42,
  hedge: 70,
  rock: 110,
  bush: 35,
  bunker: 140,
  farmHouse: 230,
  barn: 260,
  outbuilding: 170,
  stoneWall: 95,
  haystack: 45,
  fieldFence: 55,
  cart: 75,
  stump: 38,
};

const KIND_RADIUS = {
  tree: 2.2,
  hedge: 4,
  rock: 1.8,
  bush: 1.5,
  bunker: 3.5,
  farmHouse: 4.5,
  barn: 5.2,
  outbuilding: 3.4,
  stoneWall: 4.2,
  haystack: 1.8,
  fieldFence: 3.8,
  cart: 2.1,
  stump: 1.2,
};

/** Cover zone at scenery — radii sized to match visible props (hedges/walls are elongated). */
const KIND_COVER = {
  tree: { type: 'light', radius: 3.4 },
  bush: { type: 'light', radius: 2.8 },
  hedge: { type: 'medium', radius: 6.5 },
  rock: { type: 'light', radius: 3 },
  bunker: { type: null, radius: 4.5 },
  farmHouse: { type: 'heavy', radius: 5.2 },
  barn: { type: 'heavy', radius: 5.8 },
  outbuilding: { type: 'medium', radius: 4.2 },
  stoneWall: { type: 'medium', radius: 5.8 },
  haystack: { type: 'light', radius: 2.5 },
  fieldFence: { type: 'medium', radius: 5 },
  cart: { type: 'light', radius: 2.8 },
  stump: { type: 'light', radius: 2 },
};

const BUILDING_KINDS = new Set(['farmHouse', 'barn', 'outbuilding']);
const GARRISON_BUILDING_KINDS = new Set(['farmHouse', 'barn', 'outbuilding']);
const CRUSHABLE_KINDS = new Set([
  'farmHouse',
  'barn',
  'outbuilding',
  'stoneWall',
  'haystack',
  'fieldFence',
  'cart',
]);

const GARRISON_CAPACITY = {
  farmHouse: 3,
  barn: 4,
  outbuilding: 2,
};

/** Map gen shares one material across all trees/bushes — clone per prop so damage tints stay local. */
function cloneSceneryMaterials(group) {
  group.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    child.material = Array.isArray(child.material)
      ? child.material.map((m) => m.clone())
      : child.material.clone();
  });
}

/** Trees, hedges, rocks, and sandbag positions that can be destroyed by fire. */
export class DestructibleScenery {
  constructor(scene, mapDef = null, getTerrainMesh = null) {
    this.scene = scene;
    this.mapDef = mapDef;
    this.getTerrainMesh = getTerrainMesh ?? (() => null);
    this.objects = [];
    this.rubble = [];
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
    cloneSceneryMaterials(group);
    const spec = KIND_COVER[kind];
    const resolvedType = coverType ?? spec?.type ?? null;
    const canGarrison = GARRISON_BUILDING_KINDS.has(kind);
    const entry = {
      id: `scenery-${nextSceneryId++}`,
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
      def: canGarrison
        ? {
            garrison: true,
            garrisonCapacity: GARRISON_CAPACITY[kind] ?? 2,
          }
        : null,
      team: canGarrison ? 'neutral' : null,
      neutralGarrison: canGarrison,
      hideGarrisoned: canGarrison,
      garrison: canGarrison ? [] : null,
      garrisonTeam: null,
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

  hasGarrisonShelters() {
    return this.objects.some((o) => !o.destroyed && GARRISON_BUILDING_KINDS.has(o.kind));
  }

  getEntryById(id) {
    return this.objects.find((o) => o.id === id && !o.destroyed) ?? null;
  }

  pickBunkerAt(x, z, team, maxDist = 4.5) {
    let best = null;
    let bestD = maxDist;
    for (const obj of this.objects) {
      if (obj.destroyed || !GARRISON_BUILDING_KINDS.has(obj.kind)) continue;
      if (obj.garrisonTeam && obj.garrisonTeam !== team) continue;
      const d = Math.hypot(obj.x - x, obj.z - z);
      if (d < bestD) {
        bestD = d;
        best = obj;
      }
    }
    return best;
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

  crushAt(x, z, crushRadius = 1.8) {
    for (const obj of this.objects) {
      if (obj.destroyed || !CRUSHABLE_KINDS.has(obj.kind)) continue;
      const threshold = Math.max(crushRadius + obj.radius * 0.45, obj.radius * 0.72);
      if (Math.hypot(obj.x - x, obj.z - z) > threshold) continue;
      this.destroyObject(obj);
    }
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
    if (this.mapDef) {
      addExplosionCrater(this.scene, this.mapDef, obj.x, obj.z, 'light', this.getTerrainMesh());
    }

    if (obj.hasCover && this.coverSystem) {
      const r = (obj.coverRadius ?? obj.radius) + 1.5;
      this.coverSystem.removeZoneAt(obj.x, obj.z, r);
      obj.hasCover = false;
    }

    if (obj._attackTarget) obj._attackTarget.dead = true;

    if (BUILDING_KINDS.has(obj.kind)) {
      this._spawnBuildingRubble(obj);
    }

    this.scene.remove(obj.group);
    obj.group.traverse((c) => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) {
        if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
        else c.material.dispose();
      }
    });
  }

  _spawnBuildingRubble(obj) {
    const rubble = new THREE.Group();
    rubble.position.copy(obj.group.position);
    rubble.rotation.y = obj.group.rotation.y;

    const stoneMat = new THREE.MeshStandardMaterial({
      color: 0x4a453d,
      roughness: 0.94,
      metalness: 0.04,
      envMapIntensity: 0.28,
    });
    const timberMat = new THREE.MeshStandardMaterial({
      color: 0x2f241c,
      roughness: 0.9,
      envMapIntensity: 0.22,
    });
    const scorchMat = new THREE.MeshStandardMaterial({
      color: 0x17120f,
      roughness: 0.98,
      envMapIntensity: 0.12,
    });

    const radius = obj.radius ?? 3;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.82, radius * 1.05, 0.32, 12), scorchMat);
    base.position.y = 0.08;
    base.scale.z = 0.72;
    base.castShadow = false;
    base.receiveShadow = true;
    rubble.add(base);

    const chunks = obj.kind === 'barn' ? 12 : 9;
    for (let i = 0; i < chunks; i++) {
      const mat = i % 3 === 0 ? timberMat : stoneMat;
      const chunk = new THREE.Mesh(
        new THREE.BoxGeometry(0.35 + Math.random() * 0.8, 0.18 + Math.random() * 0.42, 0.3 + Math.random() * 0.85),
        mat
      );
      const ang = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * radius * 0.82;
      chunk.position.set(Math.cos(ang) * r, 0.22 + Math.random() * 0.2, Math.sin(ang) * r);
      chunk.rotation.set(Math.random() * 0.5, Math.random() * Math.PI, Math.random() * 0.35);
      chunk.castShadow = true;
      chunk.receiveShadow = true;
      rubble.add(chunk);
    }

    this.scene.add(rubble);
    this.rubble.push(rubble);
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
    for (const rubble of this.rubble) {
      if (rubble?.parent) this.scene.remove(rubble);
      rubble?.traverse((c) => {
        c.geometry?.dispose?.();
        if (c.material) {
          if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
          else c.material.dispose();
        }
      });
    }
    this.objects = [];
    this.rubble = [];
  }
}
