import * as THREE from 'three';

/** Grouser boxes sit just outside the hollow belt so they read as track shoes. */
export const TRACK_SHOE_THICKNESS = 0.036;
export const TRACK_SHOE_LENGTH = 0.105;
export const TRACK_SHOE_EXTRA_R = TRACK_SHOE_THICKNESS * 0.5 + 0.002;

const TWO_PI = Math.PI * 2;
const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);
const _euler = new THREE.Euler(0, 0, 0, 'XYZ');
const _sample = { y: 0, z: 0, pitch: 0, perimeter: 0 };

function wrapAngle(angle) {
  let a = angle % TWO_PI;
  if (a > Math.PI) a -= TWO_PI;
  if (a < -Math.PI) a += TWO_PI;
  return a;
}

export function measureTrackLoop(spec, extraR = TRACK_SHOE_EXTRA_R) {
  const innerR = spec.height * 0.5;
  const radius = innerR + extraR;
  const endZ = spec.length * 0.5 - innerR;
  const straight = Math.max(0.001, 2 * endZ);
  const perimeter = 2 * straight + 2 * Math.PI * radius;
  return { radius, endZ, straight, perimeter };
}

/**
 * Racetrack around a track run, in hull YZ relative to the belt centre.
 * t increases in the direction the belt travels for a forward-moving hull:
 * bottom grousers go rearward so they stay planted in world space.
 */
export function sampleTrackLoop(spec, t, extraR = TRACK_SHOE_EXTRA_R, out = _sample) {
  const { radius, endZ, straight, perimeter } = measureTrackLoop(spec, extraR);
  let s = (((t % 1) + 1) % 1) * perimeter;
  const arc = Math.PI * radius;

  let y;
  let z;
  let pitch;
  if (s <= straight) {
    const u = s / straight;
    y = -radius;
    z = endZ - u * straight;
    pitch = Math.PI;
  } else if (s <= straight + arc) {
    const theta = -Math.PI / 2 - (s - straight) / radius;
    y = Math.sin(theta) * radius;
    z = -endZ + Math.cos(theta) * radius;
    pitch = Math.PI / 2 - theta;
  } else if (s <= 2 * straight + arc) {
    const u = (s - straight - arc) / straight;
    y = radius;
    z = -endZ + u * straight;
    pitch = 0;
  } else {
    const theta = Math.PI / 2 - (s - 2 * straight - arc) / radius;
    y = Math.sin(theta) * radius;
    z = endZ + Math.cos(theta) * radius;
    pitch = Math.PI / 2 - theta;
  }

  out.y = y;
  out.z = z;
  out.pitch = pitch;
  out.perimeter = perimeter;
  return out;
}

export function layoutTrackShoes(run, phase = 0) {
  const { shoes, linkCount, spec, extraR, x, trackY } = run;
  for (let i = 0; i < linkCount; i++) {
    sampleTrackLoop(spec, i / linkCount + phase, extraR, _sample);
    _position.set(x, trackY + _sample.y, _sample.z);
    _euler.set(_sample.pitch, 0, 0);
    _quaternion.setFromEuler(_euler);
    _matrix.compose(_position, _quaternion, _scale);
    shoes.setMatrixAt(i, _matrix);
  }
  shoes.instanceMatrix.needsUpdate = true;
}

export function registerTrackRun(group, run) {
  const anim = (group.userData.trackAnimation ??= {
    runs: [],
    lastX: null,
    lastZ: null,
    lastYaw: null,
  });
  anim.runs.push(run);
  layoutTrackShoes(run, 0);
  const { shoes, spec, x, trackY } = run;
  if (typeof shoes.computeBoundingSphere === 'function') {
    shoes.computeBoundingSphere();
  } else {
    const reach = spec.length * 0.5 + spec.height * 0.6;
    shoes.boundingSphere = new THREE.Sphere(new THREE.Vector3(x, trackY, 0), reach);
  }
}

function syncTrackPose(anim, x, z, yaw) {
  anim.lastX = x;
  anim.lastZ = z;
  anim.lastYaw = yaw;
}

function applyRunMotion(run, distance) {
  if (!Number.isFinite(distance) || Math.abs(distance) < 1e-7) return;
  run.distance += distance;
  layoutTrackShoes(run, run.distance / run.perimeter);
  for (const wheel of run.wheels) {
    wheel.mesh.rotation[wheel.axis] = wheel.sign * (run.distance / wheel.radius);
  }
}

/** Roll grousers and road wheels with hull travel, reverse, and track-pivot yaw. */
export function updateTrackedVehicleAnimation(unit) {
  const mesh = unit?.mesh;
  const anim = mesh?.userData?.trackAnimation;
  if (!anim?.runs?.length) return;

  const x = unit.position?.x ?? mesh.position.x;
  const z = unit.position?.z ?? mesh.position.z;
  const yaw = mesh.rotation.y ?? 0;

  if (
    unit.dead ||
    unit._mobilityDamaged ||
    mesh.userData.wreckApplied ||
    mesh.userData.corpseApplied
  ) {
    syncTrackPose(anim, x, z, yaw);
    return;
  }

  if (anim.lastX == null) {
    syncTrackPose(anim, x, z, yaw);
    return;
  }

  const dx = x - anim.lastX;
  const dz = z - anim.lastZ;
  const yawDelta = wrapAngle(yaw - anim.lastYaw);
  syncTrackPose(anim, x, z, yaw);

  const signedDist = dx * Math.sin(yaw) + dz * Math.cos(yaw);
  if (Math.abs(signedDist) < 1e-5 && Math.abs(yawDelta) < 1e-5) return;

  for (const run of anim.runs) {
    applyRunMotion(run, signedDist + run.side * yawDelta * run.spread);
  }
}
