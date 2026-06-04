/** Combat targeting helpers — ranges in game meters (~10 m per unit). */

export function distanceBetween(a, b) {
  const ax = a.position?.x ?? a.mesh?.position.x;
  const az = a.position?.z ?? a.mesh?.position.z;
  const bx = b.position?.x ?? b.mesh?.position.x;
  const bz = b.position?.z ?? b.mesh?.position.z;
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

export function distanceToPoint(unit, point) {
  const dx = unit.position.x - point.x;
  const dz = unit.position.z - point.z;
  return Math.sqrt(dx * dx + dz * dz);
}

export function isInRange(attacker, target, slack = 1.02) {
  if (!target || target.dead) return false;
  return distanceBetween(attacker, target) <= attacker.def.range * slack;
}

export function isPointInRange(unit, point, slack = 1.02) {
  return distanceToPoint(unit, point) <= unit.def.range * slack;
}

export function isInCoaxRange(attacker, target, slack = 1.02) {
  const mg = attacker.def?.coaxMG;
  if (!mg || !target || target.dead || target.isGround) return false;
  return distanceBetween(attacker, target) <= mg.range * slack;
}

export function getStandoffPosition(attacker, target, fraction = 0.82) {
  const tx = target.position?.x ?? target.mesh?.position.x;
  const tz = target.position?.z ?? target.mesh?.position.z;
  const dx = tx - attacker.position.x;
  const dz = tz - attacker.position.z;
  const dist = Math.sqrt(dx * dx + dz * dz) || 1;
  const desired = attacker.def.range * fraction;
  const inset = target.isScenery ? (target.hitRadius ?? 2) : 0;
  const stopDist = Math.max(desired, 3 + inset);
  const ratio = dist > stopDist ? (dist - stopDist) / dist : 0;
  return {
    x: attacker.position.x + dx * ratio,
    z: attacker.position.z + dz * ratio,
  };
}

/** Limit auto-target scans to enemies within this multiple of attack range. */
export function filterAcquireNearAttacker(attacker, targets, rangeMult = 2.25) {
  if (!targets?.length) return targets;
  const maxSq = (attacker.def.range * rangeMult) ** 2;
  const ax = attacker.position.x;
  const az = attacker.position.z;
  const near = [];
  for (const other of targets) {
    if (other.dead || other.team === attacker.team) continue;
    const tx = other.position?.x ?? other.mesh?.position.x ?? 0;
    const tz = other.position?.z ?? other.mesh?.position.z ?? 0;
    const dx = tx - ax;
    const dz = tz - az;
    if (dx * dx + dz * dz <= maxSq) near.push(other);
  }
  return near.length > 0 ? near : targets;
}

export function findNearestEnemyInRange(unit, targets, maxRangeMultiplier = 1) {
  let bestUnit = null;
  let bestUnitDist = Infinity;
  let bestStructure = null;
  let bestStructureDist = Infinity;
  const maxR = unit.def.range * maxRangeMultiplier;
  for (const other of targets) {
    if (other.dead || other.team === unit.team) continue;
    const d = distanceBetween(unit, other);
    if (d > maxR) continue;
    const isUnit = other.def !== undefined;
    if (isUnit) {
      if (d < bestUnitDist) {
        bestUnitDist = d;
        bestUnit = other;
      }
    } else if (d < bestStructureDist) {
      bestStructureDist = d;
      bestStructure = other;
    }
  }
  return bestUnit ?? bestStructure;
}

export function findNearestEnemy(unit, targets) {
  let best = null;
  let bestDist = Infinity;
  for (const other of targets) {
    if (other.dead || other.team === unit.team) continue;
    const d = distanceBetween(unit, other);
    if (d < bestDist) {
      bestDist = d;
      best = other;
    }
  }
  return best;
}

/** Create a ground fire mission target. */
export function createGroundTarget(x, z) {
  return {
    isGround: true,
    dead: false,
    team: null,
    position: { x, z, y: 0 },
    mesh: { position: { x, z, y: 0 } },
    takeDamage() {},
  };
}