import * as THREE from 'three';

// Cache ownership is identity-based: Material.clone() copies userData, so a
// marker on the material would incorrectly keep private corpse/wreck clones.
const sharedResources = new WeakSet();
const battleCleanupCallbacks = new Set();

/** A cache owns this resource and is responsible for releasing it. */
export function markSharedResource(resource) {
  if (resource) sharedResources.add(resource);
  return resource;
}

/** Run cache cleanup only after all renderable battle objects are removed. */
export function registerBattleSceneCleanup(callback) {
  battleCleanupCallbacks.add(callback);
}

const TEXTURE_SLOTS = [
  'map',
  'normalMap',
  'bumpMap',
  'roughnessMap',
  'aoMap',
  'emissiveMap',
  'alphaMap',
  'metalnessMap',
  'displacementMap',
  'lightMap',
];

function disposeResource(resource, disposed) {
  if (!resource?.dispose || sharedResources.has(resource) || disposed.has(resource)) return;
  disposed.add(resource);
  resource.dispose();
}

function disposeMaterial(mat, disposed) {
  if (!mat || sharedResources.has(mat) || disposed.has(mat)) return;
  for (const key of TEXTURE_SLOTS) {
    disposeResource(mat[key], disposed);
  }
  disposeResource(mat, disposed);
}

/** Dispose GPU resources on a single object (mesh, line, points, sprite). */
export function disposeObject3D(root, disposed = new Set()) {
  if (!root) return;
  root.traverse((obj) => {
    // InstancedMesh owns separate instance buffers outside its geometry.
    if (obj.isInstancedMesh) disposeResource(obj, disposed);
    disposeResource(obj.geometry, disposed);
    if (obj.material) {
      if (Array.isArray(obj.material)) obj.material.forEach((mat) => disposeMaterial(mat, disposed));
      else disposeMaterial(obj.material, disposed);
    }
  });
}

/** Remove and dispose all children still attached to the battle scene. */
export function disposeBattleScene(scene) {
  if (!scene) return;
  const children = [...scene.children];
  const disposed = new Set();
  for (const child of children) {
    scene.remove(child);
    disposeObject3D(child, disposed);
  }
  for (const cleanup of battleCleanupCallbacks) cleanup();
}

const pendingDispose = [];
let disposeFlushScheduled = false;

function scheduleDisposeFlush() {
  if (disposeFlushScheduled) return;
  disposeFlushScheduled = true;
  const kick = () => {
    disposeFlushScheduled = false;
    flushDisposeQueue();
  };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(kick, { timeout: 120 });
  } else {
    setTimeout(kick, 16);
  }
}

/** Queue mesh disposal (batched — avoids dozens of idle callbacks after mass casualties). */
export function queueMeshDispose(mesh) {
  if (!mesh) return;
  pendingDispose.push(mesh);
  scheduleDisposeFlush();
}

export function flushDisposeQueue() {
  if (pendingDispose.length === 0) return;
  const batch = pendingDispose.splice(0, pendingDispose.length);
  disposeMeshesIdle(batch);
}

/** Sync-dispose a capped batch so menu transitions do not freeze the tab. */
export function flushDisposeQueueSync(maxMeshes = 32) {
  let n = 0;
  const disposed = new Set();
  while (pendingDispose.length > 0 && n < maxMeshes) {
    disposeObject3D(pendingDispose.shift(), disposed);
    n++;
  }
  if (pendingDispose.length > 0) scheduleDisposeFlush();
}

/**
 * Dispose meshes in small idle-time slices so match end does not freeze the tab.
 * @param {THREE.Object3D[]} meshes
 */
export function disposeMeshesIdle(meshes) {
  const queue = [...new Set(meshes.filter(Boolean))];
  if (queue.length === 0) return;

  let idx = 0;
  const perSlice = 3;
  const disposed = new Set();

  const run = (deadline) => {
    const started = performance.now();
    let processed = 0;
    // Check the live budget after each object. A captured timeRemaining value
    // let the old loop dispose the entire casualty batch in one callback.
    while (idx < queue.length && processed < perSlice &&
      (processed === 0 ||
        (performance.now() - started < 6 && (deadline?.timeRemaining?.() ?? 6) > 1))) {
      disposeObject3D(queue[idx++], disposed);
      processed++;
    }
    if (idx < queue.length) schedule(run);
  };

  const schedule = (cb) => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(cb, { timeout: 250 });
    } else {
      setTimeout(() => cb(), 32);
    }
  };

  schedule(run);
}
