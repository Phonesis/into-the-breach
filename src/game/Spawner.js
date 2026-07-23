import { Unit } from '../units/Unit.js';
import { isVehicleUnit } from '../units/VehicleTypes.js';
import { sampleTerrainHeight } from '../world/Terrain.js';
import { BASE_BUILDING_STARTING_ARMY } from '../data/baseBuildings.js';

const PLAYER_ARMY = [
  { type: 'infantry', count: 3, spread: 6 },
  { type: 'medic', count: 1, spread: 5 },
  { type: 'engineer', count: 1, spread: 5 },
  { type: 'machineGun', count: 1, spread: 5 },
  { type: 'sniper', count: 1, spread: 5 },
  { type: 'mortar', count: 1, spread: 5 },
  { type: 'armoredCar', count: 1, spread: 5 },
  { type: 'antiTankGun', count: 1, spread: 4 },
  { type: 'tank', count: 2, spread: 5 },
  { type: 'artillery', count: 1, spread: 4 },
];

const ENEMY_ARMY = [
  { type: 'infantry', count: 3, spread: 6 },
  { type: 'medic', count: 1, spread: 5 },
  { type: 'engineer', count: 1, spread: 5 },
  { type: 'machineGun', count: 1, spread: 5 },
  { type: 'sniper', count: 1, spread: 5 },
  { type: 'mortar', count: 1, spread: 5 },
  { type: 'armoredCar', count: 1, spread: 5 },
  { type: 'antiTankGun', count: 1, spread: 4 },
  { type: 'tank', count: 1, spread: 5 },
  { type: 'artillery', count: 1, spread: 4 },
];

const ASSAULT_ATTACKER_ARMY = [
  { type: 'infantry', count: 4, spread: 6 },
  { type: 'machineGun', count: 1, spread: 5 },
  { type: 'sniper', count: 1, spread: 5 },
  { type: 'mortar', count: 1, spread: 5 },
  { type: 'armoredCar', count: 1, spread: 5 },
  { type: 'antiTankGun', count: 1, spread: 4 },
  { type: 'tank', count: 2, spread: 5 },
  { type: 'artillery', count: 1, spread: 4 },
];

const ASSAULT_DEFENDER_ARMY = [
  { type: 'infantry', count: 3, spread: 6 },
  { type: 'machineGun', count: 1, spread: 5 },
  { type: 'sniper', count: 1, spread: 5 },
  { type: 'mortar', count: 1, spread: 5 },
  { type: 'armoredCar', count: 1, spread: 5 },
  { type: 'antiTankGun', count: 2, spread: 4 },
  { type: 'tank', count: 1, spread: 5 },
  { type: 'artillery', count: 1, spread: 4 },
];

const TUTORIAL_ARMY = [
  { type: 'infantry', count: 3, spread: 6 },
  { type: 'engineer', count: 1, spread: 5 },
  { type: 'machineGun', count: 1, spread: 5 },
  { type: 'sniper', count: 1, spread: 5 },
  { type: 'mortar', count: 1, spread: 5 },
  { type: 'armoredCar', count: 1, spread: 5 },
  { type: 'antiTankGun', count: 1, spread: 4 },
  { type: 'tank', count: 1, spread: 5 },
  { type: 'artillery', count: 1, spread: 4 },
];

function resolveLayout({ roster, tutorial, team, campaign, baseBuilding }) {
  if (Array.isArray(roster)) return roster;
  if (roster === 'assaultAttack') return ASSAULT_ATTACKER_ARMY;
  if (roster === 'assaultDefend') return ASSAULT_DEFENDER_ARMY;
  if (tutorial) return TUTORIAL_ARMY;
  if (baseBuilding) return BASE_BUILDING_STARTING_ARMY;
  if (campaign) return BASE_BUILDING_STARTING_ARMY;
  return team === 'enemy' ? ENEMY_ARMY : PLAYER_ARMY;
}

function scaleEnemyLayout(layout, armyMult) {
  if (!armyMult || armyMult === 1) return layout;
  return layout
    .map((slot) => ({
      ...slot,
      count: Math.max(1, Math.round(slot.count * armyMult)),
    }))
    .filter((slot) => slot.count > 0);
}

/**
 * Clear Defenses starts at the rear map edge, so every layer advances inward
 * from the assembly anchor.  Keep infantry forward, crew-served weapons in
 * support, armor on the shoulders, and indirect-fire assets protected behind.
 */
const CLEARANCE_DEPLOYMENT = {
  infantry: [
    { forward: 9, lateral: -14 },
    { forward: 12, lateral: 0 },
    { forward: 9, lateral: 14 },
  ],
  machineGun: [{ forward: 6, lateral: -8 }],
  sniper: [{ forward: 8, lateral: 13 }],
  antiTankGun: [{ forward: 5, lateral: 4 }],
  armoredCar: [{ forward: 7, lateral: -18 }],
  tank: [
    { forward: 3, lateral: -13 },
    { forward: 3, lateral: 13 },
  ],
  engineer: [{ forward: 2, lateral: 4 }],
  medic: [{ forward: 1, lateral: -3 }],
  mortar: [{ forward: 1, lateral: -9 }],
  artillery: [{ forward: 0, lateral: 8 }],
};

function getClearanceDeploymentOffset(type, index, count) {
  const rolePositions = CLEARANCE_DEPLOYMENT[type];
  if (rolePositions?.length) {
    const position = rolePositions[index % rolePositions.length];
    const repeat = Math.floor(index / rolePositions.length);
    return {
      forward: position.forward + repeat * 2.5,
      lateral: position.lateral + repeat * (repeat % 2 ? -5 : 5),
    };
  }

  // Faction-specific or future unit types still join a broad second line.
  return {
    forward: 5 + (index % 2) * 3,
    lateral: (index - (count - 1) / 2) * 8,
  };
}

function vehicleSpawnRadius(type) {
  if (type === 'superHeavyTank') return 2.8;
  if (type === 'armoredCar') return 1.45;
  if (type === 'artillery' || type === 'antiTankGun') return 1.65;
  return 2.1;
}

/**
 * Relocate units out of intact building footprints before creation.
 * Vehicles always search; foot troops are also nudged clear so AI does not
 * start (and dig trenches) inside Berlin tenements.
 */
export function resolveUnitSpawnPosition(def, x, z, scenery, mapDef = null) {
  if (!scenery?.findClearVehiclePlacement) return { x, z };
  if (isVehicleUnit(def?.type)) {
    return scenery.findClearVehiclePlacement(x, z, vehicleSpawnRadius(def.type), mapDef);
  }
  if (scenery.isFieldWorksPlacementBlocked?.(x, z, 1.25)) {
    return scenery.findClearVehiclePlacement(x, z, 1.25, mapDef) ?? { x, z };
  }
  return { x, z };
}

export function spawnArmy({
  faction,
  team,
  base,
  scene,
  offsetSign = 1,
  roster = null,
  tutorial = false,
  enemyArmyMult = 1,
  clearanceSpawn = false,
  mapDef = null,
  campaign = false,
  baseBuilding = false,
  scenery = null,
}) {
  let layout = resolveLayout({ roster, tutorial, team, campaign, baseBuilding });
  if (team === 'enemy' && !tutorial) {
    layout = scaleEnemyLayout(layout, enemyArmyMult);
  }
  const units = [];
  let row = 0;
  let forwardX = 0;
  let forwardZ = 0;
  let lateralX = 0;
  let lateralZ = 0;
  if (clearanceSpawn && mapDef?.playerBase && mapDef?.enemyBase) {
    const pb = mapDef.playerBase;
    const eb = mapDef.enemyBase;
    const len = Math.hypot(eb.x - pb.x, eb.z - pb.z) || 1;
    forwardX = (eb.x - pb.x) / len;
    forwardZ = (eb.z - pb.z) / len;
    lateralX = -forwardZ;
    lateralZ = forwardX;
  }

  for (const slot of layout) {
    const def = faction.units[slot.type];
    if (!def) continue;

    for (let i = 0; i < slot.count; i++) {
      const angle = (i / Math.max(slot.count, 1)) * Math.PI * 0.6 - Math.PI * 0.3;
      const dist = slot.spread + (i % 2) * 2;
      let x;
      let z;
      if (clearanceSpawn) {
        const deployment = getClearanceDeploymentOffset(slot.type, i, slot.count);
        x = base.x + forwardX * deployment.forward + lateralX * deployment.lateral;
        z = base.z + forwardZ * deployment.forward + lateralZ * deployment.lateral;
      } else if (campaign || baseBuilding) {
        // Standard campaign: one rifle squad starts well clear of the HQ mesh
        // so it is easy to click (was ~2–4 m under/beside HQ).
        const ring = Math.max(dist, 14);
        const lateral = (i - (slot.count - 1) / 2) * 3.4;
        x = base.x + Math.cos(angle) * ring * 0.65 + offsetSign * (row * 4.5 + 14);
        z = base.z + Math.sin(angle) * ring * 0.85 + lateral;
      } else {
        x = base.x + Math.cos(angle) * dist * 0.4 + offsetSign * (row * 3 + 2);
        z = base.z + Math.sin(angle) * dist + (i - slot.count / 2) * 2.5;
      }
      if (clearanceSpawn && mapDef) {
        const half = (mapDef.size ?? 120) * 0.5 - 5;
        x = Math.max(-half, Math.min(half, x));
        z = Math.max(-half, Math.min(half, z));
      }
      const position = resolveUnitSpawnPosition(def, x, z, scenery, mapDef);
      if (!position) continue;

      units.push(
        new Unit({
          def,
          faction,
          team,
          position,
          scene,
        })
      );
    }
    row++;
  }

  return units;
}

export function spawnUnitAt({ def, faction, team, x, z, scene, mapDef = null, scenery = null }) {
  const position = resolveUnitSpawnPosition(def, x, z, scenery, mapDef);
  if (!position) return null;
  const unit = new Unit({
    def,
    faction,
    team,
    position,
    scene,
  });
  if (mapDef) {
    unit._mapDef = mapDef;
    unit.position.y = sampleTerrainHeight(position.x, position.z, mapDef);
  }
  return unit;
}
