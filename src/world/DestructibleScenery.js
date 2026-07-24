import * as THREE from 'three';
import {
  spawnBuildingDamageDust,
  spawnCollapseDust,
  spawnExplosion,
  spawnSmokePuff,
} from '../effects/CombatEffects.js';
import { addExplosionCrater } from './TerrainDamage.js';
import { wrapSceneryTarget } from '../game/SceneryTarget.js';

const _scorch = new THREE.Color(0x2a2218);
let nextSceneryId = 1;

const EXPLOSIVE_WEAPON_TYPES = new Set([
  'artillery',
  'mortar',
  'tank',
  'tankDestroyer',
  'superHeavyTank',
  'antiTankGun',
  'handGrenade',
]);
const ROOF_DIRECT_HIT_WEAPON_TYPES = new Set(['artillery', 'mortar', 'strafe']);
const GARRISON_WINDOW_ENGAGEMENT_TYPES = new Set([
  'infantry',
  'engineer',
  'machineGun',
  'sniper',
  'armoredCar',
  'paratrooper',
  'vehicleCrew',
]);
const STRICT_DIRECT_SHELL_TYPES = new Set([
  'antiTankGun',
  'tank',
  'tankDestroyer',
  'superHeavyTank',
]);

function isExplosiveImpact(options = {}) {
  return options.explosive === true || EXPLOSIVE_WEAPON_TYPES.has(options.weaponType);
}

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
  urbanHouse: 300,
  apartmentBlock: 390,
  factory: 440,
  church: 520,
  urbanWall: 105,
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
  urbanHouse: 5.4,
  apartmentBlock: 6.2,
  factory: 7.1,
  church: 7.8,
  urbanWall: 2.5,
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
  urbanHouse: { type: 'heavy', radius: 6 },
  apartmentBlock: { type: 'heavy', radius: 7 },
  factory: { type: 'heavy', radius: 7.8 },
  church: { type: 'heavy', radius: 8.5 },
  urbanWall: { type: 'medium', radius: 3.2 },
};

const BUILDING_KINDS = new Set([
  'farmHouse',
  'barn',
  'outbuilding',
  'urbanHouse',
  'apartmentBlock',
  'factory',
  'church',
  'urbanWall',
]);
const GARRISON_BUILDING_KINDS = new Set([
  'farmHouse',
  'barn',
  'outbuilding',
  'urbanHouse',
  'apartmentBlock',
  'factory',
  'church',
]);
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
  'urbanWall',
]);
/** Compact rural structures that tracked armor can collapse and cross. */
const TRACKED_CRUSHABLE_BUILDING_KINDS = new Set([
  'farmHouse',
  'barn',
  'outbuilding',
]);

/** Intact full buildings are hard obstacles to vehicles. */
const VEHICLE_BLOCKING_BUILDING_KINDS = new Set([
  'farmHouse',
  'barn',
  'urbanHouse',
  'apartmentBlock',
  'factory',
  'church',
]);
// Direct fire is stricter than vehicle collision: light outbuildings and
// courtyard walls can be crushed, but remain solid to bullets until destroyed.
// High-velocity tank / AT shells still punch through light rural timber
// (barns, farmhouses, sheds). Berlin masonry and heavy urban structures do not.
const LINE_OF_FIRE_BLOCKING_BUILDING_KINDS = new Set(BUILDING_KINDS);
/** Wooden / light rural buildings — solid to small arms, not to direct shells. */
const SHELL_PENETRABLE_BUILDING_KINDS = new Set([
  'farmHouse',
  'barn',
  'outbuilding',
]);

function segmentBoundsEntryT(startX, startZ, endX, endZ, halfWidth, halfDepth) {
  const deltaX = endX - startX;
  const deltaZ = endZ - startZ;
  let entryT = 0;
  let exitT = 1;

  const clipAxis = (start, delta, halfExtent) => {
    if (Math.abs(delta) < 1e-6) return Math.abs(start) <= halfExtent;
    let nearT = (-halfExtent - start) / delta;
    let farT = (halfExtent - start) / delta;
    if (nearT > farT) [nearT, farT] = [farT, nearT];
    entryT = Math.max(entryT, nearT);
    exitT = Math.min(exitT, farT);
    return entryT <= exitT;
  };

  if (!clipAxis(startX, deltaX, halfWidth)) return null;
  if (!clipAxis(startZ, deltaZ, halfDepth)) return null;
  return entryT >= 0 && entryT <= 1 ? entryT : null;
}

function seededPlacementAngle(x, z) {
  const value = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return (value - Math.floor(value)) * Math.PI * 2;
}

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
  'urbanWall',
]);

const GARRISON_CAPACITY = {
  farmHouse: 3,
  barn: 4,
  outbuilding: 2,
  urbanHouse: 4,
  apartmentBlock: 6,
  factory: 7,
  church: 8,
};

/** Map gen shares one material across all trees/bushes — clone per prop so damage tints stay local. */
function cloneSceneryMaterials(group) {
  if (group.userData.uniqueSceneryMaterials) return;
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
    this.impactDebrisAnimations = [];
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
    { x, z, kind = 'bush', coverType = null, coverRadius = null, radius = null, hp, source = 'dynamic' }
  ) {
    cloneSceneryMaterials(group);
    const spec = KIND_COVER[kind];
    const resolvedType = coverType ?? spec?.type ?? null;
    const canGarrison = GARRISON_BUILDING_KINDS.has(kind);
    const damageBounds = group.userData.damageBounds;
    const entry = {
      id: `scenery-${nextSceneryId++}`,
      group,
      // Garrison code uses `mesh` as the visual root for badges and window lookouts.
      mesh: group,
      x,
      z,
      kind,
      coverType: resolvedType,
      coverRadius: coverRadius ?? spec?.radius ?? null,
      hp: hp ?? KIND_HP[kind] ?? 40,
      maxHp: hp ?? KIND_HP[kind] ?? 40,
      radius: radius ?? KIND_RADIUS[kind] ?? 2,
      // Stable local footprint for LOS / vehicle collision (independent of later mesh edits).
      footprintWidth: damageBounds?.width ?? null,
      footprintDepth: damageBounds?.depth ?? null,
      baseScale: group.scale.clone(),
      destroyed: false,
      lineOfFireReleased: false,
      hasCover: false,
      def: canGarrison
        ? {
            garrison: true,
            garrisonCapacity: GARRISON_CAPACITY[kind] ?? 2,
            radius: radius ?? KIND_RADIUS[kind] ?? 2,
            hitRadius: radius ?? KIND_RADIUS[kind] ?? 2,
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

  /** Local XZ footprint used by line-of-fire and vehicle collision. */
  _buildingFootprint(obj) {
    const bounds = obj.group?.userData?.damageBounds;
    const width =
      obj.footprintWidth ??
      bounds?.width ??
      // Prefer a square covering the collision radius so elongated buildings
      // never collapse to an under-sized strip when damageBounds is missing.
      (obj.radius ?? 2) * 1.9;
    const depth = obj.footprintDepth ?? bounds?.depth ?? (obj.radius ?? 2) * 1.9;
    return { width, depth };
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
      // Prefer footprint reach so clicks on a large tenement façade register.
      const reach = Math.max(maxDist, (obj.radius ?? 4) + 2.5);
      const d = Math.hypot(obj.x - x, obj.z - z);
      if (d > reach) continue;
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

  /**
   * Local footprint half-extents + yaw/scale helpers for an object.
   * @returns {{ halfW: number, halfD: number, cos: number, sin: number, scaleX: number, scaleZ: number } | null}
   */
  _buildingLocalFrame(obj, footprintMargin = 0) {
    if (!obj) return null;
    const bounds = this._buildingFootprint(obj);
    const yaw = obj.group?.rotation?.y ?? 0;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const scaleX = Math.max(0.01, obj.baseScale?.x ?? obj.group?.scale?.x ?? 1);
    const scaleZ = Math.max(0.01, obj.baseScale?.z ?? obj.group?.scale?.z ?? 1);
    // Include margin so broad-phase culling never drops a shell that only
    // clips the expanded solid used by AT / tank fire.
    const halfW = bounds.width * 0.5 + footprintMargin / scaleX;
    const halfD = bounds.depth * 0.5 + footprintMargin / scaleZ;
    return {
      halfW,
      halfD,
      cos,
      sin,
      scaleX,
      scaleZ,
      worldExtent: Math.hypot(halfW * scaleX, halfD * scaleZ),
    };
  }

  /** Segment entry t into a building footprint, or null if no hit. */
  _segmentBuildingEntryT(ax, az, bx, bz, obj, footprintMargin = 0) {
    const frame = this._buildingLocalFrame(obj, footprintMargin);
    if (!frame) return null;
    const { halfW, halfD, cos, sin, scaleX, scaleZ, worldExtent } = frame;
    const minX = Math.min(ax, bx);
    const maxX = Math.max(ax, bx);
    const minZ = Math.min(az, bz);
    const maxZ = Math.max(az, bz);
    if (
      obj.x + worldExtent < minX ||
      obj.x - worldExtent > maxX ||
      obj.z + worldExtent < minZ ||
      obj.z - worldExtent > maxZ
    ) {
      return null;
    }
    const fromDx = ax - obj.x;
    const fromDz = az - obj.z;
    const toDx = bx - obj.x;
    const toDz = bz - obj.z;
    // Three.js Y-rotation inverse: local = R^T * world.
    const fromX = (cos * fromDx - sin * fromDz) / scaleX;
    const fromZ = (sin * fromDx + cos * fromDz) / scaleZ;
    const toX = (cos * toDx - sin * toDz) / scaleX;
    const toZ = (sin * toDx + cos * toDz) / scaleZ;
    return segmentBoundsEntryT(fromX, fromZ, toX, toZ, halfW, halfD);
  }

  /**
   * Closest point on a building's solid footprint toward a world position.
   * Used so fire missions aim at the facing façade, not the interior centre.
   */
  getBuildingSurfaceAimPoint(obj, fromX, fromZ, inset = 0.15) {
    if (!obj) return null;
    const frame = this._buildingLocalFrame(obj, 0);
    if (!frame) return null;
    const { halfW, halfD, cos, sin, scaleX, scaleZ } = frame;
    const dx = fromX - obj.x;
    const dz = fromZ - obj.z;
    const localX = (cos * dx - sin * dz) / scaleX;
    const localZ = (sin * dx + cos * dz) / scaleZ;
    if (Math.abs(localX) <= halfW && Math.abs(localZ) <= halfD) {
      // Fire from inside/overlapping: keep centre aim.
      return { x: obj.x, z: obj.z };
    }
    // Nearest point on the local footprint, then a slight outward bias onto the skin.
    let surfaceX = Math.max(-halfW, Math.min(halfW, localX));
    let surfaceZ = Math.max(-halfD, Math.min(halfD, localZ));
    const outX = localX - surfaceX;
    const outZ = localZ - surfaceZ;
    const outLen = Math.hypot(outX, outZ) || 1;
    surfaceX += (outX / outLen) * (inset / scaleX);
    surfaceZ += (outZ / outLen) * (inset / scaleZ);
    return {
      x: obj.x + cos * surfaceX * scaleX + sin * surfaceZ * scaleZ,
      z: obj.z - sin * surfaceX * scaleX + cos * surfaceZ * scaleZ,
    };
  }

  /**
   * First intact building that occludes a direct line of fire.
   * When the target is itself a building, only earlier occluders count — so a
   * deliberate Shift-fire on a tenement is not cancelled by a neighbour row
   * sharing a sealed alley gap with the aim-point at the target centre.
   */
  getLineOfFireBlocker(attacker, target) {
    if (!attacker?.position || !target) return null;
    const targetPosition = target.position ?? target.mesh?.position;
    if (!targetPosition) return null;
    const ax = attacker.position.x;
    const az = attacker.position.z;
    const strictDirectShell = STRICT_DIRECT_SHELL_TYPES.has(attacker.def?.type);
    // AT / tank shells use a generous solid footprint so façade cornices,
    // sealed alleys, and Berlin courtyard corners still count as masonry.
    const footprintMargin = strictDirectShell ? 1.35 : 0.55;

    const targetBuilding =
      target.entry &&
      LINE_OF_FIRE_BLOCKING_BUILDING_KINDS.has(target.entry.kind) &&
      !target.entry.lineOfFireReleased &&
      !(target.entry.destroyed && !target.entry.group?.parent)
        ? target.entry
        : null;

    // Building fire missions aim at the facing façade so the shot segment does
    // not tunnel through the block interior past neighbouring tenements.
    let bx = targetPosition.x;
    let bz = targetPosition.z;
    if (targetBuilding) {
      const aim = this.getBuildingSurfaceAimPoint(targetBuilding, ax, az);
      if (aim) {
        bx = aim.x;
        bz = aim.z;
      }
    }

    // When shooting a building, record when the ray first reaches that footprint
    // so side-by-side neighbours are not treated as occluders for the same shot.
    let targetHitT = null;
    if (targetBuilding) {
      targetHitT = this._segmentBuildingEntryT(
        ax,
        az,
        bx,
        bz,
        targetBuilding,
        footprintMargin
      );
      // Façade aim often lands on/just outside the skin; treat as hit at end.
      if (targetHitT == null) targetHitT = 1;
    }

    const candidates = [];
    if (strictDirectShell) {
      // Three corridor samples: centreline + flanks. Five was too expensive on
      // dense urban maps with hundreds of building footprints.
      const dx = bx - ax;
      const dz = bz - az;
      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len;
      const nz = dx / len;
      for (const offset of [0, -1.1, 1.1]) {
        candidates.push({
          ax: ax + nx * offset,
          az: az + nz * offset,
          bx: bx + nx * offset,
          bz: bz + nz * offset,
          lateral: offset !== 0,
        });
      }
    } else {
      candidates.push({ ax, az, bx, bz, lateral: false });
    }

    let nearest = null;
    let nearestEntryT = Infinity;
    for (const ray of candidates) {
      for (const obj of this.objects) {
        if (!LINE_OF_FIRE_BLOCKING_BUILDING_KINDS.has(obj.kind)) continue;
        // Released rubble no longer blocks; a still-parented collapsing shell does.
        if (obj.lineOfFireReleased) continue;
        if (obj.destroyed && !obj.group?.parent) continue;
        // Tank / AT shells punch through barns and other light rural timber;
        // Berlin tenements, factories, churches, and masonry walls still stop them.
        if (
          strictDirectShell &&
          SHELL_PENETRABLE_BUILDING_KINDS.has(obj.kind)
        ) {
          continue;
        }
        // Occupants may fire out through their own windows. Only small arms may
        // engage a visible lookout in the target building; AT/tank shells must
        // treat intact heavy structures as solid masonry rather than pass through.
        if (attacker._garrisonBunkerId === obj.id) continue;
        if (
          target._garrisonBunkerId === obj.id &&
          GARRISON_WINDOW_ENGAGEMENT_TYPES.has(attacker.def?.type)
        ) continue;
        // Deliberate attack on this building — never self-block.
        if (targetBuilding && obj === targetBuilding) continue;

        const entryT = this._segmentBuildingEntryT(
          ray.ax,
          ray.az,
          ray.bx,
          ray.bz,
          obj,
          footprintMargin
        );
        // Endpoint tolerance avoids treating a unit merely brushing a façade as
        // being hidden behind the whole structure. Direct shells are deliberately
        // strict: a clipped/overlapping AT gun must not fire out through masonry.
        if (entryT == null) continue;
        if (!strictDirectShell && (entryT <= 0.015 || entryT >= 0.985)) continue;
        // Lateral corridor samples only count mid-ray hits. A sample that starts
        // inside a roadside façade must not cancel an otherwise clear street shot.
        if (ray.lateral && (entryT <= 0.04 || entryT >= 0.96)) continue;
        // Building fire missions: only occluders hit before the ordered target.
        if (
          targetBuilding &&
          targetHitT != null &&
          entryT >= targetHitT - 0.02
        ) {
          continue;
        }
        if (entryT < nearestEntryT) {
          nearest = obj;
          nearestEntryT = entryT;
        }
      }
      // Centreline hit is enough; keep scanning lateral rays only while clear.
      if (nearest && !ray.lateral) return nearest;
    }
    return nearest;
  }

  isLineOfFireBlocked(attacker, target) {
    return this.getLineOfFireBlocker(attacker, target) !== null;
  }

  /**
   * True if the XZ segment intersects any intact building footprint
   * (expanded by radius). Used by pathfinding for all ground units.
   * @param {{ allowBuildingId?: string|null }} [options]
   */
  segmentHitsBuilding(ax, az, bx, bz, radius = 1.8, options = {}) {
    const allowBuildingId = options.allowBuildingId ?? null;
    const allowTrackedBuildingCrush = options.allowTrackedBuildingCrush === true;
    const minX = Math.min(ax, bx) - radius;
    const maxX = Math.max(ax, bx) + radius;
    const minZ = Math.min(az, bz) - radius;
    const maxZ = Math.max(az, bz) + radius;
    for (const obj of this.objects) {
      if (obj.destroyed || !BUILDING_KINDS.has(obj.kind)) continue;
      if (allowTrackedBuildingCrush && TRACKED_CRUSHABLE_BUILDING_KINDS.has(obj.kind)) {
        continue;
      }
      if (obj.lineOfFireReleased) continue;
      if (allowBuildingId && obj.id === allowBuildingId) continue;
      const frame = this._buildingLocalFrame(obj, radius);
      if (!frame) continue;
      if (
        obj.x + frame.worldExtent < minX ||
        obj.x - frame.worldExtent > maxX ||
        obj.z + frame.worldExtent < minZ ||
        obj.z - frame.worldExtent > maxZ
      ) {
        continue;
      }
      const entryT = this._segmentBuildingEntryT(ax, az, bx, bz, obj, radius);
      if (entryT != null && entryT >= 0 && entryT <= 1) return true;
    }
    return false;
  }

  damageAt(x, z, radius, damage, options = {}) {
    if (!damage || damage <= 0) return;
    for (const obj of this.objects) {
      if (obj.destroyed) continue;
      const d = Math.hypot(obj.x - x, obj.z - z);
      if (d > radius + obj.radius) continue;
      const falloff = 1 - d / (radius + obj.radius);
      this.damageObject(obj, damage * Math.max(0.35, falloff), {
        ...options,
        impact: options.impact ?? { x, z },
      });
    }
  }

  damageObject(obj, damage, options = {}) {
    if (!obj || obj.destroyed || damage <= 0) return;
    const buildingImpact = BUILDING_KINDS.has(obj.kind)
      ? this._addBuildingImpactMark(obj, damage, options)
      : null;
    if (buildingImpact) this._spawnBuildingHitEffects(obj, buildingImpact, options);
    obj.hp = Math.max(0, obj.hp - damage);
    this._updateDamageVisual(obj);
    if (obj.hp <= 0) {
      const source = options.impactFrom ?? options.impact;
      this.destroyObject(obj, {
        effects: isExplosiveImpact(options),
        directionX: source ? obj.x - source.x : 0,
        directionZ: source ? obj.z - source.z : 0,
      });
    }
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

  /**
   * Intact building whose footprint overlaps a unit placed at this point.
   * @param {{ allowBuildingId?: string|null }} [options] — skip this building (garrison enter order)
   */
  getUnitPlacementBlocker(x, z, unitRadius = 1.8, options = {}) {
    const allowBuildingId = options.allowBuildingId ?? null;
    const allowTrackedBuildingCrush = options.allowTrackedBuildingCrush === true;
    for (const obj of this.objects) {
      // Placement is stricter than movement/crushing: guns and vehicles may
      // never begin inside even a small outbuilding or courtyard wall.
      if (obj.destroyed || !BUILDING_KINDS.has(obj.kind)) continue;
      if (allowTrackedBuildingCrush && TRACKED_CRUSHABLE_BUILDING_KINDS.has(obj.kind)) {
        continue;
      }
      if (allowBuildingId && obj.id === allowBuildingId) continue;
      const bounds = this._buildingFootprint(obj);
      const yaw = obj.group.rotation.y;
      const cos = Math.cos(yaw);
      const sin = Math.sin(yaw);
      const dx = x - obj.x;
      const dz = z - obj.z;
      const scaleX = Math.max(0.01, obj.baseScale?.x ?? obj.group.scale.x ?? 1);
      const scaleZ = Math.max(0.01, obj.baseScale?.z ?? obj.group.scale.z ?? 1);
      const localX = (cos * dx - sin * dz) / scaleX;
      const localZ = (sin * dx + cos * dz) / scaleZ;
      const halfWidth = bounds.width * 0.5 + unitRadius / scaleX;
      const halfDepth = bounds.depth * 0.5 + unitRadius / scaleZ;
      if (Math.abs(localX) <= halfWidth && Math.abs(localZ) <= halfDepth) return obj;
    }
    return null;
  }

  /** True when a vehicle or crew-served gun would spawn inside any building. */
  isVehiclePlacementBlocked(x, z, vehicleRadius = 1.8, options = {}) {
    return this.getUnitPlacementBlocker(x, z, vehicleRadius, options) !== null;
  }

  /**
   * True when a point lies over the released footprint of a destroyed building.
   * Berlin vehicle orders use this to distinguish traversable rubble from an
   * ordinary off-road click that should still resolve to the street network.
   */
  isDestroyedBuildingFootprint(x, z, margin = 0) {
    for (const obj of this.objects) {
      if (!obj.destroyed || !BUILDING_KINDS.has(obj.kind)) continue;
      const frame = this._buildingLocalFrame(obj, margin);
      if (!frame) continue;
      const dx = x - obj.x;
      const dz = z - obj.z;
      const localX = (frame.cos * dx - frame.sin * dz) / frame.scaleX;
      const localZ = (frame.sin * dx + frame.cos * dz) / frame.scaleZ;
      if (Math.abs(localX) <= frame.halfW && Math.abs(localZ) <= frame.halfD) {
        return true;
      }
    }
    return false;
  }

  /** Ground movement blocked by intact masonry (all units unless allowed to enter). */
  isMovementBlocked(x, z, radius = 1.0, options = {}) {
    return this.getUnitPlacementBlocker(x, z, radius, options) !== null;
  }

  /**
   * True when trenches, sandbags, bunkers, or other field works would sit inside
   * solid masonry (urban tenements, farmhouses, courtyard walls, etc.).
   */
  isFieldWorksPlacementBlocked(x, z, radius = 1.55) {
    return this.getUnitPlacementBlocker(x, z, radius) !== null;
  }

  /** Deterministic outward search for the nearest street/courtyard vehicle spawn. */
  findClearVehiclePlacement(x, z, vehicleRadius = 1.8, mapDef = this.mapDef) {
    if (!this.isVehiclePlacementBlocked(x, z, vehicleRadius)) return { x, z };
    const half = Math.max(8, (mapDef?.size ?? 120) * 0.5 - vehicleRadius - 1);
    const step = Math.max(2.6, vehicleRadius * 1.35);
    const startAngle = seededPlacementAngle(x, z);
    for (let ring = 1; ring <= 18; ring++) {
      const candidateCount = Math.max(12, ring * 6);
      for (let i = 0; i < candidateCount; i++) {
        const angle = startAngle + (i / candidateCount) * Math.PI * 2;
        const candidateX = THREE.MathUtils.clamp(x + Math.cos(angle) * step * ring, -half, half);
        const candidateZ = THREE.MathUtils.clamp(z + Math.sin(angle) * step * ring, -half, half);
        if (!this.isVehiclePlacementBlocked(candidateX, candidateZ, vehicleRadius)) {
          return { x: candidateX, z: candidateZ };
        }
      }
    }
    // Rare dense-block fallback: scan the whole playable area rather than ever
    // returning the known-invalid requested coordinates.
    const gridStep = Math.max(3, vehicleRadius * 1.5);
    let nearest = null;
    let nearestDistanceSq = Infinity;
    for (let candidateZ = -half; candidateZ <= half; candidateZ += gridStep) {
      for (let candidateX = -half; candidateX <= half; candidateX += gridStep) {
        if (this.isVehiclePlacementBlocked(candidateX, candidateZ, vehicleRadius)) continue;
        const distanceSq = (candidateX - x) ** 2 + (candidateZ - z) ** 2;
        if (distanceSq < nearestDistanceSq) {
          nearest = { x: candidateX, z: candidateZ };
          nearestDistanceSq = distanceSq;
        }
      }
    }
    if (nearest) return nearest;
    return null;
  }

  /** Allow shallow edge scrapes, but stop vehicles that penetrate an intact building. */
  blockVehicleAtBuildings(unit, beforeX, beforeZ, vehicleRadius = 1.8, options = {}) {
    if (!unit?.position) return null;
    const candidateX = unit.position.x;
    const candidateZ = unit.position.z;
    for (const obj of this.objects) {
      // Rubble is persistent scenery, but no longer retains the original
      // building's invisible collision footprint.
      if (obj.destroyed || !VEHICLE_BLOCKING_BUILDING_KINDS.has(obj.kind)) continue;
      if (
        options.vehicleClass === 'tracked' &&
        TRACKED_CRUSHABLE_BUILDING_KINDS.has(obj.kind)
      ) {
        continue;
      }
      const bounds = this._buildingFootprint(obj);
      const yaw = obj.group.rotation.y;
      const cos = Math.cos(yaw);
      const sin = Math.sin(yaw);
      const dx = candidateX - obj.x;
      const dz = candidateZ - obj.z;
      const scaleX = Math.max(0.01, obj.baseScale?.x ?? obj.group.scale.x ?? 1);
      const scaleZ = Math.max(0.01, obj.baseScale?.z ?? obj.group.scale.z ?? 1);
      const localX = (cos * dx - sin * dz) / scaleX;
      const localZ = (sin * dx + cos * dz) / scaleZ;
      const halfWidth = bounds.width * 0.5;
      const halfDepth = bounds.depth * 0.5;
      const closestX = THREE.MathUtils.clamp(localX, -halfWidth, halfWidth);
      const closestZ = THREE.MathUtils.clamp(localZ, -halfDepth, halfDepth);
      const offsetX = (localX - closestX) * scaleX;
      const offsetZ = (localZ - closestZ) * scaleZ;
      const distanceToFootprint = Math.hypot(offsetX, offsetZ);
      if (distanceToFootprint > vehicleRadius) continue;

      const centerInside =
        Math.abs(localX) <= halfWidth && Math.abs(localZ) <= halfDepth;
      const penetration = centerInside ? vehicleRadius : vehicleRadius - distanceToFootprint;
      const edgeClipAllowance = THREE.MathUtils.clamp(vehicleRadius * 0.32, 0.42, 0.72);
      const shallowEdgeClip = !centerInside && penetration <= edgeClipAllowance;

      const contactLocalX = closestX * scaleX;
      const contactLocalZ = closestZ * scaleZ;
      const contactX = obj.x + cos * contactLocalX + sin * contactLocalZ;
      const contactZ = obj.z - sin * contactLocalX + cos * contactLocalZ;

      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (obj._lastVehicleClipAt == null || now - obj._lastVehicleClipAt >= 420) {
        obj._lastVehicleClipAt = now;
        const chipDamage = options.vehicleClass === 'light' ? 3.5 : shallowEdgeClip ? 5.5 : 7.5;
        this.damageObject(obj, chipDamage, {
          collision: true,
          weaponType: 'vehicleCollision',
          impact: { x: contactX, z: contactZ },
          impactFrom: { x: beforeX, z: beforeZ },
        });
      }

      // A glancing track/wheel overlap chips the corner or façade but retains
      // the vehicle's movement. Deeper contact still restores its last safe
      // position so intact buildings cannot be driven through.
      if (shallowEdgeClip) continue;
      unit.position.x = beforeX;
      unit.position.z = beforeZ;
      return obj;
    }
    return null;
  }

  _updateDamageVisual(obj) {
    // Structural damage swaps façade cells and adds breaches; it never changes footprint or height.
    if (BUILDING_KINDS.has(obj.kind) && obj.baseScale) {
      obj.group.scale.copy(obj.baseScale);
    }
    const ratio = obj.maxHp > 0 ? obj.hp / obj.maxHp : 0;
    if (!obj._meshRefs) {
      obj._meshRefs = [];
      obj.group.traverse((c) => {
        if (c.isMesh && c.material?.color && !c.userData.damageMark) {
          obj._meshRefs.push({
            mesh: c,
            base: c.material.color.clone(),
          });
        }
      });
    }
    const wear = 1 - ratio;
    for (const { mesh, base } of obj._meshRefs) {
      mesh.material.color.copy(base).lerp(_scorch, wear * 0.32);
      if (mesh.material.emissive) {
        mesh.material.emissive.setHex(wear > 0.58 ? 0x24150d : 0x000000);
        mesh.material.emissiveIntensity = wear * 0.12;
      }
    }
    const stage = Math.min(5, Math.floor(wear * 6));
    if (stage !== obj._damageStage) {
      obj._damageStage = stage;
      obj.group.userData.applyDamageStage?.(stage);
    }
  }

  _addBuildingImpactMark(obj, damage, options) {
    const explosive = isExplosiveImpact(options);
    const collision = options.collision === true;
    const marks = obj._impactMarks ?? (obj._impactMarks = []);
    const counts = obj._impactMarkCounts ?? (obj._impactMarkCounts = { bullet: 0, shell: 0 });

    const footprint = this._buildingFootprint(obj);
    const bounds = {
      width: Math.max(2.4, footprint.width),
      depth: Math.max(2.4, footprint.depth),
      height:
        obj.group.userData.damageBounds?.height ?? Math.max(2.5, obj.radius * 1.35),
    };
    const source = options.impactFrom ?? options.impact;
    const yaw = obj.group.rotation.y;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const scaleX = Math.max(0.01, obj.baseScale?.x ?? obj.group.scale.x ?? 1);
    const scaleZ = Math.max(0.01, obj.baseScale?.z ?? obj.group.scale.z ?? 1);
    const impactPoint = options.impact;
    let roofLocalX = 0;
    let roofLocalZ = 0;
    if (impactPoint) {
      const impactDx = impactPoint.x - obj.x;
      const impactDz = impactPoint.z - obj.z;
      roofLocalX = (cos * impactDx - sin * impactDz) / scaleX;
      roofLocalZ = (sin * impactDx + cos * impactDz) / scaleZ;
    }
    const roofHit =
      !collision &&
      !!impactPoint &&
      ROOF_DIRECT_HIT_WEAPON_TYPES.has(options.weaponType) &&
      Math.abs(roofLocalX) <= bounds.width * 0.47 &&
      Math.abs(roofLocalZ) <= bounds.depth * 0.47;
    const countKey = roofHit
      ? options.weaponType === 'strafe' ? 'roofBullet' : 'roofShell'
      : collision ? 'collision' : explosive ? 'shell' : 'bullet';
    const maxMarks = roofHit
      ? options.weaponType === 'strafe' ? 18 : 8
      : collision ? 14 : explosive ? 10 : 30;
    const canAddMark = (counts[countKey] ?? 0) < maxMarks;

    let worldX = source ? source.x - obj.x : Math.random() - 0.5;
    let worldZ = source ? source.z - obj.z : Math.random() - 0.5;
    if (Math.hypot(worldX, worldZ) < 0.01) {
      const angle = Math.random() * Math.PI * 2;
      worldX = Math.cos(angle);
      worldZ = Math.sin(angle);
    }
    const localX = cos * worldX - sin * worldZ;
    const localZ = sin * worldX + cos * worldZ;
    const position = new THREE.Vector3();
    const normal = new THREE.Vector3();
    let rotationY = 0;
    if (roofHit) {
      const profile = obj.group.userData.roofDamageProfile;
      let roofY;
      if (typeof profile?.heightAt === 'function') {
        roofY = profile.heightAt(roofLocalX, roofLocalZ);
      } else if (profile?.style === 'gable') {
        const halfRoofDepth = Math.max(0.5, (profile.depth ?? bounds.depth) * 0.5);
        roofY =
          (profile.bodyHeight ?? bounds.height) +
          (profile.roofHeight ?? 0.6) * Math.max(0, 1 - Math.abs(roofLocalZ) / halfRoofDepth) +
          0.06;
      } else {
        roofY = (profile?.bodyHeight ?? bounds.height) + (profile?.roofHeight ?? 0.2) + 0.06;
      }
      position.set(roofLocalX, roofY, roofLocalZ);
      if (typeof profile?.normalAt === 'function') {
        const roofNormal = profile.normalAt(roofLocalX, roofLocalZ);
        normal.set(roofNormal?.x ?? 0, roofNormal?.y ?? 1, roofNormal?.z ?? 0).normalize();
      } else if (profile?.style === 'gable') {
        const halfRoofDepth = Math.max(0.5, (profile.depth ?? bounds.depth) * 0.5);
        normal.set(
          0,
          1,
          Math.sign(roofLocalZ) * (profile.roofHeight ?? 0.6) / halfRoofDepth
        ).normalize();
      } else {
        normal.set(0, 1, 0);
      }
      position.addScaledVector(normal, 0.025);
    } else if (Math.abs(localX) > Math.abs(localZ)) {
      const side = Math.sign(localX) || 1;
      position.set(
        side * (bounds.width * 0.5 + 0.018),
        bounds.height * (0.18 + Math.random() * 0.66),
        (Math.random() - 0.5) * bounds.depth * 0.72
      );
      normal.set(side, 0, 0);
      rotationY = side > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
    } else {
      const side = Math.sign(localZ) || 1;
      position.set(
        (Math.random() - 0.5) * bounds.width * 0.76,
        bounds.height * (0.18 + Math.random() * 0.66),
        side * (bounds.depth * 0.5 + 0.018)
      );
      normal.set(0, 0, side);
      rotationY = side > 0 ? 0 : Math.PI;
    }

    const baseRadius = collision
      ? THREE.MathUtils.clamp(0.2 + damage * 0.012, 0.24, 0.42)
      : explosive
      ? THREE.MathUtils.clamp(0.32 + damage * 0.009, 0.42, 0.95)
      : THREE.MathUtils.clamp(0.075 + damage * 0.0035, 0.09, 0.2);
    const impact = {
      position: position.clone(),
      normal,
      radius: baseRadius,
      explosive,
      collision,
      roofHit,
    };
    if (!canAddMark) return impact;
    const mark = new THREE.Group();
    mark.name = roofHit
      ? options.weaponType === 'strafe' ? 'roofStrafePuncture' : 'roofShellCrater'
      : collision ? 'vehicleChip' : explosive ? 'shellBreach' : 'bulletHole';
    mark.position.copy(position);
    if (roofHit) {
      // RingGeometry faces local +Z. Align it with the actual pitched roof
      // normal, then randomise around that normal without introducing z-fight.
      mark.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
      mark.rotateZ(Math.random() * Math.PI * 2);
    } else {
      mark.rotation.y = rotationY;
      mark.rotation.z = (Math.random() - 0.5) * (explosive ? 0.48 : 0.18);
    }
    mark.userData.damageMark = true;
    mark.userData.roofDamage = roofHit;

    const chipMat = new THREE.MeshBasicMaterial({
      color: explosive ? 0x685b4d : collision ? 0x746858 : 0x9a8d78,
      transparent: true,
      opacity: explosive ? 0.94 : 0.82,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    const holeMat = new THREE.MeshBasicMaterial({
      color: explosive ? 0x171310 : collision ? 0x322b24 : 0x181713,
      transparent: true,
      opacity: explosive ? 0.97 : 0.92,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -5,
      polygonOffsetUnits: -5,
    });
    const chip = new THREE.Mesh(
      new THREE.RingGeometry(baseRadius * (explosive ? 0.52 : 0.42), baseRadius, explosive ? 10 : 7),
      chipMat
    );
    const hole = new THREE.Mesh(
      new THREE.CircleGeometry(baseRadius * (explosive ? 0.56 : 0.45), explosive ? 10 : 7),
      holeMat
    );
    chip.userData.damageMark = true;
    hole.userData.damageMark = true;
    chip.renderOrder = 3;
    hole.position.z = 0.004;
    hole.renderOrder = 4;
    mark.add(chip, hole);
    if (roofHit) {
      const roofDebrisMat = new THREE.MeshStandardMaterial({
        color: options.weaponType === 'strafe' ? 0x514943 : 0x66584c,
        roughness: 0.98,
        envMapIntensity: 0.14,
      });
      const detailCount = options.weaponType === 'strafe' ? 3 : 8;
      for (let i = 0; i < detailCount; i++) {
        const angle = (i / detailCount) * Math.PI * 2 + Math.random() * 0.45;
        const distance = baseRadius * (0.72 + Math.random() * 0.48);
        const fragment = new THREE.Mesh(
          i % 2 === 0
            ? new THREE.BoxGeometry(baseRadius * 0.2, baseRadius * 0.12, 0.055)
            : new THREE.DodecahedronGeometry(baseRadius * 0.1, 0),
          roofDebrisMat
        );
        fragment.position.set(Math.cos(angle) * distance, Math.sin(angle) * distance, 0.045);
        fragment.rotation.set(Math.random(), Math.random(), Math.random());
        fragment.userData.damageMark = true;
        fragment.castShadow = true;
        mark.add(fragment);
      }
      if (options.weaponType !== 'strafe') {
        const rafterMat = new THREE.MeshStandardMaterial({
          color: 0x33231b,
          roughness: 0.97,
        });
        for (let i = -1; i <= 1; i++) {
          const rafter = new THREE.Mesh(
            new THREE.BoxGeometry(baseRadius * 1.45, 0.075, 0.065),
            rafterMat
          );
          rafter.position.set(0, i * baseRadius * 0.28, 0.035);
          rafter.rotation.z = (Math.random() - 0.5) * 0.3;
          rafter.userData.damageMark = true;
          rafter.castShadow = true;
          mark.add(rafter);
        }
      }
    }
    obj.group.add(mark);
    marks.push(mark);
    counts[countKey] = (counts[countKey] ?? 0) + 1;
    return impact;
  }

  _spawnBuildingHitEffects(obj, impact, options) {
    const worldPosition = obj.group.localToWorld(impact.position.clone());
    const worldNormal = impact.normal.clone().applyQuaternion(obj.group.quaternion).normalize();
    worldPosition.addScaledVector(worldNormal, impact.radius * 0.34);
    if (impact.collision) {
      spawnBuildingDamageDust(
        this.scene,
        worldPosition,
        impact.radius * 1.25,
        { x: worldNormal.x, z: worldNormal.z }
      );
      this._spawnImpactDebris(obj, worldPosition, worldNormal, impact.radius, 4);
    } else if (impact.explosive) {
      spawnBuildingDamageDust(
        this.scene,
        worldPosition,
        impact.radius * 1.45,
        { x: worldNormal.x, z: worldNormal.z }
      );
      this._spawnImpactDebris(obj, worldPosition, worldNormal, impact.radius);
    } else if (impact.roofHit) {
      spawnBuildingDamageDust(
        this.scene,
        worldPosition,
        Math.max(0.24, impact.radius * 1.35),
        { x: 0, z: 0 }
      );
      this._spawnImpactDebris(obj, worldPosition, worldNormal, impact.radius, 3);
    } else if (Math.random() < 0.18) {
      spawnBuildingDamageDust(
        this.scene,
        worldPosition,
        Math.max(0.22, impact.radius * 1.75),
        { x: worldNormal.x, z: worldNormal.z }
      );
    }
  }

  _spawnImpactDebris(obj, worldPosition, worldNormal, radius, requestedCount = null) {
    obj._impactDebrisBursts = obj._impactDebrisBursts ?? 0;
    if (obj._impactDebrisBursts >= 6) return;
    obj._impactDebrisBursts++;

    const group = new THREE.Group();
    group.name = 'buildingImpactDebris';
    const masonry = new THREE.MeshStandardMaterial({
      color: obj.kind === 'factory' ? 0x815a47 : 0x8b8171,
      roughness: 0.98,
      envMapIntensity: 0.18,
    });
    const pieceCount = requestedCount ?? 7 + Math.floor(Math.random() * 5);
    const pieces = [];
    for (let i = 0; i < pieceCount; i++) {
      const size = Math.max(0.07, radius * (0.1 + Math.random() * 0.16));
      const mesh = new THREE.Mesh(
        i % 3 === 0
          ? new THREE.DodecahedronGeometry(size, 0)
          : new THREE.BoxGeometry(size * 1.25, size * 0.72, size),
        masonry
      );
      mesh.position.copy(worldPosition);
      mesh.position.x += (Math.random() - 0.5) * radius * 0.45;
      mesh.position.y += (Math.random() - 0.5) * radius * 0.32;
      mesh.position.z += (Math.random() - 0.5) * radius * 0.45;
      mesh.rotation.set(Math.random(), Math.random() * Math.PI, Math.random());
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      pieces.push({
        mesh,
        velocity: new THREE.Vector3(
          worldNormal.x * (0.9 + Math.random() * 1.8) + (Math.random() - 0.5) * 1.8,
          1.1 + Math.random() * 2.8,
          worldNormal.z * (0.9 + Math.random() * 1.8) + (Math.random() - 0.5) * 1.8
        ),
        spin: new THREE.Vector3(
          (Math.random() - 0.5) * 7,
          (Math.random() - 0.5) * 7,
          (Math.random() - 0.5) * 7
        ),
        settled: false,
      });
    }
    this.scene.add(group);
    this.impactDebrisAnimations.push({
      group,
      pieces,
      groundY: obj.group.position.y + 0.09,
      elapsed: 0,
      duration: 1.55,
    });
  }

  destroyObject(
    obj,
    { effects = true, crushed = false, directionX = 0, directionZ = 0, instant = false } = {}
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
      if (instant) {
        this._spawnBuildingRubble(obj, { crushed });
        obj.lineOfFireReleased = true;
        this._removeAndDisposeGroup(obj.group);
        return;
      }
      this._beginBuildingCollapse(obj, directionX, directionZ, { crushed });
      return;
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
      (!this.crushAnimations.length &&
        !this.buildingCollapseAnimations.length &&
        !this.impactDebrisAnimations.length) ||
      !Number.isFinite(dt) ||
      dt <= 0
    ) return;
    const step = Math.min(dt, 0.05);

    for (let i = this.impactDebrisAnimations.length - 1; i >= 0; i--) {
      const anim = this.impactDebrisAnimations[i];
      anim.elapsed += step;
      for (const piece of anim.pieces) {
        if (piece.settled) continue;
        piece.velocity.y -= 8.8 * step;
        piece.mesh.position.addScaledVector(piece.velocity, step);
        piece.mesh.rotation.x += piece.spin.x * step;
        piece.mesh.rotation.y += piece.spin.y * step;
        piece.mesh.rotation.z += piece.spin.z * step;
        if (piece.mesh.position.y <= anim.groundY) {
          piece.mesh.position.y = anim.groundY;
          if (Math.abs(piece.velocity.y) > 1.05) {
            piece.velocity.y *= -0.24;
            piece.velocity.x *= 0.56;
            piece.velocity.z *= 0.56;
          } else {
            piece.velocity.set(0, 0, 0);
            piece.settled = true;
          }
        }
      }
      if (anim.elapsed >= anim.duration || anim.pieces.every((piece) => piece.settled)) {
        this.rubble.push(anim.group);
        this.impactDebrisAnimations.splice(i, 1);
      }
    }

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
        anim.group.rotation.x = anim.startRotation.x + anim.localDz * buckle * 0.16;
        anim.group.rotation.z = anim.startRotation.z - anim.localDx * buckle * 0.16;
        anim.group.position.x = anim.startPosition.x + anim.dx * buckle * 0.24;
        anim.group.position.z = anim.startPosition.z + anim.dz * buckle * 0.24;

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
        this._spawnCollapseDust(anim, 1.45);
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
        anim.obj.lineOfFireReleased = true;
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

  _beginBuildingCollapse(obj, directionX = 0, directionZ = 0, { crushed = false } = {}) {
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
    const localDx = cos * dx - sin * dz;
    const localDz = sin * dx + cos * dz;
    const rubble = this._spawnBuildingRubble(obj, { visible: false, crushed });
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
        mesh.name === 'buildingWall' ||
        mesh.name === 'buildingInterior' ||
        mesh.name === 'buildingTower' ||
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
        drop: Math.max(0.75, mesh.position.y * 0.62) + Math.random() * 0.65,
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
      duration: obj.kind === 'barn' ? 1.18 : 0.98,
      elapsed: 0,
      rubbleRevealed: false,
      shellRemoved: false,
    };
    this.buildingCollapseAnimations.push(anim);
    this._spawnCollapseDust(anim, 1.05);
  }

  _spawnCollapseDust(anim, scale = 1) {
    const { x, y, z } = anim.startPosition;
    spawnCollapseDust(
      this.scene,
      { x, y: y + 0.04, z },
      (anim.obj.radius ?? 3) * 0.72 * scale,
      { x: anim.dx, z: anim.dz }
    );
    spawnBuildingDamageDust(
      this.scene,
      { x, y: y + Math.max(0.7, (anim.obj.radius ?? 3) * 0.32), z },
      (anim.obj.radius ?? 3) * 0.32 * scale,
      { x: anim.dx, z: anim.dz },
      { heavy: true }
    );
  }

  _removeAndDisposeGroup(group) {
    if (!group) return;
    if (group.parent) this.scene.remove(group);
    group.traverse((child) => {
      if (child.userData.garrisonSharedVisual) return;
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
      color: crushed ? 0x716858 : 0x6c6357,
      roughness: 0.94,
      metalness: 0.04,
      envMapIntensity: 0.28,
    });
    const timberMat = new THREE.MeshStandardMaterial({
      color: crushed ? 0x493428 : 0x463429,
      roughness: 0.9,
      envMapIntensity: 0.22,
    });
    const dustMat = new THREE.MeshStandardMaterial({
      color: crushed ? 0x62594c : 0x5d574e,
      roughness: 0.98,
      envMapIntensity: 0.18,
    });

    const radius = obj.radius ?? 3;
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.58, radius * 0.79, 0.2, 18),
      dustMat
    );
    base.position.y = 0.055;
    base.scale.z = 0.64;
    base.castShadow = false;
    base.receiveShadow = true;
    base.userData.rubbleBase = true;
    rubble.add(base);

    const chunks = obj.kind === 'urbanWall' ? 12 : obj.kind === 'barn' ? 24 : 34;
    for (let i = 0; i < chunks; i++) {
      const mat = i % 3 === 0 ? timberMat : stoneMat;
      const chunk = new THREE.Mesh(
        new THREE.BoxGeometry(0.35 + Math.random() * 0.8, 0.18 + Math.random() * 0.42, 0.3 + Math.random() * 0.85),
        mat
      );
      const ang = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * radius * 0.9;
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
    for (const anim of this.impactDebrisAnimations) {
      this._removeAndDisposeGroup(anim.group);
    }
    this.objects = [];
    this.rubble = [];
    this.crushAnimations = [];
    this.buildingCollapseAnimations = [];
    this.impactDebrisAnimations = [];
  }
}
