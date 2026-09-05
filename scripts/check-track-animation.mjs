import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createServer } from 'vite';

const server = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  appType: 'custom',
});

try {
  const { buildFactionVehicle, mat } = await server.ssrLoadModule('/src/units/FactionMeshes.js');
  const { updateTrackedVehicleAnimation, sampleTrackLoop } =
    await server.ssrLoadModule('/src/units/TrackAnimation.js');
  const { applyTankWreckLook } = await server.ssrLoadModule('/src/units/UnitMeshes.js');
  const { batchVehicleParts } = await server.ssrLoadModule('/src/units/VehicleBatching.js');

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();

  function mockUnit(type, faction = 'germany') {
    const root = new THREE.Group();
    assert(buildFactionVehicle(root, type, faction, mat(0x687351), mat(0x687351), mat(0x222222)));
    root.position.set(0, 0, 0);
    return {
      mesh: root,
      def: { type },
      position: root.position,
      dead: false,
      _mobilityDamaged: false,
    };
  }

  function shoePositions(run) {
    const out = [];
    for (let i = 0; i < run.linkCount; i++) {
      run.shoes.getMatrixAt(i, matrix);
      position.setFromMatrixPosition(matrix);
      out.push(position.clone());
    }
    return out;
  }

  function bottomShoeIndex(run) {
    const positions = shoePositions(run);
    let best = 0;
    for (let i = 1; i < positions.length; i++) {
      if (positions[i].y < positions[best].y) best = i;
    }
    return best;
  }

  function wheelSpin(run) {
    return run.wheels.map((wheel) => wheel.mesh.rotation[wheel.axis]);
  }

  for (const faction of ['germany', 'usa', 'uk', 'russia', 'japan']) {
    for (const type of ['tank', 'tankDestroyer', 'superHeavyTank']) {
      const unit = mockUnit(type, faction);
      const anim = unit.mesh.userData.trackAnimation;
      assert.equal(anim?.runs?.length, 2, `${faction} ${type}: two track runs`);
      for (const run of anim.runs) {
        assert(run.shoes.isInstancedMesh, `${faction} ${type}: instanced grousers`);
        assert(run.linkCount >= 18, `${faction} ${type}: closed-loop shoe count`);
        assert(run.wheels.length >= 4, `${faction} ${type}: spinning wheels`);
        const sample = sampleTrackLoop(run.spec, 0, run.extraR);
        assert.ok(sample.perimeter > run.spec.length * 1.5);
      }

      updateTrackedVehicleAnimation(unit);
      const left = anim.runs.find((run) => run.side === -1);
      const right = anim.runs.find((run) => run.side === 1);
      const leftStart = shoePositions(left);
      const rightStart = shoePositions(right);
      const leftSpin0 = wheelSpin(left);
      const bottom = bottomShoeIndex(left);
      const startZ = leftStart[bottom].z;

      unit.position.z += 1;
      updateTrackedVehicleAnimation(unit);
      const leftMoved = shoePositions(left);
      const rightMoved = shoePositions(right);
      assert.ok(
        leftMoved[bottom].z < startZ - 0.7,
        `${faction} ${type}: bottom grouser travels rearward while hull goes forward`
      );
      assert.ok(
        Math.abs(leftMoved[bottom].z - rightMoved[bottom].z) < 0.08,
        `${faction} ${type}: both tracks match in a straight run`
      );
      const leftSpin1 = wheelSpin(left);
      assert.ok(
        leftSpin1.some((angle, i) => Math.abs(angle - leftSpin0[i]) > 0.5),
        `${faction} ${type}: road wheels roll with travel`
      );

      unit.position.z -= 1;
      updateTrackedVehicleAnimation(unit);
      const leftBack = shoePositions(left);
      assert.ok(
        leftBack[bottom].distanceTo(leftStart[bottom]) < 0.08,
        `${faction} ${type}: reverse unwinds the same distance`
      );

      unit.mesh.rotation.y += 0.4;
      updateTrackedVehicleAnimation(unit);
      assert.ok(
        left.distance * right.distance < 0,
        `${faction} ${type}: in-place pivot drives tracks opposite ways`
      );

      const beforeDead = shoePositions(left);
      const spinBeforeDead = wheelSpin(left).slice();
      unit.dead = true;
      unit.position.z += 3;
      updateTrackedVehicleAnimation(unit);
      const afterDead = shoePositions(left);
      assert.ok(
        afterDead[bottom].distanceTo(beforeDead[bottom]) < 1e-6,
        `${faction} ${type}: wrecked tracks freeze`
      );
      assert.deepEqual(wheelSpin(left), spinBeforeDead);

      applyTankWreckLook(unit.mesh);
      unit.mesh.traverse((object) => {
        assert([...object.position, object.rotation.x, object.rotation.y, object.rotation.z].every(Number.isFinite));
      });
    }
  }

  const batched = mockUnit('tank', 'usa');
  batchVehicleParts(batched.mesh);
  updateTrackedVehicleAnimation(batched);
  batched.position.z += 0.8;
  updateTrackedVehicleAnimation(batched);
  assert.ok(batched.mesh.userData.trackAnimation.runs[0].distance > 0.5);

  console.log('PASS: tracked vehicles roll grousers and wheels with travel, reverse, and pivot.');
} finally {
  await server.close();
}
