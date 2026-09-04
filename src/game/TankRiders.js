import * as THREE from 'three';
import { sampleTerrainHeight } from '../world/Terrain.js';
import { distanceBetween } from './Targeting.js';
import { spawnVehicleCrewBailout } from './VehicleBailout.js';
import { releaseFromBunker, getGarrisonBunkerSources } from './BunkerGarrison.js';
import { applyMountedRiderVisuals, resetInfantryWalkPose } from '../units/InfantryVisuals.js';
import { getVehicleDesign } from '../units/vehicleDesigns.js';
import { SQUAD_SIZES } from '../data/squadSizes.js';
import { removeFieldIcon } from '../visual/UnitFieldIcons.js';
import { detachGun } from './TruckTowing.js';

export const TANK_MOUNT_RANGE = 4.2;
export const TANK_DISMOUNT_SPREAD = 2.4;

const RIDER_TYPES = new Set([
  'infantry',
  'paratrooper',
  'machineGun',
  'sniper',
  'medic',
  'engineer',
]);

const HOST_TYPES = new Set(['tank', 'tankDestroyer', 'superHeavyTank', 'armoredCar', 'truck']);
const RIDER_DECK_TYPES = new Set(['tank', 'tankDestroyer', 'superHeavyTank', 'truck']);
const CREWED_VEHICLE_TYPES = new Set([
  'tank',
  'tankDestroyer',
  'superHeavyTank',
  'armoredCar',
  'truck',
]);

const HOST_CAPACITY = {
  tank: 2,
  superHeavyTank: 3,
  armoredCar: 1,
  truck: 3,
};

/** Place the rider group origin on the hull roof; seated bodies snap down onto it. */
const DECK_EMBED = 0.015;

function hullDeckHeight(hull) {
  return hull.y + hull.h * 0.5 - DECK_EMBED;
}

/**
 * Rider slot in vehicle local space. Height follows this hull's roof so
 * shorter tanks (Chi-Nu, T-34) no longer leave troops floating above the deck.
 */
export function getRiderDeckOffset(tank, slotIndex = 0) {
  const design = getVehicleDesign(tank?.faction?.id, tank?.def?.type);
  const hull = design?.hull;
  if (!hull) return { x: 0, z: -1.55, y: 0.96 };

  const y = hullDeckHeight(hull);
  const rearZ = (hull.z ?? 0) - hull.d * 0.42;
  const type = tank.def?.type;
  if (type === 'superHeavyTank') {
    const slots = [
      { x: -hull.w * 0.34, z: rearZ, y },
      { x: hull.w * 0.34, z: rearZ, y },
      { x: 0, z: rearZ - Math.min(0.28, hull.d * 0.06), y },
    ];
    return slots[slotIndex] ?? slots[slots.length - 1];
  }
  if (type === 'armoredCar') {
    return { x: 0, z: (hull.z ?? 0) - hull.d * 0.28, y };
  }
  if (type === 'truck') {
    const cargo = design.cargo;
    const slot = cargo?.slots?.[slotIndex] ?? cargo?.slots?.[0];
    if (slot) {
      return { x: slot.x, z: slot.z, y: cargo.y ?? y };
    }
    return { x: 0, z: (hull.z ?? 0) - hull.d * 0.28, y };
  }
  const inset = hull.w * 0.34;
  const slots = [
    { x: -inset, z: rearZ, y },
    { x: inset, z: rearZ, y },
  ];
  return slots[slotIndex] ?? slots[slots.length - 1];
}

const DISMOUNT_OFFSETS = [
  { x: -1.7, z: -2.4 },
  { x: 1.7, z: -2.4 },
  { x: -0.9, z: -3.2 },
  { x: 0.9, z: -3.2 },
  { x: 0, z: -3.8 },
];

const MOUNTED_RENDER_ORDER = 12;
const REPLACEMENT_CREW_COUNT = 2;

function getReplacementCrewCount(tank) {
  return tank?.def?.type === 'truck' ? 1 : REPLACEMENT_CREW_COUNT;
}

const _riderLocal = new THREE.Vector3();

export function canRideTanks(unitType) {
  return RIDER_TYPES.has(unitType);
}

export function canHostRiders(unitType) {
  return HOST_TYPES.has(unitType);
}

/** True when a live powered vehicle still has an operating crew aboard. */
export function canExitVehicleCrew(vehicle) {
  return !!(
    vehicle &&
    !vehicle.dead &&
    !vehicle.surrendered &&
    !vehicle._captureExit &&
    !vehicle._crewless &&
    !vehicle._crewBailedOut &&
    CREWED_VEHICLE_TYPES.has(vehicle.def?.type)
  );
}

/** Manual crew exit is a stationary action; moving vehicles must stop first. */
export function canExitVehicleCrewNow(vehicle) {
  return !!(
    canExitVehicleCrew(vehicle) &&
    !vehicle.moveTarget &&
    !vehicle._movePath?.length &&
    !vehicle._trafficYield
  );
}

/** True when this specific unit can currently enter this specific vehicle. */
export function canUnitEnterVehicle(unit, tank) {
  if (
    !unit ||
    unit.dead ||
    unit.surrendered ||
    unit._captureExit ||
    unit._dropping ||
    unit._mountedOnTankId ||
    !tank ||
    tank.dead ||
    tank.surrendered ||
    !canHostRiders(tank.def?.type)
  ) {
    return false;
  }
  if (unit._pendingMountTankId === tank.id) return false;
  if (tank._crewless) return canSupplyReplacementCrew(unit, tank);
  if (unit.team !== tank.team || !canRideTanks(unit.def?.type)) return false;
  if (!RIDER_DECK_TYPES.has(tank.def?.type)) return false;
  return getTankRiderIds(tank).length < getTankRiderCapacity(tank);
}

export function isUnitMounted(unit) {
  return !!unit?._mountedOnTankId;
}

/** Clicks on a rider count as the host vehicle so the hull stays selectable. */
export function resolveMountedHost(unit, units) {
  if (!unit?._mountedOnTankId) return unit;
  const host = units?.find((candidate) => candidate.id === unit._mountedOnTankId);
  return host && !host.dead ? host : unit;
}

export function getTankRiderCapacity(tank) {
  if (!tank?.def?.type) return 0;
  return HOST_CAPACITY[tank.def.type] ?? 0;
}

export function getTankRiderIds(tank) {
  return tank?._tankRiderIds ?? [];
}

function findUnitById(units, id) {
  if (id == null) return null;
  return units.find((u) => u.id === id) ?? null;
}

function ensureRiderList(tank) {
  if (!tank._tankRiderIds) tank._tankRiderIds = [];
  return tank._tankRiderIds;
}

function setMountedRenderOrder(mesh, mounted) {
  if (!mesh) return;
  mesh.renderOrder = mounted ? MOUNTED_RENDER_ORDER : 0;
  mesh.traverse((child) => {
    if (child.isMesh) child.renderOrder = mounted ? MOUNTED_RENDER_ORDER : 0;
  });
}

function squadLivingCount(unit) {
  const size = SQUAD_SIZES[unit?.def?.type] ?? 1;
  if (!unit || unit.hp <= 0) return 0;
  return Math.max(1, Math.ceil((unit.hp / Math.max(unit.maxHp, 1)) * size));
}

export function canSupplyReplacementCrew(unit, tank = null) {
  if (!unit || unit.dead || unit.surrendered || unit._captureExit || unit._dropping) {
    return false;
  }
  const needed =
    unit?.def?.type === 'truckDriver' ? 1 : getReplacementCrewCount(tank);
  if (squadLivingCount(unit) < needed) return false;
  if (unit?.def?.type === 'infantry' || unit?.def?.type === 'paratrooper') {
    return true;
  }
  if (unit?.def?.type === 'truckDriver') {
    if (tank && tank.def?.type !== 'truck') return false;
    return !tank || tank.id === unit._bailoutSourceVehicleId;
  }
  if (unit?.def?.type !== 'vehicleCrew' || unit._bailoutSourceVehicleId == null) {
    return false;
  }
  // Bailed crews know their own vehicle and may only reclaim that hull. They
  // are not a general-purpose source of replacement crews for other armor.
  return !tank || tank.id === unit._bailoutSourceVehicleId;
}

function syncEmbeddedCrewVisibility(rider, embedded) {
  if (!rider?.mesh) return;
  const living = squadLivingCount(rider);
  rider.mesh.traverse((child) => {
    if (child.name !== 'squadMember') return;
    const index = child.userData?.squadIndex;
    if (index == null) return;
    const hideCount = rider._embeddedCrewCount ?? REPLACEMENT_CREW_COUNT;
    if (embedded && index < hideCount) child.visible = false;
    else if (!embedded && index < Math.min(hideCount, living)) child.visible = true;
  });
}

function syncRiderSlot(rider, tank, slotIndex) {
  const offset = getRiderDeckOffset(tank, slotIndex);
  if (!rider.mesh || !tank.mesh) return;

  tank.mesh.updateMatrixWorld(true);
  _riderLocal.set(offset.x, offset.y, offset.z);
  tank.mesh.localToWorld(_riderLocal);
  rider.mesh.position.copy(_riderLocal);
  rider.mesh.rotation.set(
    tank.mesh.rotation.x,
    tank.mesh.rotation.y,
    tank.mesh.rotation.z,
    tank.mesh.rotation.order
  );
  rider.mesh.visible = true;
  setMountedRenderOrder(rider.mesh, true);
  syncEmbeddedCrewVisibility(rider, rider._replacementCrewVehicleId === tank.id);
  applyMountedRiderVisuals(rider, true);
}

export function getRiderDismountPosition(tank, index, mapDef = null) {
  const offset = DISMOUNT_OFFSETS[index % DISMOUNT_OFFSETS.length];
  const yaw = tank.mesh?.rotation?.y ?? 0;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const x = tank.position.x + offset.x * cos + offset.z * sin;
  const z = tank.position.z - offset.x * sin + offset.z * cos;
  const y = mapDef ? sampleTerrainHeight(x, z, mapDef) : tank.position.y;
  return { x, z, y };
}

export function releaseFromTank(rider, units, mapDef = null, dismountIndex = null) {
  if (!rider?._mountedOnTankId) {
    if (rider) rider._pendingMountTankId = null;
    return;
  }
  const tank = findUnitById(units, rider._mountedOnTankId);
  if (tank?._tankRiderIds) {
    tank._tankRiderIds = tank._tankRiderIds.filter((id) => id !== rider.id);
  }
  rider._mountedOnTankId = null;
  rider._pendingMountTankId = null;
  if (tank?._replacementCrewUnitId === rider.id) {
    tank._replacementCrewUnitId = null;
    tank._crewless = !tank.dead;
    // The internal crew has left the hull. This also prevents a later wreck
    // pass from spawning a second bailout team for the same surviving crew.
    tank._crewBailedOut = true;
    rider._replacementCrewVehicleId = null;
    rider._embeddedCrewCount = 0;
    syncEmbeddedCrewVisibility(rider, false);
  }
  if (rider.mesh) {
    rider.mesh.visible = true;
    setMountedRenderOrder(rider.mesh, false);
    applyMountedRiderVisuals(rider, false);
  }
  if (tank && mapDef && dismountIndex != null) {
    const pos = getRiderDismountPosition(tank, dismountIndex, mapDef);
    rider.position.x = pos.x;
    rider.position.z = pos.z;
    rider.position.y = pos.y;
  }
}

function clearVehicleOrders(vehicle, units = []) {
  vehicle.clearAttackOrder?.();
  vehicle.target = null;
  vehicle.moveTarget = null;
  vehicle._movePath = null;
  vehicle._finalMoveGoal = null;
  vehicle._autoMoveOrderX = null;
  vehicle._autoMoveOrderZ = null;
  vehicle._userMoveOrder = false;
  vehicle._reverseMoveOrder = false;
  vehicle._trafficYield = null;
  vehicle._chasingAttack = false;
  vehicle._aiTankManeuver = null;
  vehicle._aiTankManeuverNextAt = 0;
  const pendingGun = findUnitById(units, vehicle._pendingTowGunId);
  if (pendingGun?._pendingTowTruckId === vehicle.id) {
    pendingGun._pendingTowTruckId = null;
  }
  vehicle._pendingTowGunId = null;
}

/**
 * Put a live vehicle's internal crew on the ground and leave the hull
 * neutral/crewless. Existing replacement crews are released from the hull;
 * ordinary vehicles receive the same animated crew used by bailout events.
 */
export function exitVehicleCrew(game, vehicle) {
  if (!canExitVehicleCrewNow(vehicle)) return null;

  const units = game?.units ?? [];
  const mapDef = game?.mapDef ?? vehicle?._mapDef ?? null;
  const replacementId = vehicle._replacementCrewUnitId;
  if (replacementId != null) {
    const crew = findUnitById(units, replacementId);
    if (!crew || crew.dead || crew._mountedOnTankId !== vehicle.id) return null;
    const index = Math.max(0, vehicle._tankRiderIds?.indexOf(crew.id) ?? 0);
    releaseFromTank(crew, units, mapDef, index);
    vehicle._crewless = true;
    vehicle._crewBailedOut = true;
    clearVehicleOrders(vehicle, units);
    if (vehicle._towedGunId) detachGun(vehicle, units, mapDef);
    game?._rebuildUnitCaches?.();
    return crew;
  }

  const crew = spawnVehicleCrewBailout(game, vehicle);
  if (!crew) return null;
  vehicle._crewless = true;
  vehicle._replacementCrewUnitId = null;
  vehicle._crewBailedOut = true;
  clearVehicleOrders(vehicle, units);
  if (vehicle._towedGunId) detachGun(vehicle, units, mapDef);
  game?._rebuildUnitCaches?.();
  return crew;
}

export function tryRemanCrewlessTank(rider, tank, units, garrisonSources = null) {
  if (!tank?._crewless || tank.dead || !canHostRiders(tank.def?.type)) return false;
  if (!canSupplyReplacementCrew(rider, tank)) return false;

  // An abandoned operational vehicle is neutral for remanning. Clear any
  // stranded riders from the former side before checking deck capacity.
  const oldTeam = tank.team;
  const foreignRiderIds = (tank._tankRiderIds ?? []).filter((id) => {
    const mounted = findUnitById(units, id);
    return mounted && mounted.team !== rider.team;
  });
  for (let i = 0; i < foreignRiderIds.length; i++) {
    const mounted = findUnitById(units, foreignRiderIds[i]);
    if (mounted) {
      releaseFromTank(
        mounted,
        units,
        garrisonSources?.mapDef ?? null,
        i
      );
    }
  }

  if (!tryMountTank(rider, tank, units, garrisonSources)) return false;
  if (oldTeam !== rider.team) {
    if (tank.selected) tank.setSelected(false);
    removeFieldIcon(tank);
    tank.team = rider.team;
  }
  tank._crewless = false;
  tank._crewBailedOut = false;
  // A captured hull must not inherit the former enemy crew's unfinished
  // tactical reverse/flank state.
  tank._aiTankManeuver = null;
  tank._aiTankManeuverNextAt = 0;
  tank._reverseMoveOrder = false;
  tank.clearAttackOrder();
  tank.moveTarget = null;
  tank._movePath = null;
  tank._finalMoveGoal = null;
  tank._replacementCrewUnitId = rider.id;
  rider._replacementCrewVehicleId = tank.id;
  rider._embeddedCrewCount = getReplacementCrewCount(tank);
  syncEmbeddedCrewVisibility(rider, true);
  garrisonSources?._rebuildUnitCaches?.();
  garrisonSources?._syncUnitRoster?.();
  return true;
}

export function dismountAllRiders(tank, units, mapDef = null) {
  if (!tank?._tankRiderIds?.length) return;
  const ids = [...tank._tankRiderIds];
  for (let i = 0; i < ids.length; i++) {
    const rider = findUnitById(units, ids[i]);
    if (!rider || rider.dead) continue;
    if (!tank.dead && tank._replacementCrewUnitId === rider.id) continue;
    releaseFromTank(rider, units, mapDef, i);
  }
  tank._tankRiderIds = tank.dead
    ? []
    : tank._tankRiderIds.filter((id) => id === tank._replacementCrewUnitId);
}

export function tryMountTank(rider, tank, units, garrisonSources = null) {
  if (
    !rider ||
    rider.dead ||
    rider.surrendered ||
    rider._captureExit ||
    rider._dropping
  ) return false;
  if (!tank || tank.dead || tank.surrendered) return false;
  if (tank.team !== rider.team && !tank._crewless) return false;
  const reclaimingOwnVehicle =
    tank._crewless && canSupplyReplacementCrew(rider, tank);
  if (
    (!canRideTanks(rider.def?.type) && !reclaimingOwnVehicle) ||
    !canHostRiders(tank.def?.type)
  ) {
    return false;
  }
  if (!tank._crewless && !RIDER_DECK_TYPES.has(tank.def?.type)) return false;

  const riders = ensureRiderList(tank);
  const cap = getTankRiderCapacity(tank);
  // Crewless vehicles reserve an internal crew position even when the hull has
  // no external rider deck (for example, a tank destroyer).
  if (!tank._crewless && riders.length >= cap) return false;
  if (distanceBetween(rider, tank) > TANK_MOUNT_RANGE) return false;

  if (garrisonSources) releaseFromBunker(rider, garrisonSources);
  releaseFromTank(rider, units);

  riders.push(rider.id);
  rider._mountedOnTankId = tank.id;
  rider._pendingMountTankId = null;
  rider._pendingReplacementCrew = false;
  rider.clearAttackOrder();
  rider.moveTarget = null;
  rider._movePath = null;
  rider.retreating = false;
  resetInfantryWalkPose(rider);
  syncRiderSlot(rider, tank, riders.length - 1);
  return true;
}

/** Order foot troops to mount a friendly tank (walk into range if needed). */
export function issueMountOrder(riders, tank, units, garrisonSources = null) {
  if (!tank || tank.dead || !canHostRiders(tank.def?.type)) return 0;
  const cap = getTankRiderCapacity(tank);
  let issued = 0;

  if (tank._crewless) {
    const replacement = riders.find(
      (rider) =>
        rider &&
        !rider.dead &&
        !rider.surrendered &&
        !rider._dropping &&
        canSupplyReplacementCrew(rider, tank)
    );
    if (!replacement) return 0;
    replacement.clearAttackOrder();
    replacement._userMoveOrder = true;
    replacement._chasingAttack = false;
    if (tryRemanCrewlessTank(replacement, tank, units, garrisonSources)) return 1;
    replacement._pendingMountTankId = tank.id;
    replacement._pendingReplacementCrew = true;
    replacement.moveTarget = { x: tank.position.x, z: tank.position.z };
    return 1;
  }
  if (!RIDER_DECK_TYPES.has(tank.def?.type)) return 0;

  for (const rider of riders) {
    if (
      !rider ||
      rider.dead ||
      rider.surrendered ||
      rider._dropping ||
      !canRideTanks(rider.def?.type)
    ) continue;
    if (rider.team !== tank.team) continue;
    if (issued + getTankRiderIds(tank).length >= cap) break;

    rider.clearAttackOrder();
    rider._userMoveOrder = true;
    rider._chasingAttack = false;

    if (tryMountTank(rider, tank, units, garrisonSources)) {
      issued++;
      continue;
    }

    rider._pendingMountTankId = tank.id;
    rider.moveTarget = { x: tank.position.x, z: tank.position.z };
    issued++;
  }
  return issued;
}

export function canDismountRiders(tank) {
  if (!tank || tank.dead || !canHostRiders(tank.def?.type)) return false;
  return getTankRiderIds(tank).some((id) => id !== tank._replacementCrewUnitId);
}

export function updateTankRiders(units, dt, mapDef, garrisonSources = null) {
  const unitById = new Map(units.map((u) => [u.id, u]));

  for (const unit of units) {
    if (unit.dead) continue;

    if (unit._mountedOnTankId) {
      const tank = unitById.get(unit._mountedOnTankId);
      if (!tank || tank.dead) {
        releaseFromTank(unit, units, mapDef);
        continue;
      }
      const isReplacementCrew = unit._replacementCrewVehicleId === tank.id;
      if (!isReplacementCrew && unit.surrendered) {
        releaseFromTank(unit, units, mapDef);
        continue;
      }
      if (!isReplacementCrew && (tank._underFireTimer ?? 0) > 0) {
        const idx = tank._tankRiderIds?.indexOf(unit.id) ?? 0;
        releaseFromTank(unit, units, mapDef, idx);
        continue;
      }
      if (!isReplacementCrew) {
        // Discard stray individual movement state instead of interpreting it
        // as an implicit bail-out order. Manual disembarking uses the vehicle
        // action; incoming fire remains an automatic emergency bail-out.
        unit.moveTarget = null;
        unit._movePath = null;
        unit.retreating = false;
      }
      const slot = Math.max(0, tank._tankRiderIds?.indexOf(unit.id) ?? 0);
      syncRiderSlot(unit, tank, slot);
      continue;
    }

    if (unit._pendingMountTankId) {
      const tank = unitById.get(unit._pendingMountTankId);
      if (!tank || tank.dead || (tank.team !== unit.team && !tank._crewless)) {
        unit._pendingMountTankId = null;
        unit._pendingReplacementCrew = false;
        continue;
      }
      if (unit.moveTarget && unit._userMoveOrder && unit.moveTarget.x !== tank.position.x) {
        unit._pendingMountTankId = null;
        continue;
      }
      if (unit._pendingReplacementCrew && tank._crewless) {
        if (tryRemanCrewlessTank(unit, tank, units, garrisonSources)) continue;
      } else if (tryMountTank(unit, tank, units, garrisonSources)) {
        continue;
      }
      unit.moveTarget = { x: tank.position.x, z: tank.position.z };
    }
  }

  for (const unit of units) {
    if (!canHostRiders(unit.def?.type)) continue;
    if (unit._replacementCrewUnitId) {
      const crew = unitById.get(unit._replacementCrewUnitId);
      if (!crew || crew.dead || crew._mountedOnTankId !== unit.id) {
        unit._replacementCrewUnitId = null;
        if (!unit.dead) unit._crewless = true;
      }
    }
    if (unit.dead) continue;
    if (!unit._tankRiderIds?.length) continue;
    unit._tankRiderIds = unit._tankRiderIds.filter((id) => {
      const rider = unitById.get(id);
      return rider && !rider.dead && rider._mountedOnTankId === unit.id;
    });
    if (unit.dead && unit._tankRiderIds.length) {
      dismountAllRiders(unit, units, mapDef);
    }
  }
}

export function restoreTankRiderLinks(units, mapDef = null) {
  const unitById = new Map(units.map((u) => [u.id, u]));
  for (const unit of units) {
    if (unit.dead) {
      unit._mountedOnTankId = null;
      unit._pendingMountTankId = null;
      continue;
    }
    if (!unit._mountedOnTankId) continue;
    const tank = unitById.get(unit._mountedOnTankId);
    if (!tank) {
      unit._mountedOnTankId = null;
      if (unit.mesh) {
        unit.mesh.visible = true;
        setMountedRenderOrder(unit.mesh, false);
      }
      continue;
    }
    ensureRiderList(tank);
    if (!tank._tankRiderIds.includes(unit.id)) {
      tank._tankRiderIds.push(unit.id);
    }
    unit.clearAttackOrder();
    unit.moveTarget = null;
    unit._movePath = null;
    const slot = Math.max(0, tank._tankRiderIds.indexOf(unit.id));
    syncRiderSlot(unit, tank, slot);
  }
}
