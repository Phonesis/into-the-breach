import * as THREE from 'three';

/**
 * Low-poly WW2 troop transports for airborne drops.
 * Local axes: +Z nose / flight, +Y up, +X right wing.
 * Silhouettes are historically inspired (not to scale).
 *
 *   germany — Junkers Ju 52/3m (trimotor)
 *   usa     — Douglas C-47 Skytrain
 *   uk      — Douglas C-47 Dakota (RAF)
 *   russia  — Lisunov Li-2
 *   japan   — Showa/Nakajima L2D Tabby
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

function addProp(ctx, parent, spinnerMat, bladeMat, {
  x = 0, y = 0, z = 0, spinnerR = 0.2, bladeLen = 1.35, bladeW = 0.16, blades = 3,
} = {}) {
  const prop = new THREE.Group();
  prop.name = 'prop';
  prop.position.set(x, y, z);
  parent.add(prop);

  addCyl(ctx, prop, spinnerR, spinnerR * 0.55, 0.32, spinnerMat, {
    rx: Math.PI / 2,
    seg: 10,
  });

  for (let i = 0; i < blades; i++) {
    const a = (i * Math.PI * 2) / blades;
    addBox(ctx, prop, bladeW, bladeLen, 0.05, bladeMat, {
      x: Math.sin(a) * bladeLen * 0.48,
      y: Math.cos(a) * bladeLen * 0.48,
      z: 0.02,
      rz: -a,
    });
  }

  const blur = mat(0xc8c4b8, {
    metal: 0.05,
    rough: 0.9,
    transparent: true,
    opacity: 0.2,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  addDisc(ctx, prop, bladeLen * 0.95, blur, { z: 0.03, rx: 0, seg: 20 });
  return prop;
}

function addTail(ctx, parent, bodyMat, dark, {
  boomZ = -3.4,
  boomLen = 2.2,
  boomH = 0.55,
  boomW = 0.7,
  finH = 1.35,
  finD = 0.95,
  stabSpan = 3.4,
  stabZ = -4.2,
} = {}) {
  addBox(ctx, parent, boomW, boomH, boomLen, bodyMat, { y: 0.05, z: boomZ });
  addBox(ctx, parent, 0.12, finH, finD, bodyMat, {
    y: boomH * 0.35 + finH * 0.35,
    z: stabZ,
  });
  addBox(ctx, parent, 0.08, finH * 0.55, 0.22, dark, {
    y: boomH * 0.35 + finH * 0.28,
    z: stabZ - finD * 0.32,
  });
  addBox(ctx, parent, stabSpan, 0.08, 0.7, bodyMat, {
    y: boomH * 0.12,
    z: stabZ,
  });
}

function addGear(ctx, parent, dark, { x, y = -0.75, z = 0.4, tall = 0.55 }) {
  addCyl(ctx, parent, 0.04, 0.04, tall, dark, { x, y: y + tall * 0.35, z, seg: 6 });
  addCyl(ctx, parent, 0.16, 0.16, 0.12, dark, {
    x,
    y: y,
    z,
    rx: Math.PI / 2,
    seg: 8,
  });
}

function addGermanCross(ctx, parent, { x, y, z, s = 1 }) {
  const cream = mat(0xd8d2bd, { metal: 0.05, rough: 0.8 });
  const black = mat(0x171815, { metal: 0.08, rough: 0.75 });
  addBox(ctx, parent, 0.14 * s, 0.025, 0.5 * s, cream, { x, y, z });
  addBox(ctx, parent, 0.5 * s, 0.025, 0.14 * s, cream, { x, y, z });
  addBox(ctx, parent, 0.08 * s, 0.03, 0.36 * s, black, { x, y: y + 0.01, z });
  addBox(ctx, parent, 0.36 * s, 0.03, 0.08 * s, black, { x, y: y + 0.01, z });
}

function addUsStar(ctx, parent, { x, y, z, s = 0.38 }) {
  const blue = mat(0x1a3a6e, { metal: 0.05, rough: 0.78, side: THREE.DoubleSide });
  const white = mat(0xe8e4d8, { metal: 0.05, rough: 0.78, side: THREE.DoubleSide });
  addDisc(ctx, parent, s, blue, { x, y, z, rx: -Math.PI / 2 });
  addDisc(ctx, parent, s * 0.55, white, { x, y: y + 0.006, z, rx: -Math.PI / 2 });
}

function addRafRoundel(ctx, parent, { x, y, z, s = 0.36 }) {
  const blue = mat(0x1c3f8c, { metal: 0.05, rough: 0.78, side: THREE.DoubleSide });
  const white = mat(0xe8e4d8, { metal: 0.05, rough: 0.78, side: THREE.DoubleSide });
  const red = mat(0xb22222, { metal: 0.05, rough: 0.78, side: THREE.DoubleSide });
  addDisc(ctx, parent, s, blue, { x, y, z, rx: -Math.PI / 2 });
  addDisc(ctx, parent, s * 0.68, white, { x, y: y + 0.005, z, rx: -Math.PI / 2 });
  addDisc(ctx, parent, s * 0.34, red, { x, y: y + 0.01, z, rx: -Math.PI / 2 });
}

function addRedStar(ctx, parent, { x, y, z, s = 0.32 }) {
  const red = mat(0xb32d24, { metal: 0.08, rough: 0.7 });
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
    addBox(ctx, parent, s * 0.28, 0.025, s * 0.95, red, {
      x: x + Math.cos(a) * s * 0.12,
      y,
      z: z + Math.sin(a) * s * 0.12,
      ry: -a,
    });
  }
}

function addHinomaru(ctx, parent, { x, y, z, s = 0.34 }) {
  const red = mat(0xbc002d, { metal: 0.05, rough: 0.75, side: THREE.DoubleSide });
  addDisc(ctx, parent, s, red, { x, y, z, rx: -Math.PI / 2 });
}

/** Side cargo door (port = -X). Closed panel + open hatch leaf. */
function addCargoDoor(ctx, parent, bodyMat, dark, {
  x = -0.72, y = 0.05, z = -1.1, w = 0.08, h = 0.95, d = 1.15,
} = {}) {
  // Opening: dark interior cavity
  addBox(ctx, parent, 0.12, h * 0.92, d * 0.92, dark, { x: x + 0.04, y, z });
  // Door leaf swung open (hinged along rear edge, rotated out)
  const leaf = addBox(ctx, parent, w, h, d, bodyMat, {
    x: x - 0.35,
    y,
    z: z - d * 0.15,
    ry: 0.95,
  });
  leaf.name = 'cargoDoor';
  // Threshold / frame
  addBox(ctx, parent, 0.06, h * 1.05, 0.08, dark, { x, y, z: z + d * 0.48 });
  addBox(ctx, parent, 0.06, h * 1.05, 0.08, dark, { x, y, z: z - d * 0.48 });
}

function buildTwinTransport(ctx, group, {
  bodyColor,
  underColor,
  accentColor = null,
  spinnerColor = 0xc4c0b4,
  markings,
  invasionStripes = false,
}) {
  const body = mat(bodyColor, { metal: 0.32, rough: 0.58 });
  const under = mat(underColor, { metal: 0.28, rough: 0.65 });
  const dark = mat(0x1e221c, { metal: 0.4, rough: 0.5 });
  const glass = mat(0x152030, { metal: 0.55, rough: 0.2, transparent: true, opacity: 0.5 });
  const spinner = mat(spinnerColor, { metal: 0.48, rough: 0.38 });
  const blade = mat(0x1a1a18, { metal: 0.45, rough: 0.42 });
  const nacelle = mat(bodyColor, { metal: 0.36, rough: 0.52 });

  // Long tube fuselage (C-47 / Li-2 / L2D family)
  addBox(ctx, group, 1.35, 1.15, 7.2, body, { y: 0.12, z: -0.15 });
  addBox(ctx, group, 1.28, 0.28, 6.8, under, { y: -0.48, z: -0.15 });
  // Nose
  addCyl(ctx, group, 0.38, 0.58, 1.55, body, { z: 3.55, rx: Math.PI / 2, seg: 12 });
  addBox(ctx, group, 1.1, 0.85, 1.1, body, { y: 0.1, z: 2.85 });
  // Cockpit greenhouse
  addBox(ctx, group, 0.95, 0.42, 1.15, glass, { y: 0.72, z: 2.55 });
  addBox(ctx, group, 0.88, 0.18, 0.55, body, { y: 0.62, z: 1.85 });
  // Cabin windows
  for (let i = 0; i < 6; i++) {
    const wz = 1.15 - i * 0.55;
    for (const side of [-1, 1]) {
      addBox(ctx, group, 0.04, 0.22, 0.28, glass, {
        x: side * 0.68,
        y: 0.28,
        z: wz,
      });
    }
  }

  addCargoDoor(ctx, group, body, dark, { x: -0.72, y: 0.05, z: -1.15 });

  // High-ish wing with twin nacelles
  const wingY = 0.42;
  addBox(ctx, group, 14.2, 0.14, 2.15, body, { y: wingY, z: 0.55 });
  addBox(ctx, group, 12.4, 0.1, 0.95, body, { y: wingY, z: -0.45 });
  // Rounded tips
  for (const side of [-1, 1]) {
    addCyl(ctx, group, 0.42, 0.42, 0.7, body, {
      x: side * 7.0,
      y: wingY,
      z: 0.35,
      rz: Math.PI / 2,
      seg: 8,
    });
  }

  const props = [];
  for (const side of [-1, 1]) {
    const nx = side * 2.55;
    addCyl(ctx, group, 0.42, 0.48, 1.35, nacelle, {
      x: nx,
      y: wingY - 0.15,
      z: 1.35,
      rx: Math.PI / 2,
      seg: 10,
    });
    addBox(ctx, group, 0.7, 0.55, 1.5, nacelle, {
      x: nx,
      y: wingY - 0.22,
      z: 0.55,
    });
    // Engine cowl ring
    addCyl(ctx, group, 0.5, 0.5, 0.22, dark, {
      x: nx,
      y: wingY - 0.15,
      z: 2.05,
      rx: Math.PI / 2,
      seg: 12,
    });
    props.push(
      addProp(ctx, group, spinner, blade, {
        x: nx,
        y: wingY - 0.15,
        z: 2.25,
        spinnerR: 0.2,
        bladeLen: 1.45,
        blades: 3,
      })
    );
  }

  addTail(ctx, group, body, dark, {
    boomZ: -3.55,
    boomLen: 2.4,
    boomH: 0.62,
    boomW: 0.85,
    finH: 1.55,
    finD: 1.05,
    stabSpan: 4.2,
    stabZ: -4.45,
  });

  // Fixed main gear under nacelles + tail wheel
  addGear(ctx, group, dark, { x: -2.55, y: -0.95, z: 0.65, tall: 0.7 });
  addGear(ctx, group, dark, { x: 2.55, y: -0.95, z: 0.65, tall: 0.7 });
  addCyl(ctx, group, 0.08, 0.08, 0.18, dark, {
    x: 0,
    y: -0.55,
    z: -4.15,
    rx: Math.PI / 2,
    seg: 6,
  });

  if (invasionStripes) {
    const inv = mat(0xe8e4d8, { metal: 0.1, rough: 0.75 });
    const invB = mat(0x141412, { metal: 0.1, rough: 0.75 });
    for (let i = 0; i < 5; i++) {
      addBox(ctx, group, 1.38, 1.05, 0.2, i % 2 === 0 ? inv : invB, {
        y: 0.12,
        z: -2.15 - i * 0.22,
      });
    }
  }

  if (accentColor != null) {
    const accent = mat(accentColor, { metal: 0.25, rough: 0.55 });
    addBox(ctx, group, 1.38, 0.2, 0.35, accent, { y: 0.55, z: -2.85 });
  }

  markings?.(ctx, group, wingY);
  return props;
}

function buildJu52(ctx, group) {
  // RLM 70/71 greens, corrugated look via rib strips, yellow theatre band
  const body = mat(0x4a5240, { metal: 0.3, rough: 0.68 });
  const rib = mat(0x3e4636, { metal: 0.28, rough: 0.72 });
  const under = mat(0x6a7a88, { metal: 0.25, rough: 0.7 });
  const dark = mat(0x1c2018, { metal: 0.4, rough: 0.5 });
  const yellow = mat(0xd4a017, { metal: 0.28, rough: 0.55 });
  const glass = mat(0x1a2838, { metal: 0.5, rough: 0.25, transparent: true, opacity: 0.52 });
  const spinner = mat(0xd4a017, { metal: 0.4, rough: 0.42 });
  const blade = mat(0x1a1a18, { metal: 0.45, rough: 0.42 });

  // Boxy corrugated fuselage
  addBox(ctx, group, 1.45, 1.25, 7.0, body, { y: 0.15, z: -0.2 });
  addBox(ctx, group, 1.38, 0.3, 6.6, under, { y: -0.5, z: -0.2 });
  // Corrugation ribs
  for (let i = 0; i < 14; i++) {
    addBox(ctx, group, 1.48, 1.2, 0.06, rib, {
      y: 0.15,
      z: 2.6 - i * 0.48,
    });
  }
  // Blunt nose / center engine mount
  addCyl(ctx, group, 0.48, 0.62, 1.4, body, { z: 3.45, rx: Math.PI / 2, seg: 10 });
  addBox(ctx, group, 1.2, 0.95, 1.0, body, { y: 0.12, z: 2.85 });
  addBox(ctx, group, 0.9, 0.4, 1.0, glass, { y: 0.78, z: 2.45 });
  // Cabin windows
  for (let i = 0; i < 5; i++) {
    const wz = 1.0 - i * 0.55;
    for (const side of [-1, 1]) {
      addBox(ctx, group, 0.04, 0.24, 0.3, glass, { x: side * 0.74, y: 0.3, z: wz });
    }
  }

  addCargoDoor(ctx, group, body, dark, { x: -0.76, y: 0.08, z: -1.0, h: 1.0, d: 1.05 });

  // Low wing with outer engines
  const wingY = -0.05;
  addBox(ctx, group, 13.6, 0.16, 2.35, body, { y: wingY, z: 0.5 });
  addBox(ctx, group, 11.8, 0.12, 1.05, body, { y: wingY, z: -0.5 });

  const props = [];
  // Center prop
  addCyl(ctx, group, 0.52, 0.55, 0.35, dark, {
    z: 4.15,
    rx: Math.PI / 2,
    seg: 12,
  });
  props.push(
    addProp(ctx, group, spinner, blade, {
      z: 4.35,
      spinnerR: 0.22,
      bladeLen: 1.5,
      blades: 2,
    })
  );
  // Wing engines
  for (const side of [-1, 1]) {
    const nx = side * 2.85;
    addCyl(ctx, group, 0.4, 0.46, 1.2, body, {
      x: nx,
      y: wingY - 0.05,
      z: 1.25,
      rx: Math.PI / 2,
      seg: 10,
    });
    addBox(ctx, group, 0.65, 0.5, 1.3, body, { x: nx, y: wingY - 0.12, z: 0.5 });
    addCyl(ctx, group, 0.48, 0.48, 0.2, dark, {
      x: nx,
      y: wingY - 0.05,
      z: 1.9,
      rx: Math.PI / 2,
      seg: 12,
    });
    props.push(
      addProp(ctx, group, spinner, blade, {
        x: nx,
        y: wingY - 0.05,
        z: 2.1,
        spinnerR: 0.2,
        bladeLen: 1.35,
        blades: 2,
      })
    );
  }

  // Distinctive Ju 52 triple-fin tail
  addBox(ctx, group, 0.75, 0.55, 2.0, body, { y: 0.08, z: -3.45 });
  for (const side of [-1, 0, 1]) {
    addBox(ctx, group, 0.1, 1.15, 0.85, body, {
      x: side * 1.15,
      y: 0.75,
      z: -4.15,
    });
  }
  addBox(ctx, group, 3.6, 0.1, 0.75, body, { y: 0.15, z: -4.15 });

  // Fixed gear (spatted)
  for (const side of [-1, 1]) {
    addBox(ctx, group, 0.28, 0.55, 0.7, dark, {
      x: side * 1.1,
      y: -0.85,
      z: 0.55,
    });
    addCyl(ctx, group, 0.18, 0.18, 0.14, dark, {
      x: side * 1.1,
      y: -1.15,
      z: 0.55,
      rx: Math.PI / 2,
      seg: 8,
    });
  }

  // Yellow fuselage band
  addBox(ctx, group, 1.48, 1.15, 0.35, yellow, { y: 0.15, z: -2.55 });

  for (const side of [-1, 1]) {
    addGermanCross(ctx, group, { x: side * 3.6, y: wingY + 0.1, z: 0.35, s: 1.35 });
  }

  return props;
}

function buildC47Usa(ctx, group) {
  return buildTwinTransport(ctx, group, {
    bodyColor: 0x4a5438,
    underColor: 0x8a9088,
    spinnerColor: 0xc4c0b4,
    invasionStripes: true,
    markings: (c, g, wingY) => {
      for (const side of [-1, 1]) {
        addUsStar(c, g, { x: side * 3.8, y: wingY + 0.1, z: 0.4, s: 0.42 });
      }
      addUsStar(c, g, { x: 0.72, y: 0.35, z: -2.4, s: 0.28 });
    },
  });
}

function buildC47Uk(ctx, group) {
  return buildTwinTransport(ctx, group, {
    bodyColor: 0x3a4632,
    underColor: 0xa8b8a0,
    spinnerColor: 0xc9a227,
    invasionStripes: true,
    markings: (c, g, wingY) => {
      for (const side of [-1, 1]) {
        addRafRoundel(c, g, { x: side * 3.8, y: wingY + 0.1, z: 0.4, s: 0.4 });
      }
      addRafRoundel(c, g, { x: 0.72, y: 0.35, z: -2.4, s: 0.26 });
    },
  });
}

function buildLi2(ctx, group) {
  return buildTwinTransport(ctx, group, {
    bodyColor: 0x4a5048,
    underColor: 0x6a7270,
    spinnerColor: 0xb8b4a8,
    accentColor: 0xb32d24,
    markings: (c, g, wingY) => {
      for (const side of [-1, 1]) {
        addRedStar(c, g, { x: side * 3.7, y: wingY + 0.1, z: 0.35, s: 0.38 });
      }
      addRedStar(c, g, { x: 0.7, y: 0.32, z: -2.35, s: 0.26 });
    },
  });
}

function buildL2D(ctx, group) {
  return buildTwinTransport(ctx, group, {
    bodyColor: 0x5a5840,
    underColor: 0x7a7860,
    spinnerColor: 0xb8a88a,
    markings: (c, g, wingY) => {
      for (const side of [-1, 1]) {
        addHinomaru(c, g, { x: side * 3.7, y: wingY + 0.1, z: 0.35, s: 0.38 });
      }
      addHinomaru(c, g, { x: 0.7, y: 0.32, z: -2.35, s: 0.24 });
    },
  });
}

const BUILDERS = {
  germany: buildJu52,
  usa: buildC47Usa,
  uk: buildC47Uk,
  russia: buildLi2,
  japan: buildL2D,
};

const MODEL_NAMES = {
  germany: 'ju52',
  usa: 'c47',
  uk: 'dakota',
  russia: 'li2',
  japan: 'l2d',
};

/**
 * Local-space cargo door exit (port side). Jumpers leave from here.
 * World transform applied by callers using the plane group matrix.
 */
export const TRANSPORT_DOOR_LOCAL = {
  germany: { x: -1.05, y: -0.15, z: -1.0 },
  usa: { x: -1.0, y: -0.2, z: -1.15 },
  uk: { x: -1.0, y: -0.2, z: -1.15 },
  russia: { x: -1.0, y: -0.2, z: -1.15 },
  japan: { x: -1.0, y: -0.2, z: -1.15 },
};

/**
 * @param {string} [factionId]
 * @returns {{
 *   group: THREE.Group,
 *   props: THREE.Group[],
 *   doorLocal: {x:number,y:number,z:number},
 *   geometries: THREE.BufferGeometry[],
 *   materials: THREE.Material[],
 *   model: string
 * }}
 */
export function createTransportAircraftMesh(factionId = 'germany') {
  const id = BUILDERS[factionId] ? factionId : 'germany';
  const ctx = { geometries: [], materials: [] };
  const group = new THREE.Group();
  group.name = `transportAircraft_${id}`;

  const props = BUILDERS[id](ctx, group) ?? [];
  // Slight nose-up cruise attitude for a loaded transport
  group.rotation.x = 0.02;

  return {
    group,
    props: Array.isArray(props) ? props : props ? [props] : [],
    doorLocal: { ...(TRANSPORT_DOOR_LOCAL[id] ?? TRANSPORT_DOOR_LOCAL.germany) },
    geometries: ctx.geometries,
    materials: ctx.materials,
    model: MODEL_NAMES[id] ?? 'ju52',
  };
}
