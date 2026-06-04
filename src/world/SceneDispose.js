import * as THREE from 'three';

function disposeMaterial(mat) {
  if (!mat) return;
  for (const key of [
    'map',
    'normalMap',
    'roughnessMap',
    'aoMap',
    'emissiveMap',
    'alphaMap',
    'metalnessMap',
  ]) {
    if (mat[key]?.dispose) mat[key].dispose();
  }
  mat.dispose();
}

/** Dispose GPU resources on a single object (mesh, line, points, sprite). */
export function disposeObject3D(root) {
  if (!root) return;
  root.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) obj.material.forEach(disposeMaterial);
      else disposeMaterial(obj.material);
    }
  });
}

/** Remove and dispose all children still attached to the battle scene. */
export function disposeBattleScene(scene) {
  if (!scene) return;
  const children = [...scene.children];
  for (const child of children) {
    scene.remove(child);
    disposeObject3D(child);
  }
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
  while (pendingDispose.length > 0 && n < maxMeshes) {
    disposeObject3D(pendingDispose.shift());
    n++;
  }
  if (pendingDispose.length > 0) scheduleDisposeFlush();
}

/**
 * Dispose meshes in small idle-time slices so match end does not freeze the tab.
 * @param {THREE.Object3D[]} meshes
 */
export function disposeMeshesIdle(meshes) {
  const queue = meshes.filter(Boolean);
  if (queue.length === 0) return;

  let idx = 0;
  const perSlice = 3;

  const run = (deadline) => {
    const budget = deadline?.timeRemaining?.() ?? 12;
    while (idx < queue.length && (deadline == null || budget > 1)) {
      for (let n = 0; n < perSlice && idx < queue.length; n++, idx++) {
        disposeObject3D(queue[idx]);
      }
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