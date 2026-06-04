import { spawnMuzzleFlash } from '../units/UnitMeshes.js';
import { sampleTerrainHeight, hasReachedMoveDest, advanceUnitOnTerrain } from '../world/Terrain.js';
import { advanceMovePath } from './MovePath.js';
import { addTerrainCrater } from '../world/TerrainDamage.js';
import {
  distanceBetween,
  distanceToPoint,
  isInRange,
  isPointInRange,
  getStandoffPosition,
  findNearestEnemyInRange,
  filterAcquireNearAttacker,
} from './Targeting.js';
import { getIncomingDamageMultiplier } from './CoverSystem.js';
import { getArmorDamageMultiplier } from './ClearanceMode.js';
import { maybeTriggerRetreat, clearRetreat } from './RetreatBehavior.js';
import { isSceneryTarget } from './SceneryTarget.js';
import { getStructureDamageMultiplier } from './StructureDamage.js';
import { getMoveReachConfig, isTankType } from '../units/VehicleTypes.js';


const SMALL_ARMS_TYPES = new Set(['infantry', 'machineGun', 'sniper', 'armoredCar']);

/** Skip VFX for distant AI units to keep frame time stable. */
function shouldSpawnVfx(attacker, listenerX, listenerZ) {
  const dx = attacker.position.x - listenerX;
  const dz = attacker.position.z - listenerZ;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (SMALL_ARMS_TYPES.has(attacker.def.type)) return dist < 200;
  return dist < 140;
}

export function tickUnitCooldowns(units, dt) {
  for (const unit of units) {
    if (unit.dead) continue;
    if (unit.attackCooldown > 0) unit.attackCooldown -= dt;
  }
}

export function updateCombat(
  units,
  hqs,
  dt,
  scene,
  mapDef,
  onFire,
  listener = null,
  coverSystem = null,
  enemyDamageMult = 0.88,
  scenery = null,
  options = {}
) {
  const protectPlayerHq = options.protectPlayerHq === true;
  const enemyCeasefire = options.enemyCeasefire === true;
  const openingCeasefire = options.openingCeasefire === true;
  /** Training Ground: do not auto-acquire the practice HQ (attack only on player order). */
  const tutorialPassiveNoHq = options.tutorialPassiveNoHq === true;

  const aliveUnits = units;
  if (aliveUnits.length === 0) return;
  const hqsInPlay = hqs.filter((h) => {
    if (h.dead) return false;
    if (protectPlayerHq && h.team === 'player') return false;
    return true;
  });
  const sceneryTargets = scenery?.getAttackTargets?.() ?? [];
  const targets = [...aliveUnits, ...hqsInPlay, ...sceneryTargets];
  const playerAlive = [];
  const enemyAlive = [];
  const playerHqs = [];
  const enemyHqs = [];
  for (const u of aliveUnits) {
    if (u.team === 'player') playerAlive.push(u);
    else if (u.team === 'enemy') enemyAlive.push(u);
  }
  for (const h of hqsInPlay) {
    if (h.team === 'player') playerHqs.push(h);
    else if (h.team === 'enemy') enemyHqs.push(h);
  }
  /** Auto-acquire lists — enemies only scan opposing forces (not every unit on the map). */
  const playerAutoAcquire = tutorialPassiveNoHq ? [] : [...enemyAlive, ...enemyHqs];
  const enemyAutoAcquire = [...playerAlive, ...playerHqs];
  const lx = listener?.x ?? 0;
  const lz = listener?.z ?? 0;

  for (const attacker of aliveUnits) {
    if (attacker.attackCooldown > 0 || attacker.retreating) continue;
    if (openingCeasefire) continue;
    if (enemyCeasefire && attacker.team === 'enemy') continue;

    const acquire =
      attacker.team === 'player' ? playerAutoAcquire : enemyAutoAcquire;
    const localAcquire = filterAcquireNearAttacker(attacker, acquire);
    const target = resolveAttackTarget(attacker, targets, localAcquire);
    if (!target) continue;

    attacker.target = target;

    const canFire = target.isGround
      ? isPointInRange(attacker, target.position)
      : isInRange(attacker, target);

    if (!canFire) continue;

    if (!attacker._userMoveOrder) {
      if (attacker.moveTarget && attacker.attackOrder && !target.isGround) {
        const standoff = getStandoffPosition(attacker, target);
        const reach = getMoveReachConfig(attacker.def.type);
        if (hasReachedMoveDest(attacker, standoff, mapDef, reach.horiz * 0.85, reach.height * 0.85)) {
          attacker.moveTarget = null;
        }
      } else if (target.isGround && attacker.moveTarget) {
        attacker.moveTarget = null;
      }
    }

    faceTarget(attacker, target);
    fire(attacker, target, targets, scene, mapDef, onFire, lx, lz, coverSystem, enemyDamageMult, scenery, hqs, options);
    attacker.attackCooldown = 1 / attacker.def.attackSpeed;
  }
}

function isPracticeHq(target) {
  return target && !target.def && !target.isGround && target.team === 'enemy';
}

function scalePracticeHqDamage(target, damage, options) {
  const mult = options.practiceHqDamageMult ?? 1;
  if (mult >= 1 || !isPracticeHq(target)) return damage;
  return damage * mult;
}

function resolveAttackTarget(attacker, targets, acquireTargets) {
  if (attacker.attackOrder) {
    if (attacker.attackOrder.isGround) return attacker.attackOrder;
    if (!attacker.attackOrder.dead) {
      if (
        !isSceneryTarget(attacker.attackOrder) &&
        attacker.attackOrder.team === attacker.team
      ) {
        attacker.clearAttackOrder();
        return null;
      }
      return attacker.attackOrder;
    }
    attacker.clearAttackOrder();
  }

  if (attacker._userMoveOrder) return null;

  return findNearestEnemyInRange(attacker, acquireTargets, 1);
}

function faceTarget(unit, target) {
  const tx = target.position?.x ?? target.mesh.position.x;
  const tz = target.position?.z ?? target.mesh.position.z;
  const dx = tx - unit.position.x;
  const dz = tz - unit.position.z;
  unit.mesh.rotation.y = Math.atan2(dx, dz);
}

function fire(
  attacker,
  target,
  allTargets,
  scene,
  mapDef,
  onFire,
  listenerX,
  listenerZ,
  coverSystem,
  enemyDamageMult,
  scenery,
  hqs,
  options = {}
) {
  const map = attacker._mapDef || mapDef;
  const impact = target.isGround
    ? { x: target.position.x, z: target.position.z }
    : {
        x: target.position?.x ?? target.mesh.position.x,
        z: target.position?.z ?? target.mesh.position.z,
      };

  const dist = target.isGround
    ? distanceToPoint(attacker, impact)
    : distanceBetween(attacker, target);

  const falloff = Math.max(0.55, 1 - (dist / attacker.def.range) * 0.35);
  const paceMult = options.paceDamageMult ?? 1;
  let damage = attacker.def.damage * falloff * (0.88 + Math.random() * 0.24) * paceMult;
  if (attacker.def.type === 'sniper' && !target.isGround) {
    const rangeRatio = dist / Math.max(attacker.def.range, 1);
    if (rangeRatio > 0.45) damage *= 1.12 + (rangeRatio - 0.45) * 0.35;
  }
  if (attacker.team === 'enemy') damage *= enemyDamageMult;

  if (!target.isGround && !isSceneryTarget(target)) {
    damage *= getIncomingDamageMultiplier(target, coverSystem);
    damage *= getArmorDamageMultiplier(attacker.def.type, target);
  }
  if (isSceneryTarget(target)) {
    damage *= getStructureDamageMultiplier(attacker.def.type);
  }

  if (target.isGround) {
    applySplashDamage(attacker, impact, damage, allTargets, coverSystem, scenery, hqs, options);
    if (map && scene) {
      const t = attacker.def.type;
      if (t === 'artillery' || t === 'mortar') {
        addTerrainCrater(scene, map, impact.x, impact.z, {
          radius: t === 'artillery' ? 4.5 : 3.5,
          heavy: true,
        });
      }
    }
  } else if (isSceneryTarget(target)) {
    target.takeDamage(damage);
    if (target.dead && attacker.attackOrder === target) attacker.clearAttackOrder();
  } else {
    target.takeDamage(scalePracticeHqDamage(target, damage, options));
    if (!target.dead && hqs) maybeTriggerRetreat(target, hqs);
    if (scenery) {
      const ix = impact.x;
      const iz = impact.z;
      const r =
        attacker.def.type === 'artillery'
          ? 8
          : attacker.def.type === 'mortar'
            ? 6
            : isTankType(attacker.def.type)
              ? attacker.def.type === 'superHeavyTank'
                ? 5.5
                : 4.5
              : attacker.def.type === 'armoredCar'
                ? 3
                : 2;
      scenery.damageAt(ix, iz, r, damage * 0.55);
    }
  }

  const showVfx =
    attacker.team === 'player' || shouldSpawnVfx(attacker, listenerX, listenerZ);

  if (showVfx && scene) {
    const from = attacker.position.clone();
    if (map) from.y = sampleTerrainHeight(from.x, from.z, map) + 1;
    const toY = map ? sampleTerrainHeight(impact.x, impact.z, map) + 1 : 1;
    const to = { x: impact.x, y: toY, z: impact.z };
    spawnMuzzleFlash(scene, from, to, attacker.def.type);
  }

  if (onFire) {
    onFire({
      attacker,
      target,
      def: attacker.def,
      dist,
      killed: !target.isGround && target.dead,
      targetIsHQ: !target.isGround && !target.def && !isSceneryTarget(target),
      targetIsScenery: isSceneryTarget(target),
      groundImpact: target.isGround,
      from: attacker.position,
      to: impact,
    });
  }
}

function applySplashDamage(attacker, point, baseDamage, targets, coverSystem, scenery, hqs, options = {}) {
  const splash =
    attacker.def.type === 'artillery'
      ? 9
      : attacker.def.type === 'mortar'
        ? 6.5
        : isTankType(attacker.def.type)
          ? attacker.def.type === 'superHeavyTank'
            ? 5
            : 4
          : 2.5;

  if (scenery) {
    scenery.damageAt(point.x, point.z, splash + 1, baseDamage * 0.85);
  }

  for (const other of targets) {
    if (other.dead || other.team === attacker.team) continue;
    const dx = (other.position?.x ?? other.mesh.position.x) - point.x;
    const dz = (other.position?.z ?? other.mesh.position.z) - point.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > splash) continue;
    const t = 1 - d / splash;
    let splashDmg = baseDamage * t * t * 0.65;
    splashDmg *= getIncomingDamageMultiplier(other, coverSystem);
    splashDmg *= getArmorDamageMultiplier(attacker.def.type, other);
    other.takeDamage(scalePracticeHqDamage(other, splashDmg, options));
    if (!other.dead && hqs) maybeTriggerRetreat(other, hqs);
  }
}

export function updateMovement(units, dt, mapDef, hqs = [], options = {}) {
  for (const unit of units) {
    if (unit.dead) continue;

    if (unit.retreating) {
      const hq = hqs.find((h) => h.team === unit.team && !h.dead);
      if (!hq) {
        clearRetreat(unit);
        unit.moveTarget = null;
      } else {
        unit.moveTarget = { x: hq.position.x, z: hq.position.z };
        unit.clearAttackOrder();
      }
    }

    if (unit.attackOrder?.isGround && unit.moveTarget) {
      unit.clearAttackOrder();
    } else if (
      !unit._userMoveOrder &&
      !unit.retreating &&
      unit._chasingAttack &&
      unit.attackOrder &&
      !unit.attackOrder.dead &&
      isInRange(unit, unit.attackOrder)
    ) {
      unit.moveTarget = null;
      unit._chasingAttack = false;
    }

    if (
      !unit._userMoveOrder &&
      !unit.retreating &&
      unit._chasingAttack &&
      unit.attackOrder &&
      !unit.attackOrder.isGround &&
      !unit.attackOrder.dead
    ) {
      const dist = distanceBetween(unit, unit.attackOrder);
      const rangeSlack = unit.attackOrder.isScenery ? 1.05 : 0.88;
      if (dist > unit.def.range * rangeSlack) {
        unit.moveTarget = getStandoffPosition(unit, unit.attackOrder);
      } else if (isInRange(unit, unit.attackOrder)) {
        unit.moveTarget = null;
      }
    }

    if (!unit.moveTarget) continue;

    const dest = unit.moveTarget;

    const holdWhenFiring = ['tank', 'artillery', 'machineGun', 'mortar', 'sniper'];
    if (
      !unit._userMoveOrder &&
      !unit.retreating &&
      unit._chasingAttack &&
      unit.attackOrder &&
      !unit.attackOrder.isGround &&
      !unit.attackOrder.dead &&
      isInRange(unit, unit.attackOrder) &&
      holdWhenFiring.includes(unit.def.type)
    ) {
      unit.moveTarget = null;
      unit._chasingAttack = false;
      continue;
    }

    if (
      !unit._userMoveOrder &&
      unit.attackOrder?.isGround &&
      isPointInRange(unit, unit.attackOrder.position)
    ) {
      unit.moveTarget = null;
      unit._chasingAttack = false;
      continue;
    }

    advanceUnitOnTerrain(unit, dest, mapDef, dt);
    advanceMovePath(unit, mapDef);
    if (!unit.moveTarget) {
      unit._chasingAttack = false;
      continue;
    }
    unit._mapDef = mapDef;
  }
}