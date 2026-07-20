import * as THREE from 'three';

/** Shared mesh parts for faction vehicles — driven by vehicleDesigns.js proportions. */

const _cannonMuzzleTip = new THREE.Vector3();
const CANNON_MUZZLE_UNIT_TYPES = new Set([
  'tank',
  'tankDestroyer',
  'superHeavyTank',
  'antiTankGun',
  'artillery',
  'armoredCar',
]);

/** Main-gun / AT / artillery fire VFX should use the barrel tip, not the hull center. */
export function usesVehicleCannonMuzzleOrigin(unit, coax = false) {
  if (coax) return false;
  return CANNON_MUZZLE_UNIT_TYPES.has(unit?.def?.type);
}

/** A pintle/roof MG has its own articulated muzzle rather than the cannon origin. */
export function usesIndependentVehicleMgMuzzleOrigin(unit, coax = false) {
  return !!(coax && unit?.mesh?.userData?.independentMgMuzzle?.isMesh);
}

export function getIndependentVehicleMgMuzzleWorldPosition(
  unit,
  out = new THREE.Vector3()
) {
  const muzzle = unit?.mesh?.userData?.independentMgMuzzle;
  if (!muzzle?.isMesh) {
    out.copy(unit?.position ?? { x: 0, y: 0, z: 0 });
    out.y += 1.35;
    return out;
  }
  unit.mesh.updateWorldMatrix(true, true);
  return meshGunTipWorldPos(muzzle, out);
}

/**
 * World-space tip of the main cannon (or muzzle brake if present).
 * Cylinders are oriented with local +Y along the bore after mesh rotation.
 */
export function getVehicleCannonMuzzleWorldPosition(unit, out = new THREE.Vector3()) {
  const root = unit?.mesh;
  if (!root) {
    out.copy(unit?.position ?? { x: 0, y: 0, z: 0 });
    out.y += 1.25;
    return out;
  }

  root.updateWorldMatrix(true, true);

  let muzzleBrake = null;
  /** @type {{ mesh: THREE.Mesh, len: number, cylindrical: boolean }[]} */
  const barrels = [];

  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const part = obj.userData.tankPart;
    if (part === 'muzzle') {
      muzzleBrake = obj;
      return;
    }
    if (part !== 'barrel') return;
    const p = obj.geometry?.parameters;
    if (p && p.height != null && p.radiusTop != null) {
      barrels.push({ mesh: obj, len: p.height, cylindrical: true });
    } else if (p && p.width != null) {
      // Coax / secondary box barrels — only used if no cylinder main gun found
      barrels.push({
        mesh: obj,
        len: Math.max(p.width, p.height ?? 0, p.depth ?? 0),
        cylindrical: false,
      });
    }
  });

  if (muzzleBrake) {
    return meshGunTipWorldPos(muzzleBrake, out);
  }

  barrels.sort((a, b) => {
    if (a.cylindrical !== b.cylindrical) return a.cylindrical ? -1 : 1;
    return b.len - a.len;
  });

  if (barrels[0]) {
    return meshGunTipWorldPos(barrels[0].mesh, out);
  }

  // Fallback: hull origin + forward along facing (turret/hull yaw)
  out.copy(unit.position);
  const yaw = root.rotation?.y ?? 0;
  const pivot = root.userData?.turretPivot;
  const gunYaw = yaw + (pivot?.rotation?.y ?? 0);
  const reach = unit.def?.type === 'superHeavyTank' ? 3.2 : unit.def?.type === 'artillery' ? 2.8 : 2.4;
  out.x += Math.sin(gunYaw) * reach;
  out.z += Math.cos(gunYaw) * reach;
  out.y += unit.def?.type === 'antiTankGun' || unit.def?.type === 'artillery' ? 1.05 : 1.35;
  return out;
}

function meshGunTipWorldPos(mesh, out) {
  mesh.updateWorldMatrix(true, false);
  const params = mesh.geometry?.parameters;
  if (params && params.height != null && params.radiusTop != null) {
    // CylinderGeometry: bore along local +Y (tanks/AT rotate this to world bore axis)
    _cannonMuzzleTip.set(0, params.height / 2, 0);
  } else if (params && params.width != null) {
    // Box coax: length along local +X
    _cannonMuzzleTip.set(params.width / 2, 0, 0);
  } else {
    mesh.getWorldPosition(out);
    return out;
  }
  mesh.localToWorld(_cannonMuzzleTip);
  out.copy(_cannonMuzzleTip);
  return out;
}

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

/** Create a separately traversing pintle MG while retaining the authored rest pose. */
function addIndependentTopMachineGun(root, parent, dark, config) {
  const pivot = new THREE.Group();
  pivot.name = 'independentMgPivot';
  pivot.position.set(config.x, config.y, config.z);
  pivot.userData.mgBaseYaw = 0;
  pivot.userData.mgTraverseRateDeg = config.traverseRateDeg ?? 105;
  pivot.userData.mgTraverseArcDeg = config.traverseArcDeg ?? 360;
  pivot.userData.mgMountKind = 'pintle';
  parent.add(pivot);

  addBox(
    pivot,
    new THREE.BoxGeometry(
      config.mountW ?? 0.18,
      config.mountH ?? 0.14,
      config.mountD ?? 0.24
    ),
    dark,
    { part: 'turret' }
  );

  const barrel = addCylinder(
    pivot,
    new THREE.CylinderGeometry(config.r0 ?? 0.025, config.r1 ?? 0.035, config.len, 8),
    dark,
    {
      y: config.barrelY ?? 0.03,
      z: config.barrelZ ?? config.len * 0.36,
      rx: Math.PI / 2,
      part: 'barrel',
    }
  );
  barrel.name = 'independentMgBarrel';
  barrel.userData.isIndependentMg = true;

  root.userData.independentMgPivot = pivot;
  root.userData.independentMgMuzzle = barrel;
  return pivot;
}

function markingMaterial(color) {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: 0.02,
    roughness: 0.82,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    side: THREE.DoubleSide,
  });
}

function starGeometry(outer = 0.2, inner = 0.082) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const angle = Math.PI / 2 + i * Math.PI / 5;
    const radius = i % 2 === 0 ? outer : inner;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

function addNationalMarkings(parent, d, { width, y, z, part }) {
  const model = d.model ?? '';
  const german = new Set(['panzer4', 'jagdpanther', 'tiger1', 'sdkfz222']);
  const american = new Set(['sherman', 'm10', 'pershing', 'm8']);
  const british = new Set(['churchill4', 'achilles', 'blackPrince', 'daimler']);
  const soviet = new Set(['t3485', 'su100', 'is2', 'ba64']);

  for (const side of [-1, 1]) {
    const x = side * (width * 0.5 + 0.018);
    if (german.has(model)) {
      const cream = markingMaterial(0xd8d2bd);
      const black = markingMaterial(0x171815);
      addBox(parent, new THREE.BoxGeometry(0.018, 0.4, 0.13), cream, { x, y, z, part });
      addBox(parent, new THREE.BoxGeometry(0.018, 0.14, 0.4), cream, { x, y, z, part });
      addBox(parent, new THREE.BoxGeometry(0.022, 0.31, 0.075), black, {
        x: x + side * 0.006, y, z, part,
      });
      addBox(parent, new THREE.BoxGeometry(0.022, 0.075, 0.31), black, {
        x: x + side * 0.006, y, z, part,
      });
    } else if (american.has(model) || soviet.has(model)) {
      const star = new THREE.Mesh(
        starGeometry(american.has(model) ? 0.23 : 0.21, american.has(model) ? 0.095 : 0.086),
        markingMaterial(american.has(model) ? 0xe5e1cf : 0xb32d24)
      );
      star.position.set(x, y, z);
      star.rotation.y = side * Math.PI / 2;
      star.userData.tankPart = part;
      parent.add(star);
    } else if (british.has(model)) {
      const rings = [
        { radius: 0.2, color: 0xb52b2a },
        { radius: 0.14, color: 0xe0d9c3 },
        { radius: 0.075, color: 0x273d68 },
      ];
      rings.forEach((ring, index) => {
        addCylinder(parent, new THREE.CylinderGeometry(ring.radius, ring.radius, 0.016, 24), markingMaterial(ring.color), {
          x: x + side * index * 0.009,
          y,
          z,
          rz: Math.PI / 2,
          part,
        });
      });
    }
  }
}

function addBoltRows(group, detail, d) {
  const h = d.hull;
  const positions = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      positions.push(new THREE.Vector3(
        side * (h.w * 0.5 + 0.012),
        h.y + h.h * 0.32,
        h.z + (i / 6 - 0.5) * h.d * 0.72
      ));
    }
  }
  const bolts = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.026, 6, 4),
    detail,
    positions.length
  );
  const matrix = new THREE.Matrix4();
  positions.forEach((position, index) => {
    matrix.makeTranslation(position.x, position.y, position.z);
    bolts.setMatrixAt(index, matrix);
  });
  bolts.userData.tankPart = 'hull';
  bolts.instanceMatrix.needsUpdate = true;
  group.add(bolts);
}

function addHullFittings(group, body, detail, dark, d) {
  const h = d.hull;
  addBoltRows(group, detail, d);

  // Towing eyes and guarded lamps are small, high-contrast silhouette details.
  for (const side of [-1, 1]) {
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.022, 5, 10), dark);
    hook.position.set(side * h.w * 0.31, h.y - h.h * 0.12, h.z + h.d * 0.51);
    hook.userData.tankPart = 'hull';
    group.add(hook);

    addCylinder(group, new THREE.CylinderGeometry(0.09, 0.105, 0.1, 10), dark, {
      x: side * h.w * 0.34,
      y: h.y + h.h * 0.5,
      z: h.z + h.d * 0.44,
      rx: Math.PI / 2,
      part: 'hull',
    });
    addCylinder(group, new THREE.CylinderGeometry(0.067, 0.067, 0.015, 12), markingMaterial(0xb8a76e), {
      x: side * h.w * 0.34,
      y: h.y + h.h * 0.5,
      z: h.z + h.d * 0.49,
      rx: Math.PI / 2,
      part: 'hull',
    });
  }

  // Pioneer tools and a tow cable add recognizable scale to otherwise broad plates.
  addBox(group, new THREE.BoxGeometry(0.08, 0.055, h.d * 0.42), dark, {
    x: h.w * 0.28,
    y: h.y + h.h * 0.55,
    z: h.z - h.d * 0.02,
    ry: 0.08,
    part: 'hull',
  });
  addBox(group, new THREE.BoxGeometry(0.32, 0.045, 0.085), detail, {
    x: h.w * 0.28,
    y: h.y + h.h * 0.59,
    z: h.z + h.d * 0.19,
    ry: -0.2,
    part: 'hull',
  });

  const cablePath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-h.w * 0.18, h.y + h.h * 0.57, h.z - h.d * 0.36),
    new THREE.Vector3(0, h.y + h.h * 0.61, h.z - h.d * 0.25),
    new THREE.Vector3(h.w * 0.28, h.y + h.h * 0.57, h.z - h.d * 0.34),
  ]);
  const cable = new THREE.Mesh(new THREE.TubeGeometry(cablePath, 14, 0.025, 5, false), dark);
  cable.userData.tankPart = 'hull';
  group.add(cable);
}

function addFuelDrums(group, body, detail, d) {
  const h = d.hull;
  for (const side of [-1, 1]) {
    const x = side * h.w * 0.36;
    const z = h.z - h.d * 0.51;
    addCylinder(group, new THREE.CylinderGeometry(0.17, 0.17, 0.62, 14), body, {
      x,
      y: h.y + h.h * 0.15,
      z,
      rx: Math.PI / 2,
      part: 'hull',
    });
    for (const band of [-0.18, 0.18]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.174, 0.018, 5, 12), detail);
      ring.position.set(x, h.y + h.h * 0.15, z + band);
      ring.userData.tankPart = 'hull';
      group.add(ring);
    }
  }
}

function addTankModelDetails(group, turretPivot, body, detail, dark, d) {
  const h = d.hull;
  const t = d.turret;
  const model = d.model;

  // Paired periscopes keep the turret roof from reading as a blank slab.
  for (const x of [-0.24, 0.24]) {
    addBox(turretPivot, new THREE.BoxGeometry(0.12, 0.08, 0.16), dark, {
      x,
      y: t.y + t.h * 0.57,
      z: t.z + t.d * 0.08,
      ry: x * 0.3,
      part: 'turret',
    });
  }

  if (model === 'panzer4') {
    for (const side of [-1, 1]) {
      addBox(turretPivot, new THREE.BoxGeometry(0.055, t.h * 0.92, t.d * 1.2), body, {
        x: side * (t.w * 0.5 + 0.12),
        y: t.y - 0.02,
        z: t.z - 0.04,
        rz: side * -0.04,
        part: 'turret',
      });
    }
  } else if (model === 'tiger1') {
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        addCylinder(turretPivot, new THREE.CylinderGeometry(0.028, 0.034, 0.22, 6), dark, {
          x: side * (t.w * 0.5 + 0.05),
          y: t.y + 0.04,
          z: t.z - 0.3 + i * 0.16,
          rz: side * 0.55,
          part: 'turret',
        });
      }
    }
  } else if (model === 'sherman') {
    const finalDrive = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, h.w * 0.82, 12),
      body
    );
    finalDrive.rotation.z = Math.PI / 2;
    finalDrive.position.set(0, h.y - h.h * 0.15, h.z + h.d * 0.51);
    finalDrive.userData.tankPart = 'hull';
    group.add(finalDrive);
  } else if (model === 'pershing') {
    addIndependentTopMachineGun(group, turretPivot, dark, {
      x: -0.35,
      y: t.y + t.h * 0.72,
      z: t.z - 0.05,
      len: 0.7,
      barrelY: t.h * 0.07,
      barrelZ: 0.39,
      mountW: 0.2,
      mountH: 0.14,
      mountD: 0.23,
    });
  } else if (model === 'churchill4' || model === 'blackPrince') {
    for (const side of [-1, 1]) {
      addBox(group, new THREE.BoxGeometry(0.06, 0.44, 0.62), body, {
        x: side * (d.track.spread + 0.23),
        y: d.track.height * 0.82,
        z: h.z - h.d * 0.05,
        part: 'track',
      });
      addBox(group, new THREE.BoxGeometry(0.075, 0.18, 0.28), dark, {
        x: side * (d.track.spread + 0.27),
        y: d.track.height * 0.82,
        z: h.z - h.d * 0.05,
        part: 'track',
      });
    }
  } else if (model === 't3485' || model === 'is2') {
    addFuelDrums(group, body, detail, d);
  }

  addNationalMarkings(turretPivot, d, {
    width: t.w,
    y: t.y,
    z: t.z - t.d * 0.05,
    part: 'turret',
  });
}

function addArmoredCarDetails(group, turretPivot, body, detail, dark, d) {
  const h = d.hull;
  const t = d.turret;

  for (const [wx, wy, wz] of d.wheels) {
    const side = Math.sign(wx) || 1;
    addCylinder(group, new THREE.CylinderGeometry(d.wheelR * 0.35, d.wheelR * 0.35, 0.315, 10), detail, {
      x: wx + side * 0.018,
      y: wy,
      z: wz,
      rz: Math.PI / 2,
      part: 'track',
    });
    addBox(group, new THREE.BoxGeometry(0.34, 0.055, d.wheelR * 1.45), dark, {
      x: wx,
      y: wy + d.wheelR * 0.84,
      z: wz,
      part: 'hull',
    });
  }

  // Driver/co-driver vision blocks and front lamps are defining details on the
  // compact scout-car hulls.
  for (const side of [-1, 1]) {
    addBox(group, new THREE.BoxGeometry(h.w * 0.2, 0.065, 0.035), dark, {
      x: side * h.w * 0.23,
      y: h.y + h.h * 0.34,
      z: h.d * 0.51,
      part: 'hull',
    });
    addCylinder(group, new THREE.CylinderGeometry(0.075, 0.085, 0.09, 10), dark, {
      x: side * h.w * 0.32,
      y: h.y + h.h * 0.5,
      z: h.d * 0.47,
      rx: Math.PI / 2,
      part: 'hull',
    });
    addCylinder(group, new THREE.CylinderGeometry(0.052, 0.052, 0.012, 10), markingMaterial(0xb8a76e), {
      x: side * h.w * 0.32,
      y: h.y + h.h * 0.5,
      z: h.d * 0.515,
      rx: Math.PI / 2,
      part: 'hull',
    });
  }

  const spare = new THREE.Mesh(
    new THREE.CylinderGeometry(d.wheelR * 0.72, d.wheelR * 0.72, 0.16, 12),
    dark
  );
  spare.rotation.x = Math.PI / 2;
  spare.position.set(0, h.y + 0.06, -h.d * 0.53);
  spare.userData.tankPart = 'hull';
  group.add(spare);

  addCylinder(group, new THREE.CylinderGeometry(0.012, 0.018, 0.7, 6), dark, {
    x: -h.w * 0.33,
    y: t.y + 0.42,
    z: t.z - t.d * 0.28,
    part: 'hull',
  });

  if (d.model === 'm8') {
    addBox(turretPivot, new THREE.BoxGeometry(0.18, 0.12, 0.22), dark, {
      x: -0.28, y: t.y + t.h * 0.68, z: t.z - 0.18, part: 'turret',
    });
    addCylinder(turretPivot, new THREE.CylinderGeometry(0.022, 0.03, 0.62, 7), dark, {
      x: -0.28, y: t.y + t.h * 0.72, z: t.z + 0.16, rx: Math.PI / 2, part: 'barrel',
    });
  } else if (d.model === 'daimler') {
    for (const side of [-1, 1]) {
      addCylinder(turretPivot, new THREE.CylinderGeometry(0.025, 0.032, 0.2, 6), dark, {
        x: side * (t.w * 0.48),
        y: t.y + 0.02,
        z: t.z + 0.2,
        rz: side * 0.58,
        part: 'turret',
      });
    }
  } else if (d.model === 'ba64') {
    // Extra angled shoulder plates emphasize the BA-64's compact faceted hull.
    for (const side of [-1, 1]) {
      addBox(group, new THREE.BoxGeometry(0.08, h.h * 0.84, h.d * 0.62), body, {
        x: side * h.w * 0.48,
        y: h.y + 0.12,
        z: -h.d * 0.04,
        rz: side * -0.28,
        part: 'hull',
      });
    }
  }

  const markingWidth = t.style === 'cylinder' || t.style === 'openRound' || t.style === 'openFaceted'
    ? t.w * 2
    : t.w;
  addNationalMarkings(turretPivot, d, {
    width: markingWidth,
    y: t.y,
    z: t.z,
    part: 'turret',
  });
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
  const shoeGeometry = new THREE.BoxGeometry(trackW * 0.92, 0.045, 0.105);
  const bottomShoes = new THREE.InstancedMesh(shoeGeometry, dark, linkCount);
  const shoeMatrix = new THREE.Matrix4();
  for (let i = 0; i < linkCount; i++) {
    const z = -spec.length * 0.46 + i * (spec.length * 0.92) / Math.max(linkCount - 1, 1);
    addBox(group, new THREE.BoxGeometry(trackW * 0.9, 0.035, 0.09), dark, {
      x: x + side * 0.01,
      y: spec.height * 1.02,
      z,
      part: 'track',
    });
    shoeMatrix.makeTranslation(x + side * 0.015, spec.height * 0.24, z);
    bottomShoes.setMatrixAt(i, shoeMatrix);
  }
  bottomShoes.userData.tankPart = 'track';
  bottomShoes.instanceMatrix.needsUpdate = true;
  group.add(bottomShoes);
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
    addBox(group, new THREE.BoxGeometry(h.w * 0.72, 0.045, h.d * 0.24), detail, {
      y: h.y + h.h * 0.54,
      z: h.z - h.d * 0.28,
      part: 'hull',
    });
    for (let i = -1; i <= 1; i++) {
      addBox(group, new THREE.BoxGeometry(h.w * 0.18, 0.052, 0.055), dark, {
        x: i * h.w * 0.22,
        y: h.y + h.h * 0.58,
        z: h.z - h.d * 0.34,
        part: 'hull',
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

/**
 * Front hull section with a lowered leading roof edge. The glacis is part of
 * the hull volume rather than a rotated box laid on top, so it cannot create a
 * raised platform or exposed rear seam.
 */
function createSlopedTankNoseGeometry(hull, glacis, depth) {
  const geometry = new THREE.BoxGeometry(hull.w, hull.h, depth, 1, 1, 1);
  const position = geometry.attributes.position;
  const tilt = Math.abs(glacis.tilt ?? 0.36);
  const drop = THREE.MathUtils.clamp(
    Math.sin(tilt) * depth * 0.86,
    hull.h * 0.08,
    hull.h * 0.7
  );
  const frontEdge = depth * 0.45;

  for (let i = 0; i < position.count; i++) {
    if (position.getZ(i) >= frontEdge && position.getY(i) > 0) {
      position.setY(i, position.getY(i) - drop);
    }
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function buildTankFromDesign(group, body, detail, dark, d) {
  const h = d.hull;
  if (d.glacis) {
    const g = d.glacis;
    const frontDepth = THREE.MathUtils.clamp(g.d * 0.72, h.d * 0.18, h.d * 0.4);
    const rearDepth = h.d - frontDepth;
    addBox(
      group,
      new THREE.BoxGeometry(h.w, h.h, rearDepth),
      body,
      { y: h.y, z: h.z - frontDepth * 0.5, part: 'hull' }
    );
    addBox(group, createSlopedTankNoseGeometry(h, g, frontDepth), body, {
      y: h.y,
      z: h.z + h.d * 0.5 - frontDepth * 0.5,
      part: 'hull',
    });
  } else {
    addBox(
      group,
      new THREE.BoxGeometry(h.w, h.h, h.d),
      body,
      { y: h.y, z: h.z, part: 'hull' }
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
        t.segments ?? 16
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
    mb.userData.tankPart = 'muzzle';
    turretPivot.add(mb);
  }

  addTankExternalDetails(group, turretPivot, body, detail, dark, d);
  addHullFittings(group, body, detail, dark, d);
  addTankModelDetails(group, turretPivot, body, detail, dark, d);

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

  // Turret child positions are authored in hull-local coordinates. Move the
  // pivot onto the actual turret ring, then compensate the children so the
  // untouched model retains its rest pose but rotates around its own center.
  if (Math.abs(t.z ?? 0) > 1e-6) {
    turretPivot.position.z = t.z;
    for (const child of turretPivot.children) child.position.z -= t.z;
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

/**
 * Low-profile self-propelled anti-tank vehicles. Casemate guns remain fixed to
 * the hull; M10-family open turrets rotate normally and retain their open roof.
 */
export function buildTankDestroyerFromDesign(group, body, detail, dark, d) {
  const h = d.hull;
  addBox(group, new THREE.BoxGeometry(h.w, h.h, h.d), body, {
    y: h.y,
    z: h.z ?? 0,
    part: 'hull',
  });
  if (d.glacis) {
    const g = d.glacis;
    addBox(group, new THREE.BoxGeometry(g.w, g.h, g.d), body, {
      y: g.y,
      z: g.z,
      rx: g.tilt ?? 0,
      part: 'hull',
    });
  }
  trackRun(group, dark, -1, d.track);
  trackRun(group, dark, 1, d.track);

  const s = d.superstructure;
  let gunMount = group;
  let mountZ = 0;
  if (s.style === 'openTurret') {
    gunMount = new THREE.Group();
    gunMount.name = 'turretPivot';
    gunMount.position.z = s.z ?? 0;
    group.add(gunMount);
    group.userData.turretPivot = gunMount;
    mountZ = s.z ?? 0;

    // Five-sided M10/Achilles fighting compartment: armored walls, dark open interior.
    addBox(gunMount, new THREE.BoxGeometry(s.w, 0.12, s.d), dark, {
      y: s.y - s.h * 0.45,
      z: 0,
      part: 'turret',
    });
    addBox(gunMount, new THREE.BoxGeometry(s.w, s.h, 0.12), body, {
      y: s.y,
      z: -s.d * 0.46,
      part: 'turret',
    });
    for (const side of [-1, 1]) {
      addBox(gunMount, new THREE.BoxGeometry(0.12, s.h, s.d * 0.9), body, {
        x: side * s.w * 0.46,
        y: s.y,
        z: 0,
        rz: side * -0.08,
        part: 'turret',
      });
      // The M10-family bow of the turret was low and open around the mantlet.
      // Keep these cheek plates below the crew's eyeline instead of forming
      // the oversized upright panels visible in the original model.
      addBox(gunMount, new THREE.BoxGeometry(s.w * 0.34, s.h * 0.58, 0.12), body, {
        x: side * s.w * 0.29,
        y: s.y - s.h * 0.16,
        z: s.d * 0.39,
        ry: side * 0.24,
        part: 'turret',
      });
    }
    if (s.rearCounterweight) {
      addBox(gunMount, new THREE.BoxGeometry(s.w * 0.7, s.h * 0.5, s.d * 0.32), detail, {
        y: s.y + 0.04,
        z: -s.d * 0.58,
        part: 'turret',
      });
    }
  } else {
    // Sloped casemate shoulders and roof create the recognisable Jagdpanther/SU-100 wedge.
    addBox(group, new THREE.BoxGeometry(s.w, s.h * 0.72, s.d), body, {
      y: s.y,
      z: s.z,
      rx: -0.05,
      part: 'hull',
    });
    addBox(group, new THREE.BoxGeometry(s.roofW ?? s.w * 0.76, 0.11, s.d * 0.82), detail, {
      y: s.y + s.h * 0.43,
      z: s.z - s.d * 0.06,
      part: 'hull',
    });
    for (const side of [-1, 1]) {
      addBox(group, new THREE.BoxGeometry(0.14, s.h * 0.78, s.d * 0.92), body, {
        x: side * s.w * 0.45,
        y: s.y - 0.02,
        z: s.z,
        rz: side * -0.18,
        part: 'hull',
      });
    }
  }

  const b = d.barrel;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(b.r0, b.r1, b.len, 12), body);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(b.offsetX ?? 0, b.y, b.z - mountZ);
  barrel.userData.tankPart = 'barrel';
  gunMount.add(barrel);

  if (b.mantlet === 'round') {
    addCylinder(gunMount, new THREE.SphereGeometry(0.31, 12, 8), body, {
      x: b.offsetX ?? 0,
      y: b.y,
      z: b.z - mountZ - b.len * 0.38,
      part: 'mantlet',
    });
  } else if (b.mantlet) {
    addBox(gunMount, new THREE.BoxGeometry(0.5, 0.34, 0.28), body, {
      x: b.offsetX ?? 0,
      y: b.y,
      z: b.z - mountZ - b.len * 0.39,
      part: 'mantlet',
    });
  }
  if (b.muzzleBrake) {
    const count = b.muzzleBrake === 'double' ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const brake = new THREE.Mesh(
        new THREE.CylinderGeometry(b.r1 * 1.42, b.r1 * 1.18, 0.16, 10),
        dark
      );
      brake.rotation.x = Math.PI / 2;
      brake.position.set(b.offsetX ?? 0, b.y, b.z - mountZ + b.len * 0.49 + i * 0.13);
      if (i === count - 1) brake.userData.tankPart = 'muzzle';
      gunMount.add(brake);
    }
  }

  if (d.machineGun) {
    const mg = d.machineGun;
    const mgParent = mg.topMount ? gunMount : group;
    const mgZ = mg.z - (mg.topMount ? mountZ : 0);
    if (mg.topMount) {
      addIndependentTopMachineGun(group, mgParent, dark, {
        x: mg.x,
        y: mg.y - 0.03,
        z: mgZ - mg.len * 0.35,
        len: mg.len,
        barrelY: 0.03,
        barrelZ: mg.len * 0.35,
      });
    } else {
      addCylinder(mgParent, new THREE.CylinderGeometry(0.028, 0.035, mg.len, 8), dark, {
        x: mg.x,
        y: mg.y,
        z: mgZ,
        rx: Math.PI / 2,
        part: 'barrel',
      });
    }
  }

  if (d.cupola) {
    const c = d.cupola;
    addCylinder(group, new THREE.CylinderGeometry(c.r, c.r * 0.9, c.h, 12), body, {
      x: c.x,
      y: c.y,
      z: c.z,
      part: 'hull',
    });
  }
  for (const hatch of d.hatches ?? []) {
    addBox(group, new THREE.BoxGeometry(0.38, 0.045, 0.3), dark, {
      x: hatch.x,
      y: hatch.y,
      z: hatch.z,
      ry: hatch.ry ?? 0,
      part: 'hull',
    });
  }
  addBox(group, new THREE.BoxGeometry(h.w * 0.72, 0.05, h.d * 0.22), detail, {
    y: h.y + h.h * 0.55,
    z: (h.z ?? 0) - h.d * 0.34,
    part: 'hull',
  });
  for (let i = -1; i <= 1; i++) {
    addBox(group, new THREE.BoxGeometry(h.w * 0.17, 0.052, 0.055), dark, {
      x: i * h.w * 0.22,
      y: h.y + h.h * 0.59,
      z: (h.z ?? 0) - h.d * 0.38,
      part: 'hull',
    });
  }
  for (const ex of d.exhausts ?? []) {
    addCylinder(group, new THREE.CylinderGeometry(0.07, 0.07, ex.h ?? 0.4, 8), dark, {
      x: ex.x,
      y: ex.y,
      z: ex.z,
    });
  }
  for (const plate of d.spareTrack ?? []) {
    addBox(group, new THREE.BoxGeometry(plate.w, plate.h, plate.d), dark, {
      x: plate.x ?? 0,
      y: plate.y,
      z: plate.z,
      part: 'track',
    });
  }

  addHullFittings(group, body, detail, dark, d);
  if (d.model === 'su100') addFuelDrums(group, body, detail, d);
  addNationalMarkings(gunMount, d, {
    width: s.w,
    y: s.y,
    z: (s.z ?? 0) - mountZ,
    part: s.style === 'openTurret' ? 'turret' : 'hull',
  });

  group.userData.hitRadius = d.hitRadius;
  group.userData.isTank = true;
}

export function buildArmoredCarFromDesign(group, body, detail, dark, d) {
  const h = d.hull;
  addBox(group, new THREE.BoxGeometry(h.w, h.h, h.d), body, { y: h.y, part: 'hull' });
  if (d.nose) {
    const n = d.nose;
    addBox(group, new THREE.BoxGeometry(n.w, n.h, n.d), body, {
      y: n.y,
      z: n.z,
      rx: n.tilt ?? 0,
      part: 'hull',
    });
  }
  if (d.rear) {
    const r = d.rear;
    addBox(group, new THREE.BoxGeometry(r.w, r.h, r.d), dark, {
      y: r.y,
      z: r.z,
      part: 'hull',
    });
  }
  if (!d.nose) {
    addBox(
      group,
      new THREE.BoxGeometry(h.w * 0.88, h.h * 0.82, h.d * 0.28),
      body,
      { y: h.y + 0.06, z: h.d * 0.38, rx: -0.22, part: 'hull' }
    );
  }
  for (const [wx, wy, wz] of d.wheels) {
    const wheel = new THREE.Mesh(
      new THREE.CylinderGeometry(d.wheelR, d.wheelR, 0.28, 12),
      dark
    );
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, wy, wz);
    wheel.userData.tankPart = 'track';
    group.add(wheel);
  }
  const turretPivot = new THREE.Group();
  turretPivot.name = 'turretPivot';
  group.add(turretPivot);
  group.userData.turretPivot = turretPivot;

  const t = d.turret;
  if (t.style === 'cylinder') {
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(t.w, t.w * 1.05, t.h * 0.65, 10),
      body
    );
    base.position.set(0, t.y - 0.06, t.z);
    base.userData.tankPart = 'turret';
    turretPivot.add(base);
    const tur = new THREE.Mesh(
      new THREE.CylinderGeometry(t.w * 0.92, t.w, t.h, 10),
      body
    );
    tur.position.set(0, t.y, t.z);
    tur.userData.tankPart = 'turret';
    turretPivot.add(tur);
  } else if (t.style === 'open') {
    addBox(turretPivot, new THREE.BoxGeometry(t.w, 0.08, t.d), dark, {
      y: t.y - t.h * 0.48, z: t.z, part: 'turret',
    });
    for (const side of [-1, 1]) {
      addBox(turretPivot, new THREE.BoxGeometry(0.07, t.h, t.d * 0.92), body, {
        x: side * t.w * 0.48,
        y: t.y,
        z: t.z,
        rz: side * -0.12,
        part: 'turret',
      });
      addBox(turretPivot, new THREE.BoxGeometry(t.w * 0.34, t.h * 0.72, 0.07), body, {
        x: side * t.w * 0.3,
        y: t.y - t.h * 0.08,
        z: t.z + t.d * 0.45,
        ry: side * 0.18,
        part: 'turret',
      });
    }
    addBox(turretPivot, new THREE.BoxGeometry(t.w, t.h, 0.07), body, {
      y: t.y, z: t.z - t.d * 0.46, part: 'turret',
    });
    // Sd.Kfz. 222-style anti-grenade screen frames, left open so the dark
    // fighting compartment remains visible from the game camera.
    for (const side of [-1, 1]) {
      addBox(turretPivot, new THREE.BoxGeometry(0.035, 0.035, t.d * 0.82), dark, {
        x: side * t.w * 0.28,
        y: t.y + t.h * 0.58,
        z: t.z,
        rz: side * 0.35,
        part: 'turret',
      });
    }
  } else if (t.style === 'openRound' || t.style === 'openFaceted') {
    const segments = t.style === 'openFaceted' ? 8 : 14;
    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(t.w * 0.9, t.w, t.h, segments, 1, true),
      body
    );
    wall.position.set(0, t.y, t.z);
    wall.userData.tankPart = 'turret';
    turretPivot.add(wall);
    addCylinder(turretPivot, new THREE.CylinderGeometry(t.w * 0.88, t.w * 0.88, 0.07, segments), dark, {
      y: t.y - t.h * 0.49,
      z: t.z,
      part: 'turret',
    });
  } else {
    addBox(turretPivot, new THREE.BoxGeometry(t.w, t.h, t.d), body, {
      y: t.y,
      z: t.z,
      part: 'turret',
    });
  }
  const b = d.barrel;
  const gun = new THREE.Mesh(
    new THREE.CylinderGeometry(b.r0, b.r1, b.len, 8),
    body
  );
  gun.rotation.x = Math.PI / 2;
  gun.position.set(b.offsetX ?? 0.22, b.y, b.z);
  gun.userData.tankPart = 'barrel';
  turretPivot.add(gun);
  addCylinder(turretPivot, new THREE.SphereGeometry(Math.max(b.r1 * 2.1, 0.11), 10, 7), body, {
    x: b.offsetX ?? 0.22,
    y: b.y,
    z: b.z - b.len * 0.42,
    part: 'mantlet',
  });
  if (d.secondaryGun) {
    const s = d.secondaryGun;
    addBox(turretPivot, new THREE.BoxGeometry(0.08, s.style === 'box' ? 0.1 : 0.08, s.len), dark, {
      x: -0.14,
      y: s.y,
      z: s.z,
      part: 'barrel',
    });
  }
  addArmoredCarDetails(group, turretPivot, body, detail, dark, d);

  if (Math.abs(t.z ?? 0) > 1e-6) {
    turretPivot.position.z = t.z;
    for (const child of turretPivot.children) child.position.z -= t.z;
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

  if (sh.style === 'pak40') {
    addBox(group, new THREE.BoxGeometry(sh.w * 0.58, sh.h, sh.d), body, {
      y: shieldY,
      z: shieldZ,
      part: 'hull',
    });
    for (const side of [-1, 1]) {
      addBox(group, new THREE.BoxGeometry(sh.w * 0.28, sh.h * 0.92, sh.d), body, {
        x: side * sh.w * 0.39,
        y: shieldY - sh.h * 0.03,
        z: shieldZ - 0.025,
        ry: side * -0.18,
        part: 'hull',
      });
    }
    addBox(group, new THREE.BoxGeometry(sh.w * 0.34, sh.h * 0.18, sh.d * 1.4), dark, {
      y: shieldY - sh.h * 0.38,
      z: shieldZ + 0.05,
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
    const count = tube.muzzleBrake === 'double' ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const mb = new THREE.Mesh(
        new THREE.CylinderGeometry(r1 * 1.42, r1 * 1.24, 0.15, 10),
        dark
      );
      mb.rotation.x = Math.PI / 2;
      mb.position.set(0, 0, breechLen / 2 + len + 0.04 + i * 0.13);
      if (i === count - 1) mb.userData.tankPart = 'muzzle';
      gun.add(mb);
    }
  }

  group.add(gun);
  return gun;
}

function addTowedGunIdentityDetails(group, body, detail, dark, d, mountY, mountZ) {
  const handwheel = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.018, 6, 14), dark);
  handwheel.position.set(d.shield.w * 0.35, mountY - 0.12, mountZ - 0.24);
  handwheel.userData.tankPart = 'hull';
  group.add(handwheel);
  addCylinder(group, new THREE.CylinderGeometry(0.025, 0.025, 0.22, 7), dark, {
    x: d.shield.w * 0.35,
    y: mountY - 0.12,
    z: mountZ - 0.24,
    rz: Math.PI / 2,
  });

  const addRecuperator = (x, yOffset = 0.14) =>
    addCylinder(group, new THREE.CylinderGeometry(0.045, 0.05, 0.72, 9), detail, {
      x,
      y: mountY + yOffset,
      z: mountZ + 0.22,
      rx: Math.PI / 2,
      part: 'barrel',
    });

  switch (d.model) {
    case 'lefh18':
      addRecuperator(-0.1, 0.16);
      addRecuperator(0.1, 0.16);
      break;
    case 'm101':
      addRecuperator(0, 0.16);
      addBox(group, new THREE.BoxGeometry(0.42, 0.18, 0.3), detail, {
        x: -0.52,
        y: 0.3,
        z: -0.46,
        part: 'hull',
      });
      break;
    case 'qf25pdr': {
      addRecuperator(0, 0.15);
      const platform = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.055, 20), dark);
      platform.position.set(0, 0.045, -0.08);
      platform.userData.tankPart = 'hull';
      group.add(platform);
      break;
    }
    case 'm30_122':
      addRecuperator(-0.09, 0.17);
      addRecuperator(0.09, 0.17);
      break;
    case 'pak40':
      addRecuperator(0, 0.14);
      break;
    case 'm1_57mm':
    case 'qf6pdr':
      addRecuperator(0, 0.12);
      break;
    case 'zis3':
      addRecuperator(0, 0.13);
      addBox(group, new THREE.BoxGeometry(0.36, 0.16, 0.28), detail, {
        x: -0.48,
        y: 0.28,
        z: -0.38,
        part: 'hull',
      });
      break;
    default:
      break;
  }
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

  addGunTube(group, body, dark, d.tube, { x: 0, y: mountY, z: mountZ }, 'barrel');
  addTowedGunIdentityDetails(group, body, detail, dark, d, mountY, mountZ);

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
  addTowedGunIdentityDetails(group, body, detail, dark, d, mountY, mountZ);

  const trailLock = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.09, 0.24),
    dark
  );
  trailLock.position.set(0, mountY - 0.12, mountZ - 0.35);
  group.add(trailLock);

  group.userData.hitRadius = d.hitRadius;
}
