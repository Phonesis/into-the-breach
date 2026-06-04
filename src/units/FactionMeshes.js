import * as THREE from 'three';

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

function panzerTracks(group, dark, side, zLen = 3.2) {
  const track = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, zLen), dark);
  track.position.set(side * 1.22, 0.36, 0);
  track.userData.tankPart = 'track';
  group.add(track);
  for (let i = 0; i < 8; i++) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.2, 8), dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(side * 1.22, 0.34, -zLen * 0.42 + i * (zLen * 0.11));
    wheel.userData.tankPart = 'track';
    group.add(wheel);
  }
}

function shermanTracks(group, dark, side) {
  const track = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.48, 3.3), dark);
  track.position.set(side * 1.18, 0.34, 0);
  track.userData.tankPart = 'track';
  group.add(track);
  for (let i = 0; i < 3; i++) {
    const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.24, 10), dark);
    roller.rotation.z = Math.PI / 2;
    roller.position.set(side * 1.18, 0.34, -0.9 + i * 0.9);
    roller.userData.tankPart = 'track';
    group.add(roller);
  }
}

/** Germany — Panzer IV Ausf. H */
export function buildPanzerIV(group, body, detail, dark) {
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.7, 3.55), body);
  hull.position.set(0, 0.58, 0.05);
  hull.userData.tankPart = 'hull';
  group.add(hull);

  const glacis = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.55, 1.1), body);
  glacis.position.set(0, 0.72, 1.55);
  glacis.rotation.x = -0.42;
  glacis.userData.tankPart = 'hull';
  group.add(glacis);

  panzerTracks(group, dark, -1);
  panzerTracks(group, dark, 1);

  for (const side of [-1, 1]) {
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 2.8), dark);
    skirt.position.set(side * 1.35, 0.42, 0);
    group.add(skirt);
  }

  const turret = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.55, 1.45), body);
  turret.position.set(0, 1.12, -0.15);
  turret.userData.tankPart = 'turret';
  group.add(turret);

  const bustle = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.55), body);
  bustle.position.set(0, 1.1, -0.95);
  bustle.userData.tankPart = 'turret';
  group.add(bustle);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 2.75, 10), detail);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 1.12, 1.75);
  barrel.userData.tankPart = 'barrel';
  group.add(barrel);

  const mantlet = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 0.35), detail);
  mantlet.position.set(0, 1.1, 0.45);
  mantlet.userData.tankPart = 'mantlet';
  group.add(mantlet);

  group.userData.hitRadius = 2.25;
  group.userData.isTank = true;
}

/** USA — M4 Sherman */
export function buildSherman(group, body, detail, dark) {
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.65, 3.2), body);
  hull.position.y = 0.55;
  hull.userData.tankPart = 'hull';
  group.add(hull);

  const glacis = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.5, 1.35), body);
  glacis.position.set(0, 0.68, 1.35);
  glacis.rotation.x = -0.48;
  glacis.userData.tankPart = 'hull';
  group.add(glacis);

  shermanTracks(group, dark, -1);
  shermanTracks(group, dark, 1);

  const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.55, 6), body);
  turret.position.y = 1.08;
  turret.userData.tankPart = 'turret';
  group.add(turret);

  const turretCheek = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.45, 0.9), body);
  turretCheek.position.set(0, 1.05, 0);
  turretCheek.userData.tankPart = 'turret';
  group.add(turretCheek);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 2.5, 10), detail);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 1.08, 1.6);
  barrel.userData.tankPart = 'barrel';
  group.add(barrel);

  const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.35, 8), dark);
  muzzle.rotation.x = Math.PI / 2;
  muzzle.position.set(0, 1.08, 2.85);
  group.add(muzzle);

  group.userData.hitRadius = 2.2;
  group.userData.isTank = true;
}

/** UK — Churchill Mk IV (long hull, forward turret) */
export function buildChurchill(group, body, detail, dark) {
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.85, 4.2), body);
  hull.position.set(0, 0.62, 0.2);
  hull.userData.tankPart = 'hull';
  group.add(hull);

  const nose = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.55, 0.9), body);
  nose.position.set(0, 0.55, 2.35);
  nose.userData.tankPart = 'hull';
  group.add(nose);

  for (const side of [-1, 1]) {
    const track = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.75, 4.35), dark);
    track.position.set(side * 1.32, 0.42, 0.15);
    track.userData.tankPart = 'track';
    group.add(track);
    for (let i = 0; i < 10; i++) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.18, 8), dark);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(side * 1.32, 0.38, -1.7 + i * 0.38);
      wheel.userData.tankPart = 'track';
      group.add(wheel);
    }
  }

  const turret = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.5, 1.25), body);
  turret.position.set(0, 1.18, 1.05);
  turret.userData.tankPart = 'turret';
  group.add(turret);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 2.35, 10), detail);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 1.18, 2.35);
  barrel.userData.tankPart = 'barrel';
  group.add(barrel);

  group.userData.hitRadius = 2.45;
  group.userData.isTank = true;
}

/** Germany — Tiger I (super heavy) */
export function buildTigerI(group, body, detail, dark) {
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.85, 0.82, 4.5), body);
  hull.position.set(0, 0.68, 0.1);
  hull.userData.tankPart = 'hull';
  group.add(hull);

  const glacis = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.62, 1.35), body);
  glacis.position.set(0, 0.88, 1.95);
  glacis.rotation.x = -0.38;
  glacis.userData.tankPart = 'hull';
  group.add(glacis);

  panzerTracks(group, dark, -1, 4.1);
  panzerTracks(group, dark, 1, 4.1);

  const turret = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.62, 1.65), body);
  turret.position.set(0, 1.35, -0.2);
  turret.userData.tankPart = 'turret';
  group.add(turret);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 3.35, 10), detail);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 1.35, 2.15);
  barrel.userData.tankPart = 'barrel';
  group.add(barrel);

  const mantlet = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.35, 0.42), detail);
  mantlet.position.set(0, 1.32, 0.55);
  mantlet.userData.tankPart = 'mantlet';
  group.add(mantlet);

  group.userData.hitRadius = 2.75;
  group.userData.isTank = true;
}

/** USA — M26 Pershing (super heavy) */
export function buildPershing(group, body, detail, dark) {
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.75, 0.72, 4.1), body);
  hull.position.set(0, 0.62, 0.05);
  hull.userData.tankPart = 'hull';
  group.add(hull);

  const glacis = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.55, 1.45), body);
  glacis.position.set(0, 0.78, 1.75);
  glacis.rotation.x = -0.44;
  glacis.userData.tankPart = 'hull';
  group.add(glacis);

  panzerTracks(group, dark, -1, 4.05);
  panzerTracks(group, dark, 1, 4.05);

  const turret = new THREE.Mesh(new THREE.CylinderGeometry(1.08, 1.18, 0.68, 8), body);
  turret.position.y = 1.28;
  turret.userData.tankPart = 'turret';
  group.add(turret);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 3.1, 10), detail);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 1.28, 1.95);
  barrel.userData.tankPart = 'barrel';
  group.add(barrel);

  group.userData.hitRadius = 2.7;
  group.userData.isTank = true;
}

/** UK — Black Prince (super heavy) */
export function buildBlackPrince(group, body, detail, dark) {
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.85, 0.95, 4.65), body);
  hull.position.set(0, 0.72, 0.25);
  hull.userData.tankPart = 'hull';
  group.add(hull);

  for (const side of [-1, 1]) {
    const track = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.82, 4.75), dark);
    track.position.set(side * 1.45, 0.48, 0.2);
    track.userData.tankPart = 'track';
    group.add(track);
  }

  const turret = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.58, 1.45), body);
  turret.position.set(0, 1.38, 0.85);
  turret.userData.tankPart = 'turret';
  group.add(turret);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 2.85, 10), detail);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 1.38, 2.55);
  barrel.userData.tankPart = 'barrel';
  group.add(barrel);

  group.userData.hitRadius = 2.8;
  group.userData.isTank = true;
}

/** Germany — Sdkfz 222 */
export function buildSdkfz222(group, body, detail, dark) {
  const hull = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.5, 3.4), body);
  hull.position.y = 0.52;
  group.add(hull);

  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.42, 0.85), body);
  nose.position.set(0, 0.55, 1.45);
  nose.rotation.x = -0.25;
  group.add(nose);

  const rear = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.55, 0.9), dark);
  rear.position.set(0, 0.58, -1.35);
  group.add(rear);

  for (const [side, z] of [
    [-1, 1.05],
    [1, 1.05],
    [-1, -1.05],
    [1, -1.05],
  ]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 12), dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(side * 0.98, 0.36, z);
    group.add(wheel);
  }

  const turretBase = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.22, 8), body);
  turretBase.position.y = 0.88;
  group.add(turretBase);

  const turret = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.38, 0.85), body);
  turret.position.set(0, 1.02, 0.1);
  group.add(turret);

  const kwk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.1, 8), detail);
  kwk.rotation.x = Math.PI / 2;
  kwk.position.set(0.25, 1.05, 0.65);
  group.add(kwk);

  const mg = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.08, 0.08), dark);
  mg.position.set(0.15, 1.08, 0.35);
  group.add(mg);

  group.userData.hitRadius = 2.1;
}

/** USA — M8 Greyhound (6×6) */
export function buildM8Greyhound(group, body, detail, dark) {
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.48, 3.5), body);
  hull.position.y = 0.5;
  group.add(hull);

  const glacis = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.38, 1.0), body);
  glacis.position.set(0, 0.58, 1.25);
  glacis.rotation.x = -0.38;
  group.add(glacis);

  for (const z of [-1.15, 0, 1.15]) {
    for (const side of [-1, 1]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 12), dark);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(side * 1.02, 0.34, z);
      group.add(wheel);
    }
  }

  const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.68, 0.32, 10), body);
  turret.position.set(0, 0.92, -0.15);
  group.add(turret);

  const fifty = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.1, 0.1), detail);
  fifty.position.set(0.3, 1.02, 0.45);
  group.add(fifty);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.9, 8), dark);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0.3, 1.02, 0.95);
  group.add(barrel);

  group.userData.hitRadius = 2.3;
}

/** UK — Daimler Armoured Car */
export function buildDaimlerAC(group, body, detail, dark) {
  const hull = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.52, 3.25), body);
  hull.position.y = 0.54;
  group.add(hull);

  const front = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.45, 0.75), body);
  front.position.set(0, 0.58, 1.2);
  front.rotation.x = -0.2;
  group.add(front);

  for (const [side, z] of [
    [-1, 0.95],
    [1, 0.95],
    [-1, -0.95],
    [1, -0.95],
  ]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.27, 12), dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(side * 1.0, 0.36, z);
    group.add(wheel);
  }

  const turret = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.42, 0.95), body);
  turret.position.set(0, 0.98, -0.05);
  group.add(turret);

  const bren = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.09, 0.09), detail);
  bren.position.set(0.2, 1.05, 0.5);
  group.add(bren);

  group.userData.hitRadius = 2.15;
}

/** Towed howitzer — leFH 18 (DE) */
export function buildLeFH18(group, body, detail, dark) {
  const axle = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.25, 0.5), dark);
  axle.position.y = 0.42;
  group.add(axle);

  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.2, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const x of [-0.75, 0.75]) {
    const w = new THREE.Mesh(wheelGeo, dark);
    w.position.set(x, 0.42, 0);
    group.add(w);
  }

  for (const side of [-1, 1]) {
    const trail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 2.4), dark);
    trail.position.set(side * 0.55, 0.2, -1.1);
    trail.rotation.x = -0.35;
    group.add(trail);
  }

  const shield = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.75, 0.12), body);
  shield.position.set(0, 0.95, 0.35);
  group.add(shield);

  const cradle = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.3, 0.7), detail);
  cradle.position.set(0, 1.0, 0.5);
  group.add(cradle);

  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.6, 10), detail);
  tube.rotation.x = -0.45;
  tube.position.set(0, 1.35, 1.35);
  group.add(tube);

  group.userData.hitRadius = 2.2;
}

/** USA — M101 howitzer */
export function buildM101(group, body, detail, dark) {
  const split = new THREE.Group();
  for (const side of [-1, 1]) {
    const trail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 2.2), dark);
    trail.position.set(side * 0.5, 0.22, -1.0);
    trail.rotation.x = -0.4;
    split.add(trail);
  }
  group.add(split);

  const wheelGeo = new THREE.CylinderGeometry(0.44, 0.44, 0.22, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const x of [-0.7, 0.7]) {
    const w = new THREE.Mesh(wheelGeo, dark);
    w.position.set(x, 0.44, -0.15);
    group.add(w);
  }

  const carriage = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.35, 1.0), body);
  carriage.position.set(0, 0.55, 0.2);
  group.add(carriage);

  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 2.8, 10), detail);
  tube.rotation.x = -0.42;
  tube.position.set(0, 1.2, 1.2);
  group.add(tube);

  const muzzleBrake = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.1, 0.25, 8), dark);
  muzzleBrake.rotation.x = -0.42;
  muzzleBrake.position.set(0, 1.55, 2.35);
  group.add(muzzleBrake);

  group.userData.hitRadius = 2.3;
}

/** UK — QF 25-pounder */
export function build25Pounder(group, body, detail, dark) {
  for (const side of [-1, 1]) {
    const trail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.09, 2.35), dark);
    trail.position.set(side * 0.52, 0.2, -1.05);
    trail.rotation.x = -0.38;
    group.add(trail);
  }

  const wheelGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.22, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const x of [-0.8, 0.8]) {
    const w = new THREE.Mesh(wheelGeo, dark);
    w.position.set(x, 0.45, 0);
    group.add(w);
  }

  const shield = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.8, 0.14), body);
  shield.position.set(0, 0.92, 0.4);
  group.add(shield);

  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.1, 2.5, 10), detail);
  tube.rotation.x = -0.4;
  tube.position.set(0, 1.28, 1.25);
  group.add(tube);

  group.userData.hitRadius = 2.25;
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
  },
  usa: {
    tank: buildSherman,
    superHeavyTank: buildPershing,
    armoredCar: buildM8Greyhound,
    artillery: buildM101,
  },
  uk: {
    tank: buildChurchill,
    superHeavyTank: buildBlackPrince,
    armoredCar: buildDaimlerAC,
    artillery: build25Pounder,
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