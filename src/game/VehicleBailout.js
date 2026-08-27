import * as THREE from 'three';
import { spawnUnitAt } from './Spawner.js';
import { sampleTerrainHeight } from '../world/Terrain.js';

function squadMembers(mesh) {
  const members = [];
  mesh?.traverse((child) => {
    if (child.name === 'squadMember') members.push(child);
  });
  members.sort((a, b) => (a.userData.squadIndex ?? 0) - (b.userData.squadIndex ?? 0));
  return members;
}

function bailoutCrewDef(vehicle) {
  if (vehicle?.def?.type === 'truck') {
    return vehicle.faction?.units?.truckDriver ?? vehicle.faction?.units?.vehicleCrew;
  }
  return vehicle.faction?.units?.vehicleCrew;
}

function bailoutExitDistance(type) {
  if (type === 'armoredCar' || type === 'truck') return 1.8;
  return 2.35;
}

function bailoutHatchHeight(type) {
  if (type === 'armoredCar' || type === 'truck') return 1.05;
  if (type === 'superHeavyTank') return 2.05;
  return 1.65;
}

/** Spawn an armed crew and animate each man climbing from the vehicle hatch. */
export function spawnVehicleCrewBailout(game, vehicle) {
  if (!game?.scene || !vehicle || vehicle._crewBailedOut) return null;
  const def = bailoutCrewDef(vehicle);
  if (!def) return null;

  vehicle._crewBailedOut = true;
  const yaw = vehicle.mesh.rotation?.y ?? 0;
  const side = Math.random() < 0.5 ? -1 : 1;
  const exitDistance = bailoutExitDistance(vehicle.def.type);
  const rightX = Math.cos(yaw);
  const rightZ = -Math.sin(yaw);
  const endX = vehicle.position.x + rightX * exitDistance * side;
  const endZ = vehicle.position.z + rightZ * exitDistance * side;
  const groundY = vehicle._mapDef
    ? sampleTerrainHeight(endX, endZ, vehicle._mapDef)
    : vehicle.position.y;
  const vehicleGroundY = vehicle._mapDef
    ? sampleTerrainHeight(vehicle.position.x, vehicle.position.z, vehicle._mapDef)
    : vehicle.position.y;
  const hatchHeight = bailoutHatchHeight(vehicle.def.type);

  const crew = spawnUnitAt({
    def,
    faction: vehicle.faction,
    team: vehicle.team,
    x: endX,
    z: endZ,
    scene: game.scene,
    mapDef: vehicle._mapDef ?? game.mapDef,
  });
  crew.position.y = groundY;
  crew.mesh.rotation.y = yaw;
  crew._dropping = true;
  crew._bailoutSourceVehicleId = vehicle.id;

  const hatchWorld = new THREE.Vector3(
    vehicle.position.x,
    vehicleGroundY + hatchHeight,
    vehicle.position.z
  );
  const hatchLocal = crew.mesh.worldToLocal(hatchWorld.clone());
  const members = squadMembers(crew.mesh).map((member, index) => {
    const end = member.userData.walkRest?.group?.clone() ?? member.position.clone();
    const start = hatchLocal.clone();
    start.x += (index - 0.5) * 0.12;
    start.z += index * 0.08;
    member.position.copy(start);
    return {
      member,
      start,
      end,
      restRotation: member.rotation.clone(),
      delay: index * 0.32,
    };
  });

  crew._bailoutAnimation = {
    elapsed: 0,
    duration: 1.15,
    members,
  };
  game.units.push(crew);
  game._rebuildUnitCaches?.();
  return crew;
}

export function updateVehicleBailouts(game, dt) {
  for (const crew of game?.units ?? []) {
    const anim = crew._bailoutAnimation;
    if (!anim || crew.dead) continue;
    anim.elapsed += dt;
    let allDone = true;

    for (const entry of anim.members) {
      const t = THREE.MathUtils.clamp(
        (anim.elapsed - entry.delay) / anim.duration,
        0,
        1
      );
      if (t < 1) allDone = false;
      const eased = t * t * (3 - 2 * t);
      entry.member.position.lerpVectors(entry.start, entry.end, eased);
      entry.member.position.y += Math.sin(t * Math.PI) * 0.28;
      entry.member.rotation.x = THREE.MathUtils.lerp(-0.72, entry.restRotation.x, eased);
      entry.member.rotation.z = THREE.MathUtils.lerp(
        entry.member.userData.squadIndex === 0 ? -0.2 : 0.2,
        entry.restRotation.z,
        eased
      );
    }

    if (allDone) {
      for (const entry of anim.members) {
        entry.member.position.copy(entry.end);
        entry.member.rotation.copy(entry.restRotation);
      }
      crew._dropping = false;
      crew._bailoutAnimation = null;
    }
  }
}
