import * as THREE from 'three';
import { distanceBetween, distanceToPoint } from './Targeting.js';
import { isUnitMounted } from './TankRiders.js';

export const BUNKER_GARRISON_COVER_MULT = 0.12;

const GARRISON_TYPES = new Set([
  'infantry',
  'paratrooper',
  'machineGun',
  'sniper',
  'medic',
  'engineer',
]);

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
  // Scenery buildings store radius on the entry; field bunkers use def.radius.
  const footprint =
    bunker?.def?.hitRadius ??
    bunker?.def?.radius ??
    bunker?.radius ??
    bunker?.coverRadius ??
    3.4;
  return Math.max(4.2, footprint * 0.72 + 1.4);
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

function findBunkerEntry(id, sources, { includeDestroyed = false } = {}) {
  for (const src of sources) {
    let entry = src.getEntryById?.(id);
    if (!entry && includeDestroyed) {
      entry = src.objects?.find?.((candidate) => candidate.id === id)
        ?? src.entries?.find?.((candidate) => candidate.id === id);
    }
    if (entry && (includeDestroyed || !entry.destroyed)) return { entry, manager: src };
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

function bunkerVisualRoot(bunker) {
  return bunker?.mesh ?? bunker?.group ?? null;
}

function garrisonMarkerLift(bunker) {
  const root = bunkerVisualRoot(bunker);
  const bounds = root?.userData?.damageBounds;
  const roof = root?.userData?.roofDamageProfile;
  const structuralHeight = Math.max(
    bounds?.height ?? 0,
    (roof?.bodyHeight ?? 0) + (roof?.roofHeight ?? 0)
  );
  return Math.max(6.6, structuralHeight * Math.max(0.01, root?.scale?.y ?? 1) + 1.35);
}

function findVisibleSquadMember(unit) {
  let member = null;
  unit?.mesh?.traverse?.((child) => {
    if (!member && child.name === 'squadMember' && child.visible) member = child;
  });
  return member;
}

function removeGarrisonLookout(bunker, unitId) {
  const root = bunkerVisualRoot(bunker);
  if (!root) return;
  const lookout = root.children.find(
    (child) => child.userData?.garrisonLookoutUnitId === unitId
  );
  lookout?.removeFromParent();
}

function clearGarrisonLookouts(bunker) {
  const root = bunkerVisualRoot(bunker);
  if (!root) return;
  for (const child of [...root.children]) {
    if (child.userData?.garrisonLookoutUnitId) child.removeFromParent();
  }
}

/** Show a waist-up copy of the actual faction soldier at one of the modelled windows. */
function ensureGarrisonLookout(bunker, unit, slotIndex) {
  const root = bunkerVisualRoot(bunker);
  const windows = root?.userData?.garrisonWindows;
  if (!root || !Array.isArray(windows) || windows.length === 0) return;

  if (unit.surrendered || bunker.destroyed || (root.userData.damageStage ?? 0) >= 5) {
    removeGarrisonLookout(bunker, unit.id);
    return;
  }

  let lookout = root.children.find(
    (child) => child.userData?.garrisonLookoutUnitId === unit.id
  );
  if (!lookout) {
    const sourceSoldier = findVisibleSquadMember(unit);
    if (!sourceSoldier) return;
    const soldier = sourceSoldier.clone(true);
    // Window proxies share the live unit's geometry and materials; never dispose them with scenery.
    soldier.traverse((child) => {
      child.userData.garrisonSharedVisual = true;
    });
    soldier.position.set(0, -0.55, 0);
    soldier.rotation.set(0, 0, 0);
    soldier.scale.setScalar(1.28);
    for (const child of [...soldier.children]) {
      const part = child.userData?.infantryPart;
      if (part === 'legL' || part === 'legR') soldier.remove(child);
    }

    lookout = new THREE.Group();
    lookout.name = 'garrisonLookout';
    lookout.userData.garrisonLookoutUnitId = unit.id;
    lookout.add(soldier);
    root.add(lookout);
  }

  // Spread occupants across floors/facades while preferring already-broken panes.
  const ordered = windows
    .map((window, index) => ({ window, index }))
    .sort((a, b) => Number(b.window.broken) - Number(a.window.broken) || a.index - b.index);
  const capacity = Math.max(1, bunker.def?.garrisonCapacity ?? 2);
  const picked = ordered[Math.floor((Math.max(0, slotIndex) * ordered.length) / capacity) % ordered.length].window;
  lookout.position.set(picked.position.x, picked.position.y, picked.position.z);
  lookout.rotation.set(0, picked.rotationY ?? 0, 0);
  // The landmark church is enlarged as a whole; compensate so its occupants remain human-sized.
  const rootScale = Math.max(root.scale?.x ?? 1, 0.01);
  lookout.scale.setScalar(1 / rootScale);
  lookout.visible = true;
}

/**
 * Leave a bunker/building.
 * @param {{ eject?: boolean, toward?: {x:number,z:number}|null, scenery?: object, mapDef?: object }} [options]
 *        eject places the unit on clear ground outside the footprint so they
 *        can path away instead of re-entering from the interior.
 */
export function releaseFromBunker(unit, sources, options = {}) {
  if (!unit?._garrisonBunkerId) return;
  const list = normalizeGarrisonSources(sources);
  const found = findBunkerEntry(unit._garrisonBunkerId, list, { includeDestroyed: true });
  const bunker = found?.entry ?? null;
  if (bunker?.garrison) {
    removeGarrisonLookout(bunker, unit.id);
    bunker.garrison = bunker.garrison.filter((id) => id !== unit.id);
    if (bunker.garrison.length === 0 && bunker.neutralGarrison) {
      bunker.garrisonTeam = null;
    }
    syncBunkerOccupancyVisual(bunker);
  }
  unit._garrisonBunkerId = null;
  unit._garrisonSlotIndex = null;
  unit._garrisonMarkerLift = null;
  unit.garrisoned = false;
  unit._bunkerEntryId = null;
  // Brief lockout so leave orders are not immediately swallowed by re-entry.
  unit._garrisonExitUntil = (typeof performance !== 'undefined' ? performance.now() : Date.now()) + 1400;
  // A casualty inside a building should clear occupancy without making its
  // previously hidden squad mesh reappear outside as a misplaced corpse.
  if (unit.mesh) unit.mesh.visible = !unit.dead;

  if (options.eject === false || unit.dead || !bunker) return;

  const scenery = options.scenery ?? list.find((src) => typeof src.findClearVehiclePlacement === 'function');
  const mapDef = options.mapDef ?? scenery?.mapDef ?? null;
  const radius = 1.15;
  const reach = (bunker.radius ?? bunker.def?.radius ?? 4) + 3.2;
  const toward = options.toward ?? unit._finalMoveGoal ?? unit.moveTarget ?? null;
  let exit = null;

  if (toward && scenery?.findClearVehiclePlacement) {
    const dx = toward.x - bunker.x;
    const dz = toward.z - bunker.z;
    const len = Math.hypot(dx, dz) || 1;
    exit = scenery.findClearVehiclePlacement(
      bunker.x + (dx / len) * reach,
      bunker.z + (dz / len) * reach,
      radius,
      mapDef
    );
  }
  if (!exit && scenery?.findClearVehiclePlacement) {
    exit = scenery.findClearVehiclePlacement(bunker.x, bunker.z, radius, mapDef);
  }
  if (exit) {
    unit.position.x = exit.x;
    unit.position.z = exit.z;
  }
}

/** Green roof badge showing how many troops are inside a bunker. */
export function syncBunkerOccupancyVisual(bunker) {
  const root = bunkerVisualRoot(bunker);
  if (!root) return;
  const n = bunker.garrison?.length ?? 0;
  const cap = bunker.def?.garrisonCapacity ?? 2;
  let badge = root.getObjectByName('garrisonOccupancyBadge');

  if (n <= 0) {
    if (badge) {
      badge.visible = false;
    }
    clearGarrisonLookouts(bunker);
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
    root.add(badge);
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
  unit._garrisonMarkerLift = garrisonMarkerLift(bunker);
  unit.garrisoned = true;
  unit.attackOrder = null;
  unit.target = null;
  unit._chasingAttack = false;
  unit._manualFireMission = false;
  finishGarrisonEnter(unit);
  unit.retreating = false;
  unit.position.x = bunker.x + (bunker.garrison.length - 1) * 0.35 - 0.35;
  unit.position.z = bunker.z;
  // Hide the gameplay squad; a lightweight faction-correct lookout represents it at a window.
  if (unit.mesh) unit.mesh.visible = false;
  ensureGarrisonLookout(bunker, unit, unit._garrisonSlotIndex);
  syncBunkerOccupancyVisual(bunker);
  return true;
}

/**
 * @param {object[]} units
 * @param {object|object[]} sources
 * @param {{ scenery?: object, mapDef?: object, applyObstaclePath?: Function }} [options]
 */
export function updateBunkerGarrison(units, sources, options = {}) {
  const list = normalizeGarrisonSources(sources);
  const scenery =
    options.scenery ??
    list.find((src) => typeof src.findClearVehiclePlacement === 'function') ??
    null;
  const mapDef = options.mapDef ?? scenery?.mapDef ?? null;
  const applyObstaclePath = options.applyObstaclePath ?? null;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();

  if (!list.length) {
    for (const unit of units) {
      if (unit._garrisonBunkerId) releaseFromBunker(unit, list);
      unit._bunkerEntryId = null;
    }
    return;
  }

  for (const unit of units) {
    if (unit.dead) {
      if (unit._garrisonBunkerId) releaseFromBunker(unit, list, { eject: false });
      unit._bunkerEntryId = null;
      continue;
    }

    if (unit._garrisonBunkerId) {
      const found = findBunkerEntry(unit._garrisonBunkerId, list);
      const bunker = found?.entry;
      if (!bunker || bunker.destroyed || bunker.building) {
        releaseFromBunker(unit, list, { eject: true, scenery, mapDef });
        continue;
      }
      if (unit._captureExit) {
        releaseFromBunker(unit, list, { eject: true, scenery, mapDef });
        continue;
      }
      // Move / retreat order — leave the building and path from the street.
      if (unit.moveTarget || unit.retreating || unit._userMoveOrder) {
        const goal = unit._finalMoveGoal ?? unit.moveTarget;
        releaseFromBunker(unit, list, {
          eject: true,
          toward: goal,
          scenery,
          mapDef,
        });
        if (goal && mapDef && scenery && applyObstaclePath) {
          applyObstaclePath(unit, goal.x, goal.z, mapDef, scenery);
        }
        continue;
      }
      const idx = bunker.garrison.indexOf(unit.id);
      unit._garrisonSlotIndex = idx >= 0 ? idx : 0;
      unit._garrisonMarkerLift = garrisonMarkerLift(bunker);
      unit.position.x = bunker.x + unit._garrisonSlotIndex * 0.35 - 0.35;
      unit.position.z = bunker.z;
      unit.garrisoned = true;
      if (unit.mesh) unit.mesh.visible = false;
      ensureGarrisonLookout(bunker, unit, unit._garrisonSlotIndex);
      syncBunkerOccupancyVisual(bunker);
      continue;
    }

    if (unit.retreating || unit.surrendered || isUnitMounted(unit)) continue;
    // Only enter when explicitly ordered (or AI set entry id). Auto-enter from
    // a nearby moveTarget caused units to re-garrison when trying to leave.
    if (!unit._bunkerEntryId) continue;
    if (unit._garrisonExitUntil && now < unit._garrisonExitUntil) continue;

    const bunker = findBunkerEntry(unit._bunkerEntryId, list)?.entry ?? null;
    if (!bunker) {
      unit._bunkerEntryId = null;
      continue;
    }

    const enterRange = getBunkerEnterRange(bunker);
    const distToBunker = distanceToPoint(unit, bunkerCenter(bunker));
    const distToDest = unit.moveTarget ? distanceToPoint(unit, unit.moveTarget) : Infinity;
    const closeEnough =
      distToBunker <= enterRange ||
      distToDest <= enterRange + 0.6 ||
      (unit._bunkerEntryId === bunker.id && distToBunker <= enterRange * 1.15);

    if (!closeEnough) continue;

    tryEnterBunker(unit, bunker, list);
  }
}
