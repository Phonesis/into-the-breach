import { distanceBetween } from './Targeting.js';

export const BUNKER_GARRISON_COVER_MULT = 0.22;
export const BUNKER_ENTER_RANGE = 3.8;

const GARRISON_TYPES = new Set(['infantry', 'machineGun', 'sniper', 'medic']);

export function canGarrisonType(unitType) {
  return GARRISON_TYPES.has(unitType);
}

export function isUnitGarrisoned(unit) {
  return !!unit?._garrisonBunkerId;
}

export function getGarrisonCoverMultiplier(unit) {
  return isUnitGarrisoned(unit) ? BUNKER_GARRISON_COVER_MULT : 1;
}

/** Collect managers that own garrison-capable bunkers (HQ builds + engineer field bunkers). */
export function getGarrisonBunkerSources(game) {
  const sources = [];
  if (game?.baseBuildings?.active) sources.push(game.baseBuildings);
  if (game?.engineerSandbags?.hasGarrisonBunkers?.()) sources.push(game.engineerSandbags);
  return sources;
}

function normalizeGarrisonSources(sources) {
  if (!sources) return [];
  if (Array.isArray(sources)) return sources.filter(Boolean);
  if (sources.baseBuildings || sources.engineerSandbags) {
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

export function releaseFromBunker(unit, sources) {
  if (!unit?._garrisonBunkerId) return;
  const list = normalizeGarrisonSources(sources);
  const found = findBunkerEntry(unit._garrisonBunkerId, list);
  if (found?.entry?.garrison) {
    found.entry.garrison = found.entry.garrison.filter((id) => id !== unit.id);
  }
  unit._garrisonBunkerId = null;
  if (unit.mesh) unit.mesh.visible = true;
}

export function tryEnterBunker(unit, bunker, sources) {
  if (!unit || unit.dead || unit.surrendered || unit._captureExit) return false;
  if (!bunker || bunker.destroyed || bunker.building || !bunker.def?.garrison) return false;
  if (!canGarrisonType(unit.def?.type)) return false;
  if (bunker.team !== unit.team) return false;

  const cap = bunker.def.garrisonCapacity ?? 2;
  if ((bunker.garrison?.length ?? 0) >= cap) return false;
  if (distanceBetween(unit, { position: { x: bunker.x, z: bunker.z } }) > BUNKER_ENTER_RANGE) {
    return false;
  }

  releaseFromBunker(unit, sources);
  bunker.garrison = bunker.garrison ?? [];
  bunker.garrison.push(unit.id);
  unit._garrisonBunkerId = bunker.id;
  unit.clearAttackOrder();
  unit.moveTarget = null;
  unit._movePath = null;
  unit.retreating = false;
  unit.position.x = bunker.x + (bunker.garrison.length - 1) * 0.35 - 0.35;
  unit.position.z = bunker.z;
  if (unit.mesh) unit.mesh.visible = true;
  return true;
}

export function updateBunkerGarrison(units, sources) {
  const list = normalizeGarrisonSources(sources);
  if (!list.length) return;

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
      continue;
    }

    if (!unit.moveTarget || unit.retreating || unit.surrendered) continue;
    const dest = unit.moveTarget;
    const bunker = pickBunkerAtAny(dest.x, dest.z, unit.team, list, 4.5);
    if (!bunker) continue;
    if (distanceBetween(unit, { position: dest }) <= BUNKER_ENTER_RANGE + 0.5) {
      if (tryEnterBunker(unit, bunker, list)) {
        unit.moveTarget = null;
        unit._movePath = null;
      }
    }
  }
}