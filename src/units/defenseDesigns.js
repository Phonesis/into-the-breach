/**
 * Tower Defence emplacement proportions — aligned to side-view SVG silhouettes
 * in public/defenses/svg/. Scale: SVG 128×64 ≈ emplacement width × ~22.
 */

export const DEFENSE_SVG = {
  bunker: {
    germany: 'defenses/svg/bunker-germany.svg',
    usa: 'defenses/svg/bunker-usa.svg',
    uk: 'defenses/svg/bunker-uk.svg',
    russia: 'defenses/svg/bunker-russia.svg',
  },
  bunkerHeavy: {
    germany: 'defenses/svg/bunker-heavy-germany.svg',
    usa: 'defenses/svg/bunker-heavy-germany.svg',
    uk: 'defenses/svg/bunker-heavy-germany.svg',
    russia: 'defenses/svg/bunker-heavy-germany.svg',
  },
  mgNest: 'defenses/svg/mg-nest.svg',
  mgNestMk2: 'defenses/svg/mg-nest-mk2.svg',
  mortarNest: 'defenses/svg/mortar-nest.svg',
  mortarNestMk2: 'defenses/svg/mortar-nest-mk2.svg',
  atGun: 'defenses/svg/at-gun-emplacement.svg',
  atGun88: 'defenses/svg/at-gun-88-emplacement.svg',
  barbedWire: 'defenses/svg/wire.svg',
  razorWire: 'defenses/svg/razor-wire.svg',
  mine: 'defenses/svg/mine.svg',
  tankTrap: 'defenses/svg/tank-trap.svg',
  tankTrapHeavy: 'defenses/svg/tank-trap-heavy.svg',
  artillery: 'defenses/svg/artillery-pit.svg',
  artilleryHeavy: 'defenses/svg/artillery-pit-heavy.svg',
};

const BUNKER = {
  germany: {
    light: {
      style: 'hex',
      radius: 2.55,
      height: 1.45,
      wall: 0.55,
      embrasure: { w: 0.85, h: 0.42, z: 2.15 },
      sandbagRing: { count: 12, radius: 3.15, y: 0.32 },
      hitRadius: 3.2,
    },
    heavy: {
      style: 'hex',
      radius: 3.15,
      height: 1.95,
      wall: 0.72,
      embrasure: { w: 1.15, h: 0.55, z: 2.65 },
      gun: { len: 3.6, r0: 0.18, r1: 0.21, y: 1.55, z: 2.85 },
      sandbagRing: { count: 14, radius: 3.75, y: 0.38 },
      hitRadius: 3.8,
    },
  },
  usa: {
    light: {
      style: 'earth',
      width: 5.6,
      depth: 4.4,
      height: 1.25,
      logs: 5,
      embrasure: { w: 1.0, h: 0.38, z: 2.35 },
      sandbagRing: { count: 14, radius: 3.25, y: 0.28 },
      hitRadius: 3.2,
    },
    heavy: {
      style: 'earth',
      width: 6.8,
      depth: 5.2,
      height: 1.65,
      logs: 6,
      embrasure: { w: 1.25, h: 0.48, z: 2.75 },
      gun: { len: 3.4, r0: 0.17, r1: 0.2, y: 1.45, z: 2.95 },
      sandbagRing: { count: 16, radius: 3.85, y: 0.34 },
      hitRadius: 3.8,
    },
  },
  uk: {
    light: {
      style: 'wedge',
      width: 4.9,
      depth: 4.1,
      height: 1.55,
      embrasure: { w: 0.9, h: 0.4, z: 2.1 },
      sandbagRing: { count: 11, radius: 3.05, y: 0.3 },
      hitRadius: 3.2,
    },
    heavy: {
      style: 'wedge',
      width: 5.9,
      depth: 4.9,
      height: 1.95,
      embrasure: { w: 1.1, h: 0.5, z: 2.55 },
      gun: { len: 3.5, r0: 0.18, r1: 0.21, y: 1.5, z: 2.8 },
      sandbagRing: { count: 13, radius: 3.65, y: 0.36 },
      hitRadius: 3.8,
    },
  },
  russia: {
    light: {
      style: 'log',
      width: 5.9,
      depth: 4.5,
      height: 1.2,
      logLayers: 3,
      embrasure: { w: 0.95, h: 0.38, z: 2.25 },
      sandbagRing: { count: 13, radius: 3.2, y: 0.28 },
      hitRadius: 3.2,
    },
    heavy: {
      style: 'log',
      width: 6.9,
      depth: 5.3,
      height: 1.55,
      logLayers: 4,
      embrasure: { w: 1.15, h: 0.48, z: 2.7 },
      gun: { len: 3.55, r0: 0.18, r1: 0.21, y: 1.42, z: 2.9 },
      sandbagRing: { count: 15, radius: 3.8, y: 0.34 },
      hitRadius: 3.8,
    },
  },
};

const MG_NEST = {
  mgNest: {
    parapet: { segments: 9, radius: 2.35, height: 0.55, frontBoost: 0.22 },
    gun: { barrelLen: 1.05, barrelR: 0.04, tripodSpread: 0.42, y: 1.02 },
    hitRadius: 2.8,
  },
  mgNestMk2: {
    parapet: { segments: 11, radius: 2.75, height: 0.72, frontBoost: 0.32 },
    gun: { barrelLen: 1.55, barrelR: 0.055, tripodSpread: 0.48, y: 1.22 },
    hitRadius: 2.8,
  },
};

const EMPLACEMENT = {
  atGun: {
    revetment: { radius: 3.6, depth: 0.42, sandbags: 12 },
    gunScale: 1,
    hitRadius: 3,
  },
  atGun88: {
    revetment: { radius: 4.2, depth: 0.48, sandbags: 14 },
    gunScale: 1.28,
    hitRadius: 3.5,
  },
};

const WIRE = {
  barbedWire: { posts: 5, span: 5.8, postH: 1.15, strands: 3, hitRadius: 3.5 },
  razorWire: { posts: 6, span: 6.8, postH: 1.35, coils: 5, hitRadius: 4 },
};

const MINE = {
  discR: 0.92,
  discH: 0.1,
  domeR: 0.38,
  markerH: 0.38,
  hitRadius: 1.8,
};

const TANK_TRAP = {
  tankTrap: {
    span: 4.4,
    spikes: 7,
    spikeH: 0.92,
    spikeW: 0.22,
    hitRadius: 3.2,
  },
  tankTrapHeavy: {
    span: 5.6,
    spikes: 9,
    spikeH: 1.15,
    spikeW: 0.28,
    teeth: 5,
    hitRadius: 3.8,
  },
};

const MORTAR_NEST = {
  mortarNest: {
    parapet: { segments: 10, radius: 2.5, height: 0.58, frontBoost: 0.28 },
    base: { r: 0.62, h: 0.12 },
    tube: { len: 1.35, r0: 0.055, r1: 0.07, elev: -1.12, y: 0.76, z: 0.2 },
    bipodSpread: 0.38,
    ammoBoxes: 2,
    hitRadius: 2.6,
  },
  mortarNestMk2: {
    parapet: { segments: 12, radius: 2.9, height: 0.72, frontBoost: 0.35 },
    base: { r: 0.72, h: 0.14 },
    tube: { len: 1.65, r0: 0.065, r1: 0.082, elev: -1.18, y: 0.88, z: 0.24 },
    bipodSpread: 0.44,
    ammoBoxes: 3,
    hitRadius: 2.8,
  },
};

const ARTY_PIT = {
  artillery: {
    pit: { radius: 2.95, depth: 0.55, sandbags: 12 },
    gunElev: -0.42,
    gunScale: 0.92,
    hitRadius: 3.2,
  },
  artilleryHeavy: {
    pit: { radius: 3.45, depth: 0.62, sandbags: 14 },
    gunElev: -0.48,
    gunScale: 1.12,
    hitRadius: 3.2,
  },
};

export function getDefenseDesign(factionId, typeId) {
  const fid = factionId ?? 'germany';
  switch (typeId) {
    case 'bunker':
      return BUNKER[fid]?.light ?? BUNKER.germany.light;
    case 'bunkerHeavy':
      return BUNKER[fid]?.heavy ?? BUNKER.germany.heavy;
    case 'mgNest':
      return MG_NEST.mgNest;
    case 'mgNestMk2':
      return MG_NEST.mgNestMk2;
    case 'mortarNest':
      return MORTAR_NEST.mortarNest;
    case 'mortarNestMk2':
      return MORTAR_NEST.mortarNestMk2;
    case 'atGun':
      return EMPLACEMENT.atGun;
    case 'atGun88':
      return EMPLACEMENT.atGun88;
    case 'barbedWire':
      return WIRE.barbedWire;
    case 'razorWire':
      return WIRE.razorWire;
    case 'mine':
      return MINE;
    case 'tankTrap':
      return TANK_TRAP.tankTrap;
    case 'tankTrapHeavy':
      return TANK_TRAP.tankTrapHeavy;
    case 'artillery':
      return ARTY_PIT.artillery;
    case 'artilleryHeavy':
      return ARTY_PIT.artilleryHeavy;
    default:
      return null;
  }
}