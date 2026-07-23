import {
  getUrbanRoadExtent,
  getUrbanStreetSpacing,
  nearestUrbanRoadCenter,
  urbanRoadHalfWidth,
} from '../world/UrbanLayout.js';

const EPSILON = 0.05;

function roadCandidates(x, z, mapDef, allowNearest = false) {
  const roadX = nearestUrbanRoadCenter(x, mapDef);
  const roadZ = nearestUrbanRoadCenter(z, mapDef);
  const halfWidth = urbanRoadHalfWidth(mapDef, 0.8);
  const candidates = [];

  if (Math.abs(x - roadX) <= halfWidth) {
    candidates.push({ axis: 'vertical', x: roadX, z });
  }
  if (Math.abs(z - roadZ) <= halfWidth) {
    candidates.push({ axis: 'horizontal', x, z: roadZ });
  }
  if (candidates.length || !allowNearest) return candidates;

  const dx = Math.abs(x - roadX);
  const dz = Math.abs(z - roadZ);
  return dx <= dz
    ? [{ axis: 'vertical', x: roadX, z }]
    : [{ axis: 'horizontal', x, z: roadZ }];
}

export function isUrbanRoadPoint(x, z, mapDef) {
  return mapDef?.terrain === 'urban' && roadCandidates(x, z, mapDef, false).length > 0;
}

function dedupe(points) {
  const result = [];
  for (const point of points) {
    const last = result[result.length - 1];
    if (!last || Math.hypot(point.x - last.x, point.z - last.z) > EPSILON) {
      result.push(point);
    }
  }
  return result;
}

function routeLength(fromX, fromZ, points) {
  let length = 0;
  let x = fromX;
  let z = fromZ;
  for (const point of points) {
    length += Math.hypot(point.x - x, point.z - z);
    x = point.x;
    z = point.z;
  }
  return length;
}

function streetCoordinates(mapDef) {
  const extent = getUrbanRoadExtent(mapDef);
  const spacing = getUrbanStreetSpacing(mapDef);
  const count = Math.round((extent * 2) / spacing);
  return Array.from({ length: count + 1 }, (_, index) => -extent + index * spacing);
}

function nodeKey(ix, iz) {
  return `${ix}:${iz}`;
}

function projectionAttachments(candidate, coordinates, isBlocked) {
  const attachments = [];
  for (let index = 0; index < coordinates.length; index++) {
    const intersection =
      candidate.axis === 'vertical'
        ? { x: candidate.x, z: coordinates[index] }
        : { x: coordinates[index], z: candidate.z };
    if (isBlocked(candidate.x, candidate.z, intersection.x, intersection.z)) continue;
    const ix =
      candidate.axis === 'vertical'
        ? coordinates.findIndex((value) => Math.abs(value - candidate.x) < EPSILON)
        : index;
    const iz =
      candidate.axis === 'vertical'
        ? index
        : coordinates.findIndex((value) => Math.abs(value - candidate.z) < EPSILON);
    if (ix < 0 || iz < 0) continue;
    attachments.push({
      ix,
      iz,
      cost: Math.hypot(intersection.x - candidate.x, intersection.z - candidate.z),
    });
  }
  return attachments;
}

function findIntersectionRoute(start, goal, coordinates, isBlocked) {
  const startAttachments = projectionAttachments(start, coordinates, isBlocked);
  const goalAttachments = projectionAttachments(goal, coordinates, isBlocked);
  if (!startAttachments.length || !goalAttachments.length) return null;

  const goalCosts = new Map(
    goalAttachments.map((attachment) => [
      nodeKey(attachment.ix, attachment.iz),
      attachment.cost,
    ])
  );
  const distances = new Map();
  const previous = new Map();
  const open = [];

  for (const attachment of startAttachments) {
    const key = nodeKey(attachment.ix, attachment.iz);
    if (attachment.cost >= (distances.get(key) ?? Infinity)) continue;
    distances.set(key, attachment.cost);
    open.push({ ...attachment, key, cost: attachment.cost });
  }

  let bestGoal = null;
  let bestGoalCost = Infinity;
  const edgeBlocked = new Map();
  const blockedEdge = (ax, az, bx, bz) => {
    const key =
      ax < bx || (ax === bx && az <= bz)
        ? `${ax}:${az}-${bx}:${bz}`
        : `${bx}:${bz}-${ax}:${az}`;
    if (!edgeBlocked.has(key)) {
      edgeBlocked.set(
        key,
        isBlocked(coordinates[ax], coordinates[az], coordinates[bx], coordinates[bz])
      );
    }
    return edgeBlocked.get(key);
  };

  while (open.length) {
    open.sort((a, b) => a.cost - b.cost);
    const current = open.shift();
    if (current.cost !== distances.get(current.key)) continue;
    if (current.cost >= bestGoalCost) break;

    const finishCost = goalCosts.get(current.key);
    if (finishCost != null && current.cost + finishCost < bestGoalCost) {
      bestGoal = current;
      bestGoalCost = current.cost + finishCost;
    }

    const neighbours = [
      [current.ix - 1, current.iz],
      [current.ix + 1, current.iz],
      [current.ix, current.iz - 1],
      [current.ix, current.iz + 1],
    ];
    for (const [ix, iz] of neighbours) {
      if (ix < 0 || iz < 0 || ix >= coordinates.length || iz >= coordinates.length) continue;
      if (blockedEdge(current.ix, current.iz, ix, iz)) continue;
      const cost =
        current.cost +
        Math.hypot(
          coordinates[ix] - coordinates[current.ix],
          coordinates[iz] - coordinates[current.iz]
        );
      const key = nodeKey(ix, iz);
      if (cost >= (distances.get(key) ?? Infinity)) continue;
      distances.set(key, cost);
      previous.set(key, current.key);
      open.push({ ix, iz, key, cost });
    }
  }

  if (!bestGoal) return null;
  const intersections = [];
  let key = bestGoal.key;
  while (key) {
    const [ix, iz] = key.split(':').map(Number);
    intersections.push({ x: coordinates[ix], z: coordinates[iz] });
    key = previous.get(key);
  }
  intersections.reverse();
  return intersections;
}

function routeBetween(start, goal, coordinates, isBlocked) {
  const direct = dedupe([start, goal]);
  let x = start.x;
  let z = start.z;
  let directClear = true;
  for (const point of direct) {
    if (isBlocked(x, z, point.x, point.z)) {
      directClear = false;
      break;
    }
    x = point.x;
    z = point.z;
  }
  const sameStreet =
    (start.axis === 'vertical' &&
      goal.axis === 'vertical' &&
      Math.abs(start.x - goal.x) < EPSILON) ||
    (start.axis === 'horizontal' &&
      goal.axis === 'horizontal' &&
      Math.abs(start.z - goal.z) < EPSILON);
  if (sameStreet && directClear) return direct;

  const intersections = findIntersectionRoute(start, goal, coordinates, isBlocked);
  if (!intersections) return null;
  return dedupe([start, ...intersections, goal]);
}

/**
 * Route a mechanical unit over Berlin's connected street graph. Every graph
 * edge follows a rendered road centreline; blocked streets are bypassed via
 * other intersections instead of falling back to free-space building A*.
 * Returns null when the requested destination is deliberately off-road or no
 * connected street route exists.
 */
export function buildUrbanRoadPath(
  fromX,
  fromZ,
  toX,
  toZ,
  mapDef,
  isBlocked = () => false
) {
  if (mapDef?.terrain !== 'urban') return null;

  const starts = roadCandidates(fromX, fromZ, mapDef, true);
  const goals = roadCandidates(toX, toZ, mapDef, false);
  if (!starts.length || !goals.length) return null;

  const coordinates = streetCoordinates(mapDef);
  let best = null;
  let bestLength = Infinity;
  for (const start of starts) {
    if (isBlocked(fromX, fromZ, start.x, start.z)) continue;
    for (const goal of goals) {
      if (isBlocked(goal.x, goal.z, toX, toZ)) continue;
      const between = routeBetween(start, goal, coordinates, isBlocked);
      if (!between) continue;
      const points = dedupe([...between, { x: toX, z: toZ }]);
      const length = routeLength(fromX, fromZ, points);
      if (length < bestLength) {
        best = points;
        bestLength = length;
      }
    }
  }
  return best;
}
