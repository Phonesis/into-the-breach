import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createServer } from 'vite';

const server = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  appType: 'custom',
});

try {
  const { createUnitMesh } = await server.ssrLoadModule('/src/units/UnitMeshes.js');
  const {
    updateInfantryWalkAnimation,
    resetInfantryWalkPose,
  } = await server.ssrLoadModule('/src/units/InfantryVisuals.js');

  function members(mesh) {
    const out = [];
    mesh.traverse((child) => {
      if (child.name === 'squadMember') out.push(child);
    });
    out.sort((a, b) => (a.userData.squadIndex ?? 0) - (b.userData.squadIndex ?? 0));
    return out;
  }

  function part(soldier, name) {
    return soldier.children.find((child) => child.userData.infantryPart === name);
  }

  function march(unit, seconds, speed = 4.8) {
    const dt = 1 / 30;
    for (let t = 0; t < seconds; t += dt) {
      unit.position.z += speed * dt;
      updateInfantryWalkAnimation(unit, dt);
    }
  }

  const mesh = createUnitMesh('infantry', 0x687351, 0x222222, 'usa');
  const unit = {
    mesh,
    position: mesh.position,
    def: { type: 'infantry', speed: 5.2 },
    dead: false,
    moveTarget: { x: 0, z: 40 },
  };
  const squad = members(mesh);
  assert.equal(squad.length, 5, 'rifle squad has five soldiers');

  for (const soldier of squad) {
    assert(soldier.userData.walkStyle, 'each soldier has a gait profile');
    assert(part(soldier, 'torso'), 'torso present');
    const pack = part(soldier, 'torso').children.find(
      (child) => child.name === 'soldierEquipmentBatch' || child.isMesh
    );
    assert(pack, 'webbing/pack is parented to the torso');
  }

  const cadences = squad.map((soldier) => soldier.userData.walkStyle.cadence);
  const offsets = squad.map((soldier) => soldier.userData.walkStyle.phaseOffset);
  assert.equal(new Set(cadences.map((n) => n.toFixed(3))).size, 5, 'cadences differ');
  assert.equal(new Set(offsets.map((n) => n.toFixed(3))).size, 5, 'phase offsets differ');

  updateInfantryWalkAnimation(unit, 0.03);
  const restYaw = squad.map((soldier) => part(soldier, 'torso').rotation.y);
  const restPitch = squad.map((soldier) => part(soldier, 'torso').rotation.x);
  const restHead = squad.map((soldier) => part(soldier, 'head').rotation.y);

  march(unit, 0.7);
  assert.ok((unit._walkBlend ?? 0) > 0.8, 'walk blend reaches full stride');

  const walkYaw = squad.map((soldier) => part(soldier, 'torso').rotation.y);
  const walkPitch = squad.map((soldier) => part(soldier, 'torso').rotation.x);
  const walkHead = squad.map((soldier) => part(soldier, 'head').rotation.y);
  const walkHelmet = squad.map((soldier) => part(soldier, 'helmet').rotation.x);
  const walkHip = squad.map((soldier) => part(soldier, 'legL').rotation.x);

  assert.ok(
    walkPitch.some((pitch, i) => Math.abs(pitch - restPitch[i]) > 0.06),
    'torso leans into the stride'
  );
  assert.ok(
    walkYaw.some((yaw, i) => Math.abs(yaw - restYaw[i]) > 0.05),
    'shoulders counter-rotate'
  );
  assert.ok(
    walkHead.some((yaw, i) => Math.abs(yaw - restHead[i]) > 0.02),
    'heads move with the body'
  );
  assert.ok(
    walkHelmet.some((pitch) => Math.abs(pitch) > 0.04),
    'helmets pitch with the head'
  );
  assert.ok(
    walkHip.some((hip) => Math.abs(hip) > 0.15),
    'hips still drive the stride'
  );

  const yawSpread = Math.max(...walkYaw) - Math.min(...walkYaw);
  assert.ok(yawSpread > 0.08, `squad torsos are not cloned (spread ${yawSpread.toFixed(3)})`);

  const firstYaw = walkYaw.slice();
  march(unit, 0.9);
  const laterYaw = squad.map((soldier) => part(soldier, 'torso').rotation.y);
  const drifted = firstYaw.some((yaw, i) => Math.abs(laterYaw[i] - yaw) > 0.02);
  assert.ok(drifted, 'different cadences keep the squad from locking in step');

  resetInfantryWalkPose(unit);
  for (const [i, soldier] of squad.entries()) {
    assert.ok(
      Math.abs(part(soldier, 'torso').rotation.x - restPitch[i]) < 1e-6,
      'reset restores torso pitch'
    );
  }

  console.log('PASS: infantry walk uses full-body motion and per-soldier gaits.');
} finally {
  await server.close();
}
