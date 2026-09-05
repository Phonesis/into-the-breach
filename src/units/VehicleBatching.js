import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// These parts only move with their parent pivot, including after destruction.
// Wheels, tracks, canvas, cab panels and weapon barrels retain their individual
// geometry and transforms for wreck deformation and muzzle/ejection origins.
const RIGID_PARTS = new Set(['hull', 'turret', 'mantlet']);

/** Bake rigid sibling fittings into one draw per material and semantic part. */
export function batchVehicleParts(root) {
  const parents = [];
  const uses = new Map();
  root.traverse((object) => {
    if (object.children.length) parents.push(object);
    if (object.geometry) uses.set(object.geometry, (uses.get(object.geometry) ?? 0) + 1);
  });
  for (const parent of parents) {
    const buckets = new Map();
    for (const mesh of parent.children) {
      if (!mesh.isMesh || mesh.isInstancedMesh || mesh.isSkinnedMesh || mesh.children.length ||
        mesh.name || !mesh.visible || Array.isArray(mesh.material) ||
        !mesh.material?.visible || mesh.material.transparent || mesh.customDepthMaterial ||
        mesh.customDistanceMaterial || !RIGID_PARTS.has(mesh.userData.tankPart) ||
        Object.keys(mesh.userData).some((key) => key !== 'tankPart')) continue;
      const geometry = mesh.geometry;
      if (!geometry?.attributes.position || Object.keys(geometry.morphAttributes).length ||
        geometry.drawRange.start !== 0 || geometry.drawRange.count !== Infinity) continue;
      mesh.updateMatrix();
      if (mesh.matrix.determinant() <= 0) continue;
      const attributes = Object.entries(geometry.attributes)
        .map(([name, attribute]) => `${name}:${attribute.itemSize}:${attribute.normalized}:${attribute.array.constructor.name}`)
        .sort().join(',');
      const key = [mesh.material.uuid, mesh.userData.tankPart, mesh.castShadow, mesh.receiveShadow,
        mesh.renderOrder, mesh.layers.mask, mesh.frustumCulled, attributes].join('|');
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(mesh);
    }
    for (const meshes of buckets.values()) {
      if (meshes.length < 2) continue;
      const pieces = meshes.map((mesh) => {
        const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
        return geometry.applyMatrix4(mesh.matrix);
      });
      const geometry = mergeGeometries(pieces, false);
      pieces.forEach((piece) => piece.dispose());
      if (!geometry) continue;
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      const source = meshes[0];
      const batch = new THREE.Mesh(geometry, source.material);
      batch.name = 'vehicleRigidBatch';
      batch.userData.tankPart = source.userData.tankPart;
      batch.castShadow = source.castShadow;
      batch.receiveShadow = source.receiveShadow;
      batch.renderOrder = source.renderOrder;
      batch.layers.mask = source.layers.mask;
      batch.frustumCulled = source.frustumCulled;
      for (const mesh of meshes) {
        parent.remove(mesh);
        const remaining = uses.get(mesh.geometry) - 1;
        uses.set(mesh.geometry, remaining);
        if (!remaining) mesh.geometry.dispose();
      }
      parent.add(batch);
    }
  }
  return root;
}
