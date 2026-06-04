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
  return new THREE.MeshStandardMaterial({
    color,
    metalness: opts.metal ?? 0.28,
    roughness: opts.rough ?? 0.58,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
    envMapIntensity: opts.env ?? 0.72,
  });
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

export function buildFactionMG(group, body, detail, dark, factionId) {
  if (factionId === 'germany') {
    const tripod = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.45, 6), dark);
    tripod.position.y = 0.32;
    group.add(tripod);
    for (let i = 0; i < 3; i++) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.55, 0.05), dark);
      const a = (i / 3) * Math.PI * 2;
      leg.position.set(Math.cos(a) * 0.5, 0.22, Math.sin(a) * 0.5);
      leg.rotation.z = 0.45;
      group.add(leg);
    }
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.14, 0.12), detail);
    receiver.position.set(0.15, 0.58, 0);
    group.add(receiver);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.09, 0.09), dark);
    barrel.position.set(0.55, 0.6, 0);
    group.add(barrel);
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.18, 10), detail);
    drum.rotation.x = Math.PI / 2;
    drum.position.set(0, 0.52, 0);
    group.add(drum);
  } else if (factionId === 'usa') {
    const tripod = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.5), dark);
    tripod.position.y = 0.28;
    group.add(tripod);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.11, 0.11), detail);
    gun.position.set(0.25, 0.52, 0);
    group.add(gun);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.14), dark);
    box.position.set(-0.15, 0.5, 0);
    group.add(box);
  } else {
    const tripod = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.5, 6), dark);
    tripod.position.y = 0.34;
    group.add(tripod);
    for (let i = 0; i < 3; i++) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.52, 0.06), dark);
      const a = (i / 3) * Math.PI * 2;
      leg.position.set(Math.cos(a) * 0.42, 0.24, Math.sin(a) * 0.42);
      group.add(leg);
    }
    const jacket = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.55, 10), detail);
    jacket.position.set(0.1, 0.55, 0);
    jacket.rotation.z = Math.PI / 2;
    group.add(jacket);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.08, 0.08), dark);
    barrel.position.set(0.5, 0.58, 0);
    group.add(barrel);
    const water = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.22, 0.2), body);
    water.position.set(-0.35, 0.48, 0);
    group.add(water);
  }
  for (let i = 0; i < 2; i++) {
    const crew = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.3, 4, 6), body);
    crew.position.set(-0.55 + i * 0.5, 0.38, 0.55);
    group.add(crew);
  }
  group.userData.hitRadius = 1.85;
}

export function buildFactionMortar(group, body, detail, dark, factionId) {
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.75, 0.14, 10), dark);
  base.position.y = 0.1;
  group.add(base);

  const tubeLen = factionId === 'usa' ? 1.2 : 1.45;
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, tubeLen, 10), detail);
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

export function buildFactionSniper(group, body, detail, dark, factionId) {
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

  const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.24, 8), detail);
  scope.rotation.z = Math.PI / 2;
  scope.position.set(0.42, 0.46, 0.08);

  soldier.add(torso, head, helmet, rifle, scope);
  soldier.position.set(0, 0.12, 0);
  group.add(soldier);

  const ghillie = new THREE.Mesh(
    new THREE.ConeGeometry(0.55, 0.35, 6),
    new THREE.MeshStandardMaterial({
      color: factionId === 'usa' ? 0x3a4230 : 0x3d4a32,
      roughness: 0.95,
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