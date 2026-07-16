import * as THREE from 'three';
import { distanceBetween, distanceToPoint } from './Targeting.js';
import { isUnitMounted } from './TankRiders.js';

export const BUNKER_GARRISON_COVER_MULT = 0.12;

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
    syncBunkerOccupancyVisual(found.entry);
  }
  unit._garrisonBunkerId = null;
  unit._garrisonSlotIndex = null;
  unit.garrisoned = false;
  if (unit.mesh) unit.mesh.visible = true;
}

/** Green roof badge showing how many troops are inside a bunker. */
export function syncBunkerOccupancyVisual(bunker) {
  if (!bunker?.mesh) return;
  const n = bunker.garrison?.length ?? 0;
  const cap = bunker.def?.garrisonCapacity ?? 2;
  let badge = bunker.mesh.getObjectByName('garrisonOccupancyBadge');

  if (n <= 0) {
    if (badge) {
      badge.visible = false;
    }
    return;
  }

  if (!badge) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const tex = new THREE.CanvasTexture(canvas);
    tex.userData.canvas = canvas;
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    badge = new THREE.Sprite(mat);
    badge.name = 'garrisonOccupancyBadge';
    badge.scale.set(3.8, 1.9, 1);
    badge.renderOrder = 28;
    badge.position.set(0, 4.2, 0);
    bunker.mesh.add(badge);
  }

  const canvas = badge.material.map.userData.canvas;
  if (canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 128, 64);
    ctx.fillStyle = 'rgba(18, 42, 24, 0.94)';
    ctx.beginPath();
    ctx.roundRect(6, 8, 116, 48, 10);
    ctx.fill();
    ctx.strokeStyle = '#6bcf7a';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#b8f0c0';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('INSIDE', 64, 24);
    ctx.fillStyle = '#e8ffe8';
    ctx.font = '600 14px system-ui, sans-serif';
    ctx.fillText(`${n}/${cap}`, 64, 44);
    badge.material.map.needsUpdate = true;
  }
  badge.visible = true;
  badge.position.y = 4.2 + Math.min(n, 3) * 0.15;
}

export function tryEnterBunker(unit, bunker, sources) {
  if (!unit || unit.dead || unit.surrendered || unit._captureExit || isUnitMounted(unit)) {
    return false;
  }
  if (!bunker || bunker.destroyed || bunker.building || !bunker.def?.garrison) return false;
  if (!canGarrisonType(unit.def?.type)) return false;
  if (bunker.neutralGarrison) {
    if (bunker.garrisonTeam && bunker.garrisonTeam !== unit.team) return false;
  } else if (bunker.team !== unit.team && (bunker.garrison?.length ?? 0) > 0) {
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
  unit._garrisonSlotIndex = bunker.garrison.length - 1;
  unit.garrisoned = true;
  unit.attackOrder = null;
  unit.target = null;
  unit._chasingAttack = false;
  unit._manualFireMission = false;
  finishGarrisonEnter(unit);
  unit.retreating = false;
  unit.position.x = bunker.x + (bunker.garrison.length - 1) * 0.35 - 0.35;
  unit.position.z = bunker.z;
  // Always hide the unit mesh while inside — field icons + INSIDE banner show occupancy
  if (unit.mesh) unit.mesh.visible = false;
  syncBunkerOccupancyVisual(bunker);
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
      unit._garrisonSlotIndex = idx >= 0 ? idx : 0;
      unit.position.x = bunker.x + unit._garrisonSlotIndex * 0.35 - 0.35;
      unit.position.z = bunker.z;
      unit.garrisoned = true;
      if (unit.mesh) unit.mesh.visible = false;
      syncBunkerOccupancyVisual(bunker);
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
