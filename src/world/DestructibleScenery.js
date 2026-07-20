import * as THREE from 'three';
import {
  spawnCollapseDust,
  spawnExplosion,
  spawnSmokePuff,
} from '../effects/CombatEffects.js';
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
  'tree',
  'hedge',
  'bush',
  'farmHouse',
  'barn',
  'outbuilding',
  'stoneWall',
  'haystack',
  'fieldFence',
  'cart',
  'stump',
]);

/** Wheeled scout cars flatten light scenery, but only tracked armor levels full buildings. */
const LIGHT_VEHICLE_CRUSHABLE_KINDS = new Set([
  'tree',
  'hedge',
  'bush',
  'outbuilding',
  'haystack',
  'fieldFence',
  'cart',
  'stump',
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
    this.crushAnimations = [];
    this.buildingCollapseAnimations = [];
    this.coverSystem = null;
    this._mapObjectIndex = 0;
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

  register(
    group,
    { x, z, kind = 'bush', coverType = null, coverRadius = null, hp, source = 'dynamic' }
  ) {
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
      source,
      mapKey:
        source === 'map'
          ? `${this.mapDef?.id ?? 'map'}:${this.mapDef?.size ?? 0}:${this._mapObjectIndex++}`
          : null,
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

  crushAt(x, z, crushRadius = 1.8, options = {}) {
    const lightVehicle = options.vehicleClass === 'light';
    let crushedCount = 0;
    for (const obj of this.objects) {
      if (obj.destroyed || !CRUSHABLE_KINDS.has(obj.kind)) continue;
      if (lightVehicle && !LIGHT_VEHICLE_CRUSHABLE_KINDS.has(obj.kind)) continue;
      const threshold = Math.max(crushRadius + obj.radius * 0.45, obj.radius * 0.72);
      if (Math.hypot(obj.x - x, obj.z - z) > threshold) continue;
      this.destroyObject(obj, {
        effects: false,
        crushed: true,
        directionX: options.directionX,
        directionZ: options.directionZ,
      });
      crushedCount++;
    }
    return crushedCount;
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

  destroyObject(
    obj,
    { effects = true, crushed = false, directionX = 0, directionZ = 0 } = {}
  ) {
    if (obj.destroyed) return;
    obj.destroyed = true;
    const y = obj.group.position.y + 0.5;
    if (effects) spawnExplosion(this.scene, { x: obj.x, y, z: obj.z });
    if (effects && this.mapDef) {
      addExplosionCrater(this.scene, this.mapDef, obj.x, obj.z, 'light', this.getTerrainMesh());
    }

    if (obj.hasCover && this.coverSystem) {
      const r = (obj.coverRadius ?? obj.radius) + 1.5;
      this.coverSystem.removeZoneAt(obj.x, obj.z, r);
      obj.hasCover = false;
    }

    if (obj._attackTarget) obj._attackTarget.dead = true;

    if (BUILDING_KINDS.has(obj.kind)) {
      if (crushed) {
        this._beginBuildingCollapse(obj, directionX, directionZ);
        return;
      }
      this._spawnBuildingRubble(obj);
    }

    if (crushed && !BUILDING_KINDS.has(obj.kind)) {
      this._leaveCrushedProp(obj, directionX, directionZ);
      return;
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

  /** Leave flattened vegetation / props behind so a vehicle impact reads as weight, not deletion. */
  _leaveCrushedProp(obj, directionX = 0, directionZ = 0) {
    const group = obj.group;
    let dx = Number.isFinite(directionX) ? directionX : 0;
    let dz = Number.isFinite(directionZ) ? directionZ : 0;
    const len = Math.hypot(dx, dz);
    if (len > 0.001) {
      dx /= len;
      dz /= len;
    } else {
      const angle = Math.random() * Math.PI * 2;
      dx = Math.cos(angle);
      dz = Math.sin(angle);
    }

    if (obj.kind === 'tree') {
      const fallAxis = new THREE.Vector3(dz, 0, -dx).normalize();
      this.crushAnimations.push({
        group,
        fallAxis,
        startQuaternion: group.quaternion.clone(),
        rotation: new THREE.Quaternion(),
        targetAngle: Math.PI * (0.475 + Math.random() * 0.015),
        duration: 1.05 + Math.random() * 0.28,
        elapsed: 0,
        startY: group.position.y,
        impactDust: false,
      });
    } else {
      const flatten = obj.kind === 'hedge' || obj.kind === 'fieldFence' ? 0.2 : 0.3;
      group.scale.y *= flatten;
      group.rotation.x += dz * 0.24;
      group.rotation.z -= dx * 0.24;
      group.position.y += 0.03;
    }

    group.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = obj.kind === 'tree';
      child.receiveShadow = true;
    });
    this.rubble.push(group);
  }

  /** Animate crushed trees from the base with a gravity-led fall and a small impact settle. */
  update(dt) {
    if (
      (!this.crushAnimations.length && !this.buildingCollapseAnimations.length) ||
      !Number.isFinite(dt) ||
      dt <= 0
    ) return;
    const step = Math.min(dt, 0.05);

    for (let i = this.crushAnimations.length - 1; i >= 0; i--) {
      const anim = this.crushAnimations[i];
      if (!anim.group?.parent) {
        this.crushAnimations.splice(i, 1);
        continue;
      }

      anim.elapsed += step;
      const t = THREE.MathUtils.clamp(anim.elapsed / anim.duration, 0, 1);
      let angle;
      if (t < 0.82) {
        const falling = t / 0.82;
        angle = anim.targetAngle * falling * falling;
      } else {
        const settling = (t - 0.82) / 0.18;
        angle =
          anim.targetAngle +
          Math.sin(settling * Math.PI) * (1 - settling) * 0.065;
        if (!anim.impactDust) {
          anim.impactDust = true;
          const { x, z } = anim.group.position;
          spawnSmokePuff(this.scene, { x, y: anim.startY + 0.2, z }, 0.95);
          spawnSmokePuff(
            this.scene,
            {
              x: x + anim.fallAxis.z * 0.7,
              y: anim.startY + 0.15,
              z: z - anim.fallAxis.x * 0.7,
            },
            0.62
          );
        }
      }

      anim.rotation.setFromAxisAngle(anim.fallAxis, angle);
      anim.group.quaternion.copy(anim.rotation).multiply(anim.startQuaternion);
      anim.group.position.y =
        anim.startY + (t >= 0.82 ? Math.sin(((t - 0.82) / 0.18) * Math.PI) * 0.035 : 0);

      if (t >= 1) {
        anim.group.position.y = anim.startY;
        this.crushAnimations.splice(i, 1);
      }
    }

    for (let i = this.buildingCollapseAnimations.length - 1; i >= 0; i--) {
      const anim = this.buildingCollapseAnimations[i];
      anim.elapsed += step;
      const t = THREE.MathUtils.clamp(anim.elapsed / anim.duration, 0, 1);
      const buckleT = THREE.MathUtils.clamp(t / 0.68, 0, 1);
      const buckle = buckleT * buckleT * (3 - 2 * buckleT);

      if (anim.group?.parent) {
        anim.group.scale.set(
          anim.startScale.x * (1 + buckle * 0.035),
          anim.startScale.y * (1 - buckle * 0.87),
          anim.startScale.z * (1 + buckle * 0.025)
        );
        anim.group.rotation.x = anim.startRotation.x + anim.localDz * buckle * 0.16;
        anim.group.rotation.z = anim.startRotation.z - anim.localDx * buckle * 0.16;
        anim.group.position.x = anim.startPosition.x + anim.dx * buckle * 0.34;
        anim.group.position.z = anim.startPosition.z + anim.dz * buckle * 0.34;

        for (const piece of anim.breakawayPieces) {
          const peel = Math.max(0, (buckleT - piece.delay) / (1 - piece.delay));
          const eased = peel * peel;
          piece.mesh.position.copy(piece.startPosition);
          piece.mesh.position.x += anim.localDx * eased * piece.travel;
          piece.mesh.position.z += anim.localDz * eased * piece.travel;
          piece.mesh.position.y -= eased * piece.drop;
          piece.mesh.rotation.x = piece.startRotation.x + anim.localDz * eased * piece.spin;
          piece.mesh.rotation.z = piece.startRotation.z - anim.localDx * eased * piece.spin;
        }
      }

      if (t >= 0.5 && !anim.rubbleRevealed) {
        anim.rubbleRevealed = true;
        anim.rubble.visible = true;
        this._spawnCollapseDust(anim, 1.2);
      }

      if (anim.rubbleRevealed) {
        const debrisT = THREE.MathUtils.clamp((t - 0.5) / 0.5, 0, 1);
        const settle = 1 - Math.pow(1 - debrisT, 3);
        for (const debris of anim.debris) {
          debris.mesh.position.lerpVectors(debris.startPosition, debris.finalPosition, settle);
          debris.mesh.position.y += Math.sin(debrisT * Math.PI) * debris.arc;
          debris.mesh.quaternion.slerpQuaternions(
            debris.startQuaternion,
            debris.finalQuaternion,
            settle
          );
        }
      }

      if (t >= 0.7 && !anim.shellRemoved) {
        anim.shellRemoved = true;
        this._removeAndDisposeGroup(anim.group);
      }

      if (t >= 1) {
        for (const debris of anim.debris) {
          debris.mesh.position.copy(debris.finalPosition);
          debris.mesh.quaternion.copy(debris.finalQuaternion);
        }
        this.buildingCollapseAnimations.splice(i, 1);
      }
    }
  }

  _beginBuildingCollapse(obj, directionX = 0, directionZ = 0) {
    let dx = Number.isFinite(directionX) ? directionX : 0;
    let dz = Number.isFinite(directionZ) ? directionZ : 0;
    const directionLength = Math.hypot(dx, dz);
    if (directionLength > 0.001) {
      dx /= directionLength;
      dz /= directionLength;
    } else {
      const angle = Math.random() * Math.PI * 2;
      dx = Math.cos(angle);
      dz = Math.sin(angle);
    }

    const group = obj.group;
    const yaw = group.rotation.y;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const localDx = cos * dx + sin * dz;
    const localDz = -sin * dx + cos * dz;
    const rubble = this._spawnBuildingRubble(obj, { visible: false, crushed: true });
    const debris = [];
    const radius = obj.radius ?? 3;

    for (const mesh of rubble.children) {
      if (!mesh.isMesh || mesh.userData.rubbleBase) continue;
      const finalPosition = mesh.position.clone();
      const finalQuaternion = mesh.quaternion.clone();
      const startPosition = new THREE.Vector3(
        (Math.random() - 0.5) * radius * 0.45 - localDx * 0.3,
        1.1 + Math.random() * (obj.kind === 'barn' ? 2.4 : 1.8),
        (Math.random() - 0.5) * radius * 0.45 - localDz * 0.3
      );
      const startQuaternion = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(
          Math.random() * Math.PI,
          Math.random() * Math.PI,
          Math.random() * Math.PI
        )
      );
      mesh.position.copy(startPosition);
      mesh.quaternion.copy(startQuaternion);
      debris.push({
        mesh,
        startPosition,
        finalPosition,
        startQuaternion,
        finalQuaternion,
        arc: 0.35 + Math.random() * 0.75,
      });
    }

    const breakawayPieces = [];
    for (const mesh of group.children) {
      if (!mesh.isMesh) continue;
      const highPiece =
        mesh.name === 'buildingRoof' ||
        mesh.name === 'buildingChimney' ||
        mesh.position.y > (obj.kind === 'outbuilding' ? 1.65 : 2.2);
      if (!highPiece) continue;
      breakawayPieces.push({
        mesh,
        startPosition: mesh.position.clone(),
        startRotation: mesh.rotation.clone(),
        delay: 0.05 + Math.random() * 0.16,
        travel: 0.55 + Math.random() * 0.75,
        drop: 0.55 + Math.random() * 0.65,
        spin: 0.35 + Math.random() * 0.42,
      });
    }

    const anim = {
      obj,
      group,
      rubble,
      debris,
      breakawayPieces,
      dx,
      dz,
      localDx,
      localDz,
      startPosition: group.position.clone(),
      startRotation: group.rotation.clone(),
      startScale: group.scale.clone(),
      duration: obj.kind === 'barn' ? 1.18 : 0.98,
      elapsed: 0,
      rubbleRevealed: false,
      shellRemoved: false,
    };
    this.buildingCollapseAnimations.push(anim);
    this._spawnCollapseDust(anim, 0.72);
  }

  _spawnCollapseDust(anim, scale = 1) {
    const { x, y, z } = anim.startPosition;
    spawnCollapseDust(
      this.scene,
      { x, y: y + 0.04, z },
      (anim.obj.radius ?? 3) * 0.72 * scale,
      { x: anim.dx, z: anim.dz }
    );
  }

  _removeAndDisposeGroup(group) {
    if (!group) return;
    if (group.parent) this.scene.remove(group);
    group.traverse((child) => {
      child.geometry?.dispose?.();
      if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose());
      else child.material?.dispose?.();
    });
  }

  _spawnBuildingRubble(obj, { visible = true, crushed = false } = {}) {
    const rubble = new THREE.Group();
    rubble.position.copy(obj.group.position);
    rubble.rotation.y = obj.group.rotation.y;

    const stoneMat = new THREE.MeshStandardMaterial({
      color: crushed ? 0x716858 : 0x4a453d,
      roughness: 0.94,
      metalness: 0.04,
      envMapIntensity: 0.28,
    });
    const timberMat = new THREE.MeshStandardMaterial({
      color: crushed ? 0x493428 : 0x2f241c,
      roughness: 0.9,
      envMapIntensity: 0.22,
    });
    const scorchMat = new THREE.MeshStandardMaterial({
      color: crushed ? 0x564e40 : 0x17120f,
      roughness: 0.98,
      envMapIntensity: 0.12,
    });

    const radius = obj.radius ?? 3;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.82, radius * 1.05, 0.32, 12), scorchMat);
    base.position.y = 0.08;
    base.scale.z = 0.72;
    base.castShadow = false;
    base.receiveShadow = true;
    base.userData.rubbleBase = true;
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
    rubble.visible = visible;
    this.rubble.push(rubble);
    return rubble;
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
    for (const anim of this.buildingCollapseAnimations) {
      if (!anim.shellRemoved) this._removeAndDisposeGroup(anim.group);
    }
    this.objects = [];
    this.rubble = [];
    this.crushAnimations = [];
    this.buildingCollapseAnimations = [];
  }
}
