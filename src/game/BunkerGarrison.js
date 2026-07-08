import { distanceBetween, distanceToPoint } from './Targeting.js';
import { isUnitMounted } from './TankRiders.js';

export const BUNKER_GARRISON_COVER_MULT = 0.22;

const GARRISON_TYPES = new Set(['infantry', 'machineGun', 'sniper', 'medic', 'engineer']);

export function canGarrisonType(unitType) {
  return GARRISON_TYPES.has(unitType);
}

export function isUnitGarrisoned(unit) {
  return !!unit?._garrisonBunkerId;
}

export function getGarrisonCoverMultiplier(unit) {
  return isUnitGarrisoned(unit) ? BUNKER_GARRISON_COVER_MULT : 1;
}

/** How close a unit must be to a bunker center to enter (uses building footprint). */
export function getBunkerEnterRange(bunker) {
  const footprint = bunker?.def?.hitRadius ?? bunker?.def?.radius ?? 3.4;
  return footprint + 1.1;
}

/** Collect managers that own garrison-capable bunkers / shelters. */
export function getGarrisonBunkerSources(game) {
  const sources = [];
  if (game?.baseBuildings?.active) sources.push(game.baseBuildings);
  if (game?.engineerSandbags?.hasGarrisonBunkers?.()) sources.push(game.engineerSandbags);
  if (game?.scenery?.hasGarrisonShelters?.()) sources.push(game.scenery);
  return sources;
}

function normalizeGarrisonSources(sources) {
  if (!sources) return [];
  if (Array.isArray(sources)) return sources.filter(Boolean);
  if (sources.baseBuildings || sources.engineerSandbags || sources.scenery) {
    return getGarrisonBunkerSources(sources);
  }
  return [sources];
}

function findBunkerEntry(id, sources) {
  for (const src of sources) {
    const entry = src.getEntryById?.(id);
    if (entry && !entry.destroyed) return { entry, manager: src };
  }
  return null;
}

function pickBunkerAtAny(x, z, team, sources, maxDist = 4.5) {
  let best = null;
  let bestD = maxDist;
  for (const src of sources) {
    const bunker = src.pickBunkerAt?.(x, z, team, maxDist);
    if (!bunker) continue;
    const d = Math.hypot(x - bunker.x, z - bunker.z);
    if (d < bestD) {
      bestD = d;
      best = bunker;
    }
  }
  return best;
}

function bunkerCenter(bunker) {
  return { x: bunker.x, z: bunker.z };
}

function finishGarrisonEnter(unit) {
  unit.moveTarget = null;
  unit._movePath = null;
  unit._userMoveOrder = false;
  unit._bunkerEntryId = null;
}

export function releaseFromBunker(unit, sources) {
  if (!unit?._garrisonBunkerId) return;
  const list = normalizeGarrisonSources(sources);
  const found = findBunkerEntry(unit._garrisonBunkerId, list);
  if (found?.entry?.garrison) {
    found.entry.garrison = found.entry.garrison.filter((id) => id !== unit.id);
    if (found.entry.garrison.length === 0 && found.entry.neutralGarrison) {
      found.entry.garrisonTeam = null;
    }
  }
  unit._garrisonBunkerId = null;
  if (unit.mesh) unit.mesh.visible = true;
}

export function tryEnterBunker(unit, bunker, sources) {
  if (!unit || unit.dead || unit.surrendered || unit._captureExit || isUnitMounted(unit)) {
    return false;
  }
  if (!bunker || bunker.destroyed || bunker.building || !bunker.def?.garrison) return false;
  if (!canGarrisonType(unit.def?.type)) return false;
  if (bunker.neutralGarrison) {
    if (bunker.garrisonTeam && bunker.garrisonTeam !== unit.team) return false;
  } else if (bunker.team !== unit.team) {
    return false;
  }

  const cap = bunker.def.garrisonCapacity ?? 2;
  if ((bunker.garrison?.length ?? 0) >= cap) return false;

  const enterRange = getBunkerEnterRange(bunker);
  if (distanceToPoint(unit, bunkerCenter(bunker)) > enterRange) return false;

  releaseFromBunker(unit, sources);
  bunker.garrison = bunker.garrison ?? [];
  if (bunker.neutralGarrison) bunker.garrisonTeam = unit.team;
  bunker.garrison.push(unit.id);
  unit._garrisonBunkerId = bunker.id;
  unit.attackOrder = null;
  unit.target = null;
  unit._chasingAttack = false;
  unit._manualFireMission = false;
  finishGarrisonEnter(unit);
  unit.retreating = false;
  unit.position.x = bunker.x + (bunker.garrison.length - 1) * 0.35 - 0.35;
  unit.position.z = bunker.z;
  if (unit.mesh) unit.mesh.visible = bunker.hideGarrisoned !== true;
  return true;
}

export function updateBunkerGarrison(units, sources) {
  const list = normalizeGarrisonSources(sources);
  if (!list.length) {
    for (const unit of units) {
      if (unit._garrisonBunkerId) releaseFromBunker(unit, list);
      unit._bunkerEntryId = null;
    }
    return;
  }

  for (const unit of units) {
    if (unit.dead) continue;

    if (unit._garrisonBunkerId) {
      const found = findBunkerEntry(unit._garrisonBunkerId, list);
      const bunker = found?.entry;
      if (!bunker || bunker.destroyed || bunker.building) {
        releaseFromBunker(unit, list);
        continue;
      }
      if (unit.moveTarget) {
        releaseFromBunker(unit, list);
        continue;
      }
      const idx = bunker.garrison.indexOf(unit.id);
      unit.position.x = bunker.x + (idx >= 0 ? idx : 0) * 0.35 - 0.35;
      unit.position.z = bunker.z;
      if (unit.mesh) unit.mesh.visible = bunker.hideGarrisoned !== true;
      continue;
    }

    if (unit.retreating || unit.surrendered || isUnitMounted(unit)) continue;

    let bunker = null;
    if (unit._bunkerEntryId) {
      bunker = findBunkerEntry(unit._bunkerEntryId, list)?.entry ?? null;
      if (!bunker) unit._bunkerEntryId = null;
    }

    if (!bunker && unit.moveTarget) {
      bunker = pickBunkerAtAny(unit.moveTarget.x, unit.moveTarget.z, unit.team, list, 6.5);
    }

    if (!bunker) continue;

    const enterRange = getBunkerEnterRange(bunker);
    const distToBunker = distanceToPoint(unit, bunkerCenter(bunker));
    const distToDest = unit.moveTarget ? distanceToPoint(unit, unit.moveTarget) : Infinity;
    const closeEnough =
      distToBunker <= enterRange ||
      distToDest <= enterRange + 0.6 ||
      (!unit.moveTarget && distToBunker <= enterRange + 0.4);

    if (!closeEnough) continue;

    tryEnterBunker(unit, bunker, list);
  }
}