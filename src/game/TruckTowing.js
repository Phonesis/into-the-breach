import * as THREE from 'three';
import { sampleTerrainHeight } from '../world/Terrain.js';
import { distanceBetween } from './Targeting.js';
import { getVehicleDesign } from '../units/vehicleDesigns.js';

export const TOW_RANGE = 5.8;
export const TOW_ATTACH_SEC = 1.15;

const TOWABLE_TYPES = new Set(['antiTankGun', 'artillery']);
const TOW_SPEED = {
  antiTankGun: 0.68,
  artillery: 0.52,
};

const _hitchWorld = new THREE.Vector3();
const _gunWorld = new THREE.Vector3();

export function canTowGuns(unitType) {
  return unitType === 'truck';
}

export function isTowableGun(unitType) {
  return TOWABLE_TYPES.has(unitType);
}

export function isGunTowed(gun) {
  return !!gun?._towedByTruckId;
}

export function getHitchLocalOffset(truck) {
  const design = getVehicleDesign(truck?.faction?.id, 'truck');
  return design?.hitch ?? { x: 0, y: 0.44, z: -2.25 };
}

function gunTrailLength(gun) {
  const design = getVehicleDesign(gun?.faction?.id, gun?.def?.type);
  return design?.trailLen ?? 2.15;
}

/** Local offset of the gun origin relative to the truck while hooked. */
export function getTowedGunLocalOffset(truck, gun) {
  const hitch = getHitchLocalOffset(truck);
  const trail = gunTrailLength(gun);
  return {
    x: hitch.x,
    y: 0,
    z: hitch.z - trail * 0.48,
  };
}

function hitchWorldPosition(truck, out = _hitchWorld) {
  const hitch = getHitchLocalOffset(truck);
  if (!truck?.mesh) {
    out.set(
      truck.position.x,
      truck.position.y + hitch.y,
      truck.position.z
    );
    return out;
  }
  truck.mesh.updateMatrixWorld(true);
  out.set(hitch.x, hitch.y, hitch.z);
  truck.mesh.localToWorld(out);
  return out;
}

function towedGunWorldPosition(truck, gun, out = _gunWorld) {
  const offset = getTowedGunLocalOffset(truck, gun);
  if (!truck?.mesh) {
    out.set(truck.position.x, truck.position.y, truck.position.z);
    return out;
  }
  truck.mesh.updateMatrixWorld(true);
  out.set(offset.x, offset.y, offset.z);
  truck.mesh.localToWorld(out);
  if (truck._mapDef) {
    out.y = sampleTerrainHeight(out.x, out.z, truck._mapDef);
  }
  return out;
}

export function getTowingSpeedMultiplier(truck) {
  if (!truck?._towedGunId) return 1;
  const type = truck._towedGunType;
  return TOW_SPEED[type] ?? 0.6;
}

function findUnitById(units, id) {
  if (id == null) return null;
  return units.find((u) => u.id === id) ?? null;
}

function setTowedGunCrewVisible(gun, visible) {
  const crew = gun?.mesh?.getObjectByName('towedGunCrew');
  if (crew) crew.visible = visible;
}

function clearGunOrders(gun) {
  gun.clearAttackOrder?.();
  gun.moveTarget = null;
  gun._movePath = null;
  gun._finalMoveGoal = null;
  gun._userMoveOrder = false;
  gun._chasingAttack = false;
  gun.retreating = false;
}

export function canAttachGunToTruck(truck, gun) {
  if (!truck || !gun || truck.dead || gun.dead) return false;
  if (truck.surrendered || gun.surrendered) return false;
  if (truck._crewless || gun._crewless) return false;
  if (!canTowGuns(truck.def?.type) || !isTowableGun(gun.def?.type)) return false;
  if (truck.team !== gun.team) return false;
  if (truck._towedGunId && truck._towedGunId !== gun.id) return false;
  if (gun._towedByTruckId && gun._towedByTruckId !== truck.id) return false;
  if (gun._towAttaching && gun._towedByTruckId === truck.id) return true;
  return distanceBetween(truck, gun) <= TOW_RANGE;
}

export function findAttachableGun(truck, units) {
  if (!canTowGuns(truck?.def?.type) || truck?.dead || truck._crewless) return null;
  if (truck._towedGunId) return findUnitById(units, truck._towedGunId);
  let best = null;
  let bestDist = TOW_RANGE;
  for (const unit of units) {
    if (!canAttachGunToTruck(truck, unit)) continue;
    const dist = distanceBetween(truck, unit);
    if (dist <= bestDist) {
      best = unit;
      bestDist = dist;
    }
  }
  return best;
}

export function findAttachableTruck(gun, units) {
  if (!isTowableGun(gun?.def?.type) || gun?.dead) return null;
  if (gun._towedByTruckId) return findUnitById(units, gun._towedByTruckId);
  let best = null;
  let bestDist = TOW_RANGE;
  for (const unit of units) {
    if (!canAttachGunToTruck(unit, gun)) continue;
    const dist = distanceBetween(unit, gun);
    if (dist <= bestDist) {
      best = unit;
      bestDist = dist;
    }
  }
  return best;
}

/** World-space Attach target: a gun if a truck is selected, or a truck if a gun is selected. */
export function getTowActionTarget(selected, hovered, units) {
  if (!hovered || hovered.dead) return null;
  const trucks = selected.filter((u) => canTowGuns(u.def?.type) && !u.dead && !u._crewless);
  const guns = selected.filter((u) => isTowableGun(u.def?.type) && !u.dead && !u._towedByTruckId);

  if (isTowableGun(hovered.def?.type) && !hovered._towedByTruckId) {
    const truck = trucks.find((t) => canAttachGunToTruck(t, hovered));
    if (truck) return { truck, gun: hovered, label: 'Attach' };
  }
  if (canTowGuns(hovered.def?.type) && !hovered._towedGunId && !hovered._crewless) {
    const gun = guns.find((g) => canAttachGunToTruck(hovered, g));
    if (gun) return { truck: hovered, gun, label: 'Attach' };
  }
  return null;
}

export function tryAttachGun(truck, gun, units) {
  if (!canAttachGunToTruck(truck, gun)) return false;
  if (gun._towedByTruckId === truck.id && !gun._towAttaching) return true;

  for (const unit of units) {
    if (unit !== truck && unit._towedGunId === gun.id) unit._towedGunId = null;
  }

  truck._towedGunId = gun.id;
  truck._towedGunType = gun.def.type;
  gun._towedByTruckId = truck.id;
  gun._towAttaching = true;
  gun._towAttachElapsed = 0;
  gun._towStartPos = { x: gun.position.x, y: gun.position.y, z: gun.position.z };
  gun._towStartYaw = gun.mesh?.rotation?.y ?? 0;
  clearGunOrders(gun);
  setTowedGunCrewVisible(gun, false);
  return true;
}

export function issueTowOrder(truck, gun, units) {
  if (!truck || !gun) return false;
  if (tryAttachGun(truck, gun, units)) return true;
  if (!canTowGuns(truck.def?.type) || !isTowableGun(gun.def?.type)) return false;
  if (truck.team !== gun.team || truck.dead || gun.dead) return false;
  if (truck._towedGunId && truck._towedGunId !== gun.id) return false;
  if (gun._towedByTruckId && gun._towedByTruckId !== truck.id) return false;

  truck._pendingTowGunId = gun.id;
  gun._pendingTowTruckId = truck.id;
  truck._userMoveOrder = true;
  truck.clearAttackOrder?.();
  truck.moveTarget = { x: gun.position.x, z: gun.position.z };
  return true;
}

export function detachGun(truck, units, mapDef = null) {
  const gun = findUnitById(units, truck?._towedGunId);
  truck._towedGunId = null;
  truck._towedGunType = null;
  truck._pendingTowGunId = null;
  if (!gun) return;

  gun._towedByTruckId = null;
  gun._pendingTowTruckId = null;
  gun._towAttaching = false;
  gun._towAttachElapsed = 0;
  gun._towStartPos = null;
  setTowedGunCrewVisible(gun, true);

  const yaw = truck.mesh?.rotation?.y ?? 0;
  const side = 1.85;
  const back = 1.15;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const x = truck.position.x + side * cos - back * sin;
  const z = truck.position.z - side * sin - back * cos;
  gun.position.x = x;
  gun.position.z = z;
  gun.position.y = mapDef
    ? sampleTerrainHeight(x, z, mapDef)
    : truck.position.y;
  if (gun.mesh) {
    gun.mesh.position.copy(gun.position);
    gun.mesh.rotation.y = yaw;
  }
}

export function canDetachTowedGun(unit) {
  if (!unit || unit.dead) return false;
  if (canTowGuns(unit.def?.type)) return !!unit._towedGunId;
  if (isTowableGun(unit.def?.type)) return !!unit._towedByTruckId && !unit._towAttaching;
  return false;
}

function syncTowedGun(truck, gun, mapDef) {
  const dest = towedGunWorldPosition(truck, gun);
  const targetYaw = (truck.mesh?.rotation?.y ?? 0) + Math.PI;

  if (gun._towAttaching) {
    const start = gun._towStartPos ?? { x: gun.position.x, y: gun.position.y, z: gun.position.z };
    const t = Math.min(1, (gun._towAttachElapsed ?? 0) / TOW_ATTACH_SEC);
    const eased = t * t * (3 - 2 * t);
    gun.position.x = start.x + (dest.x - start.x) * eased;
    gun.position.z = start.z + (dest.z - start.z) * eased;
    gun.position.y = mapDef
      ? sampleTerrainHeight(gun.position.x, gun.position.z, mapDef)
      : dest.y;
    if (gun.mesh) {
      gun.mesh.position.copy(gun.position);
      const startYaw = gun._towStartYaw ?? gun.mesh.rotation.y;
      let delta = targetYaw - startYaw;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      gun.mesh.rotation.y = startYaw + delta * eased;
    }
    if (t >= 1) {
      gun._towAttaching = false;
      gun._towStartPos = null;
    }
    return;
  }

  gun.position.x = dest.x;
  gun.position.z = dest.z;
  gun.position.y = dest.y;
  if (gun.mesh) {
    gun.mesh.position.copy(gun.position);
    gun.mesh.rotation.y = targetYaw;
    gun.mesh.rotation.x = truck.mesh?.rotation?.x ?? 0;
    gun.mesh.rotation.z = truck.mesh?.rotation?.z ?? 0;
  }
  clearGunOrders(gun);
  setTowedGunCrewVisible(gun, false);
}

export function updateTruckTowing(units, dt, mapDef) {
  const unitById = new Map(units.map((u) => [u.id, u]));

  for (const unit of units) {
    if (unit.dead) continue;

    if (unit._pendingTowGunId && canTowGuns(unit.def?.type)) {
      const gun = unitById.get(unit._pendingTowGunId);
      if (!gun || gun.dead || gun.team !== unit.team) {
        unit._pendingTowGunId = null;
      } else if (tryAttachGun(unit, gun, units)) {
        unit._pendingTowGunId = null;
        gun._pendingTowTruckId = null;
      } else {
        unit.moveTarget = { x: gun.position.x, z: gun.position.z };
      }
    }

    if (unit._pendingTowTruckId && isTowableGun(unit.def?.type) && !unit._towedByTruckId) {
      const truck = unitById.get(unit._pendingTowTruckId);
      if (!truck || truck.dead || truck.team !== unit.team) {
        unit._pendingTowTruckId = null;
      }
    }

    if (unit._towAttaching) {
      unit._towAttachElapsed = (unit._towAttachElapsed ?? 0) + dt;
    }
  }

  for (const truck of units) {
    if (!canTowGuns(truck.def?.type)) continue;
    if (!truck._towedGunId) continue;
    const gun = unitById.get(truck._towedGunId);
    if (!gun || gun.dead) {
      if (gun?._towedByTruckId === truck.id) {
        gun._towedByTruckId = null;
        gun._pendingTowTruckId = null;
        gun._towAttaching = false;
        gun._towAttachElapsed = 0;
        gun._towStartPos = null;
      }
      truck._towedGunId = null;
      truck._towedGunType = null;
      continue;
    }
    if (truck.dead) {
      detachGun(truck, units, mapDef);
      continue;
    }
    syncTowedGun(truck, gun, mapDef ?? truck._mapDef);
  }
}

export function restoreTruckTowLinks(units, mapDef = null) {
  const unitById = new Map(units.map((u) => [u.id, u]));
  for (const truck of units) {
    if (!truck._towedGunId) continue;
    const gun = unitById.get(truck._towedGunId);
    if (!gun) {
      truck._towedGunId = null;
      truck._towedGunType = null;
      continue;
    }
    gun._towedByTruckId = truck.id;
    truck._towedGunType = gun.def?.type;
    gun._towAttaching = false;
    setTowedGunCrewVisible(gun, false);
    syncTowedGun(truck, gun, mapDef);
  }
}

export function resolveTowedHost(unit, units) {
  if (!unit?._towedByTruckId) return unit;
  const truck = units?.find((candidate) => candidate.id === unit._towedByTruckId);
  return truck && !truck.dead ? truck : unit;
}
