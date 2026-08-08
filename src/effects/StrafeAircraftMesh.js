import * as THREE from 'three';

/**
 * Low-poly WW2 fighters for fire-support fly-bys.
 * Local axes: +Z nose / flight, +Y up, +X right wing.
 * Silhouettes are historically inspired, not to scale.
 */

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: opts.metal ?? 0.28,
    roughness: opts.rough ?? 0.62,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
    side: opts.side ?? THREE.FrontSide,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    depthWrite: opts.depthWrite ?? true,
  });
}

function track(ctx, geo, material) {
  if (geo && !ctx.geometries.includes(geo)) ctx.geometries.push(geo);
  if (material && !ctx.materials.includes(material)) ctx.materials.push(material);
}

function addBox(ctx, parent, w, h, d, material, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0 } = {}) {
  const geo = new THREE.BoxGeometry(w, h, d);
  track(ctx, geo, material);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function addCyl(ctx, parent, rTop, rBot, h, material, {
  x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, seg = 8,
} = {}) {
  const geo = new THREE.CylinderGeometry(rTop, rBot, h, seg);
  track(ctx, geo, material);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function addDisc(ctx, parent, r, material, { x = 0, y = 0, z = 0, rx = Math.PI / 2, ry = 0, rz = 0, seg = 16 } = {}) {
  const geo = new THREE.CircleGeometry(r, seg);
  track(ctx, geo, material);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  parent.add(mesh);
  return mesh;
}

function addProp(ctx, parent, spinnerMat, bladeMat, { z = 2.55, spinnerR = 0.18, bladeLen = 1.15, bladeW = 0.14 } = {}) {
  const prop = new THREE.Group();
  prop.name = 'prop';
  prop.position.set(0, 0, z);
  parent.add(prop);

  addCyl(ctx, prop, spinnerR, spinnerR * 0.55, 0.28, spinnerMat, {
    rx: Math.PI / 2,
    seg: 10,
  });

  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3;
    // Blade extends along local +Y; spin group around local +Z (flight axis after plane yaw)
    addBox(ctx, prop, bladeW, bladeLen, 0.045, bladeMat, {
      x: Math.sin(a) * bladeLen * 0.48,
      y: Math.cos(a) * bladeLen * 0.48,
      z: 0.02,
      rz: -a,
    });
  }

  // Soft disc so a spinning prop still reads at distance (face along flight +Z)
  const blur = mat(0xc8c4b8, {
    metal: 0.05,
    rough: 0.9,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  addDisc(ctx, prop, bladeLen * 0.95, blur, { z: 0.03, rx: 0, seg: 20 });

  return prop;
}

function addCanopy(ctx, parent, glassMat, { x = 0, y = 0.28, z = 0.35, w = 0.42, h = 0.28, d = 0.9 } = {}) {
  return addBox(ctx, parent, w, h, d, glassMat, { x, y, z });
}

function addWingGuns(ctx, parent, dark, wingY, halfSpan, gunZ = 0.55) {
  for (const side of [-1, 1]) {
    addCyl(ctx, parent, 0.035, 0.04, 0.55, dark, {
      x: side * halfSpan * 0.55,
      y: wingY - 0.06,
      z: gunZ,
      rx: Math.PI / 2,
      seg: 6,
    });
  }
}

function addTail(ctx, parent, bodyMat, dark, {
  boomZ = -1.85,
  boomLen = 1.35,
  boomH = 0.32,
  boomW = 0.38,
  finH = 0.72,
  finD = 0.55,
  stabSpan = 1.55,
  stabZ = -2.35,
} = {}) {
  addBox(ctx, parent, boomW, boomH, boomLen, bodyMat, {
    y: 0.02,
    z: boomZ,
  });
  // Vertical fin
  addBox(ctx, parent, 0.08, finH, finD, bodyMat, {
    y: boomH * 0.35 + finH * 0.35,
    z: stabZ,
  });
  // Rudder tip
  addBox(ctx, parent, 0.06, finH * 0.55, 0.18, dark, {
    y: boomH * 0.35 + finH * 0.28,
    z: stabZ - finD * 0.35,
  });
  // Horizontal stabilizers
  addBox(ctx, parent, stabSpan, 0.06, 0.42, bodyMat, {
    y: boomH * 0.15,
    z: stabZ,
  });
}

function addUnderside(ctx, parent, color, { w = 0.7, h = 0.08, d = 3.2, y = -0.22, z = 0.1 } = {}) {
  const under = mat(color, { metal: 0.2, rough: 0.72 });
  addBox(ctx, parent, w, h, d, under, { y, z });
  return under;
}

/** Balkenkreuz on upper wing surfaces. */
function addGermanCross(ctx, parent, { x, y, z }) {
  const cream = mat(0xd8d2bd, { metal: 0.05, rough: 0.8 });
  const black = mat(0x171815, { metal: 0.08, rough: 0.75 });
  addBox(ctx, parent, 0.12, 0.02, 0.42, cream, { x, y, z });
  addBox(ctx, parent, 0.42, 0.02, 0.12, cream, { x, y, z });
  addBox(ctx, parent, 0.07, 0.025, 0.3, black, { x, y: y + 0.01, z });
  addBox(ctx, parent, 0.3, 0.025, 0.07, black, { x, y: y + 0.01, z });
}

/** US star-in-circle on wings. */
function addUsStar(ctx, parent, { x, y, z, s = 0.28 }) {
  const blue = mat(0x1a3a6e, { metal: 0.05, rough: 0.78, side: THREE.DoubleSide });
  const white = mat(0xe8e4d8, { metal: 0.05, rough: 0.78, side: THREE.DoubleSide });
  addDisc(ctx, parent, s, blue, { x, y, z, rx: -Math.PI / 2 });
  addDisc(ctx, parent, s * 0.55, white, { x, y: y + 0.005, z, rx: -Math.PI / 2 });
}

/** RAF roundel. */
function addRafRoundel(ctx, parent, { x, y, z, s = 0.26 }) {
  const blue = mat(0x1c3f8c, { metal: 0.05, rough: 0.78, side: THREE.DoubleSide });
  const white = mat(0xe8e4d8, { metal: 0.05, rough: 0.78, side: THREE.DoubleSide });
  const red = mat(0xb22222, { metal: 0.05, rough: 0.78, side: THREE.DoubleSide });
  addDisc(ctx, parent, s, blue, { x, y, z, rx: -Math.PI / 2 });
  addDisc(ctx, parent, s * 0.68, white, { x, y: y + 0.004, z, rx: -Math.PI / 2 });
  addDisc(ctx, parent, s * 0.34, red, { x, y: y + 0.008, z, rx: -Math.PI / 2 });
}

/** Soviet red star (simple extruded look via boxes). */
function addRedStar(ctx, parent, { x, y, z, s = 0.22 }) {
  const red = mat(0xb32d24, { metal: 0.08, rough: 0.7 });
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
    addBox(ctx, parent, s * 0.28, 0.02, s * 0.95, red, {
      x: x + Math.cos(a) * s * 0.12,
      y,
      z: z + Math.sin(a) * s * 0.12,
      ry: -a,
    });
  }
}

/** Japanese hinomaru. */
function addHinomaru(ctx, parent, { x, y, z, s = 0.24 }) {
  const red = mat(0xbc002d, { metal: 0.05, rough: 0.75, side: THREE.DoubleSide });
  addDisc(ctx, parent, s, red, { x, y, z, rx: -Math.PI / 2 });
}

function buildBf109(ctx, group) {
  // RLM gray-green upper, light blue lower, yellow theatre band / nose
  const body = mat(0x5c6458, { metal: 0.32, rough: 0.58 });
  const dark = mat(0x2a2e28, { metal: 0.35, rough: 0.55 });
  const yellow = mat(0xd4a017, { metal: 0.25, rough: 0.55 });
  const glass = mat(0x1a2838, { metal: 0.55, rough: 0.22, transparent: true, opacity: 0.55 });
  const spinner = mat(0xd4a017, { metal: 0.4, rough: 0.4 });
  const blade = mat(0x1c1c1a, { metal: 0.45, rough: 0.45 });

  // Slim fuselage
  addBox(ctx, group, 0.72, 0.58, 3.4, body, { y: 0.02, z: 0.15 });
  addUnderside(ctx, group, 0x7a8a98, { w: 0.68, d: 3.2, y: -0.28, z: 0.15 });
  // Pointed nose / engine
  addCyl(ctx, group, 0.22, 0.34, 1.15, body, { z: 1.85, rx: Math.PI / 2, seg: 10 });
  addCyl(ctx, group, 0.28, 0.3, 0.55, yellow, { z: 2.15, rx: Math.PI / 2, seg: 10 });
  // Exhaust stubs
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      addBox(ctx, group, 0.08, 0.06, 0.14, dark, {
        x: side * 0.36,
        y: -0.02,
        z: 1.35 + i * 0.18,
      });
    }
  }
  // Wings — relatively short, squared tips
  const wingY = -0.02;
  addBox(ctx, group, 6.4, 0.1, 1.15, body, { y: wingY, z: 0.35 });
  addBox(ctx, group, 5.6, 0.07, 0.55, body, { y: wingY, z: -0.25 });
  // Leading-edge yellow tips
  for (const side of [-1, 1]) {
    addBox(ctx, group, 0.55, 0.09, 0.35, yellow, {
      x: side * 2.95,
      y: wingY,
      z: 0.75,
    });
  }
  addWingGuns(ctx, group, dark, wingY, 3.0, 0.75);
  addCanopy(ctx, group, glass, { y: 0.38, z: 0.45, w: 0.38, h: 0.26, d: 0.85 });
  // Headrest / rear canopy fairing
  addBox(ctx, group, 0.32, 0.18, 0.45, body, { y: 0.32, z: -0.15 });
  addTail(ctx, group, body, dark, {
    boomZ: -1.95,
    boomLen: 1.5,
    finH: 0.82,
    finD: 0.58,
    stabSpan: 1.65,
    stabZ: -2.55,
  });
  // Yellow fuselage band
  addBox(ctx, group, 0.74, 0.55, 0.28, yellow, { y: 0.02, z: -1.15 });
  for (const side of [-1, 1]) {
    addGermanCross(ctx, group, { x: side * 2.1, y: wingY + 0.07, z: 0.3 });
  }
  const prop = addProp(ctx, group, spinner, blade, {
    z: 2.72,
    spinnerR: 0.16,
    bladeLen: 1.05,
  });
  return prop;
}

function buildP51(ctx, group) {
  // Olive drab upper, neutral gray lower, natural-metal spinner
  const body = mat(0x4a5438, { metal: 0.3, rough: 0.6 });
  const metal = mat(0x9aa0a4, { metal: 0.55, rough: 0.38 });
  const dark = mat(0x1e221c, { metal: 0.4, rough: 0.5 });
  const glass = mat(0x152030, { metal: 0.6, rough: 0.18, transparent: true, opacity: 0.5 });
  const spinner = mat(0xc4c0b4, { metal: 0.5, rough: 0.35 });
  const blade = mat(0x1a1a18, { metal: 0.45, rough: 0.42 });
  const inv = mat(0xe8e4d8, { metal: 0.1, rough: 0.75 });
  const invB = mat(0x141412, { metal: 0.1, rough: 0.75 });

  // Long sleek fuselage
  addBox(ctx, group, 0.78, 0.62, 3.8, body, { y: 0.04, z: 0.05 });
  addUnderside(ctx, group, 0x8a9088, { w: 0.74, d: 3.6, y: -0.28, z: 0.05 });
  // Long Merlin nose
  addCyl(ctx, group, 0.26, 0.36, 1.45, metal, { z: 2.0, rx: Math.PI / 2, seg: 10 });
  addBox(ctx, group, 0.7, 0.42, 1.1, body, { y: 0.05, z: 1.55 });
  // Chin intake
  addBox(ctx, group, 0.42, 0.2, 0.7, dark, { y: -0.28, z: 1.65 });
  // Radiator scoop under belly
  addBox(ctx, group, 0.5, 0.22, 0.85, dark, { y: -0.38, z: -0.35 });
  // Laminar-flow wing
  const wingY = -0.04;
  addBox(ctx, group, 7.4, 0.1, 1.25, body, { y: wingY, z: 0.25 });
  addBox(ctx, group, 6.2, 0.07, 0.55, body, { y: wingY, z: -0.35 });
  addWingGuns(ctx, group, dark, wingY, 3.2, 0.65);
  // Bubble canopy
  addCanopy(ctx, group, glass, { y: 0.42, z: 0.2, w: 0.48, h: 0.32, d: 1.05 });
  addBox(ctx, group, 0.4, 0.14, 0.35, body, { y: 0.36, z: -0.45 });
  // Invasion stripes on rear fuselage
  for (let i = 0; i < 4; i++) {
    addBox(ctx, group, 0.8, 0.58, 0.16, i % 2 === 0 ? inv : invB, {
      y: 0.04,
      z: -1.05 - i * 0.18,
    });
  }
  addTail(ctx, group, body, dark, {
    boomZ: -2.05,
    boomLen: 1.4,
    finH: 0.78,
    finD: 0.52,
    stabSpan: 1.85,
    stabZ: -2.6,
  });
  for (const side of [-1, 1]) {
    addUsStar(ctx, group, { x: side * 2.35, y: wingY + 0.07, z: 0.2, s: 0.3 });
  }
  const prop = addProp(ctx, group, spinner, blade, {
    z: 2.9,
    spinnerR: 0.17,
    bladeLen: 1.2,
  });
  return prop;
}

function buildSpitfire(ctx, group) {
  // Dark green / ocean grey disruptive, Sky underside
  const green = mat(0x3a4632, { metal: 0.28, rough: 0.62 });
  const grey = mat(0x5a6268, { metal: 0.3, rough: 0.58 });
  const dark = mat(0x1c2018, { metal: 0.35, rough: 0.55 });
  const glass = mat(0x1a2835, { metal: 0.55, rough: 0.2, transparent: true, opacity: 0.52 });
  const spinner = mat(0xc9a227, { metal: 0.35, rough: 0.45 });
  const blade = mat(0x1a1a18, { metal: 0.45, rough: 0.42 });
  const sky = 0xa8b8a0;

  // Slim fuselage
  addBox(ctx, group, 0.68, 0.55, 3.5, green, { y: 0.02, z: 0.1 });
  addBox(ctx, group, 0.66, 0.22, 3.3, grey, { y: 0.22, z: 0.1 });
  addUnderside(ctx, group, sky, { w: 0.64, d: 3.3, y: -0.26, z: 0.1 });
  // Merlin nose
  addCyl(ctx, group, 0.22, 0.32, 1.25, green, { z: 1.9, rx: Math.PI / 2, seg: 10 });
  addBox(ctx, group, 0.55, 0.28, 0.7, dark, { y: -0.18, z: 1.55 });
  // Elliptical wing approximation: wide center + tapering tips
  const wingY = -0.02;
  addBox(ctx, group, 4.2, 0.1, 1.35, green, { y: wingY, z: 0.4 });
  addBox(ctx, group, 6.8, 0.09, 0.95, green, { y: wingY, z: 0.25 });
  addBox(ctx, group, 7.6, 0.07, 0.55, grey, { y: wingY, z: 0.05 });
  // Rounded tips
  for (const side of [-1, 1]) {
    addCyl(ctx, group, 0.22, 0.22, 0.55, green, {
      x: side * 3.85,
      y: wingY,
      z: 0.15,
      rz: Math.PI / 2,
      seg: 8,
    });
  }
  // Yellow leading-edge ID strips near tips
  for (const side of [-1, 1]) {
    addBox(ctx, group, 0.7, 0.08, 0.12, mat(0xd4a017, { metal: 0.2, rough: 0.6 }), {
      x: side * 3.1,
      y: wingY,
      z: 0.72,
    });
  }
  addWingGuns(ctx, group, dark, wingY, 2.8, 0.7);
  addCanopy(ctx, group, glass, { y: 0.36, z: 0.35, w: 0.4, h: 0.28, d: 0.95 });
  addBox(ctx, group, 0.34, 0.16, 0.5, green, { y: 0.3, z: -0.25 });
  addTail(ctx, group, green, dark, {
    boomZ: -1.9,
    boomLen: 1.35,
    finH: 0.75,
    finD: 0.5,
    stabSpan: 1.7,
    stabZ: -2.45,
  });
  // Elliptical elevators slightly wider
  addBox(ctx, group, 1.95, 0.05, 0.32, grey, { y: 0.08, z: -2.55 });
  for (const side of [-1, 1]) {
    addRafRoundel(ctx, group, { x: side * 2.4, y: wingY + 0.07, z: 0.25, s: 0.28 });
  }
  const prop = addProp(ctx, group, spinner, blade, {
    z: 2.7,
    spinnerR: 0.15,
    bladeLen: 1.08,
  });
  return prop;
}

function buildIl2(ctx, group) {
  // Sturmovik: armored green upper, light blue lower, thick wings
  const body = mat(0x3d4a32, { metal: 0.22, rough: 0.68 });
  const dark = mat(0x22261e, { metal: 0.3, rough: 0.6 });
  const metal = mat(0x6a7068, { metal: 0.45, rough: 0.48 });
  const glass = mat(0x1a2428, { metal: 0.5, rough: 0.25, transparent: true, opacity: 0.55 });
  const spinner = mat(0x2a2e28, { metal: 0.4, rough: 0.45 });
  const blade = mat(0x1a1a18, { metal: 0.45, rough: 0.42 });

  // Thick armored "bathtub" fuselage
  addBox(ctx, group, 0.95, 0.72, 3.6, body, { y: 0.05, z: 0.0 });
  addUnderside(ctx, group, 0x6a8aa0, { w: 0.9, h: 0.1, d: 3.4, y: -0.32, z: 0.0 });
  // Armored nose / radial-ish cowling
  addCyl(ctx, group, 0.38, 0.42, 0.95, metal, { z: 1.95, rx: Math.PI / 2, seg: 12 });
  addCyl(ctx, group, 0.3, 0.36, 0.45, dark, { z: 2.45, rx: Math.PI / 2, seg: 10 });
  // Oil cooler
  addBox(ctx, group, 0.55, 0.24, 0.55, dark, { y: -0.35, z: 1.35 });
  // Broad straight wings
  const wingY = -0.05;
  addBox(ctx, group, 8.2, 0.14, 1.45, body, { y: wingY, z: 0.2 });
  addBox(ctx, group, 7.0, 0.1, 0.6, body, { y: wingY, z: -0.45 });
  // Wing root armor fairings
  for (const side of [-1, 1]) {
    addBox(ctx, group, 0.55, 0.28, 1.1, body, {
      x: side * 0.7,
      y: wingY + 0.08,
      z: 0.15,
    });
  }
  // Underwing rockets / gun pods
  for (const side of [-1, 1]) {
    addCyl(ctx, group, 0.07, 0.07, 0.85, dark, {
      x: side * 1.6,
      y: wingY - 0.12,
      z: 0.55,
      rx: Math.PI / 2,
      seg: 6,
    });
    addCyl(ctx, group, 0.07, 0.07, 0.85, dark, {
      x: side * 2.35,
      y: wingY - 0.12,
      z: 0.55,
      rx: Math.PI / 2,
      seg: 6,
    });
  }
  // Pilot canopy + rear gunner greenhouse
  addCanopy(ctx, group, glass, { y: 0.48, z: 0.55, w: 0.5, h: 0.3, d: 0.75 });
  addCanopy(ctx, group, glass, { y: 0.42, z: -0.35, w: 0.45, h: 0.26, d: 0.7 });
  // Rear MG
  addCyl(ctx, group, 0.03, 0.035, 0.55, dark, {
    y: 0.55,
    z: -0.85,
    rx: Math.PI / 2 + 0.25,
    seg: 6,
  });
  addTail(ctx, group, body, dark, {
    boomZ: -2.0,
    boomLen: 1.45,
    boomH: 0.4,
    boomW: 0.5,
    finH: 0.85,
    finD: 0.6,
    stabSpan: 2.1,
    stabZ: -2.55,
  });
  for (const side of [-1, 1]) {
    addRedStar(ctx, group, { x: side * 2.6, y: wingY + 0.09, z: 0.15, s: 0.26 });
  }
  // Fuselage star
  addRedStar(ctx, group, { x: 0.48, y: 0.2, z: -0.9, s: 0.18 });
  const prop = addProp(ctx, group, spinner, blade, {
    z: 2.85,
    spinnerR: 0.2,
    bladeLen: 1.25,
  });
  return prop;
}

function buildZero(ctx, group) {
  // A6M: light gray / cream, black cowling, red hinomaru, long greenhouse
  const body = mat(0xc4c0b0, { metal: 0.35, rough: 0.52 });
  const cowling = mat(0x1a1a18, { metal: 0.4, rough: 0.48 });
  const dark = mat(0x2a2824, { metal: 0.35, rough: 0.55 });
  const glass = mat(0x1a2830, { metal: 0.55, rough: 0.2, transparent: true, opacity: 0.48 });
  const spinner = mat(0xc4c0b0, { metal: 0.4, rough: 0.4 });
  const blade = mat(0x1a1a18, { metal: 0.45, rough: 0.42 });

  // Slim light fuselage
  addBox(ctx, group, 0.7, 0.55, 3.55, body, { y: 0.02, z: 0.05 });
  addUnderside(ctx, group, 0xb8b4a4, { w: 0.66, d: 3.35, y: -0.26, z: 0.05 });
  // Black radial cowling
  addCyl(ctx, group, 0.36, 0.38, 0.85, cowling, { z: 1.95, rx: Math.PI / 2, seg: 12 });
  addCyl(ctx, group, 0.28, 0.34, 0.35, dark, { z: 2.45, rx: Math.PI / 2, seg: 10 });
  // Long thin wings with rounded tips
  const wingY = -0.02;
  addBox(ctx, group, 7.8, 0.09, 1.2, body, { y: wingY, z: 0.3 });
  addBox(ctx, group, 6.6, 0.07, 0.5, body, { y: wingY, z: -0.3 });
  for (const side of [-1, 1]) {
    addCyl(ctx, group, 0.2, 0.2, 0.5, body, {
      x: side * 3.95,
      y: wingY,
      z: 0.25,
      rz: Math.PI / 2,
      seg: 8,
    });
  }
  addWingGuns(ctx, group, dark, wingY, 2.6, 0.65);
  // Long greenhouse canopy
  addCanopy(ctx, group, glass, { y: 0.38, z: 0.15, w: 0.42, h: 0.28, d: 1.55 });
  // Canopy frame lines
  for (let i = 0; i < 4; i++) {
    addBox(ctx, group, 0.44, 0.02, 0.04, dark, {
      y: 0.52,
      z: 0.75 - i * 0.38,
    });
  }
  addTail(ctx, group, body, dark, {
    boomZ: -1.95,
    boomLen: 1.4,
    finH: 0.72,
    finD: 0.48,
    stabSpan: 1.75,
    stabZ: -2.5,
  });
  for (const side of [-1, 1]) {
    addHinomaru(ctx, group, { x: side * 2.5, y: wingY + 0.07, z: 0.25, s: 0.26 });
  }
  // Fuselage hinomaru
  addHinomaru(ctx, group, { x: 0.36, y: 0.15, z: -0.55, s: 0.16 });
  const prop = addProp(ctx, group, spinner, blade, {
    z: 2.78,
    spinnerR: 0.16,
    bladeLen: 1.12,
  });
  return prop;
}

const BUILDERS = {
  germany: buildBf109,
  usa: buildP51,
  uk: buildSpitfire,
  russia: buildIl2,
  japan: buildZero,
};

/**
 * @param {string} [factionId]
 * @returns {{ group: THREE.Group, prop: THREE.Group|null, geometries: THREE.BufferGeometry[], materials: THREE.Material[], model: string }}
 */
export function createStrafeAircraftMesh(factionId = 'germany') {
  const id = BUILDERS[factionId] ? factionId : 'germany';
  const ctx = { geometries: [], materials: [] };
  const group = new THREE.Group();
  group.name = `strafeAircraft_${id}`;

  const prop = BUILDERS[id](ctx, group);

  // Slight nose-down for a flying attitude
  group.rotation.x = -0.04;

  const modelNames = {
    germany: 'bf109',
    usa: 'p51',
    uk: 'spitfire',
    russia: 'il2',
    japan: 'zero',
  };

  return {
    group,
    prop,
    geometries: ctx.geometries,
    materials: ctx.materials,
    model: modelNames[id] ?? 'bf109',
  };
}
