import * as THREE from 'three';
import { spawnMuzzleFlash } from '../units/UnitMeshes.js';
import {
  spawnHandGrenade,
  spawnSmokeShellImpact,
  triggerParatrooperAtRecoil,
} from '../effects/CombatEffects.js';
import {
  sampleTerrainHeight,
  hasReachedMoveDest,
  advanceUnitOnTerrain,
  updateUnitTerrainPose,
} from '../world/Terrain.js';
import { advanceMovePath } from './MovePath.js';

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
  isSmokeShellTarget,
  SMOKE_SHELL_COOLDOWN_SEC,
  isHqTarget,
} from './Targeting.js';
import { SMOKE_MISS_CHANCE } from './SmokeScreen.js';
import { getIncomingDamageMultiplier } from './CoverSystem.js';
import { getArmorDamageMultiplier } from './ClearanceMode.js';
import { maybeTriggerRetreat, clearRetreat, resolveRetreatHq } from './RetreatBehavior.js';
import { maybeTriggerSurrender, markUnderFire } from './SurrenderBehavior.js';
import { getRankDamageMultiplier, recordEnemyKill } from './EliteBehavior.js';
import { isSceneryTarget } from './SceneryTarget.js';
import { isDefenseTarget } from './DefenseTarget.js';
import { isBaseBuildingTarget } from './BaseBuildingTarget.js';
import { getStructureDamageMultiplier } from './StructureDamage.js';
import { getDefenseDamageMultForAttacker } from './DefenseStructures.js';
import { getMoveReachConfig, isTankType } from '../units/VehicleTypes.js';
import { isUnitMounted } from './TankRiders.js';
import {
  canIndependentMgBearOnTarget,
  canWeaponBearOnTarget,
  faceIndependentMgTowardTarget,
  faceUnitTowardTarget,
  hasIndependentMgPivot,
} from '../units/VehicleRotation.js';
import { applyMobilityDamage, resolveArmorHit } from './ArmorPenetration.js';
import {
  getInfantryMuzzleWorldPosition,
  aimDeployedMachineGun,
  aimDeployedMortar,
  markInfantryFireAim,
  updateInfantryWalkAnimation,
  usesInfantryMuzzleOrigin,
} from '../units/InfantryVisuals.js';
import {
  getIndependentVehicleMgMuzzleWorldPosition,
  getVehicleCannonMuzzleWorldPosition,
  usesIndependentVehicleMgMuzzleOrigin,
  usesVehicleCannonMuzzleOrigin,
} from '../units/VehicleMeshKit.js';


const SMALL_ARMS_TYPES = new Set([
  'infantry',
  'engineer',
  'machineGun',
  'sniper',
  'armoredCar',
  'paratrooper',
  'vehicleCrew',
]);
const CRUSHING_VEHICLE_TYPES = new Set([
  'tank',
  'tankDestroyer',
  'superHeavyTank',
  'armoredCar',
]);
const ARMOR_TARGET_TYPES = new Set(['tank', 'tankDestroyer', 'superHeavyTank', 'armoredCar']);
const STATIONARY_MAIN_GUN_TYPES = new Set(['antiTankGun', 'artillery', 'mortar']);
const HAND_GRENADE_THROWER_TYPES = new Set(['infantry', 'paratrooper', 'engineer']);
const HAND_GRENADE_TARGET_TYPES = new Set(['tank', 'tankDestroyer', 'superHeavyTank']);
export const HAND_GRENADE_RANGE = 8;
export const HAND_GRENADE_COOLDOWN_SEC = 9.5;
const HAND_GRENADE_DAMAGE = 12;

export function canThrowHandGrenadeAt(attacker, target) {
  if (!attacker || !target || attacker.dead || target.dead) return false;
  if (!HAND_GRENADE_THROWER_TYPES.has(attacker.def?.type)) return false;
  if (!HAND_GRENADE_TARGET_TYPES.has(target.def?.type)) return false;
  if (attacker.team === target.team || attacker.surrendered || attacker._captureExit) return false;
  if ((attacker.grenadeCooldown ?? 0) > 0 || isUnitMounted(attacker)) return false;
  return distanceBetween(attacker, target) <= HAND_GRENADE_RANGE;
}

function findHandGrenadeTarget(attacker, candidates) {
  let nearest = null;
  let nearestDistance = Infinity;
  for (const target of candidates) {
    if (!canThrowHandGrenadeAt(attacker, target)) continue;
    const distance = distanceBetween(attacker, target);
    if (distance < nearestDistance) {
      nearest = target;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function tryThrowHandGrenade(attacker, candidates, scene, mapDef, onFire) {
  const target = findHandGrenadeTarget(attacker, candidates);
  if (!target) return false;

  const map = attacker._mapDef || mapDef;
  const from = new THREE.Vector3(attacker.position.x, attacker.position.y + 0.9, attacker.position.z);
  if (map) from.y = sampleTerrainHeight(from.x, from.z, map) + 0.9;
  const to = new THREE.Vector3(target.position.x, target.position.y + 0.85, target.position.z);
  if (map) to.y = sampleTerrainHeight(to.x, to.z, map) + 0.85;

  attacker.grenadeCooldown = HAND_GRENADE_COOLDOWN_SEC + Math.random() * 1.5;
  const armorFactor = target.def.type === 'superHeavyTank' ? 0.65 : 1;
  const damage = HAND_GRENADE_DAMAGE * armorFactor * getRankDamageMultiplier(attacker);
  target.takeDamage(damage, { explosive: true, impactFrom: attacker.position });
  if (target.dead) recordEnemyKill(attacker, target);

  const event = {
    attacker,
    target,
    def: { ...attacker.def, type: 'handGrenade' },
    dist: distanceBetween(attacker, target),
    killed: target.dead,
    targetIsHQ: false,
    targetIsScenery: false,
    groundImpact: false,
    handGrenade: true,
    from: { x: from.x, y: from.y, z: from.z },
    to: { x: to.x, y: to.y, z: to.z },
  };

  spawnHandGrenade(scene, from, to, () => onFire?.(event));
  return true;
}

function isParatrooperAtShot(attacker, target, fireOpts = {}) {
  if (attacker.def.type !== 'paratrooper') return false;
  if (fireOpts.paratrooperAt === true) return true;
  if (fireOpts.paratrooperAt === false) return false;
  if (target.isGround || isSmokeShellTarget(target)) return false;
  if (!target.def) return false;
  return ARMOR_TARGET_TYPES.has(target.def.type);
}

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
    if (unit.grenadeCooldown > 0) unit.grenadeCooldown = Math.max(0, unit.grenadeCooldown - dt);
    if (unit.smokeShellCooldown > 0) {
      unit.smokeShellCooldown = Math.max(0, unit.smokeShellCooldown - dt);
    }
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
  // Retreat / panic paths need mapDef for Clear Defenses staging rally
  options = { ...options, mapDef };
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
  const baseBuildingTargets = options.baseBuildingTargets ?? [];
  const targets = [...aliveUnits, ...hqsInPlay, ...sceneryTargets, ...defenseTargets, ...baseBuildingTargets];
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
  const playerAutoAcquire = [...enemyAlive];
  if (!tutorialPassiveNoHq) playerAutoAcquire.push(...enemyHqs);
  const enemyAutoAcquire = [...playerAlive, ...playerHqs, ...defenseTargets, ...baseBuildingTargets];
  const lx = listener?.x ?? 0;
  const lz = listener?.z ?? 0;

  for (const attacker of aliveUnits) {
    if (
      attacker._dropping ||
      attacker.retreating ||
      attacker.surrendered ||
      attacker._captureExit ||
      attacker._crewless
    ) continue;
    if (
      attacker.def.type === 'medic' ||
      attacker.def.nonCombat ||
      attacker.def.damage <= 0
    )
      continue;
    if (openingCeasefire && !attacker.attackOrder) continue;
    if (enemyCeasefire && attacker.team === 'enemy') continue;

    const acquire =
      attacker.team === 'player' ? playerAutoAcquire : enemyAutoAcquire;
    const localAcquire = filterAcquireNearAttacker(attacker, acquire);
    tryThrowHandGrenade(attacker, localAcquire, scene, mapDef, onFire);
    const hadAttackOrder = !!attacker.attackOrder;
    const target = resolveAttackTarget(attacker, targets, localAcquire);
    if (!target) continue;

    attacker.target = target;
    if (
      !hadAttackOrder &&
      !attacker.attackOrder &&
      attacker.engagementStance === 'pursue' &&
      target.retreating &&
      !target.surrendered &&
      !target._captureExit
    ) {
      // Pursuit begins only after the fleeing target has entered weapon range.
      // From then on normal attack movement can follow it if it escapes range.
      attacker.attackOrder = target;
      attacker._chasingAttack = true;
      attacker._stancePursuitOrder = true;
      attacker._userMoveOrder = false;
      attacker._movePath = null;
    }

    const structureTarget =
      isHqTarget(target) ||
      isSceneryTarget(target) ||
      isDefenseTarget(target) ||
      isBaseBuildingTarget(target);
    const inMainGunRange = target.isGround || isSmokeShellTarget(target)
      ? isPointInRange(attacker, target.position)
      : structureTarget
        ? isInRange(attacker, target, 1.05)
        : isInRange(attacker, target);
    const mainGunCanAim =
      inMainGunRange &&
      (!STATIONARY_MAIN_GUN_TYPES.has(attacker.def.type) || !attacker.moveTarget);
    const coaxInRange =
      !target.isGround && isTankType(attacker.def.type) && isInCoaxRange(attacker, target);
    const independentMg = coaxInRange && hasIndependentMgPivot(attacker.mesh);
    const independentMgSoftTarget =
      independentMg && isCoaxSoftTarget(target) && !!attacker.def.coaxMG;

    if ((mainGunCanAim && !independentMgSoftTarget) || (coaxInRange && !independentMg)) {
      faceUnitTowardTarget(attacker, target, dt);
      aimDeployedMachineGun(attacker, target);
      aimDeployedMortar(attacker, target);
    }
    if (independentMg) {
      faceIndependentMgTowardTarget(attacker, target, dt);
    }

    // Reaching weapon range stops an attack advance even while the turret is
    // still traversing; otherwise a slow turret can make the hull overshoot.
    if (!attacker._userMoveOrder && (mainGunCanAim || coaxInRange)) {
      if (attacker.moveTarget && attacker.attackOrder && !target.isGround) {
        const standoff = getStandoffPosition(attacker, target);
        const reach = getMoveReachConfig(attacker.def.type);
        if (hasReachedMoveDest(attacker, standoff, mapDef, reach.horiz * 0.85, reach.height * 0.85)) {
          attacker.moveTarget = null;
        }
      } else if ((target.isGround || isSmokeShellTarget(target)) && attacker.moveTarget) {
        attacker.moveTarget = null;
      }
    }

    const weaponOnBearing = canWeaponBearOnTarget(attacker, target);
    const canFireMain = mainGunCanAim && weaponOnBearing;
    if (
      canFireMain &&
      (attacker.def.type === 'infantry' ||
        attacker.def.type === 'engineer' ||
        attacker.def.type === 'vehicleCrew' ||
        attacker.def.type === 'paratrooper' ||
        attacker.def.type === 'sniper')
    ) {
      markInfantryFireAim(attacker, 0.28);
    }
    const mgOnBearing = independentMg
      ? canIndependentMgBearOnTarget(attacker, target)
      : weaponOnBearing;
    const canFireCoax = coaxInRange && mgOnBearing;
    const coaxHandlesSoft =
      coaxInRange && isCoaxSoftTarget(target) && attacker.def.coaxMG;

    if (!canFireMain && !canFireCoax) continue;

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
    const paratrooperAt =
      attacker.def.type === 'paratrooper' && isParatrooperAtShot(attacker, target);
    attacker.attackCooldown = paratrooperAt
      ? 1 / (attacker.def.atAttackSpeed ?? attacker.def.attackSpeed)
      : attacker.def.shellReload ?? 1 / attacker.def.attackSpeed;
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
    if (
      attacker._stancePursuitOrder &&
      (attacker.engagementStance !== 'pursue' || !attacker.attackOrder.retreating)
    ) {
      attacker.clearAttackOrder();
      if (!attacker._userMoveOrder) {
        attacker.moveTarget = null;
        attacker._movePath = null;
      }
    }
  }
  if (attacker.attackOrder) {
    if (attacker.attackOrder.isGround || isSmokeShellTarget(attacker.attackOrder)) {
      return attacker.attackOrder;
    }
    if (!attacker.attackOrder.dead) {
      if (attacker.attackOrder._dropping) {
        attacker.clearAttackOrder();
        return null;
      }
      if (
        attacker.def.type === 'sniper' &&
        attacker.attackOrder.def &&
        isTankType(attacker.attackOrder.def.type)
      ) {
        attacker.clearAttackOrder();
        return null;
      }
      if (
        !isSceneryTarget(attacker.attackOrder) &&
        !isDefenseTarget(attacker.attackOrder) &&
        !isBaseBuildingTarget(attacker.attackOrder) &&
        !isHqTarget(attacker.attackOrder) &&
        (attacker.attackOrder.team === attacker.team ||
          attacker.attackOrder.surrendered ||
          attacker.attackOrder._captureExit)
      ) {
        attacker.clearAttackOrder();
        return null;
      }
      return attacker.attackOrder;
    }
    attacker.clearAttackOrder();
  }

  const validAcquireTargets =
    attacker.def.type === 'sniper'
      ? acquireTargets.filter((target) => !target.def || !isTankType(target.def.type))
      : acquireTargets;
  return findNearestEnemyInRange(attacker, validAcquireTargets, 1);
}

const _muzzleFrom = new THREE.Vector3();

function resolveMuzzleFrom(attacker, map, vfxType, coax) {
  if (usesInfantryMuzzleOrigin(attacker)) {
    getInfantryMuzzleWorldPosition(attacker, vfxType, _muzzleFrom);
    return { from: _muzzleFrom, exactOrigin: true };
  }
  if (usesIndependentVehicleMgMuzzleOrigin(attacker, coax)) {
    getIndependentVehicleMgMuzzleWorldPosition(attacker, _muzzleFrom);
    return { from: _muzzleFrom, exactOrigin: true };
  }
  // Main gun flash from the cannon tip (follows turret/barrel aim)
  if (usesVehicleCannonMuzzleOrigin(attacker, coax)) {
    getVehicleCannonMuzzleWorldPosition(attacker, _muzzleFrom);
    return { from: _muzzleFrom, exactOrigin: true };
  }
  _muzzleFrom.copy(attacker.position);
  if (map) _muzzleFrom.y = sampleTerrainHeight(_muzzleFrom.x, _muzzleFrom.z, map) + (coax ? 0.95 : 1);
  return { from: _muzzleFrom, exactOrigin: false };
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
  const isParatrooper = attacker.def.type === 'paratrooper';
  const paratrooperAt = isParatrooper && isParatrooperAtShot(attacker, target, fireOpts);
  let paratrooperUseMg = false;
  if (isParatrooper && !paratrooperAt) {
    attacker._mgVolley = (attacker._mgVolley ?? 0) + 1;
    paratrooperUseMg = attacker.def.usesMG && attacker._mgVolley % 2 !== 0;
  }

  const weaponRange = coax ? mg.range : attacker.def.range;
  let weaponDamage = coax ? mg.damage : attacker.def.damage;
  let attackerType = coax ? 'machineGun' : attacker.def.type;
  let vfxType = coax ? 'machineGun' : attacker.def.type;

  if (isParatrooper && !coax) {
    if (paratrooperAt) {
      weaponDamage = attacker.def.damage;
      attackerType = 'paratrooper';
      vfxType = 'paratrooperAt';
    } else {
      weaponDamage = paratrooperUseMg ? attacker.def.mgDamage : attacker.def.smallArmsDamage;
      attackerType = paratrooperUseMg ? 'machineGun' : 'infantry';
      vfxType = attackerType;
    }
  } else if (!coax && attacker.def.type === 'antiTankGun') {
    vfxType = 'tank';
  } else if (
    !coax &&
    (attacker.def.type === 'engineer' || attacker.def.type === 'vehicleCrew')
  ) {
    // Combat engineers and bailed crews use the standard small-arms VFX.
    vfxType = 'infantry';
  }

  const map = attacker._mapDef || mapDef;
  const isGroundShot = target.isGround || isSmokeShellTarget(target);
  const impact = isGroundShot
    ? { x: target.position.x, z: target.position.z }
    : {
        x: target.position?.x ?? target.mesh.position.x,
        z: target.position?.z ?? target.mesh.position.z,
      };

  const dist = isGroundShot
    ? distanceToPoint(attacker, impact)
    : distanceBetween(attacker, target);

  if (
    !isGroundShot &&
    !isSceneryTarget(target) &&
    !isDefenseTarget(target) &&
    !isBaseBuildingTarget(target) &&
    !isHqTarget(target) &&
    options.smokeScreens?.isLosObscured?.(attacker.position.x, attacker.position.z, impact.x, impact.z)
  ) {
    if (Math.random() < SMOKE_MISS_CHANCE) {
      const missOffset = 4 + Math.random() * 7;
      const missAngle = Math.random() * Math.PI * 2;
      const missImpact = {
        x: impact.x + Math.cos(missAngle) * missOffset,
        z: impact.z + Math.sin(missAngle) * missOffset,
      };
      const showVfx =
        attacker.team === 'player' || shouldSpawnVfx(attacker, listenerX, listenerZ);
      if (showVfx && scene) {
        const { from, exactOrigin } = resolveMuzzleFrom(attacker, map, vfxType, coax);
        const toY = map ? sampleTerrainHeight(missImpact.x, missImpact.z, map) + 0.6 : 0.6;
        const to = { x: missImpact.x, y: toY, z: missImpact.z };
        spawnMuzzleFlash(scene, from, to, vfxType, { exactOrigin });
        if (paratrooperAt) triggerParatrooperAtRecoil(attacker.mesh);
      }
      if (onFire) {
        onFire({
          attacker,
          target,
          def: attacker.def,
          dist,
          coaxFire: coax,
          paratrooperAtFire: paratrooperAt,
          killed: false,
          targetIsHQ: false,
          targetIsScenery: false,
          groundImpact: false,
          smokeMiss: true,
          from: attacker.position,
          to: missImpact,
        });
      }
      return;
    }
  }

  const falloff =
    attacker.def.type === 'antiTankGun' || paratrooperAt
      ? Math.max(0.4, 1 - (dist / weaponRange) * 0.62)
      : Math.max(0.55, 1 - (dist / weaponRange) * 0.35);
  const paceMult = options.paceDamageMult ?? 1;
  let damage = weaponDamage * falloff * (0.88 + Math.random() * 0.24) * paceMult;
  if (!coax && attacker.def.type === 'sniper' && !target.isGround) {
    const rangeRatio = dist / Math.max(attacker.def.range, 1);
    if (rangeRatio > 0.45) damage *= 1.12 + (rangeRatio - 0.45) * 0.35;
  }
  if (attacker.team === 'enemy') damage *= enemyDamageMult;
  damage *= getRankDamageMultiplier(attacker);

  if (attacker.def.antiArmor && !target.isGround && target.def) {
    const useAntiArmorScaling = !isParatrooper || paratrooperAt;
    if (useAntiArmorScaling) {
      const vsArmor = ARMOR_TARGET_TYPES.has(target.def.type);
      damage *= vsArmor ? attacker.def.antiArmorMult ?? 1.3 : attacker.def.softMult ?? 0.35;
    }
  }

  if (!target.isGround && !isSceneryTarget(target)) {
    damage *= getIncomingDamageMultiplier(target, coverSystem, attacker);
    damage *= getArmorDamageMultiplier(attackerType, target);
  }
  if (isSceneryTarget(target)) {
    damage *= getStructureDamageMultiplier(attackerType);
  }
  if (isDefenseTarget(target)) {
    damage *= getDefenseDamageMultForAttacker(attackerType);
  }
  if (isBaseBuildingTarget(target)) {
    damage *= getStructureDamageMultiplier(attackerType);
  }
  if (isHqTarget(target)) {
    damage *= getStructureDamageMultiplier(attackerType);
  }

  const armorHit =
    !isGroundShot && !isSceneryTarget(target) && !isDefenseTarget(target) && !isBaseBuildingTarget(target)
      ? resolveArmorHit(attacker, target, {
          distance: dist,
          weaponRange,
          coax,
          paratrooperAt,
        })
      : null;
  if (armorHit) {
    damage *= armorHit.damageMultiplier;
    if (armorHit.mobilityDamaged) {
      applyMobilityDamage(target, armorHit.mobilityDamageKind);
    }
  }

  if (isSmokeShellTarget(target)) {
    attacker.smokeShellCooldown = SMOKE_SHELL_COOLDOWN_SEC;
    options.smokeScreens?.deploy?.(impact.x, impact.z, attacker.team);
    attacker.clearAttackOrder();
    const showSmokeVfx =
      attacker.team === 'player' || shouldSpawnVfx(attacker, listenerX, listenerZ);
    if (showSmokeVfx && scene) {
      const { from, exactOrigin } = resolveMuzzleFrom(attacker, map, 'artillery', false);
      const toY = map ? sampleTerrainHeight(impact.x, impact.z, map) + 1 : 1;
      const to = { x: impact.x, y: toY, z: impact.z };
      spawnMuzzleFlash(scene, from, to, 'artillery', { exactOrigin });
      spawnSmokeShellImpact(scene, { x: impact.x, y: toY - 0.88, z: impact.z }, 1.15);
    }
    if (onFire) {
      onFire({
        attacker,
        target,
        def: attacker.def,
        dist,
        coaxFire: false,
        killed: false,
        targetIsHQ: false,
        targetIsScenery: false,
        groundImpact: true,
        smokeDeployed: true,
        from: attacker.position,
        to: impact,
      });
    }
    return;
  }

  if (target.isGround) {
    applySplashDamage(attacker, impact, damage, allTargets, coverSystem, scenery, hqs, options, livingUnits);
  } else if (
    isSceneryTarget(target) ||
    isDefenseTarget(target) ||
    isBaseBuildingTarget(target) ||
    isHqTarget(target)
  ) {
    target.takeDamage(isHqTarget(target) ? scalePracticeHqDamage(target, damage, options) : damage);
    if (target.dead && attacker.attackOrder === target) attacker.clearAttackOrder();
  } else {
    if (!target.surrendered) {
      markUnderFire(target);
      // Shells / HE can gib; coax MG and small arms do not
      const explosiveKill =
        !coax &&
        (attacker.def.type === 'artillery' ||
          attacker.def.type === 'mortar' ||
          attacker.def.type === 'antiTankGun' ||
          isTankType(attacker.def.type) ||
          paratrooperAt);
      const appliedDamage = scalePracticeHqDamage(target, damage, options);
      target.takeDamage(appliedDamage, {
        explosive: explosiveKill,
        impactFrom: attacker.position,
        armorHit,
      });
      if (appliedDamage > 0 && !target.dead && !target.surrendered) {
        if (!maybeTriggerSurrender(target, livingUnits, options, attacker) && hqs) {
          maybeTriggerRetreat(target, hqs, livingUnits, attacker, {
            generalOrders: options.generalOrders,
            clearance: options.clearance,
            mapDef,
          });
        }
      }
      if (target.dead && target.def) recordEnemyKill(attacker, target);
    }
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
              : attacker.def.type === 'antiTankGun' || paratrooperAt
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

  if (showVfx && scene) {
    const { from, exactOrigin } = resolveMuzzleFrom(attacker, map, vfxType, coax);
    const toY = map ? sampleTerrainHeight(impact.x, impact.z, map) + 1 : 1;
    const to = { x: impact.x, y: toY, z: impact.z };
    spawnMuzzleFlash(scene, from, to, vfxType, { exactOrigin });
    if (paratrooperAt) triggerParatrooperAtRecoil(attacker.mesh);
    if (
      attacker.def.type === 'infantry' ||
      attacker.def.type === 'engineer' ||
      attacker.def.type === 'vehicleCrew' ||
      attacker.def.type === 'paratrooper' ||
      attacker.def.type === 'sniper'
    ) {
      markInfantryFireAim(attacker, 0.55);
    }
  }

  if (onFire) {
    onFire({
      attacker,
      target,
      def: attacker.def,
      dist,
      coaxFire: coax,
      paratrooperAtFire: paratrooperAt,
      killed: !target.isGround && target.dead,
      targetIsHQ: !target.isGround && !target.def && !isSceneryTarget(target),
      targetIsScenery:
        isSceneryTarget(target) || isDefenseTarget(target) || isBaseBuildingTarget(target),
      groundImpact: target.isGround,
      armorHit,
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
    splashDmg *= getIncomingDamageMultiplier(other, coverSystem, {
      def: attacker.def,
      // Blast shielding depends on whether the cover lies between the unit and
      // the detonation, not the distant gun that fired the shell.
      position: point,
    });
    splashDmg *= getArmorDamageMultiplier(attacker.def.type, other);
    if (!other.surrendered) {
      markUnderFire(other);
      const appliedDamage = scalePracticeHqDamage(other, splashDmg, options);
      other.takeDamage(appliedDamage, { explosive: true });
      if (appliedDamage > 0 && !other.dead && !other.surrendered) {
        if (!maybeTriggerSurrender(other, units, options, attacker) && hqs) {
          maybeTriggerRetreat(other, hqs, units, attacker, {
            generalOrders: options.generalOrders,
            clearance: options.clearance,
            mapDef: options.mapDef,
          });
        }
      }
      if (other.dead && other.def) recordEnemyKill(attacker, other);
    }
  }
}

export function updateMovement(units, dt, mapDef, hqs = [], options = {}) {
  for (const unit of units) {
    if (unit._dropping || unit.dead || unit.surrendered || unit._captureExit || unit._crewless) continue;
    if (isUnitMounted(unit)) continue;
    if (unit._mobilityDamaged) {
      unit.moveTarget = null;
      unit._movePath = null;
      unit._userMoveOrder = false;
      unit._chasingAttack = false;
      updateUnitTerrainPose(unit, mapDef, dt);
      continue;
    }

    if (unit.retreating) {
      // Clear Defenses: no player HQ — rally to starting/staging zone instead
      const hq = resolveRetreatHq(unit, hqs, {
        clearance: options.clearance,
        mapDef,
      });
      if (!hq) {
        clearRetreat(unit);
        unit.moveTarget = null;
      } else {
        unit.moveTarget = { x: hq.position.x, z: hq.position.z };
        unit.clearAttackOrder();
      }
    }

    if (
      (unit.attackOrder?.isGround || unit.attackOrder?.isSmokeShell) &&
      unit._userMoveOrder
    ) {
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
      if (unit.attackOrder.isGround || unit.attackOrder.isSmokeShell) {
        const dest = getGroundFireMoveDest(unit, unit.attackOrder.position);
        if (dest) unit.moveTarget = dest;
      } else {
        const dist = distanceBetween(unit, unit.attackOrder);
        const rangeSlack =
          unit.attackOrder.isScenery ||
          isDefenseTarget(unit.attackOrder) ||
          isBaseBuildingTarget(unit.attackOrder) ||
          isHqTarget(unit.attackOrder)
            ? 1.05
            : 0.88;
        const chaseRange = isTankType(unit.def.type) && isCoaxSoftTarget(unit.attackOrder) && unit.def.coaxMG
          ? unit.def.coaxMG.range * rangeSlack
          : unit.def.range * rangeSlack;
        if (dist > chaseRange) {
          unit.moveTarget = getStandoffPosition(unit, unit.attackOrder);
        }
      }
    }

    if (unit.moveTarget) {
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
      } else {
        let moveDt = dt;
        if (options.getWireSlowMult && unit.team === 'enemy') {
          moveDt *= options.getWireSlowMult(unit.position.x, unit.position.z, unit);
        }
        const beforeX = unit.position.x;
        const beforeZ = unit.position.z;
        advanceUnitOnTerrain(unit, dest, mapDef, moveDt);
        const directionX = unit.position.x - beforeX;
        const directionZ = unit.position.z - beforeZ;
        if (
          options.scenery &&
          CRUSHING_VEHICLE_TYPES.has(unit.def?.type) &&
          Math.hypot(directionX, directionZ) > 0.01
        ) {
          options.scenery.crushAt?.(
            unit.position.x,
            unit.position.z,
            unit.def.type === 'superHeavyTank'
              ? 2.8
              : unit.def.type === 'armoredCar'
                ? 1.45
                : 2.1,
            {
              vehicleClass: unit.def.type === 'armoredCar' ? 'light' : 'tracked',
              directionX,
              directionZ,
            }
          );
        }
        advanceMovePath(unit, mapDef);
        if (!unit.moveTarget) unit._chasingAttack = false;
        unit._mapDef = mapDef;
      }
    }

    updateUnitTerrainPose(unit, mapDef, dt);
    updateInfantryWalkAnimation(unit, dt);
  }
}
