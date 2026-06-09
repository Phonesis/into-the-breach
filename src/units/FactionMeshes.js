import * as THREE from 'three';
import { getVehicleDesign } from './vehicleDesigns.js';
import {
  buildTankFromDesign,
  buildArmoredCarFromDesign,
  buildArtilleryFromDesign,
  buildAtGunFromDesign,
} from './VehicleMeshKit.js';

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
export function buildLeFH18(group, body, detail, dark) {
  buildArtilleryFromDesign(group, body, detail, dark, getVehicleDesign('germany', 'artillery'));
}

/** USA — M101 howitzer */
export function buildM101(group, body, detail, dark) {
  buildArtilleryFromDesign(group, body, detail, dark, getVehicleDesign('usa', 'artillery'));
}

/** UK — QF 25-pounder */
export function build25Pounder(group, body, detail, dark) {
  buildArtilleryFromDesign(group, body, detail, dark, getVehicleDesign('uk', 'artillery'));
}

export function buildPak40(group, body, detail, dark) {
  buildAtGunFromDesign(group, body, detail, dark, getVehicleDesign('germany', 'antiTankGun'));
}

export function buildM1AtGun(group, body, detail, dark) {
  buildAtGunFromDesign(group, body, detail, dark, getVehicleDesign('usa', 'antiTankGun'));
}

export function build6Pounder(group, body, detail, dark) {
  buildAtGunFromDesign(group, body, detail, dark, getVehicleDesign('uk', 'antiTankGun'));
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
}

function buildZIS3(group, body, detail, dark) {
  buildAtGunFromDesign(group, body, detail, dark, getVehicleDesign('russia', 'antiTankGun'));
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

function addMgCrewman(group, body, dark, factionId, x, z, { gunner = false } = {}) {
  const soldier = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.34, 0.15), body);
  torso.position.y = gunner ? 0.3 : 0.38;
  if (gunner) torso.rotation.x = 0.35;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), mat(0xc8a882, { rough: 0.8 }));
  head.position.y = gunner ? 0.56 : 0.66;

  let helmet;
  if (factionId === 'germany') {
    helmet = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2), body);
    helmet.position.y = gunner ? 0.6 : 0.7;
  } else if (factionId === 'usa') {
    helmet = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), body);
    helmet.scale.set(1.05, 0.85, 1.05);
    helmet.position.y = gunner ? 0.6 : 0.7;
  } else if (factionId === 'russia') {
    helmet = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), body);
    helmet.scale.set(1.06, 0.82, 1.06);
    helmet.position.y = gunner ? 0.59 : 0.69;
  } else {
    helmet = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), mat(0x4a4a48, { rough: 0.75 }));
    helmet.scale.set(1.08, 0.78, 1.08);
    helmet.position.y = gunner ? 0.58 : 0.68;
  }

  soldier.add(torso, head, helmet);
  soldier.position.set(x, 0.12, z);
  group.add(soldier);
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
  const slab = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 0.1, 10), dark);
  slab.position.y = 0.06;
  group.add(slab);

  if (factionId === 'germany') {
    addMgTripod(group, dark, { spread: 0.44, legLen: 0.5, pivotY: 0.36 });

    const lafette = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.38), dark);
    lafette.position.set(0, 0.42, 0.02);
    group.add(lafette);

    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.13, 0.14), dark);
    receiver.position.set(0.04, 0.52, 0.08);
    receiver.rotation.x = -0.08;
    group.add(receiver);

    const jacket = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.62, 10), dark);
    jacket.rotation.z = Math.PI / 2;
    jacket.position.set(0.38, 0.54, 0.1);
    group.add(jacket);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.42, 8), dark);
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(0.78, 0.54, 0.1);
    group.add(barrel);

    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.16, 10), dark);
    drum.rotation.x = Math.PI / 2;
    drum.position.set(-0.02, 0.5, -0.12);
    group.add(drum);

    const beltBox = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.22), dark);
    beltBox.position.set(-0.22, 0.44, 0.18);
    group.add(beltBox);
  } else if (factionId === 'usa') {
    addMgTripod(group, dark, { spread: 0.42, legLen: 0.48, pivotY: 0.32 });

    const traverse = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.28), dark);
    traverse.position.set(0, 0.4, 0);
    group.add(traverse);

    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 0.12), dark);
    receiver.position.set(0.08, 0.5, 0.06);
    group.add(receiver);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.042, 0.58, 8), dark);
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(0.46, 0.51, 0.06);
    group.add(barrel);

    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.1), dark);
    stock.position.set(-0.14, 0.49, 0.02);
    group.add(stock);

    const ammoCan = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.18), dark);
    ammoCan.position.set(-0.28, 0.38, 0.22);
    group.add(ammoCan);

    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.03, 0.16), mat(0x3d4a32, { rough: 0.8 }));
    lid.position.set(-0.28, 0.47, 0.22);
    group.add(lid);
  } else if (factionId === 'russia') {
    addMgTripod(group, dark, { spread: 0.4, legLen: 0.48, pivotY: 0.34 });

    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.12), dark);
    receiver.position.set(0.06, 0.48, 0.06);
    group.add(receiver);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.042, 0.52, 8), dark);
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(0.42, 0.5, 0.06);
    group.add(barrel);

    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.09, 0.1), dark);
    stock.position.set(-0.16, 0.47, 0.02);
    group.add(stock);

    const pan = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.06, 12), dark);
    pan.rotation.x = Math.PI / 2;
    pan.position.set(0, 0.62, 0.02);
    group.add(pan);

    const panRim = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.012, 6, 16), mat(0x3a3028, { rough: 0.85 }));
    panRim.rotation.x = Math.PI / 2;
    panRim.position.set(0, 0.65, 0.02);
    group.add(panRim);
  } else {
    addMgTripod(group, dark, { spread: 0.4, legLen: 0.5, pivotY: 0.35 });

    const cradle = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.34), dark);
    cradle.position.set(0, 0.41, 0.04);
    group.add(cradle);

    const jacket = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.72, 10), dark);
    jacket.rotation.z = Math.PI / 2;
    jacket.position.set(0.22, 0.52, 0.08);
    group.add(jacket);

    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.18, 8), dark);
    muzzle.rotation.z = Math.PI / 2;
    muzzle.position.set(0.72, 0.52, 0.08);
    group.add(muzzle);

    const condenser = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.2, 8), dark);
    condenser.position.set(-0.3, 0.42, 0.2);
    group.add(condenser);

    const hose = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 0.04), dark);
    hose.position.set(-0.08, 0.46, 0.14);
    hose.rotation.y = 0.35;
    group.add(hose);
  }

  addMgCrewman(group, body, dark, factionId, -0.42, 0.48, { gunner: true });
  addMgCrewman(group, body, dark, factionId, 0.38, 0.62);
  group.userData.hitRadius = 1.85;
}

export function buildFactionMedic(group, body, dark, factionId) {
  const slab = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.54, 0.1, 10), dark);
  slab.position.y = 0.06;
  group.add(slab);

  const aidCrate = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.2), mat(0x5a4a38, { rough: 0.82 }));
  aidCrate.position.set(0.32, 0.14, -0.18);
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

  for (const { x, z, lead } of positions) {
    const soldier = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.36, 0.15), body);
    torso.position.y = 0.4;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), mat(0xc8a882, { rough: 0.8 }));
    head.position.y = 0.68;

    let helmet;
    if (factionId === 'germany') {
      helmet = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2), body);
      helmet.position.y = 0.72;
    } else if (factionId === 'usa') {
      helmet = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), body);
      helmet.scale.set(1.05, 0.85, 1.05);
      helmet.position.y = 0.72;
    } else if (factionId === 'russia') {
      helmet = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), body);
      helmet.scale.set(1.08, 0.8, 1.08);
      helmet.position.y = 0.71;
    } else {
      helmet = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), mat(0x4a4a48, { rough: 0.75 }));
      helmet.scale.set(1.08, 0.78, 1.08);
      helmet.position.y = 0.7;
    }

    if (lead) {
      const armband = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.12), mat(0xf2f0e8, { rough: 0.9 }));
      armband.position.set(0.12, 0.42, 0.02);
      soldier.add(armband);
      addRedCross(group, x + 0.12, 0.44, 0.08, 0.045);
    }

    soldier.add(torso, head, helmet);
    soldier.position.set(x, 0.14, z);
    group.add(soldier);
  }

  group.userData.hitRadius = 1.35;
}

export function buildFactionEngineer(group, body, dark, factionId) {
  const slab = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.54, 0.1, 10), dark);
  slab.position.y = 0.06;
  group.add(slab);

  const toolbox = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.15, 0.22), mat(0x6b4a2e, { rough: 0.82 }));
  toolbox.position.set(0.34, 0.14, -0.16);
  group.add(toolbox);

  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.14, 6), mat(0x3a3028, { rough: 0.9 }));
  handle.rotation.z = Math.PI / 2;
  handle.position.set(0.34, 0.24, -0.05);
  group.add(handle);

  const wrench = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.045, 0.045), mat(0x8a9098, { metal: 0.72, rough: 0.45 }));
  wrench.position.set(-0.18, 0.4, 0.12);
  wrench.rotation.z = 0.55;
  group.add(wrench);

  const oilCan = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.16, 8), mat(0x2a4a62, { metal: 0.55 }));
  oilCan.position.set(0.08, 0.18, 0.22);
  group.add(oilCan);

  const positions = [
    { x: 0, z: 0, lead: true },
    { x: 0.42, z: 0.32, lead: false },
  ];

  for (const { x, z, lead } of positions) {
    const soldier = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.36, 0.15), body);
    torso.position.y = 0.4;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), mat(0xc8a882, { rough: 0.8 }));
    head.position.y = 0.68;

    let helmet;
    if (factionId === 'germany') {
      helmet = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2), body);
      helmet.position.y = 0.72;
    } else if (factionId === 'usa') {
      helmet = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), mat(0xc4a035, { rough: 0.72 }));
      helmet.scale.set(1.05, 0.85, 1.05);
      helmet.position.y = 0.72;
    } else if (factionId === 'russia') {
      helmet = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), body);
      helmet.scale.set(1.08, 0.8, 1.08);
      helmet.position.y = 0.71;
    } else {
      helmet = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), mat(0x4a4a48, { rough: 0.75 }));
      helmet.scale.set(1.08, 0.78, 1.08);
      helmet.position.y = 0.7;
    }

    if (lead) {
      const armband = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.12), mat(0xe8c040, { rough: 0.9 }));
      armband.position.set(0.12, 0.42, 0.02);
      soldier.add(armband);
    }

    soldier.add(torso, head, helmet);
    soldier.position.set(x, 0.14, z);
    group.add(soldier);
  }

  group.userData.hitRadius = 1.35;
}

export function buildFactionMortar(group, body, detail, dark, factionId) {
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.75, 0.14, 10), dark);
  base.position.y = 0.1;
  group.add(base);

  const tubeLen = factionId === 'usa' ? 1.2 : 1.45;
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, tubeLen, 10), dark);
  tube.rotation.x = -1.15;
  tube.position.set(0, 0.72, 0.22);
  group.add(tube);

  const bipodSpread = factionId === 'uk' ? 0.42 : 0.35;
  for (const x of [-bipodSpread, bipodSpread]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.38, 0.05), dark);
    leg.position.set(x, 0.2, 0.38);
    leg.rotation.x = -0.55;
    group.add(leg);
  }

  if (factionId === 'germany') {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.04, 0.35), dark);
    plate.position.set(0, 0.12, 0);
    group.add(plate);
  }

  const crew = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.32, 4, 6), body);
  crew.position.set(-0.55, 0.38, -0.2);
  group.add(crew);
  group.userData.hitRadius = 2;
}

export function buildFactionInfantry(group, body, dark, factionId) {
  const slab = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.2, 10), dark);
  slab.position.y = 0.1;
  group.add(slab);

  const helmetStyle = factionId;
  const positions = [
    [0, 0, 0],
    [0.55, 0, 0.35],
    [-0.5, 0, 0.3],
    [0.35, 0, -0.55],
    [-0.4, 0, -0.45],
  ];

  for (const [px, , pz] of positions) {
    const soldier = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.38, 0.16), body);
    torso.position.y = 0.42;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), mat(0xc8a882, { rough: 0.8 }));
    head.position.y = 0.72;

    let helmet;
    if (helmetStyle === 'germany') {
      helmet = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2), body);
      helmet.position.y = 0.76;
    } else if (helmetStyle === 'usa') {
      helmet = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), body);
      helmet.scale.set(1.05, 0.85, 1.05);
      helmet.position.y = 0.76;
    } else if (helmetStyle === 'russia') {
      helmet = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), body);
      helmet.scale.set(1.08, 0.8, 1.08);
      helmet.position.y = 0.75;
    } else {
      helmet = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), mat(0x4a4a48, { rough: 0.75 }));
      helmet.scale.set(1.1, 0.75, 1.1);
      helmet.position.y = 0.75;
    }

    const gunLen = helmetStyle === 'uk' ? 0.55 : 0.5;
    const gun = new THREE.Mesh(new THREE.BoxGeometry(gunLen, 0.06, 0.06), dark);
    gun.position.set(0.15, 0.45, 0.12);
    if (helmetStyle === 'usa') {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.05, 0.05), dark);
      bar.position.set(0.05, 0.48, 0.1);
      soldier.add(bar);
    }

    soldier.add(torso, head, helmet, gun);
    soldier.position.set(px, 0.15, pz);
    group.add(soldier);
  }
  group.userData.hitRadius = 1.2;
}

export function buildFactionSniper(group, body, detail, dark, factionId, ghillieMat) {
  const slab = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.12, 8), dark);
  slab.position.y = 0.08;
  group.add(slab);

  const soldier = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.36, 0.14), body);
  torso.position.y = 0.4;
  torso.rotation.x = 0.15;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), mat(0xc8a882, { rough: 0.8 }));
  head.position.y = 0.68;

  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2), body);
  helmet.position.y = 0.72;
  if (factionId === 'uk') {
    helmet.scale.set(1.08, 0.8, 1.08);
  }

  const rifleLen = factionId === 'usa' ? 0.82 : 0.75;
  const rifle = new THREE.Mesh(new THREE.BoxGeometry(rifleLen, 0.05, 0.05), dark);
  rifle.position.set(0.2, 0.42, 0.1);
  rifle.rotation.y = 0.2;

  const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.24, 8), dark);
  scope.rotation.z = Math.PI / 2;
  scope.position.set(0.42, 0.46, 0.08);

  soldier.add(torso, head, helmet, rifle, scope);
  soldier.position.set(0, 0.12, 0);
  group.add(soldier);

  const ghillie = new THREE.Mesh(
    new THREE.ConeGeometry(0.55, 0.35, 6),
    ghillieMat ??
      mat(factionId === 'usa' ? 0x3a4230 : 0x3d4a32, {
        rough: 0.95,
        metal: 0.05,
      })
  );
  ghillie.rotation.x = Math.PI;
  ghillie.position.y = 0.2;
  group.add(ghillie);
  group.userData.hitRadius = 1.4;
}

const VEHICLE_BUILDERS = {
  germany: {
    tank: buildPanzerIV,
    superHeavyTank: buildTigerI,
    armoredCar: buildSdkfz222,
    artillery: buildLeFH18,
    antiTankGun: buildPak40,
  },
  usa: {
    tank: buildSherman,
    superHeavyTank: buildPershing,
    armoredCar: buildM8Greyhound,
    artillery: buildM101,
    antiTankGun: buildM1AtGun,
  },
  uk: {
    tank: buildChurchill,
    superHeavyTank: buildBlackPrince,
    armoredCar: buildDaimlerAC,
    artillery: build25Pounder,
    antiTankGun: build6Pounder,
  },
  russia: {
    tank: buildT3485,
    superHeavyTank: buildIS2,
    armoredCar: buildBA64,
    artillery: buildM30,
    antiTankGun: buildZIS3,
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