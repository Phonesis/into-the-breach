/**
 * Normalized vehicle proportions (game meters) — aligned to side-view SVG silhouettes
 * in public/vehicles/svg/. Scale: SVG 128×64 ≈ hull length in world units × ~30.
 */

export const VEHICLE_SVG = {
  germany: {
    tank: 'vehicles/svg/tank-medium-germany.svg',
    superHeavyTank: 'vehicles/svg/tank-super-germany.svg',
    armoredCar: 'vehicles/svg/armored-car-germany.svg',
    artillery: 'vehicles/svg/artillery-germany.svg',
    antiTankGun: 'vehicles/svg/at-gun-germany.svg',
  },
  usa: {
    tank: 'vehicles/svg/tank-medium-usa.svg',
    superHeavyTank: 'vehicles/svg/tank-super-usa.svg',
    armoredCar: 'vehicles/svg/armored-car-usa.svg',
    artillery: 'vehicles/svg/artillery-usa.svg',
    antiTankGun: 'vehicles/svg/at-gun-usa.svg',
  },
  uk: {
    tank: 'vehicles/svg/tank-medium-uk.svg',
    superHeavyTank: 'vehicles/svg/tank-super-uk.svg',
    armoredCar: 'vehicles/svg/armored-car-uk.svg',
    artillery: 'vehicles/svg/artillery-uk.svg',
    antiTankGun: 'vehicles/svg/at-gun-uk.svg',
  },
};

/** @typedef {'box'|'cylinder'|'forward'} TurretStyle */

export function getVehicleDesign(factionId, unitType) {
  return DESIGNS[factionId]?.[unitType] ?? DESIGNS.germany.tank;
}

const DESIGNS = {
  germany: {
    tank: {
      hull: { w: 2.38, h: 0.72, d: 3.58, y: 0.58, z: 0.04 },
      glacis: { w: 2.12, h: 0.58, d: 1.15, y: 0.74, z: 1.58, tilt: -0.44 },
      track: { spread: 1.24, height: 0.52, length: 3.35, wheels: 8, skirt: true },
      turret: { style: 'box', w: 1.58, h: 0.58, d: 1.48, y: 1.14, z: -0.12, bustle: true },
      barrel: { len: 2.82, r0: 0.09, r1: 0.11, y: 1.14, z: 1.78, mantlet: true },
      coax: { len: 0.55, y: 1.08, z: 0.35 },
      antenna: { h: 0.42, y: 1.38, z: -0.55 },
      hitRadius: 2.28,
    },
    superHeavyTank: {
      hull: { w: 2.92, h: 0.86, d: 4.55, y: 0.7, z: 0.08 },
      glacis: { w: 2.48, h: 0.65, d: 1.42, y: 0.92, z: 1.98, tilt: -0.36 },
      track: { spread: 1.28, height: 0.56, length: 4.15, wheels: 9, skirt: true },
      turret: { style: 'box', w: 1.92, h: 0.66, d: 1.72, y: 1.38, z: -0.18, bustle: false },
      barrel: { len: 3.42, r0: 0.11, r1: 0.14, y: 1.38, z: 2.18, mantlet: true, mantletSize: [0.55, 0.35, 0.42] },
      coax: { len: 0.5, y: 1.32, z: 0.42 },
      hitRadius: 2.78,
    },
    armoredCar: {
      hull: { w: 1.88, h: 0.52, d: 3.45, y: 0.54 },
      nose: { w: 1.6, h: 0.42, d: 0.85, y: 0.55, z: 1.45, tilt: -0.25 },
      rear: { w: 1.5, h: 0.55, d: 0.9, y: 0.58, z: -1.35 },
      wheels: [
        [-0.98, 0.36, 1.08],
        [0.98, 0.36, 1.08],
        [-0.98, 0.36, -1.08],
        [0.98, 0.36, -1.08],
      ],
      wheelR: 0.36,
      turret: { style: 'open', w: 0.98, h: 0.4, d: 0.88, y: 1.04, z: 0.08 },
      barrel: { len: 1.15, r0: 0.05, r1: 0.06, y: 1.06, z: 0.68, offsetX: 0.25 },
      secondaryGun: { len: 0.55, y: 1.08, z: 0.35 },
      hitRadius: 2.12,
    },
    artillery: {
      trailLen: 2.45,
      wheelR: 0.43,
      carriage: { wheelSpread: 0.74, axleZ: -0.1, trailSpread: 0.56 },
      shield: { w: 1.12, h: 0.78, d: 0.12, style: 'tall', y: 0.94, z: 0.38 },
      tube: { len: 2.65, elev: 0, r0: 0.085, r1: 0.105, breechLen: 0.36 },
      cradle: { w: 0.45, h: 0.3, d: 0.7, y: 0.88, z: 0.42 },
      hitRadius: 2.22,
    },
    antiTankGun: {
      trailLen: 2.15,
      wheelR: 0.4,
      carriage: { wheelSpread: 0.72, axleZ: -0.05, trailSpread: 0.52 },
      shield: { w: 1.05, h: 1.58, d: 0.1, style: 'at', y: 0.88, z: 0.25 },
      tube: { len: 3.12, r0: 0.1, r1: 0.115, elev: 0, breechLen: 0.32 },
      hitRadius: 2.12,
    },
  },
  usa: {
    tank: {
      hull: { w: 2.32, h: 0.68, d: 3.28, y: 0.56, z: 0 },
      glacis: { w: 2.08, h: 0.52, d: 1.38, y: 0.7, z: 1.38, tilt: -0.5 },
      track: { spread: 1.2, height: 0.5, length: 3.32, wheels: 3, skirt: false, rollers: true },
      turret: { style: 'cylinder', w: 1.05, h: 0.58, d: 1.05, y: 1.1, z: 0, bustle: false, cheek: [1.2, 0.45, 0.9] },
      barrel: { len: 2.55, r0: 0.1, r1: 0.12, y: 1.1, z: 1.62, muzzleBrake: true },
      coax: { len: 0.48, y: 1.06, z: 0.28 },
      hitRadius: 2.22,
    },
    superHeavyTank: {
      hull: { w: 2.78, h: 0.75, d: 4.15, y: 0.64, z: 0.05 },
      glacis: { w: 2.38, h: 0.58, d: 1.48, y: 0.8, z: 1.78, tilt: -0.44 },
      track: { spread: 1.26, height: 0.54, length: 4.08, wheels: 8, skirt: false },
      turret: { style: 'cylinder', w: 1.12, h: 0.7, d: 1.12, y: 1.3, z: 0 },
      barrel: { len: 3.12, r0: 0.11, r1: 0.13, y: 1.3, z: 1.98 },
      coax: { len: 0.48, y: 1.26, z: 0.32 },
      hitRadius: 2.72,
    },
    armoredCar: {
      hull: { w: 2.08, h: 0.5, d: 3.52, y: 0.52 },
      nose: { w: 1.7, h: 0.38, d: 1.0, y: 0.58, z: 1.25, tilt: -0.38 },
      wheels: [
        [-1.02, 0.34, -1.15],
        [1.02, 0.34, -1.15],
        [-1.02, 0.34, 0],
        [1.02, 0.34, 0],
        [-1.02, 0.34, 1.15],
        [1.02, 0.34, 1.15],
      ],
      wheelR: 0.34,
      turret: { style: 'cylinder', w: 0.66, h: 0.34, d: 0.66, y: 0.94, z: -0.12 },
      barrel: { len: 0.95, r0: 0.06, r1: 0.07, y: 1.04, z: 0.48, offsetX: 0.3 },
      secondaryGun: { len: 0.75, y: 1.02, z: 0.45, style: 'box' },
      hitRadius: 2.32,
    },
    artillery: {
      trailLen: 2.25,
      wheelR: 0.44,
      carriage: { wheelSpread: 0.76, axleZ: -0.08, trailSpread: 0.54 },
      shield: { w: 1.05, h: 0.35, d: 1.05, style: 'box', y: 0.58, z: 0.22 },
      tube: { len: 2.82, elev: 0, r0: 0.09, r1: 0.11, breechLen: 0.34, muzzleBrake: true },
      cradle: { w: 0.52, h: 0.22, d: 0.85, y: 0.62, z: 0.48 },
      hitRadius: 2.32,
    },
    antiTankGun: {
      trailLen: 2.1,
      wheelR: 0.38,
      carriage: { wheelSpread: 0.7, axleZ: -0.04, trailSpread: 0.5 },
      shield: { w: 0.95, h: 1.38, d: 0.1, style: 'at', y: 0.86, z: 0.24 },
      tube: { len: 2.88, r0: 0.09, r1: 0.1, elev: 0, breechLen: 0.3 },
      hitRadius: 2.1,
    },
  },
  uk: {
    tank: {
      hull: { w: 2.55, h: 0.88, d: 4.28, y: 0.64, z: 0.22 },
      glacis: { w: 2.22, h: 0.58, d: 0.95, y: 0.58, z: 2.38, tilt: -0.12 },
      track: { spread: 1.34, height: 0.78, length: 4.38, wheels: 10, skirt: false },
      turret: { style: 'forward', w: 1.38, h: 0.52, d: 1.28, y: 1.2, z: 1.08, bustle: false },
      barrel: { len: 2.38, r0: 0.1, r1: 0.12, y: 1.2, z: 2.38 },
      coax: { len: 0.5, y: 1.16, z: 1.65 },
      hitRadius: 2.48,
    },
    superHeavyTank: {
      hull: { w: 2.88, h: 0.98, d: 4.72, y: 0.74, z: 0.28 },
      track: { spread: 1.46, height: 0.84, length: 4.78, wheels: 10, skirt: false },
      turret: { style: 'forward', w: 1.58, h: 0.6, d: 1.48, y: 1.4, z: 0.88 },
      barrel: { len: 2.88, r0: 0.11, r1: 0.13, y: 1.4, z: 2.58 },
      coax: { len: 0.48, y: 1.36, z: 1.45 },
      hitRadius: 2.82,
    },
    armoredCar: {
      hull: { w: 1.98, h: 0.54, d: 3.28, y: 0.56 },
      nose: { w: 1.5, h: 0.45, d: 0.75, y: 0.58, z: 1.2, tilt: -0.2 },
      wheels: [
        [-1.0, 0.36, 0.95],
        [1.0, 0.36, 0.95],
        [-1.0, 0.36, -0.95],
        [1.0, 0.36, -0.95],
      ],
      wheelR: 0.37,
      turret: { style: 'box', w: 1.08, h: 0.44, d: 0.98, y: 1.0, z: -0.04 },
      barrel: { len: 0.55, r0: 0.05, r1: 0.05, y: 1.06, z: 0.52, offsetX: 0.2 },
      secondaryGun: { len: 0.5, y: 1.05, z: 0.5, style: 'box' },
      hitRadius: 2.18,
    },
    artillery: {
      trailLen: 2.38,
      wheelR: 0.46,
      carriage: { wheelSpread: 0.75, axleZ: -0.09, trailSpread: 0.55 },
      shield: { w: 1.18, h: 0.82, d: 0.14, style: 'tall', y: 0.92, z: 0.36 },
      tube: { len: 2.52, elev: 0, r0: 0.088, r1: 0.108, breechLen: 0.35 },
      cradle: { w: 0.48, h: 0.28, d: 0.72, y: 0.86, z: 0.4 },
      hitRadius: 2.26,
    },
    antiTankGun: {
      trailLen: 2.12,
      wheelR: 0.4,
      carriage: { wheelSpread: 0.71, axleZ: -0.05, trailSpread: 0.51 },
      shield: { w: 1.0, h: 1.48, d: 0.11, style: 'at', y: 0.87, z: 0.25 },
      tube: { len: 2.98, r0: 0.092, r1: 0.105, elev: 0, breechLen: 0.31 },
      hitRadius: 2.1,
    },
  },
};