import * as THREE from 'three';
import { sampleTerrainHeight } from '../world/Terrain.js';
import { distanceBetween } from './Targeting.js';
import { releaseFromBunker, getGarrisonBunkerSources } from './BunkerGarrison.js';
import { resetInfantryWalkPose } from '../units/InfantryVisuals.js';
import { SQUAD_SIZES } from '../data/squadSizes.js';

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

const HOST_TYPES = new Set(['tank', 'superHeavyTank', 'armoredCar']);
const RIDER_DECK_TYPES = new Set(['tank', 'superHeavyTank']);

const HOST_CAPACITY = {
  tank: 2,
  superHeavyTank: 3,
  armoredCar: 1,
};

/** Rider offsets in tank local space (deck height from vehicleDesigns hull top). */
const RIDER_OFFSETS = {
  tank: [
    { x: -0.95, z: -1.55, y: 0.96 },
    { x: 0.95, z: -1.55, y: 0.96 },
  ],
  superHeavyTank: [
    { x: -1.05, z: -2.05, y: 1.14 },
    { x: 1.05, z: -2.05, y: 1.14 },
    { x: 0, z: -2.45, y: 1.14 },
  ],
  armoredCar: [{ x: 0, z: -0.72, y: 0.82 }],
};

const DISMOUNT_OFFSETS = [
  { x: -1.7, z: -2.4 },
  { x: 1.7, z: -2.4 },
  { x: -0.9, z: -3.2 },
  { x: 0.9, z: -3.2 },
  { x: 0, z: -3.8 },
];

const MOUNTED_RENDER_ORDER = 12;
const REPLACEMENT_CREW_COUNT = 2;

const _riderLocal = new THREE.Vector3();

export function canRideTanks(unitType) {
  return RIDER_TYPES.has(unitType);
}

export function canHostRiders(unitType) {
  return HOST_TYPES.has(unitType);
}

export function isUnitMounted(unit) {
  return !!unit?._mountedOnTankId;
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

function canSupplyReplacementCrew(unit) {
  return (
    (unit?.def?.type === 'infantry' || unit?.def?.type === 'paratrooper') &&
    squadLivingCount(unit) >= REPLACEMENT_CREW_COUNT
  );
}

function syncEmbeddedCrewVisibility(rider, embedded) {
  if (!rider?.mesh) return;
  const living = squadLivingCount(rider);
  rider.mesh.traverse((child) => {
    if (child.name !== 'squadMember') return;
    const index = child.userData?.squadIndex;
    if (index == null) return;
    if (embedded && index < REPLACEMENT_CREW_COUNT) child.visible = false;
    else if (!embedded && index < Math.min(REPLACEMENT_CREW_COUNT, living)) child.visible = true;
  });
}

function syncRiderSlot(rider, tank, slotIndex) {
  const offsets = RIDER_OFFSETS[tank.def.type] ?? RIDER_OFFSETS.tank;
  const offset = offsets[slotIndex] ?? offsets[offsets.length - 1];
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
}

function dismountPosition(tank, index, mapDef) {
  const offset = DISMOUNT_OFFSETS[index % DISMOUNT_OFFSETS.length];
  const yaw = tank.mesh?.rotation?.y ?? 0;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const x = tank.position.x + offset.x * cos - offset.z * sin;
  const z = tank.position.z + offset.x * sin + offset.z * cos;
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
    rider._replacementCrewVehicleId = null;
    rider._embeddedCrewCount = 0;
    syncEmbeddedCrewVisibility(rider, false);
  }
  if (rider.mesh) {
    rider.mesh.visible = true;
    setMountedRenderOrder(rider.mesh, false);
  }
  if (tank && mapDef && dismountIndex != null) {
    const pos = dismountPosition(tank, dismountIndex, mapDef);
    rider.position.x = pos.x;
    rider.position.z = pos.z;
    rider.position.y = pos.y;
  }
}

export function tryRemanCrewlessTank(rider, tank, units, garrisonSources = null) {
  if (!tank?._crewless || tank.dead || !canHostRiders(tank.def?.type)) return false;
  if (!canSupplyReplacementCrew(rider) || rider.team !== tank.team) return false;
  if (!tryMountTank(rider, tank, units, garrisonSources)) return false;
  tank._crewless = false;
  tank._replacementCrewUnitId = rider.id;
  rider._replacementCrewVehicleId = tank.id;
  rider._embeddedCrewCount = REPLACEMENT_CREW_COUNT;
  syncEmbeddedCrewVisibility(rider, true);
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
  if (!rider || rider.dead || rider.surrendered || rider._captureExit) return false;
  if (!tank || tank.dead || tank.surrendered || tank.team !== rider.team) return false;
  if (!canRideTanks(rider.def?.type) || !canHostRiders(tank.def?.type)) return false;
  if (!tank._crewless && !RIDER_DECK_TYPES.has(tank.def?.type)) return false;

  const riders = ensureRiderList(tank);
  const cap = getTankRiderCapacity(tank);
  if (riders.length >= cap) return false;
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
        rider.team === tank.team &&
        canSupplyReplacementCrew(rider)
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
    if (!rider || rider.dead || rider.surrendered || !canRideTanks(rider.def?.type)) continue;
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
  if (!tank.moveTarget) {
    return getTankRiderIds(tank).some((id) => id !== tank._replacementCrewUnitId);
  }
  return false;
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
      if (!isReplacementCrew && (unit.moveTarget || unit.retreating || unit.surrendered)) {
        releaseFromTank(unit, units, mapDef);
        continue;
      }
      if (!isReplacementCrew && (tank._underFireTimer ?? 0) > 0) {
        const idx = tank._tankRiderIds?.indexOf(unit.id) ?? 0;
        releaseFromTank(unit, units, mapDef, idx);
        continue;
      }
      const slot = Math.max(0, tank._tankRiderIds?.indexOf(unit.id) ?? 0);
      syncRiderSlot(unit, tank, slot);
      continue;
    }

    if (unit._pendingMountTankId) {
      const tank = unitById.get(unit._pendingMountTankId);
      if (!tank || tank.dead || tank.team !== unit.team) {
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
