/** Formation spacing when issuing move orders to multiple selected units. */

const UNIT_FORMATION_SPACING = {
  infantry: 2.4,
  medic: 2.2,
  engineer: 2.2,
  machineGun: 3,
  sniper: 2.6,
  mortar: 3.4,
  antiTankGun: 3.8,
  armoredCar: 4.2,
  tank: 5,
  superHeavyTank: 5.8,
  artillery: 4.8,
};

function formationSpacing(unit) {
  return UNIT_FORMATION_SPACING[unit.def?.type] ?? 3.2;
}

function selectionCentroid(units) {
  let x = 0;
  let z = 0;
  for (const unit of units) {
    x += unit.position.x;
    z += unit.position.z;
  }
  const n = units.length;
  return { x: x / n, z: z / n };
}

function maxOffsetMagnitude(offsets) {
  let max = 0;
  for (const offset of offsets) {
    max = Math.max(max, Math.hypot(offset.dx, offset.dz));
  }
  return max;
}

function buildGridDestinations(units, centerX, centerZ) {
  const sorted = [...units].sort((a, b) => a.id - b.id);
  const count = sorted.length;
  const cols = Math.ceil(Math.sqrt(count * 1.35));
  const rows = Math.ceil(count / cols);
  const cell = Math.max(...sorted.map(formationSpacing));

  const destinations = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    destinations.push({
      unit: sorted[i],
      x: centerX + (col - (cols - 1) / 2) * cell,
      z: centerZ + (row - (rows - 1) / 2) * cell * 0.85,
    });
  }
  return destinations;
}

function resolveDestinationOverlaps(destinations) {
  const points = destinations.map((dest) => ({ ...dest }));

  for (let pass = 0; pass < 10; pass++) {
    let moved = false;
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const dx = points[j].x - points[i].x;
        const dz = points[j].z - points[i].z;
        const dist = Math.hypot(dx, dz);
        const need = (formationSpacing(points[i].unit) + formationSpacing(points[j].unit)) * 0.42;

        if (dist >= need) continue;

        moved = true;
        if (dist > 0.001) {
          const push = (need - dist) * 0.5;
          const nx = dx / dist;
          const nz = dz / dist;
          points[i].x -= nx * push;
          points[i].z -= nz * push;
          points[j].x += nx * push;
          points[j].z += nz * push;
        } else {
          const angle = (i + j) * 1.37;
          const half = need * 0.5;
          points[i].x -= Math.cos(angle) * half;
          points[i].z -= Math.sin(angle) * half;
          points[j].x += Math.cos(angle) * half;
          points[j].z += Math.sin(angle) * half;
        }
      }
    }
    if (!moved) break;
  }

  return points;
}

/**
 * Assign per-unit move destinations around a shared rally point.
 * Preserves selection shape when spread out; uses a spaced grid when stacked.
 */
export function spreadGroupMoveDestinations(units, centerX, centerZ) {
  if (!units?.length) return [];
  if (units.length === 1) {
    return [{ unit: units[0], x: centerX, z: centerZ }];
  }

  const centroid = selectionCentroid(units);
  const offsets = units.map((unit) => ({
    unit,
    dx: unit.position.x - centroid.x,
    dz: unit.position.z - centroid.z,
  }));

  const destinations =
    maxOffsetMagnitude(offsets) < 3
      ? buildGridDestinations(units, centerX, centerZ)
      : offsets.map(({ unit, dx, dz }) => ({
          unit,
          x: centerX + dx,
          z: centerZ + dz,
        }));

  return resolveDestinationOverlaps(destinations);
}