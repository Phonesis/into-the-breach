import * as THREE from 'three';
import { createCamoMaterial } from '../units/UnitTextures.js';

/** Faction-specific field headquarters with a shared gameplay footprint. */

const HQ_PALETTES = {
  germany: {
    wall: 0x686b5d,
    wallDark: 0x454a42,
    roof: 0x303630,
    wood: 0x4a392a,
    woodDark: 0x2e2821,
    trim: 0x252b27,
    metal: 0x3a403b,
    glass: 0x18211e,
    sandbag: 0x81745a,
    earth: 0x514938,
    canvas: 0x6d7256,
    brick: 0x62554a,
  },
  usa: {
    wall: 0x68734e,
    wallDark: 0x4b573d,
    roof: 0x3b4038,
    wood: 0x5b4935,
    woodDark: 0x382f26,
    trim: 0x2d382b,
    metal: 0x465047,
    glass: 0x18241d,
    sandbag: 0x8a7a59,
    earth: 0x5c4d38,
    canvas: 0x7d8058,
    brick: 0x6a614a,
  },
  uk: {
    wall: 0x686c58,
    wallDark: 0x4d5145,
    roof: 0x393e39,
    wood: 0x564536,
    woodDark: 0x342d26,
    trim: 0x2c342e,
    metal: 0x424943,
    glass: 0x18221e,
    sandbag: 0x85775c,
    earth: 0x574b3b,
    canvas: 0x6c7559,
    brick: 0x6d584b,
  },
  russia: {
    wall: 0x5b6244,
    wallDark: 0x3d4533,
    roof: 0x464838,
    wood: 0x513b28,
    woodDark: 0x30271f,
    trim: 0x252d25,
    metal: 0x3e4640,
    glass: 0x151e19,
    sandbag: 0x776b51,
    earth: 0x4c4234,
    canvas: 0x5c6949,
    brick: 0x59483c,
  },
  japan: {
    wall: 0x817454,
    wallDark: 0x625940,
    roof: 0x3f4435,
    wood: 0x69472d,
    woodDark: 0x3c2d22,
    trim: 0x272e24,
    metal: 0x44483c,
    glass: 0x1b251d,
    sandbag: 0x877453,
    earth: 0x594734,
    canvas: 0x777650,
    brick: 0x69533c,
  },
};

const DEFAULT_PALETTE = HQ_PALETTES.germany;

function makeMaterial(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.86,
    metalness: options.metalness ?? 0,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    side: options.side ?? THREE.FrontSide,
  });
}

function markSurface(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (mesh.material?.color) mesh.userData.baseColor = mesh.material.color.clone();
  return mesh;
}

function addBox(parent, size, material, position, options = {}) {
  const mesh = markSurface(new THREE.Mesh(new THREE.BoxGeometry(...size), material));
  mesh.position.set(...position);
  if (options.rotation) mesh.rotation.set(...options.rotation);
  if (options.name) mesh.name = options.name;
  parent.add(mesh);
  return mesh;
}

function addCylinder(parent, radiusTop, radiusBottom, height, radialSegments, material, position, options = {}) {
  const mesh = markSurface(
    new THREE.Mesh(
      new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments),
      material
    )
  );
  mesh.position.set(...position);
  if (options.rotation) mesh.rotation.set(...options.rotation);
  if (options.name) mesh.name = options.name;
  parent.add(mesh);
  return mesh;
}

function addSphere(parent, radius, material, position, options = {}) {
  const mesh = markSurface(new THREE.Mesh(new THREE.SphereGeometry(radius, 10, 8), material));
  mesh.position.set(...position);
  if (options.name) mesh.name = options.name;
  parent.add(mesh);
  return mesh;
}

function addCylinderBetween(parent, start, end, radius, material) {
  const a = new THREE.Vector3(...start);
  const b = new THREE.Vector3(...end);
  const delta = b.clone().sub(a);
  const mesh = markSurface(
    new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, delta.length(), 7), material)
  );
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  parent.add(mesh);
  return mesh;
}

function createGableRoof(width, depth, height, material) {
  const w = width * 0.5;
  const d = depth * 0.5;
  const vertices = new Float32Array([
    -w, 0, -d,
    w, 0, -d,
    w, 0, d,
    -w, 0, d,
    0, height, -d,
    0, height, d,
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geometry.setIndex([
    0, 1, 4,
    3, 5, 2,
    0, 4, 5,
    0, 5, 3,
    1, 2, 5,
    1, 5, 4,
  ]);
  geometry.computeVertexNormals();
  return markSurface(new THREE.Mesh(geometry, material));
}

function createHipRoof(width, depth, height, material) {
  const w = width * 0.5;
  const d = depth * 0.5;
  const ridge = width * 0.28;
  const vertices = new Float32Array([
    -w, 0, -d,
    w, 0, -d,
    w, 0, d,
    -w, 0, d,
    -ridge, height, 0,
    ridge, height, 0,
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geometry.setIndex([
    0, 1, 5,
    0, 5, 4,
    1, 2, 5,
    2, 3, 4,
    2, 4, 5,
    3, 0, 4,
  ]);
  geometry.computeVertexNormals();
  return markSurface(new THREE.Mesh(geometry, material));
}

function createQuonsetRoof(length, radius, material) {
  const segments = 14;
  const vertices = [];
  for (let xIndex = 0; xIndex <= 1; xIndex++) {
    const x = xIndex ? length * 0.5 : -length * 0.5;
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI;
      vertices.push(x, Math.sin(theta) * radius, Math.cos(theta) * radius);
    }
  }
  const indices = [];
  const row = segments + 1;
  for (let i = 0; i < segments; i++) {
    const a = i;
    const b = i + 1;
    const c = row + i + 1;
    const d = row + i;
    indices.push(a, b, d, b, c, d);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return markSurface(new THREE.Mesh(geometry, material));
}

function addRoofTrim(roof, width, depth, height, material, { gable = false } = {}) {
  addBox(roof, [width + 0.14, 0.12, 0.14], material, [0, 0, depth * 0.5]);
  addBox(roof, [width + 0.14, 0.12, 0.14], material, [0, 0, -depth * 0.5]);
  if (gable) {
    addBox(roof, [0.12, 0.12, depth + 0.12], material, [width * 0.5, 0, 0]);
    addBox(roof, [0.12, 0.12, depth + 0.12], material, [-width * 0.5, 0, 0]);
  } else {
    addBox(roof, [width * 0.62, 0.11, 0.11], material, [0, height + 0.04, 0]);
  }
}

function addQuonsetRibs(roof, length, radius, material) {
  for (let i = 0; i < 7; i++) {
    const x = -length * 0.42 + i * (length * 0.14);
    const points = [];
    for (let segment = 0; segment <= 10; segment++) {
      const theta = (segment / 10) * Math.PI;
      points.push(new THREE.Vector3(x, Math.sin(theta) * radius, Math.cos(theta) * radius));
    }
    const curve = new THREE.CatmullRomCurve3(points);
    const rib = markSurface(new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.035, 6, false), material));
    roof.add(rib);
  }
}

function addFrontWindow(parent, mats, { x, y, z, width = 0.9, height = 0.55, shutters = false }) {
  addBox(parent, [width, height, 0.08], mats.glass, [x, y, z]);
  addBox(parent, [width + 0.18, 0.1, 0.14], mats.trim, [x, y - height * 0.5, z + 0.02]);
  addBox(parent, [width + 0.18, 0.1, 0.14], mats.trim, [x, y + height * 0.5, z + 0.02]);
  addBox(parent, [0.1, height + 0.14, 0.14], mats.trim, [x - width * 0.5, y, z + 0.02]);
  addBox(parent, [0.1, height + 0.14, 0.14], mats.trim, [x + width * 0.5, y, z + 0.02]);
  if (shutters) {
    addBox(parent, [0.1, height * 1.18, 0.16], mats.woodDark, [x - width * 0.62, y, z + 0.06]);
    addBox(parent, [0.1, height * 1.18, 0.16], mats.woodDark, [x + width * 0.62, y, z + 0.06]);
  }
}

function addSideWindow(parent, mats, { x, y, z, width = 0.9, height = 0.55, shutters = false }) {
  addBox(parent, [0.08, height, width], mats.glass, [x, y, z]);
  addBox(parent, [0.14, 0.1, width + 0.18], mats.trim, [x, y - height * 0.5, z]);
  addBox(parent, [0.14, 0.1, width + 0.18], mats.trim, [x, y + height * 0.5, z]);
  addBox(parent, [0.14, height + 0.14, 0.1], mats.trim, [x, y, z - width * 0.5]);
  addBox(parent, [0.14, height + 0.14, 0.1], mats.trim, [x, y, z + width * 0.5]);
  if (shutters) {
    addBox(parent, [0.16, height * 1.18, 0.1], mats.woodDark, [x + 0.06, y, z - width * 0.62]);
    addBox(parent, [0.16, height * 1.18, 0.1], mats.woodDark, [x + 0.06, y, z + width * 0.62]);
  }
}

function addDoor(parent, mats, { x = 0, y = 1.05, z = 3.05, width = 1.2, height = 1.8, wood = false } = {}) {
  const doorMat = wood ? mats.wood : mats.metal;
  addBox(parent, [width, height, 0.12], doorMat, [x, y, z]);
  addBox(parent, [0.12, height + 0.14, 0.18], mats.trim, [x - width * 0.56, y, z + 0.02]);
  addBox(parent, [0.12, height + 0.14, 0.18], mats.trim, [x + width * 0.56, y, z + 0.02]);
  addBox(parent, [width + 0.24, 0.12, 0.18], mats.trim, [x, y + height * 0.56, z + 0.02]);
  addSphere(parent, 0.055, mats.metal, [x + width * 0.28, y, z + 0.1]);
  addBox(parent, [width + 0.7, 0.1, 0.85], mats.roof, [x, y + height * 0.68, z + 0.34]);
}

function addPorch(parent, mats, { width = 4.5, depth = 1.0, z = 3.1, y = 0.18 } = {}) {
  addBox(parent, [width, 0.22, depth], mats.woodDark, [0, y, z]);
  for (const x of [-width * 0.45, width * 0.45]) {
    addCylinder(parent, 0.075, 0.095, 1.9, 8, mats.wood, [x, 1.05, z + depth * 0.32]);
  }
  addBox(parent, [width + 0.18, 0.12, depth + 0.12], mats.wood, [0, 2.02, z + depth * 0.1]);
}

function addSandbagPerimeter(parent, mats, bagMeshes, { frontZ = 3.55, sideX = 4.05, includeBack = true } = {}) {
  const addBag = (position, rotation, scale = 1) => {
    const bag = markSurface(
      new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.72, 4, 8), mats.sandbag)
    );
    bag.position.set(...position);
    bag.rotation.set(...rotation);
    bag.scale.setScalar(scale);
    bagMeshes.push(bag);
    parent.add(bag);
  };

  for (const x of [-3.35, -2.25, -1.15, 1.15, 2.25, 3.35]) {
    addBag([x, 0.28, frontZ], [0, 0, Math.PI / 2]);
    addBag([x, 0.7, frontZ - 0.06], [0, 0, Math.PI / 2], 0.94);
  }
  if (includeBack) {
    for (const x of [-3.1, -2.0, 2.0, 3.1]) addBag([x, 0.28, -frontZ], [0, 0, Math.PI / 2]);
  }
  for (const z of [-2.45, -1.25, 0, 1.25, 2.45]) {
    addBag([sideX, 0.28, z], [Math.PI / 2, 0, 0]);
    addBag([-sideX, 0.28, z], [Math.PI / 2, 0, 0]);
  }
}

function addMast(parent, mats, { x = 2.8, z = -1.8, baseY = 0.6, height = 6.2, wide = false } = {}) {
  addCylinder(parent, 0.07, 0.1, height, 8, mats.metal, [x, baseY + height * 0.5, z]);
  addCylinder(parent, 0.18, 0.22, 0.18, 10, mats.metal, [x, baseY + 0.09, z]);
  for (const level of wide ? [height * 0.48, height * 0.7] : [height * 0.58]) {
    addBox(parent, [wide ? 1.25 : 0.85, 0.06, 0.06], mats.metal, [x, baseY + level, z]);
    addSphere(parent, 0.07, mats.metal, [x - (wide ? 0.58 : 0.4), baseY + level + 0.06, z]);
    addSphere(parent, 0.07, mats.metal, [x + (wide ? 0.58 : 0.4), baseY + level + 0.06, z]);
  }
  addCylinderBetween(parent, [x, baseY + height * 0.24, z], [x - 1.3, baseY, z + 1.45], 0.018, mats.metal);
  addCylinderBetween(parent, [x, baseY + height * 0.24, z], [x + 1.3, baseY, z + 1.45], 0.018, mats.metal);
}

function addRadioCabinet(parent, mats, position, { canvas = false } = {}) {
  const [x, y, z] = position;
  addBox(parent, [0.82, 0.74, 0.52], canvas ? mats.wood : mats.metal, [x, y, z]);
  addBox(parent, [0.45, 0.22, 0.04], mats.glass, [x, y + 0.12, z + 0.29]);
  for (const knobX of [-0.22, 0.22]) {
    addCylinder(parent, 0.035, 0.035, 0.05, 8, mats.trim, [x + knobX, y - 0.13, z + 0.3], {
      rotation: [Math.PI / 2, 0, 0],
    });
  }
  addCylinder(parent, 0.025, 0.03, 0.78, 7, mats.metal, [x + 0.25, y + 0.77, z]);
}

function addChimney(parent, mats, { x = 2.2, z = -1, y = 4.4, height = 1.45 } = {}) {
  addBox(parent, [0.42, height, 0.42], mats.brick, [x, y + height * 0.5, z]);
  addBox(parent, [0.65, 0.12, 0.62], mats.trim, [x, y + height, z]);
}

function addBrickCourses(parent, mats, { width = 7.4, z = 2.86, y = 1.65, rows = 4 } = {}) {
  for (let row = 0; row < rows; row++) {
    addBox(parent, [width, 0.035, 0.035], mats.brick, [0, y + row * 0.35, z + 0.02]);
  }
}

function addLogCourses(parent, mats, { width = 7.25, depth = 5.7, rows = 4, baseY = 0.55 } = {}) {
  for (let row = 0; row < rows; row++) {
    const y = baseY + row * 0.36;
    addCylinder(parent, 0.16, 0.18, width, 8, mats.wood, [0, y, depth * 0.5], {
      rotation: [0, 0, Math.PI / 2],
    });
    addCylinder(parent, 0.16, 0.18, width, 8, mats.wood, [0, y, -depth * 0.5], {
      rotation: [0, 0, Math.PI / 2],
    });
    addCylinder(parent, 0.16, 0.18, depth, 8, mats.woodDark, [width * 0.5, y, 0], {
      rotation: [Math.PI / 2, 0, 0],
    });
    addCylinder(parent, 0.16, 0.18, depth, 8, mats.woodDark, [-width * 0.5, y, 0], {
      rotation: [Math.PI / 2, 0, 0],
    });
  }
}

function addJapaneseLattice(parent, mats, { z = 2.94, y = 2.15, width = 6.2 } = {}) {
  for (const x of [-width * 0.42, -width * 0.28, -width * 0.14, 0, width * 0.14, width * 0.28, width * 0.42]) {
    addBox(parent, [0.075, 1.45, 0.1], mats.woodDark, [x, y, z + 0.08]);
  }
  addBox(parent, [width, 0.08, 0.12], mats.woodDark, [0, y - 0.68, z + 0.08]);
  addBox(parent, [width, 0.08, 0.12], mats.woodDark, [0, y + 0.68, z + 0.08]);
}

function makeMaterials(factionId, vehicleCamo, infantryCamo) {
  const palette = HQ_PALETTES[factionId] ?? DEFAULT_PALETTE;
  const fabric = infantryCamo ?? vehicleCamo;
  return {
    palette,
    wall: createCamoMaterial(palette.wall, vehicleCamo, [3.2, 2.2], { rough: 0.9 }),
    wallDark: createCamoMaterial(palette.wallDark, vehicleCamo, [2.5, 1.8], { rough: 0.93 }),
    roof: createCamoMaterial(palette.roof, vehicleCamo, [2.5, 1.7], { rough: 0.92 }),
    sandbag: createCamoMaterial(palette.sandbag, fabric, [2.1, 1.4], { rough: 0.96 }),
    earth: createCamoMaterial(palette.earth, fabric, [2, 1.3], { rough: 0.98 }),
    canvas: createCamoMaterial(palette.canvas, fabric, [1.8, 1.5], { rough: 0.96 }),
    wood: makeMaterial(palette.wood, { roughness: 0.94 }),
    woodDark: makeMaterial(palette.woodDark, { roughness: 0.97 }),
    trim: makeMaterial(palette.trim, { roughness: 0.88 }),
    metal: makeMaterial(palette.metal, { roughness: 0.62, metalness: 0.44 }),
    glass: makeMaterial(palette.glass, { roughness: 0.28, metalness: 0.12 }),
    brick: makeMaterial(palette.brick, { roughness: 0.98 }),
    light: makeMaterial(0xd7b568, { roughness: 0.42, emissive: 0x7f551d, emissiveIntensity: 0.16 }),
  };
}

function buildGermanHq(group, mats, wallMeshes) {
  const base = addBox(group, [8, 2.25, 7], mats.wall, [0, 1.12, 0], { name: 'hq-german-concrete-base' });
  const upper = addBox(group, [6.35, 1.7, 5.65], mats.wallDark, [0, 3.08, 0], { name: 'hq-german-command-room' });
  wallMeshes.push(base, upper);
  for (const x of [-3.65, 3.65]) {
    for (const z of [-2.9, 2.9]) addBox(group, [0.45, 2.0, 0.45], mats.trim, [x, 1.45, z]);
  }
  const roof = createHipRoof(7.05, 6.25, 1.22, mats.roof);
  roof.position.y = 3.88;
  group.add(roof);
  addRoofTrim(roof, 7.05, 6.25, 1.22, mats.trim);
  addFrontWindow(group, mats, { x: -1.9, y: 2.95, z: 2.88, width: 1.15, height: 0.35 });
  addFrontWindow(group, mats, { x: 0, y: 2.95, z: 2.88, width: 1.15, height: 0.35 });
  addFrontWindow(group, mats, { x: 1.9, y: 2.95, z: 2.88, width: 1.15, height: 0.35 });
  addSideWindow(group, mats, { x: 3.2, y: 2.95, z: -0.85, width: 0.95, height: 0.35 });
  addSideWindow(group, mats, { x: -3.2, y: 2.95, z: 0.85, width: 0.95, height: 0.35 });
  addDoor(group, mats, { z: 3.58, y: 1.05, width: 1.35, height: 1.7 });
  addBox(group, [2.4, 0.24, 1.25], mats.earth, [0, 0.12, 3.45]);
  addBox(group, [2.15, 0.38, 1.85], mats.wallDark, [0, 4.65, 0]);
  addBox(group, [1.6, 0.16, 1.35], mats.trim, [0, 4.9, 0]);
  for (const x of [-0.72, -0.24, 0.24, 0.72]) addBox(group, [0.12, 0.5, 1.4], mats.metal, [x, 4.93, 0]);
  addMast(group, mats, { x: 2.95, z: -1.8, baseY: 0.55, height: 6.45, wide: true });
  addRadioCabinet(group, mats, [2.55, 0.62, -2.55]);
  return { roofMesh: roof, flagMount: { x: -2.75, z: -2.15, baseY: 0.55, height: 6.1, direction: 1 } };
}

function buildUsaHq(group, mats, wallMeshes) {
  const base = addBox(group, [7.85, 2.35, 5.85], mats.wall, [0, 1.18, 0], { name: 'hq-usa-hut-base' });
  const upper = addBox(group, [7.35, 1.35, 5.35], mats.wallDark, [0, 2.95, 0], { name: 'hq-usa-hut-office' });
  wallMeshes.push(base, upper);
  const roof = createQuonsetRoof(8.05, 2.92, mats.roof);
  roof.position.y = 3.62;
  group.add(roof);
  addQuonsetRibs(roof, 8.05, 2.92, mats.metal);
  addBox(roof, [8.15, 0.1, 0.14], mats.trim, [0, 0, 2.92]);
  addBox(roof, [8.15, 0.1, 0.14], mats.trim, [0, 0, -2.92]);
  addFrontWindow(group, mats, { x: -2.05, y: 2.95, z: 2.72, width: 1.1, height: 0.68, shutters: true });
  addFrontWindow(group, mats, { x: 0, y: 2.95, z: 2.72, width: 1.1, height: 0.68, shutters: true });
  addFrontWindow(group, mats, { x: 2.05, y: 2.95, z: 2.72, width: 1.1, height: 0.68, shutters: true });
  addSideWindow(group, mats, { x: 3.7, y: 2.95, z: -0.7, width: 0.95, height: 0.68, shutters: true });
  addSideWindow(group, mats, { x: -3.7, y: 2.95, z: 0.7, width: 0.95, height: 0.68, shutters: true });
  addDoor(group, mats, { z: 2.96, y: 1.08, width: 1.25, height: 1.82, wood: true });
  addPorch(group, mats, { width: 3.2, depth: 1.15, z: 3.32 });
  addBox(group, [2.15, 0.55, 0.08], mats.canvas, [0, 3.83, 3.38]);
  addBox(group, [2.15, 0.08, 0.08], mats.trim, [0, 3.52, 3.38]);
  addRadioCabinet(group, mats, [-2.65, 0.66, -2.35], { canvas: true });
  addMast(group, mats, { x: 2.95, z: -1.7, baseY: 0.5, height: 6.3, wide: true });
  addBox(group, [1.1, 0.72, 0.78], mats.wood, [-2.65, 0.42, 2.0]);
  addBox(group, [1.18, 0.08, 0.84], mats.trim, [-2.65, 0.8, 2.0]);
  return { roofMesh: roof, flagMount: { x: -3.25, z: 2.35, baseY: 0.5, height: 6.2, direction: 1 } };
}

function buildUkHq(group, mats, wallMeshes) {
  const base = addBox(group, [7.7, 2.05, 5.7], mats.brick, [0, 1.03, 0], { name: 'hq-uk-brick-base' });
  const upper = addBox(group, [7.25, 1.55, 5.25], mats.wall, [0, 2.8, 0], { name: 'hq-uk-office' });
  wallMeshes.push(base, upper);
  addBrickCourses(group, mats, { width: 7.35, z: 2.88, y: 0.5, rows: 7 });
  const roof = createGableRoof(8.05, 6.05, 1.42, mats.roof);
  roof.position.y = 3.58;
  group.add(roof);
  addRoofTrim(roof, 8.05, 6.05, 1.42, mats.trim, { gable: true });
  addFrontWindow(group, mats, { x: -2.1, y: 2.78, z: 2.68, width: 1.15, height: 0.58 });
  addFrontWindow(group, mats, { x: 0, y: 2.78, z: 2.68, width: 1.15, height: 0.58 });
  addFrontWindow(group, mats, { x: 2.1, y: 2.78, z: 2.68, width: 1.15, height: 0.58 });
  addSideWindow(group, mats, { x: 3.65, y: 2.78, z: -0.9, width: 1.0, height: 0.58 });
  addSideWindow(group, mats, { x: -3.65, y: 2.78, z: 0.9, width: 1.0, height: 0.58 });
  addDoor(group, mats, { z: 2.98, y: 1.0, width: 1.18, height: 1.75, wood: true });
  addPorch(group, mats, { width: 2.65, depth: 1.0, z: 3.28 });
  addChimney(group, mats, { x: 2.25, z: -1.25, y: 4.05, height: 1.45 });
  addBox(group, [1.55, 0.62, 0.12], mats.canvas, [-2.75, 1.4, -2.92]);
  addMast(group, mats, { x: -2.95, z: -1.65, baseY: 0.5, height: 6.2 });
  addRadioCabinet(group, mats, [-2.55, 0.65, -2.28]);
  return { roofMesh: roof, flagMount: { x: 3.3, z: 2.15, baseY: 0.5, height: 6.1, direction: -1 } };
}

function buildRussiaHq(group, mats, wallMeshes) {
  const base = addBox(group, [7.8, 2.05, 6.05], mats.wallDark, [0, 1.03, 0], { name: 'hq-russia-dugout-base' });
  const upper = addBox(group, [7.2, 1.35, 5.55], mats.earth, [0, 2.72, 0], { name: 'hq-russia-earthworks' });
  wallMeshes.push(base, upper);
  addLogCourses(group, mats, { width: 7.25, depth: 5.7, rows: 4, baseY: 0.58 });
  const roof = createGableRoof(7.65, 5.95, 1.15, mats.earth);
  roof.position.y = 3.38;
  group.add(roof);
  addRoofTrim(roof, 7.65, 5.95, 1.15, mats.woodDark, { gable: true });
  addBox(group, [6.75, 0.32, 5.2], mats.earth, [0, 4.08, 0]);
  addFrontWindow(group, mats, { x: -2.15, y: 2.45, z: 2.82, width: 0.95, height: 0.46, shutters: true });
  addFrontWindow(group, mats, { x: 2.15, y: 2.45, z: 2.82, width: 0.95, height: 0.46, shutters: true });
  addDoor(group, mats, { z: 3.08, y: 1.03, width: 1.25, height: 1.7, wood: true });
  addPorch(group, mats, { width: 2.35, depth: 0.9, z: 3.34 });
  addChimney(group, mats, { x: 2.15, z: -1.2, y: 4.05, height: 1.3 });
  addMast(group, mats, { x: -2.9, z: -1.75, baseY: 0.45, height: 6.25, wide: true });
  addRadioCabinet(group, mats, [-2.55, 0.64, -2.3]);
  addBox(group, [1.2, 0.62, 0.8], mats.wood, [2.6, 0.42, 1.9]);
  return { roofMesh: roof, flagMount: { x: 2.95, z: 2.1, baseY: 0.45, height: 6.05, direction: -1 } };
}

function buildJapanHq(group, mats, wallMeshes) {
  const base = addBox(group, [7.65, 1.7, 5.75], mats.woodDark, [0, 0.86, 0], { name: 'hq-japan-raised-floor' });
  const upper = addBox(group, [7.15, 2.1, 5.25], mats.wall, [0, 2.55, 0], { name: 'hq-japan-timber-office' });
  wallMeshes.push(base, upper);
  addBox(group, [7.75, 0.22, 5.95], mats.wood, [0, 0.16, 0]);
  for (const x of [-3.25, 3.25]) {
    addBox(group, [0.24, 2.45, 0.24], mats.woodDark, [x, 2.3, 2.55]);
    addBox(group, [0.24, 2.45, 0.24], mats.woodDark, [x, 2.3, -2.55]);
  }
  const roof = createHipRoof(8.35, 6.3, 1.55, mats.roof);
  roof.position.y = 3.72;
  group.add(roof);
  addRoofTrim(roof, 8.35, 6.3, 1.55, mats.woodDark);
  addFrontWindow(group, mats, { x: -2.0, y: 2.55, z: 2.68, width: 1.25, height: 1.15, shutters: true });
  addFrontWindow(group, mats, { x: 2.0, y: 2.55, z: 2.68, width: 1.25, height: 1.15, shutters: true });
  addJapaneseLattice(group, mats, { z: 2.74, y: 2.55, width: 1.4 });
  addDoor(group, mats, { z: 2.96, y: 1.0, width: 1.12, height: 1.75, wood: true });
  addPorch(group, mats, { width: 6.1, depth: 0.95, z: 3.18 });
  addBox(group, [6.0, 0.1, 0.12], mats.woodDark, [0, 2.04, 3.72]);
  addMast(group, mats, { x: -3.05, z: -1.8, baseY: 0.45, height: 6.05 });
  addRadioCabinet(group, mats, [-2.55, 0.66, -2.3], { canvas: true });
  addBox(group, [0.72, 0.55, 0.72], mats.wood, [2.7, 0.45, -2.1]);
  addSphere(group, 0.11, mats.light, [3.05, 1.35, 3.48]);
  return { roofMesh: roof, flagMount: { x: 3.15, z: 2.05, baseY: 0.45, height: 5.95, direction: -1 } };
}

function buildFallbackHq(group, mats, wallMeshes) {
  const base = addBox(group, [8, 2.25, 7], mats.wall, [0, 1.12, 0]);
  const upper = addBox(group, [6.2, 1.65, 5.5], mats.wallDark, [0, 3.05, 0]);
  wallMeshes.push(base, upper);
  const roof = createHipRoof(7.1, 6.15, 1.25, mats.roof);
  roof.position.y = 3.9;
  group.add(roof);
  addRoofTrim(roof, 7.1, 6.15, 1.25, mats.trim);
  addDoor(group, mats, { z: 3.6 });
  addMast(group, mats);
  return { roofMesh: roof, flagMount: { x: 2.9, z: -1.7, baseY: 0.55, height: 6.2, direction: 1 } };
}

export function createHqBuildingMesh({ factionId = 'germany', vehicleCamo = null, infantryCamo = null } = {}) {
  const group = new THREE.Group();
  group.name = `hq-building-${factionId}`;
  group.userData.hqFaction = factionId;
  const mats = makeMaterials(factionId, vehicleCamo, infantryCamo);
  const wallMeshes = [];
  const bagMeshes = [];
  let built;

  switch (factionId) {
    case 'usa':
      built = buildUsaHq(group, mats, wallMeshes);
      break;
    case 'uk':
      built = buildUkHq(group, mats, wallMeshes);
      break;
    case 'russia':
      built = buildRussiaHq(group, mats, wallMeshes);
      break;
    case 'japan':
      built = buildJapanHq(group, mats, wallMeshes);
      break;
    case 'germany':
      built = buildGermanHq(group, mats, wallMeshes);
      break;
    default:
      built = buildFallbackHq(group, mats, wallMeshes);
      break;
  }

  addSandbagPerimeter(group, mats, bagMeshes, {
    frontZ: factionId === 'usa' || factionId === 'japan' ? 3.72 : 3.58,
    sideX: 4.2,
    includeBack: factionId !== 'japan',
  });

  return {
    group,
    wallMeshes,
    roofMesh: built.roofMesh,
    bagMeshes,
    flagMount: built.flagMount,
  };
}
