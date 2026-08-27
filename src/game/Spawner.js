import { Unit } from '../units/Unit.js';
import { isVehicleUnit } from '../units/VehicleTypes.js';
import { snapUnitYaw } from '../units/VehicleRotation.js';
import { sampleTerrainHeight } from '../world/Terrain.js';
import { BASE_BUILDING_STARTING_ARMY } from '../data/baseBuildings.js';

const PLAYER_ARMY = [
  { type: 'radioOperator', count: 1, spread: 5 },
  { type: 'infantry', count: 3, spread: 6 },
  { type: 'medic', count: 1, spread: 5 },
  { type: 'engineer', count: 1, spread: 5 },
  { type: 'machineGun', count: 1, spread: 5 },
  { type: 'sniper', count: 1, spread: 5 },
  { type: 'mortar', count: 1, spread: 5 },
  { type: 'armoredCar', count: 1, spread: 5 },
  { type: 'truck', count: 1, spread: 5 },
  { type: 'antiTankGun', count: 1, spread: 4 },
  { type: 'tank', count: 2, spread: 5 },
  { type: 'artillery', count: 1, spread: 4 },
];

const ENEMY_ARMY = [
  { type: 'radioOperator', count: 1, spread: 5 },
  { type: 'infantry', count: 3, spread: 6 },
  { type: 'medic', count: 1, spread: 5 },
  { type: 'engineer', count: 1, spread: 5 },
  { type: 'machineGun', count: 1, spread: 5 },
  { type: 'sniper', count: 1, spread: 5 },
  { type: 'mortar', count: 1, spread: 5 },
  { type: 'armoredCar', count: 1, spread: 5 },
  { type: 'truck', count: 1, spread: 5 },
  { type: 'antiTankGun', count: 1, spread: 4 },
  { type: 'tank', count: 1, spread: 5 },
  { type: 'artillery', count: 1, spread: 4 },
];

const ASSAULT_ATTACKER_ARMY = [
  { type: 'radioOperator', count: 1, spread: 5 },
  { type: 'infantry', count: 4, spread: 6 },
  { type: 'machineGun', count: 1, spread: 5 },
  { type: 'sniper', count: 1, spread: 5 },
  { type: 'mortar', count: 1, spread: 5 },
  { type: 'armoredCar', count: 1, spread: 5 },
  { type: 'truck', count: 1, spread: 5 },
  { type: 'antiTankGun', count: 1, spread: 4 },
  { type: 'tank', count: 2, spread: 5 },
  { type: 'artillery', count: 1, spread: 4 },
];

const ASSAULT_DEFENDER_ARMY = [
  { type: 'radioOperator', count: 1, spread: 5 },
  { type: 'infantry', count: 3, spread: 6 },
  { type: 'machineGun', count: 1, spread: 5 },
  { type: 'sniper', count: 1, spread: 5 },
  { type: 'mortar', count: 1, spread: 5 },
  { type: 'armoredCar', count: 1, spread: 5 },
  { type: 'truck', count: 1, spread: 5 },
  { type: 'antiTankGun', count: 2, spread: 4 },
  { type: 'tank', count: 1, spread: 5 },
  { type: 'artillery', count: 1, spread: 4 },
];

const TUTORIAL_ARMY = [
  { type: 'radioOperator', count: 1, spread: 5 },
  { type: 'infantry', count: 3, spread: 6 },
  { type: 'engineer', count: 1, spread: 5 },
  { type: 'machineGun', count: 1, spread: 5 },
  { type: 'sniper', count: 1, spread: 5 },
  { type: 'mortar', count: 1, spread: 5 },
  { type: 'armoredCar', count: 1, spread: 5 },
  { type: 'truck', count: 1, spread: 5 },
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

function ensureRadioOperatorLayout(layout) {
  if (layout.some((slot) => slot.type === 'radioOperator' && slot.count > 0)) return layout;
  return [...layout, { type: 'radioOperator', count: 1, spread: 5 }];
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
  truck: [{ forward: 4, lateral: -10 }],
  tank: [
    { forward: 3, lateral: -13 },
    { forward: 3, lateral: 13 },
  ],
  engineer: [{ forward: 2, lateral: 4 }],
  medic: [{ forward: 1, lateral: -3 }],
  radioOperator: [{ forward: -1, lateral: 5 }],
  mortar: [{ forward: 1, lateral: -9 }],
  artillery: [{ forward: 0, lateral: 8 }],
};

/**
 * Training begins as a field exercise rather than an HQ parking area. Spread
 * the force across a shallow frontage, with rifle squads screening the support
 * line, armor covering the shoulders, and indirect fire protected at the rear.
 */
const TRAINING_DEPLOYMENT = {
  infantry: [
    { forward: 18, lateral: -18 },
    { forward: 20, lateral: 0 },
    { forward: 18, lateral: 18 },
  ],
  machineGun: [{ forward: 13, lateral: -10 }],
  sniper: [{ forward: 15, lateral: 12 }],
  armoredCar: [{ forward: 9, lateral: -23 }],
  truck: [{ forward: 6, lateral: -14 }],
  tank: [{ forward: 8, lateral: 23 }],
  antiTankGun: [{ forward: 7, lateral: 5 }],
  engineer: [{ forward: 3, lateral: -12 }],
  radioOperator: [{ forward: 1, lateral: 13 }],
  mortar: [{ forward: -3, lateral: -10 }],
  artillery: [{ forward: -9, lateral: 17 }],
};

/**
 * Breakthrough deployment is role-based rather than team-based because the
 * player can command either physical side of the map. Attackers form a broad
 * assault echelon; defenders cover a wider frontage with crew-served weapons.
 */
const ASSAULT_DEPLOYMENT = {
  attack: {
    machineGun: [{ forward: 15, lateral: -14 }],
    sniper: [{ forward: 17, lateral: 15 }],
    mortar: [{ forward: -2, lateral: -12 }],
    armoredCar: [{ forward: 10, lateral: -29 }],
    truck: [{ forward: 6, lateral: -16 }],
    antiTankGun: [{ forward: 8, lateral: 4 }],
    radioOperator: [{ forward: 1, lateral: 13 }],
    artillery: [{ forward: -10, lateral: 18 }],
  },
  defend: {
    machineGun: [{ forward: 13, lateral: -11 }],
    sniper: [{ forward: 15, lateral: 14 }],
    mortar: [{ forward: -4, lateral: -12 }],
    armoredCar: [{ forward: 7, lateral: 29 }],
    truck: [{ forward: 3, lateral: 16 }],
    tank: [{ forward: 5, lateral: -29 }],
    radioOperator: [{ forward: 0, lateral: 10 }],
    artillery: [{ forward: -12, lateral: 18 }],
  },
};

function centeredLineOffset(index, count, spacing, forwardA, forwardB = forwardA) {
  return {
    forward: index % 2 ? forwardB : forwardA,
    lateral: (index - (count - 1) / 2) * spacing,
  };
}

function getAssaultDeploymentOffset(role, type, index, count) {
  if (type === 'infantry') {
    return role === 'attack'
      ? centeredLineOffset(index, count, 16, 20, 23)
      : centeredLineOffset(index, count, 22, 17, 19);
  }
  if (role === 'attack' && type === 'tank') {
    return centeredLineOffset(index, count, 40, 10);
  }
  if (role === 'defend' && type === 'antiTankGun') {
    return centeredLineOffset(index, count, 38, 10);
  }

  const rolePositions = ASSAULT_DEPLOYMENT[role]?.[type];
  if (rolePositions?.length) {
    const position = rolePositions[index % rolePositions.length];
    const repeat = Math.floor(index / rolePositions.length);
    return {
      forward: position.forward - repeat * 3,
      lateral: position.lateral + repeat * (repeat % 2 ? -8 : 8),
    };
  }

  return centeredLineOffset(index, count, 11, 8, 11);
}

function getTrainingDeploymentOffset(type, index, count) {
  const rolePositions = TRAINING_DEPLOYMENT[type];
  if (rolePositions?.length) {
    const position = rolePositions[index % rolePositions.length];
    const repeat = Math.floor(index / rolePositions.length);
    return {
      forward: position.forward - repeat * 3,
      lateral: position.lateral + repeat * (repeat % 2 ? -7 : 7),
    };
  }

  return {
    forward: 8 + (index % 2) * 4,
    lateral: (index - (count - 1) / 2) * 10,
  };
}

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
  if (type === 'armoredCar' || type === 'truck') return 1.45;
  if (type === 'artillery' || type === 'antiTankGun') return 1.65;
  return 2.1;
}

/** Axis from a team's base toward the enemy (for rear/forward placement). */
function frontAxisForTeam(mapDef, team) {
  const own = team === 'enemy' ? mapDef?.enemyBase : mapDef?.playerBase;
  const foe = team === 'enemy' ? mapDef?.playerBase : mapDef?.enemyBase;
  if (!own || !foe) return null;
  const dx = foe.x - own.x;
  const dz = foe.z - own.z;
  const len = Math.hypot(dx, dz) || 1;
  return {
    own,
    foe,
    fx: dx / len,
    fz: dz / len,
    lx: -dz / len,
    lz: dx / len,
  };
}

/**
 * True when a howitzer can sit here realistically on Berlin: clear of masonry,
 * not jammed against a wall, and no building immediately in the forward arc.
 */
function isOpenArtillerySite(scenery, x, z, radius, fx, fz) {
  if (!scenery) return true;
  if (scenery.isVehiclePlacementBlocked?.(x, z, radius)) return false;
  // Keep a yard of clear pavement around the piece (not a courtyard dead-end).
  if (scenery.getUnitPlacementBlocker?.(x, z, Math.max(radius + 2.4, 3.6))) return false;
  // No solid building in the first ~14 m toward the enemy — guns start on an
  // open street / plaza, not tucked behind a tenement façade.
  if (
    typeof scenery.segmentHitsBuilding === 'function' &&
    scenery.segmentHitsBuilding(x, z, x + fx * 14, z + fz * 14, 1.15)
  ) {
    return false;
  }
  return true;
}

/**
 * Infer which team a preferred spawn belongs to when callers omit `team`.
 * Defaults must never send enemy guns to the player rear.
 */
function inferTeamFromPreferred(mapDef, preferredX, preferredZ, explicitTeam) {
  if (explicitTeam === 'player' || explicitTeam === 'enemy') return explicitTeam;
  const pb = mapDef?.playerBase;
  const eb = mapDef?.enemyBase;
  if (!pb || !eb) return 'player';
  const dPlayer = Math.hypot(preferredX - pb.x, preferredZ - pb.z);
  const dEnemy = Math.hypot(preferredX - eb.x, preferredZ - eb.z);
  return dEnemy < dPlayer ? 'enemy' : 'player';
}

/** Keep howitzers on their own half of the theater (never cross mid-map). */
function isOnOwnSideOfMap(x, z, axis) {
  if (!axis) return true;
  // Projection along the front axis from map centre toward the enemy of `own`.
  // Own half: behind the midplane (negative when origin is between bases).
  const midX = (axis.own.x + axis.foe.x) * 0.5;
  const midZ = (axis.own.z + axis.foe.z) * 0.5;
  const along = (x - midX) * axis.fx + (z - midZ) * axis.fz;
  // Toward foe is +fx; own rear is negative along this axis from the midpoint.
  return along <= 2;
}

/**
 * Urban artillery: search rearward first (away from the enemy), then sideways,
 * for a street/plaza site that is not blocked by buildings ahead.
 */
export function resolveUrbanArtilleryPlacement(
  preferredX,
  preferredZ,
  scenery,
  mapDef,
  { team = null } = {}
) {
  const radius = vehicleSpawnRadius('artillery');
  const resolvedTeam = inferTeamFromPreferred(mapDef, preferredX, preferredZ, team);
  const axis = frontAxisForTeam(mapDef, resolvedTeam);
  if (!scenery?.findClearVehiclePlacement) {
    return { x: preferredX, z: preferredZ };
  }
  if (!axis) {
    return scenery.findClearVehiclePlacement(preferredX, preferredZ, radius, mapDef);
  }
  const { own, fx, fz, lx, lz } = axis;
  const half = Math.max(8, (mapDef?.size ?? 120) * 0.5 - radius - 1);

  const trySite = (x, z) => {
    if (!isOnOwnSideOfMap(x, z, axis)) return null;
    if (!isOpenArtillerySite(scenery, x, z, radius, fx, fz)) return null;
    return { x, z };
  };

  // Prefer sites behind the army assembly (rear of own base along the front axis).
  const candidates = [];
  for (let rear = 4; rear <= 22; rear += 2.5) {
    for (const side of [0, -5, 5, -10, 10, -15, 15]) {
      const x = THREE_clamp(own.x - fx * rear + lx * side, -half, half);
      const z = THREE_clamp(own.z - fz * rear + lz * side, -half, half);
      candidates.push({ x, z, score: rear * 2 - Math.abs(side) * 0.15 });
    }
  }
  // Prefer points on the caller's side first — if preferred is already wrong-side,
  // do not promote it over own-base rear candidates.
  if (isOnOwnSideOfMap(preferredX, preferredZ, axis)) {
    candidates.push({ x: preferredX, z: preferredZ, score: 1 });
    for (let rear = 2; rear <= 16; rear += 3) {
      candidates.push({
        x: THREE_clamp(preferredX - fx * rear, -half, half),
        z: THREE_clamp(preferredZ - fz * rear, -half, half),
        score: rear * 0.5,
      });
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  for (const c of candidates) {
    const hit = trySite(c.x, c.z);
    if (hit) return hit;
  }

  // Spiral search from own base (not a wrong-side preferred point).
  const spiralOriginX = isOnOwnSideOfMap(preferredX, preferredZ, axis)
    ? preferredX
    : own.x - fx * 10;
  const spiralOriginZ = isOnOwnSideOfMap(preferredX, preferredZ, axis)
    ? preferredZ
    : own.z - fz * 10;
  const startAngle = Math.atan2(fz, fx) + Math.PI; // bias toward rear
  const step = Math.max(2.8, radius * 1.4);
  for (let ring = 1; ring <= 16; ring++) {
    const n = Math.max(10, ring * 6);
    for (let i = 0; i < n; i++) {
      const angle = startAngle + (i / n) * Math.PI * 2;
      const x = THREE_clamp(spiralOriginX + Math.cos(angle) * step * ring, -half, half);
      const z = THREE_clamp(spiralOriginZ + Math.sin(angle) * step * ring, -half, half);
      const hit = trySite(x, z);
      if (hit) return hit;
    }
  }

  // Last resort: clear pad near own base — still refuse the wrong half of the map.
  const fallbackOrigin = { x: own.x - fx * 8, z: own.z - fz * 8 };
  const pad = scenery.findClearVehiclePlacement(
    fallbackOrigin.x,
    fallbackOrigin.z,
    radius,
    mapDef
  );
  if (pad && isOnOwnSideOfMap(pad.x, pad.z, axis)) return pad;
  // Absolute fallback: clamp preferred onto own half along the front axis.
  const midX = (axis.own.x + axis.foe.x) * 0.5;
  const midZ = (axis.own.z + axis.foe.z) * 0.5;
  const along = (preferredX - midX) * fx + (preferredZ - midZ) * fz;
  if (along > 0) {
    // Preferred is on the foe's half — pull it back to own side of midplane.
    return {
      x: THREE_clamp(midX - fx * 12, -half, half),
      z: THREE_clamp(midZ - fz * 12, -half, half),
    };
  }
  return pad ?? { x: preferredX, z: preferredZ };
}

function THREE_clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

/**
 * Relocate units out of intact building footprints before creation.
 * Vehicles always search; foot troops are also nudged clear so AI does not
 * start (and dig trenches) inside Berlin tenements.
 * @param {{ team?: string }} [options]
 */
export function resolveUnitSpawnPosition(def, x, z, scenery, mapDef = null, options = {}) {
  if (!scenery?.findClearVehiclePlacement) return { x, z };
  if (def?.type === 'artillery' && mapDef?.terrain === 'urban') {
    const team = options.team ?? null;
    // Opening army / auto-deploy: park howitzers in the rear on open ground.
    // Manual clicks (Last Stand) only need a clear pad near the requested point.
    if (options.forceAssemblyRear) {
      return (
        resolveUrbanArtilleryPlacement(x, z, scenery, mapDef, { team }) ?? { x, z }
      );
    }
    const pad =
      scenery.findClearVehiclePlacement(x, z, vehicleSpawnRadius('artillery'), mapDef) ?? {
        x,
        z,
      };
    // Still refuse drifting onto the opposing half when team is known.
    if (team) {
      const axis = frontAxisForTeam(mapDef, team);
      if (axis && !isOnOwnSideOfMap(pad.x, pad.z, axis)) {
        return (
          resolveUrbanArtilleryPlacement(x, z, scenery, mapDef, { team }) ?? pad
        );
      }
    }
    return pad;
  }
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
  const assaultDeployment =
    roster === 'assaultAttack'
      ? 'attack'
      : roster === 'assaultDefend'
        ? 'defend'
        : null;
  let layout = ensureRadioOperatorLayout(
    resolveLayout({ roster, tutorial, team, campaign, baseBuilding })
  );
  if (team === 'enemy' && !tutorial) {
    layout = scaleEnemyLayout(layout, enemyArmyMult);
  }
  const units = [];
  let row = 0;
  let forwardX = 0;
  let forwardZ = 0;
  let lateralX = 0;
  let lateralZ = 0;
  if (assaultDeployment && mapDef && base) {
    const target = mapDef.frontline ?? {
      x: ((mapDef.playerBase?.x ?? 0) + (mapDef.enemyBase?.x ?? 0)) * 0.5,
      z: ((mapDef.playerBase?.z ?? 0) + (mapDef.enemyBase?.z ?? 0)) * 0.5,
    };
    const len = Math.hypot(target.x - base.x, target.z - base.z) || 1;
    forwardX = (target.x - base.x) / len;
    forwardZ = (target.z - base.z) / len;
    lateralX = -forwardZ;
    lateralZ = forwardX;
  } else if (clearanceSpawn && mapDef && base) {
    const target = mapDef.frontline ?? {
      x: ((mapDef.playerBase?.x ?? 0) + (mapDef.enemyBase?.x ?? 0)) * 0.5,
      z: ((mapDef.playerBase?.z ?? 0) + (mapDef.enemyBase?.z ?? 0)) * 0.5,
    };
    const len = Math.hypot(target.x - base.x, target.z - base.z) || 1;
    forwardX = (target.x - base.x) / len;
    forwardZ = (target.z - base.z) / len;
    lateralX = -forwardZ;
    lateralZ = forwardX;
  } else if (tutorial && mapDef?.playerBase && mapDef?.enemyBase) {
    const own = team === 'enemy' ? mapDef.enemyBase : mapDef.playerBase;
    const foe = team === 'enemy' ? mapDef.playerBase : mapDef.enemyBase;
    const len = Math.hypot(foe.x - own.x, foe.z - own.z) || 1;
    forwardX = (foe.x - own.x) / len;
    forwardZ = (foe.z - own.z) / len;
    lateralX = -forwardZ;
    lateralZ = forwardX;
  }

  const urban = mapDef?.terrain === 'urban';
  const axis = frontAxisForTeam(mapDef, team);

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
      } else if (tutorial) {
        const deployment = getTrainingDeploymentOffset(slot.type, i, slot.count);
        x = base.x + forwardX * deployment.forward + lateralX * deployment.lateral;
        z = base.z + forwardZ * deployment.forward + lateralZ * deployment.lateral;
      } else if (assaultDeployment) {
        const deployment = getAssaultDeploymentOffset(
          assaultDeployment,
          slot.type,
          i,
          slot.count
        );
        x = base.x + forwardX * deployment.forward + lateralX * deployment.lateral;
        z = base.z + forwardZ * deployment.forward + lateralZ * deployment.lateral;
      } else if (slot.type === 'artillery' && urban && axis) {
        // Howitzers assemble well behind the HQ line on open streets — never in
        // the front ranks and never tucked into a tenement block.
        const rear = 12 + i * 3;
        const side = (i - (slot.count - 1) / 2) * 9 + (team === 'enemy' ? 4 : -4);
        x = axis.own.x - axis.fx * rear + axis.lx * side;
        z = axis.own.z - axis.fz * rear + axis.lz * side;
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
      if ((clearanceSpawn || tutorial || assaultDeployment) && mapDef) {
        const half = (mapDef.size ?? 120) * 0.5 - 5;
        x = Math.max(-half, Math.min(half, x));
        z = Math.max(-half, Math.min(half, z));
      }
      const position = resolveUnitSpawnPosition(def, x, z, scenery, mapDef, {
        // Breakthrough can swap the teams' physical map sides. Let urban
        // artillery infer its rear from the requested formation position.
        team: assaultDeployment || clearanceSpawn ? null : team,
        forceAssemblyRear: true,
      });
      if (!position) continue;

      const unit = new Unit({
        def,
        faction,
        team,
        position,
        scene,
      });
      if (tutorial || assaultDeployment) {
        snapUnitYaw(unit, Math.atan2(forwardX, forwardZ));
      }
      units.push(unit);
    }
    row++;
  }

  return units;
}

export function spawnUnitAt({
  def,
  faction,
  team,
  x,
  z,
  scene,
  mapDef = null,
  scenery = null,
  skipTeamBias = false,
}) {
  const position = resolveUnitSpawnPosition(def, x, z, scenery, mapDef, {
    team: skipTeamBias ? null : team,
  });
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
