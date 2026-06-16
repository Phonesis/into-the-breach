import * as THREE from 'three';

/** Shared mesh parts for faction vehicles — driven by vehicleDesigns.js proportions. */

export function addBox(group, geo, mat, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, part = null }) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  if (part) m.userData.tankPart = part;
  group.add(m);
  return m;
}

function addCylinder(group, geo, mat, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, part = null }) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  if (part) m.userData.tankPart = part;
  group.add(m);
  return m;
}

export function trackRun(group, dark, side, spec) {
  const x = side * spec.spread;
  const roadWheelCount = spec.wheels ?? 8;
  const trackW = spec.width ?? 0.44;
  const trackY = spec.height * 0.7;

  addBox(
    group,
    new THREE.BoxGeometry(trackW, spec.height, spec.length),
    dark,
    { x, y: trackY, z: 0, part: 'track' }
  );
  addBox(group, new THREE.BoxGeometry(trackW * 0.78, spec.height * 0.18, spec.length * 0.95), dark, {
    x,
    y: spec.height * 1.12,
    z: 0,
    part: 'track',
  });

  const wheelR = spec.wheelR ?? Math.min(0.24, spec.height * 0.38);
  const wheelGeo = new THREE.CylinderGeometry(wheelR, wheelR, trackW * 0.54, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(wheelR * 0.34, wheelR * 0.34, trackW * 0.6, 10);
  hubGeo.rotateZ(Math.PI / 2);
  for (let i = 0; i < roadWheelCount; i++) {
    const z = -spec.length * 0.39 + i * (spec.length / Math.max(roadWheelCount - 1, 1)) * 0.78;
    const wheel = new THREE.Mesh(wheelGeo, dark);
    wheel.position.set(x, spec.height * 0.66, z);
    wheel.userData.tankPart = 'track';
    group.add(wheel);

    const hub = new THREE.Mesh(hubGeo, dark);
    hub.position.set(x + side * trackW * 0.03, spec.height * 0.66, z);
    hub.userData.tankPart = 'track';
    group.add(hub);
  }

  for (const z of [-spec.length * 0.43, spec.length * 0.43]) {
    const endWheel = new THREE.Mesh(
      new THREE.CylinderGeometry(wheelR * 1.1, wheelR * 1.1, trackW * 0.58, 16),
      dark
    );
    endWheel.rotation.z = Math.PI / 2;
    endWheel.position.set(x, spec.height * 0.7, z);
    endWheel.userData.tankPart = 'track';
    group.add(endWheel);
  }

  const linkCount = spec.links ?? 12;
  for (let i = 0; i < linkCount; i++) {
    const z = -spec.length * 0.46 + i * (spec.length * 0.92) / Math.max(linkCount - 1, 1);
    addBox(group, new THREE.BoxGeometry(trackW * 0.9, 0.035, 0.09), dark, {
      x: x + side * 0.01,
      y: spec.height * 1.02,
      z,
      part: 'track',
    });
  }
  if (spec.skirt) {
    addBox(
      group,
      new THREE.BoxGeometry(0.07, spec.height * 0.88, spec.length * 0.88),
      dark,
      { x: side * (spec.spread + 0.14), y: spec.height * 0.62, z: 0 }
    );
  }
  if (spec.fender) {
    addBox(group, new THREE.BoxGeometry(0.24, 0.08, spec.length * 1.02), dark, {
      x: side * (spec.spread + 0.02),
      y: spec.height * 1.12,
      z: spec.fenderZ ?? 0,
    });
  }
  if (spec.rollers) {
    for (let i = 0; i < 3; i++) {
      const roller = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.2, 0.26, 10),
        dark
      );
      roller.rotation.z = Math.PI / 2;
      roller.position.set(x, spec.height * 0.68, -0.85 + i * 0.85);
      roller.userData.tankPart = 'track';
      group.add(roller);
    }
  }
}

function addTankExternalDetails(group, turretPivot, body, detail, dark, d) {
  const h = d.hull;
  const t = d.turret;

  addCylinder(turretPivot, new THREE.CylinderGeometry(t.w * 0.46, t.w * 0.5, 0.12, 16), dark, {
    y: t.y - t.h * 0.55,
    z: t.z,
    part: 'turret',
  });

  const cupola = d.cupola ?? {};
  addCylinder(turretPivot, new THREE.CylinderGeometry(cupola.r ?? 0.14, cupola.rTop ?? 0.12, cupola.h ?? 0.14, 10), body, {
    x: cupola.x ?? 0,
    y: cupola.y ?? t.y + t.h * 0.58,
    z: cupola.z ?? t.z - t.d * 0.2,
    part: 'turret',
  });

  const hatchGeo = new THREE.BoxGeometry(0.36, 0.04, 0.28);
  for (const hatch of d.hatches ?? []) {
    addBox(hatch.turret ? turretPivot : group, hatchGeo, dark, {
      x: hatch.x ?? 0,
      y: hatch.y,
      z: hatch.z,
      ry: hatch.ry ?? 0,
      part: hatch.turret ? 'turret' : 'hull',
    });
  }

  if (d.bowMg) {
    const mg = d.bowMg;
    addCylinder(group, new THREE.CylinderGeometry(0.035, 0.04, mg.len ?? 0.48, 8), dark, {
      x: mg.x ?? -0.36,
      y: mg.y ?? h.y + h.h * 0.14,
      z: mg.z ?? h.z + h.d * 0.48,
      rx: Math.PI / 2,
      part: 'barrel',
    });
  }

  for (const side of [-1, 1]) {
    if (d.fenders !== false) {
      addBox(group, new THREE.BoxGeometry(0.22, 0.07, h.d * 0.95), dark, {
        x: side * (d.track.spread - 0.08),
        y: d.track.height * 1.22,
        z: h.z,
      });
    }

    for (const bin of d.stowageBins ?? []) {
      addBox(group, new THREE.BoxGeometry(bin.w, bin.h, bin.d), detail, {
        x: side * (h.w * 0.5 + bin.x),
        y: bin.y,
        z: bin.z,
      });
    }
  }

  if (d.engineDeck !== false) {
    addBox(group, new THREE.BoxGeometry(h.w * 0.72, 0.045, h.d * 0.24), dark, {
      y: h.y + h.h * 0.54,
      z: h.z - h.d * 0.28,
    });
    for (let i = -1; i <= 1; i++) {
      addBox(group, new THREE.BoxGeometry(h.w * 0.18, 0.05, 0.06), detail, {
        x: i * h.w * 0.22,
        y: h.y + h.h * 0.58,
        z: h.z - h.d * 0.34,
      });
    }
  }

  for (const ex of d.exhausts ?? []) {
    addCylinder(group, new THREE.CylinderGeometry(ex.r ?? 0.07, ex.r ?? 0.07, ex.h ?? 0.42, 8), dark, {
      x: ex.x,
      y: ex.y,
      z: ex.z,
      rx: ex.rx ?? 0,
    });
  }

  for (const plate of d.spareTrack ?? []) {
    addBox(group, new THREE.BoxGeometry(plate.w, plate.h, plate.d), dark, {
      x: plate.x ?? 0,
      y: plate.y,
      z: plate.z,
      rx: plate.rx ?? 0,
    });
  }
}

export function buildTankFromDesign(group, body, detail, dark, d) {
  const h = d.hull;
  addBox(
    group,
    new THREE.BoxGeometry(h.w, h.h, h.d),
    body,
    { y: h.y, z: h.z, part: 'hull' }
  );
  if (d.glacis) {
    const g = d.glacis;
    addBox(
      group,
      new THREE.BoxGeometry(g.w, g.h, g.d),
      body,
      { y: g.y, z: g.z, rx: g.tilt ?? 0, part: 'hull' }
    );
  }
  trackRun(group, dark, -1, d.track);
  trackRun(group, dark, 1, d.track);

  const turretPivot = new THREE.Group();
  turretPivot.name = 'turretPivot';
  group.add(turretPivot);
  group.userData.turretPivot = turretPivot;

  const t = d.turret;
  if (t.style === 'cylinder') {
    const tur = new THREE.Mesh(
      new THREE.CylinderGeometry(
        t.w * (t.radiusTopScale ?? 0.56),
        t.w * (t.radiusBottomScale ?? 0.66),
        t.h,
        16
      ),
      body
    );
    tur.scale.z = t.d / Math.max(t.w, 0.01);
    tur.position.set(0, t.y, t.z);
    tur.userData.tankPart = 'turret';
    turretPivot.add(tur);
  } else {
    addBox(
      turretPivot,
      new THREE.BoxGeometry(t.w, t.h, t.d),
      body,
      { y: t.y, z: t.z, part: 'turret' }
    );
  }
  if (t.bustle) {
    addBox(
      turretPivot,
      new THREE.BoxGeometry(t.w * 0.32, t.h * 0.72, t.d * 0.38),
      body,
      { y: t.y - 0.02, z: t.z - t.d * 0.42, part: 'turret' }
    );
  }
  if (t.style === 'forward') {
    addBox(
      turretPivot,
      new THREE.BoxGeometry(t.w * 0.85, t.h * 0.35, t.d * 0.55),
      body,
      { y: t.y + 0.22, z: t.z + t.d * 0.15, part: 'turret' }
    );
  }
  if (t.cheek) {
    const [cw, ch, cd] = t.cheek;
    addBox(turretPivot, new THREE.BoxGeometry(cw, ch, cd), body, {
      y: t.y - 0.03,
      z: t.z,
      part: 'turret',
    });
  }

  const b = d.barrel;
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(b.r0, b.r1, b.len, 10),
    body
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(b.offsetX ?? 0, b.y, b.z);
  barrel.userData.tankPart = 'barrel';
  turretPivot.add(barrel);

  if (b.mantlet) {
    const [mw, mh, md] = b.mantletSize ?? [0.44, 0.3, 0.36];
    addBox(turretPivot, new THREE.BoxGeometry(mw, mh, md), body, {
      y: b.y - 0.02,
      z: b.z - b.len * 0.32,
      part: 'mantlet',
    });
  }
  if (b.muzzleBrake) {
    const mb = new THREE.Mesh(
      new THREE.CylinderGeometry(b.r1 * 1.35, b.r1, 0.32, 8),
      dark
    );
    mb.rotation.x = Math.PI / 2;
    mb.position.set(0, b.y, b.z + b.len * 0.48);
    turretPivot.add(mb);
  }

  addTankExternalDetails(group, turretPivot, body, detail, dark, d);

  if (d.coax) {
    const c = d.coax;
    const coax = new THREE.Mesh(
      new THREE.BoxGeometry(c.len, 0.07, 0.07),
      dark
    );
    coax.position.set(0.12, c.y, c.z);
    coax.userData.tankPart = 'barrel';
    turretPivot.add(coax);
  }
  if (d.antenna) {
    const a = d.antenna;
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.025, a.h, 6),
      dark
    );
    mast.position.set(0, a.y + a.h * 0.5, a.z);
    group.add(mast);
  }

  group.userData.hitRadius = d.hitRadius;
  group.userData.isTank = true;
}

export function buildArmoredCarFromDesign(group, body, detail, dark, d) {
  const h = d.hull;
  addBox(group, new THREE.BoxGeometry(h.w, h.h, h.d), body, { y: h.y });
  if (d.nose) {
    const n = d.nose;
    addBox(group, new THREE.BoxGeometry(n.w, n.h, n.d), body, {
      y: n.y,
      z: n.z,
      rx: n.tilt ?? 0,
    });
  }
  if (d.rear) {
    const r = d.rear;
    addBox(group, new THREE.BoxGeometry(r.w, r.h, r.d), dark, {
      y: r.y,
      z: r.z,
    });
  }
  if (!d.nose) {
    addBox(
      group,
      new THREE.BoxGeometry(h.w * 0.88, h.h * 0.82, h.d * 0.28),
      body,
      { y: h.y + 0.06, z: h.d * 0.38, rx: -0.22 }
    );
  }
  for (const [wx, wy, wz] of d.wheels) {
    const wheel = new THREE.Mesh(
      new THREE.CylinderGeometry(d.wheelR, d.wheelR, 0.28, 12),
      dark
    );
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, wy, wz);
    group.add(wheel);
  }
  const t = d.turret;
  if (t.style === 'cylinder') {
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(t.w, t.w * 1.05, t.h * 0.65, 10),
      body
    );
    base.position.set(0, t.y - 0.06, t.z);
    group.add(base);
    const tur = new THREE.Mesh(
      new THREE.CylinderGeometry(t.w * 0.92, t.w, t.h, 10),
      body
    );
    tur.position.set(0, t.y, t.z);
    group.add(tur);
  } else if (t.style === 'open') {
    addBox(
      group,
      new THREE.BoxGeometry(t.w * 1.05, t.h * 0.35, t.d * 1.05),
      body,
      { y: t.y - 0.14, z: t.z }
    );
    addBox(group, new THREE.BoxGeometry(t.w, t.h, t.d), body, { y: t.y, z: t.z });
  } else {
    addBox(group, new THREE.BoxGeometry(t.w, t.h, t.d), body, { y: t.y, z: t.z });
  }
  const b = d.barrel;
  const gun = new THREE.Mesh(
    new THREE.CylinderGeometry(b.r0, b.r1, b.len, 8),
    body
  );
  gun.rotation.x = Math.PI / 2;
  gun.position.set(b.offsetX ?? 0.22, b.y, b.z);
  gun.userData.tankPart = 'barrel';
  group.add(gun);
  if (d.secondaryGun) {
    const s = d.secondaryGun;
    if (s.style === 'box') {
      addBox(group, new THREE.BoxGeometry(s.len, 0.1, 0.1), dark, {
        x: 0.15,
        y: s.y,
        z: s.z,
      });
    } else {
      addBox(group, new THREE.BoxGeometry(s.len, 0.08, 0.08), dark, {
        x: 0.15,
        y: s.y,
        z: s.z,
      });
    }
  }
  group.userData.hitRadius = d.hitRadius;
}

function buildTowedGunCarriage(group, detail, dark, d) {
  const carriage = d.carriage ?? {};
  const wheelSpread = carriage.wheelSpread ?? 0.72;
  const axleZ = carriage.axleZ ?? -0.08;
  const trailSpread = carriage.trailSpread ?? 0.54;
  const axleY = d.wheelR + 0.02;

  addBox(group, new THREE.BoxGeometry(wheelSpread * 2 + 0.2, 0.12, 0.18), dark, {
    y: axleY,
    z: axleZ,
  });

  addBox(group, new THREE.BoxGeometry(0.44, 0.1, 0.78), dark, {
    y: axleY + d.wheelR * 0.52,
    z: 0.14,
  });

  const wheelGeo = new THREE.CylinderGeometry(d.wheelR, d.wheelR, 0.24, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const x of [-wheelSpread, wheelSpread]) {
    const wheel = new THREE.Mesh(wheelGeo, dark);
    wheel.position.set(x, axleY, axleZ);
    wheel.userData.tankPart = 'track';
    group.add(wheel);

    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(d.wheelR * 0.34, d.wheelR * 0.34, 0.27, 8),
      dark
    );
    hub.rotation.z = Math.PI / 2;
    hub.position.set(x, axleY, axleZ);
    group.add(hub);

    const fender = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, d.wheelR * 0.55, d.wheelR * 0.9),
      dark
    );
    fender.position.set(x, axleY + d.wheelR * 0.42, axleZ + 0.02);
    group.add(fender);
  }

  for (const side of [-1, 1]) {
    const trail = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 0.09, d.trailLen),
      dark
    );
    trail.position.set(side * trailSpread, 0.22, -d.trailLen * 0.48);
    trail.rotation.x = -0.38;
    group.add(trail);

    const spade = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.34, 0.06),
      dark
    );
    spade.position.set(side * trailSpread, 0.07, -d.trailLen * 0.93);
    spade.rotation.x = -0.58;
    group.add(spade);

    const trailBrace = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.06, d.trailLen * 0.42),
      dark
    );
    trailBrace.position.set(side * (trailSpread * 0.55), 0.34, -d.trailLen * 0.22);
    trailBrace.rotation.x = -0.22;
    group.add(trailBrace);
  }
}

function addGunShield(group, body, detail, dark, sh) {
  const shieldY = sh.y ?? 0.9;
  const shieldZ = sh.z ?? 0.3;

  if (sh.style === 'box') {
    addBox(group, new THREE.BoxGeometry(sh.w, sh.h, sh.d), body, {
      y: shieldY,
      z: shieldZ,
      part: 'hull',
    });
    addBox(group, new THREE.BoxGeometry(sh.w * 0.92, 0.07, sh.d * 1.15), body, {
      y: shieldY + sh.h * 0.42,
      z: shieldZ,
      part: 'hull',
    });
    addBox(group, new THREE.BoxGeometry(sh.w * 0.35, sh.h * 0.55, sh.d * 0.85), dark, {
      y: shieldY - sh.h * 0.08,
      z: shieldZ + sh.d * 0.18,
    });
    return;
  }

  if (sh.style === 'at') {
    addBox(group, new THREE.BoxGeometry(sh.w, sh.h, sh.d), body, {
      y: shieldY,
      z: shieldZ,
      part: 'hull',
    });
    for (const side of [-1, 1]) {
      addBox(group, new THREE.BoxGeometry(sh.w * 0.22, sh.h * 0.82, sh.d * 0.92), body, {
        x: side * sh.w * 0.42,
        y: shieldY - sh.h * 0.04,
        z: shieldZ,
        part: 'hull',
      });
    }
    addBox(group, new THREE.BoxGeometry(sh.w * 0.48, sh.h * 0.22, sh.d * 1.05), dark, {
      y: shieldY - sh.h * 0.38,
      z: shieldZ + sh.d * 0.12,
    });
    return;
  }

  addBox(group, new THREE.BoxGeometry(sh.w, sh.h, sh.d), body, {
    y: shieldY,
    z: shieldZ,
    part: 'hull',
  });
  for (const side of [-1, 1]) {
    addBox(group, new THREE.BoxGeometry(0.09, sh.h * 0.72, sh.d * 0.95), body, {
      x: side * (sh.w * 0.5 + 0.02),
      y: shieldY - sh.h * 0.05,
      z: shieldZ,
      part: 'hull',
    });
  }
  addBox(group, new THREE.BoxGeometry(sh.w * 0.55, 0.08, sh.d * 1.1), dark, {
    y: shieldY - sh.h * 0.42,
    z: shieldZ + sh.d * 0.1,
  });
}

/** Horizontal gun tube (breech + barrel) rigidly mounted on the carriage, extending along +Z. */
function addGunTube(group, body, dark, tube, mount, part = null) {
  const r0 = tube.r0 ?? 0.09;
  const r1 = tube.r1 ?? r0 * 1.15;
  const len = tube.len;
  const breechLen = tube.breechLen ?? 0.34;
  const pitch = tube.elev ?? 0;

  const gun = new THREE.Group();
  gun.position.set(mount.x, mount.y, mount.z);
  if (pitch) gun.rotation.x = pitch;

  const trunnion = new THREE.Mesh(
    new THREE.BoxGeometry(r0 * 4.8, r0 * 3.2, breechLen * 0.95),
    dark
  );
  trunnion.position.set(0, -r0 * 0.4, 0);
  gun.add(trunnion);

  const breech = new THREE.Mesh(
    new THREE.CylinderGeometry(r0 * 1.42, r0 * 1.22, breechLen, 10),
    body
  );
  breech.rotation.x = Math.PI / 2;
  breech.position.set(0, 0, 0);
  gun.add(breech);

  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(r1, r0, len, 10),
    body
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0, breechLen / 2 + len / 2);
  if (part) barrel.userData.tankPart = part;
  gun.add(barrel);

  if (tube.muzzleBrake) {
    const mb = new THREE.Mesh(
      new THREE.CylinderGeometry(r1 * 1.32, r1, 0.26, 8),
      dark
    );
    mb.rotation.x = Math.PI / 2;
    mb.position.set(0, 0, breechLen / 2 + len + 0.08);
    gun.add(mb);
  }

  group.add(gun);
  return gun;
}

export function buildArtilleryFromDesign(group, body, detail, dark, d) {
  buildTowedGunCarriage(group, detail, dark, d);

  const sh = d.shield;
  addGunShield(group, body, detail, dark, sh);

  const mountY = d.cradle?.y ?? sh.y;
  const mountZ = d.cradle?.z ?? sh.z + sh.d * 0.35;

  if (d.cradle) {
    const c = d.cradle;
    addBox(group, new THREE.BoxGeometry(c.w, c.h, c.d), dark, {
      y: c.y,
      z: c.z,
    });
    addBox(group, new THREE.BoxGeometry(c.w * 0.82, c.h * 0.55, c.d * 0.72), dark, {
      y: c.y - c.h * 0.18,
      z: c.z - c.d * 0.06,
    });
    const recoil = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, c.d * 0.78, 8),
      dark
    );
    recoil.rotation.x = Math.PI / 2;
    recoil.position.set(0, c.y - c.h * 0.22, c.z + c.d * 0.08);
    group.add(recoil);

    const saddle = new THREE.Mesh(
      new THREE.BoxGeometry(c.w * 1.05, 0.09, c.d * 0.62),
      dark
    );
    saddle.position.set(0, c.y - c.h * 0.48, c.z - c.d * 0.08);
    group.add(saddle);
  } else {
    addBox(group, new THREE.BoxGeometry(sh.w * 0.72, sh.h * 0.42, sh.d * 2.4), dark, {
      y: sh.y - sh.h * 0.12,
      z: sh.z + sh.d * 0.35,
    });
  }

  addGunTube(group, body, dark, d.tube, { x: 0, y: mountY, z: mountZ });

  if (sh.style !== 'box') {
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.05), dark);
    sight.position.set(sh.w * 0.38, sh.y + sh.h * 0.15, sh.z);
    group.add(sight);
  }

  group.userData.hitRadius = d.hitRadius;
}

export function buildAtGunFromDesign(group, body, detail, dark, d) {
  buildTowedGunCarriage(group, detail, dark, d);

  const sh = d.shield;
  addGunShield(group, body, detail, dark, sh);

  const mountY = sh.y + sh.h * 0.02;
  const mountZ = sh.z + sh.d * 0.42;

  addBox(group, new THREE.BoxGeometry(0.56, 0.32, 0.68), dark, {
    y: mountY - 0.14,
    z: mountZ - 0.18,
  });
  addBox(group, new THREE.BoxGeometry(0.42, 0.16, 0.52), dark, {
    y: mountY - 0.06,
    z: mountZ - 0.08,
  });
  addBox(group, new THREE.BoxGeometry(sh.w * 0.38, sh.h * 0.12, sh.d * 1.8), dark, {
    y: mountY - 0.2,
    z: mountZ - 0.22,
  });

  addGunTube(group, body, dark, d.tube, { x: 0, y: mountY, z: mountZ }, 'barrel');

  const trailLock = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.09, 0.24),
    dark
  );
  trailLock.position.set(0, mountY - 0.12, mountZ - 0.35);
  group.add(trailLock);

  group.userData.hitRadius = d.hitRadius;
}
