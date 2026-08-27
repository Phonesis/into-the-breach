import { getVehicleDesign } from '../src/units/vehicleDesigns.js';
import { getRiderDeckOffset } from '../src/game/TankRiders.js';
import {
  canAttachGunToTruck,
  canTowGuns,
  getHitchLocalOffset,
  getTowedGunLocalOffset,
  isTowableGun,
  tryAttachGun,
  detachGun,
  updateTruckTowing,
} from '../src/game/TruckTowing.js';
import {
  isWheeledVehicle,
  isVehicleUnit,
  isTruckType,
  shouldUseTacticalReverse,
  TACTICAL_REVERSE_MAX_DISTANCE,
} from '../src/units/VehicleTypes.js';
import { faceUnitTowardMovement } from '../src/units/VehicleRotation.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const factionsSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/data/factions.js'),
  'utf8'
);

const FACTION_IDS = ['germany', 'usa', 'uk', 'russia', 'japan'];
let failed = 0;
function assert(cond, message) {
  if (!cond) {
    failed += 1;
    console.error(`FAIL: ${message}`);
  }
}

assert(factionsSrc.includes("type: 'truck'"), 'factions.js defines trucks');
assert(factionsSrc.includes('Opel Blitz'), 'Germany Opel Blitz');
assert(factionsSrc.includes('GMC CCKW'), 'USA CCKW');
assert(factionsSrc.includes('Bedford QLD'), 'UK Bedford');
assert(factionsSrc.includes('ZIS-5'), 'Russia ZIS-5');
assert(factionsSrc.includes('Type 94 Truck'), 'Japan Type 94');
assert(factionsSrc.includes('truckDriverDef'), 'truck driver def exists');

const spawnerSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/game/Spawner.js'),
  'utf8'
);
assert((spawnerSrc.match(/type: 'truck'/g) || []).length >= 5, 'starting armies include trucks');
const clearanceSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/game/ClearanceMode.js'),
  'utf8'
);
assert(clearanceSrc.includes("type: 'truck'"), 'Fortified Line garrison includes a truck');
assert(clearanceSrc.includes("'truck'"), 'Fortified Line packages mention trucks');
const aiSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/game/AI.js'),
  'utf8'
);
assert(aiSrc.includes('tryAssignAiTruckTask'), 'enemy AI has truck tasks');
assert(aiSrc.includes('issueTowOrder'), 'enemy AI tows guns');
assert(aiSrc.includes('dismountAllRiders'), 'enemy AI unloads cargo');
assert(aiSrc.includes('AI_TRUCK_KEEP_OUT'), 'enemy AI keeps trucks out of small-arms range');
assert(aiSrc.includes('getAiTruckWithdrawPoint'), 'enemy AI withdraws trucks that close too far');

for (const id of FACTION_IDS) {

  const design = getVehicleDesign(id, 'truck');
  assert(design?.hull && design?.cab && design?.bed && design?.wheels?.length >= 4, `${id} truck design incomplete`);
  assert(design.hitch?.z < 0, `${id} hitch should be at the rear`);
  assert(design.cargo?.slots?.length === 3, `${id} cargo should have 3 rider slots`);

  const truck = { faction: { id }, def: { type: 'truck' }, mesh: null };
  for (let i = 0; i < 3; i++) {
    const slot = getRiderDeckOffset(truck, i);
    const bed = design.bed;
    const rear = bed.z - bed.d * 0.55;
    const front = bed.z + bed.d * 0.55;
    assert(
      slot.z >= rear && slot.z <= front,
      `${id} cargo slot ${i} z=${slot.z} is off the bed`
    );
    assert(Math.abs(slot.x) <= bed.w * 0.5, `${id} cargo slot ${i} x is off the bed`);
  }

  const hitch = getHitchLocalOffset(truck);
  const gunOffset = getTowedGunLocalOffset(truck, { faction: { id }, def: { type: 'antiTankGun' } });
  assert(gunOffset.z < hitch.z, `${id} towed gun should sit behind the hitch`);
}

assert(canTowGuns('truck'), 'trucks can tow');
assert(isTowableGun('antiTankGun') && isTowableGun('artillery'), 'AT and artillery are towable');
assert(isWheeledVehicle('truck') && isVehicleUnit('truck'), 'truck is a wheeled vehicle');
assert(isTruckType('truck') && !isTruckType('armoredCar'), 'isTruckType is truck-only');

{
  const facingNorth = {
    def: { type: 'truck' },
    position: { x: 0, y: 0, z: 0 },
    mesh: { rotation: { y: 0 } },
  };
  const tankFacingNorth = {
    def: { type: 'tank' },
    position: { x: 0, y: 0, z: 0 },
    mesh: { rotation: { y: 0 } },
  };
  const nearBehind = TACTICAL_REVERSE_MAX_DISTANCE * 0.5;
  const farBehind = TACTICAL_REVERSE_MAX_DISTANCE + 1;
  assert(
    shouldUseTacticalReverse(facingNorth, 0, -nearBehind),
    'truck reverses a short click into its rear'
  );
  assert(
    shouldUseTacticalReverse(tankFacingNorth, 0, -nearBehind),
    'tank still reverses a short rear click'
  );
  assert(
    !shouldUseTacticalReverse(facingNorth, 0, -farBehind),
    'truck turns around beyond the tank reverse distance'
  );
  assert(
    shouldUseTacticalReverse(facingNorth, 0, -nearBehind)
      === shouldUseTacticalReverse(tankFacingNorth, 0, -nearBehind),
    'truck and tank share the same reverse distance'
  );
  assert(
    !shouldUseTacticalReverse(facingNorth, nearBehind, 0),
    'truck does not reverse for a side click'
  );
  const ac = {
    def: { type: 'armoredCar' },
    position: { x: 0, y: 0, z: 0 },
    mesh: { rotation: { y: 0 } },
  };
  assert(
    !shouldUseTacticalReverse(ac, 0, -nearBehind),
    'armored cars do not use truck/tank tactical reverse'
  );
}

{
  const dt = 1 / 60;
  const unit = { def: { type: 'truck' }, mesh: { rotation: { y: 0 } } };
  let elapsed = 0;
  const targetYaw = Math.PI;
  for (let i = 0; i < 1200; i++) {
    faceUnitTowardMovement(unit, Math.sin(targetYaw), Math.cos(targetYaw), dt, {
      stationaryTurn: false,
    });
    elapsed += dt;
    const err = Math.abs(
      Math.atan2(
        Math.sin(targetYaw - unit.mesh.rotation.y),
        Math.cos(targetYaw - unit.mesh.rotation.y)
      )
    );
    if (err < 0.03) break;
  }
  assert(elapsed >= 7.5 && elapsed <= 9.5, `truck 180° turn took ${elapsed.toFixed(2)}s, expected ~8.2s`);
}

const texturesSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/units/UnitTextures.js'),
  'utf8'
);
assert(texturesSrc.includes("'truck'"), 'UnitTextures VEHICLE_TYPES includes truck camo');

const rotationSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/units/VehicleRotation.js'),
  'utf8'
);
assert(rotationSrc.includes('truck: 16'), 'truck stationary hull traverse is slow');
assert(rotationSrc.includes('truck: 22'), 'truck moving hull traverse is slow');

const terrainSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/world/Terrain.js'),
  'utf8'
);
assert(terrainSrc.includes('isTruckType'), 'terrain special-cases truck steering');
assert(terrainSrc.includes('farUTurn'), 'trucks crawl a U-turn only when the waypoint is far');
assert(
  terrainSrc.includes('canUseTacticalReverse'),
  'terrain lets trucks reverse like tanks'
);
assert(terrainSrc.includes('TRUCK_UTURN_MIN_DIST'), 'trucks only U-turn when the waypoint is far');
assert(terrainSrc.includes('truckCommitted'), 'trucks stop rolling when they would orbit a waypoint');
assert(
  terrainSrc.includes("'armoredCar', 'truck', 'artillery'"),
  'truck uses the full vehicle footprint terrain pose'
);

{
  const STEER = (22 * Math.PI) / 180;
  const dt = 1 / 30;
  const speedMax = 11;
  const dest = { x: 10, z: 0 };
  let x = 0;
  let z = 0;
  let yaw = 0;
  let driveSpeed = 0;
  let reached = false;
  let elapsed = 0;
  for (; elapsed < 18; elapsed += dt) {
    const dx = dest.x - x;
    const dz = dest.z - z;
    const horiz = Math.hypot(dx, dz);
    if (horiz < 2.5) {
      reached = true;
      break;
    }
    const nx = dx / horiz;
    const nz = dz / horiz;
    const desiredYaw = Math.atan2(nx, nz);
    const turnDelta = Math.abs(
      Math.atan2(Math.sin(desiredYaw - yaw), Math.cos(desiredYaw - yaw))
    );
    const maxDelta = STEER * dt;
    if (turnDelta <= maxDelta) yaw = desiredYaw;
    else {
      yaw += Math.sign(Math.atan2(Math.sin(desiredYaw - yaw), Math.cos(desiredYaw - yaw))) * maxDelta;
    }
    const fwdX = Math.sin(yaw);
    const fwdZ = Math.cos(yaw);
    const forwardDot = nx * fwdX + nz * fwdZ;
    const drive = Math.max(0, forwardDot);
    const farUTurn = horiz > 7 && forwardDot < 0.2;
    const committed = drive > 0.18 || farUTurn;
    if (!committed) {
      driveSpeed = 0;
      continue;
    }
    let targetSpeed =
      speedMax * (0.26 + 0.74 * Math.max(0, Math.min(1, (Math.abs(drive) - 0.42) / 0.58)) ** 2);
    if (turnDelta > 0.18) {
      targetSpeed = Math.min(targetSpeed, STEER * Math.max(1.25, horiz * 0.55));
    }
    const rate = targetSpeed >= driveSpeed ? 8.5 : 12.5;
    if (driveSpeed < targetSpeed) driveSpeed = Math.min(targetSpeed, driveSpeed + rate * dt);
    else driveSpeed = Math.max(targetSpeed, driveSpeed - rate * dt);
    const rollSign = farUTurn ? 1 : 1;
    x += fwdX * rollSign * driveSpeed * dt;
    z += fwdZ * rollSign * driveSpeed * dt;
  }
  assert(reached, `side waypoint should be reached, last t=${elapsed.toFixed(2)}s`);
}

const soundSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/audio/SoundManager.js'),
  'utf8'
);
assert(soundSrc.includes('truckSelectBuffers'), 'SoundManager loads truck select voices');

const meshKitSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/units/VehicleMeshKit.js'),
  'utf8'
);
assert(meshKitSrc.includes("part: 'canvas'"), 'truck canvas is tagged for wreck deformation');
assert(meshKitSrc.includes("part: 'cab'"), 'truck cab is tagged for wreck deformation');
assert(meshKitSrc.includes("part: 'bed'"), 'truck bed is tagged for wreck deformation');

const meshesSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/units/UnitMeshes.js'),
  'utf8'
);
assert(meshesSrc.includes('applyTruckWreckLook'), 'destroyed trucks get a dedicated wreck model');
assert(meshesSrc.includes("type === 'truck'"), 'death visuals special-case trucks');

const destructionSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/effects/VehicleDestruction.js'),
  'utf8'
);
assert(destructionSrc.includes("type === 'truck') return 0.34"), 'destroyed trucks can cook off fuel');
assert(soundSrc.includes('truck-${kind}-${faction}'), 'SoundManager requests truck voice wavs');
assert(soundSrc.includes("unitType === 'truck'"), 'SoundManager prefers truck voice pools');

const truck = {
  id: 1,
  def: { type: 'truck' },
  team: 'player',
  dead: false,
  position: { x: 0, y: 0, z: 0 },
  mesh: { rotation: { y: 0 }, updateMatrixWorld() {}, localToWorld(v) { v.z -= 2.3; } },
};
const gun = {
  id: 2,
  def: { type: 'antiTankGun' },
  team: 'player',
  dead: false,
  position: { x: 1, y: 0, z: -1 },
  mesh: {
    rotation: { y: 0, x: 0, z: 0 },
    position: { copy() {} },
    getObjectByName() { return { visible: true }; },
  },
  clearAttackOrder() {},
};
assert(canAttachGunToTruck(truck, gun), 'nearby friendly gun should attach');
assert(tryAttachGun(truck, gun, [truck, gun]), 'attach should succeed');
assert(truck._towedGunId === gun.id && gun._towedByTruckId === truck.id, 'tow links should be set');
detachGun(truck, [truck, gun], null);
assert(!truck._towedGunId && !gun._towedByTruckId, 'detach should clear tow links');
assert(gun.position.z < truck.position.z, 'north-facing truck should detach its gun behind the cab');
gun.dead = false;
assert(tryAttachGun(truck, gun, [truck, gun]), 'gun should reattach for destruction check');
gun.dead = true;
updateTruckTowing([truck, gun], 1 / 60, null);
assert(
  !truck._towedGunId && !gun._towedByTruckId,
  'destroyed towed gun should clear both tow links'
);

if (failed) {
  console.error(`${failed} check(s) failed`);
  process.exit(1);
}
console.log('truck system checks passed');
