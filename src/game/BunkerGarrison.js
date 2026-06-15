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

export function releaseFromBunker(unit, baseBuildings) {
  if (!unit?._garrisonBunkerId) return;
  const entry = baseBuildings?.getEntryById?.(unit._garrisonBunkerId);
  if (entry?.garrison) {
    entry.garrison = entry.garrison.filter((id) => id !== unit.id);
  }
  unit._garrisonBunkerId = null;
  if (unit.mesh) unit.mesh.visible = true;
}

export function tryEnterBunker(unit, bunker, baseBuildings) {
  if (!unit || unit.dead || unit.surrendered || unit._captureExit) return false;
  if (!bunker || bunker.destroyed || bunker.building || !bunker.def?.garrison) return false;
  if (!canGarrisonType(unit.def?.type)) return false;
  if (bunker.team !== unit.team) return false;

  const cap = bunker.def.garrisonCapacity ?? 2;
  if ((bunker.garrison?.length ?? 0) >= cap) return false;
  if (distanceBetween(unit, { position: { x: bunker.x, z: bunker.z } }) > BUNKER_ENTER_RANGE) {
    return false;
  }

  releaseFromBunker(unit, baseBuildings);
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

export function updateBunkerGarrison(units, baseBuildings) {
  if (!baseBuildings?.active) return;

  for (const unit of units) {
    if (unit.dead) continue;

    if (unit._garrisonBunkerId) {
      const bunker = baseBuildings.getEntryById(unit._garrisonBunkerId);
      if (!bunker || bunker.destroyed || bunker.building) {
        releaseFromBunker(unit, baseBuildings);
        continue;
      }
      if (unit.moveTarget) {
        releaseFromBunker(unit, baseBuildings);
        continue;
      }
      const idx = bunker.garrison.indexOf(unit.id);
      unit.position.x = bunker.x + (idx >= 0 ? idx : 0) * 0.35 - 0.35;
      unit.position.z = bunker.z;
      continue;
    }

    if (!unit.moveTarget || unit.retreating || unit.surrendered) continue;
    const dest = unit.moveTarget;
    const bunker = baseBuildings.pickBunkerAt(dest.x, dest.z, unit.team, 4.5);
    if (!bunker) continue;
    if (distanceBetween(unit, { position: dest }) <= BUNKER_ENTER_RANGE + 0.5) {
      if (tryEnterBunker(unit, bunker, baseBuildings)) {
        unit.moveTarget = null;
        unit._movePath = null;
      }
    }
  }
}