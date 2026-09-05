import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createServer } from 'vite';

const server = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom',
});
try {
  const { buildFactionVehicle, mat } = await server.ssrLoadModule('/src/units/FactionMeshes.js');
  const { batchVehicleParts } = await server.ssrLoadModule('/src/units/VehicleBatching.js');
  const { getVehicleCannonMuzzleWorldPosition } = await server.ssrLoadModule('/src/units/VehicleMeshKit.js');
  const { applyTankWreckLook, applyTruckWreckLook, applyVehicleCorpseLook } =
    await server.ssrLoadModule('/src/units/UnitMeshes.js');
  const vector = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const triangleCount = (mesh) => (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3;
  const snapshot = (root) => {
    root.updateMatrixWorld(true);
    const vertices = [];
    let meshes = 0, triangles = 0;
    root.traverse((mesh) => {
      if (!mesh.isMesh || !mesh.visible) return;
      meshes++;
      triangles += triangleCount(mesh) * (mesh.isInstancedMesh ? mesh.count : 1);
      for (let instance = 0; instance < (mesh.isInstancedMesh ? mesh.count : 1); instance++) {
        if (mesh.isInstancedMesh) {
          mesh.getMatrixAt(instance, matrix);
          matrix.premultiply(mesh.matrixWorld);
        }
        else matrix.copy(mesh.matrixWorld);
        const position = mesh.geometry.attributes.position;
        const index = mesh.geometry.index;
        for (let i = 0; i < (index?.count ?? position.count); i++) {
          vector.fromBufferAttribute(position, index ? index.getX(i) : i).applyMatrix4(matrix);
          vertices.push([vector.x, vector.y, vector.z].map((n) => n.toFixed(4)).join(','));
        }
      }
    });
    return { meshes, triangles, vertices: vertices.sort() };
  };
  let saved = 0;
  for (const faction of ['germany', 'usa', 'uk', 'russia', 'japan']) {
    for (const type of ['tank', 'tankDestroyer', 'superHeavyTank', 'armoredCar', 'truck', 'artillery', 'antiTankGun']) {
      const root = new THREE.Group();
      assert(buildFactionVehicle(root, type, faction, mat(0x687351), mat(0x687351), mat(0x222222)));
      const unit = { mesh: root, def: { type }, position: new THREE.Vector3() };
      const anchors = Object.values(root.userData).filter((value) => value?.isObject3D);
      const deformed = [];
      root.traverse((mesh) => {
        if (['track', 'canvas', 'cab', 'hood', 'bed', 'barrel', 'muzzle'].includes(mesh.userData.tankPart)) deformed.push(mesh);
      });
      const before = snapshot(root);
      const muzzle = getVehicleCannonMuzzleWorldPosition(unit).clone();
      batchVehicleParts(root);
      const after = snapshot(root);
      assert.equal(after.triangles, before.triangles, `${faction} ${type}: triangle count`);
      // Float32 transform baking may differ by one unit in the fourth decimal.
      // Compare sorted coordinates numerically rather than string equality.
      assert.equal(after.vertices.length, before.vertices.length);
      // Quantisation across equal components can reorder entries; a multiset at
      // millimetre precision is sufficient to catch missing/transformed fittings.
      const quantise = (vertices) => vertices.map((v) => v.split(',').map((n) => Math.round(Number(n) * 1000)).join(',')).sort();
      assert.deepEqual(quantise(after.vertices), quantise(before.vertices), `${faction} ${type}: world geometry`);
      assert(after.meshes < before.meshes, `${faction} ${type}: fewer submissions`);
      saved += before.meshes - after.meshes;
      assert(getVehicleCannonMuzzleWorldPosition(unit).distanceTo(muzzle) < 1e-6);
      for (const anchor of [...anchors, ...deformed]) {
        let parent = anchor;
        while (parent.parent) parent = parent.parent;
        assert.equal(parent, root, `${faction} ${type}: preserve articulated object identity`);
      }
      if (root.userData.turretPivot) root.userData.turretPivot.rotation.y = 0.6;
      root.rotation.y = 1.2;
      assert(getVehicleCannonMuzzleWorldPosition(unit).toArray().every(Number.isFinite));
      if (type === 'truck') applyTruckWreckLook(root, { catastrophic: true });
      else if (root.userData.isTank) applyTankWreckLook(root);
      else applyVehicleCorpseLook(root);
      root.traverse((object) => {
        assert([...object.position, object.rotation.x, object.rotation.y, object.rotation.z].every(Number.isFinite));
      });
    }
  }
  console.log(`PASS: 35 faction/vehicle combinations retain geometry, muzzle origins, pivots and deformable parts; ${saved} fewer mesh submissions.`);
} finally {
  await server.close();
}
