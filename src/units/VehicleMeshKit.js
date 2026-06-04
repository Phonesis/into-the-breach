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

export function trackRun(group, dark, side, spec) {
  const x = side * spec.spread;
  addBox(
    group,
    new THREE.BoxGeometry(0.44, spec.height, spec.length),
    dark,
    { x, y: spec.height * 0.72, z: 0, part: 'track' }
  );
  const count = spec.wheels ?? 8;
  for (let i = 0; i < count; i++) {
    const wheel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.17, 0.17, 0.22, 10),
      dark
    );
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(
      x,
      spec.height * 0.68,
      -spec.length * 0.42 + i * (spec.length / Math.max(count - 1, 1)) * 0.82
    );
    wheel.userData.tankPart = 'track';
    group.add(wheel);
  }
  if (spec.skirt) {
    addBox(
      group,
      new THREE.BoxGeometry(0.07, spec.height * 0.88, spec.length * 0.88),
      dark,
      { x: side * (spec.spread + 0.14), y: spec.height * 0.62, z: 0 }
    );
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

  const t = d.turret;
  if (t.style === 'cylinder') {
    const tur = new THREE.Mesh(
      new THREE.CylinderGeometry(t.w * 0.95, t.w, t.h, 8),
      body
    );
    tur.position.set(0, t.y, t.z);
    tur.userData.tankPart = 'turret';
    group.add(tur);
  } else {
    addBox(
      group,
      new THREE.BoxGeometry(t.w, t.h, t.d),
      body,
      { y: t.y, z: t.z, part: 'turret' }
    );
  }
  if (t.bustle) {
    addBox(
      group,
      new THREE.BoxGeometry(t.w * 0.32, t.h * 0.72, t.d * 0.38),
      body,
      { y: t.y - 0.02, z: t.z - t.d * 0.42, part: 'turret' }
    );
  }
  if (t.style === 'forward') {
    addBox(
      group,
      new THREE.BoxGeometry(t.w * 0.85, t.h * 0.35, t.d * 0.55),
      body,
      { y: t.y + 0.22, z: t.z + t.d * 0.15, part: 'turret' }
    );
  }
  if (t.cheek) {
    const [cw, ch, cd] = t.cheek;
    addBox(group, new THREE.BoxGeometry(cw, ch, cd), body, {
      y: t.y - 0.03,
      z: t.z,
      part: 'turret',
    });
  }

  const b = d.barrel;
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(b.r0, b.r1, b.len, 10),
    detail
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(b.offsetX ?? 0, b.y, b.z);
  barrel.userData.tankPart = 'barrel';
  group.add(barrel);

  if (b.mantlet) {
    const [mw, mh, md] = b.mantletSize ?? [0.44, 0.3, 0.36];
    addBox(group, new THREE.BoxGeometry(mw, mh, md), detail, {
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
    group.add(mb);
  }

  const cupola = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.15, 0.12, 8), detail);
  cupola.position.set(0, t.y + t.h * 0.55, t.z - t.d * 0.15);
  group.add(cupola);

  if (d.coax) {
    const c = d.coax;
    const coax = new THREE.Mesh(
      new THREE.BoxGeometry(c.len, 0.07, 0.07),
      dark
    );
    coax.position.set(0.12, c.y, c.z);
    coax.userData.tankPart = 'barrel';
    group.add(coax);
  }
  if (d.antenna) {
    const a = d.antenna;
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.025, a.h, 6),
      detail
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
    detail
  );
  gun.rotation.x = Math.PI / 2;
  gun.position.set(b.offsetX ?? 0.22, b.y, b.z);
  gun.userData.tankPart = 'barrel';
  group.add(gun);
  if (d.secondaryGun) {
    const s = d.secondaryGun;
    if (s.style === 'box') {
      addBox(group, new THREE.BoxGeometry(s.len, 0.1, 0.1), detail, {
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

export function buildArtilleryFromDesign(group, body, detail, dark, d) {
  for (const side of [-1, 1]) {
    const trail = new THREE.Mesh(
      new THREE.BoxGeometry(0.13, 0.1, d.trailLen),
      dark
    );
    trail.position.set(side * 0.54, 0.22, -d.trailLen * 0.48);
    trail.rotation.x = -0.38;
    group.add(trail);
  }
  const wheelGeo = new THREE.CylinderGeometry(d.wheelR, d.wheelR, 0.22, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const x of [-0.72, 0.72]) {
    const w = new THREE.Mesh(wheelGeo, dark);
    w.position.set(x, d.wheelR + 0.02, -0.08);
    group.add(w);
  }
  const sh = d.shield;
  if (sh.h < 0.5) {
    addBox(group, new THREE.BoxGeometry(sh.w, sh.h, sh.d), body, { y: 0.58, z: 0.22 });
  } else {
    addBox(group, new THREE.BoxGeometry(sh.w, sh.h, sh.d), body, { y: 0.94, z: 0.38 });
  }
  if (d.cradle) {
    const c = d.cradle;
    addBox(group, new THREE.BoxGeometry(c.w, c.h, c.d), detail, {
      y: c.y,
      z: c.z,
    });
  }
  const tube = new THREE.Mesh(
    new THREE.CylinderGeometry(0.085, 0.105, d.tube.len, 10),
    detail
  );
  tube.rotation.x = d.tube.elev;
  tube.position.set(0, 1.32, 1.28);
  group.add(tube);
  if (d.tube.muzzleBrake) {
    const mb = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.1, 0.26, 8), dark);
    mb.rotation.x = d.tube.elev;
    mb.position.set(0, 1.58, 2.32);
    group.add(mb);
  }
  group.userData.hitRadius = d.hitRadius;
}

export function buildAtGunFromDesign(group, body, detail, dark, d) {
  for (const side of [-1, 1]) {
    const trail = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.08, d.trailLen),
      dark
    );
    trail.position.set(side * 0.52, 0.2, -d.trailLen * 0.46);
    trail.rotation.x = -0.38;
    group.add(trail);
  }
  const wheelGeo = new THREE.CylinderGeometry(d.wheelR, d.wheelR, 0.2, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const x of [-0.72, 0.72]) {
    const w = new THREE.Mesh(wheelGeo, dark);
    w.position.set(x, d.wheelR + 0.02, -0.05);
    group.add(w);
  }
  const sh = d.shield;
  addBox(group, new THREE.BoxGeometry(sh.w, sh.h, sh.d), body, { y: 0.88, z: 0.25 });
  addBox(group, new THREE.BoxGeometry(0.52, 0.28, 0.58), dark, { y: 0.82, z: 0.48 });
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(d.tube.r0 ?? 0.1, (d.tube.r0 ?? 0.1) * 1.15, d.tube.len, 10),
    detail
  );
  barrel.rotation.x = d.tube.elev;
  barrel.position.set(0, 1.05, 1.38);
  barrel.userData.tankPart = 'barrel';
  group.add(barrel);
  group.userData.hitRadius = d.hitRadius;
}