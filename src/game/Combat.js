import { spawnMuzzleFlash } from '../units/UnitMeshes.js';
import { sampleTerrainHeight, hasReachedMoveDest, advanceUnitOnTerrain } from '../world/Terrain.js';
import { advanceMovePath } from './MovePath.js';
import { addTerrainCrater } from '../world/TerrainDamage.js';
import {
  distanceBetween,
  distanceToPoint,
  isInRange,
  isInCoaxRange,
  isPointInRange,
  isCoaxSoftTarget,
  canEngageManualOrder,
  getGroundFireMoveDest,
  getStandoffPosition,
  tankCanEngageTarget,
  findNearestEnemyInRange,
  filterAcquireNearAttacker,
} from './Targeting.js';
import { getIncomingDamageMultiplier } from './CoverSystem.js';
import { getArmorDamageMultiplier } from './ClearanceMode.js';
import { maybeTriggerRetreat, clearRetreat } from './RetreatBehavior.js';
import { isSceneryTarget } from './SceneryTarget.js';
import { isDefenseTarget } from './DefenseTarget.js';
import { getStructureDamageMultiplier } from './StructureDamage.js';
import { getDefenseDamageMultForAttacker } from './DefenseStructures.js';
import { getMoveReachConfig, isTankType } from '../units/VehicleTypes.js';


const SMALL_ARMS_TYPES = new Set(['infantry', 'machineGun', 'sniper', 'armoredCar']);
const ARMOR_TARGET_TYPES = new Set(['tank', 'superHeavyTank', 'armoredCar']);

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
    if (unit.mgCooldown > 0) unit.mgCooldown -= dt;
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
  const defenseTargets = options.defenseTargets ?? [];
  const targets = [...aliveUnits, ...hqsInPlay, ...sceneryTargets, ...defenseTargets];
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
  const enemyAutoAcquire = [...playerAlive, ...playerHqs, ...defenseTargets];
  const lx = listener?.x ?? 0;
  const lz = listener?.z ?? 0;

  for (const attacker of aliveUnits) {
    if (attacker.retreating) continue;
    if (
      attacker.def.type === 'medic' ||
      attacker.def.type === 'engineer' ||
      attacker.def.nonCombat ||
      attacker.def.damage <= 0
    )
      continue;
    if (openingCeasefire) continue;
    if (enemyCeasefire && attacker.team === 'enemy') continue;

    const acquire =
      attacker.team === 'player' ? playerAutoAcquire : enemyAutoAcquire;
    const localAcquire = filterAcquireNearAttacker(attacker, acquire);
    const target = resolveAttackTarget(attacker, targets, localAcquire);
    if (!target) continue;

    attacker.target = target;

    const canFireMain = target.isGround
      ? isPointInRange(attacker, target.position)
      : isInRange(attacker, target);
    const canFireCoax =
      !target.isGround && isTankType(attacker.def.type) && isInCoaxRange(attacker, target);
    const coaxHandlesSoft =
      canFireCoax && isCoaxSoftTarget(target) && attacker.def.coaxMG;

    if (!canFireMain && !canFireCoax) continue;

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

    if (canFireCoax && attacker.def.coaxMG && attacker.mgCooldown <= 0) {
      fire(
        attacker,
        target,
        targets,
        aliveUnits,
        scene,
        mapDef,
        onFire,
        lx,
        lz,
        coverSystem,
        enemyDamageMult,
        scenery,
        hqs,
        options,
        { coax: true }
      );
      attacker.mgCooldown = 1 / attacker.def.coaxMG.attackSpeed;
    }

    const fireMainGun =
      canFireMain &&
      attacker.attackCooldown <= 0 &&
      !coaxHandlesSoft;

    if (!fireMainGun) continue;

    fire(
      attacker,
      target,
      targets,
      aliveUnits,
      scene,
      mapDef,
      onFire,
      lx,
      lz,
      coverSystem,
      enemyDamageMult,
      scenery,
      hqs,
      options
    );
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
        !isDefenseTarget(attacker.attackOrder) &&
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
  livingUnits,
  scene,
  mapDef,
  onFire,
  listenerX,
  listenerZ,
  coverSystem,
  enemyDamageMult,
  scenery,
  hqs,
  options = {},
  fireOpts = {}
) {
  const coax = fireOpts.coax === true && attacker.def.coaxMG;
  const mg = attacker.def.coaxMG;
  const weaponRange = coax ? mg.range : attacker.def.range;
  const weaponDamage = coax ? mg.damage : attacker.def.damage;
  const attackerType = coax ? 'machineGun' : attacker.def.type;

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

  const falloff = Math.max(0.55, 1 - (dist / weaponRange) * 0.35);
  const paceMult = options.paceDamageMult ?? 1;
  let damage = weaponDamage * falloff * (0.88 + Math.random() * 0.24) * paceMult;
  if (!coax && attacker.def.type === 'sniper' && !target.isGround) {
    const rangeRatio = dist / Math.max(attacker.def.range, 1);
    if (rangeRatio > 0.45) damage *= 1.12 + (rangeRatio - 0.45) * 0.35;
  }
  if (attacker.team === 'enemy') damage *= enemyDamageMult;

  if (attacker.def.antiArmor && !target.isGround && target.def) {
    const vsArmor = ARMOR_TARGET_TYPES.has(target.def.type);
    damage *= vsArmor ? attacker.def.antiArmorMult ?? 1.3 : attacker.def.softMult ?? 0.35;
  }

  if (!target.isGround && !isSceneryTarget(target)) {
    damage *= getIncomingDamageMultiplier(target, coverSystem);
    damage *= getArmorDamageMultiplier(attackerType, target);
  }
  if (isSceneryTarget(target)) {
    damage *= getStructureDamageMultiplier(attackerType);
  }
  if (isDefenseTarget(target)) {
    damage *= getDefenseDamageMultForAttacker(attackerType);
  }

  if (target.isGround) {
    applySplashDamage(attacker, impact, damage, allTargets, coverSystem, scenery, hqs, options, livingUnits);
    if (map && scene) {
      const t = attacker.def.type;
      if (t === 'artillery' || t === 'mortar') {
        addTerrainCrater(scene, map, impact.x, impact.z, {
          radius: t === 'artillery' ? 4.5 : 3.5,
          heavy: true,
        });
      }
    }
  } else if (isSceneryTarget(target) || isDefenseTarget(target)) {
    target.takeDamage(damage);
    if (target.dead && attacker.attackOrder === target) attacker.clearAttackOrder();
  } else {
    target.takeDamage(scalePracticeHqDamage(target, damage, options));
    if (!target.dead && hqs) maybeTriggerRetreat(target, hqs, livingUnits);
    if (scenery && !coax) {
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
              : attacker.def.type === 'antiTankGun'
                ? 3.5
              : attacker.def.type === 'armoredCar'
                ? 3
                : 2;
      scenery.damageAt(ix, iz, r, damage * 0.55);
    } else if (scenery && coax) {
      scenery.damageAt(impact.x, impact.z, 2, damage * 0.4);
    }
  }

  const showVfx =
    attacker.team === 'player' || shouldSpawnVfx(attacker, listenerX, listenerZ);
  const vfxType =
    coax ? 'machineGun' : attacker.def.type === 'antiTankGun' ? 'tank' : attacker.def.type;

  if (showVfx && scene) {
    const from = attacker.position.clone();
    if (map) from.y = sampleTerrainHeight(from.x, from.z, map) + (coax ? 0.95 : 1);
    const toY = map ? sampleTerrainHeight(impact.x, impact.z, map) + 1 : 1;
    const to = { x: impact.x, y: toY, z: impact.z };
    spawnMuzzleFlash(scene, from, to, vfxType);
  }

  if (onFire) {
    onFire({
      attacker,
      target,
      def: attacker.def,
      dist,
      coaxFire: coax,
      killed: !target.isGround && target.dead,
      targetIsHQ: !target.isGround && !target.def && !isSceneryTarget(target),
      targetIsScenery: isSceneryTarget(target) || isDefenseTarget(target),
      groundImpact: target.isGround,
      from: attacker.position,
      to: impact,
    });
  }
}

function applySplashDamage(
  attacker,
  point,
  baseDamage,
  targets,
  coverSystem,
  scenery,
  hqs,
  options = {},
  units = []
) {
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
    if (!other.dead && hqs) maybeTriggerRetreat(other, hqs, units);
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

    if (unit.attackOrder?.isGround && unit._userMoveOrder) {
      unit.clearAttackOrder();
    } else if (
      !unit._userMoveOrder &&
      !unit.retreating &&
      unit.attackOrder &&
      !unit.attackOrder.dead &&
      canEngageManualOrder(unit, unit.attackOrder)
    ) {
      unit.moveTarget = null;
      unit._chasingAttack = false;
    }

    if (
      !unit._userMoveOrder &&
      !unit.retreating &&
      unit.attackOrder &&
      !unit.attackOrder.dead &&
      !canEngageManualOrder(unit, unit.attackOrder)
    ) {
      if (unit.attackOrder.isGround) {
        const dest = getGroundFireMoveDest(unit, unit.attackOrder.position);
        if (dest) unit.moveTarget = dest;
      } else {
        const dist = distanceBetween(unit, unit.attackOrder);
        const rangeSlack =
          unit.attackOrder.isScenery || isDefenseTarget(unit.attackOrder) ? 1.05 : 0.88;
        const chaseRange = isTankType(unit.def.type) && isCoaxSoftTarget(unit.attackOrder) && unit.def.coaxMG
          ? unit.def.coaxMG.range * rangeSlack
          : unit.def.range * rangeSlack;
        if (dist > chaseRange) {
          unit.moveTarget = getStandoffPosition(unit, unit.attackOrder);
        }
      }
    }

    if (!unit.moveTarget) continue;

    const dest = unit.moveTarget;

    const holdWhenFiring = [
      'tank',
      'superHeavyTank',
      'artillery',
      'antiTankGun',
      'machineGun',
      'mortar',
      'sniper',
    ];
    if (
      !unit._userMoveOrder &&
      !unit.retreating &&
      unit.attackOrder &&
      !unit.attackOrder.dead &&
      canEngageManualOrder(unit, unit.attackOrder) &&
      holdWhenFiring.includes(unit.def.type)
    ) {
      unit.moveTarget = null;
      unit._chasingAttack = false;
      continue;
    }

    let moveDt = dt;
    if (options.getWireSlowMult && unit.team === 'enemy') {
      moveDt *= options.getWireSlowMult(unit.position.x, unit.position.z);
    }
    advanceUnitOnTerrain(unit, dest, mapDef, moveDt);
    advanceMovePath(unit, mapDef);
    if (!unit.moveTarget) {
      unit._chasingAttack = false;
      continue;
    }
    unit._mapDef = mapDef;
  }
}