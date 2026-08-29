import * as THREE from 'three';
import { getVehicleDesign } from './vehicleDesigns.js';
import {
  buildTankFromDesign,
  buildTankDestroyerFromDesign,
  buildArmoredCarFromDesign,
  buildTruckFromDesign,
  buildArtilleryFromDesign,
  buildAtGunFromDesign,
} from './VehicleMeshKit.js';
import {
  addFactionSniperRifle,
  buildSquadSoldier,
  configureTacticalSquadFormation,
} from './InfantryVisuals.js';

/** Historically inspired low-poly silhouettes per nation (not to scale). */

export function mat(color, opts = {}) {
  const material = new THREE.MeshStandardMaterial({
    color: opts.map ? 0xffffff : color,
    metalness: opts.metal ?? 0.28,
    roughness: opts.rough ?? 0.58,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
    envMapIntensity: opts.env ?? 0.72,
  });
  if (opts.map) material.map = opts.map;
  return material;
}

function addShadows(group) {
  group.traverse((c) => {
    if (c.isMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });
}

/** Germany — Panzer IV Ausf. H */
export function buildPanzerIV(group, body, detail, dark) {
  buildTankFromDesign(group, body, detail, dark, getVehicleDesign('germany', 'tank'));
}

/** USA — M4 Sherman */
export function buildSherman(group, body, detail, dark) {
  buildTankFromDesign(group, body, detail, dark, getVehicleDesign('usa', 'tank'));
}

/** UK — Churchill Mk IV */
export function buildChurchill(group, body, detail, dark) {
  buildTankFromDesign(group, body, detail, dark, getVehicleDesign('uk', 'tank'));
}

function buildTankDestroyer(group, body, detail, dark, factionId) {
  const design = getVehicleDesign(factionId, 'tankDestroyer');
  buildTankDestroyerFromDesign(
    group,
    body,
    detail,
    dark,
    design
  );
  if (design.superstructure?.style === 'openTurret') {
    addOpenTankDestroyerCrew(group, factionId);
  }
}

/** Visible commander and gunner for the open-topped M10 and Achilles turrets. */
function addOpenTankDestroyerCrew(group, factionId) {
  const turret = group.userData.turretPivot;
  if (!turret) return;

  const crew = new THREE.Group();
  crew.name = 'openTopTankDestroyerCrew';
  crew.userData.isVehicleCrewVisual = true;
  turret.add(crew);

  const positions = [
    { x: -0.29, y: 0.83, z: 0.06, yaw: 0.12 },
    { x: 0.31, y: 0.89, z: -0.25, yaw: -0.18 },
  ];
  positions.forEach((position, squadIndex) => {
    const soldier = buildSquadSoldier(crew, {
      factionId,
      squadIndex,
      x: position.x,
      z: position.z,
      crouching: true,
      withRifle: false,
      withPack: false,
      withWebbing: true,
    });
    soldier.name = 'openTopCrewman';
    soldier.position.y = position.y;
    soldier.rotation.y = position.yaw;
    soldier.scale.setScalar(0.92);
    soldier.userData.isVehicleCrewVisual = true;
  });
}

/** Germany — Tiger I */
export function buildTigerI(group, body, detail, dark) {
  buildTankFromDesign(group, body, detail, dark, getVehicleDesign('germany', 'superHeavyTank'));
}

/** USA — M26 Pershing */
export function buildPershing(group, body, detail, dark) {
  buildTankFromDesign(group, body, detail, dark, getVehicleDesign('usa', 'superHeavyTank'));
}

/** UK — Black Prince */
export function buildBlackPrince(group, body, detail, dark) {
  buildTankFromDesign(group, body, detail, dark, getVehicleDesign('uk', 'superHeavyTank'));
}

/** Germany — Sdkfz 222 */
export function buildSdkfz222(group, body, detail, dark) {
  buildArmoredCarFromDesign(group, body, detail, dark, getVehicleDesign('germany', 'armoredCar'));
}

/** USA — M8 Greyhound */
export function buildM8Greyhound(group, body, detail, dark) {
  buildArmoredCarFromDesign(group, body, detail, dark, getVehicleDesign('usa', 'armoredCar'));
}

/** UK — Daimler Armoured Car */
export function buildDaimlerAC(group, body, detail, dark) {
  buildArmoredCarFromDesign(group, body, detail, dark, getVehicleDesign('uk', 'armoredCar'));
}

/** Germany — leFH 18 */
function addTowedGunCrew(group, factionId, { artillery = false } = {}) {
  const positions = artillery
    ? [
        { x: -0.62, z: -0.38, gunner: true },
        { x: 0.7, z: -0.52, gunner: false },
        { x: 0.18, z: -1.12, gunner: false },
      ]
    : [
        { x: -0.54, z: -0.34, gunner: true },
        { x: 0.58, z: -0.72, gunner: false },
      ];

  const crew = new THREE.Group();
  crew.name = 'towedGunCrew';
  crew.userData.isTowedGunCrew = true;
  group.add(crew);

  positions.forEach((position, squadIndex) => {
    const soldier = buildSquadSoldier(crew, {
      factionId,
      squadIndex,
      x: position.x,
      z: position.z,
      gunner: position.gunner,
      crouching: position.gunner,
      withRifle: false,
      withPack: false,
    });
    soldier.rotation.y = squadIndex === 0 ? 0.2 : squadIndex === 1 ? -0.28 : Math.PI;
    soldier.userData.isTowedGunCrew = true;
  });

  // Ready ammunition makes the crew read as an operating detachment rather than scenery.
  const ammoCrate = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.2, 0.3),
    mat(factionId === 'russia' ? 0x556044 : 0x67583d, { rough: 0.9, metal: 0.04 })
  );
  ammoCrate.position.set(artillery ? 0.72 : 0.58, 0.12, artillery ? -1.3 : -1.05);
  ammoCrate.userData.tankPart = 'hull';
  crew.add(ammoCrate);

  if (artillery) {
    for (let i = 0; i < 3; i++) {
      const shell = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.045, 0.38, 8),
        mat(0x9b7a31, { rough: 0.48, metal: 0.62 })
      );
      shell.position.set(0.56 + i * 0.11, 0.22, -1.18 - (i % 2) * 0.1);
      shell.rotation.z = i === 0 ? 0 : 0.08 * i;
      shell.userData.tankPart = 'hull';
      crew.add(shell);
    }
  }
}

export function buildLeFH18(group, body, detail, dark) {
  buildArtilleryFromDesign(group, body, detail, dark, getVehicleDesign('germany', 'artillery'));
  addTowedGunCrew(group, 'germany', { artillery: true });
}

/** USA — M101 howitzer */
export function buildM101(group, body, detail, dark) {
  buildArtilleryFromDesign(group, body, detail, dark, getVehicleDesign('usa', 'artillery'));
  addTowedGunCrew(group, 'usa', { artillery: true });
}

/** UK — QF 25-pounder */
export function build25Pounder(group, body, detail, dark) {
  buildArtilleryFromDesign(group, body, detail, dark, getVehicleDesign('uk', 'artillery'));
  addTowedGunCrew(group, 'uk', { artillery: true });
}

export function buildPak40(group, body, detail, dark) {
  buildAtGunFromDesign(group, body, detail, dark, getVehicleDesign('germany', 'antiTankGun'));
  addTowedGunCrew(group, 'germany');
}

export function buildM1AtGun(group, body, detail, dark) {
  buildAtGunFromDesign(group, body, detail, dark, getVehicleDesign('usa', 'antiTankGun'));
  addTowedGunCrew(group, 'usa');
}

export function build6Pounder(group, body, detail, dark) {
  buildAtGunFromDesign(group, body, detail, dark, getVehicleDesign('uk', 'antiTankGun'));
  addTowedGunCrew(group, 'uk');
}

function buildT3485(group, body, detail, dark) {
  buildTankFromDesign(group, body, detail, dark, getVehicleDesign('russia', 'tank'));
}

function buildIS2(group, body, detail, dark) {
  buildTankFromDesign(group, body, detail, dark, getVehicleDesign('russia', 'superHeavyTank'));
}

function buildBA64(group, body, detail, dark) {
  buildArmoredCarFromDesign(group, body, detail, dark, getVehicleDesign('russia', 'armoredCar'));
}

function buildM30(group, body, detail, dark) {
  buildArtilleryFromDesign(group, body, detail, dark, getVehicleDesign('russia', 'artillery'));
  addTowedGunCrew(group, 'russia', { artillery: true });
}

function buildZIS3(group, body, detail, dark) {
  buildAtGunFromDesign(group, body, detail, dark, getVehicleDesign('russia', 'antiTankGun'));
  addTowedGunCrew(group, 'russia');
}

function buildShinhotoChiHa(group, body, detail, dark) {
  buildTankFromDesign(group, body, detail, dark, getVehicleDesign('japan', 'tank'));
}

function buildChiNu(group, body, detail, dark) {
  buildTankFromDesign(group, body, detail, dark, getVehicleDesign('japan', 'superHeavyTank'));
}

function buildChiyoda(group, body, detail, dark) {
  buildArmoredCarFromDesign(group, body, detail, dark, getVehicleDesign('japan', 'armoredCar'));
}

function buildType91Howitzer(group, body, detail, dark) {
  buildArtilleryFromDesign(group, body, detail, dark, getVehicleDesign('japan', 'artillery'));
  addTowedGunCrew(group, 'japan', { artillery: true });
}

function buildType1AtGun(group, body, detail, dark) {
  buildAtGunFromDesign(group, body, detail, dark, getVehicleDesign('japan', 'antiTankGun'));
  addTowedGunCrew(group, 'japan');
}

function addMgTripod(group, dark, { spread = 0.46, legLen = 0.54, pivotY = 0.34 } = {}) {
  const pivot = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.1, 8), dark);
  pivot.position.y = pivotY;
  group.add(pivot);

  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.045, legLen, 0.045), dark);
    leg.position.set(Math.cos(a) * spread, pivotY - legLen * 0.38, Math.sin(a) * spread);
    leg.rotation.z = 0.58;
    leg.rotation.y = -a * 0.35;
    group.add(leg);

    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.03, 0.1), dark);
    foot.position.set(Math.cos(a) * (spread + 0.08), 0.04, Math.sin(a) * (spread + 0.08));
    foot.rotation.y = -a;
    group.add(foot);
  }
}

function tagEquipShadow(mesh, mode = 'cast') {
  mesh.userData.shadowMode = mode;
}

function addMgCrewman(group, _body, _dark, factionId, x, z, { gunner = false } = {}) {
  const squadIndex = group.userData.nextSquadIndex ?? 0;
  group.userData.nextSquadIndex = squadIndex + 1;
  buildSquadSoldier(group, {
    factionId,
    squadIndex,
    x,
    z,
    gunner,
    withPack: !gunner,
  });
}

function addRedCross(group, x, y, z, size = 0.09) {
  const white = mat(0xf2f0e8, { rough: 0.9 });
  const red = mat(0xc41e3a, { rough: 0.85 });
  const pad = new THREE.Mesh(new THREE.BoxGeometry(size, size * 0.88, size * 0.1), white);
  pad.position.set(x, y, z);
  group.add(pad);
  const barV = new THREE.Mesh(new THREE.BoxGeometry(size * 0.24, size * 0.68, size * 0.12), red);
  barV.position.set(x, y, z + 0.01);
  group.add(barV);
  const barH = new THREE.Mesh(new THREE.BoxGeometry(size * 0.68, size * 0.24, size * 0.12), red);
  barH.position.set(x, y, z + 0.01);
  group.add(barH);
}

export function buildFactionMG(group, body, detail, dark, factionId) {
  // The crew turns with the squad; the deployed weapon counter-rotates on this
  // pivot so its physical barrel can remain locked exactly onto the target.
  const gun = new THREE.Group();
  gun.name = 'deployedMachineGun';
  gun.rotation.y = -Math.PI / 2;
  gun.userData.baseYaw = -Math.PI / 2;
  group.add(gun);
  group.userData.machineGunPivot = gun;

  let muzzleMesh = null;
  if (factionId === 'germany') {
    addMgTripod(gun, dark, { spread: 0.44, legLen: 0.5, pivotY: 0.36 });

    const lafette = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.38), dark);
    lafette.position.set(0, 0.42, 0.02);
    tagEquipShadow(lafette);
    gun.add(lafette);

    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.13, 0.14), dark);
    receiver.position.set(0.04, 0.52, 0.08);
    receiver.rotation.x = -0.08;
    gun.add(receiver);

    const jacket = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.62, 10), dark);
    jacket.rotation.z = Math.PI / 2;
    jacket.position.set(0.38, 0.54, 0.1);
    gun.add(jacket);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.42, 8), dark);
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(0.78, 0.54, 0.1);
    gun.add(barrel);
    muzzleMesh = barrel;

    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.16, 10), dark);
    drum.rotation.x = Math.PI / 2;
    drum.position.set(-0.02, 0.5, -0.12);
    gun.add(drum);

    const beltBox = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.22), dark);
    beltBox.position.set(-0.22, 0.44, 0.18);
    gun.add(beltBox);
  } else if (factionId === 'usa') {
    addMgTripod(gun, dark, { spread: 0.42, legLen: 0.48, pivotY: 0.32 });

    const traverse = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.28), dark);
    traverse.position.set(0, 0.4, 0);
    gun.add(traverse);

    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 0.12), dark);
    receiver.position.set(0.08, 0.5, 0.06);
    gun.add(receiver);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.042, 0.58, 8), dark);
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(0.46, 0.51, 0.06);
    gun.add(barrel);
    muzzleMesh = barrel;

    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.1), dark);
    stock.position.set(-0.14, 0.49, 0.02);
    gun.add(stock);

    const ammoCan = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.18), dark);
    ammoCan.position.set(-0.28, 0.38, 0.22);
    gun.add(ammoCan);

    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.03, 0.16), mat(0x3d4a32, { rough: 0.8 }));
    lid.position.set(-0.28, 0.47, 0.22);
    gun.add(lid);
  } else if (factionId === 'russia') {
    addMgTripod(gun, dark, { spread: 0.4, legLen: 0.48, pivotY: 0.34 });

    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.12), dark);
    receiver.position.set(0.06, 0.48, 0.06);
    gun.add(receiver);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.042, 0.52, 8), dark);
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(0.42, 0.5, 0.06);
    gun.add(barrel);
    muzzleMesh = barrel;

    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.09, 0.1), dark);
    stock.position.set(-0.16, 0.47, 0.02);
    gun.add(stock);

    const pan = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.06, 12), dark);
    pan.rotation.x = Math.PI / 2;
    pan.position.set(0, 0.62, 0.02);
    gun.add(pan);

    const panRim = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.012, 6, 16), mat(0x3a3028, { rough: 0.85 }));
    panRim.rotation.x = Math.PI / 2;
    panRim.position.set(0, 0.65, 0.02);
    gun.add(panRim);
  } else if (factionId === 'japan') {
    addMgTripod(gun, dark, { spread: 0.43, legLen: 0.5, pivotY: 0.34 });

    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.15, 0.14), dark);
    receiver.position.set(0.04, 0.49, 0.06);
    gun.add(receiver);

    const jacket = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.06, 0.6, 10), dark);
    jacket.rotation.z = Math.PI / 2;
    jacket.position.set(0.42, 0.5, 0.06);
    gun.add(jacket);
    muzzleMesh = jacket;

    for (let i = 0; i < 6; i++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.009, 5, 10), dark);
      rib.rotation.y = Math.PI / 2;
      rib.position.set(0.2 + i * 0.085, 0.5, 0.06);
      gun.add(rib);
    }

    const feedStrip = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.035, 0.075),
      mat(0x665b42, { metal: 0.46, rough: 0.58 })
    );
    feedStrip.position.set(-0.12, 0.53, -0.12);
    gun.add(feedStrip);

    const shoulderBar = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.055, 0.16), dark);
    shoulderBar.position.set(-0.24, 0.46, 0.06);
    gun.add(shoulderBar);
  } else {
    addMgTripod(gun, dark, { spread: 0.4, legLen: 0.5, pivotY: 0.35 });

    const cradle = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.34), dark);
    cradle.position.set(0, 0.41, 0.04);
    gun.add(cradle);

    const jacket = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.72, 10), dark);
    jacket.rotation.z = Math.PI / 2;
    jacket.position.set(0.22, 0.52, 0.08);
    gun.add(jacket);

    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.18, 8), dark);
    muzzle.rotation.z = Math.PI / 2;
    muzzle.position.set(0.72, 0.52, 0.08);
    gun.add(muzzle);
    muzzleMesh = muzzle;

    const condenser = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.2, 8), dark);
    condenser.position.set(-0.3, 0.42, 0.2);
    gun.add(condenser);

    const hose = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 0.04), dark);
    hose.position.set(-0.08, 0.46, 0.14);
    hose.rotation.y = 0.35;
    gun.add(hose);
  }

  if (muzzleMesh) {
    // Cylinders are rotated +90 degrees around Z, so local -Y is the forward tip.
    muzzleMesh.name = 'machineGunMuzzle';
    muzzleMesh.userData.muzzleTipSign = -1;
    group.userData.machineGunMuzzle = muzzleMesh;
  }

  addMgCrewman(group, body, dark, factionId, -0.42, 0.48, { gunner: true });
  addMgCrewman(group, body, dark, factionId, 0.38, 0.62);
  group.userData.hitRadius = 1.85;
}

export function buildFactionMedic(group, body, dark, factionId) {
  const aidCrate = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.2), mat(0x5a4a38, { rough: 0.82 }));
  aidCrate.position.set(0.32, 0.14, -0.18);
  tagEquipShadow(aidCrate);
  group.add(aidCrate);
  addRedCross(group, 0.32, 0.18, -0.07, 0.1);

  const bag = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.1), mat(0x4a4035, { rough: 0.85 }));
  bag.position.set(-0.12, 0.38, 0.08);
  group.add(bag);
  addRedCross(group, -0.12, 0.44, 0.14, 0.06);

  const positions = [
    { x: 0, z: 0, lead: true },
    { x: 0.45, z: 0.35, lead: false },
  ];

  let squadIndex = 0;
  for (const { x, z, lead } of positions) {
    buildSquadSoldier(group, {
      factionId,
      squadIndex: squadIndex++,
      x,
      z,
      extraMeshes: lead
        ? (soldier) => {
            const armband = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.12), mat(0xf2f0e8, { rough: 0.9 }));
            armband.position.set(0.12, 0.42, 0.02);
            soldier.add(armband);
            addRedCross(group, x + 0.12, 0.44, z + 0.08, 0.045);
          }
        : undefined,
    });
  }

  group.userData.hitRadius = 1.35;
}

export function buildFactionEngineer(group, body, dark, factionId) {
  // Kit pile near the squad (shared tools — not a lone engineer model)
  const toolbox = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.15, 0.22), mat(0x6b4a2e, { rough: 0.82 }));
  toolbox.position.set(0.55, 0.14, -0.42);
  tagEquipShadow(toolbox);
  group.add(toolbox);

  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.14, 6), mat(0x3a3028, { rough: 0.9 }));
  handle.rotation.z = Math.PI / 2;
  handle.position.set(0.55, 0.24, -0.32);
  group.add(handle);

  const oilCan = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.16, 8), mat(0x2a4a62, { metal: 0.55 }));
  oilCan.position.set(0.28, 0.18, -0.48);
  group.add(oilCan);

  // 4-man combat engineer section with mixed rifles and SMGs
  const positions = configureTacticalSquadFormation(group, 'engineer', 4).map(
    ({ x, z }, index) => ({ x, z, lead: index === 0 })
  );

  let squadIndex = 0;
  for (const { x, z, lead } of positions) {
    buildSquadSoldier(group, {
      factionId,
      squadIndex: squadIndex++,
      x,
      z,
      withRifle: true,
      unitType: 'engineer',
      extraMeshes: lead
        ? (soldier) => {
            // NCO gold armband
            const armband = new THREE.Mesh(
              new THREE.BoxGeometry(0.05, 0.1, 0.12),
              mat(0xe8c040, { rough: 0.9 })
            );
            armband.position.set(0.12, 0.42, 0.02);
            soldier.add(armband);
            // Wrench on lead soldier
            const wrench = new THREE.Mesh(
              new THREE.BoxGeometry(0.2, 0.04, 0.04),
              mat(0x8a9098, { metal: 0.72, rough: 0.45 })
            );
            wrench.position.set(-0.14, 0.38, 0.1);
            wrench.rotation.z = 0.5;
            soldier.add(wrench);
          }
        : undefined,
    });
  }

  group.userData.hitRadius = 1.55;
}

/**
 * One-man signals detachment with a faction-specific period backpack set.
 * The radio is deliberately a real pack, aerial, handset, and cable silhouette
 * rather than a generic infantry marker so the unit remains readable in a
 * crowded rear assembly and in the field.
 */
export function buildFactionRadioOperator(group, _body, dark, factionId) {
  const radioSpecs = {
    germany: {
      caseColor: 0x46503a,
      panelColor: 0x5d5a43,
      width: 0.2,
      height: 0.31,
      depth: 0.13,
      antenna: 0.58,
      tilt: -0.08,
      handsetX: 0.1,
      sideDetail: 'battery',
    },
    usa: {
      caseColor: 0x4c5c3a,
      panelColor: 0x68714a,
      width: 0.22,
      height: 0.34,
      depth: 0.14,
      antenna: 0.52,
      tilt: 0.04,
      handsetX: 0.1,
      sideDetail: 'handle',
    },
    uk: {
      caseColor: 0x6a5f40,
      panelColor: 0x82744c,
      width: 0.19,
      height: 0.28,
      depth: 0.13,
      antenna: 0.64,
      tilt: 0.02,
      handsetX: -0.1,
      sideDetail: 'pouch',
    },
    russia: {
      caseColor: 0x46573a,
      panelColor: 0x5d6844,
      width: 0.21,
      height: 0.3,
      depth: 0.14,
      antenna: 0.57,
      tilt: 0.12,
      handsetX: -0.1,
      sideDetail: 'battery',
    },
    japan: {
      caseColor: 0x64603e,
      panelColor: 0x7a7048,
      width: 0.2,
      height: 0.29,
      depth: 0.13,
      antenna: 0.66,
      tilt: -0.05,
      handsetX: 0.1,
      sideDetail: 'battery',
    },
  }[factionId] ?? null;
  const spec = radioSpecs ?? {
    caseColor: 0x46503a,
    panelColor: 0x5d5a43,
    width: 0.2,
    height: 0.31,
    depth: 0.13,
    antenna: 0.58,
    tilt: -0.08,
    handsetX: 0.1,
    sideDetail: 'battery',
  };

  buildSquadSoldier(group, {
    factionId,
    squadIndex: 0,
    x: 0,
    z: 0,
    withPack: false,
    withRifle: true,
    withWebbing: true,
    extraMeshes: (soldier, mats) => {
      const radioCase = mat(spec.caseColor, { rough: 0.82, metal: 0.12 });
      const radioPanel = mat(spec.panelColor, { rough: 0.7, metal: 0.22 });
      const leather = mat(0x332c22, { rough: 0.92, metal: 0.02 });

      const pack = new THREE.Mesh(
        new THREE.BoxGeometry(spec.width, spec.height, spec.depth),
        radioCase
      );
      pack.name = `radioSet-${factionId}`;
      pack.position.set(0, 0.47, -0.135);
      pack.geometry.translate(0, 0, -0.018);
      pack.userData.radioPart = 'set';
      tagEquipShadow(pack);
      soldier.add(pack);

      const top = new THREE.Mesh(
        new THREE.BoxGeometry(spec.width * 0.86, 0.035, spec.depth * 0.9),
        radioPanel
      );
      top.position.set(0, 0.47 + spec.height * 0.5 + 0.018, -0.14);
      top.userData.radioPart = 'topPanel';
      tagEquipShadow(top);
      soldier.add(top);

      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.032, 0.07, 8),
        dark
      );
      base.position.set(0, top.position.y + 0.045, -0.14);
      base.userData.radioPart = 'aerialBase';
      tagEquipShadow(base);
      soldier.add(base);

      const aerial = new THREE.Mesh(
        new THREE.CylinderGeometry(0.009, 0.014, spec.antenna, 6),
        dark
      );
      aerial.position.set(0, base.position.y + 0.035 + spec.antenna * 0.5, -0.14);
      aerial.rotation.z = spec.tilt;
      aerial.userData.radioPart = 'aerial';
      tagEquipShadow(aerial);
      soldier.add(aerial);

      const dial = new THREE.Mesh(
        new THREE.CylinderGeometry(0.024, 0.024, 0.018, 10),
        dark
      );
      dial.rotation.x = Math.PI / 2;
      dial.position.set(-spec.width * 0.27, top.position.y - 0.01, -0.215);
      dial.userData.radioPart = 'dial';
      soldier.add(dial);

      const handset = new THREE.Mesh(
        new THREE.BoxGeometry(0.055, 0.19, 0.04),
        dark
      );
      handset.position.set(spec.handsetX, 0.54, 0.12);
      handset.rotation.z = spec.handsetX > 0 ? -0.12 : 0.12;
      handset.userData.radioPart = 'handset';
      soldier.add(handset);

      const shoulderStrap = new THREE.Mesh(
        new THREE.BoxGeometry(0.035, 0.3, 0.018),
        leather
      );
      shoulderStrap.position.set(0.08, 0.48, 0.09);
      shoulderStrap.rotation.z = -0.2;
      shoulderStrap.userData.radioPart = 'shoulderStrap';
      soldier.add(shoulderStrap);

      if (spec.sideDetail === 'handle') {
        const handle = new THREE.Mesh(
          new THREE.TorusGeometry(0.055, 0.012, 5, 10, Math.PI),
          leather
        );
        handle.rotation.x = Math.PI / 2;
        handle.position.set(0, top.position.y + 0.035, -0.14);
        handle.userData.radioPart = 'carryHandle';
        soldier.add(handle);
      } else if (spec.sideDetail === 'pouch') {
        const pouch = new THREE.Mesh(
          new THREE.BoxGeometry(0.09, 0.13, 0.065),
          leather
        );
        pouch.position.set(-0.17, 0.38, 0.035);
        pouch.userData.radioPart = 'batteryPouch';
        tagEquipShadow(pouch);
        soldier.add(pouch);
      } else {
        const battery = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, 0.14, 0.07),
          radioPanel
        );
        battery.position.set(0.16, 0.38, -0.08);
        battery.userData.radioPart = 'batteryBox';
        tagEquipShadow(battery);
        soldier.add(battery);
      }

      const cable = new THREE.Mesh(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3([
            new THREE.Vector3(spec.handsetX, 0.47, 0.105),
            new THREE.Vector3(spec.handsetX * 0.5, 0.39, 0.06),
            new THREE.Vector3(0.04, 0.3, -0.02),
          ]),
          8,
          0.012,
          5,
          false
        ),
        dark
      );
      cable.name = 'radioHandsetCable';
      cable.userData.radioPart = 'cable';
      tagEquipShadow(cable, 'receive');
      soldier.add(cable);

      // Signals operators carry their own radio but remain a single combat man.
      soldier.userData.radioOperator = true;
      soldier.userData.radioSet = pack;
      void mats;
    },
  });

  group.userData.squadSize = 1;
  group.userData.radioOperator = true;
  group.userData.hitRadius = 1.35;
}

export function buildFactionMortar(group, body, detail, dark, factionId) {
  const mortar = new THREE.Group();
  mortar.name = 'deployedMortar';
  mortar.userData.deployed = true;
  group.add(mortar);
  group.userData.mortarPivot = mortar;

  const tubeLen = factionId === 'usa' ? 1.2 : 1.45;
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, tubeLen, 10), dark);
  tube.rotation.x = -1.15;
  tube.position.set(0, 0.72, 0.22);
  tube.name = 'mortarMuzzle';
  tube.userData.muzzleTipSign = 1;
  tagEquipShadow(tube);
  mortar.add(tube);
  group.userData.mortarMuzzle = tube;

  const muzzleLip = new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.012, 6, 12), dark);
  muzzleLip.rotation.x = Math.PI / 2;
  muzzleLip.position.y = tubeLen / 2;
  tube.add(muzzleLip);

  const bipodSpread = factionId === 'uk' ? 0.42 : 0.35;
  for (const x of [-bipodSpread, bipodSpread]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.38, 0.05), dark);
    leg.position.set(x, 0.2, 0.38);
    leg.rotation.x = -0.55;
    tagEquipShadow(leg, 'receive');
    mortar.add(leg);
  }

  if (factionId === 'germany') {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.04, 0.35), dark);
    plate.position.set(0, 0.12, 0);
    tagEquipShadow(plate, 'receive');
    mortar.add(plate);
  } else {
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.23, 0.045, 10), dark);
    plate.position.set(0, 0.1, 0.02);
    plate.scale.z = 0.72;
    tagEquipShadow(plate, 'receive');
    mortar.add(plate);
  }

  buildSquadSoldier(group, {
    factionId,
    squadIndex: 0,
    x: -0.55,
    z: -0.2,
    crouching: true,
    withPack: false,
  });
  buildSquadSoldier(group, {
    factionId,
    squadIndex: 1,
    x: 0.42,
    z: -0.55,
    crouching: true,
    withPack: false,
  });

  group.userData.hitRadius = 2;
}

export function buildFactionInfantry(group, _body, _dark, factionId) {
  const positions = configureTacticalSquadFormation(group, 'infantry', 5);

  for (let i = 0; i < positions.length; i++) {
    const { x: px, z: pz } = positions[i];
    buildSquadSoldier(group, {
      factionId,
      squadIndex: i,
      x: px,
      z: pz,
      unitType: 'infantry',
    });
  }
  group.userData.squadSize = positions.length;
  group.userData.hitRadius = 1.2;
}

export function buildFactionCommander(group, _body, dark, factionId) {
  const positions = [
    { x: 0, z: 0, officer: true },
    { x: -0.72, z: 0.48 },
    { x: 0.72, z: 0.48 },
    { x: -0.72, z: -0.55 },
    { x: 0.72, z: -0.55 },
  ];
  const insigniaColors = {
    germany: 0xc6a45c,
    usa: 0xd7c27a,
    uk: 0xc8b36a,
    russia: 0xc9362b,
    japan: 0xd3b85e,
  };

  for (let i = 0; i < positions.length; i++) {
    const { x, z, officer } = positions[i];
    buildSquadSoldier(group, {
      factionId,
      squadIndex: i,
      x,
      z,
      withPack: !officer,
      withRifle: !officer,
      unitType: 'commander',
      extraMeshes: officer
        ? (soldier, mats) => {
            const helmet = soldier.children.find(
              (child) => child.userData?.infantryPart === 'helmet'
            );
            if (helmet) helmet.visible = false;

            const cap = new THREE.Group();
            cap.name = `commanderCap-${factionId}`;
            cap.position.set(0, 0.91, 0);
            const crown = new THREE.Mesh(
              factionId === 'russia'
                ? new THREE.CylinderGeometry(0.11, 0.125, 0.09, 12)
                : new THREE.CylinderGeometry(0.105, 0.125, 0.075, 12),
              mats.helmet
            );
            crown.scale.z = 1.12;
            const visor = new THREE.Mesh(
              new THREE.BoxGeometry(0.15, 0.018, 0.09),
              dark
            );
            visor.position.set(0, -0.045, 0.105);
            visor.rotation.x = -0.16;
            const band = new THREE.Mesh(
              new THREE.CylinderGeometry(0.126, 0.126, 0.025, 12),
              mat(insigniaColors[factionId] ?? 0xd0b56b, { metal: 0.18, rough: 0.55 })
            );
            band.position.y = -0.025;
            cap.add(crown, visor, band);
            tagEquipShadow(crown);
            soldier.add(cap);

            const binoculars = new THREE.Group();
            binoculars.name = 'commanderBinoculars';
            binoculars.position.set(0.05, 0.48, 0.13);
            for (const bx of [-0.045, 0.045]) {
              const glass = new THREE.Mesh(
                new THREE.CylinderGeometry(0.035, 0.045, 0.14, 8),
                dark
              );
              glass.rotation.x = Math.PI / 2;
              glass.position.x = bx;
              binoculars.add(glass);
            }
            soldier.add(binoculars);

            const mapCase = new THREE.Mesh(
              new THREE.BoxGeometry(0.17, 0.22, 0.08),
              mat(0x6b4b2e, { rough: 0.9 })
            );
            mapCase.position.set(-0.16, 0.35, 0.08);
            mapCase.rotation.z = 0.12;
            soldier.add(mapCase);
          }
        : undefined,
    });
  }

  group.userData.squadSize = positions.length;
  group.userData.commanderOfficerIndex = 0;
  group.userData.hitRadius = 1.65;
}

export function buildFactionVehicleCrew(group, _body, _dark, factionId) {
  const positions = [
    { x: -0.42, z: 0.08 },
    { x: 0.46, z: -0.12 },
  ];
  for (let i = 0; i < positions.length; i++) {
    buildSquadSoldier(group, {
      factionId,
      squadIndex: i,
      x: positions[i].x,
      z: positions[i].z,
      withPack: false,
      withWebbing: true,
      unitType: 'vehicleCrew',
    });
  }
  group.userData.squadSize = positions.length;
  group.userData.hitRadius = 1.4;
}

export function buildFactionTruckDriver(group, _body, _dark, factionId) {
  buildSquadSoldier(group, {
    factionId,
    squadIndex: 0,
    x: 0,
    z: 0,
    withRifle: true,
    withPack: false,
    withWebbing: true,
  });
  group.userData.squadSize = 1;
  group.userData.hitRadius = 1.25;
}

export function buildFactionParatrooper(group, _body, dark, factionId) {
  const positions = configureTacticalSquadFormation(group, 'paratrooper', 4).map(
    ({ x, z }, index) => ({ x, z, lead: index === 0 })
  );

  for (let i = 0; i < positions.length; i++) {
    const { x: px, z: pz, lead } = positions[i];
    buildSquadSoldier(group, {
      factionId,
      squadIndex: i,
      x: px,
      z: pz,
      withRifle: !lead,
      unitType: 'paratrooper',
      extraMeshes: lead
        ? (soldier) => {
            const weapon = new THREE.Group();
            weapon.name = 'infantryWeapon';
            weapon.userData.infantryPart = 'weapon';
            weapon.userData.weaponKind = 'atLauncher';
            weapon.position.set(0.06, 0.36, 0.06);

            const tubeLen = factionId === 'uk' ? 0.72 : 0.78;
            const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, tubeLen, 8), dark);
            tube.name = 'atTube';
            tube.userData.infantryPart = 'barrel';
            // Cylinder local +Y becomes the rear of the shoulder-fired tube
            // after its Z rotation. Mark the opposite end as the muzzle so
            // projectile/VFX origins stay at the warhead end in every pose.
            tube.userData.muzzleTipSign = -1;
            tube.rotation.z = Math.PI / 2;
            tube.position.set(0.16, 0.08, 0.08);
            weapon.add(tube);

            const warhead = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), mat(0x2a2a28, { metal: 0.35 }));
            warhead.name = 'atWarhead';
            warhead.position.set(0.52, 0.12, 0.12);
            weapon.add(warhead);

            if (factionId === 'uk') {
              const piatStock = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.22), dark);
              piatStock.name = 'atStock';
              piatStock.position.set(-0.14, -0.02, -0.12);
              weapon.add(piatStock);
            }

            soldier.add(weapon);
            soldier.userData.atLauncher = { tube, warhead, weapon };
          }
        : undefined,
    });
  }

  group.userData.squadSize = positions.length;
  group.userData.hitRadius = 1.2;
}

const SNIPER_STRIP_COLORS = {
  uk: [0x5a5434, 0x3d4a2c, 0x6b5a38, 0x4a5230, 0x7a6a44],
  usa: [0x4c5634, 0x5a5238, 0x3a422c, 0x6a6440],
  germany: [0x5a5238, 0x3d4530, 0x6b4a32, 0x4a5534],
  russia: [0x6b6840, 0x4a5534, 0x8a7a4c, 0x3d4a30],
  japan: [0x6b663d, 0x4a5230, 0x8a7a48, 0x3a4528],
};

function ghillieStripMat(color) {
  return mat(color, { rough: 0.96, metal: 0.02 });
}

function addGhillieStrips(parent, colors, count, origin, spread, length, seed) {
  let value = seed >>> 0;
  const rand = () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
  const mats = colors.map((color) => ghillieStripMat(color));
  for (let i = 0; i < count; i++) {
    const stripLen = length * (0.55 + rand() * 0.7);
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(0.018 + rand() * 0.03, stripLen, 0.008 + rand() * 0.012),
      mats[i % mats.length]
    );
    strip.position.set(
      origin.x + (rand() - 0.5) * spread.x,
      origin.y - stripLen * 0.35,
      origin.z + (rand() - 0.5) * spread.z
    );
    strip.rotation.set((rand() - 0.5) * 0.7, rand() * Math.PI, (rand() - 0.5) * 0.55);
    tagEquipShadow(strip, 'receive');
    parent.add(strip);
  }
}

function addHelmetCover(helmet, material, { brim = 0.02, drop = 0.05 } = {}) {
  if (!helmet) return;
  const cover = new THREE.Mesh(
    new THREE.SphereGeometry(0.132, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.58),
    material
  );
  cover.position.y = brim;
  cover.scale.set(1.08, 0.92, 1.1);
  tagEquipShadow(cover, 'receive');
  helmet.add(cover);
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, drop, 10, 1, true), material);
  skirt.position.y = -0.02;
  tagEquipShadow(skirt, 'receive');
  helmet.add(skirt);
}

function addSniperConcealment(soldier, factionId, mats, ghillieMat, role, seed) {
  const cloth =
    ghillieMat ??
    mat(SNIPER_STRIP_COLORS[factionId]?.[0] ?? 0x3d4a32, { rough: 0.95, metal: 0.05 });
  cloth.side = THREE.DoubleSide;
  const helmet = soldier.children.find((child) => child.userData?.infantryPart === 'helmet');
  const colors = SNIPER_STRIP_COLORS[factionId] ?? SNIPER_STRIP_COLORS.uk;
  const hide = new THREE.Group();
  hide.name = 'sniperConcealment';

  if (factionId === 'uk') {
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.72), cloth);
    hood.position.set(0, 0.78, -0.02);
    hood.scale.set(1.05, 0.85, 1.15);
    tagEquipShadow(hood);
    hide.add(hood);
    const cape = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.28, 0.42, 10, 1, true), cloth);
    cape.position.set(0, 0.48, -0.04);
    cape.scale.set(1.15, 1, 0.85);
    tagEquipShadow(cape, 'receive');
    hide.add(cape);
    addGhillieStrips(hide, colors, 18, { x: 0, y: 0.72, z: 0 }, { x: 0.38, z: 0.32 }, 0.22, seed);
    if (helmet) helmet.visible = false;
  } else if (factionId === 'usa') {
    addHelmetCover(helmet, cloth, { brim: 0.01, drop: 0.04 });
    const veil = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 0.28, 10, 1, true), cloth);
    veil.position.set(0, 0.5, -0.03);
    veil.scale.set(1.08, 1, 0.82);
    tagEquipShadow(veil, 'receive');
    hide.add(veil);
    addGhillieStrips(hide, colors, 11, { x: 0, y: 0.78, z: 0.02 }, { x: 0.28, z: 0.24 }, 0.16, seed + 3);
  } else if (factionId === 'germany') {
    const smock = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.38, 10), cloth);
    smock.position.set(0, 0.42, 0);
    smock.scale.set(1.08, 1, 0.78);
    tagEquipShadow(smock, 'receive');
    hide.add(smock);
    addHelmetCover(helmet, cloth, { brim: 0.015, drop: 0.045 });
    addGhillieStrips(hide, colors, 8, { x: 0, y: 0.74, z: 0 }, { x: 0.26, z: 0.22 }, 0.12, seed + 7);
    for (const side of [-1, 1]) {
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 5), ghillieStripMat(colors[1]));
      tuft.position.set(side * 0.1, 0.82, 0.02);
      tuft.rotation.z = side * 0.35;
      hide.add(tuft);
    }
  } else if (factionId === 'russia') {
    const suit = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.22, 0.46, 10), cloth);
    suit.position.set(0, 0.4, 0);
    suit.scale.set(1.12, 1, 0.8);
    tagEquipShadow(suit, 'receive');
    hide.add(suit);
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.155, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.7), cloth);
    hood.position.set(0, 0.76, -0.01);
    hood.scale.set(1.08, 0.82, 1.12);
    tagEquipShadow(hood);
    hide.add(hood);
    addGhillieStrips(hide, colors, 10, { x: 0, y: 0.58, z: 0.02 }, { x: 0.32, z: 0.26 }, 0.14, seed + 11);
    if (helmet) helmet.visible = false;
  } else {
    addHelmetCover(helmet, cloth, { brim: 0.0, drop: 0.05 });
    const cape = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.26, 0.36, 10, 1, true), cloth);
    cape.position.set(0, 0.46, -0.04);
    cape.scale.set(1.1, 1, 0.84);
    tagEquipShadow(cape, 'receive');
    hide.add(cape);
    addGhillieStrips(hide, colors, 16, { x: 0, y: 0.76, z: 0 }, { x: 0.3, z: 0.28 }, 0.18, seed + 13);
    for (let i = 0; i < 6; i++) {
      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(0.012, 0.16, 0.006),
        ghillieStripMat(colors[i % colors.length])
      );
      blade.position.set((i - 2.5) * 0.035, 0.86, 0.04);
      blade.rotation.z = (i - 2.5) * 0.12;
      hide.add(blade);
    }
  }

  soldier.add(hide);
  void mats;
  void role;
}

function addSpotterBinoculars(soldier, mats) {
  const binoculars = new THREE.Group();
  binoculars.name = 'spotterBinoculars';
  binoculars.position.set(0.06, -0.22, 0.1);
  for (const bx of [-0.038, 0.038]) {
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, 0.11, 8), mats.dark);
    glass.rotation.x = Math.PI / 2;
    glass.position.x = bx;
    binoculars.add(glass);
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.018, 0.03), mats.dark);
  binoculars.add(bridge);
  const head = soldier.children.find((child) => child.userData?.infantryPart === 'head');
  (head ?? soldier).add(binoculars);
  soldier.userData.spotterOptics = {
    binoculars,
    blend: 0,
    rest: {
      position: binoculars.position.clone(),
      rotation: binoculars.rotation.clone(),
    },
    raised: {
      position: new THREE.Vector3(0, 0.02, 0.13),
      rotation: new THREE.Euler(-0.28, 0.04, 0),
    },
  };
}

export function buildFactionSniper(group, _body, _detail, dark, factionId, ghillieMat) {
  const hideMat =
    ghillieMat ??
    mat(SNIPER_STRIP_COLORS[factionId]?.[0] ?? 0x3d4a32, {
      rough: 0.95,
      metal: 0.05,
    });
  hideMat.side = THREE.DoubleSide;

  const sniper = buildSquadSoldier(group, {
    factionId,
    squadIndex: 0,
    x: 0.36,
    z: 0.16,
    crouching: true,
    withPack: false,
    withRifle: false,
    extraMeshes: (soldier, mats) => {
      addFactionSniperRifle(soldier, mats, factionId, { crouching: true });
      addSniperConcealment(soldier, factionId, mats, hideMat, 'sniper', 0x1944);
      soldier.userData.sniperRole = 'sniper';
    },
  });
  sniper.userData.sniperRole = 'sniper';

  const spotter = buildSquadSoldier(group, {
    factionId,
    squadIndex: 1,
    x: -0.44,
    z: -0.34,
    crouching: true,
    withPack: false,
    withRifle: true,
    extraMeshes: (soldier, mats) => {
      addSpotterBinoculars(soldier, mats);
      addSniperConcealment(soldier, factionId, mats, hideMat, 'spotter', 0x1939);
      soldier.userData.sniperRole = 'spotter';
    },
  });
  spotter.userData.sniperRole = 'spotter';

  group.userData.squadSize = 2;
  group.userData.sniperSpotterIndex = 1;
  group.userData.hitRadius = 1.75;
  void dark;
}

const VEHICLE_BUILDERS = {
  germany: {
    tank: buildPanzerIV,
    tankDestroyer: (group, body, detail, dark) => buildTankDestroyer(group, body, detail, dark, 'germany'),
    superHeavyTank: buildTigerI,
    armoredCar: buildSdkfz222,
    truck: (group, body, detail, dark) =>
      buildTruckFromDesign(group, body, detail, dark, getVehicleDesign('germany', 'truck')),
    artillery: buildLeFH18,
    antiTankGun: buildPak40,
  },
  usa: {
    tank: buildSherman,
    tankDestroyer: (group, body, detail, dark) => buildTankDestroyer(group, body, detail, dark, 'usa'),
    superHeavyTank: buildPershing,
    armoredCar: buildM8Greyhound,
    truck: (group, body, detail, dark) =>
      buildTruckFromDesign(group, body, detail, dark, getVehicleDesign('usa', 'truck')),
    artillery: buildM101,
    antiTankGun: buildM1AtGun,
  },
  uk: {
    tank: buildChurchill,
    tankDestroyer: (group, body, detail, dark) => buildTankDestroyer(group, body, detail, dark, 'uk'),
    superHeavyTank: buildBlackPrince,
    armoredCar: buildDaimlerAC,
    truck: (group, body, detail, dark) =>
      buildTruckFromDesign(group, body, detail, dark, getVehicleDesign('uk', 'truck')),
    artillery: build25Pounder,
    antiTankGun: build6Pounder,
  },
  russia: {
    tank: buildT3485,
    tankDestroyer: (group, body, detail, dark) => buildTankDestroyer(group, body, detail, dark, 'russia'),
    superHeavyTank: buildIS2,
    armoredCar: buildBA64,
    truck: (group, body, detail, dark) =>
      buildTruckFromDesign(group, body, detail, dark, getVehicleDesign('russia', 'truck')),
    artillery: buildM30,
    antiTankGun: buildZIS3,
  },
  japan: {
    tank: buildShinhotoChiHa,
    tankDestroyer: (group, body, detail, dark) => buildTankDestroyer(group, body, detail, dark, 'japan'),
    superHeavyTank: buildChiNu,
    armoredCar: buildChiyoda,
    truck: (group, body, detail, dark) =>
      buildTruckFromDesign(group, body, detail, dark, getVehicleDesign('japan', 'truck')),
    artillery: buildType91Howitzer,
    antiTankGun: buildType1AtGun,
  },
};

export function buildFactionVehicle(group, type, factionId, body, detail, dark) {
  const nation = VEHICLE_BUILDERS[factionId] ?? VEHICLE_BUILDERS.germany;
  const fn = nation[type];
  if (fn) {
    fn(group, body, detail, dark);
    addShadows(group);
    return true;
  }
  return false;
}
