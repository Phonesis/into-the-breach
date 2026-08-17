import * as THREE from 'three';
import { getVehicleDesign } from '../src/units/vehicleDesigns.js';
import { getRiderDeckOffset, resolveMountedHost } from '../src/game/TankRiders.js';
import { applyMountedRiderVisuals } from '../src/units/InfantryVisuals.js';

const FACTIONS = ['germany', 'usa', 'uk', 'russia', 'japan'];
const TYPES = ['tank', 'superHeavyTank', 'armoredCar'];
const DECK_EMBED = 0.015;

let failed = 0;
function assert(cond, message) {
  if (!cond) {
    failed += 1;
    console.error(`FAIL: ${message}`);
  }
}

for (const faction of FACTIONS) {
  for (const type of TYPES) {
    const hull = getVehicleDesign(faction, type).hull;
    const hullTop = hull.y + hull.h * 0.5;
    const tank = { faction: { id: faction }, def: { type } };
    const slots = type === 'superHeavyTank' ? 3 : type === 'armoredCar' ? 1 : 2;
    for (let i = 0; i < slots; i++) {
      const offset = getRiderDeckOffset(tank, i);
      const dy = offset.y - hullTop;
      assert(
        Math.abs(dy + DECK_EMBED) < 1e-6,
        `${faction} ${type} slot ${i} y=${offset.y.toFixed(3)} hullTop=${hullTop.toFixed(3)}`
      );
      assert(
        Math.abs(offset.x) <= hull.w * 0.5 - 0.15,
        `${faction} ${type} slot ${i} x=${offset.x.toFixed(3)} is off the hull`
      );
      const hullRear = (hull.z ?? 0) - hull.d * 0.5;
      const hullFront = (hull.z ?? 0) + hull.d * 0.5;
      assert(
        offset.z >= hullRear - 0.05 && offset.z <= hullFront,
        `${faction} ${type} slot ${i} z=${offset.z.toFixed(3)} is off the hull`
      );
    }
  }
}

function mockSquad(count) {
  const mesh = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const soldier = new THREE.Group();
    soldier.name = 'squadMember';
    soldier.userData.squadIndex = i;
    soldier.position.set((i - 2) * 0.9, 0.03, i % 2 === 0 ? 1.2 : -1.1);
    const torso = new THREE.Group();
    torso.userData.infantryPart = 'torso';
    torso.position.y = 0.42;
    soldier.add(torso);
    soldier.userData.walkRest = {
      group: soldier.position.clone(),
      torso: { position: torso.position.clone(), rotation: torso.rotation.clone() },
    };
    mesh.add(soldier);
  }
  const crate = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2));
  crate.name = 'groundKit';
  mesh.add(crate);
  return { mesh };
}

const rider = mockSquad(5);
applyMountedRiderVisuals(rider, true);
const seated = rider.mesh.children.filter((c) => c.name === 'squadMember');
for (const soldier of seated) {
  const r = Math.hypot(soldier.position.x, soldier.position.z);
  assert(r <= 0.42, `seated soldier ${soldier.userData.squadIndex} still ${r.toFixed(2)}m from slot`);
  assert(soldier.position.y <= 0.03, `seated soldier y=${soldier.position.y} is not on the deck`);
}
const crate = rider.mesh.getObjectByName('groundKit');
assert(crate && crate.visible === false, 'ground kit should hide while mounted');

applyMountedRiderVisuals(rider, false);
assert(crate.visible === true, 'ground kit should return on dismount');
assert(
  Math.hypot(seated[0].position.x, seated[0].position.z) > 0.8,
  'dismount should restore the field formation spread'
);

const hostTank = { id: 'tank-1', dead: false };
const mountedRider = { id: 'inf-1', _mountedOnTankId: 'tank-1' };
assert(
  resolveMountedHost(mountedRider, [hostTank, mountedRider]) === hostTank,
  'rider pick should resolve to host tank'
);
assert(
  resolveMountedHost(hostTank, [hostTank, mountedRider]) === hostTank,
  'tank pick should stay the tank'
);
assert(
  resolveMountedHost(mountedRider, [{ id: 'tank-1', dead: true }, mountedRider]) === mountedRider,
  'dead host should keep the rider'
);
assert(resolveMountedHost(null, []) == null, 'missing pick should stay empty');

if (failed) {
  console.error(`${failed} check(s) failed`);
  process.exit(1);
}
console.log('tank rider deck checks passed');
